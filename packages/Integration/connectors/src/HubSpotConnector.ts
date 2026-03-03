import { RegisterClass } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
} from '@memberjunction/integration-engine';
import { RelationalDBConnector } from './RelationalDBConnector.js';

/** Primary key column used across all HubSpot mock tables */
const HS_ID_FIELD = 'hs_object_id';
/** Modification timestamp column used across all HubSpot mock tables */
const HS_MODIFIED_FIELD = 'lastmodifieddate';
/** Soft-delete flag column used across all HubSpot mock tables */
const HS_DELETED_FIELD = 'hs_is_deleted';

/**
 * Connector for HubSpot CRM data, backed by the MockHubSpot SQL Server database.
 * Reads from hs_Contacts, hs_Companies, hs_Deals, and hs_Owners tables.
 * Provides default field mappings for Contacts and Companies to MJ entities.
 */
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends RelationalDBConnector {
    /**
     * Fetches a batch of changed records from the specified HubSpot object table.
     * Uses lastmodifieddate for watermark-based incremental sync.
     * @param ctx - Fetch context with integration, object, watermark, and batch details
     * @returns Batch of HubSpot records with pagination info
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectName = ctx.ObjectName;

        // hs_Owners uses different column names
        if (objectName === 'hs_Owners') {
            return this.FetchChangesFromTable(ctx, 'owner_id', 'updatedat');
        }

        return this.FetchChangesFromTable(ctx, HS_ID_FIELD, HS_MODIFIED_FIELD, HS_DELETED_FIELD);
    }

    /**
     * Returns suggested default field mappings for known HubSpot objects to MJ entities.
     * @param objectName - HubSpot object name (e.g., "hs_Contacts")
     * @param entityName - Target MJ entity name (e.g., "Contacts")
     * @returns Array of default field mappings
     */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'hs_Contacts':
                return this.getContactMappings();
            case 'hs_Companies':
                return this.getCompanyMappings();
            default:
                return [];
        }
    }

    /** Default field mappings: hs_Contacts -> Contacts */
    private getContactMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'email', DestinationFieldName: 'Email', IsKeyField: true },
            { SourceFieldName: 'firstname', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'lastname', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'company', DestinationFieldName: 'CompanyName' },
            { SourceFieldName: 'lifecyclestage', DestinationFieldName: 'Status' },
        ];
    }

    /** Default field mappings: hs_Companies -> Companies */
    private getCompanyMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'name', DestinationFieldName: 'Name', IsKeyField: true },
            { SourceFieldName: 'domain', DestinationFieldName: 'Website' },
            { SourceFieldName: 'industry', DestinationFieldName: 'Industry' },
            { SourceFieldName: 'city', DestinationFieldName: 'City' },
            { SourceFieldName: 'state', DestinationFieldName: 'State' },
        ];
    }
}
