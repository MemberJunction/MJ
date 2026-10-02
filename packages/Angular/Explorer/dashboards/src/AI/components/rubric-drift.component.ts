import { Component, Input, OnInit } from '@angular/core';
import { RunQuery, type IRunQueryProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { MJEmptyStateComponent, MJPageBodyComponent, MJPageHeaderComponent, MJPageLayoutComponent, MJRefreshButtonComponent } from '@memberjunction/ng-ui-components';
import { DriftDeltas } from '@memberjunction/rubrics-base';
import { DriftPeriodRows } from './rubric-drift-series';

/** A criterion whose mean dropped past the threshold between the two periods. */
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
            <li role="alert"><strong>{{ row.key }}</strong><span>Drop {{ row.drop }}</span></li>
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
        return DriftDeltas(this.Current, this.Previous, this.Threshold).filter(row => row.alert);
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
          @if (LoadError) {
            <p role="alert">{{ LoadError }}</p>
          }
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
    public LoadError = '';

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
            this.LoadError = '';
        } catch (error) {
            this.Current = [];
            this.Previous = [];
            this.LoadError = error instanceof Error ? error.message : 'Could not load drift.';
        }
    }

    private async loadPeriods(): Promise<{ current: { key: string; mean: number }[]; previous: { key: string; mean: number }[] }> {
        if (!this.ProviderToUse) return { current: [], previous: [] };
        const now = new Date();
        const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const result = await new RunQuery(queryProvider(this.ProviderToUse)).RunQuery({
            QueryName: 'RubricDriftPeriodMeans',
            CategoryPath: '/MJ/AI/Agents/',
            Parameters: {
                previousStart: previousStart.toISOString(),
                currentStart: currentStart.toISOString(),
                periodEnd: now.toISOString(),
            },
        }, this.ProviderToUse.CurrentUser);
        if (!result.Success) throw new Error(result.ErrorMessage || 'Could not load drift.');
        return DriftPeriodRows((result.Results ?? []) as Parameters[]);
    }
}

function queryProvider(provider: object): IRunQueryProvider {
    const candidate = provider as {
        RunQuery?: unknown;
        RunQueries?: unknown;
        Config?: unknown;
        ExecuteQueryFromSpec?: unknown;
    };
    if (typeof candidate.RunQuery !== 'function' || typeof candidate.RunQueries !== 'function' || typeof candidate.Config !== 'function' || typeof candidate.ExecuteQueryFromSpec !== 'function') {
        throw new Error('Could not load drift.');
    }
    return candidate as IRunQueryProvider;
}

type Parameters = {
    AgentName?: unknown;
    RubricName?: unknown;
    CriterionKey?: unknown;
    CurrentMean?: unknown;
    PreviousMean?: unknown;
};
