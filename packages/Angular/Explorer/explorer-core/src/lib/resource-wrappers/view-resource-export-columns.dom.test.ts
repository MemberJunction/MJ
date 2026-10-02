/**
 * Explorer's fallback export (Cards, Map, Timeline) types its columns as the grid does.
 *
 * Untyped, a SQL `date` column (a calendar day) exported from these view types as a timestamp, while
 * the grid's own export wrote the day.
 */
import { describe, expect, it } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import type { ExportColumn } from '@memberjunction/export-engine';
import { ExportService } from '@memberjunction/ng-export-service';
import { UserViewResource } from './view-resource.component';

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000006-0000-0000-0000-000000000001',
    Name: 'MJ: Test Payments',
    Status: 'Active',
    BaseTable: 'TestPayment',
    BaseView: 'vwTestPayments',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'F2', Name: 'PaymentDate', DisplayName: 'Payment Date', Type: 'date', AllowsNull: false },
      { ID: 'F3', Name: 'ApprovedAt', Type: 'datetimeoffset', AllowsNull: true },
      { ID: 'F4', Name: 'Amount', Type: 'money', AllowsNull: false },
    ],
  });
}

function exportColumns(resource: UserViewResource): ExportColumn[] {
  return (resource as unknown as { buildExportColumns(): ExportColumn[] }).buildExportColumns();
}

function makeResource(): UserViewResource {
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  const resource = TestBed.runInInjectionContext(() => new UserViewResource(cdr, new ExportService()));
  resource.entityInfo = makeEntity();
  return resource;
}

describe('UserViewResource fallback export columns', () => {
  it('types grid-state columns by their field, matching the column name case-insensitively', () => {
    const resource = makeResource();
    resource.gridState = {
      columnSettings: [
        { ID: 'F2', Name: 'paymentdate', DisplayName: 'Paid' },
        { ID: 'F3', Name: 'ApprovedAt' },
        { ID: 'F4', Name: 'Amount' },
      ],
    };
    expect(exportColumns(resource).map((c) => c.dataType)).toEqual(['dateonly', 'date', 'currency']);
  });

  it('types the entity-field fallback too', () => {
    const resource = makeResource();
    const byName = new Map(exportColumns(resource).map((c) => [c.name, c.dataType]));
    expect(byName.get('PaymentDate')).toBe('dateonly');
    expect(byName.get('ID')).toBe('string');
  });
});
