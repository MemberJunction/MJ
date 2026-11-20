import { CompositeKey } from './compositeKey';
import { EntityInfo, EntityPermissionType } from './entityInfo';
import { IMetadataProvider, RunViewResult } from './interfaces';
import { UserInfo } from './securityInfo';
import { GetDataHooks, IsPostRunViewProtectedEntity, PostRunViewHook } from './dataHooks';
import { RunView, RunViewParams } from '../views/runView';

/** Largest number of record keys put into one read of the target entity. */
const KEYS_PER_READ = 200;

/**
 * Parses a stored polymorphic `RecordID` (the prefixed `Field|Value` form or a bare value for a
 * single-column key) against the entity's primary keys. Returns the key with the entity's own
 * primary key names, or null when the value does not fit the entity.
 */
export function ParseStoredRecordKey(entity: EntityInfo | null | undefined, recordID: string | null | undefined): CompositeKey | null {
    if (!entity || !recordID || entity.PrimaryKeys.length === 0) {
        return null;
    }
    try {
        const parsed = CompositeKey.FromRecordID(entity, recordID);
        return CompositeKey.FromKeyValuePairs(
            entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: parsed.GetValueByFieldName(pk.Name) }))
        );
    } catch {
        return null;
    }
}

/** Normalized text of a key in primary-key order, for comparing keys that came from different sources. */
export function RecordKeyText(entity: EntityInfo, key: CompositeKey): string {
    return entity.PrimaryKeys
        .map((pk) => String(key.GetValueByFieldName(pk.Name) ?? '').trim().toLowerCase())
        .join('|');
}

/**
 * True when `user` reads every row of `entity`: the user can read the entity, no row filter
 * (role or API key) applies to the user's reads, and the entity's reads are not guarded by
 * server read hooks.
 */
export function UserReadsEveryRecord(entity: EntityInfo, user: UserInfo): boolean {
    return entity.GetUserPermisions(user).CanRead
        && entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').length === 0
        && !IsPostRunViewProtectedEntity(entity.Name);
}

/**
 * Returns the {@link RecordKeyText} of each key in `keys` that `user` can read, by an ordinary read
 * of `entity` as `user`, so entity permissions, row filters and read hooks all apply. Returns null
 * when a read fails. An entity the user cannot read at all gives an empty set without a query.
 *
 * @param onParams called with each read's params before it runs, so a caller can mark them as its own
 */
export async function ReadableRecordKeyTexts(
    provider: IMetadataProvider,
    user: UserInfo,
    entity: EntityInfo,
    keys: CompositeKey[],
    onParams?: (params: RunViewParams) => void
): Promise<Set<string> | null> {
    const readable = new Set<string>();
    if (!entity.GetUserPermisions(user).CanRead || keys.length === 0) {
        return readable;
    }
    const rv = RunView.FromMetadataProvider(provider);
    for (let i = 0; i < keys.length; i += KEYS_PER_READ) {
        const params: RunViewParams = {
            EntityName: entity.Name,
            ExtraFilter: keys.slice(i, i + KEYS_PER_READ).map((k) => `(${k.ToWhereClause()})`).join(' OR '),
            Fields: entity.PrimaryKeys.map((pk) => pk.Name),
            ResultType: 'simple',
            IgnoreMaxRows: true
        };
        onParams?.(params);
        const res = await rv.RunView<Record<string, unknown>>(params, user);
        if (!res?.Success) {
            return null;
        }
        for (const row of res.Results) {
            readable.add(RecordKeyText(entity, CompositeKey.FromEntityRecord(entity, row)));
        }
    }
    return readable;
}

/**
 * True when one record read by key passes the server read hooks of its entity, the same hooks a
 * view read of that entity runs. An entity that is not guarded by read hooks always passes. A hook
 * that fails counts as removing the record.
 *
 * @param row the record as the database returned it, keyed by field name
 */
export async function RecordPassesReadHooks(
    entityName: string,
    row: Record<string, unknown>,
    user: UserInfo | undefined,
    provider?: IMetadataProvider
): Promise<boolean> {
    if (!IsPostRunViewProtectedEntity(entityName)) {
        return true;
    }
    const params: RunViewParams = { EntityName: entityName, ResultType: 'simple' };
    let result: RunViewResult = {
        Success: true, Results: [row], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: ''
    };
    try {
        for (const hook of GetDataHooks<PostRunViewHook>('PostRunView')) {
            result = await hook(params, result, user, provider);
        }
    } catch {
        return false;
    }
    return Boolean(result?.Success) && Array.isArray(result.Results) && result.Results.length === 1;
}
