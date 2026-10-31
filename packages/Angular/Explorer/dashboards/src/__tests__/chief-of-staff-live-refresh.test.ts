import { describe, it, expect } from 'vitest';
import { MJEventType, type MJEvent } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { IsChiefOfStaffEntityChange } from '../ChiefOfStaff/chief-of-staff-live-refresh';

/**
 * The Chief of Staff pages load with RunView and otherwise sit still, so a request or run
 * created by a server-side wake stayed invisible until the user refreshed. MJAPI broadcasts
 * every entity save and delete to browsers as a `remote-invalidate` BaseEntity event; a page
 * reloads when one names an entity it shows.
 */

function entityEvent(type: 'save' | 'delete' | 'remote-invalidate', entityName: string): MJEvent {
  const args = type === 'remote-invalidate'
    ? { type, entityName, baseEntity: null, payload: { action: 'save' } }
    : { type, baseEntity: { EntityInfo: { Name: entityName } } };
  return { event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args, component: null } as unknown as MJEvent;
}

describe('IsChiefOfStaffEntityChange', () => {
  it('matches a remote save of an entity the pages show', () => {
    expect(IsChiefOfStaffEntityChange(entityEvent('remote-invalidate', 'MJ: AI Agent Requests'))).toBe(true);
    expect(IsChiefOfStaffEntityChange(entityEvent('remote-invalidate', 'MJ: User Routines'))).toBe(true);
    expect(IsChiefOfStaffEntityChange(entityEvent('remote-invalidate', 'MJ: AI Agent User Policies'))).toBe(true);
  });

  it('does not match an Open App entity: an app that adds a page reloads that page itself', () => {
    expect(IsChiefOfStaffEntityChange(entityEvent('remote-invalidate', 'My_App: Tasks'))).toBe(false);
  });

  it('matches a local save or delete of such an entity, whatever the name casing', () => {
    expect(IsChiefOfStaffEntityChange(entityEvent('save', 'mj: ai agent requests'))).toBe(true);
    expect(IsChiefOfStaffEntityChange(entityEvent('delete', 'MJ: User Routines'))).toBe(true);
  });

  it('ignores entities the pages do not show', () => {
    expect(IsChiefOfStaffEntityChange(entityEvent('remote-invalidate', 'MJ: Users'))).toBe(false);
    expect(IsChiefOfStaffEntityChange(entityEvent('save', 'MJ: Conversation Details'))).toBe(false);
  });

  it('ignores events that are not entity events', () => {
    const other = { event: MJEventType.ComponentEvent, eventCode: 'something-else', args: {}, component: null } as unknown as MJEvent;
    expect(IsChiefOfStaffEntityChange(other)).toBe(false);
    const noArgs = { event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args: null, component: null } as unknown as MJEvent;
    expect(IsChiefOfStaffEntityChange(noArgs)).toBe(false);
  });
});
