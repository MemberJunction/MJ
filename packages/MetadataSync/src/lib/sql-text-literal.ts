/**
 * @fileoverview SQL text literals for the `ExtraFilter`s MetadataSync builds.
 * @module sql-text-literal
 */
import { ResolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { GetDialect, type SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Text values as SQL literals for the active platform: quotes doubled, and the dialect's Unicode prefix (SQL Server
 * `N`) when the text needs it. A plain literal goes through the database code page, so a value with a character
 * outside it (e.g. '→') would never match the row that holds it.
 */
export class SQLTextLiteral {
    /** The active platform's dialect (DB_PLATFORM; SQL Server when unset). */
    protected static get Dialect(): SQLDialect {
        return GetDialect(ResolveDbPlatformFromEnv() || 'sqlserver');
    }

    /** One text value as a literal. */
    public static For(value: string): string {
        const dialect = SQLTextLiteral.Dialect;
        return `${dialect.StringLiteralPrefix(value)}${dialect.QuoteStringLiteral(value)}`;
    }

    /** Text values as a comma-separated literal list, for an `IN (…)` clause. */
    public static List(values: ReadonlyArray<string>): string {
        return values.map((v) => SQLTextLiteral.For(v)).join(', ');
    }
}
