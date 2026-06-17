import { MongoClient, MongoClientOptions, Db, Document, FindOptions, Sort } from 'mongodb';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import {
  BaseExternalDataSourceDriver,
  ExternalConnectionTestResult,
  ExternalSchemaColumn,
  ExternalSchemaDescriptor,
  ExternalViewParams,
  ExternalViewResult,
  ExternalQueryParameter,
  ExternalQueryResult,
  ExternalRow,
} from '@memberjunction/external-data-sources';
import { MongoFilterTranslator } from './MongoFilterTranslator';

/** Non-secret connection config stored in ExternalDataSource.ConnectionConfig (JSON). */
interface MongoConnectionConfig {
  /** Full connection string; when present, host/port/authSource are ignored. */
  uri?: string;
  host?: string;
  port?: number;
  /** Auth database (default 'admin' for root users). */
  authSource?: string;
}

/** Decrypted credential values expected from the Credential Engine. */
interface MongoCredentialValues extends Record<string, string> {
  username: string;
  password: string;
}

/** Shape of a native Mongo query (the `SQL`/query text for a Mongo-backed MJ Query). */
interface MongoNativeQuery {
  collection?: string;
  pipeline?: unknown[];
}

/**
 * MongoDB driver for External Data Sources. Read-only, live-proxied access to an
 * external MongoDB database via the official `mongodb` client. One MongoClient
 * per `ExternalDataSource.ID`, lazily connected.
 *
 * `RunView` filters use a contained SQL-WHERE -> Mongo translation
 * (see {@link MongoFilterTranslator}); `RunNativeQuery` runs an aggregation
 * pipeline supplied as JSON. Schema introspection samples documents.
 *
 * Registered as `MongoExternalDriver`.
 */
@RegisterClass(BaseExternalDataSourceDriver, 'MongoExternalDriver')
export class MongoExternalDataSourceDriver extends BaseExternalDataSourceDriver<Db> {
  private clients = new Map<string, MongoClient>();

  protected async getConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<Db> {
    const dbName = dataSource.DefaultDatabase;
    if (!dbName) {
      throw new Error(`ExternalDataSource '${dataSource.Name}' has no DefaultDatabase (MongoDB dbName).`);
    }
    const existing = this.clients.get(dataSource.ID);
    if (existing) {
      return existing.db(dbName);
    }
    const config = this.parseConnectionConfig<MongoConnectionConfig>(dataSource);
    const cred = await this.resolveCredential<MongoCredentialValues>(dataSource, contextUser);
    // Use the configured URI (e.g. Atlas 'mongodb+srv://...') or build a host/port URL.
    // The credential is applied via options either way, so secrets stay out of ConnectionConfig.
    const url = config.uri ?? `mongodb://${config.host ?? 'localhost'}:${config.port ?? 27017}`;
    const options: MongoClientOptions = {};
    if (cred) {
      options.auth = { username: cred.values.username, password: cred.values.password };
      options.authSource = config.authSource ?? 'admin';
    }
    const client = new MongoClient(url, options);
    await client.connect();
    this.clients.set(dataSource.ID, client);
    return client.db(dbName);
  }

  public async TestConnection(dataSource: MJExternalDataSourceEntity, contextUser?: UserInfo): Promise<ExternalConnectionTestResult> {
    const start = Date.now();
    try {
      const db = await this.getConnection(dataSource, contextUser);
      // listCollections requires authentication (unlike `ping`, which MongoDB allows
      // pre-auth as a handshake command), so this validates the credential — not just
      // network reachability.
      await db.listCollections({}, { nameOnly: true }).toArray();
      return { success: true, message: 'Connection successful.', testedAt: new Date(), latencyMs: Date.now() - start };
    } catch (e) {
      return { success: false, message: this.errorText(e), testedAt: new Date(), latencyMs: Date.now() - start };
    }
  }

  public async RunView<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    params: ExternalViewParams,
    contextUser?: UserInfo,
  ): Promise<ExternalViewResult<TRow>> {
    const start = Date.now();
    try {
      const db = await this.getConnection(dataSource, contextUser);
      const coll = db.collection(params.objectName);
      const filter = MongoFilterTranslator.translate(params.filter);
      const options: FindOptions = {};
      if (params.fields?.length) options.projection = this.buildProjection(params.fields);
      if (params.orderBy) options.sort = this.parseSort(params.orderBy);
      if (params.offset) options.skip = params.offset;
      if (params.maxRows != null) options.limit = params.maxRows;

      const rows = await coll.find(filter, options).toArray();
      const totalRowCount = params.maxRows != null ? await coll.countDocuments(filter) : undefined;
      return { success: true, rows: rows as unknown as TRow[], totalRowCount, executionTimeMs: Date.now() - start };
    } catch (e) {
      return { success: false, rows: [], errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async LoadSingle<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    objectName: string,
    primaryKey: ExternalQueryParameter,
    contextUser?: UserInfo,
  ): Promise<TRow | null> {
    const db = await this.getConnection(dataSource, contextUser);
    const doc = await db.collection(objectName).findOne({ [primaryKey.name]: primaryKey.value });
    return (doc as unknown as TRow) ?? null;
  }

  public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(
    dataSource: MJExternalDataSourceEntity,
    queryText: string,
    _params: ExternalQueryParameter[] | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalQueryResult<TRow>> {
    const start = Date.now();
    try {
      const db = await this.getConnection(dataSource, contextUser);
      const spec = JSON.parse(queryText) as MongoNativeQuery;
      if (!spec.collection || !Array.isArray(spec.pipeline)) {
        throw new Error('MongoDB native query must be JSON of the form { "collection": "<name>", "pipeline": [ ... ] }.');
      }
      const rows = await db.collection(spec.collection).aggregate(spec.pipeline as Document[]).toArray();
      return { success: true, rows: rows as unknown as TRow[], rowCount: rows.length, executionTimeMs: Date.now() - start };
    } catch (e) {
      return { success: false, rows: [], rowCount: 0, errorMessage: this.errorText(e), executionTimeMs: Date.now() - start };
    }
  }

  public async IntrospectSchema(
    dataSource: MJExternalDataSourceEntity,
    _schemaName: string | undefined,
    contextUser?: UserInfo,
  ): Promise<ExternalSchemaDescriptor> {
    const db = await this.getConnection(dataSource, contextUser);
    const collections = await db.listCollections().toArray();
    const objects = [];
    for (const c of collections) {
      const sample = await db.collection(c.name).find({}).limit(25).toArray();
      objects.push({ name: c.name, objectType: 'collection' as const, columns: this.inferColumns(sample) });
    }
    return { database: dataSource.DefaultDatabase ?? undefined, objects };
  }

  /** Close all cached MongoClients (graceful shutdown / connection cleanup). */
  public async Close(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
  }

  // ---- helpers -------------------------------------------------------------

  private buildProjection(fields: string[]): Document {
    const proj: Record<string, 0 | 1> = {};
    for (const f of fields) proj[f] = 1;
    if (!fields.includes('_id')) proj._id = 0; // mirror SQL projection (only requested fields)
    return proj;
  }

  private parseSort(orderBy: string): Sort {
    const sort: Record<string, 1 | -1> = {};
    for (const part of orderBy.split(',')) {
      const [field, dir] = part.trim().split(/\s+/);
      if (field) sort[field] = dir && dir.toUpperCase() === 'DESC' ? -1 : 1;
    }
    return sort;
  }

  /** Infer column descriptors by sampling documents (union of fields, type from first non-null value). */
  private inferColumns(docs: Document[]): ExternalSchemaColumn[] {
    const types = new Map<string, string>();
    for (const d of docs) {
      for (const [k, v] of Object.entries(d)) {
        if (v != null && (!types.has(k) || types.get(k) === 'null')) types.set(k, this.jsType(v));
        else if (!types.has(k)) types.set(k, 'null');
      }
    }
    return [...types.entries()].map(([name, t]) => ({
      name,
      nativeType: t,
      nullable: name !== '_id',
      isPrimaryKey: name === '_id',
    }));
  }

  private jsType(v: unknown): string {
    if (v instanceof Date) return 'date';
    if (Array.isArray(v)) return 'array';
    if (v !== null && typeof v === 'object') return 'object';
    return typeof v;
  }

  private errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
