import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ProtocolRows, PredictionUnit, type Actor, type PredictionUnitSpec, type UnitDraft, type UnitVersionWrite } from '@memberjunction/predictive-studio-core';
import { PSUnitSummaryComponent } from '../unit-summary/unit-summary.component';
import { PSUnitEditorComponent, type UnitSaveRequest } from '../unit-editor/unit-editor.component';
import { AfterVersionSavedEventArgs, BeforeVersionSavedEventArgs } from '../ps-widget-events';
import { LineageReads, UNIT_VERSION_FIELDS, type LineageRead, type UnitVersionRow } from '../versioned-list/lineage-reads';

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
export class PSUnitVersionsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _unitId: string | null = null;
  private isInitialized = false;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  /** Any version row of the lineage; null = author version 1 of a new unit. */
  @Input()
  public get UnitID(): string | null { return this._unitId; }
  public set UnitID(value: string | null) {
    if (value === this._unitId) return;
    this._unitId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** Fired before a version row is saved; a host may cancel it. */
  @Output() BeforeVersionSaved = new EventEmitter<BeforeVersionSavedEventArgs<UnitDraft>>();
  /** Fired after a save was attempted: the saved row's ID (for version 1, the ID the server gave it) or the error. */
  @Output() AfterVersionSaved = new EventEmitter<AfterVersionSavedEventArgs>();
  /** The user cancelled authoring version 1. */
  @Output() Cancelled = new EventEmitter<void>();

  public Versions: readonly VersionedUnitRow[] = [];
  public Selected: VersionedUnitRow | null = null;
  public Editing = false;
  public IsLoading = false;
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

  /** Loads every version of the lineage (nothing to load while authoring version 1); a newer load supersedes it. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.resetState();
    const id = this._unitId;
    if (id !== null) {
      this.IsLoading = true;
      this.cdr.detectChanges();
      const read = await this.readLineage(id);
      if (seq !== this.loadSeq) return;
      this.applyLineage(read, id);
      this.IsLoading = false;
    }
    this.cdr.detectChanges();
  }

  /**
   * Saves the editor's draft: version 1 of a new lineage while authoring one, otherwise the version after the latest
   * one, carrying the latest version's description. The saved row's own ID is read back, because over GraphQL the
   * server mints a new row's ID (and a version-1 row adopts it as its lineage root).
   */
  public async Save(request: UnitSaveRequest): Promise<void> {
    const version = this.versionToWrite(request);
    if (version === null) return;
    const before = new BeforeVersionSavedEventArgs<UnitDraft>('MJ: Prediction Units', version.Meta.Version, version.Draft);
    this.BeforeVersionSaved.emit(before);
    if (before.Cancel) {
      this.Error = before.CancelReason || null;
      this.cdr.detectChanges();
      return;
    }
    const savedId = await this.writeRow(version);
    this.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Prediction Units', version.Meta.Version, savedId, savedId !== null, savedId === null ? this.Error : null));
    if (savedId === null) {
      this.cdr.detectChanges();
      return;
    }
    this.Editing = false;
    this._unitId = savedId;
    await this.Load();
  }

  /**
   * The draft and row identity to write: version 1 is its own lineage root with label version 1; a later version
   * carries the root, Version = latest + 1, the request's label version and the latest description. Null when a
   * lineage is set but its versions did not load: that is never written as a new version 1.
   */
  private versionToWrite(request: UnitSaveRequest): UnitVersionWrite | null {
    const latest = this.Latest;
    if (latest === null) {
      if (this._unitId !== null) return null;
      const id = ProtocolRows.NewVersionRowID();
      return { Draft: request.Draft, Meta: { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: this.Author } };
    }
    return {
      Draft: { ...request.Draft, Description: latest.Row.Description },
      Meta: { ID: null, LineageRootID: latest.Row.LineageRootID, Version: latest.Row.Version + 1, LabelVersion: request.LabelVersion, AuthoredBy: this.Author },
    };
  }

  /** Writes and saves the row; its ID after the save, or null with `Error` set. */
  private async writeRow(version: UnitVersionWrite): Promise<string | null> {
    const p = this.ProviderToUse;
    const row = await p.GetEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', p.CurrentUser);
    row.NewRecord();
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, version.Draft, version.Meta);
    if (await row.Save()) return row.ID;
    this.Error = row.LatestResult?.CompleteMessage || 'The new version could not be saved.';
    return null;
  }

  /** Clears what the previous record showed, so a failed or empty load never shows it next to the new state. */
  private resetState(): void {
    this.Error = null;
    this.Versions = [];
    this.Selected = null;
    this.Editing = false;
    this.IsLoading = false;
  }

  /** The parsed versions of the lineage, or why they cannot be shown (the read failed or a version does not parse). */
  private async readLineage(anyVersionId: string): Promise<LineageRead<VersionedUnitRow>> {
    const read = await LineageReads.ReadLineage<UnitVersionRow>(this.ProviderToUse, 'MJ: Prediction Units', anyVersionId, UNIT_VERSION_FIELDS);
    if (!read.Ok) return read;
    const versions: VersionedUnitRow[] = [];
    for (const row of read.Rows) {
      const parsed = PredictionUnit.ParsePredictionUnitRow(row);
      if (!parsed.Ok) return { Ok: false, Error: `Version ${row.Version} cannot be read: ${parsed.Errors.join('; ')}` };
      versions.push({ Row: row, Unit: parsed.Value });
    }
    return { Ok: true, Rows: versions };
  }

  private applyLineage(read: LineageRead<VersionedUnitRow>, anyVersionId: string): void {
    if (!read.Ok) {
      this.Error = read.Error;
      return;
    }
    this.Versions = read.Rows;
    this.Selected = read.Rows.find((v) => UUIDsEqual(v.Row.ID, anyVersionId)) || this.Latest;
  }
}
