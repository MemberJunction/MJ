/**
 * Evaluation Protocol gate measurements (protocol, holdout, carve). Each trains through MJAPI exactly as a user would
 * (`h.Train`, PredictiveStudio.TrainModel) and reads the stored rows: the run, its snapshot and manifest, its `carve`
 * and `trainer`. Each returns a GateMeasurement.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { RunView } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLTrainingPipelineEntity, MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { JsonParse, StoreSchemas, TrainingRunResultsParser, type ClassBalanceEntry, type HoldoutCarveSummary, type SnapshotRowKey, type TrainingRunResults } from '@memberjunction/predictive-studio-core';
import { SnapshotManifest, StorageProviderSnapshotFileStore } from '@memberjunction/predictive-studio';
import { EscapeSQLString, OrdinalCompare, UUIDMap, UUIDSet } from '@memberjunction/global';
import { C1CorpusFixture, C1_CORPUS_DIR, ContainmentProbe, UnitFixtures, type GateMeasurement, type ProvisionedUnitPipeline, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGatePytest, type PytestRunResult } from './ps-gate-pytest';

type Completed = Extract<TrainingRunResults, { status: 'completed' }>;
type RunTimes = Pick<MJMLTrainingRunEntity, 'ID' | 'EvaluationProtocolID' | '__mj_CreatedAt'>;
type DuesPeriod = { ID: string; PersonID: string; PeriodIndex: number };

/** A trained run's stored results, its snapshot row and its verified manifest. */
interface StoredRun { readonly Results: Completed; readonly Snapshot: MJTrainingSnapshotEntity; readonly Manifest: readonly SnapshotRowKey[] }

/**
 * The new-entity measurement read from a stored manifest and the run's report. The gate rebuilds the held set itself from
 * the manifest's group keys and decision dates (the newest `fraction` of groups by first decision date, ties by key, held
 * out whole from the cutoff on), then checks it against the stored membership hashes.
 */
export interface NewEntityManifestMeasurement {
  /** Distinct group keys in the manifest. */
  readonly Groups: number;
  /** Groups the rebuilt partition holds out whole. */
  readonly HeldGroups: number;
  /** Development-role rows of groups outside the held set: the rows the report must train on. */
  readonly TrainingRows: number;
  /** Rows of held groups on or after the cutoff: the report's holdout rows. */
  readonly HoldoutRows: number;
  /** Manifest rows in neither set. */
  readonly ExcludedRows: number;
  /** The stored held-group hash equals the hash of the held set the gate rebuilt. */
  readonly HeldMembershipMatches: boolean;
  /** The stored training-group hash equals the hash of the groups the gate expects to train. */
  readonly TrainingMembershipMatches: boolean;
  /**
   * Held groups among the run's training groups, measured once both stored hashes verify the two sets; -1 when a hash
   * does not verify (the stored sets are then unknown, and the gate fails).
   */
  readonly SharedEntityKeys: number;
  /** The report's counts (held groups, training, holdout and excluded rows) equal the rebuilt ones. */
  readonly CountsMatch: boolean;
}

/** The stored new-entity report the measurement checks. */
export type NewEntityReport = NonNullable<HoldoutCarveSummary['newEntity']>;

const W_FEATURES = ['Year', 'Plan', 'EventsAttended', 'IncomeK', 'AutoRenew', 'Region', 'Noise1', 'Noise2', 'Noise3', 'Noise4', 'Noise5'] as const;
const W1_FEATURES = ['EventsAttended', 'AutoRenew', 'IncomeK'] as const;
const FOLD_NODES = ['tests/test_folds.py::test_grouped_folds_share_zero_keys_and_repeat', 'tests/test_folds.py::test_blocked_time_folds_keep_gap_and_groups'] as const;
const IN_FOLD_RESAMPLING_NODE = 'tests/test_selection.py::test_in_fold_undersampling_never_touches_validation_rows';
const C1_CUTOFF = '2024-01-01';
const C1_REFERENCE_TEST_KEYS = 1205;
const T2P_NEW_ENTITY_FRACTION = 0.3;
const C1_NEW_ENTITY_FRACTION = 0.15;
/**
 * G2.41's bias bound. The reference's +0.164 came from the legacy pipeline's L2 penalty on unstandardised features; a
 * standardised logistic regression on the same rows gives +0.1487, so the bound is +0.14.
 */
const W6_MIN_BIAS = 0.14;

/** Evaluation Protocol gate bodies (static members on one owner, coding standards §2). */
export class EvaluationProtocolGates {
  /** A pytest half passes when every requested node was collected and every collected case passed. */
  private static pytestPassed(r: PytestRunResult): boolean {
    return r.NotCollected.length === 0 && r.Failed + r.Errors === 0 && r.Collected > 0 && r.Passed === r.Collected;
  }

  private static async train(h: TruthHarness, pipeline: MJMLTrainingPipelineEntity): Promise<MJMLTrainingRunEntity> {
    await h.Train(pipeline);
    return UnitFixtures.LatestRun(h, pipeline.ID);
  }

  private static async stored(h: TruthHarness, run: MJMLTrainingRunEntity): Promise<StoredRun | string> {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (!parsed.Ok || parsed.Value.status !== 'completed') return `run ${run.ID} did not complete (${run.Notes || ''})`;
    if (!run.TrainingSnapshotID) return `run ${run.ID} has no snapshot`;
    const snaps = await RunView.FromMetadataProvider(h.Provider).RunView<MJTrainingSnapshotEntity>({ EntityName: 'MJ: Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(run.TrainingSnapshotID)}'`, ResultType: 'entity_object' }, h.User);
    if (!snaps.Success) return `snapshot ${run.TrainingSnapshotID} could not be read: ${snaps.ErrorMessage}`;
    const snap = snaps.Results[0];
    if (!snap) return `snapshot ${run.TrainingSnapshotID} not found`;
    const manifest = await SnapshotManifest.ReadSnapshotManifest(snap, new StorageProviderSnapshotFileStore(UnitFixtures.EntityFactory(h), h.Provider, h.User));
    return { Results: parsed.Value, Snapshot: snap, Manifest: manifest };
  }

  private static async trainAndRead(h: TruthHarness, pipeline: MJMLTrainingPipelineEntity): Promise<StoredRun | string> {
    return EvaluationProtocolGates.stored(h, await EvaluationProtocolGates.train(h, pipeline));
  }

  private static fail(detail: string): GateMeasurement {
    return { Passed: false, Measured: {}, Detail: detail };
  }

  /** A pipeline's runs (id, protocol, creation time), read-only; a failed read is a message. */
  private static async runsOf(h: TruthHarness, pipelineId: string): Promise<readonly RunTimes[] | string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<RunTimes>({ EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}'`, Fields: ['ID', 'EvaluationProtocolID', '__mj_CreatedAt'], ResultType: 'simple' }, h.User);
    return r.Success ? r.Results : `runs of pipeline ${pipelineId} could not be read: ${r.ErrorMessage}`;
  }

  /** Creation time of each protocol row, by ID, in one read. */
  private static async protocolCreatedAt(h: TruthHarness, ids: readonly string[]): Promise<UUIDMap<Date> | string> {
    const out = new UUIDMap<Date>();
    if (ids.length === 0) return out;
    const list = [...new UUIDSet(ids)].map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJEvaluationProtocolEntity, 'ID' | '__mj_CreatedAt'>>({ EntityName: 'MJ: Evaluation Protocols', ExtraFilter: `ID IN (${list})`, Fields: ['ID', '__mj_CreatedAt'], ResultType: 'simple' }, h.User);
    if (!r.Success) return `protocol rows could not be read: ${r.ErrorMessage}`;
    for (const p of r.Results) out.Set(p.ID, new Date(p.__mj_CreatedAt));
    return out;
  }

  /** How many of the runs reference a protocol row created before (or at) the run row. */
  private static async protocolsBeforeRuns(h: TruthHarness, runs: readonly RunTimes[]): Promise<number | string> {
    const created = await EvaluationProtocolGates.protocolCreatedAt(h, runs.map((r) => r.EvaluationProtocolID).filter((id): id is string => !!id));
    if (typeof created === 'string') return created;
    return runs.filter((r) => {
      const at = r.EvaluationProtocolID ? created.Get(r.EvaluationProtocolID) : undefined;
      return at !== undefined && at.getTime() <= new Date(r.__mj_CreatedAt).getTime();
    }).length;
  }

  /**
   * W1 → S5.1: every run references a protocol row created before (or at) the run row; a search with no protocol is
   * refused. The fixture saves the protocol before it trains, so the ordering half holds by construction; the refusal
   * half (PROTOCOL_REQUIRED, no run row) carries the gate's power.
   */
  public static async MeasureW1ProtocolPrecedesRuns(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W1-signal', { Features: [...W1_FEATURES] });
    await EvaluationProtocolGates.train(h, pipeline);
    await EvaluationProtocolGates.train(h, pipeline);
    const runs = await EvaluationProtocolGates.runsOf(h, pipeline.ID);
    if (typeof runs === 'string') return EvaluationProtocolGates.fail(runs);
    const precede = await EvaluationProtocolGates.protocolsBeforeRuns(h, runs);
    if (typeof precede === 'string') return EvaluationProtocolGates.fail(precede);
    const bare = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W1-signal', { Features: [...W1_FEATURES], Protocol: { Kind: 'none' } });
    const bareAttempt = await h.Train(bare.Pipeline);
    // The refusal's code, never its text.
    const refused = ContainmentProbe.WasRefusedBeforeTraining(bareAttempt, 'PROTOCOL_REQUIRED');
    const bareRunRows = await EvaluationProtocolGates.runsOf(h, bare.Pipeline.ID);
    if (typeof bareRunRows === 'string') return EvaluationProtocolGates.fail(bareRunRows);
    const bareRuns = bareRunRows.length;
    return {
      Passed: runs.length === 2 && precede === 2 && refused && bareRuns === 0,
      Measured: { runs: runs.length, protocolBeforeRun: precede, refusedWithoutProtocol: refused, runsWithoutProtocol: bareRuns },
      Detail: `${precede} of ${runs.length} runs reference a protocol created before them; no-protocol search refused=${refused} (code ${bareAttempt.RefusalCode || 'none'})`,
    };
  }

  /** Each manifest row's `<person id>|<period index>` through the dues period its row id names (`unmapped:<id>` when none). */
  private static async c1KeysOf(h: TruthHarness, rows: readonly SnapshotRowKey[]): Promise<Set<string> | string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<DuesPeriod>(
      { EntityName: UnitFixtures.TruthEntityName(h, 'C1DuesPeriod'), Fields: ['ID', 'PersonID', 'PeriodIndex'], ResultType: 'simple', IgnoreMaxRows: true }, h.User);
    if (!r.Success) return `C1 dues periods could not be read: ${r.ErrorMessage}`;
    const periods = new UUIDMap<DuesPeriod>();
    for (const p of r.Results) periods.Set(p.ID, p);
    return new Set(rows.map((k) => {
      const p = periods.Get(k.rowId);
      return p ? `${p.PersonID.toLowerCase()}|${p.PeriodIndex}` : `unmapped:${k.rowId}`;
    }));
  }

  /** The reference pipeline's C1 test keys, `<person id>|<period index>` lower-cased. */
  private static async referenceC1TestKeys(): Promise<Set<string>> {
    const reference = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'c1_reference_test_keys.csv'));
    return new Set(reference.Rows.map((r) => `${r.person_id.toLowerCase()}|${r.period_index}`));
  }

  /** C1 → S6.1: date-carved after the cutoff, stored keys after it, none in training, equal to the reference's 1,205. */
  public static async MeasureC1DateCarvedHoldout(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1RenewalPipeline(h, { Kind: 'explicit', Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: C1_CUTOFF, holdoutEnd: '2025-01-01', newEntityReport: null } });
    const s = await EvaluationProtocolGates.trainAndRead(h, pipeline);
    if (typeof s === 'string') return EvaluationProtocolGates.fail(s);
    const holdout = s.Manifest.filter((k) => k.role === 'locked-holdout');
    const development = new UUIDSet(s.Manifest.filter((k) => k.role === 'development').map((k) => k.rowId));
    const afterCutoff = holdout.filter((k) => k.decisionDate >= C1_CUTOFF).length;
    const inTraining = holdout.filter((k) => development.Has(k.rowId)).length;
    const actual = await EvaluationProtocolGates.c1KeysOf(h, holdout);
    if (typeof actual === 'string') return EvaluationProtocolGates.fail(actual);
    const expected = await EvaluationProtocolGates.referenceC1TestKeys();
    const matched = [...expected].filter((k) => actual.has(k)).length;
    const extra = [...actual].filter((k) => !expected.has(k)).length;
    return {
      Passed: holdout.length === C1_REFERENCE_TEST_KEYS && afterCutoff === holdout.length && inTraining === 0 && matched === C1_REFERENCE_TEST_KEYS && extra === 0,
      Measured: { holdoutKeys: holdout.length, afterCutoff, inTraining, matchedReference: matched, extra },
      Detail: `${afterCutoff} of ${holdout.length} holdout keys on or after ${C1_CUTOFF}; ${matched} of ${expected.size} reference keys matched, ${extra} extra`,
    };
  }

  /** Mean predicted minus observed over the stored reliability bins, weighted by their rows (NaN without bins). */
  private static calibrationBias(trainer: NonNullable<Completed['trainer']>): number {
    const bins = trainer.calibration?.reliability || [];
    const n = bins.reduce((t, b) => t + b.n, 0);
    return n === 0 ? Number.NaN : bins.reduce((t, b) => t + b.n * (b.meanPredicted - b.observedRate), 0) / n;
  }

  /**
   * W6 → S6.1: out_of_time on StartDate at 2024-01-01 — 6,950 holdout rows (the snapshot's count and the manifest's
   * locked-holdout rows), AUC within 0.02 of 0.6447, mean predicted minus observed ≥ +0.14.
   */
  public static async MeasureW6OutOfTime(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W6-drift', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W6-drift', {
      Features: [...W_FEATURES],
      Protocol: { Kind: 'explicit', Holdout: { kind: 'date-carved', dateColumn: 'StartDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null } },
    });
    const s = await EvaluationProtocolGates.trainAndRead(h, pipeline);
    if (typeof s === 'string') return EvaluationProtocolGates.fail(s);
    const trainer = s.Results.trainer;
    if (trainer === null) return EvaluationProtocolGates.fail('run stored no trainer result');
    // `??`: an AUC of 0 is a legitimate value; a missing one is NaN, which fails the band.
    const auc = [trainer.holdout.primary, ...trainer.holdout.secondary].find((m) => m.metric === 'auc')?.value ?? Number.NaN;
    const drift = EvaluationProtocolGates.calibrationBias(trainer);
    const manifestHoldout = s.Manifest.filter((k) => k.role === 'locked-holdout').length;
    return {
      Passed: s.Snapshot.HoldoutRowCount === 6950 && manifestHoldout === 6950 && Math.abs(auc - 0.6447) <= 0.02 && drift >= W6_MIN_BIAS,
      Measured: { holdoutRows: s.Snapshot.HoldoutRowCount, manifestHoldoutRows: manifestHoldout, auc, meanPredictedMinusObserved: drift },
      Detail: `holdout ${s.Snapshot.HoldoutRowCount} rows (manifest ${manifestHoldout}), AUC ${auc.toFixed(4)}, predicted − observed ${drift.toFixed(4)} (bound +${W6_MIN_BIAS})`,
    };
  }

  /** Wilson 95% interval for a rate p observed on n rows. */
  private static wilson(p: number, n: number): readonly [number, number] {
    const z = 1.96;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    return [centre - half, centre + half];
  }

  /** The snapshot's stored class balance, checked with Core's schema; a message when it is not JSON or malformed. */
  private static classBalance(snapshot: MJTrainingSnapshotEntity): readonly ClassBalanceEntry[] | string {
    const json = snapshot.ClassBalance ? JsonParse.ParseJsonText(snapshot.ClassBalance, 'ClassBalance') : null;
    if (json !== null && !json.Ok) return `snapshot ${snapshot.ID} ClassBalance is not JSON: ${json.Errors.join('; ')}`;
    const parsed = StoreSchemas.ClassBalance.safeParse(json === null ? [] : json.Value);
    if (!parsed.success) return `snapshot ${snapshot.ID} ClassBalance is malformed: ${parsed.error.issues[0]?.message || 'unknown'}`;
    return parsed.data;
  }

  /** Locked-holdout rows whose row id is also a development row of the same manifest. */
  private static sharedRowIds(manifest: readonly SnapshotRowKey[]): number {
    const dev = new UUIDSet(manifest.filter((k) => k.role === 'development').map((k) => k.rowId));
    return manifest.filter((k) => k.role === 'locked-holdout' && dev.Has(k.rowId)).length;
  }

  /** How many of the given scenario rows have Target 1, read from the scenario table in one read; a message on a failed read. */
  private static async scenarioPositives(h: TruthHarness, scenario: string, rowIds: readonly string[]): Promise<number | string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<{ ID: string; Target: number | null }>(
      { EntityName: UnitFixtures.TruthEntityName(h, `Scn_${scenario}`), Fields: ['ID', 'Target'], ResultType: 'simple', IgnoreMaxRows: true }, h.User);
    if (!r.Success) return `Scn_${scenario} could not be read: ${r.ErrorMessage}`;
    const wanted = new UUIDSet(rowIds);
    return r.Results.filter((row) => wanted.Has(row.ID) && row.Target === 1).length;
  }

  /**
   * C2 → S2.5: holdout positive rate inside the population interval; resampling only in-fold; 0 row ids shared. The
   * holdout is the manifest's locked-holdout rows and its positives are read from the scenario table; the stored carve
   * summary must agree with both.
   */
  public static async MeasureC2HoldoutRate(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'scenario', ID: 'C2', Seed: UnitFixtures.ScenarioBaseSeed('C2') });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionScenarioUnitPipeline(h, 'C2', { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 }, { DateColumn: null, GroupKey: null, Protocol: { Kind: 'seeded-random', Fraction: 0.25 } });
    const s = await EvaluationProtocolGates.trainAndRead(h, pipeline);
    if (typeof s === 'string') return EvaluationProtocolGates.fail(s);
    const balance = EvaluationProtocolGates.classBalance(s.Snapshot);
    if (typeof balance === 'string') return EvaluationProtocolGates.fail(balance);
    const population = balance.reduce((t, b) => t + b.rows, 0);
    const popRate = (balance.find((b) => b.label === '1')?.rows || 0) / population;
    const holdIds = s.Manifest.filter((k) => k.role === 'locked-holdout').map((k) => k.rowId);
    const positives = await EvaluationProtocolGates.scenarioPositives(h, 'C2', holdIds);
    if (typeof positives === 'string') return EvaluationProtocolGates.fail(positives);
    const holdRows = holdIds.length;
    const holdRate = positives / holdRows;
    const carveAgrees = s.Results.carve?.holdoutRowCount === holdRows && (s.Results.carve?.holdoutClassCounts?.['1'] || 0) === positives;
    const [lo, hi] = EvaluationProtocolGates.wilson(popRate, holdRows);
    const shared = EvaluationProtocolGates.sharedRowIds(s.Manifest);
    const inFoldRun = await PsGatePytest.Run([IN_FOLD_RESAMPLING_NODE]);
    const inFold = EvaluationProtocolGates.pytestPassed(inFoldRun);
    return {
      Passed: holdRows > 0 && holdRate >= lo && holdRate <= hi && shared === 0 && inFold && carveAgrees,
      Measured: {
        populationRows: population, populationRate: popRate, holdoutRows: holdRows, holdoutPositives: positives, holdoutRate: holdRate, lower: lo, upper: hi,
        sharedRowIds: shared, inFoldResampling: inFold, carveAgreesWithManifest: carveAgrees,
      },
      Detail: `holdout ${positives} of ${holdRows} manifest rows positive, rate ${holdRate.toFixed(4)} in [${lo.toFixed(4)}, ${hi.toFixed(4)}]; carve summary agrees=${carveAgrees}; ${shared} shared row ids; in-fold node ${inFoldRun.Passed} of ${inFoldRun.Collected} passed`,
    };
  }

  /** SHA-256 hex of a group-key set as the new-entity summary documents it: distinct keys, ordinal sort, `\n`-joined, UTF-8. */
  private static groupKeysSha256(keys: readonly string[]): string {
    return createHash('sha256').update([...new Set(keys)].sort(OrdinalCompare).join('\n'), 'utf8').digest('hex');
  }

  /** The newest `fraction` of groups by first decision date (ties by key, at least one), from the manifest rows. */
  private static newestGroups(manifest: readonly SnapshotRowKey[], fraction: number): { readonly Groups: number; readonly Held: ReadonlySet<string> } {
    const firstSeen = new Map<string, string>();
    for (const k of manifest) {
      const key = k.groupKey || '';
      const prev = firstSeen.get(key);
      if (prev === undefined || k.decisionDate < prev) firstSeen.set(key, k.decisionDate);
    }
    const newestFirst = [...firstSeen.entries()].sort((a, b) => OrdinalCompare(b[1], a[1]) || OrdinalCompare(a[0], b[0]));
    return { Groups: newestFirst.length, Held: new Set(newestFirst.slice(0, Math.max(1, Math.round(fraction * newestFirst.length))).map(([key]) => key)) };
  }

  /**
   * Measures a new-entity report against a stored manifest (no holdout end, so the manifest holds every carved row):
   * rebuilds the held set and the training groups from the manifest, verifies both against the report's stored hashes
   * (the documented encoding, computed here independently of the product), measures the held groups among the verified
   * training groups, and compares the report's counts.
   */
  public static MeasureNewEntityFromManifest(manifest: readonly SnapshotRowKey[], cutoff: string, fraction: number, report: NewEntityReport): NewEntityManifestMeasurement {
    const { Groups: groups, Held: held } = EvaluationProtocolGates.newestGroups(manifest, fraction);
    const trainingGroups = new Set<string>();
    let training = 0;
    let holdout = 0;
    for (const k of manifest) {
      const key = k.groupKey || '';
      if (held.has(key)) { if (k.decisionDate >= cutoff) holdout++; }
      else if (k.role === 'development') { training++; trainingGroups.add(key); }
    }
    const heldOk = EvaluationProtocolGates.groupKeysSha256([...held]) === report.heldGroupKeysSha256;
    const trainingOk = EvaluationProtocolGates.groupKeysSha256([...trainingGroups]) === report.trainingGroupKeysSha256;
    const excluded = manifest.length - training - holdout;
    return {
      Groups: groups, HeldGroups: held.size, TrainingRows: training, HoldoutRows: holdout, ExcludedRows: excluded,
      HeldMembershipMatches: heldOk, TrainingMembershipMatches: trainingOk,
      SharedEntityKeys: heldOk && trainingOk ? [...held].filter((g) => trainingGroups.has(g)).length : -1,
      CountsMatch: report.holdoutEntityKeys === held.size && report.trainingRowCount === training && report.holdoutRowCount === holdout && report.excludedRowCount === excluded,
    };
  }

  /** Whether a measurement passes: both memberships verified, 0 shared keys, the report agreeing, groups not rows. */
  public static NewEntityPassed(m: NewEntityManifestMeasurement, report: NewEntityReport, manifestRows: number): boolean {
    return m.Groups < manifestRows && m.HeldMembershipMatches && m.TrainingMembershipMatches && m.SharedEntityKeys === 0
      && report.sharedEntityKeys === m.SharedEntityKeys && m.CountsMatch && m.HoldoutRows > 0 && m.TrainingRows > 0;
  }

  /**
   * The new-entity gate body shared by T2p and C1: the manifest measurement (membership verified by the stored hashes,
   * shared keys measured on the verified sets, counts compared) and the inner-fold pytest nodes.
   */
  private static async newEntityGate(h: TruthHarness, fraction: number, provision: () => Promise<ProvisionedUnitPipeline>): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await provision();
    const s = await EvaluationProtocolGates.trainAndRead(h, pipeline);
    if (typeof s === 'string') return EvaluationProtocolGates.fail(s);
    const carve = s.Results.carve;
    const report = carve?.newEntity || null;
    if (carve === null || report === null || carve.cutoff === null) return EvaluationProtocolGates.fail('the stored carve has no new-entity report');
    if (carve.holdoutEnd !== null) return EvaluationProtocolGates.fail(`the carve has a holdout end (${carve.holdoutEnd}): the manifest does not hold every carved row`);
    if (s.Manifest.some((k) => k.groupKey === null)) return EvaluationProtocolGates.fail('a manifest row has no group key');
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(s.Manifest, carve.cutoff, fraction, report);
    const foldRun = await PsGatePytest.Run(FOLD_NODES);
    const folds = EvaluationProtocolGates.pytestPassed(foldRun) && foldRun.Collected === FOLD_NODES.length;
    return {
      Passed: EvaluationProtocolGates.NewEntityPassed(m, report, s.Manifest.length) && folds,
      Measured: {
        manifestRows: s.Manifest.length, groups: m.Groups, heldGroups: m.HeldGroups, heldMembershipMatches: m.HeldMembershipMatches,
        trainingMembershipMatches: m.TrainingMembershipMatches, sharedEntityKeys: m.SharedEntityKeys, reportSharedEntityKeys: report.sharedEntityKeys,
        trainingRows: m.TrainingRows, holdoutRows: m.HoldoutRows, excludedRows: m.ExcludedRows, reportTrainingRows: report.trainingRowCount,
        reportHoldoutRows: report.holdoutRowCount, reportCountsMatch: m.CountsMatch, innerFoldsDisjoint: folds,
      },
      Detail: `held set rebuilt from the manifest: ${m.HeldGroups} of ${m.Groups} groups (${s.Manifest.length} rows), stored membership held=${m.HeldMembershipMatches} training=${m.TrainingMembershipMatches}; ${m.SharedEntityKeys} held groups among the training groups (report ${report.sharedEntityKeys}); rows ${m.TrainingRows} / ${m.HoldoutRows}, report counts match=${m.CountsMatch}; fold nodes ${foldRun.Passed} of ${foldRun.Collected} passed`,
    };
  }

  /** T2p → S2.6: the stored held and training entity sets verified against the manifest, 0 shared, inner folds disjoint. */
  public static async MeasureT2pNewEntity(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'scenario', ID: 'T2p', Seed: UnitFixtures.ScenarioBaseSeed('T2p') });
    return EvaluationProtocolGates.newEntityGate(h, T2P_NEW_ENTITY_FRACTION, () => UnitFixtures.ProvisionScenarioUnitPipeline(h, 'T2p', { kind: 'continuous' }, {
      DateColumn: 'T', GroupKey: 'EntityKey', Protocol: { Kind: 'year-cutoff', NewEntityFraction: T2P_NEW_ENTITY_FRACTION },
    }));
  }

  /** C1 → S2.6: the same on C1's members (no holdout end, so the manifest holds every carved row). */
  public static async MeasureC1NewEntity(h: TruthHarness): Promise<GateMeasurement> {
    return EvaluationProtocolGates.newEntityGate(h, C1_NEW_ENTITY_FRACTION, () => UnitFixtures.ProvisionC1RenewalPipeline(h, {
      Kind: 'explicit',
      Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: C1_CUTOFF, holdoutEnd: null, newEntityReport: { groupKey: 'PersonID', holdoutFraction: C1_NEW_ENTITY_FRACTION } },
    }));
  }
}
