import { Component, Input, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { driftDeltas, driftSeries, periodMeans } from '@memberjunction/rubrics';

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
        const now = new Date();
        const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const rows = driftSeries({
            scores: scoreRows.map(row => ({
                evaluationId: String(row.EvaluationID ?? ''),
                criterionId: String(row.CriterionID ?? ''),
                normalizedScore: Number(row.NormalizedScore),
            })),
            evaluations: evaluations.map(row => ({
                id: String(row.ID ?? ''),
                subjectRecordId: String(row.SubjectRecordID ?? ''),
                rubricId: String(row.RubricID ?? ''),
                at: String(row.SubmittedAt ?? row.__mj_CreatedAt ?? ''),
            })),
            runs: runs.map(row => ({ id: String(row.ID ?? ''), agentId: String(row.AgentID ?? '') })),
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
