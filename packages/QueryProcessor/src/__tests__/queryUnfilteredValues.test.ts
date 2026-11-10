/**
 * A template tag that no SQL filter formats (`TOP {{ n }}`, `Status = {{ status }}`) pastes the
 * caller's value into the statement as SQL text. These tests show the injection, show that it is
 * refused, and show that the patterns the shipped queries use keep rendering.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunQuerySQLFilterManager } from '@memberjunction/core';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';
import type { QueryParameterDefinition, QueryProcessingResult, QueryRenderOptions, QueryServerValues } from '../queryParameterProcessor.js';
import { FindUnfilteredOutputNames, IsSafeUnfilteredValue } from '../unfilteredOutputs.js';

const QUERIES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../metadata/queries');

const UNION = '1 UNION SELECT Email, PasswordHash FROM Users';

function def(Name: string, Type: QueryParameterDefinition['Type'], extra: Partial<QueryParameterDefinition> = {}): QueryParameterDefinition {
    return { Name, Type, IsRequired: false, IsServerSet: false, ValidationFilters: null, ...extra };
}

function run(
    sql: string,
    parameters: Record<string, unknown> | undefined,
    definitions: QueryParameterDefinition[],
    serverValues?: QueryServerValues,
    options?: QueryRenderOptions,
    force = false,
): QueryProcessingResult {
    return QueryParameterProcessor.ProcessQueryTemplate({ SQL: sql, UsesTemplate: true, Parameters: definitions }, parameters, undefined, force, serverValues, options);
}

const SQL_FILTERS = new Set(RunQuerySQLFilterManager.Instance.GetFiltersForDialect('sqlserver').map(f => f.name));

beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
});

describe('unfiltered string values: the injection', () => {
    it('refuses a UNION through a string parameter in TOP {{ n }}', () => {
        const result = run('SELECT TOP {{ n }} Name FROM Accounts WHERE OwnerID = 7', { n: UNION }, [def('n', 'string')]);
        expect(result.success).toBe(false);
        expect(result.processedSQL).toBe('');
        expect(result.error).toContain("Parameter 'n' is written into the SQL without a SQL filter");
    });

    it('refuses it even when the parameter declares the sqlsafe validation filter, which the value passes', () => {
        const sqlsafe = JSON.stringify([{ name: 'sqlsafe' }]);
        const validated = QueryParameterProcessor.ValidateParameters({ n: UNION }, [def('n', 'string', { ValidationFilters: sqlsafe })]);
        expect(validated.success).toBe(true); // sqlsafe alone lets the value through
        const result = run('SELECT TOP {{ n }} Name FROM Accounts', { n: UNION }, [def('n', 'string', { ValidationFilters: sqlsafe })]);
        expect(result.success).toBe(false);
    });

    it.each([
        ['a UNION', UNION],
        ['a tautology', '1 OR 1=1'],
        ['a column name, which makes the predicate always true', 'Status'],
        ['a subquery', '(SELECT TOP 1 Status FROM Accounts)'],
        ['a keyword', 'NULL'],
        ['a second statement', '1; DROP TABLE Accounts'],
        ['a comment', '1 --'],
        ['a quote', "x' OR '1'='1"],
        ['hex and exponent forms', '0x1F'],
    ])('refuses %s in Status = {{ status }}', (_what, value) => {
        const result = run('SELECT Name FROM Accounts WHERE OwnerID = 7 AND Status = {{ status }}', { status: value }, [def('status', 'string')]);
        expect(result.success).toBe(false);
        expect(result.processedSQL).not.toContain(value);
    });

    it('refuses the value through a filter that does not format SQL, a default, an inline if, a set and a loop', () => {
        const templates = [
            'SELECT TOP {{ n | trim }} Name FROM T',
            'SELECT TOP {{ n | safe }} Name FROM T',
            'SELECT TOP {{ n | default(5) }} Name FROM T',
            'SELECT TOP {{ n if n else 5 }} Name FROM T',
            'SELECT TOP {{ 5 if flag else n }} Name FROM T',
            '{% set limit = n %}SELECT TOP {{ limit }} Name FROM T',
            '{% set a = n %}{% set b = a %}SELECT TOP {{ b }} Name FROM T',
            "SELECT TOP {{ n ~ '' }} Name FROM T",
            'SELECT TOP {{ [n] | first }} Name FROM T',
        ];
        for (const sql of templates) {
            expect(run(sql, { n: UNION }, [def('n', 'string'), def('flag', 'boolean')]).success, sql).toBe(false);
        }
        const loop = 'SELECT Name FROM T WHERE ID IN ({% for id in ids %}{{ id }}{% if not loop.last %},{% endif %}{% endfor %})';
        expect(run(loop, { ids: [1, '2) OR (1=1'] }, [def('ids', 'array')]).success).toBe(false);
        expect(run("SELECT Name FROM T WHERE ID IN ({{ ids | join(',') }})", { ids: ['1', UNION] }, [def('ids', 'array')]).success).toBe(false);
    });

    it('refuses a value for a name the query does not declare, when composed queries are rendered', () => {
        const result = run('SELECT TOP {{ n }} Name FROM T', { n: UNION }, [], undefined, undefined, true);
        expect(result.success).toBe(false);
    });

    it('refuses a template it cannot read', () => {
        const result = run('SELECT {{ n ', { n: '1' }, [def('n', 'string')]);
        expect(result.success).toBe(false);
        expect(result.error).toContain('could not be read');
    });
});

describe('typed parameters are converted before they are written', () => {
    it('a number parameter never carries SQL: the value is refused or becomes a number', () => {
        expect(run('SELECT TOP {{ n }} Name FROM T', { n: UNION }, [def('n', 'number')]).error).toContain("Parameter 'n' must be a number");
        expect(run('SELECT TOP {{ n }} Name FROM T', { n: '25' }, [def('n', 'number')]).processedSQL).toBe('SELECT TOP 25 Name FROM T');
        expect(run('SELECT TOP {{ n }} Name FROM T', { n: 'Infinity' }, [def('n', 'number')]).success).toBe(false);
        expect(run('SELECT TOP {{ n }} Name FROM T', { n: Number.NaN }, [def('n', 'number')]).success).toBe(false);
    });

    it('a boolean parameter becomes the dialect boolean', () => {
        expect(run('WHERE IsActive = {{ on }}', { on: '1 OR 1=1' }, [def('on', 'boolean')]).processedSQL).toBe('WHERE IsActive = 0');
        expect(run('WHERE IsActive = {{ on }}', { on: 'TRUE' }, [def('on', 'boolean')]).processedSQL).toBe('WHERE IsActive = 1');
    });

    it('a date parameter is refused unless it is a date', () => {
        expect(run('WHERE D >= {{ d | sqlDate }}', { d: "2024-01-01' OR '1'='1" }, [def('d', 'date')]).success).toBe(false);
        expect(run('WHERE D >= {{ d | sqlDate }}', { d: '2024-01-15' }, [def('d', 'date')]).processedSQL).toContain('2024-01-15');
    });

    it('an array parameter must be an array: JSON text holding a string is refused', () => {
        const quoted = JSON.stringify(UNION);
        expect(run('WHERE ID IN ({{ ids }})', { ids: quoted }, [def('ids', 'array')]).error).toContain("Parameter 'ids' must be a valid JSON array");
        expect(run('WHERE ID IN ({{ ids }})', { ids: '{"a":1}' }, [def('ids', 'array')]).success).toBe(false);
        expect(run('WHERE ID IN ({{ ids }})', { ids: '[1,2,3]' }, [def('ids', 'array')]).processedSQL).toBe('WHERE ID IN (1,2,3)');
    });
});

describe('what keeps rendering', () => {
    it('any text through a SQL filter, exactly as before', () => {
        const hostile = "x' OR '1'='1 UNION SELECT 1 --";
        const result = run('WHERE Name = {{ name | sqlString }} AND Note LIKE {{ name | sqlLikeContains }}', { name: hostile }, [def('name', 'string')]);
        expect(result.success).toBe(true);
        expect(result.processedSQL).toContain("'x'' OR ''1''=''1 UNION SELECT 1 --'");
        const list = run('WHERE Status IN {{ statuses | sqlIn }}', { statuses: ["O'Brien", 'Open; DROP'] }, [def('statuses', 'array')]);
        expect(list.success).toBe(true);
        expect(list.processedSQL).toContain("'O''Brien'");
    });

    it('a string parameter that holds a plain number, or a sort direction, written bare', () => {
        expect(run('SELECT TOP {{ n }} Name FROM T', { n: '25' }, [def('n', 'string')]).processedSQL).toBe('SELECT TOP 25 Name FROM T');
        expect(run('WHERE Total >= {{ min }}', { min: '-12.50' }, [def('min', 'string')]).processedSQL).toBe('WHERE Total >= -12.50');
        expect(run('ORDER BY Name {{ dir }}', { dir: 'desc' }, [def('dir', 'string')]).processedSQL).toBe('ORDER BY Name desc');
    });

    it('a value that is only tested, never written', () => {
        const sql = "SELECT Name FROM T{% if mode == 'all rows; please' %} WHERE 1=1{% endif %}{% if q %} AND Name = {{ q | sqlString }}{% endif %}";
        const result = run(sql, { mode: 'all rows; please', q: "it's" }, [def('mode', 'string'), def('q', 'string')]);
        expect(result.success).toBe(true);
        expect(result.processedSQL).toBe("SELECT Name FROM T WHERE 1=1 AND Name = 'it''s'");
    });

    it('a mixed inline if whose written branch is filtered', () => {
        const result = run('WHERE Name = {{ (name | sqlString) if name else "NULL" }}', { name: 'a b' }, [def('name', 'string')]);
        expect(result.success).toBe(true);
    });

    it('server-set SQL fragments, which only server code can supply (external change detection)', () => {
        const definitions = [def('PrimaryKeyJoin', 'string', { IsServerSet: true, IsRequired: true })];
        const result = run('SELECT 1 FROM T ot JOIN rc ON {{ PrimaryKeyJoin }} = rc.RecordID', undefined, definitions, { ServerParameters: { PrimaryKeyJoin: 'CAST(ot.ID AS NVARCHAR(MAX))' } });
        expect(result.success).toBe(true);
        expect(result.processedSQL).toContain('ON CAST(ot.ID AS NVARCHAR(MAX)) = rc.RecordID');
        // A caller cannot supply it.
        expect(run('SELECT 1 FROM T ot JOIN rc ON {{ PrimaryKeyJoin }} = rc.RecordID', { PrimaryKeyJoin: '1=1' }, definitions).success).toBe(false);
    });

    it('a function the server puts in scope, with caller text as its argument (composition recorder)', () => {
        const seen: unknown[] = [];
        const options: QueryRenderOptions = { Scope: { record: (index: number, args: unknown[]) => { seen.push(args); return `[cte_${index}]`; } } };
        const result = run('SELECT * FROM {{ record(0, [Region]) }}', { Region: 'North East' }, [def('Region', 'string')], undefined, options);
        expect(result.success).toBe(true);
        expect(result.processedSQL).toBe('SELECT * FROM [cte_0]');
        expect(seen).toEqual([['North East']]);
    });

    it('Context tokens and loop counters', () => {
        expect(FindUnfilteredOutputNames('{% for t in tags %}{{ loop.index }}{% endfor %}{{ Context.UserID }}', SQL_FILTERS)).toEqual(new Set(['loop', 'Context']));
    });
});

describe('FindUnfilteredOutputNames', () => {
    it.each([
        ['{{ a }}', ['a']],
        ['{{ a | sqlString }}', []],
        ['{{ a | upper | sqlString }}', []],
        ['{{ a | sqlString | upper }}', []],
        ['{{ a | upper }}', ['a']],
        ['{{ a | default(b) }}', ['a', 'b']],
        ['{{ a if c else b }}', ['a', 'b']],
        ['{{ (a | sqlNumber) if c else b }}', ['b']],
        ['{% if a %}x{% endif %}', []],
        ['{{ a == b }}', []],
        ['{{ a.b[c] }}', ['a', 'c']],
        ['{% set x = a %}{{ x }}', ['x', 'a']],
        ['{% set x = a | sqlString %}{{ x }}', ['x']],
        ['{% for i in list %}{{ i }}{% endfor %}', ['i', 'list']],
        ['{% for i in list %}{{ i | sqlNumber }}{% endfor %}', []],
        ['{{ fn(a) }}', ['fn', 'a']],
    ])('%s writes %j unfiltered', (sql, expected) => {
        expect([...FindUnfilteredOutputNames(sql, SQL_FILTERS)].sort()).toEqual([...expected].sort());
    });

    it('does not count the arguments of a trusted function', () => {
        expect([...FindUnfilteredOutputNames('{{ fn(a) }}{{ b }}', SQL_FILTERS, new Set(['fn']))]).toEqual(['b']);
    });
});

describe('IsSafeUnfilteredValue', () => {
    it('accepts numbers, booleans, plain numeric text, sort directions and lists of them', () => {
        for (const value of [0, -3.5, true, false, null, undefined, '', '42', '+7', '-0.25', 'ASC', 'Desc', [1, '2', ['3']], { a: 1 }, new Date(0)]) {
            expect(IsSafeUnfilteredValue(value), JSON.stringify(value)).toBe(true);
        }
    });

    it('refuses everything else', () => {
        const deep = [[[[[[['1']]]]]]];
        for (const value of [' 1', '1 ', '1e3', '0x10', '1,2', 'abc', 'a_b', "'", '1;', Number.NaN, Number.POSITIVE_INFINITY, ['1', 'x'], { a: 'x y' }, deep, () => 1]) {
            expect(IsSafeUnfilteredValue(value), String(value)).toBe(false);
        }
    });
});

/** A parameter declared in the shipped query metadata. */
interface ShippedParameter {
    Name: string;
    Type: string;
    IsServerSet: boolean;
}

/** Every `MJ: Query Parameters` record under `node`, by name. */
function collectParameters(node: unknown, into: Map<string, ShippedParameter>): void {
    if (Array.isArray(node)) {
        node.forEach(item => collectParameters(item, into));
    } else if (typeof node === 'object' && node !== null) {
        const fields = (node as { fields?: Partial<ShippedParameter> }).fields;
        if (fields && typeof fields.Name === 'string' && typeof fields.Type === 'string' && typeof fields.IsServerSet === 'boolean') {
            into.set(fields.Name, { Name: fields.Name, Type: fields.Type, IsServerSet: fields.IsServerSet });
        }
        Object.values(node).forEach(value => collectParameters(value, into));
    }
}

function sqlFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? sqlFiles(join(directory, entry.name)) : entry.name.endsWith('.sql') ? [join(directory, entry.name)] : []);
}

describe('the shipped query templates (metadata/queries)', () => {
    /** The SQL as the provider hands it to the processor: SQL comments and composition tags removed. */
    function renderable(file: string): string {
        return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/\{\{\s*query\s*:[^}]*\}\}/g, '');
    }

    it('write a caller-supplied value unfiltered only where its declared type is number, boolean or date', () => {
        const parametersByFile = new Map<string, Map<string, ShippedParameter>>();
        for (const name of readdirSync(QUERIES_ROOT).filter(n => n.endsWith('.json') && n !== '.mj-sync.json')) {
            const text = readFileSync(join(QUERIES_ROOT, name), 'utf8');
            const parameters = new Map<string, ShippedParameter>();
            collectParameters(JSON.parse(text), parameters);
            for (const match of text.matchAll(/@file:(SQL\/[^"]+\.sql)/g)) {
                parametersByFile.set(match[1], parameters);
            }
        }
        const files = sqlFiles(join(QUERIES_ROOT, 'SQL'));
        expect(files.length).toBeGreaterThan(40);
        const counts = { converted: 0, serverSet: 0 };
        const wouldBreak: string[] = [];
        for (const file of files) {
            const path = relative(QUERIES_ROOT, file).split('\\').join('/');
            for (const name of FindUnfilteredOutputNames(renderable(file), SQL_FILTERS)) {
                const parameter = parametersByFile.get(path)?.get(name);
                if (parameter?.IsServerSet) counts.serverSet++;
                else if (parameter && ['number', 'boolean', 'date'].includes(parameter.Type)) counts.converted++;
                else wouldBreak.push(`${path}: ${name}`);
            }
        }
        // No shipped template writes caller text unfiltered, so refusing such text breaks none of them.
        expect(wouldBreak).toEqual([]);
        expect(counts.converted).toBeGreaterThan(0);
        expect(counts.serverSet).toBeGreaterThan(0);
    });

    it('still render with ordinary values: number parameters written bare', () => {
        const feedback = renderable(join(QUERIES_ROOT, 'SQL/list-conversation-detail-feedback-stats.sql'));
        const names = [...FindUnfilteredOutputNames(feedback, SQL_FILTERS)];
        expect(names).toEqual(expect.arrayContaining(['MinRating', 'MaxRating']));
        const template = 'SELECT 1 FROM cd WHERE 1=1{% if MinRating %} AND cd.UserRating >= {{ MinRating }}{% endif %}{% if MaxRating %} AND cd.UserRating <= {{ MaxRating }}{% endif %}';
        const result = run(template, { MinRating: '2', MaxRating: 9 }, [def('MinRating', 'number'), def('MaxRating', 'number')]);
        expect(result.processedSQL).toBe('SELECT 1 FROM cd WHERE 1=1 AND cd.UserRating >= 2 AND cd.UserRating <= 9');
        const lookback = run('rc.CreatedAt >= DATEADD(DAY, -{{lookbackDays}}, GETUTCDATE())', { lookbackDays: '30' }, [def('lookbackDays', 'number', { IsRequired: true })]);
        expect(lookback.processedSQL).toBe('rc.CreatedAt >= DATEADD(DAY, -30, GETUTCDATE())');
    });
});
