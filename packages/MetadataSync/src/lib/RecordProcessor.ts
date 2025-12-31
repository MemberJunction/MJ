import { BaseEntity, RunView, UserInfo, EntityInfo } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { EntityConfig } from '../config';
import { JsonWriteHelper } from './json-write-helper';
import { EntityPropertyExtractor } from './EntityPropertyExtractor';
import { FieldExternalizer } from './FieldExternalizer';
import { RelatedEntityHandler } from './RelatedEntityHandler';
import { METADATA_KEYWORDS, createKeywordReference } from '../constants/metadata-keywords';

/**
 * Handles the core processing of individual record data into the sync format
 */
export class RecordProcessor {
  private propertyExtractor: EntityPropertyExtractor;
  private fieldExternalizer: FieldExternalizer;
  private relatedEntityHandler: RelatedEntityHandler;

  constructor(
    private syncEngine: SyncEngine,
    private contextUser: UserInfo
  ) {
    this.propertyExtractor = new EntityPropertyExtractor();
    this.fieldExternalizer = new FieldExternalizer();
    this.relatedEntityHandler = new RelatedEntityHandler(syncEngine, contextUser);
  }

  /**
   * Processes a record into the standardized RecordData format
   */
  async processRecord(
    record: BaseEntity, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: EntityConfig,
    verbose?: boolean,
    isNewRecord: boolean = true,
    existingRecordData?: RecordData,
    currentDepth: number = 0,
    ancestryPath: Set<string> = new Set(),
    fieldOverrides?: Record<string, any>
  ): Promise<RecordData> {
    // Extract all properties from the entity
    const allProperties = this.propertyExtractor.extractAllProperties(record, fieldOverrides);
    
    // Process fields and related entities
    const { fields, relatedEntities } = await this.processEntityData(
      allProperties,
      record,
      primaryKey,
      targetDir,
      entityConfig,
      existingRecordData,
      currentDepth,
      ancestryPath,
      verbose
    );
    
    // Calculate checksum and sync metadata
    const syncData = await this.calculateSyncMetadata(
      fields, 
      targetDir, 
      entityConfig, 
      existingRecordData, 
      verbose
    );
    
    // Build the final record data with proper ordering
    return JsonWriteHelper.createOrderedRecordData(
      fields,
      relatedEntities,
      primaryKey,
      syncData
    );
  }

  /**
   * Processes entity data into fields and related entities
   */
  private async processEntityData(
    allProperties: Record<string, any>,
    record: BaseEntity,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<{ fields: Record<string, any>; relatedEntities: Record<string, RecordData[]> }> {
    const fields: Record<string, any> = {};
    const relatedEntities: Record<string, RecordData[]> = {};
    
    // Process individual fields
    await this.processFields(
      allProperties, 
      primaryKey, 
      targetDir, 
      entityConfig, 
      existingRecordData, 
      fields, 
      verbose
    );
    
    // Process related entities if configured
    await this.processRelatedEntities(
      record, 
      entityConfig, 
      existingRecordData, 
      currentDepth, 
      ancestryPath, 
      relatedEntities, 
      verbose
    );
    
    return { fields, relatedEntities };
  }

  /**
   * Processes individual fields from the entity
   */
  private async processFields(
    allProperties: Record<string, any>,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    fields: Record<string, any>,
    verbose?: boolean
  ): Promise<void> {
    const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
    
    for (const [fieldName, fieldValue] of Object.entries(allProperties)) {
      if (this.shouldSkipField(fieldName, fieldValue, primaryKey, entityConfig, entityInfo)) {
        continue;
      }
      
      let processedValue = await this.processFieldValue(
        fieldName,
        fieldValue,
        allProperties,
        targetDir,
        entityConfig,
        existingRecordData,
        verbose
      );
      
      fields[fieldName] = processedValue;
    }
  }

  /**
   * Determines if a field should be skipped during processing
   */
  private shouldSkipField(
    fieldName: string,
    fieldValue: any,
    primaryKey: Record<string, any>,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo | null
  ): boolean {
    // Skip primary key fields
    if (primaryKey[fieldName] !== undefined) {
      return true;
    }
    
    // Skip internal fields
    if (fieldName.startsWith('__mj_')) {
      return true;
    }
    
    // Skip excluded fields
    if (entityConfig.pull?.excludeFields?.includes(fieldName)) {
      return true;
    }
    
    // Skip virtual fields if configured
    if (this.shouldSkipVirtualField(fieldName, entityConfig, entityInfo)) {
      return true;
    }
    
    // Skip null fields if configured
    if (entityConfig.pull?.ignoreNullFields && fieldValue === null) {
      return true;
    }
    
    return false;
  }

  /**
   * Checks if a virtual field should be skipped
   */
  private shouldSkipVirtualField(
    fieldName: string,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo | null
  ): boolean {
    if (!entityConfig.pull?.ignoreVirtualFields || !entityInfo) {
      return false;
    }
    
    const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
    return fieldInfo?.IsVirtual === true;
  }

  /**
   * Processes a single field value through various transformations
   */
  private async processFieldValue(
    fieldName: string,
    fieldValue: any,
    allProperties: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<any> {
    let processedValue = fieldValue;

    // Convert Date objects to ISO strings
    processedValue = this.serializeDateValue(processedValue);

    // Apply lookup field conversion if configured
    processedValue = await this.applyLookupFieldConversion(
      fieldName,
      processedValue,
      entityConfig,
      verbose
    );

    // Trim string values
    processedValue = this.trimStringValue(processedValue);

    // Apply field externalization if configured
    processedValue = await this.applyFieldExternalization(
      fieldName,
      processedValue,
      allProperties,
      targetDir,
      entityConfig,
      existingRecordData,
      verbose
    );

    return processedValue;
  }

  /**
   * Serializes Date objects to ISO strings for JSON storage
   */
  private serializeDateValue(value: any): any {
    if (value instanceof Date) {
      // Check if the date is valid
      if (isNaN(value.getTime())) {
        return null; // Invalid dates become null
      }
      return value.toISOString();
    }
    return value;
  }

  /**
   * Applies lookup field conversion if configured
   */
  private async applyLookupFieldConversion(
    fieldName: string,
    fieldValue: any,
    entityConfig: EntityConfig,
    verbose?: boolean
  ): Promise<any> {
    const lookupConfig = entityConfig.pull?.lookupFields?.[fieldName];
    if (!lookupConfig || fieldValue == null) {
      return fieldValue;
    }
    
    try {
      return await this.convertGuidToLookup(String(fieldValue), lookupConfig, verbose);
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to convert ${fieldName} to lookup: ${error}`);
      }
      return fieldValue; // Keep original value if lookup fails
    }
  }

  /**
   * Trims string values to remove whitespace
   */
  private trimStringValue(value: any): any {
    return typeof value === 'string' ? value.trim() : value;
  }

  /**
   * Applies field externalization if configured
   */
  private async applyFieldExternalization(
    fieldName: string,
    fieldValue: any,
    allProperties: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<any> {
    if (!entityConfig.pull?.externalizeFields || fieldValue == null) {
      return fieldValue;
    }
    
    const externalizePattern = this.getExternalizationPattern(fieldName, entityConfig);
    if (!externalizePattern) {
      return fieldValue;
    }
    
    try {
      const existingFileReference = existingRecordData?.fields?.[fieldName];
      const recordData = this.createRecordDataForExternalization(allProperties);
      
      return await this.fieldExternalizer.externalizeField(
        fieldName,
        fieldValue,
        externalizePattern,
        recordData,
        targetDir,
        existingFileReference,
        entityConfig.pull?.mergeStrategy || 'merge',
        verbose
      );
    } catch (error) {
      if (verbose) {
        console.warn(`Failed to externalize field ${fieldName}: ${error}`);
      }
      return fieldValue; // Keep original value if externalization fails
    }
  }

  /**
   * Gets the externalization pattern for a field
   */
  private getExternalizationPattern(fieldName: string, entityConfig: EntityConfig): string | null {
    const externalizeConfig = entityConfig.pull?.externalizeFields;
    if (!externalizeConfig) return null;
    
    if (Array.isArray(externalizeConfig)) {
      return this.getArrayExternalizationPattern(fieldName, externalizeConfig);
    } else {
      return this.getObjectExternalizationPattern(fieldName, externalizeConfig);
    }
  }

  /**
   * Gets externalization pattern from array configuration
   */
  private getArrayExternalizationPattern(
    fieldName: string, 
    externalizeConfig: any[]
  ): string | null {
    if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
      // Simple string array format
      if ((externalizeConfig as string[]).includes(fieldName)) {
        return createKeywordReference('file', `{Name}.${fieldName.toLowerCase()}.md`);
      }
    } else {
      // Array of objects format
      const fieldConfig = (externalizeConfig as Array<{field: string; pattern: string}>)
        .find(config => config.field === fieldName);
      if (fieldConfig) {
        return fieldConfig.pattern;
      }
    }
    return null;
  }

  /**
   * Gets externalization pattern from object configuration
   */
  private getObjectExternalizationPattern(
    fieldName: string, 
    externalizeConfig: Record<string, any>
  ): string | null {
    const fieldConfig = externalizeConfig[fieldName];
    if (fieldConfig) {
      const extension = fieldConfig.extension || '.md';
      return createKeywordReference('file', `{Name}.${fieldName.toLowerCase()}${extension}`);
    }
    return null;
  }

  /**
   * Creates a BaseEntity-like object for externalization processing
   */
  private createRecordDataForExternalization(allProperties: Record<string, any>): BaseEntity {
    return allProperties as any as BaseEntity;
  }

  /**
   * Processes related entities for the record
   */
  private async processRelatedEntities(
    record: BaseEntity,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    currentDepth: number,
    ancestryPath: Set<string>,
    relatedEntities: Record<string, RecordData[]>,
    verbose?: boolean
  ): Promise<void> {
    if (!entityConfig.pull?.relatedEntities) {
      return;
    }
    
    for (const [relationKey, relationConfig] of Object.entries(entityConfig.pull.relatedEntities)) {
      try {
        const existingRelated = existingRecordData?.relatedEntities?.[relationKey] || [];
        
        const relatedRecords = await this.relatedEntityHandler.loadRelatedEntities(
          record,
          relationConfig,
          entityConfig,
          existingRelated,
          this.processRecord.bind(this), // Pass bound method reference
          currentDepth,
          ancestryPath,
          verbose
        );
        
        if (relatedRecords.length > 0) {
          relatedEntities[relationKey] = relatedRecords;
        }
      } catch (error) {
        if (verbose) {
          console.warn(`Failed to load related entities for ${relationKey}: ${error}`);
        }
      }
    }
  }

  /**
   * Calculates sync metadata including checksum and last modified timestamp
   */
  private async calculateSyncMetadata(
    fields: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    existingRecordData: RecordData | undefined,
    verbose?: boolean
  ): Promise<{ lastModified: string; checksum: string }> {
    // Determine if we should include external file content in checksum
    const hasExternalizedFields = this.hasExternalizedFields(fields, entityConfig);

    const checksum = hasExternalizedFields
      ? await this.syncEngine.calculateChecksumWithFileContent(fields, targetDir)
      : this.syncEngine.calculateChecksum(fields);

    if (verbose && hasExternalizedFields) {
      console.log(`Calculated checksum including external file content for record`);
    }

    // Compare with existing checksum to determine if data changed
    const existingChecksum = existingRecordData?.sync?.checksum;
    const existingTimestamp = existingRecordData?.sync?.lastModified;

    if (existingChecksum === checksum) {
      // No change detected - preserve existing sync metadata
      if (verbose) {
        console.log(`No changes detected for record, preserving existing timestamp`);
      }
      return {
        lastModified: existingTimestamp!,
        checksum: checksum
      };
    } else {
      // Change detected - update timestamp
      const newTimestamp = new Date().toISOString();
      if (verbose) {
        if (existingChecksum) {
          console.log(`Changes detected for record, updating timestamp`);
        } else {
          console.log(`New record, generating initial timestamp`);
        }
      }
      return {
        lastModified: newTimestamp,
        checksum: checksum
      };
    }
  }

  /**
   * Checks if the record has externalized fields
   */
  private hasExternalizedFields(fields: Record<string, any>, entityConfig: EntityConfig): boolean {
    return !!entityConfig.pull?.externalizeFields &&
           Object.values(fields).some(value =>
             typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.FILE)
           );
  }

  /**
   * Convert a GUID value to @lookup syntax by looking up the human-readable value
   */
  private async convertGuidToLookup(
    guidValue: string,
    lookupConfig: { entity: string; field: string },
    verbose?: boolean
  ): Promise<string> {
    if (!guidValue || typeof guidValue !== 'string') {
      return guidValue;
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: lookupConfig.entity,
        ExtraFilter: `ID = '${guidValue}'`,
        ResultType: 'entity_object'
      }, this.contextUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        const targetRecord = result.Results[0];
        const lookupValue = targetRecord[lookupConfig.field];
        
        if (lookupValue != null) {
          return createKeywordReference('lookup', `${lookupConfig.entity}.${lookupConfig.field}=${lookupValue}`);
        }
      }

      if (verbose) {
        console.warn(`Lookup failed for ${guidValue} in ${lookupConfig.entity}.${lookupConfig.field}`);
      }
      
      return guidValue; // Return original GUID if lookup fails
    } catch (error) {
      if (verbose) {
        console.warn(`Error during lookup conversion: ${error}`);
      }
      return guidValue;
    }
  }
}