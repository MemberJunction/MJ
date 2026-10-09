import { IsPlatformSQL, type EntityInfo, type PlatformSQL, type UserInfo } from '@memberjunction/core';
import { LexSQL, SQLParser } from '@memberjunction/sql-parser';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';

/** A client-supplied SQL fragment: plain text, or a set of per-platform variants. */
export type ClientClauseText = string | PlatformSQL | null | undefined;

/** The SQL fragments a RunView request can carry from a client. */
export interface ClientViewClauseSet {
    ExtraFilter?: ClientClauseText;
    OrderBy?: ClientClauseText;
    OverrideExcludeFilter?: ClientClauseText;
}

/**
 * The entity base views a client fragment may read. `Qualified` is keyed by `schema.view`, `Bare`
 * by view name alone; a bare name that exists in more than one schema maps to `null`.
 */
export interface EntityBaseViewAllowList {
    Qualified: Map<string, EntityInfo>;
    Bare: Map<string, EntityInfo | null>;
}

/**
 * A provider that screens client SQL clauses with {@link ClientClauseScreen} against its own
 * entities and dialect. `GenericDatabaseProvider` is one; server code that hands client SQL text
 * to RunView outside the API entry points asks its provider through this.
 */
export interface ClientClauseScreeningProvider {
    ScreenClientClause(clause: string | null | undefined, label: string, contextUser?: UserInfo, entityInfo?: EntityInfo): void;
}

/** True when `provider` can screen client SQL clauses. */
export function IsClientClauseScreeningProvider(provider: object | null | undefined): provider is ClientClauseScreeningProvider {
    return !!provider && 'ScreenClientClause' in provider && typeof provider.ScreenClientClause === 'function';
}

/** One variant of a clause, with the dialect it would run under. */
interface ClauseVariant {
    Text: string;
    Dialect: SQLParserDialect;
}

/**
 * SECURITY — screens for SQL text that a client (or a client-saved record) supplies to RunView.
 *
 * {@link ClientClauseScreen.AssertClauseUsesEntityBaseViews} is the full screen: one statement,
 * parsed as a read-only fragment, whose table references are only entity base views the acting
 * user can read. Base tables and system catalogs are refused. Apply it at every point where client
 * text enters RunView: the GraphQL and REST entry points, ad-hoc list sources, and the clauses a
 * saved view stores (at save and when the view runs).
 *
 * {@link ClientClauseScreen.AssertSingleStatementFragment} is the light check the provider runs on
 * every RunView, server-internal ones included: no statement separator and no comment outside a
 * literal or quoted identifier. It cannot refuse a legitimate fragment, so it is safe for callers
 * whose filters the full screen would refuse (base tables, entities the acting user cannot read).
 *
 * Both use dialect-aware lexing, so a quote inside a bracket identifier (`[a']`) or a PostgreSQL
 * `E'\''` string cannot hide a statement the way it hides one from the keyword denylist.
 */
export class ClientClauseScreen {
    private static readonly WRITE_NODE_TYPES = new Set<string>([
        'insert', 'update', 'delete', 'merge', 'replace', 'drop', 'create', 'alter', 'truncate',
        'rename', 'call', 'exec', 'execute', 'grant', 'revoke', 'use', 'load', 'copy', 'do',
    ]);

    /**
     * The parser dialect for a provider: from its `PlatformKey` when it has one, otherwise from its
     * class name. Defaults to SQL Server.
     */
    public static DialectFor(provider?: object | null): SQLParserDialect {
        const platform = provider && 'PlatformKey' in provider && typeof provider.PlatformKey === 'string' ? provider.PlatformKey : undefined;
        const name = platform ?? provider?.constructor?.name ?? '';
        return /postgres/i.test(name) ? new PostgreSQLDialect() : new SQLServerDialect();
    }

    /**
     * The full screen for one client clause fragment; throws when it refuses. The label `OrderBy`
     * screens the text as an ORDER BY list; any other label screens it as a WHERE predicate. When
     * `user` is given, every entity the fragment reads must be readable by that user.
     */
    public static AssertClauseUsesEntityBaseViews(
        clause: string | null | undefined,
        label: string,
        entities: readonly EntityInfo[],
        dialect: SQLParserDialect,
        user?: UserInfo,
    ): void {
        if (!clause?.trim()) return;
        if (SQLParser.HasStackedStatements(clause, dialect)) {
            throw new Error(`Invalid ${label}: multiple statements are not permitted in client-supplied filters`);
        }

        const fragment = ClientClauseScreen.toDialectQuoting(clause, dialect);
        const wrapped =
            label === 'OrderBy'
                ? `SELECT 1 FROM __mj_clause_screen ORDER BY ${fragment}`
                : `SELECT 1 FROM __mj_clause_screen WHERE (${fragment})`;
        const parser = new SQLParser(wrapped, dialect);
        if (!parser.IsValid || parser.HasWriteStatement || parser.StatementKind !== 'select') {
            throw new Error(`Invalid ${label}: not a safe read-only filter fragment — refusing under uncertainty`);
        }
        if (ClientClauseScreen.AstContainsWriteNode(parser.AST)) {
            throw new Error(`Invalid ${label}: write/DDL nested in a subquery is not permitted`);
        }

        const allowed = ClientClauseScreen.BuildEntityBaseViewAllowList(entities);
        for (const t of SQLParser.ExtractTableRefs(wrapped, dialect)) {
            const table = ClientClauseScreen.StripIdentifierQuotes(t.TableName);
            const schema = ClientClauseScreen.StripIdentifierQuotes(t.SchemaName);
            if (table.toLowerCase() === '__mj_clause_screen') continue;
            ClientClauseScreen.AssertTableRefReadable(allowed, schema, table, label, user);
        }
    }

    /**
     * Applies {@link AssertClauseUsesEntityBaseViews} to every clause of a RunView request. A
     * platform-specific clause has every variant screened, each under its own platform's dialect.
     */
    public static ScreenViewClauses(
        clauses: ClientViewClauseSet,
        entities: readonly EntityInfo[],
        dialect: SQLParserDialect,
        user?: UserInfo,
    ): void {
        const labelled: Array<[string, ClientClauseText]> = [
            ['ExtraFilter', clauses.ExtraFilter],
            ['OrderBy', clauses.OrderBy],
            ['OverrideExcludeFilter', clauses.OverrideExcludeFilter],
        ];
        for (const [label, value] of labelled) {
            for (const variant of ClientClauseScreen.clauseVariants(value, label, dialect)) {
                ClientClauseScreen.AssertClauseUsesEntityBaseViews(variant.Text, label, entities, variant.Dialect, user);
            }
        }
    }

    /**
     * Refuses a statement separator or a comment outside literals and quoted identifiers. A filter
     * or sort fragment never needs either, so this cannot refuse a legitimate clause.
     */
    public static AssertSingleStatementFragment(clause: string | null | undefined, label: string, dialect: SQLParserDialect): void {
        if (clause == null || clause === '') return;
        if (typeof clause !== 'string') {
            throw new Error(`Invalid ${label}: expected SQL text`);
        }
        const token = LexSQL(clause, dialect).find((t) => t.Kind === 'semicolon' || t.Kind === 'comment');
        if (token) {
            const found = token.Kind === 'semicolon' ? 'statement separators' : 'comments';
            throw new Error(`Invalid ${label}: ${found} are not permitted in a filter or sort clause`);
        }
    }

    /** True when a parsed AST contains a write or DDL node at any depth. */
    public static AstContainsWriteNode(node: unknown): boolean {
        if (!node || typeof node !== 'object') return false;
        if (Array.isArray(node)) return node.some((n) => ClientClauseScreen.AstContainsWriteNode(n));
        const obj = node as Record<string, unknown>;
        const type = obj.type;
        if (typeof type === 'string' && ClientClauseScreen.WRITE_NODE_TYPES.has(type.toLowerCase())) {
            return true;
        }
        return Object.values(obj).some((v) => ClientClauseScreen.AstContainsWriteNode(v));
    }

    /** Removes the bracket, double-quote or backtick quoting around one identifier. */
    public static StripIdentifierQuotes(name: string | null | undefined): string {
        if (!name) return '';
        return name.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').replace(/^`|`$/g, '');
    }

    /** True for a reference with no schema — which `SQLParser.ExtractTableRefs` reports as `dbo`. */
    public static IsUnqualifiedSchema(schema: string): boolean {
        return !schema || schema.toLowerCase() === 'dbo';
    }

    /** Builds the base-view allow-list for a set of entities. */
    public static BuildEntityBaseViewAllowList(entities: readonly EntityInfo[]): EntityBaseViewAllowList {
        const qualified = new Map<string, EntityInfo>();
        const bare = new Map<string, EntityInfo | null>();
        for (const e of entities) {
            const view = ClientClauseScreen.StripIdentifierQuotes(e.BaseView);
            if (!view) continue;
            const schema = ClientClauseScreen.StripIdentifierQuotes(e.SchemaName);
            const bareKey = view.toLowerCase();
            bare.set(bareKey, bare.has(bareKey) ? null : e);
            if (schema) qualified.set(`${schema}.${view}`.toLowerCase(), e);
        }
        return { Qualified: qualified, Bare: bare };
    }

    /**
     * Resolves a table reference against the allow-list and returns its entity; throws when it is
     * not an entity base view, or when `user` is given and lacks CanRead on that entity.
     *
     * A schema-qualified reference must match that exact schema. An unqualified one resolves only
     * when the view name is unique across schemas, because the database's default-schema
     * resolution, not this screen, would pick which view runs. An exact `dbo.<view>` entity wins
     * first, since `dbo` is indistinguishable from "no schema" here.
     */
    public static AssertTableRefReadable(
        allowed: EntityBaseViewAllowList,
        schema: string,
        table: string,
        label: string,
        user?: UserInfo,
    ): EntityInfo {
        const qualified = allowed.Qualified.get(`${schema}.${table}`.toLowerCase());
        const entity = ClientClauseScreen.IsUnqualifiedSchema(schema) ? qualified ?? allowed.Bare.get(table.toLowerCase()) : qualified;
        const reference = `${schema ? schema + '.' : ''}${table}`;
        if (entity === null) {
            throw new Error(`Invalid ${label}: '${table}' is a base view in more than one schema — qualify it with its schema`);
        }
        if (!entity) {
            throw new Error(`Invalid ${label}: subquery must use an entity base view, not '${reference}'`);
        }
        if (user && !entity.GetUserPermisions(user).CanRead) {
            throw new Error(`Invalid ${label}: you do not have read permission on entity '${entity.Name}' referenced by '${reference}'`);
        }
        return entity;
    }

    /** The text variants of one clause; a platform-specific clause yields each of its variants. */
    private static clauseVariants(value: ClientClauseText, label: string, dialect: SQLParserDialect): ClauseVariant[] {
        if (value == null) return [];
        if (typeof value === 'string') return [{ Text: value, Dialect: dialect }];
        if (!IsPlatformSQL(value) || typeof value.default !== 'string') {
            throw new Error(`Invalid ${label}: expected SQL text`);
        }
        const variants: ClauseVariant[] = [{ Text: value.default, Dialect: dialect }];
        for (const [variant, variantDialect] of [[value.sqlserver, new SQLServerDialect()], [value.postgresql, new PostgreSQLDialect()]] as const) {
            if (variant == null) continue;
            if (typeof variant !== 'string') throw new Error(`Invalid ${label}: expected SQL text`);
            variants.push({ Text: variant, Dialect: variantDialect });
        }
        return variants;
    }

    /**
     * The clause with T-SQL bracket identifiers in the dialect's own quoting, for a dialect that
     * does not quote with brackets. The PostgreSQL provider accepts `[Name]` in a client clause and
     * converts it the same way before running it (`PostgreSQLDataProvider.quoteIdentifiersInSQL`).
     * Only a bracket around a plain name changes; any other bracket stays as written, and the
     * grammar refuses it.
     */
    private static toDialectQuoting(clause: string, dialect: SQLParserDialect): string {
        if (dialect.QuoteIdentifier('x').startsWith('[')) return clause;
        return clause.replace(/\[(\w[\w\s]*)\]/g, (_bracketed: string, name: string) => dialect.QuoteIdentifier(name));
    }
}
