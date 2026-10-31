import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ProtocolRows, PredictionUnit, type Actor, type PredictionUnitSpec, type UnitRowMeta } from '@memberjunction/predictive-studio-core';
import { PSUnitSummaryComponent } from '../unit-summary/unit-summary.component';
import { PSUnitEditorComponent, type UnitSaveRequest } from '../unit-editor/unit-editor.component';
import { LineageReads, UNIT_VERSION_FIELDS, type UnitVersionRow } from '../versioned-list/lineage-reads';

/** One version of the lineage: its row and the parsed unit. */
export interface VersionedUnitRow {
  readonly Row: UnitVersionRow;
  readonly Unit: PredictionUnitSpec;
}

/**
 * L2 widget: every version of one Prediction Unit lineage, or the editor for version 1 when `UnitID` is null. "Edit"
 * saves the next version as a new row through `this.ProviderToUse` and emits `VersionCreated`; it never navigates.
 * The server re-checks the label version and every reference on save.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-unit-versions',
  imports: [CommonModule, PSUnitSummaryComponent, PSUnitEditorComponent],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-unit-versions-error">{{ Error }}</p> }
    @if (UnitID === null) {
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
export class PSUnitVersionsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _unitId: string | null = null;
  private isInitialized = false;

  /** Any version row of the lineage; null = author version 1 of a new unit. */
  @Input()
  public get UnitID(): string | null { return this._unitId; }
  public set UnitID(value: string | null) {
    if (value === this._unitId) return;
    this._unitId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** The ID of the version row just saved (for version 1, the ID the server gave the row). */
  @Output() VersionCreated = new EventEmitter<string>();
  /** The user cancelled authoring version 1. */
  @Output() Cancelled = new EventEmitter<void>();

  public Versions: readonly VersionedUnitRow[] = [];
  public Selected: VersionedUnitRow | null = null;
  public Editing = false;
  public Error: string | null = null;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  public get Latest(): VersionedUnitRow | null {
    return this.Versions[this.Versions.length - 1] || null;
  }

  /** The current user, who authors any version saved here. */
  public get Author(): Actor {
    return { kind: 'human', userId: this.ProviderToUse.CurrentUser.ID };
  }

  public Select(v: VersionedUnitRow): void {
    this.Selected = v;
    this.Editing = false;
  }

  /** Loads every version of the lineage (nothing to load while authoring version 1). */
  public async Load(): Promise<void> {
    this.Error = null;
    const id = this._unitId;
    if (id === null) {
      this.Versions = [];
      this.Selected = null;
    } else {
      await this.loadLineage(id);
    }
    this.cdr.detectChanges();
  }

  /**
   * Saves the editor's draft: version 1 of a new lineage when there is no latest version, otherwise the version after
   * the latest one. The saved row's own ID is read back, because over GraphQL the server mints a new row's ID (and a
   * version-1 row adopts it as its lineage root).
   */
  public async Save(request: UnitSaveRequest): Promise<void> {
    const latest = this.Latest;
    // A lineage whose versions did not load has no latest version, and is never written as a new version 1.
    if (this._unitId !== null && latest === null) return;
    const p = this.ProviderToUse;
    const row = await p.GetEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', p.CurrentUser);
    row.NewRecord();
    const draft = latest === null ? request.Draft : { ...request.Draft, Description: latest.Row.Description };
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, draft, this.rowMeta(latest, request.LabelVersion));
    if (!(await row.Save())) {
      this.Error = row.LatestResult?.CompleteMessage || 'The new version could not be saved.';
      this.cdr.detectChanges();
      return;
    }
    this.Editing = false;
    this._unitId = row.ID;
    this.VersionCreated.emit(row.ID);
    await this.Load();
  }

  /** Row identity of the version being saved: version 1 is its own lineage root; a later one carries the root. */
  private rowMeta(latest: VersionedUnitRow | null, labelVersion: number): UnitRowMeta {
    if (latest === null) {
      const id = ProtocolRows.NewVersionRowID();
      return { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: this.Author };
    }
    return { ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, LabelVersion: labelVersion, AuthoredBy: this.Author };
  }

  private async loadLineage(anyVersionId: string): Promise<void> {
    const read = await LineageReads.ReadLineage<UnitVersionRow>(this.ProviderToUse, 'MJ: Prediction Units', anyVersionId, UNIT_VERSION_FIELDS);
    if (!read.Ok) {
      this.Error = read.Error;
      return;
    }
    const versions: VersionedUnitRow[] = [];
    for (const row of read.Rows) {
      const parsed = PredictionUnit.ParsePredictionUnitRow(row);
      if (!parsed.Ok) {
        this.Error = `Version ${row.Version} cannot be read: ${parsed.Errors.join('; ')}`;
        return;
      }
      versions.push({ Row: row, Unit: parsed.Value });
    }
    this.Versions = versions;
    this.Selected = versions.find((v) => UUIDsEqual(v.Row.ID, anyVersionId)) || this.Latest;
  }
}
