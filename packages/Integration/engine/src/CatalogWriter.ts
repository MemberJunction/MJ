import { BaseEntity, CompositeKey, DatabaseProviderBase, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import type { MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    CatalogProvenance,
    CompanyIntegrationCatalogSchemaMismatch,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    DECLARED_OWNED_OBJECT_COLUMNS,
    DECLARED_OWNED_FIELD_COLUMNS,
} from '@memberjunction/integration-engine-base';

/**
 * One write interface over BOTH integration catalogs — the one shared by every connection of a
 * connector, and the one belonging to a single connection.
 *
 * The persistence logic is identical for both: the same per-attribute overlay deciders, the same
 * two-pass object-then-field ordering, the same reactivate-on-rediscover rule, the same
 * absent-deactivation pass. Only the entity name, the scope filter and a few ownership columns
 * differ. This abstracts exactly those and leaves the merge logic untouched.
 *
 * ── Why the rows are proxies ───────────────────────────────────────────────────────────────────
 *
 * The per-connection entities are registered by a migration, not by CodeGen (tenant CodeGen
 * excludes the core schema), so they have NO generated subclass. On such a row:
 *
 *     row.Description = 'x';   // creates an own property beside the entity's field list
 *     await row.Save();        // returns true, sends nothing, logs nothing
 *
 * There is no accessor to intercept the assignment. Across a discovery persisting hundreds of rows
 * that presents as a source that returned less than expected — a vendor problem, not a code one.
 *
 * A proxy closes that gap without touching the merge logic. Property access it cannot find on the
 * row falls through to `Get`/`Set`, which is exactly what a generated accessor does:
 *
 *     get Description() { return this.Get('Description'); }
 *     set Description(v) { this.Set('Description', v); }
 *
 * So for the SHARED catalog the proxy is transparent — the real accessor is found on the prototype
 * and used. For the per-connection catalog it supplies the accessor that was never generated. The
 * alternative was rewriting ~50 assignments in a 1,181-line file whose orchestration has no test
 * coverage at all; this way the delicate part does not move.
 *
 * Methods are bound to the underlying row rather than the proxy, so `Save()` runs against the real
 * entity and cannot recurse back through this handler.
 */

/** Write-side column aliases, mirroring what the per-connection VIEW already does for reads. */
const FIELD_WRITE_ALIASES: Readonly<Record<string, string>> = {
    // A field's parent and its dependency-edge target are named for the shared catalog throughout
    // the persistence code. On the per-connection tables the real columns carry the per-connection
    // names, and the view exposes the shared names as aliases. Mapping them here means the merge
    // logic keeps writing `field.IntegrationObjectID` and lands on the right column.
    IntegrationObjectID: 'CompanyIntegrationObjectID',
    RelatedIntegrationObjectID: 'RelatedCompanyIntegrationObjectID',
};

/**
 * Wrap a row so property access resolves through `Get`/`Set`, with an optional column allowlist and
 * alias map.
 *
 * `required` is set only for the per-connection entities and does two jobs. On wrap it asserts the
 * loaded entity carries every column this code writes, so an absent or stale migration fails here,
 * named, instead of as scattered missing values hours later in a run that reported success. On each
 * write it checks the column against the ROW'S OWN field list — not against `required` — because
 * those answer different questions: `required` is what we expect, the field list is what the
 * database actually has, and it is the gap between them that loses writes silently.
 *
 * The shared entities are left unguarded: their generated subclass turns a bad column name into a
 * compile error long before this point.
 */
function proxyRow<T>(
    row: BaseEntity,
    entityName: string,
    required: readonly string[] | null,
    aliases: Readonly<Record<string, string>> | null
): T {
    const columns = required === null ? null : new Set((row.Fields ?? []).map(f => f.Name));
    if (required !== null && columns !== null) {
        const missing = required.filter(c => !columns.has(c));
        if (missing.length > 0) throw new CompanyIntegrationCatalogSchemaMismatch(entityName, missing);
    }
    return new Proxy(row, {
        get(target, prop, receiver) {
            if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
            if (prop in target) {
                const value = Reflect.get(target, prop, target);
                // Bind to the REAL row: an unbound method called on the proxy would run its own
                // internals back through this handler.
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return target.Get(aliases?.[prop] ?? prop);
        },
        set(target, prop, value, receiver) {
            if (typeof prop !== 'string') return Reflect.set(target, prop, value, receiver);
            if (prop in target) return Reflect.set(target, prop, value, target);
            const column = aliases?.[prop] ?? prop;
            if (columns && !columns.has(column)) {
                throw new Error(
                    `${entityName} has no column '${column}'`
                    + (column === prop ? '' : ` (aliased from '${prop}')`)
                    + `. Writing it would create a property beside the entity's field list and `
                    + `Save() would report success while writing nothing.`
                );
            }
            target.Set(column, value);
            return true;
        },
    }) as unknown as T;
}

/**
 * Reads and creates for one catalog, scoped to whatever "this connector" means for it.
 *
 * `ObjectsInScope` deliberately returns rows of EVERY status. Disabled rows are load-bearing: an
 * object the source dropped is disabled rather than deleted, and if it reappears the overlay must
 * find and reactivate that row. Matching active rows only would attempt a second row with the same
 * name and hit the unique constraint instead.
 *
 * These read straight from the database rather than the engine cache, deliberately. The cache is
 * refreshed between discovery passes, not within one, so the write path must be able to see rows a
 * previous pass of the SAME run just persisted. It is also what makes the per-connection catalog
 * writable at all: its cached rows are read-only projections with no `Save()`.
 */
export interface CatalogWriter {
    readonly Source: 'Shared' | 'PerConnection';

    ObjectsInScope(): Promise<MJIntegrationObjectEntity[]>;
    FieldsForObject(objectID: string): Promise<MJIntegrationObjectFieldEntity[]>;
    NewObjectRow(): Promise<MJIntegrationObjectEntity>;
    NewFieldRow(): Promise<MJIntegrationObjectFieldEntity>;
    LoadObject(objectID: string): Promise<MJIntegrationObjectEntity | null>;
    LoadField(fieldID: string): Promise<MJIntegrationObjectFieldEntity | null>;

    /**
     * Write the columns saying who a newly-created object belongs to and where its shape came from.
     * A no-op on the shared catalog beyond the integration id, which is the only ownership it has.
     */
    StampNewObject(row: MJIntegrationObjectEntity, declaredObjectID: string | null, provenance: CatalogProvenance): void;

    /** The field counterpart of {@link StampNewObject}. */
    StampNewField(row: MJIntegrationObjectFieldEntity, declaredFieldID: string | null, provenance: CatalogProvenance): void;

    /** Record that this row was seen — and optionally sampled — by the discovery now running. */
    MarkSeen(row: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity, sampled: boolean): void;

    /**
     * Retire an object/field that an AUTHORITATIVE discovery no longer returns.
     *
     * The two catalogs differ here on purpose, which is why this is a writer method and not an
     * `if` at the call site:
     *   - SHARED rows are DISABLED, never deleted. They are the declared metadata every other
     *     connection of the connector still reads, and a missing row there is unrecoverable.
     *   - PER-CONNECTION OBJECTS are DELETED. plan.md: "Removed tables are more than deselected,
     *     they just dont exist, its likely a cascade delete." Nothing else owns them, and leaving
     *     tombstones would make the connection's catalog drift from its source forever.
     *
     * Returns whether the row is gone (`deleted`) so the caller can report honestly; the mirror
     * TABLE and its data are never touched either way.
     */
    /**
     * Reset the connector-DECLARED columns of an existing row from the declared definition,
     * before discovery overlays it.
     *
     * plan.md: a refresh uses IO/IOF as the source of truth and REPLACES what is in CIO/CIOF,
     * because the per-connection row is a projection, not an accumulator. Without this an open-app
     * upgrade that changes a declared APIPath or page size never reaches a connection that has
     * already discovered once. Shared writers no-op: there the row IS the declaration.
     */
    RebaseFromDeclared(row: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity,
                       declared: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity | null,
                       kind: 'object' | 'field'): string[];

    RetireObject(row: MJIntegrationObjectEntity): Promise<{ ok: boolean; deleted: boolean }>;
    RetireField(row: MJIntegrationObjectFieldEntity): Promise<{ ok: boolean; deleted: boolean }>;
}

/**
 * Escape a value for an ExtraFilter literal. These are UUIDs from our own tables, so this is
 * belt-and-braces rather than a live hazard — but the surrounding engine escapes its filter values
 * and an unescaped one here would be the odd exception a reader has to stop and think about.
 */
function lit(value: string): string {
    return value.replace(/'/g, "''");
}

async function newRow<T>(
    md: IMetadataProvider, entityName: string, contextUser: UserInfo,
    guard: readonly string[] | null, aliases: Readonly<Record<string, string>> | null
): Promise<T> {
    const row = await md.GetEntityObject<BaseEntity>(entityName, contextUser);
    if (!row) throw new CompanyIntegrationCatalogSchemaMismatch(entityName, ['<entity not registered>']);
    row.NewRecord();
    return proxyRow<T>(row, entityName, guard, aliases);
}

async function loadRow<T>(
    md: IMetadataProvider, entityName: string, contextUser: UserInfo, id: string,
    guard: readonly string[] | null, aliases: Readonly<Record<string, string>> | null
): Promise<T | null> {
    const row = await md.GetEntityObject<BaseEntity>(entityName, contextUser);
    if (!row) return null;
    // `Load(id)` is a generated-subclass convenience; this is the base entry point, and the only
    // one available for an entity a migration registered rather than CodeGen.
    const ok = await row.InnerLoad(CompositeKey.FromID(id));
    return ok ? proxyRow<T>(row, entityName, guard, aliases) : null;
}

async function viewRows<T>(
    entityName: string, filter: string, contextUser: UserInfo, provider: IMetadataProvider | undefined,
    guard: readonly string[] | null, aliases: Readonly<Record<string, string>> | null
): Promise<T[]> {
    // Server-side providers are DatabaseProviderBase, which implements IRunViewProvider; the
    // narrower IMetadataProvider we are handed does not declare it. Same narrowing, and the same
    // reason, as IntegrationEngine's own RunView construction in this package.
    const rv = new RunView(provider as DatabaseProviderBase | undefined);
    const res = await rv.RunView<BaseEntity>(
        { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object' }, contextUser);
    if (!res?.Success) return [];
    return (res.Results ?? []).map(r => proxyRow<T>(r, entityName, guard, aliases));
}

/** The catalog shared by every connection of a connector. Today's behaviour, unchanged. */
/**
 * `MJ_INTEGRATION_CATALOG_STRICT=1` makes the DECLARED catalog read-only at runtime.
 *
 * `MJ: Integration Object(Field)s` are the connector's shipped metadata, and they are not merely
 * reference data: `PerConnectionCatalogWriter.RebaseFromDeclared` copies their columns onto every
 * per-connection row on every discovery, so they are the FLOOR every connection is rebuilt from.
 * A single connection left on the shared catalog writes its own sampled shape into that floor, and
 * every later connection of the same connector then inherits one account's widths and columns as
 * though the vendor had declared them.
 *
 * Observed on the sandbox, 2026-09-11: one discovery on a `Shared` connection added 69 sampled
 * columns and overwrote 4 columns on 487 declared fields. The run reported success and nothing
 * anywhere recorded that the declared catalog had changed — it was only provable because a
 * snapshot had been taken beforehand.
 *
 * Deliberately OFF by default and enabled per environment: a connection legitimately on the shared
 * catalog (one that predates the per-connection tables and has not been backfilled) writes here by
 * design, and would start failing. Turn it on where every connection is already per-connection —
 * the sandbox — so a regression is a loud failure rather than silent corruption. Reads are
 * untouched; only the row-producing calls throw, so the declared floor stays readable.
 */
const STRICT_ENV = 'MJ_INTEGRATION_CATALOG_STRICT';

function strictDeclaredCatalog(): boolean {
    const v = process.env[STRICT_ENV];
    return v === '1' || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
}

export class SharedCatalogWriter implements CatalogWriter {
    public readonly Source = 'Shared' as const;
    private static readonly OBJECTS = 'MJ: Integration Objects';
    private static readonly FIELDS = 'MJ: Integration Object Fields';

    constructor(
        private readonly md: IMetadataProvider,
        private readonly integrationID: string,
        private readonly contextUser: UserInfo
    ) {}

    public ObjectsInScope(): Promise<MJIntegrationObjectEntity[]> {
        return viewRows(SharedCatalogWriter.OBJECTS, `IntegrationID = '${lit(this.integrationID)}'`,
                        this.contextUser, this.md, null, null);
    }

    public FieldsForObject(objectID: string): Promise<MJIntegrationObjectFieldEntity[]> {
        return viewRows(SharedCatalogWriter.FIELDS, `IntegrationObjectID = '${lit(objectID)}'`,
                        this.contextUser, this.md, null, null);
    }

    /**
     * The four calls below exist to hand the caller a row it is about to mutate and Save, so they
     * are the write boundary — guarding them, rather than the reads above, keeps the declared floor
     * readable while making a runtime write to it impossible. See `strictDeclaredCatalog`.
     */
    private refuseIfStrict(what: string): void {
        if (!strictDeclaredCatalog()) return;
        throw new Error(
            `DECLARED_CATALOG_READONLY: refusing to ${what} in the shared/declared catalog for `
            + `integration ${this.integrationID}. ${STRICT_ENV} is set, which makes `
            + `"MJ: Integration Object(Field)s" read-only at runtime — they hold the connector's `
            + `DECLARED metadata, and every per-connection catalog is rebased from them, so a `
            + `discovery writing here would put one account's shape into every other connection of `
            + `this connector. Set this connection's Configuration.catalogSource to "perConnection" `
            + `(MJ Central stamps that at create), or unset ${STRICT_ENV} if this environment still `
            + `has connections that legitimately use the shared catalog.`
        );
    }

    public NewObjectRow(): Promise<MJIntegrationObjectEntity> {
        this.refuseIfStrict('create an object');
        return newRow(this.md, SharedCatalogWriter.OBJECTS, this.contextUser, null, null);
    }

    public NewFieldRow(): Promise<MJIntegrationObjectFieldEntity> {
        this.refuseIfStrict('create a field');
        return newRow(this.md, SharedCatalogWriter.FIELDS, this.contextUser, null, null);
    }

    public LoadObject(id: string): Promise<MJIntegrationObjectEntity | null> {
        this.refuseIfStrict('modify an object');
        return loadRow(this.md, SharedCatalogWriter.OBJECTS, this.contextUser, id, null, null);
    }

    public LoadField(id: string): Promise<MJIntegrationObjectFieldEntity | null> {
        this.refuseIfStrict('modify a field');
        return loadRow(this.md, SharedCatalogWriter.FIELDS, this.contextUser, id, null, null);
    }

    /** The shared catalog records ownership as the integration id and nothing else. */
    public StampNewObject(row: MJIntegrationObjectEntity): void {
        row.IntegrationID = this.integrationID;
    }

    public StampNewField(): void {
        /* the parent object id is the only ownership a shared field row carries */
    }

    /** The shared row IS the declaration; there is nothing to rebase it from. */
    public RebaseFromDeclared(): string[] { return []; }

    /** Shared rows are the declared floor for every other connection — disable, never delete. */
    public async RetireObject(row: MJIntegrationObjectEntity): Promise<{ ok: boolean; deleted: boolean }> {
        row.Status = 'Disabled';
        return { ok: await row.Save(), deleted: false };
    }

    public async RetireField(row: MJIntegrationObjectFieldEntity): Promise<{ ok: boolean; deleted: boolean }> {
        row.Status = 'Disabled';
        return { ok: await row.Save(), deleted: false };
    }

    public MarkSeen(): void {
        /* the shared catalog has no seen timestamps */
    }
}

/** One connection's own catalog. */
export class PerConnectionCatalogWriter implements CatalogWriter {
    public readonly Source = 'PerConnection' as const;

    constructor(
        private readonly md: IMetadataProvider,
        private readonly companyIntegrationID: string,
        private readonly integrationID: string,
        private readonly contextUser: UserInfo,
        /** Stamped on every row this run touches, so "when did we last see this" is answerable. */
        private readonly seenAt: Date
    ) {}

    public ObjectsInScope(): Promise<MJIntegrationObjectEntity[]> {
        return viewRows(ENTITY_COMPANY_INTEGRATION_OBJECTS,
                        `CompanyIntegrationID = '${lit(this.companyIntegrationID)}'`,
                        this.contextUser, this.md, CATALOG_OBJECT_COLUMNS, null);
    }

    public FieldsForObject(objectID: string): Promise<MJIntegrationObjectFieldEntity[]> {
        return viewRows(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
                        `CompanyIntegrationObjectID = '${lit(objectID)}'`,
                        this.contextUser, this.md, CATALOG_FIELD_COLUMNS, FIELD_WRITE_ALIASES);
    }

    public NewObjectRow(): Promise<MJIntegrationObjectEntity> {
        return newRow(this.md, ENTITY_COMPANY_INTEGRATION_OBJECTS, this.contextUser,
                      CATALOG_OBJECT_COLUMNS, null);
    }

    public NewFieldRow(): Promise<MJIntegrationObjectFieldEntity> {
        return newRow(this.md, ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, this.contextUser,
                      CATALOG_FIELD_COLUMNS, FIELD_WRITE_ALIASES);
    }

    public LoadObject(id: string): Promise<MJIntegrationObjectEntity | null> {
        return loadRow(this.md, ENTITY_COMPANY_INTEGRATION_OBJECTS, this.contextUser, id,
                       CATALOG_OBJECT_COLUMNS, null);
    }

    public LoadField(id: string): Promise<MJIntegrationObjectFieldEntity | null> {
        return loadRow(this.md, ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, this.contextUser, id,
                       CATALOG_FIELD_COLUMNS, FIELD_WRITE_ALIASES);
    }

    /**
     * A new per-connection object records the connection it belongs to, the declared row it was
     * matched to (null when the object exists only for this connection — the case the shared
     * catalog cannot represent at all), where its shape came from, and when it was first seen.
     *
     * `IsSelected` starts FALSE. Catalog membership is not sync selection, and keeping them apart
     * is the point of the table: conflating them is why a newly-discovered object arriving disabled
     * disappeared from schema introspection, key inference and migration, with no error anywhere.
     */
    public StampNewObject(row: MJIntegrationObjectEntity, declaredObjectID: string | null, provenance: CatalogProvenance): void {
        const w = row as unknown as Record<string, unknown>;
        w.CompanyIntegrationID = this.companyIntegrationID;
        w.IntegrationID = this.integrationID;
        w.IntegrationObjectID = declaredObjectID;
        w.Provenance = provenance;
        w.IsSelected = false;
        w.FirstSeenAt = this.seenAt;
        w.LastSeenAt = this.seenAt;
    }

    public StampNewField(row: MJIntegrationObjectFieldEntity, declaredFieldID: string | null, provenance: CatalogProvenance): void {
        // Written through the raw column name: on the FIELD entity `IntegrationObjectFieldID` is a
        // real provenance column, not one of the aliases above.
        const w = row as unknown as Record<string, unknown>;
        w.IntegrationObjectFieldID = declaredFieldID;
        w.Provenance = provenance;
        w.IsSelected = false;
        w.FirstSeenAt = this.seenAt;
        w.LastSeenAt = this.seenAt;
    }

    /**
     * Copy the declared columns back over this connection's row so discovery overlays a CURRENT
     * declaration rather than its own previous output. Returns the columns that actually moved,
     * for the merge log. A row with no declared match (an object that exists only for this
     * connection) has nothing to rebase from and is left alone.
     */
    public RebaseFromDeclared(
        row: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity,
        declared: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity | null,
        kind: 'object' | 'field'
    ): string[] {
        if (!declared) return [];
        const cols = kind === 'object' ? DECLARED_OWNED_OBJECT_COLUMNS : DECLARED_OWNED_FIELD_COLUMNS;
        const target = row as unknown as Record<string, unknown>;
        const source = declared as unknown as Record<string, unknown>;
        const moved: string[] = [];
        for (const c of cols) {
            const next = source[c] ?? null;
            if ((target[c] ?? null) === next) continue;
            target[c] = next;
            moved.push(c);
        }
        return moved;
    }

    /**
     * Delete, not disable — see the interface comment.
     *
     * Order matters and there is no ON DELETE CASCADE in the migration (deletes are deliberately
     * explicit, so nothing disappears as a side effect of an unrelated write):
     *   1. NULL out inbound dependency edges. `RelatedCompanyIntegrationObjectID` is self-
     *      referencing, so another object's field may point at this one; deleting underneath it
     *      would violate that FK and abort the whole persist. Nulling drops the edge and keeps the
     *      referencing field alive, which is right — the field still exists in the source, only
     *      the thing it pointed at is gone.
     *   2. Delete this object's own fields (the FK child rows).
     *   3. Delete the object.
     */
    public async RetireObject(row: MJIntegrationObjectEntity): Promise<{ ok: boolean; deleted: boolean }> {
        const inbound = await viewRows<MJIntegrationObjectFieldEntity>(
            ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
            `RelatedCompanyIntegrationObjectID = '${lit(row.ID)}'`,
            this.contextUser, this.md, CATALOG_FIELD_COLUMNS, FIELD_WRITE_ALIASES);
        for (const edge of inbound) {
            (edge as unknown as Record<string, unknown>).RelatedCompanyIntegrationObjectID = null;
            if (!(await edge.Save())) {
                LogError(`[CatalogWriter] Could not clear dependency edge ${edge.ID} -> ${row.ID}; not deleting the object.`);
                return { ok: false, deleted: false };
            }
        }
        for (const child of await this.FieldsForObject(row.ID)) {
            if (!(await child.Delete())) {
                LogError(`[CatalogWriter] Could not delete field ${child.ID} of ${row.ID}; not deleting the object.`);
                return { ok: false, deleted: false };
            }
        }
        return { ok: await row.Delete(), deleted: true };
    }

    /**
     * DISABLE, never delete — unlike the object above.
     *
     * The delete rule is dictated for TABLES and only tables: plan.md says "for tables only, if
     * its not there after discovery algorithm, just removes it", and again "columns that are in
     * MJC already never get removed, tables maybe if discovery objects doesnt find them, NEVER
     * columns".
     *
     * The reason is in everything.txt: "sometimes, a column may be missing. If that is the case,
     * then it doesnt automatically conclude the column no longer exist ... typically just may mean
     * there is no more values". A column absent from one sample is absent from a SAMPLE, not from
     * the source. Deleting the row destroys what only this connection knows about it — the
     * observed width, the provenance, the selection state — so the next sample that does see it
     * starts from nothing instead of reactivating. Disabling keeps all of it and reverses itself
     * on rediscovery, which is what the shared catalog has always done.
     *
     * A field DOES get deleted when its OBJECT is removed; that cascade lives in RetireObject and
     * is the table rule, not this one.
     */
    public async RetireField(row: MJIntegrationObjectFieldEntity): Promise<{ ok: boolean; deleted: boolean }> {
        row.Status = 'Disabled';
        return { ok: await row.Save(), deleted: false };
    }

    public MarkSeen(row: MJIntegrationObjectEntity | MJIntegrationObjectFieldEntity, sampled: boolean): void {
        const w = row as unknown as Record<string, unknown>;
        w.LastSeenAt = this.seenAt;
        if (sampled) w.LastSampledAt = this.seenAt;
    }
}
