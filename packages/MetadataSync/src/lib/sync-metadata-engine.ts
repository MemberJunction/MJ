import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, UserInfo, Metadata } from '@memberjunction/core';
import { IsUuidSQLType } from '@memberjunction/sql-dialect';
import fastGlob from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import { JsonPreprocessor } from './json-preprocessor';
import { loadEntityConfig } from '../config';
import { SyncEngine } from './sync-engine';

export class SyncMetadataEngine extends BaseEngine<SyncMetadataEngine> {
  private syncEngine: SyncEngine;
  private entityDirs: string[] = [];
  private preloadedEntityNames: Set<string> = new Set();
  private lookupCache: Map<string, string> = new Map();
  private fileDataCache: Map<string, { rawData: any; fileData: any }> = new Map();

  constructor() {
    super();
  }

  public initializeEngine(syncEngine: SyncEngine): void {
    this.syncEngine = syncEngine;
  }

  public setEntityDirs(dirs: string[]): void {
    this.entityDirs = dirs;
  }

  public getPropertyNameForEntity(entityName: string): string {
    return `cached_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /**
   * Orchestrates the dynamic configuration build and loading of existing records.
   * Leverages BaseEngine's built-in RunViews batching under the hood.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const configs = await this.buildDynamicConfigs();
    const providerToUse = provider || this.ProviderToUse;
    
    if (configs.length > 0) {
      await this.Load(configs, providerToUse, forceRefresh, contextUser);
    }
    return true;
  }

  /**
   * Overridden to bypass the default filters/orderby check.
   * During sync, we want to allow immediate mutations for our cached views
   * so they are updated in memory without hitting the database again.
   */
  protected override canUseImmediateMutation(config: BaseEnginePropertyConfig, skipAdditionalLoadingCheck: boolean = false): boolean {
    return true; 
  }

  public markEntityAsPreloaded(entityName: string): void {
    this.preloadedEntityNames.add(entityName);
  }

  public isEntityPreloaded(entityName: string): boolean {
    return this.preloadedEntityNames.has(entityName);
  }

  public getCachedEntities(entityName: string): BaseEntity[] {
    const propName = this.getPropertyNameForEntity(entityName);
    return (this as any)[propName] || [];
  }

  public getCachedFile(filePath: string): { rawData: any; fileData: any } | undefined {
    return this.fileDataCache.get(filePath);
  }

  public cacheFile(filePath: string, rawData: any, fileData: any): void {
    this.fileDataCache.set(filePath, { rawData, fileData });
  }

  public addEntityToCache(entityName: string, entity: BaseEntity): void {
    const propName = this.getPropertyNameForEntity(entityName);
    if (!(this as any)[propName]) {
      (this as any)[propName] = [];
    }
    const list = (this as any)[propName] as BaseEntity[];
    const index = list.findIndex(e => e === entity || e.PrimaryKey.Equals(entity.PrimaryKey));
    if (index >= 0) {
      list[index] = entity;
    } else {
      list.push(entity);
    }
  }

  public removeEntityFromCache(entityName: string, primaryKey: Record<string, any>): void {
    const propName = this.getPropertyNameForEntity(entityName);
    const list = (this as any)[propName] as BaseEntity[];
    if (list) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const pkStr = this.serializePrimaryKey(entityInfo, primaryKey);
        const index = list.findIndex(e => this.serializePrimaryKey(entityInfo, e.GetAll()) === pkStr);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
    }
    this.lookupCache.clear();
  }

  public getCachedLookup(key: string): string | undefined {
    return this.lookupCache.get(key);
  }

  public setCachedLookup(key: string, id: string): void {
    this.lookupCache.set(key, id);
  }

  public clearLookupCache(): void {
    this.lookupCache.clear();
  }

  public serializePrimaryKey(entityInfo: any, primaryKey: Record<string, any>): string {
    const parts = entityInfo.PrimaryKeys.map((pk: any) => {
      const val = primaryKey[pk.Name];
      let valStr = val !== undefined && val !== null ? String(val) : '';
      if (IsUuidSQLType(pk.Type) || pk.Type.trim().toLowerCase() === 'uniqueidentifier' || pk.Type.trim().toLowerCase() === 'uuid') {
        valStr = valStr.toLowerCase().trim();
      }
      return `${pk.Name.toLowerCase()}=${valStr}`;
    });
    parts.sort();
    return parts.join('|');
  }

  public getUniquePrimaryKeys(entityInfo: any, pks: Array<Record<string, any>>): Array<Record<string, any>> {
    const seen = new Set<string>();
    const unique: Array<Record<string, any>> = [];
    for (const pk of pks) {
      const serialized = this.serializePrimaryKey(entityInfo, pk);
      if (!seen.has(serialized)) {
        seen.add(serialized);
        unique.push(pk);
      }
    }
    return unique;
  }

  public buildBulkFilter(entityInfo: any, uniquePks: Array<Record<string, any>>): string {
    const filterParts: string[] = [];
    for (const pk of uniquePks) {
      const pkParts: string[] = [];
      for (const pkField of entityInfo.PrimaryKeys) {
        const val = pk[pkField.Name];
        const quotes = pkField.NeedsQuotes ? "'" : '';
        const escapedVal = pkField.NeedsQuotes && typeof val === 'string' ? val.replace(/'/g, "''") : val;
        pkParts.push(`${pkField.Name} = ${quotes}${escapedVal}${quotes}`);
      }
      filterParts.push(`(${pkParts.join(' AND ')})`);
    }
    return filterParts.join(' OR ');
  }

  private extractPrimaryKeysRecursive(
    records: any[],
    entityName: string,
    keysByEntity: Map<string, Array<Record<string, any>>>
  ): void {
    const list = keysByEntity.get(entityName) || [];
    if (!keysByEntity.has(entityName)) {
      keysByEntity.set(entityName, list);
    }

    for (const record of records) {
      if (record.deleteRecord?.delete === true) {
        continue;
      }

      if (record.primaryKey && Object.keys(record.primaryKey).length > 0) {
        list.push(record.primaryKey);
      }

      if (record.relatedEntities) {
        for (const [relatedEntityName, relatedRecords] of Object.entries(record.relatedEntities)) {
          this.extractPrimaryKeysRecursive(relatedRecords as any[], relatedEntityName, keysByEntity);
        }
      }
    }
  }

  /**
   * Scans files, caches content to avoid double I/O, collects primary keys,
   * and prepares configurations for bulk-loading.
   */
  private async buildDynamicConfigs(): Promise<Partial<BaseEnginePropertyConfig>[]> {
    const keysByEntity: Map<string, Array<Record<string, any>>> = new Map();
    const configs: Partial<BaseEnginePropertyConfig>[] = [];

    // 1. Scan and cache files
    for (const entityDir of this.entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) continue;

      const pattern = entityConfig.filePattern || '*.json';
      const files = await fastGlob(pattern, {
        cwd: entityDir,
        absolute: true,
        onlyFiles: true,
        dot: true,
        ignore: ['**/node_modules/**', '**/.mj-*.json']
      });

      for (const filePath of files) {
        const rawData = await fs.readJson(filePath);
        let fileData = rawData;

        const jsonString = JSON.stringify(rawData);
        const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');

        if (hasIncludes) {
          const preprocessor = new JsonPreprocessor();
          fileData = await preprocessor.processFile(filePath);
        }

        this.cacheFile(filePath, rawData, fileData);

        const records = Array.isArray(fileData) ? fileData : [fileData];
        this.extractPrimaryKeysRecursive(records, entityConfig.entity, keysByEntity);
      }
    }

    // 2. Build configurations
    for (const [entityName, pks] of keysByEntity.entries()) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo || pks.length === 0) continue;

      const uniquePks = this.getUniquePrimaryKeys(entityInfo, pks);
      if (uniquePks.length === 0) continue;

      this.markEntityAsPreloaded(entityName);

      const propName = this.getPropertyNameForEntity(entityName);
      const filter = this.buildBulkFilter(entityInfo, uniquePks);

      configs.push({
        PropertyName: propName,
        EntityName: entityName,
        Type: 'entity',
        ResultType: 'entity_object',
        Filter: filter,
        AutoRefresh: true
      });
    }

    return configs;
  }
}
