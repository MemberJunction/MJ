import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDMap } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { LineageReads, type VersionedEntityName, type VersionRowFields } from './lineage-reads';

/** One lineage as the list shows it: its latest version. */
export interface LineageItem {
  readonly LatestID: string;
  readonly Name: string;
  readonly LatestVersion: number;
  readonly UpdatedAt: Date | string;
}

/**
 * L2 widget: the Evaluation Protocols or Prediction Units, one row per lineage (its latest version), newest first.
 * Opening a row emits `OpenRecord` with the latest version row's ID; the host decides where to open it.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-versioned-list',
  imports: [CommonModule, SharedGenericModule],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Error) { <p class="ps-refusals" data-testid="ps-versioned-list-error">{{ Error }}</p> }
    @if (IsLoading) {
      <mj-loading Text="Loading..." Size="small"></mj-loading>
    } @else if (HasLoaded) {
    <table class="ps-eval-table" data-testid="ps-versioned-list">
      <thead><tr><th>Name</th><th>Latest version</th><th>Saved</th></tr></thead>
      <tbody>
        @for (i of Items; track i.LatestID) {
          <tr data-testid="ps-versioned-row">
            <td><button type="button" class="ps-row-button" data-testid="ps-versioned-open" (click)="OpenRecord.emit(i.LatestID)">{{ i.Name }}</button></td>
            <td>v{{ i.LatestVersion }}</td>
            <td>{{ i.UpdatedAt | date: 'yyyy-MM-dd' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="3" class="ps-muted">None yet.</td></tr>
        }
      </tbody>
    </table>
    }
  `,
})
export class PSVersionedListComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _entityName: VersionedEntityName = 'MJ: ML Evaluation Protocols';
  private isInitialized = false;

  @Input()
  public get EntityName(): VersionedEntityName { return this._entityName; }
  public set EntityName(value: VersionedEntityName) {
    if (value === this._entityName) return;
    this._entityName = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** The latest version row's ID of the lineage the user opened. */
  @Output() OpenRecord = new EventEmitter<string>();

  public Items: readonly LineageItem[] = [];
  public IsLoading = false;
  /** True once a read completed (the empty-list copy shows only then). */
  public HasLoaded = false;
  public Error: string | null = null;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  /** The latest version of each lineage, newest first. */
  public static LatestPerLineage(rows: readonly VersionRowFields[]): readonly LineageItem[] {
    const latest = new UUIDMap<VersionRowFields>();
    for (const r of rows) {
      const seen = latest.Get(r.LineageRootID);
      if (seen === undefined || r.Version > seen.Version) latest.Set(r.LineageRootID, r);
    }
    return [...latest.Values()]
      .sort((a, b) => new Date(b.__mj_CreatedAt).getTime() - new Date(a.__mj_CreatedAt).getTime())
      .map((r) => ({ LatestID: r.ID, Name: r.Name, LatestVersion: r.Version, UpdatedAt: r.__mj_CreatedAt }));
  }

  /** Reads the list; a newer load supersedes it, and a failed read leaves no previous entity's rows on screen. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.Error = null;
    this.Items = [];
    this.HasLoaded = false;
    this.IsLoading = true;
    this.cdr.detectChanges();
    const read = await LineageReads.ReadAllVersionRows(this.ProviderToUse, this._entityName);
    if (seq !== this.loadSeq) return;
    if (read.Ok) this.Items = PSVersionedListComponent.LatestPerLineage(read.Rows);
    else this.Error = read.Error;
    this.HasLoaded = read.Ok;
    this.IsLoading = false;
    this.cdr.detectChanges();
  }
}
