import { LogStatus, type QueryDependencySpec, type UserInfo } from '@memberjunction/core';
import { MJQueryEntityExtended, QueryEngine } from '@memberjunction/core-entities';
import { MatchCompositionPath, NormalizeCompositionCategoryPath } from '@memberjunction/sql-parser';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';
import type { CompositionPath, IComposableQuery, ResolvedComposition } from './compositionTypes.js';

/**
 * Resolves composition references to queries by full category path and query name, or by a path
 * that is a whole-segment suffix of exactly one same-named query's category path
 * (`Demos/Active Users` finds `MJ/Demos/Active Users`), which runs with a warning logged once
 * (`MJQ_COMPOSITION_PARTIAL_PATH`; save refuses it). There is no name-only fallback, and a path
 * that is a suffix of more than one query's path finds nothing. Inline dependencies of a
 * transient query are searched first, then the queries in `QueryEngine`.
 */
export class CompositionLookup {
    /** The partial paths already logged, so each is logged once per process. */
    private static readonly loggedPartialPaths = new Set<string>();

    /**
     * Resolves `path`: an exact match among `inlineDependencies`, then among the saved queries,
     * then a partial-path match, inline dependencies first.
     * @throws Error when no query has that category path and name, several have it, or several have that partial path.
     */
    static Resolve(path: CompositionPath, inlineDependencies: QueryDependencySpec[] | undefined): ResolvedComposition {
        const inline = MatchCompositionPath(path.CategoryPath, path.Name, inlineDependencies ?? []);
        if (inline.Kind === 'Exact') return CompositionLookup.inlineResolution(inline.Target);
        const saved = MatchCompositionPath(path.CategoryPath, path.Name, QueryEngine.Instance.Queries);
        if (saved.Kind === 'Exact') return CompositionLookup.savedResolution(saved.Target, inlineDependencies);
        if (saved.Kind === 'Ambiguous' && saved.Exact) {
            throw new Error(`Ambiguous query reference: "${path.FullPath}" matches ${saved.Count} queries with the same category path and name.`);
        }
        if (inline.Kind === 'PartialPath') {
            CompositionLookup.logPartialPath(path, inline.FullPath);
            return CompositionLookup.inlineResolution(inline.Target);
        }
        if (saved.Kind === 'PartialPath') {
            CompositionLookup.logPartialPath(path, saved.FullPath);
            return CompositionLookup.savedResolution(saved.Target, inlineDependencies);
        }
        throw new Error(CompositionLookup.NotFoundMessage(path));
    }

    private static inlineResolution(inline: QueryDependencySpec): ResolvedComposition {
        return {
            Query: CompositionLookup.syntheticQuery(inline),
            IsInline: true,
            ParameterDefinitions: inline.ParameterDefinitions ?? [],
            InlineDependencies: inline.Dependencies,
        };
    }

    private static savedResolution(saved: MJQueryEntityExtended, inlineDependencies: QueryDependencySpec[] | undefined): ResolvedComposition {
        return { Query: saved, IsInline: false, ParameterDefinitions: saved.QueryParameters ?? [], InlineDependencies: inlineDependencies };
    }

    /** Like {@link Resolve}, but `null` instead of an error when the query is not found. */
    static TryResolve(path: CompositionPath, inlineDependencies: QueryDependencySpec[] | undefined): ResolvedComposition | null {
        try {
            return CompositionLookup.Resolve(path, inlineDependencies);
        } catch {
            return null;
        }
    }

    /**
     * Refuses a saved query that may not be composed: not Reusable, not Approved, or not runnable
     * by `user`. A query the user may not run is refused with the not-found message
     * ({@link NotFoundMessage}). Inline dependencies are not checked: the caller supplied them.
     */
    static AssertComposable(resolved: ResolvedComposition, path: CompositionPath, user: UserInfo | undefined): void {
        if (resolved.IsInline) return;
        const query = resolved.Query;
        if (!query.Reusable) {
            throw new Error(`Query "${path.FullPath}" (${query.Name}) is not marked as Reusable. Set Reusable=true on the query to allow composition.`);
        }
        if (!query.IsApproved) {
            throw new Error(`Query "${path.FullPath}" (${query.Name}) is not Approved (status: ${query.Status}). Only Approved queries can be composed.`);
        }
        if (!user) {
            throw new Error(`Query "${path.FullPath}" (${query.Name}) is composed, which requires a context user so permission to run it can be checked.`);
        }
        if (!query.UserCanRun(user).canRun) {
            // Worded exactly as a reference that names no query, so a refusal does not confirm the query exists.
            throw new Error(CompositionLookup.NotFoundMessage(path));
        }
    }

    /**
     * The message for a composition reference that names no query, or a query the user may not run:
     * the same text for both.
     */
    static NotFoundMessage(path: CompositionPath): string {
        return `Referenced query not found: "${path.FullPath}". A composition names the query by its full category path and name ` +
            `(for example "Sales/Reports/Top Customers"); ensure the query exists at exactly that path.`;
    }

    /** A category path in comparable form: segments trimmed, empty ones dropped, joined by `/`, lower case. */
    static NormalizeCategoryPath(path: string | null | undefined): string {
        return NormalizeCompositionCategoryPath(path);
    }

    private static logPartialPath(path: CompositionPath, fullPath: string): void {
        const key = `${path.FullPath.toLowerCase()}|${fullPath.toLowerCase()}`;
        if (CompositionLookup.loggedPartialPaths.has(key)) return;
        CompositionLookup.loggedPartialPaths.add(key);
        LogStatus(`Warning (MJQ_COMPOSITION_PARTIAL_PATH): the composition reference "${path.FullPath}" names the query at "${fullPath}" ` +
            `by part of its category path. It runs; write the full path {{query:"${fullPath}"}}, because saving the partial path is refused.`);
    }

    /**
     * A plain-object query for an inline dependency. Its ID is derived from its category path and
     * name, so cycle detection and deduplication work without a saved row.
     */
    private static syntheticQuery(dep: QueryDependencySpec): IComposableQuery {
        const sql = dep.SQL;
        return {
            ID: `__inline__${dep.CategoryPath}${dep.Name}`.toLowerCase(),
            Name: dep.Name,
            SQL: sql,
            UsesTemplate: dep.UsesTemplate ?? false,
            Reusable: true,
            Status: 'Approved',
            get IsApproved(): boolean { return true; },
            UserCanRun(): { canRun: boolean; deniedEntities: string[] } { return { canRun: true, deniedEntities: [] }; },
            GetPlatformSQL(): string { return sql; },
        };
    }
}
