/**
 * @module erd-generator
 * @description Generates mermaid `erDiagram` blocks from `TableDefinition[]`.
 *
 * This utility is intentionally separate from `DBAutoDoc/MermaidGenerator`,
 * which works from live DB entity metadata.  This one works from proposed
 * `TableDefinition` objects (not yet in the DB) and has zero DB dependencies.
 *
 * Called by `DatabaseDesignerAgent` after Schema Designer writes a
 * `TableDefinition` to the payload — the result is stored in
 * `SchemaDesign.ERDMermaid` and surfaced to the user in both the chat
 * approval message and the Angular wizard review step.
 */

import type { TableDefinition, ColumnDefinition } from '@memberjunction/schema-engine';

/**
 * Generates a mermaid `erDiagram` block from one or more `TableDefinition` objects.
 *
 * Each table becomes an entity block listing all of its columns with their
 * simplified SQL types and a `FK` tag where applicable.  Relationship lines
 * are drawn for every FK entry in `ForeignKeys`.
 *
 * Returns `null` for a single table with no FK relationships — a lone box with
 * no connections adds no visual value over the prototype column table.
 */
export function generateERDMermaid(tables: TableDefinition[]): string | null {
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

function buildEntityBlock(table: TableDefinition): string[] {
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

function buildRelationshipLines(tables: TableDefinition[]): string[] {
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
 * Maps a `ColumnDefinition` to a compact, mermaid-safe type token.
 * Mermaid identifiers cannot contain spaces or parentheses, so we strip
 * them: `DECIMAL(18,4)` → `DECIMAL`, `NVARCHAR(200)` → `NVARCHAR`.
 */
function toMermaidType(col: ColumnDefinition): string {
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
