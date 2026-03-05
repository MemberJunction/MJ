import fs from 'node:fs';
import { BaseEntity, CompositeKey, LogError, LogStatus, Metadata, RunView, TransactionGroupBase, UserInfo } from '@memberjunction/core';

/** Batch size for TransactionGroup submits */
const TG_BATCH_SIZE = 200;

/** State of an existing record used for change detection */
interface ExistingRecordState {
  ID: string;
  SourceJSON: string;
}

/**
 * Manages entity-based upserts for YM data sync.
 *
 * Tables and entities are expected to already exist (created by migration + CodeGen).
 * This class is fully provider-agnostic — works on SQL Server and PostgreSQL.
 */
export class YMSchemaManager {
  private contextUser: UserInfo;
  /** Optional log file path set by the sync engine for detailed logging */
  public LogFilePath: string | null = null;

  constructor(contextUser: UserInfo) {
    this.contextUser = contextUser;
  }

  private writeLog(message: string): void {
    if (!this.LogFilePath) return;
    const line = `[${new Date().toISOString()}] [SchemaManager] ${message}\n`;
    try {
      fs.appendFileSync(this.LogFilePath, line);
    } catch {
      // Silent fail — don't break sync for logging issues
    }
  }

  /**
   * Validates that the MJ entity exists and is accessible.
   * Throws if missing — means CodeGen hasn't run after the migration.
   */
  public ValidateEntityExists(entityName: string): void {
    const md = new Metadata();
    const entityInfo = md.Entities.find((e) => e.Name === entityName);
    if (!entityInfo) {
      throw new Error(`Entity "${entityName}" not found in MJ metadata. ` + `Run CodeGen after applying the YourMembership migration.`);
    }
  }

  /**
   * Returns the most recent LastSyncedAt value for the given entity,
   * or null if the entity has no records.
   * Used to determine the starting point for incremental syncs.
   */
  public async GetLastSyncTimestamp(entityName: string): Promise<Date | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ LastSyncedAt: string }>(
      {
        EntityName: entityName,
        ExtraFilter: '',
        Fields: ['LastSyncedAt'],
        OrderBy: 'LastSyncedAt DESC',
        MaxRows: 1,
        ResultType: 'simple',
      },
      this.contextUser,
    );

    if (!result.Success || result.Results.length === 0) {
      return null;
    }

    const timestamp = result.Results[0].LastSyncedAt;
    return timestamp ? new Date(timestamp) : null;
  }

  /**
   * Upserts records into the entity, keyed on SourceRecordID.
   * Skips records whose SourceJSON hasn't changed since the last sync.
   * Uses MJ entity objects + TransactionGroup for provider-agnostic batch saves.
   */
  public async UpsertRecords(
    entityName: string,
    records: Record<string, unknown>[],
    pkFields: string[],
  ): Promise<{ Inserted: number; Updated: number; Skipped: number }> {
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    // Deduplicate by composite source ID — the API can return overlapping pages
    const deduped = this.deduplicateBySourceId(records, pkFields);
    if (deduped.length < records.length) {
      this.writeLog(`Deduplicated ${records.length} → ${deduped.length} records`);
    }

    // Load all existing records with SourceJSON for change detection
    const existingMap = await this.loadExistingRecordState(entityName);
    this.writeLog(`Found ${existingMap.size} existing records in ${entityName}`);

    // Process in batches
    const totalBatches = Math.ceil(deduped.length / TG_BATCH_SIZE);
    this.writeLog(`Upserting ${deduped.length} records into ${entityName} (${totalBatches} batches)`);

    for (let i = 0; i < deduped.length; i += TG_BATCH_SIZE) {
      const batchNum = Math.floor(i / TG_BATCH_SIZE) + 1;
      const batch = deduped.slice(i, i + TG_BATCH_SIZE);
      this.writeLog(`  Batch ${batchNum}/${totalBatches}: ${batch.length} records`);

      const result = await this.upsertBatch(entityName, batch, pkFields, existingMap);
      totalInserted += result.Inserted;
      totalUpdated += result.Updated;
      totalSkipped += result.Skipped;
      this.writeLog(`  Batch ${batchNum} result: ${result.Inserted} inserted, ${result.Updated} updated, ${result.Skipped} skipped`);
    }

    return { Inserted: totalInserted, Updated: totalUpdated, Skipped: totalSkipped };
  }

  /**
   * Deletes all records from the entity for full refresh.
   * Uses RunView to load all records, then deletes via TransactionGroup.
   */
  public async TruncateEntity(entityName: string): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>(
      {
        EntityName: entityName,
        ExtraFilter: '',
        Fields: ['ID'],
        ResultType: 'entity_object',
      },
      this.contextUser,
    );

    if (!result.Success) {
      throw new Error(`Failed to load ${entityName} for truncation: ${result.ErrorMessage}`);
    }

    if (result.Results.length === 0) return;

    this.writeLog(`Truncating ${entityName}: deleting ${result.Results.length} records`);

    // Delete in batches via TransactionGroup
    for (let i = 0; i < result.Results.length; i += TG_BATCH_SIZE) {
      const batch = result.Results.slice(i, i + TG_BATCH_SIZE);
      const tg = await Metadata.Provider.CreateTransactionGroup();

      for (const entity of batch) {
        entity.TransactionGroup = tg;
        await entity.Delete();
      }

      const success = await tg.Submit();
      if (!success) {
        throw new Error(`Failed to delete batch during truncation of ${entityName}`);
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────

  /**
   * Loads all existing records with their SourceJSON for change detection.
   * Returns a map of SourceRecordID → { ID, SourceJSON }.
   */
  private async loadExistingRecordState(entityName: string): Promise<Map<string, ExistingRecordState>> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string; SourceRecordID: string; SourceJSON: string }>(
      {
        EntityName: entityName,
        ExtraFilter: '',
        Fields: ['ID', 'SourceRecordID', 'SourceJSON'],
        ResultType: 'simple',
      },
      this.contextUser,
    );

    if (!result.Success) {
      throw new Error(`Failed to load existing records for ${entityName}: ${result.ErrorMessage}`);
    }

    const map = new Map<string, ExistingRecordState>();
    for (const row of result.Results) {
      if (row.SourceRecordID) {
        map.set(row.SourceRecordID, {
          ID: row.ID,
          SourceJSON: row.SourceJSON ?? '',
        });
      }
    }
    return map;
  }

  /**
   * Processes a single batch of records: loads existing entities for updates,
   * creates new entities for inserts, then submits via TransactionGroup.
   */
  private async upsertBatch(
    entityName: string,
    records: Record<string, unknown>[],
    pkFields: string[],
    existingMap: Map<string, ExistingRecordState>,
  ): Promise<{ Inserted: number; Updated: number; Skipped: number }> {
    const tg = await Metadata.Provider.CreateTransactionGroup();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Separate records into inserts, updates, or skips
    const toInsert: { record: Record<string, unknown>; sourceId: string }[] = [];
    const toUpdate: { record: Record<string, unknown>; sourceId: string; existingId: string }[] = [];

    for (const record of records) {
      const sourceId = this.buildSourceId(record, pkFields);
      const existing = existingMap.get(sourceId);
      if (existing) {
        // Skip if the record data hasn't changed
        const incomingJSON = JSON.stringify(record);
        if (incomingJSON === existing.SourceJSON) {
          skipped++;
          continue;
        }
        toUpdate.push({ record, sourceId, existingId: existing.ID });
      } else {
        toInsert.push({ record, sourceId });
      }
    }

    // If everything was skipped, no need for a transaction
    if (toInsert.length === 0 && toUpdate.length === 0) {
      return { Inserted: 0, Updated: 0, Skipped: skipped };
    }

    // Load existing entities for updates in a single RunView call
    const existingEntities = await this.loadEntitiesByIds(
      entityName,
      toUpdate.map((u) => u.existingId),
    );

    // Process updates
    for (const { record, sourceId, existingId } of toUpdate) {
      const entity = existingEntities.get(existingId);
      if (!entity) {
        LogError(`YM Sync: Could not load entity ${entityName} ID=${existingId} for update`);
        continue;
      }
      this.setEntityFieldsFromRecord(entity, record, pkFields, sourceId);
      entity.TransactionGroup = tg;
      await entity.Save();
      updated++;
    }

    // Process inserts
    for (const { record, sourceId } of toInsert) {
      const md = new Metadata();
      const entity = await md.GetEntityObject<BaseEntity>(entityName, this.contextUser);
      entity.NewRecord();
      entity.Set('SourceRecordID', sourceId);
      this.setEntityFieldsFromRecord(entity, record, pkFields, sourceId);
      entity.TransactionGroup = tg;
      await entity.Save();
      inserted++;

      // Add to existingMap so subsequent batches know this sourceId exists
      const newId = String(entity.Get('ID'));
      existingMap.set(sourceId, { ID: newId, SourceJSON: JSON.stringify(record) });
    }

    // Submit the transaction group
    const success = await tg.Submit();
    if (!success) {
      throw new Error(`TransactionGroup submit failed for ${entityName} batch`);
    }

    return { Inserted: inserted, Updated: updated, Skipped: skipped };
  }

  /**
   * Loads entity objects by their IDs in a single RunView call.
   */
  private async loadEntitiesByIds(entityName: string, ids: string[]): Promise<Map<string, BaseEntity>> {
    const map = new Map<string, BaseEntity>();
    if (ids.length === 0) return map;

    const rv = new RunView();
    // Build IN clause — IDs are UUIDs, safe to embed directly
    const idList = ids.map((id) => `'${id}'`).join(',');
    const result = await rv.RunView<BaseEntity>(
      {
        EntityName: entityName,
        ExtraFilter: `ID IN (${idList})`,
        ResultType: 'entity_object',
      },
      this.contextUser,
    );

    if (!result.Success) {
      throw new Error(`Failed to load entities by ID for ${entityName}: ${result.ErrorMessage}`);
    }

    for (const entity of result.Results) {
      map.set(String(entity.Get('ID')), entity);
    }
    return map;
  }

  /**
   * Sets entity fields from a YM API record.
   * Maps YM field names to entity field names (sanitized) and sets standard integration columns.
   */
  private setEntityFieldsFromRecord(entity: BaseEntity, record: Record<string, unknown>, pkFields: string[], sourceId: string): void {
    const sanitized = this.sanitizeRecord(record);

    // Use SetMany with ignoreNonExistentFields=true since the YM API may return
    // fields that don't have corresponding columns in the migration
    entity.SetMany(sanitized, true);

    // Standard integration columns
    entity.Set('LastSyncedAt', new Date());
    entity.Set('SourceJSON', JSON.stringify(record));
  }

  /**
   * Removes duplicate records based on composite source ID.
   * Keeps the last occurrence (latest from the API) when duplicates exist.
   */
  private deduplicateBySourceId(records: Record<string, unknown>[], pkFields: string[]): Record<string, unknown>[] {
    const seen = new Map<string, Record<string, unknown>>();
    for (const record of records) {
      const sourceId = this.buildSourceId(record, pkFields);
      seen.set(sourceId, record); // last wins
    }
    return Array.from(seen.values());
  }

  /** Column names reserved by the sync framework that cannot come from YM data */
  private static readonly RESERVED_COLUMNS = new Set(['id', 'sourcerecordid', 'sourcejson', 'syncstatus', 'lastsyncedat']);

  /**
   * Sanitizes a YM field name to avoid collision with reserved columns.
   * If the field name (case-insensitive) collides, it gets a 'YM_' prefix.
   */
  private sanitizeColumnName(fieldName: string): string {
    if (YMSchemaManager.RESERVED_COLUMNS.has(fieldName.toLowerCase())) {
      return `YM_${fieldName}`;
    }
    return fieldName;
  }

  /**
   * Returns a sanitized copy of a record with renamed keys where needed.
   */
  private sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      sanitized[this.sanitizeColumnName(key)] = value;
    }
    return sanitized;
  }

  /**
   * Builds a composite SourceRecordID from one or more PK field values.
   * Single field: just the value. Multiple fields: joined with '|'.
   */
  private buildSourceId(record: Record<string, unknown>, pkFields: string[]): string {
    const parts = pkFields.map((f) => String(record[f] ?? ''));
    return parts.join('|');
  }
}
