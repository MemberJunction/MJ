/**
 * @fileoverview Builds the permission-filtered catalog (Applications, readable Entities, Query
 * Categories, and runnable Saved Queries) and per-entity Saved Views list for the Excel task pane.
 *
 * Every check runs strictly against the calling `UserInfo`:
 * - Entities require `IncludeInAPI !== false`, active status, and `GetUserPermisions(user).CanRead`.
 * - Saved Views are queried via `RunView.FromMetadataProvider(provider)` AS `user` (avoiding the
 *   process-wide `UserViewEngine.Instance` singleton's mutable `_contextUserId`) and filtered by
 *   `v.UserCanView`.
 * - Saved Queries require `q.UserCanRun(user)` and expose only non-server-set parameters.
 *
 * @module @memberjunction/excel-addin-server
 */
import {
    ApplicationInfo,
    EntityInfo,
    IMetadataProvider,
    QueryCategoryInfo,
    QueryInfo,
    QueryParameterInfo,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { MJUserViewEntityExtended, ResourcePermissionEngine } from '@memberjunction/core-entities';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
    ExcelAddinCatalogOutput,
    ExcelAddinEntityViewsOutput,
    ExcelCatalogApplication,
    ExcelCatalogEntity,
    ExcelCatalogQuery,
    ExcelCatalogQueryCategory,
    ExcelCatalogQueryParameter,
    ExcelCatalogView,
    ExcelQueryParameterType,
} from '@memberjunction/excel-addin';
import { ExcelSourceError } from './sources';

/** Minimal RunView runner shape so unit tests can supply a stub without global provider wiring. */
export interface ExcelViewRunner {
    RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
}

/**
 * Builds the signed-in user's permission-filtered catalog of applications, entities, query categories,
 * and saved queries.
 */
export function BuildExcelCatalog(provider: IMetadataProvider, user: UserInfo): ExcelAddinCatalogOutput {
    const entities = buildReadableEntities(provider.Entities ?? [], user);
    const canonicalEntityIdByLower = new Map<string, string>(entities.map(e => [e.ID.toLowerCase(), e.ID]));
    const applications = buildApplications(provider.Applications ?? [], canonicalEntityIdByLower);
    const { Categories: queryCategories, Queries: queries } = buildQueriesAndCategories(
        provider.Queries ?? [],
        provider.QueryCategories ?? [],
        user,
    );
    return {
        Applications: applications,
        Entities: entities,
        QueryCategories: queryCategories,
        Queries: queries,
    };
}

/**
 * Loads the saved `MJ: User Views` records `user` is permitted to view on `entityId`.
 */
export async function LoadExcelEntityViews(
    entityId: string,
    provider: IMetadataProvider,
    user: UserInfo,
    runner?: ExcelViewRunner,
): Promise<ExcelAddinEntityViewsOutput> {
    if (!IsValidUUID(entityId)) {
        throw new ExcelSourceError('That entity ID is not valid.');
    }
    if (!IsValidUUID(user.ID)) {
        throw new ExcelSourceError('The current user context is not valid.');
    }
    const entity = (provider.Entities ?? []).find(e => UUIDsEqual(e.ID, entityId));
    if (!entity || entity.IncludeInAPI === false || entity.Status === 'Disabled' || !entity.GetUserPermisions(user).CanRead) {
        throw new ExcelSourceError('That entity doesn\'t exist, or you don\'t have access to read it.');
    }
    if (!runner && !ResourcePermissionEngine.Instance.Loaded) {
        try {
            await ResourcePermissionEngine.Instance.Config(false, user, provider);
        } catch {
            // If ResourcePermissionEngine cannot load in a minimal test environment, safeCanView handles fallback.
        }
    }
    const viewRunner: ExcelViewRunner = runner ?? RunView.FromMetadataProvider(provider);
    const result = await viewRunner.RunView<MJUserViewEntityExtended>(
        {
            EntityName: 'MJ: User Views',
            ExtraFilter: `EntityID='${entity.ID}' AND (UserID='${user.ID}' OR IsShared=1)`,
            OrderBy: 'Name',
            ResultType: 'entity_object',
        },
        user,
    );
    if (!result.Success) {
        throw new ExcelSourceError(result.ErrorMessage || `Saved views for "${entity.DisplayNameOrName}" could not be loaded.`);
    }
    const accessible = (result.Results ?? []).filter(view => safeUserCanView(view, user));
    const mapped: ExcelCatalogView[] = accessible.map(view => {
        const isOwned = UUIDsEqual(view.UserID, user.ID);
        return {
            ID: view.ID,
            Name: view.Name,
            Description: view.Description ?? '',
            IsOwned: isOwned,
            IsShared: Boolean(view.IsShared),
            IsDefault: isOwned && Boolean(view.IsDefault),
        };
    });
    mapped.sort((a, b) => {
        if (a.IsDefault !== b.IsDefault) {
            return a.IsDefault ? -1 : 1;
        }
        if (a.IsOwned !== b.IsOwned) {
            return a.IsOwned ? -1 : 1;
        }
        return a.Name.localeCompare(b.Name);
    });
    return {
        EntityID: entity.ID,
        Views: mapped,
    };
}

function buildReadableEntities(entities: EntityInfo[], user: UserInfo): ExcelCatalogEntity[] {
    return entities
        .filter(
            e =>
                e.IncludeInAPI !== false &&
                e.Status !== 'Disabled' &&
                e.Status !== 'Deprecated' &&
                e.GetUserPermisions(user).CanRead,
        )
        .map(e => ({
            ID: e.ID,
            Name: e.Name,
            DisplayName: e.DisplayNameOrName,
            Description: e.Description ?? '',
        }))
        .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
}

function buildApplications(
    applications: ApplicationInfo[],
    canonicalEntityIdByLower: Map<string, string>,
): ExcelCatalogApplication[] {
    return [...applications]
        .filter(app => !app.Status || app.Status === 'Active')
        .sort((a, b) => {
            const seqDiff = (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100);
            return seqDiff !== 0 ? seqDiff : (a.Name ?? '').localeCompare(b.Name ?? '');
        })
        .map(app => {
            const seen = new Set<string>();
            const entityIds: string[] = [];
            const appEntities = [...(app.ApplicationEntities ?? [])].sort(
                (a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0),
            );
            for (const ae of appEntities) {
                const canonical = ae.EntityID ? canonicalEntityIdByLower.get(ae.EntityID.toLowerCase()) : undefined;
                if (canonical && !seen.has(canonical)) {
                    seen.add(canonical);
                    entityIds.push(canonical);
                }
            }
            return {
                ID: app.ID,
                Name: app.Name,
                Description: app.Description ?? '',
                EntityIDs: entityIds,
            };
        })
        .filter(app => app.EntityIDs.length > 0);
}

function buildQueriesAndCategories(
    allQueries: QueryInfo[],
    allCategories: QueryCategoryInfo[],
    user: UserInfo,
): { Categories: ExcelCatalogQueryCategory[]; Queries: ExcelCatalogQuery[] } {
    const categoryById = new Map<string, QueryCategoryInfo>();
    for (const cat of allCategories) {
        if (cat.ID) {
            categoryById.set(cat.ID.toLowerCase(), cat);
        }
    }
    const computePath = (categoryId: string | null | undefined): string => {
        if (!categoryId) {
            return '';
        }
        const parts: string[] = [];
        const visited = new Set<string>();
        let cursor: string | null | undefined = categoryId;
        while (cursor) {
            const key = cursor.toLowerCase();
            if (visited.has(key)) {
                break;
            }
            visited.add(key);
            const cat = categoryById.get(key);
            if (!cat) {
                break;
            }
            parts.unshift(cat.Name);
            cursor = cat.ParentID;
        }
        return parts.join(' / ');
    };

    const usedCategoryAndAncestors = new Set<string>();
    const markCategoryAncestors = (categoryId: string | null | undefined): void => {
        let cursor: string | null | undefined = categoryId;
        while (cursor) {
            const key = cursor.toLowerCase();
            if (usedCategoryAndAncestors.has(key)) {
                break;
            }
            const cat = categoryById.get(key);
            if (!cat) {
                break;
            }
            usedCategoryAndAncestors.add(key);
            cursor = cat.ParentID;
        }
    };

    const queries: ExcelCatalogQuery[] = allQueries
        .filter(q => q.Status !== 'Rejected' && q.Status !== 'Expired' && q.UserCanRun(user))
        .map(q => {
            markCategoryAncestors(q.CategoryID);
            const categoryPath = computePath(q.CategoryID);
            const callerParams = (q.Parameters ?? [])
                .filter(p => !p.IsServerSet)
                .map(mapQueryParameter);
            return {
                ID: q.ID,
                Name: q.Name,
                Description: q.Description ?? '',
                CategoryID: q.CategoryID ?? null,
                CategoryPath: categoryPath,
                Parameters: callerParams,
            };
        })
        .sort((a, b) => {
            const pathCmp = a.CategoryPath.localeCompare(b.CategoryPath);
            return pathCmp !== 0 ? pathCmp : a.Name.localeCompare(b.Name);
        });

    const categories: ExcelCatalogQueryCategory[] = allCategories
        .filter(c => c.ID && usedCategoryAndAncestors.has(c.ID.toLowerCase()))
        .map(c => ({
            ID: c.ID,
            Name: c.Name,
            ParentID: c.ParentID ?? null,
            Path: computePath(c.ID),
        }))
        .sort((a, b) => a.Path.localeCompare(b.Path));

    return { Categories: categories, Queries: queries };
}

function mapQueryParameter(param: QueryParameterInfo): ExcelCatalogQueryParameter {
    return {
        Name: param.Name,
        Type: normalizeParameterType(param.Type),
        IsRequired: Boolean(param.IsRequired),
        DefaultValue: param.DefaultValue ?? null,
        Description: param.Description ?? '',
        SampleValue: param.SampleValue ?? '',
    };
}

function normalizeParameterType(rawType: QueryParameterInfo['Type']): ExcelQueryParameterType {
    switch (rawType) {
        case 'number':
        case 'date':
        case 'boolean':
        case 'array':
            return rawType;
        default:
            return 'string';
    }
}

function safeUserCanView(view: MJUserViewEntityExtended, user: UserInfo): boolean {
    if (UUIDsEqual(view.UserID, user.ID)) {
        return true;
    }
    try {
        return Boolean(view.UserCanView);
    } catch {
        return false;
    }
}
