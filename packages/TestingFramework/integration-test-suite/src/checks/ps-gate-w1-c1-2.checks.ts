/**
 * Gate G3.11 "W1 → C1.2" (owner PR 4, phase 3): an agent's write of a gate threshold, a margin, a leakage flag or the
 * holdout policy is refused, 4 of 4. The agent is a Pipeline Builder run on W1-signal s42 (it trains its pipeline and
 * binds the pipeline's protocol); its writes, against that run's own rows:
 *
 * - a stored leakage flag: the finished training run's `ValidationResults` with its trainer leakage flags changed,
 *   written by the agent's write tool (`Write Entity Field(s)` through `RunAction` on MJAPI) — refused by the evidence
 *   guard (stored evidence is write-once);
 * - the protocol's `promotion.margin`, its `minMinorityClassRows` (the gate threshold) and its `holdout`: each a new
 *   version of the pipeline's protocol saved through MJAPI authored `{ kind: 'agent', agentRunId }` (the builder's
 *   agent run) — refused by the protocol's guard-field author rule.
 *
 * The protocol keeps its one version and the run's stored results are unchanged afterwards.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLTrainingPipelineEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import {
  EvaluationProtocol, TrainingRunResultsParser, type Actor, type EvaluationProtocolDraft, type EvaluationProtocolSpec, type HoldoutSplit, type LeakageFlag,
} from '@memberjunction/predictive-studio-core';
import { EvaluationProtocolVersioning } from '@memberjunction/predictive-studio';
import { AgentPlans, UnitFixtures, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';
import { StatusWritePaths } from './ps-gates/ps-gate-status-writes';

/** A finished training run of the agent's pipelines and the lineage root of the protocol its pipeline is bound to. */
interface AgentRows {
  readonly Run: Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>;
  readonly ProtocolRootID: string;
}
/** The words of the protocol's refusal of an agent-authored guard-field change (`DescribeProtocolRefusal`). */
const AGENT_GUARD_REFUSAL = 'An agent tool call cannot change the guard fields';
/** The words of the evidence guard's refusal of a stored-evidence change. */
const WRITE_ONCE_REFUSAL = 'stored evidence is write-once';

/** One agent-authored write and what the platform answered. */
interface AgentWrite {
  readonly Write: 'leakage-flag' | 'margin' | 'gate-threshold' | 'holdout';
  readonly Refused: boolean;
  readonly Message: string;
}

/** G3.11's writes and reads. */
class PsGateW1C12Steps {
  /** The finished run's stored results with its trainer leakage flags changed (cleared when it has some, else one added). */
  public static WithChangedLeakageFlags(validationResults: string | null, column: string): string {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
    if (parsed.Ok === false) throw new Error(`the run's ValidationResults do not parse: ${parsed.Errors.join('; ')}`);
    const results = parsed.Value;
    if (results.status !== 'completed' || results.trainer === null) throw new Error(`the run stored no trainer result (status ${results.status})`);
    const added: LeakageFlag = { kind: 'drop-column', sourceColumn: column, scoreDrop: 0.5 };
    const flags: readonly LeakageFlag[] = results.trainer.leakageFlags.length > 0 ? [] : [added];
    return JSON.stringify({ ...results, trainer: { ...results.trainer, leakageFlags: flags } });
  }

  /** The leakage-flag write, through the agent's write tool on MJAPI. */
  public static async WriteLeakageFlag(h: TruthHarness, run: Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>): Promise<AgentWrite> {
    const changed = PsGateW1C12Steps.WithChangedLeakageFlags(run.ValidationResults, W_WORLD_FEATURES[0]);
    const call = await StatusWritePaths.RunAgentWriteTool(h, 'MJ: ML Training Runs', { ID: run.ID }, { ValidationResults: changed });
    return { Write: 'leakage-flag', Refused: !call.Saved && call.Message.includes(WRITE_ONCE_REFUSAL), Message: call.Saved ? 'saved' : call.Message };
  }

  /** The builder agent's finished training run and its pipeline's protocol lineage; throws when the run left neither. */
  public static async AgentRows(h: TruthHarness, pipelineIds: readonly string[]): Promise<AgentRows> {
    const list = pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    if (list.length === 0) throw new Error('G3.11: the builder run created no pipeline');
    const rv = RunView.FromMetadataProvider(h.Provider);
    const runs = await rv.RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'PipelineID' | 'ValidationResults'>>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID IN (${list}) AND Status='Completed'`, Fields: ['ID', 'PipelineID', 'ValidationResults'], OrderBy: '__mj_CreatedAt', ResultType: 'simple', BypassCache: true,
    }, h.User);
    const run = runs.Results[0];
    if (!runs.Success || !run) throw new Error(`G3.11: the builder's pipelines have no completed training run: ${runs.ErrorMessage || 'none'}`);
    const pipelines = await rv.RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'EvaluationProtocolID'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(run.PipelineID)}'`, Fields: ['ID', 'EvaluationProtocolID'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    const protocolId = pipelines.Results[0]?.EvaluationProtocolID;
    if (!pipelines.Success || !protocolId) throw new Error(`G3.11: the builder's pipeline ${run.PipelineID} is bound to no Evaluation Protocol`);
    const protocols = await rv.RunView<Pick<MJMLEvaluationProtocolEntity, 'ID' | 'LineageRootID'>>({
      EntityName: 'MJ: ML Evaluation Protocols', ExtraFilter: `ID='${EscapeSQLString(protocolId)}'`, Fields: ['ID', 'LineageRootID'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    const root = protocols.Results[0]?.LineageRootID;
    if (!protocols.Success || !root) throw new Error(`G3.11: Evaluation Protocol ${protocolId} could not be read: ${protocols.ErrorMessage || 'no row'}`);
    return { Run: run, ProtocolRootID: root };
  }

  /** A different holdout of the same kind (one year earlier, five points more rows, or one origin more). */
  public static ChangedHoldout(holdout: HoldoutSplit): HoldoutSplit {
    switch (holdout.kind) {
      case 'date-carved': {
        const year = Number(holdout.cutoff.slice(0, 4));
        return { ...holdout, cutoff: `${year - 1}${holdout.cutoff.slice(4)}` };
      }
      case 'seeded-random':
        return { ...holdout, fraction: holdout.fraction + 0.05 };
      case 'rolling-origin':
        return { ...holdout, origins: holdout.origins + 1 };
    }
  }

  /** The three guard-field changes, over the protocol's latest version. */
  public static GuardFieldChanges(spec: EvaluationProtocolSpec): ReadonlyArray<{ readonly Write: AgentWrite['Write']; readonly Changes: Partial<EvaluationProtocolDraft> }> {
    return [
      { Write: 'margin', Changes: { promotion: { ...spec.promotion, margin: EvaluationProtocol.ToNonNegative(spec.promotion.margin + 0.01) } } },
      { Write: 'gate-threshold', Changes: { minMinorityClassRows: spec.minMinorityClassRows + 5 } },
      { Write: 'holdout', Changes: { holdout: PsGateW1C12Steps.ChangedHoldout(spec.holdout) } },
    ];
  }

  /** The newest version of the protocol lineage rooted at `rootId`. */
  public static async LatestVersion(h: TruthHarness, rootId: string): Promise<MJMLEvaluationProtocolEntity> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<MJMLEvaluationProtocolEntity>(
      { EntityName: 'MJ: ML Evaluation Protocols', ExtraFilter: `LineageRootID='${EscapeSQLString(rootId)}'`, OrderBy: 'Version DESC', MaxRows: 1, ResultType: 'entity_object', BypassCache: true },
      h.User,
    );
    const latest = r.Results[0];
    if (!r.Success || !latest) throw new Error(`reading the protocol lineage ${rootId}: ${r.ErrorMessage || 'no version'}`);
    return latest;
  }

  /** One agent-authored protocol version, saved through MJAPI; a saved one is recorded for teardown. */
  public static async WriteProtocolVersion(h: TruthHarness, rootId: string, write: AgentWrite['Write'], changes: Partial<EvaluationProtocolDraft>, agent: Actor): Promise<AgentWrite> {
    const latest = await PsGateW1C12Steps.LatestVersion(h, rootId);
    try {
      const saved = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(latest, changes, agent, UnitFixtures.EntityFactory(h), h.User);
      h.Created.RecordEvaluationProtocol(saved.ID);
      return { Write: write, Refused: false, Message: `saved as version ${saved.Version}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { Write: write, Refused: message.includes(AGENT_GUARD_REFUSAL), Message: message };
    }
  }

  /** The training run's stored results, read back. */
  public static async StoredResults(h: TruthHarness, runId: string): Promise<string | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'ValidationResults'], ResultType: 'simple', BypassCache: true }, h.User);
    if (!r.Success || !r.Results[0]) throw new Error(`reading training run ${runId}: ${r.ErrorMessage || 'no row'}`);
    return r.Results[0].ValidationResults;
  }
}

export const PsGateW1C12Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-c1-2.G3.11', Name: 'G3.11 W1 → C1.2: an agent\'s write of a leakage flag, a margin, the gate threshold or the holdout is refused, 4 of 4', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const build = await h.RunBuilderAgent(AgentPlans.Build({
        Name: `PSTruth: G3.11 W1 s42 ${h.RunID}`, Entity: w1.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES], Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
      }));
      if (!build.AgentSuccess || !build.AgentRunID) throw new Error(`G3.11: builder agent run ${build.AgentRunID || '(none)'} failed: ${build.AgentErrorMessage || 'no error message'}`);
      const rows = await PsGateW1C12Steps.AgentRows(h, build.PipelineIDs);
      const rootId = rows.ProtocolRootID;
      const agent: Actor = { kind: 'agent', agentRunId: build.AgentRunID };
      const spec = EvaluationProtocol.ParseEvaluationProtocolRow(await PsGateW1C12Steps.LatestVersion(h, rootId));
      if (spec.Ok === false) throw new Error(`G3.11: the protocol does not parse: ${spec.Errors.join('; ')}`);
      const versionsBefore = (await PsGateW1C12Steps.LatestVersion(h, rootId)).Version;
      const run = rows.Run;
      const writes: AgentWrite[] = [await PsGateW1C12Steps.WriteLeakageFlag(h, run)];
      for (const c of PsGateW1C12Steps.GuardFieldChanges(spec.Value)) writes.push(await PsGateW1C12Steps.WriteProtocolVersion(h, rootId, c.Write, c.Changes, agent));
      const refused = writes.filter((w) => w.Refused).length;
      const versions = (await PsGateW1C12Steps.LatestVersion(h, rootId)).Version;
      const resultsUnchanged = (await PsGateW1C12Steps.StoredResults(h, run.ID)) === run.ValidationResults;
      PsGate.Assert({
        Passed: writes.length === 4 && refused === 4 && versions === versionsBefore && resultsUnchanged,
        Measured: {
          writes: writes.length, refused, protocolVersionsBefore: versionsBefore, protocolVersions: versions, storedResultsUnchanged: resultsUnchanged, agentRunId: build.AgentRunID,
          outcomes: writes.map((w) => `${w.Write}:${w.Refused ? 'refused' : `not refused (${w.Message.slice(0, 160)})`}`).join(' | '),
        },
        Detail: `${refused} of 4 agent-authored writes refused (leakage flag, margin, gate threshold, holdout); the protocol has ${versions} version(s), `
          + `the run's stored results ${resultsUnchanged ? 'unchanged' : 'changed'}`,
      });
    },
  },
];

for (const c of PsGateW1C12Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-c1-2', PsGate.Lifecycle);
