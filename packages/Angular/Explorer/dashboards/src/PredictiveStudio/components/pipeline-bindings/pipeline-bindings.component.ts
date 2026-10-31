import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { LineageReads, type BoundVersionRead, type BoundVersionRequest } from '../versioned-list/lineage-reads';

/** A version a pipeline is bound to, and the latest version of its lineage. */
export interface BoundVersion {
  readonly ID: string;
  readonly Name: string;
  readonly Version: number;
  readonly LatestID: string;
  readonly LatestVersion: number;
}

/** Which binding "use the latest version" moves. */
export type BindingKind = 'unit' | 'protocol';

type PipelineBindingFields = Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID' | 'EvaluationProtocolID'>;

/**
 * L2 widget: which Prediction Unit version and Evaluation Protocol version a pipeline trains under, with "use the
 * latest version" for each. Saving goes through the pipeline entity, whose validation refuses a unit/protocol pair
 * that disagree. Emits `BindingChanged`; never navigates.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-pipeline-bindings',
  imports: [CommonModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-bindings-error">{{ Error }}</p> }
    <dl class="ps-summary" data-testid="ps-pipeline-bindings">
      <dt>Prediction Unit</dt>
      <dd data-testid="ps-binding-unit">
        @if (Unit; as u) {
          {{ u.Name }} v{{ u.Version }}
          @if (u.Version < u.LatestVersion) { <button mjButton variant="outline" size="sm" type="button" data-testid="ps-bind-latest-unit" (click)="UseLatest('unit')">Use v{{ u.LatestVersion }}</button> }
        } @else { <span class="ps-muted">none — this pipeline cannot be trained</span> }
      </dd>
      <dt>Evaluation Protocol</dt>
      <dd data-testid="ps-binding-protocol">
        @if (Protocol; as p) {
          {{ p.Name }} v{{ p.Version }}
          @if (p.Version < p.LatestVersion) { <button mjButton variant="outline" size="sm" type="button" data-testid="ps-bind-latest-protocol" (click)="UseLatest('protocol')">Use v{{ p.LatestVersion }}</button> }
        } @else { <span class="ps-muted">none — this pipeline cannot be trained</span> }
      </dd>
    </dl>
  `,
})
export class PSPipelineBindingsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _pipelineId: string | null = null;
  private isInitialized = false;

  @Input()
  public get PipelineID(): string | null { return this._pipelineId; }
  public set PipelineID(value: string | null) {
    if (value === this._pipelineId) return;
    this._pipelineId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** The pipeline whose binding was just saved. */
  @Output() BindingChanged = new EventEmitter<string>();

  public Unit: BoundVersion | null = null;
  public Protocol: BoundVersion | null = null;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  /** Reads the pipeline's bindings, then both bound versions and their lineages' latest versions in one batch. */
  public async Load(): Promise<void> {
    this.Error = null;
    const pipeline = await this.readBindings();
    if (pipeline !== null) await this.loadBound(pipeline);
    this.cdr.detectChanges();
  }

  /** Binds the pipeline to the latest version of the unit or the protocol lineage and saves it. */
  public async UseLatest(which: BindingKind): Promise<void> {
    const target = which === 'unit' ? this.Unit : this.Protocol;
    const pipeline = target === null ? null : await this.loadPipelineEntity();
    if (target === null || pipeline === null) {
      this.cdr.detectChanges();
      return;
    }
    if (which === 'unit') pipeline.PredictionUnitID = target.LatestID;
    else pipeline.EvaluationProtocolID = target.LatestID;
    if (!(await pipeline.Save())) {
      this.Error = pipeline.LatestResult?.CompleteMessage || 'The pipeline could not be saved.';
      this.cdr.detectChanges();
      return;
    }
    this.BindingChanged.emit(pipeline.ID);
    await this.Load();
  }

  private async loadBound(pipeline: PipelineBindingFields): Promise<void> {
    const requests: BoundVersionRequest[] = [];
    if (pipeline.PredictionUnitID) requests.push({ EntityName: 'MJ: Prediction Units', ID: pipeline.PredictionUnitID });
    if (pipeline.EvaluationProtocolID) requests.push({ EntityName: 'MJ: Evaluation Protocols', ID: pipeline.EvaluationProtocolID });
    const read = await LineageReads.ReadBoundVersions(this.ProviderToUse, requests);
    if (!read.Ok) {
      this.Error = read.Error;
      return;
    }
    const of = (entity: BoundVersionRequest['EntityName']): BoundVersion | null => {
      const i = requests.findIndex((r) => r.EntityName === entity);
      return i < 0 ? null : PSPipelineBindingsComponent.boundVersion(read.Rows[i] || null);
    };
    this.Unit = of('MJ: Prediction Units');
    this.Protocol = of('MJ: Evaluation Protocols');
  }

  /** The pipeline's two binding columns (a read for display: simple, three fields). */
  private async readBindings(): Promise<PipelineBindingFields | null> {
    if (this._pipelineId === null) return null;
    const r = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<PipelineBindingFields>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(this._pipelineId)}'`,
      Fields: ['ID', 'PredictionUnitID', 'EvaluationProtocolID'], ResultType: 'simple',
    });
    return this.firstOrError(r.Success, r.Results, r.ErrorMessage);
  }

  /** The pipeline as an entity object, for the binding save. */
  private async loadPipelineEntity(): Promise<MJMLTrainingPipelineEntity | null> {
    if (this._pipelineId === null) return null;
    const r = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJMLTrainingPipelineEntity>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(this._pipelineId)}'`, ResultType: 'entity_object',
    });
    return this.firstOrError(r.Success, r.Results, r.ErrorMessage);
  }

  private firstOrError<T>(success: boolean, results: readonly T[], errorMessage: string): T | null {
    const row = success ? results[0] : undefined;
    if (row === undefined) this.Error = success ? `Pipeline ${this._pipelineId} was not found.` : errorMessage;
    return row === undefined ? null : row;
  }

  private static boundVersion(read: BoundVersionRead | null): BoundVersion | null {
    if (read === null) return null;
    return { ID: read.Bound.ID, Name: read.Bound.Name, Version: read.Bound.Version, LatestID: read.Latest.ID, LatestVersion: read.Latest.Version };
  }
}
