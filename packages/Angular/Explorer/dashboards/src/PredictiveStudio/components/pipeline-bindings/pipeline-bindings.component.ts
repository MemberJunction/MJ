import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView, type RunViewResult } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { AfterBindingChangedEventArgs, BeforeBindingChangedEventArgs, type BindingKind } from '../ps-widget-events';
import { LineageReads, type BoundVersionRead, type BoundVersionRequest } from '../versioned-list/lineage-reads';

/** A version a pipeline is bound to, and the latest version of its lineage. */
export interface BoundVersion {
  readonly ID: string;
  readonly Name: string;
  readonly Version: number;
  readonly LatestID: string;
  readonly LatestVersion: number;
}

/** The two bindings as the widget shows them. */
interface Bindings {
  readonly Unit: BoundVersion | null;
  readonly Protocol: BoundVersion | null;
}

/** A read that may fail: the value, or the error to show. */
type Read<T> = { readonly Ok: true; readonly Value: T } | { readonly Ok: false; readonly Error: string };

type PipelineBindingFields = Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID' | 'EvaluationProtocolID'>;

/**
 * L2 widget: which Prediction Unit version and Evaluation Protocol version a pipeline trains under, with "use the
 * latest version" for each. Saving goes through the pipeline entity, whose validation refuses a unit/protocol pair
 * that disagree, after a cancelable `BeforeBindingChanged`; `AfterBindingChanged` reports the outcome. Never navigates.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-pipeline-bindings',
  imports: [CommonModule, SharedGenericModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-bindings-error">{{ Error }}</p> }
    @if (IsLoading) {
      <mj-loading Text="Loading bindings..." Size="small"></mj-loading>
    } @else if (HasLoaded) {
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
    }
  `,
})
export class PSPipelineBindingsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _pipelineId: string | null = null;
  private isInitialized = false;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  @Input()
  public get PipelineID(): string | null { return this._pipelineId; }
  public set PipelineID(value: string | null) {
    if (value === this._pipelineId) return;
    this._pipelineId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** Fired before the pipeline is rebound; a host may cancel it. */
  @Output() BeforeBindingChanged = new EventEmitter<BeforeBindingChangedEventArgs>();
  /** Fired after a rebinding save was attempted. */
  @Output() AfterBindingChanged = new EventEmitter<AfterBindingChangedEventArgs>();

  public Unit: BoundVersion | null = null;
  public Protocol: BoundVersion | null = null;
  public IsLoading = false;
  /** True once a read of the current pipeline completed (the "none" copy shows only then). */
  public HasLoaded = false;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  /** Reads the pipeline's bindings, then both bound versions and their lineages' latest versions in one batch. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.resetState();
    const pipelineId = this._pipelineId;
    if (pipelineId !== null) {
      this.IsLoading = true;
      this.cdr.detectChanges();
      const read = await this.readBindings(pipelineId);
      if (seq !== this.loadSeq) return;
      this.applyRead(read);
      this.IsLoading = false;
    }
    this.cdr.detectChanges();
  }

  /** Binds the pipeline to the latest version of the unit or the protocol lineage and saves it. */
  public async UseLatest(which: BindingKind): Promise<void> {
    const target = which === 'unit' ? this.Unit : this.Protocol;
    const pipelineId = this._pipelineId;
    if (target === null || pipelineId === null) return;
    const before = new BeforeBindingChangedEventArgs(pipelineId, which, target.LatestID);
    this.BeforeBindingChanged.emit(before);
    if (before.Cancel) {
      this.Error = before.CancelReason || null;
      this.cdr.detectChanges();
      return;
    }
    const error = await this.saveBinding(pipelineId, which, target.LatestID);
    this.AfterBindingChanged.emit(new AfterBindingChangedEventArgs(pipelineId, which, target.LatestID, error === null, error));
    if (error !== null) {
      this.Error = error;
      this.cdr.detectChanges();
      return;
    }
    await this.Load();
  }

  /** Clears what the previous pipeline showed, so a failed or empty load never shows its bindings. */
  private resetState(): void {
    this.Error = null;
    this.Unit = null;
    this.Protocol = null;
    this.IsLoading = false;
    this.HasLoaded = false;
  }

  private applyRead(read: Read<Bindings>): void {
    if (!read.Ok) {
      this.Error = read.Error;
      return;
    }
    this.Unit = read.Value.Unit;
    this.Protocol = read.Value.Protocol;
    this.HasLoaded = true;
  }

  /** Loads the pipeline as an entity object, sets one binding and saves it; null on success, else the error. */
  private async saveBinding(pipelineId: string, which: BindingKind, versionId: string): Promise<string | null> {
    const r = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJMLTrainingPipelineEntity>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(pipelineId)}'`, ResultType: 'entity_object',
    });
    const pipeline = PSPipelineBindingsComponent.first(r, pipelineId);
    if (!pipeline.Ok) return pipeline.Error;
    if (which === 'unit') pipeline.Value.PredictionUnitID = versionId;
    else pipeline.Value.EvaluationProtocolID = versionId;
    if (await pipeline.Value.Save()) return null;
    return pipeline.Value.LatestResult?.CompleteMessage || 'The pipeline could not be saved.';
  }

  /** The pipeline's two binding columns (a simple, three-field read), then the bound versions. */
  private async readBindings(pipelineId: string): Promise<Read<Bindings>> {
    const r = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<PipelineBindingFields>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(pipelineId)}'`,
      Fields: ['ID', 'PredictionUnitID', 'EvaluationProtocolID'], ResultType: 'simple',
    });
    const pipeline = PSPipelineBindingsComponent.first(r, pipelineId);
    return pipeline.Ok ? this.readBound(pipeline.Value) : pipeline;
  }

  private async readBound(pipeline: PipelineBindingFields): Promise<Read<Bindings>> {
    const requests: BoundVersionRequest[] = [];
    if (pipeline.PredictionUnitID) requests.push({ EntityName: 'MJ: Prediction Units', ID: pipeline.PredictionUnitID });
    if (pipeline.EvaluationProtocolID) requests.push({ EntityName: 'MJ: Evaluation Protocols', ID: pipeline.EvaluationProtocolID });
    const read = await LineageReads.ReadBoundVersions(this.ProviderToUse, requests);
    if (!read.Ok) return read;
    const of = (entity: BoundVersionRequest['EntityName']): BoundVersion | null => {
      const i = requests.findIndex((r) => r.EntityName === entity);
      return i < 0 ? null : PSPipelineBindingsComponent.boundVersion(read.Rows[i] || null);
    };
    return { Ok: true, Value: { Unit: of('MJ: Prediction Units'), Protocol: of('MJ: Evaluation Protocols') } };
  }

  private static first<T>(r: RunViewResult<T>, pipelineId: string): Read<T> {
    if (!r.Success) return { Ok: false, Error: r.ErrorMessage };
    const row = r.Results[0];
    return row === undefined ? { Ok: false, Error: `Pipeline ${pipelineId} was not found.` } : { Ok: true, Value: row };
  }

  private static boundVersion(read: BoundVersionRead | null): BoundVersion | null {
    if (read === null) return null;
    return { ID: read.Bound.ID, Name: read.Bound.Name, Version: read.Bound.Version, LatestID: read.Latest.ID, LatestVersion: read.Latest.Version };
  }
}
