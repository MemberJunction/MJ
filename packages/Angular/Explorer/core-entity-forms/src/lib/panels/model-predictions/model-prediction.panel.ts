import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { MJMLModelEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import {
    PredictionBand,
    PredictionDriver,
    bandFor,
    formatLastScored,
    formatValue,
    gaugePct,
    parseDrivers,
    resolveLabel,
    toNumber,
    valueKind,
} from './model-prediction.logic';

/**
 * A fully-resolved, entity-agnostic prediction card view-model. One per active
 * scoring binding on the current record's entity.
 */
export interface PredictionCard {
    /** Binding ID — used as the @for track key. */
    bindingId: string;
    /** Human label for the prediction (model target → bound column → fallback). */
    label: string;
    /** True when the model is a 0–1 probability we can render as a gauge. */
    isProbability: boolean;
    /** True for regression models showing a raw numeric value. */
    isNumeric: boolean;
    /** True for classification models showing a class label. */
    isClass: boolean;
    /** Pre-formatted primary value string ("72%", "1,240.5", "Renewing", "—"). */
    displayValue: string;
    /** 0–100 fill for the probability gauge (only meaningful when isProbability). */
    gaugePct: number;
    /** Neutral band for the gauge segment styling (only meaningful when isProbability). */
    band: PredictionBand | null;
    /** Top feature-importance drivers, or empty when unavailable. */
    drivers: PredictionDriver[];
    /** Provenance: "Pipeline Name v3". */
    provenance: string;
    /** "Last scored" timestamp string, or null when unavailable. */
    lastScored: string | null;
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
    /** The resolved cards to render. Empty → panel renders nothing. */
    public Cards: PredictionCard[] = [];
    /** True once the binding lookup has completed (success or empty). */
    public Loaded = false;
    /** Entity-ID we last loaded cards for, to avoid redundant lookups. */
    private loadedForEntityId: string | null = null;

    public async ngOnInit(): Promise<void> {
        await this.loadCards();
    }

    /** True when there is at least one card to show — gates the whole template. */
    public get HasPredictions(): boolean {
        return this.Cards.length > 0;
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
                this.Loaded = true;
                return;
            }
            const models = await this.loadModelsForBindings(bindings);
            this.Cards = this.buildCards(bindings, models);
        } catch (e) {
            LogError(`[ModelPredictionPanel] Failed to load predictions: ${e instanceof Error ? e.message : String(e)}`);
            this.Cards = [];
        } finally {
            this.Loaded = true;
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
        const numeric = toNumber(rawValue);
        const kind = valueKind(model.ProblemType, numeric);

        return {
            bindingId: binding.ID,
            label: resolveLabel(model.TargetVariable, binding.TargetColumn),
            isProbability: kind === 'probability',
            isNumeric: kind === 'numeric',
            isClass: kind === 'class',
            displayValue: formatValue(rawValue, numeric, kind),
            gaugePct: kind === 'probability' && numeric != null ? gaugePct(numeric) : 0,
            band: kind === 'probability' && numeric != null ? bandFor(numeric) : null,
            drivers: parseDrivers(model.FeatureImportance),
            provenance: `${model.Pipeline} v${model.Version}`,
            lastScored: formatLastScored(binding.LastScoredAt),
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
