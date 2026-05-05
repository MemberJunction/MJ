/**
 * @module database-designer.engine
 * @description Read-only data access engine for the Database Designer Angular UI.
 *
 * `DatabaseDesignerEngine` is a `BaseSingleton` (NOT an Angular service) that:
 *  - Loads the list of entities accessible to the current user
 *  - Loads full entity detail for the modify wizard
 *  - Loads available schemas from `MJ: Schema Info` (async, cached per-user)
 *  - Checks whether a proposed entity name / table name is available
 *
 * ### Why BaseSingleton, not @Injectable?
 * Engine classes hold a cross-request cache that must survive Angular's DI
 * lifecycle boundaries (the same instance is reused across multiple wizard
 * openings in the same session).  `BaseSingleton` uses the MJ Global Object
 * Store which guarantees exactly one instance per process, even across ESBuild
 * code-split chunks.
 *
 * ### Usage
 * ```typescript
 * const engine = DatabaseDesignerEngine.Instance;
 * const entities = await engine.loadAccessibleEntities();
 * ```
 *
 * @see DatabaseDesignerService — for action invocation (create, modify, validate)
 */

import { Metadata, RunView, AuthorizationEvaluator } from '@memberjunction/core';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';

import type {
    AccessibleEntity,
    AccessibleEntityDetail,
    ColumnSpec,
    ForeignKeySpec,
    SchemaOption,
} from '../database-designer.types.js';

// ─── Constants (mirror database-designer-core/src/interfaces.ts) ───────────────
// These string values MUST stay in sync with the server-side constants.
// If the server-side values change, update here in parallel.

const UDT_SCHEMA_NAME = '__mj_UDT';

const UDT_SETTINGS = {
    OWNER_KEY: 'MJ:UDT:Owner',
    SOURCE_KEY: 'MJ:UDT:Source',
    SOURCE_DATABASE_DESIGNER: 'DatabaseDesigner',
    SOURCE_AGENT_MANAGER: 'AgentManager',
} as const;

const ENTITY_DESIGNER_AUTH = {
    CREATE_IN_UDT_SCHEMA: 'Create in UDT Schema',
    CREATE_IN_CUSTOM_SCHEMA: 'Create in Custom Schema',
    MODIFY_OWN_ENTITIES: 'Modify Own Entities',
    MODIFY_ANY_UDT_ENTITIES: 'Modify Any UDT Entities',
} as const;

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1_000;

// ─── Columns managed automatically by CodeGen (never shown as user-editable) ─

/**
 * Normalised lower-case set of column names that CodeGen injects on every entity.
 * These are filtered out of the modify wizard so users cannot inadvertently remove or
 * rename them.  The set is compared after calling `.toLowerCase()` on each column name
 * so it is case-insensitive regardless of DB platform.
 */
const AUTO_MANAGED_COLUMNS = new Set(['id', '__mj_createdat', '__mj_updatedat']);

// ─── Internal row types for RunView results ───────────────────────────────────

interface SettingsRow { EntityID: string; Value: string }
interface EntityRow { ID: string; Name: string; BaseTable: string; SchemaName: string; __mj_CreatedAt: string }
interface FieldRow {
    ID: string;
    EntityID: string;
    Name: string;
    Type: string;
    AllowsNull: boolean;
    Description: string;
    DefaultValue: string | null;
    MaxLength: number | null;
    Precision: number | null;
    Scale: number | null;
}

// ─── Cache entry ─────────────────────────────────────────────────────────────

interface EntityListCacheEntry {
    entities: AccessibleEntity[];
    timestamp: number;
}

interface SchemaCacheEntry {
    schemas: SchemaOption[];
    timestamp: number;
}

// ─── Frontend-only schema blocklist ──────────────────────────────────────────
// `MJ: Schema Info` only surfaces MJ-registered schemas, so system schemas
// (sys, dbo, information_schema) never appear.  Only __mj must be blocked here.
// Server-side RSM.GetAllProtectedSchemas() remains the authoritative gate.
const FRONTEND_BLOCKED_SCHEMAS = new Set(['__mj']);

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Singleton data access engine for Database Designer.
 * All methods read data; none modifies state (mutations go through `DatabaseDesignerService`).
 */
export class DatabaseDesignerEngine extends BaseSingleton<DatabaseDesignerEngine> {

    public static get Instance(): DatabaseDesignerEngine {
        return super.getInstance<DatabaseDesignerEngine>();
    }

    protected constructor() { super(); }

    // ─── Cache ────────────────────────────────────────────────────────────

    /** Per-user entity list cache. Key = userID. */
    private readonly _cache = new Map<string, EntityListCacheEntry>();

    /** Per-user schema list cache. Key = userID. Invalidated alongside entity cache. */
    private readonly _schemaCache = new Map<string, SchemaCacheEntry>();

    /** Invalidate all per-user caches for the current user (call after create/modify). */
    public invalidateCache(): void {
        const userId = new Metadata().CurrentUser?.ID; // global-provider-ok: client-side Angular engine, single provider
        if (userId) {
            this._cache.delete(userId);
            this._schemaCache.delete(userId);
        }
    }

    // ─── Entity list ──────────────────────────────────────────────────────

    /**
     * Load all entities accessible to the current user.
     *
     * - **Admin** (holds `Modify Any UDT Entities`): sees all entities created by
     *   Database Designer or Agent Manager, with ownership annotations.
     * - **Regular user**: sees only entities they own (`MJ:UDT:Owner = userId`).
     *
     * Results are cached per-user with a 5-minute TTL.
     */
    public async loadAccessibleEntities(): Promise<AccessibleEntity[]> {
        const md = new Metadata(); // global-provider-ok: client-side Angular engine, single provider
        const userId = md.CurrentUser?.ID;
        if (!userId) return [];

        const cached = this._cache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.entities;
        }

        const isAdmin = this.currentUserCanModifyAny();
        const entities = isAdmin
            ? await this.loadAllEntities(userId)
            : await this.loadOwnedEntities(userId);

        this._cache.set(userId, { entities, timestamp: Date.now() });
        return entities;
    }

    /**
     * Load full entity detail (columns, foreign keys, description) for the modify wizard.
     * Not cached — always fetches fresh data so the wizard reflects current DB state.
     */
    public async loadEntityDetail(entityId: string): Promise<AccessibleEntityDetail | null> {
        const rv = new RunView();
        // BypassCache: true on both queries because CodeGen writes Entity Fields via direct
        // SQL (outside BaseEntity.Save()), so the server-side RunView cache never receives
        // an invalidation event after a pipeline run.  Without this, the detail view would
        // show stale field data (e.g. old AllowsNull value) until MJAPI restarts.
        const [entityResult, fieldsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Entities',
                ExtraFilter: `ID = '${escapeSqlId(entityId)}'`,
                Fields: ['ID', 'Name', 'BaseTable', 'SchemaName', 'Description', '__mj_CreatedAt'],
                ResultType: 'simple',
                BypassCache: true,
            },
            {
                EntityName: 'MJ: Entity Fields',
                ExtraFilter: `EntityID = '${escapeSqlId(entityId)}' AND IsVirtual = 0`,
                Fields: ['ID', 'EntityID', 'Name', 'Type', 'AllowsNull', 'Description', 'DefaultValue', 'MaxLength', 'Precision', 'Scale'],
                OrderBy: 'Sequence ASC, Name ASC',
                ResultType: 'simple',
                BypassCache: true,
            },
        ]);

        if (!entityResult.Success || entityResult.Results.length === 0) return null;

        const entity = entityResult.Results[0] as EntityRow & { Description: string };
        const fieldRows = (fieldsResult.Results ?? []) as FieldRow[];

        const isOwner = await this.isCurrentUserOwner(entityId);

        // Exclude auto-managed columns (ID, __mj_CreatedAt, __mj_UpdatedAt) from the editable
        // column list.  CodeGen injects these automatically — they must not be user-modified.
        const editableFields = fieldRows.filter(
            f => !AUTO_MANAGED_COLUMNS.has(f.Name.toLowerCase())
        );

        return {
            entityId: entity.ID,
            entityName: entity.Name,
            tableName: entity.BaseTable,
            schemaName: entity.SchemaName,
            description: entity.Description ?? '',
            fieldCount: editableFields.length,
            createdAt: new Date(entity.__mj_CreatedAt),
            isOwner,
            columns: editableFields.map(f => this.mapFieldToColumnSpec(f)),
            foreignKeys: [],  // FK detail loaded on demand — Phase 5e
        };
    }

    // ─── Schema options ───────────────────────────────────────────────────

    /**
     * Return the list of schemas the current user is authorized to create tables in.
     *
     * Async — queries `MJ: Schema Info` to surface real DB schemas for users
     * with `Create in Custom Schema` authorization.  Results are cached per-user
     * with the same 5-minute TTL as the entity list.
     *
     * Order:
     *   1. `__mj_UDT`  (if user holds `Create in UDT Schema`)
     *   2. Real DB schemas from `MJ: Schema Info`, excluding blocked schemas
     *      and `__mj_UDT` (already listed first)
     *   3. "Other (enter schema name)" free-text option, at the end
     *
     * All items beyond #1 require `Create in Custom Schema` authorization.
     */
    public async loadAvailableSchemas(): Promise<SchemaOption[]> {
        const userId = new Metadata().CurrentUser?.ID; // global-provider-ok: client-side Angular engine, single provider
        if (!userId) return [];

        const cached = this._schemaCache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.schemas;
        }

        const schemas = await this.fetchAvailableSchemas();
        this._schemaCache.set(userId, { schemas, timestamp: Date.now() });
        return schemas;
    }

    /** Build the schema option list: UDT first, then real DB schemas, then Other. */
    private async fetchAvailableSchemas(): Promise<SchemaOption[]> {
        const md = new Metadata(); // global-provider-ok: client-side Angular engine, single provider
        const evaluator = new AuthorizationEvaluator();

        const udtAuth    = md.Authorizations.find(a => a.Name === ENTITY_DESIGNER_AUTH.CREATE_IN_UDT_SCHEMA);
        const customAuth = md.Authorizations.find(a => a.Name === ENTITY_DESIGNER_AUTH.CREATE_IN_CUSTOM_SCHEMA);

        const canUseUdt    = !!(udtAuth    && evaluator.CurrentUserCanExecuteWithAncestors(udtAuth));
        const canUseCustom = !!(customAuth && evaluator.CurrentUserCanExecuteWithAncestors(customAuth));

        const schemas: SchemaOption[] = [];

        if (canUseUdt) {
            schemas.push({
                value: UDT_SCHEMA_NAME,
                label: `${UDT_SCHEMA_NAME} — User-Defined Tables (default)`,
                isDefault: true,
                requiresElevatedAuth: false,
            });
        }

        if (canUseCustom) {
            const dbSchemas = await this.loadDbSchemaNames();
            for (const schemaName of dbSchemas) {
                // Skip the UDT schema (already first) and any server-blocked schemas
                if (schemaName === UDT_SCHEMA_NAME) continue;
                if (FRONTEND_BLOCKED_SCHEMAS.has(schemaName)) continue;
                schemas.push({
                    value: schemaName,
                    label: schemaName,
                    isDefault: false,
                    requiresElevatedAuth: true,
                });
            }

            // Free-text escape hatch for schemas not yet registered with MJ
            schemas.push({
                value: '',
                label: 'Other (enter schema name)',
                isDefault: false,
                requiresElevatedAuth: true,
            });
        }

        return schemas;
    }

    /** Query `MJ: Schema Info` for distinct schema names registered with this MJ instance. */
    private async loadDbSchemaNames(): Promise<string[]> {
        const rv = new RunView();
        const result = await rv.RunView<{ SchemaName: string }>({
            EntityName: 'MJ: Schema Info',
            Fields: ['SchemaName'],
            OrderBy: 'SchemaName ASC',
            ResultType: 'simple',
        });

        if (!result.Success) return [];
        return result.Results.map(r => r.SchemaName).filter(Boolean);
    }

    // ─── Name availability ────────────────────────────────────────────────

    /**
     * Check whether the proposed entity name and table name are available
     * (no existing MJ entity in the same schema shares either).
     *
     * Returns true when the proposed names are safe to use.
     */
    public async isNameAvailable(entityName: string, tableName: string, schemaName: string): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Entities',
            ExtraFilter:
                `(Name = '${escapeSqlLiteral(entityName)}' OR BaseTable = '${escapeSqlLiteral(tableName)}') ` +
                `AND SchemaName = '${escapeSqlLiteral(schemaName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        });

        return result.Success && result.Results.length === 0;
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    /** Admin path: load all database-Designer-managed entities + ownership annotations. */
    private async loadAllEntities(currentUserId: string): Promise<AccessibleEntity[]> {
        const rv = new RunView();

        // Round 1: get entity IDs from provenance settings and owner map
        const [sourceResult, ownerResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Entity Settings',
                ExtraFilter: (
                    `Name = '${UDT_SETTINGS.SOURCE_KEY}' ` +
                    `AND Value IN ('${UDT_SETTINGS.SOURCE_DATABASE_DESIGNER}', '${UDT_SETTINGS.SOURCE_AGENT_MANAGER}')`
                ),
                Fields: ['EntityID', 'Value'],
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Entity Settings',
                ExtraFilter: `Name = '${UDT_SETTINGS.OWNER_KEY}'`,
                Fields: ['EntityID', 'Value'],
                ResultType: 'simple',
            },
        ]);

        const sourceRows = (sourceResult.Results ?? []) as SettingsRow[];
        const ownerRows = (ownerResult.Results ?? []) as SettingsRow[];

        const entityIds = Array.from(new Set(sourceRows.map(r => r.EntityID)));
        if (entityIds.length === 0) return [];

        const ownerMap = new Map(ownerRows.map(r => [r.EntityID, r.Value]));

        // Round 2: entity details
        const entityResult = await rv.RunView<EntityRow>({
            EntityName: 'MJ: Entities',
            ExtraFilter: buildInFilter('ID', entityIds),
            Fields: ['ID', 'Name', 'BaseTable', 'SchemaName', '__mj_CreatedAt'],
            OrderBy: 'Name ASC',
            ResultType: 'simple',
        });

        return (entityResult.Results ?? []).map(row => {
            const ownerUserId = ownerMap.get(row.ID);
            return {
                entityId: row.ID,
                entityName: row.Name,
                tableName: row.BaseTable,
                schemaName: row.SchemaName,
                fieldCount: 0,  // loaded on demand in detail view
                createdAt: new Date(row.__mj_CreatedAt),
                // UUIDsEqual handles SQL Server uppercase vs PostgreSQL lowercase UUIDs
                isOwner: ownerUserId != null && UUIDsEqual(ownerUserId, currentUserId),
            } satisfies AccessibleEntity;
        });
    }

    /** Non-admin path: load only entities owned by the current user. */
    private async loadOwnedEntities(userId: string): Promise<AccessibleEntity[]> {
        const rv = new RunView();

        // Find entities owned by this user
        const ownerResult = await rv.RunView<SettingsRow>({
            EntityName: 'MJ: Entity Settings',
            ExtraFilter: `Name = '${UDT_SETTINGS.OWNER_KEY}' AND Value = '${escapeSqlLiteral(userId)}'`,
            Fields: ['EntityID', 'Value'],
            ResultType: 'simple',
        });

        const entityIds = (ownerResult.Results ?? []).map(r => r.EntityID);
        if (entityIds.length === 0) return [];

        // Fetch entity details
        const entityResult = await rv.RunView<EntityRow>({
            EntityName: 'MJ: Entities',
            ExtraFilter: buildInFilter('ID', entityIds),
            Fields: ['ID', 'Name', 'BaseTable', 'SchemaName', '__mj_CreatedAt'],
            OrderBy: 'Name ASC',
            ResultType: 'simple',
        });

        return (entityResult.Results ?? []).map(row => ({
            entityId: row.ID,
            entityName: row.Name,
            tableName: row.BaseTable,
            schemaName: row.SchemaName,
            fieldCount: 0,
            createdAt: new Date(row.__mj_CreatedAt),
            isOwner: true,  // user can only see their own entities in this path
        } satisfies AccessibleEntity));
    }

    /** Check if the current user owns the given entity (via MJ:UDT:Owner setting). */
    private async isCurrentUserOwner(entityId: string): Promise<boolean> {
        const userId = new Metadata().CurrentUser?.ID; // global-provider-ok: client-side Angular engine, single provider
        if (!userId) return false;

        const rv = new RunView();
        const result = await rv.RunView<SettingsRow>({
            EntityName: 'MJ: Entity Settings',
            ExtraFilter: (
                `EntityID = '${escapeSqlId(entityId)}' ` +
                `AND Name = '${UDT_SETTINGS.OWNER_KEY}' ` +
                `AND Value = '${escapeSqlLiteral(userId)}'`
            ),
            Fields: ['EntityID', 'Value'],
            ResultType: 'simple',
        });

        return result.Success && result.Results.length > 0;
    }

    /** True when the current user holds the `Modify Any UDT Entities` authorization. */
    private currentUserCanModifyAny(): boolean {
        const md = new Metadata(); // global-provider-ok: client-side Angular engine, single provider
        const auth = md.Authorizations.find(a => a.Name === ENTITY_DESIGNER_AUTH.MODIFY_ANY_UDT_ENTITIES);
        if (!auth) return false;
        const evaluator = new AuthorizationEvaluator();
        return evaluator.CurrentUserCanExecuteWithAncestors(auth);
    }

    /** Map a `MJ: Entity Fields` row to a `ColumnSpec` for the detail view. */
    private mapFieldToColumnSpec(field: FieldRow): ColumnSpec {
        return {
            Name: field.Name,
            Type: 'string',  // detail view uses RawSqlType for display; Type is semantic
            RawSqlType: field.Type,
            IsNullable: field.AllowsNull,
            // Preserve precision/scale metadata so the modify wizard renders the correct
            // field type controls (e.g. DECIMAL(18,2) vs DECIMAL with no constraints)
            MaxLength: field.MaxLength ?? undefined,
            Precision: field.Precision ?? undefined,
            Scale: field.Scale ?? undefined,
            DefaultValue: field.DefaultValue ?? undefined,
            Description: field.Description ?? undefined,
        };
    }
}

// ─── Private module-level utilities ──────────────────────────────────────────

/** Build a SQL `column IN ('id1', 'id2', ...)` filter for a UUID list. */
function buildInFilter(column: string, ids: string[]): string {
    const quoted = ids.map(id => `'${escapeSqlId(id)}'`).join(', ');
    return `${column} IN (${quoted})`;
}

/** Escape a UUID for safe embedding in a SQL filter (UUIDs are alphanumeric + dashes, but be explicit). */
function escapeSqlId(id: string): string {
    return id.replace(/[^a-zA-Z0-9-]/g, '');
}

/** Escape a string value for safe embedding in a SQL single-quoted literal. */
function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}
