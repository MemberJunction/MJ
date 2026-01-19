import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RunView, UserInfo } from "@memberjunction/core";
import { FileStorageProviderEntity } from "@memberjunction/core-entities";
import { FileStorageBase } from "@memberjunction/storage";
import { MJGlobal } from "@memberjunction/global";

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
     * Get storage provider entity by name
     * @param providerName - Name of the storage provider
     * @param contextUser - User context for the operation
     * @returns FileStorageProviderEntity or null if not found
     */
    protected async getStorageProvider(providerName: string, contextUser: UserInfo): Promise<FileStorageProviderEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<FileStorageProviderEntity>({
            EntityName: 'File Storage Providers',
            ExtraFilter: `Name='${providerName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }

        return null;
    }

    /**
     * Initialize storage driver from provider entity
     * @param provider - FileStorageProviderEntity to initialize
     * @returns Initialized FileStorageBase driver
     */
    protected async initializeDriver(provider: FileStorageProviderEntity): Promise<FileStorageBase> {
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            provider.ServerDriverKey
        );

        // Initialize the driver with minimal config using provider configuration
        // For full enterprise model with credentials, use initializeDriverWithAccountCredentials from @memberjunction/storage
        const config = provider.Configuration ? JSON.parse(provider.Configuration) : {};
        await driver.initialize({
            accountId: provider.ID, // Use provider ID as accountId for non-enterprise usage
            accountName: provider.Name,
            ...config
        });

        return driver;
    }

    /**
     * Get storage provider and initialize driver in one step
     * @param params - Action parameters containing StorageProvider
     * @returns Initialized driver and result if error occurred
     */
    protected async getDriverFromParams(params: RunActionParams): Promise<{ driver?: FileStorageBase; error?: ActionResultSimple }> {
        const providerName = this.getStringParam(params, 'storageprovider');

        if (!providerName) {
            return {
                error: this.createErrorResult("StorageProvider parameter is required", "MISSING_PROVIDER")
            };
        }

        const provider = await this.getStorageProvider(providerName, params.ContextUser);
        if (!provider) {
            return {
                error: this.createErrorResult(`Storage provider '${providerName}' not found`, "PROVIDER_NOT_FOUND")
            };
        }

        const driver = await this.initializeDriver(provider);
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
