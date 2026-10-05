/**
 * The entity viewer's Timeline view on a SQL `date` field (a calendar day).
 *
 * The renderer is fed `simple` RunView rows: plain objects with no EntityInfo, so the timeline group
 * can only know the date field is a calendar day from the entity the renderer hands it. TZ is pinned
 * west of Greenwich: a calendar day arrives as UTC midnight, and at UTC it reads right by accident.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { TimelineViewRendererComponent } from '../lib/view-types/renderers/timeline-view-renderer.component';

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000003-0000-0000-0000-000000000003',
    Name: 'Invoices',
    Status: 'Active',
    BaseTable: 'Invoice',
    BaseView: 'vwInvoices',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: true },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 100, AllowsNull: false, DefaultInView: true, IsNameField: true, Sequence: 1 },
      { ID: 'F3', Name: 'DueDate', Type: 'date', AllowsNull: true, DefaultInView: true, Sequence: 2 },
      { ID: 'F4', Name: 'ApprovedAt', Type: 'datetimeoffset', AllowsNull: true, DefaultInView: false, Sequence: 3 },
    ],
  });
}

function render(dateFieldName: string): TimelineViewRendererComponent {
  TestBed.configureTestingModule({
    providers: [{ provide: ChangeDetectorRef, useValue: { detectChanges: () => {}, markForCheck: () => {} } }],
  });
  const renderer = TestBed.runInInjectionContext(() => new TimelineViewRendererComponent());
  renderer.config = { dateFieldName };
  renderer.entity = makeEntity();
  renderer.records = [
    { ID: 'r1', Name: 'Invoice 1', DueDate: '2026-10-01T00:00:00.000Z', ApprovedAt: '2026-10-01T02:30:00.000Z' },
  ];
  return renderer;
}

describe('TimelineViewRendererComponent on a date-only field', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('places a plain-object row on its stored day', () => {
    const renderer = render('DueDate');
    const group = renderer.TimelineGroups[0];
    expect(group.EntityInfo?.Name).toBe('Invoices');
    const date = group.getDate(renderer.records[0]);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 1]);
  });

  it('shows a calendar day on the card without an invented time', () => {
    expect(render('DueDate').TimelineGroups[0].CardConfig?.dateFormat).toBe('MMM d, yyyy');
  });

  it('keeps the time, and the instant, for a timestamp field', () => {
    const renderer = render('ApprovedAt');
    const group = renderer.TimelineGroups[0];
    expect(group.CardConfig?.dateFormat).toBe('MMM d, yyyy h:mm a');
    expect(group.getDate(renderer.records[0]).toISOString()).toBe('2026-10-01T02:30:00.000Z');
  });
});
