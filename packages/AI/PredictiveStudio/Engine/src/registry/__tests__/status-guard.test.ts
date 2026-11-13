/**
 * `PredictiveStudioStatusGuard` (Task M3.3): the `PreSave` hook on `MJ: ML Models` that applies
 * `StatusWriteRules.DecideStatusWrite` to every save, reading the persisted row itself and failing closed; re-derives an
 * authorised move into `Published` from the stored rows (D4-58); refuses `Published → Unevaluated` for any initiator but
 * a Registry Check job run (R9); refuses every save that sets `ServingWhileUnevaluated` (D4-61).
 *
 * The hook is the one the Engine entry point registered, taken from `GetDataHooks`; the entities are real generated
 * entity objects over the gate tests' in-memory rows (`GuardTestWorld`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GetDataHooks, type PreSaveHook, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { Actor, TrainerCompleted } from '@memberjunction/predictive-studio-core';

import { EvidenceWriteAuthorisations, PredictiveStudioEvidenceGuard, PredictiveStudioStatusGuard, PreSaveHookRegistration, StatusWriteAuthorisations } from '../../index';
import { GateWorld, type ReadLog, type Row } from '../../__tests__/fakes/gate-test-store';
import { FakeTransactionGroup, GuardTestWorld } from '../../__tests__/fakes/guard-test-world';

/** The registered hook carrying `mark`. */
function HookMarked(mark: symbol): PreSaveHook {
  const hook = PreSaveHookRegistration.HooksMarked(mark)[0];
  if (hook === undefined) throw new Error('the Engine entry point did not register the hook');
  return hook;
}
const StatusGuardHook = HookMarked(PredictiveStudioStatusGuard.HookMark);

const user: UserInfo = GateWorld.User;
const human: Actor = { kind: 'human', userId: user.ID };

let world: GuardTestWorld;
let reads: ReadLog;
let model: MJMLModelEntity;
let published: MJMLModelEntity;
let monitoringRun: { readonly ID: string };
let registryCheckRun: { readonly ID: string };
let registryJob: Actor;
let gateRecords: { Store(modelId: string, result: TrainerCompleted): void };
let IntervalsThatRecomputeTo: (outcome: 'no-signal' | 'model') => TrainerCompleted;
let PersistedRow: (fields: Row) => MJMLModelEntity;
let NewRow: (fields: Row) => MJMLModelEntity;

beforeEach(() => {
  world = new GuardTestWorld(user);
  reads = world.Store.ReadLog;
  model = world.SavedModel('Draft');
  published = world.SavedModel('Published');
  ({ monitoringRun, registryCheckRun } = world.StoreJobRuns());
  registryJob = { kind: 'scheduled-job', scheduledJobRunId: registryCheckRun.ID };
  // An evaluated model: its run's stored gate record replaced, and its persisted status the gate's Validated.
  gateRecords = {
    Store(modelId: string, result: TrainerCompleted): void {
      world.World.StoreGateRecord(modelId, result);
      world.SetModelCell(modelId, 'Status', 'Validated');
    },
  };
  IntervalsThatRecomputeTo = (outcome) => world.ResultThatRecomputesTo(outcome, model.TrainingRunID || '');
  const base = world.WorldModel('Draft');
  PersistedRow = (fields) => world.PersistedCopy(base, fields);
  NewRow = (fields) => world.NewModel({ PipelineID: GateWorld.PipelineID, Version: 1, ArtifactStatus: 'unverified', ...fields });
});

describe('PredictiveStudioStatusGuard — the plan cases', () => {
  it('refuses a Status change outside the gate even when the old value is replaced and reset', async () => {
    model.SetMany({ Status: 'Published' }, false, true);        // replaceOldValues (baseEntity.ts:4593)
    model.GetFieldByName('Status')?.ResetOldValue();            // EntityField.ResetOldValue() (baseEntity.ts:631)
    expect(await StatusGuardHook(model, user)).toContain('status-changed-outside-gate');
  });
  it('refuses a non-gate update inside a TransactionGroup', async () => {
    model.Status = 'Published';
    model.TransactionGroup = new FakeTransactionGroup();
    expect(await StatusGuardHook(model, user)).toContain('deferred-in-transaction-group');
  });
  it('fails closed when the persisted row is unreadable', async () => {
    reads.FailNext('MJ: ML Models');
    model.Status = 'Validated';
    expect(await StatusGuardHook(model, user)).toContain('stored-row-unreadable');
  });
  it('re-derives on a gate-authorised Validated → Published save and refuses when the stored intervals recompute to no-signal', async () => {
    gateRecords.Store(model.ID, IntervalsThatRecomputeTo('no-signal'));
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Validated', To: 'Published', Initiator: human });   // an authorisation set without LifecycleGate
    model.Status = 'Published';
    expect(await StatusGuardHook(model, user)).toContain('gate-no-signal');
  });
  it('allows a gate-authorised Draft → KeepBaseline save', async () => {
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Draft', To: 'KeepBaseline', Initiator: human });
    model.Status = 'KeepBaseline';
    expect(await StatusGuardHook(model, user)).toBe(true);
  });
  it('refuses an authorised Published → Unevaluated from a monitoring job run and allows it from a Registry Check run', async () => {
    StatusWriteAuthorisations.Instance.Authorise(published, { From: 'Published', To: 'Unevaluated', Initiator: { kind: 'scheduled-job', scheduledJobRunId: monitoringRun.ID } });
    published.Status = 'Unevaluated';
    expect(await StatusGuardHook(published, user)).toContain('actor-not-permitted');
    StatusWriteAuthorisations.Instance.Authorise(published, { From: 'Published', To: 'Unevaluated', Initiator: { kind: 'scheduled-job', scheduledJobRunId: registryCheckRun.ID } });
    expect(await StatusGuardHook(published, user)).toBe(true);
  });
  it('refuses a ServingWhileUnevaluated 0 → 1 save from any caller, authorised or not', async () => {
    const demoted = PersistedRow({ Status: 'Unevaluated', ServingWhileUnevaluated: false });
    demoted.ServingWhileUnevaluated = true;
    expect(await StatusGuardHook(demoted, user)).toContain('serving-flag-set-outside-migration');
    StatusWriteAuthorisations.Instance.Authorise(demoted, { From: 'Unevaluated', To: 'Unevaluated', Initiator: registryJob });
    expect(await StatusGuardHook(demoted, user)).toContain('serving-flag-set-outside-migration');
    const inserted = NewRow({ Status: 'Draft', ServingWhileUnevaluated: true });      // a create, not an update
    expect(await StatusGuardHook(inserted, user)).toContain('serving-flag-set-outside-migration');
  });
  it('allows an ArtifactStatus-only save', async () => {
    model.ArtifactStatus = 'missing';
    expect(await StatusGuardHook(model, user)).toBe(true);
  });
  it('registers once however many times the module loads', () => {
    const before = GetDataHooks<PreSaveHook>('PreSave').length;
    PredictiveStudioStatusGuard.Register(); PredictiveStudioStatusGuard.Register();
    expect(GetDataHooks<PreSaveHook>('PreSave').length - before).toBe(0);   // the module import already registered both
  });
});

describe('PredictiveStudioStatusGuard.Unregister — a process that must behave as a browser-only client (D4-106)', () => {
  it('removes the registered guard so a Status change is not refused in-process, Register() registers it again, and a second Unregister() finds none', async () => {
    model.Status = 'Published';
    expect(await StatusGuardHook(model, user)).toContain('status-changed-outside-gate');
    try {
      expect(PredictiveStudioStatusGuard.Unregister()).toBe(true);
      expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)).toBe(false);
      for (const hook of GetDataHooks<PreSaveHook>('PreSave')) expect(await hook(model, user)).toBe(true);
    } finally {
      PredictiveStudioStatusGuard.Register();
    }
    expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)).toBe(true);
    expect(PreSaveHookRegistration.HooksMarked(PredictiveStudioStatusGuard.HookMark)).toHaveLength(1);
    expect(PredictiveStudioStatusGuard.Unregister()).toBe(true);
    expect(PredictiveStudioStatusGuard.Unregister()).toBe(false);
    PredictiveStudioStatusGuard.Register();
    expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)).toBe(true);
  });
  it('PreSaveHookRegistration.Unregister removes only the hooks carrying the mark', () => {
    const mark = Symbol('a test mark');
    const before = GetDataHooks<PreSaveHook>('PreSave').length;
    expect(PreSaveHookRegistration.RegisterOnce(mark, async () => true)).toBe(true);
    expect(PreSaveHookRegistration.Unregister(mark)).toBe(true);
    expect(GetDataHooks<PreSaveHook>('PreSave').length).toBe(before);
    expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)).toBe(true);
    expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioEvidenceGuard.HookMark)).toBe(true);
    expect(PreSaveHookRegistration.Unregister(mark)).toBe(false);
  });
});

describe('PredictiveStudioStatusGuard — the rulings and the fail-closed edges', () => {
  it('a second copy of the module (its own hook function, the same mark) does not double-register either hook', () => {
    for (const mark of [PredictiveStudioStatusGuard.HookMark, PredictiveStudioEvidenceGuard.HookMark]) {
      const before = GetDataHooks<PreSaveHook>('PreSave').length;
      expect(PreSaveHookRegistration.RegisterOnce(mark, async () => true)).toBe(false);
      expect(GetDataHooks<PreSaveHook>('PreSave').length - before).toBe(0);
      expect(PreSaveHookRegistration.HooksMarked(mark)).toHaveLength(1);
    }
  });
  it('an authorisation is taken by the save it authorises: a refused save leaves none behind', async () => {
    gateRecords.Store(model.ID, IntervalsThatRecomputeTo('no-signal'));
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Validated', To: 'Published', Initiator: human });
    model.Status = 'Published';
    expect(await StatusGuardHook(model, user)).toContain('gate-no-signal');
    expect(StatusWriteAuthorisations.Instance.Take(model)).toBeNull();
    expect(await StatusGuardHook(model, user)).toContain('status-changed-outside-gate');
  });
  it('allows a gate-authorised publish whose stored rows re-derive it, read on the entity\'s own provider', async () => {
    world.SetModelCell(published.ID, 'Status', 'Archived');
    const validated = world.SavedModel('Validated', 'model');
    StatusWriteAuthorisations.Instance.Authorise(validated, { From: 'Validated', To: 'Published', Initiator: human });
    validated.Status = 'Published';
    const readsBefore = reads.Entries.length;
    expect(await StatusGuardHook(validated, user)).toBe(true);
    expect(reads.Entries.slice(readsBefore).filter((r) => r.startsWith('view MJ: ML Training Runs'))).toHaveLength(1);
  });
  it('refuses an authorised Published → Unevaluated by a human, and fails closed when the Registry Check type is absent', async () => {
    StatusWriteAuthorisations.Instance.Authorise(published, { From: 'Published', To: 'Unevaluated', Initiator: human });
    published.Status = 'Unevaluated';
    expect(await StatusGuardHook(published, user)).toContain('actor-not-permitted');
    world.Store.Tables['MJ: Scheduled Job Types'] = (world.Store.Tables['MJ: Scheduled Job Types'] || []).filter((t) => t['Name'] !== 'Predictive Studio Registry Check');
    StatusWriteAuthorisations.Instance.Authorise(published, { From: 'Published', To: 'Unevaluated', Initiator: registryJob });
    expect(await StatusGuardHook(published, user)).toContain('actor-not-permitted');
  });
  it('a create must be Draft (create-not-draft), and a new Draft passes', async () => {
    expect(await StatusGuardHook(NewRow({ Status: 'Published', ServingWhileUnevaluated: false }), user)).toContain('create-not-draft');
    expect(await StatusGuardHook(NewRow({ Status: 'Draft', ServingWhileUnevaluated: false }), user)).toBe(true);
  });
  it('refuses clearing ServingWhileUnevaluated (1 → 0) outside an authorised transition that carries it, and allows it inside one', async () => {
    const serving = PersistedRow({ Status: 'Unevaluated', ServingWhileUnevaluated: true });
    serving.ServingWhileUnevaluated = false;
    expect(await StatusGuardHook(serving, user)).toContain('serving-flag-set-outside-migration');
    StatusWriteAuthorisations.Instance.Authorise(serving, { From: 'Unevaluated', To: 'Archived', Initiator: human });
    serving.Status = 'Archived';
    expect(await StatusGuardHook(serving, user)).toContain('serving-flag-set-outside-migration');
    StatusWriteAuthorisations.Instance.Authorise(serving, { From: 'Unevaluated', To: 'Archived', Initiator: human, ServingWhileUnevaluated: false });
    expect(await StatusGuardHook(serving, user)).toBe(true);
  });
  it('a refused save leaves no evidence authorisation behind either (the evidence guard never runs after a refusal)', async () => {
    model.Status = 'Published';
    EvidenceWriteAuthorisations.Instance.Authorise(model, ['Delivery']);
    expect(await StatusGuardHook(model, user)).toContain('status-changed-outside-gate');
    expect(EvidenceWriteAuthorisations.Instance.Take(model)).toEqual([]);
  });
  it('re-derives an authorised Validated → Published against the incumbent it replaces (archived first) and refuses does-not-beat-incumbent when the stored diff says so', async () => {
    const candidate = world.WorldModel('Validated', 'model');
    world.World.StoreGateRecord(candidate.ID, { ...world.ResultThatRecomputesTo('model', candidate.RunID), incumbentDiff: { incumbentModelId: published.ID, value: 0, lower: -0.01, upper: 0.01 } });
    world.SetModelCell(published.ID, 'Status', 'Archived');   // the gate archives the incumbent first, in the same transaction
    const entity = world.LoadModel(candidate.ID);
    StatusWriteAuthorisations.Instance.Authorise(entity, { From: 'Validated', To: 'Published', Initiator: human, Replaces: published.ID });
    entity.Status = 'Published';
    expect(await StatusGuardHook(entity, user)).toContain('does-not-beat-incumbent');
  });
  it('allows the re-derivation against the replaced incumbent when the stored diff beats it, and refuses a Replaces that is not this pipeline\'s archived incumbent', async () => {
    const beats = world.WorldModel('Validated', 'model');
    world.World.StoreGateRecord(beats.ID, { ...world.ResultThatRecomputesTo('model', beats.RunID), incumbentDiff: { incumbentModelId: published.ID, value: 0.02, lower: 0.01, upper: 0.03 } });
    const entity = world.LoadModel(beats.ID);
    StatusWriteAuthorisations.Instance.Authorise(entity, { From: 'Validated', To: 'Published', Initiator: human, Replaces: published.ID });
    entity.Status = 'Published';
    expect(await StatusGuardHook(entity, user)).toContain('incumbent-not-current');   // the incumbent is still Published: not archived first
    world.SetModelCell(published.ID, 'Status', 'Archived');
    StatusWriteAuthorisations.Instance.Authorise(entity, { From: 'Validated', To: 'Published', Initiator: human, Replaces: published.ID });
    expect(await StatusGuardHook(entity, user)).toBe(true);
    world.SetModelCell(published.ID, 'PipelineID', '7B000000-0000-4000-8000-0000000000FF');
    StatusWriteAuthorisations.Instance.Authorise(entity, { From: 'Validated', To: 'Published', Initiator: human, Replaces: published.ID });
    expect(await StatusGuardHook(entity, user)).toContain('incumbent-not-current');
  });
  it('refuses with the model ID in the message, and passes every other entity untouched', async () => {
    model.Status = 'Published';
    expect(await StatusGuardHook(model, user)).toContain(`ML Model ${model.ID}`);
    const run = world.LoadRun(world.WorldModel('Draft').RunID);
    const readsBefore = reads.Entries.length;
    expect(await StatusGuardHook(run, user)).toBe(true);
    expect(reads.Entries.length).toBe(readsBefore);
  });
  it('fails closed without a saving user', async () => {
    model.ArtifactStatus = 'missing';
    expect(await StatusGuardHook(model, undefined)).toContain('stored-row-unreadable');
  });
});
