import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { UserInfo } from "@memberjunction/core";
import { MJFileStorageAccountEntity, MJFileStorageProviderEntity } from "@memberjunction/core-entities";
import { FileStorageBase, FileStorageEngine } from "@memberjunction/storage";

/**
 * Abstract base class for file storage operations.
 * Provides shared functionality for all file storage action implementations:
 * - Storage provider lookup and initialization
 * - Parameter extraction helpers
 * - Result creation utilities
 * - Error handling patterns
 */
export abstract class BaseFileStorageAction extends BaseAction {

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
     * Get storage account and initialize driver in one step using enterprise model
     * @param params - Action parameters containing StorageAccount
     * @returns Initialized driver and result if error occurred
     */
    protected async getDriverFromParams(params: RunActionParams): Promise<{ driver?: FileStorageBase; error?: ActionResultSimple }> {
        const accountName = this.getStringParam(params, 'storageaccount');

        if (!accountName) {
            return {
                error: this.createErrorResult("StorageAccount parameter is required", "MISSING_ACCOUNT")
            };
        }

        const account = this.getStorageAccount(accountName);
        if (!account) {
            return {
                error: this.createErrorResult(`Storage account '${accountName}' not found`, "ACCOUNT_NOT_FOUND")
            };
        }

        const provider = this.getStorageProviderById(account.ProviderID);
        if (!provider) {
            return {
                error: this.createErrorResult(`Storage provider not found for account '${accountName}'`, "PROVIDER_NOT_FOUND")
            };
        }

        const driver = await this.initializeDriver(account, params.ContextUser);
        return { driver };
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
