import { RegisterClass } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
} from '@memberjunction/integration-engine';
import { RelationalDBConnector } from './RelationalDBConnector.js';

/** Primary key column used across all Salesforce mock tables */
const SF_ID_FIELD = 'Id';
/** Modification timestamp column used across Salesforce mock tables */
const SF_MODIFIED_FIELD = 'LastModifiedDate';
/** Soft-delete flag column used across all Salesforce mock tables */
const SF_DELETED_FIELD = 'IsDeleted';

/**
 * Connector for Salesforce CRM data, backed by the mock_data database (sf schema).
 * Reads from sf.Contact, sf.Account, and sf.Opportunity tables.
 * Provides default field mappings for Contacts and Accounts to MJ entities.
 */
@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')
export class SalesforceConnector extends RelationalDBConnector {
    /**
     * Fetches a batch of changed records from the specified Salesforce object table.
     * Uses LastModifiedDate for watermark-based incremental sync.
     * @param ctx - Fetch context with integration, object, watermark, and batch details
     * @returns Batch of Salesforce records with pagination info
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        return this.FetchChangesFromTable(ctx, SF_ID_FIELD, SF_MODIFIED_FIELD, SF_DELETED_FIELD);
    }

    /**
     * Returns suggested default field mappings for known Salesforce objects to MJ entities.
     * @param objectName - Salesforce object name (e.g., "Contact")
     * @param _entityName - Target MJ entity name (e.g., "Contacts")
     * @returns Array of default field mappings
     */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Contact':
                return this.getContactMappings();
            case 'Account':
                return this.getAccountMappings();
            default:
                return [];
        }
    }

    /** Default field mappings: sf_Contact -> Contacts */
    private getContactMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'Email', DestinationFieldName: 'Email', IsKeyField: true },
            { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'Title', DestinationFieldName: 'Title' },
            { SourceFieldName: 'Department', DestinationFieldName: 'Department' },
        ];
    }

    /** Default field mappings: sf_Account -> Companies */
    private getAccountMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'Name', DestinationFieldName: 'Name', IsKeyField: true },
            { SourceFieldName: 'Industry', DestinationFieldName: 'Industry' },
            { SourceFieldName: 'BillingCity', DestinationFieldName: 'City' },
            { SourceFieldName: 'BillingState', DestinationFieldName: 'State' },
            { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
        ];
    }
}
