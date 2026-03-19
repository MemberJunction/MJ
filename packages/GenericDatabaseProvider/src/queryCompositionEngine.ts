import { UUIDsEqual } from "@memberjunction/global";
import { SQLServerDialect, PostgreSQLDialect, type SQLDialect } from "@memberjunction/sql-dialect";
import { Metadata, QueryInfo, DatabasePlatform, UserInfo, QueryDependencySpec } from "@memberjunction/core";

/**
 * Maximum depth for recursive query composition resolution.
 * Prevents runaway recursion from deeply nested compositions.
 */
const MAX_COMPOSITION_DEPTH = 10;

/**
 * Regex for matching {{query:"CategoryPath/QueryName(params)"}} tokens.
 * Captures the full content inside the quotes including optional parameters.
 */
const COMPOSITION_TOKEN_REGEX = /\{\{query:"([^"]+)"\}\}/g;

/**
 * Regex for parsing the inner reference: path/QueryName(param1=value1, param2=value2)
 * Group 1: full path including query name (everything before optional parentheses)
 * Group 2: parameters string (inside parentheses, optional)
 */
const REFERENCE_PARSE_REGEX = /^(.+?)(?:\((.+)\))?$/;

/**
 * Regex for parsing individual parameter assignments: key=value or key='literal'
 */
const PARAM_PARSE_REGEX = /^\s*(\w+)\s*=\s*(?:'([^']*)'|(\w+))\s*$/;

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
        return stripped.includes('{{query:"');
    }

    /**
     * Parses all {{query:"..."}} tokens from SQL without resolving them.
     * Useful for dependency extraction during the save pipeline.
     * Only considers tokens outside of SQL comments.
     *
     * @param sql - The SQL text to parse
     * @returns Array of parsed token metadata
     */
    public ParseCompositionTokens(sql: string): ParsedCompositionToken[] {
        if (!sql) return [];

        const stripped = this.stripSQLComments(sql);
        const tokens: ParsedCompositionToken[] = [];
        let match: RegExpExecArray | null;
        const regex = new RegExp(COMPOSITION_TOKEN_REGEX.source, 'g');

        while ((match = regex.exec(stripped)) !== null) {
            const parsed = this.parseTokenContent(match[0], match[1]);
            if (parsed) {
                tokens.push(parsed);
            }
        }

        return tokens;
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
            finalSQL = this.assembleCTEs(cteEntries, resolvedSQL);
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

    /**
     * Parses the content inside a {{query:"..."}} token.
     */
    private parseTokenContent(fullToken: string, content: string): ParsedCompositionToken | null {
        const refMatch = REFERENCE_PARSE_REGEX.exec(content.trim());
        if (!refMatch) return null;

        const fullPath = refMatch[1].trim();
        const paramsString = refMatch[2] || '';

        // Split path into segments; last segment is the query name
        const segments = fullPath.split('/').map(s => s.trim()).filter(s => s.length > 0);
        if (segments.length === 0) return null;

        const queryName = segments[segments.length - 1];
        const categorySegments = segments.slice(0, -1);

        // Parse parameters
        const parameters: ParsedParameter[] = [];
        if (paramsString.trim().length > 0) {
            const paramParts = this.splitParams(paramsString);
            for (const part of paramParts) {
                const paramMatch = PARAM_PARSE_REGEX.exec(part);
                if (paramMatch) {
                    parameters.push({
                        Name: paramMatch[1],
                        StaticValue: paramMatch[2] !== undefined ? paramMatch[2] : null,
                        PassThroughName: paramMatch[3] !== undefined ? paramMatch[3] : null
                    });
                }
            }
        }

        return {
            FullToken: fullToken,
            CategorySegments: categorySegments,
            QueryName: queryName,
            FullPath: fullPath,
            Parameters: parameters
        };
    }

    /**
     * Splits parameter string by commas, respecting quoted values.
     */
    private splitParams(paramsString: string): string[] {
        const parts: string[] = [];
        let current = '';
        let inQuote = false;

        for (const ch of paramsString) {
            if (ch === "'" && !inQuote) {
                inQuote = true;
                current += ch;
            } else if (ch === "'" && inQuote) {
                inQuote = false;
                current += ch;
            } else if (ch === ',' && !inQuote) {
                parts.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }

        if (current.trim().length > 0) {
            parts.push(current.trim());
        }

        return parts;
    }

    /**
     * Looks up a query by category path + name in the metadata provider.
     */
    private lookupQuery(token: ParsedCompositionToken): QueryInfo {
        const result = this.lookupQueryWithInline(token);
        return result.Query;
    }

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
     */
    private assembleCTEs(cteEntries: CTEEntry[], mainSQL: string): string {
        if (cteEntries.length === 0) return mainSQL;

        // Check if the main SQL already starts with a WITH clause
        const trimmedMain = mainSQL.trimStart();
        const startsWithWith = /^WITH\s/i.test(trimmedMain);

        const cteDefinitions = cteEntries.map(entry =>
            `${entry.CTEName} AS (\n${this.stripTrailingOrderBy(entry.SQL)}\n)`
        );

        if (startsWithWith) {
            // Main SQL has its own WITH — merge by removing the leading WITH
            // and prepending our CTEs before it
            const mainWithoutWith = trimmedMain.replace(/^WITH\s+/i, '');
            return `WITH ${cteDefinitions.join(',\n')},\n${mainWithoutWith}`;
        }

        return `WITH ${cteDefinitions.join(',\n')}\n${mainSQL}`;
    }

    /**
     * Strips a trailing ORDER BY clause from SQL that will be wrapped in a CTE.
     * SQL Server (and the SQL standard) disallows ORDER BY inside CTEs unless
     * TOP, OFFSET, or FOR XML is also present. Since reusable queries often
     * include ORDER BY for standalone use, we must remove it when composing.
     */
    private stripTrailingOrderBy(sql: string): string {
        // Match a trailing ORDER BY clause (possibly with ASC/DESC, multiple columns)
        // that is NOT accompanied by TOP, OFFSET, or FOR XML.
        // We only strip if there's no TOP in the SELECT and no OFFSET after ORDER BY.
        const trimmed = sql.trimEnd();

        // Check if the query uses TOP or OFFSET — if so, ORDER BY is valid in CTEs
        if (/\bTOP\s+\d/i.test(trimmed) || /\bOFFSET\s+\d/i.test(trimmed) || /\bFOR\s+XML\b/i.test(trimmed)) {
            return sql;
        }

        // Strip the trailing ORDER BY clause
        // Match ORDER BY followed by column references, ASC/DESC, NULLS FIRST/LAST, commas
        const orderByMatch = trimmed.match(/\bORDER\s+BY\s+[\s\S]+$/i);
        if (!orderByMatch) return sql;

        // Make sure we're not stripping ORDER BY from a subquery — check that this ORDER BY
        // is at the outermost level by counting unmatched parentheses before it
        const beforeOrderBy = trimmed.substring(0, orderByMatch.index);
        let parenDepth = 0;
        for (const ch of beforeOrderBy) {
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
        }

        // Only strip if we're at the top level (not inside a subquery)
        if (parenDepth !== 0) return sql;

        return trimmed.substring(0, orderByMatch.index).trimEnd();
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
