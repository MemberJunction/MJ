import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJFileStorageAccountEntity, MJFileStorageProviderEntity } from "../generated/entity_subclasses";

/**
 * Represents a storage account with its associated provider details
 */
export interface StorageAccountWithProvider {
    account: MJFileStorageAccountEntity;
    provider: MJFileStorageProviderEntity;
}

/**
 * FileStorageEngineBase provides centralized, cached access to file storage accounts and providers.
 * This engine eliminates redundant database calls by caching the data and making it available
 * across the application. It is safe to use on both client and server — it only deals with
 * cached metadata, not file I/O.
 *
 * For server-side file operations (upload, download, driver initialization), use the
 * `FileStorageEngine` class from `@memberjunction/storage` which wraps this base via containment.
 *
 * Usage:
 * ```typescript
 * const engine = FileStorageEngineBase.Instance;
 * await engine.Config(false);  // Use cached data if available
 * const accounts = engine.AccountsWithProviders;
 * ```
 */
export class FileStorageEngineBase extends BaseEngine<FileStorageEngineBase> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only
     * one instance of it in the application. Do not directly create new instances of it,
     * always use this method to get the instance.
     */
    public static get Instance(): FileStorageEngineBase {
        return super.getInstance<FileStorageEngineBase>();
    }

    private _accounts: MJFileStorageAccountEntity[] = [];
    private _providers: MJFileStorageProviderEntity[] = [];

    /**
     * Configures the engine by loading file storage accounts and providers.
     * @param forceRefresh - If true, forces a refresh from the database even if data is cached
     * @param contextUser - Optional user context for server-side operations
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: File Storage Accounts',
                PropertyName: '_accounts',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: File Storage Providers',
                PropertyName: '_providers',
                CacheLocal: true
            }
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ========================================
    // Getters for cached data
    // ========================================

    /**
     * Gets all file storage accounts
     */
    public get Accounts(): MJFileStorageAccountEntity[] {
        return this._accounts || [];
    }

    /**
     * Gets all file storage providers.
     * Consumers should filter by IsActive if needed.
     */
    public get Providers(): MJFileStorageProviderEntity[] {
        return this._providers || [];
    }

    /**
     * Gets all storage accounts combined with their provider details.
     * Consumers should filter/sort as needed (e.g., by provider.IsActive).
     */
    public get AccountsWithProviders(): StorageAccountWithProvider[] {
        const providerMap = new Map<string, MJFileStorageProviderEntity>();
        this.Providers.forEach(p => providerMap.set(p.ID, p));

        return this.Accounts
            .map(account => {
                const provider = providerMap.get(account.ProviderID);
                if (!provider) return null;
                return { account, provider };
            })
            .filter((item): item is StorageAccountWithProvider => item !== null);
    }

    // ========================================
    // Lookup Methods
    // ========================================

    /**
     * Gets a file storage account by its ID
     * @param accountId - The ID of the account to find
     * @returns The account entity or undefined if not found
     */
    public GetAccountById(accountId: string): MJFileStorageAccountEntity | undefined {
        return this.Accounts.find(a => UUIDsEqual(a.ID, accountId));
    }

    /**
     * Gets a file storage provider by its ID
     * @param providerId - The ID of the provider to find
     * @returns The provider entity or undefined if not found
     */
    public GetProviderById(providerId: string): MJFileStorageProviderEntity | undefined {
        return this.Providers.find(p => UUIDsEqual(p.ID, providerId));
    }

    /**
     * Gets a file storage account by its name (case-insensitive).
     * @param name - The name of the account to find
     * @returns The account entity or undefined if not found
     */
    public GetAccountByName(name: string): MJFileStorageAccountEntity | undefined {
        return this.Accounts.find(a => a.Name?.trim().toLowerCase() === name.trim().toLowerCase());
    }

    /**
     * Gets file storage accounts linked to a given provider ID.
     * @param providerId - The provider ID to match against account.ProviderID
     * @returns Array of matching accounts (may be empty)
     */
    public GetAccountsByProviderID(providerId: string): MJFileStorageAccountEntity[] {
        return this.Accounts.filter(a => UUIDsEqual(a.ProviderID, providerId));
    }

    /**
     * Gets a storage account with its provider details by account ID
     * @param accountId - The ID of the account to find
     * @returns The account with provider or null if not found or provider is inactive
     */
    public GetAccountWithProvider(accountId: string): StorageAccountWithProvider | null {
        const account = this.GetAccountById(accountId);
        if (!account) return null;
        const provider = this.GetProviderById(account.ProviderID);
        if (!provider) return null;
        return { account, provider };
    }
}
