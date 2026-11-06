/**
 * `mj doctor value-lists`: the scan classifies each `List` field's distinct values with the
 * product's own rule (`EntityFieldInfo.ValueIsPermittedByValueList`), reports CHECK-constrained
 * columns, and `--fix` changes only the named fields.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, type ExecuteSQLOptions, type UserInfo } from '@memberjunction/core';
import type { MJEntityFieldEntity } from '@memberjunction/core-entities';
import {
    ApplyValueListFixes,
    CheckConstrainedColumns,
    DistinctValuesSQL,
    FormatValueListScan,
    MAX_LISTED_VALUES,
    ParseFixTargets,
    ScanValueLists,
    UnknownEntityNames,
    ValueListFields,
    WithConsoleOnStderr,
    type ValueListFixProvider,
    type ValueListScanProvider,
} from '../lib/value-list-scan.js';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';

function field(id: string, name: string, valueListType: string, values: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: id,
        EntityID: ENTITY_ID,
        Entity: 'Projects',
        Name: name,
        CodeName: name,
        Type: 'nvarchar',
        SQLFullType: 'nvarchar(50)',
        Sequence: 1,
        Status: 'Active',
        IsVirtual: false,
        AllowUpdateAPI: true,
        ValueListType: valueListType,
        EntityFieldValues: values.map((v, i) => ({ ID: `${id}-v${i}`, EntityFieldID: id, Sequence: i + 1, Value: v, Code: v })),
        ...extra,
    };
}

function projects(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Projects',
        SchemaName: 'app',
        BaseTable: 'Project',
        BaseView: 'vwProjects',
        Status: 'Active',
        EntityFields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
            field('f-phase', 'Phase', 'List', ['Discovery', 'Design', 'Build']),
            field('f-status', 'Status', 'List', ['Active', 'Closed']),
            field('f-tag', 'Tag', 'ListOrUserEntry', ['A']),
            field('f-free', 'Notes', 'None', []),
            field('f-empty', 'Kind', 'List', []),
            field('f-virtual', 'OwnerName', 'List', ['X'], { IsVirtual: true }),
            field('f-readonly', 'Source', 'List', ['Y'], { AllowUpdateAPI: false }),
        ],
    });
}

type Row = Record<string, unknown>;

/** A provider whose SQL answers come from `answer`; records every statement. */
function scanProvider(answer: (sql: string) => Row[] | Error): ValueListScanProvider & { Statements: string[] } {
    const statements: string[] = [];
    return {
        Statements: statements,
        QuoteIdentifier: (name: string) => `[${name}]`,
        QuoteSchemaAndView: (schema: string, name: string) => `[${schema}].[${name}]`,
        ExecuteSQL: async <T,>(sql: string, _params?: unknown[], _options?: ExecuteSQLOptions, _user?: UserInfo): Promise<T[]> => {
            statements.push(sql);
            const result = answer(sql);
            if (result instanceof Error) throw result;
            return result as T[];
        },
    };
}

const CHECK_ROWS: Row[] = [{ SchemaName: 'app', TableName: 'Project', ColumnName: 'Status' }];

function answers(byColumn: Record<string, Row[]>): (sql: string) => Row[] {
    return (sql: string) => {
        if (sql.includes('INFORMATION_SCHEMA')) return CHECK_ROWS;
        const column = /^SELECT \[(\w+)\]/.exec(sql)?.[1] ?? '';
        return byColumn[column] ?? [];
    };
}

describe('ValueListFields', () => {
    it('reads only List fields a save validates; ListOrUserEntry, None, virtual and read-only fields are skipped', () => {
        expect(ValueListFields([projects()]).map((f) => f.Field.Name)).toEqual(['Phase', 'Status', 'Kind']);
    });

    it('skips a read-only field because EntityField.Validate() skips it, so its value never fails a save', () => {
        const readOnly = projects().Fields.find((f) => f.Name === 'Source')!;
        expect(readOnly.ReadOnly).toBe(true);
        expect(ValueListFields([projects()]).some((f) => f.Field.Name === 'Source')).toBe(false);
    });

    it('filters by entity name, case-insensitively', () => {
        expect(ValueListFields([projects()], ['projects'])).toHaveLength(3);
        expect(ValueListFields([projects()], ['Other'])).toHaveLength(0);
    });
});

describe('UnknownEntityNames', () => {
    it('returns the names that match no entity, so a mistyped --entity is not reported clean', () => {
        expect(UnknownEntityNames([projects()], ['projects', 'AI Agents'])).toEqual(['AI Agents']);
        expect(UnknownEntityNames([projects()], [' Projects '])).toEqual([]);
        expect(UnknownEntityNames([projects()], undefined)).toEqual([]);
    });
});

describe('DistinctValuesSQL', () => {
    it('groups the column over the base table in the provider dialect, ignoring NULL', () => {
        const entity = projects();
        const sql = DistinctValuesSQL(scanProvider(() => []), entity, entity.Fields.find((f) => f.Name === 'Phase')!);
        expect(sql).toBe('SELECT [Phase] AS [Value], COUNT(*) AS [ValueCount] FROM [app].[Project] WHERE [Phase] IS NOT NULL GROUP BY [Phase]');
    });
});

describe('ScanValueLists', () => {
    it('reports values outside the list; values inside, whitespace and case variants pass', async () => {
        const provider = scanProvider(
            answers({
                Phase: [
                    { Value: 'Design', ValueCount: 4 },
                    { Value: ' design ', ValueCount: 1 },
                    { Value: 'BUILD', ValueCount: 2 },
                    { Value: 'Design, Build', ValueCount: 5 },
                    { Value: 'Launch', ValueCount: 1 },
                ],
                Status: [{ Value: 'Active', ValueCount: 10 }],
            }),
        );
        const report = await ScanValueLists(provider, [projects()]);
        expect(report.FieldsScanned).toBe(2);
        expect(report.FieldsWithoutValues).toBe(1);
        expect(report.Findings).toEqual([
            {
                Entity: 'Projects',
                Field: 'Phase',
                RowsOutsideList: 6,
                DistinctValuesOutsideList: 2,
                Values: [
                    { Value: 'Design, Build', Rows: 5 },
                    { Value: 'Launch', Rows: 1 },
                ],
                HasCheckConstraint: false,
            },
        ]);
    });

    it('ignores NULL and flags a field whose column has a CHECK constraint as such', async () => {
        const provider = scanProvider(answers({ Status: [{ Value: null, ValueCount: 3 }, { Value: 'Archived', ValueCount: 1 }] }));
        const report = await ScanValueLists(provider, [projects()]);
        expect(report.Findings.map((f) => [f.Field, f.RowsOutsideList, f.HasCheckConstraint])).toEqual([['Status', 1, true]]);
    });

    it('lists at most the first values, most frequent first, and counts the rest', async () => {
        const many = Array.from({ length: MAX_LISTED_VALUES + 5 }, (_, i) => ({ Value: `v${i}`, ValueCount: i + 1 }));
        const report = await ScanValueLists(scanProvider(answers({ Phase: many })), [projects()]);
        const phase = report.Findings[0];
        expect(phase.DistinctValuesOutsideList).toBe(MAX_LISTED_VALUES + 5);
        expect(phase.Values).toHaveLength(MAX_LISTED_VALUES);
        expect(phase.Values[0]).toEqual({ Value: `v${MAX_LISTED_VALUES + 4}`, Rows: MAX_LISTED_VALUES + 5 });
        expect(FormatValueListScan(report).some((l) => l.includes('… 5 more'))).toBe(true);
    });

    it('reports an unreadable table and an unreadable catalog without stopping', async () => {
        const provider = scanProvider((sql) => {
            if (sql.includes('INFORMATION_SCHEMA')) return new Error('permission denied');
            if (sql.includes('[Phase]')) return new Error('Invalid object name');
            return [];
        });
        const report = await ScanValueLists(provider, [projects()]);
        expect(report.Findings).toEqual([expect.objectContaining({ Field: 'Phase', Error: 'Invalid object name', HasCheckConstraint: null })]);
    });

    it('formats a clean run as one summary line', async () => {
        const report = await ScanValueLists(scanProvider(answers({})), [projects()]);
        expect(FormatValueListScan(report)).toEqual(['2 List field(s) scanned; 0 hold values outside their list; 1 skipped with no values.']);
    });
});

describe('CheckConstrainedColumns', () => {
    it('keys columns by schema, table and column, case-insensitively', async () => {
        const columns = await CheckConstrainedColumns(scanProvider(() => [{ SchemaName: 'APP', TableName: 'Project', ColumnName: 'Status' }]));
        expect(columns?.has('app.project.status')).toBe(true);
    });

    it('treats an empty catalog as unknown: a PostgreSQL role that owns no tables sees no rows rather than an error', async () => {
        expect(await CheckConstrainedColumns(scanProvider(() => []))).toBeNull();
        const report = await ScanValueLists(
            scanProvider((sql) => (sql.includes('INFORMATION_SCHEMA') ? [] : sql.includes('[Phase]') ? [{ Value: 'Launch', ValueCount: 1 }] : [])),
            [projects()],
        );
        expect(report.Findings.map((f) => f.HasCheckConstraint)).toEqual([null]);
        expect(FormatValueListScan(report)[0]).toContain('CHECK unknown');
    });
});

describe('ParseFixTargets', () => {
    it('splits comma lists and repeated flags, taking the field after the last dot', () => {
        expect(ParseFixTargets(['MJ: AI Agents.Status, Projects.Phase', 'Projects.Kind'])).toEqual([
            { Entity: 'MJ: AI Agents', Field: 'Status' },
            { Entity: 'Projects', Field: 'Phase' },
            { Entity: 'Projects', Field: 'Kind' },
        ]);
    });

    it('rejects a name without a field', () => {
        expect(() => ParseFixTargets(['Projects'])).toThrow(/is not Entity\.Field/);
        expect(() => ParseFixTargets(['Projects.'])).toThrow(/is not Entity\.Field/);
    });
});

describe('ApplyValueListFixes', () => {
    function fixProvider(saveResult = true): { Provider: ValueListFixProvider; Saved: Array<{ ID: string; ValueListType: string }> } {
        const saved: Array<{ ID: string; ValueListType: string }> = [];
        const getEntityObject = vi.fn(async () => {
            const record = {
                ID: '',
                ValueListType: 'List',
                LatestResult: { CompleteMessage: 'denied' },
                Load: async (id: string) => {
                    record.ID = id;
                    return true;
                },
                Save: async () => {
                    if (saveResult) saved.push({ ID: record.ID, ValueListType: record.ValueListType });
                    return saveResult;
                },
            };
            return record as unknown as MJEntityFieldEntity;
        });
        return { Provider: { GetEntityObject: getEntityObject } as unknown as ValueListFixProvider, Saved: saved };
    }

    it('saves only the named fields, through the entity layer', async () => {
        const { Provider, Saved } = fixProvider();
        const results = await ApplyValueListFixes(Provider, [projects()], [{ Entity: 'projects', Field: 'phase' }], new Set());
        expect(Saved).toEqual([{ ID: 'f-phase', ValueListType: 'ListOrUserEntry' }]);
        expect(results).toEqual([{ Entity: 'projects', Field: 'phase', Fixed: true, Message: 'ValueListType set to ListOrUserEntry' }]);
    });

    it('does not change a field that is not List, is unknown, or has a CHECK constraint', async () => {
        const { Provider, Saved } = fixProvider();
        const results = await ApplyValueListFixes(
            Provider,
            [projects()],
            [
                { Entity: 'Projects', Field: 'Tag' },
                { Entity: 'Projects', Field: 'Nope' },
                { Entity: 'Projects', Field: 'Status' },
            ],
            new Set(['app.project.status']),
        );
        expect(Saved).toEqual([]);
        expect(results.map((r) => r.Fixed)).toEqual([false, false, false]);
        expect(results[2].Message).toMatch(/CHECK constraint/);
    });

    it('reports a failed save with the entity layer message', async () => {
        const { Provider } = fixProvider(false);
        const [result] = await ApplyValueListFixes(Provider, [projects()], [{ Entity: 'Projects', Field: 'Phase' }], new Set());
        expect(result).toMatchObject({ Fixed: false, Message: 'denied' });
    });

    it('changes nothing when the CHECK constraints could not be read, since its CHECK guard cannot apply', async () => {
        const { Provider, Saved } = fixProvider();
        const [result] = await ApplyValueListFixes(Provider, [projects()], [{ Entity: 'Projects', Field: 'Phase' }], null);
        expect(Saved).toEqual([]);
        expect(result.Fixed).toBe(false);
        expect(result.Message).toMatch(/could not be read/);
    });
});

describe('WithConsoleOnStderr', () => {
    it('sends console.log/info/debug to stderr while the work runs, then restores them', async () => {
        const original = console.log;
        const errors: unknown[][] = [];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors.push(args);
        });
        try {
            const result = await WithConsoleOnStderr(async () => {
                console.log('startup line');
                console.info('info line');
                return 42;
            });
            expect(result).toBe(42);
            expect(errors).toEqual([['startup line'], ['info line']]);
            expect(console.log).toBe(original);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('restores the console when the work throws', async () => {
        const original = console.log;
        await expect(WithConsoleOnStderr(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        expect(console.log).toBe(original);
    });
});
