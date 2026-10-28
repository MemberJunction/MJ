/**
 * Shared inputs of the Predictive Studio containment gate bundles: the W-world pipeline spec, the dataset reference
 * narrowing, and the W1 s42 record-process scoring G0.4 and G0.5 both read. The source texts G0.6 judges are in
 * ps-gate-source-texts.ts.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { UUIDMap } from '@memberjunction/global';
import type { PredictiveStudioWriteBackDirective } from '@memberjunction/core-entities';
import type { OutcomeModelLike, RunDetailLike } from '@memberjunction/predictive-studio-core';
import {
  DatasetCatalog,
  RunFixtures,
  TruthSuite,
  W_WORLD_DENY_FIELDS,
  W_WORLD_FEATURES,
  type AlgorithmKey,
  type CatalogEntry,
  type DatasetRef,
  type LoadedDataset,
  type PipelineSpec,
  type TruthHarness,
} from '@memberjunction/predictive-studio-truth-suite';

/** The W1 s42 record-process scoring: its details, the model as the Predictions resource reads it, and the truth file. */
export interface W1RecordProcessScoring {
  Details: RunDetailLike[];
  Model: OutcomeModelLike;
  TruthCsv: string;
}

/** Pipeline specs, dataset references and the shared W1 record-process scoring for the PS gate bundles. */
export class PsGateSpecs {
  /** The repository root (TruthSuite → PredictiveStudio → AI → packages → root). */
  public static readonly MJRoot: string = path.resolve(TruthSuite.Root(), '../../../..');

  /** The four classification algorithms the agent-run gates offer the builder. */
  public static readonly Algorithms: readonly AlgorithmKey[] = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'];

  /**
   * The write-back mapping G0.7 scores with (the score lands in the dataset's `TruthScore` column), typed as the
   * ScoreRecordSet operation's write-back input (the explicit `OutputMapping` form).
   */
  public static readonly WriteBack: Exclude<PredictiveStudioWriteBackDirective, boolean> = { OutputMapping: { fields: { TruthScore: '$.score' } } };

  /** The W1 record-process scoring of the run `RunID`, shared by G0.4 and G0.5; cleared when the scoring fails. */
  private static w1RecordProcess: { RunID: string; Scoring: Promise<W1RecordProcessScoring> } | null = null;

  /** A W-world pipeline spec named `PSTruth: <tag> <RunID>` with the containment defaults, overridden by `over`. */
  public static W(h: TruthHarness, tag: string, dataset: LoadedDataset, over: Partial<PipelineSpec> = {}): PipelineSpec {
    return {
      Name: `PSTruth: ${tag} ${h.RunID}`,
      Dataset: dataset,
      Target: 'Renewed',
      ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES],
      Algorithm: 'logistic_regression',
      AsOf: { Mode: 'none' },
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      DenyFields: [...W_WORLD_DENY_FIELDS],
      ...over,
    };
  }

  /** The dataset reference of one catalog entry and seed; throws for a code outside the world/scenario unions. */
  public static Ref(kind: CatalogEntry['Kind'], code: string, seed: number): DatasetRef {
    if (kind === 'world' && DatasetCatalog.IsWorldID(code)) return { Kind: 'world', ID: code, Seed: seed };
    if (kind === 'scenario' && DatasetCatalog.IsScenarioID(code)) return { Kind: 'scenario', ID: code, Seed: seed };
    throw new Error(`${kind} '${code}' is not a dataset of the truth-suite catalog`);
  }

  /**
   * The W1 s42 record-process scoring of the Validated fixture model (NA, 2024), memoised per harness run (`h.RunID`):
   * G0.4 and G0.5 read the same scoring. The details and lineage are plain data, so they stay valid after a bundle's
   * teardown. A failed scoring is not memoised, so the next gate retries it instead of reporting the first one's error.
   */
  public static W1RecordProcess(h: TruthHarness): Promise<W1RecordProcessScoring> {
    const memo = PsGateSpecs.w1RecordProcess;
    if (memo && memo.RunID === h.RunID) return memo.Scoring;
    const scoring = PsGateSpecs.scoreOrForget(h);
    PsGateSpecs.w1RecordProcess = { RunID: h.RunID, Scoring: scoring };
    return scoring;
  }

  /** TrueP by MembershipYearID; throws when the truth file lacks either column (never keys rows by "undefined"). */
  public static ReadTrueP(truthCsv: string): UUIDMap<number> {
    const [header, ...rows] = readFileSync(truthCsv, 'utf8').split('\n');
    const cols = (header || '').split(',');
    const id = cols.indexOf('MembershipYearID');
    const p = cols.indexOf('TrueP');
    if (id < 0 || p < 0) throw new Error(`${truthCsv} has no MembershipYearID/TrueP columns`);
    const out = new UUIDMap<number>();
    for (const r of rows) {
      const c = r.split(',');
      const recordId = c[id];
      if (recordId) out.Set(recordId, Number(c[p]));
    }
    return out;
  }

  /** The scoring; on failure the memo for this run is cleared before the error propagates. */
  private static async scoreOrForget(h: TruthHarness): Promise<W1RecordProcessScoring> {
    try {
      return await PsGateSpecs.scoreW1RecordProcess(h);
    } catch (e) {
      if (PsGateSpecs.w1RecordProcess?.RunID === h.RunID) PsGateSpecs.w1RecordProcess = null;
      throw e;
    }
  }

  private static async scoreW1RecordProcess(h: TruthHarness): Promise<W1RecordProcessScoring> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const model = await RunFixtures.W1S42ValidatedModel(h);
    const run = await h.ScoreViaRecordProcess(model.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
    if (run.Status !== 'Completed') throw new Error(`record-process scoring ended ${run.Status}`);
    return {
      TruthCsv: path.join(w1.Dir, 'truth.csv'),
      Details: run.Details.map((d) => ({ RecordID: d.RecordID, ResultPayload: d.ResultPayload })),
      Model: { Lineage: model.LineageJSON, TargetVariable: 'Renewed', ProblemType: 'classification' },
    };
  }
}
