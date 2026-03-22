import { UUIDsEqual } from "@memberjunction/global";
import { SQLServerDialect, PostgreSQLDialect, type SQLDialect } from "@memberjunction/sql-dialect";
import { SQLParser } from "@memberjunction/sql-parser";
import { Metadata, QueryInfo, DatabasePlatform, UserInfo, QueryDependencySpec } from "@memberjunction/core";

/**
 * Maximum depth for recursive query composition resolution.
 * Prevents runaway recursion from deeply nested compositions.
 */
const MAX_COMPOSITION_DEPTH = 10;

// Composition token regex constants have been replaced by MJLexer-based parsing.
// The MJLexer provides structured tokenization with full parsing of category paths,
// query names, and parameter lists — eliminating the need for separate regex patterns.

/**
 * Metadata about a single CTE generated during composition resolution.
 */
export interface CompositionCTEInfo {
    /** ID of the referenced query */
    QueryID: string;
    /** Name of the referenced query */
    QueryName: string;
    /** Category path as written in the reference */
    CategoryPath: string;
    /** Generated CTE alias name */
    CTEName: string;
    /** Original SQL of the referenced query before parameter resolution */
    OriginalSQL: string;
    /** SQL after parameter values have been substituted */
    ResolvedSQL: string;
    /** Parameter values applied (key → resolved value) */
    Parameters: Record<string, string>;
}

/**
 * Result returned by the composition engine after resolving all {{query:"..."}} tokens.
 */
export interface CompositionResult {
    /** The fully resolved SQL with CTEs prepended */
    ResolvedSQL: string;
    /** Metadata about each CTE generated */
    CTEs: CompositionCTEInfo[];
    /** Directed dependency graph: queryId → [dependsOnQueryIds] */
    DependencyGraph: Map<string, string[]>;
    /** Whether any composition tokens were found and resolved */
    HasCompositions: boolean;
    /** True if any resolved dependency query has UsesTemplate = true (depth-first, transitive) */
    AnyDependencyUsesTemplates: boolean;
}

/**
 * Parsed representation of a single {{query:"..."}} token found in SQL.
 */
interface ParsedCompositionToken {
    /** The full original token text including {{ and }} */
    FullToken: string;
    /** Category path segments (everything before the query name) */
    CategorySegments: string[];
    /** The query name (last path segment) */
    QueryName: string;
    /** Full path as written (CategorySegments joined with /) */
    FullPath: string;
    /** Parsed parameter mappings */
    Parameters: ParsedParameter[];
}

/**
 * A single parameter from a composition reference.
 */
interface ParsedParameter {
    /** Parameter name */
    Name: string;
    /** If quoted literal: the static value. Otherwise null. */
    StaticValue: string | null;
    /** If bare name: the pass-through parameter name from the outer query. Otherwise null. */
    PassThroughName: string | null;
}

/**
 * Result of looking up a query reference — either from inline dependencies or from metadata.
 * The `IsInline` flag tells callers whether to skip governance validation.
 */
interface QueryLookupResult {
    /** The resolved QueryInfo (real or synthetic for inline deps) */
    Query: QueryInfo;
    /** True if this query was resolved from inline dependencies (skip validation) */
    IsInline: boolean;
    /** For inline deps, the nested dependencies for recursive resolution */
    NestedDependencies?: QueryDependencySpec[];
}

/**
 * Internal tracking for a CTE being built, including deduplication key.
 */
interface CTEEntry {
    /** Deduplication key: queryID + sorted param values */
    DeduplicationKey: string;
    /** Generated CTE name */
    CTEName: string;
    /** The CTE SQL body (without the WITH/AS wrapper) */
    SQL: string;
    /** Metadata */
    Info: CompositionCTEInfo;
}

/**
 * QueryCompositionEngine resolves {{query:"CategoryPath/QueryName(params)"}} tokens
 * in query SQL into Common Table Expressions (CTEs). It handles:
 *
 * - Recursive resolution of nested compositions
 * - Cycle detection via an in-progress set
 * - Parameter modes: static literals and pass-through from outer query
 * - Deduplication of identical query+params references
 * - Platform-aware SQL resolution via QueryInfo.GetPlatformSQL()
 *
 * This engine runs BEFORE Nunjucks template processing, so regular {{param}}
 * tokens are preserved for later substitution.
 */
export class QueryCompositionEngine {
    /**
     * Checks whether SQL contains any {{query:"..."}} composition tokens.
     * Use this as a fast guard before calling ResolveComposition().
     * Only considers tokens outside of SQL comments.
     */
    public HasCompositionTokens(sql: string): boolean {
        if (!sql) return false;
        const stripped = this.stripSQLComments(sql);
        const tokens = SQLParser.Tokenize(stripped);
        return tokens.some(t => t.type === 'MJ_COMPOSITION_REF');
    }

    /**
     * Parses all {{query:"..."}} tokens from SQL without resolving them.
     * Useful for dependency extraction during the save pipeline.
     * Only considers tokens outside of SQL comments.
     *
     * Uses MJLexer for structured tokenization instead of regex, providing
     * full parsing of category paths, query names, and parameter lists.
     *
     * @param sql - The SQL text to parse
     * @returns Array of parsed token metadata
     */
    public ParseCompositionTokens(sql: string): ParsedCompositionToken[] {
        if (!sql) return [];

        const stripped = this.stripSQLComments(sql);
        const refs = SQLParser.ExtractCompositionRefs(stripped);

        return refs.map(ref => {
            const categorySegments = ref.categoryPath
                ? ref.categoryPath.split('/').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
                : [];
            const fullPath = [...categorySegments, ref.queryName].join('/');

            return {
                FullToken: ref.raw,
                CategorySegments: categorySegments,
                QueryName: ref.queryName,
                FullPath: fullPath,
                Parameters: ref.parameters.map(p => ({
                    Name: p.key,
                    StaticValue: p.isPassThrough ? null : p.value,
                    PassThroughName: p.isPassThrough ? p.value : null,
                })),
            };
        });
    }

    /**
     * Resolves all {{query:"..."}} composition tokens in the given SQL into CTEs.
     *
     * @param sql - The SQL containing composition tokens
     * @param platform - Target database platform for SQL resolution
     * @param contextUser - User context for permission checks on referenced queries
     * @param outerParams - Parameter values from the outer/parent query (for pass-through resolution)
     * @param inlineDependencies - Optional inline dependency specs for transient query testing.
     *        When provided, these are checked first before falling back to Metadata.Provider.Queries.
     *        Inline dependencies skip governance validation (Reusable, IsApproved, UserCanRun).
     * @returns CompositionResult with fully resolved SQL and provenance metadata
     * @throws Error if a referenced query is not found, not composable, or creates a cycle
     */
    public ResolveComposition(
        sql: string,
        platform: DatabasePlatform,
        contextUser: UserInfo,
        outerParams?: Record<string, string>,
        inlineDependencies?: QueryDependencySpec[]
    ): CompositionResult {
        const cteEntries: CTEEntry[] = [];
        const dependencyGraph = new Map<string, string[]>();
        const inProgressSet = new Set<string>();
        // Mutable flag passed by reference through recursion — short-circuits once true
        const templateFlag = { value: false };

        const resolvedSQL = this.resolveTokensRecursive(
            sql,
            platform,
            contextUser,
            outerParams || {},
            cteEntries,
            dependencyGraph,
            inProgressSet,
            templateFlag,
            0,
            inlineDependencies
        );

        const hasCompositions = cteEntries.length > 0;
        let finalSQL = resolvedSQL;

        if (hasCompositions) {
            finalSQL = this.assembleCTEs(cteEntries, resolvedSQL, platform);
        }

        // If any dependency uses templates, Nunjucks will run on the resolved SQL.
        // Neutralize any {{ }} patterns inside SQL comments so Nunjucks doesn't
        // try to parse them as template expressions (e.g. -- Demonstrates {{query:"..."}}).
        if (templateFlag.value) {
            finalSQL = this.escapeTemplateTokensInComments(finalSQL);
        }

        return {
            ResolvedSQL: finalSQL,
            CTEs: cteEntries.map(e => e.Info),
            DependencyGraph: dependencyGraph,
            HasCompositions: hasCompositions,
            AnyDependencyUsesTemplates: templateFlag.value
        };
    }

    /**
     * Recursively resolves composition tokens in SQL, building up CTE entries.
     */
    private resolveTokensRecursive(
        sql: string,
        platform: DatabasePlatform,
        contextUser: UserInfo,
        outerParams: Record<string, string>,
        cteEntries: CTEEntry[],
        dependencyGraph: Map<string, string[]>,
        inProgressSet: Set<string>,
        templateFlag: { value: boolean },
        depth: number,
        inlineDependencies?: QueryDependencySpec[]
    ): string {
        if (depth > MAX_COMPOSITION_DEPTH) {
            throw new Error(
                `Query composition depth exceeds maximum of ${MAX_COMPOSITION_DEPTH}. ` +
                `This likely indicates an overly deep nesting chain.`
            );
        }

        const tokens = this.ParseCompositionTokens(sql);
        if (tokens.length === 0) return sql;

        let resolvedSQL = sql;

        for (const token of tokens) {
            const lookupResult = this.lookupQueryWithInline(token, inlineDependencies);
            const referencedQuery = lookupResult.Query;

            // Only validate governance (Reusable, IsApproved, permissions) for metadata-backed queries.
            // Inline dependencies are inherently authorized by the caller.
            if (!lookupResult.IsInline) {
                this.validateQueryComposable(referencedQuery, token, contextUser);
            }

            // Depth-first transitive UsesTemplate check — short-circuit once true
            if (!templateFlag.value && referencedQuery.UsesTemplate) {
                templateFlag.value = true;
            }

            // Cycle detection
            if (inProgressSet.has(referencedQuery.ID)) {
                const cyclePath = [...inProgressSet, referencedQuery.ID].join(' → ');
                throw new Error(
                    `Circular query dependency detected: ${cyclePath}. ` +
                    `Query "${referencedQuery.Name}" is already being resolved.`
                );
            }

            // Resolve parameter values
            const resolvedParams = this.resolveParameters(token.Parameters, outerParams);

            // Build deduplication key
            const dedupeKey = this.buildDeduplicationKey(referencedQuery.ID, resolvedParams);

            // Check if we already have this exact CTE
            const existingCTE = cteEntries.find(e => e.DeduplicationKey === dedupeKey);
            if (existingCTE) {
                resolvedSQL = resolvedSQL.replace(token.FullToken, existingCTE.CTEName);
                continue;
            }

            // Get platform-specific SQL for the referenced query
            const refSQL = referencedQuery.GetPlatformSQL(platform);

            // Substitute static parameter values directly into the referenced query's SQL
            const paramSubstitutedSQL = this.substituteStaticParams(refSQL, resolvedParams);

            // Track in-progress for cycle detection
            inProgressSet.add(referencedQuery.ID);

            // For inline deps, pass their nested dependencies into the recursive call.
            // For metadata deps, pass the parent's inline deps so sibling references work.
            const nestedInlineDeps = lookupResult.IsInline
                ? lookupResult.NestedDependencies
                : inlineDependencies;

            // Recursively resolve any nested composition tokens in the referenced query
            const nestedResolvedSQL = this.resolveTokensRecursive(
                paramSubstitutedSQL,
                platform,
                contextUser,
                resolvedParams,
                cteEntries,
                dependencyGraph,
                inProgressSet,
                templateFlag,
                depth + 1,
                nestedInlineDeps
            );

            inProgressSet.delete(referencedQuery.ID);

            // Track dependency
            const parentDeps = dependencyGraph.get('__current__') || [];
            if (!parentDeps.some(id => UUIDsEqual(id, referencedQuery.ID))) {
                parentDeps.push(referencedQuery.ID);
                dependencyGraph.set('__current__', parentDeps);
            }

            // Generate CTE name (platform-aware: brackets for SQL Server, double quotes for PG)
            const cteName = this.generateCTEName(referencedQuery, resolvedParams, platform);

            const cteEntry: CTEEntry = {
                DeduplicationKey: dedupeKey,
                CTEName: cteName,
                SQL: nestedResolvedSQL,
                Info: {
                    QueryID: referencedQuery.ID,
                    QueryName: referencedQuery.Name,
                    CategoryPath: token.FullPath,
                    CTEName: cteName,
                    OriginalSQL: refSQL,
                    ResolvedSQL: nestedResolvedSQL,
                    Parameters: resolvedParams
                }
            };

            cteEntries.push(cteEntry);
            resolvedSQL = resolvedSQL.replace(token.FullToken, cteName);
        }

        return resolvedSQL;
    }

    // parseTokenContent and splitParams removed — composition token parsing
    // is now handled by MJLexer via SQLParser.ExtractCompositionRefs()

    /**
     * Looks up a query by category path + name, checking inline dependencies first,
     * then falling back to the metadata provider.
     *
     * For inline dependencies, creates a synthetic QueryInfo with the SQL and flags set
     * appropriately. Inline queries skip governance validation (Reusable, IsApproved, etc.)
     * since they are inherently authorized by the caller.
     */
    private lookupQueryWithInline(
        token: ParsedCompositionToken,
        inlineDependencies?: QueryDependencySpec[]
    ): QueryLookupResult {
        // Check inline dependencies first
        if (inlineDependencies && inlineDependencies.length > 0) {
            const inlineMatch = this.findInlineDependency(token, inlineDependencies);
            if (inlineMatch) {
                const syntheticQuery = this.buildSyntheticQueryInfo(inlineMatch);
                return {
                    Query: syntheticQuery,
                    IsInline: true,
                    NestedDependencies: inlineMatch.Dependencies,
                };
            }
        }

        // Fall back to metadata provider
        return {
            Query: this.lookupQueryFromMetadata(token),
            IsInline: false,
        };
    }

    /**
     * Finds a matching inline dependency spec for the given token.
     */
    private findInlineDependency(
        token: ParsedCompositionToken,
        inlineDependencies: QueryDependencySpec[]
    ): QueryDependencySpec | undefined {
        const queryName = token.QueryName.toLowerCase();

        // Try category path + name match first
        if (token.CategorySegments.length > 0) {
            const expectedPath = `/${token.CategorySegments.join('/')}/`;
            const match = inlineDependencies.find(d =>
                d.Name.toLowerCase() === queryName &&
                d.CategoryPath.toLowerCase() === expectedPath.toLowerCase()
            );
            if (match) return match;
        }

        // Fall back to name-only match
        return inlineDependencies.find(d => d.Name.toLowerCase() === queryName);
    }

    /**
     * Builds a synthetic QueryInfo from an inline dependency spec.
     * Sets flags so that GetPlatformSQL returns the inline SQL directly.
     */
    private buildSyntheticQueryInfo(dep: QueryDependencySpec): QueryInfo {
        const synthetic = new QueryInfo();
        // Use a deterministic synthetic ID based on name+path to support cycle detection and deduplication
        synthetic.ID = `__inline__${dep.CategoryPath}${dep.Name}`.toLowerCase();
        synthetic.Name = dep.Name;
        synthetic.SQL = dep.SQL;
        synthetic.UsesTemplate = dep.UsesTemplate ?? false;
        synthetic.Reusable = true;
        synthetic.Status = 'Approved';
        return synthetic;
    }

    /**
     * Looks up a query by category path + name from the metadata provider only.
     */
    private lookupQueryFromMetadata(token: ParsedCompositionToken): QueryInfo {
        const allQueries = Metadata.Provider.Queries;
        const queryName = token.QueryName.toLowerCase();

        // If category segments provided, build expected category path
        if (token.CategorySegments.length > 0) {
            const expectedPath = `/${token.CategorySegments.join('/')}/`;
            const match = allQueries.find(q =>
                q.Name.toLowerCase() === queryName &&
                q.CategoryPath.toLowerCase() === expectedPath.toLowerCase()
            );

            if (match) return match;
        }

        // Fall back to name-only match
        const matches = allQueries.filter(q => q.Name.toLowerCase() === queryName);

        if (matches.length === 0) {
            throw new Error(
                `Referenced query not found: "${token.FullPath}". ` +
                `Ensure the query exists and the category path is correct.`
            );
        }

        if (matches.length > 1) {
            throw new Error(
                `Ambiguous query reference: "${token.FullPath}" matches ${matches.length} queries. ` +
                `Use the full category path to disambiguate.`
            );
        }

        return matches[0];
    }

    /**
     * Validates that a referenced query is eligible for composition.
     */
    private validateQueryComposable(
        query: QueryInfo,
        token: ParsedCompositionToken,
        contextUser: UserInfo
    ): void {
        if (!query.Reusable) {
            throw new Error(
                `Query "${token.FullPath}" (${query.Name}) is not marked as Reusable. ` +
                `Set Reusable=true on the query to allow composition.`
            );
        }

        if (!query.IsApproved) {
            throw new Error(
                `Query "${token.FullPath}" (${query.Name}) is not Approved (status: ${query.Status}). ` +
                `Only Approved queries can be composed.`
            );
        }

        if (!query.UserCanRun(contextUser)) {
            throw new Error(
                `User does not have permission to run referenced query "${token.FullPath}" (${query.Name}).`
            );
        }
    }

    /**
     * Resolves parameter values for a composition reference.
     * Static values are used directly; pass-through values are looked up from outer params.
     */
    private resolveParameters(
        params: ParsedParameter[],
        outerParams: Record<string, string>
    ): Record<string, string> {
        const resolved: Record<string, string> = {};

        for (const param of params) {
            if (param.StaticValue !== null) {
                resolved[param.Name] = param.StaticValue;
            } else if (param.PassThroughName !== null) {
                // Pass-through: the value comes from the outer query's parameters
                // At composition time, we create a Nunjucks placeholder so that
                // the downstream Nunjucks processor can substitute the actual value
                resolved[param.Name] = `{{${param.PassThroughName}}}`;
            }
        }

        return resolved;
    }

    /**
     * Substitutes resolved parameter values into a query's SQL.
     * - Static values: replaces {{paramName}} with 'value'
     * - Pass-through values: renames {{paramName}} to {{outerParamName}} so
     *   the downstream Nunjucks processor can resolve it from the outer query's parameters.
     */
    private substituteStaticParams(sql: string, params: Record<string, string>): string {
        let result = sql;

        for (const [name, value] of Object.entries(params)) {
            const paramRegex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');

            if (value.startsWith('{{') && value.endsWith('}}')) {
                // Pass-through: rename the inner param token to the outer param name
                // e.g., {{region}} → {{userRegion}} when the mapping is region=userRegion
                result = result.replace(paramRegex, value);
            } else if (/^-?\d+(\.\d+)?$/.test(value)) {
                // Numeric value: substitute as bare literal (no quotes)
                // so expressions like DATEADD(DAY, -{{lookbackDays}}, ...) work correctly
                result = result.replace(paramRegex, value);
            } else {
                // String value: substitute as a quoted literal
                result = result.replace(paramRegex, `'${value.replace(/'/g, "''")}'`);
            }
        }

        return result;
    }

    /**
     * Builds a deduplication key for a CTE based on query ID and sorted parameter values.
     */
    private buildDeduplicationKey(queryID: string, params: Record<string, string>): string {
        const sortedParams = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('&');

        return `${queryID}|${sortedParams}`;
    }

    /**
     * Generates a SQL-safe CTE name from the query name + short hash for uniqueness.
     */
    private generateCTEName(query: QueryInfo, params: Record<string, string>, platform: DatabasePlatform): string {
        // Sanitize query name: remove non-alphanumeric chars, replace spaces with underscores
        const sanitized = query.Name
            .replace(/[^a-zA-Z0-9_ ]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        // Create a short hash suffix from query ID + params for uniqueness
        const hashInput = query.ID + JSON.stringify(params);
        const hash = this.simpleHash(hashInput);

        const identifier = `__cte_${sanitized}_${hash}`;
        return this.getDialect(platform).QuoteIdentifier(identifier);
    }

    /**
     * Resolves a DatabasePlatform string to the corresponding SQLDialect instance.
     */
    private getDialect(platform: DatabasePlatform): SQLDialect {
        switch (platform) {
            case 'postgresql': return new PostgreSQLDialect();
            case 'sqlserver': return new SQLServerDialect();
            default: throw new Error(`Unsupported database platform: ${platform}`);
        }
    }

    /**
     * Simple string hash for generating short, deterministic suffixes.
     */
    private simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36).substring(0, 6);
    }

    /**
     * Assembles CTE entries into a WITH clause prepended to the main SQL.
     *
     * Handles the case where a dependency query's SQL itself contains a WITH clause
     * (inner CTEs). SQL does not allow nested WITH clauses, so inner CTEs are "hoisted"
     * out as sibling CTE definitions preceding the dependency's own CTE.
     */
    private assembleCTEs(cteEntries: CTEEntry[], mainSQL: string, platform: DatabasePlatform): string {
        if (cteEntries.length === 0) return mainSQL;

        // Check if the main SQL already starts with a WITH clause
        const trimmedMain = mainSQL.trimStart();
        const startsWithWith = /^WITH\s/i.test(trimmedMain);

        const dialect = this.getDialect(platform);

        // Build CTE definitions, hoisting any inner WITH clauses from dependency SQL
        const cteDefinitions: string[] = [];
        for (const entry of cteEntries) {
            const strippedSQL = this.stripTrailingOrderBy(entry.SQL, dialect);
            const trimmedSQL = strippedSQL.trimStart();

            if (/^WITH\s/i.test(trimmedSQL)) {
                // Dependency SQL has its own WITH clause — hoist inner CTEs as siblings
                const { innerCTEDefinitions, mainSelect } = this.hoistInnerCTEs(trimmedSQL, platform);
                cteDefinitions.push(...innerCTEDefinitions);
                cteDefinitions.push(`${entry.CTEName} AS (\n${mainSelect}\n)`);
            } else {
                cteDefinitions.push(`${entry.CTEName} AS (\n${strippedSQL}\n)`);
            }
        }

        if (startsWithWith) {
            // Main SQL has its own WITH — merge by removing the leading WITH
            // and prepending our CTEs before it
            const mainWithoutWith = trimmedMain.replace(/^WITH\s+/i, '');
            return `WITH ${cteDefinitions.join(',\n')},\n${mainWithoutWith}`;
        }

        return `WITH ${cteDefinitions.join(',\n')}\n${mainSQL}`;
    }

    /**
     * Extracts inner CTE definitions from SQL that starts with a WITH clause.
     *
     * Delegates to {@link SQLParser.ExtractCTEs} which uses AST parsing first
     * (via node-sql-parser), falling back to a paren-depth regex approach when
     * AST parsing fails (e.g. SQL contains Nunjucks template tokens).
     *
     * @param sql SQL starting with a WITH clause
     * @param platform Database platform, used to select the AST dialect
     */
    private hoistInnerCTEs(sql: string, platform: DatabasePlatform): { innerCTEDefinitions: string[]; mainSelect: string } {
        const dialect = platform === 'postgresql' ? 'PostgresQL' : 'TransactSQL';
        const extraction = SQLParser.ExtractCTEs(sql, dialect);

        if (!extraction) {
            // Should not happen since caller already verified WITH prefix,
            // but handle gracefully by treating the whole SQL as the main select
            return { innerCTEDefinitions: [], mainSelect: sql };
        }

        return {
            innerCTEDefinitions: extraction.CTEDefinitions,
            mainSelect: extraction.MainStatement,
        };
    }

    /**
     * Strips a trailing ORDER BY clause from SQL that will be wrapped in a CTE.
     *
     * SQL Server disallows ORDER BY inside CTEs unless TOP, OFFSET, or FOR XML is present.
     * PostgreSQL allows ORDER BY in CTEs, so no stripping is needed there.
     *
     * Uses a 4-tier strategy:
     * 1. Fast exit — no ORDER keyword at all, or dialect allows ORDER BY in CTEs
     * 2. AST path — parse (with Nunjucks preprocessing if needed), check if ORDER BY is legal
     *    (TOP/OFFSET/FOR XML via AST nodes), null out orderby if not, regenerate.
     *    Handles window functions, UNION/EXCEPT, subqueries, string literals, and Nunjucks templates.
     * 3. Regex fallback — paren-depth heuristic for SQL the parser still can't handle
     *    (e.g. STRING_AGG WITHIN GROUP)
     * 4. OFFSET 0 ROWS injection — last resort when both AST and regex fail to strip ORDER BY.
     *    Injects OFFSET 0 ROWS after the ORDER BY clause to make it legal in CTEs.
     *    This is semantically neutral (returns all rows starting from 0) but switches
     *    SQL Server into paging mode internally, which may affect query plan shape.
     */
    private stripTrailingOrderBy(sql: string, dialect: SQLDialect): string {
        if (!sql) return sql;

        const trimmed = sql.trimEnd();
        if (!/ORDER/i.test(trimmed)) return sql;
        if (dialect.AllowsOrderByInCTE) return sql;

        // Tier 2: AST-based stripping
        const astResult = this.stripOrderByViaAST(trimmed, dialect.ParserDialect);
        if (astResult !== null) return astResult;

        // Tier 3: Regex fallback
        const regexResult = this.stripOrderByViaRegex(trimmed);
        if (regexResult !== trimmed) return regexResult;

        // Tier 4: OFFSET 0 ROWS injection — last resort.
        // If we reach here, the SQL has an ORDER BY that neither AST nor regex could strip
        // (e.g. STRING_AGG WITHIN GROUP with a trailing ORDER BY). Rather than returning
        // the SQL unchanged (which would cause a SQL Server CTE error), inject OFFSET 0 ROWS
        // after the ORDER BY to make it legal. This is semantically neutral but may affect
        // query plan shape on large result sets.
        return this.injectOffset0Rows(trimmed);
    }

    /**
     * Attempts to strip the top-level ORDER BY clause using AST parsing.
     * Tries direct parsing first, then MJPlaceholder-preprocessed parsing if the SQL
     * contains MJ template syntax. Handles UNION/EXCEPT by walking the _next chain.
     */
    private stripOrderByViaAST(sql: string, parserDialect: string): string | null {
        const directResult = this.tryASTStrip(sql, parserDialect);
        if (directResult !== null) return directResult;

        // Check for MJ extensions using MJLexer (replaces regex check)
        const mjParse = SQLParser.Analyze(sql);
        if (mjParse.hasMJExtensions) {
            return this.tryNunjucksAwareStrip(sql, parserDialect);
        }

        return null;
    }

    /**
     * Core AST stripping: parse, analyze, and regenerate SQL without ORDER BY.
     */
    private tryASTStrip(sql: string, parserDialect: string): string | null {
        try {
            // Use SQLParser.ParseSQL for FOR XML multi-directive workaround
            const ast = SQLParser.ParseSQL(sql, parserDialect);
            if (!ast) return null;

            const stmt = Array.isArray(ast) ? ast[0] : ast;
            if (!stmt) return sql;

            const stmtRecord = stmt as unknown as Record<string, unknown>;
            const orderByStmt = this.findOrderByStatement(stmtRecord);
            if (!orderByStmt) return sql;
            if (this.isOrderByLegalInCTE(orderByStmt)) return sql;

            orderByStmt.orderby = null;
            return SQLParser.SqlifyAST(Array.isArray(ast) ? ast : [stmt], parserDialect);
        } catch {
            return null;
        }
    }

    /**
     * Walks the _next chain (UNION/EXCEPT/INTERSECT) to find the statement
     * that carries the ORDER BY clause.
     */
    private findOrderByStatement(stmt: Record<string, unknown>): Record<string, unknown> | null {
        if (stmt.orderby) return stmt;
        if (stmt._next) return this.findOrderByStatement(stmt._next as Record<string, unknown>);
        return null;
    }

    /**
     * Nunjucks-aware ORDER BY stripping: preprocess templates into placeholder SQL,
     * parse with AST to confirm top-level ORDER BY exists, then use the position-aware
     * scanner on the original SQL to strip only the last top-level ORDER BY.
     */
    private tryNunjucksAwareStrip(sql: string, parserDialect: string): string | null {
        const preprocessed = this.preprocessNunjucks(sql);

        try {
            const ast = SQLParser.ParseSQL(preprocessed, parserDialect);
            if (!ast) return null;
            const stmt = Array.isArray(ast) ? ast[0] : ast;
            if (!stmt) return sql;

            const stmtRecord = stmt as unknown as Record<string, unknown>;
            const orderByStmt = this.findOrderByStatement(stmtRecord);
            if (!orderByStmt) return sql;
            if (this.isOrderByLegalInCTE(orderByStmt)) return sql;

            return this.stripLastTopLevelOrderBy(sql);
        } catch {
            return null;
        }
    }

    /**
     * Checks AST properties to determine if ORDER BY is legal in a CTE context.
     */
    private isOrderByLegalInCTE(stmt: Record<string, unknown>): boolean {
        if (stmt.top) return true;
        if (stmt.limit) return true;

        const forClause = stmt.for as Record<string, unknown> | null | undefined;
        if (forClause && typeof forClause === 'object' && forClause.type &&
            String(forClause.type).toLowerCase().includes('xml')) {
            return true;
        }

        return false;
    }

    /**
     * Strips the last top-level ORDER BY clause using position-aware scanning.
     * Skips strings, comments, Nunjucks tags, and tracks paren depth.
     */
    private stripLastTopLevelOrderBy(sql: string): string {
        const positions = this.findTopLevelOrderByPositions(sql);
        if (positions.length === 0) return sql;

        const lastPos = positions[positions.length - 1];
        return sql.substring(0, lastPos).trimEnd();
    }

    /**
     * Finds character positions of all ORDER BY keywords at the outermost level
     * (paren depth 0, not inside strings, comments, or MJ template tokens).
     *
     * Uses MJLexer to skip MJ tokens ({{ }}, {% %}, {# #}), then scans only
     * SQL_TEXT segments for ORDER BY keywords while tracking paren depth and
     * respecting SQL string literals and comments.
     */
    private findTopLevelOrderByPositions(sql: string): number[] {
        const tokens = SQLParser.Tokenize(sql);
        const positions: number[] = [];
        let parenDepth = 0;

        for (const token of tokens) {
            // Only scan SQL_TEXT tokens — MJ tokens are skipped entirely
            if (token.type !== 'SQL_TEXT') continue;

            const text = token.raw;
            let i = 0;

            while (i < text.length) {
                const ch = text[i];

                // Skip single-quoted string literals
                if (ch === "'") {
                    i++;
                    while (i < text.length) {
                        if (text[i] === "'" && i + 1 < text.length && text[i + 1] === "'") { i += 2; }
                        else if (text[i] === "'") { i++; break; }
                        else { i++; }
                    }
                    continue;
                }
                // Skip line comments
                if (ch === '-' && i + 1 < text.length && text[i + 1] === '-') {
                    while (i < text.length && text[i] !== '\n') i++;
                    continue;
                }
                // Skip block comments
                if (ch === '/' && i + 1 < text.length && text[i + 1] === '*') {
                    i += 2;
                    while (i < text.length) {
                        if (text[i] === '*' && i + 1 < text.length && text[i + 1] === '/') { i += 2; break; }
                        i++;
                    }
                    continue;
                }

                if (ch === '(') { parenDepth++; i++; continue; }
                if (ch === ')') { parenDepth--; i++; continue; }

                if (parenDepth === 0 && /^ORDER\s+BY\b/i.test(text.substring(i))) {
                    const absPos = token.start + i;
                    if (absPos === 0 || /[\s,;()\n]/.test(sql[absPos - 1])) {
                        positions.push(absPos);
                    }
                }
                i++;
            }
        }

        return positions;
    }

    /**
     * Preprocesses Nunjucks templates into valid SQL for AST parsing.
     * Uses MJPlaceholderSubstitution for context-aware placeholder generation.
     */
    private preprocessNunjucks(sql: string): string {
        return SQLParser.Substitute(sql).cleanSQL;
    }

    /**
     * Injects OFFSET 0 ROWS after the last top-level ORDER BY clause to make it
     * legal in a CTE without changing the result set. Uses the position-aware scanner
     * to find the correct insertion point after the ORDER BY columns.
     */
    private injectOffset0Rows(sql: string): string {
        // Find the end of the last top-level ORDER BY clause.
        // We append OFFSET 0 ROWS right at the end of the SQL.
        const trimmed = sql.trimEnd();
        // Remove trailing semicolon if present
        const withoutSemicolon = trimmed.replace(/;\s*$/, '');
        return `${withoutSemicolon} OFFSET 0 ROWS`;
    }

    /**
     * Regex-based fallback for stripping trailing ORDER BY.
     * Uses parenthesis depth counting to avoid stripping ORDER BY inside subqueries.
     */
    private stripOrderByViaRegex(sql: string): string {
        const orderByMatch = sql.match(/\bORDER\s+BY\s+[\s\S]+$/i);
        if (!orderByMatch) return sql;

        const beforeOrderBy = sql.substring(0, orderByMatch.index);
        let parenDepth = 0;
        for (const ch of beforeOrderBy) {
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
        }

        if (parenDepth !== 0) return sql;

        return sql.substring(0, orderByMatch.index).trimEnd();
    }

    /**
     * Strips SQL comments from the input string so that composition tokens
     * inside comments are not treated as real references.
     * Handles both single-line (-- ...) and multi-line block comments.
     * Preserves string literals (single-quoted) to avoid stripping inside them.
     */
    private stripSQLComments(sql: string): string {
        let result = '';
        let i = 0;

        while (i < sql.length) {
            // Single-quoted string literal — preserve as-is
            if (sql[i] === "'") {
                result += sql[i++];
                while (i < sql.length) {
                    if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                        // Escaped quote inside string
                        result += "''";
                        i += 2;
                    } else if (sql[i] === "'") {
                        result += sql[i++];
                        break;
                    } else {
                        result += sql[i++];
                    }
                }
            }
            // Single-line comment: -- to end of line
            else if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
                // Skip to end of line
                while (i < sql.length && sql[i] !== '\n') {
                    i++;
                }
            }
            // Block comment: /* ... */
            else if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
                i += 2; // skip /*
                while (i < sql.length) {
                    if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                        i += 2; // skip */
                        break;
                    }
                    i++;
                }
            }
            // Normal character
            else {
                result += sql[i++];
            }
        }

        return result;
    }

    /**
     * Escapes {{ and }} inside SQL comments so that Nunjucks doesn't try to parse them.
     * This is needed because dependency queries may carry comments containing
     * {{query:"..."}} examples or documentation that would otherwise cause
     * Nunjucks "expected variable end" errors.
     *
     * Only modifies content inside -- single-line and block comments.
     * Leaves string literals and normal SQL untouched.
     */
    private escapeTemplateTokensInComments(sql: string): string {
        let result = '';
        let i = 0;

        while (i < sql.length) {
            // Single-quoted string literal — preserve as-is
            if (sql[i] === "'") {
                result += sql[i++];
                while (i < sql.length) {
                    if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                        result += "''";
                        i += 2;
                    } else if (sql[i] === "'") {
                        result += sql[i++];
                        break;
                    } else {
                        result += sql[i++];
                    }
                }
            }
            // Single-line comment: -- to end of line — escape {{ and }} inside
            else if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
                let comment = '';
                while (i < sql.length && sql[i] !== '\n') {
                    comment += sql[i++];
                }
                result += comment.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
            }
            // Block comment: /* ... */ — escape {{ and }} inside
            else if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
                let comment = '/*';
                i += 2;
                while (i < sql.length) {
                    if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                        comment += '*/';
                        i += 2;
                        break;
                    }
                    comment += sql[i++];
                }
                result += comment.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
            }
            // Normal character
            else {
                result += sql[i++];
            }
        }

        return result;
    }
}
