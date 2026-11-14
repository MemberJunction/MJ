/**
 * `PredictiveStudioEvidenceGuard` (Task M3.3, D4-61): stored evidence is write-once. A finished training run's
 * `ValidationResults` never changes; a model's `Delivery`, `Lineage` and `ArtifactSha256` never change once stored; the
 * first `Delivery`/`ArtifactSha256` of an existing (pre-change) row is written only with the migration's
 * `EvidenceWriteAuthorisations` entry, and a `Delivery` only when it equals the one rebuilt from the row's stored run.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { UserInfo, type PreSaveHook } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import type { LeakageFlag } from '@memberjunction/predictive-studio-core';

import { EvidenceWriteAuthorisations, PredictiveStudioEvidenceGuard, PreSaveHookRegistration } from '../../index';
import { GateWorld, type Cell, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { GuardTestWorld } from '../../__tests__/fakes/guard-test-world';

function HookMarked(mark: symbol): PreSaveHook {
  const hook = PreSaveHookRegistration.HooksMarked(mark)[0];
  if (hook === undefined) throw new Error('the Engine entry point did not register the hook');
  return hook;
}
const EvidenceGuardHook = HookMarked(PredictiveStudioEvidenceGuard.HookMark);

const user: UserInfo = GateWorld.User;
/** A context user inside an agent run, and one saving through `UpdateMJMLModel`: the guard refuses both alike. */
const agentUser = new UserInfo(null, { ID: '7C000000-0000-4000-8000-0000000000A1', Email: 'agent-run@example.com', Type: 'User' });
const graphQlUser = new UserInfo(null, { ID: '7C000000-0000-4000-8000-0000000000A2', Email: 'graphql@example.com', Type: 'User' });
const flagged: readonly LeakageFlag[] = [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }];

let world: GuardTestWorld;
let pr3Model: WorldModel;
let STORED_SHA: string;
let PreChangeRow: (fields: { readonly Delivery?: string | null; readonly ArtifactSha256?: string | null; readonly Lineage?: string | null; readonly Run?: string }) => MJMLModelEntity;
let StoredRunOf: (m: WorldModel) => string;
let RebuiltDelivery: (m: WorldModel) => string;
let OtherDelivery: () => string;
let GateProducedRow: () => MJMLModelEntity;
let FinishedRun: (fields: { readonly Status: MJMLTrainingRunEntity['Status'] }) => MJMLTrainingRunEntity;
const WithLeakageFlags = GuardTestWorld.WithLeakageFlags;

function text(cell: Cell): string {
  if (typeof cell !== 'string') throw new Error('expected a stored text cell');
  return cell;
}

beforeEach(() => {
  world = new GuardTestWorld(user);
  pr3Model = world.WorldModel('Draft');
  STORED_SHA = text(world.ModelCell(pr3Model.ID, 'ArtifactSha256'));
  StoredRunOf = (m) => m.RunID;
  // The delivery M2.3's trainer registered for that run is exactly the one the guard rebuilds from the stored run.
  RebuiltDelivery = (m) => text(world.ModelCell(m.ID, 'Delivery'));
  OtherDelivery = () => text(world.ModelCell(world.WorldModel('Draft', 'model').ID, 'Delivery'));
  PreChangeRow = (fields) => world.PersistedCopy(pr3Model, {
    Delivery: fields.Delivery ?? null,
    ...(fields.ArtifactSha256 !== undefined ? { ArtifactSha256: fields.ArtifactSha256 } : {}),
    ...(fields.Lineage !== undefined ? { Lineage: fields.Lineage } : {}),
    ...(fields.Run !== undefined ? { TrainingRunID: fields.Run } : {}),
  });
  GateProducedRow = () => world.SavedModel('Draft');
  FinishedRun = (fields) => {
    const m = world.WorldModel('Draft');
    const run = world.FinishedRunOf(m, flagged);
    if (run.Status !== fields.Status) throw new Error(`the world's run is ${run.Status}, not ${fields.Status}`);
    return run;
  };
});

describe('PredictiveStudioEvidenceGuard — the plan cases', () => {
  it('allows the pre-change back-fill\'s first write of Delivery and ArtifactSha256 with the migration\'s authorisation', async () => {
    const legacy = PreChangeRow({ Delivery: null, ArtifactSha256: null, Run: StoredRunOf(pr3Model) });
    EvidenceWriteAuthorisations.Instance.Authorise(legacy, ['Delivery', 'ArtifactSha256']);
    legacy.Delivery = RebuiltDelivery(pr3Model); legacy.ArtifactSha256 = STORED_SHA;
    expect(await EvidenceGuardHook(legacy, user)).toBe(true);
  });
  it('refuses an authorised first Delivery that differs from the one rebuilt from the stored run', async () => {
    const legacy = PreChangeRow({ Delivery: null, Run: StoredRunOf(pr3Model) });
    EvidenceWriteAuthorisations.Instance.Authorise(legacy, ['Delivery']);
    legacy.Delivery = OtherDelivery();
    expect(await EvidenceGuardHook(legacy, user)).toContain('delivery does not match the stored run');
  });
  it('refuses a second write of Delivery or ArtifactSha256', async () => {
    const saved = GateProducedRow();
    EvidenceWriteAuthorisations.Instance.Authorise(saved, ['Delivery']);
    saved.Delivery = OtherDelivery();
    expect(await EvidenceGuardHook(saved, user)).toContain('stored evidence is write-once');
  });
  it('refuses a first Delivery written onto a pre-change row without the migration\'s authorisation (agent, GraphQL)', async () => {
    for (const actorUser of [agentUser, graphQlUser]) {
      const legacy = PreChangeRow({ Delivery: null });
      legacy.Delivery = RebuiltDelivery(pr3Model);
      expect(await EvidenceGuardHook(legacy, actorUser)).toContain('stored evidence is write-once');
    }
  });
  it('refuses an agent-authored change of a finished run\'s stored leakage audit', async () => {
    const run = FinishedRun({ Status: 'Completed' });
    run.ValidationResults = WithLeakageFlags(run.ValidationResults, []);
    expect(await EvidenceGuardHook(run, user)).toContain('stored evidence is write-once');
  });
});

describe('PredictiveStudioEvidenceGuard — the rest of the rule', () => {
  it('a second write of ArtifactSha256 is refused, authorised or not', async () => {
    const saved = GateProducedRow();
    EvidenceWriteAuthorisations.Instance.Authorise(saved, ['ArtifactSha256']);
    saved.ArtifactSha256 = 'b'.repeat(64);
    expect(await EvidenceGuardHook(saved, user)).toContain('stored evidence is write-once');
  });
  it('the authorisation is taken by the save it authorises: a refused save leaves none behind', async () => {
    const legacy = PreChangeRow({ Delivery: null, Run: StoredRunOf(pr3Model) });
    EvidenceWriteAuthorisations.Instance.Authorise(legacy, ['Delivery']);
    legacy.Delivery = OtherDelivery();
    expect(await EvidenceGuardHook(legacy, user)).toContain('delivery does not match the stored run');
    expect(EvidenceWriteAuthorisations.Instance.Take(legacy)).toEqual([]);
    legacy.Delivery = RebuiltDelivery(pr3Model);
    expect(await EvidenceGuardHook(legacy, user)).toContain('stored evidence is write-once');
  });
  it('a stored Lineage is write-once; a first Lineage on an existing row is allowed (the plan restricts only Delivery and ArtifactSha256)', async () => {
    const lineaged = PreChangeRow({ Delivery: RebuiltDelivery(pr3Model), Lineage: '{"renumberedFrom":3}' });
    lineaged.Lineage = '{"renumberedFrom":4}';
    expect(await EvidenceGuardHook(lineaged, user)).toContain('stored evidence is write-once');
    const bare = PreChangeRow({ Delivery: RebuiltDelivery(pr3Model), Lineage: null });
    bare.Lineage = '{"renumberedFrom":4}';
    expect(await EvidenceGuardHook(bare, user)).toBe(true);
  });
  it('a create may carry its evidence (the trainer creates the row with Delivery set)', async () => {
    const created = world.NewModel({ PipelineID: GateWorld.PipelineID, Version: 1, Status: 'Draft', ArtifactStatus: 'verified', ServingWhileUnevaluated: false });
    created.Delivery = RebuiltDelivery(pr3Model); created.ArtifactSha256 = STORED_SHA; created.Lineage = '{}';
    EvidenceWriteAuthorisations.Instance.Authorise(created, ['Delivery']);
    expect(await EvidenceGuardHook(created, user)).toBe(true);
    expect(EvidenceWriteAuthorisations.Instance.Take(created)).toEqual([]);   // taken by the create too: none outlives its save
  });
  it('a Running run\'s ValidationResults may change; a finished run saved with it unchanged passes', async () => {
    const m = world.WorldModel('Draft');
    world.SetRunCell(m.RunID, 'Status', 'Running');
    const running = world.LoadRun(m.RunID);
    running.ValidationResults = WithLeakageFlags(running.ValidationResults, flagged);
    expect(await EvidenceGuardHook(running, user)).toBe(true);
    const finished = FinishedRun({ Status: 'Completed' });
    finished.Notes = 'annotated';
    expect(await EvidenceGuardHook(finished, user)).toBe(true);
  });
  it('fails closed when the stored row is unreadable, and passes the same save once the row reads', async () => {
    const saved = GateProducedRow();
    world.Store.ReadLog.FailNext('MJ: ML Models');
    saved.StatusReason = 'noted';
    expect(await EvidenceGuardHook(saved, user)).toContain('stored-row-unreadable');
    expect(await EvidenceGuardHook(saved, user)).toBe(true);
  });
});
