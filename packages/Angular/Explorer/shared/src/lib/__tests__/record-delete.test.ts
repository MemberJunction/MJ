/**
 * Tests for the pure decisions behind "a record was deleted": which event names which
 * record, which tabs show it, and how an origin chain sheds it.
 *
 * Uses the real @memberjunction/core (BaseEntity.BaseEventCode, CompositeKey,
 * ResolveEntityEventKey), so the key handling is exercised as it runs in the app.
 */
import { describe, it, expect } from 'vitest';
import { BaseEntity, BaseEntityEvent, CompositeKey } from '@memberjunction/core';
import { MJEvent, MJEventType } from '@memberjunction/global';
import type { WorkspaceTab } from '@memberjunction/ng-base-application';
import {
  GetDeletedRecordFromEvent,
  NormalizeRecordIdForMatch,
  OriginHasReturnTarget,
  OriginToTabConfiguration,
  RecordIdentityMatches,
  RecordTabShowsRecord,
  RemoveDeletedRecordFromOrigin
} from '../record-delete';
import { GetRecordSourceContext, RecordSourceContext } from '../record-open-style';

const WIDGET_ID = 'A1B2C3D4-0000-0000-0000-000000000001';

/** A stand-in for the BaseEntity that raised the event: only what the helpers read. */
function fakeEntity(entityName: string, id: string): BaseEntity {
  const key = new CompositeKey([{ FieldName: 'ID', Value: id }]);
  return { EntityInfo: { Name: entityName }, PrimaryKey: key } as unknown as BaseEntity;
}

function entityEvent(args: Partial<BaseEntityEvent>): MJEvent {
  return {
    event: MJEventType.ComponentEvent,
    eventCode: BaseEntity.BaseEventCode,
    args: { payload: null, baseEntity: null, type: 'other', ...args } as BaseEntityEvent,
    component: {}
  };
}

function recordTab(id: string, entity: string, recordId: string, extra: Record<string, unknown> = {}): WorkspaceTab {
  return {
    id,
    applicationId: 'app-1',
    title: `${entity} ${recordId}`,
    resourceRecordId: recordId,
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: entity, recordId, ...extra }
  } as unknown as WorkspaceTab;
}

describe('GetDeletedRecordFromEvent', () => {
  it('reads a local delete from the entity that raised it', () => {
    const result = GetDeletedRecordFromEvent(entityEvent({ type: 'delete', baseEntity: fakeEntity('MJ: Widgets', WIDGET_ID) }));
    expect(result).toEqual({ EntityName: 'MJ: Widgets', RecordId: `ID|${WIDGET_ID}`, Remote: false });
  });

  it('reads a remote delete from the published key', () => {
    const result = GetDeletedRecordFromEvent(entityEvent({
      type: 'remote-invalidate',
      entityName: 'MJ: Widgets',
      payload: { action: 'delete', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: WIDGET_ID }]) }
    }));
    expect(result).toEqual({ EntityName: 'MJ: Widgets', RecordId: `ID|${WIDGET_ID}`, Remote: true });
  });

  it('ignores a remote save', () => {
    const result = GetDeletedRecordFromEvent(entityEvent({
      type: 'remote-invalidate',
      entityName: 'MJ: Widgets',
      payload: { action: 'save', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: WIDGET_ID }]) }
    }));
    expect(result).toBeNull();
  });

  it('ignores a remote delete whose key the server withheld', () => {
    const result = GetDeletedRecordFromEvent(entityEvent({
      type: 'remote-invalidate',
      entityName: 'MJ: Widgets',
      payload: { action: 'delete', primaryKeyValues: null }
    }));
    expect(result).toBeNull();
  });

  it('ignores local saves and unrelated events', () => {
    expect(GetDeletedRecordFromEvent(entityEvent({ type: 'save', baseEntity: fakeEntity('MJ: Widgets', WIDGET_ID) }))).toBeNull();
    expect(GetDeletedRecordFromEvent({ event: MJEventType.LoggedIn, eventCode: '', args: null, component: {} })).toBeNull();
  });
});

describe('RecordIdentityMatches / NormalizeRecordIdForMatch', () => {
  const deleted = { EntityName: 'MJ: Widgets', RecordId: WIDGET_ID };

  it('ignores case on entity name and id (UUIDs come back in either case)', () => {
    expect(RecordIdentityMatches('mj: widgets', WIDGET_ID.toLowerCase(), deleted)).toBe(true);
  });

  it('treats a full single-field segment as its bare value', () => {
    expect(NormalizeRecordIdForMatch(`ID|${WIDGET_ID}`)).toBe(WIDGET_ID.toLowerCase());
    expect(RecordIdentityMatches('MJ: Widgets', `ID|${WIDGET_ID}`, deleted)).toBe(true);
  });

  it('keeps composite keys whole', () => {
    expect(NormalizeRecordIdForMatch('A|1||B|2')).toBe('a|1||b|2');
  });

  it('does not match another entity or record', () => {
    expect(RecordIdentityMatches('MJ: Gadgets', WIDGET_ID, deleted)).toBe(false);
    expect(RecordIdentityMatches('MJ: Widgets', 'other-id', deleted)).toBe(false);
    expect(RecordIdentityMatches(undefined, WIDGET_ID, deleted)).toBe(false);
  });
});

describe('RecordTabShowsRecord', () => {
  const deleted = { EntityName: 'MJ: Widgets', RecordId: WIDGET_ID };

  it('matches a record tab showing the record', () => {
    expect(RecordTabShowsRecord(recordTab('t1', 'MJ: Widgets', WIDGET_ID), deleted)).toBe(true);
  });

  it('matches whichever id form the tab and the event each use', () => {
    const fromEvent = GetDeletedRecordFromEvent(entityEvent({ type: 'delete', baseEntity: fakeEntity('MJ: Widgets', WIDGET_ID) }));
    expect(fromEvent).not.toBeNull();
    expect(RecordTabShowsRecord(recordTab('t1', 'MJ: Widgets', WIDGET_ID.toLowerCase()), fromEvent!)).toBe(true);
    expect(RecordTabShowsRecord(recordTab('t2', 'MJ: Widgets', `ID|${WIDGET_ID}`), fromEvent!)).toBe(true);
  });

  it('does not match a non-record tab that happens to carry the same id', () => {
    const viewTab = { ...recordTab('t1', 'MJ: Widgets', WIDGET_ID), configuration: { resourceType: 'User Views', Entity: 'MJ: Widgets' } };
    expect(RecordTabShowsRecord(viewTab as WorkspaceTab, deleted)).toBe(false);
  });
});

describe('RemoveDeletedRecordFromOrigin', () => {
  const deleted = { EntityName: 'MJ: Widgets', RecordId: WIDGET_ID };
  const viewOrigin: RecordSourceContext = { sourceAppId: 'app-1', sourceNavLabel: 'Data', sourceTabId: 'view-tab' };

  it('returns the same object when the chain never names the record', () => {
    const origin: RecordSourceContext = { sourceLabel: 'Gadget', sourceRecordEntity: 'MJ: Gadgets', sourceRecordId: 'g1', sourceParentOrigin: viewOrigin };
    expect(RemoveDeletedRecordFromOrigin(origin, deleted)).toBe(origin);
  });

  it('replaces a deleted parent with the parent\'s own origin', () => {
    const origin: RecordSourceContext = { sourceLabel: 'Widget', sourceRecordEntity: 'MJ: Widgets', sourceRecordId: WIDGET_ID, sourceParentOrigin: viewOrigin };
    expect(RemoveDeletedRecordFromOrigin(origin, deleted)).toBe(viewOrigin);
  });

  it('removes the record from deeper in the chain and keeps the links around it', () => {
    const origin: RecordSourceContext = {
      sourceLabel: 'Gadget', sourceRecordEntity: 'MJ: Gadgets', sourceRecordId: 'g1',
      sourceParentOrigin: { sourceLabel: 'Widget', sourceRecordEntity: 'MJ: Widgets', sourceRecordId: WIDGET_ID, sourceParentOrigin: viewOrigin }
    };
    const pruned = RemoveDeletedRecordFromOrigin(origin, deleted);
    expect(pruned).toEqual({ ...origin, sourceParentOrigin: viewOrigin });
    expect(origin.sourceParentOrigin?.sourceRecordId).toBe(WIDGET_ID); // input not mutated
  });

  it('leaves nothing when the deleted record was the whole chain', () => {
    const origin: RecordSourceContext = { sourceLabel: 'Widget', sourceRecordEntity: 'MJ: Widgets', sourceRecordId: WIDGET_ID };
    expect(RemoveDeletedRecordFromOrigin(origin, deleted)).toBeUndefined();
  });
});

describe('OriginHasReturnTarget', () => {
  it('is true for a parent record or a source app', () => {
    expect(OriginHasReturnTarget({ sourceRecordEntity: 'MJ: Widgets', sourceRecordId: 'w1', sourceLabel: 'W' })).toBe(true);
    expect(OriginHasReturnTarget({ sourceAppId: 'app-1' })).toBe(true);
  });

  it('is false for no origin or a label-only origin', () => {
    expect(OriginHasReturnTarget(null)).toBe(false);
    expect(OriginHasReturnTarget(undefined)).toBe(false);
    expect(OriginHasReturnTarget({ sourceLabel: 'Conversation' })).toBe(false);
  });
});

describe('OriginToTabConfiguration', () => {
  it('round-trips through GetRecordSourceContext, chain included', () => {
    const origin: RecordSourceContext = {
      sourceLabel: 'Gadget', sourceRecordEntity: 'MJ: Gadgets', sourceRecordId: 'g1', sourceAppId: 'app-1',
      sourceParentOrigin: { sourceAppId: 'app-1', sourceNavLabel: 'Data', sourceTabId: 'view-tab', sourceQueryParams: { entity: 'Widgets' } }
    };
    const restored = GetRecordSourceContext(OriginToTabConfiguration(origin));
    expect(restored?.sourceRecordId).toBe('g1');
    expect(restored?.sourceParentOrigin?.sourceTabId).toBe('view-tab');
    expect(restored?.sourceParentOrigin?.sourceQueryParams).toEqual({ entity: 'Widgets' });
  });

  it('clears every origin key when the origin is gone', () => {
    const config = OriginToTabConfiguration(undefined);
    expect(Object.values(config).every(v => v === undefined)).toBe(true);
    expect(Object.keys(config)).toContain('sourceParentOrigin');
  });
});
