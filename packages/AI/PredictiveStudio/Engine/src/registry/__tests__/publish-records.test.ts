/** `PublishRecords` (Task M3.2): the evidence hash is over canonical JSON, and the finders read only the rows their index guards. */
import { describe, expect, it } from 'vitest';
import type { EvidenceSnapshot } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { PublishRecords } from '../publish-records';

const evidence: EvidenceSnapshot = {
  holdoutPrimary: { metric: 'log-loss', value: 0.4, interval: { level: 0.95, lower: 0.3, upper: 0.5 }, n: 10 },
  comparisons: { modelVsDummy: { value: 0.1, ci: [0.05, 0.15], beats: true } },
  gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
  leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' }, snapshotHash: 'a'.repeat(64),
};

describe('PublishRecords.CanonicalJson and EvidenceSha256', () => {
  it('orders keys at every level, so equal values hash equally whatever their key order', () => {
    expect(PublishRecords.CanonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}');
    const reordered: EvidenceSnapshot = { snapshotHash: evidence.snapshotHash, dataWindow: evidence.dataWindow, leakageFlags: [], gate: evidence.gate, comparisons: evidence.comparisons, holdoutPrimary: evidence.holdoutPrimary };
    expect(PublishRecords.EvidenceSha256(reordered)).toBe(PublishRecords.EvidenceSha256(evidence));
    expect(PublishRecords.EvidenceSha256(evidence)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('PublishRecords.FindPublishForRun and FindRunOutcome', () => {
  it('finds a publish or adopt row of the run, never a refusal or a rollback', async () => {
    const store = new GateTestStore();
    const ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
    store.Insert('MJ: ML Model Publish Records', { ID: 'R1', TrainingRunID: 'RUN', ModelID: 'M', Kind: 'refusal', Purpose: 'publish' });
    store.Insert('MJ: ML Model Publish Records', { ID: 'R2', TrainingRunID: 'RUN', ModelID: 'M', Kind: 'publish', Purpose: 'rollback' });
    expect(await PublishRecords.FindPublishForRun('RUN', ctx)).toBeNull();
    store.Insert('MJ: ML Model Publish Records', { ID: 'R3', TrainingRunID: 'run', ModelID: 'M', Kind: 'publish', Purpose: 'adopt' });
    expect(await PublishRecords.FindPublishForRun('RUN', ctx)).toEqual({ ID: 'R3', ModelID: 'M' });
  });
  it("finds the run-level outcome with its stored refusal", async () => {
    const store = new GateTestStore();
    const ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
    expect(await PublishRecords.FindRunOutcome('RUN', ctx)).toBeNull();
    store.Insert('MJ: ML Model Publish Records', { ID: 'R4', TrainingRunID: 'RUN', ModelID: null, Kind: 'refusal', Purpose: 'evaluate', Refusal: JSON.stringify({ kind: 'kept-existing-rule', rule: 'r' }) });
    expect(await PublishRecords.FindRunOutcome('RUN', ctx)).toEqual({ ID: 'R4', Refusal: { kind: 'kept-existing-rule', rule: 'r' } });
  });
});
