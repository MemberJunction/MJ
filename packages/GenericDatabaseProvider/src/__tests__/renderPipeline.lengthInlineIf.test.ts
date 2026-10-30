/**
 * `<name>.length` and the inline if through the render path: the interpreter gate
 * (`TemplateUnit.AssertRenderable`) lets them through, and Nunjucks renders them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata, UserInfo } from '@memberjunction/core';
import type { QueryDependencySpec } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';
import { TemplateUnit } from '../composition/templateUnit';
import { AsEntityDefs, ParamDef } from './fixtures/rtcSynthetic';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

const LENGTH_SHAPE = 'SELECT ID FROM t WHERE 1 = 1{% if Codes and Codes.length > 0 %} AND Code IN {{ Codes | sqlIn }}{% endif %}';
const INLINE_IF_SHAPE = 'SELECT TOP {{ MaxRows | sqlNumber if MaxRows else 12 }} ID FROM t';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });

afterEach(() => {
    vi.restoreAllMocks();
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as unknown as typeof Metadata.Provider);
}

/** Renders `sql` with `values`, `Codes` declared an array, `MaxRows` a number and `Name` a string. */
function render(sql: string, values: Record<string, string>): string {
    stubMetadata();
    const defs = AsEntityDefs([ParamDef('Codes', 'array'), ParamDef('MaxRows', 'number'), ParamDef('Name', 'string')]);
    return RenderPipeline.Run(sql, {
        Platform: 'sqlserver', Parameters: values, UsesTemplate: true,
        QueryInfo: { SQL: sql, UsesTemplate: true, Parameters: defs }, ParameterDefinitions: defs,
    }).FinalSQL;
}

describe('the interpreter gate', () => {
    it.each([
        ['X.length in a condition', LENGTH_SHAPE],
        ['an inline if in a hole', INLINE_IF_SHAPE],
    ])('lets %s through', (_label, sql) => {
        const unit = TemplateUnit.Read(sql, new SQLServerDialect());
        expect(() => unit.AssertRenderable('Test', [])).not.toThrow();
    });

    it.each([
        ['SELECT 1 FROM t WHERE 1 = 1{% if Codes.foo %} AND x = 1{% endif %}', /MJQ_MEMBER_ACCESS/],
        ['SELECT 1 FROM t WHERE 1 = 1{% if Codes.constructor %} AND x = 1{% endif %}', /MJQ_MEMBER_ACCESS/],
        ["SELECT 1 FROM t WHERE 1 = 1{% if Codes['length'] > 0 %} AND x = 1{% endif %}", /MJQ_SUBSCRIPT/],
    ])('still refuses %s', (sql, code) => {
        const unit = TemplateUnit.Read(sql, new SQLServerDialect());
        expect(() => unit.AssertRenderable('Test', [])).toThrow(code);
    });
});

describe('rendering X.length in a condition', () => {
    it('takes the branch for a non-empty array', () => {
        expect(render(LENGTH_SHAPE, { Codes: '["A","B"]' })).toContain("AND Code IN ('A', 'B')");
    });

    it('skips the branch for an empty array, which is truthy on its own', () => {
        expect(render(LENGTH_SHAPE, { Codes: '[]' })).toBe('SELECT ID FROM t WHERE 1 = 1');
    });

    it('skips the branch when the parameter is missing', () => {
        expect(render(LENGTH_SHAPE, {})).toBe('SELECT ID FROM t WHERE 1 = 1');
        expect(render('SELECT ID FROM t WHERE 1 = 1{% if Codes.length > 0 %} AND x = 1{% endif %}', {})).toBe('SELECT ID FROM t WHERE 1 = 1');
    });

    it('reads a string length, and gives undefined for null', () => {
        const dep: QueryDependencySpec = {
            Name: 'Dep', CategoryPath: '/Lib/', UsesTemplate: true,
            SQL: 'SELECT ID FROM t WHERE 1 = 1{% if Codes.length > 0 %} AND n = {{ Codes.length | sqlNumber }}{% endif %}',
        };
        const compose = (outer: string): string => {
            stubMetadata();
            return RenderPipeline.Run(outer, { Platform: 'sqlserver', ContextUser: user, Parameters: {}, UsesTemplate: true, Dependencies: [dep] }).FinalSQL;
        };
        expect(compose(`SELECT d.ID FROM {{query:"Lib/Dep(Codes='abc')"}} d`)).toContain('AND n = 3');
        expect(compose('SELECT d.ID FROM {{query:"Lib/Dep(Codes=none)"}} d')).not.toContain('AND n');
    });
});

describe('an inline if as a composition argument', () => {
    it('evaluates in the outer scope', () => {
        const dep: QueryDependencySpec = {
            Name: 'Dep', CategoryPath: '/Lib/', UsesTemplate: true,
            SQL: 'SELECT ID FROM t WHERE n <= {{ Limit | sqlNumber }}',
        };
        const compose = (values: Record<string, string>): string => {
            stubMetadata();
            const outer = 'SELECT d.ID FROM {{query:"Lib/Dep(Limit=MaxRows if MaxRows else 12)"}} d';
            return RenderPipeline.Run(outer, { Platform: 'sqlserver', ContextUser: user, Parameters: values, UsesTemplate: true, Dependencies: [dep] }).FinalSQL;
        };
        expect(compose({})).toContain('n <= 12');
        expect(compose({ MaxRows: '7' })).toContain('n <= 7');
    });
});

describe('rendering an inline if in a hole', () => {
    it('writes the filtered value when the condition holds', () => {
        expect(render(INLINE_IF_SHAPE, { MaxRows: '5' })).toContain('TOP 5 ID');
    });

    it('writes the else value when the parameter is missing or falsy', () => {
        expect(render(INLINE_IF_SHAPE, {})).toContain('TOP 12 ID');
        expect(render(INLINE_IF_SHAPE, { MaxRows: '0' })).toContain('TOP 12 ID');
    });

    it('applies the filter to the body only (the filter binds tighter than if)', () => {
        const sql = "SELECT ID FROM t WHERE c = {{ Name | sqlString if Name else 'NULL' }}";
        expect(render(sql, { Name: "O'Brien" })).toContain("c = 'O''Brien'");
        expect(render(sql, {})).toContain('c = NULL');
    });

    it('writes the empty string with no else', () => {
        expect(render('SELECT ID FROM t {{ MaxRows | sqlNumber if MaxRows }}', {})).toMatch(/^SELECT ID FROM t\s*$/);
    });
});
