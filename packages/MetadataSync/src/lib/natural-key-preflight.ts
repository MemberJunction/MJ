/**
 * @fileoverview Pre-flight for a create that a unique constraint would reject (#4400).
 *
 * A seed record with a literal primary key that is not in the database is created with that key.
 * When the database already has a row with the same natural key under another ID (CodeGen and
 * other server-side code create rows with database-generated IDs), the create violates the unique
 * constraint and the push stops on a driver error. This check runs first: for each unique key of
 * the table, it looks the record's values up and, on a hit, reports the existing row's key so the
 * seed can be re-keyed with `@lookup`.
 * @module natural-key-preflight
 */
import { RunView, type BaseEntity, type DatabaseProviderBase, type EntityFieldInfo, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

/** One unique key of a table: its name and its columns in key order. */
export interface UniqueKeyColumns {
  Name: string;
  Columns: string[];
}

/** A row that already holds the natural key a create would add. */
export interface NaturalKeyConflict {
  /** Unique constraint or index name. */
  KeyName: string;
  /** The entity's field names that make up the key. */
  Fields: string[];
  /** The primary key of the existing row. */
  ExistingKey: Record<string, unknown>;
}

/** Reads unique keys and finds rows by them. */
export interface NaturalKeyReader {
  /** The unique keys of the entity's table, other than the primary key. */
  UniqueKeys(info: EntityInfo): Promise<UniqueKeyColumns[]>;
  /** The primary key of a row whose fields equal `values`, or null when there is none. */
  FindKey(info: EntityInfo, values: ReadonlyArray<{ Field: EntityFieldInfo; Value: unknown }>): Promise<Record<string, unknown> | null>;
}

/** Finds the existing row, if any, that a create of `entity` would collide with on a unique key. */
export class NaturalKeyPreflight {
  private readonly reader: NaturalKeyReader;

  constructor(reader: NaturalKeyReader) {
    this.reader = reader;
  }

  /**
   * The first unique key whose values another row already holds, or null. A key is checked only
   * when every one of its columns is a field of the entity with a non-null value and no column is
   * part of the primary key.
   */
  async Check(entity: BaseEntity): Promise<NaturalKeyConflict | null> {
    const info = entity.EntityInfo;
    const keys = await this.reader.UniqueKeys(info);
    if (keys.length === 0) {
      return null;
    }
    const keyNames = new Set(info.PrimaryKeys.map((pk) => pk.Name.toLowerCase()));
    for (const key of keys) {
      const values = this.keyValues(entity, key, keyNames);
      if (!values) {
        continue;
      }
      const existing = await this.reader.FindKey(info, values);
      if (existing && !samePrimaryKey(entity, existing)) {
        return { KeyName: key.Name, Fields: values.map((value) => value.Field.Name), ExistingKey: existing };
      }
    }
    return null;
  }

  private keyValues(entity: BaseEntity, key: UniqueKeyColumns, keyNames: ReadonlySet<string>): Array<{ Field: EntityFieldInfo; Value: unknown }> | null {
    if (key.Columns.length === 0) {
      return null;
    }
    const values: Array<{ Field: EntityFieldInfo; Value: unknown }> = [];
    for (const column of key.Columns) {
      if (keyNames.has(column.toLowerCase())) {
        return null;
      }
      const field = entity.EntityInfo.Fields.find((candidate) => candidate.Name.toLowerCase() === column.toLowerCase());
      const value = field ? entity.Get(field.Name) : undefined;
      if (!field || value === null || value === undefined) {
        return null;
      }
      values.push({ Field: field, Value: value });
    }
    return values;
  }
}

/** True when `existing` is the entity's own key (compared without regard to case). */
function samePrimaryKey(entity: BaseEntity, existing: Record<string, unknown>): boolean {
  return entity.EntityInfo.PrimaryKeys.every(
    (pk) => String(entity.Get(pk.Name) ?? '').trim().toLowerCase() === String(existing[pk.Name] ?? '').trim().toLowerCase()
  );
}

/** Row shape of the unique-key catalog queries. */
interface UniqueKeyCatalogRow {
  IndexName: string;
  ColumnName: string;
}

/**
 * Reads unique keys from the database catalog (unfiltered unique indexes and unique constraints,
 * not the primary key) and finds rows with `RunView` on the record's provider, so the lookup sees
 * rows the push transaction wrote. Catalog reads go to the pool and are never logged. A catalog
 * read that fails gives no keys, so the check is skipped rather than failing the push.
 */
export class DatabaseNaturalKeyReader implements NaturalKeyReader {
  private readonly provider: DatabaseProviderBase;
  private readonly contextUser: UserInfo;
  private readonly rowProvider: IMetadataProvider | undefined;
  private readonly cache: Map<string, Promise<UniqueKeyColumns[]>>;

  /**
   * `rowProvider` is the provider rows are found on (the record's, so the read joins its
   * transaction); `cache` (entity name → keys) can be shared by readers that find rows on
   * different providers.
   */
  constructor(
    provider: DatabaseProviderBase,
    contextUser: UserInfo,
    rowProvider?: IMetadataProvider,
    cache: Map<string, Promise<UniqueKeyColumns[]>> = new Map()
  ) {
    this.provider = provider;
    this.contextUser = contextUser;
    this.rowProvider = rowProvider;
    this.cache = cache;
  }

  UniqueKeys(info: EntityInfo): Promise<UniqueKeyColumns[]> {
    let keys = this.cache.get(info.Name);
    if (!keys) {
      keys = this.readUniqueKeys(info);
      this.cache.set(info.Name, keys);
    }
    return keys;
  }

  async FindKey(info: EntityInfo, values: ReadonlyArray<{ Field: EntityFieldInfo; Value: unknown }>): Promise<Record<string, unknown> | null> {
    // Quoted, so a reserved-word or spaced column name still filters (rather than failing the read)
    const filter = values.map(({ Field, Value }) => `${this.provider.QuoteIdentifier(Field.Name)} = ${this.literal(Field, Value)}`).join(' AND ');
    const rv = this.rowProvider ? RunView.FromMetadataProvider(this.rowProvider) : new RunView();
    const result = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: info.Name,
        ExtraFilter: filter,
        Fields: info.PrimaryKeys.map((pk) => pk.Name),
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      this.contextUser
    );
    return result.Success && result.Results.length > 0 ? result.Results[0] : null;
  }

  private async readUniqueKeys(info: EntityInfo): Promise<UniqueKeyColumns[]> {
    try {
      const rows = await this.provider.ExecuteSQL<UniqueKeyCatalogRow>(
        UniqueKeyCatalogSQL(this.provider.PlatformKey, info.SchemaName, info.BaseTable),
        undefined,
        { ignoreLogging: true, isMutation: false, ignoreAmbientTransaction: true },
        this.contextUser
      );
      return GroupUniqueKeyRows(rows);
    } catch {
      return [];
    }
  }

  private literal(field: EntityFieldInfo, value: unknown): string {
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === 'boolean') {
      if (this.provider.PlatformKey === 'postgresql') {
        return value ? 'true' : 'false';
      }
      return value ? '1' : '0';
    }
    const text = String(value).replace(/'/g, "''");
    return field.NeedsQuotes ? `'${text}'` : text;
  }
}

/** The catalog query listing a table's unfiltered unique keys other than the primary key, one row per column in key order. */
export function UniqueKeyCatalogSQL(platformKey: string, schemaName: string, tableName: string): string {
  const schema = schemaName.replace(/'/g, "''");
  const table = tableName.replace(/'/g, "''");
  if (platformKey === 'postgresql') {
    return `SELECT ix.relname AS "IndexName", a.attname AS "ColumnName"
FROM pg_index x
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_class ix ON ix.oid = x.indexrelid
JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
WHERE x.indisunique AND NOT x.indisprimary AND x.indpred IS NULL
  AND n.nspname = '${schema}' AND t.relname = '${table}'
ORDER BY ix.relname, k.ord`;
  }
  return `SELECT i.name AS IndexName, c.name AS ColumnName
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(N'[${schema.replace(/]/g, ']]')}].[${table.replace(/]/g, ']]')}]')
  AND i.is_unique = 1 AND i.is_primary_key = 0 AND i.has_filter = 0 AND ic.is_included_column = 0
ORDER BY i.name, ic.key_ordinal`;
}

/** Catalog rows grouped into keys, in row order. */
export function GroupUniqueKeyRows(rows: ReadonlyArray<UniqueKeyCatalogRow>): UniqueKeyColumns[] {
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const columns = byName.get(row.IndexName) ?? [];
    columns.push(row.ColumnName);
    byName.set(row.IndexName, columns);
  }
  return [...byName].map(([Name, Columns]) => ({ Name, Columns }));
}

/** The pre-flight error for a conflict. `recordKey` is the record's key as it may be shown. */
export function NaturalKeyConflictMessage(entityName: string, recordKey: string, conflict: NaturalKeyConflict): string {
  const existing = Object.entries(conflict.ExistingKey)
    .map(([field, value]) => `${field}=${String(value)}`)
    .join(', ');
  const fields = conflict.Fields.join(', ');
  const example = conflict.Fields.map((field) => `${field}=…`).join('&');
  return (
    `${entityName}: no row has primary key {${recordKey}}, but row {${existing}} already has the same ${fields} ` +
    `(unique key ${conflict.KeyName}), so creating this record would violate it. That row's ID was made by this ` +
    `database, so a literal ID in metadata cannot match it. Re-key the record's primaryKey with @lookup on ` +
    `${fields}, for example "@lookup:${entityName}.${example}".`
  );
}
