/**
 * @fileoverview Classify · Source + Content Type CRUD slide-in form dialog.
 *
 * Owns the entire add/edit slide-in form for BOTH content sources and content
 * types (the form renders one or the other depending on `FormMode`). Extracted
 * from the host monolith: the dialog owns ALL form state, the dropdown option
 * getters, the dynamic source-type field logic, and the open / populate / save /
 * close lifecycle. It reads cached reference metadata directly from
 * `KnowledgeHubMetadataEngine.Instance` / `AIEngineBase.Instance` (same as the
 * host did) and persists via the threaded provider.
 *
 * Contract with the host (data orchestrator):
 *   - The host calls the public `OpenAddSource()` / `OpenEditSource(card)` /
 *     `OpenAddType()` / `OpenEditType(card)` methods via `@ViewChild` in response
 *     to the Sources/Types tabs' add/edit events.
 *   - After a successful save the dialog closes itself and emits `(Saved)` with
 *     `{ kind: 'source' | 'type' }` so the host reloads the right shared data.
 *   - When a source save is blocked because no content type exists, it emits
 *     `(ContentTypeMissing)` so the host shows its no-content-type warning.
 *   - "Open advanced settings" navigates to the full entity form via the host's
 *     NavigationService through the `(NavigateToRecordRequested)` output.
 */
import { Component, ChangeDetectorRef, EventEmitter, Output, inject } from '@angular/core';
import { BaseEntity, CompositeKey } from '@memberjunction/core';
import { TreeBranchConfig, TreeLeafConfig } from '@memberjunction/ng-trees';
import { KnowledgeHubMetadataEngine, MJContentSourceEntity, MJContentSourceEntity_IContentSourceConfiguration, MJContentSourceTypeEntity_IContentSourceTypeField } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { SourceCard, ContentTypeCard, DropdownOption, FormMode } from '../shared/classify.types';

/** The taxonomy-mode literal union, derived from the typed config so it can never drift. */
type TaxonomyModeJson = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['TagTaxonomyMode']>;

/** One selectable taxonomy-mode card (icon + name + one-line "best for"). */
interface TaxonomyModeOption {
    value: TaxonomyModeJson;
    label: string;
    icon: string;
    bestFor: string;
}

/** Default classifier knob values — mirrors the autotagger's runtime defaults + the reference panel. */
const DEFAULT_TAXONOMY_MODE: TaxonomyModeJson = 'auto-grow';
const DEFAULT_MATCH_THRESHOLD = 0.85;
const SUGGEST_THRESHOLD_GAP = 0.05;
const DEFAULT_SHARE_TAXONOMY = true;
const DEFAULT_ENABLE_VECTORIZATION = true;

/** One row in the effective-values aside: the resolved value + where it came from. */
interface EffectiveValueRow {
    label: string;
    value: string;
    origin: 'source override' | 'default';
}

@Component({
    standalone: false,
    selector: 'classify-source-type-form-dialog',
    templateUrl: './source-type-form.dialog.component.html',
    styleUrls: ['./source-type-form.dialog.component.css']
})
export class ClassifySourceTypeFormDialogComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    // ── Cross-tab / host intents ──

    /** Emitted after a successful save so the host reloads the relevant shared data. */
    @Output() Saved = new EventEmitter<{ kind: 'source' | 'type' }>();
    /** Emitted when a source save is blocked because no content type exists. */
    @Output() ContentTypeMissing = new EventEmitter<void>();
    /** Emitted when the user opts into the full entity form (advanced settings). */
    @Output() NavigateToRecordRequested = new EventEmitter<{ entityName: string; key: CompositeKey }>();

    // ── Slide-in form state ──
    public FormMode: FormMode = 'none';
    public FormSaving = false;

    // Source form fields
    public FormSourceName = '';
    public FormSourceTypeID = '';
    public FormContentTypeID = '';
    public FormFileTypeID = '';
    public FormSourceURL = '';
    public EditingSourceID = '';

    // Content Type form fields
    public FormTypeName = '';
    public FormTypeDescription = '';
    public FormTypeAIModelID = '';
    public FormTypeMinTags = 1;
    public FormTypeMaxTags = 10;
    public EditingTypeID = '';

    // Embedding model + vector index form fields (Content Type)
    public FormTypeEmbeddingModelID = '';
    public FormTypeVectorIndexID = '';

    // Entity source fields (shown when source type is "Entity")
    public FormSourceEntityID = '';
    public FormSourceEntityDocID = '';

    // Embedding model + vector index form fields (Content Source overrides)
    public FormSourceEmbeddingModelID = '';
    public FormSourceVectorIndexID = '';

    // Slide-in is the QUICK-EDIT surface for content sources. We only expose the
    // most-useful subset of the new knobs here; the full surface (other budgets,
    // URL pattern, root URL, taxonomy mode, thresholds, …) lives on the entity
    // form opened via the "Open Advanced settings →" link below.
    //
    // Decisions:
    //   - MaxItemsPerRun: the single most-asked-for cap → always shown
    //   - MaxDepth + the two crawl toggles: Website-only, the symptom that
    //     started this whole work
    //   - Everything else: too niche for the quick-edit surface
    public FormMaxItemsPerRun: number | null = null;
    public FormMaxDepth: number | null = null;
    public FormCrawlSitesInLowerLevelDomain: boolean = true;
    public FormCrawlOtherSitesInTopLevelDomain: boolean = false;

    // ── Classification (full config parity) ──────────────────────────────
    // The classifier knobs that used to require navigating out to the entity
    // form's "advanced settings" are now edited inline. They live on the typed
    // Configuration JSON (`MJContentSourceEntity_IContentSourceConfiguration`),
    // accessed via the `Config` getter / `setConfig` merge helper below.
    //
    // For EDIT we hydrate `workingConfig` from the loaded source's
    // ConfigurationObject; for ADD we start from {} and accumulate. On SAVE the
    // working config is merged into the entity's ConfigurationObject so we never
    // clobber Website / SourceSpecificConfiguration sub-objects.
    private workingConfig: MJContentSourceEntity_IContentSourceConfiguration = {};

    /** Selectable taxonomy-mode cards. Exactly the three modes the type allows — no 'hybrid'. */
    public readonly TaxonomyModes: TaxonomyModeOption[] = [
        { value: 'constrained', label: 'Constrained', icon: 'fa-lock',     bestFor: 'Curated, regulated taxonomies' },
        { value: 'auto-grow',   label: 'Auto-Grow',   icon: 'fa-seedling', bestFor: 'Bounded growth under a tag root' },
        { value: 'free-flow',   label: 'Free-Flow',   icon: 'fa-water',    bestFor: 'Sandbox — anything goes' },
    ];

    /** Tags eligible to be the taxonomy root (loaded from TagEngineBase). */
    public TagRootOptions: { ID: string; Name: string }[] = [];

    // ── Config accessor + merge helper (mirrors TagPipelineConfigurationPanel) ──

    /** The working classifier config — never null; defaults are applied by the typed getters below. */
    public get Config(): MJContentSourceEntity_IContentSourceConfiguration {
        return this.workingConfig;
    }

    /** Merge a partial patch into the working config (immutable spread, like the reference panel). */
    public setConfig(patch: Partial<MJContentSourceEntity_IContentSourceConfiguration>): void {
        this.workingConfig = { ...this.workingConfig, ...patch };
    }

    // Taxonomy mode
    public get CurrentMode(): TaxonomyModeJson {
        return this.Config.TagTaxonomyMode ?? DEFAULT_TAXONOMY_MODE;
    }
    public SetMode(mode: TaxonomyModeJson): void {
        this.setConfig({ TagTaxonomyMode: mode });
    }

    // Thresholds — match auto-applies; suggest routes to inbox. When match moves
    // and suggest is unset/above it, default suggest to max(0, match - 0.05).
    public get MatchThresholdValue(): number {
        return this.Config.TagMatchThreshold ?? DEFAULT_MATCH_THRESHOLD;
    }
    public set MatchThresholdValue(v: number | string) {
        const clamped = Math.max(0, Math.min(1, Number(v) || 0));
        const cur = this.Config.SuggestThreshold;
        const patch: Partial<MJContentSourceEntity_IContentSourceConfiguration> = { TagMatchThreshold: clamped };
        if (cur == null || cur >= clamped) {
            patch.SuggestThreshold = Math.max(0, clamped - SUGGEST_THRESHOLD_GAP);
        }
        this.setConfig(patch);
    }
    public get SuggestThresholdValue(): number {
        return this.Config.SuggestThreshold ?? Math.max(0, this.MatchThresholdValue - SUGGEST_THRESHOLD_GAP);
    }
    public set SuggestThresholdValue(v: number | string) {
        const clamped = Math.max(0, Math.min(this.MatchThresholdValue, Number(v) || 0));
        this.setConfig({ SuggestThreshold: clamped });
    }
    public get ThresholdValidationMessage(): string | null {
        const m = this.Config.TagMatchThreshold;
        const s = this.Config.SuggestThreshold;
        if (m != null && s != null && s >= m) {
            return 'Suggest threshold must be lower than the match threshold.';
        }
        return null;
    }

    // Tag root + toggles
    public get TagRootIDValue(): string {
        return this.Config.TagRootID ?? '';
    }
    public set TagRootIDValue(v: string) {
        this.setConfig({ TagRootID: v ? v : null });
    }
    public get ShareTaxonomyValue(): boolean {
        return this.Config.ShareTaxonomyWithLLM !== false; // default true
    }
    public set ShareTaxonomyValue(v: boolean) {
        this.setConfig({ ShareTaxonomyWithLLM: v });
    }
    public get EnableVectorizationValue(): boolean {
        return this.Config.EnableVectorization !== false; // default true
    }
    public set EnableVectorizationValue(v: boolean) {
        this.setConfig({ EnableVectorization: v });
    }

    // Budgets (blank = unlimited → key stripped from JSON)
    public get MaxNewTagsPerRunValue(): number | null {
        return this.Config.MaxNewTagsPerRun ?? null;
    }
    public set MaxNewTagsPerRunValue(v: number | string | null) {
        this.setConfig({ MaxNewTagsPerRun: this.normalizeNullableNumber(v) });
    }
    public get MaxNewTagsPerItemValue(): number | null {
        return this.Config.MaxNewTagsPerItem ?? null;
    }
    public set MaxNewTagsPerItemValue(v: number | string | null) {
        this.setConfig({ MaxNewTagsPerItem: this.normalizeNullableNumber(v) });
    }
    public get MaxTokensPerRunValue(): number | null {
        return this.Config.MaxTokensPerRun ?? null;
    }
    public set MaxTokensPerRunValue(v: number | string | null) {
        this.setConfig({ MaxTokensPerRun: this.normalizeNullableNumber(v) });
    }
    public get MaxCostPerRunValue(): number | null {
        return this.Config.MaxCostPerRun ?? null;
    }
    public set MaxCostPerRunValue(v: number | string | null) {
        this.setConfig({ MaxCostPerRun: this.normalizeNullableNumber(v) });
    }

    /**
     * Coerce a possibly-blank input into a typed number. Returning undefined
     * deletes the key from the persisted JSON when the setConfig spread is applied.
     */
    private normalizeNullableNumber(v: number | string | null | undefined): number | undefined {
        if (v == null) return undefined;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') return undefined;
            const n = Number(trimmed);
            return Number.isFinite(n) ? n : undefined;
        }
        return Number.isFinite(v) ? v : undefined;
    }

    /** Human label for the currently-selected tag root (for the effective-values aside). */
    private get tagRootLabel(): string {
        const id = this.Config.TagRootID;
        if (!id) return 'Whole taxonomy';
        const match = this.TagRootOptions.find(t => UUIDsEqual(t.ID, id));
        return match?.Name ?? 'Whole taxonomy';
    }

    /**
     * The effective value of each key knob + where it comes from. Since the tag
     * classifier fields are source-level JSON (no content-type cascade), the
     * effective value is the configured override or the documented default.
     */
    public get EffectiveValues(): EffectiveValueRow[] {
        const c = this.Config;
        const mode = this.TaxonomyModes.find(m => m.value === this.CurrentMode);
        return [
            { label: 'Taxonomy mode', value: mode?.label ?? this.CurrentMode, origin: c.TagTaxonomyMode != null ? 'source override' : 'default' },
            { label: 'Tag root', value: this.tagRootLabel, origin: c.TagRootID ? 'source override' : 'default' },
            { label: 'Match threshold', value: this.MatchThresholdValue.toFixed(2), origin: c.TagMatchThreshold != null ? 'source override' : 'default' },
            { label: 'Suggest threshold', value: this.SuggestThresholdValue.toFixed(2), origin: c.SuggestThreshold != null ? 'source override' : 'default' },
            { label: 'Share taxonomy w/ LLM', value: this.ShareTaxonomyValue ? 'On' : 'Off', origin: c.ShareTaxonomyWithLLM != null ? 'source override' : 'default' },
            { label: 'Vectorization', value: this.EnableVectorizationValue ? 'On' : 'Off', origin: c.EnableVectorization != null ? 'source override' : 'default' },
        ];
    }

    /** True when the form's selected source type is Website — gates the crawler knobs. */
    public get IsWebsiteSourceTypeSelected(): boolean {
        if (!this.FormSourceTypeID) return false;
        const t = this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.FormSourceTypeID));
        return t != null && t.Name?.trim().toLowerCase() === 'website';
    }

    /** Whether the selected source type is the Entity type (name-based check) */
    public get IsEntitySourceTypeSelected(): boolean {
        if (!this.FormSourceTypeID) return false;
        const sourceType = this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.FormSourceTypeID));
        return sourceType?.Name?.toLowerCase() === 'entity';
    }

    /** Whether the selected source type requires Content Type / File Type selection */
    public get SelectedSourceTypeRequiresContentType(): boolean {
        if (!this.FormSourceTypeID) return true;
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const st = engine.ContentSourceTypes.find(t => UUIDsEqual(t.ID, this.FormSourceTypeID));
            return st?.ConfigurationObject?.RequiresContentType !== false;
        } catch {
            return true;
        }
    }

    /** Entities that have at least one EntityDocument configured */
    public get EntitiesWithDocuments(): { ID: string; Name: string }[] {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const docs = engine.GetActiveEntityDocuments();
            const entityMap = new Map<string, string>();
            const md = this.ProviderToUse;
            for (const doc of docs) {
                const entityName = doc.Get('Entity') as string;
                if (entityName) {
                    const entityInfo = md.Entities.find(e => e.Name === entityName);
                    if (entityInfo && !entityMap.has(entityInfo.ID)) {
                        entityMap.set(entityInfo.ID, entityInfo.Name);
                    }
                }
            }
            return Array.from(entityMap.entries())
                .map(([ID, Name]) => ({ ID, Name }))
                .sort((a, b) => a.Name.localeCompare(b.Name));
        } catch {
            return [];
        }
    }

    /** Entity documents for the selected entity */
    public get EntityDocOptionsForSelectedEntity(): { ID: string; Name: string }[] {
        if (!this.FormSourceEntityID) return [];
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, this.FormSourceEntityID));
            if (!entityInfo) return [];
            return engine.GetActiveEntityDocuments()
                .filter(d => (d.Get('Entity') as string) === entityInfo.Name)
                .map(d => ({ ID: d.ID, Name: d.Name }));
        } catch {
            return [];
        }
    }

    // ── Dynamic source-type fields (metadata-driven) ──

    /** Stores source-type-specific config values keyed by RequiredFields[].Key */
    public FormSourceSpecificConfig: Record<string, string> = {};

    /** Available MJ Storage provider keys for the storage-provider-picker widget */
    public StorageProviderOptions: string[] = ['Azure Blob Storage', 'AWS S3', 'Google Cloud Storage', 'SharePoint', 'Dropbox', 'Box'];

    /**
     * The RequiredFields array from the selected source type's ConfigurationObject.
     * Drives dynamic form rendering — each field becomes a widget.
     */
    public get SelectedSourceTypeFields(): MJContentSourceTypeEntity_IContentSourceTypeField[] {
        if (!this.FormSourceTypeID) return [];
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const sourceType = engine.ContentSourceTypes.find(st => UUIDsEqual(st.ID, this.FormSourceTypeID));
            if (!sourceType) return [];
            const config = sourceType.ConfigurationObject;
            return config?.RequiredFields ?? [];
        } catch {
            return [];
        }
    }

    /**
     * Get dependent options for a field (e.g., entity-doc-picker depends on entity-picker).
     * Returns entity documents for the entity selected in the dependent field.
     */
    public GetDependentOptions(field: MJContentSourceTypeEntity_IContentSourceTypeField): { ID: string; Name: string }[] {
        if (field.Type === 'entity-doc-picker' && field.DependsOnField) {
            const entityID = this.FormSourceSpecificConfig[field.DependsOnField];
            if (!entityID) return [];
            try {
                const engine = KnowledgeHubMetadataEngine.Instance;
                const md = this.ProviderToUse;
                const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
                if (!entityInfo) return [];
                return engine.GetActiveEntityDocuments()
                    .filter(d => (d.Get('Entity') as string) === entityInfo.Name)
                    .map(d => ({ ID: d.ID, Name: d.Name }));
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * Handle a source-specific field value change.
     * For entity-picker: auto-select the first entity doc if only one exists.
     */
    public OnSourceFieldChanged(fieldKey: string): void {
        // Find fields that depend on this field
        for (const field of this.SelectedSourceTypeFields) {
            if (field.DependsOnField === fieldKey) {
                const options = this.GetDependentOptions(field);
                if (options.length === 1) {
                    this.FormSourceSpecificConfig[field.Key] = options[0].ID;
                } else {
                    this.FormSourceSpecificConfig[field.Key] = '';
                }
            }
        }
    }

    // Dropdown options for forms
    public SourceTypeOptions: DropdownOption[] = [];
    public ContentTypeOptions: DropdownOption[] = [];
    public FileTypeOptions: DropdownOption[] = [];
    public AIModelOptions: DropdownOption[] = [];
    public EmbeddingModelOptions: DropdownOption[] = [];
    public VectorIndexOptions: DropdownOption[] = [];

    // Tree-dropdown configs for AI model selection (vendor → model grouping)
    public AIModelVendorBranch: TreeBranchConfig = {
        EntityName: 'MJ: AI Vendors',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-building',
        OrderBy: 'Name ASC',
    };
    public AllModelsLeaf: TreeLeafConfig = {
        EntityName: 'MJ: AI Models',
        ParentField: '',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-brain',
        OrderBy: '__mj_CreatedAt DESC',
        JunctionConfig: {
            EntityName: 'MJ: AI Model Vendors',
            LeafForeignKey: 'ModelID',
            BranchForeignKey: 'VendorID',
        },
    };
    /** Branch config filtered to only vendors that have at least one embedding model */
    public EmbeddingVendorBranch: TreeBranchConfig = {
        EntityName: 'MJ: AI Vendors',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-building',
        OrderBy: 'Name ASC',
        ExtraFilter: `ID IN (SELECT mv.VendorID FROM [__mj].vwAIModelVendors mv JOIN [__mj].vwAIModels m ON mv.ModelID = m.ID WHERE m.AIModelType = 'Embeddings')`,
    };
    public EmbeddingModelsLeaf: TreeLeafConfig = {
        EntityName: 'MJ: AI Models',
        ParentField: '',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-vector-square',
        ExtraFilter: "AIModelType = 'Embeddings'",
        OrderBy: '__mj_CreatedAt DESC',
        JunctionConfig: {
            EntityName: 'MJ: AI Model Vendors',
            LeafForeignKey: 'ModelID',
            BranchForeignKey: 'VendorID',
        },
    };

    /** Convert a string ID to a CompositeKey for tree-dropdown binding */
    public ToCompositeKey(id: string | null | undefined): CompositeKey | null {
        if (!id) return null;
        return new CompositeKey([{ FieldName: 'ID', Value: id }]);
    }

    /** Extract the ID string from a CompositeKey (from tree-dropdown ValueChange) */
    public FromCompositeKey(key: CompositeKey | CompositeKey[] | null): string {
        if (!key) return '';
        const ck = Array.isArray(key) ? key[0] : key;
        if (!ck?.KeyValuePairs?.length) return '';
        return String(ck.KeyValuePairs[0].Value || '');
    }

    // ════════════════════════════════════════════
    // PUBLIC OPEN METHODS — called by the host via @ViewChild
    // ════════════════════════════════════════════

    public async OpenAddSource(): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.resetSourceForm();
        this.FormMode = 'add-source';
        this.cdr.detectChanges();
    }

    public async OpenEditSource(card: SourceCard): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.FormSourceName = card.Name;
        this.FormSourceTypeID = card.ContentSourceTypeID;
        this.FormContentTypeID = card.ContentTypeID;
        this.FormFileTypeID = card.ContentFileTypeID;
        this.FormSourceURL = card.URL;
        this.FormSourceEntityID = card.EntityID ?? '';
        this.FormSourceEntityDocID = card.EntityDocumentID ?? '';
        this.FormSourceEmbeddingModelID = card.EmbeddingModelID ?? '';
        this.FormSourceVectorIndexID = card.VectorIndexID ?? '';
        this.EditingSourceID = card.ID;

        // Populate quick-edit knobs + FormSourceSpecificConfig from Configuration JSON.
        // Reset to defaults first so a previously-edited source's values don't leak in.
        this.FormSourceSpecificConfig = {};
        this.FormMaxItemsPerRun = null;
        this.FormMaxDepth = null;
        this.FormCrawlSitesInLowerLevelDomain = true;
        this.FormCrawlOtherSitesInTopLevelDomain = false;
        this.workingConfig = {};
        const rawSource = this.RawSources.find(s => UUIDsEqual(s['ID'] as string, card.ID));
        if (rawSource) {
            const configStr = rawSource['Configuration'] as string | null;
            if (configStr) {
                try {
                    const parsed = JSON.parse(configStr) as MJContentSourceEntity_IContentSourceConfiguration | null;
                    // Hydrate the working classifier config from the persisted JSON.
                    // Defaults are applied lazily by the typed getters, so we only
                    // copy what was actually stored (unset = "use default").
                    if (parsed) {
                        this.workingConfig = { ...parsed };
                    }
                    const specific = parsed?.SourceSpecificConfiguration as Record<string, string> | undefined;
                    if (specific) {
                        this.FormSourceSpecificConfig = { ...specific };
                    }
                    // Run-budget knob — pulled directly off the typed Configuration.
                    const items = parsed?.MaxItemsPerRun;
                    if (typeof items === 'number' && Number.isFinite(items)) {
                        this.FormMaxItemsPerRun = items;
                    }
                    // Website sub-object — only populates the inputs when present
                    // (matches the autotagger's "unset = default" semantics).
                    const website = parsed?.Website;
                    if (website) {
                        const depth = website.MaxDepth;
                        if (typeof depth === 'number' && Number.isFinite(depth)) {
                            this.FormMaxDepth = depth;
                        }
                        if (typeof website.CrawlSitesInLowerLevelDomain === 'boolean') {
                            this.FormCrawlSitesInLowerLevelDomain = website.CrawlSitesInLowerLevelDomain;
                        }
                        if (typeof website.CrawlOtherSitesInTopLevelDomain === 'boolean') {
                            this.FormCrawlOtherSitesInTopLevelDomain = website.CrawlOtherSitesInTopLevelDomain;
                        }
                    }
                } catch {
                    // Configuration not valid JSON, ignore
                }
            }
        }

        this.FormMode = 'edit-source';
        this.cdr.detectChanges();
    }

    public async OpenAddType(): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.resetTypeForm();
        this.FormMode = 'add-type';
        this.cdr.detectChanges();
    }

    public async OpenEditType(card: ContentTypeCard): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.FormTypeName = card.Name;
        this.FormTypeDescription = card.Description;
        this.FormTypeAIModelID = card.AIModelID;
        this.FormTypeMinTags = card.MinTags;
        this.FormTypeMaxTags = card.MaxTags;
        this.FormTypeEmbeddingModelID = card.EmbeddingModelID ?? '';
        this.FormTypeVectorIndexID = card.VectorIndexID ?? '';
        this.EditingTypeID = card.ID;
        this.FormMode = 'edit-type';
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // ADVANCED SETTINGS
    // ════════════════════════════════════════════

    /**
     * Open the full entity form for the source currently being edited in the
     * slide-in. Quick-edit covers the most-used knobs; the entity form (with
     * the dynamically-mounted BaseFormPanel slots) exposes everything else
     * — taxonomy mode, thresholds, all five run-budget caps, URL pattern,
     * root URL, etc. The host owns NavigationService, so navigation bubbles up.
     */
    public OpenAdvancedSourceSettings(): void {
        if (!this.EditingSourceID) return;
        const id = this.EditingSourceID;
        this.CloseForm();
        this.NavigateToRecordRequested.emit({
            entityName: 'MJ: Content Sources',
            key: CompositeKey.FromID(id),
        });
    }

    // ════════════════════════════════════════════
    // SAVE — Sources
    // ════════════════════════════════════════════

    public async SaveSource(): Promise<void> {
        if (this.FormSaving) return;

        // Validate required fields before saving
        if (!this.FormSourceName.trim()) {
            MJNotificationService.Instance.CreateSimpleNotification('Please enter a source name.', 'warning', 3000);
            return;
        }
        if (!this.FormSourceTypeID) {
            MJNotificationService.Instance.CreateSimpleNotification('Please select a source type.', 'warning', 3000);
            return;
        }

        // For non-Entity source types, ContentType is required
        if (!this.IsEntitySourceTypeSelected && this.SelectedSourceTypeRequiresContentType) {
            if (!this.FormContentTypeID) {
                if (this.ContentTypeOptions.length === 0) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'No content types are configured. Please create a content type first in the Content Types section.',
                        'warning', 5000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Please select a content type.',
                        'warning', 3000
                    );
                }
                return;
            }
        }

        this.FormSaving = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources');

            if (this.FormMode === 'edit-source' && this.EditingSourceID) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.EditingSourceID }]));
            } else {
                entity.NewRecord();
            }

            entity.Name = this.FormSourceName;
            entity.ContentSourceTypeID = this.FormSourceTypeID;

            // For Entity source type, ContentType and FileType are not relevant
            // but the DB columns are NOT NULL, so default to the first available value
            if (this.IsEntitySourceTypeSelected) {
                const engine = KnowledgeHubMetadataEngine.Instance;
                if (!entity.ContentTypeID) {
                    if (engine.ContentTypes.length === 0) {
                        this.FormSaving = false;
                        this.cdr.detectChanges();
                        this.ContentTypeMissing.emit();
                        return;
                    }
                    entity.ContentTypeID = engine.ContentTypes[0].ID;
                }
                if (!entity.ContentFileTypeID && engine.ContentFileTypes.length > 0) {
                    entity.ContentFileTypeID = engine.ContentFileTypes[0].ID;
                }
            } else {
                entity.ContentTypeID = this.FormContentTypeID;
                entity.ContentFileTypeID = this.FormFileTypeID;
            }

            // Store source-type-specific values from the dynamic form
            // For Entity type: EntityID and EntityDocumentID go on the entity directly
            if (this.IsEntitySourceTypeSelected) {
                entity.EntityID = this.FormSourceSpecificConfig['EntityID'] || null;
                const entityDocID = this.FormSourceSpecificConfig['EntityDocumentID'];
                if (entityDocID) {
                    entity.EntityDocumentID = entityDocID;
                } else {
                    // Auto-select first doc if only one exists
                    const docField = this.SelectedSourceTypeFields.find(f => f.Type === 'entity-doc-picker');
                    const docs = docField ? this.GetDependentOptions(docField) : [];
                    entity.EntityDocumentID = docs.length > 0 ? docs[0].ID : null;
                }
                entity.URL = '';
            } else {
                entity.EntityID = null;
                entity.EntityDocumentID = null;
                // URL comes from dynamic fields for RSS/Website, or empty for others
                entity.URL = this.FormSourceSpecificConfig['URL'] || '';
            }

            // Store the full SourceSpecificConfiguration in the Configuration JSON
            const currentConfig = entity.ConfigurationObject ?? {};

            // Merge the inline Classification knobs (taxonomy mode, thresholds,
            // tag root, budgets, toggles) from the working config. We deliberately
            // exclude the sub-objects owned by the dedicated quick-edit logic below
            // (SourceSpecificConfiguration, MaxItemsPerRun, Website) so those stay
            // single-owner and we never clobber crawl settings. Keys absent from the
            // working config are left untouched on currentConfig.
            const { SourceSpecificConfiguration: _ssc, MaxItemsPerRun: _mipr, Website: _web, ...classifierKnobs } = this.workingConfig;
            Object.assign(currentConfig, classifierKnobs);

            currentConfig.SourceSpecificConfiguration = { ...this.FormSourceSpecificConfig };

            // Persist the quick-edit knobs that don't have their own DB columns
            // (the rest live on the typed Configuration JSON sub-objects). The
            // advanced settings flow on the entity form can override more fields
            // — we only touch the keys the slide-in exposes so we don't clobber
            // unrelated values an operator set there earlier.
            if (this.FormMaxItemsPerRun != null && Number.isFinite(this.FormMaxItemsPerRun)) {
                currentConfig.MaxItemsPerRun = this.FormMaxItemsPerRun;
            } else {
                // Empty input = "unlimited" — strip the key so the autotagger
                // sees no cap (rather than 0 = "process zero items").
                delete currentConfig.MaxItemsPerRun;
            }

            if (this.IsWebsiteSourceTypeSelected) {
                const website = { ...(currentConfig.Website ?? {}) };
                if (this.FormMaxDepth != null && Number.isFinite(this.FormMaxDepth)) {
                    website.MaxDepth = this.FormMaxDepth;
                } else {
                    delete website.MaxDepth;
                }
                website.CrawlSitesInLowerLevelDomain = this.FormCrawlSitesInLowerLevelDomain;
                website.CrawlOtherSitesInTopLevelDomain = this.FormCrawlOtherSitesInTopLevelDomain;
                currentConfig.Website = website;
            }

            entity.ConfigurationObject = currentConfig;

            entity.EmbeddingModelID = this.FormSourceEmbeddingModelID || null;
            entity.VectorIndexID = this.FormSourceVectorIndexID || null;

            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.FormMode === 'edit-source' ? 'Source updated' : 'Source created', 'success', 2500
                );
                this.CloseForm();
                this.Saved.emit({ kind: 'source' });
            } else {
                // CP-4: Show detailed error from LatestResult
                const errorDetail = entity.LatestResult?.Message ?? 'Unknown error';
                console.error('[Classify] Save source failed:', entity.LatestResult);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save source: ${errorDetail}`, 'error', 5000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Classify] Save source exception:', error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.FormSaving = false;
            this.cdr.detectChanges();
        }
    }

    // ════════════════════════════════════════════
    // SAVE — Content Types
    // ════════════════════════════════════════════

    public async SaveContentType(): Promise<void> {
        if (this.FormSaving) return;
        this.FormSaving = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Content Types');

            if (this.FormMode === 'edit-type' && this.EditingTypeID) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.EditingTypeID }]));
            } else {
                entity.NewRecord();
            }

            entity.Set('Name', this.FormTypeName);
            entity.Set('Description', this.FormTypeDescription);
            entity.Set('AIModelID', this.FormTypeAIModelID);
            entity.Set('MinTags', this.FormTypeMinTags);
            entity.Set('MaxTags', this.FormTypeMaxTags);
            entity.Set('EmbeddingModelID', this.FormTypeEmbeddingModelID || null);
            entity.Set('VectorIndexID', this.FormTypeVectorIndexID || null);

            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.FormMode === 'edit-type' ? 'Content type updated' : 'Content type created', 'success', 2500
                );
                this.CloseForm();
                this.Saved.emit({ kind: 'type' });
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save content type', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        } finally {
            this.FormSaving = false;
            this.cdr.detectChanges();
        }
    }

    public CloseForm(): void {
        this.FormMode = 'none';
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // RAW SOURCES — supplied by the host so edit can read Configuration JSON
    // ════════════════════════════════════════════

    /**
     * Raw `MJ: Content Sources` rows, forwarded by the host so `OpenEditSource`
     * can hydrate the quick-edit knobs from the source's Configuration JSON. The
     * card the Sources tab passes doesn't carry the full Configuration blob.
     */
    public RawSources: Record<string, unknown>[] = [];

    // ════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════

    private async ensureFormDropdownsLoaded(): Promise<void> {
        try {
            // Use KnowledgeHubMetadataEngine for cached reference data — instant, no RunView needed
            const engine = KnowledgeHubMetadataEngine.Instance;
            await engine.Config(false); // no-op if already loaded

            this.SourceTypeOptions = engine.ContentSourceTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.ContentTypeOptions = engine.ContentTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.FileTypeOptions = engine.ContentFileTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.VectorIndexOptions = engine.VectorIndexes.map(vi => ({ ID: vi.ID, Name: vi.Name }));

            // AI Models from AIEngineBase (already cached)
            if (this.AIModelOptions.length === 0) {
                const aiEngine = AIEngineBase.Instance;
                await aiEngine.Config(false);
                this.AIModelOptions = aiEngine.Models.map(m => ({ ID: m.ID, Name: m.Name }));
                this.EmbeddingModelOptions = aiEngine.Models
                    .filter(m => m.AIModelType?.trim().toLowerCase() === 'embeddings')
                    .map(m => ({ ID: m.ID, Name: m.Name }));
            }

            // Tag-root candidates for the Classification section's root dropdown.
            if (this.TagRootOptions.length === 0) {
                const p = this.ProviderToUse;
                await TagEngineBase.Instance.Config(false, p.CurrentUser, p);
                this.TagRootOptions = TagEngineBase.Instance.Tags
                    .map(t => ({ ID: t.ID, Name: t.Name }))
                    .sort((a, b) => a.Name.localeCompare(b.Name));
            }
        } catch (error) {
            console.error('[Autotagging] Error loading form dropdowns:', error);
        }
    }

    private resetSourceForm(): void {
        this.FormSourceName = '';
        this.FormSourceTypeID = '';
        this.FormContentTypeID = '';
        this.FormFileTypeID = '';
        this.FormSourceURL = '';
        this.FormSourceEntityID = '';
        this.FormSourceEntityDocID = '';
        this.FormSourceEmbeddingModelID = '';
        this.FormSourceVectorIndexID = '';
        this.EditingSourceID = '';
        this.FormSourceSpecificConfig = {};
        // Quick-edit knobs — defaults match the autotagger's runtime defaults.
        this.FormMaxItemsPerRun = null;
        this.FormMaxDepth = null;
        this.FormCrawlSitesInLowerLevelDomain = true;
        this.FormCrawlOtherSitesInTopLevelDomain = false;
        // Classification knobs — start empty; the typed getters apply defaults.
        this.workingConfig = {};
    }

    private resetTypeForm(): void {
        this.FormTypeName = '';
        this.FormTypeDescription = '';
        this.FormTypeAIModelID = '';
        this.FormTypeMinTags = 1;
        this.FormTypeMaxTags = 10;
        this.FormTypeEmbeddingModelID = '';
        this.FormTypeVectorIndexID = '';
        this.EditingTypeID = '';
    }
}
