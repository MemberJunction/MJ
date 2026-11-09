import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  ProtocolRows, EvaluationProtocol, PredictionUnit,
  type EvaluationProtocolDraft, type EvaluationProtocolSpec, type PredictionUnitSpec, type ProtocolVersionWrite,
} from '@memberjunction/predictive-studio-core';
import { PSProtocolSummaryComponent } from '../protocol-summary/protocol-summary.component';
import { PSProtocolEditorComponent } from '../protocol-editor/protocol-editor.component';
import {
  LineageReads, PROTOCOL_VERSION_FIELDS, UNIT_VERSION_FIELDS,
  type LineageRead, type ProtocolVersionRow, type UnitVersionRow, type ValueRead,
} from '../versioned-list/lineage-reads';
import { PSVersionedLineageBase } from '../versioned-list/versioned-lineage-base';

/** One version of the lineage: its row and the parsed protocol. */
export interface VersionedProtocolRow {
  readonly Row: ProtocolVersionRow;
  readonly Protocol: EvaluationProtocolSpec;
}

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
export class PSProtocolVersionsComponent extends PSVersionedLineageBase<
  VersionedProtocolRow, EvaluationProtocolDraft, ProtocolVersionWrite, MJMLEvaluationProtocolEntity, ValueRead<PredictionUnitSpec | null>
> {
  protected readonly EntityName = 'MJ: ML Evaluation Protocols';

  /** Any version row of the lineage. */
  @Input()
  public get EvaluationProtocolID(): string | null { return this.LineageID; }
  public set EvaluationProtocolID(value: string | null) { this.SetLineageID(value); }

  public Unit: PredictionUnitSpec | null = null;

  /** Saves `draft` as the version after the latest one, carrying its description, then reloads on the new row. */
  public async Save(draft: EvaluationProtocolDraft): Promise<void> {
    const latest = this.Latest;
    if (latest === null) return;
    await this.SaveVersion({
      Draft: draft,
      Meta: { ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, AuthoredBy: this.Author, Description: latest.Row.Description },
    });
  }

  protected ReadVersions(anyVersionId: string): Promise<LineageRead<VersionedProtocolRow>> {
    return LineageReads.ReadParsedLineage<ProtocolVersionRow, VersionedProtocolRow>(
      this.ProviderToUse, this.EntityName, anyVersionId, PROTOCOL_VERSION_FIELDS, (row) => {
        const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
        return parsed.Ok ? { Ok: true, Value: { Row: row, Protocol: parsed.Value } } : parsed;
      },
    );
  }

  protected ApplyDraftToRow(row: MJMLEvaluationProtocolEntity, version: ProtocolVersionWrite): void {
    ProtocolRows.ApplyProtocolDraftToRow(row, version.Draft, version.Meta);
  }

  /** The unit a pipeline binds any version of the lineage to: the unit-dependent checks run against it. */
  protected override ReadRelated(versions: readonly VersionedProtocolRow[]): Promise<ValueRead<PredictionUnitSpec | null>> {
    return this.readBoundUnit(versions.map((v) => v.Row.ID));
  }

  protected override ApplyRelated(unit: ValueRead<PredictionUnitSpec | null> | null): void {
    if (unit !== null && !unit.Ok) this.Error = unit.Error;
    this.Unit = unit !== null && unit.Ok ? unit.Value : null;
  }

  protected override ResetState(): void {
    super.ResetState();
    this.Unit = null;
  }

  /** The unit of the most recently changed pipeline that binds any version of this lineage; null when none does. */
  private async readBoundUnit(versionIds: readonly string[]): Promise<ValueRead<PredictionUnitSpec | null>> {
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

  private async readUnit(unitId: string): Promise<ValueRead<PredictionUnitSpec | null>> {
    const units = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<UnitVersionRow>({
      EntityName: 'MJ: ML Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitId)}'`, Fields: [...UNIT_VERSION_FIELDS], ResultType: 'simple',
    });
    if (!units.Success) return { Ok: false, Error: units.ErrorMessage };
    const unitRow = units.Results[0];
    if (unitRow === undefined) return { Ok: true, Value: null };
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    return parsed.Ok ? { Ok: true, Value: parsed.Value } : { Ok: false, Error: `The bound Prediction Unit cannot be read: ${parsed.Errors.join('; ')}` };
  }
}
