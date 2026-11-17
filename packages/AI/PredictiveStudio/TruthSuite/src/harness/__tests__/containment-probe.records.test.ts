/**
 * The three probe statics G0.2's half (b) reads (Task M4b.5): `ReadStoredGateDecision`, `ReverifiesStoredDecision` and
 * `RunOutcomeRecorded`, over the Engine's `GateTestStore` world — models evaluated, published and refused through the
 * real lifecycle gate, so the records the probe reads are the ones the gate writes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TrustVerdicts, type Actor } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld, FakeClock, type Cell, type WorldModel } from '../../../../Engine/src/__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../../../Engine/src/__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../../../Engine/src/__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../../../Engine/src/scoring/storage-provider-artifact-loader';
import type { GateContext } from '../../../../Engine/src/registry/gate-context';
import { GateContexts } from '../../../../Engine/src/registry/gate-seams';
import { LifecycleGate } from '../../../../Engine/src/registry/lifecycle-gate';
import { ContainmentProbe, type ProbeReader } from '../containment-probe';
import type { CandidateModel } from '../types';

const log: string[] = [];
const storage = new MemoryStorageAccount('containment-probe', log);
RegisterMemoryStorage('PS Containment Probe Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Containment Probe Test Storage', 'PS Containment Probe Test Storage', true);

let store: GateTestStore;
let world: GateWorld;
let gate: LifecycleGate;
let ctx: GateContext;
let reader: ProbeReader;
let agent: Actor;

/** A stored cell as text, or null for an empty or non-text cell. */
const text = (cell: Cell | undefined): string | null => (typeof cell === 'string' && cell.length > 0 ? cell : null);

/** The model as the harness reads it: the columns the probe statics read come from the store's row. */
function candidateOf(modelId: string): CandidateModel {
  const row = store.Row('MJ: ML Models', modelId);
  if (row === undefined) throw new Error(`no model row ${modelId}`);
  return {
    ModelID: modelId, PipelineID: GateWorld.PipelineID, Algorithm: 'xgboost', Status: store.Status(modelId) === 'Published' ? 'Published' : 'Validated',
    TrainingRowCount: null, ArtifactStatus: 'verified', ArtifactSha256: text(row['ArtifactSha256']), HoldoutRowCount: null, Metrics: {}, HoldoutMetrics: {},
    Trust: TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null, Lineage: null }), TrainingRunStatus: 'Completed', TrainingRunNotes: null,
    LineageJSON: null, ValidationResultsJSON: null, TrainingRunID: text(row['TrainingRunID']), DeliveryJSON: text(row['Delivery']),
  };
}

/** Publishes a Validated model through the gate as the agent and returns it, asserting it reached Published. */
async function publishedThroughGate(): Promise<WorldModel> {
  const m = world.Model('Validated', 'model');
  const out = await gate.Publish({ modelId: m.ID, purpose: 'publish', initiator: agent, signOffId: null, reason: null }, ctx);
  expect(out).toMatchObject({ Kind: 'published', Approver: 'automated-gate' });
  return m;
}

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  reader = { Provider: store.Provider(), User: GateWorld.User };
  agent = { kind: 'agent', agentRunId: world.AgentRun(GateWorld.User.ID).ID };
});

describe('ContainmentProbe.ReadStoredGateDecision', () => {
  it('reads the gate of the registered delivery', () => {
    const m = world.Model('Validated', 'model');
    expect(ContainmentProbe.ReadStoredGateDecision(candidateOf(m.ID))).toMatchObject({ outcome: 'model', shippedRole: 'model' });
  });
  it('reads a kept simple baseline as its own outcome', () => {
    const m = world.Model('KeepBaseline', 'keep');
    expect(ContainmentProbe.ReadStoredGateDecision(candidateOf(m.ID))).toMatchObject({ outcome: 'keep-simple-baseline' });
  });
  it('is null for an empty, non-JSON or non-delivery column', () => {
    const m = candidateOf(world.Model('Validated', 'model').ID);
    expect(ContainmentProbe.ReadStoredGateDecision({ ...m, DeliveryJSON: null })).toBeNull();
    expect(ContainmentProbe.ReadStoredGateDecision({ ...m, DeliveryJSON: '{not json' })).toBeNull();
    expect(ContainmentProbe.ReadStoredGateDecision({ ...m, DeliveryJSON: JSON.stringify({ kind: 'delivered' }) })).toBeNull();
  });
});

describe('ContainmentProbe.ReverifiesStoredDecision', () => {
  it('holds for a model the gate published: its stored model outcome is what ReverifyPublish re-derives', async () => {
    const m = await publishedThroughGate();
    expect(await ContainmentProbe.ReverifiesStoredDecision(candidateOf(m.ID), reader)).toEqual({ Reverified: true });
  });
  it('fails for a Published model without a publish record, naming it', async () => {
    const m = world.Model('Published', 'model');
    expect(await ContainmentProbe.ReverifiesStoredDecision(candidateOf(m.ID), reader)).toEqual({ Reverified: false, Why: 'no publish record names the run and the model' });
  });
  it('fails when the stored decision is not re-derived from the stored rows', async () => {
    const m = await publishedThroughGate();
    const row = store.Row('MJ: ML Models', m.ID);
    if (row === undefined) throw new Error('no model row');
    row['ArtifactSha256'] = 'f'.repeat(64);   // the registered hash no longer matches the run's registered artifact
    const out = await ContainmentProbe.ReverifiesStoredDecision(candidateOf(m.ID), reader);
    expect(out).toMatchObject({ Reverified: false, Why: expect.stringContaining('ReverifyPublish refuses: delivery-mismatch') });
  });
  it('fails for a model with no stored decision, or one that keeps the simple baseline', async () => {
    const m = candidateOf(world.Model('Validated', 'model').ID);
    expect(await ContainmentProbe.ReverifiesStoredDecision({ ...m, DeliveryJSON: null }, reader)).toEqual({ Reverified: false, Why: 'no stored gate decision (Delivery)' });
    const keep = candidateOf(world.Model('KeepBaseline', 'keep').ID);
    expect(await ContainmentProbe.ReverifiesStoredDecision(keep, reader)).toEqual({ Reverified: false, Why: "the stored gate decision is 'keep-simple-baseline', not 'model'" });
  });
});

describe('ContainmentProbe.RunOutcomeRecorded', () => {
  it('is true for a published run, a run-level refusal and a model-level refusal; false for a run with no record', async () => {
    const published = await publishedThroughGate();
    const noSignal = world.RunWithoutModel('no-signal');
    expect(await gate.Evaluate({ trainingRunId: noSignal.ID }, agent, ctx)).toMatchObject({ Kind: 'run-recorded' });
    const keep = world.Model('KeepBaseline', 'keep');
    expect(await gate.Publish({ modelId: keep.ID, purpose: 'publish', initiator: agent, signOffId: null, reason: null }, ctx)).toMatchObject({ Kind: 'withheld' });
    const silent = world.RunWithoutModel('no-signal');
    expect(await ContainmentProbe.RunOutcomeRecorded(published.RunID, reader)).toBe(true);
    expect(await ContainmentProbe.RunOutcomeRecorded(noSignal.ID, reader)).toBe(true);
    expect(await ContainmentProbe.RunOutcomeRecorded(keep.RunID, reader)).toBe(true);
    expect(await ContainmentProbe.RunOutcomeRecorded(silent.ID, reader)).toBe(false);
  });
  it('is false for a refusal record without its reason', async () => {
    const run = world.RunWithoutModel('no-signal');
    store.Insert('MJ: ML Model Publish Records', { ID: '6A1D2E3F-0000-4000-8000-00000000F001', TrainingRunID: run.ID, ModelID: null, Kind: 'refusal', Purpose: 'evaluate', Reason: ' ' });
    expect(await ContainmentProbe.RunOutcomeRecorded(run.ID, reader)).toBe(false);
  });
});

describe('ContainmentProbe.ReadRefusalKinds', () => {
  it('reads the kind of each refusal the gate recorded for the run: run-level and model-level; none for a published or unrecorded run', async () => {
    const published = await publishedThroughGate();
    const noSignal = world.RunWithoutModel('no-signal');
    await gate.Evaluate({ trainingRunId: noSignal.ID }, agent, ctx);
    const keep = world.Model('KeepBaseline', 'keep');
    await gate.Publish({ modelId: keep.ID, purpose: 'publish', initiator: agent, signOffId: null, reason: null }, ctx);
    const silent = world.RunWithoutModel('no-signal');
    expect(await ContainmentProbe.ReadRefusalKinds(noSignal.ID, reader)).toEqual(['gate-no-signal']);
    expect(await ContainmentProbe.ReadRefusalKinds(keep.RunID, reader)).toEqual(['keep-baseline-not-auto-published']);
    expect(await ContainmentProbe.ReadRefusalKinds(published.RunID, reader)).toEqual([]);
    expect(await ContainmentProbe.ReadRefusalKinds(silent.ID, reader)).toEqual([]);
  });
  it('leaves out a refusal whose stored Refusal does not parse or names no kind', async () => {
    const run = world.RunWithoutModel('no-signal');
    store.Insert('MJ: ML Model Publish Records', { ID: '6A1D2E3F-0000-4000-8000-00000000F002', TrainingRunID: run.ID, ModelID: null, Kind: 'refusal', Purpose: 'evaluate', Reason: 'r', Refusal: 'not json' });
    store.Insert('MJ: ML Model Publish Records', { ID: '6A1D2E3F-0000-4000-8000-00000000F003', TrainingRunID: run.ID, ModelID: null, Kind: 'refusal', Purpose: 'evaluate', Reason: 'r', Refusal: '{}' });
    expect(await ContainmentProbe.ReadRefusalKinds(run.ID, reader)).toEqual([]);
  });
});
