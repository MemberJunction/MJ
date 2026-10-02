import { Component, Input, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { MJEmptyStateComponent, MJPageBodyComponent, MJPageHeaderComponent, MJPageLayoutComponent, MJRefreshButtonComponent } from '@memberjunction/ng-ui-components';
import { driftDeltas, driftSeries, periodMeans } from '@memberjunction/rubrics-base';
import { DriftSeriesInput } from './rubric-drift-series';

/** Rolling mean against the previous period. This is not an alert product. */
@Component({
    standalone: true,
    selector: 'mj-rubric-drift',
    imports: [MJEmptyStateComponent],
    styles: [`
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mj-space-3, 0.75rem); }
      li { display: flex; flex-direction: column; gap: 0.25rem; border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md, 6px); padding: var(--mj-space-3, 0.75rem); color: var(--mj-text-primary); }
    `],
    template: `
      @if (current.length === 0 || previous.length === 0) {
        <mj-empty-state Icon="fa-solid fa-chart-line" Title="No scores in this period" Message="Drift compares the last 30 days with the 30 days before that. One of those periods has no scores."></mj-empty-state>
      } @else if (Rows.length === 0) {
        <mj-empty-state Icon="fa-solid fa-chart-line" Title="No movement" Message="The period means did not drop past the threshold."></mj-empty-state>
      } @else {
        <ul>
          @for (row of Rows; track row.key) {
            <li><strong>{{ row.key }}</strong><span>Drop {{ row.drop }}</span></li>
          }
        </ul>
      }
    `,
})
export class RubricDriftComponent {
    @Input() Current: { key: string; mean: number }[] = [];

    /** @deprecated Use {@link Current}. */
    @Input() set current(value: { key: string; mean: number }[]) {
        this.Current = value;
    }
    /** @deprecated Use {@link Current}. */
    get current(): { key: string; mean: number }[] {
        return this.Current;
    }
    @Input() Previous: { key: string; mean: number }[] = [];

    /** @deprecated Use {@link Previous}. */
    @Input() set previous(value: { key: string; mean: number }[]) {
        this.Previous = value;
    }
    /** @deprecated Use {@link Previous}. */
    get previous(): { key: string; mean: number }[] {
        return this.Previous;
    }
    @Input() Threshold = 0.2;

    /** @deprecated Use {@link Threshold}. */
    @Input() set threshold(value: RubricDriftComponent['Threshold']) {
        this.Threshold = value;
    }
    /** @deprecated Use {@link Threshold}. */
    get threshold(): RubricDriftComponent['Threshold'] {
        return this.Threshold;
    }
    public get Rows() {
        return driftDeltas(this.Current, this.Previous, this.Threshold);
    }
}

@RegisterClass(BaseResourceComponent, 'RubricDriftResource')
@Component({
    standalone: true,
    selector: 'app-rubric-drift-resource',
    imports: [RubricDriftComponent, MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJRefreshButtonComponent],
    template: `
      <mj-page-layout>
        <mj-page-header Title="Drift" Icon="fa-solid fa-chart-line" Subtitle="How criterion means moved between the last two 30-day periods.">
          <div actions>
            <mj-refresh-button (Clicked)="Reload()"></mj-refresh-button>
          </div>
        </mj-page-header>
        <mj-page-body>
          <mj-rubric-drift [current]="current" [previous]="previous" [threshold]="threshold"></mj-rubric-drift>
        </mj-page-body>
      </mj-page-layout>
    `,
})
export class RubricDriftResourceComponent extends BaseResourceComponent implements OnInit {
    public override async GetResourceDisplayName(): Promise<string> {
        return 'Drift';
    }

    public override async GetResourceIconClass(): Promise<string> {
        return 'fa-solid fa-chart-line';
    }

    public Current: { key: string; mean: number }[] = [];

    /** @deprecated Use {@link Current}. */
    public get current(): { key: string; mean: number }[] {
        return this.Current;
    }
    /** @deprecated Use {@link Current}. */
    public set current(value: { key: string; mean: number }[]) {
        this.Current = value;
    }
    public Previous: { key: string; mean: number }[] = [];

    /** @deprecated Use {@link Previous}. */
    public get previous(): { key: string; mean: number }[] {
        return this.Previous;
    }
    /** @deprecated Use {@link Previous}. */
    public set previous(value: { key: string; mean: number }[]) {
        this.Previous = value;
    }
    public Threshold = 0.2;

    /** @deprecated Use {@link Threshold}. */
    public get threshold() {
        return this.Threshold;
    }
    /** @deprecated Use {@link Threshold}. */
    public set threshold(value) {
        this.Threshold = value;
    }

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        await this.Reload();
        this.NotifyLoadComplete();
    }

    public async Reload(): Promise<void> {
        try {
            const loaded = await this.loadPeriods();
            this.Current = loaded.current;
            this.Previous = loaded.previous;
        } catch {
            this.Current = [];
            this.Previous = [];
        }
    }

    private async loadPeriods(): Promise<{ current: { key: string; mean: number }[]; previous: { key: string; mean: number }[] }> {
        if (!this.ProviderToUse) return { current: [], previous: [] };
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const user = this.ProviderToUse.CurrentUser;
        const scores = await view.RunView({
            EntityName: 'MJ: Rubric Evaluation Scores',
            ExtraFilter: 'NormalizedScore IS NOT NULL',
            ResultType: 'simple',
            MaxRows: 1000,
        }, user);
        if (!scores.Success) throw new Error(scores.ErrorMessage || 'Could not read rubric scores.');
        const scoreRows = (scores.Results ?? []) as Record<string, unknown>[];
        const evaluationIds = uniqueIds(scoreRows.map(row => row.EvaluationID));
        const evaluations = await this.readByIds(view, user, 'MJ: Rubric Evaluations', evaluationIds);
        const runIds = uniqueIds(evaluations.map(row => row.SubjectRecordID));
        const runs = await this.readByIds(view, user, 'MJ: AI Agent Runs', runIds);
        const versionIds = uniqueIds(evaluations.map(row => row.RubricVersionID));
        const versions = await this.readByIds(view, user, 'MJ: Rubric Versions', versionIds);
        const criterionIds = uniqueIds(scoreRows.map(row => row.CriterionID));
        const criteria = await this.readByIds(view, user, 'MJ: Rubric Criteria', criterionIds);
        const series = DriftSeriesInput(scoreRows, criteria);
        const now = new Date();
        const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const rows = driftSeries({
            scores: series.scores,
            criteria: series.criteria,
            evaluations: evaluations.map(row => ({
                id: String(row.ID ?? ''),
                subjectRecordId: String(row.SubjectRecordID ?? ''),
                rubricVersionId: String(row.RubricVersionID ?? ''),
                at: String(row.SubmittedAt ?? row.__mj_CreatedAt ?? ''),
            })),
            runs: runs.map(row => ({ id: String(row.ID ?? ''), agentId: String(row.AgentID ?? '') })),
            versions: versions.map(row => ({ id: String(row.ID ?? ''), rubricId: String(row.RubricID ?? '') })),
        });
        return {
            current: periodMeans(rows, currentStart, now.toISOString()),
            previous: periodMeans(rows, previousStart, currentStart),
        };
    }

    private async readByIds(view: RunView, user: unknown, entityName: string, ids: string[]): Promise<Record<string, unknown>[]> {
        if (ids.length === 0) return [];
        const result = await view.RunView({
            EntityName: entityName,
            ExtraFilter: `ID IN (${ids.map(id => `'${id}'`).join(',')})`,
            ResultType: 'simple',
            MaxRows: ids.length,
        }, user as never);
        if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}

function uniqueIds(values: unknown[]): string[] {
    return [...new Set(values.map(value => String(value ?? '')).filter(value => /^[0-9A-Fa-f-]{36}$/.test(value)))];
}
