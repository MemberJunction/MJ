/**
 * `LifecycleGate` (Task M3.2): one `describe` per row of §5.1's lifecycle table, over the `GateTestStore` fake provider
 * and a memory storage account the artifact is verified from. The plan's cases are verbatim; the cases after them in a
 * row are this task's additions for that row.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import type { Actor } from '@memberjunction/predictive-studio-core';

import { FakeClock, GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import type { GateContext, PublishRequest } from '../gate-context';
import { GateContexts } from '../gate-seams';
import { LifecycleGate, LifecycleModelNotFoundError } from '../lifecycle-gate';

const NO_SUCH_MODEL_ID = '0B1C2D3E-0000-4000-8000-00000000DEAD';
const run = '7A2B3C4D-0000-4000-8000-0000000000B1';
const human: Actor = { kind: 'human', userId: GateWorld.User.ID };
const agent: Actor = { kind: 'agent', agentRunId: run };

const log: string[] = [];
const storage = new MemoryStorageAccount('gate', log);
RegisterMemoryStorage('PS Lifecycle Gate Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Gate Test Storage', 'PS Lifecycle Gate Test Storage', true);

let store: GateTestStore;
let world: GateWorld;
let gate: LifecycleGate;
let clock: FakeClock;
let ctx: GateContext;
let incumbent: WorldModel;
let candidate: WorldModel;
let keepModel: WorldModel;
let draftModel: WorldModel;
let draftKeep: WorldModel;
let noSignalRun: { readonly ID: string };
let keptRuleRun: { readonly ID: string };
let request: PublishRequest;
let keepRequest: PublishRequest;
let scoringActions: RecordingScoringActions;

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  incumbent = world.Model('Published', 'model');
  candidate = world.Model('Validated', 'model', { IncumbentID: incumbent.ID });
  keepModel = world.Model('KeepBaseline', 'keep', { IncumbentID: incumbent.ID });
  draftModel = world.Model('Draft', 'model');
  draftKeep = world.Model('Draft', 'keep');
  noSignalRun = world.RunWithoutModel('no-signal');
  keptRuleRun = world.RunWithoutModel('kept-rule');
  clock = new FakeClock();
  scoringActions = new RecordingScoringActions();
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), clock, scoringActions);
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  request = { modelId: candidate.ID, purpose: 'publish', initiator: { kind: 'agent', agentRunId: run }, signOffId: null, reason: null };
  keepRequest = { ...request, modelId: keepModel.ID };
});

describe('Draft → Validated (Evaluate: stored gate decision `model`)', () => {
  it('Evaluate picks the target from the stored gate outcome', async () => {
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toMatchObject({ Kind: 'evaluated', To: 'Validated' });
    expect(await gate.Evaluate({ modelId: draftKeep.ID }, human, ctx)).toMatchObject({ Kind: 'evaluated', To: 'KeepBaseline' });
    expect(store.StatusReason(draftKeep.ID)).not.toBe('');
  });
  it('an id that is not a UUID is model-not-found before any read', async () => {
    const reads = store.ReadCount();
    expect(await gate.Evaluate({ modelId: `x' OR 1=1 --` }, human, ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'model-not-found' } });
    expect(store.ReadCount()).toBe(reads);
  });
  it('a UUID that names no model is model-not-found after one read and changes nothing', async () => {
    const reads = store.ReadCount();
    expect(await gate.Evaluate({ modelId: NO_SUCH_MODEL_ID }, human, ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'model-not-found' } });
    expect([store.ReadCount() - reads, store.SaveCount()]).toEqual([1, 0]);
  });
  it('a { trainingRunId } subject evaluates the run\'s ResultingModelID, under both locks, and writes no record', async () => {
    expect(await gate.Evaluate({ trainingRunId: draftModel.RunID }, agent, ctx)).toEqual({ Kind: 'evaluated', ModelID: draftModel.ID, From: 'Draft', To: 'Validated' });
    expect(store.Status(draftModel.ID)).toBe('Validated');
    expect(store.Reads.filter((r) => r.startsWith('query'))).toEqual(['query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Lock Model For Publish']);
    expect(store.PublishRecords(draftModel.ID)).toEqual([]);
  });
  it('a model that is not Draft is refused illegal-transition naming its state, and no record is written', async () => {
    expect(await gate.Evaluate({ modelId: candidate.ID }, human, ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'validated', to: 'validated' } });
    expect(store.SaveCount()).toBe(0);
  });
  it('a calibration-held finalist stays Draft (calibration-held)', async () => {
    const row = store.Row('MJ: ML Models', draftModel.ID);
    if (row) row['Lineage'] = JSON.stringify({ calibrationHold: { slope: 0.4 } });
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'calibration-held', slope: 0.4 } });
    expect(store.Status(draftModel.ID)).toBe('Draft');
  });
});

describe('a model whose stored rows cannot be re-verified', () => {
  it('a model without a stored gate record is refused', async () => {
    const run = store.Row('MJ: ML Training Runs', candidate.RunID);
    if (run) run['ValidationResults'] = null;
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'not-servable' }, Transient: false });
    const noDelivery = store.Row('MJ: ML Models', keepModel.ID);
    if (noDelivery) noDelivery['Delivery'] = null;
    expect(await gate.Publish({ ...keepRequest, initiator: human }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'not-servable', reason: expect.stringContaining('Delivery') } });
    const draftRun = store.Row('MJ: ML Training Runs', draftModel.RunID);
    if (draftRun) draftRun['ValidationResults'] = null;
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'not-servable' } });
    expect([store.Status(candidate.ID), store.Status(keepModel.ID), store.Status(draftModel.ID)]).toEqual(['Validated', 'KeepBaseline', 'Draft']);
  });
});

describe('Draft → KeepBaseline (Evaluate: stored gate decision `keep-simple-baseline`)', () => {
  it("records the decision's reason as the StatusReason", async () => {
    expect(await gate.Evaluate({ modelId: draftKeep.ID }, agent, ctx)).toEqual({ Kind: 'evaluated', ModelID: draftKeep.ID, From: 'Draft', To: 'KeepBaseline' });
    expect(store.StatusReason(draftKeep.ID)).toMatch(/glm/);
  });
});

describe('a run whose decision shipped no model row (D4-56): no status, one run-level refusal record', () => {
  it('a no-signal run with no model row gets one run-level refusal record, however often it is evaluated', async () => {
    for (let i = 0; i < 2; i++) {
      expect(await gate.Evaluate({ trainingRunId: noSignalRun.ID }, agent, ctx)).toMatchObject({ Kind: 'run-recorded', Refusal: { kind: 'gate-no-signal' } });
    }
    expect(store.PublishRecordsOfRun(noSignalRun.ID)).toEqual([expect.objectContaining({ Kind: 'refusal', Purpose: 'evaluate', ModelID: null })]);
  });
  it('a kept incumbent-heuristic rule is recorded per run as kept-existing-rule and publishes nothing', async () => {
    expect(await gate.Evaluate({ trainingRunId: keptRuleRun.ID }, agent, ctx)).toMatchObject({ Kind: 'run-recorded', Refusal: { kind: 'kept-existing-rule' } });
    expect(store.Status(incumbent.ID)).toBe('Published');
  });
  it('a concurrent evaluation that wins the run-level insert is returned, not thrown (UX_MLModelPublishRecord_OneRunOutcome)', async () => {
    store.OnSave = (entityName) => {
      if (entityName !== 'MJ: ML Model Publish Records' || store.FailingSaves.has(entityName)) return;
      store.InsertCommitted(entityName, { ID: 'WINNER', ModelID: null, TrainingRunID: noSignalRun.ID, Kind: 'refusal', Purpose: 'evaluate', Refusal: JSON.stringify({ kind: 'gate-no-signal', reason: 'x' }) });
      store.FailingSaves.set(entityName, "Cannot insert duplicate key row in object '__mj.MLModelPublishRecord' with unique index 'UX_MLModelPublishRecord_OneRunOutcome'");
    };
    expect(await gate.Evaluate({ trainingRunId: noSignalRun.ID }, agent, ctx)).toMatchObject({ Kind: 'run-recorded', RefusalRecordID: 'WINNER' });
    expect(store.PublishRecordsOfRun(noSignalRun.ID).map((r) => r.ID)).toEqual(['WINNER']);
  });
  it('the run-level row names the run, the initiator and the automated approver, and the rule by name', async () => {
    const out = await gate.Evaluate({ trainingRunId: keptRuleRun.ID }, agent, ctx);
    expect(out).toMatchObject({ Kind: 'run-recorded', Refusal: { kind: 'kept-existing-rule', rule: 'renewed last year' } });
    expect(store.PublishRecordsOfRun(keptRuleRun.ID)).toEqual([expect.objectContaining({
      ModelID: null, TrainingRunID: keptRuleRun.ID, ApproverKind: 'automated-gate', UserID: null, Transient: false, Initiator: JSON.stringify(agent),
    })]);
  });
});

describe('Validated → Published (automatic, or an interactive user, through Publish)', () => {
  it('publishes a stored model outcome automatically, archives the incumbent and writes one publish record', async () => {
    const out = await gate.Publish({ modelId: candidate.ID, purpose: 'publish', initiator: { kind: 'agent', agentRunId: run }, signOffId: null, reason: null }, ctx);
    expect(out).toMatchObject({ Kind: 'published', Replaces: incumbent.ID, Approver: 'automated-gate' });
    expect(store.Status(incumbent.ID)).toBe('Archived');
    // The incumbent is archived BEFORE the candidate is saved Published (D4-10's one-Published-per-pipeline index).
    const modelSaves = store.Saves.filter((x) => x.startsWith('MJ: ML Models '));
    expect(modelSaves.indexOf(`MJ: ML Models ${incumbent.ID}`)).toBeGreaterThanOrEqual(0);
    expect(modelSaves.indexOf(`MJ: ML Models ${incumbent.ID}`)).toBeLessThan(modelSaves.indexOf(`MJ: ML Models ${candidate.ID}`));
    expect(store.PublishRecords(candidate.ID)).toHaveLength(1);
    expect(store.ScheduledJobs(candidate.ID)).toEqual([expect.objectContaining({ Status: 'Pending' })]);
  });
  it('reads every model, run, protocol, publish-record and monitoring-job row it decides on past the RunView cache (M3.6: a cached run row was published from after an out-of-band write; D4-108: the pinned protocol row)', async () => {
    const decided = new Set(['MJ: ML Models', 'MJ: ML Training Runs', 'MJ: ML Evaluation Protocols', 'MJ: ML Model Publish Records', 'MJ: Scheduled Jobs', 'MJ: Scheduled Job Types']);
    store.ViewReads.length = 0;
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published' });
    const reads = store.ViewReads.filter((r) => decided.has(r.EntityName));
    expect(new Set(reads.map((r) => r.EntityName))).toEqual(decided);
    expect(reads.filter((r) => !r.BypassCache)).toEqual([]);
  });
  it('a run that stored no comparison while a model is Published is refused naming that model, never published over it (M3.6)', async () => {
    const uncompared = world.Model('Validated', 'model');
    const out = await gate.Publish({ ...request, modelId: uncompared.ID }, ctx);
    expect(out).toMatchObject({
      Kind: 'withheld', Transient: false,
      Refusal: { kind: 'not-servable', reason: `the training run stored no comparison with ML Model ${incumbent.ID}, which is Published now; retrain to compare with it` },
    });
    expect([store.Status(uncompared.ID), store.Status(incumbent.ID)]).toEqual(['Validated', 'Published']);
    expect(store.PublishRecords(uncompared.ID)).toEqual([expect.objectContaining({ Kind: 'refusal', Reason: expect.stringContaining(incumbent.ID) })]);
  });
  it('a run moved off the protocol version its gate record names is refused protocol-mismatch naming both stored versions (M3.6)', async () => {
    const runRow = store.Row('MJ: ML Training Runs', candidate.RunID);
    const pinnedId = String(runRow?.['EvaluationProtocolID']);
    const pinnedRow = store.Row('MJ: ML Evaluation Protocols', pinnedId);
    if (!runRow || !pinnedRow) throw new Error('the candidate has no run or protocol row');
    const newerId = '6A1D2E3F-0000-4000-8000-0000000000F2';
    store.Insert('MJ: ML Evaluation Protocols', { ...pinnedRow, ID: newerId, LineageRootID: pinnedId, Version: 2 });
    runRow['EvaluationProtocolID'] = newerId;
    expect(await gate.Publish(request, ctx)).toMatchObject({
      Kind: 'withheld', Refusal: { kind: 'not-servable', reason: `publish re-verification refused (protocol-mismatch): run pinned ${pinnedId} v1, row is ${newerId} v2` },
    });
    expect(store.Status(candidate.ID)).toBe('Validated');
  });
  it('a second Publish of the same training run is already-published and writes nothing', async () => {
    await gate.Publish(request, ctx);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'already-published' });
    expect(store.PublishRecords(candidate.ID)).toHaveLength(1);
  });
  it('requiresHumanSignOff keeps the model Validated with a no-sign-off refusal', async () => {
    store.PinProtocol(candidate.ID, { requiresHumanSignOff: true });
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' }, Transient: false });
    expect([store.Status(candidate.ID), store.Status(incumbent.ID)]).toEqual(['Validated', 'Published']);
    expect(store.PublishRecords(candidate.ID)).toEqual([expect.objectContaining({ Kind: 'refusal' })]);
  });
  it('a flagged model is refused unacknowledged-leakage-flags, not transient', async () => {
    store.FlagLeakage(candidate.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] }, Transient: false });
  });
  it('storage unreachable inside the transaction is artifact-unverifiable, transient, status unchanged', async () => {
    storage.PutError = 'connection reset';  // MemoryStorageAccount's switch (storage-fakes.ts:26)
    storage.Configured = false;
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'artifact-unverifiable' }, Transient: true });
    expect(store.Status(candidate.ID)).toBe('Validated');
    expect(store.PublishRecords(candidate.ID).filter((r) => r.Kind === 'publish')).toHaveLength(0);
  });
  it('Publish of a Draft model is illegal-transition, leaves it Draft and writes only the refusal record', async () => {
    expect(await gate.Publish({ ...request, modelId: draftModel.ID }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'draft', to: 'published' } });
    expect(store.Status(draftModel.ID)).toBe('Draft');
    expect(store.PublishRecords(draftModel.ID).map((r) => r.Kind)).toEqual(['refusal']);
  });
  it('a retried Publish of an applied run is already-published, never illegal-transition', async () => {
    await gate.Publish(request, ctx);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'already-published' });
  });
  it('a hash mismatch is artifact-unverifiable, not transient, and records the honest ArtifactStatus with the publish withheld', async () => {
    world.CorruptArtifact(candidate.ID);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Status: 'Validated', Refusal: { kind: 'artifact-unverifiable' }, Transient: false });
    expect(store.Row('MJ: ML Models', candidate.ID)).toMatchObject({ Status: 'Validated', ArtifactStatus: 'hash-mismatch', ArtifactCheckedAt: expect.any(Date) });
    expect(store.PublishRecords(candidate.ID).map((r) => r.Kind)).toEqual(['refusal']);
  });
  it('an interactive user is the approver and the initiator; the record carries the evidence hash and the re-derived decision', async () => {
    const out = await gate.Publish({ ...request, initiator: human }, ctx);
    expect(out).toMatchObject({ Kind: 'published', Approver: 'user' });
    const [record] = store.PublishRecords(candidate.ID);
    expect(record).toMatchObject({ Kind: 'publish', Purpose: 'publish', ApproverKind: 'user', UserID: GateWorld.User.ID, Initiator: JSON.stringify(human), ReplacesModelID: incumbent.ID, TrainingRunID: candidate.RunID });
    expect(String(record.EvidenceSha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(String(record.GateDecision))).toMatchObject({ outcome: 'model', shipped: 'xgb' });
  });
  it('the refusal sets the StatusReason in plain words; an automatic attempt says so', async () => {
    store.PinProtocol(candidate.ID, { requiresHumanSignOff: true });
    const out = await gate.Publish(request, ctx);
    expect(store.StatusReason(candidate.ID)).toBe('Automatic publish withheld: The protocol requires an approving human sign-off for this publish, and none was found.');
    expect(out).toMatchObject({ Kind: 'withheld', RefusalRecordID: String(store.PublishRecords(candidate.ID)[0].ID) });
  });
  it('the current Published model is read after both locks are held', async () => {
    await gate.Publish(request, ctx);
    const lockAt = store.Reads.indexOf('query Predictive Studio: Lock Model For Publish');
    const incumbentAt = store.Reads.findIndex((r) => r.includes("Status='Published'"));
    expect([lockAt >= 0, incumbentAt > lockAt]).toEqual([true, true]);
  });
  it('a failure after the status change rolls the whole transaction back: the incumbent stays Published', async () => {
    store.FailingSaves.set('MJ: ML Model Publish Records', 'disk full');
    await expect(gate.Publish(request, ctx)).rejects.toThrow(`Saving the publish record of ML Model ${candidate.ID} for training run ${candidate.RunID} failed: disk full`);
    expect([store.Status(candidate.ID), store.Status(incumbent.ID), store.ScheduledJobs(candidate.ID).length]).toEqual(['Validated', 'Published', 0]);
    expect(store.Transactions).toEqual(['begin', 'rollback']);
  });
  it('Publish of a Draft model is illegal-transition and writes only its refusal', async () => {
    // Nothing of a publish: no status change, no publish record, no monitoring job; the refusal itself is recorded (§5.7 R4).
    expect(await gate.Publish({ ...request, modelId: draftModel.ID }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'draft', to: 'published' } });
    expect([store.Status(draftModel.ID), store.PublishRecords(draftModel.ID).filter((r) => r.Kind === 'publish').length, store.ScheduledJobs(draftModel.ID).length]).toEqual(['Draft', 0, 0]);
    expect(store.Saves.filter((x) => x.startsWith('MJ: Scheduled Jobs'))).toEqual([]);
  });
  it('a stale incumbent comparison is incumbent-not-current', async () => {
    // Another publish replaced the incumbent the candidate's run was compared with, before the candidate took the locks.
    expect(await gate.Publish({ ...keepRequest, initiator: human }, ctx)).toMatchObject({ Kind: 'published', Replaces: incumbent.ID });
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'incumbent-not-current', comparedWith: incumbent.ID, current: keepModel.ID }, Transient: false });
    expect([store.Status(candidate.ID), store.Status(keepModel.ID)]).toEqual(['Validated', 'Published']);
  });
  it('R1: a model whose run holds a publish record but whose status was changed outside the gate is restored, with no second publish record', async () => {
    const first = await gate.Publish(request, ctx);
    const row = store.Row('MJ: ML Models', candidate.ID);
    if (row) row['Status'] = 'Validated';   // a write outside the gate (the disclosed residual race)
    const restored = await gate.Publish(request, ctx);
    expect(restored).toMatchObject({ Kind: 'published', ModelID: candidate.ID, PublishRecordID: first.Kind === 'published' ? first.PublishRecordID : '' });
    expect([store.Status(candidate.ID), store.PublishRecords(candidate.ID).filter((r) => r.Kind === 'publish').length, store.ScheduledJobs(candidate.ID).length]).toEqual(['Published', 1, 1]);
  });
  it('R1: already-published only while the model IS Published; a published model archived since is not re-published by a retry', async () => {
    await gate.Publish(request, ctx);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'already-published' });
    await gate.Archive(candidate.ID, 'retired', human, ctx);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'archived', to: 'published' } });
    expect(store.Status(candidate.ID)).toBe('Archived');
  });
  it('R1: a restore runs the full checks again under the locks: a flagged model is not restored', async () => {
    await gate.Publish(request, ctx);
    const row = store.Row('MJ: ML Models', candidate.ID);
    if (row) row['Status'] = 'Validated';
    store.FlagLeakage(candidate.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'unacknowledged-leakage-flags' } });
    expect(store.Status(candidate.ID)).toBe('Validated');
  });
  it('a model row held for 45 s is publish-in-progress at the 30 s budget; the refusal is recorded without touching the held row', async () => {
    const errors = ConsoleCapture.Errors();
    store.ModelLockHeld = { Clock: clock, UntilMs: 45_000 };
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Status: 'Validated', Refusal: { kind: 'publish-in-progress' }, Transient: true });
    expect(clock.NowMs).toBeLessThanOrEqual(30_000);
    expect([store.StatusReason(candidate.ID), store.PublishRecords(candidate.ID).map((r) => r.Kind)]).toEqual([null, ['refusal']]);
    const lines = ConsoleCapture.Lines(errors);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`the model lock was not acquired for pipeline ${GateWorld.PipelineID}, ML Model ${candidate.ID} after 30000 ms`);
    expect(lines[1]).toContain(`the model lock of ML Model ${candidate.ID} is held, so the publish-in-progress refusal is recorded without its StatusReason`);
  });
  it("two callers on one model: the second's refusal, after the first held the locks past 30 s and published, leaves the first's StatusReason", async () => {
    ConsoleCapture.Errors();
    store.ModelLockHeld = { Clock: clock, UntilMs: 40_000 };
    let atDeadline = 0;
    store.BeforeLockQuery = () => {
      // The gate's last attempt at the 30 s deadline still finds the row held; the refusal path's one NOWAIT try follows it.
      if (clock.NowMs < 30_000 || ++atDeadline < 2) return;
      // The first caller commits its publish while the second is refused: the row is Published, its lock released.
      const row = store.Row('MJ: ML Models', candidate.ID);
      if (row) Object.assign(row, { Status: 'Published', StatusReason: 'published by the first caller' });
      store.ModelLockHeld = null;
    };
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Status: 'Published', Refusal: { kind: 'publish-in-progress' } });
    expect([store.Status(candidate.ID), store.StatusReason(candidate.ID)]).toEqual(['Published', 'published by the first caller']);
    expect(store.PublishRecords(candidate.ID).map((r) => r.Kind)).toEqual(['refusal']);
  });
  it('an ID that names no model throws LifecycleModelNotFoundError: there is no row to record against', async () => {
    await expect(gate.Publish({ ...request, modelId: NO_SUCH_MODEL_ID }, ctx)).rejects.toBeInstanceOf(LifecycleModelNotFoundError);
    await expect(gate.Publish({ ...request, modelId: 'not-a-uuid' }, ctx)).rejects.toMatchObject({ Refusal: { kind: 'model-not-found', modelId: 'not-a-uuid' } });
  });
});

describe('KeepBaseline → Published (autoPublishKeepBaseline, or an interactive user)', () => {
  it('KeepBaseline is withheld without autoPublishKeepBaseline and the incumbent is untouched', async () => {
    expect(await gate.Publish(keepRequest, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'keep-baseline-not-auto-published' }, Transient: false });
    expect(store.Status(incumbent.ID)).toBe('Published');
  });
  it('publishes for an interactive user, and automatically once the protocol sets autoPublishKeepBaseline', async () => {
    expect(await gate.Publish({ ...keepRequest, initiator: human }, ctx)).toMatchObject({ Kind: 'published', Replaces: incumbent.ID, Approver: 'user' });
    expect(store.Status(keepModel.ID)).toBe('Published');
  });
  it('autoPublishKeepBaseline lets the automatic attempt through', async () => {
    store.PinProtocol(keepModel.ID, { autoPublishKeepBaseline: true });
    expect(await gate.Publish(keepRequest, ctx)).toMatchObject({ Kind: 'published', Approver: 'automated-gate' });
  });
});

describe('Validated, KeepBaseline, Unevaluated → Archived (a reason; no sign-off, flagged or not)', () => {
  it('Archive needs a reason and no sign-off, flagged or not', async () => {
    store.FlagLeakage(candidate.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    expect(await gate.Archive(candidate.ID, '', human, ctx)).toMatchObject({ Ok: false, Refusal: { kind: 'reason-required' } });
    expect(await gate.Archive(candidate.ID, 'superseded', human, ctx)).toMatchObject({ Ok: true, From: 'Validated', To: 'Archived' });
  });
  it('the reason becomes the StatusReason; a Draft model cannot be archived', async () => {
    await gate.Archive(keepModel.ID, '  superseded by v9  ', agent, ctx);
    expect([store.Status(keepModel.ID), store.StatusReason(keepModel.ID)]).toEqual(['Archived', 'superseded by v9']);
    expect(await gate.Archive(draftModel.ID, 'not needed', human, ctx)).toEqual({ Ok: false, Refusal: { kind: 'illegal-transition', from: 'draft', to: 'archived' } });
  });
});

describe('Published → Unevaluated (only AdoptPublished, M7): Unevaluated never reaches Published', () => {
  it('a Publish of an Unevaluated model is illegal-transition naming the unevaluated state', async () => {
    const row = store.Row('MJ: ML Models', keepModel.ID);
    if (row) row['Status'] = 'Unevaluated';
    expect(await gate.Publish(keepRequest, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'unevaluated', to: 'published' } });
  });
});

describe('Published → Archived (a reason; also inside the publish that replaces it)', () => {
  it('archives a Published model with its reason and disables its monitoring job', async () => {
    await gate.Publish(request, ctx);
    expect(await gate.Archive(candidate.ID, 'retired', human, ctx)).toEqual({ Ok: true, ModelID: candidate.ID, From: 'Published', To: 'Archived', Archived: null });
    expect(store.ScheduledJobs(candidate.ID)).toEqual([expect.objectContaining({ Status: 'Disabled' })]);
  });
  it('the replaced incumbent gets the replacement reason', async () => {
    await gate.Publish(request, ctx);
    expect(store.StatusReason(incumbent.ID)).toMatch(/^Replaced by v\d+, published through the gate\.$/);
  });
});

describe('Archived → Published (rollback: a reason, published before)', () => {
  it('restores an Archived model that was published before, archiving the current one, with a rollback record', async () => {
    await gate.Publish(request, ctx);
    await gate.Archive(candidate.ID, 'retired', human, ctx);
    expect(await gate.Publish({ ...keepRequest, initiator: human }, ctx)).toMatchObject({ Kind: 'published', Replaces: null });
    const out = await gate.Publish({ ...request, purpose: 'rollback', reason: 'the newer model degraded' }, ctx);
    expect(out).toMatchObject({ Kind: 'published', ModelID: candidate.ID, Replaces: keepModel.ID });
    expect([store.Status(candidate.ID), store.Status(keepModel.ID)]).toEqual(['Published', 'Archived']);
    expect(store.PublishRecords(candidate.ID).map((r) => `${r.Kind}/${r.Purpose}`)).toEqual(['publish/publish', 'publish/rollback']);
  });
  it('a rollback needs an earlier publish record', async () => {
    await gate.Archive(keepModel.ID, 'retired', human, ctx);
    expect(await gate.Publish({ ...keepRequest, purpose: 'rollback', reason: 'restore the kept baseline' }, ctx))
      .toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'archived', to: 'published' } });
    expect(store.Status(keepModel.ID)).toBe('Archived');
  });
  it('a retried applied rollback is already-published, never illegal-transition', async () => {
    await gate.Publish(request, ctx);
    await gate.Archive(candidate.ID, 'retired', human, ctx);
    const rollback: PublishRequest = { ...request, purpose: 'rollback', reason: 'restore' };
    const applied = await gate.Publish(rollback, ctx);
    expect(applied).toMatchObject({ Kind: 'published' });
    expect(await gate.Publish(rollback, ctx)).toEqual({ Kind: 'already-published', ModelID: candidate.ID, PublishRecordID: applied.Kind === 'published' ? applied.PublishRecordID : '' });
  });
  it('a rollback without a reason is reason-required; a rollback of a never-published model is illegal-transition', async () => {
    await gate.Archive(keepModel.ID, 'retired', human, ctx);
    expect(await gate.Publish({ ...keepRequest, purpose: 'rollback', reason: ' ' }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'reason-required' } });
    expect(await gate.Publish({ ...keepRequest, purpose: 'rollback', reason: 'restore' }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'archived', to: 'published' } });
  });
});

describe('the per-model scoring Action, synced after the transition commits', () => {
  it('a scoring-Action sync failure after the commit leaves the publish applied and is logged', async () => {
    const logged = ConsoleCapture.Errors();
    const generator = new RecordingScoringActions({ FailNext: 'action save refused' });
    expect(await new LifecycleGate(new StorageProviderArtifactLoader(), clock, generator).Publish(request, ctx)).toMatchObject({ Kind: 'published' });
    expect([store.Status(candidate.ID), generator.Calls.slice(0, 1), ConsoleCapture.Lines(logged)]).toEqual([
      'Published', ['GenerateForModel'], [expect.stringContaining('action save refused')],
    ]);
    expect(ConsoleCapture.Lines(logged)[0]).toContain(`ML Model ${candidate.ID}`);
    expect(store.PublishRecords(candidate.ID).map((r) => r.Kind)).toEqual(['publish']);
  });
  it('runs strictly after the commit: the transaction is committed when the generator is called', async () => {
    const seen: string[][] = [];
    const observing = new RecordingScoringActions();
    const generate = observing.GenerateForModel.bind(observing);
    observing.GenerateForModel = async (model, user, provider) => { seen.push([...store.Transactions]); return generate(model, user, provider); };
    await new LifecycleGate(new StorageProviderArtifactLoader(), clock, observing).Publish(request, ctx);
    expect(seen).toEqual([['begin', 'commit']]);
  });
  it('a publish generates the published model\'s Action and disables the replaced incumbent\'s, by model ID', async () => {
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published', Replaces: incumbent.ID });
    expect(scoringActions.Log).toEqual([{ Method: 'GenerateForModel', ModelID: candidate.ID }, { Method: 'DisableForModel', ModelID: incumbent.ID }]);
  });
  it('an archive out of Published disables the Action; an archive from Validated, an Evaluate and a withheld publish touch none', async () => {
    expect(await gate.Archive(keepModel.ID, 'not needed', human, ctx)).toMatchObject({ Ok: true, From: 'KeepBaseline' });
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toMatchObject({ Kind: 'evaluated' });
    store.FlagLeakage(candidate.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld' });
    expect(scoringActions.Log).toEqual([]);
    expect(await gate.Archive(incumbent.ID, 'retired', human, ctx)).toMatchObject({ Ok: true, From: 'Published' });
    expect(scoringActions.Log).toEqual([{ Method: 'DisableForModel', ModelID: incumbent.ID }]);
  });
});

describe('the readiness holds PR 3\'s promote path applied, on Publish (D4-57)', () => {
  it('a model with no artifact file is not-servable and stays Validated; a Draft one is still evaluated, and its Publish is illegal-transition first', async () => {
    for (const id of [candidate.ID, draftModel.ID]) {
      const row = store.Row('MJ: ML Models', id);
      if (row) row['ArtifactFileID'] = null;
    }
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'not-servable', reason: `ML Model ${candidate.ID} has no artifact file` } });
    expect(await gate.Publish({ ...request, modelId: draftModel.ID }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition', from: 'draft', to: 'published' } });
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toMatchObject({ Kind: 'evaluated', To: 'Validated' });
    expect([store.Status(candidate.ID), store.Status(draftModel.ID)]).toEqual(['Validated', 'Validated']);
  });
  it("a forecast's series forecaster reaches Validated through Evaluate and is never published (not-servable)", async () => {
    for (const id of [draftModel.ID, candidate.ID]) {
      const row = store.Row('MJ: ML Models', id);
      if (row) row['Lineage'] = JSON.stringify({ shippedMember: 'seasonalNaive', shippedDriver: 'seasonal-naive' });
    }
    expect(await gate.Evaluate({ modelId: draftModel.ID }, human, ctx)).toMatchObject({ Kind: 'evaluated', To: 'Validated' });
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'not-servable', reason: expect.stringContaining('series forecaster') } });
    expect([store.Status(draftModel.ID), store.Status(candidate.ID)]).toEqual(['Validated', 'Validated']);
  });
});
