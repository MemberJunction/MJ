import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import {
    FileStorageEngineBase,
    StorageAccountWithProvider,
    MJFileEntity,
    MJFileStorageAccountEntity,
    MJFileStorageProviderEntity
} from '@memberjunction/core-entities';
import { FileStorageBase } from './generic/FileStorageBase';
import { initializeDriverWithAccountCredentials } from './util';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for uploading a file to MJ Storage.
 */
export interface UploadFileOptions {
    /** Raw file content as a Buffer */
    content: Buffer;
    /** File name (used for the MJ: Files record and the storage path) */
    fileName: string;
    /** MIME type of the file (e.g., 'application/pdf') */
    mimeType: string;
    /** User context for DB operations and credential access */
    contextUser: UserInfo;
    /**
     * Optional pre-resolved FileStorageAccount ID.
     * When provided, the file is uploaded to this specific account.
     * Otherwise, the first active account is used.
     */
    storageAccountId?: string;
    /**
     * Optional metadata provider. Defaults to `Metadata.Provider`.
     */
    provider?: IMetadataProvider;
    /**
     * Optional path prefix within the storage bucket.
     * Defaults to `'artifacts/<date>/<uuid>'`.
     */
    pathPrefix?: string;
}

/**
 * Result returned by {@link FileStorageEngine.UploadFile}.
 */
export interface UploadFileResult {
    /** The newly created MJ: Files record ID */
    FileID: string;
    /** The storage path (ProviderKey) where the file was stored */
    StoragePath: string;
    /** The storage account that was used */
    Account: MJFileStorageAccountEntity;
    /** The storage provider that was used */
    Provider: MJFileStorageProviderEntity;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side file storage engine providing high-level operations for uploading,
 * downloading, and managing files in MJ Storage.
 *
 * Follows the containment pattern (like AIEngine wraps AIEngineBase):
 * - Delegates all metadata access to {@link FileStorageEngineBase}
 * - Adds server-side methods: {@link UploadFile}, {@link GetDriver}, {@link ResolveStorageAccount}
 *
 * **Client-side code** should use `FileStorageEngineBase` from `@memberjunction/core-entities`
 * for metadata-only access (accounts, providers, lookups).
 *
 * Usage:
 * ```typescript
 * import { FileStorageEngine } from '@memberjunction/storage';
 *
 * const engine = FileStorageEngine.Instance;
 * await engine.Config(false, contextUser);
 *
 * // Upload a file
 * const result = await engine.UploadFile({
 *     content: Buffer.from(base64Data, 'base64'),
 *     fileName: 'report.pdf',
 *     mimeType: 'application/pdf',
 *     contextUser
 * });
 *
 * // Get a driver for direct operations
 * const driver = await engine.GetDriver(accountId, contextUser);
 * const objects = await driver.ListObjects('/');
 * ```
 */
export class FileStorageEngine extends BaseSingleton<FileStorageEngine> {

    // Loading state management (mirrors AIEngine pattern)
    private _loaded: boolean = false;
    private _loading: boolean = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;

    // Server-specific state: cached, initialized drivers keyed by account ID
    private _driverCache: Map<string, FileStorageBase> = new Map();

    /**
     * Returns the global singleton instance.
     */
    public static get Instance(): FileStorageEngine {
        return super.getInstance<FileStorageEngine>();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Containment — delegate to FileStorageEngineBase
    // ─────────────────────────────────────────────────────────────────────

    /** Access to the underlying metadata-only engine. */
    protected get Base(): FileStorageEngineBase {
        return FileStorageEngineBase.Instance;
    }

    /** Returns true if the engine has been configured. */
    public get Loaded(): boolean {
        return this._loaded && this.Base.Loaded;
    }

    // --- Delegated metadata getters ---

    /** Gets all file storage accounts (cached). */
    public get Accounts(): MJFileStorageAccountEntity[] {
        return this.Base.Accounts;
    }

    /** Gets all file storage providers (cached). */
    public get Providers(): MJFileStorageProviderEntity[] {
        return this.Base.Providers;
    }

    /** Gets all storage accounts combined with their provider details (cached). */
    public get AccountsWithProviders(): StorageAccountWithProvider[] {
        return this.Base.AccountsWithProviders;
    }

    /** Whether any storage accounts are configured. */
    public get HasStorageAccounts(): boolean {
        return this.Base.AccountsWithProviders.length > 0;
    }

    // --- Delegated lookup methods ---

    /** Gets a file storage account by its ID. */
    public GetAccountById(accountId: string): MJFileStorageAccountEntity | undefined {
        return this.Base.GetAccountById(accountId);
    }

    /** Gets a file storage provider by its ID. */
    public GetProviderById(providerId: string): MJFileStorageProviderEntity | undefined {
        return this.Base.GetProviderById(providerId);
    }

    /** Gets a file storage account by its name (case-insensitive). */
    public GetAccountByName(name: string): MJFileStorageAccountEntity | undefined {
        return this.Base.GetAccountByName(name);
    }

    /** Gets file storage accounts linked to a given provider ID. */
    public GetAccountsByProviderID(providerId: string): MJFileStorageAccountEntity[] {
        return this.Base.GetAccountsByProviderID(providerId);
    }

    /** Gets a storage account with its provider details by account ID. */
    public GetAccountWithProvider(accountId: string): StorageAccountWithProvider | null {
        return this.Base.GetAccountWithProvider(accountId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Configures the engine by loading the underlying metadata cache and any
     * server-specific state. Safe to call multiple times — uses cached data
     * unless `forceRefresh` is true. Concurrent callers share a single loading
     * promise to avoid redundant work.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (this._loaded && !forceRefresh) {
            return;
        }

        // If currently loading, return the existing promise so all callers wait together
        if (this._loading && this._loadingPromise) {
            return this._loadingPromise;
        }

        this._loading = true;
        this._loadingPromise = this.innerLoad(forceRefresh, contextUser, provider);

        try {
            await this._loadingPromise;
        } finally {
            this._loading = false;
            this._loadingPromise = null;
        }
    }

    /**
     * Internal loading logic — separated for clean promise management.
     * First ensures the base metadata cache is loaded, then loads any
     * server-specific state (extensible for future needs).
     */
    private async innerLoad(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        try {
            this._contextUser = contextUser;

            // Load base metadata (accounts, providers)
            await this.Base.Config(forceRefresh ?? false, contextUser, provider);

            // Initialize drivers for all active accounts and cache them
            await this.RefreshDriverCache();

            this._loaded = true;
        } catch (error) {
            LogError(error);
            throw error;
        }
    }

    /**
     * Initializes storage drivers for all active accounts and caches them.
     * Called automatically during Config(). Can also be called independently to
     * re-initialize drivers without reloading metadata (e.g., after credential rotation).
     * Accounts that fail to initialize are logged and skipped — they will fall back to
     * on-demand initialization when GetDriver() is called.
     */
    public async RefreshDriverCache(): Promise<void> {
        this._driverCache.clear();

        const activeAccounts = this.Base.AccountsWithProviders.filter(a => a.provider.IsActive !== false);
        if (activeAccounts.length === 0 || !this._contextUser) {
            return;
        }

        const contextUser = this._contextUser;
        const results = await Promise.allSettled(
            activeAccounts.map(async ({ account, provider: storageProvider }) => {
                const driver = await initializeDriverWithAccountCredentials({
                    accountEntity: account,
                    providerEntity: storageProvider,
                    contextUser
                });
                this._driverCache.set(account.ID, driver);
            })
        );

        // Log failures but don't throw — failed accounts fall back to on-demand init
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'rejected') {
                const accountName = activeAccounts[i].account.Name;
                const reason = (results[i] as PromiseRejectedResult).reason;
                LogError(`FileStorageEngine: failed to pre-initialize driver for account "${accountName}": ${reason}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Server-side operations
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Resolves a storage account to use for file operations.
     *
     * Resolution logic:
     * 1. If `accountId` is provided, returns that specific account
     * 2. Otherwise, returns the first active account
     * 3. If no active accounts exist, returns the first account regardless of active status
     *
     * @param accountId - Optional explicit account ID
     * @returns The resolved account with provider, or null if no accounts are configured
     */
    public ResolveStorageAccount(accountId?: string): StorageAccountWithProvider | null {
        if (accountId) {
            return this.Base.GetAccountWithProvider(accountId);
        }

        const accounts = this.Base.AccountsWithProviders;
        if (accounts.length === 0) return null;

        return accounts.find(a => a.provider.IsActive !== false) ?? accounts[0];
    }

    /**
     * Returns an authenticated storage driver for a given account.
     *
     * Checks the pre-initialized driver cache first (populated during Config()).
     * If the account wasn't cached (e.g., it failed during Config or was added after),
     * falls back to on-demand initialization.
     *
     * This handles:
     * - Looking up the account and provider from cached metadata
     * - Decrypting credentials via the Credential Engine
     * - Setting up OAuth token refresh callbacks for providers like Box
     *
     * @param accountId - The FileStorageAccount ID to get a driver for
     * @param contextUser - User context for credential decryption (used for on-demand init)
     * @returns An initialized, ready-to-use FileStorageBase driver
     * @throws Error if the account is not found or driver initialization fails
     */
    public async GetDriver(accountId: string, contextUser: UserInfo): Promise<FileStorageBase> {
        // Check pre-initialized cache first
        const cached = this._driverCache.get(accountId);
        if (cached) {
            return cached;
        }

        // On-demand fallback: account wasn't in cache (failed init, added late, etc.)
        const resolved = this.Base.GetAccountWithProvider(accountId);
        if (!resolved) {
            throw new Error(`FileStorageEngine.GetDriver: account '${accountId}' not found in cached metadata. Did you call Config() first?`);
        }

        const driver = await initializeDriverWithAccountCredentials({
            accountEntity: resolved.account,
            providerEntity: resolved.provider,
            contextUser
        });

        // Cache it for future calls
        this._driverCache.set(accountId, driver);
        return driver;
    }

    /**
     * Uploads a file to MJ Storage and creates an `MJ: Files` entity record.
     *
     * This is the primary high-level method for storing files. It handles:
     * 1. Resolving which storage account to use
     * 2. Initializing an authenticated driver
     * 3. Uploading the file content
     * 4. Creating the `MJ: Files` database record
     *
     * @param options - Upload options (content, fileName, mimeType, contextUser, etc.)
     * @returns Upload result containing the file ID, storage path, and account/provider used
     * @throws Error if no storage accounts are configured or the upload/save fails
     *
     * @example
     * ```typescript
     * const result = await FileStorageEngine.Instance.UploadFile({
     *     content: Buffer.from(base64Data, 'base64'),
     *     fileName: 'report.pdf',
     *     mimeType: 'application/pdf',
     *     contextUser,
     *     storageAccountId: resolvedAccountId  // optional
     * });
     * console.log('Created file:', result.FileID);
     * ```
     */
    public async UploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
        const { content, fileName, mimeType, contextUser, storageAccountId, provider } = options;
        const md = provider ?? Metadata.Provider;

        // 1. Resolve storage account
        const resolved = this.ResolveStorageAccount(storageAccountId);
        if (!resolved) {
            throw new Error('FileStorageEngine.UploadFile: no file storage accounts configured. Cannot upload.');
        }

        // 2. Initialize driver
        const driver = await this.GetDriver(resolved.account.ID, contextUser);

        // 3. Upload
        const pathPrefix = options.pathPrefix ?? `artifacts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
        const storagePath = `${pathPrefix}/${fileName}`;
        const uploaded = await driver.PutObject(storagePath, content, mimeType);
        if (!uploaded) {
            throw new Error(`FileStorageEngine.UploadFile: PutObject returned false for path '${storagePath}'`);
        }

        // 4. Create MJ: Files record
        const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        fileEntity.Name = fileName;
        fileEntity.ContentType = mimeType;
        fileEntity.ProviderID = resolved.provider.ID;
        fileEntity.ProviderKey = storagePath;
        fileEntity.Status = 'Uploaded';

        if (!(await fileEntity.Save())) {
            throw new Error(`FileStorageEngine.UploadFile: failed to save MJ: Files record for '${fileName}'`);
        }

        return {
            FileID: fileEntity.ID,
            StoragePath: storagePath,
            Account: resolved.account,
            Provider: resolved.provider
        };
    }
}
