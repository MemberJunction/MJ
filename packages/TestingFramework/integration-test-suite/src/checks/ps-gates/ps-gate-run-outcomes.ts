/**
 * The per-training-run reading of G0.2 and G0.3 (§4.1, D4-56): every training run of a builder-agent run is consistent
 * with its stored gate outcome. A run whose model reached `Published` is consistent when the model's stored `model`
 * decision is what `PublishRules.ReverifyPublish` re-derives from the stored rows and a `publish` record names the run
 * (`ContainmentProbe.ReverifiesStoredDecision`); every other run is consistent when a `publish` or `refusal` record
 * names it with its reason (`ContainmentProbe.RunOutcomeRecorded`, §5.7 R4).
 */
import { RunView } from '@memberjunction/core';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID } from '@memberjunction/global';
import { ContainmentProbe, type CandidateModel, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The training-run columns the reading needs. */
type AgentTrainingRun = Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID'>;

/** One training run of an agent run, classified. */
export interface RunOutcome {
  /** The training run. */
  readonly TrainingRunID: string;
  /** Its model, or null for a run with no model row (no-signal, a kept rule). */
  readonly ModelID: string | null;
  /** True when its model reached `Published`. */
  readonly Published: boolean;
  /** True when the run is consistent with its stored gate outcome. */
  readonly Consistent: boolean;
  /** For an inconsistent run: what is missing or differs; empty otherwise. */
  readonly Missing: string;
  /** The model's stored gate outcome (`model`, `keep-simple-baseline`, `no-signal`), or `none` (no model, or none stored). */
  readonly StoredOutcome: string;
  /** For a run not Published: the refusal kinds of the refusal records naming it (e.g. `unacknowledged-leakage-flags`); empty otherwise. */
  readonly RefusalKinds: readonly string[];
}

/** Reads and classifies the training runs of one builder-agent run. */
export class AgentRunOutcomes {
  /**
   * Every training run of the agent run's pipelines, each classified; `name` is the pipelines' name prefix (the
   * harness's model reader). Throws when the agent run left no training run: a run that stores nothing would pass.
   */
  public static async Classify(h: TruthHarness, label: string, name: string, pipelineIds: readonly string[]): Promise<RunOutcome[]> {
    const runs = await AgentRunOutcomes.trainingRuns(h, pipelineIds);
    if (runs.length === 0) throw new Error(`${label}: the builder agent run left no training run`);
    const models = IndexByUUID(await h.ModelsForPipelineNamePrefix(name), (m) => m.ModelID);
    const out: RunOutcome[] = [];
    for (const run of runs) out.push(await AgentRunOutcomes.classifyRun(h, run, run.ResultingModelID ? models.Get(run.ResultingModelID) || null : null));
    return out;
  }

  /** One run: a Published model must re-derive its stored decision; any other run must carry its outcome record. */
  private static async classifyRun(h: TruthHarness, run: AgentTrainingRun, model: CandidateModel | null): Promise<RunOutcome> {
    const stored = model === null ? null : ContainmentProbe.ReadStoredGateDecision(model);
    const base = { TrainingRunID: run.ID, ModelID: model === null ? null : model.ModelID, StoredOutcome: stored === null ? 'none' : stored.outcome };
    if (model !== null && ContainmentProbe.ReachedPublishedUnattended(model)) {
      const check = await ContainmentProbe.ReverifiesStoredDecision(model, h);
      return { ...base, Published: true, Consistent: check.Reverified, Missing: check.Reverified ? '' : check.Why, RefusalKinds: [] };
    }
    const recorded = await ContainmentProbe.RunOutcomeRecorded(run.ID, h);
    const refusalKinds = await ContainmentProbe.ReadRefusalKinds(run.ID, h);
    return { ...base, Published: false, Consistent: recorded, RefusalKinds: refusalKinds, Missing: recorded ? '' : `no publish or refusal record with its reason (model ${model === null ? 'none' : `${model.ModelID} ${model.Status}`})` };
  }

  /** The training runs of the agent run's pipelines, read past the cache. */
  private static async trainingRuns(h: TruthHarness, pipelineIds: readonly string[]): Promise<AgentTrainingRun[]> {
    if (pipelineIds.length === 0) return [];
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<AgentTrainingRun>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID IN (${pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      Fields: ['ID', 'ResultingModelID'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading the agent run's training runs failed: ${r.ErrorMessage}`);
    return r.Results;
  }
}
