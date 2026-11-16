/**
 * Gate G3.6 "C1 → S9.1" (owner PR 4, phase 3): 100% of the `Published` models in the suite database have a publish
 * record naming the approver (the automated gate or a named user), the time, the gate decision and the evidence
 * snapshot (holdout with its interval, a baseline comparison, the leakage audit, the data window and the snapshot
 * hash). The audit is the whole database, unfiltered; before measuring, the gate publishes the W1-signal s42 fixture
 * through the lifecycle gate, so a clean database still holds one Published model.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PublishRecordAudit, type PublishedModelRecord } from './ps-gates/ps-gate-publish-records';

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
}

export const PsGateC1S91Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s9-1.G3.6', Name: 'G3.6 C1 → S9.1: every Published model has a publish record naming the approver, the time, the gate decision and the evidence snapshot, 100%', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const fixture = await RunFixtures.W1S42PublishedModel(h);
      const published = await PublishRecordAudit.PublishedModels(h);
      const complete = published.filter((m) => PublishRecordAudit.HasCompleteRecord(m)).length;
      const incomplete = PsGateC1S91Steps.Incomplete(published);
      PsGate.Assert({
        Passed: published.length > 0 && complete === published.length,
        Measured: { published: published.length, withCompletePublishRecord: complete, approvers: PsGateC1S91Steps.Approvers(published), fixtureModelId: fixture.ModelID, incomplete },
        Detail: `${complete} of ${published.length} Published models have a publish record with approver, time, gate decision and evidence; incomplete: ${incomplete}`,
      });
    },
  },
];

for (const c of PsGateC1S91Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s9-1', PsGate.Lifecycle);
