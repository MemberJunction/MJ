/**
 * @fileoverview Classify · Dry-run / disposition PREVIEW dialog.
 *
 * Honest, client-side, in-memory preview of how a source's EXISTING extracted
 * ContentItemTags would be dispositioned under its current taxonomy mode +
 * thresholds. This is NOT a fresh LLM run and NOTHING is persisted — it samples
 * up to N existing tags, resolves each against the cached taxonomy
 * (Tags / TagSynonyms) client-side, and replays the deterministic routing via the
 * pure `previewDispositions` helper.
 *
 * It is hosted by the Sources tab (which already hosts its own dialogs): data
 * DOWN via `[SourceCard]` / `[Show]`, intent UP via `(Closed)`. On open it loads
 * the sample itself (read-only RunView, `ResultType: 'simple'`).
 *
 * NOTE: the server also has a semantic/embedding match tier not reproducible
 * client-side, so borderline rows may resolve differently in a real run. The
 * template states this explicitly.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { SourceCard, DryRunDispositionCount, DryRunEstimate } from '../shared/classify.types';
import {
    previewDispositions, DryRunInput, DryRunConfig, DryRunRow, ResolveResult, Disposition,
} from '../shared/classify.dryrun';

/** Default routing config when a source has no explicit Configuration blob. */
const DEFAULT_MODE: DryRunConfig['mode'] = 'auto-grow';
const DEFAULT_MATCH_THRESHOLD = 0.85;
/** Illustrative per-item token estimate for the (non-binding) cost line. */
const EST_TOKENS_PER_ITEM = 840;
/** Illustrative blended $/1K-token rate for the cost estimate. */
const EST_COST_PER_1K_TOKENS = 0.01;
/** Max existing tags to sample for the preview. */
const SAMPLE_SIZE = 15;

@Component({
    standalone: false,
    selector: 'classify-dry-run-preview',
    templateUrl: './dry-run-preview.dialog.component.html',
    styleUrls: ['./dry-run-preview.dialog.component.css'],
})
export class ClassifyDryRunPreviewDialogComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Whether the dialog is visible. */
    private _show = false;
    @Input()
    set Show(value: boolean) {
        const opening = value && !this._show;
        this._show = value;
        if (opening && this._sourceCard) {
            void this.runPreview(this._sourceCard);
        }
    }
    get Show(): boolean {
        return this._show;
    }

    /** The source being previewed; supplied by the Sources tab when opening. */
    private _sourceCard: SourceCard | null = null;
    @Input()
    set SourceCard(value: SourceCard | null) {
        this._sourceCard = value;
        if (value && this._show) {
            void this.runPreview(value);
        }
    }
    get SourceCard(): SourceCard | null {
        return this._sourceCard;
    }

    /** Emitted when the user dismisses the dialog. */
    @Output() Closed = new EventEmitter<void>();

    // ── View state ──

    public Loading = false;
    public Rows: DryRunRow[] = [];
    public Counts: DryRunDispositionCount = { AutoApply: 0, RouteToInbox: 0, CreateNew: 0, Reject: 0 };
    public Estimate: DryRunEstimate = { ItemsSampled: 0, EstimatedTokens: 0, EstimatedCost: 0 };
    /** Effective config used for this preview (mirrored for the "effective values" line). */
    public EffectiveMode: DryRunConfig['mode'] = DEFAULT_MODE;
    public EffectiveMatchThreshold = DEFAULT_MATCH_THRESHOLD;
    public EffectiveSuggestThreshold = DEFAULT_MATCH_THRESHOLD - 0.05;
    /** True when the sampled source has no extracted tags yet. */
    public NoTagsSampled = false;

    public close(): void {
        this.Closed.emit();
    }

    /**
     * Load a sample of the source's existing extracted tags, resolve each against
     * the cached taxonomy, and produce the preview rows + summary. Read-only —
     * nothing is written.
     */
    private async runPreview(card: SourceCard): Promise<void> {
        this.Loading = true;
        this.Rows = [];
        this.NoTagsSampled = false;
        this.cdr.detectChanges();

        try {
            const p = this.ProviderToUse;
            await TagEngineBase.Instance.Config(false, p.CurrentUser, p);
            await KnowledgeHubMetadataEngine.Instance.Config(false, p.CurrentUser, p);

            const cfg = this.resolveSourceConfig(card.ID);
            this.EffectiveMode = cfg.mode;
            this.EffectiveMatchThreshold = cfg.matchThreshold;
            this.EffectiveSuggestThreshold = cfg.suggestThreshold;

            const inputs = await this.loadSampleTags(card.ID);
            if (inputs.length === 0) {
                this.NoTagsSampled = true;
                this.Estimate = { ItemsSampled: 0, EstimatedTokens: 0, EstimatedCost: 0 };
                return;
            }

            const resolve = this.buildResolver();
            this.Rows = previewDispositions(inputs, cfg, resolve);
            this.Counts = this.tally(this.Rows);
            this.Estimate = this.estimate(inputs.length);
        } catch (error) {
            console.error('[Classify] Dry-run preview error:', error);
        } finally {
            this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Sample up to SAMPLE_SIZE existing ContentItemTags for the source. We first
     * pull a handful of the source's items, then their tags — the simplest path
     * that avoids depending on a direct source-level filter on ContentItemTags.
     */
    private async loadSampleTags(sourceID: string): Promise<DryRunInput[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);

        const itemResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${sourceID}'`,
            OrderBy: '__mj_UpdatedAt DESC',
            Fields: ['ID'],
            MaxRows: SAMPLE_SIZE,
            ResultType: 'simple',
        });
        if (!itemResult.Success || itemResult.Results.length === 0) return [];

        const itemIds = itemResult.Results.map(i => i.ID);
        const inClause = itemIds.map(id => `'${id}'`).join(',');

        const tagResult = await rv.RunView<{ Tag: string; TagID: string | null; Weight: number | null }>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `ItemID IN (${inClause})`,
            Fields: ['Tag', 'TagID', 'Weight'],
            MaxRows: SAMPLE_SIZE,
            ResultType: 'simple',
        });
        if (!tagResult.Success) return [];

        return tagResult.Results
            .filter(t => !!t.Tag)
            .map(t => ({
                tag: t.Tag,
                resolvedTagId: t.TagID ?? null,
                weight: Number(t.Weight ?? 1),
            }));
    }

    /**
     * Read the source's effective taxonomy config from its ConfigurationObject,
     * falling back to documented runtime defaults. SuggestThreshold defaults to
     * matchThreshold − 0.05 (matches the server's runtime default).
     */
    private resolveSourceConfig(sourceID: string): DryRunConfig {
        const source = KnowledgeHubMetadataEngine.Instance.ContentSources.find(cs => UUIDsEqual(cs.ID, sourceID));
        const config = source?.ConfigurationObject ?? null;

        const mode = config?.TagTaxonomyMode ?? DEFAULT_MODE;
        const matchThreshold = config?.TagMatchThreshold ?? DEFAULT_MATCH_THRESHOLD;
        const suggestThreshold = config?.SuggestThreshold ?? matchThreshold - 0.05;

        return { mode, matchThreshold, suggestThreshold };
    }

    /**
     * Build the client-side resolver closure over the cached taxonomy.
     * tier 'synonym' if the tag matches a TagSynonym (case-insensitive),
     * 'exact' if it matches a Tag Name (case-insensitive), 'fuzzy' if a
     * normalized match (lowercase, strip plurals/hyphens) hits, else 'none'.
     */
    private buildResolver(): (tag: string) => ResolveResult {
        const engine = TagEngineBase.Instance;
        const activeTags = engine.Tags.filter(t => t.Status === 'Active');

        // synonym text (lower) → owning Tag
        const synonymMap = new Map<string, { id: string; name: string }>();
        const tagById = new Map<string, { id: string; name: string }>();
        for (const t of activeTags) {
            tagById.set(t.ID.toLowerCase(), { id: t.ID, name: t.Name });
        }
        for (const syn of engine.TagSynonyms) {
            const owner = tagById.get((syn.TagID ?? '').toLowerCase());
            if (owner && syn.Synonym) {
                synonymMap.set(syn.Synonym.trim().toLowerCase(), owner);
            }
        }

        // exact name (lower) → Tag; normalized name (lower) → Tag (for fuzzy tier)
        const exactMap = new Map<string, { id: string; name: string }>();
        const normalizedMap = new Map<string, { id: string; name: string }>();
        for (const t of activeTags) {
            const entry = { id: t.ID, name: t.Name };
            exactMap.set(t.Name.trim().toLowerCase(), entry);
            normalizedMap.set(this.normalize(t.Name), entry);
        }

        return (tag: string): ResolveResult => {
            const lower = tag.trim().toLowerCase();

            const syn = synonymMap.get(lower);
            if (syn) return { tagId: syn.id, tagName: syn.name, score: 1.0, tier: 'synonym' };

            const exact = exactMap.get(lower);
            if (exact) return { tagId: exact.id, tagName: exact.name, score: 1.0, tier: 'exact' };

            const fuzzy = normalizedMap.get(this.normalize(tag));
            if (fuzzy) return { tagId: fuzzy.id, tagName: fuzzy.name, score: 0.8, tier: 'fuzzy' };

            return { tagId: null, tagName: null, score: null, tier: 'none' };
        };
    }

    /** Lowercase, strip hyphens/underscores/whitespace and a trailing plural 's'. */
    private normalize(value: string): string {
        let v = value.trim().toLowerCase().replace(/[-_\s]+/g, '');
        if (v.endsWith('s') && v.length > 3) v = v.slice(0, -1);
        return v;
    }

    private tally(rows: DryRunRow[]): DryRunDispositionCount {
        const counts: DryRunDispositionCount = { AutoApply: 0, RouteToInbox: 0, CreateNew: 0, Reject: 0 };
        for (const r of rows) {
            switch (r.disposition) {
                case 'auto-apply': counts.AutoApply++; break;
                case 'route-to-inbox': counts.RouteToInbox++; break;
                case 'create-new': counts.CreateNew++; break;
                case 'reject': counts.Reject++; break;
            }
        }
        return counts;
    }

    private estimate(itemsSampled: number): DryRunEstimate {
        const tokens = itemsSampled * EST_TOKENS_PER_ITEM;
        const cost = (tokens / 1000) * EST_COST_PER_1K_TOKENS;
        return { ItemsSampled: itemsSampled, EstimatedTokens: tokens, EstimatedCost: cost };
    }

    // ── Template helpers ──

    /** Status-token-backed CSS class for a disposition pill. */
    public DispositionClass(d: Disposition): string {
        switch (d) {
            case 'auto-apply': return 'disp disp-apply';
            case 'route-to-inbox': return 'disp disp-inbox';
            case 'create-new': return 'disp disp-create';
            case 'reject': return 'disp disp-reject';
        }
    }

    /** Human label for a disposition pill. */
    public DispositionLabel(d: Disposition): string {
        switch (d) {
            case 'auto-apply': return 'AUTO-APPLY';
            case 'route-to-inbox': return '→ INBOX';
            case 'create-new': return this.EffectiveMode === 'free-flow' ? 'CREATE (free-flow)' : 'CREATE (auto-grow)';
            case 'reject': return 'REJECT';
        }
    }

    public FormatScore(score: number | null): string {
        return score == null ? '—' : score.toFixed(2);
    }

    public FormatTokens(tokens: number): string {
        return tokens.toLocaleString();
    }

    public FormatCost(cost: number): string {
        return `$${cost.toFixed(2)}`;
    }

    public ModeLabel(mode: DryRunConfig['mode']): string {
        switch (mode) {
            case 'constrained': return 'Constrained';
            case 'auto-grow': return 'Auto-grow';
            case 'free-flow': return 'Free-flow';
        }
    }
}
