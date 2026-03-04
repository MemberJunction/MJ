import { RegisterClass } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
} from '@memberjunction/integration-engine';
import { RelationalDBConnector } from './RelationalDBConnector.js';

/** Primary key column used for contacts table */
const HS_CONTACTS_ID = 'vid';
/** Primary key column used for companies table */
const HS_COMPANIES_ID = 'companyId';
/** Primary key column used for deals table */
const HS_DEALS_ID = 'dealId';
/** Modification timestamp column used across all HubSpot mock tables */
const HS_MODIFIED_FIELD = 'lastmodifieddate';
/** Soft-delete flag column on hs.contacts (added by incremental changes migration) */
const HS_CONTACTS_DELETED_FIELD = 'is_deleted';

/**
 * Connector for HubSpot CRM data, backed by the mock_data database (hs schema).
 * Reads from hs.contacts, hs.companies, and hs.deals tables.
 * Provides default field mappings for contacts and companies to MJ entities.
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
        const idField = this.getIdField(ctx.ObjectName);
        const deletedField = this.getDeletedField(ctx.ObjectName);
        return this.FetchChangesFromTable(ctx, idField, HS_MODIFIED_FIELD, deletedField);
    }

    /**
     * Returns suggested default field mappings for known HubSpot objects to MJ entities.
     * @param objectName - HubSpot object name (e.g., "contacts")
     * @param entityName - Target MJ entity name (e.g., "Contacts")
     * @returns Array of default field mappings
     */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'contacts':
                return this.getContactMappings();
            case 'companies':
                return this.getCompanyMappings();
            default:
                return [];
        }
    }

    /**
     * Gets the primary key column for a HubSpot table.
     * @param objectName - Table name
     * @returns Column name for the primary key
     */
    private getIdField(objectName: string): string {
        switch (objectName) {
            case 'contacts': return HS_CONTACTS_ID;
            case 'companies': return HS_COMPANIES_ID;
            case 'deals': return HS_DEALS_ID;
            default: return HS_CONTACTS_ID;
        }
    }

    /**
     * Gets the soft-delete flag column for a HubSpot table, if one exists.
     * Currently only the contacts table has an is_deleted column.
     * @param objectName - Table name
     * @returns Column name for the deleted flag, or undefined if not applicable
     */
    private getDeletedField(objectName: string): string | undefined {
        switch (objectName) {
            case 'contacts': return HS_CONTACTS_DELETED_FIELD;
            default: return undefined;
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
