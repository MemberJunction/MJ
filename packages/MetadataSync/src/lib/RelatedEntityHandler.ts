import { BaseEntity, RunView, UserInfo } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { RelatedEntityConfig, EntityConfig } from '../config';

/**
 * Handles loading and processing of related entities for records
 */
export class RelatedEntityHandler {
  constructor(
    private syncEngine: SyncEngine,
    private contextUser: UserInfo
  ) {}

  /**
   * Load related entities for a record
   */
  async loadRelatedEntities(
    parentRecord: BaseEntity,
    relationConfig: RelatedEntityConfig,
    parentEntityConfig: EntityConfig,
    existingRelatedEntities: RecordData[],
    processRecordData: (
      record: BaseEntity,
      primaryKey: Record<string, any>,
      targetDir: string,
      entityConfig: EntityConfig,
      verbose?: boolean,
      isNewRecord?: boolean,
      existingRecordData?: RecordData,
      currentDepth?: number,
      ancestryPath?: Set<string>,
      fieldOverrides?: Record<string, any>
    ) => Promise<RecordData>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<RecordData[]> {
    try {
      const parentPrimaryKey = this.getRecordPrimaryKey(parentRecord);
      if (!parentPrimaryKey) {
        this.logWarning('Unable to determine primary key for parent record', verbose);
        return [];
      }

      const relatedRecords = await this.queryRelatedEntities(
        parentPrimaryKey, 
        relationConfig, 
        verbose
      );

      if (!relatedRecords) {
        return [];
      }

      const relatedEntityConfig = this.createRelatedEntityConfig(relationConfig, parentEntityConfig);
      
      return await this.processRelatedRecords(
        relatedRecords,
        relationConfig,
        relatedEntityConfig,
        existingRelatedEntities,
        processRecordData,
        currentDepth,
        ancestryPath,
        verbose
      );
    } catch (error) {
      this.logError(`Error loading related entities for ${relationConfig.entity}`, error, verbose);
      return [];
    }
  }

  /**
   * Queries the database for related entities
   */
  private async queryRelatedEntities(
    parentPrimaryKey: string,
    relationConfig: RelatedEntityConfig,
    verbose?: boolean
  ): Promise<BaseEntity[] | null> {
    const filter = this.buildRelatedEntityFilter(parentPrimaryKey, relationConfig);
    
    if (verbose) {
      console.log(`Loading related entities: ${relationConfig.entity} with filter: ${filter}`);
    }

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: relationConfig.entity,
      ExtraFilter: filter,
      ResultType: 'entity_object'
    }, this.contextUser);

    if (!result.Success) {
      this.logWarning(`Failed to load related entities ${relationConfig.entity}: ${result.ErrorMessage}`, verbose);
      return null;
    }

    if (verbose) {
      console.log(`Found ${result.Results.length} related records for ${relationConfig.entity}`);
    }

    return result.Results;
  }

  /**
   * Builds the filter for querying related entities
   */
  private buildRelatedEntityFilter(parentPrimaryKey: string, relationConfig: RelatedEntityConfig): string {
    let filter = `${relationConfig.foreignKey} = '${parentPrimaryKey}'`;
    if (relationConfig.filter) {
      filter += ` AND (${relationConfig.filter})`;
    }
    return filter;
  }

  /**
   * Creates entity config for related entity processing
   */
  private createRelatedEntityConfig(
    relationConfig: RelatedEntityConfig, 
    parentEntityConfig: EntityConfig
  ): EntityConfig {
    return {
      entity: relationConfig.entity,
      pull: {
        excludeFields: relationConfig.excludeFields || [],
        lookupFields: relationConfig.lookupFields || {},
        externalizeFields: relationConfig.externalizeFields || [],
        relatedEntities: relationConfig.relatedEntities || {},
        ignoreVirtualFields: parentEntityConfig.pull?.ignoreVirtualFields || false,
        ignoreNullFields: parentEntityConfig.pull?.ignoreNullFields || false
      }
    };
  }

  /**
   * Processes all related records (both existing and new)
   */
  private async processRelatedRecords(
    dbRecords: BaseEntity[],
    relationConfig: RelatedEntityConfig,
    relatedEntityConfig: EntityConfig,
    existingRelatedEntities: RecordData[],
    processRecordData: Function,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<RecordData[]> {
    const dbRecordMap = this.buildDatabaseRecordMap(dbRecords);
    const relatedRecords: RecordData[] = [];
    const processedIds = new Set<string>();

    // Process existing related entities first (preserving order)
    await this.processExistingRelatedEntities(
      existingRelatedEntities,
      dbRecordMap,
      relationConfig,
      relatedEntityConfig,
      processRecordData,
      currentDepth,
      ancestryPath,
      relatedRecords,
      processedIds,
      verbose
    );

    // Process new related entities (append to end)
    await this.processNewRelatedEntities(
      dbRecords,
      relationConfig,
      relatedEntityConfig,
      processRecordData,
      currentDepth,
      ancestryPath,
      relatedRecords,
      processedIds,
      verbose
    );

    return relatedRecords;
  }

  /**
   * Builds a map of database records by primary key for efficient lookup
   */
  private buildDatabaseRecordMap(dbRecords: BaseEntity[]): Map<string, BaseEntity> {
    const dbRecordMap = new Map<string, BaseEntity>();
    
    for (const relatedRecord of dbRecords) {
      const relatedPrimaryKey = this.getRecordPrimaryKey(relatedRecord);
      if (relatedPrimaryKey) {
        dbRecordMap.set(relatedPrimaryKey, relatedRecord);
      }
    }
    
    return dbRecordMap;
  }

  /**
   * Processes existing related entities
   */
  private async processExistingRelatedEntities(
    existingRelatedEntities: RecordData[],
    dbRecordMap: Map<string, BaseEntity>,
    relationConfig: RelatedEntityConfig,
    relatedEntityConfig: EntityConfig,
    processRecordData: Function,
    currentDepth: number,
    ancestryPath: Set<string>,
    relatedRecords: RecordData[],
    processedIds: Set<string>,
    verbose?: boolean
  ): Promise<void> {
    for (const existingRelatedEntity of existingRelatedEntities) {
      const existingPrimaryKey = existingRelatedEntity.primaryKey?.ID;
      if (!existingPrimaryKey) {
        this.logWarning('Existing related entity missing primary key, skipping', verbose);
        continue;
      }

      const dbRecord = dbRecordMap.get(existingPrimaryKey);
      if (!dbRecord) {
        if (verbose) {
          console.log(`Related entity ${existingPrimaryKey} no longer exists in database, removing from results`);
        }
        continue; // Skip deleted records
      }

      const recordData = await this.processExistingRelatedEntity(
        dbRecord,
        existingPrimaryKey,
        relationConfig,
        relatedEntityConfig,
        processRecordData,
        existingRelatedEntity,
        currentDepth,
        ancestryPath,
        verbose
      );

      if (recordData) {
        relatedRecords.push(recordData);
        processedIds.add(existingPrimaryKey);
      }
    }
  }

  /**
   * Processes a single existing related entity
   */
  private async processExistingRelatedEntity(
    dbRecord: BaseEntity,
    existingPrimaryKey: string,
    relationConfig: RelatedEntityConfig,
    relatedEntityConfig: EntityConfig,
    processRecordData: Function,
    existingRelatedEntity: RecordData,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<RecordData | null> {
    const relatedRecordPrimaryKey = this.buildPrimaryKeyForRecord(
      existingPrimaryKey, 
      dbRecord, 
      relationConfig.entity
    );

    const fieldOverrides = this.createFieldOverrides(dbRecord, relationConfig);
    if (!fieldOverrides) {
      return null;
    }

    return await processRecordData(
      dbRecord,
      relatedRecordPrimaryKey,
      '', // targetDir not needed for related entities
      relatedEntityConfig,
      verbose,
      false, // isNewRecord = false for existing records
      existingRelatedEntity, // Pass existing data for change detection
      currentDepth + 1,
      ancestryPath,
      fieldOverrides // Pass the field override for @parent:ID
    );
  }

  /**
   * Processes new related entities
   */
  private async processNewRelatedEntities(
    dbRecords: BaseEntity[],
    relationConfig: RelatedEntityConfig,
    relatedEntityConfig: EntityConfig,
    processRecordData: Function,
    currentDepth: number,
    ancestryPath: Set<string>,
    relatedRecords: RecordData[],
    processedIds: Set<string>,
    verbose?: boolean
  ): Promise<void> {
    for (const relatedRecord of dbRecords) {
      const relatedPrimaryKey = this.getRecordPrimaryKey(relatedRecord);
      if (!relatedPrimaryKey || processedIds.has(relatedPrimaryKey)) {
        continue; // Skip already processed records
      }

      const recordData = await this.processNewRelatedEntity(
        relatedRecord,
        relatedPrimaryKey,
        relationConfig,
        relatedEntityConfig,
        processRecordData,
        currentDepth,
        ancestryPath,
        verbose
      );

      if (recordData) {
        relatedRecords.push(recordData);
        processedIds.add(relatedPrimaryKey);
      }
    }
  }

  /**
   * Processes a single new related entity
   */
  private async processNewRelatedEntity(
    relatedRecord: BaseEntity,
    relatedPrimaryKey: string,
    relationConfig: RelatedEntityConfig,
    relatedEntityConfig: EntityConfig,
    processRecordData: Function,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<RecordData | null> {
    const relatedRecordPrimaryKey = this.buildPrimaryKeyForRecord(
      relatedPrimaryKey, 
      relatedRecord, 
      relationConfig.entity
    );

    const fieldOverrides = this.createFieldOverrides(relatedRecord, relationConfig);
    if (!fieldOverrides) {
      return null;
    }

    return await processRecordData(
      relatedRecord,
      relatedRecordPrimaryKey,
      '', // targetDir not needed for related entities
      relatedEntityConfig,
      verbose,
      true, // isNewRecord = true for new records
      undefined, // No existing data for new records
      currentDepth + 1,
      ancestryPath,
      fieldOverrides // Pass the field override for @parent:ID
    );
  }

  /**
   * Creates field overrides for @parent:ID replacement
   */
  private createFieldOverrides(record: BaseEntity, relationConfig: RelatedEntityConfig): Record<string, any> | null {
    if (typeof record.GetAll === 'function') {
      const data = record.GetAll();
      if (data[relationConfig.foreignKey] !== undefined) {
        return { [relationConfig.foreignKey]: '@parent:ID' };
      }
    } else {
      if ((record as any)[relationConfig.foreignKey] !== undefined) {
        return { [relationConfig.foreignKey]: '@parent:ID' };
      }
    }
    return null;
  }

  /**
   * Builds primary key for a record
   */
  private buildPrimaryKeyForRecord(
    primaryKeyValue: string, 
    record: BaseEntity, 
    entityName: string
  ): Record<string, any> {
    const relatedRecordPrimaryKey: Record<string, any> = {};
    const entityInfo = this.syncEngine.getEntityInfo(entityName);
    
    for (const pk of entityInfo?.PrimaryKeys || []) {
      if (pk.Name === 'ID') {
        relatedRecordPrimaryKey[pk.Name] = primaryKeyValue;
      } else {
        // For compound keys, get the value from the related record
        relatedRecordPrimaryKey[pk.Name] = this.getFieldValue(record, pk.Name);
      }
    }
    
    return relatedRecordPrimaryKey;
  }

  /**
   * Get the primary key value from a record
   */
  private getRecordPrimaryKey(record: BaseEntity): string | null {
    if (!record) return null;
    
    // Try to get ID directly
    if ((record as any).ID) return (record as any).ID;
    
    // Try to get from GetAll() method if it's an entity object
    if (typeof record.GetAll === 'function') {
      const data = record.GetAll();
      if (data.ID) return data.ID;
    }
    
    // Try common variations
    if ((record as any).id) return (record as any).id;
    if ((record as any).Id) return (record as any).Id;
    
    return null;
  }

  /**
   * Get a field value from a record, handling both entity objects and plain objects
   */
  private getFieldValue(record: BaseEntity, fieldName: string): any {
    if (!record) return null;
    
    // Try to get field directly using bracket notation with type assertion
    if ((record as any)[fieldName] !== undefined) return (record as any)[fieldName];
    
    // Try to get from GetAll() method if it's an entity object
    if (typeof record.GetAll === 'function') {
      const data = record.GetAll();
      if (data[fieldName] !== undefined) return data[fieldName];
    }
    
    return null;
  }

  /**
   * Log warning message if verbose mode is enabled
   */
  private logWarning(message: string, verbose?: boolean): void {
    if (verbose) {
      console.warn(message);
    }
  }

  /**
   * Log error message if verbose mode is enabled
   */
  private logError(message: string, error: any, verbose?: boolean): void {
    if (verbose) {
      console.error(`${message}: ${error}`);
    }
  }
}