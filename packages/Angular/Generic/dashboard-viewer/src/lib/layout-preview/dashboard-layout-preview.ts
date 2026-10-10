/**
 * @fileoverview Pure logic for a dashboard's layout preview: a small tree of the rows, columns and
 * panels in a saved dashboard configuration (`MJ: Dashboards.UIConfigDetails`), which
 * DashboardLayoutPreviewComponent draws as a miniature of the dashboard.
 */

/** A row or column of a layout preview: its children side by side (row) or top to bottom (column). */
export interface DashboardLayoutPreviewGroup {
    Kind: 'row' | 'column';
    /** Share of the parent's length, from 0 to 1. The shares of one parent's children add up to 1. */
    Weight: number;
    Children: DashboardLayoutPreviewNode[];
}

/** One panel box of a layout preview. */
export interface DashboardLayoutPreviewPanel {
    Kind: 'panel';
    /** Share of the parent's length, from 0 to 1. The shares of one parent's children add up to 1. */
    Weight: number;
    Title: string;
    /** Font Awesome classes, or null when the panel has no icon. */
    Icon: string | null;
}

/** A node of a layout preview tree. */
export type DashboardLayoutPreviewNode = DashboardLayoutPreviewGroup | DashboardLayoutPreviewPanel;

/** Most panel boxes a preview draws. Later panels are left out. */
const MAX_PREVIEW_PANELS = 24;

/** Deepest row or column nesting a preview follows. Deeper items are left out. */
const MAX_PREVIEW_DEPTH = 8;

/** A value JSON.parse can return. */
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

interface JsonObject {
    [key: string]: JsonValue;
}

/** The size of a saved item in its row or column. */
interface ItemSize {
    unit: '%' | 'fr';
    value: number;
}

/** How many more panels one tree walk may add. */
interface PanelBudget {
    left: number;
}

/**
 * Builds the layout preview of a saved dashboard configuration (`{ layout, settings }`, where
 * `layout` is Golden Layout's saved layout). A stack shows as one panel: its active item, or its
 * first. Each node's weight is its share of its parent, from the saved `size` and `sizeUnit`.
 * Draws at most 24 panels and 8 levels of nesting; the rest is left out.
 * @returns The tree, or null when there is nothing to draw: no, empty or invalid JSON, the legacy
 * tile format, a null layout, or a layout with no panels.
 */
export function BuildDashboardLayoutPreview(uiConfigDetails: string | null | undefined): DashboardLayoutPreviewNode | null {
    const root = savedLayoutRoot(uiConfigDetails);
    const node = root ? toPreviewNode(root, 0, { left: MAX_PREVIEW_PANELS }) : null;
    return node ? { ...node, Weight: 1 } : null;
}

/** The root item of the saved layout, or null when the configuration has none. */
function savedLayoutRoot(uiConfigDetails: string | null | undefined): JsonObject | null {
    if (!uiConfigDetails?.trim()) return null;
    const config = parseJson(uiConfigDetails);
    if (!isJsonObject(config)) return null;
    const layout = config['layout'];
    if (!isJsonObject(layout)) return null;
    const root = layout['root'];
    return isJsonObject(root) ? root : null;
}

function parseJson(text: string): JsonValue | undefined {
    try {
        return JSON.parse(text) as JsonValue;
    } catch {
        return undefined;
    }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A saved layout item as a preview node, or null when it has no panel to draw. */
function toPreviewNode(item: JsonObject, depth: number, budget: PanelBudget): DashboardLayoutPreviewNode | null {
    if (budget.left <= 0 || depth > MAX_PREVIEW_DEPTH) return null;
    const type = item['type'];
    switch (type) {
        case 'row':
        case 'column':
            return toGroup(type, item, depth, budget);
        case 'stack':
            return toPanel(activeItem(item), budget);
        case 'component':
            return toPanel(item, budget);
        default:
            return null;
    }
}

/** A row or column with the children that have panels to draw, or null when none has. */
function toGroup(kind: 'row' | 'column', item: JsonObject, depth: number, budget: PanelBudget): DashboardLayoutPreviewGroup | null {
    const content = item['content'];
    if (!Array.isArray(content)) return null;
    const kept: Array<{ node: DashboardLayoutPreviewNode; size: ItemSize }> = [];
    for (const child of content) {
        if (budget.left <= 0) break;
        if (!isJsonObject(child)) continue;
        const node = toPreviewNode(child, depth + 1, budget);
        if (node) {
            kept.push({ node, size: itemSize(child) });
        }
    }
    if (kept.length === 0) return null;
    const weights = shares(kept.map(k => k.size));
    return { Kind: kind, Weight: 1, Children: kept.map((k, i) => ({ ...k.node, Weight: weights[i] })) };
}

/** The item a stack shows: its active item, else its first. Null for an empty stack. */
function activeItem(stack: JsonObject): JsonObject | null {
    const content = stack['content'];
    if (!Array.isArray(content)) return null;
    const index = stack['activeItemIndex'];
    const active = typeof index === 'number' ? content[index] : undefined;
    if (isJsonObject(active)) return active;
    return content.find(isJsonObject) ?? null;
}

/** A panel with the title and icon from the component's panel data (componentState). */
function toPanel(component: JsonObject | null, budget: PanelBudget): DashboardLayoutPreviewPanel | null {
    if (!component) return null;
    budget.left--;
    const state = component['componentState'];
    const panel: JsonObject = isJsonObject(state) ? state : {};
    return {
        Kind: 'panel',
        Weight: 1,
        Title: nonEmptyText(panel['title']) ?? nonEmptyText(component['title']) ?? '',
        Icon: nonEmptyText(panel['icon']),
    };
}

function nonEmptyText(value: JsonValue | undefined): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A saved item's size. A missing size, or one in px or em, counts as one fr. */
function itemSize(item: JsonObject): ItemSize {
    const value = item['size'];
    const unit = item['sizeUnit'];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && (unit === '%' || unit === 'fr')) {
        return { unit, value };
    }
    return { unit: 'fr', value: 1 };
}

/**
 * Each item's share of its row or column, the way Golden Layout sizes them: % sizes first, then
 * the fr items share the space the % sizes leave (50 more when they leave nothing). The shares
 * add up to 1.
 */
function shares(sizes: ItemSize[]): number[] {
    const percentTotal = sum(sizes.filter(s => s.unit === '%').map(s => s.value));
    const frTotal = sum(sizes.filter(s => s.unit === 'fr').map(s => s.value));
    const frSpace = Math.round(percentTotal) < 100 ? 100 - percentTotal : 50;
    const amounts = sizes.map(s => (s.unit === '%' ? s.value : (frSpace * s.value) / frTotal));
    const total = sum(amounts);
    return amounts.map(amount => amount / total);
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}
