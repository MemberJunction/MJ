// probes/scenarios/make_scenario.mjs — usage: node make_scenario.mjs specs/<X>.json <outDir> [--seed <n>]
//
// Planted-truth scenario generator (P2). Base loop is the task-P2 brief's; the additions are:
//   - applyTraps (C4):             post-pass writing ProxyOfTarget / NextPeriodFlag / TicketCode, then dropping the
//                                  hidden final period that exists only so NextPeriodFlag is populated on every row.
//   - shiftOffset (D1c/D1r):       the planted intercept shift from period `shiftFrom`; it enters z before the draw so
//                                  Target and TrueValue describe the same shifted population.
//   - covariateShift (D2):        a planted input shift: from period `fromPeriod` on, normal feature `feature` is drawn
//                                  with mean + `deltaMean` (same SD). Target is drawn from the unchanged model, so the
//                                  labels follow the true model and only the input distribution moves (P11 Ruling Q23).
//   - applySeriesLagColumns (T3):  post-pass writing LagTarget (legitimate) and SamePeriodTarget (leak).
//   - applyRollingOrigins (series): post-pass writing Origin<k> train/test marks and truth_origins.csv (Ruling Q10).
//   - stateFeature (C4):           a legitimate lagged-outcome feature (previous period's Target, 0 in period 0); it
//                                  makes the next period's Target depend on this one, so NextPeriodFlag really leaks
//                                  the current Target, and it keeps TrueValue attainable from rows.csv features.
//   - stationary AR(1) start:      the first AR(1) draw uses the stationary SD sigma/sqrt(1-phi^2), so every period
//                                  has the same error variance (the brief started e at 0).
// Streams: the visible world draws only from the `<id>` stream. C4's hidden period draws from `<id>:hidden` and the
// trap columns from `<id>:traps`, T3's leak from `<id>:leak`, so the visible world (features, Target, TrueValue) is
// byte-for-byte the same with or without traps (asserted by test_C4_base_world_independent_of_traps).
import fs from 'node:fs'; import path from 'node:path';
import { createRng, ids, writeCsv, sigmoid, round } from './gen_lib.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = path.resolve(process.argv[3]); fs.mkdirSync(out, { recursive: true });
const seedFlagIdx = process.argv.indexOf('--seed');
const seed = (seedFlagIdx !== -1 ? Number(process.argv[seedFlagIdx + 1]) : undefined) ?? spec.seed; // seed 0 is valid
const rng = createRng(seed, spec.id); const mint = ids(spec.namespace, seed);
const hiddenRng = createRng(seed, `${spec.id}:hidden`);
const feats = Object.keys(spec.features);                  // {name: {dist:'normal'|'bernoulli'|'int', ...}}
const stateName = spec.stateFeature ?? null;
const cs = spec.covariateShift ?? null;                   // D2 only; absent everywhere else, so draw() is unchanged there
const meanAt = (f, d, p) => (cs && f === cs.feature && p >= cs.fromPeriod) ? d.mean + cs.deltaMean : d.mean;
const draw = (f, r, p = 0) => { const d = spec.features[f]; return d.dist === 'normal' ? round(r.normal(meanAt(f, d, p), d.sd), 4) : d.dist === 'bernoulli' ? (r.bernoulli(d.p) ? 1 : 0) : r.int(d.lo, d.hi); };
const linFeats = stateName ? [...feats, stateName] : feats;
const lin = (x) => spec.intercept + linFeats.reduce((s, f) => s + (spec.betas[f] ?? 0) * x[f], 0);
const ar1 = (e, first, r) => first ? r.normal(0, spec.sigma / Math.sqrt(1 - spec.phi ** 2)) : spec.phi * e + r.normal(0, spec.sigma);
const MAX_POISSON_MEAN = 500;                              // Knuth's product method: exp(-lambda) underflows near 745

function poisson(lambda, r) {
  if (!(lambda <= MAX_POISSON_MEAN)) throw new Error(`Poisson mean ${lambda} exceeds ${MAX_POISSON_MEAN}; the sampler would underflow`);
  let k = 0, q = 1; const L = Math.exp(-lambda);
  do { k++; q *= r.next(); } while (q > L);
  return k - 1;
}

/** D1: planted intercept shift. Periods p >= shiftFrom get +deltaIntercept on the linear predictor. */
function shiftOffset(p) {
  return (spec.shiftFrom !== undefined && p >= spec.shiftFrom) ? spec.deltaIntercept : 0;
}

/** C4 leakage traps. rows/truth are entity-major, period-ordered; hidden rows (period == periodsPerEntity) are dropped. */
function applyTraps(rows, truth) {
  const t = spec.traps; const trng = createRng(seed, `${spec.id}:traps`);
  const keptRows = [], keptTruth = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    if (r.hidden) continue;
    const next = rows[k + 1];                              // same entity's next period (exists: hidden period follows)
    if (!next || next.EntityKey !== r.EntityKey) throw new Error(`no next period for ${r.ID}`);
    r[t.proxy.column] = trng.bernoulli(t.proxy.flipP) ? 1 - r.Target : r.Target;
    r[t.nextPeriod.column] = next.Target;
    r[t.highCardId.column] = `TK-${trng.int(10000000, 99999999)}`;
    delete r.hidden; keptRows.push(r); keptTruth.push(truth[k]);
  }
  return { rows: keptRows, truth: keptTruth };
}
function trapColumns() {
  if (spec.traps) return [spec.traps.proxy.column, spec.traps.nextPeriod.column, spec.traps.highCardId.column];
  if (spec.seriesLeak) return [spec.seriesLeak.sameColumn];
  return [];
}
function trapDeclarations() {
  if (spec.traps) {
    const t = spec.traps;
    return [
      { column: t.proxy.column, kind: 'target-proxy', leaks: 'Target', mechanism: `Target flipped with probability ${t.proxy.flipP} (planted agreement ${1 - t.proxy.flipP})` },
      { column: t.nextPeriod.column, kind: 'time-shifted-label', leaks: 'Target', mechanism: `the same entity's next-period Target; it depends on this period's Target through ${stateName} (beta ${spec.betas[stateName]}), so it is only knowable after the outcome` },
      { column: t.highCardId.column, kind: 'high-cardinality-id', leaks: null, mechanism: 'per-row random ticket code from its own RNG stream; carries no information about Target, a model gaining from it is memorizing' },
    ];
  }
  if (spec.seriesLeak) return [{ column: spec.seriesLeak.sameColumn, kind: 'same-period-outcome', leaks: 'Target', mechanism: `Target + N(0, ${spec.seriesLeak.leakSd}) recorded in the same period (today's value of the outcome)` }];
  return [];
}

/** T3: LagTarget = previous period's Target (legitimate, empty in period 0); SamePeriodTarget = Target + small noise (leak). */
function applySeriesLagColumns(rows) {
  const l = spec.seriesLeak; const lrng = createRng(seed, `${spec.id}:leak`);
  for (let t = 0; t < rows.length; t++) {
    rows[t][l.lagColumn] = t === 0 ? null : rows[t - 1].Target;
    rows[t][l.sameColumn] = round(rows[t].Target + lrng.normal(0, l.leakSd), 4);
  }
}

/**
 * Series rolling-origin evaluation (Ruling Q10). K non-overlapping test windows of H periods end at the last period.
 * Origin k's last training period is o_k = firstTest + (k-1)H - 1; Origin<k> is 'train' for t <= o_k, 'test' for
 * o_k < t <= o_k + H, blank after. For every test row: h = t - o_k and
 * OriginMean = mean_t + phi^h * (Target_{o_k} - mean_{o_k}), the best forecast given the series up to o_k.
 */
function applyRollingOrigins(truth, rows, means) {
  const { K, H } = spec.rollingOrigin; const firstTest = spec.nPeriods - K * H; const origins = [];
  if (firstTest < 24) throw new Error('rolling origin leaves under 24 training periods');
  for (let k = 1; k <= K; k++) {
    const o = firstTest + (k - 1) * H - 1;
    for (let t = 0; t < spec.nPeriods; t++) {
      const inTest = t > o && t <= o + H;
      truth[t][`Origin${k}`] = t <= o ? 'train' : inTest ? 'test' : '';
      if (inTest) origins.push({ ID: truth[t].ID, origin: k, h: t - o, OriginMean: round(means[t] + spec.phi ** (t - o) * (rows[o].Target - means[o]), 4) });
    }
  }
  return origins;
}
const originCols = () => (spec.kind === 'series' ? Array.from({ length: spec.rollingOrigin.K }, (_, i) => `Origin${i + 1}`) : []);

let rows = [], truth = [], origins = null;
if (spec.kind === 'series') {                              // T1p/T3/T4: one series with trend + seasonality + AR(1)
  let e = 0; const means = [];
  for (let t = 0; t < spec.nPeriods; t++) {
    const date = new Date(Date.UTC(spec.startYear, t, 1)).toISOString().slice(0, 10);
    const mean = spec.level + spec.trend * t + spec.seasonAmp * Math.sin(2 * Math.PI * (t % 12) / 12);
    e = ar1(e, t === 0, rng); means.push(mean);
    const id = mint('Obs', [`t${t}`]); const y = round(mean + e, 4);
    const oneStep = t === 0 ? mean : mean + spec.phi * (rows[t - 1].Target - means[t - 1]);
    rows.push({ ID: id, EntityKey: 'series', T: date, Target: y });
    truth.push({ ID: id, TrueValue: round(mean, 4), Split: t < spec.nPeriods - spec.testPeriods ? 'train' : 'test', OneStepMean: round(oneStep, 4) });
  }
  if (spec.seriesLeak) applySeriesLagColumns(rows);
  origins = applyRollingOrigins(truth, rows, means);
} else {
  const visible = spec.periodsPerEntity ?? 1;
  const periods = visible + (spec.traps ? 1 : 0);          // C4: one hidden future period, from its own stream
  for (let i = 0; i < spec.nEntities; i++) {
    const re = spec.kind === 'panel' ? rng.normal(0, spec.entitySd) : 0; let e = 0; let prev = 0; let ePrevObs = 0;
    for (let p = 0; p < periods; p++) {
      const r = p >= visible ? hiddenRng : rng;
      const x = Object.fromEntries(feats.map(f => [f, draw(f, r, p)]));
      if (stateName) x[stateName] = prev;
      const pop = lin(x) + shiftOffset(p); const z = pop + re; const id = mint('Row', [`e${i}`, `p${p}`]);
      let y, tv; const tr = { ID: id };
      if (spec.kind === 'binary') { tv = sigmoid(z); y = r.bernoulli(tv) ? 1 : 0; }
      else if (spec.kind === 'count') { tv = Math.exp(z); y = poisson(tv, r); }
      else if (spec.kind === 'tweedie') { const pz = sigmoid(spec.zeroLogit + (spec.zeroBetas ? feats.reduce((s, f) => s + (spec.zeroBetas[f] ?? 0) * x[f], 0) : 0)); const mu = Math.exp(z); tv = (1 - pz) * mu; y = r.bernoulli(pz) ? 0 : round(mu * Math.exp(r.normal(-(spec.logSd ** 2) / 2, spec.logSd)), 2); }
      else { e = spec.kind === 'panel' ? ar1(e, p === 0, r) : r.normal(0, spec.sigma); tv = z; y = round(z + e, 4); }
      tr.TrueValue = round(tv, 6);
      if (spec.kind === 'panel') {                        // Ruling Q10 information sets
        tr.PopulationMean = round(pop, 6);
        tr.OneStepMean = round(z + (p === 0 ? 0 : spec.phi * ePrevObs), 6);
        ePrevObs = y - z;                                  // the AR error as seen through the (rounded) Target
      }
      const T = spec.startYear ? new Date(Date.UTC(spec.startYear + p, 0, 1)).toISOString().slice(0, 10) : '';
      const row = { ID: id, EntityKey: `E${i}`, T, ...x, Target: y };
      if (p >= visible) row.hidden = true;
      rows.push(row); truth.push(tr);
      prev = y;
    }
  }
  if (spec.traps) ({ rows, truth } = applyTraps(rows, truth));
}

const featureCols = [...linFeats, ...(spec.seriesLeak ? [spec.seriesLeak.lagColumn] : [])];
const truthCols = spec.kind === 'series' ? ['ID', 'TrueValue', 'Split', 'OneStepMean', ...originCols()]
  : spec.kind === 'panel' ? ['ID', 'TrueValue', 'PopulationMean', 'OneStepMean'] : ['ID', 'TrueValue'];
const shiftTxt = spec.shiftFrom !== undefined ? ` + ${spec.deltaIntercept} for periods >= ${spec.shiftFrom}` : '';
const TRUTH_DEF = {
  binary: { TrueValue: `P(Target = 1 | features) = sigmoid(intercept + betas.x${shiftTxt})` },
  regression: { TrueValue: `E[Target | features] = intercept + betas.x${shiftTxt}` },
  count: { TrueValue: 'E[Target | features] = exp(intercept + betas.x) (Poisson mean)' },
  tweedie: { TrueValue: 'E[Target | features] = (1 - sigmoid(zeroLogit + zeroBetas.x)) * exp(intercept + betas.x)' },
  panel: {
    TrueValue: 'E[Target | features, u_entity] = intercept + betas.x + u_entity (conditions on the entity effect; excludes the AR(1) error)',
    PopulationMean: 'E[Target | features] = intercept + betas.x (no entity information: the best a model can do for an unseen entity)',
    OneStepMean: 'E[Target | features, u_entity, previous Target] = intercept + betas.x + u_entity + phi*(Target_{p-1} - TrueValue_{p-1}); period 0: TrueValue',
  },
  series: {
    TrueValue: 'E[Target_t] = level + trend*t + seasonAmp*sin(2*pi*(t mod 12)/12) (marginal mean; no past observations)',
    OneStepMean: 'E[Target_t | Target_{t-1}] = TrueValue_t + phi*(Target_{t-1} - TrueValue_{t-1}); period 0: TrueValue',
    OriginMean: 'truth_origins.csv: E[Target_t | series up to origin o_k] = TrueValue_t + phi^h*(Target_{o_k} - TrueValue_{o_k}), h = t - o_k',
    'Origin<k>': 'rolling-origin k: train for t <= o_k, test for o_k < t <= o_k + H, blank after',
  },
};
const PLANTED_KEYS = ['betas', 'intercept', 'targetRate', 'interceptCalibration', 'phi', 'sigma', 'entitySd', 'nEntities', 'periodsPerEntity',
  'startYear', 'level', 'trend', 'seasonAmp', 'nPeriods', 'testPeriods', 'rollingOrigin', 'zeroLogit', 'zeroBetas', 'logSd', 'shiftFrom', 'deltaIntercept', 'stateFeature', 'covariateShift'];
const planted = { phi: null, ...Object.fromEntries(PLANTED_KEYS.filter(k => spec[k] !== undefined).map(k => [k, spec[k]])) };
if (spec.rollingOrigin) planted.rollingOrigin = { ...spec.rollingOrigin, firstTestPeriod: spec.nPeriods - spec.rollingOrigin.K * spec.rollingOrigin.H };
if (spec.traps) planted.proxyFlipP = spec.traps.proxy.flipP;
if (spec.seriesLeak) planted.leakSd = spec.seriesLeak.leakSd;
planted.featureDists = spec.features;

writeCsv(path.join(out, 'rows.csv'), ['ID', 'EntityKey', 'T', ...featureCols, ...trapColumns(), 'Target'], rows);
writeCsv(path.join(out, 'truth.csv'), truthCols, truth);
if (origins) writeCsv(path.join(out, 'truth_origins.csv'), ['ID', 'origin', 'h', 'OriginMean'], origins);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  id: spec.id, seed, kind: spec.kind, planted,
  columns: { features: featureCols, traps: trapColumns(), truth: truthCols }, traps: trapDeclarations(),
  slices: spec.slices ?? {}, truthDefinition: TRUTH_DEF[spec.kind], sizingNote: spec.sizingNote ?? null, nRows: rows.length,
}, null, 2) + '\n');
console.log(spec.id, rows.length);
