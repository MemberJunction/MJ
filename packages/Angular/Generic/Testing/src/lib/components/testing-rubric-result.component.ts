import { Component, Input, OnChanges } from '@angular/core';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { RubricResultComponent } from '@memberjunction/ng-rubrics';
import { RubricEvaluationId, RubricRunView, StoredRubricView, type RubricRunView as RubricRun } from '../models/testing-rubrics';

/** Per-criterion breakdown for one test run. A stored evaluation is loaded by its id. */
@Component({
    standalone: true,
    selector: 'mj-testing-rubric-result',
    imports: [RubricResultComponent],
    template: `
      @if (LoadError) {
        <p role="alert">{{ LoadError }}</p>
      }
      @if (View) {
        <mj-rubric-result [Version]="View.version" [Result]="View.result" [Answers]="View.answers"></mj-rubric-result>
      }
    `,
})
export class TestingRubricResultComponent implements OnChanges {
    @Input() OracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null = null;
    @Input() Provider: IMetadataProvider | null = null;
    public Stored: RubricRun | null = null;
    public LoadError = '';

    public ngOnChanges(): void {
        void this.Load();
    }

    public get View(): RubricRun | null {
        if (RubricEvaluationId(this.OracleResults)) return this.Stored;
        return RubricRunView(this.OracleResults);
    }

    public async Load(): Promise<void> {
        const id = RubricEvaluationId(this.OracleResults);
        if (!id) {
            this.Stored = null;
            this.LoadError = '';
            return;
        }
        const provider = this.Provider;
        if (!provider) {
            this.LoadError = 'Could not load the stored evaluation.';
            return;
        }
        try {
            const quoted = EscapeSQLString(id);
            const evaluations = await rows(provider, 'MJ: Rubric Evaluations', `ID='${quoted}'`);
            const evaluation = evaluations[0];
            if (!evaluation) throw new Error('The stored evaluation was not found.');
            const scores = await rows(provider, 'MJ: Rubric Evaluation Scores', `EvaluationID='${quoted}'`);
            const criterionIds = scores.map(row => String(row.CriterionID ?? '')).filter(value => value.length > 0);
            const criteria = criterionIds.length === 0 ? [] : await rows(provider, 'MJ: Rubric Criteria', `ID IN (${criterionIds.map(value => `'${EscapeSQLString(value)}'`).join(', ')})`);
            const versionId = EscapeSQLString(String(evaluation.RubricVersionID ?? ''));
            const bands = versionId ? await rows(provider, 'MJ: Rubric Bands', `RubricVersionID='${versionId}'`) : [];
            this.Stored = StoredRubricView(evaluation, scores, criteria, bands);
            this.LoadError = '';
        } catch (error) {
            this.Stored = null;
            this.LoadError = error instanceof Error ? error.message : 'Could not load the stored evaluation.';
        }
    }
}

async function rows(provider: IMetadataProvider, entityName: string, filter: string): Promise<Record<string, unknown>[]> {
    const view = RunView.FromMetadataProvider(provider);
    const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, provider.CurrentUser);
    if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
    return (result.Results ?? []) as Record<string, unknown>[];
}
