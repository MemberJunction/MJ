import { ChangeDetectorRef, Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EvaluationViews, type EvaluationView } from '../evaluation-results/evaluation-view';
import { PSEvaluationResultsComponent } from '../evaluation-results/evaluation-results.component';

type RunFields = Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults' | 'ResultingModelID'>;
type ModelFields = Pick<MJMLModelEntity, 'ID' | 'Lineage'>;

/** The stored results and the model lineage the results view is built from. */
interface RunAndLineage {
  readonly ValidationResults: string | null;
  readonly Lineage: string | null;
}

/**
 * L2 widget: loads a training run — the latest run of a model (`ModelID`) or a run by id (`TrainingRunID`) — with the
 * resulting model's `Lineage`, and shows its protocol results. The lineage is null only when the run produced no model.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-run-evaluation',
  imports: [CommonModule, PSEvaluationResultsComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-run-evaluation-error">{{ Error }}</p> }
    <mj-ps-evaluation-results [View]="View"></mj-ps-evaluation-results>
  `,
})
export class PSRunEvaluationComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _modelId: string | null = null;
  private _trainingRunId: string | null = null;
  private isInitialized = false;

  /** A model: its most recent training run is shown. Ignored when `TrainingRunID` is set. */
  @Input()
  public get ModelID(): string | null { return this._modelId; }
  public set ModelID(value: string | null) {
    if (value === this._modelId) return;
    this._modelId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** A training run to show. */
  @Input()
  public get TrainingRunID(): string | null { return this._trainingRunId; }
  public set TrainingRunID(value: string | null) {
    if (value === this._trainingRunId) return;
    this._trainingRunId = value;
    if (this.isInitialized) void this.Load();
  }

  public View: EvaluationView | null = null;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  public async Load(): Promise<void> {
    this.Error = null;
    const read = this._trainingRunId !== null ? await this.readByRun(this._trainingRunId)
      : this._modelId !== null ? await this.readByModel(this._modelId) : null;
    this.View = read === null ? null : EvaluationViews.BuildEvaluationView(read);
    this.cdr.detectChanges();
  }

  /** The model's latest run and the model's lineage: two independent reads in one batch. */
  private async readByModel(modelId: string): Promise<RunAndLineage | null> {
    const id = EscapeSQLString(modelId);
    const [runs, models] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<RunFields | ModelFields>([
      { ...PSRunEvaluationComponent.runParams(`ResultingModelID='${id}'`), OrderBy: '__mj_CreatedAt DESC', MaxRows: 1 },
      PSRunEvaluationComponent.modelParams(id),
    ]);
    if (runs === undefined || models === undefined || !runs.Success || !models.Success) {
      this.Error = runs?.ErrorMessage || models?.ErrorMessage || 'The training run could not be read.';
      return null;
    }
    const run = runs.Results.find(PSRunEvaluationComponent.isRun);
    const model = models.Results.find(PSRunEvaluationComponent.isModel);
    return { ValidationResults: run?.ValidationResults || null, Lineage: model?.Lineage || null };
  }

  /** A run, then the model it produced (the run names it), if any. */
  private async readByRun(runId: string): Promise<RunAndLineage | null> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const runs = await rv.RunView<RunFields>(PSRunEvaluationComponent.runParams(`ID='${EscapeSQLString(runId)}'`));
    if (!runs.Success) {
      this.Error = runs.ErrorMessage;
      return null;
    }
    const run = runs.Results[0];
    if (run === undefined) return { ValidationResults: null, Lineage: null };
    if (!run.ResultingModelID) return { ValidationResults: run.ValidationResults, Lineage: null };
    const models = await rv.RunView<ModelFields>(PSRunEvaluationComponent.modelParams(EscapeSQLString(run.ResultingModelID)));
    if (!models.Success) {
      this.Error = models.ErrorMessage;
      return null;
    }
    return { ValidationResults: run.ValidationResults, Lineage: models.Results[0]?.Lineage || null };
  }

  private static runParams(filter: string): RunViewParams {
    return { EntityName: 'MJ: ML Training Runs', ExtraFilter: filter, Fields: ['ID', 'ValidationResults', 'ResultingModelID'], ResultType: 'simple' };
  }

  private static modelParams(escapedModelId: string): RunViewParams {
    return { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${escapedModelId}'`, Fields: ['ID', 'Lineage'], ResultType: 'simple' };
  }

  private static isRun(row: RunFields | ModelFields): row is RunFields {
    return 'ValidationResults' in row;
  }

  private static isModel(row: RunFields | ModelFields): row is ModelFields {
    return 'Lineage' in row;
  }
}
