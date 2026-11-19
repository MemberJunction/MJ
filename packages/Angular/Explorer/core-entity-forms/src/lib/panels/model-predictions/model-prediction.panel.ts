import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx, UUIDMap, UUIDSet } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { LogError, RunView, type IMetadataProvider, type RunViewResult } from '@memberjunction/core';
import { FeatureValuesPanelModel, type FeatureValueCard, type FeatureValueRow } from '../feature-values/feature-values.logic';
import {
    ModelPredictionLogic,
    type PanelBindingRow,
    type PanelOutputBindingRow,
    type PanelRunRow,
    type PanelValueRow,
    type PredictionCard,
} from './model-prediction.logic';

/** A row of the panel's first batch: a binding, a value or a pipeline value. */
type PanelRow = PanelBindingRow | PanelValueRow | FeatureValueRow;
/** A row of the panel's lineage batch. */
type LineageRow = PanelOutputBindingRow | PanelRunRow;

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
    private cdr = inject(ChangeDetectorRef);

    /** One card per authorized binding with a value for the record. */
    public Cards: PredictionCard[] = [];

    /** The record's pipeline features, latest value each. */
    public DerivedValues: FeatureValueCard[] = [];

    /** True once the reads have completed (success or not). */
    public Loaded = false;

    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    /** Reloads after the host form refreshed its record. */
    public override OnRecordRefreshed(): void {
        void this.load();
    }

    /** True when there is a card or a derived value to show — gates the whole template. */
    public get HasContent(): boolean {
        return this.Cards.length > 0 || this.DerivedValues.length > 0;
    }

    /** A derived value's confidence as a percentage, or null. */
    public ConfidencePct(card: FeatureValueCard): string | null {
        return card.Confidence === null ? null : `${ModelPredictionLogic.GaugePct(card.Confidence)}%`;
    }

    /**
     * Reads the record's predictions: the panel batch ({@link ModelPredictionLogic.PanelQueries}), then — only when an
     * authorized binding has a value — the lineage batch ({@link ModelPredictionLogic.LineageQueries}). A failed read
     * renders nothing and is logged.
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
            const [bindingRes, latestRes, historyRes, derivedRes] = await RunView.FromMetadataProvider(provider).RunViews<PanelRow>(
                ModelPredictionLogic.PanelQueries(entityId, recordId, []),
                provider.CurrentUser,
            );
            for (const r of [bindingRes, latestRes, historyRes, derivedRes]) {
                if (!r?.Success) throw new Error(r?.ErrorMessage || 'a panel read failed');
            }
            const derived = FeatureValuesPanelModel.Latest(derivedRes.Results.filter(ModelPredictionPanel.isDerivedRow));
            const bindings = ModelPredictionLogic.AuthorizedBindings(bindingRes.Results.filter(ModelPredictionPanel.isBindingRow), provider.CurrentUser, provider.Authorizations);
            const held = new UUIDSet(bindings.map((b) => b.ID));
            const isHeld = (v: PanelValueRow): boolean => v.MLModelScoringBindingID !== null && held.Has(v.MLModelScoringBindingID);
            const latest = latestRes.Results.filter(ModelPredictionPanel.isValueRow).filter(isHeld);
            const history = historyRes.Results.filter(ModelPredictionPanel.isValueRow).filter(isHeld);
            const lineage = await this.loadLineage(provider, latest);
            this.finish(this.buildCards(bindings, latest, history, lineage), derived);
        } catch (e) {
            LogError(`[ModelPredictionPanel] Failed to load predictions: ${e instanceof Error ? e.message : String(e)}`);
            this.finish([], []);
        }
    }

    /** The scoring models' `record-panel` output bindings and the scoring runs of the shown values, in one batch. */
    private async loadLineage(provider: IMetadataProvider, latest: readonly PanelValueRow[]): Promise<{ OutputBindings: PanelOutputBindingRow[]; Runs: PanelRunRow[] }> {
        const modelIds = ModelPredictionPanel.distinctIDs(latest.map((v) => v.MLModelID));
        const runIds = ModelPredictionPanel.distinctIDs(latest.map((v) => v.MLScoringRunID));
        const queries = ModelPredictionLogic.LineageQueries(modelIds, runIds);
        if (queries.length === 0) return { OutputBindings: [], Runs: [] };
        const results: RunViewResult<LineageRow>[] = await RunView.FromMetadataProvider(provider).RunViews<LineageRow>(queries, provider.CurrentUser);
        for (const r of results) {
            if (!r?.Success) throw new Error(r?.ErrorMessage || 'a lineage read failed');
        }
        const rows = results.flatMap((r) => r.Results);
        return { OutputBindings: rows.filter(ModelPredictionPanel.isOutputBindingRow), Runs: rows.filter(ModelPredictionPanel.isRunRow) };
    }

    /** One card per authorized binding that has a value for the record, in the bindings' order. */
    private buildCards(
        bindings: readonly PanelBindingRow[],
        latest: readonly PanelValueRow[],
        history: readonly PanelValueRow[],
        lineage: { OutputBindings: PanelOutputBindingRow[]; Runs: PanelRunRow[] },
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

    private finish(cards: PredictionCard[], derived: FeatureValueCard[]): void {
        this.Cards = cards;
        this.DerivedValues = derived;
        this.Loaded = true;
        this.cdr.markForCheck();
    }

    /** The distinct non-null IDs as stored (compared case-insensitively; the stored spelling is what a filter quotes). */
    private static distinctIDs(ids: readonly (string | null)[]): string[] {
        const byId = new UUIDMap<string>();
        for (const id of ids) if (id !== null && !byId.Has(id)) byId.Set(id, id);
        return [...byId.Values()];
    }

    private static isBindingRow(r: PanelRow): r is PanelBindingRow {
        return 'ViewAuthorizationID' in r;
    }

    private static isValueRow(r: PanelRow): r is PanelValueRow {
        return 'MLScoringRunID' in r;
    }

    private static isDerivedRow(r: PanelRow): r is FeatureValueRow {
        return 'Reasoning' in r;
    }

    private static isOutputBindingRow(r: LineageRow): r is PanelOutputBindingRow {
        return 'Surface' in r;
    }

    private static isRunRow(r: LineageRow): r is PanelRunRow {
        return 'ModelVersion' in r;
    }
}

/** Tree-shake guard — call this from the consuming module's loader. */
export function LoadModelPredictionPanel(): void { /* no-op marker */ }
