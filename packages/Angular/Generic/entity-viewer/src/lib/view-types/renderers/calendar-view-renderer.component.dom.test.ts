/**
 * DOM coverage for <mj-calendar-view-renderer>: what it asks the host for, where records land on
 * screen, the click/open outputs, and the mode switch and settings sheet persisting config.
 * Placement rules themselves are covered in `__tests__/calendar-placement.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJButtonDirective, MJEmptyStateComponent, MJViewToggleComponent } from '@memberjunction/ng-ui-components';
import { Capture, Query, QueryAll, RenderComponentFixture } from '@memberjunction/ng-test-utils';
import { ViewDataRequest } from '../view-type.contracts';
import { CalendarViewConfig } from './calendar-placement';
import { CalendarViewPropSheetComponent } from './calendar-view-prop-sheet.component';
import { CalendarViewRendererComponent } from './calendar-view-renderer.component';

function meetings(withDates = true): EntityInfo {
  return new EntityInfo({
    ID: 'E0000011-0000-0000-0000-000000000011',
    Name: 'Meetings',
    Status: 'Active',
    BaseTable: 'Meeting',
    BaseView: 'vwMeetings',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'F2', Name: 'Title', Type: 'nvarchar', Length: 100, AllowsNull: false, IsNameField: true, Sequence: 1 },
      ...(withDates
        ? [
            { ID: 'F3', Name: 'StartsAt', Type: 'datetimeoffset', AllowsNull: false, DefaultInView: true, Sequence: 2 },
            { ID: 'F4', Name: 'EndsAt', Type: 'datetimeoffset', AllowsNull: true, DefaultInView: true, Sequence: 3 },
          ]
        : []),
    ],
  });
}

const STANDUP = { ID: 'm1', Title: 'Standup', StartsAt: new Date(2026, 10, 16, 9, 0), EndsAt: new Date(2026, 10, 16, 9, 15) };
const OFFSITE = { ID: 'm2', Title: 'Offsite', StartsAt: new Date(2026, 10, 17, 9, 0), EndsAt: new Date(2026, 10, 19, 17, 0) };

function render(config: CalendarViewConfig, entity = meetings(), requests: ViewDataRequest[] = []): ComponentFixture<CalendarViewRendererComponent> {
  return RenderComponentFixture(CalendarViewRendererComponent, {
    imports: [CommonModule, MJButtonDirective, MJViewToggleComponent, MJEmptyStateComponent],
    declarations: [CalendarViewRendererComponent, CalendarViewPropSheetComponent],
    setup: (instance, ref) => {
      instance.dataRequest.subscribe((r) => requests.push(r));
      instance.Anchor = new Date(2026, 10, 18); // a Wednesday; set before the inputs lay the calendar out
      ref.setInput('entity', entity);
      ref.setInput('records', [STANDUP, OFFSITE]);
      ref.setInput('config', config);
    },
  });
}

/** Item labels per column of the day/week layout. */
function columnLabels(fixture: ComponentFixture<unknown>): string[][] {
  return QueryAll(fixture, '.calendar-column').map((col) =>
    Array.from(col.querySelectorAll('.calendar-item-label')).map((el) => el.textContent?.trim() ?? ''),
  );
}

describe('CalendarViewRendererComponent (DOM)', () => {
  it('asks the host for the full record set on init', () => {
    const requests: ViewDataRequest[] = [];
    render({ mode: 'week' }, meetings(), requests);
    expect(requests).toEqual([{ loadAll: true }]);
  });

  it('places records on a Monday-first week, spanning by their end field', () => {
    const fixture = render({ mode: 'week', startFieldName: 'StartsAt', endFieldName: 'EndsAt' });
    expect(columnLabels(fixture)).toEqual([['Standup'], ['Offsite'], ['Offsite'], ['Offsite'], [], [], []]);
  });

  it('keeps every record on its start day without an end field', () => {
    const fixture = render({ mode: 'week' });
    expect(columnLabels(fixture)).toEqual([['Standup'], ['Offsite'], [], [], [], [], []]);
  });

  it('emits the raw record on click (select) and double-click (open)', () => {
    const fixture = render({ mode: 'week' });
    const selected = Capture(fixture.componentInstance.recordSelected);
    const opened = Capture(fixture.componentInstance.recordOpened);
    const chip = Query(fixture, '.calendar-item') as HTMLElement;
    chip.click();
    chip.dispatchEvent(new MouseEvent('dblclick'));
    expect(selected).toEqual([STANDUP]);
    expect(opened).toEqual([STANDUP]);
  });

  it('renders a Monday-first month grid', () => {
    const fixture = render({});
    expect(QueryAll(fixture, '.calendar-weekday').map((el) => el.textContent?.trim())).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    expect(QueryAll(fixture, '.calendar-cell').length % 7).toBe(0);
  });

  it('persists a mode switch as config', () => {
    const fixture = render({ mode: 'month' });
    const changes = Capture(fixture.componentInstance.configChanged);
    const weekButton = QueryAll(fixture, '.mj-view-toggle-btn').find((b) => b.textContent?.trim() === 'Week') as HTMLElement;
    weekButton.click();
    fixture.detectChanges();
    expect(changes).toEqual([{ mode: 'week' }]);
    expect(QueryAll(fixture, '.calendar-column')).toHaveLength(7);
  });

  it('picks the end field from the settings sheet and persists it', () => {
    const fixture = render({ mode: 'week' });
    const changes = Capture(fixture.componentInstance.configChanged);
    (Query(fixture, 'button[title="Calendar settings"]') as HTMLElement).click();
    fixture.detectChanges();
    const endSelect = QueryAll(fixture, 'mj-calendar-view-prop-sheet select')[1] as HTMLSelectElement;
    endSelect.value = 'EndsAt';
    endSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(changes).toEqual([{ mode: 'week', endFieldName: 'EndsAt' }]);
    expect(columnLabels(fixture)[3]).toEqual(['Offsite']);
  });

  it('shows an empty state for an entity with no date fields', () => {
    const fixture = render({}, meetings(false));
    expect(Query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(Query(fixture, '.calendar-view-chrome')).toBeNull();
  });
});
