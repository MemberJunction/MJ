/**
 * `PublishRules.ReverifyPublish` beyond the review's checks (§6.2a, D4-42, D4-16): the decision is re-derived with
 * PR 3's guarded gate (`GateRules.DecideGuardedGate`), a keep-simple-baseline outcome publishes only under
 * `autoPublishKeepBaseline` or for a human initiator, and IDs compare with `UUIDsEqual`.
 */
import { describe, it, expect } from 'vitest';
import { PublishRules, type StoredPublishInputs } from '../registry-contracts';
import { RegistryInputs as R } from './fixtures/registry-inputs';

const AGENT_RUN = R.AgentRun;
const USER = R.User;

/** A stored `model` outcome that passes every check (agent-initiated: a model outcome publishes automatically). */
function Stored(): StoredPublishInputs {
  return R.ModelPublish();
}

/** The guard inputs of {@link Stored}. */
function Guards(): StoredPublishInputs['GateGuards'] {
  return R.Guards();
}

/** A stored keep-simple-baseline outcome (the GLM is registered) with `change` applied. */
function StoredKeepSimple(change: Partial<StoredPublishInputs>): StoredPublishInputs {
  return { ...R.KeepPublish(), ...change };
}

const WithPromotion = R.WithPromotion;

describe('PublishRules.ReverifyPublish — the guarded gate', () => {
  it('a stored model outcome publishes the finalist for an agent initiator and returns the re-derived gate', () => {
    expect(PublishRules.ReverifyPublish(Stored())).toMatchObject({ Ok: true, Shipped: 'xgb', ArtifactSha256: 'h-xgb', Replaces: R.IncumbentID, Gate: { outcome: 'model' } });
  });
  it('ReverifyPublish: a guard that downgrades the stored intervals to no-signal is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...Stored(), GateGuards: { ...Guards(), minMinorityClassRows: 10_000 } }))
      .toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
  });
  it('ReverifyPublish: a model whose AUC interval contains 0.5 is refused gate-no-signal, naming the guard', () => {
    const r = PublishRules.ReverifyPublish({ ...Stored(), GateGuards: { ...Guards(), modelAucInterval: { level: 0.95, lower: 0.45, upper: 0.6 } } });
    expect(r).toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
    expect(!r.Ok && r.Detail).toContain('auc-interval-contains-chance');
  });
  it('ReverifyPublish: a model with no stored AUC interval is refused gate-no-signal', () => {
    expect(PublishRules.ReverifyPublish({ ...Stored(), GateGuards: { ...Guards(), modelAucInterval: null } })).toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
  });
  it('ReverifyPublish: the minority-class guard also refuses a keep-simple-baseline outcome', () => {
    const keep = StoredKeepSimple({ GateGuards: { ...Guards(), holdoutClassCounts: { Lapsed: 5, Renewed: 150 } } });
    expect(PublishRules.ReverifyPublish(keep)).toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
  });
});

describe('PublishRules.ReverifyPublish — keep-simple-baseline (D-031, D4-16)', () => {
  it('ReverifyPublish: keep-simple-baseline publishes only under autoPublishKeepBaseline or for a human initiator', () => {
    const keep = StoredKeepSimple({ Initiator: { kind: 'agent', agentRunId: AGENT_RUN } });
    expect(PublishRules.ReverifyPublish(keep)).toMatchObject({ Ok: false, Reason: 'keep-baseline-not-auto-published' });
    expect(PublishRules.ReverifyPublish(WithPromotion(keep, { autoPublishKeepBaseline: true }))).toMatchObject({ Ok: true });
    expect(PublishRules.ReverifyPublish({ ...keep, Initiator: { kind: 'human', userId: USER } })).toMatchObject({ Ok: true });
  });
  it('ReverifyPublish: an automated system or scheduled-job initiator is refused the same way', () => {
    for (const Initiator of [{ kind: 'system', component: 'auto-train', processRunId: 'p-1' }, { kind: 'scheduled-job', scheduledJobRunId: 'j-1' }] as const) {
      expect(PublishRules.ReverifyPublish(StoredKeepSimple({ Initiator }))).toMatchObject({ Ok: false, Reason: 'keep-baseline-not-auto-published' });
    }
  });
  it('ReverifyPublish: a stored-data mismatch is reported before the keep-baseline rule', () => {
    const keep = StoredKeepSimple({ Initiator: { kind: 'agent', agentRunId: AGENT_RUN }, RegisteredDelivery: { Shipped: 'glm', ArtifactSha256: 'h-other' } });
    expect(PublishRules.ReverifyPublish(keep)).toMatchObject({ Ok: false, Reason: 'delivery-mismatch' });
  });
  it('autoPublishKeepBaseline does not exempt a keep-simple-baseline model from the incumbent test', () => {
    const keep = WithPromotion(StoredKeepSimple({ IncumbentDiff: { incumbentModelId: R.IncumbentID, value: 0, lower: -0.01, upper: 0.01 } }), { autoPublishKeepBaseline: true });
    expect(PublishRules.ReverifyPublish(keep)).toMatchObject({ Ok: false, Reason: 'does-not-beat-incumbent' });
  });
});

describe('PublishRules.ReverifyPublish — IDs compare with UUIDsEqual', () => {
  it('an upper-case stored protocol ID matches the lower-case pinned ID', () => {
    const s = Stored();
    expect(PublishRules.ReverifyPublish({ ...s, ProtocolRow: { ...s.ProtocolRow, ID: s.ProtocolRow.ID.toUpperCase() } })).toMatchObject({ Ok: true });
  });
  it('an upper-case current Published model ID matches the lower-case stored incumbent ID', () => {
    expect(PublishRules.ReverifyPublish({ ...Stored(), CurrentPublishedModelID: R.IncumbentID.toUpperCase() })).toMatchObject({ Ok: true });
  });
});
