import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ProtocolRows, PredictionUnit, type PredictionUnitSpec, type UnitDraft, type UnitVersionWrite } from '@memberjunction/predictive-studio-core';
import { PSUnitSummaryComponent } from '../unit-summary/unit-summary.component';
import { PSUnitEditorComponent, type UnitSaveRequest } from '../unit-editor/unit-editor.component';
import { LineageReads, UNIT_VERSION_FIELDS, type LineageRead, type UnitVersionRow } from '../versioned-list/lineage-reads';
import { PSVersionedLineageBase } from '../versioned-list/versioned-lineage-base';

/** One version of the lineage: its row and the parsed unit. */
export interface VersionedUnitRow {
  readonly Row: UnitVersionRow;
  readonly Unit: PredictionUnitSpec;
}

/**
 * L2 widget: every version of one Prediction Unit lineage, or the editor for version 1 when `UnitID` is null. "Edit"
 * saves the next version as a new row through `this.ProviderToUse`, after a cancelable `BeforeVersionSaved`, and
 * reports the outcome in `AfterVersionSaved`; it never navigates. The server re-checks the label version and every
 * reference on save.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-unit-versions',
  imports: [CommonModule, SharedGenericModule, PSUnitSummaryComponent, PSUnitEditorComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-unit-versions-error">{{ Error }}</p> }
    @if (IsLoading) {
      <mj-loading Text="Loading versions..." Size="small"></mj-loading>
    } @else if (UnitID === null) {
      <mj-ps-unit-editor [Base]="null" (SaveRequested)="Save($event)" (Cancelled)="Cancelled.emit()"></mj-ps-unit-editor>
    } @else {
      <div class="ps-versions">
        <ul class="ps-version-list" data-testid="ps-unit-version-list">
          @for (v of Versions; track v.Row.ID) {
            <li>
              <button type="button" class="ps-row-button" [class.active]="v === Selected" [attr.aria-pressed]="v === Selected" (click)="Select(v)">
                v{{ v.Row.Version }} · label v{{ v.Row.LabelVersion }} · {{ v.Row.__mj_CreatedAt | date: 'yyyy-MM-dd' }}
              </button>
            </li>
          }
        </ul>
        @if (Selected; as s) {
          <div>
            @if (Editing && Latest !== null) {
              <mj-ps-unit-editor [Base]="Latest.Unit" (SaveRequested)="Save($event)" (Cancelled)="Editing = false"></mj-ps-unit-editor>
            } @else {
              <mj-ps-unit-summary [Unit]="s.Unit" [IsLatest]="s === Latest" [CanEdit]="true" (EditRequested)="Editing = true"></mj-ps-unit-summary>
            }
          </div>
        }
      </div>
    }
  `,
})
export class PSUnitVersionsComponent extends PSVersionedLineageBase<VersionedUnitRow, UnitDraft, UnitVersionWrite, MJMLPredictionUnitEntity> {
  protected readonly EntityName = 'MJ: ML Prediction Units';

  /** Any version row of the lineage; null = author version 1 of a new unit. */
  @Input()
  public get UnitID(): string | null { return this.LineageID; }
  public set UnitID(value: string | null) { this.SetLineageID(value); }

  /** The user cancelled authoring version 1. */
  @Output() Cancelled = new EventEmitter<void>();

  /**
   * Saves the editor's draft: version 1 of a new lineage while authoring one, otherwise the version after the latest
   * one, carrying the latest version's description. The saved row's own ID is read back, because over GraphQL the
   * server mints a new row's ID (and a version-1 row adopts it as its lineage root).
   */
  public async Save(request: UnitSaveRequest): Promise<void> {
    const version = this.versionToWrite(request);
    if (version === null) return;
    await this.SaveVersion(version);
  }

  protected ReadVersions(anyVersionId: string): Promise<LineageRead<VersionedUnitRow>> {
    return LineageReads.ReadParsedLineage<UnitVersionRow, VersionedUnitRow>(
      this.ProviderToUse, this.EntityName, anyVersionId, UNIT_VERSION_FIELDS, (row) => {
        const parsed = PredictionUnit.ParsePredictionUnitRow(row);
        return parsed.Ok ? { Ok: true, Value: { Row: row, Unit: parsed.Value } } : parsed;
      },
    );
  }

  protected ApplyDraftToRow(row: MJMLPredictionUnitEntity, version: UnitVersionWrite): void {
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, version.Draft, version.Meta);
  }

  /**
   * The draft and row identity to write: version 1 is its own lineage root with label version 1; a later version
   * carries the root, Version = latest + 1, the request's label version and the latest description. Null when a
   * lineage is set but its versions did not load: that is never written as a new version 1.
   */
  private versionToWrite(request: UnitSaveRequest): UnitVersionWrite | null {
    const latest = this.Latest;
    if (latest === null) {
      if (this.LineageID !== null) return null;
      const id = ProtocolRows.NewVersionRowID();
      return { Draft: request.Draft, Meta: { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: this.Author } };
    }
    return {
      Draft: { ...request.Draft, Description: latest.Row.Description },
      Meta: { ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, LabelVersion: request.LabelVersion, AuthoredBy: this.Author },
    };
  }
}
