import { RegisterClass } from '@memberjunction/global';
import {
    BaseIntegrationConnector,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
} from '@memberjunction/integration-engine';
import { RelationalDBConnector } from './RelationalDBConnector.js';

/**
 * Connector for YourMembership AMS data, backed by the mock_data database (ym schema).
 * Reads from ym.members, ym.membership_types, ym.events, and ym.event_registrations.
 * Provides default field mappings for members to MJ Contacts entity.
 */
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends RelationalDBConnector {
    /**
     * Fetches a batch of changed records from the specified YourMembership object table.
     * Each table uses different ID, timestamp, and deletion columns.
     * @param ctx - Fetch context with integration, object, watermark, and batch details
     * @returns Batch of YourMembership records with pagination info
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const tableConfig = this.getTableConfig(ctx.ObjectName);
        return this.FetchChangesFromTable(ctx, tableConfig.IdField, tableConfig.ModifiedAtField);
    }

    /**
     * Returns suggested default field mappings for known YourMembership objects to MJ entities.
     * @param objectName - YourMembership object name (e.g., "members")
     * @param _entityName - Target MJ entity name (e.g., "Contacts")
     * @returns Array of default field mappings
     */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        if (objectName === 'members') {
            return this.getMemberMappings();
        }
        return [];
    }

    /**
     * Gets the ID and timestamp column names for each YourMembership table.
     * @param objectName - Table name
     * @returns Configuration with ID and modification timestamp column names
     */
    private getTableConfig(objectName: string): YMTableConfig {
        switch (objectName) {
            case 'members':
                return { IdField: 'member_id', ModifiedAtField: 'updated_at' };
            case 'membership_types':
                return { IdField: 'type_id', ModifiedAtField: 'updated_at' };
            case 'events':
                return { IdField: 'event_id', ModifiedAtField: 'updated_at' };
            case 'event_registrations':
                return { IdField: 'registration_id', ModifiedAtField: 'updated_at' };
            default:
                throw new Error(`Unknown YourMembership table: ${objectName}`);
        }
    }

    /** Default field mappings: ym_Members -> Contacts */
    private getMemberMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'email', DestinationFieldName: 'Email', IsKeyField: true },
            { SourceFieldName: 'first_name', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'last_name', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'status', DestinationFieldName: 'Status' },
        ];
    }
}

/** Configuration for a YourMembership table's ID and timestamp columns */
interface YMTableConfig {
    IdField: string;
    ModifiedAtField: string;
}
