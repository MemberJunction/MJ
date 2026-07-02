/**
 * Data Explorer read service — entities, records, queries, dashboards.
 * Uses the MJ object model: Metadata (entity + query metadata), RunView
 * (records), RunQuery (saved queries), all via the active provider.
 */

import { Metadata, RunView, RunQuery, CompositeKey, type UserInfo, type EntityInfo, type EntityFieldInfo } from '@memberjunction/core';
import type { MJDashboardEntity } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export type EntityListItem = {
    name: string;
    displayName: string;
    schemaName: string;
    description: string | null;
};

/**
 * Entities the user can browse. We surface entities that are not system/
 * internal and that the current user can read. Sorted by display name.
 */
export function loadEntities(): EntityListItem[] {
    const md = new Metadata();
    return md.Entities
        .filter((e) => e.AllowUserSearchAPI !== false && !e.Name.startsWith('__'))
        .map((e) => ({
            name: e.Name,
            displayName: e.DisplayName || e.Name,
            schemaName: e.SchemaName,
            description: e.Description ?? null,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function entityCount(): number {
    return new Metadata().Entities.length;
}

/**
 * The "primary display" field for an entity — used as the card title.
 * Falls back to the first string field, then to the PK.
 */
function primaryDisplayField(entity: EntityInfo): EntityFieldInfo | undefined {
    return (
        entity.Fields.find((f) => f.Name === entity.NameField?.Name) ??
        entity.Fields.find((f) => f.Name.toLowerCase() === 'name') ??
        entity.Fields.find((f) => f.Type === 'nvarchar' && !f.IsPrimaryKey) ??
        entity.FirstPrimaryKey
    );
}

export type EntityRecordRow = {
    /** Composite PK serialized (entity record id). */
    id: string;
    title: string;
    /** A couple of secondary fields for the card subtitle. */
    subtitle: string;
    raw: Record<string, unknown>;
};

export type EntityRecordsLoad = {
    entity: EntityInfo;
    rows: EntityRecordRow[];
    totalShown: number;
};

/**
 * Load records for an entity (read-only, card view). Uses `simple` ResultType
 * with a narrowed field set for performance (CLAUDE.md RunView guidance).
 */
export async function loadEntityRecords(
    entityName: string,
    contextUser?: UserInfo,
    maxRows = 100,
): Promise<EntityRecordsLoad | null> {
    const md = new Metadata();
    const entity = md.EntityByName(entityName);
    if (!entity) return null;

    const titleField = primaryDisplayField(entity);
    const pk = entity.FirstPrimaryKey;

    // Pick up to 3 secondary display fields (default-in-view, non-PK, simple types)
    const secondary = entity.Fields
        .filter((f) => f.DefaultInView && !f.IsPrimaryKey && f.Name !== titleField?.Name)
        .slice(0, 3);

    const fields = Array.from(new Set([
        pk?.Name,
        titleField?.Name,
        ...secondary.map((f) => f.Name),
    ].filter((x): x is string => !!x)));

    const rv = new RunView();
    const result = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: entityName,
            Fields: fields,
            OrderBy: titleField ? `${titleField.Name} ASC` : undefined,
            MaxRows: maxRows,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) {
        throw new Error(result.ErrorMessage ?? `Failed to load ${entityName}`);
    }

    const rows: EntityRecordRow[] = (result.Results ?? []).map((r) => {
        const idVal = pk ? String(r[pk.Name] ?? '') : '';
        const title = titleField ? String(r[titleField.Name] ?? '(no name)') : idVal;
        const subtitle = secondary
            .map((f) => r[f.Name])
            .filter((v) => v !== null && v !== undefined && v !== '')
            .map((v) => String(v))
            .join(' · ');
        return { id: idVal, title, subtitle, raw: r };
    });

    return { entity, rows, totalShown: rows.length };
}

export type RecordFieldRow = { key: string; label: string; value: string };

export type RecordDetailLoad = {
    entity: EntityInfo;
    title: string;
    fields: RecordFieldRow[];
};

/**
 * Load a single record's fields (read-only). Uses GetEntityObject + Load so
 * we get the full strongly-typed entity, then projects displayable fields.
 */
export async function loadRecordDetail(
    entityName: string,
    recordId: string,
    contextUser?: UserInfo,
): Promise<RecordDetailLoad | null> {
    const md = new Metadata();
    const entityInfo = md.EntityByName(entityName);
    if (!entityInfo) return null;

    const obj = await md.GetEntityObject(entityName, contextUser);
    const loaded = await obj.InnerLoad(CompositeKey.FromID(recordId));
    if (!loaded) return null;

    const titleField = primaryDisplayField(entityInfo);
    const title = titleField ? String(obj.Get(titleField.Name) ?? recordId) : recordId;

    const fields: RecordFieldRow[] = entityInfo.Fields
        .filter((f) => f.DefaultInView || f.IsNameField)
        .slice(0, 30)
        .map((f) => {
            const v = obj.Get(f.Name);
            return {
                key: f.Name,
                label: f.DisplayName || f.Name,
                value: v === null || v === undefined ? '—' : String(v),
            };
        });

    return { entity: entityInfo, title, fields };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type QueryListItem = {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
};

export function loadQueries(): QueryListItem[] {
    const md = new Metadata();
    return md.Queries
        .filter((q) => q.Status === 'Approved')
        .map((q) => ({
            id: q.ID,
            name: q.Name ?? '(unnamed query)',
            description: q.Description ?? null,
            category: q.CategoryInfo?.Name ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function queryCount(): number {
    return new Metadata().Queries.filter((q) => q.Status === 'Approved').length;
}

export type QueryRunResult = {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    success: boolean;
    errorMessage?: string;
};

export async function runQuery(
    queryId: string,
    parameters?: Record<string, unknown>,
    contextUser?: UserInfo,
    maxRows = 200,
): Promise<QueryRunResult> {
    const runner = new RunQuery();
    const result = await runner.RunQuery(
        { QueryID: queryId, Parameters: parameters, MaxRows: maxRows },
        contextUser,
    );
    const rows = (result.Results ?? []) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
        columns,
        rows,
        rowCount: result.RowCount ?? rows.length,
        success: result.Success,
        errorMessage: result.Success ? undefined : (result.ErrorMessage ?? 'Query failed.'),
    };
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export type DashboardListItem = {
    id: string;
    name: string;
    description: string | null;
};

export async function loadDashboards(contextUser?: UserInfo): Promise<DashboardListItem[]> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string; Name: string; Description: string | null }>(
        {
            EntityName: 'Dashboards',
            Fields: ['ID', 'Name', 'Description'],
            OrderBy: 'Name',
            MaxRows: 200,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) return [];
    return (result.Results ?? []).map((d) => ({ id: d.ID, name: d.Name, description: d.Description }));
}

/** Renderable dashboard part kinds (mirrors MJ's Dashboard Part Types). */
export type DashboardPartKind = 'view' | 'query' | 'artifact' | 'weburl' | 'unknown';

/** A single parsed dashboard panel. */
export type DashboardPart = {
    /** Panel id from the layout. */
    id: string;
    /** Panel display title. */
    title: string;
    /** Normalized renderer kind. */
    kind: DashboardPartKind;
    /** Resolved Dashboard Part Type name. */
    typeName: string;
    /** Raw, type-specific panel config (viewId/queryId/artifactId/url/…). */
    config: Record<string, unknown>;
};

/** A dashboard resolved into its renderable parts. */
export type DashboardLoad = {
    id: string;
    name: string;
    description: string | null;
    updatedAt: Date | null;
    parts: DashboardPart[];
    /** Count of parts that can't render natively on mobile (desktop-only). */
    desktopOnlyCount: number;
};

/** A node in the Golden Layout tree stored in `Dashboard.UIConfigDetails`. */
type LayoutNode = {
    type?: string;
    content?: LayoutNode[];
    title?: string;
    componentState?: unknown;
};

/** The raw panel object embedded in a component node's `componentState`. */
type RawPanel = {
    id?: unknown;
    title?: unknown;
    partTypeId?: unknown;
    config?: unknown;
};

/** Type guard for a plain object. */
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walk the Golden Layout tree, collecting each component's panel state. */
function collectPanels(root: LayoutNode | undefined): RawPanel[] {
    const panels: RawPanel[] = [];
    const visit = (node: LayoutNode | undefined): void => {
        if (!node) return;
        if (node.type === 'component' && isObject(node.componentState)) {
            panels.push(node.componentState as RawPanel);
        }
        if (Array.isArray(node.content)) node.content.forEach(visit);
    };
    visit(root);
    return panels;
}

/** Normalize a Dashboard Part Type name into a renderer kind. */
function kindFromTypeName(name: string): DashboardPartKind {
    const n = name.trim().toLowerCase();
    if (n === 'view') return 'view';
    if (n === 'query') return 'query';
    if (n === 'artifact') return 'artifact';
    if (n === 'weburl' || n === 'web url' || n === 'url') return 'weburl';
    return 'unknown';
}

/** Parse `UIConfigDetails` into raw panels, tolerating malformed JSON. */
function parsePanels(uiConfigDetails: string): RawPanel[] {
    if (!uiConfigDetails || uiConfigDetails.trim() === '') return [];
    try {
        const parsed: unknown = JSON.parse(uiConfigDetails);
        if (!isObject(parsed)) return [];
        const layout = parsed.layout;
        if (!isObject(layout)) return [];
        const root = isObject(layout.root) ? (layout.root as LayoutNode) : undefined;
        return collectPanels(root);
    } catch {
        return [];
    }
}

/**
 * Load a dashboard and resolve its layout config into typed, renderable parts.
 *
 * Dashboards persist their layout in `Dashboard.UIConfigDetails` as a Golden
 * Layout config whose component nodes embed panel data in `componentState`.
 * We walk that tree, resolve each panel's Part Type name (via the Dashboard
 * Part Types lookup, falling back to the panel's own `config.type`), and return
 * a flat, mobile-friendly part list. Panels that can't be recognized degrade to
 * an `unknown` kind that the UI renders as a "desktop-optimized" placeholder.
 *
 * @param dashboardId The dashboard to load.
 * @param contextUser Optional acting user (server-side scoping).
 */
export async function loadDashboard(dashboardId: string, contextUser?: UserInfo): Promise<DashboardLoad | null> {
    const md = new Metadata();
    const currentUser = contextUser ?? md.CurrentUser;

    const dashboard = await md.GetEntityObject<MJDashboardEntity>('MJ: Dashboards', currentUser);
    const loaded = await dashboard.Load(dashboardId);
    if (!loaded) return null;

    const rawPanels = parsePanels(dashboard.UIConfigDetails ?? '');
    const partTypeNameById = await loadPartTypeNames(currentUser);

    const parts: DashboardPart[] = rawPanels.map((panel, idx) => {
        const config = isObject(panel.config) ? panel.config : {};
        const partTypeId = typeof panel.partTypeId === 'string' ? panel.partTypeId : '';
        const configType = typeof config.type === 'string' ? config.type : '';
        const typeName = partTypeNameById.get(partTypeId) ?? configType ?? 'Custom';
        return {
            id: typeof panel.id === 'string' ? panel.id : `part-${idx}`,
            title: typeof panel.title === 'string' && panel.title ? panel.title : (typeName || 'Panel'),
            kind: kindFromTypeName(typeName),
            typeName: typeName || 'Custom',
            config,
        };
    });

    const updatedAtRaw = (dashboard as unknown as { __mj_UpdatedAt?: Date }).__mj_UpdatedAt;
    return {
        id: dashboard.ID,
        name: dashboard.Name,
        description: dashboard.Description,
        updatedAt: updatedAtRaw ? new Date(updatedAtRaw) : null,
        parts,
        desktopOnlyCount: parts.filter((p) => p.kind === 'unknown' || p.kind === 'weburl' || p.kind === 'view').length,
    };
}

/** Map Dashboard Part Type id → name (small lookup table). */
async function loadPartTypeNames(user: UserInfo | undefined): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string; Name: string }>(
        { EntityName: 'MJ: Dashboard Part Types', Fields: ['ID', 'Name'], MaxRows: 200, ResultType: 'simple' },
        user,
    );
    if (result.Success) {
        for (const row of result.Results ?? []) out.set(row.ID, row.Name);
    }
    return out;
}
