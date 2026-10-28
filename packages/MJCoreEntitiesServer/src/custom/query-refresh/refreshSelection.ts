import type { RunViewParams } from "@memberjunction/core";
import { NormalizeUUID } from "@memberjunction/global";
import type { CompositionEdge, OrderableQuery } from "./refreshOrder";
import type { QueryRefreshContext, QueryRefreshFilter } from "./refreshTypes";

/** A saved query as the selection reads it. */
interface QueryRow {
    readonly ID: string;
    readonly Name: string;
    readonly CategoryID: string | null;
}

interface CategoryRow {
    readonly ID: string;
    readonly Name: string;
    readonly ParentID: string | null;
}

interface QueryEntityRow {
    readonly QueryID: string;
    readonly EntityID: string;
}

/** The queries a filter selects, the selectors that matched nothing, and the composition edges among them. */
export interface RefreshSelection {
    readonly Queries: readonly OrderableQuery[];
    /** Each ID or name the filter gave that matched no query the caller can read, as given. */
    readonly Unmatched: readonly string[];
    readonly Edges: readonly CompositionEdge[];
}

/**
 * The queries `filter` selects, read as the caller from the database (never a cache), so a
 * caller only ever selects queries it can read. Selectors combine as a union.
 */
export async function SelectQueriesForRefresh(context: QueryRefreshContext, filter: QueryRefreshFilter): Promise<RefreshSelection> {
    const entityIDs = entityIDsOf(context, filter);
    const [queries, categories, links, edges] = await readAll(context, entityIDs.length > 0);
    const paths = categoryPaths(categories);
    const selected = new Map<string, QueryRow>();
    const unmatched: string[] = [];
    const add = (rows: readonly QueryRow[]) => rows.forEach(r => selected.set(NormalizeUUID(r.ID), r));
    if (filter.All) add(queries);
    for (const id of filter.QueryIDs ?? []) collect(queries.filter(q => NormalizeUUID(q.ID) === NormalizeUUID(id)), id, add, unmatched);
    for (const name of filter.QueryNames ?? []) collect(queries.filter(q => nameMatches(q, name, paths)), name, add, unmatched);
    if (filter.CategoryPath) add(queries.filter(q => inCategory(q, filter.CategoryPath ?? '', paths)));
    if (entityIDs.length > 0) {
        const wanted = new Set(entityIDs.map(NormalizeUUID));
        const reading = new Set(links.filter(l => wanted.has(NormalizeUUID(l.EntityID))).map(l => NormalizeUUID(l.QueryID)));
        add(queries.filter(q => reading.has(NormalizeUUID(q.ID))));
    }
    return { Queries: [...selected.values()].map(q => ({ ID: q.ID, Name: q.Name })), Unmatched: unmatched, Edges: edges };
}

function collect(rows: readonly QueryRow[], given: string, add: (rows: readonly QueryRow[]) => void, unmatched: string[]): void {
    if (rows.length === 0) unmatched.push(given);
    else add(rows);
}

/** The entity IDs the filter names, by ID or by name (names the catalog does not hold select nothing). */
function entityIDsOf(context: QueryRefreshContext, filter: QueryRefreshFilter): string[] {
    const ids = [...(filter.EntityIDs ?? [])];
    for (const name of filter.EntityNames ?? []) {
        const entity = context.Provider.Entities.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (entity) ids.push(entity.ID);
    }
    return ids;
}

async function readAll(context: QueryRefreshContext, withLinks: boolean): Promise<[QueryRow[], CategoryRow[], QueryEntityRow[], CompositionEdge[]]> {
    const views: RunViewParams[] = [
        { EntityName: 'MJ: Queries', Fields: ['ID', 'Name', 'CategoryID'], OrderBy: 'Name', ResultType: 'simple', BypassCache: true },
        { EntityName: 'MJ: Query Categories', Fields: ['ID', 'Name', 'ParentID'], ResultType: 'simple', BypassCache: true },
        { EntityName: 'MJ: Query Dependencies', Fields: ['QueryID', 'DependsOnQueryID'], ResultType: 'simple', BypassCache: true },
    ];
    if (withLinks) views.push({ EntityName: 'MJ: Query Entities', Fields: ['QueryID', 'EntityID'], ResultType: 'simple', BypassCache: true });
    const results = await context.Provider.RunViews(views, context.User);
    const failed = results.find(r => !r?.Success);
    if (failed) throw new Error(`the queries to refresh could not be read: ${failed.ErrorMessage}`);
    const rows = <T>(i: number): T[] => (results[i]?.Results ?? []) as T[];
    return [rows<QueryRow>(0), rows<CategoryRow>(1), withLinks ? rows<QueryEntityRow>(3) : [], rows<CompositionEdge>(2)];
}

/** Each category's full path (`Parent/Child`), lower-cased, by normalized ID. */
function categoryPaths(categories: readonly CategoryRow[]): Map<string, string> {
    const byID = new Map(categories.map(c => [NormalizeUUID(c.ID), c]));
    const paths = new Map<string, string>();
    const pathOf = (id: string, depth: number): string => {
        const known = paths.get(id);
        if (known !== undefined) return known;
        const category = byID.get(id);
        if (!category) return '';
        const parent = category.ParentID && depth < 64 ? pathOf(NormalizeUUID(category.ParentID), depth + 1) : '';
        const path = (parent ? `${parent}/${category.Name.trim()}` : category.Name.trim()).toLowerCase();
        paths.set(id, path);
        return path;
    };
    for (const id of byID.keys()) pathOf(id, 0);
    return paths;
}

function normalizePath(path: string): string {
    return path.split('/').map(s => s.trim()).filter(s => s.length > 0).join('/').toLowerCase();
}

function pathOfQuery(query: QueryRow, paths: ReadonlyMap<string, string>): string {
    return query.CategoryID ? paths.get(NormalizeUUID(query.CategoryID)) ?? '' : '';
}

/** A bare name matches every query with that name; a path matches the query at that full path. */
function nameMatches(query: QueryRow, given: string, paths: ReadonlyMap<string, string>): boolean {
    const wanted = normalizePath(given);
    const name = query.Name.trim().toLowerCase();
    if (!given.includes('/')) return name === wanted;
    const category = pathOfQuery(query, paths);
    return (category ? `${category}/${name}` : name) === wanted;
}

function inCategory(query: QueryRow, categoryPath: string, paths: ReadonlyMap<string, string>): boolean {
    const wanted = normalizePath(categoryPath);
    const category = pathOfQuery(query, paths);
    return wanted.length > 0 && (category === wanted || category.startsWith(`${wanted}/`));
}
