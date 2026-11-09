import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { EscapeSQLString, RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { FeatureValueCard, FeatureValueRow, FeatureValuesPanelModel } from './feature-values.logic';

/**
 * Entity-agnostic, read-only Feature Values panel. Shows the latest value of every
 * feature that any pipeline has materialized for the current record, with an
 * expander for reasoning and value history. Renders nothing when there are no rows.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'feature-values:feature-values',
    skipNullKeyWarning: true,
    metadata: {
        entity: '*',
        slot: 'after-fields',
        sortKey: 41,
    },
})
@Component({
    standalone: false,
    selector: 'mj-feature-values-panel',
    templateUrl: './feature-values.panel.html',
    styleUrls: ['./feature-values.panel.css'],
})
export class FeatureValuesPanel extends BaseFormPanel implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** Latest card per pipeline+feature. */
    public Cards: FeatureValueCard[] = [];
    /** True once the load has completed (success, empty or skipped). */
    public Loaded = false;
    /** Key of the card whose detail/history is expanded. */
    public ExpandedKey: string | null = null;
    /** The expanded card's older values, newest first; computed when the card is toggled or the rows reload, not per binding. */
    public ExpandedHistory: FeatureValueRow[] = [];

    private rows: FeatureValueRow[] = [];
    /** Sequence number of the latest load; an older load's answer is dropped. */
    private loadSequence = 0;

    public async ngOnInit(): Promise<void> {
        await this.Refresh();
    }

    /** Reload when the parent form reloads the record, so stale rows never show. */
    public override OnRecordRefreshed(): void {
        void this.Refresh();
    }

    /** Reload the feature values for the current record (one RunView); a load overtaken by a later one is dropped. */
    public async Refresh(): Promise<void> {
        const sequence = ++this.loadSequence;
        const entityID = this.Record?.EntityInfo?.ID ?? null;
        // Same encoding the pipeline writes into RecordID: bare value for a single key, F1|v1||F2|v2 for composite.
        const recordID = this.Record?.PrimaryKey?.ToCompactURLSegment() ?? '';
        if (!this.Record?.IsSaved || !entityID || !recordID) {
            this.rows = [];
            this.Cards = [];
            this.syncExpandedHistory();
            this.Loaded = true;
            this.cdr.markForCheck();
            return;
        }
        this.Loaded = false;
        try {
            const result = await this.runView().RunView<FeatureValueRow>(
                {
                    EntityName: 'MJ: Feature Values',
                    Fields: ['ID', 'RecordProcessID', 'EntityID', 'RecordID', 'FeatureName', 'ValueText', 'ValueNumeric',
                        'ValueDate', 'ValueBoolean', 'ValueJSON', 'Reasoning', 'Confidence', 'ProcessRunID', 'ComputedAt',
                        'PipelineVersion', 'Source', 'RecordProcess'],
                    ExtraFilter: `EntityID='${EscapeSQLString(entityID)}' AND RecordID='${EscapeSQLString(recordID)}'`,
                    OrderBy: 'ComputedAt DESC',
                    MaxRows: 500,
                    ResultType: 'simple',
                },
                this.contextUser(),
            );
            if (sequence !== this.loadSequence) {
                return;
            }
            if (!result.Success) {
                LogError(`[FeatureValuesPanel] Failed to load feature values: ${result.ErrorMessage}`);
                this.rows = [];
            } else {
                this.rows = result.Results ?? [];
            }
            this.Cards = FeatureValuesPanelModel.Latest(this.rows);
        } catch (e) {
            if (sequence !== this.loadSequence) {
                return;
            }
            LogError(`[FeatureValuesPanel] ${e instanceof Error ? e.message : String(e)}`);
            this.rows = [];
            this.Cards = [];
        }
        this.syncExpandedHistory();
        this.Loaded = true;
        this.cdr.markForCheck();
    }

    /** Expand/collapse a card's reasoning + history. */
    public Toggle(card: FeatureValueCard): void {
        this.ExpandedKey = this.ExpandedKey === card.Key ? null : card.Key;
        this.syncExpandedHistory();
    }

    /** Recomputes the expanded card's history from the current rows; collapses when that card is no longer shown. */
    private syncExpandedHistory(): void {
        const card = this.Cards.find((c) => c.Key === this.ExpandedKey);
        this.ExpandedKey = card ? card.Key : null;
        this.ExpandedHistory = card ? FeatureValuesPanelModel.History(this.rows, card) : [];
    }

    /** Display string for a history row ("no value" for a valueless one). */
    public ValueOf(row: FeatureValueRow): string {
        return FeatureValuesPanelModel.HistoryValue(row);
    }

    private runView(): RunView {
        const provider = this.FormComponent?.ProviderToUse;
        return provider ? RunView.FromMetadataProvider(provider) : new RunView();
    }

    private contextUser(): UserInfo | undefined {
        return this.FormComponent?.ProviderToUse?.CurrentUser ?? new Metadata().CurrentUser;
    }
}
