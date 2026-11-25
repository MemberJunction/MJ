import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx, UUIDMap, UUIDSet } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { LogError, RunView, type IMetadataProvider, type RunViewResult } from '@memberjunction/core';
import { PredictionPanelQueries } from '@memberjunction/predictive-studio-core';
import { FeatureValuesPanelModel, type FeatureValueCard, type FeatureValueRow } from '../feature-values/feature-values.logic';
import {
    ModelPredictionLogic,
    type PanelBindingRow,
    type PanelOutputBindingRow,
    type PanelRunRow,
    type PanelValueRow,
    type PredictionCard,
} from './model-prediction.logic';

/** The lineage of the shown values: the scoring models' `record-panel` output bindings and the scoring runs. */
interface PanelLineage {
    OutputBindings: PanelOutputBindingRow[];
    Runs: PanelRunRow[];
}

/**
 * Model Prediction panel — an **entity-agnostic** form panel that shows the predictions stored as Feature Values on
 * the current record (§5.8.5).
 *
 * It registers against the `'*'` wildcard entity, so it mounts on every entity form, and shows: one card per `Active`
 * scoring binding of the record's entity whose view authorization the user holds and that has a value for the record
 * (the value, class and probability, drivers, a history sparkline and the lineage — model version, scoring run, as-of
 * date and the in-training flag); and a "Derived values" section listing the record's pipeline features. It renders
 * nothing when there is neither. The row-level security filter on `MJ: Feature Values` and `MJ: Latest Feature Values`
 * is the guarantee that a user without a binding's authorization reads none of its values; the panel's own check keeps
 * it from rendering a card the filter would leave empty.
 *
 * Self-mounts via the `after-fields` slot. Reusable as a plain component too (composition) by binding `[Record]` +
 * `[FormComponent]`.
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
    private readonly cdr = inject(ChangeDetectorRef);

    /** One card per authorized binding with a value for the record. */
    public Cards: PredictionCard[] = [];

    /** The record's pipeline features, latest value each. */
    public DerivedValues: FeatureValueCard[] = [];

    /** True once the reads have completed (success or not). */
    public Loaded = false;

    /** Why the last read failed, shown in place of the cards; null after a successful read. */
    public LoadError: string | null = null;

    /** Reads the record's predictions once the panel mounts. */
    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    /** Reloads after the host form refreshed its record. */
    public override OnRecordRefreshed(): void {
        void this.load();
    }

    /** True when there is a card, a derived value or a read failure to show — gates the whole template. */
    public get HasContent(): boolean {
        return this.Cards.length > 0 || this.DerivedValues.length > 0 || this.LoadError !== null;
    }

    /** A derived value's confidence as a percentage, or null. */
    public ConfidencePct(card: FeatureValueCard): string | null {
        return card.Confidence === null ? null : `${ModelPredictionLogic.GaugePct(card.Confidence)}%`;
    }

    /**
     * Reads the record's predictions: the panel batch (`PredictionPanelQueries.For`, the one G5.6 replays), then — only when an
     * authorized binding has a value — the lineage batch (`PredictionPanelQueries.Lineage`). A failed read
     * is logged and shown as an error state naming the reason, never as an empty panel.
     */
    private async load(): Promise<void> {
        const provider = this.FormComponent?.ProviderToUse;
        const entityId = this.Record?.EntityInfo?.ID;
        // The same encoding scoring and the pipelines write into RecordID: the bare value for a single key, F1|v1||F2|v2 for a composite one.
        const recordId = this.Record?.PrimaryKey?.ToCompactURLSegment() || '';
        if (!provider || !entityId || !recordId || !this.Record?.IsSaved) {
            this.finish([], []);
            return;
        }
        try {
            const results = await RunView.FromMetadataProvider(provider).RunViews(PredictionPanelQueries.For(entityId, recordId, []), provider.CurrentUser);
            // RunViews answers in request order: each result is typed by its PredictionPanelQueries.Index position.
            const { Bindings, Latest, History, Derived } = PredictionPanelQueries.Index;
            const bindingRes = ModelPredictionPanel.succeeded<PanelBindingRow>(results[Bindings], 'the scoring bindings');
            const latestRes = ModelPredictionPanel.succeeded<PanelValueRow>(results[Latest], 'the latest predictions');
            const historyRes = ModelPredictionPanel.succeeded<PanelValueRow>(results[History], 'the prediction history');
            const derivedRes = ModelPredictionPanel.succeeded<FeatureValueRow>(results[Derived], 'the derived values');
            const derived = FeatureValuesPanelModel.Latest(derivedRes.Results);
            const bindings = ModelPredictionLogic.AuthorizedBindings(bindingRes.Results, provider.CurrentUser, provider.Authorizations);
            const held = new UUIDSet(bindings.map((b) => b.ID));
            const isHeld = (v: PanelValueRow): boolean => v.MLModelScoringBindingID !== null && held.Has(v.MLModelScoringBindingID);
            const latest = latestRes.Results.filter(isHeld);
            const history = historyRes.Results.filter(isHeld);
            const lineage = await this.loadLineage(provider, latest);
            this.finish(this.buildCards(bindings, latest, history, lineage), derived);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            LogError(`[ModelPredictionPanel] Failed to load predictions: ${reason}`);
            this.finish([], [], `Could not load the predictions: ${reason}`);
        }
    }

    /** The scoring models' `record-panel` output bindings and the scoring runs of the shown values, in one batch. */
    private async loadLineage(provider: IMetadataProvider, latest: readonly PanelValueRow[]): Promise<PanelLineage> {
        const modelIds = ModelPredictionPanel.distinctIDs(latest.map((v) => v.MLModelID));
        const runIds = ModelPredictionPanel.distinctIDs(latest.map((v) => v.MLScoringRunID));
        if (modelIds.length === 0 && runIds.length === 0) return { OutputBindings: [], Runs: [] };
        const results = await RunView.FromMetadataProvider(provider).RunViews(PredictionPanelQueries.Lineage(modelIds, runIds), provider.CurrentUser);
        // RunViews answers in request order: each result is typed by its PredictionPanelQueries.LineageIndex position.
        const { OutputBindings, Runs } = PredictionPanelQueries.LineageIndex;
        const outputRes = ModelPredictionPanel.succeeded<PanelOutputBindingRow>(results[OutputBindings], 'the output bindings');
        const runRes = ModelPredictionPanel.succeeded<PanelRunRow>(results[Runs], 'the scoring runs');
        return { OutputBindings: outputRes.Results, Runs: runRes.Results };
    }

    /** One card per authorized binding that has a value for the record, in the bindings' order. */
    private buildCards(
        bindings: readonly PanelBindingRow[],
        latest: readonly PanelValueRow[],
        history: readonly PanelValueRow[],
        lineage: PanelLineage,
    ): PredictionCard[] {
        const latestByBinding = new UUIDMap<PanelValueRow>();
        for (const v of latest) if (v.MLModelScoringBindingID !== null) latestByBinding.Set(v.MLModelScoringBindingID, v);
        const outputByModel = new UUIDMap<PanelOutputBindingRow>();
        for (const o of lineage.OutputBindings) outputByModel.Set(o.ModelID, o);
        const runById = new UUIDMap<PanelRunRow>();
        for (const r of lineage.Runs) runById.Set(r.ID, r);
        const historyByBinding = new UUIDMap<PanelValueRow[]>();
        for (const h of history) {
            if (h.MLModelScoringBindingID === null) continue;
            const rows = historyByBinding.Get(h.MLModelScoringBindingID) || [];
            rows.push(h);
            historyByBinding.Set(h.MLModelScoringBindingID, rows);
        }
        const cards: PredictionCard[] = [];
        for (const b of bindings) {
            const value = latestByBinding.Get(b.ID) || null;
            const card = ModelPredictionLogic.BuildCard(
                b,
                value,
                historyByBinding.Get(b.ID) || [],
                value?.MLModelID ? outputByModel.Get(value.MLModelID) || null : null,
                value?.MLScoringRunID ? runById.Get(value.MLScoringRunID) || null : null,
            );
            if (card) cards.push(card);
        }
        return cards;
    }

    private finish(cards: PredictionCard[], derived: FeatureValueCard[], loadError: string | null = null): void {
        this.Cards = cards;
        this.DerivedValues = derived;
        this.LoadError = loadError;
        this.Loaded = true;
        this.cdr.markForCheck();
    }

    /** The distinct non-null IDs as stored (compared case-insensitively; the stored spelling is what a filter quotes). */
    private static distinctIDs(ids: readonly (string | null)[]): string[] {
        const byId = new UUIDMap<string>();
        for (const id of ids) if (id !== null && !byId.Has(id)) byId.Set(id, id);
        return [...byId.Values()];
    }

    /** `result` when it succeeded; throws naming `what` when it failed or is missing. */
    private static succeeded<T>(result: RunViewResult<T> | undefined, what: string): RunViewResult<T> {
        if (!result?.Success) throw new Error(`reading ${what} failed: ${result?.ErrorMessage || 'the view returned no result'}`);
        return result;
    }
}

/** Tree-shake guard — call this from the consuming module's loader. */
export function LoadModelPredictionPanel(): void { /* no-op marker */ }
