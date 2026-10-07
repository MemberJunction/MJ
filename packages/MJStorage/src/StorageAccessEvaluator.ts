/**
 * @fileoverview The one place MJ decides who may use a file storage account, and which tracked files in it a user may
 * read.
 *
 * `MJ: File Storage Account Permissions` rows grant `CanRead` and/or `CanWrite` on a storage account to Everyone, to a
 * Role, or to a single User. Every consumer of that model asks {@link StorageAccessEvaluator}: the storage GraphQL routes
 * (MJServer `FileResolver`), the search lane (`StorageSearchProvider`) and the search engine's late permission filter.
 *
 * **Evaluated per call.** Nothing is snapshotted: each question reads the permission rows for exactly the accounts it
 * names, so a grant or a revocation is seen by the next call, and the answer for one user never depends on which user
 * happened to ask first.
 *
 * **Read with an elevated identity, decided for the caller.** The permission rows are read as the MJ system user
 * (resolved through `WellKnownUserSource`, the same way server-side `BaseEngine`s load). Reading them as the caller
 * would turn "this user may not read the permission rows" into "this account has no rows", which the zero-rows rule
 * below treats as open. When no elevated identity can be resolved, or any read fails, the answer is "no access"
 * (fail closed).
 *
 * @module @memberjunction/storage
 */
import { IMetadataProvider, LogError, Metadata, RunView, RunViewResult, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, IsValidUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJFileEntity, MJFileStorageAccountEntity, MJFileStorageAccountPermissionEntity } from '@memberjunction/core-entities';

/** What a caller wants to do with a storage account: list/download/search (`Read`) or upload/delete/move/copy into it (`Write`). */
export type StorageAccountAccess = 'Read' | 'Write';

/** The fields of an `MJ: File Storage Account Permissions` row the access decision reads. */
export type StorageAccountPermissionRow = Pick<
    MJFileStorageAccountPermissionEntity,
    'FileStorageAccountID' | 'Type' | 'UserID' | 'RoleID' | 'CanRead' | 'CanWrite'
>;

/** The permission state of a set of accounts, as read by {@link StorageAccessEvaluator.LoadAccountPermissionState}. */
export interface StorageAccountPermissionState {
    /** Normalized ({@link NormalizeUUID}) IDs of the requested accounts that exist. */
    ExistingAccountIDs: Set<string>;
    /** Every permission row for the requested accounts. */
    Rows: StorageAccountPermissionRow[];
}

/**
 * The refusal for a storage account the caller may not use. Deliberately the same for an account that does not exist, so a
 * refusal never reveals whether an account ID is real.
 */
export const STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE = 'You do not have access to this storage account or it does not exist.';

/** The refusal for an object backed by an `MJ: Files` row the caller may not read — the wording `GetFileContents` uses. */
export const TRACKED_FILE_ACCESS_DENIED_MESSAGE = 'You do not have access to this file or it does not exist.';

/** Thrown by {@link StorageAccessEvaluator.AssertAccountAccess} when the caller may not use a storage account. */
export class StorageAccountAccessDeniedError extends Error {
    public constructor(message: string = STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE) {
        super(message);
        this.name = 'StorageAccountAccessDeniedError';
    }
}

/** The account ID column read back from `MJ: File Storage Accounts`. */
type AccountIDRow = Pick<MJFileStorageAccountEntity, 'ID'>;

/** The `MJ: Files` columns needed to work out which object key a row backs. */
type TrackedFileRow = Pick<MJFileEntity, 'ID' | 'Name' | 'ProviderKey'>;

/**
 * Decides storage-account access (`Read` / `Write`) and tracked-file read access for a user, per call. See the module
 * documentation for the evaluation model.
 *
 * ```typescript
 * const evaluator = StorageAccessEvaluator.Instance;
 * await evaluator.AssertAccountAccess(accountId, contextUser, 'Write', provider);   // throws when refused
 * const readable = await evaluator.AccessibleAccountIDs(ids, contextUser, 'Read', provider);
 * if (readable.has(NormalizeUUID(id))) { ... }
 * ```
 */
export class StorageAccessEvaluator extends BaseSingleton<StorageAccessEvaluator> {
    /**
     * **The current product rule: a storage account with NO `MJ: File Storage Account Permissions` rows is open to every
     * authenticated user, for both Read and Write.** The admin UI documents it ("If no roles are selected, all authorized
     * users have access"), and every account created before account permissions existed relies on it. Entity-level
     * permissions on `MJ: Files` still apply on top.
     *
     * This is the ONLY place the rule lives. Flipping it to "no rows means closed" is a product decision that needs a data
     * migration writing an explicit `Everyone` row (CanRead, and CanWrite where wanted) for every existing account without
     * rows — otherwise every such account goes dark at deploy time.
     */
    private static readonly ACCOUNT_WITHOUT_PERMISSION_ROWS_IS_OPEN = true;

    /** Returns the global singleton instance. */
    public static get Instance(): StorageAccessEvaluator {
        return super.getInstance<StorageAccessEvaluator>();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Account access
    // ─────────────────────────────────────────────────────────────────────

    /**
     * The subset of `accountIDs` that `user` may use for `access`, as normalized ({@link NormalizeUUID}) IDs — compare with
     * `NormalizeUUID(id)`. An ID that is not a UUID, names no account, or names an account the user may not use is left
     * out; so is everything when the user cannot be evaluated or the permission read fails (fail closed).
     *
     * @param accountIDs - `MJ: File Storage Accounts` IDs to ask about (duplicates and casing are ignored)
     * @param user - The user the decision is for
     * @param access - `Read` checks `CanRead`; `Write` checks `CanWrite`
     * @param provider - The metadata provider to read through; defaults to `Metadata.Provider`
     */
    public async AccessibleAccountIDs(
        accountIDs: string[],
        user: UserInfo,
        access: StorageAccountAccess,
        provider?: IMetadataProvider
    ): Promise<Set<string>> {
        const allowed = new Set<string>();
        const requested = this.distinctValidAccountIDs(accountIDs);
        if (requested.length === 0 || !this.canEvaluate(user)) {
            return allowed;
        }
        const state = await this.loadStateSafely(requested, provider);
        if (!state) {
            return allowed; // fail closed — the failure is already logged
        }
        const rowsByAccount = this.groupRowsByAccount(state.Rows);
        for (const id of requested) {
            if (state.ExistingAccountIDs.has(id) && this.GrantsAccess(rowsByAccount.get(id) ?? [], user, access)) {
                allowed.add(id);
            }
        }
        return allowed;
    }

    /** Whether `user` may use storage account `accountID` for `access`. See {@link AccessibleAccountIDs}. */
    public async UserCanAccessAccount(
        accountID: string,
        user: UserInfo,
        access: StorageAccountAccess,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        const allowed = await this.AccessibleAccountIDs([accountID], user, access, provider);
        return allowed.has(NormalizeUUID(accountID));
    }

    /**
     * Throws {@link StorageAccountAccessDeniedError} unless `user` may use storage account `accountID` for `access`. The
     * error carries {@link STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE} whether the account is restricted or does not exist.
     */
    public async AssertAccountAccess(
        accountID: string,
        user: UserInfo,
        access: StorageAccountAccess,
        provider?: IMetadataProvider
    ): Promise<void> {
        if (!(await this.UserCanAccessAccount(accountID, user, access, provider))) {
            throw new StorageAccountAccessDeniedError();
        }
    }

    /**
     * The decision for ONE account, given all of its permission rows: open when it has none (the current product rule —
     * see {@link ACCOUNT_WITHOUT_PERMISSION_ROWS_IS_OPEN}), otherwise granted when any row both allows `access`
     * (`CanRead` / `CanWrite`) and applies to `user` (an `Everyone` row, a `Role` row for one of `user.UserRoles`, or a
     * `User` row naming `user.ID`). A user that cannot be evaluated (no ID, or no `UserRoles` array) is refused.
     */
    public GrantsAccess(rows: StorageAccountPermissionRow[], user: UserInfo, access: StorageAccountAccess): boolean {
        if (!this.canEvaluate(user)) {
            return false;
        }
        if (rows.length === 0) {
            return StorageAccessEvaluator.ACCOUNT_WITHOUT_PERMISSION_ROWS_IS_OPEN;
        }
        const roleIDs = new Set(user.UserRoles.map(r => NormalizeUUID(r.RoleID)));
        return rows.some(row => this.rowGrants(row, user, roleIDs, access));
    }

    /**
     * Reads, with the elevated reader, which of `accountIDs` exist and every permission row they have. Returns `null` when
     * the question could not be asked (no elevated reader, or a failed read) — callers fail closed.
     * Protected so a host with its own permission store can supply the state; `accountIDs` arrive validated and normalized.
     */
    protected async LoadAccountPermissionState(
        accountIDs: string[],
        provider?: IMetadataProvider
    ): Promise<StorageAccountPermissionState | null> {
        const md = provider ?? Metadata.Provider;
        const reader = await this.ResolveElevatedReader(md);
        if (!reader) {
            LogError('StorageAccessEvaluator: no elevated reader (MJ system user) could be resolved — storage access denied');
            return null;
        }
        const inList = accountIDs.map(id => `'${EscapeSQLString(id)}'`).join(', ');
        const [accounts, permissions] = await RunView.FromMetadataProvider(md).RunViews<AccountIDRow | StorageAccountPermissionRow>([
            { EntityName: 'MJ: File Storage Accounts', ExtraFilter: `ID IN (${inList})`, Fields: ['ID'], ResultType: 'simple' },
            {
                EntityName: 'MJ: File Storage Account Permissions',
                ExtraFilter: `FileStorageAccountID IN (${inList})`,
                Fields: ['FileStorageAccountID', 'Type', 'UserID', 'RoleID', 'CanRead', 'CanWrite'],
                ResultType: 'simple'
            }
        ], reader);
        if (!accounts?.Success || !permissions?.Success) {
            LogError(`StorageAccessEvaluator: permission read failed: ${accounts?.ErrorMessage ?? permissions?.ErrorMessage ?? 'no result'}`);
            return null;
        }
        const rows = permissions.Results.filter((r): r is StorageAccountPermissionRow => this.isPermissionRow(r));
        return { ExistingAccountIDs: this.accountIDsOf(accounts), Rows: rows };
    }

    /**
     * The identity the permission rows and the `MJ: Files` mapping are read with: the MJ system user for `provider`'s
     * connection, or `null` when this process has none. Protected so a host can supply a different elevated reader.
     */
    protected async ResolveElevatedReader(provider: IMetadataProvider): Promise<UserInfo | null> {
        try {
            return await WellKnownUserSource.Instance.GetSystemUser(provider);
        } catch (error) {
            LogError(`StorageAccessEvaluator: resolving the elevated reader failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tracked files
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Which of `objectKeys` back an `MJ: Files` row that `user` may not read. An object is tracked when an `MJ: Files` row
     * on the account's storage provider resolves to it the way the server resolves every row to an object — `ProviderKey`,
     * or `Name` when `ProviderKey` is empty. The mapping is read with the elevated reader (so a row the user cannot see
     * still counts as tracked); whether the user may read each row is then asked as the user, through `RunView` (entity
     * permission and row-level security both apply, as they do for `Load`). One batched lookup per call.
     *
     * Untracked keys are never returned — they are governed by the account gate alone. Matching is case-insensitive, and
     * `MJ: Files` rows are keyed by PROVIDER, not account, so a tracked row in another account on the same provider with
     * the same key also counts: the error is always toward refusing. Fails closed — when the mapping cannot be read every
     * key is returned, and when the user-side read fails every tracked key is.
     *
     * @param fileStorageProviderID - The `MJ: File Storage Providers` ID of the account the objects live in
     * @param objectKeys - Object keys as the driver reports them (path and/or provider object ID)
     */
    public async UnreadableTrackedObjectKeys(
        fileStorageProviderID: string,
        objectKeys: string[],
        user: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Set<string>> {
        const keys = Array.from(new Set(objectKeys.filter(k => typeof k === 'string' && k.length > 0)));
        if (keys.length === 0) {
            return new Set<string>();
        }
        try {
            const md = provider ?? Metadata.Provider;
            const tracked = await this.FindTrackedFiles(fileStorageProviderID, keys, md);
            if (!tracked) {
                return new Set(keys);
            }
            return await this.keysBehindUnreadableRows(keys, tracked, user, md);
        } catch (error) {
            LogError(`StorageAccessEvaluator: tracked-file check failed: ${error instanceof Error ? error.message : String(error)}`);
            return new Set(keys);
        }
    }

    /**
     * Reads, with the elevated reader, the `MJ: Files` rows on `fileStorageProviderID` whose object key (`ProviderKey`, else
     * `Name`) is one of `keys`. Returns `null` when the read could not be made. Protected so a host can change the mapping.
     */
    protected async FindTrackedFiles(
        fileStorageProviderID: string,
        keys: string[],
        provider: IMetadataProvider
    ): Promise<TrackedFileRow[] | null> {
        if (!IsValidUUID(fileStorageProviderID)) {
            return null;
        }
        const reader = await this.ResolveElevatedReader(provider);
        if (!reader) {
            LogError('StorageAccessEvaluator: no elevated reader (MJ system user) could be resolved — tracked-file check denied');
            return null;
        }
        const inList = keys.map(k => `'${EscapeSQLString(k)}'`).join(', ');
        const result = await RunView.FromMetadataProvider(provider).RunView<TrackedFileRow>({
            EntityName: 'MJ: Files',
            ExtraFilter: `ProviderID = '${EscapeSQLString(fileStorageProviderID)}' AND ` +
                `(ProviderKey IN (${inList}) OR (ProviderKey IS NULL AND Name IN (${inList})))`,
            Fields: ['ID', 'Name', 'ProviderKey'],
            ResultType: 'simple'
        }, reader);
        if (!result.Success) {
            LogError(`StorageAccessEvaluator: tracked-file lookup failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    /** Whether a single permission row allows `access` and applies to `user`. */
    private rowGrants(row: StorageAccountPermissionRow, user: UserInfo, roleIDs: Set<string>, access: StorageAccountAccess): boolean {
        const allows = access === 'Write' ? row.CanWrite : row.CanRead;
        if (!allows) {
            return false;
        }
        switch (row.Type) {
            case 'Everyone':
                return true;
            case 'User':
                return row.UserID != null && UUIDsEqual(row.UserID, user.ID);
            case 'Role':
                return row.RoleID != null && roleIDs.has(NormalizeUUID(row.RoleID));
            default:
                return false;
        }
    }

    /** A user can be evaluated only with an ID and a hydrated `UserRoles` array; anything less is refused. */
    private canEvaluate(user: UserInfo | null | undefined): user is UserInfo {
        const ok = user != null && typeof user.ID === 'string' && user.ID.length > 0 && Array.isArray(user.UserRoles);
        if (!ok) {
            LogError('StorageAccessEvaluator: the user cannot be evaluated (missing ID or UserRoles) — storage access denied');
        }
        return ok;
    }

    /** Distinct, normalized, UUID-shaped IDs — anything else can name no account and is simply not asked about. */
    private distinctValidAccountIDs(accountIDs: string[]): string[] {
        return Array.from(new Set((accountIDs ?? []).filter(id => IsValidUUID(id)).map(id => NormalizeUUID(id))));
    }

    /** {@link LoadAccountPermissionState}, with a throw turned into `null` (fail closed). */
    private async loadStateSafely(accountIDs: string[], provider?: IMetadataProvider): Promise<StorageAccountPermissionState | null> {
        try {
            return await this.LoadAccountPermissionState(accountIDs, provider);
        } catch (error) {
            LogError(`StorageAccessEvaluator: permission read threw: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /** Permission rows keyed by normalized account ID. */
    private groupRowsByAccount(rows: StorageAccountPermissionRow[]): Map<string, StorageAccountPermissionRow[]> {
        const byAccount = new Map<string, StorageAccountPermissionRow[]>();
        for (const row of rows) {
            const id = NormalizeUUID(row.FileStorageAccountID);
            const list = byAccount.get(id);
            if (list) {
                list.push(row);
            } else {
                byAccount.set(id, [row]);
            }
        }
        return byAccount;
    }

    /** The normalized account IDs in an accounts result. */
    private accountIDsOf(result: RunViewResult<AccountIDRow | StorageAccountPermissionRow>): Set<string> {
        const ids = new Set<string>();
        for (const row of result.Results) {
            if ('ID' in row && row.ID) {
                ids.add(NormalizeUUID(row.ID));
            }
        }
        return ids;
    }

    /** Narrows a row from the batched read to a permission row. */
    private isPermissionRow(row: AccountIDRow | StorageAccountPermissionRow): row is StorageAccountPermissionRow {
        return 'FileStorageAccountID' in row;
    }

    /** The keys whose tracked rows include one the user may not read. */
    private async keysBehindUnreadableRows(
        keys: string[],
        tracked: TrackedFileRow[],
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<Set<string>> {
        const unreadable = new Set<string>();
        if (tracked.length === 0) {
            return unreadable;
        }
        const readable = await this.readableFileIDs(tracked.map(f => f.ID), user, provider);
        for (const key of keys) {
            const rows = tracked.filter(f => this.trackedKeyOf(f) === key.toLowerCase());
            if (rows.some(f => !readable || !readable.has(NormalizeUUID(f.ID)))) {
                unreadable.add(key);
            }
        }
        return unreadable;
    }

    /** The object key the server resolves an `MJ: Files` row to (`ProviderKey`, else `Name`), lowercased for matching. */
    private trackedKeyOf(file: TrackedFileRow): string {
        return (file.ProviderKey ?? file.Name ?? '').toLowerCase();
    }

    /** Which of `fileIDs` `user` may read, asked as the user; `null` when the read fails (the caller fails closed). */
    private async readableFileIDs(fileIDs: string[], user: UserInfo, provider: IMetadataProvider): Promise<Set<string> | null> {
        const inList = fileIDs.map(id => `'${EscapeSQLString(id)}'`).join(', ');
        const result = await RunView.FromMetadataProvider(provider).RunView<Pick<MJFileEntity, 'ID'>>({
            EntityName: 'MJ: Files',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID'],
            ResultType: 'simple'
        }, user);
        if (!result.Success) {
            LogError(`StorageAccessEvaluator: reading MJ: Files as the user failed: ${result.ErrorMessage}`);
            return null;
        }
        return new Set(result.Results.map(r => NormalizeUUID(r.ID)));
    }
}
