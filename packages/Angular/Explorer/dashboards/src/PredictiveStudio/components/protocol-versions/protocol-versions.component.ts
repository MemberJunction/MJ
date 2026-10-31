import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  ProtocolRows, EvaluationProtocol, PredictionUnit,
  type Actor, type EvaluationProtocolDraft, type EvaluationProtocolSpec, type PredictionUnitSpec, type ProtocolVersionWrite,
} from '@memberjunction/predictive-studio-core';
import { PSProtocolSummaryComponent } from '../protocol-summary/protocol-summary.component';
import { PSProtocolEditorComponent } from '../protocol-editor/protocol-editor.component';
import { AfterVersionSavedEventArgs, BeforeVersionSavedEventArgs } from '../ps-widget-events';
import {
  LineageReads, PROTOCOL_VERSION_FIELDS, UNIT_VERSION_FIELDS,
  type LineageRead, type ProtocolVersionRow, type UnitVersionRow,
} from '../versioned-list/lineage-reads';

/** One version of the lineage: its row and the parsed protocol. */
export interface VersionedProtocolRow {
  readonly Row: ProtocolVersionRow;
  readonly Protocol: EvaluationProtocolSpec;
}

/** A read that may fail: the value, or the error to show. */
type Read<T> = { readonly Ok: true; readonly Value: T } | { readonly Ok: false; readonly Error: string };

/**
 * L2 widget: every version of one Evaluation Protocol lineage. "Edit" saves the next version as a new row through
 * `this.ProviderToUse`, after a cancelable `BeforeVersionSaved`, and reports the outcome in `AfterVersionSaved`; it
 * never navigates. The unit-dependent checks use the unit of the most recently changed pipeline that binds any version
 * of the lineage.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-protocol-versions',
  imports: [CommonModule, SharedGenericModule, PSProtocolSummaryComponent, PSProtocolEditorComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-protocol-versions-error">{{ Error }}</p> }
    @if (IsLoading) {
      <mj-loading Text="Loading versions..." Size="small"></mj-loading>
    } @else {
      <div class="ps-versions">
        <ul class="ps-version-list" data-testid="ps-protocol-version-list">
          @for (v of Versions; track v.Row.ID) {
            <li>
              <button type="button" class="ps-row-button" [class.active]="v === Selected" [attr.aria-pressed]="v === Selected" (click)="Select(v)">
                v{{ v.Row.Version }} · {{ v.Row.__mj_CreatedAt | date: 'yyyy-MM-dd' }}
              </button>
            </li>
          }
        </ul>
        @if (Selected; as s) {
          <div>
            @if (Editing && Latest !== null) {
              <mj-ps-protocol-editor [Base]="Latest.Protocol" [Unit]="Unit" [Author]="Author" (SaveRequested)="Save($event)" (Cancelled)="Editing = false"></mj-ps-protocol-editor>
            } @else {
              <mj-ps-protocol-summary [Protocol]="s.Protocol" [IsLatest]="s === Latest" [CanEdit]="true" (EditRequested)="Editing = true"></mj-ps-protocol-summary>
              @if (Unit === null) { <p class="ps-muted">No pipeline binds this protocol yet; unit-dependent checks run when a pipeline binds it.</p> }
            }
          </div>
        }
      </div>
    }
  `,
})
export class PSProtocolVersionsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _evaluationProtocolId: string | null = null;
  private isInitialized = false;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  /** Any version row of the lineage. */
  @Input()
  public get EvaluationProtocolID(): string | null { return this._evaluationProtocolId; }
  public set EvaluationProtocolID(value: string | null) {
    if (value === this._evaluationProtocolId) return;
    this._evaluationProtocolId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** Fired before a version row is saved; a host may cancel it. */
  @Output() BeforeVersionSaved = new EventEmitter<BeforeVersionSavedEventArgs<EvaluationProtocolDraft>>();
  /** Fired after a save was attempted: the saved row's ID or the error. */
  @Output() AfterVersionSaved = new EventEmitter<AfterVersionSavedEventArgs>();

  public Versions: readonly VersionedProtocolRow[] = [];
  public Selected: VersionedProtocolRow | null = null;
  public Unit: PredictionUnitSpec | null = null;
  public Editing = false;
  public IsLoading = false;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  public get Latest(): VersionedProtocolRow | null {
    return this.Versions[this.Versions.length - 1] || null;
  }

  /** The current user, who authors any version saved here. */
  public get Author(): Actor {
    return { kind: 'human', userId: this.ProviderToUse.CurrentUser.ID };
  }

  public Select(v: VersionedProtocolRow): void {
    this.Selected = v;
    this.Editing = false;
  }

  /** Loads every version of the lineage and the unit a pipeline binds it to; a newer load supersedes it. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.resetState();
    const id = this._evaluationProtocolId;
    if (id !== null) {
      this.IsLoading = true;
      this.cdr.detectChanges();
      const versions = await this.readVersions(id);
      const unit = versions.Ok ? await this.readBoundUnit(versions.Rows.map((v) => v.Row.ID)) : null;
      if (seq !== this.loadSeq) return;
      this.applyRead(versions, unit, id);
      this.IsLoading = false;
    }
    this.cdr.detectChanges();
  }

  /** Saves `draft` as the version after the latest one, carrying its description, then reloads on the new row. */
  public async Save(draft: EvaluationProtocolDraft): Promise<void> {
    const latest = this.Latest;
    if (latest === null) return;
    const version: ProtocolVersionWrite = {
      Draft: draft,
      Meta: { ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, AuthoredBy: this.Author, Description: latest.Row.Description },
    };
    const before = new BeforeVersionSavedEventArgs<EvaluationProtocolDraft>('MJ: Evaluation Protocols', version.Meta.Version, draft);
    this.BeforeVersionSaved.emit(before);
    if (before.Cancel) {
      this.Error = before.CancelReason || null;
      this.cdr.detectChanges();
      return;
    }
    const savedId = await this.writeRow(version);
    this.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Evaluation Protocols', version.Meta.Version, savedId, savedId !== null, savedId === null ? this.Error : null));
    if (savedId === null) {
      this.cdr.detectChanges();
      return;
    }
    this._evaluationProtocolId = savedId;
    await this.Load();
  }

  /** Writes and saves the row; its ID after the save, or null with `Error` set. */
  private async writeRow(version: ProtocolVersionWrite): Promise<string | null> {
    const p = this.ProviderToUse;
    const row = await p.GetEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', p.CurrentUser);
    row.NewRecord();
    ProtocolRows.ApplyProtocolDraftToRow(row, version.Draft, version.Meta);
    if (await row.Save()) return row.ID;
    this.Error = row.LatestResult?.CompleteMessage || 'The new version could not be saved.';
    return null;
  }

  /** Clears what the previous record showed, so a failed or empty load never shows it next to the new state. */
  private resetState(): void {
    this.Error = null;
    this.Versions = [];
    this.Selected = null;
    this.Unit = null;
    this.Editing = false;
    this.IsLoading = false;
  }

  private applyRead(versions: LineageRead<VersionedProtocolRow>, unit: Read<PredictionUnitSpec | null> | null, anyVersionId: string): void {
    if (!versions.Ok) {
      this.Error = versions.Error;
      return;
    }
    this.Versions = versions.Rows;
    this.Selected = versions.Rows.find((v) => UUIDsEqual(v.Row.ID, anyVersionId)) || this.Latest;
    if (unit !== null && !unit.Ok) this.Error = unit.Error;
    this.Unit = unit !== null && unit.Ok ? unit.Value : null;
  }

  /** The parsed versions of the lineage, or why they cannot be shown. */
  private async readVersions(anyVersionId: string): Promise<LineageRead<VersionedProtocolRow>> {
    const read = await LineageReads.ReadLineage<ProtocolVersionRow>(this.ProviderToUse, 'MJ: Evaluation Protocols', anyVersionId, PROTOCOL_VERSION_FIELDS);
    if (!read.Ok) return read;
    const out: VersionedProtocolRow[] = [];
    for (const row of read.Rows) {
      const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
      if (!parsed.Ok) return { Ok: false, Error: `Version ${row.Version} cannot be read: ${parsed.Errors.join('; ')}` };
      out.push({ Row: row, Protocol: parsed.Value });
    }
    return { Ok: true, Rows: out };
  }

  /** The unit of the most recently changed pipeline that binds any version of this lineage; null when none does. */
  private async readBoundUnit(versionIds: readonly string[]): Promise<Read<PredictionUnitSpec | null>> {
    if (versionIds.length === 0) return { Ok: true, Value: null };
    const list = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const pipelines = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `EvaluationProtocolID IN (${list}) AND PredictionUnitID IS NOT NULL`,
      Fields: ['ID', 'PredictionUnitID'], OrderBy: '__mj_UpdatedAt DESC', MaxRows: 1, ResultType: 'simple',
    });
    if (!pipelines.Success) return { Ok: false, Error: pipelines.ErrorMessage };
    const unitId = pipelines.Results[0]?.PredictionUnitID || null;
    return unitId === null ? { Ok: true, Value: null } : this.readUnit(unitId);
  }

  private async readUnit(unitId: string): Promise<Read<PredictionUnitSpec | null>> {
    const units = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<UnitVersionRow>({
      EntityName: 'MJ: Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitId)}'`, Fields: [...UNIT_VERSION_FIELDS], ResultType: 'simple',
    });
    if (!units.Success) return { Ok: false, Error: units.ErrorMessage };
    const unitRow = units.Results[0];
    if (unitRow === undefined) return { Ok: true, Value: null };
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    return parsed.Ok ? { Ok: true, Value: parsed.Value } : { Ok: false, Error: `The bound Prediction Unit cannot be read: ${parsed.Errors.join('; ')}` };
  }
}
