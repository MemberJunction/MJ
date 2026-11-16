/** `PublishRecords` (Task M3.2): the evidence hash is over `Canonicalize`'s canonical JSON, and the finders read only the rows their index guards. */
import { describe, expect, it } from 'vitest';
import { Canonicalize } from '@memberjunction/global';
import type { EvidenceSnapshot } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { PublishRecords } from '../publish-records';

const evidence: EvidenceSnapshot = {
  holdoutPrimary: { metric: 'log-loss', value: 0.4, interval: { level: 0.95, lower: 0.3, upper: 0.5 }, n: 10 },
  comparisons: { modelVsDummy: { value: 0.1, ci: [0.05, 0.15], beats: true } },
  gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
  leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' }, snapshotHash: 'a'.repeat(64),
};

describe('PublishRecords.EvidenceSha256', () => {
  it('is the SHA-256 of Canonicalize(evidence), so equal values hash equally whatever their key order', () => {
    expect(PublishRecords.EvidenceSha256(evidence)).toBe(SnapshotHash.Sha256Hex(Canonicalize(evidence)));
    const reordered: EvidenceSnapshot = { snapshotHash: evidence.snapshotHash, dataWindow: evidence.dataWindow, leakageFlags: [], gate: evidence.gate, comparisons: evidence.comparisons, holdoutPrimary: evidence.holdoutPrimary };
    expect(PublishRecords.EvidenceSha256(reordered)).toBe(PublishRecords.EvidenceSha256(evidence));
    expect(PublishRecords.EvidenceSha256(evidence)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('PublishRecords.EvidenceSha256 — the canonical form itself (golden value)', () => {
  /** A fully populated evidence value; its hash was computed once from its canonical text (task M4.1 report, fix round 2). */
  const golden: EvidenceSnapshot = {
    holdoutPrimary: { metric: 'log-loss', value: 0.4320454626766007, interval: { level: 0.95, lower: 0.4136896095564584, upper: 0.44989924751973154 }, n: 3392 },
    comparisons: {
      modelVsDummy: { value: 0.056623936327318214, ci: [0.046566916167292124, 0.06737886653926327], beats: true },
      'modelVs:glm': { value: 0, ci: [0, 0], beats: false },
    },
    gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
    leakageFlags: [
      { kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 },
      { kind: 'time-shifted-label', scoreWithShiftedLabel: 0.91 },
    ],
    dataWindow: { from: '2026-11-15', to: '2026-11-15' },
    snapshotHash: 'bed391e080f946d2dfbd57a82b6f39561d28e2b1ab27a27b21344818f362e73f',
  };
  it('hashes to the pinned SHA-256: a change to the canonical form changes every stored EvidenceSha256', () => {
    expect(PublishRecords.EvidenceSha256(golden)).toBe('ce0a8f7589aa00f0a5d2592a98f5efb62d32332e37f8ba9a5fc1416bc707ace8');
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
