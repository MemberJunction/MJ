import { describe, it, expect } from 'vitest';
import { MJEventType, type MJEvent } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { IsCockpitEntityChange } from '../ChiefOfStaff/chief-of-staff-live-refresh';

/**
 * The cockpit loads with RunView and otherwise sits still, so a request or run created by a
 * server-side wake stayed invisible until the user refreshed. MJAPI broadcasts every entity
 * save and delete to browsers as a `remote-invalidate` BaseEntity event; the cockpit reloads
 * when one names an entity it shows.
 */

function entityEvent(type: 'save' | 'delete' | 'remote-invalidate', entityName: string): MJEvent {
  const args = type === 'remote-invalidate'
    ? { type, entityName, baseEntity: null, payload: { action: 'save' } }
    : { type, baseEntity: { EntityInfo: { Name: entityName } } };
  return { event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args, component: null } as unknown as MJEvent;
}

describe('IsCockpitEntityChange', () => {
  it('matches a remote save of an entity the cockpit shows', () => {
    expect(IsCockpitEntityChange(entityEvent('remote-invalidate', 'MJ: AI Agent Requests'))).toBe(true);
    expect(IsCockpitEntityChange(entityEvent('remote-invalidate', 'MJ: User Routines'))).toBe(true);
    expect(IsCockpitEntityChange(entityEvent('remote-invalidate', 'MJ_BizApps_Tasks: Tasks'))).toBe(true);
  });

  it('matches a local save or delete of such an entity, whatever the name casing', () => {
    expect(IsCockpitEntityChange(entityEvent('save', 'mj: ai agent requests'))).toBe(true);
    expect(IsCockpitEntityChange(entityEvent('delete', 'MJ: User Routines'))).toBe(true);
  });

  it('ignores entities the cockpit does not show', () => {
    expect(IsCockpitEntityChange(entityEvent('remote-invalidate', 'MJ: Users'))).toBe(false);
    expect(IsCockpitEntityChange(entityEvent('save', 'MJ: Conversation Details'))).toBe(false);
  });

  it('ignores events that are not entity events', () => {
    const other = { event: MJEventType.ComponentEvent, eventCode: 'something-else', args: {}, component: null } as unknown as MJEvent;
    expect(IsCockpitEntityChange(other)).toBe(false);
    const noArgs = { event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args: null, component: null } as unknown as MJEvent;
    expect(IsCockpitEntityChange(noArgs)).toBe(false);
  });
});
