/**
 * How a composition reference (`{{query:"Category/Path/Name"}}`) finds its query: by the full
 * category path and name, or by a path that is a whole-segment suffix of exactly one query's full
 * category path (`Demos/Active Users` finds `MJ/Demos/Active Users`). A partial path still runs,
 * with a warning; save refuses it. There is no name-only fallback: a reference with no category
 * path finds only a query with no category.
 */

/** A query a reference can name: its name and category path (`/Sales/Reports/`, `Sales/Reports`). */
export interface CompositionPathCandidate {
    readonly Name: string;
    readonly CategoryPath?: string | null;
}

/** What {@link MatchCompositionPath} found. */
export type CompositionPathMatch<T extends CompositionPathCandidate> =
    /** Exactly one query has this full category path and name. */
    | { readonly Kind: 'Exact'; readonly Target: T }
    /** The path is a whole-segment suffix of exactly one query's category path; `FullPath` is that query's full path. */
    | { readonly Kind: 'PartialPath'; readonly Target: T; readonly FullPath: string }
    /** More than one query matches, exactly (`Exact` true) or by suffix. */
    | { readonly Kind: 'Ambiguous'; readonly Exact: boolean; readonly Count: number }
    | { readonly Kind: 'NotFound' };

/** The segments of a category path: trimmed, empty ones dropped (`/Sales/ Reports/` → `Sales`, `Reports`). */
export function CompositionPathSegments(path: string | readonly string[] | null | undefined): string[] {
    const parts = typeof path === 'string' ? path.split('/') : [...(path ?? [])];
    return parts.map(s => s.trim()).filter(s => s.length > 0);
}

/** A category path in comparable form: its segments joined by `/`, lower case. */
export function NormalizeCompositionCategoryPath(path: string | readonly string[] | null | undefined): string {
    return CompositionPathSegments(path).join('/').toLowerCase();
}

/** A query's full path as a reference writes it: its category segments and name joined by `/`. */
export function CompositionFullPath(candidate: CompositionPathCandidate): string {
    return [...CompositionPathSegments(candidate.CategoryPath), candidate.Name].join('/');
}

/**
 * Finds the query a reference names among `candidates`.
 * @param categoryPath - The reference's category path, as text or segments; empty for a query with no category.
 * @param name - The reference's query name. Names and segments compare ignoring case and surrounding spaces.
 */
export function MatchCompositionPath<T extends CompositionPathCandidate>(
    categoryPath: string | readonly string[] | null | undefined,
    name: string,
    candidates: readonly T[],
): CompositionPathMatch<T> {
    const wanted = CompositionPathSegments(categoryPath).map(s => s.toLowerCase());
    const named = candidates.filter(c => c.Name.trim().toLowerCase() === name.trim().toLowerCase());
    const exact = named.filter(c => NormalizeCompositionCategoryPath(c.CategoryPath) === wanted.join('/'));
    if (exact.length === 1) return { Kind: 'Exact', Target: exact[0] };
    if (exact.length > 1) return { Kind: 'Ambiguous', Exact: true, Count: exact.length };
    if (wanted.length === 0) return { Kind: 'NotFound' };
    const bySuffix = named.filter(c => isSegmentSuffix(wanted, CompositionPathSegments(c.CategoryPath).map(s => s.toLowerCase())));
    if (bySuffix.length === 1) return { Kind: 'PartialPath', Target: bySuffix[0], FullPath: CompositionFullPath(bySuffix[0]) };
    if (bySuffix.length > 1) return { Kind: 'Ambiguous', Exact: false, Count: bySuffix.length };
    return { Kind: 'NotFound' };
}

/** Whether `suffix` is the last segments of `path`, and shorter than it. */
function isSegmentSuffix(suffix: readonly string[], path: readonly string[]): boolean {
    if (suffix.length >= path.length) return false;
    const offset = path.length - suffix.length;
    return suffix.every((segment, i) => segment === path[offset + i]);
}
