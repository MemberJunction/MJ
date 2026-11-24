/**
 * `AutomatedPublisher`, `PublishNotifications` and the gate's `CheckInitiator` (Task M4b.1), over the `GateTestStore`
 * world the lifecycle gate's tests use. The plan's six cases come first, verbatim but for `agentRun.ID` in the rollback
 * case (the plan writes `agentRun` there and `agentRun.ID` in the second case; the agent run is one row); the cases after
 * them are this task's additions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WellKnownUserSource } from '@memberjunction/core';
import { ResourceTypeEngine, type MJMLModelPublishRecordEntity, type MJResourceTypeEntity } from '@memberjunction/core-entities';
import type { Actor, HumanActor } from '@memberjunction/predictive-studio-core';

import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeClock, GateTestStore, GateWorld, type EntityGrant, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { SignOffService } from '../../governance/sign-off-service';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { AutomatedPublisher } from '../automated-publisher';
import type { GateContext, PublishRequest } from '../gate-context';
import { GateContexts } from '../gate-seams';
import { LifecycleGate } from '../lifecycle-gate';
import { PublishNotifications } from '../publish-notifications';
import { PublishRecords } from '../publish-records';

const RECIPIENT = '6A1D2E3F-0000-4000-8000-00000000C001';
const AGENT_USER = '6A1D2E3F-0000-4000-8000-00000000C002';
const JOB_OWNER = '6A1D2E3F-0000-4000-8000-00000000C003';
const RECORDS_RESOURCE_TYPE_ID = '6A1D2E3F-0000-4000-8000-00000000C004';
const NOON = Date.parse('2026-11-16T12:00:00.000Z');
const human: HumanActor = { kind: 'human', userId: GateWorld.User.ID };

const log: string[] = [];
const storage = new MemoryStorageAccount('automated-publisher', log);
RegisterMemoryStorage('PS Automated Publisher Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Automated Publisher Test Storage', 'PS Automated Publisher Test Storage', true);

let store: GateTestStore;
let world: GateWorld;
let clock: FakeClock;
let gate: LifecycleGate;
let publisher: AutomatedPublisher;
let ctx: GateContext;
let model: WorldModel;
let run: { readonly ID: string };
let noSignalRun: { readonly ID: string };
let noSignalRun2: { readonly ID: string };
let archived: WorldModel;
let otherModel: WorldModel;
let processRun: { readonly ID: string; readonly StartedByUserID: string };
let agentRun: { readonly ID: string; readonly UserID: string | null };
let request: PublishRequest;

/** The auto-train initiator of a Process Run. */
const autoTrain = (processRunId: string): Actor => ({ kind: 'system', component: 'auto-train', processRunId });
/** The agent initiator of an agent run. */
const agent = (agentRunId: string): Actor => ({ kind: 'agent', agentRunId });
/** Every grant the applied publish writes with as the caller (the gate's `PUBLISH_WRITES`, D4-135), plus reads. */
const PUBLISHER_GRANTS: Readonly<Record<string, Partial<EntityGrant>>> = {
  'MJ: ML Models': { CanRead: true, CanUpdate: true },
  'MJ: ML Output Bindings': { CanRead: true, CanCreate: true },
  'MJ: ML Model Publish Records': { CanRead: true, CanCreate: true },
  'MJ: Scheduled Jobs': { CanRead: true, CanCreate: true, CanUpdate: true },
};
/** A user whose role grants exactly these entity permissions (the store's entities answer them). */
const UserWithPermissions = (grants: Readonly<Record<string, Partial<EntityGrant>>>) => store.UserWithPermissions(grants);

beforeEach(async () => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  model = world.Model('Draft', 'model');
  run = { ID: model.RunID };
  noSignalRun = world.RunWithoutModel('no-signal');
  noSignalRun2 = world.RunWithoutModel('no-signal');
  archived = world.Model('Archived', 'model');
  otherModel = world.Model('Validated', 'model');
  processRun = { ID: world.ProcessRun(RECIPIENT).ID, StartedByUserID: RECIPIENT };
  agentRun = world.AgentRun(AGENT_USER);
  clock = new FakeClock();
  clock.NowMs = NOON;
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), clock, new RecordingScoringActions());
  publisher = new AutomatedPublisher(gate, new PublishNotifications(clock));
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  request = { modelId: model.ID, purpose: 'publish', initiator: autoTrain(processRun.ID), signOffId: null, reason: null };
  // Notifications link through the Records resource type by name; no test loads the real engine.
  const recordsType = await store.Provider().GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', GateWorld.User);
  recordsType.ID = RECORDS_RESOURCE_TYPE_ID;
  vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
  // The gate's write identity (D4-134): the server's system user, as the database provider's user source answers it.
  vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(GateWorld.SystemUser);
});

describe('AutomatedPublisher.EvaluateAndPublish (the plan\'s cases)', () => {
  it('publishes a stored model outcome and notifies the initiator\'s user', async () => {
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toMatchObject({ Kind: 'published', Approver: 'automated-gate' });
    expect(store.Notifications(processRun.StartedByUserID)).toHaveLength(1);
  });
  it('records a refusal for an attempt stopped at Evaluate (no-signal)', async () => {
    expect(await publisher.EvaluateAndPublish(noSignalRun.ID, agent(agentRun.ID), ctx)).toMatchObject({ Kind: 'run-recorded', TrainingRunID: noSignalRun.ID });
    expect(store.PublishRecordsOfRun(noSignalRun.ID)).toEqual([expect.objectContaining({ Kind: 'refusal', Purpose: 'evaluate', ModelID: null, Refusal: expect.stringContaining('gate-no-signal') })]);
  });
  it('a second withheld attempt of the same kind on the same day sends no second notification', async () => {
    await publisher.EvaluateAndPublish(noSignalRun.ID, autoTrain(processRun.ID), ctx);
    await publisher.EvaluateAndPublish(noSignalRun2.ID, autoTrain(processRun.ID), ctx);   // same pipeline and refusal kind, same day
    expect(store.Notifications(processRun.StartedByUserID)).toHaveLength(1);
  });
  it('a Process Run whose user cannot update ML Models is withheld actor-not-permitted and nothing is written', async () => {
    store.SetStatus(model.ID, 'Validated');
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true, CanUpdate: false } });
    const out = await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), { ...ctx, ContextUser: readOnly });
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'system' }, Transient: false });
    expect(store.Status(model.ID)).toBe('Validated');
    expect(store.PublishRecords(model.ID).filter((r) => r.Kind === 'publish')).toHaveLength(0);
  });
  it('refuses a rollback started by an agent initiator', async () => {
    const out = await gate.Publish({ modelId: archived.ID, purpose: 'rollback', initiator: { kind: 'agent', agentRunId: agentRun.ID }, signOffId: null, reason: 'rollback' }, ctx);
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'agent' } });
  });
  it('refuses a sign-off of another model, or a reject, as the approval of a publish', async () => {
    store.SetStatus(model.ID, 'Validated');
    store.PinProtocol(model.ID, { requiresHumanSignOff: true });
    // Both over the evidence this publish rebuilds, so only the ModelID rule and the decision rule refuse them.
    const rebuilt = PublishRecords.EvidenceSha256(await ctx.EvidenceBuilder.Build(model.ID, ctx));
    for (const signOffId of [store.SignOff(otherModel.ID, 'approve', rebuilt), store.SignOff(model.ID, 'reject', rebuilt)]) {
      expect(await gate.Publish({ ...request, initiator: human, signOffId }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
    }
  });
});

describe('the composer: which gate call, which record, which notification', () => {
  it('a published outcome is notified once, linked to the model and keyed by model, kind and UTC day', async () => {
    await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx);
    const label = `ML Model '${GateWorld.PipelineName}' v${store.Row('MJ: ML Models', model.ID)?.['Version']}`;
    expect(store.PublishRecords(model.ID).map((r) => [r.Kind, r.Purpose, r.ApproverKind])).toEqual([['publish', 'publish', 'automated-gate']]);
    expect(store.Notifications(RECIPIENT)).toEqual([expect.objectContaining({
      Title: `Published automatically: ${label}`, Unread: true, ResourceTypeID: RECORDS_RESOURCE_TYPE_ID, ResourceRecordID: model.ID,
      ResourceConfiguration: JSON.stringify({ Entity: 'MJ: ML Models', RecordID: model.ID, Kind: 'published', Day: '2026-11-16' }),
    })]);
    expect(String(store.Notifications(RECIPIENT)[0]['Message'])).toBe(`The lifecycle gate published ${label}; approved by the automated gate.`);
  });
  it('a run stopped at Evaluate is notified on its pipeline, to the agent run\'s user, with the gate\'s words', async () => {
    await publisher.EvaluateAndPublish(noSignalRun.ID, agent(agentRun.ID), ctx);
    const sent = store.Notifications(AGENT_USER);
    expect(sent).toEqual([expect.objectContaining({
      Title: `No model to publish: ML Training Pipeline '${GateWorld.PipelineName}'`, ResourceRecordID: GateWorld.PipelineID,
      ResourceConfiguration: JSON.stringify({ Entity: 'MJ: ML Training Pipelines', RecordID: GateWorld.PipelineID, Kind: 'gate-no-signal', Day: '2026-11-16' }),
    })]);
    expect(String(sent[0]['Message'])).toMatch(new RegExp(`^Training run ${noSignalRun.ID} produced no model to publish\\. The stored gate decision ships nothing: `));
  });
  it('the same kind on the next UTC day is notified again', async () => {
    clock.NowMs = Date.parse('2026-11-16T23:59:59.000Z');
    await publisher.EvaluateAndPublish(noSignalRun.ID, autoTrain(processRun.ID), ctx);
    clock.NowMs += 2_000;
    await publisher.EvaluateAndPublish(noSignalRun2.ID, autoTrain(processRun.ID), ctx);
    expect(store.Notifications(RECIPIENT).map((n) => n['ResourceConfiguration'])).toEqual(['2026-11-16', '2026-11-17'].map((Day) => JSON.stringify({ Entity: 'MJ: ML Training Pipelines', RecordID: GateWorld.PipelineID, Kind: 'gate-no-signal', Day })));
  });
  it('a different refusal kind on the same subject and day is notified again', async () => {
    const keptRule = world.RunWithoutModel('kept-rule');
    await publisher.EvaluateAndPublish(noSignalRun.ID, autoTrain(processRun.ID), ctx);
    await publisher.EvaluateAndPublish(keptRule.ID, autoTrain(processRun.ID), ctx);
    expect(store.Notifications(RECIPIENT).map((n) => n['ResourceConfiguration'])).toEqual(['gate-no-signal', 'kept-existing-rule'].map((Kind) => JSON.stringify({ Entity: 'MJ: ML Training Pipelines', RecordID: GateWorld.PipelineID, Kind, Day: '2026-11-16' })));
  });
  it('a run whose model the gate evaluates to KeepBaseline is withheld keep-baseline-not-auto-published, recorded and notified once', async () => {
    const keep = world.Model('Draft', 'keep');
    const out = await publisher.EvaluateAndPublish(keep.RunID, autoTrain(processRun.ID), ctx);
    expect(out).toMatchObject({ Kind: 'withheld', ModelID: keep.ID, Status: 'KeepBaseline', Refusal: { kind: 'keep-baseline-not-auto-published' }, Transient: false });
    expect(store.PublishRecords(keep.ID).map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
    expect(store.Notifications(RECIPIENT)).toEqual([expect.objectContaining({ Title: `Automatic publish withheld: ML Model '${GateWorld.PipelineName}' v${store.Row('MJ: ML Models', keep.ID)?.['Version']}`, ResourceRecordID: keep.ID })]);
  });
  it('an illegal-transition Evaluate refusal (an Archived model) writes no record and is notified as a withheld publish of the run\'s model', async () => {
    const out = await publisher.EvaluateAndPublish(archived.RunID, autoTrain(processRun.ID), ctx);
    expect(out).toEqual({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'archived', to: 'validated' } });
    expect(store.PublishRecords(archived.ID)).toEqual([]);
    expect(store.Notifications(RECIPIENT)).toEqual([expect.objectContaining({
      ResourceRecordID: archived.ID, ResourceConfiguration: JSON.stringify({ Entity: 'MJ: ML Models', RecordID: archived.ID, Kind: 'illegal-transition', Day: '2026-11-16' }),
    })]);
  });
  it('a scheduled job run notifies its job\'s owner', async () => {
    const jobRun = world.ScheduledJobRun(JOB_OWNER);
    await publisher.EvaluateAndPublish(run.ID, { kind: 'scheduled-job', scheduledJobRunId: jobRun.ID }, ctx);
    expect(store.Notifications(JOB_OWNER)).toHaveLength(1);
  });
  it('a human initiator is interactive: the publish goes through and nobody is notified', async () => {
    expect(await publisher.EvaluateAndPublish(run.ID, human, ctx)).toMatchObject({ Kind: 'published', Approver: 'user' });
    expect(store.Tables['MJ: User Notifications'] || []).toEqual([]);
  });
  it('an unresolvable recipient writes no notification and logs why, and the outcome stands', async () => {
    const status = ConsoleCapture.Status();
    const nobody = world.ProcessRun(null);
    expect(await publisher.EvaluateAndPublish(noSignalRun.ID, autoTrain(nobody.ID), ctx)).toMatchObject({ Kind: 'run-recorded' });
    expect(await publisher.EvaluateAndPublish(noSignalRun2.ID, { kind: 'system', component: 'monitoring' }, ctx)).toMatchObject({ Kind: 'run-recorded' });
    expect(await publisher.EvaluateAndPublish(run.ID, agent('6A1D2E3F-0000-4000-8000-00000000DEAD'), ctx)).toMatchObject({ Kind: 'published' });
    expect(store.Tables['MJ: User Notifications'] || []).toEqual([]);
    expect(ConsoleCapture.Lines(status)).toEqual([
      `Predictive Studio notifications: the gate-no-signal outcome of ML Training Run ${noSignalRun.ID} notifies nobody: Process Run ${nobody.ID} has no StartedByUserID.`,
      `Predictive Studio notifications: the gate-no-signal outcome of ML Training Run ${noSignalRun2.ID} notifies nobody: the monitoring initiator names no Process Run.`,
      `Predictive Studio notifications: the published outcome of ML Model ${model.ID} notifies nobody: AI Agent Run 6A1D2E3F-0000-4000-8000-00000000DEAD was not found.`,
    ]);
  });
  it('a run that does not exist is refused by Evaluate and notifies nobody', async () => {
    const status = ConsoleCapture.Status();
    const missing = '6A1D2E3F-0000-4000-8000-00000000BEEF';
    expect(await publisher.EvaluateAndPublish(missing, autoTrain(processRun.ID), ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: missing } });
    expect(store.Tables['MJ: User Notifications'] || []).toEqual([]);
    expect(ConsoleCapture.Lines(status)).toEqual([`Predictive Studio notifications: the model-not-found outcome of ML Training Run ${missing} notifies nobody: its record was not found.`]);
  });
  it('a notification that cannot be saved is logged and never throws out of the publish', async () => {
    const errors = ConsoleCapture.Errors();
    store.FailingSaves.set('MJ: User Notifications', 'the notification insert failed');
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toMatchObject({ Kind: 'published' });
    expect(store.Status(model.ID)).toBe('Published');
    expect(ConsoleCapture.Lines(errors)).toEqual([
      `Predictive Studio notifications: the published outcome of ML Model ${model.ID} was not notified: Saving the notification to user ${RECIPIENT} failed: the notification insert failed`,
    ]);
  });
  it('a notification without a seeded Records resource type is still sent, without the resource type', async () => {
    const errors = ConsoleCapture.Errors();
    vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockReturnValue(undefined);
    await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx);
    expect(store.Notifications(RECIPIENT)).toEqual([expect.objectContaining({ ResourceTypeID: null, ResourceRecordID: model.ID })]);
    expect(ConsoleCapture.Lines(errors)).toEqual(["Predictive Studio notifications: no 'Records' resource type is seeded; the publish notification has no record link."]);
  });
});

describe('the resume of a run whose model was evaluated before (D4-131, §5.7 R2)', () => {
  it('a Validated model whose publish was refused transiently is published on the next call, one notification per outcome', async () => {
    storage.PutError = 'connection reset';  // MemoryStorageAccount's switch: the artifact load throws
    storage.Configured = false;
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toMatchObject({ Kind: 'withheld', Purpose: 'publish', Refusal: { kind: 'artifact-unverifiable' }, Transient: true });
    expect(store.Status(model.ID)).toBe('Validated');
    storage.PutError = null;
    storage.Configured = true;
    const runsBefore = (store.Tables['MJ: ML Training Runs'] || []).length;
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toMatchObject({ Kind: 'published', Purpose: 'publish', ModelID: model.ID });
    expect((store.Tables['MJ: ML Training Runs'] || []).length).toBe(runsBefore);
    expect(store.PublishRecords(model.ID).map((r) => [r.Kind, r.Kind === 'refusal' ? r.Transient : 'n/a'])).toEqual([['refusal', true], ['publish', 'n/a']]);
    expect(store.Notifications(RECIPIENT).map((n) => GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind'])).toEqual(['artifact-unverifiable', 'published']);
  });
  it('a KeepBaseline model is resumed into the gate\'s KeepBaseline withhold, not retrained', async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    const runsBefore = (store.Tables['MJ: ML Training Runs'] || []).length;
    expect(await publisher.EvaluateAndPublish(keep.RunID, autoTrain(processRun.ID), ctx))
      .toMatchObject({ Kind: 'withheld', Purpose: 'publish', ModelID: keep.ID, Status: 'KeepBaseline', Refusal: { kind: 'keep-baseline-not-auto-published' } });
    expect((store.Tables['MJ: ML Training Runs'] || []).length).toBe(runsBefore);
    expect(store.PublishRecords(keep.ID).map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
  });
  it('an Archived model is not resumed: Evaluate\'s refusal is returned and no publish is attempted', async () => {
    const reads = store.Reads.length;
    expect(await publisher.EvaluateAndPublish(archived.RunID, autoTrain(processRun.ID), ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'archived', to: 'validated' } });
    expect(store.Reads.slice(reads).filter((r) => r.startsWith('query Predictive Studio: Lock'))).toEqual([]);
    expect([store.Status(archived.ID), store.PublishRecords(archived.ID)]).toEqual(['Archived', []]);
  });
  it('a Published model is not resumed: a re-run returns Evaluate\'s refusal, not Publish\'s already-published', async () => {
    const status = ConsoleCapture.Status();
    await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx);
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'published', to: 'validated' } });
    expect(store.PublishRecords(model.ID).map((r) => r.Kind)).toEqual(['publish']);
    expect(ConsoleCapture.Lines(status)).toEqual([`Predictive Studio automated publisher: ML Model ${model.ID} of training run ${run.ID} is already Published; nothing is published and nobody is notified.`]);
  });
  it('a Published model\'s re-run sends no notification (D4-133)', async () => {
    const status = ConsoleCapture.Status();
    await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx);
    const sent = store.Notifications(RECIPIENT).length;
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'illegal-transition', from: 'published' } });
    expect(store.Notifications(RECIPIENT).length - sent).toBe(0);
    expect(ConsoleCapture.Lines(status)).toHaveLength(1);
  });
});

describe('the outcome names its purpose (D4-132)', () => {
  it('published and withheld carry the request\'s purpose; already-published carries the found record\'s', async () => {
    store.SetStatus(model.ID, 'Validated');
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published', Purpose: 'publish' });
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'already-published', Purpose: 'publish' });
    expect(await gate.Publish({ ...request, modelId: archived.ID, purpose: 'rollback', reason: 'restore', initiator: human }, ctx)).toMatchObject({ Kind: 'withheld', Purpose: 'rollback' });
  });
  it('a rollback is notified as "Rolled back automatically", keyed rolled-back; its withheld words name the rollback', async () => {
    const jobRun = world.ScheduledJobRun(JOB_OWNER);
    const initiator: Actor = { kind: 'scheduled-job', scheduledJobRunId: jobRun.ID };
    const notifications = new PublishNotifications(clock);
    await notifications.Notify({ Kind: 'published', Purpose: 'rollback', ModelID: archived.ID, PublishRecordID: 'R1', Replaces: otherModel.ID, Approver: 'automated-gate' }, initiator, ctx);
    await notifications.Notify({ Kind: 'withheld', Purpose: 'rollback', ModelID: otherModel.ID, Status: 'Validated', Refusal: { kind: 'publish-in-progress' }, Transient: true, RefusalRecordID: 'R2' }, initiator, ctx);
    const label = (id: string) => `ML Model '${GateWorld.PipelineName}' v${store.Row('MJ: ML Models', id)?.['Version']}`;
    expect(store.Notifications(JOB_OWNER).map((n) => [n['Title'], n['Message'], GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind']])).toEqual([
      [`Rolled back automatically: ${label(archived.ID)}`, `The lifecycle gate rolled back to ${label(archived.ID)}, replacing ML Model ${otherModel.ID}; approved by the automated gate.`, 'rolled-back'],
      [`Automatic rollback withheld: ${label(otherModel.ID)}`, 'Another publish of this pipeline or model holds its lock; retry later. The refusal is transient; a later attempt can pass.', 'publish-in-progress'],
    ]);
  });
});

describe('a caller without update permission (D4-134: the gate records the refusal with its own write identity)', () => {
  it('a withheld publish is recorded and its StatusReason saved as the system user; the record names the caller as initiator and the gate as approver', async () => {
    store.SetStatus(model.ID, 'Validated');
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true }, 'MJ: ML Model Publish Records': { CanRead: true } });
    const saves = store.SavedAs.length;
    expect(await gate.Publish({ ...request, initiator: human }, { ...ctx, ContextUser: readOnly })).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'human' }, Transient: false });
    const record = store.PublishRecords(model.ID)[0];
    expect([record['Kind'], record['ApproverKind'], record['UserID'], record['Initiator']]).toEqual(['refusal', 'automated-gate', null, JSON.stringify(human)]);
    expect(store.SavedAs.slice(saves)).toEqual([`MJ: ML Models ${model.ID} ${GateWorld.SystemUser.ID}`, `MJ: ML Model Publish Records ${record['ID']} ${GateWorld.SystemUser.ID}`]);
    expect(store.StatusReason(model.ID)).toBe('Publish withheld: A human initiator is not permitted to make this transition.');
  });
  it('a (c) impersonation refusal is written as the caller, who holds every grant: approver user (the caller), not automated-gate (F6)', async () => {
    store.SetStatus(model.ID, 'Validated');
    const someoneElse: Actor = { kind: 'human', userId: '6A1D2E3F-0000-4000-8000-00000000C0DE' };
    const saves = store.SavedAs.length;
    expect(await gate.Publish({ ...request, initiator: someoneElse }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'human' } });
    const record = store.PublishRecords(model.ID)[0];
    expect([record['ApproverKind'], record['UserID'], record['Initiator']]).toEqual(['user', GateWorld.User.ID, JSON.stringify(someoneElse)]);
    expect(store.SavedAs.slice(saves)).toEqual([`MJ: ML Models ${model.ID} ${GateWorld.User.ID}`, `MJ: ML Model Publish Records ${record['ID']} ${GateWorld.User.ID}`]);
  });
  it('a (b) agent-rollback refusal is written as the caller, who holds every grant (F6)', async () => {
    const saves = store.SavedAs.length;
    expect(await gate.Publish({ modelId: archived.ID, purpose: 'rollback', initiator: agent(agentRun.ID), signOffId: null, reason: 'rollback' }, ctx))
      .toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'agent' } });
    const record = store.PublishRecords(archived.ID)[0];
    // An agent attempt's approver is the gate's, as for every agent refusal; it is the caller who saved the row.
    expect([record['ApproverKind'], record['UserID']]).toEqual(['automated-gate', null]);
    expect(store.SavedAs.slice(saves)).toEqual([`MJ: ML Models ${archived.ID} ${GateWorld.User.ID}`, `MJ: ML Model Publish Records ${record['ID']} ${GateWorld.User.ID}`]);
  });
  it('every other refusal is still written as the caller, with the approver it would have had', async () => {
    store.SetStatus(model.ID, 'Validated');
    store.PinProtocol(model.ID, { requiresHumanSignOff: true });
    const saves = store.SavedAs.length;
    expect(await gate.Publish({ ...request, initiator: human }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
    expect(store.SavedAs.slice(saves).every((line) => line.endsWith(GateWorld.User.ID))).toBe(true);
    expect(store.PublishRecords(model.ID).map((r) => [r.Kind, r.ApproverKind, r.UserID])).toEqual([['refusal', 'user', GateWorld.User.ID]]);
  });
  it('an Evaluate of a Draft model is refused actor-not-permitted before its status write: a bare Evaluate writes no record; EvaluateAndPublish records it with the gate\'s identity (D4-143) and notifies it', async () => {
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true } });
    expect(await gate.Evaluate({ modelId: model.ID }, human, { ...ctx, ContextUser: readOnly })).toEqual({ Kind: 'refused', Refusal: { kind: 'actor-not-permitted', actor: 'human' } });
    expect(store.PublishRecords(model.ID)).toEqual([]);
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), { ...ctx, ContextUser: readOnly })).toEqual({ Kind: 'refused', Refusal: { kind: 'actor-not-permitted', actor: 'system' } });
    expect([store.Status(model.ID), store.PublishRecords(model.ID).map((r) => [r['Kind'], r['Purpose'], r['ApproverKind'], r['UserID'], GateTestStore.JsonObjectColumn(r, 'Initiator')])]).toEqual([
      'Draft', [['refusal', 'publish', 'automated-gate', null, autoTrain(processRun.ID)]],
    ]);
    expect(store.Notifications(RECIPIENT).map((n) => GateTestStore.JsonObjectColumn(n, 'ResourceConfiguration')['Kind'])).toEqual(['actor-not-permitted']);
  });
  it('a run-level Evaluate by such a caller writes its run-level record as the system user, approver automated-gate', async () => {
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true }, 'MJ: ML Model Publish Records': { CanRead: true } });
    expect(await gate.Evaluate({ trainingRunId: noSignalRun.ID }, agent(agentRun.ID), { ...ctx, ContextUser: readOnly })).toMatchObject({ Kind: 'run-recorded', TrainingRunID: noSignalRun.ID });
    const record = store.PublishRecordsOfRun(noSignalRun.ID)[0];
    expect([record['Purpose'], record['ApproverKind'], record['Initiator']]).toEqual(['evaluate', 'automated-gate', JSON.stringify(agent(agentRun.ID))]);
    expect(store.SavedAs).toContain(`MJ: ML Model Publish Records ${record['ID']} ${GateWorld.SystemUser.ID}`);
  });
  it('without a system user on the provider the refusal cannot be recorded, and the publish fails loudly', async () => {
    vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(null);
    store.SetStatus(model.ID, 'Validated');
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true } });
    await expect(gate.Publish(request, { ...ctx, ContextUser: readOnly })).rejects.toThrow('no MJ system user is available on this provider');
    expect(store.PublishRecords(model.ID)).toEqual([]);
  });
});

describe('the publish permission rule: every permission the applied publish writes with (D4-135)', () => {
  beforeEach(() => {
    store.SetStatus(model.ID, 'Validated');
  });
  const without = (entityName: string, grant: Partial<EntityGrant>) => ({ ...PUBLISHER_GRANTS, [entityName]: { ...PUBLISHER_GRANTS[entityName], ...grant } });
  it.each([
    ['no CanCreate on publish records', 'MJ: ML Model Publish Records', { CanCreate: false }],
    ['no CanCreate on output bindings', 'MJ: ML Output Bindings', { CanCreate: false }],
    ['no CanCreate on scheduled jobs (the monitoring job)', 'MJ: Scheduled Jobs', { CanCreate: false }],
    ['no CanUpdate on scheduled jobs (the replaced incumbent\'s job)', 'MJ: Scheduled Jobs', { CanUpdate: false }],
  ] as const)('a caller with CanUpdate on ML Models but %s is withheld actor-not-permitted, recorded by the gate', async (_name, entityName, grant) => {
    const caller = UserWithPermissions(without(entityName, grant));
    expect(await gate.Publish(request, { ...ctx, ContextUser: caller })).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'system' }, Transient: false });
    expect(store.PublishRecords(model.ID).map((r) => [r.Kind, r.ApproverKind])).toEqual([['refusal', 'automated-gate']]);
    expect(store.Status(model.ID)).toBe('Validated');
  });
  it('a caller with every publish grant publishes, and every write is saved as that caller', async () => {
    const caller = UserWithPermissions(PUBLISHER_GRANTS);
    const saves = store.SavedAs.length;
    expect(await gate.Publish(request, { ...ctx, ContextUser: caller })).toMatchObject({ Kind: 'published' });
    expect(store.SavedAs.slice(saves).every((line) => line.endsWith(caller.ID))).toBe(true);
  });
  it('Evaluate needs CanUpdate on ML Models and CanCreate on output bindings only', async () => {
    store.SetStatus(model.ID, 'Draft');
    const noBindings = UserWithPermissions(without('MJ: ML Output Bindings', { CanCreate: false }));
    expect(await gate.Evaluate({ modelId: model.ID }, human, { ...ctx, ContextUser: noBindings })).toEqual({ Kind: 'refused', Refusal: { kind: 'actor-not-permitted', actor: 'human' } });
    const evaluator = UserWithPermissions({ 'MJ: ML Models': { CanRead: true, CanUpdate: true }, 'MJ: ML Output Bindings': { CanRead: true, CanCreate: true } });
    expect(await gate.Evaluate({ modelId: model.ID }, human, { ...ctx, ContextUser: evaluator })).toMatchObject({ Kind: 'evaluated', To: 'Validated' });
  });
});

describe('the fake describes only the entities it names (F4)', () => {
  it('EntityByName throws naming any other entity', () => {
    expect(() => store.Provider().EntityByName('MJ: Users')).toThrow("GateTestProvider: EntityByName('MJ: Users')");
  });
  it('a save of a described entity without the permission is refused as BaseEntity refuses it', async () => {
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true } });
    const row = await store.Provider().GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', readOnly);
    row.NewRecord();
    expect(await row.Save()).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toBe(`User: ${readOnly.Email} (ID: ${readOnly.ID}) does not have create permissions on MJ: ML Model Publish Records`);
  });
  it('a model-level refusal record with Purpose evaluate is refused as SQL Server refuses it (CK_MLModelPublishRecord_RunLevel)', async () => {
    const row = await store.Provider().GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', GateWorld.User);
    row.NewRecord();
    row.ModelID = model.ID;
    row.TrainingRunID = run.ID;
    row.Kind = 'refusal';
    row.Purpose = 'evaluate';
    row.ApproverKind = 'automated-gate';
    row.Initiator = JSON.stringify(autoTrain(processRun.ID));
    row.Refusal = JSON.stringify({ kind: 'calibration-held', slope: 0.5 });
    expect(await row.Save()).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toBe('The INSERT statement conflicted with the CHECK constraint "CK_MLModelPublishRecord_RunLevel". The conflict occurred in table "__mj.MLModelPublishRecord".');
    expect(store.PublishRecords(model.ID)).toEqual([]);
  });
});

describe('a model-level Evaluate refusal of a publish attempt is recorded (D4-143)', () => {
  it('EvaluateAndPublish leaves one refusal record, Purpose publish, naming the model, its run and the initiator; a bare Evaluate of the same world writes none', async () => {
    const row = store.Row('MJ: ML Models', model.ID);
    if (!row) throw new Error(`no ML Model ${model.ID}`);
    row['Lineage'] = JSON.stringify({ calibrationHold: { slope: 0.5 } });
    const held = { Kind: 'refused', Refusal: { kind: 'calibration-held', slope: 0.5 } };
    expect(await gate.Evaluate({ trainingRunId: run.ID }, autoTrain(processRun.ID), ctx)).toEqual(held);
    expect(store.PublishRecords(model.ID)).toEqual([]);
    expect(await publisher.EvaluateAndPublish(run.ID, autoTrain(processRun.ID), ctx)).toEqual(held);
    expect(store.PublishRecords(model.ID).map((r) => [
      r['Kind'], r['Purpose'], r['ModelID'], r['TrainingRunID'], r['Transient'], r['ApproverKind'],
      GateTestStore.JsonObjectColumn(r, 'Initiator'), GateTestStore.JsonObjectColumn(r, 'Refusal'),
    ])).toEqual([['refusal', 'publish', model.ID, run.ID, false, 'automated-gate', autoTrain(processRun.ID), held.Refusal]]);
    expect([store.Status(model.ID), store.StatusReason(model.ID)]).toEqual(['Draft', expect.stringContaining('held for calibration')]);
  });
});

describe('LifecycleGate.CheckInitiator (before the locks)', () => {
  beforeEach(() => {
    store.SetStatus(model.ID, 'Validated');
  });
  it('refuses before any lock and records the refusal, not transient', async () => {
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true } });
    const out = await gate.Publish(request, { ...ctx, ContextUser: readOnly });
    expect(out).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'system' }, Transient: false });
    expect(store.Reads.filter((r) => r.startsWith('query Predictive Studio: Lock Pipeline'))).toEqual([]);
    expect(store.PublishRecords(model.ID)).toEqual([expect.objectContaining({ Kind: 'refusal', Purpose: 'publish', Transient: false, Refusal: JSON.stringify({ kind: 'actor-not-permitted', actor: 'system' }) })]);
    expect(store.StatusReason(model.ID)).toBe('Automatic publish withheld: A system initiator is not permitted to make this transition.');
  });
  it('refuses a scheduled-job initiator whose user cannot update ML Models', async () => {
    const jobRun = world.ScheduledJobRun(JOB_OWNER);
    const readOnly = UserWithPermissions({ 'MJ: ML Models': { CanRead: true, CanUpdate: false } });
    expect(await gate.Publish({ ...request, initiator: { kind: 'scheduled-job', scheduledJobRunId: jobRun.ID } }, { ...ctx, ContextUser: readOnly }))
      .toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'scheduled-job' } });
  });
  it('a grant on another entity is not a grant on ML Models', async () => {
    const elsewhere = UserWithPermissions({ 'MJ: ML Training Runs': { CanRead: true, CanUpdate: true } });
    expect(await gate.Publish(request, { ...ctx, ContextUser: elsewhere })).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted' } });
  });
  it('a user granted update on ML Models publishes', async () => {
    // The publish writes as this user: the model, its bindings, its publish record and its monitoring job (D4-135).
    const updater = UserWithPermissions(PUBLISHER_GRANTS);
    expect(await gate.Publish(request, { ...ctx, ContextUser: updater })).toMatchObject({ Kind: 'published' });
  });
  it('refuses a rollback started by a system initiator, and lets a scheduled job or a person roll back', async () => {
    const rollback: PublishRequest = { modelId: archived.ID, purpose: 'rollback', initiator: autoTrain(processRun.ID), signOffId: null, reason: 'rollback' };
    expect(await gate.Publish(rollback, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'system' } });
    const jobRun = world.ScheduledJobRun(JOB_OWNER);
    // Past the initiator check: this archived model was never published, so the purpose rule refuses it instead.
    for (const initiator of [{ kind: 'scheduled-job', scheduledJobRunId: jobRun.ID }, human] satisfies Actor[]) {
      expect(await gate.Publish({ ...rollback, initiator }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'illegal-transition' } });
    }
  });
  it('refuses a human initiator naming a user other than the context user', async () => {
    const someoneElse: HumanActor = { kind: 'human', userId: '6A1D2E3F-0000-4000-8000-00000000C0DE' };
    expect(await gate.Publish({ ...request, initiator: someoneElse }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'actor-not-permitted', actor: 'human' } });
    expect(await gate.Publish({ ...request, initiator: { kind: 'human', userId: GateWorld.User.ID.toLowerCase() } }, ctx)).toMatchObject({ Kind: 'published' });
  });
});

describe('a sign-off of another model, or a reject, over the evidence the publish rebuilds (StoredSignOffLookup as it is)', () => {
  it('neither approves the publish; an approving sign-off of the model itself does', async () => {
    store.SetStatus(model.ID, 'Validated');
    store.SetStatus(otherModel.ID, 'Validated');
    store.PinProtocol(model.ID, { requiresHumanSignOff: true });
    const service = new SignOffService();
    const ofOther = await service.Record({ modelId: otherModel.ID, purpose: 'publish', decision: 'approve', reason: 'reviewed', overridesFlags: [] }, human, ctx);
    const rejected = await service.Record({ modelId: model.ID, purpose: 'publish', decision: 'reject', reason: 'not yet', overridesFlags: [] }, human, ctx);
    const approved = await service.Record({ modelId: model.ID, purpose: 'publish', decision: 'approve', reason: 'reviewed', overridesFlags: [] }, human, ctx);
    if (!ofOther.Ok || !rejected.Ok || !approved.Ok) throw new Error('a sign-off was refused');
    expect(rejected.EvidenceSha256).toBe(approved.EvidenceSha256);
    for (const signOffId of [ofOther.SignOffRecordID, rejected.SignOffRecordID]) {
      expect(await gate.Publish({ ...request, initiator: human, signOffId }, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'no-sign-off' } });
    }
    expect(await gate.Publish({ ...request, initiator: human, signOffId: approved.SignOffRecordID }, ctx)).toMatchObject({ Kind: 'published', Approver: 'user' });
  });
});
