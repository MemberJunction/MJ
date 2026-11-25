import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import {
  BuildProposedIndexName,
  PersistIndexProposalsToMJMetadata,
} from '../plugins/index-advisor/IndexProposalPersister';
import type { IndexProposal } from '../plugins/index-advisor/IndexAdvisorTypes';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const FIELD_CUSTOMER = '22222222-2222-2222-2222-222222222201';
const FIELD_TOTAL = '22222222-2222-2222-2222-222222222202';

const PROPOSAL: IndexProposal = {
  SchemaName: 'dbo',
  TableName: 'Orders',
  Columns: ['CustomerID'],
  IncludeColumns: ['Total'],
  Source: 'FKCoverage',
  Reason: 'Foreign key CustomerID has no covering index.',
  Priority: 55,
  Evidence: { RowCount: 50_000 },
};

describe('IndexProposalPersister', () => {
  it('gracefully skips and logs when MJ metadata provider is not configured', async () => {
    const logs: string[] = [];
    const res = await PersistIndexProposalsToMJMetadata([PROPOSAL], {
      Provider: null,
      Log: (m) => logs.push(m),
    });
    expect(res).toMatchObject({ Persisted: 0, Skipped: 1, Errors: [] });
    expect(res.SkippedReason).toBeDefined();
    expect(logs.some((l) => l.includes('skipping MJ metadata persistence'))).toBe(true);
  });

  it('persists proposed indexes with Status=Proposed, Source=DBAutoDoc, Description=Reason, and ordered fields', async () => {
    const savedRecords: Array<{ EntityName: string; Data: Record<string, unknown> }> = [];
    let nextId = 1;

    const ordersEntity = new EntityInfo({
      ID: ENTITY_ID,
      Name: 'Orders',
      SchemaName: 'dbo',
      BaseTable: 'Orders',
      VirtualEntity: false,
      EntityFields: [
        { ID: FIELD_CUSTOMER, EntityID: ENTITY_ID, Name: 'CustomerID', Sequence: 1 },
        { ID: FIELD_TOTAL, EntityID: ENTITY_ID, Name: 'Total', Sequence: 2 },
      ],
      EntityIndexes: [],
    });

    const mockProvider = {
      Entities: [ordersEntity],
      EntityByName: (name: string) =>
        name === 'MJ: Entity Indices' || name === 'MJ: Entity Index Fields' ? ordersEntity : undefined,
      GetEntityObject: vi.fn(async (entityName: string) => {
        const id = `saved-${nextId++}`;
        let payload: Record<string, unknown> = {};
        return {
          NewRecord: vi.fn(),
          LoadFromData: vi.fn(async (data: Record<string, unknown>) => {
            payload = data;
            return true;
          }),
          Save: vi.fn(async () => {
            savedRecords.push({ EntityName: entityName, Data: payload });
            return true;
          }),
          PrimaryKey: { GetValueByIndex: () => id },
        };
      }),
    } as unknown as IMetadataProvider;

    const nonEntityProposal: IndexProposal = {
      ...PROPOSAL,
      TableName: 'SomeNonEntityTable',
    };

    const res = await PersistIndexProposalsToMJMetadata([PROPOSAL, nonEntityProposal], {
      Provider: mockProvider,
    });

    expect(res).toEqual({ Persisted: 1, Skipped: 1, Errors: [] });
    expect(savedRecords).toHaveLength(3);
    expect(savedRecords[0]).toEqual({
      EntityName: 'MJ: Entity Indices',
      Data: expect.objectContaining({
        EntityID: ENTITY_ID,
        Name: 'IX_Orders_CustomerID',
        Source: 'DBAutoDoc',
        Status: 'Proposed',
        Description: PROPOSAL.Reason,
      }),
    });
    expect(savedRecords[1]).toEqual({
      EntityName: 'MJ: Entity Index Fields',
      Data: expect.objectContaining({
        EntityIndexID: 'saved-1',
        EntityFieldID: FIELD_CUSTOMER,
        Sequence: 1,
        Role: 'Key',
        SortDirection: 'ASC',
      }),
    });
    expect(savedRecords[2]).toEqual({
      EntityName: 'MJ: Entity Index Fields',
      Data: expect.objectContaining({
        EntityIndexID: 'saved-1',
        EntityFieldID: FIELD_TOTAL,
        Sequence: 2,
        Role: 'Include',
        SortDirection: 'ASC',
      }),
    });
  });

  it('caps generated proposed index names at 128 characters', () => {
    const name = BuildProposedIndexName('VeryLongTableName', ['ColA', 'ColB', 'C'.repeat(130)]);
    expect(name.length).toBe(128);
  });
});
