import { LogStatus, UserInfo } from '@memberjunction/core';
import { FileStorageBase, initializeDriverWithAccountCredentials } from '@memberjunction/storage';
import { FileStorageEngineBase } from '@memberjunction/core-entities';
import { ArchiveDocument } from './types';

/**
 * Manages the lifecycle of a storage driver for archive operations,
 * including initialization from a FileStorageAccount and read/write
 * of archive documents.
 */
export class ArchiveStorageManager {
    private _driver: FileStorageBase | null = null;
    private _accountId: string | null = null;

    /**
     * Returns the initialized storage driver, or throws if not yet initialized.
     */
    public get Driver(): FileStorageBase {
        if (!this._driver) {
            throw new Error('ArchiveStorageManager has not been initialized. Call Initialize() first.');
        }
        return this._driver;
    }

    /**
     * Initializes the storage driver for the given FileStorageAccount.
     * Loads the account and provider from the FileStorageEngineBase cache,
     * then creates and initializes the appropriate driver via ClassFactory.
     *
     * @param storageAccountId - ID of the MJ: File Storage Account to use
     * @param contextUser - User context for credential resolution
     */
    public async Initialize(storageAccountId: string, contextUser: UserInfo): Promise<void> {
        this._accountId = storageAccountId;

        await FileStorageEngineBase.Instance.Config(false, contextUser);

        const accountWithProvider = FileStorageEngineBase.Instance.GetAccountWithProvider(storageAccountId);
        if (!accountWithProvider) {
            throw new Error(`File storage account not found or provider inactive for ID: ${storageAccountId}`);
        }

        const { account, provider } = accountWithProvider;
        LogStatus(`Initializing archive storage driver for account "${account.Name}" (provider: ${provider.Name})`);

        this._driver = await initializeDriverWithAccountCredentials({
            accountEntity: account,
            providerEntity: provider,
            contextUser,
        });
    }

    /**
     * Serializes and writes an archive document to storage.
     *
     * @param basePath - Configured base path prefix
     * @param entityName - Entity name for path building
     * @param recordId - Record primary key value for path building
     * @param versionStamp - Timestamp for this archive version
     * @param document - The archive document to write
     * @returns The storage path and bytes written
     */
    public async WriteArchiveDocument(
        basePath: string,
        entityName: string,
        recordId: string,
        versionStamp: Date,
        document: ArchiveDocument
    ): Promise<{ storagePath: string; bytesWritten: number }> {
        const storagePath = this.BuildStoragePath(basePath, entityName, recordId, versionStamp);
        const jsonContent = JSON.stringify(document, null, 2);
        const buffer = Buffer.from(jsonContent, 'utf8');

        const success = await this.Driver.PutObject(storagePath, buffer, 'application/json');
        if (!success) {
            throw new Error(`Failed to write archive document to storage: ${storagePath}`);
        }

        return { storagePath, bytesWritten: buffer.byteLength };
    }

    /**
     * Reads and parses an archive document from storage.
     *
     * @param storagePath - Full path to the archive document in storage
     * @returns The parsed archive document
     */
    public async ReadArchiveDocument(storagePath: string): Promise<ArchiveDocument> {
        const buffer = await this.Driver.GetObject({ fullPath: storagePath });
        const jsonContent = buffer.toString('utf8');
        return JSON.parse(jsonContent) as ArchiveDocument;
    }

    /**
     * Builds a storage path for an archive document.
     * Format: `{basePath}/{SanitizedEntityName}/{RecordID}/{VersionStamp}.json`
     */
    public BuildStoragePath(basePath: string, entityName: string, recordId: string, versionStamp: Date): string {
        const sanitizedEntity = this.SanitizeEntityName(entityName);
        const sanitizedRecordId = this.SanitizeEntityName(recordId);
        const formattedStamp = this.FormatVersionStamp(versionStamp);
        const prefix = basePath ? `${basePath}/` : '';
        return `${prefix}${sanitizedEntity}/${sanitizedRecordId}/${formattedStamp}.json`;
    }

    /**
     * Replaces characters that are problematic in storage paths with underscores.
     */
    public SanitizeEntityName(name: string): string {
        return name.replace(/[\s:\/\\]/g, '_');
    }

    /**
     * Formats a Date as an ISO 8601 string safe for use in file paths.
     */
    public FormatVersionStamp(date: Date): string {
        return date.toISOString().replace(/:/g, '_');
    }
}
