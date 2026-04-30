import { UUIDsEqual } from "@memberjunction/global";
import { GetDialect, type SQLDialect } from "@memberjunction/sql-dialect";
import { SQLParser, AnalyzeTopLevelOrderBy } from "@memberjunction/sql-parser";
import { Metadata, QueryInfo, DatabasePlatform, UserInfo, QueryDependencySpec } from "@memberjunction/core";
import { SymbolTable } from "./symbolTable.js";

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

        // Comment-embedded {{ }} tokens (e.g. -- Example: {{query:"..."}}) are
        // handled by the pipeline: RenderPipeline strips SQL comments before
        // Nunjucks runs, so they never reach the template evaluator.

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

            // Get platform-specific SQL for the referenced query.
            // Strip SQL comments immediately — they serve no runtime purpose and
            // can contain {{ }} patterns that confuse substituteStaticParams,
            // Nunjucks, or ORDER BY detection. The pipeline also strips comments
            // from the outer query before Nunjucks, but dep SQL enters here
            // before it reaches the pipeline's comment-stripping step.
            const refSQL = this.stripSQLComments(referencedQuery.GetPlatformSQL(platform));

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
        const allQueries = Metadata.Provider.Queries; // global-provider-ok: data provider implementation, owns its provider context
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
    /**
     * Substitutes resolved parameter values into a query's SQL using the SQLParser's
     * MJLexer-based template manipulation methods.
     *
     * - Pass-through values: renames the inner variable to the outer variable name,
     *   preserving any Nunjucks filter chain (e.g., `{{ lookbackDays | sqlNumber }}` → `{{ numDays | sqlNumber }}`)
     * - Static values: replaces the entire template expression (including filters) with a literal value
     */
    private substituteStaticParams(sql: string, params: Record<string, string>): string {
        let result = sql;

        for (const [name, value] of Object.entries(params)) {
            if (value.startsWith('{{') && value.endsWith('}}')) {
                // Pass-through: rename the inner variable, preserving filter chain
                const outerVarName = value.slice(2, -2).trim();
                result = SQLParser.RenameTemplateVariable(result, name, outerVarName);
            } else {
                // Static value: replace entire template expression with literal
                const literal = /^-?\d+(\.\d+)?$/.test(value)
                    ? value // Numeric: bare literal
                    : `'${value.replace(/'/g, "''")}'`; // String: quoted literal
                result = SQLParser.SubstituteTemplateVariable(result, name, literal);
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
        return GetDialect(platform);
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
     *
     * Cross-dep CTE name collisions: when two different dependencies each declare
     * an inner CTE with the same name (e.g. both declare `PoolNameBridge`), the
     * naive concatenation produces a duplicate CTE error from SQL Server. We
     * track allocated names across the entire WITH and rename colliding inner
     * CTEs (and rewrite intra-dep references to the renamed CTE) so the assembled
     * SQL is valid. See Skip-Brain Bug C in
     * `__tests__/skip-failure-regressions.test.ts` and `SKIP-QUERY-RENDERING-BUGS.md`.
     */
    private assembleCTEs(cteEntries: CTEEntry[], mainSQL: string, platform: DatabasePlatform): string {
        if (cteEntries.length === 0) return mainSQL;

        const trimmedMain = mainSQL.trimStart();
        const startsWithWith = /^WITH\s/i.test(trimmedMain);
        const dialect = this.getDialect(platform);

        // SymbolTable guarantees CTE name uniqueness at registration time.
        const symTable = new SymbolTable(dialect);

        // Seed the symbol table with outer-CTE names so inner CTEs that happen
        // to share a name with an outer CTE also get renamed.
        for (const entry of cteEntries) {
            symTable.Seed(this.canonicalCTEName(entry.CTEName));
        }

        const cteDefinitions: string[] = [];
        for (const entry of cteEntries) {
            const strippedSQL = this.stripTrailingOrderBy(entry.SQL, dialect);
            const commentStrippedSQL = this.stripSQLComments(strippedSQL).trimStart();

            if (/^WITH\s/i.test(commentStrippedSQL)) {
                const { innerCTEDefinitions, mainSelect } = this.hoistInnerCTEs(commentStrippedSQL, dialect);

                // Use SymbolTable for deconfliction instead of raw Set
                const { definitions, rewrittenMainSelect } =
                    this.deconflictInnerCTEsViaSymbolTable(innerCTEDefinitions, mainSelect, symTable);

                cteDefinitions.push(...definitions);
                cteDefinitions.push(`${entry.CTEName} AS (\n${rewrittenMainSelect}\n)`);
            } else {
                cteDefinitions.push(`${entry.CTEName} AS (\n${strippedSQL}\n)`);
            }
        }

        if (!dialect.AllowsOrderByInCTE) {
            this.validateCTEBodies(cteDefinitions, cteEntries, dialect);
        }

        if (startsWithWith) {
            const mainWithoutWith = trimmedMain.replace(/^WITH\s+/i, '');
            return `WITH ${cteDefinitions.join(',\n')},\n${mainWithoutWith}`;
        }

        return `WITH ${cteDefinitions.join(',\n')}\n${mainSQL}`;
    }

    /**
     * Validates that no CTE body still contains an illegal top-level ORDER BY
     * after stripping. Throws a diagnostic error with the dep name, category
     * path, and specific reason — replacing the cryptic SQL Server error
     * "The ORDER BY clause is invalid in views, inline functions...".
     */
    private validateCTEBodies(
        cteDefinitions: string[],
        cteEntries: CTEEntry[],
        dialect: SQLDialect
    ): void {
        for (const def of cteDefinitions) {
            // Extract the CTE body between the first "(" and the last ")"
            const bodyMatch = def.match(/^([^\s]+)\s+AS\s*\(\n?([\s\S]*?)\n?\)$/i);
            if (!bodyMatch) continue;

            const cteName = bodyMatch[1];
            const body = bodyMatch[2];
            const analysis = AnalyzeTopLevelOrderBy(body, dialect);

            if (analysis.Positions.length > 0 && !analysis.IsLegalInCTE) {
                const entry = cteEntries.find(e => e.CTEName === cteName);
                const depName = entry?.Info.QueryName ?? cteName;
                const categoryPath = entry?.Info.CategoryPath ?? '';
                const position = analysis.Positions[analysis.Positions.length - 1];

                throw new Error(
                    `Composition error: dependency '${depName}'` +
                    (categoryPath ? ` (${categoryPath})` : '') +
                    ` has a trailing ORDER BY at position ${position} that could not be stripped. ` +
                    `SQL Server does not allow ORDER BY in CTEs without TOP, OFFSET, or FOR XML. ` +
                    `Either remove the ORDER BY from the dependency, or add TOP/OFFSET.`
                );
            }
        }
    }

    /**
     * Strips the surrounding bracket / quote characters from a CTE name so we
     * can compare names case-insensitively across quoting styles. `[Foo]`,
     * `"Foo"`, and bare `Foo` all canonicalize to `Foo`.
     */
    private canonicalCTEName(rawName: string): string {
        return rawName.replace(/^[\["]|[\]"]$/g, '');
    }

    /**
     * Deconflicts inner CTE names using a SymbolTable for name allocation.
     * The SymbolTable guarantees uniqueness at registration time — name
     * collisions become impossible by construction.
     *
     * Reference rewriting uses word-boundary regex over raw SQL. It does
     * NOT skip string literals or comments — inner-CTE names are unlikely
     * to appear as quoted text or column aliases in practice.
     */
    private deconflictInnerCTEsViaSymbolTable(
        innerCTEDefinitions: string[],
        mainSelect: string,
        symTable: SymbolTable
    ): { definitions: string[]; rewrittenMainSelect: string } {
        const renames = new Map<string, string>();
        const finalDefinitionHeaders: { original: string; rewritten: string }[] = [];

        for (const def of innerCTEDefinitions) {
            const headerMatch = def.match(/^(\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)(\s+AS\s*\()/i);
            if (!headerMatch) {
                finalDefinitionHeaders.push({ original: def, rewritten: def });
                continue;
            }

            const rawName = headerMatch[1];
            const canonical = this.canonicalCTEName(rawName);

            // SymbolTable.Register handles collision detection + suffix generation
            const actual = symTable.Register(canonical);

            if (actual !== canonical) {
                renames.set(canonical, actual);
                const rewrittenDef = actual + headerMatch[2] + def.substring(headerMatch[0].length);
                finalDefinitionHeaders.push({ original: def, rewritten: rewrittenDef });
            } else {
                finalDefinitionHeaders.push({ original: def, rewritten: def });
            }
        }

        if (renames.size === 0) {
            return { definitions: finalDefinitionHeaders.map(d => d.rewritten), rewrittenMainSelect: mainSelect };
        }

        const rewriteAll = (sql: string): string => {
            let result = sql;
            for (const [oldName, newName] of renames) {
                result = this.renameSQLIdentifier(result, oldName, newName);
            }
            return result;
        };

        const definitions = finalDefinitionHeaders.map(d => rewriteAll(d.rewritten));
        const rewrittenMainSelect = rewriteAll(mainSelect);
        return { definitions, rewrittenMainSelect };
    }

    /**
     * Replaces every reference to `oldName` (bare, [bracketed], or "quoted")
     * with bare `newName`. Case-insensitive. Word-boundary matched so
     * `MyAcronymBridge` is not affected by renaming `AcronymBridge`.
     *
     * Does not attempt to skip string literals or comments — see the note on
     * `deconflictInnerCTEsViaSymbolTable` for the trade-off rationale.
     */
    private renameSQLIdentifier(sql: string, oldName: string, newName: string): string {
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Three forms: [Name], "Name", or bare Name (with word boundaries).
        const pattern = new RegExp(
            `\\[${escaped}\\]|"${escaped}"|\\b${escaped}\\b`,
            'gi'
        );
        return sql.replace(pattern, newName);
    }

    /**
     * Extracts inner CTE definitions from SQL that starts with a WITH clause.
     *
     * Delegates to {@link SQLParser.ExtractCTEs} which uses AST parsing first
     * (via node-sql-parser), falling back to a paren-depth regex approach when
     * AST parsing fails (e.g. SQL contains Nunjucks template tokens).
     *
     * @param sql SQL starting with a WITH clause
     * @param dialect SQL dialect for AST parsing
     */
    private hoistInnerCTEs(sql: string, dialect: SQLDialect): { innerCTEDefinitions: string[]; mainSelect: string } {
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
     * Delegates to the shared `AnalyzeTopLevelOrderBy` utility (orderByAnalyzer.ts)
     * which implements a 2-tier strategy:
     *   Tier 1: AST parsing (with Nunjucks preprocessing if needed)
     *   Tier 2: MJLexer scanner with carried lexical state across token boundaries
     *
     * When both tiers fail to strip, falls back to OFFSET 0 ROWS injection as
     * a last resort (semantically neutral but makes ORDER BY legal in CTEs).
     */
    private stripTrailingOrderBy(sql: string, dialect: SQLDialect): string {
        if (!sql) return sql;

        const trimmed = sql.trimEnd();
        if (!/ORDER/i.test(trimmed)) return sql;
        if (dialect.AllowsOrderByInCTE) return sql;

        const analysis = AnalyzeTopLevelOrderBy(trimmed, dialect);

        // No top-level ORDER BY found — nothing to strip
        if (analysis.Positions.length === 0) return sql;

        // ORDER BY is legal in this CTE context (TOP/OFFSET/FOR XML)
        if (analysis.IsLegalInCTE) return sql;

        // Stripping succeeded — use the stripped SQL
        if (analysis.SqlWithoutOrderBy !== trimmed) return analysis.SqlWithoutOrderBy;

        // Last resort: OFFSET 0 ROWS injection
        return this.injectOffset0Rows(trimmed);
    }

    /**
     * Injects OFFSET 0 ROWS after the last top-level ORDER BY clause to make it
     * legal in a CTE without changing the result set.
     */
    private injectOffset0Rows(sql: string): string {
        const trimmed = sql.trimEnd();
        const withoutSemicolon = trimmed.replace(/;\s*$/, '');
        return `${withoutSemicolon} OFFSET 0 ROWS`;
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

}
