import { describe, it, expect, vi } from 'vitest';
import { EntityFieldTSType, EntityInfo } from '@memberjunction/core';
import { ScanSQLForScreening } from '@memberjunction/global';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

type ProviderWithTransform = {
    TransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string;
};

function entityWithFields(fields: Array<{ name: string; tsType: EntityFieldTSType }>): EntityInfo {
    return { Fields: fields.map((f) => ({ Name: f.name, TSType: f.tsType })) } as unknown as EntityInfo;
}

/** Number of SELECT keywords PostgreSQL reads as code in `sql`. */
function selectsInCode(sql: string): number {
    return ScanSQLForScreening(sql, 'postgresql').Tokens.filter((t) => t.Kind === 'word' && t.Text.toUpperCase() === 'SELECT').length;
}

/** Runs the transform; a refusal counts as no SELECT in code. */
function selectsAfterTransform(clause: string, entityInfo: EntityInfo): number {
    const provider = new PostgreSQLDataProvider() as unknown as ProviderWithTransform;
    try {
        return selectsInCode(provider.TransformExternalSQLClause(clause, entityInfo));
    } catch {
        return 0;
    }
}

describe('PostgreSQLDataProvider clause transform keeps literals and quoted identifiers intact', () => {
    const entity = entityWithFields([
        { name: 'Name', tsType: EntityFieldTSType.String },
        { name: 'IsActive', tsType: EntityFieldTSType.Boolean },
    ]);

    it('keeps text inside a quoted identifier out of the code when it rewrites DATEADD', () => {
        const clause = 'DATEADD(day, "a, (SELECT 1) IS NULL OR b")';
        expect(selectsInCode(clause)).toBe(0);
        expect(selectsAfterTransform(clause, entity)).toBe(0);
    });

    it('keeps text inside a string literal out of the code when it coerces a boolean comparison', () => {
        const clause = `Name = 'x' OR IsActive = '1 OR (SELECT 1) = 1 OR "IsActive" = 0'`;
        expect(selectsInCode(clause)).toBe(0);
        expect(selectsAfterTransform(clause, entity)).toBe(0);
    });

    it('leaves date function text inside a string literal unchanged', () => {
        const provider = new PostgreSQLDataProvider();
        const clause = `Name = 'DATEADD(day, 1, x) and GETUTCDATE()'`;
        expect(provider.TranslateTSQLDateFunctions(clause)).toBe(clause);
    });
});

/** Runs the transform; returns null when the clause is refused. */
function transformOrNull(clause: string, entityInfo: EntityInfo): string | null {
    const provider = new PostgreSQLDataProvider() as unknown as ProviderWithTransform;
    try {
        return provider.TransformExternalSQLClause(clause, entityInfo);
    } catch {
        return null;
    }
}

/** Upper-case words PostgreSQL reads as code in `sql`. */
function codeWords(sql: string): string[] {
    return ScanSQLForScreening(sql, 'postgresql').Tokens.filter((t) => t.Kind === 'word').map((t) => t.Text.toUpperCase());
}

/** Text of each string literal, quoted identifier and comment PostgreSQL finds in `sql`. */
function spanTexts(sql: string): string[] {
    return ScanSQLForScreening(sql, 'postgresql').Spans.map((s) => sql.slice(s.Start, s.End));
}

describe('PostgreSQLDataProvider field-name quoting and rewrites keep comments and literals intact', () => {
    const entity = entityWithFields([
        { name: 'ID', tsType: EntityFieldTSType.String },
        { name: 'text', tsType: EntityFieldTSType.String },
        { name: 'Name', tsType: EntityFieldTSType.String },
        { name: 'Type', tsType: EntityFieldTSType.String },
        { name: 'IsActive', tsType: EntityFieldTSType.Boolean },
    ]);

    it('keeps text inside a dollar-quoted string out of the code when it quotes field names', () => {
        const hidden = '$$ OR (SELECT x FROM other_table) IS NOT NULL OR ID = $$';
        const clause = `ID = text$$ OR (SELECT x FROM other_table) IS NOT NULL OR ${hidden} = text$$`;
        const out = transformOrNull(clause, entity);
        if (out !== null) expect(spanTexts(out)).toContain(hidden);
    });

    it('keeps a field name inside a string literal that follows a comment with a quote character', () => {
        const out = transformOrNull(`Name = 'a' /* ' */ OR Type = ' Type '`, entity);
        if (out !== null) expect(out).toContain(`' Type '`);
    });

    it('keeps a quoted identifier next to a bracketed name as its own identifier', () => {
        const out = transformOrNull('[Name]" OR alpha OR "', entity);
        if (out !== null) expect(spanTexts(out)).toContain('" OR alpha OR "');
    });

    it('keeps the line break that ends a comment inside a DATEADD argument', () => {
        const out = transformOrNull('DATEADD(day, 1, x -- note\n)', entity);
        if (out !== null) expect(codeWords(out)).toContain('INTERVAL');
    });
});
