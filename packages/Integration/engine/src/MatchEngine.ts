import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationFieldMap, ICompanyIntegrationEntityMap } from './entity-types.js';
import type { MappedRecord, ConflictResolution } from './types.js';

/**
 * Resolves mapped records against existing MJ data to determine
 * whether each record should be Created, Updated, Skipped, or Deleted.
 */
export class MatchEngine {
    /**
     * Resolves change types for a batch of mapped records by checking for existing
     * MJ records via key field matching and record map lookups.
     *
     * @param records - Mapped records with preliminary change types
     * @param entityMap - The entity map configuration for this object
     * @param fieldMaps - Active field maps for identifying key fields
     * @param contextUser - User context for data access
     * @returns Updated mapped records with resolved ChangeType and MatchedMJRecordID
     */
    public async Resolve(
        records: MappedRecord[],
        entityMap: ICompanyIntegrationEntityMap,
        fieldMaps: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo
    ): Promise<MappedRecord[]> {
        const keyFields = fieldMaps.filter(fm => fm.IsKeyField && fm.Status === 'Active');
        const conflictResolution = entityMap.ConflictResolution as ConflictResolution;

        const results: MappedRecord[] = [];
        for (const record of records) {
            const resolved = await this.ResolveSingleRecord(
                record,
                entityMap,
                keyFields,
                conflictResolution,
                contextUser
            );
            results.push(resolved);
        }
        return results;
    }

    /**
     * Resolves a single record by checking for an existing MJ match.
     */
    private async ResolveSingleRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        keyFields: ICompanyIntegrationFieldMap[],
        conflictResolution: ConflictResolution,
        contextUser: UserInfo
    ): Promise<MappedRecord> {
        if (record.ExternalRecord.IsDeleted) {
            return this.ResolveDeletedRecord(record, entityMap, contextUser);
        }

        const existingID = await this.FindExistingRecord(
            record, entityMap, keyFields, contextUser
        );

        if (existingID) {
            return this.ResolveExistingRecord(record, existingID, conflictResolution);
        }

        return { ...record, ChangeType: 'Create' };
    }

    /**
     * Handles records marked as deleted in the external system.
     */
    private async ResolveDeletedRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<MappedRecord> {
        const existingID = await this.FindRecordMapEntry(
            entityMap.CompanyIntegrationID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            contextUser
        );

        if (existingID) {
            return { ...record, ChangeType: 'Delete', MatchedMJRecordID: existingID };
        }

        return { ...record, ChangeType: 'Skip' };
    }

    /**
     * Determines change type for a record that matches an existing MJ record.
     */
    private ResolveExistingRecord(
        record: MappedRecord,
        existingID: string,
        conflictResolution: ConflictResolution
    ): MappedRecord {
        if (conflictResolution === 'Manual') {
            return { ...record, ChangeType: 'Skip', MatchedMJRecordID: existingID };
        }
        return { ...record, ChangeType: 'Update', MatchedMJRecordID: existingID };
    }

    /**
     * Attempts to find an existing MJ record by key field matching, then falls back
     * to the CompanyIntegrationRecordMap.
     */
    private async FindExistingRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo
    ): Promise<string | null> {
        if (keyFields.length > 0) {
            const idByKeys = await this.FindByKeyFields(record, keyFields, contextUser);
            if (idByKeys) return idByKeys;
        }

        return this.FindRecordMapEntry(
            entityMap.CompanyIntegrationID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            contextUser
        );
    }

    /**
     * Searches for an existing MJ record using key field values.
     * Returns the value of the entity's primary key field (natural PK from source system).
     */
    private async FindByKeyFields(
        record: MappedRecord,
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo
    ): Promise<string | null> {
        const filterClauses = this.BuildKeyFieldFilter(record, keyFields);
        if (filterClauses.length === 0) return null;

        // Look up the entity's PK field name from metadata
        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.Name === record.MJEntityName);
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name ?? 'ID';

        const rv = new RunView();
        const result = await rv.RunView<Record<string, string>>({
            EntityName: record.MJEntityName,
            ExtraFilter: filterClauses.join(' AND '),
            Fields: [pkFieldName],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;
        return result.Results[0][pkFieldName];
    }

    /**
     * Builds a SQL filter clause from key field values on a mapped record.
     */
    private BuildKeyFieldFilter(
        record: MappedRecord,
        keyFields: ICompanyIntegrationFieldMap[]
    ): string[] {
        const clauses: string[] = [];
        for (const kf of keyFields) {
            const value = record.MappedFields[kf.DestinationFieldName];
            if (value == null) continue;
            const escaped = String(value).replace(/'/g, "''");
            clauses.push(`[${kf.DestinationFieldName}] = '${escaped}'`);
        }
        return clauses;
    }

    /**
     * Checks the CompanyIntegrationRecordMap for a previous external↔MJ mapping.
     */
    private async FindRecordMapEntry(
        companyIntegrationID: string,
        externalID: string,
        entityID: string,
        contextUser: UserInfo
    ): Promise<string | null> {
        const rv = new RunView();
        const escapedExternalID = externalID.replace(/'/g, "''");
        const result = await rv.RunView<{ EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegrationID}' ` +
                `AND ExternalSystemRecordID='${escapedExternalID}' ` +
                `AND EntityID='${entityID}'`,
            Fields: ['EntityRecordID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;
        return result.Results[0].EntityRecordID;
    }
}
