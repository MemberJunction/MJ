import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  ProtocolRows, EvaluationProtocol, PredictionUnit,
  type Actor, type EvaluationProtocolDraft, type EvaluationProtocolSpec, type PredictionUnitSpec,
} from '@memberjunction/predictive-studio-core';
import { PSProtocolSummaryComponent } from '../protocol-summary/protocol-summary.component';
import { PSProtocolEditorComponent } from '../protocol-editor/protocol-editor.component';
import { LineageReads, PROTOCOL_VERSION_FIELDS, UNIT_VERSION_FIELDS, type ProtocolVersionRow, type UnitVersionRow } from '../versioned-list/lineage-reads';

/** One version of the lineage: its row and the parsed protocol. */
export interface VersionedProtocolRow {
  readonly Row: ProtocolVersionRow;
  readonly Protocol: EvaluationProtocolSpec;
}

/**
 * L2 widget: every version of one Evaluation Protocol lineage. "Edit" saves the next version as a new row through
 * `this.ProviderToUse` and emits `VersionCreated`; it never navigates. The unit-dependent checks use the unit of the
 * most recently changed pipeline that binds any version of the lineage.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-protocol-versions',
  imports: [CommonModule, PSProtocolSummaryComponent, PSProtocolEditorComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-protocol-versions-error">{{ Error }}</p> }
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
  `,
})
export class PSProtocolVersionsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _evaluationProtocolId: string | null = null;
  private isInitialized = false;

  /** Any version row of the lineage. */
  @Input()
  public get EvaluationProtocolID(): string | null { return this._evaluationProtocolId; }
  public set EvaluationProtocolID(value: string | null) {
    if (value === this._evaluationProtocolId) return;
    this._evaluationProtocolId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** The ID of the version row just saved. */
  @Output() VersionCreated = new EventEmitter<string>();

  public Versions: readonly VersionedProtocolRow[] = [];
  public Selected: VersionedProtocolRow | null = null;
  public Unit: PredictionUnitSpec | null = null;
  public Editing = false;
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

  /** Loads every version of the lineage and the unit a pipeline binds it to. */
  public async Load(): Promise<void> {
    this.Error = null;
    const id = this._evaluationProtocolId;
    if (id !== null) await this.loadLineage(id);
    this.cdr.detectChanges();
  }

  /** Saves `draft` as the version after the latest one, then reloads the lineage on the new row. */
  public async Save(draft: EvaluationProtocolDraft): Promise<void> {
    const latest = this.Latest;
    if (latest === null) return;
    const p = this.ProviderToUse;
    const row = await p.GetEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', p.CurrentUser);
    row.NewRecord();
    ProtocolRows.ApplyProtocolDraftToRow(row, draft, {
      ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, AuthoredBy: this.Author, Description: latest.Row.Description,
    });
    if (!(await row.Save())) {
      this.Error = row.LatestResult?.CompleteMessage || 'The new version could not be saved.';
      this.cdr.detectChanges();
      return;
    }
    this.Editing = false;
    this._evaluationProtocolId = row.ID;
    this.VersionCreated.emit(row.ID);
    await this.Load();
  }

  private async loadLineage(anyVersionId: string): Promise<void> {
    const read = await LineageReads.ReadLineage<ProtocolVersionRow>(this.ProviderToUse, 'MJ: Evaluation Protocols', anyVersionId, PROTOCOL_VERSION_FIELDS);
    if (!read.Ok) {
      this.Error = read.Error;
      return;
    }
    const versions = this.parseVersions(read.Rows);
    if (versions === null) return;
    this.Versions = versions;
    this.Selected = versions.find((v) => UUIDsEqual(v.Row.ID, anyVersionId)) || this.Latest;
    this.Unit = await this.loadBoundUnit(versions.map((v) => v.Row.ID));
  }

  /** The parsed versions; null (with `Error` set) when a version does not parse. */
  private parseVersions(rows: readonly ProtocolVersionRow[]): VersionedProtocolRow[] | null {
    const out: VersionedProtocolRow[] = [];
    for (const row of rows) {
      const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
      if (!parsed.Ok) {
        this.Error = `Version ${row.Version} cannot be read: ${parsed.Errors.join('; ')}`;
        return null;
      }
      out.push({ Row: row, Protocol: parsed.Value });
    }
    return out;
  }

  /** The unit of the most recently changed pipeline that binds any version of this lineage; null when none does. */
  private async loadBoundUnit(versionIds: readonly string[]): Promise<PredictionUnitSpec | null> {
    if (versionIds.length === 0) return null;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const list = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const pipelines = await rv.RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `EvaluationProtocolID IN (${list}) AND PredictionUnitID IS NOT NULL`,
      Fields: ['ID', 'PredictionUnitID'], OrderBy: '__mj_UpdatedAt DESC', MaxRows: 1, ResultType: 'simple',
    });
    if (!pipelines.Success) {
      this.Error = pipelines.ErrorMessage;
      return null;
    }
    const unitId = pipelines.Results[0]?.PredictionUnitID || null;
    return unitId === null ? null : this.loadUnit(unitId);
  }

  private async loadUnit(unitId: string): Promise<PredictionUnitSpec | null> {
    const units = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<UnitVersionRow>({
      EntityName: 'MJ: Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitId)}'`, Fields: [...UNIT_VERSION_FIELDS], ResultType: 'simple',
    });
    if (!units.Success) {
      this.Error = units.ErrorMessage;
      return null;
    }
    const unitRow = units.Results[0];
    if (unitRow === undefined) return null;
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (!parsed.Ok) this.Error = `The bound Prediction Unit cannot be read: ${parsed.Errors.join('; ')}`;
    return parsed.Ok ? parsed.Value : null;
  }
}
