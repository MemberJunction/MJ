/**
 * TWO THINGS A LONG CODEGEN RUN ON AN IMPORTED SCHEMA USED TO LEAVE UNSAID.
 *
 * FULL-TEXT COST. Enabling full-text search is a metadata flag; what the flag buys is a permanent
 * per-write charge that differs per dialect (PostgreSQL: a row-level BEFORE INSERT OR UPDATE trigger
 * recomputing to_tsvector, a GIN index maintained on those writes, and a whole-table backfill;
 * SQL Server: continuous change tracking plus a full re-crawl on every apply). A case-insensitive
 * sweep of the generator for warn|cost|overhead|expensive|caution returned nothing, so the operator
 * who flipped the flag was never told, and they are not the person who later sees the write latency.
 *
 * PROGRESS. There IS a 100 ms elapsed ticker, but the message it re-renders is set ONCE before the
 * entity loop, so a run sitting on entity 3 for four minutes and a run on entity 1,180 render
 * identically. `N/total` is the whole difference between a stall and normal progress.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));

import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import * as statusLogging from '../Misc/status_logging';
import { EntityInfo } from '@memberjunction/core';

function field(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `f-${name}`, Name: name, Type: 'nvarchar', Length: 100, Sequence: sequence,
        IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, AutoIncrement: false,
        RelatedEntityID: null, ...extra,
    };
}

function contacts(extra: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: 'e-1', Name: 'Contacts', SchemaName: 'app', BaseTable: 'Contact',
        BaseTableCodeName: 'Contact', BaseView: 'vwContacts', VirtualEntity: false,
        EntityFields: [
            field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
            field('FirstName', 2), field('LastName', 3),
        ],
        ...extra,
    });
}

const searchFields = [contacts().Fields[1], contacts().Fields[2]];

describe('fullTextSearchCostDisclosure — the standing cost is named', () => {
    it('PostgreSQL names the trigger, the GIN index and the backfill', () => {
        const msg = new PostgreSQLCodeGenProvider().fullTextSearchCostDisclosure(contacts(), searchFields);
        expect(msg).toBeTruthy();
        expect(msg).toContain('trg_fts_contact');
        expect(msg).toContain('idx_fts_contact');
        expect(msg).toContain('to_tsvector');
        expect(msg).toContain('backfill');
        expect(msg).toContain('FirstName, LastName');
    });

    it('SQL Server names the index, the change tracking and the re-crawl', () => {
        const msg = new SQLServerCodeGenProvider().fullTextSearchCostDisclosure(
            contacts({ FullTextIndexGenerated: true }), searchFields
        );
        expect(msg).toContain('change tracking');
        expect(msg).toContain('re-crawl');
        expect(msg).toContain('FirstName, LastName');
    });

    it('SQL Server says nothing when no fulltext INDEX is generated — there is no standing cost', () => {
        expect(new SQLServerCodeGenProvider().fullTextSearchCostDisclosure(
            contacts({ FullTextIndexGenerated: false }), searchFields
        )).toBeNull();
    });

    it('every disclosure warns that turning the flags back off does not remove the objects', () => {
        for (const msg of [
            new PostgreSQLCodeGenProvider().fullTextSearchCostDisclosure(contacts(), searchFields),
            new SQLServerCodeGenProvider().fullTextSearchCostDisclosure(contacts({ FullTextIndexGenerated: true }), searchFields),
        ]) {
            expect(msg).toContain('does not drop');
        }
    });
});

describe('reportEntityBatchProgress — N/total, which is the whole point', () => {
    class TestableProgress extends SQLCodeGenBase {
        public report(completed: number, total: number, entity?: EntityInfo): void {
            this.reportEntityBatchProgress('Generating SQL', completed, total, entity, Date.now() - 12_300);
        }
    }

    it('renders position, total, elapsed and the entity being worked on', () => {
        const spy = vi.spyOn(statusLogging, 'updateSpinner').mockImplementation(() => {});
        try {
            new TestableProgress().report(45, 1200, contacts());
            expect(spy).toHaveBeenCalledTimes(1);
            const text = spy.mock.calls[0][0];
            expect(text).toContain('45/1200');
            expect(text).toContain('Generating SQL');
            expect(text).toMatch(/12\.\ds elapsed/);
            expect(text).toContain('app.Contacts');
        } finally {
            spy.mockRestore();
        }
    });

    it('says nothing at all when there are no entities', () => {
        const spy = vi.spyOn(statusLogging, 'updateSpinner').mockImplementation(() => {});
        try {
            new TestableProgress().report(0, 0, undefined);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    /**
     * The pin that matters: the line has to be emitted FROM THE LOOP. A correct progress formatter
     * that nothing calls per batch leaves the run exactly as silent as it was.
     */
    it('is emitted once per BATCH by the entity loop, with the running position', async () => {
        const entities = Array.from({ length: 7 }, (_, i) => contacts({ ID: `e-${i}`, Name: `Entity${i}` }));
        const seen: Array<{ completed: number; total: number; entity: string | undefined }> = [];

        class TestableLoop extends SQLCodeGenBase {
            protected reportEntityBatchProgress(
                _label: string, completed: number, total: number, currentEntity: EntityInfo | undefined
            ): void {
                seen.push({ completed, total, entity: currentEntity?.Name });
            }
            // Stubbed so the loop needs no database and no file system.
            public async generateAndExecuteSingleEntitySQLToSeparateFiles(): Promise<{ Success: boolean; Files: string[] }> {
                return { Success: true, Files: [] };
            }
        }

        const result = await new TestableLoop().generateAndExecuteEntitySQLToSeparateFiles({
            pool: {} as never, entities, directory: '/tmp', onlyPermissions: false,
            writeFiles: false, skipExecution: true, batchSize: 3,
        });

        expect(result.Success).toBe(true);
        // 7 entities at batchSize 3 → batches starting at 0, 3, 6.
        expect(seen.map((s) => s.completed)).toEqual([0, 3, 6]);
        expect(seen.every((s) => s.total === 7)).toBe(true);
        expect(seen.map((s) => s.entity)).toEqual(['Entity0', 'Entity3', 'Entity6']);
    });
});
