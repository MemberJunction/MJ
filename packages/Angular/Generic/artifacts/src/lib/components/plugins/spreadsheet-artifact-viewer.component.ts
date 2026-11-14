import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnInit,
  OnChanges,
  OnDestroy,
  Output,
  Renderer2,
  SimpleChanges,
  ChangeDetectorRef,
  Type,
  ViewChild,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { EscapeSQLString, IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, LogError, RunView, UserInfo, type DataSnapshot, type IMetadataProvider } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CreateJsonSnapshot } from '../../snapshot-helpers';
import {
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJConversationEntity,
  MJConversationDetailEntity,
  ArtifactMetadataEngine,
  BuildArtifactVersionConfigurationWithPreview,
  UserInfoEngine,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SpreadsheetEngine,
  ParseCellAddress,
  ParseRangeAddress,
  FormatCellAddress,
  ColumnIndexToLetter,
  type WorkbookSpec,
  type WorksheetSpec,
  type SpreadsheetCellSpec,
  type SpreadsheetCellFormatType,
  type SpreadsheetCellStyleSpec,
  type SpreadsheetRowSpec,
  type SpreadsheetColumnSpec,
  type SpreadsheetLiveTableSpec,
  type SpreadsheetCalculatedColumnSpec,
  type SpreadsheetChartSpec,
  type SpreadsheetChartType,
  type SpreadsheetChartDataset,
  type SpreadsheetEmbeddedArtifactSpec,
  type SpreadsheetCellEditContext,
  type DocumentBlockSpec,
  type DocumentBlockExecutionResult,
} from '@memberjunction/core-entities';
import type { ContextMenuItem, TouchContextMenuTrigger } from '../context-menu/context-menu.types';
import {
  ComputeElementContextMenuAnchor,
  IsKeyboardContextMenuShortcut,
  ShouldBypassCustomContextMenu,
  TouchContextMenuMonitor,
} from '../context-menu/context-menu-position.util';
import {
  BuildSheetsContextMenu,
  type SheetsClipboardCellEntry,
  type SheetsClipboardSnapshot,
  type SheetsContextMenuCommand,
  type SheetsContextMenuTarget,
} from './context-menus/sheets-context-menu.helper';
import { BaseArtifactViewerPluginComponent, IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import { CaptureThumbnailForDriverIfAllowed } from '../../utils/artifact-dom-capture';
import { SpreadsheetVersionDiffComponent } from '../version-diff/spreadsheet-version-diff.component';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { ARTIFACT_AI_ASSISTANT_ENABLED, RequestArtifactAiAssistant } from '../../services/artifact-ai-assistant-bridge';
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

export const SHEETS_TOOLBAR_PINS_SETTING_KEY = 'MJ.Sheets.Toolbar.PinnedActions';

export type SheetsToolbarItemKey =
  | 'bold'
  | 'currency'
  | 'percent'
  | 'integer'
  | 'date'
  | 'insert-row'
  | 'insert-col'
  | 'sort-asc'
  | 'sort-desc'
  | 'freeze-header'
  | 'live-table'
  | 'insert-query'
  | 'insert-view'
  | 'add-chart'
  | 'add-whiteboard'
  | 'refresh-data'
  | 'import'
  | 'export-xlsx'
  | 'export-csv'
  | 'source-mode'
  | 'diff-mode'
  | 'ask-ai'
  | 'run-ai-formulas'
  | 'protect-range';

export const DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS: readonly SheetsToolbarItemKey[] = [
  'bold',
  'currency',
  'insert-row',
  'insert-col',
  'sort-asc',
  'add-chart',
];

export const SHEETS_CHART_SERIES_COLORS: readonly string[] = [
  'var(--mj-brand-primary, #3b82f6)',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

export interface ActiveChartSeriesItem {
  Index: number;
  Name: string;
  Values: number[];
  Color: string;
}

export interface ChartCategoryTick {
  Index: number;
  X: number;
  ShortLabel: string;
  FullLabel: string;
  Rotated: boolean;
}

export interface ChartBarRect {
  Key: string;
  SeriesIndex: number;
  CategoryIndex: number;
  SeriesName: string;
  Category: string;
  X: number;
  Y: number;
  Width: number;
  Height: number;
  Color: string;
  Value: number;
  FormattedValue: string;
}

export interface ChartLinePoint {
  Index: number;
  X: number;
  Y: number;
  LabelY: number;
  Category: string;
  Value: number;
  FormattedValue: string;
}

export interface ChartLineSeriesItem {
  SeriesIndex: number;
  Name: string;
  Color: string;
  PolylinePoints: string;
  AreaPath: string;
  ShowPointLabels: boolean;
  Points: ChartLinePoint[];
}

export interface ChartPieSlice {
  Index: number;
  Category: string;
  ShortCategory: string;
  RawValue: number;
  FormattedValue: string;
  PercentLabel: string;
  Color: string;
  Path: string;
  IsFullCircle: boolean;
}

export interface ResolvedSheetsToolbarItem {
  Key: SheetsToolbarItemKey;
  Label: string;
  ShortLabel?: string;
  Description: string;
  Icon: string;
  Category: 'Format' | 'Structure' | 'Insert & Data' | 'Export & View';
  Placement: 'left' | 'right';
  TestId: string;
  Active: boolean;
  Disabled?: boolean;
  Visible: boolean;
}

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mj-sheets-shell"
      data-testid="mj-sheets-shell"
      (pointerdown)="OnShellPointerDown($event)"
      (pointermove)="OnShellPointerMove($event)"
      (pointerup)="OnShellPointerUp($event)"
      (pointercancel)="OnShellPointerCancel($event)"
    >
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
          </div>

          @if ((WorkspaceMode === 'source' && !IsToolbarItemShownOnBar('source-mode')) || (WorkspaceMode === 'diff' && !IsToolbarItemShownOnBar('diff-mode'))) {
            <button
              type="button"
              class="mj-sheets-active-mode-chip"
              [title]="'Viewing ' + (WorkspaceMode === 'source' ? 'Workbook JSON Source' : 'Version Diff') + ' — click to return to Grid'"
              data-testid="sheets-active-mode-chip"
              (click)="SetWorkspaceMode('grid')"
            >
              <i class="fa-solid" [class.fa-code]="WorkspaceMode === 'source'" [class.fa-code-compare]="WorkspaceMode === 'diff'"></i>
              <span>{{ WorkspaceMode === 'source' ? 'Source' : 'Diff' }}</span>
              <i class="fa-solid fa-xmark"></i>
            </button>
          }

          @if (CanEdit) {
            <div class="mj-sheets-undo-group" role="group" aria-label="Undo and Redo">
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-tool-btn--icon"
                [disabled]="!CanUndo"
                (click)="UndoWorkbook()"
                title="Undo (Cmd/Ctrl+Z)"
                data-testid="sheet-undo-btn"
              >
                <i class="fa-solid fa-rotate-left"></i>
              </button>
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-tool-btn--icon"
                [disabled]="!CanRedo"
                (click)="RedoWorkbook()"
                title="Redo (Cmd/Ctrl+Shift+Z)"
                data-testid="sheet-redo-btn"
              >
                <i class="fa-solid fa-rotate-right"></i>
              </button>
            </div>
          }
        </div>

        @if (WorkspaceMode === 'grid' && CanEdit) {
          <!-- Pinned Left Formatting & Structure Actions (UserInfoEngine-persisted) -->
          <div class="mj-sheets-toolbar-group" data-testid="sheets-pinned-left-group">
            @for (item of PinnedLeftToolbarItems; track item.Key) {
              <button
                type="button"
                class="mj-sheets-tool-btn"
                [class.active]="item.Active"
                [disabled]="item.Disabled"
                (click)="ExecuteToolbarItem(item, false)"
                [title]="item.Description"
                [attr.data-testid]="item.TestId"
              >
                <i class="fa-solid" [ngClass]="item.Icon"></i>
                @if (item.ShortLabel) {
                  <span>{{ item.ShortLabel }}</span>
                }
              </button>
            }
          </div>
        }

        <!-- Right-side Pinned Actions, Save, Comments, Tools & View Menu, Presence -->
        <div class="mj-sheets-toolbar-group mj-sheets-toolbar-right">
          @for (item of PinnedRightToolbarItems; track item.Key) {
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="item.Active"
              [disabled]="item.Disabled"
              (click)="ExecuteToolbarItem(item, false)"
              [title]="item.Description"
              [attr.data-testid]="item.TestId"
            >
              <i class="fa-solid" [ngClass]="item.Icon" [class.fa-spin]="item.Key === 'refresh-data' && IsRefreshingData"></i>
              @if (item.ShortLabel) {
                <span>{{ item.ShortLabel }}</span>
              }
            </button>
          }

          @if (CanEdit && WorkspaceMode === 'grid') {
            @if (PendingAiFormulaCount > 0) {
              <button
                type="button"
                class="mj-sheets-tool-btn active"
                [disabled]="IsEvaluatingAiFormulas"
                (click)="RunAiFormulas()"
                title="Evaluate opt-in =MJ.AI formulas in this workbook"
                data-testid="sheets-run-ai-formulas-btn"
              >
                <i class="fa-solid" [ngClass]="IsEvaluatingAiFormulas ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
                <span>Run AI Formulas ({{ PendingAiFormulaCount }})</span>
              </button>
            }
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="IsSelectedRangeProtected"
              (click)="ToggleSelectedRangeProtection()"
              [title]="IsSelectedRangeProtected ? 'Remove range protection' : 'Protect selected range (' + SelectedRange + ')'"
              data-testid="sheets-protect-range-quick-btn"
            >
              <i class="fa-solid" [ngClass]="IsSelectedRangeProtected ? 'fa-lock' : 'fa-lock-open'"></i>
              <span>{{ IsSelectedRangeProtected ? 'Protected' : 'Protect' }}</span>
            </button>
            @if (IsAiAssistantEnabled) {
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-save-btn"
                (click)="OpenAskAiForSpreadsheet()"
                title="Open slide-in AI Assistant for this spreadsheet selection"
                data-testid="sheets-ask-ai-quick-btn"
              >
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Ask AI</span>
              </button>
            }
          }

          @if (CanEdit) {
            <input
              #fileInput
              type="file"
              accept=".xlsx,.csv"
              style="display: none"
              (change)="OnImportFileSelected($event)"
              data-testid="sheet-import-file-input"
            />
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

          <div class="mj-sheets-more-anchor" #moreToolsAnchor>
            <button
              type="button"
              class="mj-sheets-tool-btn"
              [class.active]="ShowMoreToolsMenu"
              aria-haspopup="menu"
              [attr.aria-expanded]="ShowMoreToolsMenu"
              title="Tools & View — pin favorite actions to your toolbar"
              data-testid="sheets-more-tools-btn"
              (click)="ToggleMoreToolsMenu()"
            >
              <i class="fa-solid fa-ellipsis"></i>
            </button>

            @if (ShowMoreToolsMenu) {
              <div class="mj-sheets-more-menu" role="menu" data-testid="sheets-more-tools-menu">
                <div class="mj-sheets-more-menu-header">
                  <div>
                    <span class="mj-sheets-more-menu-title">Tools &amp; View</span>
                    <span class="mj-sheets-more-menu-hint">
                      Pin up to {{ MaxPinnedToolbarActions }} actions ({{ PinnedToolbarActions.length }}/{{ MaxPinnedToolbarActions }})
                    </span>
                  </div>
                  @if (HasCustomToolbarPreferences) {
                    <button
                      type="button"
                      class="mj-sheets-more-reset-btn"
                      data-testid="sheets-reset-toolbar-btn"
                      (click)="ResetToolbarPreferences()"
                    >
                      Reset
                    </button>
                  }
                </div>

                @for (section of OverflowToolbarSections; track section.Category) {
                  <div class="mj-sheets-more-section">
                    <div class="mj-sheets-more-section-label">{{ section.Category }}</div>
                    @for (item of section.Items; track item.Key) {
                      <div class="mj-sheets-more-row">
                        <button
                          type="button"
                          class="mj-sheets-more-action"
                          [class.active]="item.Active"
                          [disabled]="item.Disabled"
                          role="menuitem"
                          [attr.data-testid]="'sheets-overflow-' + item.Key"
                          (click)="ExecuteToolbarItem(item, true)"
                        >
                          <i class="fa-solid" [ngClass]="item.Icon"></i>
                          <div class="mj-sheets-more-action-text">
                            <span class="mj-sheets-more-action-label">{{ item.Label }}</span>
                            <span class="mj-sheets-more-action-desc">{{ item.Description }}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          class="mj-sheets-pin-btn"
                          [class.pinned]="IsToolbarItemPinned(item.Key)"
                          [disabled]="!IsToolbarItemPinned(item.Key) && PinnedToolbarActions.length >= MaxPinnedToolbarActions"
                          [title]="IsToolbarItemPinned(item.Key) ? 'Unpin from toolbar' : 'Pin to toolbar'"
                          [attr.data-testid]="'sheets-pin-btn-' + item.Key"
                          (click)="TogglePinToolbarAction(item.Key, $event)"
                        >
                          <i class="fa-solid fa-thumbtack"></i>
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>

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

          @let activeHumanCollabs = GetRemoteHumanCollaborators();
          @if (activeHumanCollabs.length > 0) {
            <div class="mj-sheets-presence-strip" data-testid="sheets-presence-strip">
              @for (collab of activeHumanCollabs; track collab.ClientID) {
                <span
                  class="mj-sheets-presence-avatar"
                  [style.background]="collab.Color"
                  [title]="collab.Name + (collab.ActiveBlockID ? ' (' + collab.ActiveBlockID + ')' : '')"
                  (click)="JumpToCollaboratorSelection(collab)"
                  [attr.data-testid]="'sheet-presence-avatar-' + collab.ClientID"
                >
                  {{ GetInitials(collab.Name) }}
                  @if (collab.ActiveBlockID) {
                    <span class="mj-sheets-presence-range-tag">{{ collab.ActiveBlockID }}</span>
                  }
                </span>
              }
            </div>
          }
          <mj-artifact-agent-presence-bar
            [Collaborators]="GetRemoteCollaborators()"
            ActiveDomain="spreadsheet"
            (JumpToAgentLocation)="JumpToCollaboratorSelection($event)"
          ></mj-artifact-agent-presence-bar>
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
            (ngModelChange)="OnSelectedRangeInputChange($event)"
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
            <div
              #sheetsGridContainer
              class="mj-sheets-grid-scroll"
              tabindex="0"
              data-testid="sheets-grid-container"
              (copy)="OnGridCopy($event)"
              (paste)="OnGridPaste($event)"
            >
              <div class="mj-sheets-grid-canvas" data-testid="sheets-grid-canvas">
              <table
                class="mj-sheets-grid-table"
                role="grid"
                [attr.aria-label]="ActiveSheet.Name"
                (mouseup)="OnCellMouseUp()"
                (mouseleave)="OnCellMouseUp()"
              >
                <thead>
                  <tr>
                    <th class="mj-sheets-corner-header">#</th>
                    @for (col of VisibleColumns; track col.ColumnID) {
                      <th
                        class="mj-sheets-col-header"
                        [class.selected]="col.Letter === ActiveColumnLetter"
                        [class.in-range]="IsColumnInSelectedRange(col.Index)"
                        [class.mj-sheets-frozen-col]="col.Index <= ActiveSheet.FrozenColumns"
                        [style.left.px]="col.Index <= ActiveSheet.FrozenColumns ? GetFrozenColumnLeftPx(col.Index) : null"
                        [style.min-width.px]="(col.Width ?? 14) * 8"
                        [attr.data-col-id]="col.ColumnID"
                        [attr.data-testid]="'sheet-col-header-' + col.Letter"
                        (click)="SelectColumnHeader(col.Letter, $event)"
                        (contextmenu)="OnColumnHeaderContextMenu($event, col)"
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
                        @if (CanEdit) {
                          <span
                            class="mj-sheets-col-resize-handle"
                            title="Drag to resize column"
                            [attr.data-testid]="'sheet-col-resize-' + col.Letter"
                            (mousedown)="StartColumnResize(col.ColumnID, $event)"
                            (click)="$event.stopPropagation()"
                          ></span>
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of VisibleRows; track row.RowID) {
                    <tr
                      [class.mj-sheets-frozen-row]="row.Index <= ActiveSheet.FrozenRows"
                      [style.height.px]="row.Height ?? null"
                      [attr.data-row-id]="row.RowID"
                    >
                      <td
                        class="mj-sheets-row-header"
                        [class.selected]="row.Index === ActiveRowIndex"
                        [class.in-range]="IsRowInSelectedRange(row.Index)"
                        [attr.data-testid]="'sheet-row-header-' + row.Index"
                        (click)="SelectRowHeader(row.Index, $event)"
                        (contextmenu)="OnRowHeaderContextMenu($event, row.Index)"
                      >
                        {{ row.Index }}
                        @if (CanEdit) {
                          <span
                            class="mj-sheets-row-resize-handle"
                            title="Drag to resize row"
                            [attr.data-testid]="'sheet-row-resize-' + row.Index"
                            (mousedown)="StartRowResize(row.RowID, $event)"
                            (click)="$event.stopPropagation()"
                          ></span>
                        }
                      </td>
                      @for (col of VisibleColumns; track col.ColumnID) {
                        @let addr = col.Letter + row.Index;
                        @let cell = ActiveSheet.Cells[addr];
                        @let condTone = GetConditionalTone(cell);
                        @let peerColor = GetCellCollaboratorBorderColor(row.Index, col.Index);
                        @let peerBadge = GetCellPrimaryCollaboratorBadge(row.Index, col.Index);
                        @let cellComments = GetCellCommentThreads(row.Index, col.Index);
                        <td
                          class="mj-sheets-cell"
                          [class.active]="addr === ActiveCellAddress"
                          [class.in-range]="IsAddressInSelectedRange(row.Index, col.Index)"
                          [class.mj-sheets-frozen-col]="col.Index <= ActiveSheet.FrozenColumns"
                          [style.left.px]="col.Index <= ActiveSheet.FrozenColumns ? GetFrozenColumnLeftPx(col.Index) : null"
                          [class.mj-sheets-cell-cut-source]="IsCellInCutSource(row.Index, col.Index)"
                          [class.has-peer-selection]="!!peerColor"
                          [style.--mj-sheets-peer-color]="peerColor"
                          [style.color]="cell?.Style?.TextColor || null"
                          [style.background-color]="cell?.Style?.BackgroundColor || null"
                          [class.has-comment]="cellComments.length > 0"
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
                          (mousedown)="OnCellMouseDown(row.Index, col.Index, $event)"
                          (mouseup)="OnCellMouseUp()"
                          (click)="OnCellClick(row.Index, col.Index, $event)"
                          (dblclick)="BeginInlineCellEdit(row.Index, col.Index)"
                          (contextmenu)="OnCellContextMenu($event, row.Index, col.Index)"
                        >
                          @if (peerBadge) {
                            <span
                              class="mj-sheets-peer-cell-badge"
                              [style.background]="peerBadge.Color"
                              [title]="peerBadge.ActionSummary || peerBadge.Name"
                              [attr.data-testid]="'sheet-peer-badge-' + addr"
                            >
                              @if (peerBadge.IsAgent) {
                                <i class="fa-solid fa-robot"></i>
                              }
                              {{ peerBadge.AgentName || peerBadge.Name }}
                              @if (peerBadge.ActingForUserName) {
                                <span class="mj-sheets-peer-cell-actor">for {{ peerBadge.ActingForUserName }}</span>
                              }
                            </span>
                          }
                          @if (InlineEditingAddress === addr && CanEdit) {
                            <input
                              type="text"
                              class="mj-sheets-inline-cell-input"
                              [(ngModel)]="InlineEditValue"
                              (mousedown)="$event.stopPropagation()"
                              (click)="$event.stopPropagation()"
                              (dblclick)="$event.stopPropagation()"
                              (blur)="CommitInlineCellEdit()"
                              (keydown.enter)="CommitInlineCellEdit()"
                              (keydown.tab)="OnInlineEditTab($event)"
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
                            @if (cellComments.length > 0) {
                              <span
                                class="mj-sheets-comment-corner"
                                [attr.data-testid]="'sheet-comment-corner-' + addr"
                                (click)="OpenCommentThreadFromCell(cellComments[0], $event)"
                              ></span>
                              <div
                                class="mj-sheets-comment-hover-bubble"
                                [attr.data-testid]="'sheet-comment-bubble-' + addr"
                                (click)="OpenCommentThreadFromCell(cellComments[0], $event)"
                              >
                                @for (thread of cellComments; track thread.ConversationID) {
                                  <div class="mj-sheets-comment-bubble-thread">
                                    <div class="mj-sheets-comment-bubble-header">
                                      <span class="mj-sheets-comment-bubble-author">
                                        <i class="fa-solid fa-comment-dots"></i>
                                        {{ thread.Messages[0]?.UserName || 'Comment' }}
                                      </span>
                                      <span class="mj-sheets-comment-bubble-anchor">{{ thread.AnchorLabel }}</span>
                                    </div>
                                    <div class="mj-sheets-comment-bubble-body">
                                      {{ thread.Messages[thread.Messages.length - 1]?.Message }}
                                    </div>
                                    @if (thread.Messages.length > 1) {
                                      <div class="mj-sheets-comment-bubble-meta">
                                        {{ thread.Messages.length }} messages · {{ thread.Status }}
                                      </div>
                                    }
                                  </div>
                                }
                              </div>
                            }
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>

              <!-- Floating In-Sheet Range Charts (Placement === 'sheet') -->
              @for (chart of FloatingCharts; track chart.ChartID) {
                <div
                  class="mj-sheets-floating-chart mj-sheets-object-card mj-sheets-chart-card"
                  [style.left.px]="GetFloatingChartLeftPx(chart)"
                  [style.top.px]="GetFloatingChartTopPx(chart)"
                  [style.width.px]="chart.WidthPx ?? 400"
                  [style.min-height.px]="chart.HeightPx ?? 240"
                  [attr.data-testid]="'sheet-floating-chart-' + chart.ChartID"
                  [attr.data-chart-id]="chart.ChartID"
                  (mousedown)="$event.stopPropagation()"
                  (dblclick)="OpenChartEditorModal(chart, $event)"
                  (contextmenu)="OnChartContextMenu($event, chart)"
                >
                  <ng-container
                    [ngTemplateOutlet]="chartCardTpl"
                    [ngTemplateOutletContext]="{ chart: chart, floating: true }"
                  ></ng-container>
                  @if (CanEdit) {
                    <span
                      class="mj-sheets-chart-resize-handle"
                      title="Drag to resize chart"
                      [attr.data-testid]="'sheet-chart-resize-' + chart.ChartID"
                      (mousedown)="StartChartResize(chart, $event)"
                    ></span>
                  }
                </div>
              }
              </div>
            </div>

            <!-- Resizable Dock Splitter + Bound Live Tables, Range Charts & Inline OLE Whiteboards Strip -->
            @if (HasDockedObjects) {
              <div
                class="mj-sheets-objects-splitter"
                data-testid="sheets-objects-splitter"
                role="separator"
                aria-orientation="horizontal"
                title="Drag to resize bottom pane · Double-click to reset height"
                (mousedown)="StartObjectsPaneResize($event)"
                (dblclick)="ResetObjectsPaneHeight()"
              >
                <span class="mj-sheets-objects-splitter-pill"></span>
              </div>
              <div
                class="mj-sheets-objects-strip"
                data-testid="sheets-objects-strip"
                [style.height.px]="ResolvedObjectsPaneHeightPx"
              >
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
                          (contextmenu)="OnLiveTableContextMenu($event, table)"
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

                <!-- Docked Range Charts (§ 6.3, Accept #5) -->
                @if (DockedCharts.length > 0) {
                  <div class="mj-sheets-objects-section" data-testid="sheets-charts-section">
                    <div class="mj-sheets-section-header">
                      <i class="fa-solid fa-chart-column"></i>
                      <span>Live Range Charts ({{ DockedCharts.length }})</span>
                    </div>
                    <div class="mj-sheets-cards-row">
                      @for (chart of DockedCharts; track chart.ChartID) {
                        <div
                          class="mj-sheets-object-card mj-sheets-chart-card"
                          [style.flex-basis.px]="chart.WidthPx ?? null"
                          [attr.data-testid]="'sheet-chart-card-' + chart.ChartID"
                          (dblclick)="OpenChartEditorModal(chart, $event)"
                          (contextmenu)="OnChartContextMenu($event, chart)"
                        >
                          <ng-container
                            [ngTemplateOutlet]="chartCardTpl"
                            [ngTemplateOutletContext]="{ chart: chart, floating: false }"
                          ></ng-container>
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
                          (contextmenu)="OnEmbeddedArtifactContextMenu($event, emb)"
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
                    (dblclick)="BeginRenameWorksheetTab(ws.SheetID, $event)"
                    (contextmenu)="OnWorksheetTabContextMenu($event, ws)"
                    [attr.data-testid]="'sheet-tab-' + ws.SheetID"
                  >
                    <i class="fa-solid fa-table"></i>
                    @if (RenamingSheetID === ws.SheetID) {
                      <input
                        type="text"
                        class="mj-sheets-tab-rename-input"
                        [(ngModel)]="RenameSheetDraftName"
                        (click)="$event.stopPropagation()"
                        (keydown.enter)="CommitRenameWorksheetTab()"
                        (keydown.escape)="CancelRenameWorksheetTab()"
                        (blur)="CommitRenameWorksheetTab()"
                        aria-label="Rename Worksheet"
                        data-testid="sheet-tab-rename-input"
                      />
                    } @else {
                      <span>{{ ws.Name }}</span>
                    }
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

      <!-- Reusable Chart Card & SVG Templates (shared by Docked Strip, Floating Sheet Overlay, and Properties Preview) -->
      <ng-template #chartCardTpl let-chart="chart" let-floating="floating">
        @let dataset = GetChartDataset(chart);
        <div
          class="mj-sheets-card-top"
          [class.mj-sheets-chart-card-draggable]="floating && CanEdit"
          (mousedown)="floating ? StartChartDrag(chart, $event) : null"
        >
          <div class="mj-sheets-chart-title-wrap">
            @if (floating && CanEdit) {
              <span class="mj-sheets-chart-drag-grip" title="Drag chart to reposition on sheet">
                <i class="fa-solid fa-grip-vertical"></i>
              </span>
            }
            <div>
              <strong class="mj-sheets-card-title">{{ chart.Title }}</strong>
              <span class="mj-sheets-card-meta">
                Range: <code>{{ chart.SourceRange }}</code> · {{ chart.ChartType | uppercase }}@if (floating && chart.PositionCell) { · &#64; {{ chart.PositionCell }}}
              </span>
            </div>
          </div>
          <div class="mj-sheets-action-btns" (mousedown)="$event.stopPropagation()">
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
            @if (CanEdit) {
              <button
                type="button"
                class="mj-sheets-mini-btn"
                (click)="OpenChartEditorModal(chart, $event)"
                title="Edit chart range, series, layout & appearance"
                [attr.data-testid]="'sheet-chart-edit-' + chart.ChartID"
              >
                <i class="fa-solid fa-sliders"></i>
              </button>
              <button
                type="button"
                class="mj-sheets-mini-btn"
                (click)="ToggleChartPlacement(chart)"
                [title]="floating ? 'Dock chart below sheet' : 'Move chart onto sheet canvas'"
                [attr.data-testid]="'sheet-chart-placement-' + chart.ChartID"
              >
                <i class="fa-solid" [class.fa-down-left-and-up-right-to-center]="floating" [class.fa-up-right-from-square]="!floating"></i>
                <span>{{ floating ? 'Dock' : 'On Sheet' }}</span>
              </button>
            }
            <button
              type="button"
              class="mj-sheets-mini-btn"
              (click)="CopySlideBlockDescriptorForChart(chart)"
              title="Copy Live Artifact Block JSON for MJ Slides / MJ Docs"
              [attr.data-testid]="'sheet-chart-copy-block-' + chart.ChartID"
            >
              <i class="fa-solid fa-share-from-square"></i>
            </button>
            @if (CanEdit) {
              <button
                type="button"
                class="mj-sheets-mini-btn"
                (click)="RemoveRangeChart(chart)"
                title="Remove chart"
                [attr.data-testid]="'sheet-chart-remove-' + chart.ChartID"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            }
          </div>
        </div>

        @if (dataset && dataset.Categories.length > 0 && dataset.Series.length > 0) {
          @if (chart.ShowLegend !== false && dataset.Series.length > 1 && chart.ChartType !== 'pie') {
            <div class="mj-sheets-chart-series-bar">
              @for (s of dataset.Series; track s.Name; let sIdx = $index) {
                <button
                  type="button"
                  class="mj-sheets-series-pill"
                  [class.active]="IsChartSeriesSelected(chart, dataset, sIdx)"
                  (click)="SetChartSeriesSelection(chart.ChartID, sIdx)"
                >
                  <span
                    class="mj-sheets-series-dot"
                    [style.background]="GetChartSeriesColor(sIdx)"
                  ></span>
                  <span>{{ s.Name }}</span>
                </button>
              }
              <button
                type="button"
                class="mj-sheets-series-pill"
                [class.active]="IsAllChartSeriesSelected(chart, dataset)"
                (click)="SetChartSeriesSelection(chart.ChartID, 'all')"
              >
                <span>All</span>
              </button>
            </div>
          } @else if (chart.ShowLegend !== false && dataset.Series.length > 1 && chart.ChartType === 'pie') {
            <div class="mj-sheets-chart-series-bar">
              @for (s of dataset.Series; track s.Name; let sIdx = $index) {
                <button
                  type="button"
                  class="mj-sheets-series-pill"
                  [class.active]="IsChartSeriesSelected(chart, dataset, sIdx)"
                  (click)="SetChartSeriesSelection(chart.ChartID, sIdx)"
                >
                  <span
                    class="mj-sheets-series-dot"
                    [style.background]="GetChartSeriesColor(sIdx)"
                  ></span>
                  <span>{{ s.Name }}</span>
                </button>
              }
            </div>
          }

          <div
            class="mj-sheets-chart-Stage"
            [attr.data-testid]="'sheet-chart-svg-' + chart.ChartID"
          >
            <ng-container
              [ngTemplateOutlet]="chartSvgTpl"
              [ngTemplateOutletContext]="{ chart: chart, dataset: dataset }"
            ></ng-container>
          </div>
        } @else {
          <div class="mj-sheets-chart-empty" data-testid="sheet-chart-empty-hint">
            <i class="fa-solid fa-circle-info"></i>
            <span>
              No numeric values found in <code>{{ chart.SourceRange }}</code>. Use the
              <i class="fa-solid fa-sliders"></i> editor to adjust range, headers, or orientation.
            </span>
          </div>
        }
      </ng-template>

      <ng-template #chartSvgTpl let-chart="chart" let-dataset="dataset">
        @let activeSeries = GetActiveChartSeries(chart, dataset);
        @let maxVal = GetChartMaxValueForSeries(activeSeries);
        <svg viewBox="0 0 380 180" class="mj-sheets-chart-svg">
          @if (chart.ChartType === 'pie') {
            @let pieSlices = GetChartPieSlices(chart, dataset, activeSeries);
            @if (pieSlices.length === 0) {
              <text x="190" y="92" text-anchor="middle" font-size="11" fill="var(--mj-text-secondary)">
                All values are 0 in this series.
              </text>
            } @else {
              @for (slice of pieSlices; track slice.Index) {
                <g>
                  @if (slice.IsFullCircle) {
                    <circle cx="96" cy="90" r="62" [attr.fill]="slice.Color">
                      <title>{{ slice.Category }}: {{ slice.RawValue }} ({{ slice.PercentLabel }})</title>
                    </circle>
                  } @else {
                    <path [attr.d]="slice.Path" [attr.fill]="slice.Color" stroke="var(--mj-bg-surface)" stroke-width="1.5">
                      <title>{{ slice.Category }}: {{ slice.RawValue }} ({{ slice.PercentLabel }})</title>
                    </path>
                  }
                  @if (slice.Index < 7) {
                    <rect
                      x="174"
                      [attr.y]="22 + slice.Index * 21"
                      width="9"
                      height="9"
                      rx="2"
                      [attr.fill]="slice.Color"
                    />
                    <text
                      x="188"
                      [attr.y]="30 + slice.Index * 21"
                      font-size="9.5"
                      fill="var(--mj-text-primary)"
                    >
                      {{ slice.ShortCategory }} · {{ slice.PercentLabel }} ({{ slice.FormattedValue }})
                    </text>
                  }
                </g>
              }
            }
          } @else {
            <!-- Cartesian gridlines and Y-axis ticks -->
            <line x1="44" y1="18" x2="366" y2="18" stroke="var(--mj-border-subtle)" stroke-dasharray="2,2" />
            <line x1="44" y1="79" x2="366" y2="79" stroke="var(--mj-border-subtle)" stroke-dasharray="2,2" />
            <line x1="44" y1="140" x2="366" y2="140" stroke="var(--mj-border-default)" />
            <text x="40" y="21" text-anchor="end" font-size="8.5" fill="var(--mj-text-secondary)">
              {{ FormatChartValue(maxVal) }}
            </text>
            <text x="40" y="82" text-anchor="end" font-size="8.5" fill="var(--mj-text-secondary)">
              {{ FormatChartValue(maxVal / 2) }}
            </text>
            <text x="40" y="143" text-anchor="end" font-size="8.5" fill="var(--mj-text-secondary)">
              0
            </text>

            @if (chart.ChartType === 'line' || chart.ChartType === 'area') {
              @let lineSeries = GetChartLineSeries(dataset, activeSeries, maxVal, chart);
              @for (ls of lineSeries; track ls.SeriesIndex) {
                <g>
                  @if (chart.ChartType === 'area' && ls.AreaPath) {
                    <path [attr.d]="ls.AreaPath" [attr.fill]="ls.Color" fill-opacity="0.2" />
                  }
                  @if (ls.PolylinePoints) {
                    <polyline
                      fill="none"
                      [attr.stroke]="ls.Color"
                      stroke-width="2.2"
                      stroke-linejoin="round"
                      stroke-linecap="round"
                      [attr.points]="ls.PolylinePoints"
                    />
                  }
                  @for (pt of ls.Points; track pt.Index) {
                    <g>
                      <circle
                        [attr.cx]="pt.X"
                        [attr.cy]="pt.Y"
                        r="3.8"
                        [attr.fill]="ls.Color"
                        stroke="var(--mj-bg-surface)"
                        stroke-width="1.4"
                      >
                        <title>{{ pt.Category }} · {{ ls.Name }}: {{ pt.Value }}</title>
                      </circle>
                      @if (ls.ShowPointLabels) {
                        <text
                          [attr.x]="pt.X"
                          [attr.y]="pt.LabelY"
                          text-anchor="middle"
                          font-size="8.5"
                          fill="var(--mj-text-primary)"
                          [attr.data-testid]="ls.SeriesIndex === 0 ? 'sheet-chart-val-' + chart.ChartID + '-' + pt.Index : null"
                        >
                          {{ pt.FormattedValue }}
                        </text>
                      }
                    </g>
                  }
                </g>
              }
              @for (xt of GetChartCategoryTicks(dataset.Categories); track xt.Index) {
                <text
                  [attr.x]="xt.X"
                  y="153"
                  [attr.text-anchor]="xt.Rotated ? 'end' : 'middle'"
                  [attr.transform]="xt.Rotated ? 'rotate(-20 ' + xt.X + ' 153)' : null"
                  font-size="8.5"
                  fill="var(--mj-text-secondary)"
                >
                  <title>{{ xt.FullLabel }}</title>
                  {{ xt.ShortLabel }}
                </text>
              }
            } @else {
              <!-- Bar Chart -->
              @let bars = GetChartBarRects(chart, dataset, activeSeries, maxVal);
              @for (bar of bars; track bar.Key) {
                <g>
                  <rect
                    [attr.x]="bar.X"
                    [attr.y]="bar.Y"
                    [attr.width]="bar.Width"
                    [attr.height]="bar.Height"
                    rx="2.5"
                    [attr.fill]="bar.Color"
                  >
                    <title>{{ bar.Category }} · {{ bar.SeriesName }}: {{ bar.Value }}</title>
                  </rect>
                  @if (chart.ShowDataLabels === true || (chart.ShowDataLabels !== false && bars.length <= 12)) {
                    <text
                      [attr.x]="bar.X + bar.Width / 2"
                      [attr.y]="bar.Y > 14 ? bar.Y - 3 : 12"
                      text-anchor="middle"
                      font-size="8.5"
                      fill="var(--mj-text-primary)"
                      [attr.data-testid]="bar.SeriesIndex === 0 ? 'sheet-chart-val-' + chart.ChartID + '-' + bar.CategoryIndex : null"
                    >
                      {{ bar.FormattedValue }}
                    </text>
                  }
                </g>
              }
              @for (xt of GetChartCategoryTicks(dataset.Categories); track xt.Index) {
                <text
                  [attr.x]="xt.X"
                  y="153"
                  [attr.text-anchor]="xt.Rotated ? 'end' : 'middle'"
                  [attr.transform]="xt.Rotated ? 'rotate(-20 ' + xt.X + ' 153)' : null"
                  font-size="8.5"
                  fill="var(--mj-text-secondary)"
                >
                  <title>{{ xt.FullLabel }}</title>
                  {{ xt.ShortLabel }}
                </text>
              }
            }
          }
        </svg>
      </ng-template>

      <!-- World-Class Chart & Range Properties Editor Modal -->
      @if (EditingChartDraft) {
        @let previewDataset = GetChartEditorPreviewDataset();
        <div
          class="mj-sheets-modal-backdrop"
          data-testid="sheets-chart-editor-modal"
          (click)="CloseChartEditorModal()"
        >
          <div
            class="mj-sheets-modal-dialog mj-sheets-chart-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Chart and range properties editor"
            (click)="$event.stopPropagation()"
          >
            <div class="mj-sheets-modal-header">
              <i class="fa-solid fa-sliders"></i>
              <h3>Edit Chart &amp; Data Range</h3>
            </div>
            <div class="mj-sheets-chart-editor-grid">
              <div class="mj-sheets-modal-body mj-sheets-chart-editor-controls">
                <div class="mj-sheets-form-row">
                  <label>Chart Title</label>
                  <input
                    type="text"
                    class="mj-sheets-modal-input"
                    [(ngModel)]="EditingChartDraft.Title"
                    placeholder="Chart title"
                    data-testid="chart-editor-title"
                  />
                </div>

                <div class="mj-sheets-form-row">
                  <label>Chart Type</label>
                  <div class="mj-sheets-segmented-group">
                    @for (t of ['bar', 'line', 'area', 'pie']; track t) {
                      <button
                        type="button"
                        class="mj-sheets-seg-btn"
                        [class.active]="EditingChartDraft.ChartType === t"
                        (click)="SetChartEditorType(t)"
                        [attr.data-testid]="'chart-editor-type-' + t"
                      >
                        {{ t | titlecase }}
                      </button>
                    }
                  </div>
                </div>

                <div class="mj-sheets-form-row">
                  <label>Data Range (supports contiguous <code>A1:C6</code> or unions <code>A1:A6,D1:D6</code>)</label>
                  <div class="mj-sheets-range-input-row">
                    <input
                      type="text"
                      class="mj-sheets-modal-input mj-sheets-range-field"
                      [(ngModel)]="EditingChartDraft.SourceRange"
                      (ngModelChange)="OnChartEditorRangeInputChanged()"
                      placeholder="e.g. A1:D8 or A1:A8,C1:D8"
                      data-testid="chart-editor-range"
                    />
                    <button
                      type="button"
                      class="mj-sheets-mini-btn"
                      (click)="ApplyCurrentSelectionToChartEditor()"
                      title="Use current worksheet selection"
                      data-testid="chart-editor-use-selection"
                    >
                      <i class="fa-solid fa-vector-square"></i> Selection ({{ SelectedRange }})
                    </button>
                  </div>
                  @if (previewDataset && previewDataset.Categories.length > 0 && previewDataset.Series.length > 0) {
                    <span class="mj-sheets-range-status valid" data-testid="chart-editor-range-status">
                      <i class="fa-solid fa-circle-check"></i>
                      {{ previewDataset.Categories.length }} categories · {{ previewDataset.Series.length }} active series
                    </span>
                  } @else {
                    <span class="mj-sheets-range-status invalid" data-testid="chart-editor-range-status">
                      <i class="fa-solid fa-triangle-exclamation"></i>
                      Enter a valid range containing categories and numeric values.
                    </span>
                  }
                </div>

                <div class="mj-sheets-two-col-row">
                  <div class="mj-sheets-form-row">
                    <label>Headers</label>
                    <select
                      class="mj-sheets-modal-input"
                      [ngModel]="GetChartEditorHeaderModeValue()"
                      (ngModelChange)="SetChartEditorHeaderMode($event)"
                      data-testid="chart-editor-header-mode"
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="true">First row/col is header</option>
                      <option value="false">No header row</option>
                    </select>
                  </div>
                  <div class="mj-sheets-form-row">
                    <label>Series Orientation</label>
                    <select
                      class="mj-sheets-modal-input"
                      [ngModel]="EditingChartDraft.SeriesOrientation ?? 'columns'"
                      (ngModelChange)="OnChartEditorOrientationChanged($event)"
                      data-testid="chart-editor-orientation"
                    >
                      <option value="columns">Columns as series</option>
                      <option value="rows">Rows as series</option>
                    </select>
                  </div>
                </div>

                @if (previewDataset?.DetectedColumns && previewDataset!.DetectedColumns!.length > 0) {
                  <div class="mj-sheets-form-row">
                    <label>Category / X-Axis {{ EditingChartDraft.SeriesOrientation === 'rows' ? 'Row' : 'Column' }}</label>
                    <select
                      class="mj-sheets-modal-input"
                      [ngModel]="GetChartEditorCategoryIndexValue(previewDataset!)"
                      (ngModelChange)="OnChartEditorCategoryChanged($event)"
                      data-testid="chart-editor-category-col"
                    >
                      @for (dc of previewDataset!.DetectedColumns!; track dc.Index) {
                        <option [ngValue]="dc.Index">
                          {{ dc.Name }} ({{ EditingChartDraft.SeriesOrientation === 'rows' ? 'Row' : 'Col' }} {{ dc.Index + 1 }}{{ dc.IsNumeric ? ' · numeric' : '' }})
                        </option>
                      }
                    </select>
                  </div>

                  @let candidateSeries = GetChartEditorSeriesCandidates(previewDataset!);
                  @if (candidateSeries.length > 0) {
                    <div class="mj-sheets-form-row">
                      <label>Plotted Series</label>
                      <div class="mj-sheets-series-check-list">
                        @for (sc of candidateSeries; track sc.Index; let cIdx = $index) {
                          <label class="mj-sheets-series-check-item">
                            <input
                              type="checkbox"
                              [checked]="IsChartEditorSeriesIncluded(sc.Index)"
                              (change)="ToggleChartEditorSeries(sc.Index, candidateSeries)"
                              [attr.data-testid]="'chart-editor-series-' + sc.Index"
                            />
                            <span
                              class="mj-sheets-series-dot"
                              [style.background]="GetChartSeriesColor(cIdx)"
                            ></span>
                            <span>{{ sc.Name }}</span>
                          </label>
                        }
                      </div>
                    </div>
                  }
                }

                <div class="mj-sheets-two-col-row">
                  <div class="mj-sheets-form-row">
                    <label>Placement</label>
                    <div class="mj-sheets-segmented-group">
                      <button
                        type="button"
                        class="mj-sheets-seg-btn"
                        [class.active]="EditingChartDraft.Placement === 'sheet'"
                        (click)="EditingChartDraft.Placement = 'sheet'"
                        data-testid="chart-editor-placement-sheet"
                      >
                        On Sheet
                      </button>
                      <button
                        type="button"
                        class="mj-sheets-seg-btn"
                        [class.active]="EditingChartDraft.Placement !== 'sheet'"
                        (click)="EditingChartDraft.Placement = 'dock'"
                        data-testid="chart-editor-placement-dock"
                      >
                        Docked Below
                      </button>
                    </div>
                  </div>
                  <div class="mj-sheets-form-row">
                    <label>Anchor Cell</label>
                    <input
                      type="text"
                      class="mj-sheets-modal-input"
                      [(ngModel)]="EditingChartDraft.PositionCell"
                      placeholder="E2"
                      data-testid="chart-editor-position-cell"
                    />
                  </div>
                </div>

                <div class="mj-sheets-two-col-row">
                  <div class="mj-sheets-form-row">
                    <label>Width (px)</label>
                    <input
                      type="number"
                      min="240"
                      max="960"
                      class="mj-sheets-modal-input"
                      [(ngModel)]="EditingChartDraft.WidthPx"
                      placeholder="400"
                      data-testid="chart-editor-width"
                    />
                  </div>
                  <div class="mj-sheets-form-row">
                    <label>Height (px)</label>
                    <input
                      type="number"
                      min="180"
                      max="680"
                      class="mj-sheets-modal-input"
                      [(ngModel)]="EditingChartDraft.HeightPx"
                      placeholder="240"
                      data-testid="chart-editor-height"
                    />
                  </div>
                </div>

                <div class="mj-sheets-chart-editor-toggles">
                  <label class="mj-sheets-confirm-checkbox">
                    <input
                      type="checkbox"
                      [ngModel]="EditingChartDraft.ShowLegend !== false"
                      (ngModelChange)="EditingChartDraft.ShowLegend = $event"
                      data-testid="chart-editor-show-legend"
                    />
                    <span>Show series legend</span>
                  </label>
                  <label class="mj-sheets-confirm-checkbox">
                    <input
                      type="checkbox"
                      [ngModel]="EditingChartDraft.ShowDataLabels === true"
                      (ngModelChange)="EditingChartDraft.ShowDataLabels = $event"
                      data-testid="chart-editor-show-labels"
                    />
                    <span>Always show value labels</span>
                  </label>
                </div>
              </div>

              <div class="mj-sheets-chart-editor-preview">
                <div class="mj-sheets-chart-editor-preview-header">
                  <strong>{{ EditingChartDraft.Title || 'Chart Preview' }}</strong>
                  <span>{{ EditingChartDraft.SourceRange }} · {{ EditingChartDraft.ChartType | uppercase }}</span>
                </div>
                @if (previewDataset && previewDataset.Categories.length > 0 && previewDataset.Series.length > 0) {
                  <div class="mj-sheets-chart-Stage" data-testid="chart-editor-preview-svg">
                    <ng-container
                      [ngTemplateOutlet]="chartSvgTpl"
                      [ngTemplateOutletContext]="{ chart: EditingChartDraft, dataset: previewDataset }"
                    ></ng-container>
                  </div>
                } @else {
                  <div class="mj-sheets-chart-empty">
                    <i class="fa-solid fa-chart-simple"></i>
                    <span>Adjust source range or orientation to preview chart.</span>
                  </div>
                }
              </div>
            </div>
            <div class="mj-sheets-modal-footer">
              <button
                type="button"
                class="mj-sheets-tool-btn"
                (click)="CloseChartEditorModal()"
              >
                Cancel
              </button>
              <button
                type="button"
                class="mj-sheets-tool-btn mj-sheets-save-btn"
                (click)="ConfirmSaveChartEditor()"
                data-testid="chart-editor-save"
              >
                <i class="fa-solid fa-check"></i> Apply Changes
              </button>
            </div>
          </div>
        </div>
      }

      <mj-context-menu
        [IsOpen]="ContextMenuOpen"
        [AnchorX]="ContextMenuX"
        [AnchorY]="ContextMenuY"
        [Items]="ContextMenuItems"
        [AriaLabel]="ContextMenuAriaLabel"
        [RestoreFocusElement]="ContextMenuRestoreFocusEl"
        (ItemSelected)="OnContextMenuCommand($event)"
        (Closed)="CloseContextMenu()"
      ></mj-context-menu>
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

      .mj-sheets-undo-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
      }

      .mj-sheets-tool-btn--icon {
        padding: 4px 8px;
      }

      .mj-sheets-active-mode-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 9px;
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: var(--mj-brand-primary-subtle);
        border: 1px solid var(--mj-brand-primary);
        border-radius: 6px;
        cursor: pointer;
      }

      .mj-sheets-more-anchor {
        position: relative;
        display: inline-flex;
      }

      .mj-sheets-more-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 40;
        width: 310px;
        max-height: 440px;
        overflow-y: auto;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        box-shadow: var(--mj-shadow-lg);
        padding: 8px;
      }

      .mj-sheets-more-menu-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 6px 8px;
        border-bottom: 1px solid var(--mj-border-subtle);
        margin-bottom: 6px;
      }

      .mj-sheets-more-menu-title {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: var(--mj-text-primary);
      }

      .mj-sheets-more-menu-hint {
        display: block;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-sheets-more-reset-btn {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
      }

      .mj-sheets-more-reset-btn:hover {
        background: var(--mj-brand-primary-subtle);
      }

      .mj-sheets-more-section {
        margin-bottom: 8px;
      }

      .mj-sheets-more-section-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mj-text-muted);
        padding: 4px 6px;
      }

      .mj-sheets-more-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .mj-sheets-more-action {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        background: transparent;
        border: none;
        border-radius: 6px;
        padding: 6px 8px;
        color: var(--mj-text-primary);
        cursor: pointer;
      }

      .mj-sheets-more-action:hover:not(:disabled),
      .mj-sheets-more-action.active {
        background: var(--mj-bg-surface-hover);
      }

      .mj-sheets-more-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .mj-sheets-more-action-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .mj-sheets-more-action-label {
        font-size: 12px;
        font-weight: 600;
      }

      .mj-sheets-more-action-desc {
        font-size: 11px;
        color: var(--mj-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-sheets-pin-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 5px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mj-text-muted);
        cursor: pointer;
      }

      .mj-sheets-pin-btn.pinned {
        color: var(--mj-brand-primary);
        background: var(--mj-brand-primary-subtle);
      }

      .mj-sheets-pin-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
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
        height: 24px;
        min-width: 24px;
        border-radius: 12px;
        padding: 0 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-inverse);
        cursor: pointer;
        transition: transform 0.15s ease;
      }

      .mj-sheets-presence-avatar:hover {
        transform: scale(1.05);
      }

      .mj-sheets-presence-range-tag {
        font-size: 9px;
        font-weight: 500;
        opacity: 0.9;
        background: rgba(0, 0, 0, 0.25);
        padding: 1px 4px;
        border-radius: 4px;
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
        min-height: 120px;
      }

      .mj-sheets-grid-canvas {
        position: relative;
        display: inline-block;
        min-width: 100%;
        min-height: 100%;
      }

      .mj-sheets-floating-chart {
        position: absolute;
        z-index: 4;
        box-shadow: 0 8px 24px color-mix(in srgb, var(--mj-text-primary) 16%, transparent);
        border-color: var(--mj-border-strong);
        min-width: 260px;
        max-width: none;
      }

      .mj-sheets-floating-chart:hover {
        border-color: var(--mj-brand-primary);
      }

      .mj-sheets-chart-title-wrap {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        min-width: 0;
      }

      .mj-sheets-chart-card-draggable {
        cursor: grab;
        user-select: none;
      }

      .mj-sheets-chart-card-draggable:active {
        cursor: grabbing;
      }

      .mj-sheets-chart-drag-grip {
        color: var(--mj-text-muted);
        padding-top: 2px;
        font-size: 12px;
      }

      .mj-sheets-chart-resize-handle {
        position: absolute;
        right: 3px;
        bottom: 3px;
        width: 12px;
        height: 12px;
        cursor: nwse-resize;
        border-right: 2px solid var(--mj-text-muted);
        border-bottom: 2px solid var(--mj-text-muted);
        border-bottom-right-radius: 3px;
        opacity: 0.7;
      }

      .mj-sheets-chart-resize-handle:hover {
        opacity: 1;
        border-color: var(--mj-brand-primary);
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
      .mj-sheets-col-header.in-range,
      .mj-sheets-row-header.selected,
      .mj-sheets-row-header.in-range {
        background: var(--mj-brand-primary-subtle);
        color: var(--mj-brand-primary);
      }

      .mj-sheets-col-header {
        user-select: none;
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
        cursor: pointer;
        user-select: none;
      }

      .mj-sheets-col-resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 5px;
        height: 100%;
        cursor: col-resize;
        z-index: 3;
      }

      .mj-sheets-col-resize-handle:hover {
        background: var(--mj-brand-primary);
      }

      .mj-sheets-row-resize-handle {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        height: 4px;
        cursor: row-resize;
        z-index: 3;
      }

      .mj-sheets-row-resize-handle:hover {
        background: var(--mj-brand-primary);
      }

      .mj-sheets-grid-scroll:focus {
        outline: none;
      }

      .mj-sheets-grid-table {
        user-select: none;
      }

      .mj-sheets-frozen-row td {
        border-bottom: 2px solid var(--mj-brand-primary);
      }

      .mj-sheets-frozen-col {
        position: sticky;
        z-index: 3;
        border-right: 2px solid var(--mj-brand-primary);
      }

      .mj-sheets-cell-cut-source {
        outline: 2px dashed var(--mj-brand-primary);
        outline-offset: -2px;
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

      .mj-sheets-cell.has-peer-selection {
        box-shadow: inset 0 0 0 2px var(--mj-sheets-peer-color, var(--mj-brand-primary));
        z-index: 2;
      }

      .mj-sheets-peer-cell-badge {
        position: absolute;
        top: -16px;
        left: -1px;
        z-index: 4;
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 3px 3px 3px 0;
        color: var(--mj-text-inverse);
        white-space: nowrap;
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        gap: 3px;
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

      .mj-sheets-comment-corner {
        position: absolute;
        top: 0;
        right: 0;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-top: 8px solid var(--mj-status-warning, #f59e0b);
        z-index: 3;
        cursor: pointer;
      }

      .mj-sheets-comment-hover-bubble {
        display: none;
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        min-width: 220px;
        max-width: 300px;
        background: var(--mj-bg-surface-elevated, var(--mj-bg-surface));
        color: var(--mj-text-primary);
        border: 1px solid var(--mj-border-default);
        border-left: 3px solid var(--mj-status-warning, #f59e0b);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
        padding: 8px 10px;
        z-index: 30;
        white-space: normal;
        cursor: pointer;
      }

      .mj-sheets-cell:hover .mj-sheets-comment-hover-bubble {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-sheets-comment-bubble-thread {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .mj-sheets-comment-bubble-thread + .mj-sheets-comment-bubble-thread {
        border-top: 1px solid var(--mj-border-subtle);
        padding-top: 6px;
      }

      .mj-sheets-comment-bubble-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 11px;
      }

      .mj-sheets-comment-bubble-author {
        font-weight: 700;
        color: var(--mj-text-primary);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .mj-sheets-comment-bubble-author i {
        color: var(--mj-status-warning, #f59e0b);
      }

      .mj-sheets-comment-bubble-anchor {
        font-family: var(--mj-font-family-mono, monospace);
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 3px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      .mj-sheets-comment-bubble-body {
        font-size: 12px;
        line-height: 1.35;
        color: var(--mj-text-primary);
        word-break: break-word;
      }

      .mj-sheets-comment-bubble-meta {
        font-size: 10px;
        color: var(--mj-text-muted);
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

      .mj-sheets-objects-splitter {
        height: 9px;
        flex-shrink: 0;
        background: var(--mj-bg-surface-sunken);
        border-top: 1px solid var(--mj-border-default);
        border-bottom: 1px solid var(--mj-border-subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: row-resize;
        user-select: none;
      }

      .mj-sheets-objects-splitter:hover {
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface-sunken));
      }

      .mj-sheets-objects-splitter-pill {
        width: 44px;
        height: 3px;
        border-radius: 999px;
        background: var(--mj-border-strong);
      }

      .mj-sheets-objects-strip {
        flex-shrink: 0;
        min-height: 120px;
        overflow-y: auto;
        padding: 10px 14px;
        background: var(--mj-bg-surface-sunken);
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
        height: 180px;
        background: var(--mj-bg-surface);
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
      }

      .mj-sheets-chart-series-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }

      .mj-sheets-series-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        font-size: 11px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-sheets-series-pill.active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-text-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
      }

      .mj-sheets-series-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
      }

      .mj-sheets-chart-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 110px;
        padding: 12px;
        text-align: center;
        font-size: 12px;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface);
        border-radius: 6px;
        border: 1px dashed var(--mj-border-default);
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

      .mj-sheets-tab-rename-input {
        border: 1px solid var(--mj-brand-primary);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 12px;
        font-weight: 600;
        min-width: 90px;
        outline: none;
        box-shadow: var(--mj-focus-ring);
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

      .mj-sheets-chart-editor-dialog {
        width: 820px;
        max-width: 95vw;
        max-height: 90vh;
        overflow-y: auto;
      }

      .mj-sheets-chart-editor-grid {
        display: grid;
        grid-template-columns: minmax(280px, 1.1fr) minmax(280px, 1fr);
        gap: 16px;
        align-items: start;
      }

      .mj-sheets-chart-editor-controls {
        max-height: 62vh;
        overflow-y: auto;
        padding-right: 4px;
      }

      .mj-sheets-chart-editor-preview {
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mj-sheets-chart-editor-preview-header {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12px;
        color: var(--mj-text-secondary);
      }

      .mj-sheets-chart-editor-preview-header strong {
        color: var(--mj-text-primary);
        font-size: 13px;
      }

      .mj-sheets-segmented-group {
        display: flex;
        gap: 4px;
      }

      .mj-sheets-seg-btn {
        flex: 1;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-sheets-seg-btn.active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
        font-weight: 600;
      }

      .mj-sheets-range-input-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .mj-sheets-range-field {
        flex: 1;
        font-family: var(--mj-font-family-mono, monospace);
      }

      .mj-sheets-range-status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
      }

      .mj-sheets-range-status.valid {
        color: var(--mj-status-success);
      }

      .mj-sheets-range-status.invalid {
        color: var(--mj-status-warning);
      }

      .mj-sheets-two-col-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .mj-sheets-series-check-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        max-height: 110px;
        overflow-y: auto;
      }

      .mj-sheets-series-check-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--mj-text-primary);
        cursor: pointer;
      }

      .mj-sheets-chart-editor-toggles {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        padding-top: 4px;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'SpreadsheetArtifactViewerPlugin')
export class SpreadsheetArtifactViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, OnChanges, OnDestroy
{
  public readonly IsAiAssistantEnabled = ARTIFACT_AI_ASSISTANT_ENABLED;
  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input() public CollaborationWsUrl: string | null = null;
  @Output() public OpenEntityRecord = new EventEmitter<{
    entityName: string;
    compositeKey: CompositeKey;
  }>();

  public ContextMenuOpen = false;
  public ContextMenuX = 0;
  public ContextMenuY = 0;
  public ContextMenuItems: ContextMenuItem<SheetsContextMenuCommand>[] = [];
  public ContextMenuAriaLabel = 'Spreadsheet context menu';
  public ContextMenuRestoreFocusEl: HTMLElement | null = null;
  public SheetsClipboardBuffer: SheetsClipboardSnapshot | null = null;
  public RenamingSheetID: string | null = null;
  public RenameSheetDraftName = '';

  private readonly touchContextMenuMonitor = new TouchContextMenuMonitor({
    OnLongPress: (trigger) => this.handleTouchContextMenuTrigger(trigger),
  });

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone, { optional: true });
  private readonly renderer = inject(Renderer2, { optional: true });
  private readonly hostElementRef = inject(ElementRef<HTMLElement>, { optional: true });
  private readonly collaborationService = inject(DocumentCollaborationService);
  private readonly artifactFileService = inject(ArtifactFileService, { optional: true });
  private readonly notificationService = inject(MJNotificationService, { optional: true });

  @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('moreToolsAnchor') private moreToolsAnchorRef?: ElementRef<HTMLElement>;
  @ViewChild('sheetsGridContainer') private sheetsGridContainerRef?: ElementRef<HTMLElement>;

  public readonly MaxPinnedToolbarActions = 6;
  public ShowMoreToolsMenu = false;
  private _localToolbarPins: SheetsToolbarItemKey[] | null = null;
  private _serverToolbarPinsRaw: string | null = null;
  private _unlistenMoreMenuDocs: Array<() => void> = [];
  private _unlistenResizeDocs: Array<() => void> = [];

  public Workbook: WorkbookSpec = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Workbook');
  public WorkspaceMode: SpreadsheetWorkspaceMode = 'grid';
  public FallbackXlsxBytes: ArrayBuffer | null = null;

  public ActiveRowIndex = 1;
  public ActiveColumnIndex = 1;
  public SelectedRange = 'A1';
  public SelectedRanges: string[] = ['A1'];
  public IsDraggingSelection = false;
  public DragAnchorAddress: string | null = null;
  private isCtrlMultiSelectDrag = false;
  private lastMouseDownTimestamp = 0;
  private lastMouseDownCell = '';

  public SyntheticAgentPresence: CollaboratorPresence | null = null;
  private syntheticAgentTimer: ReturnType<typeof setTimeout> | null = null;
  public FormulaBarInput = '';
  public InlineEditingAddress: string | null = null;
  public InlineEditValue = '';

  public SourceJsonText = '';
  public InitialSerializedWorkbook = '';
  public IsEvaluatingAiFormulas = false;
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
  private cachedUnsavedChanges: boolean | null = null;
  private unsavedCacheClearScheduled = false;
  private delegatedMouseOverCleanup: (() => void) | null = null;

  public EmbeddedArtifactVersions: Record<string, MJArtifactVersionEntity> = {};
  private lastTableResults: Record<string, DocumentBlockExecutionResult> = {};

  private readonly subs: Subscription[] = [];
  private permissionsUnsubscribe: (() => void) | null = null;
  private liveSyncUnavailable = false;

  public get HasUnsavedChanges(): boolean {
    if (!this.lastSavedComparableJson) {
      return false;
    }
    if (this.cachedUnsavedChanges !== null) {
      return this.cachedUnsavedChanges;
    }
    const dirty = this.getComparableWorkbookJson(this.Workbook) !== this.lastSavedComparableJson;
    this.cachedUnsavedChanges = dirty;
    if (!this.unsavedCacheClearScheduled) {
      this.unsavedCacheClearScheduled = true;
      queueMicrotask(() => {
        this.cachedUnsavedChanges = null;
        this.unsavedCacheClearScheduled = false;
      });
    }
    return dirty;
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

  public get ActiveSheetID(): string {
    return this.Workbook?.ActiveSheetID ?? '';
  }

  public set ActiveSheetID(sheetId: string) {
    if (this.Workbook && sheetId && this.Workbook.Worksheets.some((w) => w.SheetID === sheetId)) {
      this.Workbook.ActiveSheetID = sheetId;
      this.syncFormulaBarFromActiveCell();
      this.cdr.markForCheck();
    }
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
    if (this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      if (this.Permissions?.CanEdit !== true) {
        return false;
      }
      if (
        this.CollaborationSession &&
        !this.CollaborationSession.CanEdit &&
        this.ConnectionStatus === 'readonly'
      ) {
        return false;
      }
      return true;
    }
    if (this.ConnectionStatus === 'readonly') {
      return false;
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
    return !this.LiveSyncUnavailable && this.hasPermissionToEdit;
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
    this.bindDelegatedCellMouseOver();
    await this.initializeWorkbookSession();
  }

  /**
   * Delegate cell hover outside Angular's zone so moving the pointer across
   * hundreds of cells does not trigger change-detection ticks unless a drag
   * range selection is actively in progress.
   */
  private bindDelegatedCellMouseOver(): void {
    const host = this.hostElementRef?.nativeElement;
    if (!host || this.delegatedMouseOverCleanup) {
      return;
    }
    const onMouseOver = (event: MouseEvent): void => {
      if (!this.IsDraggingSelection || !this.DragAnchorAddress) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const cellEl = target?.closest?.('td.mj-sheets-cell[data-address]') as HTMLElement | null;
      const addr = cellEl?.getAttribute('data-address');
      if (!addr) {
        return;
      }
      const parsed = ParseCellAddress(addr);
      if (!parsed) {
        return;
      }
      if (this.ngZone) {
        this.ngZone.run(() => this.OnCellMouseEnter(parsed.row, parsed.col));
      } else {
        this.OnCellMouseEnter(parsed.row, parsed.col);
      }
    };
    if (this.ngZone) {
      this.ngZone.runOutsideAngular(() => {
        host.addEventListener('mouseover', onMouseOver);
      });
    } else {
      host.addEventListener('mouseover', onMouseOver);
    }
    this.delegatedMouseOverCleanup = () => {
      host.removeEventListener('mouseover', onMouseOver);
    };
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
      if (
        !this.readonly &&
        this.ConnectionStatus === 'readonly' &&
        !this.AccessRevoked &&
        !this.PermissionVerifyError &&
        !this.LiveSyncUnavailable
      ) {
        if (!this.artifactVersion?.ArtifactID || this.Permissions?.CanEdit === true) {
          this.ConnectionStatus =
            this.CollaborationSession?.Status && this.CollaborationSession.Status !== 'readonly'
              ? this.CollaborationSession.Status
              : 'local';
        }
      }
      const nextCanEdit =
        !this.readonly &&
        this.FallbackXlsxBytes === null &&
        this.ConnectionStatus !== 'revoked' &&
        !this.LiveSyncUnavailable &&
        (!this.artifactVersion?.ArtifactID || this.Permissions?.CanEdit === true);
      this.CollaborationSession?.SetCanEdit(nextCanEdit);
      if (this.CollaborationSession) {
        this.ConnectionStatus = this.CollaborationSession.Status;
      }
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    if (this.delegatedMouseOverCleanup) {
      this.delegatedMouseOverCleanup();
      this.delegatedMouseOverCleanup = null;
    }
    this.teardownSession();
  }

  private teardownSession(): void {
    this.stopMoreMenuDocumentListeners();
    this.stopResizeDocumentListeners();
    this.touchContextMenuMonitor.Destroy();
    if (this.syntheticAgentTimer) {
      clearTimeout(this.syntheticAgentTimer);
      this.syntheticAgentTimer = null;
    }
    this.SyntheticAgentPresence = null;
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
    this.notificationService?.CreateSimpleNotification(message, 'error', 4000);
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
      session.CanUndo$.subscribe(() => {
        if (!this.isComponentDestroyed && gen === this.sessionInitGeneration) {
          this.cdr.markForCheck();
        }
      }),
      session.CanRedo$.subscribe(() => {
        if (!this.isComponentDestroyed && gen === this.sessionInitGeneration) {
          this.cdr.markForCheck();
        }
      }),
      session.ContentChanged$.subscribe((nextContent: string) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        if (!nextContent || !nextContent.trim().startsWith('{')) return;
        const prevCells: Record<string, SpreadsheetCellSpec> = {
          ...(this.ActiveSheet?.Cells ?? {}),
        };
        const prevSheetId = this.ActiveSheet?.SheetID;
        this.Workbook = SpreadsheetEngine.Instance.ParseWorkbook(nextContent);
        SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
        this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
        this.syncFormulaBarFromActiveCell();
        this.verifyFrozenLiveTablesOnServer(this.Workbook);
        if (this.workbookHasLiveDataOrMjFunctions(this.Workbook)) {
          void this.RefreshAllLiveData(false);
        }

        // Compare changed cells on active sheet to surface synthetic agent selection only when real Yjs agent awareness is not present
        const hasRealAgentAwareness =
          this.ConnectionStatus === 'connected' || this.Collaborators.some((c) => c.IsAgent);
        if (
          !hasRealAgentAwareness &&
          this.ActiveSheet &&
          (!prevSheetId || prevSheetId === this.ActiveSheet.SheetID)
        ) {
          const changedAddresses: string[] = [];
          const currCells = this.ActiveSheet.Cells ?? {};
          const allAddresses = new Set([...Object.keys(prevCells), ...Object.keys(currCells)]);
          for (const addr of allAddresses) {
            const prev = prevCells[addr];
            const curr = currCells[addr];
            const valChanged =
              prev?.RawValue !== curr?.RawValue ||
              prev?.ComputedValue !== curr?.ComputedValue ||
              prev?.DisplayValue !== curr?.DisplayValue;
            const formulaChanged = (prev?.Formula ?? '') !== (curr?.Formula ?? '');
            if (valChanged || formulaChanged) {
              changedAddresses.push(addr);
            }
          }
          if (changedAddresses.length > 0) {
            let minR = Infinity;
            let maxR = -Infinity;
            let minC = Infinity;
            let maxC = -Infinity;
            for (const addr of changedAddresses) {
              const pos = ParseCellAddress(addr);
              if (pos) {
                minR = Math.min(minR, pos.row);
                maxR = Math.max(maxR, pos.row);
                minC = Math.min(minC, pos.col);
                maxC = Math.max(maxC, pos.col);
              }
            }
            if (minR !== Infinity && minC !== Infinity) {
              const boundingRange =
                minR === maxR && minC === maxC
                  ? FormatCellAddress(minR, minC)
                  : `${FormatCellAddress(minR, minC)}:${FormatCellAddress(maxR, maxC)}`;
              this.RecordSyntheticAgentSelection(this.ActiveSheet.SheetID, boundingRange, 'AI Agent');
            }
          }
        }

        this.cdr.markForCheck();
      }),
      session.StatusChanged$.subscribe((status: CollaborationConnectionStatus) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.ConnectionStatus = status;
        this.cdr.detectChanges();
      }),
      session.CollaboratorsChanged$.subscribe((collabs: CollaboratorPresence[]) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        this.Collaborators = collabs;
        this.cdr.detectChanges();
      }),
      session.VersionSaved$.subscribe((saved: { versionId: string; versionNumber: number }) => {
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) return;
        const isNewSavedVersion = saved.versionNumber > (this.LastSavedVersionNumber ?? 0);
        this.lastSavedComparableJson = this.getComparableWorkbookJson(this.Workbook);
        this.LastSavedVersionNumber = saved.versionNumber;
        this.IsSavingVersion = false;
        this.StatusBannerMessage = `Saved immutable Artifact Version v${saved.versionNumber}`;
        if (isNewSavedVersion) {
          this.ContentCommitted.emit(SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook));
        }
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
      if (!this.isComponentDestroyed) {
        this.cdr.detectChanges();
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
    const nextAddr = FormatCellAddress(rowIndex, colIndex);

    if (event?.metaKey || event?.ctrlKey) {
      const existingIdx = this.SelectedRanges.indexOf(nextAddr);
      if (existingIdx >= 0 && this.SelectedRanges.length > 1) {
        this.SelectedRanges.splice(existingIdx, 1);
      } else if (existingIdx < 0) {
        this.SelectedRanges.push(nextAddr);
      }
      this.SelectedRange = this.SelectedRanges.join(', ');
      this.ActiveRowIndex = rowIndex;
      this.ActiveColumnIndex = colIndex;
    } else if (event?.shiftKey) {
      const anchorAddr = this.DragAnchorAddress || this.ActiveCellAddress;
      const rangeSeg = anchorAddr === nextAddr ? nextAddr : `${anchorAddr}:${nextAddr}`;
      if (this.SelectedRanges.length > 0) {
        this.SelectedRanges[this.SelectedRanges.length - 1] = rangeSeg;
      } else {
        this.SelectedRanges = [rangeSeg];
      }
      this.SelectedRange = this.SelectedRanges.join(', ');
      this.ActiveRowIndex = rowIndex;
      this.ActiveColumnIndex = colIndex;
    } else {
      this.DragAnchorAddress = nextAddr;
      this.SelectedRanges = [nextAddr];
      this.SelectedRange = nextAddr;
      this.ActiveRowIndex = rowIndex;
      this.ActiveColumnIndex = colIndex;
    }

    this.syncFormulaBarFromActiveCell();
    this.broadcastSelectionPresence();
    this.cdr.detectChanges();
  }

  public OnCellMouseDown(rowIndex: number, colIndex: number, event?: MouseEvent): void {
    if (event && event.button !== 0) return;
    if (this.InlineEditingAddress) return;
    this.lastMouseDownTimestamp = Date.now();
    this.lastMouseDownCell = FormatCellAddress(rowIndex, colIndex);
    this.IsDraggingSelection = true;
    this.isCtrlMultiSelectDrag = Boolean(event?.metaKey || event?.ctrlKey);
    this.DragAnchorAddress = FormatCellAddress(rowIndex, colIndex);
    this.SelectCell(rowIndex, colIndex, event);
  }

  public OnCellMouseEnter(rowIndex: number, colIndex: number): void {
    if (!this.IsDraggingSelection || !this.DragAnchorAddress) return;
    const hoverAddr = FormatCellAddress(rowIndex, colIndex);
    const rangeSegment =
      this.DragAnchorAddress === hoverAddr
        ? hoverAddr
        : `${this.DragAnchorAddress}:${hoverAddr}`;
    if (this.isCtrlMultiSelectDrag && this.SelectedRanges.length > 0) {
      this.SelectedRanges[this.SelectedRanges.length - 1] = rangeSegment;
    } else {
      this.SelectedRanges = [rangeSegment];
    }
    this.SelectedRange = this.SelectedRanges.join(', ');
    this.broadcastSelectionPresence();
    this.cdr.markForCheck();
  }

  public OnCellMouseUp(): void {
    if (this.IsDraggingSelection) {
      this.IsDraggingSelection = false;
      this.isCtrlMultiSelectDrag = false;
      this.cdr.markForCheck();
    }
  }

  public OnCellClick(rowIndex: number, colIndex: number, event?: MouseEvent): void {
    if (this.InlineEditingAddress) return;
    const now = Date.now();
    const addr = FormatCellAddress(rowIndex, colIndex);
    if (this.lastMouseDownCell === addr && now - this.lastMouseDownTimestamp < 500) {
      this.focusGridContainer();
      return;
    }
    this.SelectCell(rowIndex, colIndex, event);
    this.focusGridContainer();
  }

  private focusGridContainer(): void {
    const el =
      this.sheetsGridContainerRef?.nativeElement ??
      (this.hostElementRef?.nativeElement?.querySelector('[data-testid="sheets-grid-container"]') as HTMLElement | null);
    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
    }
  }

  public get CanUndo(): boolean {
    return this.CanEdit && Boolean(this.CollaborationSession?.CanUndo);
  }

  public get CanRedo(): boolean {
    return this.CanEdit && Boolean(this.CollaborationSession?.CanRedo);
  }

  public UndoWorkbook(): void {
    if (!this.CanUndo || !this.CollaborationSession) {
      return;
    }
    if (this.CollaborationSession.Undo()) {
      this.cdr.detectChanges();
    }
  }

  public RedoWorkbook(): void {
    if (!this.CanRedo || !this.CollaborationSession) {
      return;
    }
    if (this.CollaborationSession.Redo()) {
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:keydown', ['$event'])
  public OnViewerKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (this.CanUndo) {
          event.preventDefault();
          this.UndoWorkbook();
        }
        return;
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey && event.ctrlKey)) {
        if (this.CanRedo) {
          event.preventDefault();
          this.RedoWorkbook();
        }
        return;
      }
    }
    if (this.WorkspaceMode === 'grid' && !this.InlineEditingAddress) {
      this.OnGridKeydown(event);
    }
  }

  public OnInlineEditTab(event: Event): void {
    const kb = event as KeyboardEvent;
    kb.preventDefault();
    this.CommitInlineCellEdit();
    this.MoveActiveCell(0, kb.shiftKey ? -1 : 1, false);
    this.focusGridContainer();
  }

  public OnGridKeydown(event: KeyboardEvent): void {
    if (this.InlineEditingAddress || this.WorkspaceMode !== 'grid') {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    if (IsKeyboardContextMenuShortcut(event)) {
      event.preventDefault();
      this.OpenContextMenuForActiveSelectionFromKeyboard();
      return;
    }
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod) {
      const lower = event.key.toLowerCase();
      if (lower === 'c') {
        event.preventDefault();
        this.CopySelectedRangeToClipboard();
        return;
      }
      if (lower === 'x') {
        if (this.CanEdit) {
          event.preventDefault();
          this.cutSelectedRangeToClipboard();
        }
        return;
      }
      if (lower === 'b') {
        if (this.CanEdit) {
          event.preventDefault();
          this.toggleBoldForRange(this.SelectedRange || this.ActiveCellAddress);
        }
        return;
      }
      if (lower === 'i') {
        if (this.CanEdit) {
          event.preventDefault();
          this.toggleItalicForRange(this.SelectedRange || this.ActiveCellAddress);
        }
        return;
      }
      if (lower === 'z' || lower === 'y') {
        return;
      }
    }

    switch (event.key) {
      case 'Escape':
        if (this.ContextMenuOpen) {
          event.preventDefault();
          this.CloseContextMenu();
          return;
        }
        if (this.SheetsClipboardBuffer?.Mode === 'cut') {
          this.SheetsClipboardBuffer = null;
          this.cdr.markForCheck();
          return;
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.MoveActiveCell(-1, 0, event.shiftKey);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.MoveActiveCell(1, 0, event.shiftKey);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.MoveActiveCell(0, -1, event.shiftKey);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.MoveActiveCell(0, 1, event.shiftKey);
        break;
      case 'Tab':
        event.preventDefault();
        this.MoveActiveCell(0, event.shiftKey ? -1 : 1, false);
        break;
      case 'Enter':
        event.preventDefault();
        this.MoveActiveCell(event.shiftKey ? -1 : 1, 0, false);
        break;
      case 'F2':
        if (this.CanEdit) {
          event.preventDefault();
          this.BeginInlineCellEdit(this.ActiveRowIndex, this.ActiveColumnIndex);
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (this.CanEdit) {
          event.preventDefault();
          this.ClearSelectedRange();
        }
        break;
      default:
        break;
    }
  }

  public MoveActiveCell(deltaRow: number, deltaCol: number, extendSelection: boolean): void {
    const maxRow = Math.max(1, this.VisibleRows.length);
    const maxCol = Math.max(1, this.VisibleColumns.length);
    let nextRow = Math.max(1, Math.min(maxRow, this.ActiveRowIndex + deltaRow));
    let nextCol = Math.max(1, Math.min(maxCol, this.ActiveColumnIndex + deltaCol));

    if (!extendSelection && deltaRow === 0 && deltaCol !== 0) {
      if (this.ActiveColumnIndex + deltaCol > maxCol && this.ActiveRowIndex < maxRow) {
        nextCol = 1;
        nextRow = this.ActiveRowIndex + 1;
      } else if (this.ActiveColumnIndex + deltaCol < 1 && this.ActiveRowIndex > 1) {
        nextCol = maxCol;
        nextRow = this.ActiveRowIndex - 1;
      }
    }

    this.ActiveRowIndex = nextRow;
    this.ActiveColumnIndex = nextCol;
    const focusAddr = FormatCellAddress(nextRow, nextCol);

    if (extendSelection) {
      const anchorAddr = this.DragAnchorAddress || focusAddr;
      const anchor = ParseCellAddress(anchorAddr) ?? { row: nextRow, col: nextCol };
      const minR = Math.min(anchor.row, nextRow);
      const maxR = Math.max(anchor.row, nextRow);
      const minC = Math.min(anchor.col, nextCol);
      const maxC = Math.max(anchor.col, nextCol);
      const rangeStr =
        minR === maxR && minC === maxC
          ? FormatCellAddress(minR, minC)
          : `${FormatCellAddress(minR, minC)}:${FormatCellAddress(maxR, maxC)}`;
      this.SelectedRanges = [rangeStr];
      this.SelectedRange = rangeStr;
    } else {
      this.DragAnchorAddress = focusAddr;
      this.SelectedRanges = [focusAddr];
      this.SelectedRange = focusAddr;
    }

    this.syncFormulaBarFromActiveCell();
    this.broadcastSelectionPresence();
    this.cdr.detectChanges();
  }

  public ClearSelectedRange(): void {
    if (!this.CanEdit) return;
    const ranges = this.SelectedRanges.length > 0 ? this.SelectedRanges : [this.SelectedRange];
    const deletes: Array<{ rowId: string; colId: string }> = [];
    const editContext = this.buildCellEditContext();
    try {
      for (const rng of ranges) {
        const bounds = this.parseRangeBounds(rng);
        if (!bounds) continue;
        for (let r = bounds.minR; r <= bounds.maxR; r++) {
          const rowSpec = this.ActiveSheet.Rows.find((row) => row.Index === r);
          if (!rowSpec) continue;
          for (let c = bounds.minC; c <= bounds.maxC; c++) {
            const colSpec = this.ActiveSheet.Columns.find((col) => col.Index === c);
            if (!colSpec) continue;
            const addr = FormatCellAddress(r, c);
            if (this.ActiveSheet.Cells[addr]) {
              deletes.push({ rowId: rowSpec.RowID, colId: colSpec.ColumnID });
            }
          }
        }
        SpreadsheetEngine.Instance.ClearRange(
          this.Workbook,
          this.ActiveSheet.SheetID,
          rng,
          true,
          editContext,
        );
      }
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Selected range contains protected cells.';
      this.cdr.markForCheck();
      return;
    }
    this.CollaborationSession?.BatchUpdateSpreadsheetCells(
      this.ActiveSheet.SheetID,
      [],
      deletes,
      this.Workbook,
    );
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.detectChanges();
  }

  public OnGridCopy(event: ClipboardEvent): void {
    if (this.InlineEditingAddress) return;
    this.captureSelectionIntoClipboardBuffer('copy');
    const { tsv, html } = this.buildSelectedRangeClipboardPayloads();
    if (event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', tsv);
      event.clipboardData.setData('text/html', html);
    }
  }

  public CopySelectedRangeToClipboard(): void {
    this.captureSelectionIntoClipboardBuffer('copy');
    const { tsv } = this.buildSelectedRangeClipboardPayloads();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tsv).catch(() => undefined);
    }
  }

  public OnGridPaste(event: ClipboardEvent): void {
    if (this.InlineEditingAddress || !this.CanEdit) return;
    const tsv = event.clipboardData?.getData('text/plain');
    if (!tsv) return;
    event.preventDefault();
    this.ApplyTsvPasteAtActiveCell(tsv);
  }

  public ApplyTsvPasteAtActiveCell(tsvText: string): void {
    if (!this.CanEdit || !tsvText) return;
    const normalized = tsvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
    if (lines.length === 0) return;

    const updatedCells: SpreadsheetCellSpec[] = [];
    const startRow = this.ActiveRowIndex;
    const startCol = this.ActiveColumnIndex;
    let maxRowWritten = startRow;
    let maxColWritten = startCol;

    const editContext = this.buildCellEditContext();
    try {
      for (let rOffset = 0; rOffset < lines.length; rOffset++) {
        const cols = lines[rOffset].split('\t');
        for (let cOffset = 0; cOffset < cols.length; cOffset++) {
          const targetRow = startRow + rOffset;
          const targetCol = startCol + cOffset;
          const addr = FormatCellAddress(targetRow, targetCol);
          const cellText = cols[cOffset];
          const parsed = this.parseRawCellInputValue(cellText);
          const updated = SpreadsheetEngine.Instance.SetCell(
            this.Workbook,
            this.ActiveSheet.SheetID,
            addr,
            parsed,
            true,
            editContext,
          );
          if (updated) {
            updatedCells.push(updated);
            maxRowWritten = Math.max(maxRowWritten, targetRow);
            maxColWritten = Math.max(maxColWritten, targetCol);
          }
        }
      }
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Paste blocked by a protected cell range.';
      this.cdr.markForCheck();
      if (updatedCells.length === 0) {
        return;
      }
    }

    if (updatedCells.length > 0) {
      this.CollaborationSession?.BatchUpdateSpreadsheetCells(
        this.ActiveSheet.SheetID,
        updatedCells,
        [],
        this.Workbook,
      );
      const startAddr = FormatCellAddress(startRow, startCol);
      const endAddr = FormatCellAddress(maxRowWritten, maxColWritten);
      const nextRange = startAddr === endAddr ? startAddr : `${startAddr}:${endAddr}`;
      this.SelectedRanges = [nextRange];
      this.SelectedRange = nextRange;
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
      this.cdr.detectChanges();
    }
  }

  private parseRawCellInputValue(raw: string): {
    Value?: string | number | boolean | null;
    Formula?: string | null;
  } {
    const trimmed = raw.trim();
    if (trimmed.startsWith('=')) {
      return { Formula: trimmed, Value: null };
    }
    if (trimmed.length === 0) {
      return { Value: null, Formula: null };
    }
    if (trimmed.toLowerCase() === 'true') {
      return { Value: true, Formula: null };
    }
    if (trimmed.toLowerCase() === 'false') {
      return { Value: false, Formula: null };
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return { Value: numeric, Formula: null };
    }
    return { Value: raw, Formula: null };
  }

  private buildSelectedRangeClipboardPayloads(): { tsv: string; html: string } {
    const primaryRange = this.SelectedRanges[0] ?? this.SelectedRange;
    const bounds = this.parseRangeBounds(primaryRange) ?? {
      minR: this.ActiveRowIndex,
      maxR: this.ActiveRowIndex,
      minC: this.ActiveColumnIndex,
      maxC: this.ActiveColumnIndex,
    };
    const tsvRows: string[] = [];
    const htmlRows: string[] = [];
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      const tsvCols: string[] = [];
      const htmlCols: string[] = [];
      for (let c = bounds.minC; c <= bounds.maxC; c++) {
        const addr = FormatCellAddress(r, c);
        const cell = this.ActiveSheet.Cells[addr];
        const text =
          cell?.DisplayValue ??
          (cell?.RawValue !== null && cell?.RawValue !== undefined ? String(cell.RawValue) : '');
        tsvCols.push(text);
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlCols.push(`<td>${escaped}</td>`);
      }
      tsvRows.push(tsvCols.join('\t'));
      htmlRows.push(`<tr>${htmlCols.join('')}</tr>`);
    }
    return {
      tsv: tsvRows.join('\n'),
      html: `<table><tbody>${htmlRows.join('')}</tbody></table>`,
    };
  }

  private parseRangeBounds(
    rangeStr: string,
  ): { minR: number; maxR: number; minC: number; maxC: number } | null {
    const parts = (rangeStr || '').trim().split(':');
    const start = ParseCellAddress(parts[0]);
    if (!start) return null;
    const end = parts[1] ? ParseCellAddress(parts[1]) : start;
    if (!end) return null;
    return {
      minR: Math.min(start.row, end.row),
      maxR: Math.max(start.row, end.row),
      minC: Math.min(start.col, end.col),
      maxC: Math.max(start.col, end.col),
    };
  }

  public StartColumnResize(columnId: string, event: MouseEvent): void {
    if (!this.CanEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const col = this.ActiveSheet.Columns.find((c) => c.ColumnID === columnId);
    if (!col) return;
    const startX = event.clientX;
    const initialWidthPx = (col.Width ?? 14) * 8;
    this.bindDocumentDragListeners(
      (moveEvt: MouseEvent) => {
        const nextPx = Math.max(48, Math.min(480, initialWidthPx + (moveEvt.clientX - startX)));
        col.Width = Math.round((nextPx / 8) * 10) / 10;
        this.cdr.markForCheck();
      },
      () => {
        this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
        this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
        this.cdr.markForCheck();
      },
    );
  }

  public StartRowResize(rowId: string, event: MouseEvent): void {
    if (!this.CanEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const row = this.ActiveSheet.Rows.find((r) => r.RowID === rowId);
    if (!row) return;
    const startY = event.clientY;
    const initialHeight = row.Height ?? 28;
    this.bindDocumentDragListeners(
      (moveEvt: MouseEvent) => {
        row.Height = Math.max(22, Math.min(240, Math.round(initialHeight + (moveEvt.clientY - startY))));
        this.cdr.markForCheck();
      },
      () => {
        this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
        this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
        this.cdr.markForCheck();
      },
    );
  }

  private bindDocumentDragListeners(
    onMove: (evt: MouseEvent) => void,
    onEnd: (evt: MouseEvent) => void,
  ): void {
    this.stopResizeDocumentListeners();
    if (this.renderer) {
      const unlistenMove = this.renderer.listen('document', 'mousemove', onMove);
      const unlistenUp = this.renderer.listen('document', 'mouseup', (evt: MouseEvent) => {
        this.stopResizeDocumentListeners();
        onEnd(evt);
      });
      this._unlistenResizeDocs.push(unlistenMove, unlistenUp);
    } else if (typeof document !== 'undefined') {
      const moveHandler = (evt: MouseEvent): void => onMove(evt);
      const upHandler = (evt: MouseEvent): void => {
        this.stopResizeDocumentListeners();
        onEnd(evt);
      };
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
      this._unlistenResizeDocs.push(
        () => document.removeEventListener('mousemove', moveHandler),
        () => document.removeEventListener('mouseup', upHandler),
      );
    }
  }

  private stopResizeDocumentListeners(): void {
    for (const unlisten of this._unlistenResizeDocs) {
      unlisten();
    }
    this._unlistenResizeDocs = [];
  }

  // ---------------------------------------------------------------------------
  // Progressive Disclosure Toolbar (UserInfoEngine-persisted)
  // ---------------------------------------------------------------------------

  public get PinnedToolbarActions(): SheetsToolbarItemKey[] {
    if (this._localToolbarPins !== null) {
      return [...this._localToolbarPins];
    }
    const engine = UserInfoEngine.Instance;
    const raw = engine?.GetSetting(SHEETS_TOOLBAR_PINS_SETTING_KEY) ?? null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((k): k is SheetsToolbarItemKey => typeof k === 'string');
          return valid.slice(0, this.MaxPinnedToolbarActions);
        }
      } catch {
        // Fallback to defaults
      }
    }
    return [...DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS];
  }

  private savePinnedToolbarActions(pins: SheetsToolbarItemKey[]): void {
    const trimmed = pins.slice(0, this.MaxPinnedToolbarActions);
    this._localToolbarPins = [...trimmed];
    const json = JSON.stringify(trimmed);
    const engine = UserInfoEngine.Instance;
    this._serverToolbarPinsRaw = engine?.GetSetting(SHEETS_TOOLBAR_PINS_SETTING_KEY) ?? null;
    engine?.SetSettingDebounced(SHEETS_TOOLBAR_PINS_SETTING_KEY, json);
  }

  public get HasCustomToolbarPreferences(): boolean {
    const pins = this.PinnedToolbarActions;
    return (
      pins.length !== DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS.length ||
      DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS.some((key, idx) => pins[idx] !== key)
    );
  }

  public IsToolbarItemPinned(key: SheetsToolbarItemKey): boolean {
    return this.PinnedToolbarActions.includes(key);
  }

  public IsToolbarItemShownOnBar(key: SheetsToolbarItemKey): boolean {
    return this.IsToolbarItemPinned(key);
  }

  public TogglePinToolbarAction(key: SheetsToolbarItemKey, event?: MouseEvent): void {
    event?.stopPropagation();
    const current = this.PinnedToolbarActions;
    const idx = current.indexOf(key);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else if (current.length < this.MaxPinnedToolbarActions) {
      current.push(key);
    }
    this.savePinnedToolbarActions(current);
    this.cdr.markForCheck();
  }

  public ResetToolbarPreferences(): void {
    this.savePinnedToolbarActions([...DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS]);
    this.cdr.markForCheck();
  }

  public get AllToolbarItems(): ResolvedSheetsToolbarItem[] {
    const canGridEdit = this.WorkspaceMode === 'grid' && this.CanEdit;
    return [
      {
        Key: 'bold',
        Label: 'Bold',
        Description: 'Toggle bold on active cell',
        Icon: 'fa-bold',
        Category: 'Format',
        Placement: 'left',
        TestId: 'sheet-format-bold-btn',
        Active: this.IsActiveCellBold,
        Visible: canGridEdit,
      },
      {
        Key: 'currency',
        Label: 'Currency ($)',
        ShortLabel: '$',
        Description: 'Format as Currency ($#,##0.00)',
        Icon: 'fa-dollar-sign',
        Category: 'Format',
        Placement: 'left',
        TestId: 'sheet-format-currency-btn',
        Active: this.ActiveCellFormatType === 'currency',
        Visible: canGridEdit,
      },
      {
        Key: 'percent',
        Label: 'Percent (%)',
        ShortLabel: '%',
        Description: 'Format as Percent (0.0%)',
        Icon: 'fa-percent',
        Category: 'Format',
        Placement: 'left',
        TestId: 'sheet-format-percent-btn',
        Active: this.ActiveCellFormatType === 'percent',
        Visible: canGridEdit,
      },
      {
        Key: 'integer',
        Label: 'Integer (#,##0)',
        ShortLabel: '#,##0',
        Description: 'Format as Integer (#,##0)',
        Icon: 'fa-hashtag',
        Category: 'Format',
        Placement: 'left',
        TestId: 'sheet-format-integer-btn',
        Active: this.ActiveCellFormatType === 'integer',
        Visible: canGridEdit,
      },
      {
        Key: 'date',
        Label: 'Date',
        Description: 'Format as Date (yyyy-mm-dd)',
        Icon: 'fa-calendar',
        Category: 'Format',
        Placement: 'left',
        TestId: 'sheet-format-date-btn',
        Active: this.ActiveCellFormatType === 'date',
        Visible: canGridEdit,
      },
      {
        Key: 'insert-row',
        Label: 'Insert Row',
        ShortLabel: 'Row',
        Description: 'Insert Row Above Active Cell',
        Icon: 'fa-plus',
        Category: 'Structure',
        Placement: 'left',
        TestId: 'sheet-insert-row-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'insert-col',
        Label: 'Insert Column',
        ShortLabel: 'Col',
        Description: 'Insert Column Left of Active Cell',
        Icon: 'fa-plus',
        Category: 'Structure',
        Placement: 'left',
        TestId: 'sheet-insert-col-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'sort-asc',
        Label: 'Sort A → Z',
        Description: 'Sort Active Column A → Z',
        Icon: 'fa-arrow-down-a-z',
        Category: 'Structure',
        Placement: 'left',
        TestId: 'sheet-sort-asc-btn',
        Active: this.ActiveSheet?.SortSpec?.Direction === 'asc',
        Visible: canGridEdit,
      },
      {
        Key: 'sort-desc',
        Label: 'Sort Z → A',
        Description: 'Sort Active Column Z → A',
        Icon: 'fa-arrow-down-z-a',
        Category: 'Structure',
        Placement: 'left',
        TestId: 'sheet-sort-desc-btn',
        Active: this.ActiveSheet?.SortSpec?.Direction === 'desc',
        Visible: canGridEdit,
      },
      {
        Key: 'freeze-header',
        Label: 'Freeze Header',
        ShortLabel: 'Freeze',
        Description: 'Freeze Top Header Row',
        Icon: 'fa-snowflake',
        Category: 'Structure',
        Placement: 'left',
        TestId: 'sheet-freeze-header-btn',
        Active: (this.ActiveSheet?.FrozenRows ?? 0) > 0,
        Visible: canGridEdit,
      },
      {
        Key: 'live-table',
        Label: '+ Live Table',
        ShortLabel: 'Live Table',
        Description: 'Bind Live MJ Entity View or Saved Query Table',
        Icon: 'fa-table-list',
        Category: 'Insert & Data',
        Placement: 'left',
        TestId: 'sheet-add-live-table-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'insert-query',
        Label: '=MJ.QUERY',
        ShortLabel: '=MJ.QUERY',
        Description: 'Insert =MJ.QUERY(...) Custom Function',
        Icon: 'fa-database',
        Category: 'Insert & Data',
        Placement: 'left',
        TestId: 'sheet-insert-mj-query-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'insert-view',
        Label: '=MJ.VIEW',
        ShortLabel: '=MJ.VIEW',
        Description: 'Insert =MJ.VIEW(...) Custom Function',
        Icon: 'fa-layer-group',
        Category: 'Insert & Data',
        Placement: 'left',
        TestId: 'sheet-insert-mj-view-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'add-chart',
        Label: '+ Range Chart',
        ShortLabel: '+ Chart',
        Description: 'Create Range Chart from Selected Range',
        Icon: 'fa-chart-column',
        Category: 'Insert & Data',
        Placement: 'left',
        TestId: 'sheet-add-chart-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'add-whiteboard',
        Label: '+ Whiteboard',
        ShortLabel: 'Whiteboard',
        Description: 'Embed Interactive Whiteboard Canvas',
        Icon: 'fa-chalkboard',
        Category: 'Insert & Data',
        Placement: 'left',
        TestId: 'sheet-add-whiteboard-btn',
        Active: false,
        Visible: canGridEdit,
      },
      {
        Key: 'refresh-data',
        Label: 'Refresh Data',
        ShortLabel: 'Refresh',
        Description: 'Refresh All Bound Live Tables and =MJ.* Custom Functions',
        Icon: 'fa-rotate',
        Category: 'Insert & Data',
        Placement: 'right',
        TestId: 'sheet-refresh-data-btn',
        Active: false,
        Disabled: this.IsRefreshingData,
        Visible: true,
      },
      {
        Key: 'import',
        Label: 'Import .xlsx / .csv',
        ShortLabel: 'Import',
        Description: 'Import .xlsx or .csv Workbook',
        Icon: 'fa-file-import',
        Category: 'Export & View',
        Placement: 'right',
        TestId: 'sheet-import-btn',
        Active: false,
        Visible: this.CanEdit,
      },
      {
        Key: 'export-xlsx',
        Label: 'Export .xlsx',
        ShortLabel: '.xlsx',
        Description: 'Export Workbook as Excel (.xlsx)',
        Icon: 'fa-file-excel',
        Category: 'Export & View',
        Placement: 'right',
        TestId: 'sheet-export-xlsx-btn',
        Active: false,
        Visible: true,
      },
      {
        Key: 'export-csv',
        Label: 'Export .csv',
        ShortLabel: '.csv',
        Description: 'Export Active Sheet as .csv',
        Icon: 'fa-file-csv',
        Category: 'Export & View',
        Placement: 'right',
        TestId: 'sheet-export-csv-btn',
        Active: false,
        Visible: true,
      },
      {
        Key: 'source-mode',
        Label: 'Source JSON',
        ShortLabel: 'Source',
        Description: 'Inspect and edit raw Workbook JSON',
        Icon: 'fa-code',
        Category: 'Export & View',
        Placement: 'right',
        TestId: 'sheets-mode-source',
        Active: this.WorkspaceMode === 'source',
        Visible: true,
      },
      {
        Key: 'diff-mode',
        Label: 'Version Diff',
        ShortLabel: 'Diff',
        Description: 'Compare workbook versions',
        Icon: 'fa-code-compare',
        Category: 'Export & View',
        Placement: 'right',
        TestId: 'sheets-mode-diff',
        Active: this.WorkspaceMode === 'diff',
        Visible: true,
      },
      {
        Key: 'ask-ai',
        Label: 'Ask AI Assistant',
        ShortLabel: 'Ask AI',
        Description: 'Open slide-in AI Assistant for the selected cells',
        Icon: 'fa-wand-magic-sparkles',
        Category: 'Insert & Data',
        Placement: 'right',
        TestId: 'sheets-ask-ai-btn',
        Active: false,
        Visible: ARTIFACT_AI_ASSISTANT_ENABLED && this.CanEdit,
      },
      {
        Key: 'run-ai-formulas',
        Label: 'Run AI Formulas',
        ShortLabel: 'Run AI',
        Description: 'Evaluate opt-in =MJ.AI() formulas in this workbook',
        Icon: 'fa-bolt',
        Category: 'Insert & Data',
        Placement: 'right',
        TestId: 'sheets-run-ai-formulas-overflow-btn',
        Active: false,
        Disabled: this.IsEvaluatingAiFormulas || this.PendingAiFormulaCount === 0,
        Visible: this.CanEdit,
      },
      {
        Key: 'protect-range',
        Label: 'Protect / Unprotect Range',
        ShortLabel: 'Protect',
        Description: 'Lock or unlock the selected cell range to owner-only edits',
        Icon: 'fa-lock',
        Category: 'Structure',
        Placement: 'right',
        TestId: 'sheets-protect-range-btn',
        Active: this.IsSelectedRangeProtected,
        Visible: canGridEdit,
      },
    ];
  }

  public get PinnedLeftToolbarItems(): ResolvedSheetsToolbarItem[] {
    const pins = this.PinnedToolbarActions;
    const byKey = new Map(this.AllToolbarItems.map((item) => [item.Key, item]));
    return pins
      .map((k) => byKey.get(k))
      .filter((item): item is ResolvedSheetsToolbarItem => Boolean(item && item.Visible && item.Placement === 'left'));
  }

  public get PinnedRightToolbarItems(): ResolvedSheetsToolbarItem[] {
    const pins = this.PinnedToolbarActions;
    const byKey = new Map(this.AllToolbarItems.map((item) => [item.Key, item]));
    return pins
      .map((k) => byKey.get(k))
      .filter((item): item is ResolvedSheetsToolbarItem => Boolean(item && item.Visible && item.Placement === 'right'));
  }

  public get OverflowToolbarSections(): Array<{
    Category: ResolvedSheetsToolbarItem['Category'];
    Items: ResolvedSheetsToolbarItem[];
  }> {
    const categories: Array<ResolvedSheetsToolbarItem['Category']> = [
      'Format',
      'Structure',
      'Insert & Data',
      'Export & View',
    ];
    const items = this.AllToolbarItems.filter((item) => item.Visible);
    return categories
      .map((Category) => ({ Category, Items: items.filter((i) => i.Category === Category) }))
      .filter((s) => s.Items.length > 0);
  }

  public ExecuteToolbarItem(item: ResolvedSheetsToolbarItem, closeMenu: boolean): void {
    if (closeMenu) {
      this.CloseMoreToolsMenu();
    }
    switch (item.Key) {
      case 'bold':
        this.ToggleActiveCellBold();
        break;
      case 'currency':
        this.ApplyActiveCellFormat('currency');
        break;
      case 'percent':
        this.ApplyActiveCellFormat('percent');
        break;
      case 'integer':
        this.ApplyActiveCellFormat('integer');
        break;
      case 'date':
        this.ApplyActiveCellFormat('date');
        break;
      case 'insert-row':
        this.InsertRowAtActive();
        break;
      case 'insert-col':
        this.InsertColumnAtActive();
        break;
      case 'sort-asc':
        this.SortActiveColumn('asc');
        break;
      case 'sort-desc':
        this.SortActiveColumn('desc');
        break;
      case 'freeze-header':
        this.ToggleFreezeHeaderRow();
        break;
      case 'live-table':
        this.OpenAddLiveTableModal();
        break;
      case 'insert-query':
        this.InsertMjQueryFormula();
        break;
      case 'insert-view':
        this.InsertMjViewFormula();
        break;
      case 'add-chart':
        this.AddRangeChartFromSelection();
        break;
      case 'add-whiteboard':
        this.AddEmbeddedWhiteboardOnSheet();
        break;
      case 'refresh-data':
        void this.RefreshAllLiveData(true);
        break;
      case 'import':
        this.fileInputRef?.nativeElement.click();
        break;
      case 'export-xlsx':
        void this.ExportWorkbookAsXlsx();
        break;
      case 'export-csv':
        this.ExportActiveSheetAsCsv();
        break;
      case 'source-mode':
        this.SetWorkspaceMode(this.WorkspaceMode === 'source' ? 'grid' : 'source');
        break;
      case 'diff-mode':
        this.SetWorkspaceMode(this.WorkspaceMode === 'diff' ? 'grid' : 'diff');
        break;
      case 'ask-ai':
        this.OpenAskAiForSpreadsheet();
        break;
      case 'run-ai-formulas':
        void this.RunAiFormulas();
        break;
      case 'protect-range':
        this.ToggleSelectedRangeProtection();
        break;
    }
  }

  public ToggleMoreToolsMenu(): void {
    this.ShowMoreToolsMenu = !this.ShowMoreToolsMenu;
    if (this.ShowMoreToolsMenu) {
      this.startMoreMenuDocumentListeners();
    } else {
      this.stopMoreMenuDocumentListeners();
    }
    this.cdr.markForCheck();
  }

  public CloseMoreToolsMenu(): void {
    if (!this.ShowMoreToolsMenu) return;
    this.ShowMoreToolsMenu = false;
    this.stopMoreMenuDocumentListeners();
    this.cdr.detectChanges();
  }

  private startMoreMenuDocumentListeners(): void {
    this.stopMoreMenuDocumentListeners();
    if (typeof document === 'undefined' || !this.renderer) return;
    const unlistenClick = this.renderer.listen('document', 'click', (evt: MouseEvent) => {
      const target = evt.target as Node | null;
      const anchor = this.moreToolsAnchorRef?.nativeElement;
      if (anchor && target && anchor.contains(target)) {
        return;
      }
      this.CloseMoreToolsMenu();
    });
    const unlistenKey = this.renderer.listen('document', 'keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        this.CloseMoreToolsMenu();
      }
    });
    this._unlistenMoreMenuDocs.push(unlistenClick, unlistenKey);
  }

  private stopMoreMenuDocumentListeners(): void {
    for (const unlisten of this._unlistenMoreMenuDocs) {
      unlisten();
    }
    this._unlistenMoreMenuDocs = [];
  }

  public SelectColumnHeader(colLetter: string, event?: MouseEvent): void {
    const rowCount = this.ActiveSheet?.Rows?.length ?? 100;
    const colRange = `${colLetter}1:${colLetter}${rowCount}`;
    const pos = ParseCellAddress(`${colLetter}1`);
    if (pos) {
      this.ActiveRowIndex = 1;
      this.ActiveColumnIndex = pos.col;
      this.DragAnchorAddress = `${colLetter}1`;
      this.syncFormulaBarFromActiveCell();
    }
    if (event?.metaKey || event?.ctrlKey) {
      const existingIdx = this.SelectedRanges.indexOf(colRange);
      if (existingIdx >= 0 && this.SelectedRanges.length > 1) {
        this.SelectedRanges.splice(existingIdx, 1);
      } else if (existingIdx < 0) {
        this.SelectedRanges.push(colRange);
      }
    } else {
      this.SelectedRanges = [colRange];
    }
    this.SelectedRange = this.SelectedRanges.join(', ');
    this.broadcastSelectionPresence();
    this.cdr.markForCheck();
  }

  public SelectRowHeader(rowIndex: number, event?: MouseEvent): void {
    const lastColLetter =
      this.VisibleColumns.length > 0
        ? this.VisibleColumns[this.VisibleColumns.length - 1].Letter
        : 'Z';
    const rowRange = `A${rowIndex}:${lastColLetter}${rowIndex}`;
    this.ActiveRowIndex = rowIndex;
    this.ActiveColumnIndex = 1;
    this.DragAnchorAddress = `A${rowIndex}`;
    this.syncFormulaBarFromActiveCell();

    if (event?.metaKey || event?.ctrlKey) {
      const existingIdx = this.SelectedRanges.indexOf(rowRange);
      if (existingIdx >= 0 && this.SelectedRanges.length > 1) {
        this.SelectedRanges.splice(existingIdx, 1);
      } else if (existingIdx < 0) {
        this.SelectedRanges.push(rowRange);
      }
    } else {
      this.SelectedRanges = [rowRange];
    }
    this.SelectedRange = this.SelectedRanges.join(', ');
    this.broadcastSelectionPresence();
    this.cdr.markForCheck();
  }

  public OnSelectedRangeInputChange(nextRange: string): void {
    this.SelectedRange = nextRange;
    const parts = nextRange
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    this.SelectedRanges = parts.length > 0 ? parts : [nextRange.trim()];
    if (this.SelectedRanges.length > 0) {
      const first = this.SelectedRanges[0].split(':')[0];
      const parsed = ParseCellAddress(first);
      if (parsed) {
        this.ActiveRowIndex = parsed.row;
        this.ActiveColumnIndex = parsed.col;
        this.syncFormulaBarFromActiveCell();
      }
    }
    this.broadcastSelectionPresence();
    this.cdr.markForCheck();
  }

  private broadcastSelectionPresence(): void {
    if (this.ActiveSheet) {
      this.CollaborationSession?.SetActiveBlock(
        `${this.ActiveSheet.SheetID}:${this.SelectedRange}`,
      );
    }
  }

  public BeginInlineCellEdit(rowIndex: number, colIndex: number): void {
    if (!this.CanEdit) return;
    this.IsDraggingSelection = false;
    this.isCtrlMultiSelectDrag = false;
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
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        if (this.InlineEditingAddress !== addr || this.isComponentDestroyed) return;
        const inputEl = document.querySelector<HTMLInputElement>(
          '[data-testid="sheet-inline-cell-input"]',
        );
        if (inputEl) {
          inputEl.focus();
          const len = inputEl.value.length;
          inputEl.setSelectionRange(len, len);
        }
      }, 0);
    }
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

    let updatedCell: SpreadsheetCellSpec;
    try {
      updatedCell = SpreadsheetEngine.Instance.SetCell(
        this.Workbook,
        sheet.SheetID,
        address,
        {
          Value: isFormula ? null : parsedScalar,
          Formula: isFormula ? trimmed : null,
          Style: sheet.Cells[address]?.Style,
        },
        true,
        this.buildCellEditContext(),
      );
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : `Cell ${address} is protected and cannot be edited.`;
      this.syncFormulaBarFromActiveCell();
      this.cdr.markForCheck();
      return;
    }

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

  public get PendingAiFormulaCount(): number {
    return SpreadsheetEngine.Instance.CountPendingAiFormulaCells(this.Workbook).PendingOrStaleCount;
  }

  public get IsSelectedRangeProtected(): boolean {
    const active = this.ActiveSheet;
    if (!active) return false;
    return Boolean(SpreadsheetEngine.Instance.GetProtectedRangeForCell(active, this.ActiveCellAddress));
  }

  private buildCellEditContext(): SpreadsheetCellEditContext {
    const userId = this.resolveCurrentUser()?.ID ?? null;
    const ownerId = this.Permissions?.CanShare ? userId : null;
    return {
      UserID: userId,
      OwnerUserID: ownerId,
      IsEditor: this.CanEdit,
    };
  }

  /**
   * Explicitly evaluates opt-in `=MJ.AI(...)` formulas across the workbook (`§5.2b`).
   */
  public async RunAiFormulas(): Promise<void> {
    const user = this.resolveCurrentUser();
    if (!user || !this.CanEdit || this.IsEvaluatingAiFormulas) {
      return;
    }
    this.IsEvaluatingAiFormulas = true;
    this.cdr.markForCheck();
    try {
      const result = await SpreadsheetEngine.Instance.EvaluateAiFormulas(
        this.Workbook,
        user,
        this.ProviderToUse,
        {
          ArtifactID: this.artifactVersion?.ArtifactID ?? null,
        },
      );
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
      if (result.ErrorCount > 0) {
        this.StatusBannerMessage = `Evaluated ${result.EvaluatedCount} AI formula(s); ${result.ErrorCount} failed.`;
      } else {
        this.StatusBannerMessage = `Evaluated ${result.EvaluatedCount} AI formula cell(s) (${result.CacheHitCount} cached).`;
      }
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Failed to evaluate AI formulas.';
    } finally {
      this.IsEvaluatingAiFormulas = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Protects or unprotects the currently selected cell or range (`§6.2`).
   */
  public ToggleSelectedRangeProtection(): void {
    const user = this.resolveCurrentUser();
    const sheet = this.ActiveSheet;
    if (!user || !sheet || !this.CanEdit) {
      return;
    }
    const existing = SpreadsheetEngine.Instance.GetProtectedRangeForCell(
      sheet,
      this.ActiveCellAddress,
    );
    if (existing) {
      const removed = SpreadsheetEngine.Instance.RemoveProtectedRange(
        this.Workbook,
        sheet.SheetID,
        existing.RangeID,
        this.buildCellEditContext(),
      );
      if (!removed) {
        this.StatusBannerMessage = `Only ${existing.LockedByUserID} or the artifact owner can unlock ${existing.Range}.`;
        this.cdr.markForCheck();
        return;
      }
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.StatusBannerMessage = `Removed protection on ${sheet.Name}!${existing.Range}.`;
      this.cdr.markForCheck();
      return;
    }
    const rangeTarget = this.SelectedRange || this.ActiveCellAddress || 'A1';
    SpreadsheetEngine.Instance.AddProtectedRange(this.Workbook, sheet.SheetID, {
      RangeID: `prot-${Date.now()}`,
      Range: rangeTarget,
      LockedByUserID: user.ID,
      Description: `Protected by ${user.Name || user.Email || user.ID}`,
      AllowEditors: false,
    });
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.StatusBannerMessage = `Protected ${sheet.Name}!${rangeTarget} (owner/locker only).`;
    this.cdr.markForCheck();
  }

  /**
   * Opens the slide-in `@memberjunction/ng-conversations` AI Assistant with the active
   * worksheet and selected range values attached as context.
   */
  public OpenAskAiForSpreadsheet(): void {
    if (!ARTIFACT_AI_ASSISTANT_ENABLED) {
      return;
    }
    const sheet = this.ActiveSheet;
    const rangeA1 = this.SelectedRange || this.ActiveCellAddress || 'A1';
    const rangeCells = sheet
      ? SpreadsheetEngine.Instance.ReadRange(this.Workbook, sheet.SheetID, rangeA1)
      : [];
    const previewTsv = rangeCells
      .slice(0, 20)
      .map((row) =>
        row
          .slice(0, 10)
          .map((c) => c?.DisplayValue ?? c?.Formula ?? c?.RawValue ?? '')
          .join('\t'),
      )
      .join('\n');

    RequestArtifactAiAssistant({
      ArtifactID: this.artifactVersion?.ArtifactID ?? null,
      ArtifactTitle: this.Workbook.Title || 'Spreadsheet',
      ArtifactKind: 'sheet',
      ContextLabel: sheet ? `${sheet.Name}!${rangeA1}` : rangeA1,
      SelectedContent: previewTsv,
      SuggestingModeDefault: true,
      TargetSheetID: sheet?.SheetID,
      TargetCellRange: rangeA1,
      ApplySuggestion: (proposedText: string, _asSuggestion: boolean) => {
        const cleaned = (proposedText ?? '').trim();
        if (!cleaned || !this.CanEdit) {
          return;
        }
        if (cleaned.includes('\t') || cleaned.includes('\n')) {
          this.ApplyTsvPasteAtActiveCell(cleaned);
        } else {
          this.writeCellAndBroadcast(this.ActiveCellAddress, cleaned);
        }
        this.StatusBannerMessage = `Applied AI Assistant result to ${this.ActiveCellAddress}.`;
        this.cdr.markForCheck();
      },
    });
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

  public SelectedChartSeriesByChartID: Record<string, number | 'all'> = {};
  public EditingChartDraft: SpreadsheetChartSpec | null = null;
  private editingChartTargetId: string | null = null;

  public get DockedCharts(): SpreadsheetChartSpec[] {
    return (this.ActiveSheet?.Charts ?? []).filter((c) => c.Placement !== 'sheet');
  }

  public get FloatingCharts(): SpreadsheetChartSpec[] {
    return (this.ActiveSheet?.Charts ?? []).filter((c) => c.Placement === 'sheet');
  }

  public get HasDockedObjects(): boolean {
    return (
      (this.ActiveSheet?.LiveTables?.length ?? 0) > 0 ||
      this.DockedCharts.length > 0 ||
      (this.ActiveSheet?.EmbeddedArtifacts?.length ?? 0) > 0
    );
  }

  public get ResolvedObjectsPaneHeightPx(): number {
    const raw = this.Workbook?.PreferredObjectsPaneHeightPx;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.max(140, Math.min(640, Math.round(raw)));
    }
    return 270;
  }

  public StartObjectsPaneResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = this.ResolvedObjectsPaneHeightPx;
    this.bindDocumentDragListeners(
      (moveEvt: MouseEvent) => {
        const deltaUp = startY - moveEvt.clientY;
        const nextHeight = Math.max(140, Math.min(640, Math.round(startHeight + deltaUp)));
        this.Workbook.PreferredObjectsPaneHeightPx = nextHeight;
        this.cdr.markForCheck();
      },
      () => {
        this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
        this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
        this.cdr.markForCheck();
      },
    );
  }

  public ResetObjectsPaneHeight(): void {
    delete this.Workbook.PreferredObjectsPaneHeightPx;
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private computeCellPixelOffset(cellAddress: string): { left: number; top: number } {
    const parsed = ParseCellAddress(cellAddress || 'E2') ?? { row: 2, col: 5 };
    const cols = this.ActiveSheet?.Columns ?? [];
    const rows = this.ActiveSheet?.Rows ?? [];
    let left = 42;
    for (let c = 1; c < parsed.col; c++) {
      const colSpec = cols.find((item) => item.Index === c);
      left += (colSpec?.Width ?? 14) * 8;
    }
    let top = 28;
    for (let r = 1; r < parsed.row; r++) {
      const rowSpec = rows.find((item) => item.Index === r);
      top += rowSpec?.Height ?? 28;
    }
    return { left: Math.round(left), top: Math.round(top) };
  }

  private resolveNearestCellFromOffset(offsetX: number, offsetY: number): string {
    const cols = this.ActiveSheet?.Columns ?? [];
    const rows = this.ActiveSheet?.Rows ?? [];
    let col = 1;
    let x = 42;
    const maxCols = Math.max(26, cols.length);
    for (let c = 1; c <= maxCols; c++) {
      const w = (cols.find((item) => item.Index === c)?.Width ?? 14) * 8;
      if (offsetX < x + w * 0.5) {
        col = c;
        break;
      }
      x += w;
      col = c;
    }

    let row = 1;
    let y = 28;
    const maxRows = Math.max(50, rows.length);
    for (let r = 1; r <= maxRows; r++) {
      const h = rows.find((item) => item.Index === r)?.Height ?? 28;
      if (offsetY < y + h * 0.5) {
        row = r;
        break;
      }
      y += h;
      row = r;
    }
    return FormatCellAddress(row, col);
  }

  public GetFloatingChartLeftPx(chart: SpreadsheetChartSpec): number {
    if (typeof chart.OffsetX === 'number' && Number.isFinite(chart.OffsetX)) {
      return Math.max(44, Math.round(chart.OffsetX));
    }
    return this.computeCellPixelOffset(chart.PositionCell).left;
  }

  public GetFloatingChartTopPx(chart: SpreadsheetChartSpec): number {
    if (typeof chart.OffsetY === 'number' && Number.isFinite(chart.OffsetY)) {
      return Math.max(30, Math.round(chart.OffsetY));
    }
    return this.computeCellPixelOffset(chart.PositionCell).top;
  }

  public ToggleChartPlacement(chart: SpreadsheetChartSpec): void {
    if (!this.CanEdit) return;
    if (chart.Placement === 'sheet') {
      chart.Placement = 'dock';
    } else {
      chart.Placement = 'sheet';
      if (typeof chart.OffsetX !== 'number' || typeof chart.OffsetY !== 'number') {
        const pos = this.computeCellPixelOffset(chart.PositionCell || 'E2');
        chart.OffsetX = pos.left;
        chart.OffsetY = pos.top;
      }
      chart.WidthPx = chart.WidthPx ?? 400;
      chart.HeightPx = chart.HeightPx ?? 240;
    }
    this.commitChartStructureChange();
  }

  public StartChartDrag(chart: SpreadsheetChartSpec, event: MouseEvent): void {
    if (!this.CanEdit || chart.Placement !== 'sheet') return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const originLeft = this.GetFloatingChartLeftPx(chart);
    const originTop = this.GetFloatingChartTopPx(chart);

    this.bindDocumentDragListeners(
      (moveEvt: MouseEvent) => {
        chart.OffsetX = Math.max(44, Math.round(originLeft + (moveEvt.clientX - startX)));
        chart.OffsetY = Math.max(30, Math.round(originTop + (moveEvt.clientY - startY)));
        chart.PositionCell = this.resolveNearestCellFromOffset(chart.OffsetX, chart.OffsetY);
        this.cdr.markForCheck();
      },
      () => {
        this.commitChartStructureChange();
      },
    );
  }

  public StartChartResize(chart: SpreadsheetChartSpec, event: MouseEvent): void {
    if (!this.CanEdit || chart.Placement !== 'sheet') return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const originWidth = chart.WidthPx ?? 400;
    const originHeight = chart.HeightPx ?? 240;

    this.bindDocumentDragListeners(
      (moveEvt: MouseEvent) => {
        chart.WidthPx = Math.max(260, Math.min(920, Math.round(originWidth + (moveEvt.clientX - startX))));
        chart.HeightPx = Math.max(190, Math.min(640, Math.round(originHeight + (moveEvt.clientY - startY))));
        this.cdr.markForCheck();
      },
      () => {
        this.commitChartStructureChange();
      },
    );
  }

  private commitChartStructureChange(): void {
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  public OpenChartEditorModal(chart: SpreadsheetChartSpec, event?: Event): void {
    event?.stopPropagation();
    if (!this.CanEdit) return;
    this.editingChartTargetId = chart.ChartID;
    this.EditingChartDraft = {
      ...chart,
      Placement: chart.Placement ?? 'dock',
      HasHeaderRow: chart.HasHeaderRow ?? 'auto',
      SeriesOrientation: chart.SeriesOrientation ?? 'columns',
      ShowLegend: chart.ShowLegend ?? true,
      IncludedSeriesIndices: chart.IncludedSeriesIndices ? [...chart.IncludedSeriesIndices] : undefined,
    };
    this.cdr.markForCheck();
  }

  public CloseChartEditorModal(): void {
    this.EditingChartDraft = null;
    this.editingChartTargetId = null;
    this.cdr.markForCheck();
  }

  public SetChartEditorType(nextType: string): void {
    if (!this.EditingChartDraft) return;
    if (nextType === 'bar' || nextType === 'line' || nextType === 'area' || nextType === 'pie') {
      this.EditingChartDraft.ChartType = nextType;
      this.cdr.markForCheck();
    }
  }

  public ApplyCurrentSelectionToChartEditor(): void {
    if (!this.EditingChartDraft) return;
    const range = this.SelectedRange.includes(':')
      ? this.SelectedRange
      : this.detectContiguousRangeForChart(this.ActiveCellAddress || 'A1');
    this.EditingChartDraft.SourceRange = range;
    this.EditingChartDraft.IncludedSeriesIndices = undefined;
    this.EditingChartDraft.CategoryColumnIndex = undefined;
    this.cdr.markForCheck();
  }

  public OnChartEditorRangeInputChanged(): void {
    if (!this.EditingChartDraft) return;
    this.EditingChartDraft.IncludedSeriesIndices = undefined;
    this.EditingChartDraft.CategoryColumnIndex = undefined;
    this.cdr.markForCheck();
  }

  public GetChartEditorHeaderModeValue(): string {
    const val = this.EditingChartDraft?.HasHeaderRow;
    if (val === true) return 'true';
    if (val === false) return 'false';
    return 'auto';
  }

  public SetChartEditorHeaderMode(mode: string): void {
    if (!this.EditingChartDraft) return;
    this.EditingChartDraft.HasHeaderRow = mode === 'true' ? true : mode === 'false' ? false : 'auto';
    this.cdr.markForCheck();
  }

  public OnChartEditorOrientationChanged(orientation: string): void {
    if (!this.EditingChartDraft) return;
    this.EditingChartDraft.SeriesOrientation = orientation === 'rows' ? 'rows' : 'columns';
    this.EditingChartDraft.CategoryColumnIndex = undefined;
    this.EditingChartDraft.IncludedSeriesIndices = undefined;
    this.cdr.markForCheck();
  }

  public GetChartEditorCategoryIndexValue(dataset: SpreadsheetChartDataset): number {
    if (typeof this.EditingChartDraft?.CategoryColumnIndex === 'number') {
      return this.EditingChartDraft.CategoryColumnIndex;
    }
    const firstNonNumeric = dataset.DetectedColumns?.find((c) => !c.IsNumeric);
    return firstNonNumeric?.Index ?? dataset.DetectedColumns?.[0]?.Index ?? 0;
  }

  public OnChartEditorCategoryChanged(colIndex: number): void {
    if (!this.EditingChartDraft) return;
    const parsed = Number(colIndex);
    this.EditingChartDraft.CategoryColumnIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
    if (this.EditingChartDraft.IncludedSeriesIndices) {
      this.EditingChartDraft.IncludedSeriesIndices = this.EditingChartDraft.IncludedSeriesIndices.filter(
        (i) => i !== parsed,
      );
      if (this.EditingChartDraft.IncludedSeriesIndices.length === 0) {
        this.EditingChartDraft.IncludedSeriesIndices = undefined;
      }
    }
    this.cdr.markForCheck();
  }

  public GetChartEditorSeriesCandidates(
    dataset: SpreadsheetChartDataset,
  ): Array<{ Index: number; Name: string; IsNumeric: boolean }> {
    const catIdx = this.GetChartEditorCategoryIndexValue(dataset);
    const detected = dataset.DetectedColumns ?? [];
    const numericOthers = detected.filter((c) => c.Index !== catIdx && c.IsNumeric);
    if (numericOthers.length > 0) {
      return numericOthers;
    }
    return detected.filter((c) => c.Index !== catIdx);
  }

  public IsChartEditorSeriesIncluded(colIndex: number): boolean {
    const included = this.EditingChartDraft?.IncludedSeriesIndices;
    if (!included || included.length === 0) {
      return true;
    }
    return included.includes(colIndex);
  }

  public ToggleChartEditorSeries(
    colIndex: number,
    candidates: Array<{ Index: number; Name: string; IsNumeric: boolean }>,
  ): void {
    if (!this.EditingChartDraft) return;
    const allIndices = candidates.map((c) => c.Index);
    const current =
      this.EditingChartDraft.IncludedSeriesIndices && this.EditingChartDraft.IncludedSeriesIndices.length > 0
        ? [...this.EditingChartDraft.IncludedSeriesIndices]
        : [...allIndices];
    const next = current.includes(colIndex)
      ? current.filter((i) => i !== colIndex)
      : [...current, colIndex].sort((a, b) => a - b);
    if (next.length === 0) {
      return;
    }
    this.EditingChartDraft.IncludedSeriesIndices = next.length === allIndices.length ? undefined : next;
    this.cdr.markForCheck();
  }

  public GetChartEditorPreviewDataset(): SpreadsheetChartDataset | null {
    const draft = this.EditingChartDraft;
    if (!draft || !draft.SourceRange?.trim()) {
      return null;
    }
    return SpreadsheetEngine.Instance.ExtractChartDataset(
      this.Workbook,
      draft.SheetID || this.ActiveSheet.SheetID,
      draft.ChartID || draft.SourceRange,
      draft,
    );
  }

  public ConfirmSaveChartEditor(): void {
    const draft = this.EditingChartDraft;
    if (!this.CanEdit || !draft) return;
    const trimmedRange = (draft.SourceRange ?? '').trim();
    if (!trimmedRange) {
      this.notifyError('Chart source range cannot be empty.');
      return;
    }

    const charts = this.ActiveSheet.Charts ?? [];
    const targetIdx = charts.findIndex((c) => c.ChartID === this.editingChartTargetId);
    if (targetIdx < 0) {
      this.CloseChartEditorModal();
      return;
    }
    const prev = charts[targetIdx];
    const nextCell = (draft.PositionCell || prev.PositionCell || 'E2').trim().toUpperCase();
    const cellMoved = nextCell !== (prev.PositionCell || 'E2').trim().toUpperCase();

    let nextOffsetX = draft.OffsetX;
    let nextOffsetY = draft.OffsetY;
    if (draft.Placement === 'sheet' && (cellMoved || typeof nextOffsetX !== 'number' || typeof nextOffsetY !== 'number')) {
      const pos = this.computeCellPixelOffset(nextCell);
      nextOffsetX = pos.left;
      nextOffsetY = pos.top;
    }

    const updatedChart: SpreadsheetChartSpec = {
      ...prev,
      Title: (draft.Title || '').trim() || `Chart (${trimmedRange})`,
      ChartType: draft.ChartType,
      SourceRange: trimmedRange,
      PositionCell: nextCell,
      Placement: draft.Placement === 'sheet' ? 'sheet' : 'dock',
      OffsetX: nextOffsetX,
      OffsetY: nextOffsetY,
      WidthPx:
        typeof draft.WidthPx === 'number' && Number.isFinite(draft.WidthPx) && draft.WidthPx >= 240
          ? Math.round(draft.WidthPx)
          : draft.Placement === 'sheet'
            ? prev.WidthPx ?? 400
            : undefined,
      HeightPx:
        typeof draft.HeightPx === 'number' && Number.isFinite(draft.HeightPx) && draft.HeightPx >= 180
          ? Math.round(draft.HeightPx)
          : draft.Placement === 'sheet'
            ? prev.HeightPx ?? 240
            : undefined,
      ShowLegend: draft.ShowLegend !== false,
      HasHeaderRow: draft.HasHeaderRow ?? 'auto',
      SeriesOrientation: draft.SeriesOrientation ?? 'columns',
      CategoryColumnIndex: draft.CategoryColumnIndex,
      IncludedSeriesIndices:
        draft.IncludedSeriesIndices && draft.IncludedSeriesIndices.length > 0
          ? [...draft.IncludedSeriesIndices]
          : undefined,
      ShowDataLabels: draft.ShowDataLabels,
    };

    charts[targetIdx] = updatedChart;
    delete this.SelectedChartSeriesByChartID[updatedChart.ChartID];
    this.EditingChartDraft = null;
    this.editingChartTargetId = null;
    this.commitChartStructureChange();
  }

  private hasCellDisplayValue(cellAddr: string): boolean {
    const cell = this.ActiveSheet?.Cells?.[cellAddr];
    if (!cell) return false;
    const raw = cell.ComputedValue ?? cell.RawValue;
    return raw !== null && raw !== undefined && String(raw).trim() !== '';
  }

  private detectContiguousRangeForChart(anchorAddress: string): string {
    const cells = this.ActiveSheet?.Cells;
    if (!cells) {
      return 'A1:B5';
    }
    const anchor = ParseCellAddress(anchorAddress) ?? { col: 1, row: 1 };
    let minCol = anchor.col;
    let maxCol = anchor.col;
    let minRow = anchor.row;
    let maxRow = anchor.row;

    if (this.hasCellDisplayValue(FormatCellAddress(anchor.row, anchor.col))) {
      // Expand bounds across contiguous populated rows/columns around the active cell
      let changed = true;
      while (changed) {
        changed = false;
        if (minRow > 1) {
          for (let c = minCol; c <= maxCol; c++) {
            if (this.hasCellDisplayValue(FormatCellAddress(minRow - 1, c))) {
              minRow--;
              changed = true;
              break;
            }
          }
        }
        for (let c = minCol; c <= maxCol; c++) {
          if (this.hasCellDisplayValue(FormatCellAddress(maxRow + 1, c))) {
            maxRow++;
            changed = true;
            break;
          }
        }
        if (minCol > 1) {
          for (let r = minRow; r <= maxRow; r++) {
            if (this.hasCellDisplayValue(FormatCellAddress(r, minCol - 1))) {
              minCol--;
              changed = true;
              break;
            }
          }
        }
        for (let r = minRow; r <= maxRow; r++) {
          if (this.hasCellDisplayValue(FormatCellAddress(r, maxCol + 1))) {
            maxCol++;
            changed = true;
            break;
          }
        }
      }
      if (maxCol > minCol || maxRow > minRow) {
        return `${FormatCellAddress(minRow, minCol)}:${FormatCellAddress(maxRow, maxCol)}`;
      }
    }

    // Fallback: scan all populated cells on the active sheet
    let foundAny = false;
    let sheetMinCol = Number.MAX_SAFE_INTEGER;
    let sheetMaxCol = 0;
    let sheetMinRow = Number.MAX_SAFE_INTEGER;
    let sheetMaxRow = 0;
    for (const addr of Object.keys(cells)) {
      if (!this.hasCellDisplayValue(addr)) continue;
      const parsed = ParseCellAddress(addr);
      if (!parsed) continue;
      foundAny = true;
      if (parsed.col < sheetMinCol) sheetMinCol = parsed.col;
      if (parsed.col > sheetMaxCol) sheetMaxCol = parsed.col;
      if (parsed.row < sheetMinRow) sheetMinRow = parsed.row;
      if (parsed.row > sheetMaxRow) sheetMaxRow = parsed.row;
    }
    if (foundAny && (sheetMaxCol > sheetMinCol || sheetMaxRow > sheetMinRow)) {
      return `${FormatCellAddress(sheetMinRow, sheetMinCol)}:${FormatCellAddress(sheetMaxRow, sheetMaxCol)}`;
    }
    return 'A1:B5';
  }

  public AddRangeChartFromSelection(): void {
    if (!this.CanEdit) return;
    const range = this.SelectedRange.includes(':')
      ? this.SelectedRange
      : this.detectContiguousRangeForChart(this.ActiveCellAddress || 'A1');
    const existingIds = new Set((this.ActiveSheet.Charts ?? []).map((c) => c.ChartID));
    let nextNum = (this.ActiveSheet.Charts?.length ?? 0) + 1;
    while (existingIds.has(`chart-${nextNum}`)) {
      nextNum++;
    }
    const chartSpec: SpreadsheetChartSpec = {
      ChartID: `chart-${nextNum}`,
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

  public RemoveRangeChart(chart: SpreadsheetChartSpec): void {
    if (!this.CanEdit || !this.ActiveSheet.Charts) return;
    this.ActiveSheet.Charts = this.ActiveSheet.Charts.filter((c) => c.ChartID !== chart.ChartID);
    delete this.SelectedChartSeriesByChartID[chart.ChartID];
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

  public GetChartSeriesColor(index: number): string {
    return SHEETS_CHART_SERIES_COLORS[index % SHEETS_CHART_SERIES_COLORS.length];
  }

  private getResolvedSeriesMode(
    chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
  ): number | 'all' {
    const explicit = this.SelectedChartSeriesByChartID[chart.ChartID];
    if (chart.ChartType === 'pie') {
      if (typeof explicit === 'number' && dataset.Series[explicit]) {
        return explicit;
      }
      return 0;
    }
    if (explicit === 'all') {
      return 'all';
    }
    if (typeof explicit === 'number' && dataset.Series[explicit]) {
      return explicit;
    }
    if (dataset.Series.length <= 1) {
      return 0;
    }
    // When series differ by >20x in magnitude (e.g., Revenue ~1.3M vs Units ~850),
    // default to the primary series so the chart stays readable; user can click pills to switch/compare.
    const seriesMaxes = dataset.Series.map((s) =>
      s.Values.reduce((acc, v) => (Math.abs(v) > acc ? Math.abs(v) : acc), 0),
    ).filter((m) => m > 0);
    if (seriesMaxes.length >= 2) {
      const biggest = Math.max(...seriesMaxes);
      const smallest = Math.min(...seriesMaxes);
      if (biggest / smallest > 20) {
        return 0;
      }
    }
    return 'all';
  }

  public IsChartSeriesSelected(
    chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
    seriesIndex: number,
  ): boolean {
    const mode = this.getResolvedSeriesMode(chart, dataset);
    return mode === seriesIndex;
  }

  public IsAllChartSeriesSelected(
    chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
  ): boolean {
    return this.getResolvedSeriesMode(chart, dataset) === 'all';
  }

  public SetChartSeriesSelection(chartId: string, selection: number | 'all'): void {
    this.SelectedChartSeriesByChartID[chartId] = selection;
    this.cdr.markForCheck();
  }

  public GetActiveChartSeries(
    chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
  ): ActiveChartSeriesItem[] {
    if (dataset.Series.length === 0) {
      return [];
    }
    const mode = this.getResolvedSeriesMode(chart, dataset);
    if (mode === 'all' && chart.ChartType !== 'pie') {
      return dataset.Series.map((s, idx) => ({
        Index: idx,
        Name: s.Name,
        Values: s.Values,
        Color: this.GetChartSeriesColor(idx),
      }));
    }
    const chosenIdx = typeof mode === 'number' && dataset.Series[mode] ? mode : 0;
    const chosen = dataset.Series[chosenIdx];
    return [
      {
        Index: chosenIdx,
        Name: chosen.Name,
        Values: chosen.Values,
        Color: this.GetChartSeriesColor(chosenIdx),
      },
    ];
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

  public GetChartMaxValueForSeries(seriesList: ActiveChartSeriesItem[]): number {
    let max = 0;
    for (const s of seriesList) {
      for (const v of s.Values) {
        if (v > max) max = v;
      }
    }
    return max > 0 ? max : 1;
  }

  public FormatChartValue(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 1 : 2).replace(/\.0+$/, '')}B`;
    }
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(1).replace(/\.0$/, '');
  }

  public GetChartCategoryTicks(categories: string[]): ChartCategoryTick[] {
    const count = categories.length;
    if (count === 0) return [];
    const plotLeft = 48;
    const plotRight = 362;
    const plotWidth = plotRight - plotLeft;
    const rotated = count >= 5;
    const maxLen = count >= 8 ? 11 : count >= 5 ? 14 : 18;
    return categories.map((cat, idx) => {
      const slotWidth = plotWidth / count;
      const x = plotLeft + slotWidth * idx + slotWidth / 2;
      const shortLabel = cat.length > maxLen ? `${cat.slice(0, maxLen - 1)}…` : cat;
      return {
        Index: idx,
        X: Math.round(x * 10) / 10,
        ShortLabel: shortLabel,
        FullLabel: cat,
        Rotated: rotated,
      };
    });
  }

  public GetChartBarRects(
    chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
    activeSeries: ActiveChartSeriesItem[],
    maxVal: number,
  ): ChartBarRect[] {
    const categories = dataset.Categories;
    const catCount = categories.length;
    const seriesCount = activeSeries.length;
    if (catCount === 0 || seriesCount === 0) return [];

    const plotLeft = 48;
    const plotRight = 362;
    const plotTop = 18;
    const plotBottom = 140;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const groupWidth = plotWidth / catCount;
    const groupPadding = Math.min(10, groupWidth * 0.18);
    const usableGroupWidth = Math.max(8, groupWidth - groupPadding * 2);
    const barGap = seriesCount > 1 ? 2 : 0;
    const barWidth = Math.max(4, (usableGroupWidth - barGap * (seriesCount - 1)) / seriesCount);

    const rects: ChartBarRect[] = [];
    for (let cIdx = 0; cIdx < catCount; cIdx++) {
      const groupStartX = plotLeft + cIdx * groupWidth + groupPadding;
      for (let sIdx = 0; sIdx < seriesCount; sIdx++) {
        const s = activeSeries[sIdx];
        const val = s.Values[cIdx] ?? 0;
        const clamped = Math.max(0, val);
        const height = maxVal > 0 ? (clamped / maxVal) * plotHeight : 0;
        const x = groupStartX + sIdx * (barWidth + barGap);
        const y = plotBottom - height;
        rects.push({
          Key: `${chart.ChartID}-${s.Index}-${cIdx}`,
          SeriesIndex: sIdx,
          CategoryIndex: cIdx,
          SeriesName: s.Name,
          Category: categories[cIdx],
          X: Math.round(x * 10) / 10,
          Y: Math.round(y * 10) / 10,
          Width: Math.round(barWidth * 10) / 10,
          Height: Math.round(height * 10) / 10,
          Color: s.Color,
          Value: val,
          FormattedValue: this.FormatChartValue(val),
        });
      }
    }
    return rects;
  }

  public GetChartLineSeries(
    dataset: SpreadsheetChartDataset,
    activeSeries: ActiveChartSeriesItem[],
    maxVal: number,
    chart?: SpreadsheetChartSpec,
  ): ChartLineSeriesItem[] {
    const categories = dataset.Categories;
    const catCount = categories.length;
    if (catCount === 0 || activeSeries.length === 0) return [];

    const plotLeft = 48;
    const plotRight = 362;
    const plotTop = 18;
    const plotBottom = 140;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const slotWidth = plotWidth / catCount;

    return activeSeries.map((s, sIdx) => {
      const points: ChartLinePoint[] = categories.map((cat, idx) => {
        const val = s.Values[idx] ?? 0;
        const clamped = Math.max(0, val);
        const ratio = maxVal > 0 ? clamped / maxVal : 0;
        const x = plotLeft + slotWidth * idx + slotWidth / 2;
        const y = plotBottom - ratio * plotHeight;
        const labelY = y - 7 >= 12 ? y - 7 : y + 12;
        return {
          Index: idx,
          X: Math.round(x * 10) / 10,
          Y: Math.round(y * 10) / 10,
          LabelY: Math.round(labelY * 10) / 10,
          Category: cat,
          Value: val,
          FormattedValue: this.FormatChartValue(val),
        };
      });

      const polylinePoints = points.map((p) => `${p.X},${p.Y}`).join(' ');
      let areaPath = '';
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        areaPath = `M ${first.X} ${plotBottom} ` +
          points.map((p) => `L ${p.X} ${p.Y}`).join(' ') +
          ` L ${last.X} ${plotBottom} Z`;
      } else if (points.length === 1) {
        const p = points[0];
        areaPath = `M ${p.X - 12} ${plotBottom} L ${p.X - 12} ${p.Y} L ${p.X + 12} ${p.Y} L ${p.X + 12} ${plotBottom} Z`;
      }

      return {
        SeriesIndex: sIdx,
        Name: s.Name,
        Color: s.Color,
        PolylinePoints: polylinePoints,
        AreaPath: areaPath,
        ShowPointLabels:
          chart?.ShowDataLabels === true
            ? true
            : chart?.ShowDataLabels === false
              ? false
              : activeSeries.length === 1 && catCount <= 10,
        Points: points,
      };
    });
  }

  public GetChartPieSlices(
    _chart: SpreadsheetChartSpec,
    dataset: SpreadsheetChartDataset,
    activeSeries: ActiveChartSeriesItem[],
  ): ChartPieSlice[] {
    const targetSeries = activeSeries[0];
    if (!targetSeries || dataset.Categories.length === 0) return [];

    const positiveValues = dataset.Categories.map((cat, idx) => ({
      Category: cat,
      Value: Math.max(0, targetSeries.Values[idx] ?? 0),
    }));
    const total = positiveValues.reduce((sum, item) => sum + item.Value, 0);
    if (total <= 0) return [];

    const nonZeroCount = positiveValues.filter((item) => item.Value > 0).length;
    const cx = 96;
    const cy = 90;
    const r = 62;
    let currentAngle = -Math.PI / 2;

    return positiveValues.map((item, idx) => {
      const frac = item.Value / total;
      const sweepAngle = frac * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweepAngle;
      currentAngle = endAngle;

      const isFullCircle = nonZeroCount === 1 && item.Value > 0;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = sweepAngle > Math.PI ? 1 : 0;
      const path =
        item.Value <= 0
          ? ''
          : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

      const shortCat =
        item.Category.length > 15 ? `${item.Category.slice(0, 14)}…` : item.Category;

      return {
        Index: idx,
        Category: item.Category,
        ShortCategory: shortCat,
        RawValue: item.Value,
        FormattedValue: this.FormatChartValue(item.Value),
        PercentLabel: `${Math.round(frac * 100)}%`,
        Color: this.GetChartSeriesColor(idx),
        Path: path,
        IsFullCircle: isFullCircle,
      };
    });
  }

  public OnChartTypeChanged(chart: SpreadsheetChartSpec, nextType: SpreadsheetChartType): void {
    if (!this.CanEdit) return;
    chart.ChartType = nextType;
    this.commitChartStructureChange();
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
    return provider.EntityByName('MJ: Artifacts')?.ID;
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
        if (!IsValidUUID(emb.ArtifactID) || (emb.ArtifactVersionID && !IsValidUUID(emb.ArtifactVersionID))) {
          continue;
        }
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
      const embedConfig = BuildArtifactVersionConfigurationWithPreview(
        null,
        nextContent,
        null,
        embed.Title,
      );
      if (embedConfig) {
        nextVer.Configuration = embedConfig;
      }

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
    const parsed = this.ParseCollaboratorSheetRanges(anchorKey);
    if (parsed.SheetID && this.Workbook.Worksheets.some((w) => w.SheetID === parsed.SheetID)) {
      this.Workbook.ActiveSheetID = parsed.SheetID;
    }
    if (parsed.Ranges.length > 0) {
      this.SelectedRanges = [...parsed.Ranges];
      this.SelectedRange = this.SelectedRanges.join(', ');
      const firstAddr = parsed.Ranges[0].split(':')[0];
      const pos = ParseCellAddress(firstAddr);
      if (pos) {
        this.ActiveRowIndex = pos.row;
        this.ActiveColumnIndex = pos.col;
        this.syncFormulaBarFromActiveCell();
      }
    }
    this.cdr.markForCheck();
  }

  public GetCellCommentThreads(rowIndex: number, colIndex: number): DocumentAnchoredThread[] {
    if (!this.AnchoredThreads || this.AnchoredThreads.length === 0) {
      return [];
    }
    const activeSheetId = this.ActiveSheet?.SheetID;
    const matches: DocumentAnchoredThread[] = [];
    for (const thread of this.AnchoredThreads) {
      const parsed = this.ParseCollaboratorSheetRanges(thread.AnchorKey);
      if (parsed.SheetID !== null && parsed.SheetID !== activeSheetId) {
        continue;
      }
      if (parsed.Ranges.some((segment) => this.isCellInsideRangeString(rowIndex, colIndex, segment))) {
        matches.push(thread);
      }
    }
    return matches;
  }

  public OpenCommentThreadFromCell(thread: DocumentAnchoredThread | undefined, event?: MouseEvent): void {
    event?.stopPropagation();
    this.ShowCommentsDrawer = true;
    if (thread?.AnchorKey) {
      this.FocusRangeFromAnchorKey(thread.AnchorKey);
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

  protected override resolveCaptureRootElement(): HTMLElement | null {
    const el = this.captureHostElementRef?.nativeElement;
    if (!el) return null;
    return el.querySelector<HTMLElement>('.mj-sheets-grid-scroll') ?? el;
  }

  public async SaveNewArtifactVersion(): Promise<void> {
    if (!this.CanEdit || this.IsSavingVersion || !this.HasUnsavedChanges) return;
    this.IsSavingVersion = true;
    this.cdr.markForCheck();

    try {
      const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);

      const { Policy, CapturedThumbnailDataUrl } = await CaptureThumbnailForDriverIfAllowed(
        'SpreadsheetArtifactViewerPlugin',
        this.resolveCaptureRootElement(),
      );

      const sentViaWs = this.CollaborationSession?.RequestSaveVersion(CapturedThumbnailDataUrl) ?? false;
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
        CapturedThumbnailDataUrl,
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
      const sheetConfig = BuildArtifactVersionConfigurationWithPreview(
        serialized,
        serialized,
        'SpreadsheetArtifactViewerPlugin',
        ver.Name,
        {
          Policy,
          CapturedThumbnailDataUrl,
        },
      );
      if (sheetConfig) {
        ver.Configuration = sheetConfig;
      }

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
    if (!this.SelectedRange) return false;
    const segments = this.SelectedRange.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return segments.some((segment) => this.isCellInsideRangeString(rowIndex, colIndex, segment));
  }

  public IsRowInSelectedRange(rowIndex: number): boolean {
    if (!this.SelectedRange) return false;
    const segments = this.SelectedRange.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return segments.some((segment) => {
      const parts = segment.split(':');
      const p1 = ParseCellAddress(parts[0]?.trim() ?? '');
      const p2 = parts.length > 1 ? ParseCellAddress(parts[1]?.trim() ?? '') : p1;
      if (!p1 || !p2) return false;
      const rMin = Math.min(p1.row, p2.row);
      const rMax = Math.max(p1.row, p2.row);
      return rowIndex >= rMin && rowIndex <= rMax;
    });
  }

  public IsColumnInSelectedRange(colIndex: number): boolean {
    if (!this.SelectedRange) return false;
    const segments = this.SelectedRange.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return segments.some((segment) => {
      const parts = segment.split(':');
      const p1 = ParseCellAddress(parts[0]?.trim() ?? '');
      const p2 = parts.length > 1 ? ParseCellAddress(parts[1]?.trim() ?? '') : p1;
      if (!p1 || !p2) return false;
      const cMin = Math.min(p1.col, p2.col);
      const cMax = Math.max(p1.col, p2.col);
      return colIndex >= cMin && colIndex <= cMax;
    });
  }

  private isCellInsideRangeString(rowIndex: number, colIndex: number, rangeStr: string): boolean {
    const parts = rangeStr.split(':');
    const p1 = ParseCellAddress(parts[0]?.trim() ?? '');
    const p2 = parts.length > 1 ? ParseCellAddress(parts[1]?.trim() ?? '') : p1;
    if (!p1 || !p2) return false;
    const rMin = Math.min(p1.row, p2.row);
    const rMax = Math.max(p1.row, p2.row);
    const cMin = Math.min(p1.col, p2.col);
    const cMax = Math.max(p1.col, p2.col);
    return rowIndex >= rMin && rowIndex <= rMax && colIndex >= cMin && colIndex <= cMax;
  }

  public RecordSyntheticAgentSelection(
    sheetId: string,
    boundingRange: string,
    agentName = 'AI Agent',
  ): void {
    if (this.syntheticAgentTimer) {
      clearTimeout(this.syntheticAgentTimer);
      this.syntheticAgentTimer = null;
    }
    this.SyntheticAgentPresence = {
      ClientID: -999,
      UserID: 'ai-agent',
      Name: agentName,
      Color: '#8b5cf6',
      ActiveBlockID: `${sheetId}:${boundingRange}`,
      CanEdit: true,
      IsAgent: true,
    };
    this.cdr.markForCheck();
    this.syntheticAgentTimer = setTimeout(() => {
      this.SyntheticAgentPresence = null;
      this.syntheticAgentTimer = null;
      this.cdr.markForCheck();
    }, 6000);
  }

  public GetRemoteCollaborators(): CollaboratorPresence[] {
    const localClientId = this.CollaborationSession?.Doc?.clientID;
    const remote = this.Collaborators.filter(
      (c) => localClientId === undefined || c.ClientID !== localClientId,
    );
    const hasServerAgent = remote.some((c) => c.IsAgent === true);
    if (this.SyntheticAgentPresence && !hasServerAgent) {
      const alreadyPresent = remote.some(
        (c) =>
          c.ClientID === this.SyntheticAgentPresence?.ClientID ||
          c.UserID === this.SyntheticAgentPresence?.UserID,
      );
      if (!alreadyPresent) {
        return [...remote, this.SyntheticAgentPresence];
      }
    }
    return remote;
  }

  public GetRemoteHumanCollaborators(): CollaboratorPresence[] {
    return this.GetRemoteCollaborators().filter((c) => c.IsAgent !== true);
  }

  public ParseCollaboratorSheetRanges(activeBlockId: string | undefined): {
    SheetID: string | null;
    Ranges: string[];
  } {
    if (!activeBlockId || !activeBlockId.trim()) {
      return { SheetID: null, Ranges: [] };
    }
    const trimmed = activeBlockId.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const prefix = trimmed.slice(0, colonIdx).trim();
      const remainder = trimmed.slice(colonIdx + 1).trim();
      const matchesSheet = this.Workbook?.Worksheets?.some((w) => w.SheetID === prefix);
      const isSheetPrefix =
        matchesSheet || prefix.startsWith('sheet-') || ParseCellAddress(prefix) === null;
      if (isSheetPrefix) {
        const ranges = remainder
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0);
        return { SheetID: prefix, Ranges: ranges };
      }
    }
    const ranges = trimmed
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    return { SheetID: null, Ranges: ranges };
  }

  public GetCellCollaborators(rowIndex: number, colIndex: number): CollaboratorPresence[] {
    const activeSheetId = this.ActiveSheet?.SheetID;
    const remote = this.GetRemoteCollaborators();
    return remote.filter((collab) => {
      const parsed = this.ParseCollaboratorSheetRanges(collab.ActiveBlockID);
      if (parsed.SheetID !== null && parsed.SheetID !== activeSheetId) {
        return false;
      }
      return parsed.Ranges.some((rng) => this.isCellInsideRangeString(rowIndex, colIndex, rng));
    });
  }

  public GetCellCollaboratorBorderColor(rowIndex: number, colIndex: number): string | null {
    const collabs = this.GetCellCollaborators(rowIndex, colIndex);
    return collabs[0]?.Color ?? null;
  }

  public GetCellPrimaryCollaboratorBadge(
    rowIndex: number,
    colIndex: number,
  ): CollaboratorPresence | null {
    const activeSheetId = this.ActiveSheet?.SheetID;
    const remote = this.GetRemoteCollaborators();
    for (const collab of remote) {
      const parsed = this.ParseCollaboratorSheetRanges(collab.ActiveBlockID);
      if (parsed.SheetID !== null && parsed.SheetID !== activeSheetId) {
        continue;
      }
      for (const rng of parsed.Ranges) {
        const parts = rng.split(':');
        const p1 = ParseCellAddress(parts[0]?.trim() ?? '');
        const p2 = parts.length > 1 ? ParseCellAddress(parts[1]?.trim() ?? '') : p1;
        if (!p1 || !p2) continue;
        const rMin = Math.min(p1.row, p2.row);
        const cMin = Math.min(p1.col, p2.col);
        if (rowIndex === rMin && colIndex === cMin) {
          return collab;
        }
      }
    }
    return null;
  }

  public JumpToCollaboratorSelection(collab: CollaboratorPresence): void {
    const loc = collab.AgentLocation;
    const targetBlock =
      collab.ActiveBlockID ||
      (loc?.Domain === 'spreadsheet' && loc.Range
        ? `${loc.SheetID ?? loc.SheetName ?? ''}:${loc.Range}`.replace(/^:/, '')
        : undefined);
    const parsed = this.ParseCollaboratorSheetRanges(targetBlock);
    const requestedSheet = parsed.SheetID || loc?.SheetID || loc?.SheetName || null;
    if (requestedSheet && this.Workbook?.Worksheets) {
      const matchedSheet = this.Workbook.Worksheets.find(
        (w) => w.SheetID === requestedSheet || w.Name === requestedSheet,
      );
      if (matchedSheet) {
        this.Workbook.ActiveSheetID = matchedSheet.SheetID;
      }
    }
    if (parsed.Ranges.length > 0) {
      this.SelectedRanges = parsed.Ranges;
      this.SelectedRange = parsed.Ranges.join(', ');
      const firstRange = parsed.Ranges[0];
      const parts = firstRange.split(':');
      const p1 = ParseCellAddress(parts[0]?.trim() ?? '');
      const p2 = parts.length > 1 ? ParseCellAddress(parts[1]?.trim() ?? '') : p1;
      if (p1 && p2) {
        this.ActiveRowIndex = Math.min(p1.row, p2.row);
        this.ActiveColumnIndex = Math.min(p1.col, p2.col);
      } else if (p1) {
        this.ActiveRowIndex = p1.row;
        this.ActiveColumnIndex = p1.col;
      }
      this.syncFormulaBarFromActiveCell();
    }
    this.cdr.markForCheck();
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

  // ---------------------------------------------------------------------------
  // Context Menu Orchestration (Zones 4a–4f)
  // ---------------------------------------------------------------------------

  public OnShellPointerDown(event: PointerEvent): void {
    this.touchContextMenuMonitor.OnPointerDown(event);
  }

  public OnShellPointerMove(event: PointerEvent): void {
    this.touchContextMenuMonitor.OnPointerMove(event);
  }

  public OnShellPointerUp(event: PointerEvent): void {
    this.touchContextMenuMonitor.OnPointerUp(event);
  }

  public OnShellPointerCancel(event: PointerEvent): void {
    this.touchContextMenuMonitor.OnPointerCancel(event);
  }

  private handleTouchContextMenuTrigger(trigger: TouchContextMenuTrigger): void {
    const el = trigger.Target instanceof HTMLElement ? trigger.Target : null;
    if (!el) return;

    const cellEl = el.closest<HTMLElement>('[data-address]');
    if (cellEl) {
      const addr = cellEl.getAttribute('data-address');
      const parsed = addr ? ParseCellAddress(addr) : null;
      if (parsed) {
        this.openCellContextMenuAtPoint(parsed.row, parsed.col, trigger.AnchorX, trigger.AnchorY, cellEl);
      }
      return;
    }

    const rowEl = el.closest<HTMLElement>('[data-testid^="sheet-row-header-"]');
    if (rowEl) {
      const testId = rowEl.getAttribute('data-testid') ?? '';
      const rowIdx = Number(testId.replace('sheet-row-header-', ''));
      if (Number.isInteger(rowIdx) && rowIdx > 0) {
        this.openRowHeaderContextMenuAtPoint(rowIdx, trigger.AnchorX, trigger.AnchorY, rowEl);
      }
      return;
    }

    const colEl = el.closest<HTMLElement>('[data-col-id]');
    if (colEl) {
      const colId = colEl.getAttribute('data-col-id');
      const col = this.ActiveSheet?.Columns.find((c) => c.ColumnID === colId);
      if (col) {
        this.openColumnHeaderContextMenuAtPoint(col, trigger.AnchorX, trigger.AnchorY, colEl);
      }
    }
  }

  public OnCellContextMenu(event: MouseEvent, rowIndex: number, colIndex: number): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openCellContextMenuAtPoint(rowIndex, colIndex, event.clientX, event.clientY, restoreEl);
  }

  private openCellContextMenuAtPoint(
    rowIndex: number,
    colIndex: number,
    clientX: number,
    clientY: number,
    restoreEl: HTMLElement | null,
  ): void {
    if (!this.IsAddressInSelectedRange(rowIndex, colIndex)) {
      this.SelectCell(rowIndex, colIndex);
    } else {
      this.ActiveRowIndex = rowIndex;
      this.ActiveColumnIndex = colIndex;
      this.syncFormulaBarFromActiveCell();
    }

    const sheet = this.ActiveSheet;
    const primaryRange = this.SelectedRanges[0] ?? this.SelectedRange ?? FormatCellAddress(rowIndex, colIndex);
    const bounds = this.parseRangeBounds(primaryRange) ?? {
      minR: rowIndex,
      maxR: rowIndex,
      minC: colIndex,
      maxC: colIndex,
    };
    const anchorA1 = FormatCellAddress(rowIndex, colIndex);
    const rangeA1 = this.SelectedRange || anchorA1;
    const cell = sheet.Cells[anchorA1];
    const hasFormula = Boolean(cell?.Formula);
    const hasMjFormula = Boolean(
      cell?.Formula && SpreadsheetEngine.Instance.ParseMjCustomFunctionFormula(cell.Formula),
    );
    const spilledFromA1 = cell?.SpilledFrom ?? null;
    const anchorCellForSpill = spilledFromA1 ? sheet.Cells[spilledFromA1] : cell;
    const spillRangeA1 = anchorCellForSpill?.SpillRange ?? null;
    const intersectsLiveOrChartBlock = this.doesBoundsIntersectLiveOrChart(
      sheet,
      bounds.minR,
      bounds.maxR,
      bounds.minC,
      bounds.maxC,
    );

    const target: SheetsContextMenuTarget = {
      Kind: 'cell',
      SheetID: sheet.SheetID,
      AnchorA1: anchorA1,
      RangeA1: rangeA1,
      StartRow: bounds.minR,
      EndRow: bounds.maxR,
      StartCol: bounds.minC,
      EndCol: bounds.maxC,
      TotalRows: Math.max(1, sheet.Rows.length),
      TotalCols: Math.max(1, sheet.Columns.length),
      HasFormula: hasFormula,
      HasMjFormula: hasMjFormula,
      SpilledFromA1: spilledFromA1,
      SpillRangeA1: spillRangeA1,
      IntersectsLiveOrChartBlock: intersectsLiveOrChartBlock,
      CurrentFormat: this.ActiveCellFormatType,
      IsBold: Boolean(cell?.Style?.Bold),
      IsItalic: Boolean(cell?.Style?.Italic),
      HorizontalAlign: cell?.Style?.HorizontalAlign ?? (this.IsNumericOrRightAligned(cell) ? 'right' : 'left'),
      TextColor: cell?.Style?.TextColor ?? null,
      BackgroundColor: cell?.Style?.BackgroundColor ?? null,
      ProtectedReason: this.findProtectedReasonInRange(sheet, bounds.minR, bounds.maxR, bounds.minC, bounds.maxC),
      RangeThreadCount: this.countThreadsIntersectingRange(sheet.SheetID, bounds.minR, bounds.maxR, bounds.minC, bounds.maxC),
    };

    this.OpenContextMenuAt(target, clientX, clientY, `Cell ${rangeA1} context menu`, restoreEl);
  }

  public OnRowHeaderContextMenu(event: MouseEvent, rowIndex: number): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openRowHeaderContextMenuAtPoint(rowIndex, event.clientX, event.clientY, restoreEl);
  }

  private openRowHeaderContextMenuAtPoint(
    rowIndex: number,
    clientX: number,
    clientY: number,
    restoreEl: HTMLElement | null,
  ): void {
    if (!this.IsRowInSelectedRange(rowIndex)) {
      this.SelectRowHeader(rowIndex);
    }

    const sheet = this.ActiveSheet;
    const totalCols = Math.max(1, sheet.Columns.length);
    const bounds = this.getSelectedRowSpan(rowIndex);
    const hasAdjacentHiddenRows = sheet.Rows.some(
      (r) => r.Hidden && r.Index >= Math.max(1, bounds.startRow - 1) && r.Index <= bounds.endRow + 1,
    );

    const target: SheetsContextMenuTarget = {
      Kind: 'row-header',
      SheetID: sheet.SheetID,
      StartRow: bounds.startRow,
      EndRow: bounds.endRow,
      TotalRows: Math.max(1, sheet.Rows.length),
      TotalCols: totalCols,
      CurrentFrozenRows: sheet.FrozenRows ?? 0,
      HasAdjacentHiddenRows: hasAdjacentHiddenRows,
      ProtectedReason: this.findProtectedReasonInRange(sheet, bounds.startRow, bounds.endRow, 1, totalCols),
      RangeThreadCount: this.countThreadsIntersectingRange(sheet.SheetID, bounds.startRow, bounds.endRow, 1, totalCols),
    };

    this.OpenContextMenuAt(target, clientX, clientY, `Row ${rowIndex} context menu`, restoreEl);
  }

  public OnColumnHeaderContextMenu(event: MouseEvent, col: SpreadsheetColumnSpec): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openColumnHeaderContextMenuAtPoint(col, event.clientX, event.clientY, restoreEl);
  }

  private openColumnHeaderContextMenuAtPoint(
    col: SpreadsheetColumnSpec,
    clientX: number,
    clientY: number,
    restoreEl: HTMLElement | null,
  ): void {
    if (!this.IsColumnInSelectedRange(col.Index)) {
      this.SelectColumnHeader(col.Letter);
    }

    const sheet = this.ActiveSheet;
    const totalRows = Math.max(1, sheet.Rows.length);
    const bounds = this.getSelectedColSpan(col.Index);
    const hasAdjacentHiddenCols = sheet.Columns.some(
      (c) => c.Hidden && c.Index >= Math.max(1, bounds.startCol - 1) && c.Index <= bounds.endCol + 1,
    );
    const sampleCell = sheet.Cells[`${ColumnIndexToLetter(bounds.startCol)}2`] ?? sheet.Cells[`${ColumnIndexToLetter(bounds.startCol)}1`];
    const currentFormat =
      sampleCell?.Style?.FormatType ??
      SpreadsheetEngine.Instance.InferFormatTypeFromPattern(sampleCell?.Style?.NumberFormatPattern);

    const target: SheetsContextMenuTarget = {
      Kind: 'col-header',
      SheetID: sheet.SheetID,
      StartCol: bounds.startCol,
      EndCol: bounds.endCol,
      StartColLetter: ColumnIndexToLetter(bounds.startCol),
      EndColLetter: ColumnIndexToLetter(bounds.endCol),
      TotalRows: totalRows,
      TotalCols: Math.max(1, sheet.Columns.length),
      CurrentFrozenColumns: sheet.FrozenColumns ?? 0,
      CurrentFormat: currentFormat,
      HasAdjacentHiddenCols: hasAdjacentHiddenCols,
      ProtectedReason: this.findProtectedReasonInRange(sheet, 1, totalRows, bounds.startCol, bounds.endCol),
      RangeThreadCount: this.countThreadsIntersectingRange(sheet.SheetID, 1, totalRows, bounds.startCol, bounds.endCol),
    };

    this.OpenContextMenuAt(target, clientX, clientY, `Column ${col.Letter} context menu`, restoreEl);
  }

  public OnWorksheetTabContextMenu(event: MouseEvent, ws: WorksheetSpec): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const sheetIndex = this.Workbook.Worksheets.findIndex((w) => w.SheetID === ws.SheetID);
    const hiddenRowCount = ws.Rows.filter((r) => r.Hidden).length;
    const hiddenColCount = ws.Columns.filter((c) => c.Hidden).length;

    const target: SheetsContextMenuTarget = {
      Kind: 'worksheet-tab',
      SheetID: ws.SheetID,
      SheetName: ws.Name,
      SheetIndex: Math.max(0, sheetIndex),
      TotalSheets: this.Workbook.Worksheets.length,
      RowCount: ws.Rows.length,
      ColCount: ws.Columns.length,
      HiddenRowCount: hiddenRowCount,
      HiddenColCount: hiddenColCount,
    };

    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.OpenContextMenuAt(target, event.clientX, event.clientY, `${ws.Name} tab context menu`, restoreEl);
  }

  public OnChartContextMenu(event: MouseEvent, chart: SpreadsheetChartSpec): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const placement = chart.Placement === 'sheet' ? 'sheet' : 'dock';
    const hasCustomSize =
      placement === 'sheet' &&
      ((typeof chart.WidthPx === 'number' && chart.WidthPx !== 400) ||
        (typeof chart.HeightPx === 'number' && chart.HeightPx !== 240));

    const target: SheetsContextMenuTarget = {
      Kind: 'chart',
      SheetID: this.ActiveSheet.SheetID,
      ChartID: chart.ChartID,
      Title: chart.Title,
      ChartType: chart.ChartType,
      Placement: placement,
      DataRangeA1: chart.SourceRange,
      HasCustomSize: hasCustomSize,
      FloatingChartCount: this.FloatingCharts.length,
    };

    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.OpenContextMenuAt(target, event.clientX, event.clientY, `${chart.Title} chart context menu`, restoreEl);
  }

  public OnLiveTableContextMenu(event: MouseEvent, table: SpreadsheetLiveTableSpec): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const target: SheetsContextMenuTarget = {
      Kind: 'live-table',
      SheetID: this.ActiveSheet.SheetID,
      TableID: table.TableID,
      Title: table.Title,
      Mode: table.Mode,
      RangeA1: this.computeLiveTableRangeA1(table),
    };

    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.OpenContextMenuAt(target, event.clientX, event.clientY, `${table.Title} live table context menu`, restoreEl);
  }

  public OnEmbeddedArtifactContextMenu(event: MouseEvent, emb: SpreadsheetEmbeddedArtifactSpec): void {
    if (ShouldBypassCustomContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const target: SheetsContextMenuTarget = {
      Kind: 'embedded-artifact',
      SheetID: this.ActiveSheet.SheetID,
      EmbedID: emb.EmbedID,
      Title: emb.Title,
      ArtifactType: emb.ArtifactTypeName,
      AnchorCellA1: emb.AnchorCell || 'A1',
      HasSourceArtifactID: Boolean(emb.ArtifactID),
    };

    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.OpenContextMenuAt(target, event.clientX, event.clientY, `${emb.Title} embedded artifact context menu`, restoreEl);
  }

  public OpenContextMenuForActiveSelectionFromKeyboard(): void {
    if (typeof document === 'undefined') return;
    const addr = this.ActiveCellAddress;
    const hostEl = this.hostElementRef?.nativeElement instanceof HTMLElement
      ? this.hostElementRef.nativeElement
      : null;
    const queriedCell = hostEl?.querySelector(`[data-testid="sheet-cell-${addr}"]`) ?? null;
    const activeCellEl = queriedCell instanceof HTMLElement
      ? queriedCell
      : this.sheetsGridContainerRef?.nativeElement ?? null;
    const anchor = activeCellEl
      ? ComputeElementContextMenuAnchor(activeCellEl)
      : { X: 120, Y: 120 };
    this.openCellContextMenuAtPoint(
      this.ActiveRowIndex,
      this.ActiveColumnIndex,
      anchor.X,
      anchor.Y,
      activeCellEl,
    );
  }

  public OpenContextMenuAt(
    target: SheetsContextMenuTarget,
    clientX: number,
    clientY: number,
    ariaLabel: string,
    restoreFocusEl: HTMLElement | null,
  ): void {
    const isMac =
      typeof navigator !== 'undefined' &&
      /mac/i.test(navigator.platform || navigator.userAgent || '');

    this.ContextMenuItems = BuildSheetsContextMenu({
      Target: target,
      CanEdit: this.CanEdit,
      CanComment: this.CanComment,
      HasClipboardData: Boolean(this.SheetsClipboardBuffer && this.SheetsClipboardBuffer.Cells.length > 0),
      ClipboardSourceRangeA1: this.SheetsClipboardBuffer?.SourceRangeA1 ?? null,
      IsMac: isMac,
    });
    this.ContextMenuX = clientX;
    this.ContextMenuY = clientY;
    this.ContextMenuAriaLabel = ariaLabel;
    this.ContextMenuRestoreFocusEl = restoreFocusEl;
    this.ContextMenuOpen = true;
    this.cdr.markForCheck();
  }

  public CloseContextMenu(): void {
    if (!this.ContextMenuOpen) return;
    this.ContextMenuOpen = false;
    this.cdr.markForCheck();
  }

  public OnContextMenuCommand(command: SheetsContextMenuCommand): void {
    this.CloseContextMenu();
    switch (command.Type) {
      case 'cut':
        this.cutSelectedRangeToClipboard();
        break;
      case 'copy':
        this.CopySelectedRangeToClipboard();
        break;
      case 'copy-special':
        this.copySpecialSelectionToClipboard(command.Kind);
        break;
      case 'paste':
        void this.applyClipboardPaste(command.Kind);
        break;
      case 'insert-rows':
        this.insertRowsAt(command.Position, command.Count, command.AtRowIndex);
        break;
      case 'delete-rows':
        this.deleteRowsAt(command.StartRowIndex, command.Count);
        break;
      case 'insert-cols':
        this.insertColsAt(command.Position, command.Count, command.AtColIndex);
        break;
      case 'delete-cols':
        this.deleteColsAt(command.StartColIndex, command.Count);
        break;
      case 'clear-range':
        this.clearRangeByKind(command.Kind, command.RangeA1);
        break;
      case 'set-number-format':
        this.applyRangeStyle(command.RangeA1, {
          FormatType: command.Format,
          NumberFormatPattern: SpreadsheetEngine.Instance.DefaultPatternForFormatType(command.Format),
        });
        break;
      case 'toggle-bold':
        this.toggleBoldForRange(command.RangeA1);
        break;
      case 'toggle-italic':
        this.toggleItalicForRange(command.RangeA1);
        break;
      case 'set-align':
        this.applyRangeStyle(command.RangeA1, { HorizontalAlign: command.Align });
        break;
      case 'set-color':
        this.applyRangeStyle(
          command.RangeA1,
          command.Target === 'fill'
            ? { BackgroundColor: command.CssColor ?? undefined }
            : { TextColor: command.CssColor ?? undefined },
        );
        break;
      case 'create-chart-from-selection':
        this.SelectedRanges = [command.RangeA1];
        this.SelectedRange = command.RangeA1;
        this.AddRangeChartFromSelection();
        break;
      case 'open-range-comments':
        this.openCommentsForRange(command.RangeA1);
        break;
      case 'add-range-comment':
        this.openCommentsForRange(command.RangeA1, true);
        break;
      case 'refresh-mj-formula':
        void this.RefreshAllLiveData(true);
        break;
      case 'inspect-mj-formula':
        this.inspectFormulaCell(command.AddressA1);
        break;
      case 'select-spill-range':
        this.selectRangeString(command.RangeA1);
        break;
      case 'select-row':
        this.SelectRowHeader(command.RowIndex);
        break;
      case 'set-row-height':
        this.promptAndSetRowHeight(command.StartRowIndex, command.EndRowIndex);
        break;
      case 'auto-fit-row-height':
        this.autoFitRowHeights(command.StartRowIndex, command.EndRowIndex);
        break;
      case 'freeze-up-to-row':
        if (this.CanEdit) {
          this.ActiveSheet.FrozenRows = command.RowIndex;
          this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
          this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
          this.cdr.markForCheck();
        }
        break;
      case 'hide-rows':
        this.hideRowsRange(command.StartRowIndex, command.EndRowIndex);
        break;
      case 'unhide-adjacent-rows':
        this.unhideAdjacentRows(command.StartRowIndex, command.EndRowIndex);
        break;
      case 'select-col':
        this.SelectColumnHeader(ColumnIndexToLetter(command.ColIndex));
        break;
      case 'sort-col':
        if (this.CanEdit) {
          SpreadsheetEngine.Instance.SortWorksheet(this.Workbook, this.ActiveSheet.SheetID, {
            ColumnLetter: command.ColumnLetter,
            Direction: command.Direction,
            HeaderRows: 1,
          });
          this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
          this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
          this.cdr.markForCheck();
        }
        break;
      case 'set-col-width':
        this.promptAndSetColWidth(command.StartColIndex, command.EndColIndex);
        break;
      case 'auto-fit-col-width':
        this.autoFitColWidths(command.StartColIndex, command.EndColIndex);
        break;
      case 'freeze-up-to-col':
        if (this.CanEdit) {
          this.ActiveSheet.FrozenColumns = command.ColIndex;
          this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
          this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
          this.cdr.markForCheck();
        }
        break;
      case 'hide-cols':
        this.hideColsRange(command.StartColIndex, command.EndColIndex);
        break;
      case 'unhide-adjacent-cols':
        this.unhideAdjacentCols(command.StartColIndex, command.EndColIndex);
        break;
      case 'rename-sheet':
        this.BeginRenameWorksheetTab(command.SheetID);
        break;
      case 'duplicate-sheet':
        this.duplicateWorksheetTab(command.SheetID);
        break;
      case 'insert-sheet':
        this.AddNewWorksheetTab();
        break;
      case 'move-sheet':
        this.moveWorksheetTab(command.SheetID, command.Direction);
        break;
      case 'unhide-all-in-sheet':
        this.unhideAllInSheet(command.SheetID);
        break;
      case 'export-sheet-csv':
        this.exportSheetCsv(command.SheetID, command.Mode);
        break;
      case 'export-workbook-xlsx':
        this.ExportWorkbookAsXlsx();
        break;
      case 'delete-sheet':
        this.deleteWorksheetById(command.SheetID);
        break;
      case 'open-chart-editor': {
        const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === command.ChartID);
        if (chart) this.OpenChartEditorModal(chart);
        break;
      }
      case 'set-chart-type': {
        const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === command.ChartID);
        if (chart) this.OnChartTypeChanged(chart, command.ChartType);
        break;
      }
      case 'toggle-chart-placement': {
        const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === command.ChartID);
        if (chart) this.ToggleChartPlacement(chart);
        break;
      }
      case 'reset-chart-size':
        this.resetChartSize(command.ChartID);
        break;
      case 'bring-chart-to-front':
        this.bringChartToFront(command.ChartID);
        break;
      case 'select-chart-source-range':
        this.selectChartSourceRange(command.ChartID);
        break;
      case 'duplicate-chart':
        this.duplicateChart(command.ChartID);
        break;
      case 'copy-chart-slide-block': {
        const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === command.ChartID);
        if (chart) this.CopySlideBlockDescriptorForChart(chart);
        break;
      }
      case 'delete-chart':
        this.deleteChart(command.ChartID);
        break;
      case 'refresh-live-table': {
        const table = this.ActiveSheet.LiveTables?.find((t) => t.TableID === command.TableID);
        if (table) void this.RefreshSingleLiveTable(table);
        break;
      }
      case 'select-live-table-range':
        this.selectLiveTableRange(command.TableID);
        break;
      case 'toggle-live-table-mode':
        this.toggleLiveTableMode(command.TableID);
        break;
      case 'open-live-table-editor':
        this.openLiveTableConfiguration(command.TableID);
        break;
      case 'copy-live-table-block':
        this.copyLiveTableBlockDescriptor(command.TableID);
        break;
      case 'delete-live-table':
        this.deleteLiveTable(command.TableID);
        break;
      case 'open-embedded-artifact':
        this.openEmbeddedArtifact(command.EmbedID);
        break;
      case 'select-embedded-anchor':
        this.selectEmbeddedAnchor(command.EmbedID);
        break;
      case 'refresh-embedded-artifact':
        void this.hydrateEmbeddedArtifactVersions();
        break;
      case 'delete-embedded-artifact':
        this.deleteEmbeddedArtifact(command.EmbedID);
        break;
    }
  }

  public GetFrozenColumnLeftPx(colIndex: number): number {
    let left = 42;
    for (const col of this.VisibleColumns) {
      if (col.Index < colIndex) {
        left += (col.Width ?? 14) * 8;
      }
    }
    return left;
  }

  public IsCellInCutSource(rowIndex: number, colIndex: number): boolean {
    const buf = this.SheetsClipboardBuffer;
    if (!buf || buf.Mode !== 'cut' || buf.SourceSheetID !== this.ActiveSheet?.SheetID) {
      return false;
    }
    return this.isCellInsideRangeString(rowIndex, colIndex, buf.SourceRangeA1);
  }

  public BeginRenameWorksheetTab(sheetId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    if (!this.CanEdit) return;
    const ws = this.Workbook.Worksheets.find((w) => w.SheetID === sheetId);
    if (!ws) return;
    this.RenamingSheetID = sheetId;
    this.RenameSheetDraftName = ws.Name;
    this.cdr.markForCheck();
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-testid="sheet-tab-rename-input"]');
        if (input) {
          input.focus();
          input.select();
        }
      }, 0);
    }
  }

  public CommitRenameWorksheetTab(): void {
    const sheetId = this.RenamingSheetID;
    if (!sheetId) return;
    const nextName = this.RenameSheetDraftName.trim();
    this.RenamingSheetID = null;
    if (!nextName || !this.CanEdit) {
      this.cdr.markForCheck();
      return;
    }
    const renamed = SpreadsheetEngine.Instance.RenameWorksheet(this.Workbook, sheetId, nextName, true);
    if (renamed) {
      this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
    }
    this.cdr.markForCheck();
  }

  public CancelRenameWorksheetTab(): void {
    this.RenamingSheetID = null;
    this.RenameSheetDraftName = '';
    this.cdr.markForCheck();
  }

  private captureSelectionIntoClipboardBuffer(mode: 'copy' | 'cut'): void {
    const sheet = this.ActiveSheet;
    if (!sheet) return;
    const primaryRange = this.SelectedRanges[0] ?? this.SelectedRange ?? this.ActiveCellAddress;
    const bounds = this.parseRangeBounds(primaryRange) ?? {
      minR: this.ActiveRowIndex,
      maxR: this.ActiveRowIndex,
      minC: this.ActiveColumnIndex,
      maxC: this.ActiveColumnIndex,
    };
    const cells: SheetsClipboardCellEntry[] = [];
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      for (let c = bounds.minC; c <= bounds.maxC; c++) {
        const addr = FormatCellAddress(r, c);
        const cell = sheet.Cells[addr];
        const value = cell?.ComputedValue ?? cell?.RawValue ?? null;
        cells.push({
          RowOffset: r - bounds.minR,
          ColOffset: c - bounds.minC,
          Value: value,
          Formula: cell?.Formula ?? undefined,
          Format: cell?.Style?.FormatType,
          Bold: cell?.Style?.Bold,
          Italic: cell?.Style?.Italic,
          HorizontalAlign: cell?.Style?.HorizontalAlign,
          TextColor: cell?.Style?.TextColor,
          BackgroundColor: cell?.Style?.BackgroundColor,
        });
      }
    }
    const startA1 = FormatCellAddress(bounds.minR, bounds.minC);
    const endA1 = FormatCellAddress(bounds.maxR, bounds.maxC);
    this.SheetsClipboardBuffer = {
      Mode: mode,
      SourceSheetID: sheet.SheetID,
      SourceRangeA1: startA1 === endA1 ? startA1 : `${startA1}:${endA1}`,
      RowCount: bounds.maxR - bounds.minR + 1,
      ColCount: bounds.maxC - bounds.minC + 1,
      Cells: cells,
    };
    this.cdr.markForCheck();
  }

  private cutSelectedRangeToClipboard(): void {
    if (!this.CanEdit) return;
    const primaryRange = this.SelectedRanges[0] ?? this.SelectedRange ?? this.ActiveCellAddress;
    const bounds = this.parseRangeBounds(primaryRange) ?? {
      minR: this.ActiveRowIndex,
      maxR: this.ActiveRowIndex,
      minC: this.ActiveColumnIndex,
      maxC: this.ActiveColumnIndex,
    };
    const protectedReason = this.findProtectedReasonInRange(
      this.ActiveSheet,
      bounds.minR,
      bounds.maxR,
      bounds.minC,
      bounds.maxC,
    );
    if (protectedReason) {
      this.StatusBannerMessage = protectedReason;
      this.cdr.markForCheck();
      return;
    }
    this.captureSelectionIntoClipboardBuffer('cut');
    const { tsv } = this.buildSelectedRangeClipboardPayloads();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tsv).catch(() => undefined);
    }
  }

  private copySpecialSelectionToClipboard(
    kind: 'values' | 'formula' | 'csv' | 'markdown' | 'live-block',
  ): void {
    const sheet = this.ActiveSheet;
    if (!sheet) return;
    const primaryRange = this.SelectedRanges[0] ?? this.SelectedRange ?? this.ActiveCellAddress;
    const bounds = this.parseRangeBounds(primaryRange) ?? {
      minR: this.ActiveRowIndex,
      maxR: this.ActiveRowIndex,
      minC: this.ActiveColumnIndex,
      maxC: this.ActiveColumnIndex,
    };

    let text = '';
    if (kind === 'formula') {
      text = this.ActiveCellSpec?.Formula ?? String(this.ActiveCellSpec?.RawValue ?? '');
    } else if (kind === 'values') {
      const rows: string[] = [];
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
        const cols: string[] = [];
        for (let c = bounds.minC; c <= bounds.maxC; c++) {
          const cell = sheet.Cells[FormatCellAddress(r, c)];
          const raw = cell?.ComputedValue ?? cell?.RawValue ?? '';
          cols.push(raw === null || raw === undefined ? '' : String(raw));
        }
        rows.push(cols.join('\t'));
      }
      text = rows.join('\n');
    } else if (kind === 'csv') {
      const rows: string[] = [];
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
        const cols: string[] = [];
        for (let c = bounds.minC; c <= bounds.maxC; c++) {
          const cell = sheet.Cells[FormatCellAddress(r, c)];
          const val = String(cell?.DisplayValue ?? cell?.ComputedValue ?? cell?.RawValue ?? '');
          const escaped = val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
          cols.push(escaped);
        }
        rows.push(cols.join(','));
      }
      text = rows.join('\n');
    } else if (kind === 'markdown') {
      const mdRows: string[] = [];
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
        const cols: string[] = [];
        for (let c = bounds.minC; c <= bounds.maxC; c++) {
          const cell = sheet.Cells[FormatCellAddress(r, c)];
          const val = String(cell?.DisplayValue ?? cell?.ComputedValue ?? cell?.RawValue ?? '').replace(/\|/g, '\\|');
          cols.push(val);
        }
        mdRows.push(`| ${cols.join(' | ')} |`);
        if (r === bounds.minR) {
          mdRows.push(`| ${cols.map(() => '---').join(' | ')} |`);
        }
      }
      text = mdRows.join('\n');
    } else if (kind === 'live-block') {
      const matchingTable = sheet.LiveTables?.find((t) => {
        const tableBounds = this.parseRangeBounds(this.computeLiveTableRangeA1(t));
        if (!tableBounds) return false;
        return !(bounds.maxR < tableBounds.minR || bounds.minR > tableBounds.maxR || bounds.maxC < tableBounds.minC || bounds.minC > tableBounds.maxC);
      });
      if (matchingTable) {
        text = JSON.stringify(this.liveTableToBlockSpec(matchingTable, matchingTable.Mode), null, 2);
      } else if (sheet.Charts && sheet.Charts.length > 0) {
        this.CopySlideBlockDescriptorForChart(sheet.Charts[0]);
        return;
      }
    }

    if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
    this.StatusBannerMessage = `Copied selection as ${kind}.`;
    this.cdr.markForCheck();
  }

  private async applyClipboardPaste(kind: 'all' | 'values' | 'formatting'): Promise<void> {
    if (!this.CanEdit) return;
    const buf = this.SheetsClipboardBuffer;
    if (!buf || buf.Cells.length === 0) {
      if (kind === 'all' && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          const tsv = await navigator.clipboard.readText();
          if (tsv) {
            this.ApplyTsvPasteAtActiveCell(tsv);
          }
        } catch {
          // Clipboard read permission denied in browser/headless context
        }
      }
      return;
    }

    const sheet = this.ActiveSheet;
    const editContext = this.buildCellEditContext();
    const srcBounds = this.parseRangeBounds(buf.SourceRangeA1);
    const rowDelta = srcBounds ? this.ActiveRowIndex - srcBounds.minR : 0;
    const colDelta = srcBounds ? this.ActiveColumnIndex - srcBounds.minC : 0;
    const updatedCells: SpreadsheetCellSpec[] = [];

    try {
      for (const entry of buf.Cells) {
        const targetRow = this.ActiveRowIndex + entry.RowOffset;
        const targetCol = this.ActiveColumnIndex + entry.ColOffset;
        const addr = FormatCellAddress(targetRow, targetCol);
        const existing = sheet.Cells[addr];

        if (kind === 'values') {
          const updated = SpreadsheetEngine.Instance.SetCell(
            this.Workbook,
            sheet.SheetID,
            addr,
            {
              Value: entry.Value,
              Formula: null,
              Style: existing?.Style,
            },
            true,
            editContext,
          );
          if (updated) updatedCells.push(updated);
        } else if (kind === 'formatting') {
          const nextStyle: SpreadsheetCellStyleSpec = {
            ...existing?.Style,
            FormatType: entry.Format ?? existing?.Style?.FormatType,
            NumberFormatPattern: entry.Format
              ? SpreadsheetEngine.Instance.DefaultPatternForFormatType(entry.Format)
              : existing?.Style?.NumberFormatPattern,
            Bold: entry.Bold ?? false,
            Italic: entry.Italic ?? false,
            HorizontalAlign: entry.HorizontalAlign,
            TextColor: entry.TextColor,
            BackgroundColor: entry.BackgroundColor,
          };
          const updated = SpreadsheetEngine.Instance.SetCell(
            this.Workbook,
            sheet.SheetID,
            addr,
            {
              Value: existing?.RawValue ?? null,
              Formula: existing?.Formula ?? null,
              Style: nextStyle,
            },
            true,
            editContext,
          );
          if (updated) updatedCells.push(updated);
        } else {
          const shiftedFormula = entry.Formula
            ? this.shiftFormulaRelativeReferences(entry.Formula, rowDelta, colDelta)
            : null;
          const nextStyle: SpreadsheetCellStyleSpec | undefined =
            entry.Format || entry.Bold || entry.Italic || entry.HorizontalAlign || entry.TextColor || entry.BackgroundColor
              ? {
                  FormatType: entry.Format,
                  NumberFormatPattern: entry.Format
                    ? SpreadsheetEngine.Instance.DefaultPatternForFormatType(entry.Format)
                    : undefined,
                  Bold: entry.Bold,
                  Italic: entry.Italic,
                  HorizontalAlign: entry.HorizontalAlign,
                  TextColor: entry.TextColor,
                  BackgroundColor: entry.BackgroundColor,
                }
              : undefined;
          const updated = SpreadsheetEngine.Instance.SetCell(
            this.Workbook,
            sheet.SheetID,
            addr,
            {
              Value: shiftedFormula ? null : entry.Value,
              Formula: shiftedFormula,
              Style: nextStyle,
            },
            true,
            editContext,
          );
          if (updated) updatedCells.push(updated);
        }
      }

      if (buf.Mode === 'cut' && kind === 'all') {
        const destStart = FormatCellAddress(this.ActiveRowIndex, this.ActiveColumnIndex);
        if (buf.SourceSheetID !== sheet.SheetID || destStart !== buf.SourceRangeA1.split(':')[0]) {
          SpreadsheetEngine.Instance.ClearRange(
            this.Workbook,
            buf.SourceSheetID,
            buf.SourceRangeA1,
            true,
            editContext,
          );
        }
        this.SheetsClipboardBuffer = null;
      }
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Paste blocked by a protected cell range.';
      this.cdr.markForCheck();
      return;
    }

    if (updatedCells.length > 0) {
      this.CollaborationSession?.BatchUpdateSpreadsheetCells(
        sheet.SheetID,
        updatedCells,
        [],
        this.Workbook,
      );
      const endAddr = FormatCellAddress(
        this.ActiveRowIndex + buf.RowCount - 1,
        this.ActiveColumnIndex + buf.ColCount - 1,
      );
      const startAddr = FormatCellAddress(this.ActiveRowIndex, this.ActiveColumnIndex);
      const nextRange = startAddr === endAddr ? startAddr : `${startAddr}:${endAddr}`;
      this.SelectedRanges = [nextRange];
      this.SelectedRange = nextRange;
      this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
      this.syncFormulaBarFromActiveCell();
      this.cdr.markForCheck();
    }
  }

  private shiftFormulaRelativeReferences(formula: string, rowDelta: number, colDelta: number): string {
    if (rowDelta === 0 && colDelta === 0) return formula;
    return formula.replace(/(\$?)([A-Z]+)(\$?)([0-9]+)/g, (_full, absCol: string, colStr: string, absRow: string, rowStr: string) => {
      const parsed = ParseCellAddress(`${colStr}${rowStr}`);
      if (!parsed) return _full;
      const nextCol = absCol ? parsed.col : Math.max(1, parsed.col + colDelta);
      const nextRow = absRow ? parsed.row : Math.max(1, parsed.row + rowDelta);
      return `${absCol}${ColumnIndexToLetter(nextCol)}${absRow}${nextRow}`;
    });
  }

  private insertRowsAt(position: 'above' | 'below', count: number, atRowIndex: number): void {
    if (!this.CanEdit) return;
    const insertAt = position === 'below' ? atRowIndex + 1 : atRowIndex;
    SpreadsheetEngine.Instance.InsertRows(this.Workbook, this.ActiveSheet.SheetID, insertAt, count);
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private deleteRowsAt(startRowIndex: number, count: number): void {
    if (!this.CanEdit) return;
    SpreadsheetEngine.Instance.DeleteRows(this.Workbook, this.ActiveSheet.SheetID, startRowIndex, count);
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private insertColsAt(position: 'left' | 'right', count: number, atColIndex: number): void {
    if (!this.CanEdit) return;
    const insertAt = position === 'right' ? atColIndex + 1 : atColIndex;
    SpreadsheetEngine.Instance.InsertColumns(this.Workbook, this.ActiveSheet.SheetID, insertAt, count);
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private deleteColsAt(startColIndex: number, count: number): void {
    if (!this.CanEdit) return;
    SpreadsheetEngine.Instance.DeleteColumns(this.Workbook, this.ActiveSheet.SheetID, startColIndex, count);
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private clearRangeByKind(kind: 'contents' | 'formatting' | 'all', rangeA1: string): void {
    if (!this.CanEdit) return;
    const sheet = this.ActiveSheet;
    const segments = rangeA1.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const editContext = this.buildCellEditContext();
    const updatedCells: SpreadsheetCellSpec[] = [];

    try {
      for (const seg of segments) {
        if (kind === 'all') {
          SpreadsheetEngine.Instance.ClearRange(this.Workbook, sheet.SheetID, seg, true, editContext);
        } else {
          const bounds = this.parseRangeBounds(seg);
          if (!bounds) continue;
          for (let r = bounds.minR; r <= bounds.maxR; r++) {
            for (let c = bounds.minC; c <= bounds.maxC; c++) {
              const addr = FormatCellAddress(r, c);
              const existing = sheet.Cells[addr];
              if (!existing) continue;
              const updated = SpreadsheetEngine.Instance.SetCell(
                this.Workbook,
                sheet.SheetID,
                addr,
                kind === 'contents'
                  ? { Value: null, Formula: null, Style: existing.Style }
                  : { Value: existing.RawValue, Formula: existing.Formula ?? null, Style: undefined },
                true,
                editContext,
              );
              if (updated) updatedCells.push(updated);
            }
          }
        }
      }
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Selected range contains protected cells.';
      this.cdr.markForCheck();
      return;
    }

    if (updatedCells.length > 0) {
      this.CollaborationSession?.BatchUpdateSpreadsheetCells(sheet.SheetID, updatedCells, [], this.Workbook);
    } else {
      this.CollaborationSession?.UpdateWorksheetStructure(sheet, this.Workbook);
    }
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.syncFormulaBarFromActiveCell();
    this.cdr.markForCheck();
  }

  private toggleBoldForRange(rangeA1: string): void {
    const activeCell = this.ActiveCellSpec;
    this.applyRangeStyle(rangeA1, { Bold: !activeCell?.Style?.Bold });
  }

  private toggleItalicForRange(rangeA1: string): void {
    const activeCell = this.ActiveCellSpec;
    this.applyRangeStyle(rangeA1, { Italic: !activeCell?.Style?.Italic });
  }

  private applyRangeStyle(rangeA1: string, stylePatch: Partial<SpreadsheetCellStyleSpec>): void {
    if (!this.CanEdit) return;
    const sheet = this.ActiveSheet;
    const segments = rangeA1.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const editContext = this.buildCellEditContext();
    const updatedCells: SpreadsheetCellSpec[] = [];

    try {
      for (const seg of segments) {
        const bounds = this.parseRangeBounds(seg) ?? {
          minR: this.ActiveRowIndex,
          maxR: this.ActiveRowIndex,
          minC: this.ActiveColumnIndex,
          maxC: this.ActiveColumnIndex,
        };
        for (let r = bounds.minR; r <= bounds.maxR; r++) {
          for (let c = bounds.minC; c <= bounds.maxC; c++) {
            const addr = FormatCellAddress(r, c);
            const existing = sheet.Cells[addr];
            const nextStyle: SpreadsheetCellStyleSpec = {
              ...existing?.Style,
              ...stylePatch,
            };
            if ('TextColor' in stylePatch && stylePatch.TextColor === undefined) {
              delete nextStyle.TextColor;
            }
            if ('BackgroundColor' in stylePatch && stylePatch.BackgroundColor === undefined) {
              delete nextStyle.BackgroundColor;
            }
            const updated = SpreadsheetEngine.Instance.SetCell(
              this.Workbook,
              sheet.SheetID,
              addr,
              {
                Value: existing?.RawValue ?? null,
                Formula: existing?.Formula ?? null,
                Style: nextStyle,
              },
              false,
              editContext,
            );
            if (updated) updatedCells.push(updated);
          }
        }
      }
      SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
    } catch (err) {
      this.StatusBannerMessage =
        err instanceof Error ? err.message : 'Formatting blocked by a protected cell range.';
      this.cdr.markForCheck();
      return;
    }

    if (updatedCells.length > 0) {
      this.CollaborationSession?.BatchUpdateSpreadsheetCells(sheet.SheetID, updatedCells, [], this.Workbook);
    }
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private promptAndSetRowHeight(startRow: number, endRow: number): void {
    if (!this.CanEdit) return;
    const current = this.ActiveSheet.Rows.find((r) => r.Index === startRow)?.Height ?? 28;
    const input = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt(`Row height in pixels (16–240):`, String(current))
      : null;
    if (!input) return;
    const parsed = Number(input.trim());
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(16, Math.min(240, Math.round(parsed)));
    for (const row of this.ActiveSheet.Rows) {
      if (row.Index >= startRow && row.Index <= endRow) {
        row.Height = clamped;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private autoFitRowHeights(startRow: number, endRow: number): void {
    if (!this.CanEdit) return;
    for (const row of this.ActiveSheet.Rows) {
      if (row.Index >= startRow && row.Index <= endRow) {
        let maxLines = 1;
        for (const col of this.ActiveSheet.Columns) {
          const cell = this.ActiveSheet.Cells[`${col.Letter}${row.Index}`];
          const text = String(cell?.DisplayValue ?? cell?.ComputedValue ?? cell?.RawValue ?? '');
          const lineCount = text.split('\n').length;
          if (lineCount > maxLines) maxLines = lineCount;
        }
        row.Height = Math.max(28, Math.min(240, maxLines * 20 + 8));
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private hideRowsRange(startRow: number, endRow: number): void {
    if (!this.CanEdit) return;
    for (const row of this.ActiveSheet.Rows) {
      if (row.Index >= startRow && row.Index <= endRow) {
        row.Hidden = true;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private unhideAdjacentRows(startRow: number, endRow: number): void {
    if (!this.CanEdit) return;
    for (const row of this.ActiveSheet.Rows) {
      if (row.Index >= Math.max(1, startRow - 1) && row.Index <= endRow + 1) {
        row.Hidden = false;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private promptAndSetColWidth(startCol: number, endCol: number): void {
    if (!this.CanEdit) return;
    const current = this.ActiveSheet.Columns.find((c) => c.Index === startCol)?.Width ?? 14;
    const input = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt(`Column width in characters (5–60):`, String(current))
      : null;
    if (!input) return;
    const parsed = Number(input.trim());
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(5, Math.min(60, Math.round(parsed)));
    for (const col of this.ActiveSheet.Columns) {
      if (col.Index >= startCol && col.Index <= endCol) {
        col.Width = clamped;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private autoFitColWidths(startCol: number, endCol: number): void {
    if (!this.CanEdit) return;
    for (const col of this.ActiveSheet.Columns) {
      if (col.Index >= startCol && col.Index <= endCol) {
        let maxLen = Math.max(8, (col.Header ?? col.Letter).length + 2);
        for (const row of this.ActiveSheet.Rows) {
          const cell = this.ActiveSheet.Cells[`${col.Letter}${row.Index}`];
          const text = String(cell?.DisplayValue ?? cell?.ComputedValue ?? cell?.RawValue ?? '');
          if (text.length + 2 > maxLen) {
            maxLen = text.length + 2;
          }
        }
        col.Width = Math.max(8, Math.min(48, maxLen));
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private hideColsRange(startCol: number, endCol: number): void {
    if (!this.CanEdit) return;
    for (const col of this.ActiveSheet.Columns) {
      if (col.Index >= startCol && col.Index <= endCol) {
        col.Hidden = true;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private unhideAdjacentCols(startCol: number, endCol: number): void {
    if (!this.CanEdit) return;
    for (const col of this.ActiveSheet.Columns) {
      if (col.Index >= Math.max(1, startCol - 1) && col.Index <= endCol + 1) {
        col.Hidden = false;
      }
    }
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private duplicateWorksheetTab(sheetId: string): void {
    if (!this.CanEdit) return;
    const source = this.Workbook.Worksheets.find((w) => w.SheetID === sheetId);
    if (!source) return;
    let candidateName = `${source.Name} (Copy)`;
    let suffix = 2;
    while (this.Workbook.Worksheets.some((w) => w.Name.toLowerCase() === candidateName.toLowerCase())) {
      candidateName = `${source.Name} (Copy ${suffix++})`;
    }
    const created = SpreadsheetEngine.Instance.AddWorksheet(
      this.Workbook,
      candidateName,
      source.Rows.length,
      source.Columns.length,
    );
    created.FrozenRows = source.FrozenRows;
    created.FrozenColumns = source.FrozenColumns;
    created.Cells = JSON.parse(JSON.stringify(source.Cells)) as Record<string, SpreadsheetCellSpec>;
    this.Workbook.ActiveSheetID = created.SheetID;
    SpreadsheetEngine.Instance.EvaluateWorkbook(this.Workbook);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private moveWorksheetTab(sheetId: string, direction: 'left' | 'right'): void {
    if (!this.CanEdit) return;
    const idx = this.Workbook.Worksheets.findIndex((w) => w.SheetID === sheetId);
    if (idx < 0) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.Workbook.Worksheets.length) return;
    const next = [...this.Workbook.Worksheets];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    this.Workbook.Worksheets = next;
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private unhideAllInSheet(sheetId: string): void {
    if (!this.CanEdit) return;
    const ws = this.Workbook.Worksheets.find((w) => w.SheetID === sheetId);
    if (!ws) return;
    for (const r of ws.Rows) r.Hidden = false;
    for (const c of ws.Columns) c.Hidden = false;
    this.CollaborationSession?.UpdateWorksheetStructure(ws, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private exportSheetCsv(sheetId: string, mode: 'copy' | 'download'): void {
    const csv = SpreadsheetEngine.Instance.ExportToCsv(this.Workbook, sheetId);
    if (mode === 'copy') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(csv).catch(() => undefined);
      }
      this.StatusBannerMessage = 'Copied worksheet CSV to clipboard.';
      this.cdr.markForCheck();
      return;
    }
    const ws = this.Workbook.Worksheets.find((w) => w.SheetID === sheetId);
    const bytes = new TextEncoder().encode(csv);
    this.downloadBinaryBytes(
      bytes,
      `${(ws?.Name || 'sheet').replace(/[^A-Za-z0-9_-]/g, () => '_')}.csv`,
      'text/csv;charset=utf-8',
    );
    this.StatusBannerMessage = `Exported "${ws?.Name || 'sheet'}.csv"`;
    this.cdr.markForCheck();
  }

  private deleteWorksheetById(sheetId: string): void {
    if (!this.CanEdit || this.Workbook.Worksheets.length <= 1) return;
    this.Workbook.Worksheets = this.Workbook.Worksheets.filter((w) => w.SheetID !== sheetId);
    if (this.Workbook.ActiveSheetID === sheetId) {
      this.Workbook.ActiveSheetID = this.Workbook.Worksheets[0].SheetID;
    }
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private resetChartSize(chartId: string): void {
    if (!this.CanEdit) return;
    const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === chartId);
    if (!chart) return;
    chart.WidthPx = 400;
    chart.HeightPx = 240;
    this.commitChartStructureChange();
  }

  private bringChartToFront(chartId: string): void {
    if (!this.CanEdit || !this.ActiveSheet.Charts) return;
    const idx = this.ActiveSheet.Charts.findIndex((c) => c.ChartID === chartId);
    if (idx < 0 || idx === this.ActiveSheet.Charts.length - 1) return;
    const [chart] = this.ActiveSheet.Charts.splice(idx, 1);
    this.ActiveSheet.Charts.push(chart);
    this.commitChartStructureChange();
  }

  private selectChartSourceRange(chartId: string): void {
    const chart = this.ActiveSheet.Charts?.find((c) => c.ChartID === chartId);
    if (!chart?.SourceRange) return;
    this.selectRangeString(chart.SourceRange);
  }

  private duplicateChart(chartId: string): void {
    if (!this.CanEdit || !this.ActiveSheet.Charts) return;
    const source = this.ActiveSheet.Charts.find((c) => c.ChartID === chartId);
    if (!source) return;
    const existingIds = new Set(this.ActiveSheet.Charts.map((c) => c.ChartID));
    let nextNum = this.ActiveSheet.Charts.length + 1;
    while (existingIds.has(`chart-${nextNum}`)) nextNum++;
    const copy: SpreadsheetChartSpec = {
      ...source,
      ChartID: `chart-${nextNum}`,
      Title: `${source.Title} (Copy)`,
      OffsetX: typeof source.OffsetX === 'number' ? source.OffsetX + 24 : undefined,
      OffsetY: typeof source.OffsetY === 'number' ? source.OffsetY + 24 : undefined,
    };
    this.ActiveSheet.Charts.push(copy);
    this.commitChartStructureChange();
  }

  private deleteChart(chartId: string): void {
    if (!this.CanEdit || !this.ActiveSheet.Charts) return;
    this.ActiveSheet.Charts = this.ActiveSheet.Charts.filter((c) => c.ChartID !== chartId);
    delete this.SelectedChartSeriesByChartID[chartId];
    this.commitChartStructureChange();
  }

  private selectLiveTableRange(tableId: string): void {
    const table = this.ActiveSheet.LiveTables?.find((t) => t.TableID === tableId);
    if (!table) return;
    this.selectRangeString(this.computeLiveTableRangeA1(table));
  }

  private toggleLiveTableMode(tableId: string): void {
    if (!this.CanEdit) return;
    const table = this.ActiveSheet.LiveTables?.find((t) => t.TableID === tableId);
    if (!table) return;
    if (table.Mode === 'Frozen') {
      void this.UnfreezeLiveTable(table);
    } else {
      this.PromptFreezeLiveTable(table);
    }
  }

  private openLiveTableConfiguration(tableId: string): void {
    if (!this.CanEdit) return;
    const table = this.ActiveSheet.LiveTables?.find((t) => t.TableID === tableId);
    if (!table) return;
    this.NewLiveTableTitle = table.Title;
    this.NewLiveTableSourceType = table.SourceType;
    this.NewLiveTableEntityName = table.EntityName ?? 'AI Agents';
    this.NewLiveTableExtraFilter = table.ExtraFilter ?? '';
    this.NewLiveTableQueryName = table.QueryName ?? 'Renewals by Month';
    this.NewLiveTableAnchorCell = table.AnchorCell || 'A1';
    this.ShowAddLiveTableModal = true;
    this.cdr.markForCheck();
  }

  private copyLiveTableBlockDescriptor(tableId: string): void {
    const table = this.ActiveSheet.LiveTables?.find((t) => t.TableID === tableId);
    if (!table) return;
    const json = JSON.stringify(this.liveTableToBlockSpec(table, table.Mode), null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(json).catch(() => undefined);
    }
    this.StatusBannerMessage = `Copied Live Table block JSON (${table.Title}).`;
    this.cdr.markForCheck();
  }

  private deleteLiveTable(tableId: string): void {
    if (!this.CanEdit || !this.ActiveSheet.LiveTables) return;
    this.ActiveSheet.LiveTables = this.ActiveSheet.LiveTables.filter((t) => t.TableID !== tableId);
    this.CollaborationSession?.UpdateWorkbookMetadata(this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private openEmbeddedArtifact(embedId: string): void {
    const emb = this.ActiveSheet.EmbeddedArtifacts?.find((e) => e.EmbedID === embedId);
    if (!emb?.ArtifactID) return;
    const key = new CompositeKey([{ FieldName: 'ID', Value: emb.ArtifactID }]);
    this.OpenEntityRecord.emit({ entityName: 'MJ: Artifacts', compositeKey: key });
  }

  private selectEmbeddedAnchor(embedId: string): void {
    const emb = this.ActiveSheet.EmbeddedArtifacts?.find((e) => e.EmbedID === embedId);
    if (!emb) return;
    this.selectRangeString(emb.AnchorCell || 'A1');
  }

  private deleteEmbeddedArtifact(embedId: string): void {
    if (!this.CanEdit || !this.ActiveSheet.EmbeddedArtifacts) return;
    this.ActiveSheet.EmbeddedArtifacts = this.ActiveSheet.EmbeddedArtifacts.filter(
      (e) => e.EmbedID !== embedId,
    );
    this.CollaborationSession?.UpdateWorksheetStructure(this.ActiveSheet, this.Workbook);
    this.SourceJsonText = SpreadsheetEngine.Instance.SerializeWorkbook(this.Workbook);
    this.cdr.markForCheck();
  }

  private openCommentsForRange(rangeA1: string, focusComposer = false): void {
    this.selectRangeString(rangeA1);
    this.ShowCommentsDrawer = true;
    this.cdr.markForCheck();
    if (focusComposer && typeof document !== 'undefined') {
      setTimeout(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-testid="sheet-comment-input"]');
        input?.focus();
      }, 0);
    }
  }

  private inspectFormulaCell(addressA1: string): void {
    const parsed = ParseCellAddress(addressA1);
    if (parsed) {
      this.ActiveRowIndex = parsed.row;
      this.ActiveColumnIndex = parsed.col;
      this.syncFormulaBarFromActiveCell();
    }
    const cell = this.ActiveSheet.Cells[addressA1];
    this.StatusBannerMessage = cell?.Formula
      ? `${addressA1}: ${cell.Formula}`
      : `${addressA1}: No formula`;
    this.cdr.markForCheck();
  }

  private selectRangeString(rangeA1: string): void {
    const parts = rangeA1.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === 0) return;
    this.SelectedRanges = parts;
    this.SelectedRange = parts.join(', ');
    const bounds = this.parseRangeBounds(parts[0]);
    if (bounds) {
      this.ActiveRowIndex = bounds.minR;
      this.ActiveColumnIndex = bounds.minC;
      this.DragAnchorAddress = FormatCellAddress(bounds.minR, bounds.minC);
    }
    this.syncFormulaBarFromActiveCell();
    this.broadcastSelectionPresence();
    this.cdr.markForCheck();
  }

  private findProtectedReasonInRange(
    sheet: WorksheetSpec,
    minR: number,
    maxR: number,
    minC: number,
    maxC: number,
  ): string | null {
    const editContext = this.buildCellEditContext();
    const rowEnd = Math.min(maxR, minR + 50);
    const colEnd = Math.min(maxC, minC + 26);
    for (let r = minR; r <= rowEnd; r++) {
      for (let c = minC; c <= colEnd; c++) {
        const addr = FormatCellAddress(r, c);
        const perm = SpreadsheetEngine.Instance.CheckCellWritePermission(sheet, addr, editContext);
        if (!perm.Allowed) {
          return perm.Reason || perm.ProtectedRange?.Description || `Range ${addr} is protected`;
        }
      }
    }
    return null;
  }

  private countThreadsIntersectingRange(
    sheetId: string,
    minR: number,
    maxR: number,
    minC: number,
    maxC: number,
  ): number {
    let count = 0;
    for (const thread of this.AnchoredThreads) {
      if (thread.Status === 'Resolved') continue;
      const parts = (thread.AnchorKey || '').split(':');
      const threadSheet = parts.length > 1 ? parts[0] : sheetId;
      if (threadSheet !== sheetId) continue;
      const rangePart = parts.length > 1 ? parts.slice(1).join(':') : thread.AnchorKey;
      const bounds = this.parseRangeBounds(rangePart);
      if (!bounds) continue;
      const overlaps = !(
        bounds.maxR < minR ||
        bounds.minR > maxR ||
        bounds.maxC < minC ||
        bounds.minC > maxC
      );
      if (overlaps) count++;
    }
    return count;
  }

  private doesBoundsIntersectLiveOrChart(
    sheet: WorksheetSpec,
    minR: number,
    maxR: number,
    minC: number,
    maxC: number,
  ): boolean {
    for (const table of sheet.LiveTables ?? []) {
      const tb = this.parseRangeBounds(this.computeLiveTableRangeA1(table));
      if (tb && !(tb.maxR < minR || tb.minR > maxR || tb.maxC < minC || tb.minC > maxC)) {
        return true;
      }
    }
    for (const chart of sheet.Charts ?? []) {
      const cb = this.parseRangeBounds(chart.SourceRange);
      if (cb && !(cb.maxR < minR || cb.minR > maxR || cb.maxC < minC || cb.minC > maxC)) {
        return true;
      }
    }
    return false;
  }

  private computeLiveTableRangeA1(table: SpreadsheetLiveTableSpec): string {
    const anchor = ParseCellAddress(table.AnchorCell || 'A1') ?? { row: 1, col: 1 };
    const execResult = this.lastTableResults[table.TableID];
    const rowCount = Math.max(
      1,
      (execResult?.Rows?.length ?? table.LastRowCount ?? 1) + (table.IncludeHeaders !== false ? 1 : 0),
    );
    const colCount = Math.max(
      1,
      (execResult?.Columns?.length ?? table.Fields?.length ?? 1) + (table.CalculatedColumns?.length ?? 0),
    );
    const startA1 = FormatCellAddress(anchor.row, anchor.col);
    const endA1 = FormatCellAddress(anchor.row + rowCount - 1, anchor.col + colCount - 1);
    return startA1 === endA1 ? startA1 : `${startA1}:${endA1}`;
  }

  private getSelectedRowSpan(fallbackRow: number): { startRow: number; endRow: number } {
    let minR = Number.MAX_SAFE_INTEGER;
    let maxR = 0;
    for (const seg of this.SelectedRanges) {
      const b = this.parseRangeBounds(seg);
      if (b) {
        minR = Math.min(minR, b.minR);
        maxR = Math.max(maxR, b.maxR);
      }
    }
    if (minR <= maxR) return { startRow: minR, endRow: maxR };
    return { startRow: fallbackRow, endRow: fallbackRow };
  }

  private getSelectedColSpan(fallbackCol: number): { startCol: number; endCol: number } {
    let minC = Number.MAX_SAFE_INTEGER;
    let maxC = 0;
    for (const seg of this.SelectedRanges) {
      const b = this.parseRangeBounds(seg);
      if (b) {
        minC = Math.min(minC, b.minC);
        maxC = Math.max(maxC, b.maxC);
      }
    }
    if (minC <= maxC) return { startCol: minC, endCol: maxC };
    return { startCol: fallbackCol, endCol: fallbackCol };
  }
}
