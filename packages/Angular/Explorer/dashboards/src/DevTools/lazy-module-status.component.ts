import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { DevToolsPrefs } from './dev-tools-prefs';
import { buildLazyModuleStatusAgentContext } from './dev-tools-agent-context';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';

interface LazyChunk {
    /** A friendly label inferred from the underlying loader source. */
    label: string;
    /** The loader function's source-string (used as the unique chunk id internally). */
    chunkId: string;
    loaded: boolean;
    keys: string[];
    /** True when the user clicks "Force Load" — used to disable the button + show spinner. */
    loading?: boolean;
    /** UI state — false initially, user can expand to see all keys. */
    expanded: boolean;
}

/** How many entry pills to show in the collapsed card before "Show all". */
const COLLAPSED_KEY_LIMIT = 8;

interface LazyRegistryShape {
    GetSnapshot(): {
        registered: string[];
        loaded: string[];
        chunks: Array<{ chunkId: string; loaded: boolean; keys: string[] }>;
        chunkCount: number;
    };
    ForceLoad(compoundKey: string): Promise<boolean>;
}

/**
 * Lazy Module Status — visualizes the Explorer's lazy-loading registry.
 * Shows each chunk, its status (loaded vs not), the registrations it
 * brings in, and offers a "Force Load" button to preload on demand.
 *
 * Reads from the global `__mj_lazy_registry__` published by `LazyModuleRegistry`
 * — no hard package dep on explorer-core.
 */
@RegisterClass(BaseResourceComponent, 'LazyModuleStatusInspector')
@Component({
    standalone: false,
    selector: 'mj-lazy-module-status',
    templateUrl: './lazy-module-status.component.html',
    styleUrls: ['./inspector-shared.css', './lazy-module-status.component.css']
})
export class LazyModuleStatusComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

    public Stats = { totalKeys: 0, loadedKeys: 0, chunkCount: 0, loadedChunks: 0, percent: 0 };
    public Chunks: LazyChunk[] = [];
    public Available = false;
    public Filter: 'all' | 'loaded' | 'not-loaded' = 'all';
    /** Free-text search narrowing chunks by label or registration key. */
    public SearchQuery = '';
    public LastRefreshed = new Date();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnInit(): void {
        const prefs = DevToolsPrefs.Get<{ filter?: 'all' | 'loaded' | 'not-loaded'; expanded?: string[] }>('lazyModule');
        if (prefs?.filter) this.Filter = prefs.filter;
        this.refresh();
        if (prefs?.expanded) {
            for (const c of this.Chunks) c.expanded = prefs.expanded.includes(c.chunkId);
        }
        this.NotifyLoadComplete();
    }

    public ngAfterViewInit(): void {
        // Publish initial agent context + register the read-only client tools.
        // Re-emit happens on refresh, filter change, and the search tool.
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    public override ngOnDestroy(): void {
        this.savePrefs();
        super.ngOnDestroy();
    }

    private savePrefs(): void {
        DevToolsPrefs.Save('lazyModule', {
            filter: this.Filter,
            expanded: this.Chunks.filter(c => c.expanded).map(c => c.chunkId)
        });
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Lazy Loading'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-puzzle-piece'; }

    public refresh(): void {
        const reg = (globalThis as { __mj_lazy_registry__?: LazyRegistryShape }).__mj_lazy_registry__;
        if (!reg || typeof reg.GetSnapshot !== 'function') {
            this.Available = false;
            this.cdr.markForCheck();
            return;
        }
        this.Available = true;
        const snap = reg.GetSnapshot();
        // Preserve expansion state across refreshes
        const prevExpansion = new Map(this.Chunks.map(c => [c.chunkId, c.expanded] as const));
        this.Chunks = snap.chunks.map(c => ({
            label: this.deriveChunkLabel(c.chunkId, c.keys),
            chunkId: c.chunkId,
            loaded: c.loaded,
            keys: c.keys,
            expanded: prevExpansion.get(c.chunkId) ?? false
        })).sort((a, b) => {
            if (a.loaded !== b.loaded) return a.loaded ? -1 : 1; // loaded first
            return a.label.localeCompare(b.label);
        });

        const loadedChunks = this.Chunks.filter(c => c.loaded).length;
        this.Stats = {
            totalKeys: snap.registered.length,
            loadedKeys: snap.loaded.length,
            chunkCount: snap.chunks.length,
            loadedChunks,
            percent: snap.chunks.length === 0 ? 0 : Math.round((loadedChunks / snap.chunks.length) * 100)
        };
        this.LastRefreshed = new Date();
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public OnFilterClick(filter: 'all' | 'loaded' | 'not-loaded'): void {
        this.Filter = filter;
        this.savePrefs();
        this.publishAgentContext();
    }

    public get FilteredChunks(): LazyChunk[] {
        let list: LazyChunk[];
        switch (this.Filter) {
            case 'loaded':     list = this.Chunks.filter(c => c.loaded); break;
            case 'not-loaded': list = this.Chunks.filter(c => !c.loaded); break;
            default:           list = this.Chunks; break;
        }
        const q = this.SearchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(c =>
                c.label.toLowerCase().includes(q) ||
                c.keys.some(k => k.toLowerCase().includes(q))
            );
        }
        return list;
    }

    public async OnForceLoad(chunk: LazyChunk): Promise<void> {
        if (chunk.loaded || chunk.loading) return;
        const reg = (globalThis as { __mj_lazy_registry__?: LazyRegistryShape }).__mj_lazy_registry__;
        if (!reg || chunk.keys.length === 0) return;

        chunk.loading = true;
        this.cdr.markForCheck();
        try {
            await reg.ForceLoad(chunk.keys[0]); // any key in the chunk loads the same chunk
            // Re-read snapshot to get authoritative state
            this.refresh();
        } catch {
            chunk.loading = false;
            this.cdr.markForCheck();
        }
    }

    public get LastRefreshedLabel(): string {
        return this.LastRefreshed.toLocaleTimeString();
    }

    public TrackByChunk = (_i: number, c: LazyChunk) => c.chunkId;
    public readonly CollapsedKeyLimit = COLLAPSED_KEY_LIMIT;

    public ToggleChunkExpand(chunk: LazyChunk): void {
        chunk.expanded = !chunk.expanded;
        this.savePrefs();
    }

    public VisibleKeys(chunk: LazyChunk): string[] {
        return chunk.expanded ? chunk.keys : chunk.keys.slice(0, COLLAPSED_KEY_LIMIT);
    }

    public HiddenCount(chunk: LazyChunk): number {
        return Math.max(0, chunk.keys.length - COLLAPSED_KEY_LIMIT);
    }

    /**
     * Derive a friendly chunk label from the loader function's source. The
     * generated `LAZY_FEATURE_CONFIG` builds loaders that look like:
     *   () => importFn().then(() => {})
     *   where importFn is `() => import('@memberjunction/ng-dashboards/foo.module')`
     * So the chunk id (loader.toString()) usually contains the dynamic import path.
     */
    private deriveChunkLabel(chunkId: string, keys: string[]): string {
        const m = chunkId.match(/import\(["']([^"']+)["']\)/);
        if (m && m[1]) {
            // Strip the @memberjunction/ prefix for brevity
            return m[1].replace(/^@memberjunction\//, '');
        }
        // Fallback: derive from a representative key
        if (keys.length > 0) {
            const first = keys[0];
            const parts = first.split('::');
            return parts.length === 2 ? parts[1] : first;
        }
        return '(unknown chunk)';
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY — CLASSIFICATION: SAFE developer diagnostic.
    // The Lazy Module Status inspector is a read-only view of the Explorer's
    // lazy-loading registry. Context reports module counts; tools only search the
    // chunk list and refresh the snapshot. No application data is read or mutated.
    // (Note: the existing in-UI "Force Load" button is intentionally NOT exposed
    // as an agent tool — preloading chunks is a user-driven action.)
    // ========================================

    /** Publish the current lazy-module status to the AI agent. */
    private publishAgentContext(): void {
        const context = buildLazyModuleStatusAgentContext({
            Available: this.Available,
            TotalModules: this.Stats.chunkCount,
            LoadedModules: this.Stats.loadedChunks,
            Filter: this.Filter,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the read-only client tools the AI agent can invoke against the
     * Lazy Module Status inspector: SearchLazyModules, RefreshModuleStatus.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SearchLazyModules',
                Description: 'Search lazy modules by label or registration key. Pass an empty string to clear the search.',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>) => this.toolSearch(params),
            },
            {
                Name: 'RefreshModuleStatus',
                Description: 'Re-read the lazy-loading registry snapshot to reflect any modules loaded since the last refresh.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.refresh();
                    return { Success: true };
                },
            },
        ]);
    }

    /** Apply (or clear, on empty string) the lazy-module search query. */
    private toolSearch(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['query'], 'query');
        if (!validated.ok) {
            return validated.result;
        }
        this.SearchQuery = validated.value;
        this.savePrefs();
        this.publishAgentContext();
        this.cdr.markForCheck();
        return { Success: true };
    }
}
