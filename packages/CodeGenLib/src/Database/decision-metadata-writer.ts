import fs from 'fs-extra';
import path from 'path';
import { BaseSingleton, ordinalCompare } from '@memberjunction/global';
import { configInfo, outputDir } from '../Config/config';
import { CodeGenReporter } from '../Misc/codegen-reporter';
import {
  ALLOWED_ENTITY_DECISION_COLUMNS,
  ALLOWED_FIELD_DECISION_COLUMNS,
  ALLOWED_SETTING_DECISION_NAMES,
  ALLOWED_APP_ENTITY_DECISION_COLUMNS,
  DISALLOWED_COLUMNS,
  DecisionRecord,
  FieldDecisionRecord,
  SettingDecisionRecord,
  ApplicationEntityDecisionRecord,
  buildDecisionComments,
  buildEntityLookup,
  buildFieldLookup,
  buildSettingLookup,
  buildAppEntityLookup,
  getDecisionFileName,
  formatDecisionRecordData,
  writeIfChanged
} from './decision-metadata-format';
import { canonicalJSONStringify } from '../Misc/util';

/**
 * Singleton writer that collects CodeGen decision outputs (field categories,
 * display names, extended types, search flags, name fields, entity icons, etc.)
 * during a run and persists them as declarative JSON records under
 * metadata/entities/decisions/.
 */
export class DecisionMetadataWriter extends BaseSingleton<DecisionMetadataWriter> {
  protected constructor() {
    super();
  }

  public static get Instance(): DecisionMetadataWriter {
    return super.getInstance<DecisionMetadataWriter>();
  }

  private _warnedMissingDir = false;
  public droppedDisallowedColumnCount = 0;
  public recordsRemovedCount = 0;
  public recordsUnchangedCount = 0;
  public recordsWrittenCount = 0;
  public recordsSkippedCount = 0;

  // In-memory decision buffers keyed by normalized entity name
  private _entityDecisions = new Map<string, Map<string, unknown>>();
  private _fieldDecisions = new Map<string, Map<string, Map<string, unknown>>>();
  private _settingDecisions = new Map<string, Map<string, unknown>>();
  private _appEntityDecisions = new Map<string, Map<string, Map<string, unknown>>>();

  private _configOwnedEntityColumns: Map<string, Set<string>> | null = null;
  private _configOwnedFieldColumns: Map<string, Map<string, Set<string>>> | null = null;
  private _loggedConflicts = new Set<string>();

  public clear(): void {
    this._warnedMissingDir = false;
    this.droppedDisallowedColumnCount = 0;
    this.recordsRemovedCount = 0;
    this.recordsUnchangedCount = 0;
    this.recordsWrittenCount = 0;
    this.recordsSkippedCount = 0;
    this._entityDecisions.clear();
    this._fieldDecisions.clear();
    this._settingDecisions.clear();
    this._appEntityDecisions.clear();
    this._configOwnedEntityColumns = null;
    this._configOwnedFieldColumns = null;
    this._loggedConflicts.clear();
  }

  private ensureConfigOwnedColumnsLoaded(): void {
    if (this._configOwnedEntityColumns !== null) return;
    this._configOwnedEntityColumns = new Map<string, Set<string>>();
    this._configOwnedFieldColumns = new Map<string, Map<string, Set<string>>>();

    if (!configInfo.additionalSchemaInfo) return;
    const configPath = path.isAbsolute(configInfo.additionalSchemaInfo)
      ? configInfo.additionalSchemaInfo
      : path.join(process.cwd(), configInfo.additionalSchemaInfo);

    if (!fs.existsSync(configPath)) return;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      this.loadConfigOwnedColumns(config);
    } catch {
      // ignore parse errors
    }
  }

  public loadConfigOwnedColumns(config: Record<string, unknown>): void {
    if (!this._configOwnedEntityColumns) this._configOwnedEntityColumns = new Map<string, Set<string>>();
    if (!this._configOwnedFieldColumns) this._configOwnedFieldColumns = new Map<string, Map<string, Set<string>>>();

    // 1. Entities[]
    const entities = Array.isArray(config.Entities) ? config.Entities : [];
    const reservedKeys = new Set(['basetable', 'schemaname', 'entityname', 'tablename']);
    for (const ec of entities) {
      if (typeof ec === 'object' && ec !== null) {
        const rec = ec as Record<string, unknown>;
        const entityKey = String(rec.EntityName ?? rec.BaseTable ?? '').trim().toLowerCase();
        if (entityKey) {
          let cols = this._configOwnedEntityColumns.get(entityKey);
          if (!cols) {
            cols = new Set<string>();
            this._configOwnedEntityColumns.set(entityKey, cols);
          }
          for (const k of Object.keys(rec)) {
            if (!reservedKeys.has(k.toLowerCase())) {
              cols.add(k.toLowerCase());
            }
          }
        }
      }
    }

    // 2. PrimaryKey & ForeignKeys from Tables or Schema-as-key
    const tableConfigs: Array<{ TableName: string; PrimaryKey?: Array<{ FieldName: string }>; ForeignKeys?: Array<{ FieldName: string }> }> = [];
    if (Array.isArray(config.Tables)) {
      tableConfigs.push(...(config.Tables as Array<{ TableName: string; PrimaryKey?: Array<{ FieldName: string }>; ForeignKeys?: Array<{ FieldName: string }> }>));
    }
    for (const [key, val] of Object.entries(config)) {
      if (key !== 'Tables' && key !== 'Entities' && key !== 'Schemas' && Array.isArray(val)) {
        tableConfigs.push(...(val as Array<{ TableName: string; PrimaryKey?: Array<{ FieldName: string }>; ForeignKeys?: Array<{ FieldName: string }> }>));
      }
    }

    for (const tc of tableConfigs) {
      const entityKey = String(tc.TableName ?? '').trim().toLowerCase();
      if (!entityKey) continue;
      let eMap = this._configOwnedFieldColumns.get(entityKey);
      if (!eMap) {
        eMap = new Map<string, Set<string>>();
        this._configOwnedFieldColumns.set(entityKey, eMap);
      }

      if (Array.isArray(tc.PrimaryKey)) {
        for (const pk of tc.PrimaryKey) {
          const fKey = String(pk.FieldName ?? '').trim().toLowerCase();
          if (!fKey) continue;
          let cols = eMap.get(fKey);
          if (!cols) {
            cols = new Set<string>();
            eMap.set(fKey, cols);
          }
          cols.add('isprimarykey');
          cols.add('issoftprimarykey');
        }
      }

      if (Array.isArray(tc.ForeignKeys)) {
        for (const fk of tc.ForeignKeys) {
          const fKey = String(fk.FieldName ?? '').trim().toLowerCase();
          if (!fKey) continue;
          let cols = eMap.get(fKey);
          if (!cols) {
            cols = new Set<string>();
            eMap.set(fKey, cols);
          }
          cols.add('relatedentityid');
          cols.add('relatedentityfieldname');
          cols.add('issoftforeignkey');
          cols.add('autoupdaterelatedentityinfo');
        }
      }
    }
  }

  public isEntityColumnOwnedByConfig(entityName: string, column: string): boolean {
    this.ensureConfigOwnedColumnsLoaded();
    if (!this._configOwnedEntityColumns) return false;
    const nameLower = (entityName ?? '').trim().toLowerCase();
    const baseLower = nameLower.includes(':') ? nameLower.split(':').pop()!.trim() : nameLower;
    const cols = this._configOwnedEntityColumns.get(nameLower) ?? this._configOwnedEntityColumns.get(baseLower);
    return cols ? cols.has(column.toLowerCase()) : false;
  }

  public isFieldColumnOwnedByConfig(entityName: string, fieldName: string, column: string): boolean {
    this.ensureConfigOwnedColumnsLoaded();
    if (!this._configOwnedFieldColumns) return false;
    const nameLower = (entityName ?? '').trim().toLowerCase();
    const baseLower = nameLower.includes(':') ? nameLower.split(':').pop()!.trim() : nameLower;
    const eMap = this._configOwnedFieldColumns.get(nameLower) ?? this._configOwnedFieldColumns.get(baseLower);
    if (!eMap) return false;
    const cols = eMap.get((fieldName ?? '').trim().toLowerCase());
    return cols ? cols.has(column.toLowerCase()) : false;
  }

  private logConfigConflictOnce(entityName: string, fieldName: string | undefined, column: string): void {
    const key = `${entityName}:${fieldName ?? ''}:${column}`.toLowerCase();
    if (!this._loggedConflicts.has(key)) {
      this._loggedConflicts.add(key);
      const target = fieldName ? `${entityName}.${fieldName}.${column}` : `${entityName}.${column}`;
      console.warn(`[DecisionMetadataWriter] Skipping '${target}' owned by additionalSchemaInfo config.`);
    }
  }

  // ─── Recording API ──────────────────────────────────────────────────────────

  public recordEntityDecision(entityName: string, column: string, value: unknown): void {
    if (DISALLOWED_COLUMNS.has(column)) {
      this.droppedDisallowedColumnCount++;
      return;
    }
    if (!ALLOWED_ENTITY_DECISION_COLUMNS.has(column)) {
      return;
    }

    if (this.isEntityColumnOwnedByConfig(entityName, column)) {
      this.logConfigConflictOnce(entityName, undefined, column);
      this.recordsSkippedCount++;
      CodeGenReporter.Instance.counter('metadata.decisionRecordsSkipped', 1);
      return;
    }

    const key = (entityName ?? '').trim();
    if (!key) return;

    let map = this._entityDecisions.get(key);
    if (!map) {
      map = new Map<string, unknown>();
      this._entityDecisions.set(key, map);
    }
    map.set(column, value);
  }

  public recordFieldDecision(entityName: string, fieldName: string, column: string, value: unknown): void {
    if (DISALLOWED_COLUMNS.has(column)) {
      this.droppedDisallowedColumnCount++;
      return;
    }
    if (!ALLOWED_FIELD_DECISION_COLUMNS.has(column)) {
      return;
    }

    if (this.isFieldColumnOwnedByConfig(entityName, fieldName, column)) {
      this.logConfigConflictOnce(entityName, fieldName, column);
      this.recordsSkippedCount++;
      CodeGenReporter.Instance.counter('metadata.decisionRecordsSkipped', 1);
      return;
    }

    const eKey = (entityName ?? '').trim();
    const fKey = (fieldName ?? '').trim();
    if (!eKey || !fKey) return;

    let eMap = this._fieldDecisions.get(eKey);
    if (!eMap) {
      eMap = new Map<string, Map<string, unknown>>();
      this._fieldDecisions.set(eKey, eMap);
    }
    let fMap = eMap.get(fKey);
    if (!fMap) {
      fMap = new Map<string, unknown>();
      eMap.set(fKey, fMap);
    }
    fMap.set(column, value);
  }

  public recordEntitySetting(entityName: string, settingName: string, value: unknown): void {
    if (!ALLOWED_SETTING_DECISION_NAMES.has(settingName)) {
      return;
    }

    const eKey = (entityName ?? '').trim();
    const sKey = (settingName ?? '').trim();
    if (!eKey || !sKey) return;

    let map = this._settingDecisions.get(eKey);
    if (!map) {
      map = new Map<string, unknown>();
      this._settingDecisions.set(eKey, map);
    }
    map.set(sKey, value);
  }

  public recordApplicationEntityDecision(entityName: string, appName: string, column: string, value: unknown): void {
    if (!ALLOWED_APP_ENTITY_DECISION_COLUMNS.has(column)) {
      return;
    }

    const eKey = (entityName ?? '').trim();
    const aKey = (appName ?? '').trim();
    if (!eKey || !aKey) return;

    let eMap = this._appEntityDecisions.get(eKey);
    if (!eMap) {
      eMap = new Map<string, Map<string, unknown>>();
      this._appEntityDecisions.set(eKey, eMap);
    }
    let aMap = eMap.get(aKey);
    if (!aMap) {
      aMap = new Map<string, unknown>();
      eMap.set(aKey, aMap);
    }
    aMap.set(column, value);
  }

  // ─── Directory Resolution & Persistence ────────────────────────────────────

  public resolveDecisionsDirectory(): string | null {
    const enabledSetting = configInfo.decisionMetadata?.enabled;
    if (enabledSetting === false) {
      return null;
    }

    const metaDir = outputDir('MetadataSync', false) ?? (configInfo.metadataDirectory ? path.resolve(process.cwd(), configInfo.metadataDirectory) : null);
    if (!metaDir) {
      throw new Error(
        `[DecisionMetadataWriter] No 'MetadataSync' output entry or 'metadataDirectory' found in config, but decision metadata is enabled (${enabledSetting ?? 'auto'}). ` +
          `Add { type: 'MetadataSync', directory: './metadata' } to your config's output array, or set decisionMetadata.enabled: false to explicitly opt out.`
      );
    }

    const resolvedMetaDir = path.resolve(metaDir);
    const entitiesDir = path.join(resolvedMetaDir, 'entities');
    const syncConfigPath = path.join(entitiesDir, '.mj-sync.json');

    if (!fs.existsSync(syncConfigPath)) {
      if (!this._warnedMissingDir) {
        console.warn(`[DecisionMetadataWriter] Metadata directory '${entitiesDir}' lacks .mj-sync.json. Decision metadata writes disabled.`);
        this._warnedMissingDir = true;
      }
      return null;
    }

    return path.join(entitiesDir, 'decisions');
  }

  /**
   * Flush pending decision metadata for an entity to disk.
   */
  public async flushEntity(entity: {
    ID?: string;
    Name: string;
    SchemaName?: string;
    Fields: Array<{ Name: string; Sequence?: number }>;
  }): Promise<void> {
    const entityName = (entity.Name ?? '').trim();
    const schemaName = (entity.SchemaName ?? 'dbo').trim();
    if (!entityName) return;

    const decisionsDir = this.resolveDecisionsDirectory();
    if (!decisionsDir) {
      // Record skipped decisions
      const fieldDecs = this._fieldDecisions.get(entityName);
      const entityDecs = this._entityDecisions.get(entityName);
      const settingDecs = this._settingDecisions.get(entityName);
      const appDecs = this._appEntityDecisions.get(entityName);
      const totalDecisions = (fieldDecs?.size ?? 0) + (entityDecs ? 1 : 0) + (settingDecs?.size ?? 0) + (appDecs?.size ?? 0);
      if (totalDecisions > 0) {
        this.recordsSkippedCount += totalDecisions;
        CodeGenReporter.Instance.counter('metadata.decisionRecordsSkipped', totalDecisions);
      }
      return;
    }

    const fileName = getDecisionFileName(schemaName, entityName);
    const filePath = path.join(decisionsDir, fileName);
    const fileExists = await fs.pathExists(filePath);

    const hasEntityDecs = this._entityDecisions.has(entityName);
    const hasFieldDecs = this._fieldDecisions.has(entityName);
    const hasSettingDecs = this._settingDecisions.has(entityName);
    const hasAppDecs = this._appEntityDecisions.has(entityName);
    const hasAnyDecisions = hasEntityDecs || hasFieldDecs || hasSettingDecs || hasAppDecs;

    // Rule: a run that decides nothing writes nothing if no file exists
    if (!hasAnyDecisions && !fileExists) {
      return;
    }

    let records: DecisionRecord[] = [];
    if (fileExists) {
      try {
        const parsed = await fs.readJson(filePath);
        records = Array.isArray(parsed) ? (parsed as DecisionRecord[]) : [parsed as DecisionRecord];
      } catch {
        records = [];
      }
    }

    let mainRecord: DecisionRecord;
    if (records.length > 0) {
      mainRecord = records[0];
      if (!mainRecord.fields) mainRecord.fields = { Name: entityName };
      if (!mainRecord.primaryKey) mainRecord.primaryKey = { ID: buildEntityLookup(entityName) };
    } else {
      mainRecord = {
        _comments: buildDecisionComments(entityName, schemaName),
        fields: { Name: entityName },
        primaryKey: { ID: buildEntityLookup(entityName) },
        relatedEntities: {}
      };
      records = [mainRecord];
    }

    // Apply entity decisions
    const entityDecMap = this._entityDecisions.get(entityName);
    if (entityDecMap) {
      for (const [col, val] of entityDecMap) {
        mainRecord.fields[col] = val;
      }
    }

    if (!mainRecord.relatedEntities) {
      mainRecord.relatedEntities = {};
    }

    // Handle MJ: Entity Fields
    let existingFieldRecords = (mainRecord.relatedEntities['MJ: Entity Fields'] as FieldDecisionRecord[]) ?? [];
    const validFieldNamesLower = new Set(entity.Fields.map(f => (f.Name ?? '').trim().toLowerCase()));

    // Reconcile dropped/renamed fields
    const initialFieldCount = existingFieldRecords.length;
    existingFieldRecords = existingFieldRecords.filter(fr => {
      const fName = String(fr.fields?.Name ?? '').trim().toLowerCase();
      return validFieldNamesLower.has(fName);
    });
    const removedCount = initialFieldCount - existingFieldRecords.length;
    if (removedCount > 0) {
      this.recordsRemovedCount += removedCount;
      CodeGenReporter.Instance.counter('metadata.decisionRecordsRemoved', removedCount);
    }

    const fieldDecMap = this._fieldDecisions.get(entityName);
    if (fieldDecMap) {
      for (const [fieldName, colMap] of fieldDecMap) {
        let fieldRec = existingFieldRecords.find(fr => String(fr.fields?.Name ?? '').trim().toLowerCase() === fieldName.toLowerCase());
        if (!fieldRec) {
          fieldRec = {
            fields: { Name: fieldName },
            primaryKey: { ID: buildFieldLookup(entityName, fieldName) }
          };
          existingFieldRecords.push(fieldRec);
        }
        for (const [col, val] of colMap) {
          fieldRec.fields[col] = val;
        }
      }
    }

    // Sort MJ: Entity Fields by entity field Sequence, then Name
    const seqMap = new Map<string, number>();
    for (const f of entity.Fields) {
      seqMap.set(f.Name.toLowerCase(), f.Sequence ?? 0);
    }
    existingFieldRecords.sort((a, b) => {
      const nameA = String(a.fields?.Name ?? '');
      const nameB = String(b.fields?.Name ?? '');
      const seqA = seqMap.get(nameA.toLowerCase()) ?? 0;
      const seqB = seqMap.get(nameB.toLowerCase()) ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return ordinalCompare(nameA, nameB);
    });

    if (existingFieldRecords.length > 0) {
      mainRecord.relatedEntities['MJ: Entity Fields'] = existingFieldRecords;
    } else {
      delete mainRecord.relatedEntities['MJ: Entity Fields'];
    }

    // Handle MJ: Entity Settings
    let existingSettingRecords = (mainRecord.relatedEntities['MJ: Entity Settings'] as SettingDecisionRecord[]) ?? [];
    const settingDecMap = this._settingDecisions.get(entityName);
    if (settingDecMap) {
      for (const [settingName, val] of settingDecMap) {
        let sRec = existingSettingRecords.find(sr => String(sr.fields?.Name ?? '').trim().toLowerCase() === settingName.toLowerCase());
        if (!sRec) {
          sRec = {
            fields: { Name: settingName, Value: {} },
            primaryKey: { ID: buildSettingLookup(entityName, settingName) }
          };
          existingSettingRecords.push(sRec);
        }
        if (typeof val === 'object' && val !== null) {
          sRec.fields.Value = JSON.parse(canonicalJSONStringify(val));
        } else {
          sRec.fields.Value = val as Record<string, unknown>;
        }
      }
    }
    existingSettingRecords.sort((a, b) => ordinalCompare(String(a.fields?.Name ?? ''), String(b.fields?.Name ?? '')));
    if (existingSettingRecords.length > 0) {
      mainRecord.relatedEntities['MJ: Entity Settings'] = existingSettingRecords;
    } else {
      delete mainRecord.relatedEntities['MJ: Entity Settings'];
    }

    // Handle MJ: Application Entities
    let existingAppRecords = (mainRecord.relatedEntities['MJ: Application Entities'] as ApplicationEntityDecisionRecord[]) ?? [];
    const appDecMap = this._appEntityDecisions.get(entityName);
    if (appDecMap) {
      for (const [appName, colMap] of appDecMap) {
        let aRec = existingAppRecords.find(ar => String(ar.fields?.Application ?? '').trim().toLowerCase() === appName.toLowerCase());
        if (!aRec) {
          aRec = {
            fields: { Application: appName, Entity: entityName },
            primaryKey: { ID: buildAppEntityLookup(appName, entityName) }
          };
          existingAppRecords.push(aRec);
        }
        for (const [col, val] of colMap) {
          aRec.fields[col] = val;
        }
      }
    }
    if (existingAppRecords.length > 0) {
      mainRecord.relatedEntities['MJ: Application Entities'] = existingAppRecords;
    } else {
      delete mainRecord.relatedEntities['MJ: Application Entities'];
    }

    // If relatedEntities is now empty, clean it up
    if (Object.keys(mainRecord.relatedEntities).length === 0) {
      delete mainRecord.relatedEntities;
    }

    const formatted = formatDecisionRecordData(records);
    const written = await writeIfChanged(filePath, formatted);
    if (written) {
      this.recordsWrittenCount++;
      CodeGenReporter.Instance.counter('metadata.decisionRecordsWritten');
    } else {
      this.recordsUnchangedCount++;
      CodeGenReporter.Instance.counter('metadata.decisionRecordsUnchanged');
    }
  }
}
