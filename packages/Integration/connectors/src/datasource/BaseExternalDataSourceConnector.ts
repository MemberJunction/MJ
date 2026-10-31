import type { UserInfo } from '@memberjunction/core';
import type {
    ExternalSchemaColumn,
    ExternalSchemaObject,
} from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type SourceSchemaInfo,
    type SourceObjectInfo,
    type SourceFieldInfo,
    type SourceRelationshipInfo,
    type IntrospectSchemaOptions,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { ExternalDataSourceRouter, parseIso8601AsUtc, type BaseExternalDataSourceDriver, type ExternalSeekAfter, type ResolvedExternalDataSource } from '@memberjunction/external-data-sources';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';

/** A parsed keyset marker: the watermark and key values of the last consumed row of a page. */
export interface ParsedKeysetMarker {
    /** The last consumed watermark; `null` when that row's watermark was NULL; absent for a key-only walk. */
    Watermark?: string | null;
    /** Exclusive upper bound of the consumed watermark range when the watermark was a millisecond-truncated Date. */
    WatermarkUpper?: string;
    /** Last consumed primary-key values by field. Empty when the whole watermark range was consumed. */
    Keys: Record<string, unknown>;
    /** True while the walk reads one `[Watermark, WatermarkUpper)` range in key order (see `FetchWithinBucket`). */
    WithinBucket?: boolean;
    /** Rows the walk has consumed so far: where offset paging resumes when the marker cannot seek. */
    Position?: number;
}

/** What `ExtractKeysetMarker` records beside the last row's watermark and keys. */
export interface KeysetMarkerOptions {
    /** Every row sharing the last row's millisecond watermark bucket is consumed, so the keys are dropped. */
    BucketConsumed?: boolean;
    /** The walk is inside one millisecond bucket, ordered by key alone. */
    WithinBucket?: boolean;
    /** Rows the walk has consumed, including this page. */
    Position?: number;
}

/** The serialized keyset marker (`AfterKeyValue`). Short keys keep the persisted string small. */
interface KeysetMarkerJson {
    w?: string | null;
    wx?: string;
    k: Record<string, unknown>;
    b?: true;
    o?: number;
}

/** A page trimmed so it ends on a watermark boundary the next seek can resume from exactly. */
interface TrimmedPage {
    Rows: Record<string, unknown>[];
    /** True when every row sharing the last row's (millisecond-truncated) watermark is inside the page. */
    BucketConsumed: boolean;
    /** True when the whole page is one millisecond bucket that continues past the page. */
    SingleBucket?: boolean;
}

/** The state one `FetchChanges` call pages with. */
export interface KeysetWalk {
    Driver: BaseExternalDataSourceDriver;
    DataSource: MJExternalDataSourceEntity;
    Context: FetchContext;
    Meta: ExternalObjectMeta;
    /** Rows the walk consumed before this batch. */
    Position: number;
}

/** Resolved foreign-key edge for one referencing column (built from the descriptor's relationships). */
interface ForeignKeyEdge {
    /** The source object the column references. */
    Target: string;
    /** The referenced column on the target object. */
    TargetField: string;
}

/** Per-object sync metadata resolved from the persisted IntegrationObject/Field cache. */
export interface ExternalObjectMeta {
    /** The vendor-side "last changed" column, when the object declares one. */
    WatermarkField?: string;
    /** Primary-key column name(s), used for record identity + deterministic ordering. */
    PrimaryKeyFields: string[];
}

/**
 * Base for **integration connectors that ingest from a shared External Data Source (EDS)** — the
 * "dbconnection" heart of the ingestion-connector hierarchy.
 *
 * It does NOT open its own connection, re-implement per-engine introspection, or write any dialect SQL.
 * Instead it resolves the SAME first-class `MJ: External Data Sources` row that EDS live-read/materialize
 * use (connection config + credential via CredentialEngine + the engine driver), through
 * {@link ExternalDataSourceRouter}, and on top of that shared connection provides the whole integration
 * contract: `TestConnection`, schema introspection (mapping EDS's `ExternalSchemaDescriptor` → the
 * framework's `SourceSchemaInfo`), object/field discovery, AND incremental delta ingestion (`FetchChanges`).
 *
 * `FetchChanges` is generic across every EDS driver: it passes a **structured** `incrementalSince` watermark
 * bound plus raw ordering columns to `driver.RunView`, and the EDS driver renders the dialect predicate,
 * identifier quoting, and literal formatting itself. So this connector carries **NO** dialect knowledge —
 * the only per-family variance is **whether discovery is authoritative** (SQL introspection enumerates the
 * full column set; document introspection samples — see the family subclasses). A future family whose
 * driver can't take these `RunView` params simply overrides `FetchChanges`.
 *
 * This supersedes the SQL-Server-hardcoded, inline-`mssql` {@link RelationalDBConnector}: every engine's
 * connect/introspect/read is single-sourced in the EDS drivers, so this class is engine-agnostic.
 *
 * ### The bridge
 * The `MJ: Company Integrations` connection names its shared EDS row via
 * `Configuration.externalDataSourceID` (JSON). Credentials live on the EDS row (`CredentialID` →
 * CredentialEngine), NEVER in the integration's Configuration.
 */
export abstract class BaseExternalDataSourceConnector extends BaseIntegrationConnector {
    /** Configuration key on `CompanyIntegration.Configuration` naming the shared EDS data-source row. */
    protected static readonly ExternalDataSourceIDKey = 'externalDataSourceID';

    /**
     * We fetch strictly in watermark order, so the last batch's max watermark IS the true high-water mark
     * and an updated row always re-surfaces at a new, higher watermark — the engine can safely narrow the
     * next incremental to it (§ MonotonicWatermark).
     */
    public override get MonotonicWatermark(): boolean {
        return true;
    }

    /**
     * Name of a stable, monotonic ordering key (PK) usable for keyset/seek resume.
     * 
     * ARCHITECTURAL NOTE (IntegrationEngine.ts:2711):
     * The IntegrationEngine treats 'StableOrderingKey' and 'Timestamp Watermark' as mutually exclusive:
     * declaring a StableOrderingKey forces `initialWatermark = null` in the engine, which drops the
     * timestamp watermark and turns incremental syncs into repeated full scans.
     * 
     * Therefore this returns `null` for every object: the timestamp watermark stays in force, and the
     * (watermark, primary key) keyset seek is carried within a run by `FetchChanges` through
     * `NextAfterKeyValue`, which the engine hands back as `AfterKeyValue` on the next batch.
     */
    public override StableOrderingKey(_objectName: string): string | null {
        return null;
    }

    // ─── The bridge: CompanyIntegration → shared EDS data-source row ──────────────

    /**
     * Reads the shared EDS data-source ID from the connection's `Configuration` JSON. Throws a clear,
     * actionable error when it is absent — an EDS-backed connector is meaningless without one.
     */
    protected ReadExternalDataSourceID(companyIntegration: MJCompanyIntegrationEntity): string {
        const label = companyIntegration.Name ?? companyIntegration.ID;
        const raw = companyIntegration.Configuration;
        if (!raw) {
            throw new Error(
                `CompanyIntegration '${label}' has no Configuration; an external-data-source connector requires ` +
                `Configuration.${BaseExternalDataSourceConnector.ExternalDataSourceIDKey}.`,
            );
        }
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            throw new Error(`CompanyIntegration '${label}'.Configuration is not valid JSON.`);
        }
        const id = parsed[BaseExternalDataSourceConnector.ExternalDataSourceIDKey] ?? parsed['ExternalDataSourceID'];
        if (typeof id !== 'string' || id.trim().length === 0) {
            throw new Error(
                `CompanyIntegration '${label}'.Configuration.${BaseExternalDataSourceConnector.ExternalDataSourceIDKey} ` +
                `is required (the shared MJ: External Data Sources row ID).`,
            );
        }
        return id.trim();
    }

    /**
     * Resolves the shared EDS data-source to its live driver via the EDS router (reusing the engine's
     * pooling, credential resolution, and auth self-heal). Returns the data source row, its type, and driver.
     */
    protected async Resolve(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<ResolvedExternalDataSource> {
        const id = this.ReadExternalDataSourceID(companyIntegration);
        // NOTE (multi-provider): the connector method signature carries no provider, so this uses the
        // process-default provider (the common server case). A future refinement can thread the request
        // provider through when the integration engine begins passing it to connectors.
        return ExternalDataSourceRouter.Instance.Resolve(id, contextUser);
    }

    // ─── Connectivity ────────────────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<ConnectionTestResult> {
        try {
            const { dataSource, driver } = await this.Resolve(companyIntegration, contextUser);
            const result = await driver.TestConnection(dataSource, contextUser);
            return { Success: result.success, Message: result.message };
        } catch (err) {
            return { Success: false, Message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }

    // ─── Schema introspection (delegate to EDS, map the descriptor) ───────────────

    /**
     * Introspects the shared EDS source and maps its `ExternalSchemaDescriptor` (native types, PK,
     * nullability, composite FKs) into the framework's `SourceSchemaInfo` in ONE round-trip.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions,
    ): Promise<SourceSchemaInfo> {
        const { dataSource, driver } = await this.Resolve(companyIntegration, contextUser);
        const schemas = options?.Schemas && options.Schemas.length > 0 ? options.Schemas : null;
        const descriptorObjects = schemas
            ? await this.IntrospectSchemas(driver, dataSource, schemas, contextUser)
            : (await driver.IntrospectSchema(dataSource, dataSource.DefaultSchema ?? undefined, contextUser)).Objects;
        const wanted = options?.ObjectNames && options.ObjectNames.length > 0
            ? new Set(options.ObjectNames.map(n => n.toLowerCase()))
            : null;
        const tablesOnly = options?.BaseTablesOnly === true;
        const objects = descriptorObjects.filter(o =>
            (!wanted || wanted.has(o.Name.toLowerCase())) && (!tablesOnly || o.ObjectType === 'table'));
        return {
            Objects: objects.map(o => this.MapObjectToSourceObject(o)),
            // A scoped introspection is never authoritative over the whole surface (mirrors the base rule).
            IsAuthoritative: this.DiscoveryIsAuthoritative && !wanted && !tablesOnly,
        };
    }

    /** How many schemas {@link IntrospectSchemas} introspects at once. */
    protected static readonly SchemaIntrospectionConcurrency = 4;

    /**
     * Introspects the schemas a few at a time (bounded by {@link SchemaIntrospectionConcurrency}) and
     * returns the objects in schema order with schema-qualified names (`schema.object`), so the same table
     * name in two schemas stays distinct downstream.
     */
    protected async IntrospectSchemas(
        driver: BaseExternalDataSourceDriver,
        dataSource: MJExternalDataSourceEntity,
        schemas: readonly string[],
        contextUser: UserInfo,
    ): Promise<ExternalSchemaObject[]> {
        const perSchema: ExternalSchemaObject[][] = new Array(schemas.length);
        let next = 0;
        const worker = async (): Promise<void> => {
            while (next < schemas.length) {
                const index = next++;
                perSchema[index] = await this.introspectQualifiedSchema(driver, dataSource, schemas[index], contextUser);
            }
        };
        const workers = Math.min(BaseExternalDataSourceConnector.SchemaIntrospectionConcurrency, schemas.length);
        await Promise.all(Array.from({ length: workers }, () => worker()));
        return perSchema.flat();
    }

    /** One schema's objects, each name qualified with the schema unless the driver already qualified it. */
    private async introspectQualifiedSchema(
        driver: BaseExternalDataSourceDriver,
        dataSource: MJExternalDataSourceEntity,
        schema: string,
        contextUser: UserInfo,
    ): Promise<ExternalSchemaObject[]> {
        const descriptor = await driver.IntrospectSchema(dataSource, schema, contextUser);
        return descriptor.Objects.map(o => (o.Name.includes('.') ? o : { ...o, Name: `${schema}.${o.Name}`, Schema: o.Schema ?? schema }));
    }

    /** The source's schemas that hold objects, from the driver; empty when the driver cannot enumerate them. */
    public async ListSchemas(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<string[]> {
        const { dataSource, driver } = await this.Resolve(companyIntegration, contextUser);
        return driver.ListSchemas(dataSource, contextUser);
    }

    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<ExternalObjectSchema[]> {
        const { dataSource, driver } = await this.Resolve(companyIntegration, contextUser);
        const descriptor = await driver.IntrospectSchema(dataSource, dataSource.DefaultSchema ?? undefined, contextUser);
        return descriptor.Objects.map(o => ({
            Name: o.Name,
            Label: o.Name,
            SupportsIncrementalSync: this.DetectWatermarkField(o) !== undefined,
            // EDS is read-only today (SupportsReadWrite defaults off); ingestion is Pull-only for now.
            SupportsWrite: false,
        }));
    }

    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo,
    ): Promise<ExternalFieldSchema[]> {
        const { dataSource, driver } = await this.Resolve(companyIntegration, contextUser);
        const descriptor = await driver.IntrospectSchema(dataSource, dataSource.DefaultSchema ?? undefined, contextUser);
        const obj = descriptor.Objects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) {
            return [];
        }
        const fkByColumn = this.BuildForeignKeyMap(obj);
        return obj.Columns.map(c => this.MapColumnToExternalField(c, fkByColumn));
    }

    // ─── Incremental delta ingestion (generic across all EDS drivers) ─────────────

    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const { dataSource, driver } = await this.Resolve(ctx.CompanyIntegration, ctx.ContextUser);
        const meta = await this.ResolveObjectMeta(ctx);

        // Keyset seek: a marker from the previous batch becomes a structured resume point the driver renders
        // in its own dialect. Without a usable marker (first batch, or a PK-less object) fall back to offset.
        const marker = meta.PrimaryKeyFields.length > 0 && ctx.AfterKeyValue
            ? this.ParseKeysetMarker(ctx.AfterKeyValue, meta.PrimaryKeyFields, meta.WatermarkField)
            : undefined;
        const seekAfter = marker ? this.BuildSeekAfter(marker, meta.PrimaryKeyFields, meta.WatermarkField) : undefined;
        // Rows the walk consumed before this batch. A keyset batch reports no NextOffset, so the marker carries
        // the position: a marker that cannot seek then falls back to offset paging from where the walk is,
        // instead of restarting at row 0.
        const walk: KeysetWalk = {
            Driver: driver,
            DataSource: dataSource,
            Context: ctx,
            Meta: meta,
            Position: marker?.Position ?? ctx.CurrentOffset ?? 0,
        };
        return seekAfter?.Watermark?.WithinRange
            ? this.FetchWithinBucket(walk, seekAfter)
            : this.FetchOrderedPage(walk, seekAfter);
    }

    /**
     * One page in (watermark, key) order: seeking from `seekAfter`, or offsetting from the walk position
     * without one. When the whole page is one millisecond bucket that continues past the page, the page is
     * discarded and the bucket is walked by key instead ({@link FetchWithinBucket}).
     */
    protected async FetchOrderedPage(walk: KeysetWalk, seekAfter: ExternalSeekAfter | undefined): Promise<FetchBatchResult> {
        const { Context: ctx, Meta: meta } = walk;
        // Order by watermark then PK (ascending) so the last row carries the max watermark and paging is
        // deterministic. Raw identifiers — the EDS driver quotes them per its own dialect.
        const orderColumns = [meta.WatermarkField, ...meta.PrimaryKeyFields].filter(
            (c): c is string => typeof c === 'string' && c.length > 0,
        );
        // When seeking, offset is always 0 (eliminating the deep OFFSET scan penalty).
        const fetched = await this.RunWalkView(walk, orderColumns, seekAfter, seekAfter ? 0 : walk.Position);
        const hasMore = fetched.length > ctx.BatchSize;
        let rows = hasMore ? fetched.slice(0, ctx.BatchSize) : fetched;

        // Compute the next seek marker from the final row of the batch. A page is first trimmed so it ends on
        // a watermark boundary, which keeps the resume exact for sub-millisecond watermarks.
        let nextAfterKey: string | undefined;
        if (meta.PrimaryKeyFields.length > 0 && hasMore && rows.length > 0) {
            const page = this.TrimPageToWatermarkBucket(rows, fetched[ctx.BatchSize], meta.WatermarkField);
            if (page.SingleBucket && meta.WatermarkField) {
                return this.FetchWithinBucket(walk, this.bucketStartSeek(rows[0], meta.WatermarkField));
            }
            rows = page.Rows;
            nextAfterKey = this.ExtractKeysetMarker(rows[rows.length - 1], meta.PrimaryKeyFields, meta.WatermarkField, {
                BucketConsumed: page.BucketConsumed,
                Position: walk.Position + rows.length,
            });
        }

        return {
            Records: rows.map(r => this.BuildRecord(r, ctx.ObjectName, meta.PrimaryKeyFields, meta.WatermarkField)),
            HasMore: hasMore,
            NextOffset: seekAfter || !hasMore ? undefined : walk.Position + rows.length,
            NextAfterKeyValue: nextAfterKey,
            NewWatermarkValue: this.MaxWatermark(rows, meta.WatermarkField),
        };
    }

    /**
     * One batch of a millisecond bucket that holds more rows than a batch, read in key order. Inside such a
     * bucket the full-precision watermark order (`datetime2(7)`, `timestamp(6)`) cannot be resumed from a
     * millisecond `Date`, so a (watermark, key) seek would skip any row with a later sub-millisecond stamp
     * and a lower key. Key order inside the bucket is exact. Once the bucket is exhausted the marker says
     * the whole bucket is consumed and the walk carries on in (watermark, key) order after it.
     */
    protected async FetchWithinBucket(walk: KeysetWalk, seekAfter: ExternalSeekAfter): Promise<FetchBatchResult> {
        const { Context: ctx, Meta: meta } = walk;
        const fetched = await this.RunWalkView(walk, meta.PrimaryKeyFields, seekAfter, 0);
        const bucketHasMore = fetched.length > ctx.BatchSize;
        const rows = bucketHasMore ? fetched.slice(0, ctx.BatchSize) : fetched;
        const position = walk.Position + rows.length;
        const range = seekAfter.Watermark;
        const nextAfterKey = bucketHasMore || !range
            ? this.ExtractKeysetMarker(rows[rows.length - 1], meta.PrimaryKeyFields, meta.WatermarkField, { WithinBucket: true, Position: position })
            : JSON.stringify({ w: range.Value, wx: range.ExclusiveUpper, k: {}, o: position } satisfies KeysetMarkerJson);
        return {
            Records: rows.map(r => this.BuildRecord(r, ctx.ObjectName, meta.PrimaryKeyFields, meta.WatermarkField)),
            // Rows may follow the bucket; the next batch seeks after it and reports the real end.
            HasMore: true,
            NextAfterKeyValue: nextAfterKey,
            NewWatermarkValue: this.MaxWatermark(rows, meta.WatermarkField),
        };
    }

    /** The seek that reads a row's whole millisecond bucket from its start, in key order. */
    private bucketStartSeek(row: Record<string, unknown>, watermarkField: string): ExternalSeekAfter {
        const bucket = (row[watermarkField] as Date).getTime();
        return {
            Watermark: {
                Field: watermarkField,
                Value: new Date(bucket).toISOString(),
                ExclusiveUpper: new Date(bucket + 1).toISOString(),
                WithinRange: true,
            },
            Keys: [],
        };
    }

    /** Runs one walk page through the driver (one extra row to detect HasMore) and returns its rows. */
    protected async RunWalkView(
        walk: KeysetWalk,
        orderColumns: string[],
        seekAfter: ExternalSeekAfter | undefined,
        offset: number,
    ): Promise<Record<string, unknown>[]> {
        const { Context: ctx, Meta: meta } = walk;
        const result = await walk.Driver.RunView(
            walk.DataSource,
            {
                objectName: ctx.ObjectName,
                // Structured incremental bound (>=) — the EDS driver renders the dialect predicate, quoting,
                // and literal formatting itself, so this connector writes no SQL. Full fetch when unset.
                incrementalSince: ctx.WatermarkValue && meta.WatermarkField
                    ? { Field: meta.WatermarkField, Value: ctx.WatermarkValue }
                    : undefined,
                seekAfter,
                defaultOrderByColumns: orderColumns.length ? orderColumns : undefined,
                maxRows: ctx.BatchSize + 1,
                offset,
            },
            ctx.ContextUser,
        );
        if (!result.success) {
            throw new Error(result.errorMessage ?? `RunView failed for object '${ctx.ObjectName}'`);
        }
        return result.rows;
    }

    /**
     * Trim a page so it ends on a watermark boundary the next seek can resume from exactly. Drivers hand a
     * temporal watermark back as a JavaScript `Date`, which holds whole milliseconds, so two rows whose
     * `datetime2(7)` values differ only below the millisecond are indistinguishable here. Resuming from
     * such a value is exact only when every row sharing it (the "bucket") is inside the page, so when the
     * bucket straddles the page boundary the trailing rows of the bucket are dropped and re-read next
     * batch. When the whole page is one bucket (more rows in one millisecond than the batch size) nothing
     * can be dropped: the result says `SingleBucket` and the caller walks that bucket in key order.
     */
    protected TrimPageToWatermarkBucket(
        rows: Record<string, unknown>[],
        nextRow: Record<string, unknown> | undefined,
        watermarkField: string | undefined
    ): TrimmedPage {
        const lastBucket = watermarkField ? this.watermarkBucket(rows[rows.length - 1][watermarkField]) : undefined;
        if (lastBucket === undefined) {
            // Non-temporal (or NULL) watermark values are exact, so the page already ends on a boundary.
            return { Rows: rows, BucketConsumed: false };
        }
        const nextBucket = nextRow && watermarkField ? this.watermarkBucket(nextRow[watermarkField]) : undefined;
        if (nextBucket !== lastBucket) {
            return { Rows: rows, BucketConsumed: true };
        }
        const bucketStart = rows.findIndex(r => watermarkField && this.watermarkBucket(r[watermarkField]) === lastBucket);
        return bucketStart > 0
            ? { Rows: rows.slice(0, bucketStart), BucketConsumed: true }
            : { Rows: rows, BucketConsumed: false, SingleBucket: true };
    }

    /** The millisecond bucket of a temporal watermark value; undefined for anything that is not a `Date`. */
    private watermarkBucket(value: unknown): number | undefined {
        return value instanceof Date && !isNaN(value.getTime()) ? value.getTime() : undefined;
    }

    /**
     * Extracts a deterministic keyset/seek marker string from the last row of a page for the next batch:
     * JSON `{ w?, wx?, k, b?, o? }` where `w` is the watermark (`null` when NULL), `wx` the exclusive upper
     * bound of a millisecond-truncated `Date` watermark, `k` the key values with their JSON types (a numeric
     * key stays a number, so a type-strict source such as MongoDB keeps matching it) — empty when
     * `BucketConsumed` says the whole `[w, wx)` range is in the page — `b` set while walking inside one
     * bucket in key order, and `o` the walk position (rows consumed so far).
     */
    public ExtractKeysetMarker(
        row: Record<string, unknown>,
        primaryKeyFields: string[],
        watermarkField?: string,
        options: KeysetMarkerOptions = {}
    ): string | undefined {
        if (!row || primaryKeyFields.length === 0) {
            return undefined;
        }

        const keys: Record<string, unknown> = {};
        for (const pk of primaryKeyFields) {
            if (row[pk] !== undefined) {
                keys[pk] = row[pk];
            }
        }

        const marker: KeysetMarkerJson = { k: keys };
        if (watermarkField) {
            this.addWatermarkToMarker(marker, row[watermarkField], options);
        }
        if (options.Position !== undefined) {
            marker.o = options.Position;
        }
        return JSON.stringify(marker);
    }

    /** Sets the marker's watermark part: `null`, an exact value, or a millisecond range for a `Date`. */
    private addWatermarkToMarker(marker: KeysetMarkerJson, raw: unknown, options: KeysetMarkerOptions): void {
        if (raw == null) {
            marker.w = null;
            return;
        }
        if (!(raw instanceof Date)) {
            marker.w = String(raw);
            return;
        }
        const bucket = raw.getTime();
        marker.w = new Date(bucket).toISOString();
        marker.wx = new Date(bucket + 1).toISOString();
        if (options.BucketConsumed) {
            marker.k = {};
        } else if (options.WithinBucket) {
            marker.b = true;
        }
    }

    /**
     * Parses an `AfterKeyValue` string into its watermark and primary-key components. Accepts the JSON
     * shape `ExtractKeysetMarker` writes, a direct key map (`{ "id": 123 }`), or a bare scalar for a single
     * key (the shape earlier versions wrote; its value is a string).
     */
    public ParseKeysetMarker(
        marker: string,
        primaryKeyFields: string[],
        watermarkField?: string
    ): ParsedKeysetMarker | undefined {
        if (!marker || primaryKeyFields.length === 0) {
            return undefined;
        }

        const trimmed = marker.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed) as Record<string, unknown>;
                const structured = this.parseStructuredMarker(parsed, primaryKeyFields, watermarkField);
                if (structured) {
                    return structured;
                }
            } catch {
                // Fall through to the scalar interpretation.
            }
        }

        return primaryKeyFields.length === 1 ? { Keys: { [primaryKeyFields[0]]: trimmed } } : undefined;
    }

    /** The JSON marker shapes: `{ w?, wx?, k, b?, o? }` from `ExtractKeysetMarker`, or a direct key map. */
    private parseStructuredMarker(
        parsed: Record<string, unknown>,
        primaryKeyFields: string[],
        watermarkField?: string
    ): ParsedKeysetMarker | undefined {
        if (parsed.k && typeof parsed.k === 'object') {
            const result: ParsedKeysetMarker = { Keys: parsed.k as Record<string, unknown> };
            if ('w' in parsed) {
                result.Watermark = parsed.w === null ? null : String(parsed.w);
            }
            if (typeof parsed.wx === 'string') {
                result.WatermarkUpper = parsed.wx;
            }
            if (parsed.b === true) {
                result.WithinBucket = true;
            }
            if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) {
                result.Position = parsed.o;
            }
            return result;
        }
        const keys: Record<string, unknown> = {};
        for (const pk of primaryKeyFields) {
            if (pk in parsed) {
                keys[pk] = parsed[pk];
            }
        }
        if (Object.keys(keys).length === 0) {
            return undefined;
        }
        const result: ParsedKeysetMarker = { Keys: keys };
        if (watermarkField && watermarkField in parsed) {
            result.Watermark = parsed[watermarkField] === null ? null : String(parsed[watermarkField]);
        }
        return result;
    }

    /**
     * Turn a parsed marker into the structured resume point the driver renders. Returns undefined when the
     * marker cannot resume this ordering — a key missing from the marker, or a watermark-ordered walk whose
     * marker carries no watermark — so the caller falls back to offset paging rather than seeking wrongly.
     */
    public BuildSeekAfter(
        marker: ParsedKeysetMarker,
        primaryKeyFields: string[],
        watermarkField?: string
    ): ExternalSeekAfter | undefined {
        const keys = this.seekKeys(marker.Keys, primaryKeyFields);
        if (!keys) {
            return undefined;
        }
        if (!watermarkField) {
            return keys.length > 0 ? { Keys: keys } : undefined;
        }
        if (marker.Watermark === undefined) {
            return undefined;
        }
        if (marker.WithinBucket) {
            return typeof marker.Watermark === 'string' && marker.WatermarkUpper
                ? { Watermark: { Field: watermarkField, Value: marker.Watermark, ExclusiveUpper: marker.WatermarkUpper, WithinRange: true }, Keys: keys }
                : undefined;
        }
        if (keys.length === 0 && (marker.Watermark === null || !marker.WatermarkUpper)) {
            return undefined;
        }
        return {
            Watermark: { Field: watermarkField, Value: marker.Watermark, ExclusiveUpper: marker.WatermarkUpper },
            Keys: keys,
        };
    }

    /** The marker's key values in primary-key order; undefined when the marker holds only some of the keys. */
    private seekKeys(values: Record<string, unknown>, primaryKeyFields: string[]): ExternalSeekAfter['Keys'] | undefined {
        const present = primaryKeyFields.filter(pk => values[pk] !== undefined);
        if (present.length === 0) {
            return [];
        }
        if (present.length !== primaryKeyFields.length) {
            return undefined;
        }
        return primaryKeyFields.map(pk => {
            const value = values[pk];
            return { Field: pk, Value: typeof value === 'number' ? value : this.StringifyKeyPart(value) };
        });
    }

    /** Resolve the object's watermark + PK columns from the persisted IntegrationObject/Field cache. */
    protected async ResolveObjectMeta(ctx: FetchContext): Promise<ExternalObjectMeta> {
        const engine = IntegrationEngineBase.Instance;
        await engine.Config(false, ctx.ContextUser);
        const object = engine.GetIntegrationObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (!object) {
            return { PrimaryKeyFields: [] };
        }
        const primaryKeyFields = engine
            .GetIntegrationObjectFields(object.ID)
            .filter(f => f.IsPrimaryKey)
            .map(f => f.Name);
        return { WatermarkField: object.IncrementalWatermarkField ?? undefined, PrimaryKeyFields: primaryKeyFields };
    }

    // ─── Record assembly ──────────────────────────────────────────────────────────

    /** Build an `ExternalRecord` from a source row — full-record pass-through in `Fields`. */
    protected BuildRecord(
        row: Record<string, unknown>,
        objectName: string,
        primaryKeyFields: string[],
        watermarkField: string | undefined,
    ): ExternalRecord {
        const watermarkRaw = watermarkField ? row[watermarkField] : undefined;
        return {
            ExternalID: primaryKeyFields.length
                ? primaryKeyFields.map(f => this.StringifyKeyPart(row[f])).join('|')
                : this.ContentKey(row, watermarkField),
            ObjectType: objectName,
            // Full source record — never a hand-filtered subset (forward-compat custom-field capture).
            Fields: { ...row },
            ModifiedAt: this.CoerceDate(watermarkRaw),
        };
    }

    /** Stable string for one primary-key component (Dates → ISO, null → empty). */
    protected StringifyKeyPart(value: unknown): string {
        if (value == null) {
            return '';
        }
        return value instanceof Date ? value.toISOString() : String(value);
    }

    /**
     * Deterministic content key for a genuinely PK-less row (rare); lets such tables still dedupe.
     * Excludes `watermarkField` when given — the watermark column changes on every update by definition, so
     * including it would mint a new `ExternalID` (and therefore a new inserted record) on every update to
     * the same PK-less row instead of matching its prior identity.
     */
    protected ContentKey(row: Record<string, unknown>, watermarkField?: string): string {
        const excluded = watermarkField?.toLowerCase();
        return Object.keys(row)
            .filter(k => k.toLowerCase() !== excluded)
            .sort()
            .map(k => `${k}=${this.StringifyKeyPart(row[k])}`)
            .join('|');
    }

    /** The batch's max watermark = the last row's watermark value (rows are watermark-ordered ascending). */
    protected MaxWatermark(rows: Record<string, unknown>[], watermarkField: string | undefined): string | undefined {
        if (!watermarkField || rows.length === 0) {
            return undefined;
        }
        const last = rows[rows.length - 1][watermarkField];
        if (last == null) {
            return undefined;
        }
        return last instanceof Date ? last.toISOString() : String(last);
    }

    /**
     * Coerce a raw watermark value into a Date for `ExternalRecord.ModifiedAt` (undefined when unparseable).
     * Delegates full ISO-8601 date-times to the shared {@link parseIso8601AsUtc} helper — the same one the
     * EDS drivers use for incremental-watermark literal formatting and Mongo date coercion — so a ZONELESS
     * ISO string is interpreted as UTC consistently everywhere, not via a locally-reimplemented regex. Falls
     * back to `Date`'s own parsing for non-ISO shapes (e.g. a date-only string) that helper intentionally
     * rejects. (In practice the driver returns `Date`s from `RunView`; this string path is the fallback.)
     */
    protected CoerceDate(value: unknown): Date | undefined {
        if (value instanceof Date) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = parseIso8601AsUtc(value);
            if (parsed) {
                return parsed;
            }
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? undefined : d;
        }
        if (typeof value === 'number') {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? undefined : d;
        }
        return undefined;
    }

    // ─── Descriptor → integration-metadata mapping ────────────────────────────────

    /** Map one EDS object (table/view/collection) to the framework's `SourceObjectInfo`. */
    protected MapObjectToSourceObject(obj: ExternalSchemaObject): SourceObjectInfo {
        const fkByColumn = this.BuildForeignKeyMap(obj);
        const relationships: SourceRelationshipInfo[] = (obj.Relationships ?? []).flatMap(rel =>
            rel.Columns.map(pair => ({
                FieldName: pair.Column,
                TargetObject: rel.ReferencedObject,
                TargetField: pair.ReferencedColumn,
            })),
        );
        return {
            ExternalName: obj.Name,
            ExternalLabel: obj.Name,
            Fields: obj.Columns.map(c => this.MapColumnToSourceField(c, fkByColumn)),
            PrimaryKeyFields: obj.Columns.filter(c => c.IsPrimaryKey).map(c => c.Name),
            Relationships: relationships,
            IncrementalWatermarkField: this.DetectWatermarkField(obj),
        };
    }

    /** Map one EDS column to a `SourceFieldInfo`. Length/precision are absent from the EDS descriptor today. */
    protected MapColumnToSourceField(column: ExternalSchemaColumn, fkByColumn: Map<string, ForeignKeyEdge>): SourceFieldInfo {
        const fk = fkByColumn.get(column.Name.toLowerCase());
        return {
            Name: column.Name,
            Label: column.Name,
            Description: column.Description,
            SourceType: column.NativeType,
            // A NOT-NULL source column is required-on-create AND non-null at rest.
            IsRequired: !column.Nullable,
            AllowsNull: column.Nullable,
            // The EDS descriptor doesn't yet carry length/precision/scale/default — leave null (the schema
            // builder sizes generously). A future EDS descriptor enhancement can surface these.
            MaxLength: null,
            Precision: null,
            Scale: null,
            DefaultValue: null,
            IsPrimaryKey: column.IsPrimaryKey,
            // EDS doesn't distinguish non-PK uniqueness — leave undefined (honest gap) rather than guess.
            IsUniqueKey: undefined,
            IsReadOnly: undefined,
            IsForeignKey: fk !== undefined,
            ForeignKeyTarget: fk?.Target ?? null,
        };
    }

    /** Map one EDS column to the `ExternalFieldSchema` shape used by DiscoverFields. */
    protected MapColumnToExternalField(column: ExternalSchemaColumn, fkByColumn: Map<string, ForeignKeyEdge>): ExternalFieldSchema {
        const fk = fkByColumn.get(column.Name.toLowerCase());
        return {
            Name: column.Name,
            Label: column.Name,
            Description: column.Description,
            DataType: column.NativeType,
            IsRequired: !column.Nullable,
            AllowsNull: column.Nullable,
            IsPrimaryKey: column.IsPrimaryKey,
            IsUniqueKey: false,
            IsReadOnly: false,
            IsForeignKey: fk !== undefined,
            ForeignKeyTarget: fk?.Target ?? null,
        };
    }

    /** Build a column-name → FK-edge map from an object's referencing-side relationships. */
    protected BuildForeignKeyMap(obj: ExternalSchemaObject): Map<string, ForeignKeyEdge> {
        const map = new Map<string, ForeignKeyEdge>();
        for (const rel of obj.Relationships ?? []) {
            for (const pair of rel.Columns) {
                map.set(pair.Column.toLowerCase(), { Target: rel.ReferencedObject, TargetField: pair.ReferencedColumn });
            }
        }
        return map;
    }

    // ─── Watermark detection (conservative, name-based default; operator-overridable) ─

    /** Common "last-changed" column names, normalized (letters only) for a forgiving match. */
    private static readonly watermarkNameHints = new Set([
        'modifiedat', 'updatedat', 'lastmodified', 'lastupdated', 'modified', 'updated',
        'datemodified', 'dateupdated', 'lastmodifieddate', 'lastupdateddate', 'changedate',
        'mjupdatedat', 'rowlastupdated', 'lastchange', 'lastchanged',
        'modifieddate', 'updateddate',
    ]);

    /**
     * Best-effort default watermark column, matched by NAME only (engine-neutral — never inferred from a
     * native type, since e.g. Postgres `timestamp` is a plain datetime, not a rowversion). Only sets the
     * DEFAULT `IncrementalWatermarkField`; an operator can override it on the persisted IntegrationObject.
     * Returns undefined when no conventional column is present (that object then syncs full, not incremental).
     */
    protected DetectWatermarkField(obj: ExternalSchemaObject): string | undefined {
        const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');
        const match = obj.Columns.find(c => BaseExternalDataSourceConnector.watermarkNameHints.has(normalize(c.Name)));
        return match?.Name;
    }
}
