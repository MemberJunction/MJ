/**
 * `SignOffService`, `StoredEvidenceBuilder`, `StoredSignOffLookup` and the `PredictiveStudio.GetModelEvidence` /
 * `PredictiveStudio.SignOffModel` operations (Task M4.1), over the `GateTestStore` world the lifecycle gate's tests use.
 * The plan's cases come first, verbatim but for the result narrowing a union needs (`signed.Ok ? … : null`) and the
 * stale-evidence case's protocol pin (without a required sign-off the publish would not consult it); the cases after
 * them are this task's additions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WellKnownUserSource, UserInfo } from '@memberjunction/core';
import type { PredictiveStudioSignOffModelInput } from '@memberjunction/core-entities';
import { PredictiveStudioRefusalCodes, type HumanActor } from '@memberjunction/predictive-studio-core';

import { FakeClock, GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { CapturingContext } from '../../operations/__tests__/helpers';
import { PredictiveStudioGetModelEvidenceServerOperation } from '../../operations/get-model-evidence.operation';
import { PredictiveStudioSignOffModelServerOperation } from '../../operations/sign-off-model.operation';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import type { GateContext, PublishRequest } from '../../registry/gate-context';
import { GateContexts } from '../../registry/gate-seams';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { PublishRecords } from '../../registry/publish-records';
import { StoredEvidenceBuilder } from '../evidence-builder';
import { SignOffService, type SignOffInput } from '../sign-off-service';
import { StoredSignOffLookup } from '../sign-off-lookup';

const agentRun = '7A2B3C4D-0000-4000-8000-0000000000D1';
const human: HumanActor = { kind: 'human', userId: GateWorld.User.ID };
const SYSTEM_USER = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000000F9', Email: 'system@example.com', Type: 'User' });

const log: string[] = [];
const storage = new MemoryStorageAccount('sign-off', log);
RegisterMemoryStorage('PS Sign-Off Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Sign-Off Test Storage', 'PS Sign-Off Test Storage', true);

let store: GateTestStore;
let world: GateWorld;
let model: WorldModel;
let run: WorldModel;
let keepBaseline: WorldModel;
let keepRun: WorldModel;
let snapshot: { readonly ContentHash: string };
let service: SignOffService;
let gate: LifecycleGate;
let ctx: GateContext;
let op: PredictiveStudioSignOffModelServerOperation;
let context: CapturingContext;
let input: PredictiveStudioSignOffModelInput;
let approve: SignOffInput;
let request: PublishRequest;

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  model = world.Model('Validated', 'model');
  run = model;
  keepBaseline = world.Model('KeepBaseline', 'keep');
  keepRun = keepBaseline;
  snapshot = { ContentHash: String(store.SnapshotOf(model.ID)['ContentHash']) };
  service = new SignOffService();
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  op = new PredictiveStudioSignOffModelServerOperation();
  context = new CapturingContext(store.Provider(), GateWorld.User);
  approve = { modelId: model.ID, purpose: 'publish', decision: 'approve', reason: 'reviewed', overridesFlags: [] };
  input = { ...approve, overridesFlags: [...approve.overridesFlags] };
  request = { modelId: model.ID, purpose: 'publish', initiator: { kind: 'agent', agentRunId: agentRun }, signOffId: null, reason: null };
});

/** Test-double cast: a wire input that breaks the contract (it arrives as untyped JSON at runtime; the compiler refuses the shape). */
function malformed(fields: object): PredictiveStudioSignOffModelInput {
  return fields as PredictiveStudioSignOffModelInput;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SignOffService (the plan cases)', () => {
  it('builds the evidence only from stored rows: a caller-supplied number never reaches it', async () => {
    const e = await service.BuildEvidence(model.ID, ctx);
    expect(e.holdoutPrimary).toEqual(store.StoredHoldoutPrimary(run));   // the run's stored gate record, read back by the test
    expect(e.snapshotHash).toBe(snapshot.ContentHash);
  });
  it('refuses a sign-off whose approver is not a person (API key, system user)', async () => {
    expect(await op.ExecuteServer(input, { ...context, apiKeyHash: 'k' })).toMatchObject({ Success: false, ResultCode: 'NOT_HUMAN' });
    vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) => u?.ID === SYSTEM_USER.ID);
    expect(await op.ExecuteServer(input, new CapturingContext(store.Provider(), SYSTEM_USER))).toMatchObject({ Success: false, ResultCode: 'NOT_HUMAN' });
    expect(store.PublishRecords(model.ID)).toHaveLength(0);
  });
  it('refuses overridesFlags without a reason', async () => {
    const r = await service.Record({ ...approve, overridesFlags: ['single-feature-auc'], reason: '  ' }, human, ctx);
    expect(r).toEqual({ Ok: false, Refusal: 'overrides-without-reason' });
    expect(store.PublishRecords(model.ID)).toHaveLength(0);
  });
  it('a flagged model publishes after an approving sign-off whose OverridesFlags covers its flags; a partial cover is refused', async () => {
    store.FlagLeakage(model.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }, { kind: 'time-shifted-label', scoreWithShiftedLabel: 0.91 }]);
    const partial = await service.Record({ ...approve, overridesFlags: ['single-feature-auc'], reason: 'reviewed: set before the decision date' }, human, ctx);
    expect(await gate.Publish({ ...request, initiator: human, signOffId: partial.Ok ? partial.SignOffRecordID : null }, ctx))
      .toMatchObject({ Kind: 'withheld', Refusal: { kind: 'unacknowledged-leakage-flags', flags: ['time-shifted-label'] } });
    const full = await service.Record({ ...approve, overridesFlags: ['single-feature-auc', 'time-shifted-label'], reason: 'reviewed both' }, human, ctx);
    expect(await gate.Publish({ ...request, initiator: human, signOffId: full.Ok ? full.SignOffRecordID : null }, ctx)).toMatchObject({ Kind: 'published' });
    expect(store.PublishRecords(model.ID).filter((r) => r.Kind === 'publish')).toEqual([expect.objectContaining({ SignOffID: full.Ok ? full.SignOffRecordID : null })]);
  });
  it('refuses a sign-off for an archived model', async () => {
    store.SetStatus(model.ID, 'Archived');
    expect(await service.Record(approve, human, ctx)).toEqual({ Ok: false, Refusal: 'model-archived' });
  });
  it('the evidence of a keep-baseline model is the simple member\'s', async () => {
    const e = await service.BuildEvidence(keepBaseline.ID, ctx);
    expect(e.gate.outcome).toBe('keep-simple-baseline');
    expect(e.holdoutPrimary).toEqual(store.StoredMemberHoldout(keepRun, 'glm'));
  });
  it('a sign-off over stale evidence does not authorise a publish', async () => {
    store.PinProtocol(model.ID, { requiresHumanSignOff: true });
    const signed = await service.Record(approve, human, ctx);
    store.RewriteSnapshotHash(run, 'other');
    expect(await gate.Publish({ ...request, signOffId: signed.Ok ? signed.SignOffRecordID : null }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
  });
  it('requiresHumanSignOff: an automatic attempt stays Validated, the seeded user then publishes as approver', async () => {
    store.PinProtocol(model.ID, { requiresHumanSignOff: true });
    expect(await gate.Publish({ ...request, initiator: { kind: 'agent', agentRunId: agentRun } }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
    const signed = await service.Record(approve, human, ctx);
    expect(signed.Ok).toBe(true);
    const out = await gate.Publish({ ...request, initiator: human, signOffId: signed.Ok ? signed.SignOffRecordID : null }, ctx);
    expect(out).toMatchObject({ Kind: 'published', Approver: 'user' });
  });
});

describe('SignOffService.Record (additions)', () => {
  it('writes one sign-off row: the approver, decision, reason, overridden flags, the evidence and its hash', async () => {
    const r = await service.Record({ ...approve, overridesFlags: ['drop-column'], reason: 'checked' }, human, ctx);
    if (r.Ok === false) throw new Error(`refused: ${r.Refusal}`);
    const evidence = await service.BuildEvidence(model.ID, ctx);
    expect(r.EvidenceSha256).toBe(PublishRecords.EvidenceSha256(evidence));
    expect(store.PublishRecords(model.ID)).toEqual([expect.objectContaining({
      ID: r.SignOffRecordID, Kind: 'sign-off', Purpose: 'publish', ApproverKind: 'user', UserID: human.userId, Initiator: JSON.stringify(human),
      TrainingRunID: model.RunID, Decision: 'approve', Reason: 'checked', OverridesFlags: '["drop-column"]', EvidenceSha256: r.EvidenceSha256, Evidence: JSON.stringify(evidence),
    })]);
  });
  it('throws naming the save message when the row is not saved', async () => {
    store.FailingSaves.set('MJ: ML Model Publish Records', 'constraint violated');
    await expect(service.Record(approve, human, ctx)).rejects.toThrow('constraint violated');
  });
  it('throws for a model that does not exist', async () => {
    await expect(service.Record({ ...approve, modelId: '0B1C2D3E-0000-4000-8000-00000000DEAD' }, human, ctx)).rejects.toThrow('does not exist');
  });
});

describe('StoredEvidenceBuilder', () => {
  it("reads the snapshot's data cutoff as the data window and refuses a model with no stored run or snapshot", async () => {
    const e = await new StoredEvidenceBuilder().Build(model.ID, ctx);
    expect(e).toMatchObject({ gate: { outcome: 'model' }, leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' } });
    expect(Object.keys(e.comparisons)).toContain('modelVsDummy');
    const row = store.Row('MJ: ML Models', model.ID);
    if (row) row['TrainingSnapshotID'] = null;
    await expect(new StoredEvidenceBuilder().Build(model.ID, ctx)).rejects.toThrow('names no Training Snapshot');
    if (row) row['TrainingRunID'] = null;
    await expect(new StoredEvidenceBuilder().Build(model.ID, ctx)).rejects.toThrow('has no stored training run');
  });
  it('reads every row past the RunView cache', async () => {
    await new StoredEvidenceBuilder().Build(model.ID, ctx);
    expect(store.ViewReads.length).toBeGreaterThan(0);
    expect(store.ViewReads.every((r) => r.BypassCache)).toBe(true);
  });
});

describe('StoredSignOffLookup', () => {
  it("finds the request's approving sign-off only for its model, purpose, approve decision and current evidence hash", async () => {
    const signed = await service.Record(approve, human, ctx);
    if (signed.Ok === false) throw new Error(`refused: ${signed.Refusal}`);
    const lookup = new StoredSignOffLookup();
    const req = { modelId: model.ID, purpose: 'publish' as const, signOffId: signed.SignOffRecordID };
    expect(await lookup.FindApproving(req, signed.EvidenceSha256, ctx)).toMatchObject({ ID: signed.SignOffRecordID, ModelID: model.ID, Approver: human, Decision: 'approve', Reason: 'reviewed', OverridesFlags: [] });
    expect(await lookup.FindApproving(req, 'f'.repeat(64), ctx)).toBeNull();
    expect(await lookup.FindApproving({ ...req, modelId: keepBaseline.ID }, signed.EvidenceSha256, ctx)).toBeNull();
    expect(await lookup.FindApproving({ ...req, purpose: 'rollback' }, signed.EvidenceSha256, ctx)).toBeNull();
    const rejected = await service.Record({ ...approve, decision: 'reject' }, human, ctx);
    if (rejected.Ok === false) throw new Error(`refused: ${rejected.Refusal}`);
    expect(await lookup.FindApproving({ ...req, signOffId: rejected.SignOffRecordID }, rejected.EvidenceSha256, ctx)).toBeNull();
  });
  it('a request with no signOffId, or one that is not a UUID, returns null without a read', async () => {
    const reads = store.ReadCount();
    const lookup = new StoredSignOffLookup();
    expect(await lookup.FindApproving({ modelId: model.ID, purpose: 'publish', signOffId: null }, 'a'.repeat(64), ctx)).toBeNull();
    expect(await lookup.FindApproving({ modelId: model.ID, purpose: 'publish', signOffId: `x' OR 1=1 --` }, 'a'.repeat(64), ctx)).toBeNull();
    expect(store.ReadCount()).toBe(reads);
  });
});

describe('PredictiveStudio.SignOffModel and PredictiveStudio.GetModelEvidence', () => {
  it('SignOffModel records the caller as the approver and returns the record and evidence hash', async () => {
    const out = await op.ExecuteServer(input, context);
    const row = store.PublishRecords(model.ID)[0];
    expect(out).toEqual({ Success: true, ResultCode: 'SUCCESS', Output: { signOffRecordId: row['ID'], evidenceSha256: row['EvidenceSha256'] } });
    expect(row).toMatchObject({ Kind: 'sign-off', ApproverKind: 'user', UserID: GateWorld.User.ID });
  });
  it('SignOffModel maps the service refusals to OVERRIDES_WITHOUT_REASON and MODEL_ARCHIVED', async () => {
    expect(await op.ExecuteServer({ ...input, overridesFlags: ['time-shifted-label'], reason: '' }, context)).toMatchObject({ Success: false, ResultCode: 'OVERRIDES_WITHOUT_REASON' });
    store.SetStatus(model.ID, 'Archived');
    const archived = await op.ExecuteServer(input, context);
    expect(archived).toMatchObject({ Success: false, ResultCode: 'MODEL_ARCHIVED', ErrorMessage: 'An Archived model cannot be signed off.' });
    expect(archived.Output).toBeUndefined();
    expect(store.PublishRecords(model.ID)).toHaveLength(0);
  });
  it('SignOffModel refuses INVALID_INPUT, naming the field, for an input outside its contract, and writes no row', async () => {
    const cases: readonly [object, string][] = [
      [{ ...input, overridesFlags: ['bogus-kind'] }, 'overridesFlags'],
      [{ ...input, overridesFlags: 'single-feature-auc' }, 'overridesFlags'],
      [{ ...input, overridesFlags: undefined }, 'overridesFlags'],
      [{ ...input, purpose: 'evaluate' }, 'purpose'],
      [{ ...input, decision: 'maybe' }, 'decision'],
      [{ ...input, reason: undefined }, 'reason'],
      [{ ...input, modelId: '' }, 'modelId'],
    ];
    for (const [fields, field] of cases) {
      const out = await op.ExecuteServer(malformed(fields), context);
      expect(out).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
      expect(out.ErrorMessage).toContain(`input: ${field} `);
      expect(out.Output).toBeUndefined();
    }
    expect(store.PublishRecords(model.ID)).toHaveLength(0);
  });
  it('every code the op returns is in Core\'s refusal catalog', () => {
    for (const code of ['NOT_HUMAN', 'INVALID_INPUT', 'OVERRIDES_WITHOUT_REASON', 'MODEL_ARCHIVED']) expect(PredictiveStudioRefusalCodes.IsRefusal(code)).toBe(true);
    expect(PredictiveStudioSignOffModelServerOperation.RefusalError('model-archived').ResultCode).toBe('MODEL_ARCHIVED');
  });
  it('an unknown flag kind is refused at the wire, so a publish of a flagged model refuses instead of throwing (the reviewer\'s P4)', async () => {
    store.FlagLeakage(model.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    const signed = await op.ExecuteServer(malformed({ ...input, overridesFlags: ['bogus-kind'], reason: 'reviewed' }), context);
    expect(signed).toMatchObject({ Success: false, ResultCode: 'INVALID_INPUT' });
    expect(store.PublishRecords(model.ID)).toHaveLength(0);
    const out = await gate.Publish({ ...request, initiator: human, signOffId: null }, ctx);
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] } });
  });
  it('GetModelEvidence returns the stored evidence with the hash a sign-off records, and writes no row', async () => {
    const out = await new PredictiveStudioGetModelEvidenceServerOperation().ExecuteServer({ modelId: model.ID }, context);
    const evidence = await service.BuildEvidence(model.ID, ctx);
    expect(out).toEqual({ Success: true, ResultCode: 'SUCCESS', Output: { evidence, evidenceSha256: PublishRecords.EvidenceSha256(evidence) } });
    expect(store.SaveCount()).toBe(0);
    const signed = await op.ExecuteServer(input, context);
    expect(signed.Output?.evidenceSha256).toBe(out.Output?.evidenceSha256);
  });
});
