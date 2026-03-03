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
/** Modification timestamp column used across most Salesforce mock tables */
const SF_MODIFIED_FIELD = 'LastModifiedDate';
/** Soft-delete flag column used across most Salesforce mock tables */
const SF_DELETED_FIELD = 'IsDeleted';

/**
 * Connector for Salesforce CRM data, backed by the MockSalesforce SQL Server database.
 * Reads from sf_Contact, sf_Account, sf_Opportunity, and sf_User tables.
 * Provides default field mappings for Contacts to MJ entities.
 */
@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')
export class SalesforceConnector extends RelationalDBConnector {
    /**
     * Fetches a batch of changed records from the specified Salesforce object table.
     * Uses LastModifiedDate for watermark-based incremental sync.
     * sf_User has no LastModifiedDate, so uses CreatedDate instead.
     * @param ctx - Fetch context with integration, object, watermark, and batch details
     * @returns Batch of Salesforce records with pagination info
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectName = ctx.ObjectName;

        // sf_User has no LastModifiedDate or IsDeleted columns
        if (objectName === 'sf_User') {
            return this.FetchChangesFromTable(ctx, SF_ID_FIELD, 'CreatedDate');
        }

        return this.FetchChangesFromTable(ctx, SF_ID_FIELD, SF_MODIFIED_FIELD, SF_DELETED_FIELD);
    }

    /**
     * Returns suggested default field mappings for known Salesforce objects to MJ entities.
     * @param objectName - Salesforce object name (e.g., "sf_Contact")
     * @param _entityName - Target MJ entity name (e.g., "Contacts")
     * @returns Array of default field mappings
     */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'sf_Contact':
                return this.getContactMappings();
            case 'sf_Account':
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
