import { BaseEntity, CompositeKey, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { FileStorageEngine } from '@memberjunction/core-entities';
import { initializeDriverWithAccountCredentials } from '@memberjunction/storage';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import { DefaultArchiveDriver } from './DefaultArchiveDriver';
import { RestoreRecordContext, RestoreRecordResult } from './types';

/**
 * Provides recovery operations for archived records, including listing
 * archived versions and restoring specific versions.
 */
export class ArchiveRecovery {
    /**
     * Retrieves all archived versions for a specific entity record.
     * Queries the ArchiveRunDetail table for matching records.
     *
     * @param entityName - The name of the entity
     * @param recordId - The primary key value of the record
     * @param contextUser - User context for database access
     * @returns Array of ArchiveRunDetail records, ordered by most recent first
     */
    public async GetArchivedVersions(entityName: string, recordId: string, contextUser: UserInfo): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>({
            EntityName: 'MJ: Archive Run Details',
            ExtraFilter: `EntityName='${entityName}' AND RecordID='${recordId}' AND Status='Success'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            LogError(`Failed to load archived versions for ${entityName}/${recordId}: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results;
    }

    /**
     * Restores a specific archived version of a record.
     * Loads the ArchiveRunDetail, initializes the storage driver,
     * reads the archive document, and applies the values back to the record.
     *
     * @param archiveRunDetailId - ID of the ArchiveRunDetail record to restore
     * @param contextUser - User context for database and storage access
     * @returns Result indicating success/failure and which fields were restored
     */
    public async RestoreVersion(archiveRunDetailId: string, contextUser: UserInfo): Promise<RestoreRecordResult> {
        try {
            const detail = await this.LoadArchiveRunDetail(archiveRunDetailId, contextUser);
            if (!detail) {
                return { Success: false, ErrorMessage: `ArchiveRunDetail not found: ${archiveRunDetailId}`, RestoredFields: [] };
            }

            const archiveRun = await this.LoadArchiveRun(detail.Get('ArchiveRunID') as string, contextUser);
            if (!archiveRun) {
                return { Success: false, ErrorMessage: 'Failed to load parent ArchiveRun', RestoredFields: [] };
            }

            const storageDriver = await this.InitializeStorageDriver(archiveRun, contextUser);
            const driver = this.ResolveDriver(detail);

            const restoreContext: RestoreRecordContext = {
                ArchiveRunDetail: detail,
                StorageDriver: storageDriver,
                ContextUser: contextUser,
            };

            const result = await driver.RestoreRecord(restoreContext);
            LogStatus(`RestoreVersion completed for detail ${archiveRunDetailId}: success=${result.Success}`);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RestoreVersion failed for detail ${archiveRunDetailId}: ${message}`);
            return { Success: false, ErrorMessage: message, RestoredFields: [] };
        }
    }

    // ========================================
    // Private Helpers
    // ========================================

    /**
     * Loads a single ArchiveRunDetail record by ID.
     */
    private async LoadArchiveRunDetail(detailId: string, contextUser: UserInfo): Promise<BaseEntity | null> {
        const md = new Metadata();
        const detail = await md.GetEntityObject('MJ: Archive Run Details', contextUser);
        const loaded = await detail.InnerLoad(CompositeKey.FromKeyValuePair('ID', detailId));
        return loaded ? detail : null;
    }

    /**
     * Loads a single ArchiveRun record by ID.
     */
    private async LoadArchiveRun(archiveRunId: string, contextUser: UserInfo): Promise<BaseEntity | null> {
        const md = new Metadata();
        const run = await md.GetEntityObject('MJ: Archive Runs', contextUser);
        const loaded = await run.InnerLoad(CompositeKey.FromKeyValuePair('ID', archiveRunId));
        return loaded ? run : null;
    }

    /**
     * Initializes a storage driver from the ArchiveRun's associated configuration.
     */
    private async InitializeStorageDriver(archiveRun: BaseEntity, contextUser: UserInfo): Promise<import('@memberjunction/storage').FileStorageBase> {
        const configId = archiveRun.Get('ArchiveConfigurationID') as string;

        const md = new Metadata();
        const config = await md.GetEntityObject('MJ: Archive Configurations', contextUser);
        const loaded = await config.InnerLoad(CompositeKey.FromKeyValuePair('ID', configId));
        if (!loaded) {
            throw new Error(`ArchiveConfiguration not found: ${configId}`);
        }

        const storageAccountId = config.Get('StorageAccountID') as string;
        if (!storageAccountId) {
            throw new Error(`No StorageAccountID configured on ArchiveConfiguration: ${configId}`);
        }

        await FileStorageEngine.Instance.Config(false, contextUser);
        const accountWithProvider = FileStorageEngine.Instance.GetAccountWithProvider(storageAccountId);
        if (!accountWithProvider) {
            throw new Error(`File storage account not found or provider inactive for ID: ${storageAccountId}`);
        }

        return initializeDriverWithAccountCredentials({
            accountEntity: accountWithProvider.account,
            providerEntity: accountWithProvider.provider,
            contextUser,
        });
    }

    /**
     * Resolves the archive driver from the ArchiveRunDetail's DriverClass,
     * falling back to DefaultArchiveDriver.
     */
    private ResolveDriver(detail: BaseEntity): BaseArchiveDriver {
        const driverClassName = detail.Get('DriverClass') as string | null;
        if (driverClassName) {
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArchiveDriver>(
                BaseArchiveDriver,
                driverClassName
            );
            if (driver) {
                return driver;
            }
            LogError(`Failed to resolve archive driver "${driverClassName}", falling back to DefaultArchiveDriver`);
        }
        return new DefaultArchiveDriver();
    }
}
