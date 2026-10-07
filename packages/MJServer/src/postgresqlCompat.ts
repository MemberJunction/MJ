import { LexSQL } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

const sqlServer = new SQLServerDialect();

/**
 * Translates SQL Server bracket-quoted identifiers (`[Name]`) to PostgreSQL double-quoted ones
 * (`"Name"`), for SQL written in SQL Server syntax that runs on PostgreSQL. Only identifiers
 * change: brackets inside string literals and comments are left as written. A `]]` in a name
 * becomes `]`, and a `"` in a name is doubled.
 */
export function TranslateBracketsToPG(sql: string): string {
    return LexSQL(sql, sqlServer)
        .map(t => t.Kind === 'identifier' && t.Text.startsWith('[') ? toDoubleQuoted(t.Text) : t.Text)
        .join('');
}

function toDoubleQuoted(bracketed: string): string {
    const name = bracketed.slice(1, bracketed.endsWith(']') ? -1 : undefined).replace(/]]/g, ']');
    return `"${name.replace(/"/g, '""')}"`;
}
