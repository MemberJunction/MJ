import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import {
  ArtifactVersionDiffService,
  type SpreadsheetGridDiffRow,
  type SpreadsheetSheetDiffItem,
  type SpreadsheetVisualDiffResult,
} from '../../services/artifact-version-diff.service';

@Component({
  selector: 'mj-spreadsheet-version-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-sheets-vdiff" data-testid="spreadsheet-visual-version-diff">
      @if (DiffResult) {
        <div class="mj-sheets-vdiff__toolbar">
          <div class="mj-sheets-vdiff__stats">
            <span class="mj-sh-chip mj-sh-chip--mod">
              <i class="fas fa-table-cells"></i> {{ DiffResult.TotalValueEdits }} cell value changes
            </span>
            <span class="mj-sh-chip mj-sh-chip--fx">
              <i class="fas fa-square-root-variable"></i> {{ DiffResult.TotalFormulaEdits }} formula edits
            </span>
            @if (DiffResult.AddedSheets > 0) {
              <span class="mj-sh-chip mj-sh-chip--add">+{{ DiffResult.AddedSheets }} sheet</span>
            }
            @if (DiffResult.RemovedSheets > 0) {
              <span class="mj-sh-chip mj-sh-chip--del">−{{ DiffResult.RemovedSheets }} sheet</span>
            }
          </div>

          <div class="mj-sheets-vdiff__controls">
            <label class="mj-sheets-vdiff__check">
              <input
                type="checkbox"
                [checked]="ChangedRowsOnly"
                (change)="ToggleChangedRowsOnly()"
              />
              <span>Changed rows only</span>
            </label>

            <div class="mj-sheets-vdiff__mode-pills">
              <button
                type="button"
                class="mj-sh-pill"
                [class.mj-sh-pill--active]="ViewMode === 'grid'"
                (click)="SetViewMode('grid')"
              >
                Grid Overlay
              </button>
              <button
                type="button"
                class="mj-sh-pill"
                [class.mj-sh-pill--active]="ViewMode === 'list'"
                (click)="SetViewMode('list')"
              >
                Change Ledger
              </button>
            </div>
          </div>
        </div>

        <!-- Worksheet Tabs -->
        <div class="mj-sheets-vdiff__tabs" role="tablist">
          @for (sh of DiffResult.Sheets; track sh.SheetKey) {
            <button
              type="button"
              role="tab"
              class="mj-sheets-vdiff__tab"
              [class.mj-sheets-vdiff__tab--active]="ActiveSheet?.SheetKey === sh.SheetKey"
              [attr.data-status]="sh.Status"
              (click)="SelectSheet(sh)"
            >
              <span>{{ sh.Name }}</span>
              @if (sh.TotalChangedCells > 0) {
                <span class="mj-sheets-vdiff__tab-count">{{ sh.TotalChangedCells }}</span>
              } @else if (sh.Status === 'added' || sh.Status === 'removed') {
                <span class="mj-sheets-vdiff__tab-count">{{ sh.Status }}</span>
              }
            </button>
          }
        </div>

        @if (ActiveSheet; as sheet) {
          @if (sheet.StructureDeltas.length > 0) {
            <div class="mj-sheets-vdiff__struct">
              @for (sd of sheet.StructureDeltas; track sd.Label) {
                <span class="mj-sheets-vdiff__struct-pill">
                  <strong>{{ sd.Label }}:</strong> {{ sd.OldValue }} → {{ sd.NewValue }}
                </span>
              }
            </div>
          }

          @if (sheet.TotalChangedCells === 0 && sheet.StructureDeltas.length === 0) {
            <div class="mj-sheets-vdiff__empty">
              <i class="fas fa-circle-check"></i>
              <span>No cell or formula changes in worksheet "{{ sheet.Name }}".</span>
            </div>
          } @else if (ViewMode === 'grid') {
            <div class="mj-sheets-vdiff__grid-wrap">
              <table class="mj-sheets-vdiff__table">
                <thead>
                  <tr>
                    <th class="mj-sh-corner">#</th>
                    @for (col of sheet.ColumnLetters; track col) {
                      <th>{{ col }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of GetVisibleRows(sheet); track row.RowNumber) {
                    <tr [class.mj-sh-row--changed]="row.HasChanges">
                      <td class="mj-sh-rownum">{{ row.RowNumber }}</td>
                      @for (cell of row.Cells; track cell.Address) {
                        <td
                          class="mj-sh-cell"
                          [class.mj-sh-cell--added]="cell.Status === 'added'"
                          [class.mj-sh-cell--removed]="cell.Status === 'removed'"
                          [class.mj-sh-cell--modified]="cell.Status === 'modified'"
                          [attr.data-testid]="cell.Status !== 'unchanged' ? 'sheet-diff-cell-' + cell.Address : null"
                        >
                          @if (cell.Status === 'unchanged') {
                            <span class="mj-sh-val-eq">{{ cell.NewDisplay }}</span>
                          } @else if (cell.Status === 'added') {
                            <div class="mj-sh-delta">
                              <span class="mj-sh-val-new">+ {{ cell.NewDisplay }}</span>
                              @if (cell.NewFormula) {
                                <code class="mj-sh-fx">{{ cell.NewFormula }}</code>
                              }
                            </div>
                          } @else if (cell.Status === 'removed') {
                            <div class="mj-sh-delta">
                              <del class="mj-sh-val-old">{{ cell.OldDisplay }}</del>
                              @if (cell.OldFormula) {
                                <code class="mj-sh-fx">{{ cell.OldFormula }}</code>
                              }
                            </div>
                          } @else {
                            <div class="mj-sh-delta">
                              @if (cell.ValueChanged) {
                                <div class="mj-sh-val-pair">
                                  <del class="mj-sh-val-old">{{ cell.OldDisplay || '∅' }}</del>
                                  <i class="fas fa-arrow-right"></i>
                                  <strong class="mj-sh-val-new">{{ cell.NewDisplay || '∅' }}</strong>
                                </div>
                              } @else {
                                <span class="mj-sh-val-eq">{{ cell.NewDisplay }}</span>
                              }
                              @if (cell.FormulaChanged) {
                                <div class="mj-sh-fx-pair">
                                  <span class="mj-sh-fx-tag">fx</span>
                                  <del>{{ cell.OldFormula || 'literal' }}</del>
                                  <span>→</span>
                                  <code>{{ cell.NewFormula || 'literal' }}</code>
                                </div>
                              }
                            </div>
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <!-- Compact Change Ledger Table -->
            <div class="mj-sheets-vdiff__ledger">
              <table class="mj-sheets-vdiff__ledger-tbl">
                <thead>
                  <tr>
                    <th>Cell</th>
                    <th>Change</th>
                    <th>Base (v{{ BaseVersion.VersionNumber }})</th>
                    <th>Target (v{{ TargetVersion.VersionNumber }})</th>
                    <th>Formula Delta</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of sheet.ChangedEntries; track entry.Address) {
                    <tr>
                      <td><code>{{ entry.Address }}</code></td>
                      <td>
                        <span class="mj-sh-status-pill" [attr.data-status]="entry.Status">
                          {{ entry.Status }}
                        </span>
                      </td>
                      <td class="mj-sh-val-old">{{ entry.OldDisplay || '—' }}</td>
                      <td class="mj-sh-val-new"><strong>{{ entry.NewDisplay || '—' }}</strong></td>
                      <td>
                        @if (entry.FormulaChanged || entry.NewFormula || entry.OldFormula) {
                          <code>{{ entry.OldFormula || '—' }} → {{ entry.NewFormula || '—' }}</code>
                        } @else {
                          <span class="mj-sh-muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .mj-sheets-vdiff {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-sheets-vdiff__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 14px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-sheets-vdiff__stats,
      .mj-sheets-vdiff__controls {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mj-sh-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 999px;
      }

      .mj-sh-chip--mod {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      }

      .mj-sh-chip--fx {
        color: var(--mj-status-warning, #d97706);
        background: color-mix(in srgb, var(--mj-status-warning, #d97706) 15%, transparent);
      }

      .mj-sh-chip--add {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 14%, transparent);
      }

      .mj-sh-chip--del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 14%, transparent);
      }

      .mj-sheets-vdiff__check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-sheets-vdiff__mode-pills {
        display: inline-flex;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        overflow: hidden;
      }

      .mj-sh-pill {
        border: none;
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        cursor: pointer;
      }

      .mj-sh-pill--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse, #fff);
      }

      .mj-sheets-vdiff__tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
      }

      .mj-sheets-vdiff__tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-sheets-vdiff__tab--active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 9%, var(--mj-bg-surface));
      }

      .mj-sheets-vdiff__tab-count {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-vdiff__struct {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
      }

      .mj-sheets-vdiff__struct-pill {
        padding: 4px 10px;
        border-radius: 6px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-vdiff__grid-wrap,
      .mj-sheets-vdiff__ledger {
        overflow: auto;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface);
        max-height: 560px;
      }

      .mj-sheets-vdiff__table,
      .mj-sheets-vdiff__ledger-tbl {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .mj-sheets-vdiff__table th,
      .mj-sheets-vdiff__ledger-tbl th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-weight: 700;
        padding: 6px 10px;
        border-bottom: 1px solid var(--mj-border-default);
        border-right: 1px solid var(--mj-border-subtle);
        text-align: center;
      }

      .mj-sheets-vdiff__ledger-tbl th,
      .mj-sheets-vdiff__ledger-tbl td {
        text-align: left;
        padding: 8px 12px;
        border-bottom: 1px solid var(--mj-border-subtle);
      }

      .mj-sh-corner,
      .mj-sh-rownum {
        width: 38px;
        text-align: center;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-muted);
        font-weight: 600;
        border-right: 1px solid var(--mj-border-default);
        border-bottom: 1px solid var(--mj-border-subtle);
        user-select: none;
      }

      .mj-sh-cell {
        min-width: 110px;
        padding: 6px 8px;
        border-right: 1px solid var(--mj-border-subtle);
        border-bottom: 1px solid var(--mj-border-subtle);
        vertical-align: top;
      }

      .mj-sh-cell--added {
        background: color-mix(in srgb, var(--mj-status-success) 11%, var(--mj-bg-surface));
      }

      .mj-sh-cell--removed {
        background: color-mix(in srgb, var(--mj-status-error) 11%, var(--mj-bg-surface));
      }

      .mj-sh-cell--modified {
        background: color-mix(in srgb, var(--mj-brand-primary) 9%, var(--mj-bg-surface));
      }

      .mj-sh-val-eq {
        color: var(--mj-text-secondary);
      }

      .mj-sh-val-old {
        color: var(--mj-status-error);
      }

      .mj-sh-val-new {
        color: var(--mj-status-success);
      }

      .mj-sh-delta {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .mj-sh-val-pair {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
      }

      .mj-sh-val-pair i {
        font-size: 10px;
        color: var(--mj-text-muted);
      }

      .mj-sh-fx,
      .mj-sh-fx-pair {
        font-size: 11px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        color: var(--mj-text-secondary);
      }

      .mj-sh-fx-tag {
        padding: 0 4px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--mj-status-warning, #d97706) 18%, transparent);
        color: var(--mj-status-warning, #d97706);
        font-weight: 700;
      }

      .mj-sh-status-pill {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
      }

      .mj-sh-status-pill[data-status='added'] {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 15%, transparent);
      }

      .mj-sh-status-pill[data-status='removed'] {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
      }

      .mj-sh-status-pill[data-status='modified'] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      }

      .mj-sh-muted {
        color: var(--mj-text-muted);
      }

      .mj-sheets-vdiff__empty {
        padding: 32px;
        text-align: center;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface-card);
        border-radius: 10px;
        border: 1px dashed var(--mj-border-default);
      }
    `,
  ],
})
export class SpreadsheetVersionDiffComponent implements IArtifactVersionDiffViewer, OnChanges {
  private readonly diffService = inject(ArtifactVersionDiffService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() BaseVersion!: MJArtifactVersionEntity;
  @Input() TargetVersion!: MJArtifactVersionEntity;

  public DiffResult: SpreadsheetVisualDiffResult | null = null;
  public ActiveSheet: SpreadsheetSheetDiffItem | null = null;
  public ViewMode: 'grid' | 'list' = 'grid';
  public ChangedRowsOnly = false;

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.BaseVersion && this.TargetVersion) {
      this.DiffResult = this.diffService.ComputeSpreadsheetVisualDiff(
        this.BaseVersion.Content,
        this.TargetVersion.Content,
      );
      const firstChanged = this.DiffResult.Sheets.find((s) => s.Status !== 'unchanged');
      this.ActiveSheet = firstChanged ?? this.DiffResult.Sheets[0] ?? null;
      this.cdr.markForCheck();
    }
  }

  public SelectSheet(sh: SpreadsheetSheetDiffItem): void {
    this.ActiveSheet = sh;
    this.cdr.markForCheck();
  }

  public SetViewMode(mode: 'grid' | 'list'): void {
    this.ViewMode = mode;
    this.cdr.markForCheck();
  }

  public ToggleChangedRowsOnly(): void {
    this.ChangedRowsOnly = !this.ChangedRowsOnly;
    this.cdr.markForCheck();
  }

  public GetVisibleRows(sheet: SpreadsheetSheetDiffItem): SpreadsheetGridDiffRow[] {
    if (!this.ChangedRowsOnly) return sheet.GridRows;
    return sheet.GridRows.filter((r) => r.HasChanges);
  }
}
