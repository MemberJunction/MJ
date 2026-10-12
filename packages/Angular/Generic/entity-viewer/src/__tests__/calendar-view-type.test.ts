/**
 * Calendar view type — the descriptor's availability rule, and that the type stays invisible until
 * its `MJ: View Types` row exists (registering the class alone changes nothing).
 */
import { describe, expect, it } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type { MJViewTypeEntity } from '@memberjunction/core-entities';
import { CalendarViewType, LoadViewTypeDescriptors, ViewTypeEngine } from '../lib/view-types';
import { CalendarViewRendererComponent } from '../lib/view-types/renderers/calendar-view-renderer.component';
import { CalendarViewPropSheetComponent } from '../lib/view-types/renderers/calendar-view-prop-sheet.component';

LoadViewTypeDescriptors();

function entityWith(fields: Array<{ Name: string; Type: string }>): EntityInfo {
  return new EntityInfo({
    ID: 'E0000010-0000-0000-0000-000000000010',
    Name: 'Things',
    Status: 'Active',
    BaseTable: 'Thing',
    BaseView: 'vwThings',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      ...fields.map((f, i) => ({ ID: `F${i + 2}`, AllowsNull: true, Sequence: i + 1, ...f })),
    ],
  });
}

function seedViewTypes(rows: Array<{ ID: string; DriverClass: string; Name: string }>): void {
  (ViewTypeEngine.Instance as unknown as { _viewTypes: MJViewTypeEntity[] })._viewTypes = rows as unknown as MJViewTypeEntity[];
}

describe('CalendarViewType', () => {
  it('is available for an entity with a date field', () => {
    expect(new CalendarViewType().IsAvailableFor(entityWith([{ Name: 'StartsAt', Type: 'datetimeoffset' }]))).toBe(true);
    expect(new CalendarViewType().IsAvailableFor(entityWith([{ Name: 'DueDate', Type: 'date' }]))).toBe(true);
  });

  it('is not available for an entity without one', () => {
    expect(new CalendarViewType().IsAvailableFor(entityWith([{ Name: 'Title', Type: 'nvarchar' }]))).toBe(false);
  });

  it('does not count the __mj_ timestamps every entity has', () => {
    const stamps = [{ Name: '__mj_CreatedAt', Type: 'datetimeoffset' }, { Name: '__mj_UpdatedAt', Type: 'datetimeoffset' }];
    expect(new CalendarViewType().IsAvailableFor(entityWith([{ Name: 'Title', Type: 'nvarchar' }, ...stamps]))).toBe(false);
    expect(new CalendarViewType().IsAvailableFor(entityWith([...stamps, { Name: 'DueDate', Type: 'date' }]))).toBe(true);
  });

  it('mounts the calendar renderer and offers its prop sheet', () => {
    const d = new CalendarViewType();
    expect(d.Name).toBe('CalendarViewType');
    expect(d.RendererComponent).toBe(CalendarViewRendererComponent);
    expect(d.PropSheetComponent).toBe(CalendarViewPropSheetComponent);
  });

  it('resolves by DriverClass once registered', () => {
    expect(ViewTypeEngine.Instance.GetDescriptor('CalendarViewType')?.Name).toBe('CalendarViewType');
  });

  it('adds nothing to the switcher while no MJ: View Types row names it', () => {
    seedViewTypes([{ ID: 'VT-TIMELINE', DriverClass: 'TimelineViewType', Name: 'Timeline' }]);
    const rows = ViewTypeEngine.Instance.GetAvailableViewTypeRows(entityWith([{ Name: 'StartsAt', Type: 'datetimeoffset' }]));
    expect(rows.map((r) => r.Descriptor.Name)).toEqual(['TimelineViewType']);
  });

  it('appears in the switcher once its row exists', () => {
    seedViewTypes([
      { ID: 'VT-TIMELINE', DriverClass: 'TimelineViewType', Name: 'Timeline' },
      { ID: 'VT-CALENDAR', DriverClass: 'CalendarViewType', Name: 'Calendar' },
    ]);
    const rows = ViewTypeEngine.Instance.GetAvailableViewTypeRows(entityWith([{ Name: 'StartsAt', Type: 'datetimeoffset' }]));
    expect(rows.map((r) => r.Descriptor.Name)).toEqual(['TimelineViewType', 'CalendarViewType']);
  });
});
