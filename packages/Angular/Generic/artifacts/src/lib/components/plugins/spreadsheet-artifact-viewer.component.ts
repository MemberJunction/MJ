import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectorRef,
  Type,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView, UserInfo, type DataSnapshot, type IMetadataProvider } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CreateJsonSnapshot } from '../../snapshot-helpers';
import {
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJConversationEntity,
  MJConversationDetailEntity,
  ArtifactMetadataEngine,
  UserInfoEngine,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SpreadsheetEngine,
  ParseCellAddress,
  FormatCellAddress,
  ColumnIndexToLetter,
  type WorkbookSpec,
  type WorksheetSpec,
  type SpreadsheetCellSpec,
  type SpreadsheetCellFormatType,
  type SpreadsheetRowSpec,
  type SpreadsheetColumnSpec,
  type SpreadsheetLiveTableSpec,
  type SpreadsheetCalculatedColumnSpec,
  type SpreadsheetChartSpec,
  type SpreadsheetChartType,
  type SpreadsheetChartDataset,
  type SpreadsheetEmbeddedArtifactSpec,
  type DocumentBlockSpec,
  type DocumentBlockExecutionResult,
} from '@memberjunction/core-entities';
import { BaseArtifactViewerPluginComponent, IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import { SpreadsheetVersionDiffComponent } from '../version-diff/spreadsheet-version-diff.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { FetchArrayBuffer } from '../previews/office-preview.logic';
import {
  DocumentCollaborationService,
  DocumentCollaborationSession,
  ExtractAnchoredCommentMentions,
  MERGE_CONFLICT_WARNING_MESSAGE,
  type CollaboratorPresence,
  type CollaborationConnectionStatus,
  type CollaborationMergeConflictEvent,
  type DocumentAnchoredThread,
  type DocumentDiffResult,
  type VerifiedArtifactPermissions,
} from '../../services/document-collaboration.service';

/**
 * Workspace mode for the MJ Sheets (`SpreadsheetArtifactViewerPlugin`) studio (`§ 6`).
 */
export type SpreadsheetWorkspaceMode = 'grid' | 'source' | 'diff';

/**
 * Collaborative Spreadsheet (`SpreadsheetArtifactViewerPlugin`) editor and viewer component (`§ 6`).
 *
 * Implements:
 * - Multi-tab `WorkbookSpec` & `WorksheetSpec` grid with stable `RowID`s and `ColumnID`s (`§ 6.2`).
 * - Per-cell & per-worksheet Yjs CRDT co-editing (`sheetCellsByCoord`, `worksheetsById`, `sheetOrder`, `workbookMeta`)
 *   with stable-ID formula compilation (`@CELL(rowId,colId)`, `@RANGE(...)`) so concurrent row/column insertions
 *   and formula edits merge without shifting or corrupting formula references (`Accept #1`).
 * - Viewer-scoped `=MJ.QUERY(...)` and `=MJ.VIEW(...)` custom functions and Bound Live Tables (`EntityView` / `SavedQuery`)
 *   with automatic calculated formula column fill-down (`FormulaTemplate`), `O5` freeze confirmation modal,
 *   and `#MJ_ACCESS_DENIED!` enforcement (`§ 6.3`, `§ 7.2`, `Accept #2`).
 * - Anchored `SheetRange` comments (`AnchorType = 'SheetRange'`, `AnchorKey = '<SheetID>:<A1Range>'`) with
 *   `@SheetsAgent` headless formula evaluation and cell writeback (`§ 3.5`, `Accept #3`).
 * - OpenXML `.xlsx` and `.csv` import/export round-tripping values, formulas (`<f>`), currency/percent `numFmt`
 *   styles, column widths, frozen panes, and stable sheet metadata (`§ 6.4`, `Accept #4`).
 * - Live Range Charts (`bar`, `line`, `area`, `pie`) extracted from worksheet ranges that update live on the sheet
 *   and can be embedded as live `Artifact` blocks in MJ Slides and MJ Docs (`§ 6.3`, `Accept #5`).
 * - Inline MS OLE `Artifact` / `Whiteboard` canvas regions mounted on the worksheet (`§ 3.4.1`).
 */
@Component({
  selector: 'mj-spreadsheet-artifact-viewer',
  standalone: false,
  template: `
    <div class="mj-sheets-shell" data-testid="mj-sheets-shell">
      <!-- Top Workbook Toolbar -->
      <div class="mj-sheets-toolbar" data-testid="sheets-toolbar">
        <div class="mj-sheets-toolbar-group">
          <input
            type="text"
            class="mj-sheets-title-input"
            [ngModel]="Workbook.Title"
            (ngModelChange)="OnWorkbookTitleChanged($event)"
            [readonly]="!CanEdit"
            aria-label="Workbook Title"
            data-testid="sheet-workbook-title"
          />

          <div class="mj-sheets-mode-pills" role="tablist" aria-label="Spreadsheet workspace mode">
            <button
              type="button"
              class="mj-sheets-mode-pill"
              [class.active]="WorkspaceMode === 'grid'"
              (click)="SetWorkspaceMode('grid')"
              data-testid="sheets-mode-grid"
            >
              <i class="fa-solid fa-table-cells"></i> Grid
            </button>
            <button
              type="button"
              class="mj-sheets-mode-pill"
              [class.active]="WorkspaceMode === 'source'"
              (click)="SetWorkspaceMode('source')"
              data-testid="sheets-mode-source"
            >
              <i class="fa-solid fa-code"></i> Source
            </button>
            <button
              type="button"
              class="mj-sheets-mode-pill"
              [class.active]="WorkspaceMode === 'diff'"
              (click)="SetWorkspaceMode('diff')"
              data-testid="sheets-mode-diff"
            >
              <i class="fa-solid fa-code-compare"></i> Diff
            </button>
          </div>
        </div>

        @if (WorkspaceMode === 'grid' && CanEdit) {
          <!-- Formatting & Structure Controls -->
          <div class="mj-sheets-toolbar-group">
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="IsActiveCellBold"
              (click)="ToggleActiveCellBold()"
              title="Bold"
              data-testid="sheet-format-bold-btn"
            >
              <i class="fa-solid fa-bold"></i>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ActiveCellFormatType === 'currency'"
              (click)="ApplyActiveCellFormat('currency')"
              title="Format as Currency ($#,##0.00)"
              data-testid="sheet-format-currency-btn"
            >
              <span>$</span>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ActiveCellFormatType === 'percent'"
              (click)="ApplyActiveCellFormat('percent')"
              title="Format as Percent (0.0%)"
              data-testid="sheet-format-percent-btn"
            >
              <span>%</span>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ActiveCellFormatType === 'integer'"
              (click)="ApplyActiveCellFormat('integer')"
              title="Format as Integer (#,##0)"
              data-testid="sheet-format-integer-btn"
            >
              <span>#,##0</span>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ActiveCellFormatType === 'date'"
              (click)="ApplyActiveCellFormat('date')"
              title="Format as Date (yyyy-mm-dd)"
              data-testid="sheet-format-date-btn"
            >
              <i class="fa-regular fa-calendar"></i>
            </button>

            <span class="mj-sheets-divider"></span>

            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="InsertRowAtActive()"
              title="Insert Row Above Active Cell"
              data-testid="sheet-insert-row-btn"
            >
              <i class="fa-solid fa-plus"></i> Row
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="InsertColumnAtActive()"
              title="Insert Column Left of Active Cell"
              data-testid="sheet-insert-col-btn"
            >
              <i class="fa-solid fa-plus"></i> Col
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="SortActiveColumn('asc')"
              title="Sort Active Column A → Z"
              data-testid="sheet-sort-asc-btn"
            >
              <i class="fa-solid fa-arrow-down-a-z"></i>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="SortActiveColumn('desc')"
              title="Sort Active Column Z → A"
              data-testid="sheet-sort-desc-btn"
            >
              <i class="fa-solid fa-arrow-down-z-a"></i>
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ActiveSheet.FrozenRows > 0"
              (click)="ToggleFreezeHeaderRow()"
              title="Freeze Top Header Row"
              data-testid="sheet-freeze-header-btn"
            >
              <i class="fa-solid fa-snowflake"></i> Freeze Header
            </button>

            <span class="mj-sheets-divider"></span>

            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="OpenAddLiveTableModal()"
              title="Bind Live MJ Entity View or Saved Query Table"
              data-testid="sheet-add-live-table-btn"
            >
              <i class="fa-solid fa-table-list"></i> + Live Table
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="InsertMjQueryFormula()"
              title="Insert =MJ.QUERY(...) Custom Function"
              data-testid="sheet-insert-mj-query-btn"
            >
              <i class="fa-solid fa-database"></i> =MJ.QUERY
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="InsertMjViewFormula()"
              title="Insert =MJ.VIEW(...) Custom Function"
              data-testid="sheet-insert-mj-view-btn"
            >
              <i class="fa-solid fa-layer-group"></i> =MJ.VIEW
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="AddRangeChartFromSelection()"
              title="Create Range Chart from Selected Range"
              data-testid="sheet-add-chart-btn"
            >
              <i class="fa-solid fa-chart-column"></i> + Range Chart
            </button>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)="AddEmbeddedWhiteboardOnSheet()"
              title="Embed Interactive Whiteboard Canvas"
              data-testid="sheet-add-whiteboard-btn"
            >
              <i class="fa-solid fa-chalkboard"></i> + Whiteboard
            </button>
          </div>
        }

        <!-- Right-side Refresh, Import/Export, Save Version, Comments & Presence -->
        <div class="mj-sheets-toolbar-group mj-sheets-toolbar-right">
          <button
            type="button"
            class="mj-sheets-tool-btn"
            (click)="RefreshAllLiveData(true)"
            [disabled]="IsRefreshingData"
            title="Refresh All Bound Live Tables and =MJ.* Custom Functions"
            data-testid="sheet-refresh-data-btn"
          >
            <i class="fa-solid fa-rotate" [class.fa-spin]="IsRefreshingData"></i>
            <span>Refresh Data</span>
          </button>

          @if (CanEdit) {
            <button
              type="button"
              class="mj-sheets-tool-btn"
              (click)=" fileInput.click()"
              title="Import .xlsx or .csv Workbook"
              data-testid="sheet-import-btn"
            >
              <i class="fa-solid fa-file-import"></i> Import
            </button>
            <input
              #fileInput
              type="file"
              accept=".xlsx,.csv"
              style="display: none"
              (change)="OnImportFileSelected($event)"
              data-testid="sheet-import-file-input"
            />
          }

          <button
            type="button"
            class="mj-sheets-tool-btn"
            (click)="ExportWorkbookAsXlsx()"
            title="Export Workbook as Excel (.xlsx)"
            data-testid="sheet-export-xlsx-btn"
          >
            <i class="fa-solid fa-file-excel"></i> .xlsx
          </button>
          <button
            type="button"
            class="mj-sheets-tool-btn"
            (click)="ExportActiveSheetAsCsv()"
            title="Export Active Sheet as .csv"
            data-testid="sheet-export-csv-btn"
          >
            <i class="fa-solid fa-file-csv"></i> .csv
          </button>

          @if (CanEdit) {
            <button
              type="button"
              class="mj-sheets-tool-btn mj-sheets-save-btn"
              (click)="SaveNewArtifactVersion()"
              [disabled]="IsSavingVersion || !HasUnsavedChanges"
              [title]="HasUnsavedChanges ? 'Save changes as a new version' : 'No unsaved changes to save'"
              data-testid="sheet-save-version-btn"
            >
              <i class="fa-solid fa-floppy-disk"></i>
              <span>{{ !HasUnsavedChanges && LastSavedVersionNumber ? 'Saved v' + LastSavedVersionNumber : 'Save Version' }}</span>
            </button>
          }

          <button
            type="button"
            class="mj-sheets-tool-btn"
            [class.active]="ShowCommentsDrawer"
            (click)="ToggleCommentsDrawer()"
            title="Toggle Cell & Range Comments"
            data-testid="sheet-toggle-comments-btn"
          >
            <i class="fa-regular fa-comments"></i>
            <span>Comments ({{ OpenThreadCount }})</span>
          </button>

          <div
            class="mj-sheets-collab-badge"
            [attr.data-status]="ConnectionStatus"
            data-testid="sheets-collab-status"
          >
            <span class="mj-sheets-collab-dot"></span>
            <span>{{ GetCollaborationStatusLabel() }}</span>
            @if (ConnectionStatus === 'error') {
              <button
                type="button"
                class="mj-sheets-collab-retry-btn"
                aria-label="Retry live collaboration sync"
                data-testid="sheets-collab-retry-btn"
                (click)="RetryLiveCollaboration()"
              >
                Retry
              </button>
            }
          </div>

          @if (Collaborators.length > 0) {
            <div class="mj-sheets-presence-strip" data-testid="sheets-presence-strip">
              @for (collab of Collaborators; track collab.ClientID) {
                <span
                  class="mj-sheets-presence-avatar"
                  [style.background]="collab.Color"
                  [title]="collab.Name + (collab.ActiveBlockID ? ' (' + collab.ActiveBlockID + ')' : '')"
                >
                  {{ GetInitials(collab.Name) }}
                </span>
              }
            </div>
          }
        </div>
      </div>

      @if (LiveSyncUnavailable) {
        <div
          class="mj-sheets-status-banner mj-sheets-status-banner--readonly"
          role="status"
          data-testid="sheets-live-sync-unavailable-banner"
        >
          <i class="fa-solid fa-plug-circle-xmark"></i>
          <span>Live collaborative sync is unavailable on this server — viewing in read-only mode.</span>
        </div>
      }

      @if (PermissionVerifyError) {
        <div
          class="mj-sheets-status-banner mj-sheets-status-banner--warning"
          role="alert"
          data-testid="sheets-permission-verify-error-banner"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Couldn't verify permissions — Retry</span>
          <button
            type="button"
            class="mj-sheets-tool-btn mj-sheets-banner-retry"
            data-testid="sheets-permission-retry-btn"
            (click)="RetryVerifyPermissions()"
          >
            Retry
          </button>
        </div>
      }

      @if (StatusBannerMessage) {
        <div class="mj-sheets-status-banner" data-testid="sheets-status-banner">
          <i class="fa-solid fa-circle-info"></i>
          <span>{{ StatusBannerMessage }}</span>
          <button type="button" class="mj-sheets-banner-close" (click)="StatusBannerMessage = ''">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      }

      @if (WorkspaceMode === 'grid') {
        <!-- Formula & Range Bar -->
        <div class="mj-sheets-formula-bar" data-testid="sheets-formula-bar">
          <div class="mj-sheets-cell-coord-box" data-testid="sheet-active-cell-address">
            {{ ActiveCellAddress }}
          </div>
          <input
            type="text"
            class="mj-sheets-range-input"
            [(ngModel)]="SelectedRange"
            placeholder="Range (e.g. B2:B6)"
            aria-label="Selected Cell Range"
            data-testid="sheet-selected-range-input"
          />
          <span class="mj-sheets-fx-label">fx</span>
          <input
            type="text"
            class="mj-sheets-formula-input"
            [(ngModel)]="FormulaBarInput"
            [readonly]="!CanEdit"
            (keydown.enter)="CommitFormulaBarInput()"
            placeholder="Enter value, formula (=SUM(B2:B9)), or =MJ.QUERY(&quot;Query Name&quot;, param)"
            aria-label="Formula Bar Input"
            data-testid="sheet-formula-input"
          />
          @if (CanEdit) {
            <button
              type="button"
              class="mj-sheets-tool-btn mj-sheets-apply-btn"
              (click)="CommitFormulaBarInput()"
              data-testid="sheet-formula-apply-btn"
            >
              <i class="fa-solid fa-check"></i> Apply
            </button>
          }
          @if (ActiveCellSpec?.FormulaStable) {
            <span
              class="mj-sheets-stable-formula-badge"
              [title]="'Stable ID Formula: ' + ActiveCellSpec?.FormulaStable"
              data-testid="sheet-stable-formula-badge"
            >
              <i class="fa-solid fa-link"></i> {{ ActiveCellSpec?.FormulaStable }}
            </span>
          }
        </div>

        <!-- Main Body: Grid + Worksheet Objects + Optional Right Comments Drawer -->
        <div class="mj-sheets-workspace-body">
          <div class="mj-sheets-main-pane">
            @if (FallbackXlsxBytes) {
              <div class="mj-sheets-grid-scroll" data-testid="sheets-xlsx-readonly-fallback">
                <mj-xlsx-preview [ArrayBuffer]="FallbackXlsxBytes"></mj-xlsx-preview>
              </div>
            } @else {
            <!-- Interactive A1 Grid -->
            <div class="mj-sheets-grid-scroll" data-testid="sheets-grid-container">
              <table class="mj-sheets-grid-table" role="grid" [attr.aria-label]="ActiveSheet.Name">
                <thead>
                  <tr>
                    <th class="mj-sheets-corner-header">#</th>
                    @for (col of VisibleColumns; track col.ColumnID) {
                      <th
                        class="mj-sheets-col-header"
                        [class.selected]="col.Letter === ActiveColumnLetter"
                        [style.min-width.px]="(col.Width ?? 14) * 8"
                        [attr.data-col-id]="col.ColumnID"
                        [attr.data-testid]="'sheet-col-header-' + col.Letter"
                        (click)="SelectColumnHeader(col.Letter)"
                      >
                        <div class="mj-sheets-col-header-inner">
                          <span class="mj-sheets-col-letter">{{ col.Letter }}</span>
                          @if (col.Header) {
                            <span class="mj-sheets-col-custom-label">{{ col.Header }}</span>
                          }
                          @if (ActiveSheet.SortSpec?.ColumnLetter === col.Letter) {
                            <i
                              class="fa-solid"
                              [class.fa-caret-up]="ActiveSheet.SortSpec?.Direction === 'asc'"
                              [class.fa-caret-down]="ActiveSheet.SortSpec?.Direction === 'desc'"
                            ></i>
                          }
                        </div>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of VisibleRows; track row.RowID) {
                    <tr
                      [class.mj-sheets-frozen-row]="row.Index <= ActiveSheet.FrozenRows"
                      [attr.data-row-id]="row.RowID"
                    >
                      <td
                        class="mj-sheets-row-header"
                        [class.selected]="row.Index === ActiveRowIndex"
                        [attr.data-testid]="'sheet-row-header-' + row.Index"
                      >
                        {{ row.Index }}
                      </td>
                      @for (col of VisibleColumns; track col.ColumnID) {
                        @let addr = col.Letter + row.Index;
                        @let cell = ActiveSheet.Cells[addr];
                        @let condTone = GetConditionalTone(cell);
                        <td
                          class="mj-sheets-cell"
                          [class.active]="addr === ActiveCellAddress"
                          [class.in-range]="IsAddressInSelectedRange(row.Index, col.Index)"
                          [class.has-formula]="!!cell?.Formula"
                          [class.is-bold]="!!cell?.Style?.Bold"
                          [class.is-italic]="!!cell?.Style?.Italic"
                          [class.align-right]="IsNumericOrRightAligned(cell)"
                          [class.align-center]="cell?.Style?.HorizontalAlign === 'center'"
                          [class.access-denied]="!!cell?.AccessDenied"
                          [class.tone-success]="condTone === 'success'"
                          [class.tone-warning]="condTone === 'warning'"
                          [class.tone-danger]="condTone === 'danger'"
                          [class.tone-info]="condTone === 'info'"
                          [attr.data-row-id]="row.RowID"
                          [attr.data-col-id]="col.ColumnID"
                          [attr.data-address]="addr"
                          [attr.data-testid]="'sheet-cell-' + addr"
                          (click)="SelectCell(row.Index, col.Index, $event)"
                          (dblclick)="BeginInlineCellEdit(row.Index, col.Index)"
                        >
                          @if (InlineEditingAddress === addr && CanEdit) {
                            <input
                              type="text"
                              class="mj-sheets-inline-cell-input"
                              [(ngModel)]="InlineEditValue"
                              (blur)="CommitInlineCellEdit()"
                              (keydown.enter)="CommitInlineCellEdit()"
                              (keydown.escape)="CancelInlineCellEdit()"
                              data-testid="sheet-inline-cell-input"
                            />
                          } @else {
                            <div class="mj-sheets-cell-content">
                              @if (cell?.AccessDenied) {
                                <span
                                  class="mj-sheets-access-denied-pill"
                                  [title]="cell?.ErrorMessage || 'Viewer access denied'"
                                  [attr.data-testid]="'sheet-cell-denied-' + addr"
                                >
                                  <i class="fa-solid fa-lock"></i> #MJ_ACCESS_DENIED!
                                </span>
                              } @else {
                                <span class="mj-sheets-cell-text">{{ GetCellDisplayText(cell) }}</span>
                              }
                              @if (cell?.Formula) {
                                <span class="mj-sheets-formula-corner" [title]="cell?.Formula || ''"></span>
                              }
                              @if (cell?.ValidationError) {
                                <span
                                  class="mj-sheets-validation-badge"
                                  [title]="cell?.ValidationError || ''"
                                >
                                  !
                                </span>
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

            <!-- Bound Live Tables, Range Charts & Inline OLE Whiteboards Strip -->
            @if (
              (ActiveSheet.LiveTables && ActiveSheet.LiveTables.length > 0) ||
              (ActiveSheet.Charts && ActiveSheet.Charts.length > 0) ||
              (ActiveSheet.EmbeddedArtifacts && ActiveSheet.EmbeddedArtifacts.length > 0)
            ) {
              <div class="mj-sheets-objects-strip" data-testid="sheets-objects-strip">
                <!-- Bound Live Tables -->
                @if (ActiveSheet.LiveTables && ActiveSheet.LiveTables.length > 0) {
                  <div class="mj-sheets-objects-section" data-testid="sheets-live-tables-section">
                    <div class="mj-sheets-section-header">
                      <i class="fa-solid fa-table-list"></i>
                      <span>Bound MJ Live Tables ({{ ActiveSheet.LiveTables.length }})</span>
                    </div>
                    <div class="mj-sheets-cards-row">
                      @for (table of ActiveSheet.LiveTables; track table.TableID) {
                        <div
                          class="mj-sheets-object-card"
                          [class.has-error]="!!table.AccessDenied"
                          [attr.data-testid]="'sheet-live-table-card-' + table.TableID"
                        >
                          <div class="mj-sheets-card-top">
                            <div>
                              <strong class="mj-sheets-card-title">{{ table.Title }}</strong>
                              <span class="mj-sheets-card-meta">
                                {{ table.SourceType }}:
                                {{ table.EntityName || table.QueryName || table.QueryID }}
                                &#64; {{ table.AnchorCell }}
                              </span>
                            </div>
                            <span
                              class="mj-sheets-mode-badge"
                              [class.frozen]="table.Mode === 'Frozen'"
                              [attr.data-testid]="'sheet-table-mode-' + table.TableID"
                            >
                              @if (table.Mode === 'Frozen') {
                                <i class="fa-solid fa-snowflake"></i> Frozen Snapshot
                              } @else {
                                <i class="fa-solid fa-bolt"></i> Live (Viewer-Scoped)
                              }
                            </span>
                          </div>

                          @if (table.CalculatedColumns && table.CalculatedColumns.length > 0) {
                            <div class="mj-sheets-calc-cols">
                              @for (cc of table.CalculatedColumns; track cc.Header) {
                                <span class="mj-sheets-calc-pill">
                                  <i class="fa-solid fa-calculator"></i>
                                  {{ cc.Header }}: <code>{{ cc.FormulaTemplate }}</code>
                                </span>
                              }
                            </div>
                          }

                          @if (table.Mode === 'Frozen' && table.FrozenSnapshot) {
                            @if (IsLiveTableSnapshotVerified(table)) {
                              <div
                                class="mj-sheets-table-provenance"
                                [attr.data-testid]="'sheet-frozen-provenance-' + table.TableID"
                              >
                                <i class="fa-solid fa-shield-halved"></i>
                                <span>
                                  Frozen snapshot captured at {{ table.FrozenSnapshot.FrozenAt }}
                                  @if (table.FrozenSnapshot.FrozenByUserName || table.FrozenSnapshot.FrozenByUserID) {
                                    by
                                    <strong>{{
                                      table.FrozenSnapshot.FrozenByUserName || table.FrozenSnapshot.FrozenByUserID
                                    }}</strong>
                                  }
                                </span>
                              </div>
                            } @else {
                              <div
                                class="mj-sheets-table-error"
                                data-testid="unverified-snapshot-banner"
                                [attr.data-table-id]="table.TableID"
                              >
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                <span>Unverified Snapshot — signature missing or invalid</span>
                              </div>
                            }
                          }

                          @if (table.AccessDenied || table.LastError) {
                            <div
                              class="mj-sheets-table-error"
                              [attr.data-testid]="'sheet-table-error-' + table.TableID"
                            >
                              <i class="fa-solid fa-shield-halved"></i>
                              <span>{{ table.LastError || 'Access denied for current viewer.' }}</span>
                            </div>
                          }

                          <div class="mj-sheets-card-actions">
                            <span class="mj-sheets-row-count">
                              {{ table.LastRowCount ?? 0 }} rows
                              @if (table.FrozenSnapshot?.FrozenAt) {
                                · Frozen {{ table.FrozenSnapshot?.FrozenAt | slice: 0 : 19 }}
                              }
                            </span>
                            <div class="mj-sheets-action-btns">
                              <button
                                type="button"
                                class="mj-sheets-mini-btn"
                                (click)="RefreshSingleLiveTable(table)"
                                [attr.data-testid]="'sheet-table-refresh-' + table.TableID"
                              >
                                <i class="fa-solid fa-rotate"></i> Refresh
                              </button>
                              @if (CanEdit) {
                                @if (table.Mode === 'Live') {
                                  <button
                                    type="button"
                                    class="mj-sheets-mini-btn"
                                    (click)="PromptFreezeLiveTable(table)"
                                    [attr.data-testid]="'sheet-table-freeze-' + table.TableID"
                                  >
                                    <i class="fa-solid fa-snowflake"></i> Freeze Snapshot
                                  </button>
                                } @else {
                                  <button
                                    type="button"
                                    class="mj-sheets-mini-btn"
                                    (click)="UnfreezeLiveTable(table)"
                                    [attr.data-testid]="'sheet-table-unfreeze-' + table.TableID"
                                  >
                                    <i class="fa-solid fa-bolt"></i> Unfreeze
                                  </button>
                                }
                              }
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                <!-- Range Charts (§ 6.3, Accept #5) -->
                @if (ActiveSheet.Charts && ActiveSheet.Charts.length > 0) {
                  <div class="mj-sheets-objects-section" data-testid="sheets-charts-section">
                    <div class="mj-sheets-section-header">
                      <i class="fa-solid fa-chart-column"></i>
                      <span>Live Range Charts ({{ ActiveSheet.Charts.length }})</span>
                    </div>
                    <div class="mj-sheets-cards-row">
                      @for (chart of ActiveSheet.Charts; track chart.ChartID) {
                        @let dataset = GetChartDataset(chart);
                        <div
                          class="mj-sheets-object-card mj-sheets-chart-card"
                          [attr.data-testid]="'sheet-chart-card-' + chart.ChartID"
                        >
                          <div class="mj-sheets-card-top">
                            <div>
                              <strong class="mj-sheets-card-title">{{ chart.Title }}</strong>
                              <span class="mj-sheets-card-meta">
                                Range: <code>{{ chart.SourceRange }}</code> · {{ chart.ChartType | uppercase }}
                              </span>
                            </div>
                            <div class="mj-sheets-action-btns">
                              <select
                                class="mj-sheets-mini-select"
                                [ngModel]="chart.ChartType"
                                (ngModelChange)="OnChartTypeChanged(chart, $event)"
                                [disabled]="!CanEdit"
                                [attr.data-testid]="'sheet-chart-type-' + chart.ChartID"
                              >
                                <option value="bar">Bar</option>
                                <option value="line">Line</option>
                                <option value="area">Area</option>
                                <option value="pie">Pie</option>
                              </select>
                              <button
                                type="button"
                                class="mj-sheets-mini-btn"
                                (click)="CopySlideBlockDescriptorForChart(chart)"
                                title="Copy Live Artifact Block JSON for MJ Slides / MJ Docs"
                                [attr.data-testid]="'sheet-chart-copy-block-' + chart.ChartID"
                              >
                                <i class="fa-solid fa-share-from-square"></i> Embed in Slide/Doc
                              </button>
                            </div>
                          </div>

                          @if (dataset && dataset.Categories.length > 0 && dataset.Series.length > 0) {
                            <div
                              class="mj-sheets-chart-Stage"
                              [attr.data-testid]="'sheet-chart-svg-' + chart.ChartID"
                            >
                              <svg viewBox="0 0 360 150" class="mj-sheets-chart-svg">
                                @for (cat of dataset.Categories; track cat; let idx = $index) {
                                  @let barVal = dataset.Series[0].Values[idx];
                                  @let maxVal = GetChartMaxValue(dataset);
                                  @let barHeight = maxVal > 0 ? (barVal / maxVal) * 100 : 0;
                                  @let barWidth = 280 / dataset.Categories.length - 10;
                                  @let xPos = 45 + idx * (280 / dataset.Categories.length);
                                  @let yPos = 120 - barHeight;
                                  <g>
                                    <rect
                                      [attr.x]="xPos"
                                      [attr.y]="yPos"
                                      [attr.width]="barWidth > 8 ? barWidth : 8"
                                      [attr.height]="barHeight"
                                      rx="3"
                                      fill="var(--mj-brand-primary)"
                                    />
                                    <text
                                      [attr.x]="xPos + (barWidth > 8 ? barWidth / 2 : 4)"
                                      [attr.y]="yPos - 4"
                                      text-anchor="middle"
                                      font-size="9"
                                      fill="var(--mj-text-primary)"
                                      [attr.data-testid]="'sheet-chart-val-' + chart.ChartID + '-' + idx"
                                    >
                                      {{ barVal }}
                                    </text>
                                    <text
                                      [attr.x]="xPos + (barWidth > 8 ? barWidth / 2 : 4)"
                                      y="136"
                                      text-anchor="middle"
                                      font-size="9"
                                      fill="var(--mj-text-secondary)"
                                    >
                                      {{ cat }}
                                    </text>
                                  </g>
                                }
                              </svg>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }

                <!-- Embedded Artifacts / Whiteboards (§ 3.4.1) -->
                @if (ActiveSheet.EmbeddedArtifacts && ActiveSheet.EmbeddedArtifacts.length > 0) {
                  <div class="mj-sheets-objects-section" data-testid="sheets-embedded-artifacts-section">
                    <div class="mj-sheets-section-header">
                      <i class="fa-solid fa-chalkboard"></i>
                      <span>Embedded Artifacts ({{ ActiveSheet.EmbeddedArtifacts.length }})</span>
                    </div>
                    <div class="mj-sheets-cards-row">
                      @for (emb of ActiveSheet.EmbeddedArtifacts; track emb.EmbedID) {
                        @let childVer = EmbeddedArtifactVersions[emb.ArtifactID];
                        <div
                          class="mj-sheets-object-card mj-sheets-ole-card"
                          [attr.data-testid]="'sheet-embedded-artifact-' + emb.EmbedID"
                        >
                          <div class="mj-sheets-card-top">
                            <div>
                              <strong class="mj-sheets-card-title">{{ emb.Title }}</strong>
                              <span class="mj-sheets-card-meta">
                                {{ emb.ArtifactTypeName }} · Anchor {{ emb.AnchorCell }} ·
                                Delegate Inherited
                              </span>
                            </div>
                            <span class="mj-sheets-mode-badge">
                              <i class="fa-solid fa-pen-nib"></i> Inline Canvas
                            </span>
                          </div>
                          <div class="mj-sheets-ole-host" [attr.data-testid]="'sheet-ole-host-' + emb.EmbedID">
                            @if (childVer) {
                              <mj-artifact-type-plugin-viewer
                                [Provider]="Provider"
                                [artifactVersion]="childVer"
                                [ArtifactTypeName]="emb.ArtifactTypeName"
                                [readonly]="!CanEdit"
                                (ContentCommitted)="OnEmbeddedArtifactCommitted(emb, $event)"
                              ></mj-artifact-type-plugin-viewer>
                            } @else {
                              <div class="mj-sheets-ole-fallback">
                                <i class="fa-solid fa-diagram-project"></i>
                                <span>Loading {{ emb.ArtifactTypeName }} ({{ emb.Title }})…</span>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Bottom Multi-Worksheet Tab Bar -->
            <div class="mj-sheets-tab-bar" data-testid="sheets-tab-bar">
              <div class="mj-sheets-tabs-list" role="tablist">
                @for (ws of Workbook.Worksheets; track ws.SheetID) {
                  <div
                    class="mj-sheets-tab-pill"
                    [class.active]="ws.SheetID === ActiveSheet.SheetID"
                    (click)="SelectWorksheet(ws.SheetID)"
                    [attr.data-testid]="'sheet-tab-' + ws.SheetID"
                  >
                    <i class="fa-solid fa-table"></i>
                    <span>{{ ws.Name }}</span>
                    @if (CanEdit && Workbook.Worksheets.length > 1) {
                      <button
                        type="button"
                        class="mj-sheets-tab-close"
                        (click)="DeleteWorksheetTab(ws.SheetID, $event)"
                        title="Delete Worksheet"
                        [attr.data-testid]="'sheet-delete-tab-' + ws.SheetID"
                      >
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    }
                  </div>
                }
                @if (CanEdit) {
                  <button
                    type="button"
                    class="mj-sheets-add-tab-btn"
                    (click)="AddNewWorksheetTab()"
                    title="Add Worksheet"
                    data-testid="sheet-add-tab-btn"
                  >
                    <i class="fa-solid fa-plus"></i> Add Sheet
                  </button>
                }
              </div>

                <div class="mj-sheets-tab-stats" data-testid="sheets-tab-stats">
                  <span>Cells: {{ PopulatedCellCount }}</span>
                  <span>Formulas: {{ FormulaCellCount }}</span>
                  <span>Live Tables: {{ ActiveSheet.LiveTables.length }}</span>
                  <span>Charts: {{ ActiveSheet.Charts.length }}</span>
                </div>
              </div>
            }
          </div>

          <!-- Right Anchored SheetRange Comments Drawer -->
          @if (ShowCommentsDrawer) {
            <aside class="mj-sheets-comments-drawer" data-testid="sheets-comments-drawer">
              <div class="mj-sheets-drawer-header">
                <div>
                  <h4>Anchored Range Comments</h4>
                  <span class="mj-sheets-drawer-subtitle">
                    Pinned to <code>{{ ActiveSheet.Name }}!{{ SelectedRange }}</code>
                  </span>
                </div>
                <button
                  type="button"
                  class="mj-sheets-mini-btn"
                  (click)="ShowCommentsDrawer = false"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              @if (CanComment) {
                <div class="mj-sheets-new-comment-box">
                  <textarea
                    rows="3"
                    class="mj-sheets-comment-textarea"
                    [(ngModel)]="NewCommentText"
                    placeholder="Add an anchored comment on {{ SelectedRange }}..."
                    data-testid="sheet-comment-input"
                  ></textarea>
                  <div class="mj-sheets-comment-actions">
                    <span class="mj-sheets-anchor-preview">
                      Anchor: <code>{{ ActiveSheet.SheetID }}:{{ SelectedRange }}</code>
                    </span>
                    <button
                      type="button"
                      class="mj-sheets-tool-btn mj-sheets-save-btn"
                      (click)="CreateAnchoredSheetRangeComment()"
                      [disabled]="!NewCommentText.trim()"
                      data-testid="sheet-post-comment-btn"
                    >
                      <i class="fa-solid fa-paper-plane"></i> Post
                    </button>
                  </div>
                </div>
              }

              <div class="mj-sheets-threads-list" data-testid="sheet-threads-list">
                @for (thread of AnchoredThreads; track thread.ConversationID) {
                  <div
                    class="mj-sheets-thread-card"
                    [class.resolved]="thread.Status === 'Resolved'"
                    [attr.data-testid]="'sheet-thread-' + thread.ConversationID"
                  >
                    <div class="mj-sheets-thread-header">
                      <span class="mj-sheets-thread-anchor" (click)="FocusRangeFromAnchorKey(thread.AnchorKey)">
                        <i class="fa-solid fa-thumbtack"></i> {{ thread.AnchorLabel }}
                      </span>
                      @if (thread.Status === 'Open') {
                        <button
                          type="button"
                          class="mj-sheets-mini-btn"
                          (click)="ResolveAnchoredThread(thread)"
                          [attr.data-testid]="'sheet-resolve-thread-' + thread.ConversationID"
                        >
                          Resolve
                        </button>
                      } @else {
                        <span class="mj-sheets-resolved-label">Resolved</span>
                      }
                    </div>
                    @for (msg of thread.Messages; track msg.DetailID) {
                      <div class="mj-sheets-thread-msg" [class.agent-msg]="msg.Role === 'Agent'">
                        <div class="mj-sheets-msg-meta">
                          <strong>{{ msg.UserName }}</strong>
                          <span>{{ msg.Role }}</span>
                        </div>
                        <p class="mj-sheets-msg-body">{{ msg.Message }}</p>
                      </div>
                    }
                  </div>
                }
              </div>
            </aside>
          }
        </div>
      }

      @if (WorkspaceMode === 'source') {
        <div class="mj-sheets-source-pane" data-testid="sheets-source-pane">
          <textarea
            class="mj-sheets-source-textarea"
            [(ngModel)]="SourceJsonText"
            [readonly]="!CanEdit"
            data-testid="sheets-source-textarea"
          ></textarea>
          @if (CanEdit) {
            <div class="mj-sheets-source-actions">
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-save-btn"
                (click)="ApplySourceJsonChanges()"
                data-testid="sheets-apply-source-btn"
              >
                <i class="fa-solid fa-check"></i> Apply Workbook JSON
              </button>
            </div>
          }
        </div>
      }

      @if (WorkspaceMode === 'diff') {
        <div class="mj-sheets-diff-pane" data-testid="sheets-diff-pane">
          <div class="mj-sheets-diff-summary" data-testid="sheets-diff-summary">
            <span class="diff-added">+{{ DiffResult.AddedLines }} added</span>
            <span class="diff-removed">-{{ DiffResult.RemovedLines }} removed</span>
            <span class="diff-same">{{ DiffResult.UnchangedLines }} unchanged</span>
          </div>
          <div class="mj-sheets-diff-lines">
            @for (line of DiffResult.Lines; track $index) {
              <div class="mj-sheets-diff-line" [attr.data-diff-type]="line.Type">
                <span class="mj-sheets-diff-num">{{ line.NewLineNumber ?? line.OldLineNumber }}</span>
                <pre class="mj-sheets-diff-code">{{ line.Content }}</pre>
              </div>
            }
          </div>
        </div>
      }

      <!-- O5 Freeze Live Table Confirmation Modal -->
      @if (PendingFreezeTable) {
        <div class="mj-sheets-modal-backdrop" data-testid="sheets-freeze-modal">
          <div class="mj-sheets-modal-dialog" role="dialog" aria-modal="true">
            <div class="mj-sheets-modal-header">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <h3>Freeze Live Table Snapshot</h3>
            </div>
            <div class="mj-sheets-modal-body">
              <p>
                Freezing <strong>{{ PendingFreezeTable.Title }}</strong> captures the rows currently
                visible under <strong>your</strong> MemberJunction permissions into the workbook JSON
                so every collaborator with read access to this spreadsheet can view those numbers.
              </p>
              <label class="mj-sheets-confirm-checkbox">
                <input
                  type="checkbox"
                  [(ngModel)]="FreezeConfirmedChecked"
                  data-testid="sheet-freeze-confirm-checkbox"
                />
                <span>
                  I understand that freezing embeds my current viewer-scoped data snapshot into this
                  spreadsheet for all artifact readers.
                </span>
              </label>
            </div>
            <div class="mj-sheets-modal-footer">
              <button
                type="button"
                class="mj-sheets-tool-btn"
                (click)="CancelFreezeLiveTable()"
                data-testid="sheet-freeze-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-save-btn"
                [disabled]="!FreezeConfirmedChecked"
                (click)="ConfirmFreezeLiveTable()"
                data-testid="sheet-freeze-confirm-btn"
              >
                <i class="fa-solid fa-snowflake"></i> Confirm Freeze Snapshot
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Add Bound Live Table Modal -->
      @if (ShowAddLiveTableModal) {
        <div class="mj-sheets-modal-backdrop" data-testid="sheets-live-table-modal">
          <div class="mj-sheets-modal-dialog" role="dialog" aria-modal="true">
            <div class="mj-sheets-modal-header">
              <i class="fa-solid fa-table-list"></i>
              <h3>Bind Live MJ Entity View or Saved Query</h3>
            </div>
            <div class="mj-sheets-modal-body">
              <div class="mj-sheets-form-row">
                <label>Table Title</label>
                <input
                  type="text"
                  class="mj-sheets-modal-input"
                  [(ngModel)]="NewLiveTableTitle"
                  data-testid="sheet-new-table-title"
                />
              </div>
              <div class="mj-sheets-form-row">
                <label>Source Kind</label>
                <select
                  class="mj-sheets-modal-input"
                  [(ngModel)]="NewLiveTableSourceType"
                  data-testid="sheet-new-table-source-type"
                >
                  <option value="EntityView">Entity View</option>
                  <option value="SavedQuery">Saved Query</option>
                </select>
              </div>
              @if (NewLiveTableSourceType === 'EntityView') {
                <div class="mj-sheets-form-row">
                  <label>Entity Name</label>
                  <input
                    type="text"
                    class="mj-sheets-modal-input"
                    [(ngModel)]="NewLiveTableEntityName"
                    placeholder="e.g. AI Agents"
                    data-testid="sheet-new-table-entity"
                  />
                </div>
                <div class="mj-sheets-form-row">
                  <label>Extra Filter (optional)</label>
                  <input
                    type="text"
                    class="mj-sheets-modal-input"
                    [(ngModel)]="NewLiveTableExtraFilter"
                    placeholder="e.g. Status = 'Active'"
                    data-testid="sheet-new-table-filter"
                  />
                </div>
              } @else {
                <div class="mj-sheets-form-row">
                  <label>Saved Query Name</label>
                  <input
                    type="text"
                    class="mj-sheets-modal-input"
                    [(ngModel)]="NewLiveTableQueryName"
                    placeholder="e.g. Renewals by Month"
                    data-testid="sheet-new-table-query"
                  />
                </div>
              }
              <div class="mj-sheets-form-row">
                <label>Anchor Cell</label>
                <input
                  type="text"
                  class="mj-sheets-modal-input"
                  [(ngModel)]="NewLiveTableAnchorCell"
                  placeholder="A1"
                  data-testid="sheet-new-table-anchor"
                />
              </div>
              <div class="mj-sheets-form-row">
                <label>Calculated Formula Column Header (optional)</label>
                <input
                  type="text"
                  class="mj-sheets-modal-input"
                  [(ngModel)]="NewLiveTableCalcHeader"
                  placeholder="e.g. Projected ARR"
                  data-testid="sheet-new-table-calc-header"
                />
              </div>
              <div class="mj-sheets-form-row">
                <label>Calculated Formula Template (optional, use &#123;ROW&#125;)</label>
                <input
                  type="text"
                  class="mj-sheets-modal-input"
                  [(ngModel)]="NewLiveTableCalcFormula"
                  placeholder="e.g. =ROUND(B{ROW}*1.15, 2)"
                  data-testid="sheet-new-table-calc-formula"
                />
              </div>
            </div>
            <div class="mj-sheets-modal-footer">
              <button
                type="button"
                class="mj-sheets-tool-btn"
                (click)="ShowAddLiveTableModal = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-save-btn"
                (click)="ConfirmAddLiveTable()"
                data-testid="sheet-confirm-add-table-btn"
              >
                <i class="fa-solid fa-plus"></i> Bind & Refresh Table
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .mj-sheets-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-family: var(--mj-font-family, Inter, system-ui, sans-serif);
        overflow: hidden;
      }

      .mj-sheets-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-sheets-toolbar-group {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-sheets-toolbar-right {
        margin-left: auto;
      }

      .mj-sheets-title-input {
        font-size: 14px;
        font-weight: 600;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        padding: 5px 10px;
        min-width: 180px;
      }

      .mj-sheets-mode-pills {
        display: inline-flex;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        padding: 2px;
        gap: 2px;
      }

      .mj-sheets-mode-pill {
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .mj-sheets-mode-pill.active {
        background: var(--mj-bg-surface-card);
        color: var(--mj-brand-primary);
        font-weight: 600;
      }

      .mj-sheets-tool-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 500;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        cursor: pointer;
      }

      .mj-sheets-tool-btn:hover:not(:disabled) {
        background: var(--mj-bg-surface-hover);
      }

      .mj-sheets-tool-btn.active {
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
      }

      .mj-sheets-save-btn {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }

      .mj-sheets-divider {
        width: 1px;
        height: 20px;
        background: var(--mj-border-subtle);
        margin: 0 2px;
      }

      .mj-sheets-collab-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-collab-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--mj-status-success);
      }

      .mj-sheets-collab-badge[data-status='readonly'] .mj-sheets-collab-dot {
        background: var(--mj-status-warning);
      }

      .mj-sheets-collab-badge[data-status='revoked'] .mj-sheets-collab-dot {
        background: var(--mj-status-error);
      }

      .mj-sheets-collab-badge[data-status='error'] {
        background: var(--mj-status-error-bg);
        border-color: var(--mj-status-error-border);
        color: var(--mj-status-error-text);
      }

      .mj-sheets-collab-badge[data-status='error'] .mj-sheets-collab-dot {
        background: var(--mj-status-error);
      }

      .mj-sheets-collab-retry-btn {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid var(--mj-status-error-border);
        background: var(--mj-bg-surface);
        color: var(--mj-status-error-text);
      }

      .mj-sheets-collab-retry-btn:hover {
        background: var(--mj-bg-surface-hover);
      }

      .mj-sheets-presence-strip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .mj-sheets-presence-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-inverse);
      }

      .mj-sheets-status-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        font-size: 12px;
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-text-primary);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-sheets-status-banner--readonly {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      .mj-sheets-status-banner--warning {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-warning);
        border-bottom-color: var(--mj-status-warning);
      }

      .mj-sheets-banner-retry {
        margin-left: auto;
      }

      .mj-sheets-banner-close {
        margin-left: auto;
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-sheets-formula-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-sheets-cell-coord-box {
        min-width: 54px;
        text-align: center;
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 12px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-brand-primary);
        border: 1px solid var(--mj-border-default);
      }

      .mj-sheets-range-input {
        width: 96px;
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid var(--mj-border-subtle);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
      }

      .mj-sheets-fx-label {
        font-style: italic;
        font-weight: 700;
        font-size: 13px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-formula-input {
        flex: 1;
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 12px;
        padding: 5px 10px;
        border-radius: 4px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-sheets-stable-formula-badge {
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-subtle);
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mj-sheets-workspace-body {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      .mj-sheets-main-pane {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      .mj-sheets-grid-scroll {
        flex: 1;
        overflow: auto;
        background: var(--mj-bg-surface);
      }

      .mj-sheets-grid-table {
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }

      .mj-sheets-corner-header,
      .mj-sheets-col-header,
      .mj-sheets-row-header {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-default);
        font-weight: 600;
        user-select: none;
      }

      .mj-sheets-corner-header {
        width: 42px;
        min-width: 42px;
        text-align: center;
        position: sticky;
        top: 0;
        left: 0;
        z-index: 3;
      }

      .mj-sheets-col-header {
        padding: 5px 8px;
        text-align: center;
        position: sticky;
        top: 0;
        z-index: 2;
        cursor: pointer;
      }

      .mj-sheets-col-header.selected,
      .mj-sheets-row-header.selected {
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-brand-primary);
      }

      .mj-sheets-col-header-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .mj-sheets-col-custom-label {
        font-size: 10px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-row-header {
        width: 42px;
        min-width: 42px;
        text-align: center;
        padding: 4px;
        position: sticky;
        left: 0;
        z-index: 1;
      }

      .mj-sheets-frozen-row td {
        border-bottom: 2px solid var(--mj-brand-primary);
      }

      .mj-sheets-cell {
        border: 1px solid var(--mj-border-subtle);
        padding: 0;
        height: 28px;
        min-width: 105px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        position: relative;
        cursor: cell;
      }

      .mj-sheets-cell.in-range {
        background: var(--mj-bg-surface-hover);
      }

      .mj-sheets-cell.active {
        outline: 2px solid var(--mj-brand-primary);
        outline-offset: -2px;
        z-index: 1;
      }

      .mj-sheets-cell.is-bold .mj-sheets-cell-text {
        font-weight: 700;
      }

      .mj-sheets-cell.is-italic .mj-sheets-cell-text {
        font-style: italic;
      }

      .mj-sheets-cell.align-right .mj-sheets-cell-content {
        justify-content: flex-end;
      }

      .mj-sheets-cell.align-center .mj-sheets-cell-content {
        justify-content: center;
      }

      .mj-sheets-cell.access-denied {
        background: var(--mj-bg-surface-sunken);
      }

      .mj-sheets-cell.tone-success {
        background: var(--mj-bg-surface-sunken);
        border-left: 3px solid var(--mj-status-success);
      }

      .mj-sheets-cell.tone-warning {
        background: var(--mj-bg-surface-sunken);
        border-left: 3px solid var(--mj-status-warning);
      }

      .mj-sheets-cell.tone-danger {
        background: var(--mj-bg-surface-sunken);
        border-left: 3px solid var(--mj-status-error);
      }

      .mj-sheets-cell.tone-info {
        background: var(--mj-bg-surface-sunken);
        border-left: 3px solid var(--mj-status-info);
      }

      .mj-sheets-cell-content {
        display: flex;
        align-items: center;
        padding: 3px 7px;
        height: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .mj-sheets-access-denied-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        color: var(--mj-status-error);
      }

      .mj-sheets-formula-corner {
        position: absolute;
        top: 0;
        right: 0;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-top: 6px solid var(--mj-brand-primary);
      }

      .mj-sheets-validation-badge {
        margin-left: auto;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--mj-status-error);
        color: var(--mj-text-inverse);
        font-size: 10px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .mj-sheets-inline-cell-input {
        width: 100%;
        height: 100%;
        border: none;
        padding: 3px 7px;
        font-size: 12px;
        font-family: var(--mj-font-family-mono, monospace);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-sheets-objects-strip {
        max-height: 270px;
        overflow-y: auto;
        padding: 10px 14px;
        background: var(--mj-bg-surface-sunken);
        border-top: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-sheets-objects-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mj-sheets-section-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: var(--mj-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .mj-sheets-cards-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .mj-sheets-object-card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 10px 12px;
        min-width: 300px;
        max-width: 440px;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mj-sheets-object-card.has-error {
        border-color: var(--mj-status-error);
      }

      .mj-sheets-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .mj-sheets-card-title {
        display: block;
        font-size: 13px;
        color: var(--mj-text-primary);
      }

      .mj-sheets-card-meta {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-mode-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-brand-primary);
      }

      .mj-sheets-mode-badge.frozen {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      .mj-sheets-calc-cols {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-sheets-calc-pill {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-table-provenance {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-success);
        font-size: 11px;
      }

      .mj-sheets-table-error {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-error);
        font-size: 12px;
        font-weight: 600;
      }

      .mj-sheets-card-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: auto;
      }

      .mj-sheets-row-count {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-action-btns {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .mj-sheets-mini-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 500;
        border-radius: 4px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        cursor: pointer;
      }

      .mj-sheets-mini-select {
        padding: 3px 6px;
        font-size: 11px;
        border-radius: 4px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-sheets-chart-svg {
        width: 100%;
        height: 145px;
        background: var(--mj-bg-surface);
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-ole-host {
        min-height: 190px;
        max-height: 240px;
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        overflow: hidden;
        background: var(--mj-bg-surface);
      }

      .mj-sheets-ole-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 180px;
        color: var(--mj-text-secondary);
        font-size: 12px;
      }

      .mj-sheets-tab-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--mj-bg-surface-card);
        border-top: 1px solid var(--mj-border-default);
      }

      .mj-sheets-tabs-list {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
      }

      .mj-sheets-tab-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-subtle);
        cursor: pointer;
      }

      .mj-sheets-tab-pill.active {
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
        font-weight: 600;
      }

      .mj-sheets-tab-close {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 0 2px;
        font-size: 11px;
      }

      .mj-sheets-add-tab-btn {
        border: 1px dashed var(--mj-border-default);
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
      }

      .mj-sheets-tab-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-comments-drawer {
        width: 330px;
        min-width: 330px;
        border-left: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .mj-sheets-drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-sheets-drawer-header h4 {
        margin: 0;
        font-size: 13px;
      }

      .mj-sheets-drawer-subtitle {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-new-comment-box {
        padding: 10px 12px;
        border-bottom: 1px solid var(--mj-border-subtle);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mj-sheets-comment-textarea {
        width: 100%;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 12px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        resize: vertical;
      }

      .mj-sheets-comment-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .mj-sheets-anchor-preview {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-threads-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-sheets-thread-card {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 8px 10px;
        background: var(--mj-bg-surface);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-sheets-thread-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }

      .mj-sheets-thread-anchor {
        font-weight: 600;
        color: var(--mj-brand-primary);
        cursor: pointer;
      }

      .mj-sheets-thread-msg {
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        font-size: 12px;
      }

      .mj-sheets-thread-msg.agent-msg {
        border-left: 3px solid var(--mj-brand-primary);
      }

      .mj-sheets-msg-meta {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--mj-text-muted);
        margin-bottom: 3px;
      }

      .mj-sheets-msg-body {
        margin: 0;
        white-space: pre-wrap;
      }

      .mj-sheets-source-pane,
      .mj-sheets-diff-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 12px;
        overflow: auto;
      }

      .mj-sheets-source-textarea {
        flex: 1;
        width: 100%;
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 12px;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-primary);
      }

      .mj-sheets-source-actions {
        margin-top: 8px;
        display: flex;
        justify-content: flex-end;
      }

      .mj-sheets-diff-summary {
        display: flex;
        gap: 12px;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 10px;
      }

      .mj-sheets-diff-line {
        display: flex;
        gap: 8px;
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 12px;
        padding: 2px 6px;
      }

      .mj-sheets-diff-line[data-diff-type='added'] {
        background: var(--mj-brand-primary-subtle);
      }

      .mj-sheets-diff-line[data-diff-type='removed'] {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-error);
      }

      .mj-sheets-diff-code {
        margin: 0;
      }

      .mj-sheets-modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--mj-bg-overlay);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .mj-sheets-modal-dialog {
        width: 480px;
        max-width: 92vw;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-sheets-modal-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mj-sheets-modal-header h3 {
        margin: 0;
        font-size: 15px;
      }

      .mj-sheets-modal-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 13px;
      }

      .mj-sheets-form-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-sheets-form-row label {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-sheets-modal-input {
        padding: 6px 8px;
        font-size: 12px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-sheets-confirm-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12px;
        cursor: pointer;
      }

      .mj-sheets-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'SpreadsheetArtifactViewerPlugin')
export class SpreadsheetArtifactViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, OnChanges, OnDestroy
{
  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input() public CollaborationWsUrl: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly collaborationService = inject(DocumentCollaborationService);
  private readonly artifactFileService = inject(ArtifactFileService, { optional: true });
  private readonly notificationService = inject(MJNotificationService, { optional: true });

  public Workbook: WorkbookSpec = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Workbook');
  public WorkspaceMode: SpreadsheetWorkspaceMode = 'grid';
  public FallbackXlsxBytes: ArrayBuffer | null = null;

  public ActiveRowIndex = 1;
  public ActiveColumnIndex = 1;
  public SelectedRange = 'A1';
  public FormulaBarInput = '';
  public InlineEditingAddress: string | null = null;
  public InlineEditValue = '';

  public SourceJsonText = '';
  public InitialSerializedWorkbook = '';
  public DiffResult: DocumentDiffResult = {
    AddedLines: 0,
    RemovedLines: 0,
    UnchangedLines: 0,
    Lines: [],
  };

  public CollaborationSession: DocumentCollaborationSession | null = null;
  public ConnectionStatus: CollaborationConnectionStatus = 'local';
  public Collaborators: CollaboratorPresence[] = [];
  public Permissions: VerifiedArtifactPermissions | null = null;
  public AccessRevoked = false;
  public PermissionVerifyError = false;

  public ShowCommentsDrawer = false;
  public NewCommentText = '';
  public AnchoredThreads: DocumentAnchoredThread[] = [];
  private persistedThreadConversations = new Map<string, MJConversationEntity>();

  public PendingFreezeTable: SpreadsheetLiveTableSpec | null = null;
  public FreezeConfirmedChecked = false;

  public ShowAddLiveTableModal = false;
  public NewLiveTableTitle = 'Active AI Agents';
  public NewLiveTableSourceType: 'EntityView' | 'SavedQuery' = 'EntityView';
  public NewLiveTableEntityName = 'AI Agents';
  public NewLiveTableExtraFilter = '';
  public NewLiveTableQueryName = 'Renewals by Month';
  public NewLiveTableAnchorCell = 'A1';
  public NewLiveTableCalcHeader = '';
  public NewLiveTableCalcFormula = '';

  public IsRefreshingData = false;
  public IsSavingVersion = false;
  public LastSavedVersionNumber: number | null = null;
  public StatusBannerMessage = '';
  private lastSavedComparableJson = '';

  public EmbeddedArtifactVersions: Record<string, MJArtifactVersionEntity> = {};
  private lastTableResults: Record<string, DocumentBlockExecutionResult> = {};

  private readonly subs: Subscription[] = [];
  private permissionsUnsubscribe: (() => void) | null = null;
  private liveSyncUnavailable = false;

  public get HasUnsavedChanges(): boolean {
    if (!this.lastSavedComparableJson) {
      return false;
    }
    return this.getComparableWorkbookJson(this.Workbook) !== this.lastSavedComparableJson;
  }

  private getComparableWorkbookJson(wb: WorkbookSpec): string {
    const normalized: WorkbookSpec = {
      ...wb,
      UpdatedAt: '',
    };
    return JSON.stringify(normalized);
  }

  public get ActiveSheet(): WorksheetSpec {
    return (
      SpreadsheetEngine.Instance.GetWorksheet(this.Workbook, this.Workbook.ActiveSheetID) ??
      this.Workbook.Worksheets[0]
    );
  }

  public get VisibleColumns(): SpreadsheetColumnSpec[] {
    return (this.ActiveSheet?.Columns ?? []).filter((c) => !c.Hidden);
  }

  public get VisibleRows(): SpreadsheetRowSpec[] {
    return (this.ActiveSheet?.Rows ?? []).filter((r) => !r.Hidden);
  }

  public get ActiveColumnLetter(): string {
    return ColumnIndexToLetter(this.ActiveColumnIndex);
  }

  public get ActiveCellAddress(): string {
    return FormatCellAddress(this.ActiveRowIndex, this.ActiveColumnIndex);
  }

  public get ActiveCellSpec(): SpreadsheetCellSpec | undefined {
    return this.ActiveSheet?.Cells?.[this.ActiveCellAddress];
  }

  public get IsActiveCellBold(): boolean {
    return Boolean(this.ActiveCellSpec?.Style?.Bold);
  }

  public get ActiveCellFormatType(): SpreadsheetCellFormatType {
    return (
      this.ActiveCellSpec?.Style?.FormatType ??
      SpreadsheetEngine.Instance.InferFormatTypeFromPattern(
        this.ActiveCellSpec?.Style?.NumberFormatPattern,
      )
    );
  }

  private get hasPermissionToEdit(): boolean {
    if (this.readonly || this.FallbackXlsxBytes !== null) {
      return false;
    }
    if (this.ConnectionStatus === 'readonly' || this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      return this.Permissions?.CanEdit === true;
    }
    return true;
  }

  public get IsWaitingForInitialCollabSync(): boolean {
    return Boolean(
      this.CollaborationSession &&
      this.CollaborationSession.Transport === 'websocket' &&
      !this.CollaborationSession.HasCompletedInitialSync,
    );
  }

  public get LiveSyncUnavailable(): boolean {
    return this.liveSyncUnavailable || Boolean(this.CollaborationSession?.LiveSyncUnavailable);
  }

  public get CanEdit(): boolean {
    return !this.LiveSyncUnavailable && this.hasPermissionToEdit && !this.IsWaitingForInitialCollabSync;
  }

  public get CanComment(): boolean {
    if (this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      return Boolean(this.Permissions && (this.Permissions.CanRead || this.Permissions.CanEdit));
    }
    return !this.readonly;
  }

  public get OpenThreadCount(): number {
    return this.AnchoredThreads.filter((t) => t.Status === 'Open').length;
  }

  public get PopulatedCellCount(): number {
    return Object.keys(this.ActiveSheet?.Cells ?? {}).length;
  }

  public get FormulaCellCount(): number {
    return Object.values(this.ActiveSheet?.Cells ?? {}).filter((c) => Boolean(c.Formula)).length;
  }

  public get HasDisplayContent(): boolean {
    return true;
  }

  public override get hasDisplayContent(): boolean {
    return true;
  }

  public override get SupportsInlineEdit(): boolean {
    return true;
  }

  public override get SupportsVersionDiff(): boolean {
    return true;
  }

  public override GetVersionDiffComponentType(): Type<IArtifactVersionDiffViewer> {
    return SpreadsheetVersionDiffComponent;
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    return CreateJsonSnapshot(serialized, this.Workbook.Title || this.getDisplayTitle());
  }

  private sessionInitGeneration = 0;
  private isComponentDestroyed = false;

  public async ngOnInit(): Promise<void> {
    await this.initializeWorkbookSession();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['artifactVersion'] && !changes['artifactVersion'].firstChange) {
      void this.initializeWorkbookSession();
      return;
    }
    if (changes['CollaborationWsUrl'] && !changes['CollaborationWsUrl'].firstChange) {
      void this.initializeWorkbookSession();
      return;
    }
    if (changes['readonly']) {
      this.CollaborationSession?.SetCanEdit(this.hasPermissionToEdit);
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    this.teardownSession();
  }

  private teardownSession(): void {
    for (const s of this.subs) {
      s.unsubscribe();
    }
    this.subs.length = 0;
    if (this.permissionsUnsubscribe) {
      this.permissionsUnsubscribe();
      this.permissionsUnsubscribe = null;
    }
    if (this.CollaborationSession) {
      this.CollaborationSession.Destroy();
      this.CollaborationSession = null;
    }
    this.liveSyncUnavailable = false;
  }

  private notifyError(message: string): void {
    this.StatusBannerMessage = message;
    this.notificationService?.CreateSimpleNotification?.(message, 'error', 4000);
    this.cdr.markForCheck();
  }

  private getSafeProvider(): IMetadataProvider | null {
    try {
      return this.ProviderToUse ?? null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Session & Initialization
  // ---------------------------------------------------------------------------

  private async initializeWorkbookSession(): Promise<void> {
    const gen = ++this.sessionInitGeneration;
    this.teardownSession();
    this.FallbackXlsxBytes = null;
    this.Permissions = null;
    this.AccessRevoked = false;
    this.PermissionVerifyError = false;
    this.ConnectionStatus = 'local';
    this.AnchoredThreads = [];
    this.EmbeddedArtifactVersions = {};

    const rawContent = this.artifactVersion?.Content ?? '';
    const configJson = this.artifactVersion?.Configuration ?? null;
    const title = this.artifactVersion?.Name || 'Workbook';

    if (
      !rawContent.trim() &&
      this.artifactVersion?.ContentMode === 'File' &&
      this.artifactFileService &&
      this.artifactVersion?.ID
    ) {
      let downloadedBuffer: ArrayBuffer | null = null;
      try {
        const downloadUrl = await this.artifactFileService.getDownloadUrl(this.artifactVersion.ID);
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
        downloadedBuffer = await FetchArrayBuffer(downloadUrl);
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
        this.Workbook = SpreadsheetEngine.Instance.ImportFromXlsxBytes(
          new Uint8Array(downloadedBuffer),
          configJson,
        );
      } catch (err) {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
        LogError(err);
        this.Workbook = SpreadsheetEngine.Instance.ParseWorkbook('', configJson);
        if (downloadedBuffer) {
          this.FallbackXlsxBytes = downloadedBuffer;
        }
        this.notifyError(
          `Workbook could not be imported for editing (${err instanceof Error ? err.message : String(err)}). Showing read-only preview.`,
        );
      }
    } else {
      this.Workbook = SpreadsheetEngine.Instance.ParseWorkbook(rawContent, configJson);
    }
    if (title && (!this.Workbook.Title || this.Workbook.Title === 'Untitled Workbook')) {
      this.Workbook.Title = title;
    }

    SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
    const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.InitialSerializedWorkbook = serialized;
    this.SourceJsonText = serialized;
    this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
    this.syncFormulaBarFromActiveCell();

    const artifactId = this.artifactVersion?.ArtifactID || this.Workbook.WorkbookID;
    const provider = this.getSafeProvider();
    const currentUser = this.resolveCurrentUser();

    if (this.artifactVersion?.ArtifactID) {
      if (provider && currentUser) {
        try {
          this.Permissions = await this.collaborationService.ResolvePermissionsFromServer(
            this.artifactVersion.ArtifactID,
            provider,
          );
          if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
            return;
          }
          if (!this.Permissions) {
            this.AccessRevoked = false;
            this.PermissionVerifyError = false;
            this.ConnectionStatus = 'readonly';
          } else if (this.Permissions.PermissionVerifyError) {
            this.AccessRevoked = false;
            this.PermissionVerifyError = true;
            this.ConnectionStatus = 'readonly';
          } else if (!this.Permissions.CanRead) {
            this.PermissionVerifyError = false;
            this.AccessRevoked = true;
            this.ConnectionStatus = 'revoked';
          } else if (!this.Permissions.CanEdit) {
            this.PermissionVerifyError = false;
            this.AccessRevoked = false;
            this.ConnectionStatus = 'readonly';
          } else {
            this.PermissionVerifyError = false;
            this.AccessRevoked = false;
          }
        } catch (err) {
          if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
            return;
          }
          LogError(err);
          this.Permissions = null;
          this.AccessRevoked = false;
          this.PermissionVerifyError = true;
          this.ConnectionStatus = 'readonly';
        }

        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
        this.permissionsUnsubscribe = ArtifactPermissionEngine.Instance.OnPermissionsChanged(
          async (evt) => {
            if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
              return;
            }
            if (UUIDsEqual(evt.ArtifactID, this.artifactVersion.ArtifactID)) {
              await this.refreshPermissionsAndAnchoredThreads(gen);
            }
          },
        );
      } else {
        this.Permissions = null;
        this.ConnectionStatus = 'readonly';
      }
    }

    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }

    const hasRemoteBackend = this.collaborationService.HasCollaborationBackend(
      provider,
      this.CollaborationWsUrl,
    );
    const session = this.collaborationService.CreateSession(
      artifactId,
      serialized,
      {
        id: currentUser?.ID || 'local-user',
        name: currentUser?.Name || 'Collaborator',
        email: currentUser?.Email,
      },
      this.hasPermissionToEdit,
      hasRemoteBackend,
    );
    this.CollaborationSession = session;
    this.liveSyncUnavailable = Boolean(session.LiveSyncUnavailable);
    if (this.ConnectionStatus !== 'revoked' && this.ConnectionStatus !== 'readonly') {
      this.ConnectionStatus = session.Status;
    }
    this.Collaborators = session.GetCollaborators();

    this.subs.push(
      session.OnLiveSyncUnavailable$.subscribe((unavailable: boolean) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        const changed = this.liveSyncUnavailable !== unavailable;
        this.liveSyncUnavailable = unavailable;
        if (changed) {
          this.cdr.detectChanges();
        } else {
          this.cdr.markForCheck();
        }
      }),
      session.ContentChanged$.subscribe((nextContent: string) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        if (!nextContent || !nextContent.trim().startsWith('{')) return;
        this.Workbook = SpreadsheetEngine.Instance.ParseWorkbook(nextContent);
        SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
        this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
        this.syncFormulaBarFromActiveCell();
        this.verifyFrozenLiveTablesOnServer(this.Workbook);
        if (this.workbookHasLiveDataOrMjFunctions(this.Workbook)) {
          void this.RefreshAllLiveData(false);
        }
        this.cdr.markForCheck();
      }),
      session.StatusChanged$.subscribe((status: CollaborationConnectionStatus) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.ConnectionStatus = status;
        this.cdr.markForCheck();
      }),
      session.CollaboratorsChanged$.subscribe((collabs: CollaboratorPresence[]) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.Collaborators = collabs;
        this.cdr.markForCheck();
      }),
      session.VersionSaved$.subscribe((saved: { versionId: string; versionNumber: number }) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
        this.LastSavedVersionNumber = saved.versionNumber;
        this.IsSavingVersion = false;
        this.StatusBannerMessage = `Saved immutable Artifact Version v${saved.versionNumber}`;
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      session.MergeConflict$.subscribe((conflictEvt: CollaborationMergeConflictEvent) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.handleCollaborationMergeConflict(conflictEvt);
      }),
    );

    if (hasRemoteBackend) {
      void session.Connect(this.CollaborationWsUrl, provider);
    }

    this.verifyFrozenLiveTablesOnServer(this.Workbook);
    await this.RefreshAllLiveData(false);
    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }
    this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
    await this.hydrateEmbeddedArtifactVersions();
    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }
    await this.loadPersistedSheetRangeComments();
    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }
    this.cdr.markForCheck();
  }

  private workbookHasLiveDataOrMjFunctions(wb: WorkbookSpec): boolean {
    for (const ws of wb.Worksheets ?? []) {
      if ((ws.LiveTables?.length ?? 0) > 0) {
        return true;
      }
      for (const cell of Object.values(ws.Cells ?? {})) {
        if (cell?.Formula && SpreadsheetEngine.Instance.ParseMjCustomFunctionFormula(cell.Formula)) {
          return true;
        }
      }
    }
    return false;
  }

  private resolveCurrentUser(): UserInfo | undefined {
    try {
      return this.getSafeProvider()?.CurrentUser ?? undefined;
    } catch {
      return undefined;
    }
  }

  public RetryVerifyPermissions(): void {
    void this.refreshPermissionsAndAnchoredThreads(this.sessionInitGeneration);
  }

  private async refreshPermissionsAndAnchoredThreads(gen = this.sessionInitGeneration): Promise<void> {
    const provider = this.getSafeProvider();
    const user = this.resolveCurrentUser();
    if (!provider || !user || !this.artifactVersion?.ArtifactID) return;
    try {
      this.Permissions = await this.collaborationService.ResolvePermissionsFromServer(
        this.artifactVersion.ArtifactID,
        provider,
      );
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      if (!this.Permissions) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = false;
        this.ConnectionStatus = 'readonly';
        this.CollaborationSession?.SetCanEdit(false);
      } else if (this.Permissions.PermissionVerifyError) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = true;
        this.ConnectionStatus = 'readonly';
        this.CollaborationSession?.SetCanEdit(false);
      } else if (!this.Permissions.CanRead) {
        this.PermissionVerifyError = false;
        this.AccessRevoked = true;
        this.ConnectionStatus = 'revoked';
        this.CollaborationSession?.SetCanEdit(false);
      } else if (!this.Permissions.CanEdit) {
        this.PermissionVerifyError = false;
        this.AccessRevoked = false;
        this.ConnectionStatus = 'readonly';
        this.CollaborationSession?.SetCanEdit(false);
      } else {
        this.PermissionVerifyError = false;
        this.AccessRevoked = false;
        const effectiveCanEdit =
          !this.readonly && this.FallbackXlsxBytes === null && !this.LiveSyncUnavailable;
        if (this.CollaborationSession) {
          this.CollaborationSession.SetCanEdit(effectiveCanEdit);
          this.ConnectionStatus = this.CollaborationSession.Status;
        } else {
          this.ConnectionStatus = effectiveCanEdit ? 'local' : 'readonly';
        }
      }
      await this.loadPersistedSheetRangeComments();
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.AccessRevoked = false;
      this.PermissionVerifyError = true;
      this.ConnectionStatus = 'readonly';
      this.CollaborationSession?.SetCanEdit(false);
      this.cdr.markForCheck();
    }
  }

  // ---------------------------------------------------------------------------
  // Grid Navigation & Cell / Formula Editing
  // ---------------------------------------------------------------------------

  public SelectCell(rowIndex: number, colIndex: number, event?: MouseEvent): void {
    const prevAddr = this.ActiveCellAddress;
    this.ActiveRowIndex = rowIndex;
    this.ActiveColumnIndex = colIndex;
    const nextAddr = FormatCellAddress(rowIndex, colIndex);

    if (event?.shiftKey) {
      this.SelectedRange = `${prevAddr}:${nextAddr}`;
    } else {
      this.SelectedRange = nextAddr;
    }

    this.syncFormulaBarFromActiveCell();
    this.CollaborationSession?.SetActiveBlock(`${this.ActiveSheet.SheetID}:${this.SelectedRange}`);
    this.cdr.markForCheck();
  }

  public SelectColumnHeader(colLetter: string): void {
    const rowCount = this.ActiveSheet.Rows.length;
    this.SelectedRange = `${colLetter}1:${colLetter}${rowCount}`;
    const pos = ParseCellAddress(`${colLetter}1`);
    if (pos) {
      this.ActiveRowIndex = 1;
      this.ActiveColumnIndex = pos.col;
      this.syncFormulaBarFromActiveCell();
    }
    this.cdr.markForCheck();
  }

  public BeginInlineCellEdit(rowIndex: number, colIndex: number): void {
    if (!this.CanEdit) return;
    this.ActiveRowIndex = rowIndex;
    this.ActiveColumnIndex = colIndex;
    const addr = FormatCellAddress(rowIndex, colIndex);
    this.InlineEditingAddress = addr;
    const existing = this.ActiveSheet.Cells[addr];
    this.InlineEditValue = existing?.Formula
      ? existing.Formula
      : existing?.RawValue !== null && existing?.RawValue !== undefined
        ? String(existing.RawValue)
        : '';
    this.cdr.markForCheck();
  }

  public CommitInlineCellEdit(): void {
    if (!this.InlineEditingAddress || !this.CanEdit) return;
    const addr = this.InlineEditingAddress;
    const valueStr = this.InlineEditValue;
    this.InlineEditingAddress = null;
    this.FormulaBarInput = valueStr;
    this.writeCellAndBroadcast(addr, valueStr);
  }

  public CancelInlineCellEdit(): void {
    this.InlineEditingAddress = null;
    this.cdr.markForCheck();
  }

  public CommitFormulaBarInput(): void {
    if (!this.CanEdit) return;
    this.writeCellAndBroadcast(this.ActiveCellAddress, this.FormulaBarInput);
  }

  private writeCellAndBroadcast(address: string, rawInput: string): void {
    const sheet = this.ActiveSheet;
    const trimmed = rawInput.trim();
    const isFormula = trimmed.startsWith('=');
    const parsedScalar = this.parseRawInputScalar(trimmed);

    const updatedCell = SpreadsheetEngine.Instance.SetCell(
      this.Workbook,
      sheet.SheetID,
      address,
      {
        Value: isFormula ? null : parsedScalar,
        Formula: isFormula ? trimmed : null,
        Style: sheet.Cells[address]?.Style,
      },
    );

    if (isFormula && SpreadsheetEngine.Instance.ParseMjCustomFunctionFormula(trimmed)) {
      void this.RefreshAllLiveData(true);
    }

    if (updatedCell && this.CollaborationSession) {
      this.CollaborationSession.UpdateSpreadsheetCell(sheet.SheetID, updatedCell, this.Workbook);
    }
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private parseRawInputScalar(input: string): string | number | boolean | null {
    if (input === '') return null;
    if (input.toUpperCase() === 'TRUE') return true;
    if (input.toUpperCase() === 'FALSE') return false;
    if (!Number.isNaN(Number(input))) return Number(input);
    return input;
  }

  private syncFormulaBarFromActiveCell(): void {
    const cell = this.ActiveCellSpec;
    if (!cell) {
      this.FormulaBarInput = '';
      return;
    }
    if (cell.Formula) {
      this.FormulaBarInput = cell.Formula;
    } else if (cell.RawValue !== null && cell.RawValue !== undefined) {
      this.FormulaBarInput = String(cell.RawValue);
    } else {
      this.FormulaBarInput = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Formatting, Structural Edits (Insert Row/Col), Sorting & Freeze Header
  // ---------------------------------------------------------------------------

  public ToggleActiveCellBold(): void {
    if (!this.CanEdit) return;
    const addr = this.ActiveCellAddress;
    const existing = this.ActiveSheet.Cells[addr];
    const nextBold = !existing?.Style?.Bold;
    const updated = SpreadsheetEngine.Instance.SetCell(
      this.Workbook,
      this.ActiveSheet.SheetID,
      addr,
      {
        Value: existing?.RawValue ?? null,
        Formula: existing?.Formula ?? null,
        Style: {
          ...existing?.Style,
          Bold: nextBold,
        },
      },
    );
    if (updated) {
      this.CollaborationSession?.UpdateSpreadsheetCell(
        this.ActiveSheet.SheetID,
        updated,
        this.Workbook,
      );
    }
    this.cdr.markForCheck();
  }

  public ApplyActiveCellFormat(formatType: SpreadsheetCellFormatType): void {
    if (!this.CanEdit) return;
    const addr = this.ActiveCellAddress;
    const existing = this.ActiveSheet.Cells[addr];
    const pattern = SpreadsheetEngine.Instance.DefaultPatternForFormatType(formatType);
    const updated = SpreadsheetEngine.Instance.SetCell(
      this.Workbook,
      this.ActiveSheet.SheetID,
      addr,
      {
        Value: existing?.RawValue ?? null,
        Formula: existing?.Formula ?? null,
        Style: {
          ...existing?.Style,
          FormatType: formatType,
          NumberFormatPattern: pattern,
        },
      },
    );
    if (updated) {
      this.CollaborationSession?.UpdateSpreadsheetCell(
        this.ActiveSheet.SheetID,
        updated,
        this.Workbook,
      );
    }
    this.cdr.markForCheck();
  }

  public InsertRowAtActive(): void {
    if (!this.CanEdit) return;
    SpreadsheetEngine.Instance.InsertRows(
      this.Workbook,
      this.ActiveSheet.SheetID,
      this.ActiveRowIndex,
      1,
    );
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  public InsertColumnAtActive(): void {
    if (!this.CanEdit) return;
    SpreadsheetEngine.Instance.InsertColumns(
      this.Workbook,
      this.ActiveSheet.SheetID,
      this.ActiveColumnIndex,
      1,
    );
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  public SortActiveColumn(direction: 'asc' | 'desc'): void {
    if (!this.CanEdit) return;
    SpreadsheetEngine.Instance.SortWorksheet(this.Workbook, this.ActiveSheet.SheetID, {
      ColumnLetter: this.ActiveColumnLetter,
      Direction: direction,
      HeaderRows: 1,
    });
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public ToggleFreezeHeaderRow(): void {
    if (!this.CanEdit) return;
    this.ActiveSheet.FrozenRows = (this.ActiveSheet.FrozenRows ?? 0) > 0 ? 0 : 1;
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Worksheet Tabs Management
  // ---------------------------------------------------------------------------

  public SelectWorksheet(sheetId: string): void {
    this.Workbook.ActiveSheetID = sheetId;
    this.ActiveRowIndex = 1;
    this.ActiveColumnIndex = 1;
    this.SelectedRange = 'A1';
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  public AddNewWorksheetTab(): void {
    if (!this.CanEdit) return;
    const nextIdx = this.Workbook.Worksheets.length + 1;
    const created = SpreadsheetEngine.Instance.AddWorksheet(this.Workbook, `Sheet ${nextIdx}`);
    this.Workbook.ActiveSheetID = created.SheetID;
    this.CollaborationSession?.UpdateWorksheetStructure(created, this.Workbook);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public DeleteWorksheetTab(sheetId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.CanEdit || this.Workbook.Worksheets.length <= 1) return;
    this.Workbook.Worksheets = this.Workbook.Worksheets.filter((w) => w.SheetID !== sheetId);
    if (this.Workbook.ActiveSheetID === sheetId) {
      this.Workbook.ActiveSheetID = this.Workbook.Worksheets[0].SheetID;
    }
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public OnWorkbookTitleChanged(nextTitle: string): void {
    if (!this.CanEdit) return;
    this.Workbook.Title = nextTitle;
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
  }

  // ---------------------------------------------------------------------------
  // Live MJ Tables, =MJ.QUERY / =MJ.VIEW & O5 Freeze Workflow (§ 6.3, Accept #2)
  // ---------------------------------------------------------------------------

  public OpenAddLiveTableModal(): void {
    this.NewLiveTableAnchorCell = this.ActiveCellAddress;
    this.ShowAddLiveTableModal = true;
    this.cdr.markForCheck();
  }

  public async ConfirmAddLiveTable(): Promise<void> {
    if (!this.CanEdit) return;
    const calcCols: SpreadsheetCalculatedColumnSpec[] = [];
    if (this.NewLiveTableCalcHeader.trim() && this.NewLiveTableCalcFormula.trim()) {
      calcCols.push({
        Header: this.NewLiveTableCalcHeader.trim(),
        FormulaTemplate: this.NewLiveTableCalcFormula.trim(),
        FormatType: 'currency',
      });
    }

    const tableSpec: SpreadsheetLiveTableSpec = {
      TableID: `tbl-${Date.now()}`,
      Title: this.NewLiveTableTitle.trim() || 'MJ Live Table',
      SourceType: this.NewLiveTableSourceType,
      EntityName:
        this.NewLiveTableSourceType === 'EntityView'
          ? this.NewLiveTableEntityName.trim()
          : undefined,
      ExtraFilter:
        this.NewLiveTableSourceType === 'EntityView' && this.NewLiveTableExtraFilter.trim()
          ? this.NewLiveTableExtraFilter.trim()
          : undefined,
      QueryName:
        this.NewLiveTableSourceType === 'SavedQuery'
          ? this.NewLiveTableQueryName.trim()
          : undefined,
      AnchorCell: this.NewLiveTableAnchorCell.trim() || 'A1',
      IncludeHeaders: true,
      Mode: 'Live',
      CalculatedColumns: calcCols,
    };

    if (!this.ActiveSheet.LiveTables) {
      this.ActiveSheet.LiveTables = [];
    }
    this.ActiveSheet.LiveTables.push(tableSpec);
    this.ShowAddLiveTableModal = false;

    await this.RefreshAllLiveData(true);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public InsertMjQueryFormula(): void {
    if (!this.CanEdit) return;
    this.FormulaBarInput = '=MJ.QUERY("Renewals by Month", 2026)';
    this.CommitFormulaBarInput();
  }

  public InsertMjViewFormula(): void {
    if (!this.CanEdit) return;
    this.FormulaBarInput = '=MJ.VIEW("AI Agents", "Active Agents")';
    this.CommitFormulaBarInput();
  }

  public async RefreshAllLiveData(bypassCache = false): Promise<void> {
    const user = this.resolveCurrentUser();
    if (!user) return;
    this.IsRefreshingData = true;
    this.cdr.markForCheck();
    try {
      const tableResults = await SpreadsheetEngine.Instance.RefreshLiveTables(
        this.Workbook,
        user,
        this.ProviderToUse,
      );
      this.lastTableResults = { ...this.lastTableResults, ...tableResults };
      await SpreadsheetEngine.Instance.EvaluateMjCustomFunctions(
        this.Workbook,
        user,
        this.ProviderToUse,
        {
          BypassCache: bypassCache,
        },
      );
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
    } finally {
      this.IsRefreshingData = false;
      this.cdr.markForCheck();
    }
  }

  public async RefreshSingleLiveTable(table: SpreadsheetLiveTableSpec): Promise<void> {
    const user = this.resolveCurrentUser();
    if (!user) return;
    const results = await SpreadsheetEngine.Instance.RefreshLiveTables(
      this.Workbook,
      user,
      this.ProviderToUse,
      {
        TableID: table.TableID,
      },
    );
    this.lastTableResults = { ...this.lastTableResults, ...results };
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private liveTableToBlockSpec(
    table: SpreadsheetLiveTableSpec,
    modeOverride?: 'Live' | 'Frozen',
  ): DocumentBlockSpec {
    return {
      BlockID: table.TableID,
      Kind: table.SourceType,
      Title: table.Title,
      DisplayMode: 'table',
      Mode: modeOverride ?? table.Mode,
      EntityName: table.EntityName,
      ViewID: table.ViewID,
      ViewName: table.ViewName,
      ExtraFilter: table.ExtraFilter,
      Fields: table.Fields,
      QueryID: table.QueryID,
      QueryName: table.QueryName,
      Parameters: table.QueryParameters,
      MaxRows: table.MaxRows,
      FrozenSnapshot: modeOverride === 'Live' ? undefined : table.FrozenSnapshot,
    };
  }

  public IsLiveTableSnapshotVerified(table: SpreadsheetLiveTableSpec | null | undefined): boolean {
    if (!table) {
      return false;
    }
    return this.collaborationService.IsFrozenSnapshotVerified(
      this.liveTableToBlockSpec(table),
      this.lastTableResults[table.TableID],
    );
  }

  private verifyFrozenLiveTablesOnServer(workbook: WorkbookSpec): void {
    const provider = this.getSafeProvider();
    for (const sheet of workbook.Worksheets ?? []) {
      for (const table of sheet.LiveTables ?? []) {
        if (table.Mode === 'Frozen' && table.FrozenSnapshot) {
          void this.collaborationService
            .VerifyFrozenSnapshotOnServer(this.liveTableToBlockSpec(table), provider)
            .then(() => {
              if (!this.isComponentDestroyed) {
                this.cdr.markForCheck();
              }
            });
        }
      }
    }
  }

  public PromptFreezeLiveTable(table: SpreadsheetLiveTableSpec): void {
    this.PendingFreezeTable = table;
    this.FreezeConfirmedChecked = false;
    this.cdr.markForCheck();
  }

  public CancelFreezeLiveTable(): void {
    this.PendingFreezeTable = null;
    this.FreezeConfirmedChecked = false;
    this.cdr.markForCheck();
  }

  public async ConfirmFreezeLiveTable(): Promise<void> {
    if (!this.PendingFreezeTable || !this.FreezeConfirmedChecked) return;
    const user = this.resolveCurrentUser();
    if (!user) return;
    const provider = this.getSafeProvider();
    if (!provider) {
      this.notifyError('Cannot freeze live table: metadata provider unavailable.');
      return;
    }

    const target = this.PendingFreezeTable;
    this.PendingFreezeTable = null;
    this.FreezeConfirmedChecked = false;

    try {
      const liveBlockSpec = this.liveTableToBlockSpec(target, 'Live');
      const res = await this.collaborationService.FreezeLiveBlock(
        liveBlockSpec,
        true,
        this.artifactVersion?.ArtifactID,
        provider,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      if (!res.Success || !res.UpdatedSpec?.FrozenSnapshot) {
        this.notifyError(res.ErrorMessage || 'Failed to freeze live table on server.');
        return;
      }

      const signedSnapshot = res.UpdatedSpec.FrozenSnapshot;
      const execResult: DocumentBlockExecutionResult = {
        BlockID: target.TableID,
        Kind: target.SourceType,
        Mode: 'Frozen',
        Success: true,
        Columns: signedSnapshot.Columns,
        Rows: signedSnapshot.Rows,
        TotalRowCount: signedSnapshot.TotalRowCount,
        FrozenMetadata: {
          FrozenAt: signedSnapshot.FrozenAt,
          FrozenByUserID: signedSnapshot.FrozenByUserID,
          FrozenByUserName: signedSnapshot.FrozenByUserName,
          SnapshotVerified: true,
        },
      };

      SpreadsheetEngine.Instance.FreezeLiveTable(
        this.Workbook,
        this.ActiveSheet.SheetID,
        target.TableID,
        execResult,
        user,
        true,
        signedSnapshot,
      );
      this.lastTableResults[target.TableID] = execResult;
      this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.StatusBannerMessage = `Froze snapshot of "${target.Title}" under current viewer permissions.`;
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to freeze live table on server.');
    }
  }

  public async UnfreezeLiveTable(table: SpreadsheetLiveTableSpec): Promise<void> {
    SpreadsheetEngine.Instance.UnfreezeLiveTable(
      this.Workbook,
      this.ActiveSheet.SheetID,
      table.TableID,
    );
    await this.RefreshSingleLiveTable(table);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Range Charts (§ 6.3, Accept #5)
  // ---------------------------------------------------------------------------

  public AddRangeChartFromSelection(): void {
    if (!this.CanEdit) return;
    const range = this.SelectedRange.includes(':') ? this.SelectedRange : 'A1:B5';
    const chartSpec: SpreadsheetChartSpec = {
      ChartID: `chart-${(this.ActiveSheet.Charts?.length ?? 0) + 1}`,
      Title: `${this.ActiveSheet.Name} (${range})`,
      ChartType: 'bar',
      SheetID: this.ActiveSheet.SheetID,
      SourceRange: range,
      PositionCell: 'E2',
      ShowLegend: true,
    };
    if (!this.ActiveSheet.Charts) {
      this.ActiveSheet.Charts = [];
    }
    this.ActiveSheet.Charts.push(chartSpec);
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public GetChartDataset(chart: SpreadsheetChartSpec): SpreadsheetChartDataset | null {
    return SpreadsheetEngine.Instance.ExtractChartDataset(
      this.Workbook,
      chart.SheetID || this.ActiveSheet.SheetID,
      chart.ChartID || chart.SourceRange,
    );
  }

  public GetChartMaxValue(dataset: SpreadsheetChartDataset): number {
    let max = 0;
    for (const s of dataset.Series) {
      for (const v of s.Values) {
        if (v > max) max = v;
      }
    }
    return max > 0 ? max : 1;
  }

  public OnChartTypeChanged(chart: SpreadsheetChartSpec, nextType: SpreadsheetChartType): void {
    if (!this.CanEdit) return;
    chart.ChartType = nextType;
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.cdr.markForCheck();
  }

  public CopySlideBlockDescriptorForChart(chart: SpreadsheetChartSpec): void {
    const blockDescriptor = {
      BlockID: `sheet-chart-${chart.ChartID}`,
      Kind: 'Artifact',
      Title: chart.Title,
      ArtifactID: this.artifactVersion?.ArtifactID || this.Workbook.WorkbookID,
      ArtifactType: 'Excel Spreadsheet',
      Mode: 'Live',
      Config: {
        SheetID: chart.SheetID,
        ChartID: chart.ChartID,
        SourceRange: chart.SourceRange,
      },
    };
    const json = JSON.stringify(blockDescriptor, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(json);
    }
    this.StatusBannerMessage = `Copied live Sheet Range Chart block (${chart.Title}) for MJ Slides / MJ Docs.`;
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Embedded Inline OLE Whiteboard (§ 3.4.1)
  // ---------------------------------------------------------------------------

  private resolveArtifactsEntityId(provider: IMetadataProvider): string | undefined {
    if (typeof provider.EntityByName === 'function') {
      const byName = provider.EntityByName('MJ: Artifacts');
      if (byName?.ID) {
        return byName.ID;
      }
    }
    return provider.Entities?.find((e) => e.Name === 'MJ: Artifacts')?.ID;
  }

  private async resolveArtifactTypeId(
    provider: IMetadataProvider,
    typeName: string,
    user: UserInfo,
  ): Promise<string | undefined> {
    const cachedType =
      ArtifactMetadataEngine.Instance.FindArtifactType(typeName) ??
      ArtifactMetadataEngine.Instance.ArtifactTypes?.find(
        (t) => t.Name.trim().toLowerCase() === typeName.trim().toLowerCase(),
      );
    if (cachedType?.ID) {
      return cachedType.ID;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const typeRes = await rv.RunView<{ ID: string }>(
      {
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: `Name='${EscapeSQLString(typeName)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      user,
    );
    return typeRes.Success ? typeRes.Results?.[0]?.ID : undefined;
  }

  public async AddEmbeddedWhiteboardOnSheet(): Promise<void> {
    if (!this.CanEdit) return;
    const hostArtifactId = this.artifactVersion?.ArtifactID;
    const md = this.getSafeProvider();
    const user = this.resolveCurrentUser();
    if (!hostArtifactId || !md || !user) {
      this.notifyError('Cannot create embedded Whiteboard: host workbook must be saved with an active provider.');
      return;
    }

    const wbTitle = `${this.ActiveSheet.Name} Architecture Board`;
    const emptyWhiteboardJson = JSON.stringify({
      version: 1,
      activePageId: 'page-1',
      pages: [{ id: 'page-1', name: 'Page 1', items: [] }],
    });

    try {
      const artifactsEntityId = this.resolveArtifactsEntityId(md);
      if (!artifactsEntityId) {
        this.notifyError('Cannot create embedded Whiteboard: MJ: Artifacts entity metadata unavailable.');
        return;
      }

      const rv = RunView.FromMetadataProvider(md);
      const [hostArtRes, wbTypeId] = await Promise.all([
        rv.RunView<{ ID: string; EnvironmentID?: string }>(
          {
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${EscapeSQLString(hostArtifactId)}'`,
            Fields: ['ID', 'EnvironmentID'],
            MaxRows: 1,
            ResultType: 'simple',
          },
          user,
        ),
        this.resolveArtifactTypeId(md, 'Whiteboard', user),
      ]);

      if (!wbTypeId) {
        this.notifyError('Artifact type "Whiteboard" could not be resolved.');
        return;
      }

      const hostEnvId = hostArtRes.Success ? hostArtRes.Results?.[0]?.EnvironmentID : undefined;
      const childArt = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
      childArt.NewRecord();
      childArt.Name = wbTitle;
      childArt.Description = `Inline Whiteboard embedded in worksheet ${this.ActiveSheet.Name}`;
      childArt.TypeID = wbTypeId;
      childArt.UserID = user.ID;
      if (hostEnvId) {
        childArt.EnvironmentID = hostEnvId;
      }
      childArt.DelegateEntityID = artifactsEntityId;
      childArt.DelegateRecordID = hostArtifactId;

      const savedArt = await childArt.Save();
      if (!savedArt || !childArt.ID) {
        const msg = childArt.LatestResult?.Message || 'Failed to save embedded Whiteboard artifact.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      const childVer = await md.GetEntityObject<MJArtifactVersionEntity>(
        'MJ: Artifact Versions',
        user,
      );
      childVer.NewRecord();
      childVer.ArtifactID = childArt.ID;
      childVer.VersionNumber = 1;
      childVer.Name = wbTitle;
      childVer.UserID = user.ID;
      childVer.Content = emptyWhiteboardJson;

      const savedVer = await childVer.Save();
      if (!savedVer || !childVer.ID) {
        const msg = childVer.LatestResult?.Message || 'Failed to save initial Whiteboard version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      this.EmbeddedArtifactVersions[childArt.ID] = childVer;

      const embedSpec: SpreadsheetEmbeddedArtifactSpec = {
        EmbedID: `emb-${(this.ActiveSheet.EmbeddedArtifacts?.length ?? 0) + 1}`,
        ArtifactID: childArt.ID,
        ArtifactVersionID: childVer.ID,
        ArtifactTypeName: 'Whiteboard',
        DriverClass: 'WhiteboardArtifactViewerPlugin',
        Title: wbTitle,
        AnchorCell: this.ActiveCellAddress,
        WidthPx: 420,
        HeightPx: 220,
        AllowInlineEdit: true,
        InlineContentJSON: emptyWhiteboardJson,
      };

      if (!this.ActiveSheet.EmbeddedArtifacts) {
        this.ActiveSheet.EmbeddedArtifacts = [];
      }
      this.ActiveSheet.EmbeddedArtifacts.push(embedSpec);
      this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to create embedded Whiteboard.');
    }
  }

  private async hydrateEmbeddedArtifactVersions(): Promise<void> {
    const embeds: SpreadsheetEmbeddedArtifactSpec[] = [];
    for (const ws of this.Workbook.Worksheets) {
      for (const emb of ws.EmbeddedArtifacts ?? []) {
        if (emb.ArtifactID && !this.EmbeddedArtifactVersions[emb.ArtifactID]) {
          embeds.push(emb);
        }
      }
    }
    if (embeds.length === 0) return;

    const provider = this.getSafeProvider();
    const user = this.resolveCurrentUser();
    if (!provider || !user) return;

    try {
      const rv = RunView.FromMetadataProvider(provider);
      for (const emb of embeds) {
        const filter = emb.ArtifactVersionID
          ? `ID = '${EscapeSQLString(emb.ArtifactVersionID)}' AND ArtifactID = '${EscapeSQLString(emb.ArtifactID)}'`
          : `ArtifactID = '${EscapeSQLString(emb.ArtifactID)}'`;
        const res = await rv.RunView<MJArtifactVersionEntity>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: filter,
            OrderBy: 'VersionNumber DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
          },
          user,
        );
        if (res.Success && res.Results && res.Results.length > 0) {
          this.EmbeddedArtifactVersions[emb.ArtifactID] = res.Results[0];
        }
      }
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  public async OnEmbeddedArtifactCommitted(
    embed: SpreadsheetEmbeddedArtifactSpec,
    nextContent: string,
  ): Promise<void> {
    if (!this.CanEdit) return;
    const md = this.getSafeProvider();
    const user = this.resolveCurrentUser();
    if (!embed.ArtifactID || !md || !user) {
      this.notifyError('Cannot commit embedded artifact edits: metadata provider or user context unavailable.');
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(md);
      const maxRes = await rv.RunView<{ ID: string; VersionNumber: number }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID = '${EscapeSQLString(embed.ArtifactID)}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'VersionNumber'],
          MaxRows: 1,
          ResultType: 'simple',
        },
        user,
      );
      const currentMax =
        maxRes.Success && maxRes.Results?.[0]?.VersionNumber ? maxRes.Results[0].VersionNumber : 0;
      const nextVersionNumber = currentMax + 1;

      const nextVer = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      nextVer.NewRecord();
      nextVer.ArtifactID = embed.ArtifactID;
      nextVer.VersionNumber = nextVersionNumber;
      nextVer.Name = embed.Title;
      nextVer.UserID = user.ID;
      nextVer.Content = nextContent;

      const saved = await nextVer.Save();
      if (!saved || !nextVer.ID) {
        const msg = nextVer.LatestResult?.Message || 'Failed to save embedded artifact version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      embed.InlineContentJSON = nextContent;
      this.EmbeddedArtifactVersions[embed.ArtifactID] = nextVer;
      if (embed.ArtifactVersionID) {
        embed.ArtifactVersionID = nextVer.ID;
      }
      this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save embedded artifact version.');
    }
  }

  // ---------------------------------------------------------------------------
  // Anchored SheetRange Comments (§ 3.5 / #6281)
  // ---------------------------------------------------------------------------

  public ToggleCommentsDrawer(): void {
    this.ShowCommentsDrawer = !this.ShowCommentsDrawer;
    this.cdr.markForCheck();
  }

  private async loadPersistedSheetRangeComments(): Promise<void> {
    if (!this.artifactVersion?.ArtifactID) return;
    const md = this.getSafeProvider();
    const user = this.resolveCurrentUser();
    if (!md || !user) return;

    try {
      const artifactsEntityId = this.resolveArtifactsEntityId(md);
      if (!artifactsEntityId) return;

      const rv = RunView.FromMetadataProvider(md);
      const convResult = await rv.RunView<MJConversationEntity>(
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `LinkedEntityID = '${EscapeSQLString(artifactsEntityId)}' AND LinkedRecordID = '${EscapeSQLString(this.artifactVersion.ArtifactID)}' AND AnchorType = 'SheetRange'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object',
        },
        user,
      );
      if (!convResult.Success) return;

      const allConvs = convResult.Results ?? [];
      const filteredCandidates = await FilterReadableAnchoredConversations(md, user, allConvs);
      const allowedIds = new Set(filteredCandidates.map((c) => c.ID).filter(Boolean));
      const readableConvs = allConvs.filter((c) => allowedIds.has(c.ID));

      const threads: DocumentAnchoredThread[] = [];
      this.persistedThreadConversations.clear();

      for (const conv of readableConvs) {
        if (!conv.ID) continue;
        this.persistedThreadConversations.set(conv.ID, conv);
        const detailsRes = await rv.RunView<MJConversationDetailEntity>(
          {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID = '${EscapeSQLString(conv.ID)}'`,
            OrderBy: '__mj_CreatedAt ASC',
            ResultType: 'entity_object',
          },
          user,
        );
        const messages = (detailsRes.Results ?? []).map((d) => ({
          DetailID: d.ID,
          UserName: d.User || (d.Role === 'AI' ? 'AI Assistant' : 'Unknown User'),
          Role: (d.Role === 'AI' ? 'Agent' : 'User') as 'User' | 'Agent',
          Message: d.Message,
          CreatedAt: new Date().toISOString(),
          Mentions: ExtractAnchoredCommentMentions(d.Message ?? ''),
        }));

        threads.push({
          ConversationID: conv.ID,
          AnchorKey: conv.AnchorKey || `${this.ActiveSheet.SheetID}:A1`,
          AnchorLabel: conv.Name || conv.AnchorKey || 'Sheet Range',
          QuotedText: '',
          Status: conv.IsResolved ? 'Resolved' : 'Open',
          AgentMode: 'edit',
          CreatedAt: new Date().toISOString(),
          Messages: messages,
        });
      }

      this.AnchoredThreads = threads;
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  public async CreateAnchoredSheetRangeComment(): Promise<void> {
    const body = this.NewCommentText.trim();
    if (!body || !this.CanComment) return;

    const anchorKey = `${this.ActiveSheet.SheetID}:${this.SelectedRange}`;
    const anchorLabel = `${this.ActiveSheet.Name}!${this.SelectedRange}`;
    const user = this.resolveCurrentUser();
    const mentions = ExtractAnchoredCommentMentions(body);

    let convId = `sheet-conv-${Date.now()}`;
    let detailId = `msg-${Date.now()}`;

    if (this.artifactVersion?.ArtifactID) {
      const md = this.getSafeProvider();
      if (!md || !user) {
        this.notifyError('Cannot save anchored comment: metadata provider or user context unavailable.');
        return;
      }
      const artifactsEntityId = this.resolveArtifactsEntityId(md);
      if (!artifactsEntityId) {
        this.notifyError('Cannot save anchored comment: MJ: Artifacts entity metadata unavailable.');
        return;
      }

      try {
        const conv = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
        conv.NewRecord();
        conv.Name = anchorLabel;
        conv.UserID = user.ID;
        conv.Status = 'Available';
        conv.LinkedEntityID = artifactsEntityId;
        conv.LinkedRecordID = this.artifactVersion.ArtifactID;
        conv.AnchorType = 'SheetRange';
        conv.AnchorKey = anchorKey;
        conv.IsResolved = false;
        conv.AnchorMetadata = JSON.stringify({
          sheetId: this.ActiveSheet.SheetID,
          sheetName: this.ActiveSheet.Name,
          range: this.SelectedRange,
        });

        const convSaved = await conv.Save();
        if (!convSaved || !conv.ID) {
          const msg = conv.LatestResult?.Message || 'Failed to save anchored comment conversation.';
          LogError(msg);
          this.notifyError(msg);
          return;
        }
        convId = conv.ID;
        this.persistedThreadConversations.set(conv.ID, conv);

        const detail = await md.GetEntityObject<MJConversationDetailEntity>(
          'MJ: Conversation Details',
          user,
        );
        detail.NewRecord();
        detail.ConversationID = conv.ID;
        detail.UserID = user.ID;
        detail.Role = 'User';
        detail.Message = body;
        const detailSaved = await detail.Save();
        if (!detailSaved) {
          const errMsg = detail.LatestResult?.Message || 'Failed to save anchored comment detail.';
          LogError(errMsg);
          this.notifyError(errMsg);
          return;
        }
        if (detail.ID) {
          detailId = detail.ID;
        }
      } catch (err) {
        LogError(err);
        this.notifyError(err instanceof Error ? err.message : 'Failed to save anchored comment.');
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const thread: DocumentAnchoredThread = {
      ConversationID: convId,
      AnchorKey: anchorKey,
      AnchorLabel: anchorLabel,
      QuotedText: this.SelectedRange,
      Status: 'Open',
      AgentMode: 'edit',
      CreatedAt: nowIso,
      Messages: [
        {
          DetailID: detailId,
          UserName: user?.Name || 'Collaborator',
          Role: 'User',
          Message: body,
          CreatedAt: nowIso,
          Mentions: mentions,
        },
      ],
    };

    this.NewCommentText = '';
    this.AnchoredThreads = [thread, ...this.AnchoredThreads];
    this.cdr.markForCheck();
  }

  public async ResolveAnchoredThread(thread: DocumentAnchoredThread): Promise<void> {
    const previousStatus = thread.Status;
    thread.Status = 'Resolved';
    const conv = this.persistedThreadConversations.get(thread.ConversationID);
    if (conv) {
      try {
        conv.IsResolved = true;
        const ok = await conv.Save();
        if (!ok) {
          thread.Status = previousStatus;
          conv.IsResolved = previousStatus === 'Resolved';
          const msg = conv.LatestResult?.Message || 'Failed to resolve anchored thread.';
          LogError(msg);
          this.notifyError(msg);
        }
      } catch (err) {
        thread.Status = previousStatus;
        conv.IsResolved = previousStatus === 'Resolved';
        LogError(err);
        this.notifyError(err instanceof Error ? err.message : 'Failed to resolve anchored thread.');
      }
    }
    this.cdr.markForCheck();
  }

  public FocusRangeFromAnchorKey(anchorKey: string): void {
    const sep = anchorKey.indexOf(':');
    if (sep < 0) return;
    const sheetId = anchorKey.slice(0, sep);
    const range = anchorKey.slice(sep + 1);
    if (this.Workbook.Worksheets.some((w) => w.SheetID === sheetId)) {
      this.Workbook.ActiveSheetID = sheetId;
    }
    this.SelectedRange = range;
    const firstAddr = range.split(':')[0];
    const pos = ParseCellAddress(firstAddr);
    if (pos) {
      this.ActiveRowIndex = pos.row;
      this.ActiveColumnIndex = pos.col;
      this.syncFormulaBarFromActiveCell();
    }
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Import / Export (.xlsx & .csv) & Version Compaction (§ 6.4, Accept #4)
  // ---------------------------------------------------------------------------

  public async OnImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.CanEdit) return;

    try {
      const buffer = await file.arrayBuffer();
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(buffer);
        const cleanName = file.name.replace(/\.csv$/i, () => '');
        this.Workbook = SpreadsheetEngine.Instance.ImportFromCsv(text, cleanName, cleanName);
        this.FallbackXlsxBytes = null;
      } else {
        const cleanName = file.name.replace(/\.xlsx$/i, () => '');
        try {
          this.Workbook = SpreadsheetEngine.Instance.ImportFromXlsxBytes(new Uint8Array(buffer));
          if (cleanName && (!this.Workbook.Title || this.Workbook.Title === 'Imported Workbook')) {
            this.Workbook.Title = cleanName;
          }
          this.FallbackXlsxBytes = null;
        } catch (err) {
          LogError(err);
          this.FallbackXlsxBytes = buffer;
          this.notifyError(
            `Could not import "${file.name}" for collaborative editing (${err instanceof Error ? err.message : String(err)}). Showing read-only Excel preview.`,
          );
          return;
        }
      }

      SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
      this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
      this.StatusBannerMessage = `Imported "${file.name}" (${this.Workbook.Worksheets.length} sheet(s), ${this.FormulaCellCount} formula(s)).`;
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      input.value = '';
    }
  }

  public ExportWorkbookAsXlsx(): Uint8Array {
    const bytes = SpreadsheetEngine.Instance.ExportToXlsxBytes(this.Workbook);
    this.downloadBinaryBytes(
      bytes,
      `${(this.Workbook.Title || 'workbook').replace(/[^A-Za-z0-9_-]/g, () => '_')}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    this.StatusBannerMessage = `Exported OpenXML .xlsx (${bytes.byteLength} bytes) with formulas & number formats.`;
    this.cdr.markForCheck();
    return bytes;
  }

  public ExportActiveSheetAsCsv(): string {
    const csv = SpreadsheetEngine.Instance.ExportToCsv(this.Workbook, this.ActiveSheet.SheetID);
    const bytes = new TextEncoder().encode(csv);
    this.downloadBinaryBytes(
      bytes,
      `${(this.ActiveSheet.Name || 'sheet').replace(/[^A-Za-z0-9_-]/g, () => '_')}.csv`,
      'text/csv;charset=utf-8',
    );
    this.StatusBannerMessage = `Exported "${this.ActiveSheet.Name}.csv"`;
    this.cdr.markForCheck();
    return csv;
  }

  private downloadBinaryBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      LogError(err);
    }
  }

  public async SaveNewArtifactVersion(): Promise<void> {
    if (!this.CanEdit || this.IsSavingVersion || !this.HasUnsavedChanges) return;
    this.IsSavingVersion = true;
    this.cdr.markForCheck();

    try {
      const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);

      const sentViaWs = this.CollaborationSession?.RequestSaveVersion() ?? false;
      if (sentViaWs) {
        this.StatusBannerMessage = 'Saving collaborative workbook version…';
        return;
      }

      const artifactId = this.artifactVersion?.ArtifactID;
      if (!artifactId) {
        this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
        this.LastSavedVersionNumber = (this.LastSavedVersionNumber ?? this.artifactVersion?.VersionNumber ?? 1) + 1;
        this.StatusBannerMessage = `Saved Workbook Version v${this.LastSavedVersionNumber}`;
        this.ContentCommitted.emit(serialized);
        return;
      }

      const md = this.getSafeProvider();
      const user = this.resolveCurrentUser();
      if (!md || !user) {
        this.notifyError('Cannot save workbook version: metadata provider or user context unavailable.');
        return;
      }

      const serverCommit = await this.collaborationService.CommitInlineEditOnServer(
        artifactId,
        serialized,
        true,
        md,
      );
      if (serverCommit.HandledByServer) {
        if (!serverCommit.Success) {
          this.notifyError(serverCommit.ErrorMessage || 'Failed to save workbook version on server.');
          return;
        }
        this.CollaborationSession?.AdoptOutOfBandCommittedContent(serialized);
        const nextVerNum =
          serverCommit.VersionNumber ??
          (this.LastSavedVersionNumber ?? this.artifactVersion.VersionNumber ?? 0) + 1;
        this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
        this.LastSavedVersionNumber = nextVerNum;
        this.StatusBannerMessage = `Saved Artifact Version v${nextVerNum}`;
        this.ContentCommitted.emit(serialized);
        return;
      }

      const rv = RunView.FromMetadataProvider(md);
      const maxRes = await rv.RunView<{ ID: string; VersionNumber: number }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID = '${EscapeSQLString(artifactId)}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'VersionNumber'],
          MaxRows: 1,
          ResultType: 'simple',
        },
        user,
      );
      const dbMax = maxRes.Success && maxRes.Results?.[0]?.VersionNumber ? maxRes.Results[0].VersionNumber : 0;
      const nextVerNum =
        Math.max(
          dbMax,
          this.LastSavedVersionNumber ?? 0,
          this.artifactVersion.VersionNumber ?? 0,
        ) + 1;

      const ver = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = artifactId;
      ver.VersionNumber = nextVerNum;
      ver.Name = this.Workbook.Title || this.artifactVersion.Name || 'Workbook';
      ver.UserID = user.ID;
      ver.Content = serialized;

      const saved = await ver.Save();
      if (!saved) {
        const msg = ver.LatestResult?.Message || 'Failed to save workbook version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
      this.LastSavedVersionNumber = nextVerNum;
      this.StatusBannerMessage = `Saved Artifact Version v${nextVerNum}`;
      this.ContentCommitted.emit(serialized);
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save workbook version.');
    } finally {
      this.IsSavingVersion = false;
      this.cdr.markForCheck();
    }
  }

  // ---------------------------------------------------------------------------
  // Workspace Mode & Source / Diff Helpers
  // ---------------------------------------------------------------------------

  public SetWorkspaceMode(mode: SpreadsheetWorkspaceMode): void {
    this.WorkspaceMode = mode;
    const currentJson = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.SourceJsonText = currentJson;
    if (mode === 'diff') {
      this.DiffResult = this.collaborationService.ComputeLineDiff(
        this.InitialSerializedWorkbook,
        currentJson,
      );
    }
    this.cdr.markForCheck();
  }

  public ApplySourceJsonChanges(): void {
    if (!this.CanEdit) return;
    this.Workbook = SpreadsheetEngine.Instance.ParseWorkbook(this.SourceJsonText);
    SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.WorkspaceMode = 'grid';
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Template View Helpers
  // ---------------------------------------------------------------------------

  public GetCellDisplayText(cell?: SpreadsheetCellSpec): string {
    if (!cell) return '';
    if (cell.DisplayValue !== undefined && cell.DisplayValue !== '') {
      return cell.DisplayValue;
    }
    const val = cell.ComputedValue ?? cell.RawValue;
    return SpreadsheetEngine.Instance.FormatCellValue(val, cell.Style);
  }

  public IsNumericOrRightAligned(cell?: SpreadsheetCellSpec): boolean {
    if (!cell) return false;
    if (cell.Style?.HorizontalAlign === 'right') return true;
    if (cell.Style?.HorizontalAlign === 'left' || cell.Style?.HorizontalAlign === 'center') {
      return false;
    }
    const val = cell.ComputedValue ?? cell.RawValue;
    return typeof val === 'number';
  }

  public GetConditionalTone(
    cell?: SpreadsheetCellSpec,
  ): 'success' | 'warning' | 'danger' | 'info' | null {
    if (!cell) return null;
    return SpreadsheetEngine.Instance.GetCellConditionalHighlight(this.ActiveSheet, cell);
  }

  public IsAddressInSelectedRange(rowIndex: number, colIndex: number): boolean {
    const parts = this.SelectedRange.split(':');
    const p1 = ParseCellAddress(parts[0]);
    const p2 = parts.length > 1 ? ParseCellAddress(parts[1]) : p1;
    if (!p1 || !p2) return false;
    const rMin = Math.min(p1.row, p2.row);
    const rMax = Math.max(p1.row, p2.row);
    const cMin = Math.min(p1.col, p2.col);
    const cMax = Math.max(p1.col, p2.col);
    return rowIndex >= rMin && rowIndex <= rMax && colIndex >= cMin && colIndex <= cMax;
  }

  public GetInitials(name: string): string {
    return (name || 'U')
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  public GetCollaborationStatusLabel(): string {
    switch (this.ConnectionStatus) {
      case 'connected':
        return 'Live Sync';
      case 'connecting':
        return 'Connecting…';
      case 'readonly':
        return 'Read-Only';
      case 'revoked':
        return 'Access Revoked';
      case 'error':
        return 'Live sync disconnected';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Saved Locally';
    }
  }

  public RetryLiveCollaboration(): void {
    const artifactId = this.CollaborationSession?.ArtifactID || this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    void this.collaborationService.Retry(artifactId);
  }

  private handleCollaborationMergeConflict(event: CollaborationMergeConflictEvent): void {
    this.StatusBannerMessage = MERGE_CONFLICT_WARNING_MESSAGE;
    this.collaborationService.NotifyMergeConflictToastOnce(event, this.notificationService);
    this.cdr.markForCheck();
  }
}
