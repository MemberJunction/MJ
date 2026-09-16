import { BaseEntity, CompositeKey, EntityInfo, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ordinalCompare, UUIDsEqual } from '@memberjunction/global';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { EntityConfig } from '../config';
import { JsonWriteHelper } from './json-write-helper';
import { EntityPropertyExtractor } from './EntityPropertyExtractor';
import { FieldExternalizer } from './FieldExternalizer';
import { RelatedEntityHandler } from './RelatedEntityHandler';
import { METADATA_KEYWORDS, createKeywordReference } from '../constants/metadata-keywords';
import { RelatedEntityConfig } from '../config';

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
   * Batch pre-fetch related entities for a set of parent records.
   * Public facade so callers don't need direct access to relatedEntityHandler.
   */
  async batchPrefetchRelatedEntities(
    parentPrimaryKeys: string[],
    relationConfig: RelatedEntityConfig,
    verbose?: boolean
  ): Promise<Map<string, BaseEntity[]>> {
    return this.relatedEntityHandler.batchQueryRelatedEntities(parentPrimaryKeys, relationConfig, verbose);
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
    fieldOverrides?: Record<string, any>,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<RecordData> {
    // Extract all properties from the entity
    const allProperties = this.propertyExtractor.extractAllProperties(record, fieldOverrides);

    // Process fields, collections, embeds, extension, and related entities (§6)
    const { fields, collections, embeds, extension, relatedEntities } = await this.processEntityData(
      allProperties,
      record,
      primaryKey,
      targetDir,
      entityConfig,
      existingRecordData,
      currentDepth,
      ancestryPath,
      verbose,
      batchedRelatedData
    );
    
    // Calculate checksum and sync metadata
    const syncData = await this.calculateSyncMetadata(
      fields, 
      targetDir, 
      entityConfig, 
      existingRecordData, 
      verbose,
      collections,
      embeds,
      extension
    );
    
    // Build the final record data with proper ordering
    return JsonWriteHelper.createOrderedRecordData(
      fields,
      relatedEntities,
      primaryKey,
      syncData,
      collections,
      embeds,
      extension
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
    verbose?: boolean,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<{
    fields: Record<string, any>;
    collections?: Record<string, RecordData[]>;
    embeds?: Record<string, RecordData>;
    extension?: RecordData['extension'];
    relatedEntities: Record<string, RecordData[]>;
  }> {
    const fields: Record<string, any> = {};
    const collections: Record<string, RecordData[]> = {};
    const embeds: Record<string, RecordData> = {};
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

    // Process collections if declared (§6)
    await this.processCollections(
      record,
      targetDir,
      entityConfig,
      collections,
      currentDepth,
      ancestryPath,
      verbose
    );

    // Process extension if present (§6)
    const extension = await this.processExtension(
      record,
      primaryKey,
      targetDir,
      entityConfig,
      verbose
    );

    // Process embeds if present (§6)
    await this.processEmbeds(
      record,
      targetDir,
      entityConfig,
      embeds,
      currentDepth,
      ancestryPath,
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
      verbose,
      batchedRelatedData
    );

    return {
      fields,
      ...(Object.keys(collections).length > 0 ? { collections } : {}),
      ...(Object.keys(embeds).length > 0 ? { embeds } : {}),
      ...(extension ? { extension } : {}),
      relatedEntities,
    };
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
    verbose?: boolean,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<void> {
    if (!entityConfig.pull?.relatedEntities) {
      return;
    }

    for (const [relationKey, relationConfig] of Object.entries(entityConfig.pull.relatedEntities)) {
      try {
        const existingRelated = existingRecordData?.relatedEntities?.[relationKey] || [];

        let relatedRecords: RecordData[];

        if (batchedRelatedData && batchedRelatedData.has(relationKey)) {
          // Use pre-fetched batch data — avoids per-parent queries
          relatedRecords = await this.relatedEntityHandler.loadRelatedEntitiesFromBatch(
            record,
            relationConfig,
            entityConfig,
            existingRelated,
            this.processRecord.bind(this),
            currentDepth,
            ancestryPath,
            batchedRelatedData.get(relationKey)!,
            verbose
          );
        } else {
          // Fall back to per-record loading (original behavior)
          relatedRecords = await this.relatedEntityHandler.loadRelatedEntities(
            record,
            relationConfig,
            entityConfig,
            existingRelated,
            this.processRecord.bind(this),
            currentDepth,
            ancestryPath,
            verbose
          );
        }

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
    verbose?: boolean,
    collections?: Record<string, RecordData[]>,
    embeds?: Record<string, RecordData>,
    extension?: RecordData['extension']
  ): Promise<{ lastModified: string; checksum: string }> {
    // Determine if we should include external file content in checksum
    const hasExternalizedFields = this.hasExternalizedFields(fields, entityConfig);

    const checksumPayload: Record<string, unknown> = {
      fields,
      ...(collections && Object.keys(collections).length > 0 ? { collections } : {}),
      ...(embeds && Object.keys(embeds).length > 0 ? { embeds } : {}),
      ...(extension && Object.keys(extension).length > 0 ? { extension } : {}),
    };

    const checksum = hasExternalizedFields
      ? await this.syncEngine.calculateChecksumWithFileContent(checksumPayload, targetDir)
      : this.syncEngine.calculateChecksum(checksumPayload);

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
   * Processes first-class collections on pull (§6)
   */
  private async processCollections(
    record: BaseEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    collections: Record<string, RecordData[]>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<void> {
    if (!record.EntityInfo?.RelatedEntities) return;

    for (const rel of record.EntityInfo.RelatedEntities) {
      if (!rel.RelatedRecordCollection) continue;

      let colName = rel.RelatedEntity;
      try {
        const parsed = JSON.parse(rel.RelatedRecordCollection);
        if (parsed.Name) colName = parsed.Name;
      } catch {}

      // Look up companion on record
      let companion = record.GetCompanion(colName);
      if (!companion) {
        const entityRecord = record as unknown as Record<string, unknown>;
        if (entityRecord[colName] && typeof (entityRecord[colName] as { Items?: BaseEntity[] }).Items !== 'undefined') {
          companion = entityRecord[colName] as unknown as typeof companion;
        }
      }

      if (!companion) continue;

      const col = companion as unknown as {
        LoadMode: string;
        IsLoaded: boolean;
        Items: BaseEntity[];
        Load: () => Promise<void>;
      };

      // Rider 4 / §6: Load: 'never' collection must be skipped with a stated reason on pull, never emitted as []
      if (col.LoadMode === 'never') {
        console.log(`Skipping Load: 'never' collection '${colName}' on ${record.EntityInfo.Name}`);
        continue;
      }

      if (!col.IsLoaded) {
        try {
          await col.Load();
        } catch (loadErr) {
          console.warn(`Failed to load collection '${colName}' on ${record.EntityInfo.Name}: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`);
          continue;
        }
      }

      const rawItems = col.Items ?? [];
      if (rawItems.length > 0) {
        collections[colName] = [];
        const childEntityInfo = rawItems[0].EntityInfo;
        const childConfig: EntityConfig = {
          entity: childEntityInfo.Name,
        };

        // Deterministically sort collection items by primary key(s)
        const items = [...rawItems].sort((a, b) => {
          for (const pk of childEntityInfo.PrimaryKeys) {
            const aVal = String(a.Get(pk.Name) ?? '');
            const bVal = String(b.Get(pk.Name) ?? '');
            const cmp = ordinalCompare(aVal, bVal);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });

        for (const child of items) {
          const childPK: Record<string, unknown> = {};
          for (const pk of childEntityInfo.PrimaryKeys) {
            childPK[pk.Name] = child.Get(pk.Name);
          }

          const childData = await this.processRecord(
            child,
            childPK,
            targetDir,
            childConfig,
            verbose,
            false,
            undefined,
            currentDepth + 1,
            new Set([...(ancestryPath ?? []), `${record.EntityInfo.Name}:${JSON.stringify(record.PrimaryKey)}`])
          );
          collections[colName].push(childData);
        }
      }
    }
  }

  /**
   * Processes first-class extension on pull (§6)
   */
  private async processExtension(
    record: BaseEntity,
    primaryKey: Record<string, unknown>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean
  ): Promise<RecordData['extension'] | undefined> {
    const child = record.ISAChild;
    if (!child) return undefined;

    // Leaf fields only: fields present on child but NOT on parent
    const parentFieldNames = new Set(record.EntityInfo.Fields.map((f) => f.Name.toLowerCase()));
    const childProperties = this.propertyExtractor.extractAllProperties(child);
    const leafFields: Record<string, unknown> = {};

    for (const [fName, fVal] of Object.entries(childProperties)) {
      if (parentFieldNames.has(fName.toLowerCase())) continue;
      if (fName.startsWith('__mj_')) continue;
      if (primaryKey[fName] !== undefined) continue;
      leafFields[fName] = fVal;
    }

    // Determine if child type is ambiguous (more than one subtype exists in metadata)
    const provider = Metadata.Provider; // global-provider-ok: MetadataSync is a single-provider CLI process
    const childSubtypes = provider?.Entities
      ? provider.Entities.filter(
          (e) => UUIDsEqual(e.ParentID, record.EntityInfo.ID) || UUIDsEqual(e.ParentEntityInfo?.ID, record.EntityInfo.ID)
        )
      : [];
    const needsEntityName = childSubtypes.length > 1 || record.EntityInfo.AllowMultipleSubtypes;

    return {
      ...(needsEntityName ? { entity: child.EntityInfo.Name } : {}),
      fields: leafFields,
    };
  }

  /**
   * Processes first-class embeds on pull (§6)
   */
  private async processEmbeds(
    record: BaseEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    embeds: Record<string, RecordData>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<void> {
    for (const field of record.EntityInfo.Fields) {
      if (!field.RelatedEntity) continue;
      const objectPropName = `${field.Name}_Object`;
      const entityRecord = record as unknown as Record<string, unknown>;
      const embedded = entityRecord[objectPropName] as BaseEntity | undefined;

      if (embedded && typeof embedded.Get === 'function') {
        const embedProperties = this.propertyExtractor.extractAllProperties(embedded);
        const embedFields: Record<string, unknown> = {};
        const embedPK: Record<string, unknown> = {};
        for (const pk of embedded.EntityInfo.PrimaryKeys) {
          embedPK[pk.Name] = embedded.Get(pk.Name);
        }
        for (const [fName, fVal] of Object.entries(embedProperties)) {
          if (fName.startsWith('__mj_') || embedPK[fName] !== undefined) continue;
          embedFields[fName] = fVal;
        }

        embeds[field.Name] = {
          fields: embedFields,
          ...(Object.keys(embedPK).length > 0 ? { primaryKey: embedPK } : {}),
        };
      }
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
      // The lookup target is any entity — build the predicate from its real key column(s).
      const md = new Metadata(); // global-provider-ok: MetadataSync is a single-provider CLI process
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: lookupConfig.entity,
        ExtraFilter: CompositeKey.FromURLSegment(md.EntityByName(lookupConfig.entity), guidValue).ToWhereClause(),
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