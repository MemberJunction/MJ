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
import { ExternalDataSourceRouter, parseIso8601AsUtc, type ResolvedExternalDataSource } from '@memberjunction/external-data-sources';

/** Resolved foreign-key edge for one referencing column (built from the descriptor's relationships). */
interface ForeignKeyEdge {
    /** The source object the column references. */
    Target: string;
    /** The referenced column on the target object. */
    TargetField: string;
}

/** Per-object sync metadata resolved from the persisted IntegrationObject/Field cache. */
interface ExternalObjectMeta {
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
        const descriptor = await driver.IntrospectSchema(dataSource, dataSource.DefaultSchema ?? undefined, contextUser);
        const wanted = options?.ObjectNames && options.ObjectNames.length > 0
            ? new Set(options.ObjectNames.map(n => n.toLowerCase()))
            : null;
        const objects = wanted
            ? descriptor.Objects.filter(o => wanted.has(o.Name.toLowerCase()))
            : descriptor.Objects;
        return {
            Objects: objects.map(o => this.MapObjectToSourceObject(o)),
            // A scoped introspection is never authoritative over the whole surface (mirrors the base rule).
            IsAuthoritative: this.DiscoveryIsAuthoritative && !wanted,
        };
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

        // Order by watermark then PK (ascending) so the last row carries the max watermark and paging is
        // deterministic. Raw identifiers — the EDS driver quotes them per its own dialect.
        const orderColumns = [meta.WatermarkField, ...meta.PrimaryKeyFields].filter(
            (c): c is string => typeof c === 'string' && c.length > 0,
        );
        const offset = ctx.CurrentOffset ?? 0;
        const result = await driver.RunView(
            dataSource,
            {
                objectName: ctx.ObjectName,
                // Structured incremental bound (>=) — the EDS driver renders the dialect predicate, quoting,
                // and literal formatting itself, so this connector writes no SQL. Full fetch when unset.
                incrementalSince: ctx.WatermarkValue && meta.WatermarkField
                    ? { Field: meta.WatermarkField, Value: ctx.WatermarkValue }
                    : undefined,
                defaultOrderByColumns: orderColumns.length ? orderColumns : undefined,
                // Fetch one extra to detect HasMore without a separate COUNT.
                maxRows: ctx.BatchSize + 1,
                offset,
            },
            ctx.ContextUser,
        );
        if (!result.success) {
            throw new Error(result.errorMessage ?? `RunView failed for object '${ctx.ObjectName}'`);
        }

        const hasMore = result.rows.length > ctx.BatchSize;
        const rows = hasMore ? result.rows.slice(0, ctx.BatchSize) : result.rows;
        return {
            Records: rows.map(r => this.BuildRecord(r, ctx.ObjectName, meta.PrimaryKeyFields, meta.WatermarkField)),
            HasMore: hasMore,
            NextOffset: hasMore ? offset + ctx.BatchSize : undefined,
            NewWatermarkValue: this.MaxWatermark(rows, meta.WatermarkField),
        };
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
    private static readonly WatermarkNameHints = new Set([
        'modifiedat', 'updatedat', 'lastmodified', 'lastupdated', 'modified', 'updated',
        'datemodified', 'dateupdated', 'lastmodifieddate', 'lastupdateddate', 'changedate',
        'mjupdatedat', 'rowlastupdated', 'lastchange', 'lastchanged',
    ]);

    /**
     * Best-effort default watermark column, matched by NAME only (engine-neutral — never inferred from a
     * native type, since e.g. Postgres `timestamp` is a plain datetime, not a rowversion). Only sets the
     * DEFAULT `IncrementalWatermarkField`; an operator can override it on the persisted IntegrationObject.
     * Returns undefined when no conventional column is present (that object then syncs full, not incremental).
     */
    protected DetectWatermarkField(obj: ExternalSchemaObject): string | undefined {
        const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');
        const match = obj.Columns.find(c => BaseExternalDataSourceConnector.WatermarkNameHints.has(normalize(c.Name)));
        return match?.Name;
    }
}
