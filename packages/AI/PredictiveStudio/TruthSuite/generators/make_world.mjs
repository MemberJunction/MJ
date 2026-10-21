// make_world.mjs — usage: node make_world.mjs fixtures/worlds/W1-signal.json <outDir> [--seeds 100,101,…] [--emit-metadata]
//
// Generates a Loom planted-truth world (binary renewal panel) using the ENGINE as a library
// (recurringDecision + emitMetadata), never the CLI. See ps-review/recon/07-loom.md for why:
// the CLI has no churn, no censoring, no parent-field overwrite and no time-scoped aggregates.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { engine } from './loom.mjs';
const { recurringDecision, emitMetadata, createRng, IdentityService, calibrateIntercept, sigmoid } = engine;

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = path.resolve(process.argv[3]);
const domainPath = fs.existsSync(path.join(here, 'worlds-domain/domain.json'))
  ? path.join(here, 'worlds-domain/domain.json')
  : path.join(here, '../fixtures/worlds-domain/domain.json');
const domain = JSON.parse(fs.readFileSync(domainPath, 'utf8'));
for (const e of Object.values(domain.entities)) for (const [k, f] of Object.entries(e.fields)) f.name ??= k;

const seedsIdx = process.argv.indexOf('--seeds');
const seeds = seedsIdx !== -1 ? process.argv[seedsIdx + 1].split(',').map(Number) : [...spec.seeds, spec.freshSeed];
const shouldEmitMetadata = process.argv.includes('--emit-metadata');

const EV_VALUES = [0, 1, 2, 3, 4, 5, 6, 8], EV_W = [30, 20, 15, 12, 9, 6, 5, 3];
const INC_VALUES = [20, 35, 50, 65, 80, 100, 130, 170], INC_W = [10, 18, 22, 18, 12, 10, 6, 4];

function betaFor(name, cycle) {
  const o = spec.era.fromCycle !== null && cycle >= spec.era.fromCycle ? spec.era.betaOverrides[name] : undefined;
  return o !== undefined ? o : (spec.betas[name] ?? 0);
}

function buildSeed(seed) {
  const ids = new IdentityService(); ids.RegisterNamespace(domain.name, domain.namespace);
  const rng = createRng(seed, 'people');
  const pick = (vals, w) => rng.pickWeighted(vals.map((v, i) => ({ value: v, weight: w[i] })));
  const people = Array.from({ length: spec.nPersons }, (_, i) => ({
    ID: ids.MintId(domain.name, 'Person', [`S${seed}`, `P${i}`]),
    MemberNumber: `M${seed}-${100000 + i}`,
    Region: pick(['NA', 'EU', 'APAC', 'LATAM'], [50, 25, 15, 10]),
    PostalCode: `PC${rng.int(10000, 10399)}`,
    IncomeK: pick(INC_VALUES, INC_W),
    AutoRenew: rng.bernoulli(0.35),
    Status: 'Active',
    joinCycle: spec.cycles[Math.floor(rng.next() * Math.min(3, spec.cycles.length))],
  }));
  const featuresOf = (p, c) => {                       // deterministic per (person, cycle): safe to call twice
    const r = createRng(seed, `my:${p.ID}:${c}`);
    const ev = r.pickWeighted(EV_VALUES.map((v, i) => ({ value: v, weight: EV_W[i] })));
    const prem = r.bernoulli(0.3);
    const noise = [0, 1, 2, 3, 4].map(() => r.int(0, 9));
    return { ev, prem, noise };
  };
  const scoreOf = (p, c) => {
    const f = featuresOf(p, c);
    return betaFor('EventsAttended', c) * f.ev + betaFor('Premium', c) * (f.prem ? 1 : 0)
      + betaFor('AutoRenew', c) * (p.AutoRenew ? 1 : 0) + betaFor('IncomeK', c) * p.IncomeK;
  };
  const shift = (c) => (spec.era.fromCycle !== null && c >= spec.era.fromCycle ? spec.era.deltaIntercept : 0);
  const rows = [], truth = [];
  const interceptByCycle = {};   // ctx.b0 per cycle (identical for every row in that cycle), for the manifest
  const lastCycle = spec.cycles[spec.cycles.length - 1];
  recurringDecision({
    seed, cycles: spec.cycles, target: spec.target,
    cohortOf: (c) => people.filter((p) => p.joinCycle <= c && (!spec.churn || p.Status === 'Active')),
    prepareCohortContext: (cohort, c) => ({ b0: calibrateIntercept(cohort.map((p) => scoreOf(p, c)), spec.target) + shift(c) }),
    scoreOf,
    baselineShift: shift,
    streamKey: (p, c) => `renew:${p.ID}:${c}`,
    onDecision: (p, c, yes, ctx) => {
      interceptByCycle[c] = ctx.b0;
      const f = featuresOf(p, c); const trueP = sigmoid(ctx.b0 + scoreOf(p, c));
      const censored = c === lastCycle && spec.censorLastCycle !== 'none';
      const renewed = censored ? (spec.censorLastCycle === 'zero' ? 0 : null) : (yes ? 1 : 0);
      const id = ids.MintId(domain.name, 'MembershipYear', [p.ID, String(c)]);
      rows.push({
        ID: id, PersonID: p.ID, Year: c, StartDate: `${c}-01-01`, Plan: f.prem ? 'Premium' : 'Basic',
        EventsAttended: f.ev, IncomeK: p.IncomeK, AutoRenew: p.AutoRenew ? 1 : 0, Region: p.Region,
        PostalCode: spec.extraNoise.PostalCode400 ? p.PostalCode : null,
        MemberNumber: spec.extraNoise.MemberNumberUnique ? `MN-${id}` : null,
        Noise1: f.noise[0], Noise2: f.noise[1], Noise3: f.noise[2], Noise4: f.noise[3], Noise5: f.noise[4],
        Renewed: renewed,
        Status: spec.leaks.statusOnRow ? (censored ? 'Pending' : yes ? 'Renewed' : 'Lapsed') : null,
        PersonStatusNow: null, WorldID: spec.id, Seed: seed,
      });
      truth.push({ MembershipYearID: id, Cycle: c, TrueP: trueP, Drawn: yes ? 1 : 0, Censored: censored ? 1 : 0 });
      if (spec.churn && !yes && !censored) p.Status = 'Lapsed';   // lapsers exit; Person.Status updated in place
    },
  });
  if (spec.leaks.personStatusInPlace) {
    const status = new Map(people.map((p) => [p.ID, p.Status]));
    for (const r of rows) r.PersonStatusNow = status.get(r.PersonID);   // what a join to today's Person row returns
  } else {
    for (const p of people) p.Status = 'Active';
  }
  return { people, rows, truth, interceptByCycle };
}

function aucWithTies(pos, neg) {
  if (pos.length === 0 || neg.length === 0) return null;
  const values = [...pos.map((p) => [p, 1]), ...neg.map((p) => [p, 0])].sort((a, b) => a[0] - b[0]);
  const n = values.length;
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[j + 1][0] === values[i][0]) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  let rankSum = 0; values.forEach(([, y], idx) => { if (y === 1) rankSum += ranks[idx]; });
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

function oracle(truth) {
  const obs = truth.filter((t) => t.Censored === 0);
  const pos = obs.filter((t) => t.Drawn === 1).map((t) => t.TrueP), neg = obs.filter((t) => t.Drawn === 0).map((t) => t.TrueP);
  const auc = aucWithTies(pos, neg);
  const brier = obs.reduce((s, t) => s + (t.TrueP - t.Drawn) ** 2, 0) / obs.length;
  const ll = -obs.reduce((s, t) => s + (t.Drawn ? Math.log(t.TrueP) : Math.log(1 - t.TrueP)), 0) / obs.length;
  return { auc, brier, logLoss: ll };
}

const toCsv = (objs) => { const cols = Object.keys(objs[0]); return [cols.join(','), ...objs.map((o) => cols.map((c) => (o[c] === null ? '' : String(o[c]))).join(','))].join('\n'); };

for (const seed of seeds) {
  const dir = path.join(outDir, `seed-${seed}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { people, rows, truth, interceptByCycle } = buildSeed(seed);
  if (shouldEmitMetadata) {
    await emitMetadata({ outputDir: path.join(dir, 'metadata'), domain, data: { Person: people.map(({ joinCycle, ...p }) => p), MembershipYear: rows } });
  }
  fs.writeFileSync(path.join(dir, 'rows.csv'), toCsv(rows)); fs.writeFileSync(path.join(dir, 'truth.csv'), toCsv(truth));
  const peopleCsvRows = people.map((p) => ({
    ID: p.ID, MemberNumber: p.MemberNumber, Region: p.Region, PostalCode: p.PostalCode,
    IncomeK: p.IncomeK, AutoRenew: p.AutoRenew ? 1 : 0, Status: p.Status, WorldID: spec.id, Seed: seed,
  }));
  fs.writeFileSync(path.join(dir, 'people.csv'), toCsv(peopleCsvRows));
  const obs = rows.filter((r) => r.Renewed !== null);
  let netPostEraShift = null;
  if (spec.era.fromCycle !== null) {
    const pre = spec.cycles.filter((c) => c < spec.era.fromCycle).map((c) => interceptByCycle[c]).filter((v) => v !== undefined);
    const post = spec.cycles.filter((c) => c >= spec.era.fromCycle).map((c) => interceptByCycle[c]).filter((v) => v !== undefined);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    if (pre.length && post.length) netPostEraShift = mean(post) - mean(pre);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...spec, seed, oracle: oracle(truth), rowCount: rows.length,
    positiveRate: obs.reduce((s, r) => s + r.Renewed, 0) / obs.length, interceptByCycle, netPostEraShift }, null, 2));
  console.log(spec.id, seed, rows.length, 'rows', JSON.stringify(oracle(truth)));
}
