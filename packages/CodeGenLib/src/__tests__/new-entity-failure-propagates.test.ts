import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { AdvancedGeneration } from '../Misc/advanced_generation';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { Metadata, type UserInfo } from '@memberjunction/core';

/**
 * A new entity that fails to be created must fail the run, not vanish.
 *
 * createNewEntity used to catch every error, log it, and return — so createNewEntities committed
 * whatever subset had succeeded and reported true. The table whose INSERT failed was absent
 * afterwards with a log line as the only witness. On a runtime schema update that read as a
 * "complete" build of a connector missing eleven of its twenty-seven tables.
 */

const USER = { ID: 'u' } as unknown as UserInfo;
const MD = { Entities: [] } as unknown as Metadata;

class Testable extends ManageMetadataBase {
    public failOn = new Set<string>();
    public created: string[] = [];
    public tables: Array<{ SchemaName: string; TableName: string }> = [];

    protected override async materializedResultTableExists(): Promise<boolean> {
        return false;
    }
    protected override async runQuery(): Promise<CodeGenQueryResult> {
        return { recordset: this.tables } as unknown as CodeGenQueryResult;
    }
    protected override async createNewEntity(_pool: CodeGenConnection, newEntity: { TableName: string }): Promise<void> {
        if (this.failOn.has(newEntity.TableName)) {
            ManageMetadataBase.newEntityList.push(`Half-created ${newEntity.TableName}`);
            throw new Error(`INSERT failed for ${newEntity.TableName}`);
        }
        this.created.push(newEntity.TableName);
        ManageMetadataBase.newEntityList.push(newEntity.TableName);
    }
    public nameWith(ag: AdvancedGeneration, table: string): Promise<string> {
        return this.newEntityNameWithAdvancedGeneration(ag, { SchemaName: 'pheedloop', TableName: table }, USER);
    }
}

class RealCreate extends ManageMetadataBase {
    protected override async shouldCreateNewEntity(): Promise<{ shouldCreate: boolean; validationMessage: string }> {
        return { shouldCreate: true, validationMessage: '' };
    }
    protected override async createNewEntityName(): Promise<string> {
        throw new Error('name generation exploded');
    }
    public run(): Promise<void> {
        return this.createNewEntity({} as CodeGenConnection, { SchemaName: 'pheedloop', TableName: 'attendee' }, MD, USER);
    }
}

function pool(): { conn: CodeGenConnection; commit: ReturnType<typeof vi.fn>; rollback: ReturnType<typeof vi.fn> } {
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const conn = { beginTransaction: async () => ({ commit, rollback }) } as unknown as CodeGenConnection;
    return { conn, commit, rollback };
}

describe('createNewEntity', () => {
    it('rethrows after logging instead of swallowing the failure', async () => {
        await expect(new RealCreate().run()).rejects.toThrow('name generation exploded');
    });
});

describe('createNewEntities', () => {
    beforeEach(() => {
        ManageMetadataBase.newEntityList.length = 0;
    });

    it('commits and returns true when every qualifying table is created', async () => {
        const mm = new Testable();
        mm.tables = [{ SchemaName: 'pheedloop', TableName: 'attendee' }, { SchemaName: 'pheedloop', TableName: 'session' }];
        const p = pool();
        // The success path refreshes metadata; there is no provider in this test.
        const refresh = vi.spyOn(Metadata.prototype, 'Refresh').mockResolvedValue(undefined as never);

        await expect(mm.createNewEntities(p.conn, USER)).resolves.toBe(true);

        expect(mm.created).toEqual(['attendee', 'session']);
        expect(p.commit).toHaveBeenCalledTimes(1);
        expect(p.rollback).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalledTimes(1);
        refresh.mockRestore();
    });

    it('rolls back, returns false and forgets the batch\'s names when one table fails', async () => {
        const mm = new Testable();
        mm.tables = [
            { SchemaName: 'pheedloop', TableName: 'attendee' },
            { SchemaName: 'pheedloop', TableName: 'badge' },
            { SchemaName: 'pheedloop', TableName: 'session' }
        ];
        mm.failOn.add('badge');
        ManageMetadataBase.newEntityList.push('From An Earlier Run');
        const p = pool();

        await expect(mm.createNewEntities(p.conn, USER)).resolves.toBe(false);

        expect(mm.created).toEqual(['attendee']);
        expect(p.commit).not.toHaveBeenCalled();
        expect(p.rollback).toHaveBeenCalledTimes(1);
        expect(ManageMetadataBase.newEntityList).toEqual(['From An Earlier Run']);
    });
});

describe('newEntityNameWithAdvancedGeneration', () => {
    const stubAg = (answer: unknown): AdvancedGeneration =>
        ({ generateEntityName: async () => answer }) as unknown as AdvancedGeneration;

    it('uses a plausible AI name', async () => {
        await expect(new Testable().nameWith(stubAg({ entityName: 'Attendees', tableName: 'attendee' }), 'attendee')).resolves.toBe('Attendees');
    });

    it('falls back to the table-derived name when the AI answers "-1"', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const name = await new Testable().nameWith(stubAg({ entityName: '-1', tableName: 'attendee' }), 'attendee');
        expect(name).toBe('Attendees');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('falls back when the AI path returns null', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await expect(new Testable().nameWith(stubAg(null), 'attendee')).resolves.toBe('Attendees');
        vi.restoreAllMocks();
    });
});
