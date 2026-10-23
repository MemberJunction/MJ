// make_scenario.ts — usage: node --import tsx src/generators/make_scenario.ts fixtures/scenarios/specs/<X>.json <outDir> [--seed <n>]
//
// Planted-truth scenario generator. Beyond the base loop (features, linear predictor, Target and TrueValue per row):
//   - applyTraps (C4):             post-pass writing ProxyOfTarget / NextPeriodFlag / TicketCode, then dropping the
//                                  hidden final period that exists only so NextPeriodFlag is populated on every row.
//   - shiftOffset (D1c/D1r):       the planted intercept shift from period `shiftFrom`; it enters z before the draw so
//                                  Target and TrueValue describe the same shifted population.
//   - covariateShift (D2):         a planted input shift: from period `fromPeriod` on, normal feature `feature` is drawn
//                                  with mean + `deltaMean` (same SD). Target is drawn from the unchanged model, so the
//                                  labels follow the true model and only the input distribution moves.
//   - applySeriesLagColumns (T3):  post-pass writing LagTarget (legitimate) and SamePeriodTarget (leak).
//   - applyRollingOrigins (series): post-pass writing Origin<k> train/test marks and truth_origins.csv.
//   - stateFeature (C4):           a legitimate lagged-outcome feature (previous period's Target, 0 in period 0); it
//                                  makes the next period's Target depend on this one, so NextPeriodFlag really leaks
//                                  the current Target, and it keeps TrueValue attainable from rows.csv features.
//   - stationary AR(1) start:      the first AR(1) draw uses the stationary SD sigma/sqrt(1-phi^2), so every period
//                                  has the same error variance.
// Streams: the visible world draws only from the `<id>` stream. C4's hidden period draws from `<id>:hidden` and the
// trap columns from `<id>:traps`, T3's leak from `<id>:leak`, so the visible world (features, Target, TrueValue) is
// byte-for-byte the same with or without traps.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GenLib, type ScenarioIdMinter } from './gen_lib';
import { Loom, type LoomRng } from './loom';
import type {
  CsvValue, ScenarioKind, ScenarioManifest, ScenarioPlanted, ScenarioPlantedCopied, ScenarioPlantedCopiedKey, ScenarioPlantedKey, ScenarioSpec, ScenarioTrapDeclaration,
} from './types';

/** One row of a scenario's `rows.csv`; feature and trap columns are keyed by name. */
type ScenarioRow = { [column: string]: CsvValue; ID: string; EntityKey: string; T: string; Target: number };

/** One row of a scenario's `truth.csv`; which truth columns it has depends on the scenario kind. */
type ScenarioTruthRow = { [column: string]: CsvValue; ID: string };

/** One row of a series scenario's `truth_origins.csv`: the best forecast from rolling origin `origin`. */
type OriginRow = { ID: string; origin: number; h: number; OriginMean: number };

/** The generated scenario: rows, truth and (series only) the rolling-origin truth. */
interface ScenarioOutput {
  Rows: ScenarioRow[];
  Truth: ScenarioTruthRow[];
  Origins: OriginRow[] | null;
}

/** Everything one scenario run draws from: the spec, the seed, its RNG streams and ID minter, and the feature lists. */
interface ScenarioContext {
  Spec: ScenarioSpec;
  Seed: number;
  Rng: LoomRng;
  HiddenRng: LoomRng;
  Mint: ScenarioIdMinter;
  Features: string[];
  StateName: string | null;
  LinFeatures: string[];
}

/** The per-entity state carried from one period to the next. */
interface EntityState { E: number; Prev: number; EPrevObs: number }

/** The planted-truth scenario generator. */
export class ScenarioGenerator {
  /** Knuth's product method: exp(-lambda) underflows near 745. */
  private static readonly MAX_POISSON_MEAN = 500;

  private static readonly PLANTED_KEYS: readonly ScenarioPlantedKey[] = [
    'betas', 'intercept', 'targetRate', 'interceptCalibration', 'phi', 'sigma', 'entitySd', 'nEntities', 'periodsPerEntity',
    'startYear', 'level', 'trend', 'seasonAmp', 'nPeriods', 'testPeriods', 'rollingOrigin', 'zeroLogit', 'zeroBetas', 'logSd',
    'shiftFrom', 'deltaIntercept', 'stateFeature', 'covariateShift',
  ];

  /** Generate the scenario named on the command line into the output directory. */
  public static Main(argv: readonly string[]): void {
    const spec = GenLib.ReadJson<ScenarioSpec>(argv[2]);
    const out = path.resolve(argv[3]);
    mkdirSync(out, { recursive: true });
    const seedFlagIdx = argv.indexOf('--seed');
    // `??`, not `||`: seed 0 is a valid seed.
    const seed = (seedFlagIdx !== -1 ? Number(argv[seedFlagIdx + 1]) : undefined) ?? spec.seed;
    const ctx = ScenarioGenerator.createContext(spec, seed);
    const output = spec.kind === 'series' ? ScenarioGenerator.generateSeries(ctx) : ScenarioGenerator.generateEntities(ctx);
    ScenarioGenerator.writeOutputs(ctx, out, output);
    console.log(spec.id, output.Rows.length);
  }

  private static createContext(spec: ScenarioSpec, seed: number): ScenarioContext {
    const features = Object.keys(spec.features);
    const stateName = spec.stateFeature || null;
    return {
      Spec: spec,
      Seed: seed,
      Rng: GenLib.CreateRng(seed, spec.id),
      HiddenRng: GenLib.CreateRng(seed, `${spec.id}:hidden`),
      Mint: GenLib.Ids(spec.namespace, seed),
      Features: features,
      StateName: stateName,
      LinFeatures: stateName ? [...features, stateName] : features,
    };
  }

  /** The value of spec field `key`, which the scenario's kind requires; throws when the spec omits it. */
  private static required<K extends keyof ScenarioSpec>(spec: ScenarioSpec, key: K): NonNullable<ScenarioSpec[K]> {
    const value = spec[key];
    if (value === undefined || value === null) throw new Error(`Scenario ${spec.id} (${spec.kind}) needs "${String(key)}"`);
    return value;
  }

  /** Feature `f`'s mean in period `p`: D2's covariate shift adds `deltaMean` from `fromPeriod` on (absent elsewhere). */
  private static meanAt(spec: ScenarioSpec, f: string, mean: number, p: number): number {
    const cs = spec.covariateShift;
    return (cs && f === cs.feature && p >= cs.fromPeriod) ? mean + cs.deltaMean : mean;
  }

  /** One draw of feature `f` in period `p` from stream `r`. */
  private static draw(spec: ScenarioSpec, f: string, r: LoomRng, p = 0): number {
    const d = spec.features[f];
    if (d.dist === 'normal') return GenLib.Round(r.normal(ScenarioGenerator.meanAt(spec, f, d.mean, p), d.sd), 4);
    if (d.dist === 'bernoulli') return r.bernoulli(d.p) ? 1 : 0;
    return r.int(d.lo, d.hi);
  }

  /** The linear predictor: intercept + betas.x over the features (and the state feature, when there is one). */
  private static lin(ctx: ScenarioContext, x: Record<string, number>): number {
    const intercept = ScenarioGenerator.required(ctx.Spec, 'intercept');
    return intercept + ctx.LinFeatures.reduce((s, f) => s + (ctx.Spec.betas[f] || 0) * x[f], 0);
  }

  /** The next AR(1) error; the first draw uses the stationary SD sigma/sqrt(1-phi^2). */
  private static ar1(spec: ScenarioSpec, e: number, first: boolean, r: LoomRng): number {
    const phi = ScenarioGenerator.required(spec, 'phi');
    const sigma = ScenarioGenerator.required(spec, 'sigma');
    return first ? r.normal(0, sigma / Math.sqrt(1 - phi ** 2)) : phi * e + r.normal(0, sigma);
  }

  /** A Poisson draw with mean `lambda` (Knuth's product method). */
  private static poisson(lambda: number, r: LoomRng): number {
    // `!(<=)` rather than `>`, so a NaN mean also refuses.
    if (!(lambda <= ScenarioGenerator.MAX_POISSON_MEAN)) {
      throw new Error(`Poisson mean ${lambda} exceeds ${ScenarioGenerator.MAX_POISSON_MEAN}; the sampler would underflow`);
    }
    let k = 0;
    let q = 1;
    const limit = Math.exp(-lambda);
    do { k++; q *= r.next(); } while (q > limit);
    return k - 1;
  }

  /** D1: planted intercept shift. Periods p >= shiftFrom get +deltaIntercept on the linear predictor. */
  private static shiftOffset(spec: ScenarioSpec, p: number): number {
    return (spec.shiftFrom !== undefined && p >= spec.shiftFrom) ? ScenarioGenerator.required(spec, 'deltaIntercept') : 0;
  }

  /** C4 leakage traps. rows/truth are entity-major, period-ordered; hidden rows (period == periodsPerEntity) are dropped. */
  private static applyTraps(ctx: ScenarioContext, output: ScenarioOutput, hidden: readonly boolean[]): ScenarioOutput {
    const t = ScenarioGenerator.required(ctx.Spec, 'traps');
    const trng = GenLib.CreateRng(ctx.Seed, `${ctx.Spec.id}:traps`);
    const keptRows: ScenarioRow[] = [];
    const keptTruth: ScenarioTruthRow[] = [];
    for (let k = 0; k < output.Rows.length; k++) {
      const r = output.Rows[k];
      if (hidden[k]) continue;
      const next = output.Rows[k + 1];                     // same entity's next period (exists: hidden period follows)
      if (!next || next.EntityKey !== r.EntityKey) throw new Error(`no next period for ${r.ID}`);
      r[t.proxy.column] = trng.bernoulli(t.proxy.flipP) ? 1 - r.Target : r.Target;
      r[t.nextPeriod.column] = next.Target;
      r[t.highCardId.column] = `TK-${trng.int(10000000, 99999999)}`;
      keptRows.push(r);
      keptTruth.push(output.Truth[k]);
    }
    return { Rows: keptRows, Truth: keptTruth, Origins: output.Origins };
  }

  private static trapColumns(spec: ScenarioSpec): string[] {
    if (spec.traps) return [spec.traps.proxy.column, spec.traps.nextPeriod.column, spec.traps.highCardId.column];
    if (spec.seriesLeak) return [spec.seriesLeak.sameColumn];
    return [];
  }

  private static trapDeclarations(ctx: ScenarioContext): ScenarioTrapDeclaration[] {
    const spec = ctx.Spec;
    if (spec.traps) {
      const t = spec.traps;
      const stateBeta = ctx.StateName === null ? undefined : spec.betas[ctx.StateName];
      return [
        { column: t.proxy.column, kind: 'target-proxy', leaks: 'Target', mechanism: `Target flipped with probability ${t.proxy.flipP} (planted agreement ${1 - t.proxy.flipP})` },
        { column: t.nextPeriod.column, kind: 'time-shifted-label', leaks: 'Target', mechanism: `the same entity's next-period Target; it depends on this period's Target through ${ctx.StateName} (beta ${stateBeta}), so it is only knowable after the outcome` },
        { column: t.highCardId.column, kind: 'high-cardinality-id', leaks: null, mechanism: 'per-row random ticket code from its own RNG stream; carries no information about Target, a model gaining from it is memorizing' },
      ];
    }
    if (spec.seriesLeak) {
      return [{ column: spec.seriesLeak.sameColumn, kind: 'same-period-outcome', leaks: 'Target', mechanism: `Target + N(0, ${spec.seriesLeak.leakSd}) recorded in the same period (today's value of the outcome)` }];
    }
    return [];
  }

  /** T3: LagTarget = previous period's Target (legitimate, empty in period 0); SamePeriodTarget = Target + small noise (leak). */
  private static applySeriesLagColumns(ctx: ScenarioContext, rows: ScenarioRow[]): void {
    const l = ScenarioGenerator.required(ctx.Spec, 'seriesLeak');
    const lrng = GenLib.CreateRng(ctx.Seed, `${ctx.Spec.id}:leak`);
    for (let t = 0; t < rows.length; t++) {
      rows[t][l.lagColumn] = t === 0 ? null : rows[t - 1].Target;
      rows[t][l.sameColumn] = GenLib.Round(rows[t].Target + lrng.normal(0, l.leakSd), 4);
    }
  }

  /**
   * Series rolling-origin evaluation. K non-overlapping test windows of H periods end at the last period.
   * Origin k's last training period is o_k = firstTest + (k-1)H - 1; Origin<k> is 'train' for t <= o_k, 'test' for
   * o_k < t <= o_k + H, blank after. For every test row: h = t - o_k and
   * OriginMean = mean_t + phi^h * (Target_{o_k} - mean_{o_k}), the best forecast given the series up to o_k.
   */
  private static applyRollingOrigins(spec: ScenarioSpec, truth: ScenarioTruthRow[], rows: readonly ScenarioRow[], means: readonly number[]): OriginRow[] {
    const { K, H } = ScenarioGenerator.required(spec, 'rollingOrigin');
    const nPeriods = ScenarioGenerator.required(spec, 'nPeriods');
    const phi = ScenarioGenerator.required(spec, 'phi');
    const firstTest = nPeriods - K * H;
    const origins: OriginRow[] = [];
    if (firstTest < 24) throw new Error('rolling origin leaves under 24 training periods');
    for (let k = 1; k <= K; k++) {
      const o = firstTest + (k - 1) * H - 1;
      for (let t = 0; t < nPeriods; t++) {
        const inTest = t > o && t <= o + H;
        truth[t][`Origin${k}`] = t <= o ? 'train' : inTest ? 'test' : '';
        if (inTest) origins.push({ ID: truth[t].ID, origin: k, h: t - o, OriginMean: GenLib.Round(means[t] + phi ** (t - o) * (rows[o].Target - means[o]), 4) });
      }
    }
    return origins;
  }

  private static originColumns(spec: ScenarioSpec): string[] {
    return spec.kind === 'series' ? Array.from({ length: ScenarioGenerator.required(spec, 'rollingOrigin').K }, (_, i) => `Origin${i + 1}`) : [];
  }

  /** T1p/T3/T4: one series with trend + seasonality + AR(1). */
  private static generateSeries(ctx: ScenarioContext): ScenarioOutput {
    const spec = ctx.Spec;
    const nPeriods = ScenarioGenerator.required(spec, 'nPeriods');
    const testPeriods = ScenarioGenerator.required(spec, 'testPeriods');
    const phi = ScenarioGenerator.required(spec, 'phi');
    const level = ScenarioGenerator.required(spec, 'level');
    const trend = ScenarioGenerator.required(spec, 'trend');
    const seasonAmp = ScenarioGenerator.required(spec, 'seasonAmp');
    const startYear = ScenarioGenerator.required(spec, 'startYear');
    const rows: ScenarioRow[] = [];
    const truth: ScenarioTruthRow[] = [];
    const means: number[] = [];
    let e = 0;
    for (let t = 0; t < nPeriods; t++) {
      const date = new Date(Date.UTC(startYear, t, 1)).toISOString().slice(0, 10);
      const mean = level + trend * t + seasonAmp * Math.sin(2 * Math.PI * (t % 12) / 12);
      e = ScenarioGenerator.ar1(spec, e, t === 0, ctx.Rng);
      means.push(mean);
      const id = ctx.Mint('Obs', [`t${t}`]);
      const y = GenLib.Round(mean + e, 4);
      const oneStep = t === 0 ? mean : mean + phi * (rows[t - 1].Target - means[t - 1]);
      rows.push({ ID: id, EntityKey: 'series', T: date, Target: y });
      truth.push({ ID: id, TrueValue: GenLib.Round(mean, 4), Split: t < nPeriods - testPeriods ? 'train' : 'test', OneStepMean: GenLib.Round(oneStep, 4) });
    }
    if (spec.seriesLeak) ScenarioGenerator.applySeriesLagColumns(ctx, rows);
    return { Rows: rows, Truth: truth, Origins: ScenarioGenerator.applyRollingOrigins(spec, truth, rows, means) };
  }

  /** Entity scenarios (cross-section and panel): every entity's periods; C4 adds one hidden future period per entity. */
  private static generateEntities(ctx: ScenarioContext): ScenarioOutput {
    const spec = ctx.Spec;
    const visible = spec.periodsPerEntity || 1;
    const periods = visible + (spec.traps ? 1 : 0);        // C4: one hidden future period, from its own stream
    const output: ScenarioOutput = { Rows: [], Truth: [], Origins: null };
    const hidden: boolean[] = [];
    const nEntities = ScenarioGenerator.required(spec, 'nEntities');
    for (let i = 0; i < nEntities; i++) ScenarioGenerator.generateEntity(ctx, i, visible, periods, output, hidden);
    return spec.traps ? ScenarioGenerator.applyTraps(ctx, output, hidden) : output;
  }

  /** One entity's periods: features, linear predictor, Target and the truth row of each. */
  private static generateEntity(ctx: ScenarioContext, i: number, visible: number, periods: number, output: ScenarioOutput, hidden: boolean[]): void {
    const spec = ctx.Spec;
    const re = spec.kind === 'panel' ? ctx.Rng.normal(0, ScenarioGenerator.required(spec, 'entitySd')) : 0;
    const state: EntityState = { E: 0, Prev: 0, EPrevObs: 0 };
    for (let p = 0; p < periods; p++) {
      const r = p >= visible ? ctx.HiddenRng : ctx.Rng;
      const x: Record<string, number> = Object.fromEntries(ctx.Features.map((f) => [f, ScenarioGenerator.draw(spec, f, r, p)]));
      if (ctx.StateName) x[ctx.StateName] = state.Prev;
      const pop = ScenarioGenerator.lin(ctx, x) + ScenarioGenerator.shiftOffset(spec, p);
      const z = pop + re;
      const id = ctx.Mint('Row', [`e${i}`, `p${p}`]);
      const { y, tv } = ScenarioGenerator.drawTarget(ctx, x, z, r, state, p);
      const tr: ScenarioTruthRow = { ID: id, TrueValue: GenLib.Round(tv, 6) };
      if (spec.kind === 'panel') {                         // information sets: population, entity, one-step
        tr.PopulationMean = GenLib.Round(pop, 6);
        tr.OneStepMean = GenLib.Round(z + (p === 0 ? 0 : ScenarioGenerator.required(spec, 'phi') * state.EPrevObs), 6);
        state.EPrevObs = y - z;                            // the AR error as seen through the (rounded) Target
      }
      const T = spec.startYear ? new Date(Date.UTC(spec.startYear + p, 0, 1)).toISOString().slice(0, 10) : '';
      output.Rows.push({ ID: id, EntityKey: `E${i}`, T, ...x, Target: y });
      output.Truth.push(tr);
      hidden.push(p >= visible);
      state.Prev = y;
    }
  }

  /** Draw Target for linear predictor `z` and return it with its TrueValue (the planted conditional mean). */
  private static drawTarget(ctx: ScenarioContext, x: Record<string, number>, z: number, r: LoomRng, state: EntityState, p: number): { y: number; tv: number } {
    const spec = ctx.Spec;
    if (spec.kind === 'binary') {
      const tv = Loom.Engine.sigmoid(z);
      return { y: r.bernoulli(tv) ? 1 : 0, tv };
    }
    if (spec.kind === 'count') {
      const tv = Math.exp(z);
      return { y: ScenarioGenerator.poisson(tv, r), tv };
    }
    if (spec.kind === 'tweedie') {
      const zeroBetas = spec.zeroBetas;
      const zeroScore = zeroBetas ? ctx.Features.reduce((s, f) => s + (zeroBetas[f] || 0) * x[f], 0) : 0;
      const pz = Loom.Engine.sigmoid(ScenarioGenerator.required(spec, 'zeroLogit') + zeroScore);
      const mu = Math.exp(z);
      const logSd = ScenarioGenerator.required(spec, 'logSd');
      return { y: r.bernoulli(pz) ? 0 : GenLib.Round(mu * Math.exp(r.normal(-(logSd ** 2) / 2, logSd)), 2), tv: (1 - pz) * mu };
    }
    state.E = spec.kind === 'panel' ? ScenarioGenerator.ar1(spec, state.E, p === 0, r) : r.normal(0, ScenarioGenerator.required(spec, 'sigma'));
    return { y: GenLib.Round(z + state.E, 4), tv: z };
  }

  private static truthColumns(spec: ScenarioSpec): string[] {
    if (spec.kind === 'series') return ['ID', 'TrueValue', 'Split', 'OneStepMean', ...ScenarioGenerator.originColumns(spec)];
    if (spec.kind === 'panel') return ['ID', 'TrueValue', 'PopulationMean', 'OneStepMean'];
    return ['ID', 'TrueValue'];
  }

  /** What each truth column means, for the scenario's kind. */
  private static truthDefinition(spec: ScenarioSpec): Record<string, string> {
    const shiftTxt = spec.shiftFrom !== undefined ? ` + ${spec.deltaIntercept} for periods >= ${spec.shiftFrom}` : '';
    const definitions: Record<ScenarioKind, Record<string, string>> = {
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
    return definitions[spec.kind];
  }

  /** Copy spec field `key` into `planted` (generic over the key so the field's type carries across). */
  private static copyPlanted<K extends ScenarioPlantedCopiedKey>(planted: ScenarioPlantedCopied, spec: ScenarioSpec, key: K): void {
    planted[key] = spec[key];
  }

  /** The planted parameters the manifest records: `phi` first (null unless set), then the set spec keys in order. */
  private static planted(spec: ScenarioSpec): ScenarioPlanted {
    const planted: ScenarioPlanted = { phi: null };
    for (const key of ScenarioGenerator.PLANTED_KEYS) {
      if (spec[key] === undefined) continue;
      if (key === 'phi') planted.phi = ScenarioGenerator.required(spec, 'phi');
      else if (key === 'rollingOrigin') planted.rollingOrigin = ScenarioGenerator.required(spec, 'rollingOrigin');
      else ScenarioGenerator.copyPlanted(planted, spec, key);
    }
    if (spec.rollingOrigin) planted.rollingOrigin = { ...spec.rollingOrigin, firstTestPeriod: ScenarioGenerator.required(spec, 'nPeriods') - spec.rollingOrigin.K * spec.rollingOrigin.H };
    if (spec.traps) planted.proxyFlipP = spec.traps.proxy.flipP;
    if (spec.seriesLeak) planted.leakSd = spec.seriesLeak.leakSd;
    planted.featureDists = spec.features;
    return planted;
  }

  /** Write rows.csv, truth.csv, truth_origins.csv (series) and manifest.json. */
  private static writeOutputs(ctx: ScenarioContext, out: string, output: ScenarioOutput): void {
    const spec = ctx.Spec;
    const featureCols = [...ctx.LinFeatures, ...(spec.seriesLeak ? [spec.seriesLeak.lagColumn] : [])];
    const truthCols = ScenarioGenerator.truthColumns(spec);
    GenLib.WriteCsv(path.join(out, 'rows.csv'), output.Rows, { Columns: ['ID', 'EntityKey', 'T', ...featureCols, ...ScenarioGenerator.trapColumns(spec), 'Target'] });
    GenLib.WriteCsv(path.join(out, 'truth.csv'), output.Truth, { Columns: truthCols });
    if (output.Origins) GenLib.WriteCsv(path.join(out, 'truth_origins.csv'), output.Origins, { Columns: ['ID', 'origin', 'h', 'OriginMean'] });
    const manifest: ScenarioManifest = {
      id: spec.id, seed: ctx.Seed, kind: spec.kind, planted: ScenarioGenerator.planted(spec),
      columns: { features: featureCols, traps: ScenarioGenerator.trapColumns(spec), truth: truthCols }, traps: ScenarioGenerator.trapDeclarations(ctx),
      slices: spec.slices || {}, truthDefinition: ScenarioGenerator.truthDefinition(spec), sizingNote: spec.sizingNote || null, nRows: output.Rows.length,
    };
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
}

ScenarioGenerator.Main(process.argv);
