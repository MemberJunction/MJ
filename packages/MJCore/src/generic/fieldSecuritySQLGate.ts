import { ScanSQLForScreening, SQLScreeningDialect, SQLScreeningToken } from '@memberjunction/global';
import { AutoQuoteLeavesWordBare, GetDialect, IdentifierMatches } from '@memberjunction/sql-dialect';
import { EntityInfo, FieldSecurityError } from './entityInfo';
import { UserInfo } from './securityInfo';

/** Why {@link FieldSecuritySQLGate} refuses a piece of SQL. */
export type FieldSecurityViolationKind = 'DeniedField' | 'WholeRow' | 'Unresolvable' | 'UnknownRelation';

/** One reason {@link FieldSecuritySQLGate.FindViolation} refuses a piece of SQL. */
export interface FieldSecurityViolation {
    Kind: FieldSecurityViolationKind;
    /**
     * `DeniedField`: the reference as the database reads it (a quoted identifier's bare name; on
     * PostgreSQL an unquoted name in lower case). `WholeRow`: the construct, such as `FOR JSON`.
     * `Unresolvable`: why the text could not be read. `UnknownRelation`: the relation the catalog
     * does not know.
     */
    Reference: string;
    /** The entity whose denial the reference reaches; null when the text could not be read. */
    Entity: EntityInfo | null;
}

/** What {@link FieldSecuritySQLGate} needs to judge one piece of SQL for one user. */
export interface FieldSecuritySQLContext {
    /** The acting user. */
    User: UserInfo;
    /** The dialect whose lexical rules the database applies to the text. */
    Dialect: SQLScreeningDialect;
    /** Every entity the provider knows, so base views and tables named in the text are recognized. */
    Catalog: readonly EntityInfo[];
    /**
     * For a filter, sort or aggregate fragment: the entity whose view the fragment runs against.
     * Its columns can be named without a qualifier, so its denied fields are always checked.
     */
    TargetEntity?: EntityInfo | null;
    /** Entities the SQL is known to read beyond those its text names, such as a query's declared entities. */
    ReadEntities?: readonly EntityInfo[];
    /**
     * For a whole statement, such as a saved query's SQL: refuse, for a user carrying any field
     * denial, a relation that is not a CTE and not the base view or base table of a catalog entity
     * (a custom view, synonym, table-valued function, temp table, or a name in another schema or
     * database), and `EXEC`/`CALL`. What such a relation reads cannot be checked.
     */
    RefuseUnknownRelations?: boolean;
}

/** A catalog name, folded, mapped to the entities whose base view or base table carries it. */
type RelationIndex = Map<string, EntityInfo[]>;

/** One denied field of one entity in the restricted set. */
interface DeniedName {
    Name: string;
    Entity: EntityInfo;
}

/** The per-call state of one analysis. */
interface SQLReadAnalysis {
    /** The text the tokens were read from. */
    SQL: string;
    Tokens: SQLScreeningToken[];
    Context: FieldSecuritySQLContext;
    /** Folded qualifier (relation name or alias) → the entities it may stand for. */
    Bindings: Map<string, Set<EntityInfo>>;
    /** Token indexes that declare a relation (`FROM x`). */
    RelationDeclarations: Set<number>;
    /** Token indexes that declare a relation's alias (`FROM x a`). */
    AliasDeclarations: Set<number>;
    /** Folded names (relation names and aliases) that stand for an entity the user is denied fields on. */
    RestrictedQualifiers: Set<string>;
    /** Entities the user is denied at least one field on, among those the SQL reads. */
    Restricted: Set<EntityInfo>;
    Denied: DeniedName[];
}

/** Functions whose `*` argument counts rows and reads no column. */
const ROW_COUNT_FUNCTIONS = new Set(['count', 'count_big']);

/** Words after which a relation name declares a relation (`FROM x`, `JOIN x`, `APPLY x`). */
const RELATION_KEYWORDS = new Set(['from', 'join', 'apply']);

/** Words that may stand between a relation keyword and the relation (`FROM ONLY x`, `JOIN LATERAL f(…)`). */
const RELATION_MODIFIERS = new Set(['only', 'lateral']);

/** Words in a relation position that are not a relation's name (`FROM (SELECT …)`, `FROM (VALUES …)`). */
const NOT_RELATION_NAMES = new Set(['select', 'values', 'with', 'table', 'only', 'lateral']);

/** Words that run a stored procedure, whose reads cannot be checked. */
const PROCEDURE_CALL_WORDS = new Set(['exec', 'execute', 'call']);

/**
 * Words directly inside `EXISTS (…)` that make its `SELECT *` read column values: a set operation
 * compares whole rows, and an ordinal ORDER BY with OFFSET/FETCH/LIMIT picks rows by a column.
 */
const EXISTS_ROW_READING_WORDS = new Set(['union', 'intersect', 'except', 'order', 'offset', 'fetch', 'limit']);

/** Control, format and default-ignorable characters, which a database collation may give no weight to. */
const INVISIBLE_CHARACTER = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/** Words that start a clause, so they never follow `*` as a multiplication operand. */
const CLAUSE_WORDS = new Set([
    'from', 'where', 'group', 'order', 'having', 'union', 'except', 'intersect', 'into', 'for', 'window',
    'limit', 'offset', 'fetch', 'as', 'option', 'returning', 'qualify',
]);

/** Words that end in a position where `*` is a select list, not a multiplication. */
const SELECT_LIST_WORDS = new Set(['select', 'distinct', 'all', 'top', 'percent', 'ties', 'returning', 'by', 'as']);

/** Words that cannot be a relation alias, because the grammar reads them as the next clause. */
const ALIAS_STOP_WORDS = new Set([
    'where', 'join', 'inner', 'left', 'right', 'full', 'cross', 'outer', 'on', 'group', 'order', 'having', 'union',
    'except', 'intersect', 'limit', 'offset', 'fetch', 'for', 'window', 'apply', 'pivot', 'unpivot', 'tablesample',
    'natural', 'lateral', 'with', 'using', 'select', 'returning', 'into', 'values', 'set', 'option', 'as', 'and', 'or',
]);

/** Per-catalog relation index, rebuilt when the catalog array changes length. */
const relationIndexCache = new WeakMap<readonly EntityInfo[], { Length: number; Index: RelationIndex }>();

/**
 * SECURITY — the field-level security gate for SQL text a caller authors: RunView filters, sorts and
 * aggregate expressions, a saved view's stored clauses, dataset item filters, and the rendered SQL
 * of a saved query.
 *
 * Output projection alone is not enough. A user denied `Salary` who can write
 * `ExtraFilter: "Salary > 200000"`, sort by it, or aggregate `MIN(Salary)` reconstructs its values
 * from which rows come back. This gate refuses such text before it reaches the cache or the
 * database, for every caller: client requests, agents and actions alike.
 *
 * ## How it reads the text
 *
 * The text is split into tokens with the database's own lexical rules
 * (`ScanSQLForScreening`), so a name inside a string literal or a comment is not a reference, and a
 * `[bracketed]` or `"quoted"` name is read as the bare name it is. Every unquoted word and quoted
 * identifier is then compared with every denied field of every entity the SQL reads:
 * - the entity the fragment filters (its columns can be named unqualified);
 * - the entities whose base view or base table the text names, such as a subquery's FROM;
 * - any entities the caller says the SQL reads.
 *
 * A name matches a denied field by the rule `IdentifierMatches` states, or when the two are equal
 * after Unicode compatibility folding, accent stripping and case folding, the comparisons a
 * database collation can make. So a look-alike spelling that the database would still resolve to
 * the denied column is refused too. Each name is compared on its own, so one denied name inside
 * another can never hide it.
 *
 * A reference qualified by an alias or view name that binds only to entities whose denied set
 * does not hold that name is not a reference to a denied field. An unknown qualifier is checked
 * against every restricted entity.
 *
 * ## Whole-row constructs
 *
 * For a user denied something on an entity the SQL reads, constructs that read a whole row without
 * naming its columns are refused: `SELECT *` and `alias.*` (except directly inside `EXISTS (…)`
 * whose body has no set operation or row-picking ORDER BY), `FOR JSON`, `FOR XML`, any function of
 * `*` other than `COUNT(*)`/`COUNT_BIG(*)` (for example `CHECKSUM(*)`), `NATURAL JOIN`, a column
 * alias list on such a relation, and a relation or its alias used as a value (PostgreSQL's
 * whole-row reference, as in `row_to_json(e)` or `TABLE vw`). A user with no denials on the
 * entities read is not affected; ordinary subqueries keep working.
 *
 * ## Failing closed
 *
 * Text the scanner cannot read the way the database does is refused for any user who carries a
 * denial on an entity the SQL could read. So is a name holding a control, format or
 * default-ignorable character (a zero-width joiner, a direction mark), which a collation may give
 * no weight to.
 *
 * ## Unknown columns
 *
 * A reference to a column that does not exist reaches the database, which rejects it. For a user
 * carrying denials, {@link FieldSecuritySQLGate.ErrorForInvalidColumn} turns that rejection into the
 * same {@link FieldSecurityError} a denied column gets, so the two cannot be told apart.
 */
export class FieldSecuritySQLGate {
    /**
     * The first reason `sql` must be refused for `context.User`, or null when it may run.
     *
     * @param sql A filter, sort or aggregate fragment, or a whole statement
     * @param context The user, dialect, catalog and the entities the SQL is known to read
     */
    public static FindViolation(sql: string | null | undefined, context: FieldSecuritySQLContext): FieldSecurityViolation | null {
        if (typeof sql !== 'string' || sql.trim().length === 0 || !context?.User) {
            return null;
        }
        if (!FieldSecuritySQLGate.mayReadRestrictedEntity(context)) {
            return null; // the common case: this user is denied nothing anywhere, so nothing is scanned
        }
        const scan = ScanSQLForScreening(sql, context.Dialect);
        if (!scan.Classified) {
            return { Kind: 'Unresolvable', Reference: scan.Error ?? 'the text could not be read', Entity: null };
        }
        const dynamicSQL = FieldSecuritySQLGate.findDynamicSQLCall(scan.Tokens, context.Dialect);
        if (dynamicSQL) {
            return { Kind: 'Unresolvable', Reference: `${dynamicSQL}()`, Entity: null };
        }
        if (scan.Tokens.some((t) => t.Kind !== 'string' && INVISIBLE_CHARACTER.test(t.Text))) {
            return { Kind: 'Unresolvable', Reference: 'a name contains an invisible character', Entity: null };
        }
        const unknownRelation = context.RefuseUnknownRelations ? FieldSecuritySQLGate.findUnknownRelation(scan.Tokens, context.Catalog) : null;
        if (unknownRelation) {
            return { Kind: 'UnknownRelation', Reference: unknownRelation, Entity: null };
        }
        const analysis = FieldSecuritySQLGate.analyze(sql, scan.Tokens, context);
        if (analysis.Restricted.size === 0) {
            return null;
        }
        return FieldSecuritySQLGate.findDeniedReference(analysis) ?? FieldSecuritySQLGate.findWholeRowConstruct(analysis);
    }

    /**
     * Throws a {@link FieldSecurityError} when {@link FindViolation} refuses `sql`. The error names
     * `entityName`, the entity the caller is reading, never the entity a subquery reaches, so a
     * refusal says nothing a "no such column" error would not.
     */
    public static AssertAllowed(sql: string | null | undefined, context: FieldSecuritySQLContext, entityName: string): void {
        const violation = FieldSecuritySQLGate.FindViolation(sql, context);
        if (violation) {
            throw FieldSecuritySQLGate.ErrorForViolation(violation, entityName);
        }
    }

    /**
     * Checks a whole statement, such as a saved query's rendered SQL, against the denied fields of
     * every entity it reads. The entities come from the base views and tables the text names, plus
     * `readEntities`. References are checked wherever they appear: the select list, WHERE, JOIN,
     * GROUP BY, ORDER BY and HAVING. For a user carrying any field denial, a relation the catalog
     * does not know is refused too ({@link FieldSecuritySQLContext.RefuseUnknownRelations}).
     * Throws a {@link FieldSecurityError} on the first violation, naming the entity whose denial
     * it reached (or `fallbackEntityName` when none).
     */
    public static AssertStatementAllowed(
        sql: string,
        user: UserInfo,
        catalog: readonly EntityInfo[],
        dialect: SQLScreeningDialect,
        readEntities?: readonly EntityInfo[],
        fallbackEntityName = 'query',
    ): void {
        const violation = FieldSecuritySQLGate.FindViolation(sql, {
            User: user, Dialect: dialect, Catalog: catalog, ReadEntities: readEntities, RefuseUnknownRelations: true,
        });
        if (violation) {
            throw FieldSecuritySQLGate.ErrorForViolation(violation, violation.Entity?.Name ?? fallbackEntityName);
        }
    }

    /** The error a violation raises, naming `entityName`. */
    public static ErrorForViolation(violation: FieldSecurityViolation, entityName: string): FieldSecurityError {
        if (violation.Kind === 'DeniedField') {
            return new FieldSecurityError(violation.Reference, entityName);
        }
        if (violation.Kind === 'WholeRow') {
            return new FieldSecurityError('*', entityName, FieldSecurityWholeRowMessage(violation.Reference, entityName));
        }
        // Unresolvable and UnknownRelation share one message, which says nothing about what the text names.
        return new FieldSecurityError('', entityName, FieldSecurityUnresolvableSQLMessage(entityName));
    }

    /**
     * For a user carrying field denials on `entity`, the {@link FieldSecurityError} a database's
     * "no such column" rejection becomes, so a column that does not exist and a column that is
     * denied produce the same error. Null when the user carries no denials there, or the error is
     * not a "no such column" rejection.
     *
     * Reads SQL Server's `Invalid column name 'x'` and `The multi-part identifier "a.x" could not be
     * bound`, and PostgreSQL's `column "x" does not exist` and `column a.x does not exist`.
     */
    public static ErrorForInvalidColumn(error: unknown, entity: EntityInfo | null | undefined, user: UserInfo | null | undefined): FieldSecurityError | null {
        if (!entity || !user || !FieldSecuritySQLGate.UserCarriesDenials([entity], user)) {
            return null;
        }
        const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        const column = FieldSecuritySQLGate.invalidColumnName(message);
        return column === null ? null : new FieldSecurityError(column, entity.Name);
    }

    /**
     * The entities whose base view or base table `sql` reads as a relation: a name after FROM, JOIN
     * or APPLY, or in a FROM list, wherever it appears (subqueries and CTE bodies included), with
     * schema qualifiers skipped. A name in a literal or a comment is not a relation. A bare name
     * shared by entities in several schemas yields each of them, so the set never misses a read.
     * A relation inside a parenthesized join and PostgreSQL's `FROM ONLY x` count too. Null when
     * the text cannot be read the way the database reads it.
     */
    public static RelationEntities(sql: string | null | undefined, catalog: readonly EntityInfo[], dialect: SQLScreeningDialect): EntityInfo[] | null {
        if (typeof sql !== 'string' || sql.trim().length === 0) {
            return [];
        }
        const scan = ScanSQLForScreening(sql, dialect);
        if (!scan.Classified) {
            return null;
        }
        const index = FieldSecuritySQLGate.relationIndex(catalog);
        const found = new Set<EntityInfo>();
        scan.Tokens.forEach((token, i) => {
            if (!FieldSecuritySQLGate.isName(token) || !FieldSecuritySQLGate.isRelationDeclaration(scan.Tokens, i)) return;
            index.get(FoldIdentifier(token.Text))?.forEach((entity) => found.add(entity));
        });
        return [...found];
    }

    /** True when `user` is denied at least one field on at least one of `entities`. */
    public static UserCarriesDenials(entities: Iterable<EntityInfo | null | undefined>, user: UserInfo): boolean {
        for (const entity of entities) {
            if (entity?.FieldLevelSecurityApplies && entity.GetDeniedReadFields(user).size > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * The column a database "no such column" message names, or null. A qualified name gives its
     * last part, which is what the gate reports for the same reference.
     */
    private static invalidColumnName(message: string): string | null {
        // Database messages are short; bounding the input keeps every scan below cheap even if an
        // error echoes a long caller-supplied string.
        const text = message.length > FieldSecuritySQLGate.maxErrorMessageScanLength
            ? message.slice(0, FieldSecuritySQLGate.maxErrorMessageScanLength)
            : message;
        const patterns = [
            /Invalid column name '((?:[^']|'')+)'/i,
            /multi-part identifier "((?:[^"]|"")+)" could not be bound/i,
            /column "((?:[^"]|"")+)" does not exist/i,
        ];
        for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match) {
                return FieldSecuritySQLGate.lastIdentifierPart(match[1]);
            }
        }
        const path = FieldSecuritySQLGate.postgresColumnPath(text);
        return path === null ? null : FieldSecuritySQLGate.lastIdentifierPart(path);
    }

    /** Longest prefix of a database error message scanned for a column name. */
    private static readonly maxErrorMessageScanLength = 2000;

    /** The last dot-separated part of an identifier path, unquoted and unescaped. */
    private static lastIdentifierPart(path: string): string {
        const parts = path.split('.');
        return parts[parts.length - 1].replace(/^"|"$/g, '').replace(/''/g, "'").replace(/""/g, '"');
    }

    /**
     * The identifier path in a PostgreSQL `column <path> does not exist` message (for example
     * `e.salry` or `"E"."Salry"`), or null. Scanned by hand rather than with a regular expression:
     * the path's parts may themselves contain dots, and a pattern that allows that backtracks
     * exponentially on crafted input.
     */
    private static postgresColumnPath(message: string): string | null {
        const lower = message.toLowerCase();
        const prefix = 'column ';
        const suffix = ' does not exist';
        let from = 0;
        for (let at = lower.indexOf(prefix, from); at !== -1; at = lower.indexOf(prefix, from)) {
            const start = at + prefix.length;
            const end = FieldSecuritySQLGate.identifierPathEnd(message, start);
            if (end > start && lower.startsWith(suffix, end)) {
                return message.slice(start, end);
            }
            from = at + 1;
        }
        return null;
    }

    /**
     * Index just past an identifier path starting at `start`: a run of non-space characters in
     * which double-quoted segments (with `""` escapes) may contain spaces. Returns `start` when no
     * path starts there, and -1 for an unterminated quote.
     */
    private static identifierPathEnd(message: string, start: number): number {
        let i = start;
        while (i < message.length && !/\s/.test(message[i])) {
            if (message[i] !== '"') {
                i++;
                continue;
            }
            i++; // opening quote
            while (i < message.length && !(message[i] === '"' && message[i + 1] !== '"')) {
                i += message[i] === '"' ? 2 : 1; // an escaped "" counts as one character
            }
            if (i >= message.length) return -1;
            i++; // closing quote
        }
        return i;
    }

    /**
     * The first call of a function the dialect forbids in caller SQL (one that runs SQL given as a
     * string, reads files or other databases), or null. What such a call reads cannot be checked.
     */
    private static findDynamicSQLCall(tokens: SQLScreeningToken[], dialect: SQLScreeningDialect): string | null {
        const forbidden = GetDialect(dialect).CallerSQLForbiddenFunctions;
        for (let i = 0; i < tokens.length - 1; i++) {
            const token = tokens[i];
            if (!FieldSecuritySQLGate.isName(token) || !FieldSecuritySQLGate.isSymbol(tokens[i + 1], '(')) continue;
            const name = token.Text.toLowerCase();
            if (forbidden.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p))) return token.Text;
        }
        return null;
    }

    /** True when the user carries a denial on any entity the SQL could read. */
    private static mayReadRestrictedEntity(context: FieldSecuritySQLContext): boolean {
        return FieldSecuritySQLGate.UserCarriesDenials(
            [context.TargetEntity, ...(context.ReadEntities ?? []), ...context.Catalog],
            context.User,
        );
    }

    /** Builds the relation bindings, the restricted set and its denied names. */
    private static analyze(sql: string, tokens: SQLScreeningToken[], context: FieldSecuritySQLContext): SQLReadAnalysis {
        const analysis: SQLReadAnalysis = {
            SQL: sql,
            Tokens: tokens,
            Context: context,
            Bindings: new Map(),
            RelationDeclarations: new Set(),
            AliasDeclarations: new Set(),
            RestrictedQualifiers: new Set(),
            Restricted: new Set(),
            Denied: [],
        };
        for (const entity of context.ReadEntities ?? []) {
            FieldSecuritySQLGate.addIfRestricted(analysis, entity);
        }
        const target = context.TargetEntity;
        if (target && FieldSecuritySQLGate.addIfRestricted(analysis, target)) {
            // The fragment runs inside `SELECT … FROM <base view>` with no alias, so the view's name
            // is the outer row: a PostgreSQL whole-row reference unless it qualifies a column.
            for (const name of [target.BaseView, target.BaseTable]) {
                if (name) FieldSecuritySQLGate.bind(analysis, name, [target], true);
            }
        }
        FieldSecuritySQLGate.bindRelations(analysis, FieldSecuritySQLGate.relationIndex(context.Catalog));
        for (const entity of analysis.Restricted) {
            const denied = entity.GetDeniedReadFields(context.User);
            for (const field of entity.Fields) {
                if (denied.has(field.Name.trim().toLowerCase())) analysis.Denied.push({ Name: field.Name, Entity: entity });
            }
        }
        return analysis;
    }

    /** Adds `entity` to the restricted set when the user is denied a field on it. */
    private static addIfRestricted(analysis: SQLReadAnalysis, entity: EntityInfo): boolean {
        if (!entity.FieldLevelSecurityApplies || entity.GetDeniedReadFields(analysis.Context.User).size === 0) {
            return false;
        }
        analysis.Restricted.add(entity);
        return true;
    }

    /** Records each relation the text names, its alias, and which of them are restricted. */
    private static bindRelations(analysis: SQLReadAnalysis, index: RelationIndex): void {
        analysis.Tokens.forEach((token, i) => {
            if (!FieldSecuritySQLGate.isName(token)) return;
            const entities = index.get(FoldIdentifier(token.Text));
            if (!entities) return;
            const restricted = entities.filter((e) => FieldSecuritySQLGate.addIfRestricted(analysis, e)).length > 0;
            FieldSecuritySQLGate.bind(analysis, token.Text, entities, restricted);
            if (!FieldSecuritySQLGate.isRelationDeclaration(analysis.Tokens, i)) return;
            analysis.RelationDeclarations.add(i);
            const aliasIndex = FieldSecuritySQLGate.aliasIndexAfter(analysis.Tokens, i);
            if (aliasIndex !== null) {
                analysis.AliasDeclarations.add(aliasIndex);
                FieldSecuritySQLGate.bind(analysis, analysis.Tokens[aliasIndex].Text, entities, restricted);
            }
        });
    }

    /** Binds a qualifier to entities. */
    private static bind(analysis: SQLReadAnalysis, name: string, entities: EntityInfo[], restricted: boolean): void {
        const key = FoldIdentifier(name);
        const bound = analysis.Bindings.get(key) ?? new Set<EntityInfo>();
        entities.forEach((e) => bound.add(e));
        analysis.Bindings.set(key, bound);
        if (restricted) analysis.RestrictedQualifiers.add(key);
    }

    /**
     * Whether the relation name at `i` declares a relation: it follows FROM, JOIN or APPLY, or a
     * comma in a FROM list, with any `schema .` / `database . schema .` qualifiers, a PostgreSQL
     * `ONLY`, and the parentheses of a parenthesized join skipped.
     */
    private static isRelationDeclaration(tokens: SQLScreeningToken[], i: number): boolean {
        let j = FieldSecuritySQLGate.qualifierStart(tokens, i) - 1;
        while (j >= 0 && (FieldSecuritySQLGate.isWord(tokens[j], 'only') || FieldSecuritySQLGate.isSymbol(tokens[j], '('))) {
            j--;
        }
        return FieldSecuritySQLGate.introducesRelation(tokens, j);
    }

    /** Whether the token at `j` is a FROM, JOIN or APPLY keyword, or a comma in a FROM list. */
    private static introducesRelation(tokens: SQLScreeningToken[], j: number): boolean {
        const token = tokens[j];
        if (!token) return false;
        if (token.Kind === 'word' && RELATION_KEYWORDS.has(token.Text.toLowerCase())) return true;
        return FieldSecuritySQLGate.isSymbol(token, ',') && FieldSecuritySQLGate.clauseAt(tokens, j) === 'from';
    }

    /** The index of the first part of the dotted name that ends at `i` (`db . schema . name`). */
    private static qualifierStart(tokens: SQLScreeningToken[], i: number): number {
        let j = i;
        while (j >= 2 && FieldSecuritySQLGate.isSymbol(tokens[j - 1], '.') && FieldSecuritySQLGate.isName(tokens[j - 2])) {
            j -= 2;
        }
        return j;
    }

    /**
     * The clause keyword that governs the token at `i` at its own parenthesis depth: the nearest
     * preceding SELECT, FROM, JOIN, WHERE, ON, GROUP, ORDER or HAVING at that depth. Inside the
     * parentheses of a parenthesized join (`FROM (a x, b y)`) with no such keyword, `from`.
     */
    private static clauseAt(tokens: SQLScreeningToken[], i: number): string | null {
        let depth = 0;
        for (let j = i - 1; j >= 0; j--) {
            const token = tokens[j];
            if (FieldSecuritySQLGate.isSymbol(token, ')')) depth++;
            else if (FieldSecuritySQLGate.isSymbol(token, '(')) {
                if (depth === 0) return FieldSecuritySQLGate.opensJoinGroup(tokens, j) ? 'from' : null;
                depth--;
            } else if (depth === 0 && token.Kind === 'word') {
                const word = token.Text.toLowerCase();
                if (word === 'join') return 'from';
                if (['select', 'from', 'where', 'on', 'group', 'order', 'having'].includes(word)) return word;
            }
        }
        return null;
    }

    /** Whether the `(` at `j` opens a parenthesized join: it stands where a relation is declared. */
    private static opensJoinGroup(tokens: SQLScreeningToken[], j: number): boolean {
        let k = j - 1;
        while (k >= 0 && FieldSecuritySQLGate.isSymbol(tokens[k], '(')) k--;
        return FieldSecuritySQLGate.introducesRelation(tokens, k);
    }

    /**
     * The first relation the statement reads that is not a CTE and not the base view or base table
     * of a catalog entity, or a stored-procedure call; null when there is none. A name qualified by
     * a schema no entity of that name lives in, or by a database, is unknown; so is a function in
     * a relation position (`FROM f(…)`).
     */
    private static findUnknownRelation(tokens: SQLScreeningToken[], catalog: readonly EntityInfo[]): string | null {
        const procedure = tokens.find(
            (t, i) => t.Kind === 'word' && PROCEDURE_CALL_WORDS.has(t.Text.toLowerCase()) && !FieldSecuritySQLGate.isSymbol(tokens[i - 1], '.'),
        );
        if (procedure) return procedure.Text;
        const index = FieldSecuritySQLGate.relationIndex(catalog);
        const cteNames = FieldSecuritySQLGate.cteNames(tokens);
        for (let i = 0; i < tokens.length; i++) {
            if (!FieldSecuritySQLGate.isRelationTarget(tokens, i)) continue;
            if (!FieldSecuritySQLGate.isKnownRelation(tokens, i, index, cteNames)) return tokens[i].Text;
        }
        return null;
    }

    /**
     * Whether the name at `i` is the last part of a relation the statement reads: after FROM (of a
     * SELECT, not `EXTRACT(… FROM x)` or `IS DISTINCT FROM x`), JOIN, APPLY, a FROM-list comma or
     * PostgreSQL's `TABLE`, past qualifiers, `ONLY`, `LATERAL` and join-group parentheses.
     */
    private static isRelationTarget(tokens: SQLScreeningToken[], i: number): boolean {
        const token = tokens[i];
        if (!FieldSecuritySQLGate.isName(token) || FieldSecuritySQLGate.isSymbol(tokens[i + 1], '.')) return false;
        if (token.Kind === 'word' && NOT_RELATION_NAMES.has(token.Text.toLowerCase())) return false;
        let j = FieldSecuritySQLGate.qualifierStart(tokens, i) - 1;
        while (j >= 0 && (FieldSecuritySQLGate.isSymbol(tokens[j], '(') || FieldSecuritySQLGate.isRelationModifier(tokens[j]))) {
            j--;
        }
        if (FieldSecuritySQLGate.isWord(tokens[j], 'table')) return true;
        if (!FieldSecuritySQLGate.introducesRelation(tokens, j)) return false;
        return !FieldSecuritySQLGate.isWord(tokens[j], 'from') || FieldSecuritySQLGate.isSelectFrom(tokens, j);
    }

    /** Whether a token is `ONLY` or `LATERAL`. */
    private static isRelationModifier(token: SQLScreeningToken | undefined): boolean {
        return !!token && token.Kind === 'word' && RELATION_MODIFIERS.has(token.Text.toLowerCase());
    }

    /** Whether the FROM at `j` is a SELECT's FROM clause. */
    private static isSelectFrom(tokens: SQLScreeningToken[], j: number): boolean {
        const isDistinctFrom = FieldSecuritySQLGate.isWord(tokens[j - 1], 'distinct')
            && (FieldSecuritySQLGate.isWord(tokens[j - 2], 'is') || FieldSecuritySQLGate.isWord(tokens[j - 2], 'not'));
        return !isDistinctFrom && FieldSecuritySQLGate.clauseAt(tokens, j) === 'select';
    }

    /**
     * Whether the relation whose last name part is at `i` is a CTE or a catalog entity's base view
     * or base table, in that entity's schema when qualified.
     */
    private static isKnownRelation(tokens: SQLScreeningToken[], i: number, index: RelationIndex, cteNames: Set<string>): boolean {
        if (FieldSecuritySQLGate.isSymbol(tokens[i + 1], '(')) return false; // a table-valued function
        const name = FoldIdentifier(tokens[i].Text);
        const qualifierCount = (i - FieldSecuritySQLGate.qualifierStart(tokens, i)) / 2;
        if (qualifierCount === 0 && cteNames.has(name)) return true;
        const entities = index.get(name);
        if (!entities || qualifierCount > 1) return false;
        if (qualifierCount === 0) return true;
        const schema = FoldIdentifier(tokens[i - 2].Text);
        return entities.some((e) => typeof e.SchemaName === 'string' && FoldIdentifier(e.SchemaName) === schema);
    }

    /**
     * The folded names of the CTEs a statement defines: a name after WITH, RECURSIVE or a comma
     * that is followed by an optional column list, AS, an optional `[NOT] MATERIALIZED`, and `(`.
     */
    private static cteNames(tokens: SQLScreeningToken[]): Set<string> {
        const names = new Set<string>();
        tokens.forEach((token, i) => {
            const before = tokens[i - 1];
            const introduced = FieldSecuritySQLGate.isWord(before, 'with') || FieldSecuritySQLGate.isWord(before, 'recursive')
                || FieldSecuritySQLGate.isSymbol(before, ',');
            if (introduced && FieldSecuritySQLGate.isName(token) && FieldSecuritySQLGate.opensCTEBody(tokens, i + 1)) {
                names.add(FoldIdentifier(token.Text));
            }
        });
        return names;
    }

    /** Whether the tokens from `j` are `[(columns)] AS [NOT] [MATERIALIZED] (`. */
    private static opensCTEBody(tokens: SQLScreeningToken[], j: number): boolean {
        let k = j;
        if (FieldSecuritySQLGate.isSymbol(tokens[k], '(')) {
            const close = FieldSecuritySQLGate.closingParen(tokens, k);
            if (close === -1) return false;
            k = close + 1;
        }
        if (!FieldSecuritySQLGate.isWord(tokens[k], 'as')) return false;
        k++;
        if (FieldSecuritySQLGate.isWord(tokens[k], 'not')) k++;
        if (FieldSecuritySQLGate.isWord(tokens[k], 'materialized')) k++;
        return FieldSecuritySQLGate.isSymbol(tokens[k], '(');
    }

    /** The index of the `)` that closes the `(` at `open`, or -1. */
    private static closingParen(tokens: SQLScreeningToken[], open: number): number {
        let depth = 0;
        for (let k = open; k < tokens.length; k++) {
            if (FieldSecuritySQLGate.isSymbol(tokens[k], '(')) depth++;
            else if (FieldSecuritySQLGate.isSymbol(tokens[k], ')') && --depth === 0) return k;
        }
        return -1;
    }

    /**
     * Whether the body of the `EXISTS (` whose parenthesis is at `open` has, at its own depth, a
     * word that makes a `SELECT *` there read column values ({@link EXISTS_ROW_READING_WORDS}).
     * An unclosed body counts as one that does.
     */
    private static existsBodyReadsRows(tokens: SQLScreeningToken[], open: number): boolean {
        const close = FieldSecuritySQLGate.closingParen(tokens, open);
        if (close === -1) return true;
        let depth = 0;
        for (let k = open + 1; k < close; k++) {
            const token = tokens[k];
            if (FieldSecuritySQLGate.isSymbol(token, '(')) depth++;
            else if (FieldSecuritySQLGate.isSymbol(token, ')')) depth--;
            else if (depth === 0 && token.Kind === 'word' && EXISTS_ROW_READING_WORDS.has(token.Text.toLowerCase())) return true;
        }
        return false;
    }

    /** The index of the alias after the relation at `i` (`x a`, `x AS a`), or null. */
    private static aliasIndexAfter(tokens: SQLScreeningToken[], i: number): number | null {
        let j = i + 1;
        if (FieldSecuritySQLGate.isWord(tokens[j], 'as')) j++;
        const candidate = tokens[j];
        if (!candidate) return null;
        if (candidate.Kind === 'identifier') return j;
        return candidate.Kind === 'word' && !ALIAS_STOP_WORDS.has(candidate.Text.toLowerCase()) ? j : null;
    }

    /** The first reference to a denied field, honoring qualifiers that bind to known entities. */
    private static findDeniedReference(analysis: SQLReadAnalysis): FieldSecurityViolation | null {
        for (let i = 0; i < analysis.Tokens.length; i++) {
            const token = analysis.Tokens[i];
            if (!FieldSecuritySQLGate.isName(token) || analysis.RelationDeclarations.has(i) || analysis.AliasDeclarations.has(i)) continue;
            const candidates = FieldSecuritySQLGate.candidatesFor(analysis, i);
            const hit = candidates.find((d) => ReferenceMayNameField(token.Text, d.Name));
            if (hit) {
                return { Kind: 'DeniedField', Reference: FieldSecuritySQLGate.reportedName(analysis.SQL, token, analysis.Context.Dialect), Entity: hit.Entity };
            }
        }
        return null;
    }

    /**
     * The denied names a reference at `i` could reach: those of the entities its qualifier binds to,
     * or every restricted entity's when it is unqualified or its qualifier is unknown.
     */
    private static candidatesFor(analysis: SQLReadAnalysis, i: number): DeniedName[] {
        const dot = analysis.Tokens[i - 1];
        const qualifier = analysis.Tokens[i - 2];
        if (!FieldSecuritySQLGate.isSymbol(dot, '.') || !FieldSecuritySQLGate.isName(qualifier)) {
            return analysis.Denied;
        }
        const bound = analysis.Bindings.get(FoldIdentifier(qualifier.Text));
        return bound ? analysis.Denied.filter((d) => bound.has(d.Entity)) : analysis.Denied;
    }

    /** The first whole-row construct, or null. */
    private static findWholeRowConstruct(analysis: SQLReadAnalysis): FieldSecurityViolation | null {
        const tokens = analysis.Tokens;
        for (let i = 0; i < tokens.length; i++) {
            const construct = FieldSecuritySQLGate.wholeRowConstructAt(analysis, i);
            if (construct) {
                return { Kind: 'WholeRow', Reference: construct, Entity: [...analysis.Restricted][0] ?? null };
            }
        }
        return null;
    }

    /** The whole-row construct that starts at token `i`, or null. */
    private static wholeRowConstructAt(analysis: SQLReadAnalysis, i: number): string | null {
        const tokens = analysis.Tokens;
        const token = tokens[i];
        if (FieldSecuritySQLGate.isWord(token, 'for') && (FieldSecuritySQLGate.isWord(tokens[i + 1], 'json') || FieldSecuritySQLGate.isWord(tokens[i + 1], 'xml'))) {
            return `FOR ${tokens[i + 1].Text.toUpperCase()}`;
        }
        if (FieldSecuritySQLGate.isWord(token, 'natural')) {
            return 'NATURAL JOIN';
        }
        if (FieldSecuritySQLGate.isSymbol(token, '*')) {
            return FieldSecuritySQLGate.starConstruct(analysis, i);
        }
        return FieldSecuritySQLGate.relationValueConstruct(analysis, i);
    }

    /**
     * What a `*` at `i` reads: null for a multiplication, `COUNT(*)`, `EXISTS (SELECT *` whose body
     * has no set operation or row-picking ORDER BY at its own depth, or `alias.*` whose alias binds
     * only to entities the user is denied nothing on.
     */
    private static starConstruct(analysis: SQLReadAnalysis, i: number): string | null {
        const tokens = analysis.Tokens;
        const prev = tokens[i - 1];
        if (FieldSecuritySQLGate.isSymbol(prev, '.')) {
            const qualifier = tokens[i - 2];
            const bound = FieldSecuritySQLGate.isName(qualifier) ? analysis.Bindings.get(FoldIdentifier(qualifier.Text)) : undefined;
            const unrestricted = !!bound && [...bound].every((e) => !analysis.Restricted.has(e));
            return unrestricted ? null : 'alias.*';
        }
        if (FieldSecuritySQLGate.isSymbol(prev, '(')) {
            const fn = tokens[i - 2];
            return fn?.Kind === 'word' && ROW_COUNT_FUNCTIONS.has(fn.Text.toLowerCase()) ? null : `${fn?.Text?.toUpperCase() ?? ''}(*)`;
        }
        if (FieldSecuritySQLGate.isWord(prev, 'select') && FieldSecuritySQLGate.isSymbol(tokens[i - 2], '(') && FieldSecuritySQLGate.isWord(tokens[i - 3], 'exists')) {
            return FieldSecuritySQLGate.existsBodyReadsRows(tokens, i - 2) ? 'SELECT * compared or ordered inside EXISTS' : null;
        }
        return FieldSecuritySQLGate.endsOperand(prev) && FieldSecuritySQLGate.startsOperand(tokens[i + 1]) ? null : 'SELECT *';
    }

    /**
     * A restricted relation name or alias used other than as a declaration or a qualifier (`x.`):
     * a whole-row value on PostgreSQL, or a column alias list after the declaration.
     */
    private static relationValueConstruct(analysis: SQLReadAnalysis, i: number): string | null {
        const token = analysis.Tokens[i];
        if (!FieldSecuritySQLGate.isName(token) || !analysis.RestrictedQualifiers.has(FoldIdentifier(token.Text))) {
            return null;
        }
        const next = analysis.Tokens[i + 1];
        if (analysis.AliasDeclarations.has(i)) {
            return FieldSecuritySQLGate.isSymbol(next, '(') ? 'column alias list' : null;
        }
        if (analysis.RelationDeclarations.has(i) || FieldSecuritySQLGate.isSymbol(next, '.')) {
            return null;
        }
        return `whole-row reference '${token.Text}'`;
    }

    /** Whether a token can end the left operand of a multiplication. */
    private static endsOperand(token: SQLScreeningToken | undefined): boolean {
        if (!token) return false;
        if (token.Kind === 'word') return !SELECT_LIST_WORDS.has(token.Text.toLowerCase());
        return token.Kind !== 'symbol' || token.Text === ')';
    }

    /** Whether a token can start the right operand of a multiplication. */
    private static startsOperand(token: SQLScreeningToken | undefined): boolean {
        if (!token) return false;
        if (token.Kind === 'word') return !CLAUSE_WORDS.has(token.Text.toLowerCase());
        return token.Kind !== 'symbol' || ['(', '-', '+', '~'].includes(token.Text);
    }

    /**
     * The name a "no such column" error would give for `name` as `sql` writes it, so a denied
     * column is reported exactly as an unknown one. On PostgreSQL, MJ quotes a capitalized or
     * dot-qualified word before the database sees it (`AutoQuoteLeavesWordBare`), so the error
     * names such a word as written; a word left bare is folded to lower case. A quoted name, and
     * every name on SQL Server, is reported as written. The first token spelled `name` decides.
     *
     * @param sql The caller's SQL
     * @param name The reference as the database reads it
     * @param dialect The dialect the SQL runs under
     */
    public static ReportedColumnName(sql: string, name: string, dialect: SQLScreeningDialect): string {
        const token = ScanSQLForScreening(sql, dialect).Tokens.find((t) => t.Text === name);
        return token ? FieldSecuritySQLGate.reportedName(sql, token, dialect) : name;
    }

    /** A reference's name as {@link ReportedColumnName} gives it. */
    private static reportedName(sql: string, token: SQLScreeningToken, dialect: SQLScreeningDialect): string {
        if (dialect !== 'postgresql' || token.Kind !== 'word' || !AutoQuoteLeavesWordBare(sql, token.Start, token.End)) {
            return token.Text;
        }
        return token.Text.replace(/[A-Z]/g, (c) => c.toLowerCase());
    }

    private static isName(token: SQLScreeningToken | undefined): token is SQLScreeningToken {
        return !!token && (token.Kind === 'word' || token.Kind === 'identifier');
    }

    private static isWord(token: SQLScreeningToken | undefined, word: string): boolean {
        return !!token && token.Kind === 'word' && token.Text.toLowerCase() === word;
    }

    private static isSymbol(token: SQLScreeningToken | undefined, symbol: string): boolean {
        return !!token && token.Kind === 'symbol' && token.Text === symbol;
    }

    /** Folded base view and base table names of every entity in the catalog. */
    private static relationIndex(catalog: readonly EntityInfo[]): RelationIndex {
        const cached = relationIndexCache.get(catalog);
        if (cached && cached.Length === catalog.length) {
            return cached.Index;
        }
        const index: RelationIndex = new Map();
        for (const entity of catalog) {
            for (const name of new Set([entity.BaseView, entity.BaseTable].filter((n): n is string => typeof n === 'string' && n.trim().length > 0))) {
                const key = FoldIdentifier(name);
                index.set(key, [...(index.get(key) ?? []), entity]);
            }
        }
        relationIndexCache.set(catalog, { Length: catalog.length, Index: index });
        return index;
    }
}

/**
 * An identifier reduced to the form a database collation may compare it in: Unicode compatibility
 * decomposition (a KELVIN SIGN reads as `K`, a full-width letter as its ASCII form), accents and
 * other combining marks removed, control, format and default-ignorable characters (zero-width
 * joiners, direction marks, a soft hyphen) removed, case folded through upper case (`ß` and `ẞ` both read `ss`, a
 * final `ς` reads `σ`), and surrounding spaces trimmed.
 */
export function FoldIdentifier(name: string): string {
    return name.normalize('NFKD').replace(/[\p{M}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '').toLowerCase().toUpperCase().toLowerCase().trim();
}

/**
 * Whether a reference as written may name `fieldName` on some database: by the rule
 * `IdentifierMatches` states, or when both fold to the same form ({@link FoldIdentifier}). Looser
 * than any collation, so a security check that refuses on it never lets through a reference the
 * database would resolve to the field.
 */
export function ReferenceMayNameField(reference: string, fieldName: string): boolean {
    return IdentifierMatches(reference, fieldName) || FoldIdentifier(reference) === FoldIdentifier(fieldName);
}

/** The message for a whole-row construct refused for a user carrying field denials. */
export function FieldSecurityWholeRowMessage(construct: string, entityName: string): string {
    return `SQL that reads entity '${entityName}' may not read whole rows (${construct}) — name each column it reads.`;
}

/** The message for SQL that could not be read well enough to check against field permissions. */
export function FieldSecurityUnresolvableSQLMessage(entityName: string): string {
    return `SQL that reads entity '${entityName}' could not be checked against your field permissions — rewrite it so it reads as plain SQL.`;
}
