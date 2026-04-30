/**
 * @module database-designer-erd
 * @description Client-side ERD generator for the Database Designer Angular wizard.
 *
 * Mirrors the server-side `erd-generator.ts` in `@memberjunction/database-designer-core`
 * but works with Angular-side types (`EntityTableSpec`, `ColumnSpec`, `ForeignKeySpec`)
 * to avoid importing server-only packages into the browser bundle.
 *
 * Called by `StepReviewComponent` to render an `erDiagram` in the wizard review step.
 */

import type { EntityTableSpec, ColumnSpec } from './database-designer.types.js';

/**
 * Generates a mermaid `erDiagram` block from one or more `EntityTableSpec` objects.
 *
 * Returns `null` for a single table with no FK relationships — a lone box with
 * no connections adds no visual value over the prototype column table.
 */
export function generateERDFromTableSpec(tables: EntityTableSpec[]): string | null {
    if (!tables.length) return null;

    const hasAnyFKs = tables.some(t => (t.ForeignKeys?.length ?? 0) > 0);
    if (tables.length === 1 && !hasAnyFKs) return null;

    const lines: string[] = ['erDiagram'];

    for (const table of tables) {
        lines.push(...buildEntityBlock(table));
    }

    lines.push('');

    const relationshipLines = buildRelationshipLines(tables);
    if (relationshipLines.length) {
        lines.push(...relationshipLines);
    }

    return lines.join('\n');
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildEntityBlock(table: EntityTableSpec): string[] {
    const fkColNames = new Set(
        (table.ForeignKeys ?? []).map(fk => fk.ColumnName)
    );

    const lines: string[] = [`    ${table.TableName} {`];

    for (const col of table.Columns ?? []) {
        const type = toMermaidType(col);
        const tag = fkColNames.has(col.Name) ? ' FK' : '';
        lines.push(`        ${type} ${col.Name}${tag}`);
    }

    lines.push('    }');
    return lines;
}

function buildRelationshipLines(tables: EntityTableSpec[]): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const table of tables) {
        for (const fk of table.ForeignKeys ?? []) {
            const key = `${fk.ReferencedTable}||--o{${table.TableName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(`    ${fk.ReferencedTable} ||--o{ ${table.TableName} : ""`);
        }
    }

    return lines;
}

/**
 * Maps a `ColumnSpec` to a compact, mermaid-safe type token.
 * Strips parentheses: `DECIMAL(18,4)` → `DECIMAL`, `NVARCHAR(200)` → `NVARCHAR`.
 */
function toMermaidType(col: ColumnSpec): string {
    if (col.RawSqlType) {
        return col.RawSqlType.replace(/\s*\(.*\)/, '').toUpperCase();
    }

    const typeMap: Record<string, string> = {
        string:   'NVARCHAR',
        text:     'NVARCHAR',
        json:     'NVARCHAR',
        integer:  'INT',
        bigint:   'BIGINT',
        decimal:  'DECIMAL',
        boolean:  'BIT',
        datetime: 'DATETIMEOFFSET',
        date:     'DATE',
        time:     'TIME',
        uuid:     'UNIQUEIDENTIFIER',
        float:    'FLOAT',
    };

    return typeMap[col.Type ?? ''] ?? 'NVARCHAR';
}
