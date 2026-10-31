import { BuildQueryTemplateContext, DatabasePlatform, UserInfo, QueryDependencySpec } from "@memberjunction/core";
import { GetDialect, type SQLDialect } from "@memberjunction/sql-dialect";
import { SQLParser, LexSQL } from "@memberjunction/sql-parser";
import { DistinctQueryIDs, CTEInfoOf } from "./composition/compositionInfo.js";
import { AssembleComposition, NewCompositionRender, OuterRenderRequest } from "./composition/renderSteps.js";

export type { IComposableQuery } from "./composition/compositionTypes.js";

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
 * QueryCompositionEngine reads and resolves `{{query:"CategoryPath/QueryName(params)"}}`
 * composition tokens.
 *
 * Composition itself is render-then-compose (see `RenderPipeline.Run`): each composed query is
 * rendered with its own arguments and the plain SQL is assembled from the rendered parts. This
 * class keeps the token-reading methods and {@link ResolveComposition}, which composes SQL whose
 * compositions take static arguments only, without rendering the outer SQL.
 */
export class QueryCompositionEngine {
    /**
     * Checks whether SQL contains any {{query:"..."}} composition tokens.
     * Use this as a fast guard before calling ResolveComposition().
     * Only tokens that are SQL count: not those inside a comment, a string literal or a
     * bracket-quoted identifier.
     */
    public HasCompositionTokens(sql: string, platform: DatabasePlatform = 'sqlserver'): boolean {
        if (!sql) return false;
        const tokens = SQLParser.Tokenize(this.maskNonSQL(sql, platform));
        return tokens.some(t => t.type === 'MJ_COMPOSITION_REF');
    }

    /**
     * `sql` with every comment, string literal and bracket-quoted identifier blanked out to
     * spaces of the same length, so a composition token found in the result is real SQL and sits
     * at the same position in the original.
     */
    private maskNonSQL(sql: string, platform: DatabasePlatform): string {
        return LexSQL(sql, this.getDialect(platform))
            .map(t => t.Kind === 'comment' || t.Kind === 'string' || (t.Kind === 'identifier' && t.Text.startsWith('['))
                ? ' '.repeat(t.Text.length)
                : t.Text)
            .join('');
    }

    /**
     * Parses all {{query:"..."}} tokens from SQL without resolving them.
     * Useful for dependency extraction during the save pipeline.
     * Only tokens that are SQL count: not those inside a comment, a string literal or a
     * bracket-quoted identifier.
     *
     * Uses MJLexer for structured tokenization instead of regex, providing
     * full parsing of category paths, query names, and parameter lists.
     *
     * @param sql - The SQL text to parse
     * @returns Array of parsed token metadata
     */
    public ParseCompositionTokens(sql: string, platform: DatabasePlatform = 'sqlserver'): ParsedCompositionToken[] {
        if (!sql) return [];

        const refs = SQLParser.ExtractCompositionRefs(this.maskNonSQL(sql, platform));

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
     * Resolves the composition tokens of `sql` into CTEs without rendering `sql` itself: each
     * composed query is rendered with the static arguments its token passes (its own compositions
     * render as usual) and the result is assembled into one statement. The outer SQL's own template
     * tags, if any, stay as written. References resolve by full category path and name only.
     *
     * @param sql - The SQL containing composition tokens
     * @param platform - Target database platform for SQL resolution
     * @param contextUser - User context for permission checks on referenced queries
     * @param _outerParams - Not used: the outer SQL is not rendered, so its compositions take
     *        static arguments only. Kept for the signature.
     * @param inlineDependencies - Optional inline dependency specs for transient query testing,
     *        searched before the saved queries. Inline dependencies skip governance validation
     *        (Reusable, IsApproved, UserCanRun).
     * @returns CompositionResult with the composed SQL and provenance metadata
     * @throws Error if a referenced query is not found, not composable, creates a cycle, or a
     *         composition of `sql` passes a value of the outer query (pass-through)
     */
    public ResolveComposition(
        sql: string,
        platform: DatabasePlatform,
        contextUser: UserInfo,
        _outerParams?: Record<string, string>,
        inlineDependencies?: QueryDependencySpec[]
    ): CompositionResult {
        const dialect = this.getDialect(platform);
        const ctx = { Platform: platform, ContextUser: contextUser, Dependencies: inlineDependencies };
        const render = NewCompositionRender(ctx, dialect, BuildQueryTemplateContext({ User: contextUser }), true);
        const outer = render.RenderOuter(OuterRenderRequest(sql, ctx));
        const assembled = AssembleComposition(outer.SQL, render.Instances, dialect);
        const hasCompositions = render.Instances.length > 0;
        return {
            ResolvedSQL: hasCompositions ? assembled.SQL : sql,
            CTEs: render.Instances.map(CTEInfoOf),
            DependencyGraph: new Map<string, string[]>(hasCompositions ? [['__current__', DistinctQueryIDs(render.Instances)]] : []),
            HasCompositions: hasCompositions,
            AnyDependencyUsesTemplates: render.Instances.some(i => i.Resolved.Query.UsesTemplate === true),
        };
    }

    /** The dialect of a platform. */
    private getDialect(platform: DatabasePlatform): SQLDialect {
        return GetDialect(platform);
    }
}
