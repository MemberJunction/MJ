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
 * Outcome of {@link FileStorageEngineBase.ResolveDefaultAccount}: which account the system-wide
 * fallback chose, and whether the choice was ambiguous (so callers can warn in their own terms).
 */
export interface DefaultStorageAccountResolution {
    /** The chosen account, or `null` when there were no candidates. */
    Chosen: StorageAccountWithProvider | null;
    /** Every candidate considered, ordered newest `__mj_UpdatedAt` first (ties by ID). */
    Candidates: StorageAccountWithProvider[];
    /** `true` when two or more candidates existed, so the choice fell to the tie-breaker. */
    Ambiguous: boolean;
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
        return this.Accounts
            .map(account => {
                const provider = this.Providers.find(p => UUIDsEqual(p.ID, account.ProviderID));
                if (!provider) return null;
                return { account, provider };
            })
            .filter((item): item is StorageAccountWithProvider => item !== null);
    }

    /**
     * Gets storage accounts whose provider is active — the accounts files can actually be written to.
     */
    public get ActiveAccounts(): StorageAccountWithProvider[] {
        return this.AccountsWithProviders.filter(a => a.provider.IsActive);
    }

    // ========================================
    // Default account resolution
    // ========================================

    /**
     * Picks the storage account to use when no caller-specific default is configured. This is the
     * single golden path for "which account, if nobody said?" — agents, actions and UI should all use it
     * so they agree.
     *
     * - No candidates → `Chosen` is `null`.
     * - One candidate → that account.
     * - Two or more → the account with the most recent `__mj_UpdatedAt`, exact ties broken by ID
     *   (case-insensitive) so the choice is stable across processes; `Ambiguous` is `true`.
     *
     * Works only on cached metadata (no database calls) and does not log — callers decide how to
     * surface an ambiguous choice.
     *
     * @param candidates - Accounts to choose among; defaults to {@link ActiveAccounts}.
     */
    public ResolveDefaultAccount(candidates: StorageAccountWithProvider[] = this.ActiveAccounts): DefaultStorageAccountResolution {
        const sorted = [...candidates].sort(FileStorageEngineBase.compareNewestFirst);
        return {
            Chosen: sorted[0] ?? null,
            Candidates: sorted,
            Ambiguous: sorted.length > 1,
        };
    }

    /**
     * Convenience form of {@link ResolveDefaultAccount} that returns just the chosen account's ID.
     * @param candidates - Accounts to choose among; defaults to {@link ActiveAccounts}.
     * @returns The chosen account ID, or `null` when there are no candidates.
     */
    public ResolveDefaultAccountID(candidates?: StorageAccountWithProvider[]): string | null {
        return this.ResolveDefaultAccount(candidates).Chosen?.account.ID ?? null;
    }

    /** Orders newest `__mj_UpdatedAt` first, breaking exact ties by ID (case-insensitive). */
    private static compareNewestFirst(a: StorageAccountWithProvider, b: StorageAccountWithProvider): number {
        const byUpdated = new Date(b.account.__mj_UpdatedAt).getTime() - new Date(a.account.__mj_UpdatedAt).getTime();
        if (byUpdated !== 0) return byUpdated;
        const aId = a.account.ID.toUpperCase();
        const bId = b.account.ID.toUpperCase();
        return aId < bId ? -1 : aId > bId ? 1 : 0;
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
