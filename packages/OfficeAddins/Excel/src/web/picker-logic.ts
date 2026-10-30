/**
 * Pure filtering and parameter-parsing helpers for the Excel add-in's data browser.
 * Kept DOM-free so they can be unit-tested directly.
 */
import type {
    ExcelAddinCatalogOutput,
    ExcelCatalogEntity,
    ExcelCatalogQuery,
    ExcelCatalogQueryCategory,
    ExcelCatalogQueryParameter,
} from '../catalog-types';
import type { ExcelParameterValue, ExcelSourceKind } from '../contract';

/**
 * Case-insensitive trimmed ID comparison for the dependency-free web bundle
 * (matches `UUIDsEqual` semantics across SQL Server uppercase and PostgreSQL lowercase UUIDs).
 */
export function IdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    if (a == null || b == null) {
        return false;
    }
    const left = a.trim().toLowerCase();
    const right = b.trim().toLowerCase();
    return left.length > 0 && left === right;
}

/** Filters readable entities by selected application (`''` = all applications) and search query. */
export function FilterCatalogEntities(
    catalog: ExcelAddinCatalogOutput,
    applicationId: string,
    searchText: string,
): ExcelCatalogEntity[] {
    let list = catalog.Entities;
    if (applicationId) {
        const app = catalog.Applications.find(a => a.ID.toLowerCase() === applicationId.toLowerCase());
        if (!app) {
            return [];
        }
        const allowed = new Set(app.EntityIDs.map(id => id.toLowerCase()));
        list = list.filter(e => allowed.has(e.ID.toLowerCase()));
    }
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
        return list;
    }
    return list.filter(e =>
        e.DisplayName.toLowerCase().includes(needle) ||
        e.Name.toLowerCase().includes(needle) ||
        e.Description.toLowerCase().includes(needle),
    );
}

/** Filters runnable queries by category folder (including sub-categories; `''` = all) and search query. */
export function FilterCatalogQueries(
    catalog: ExcelAddinCatalogOutput,
    categoryId: string,
    searchText: string,
): ExcelCatalogQuery[] {
    let list = catalog.Queries;
    if (categoryId) {
        const allowedCategories = collectDescendantCategoryIds(catalog.QueryCategories, categoryId);
        list = list.filter(q => q.CategoryID !== null && allowedCategories.has(q.CategoryID.toLowerCase()));
    }
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
        return list;
    }
    return list.filter(q =>
        q.Name.toLowerCase().includes(needle) ||
        q.CategoryPath.toLowerCase().includes(needle) ||
        q.Description.toLowerCase().includes(needle),
    );
}

/**
 * Validates and converts user-entered query form strings into typed `ExcelParameterValue` values.
 * Throws a user-facing `Error` when a required value is missing or a typed value cannot be parsed.
 */
export function ParseQueryFormParameters(
    parameters: readonly ExcelCatalogQueryParameter[],
    rawValues: Readonly<Record<string, string>>,
): Record<string, ExcelParameterValue> | undefined {
    const parsed: Record<string, ExcelParameterValue> = {};
    for (const param of parameters) {
        const raw = (rawValues[param.Name] ?? '').trim();
        if (raw.length === 0) {
            if (param.IsRequired && (param.DefaultValue === null || param.DefaultValue.trim().length === 0)) {
                throw new Error(`Enter a value for required parameter "${param.Name}".`);
            }
            continue;
        }
        parsed[param.Name] = coerceParameterValue(param, raw);
    }
    return Object.keys(parsed).length > 0 ? parsed : undefined;
}

/** Human-readable badge label for a workbook source's kind. */
export function DescribeSourceKind(kind: ExcelSourceKind): string {
    switch (kind) {
        case 'View':
            return 'Saved view';
        case 'Entity':
            return 'Entity';
        case 'Query':
            return 'Saved query';
    }
}

function coerceParameterValue(param: ExcelCatalogQueryParameter, raw: string): ExcelParameterValue {
    switch (param.Type) {
        case 'number': {
            const num = Number(raw);
            if (!Number.isFinite(num)) {
                throw new Error(`Parameter "${param.Name}" must be a valid number.`);
            }
            return num;
        }
        case 'boolean': {
            const lower = raw.toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') {
                return true;
            }
            if (lower === 'false' || lower === '0' || lower === 'no') {
                return false;
            }
            throw new Error(`Parameter "${param.Name}" must be True or False.`);
        }
        case 'array':
            return raw.split(',').map(part => part.trim()).filter(part => part.length > 0);
        case 'date':
        case 'string':
            return raw;
    }
}

function collectDescendantCategoryIds(categories: readonly ExcelCatalogQueryCategory[], rootId: string): Set<string> {
    const collected = new Set<string>([rootId.toLowerCase()]);
    let added = true;
    while (added) {
        added = false;
        for (const cat of categories) {
            const id = cat.ID.toLowerCase();
            const parent = cat.ParentID?.toLowerCase() ?? null;
            if (parent && collected.has(parent) && !collected.has(id)) {
                collected.add(id);
                added = true;
            }
        }
    }
    return collected;
}
