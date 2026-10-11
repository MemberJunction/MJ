import { EntityPermissionType, IsPlatformSQL, type EntityInfo, type PlatformSQL, type UserInfo } from '@memberjunction/core';
import { IsKeyword, LexSQL, SignificantTokens, SQLParser } from '@memberjunction/sql-parser';
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

/** One FROM item a parsed statement reads: a table or view, or a table function. */
export interface StatementRelation {
    /**
     * The schema of the table or function as written, without quotes; empty when unqualified. A
     * three-part name keeps its database (`database.schema`), so it never matches a view in this
     * database.
     */
    SchemaName: string;
    /** The table or view name without quotes; empty when the item is not a table or view. */
    TableName: string;
    /** The table function's name; empty when the item is not a function call. */
    FunctionName: string;
}

/** What {@link ClientClauseScreen.CollectStatementReads} found in a parse tree. */
export interface StatementReads {
    /** Every FROM item, repeats included. Derived tables and VALUES lists add none of their own. */
    Relations: StatementRelation[];
    /** The SELECT nodes in the tree, each counted once. */
    SelectCount: number;
    /** The names of the CTEs the statement defines, lowercased. */
    CTENames: Set<string>;
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
 * user can read unscoped (no row filter and no denied fields). Base tables and system catalogs are
 * refused. Apply it at every point where client text enters RunView: the GraphQL and REST entry
 * points, ad-hoc list sources, and the clauses a saved view stores (at save and when the view runs).
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
    /**
     * Built-in table functions that read only their arguments. A subquery may use one in its FROM
     * when the name is unqualified; a subquery inside its arguments is screened like any other.
     */
    private static readonly ARGUMENT_ONLY_TABLE_FUNCTIONS = new Set<string>([
        'string_split', 'openjson', 'generate_series', 'unnest', 'regexp_split_to_table', 'string_to_table',
        'json_array_elements', 'json_array_elements_text', 'jsonb_array_elements', 'jsonb_array_elements_text',
        'json_each', 'json_each_text', 'jsonb_each', 'jsonb_each_text',
    ]);

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
     * `user` is given, every entity the fragment reads must be readable by that user, unscoped
     * ({@link AssertUnscopedRead}). That includes the entity the clause filters: a subquery over
     * its base view is outside the row filter RunView applies to the outer query.
     *
     * The reads come from a walk of the whole parse tree ({@link CollectStatementReads}), and the
     * clause is refused when that walk does not account for every SELECT in the text
     * ({@link AssertEverySelectAccountedFor}). Only the parse wrapper's own FROM item is skipped.
     * A name reserved for the parser is refused first ({@link AssertNoIdentifierAliasNames}).
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
        ClientClauseScreen.AssertNoIdentifierAliasNames(fragment, dialect, label);
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

        const reads = ClientClauseScreen.CollectStatementReads(parser, ClientClauseScreen.wrapperFromItem(parser.AST));
        ClientClauseScreen.AssertEverySelectAccountedFor(wrapped, dialect, reads, label);
        const allowed = ClientClauseScreen.BuildEntityBaseViewAllowList(entities);
        for (const relation of reads.Relations) {
            const entity = ClientClauseScreen.AssertRelationReadable(allowed, relation, label, user);
            if (entity && user) ClientClauseScreen.AssertUnscopedRead(entity, user, label);
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

    /**
     * Refuses an identifier, quoted or bare, in the form of a name the SQL parser gives a bracket
     * identifier it renames ({@link SQLParser.IsIdentifierAliasName}), in any case. Those names are
     * reserved for the parser, so client SQL may not use them.
     */
    public static AssertNoIdentifierAliasNames(sql: string, dialect: SQLParserDialect, label: string): void {
        const token = LexSQL(sql, dialect).find(
            (t) => (t.Kind === 'word' || t.Kind === 'identifier') && SQLParser.IsIdentifierAliasName(ClientClauseScreen.StripIdentifierQuotes(t.Text).trim()),
        );
        if (token) {
            throw new Error(`Invalid ${label}: '${token.Text}' is a name reserved for the SQL parser — use another name`);
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

    /**
     * Refuses an entity whose read `user` holds under a row filter (role row-level security or an
     * API-key row filter) or with denied fields. SQL that reads the entity's base view directly, such
     * as a subquery in a client clause or an ad-hoc query, applies neither; RunView on that entity
     * does. For any other entity, a granted read covers every row and field of its base view.
     */
    public static AssertUnscopedRead(entity: EntityInfo, user: UserInfo, label: string): void {
        if (entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').length > 0) {
            throw new Error(
                `Invalid ${label}: entity '${entity.Name}' is row-level-security filtered for you — SQL that reads its base view directly cannot apply that filter; read that entity with RunView`,
            );
        }
        if (entity.GetDeniedReadFields(user).size > 0) {
            throw new Error(
                `Invalid ${label}: entity '${entity.Name}' has fields you are not permitted to read — SQL that reads its base view directly cannot project them away; read that entity with RunView`,
            );
        }
    }

    /**
     * Every FROM item in a parsed statement, the number of SELECT nodes, and the CTE names. The
     * walk visits every property of every node, so it finds a FROM list wherever the grammar puts
     * one: a subquery in a CASE branch, HAVING, a window's ORDER BY or PARTITION BY, a function
     * argument, IN, EXISTS, a set operation or a CTE body. Every FROM item is kept, even when its
     * alias repeats. Names the fallback parse renamed are read back through
     * {@link SQLParser.IdentifierAliases}, which holds only names the parser put in the tree, so
     * the CTE names are the ones the statement declares. `skip` is a FROM item node to leave out
     * (the screen's parse wrapper).
     */
    public static CollectStatementReads(parser: SQLParser, skip?: object): StatementReads {
        const reads: StatementReads = { Relations: [], SelectCount: 0, CTENames: new Set<string>() };
        const aliases = parser.IdentifierAliases;
        const visited = new WeakSet<object>();
        const visit = (node: unknown): void => {
            if (!node || typeof node !== 'object' || visited.has(node)) return;
            visited.add(node);
            if (Array.isArray(node)) {
                node.forEach((child) => visit(child));
                return;
            }
            const record = node as Record<string, unknown>;
            if (record.type === 'select') {
                reads.SelectCount++;
                ClientClauseScreen.addFromItems(record.from, skip, aliases, reads.Relations);
            }
            ClientClauseScreen.addCTENames(record.with, aliases, reads.CTENames);
            Object.values(record).forEach((child) => visit(child));
        };
        visit(parser.AST);
        return reads;
    }

    /**
     * Refuses SQL whose SELECT keywords, outside literals, quoted identifiers and comments, differ
     * in number from the SELECT nodes a walk of its parse tree found. A subquery the walk cannot
     * see would otherwise go unchecked, so a mismatch fails closed.
     */
    public static AssertEverySelectAccountedFor(sql: string, dialect: SQLParserDialect, reads: StatementReads, label: string): void {
        const keywords = SignificantTokens(LexSQL(sql, dialect)).filter((token) => IsKeyword(token, 'SELECT')).length;
        if (keywords !== reads.SelectCount) {
            throw new Error(`Invalid ${label}: could not account for every subquery in it — refusing under uncertainty`);
        }
    }

    /**
     * The entity one FROM item reads, or null for an unqualified built-in table function that
     * reads only its arguments. Throws for any other function or row source, and when
     * {@link AssertTableRefReadable} refuses a table name.
     */
    public static AssertRelationReadable(
        allowed: EntityBaseViewAllowList,
        relation: StatementRelation,
        label: string,
        user?: UserInfo,
    ): EntityInfo | null {
        if (relation.TableName) {
            return ClientClauseScreen.AssertTableRefReadable(allowed, relation.SchemaName, relation.TableName, label, user);
        }
        const name = relation.FunctionName;
        if (name && !relation.SchemaName && ClientClauseScreen.ARGUMENT_ONLY_TABLE_FUNCTIONS.has(name.toLowerCase())) {
            return null;
        }
        const source = name ? `the table function '${[relation.SchemaName, name].filter(Boolean).join('.')}'` : 'a row source it cannot identify';
        throw new Error(`Invalid ${label}: a subquery may read only entity base views, not ${source}`);
    }

    /** Adds the relation each FROM item names. */
    private static addFromItems(
        from: unknown,
        skip: object | undefined,
        aliases: ReadonlyMap<string, string> | null,
        relations: StatementRelation[],
    ): void {
        const items: unknown[] = Array.isArray(from) ? from : from ? [from] : [];
        for (const item of items) {
            if (!item || typeof item !== 'object' || item === skip) continue;
            const relation = ClientClauseScreen.relationOf(item as Record<string, unknown>, aliases);
            if (relation) relations.push(relation);
        }
    }

    /** Adds the names of the CTEs in a `with` list. */
    private static addCTENames(ctes: unknown, aliases: ReadonlyMap<string, string> | null, names: Set<string>): void {
        if (!Array.isArray(ctes)) return;
        for (const cte of ctes) {
            const name = cte && typeof cte === 'object' ? ClientClauseScreen.identifierText((cte as { name?: unknown }).name, aliases) : '';
            if (name) names.add(name.toLowerCase());
        }
    }

    /**
     * The relation one FROM item names. A derived table and a VALUES list name none; the walk
     * reaches any subquery inside them.
     */
    private static relationOf(item: Record<string, unknown>, aliases: ReadonlyMap<string, string> | null): StatementRelation | null {
        const table = ClientClauseScreen.identifierText(item.table, aliases);
        if (table) {
            const database = ClientClauseScreen.identifierText(item.db, aliases);
            const schema = ClientClauseScreen.identifierText(item.schema, aliases);
            return { SchemaName: schema ? `${database}.${schema}` : database, TableName: table, FunctionName: '' };
        }
        const expr = item.expr && typeof item.expr === 'object' ? (item.expr as { type?: unknown; ast?: unknown; name?: unknown }) : null;
        if (expr?.ast || expr?.type === 'values') return null;
        if (expr?.type === 'function') return ClientClauseScreen.functionRelation(expr.name, aliases);
        return { SchemaName: '', TableName: '', FunctionName: '' };
    }

    /** The relation a table function names. Leading name parts join the schema, so a qualified name never matches a built-in. */
    private static functionRelation(name: unknown, aliases: ReadonlyMap<string, string> | null): StatementRelation {
        if (typeof name === 'string') return { SchemaName: '', TableName: '', FunctionName: name };
        const record = name && typeof name === 'object' ? (name as { name?: unknown; schema?: unknown }) : {};
        const parts = Array.isArray(record.name) ? record.name.map((part) => ClientClauseScreen.identifierText(part, aliases)) : [];
        const qualifiers = [ClientClauseScreen.identifierText(record.schema, aliases), ...parts.slice(0, -1)].filter(Boolean);
        return { SchemaName: qualifiers.join('.'), TableName: '', FunctionName: parts[parts.length - 1] ?? '' };
    }

    /**
     * The text of an identifier node (a string, or the PostgreSQL grammar's `{ value }` node), with
     * a name the fallback parse renamed read back from `aliases`; empty when unreadable.
     */
    private static identifierText(value: unknown, aliases: ReadonlyMap<string, string> | null): string {
        let text = '';
        if (typeof value === 'string') {
            text = value;
        } else if (value && typeof value === 'object') {
            const node = value as { value?: unknown; expr?: unknown };
            if (typeof node.value === 'string') text = node.value;
            else if (node.expr) return ClientClauseScreen.identifierText(node.expr, aliases);
        }
        return ClientClauseScreen.StripIdentifierQuotes(aliases?.get(text) ?? text);
    }

    /** The FROM item of the screen's parse wrapper: the root statement's only FROM item, when it is `__mj_clause_screen`. */
    private static wrapperFromItem(ast: unknown): object | undefined {
        const root = Array.isArray(ast) ? ast[0] : ast;
        const from = root && typeof root === 'object' ? (root as Record<string, unknown>).from : undefined;
        if (!Array.isArray(from) || from.length !== 1 || !from[0] || typeof from[0] !== 'object') return undefined;
        const item = from[0] as Record<string, unknown>;
        const isWrapper =
            ClientClauseScreen.identifierText(item.table, null).toLowerCase() === '__mj_clause_screen' &&
            !ClientClauseScreen.identifierText(item.db, null) &&
            !ClientClauseScreen.identifierText(item.schema, null);
        return isWrapper ? item : undefined;
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
