import { ChangeDetectorRef, Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity, MJMLTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EvaluationViews, type EvaluationRunInput, type EvaluationRunState } from '../evaluation-results/evaluation-view';
import { PSEvaluationResultsComponent } from '../evaluation-results/evaluation-results.component';
import type { ValueRead } from '../versioned-list/lineage-reads';

type RunFields = Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults' | 'ResultingModelID' | 'Status' | 'TrainingSnapshotID'>;
type SnapshotFields = Pick<MJMLTrainingSnapshotEntity, 'ID' | 'UncoveredHistoryRowsExcluded'>;
type ModelFields = Pick<MJMLModelEntity, 'ID' | 'Lineage'>;

/** What the results state is built from when there is no run. */
const NO_RUN: EvaluationRunInput = { ValidationResults: null, Lineage: null, RunStatus: null, UncoveredHistoryRows: null };

/**
 * L2 widget: loads a training run — the latest run of a model (`ModelID`) or a run by id (`TrainingRunID`) — with its
 * status, the resulting model's `Lineage` and its Training Snapshot's uncovered-history counts, and shows its protocol
 * results. The lineage is null only when the run produced no model; the counts only when the run has no snapshot.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-run-evaluation',
  imports: [CommonModule, SharedGenericModule, PSEvaluationResultsComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-run-evaluation-error">{{ Error }}</p> }
    @if (IsLoading) {
      <mj-loading Text="Loading results..." Size="small"></mj-loading>
    } @else {
      <mj-ps-evaluation-results [State]="State"></mj-ps-evaluation-results>
    }
  `,
})
export class PSRunEvaluationComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _modelId: string | null = null;
  private _trainingRunId: string | null = null;
  private isInitialized = false;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  /** A model: its most recent training run is shown. Ignored when `TrainingRunID` is set. */
  @Input()
  public get ModelID(): string | null { return this._modelId; }
  public set ModelID(value: string | null) {
    if (UUIDsEqual(value, this._modelId)) return;
    this._modelId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** A training run to show. */
  @Input()
  public get TrainingRunID(): string | null { return this._trainingRunId; }
  public set TrainingRunID(value: string | null) {
    if (UUIDsEqual(value, this._trainingRunId)) return;
    this._trainingRunId = value;
    if (this.isInitialized) void this.Load();
  }

  /** The results state of the loaded run; null before a read completes. */
  public State: EvaluationRunState | null = null;
  public IsLoading = false;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  /** Reads the run and the model lineage; a newer load supersedes it. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.State = null;
    this.Error = null;
    this.IsLoading = this._trainingRunId !== null || this._modelId !== null;
    this.cdr.detectChanges();
    const read = this._trainingRunId !== null ? await this.readByRun(this._trainingRunId)
      : this._modelId !== null ? await this.readByModel(this._modelId) : null;
    if (seq !== this.loadSeq) return;
    if (read !== null && read.Ok) this.State = EvaluationViews.DescribeRun(read.Value);
    if (read !== null && !read.Ok) this.Error = read.Error;
    this.IsLoading = false;
    this.cdr.detectChanges();
  }

  /** The model's latest run and the model's lineage: two independent reads in one batch. */
  private async readByModel(modelId: string): Promise<ValueRead<EvaluationRunInput>> {
    const id = EscapeSQLString(modelId);
    const [runs, models] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<RunFields | ModelFields>([
      { ...PSRunEvaluationComponent.runParams(`ResultingModelID='${id}'`), OrderBy: '__mj_CreatedAt DESC', MaxRows: 1 },
      PSRunEvaluationComponent.modelParams(id),
    ]);
    if (runs === undefined || models === undefined || !runs.Success || !models.Success) {
      return { Ok: false, Error: runs?.ErrorMessage || models?.ErrorMessage || 'The training run could not be read.' };
    }
    const run = runs.Results.find(PSRunEvaluationComponent.isRun);
    const model = models.Results.find(PSRunEvaluationComponent.isModel);
    if (run === undefined) return { Ok: true, Value: NO_RUN };
    return this.withSnapshot(run, model?.Lineage || null);
  }

  /** A run, then the model it produced (the run names it), if any. */
  private async readByRun(runId: string): Promise<ValueRead<EvaluationRunInput>> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const runs = await rv.RunView<RunFields>(PSRunEvaluationComponent.runParams(`ID='${EscapeSQLString(runId)}'`));
    if (!runs.Success) return { Ok: false, Error: runs.ErrorMessage };
    const run = runs.Results[0];
    if (run === undefined) return { Ok: true, Value: NO_RUN };
    if (!run.ResultingModelID) return this.withSnapshot(run, null);
    const models = await rv.RunView<ModelFields>(PSRunEvaluationComponent.modelParams(EscapeSQLString(run.ResultingModelID)));
    if (!models.Success) return { Ok: false, Error: models.ErrorMessage };
    return this.withSnapshot(run, models.Results[0]?.Lineage || null);
  }

  /** The run's results input with its Training Snapshot's uncovered-history counts (null when the run has no snapshot). */
  private async withSnapshot(run: RunFields, lineage: string | null): Promise<ValueRead<EvaluationRunInput>> {
    const input = { ValidationResults: run.ValidationResults, Lineage: lineage, RunStatus: run.Status };
    if (!run.TrainingSnapshotID) return { Ok: true, Value: { ...input, UncoveredHistoryRows: null } };
    const snapshots = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<SnapshotFields>({
      EntityName: 'MJ: ML Training Snapshots',
      ExtraFilter: `ID='${EscapeSQLString(run.TrainingSnapshotID)}'`,
      Fields: ['ID', 'UncoveredHistoryRowsExcluded'],
      ResultType: 'simple',
    });
    if (!snapshots.Success) return { Ok: false, Error: snapshots.ErrorMessage };
    const snapshot = snapshots.Results[0];
    if (snapshot === undefined) return { Ok: false, Error: `The run's Training Snapshot ${run.TrainingSnapshotID} was not found.` };
    return { Ok: true, Value: { ...input, UncoveredHistoryRows: snapshot.UncoveredHistoryRowsExcluded } };
  }

  private static runParams(filter: string): RunViewParams {
    return { EntityName: 'MJ: ML Training Runs', ExtraFilter: filter, Fields: ['ID', 'ValidationResults', 'ResultingModelID', 'Status', 'TrainingSnapshotID'], ResultType: 'simple' };
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
