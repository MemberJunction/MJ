import {
    CompositeKey,
    EntityInfo,
    GetDataHooks,
    IMetadataProvider,
    LogError,
    Metadata,
    ParseStoredRecordKey,
    PostRunViewHook,
    ReadableRecordKeyTexts,
    RecordKeyText,
    RecordChangesEntityName,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    UserReadsEveryRecord,
    WellKnownUserSource
} from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, UUIDMap } from '@memberjunction/global';
import { EntityNamesMatch, ResolveTargetEntityNameAsync } from './ArtifactSecurityHookHelpers';

const INTERNAL_PARAMS = new WeakSet<object>();

/** The columns of a Record Change row that decide whether a caller may see it. */
interface RecordChangeLocator {
    ID?: string;
    EntityID?: string | null;
    RecordID?: string | null;
}

/** One row of the result, with the key of the record it describes when that key could be read. */
interface LocatedRow {
    Index: number;
    EntityID: string | null;
    Key: CompositeKey | null;
}

function readString(row: unknown, field: string): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const value = (row as Record<string, unknown>)[field];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveProvider(contextUser: UserInfo): IMetadataProvider | null {
    return contextUser.OwningProvider ?? Metadata.Provider ?? null; // global-provider-ok: fallback when UserInfo has no OwningProvider
}

/**
 * Loads EntityID and RecordID for rows that came back without them (a narrow `Fields` list),
 * read as the system user and keyed by Record Change ID.
 */
async function fetchLocators(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    ids: string[]
): Promise<UUIDMap<RecordChangeLocator>> {
    const map = new UUIDMap<RecordChangeLocator>();
    const valid = ids.filter((id) => IsValidUUID(id));
    if (valid.length === 0) {
        return map;
    }
    const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
    const params: RunViewParams = {
        EntityName: RecordChangesEntityName,
        ExtraFilter: `ID IN (${valid.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`, // pk-filter-ok: MJ: Record Changes is a core entity keyed by ID
        Fields: ['ID', 'EntityID', 'RecordID'],
        ResultType: 'simple'
    };
    INTERNAL_PARAMS.add(params);
    const res = await RunView.FromMetadataProvider(provider).RunView<RecordChangeLocator>(params, systemUser);
    for (const row of res?.Success ? res.Results : []) {
        if (row.ID) {
            map.Set(row.ID, row);
        }
    }
    return map;
}

async function locateRows(provider: IMetadataProvider, contextUser: UserInfo, rows: unknown[]): Promise<LocatedRow[]> {
    const missing = rows
        .filter((row) => !readString(row, 'EntityID') || !readString(row, 'RecordID'))
        .map((row) => readString(row, 'ID'))
        .filter((id): id is string => id !== null);
    const fetched = missing.length > 0 ? await fetchLocators(provider, contextUser, missing) : new UUIDMap<RecordChangeLocator>();

    return rows.map((row, index) => {
        const id = readString(row, 'ID');
        const hydrated = id ? fetched.Get(id) : undefined;
        const entityID = readString(row, 'EntityID') ?? hydrated?.EntityID ?? null;
        const recordID = readString(row, 'RecordID') ?? hydrated?.RecordID ?? null;
        const entity = entityID ? provider.EntityByID(entityID) : undefined;
        return { Index: index, EntityID: entityID, Key: ParseStoredRecordKey(entity, recordID) };
    });
}

/** Decides, for the rows about one entity, which row indexes the caller may see. */
async function allowedIndexesForEntity(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    entity: EntityInfo | undefined,
    group: LocatedRow[]
): Promise<number[]> {
    if (!entity || !entity.GetUserPermisions(contextUser).CanRead) {
        return [];
    }
    if (UserReadsEveryRecord(entity, contextUser)) {
        return group.map((r) => r.Index);
    }
    const keyed = group.filter((r) => r.Key !== null);
    const readable = await ReadableRecordKeyTexts(
        provider, contextUser, entity, keyed.map((r) => r.Key as CompositeKey), (p) => INTERNAL_PARAMS.add(p)
    );
    if (!readable) {
        return [];
    }
    return keyed.filter((r) => readable.has(RecordKeyText(entity, r.Key as CompositeKey))).map((r) => r.Index);
}

async function filterRecordChangeRows(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    results: RunViewResult
): Promise<RunViewResult> {
    const rows = results.Results as unknown[];
    const located = await locateRows(provider, contextUser, rows);

    const groups = new UUIDMap<LocatedRow[]>();
    for (const row of located) {
        if (row.EntityID && IsValidUUID(row.EntityID)) {
            groups.Set(row.EntityID, [...(groups.Get(row.EntityID) ?? []), row]);
        }
    }

    const allowed = new Set<number>();
    for (const [entityID, group] of groups) {
        const indexes = await allowedIndexesForEntity(provider, contextUser, provider.EntityByID(entityID), group);
        indexes.forEach((i) => allowed.add(i));
    }
    if (allowed.size === rows.length) {
        return results;
    }

    const filtered = rows.filter((_row, index) => allowed.has(index));
    const removed = rows.length - filtered.length;
    return {
        ...results,
        Results: filtered,
        RowCount: filtered.length,
        TotalRowCount: Math.max(filtered.length, (results.TotalRowCount ?? results.RowCount ?? rows.length) - removed)
    };
}

/**
 * Server-side `PostRunView` hook for `MJ: Record Changes`. A caller who is not the system user
 * sees a change row only when the caller can read the entity the row describes. When that entity
 * has a row filter for the caller, or is itself guarded by read hooks, the caller must also be
 * able to read the record the row describes. Rows that cannot be checked are removed.
 *
 * Never mutates `results.Results` in place.
 */
export const RecordChangePostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined
): Promise<RunViewResult> => {
    if (!results?.Success || !Array.isArray(results.Results) || results.Results.length === 0 || INTERNAL_PARAMS.has(params)) {
        return results;
    }
    const provider = contextUser ? resolveProvider(contextUser) : null;
    if (!contextUser || !provider || provider.ProviderType !== 'Database' || WellKnownUserSource.Instance.IsSystemUser(contextUser)) {
        return results;
    }
    try {
        const entityName = await ResolveTargetEntityNameAsync(params, provider, contextUser);
        if (!EntityNamesMatch(entityName, RecordChangesEntityName, provider)) {
            return results;
        }
        return await filterRecordChangeRows(provider, contextUser, results);
    } catch (error) {
        LogError(`RecordChangePostRunViewHook failed: ${error instanceof Error ? error.message : String(error)}`);
        return { ...results, Results: [], RowCount: 0, TotalRowCount: 0 };
    }
};

/**
 * Registers {@link RecordChangePostRunViewHook} and marks `MJ: Record Changes` as protected by
 * it, so raw SQL and aggregate reads of the entity are refused. Safe to call more than once.
 */
export function EnsureRecordChangeReadHookRegistered(): void {
    if (!GetDataHooks<PostRunViewHook>('PostRunView').includes(RecordChangePostRunViewHook)) {
        RegisterDataHook('PostRunView', RecordChangePostRunViewHook);
    }
    RegisterPostRunViewProtectedEntity(RecordChangesEntityName);
}

EnsureRecordChangeReadHookRegistered();
