/**
 * BaseEntity validation helpers (#4241): IsNewOrDirty, and the fail-closed read helpers
 * ValidationReadOne / ValidationReadMany / ValidationCount plus MarkUnverified.
 *
 * The point of the read helpers is that a failed read is reported as `{ ok: false }`, never as
 * "no row", so the tests pin that for an unsuccessful RunView and for one that throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as logging from '../generic/logging';
import { BaseEntity, EntityValidationCount, EntityValidationRead, EntityValidationReadList, VALIDATION_READ_MANY_DEFAULT_MAX_ROWS } from '../generic/baseEntity';
import { EntityInfo, ValidationResult } from '../generic/entityInfo';
import type { IEntityDataProvider } from '../generic/interfaces';
import type { RunViewParams } from '../views/runView';
import { ValidationErrorType } from '@memberjunction/global';

type Row = { ID: string; Name: string };

class TestEntity extends BaseEntity {
    public ReadOne(entityName: string, filter: string, fields: string[]): Promise<EntityValidationRead<Row>> {
        return this.ValidationReadOne<Row>(entityName, filter, fields);
    }
    public ReadMany(entityName: string, filter: string, fields: string[], maxRows?: number): Promise<EntityValidationReadList<Row>> {
        return this.ValidationReadMany<Row>(entityName, filter, fields, maxRows);
    }
    public Count(entityName: string, filter: string): Promise<EntityValidationCount> {
        return this.ValidationCount(entityName, filter);
    }
    public Unverified(result: ValidationResult, field: string, what: string): void {
        this.MarkUnverified(result, field, what);
    }
}

const entityInfo = new EntityInfo({
    ID: '11111111-2222-3333-4444-555555555555',
    Name: 'Test Things',
    BaseTable: 'TestThing',
    BaseView: 'vwTestThings',
    Status: 'Active',
    Fields: [
        { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
        { ID: 'f2', Name: 'Name', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
        { ID: 'f3', Name: 'Code', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    ],
});

type RunViewMock = ReturnType<typeof vi.fn<(params: RunViewParams) => Promise<object>>>;

function makeProvider(response: (params: RunViewParams) => Promise<object>): { runView: RunViewMock; provider: IEntityDataProvider } {
    const runView = vi.fn(response);
    return { runView, provider: { RunView: runView } as unknown as IEntityDataProvider };
}

function ok(results: Row[], totalRowCount?: number): object {
    return { Success: true, Results: results, ErrorMessage: '', RowCount: results.length, TotalRowCount: totalRowCount, ExecutionTime: 0 };
}

const failed = { Success: false, Results: [], ErrorMessage: 'Invalid column name', RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 };

describe('BaseEntity.IsNewOrDirty', () => {
    it('is true for a new record regardless of fields', () => {
        const e = new TestEntity(entityInfo);
        expect(e.IsNewOrDirty('Name')).toBe(true);
        expect(e.IsNewOrDirty()).toBe(true);
    });

    it('on a saved record, is true only when a named field is dirty', async () => {
        const e = new TestEntity(entityInfo);
        await e.LoadFromData({ ID: 'A', Name: 'one', Code: 'c1' });
        expect(e.IsNewOrDirty('Name')).toBe(false);
        e.Set('Code', 'c2');
        expect(e.IsNewOrDirty('Name')).toBe(false); // unrelated edit does not re-run the rule
        expect(e.IsNewOrDirty('Name', 'Code')).toBe(true);
        expect(e.IsNewOrDirty('NoSuchField')).toBe(false);
    });

    it('with no field names, follows Dirty', async () => {
        const e = new TestEntity(entityInfo);
        await e.LoadFromData({ ID: 'A', Name: 'one', Code: 'c1' });
        expect(e.IsNewOrDirty()).toBe(false);
        e.Set('Name', 'two');
        expect(e.IsNewOrDirty()).toBe(true);
    });
});

describe('BaseEntity validation read helpers', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        logSpy = vi.spyOn(logging, 'LogError').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('ValidationReadOne returns the first row, or row null when none match', async () => {
        const { runView, provider } = makeProvider(async () => ok([{ ID: '1', Name: 'x' }]));
        const e = new TestEntity(entityInfo, provider);
        expect(await e.ReadOne('MJ: Things', "Code='a'", ['ID', 'Name'])).toEqual({ ok: true, row: { ID: '1', Name: 'x' } });
        expect(runView.mock.calls[0][0]).toEqual(expect.objectContaining({ EntityName: 'MJ: Things', ExtraFilter: "Code='a'", Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple' }));

        const empty = new TestEntity(entityInfo, makeProvider(async () => ok([])).provider);
        expect(await empty.ReadOne('MJ: Things', "Code='b'", ['ID'])).toEqual({ ok: true, row: null });
    });

    it('ValidationReadOne returns ok:false (not row:null) on a failed RunView, and logs it', async () => {
        const e = new TestEntity(entityInfo, makeProvider(async () => failed).provider);
        const read = await e.ReadOne('MJ: Things', "Code='a'", ['ID']);
        expect(read).toEqual({ ok: false, error: 'Invalid column name' });
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('validation read of MJ: Things failed'));
    });

    it('ValidationReadOne returns ok:false when RunView throws', async () => {
        const e = new TestEntity(entityInfo, makeProvider(async () => { throw new Error('connection reset'); }).provider);
        expect(await e.ReadOne('MJ: Things', "Code='a'", ['ID'])).toEqual({ ok: false, error: 'connection reset' });
    });

    it('ValidationReadMany caps rows (default and explicit) and returns ok:false on failure', async () => {
        const rows = [{ ID: '1', Name: 'x' }, { ID: '2', Name: 'y' }];
        const { runView, provider } = makeProvider(async () => ok(rows));
        const e = new TestEntity(entityInfo, provider);
        expect(await e.ReadMany('MJ: Things', '1=1', ['ID', 'Name'])).toEqual({ ok: true, rows });
        expect(runView.mock.calls[0][0].MaxRows).toBe(VALIDATION_READ_MANY_DEFAULT_MAX_ROWS);
        await e.ReadMany('MJ: Things', '1=1', ['ID'], 5);
        expect(runView.mock.calls[1][0].MaxRows).toBe(5);

        const bad = new TestEntity(entityInfo, makeProvider(async () => failed).provider);
        expect((await bad.ReadMany('MJ: Things', '1=1', ['ID'])).ok).toBe(false);
    });

    it('ValidationCount uses count_only and returns the total, or ok:false on failure or a missing total', async () => {
        const { runView, provider } = makeProvider(async () => ok([], 7));
        const e = new TestEntity(entityInfo, provider);
        expect(await e.Count('MJ: Things', "Code='a'")).toEqual({ ok: true, count: 7 });
        expect(runView.mock.calls[0][0]).toEqual(expect.objectContaining({ ResultType: 'count_only', ExtraFilter: "Code='a'" }));

        const bad = new TestEntity(entityInfo, makeProvider(async () => failed).provider);
        expect((await bad.Count('MJ: Things', '1=1')).ok).toBe(false);

        const noTotal = new TestEntity(entityInfo, makeProvider(async () => ok([])).provider);
        expect((await noTotal.Count('MJ: Things', '1=1')).ok).toBe(false);
    });

    it('MarkUnverified adds a blocking error on the field', () => {
        const e = new TestEntity(entityInfo);
        const result = new ValidationResult();
        result.Success = true;
        e.Unverified(result, 'Code', 'the code is unique');
        expect(result.Success).toBe(false);
        expect(result.Errors[0]).toMatchObject({ Source: 'Code', Type: ValidationErrorType.Failure });
        expect(result.Errors[0].Message).toContain('Could not verify the code is unique');
    });
});
