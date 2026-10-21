// make_world_multiclass.mjs — usage: node make_world_multiclass.mjs fixtures/worlds/W9-multiclass.json <outDir> [--seeds 42,43,…] [--emit-metadata]
//
// Generates the W9 event-attendance world: Attended / NoShow / Cancelled via TWO SEQUENTIAL logits,
// using recurringDecision() twice (Loom engine as a library).
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

const TIER_VALUES = ['Standard', 'VIP'], TIER_W = [70, 30];
const DAYS_VALUES = [1, 3, 7, 14, 30, 60, 90], DAYS_W = [8, 12, 18, 22, 20, 12, 8];
const PRIOR_VALUES = [0, 1, 2, 3, 4, 5], PRIOR_W = [30, 25, 20, 13, 8, 4];

function attendScore(reg) {
  const b = spec.betas.attend;
  return b.TicketTierVIP * (reg.TicketTier === 'VIP' ? 1 : 0) + b.DaysRegisteredBefore * reg.DaysRegisteredBefore + b.PriorAttendance * reg.PriorAttendance;
}
function cancelScore(reg) {
  const b = spec.betas.cancel;
  return b.TicketTierVIP * (reg.TicketTier === 'VIP' ? 1 : 0) + b.DaysRegisteredBefore * reg.DaysRegisteredBefore + b.PriorAttendance * reg.PriorAttendance;
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
    IncomeK: pick([20, 35, 50, 65, 80, 100, 130, 170], [10, 18, 22, 18, 12, 10, 6, 4]),
    AutoRenew: rng.bernoulli(0.35),
    Status: 'Active',
  }));

  const regsByCycle = new Map();
  for (const c of spec.cycles) {
    const list = people.map((p) => {
      const r = createRng(seed, `reg:${p.ID}:${c}`);
      const tier = r.pickWeighted(TIER_VALUES.map((v, i) => ({ value: v, weight: TIER_W[i] })));
      const days = r.pickWeighted(DAYS_VALUES.map((v, i) => ({ value: v, weight: DAYS_W[i] })));
      const prior = r.pickWeighted(PRIOR_VALUES.map((v, i) => ({ value: v, weight: PRIOR_W[i] })));
      return {
        ID: ids.MintId(domain.name, 'EventRegistration', [p.ID, String(c)]),
        PersonID: p.ID, EventDate: `${c}-06-15`, TicketTier: tier, DaysRegisteredBefore: days, PriorAttendance: prior,
        Cycle: c,
      };
    });
    regsByCycle.set(c, list);
  }
  const allRegs = spec.cycles.flatMap((c) => regsByCycle.get(c));

  const b0Attend = {}, b0Cancel = {};

  recurringDecision({
    seed, cycles: spec.cycles, target: spec.targets.attend,
    cohortOf: (c) => regsByCycle.get(c),
    prepareCohortContext: (cohort, c) => { const b0 = calibrateIntercept(cohort.map((r) => attendScore(r)), spec.targets.attend); b0Attend[c] = b0; return { b0 }; },
    scoreOf: (reg) => attendScore(reg),
    streamKey: (reg, c) => `attend:${reg.ID}`,
    onDecision: (reg, c, yes) => { reg.attended = yes; },
  });

  recurringDecision({
    seed, cycles: spec.cycles, target: spec.targets.cancelGivenNoAttend,
    cohortOf: (c) => regsByCycle.get(c).filter((r) => !r.attended),
    prepareCohortContext: (cohort, c) => { const b0 = calibrateIntercept(cohort.map((r) => cancelScore(r)), spec.targets.cancelGivenNoAttend); b0Cancel[c] = b0; return { b0 }; },
    scoreOf: (reg) => cancelScore(reg),
    streamKey: (reg, c) => `cancel:${reg.ID}`,
    onDecision: (reg, c, yes) => { reg.cancelled = yes; },
  });

  for (const c of spec.cycles) {
    if (b0Cancel[c] === undefined) {
      b0Cancel[c] = calibrateIntercept(regsByCycle.get(c).map((r) => cancelScore(r)), spec.targets.cancelGivenNoAttend);
    }
  }

  const rows = [], truth = [];
  for (const reg of allRegs) {
    const c = reg.Cycle;
    const p1 = sigmoid(b0Attend[c] + attendScore(reg));
    const p2 = sigmoid(b0Cancel[c] + cancelScore(reg));
    const trueAttended = p1;
    const trueCancelled = (1 - p1) * p2;
    const trueNoShow = (1 - p1) * (1 - p2);
    const outcome = reg.attended ? 'Attended' : (reg.cancelled ? 'Cancelled' : 'NoShow');
    rows.push({
      ID: reg.ID, PersonID: reg.PersonID, EventDate: reg.EventDate, TicketTier: reg.TicketTier,
      DaysRegisteredBefore: reg.DaysRegisteredBefore, PriorAttendance: reg.PriorAttendance,
      Outcome: outcome, WorldID: spec.id, Seed: seed,
    });
    truth.push({
      EventRegistrationID: reg.ID, Cycle: c,
      TrueP_Attended: trueAttended, TrueP_NoShow: trueNoShow, TrueP_Cancelled: trueCancelled,
      DrawnClass: outcome,
    });
  }
  return { people, rows, truth };
}

function auc1v1(truth, classProbKey, classLabel) {
  const pos = truth.filter((t) => t.DrawnClass === classLabel).map((t) => t[classProbKey]);
  const neg = truth.filter((t) => t.DrawnClass !== classLabel).map((t) => t[classProbKey]);
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
  const logLoss = -truth.reduce((s, t) => {
    const p = t.DrawnClass === 'Attended' ? t.TrueP_Attended : t.DrawnClass === 'NoShow' ? t.TrueP_NoShow : t.TrueP_Cancelled;
    return s + Math.log(Math.max(p, 1e-15));
  }, 0) / truth.length;
  return {
    logLoss,
    aucByClass: {
      Attended: auc1v1(truth, 'TrueP_Attended', 'Attended'),
      NoShow: auc1v1(truth, 'TrueP_NoShow', 'NoShow'),
      Cancelled: auc1v1(truth, 'TrueP_Cancelled', 'Cancelled'),
    },
  };
}

const toCsv = (objs) => { const cols = Object.keys(objs[0]); return [cols.join(','), ...objs.map((o) => cols.map((c) => (o[c] === null || o[c] === undefined ? '' : String(o[c]))).join(','))].join('\n'); };

for (const seed of seeds) {
  const dir = path.join(outDir, `seed-${seed}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { people, rows, truth } = buildSeed(seed);
  if (shouldEmitMetadata) {
    await emitMetadata({ outputDir: path.join(dir, 'metadata'), domain, data: { Person: people, EventRegistration: rows } });
  }
  fs.writeFileSync(path.join(dir, 'rows.csv'), toCsv(rows)); fs.writeFileSync(path.join(dir, 'truth.csv'), toCsv(truth));
  const peopleCsvRows = people.map((p) => ({
    ID: p.ID, MemberNumber: p.MemberNumber, Region: p.Region, PostalCode: p.PostalCode,
    IncomeK: p.IncomeK, AutoRenew: p.AutoRenew ? 1 : 0, Status: p.Status, WorldID: spec.id, Seed: seed,
  }));
  fs.writeFileSync(path.join(dir, 'people.csv'), toCsv(peopleCsvRows));
  const classCounts = rows.reduce((a, r) => (a[r.Outcome] = (a[r.Outcome] ?? 0) + 1, a), {});
  const classRates = Object.fromEntries(Object.entries(classCounts).map(([k, v]) => [k, v / rows.length]));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...spec, seed, oracle: oracle(truth), rowCount: rows.length, classRates }, null, 2));
  console.log(spec.id, seed, rows.length, 'rows', JSON.stringify({ classRates, oracle: oracle(truth) }));
}
