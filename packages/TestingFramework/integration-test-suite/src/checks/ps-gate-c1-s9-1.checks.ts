/**
 * Gate G3.6 "C1 → S9.1" (owner PR 4, phase 3): 100% of the `Published` models in the suite database have a publish
 * record naming the approver (the automated gate or a named user), the time, the gate decision and the evidence
 * snapshot (holdout with its interval, a baseline comparison, the leakage audit, the data window and the snapshot
 * hash). The audit is the whole database, unfiltered; before measuring, the gate publishes the W1-signal s42 fixture
 * through the lifecycle gate as the suite user, and one Pipeline Builder run on W1-signal s42 publishes automatically
 * (D4-125): W1 s42's stored decision keeps the simple baseline, so the run builds under a supplied protocol with
 * `autoPublishKeepBaseline: true` (the owner's ruling of 2026-11-16, OF4-30), and its model is approved by the
 * `automated-gate`. A clean database therefore holds a Published model of each approver kind.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, RunFixtures, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type CandidateModel, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PublishRecordAudit, type PublishedModelRecord } from './ps-gates/ps-gate-publish-records';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** G3.6's words. */
class PsGateC1S91Steps {
  /** Every incomplete model's ID and what its record lacks; "none" when every record is complete. */
  public static Incomplete(published: readonly PublishedModelRecord[]): string {
    const incomplete = published.filter((m) => !PublishRecordAudit.HasCompleteRecord(m));
    return incomplete.length === 0 ? 'none' : incomplete.map((m) => PsGateC1S91Steps.Describe(m)).join('; ');
  }

  /** One incomplete model in words: it has no publish record, or its record lacks the named fields. */
  public static Describe(m: PublishedModelRecord): string {
    const name = `${m.ModelID} (${m.Name})`;
    return m.Record === null ? `${name} has no publish record` : `${name}: its record lacks ${PublishRecordAudit.Lacks(m).join(', ')}`;
  }

  /** The records' approver kinds with their counts (`user:1`), so a run shows whether an automatic publish was audited. */
  public static Approvers(published: readonly PublishedModelRecord[]): string {
    const counts = new Map<string, number>();
    for (const m of published) {
      const kind = m.Record === null ? 'no-record' : m.Record.ApproverKind;
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    return [...counts.entries()].map(([k, n]) => `${k}:${n}`).join(' ') || 'none';
  }

  /**
   * One Pipeline Builder run on W1-signal s42 with publishing on, under a protocol that publishes a kept baseline: its
   * model must reach Published (the automatic publish the audit counts); throws naming the run's outcome otherwise.
   */
  public static async AutomaticallyPublishedModel(h: TruthHarness): Promise<CandidateModel> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const run = await h.RunBuilderAgent(AgentPlans.Build({
      Name: `PSTruth: G3.6 W1 s42 automatic ${h.RunID}`, Entity: w1.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES],
      Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
    }), { AutoPublishKeepBaseline: true });
    if (!run.AgentSuccess || !run.BuildModelID) {
      throw new Error(`G3.6: the automatic-publish builder run ${run.AgentRunID || '(none)'} built no model: ${run.AgentErrorMessage || run.BuildErrorMessage || 'no error message'}`);
    }
    const model = await h.ReadModel(run.BuildModelID);
    if (!ContainmentProbe.ReachedPublishedUnattended(model)) throw new Error(`G3.6: the automatic-publish builder run left ML Model ${model.ModelID} ${model.Status}, not Published`);
    return model;
  }
}

export const PsGateC1S91Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s9-1.G3.6', Name: 'G3.6 C1 → S9.1: every Published model has a publish record naming the approver, the time, the gate decision and the evidence snapshot, 100%', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const fixture = await RunFixtures.W1S42PublishedModel(h);
      const automatic = await PsGateC1S91Steps.AutomaticallyPublishedModel(h);
      const published = await PublishRecordAudit.PublishedModels(h);
      const complete = published.filter((m) => PublishRecordAudit.HasCompleteRecord(m)).length;
      const incomplete = PsGateC1S91Steps.Incomplete(published);
      PsGate.Assert({
        Passed: published.length > 0 && complete === published.length,
        Measured: { published: published.length, withCompletePublishRecord: complete, approvers: PsGateC1S91Steps.Approvers(published), fixtureModelId: fixture.ModelID, automaticModelId: automatic.ModelID, incomplete },
        Detail: `${complete} of ${published.length} Published models have a publish record with approver, time, gate decision and evidence; incomplete: ${incomplete}`,
      });
    },
  },
];

for (const c of PsGateC1S91Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s9-1', PsGate.Lifecycle);
