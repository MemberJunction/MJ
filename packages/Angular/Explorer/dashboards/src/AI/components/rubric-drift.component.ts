import { Component, Input, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { driftDeltas, periodMeans } from '@memberjunction/rubrics';

/** Rolling mean against the previous period. Alerting is not part of this view. */
@Component({
    standalone: true,
    selector: 'mj-rubric-drift',
    template: `
      <h2>Rubric drift</h2>
      @for (row of Rows; track row.key) {
        <p>{{ row.key }} drop {{ row.drop }}{{ row.alert ? ' alert' : '' }}</p>
      }
    `,
})
export class RubricDriftComponent {
    @Input() current: { key: string; mean: number }[] = [];
    @Input() previous: { key: string; mean: number }[] = [];
    @Input() threshold = 0.2;
    public get Rows() {
        return driftDeltas(this.current, this.previous, this.threshold);
    }
}

@RegisterClass(BaseResourceComponent, 'RubricDriftResource')
@Component({
    standalone: true,
    selector: 'app-rubric-drift-resource',
    imports: [RubricDriftComponent],
    template: `<mj-rubric-drift [current]="current" [previous]="previous" [threshold]="threshold"></mj-rubric-drift>`,
})
export class RubricDriftResourceComponent extends BaseResourceComponent implements OnInit {
    public current: { key: string; mean: number }[] = [];
    public previous: { key: string; mean: number }[] = [];
    public threshold = 0.2;

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        try {
            const loaded = await this.loadPeriods();
            this.current = loaded.current;
            this.previous = loaded.previous;
        } catch {
            this.current = [];
            this.previous = [];
        } finally {
            this.NotifyLoadComplete();
        }
    }

    private async loadPeriods(): Promise<{ current: { key: string; mean: number }[]; previous: { key: string; mean: number }[] }> {
        if (!this.ProviderToUse) return { current: [], previous: [] };
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const scores = await view.RunView({
            EntityName: 'MJ: Rubric Evaluation Scores',
            ExtraFilter: 'NormalizedScore IS NOT NULL',
            ResultType: 'simple',
            MaxRows: 1000,
        }, this.ProviderToUse.CurrentUser);
        const now = new Date();
        const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const rows = ((scores.Results ?? []) as Record<string, unknown>[]).map(row => ({
            key: `${row.AgentID ?? ''}|${row.RubricID ?? ''}|${row.CriterionID ?? ''}`,
            score: Number(row.NormalizedScore),
            at: String(row.__mj_CreatedAt ?? ''),
        })).filter(row => row.key !== '||' && Number.isFinite(row.score));
        return {
            current: periodMeans(rows, currentStart, now.toISOString()),
            previous: periodMeans(rows, previousStart, currentStart),
        };
    }
}
