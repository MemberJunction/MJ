import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { UserInfo } from "@memberjunction/core";
import { MJFileStorageAccountEntity, MJFileStorageProviderEntity } from "@memberjunction/core-entities";
import {
    FileStorageBase,
    FileStorageEngine,
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE,
    StorageAccessEvaluator,
    StorageAccountAccess,
    TRACKED_FILE_ACCESS_DENIED_MESSAGE
} from "@memberjunction/storage";

/**
 * The result code every File Storage action returns when the storage gate refuses the call — an account the caller may
 * not use (or one that does not exist: the refusal is identical, so it never reveals whether an account name is real),
 * or an object backing an `MJ: Files` row the caller may not read.
 */
export const STORAGE_ACCESS_DENIED_RESULT_CODE = 'ACCESS_DENIED';

/**
 * Abstract base class for file storage operations.
 * Provides shared functionality for all file storage action implementations:
 * - Storage account lookup, the storage-account gate and driver initialization
 * - The tracked-file rule for objects backing `MJ: Files` rows
 * - Parameter extraction helpers
 * - Result creation utilities
 *
 * **Every account an action touches is gated.** These actions are reachable by any authenticated user (the GraphQL
 * `RunAction` resolver) and by any agent, and they name the account by a caller-supplied name. `getDriverFromParams`
 * therefore asks `StorageAccessEvaluator` whether the caller may use the account for {@link AccountAccess} — `Read` by
 * default, `Write` for an action that uploads, copies, moves, deletes or creates — BEFORE a driver is built. An unknown
 * account gets the same `ACCESS_DENIED` result as a refused one.
 */
export abstract class BaseFileStorageAction extends BaseAction {

    /**
     * What this action does to the account it names, which is what the account gate checks: `Read` (list, download,
     * search, inspect) unless a subclass overrides it with `Write` (upload, copy, move, delete, create a directory).
     */
    protected get AccountAccess(): StorageAccountAccess {
        return 'Read';
    }

    /**
     * Get storage account entity by name using cached metadata.
     * @param accountName - Name of the storage account
     * @returns MJFileStorageAccountEntity or null if not found
     */
    protected getStorageAccount(accountName: string): MJFileStorageAccountEntity | null {
        return FileStorageEngine.Instance.GetAccountByName(accountName) ?? null;
    }

    /**
     * Get storage provider entity by ID using cached metadata.
     * @param providerId - ID of the storage provider
     * @returns MJFileStorageProviderEntity or null if not found
     */
    protected getStorageProviderById(providerId: string): MJFileStorageProviderEntity | null {
        return FileStorageEngine.Instance.GetProviderById(providerId) ?? null;
    }

    /**
     * Initialize storage driver using the enterprise credential model via FileStorageEngine.
     * **No permission check** — call it only for an account the caller has passed the gate for ({@link ResolveAccountTarget}).
     * @param accountEntity - MJFileStorageAccountEntity to initialize
     * @param contextUser - User context for credential access
     * @returns Initialized FileStorageBase driver
     */
    protected async initializeDriver(
        accountEntity: MJFileStorageAccountEntity,
        contextUser: UserInfo
    ): Promise<FileStorageBase> {
        await FileStorageEngine.Instance.Config(false, contextUser);
        return FileStorageEngine.Instance.GetDriver(accountEntity.ID, contextUser);
    }

    /**
     * Resolves the `StorageAccount` parameter to an account and its driver, gated for {@link AccountAccess}.
     * @param params - Action parameters containing StorageAccount
     * @returns The account and driver, or the failed result to return
     */
    protected async getDriverFromParams(
        params: RunActionParams
    ): Promise<{ account?: MJFileStorageAccountEntity; driver?: FileStorageBase; error?: ActionResultSimple }> {
        const accountName = this.getStringParam(params, 'storageaccount');
        if (!accountName) {
            return {
                error: this.createErrorResult("StorageAccount parameter is required", "MISSING_ACCOUNT")
            };
        }
        return this.ResolveAccountTarget(accountName, this.AccountAccess, params.ContextUser);
    }

    /**
     * Resolves a storage account by name and returns it with an initialized driver — only when `contextUser` may use it
     * for `access` (`StorageAccessEvaluator`, evaluated per call). An unknown account name and a refused account return
     * the identical `ACCESS_DENIED` result, and neither builds a driver.
     */
    protected async ResolveAccountTarget(
        accountName: string,
        access: StorageAccountAccess,
        contextUser: UserInfo
    ): Promise<{ account?: MJFileStorageAccountEntity; driver?: FileStorageBase; error?: ActionResultSimple }> {
        const account = await this.findAccountByName(accountName, contextUser);
        if (!account || !(await StorageAccessEvaluator.Instance.UserCanAccessAccount(account.ID, contextUser, access))) {
            return { error: this.AccessDeniedResult(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE) };
        }
        if (!this.getStorageProviderById(account.ProviderID)) {
            return {
                error: this.createErrorResult(`Storage provider not found for account '${accountName}'`, "PROVIDER_NOT_FOUND")
            };
        }
        const driver = await this.initializeDriver(account, contextUser);
        return { account, driver };
    }

    /**
     * The tracked-file rule: `null` when the caller may read every `MJ: Files` row that tracks any of `objectKeys` in
     * `account` (canonicalized by `driver`), else the `ACCESS_DENIED` result to return. Apply it to every object an action
     * returns content or a URL for, and to every object it overwrites, moves or deletes. Empty keys are ignored.
     */
    protected async CheckObjectsReadable(
        account: MJFileStorageAccountEntity,
        driver: FileStorageBase,
        objectKeys: Array<string | undefined>,
        contextUser: UserInfo
    ): Promise<ActionResultSimple | null> {
        const unreadable = await this.UnreadableObjectKeys(account, driver, objectKeys, contextUser);
        return unreadable.size > 0 ? this.AccessDeniedResult(TRACKED_FILE_ACCESS_DENIED_MESSAGE) : null;
    }

    /**
     * The subset of `objectKeys` that back an `MJ: Files` row the caller may not read — what a listing or a search drops
     * so it never names a tracked object the caller is refused.
     */
    protected async UnreadableObjectKeys(
        account: MJFileStorageAccountEntity,
        driver: FileStorageBase,
        objectKeys: Array<string | undefined>,
        contextUser: UserInfo
    ): Promise<Set<string>> {
        const keys = objectKeys.filter((k): k is string => typeof k === 'string' && k.length > 0);
        if (keys.length === 0) {
            return new Set<string>();
        }
        return StorageAccessEvaluator.Instance.UnreadableTrackedObjectKeys(account.ProviderID, keys, contextUser, undefined, driver);
    }

    /** The failed result for a refusal by the storage gate. */
    protected AccessDeniedResult(message: string): ActionResultSimple {
        return this.createErrorResult(message, STORAGE_ACCESS_DENIED_RESULT_CODE);
    }

    /**
     * The account named `accountName`, from the engine's cache (configured first). A miss is NOT refreshed: the name is
     * caller-supplied and looked up before the gate, so a refresh on a miss would let any caller force a full engine and
     * driver-cache reload with a made-up name. The engine's own entity-event refresh picks up new accounts.
     */
    private async findAccountByName(accountName: string, contextUser: UserInfo): Promise<MJFileStorageAccountEntity | null> {
        await FileStorageEngine.Instance.Config(false, contextUser);
        return this.getStorageAccount(accountName);
    }

    /**
     * Helper to add output parameter
     */
    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }

    /**
     * Helper to create success result
     */
    protected createSuccessResult(data: Record<string, unknown>, params?: RunActionParams): ActionResultSimple {
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(data, null, 2),
            Params: params?.Params
        };
    }

    /**
     * Helper to create error result
     */
    protected createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }

    /**
     * Extract parameter value by name (case-insensitive)
     */
    protected getParamValue(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        return param?.Value as string | undefined;
    }

    /**
     * Get string parameter value (guaranteed to be string or undefined)
     */
    protected getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return undefined;
        return String(value);
    }

    /**
     * Get string parameter value with default
     */
    protected getStringParamWithDefault(params: RunActionParams, paramName: string, defaultValue: string): string {
        return this.getStringParam(params, paramName) ?? defaultValue;
    }

    /**
     * Get boolean parameter value with default
     */
    protected getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean = false): boolean {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return defaultValue;
        return String(value).toLowerCase() === 'true';
    }

    /**
     * Get numeric parameter value with default
     */
    protected getNumericParam(params: RunActionParams, paramName: string, defaultValue: number = 0): number {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }
}
