import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceTypeEngine, type MJResourceTypeEntity } from '@memberjunction/core-entities';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { GateContexts } from '../../registry/gate-seams';
import type { RegistryContext } from '../../registry/registry-context';
import { RunViewMonitoringStore, UserNotificationMonitoringNotifier } from '../monitoring-store';

/** Task M6.3 — the monitoring job's production store and notifier over the registry's in-memory provider. */
const CURRENT = '6B000000-0000-4000-8000-0000000000A1';
const PREDECESSOR = '6B000000-0000-4000-8000-0000000000A2';
const OLDER = '6B000000-0000-4000-8000-0000000000A3';
const RECORDS_RESOURCE_TYPE_ID = '6B000000-0000-4000-8000-0000000000C1';

let store: GateTestStore;
let ctx: RegistryContext;

beforeEach(() => {
  store = new GateTestStore();
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  for (const [id, version] of [[CURRENT, 3], [PREDECESSOR, 2], [OLDER, 1]] as const) {
    store.Insert('MJ: ML Models', { ID: id, PipelineID: GateWorld.PipelineID, Version: version, Status: id === CURRENT ? 'Published' : 'Archived', OutputSemantics: null });
  }
});

/** An applied `publish` record of `modelId` replacing `replaces`, recorded at `at`. */
function PublishRecord(id: string, modelId: string, replaces: string | null, at: string, kind: 'publish' | 'refusal' = 'publish'): void {
  store.Insert('MJ: ML Model Publish Records', { ID: id, ModelID: modelId, Kind: kind, Purpose: 'publish', ReplacesModelID: replaces, RecordedAt: new Date(at) });
}

describe('RunViewMonitoringStore.Predecessor', () => {
  it('is the model the newest applied publish record replaced, read as stored now', async () => {
    PublishRecord('6B000000-0000-4000-8000-0000000000B1', CURRENT, OLDER, '2026-01-01T00:00:00Z');
    PublishRecord('6B000000-0000-4000-8000-0000000000B2', CURRENT, PREDECESSOR, '2026-03-01T00:00:00Z');
    PublishRecord('6B000000-0000-4000-8000-0000000000B3', CURRENT, OLDER, '2026-04-01T00:00:00Z', 'refusal');
    const predecessor = await new RunViewMonitoringStore().Predecessor(CURRENT, ctx);
    expect(predecessor?.ModelID).toBe(PREDECESSOR);
    expect([predecessor?.Model?.ID, predecessor?.Model?.Status]).toEqual([PREDECESSOR, 'Archived']);
  });

  it('is null when the newest publish record replaced none, or the model has none', async () => {
    expect(await new RunViewMonitoringStore().Predecessor(CURRENT, ctx)).toBeNull();
    PublishRecord('6B000000-0000-4000-8000-0000000000B4', CURRENT, null, '2026-03-01T00:00:00Z');
    expect(await new RunViewMonitoringStore().Predecessor(CURRENT, ctx)).toBeNull();
  });

  it('a failed read throws (a failed read is not "no predecessor")', async () => {
    store.ReadLog.FailNext('MJ: ML Model Publish Records');
    await expect(new RunViewMonitoringStore().Predecessor(CURRENT, ctx)).rejects.toThrow('publish records');
  });
});

describe('RunViewMonitoringStore rows', () => {
  it('LoadModel is null for a model that is gone; TaskOf names a model without OutputSemantics', async () => {
    const s = new RunViewMonitoringStore();
    expect(await s.LoadModel('6B000000-0000-4000-8000-0000000000FF', ctx)).toBeNull();
    const model = await s.LoadModel(CURRENT, ctx);
    expect(model).not.toBeNull();
    if (model !== null) expect(() => s.TaskOf(model)).toThrow(`ML Model ${CURRENT} has no readable OutputSemantics`);
  });

  it('LoadBinding throws naming a binding that is gone', async () => {
    await expect(RunViewMonitoringStore.LoadBinding('6B000000-0000-4000-8000-0000000000C1', ctx)).rejects.toThrow('scoring binding 6B000000-0000-4000-8000-0000000000C1 is gone');
  });
});

describe('UserNotificationMonitoringNotifier', () => {
  // The record link goes through the Records resource type by name; no test loads the real engine.
  beforeEach(async () => {
    const recordsType = await store.Provider().GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', GateWorld.User);
    recordsType.ID = RECORDS_RESOURCE_TYPE_ID;
    vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
  });
  afterEach(() => vi.restoreAllMocks());

  it('links the notification to its subject as a record of the subject\'s own entity', async () => {
    await new UserNotificationMonitoringNotifier().Notify(GateWorld.User.ID, 'title', 'message', { Entity: 'MJ: ML Scoring Runs', RecordID: CURRENT }, ctx);
    const row = (store.Tables['MJ: User Notifications'] || [])[0];
    expect(row).toMatchObject({ UserID: GateWorld.User.ID, Title: 'title', Message: 'message', Unread: true, ResourceTypeID: RECORDS_RESOURCE_TYPE_ID, ResourceRecordID: CURRENT });
    expect(JSON.parse(String(row?.['ResourceConfiguration']))).toEqual({ Entity: 'MJ: ML Scoring Runs', RecordID: CURRENT });
  });

  it('a notification about no record carries no record link (never an empty ID)', async () => {
    await new UserNotificationMonitoringNotifier().Notify(GateWorld.User.ID, 'title', 'message', null, ctx);
    const row = (store.Tables['MJ: User Notifications'] || [])[0];
    expect(row).toBeDefined();
    expect([row?.['ResourceRecordID'] ?? null, row?.['ResourceConfiguration'] ?? null, row?.['ResourceTypeID'] ?? null]).toEqual([null, null, null]);
  });

  it('a notification that does not save throws naming the user', async () => {
    store.FailNext('MJ: User Notifications', 'the notification store is down');
    await expect(new UserNotificationMonitoringNotifier().Notify(GateWorld.User.ID, 'title', 'message', null, ctx)).rejects.toThrow(`saving the notification to user ${GateWorld.User.ID} failed`);
  });
});
