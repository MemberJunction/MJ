import { describe, it, expect } from 'vitest';
import { OrdinalCompare } from '@memberjunction/global';
import type { PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PredictionUnitRowReader } from '../unit-row-reader';
import type { ICountingDataAccess, CountRowsResult, FetchRowsParams, FetchRowsResult, SourceRow } from '../../feature-assembly/data-access';
import type { IAssemblyMetadata, AssemblyEntityInfo } from '../../feature-assembly/assembly-metadata';

const tables: Record<string, SourceRow[]> = {
  Periods: [
    // P1: next period 365 days later → renewed=1
    { ID: 'a1', PersonID: 'A', PeriodIndex: 1, OrderDate: '2022-01-10' },
    { ID: 'a2', PersonID: 'A', PeriodIndex: 2, OrderDate: '2023-01-10' },
    // a2's next period is missing → renewed=0 (window closes 2024-02-14 <= cutoff)
    // B: next period 401 days later → outside the 400-day window → 0
    { ID: 'b1', PersonID: 'B', PeriodIndex: 1, OrderDate: '2022-03-01' },
    { ID: 'b2', PersonID: 'B', PeriodIndex: 2, OrderDate: '2023-04-06' },
    // C: P2 dated on or before P1 → label known at decision → excluded
    { ID: 'c1', PersonID: 'C', PeriodIndex: 1, OrderDate: '2022-06-01' },
    { ID: 'c2', PersonID: 'C', PeriodIndex: 2, OrderDate: '2022-06-01' },
    // D: decided 2025-07-01, window would close 2026-08-05 > cutoff 2026-07-30 → censored
    { ID: 'd1', PersonID: 'D', PeriodIndex: 1, OrderDate: '2025-07-01' },
  ],
  Orders: [{ ID: 'o1', OrderDate: '2026-07-30' }, { ID: 'o2', OrderDate: '2025-01-01' }],
  People: [{ ID: 'A' }, { ID: 'B' }, { ID: 'C' }, { ID: 'D' }],
};

class TableDataAccess implements ICountingDataAccess {
  async fetchRows(p: FetchRowsParams): Promise<FetchRowsResult> {
    let rows = [...(tables[p.EntityName] || [])];
    if (p.OrderBy?.includes('DESC')) {
      const field = /\[(\w+)\]/.exec(p.OrderBy)?.[1] || '';
      rows.sort((x, y) => OrdinalCompare(String(y[field]), String(x[field])));   // ordinal, like the database
    }
    return { Success: true, Rows: rows.slice(0, p.MaxRows ?? rows.length), TotalRowCount: rows.length };
  }
  async fetchEmbedding(): Promise<number[] | null> { return null; }
  async CountRows(p: { EntityName: string }): Promise<CountRowsResult> { return { Success: true, Count: (tables[p.EntityName] || []).length }; }
}

const field = (Name: string, TSType: 'string' | 'number' | 'Date' | 'boolean' = 'string') => ({ Name, SqlType: 'nvarchar', TSType, AllowUpdateAPI: false, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
const entities: Record<string, AssemblyEntityInfo> = {
  Periods: { ID: 'E-P', Name: 'Periods', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('PersonID'), field('PeriodIndex', 'number'), field('OrderDate', 'Date')] },
  Orders: { ID: 'E-O', Name: 'Orders', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('OrderDate', 'Date')] },
  People: { ID: 'E-PE', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID')] },
};
const metadata: IAssemblyMetadata = { Entity: (n) => entities[n] || null };

const unit: PredictionUnitSpec = {
  id: 'U1', lineageRootId: 'U1', version: 1, name: 'mini renewal unit',
  rows: { kind: 'grain-x-periods', grainEntity: 'People', childEntity: 'Periods', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] },
  label: { rule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, windowDays: 400, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Orders', field: 'OrderDate' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'outreach', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};

describe('PredictionUnitRowReader', () => {
  it('yields resolved person-periods with their labels and counts every exclusion', async () => {
    const out = await new PredictionUnitRowReader().Read(unit, { DataAccess: new TableDataAccess(), Metadata: metadata, Read: { mode: 'complete' }, Now: new Date('2026-10-12T00:00:00Z') });
    expect(out.Status).toBe('read');
    if (out.Status !== 'read') return;
    expect(out.Rows.map((r) => [r.RowId, r.Label])).toEqual([
      ['a1', '1'], ['b1', '0'], ['c2', '0'], ['a2', '0'], ['b2', '0'],
    ]);
    expect(out.Counts).toEqual({ rowsRead: 7, censoredRowsExcluded: 1, labelKnownRowsExcluded: 1, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 5, dataCutoff: '2026-07-30' });
    expect(out.Rows[0].EntityKey).toBe('A');
    expect(out.Rows[0].DecisionDate.toISOString()).toBe('2022-01-10T00:00:00.000Z');
  });
  it('refuses a unit whose row entity is not registered', async () => {
    const out = await new PredictionUnitRowReader().Read({ ...unit, rows: { kind: 'grain-x-periods', grainEntity: 'People', childEntity: 'Nope', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] } }, { DataAccess: new TableDataAccess(), Metadata: metadata, Read: { mode: 'complete' }, Now: new Date() });
    expect(out).toEqual({ Status: 'refused', Refusal: { stage: 'unit', reason: { kind: 'unresolved-reference', entity: 'Nope', field: null } } });
  });
  it('excludes an empty-string label as unlabelled instead of keeping it as a class', async () => {
    tables.Grain = [{ ID: 'g1', D: '2020-01-01', Y: 'yes' }, { ID: 'g2', D: '2020-01-01', Y: '' }, { ID: 'g3', D: '2020-01-01', Y: 'no' }];
    entities.Grain = { ID: 'E-G', Name: 'Grain', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('D', 'Date'), field('Y')] };
    try {
      const grainUnit: PredictionUnitSpec = {
        ...unit,
        rows: { kind: 'grain', grainEntity: 'Grain', decisionDate: { kind: 'column', column: 'D' }, filter: [] },
        label: { ...unit.label, rule: { kind: 'column', column: 'Y' }, windowDays: 30, outcome: { kind: 'binary', classOrder: ['no', 'yes'], adverseIndex: 0 } },
        censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
      };
      const out = await new PredictionUnitRowReader().Read(grainUnit, { DataAccess: new TableDataAccess(), Metadata: metadata, Read: { mode: 'complete' }, Now: new Date() });
      expect(out.Status === 'read' && out.Counts.emptyLabelRowsExcluded).toBe(1);
      expect(out.Status === 'read' && out.Rows.map((r) => r.Label)).toEqual(['yes', 'no']);
    } finally {
      delete tables.Grain;
      delete entities.Grain;
    }
  });
  it('fails on a period row with no foreign key instead of keying it as "undefined"', async () => {
    tables.Periods.push({ ID: 'x1', PeriodIndex: 1, OrderDate: '2022-02-01' });
    try {
      await expect(new PredictionUnitRowReader().Read(unit, { DataAccess: new TableDataAccess(), Metadata: metadata, Read: { mode: 'complete' }, Now: new Date('2026-10-12T00:00:00Z') })).rejects.toThrow();
    } finally {
      tables.Periods.pop();
    }
  });
  it('fails on a period row with no period index instead of labelling it against period 0', async () => {
    tables.Periods.push({ ID: 'x2', PersonID: 'A', OrderDate: '2022-02-01' });
    try {
      await expect(new PredictionUnitRowReader().Read(unit, { DataAccess: new TableDataAccess(), Metadata: metadata, Read: { mode: 'complete' }, Now: new Date('2026-10-12T00:00:00Z') })).rejects.toThrow(/PeriodIndex/);
    } finally {
      tables.Periods.pop();
    }
  });
});
