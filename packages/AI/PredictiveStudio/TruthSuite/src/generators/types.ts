import type { Json } from '../data/cache';

/** One CSV cell: what the generators write into `rows.csv`, `truth.csv` and `people.csv`. */
export type CsvValue = string | number | boolean | null;

/** One CSV record, keyed by column name. */
export type CsvRow = Record<string, CsvValue>;

/** The world era: from cycle `fromCycle` on, the intercept shifts and named betas are overridden. */
export interface WorldEra {
  fromCycle: number | null;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  deltaIntercept: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  betaOverrides: Record<string, number>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** Fields every world spec (`fixtures/worlds/*.json`) carries. */
export interface WorldSpecBase {
  id: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  seeds: number[];  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  freshSeed: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  nPersons: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  cycles: number[];  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/**
 * A binary renewal world (`fixtures/worlds/W1..W8-*.json`). `censorLastCycle`: `none` observes the last cycle, `zero`
 * records it as not renewed, `null` leaves it empty.
 */
export interface WorldSpec extends WorldSpecBase {
  target: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  betas: Record<string, number>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  era: WorldEra;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  churn: boolean;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  censorLastCycle: 'none' | 'zero' | 'null';  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  leaks: { statusOnRow: boolean; personStatusInPlace: boolean };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  extraNoise: { PostalCode400: boolean; MemberNumberUnique: boolean };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  multiclass: boolean;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** The betas of one of W9's two sequential logits. */
export interface MulticlassBetas {
  TicketTierVIP: number;
  DaysRegisteredBefore: number;
  PriorAttendance: number;
}

/** The W9 event-attendance world (`fixtures/worlds/W9-multiclass.json`). */
export interface MulticlassWorldSpec extends WorldSpecBase {
  targets: { attend: number; cancelGivenNoAttend: number };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  betas: { attend: MulticlassBetas; cancel: MulticlassBetas };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** One field of the worlds domain (`fixtures/worlds-domain/domain.json`); `name` defaults to the field's key. */
export interface WorldDomainField {
  [key: string]: Json | undefined;
  name?: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  type: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** One entity of the worlds domain. */
export interface WorldDomainEntity {
  name: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  entityName: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  targetTable: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  schema: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  pack: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  businessKey: Json;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  cycleField?: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  fields: Record<string, WorldDomainField>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  foreignKeys: Json;
}

/** The worlds domain: the Loom domain config the world generators mint IDs in and emit metadata for. */
export interface WorldDomain {
  name: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  namespace: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  description: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  packs: Json;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  entities: Record<string, WorldDomainEntity>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** A scenario feature's distribution. */
export type FeatureDist =
  | { dist: 'normal'; mean: number; sd: number }  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  | { dist: 'bernoulli'; p: number }  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  | { dist: 'int'; lo: number; hi: number };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys

/** The scenario kinds `make_scenario.ts` generates. */
export type ScenarioKind = 'binary' | 'regression' | 'count' | 'tweedie' | 'panel' | 'series';

/** C4's planted leakage traps. */
export interface ScenarioTraps {
  proxy: { column: string; flipP: number };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  nextPeriod: { column: string };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  highCardId: { column: string };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** T3's lag (legitimate) and same-period (leak) columns. */
export interface ScenarioSeriesLeak {
  lagColumn: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  sameColumn: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  leakSd: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** Series rolling-origin evaluation: K test windows of H periods. */
export interface ScenarioRollingOrigin {
  K: number;
  H: number;
}

/** D2's planted input shift. */
export interface ScenarioCovariateShift {
  feature: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  deltaMean: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  fromPeriod: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** A planted-truth scenario spec (`fixtures/scenarios/specs/*.json`). */
export interface ScenarioSpec {
  id: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  namespace: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  seed: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  description: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  kind: ScenarioKind;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  features: Record<string, FeatureDist>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  betas: Record<string, number>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  intercept: number | null;
  sizingNote?: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  nEntities?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  sigma?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  slices?: Json;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  targetRate?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  interceptCalibration?: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  periodsPerEntity?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  startYear?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  covariateShift?: ScenarioCovariateShift;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  shiftFrom?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  deltaIntercept?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  stateFeature?: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  traps?: ScenarioTraps;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  entitySd?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  phi?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  nPeriods?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  testPeriods?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  level?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  trend?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  seasonAmp?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  rollingOrigin?: ScenarioRollingOrigin;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  zeroLogit?: number;
  zeroBetas?: Record<string, number>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  logSd?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  seriesLeak?: ScenarioSeriesLeak;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** The spec keys a scenario manifest copies into `planted` when the spec sets them. */
export type ScenarioPlantedKey =
  | 'betas' | 'intercept' | 'targetRate' | 'interceptCalibration' | 'phi' | 'sigma' | 'entitySd' | 'nEntities'
  | 'periodsPerEntity' | 'startYear' | 'level' | 'trend' | 'seasonAmp' | 'nPeriods' | 'testPeriods' | 'rollingOrigin'
  | 'zeroLogit' | 'zeroBetas' | 'logSd' | 'shiftFrom' | 'deltaIntercept' | 'stateFeature' | 'covariateShift';

/** The planted spec fields a scenario manifest copies unchanged (all but `phi` and `rollingOrigin`). */
export type ScenarioPlantedCopiedKey = Exclude<ScenarioPlantedKey, 'phi' | 'rollingOrigin'>;

/** The spec fields a scenario manifest copies unchanged into `planted`. */
export type ScenarioPlantedCopied = Partial<Pick<ScenarioSpec, ScenarioPlantedCopiedKey>>;

/** The planted parameters a scenario manifest records. */
export type ScenarioPlanted = ScenarioPlantedCopied & {
  phi: number | null;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  rollingOrigin?: ScenarioRollingOrigin & { firstTestPeriod?: number };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  proxyFlipP?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  leakSd?: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  featureDists?: Record<string, FeatureDist>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
};

/** One planted trap column a scenario manifest declares. */
export interface ScenarioTrapDeclaration {
  column: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  kind: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  leaks: string | null;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  mechanism: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** A scenario's `manifest.json`. */
export interface ScenarioManifest {
  id: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  seed: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  kind: ScenarioKind;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  planted: ScenarioPlanted;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  columns: { features: string[]; traps: string[]; truth: string[] };  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  traps: ScenarioTrapDeclaration[];  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  slices: Json;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  truthDefinition: Record<string, string>;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  sizingNote: string | null;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  nRows: number;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}

/** A derived scenario's `manifest.json` (T3-lag): the base manifest plus its derivation. */
export interface DerivedScenarioManifest extends ScenarioManifest {
  derivedFrom: string;  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
  droppedColumns: string[];  // case-violation-ok-legacy-back-compat: mirrors the fixture JSON keys
}
