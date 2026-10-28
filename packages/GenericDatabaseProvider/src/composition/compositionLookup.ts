import type { QueryDependencySpec, UserInfo } from '@memberjunction/core';
import { MJQueryEntityExtended, QueryEngine } from '@memberjunction/core-entities';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';
import type { CompositionPath, IComposableQuery, ResolvedComposition } from './compositionTypes.js';

/**
 * Resolves composition references to queries, by **full category path and query name only**: a
 * reference whose path does not match exactly is not found, even when its name alone would be
 * unique. Category path + name is unique, so the match is never ambiguous. Inline dependencies of
 * a transient query are searched first, then the queries in `QueryEngine`.
 */
export class CompositionLookup {
    /**
     * Resolves `path` among `inlineDependencies`, then the saved queries.
     * @throws Error when no query has exactly that category path and name.
     */
    static Resolve(path: CompositionPath, inlineDependencies: QueryDependencySpec[] | undefined): ResolvedComposition {
        const inline = CompositionLookup.findInline(path, inlineDependencies ?? []);
        if (inline) {
            return {
                Query: CompositionLookup.syntheticQuery(inline),
                IsInline: true,
                ParameterDefinitions: inline.ParameterDefinitions ?? [],
                InlineDependencies: inline.Dependencies,
            };
        }
        const saved = CompositionLookup.findSaved(path);
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
        return (path ?? '').split('/').map(s => s.trim()).filter(s => s.length > 0).join('/').toLowerCase();
    }

    private static findInline(path: CompositionPath, dependencies: QueryDependencySpec[]): QueryDependencySpec | undefined {
        const category = CompositionLookup.NormalizeCategoryPath(path.CategoryPath);
        const name = path.Name.toLowerCase();
        return dependencies.find(d => d.Name.toLowerCase() === name && CompositionLookup.NormalizeCategoryPath(d.CategoryPath) === category);
    }

    private static findSaved(path: CompositionPath): MJQueryEntityExtended {
        const category = CompositionLookup.NormalizeCategoryPath(path.CategoryPath);
        const name = path.Name.toLowerCase();
        const matches = QueryEngine.Instance.Queries.filter(q => q.Name.toLowerCase() === name && CompositionLookup.NormalizeCategoryPath(q.CategoryPath) === category);
        if (matches.length === 0) {
            throw new Error(CompositionLookup.NotFoundMessage(path));
        }
        if (matches.length > 1) {
            throw new Error(`Ambiguous query reference: "${path.FullPath}" matches ${matches.length} queries with the same category path and name.`);
        }
        return matches[0];
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
