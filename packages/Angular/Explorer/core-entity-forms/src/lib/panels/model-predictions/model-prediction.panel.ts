import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { CompositeKey, LogError, Metadata, RunView } from '@memberjunction/core';
import { MJMLModelEntity, MJMLModelScoringBindingEntity, MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import {
    OutcomeBand,
    resolveOutcomeConfig,
    resolveOutcomeStyle,
    resolveScoreBand,
} from '@memberjunction/predictive-studio-core';
import {
    ModelHistorySummary,
    PredictionBand,
    PredictionDriver,
    PredictionHistoryItem,
    BandFor,
    FilterHistoryByModel,
    FormatLastScored,
    FormatValue,
    GaugePct,
    GetDistinctModelsFromHistory,
    ParseDrivers,
    ParseHistoryItem,
    ResolveLabel,
    ToNumber,
    ValueKind,
} from './model-prediction.logic';

/**
 * A fully-resolved, entity-agnostic prediction card view-model. One per active
 * scoring binding on the current record's entity.
 */
export interface PredictionCard {
    /** Binding ID — used as the @for track key. */
    BindingId: string;
    /** Model ID — used to cross-link with prediction history. */
    modelId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Human label for the prediction (model target → bound column → fallback). */
    Label: string;
    /** True when the model is a 0–1 probability we can render as a gauge. */
    IsProbability: boolean;
    /** True for regression models showing a raw numeric value. */
    IsNumeric: boolean;
    /** True for classification models showing a class label. */
    IsClass: boolean;
    /** Pre-formatted primary value string ("72%", "1,240.5", "Renewing", "—"). */
    DisplayValue: string;
    /** 0–100 fill for the probability gauge (only meaningful when isProbability). */
    GaugePct: number;
    /** Neutral band for the gauge segment styling (only meaningful when isProbability). */
    Band: PredictionBand | null;
    /** Resolved semantic status band from outcomeConfig */
    StatusBand: OutcomeBand | null;
    /** Human-readable status label (e.g. "Low Risk", "High") */
    StatusLabel: string | null;
    /** Semantic badge color: 'green' | 'amber' | 'red' | 'blue' | 'gray' */
    BadgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray';
    /** FontAwesome icon class (e.g. 'fa-circle-check', 'fa-triangle-exclamation') */
    BadgeIcon: string | null;
    /** Top feature-importance drivers, or empty when unavailable. */
    Drivers: PredictionDriver[];
    /** Provenance: "Pipeline Name v3". */
    Provenance: string;
    /** "Last scored" timestamp string, or null when unavailable. */
    LastScored: string | null;
}

/**
 * Model Prediction panel — an **entity-agnostic** form panel that surfaces any
 * predictions a trained ML model has written onto the current record via a
 * `MJ: ML Model Scoring Bindings` row.
 *
 * It registers against the `'*'` wildcard entity, so it mounts on EVERY entity
 * form — but renders **nothing** unless the record's entity has at least one
 * active scoring binding. The 99% of forms with no model see an invisible,
 * one-RunView-cheap panel.
 *
 * Driven entirely by metadata (bindings + models); there is no entity-specific,
 * domain-specific, or "renewal/risk"-specific logic anywhere. Members/renewal
 * is only ever a test example.
 *
 * Self-mounts via the `after-fields` slot. Reusable as a plain component too
 * (composition) by binding `[Record]` + `[FormComponent]`.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'model-predictions:model-prediction',
    skipNullKeyWarning: true,
    metadata: {
        entity: '*',          // wildcard — appears on every entity form, self-hides when N/A
        slot: 'after-fields',
        sortKey: 40,
    },
})
@Component({
    standalone: false,
    selector: 'mj-model-prediction-panel',
    templateUrl: './model-prediction.panel.html',
    styleUrls: ['./model-prediction.panel.css'],
})
export class ModelPredictionPanel extends BaseFormPanel implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** The resolved cards to render. Empty → panel renders nothing. */
    public Cards: PredictionCard[] = [];
    /** True once the binding lookup has completed (success or empty). */
    public Loaded = false;
    /** Resolved models by ID for lineage and history decoration. */
    public ModelsById: Map<string, MJMLModelEntity> = new Map();

    /** @deprecated Use {@link ModelsById}. */
    public get modelsById(): Map<string, MJMLModelEntity> {
        return this.ModelsById;
    }
    /** @deprecated Use {@link ModelsById}. */
    public set modelsById(value: Map<string, MJMLModelEntity>) {
        this.ModelsById = value;
    }
    /** Historical prediction runs for this record across models. */
    public HistoryItems: PredictionHistoryItem[] = [];
    /** Loading flag for historical predictions lookup. */
    public LoadingHistory = false;
    /** Whether the prediction history section is expanded in the template. */
    public ShowHistorySection = false;
    /** Selected model ID for history filtering (null = all models). */
    public SelectedModelId: string | null = null;
    /** Expanded history item ID for in-place inspection of payload & drivers. */
    public ExpandedHistoryItemId: string | null = null;
    /** Entity-ID we last loaded cards for, to avoid redundant lookups. */
    private loadedForEntityId: string | null = null;

    public async ngOnInit(): Promise<void> {
        await this.loadCards();
    }

    /** True when there is at least one card or history item to show — gates the whole template. */
    public get HasPredictions(): boolean {
        return this.Cards.length > 0 || this.HistoryItems.length > 0;
    }

    /** Filtered history items based on currently selected model. */
    public get FilteredHistory(): PredictionHistoryItem[] {
        return FilterHistoryByModel(this.HistoryItems, this.SelectedModelId);
    }

    /** Distinct models in prediction history with counts. */
    public get ModelSummaries(): ModelHistorySummary[] {
        return GetDistinctModelsFromHistory(this.HistoryItems);
    }

    /**
     * Look up active scoring bindings for THIS record's entity and build a card
     * per binding. Idempotent + cheap: a single RunView (cached by the server),
     * skipped entirely when we've already loaded for this entity.
     */
    private async loadCards(): Promise<void> {
        const entityId = this.Record?.EntityInfo?.ID ?? null;
        if (!entityId) {
            this.Loaded = true;
            return;
        }
        if (entityId === this.loadedForEntityId) {
            return; // already resolved for this entity
        }
        this.loadedForEntityId = entityId;

        try {
            const bindings = await this.loadBindingsForEntity(entityId);
            if (bindings.length === 0) {
                this.Cards = [];
            } else {
                const models = await this.loadModelsForBindings(bindings);
                this.ModelsById = models;
                this.Cards = this.buildCards(bindings, models);
            }
            // Preload history in the background for this record
            void this.LoadHistory();
        } catch (e) {
            LogError(`[ModelPredictionPanel] Failed to load predictions: ${e instanceof Error ? e.message : String(e)}`);
            this.Cards = [];
        } finally {
            this.Loaded = true;
            this.cdr.markForCheck();
        }
    }

    /**
     * Load historical prediction runs for this specific record across all models.
     */
    public async LoadHistory(): Promise<void> {
        const entityId = this.Record?.EntityInfo?.ID ?? null;
        const pkVal = this.Record?.FirstPrimaryKey?.Value; // first-pk-ok: Target entity single PK value for RecordID filter
        const recordId = pkVal != null ? String(pkVal) : '';
        if (!entityId || !recordId) {
            this.HistoryItems = [];
            this.cdr.markForCheck();
            return;
        }

        this.LoadingHistory = true;
        this.cdr.markForCheck();
        try {
            const rv = this.runView();
            const result = await rv.RunView<MJProcessRunDetailEntity>(
                {
                    EntityName: 'MJ: Process Run Details',
                    ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
                    OrderBy: 'CompletedAt DESC',
                    MaxRows: 50,
                    ResultType: 'entity_object',
                },
                this.contextUser(),
            );

            if (!result.Success) {
                LogError(`[ModelPredictionPanel] Failed to load prediction history: ${result.ErrorMessage}`);
                this.HistoryItems = [];
                return;
            }

            const rawDetails = result.Results ?? [];
            if (rawDetails.length === 0) {
                this.HistoryItems = [];
                return;
            }

            // Ensure any models referenced in historical payloads are loaded
            await this.ensureModelsLoadedForHistory(rawDetails);

            this.HistoryItems = rawDetails.map(d => ParseHistoryItem({
                ID: d.ID,
                ProcessRunID: d.ProcessRunID,
                Status: d.Status,
                CompletedAt: d.CompletedAt,
                ResultPayload: d.ResultPayload,
                ErrorMessage: d.ErrorMessage,
            }, this.ModelsById));
        } catch (e) {
            LogError(`[ModelPredictionPanel] Error loading prediction history: ${e instanceof Error ? e.message : String(e)}`);
            this.HistoryItems = [];
        } finally {
            this.LoadingHistory = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Select a model ID filter for history (null = all models).
     */
    public SelectModelFilter(modelId: string | null): void {
        this.SelectedModelId = modelId;
        this.cdr.markForCheck();
    }

    /**
     * Toggle the prediction history section.
     */
    public ToggleHistorySection(): void {
        this.ShowHistorySection = !this.ShowHistorySection;
        this.cdr.markForCheck();
        if (this.ShowHistorySection && this.HistoryItems.length === 0 && !this.LoadingHistory) {
            void this.LoadHistory();
        }
    }

    /**
     * Focus prediction history on a specific model from a card action.
     */
    public OpenHistoryForModel(modelId: string, event?: MouseEvent): void {
        event?.stopPropagation();
        this.ShowHistorySection = true;
        this.SelectedModelId = modelId;
        this.cdr.markForCheck();
        if (this.HistoryItems.length === 0 && !this.LoadingHistory) {
            void this.LoadHistory();
        }
    }

    /**
     * Toggle inline inspection drawer for a prediction history row.
     */
    public ToggleHistoryDetails(item: PredictionHistoryItem, event?: MouseEvent): void {
        event?.stopPropagation();
        this.ExpandedHistoryItemId = this.ExpandedHistoryItemId === item.id ? null : item.id;
        this.cdr.markForCheck();
    }

    /**
     * Drill down into the underlying MJ: Process Run Details record in Explorer.
     */
    public DrilldownToPredictionRecord(item: PredictionHistoryItem, event?: MouseEvent): void {
        event?.stopPropagation();
        if (this.FormComponent?.OnFormNavigate) {
            this.FormComponent.OnFormNavigate({
                Kind: 'record',
                EntityName: 'MJ: Process Run Details',
                PrimaryKey: CompositeKey.FromID(item.id),
                OpenInNewTab: event ? (event.ctrlKey || event.metaKey) : true,
            });
        }
    }

    /** Active scoring bindings whose target entity is the current record's entity. */
    private async loadBindingsForEntity(entityId: string): Promise<MJMLModelScoringBindingEntity[]> {
        const rv = this.runView();
        const result = await rv.RunView<MJMLModelScoringBindingEntity>(
            {
                EntityName: 'MJ: ML Model Scoring Bindings',
                ExtraFilter: `TargetEntityID='${entityId}' AND TargetColumn IS NOT NULL`,
                OrderBy: '__mj_CreatedAt ASC',
                ResultType: 'entity_object',
            },
            this.contextUser(),
        );
        if (!result.Success) {
            LogError(`[ModelPredictionPanel] Binding lookup failed: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    /** Load the distinct models referenced by the bindings, keyed by model ID. */
    private async loadModelsForBindings(
        bindings: MJMLModelScoringBindingEntity[],
    ): Promise<Map<string, MJMLModelEntity>> {
        const modelIds = [...new Set(bindings.map(b => b.MLModelID).filter((id): id is string => !!id))];
        const byId = new Map<string, MJMLModelEntity>();
        if (modelIds.length === 0) {
            return byId;
        }
        const inList = modelIds.map(id => `'${id}'`).join(',');
        const rv = this.runView();
        const result = await rv.RunView<MJMLModelEntity>(
            {
                EntityName: 'MJ: ML Models',
                ExtraFilter: `ID IN (${inList})`,
                ResultType: 'entity_object',
            },
            this.contextUser(),
        );
        if (!result.Success) {
            LogError(`[ModelPredictionPanel] Model lookup failed: ${result.ErrorMessage}`);
            return byId;
        }
        for (const model of result.Results ?? []) {
            byId.set(model.ID, model);
        }
        return byId;
    }

    /** Ensure models found in process run detail payloads are loaded for metadata decoration. */
    private async ensureModelsLoadedForHistory(details: MJProcessRunDetailEntity[]): Promise<void> {
        const missingModelIds: string[] = [];
        for (const d of details) {
            if (!d.ResultPayload) continue;
            try {
                const parsed: unknown = JSON.parse(d.ResultPayload);
                if (parsed && typeof parsed === 'object') {
                    const rec = parsed as Record<string, unknown>;
                    const out = (rec['output'] && typeof rec['output'] === 'object' ? rec['output'] : rec) as Record<string, unknown>;
                    const mid = typeof out['modelId'] === 'string' ? out['modelId'] : null;
                    if (mid && !this.ModelsById.has(mid) && !missingModelIds.includes(mid)) {
                        missingModelIds.push(mid);
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        if (missingModelIds.length === 0) return;

        const inList = missingModelIds.map(id => `'${id}'`).join(',');
        const rv = this.runView();
        const result = await rv.RunView<MJMLModelEntity>(
            {
                EntityName: 'MJ: ML Models',
                ExtraFilter: `ID IN (${inList})`,
                ResultType: 'entity_object',
            },
            this.contextUser(),
        );
        if (result.Success && result.Results) {
            for (const model of result.Results) {
                this.ModelsById.set(model.ID, model);
            }
        }
    }

    /** Map each binding (+ its model) to a display card. Skips bindings whose model is missing. */
    private buildCards(
        bindings: MJMLModelScoringBindingEntity[],
        models: Map<string, MJMLModelEntity>,
    ): PredictionCard[] {
        const cards: PredictionCard[] = [];
        for (const binding of bindings) {
            const model = binding.MLModelID ? models.get(binding.MLModelID) : undefined;
            if (!model) {
                continue;
            }
            cards.push(this.buildCard(binding, model));
        }
        return cards;
    }

    /** Build one card from a binding + model + the record's bound-column value. */
    private buildCard(binding: MJMLModelScoringBindingEntity, model: MJMLModelEntity): PredictionCard {
        // The column name is data-driven (from the binding), so reading it
        // dynamically via Get() is the legitimate use of the dynamic accessor.
        const rawValue = binding.TargetColumn ? this.Record.Get(binding.TargetColumn) : null;
        const numeric = ToNumber(rawValue);
        const kind = ValueKind(model.ProblemType, numeric);

        const outcomeConfig = resolveOutcomeConfig({
            Lineage: model.Lineage,
            TargetVariable: model.TargetVariable,
            ProblemType: model.ProblemType,
        });

        let statusBand: OutcomeBand | null = null;
        let badgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray' = 'gray';
        let badgeIcon: string | null = null;
        let statusLabel: string | null = null;

        if (numeric != null) {
            statusBand = resolveScoreBand(numeric, outcomeConfig);
            if (statusBand) {
                badgeColor = statusBand.BadgeColor;
                badgeIcon = statusBand.Icon ?? null;
                statusLabel = statusBand.Label;
            }
        } else if (kind === 'class' && typeof rawValue === 'string') {
            const style = resolveOutcomeStyle(rawValue, outcomeConfig);
            badgeColor = style.BadgeColor;
            badgeIcon = style.Icon ?? null;
            statusLabel = style.DisplayLabel ?? rawValue;
        }

        return {
            BindingId: binding.ID,
            modelId: model.ID,
            Label: ResolveLabel(model.TargetVariable, binding.TargetColumn),
            IsProbability: kind === 'probability',
            IsNumeric: kind === 'numeric',
            IsClass: kind === 'class',
            DisplayValue: FormatValue(rawValue, numeric, kind),
            GaugePct: kind === 'probability' && numeric != null ? GaugePct(numeric) : 0,
            Band: kind === 'probability' && numeric != null ? BandFor(numeric) : null,
            StatusBand: statusBand,
            StatusLabel: statusLabel,
            BadgeColor: badgeColor,
            BadgeIcon: badgeIcon,
            Drivers: ParseDrivers(model.FeatureImportance),
            Provenance: `${model.Pipeline} v${model.Version}`,
            LastScored: FormatLastScored(binding.LastScoredAt),
        };
    }

    /** RunView scoped to the form's provider when available (multi-provider safe). */
    private runView(): RunView {
        const provider = this.FormComponent?.ProviderToUse;
        return provider ? RunView.FromMetadataProvider(provider) : new RunView();
    }

    /** Context user for server-side scoping — the form provider's current user. */
    private contextUser() {
        return this.FormComponent?.ProviderToUse?.CurrentUser ?? new Metadata().CurrentUser;
    }
}

/** Tree-shake guard — call this from the consuming module's loader. */
export function LoadModelPredictionPanel(): void { /* no-op marker */ }
