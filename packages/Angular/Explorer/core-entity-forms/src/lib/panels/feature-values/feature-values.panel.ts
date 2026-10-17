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

    private rows: FeatureValueRow[] = [];

    public async ngOnInit(): Promise<void> {
        await this.Refresh();
    }

    /** Reload when the parent form reloads the record, so stale rows never show. */
    public override OnRecordRefreshed(): void {
        void this.Refresh();
    }

    /** Reload the feature values for the current record (one RunView). */
    public async Refresh(): Promise<void> {
        const entityId = this.Record?.EntityInfo?.ID ?? null;
        // Same encoding the pipeline writes into RecordID: bare value for a single key, F1|v1||F2|v2 for composite.
        const recordId = this.Record?.PrimaryKey?.ToCompactURLSegment() ?? '';
        if (!this.Record?.IsSaved || !entityId || !recordId) {
            this.rows = [];
            this.Cards = [];
            this.Loaded = true;
            this.cdr.markForCheck();
            return;
        }
        try {
            const result = await this.runView().RunView<FeatureValueRow>(
                {
                    EntityName: 'MJ: Feature Values',
                    Fields: ['ID', 'RecordProcessID', 'EntityID', 'RecordID', 'FeatureName', 'ValueText', 'ValueNumeric',
                        'ValueDate', 'ValueBoolean', 'ValueJSON', 'Reasoning', 'Confidence', 'ProcessRunID', 'ComputedAt',
                        'PipelineVersion', 'Source', 'RecordProcess'],
                    ExtraFilter: `EntityID='${EscapeSQLString(entityId)}' AND RecordID='${EscapeSQLString(recordId)}'`,
                    OrderBy: 'ComputedAt DESC',
                    MaxRows: 500,
                    ResultType: 'simple',
                },
                this.contextUser(),
            );
            if (!result.Success) {
                LogError(`[FeatureValuesPanel] Failed to load feature values: ${result.ErrorMessage}`);
                this.rows = [];
            } else {
                this.rows = result.Results ?? [];
            }
            this.Cards = FeatureValuesPanelModel.Latest(this.rows);
        } catch (e) {
            LogError(`[FeatureValuesPanel] ${e instanceof Error ? e.message : String(e)}`);
            this.rows = [];
            this.Cards = [];
        } finally {
            this.Loaded = true;
            this.cdr.markForCheck();
        }
    }

    /** Expand/collapse a card's reasoning + history. */
    public Toggle(card: FeatureValueCard): void {
        this.ExpandedKey = this.ExpandedKey === card.Key ? null : card.Key;
    }

    /** Older values of the card's feature, newest first. */
    public HistoryFor(card: FeatureValueCard): FeatureValueRow[] {
        return FeatureValuesPanelModel.History(this.rows, card);
    }

    /** Display string for a history row. */
    public ValueOf(row: FeatureValueRow): string {
        return FeatureValuesPanelModel.DisplayValue(row);
    }

    private runView(): RunView {
        const provider = this.FormComponent?.ProviderToUse;
        return provider ? RunView.FromMetadataProvider(provider) : new RunView();
    }

    private contextUser(): UserInfo | undefined {
        return this.FormComponent?.ProviderToUse?.CurrentUser ?? new Metadata().CurrentUser;
    }
}

/** Tree-shake guard — call this from the consuming module's loader. */
export function LoadFeatureValuesPanel(): void { /* no-op marker */ }
