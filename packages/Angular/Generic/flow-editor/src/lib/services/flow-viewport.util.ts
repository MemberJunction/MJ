/**
 * @fileoverview Pure viewport math and bounded per-workflow viewport persistence helpers
 * for `<mj-flow-editor>`. Kept pure so fit-zoom clamping and UserInfoEngine serialization
 * can be unit-tested without Angular TestBed or DOM layout.
 *
 * @module @memberjunction/ng-flow-editor
 */
import type { FlowNode } from '../interfaces/flow-types';

/** User setting key holding the bounded per-workflow pan & zoom dictionary. */
export const FLOW_VIEWPORTS_SETTING_KEY = 'mj.flowEditor.viewports.v1';

/** Maximum automatic fit-to-screen scale so small 1–5 step workflows never blow up past 95%. */
export const MAX_FIT_SCALE = 0.95;

/** Minimum fit scale matching Foblex's `[fZoomMinimum]`. */
export const MIN_FIT_SCALE = 0.15;

/** Default node footprint used when a FlowNode omits explicit Width/Height. */
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 96;

/** Cap stored viewport entries so the single User Setting JSON payload remains small. */
export const MAX_STORED_VIEWPORTS = 100;

export interface FlowViewportState {
    x: number;
    y: number;
    scale: number;
    updatedAt: number;
}

export interface FlowViewportStoreAdapter {
    Get(key: string): string | undefined;
    Set(key: string, value: string): void;
}

/**
 * Computes a centered pan `{ x, y }` and zoom `scale` that fits all `nodes` inside
 * `(viewportWidth, viewportHeight)` with breathing room while capping zoom at `maxScale`
 * (default `0.95`). Small workflows sit naturally centered instead of zooming to 200%+.
 */
export function ComputeCappedFitViewport(
    nodes: readonly FlowNode[],
    viewportWidth: number,
    viewportHeight: number,
    options?: { padding?: number; maxScale?: number; minScale?: number },
): { x: number; y: number; scale: number } | null {
    if (nodes.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
    }

    const padding = options?.padding ?? 72;
    const maxScale = options?.maxScale ?? MAX_FIT_SCALE;
    const minScale = options?.minScale ?? MIN_FIT_SCALE;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
        const nx = Number.isFinite(node.Position?.X) ? node.Position.X : 0;
        const ny = Number.isFinite(node.Position?.Y) ? node.Position.Y : 0;
        const nw = node.Size?.Width && node.Size.Width > 0 ? node.Size.Width : DEFAULT_NODE_WIDTH;
        const nh = node.Size?.Height && node.Size.Height > 0 ? node.Size.Height : DEFAULT_NODE_HEIGHT;
        minX = Math.min(minX, nx);
        minY = Math.min(minY, ny);
        maxX = Math.max(maxX, nx + nw);
        maxY = Math.max(maxY, ny + nh);
    }

    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const availW = Math.max(80, viewportWidth - padding * 2);
    const availH = Math.max(80, viewportHeight - padding * 2);

    const rawScale = Math.min(availW / contentW, availH / contentH);
    const scale = Math.round(Math.max(minScale, Math.min(maxScale, rawScale)) * 1000) / 1000;

    const x = Math.round((viewportWidth - contentW * scale) / 2 - minX * scale);
    const y = Math.round((viewportHeight - contentH * scale) / 2 - minY * scale);
    return { x, y, scale };
}

/**
 * Bounded per-key pan/zoom dictionary backed by `UserInfoEngine` (`MJ: User Settings`).
 * Caps stored keys to the most recent `MAX_STORED_VIEWPORTS` entries.
 */
export class FlowViewportStore {
    private cache: Record<string, FlowViewportState> | null = null;

    constructor(
        private readonly adapter: FlowViewportStoreAdapter,
        private readonly maxEntries: number = MAX_STORED_VIEWPORTS,
    ) {}

    public Load(viewportKey: string | null | undefined): FlowViewportState | null {
        const key = viewportKey?.trim();
        if (!key) return null;
        const dict = this.readAll();
        const entry = dict[key];
        return isValidViewport(entry) ? entry : null;
    }

    public Save(viewportKey: string | null | undefined, viewport: { x: number; y: number; scale: number }): void {
        const key = viewportKey?.trim();
        if (!key) return;
        if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.scale) || viewport.scale <= 0) {
            return;
        }
        const dict = { ...this.readAll() };
        dict[key] = {
            x: Math.round(viewport.x),
            y: Math.round(viewport.y),
            scale: Math.round(viewport.scale * 1000) / 1000,
            updatedAt: Date.now(),
        };

        const keys = Object.keys(dict);
        if (keys.length > this.maxEntries) {
            keys.sort((a, b) => (dict[b]?.updatedAt ?? 0) - (dict[a]?.updatedAt ?? 0));
            const trimmed: Record<string, FlowViewportState> = {};
            for (const k of keys.slice(0, this.maxEntries)) {
                trimmed[k] = dict[k];
            }
            this.cache = trimmed;
        } else {
            this.cache = dict;
        }

        try {
            this.adapter.Set(FLOW_VIEWPORTS_SETTING_KEY, JSON.stringify(this.cache));
        } catch {
            // Engine not bootstrapped in unit tests
        }
    }

    private readAll(): Record<string, FlowViewportState> {
        if (this.cache) return this.cache;
        try {
            const raw = this.adapter.Get(FLOW_VIEWPORTS_SETTING_KEY);
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const clean: Record<string, FlowViewportState> = {};
                    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
                        if (isValidViewport(v)) clean[k] = v;
                    }
                    this.cache = clean;
                    return clean;
                }
            }
        } catch {
            // Malformed JSON or uninitialized engine
        }
        this.cache = {};
        return this.cache;
    }
}

function isValidViewport(value: unknown): value is FlowViewportState {
    if (!value || typeof value !== 'object') return false;
    const v = value as Partial<FlowViewportState>;
    return (
        typeof v.x === 'number' && Number.isFinite(v.x) &&
        typeof v.y === 'number' && Number.isFinite(v.y) &&
        typeof v.scale === 'number' && Number.isFinite(v.scale) && v.scale > 0
    );
}
