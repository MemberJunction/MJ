import { Component, HostListener, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef, Renderer2, Type, inject } from '@angular/core';
import { CompositeKey, DataSnapshot, LogError, RunView, type EntityInfo, type IMetadataProvider, type QueryInfo } from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
  ArtifactMetadataEngine,
  BuildArtifactVersionConfigurationWithPreview,
  DocumentLiveBlockEngine,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SpreadsheetEngine,
  UserInfoEngine,
  type WorksheetSpec,
  type DocumentBlockColumn,
  type DocumentBlockSpec,
  type DocumentBlockExecutionResult,
  type DocumentBlockKind,
  type MJArtifactEntity,
  type MJArtifactPermissionEntity,
  type MJArtifactVersionEntity,
  type MJConversationEntity,
  type MJConversationDetailEntity,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { PdfOrientation } from '@memberjunction/ng-react';
import { Subscription } from 'rxjs';
import { BaseArtifactViewerPluginComponent, IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
import { DocsVersionDiffComponent } from '../version-diff/docs-version-diff.component';
import { EscapeHtml } from '../previews/office-preview.logic';
import { CreateMarkdownSnapshot } from '../../snapshot-helpers';
import {
  DocumentCollaborationService,
  DocumentCollaborationSession,
  ExtractAnchoredCommentMentions,
  MERGE_CONFLICT_WARNING_MESSAGE,
  type CollaborationConnectionStatus,
  type CollaborationMergeConflictEvent,
  type CollaboratorPresence,
  type DocumentAnchoredThread,
  type DocumentDiffResult,
  type DocumentOutlineItem,
  type DocumentRenderSegment,
  type DocumentSlashCommand,
  type DocumentSuggestionItem,
  type DocumentWordChangeHunk,
  type DocumentWordDiffResult,
} from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';
import { ComputeBoundedSequenceDiff } from '../../utils/line-diff';

export type DocsViewerMode = 'edit' | 'suggest' | 'preview' | 'source' | 'diff';
export type DocsEditingStyle = 'simple' | 'blocks';

/** User setting key storing the toolbar actions a user pinned across documents. */
export const DOCS_TOOLBAR_PINS_SETTING_KEY = 'MJ.Docs.Toolbar.PinnedActions';

/** User setting key storing toolbar visibility & layout preferences across documents. */
export const DOCS_TOOLBAR_VISIBILITY_SETTING_KEY = 'MJ.Docs.Toolbar.Visibility';

export type DocsToolbarItemKey =
  | 'outline'
  | 'format'
  | 'insert-block'
  | 'add-section'
  | 'suggest-mode'
  | 'blocks-mode'
  | 'comments'
  | 'share'
  | 'source-mode'
  | 'diff-mode'
  | 'export-docx'
  | 'export-md'
  | 'copy-md';

export const DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS: readonly DocsToolbarItemKey[] = [
  'outline',
  'format',
  'insert-block',
  'comments',
];

export interface DocsToolbarVisibilitySetting {
  Version: 1;
  ShowOutlineRail?: boolean;
  EditingStyle?: DocsEditingStyle;
  FormattingRibbonPinned?: boolean;
}

export interface ResolvedDocsToolbarItem {
  Key: DocsToolbarItemKey;
  Label: string;
  MenuLabel: string;
  Description: string;
  Icon: string;
  Placement: 'left' | 'right';
  Category: 'writing' | 'view' | 'collab' | 'io';
  Order: number;
  Visible: boolean;
  Active: boolean;
  Badge?: string | number;
  Accent?: boolean;
  HasChevron?: boolean;
  ChevronUp?: boolean;
  StatusTag?: string;
  TestId: string;
  MenuTestId: string;
}

export interface DocsEntityPickerOption {
  ID: string;
  Name: string;
  DisplayName: string;
  Icon: string;
  Subtitle: string;
  FieldCount: number;
}

export interface DocsSavedViewOption {
  ID: string;
  Name: string;
  Description: string;
}

export interface DocsQueryPickerOption {
  ID: string;
  Name: string;
  Category: string;
  Description: string;
}

export interface DocsArtifactPickerOption {
  ID: string;
  Name: string;
  Type: string;
}

export interface DocsPermissionEntry {
  ID: string;
  UserID: string;
  UserName: string;
  UserEmail: string;
  CanRead: boolean;
  CanEdit: boolean;
  CanShare: boolean;
  IsOwner: boolean;
}

export interface DocsSelectionSnapshot {
  segmentId: string;
  listItemIndex?: number;
  tableRowIndex?: number;
  tableColIndex?: number;
  isTableHeader?: boolean;
  start: number;
  end: number;
}

interface DocsInlineToken {
  kind: 'text' | 'code' | 'bold_italic' | 'bold' | 'italic';
  mdStart: number;
  mdEnd: number;
  visStart: number;
  visEnd: number;
  markerLen: number;
  content: string;
}

/**
 * Collaborative Rich Document Editor & Viewer plugin for `"Markdown Document"` artifacts (§ 4).
 *
 * Capabilities:
 * - Real-time Yjs collaboration (`DocumentCollaborationSession`) with active collaborator presence
 * - 5 workspace modes: `edit`, `suggest`, `preview`, `source`, and `diff` (version comparison)
 * - Left collapsible Table of Contents (TOC) & Embedded Block outline rail
 * - `/` Slash command palette for prose formatting, live MJ data blocks, and embedded OLE artifacts
 * - Live viewer-scoped MJ blocks (`EntityView`, `SavedQuery`, `DashboardPart`, `InteractiveComponent`)
 *   with explicit `Live` vs. `Frozen` mode and security warning confirmation modal (`O5`)
 * - Inline "MS OLE" `Artifact` blocks (including interactive `<mj-realtime-whiteboard-host>` via
 *   `WhiteboardArtifactViewerComponent` when `[readonly]="false"`, § 3.4.1 / D12)
 * - Right-margin anchored `DocBlock` comment threads (`MJ: Conversations` with `AnchorType='DocBlock'`)
 *   and `@mention` agent invocation in Suggest or Direct Edit mode
 * - Bidirectional `.md`, `.docx` (`mammoth` / `docx`), and `.pdf` import/export
 */
@Component({
  standalone: false,
  selector: 'mj-markdown-artifact-viewer',
  template: `
    <div class="mj-docs-workspace" [ngClass]="cssClass" data-testid="mj-docs-workspace">
      <!-- Tier 1: Calm Progressive Disclosure Collaboration & Mode Toolbar -->
      <div class="mj-docs-toolbar" data-testid="mj-docs-toolbar">
        <div class="mj-docs-toolbar__left">
          <div class="mj-docs-mode-group" role="tablist" aria-label="Document Mode">
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'preview'"
              title="Reader View"
              data-testid="mode-preview-btn"
              (click)="SetViewMode('preview')"
            >
              <i class="fas fa-eye"></i> Read
            </button>
            @if (CanUserEdit) {
              <button
                type="button"
                class="mj-docs-mode-btn"
                [class.mj-docs-mode-btn--active]="ViewMode === 'edit'"
                title="Write & Edit Document"
                data-testid="mode-edit-btn"
                (click)="SetViewMode('edit')"
              >
                <i class="fas fa-pen-to-square"></i> Write
              </button>
            }
          </div>

          @if (CanUserEdit) {
            <div class="mj-docs-undo-group" role="group" aria-label="Undo and Redo">
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--icon-only"
                [disabled]="!CanUndo"
                title="Undo (Cmd/Ctrl+Z)"
                data-testid="docs-undo-btn"
                (mousedown)="OnToolbarActionMousedown($event)"
                (click)="UndoDocument()"
              >
                <i class="fas fa-rotate-left"></i>
              </button>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--icon-only"
                [disabled]="!CanRedo"
                title="Redo (Cmd/Ctrl+Shift+Z)"
                data-testid="docs-redo-btn"
                (mousedown)="OnToolbarActionMousedown($event)"
                (click)="RedoDocument()"
              >
                <i class="fas fa-rotate-right"></i>
              </button>
            </div>
          }

          <!-- Active Non-Default Mode / Editing Style Chips (revealed only when active & not pinned) -->
          @if (CanUserEdit && (ViewMode === 'suggest' || PendingSuggestionsCount > 0) && !IsToolbarItemShownOnBar('suggest-mode')) {
            <button
              type="button"
              class="mj-docs-active-mode-chip"
              [class.mj-docs-active-mode-chip--active]="ViewMode === 'suggest'"
              [title]="ViewMode === 'suggest' ? 'Suggest Mode active — click to return to Write mode' : 'View pending suggestions'"
              data-testid="active-mode-chip-suggest"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="SetViewMode(ViewMode === 'suggest' ? 'edit' : 'suggest')"
            >
              <i class="fas fa-code-pull-request"></i>
              <span>Suggest</span>
              @if (PendingSuggestionsCount > 0) {
                <span class="mj-docs-badge mj-docs-badge--brand">{{ PendingSuggestionsCount }}</span>
              }
              @if (ViewMode === 'suggest') {
                <i class="fas fa-xmark mj-docs-active-mode-chip__close"></i>
              }
            </button>
          }

          @if (CanUserEdit && EditingStyle === 'blocks' && (ViewMode === 'edit' || ViewMode === 'suggest') && !IsToolbarItemShownOnBar('blocks-mode')) {
            <button
              type="button"
              class="mj-docs-active-mode-chip mj-docs-active-mode-chip--active"
              title="Block Studio active — click to return to Simple Note Mode"
              data-testid="active-style-chip-blocks"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="SetEditingStyle('simple')"
            >
              <i class="fas fa-cubes"></i>
              <span>Blocks</span>
              <i class="fas fa-xmark mj-docs-active-mode-chip__close"></i>
            </button>
          }

          @if ((ViewMode === 'source' && !IsToolbarItemShownOnBar('source-mode')) || (ViewMode === 'diff' && !IsToolbarItemShownOnBar('diff-mode'))) {
            <button
              type="button"
              class="mj-docs-active-mode-chip mj-docs-active-mode-chip--active"
              [title]="'Viewing ' + (ViewMode === 'source' ? 'Markdown Source' : 'Version History & Diff') + ' — click to close'"
              data-testid="active-mode-chip-view"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="SetViewMode(CanUserEdit ? 'edit' : 'preview')"
            >
              <i class="fas" [ngClass]="ViewMode === 'source' ? 'fa-code' : 'fa-code-compare'"></i>
              <span>{{ ViewMode === 'source' ? 'Source' : 'Diff' }}</span>
              <i class="fas fa-xmark mj-docs-active-mode-chip__close"></i>
            </button>
          }

          <!-- User-Pinned Left Toolbar Actions (via UserInfoEngine) -->
          @for (item of PinnedLeftToolbarItems; track item.Key) {
            <button
              type="button"
              class="mj-docs-btn"
              [class.mj-docs-btn--active]="item.Active"
              [class.mj-docs-btn--accent]="item.Accent"
              [attr.aria-pressed]="item.Active"
              [attr.aria-expanded]="item.HasChevron ? item.ChevronUp : null"
              [title]="item.Description"
              [attr.data-testid]="item.TestId"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="ExecuteToolbarItem(item, false, $event)"
            >
              <i class="fas" [ngClass]="item.Icon"></i>
              <span>{{ item.Label }}</span>
              @if (item.Badge != null) {
                <span class="mj-docs-badge mj-docs-badge--brand">{{ item.Badge }}</span>
              }
              @if (item.HasChevron) {
                <i class="fas" [ngClass]="item.ChevronUp ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              }
            </button>
          }
        </div>

        <div class="mj-docs-toolbar__right">
          <!-- Compact Collaboration Presence Pill -->
          <div
            class="mj-docs-presence-pill"
            [class.mj-docs-presence-pill--connected]="CollaborationStatus === 'connected'"
            [class.mj-docs-presence-pill--readonly]="
              CollaborationStatus === 'readonly' || CollaborationStatus === 'revoked'
            "
            [class.mj-docs-presence-pill--error]="CollaborationStatus === 'error'"
            [attr.data-status]="CollaborationStatus"
            [title]="GetCollaborationStatusLabel()"
            data-testid="collaboration-presence-pill"
          >
            <span class="mj-docs-presence-dot"></span>
            <span>{{ GetCompactCollaborationStatusLabel() }}</span>
            @if (CollaborationStatus === 'error') {
              <button
                type="button"
                class="mj-docs-collab-retry-btn"
                aria-label="Retry live collaboration sync"
                data-testid="docs-collab-retry-btn"
                (click)="RetryLiveCollaboration()"
              >
                Retry
              </button>
            }
            @if (Collaborators.length > 0) {
              <div class="mj-docs-avatar-stack">
                @for (peer of Collaborators; track peer.ClientID) {
                  <span class="mj-docs-avatar" [title]="peer.Name + (peer.CanEdit ? ' (Editing)' : ' (Viewing)')">
                    {{ GetInitials(peer.Name) }}
                  </span>
                }
              </div>
            }
          </div>

          <!-- Hidden File Input for .md / .docx Import -->
          <input
            #fileImportInput
            type="file"
            accept=".md,.markdown,.txt,.docx"
            style="display: none"
            (change)="OnImportFileSelected($event)"
          />

          <!-- User-Pinned Right Toolbar Actions (via UserInfoEngine; defaults to Comments) -->
          @for (item of PinnedRightToolbarItems; track item.Key) {
            <button
              type="button"
              class="mj-docs-btn"
              [class.mj-docs-btn--active]="item.Active"
              [class.mj-docs-btn--accent]="item.Accent"
              [attr.aria-pressed]="item.Active"
              [title]="item.Description"
              [attr.data-testid]="item.TestId"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="ExecuteToolbarItem(item, false, $event)"
            >
              <i class="fas" [ngClass]="item.Icon"></i>
              <span>{{ item.Label }}</span>
              @if (item.Badge != null) {
                <span class="mj-docs-badge" [class.mj-docs-badge--brand]="item.Active">{{ item.Badge }}</span>
              }
            </button>
          }

          @if (CanUserEdit) {
            <button
              type="button"
              class="mj-docs-btn"
              [class.mj-docs-btn--primary]="HasUnsavedChanges"
              [class.mj-docs-btn--saved-quiet]="!HasUnsavedChanges"
              [disabled]="IsSavingVersion || !HasUnsavedChanges"
              [title]="HasUnsavedChanges ? 'Save Document Version' : 'All changes saved'"
              data-testid="save-doc-version-btn"
              (click)="OnSaveDocumentVersion()"
            >
              <i class="fas" [ngClass]="HasUnsavedChanges ? 'fa-cloud-arrow-up' : 'fa-check'"></i>
              <span>{{ IsSavingVersion ? 'Saving…' : HasUnsavedChanges ? 'Save Version' : 'Saved' }}</span>
            </button>
          }

          <!-- Progressive Disclosure Tools & View Menu (...) with per-action Thumbtack Pinning -->
          <div class="mj-docs-more-menu-wrap" #moreMenuWrap>
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--icon"
              [class.mj-docs-btn--active]="ShowMoreToolsMenu || ViewMode === 'source' || ViewMode === 'diff'"
              [attr.aria-expanded]="ShowMoreToolsMenu"
              title="Customize toolbar pins, modes, share &amp; export"
              data-testid="toggle-more-tools-btn"
              (click)="ToggleMoreToolsMenu($event)"
            >
              <i class="fas fa-ellipsis"></i>
            </button>

            <div class="mj-docs-more-menu" [hidden]="!ShowMoreToolsMenu" data-testid="docs-more-tools-menu">
              <div class="mj-docs-more-menu__header">
                <span class="mj-docs-more-menu__title">Tools &amp; View</span>
                <span class="mj-docs-badge" data-testid="toolbar-pin-count-badge">
                  {{ PinnedToolbarItemsCount }}/{{ MaxPinnedToolbarActions }} pinned
                </span>
                @if (HasCustomToolbarSettings) {
                  <button
                    type="button"
                    class="mj-docs-menu-reset-btn"
                    title="Reset toolbar pins &amp; view preferences to defaults"
                    data-testid="reset-toolbar-pins-btn"
                    (mousedown)="OnToolbarActionMousedown($event)"
                    (click)="ResetToolbarCustomizations($event)"
                  >
                    Reset
                  </button>
                }
              </div>

              @for (cat of ToolbarMenuCategories; track cat.Key; let lastCat = $last) {
                @let catItems = GetMenuItemsForCategory(cat.Key);
                @if (catItems.length > 0 || (cat.Key === 'io' && CanUserEdit)) {
                  <div class="mj-docs-more-menu__section">{{ cat.Title }}</div>
                  @for (item of catItems; track item.Key) {
                    <div class="mj-docs-menu-row">
                      <button
                        type="button"
                        class="mj-docs-more-menu__item"
                        [class.mj-docs-more-menu__item--active]="item.Active"
                        [title]="item.Description"
                        [attr.data-testid]="IsToolbarItemShownOnBar(item.Key) ? item.MenuTestId : item.TestId"
                        (mousedown)="OnToolbarActionMousedown($event)"
                        (click)="ExecuteToolbarItem(item, true, $event)"
                      >
                        <i class="fas" [ngClass]="item.Icon"></i>
                        <span class="mj-docs-more-menu__item-label">{{ item.MenuLabel }}</span>
                        @if (item.StatusTag) {
                          <span class="mj-docs-badge">{{ item.StatusTag }}</span>
                        } @else if (item.Badge != null) {
                          <span class="mj-docs-badge mj-docs-badge--brand">{{ item.Badge }}</span>
                        }
                      </button>
                      <button
                        type="button"
                        class="mj-docs-menu-pin"
                        [class.pinned]="IsToolbarItemPinned(item.Key)"
                        [class.over-cap]="IsToolbarItemPinnedOverCap(item.Key)"
                        [attr.aria-disabled]="!IsToolbarItemPinned(item.Key) && !CanPinMoreToolbarItems ? 'true' : null"
                        [attr.aria-pressed]="IsToolbarItemPinned(item.Key)"
                        [attr.aria-label]="'Pin ' + item.MenuLabel"
                        [attr.data-testid]="'menu-pin-' + item.Key"
                        [title]="GetToolbarPinTooltip(item.Key)"
                        (mousedown)="OnToolbarActionMousedown($event)"
                        (click)="ToggleToolbarItemPin(item.Key, $event)"
                      >
                        <i class="fas fa-thumbtack"></i>
                      </button>
                    </div>
                  }
                  @if (cat.Key === 'io' && CanUserEdit) {
                    <div class="mj-docs-menu-row">
                      <button
                        type="button"
                        class="mj-docs-more-menu__item"
                        data-testid="import-doc-btn"
                        (mousedown)="OnToolbarActionMousedown($event)"
                        (click)="TriggerFileImport(); CloseMoreToolsMenu()"
                      >
                        <i class="fas fa-file-import"></i>
                        <span class="mj-docs-more-menu__item-label">Import .docx or .md…</span>
                      </button>
                    </div>
                  }
                  @if (!lastCat) {
                    <div class="mj-docs-more-menu__divider"></div>
                  }
                }
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Tier 2 (Progressive Disclosure): Collapsible Formatting Ribbon -->
      @if (CanUserEdit && (ViewMode === 'edit' || ViewMode === 'suggest' || ViewMode === 'source')) {
        <div
          class="mj-docs-format-ribbon"
          [hidden]="!ShowFormattingRibbon"
          aria-label="Formatting Tools"
          data-testid="docs-format-ribbon"
        >
          <button type="button" class="mj-docs-btn" title="Bold" data-testid="fmt-bold-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('**', '**')">
            <i class="fas fa-bold"></i>
          </button>
          <button type="button" class="mj-docs-btn" title="Italic" data-testid="fmt-italic-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('*', '*')">
            <i class="fas fa-italic"></i>
          </button>
          <span class="mj-docs-ribbon-sep"></span>
          <button type="button" class="mj-docs-btn" title="Heading 1" data-testid="fmt-h1-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('# ', '')">
            <strong>H1</strong>
          </button>
          <button type="button" class="mj-docs-btn" title="Heading 2" data-testid="fmt-h2-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('## ', '')">
            <strong>H2</strong>
          </button>
          <button type="button" class="mj-docs-btn" title="Heading 3" data-testid="fmt-h3-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('### ', '')">
            <strong>H3</strong>
          </button>
          <span class="mj-docs-ribbon-sep"></span>
          <button type="button" class="mj-docs-btn" title="Bullet List" data-testid="fmt-list-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('- ', '')">
            <i class="fas fa-list-ul"></i> List
          </button>
          <button type="button" class="mj-docs-btn" title="Task List" data-testid="fmt-checklist-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('- [ ] ', '')">
            <i class="fas fa-list-check"></i> Checklist
          </button>
          <button
            type="button"
            class="mj-docs-btn"
            title="Insert Table"
            data-testid="fmt-table-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="InsertFormattingSnippet('| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n', '')"
          >
            <i class="fas fa-table"></i> Table
          </button>
          <button
            type="button"
            class="mj-docs-btn"
            title="Callout Block"
            data-testid="fmt-callout-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="InsertFormattingSnippet('> [!NOTE]\n> ', '')"
          >
            <i class="fas fa-circle-info"></i> Callout
          </button>
          <span class="mj-docs-ribbon-hint">
            Tip: Type <kbd>/</kbd> anywhere to insert a live <strong>View</strong>, <strong>Query</strong>, or
            <strong>Whiteboard</strong>
          </span>
          <button
            type="button"
            class="mj-docs-btn mj-docs-pin-ribbon-btn"
            [class.mj-docs-btn--active]="FormattingRibbonPinned"
            [attr.aria-pressed]="FormattingRibbonPinned"
            title="Keep formatting ribbon open across all documents"
            data-testid="pin-format-ribbon-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="ToggleFormattingRibbonPinned()"
          >
            <i class="fas fa-thumbtack"></i>
            <span>{{ FormattingRibbonPinned ? 'Pinned' : 'Pin Ribbon' }}</span>
          </button>
        </div>
      }

      <!-- Slash Command Palette Popover -->
      @if (ShowSlashMenu) {
        <div class="mj-docs-slash-popover" data-testid="slash-command-menu">
          <div class="mj-docs-slash-popover__header">
            <i class="fas fa-terminal"></i>
            <input
              type="text"
              class="mj-docs-slash-input"
              placeholder="Filter commands (e.g., entity-view, saved-query, whiteboard, table)…"
              [(ngModel)]="SlashSearchQuery"
              (ngModelChange)="SlashMenuHighlightIndex = 0"
              (keydown)="OnSlashMenuKeydown($event)"
              data-testid="slash-search-input"
            />
            <button type="button" class="mj-docs-btn" (click)="CloseSlashMenu()">
              <i class="fas fa-xmark"></i>
            </button>
          </div>
          <div class="mj-docs-slash-popover__list">
            @for (cmd of FilteredSlashCommands; track cmd.Command; let cmdIdx = $index) {
              <button
                type="button"
                class="mj-docs-slash-item"
                [class.mj-docs-slash-item--active]="cmdIdx === SlashMenuHighlightIndex"
                [attr.data-testid]="'slash-item-' + cmd.Command.slice(1)"
                (mouseenter)="SlashMenuHighlightIndex = cmdIdx"
                (click)="ExecuteSlashCommand(cmd)"
              >
                <div class="mj-docs-slash-item__icon">
                  <i class="fas" [ngClass]="cmd.Icon"></i>
                </div>
                <div class="mj-docs-slash-item__body">
                  <div class="mj-docs-slash-item__title">
                    <span>{{ cmd.Label }}</span>
                    <code>{{ cmd.Command }}</code>
                  </div>
                  <div class="mj-docs-slash-item__desc">{{ cmd.Description }}</div>
                </div>
                <span class="mj-docs-slash-item__cat">{{ cmd.Category }}</span>
              </button>
            }
          </div>
        </div>
      }

      <!-- Collaboration & Permission Status Banners (E1 & Low Retry State) -->
      @if (LiveSyncUnavailable) {
        <div
          class="mj-docs-status-banner mj-docs-status-banner--readonly"
          role="status"
          data-testid="docs-live-sync-unavailable-banner"
        >
          <span>
            <i class="fas fa-plug-circle-xmark"></i>
            Live collaborative sync is unavailable on this server — viewing in read-only mode.
          </span>
        </div>
      }
      @if (PermissionVerifyError) {
        <div
          class="mj-docs-status-banner mj-docs-status-banner--warning"
          role="alert"
          data-testid="docs-permission-verify-error-banner"
        >
          <span>
            <i class="fas fa-triangle-exclamation"></i>
            Couldn't verify permissions — Retry
          </span>
          <button
            type="button"
            class="mj-docs-btn"
            data-testid="docs-permission-retry-btn"
            (click)="RetryVerifyPermissions()"
          >
            Retry
          </button>
        </div>
      }

      <!-- Status Banner when Notification is Active -->
      @if (StatusBannerMessage) {
        <div class="mj-docs-status-banner" data-testid="docs-status-banner">
          <i class="fas fa-circle-check"></i>
          <span>{{ StatusBannerMessage }}</span>
          <button type="button" class="mj-docs-btn" (click)="StatusBannerMessage = ''">Dismiss</button>
        </div>
      }

      <!-- 3-Column Body: Left Outline Rail + Center Canvas + Right Comments Drawer -->
      <div class="mj-docs-body">
        <!-- Left Collapsible Table of Contents & Block Outline Rail -->
        @if (ShowOutlineRail) {
          <aside class="mj-docs-outline-rail" data-testid="docs-outline-rail">
            <div class="mj-docs-outline-rail__header">
              <div class="mj-docs-outline-rail__title-row">
                <h4>Document Outline</h4>
                <button
                  type="button"
                  class="mj-docs-rail-close-btn"
                  title="Hide Document Outline"
                  data-testid="close-outline-rail-btn"
                  (click)="ToggleOutlineRail()"
                >
                  <i class="fas fa-xmark"></i>
                </button>
              </div>
              <span class="mj-docs-outline-stats">{{ WordStats.Words }} words · {{ WordStats.Lines }} lines</span>
            </div>

            @if (OutlineItems.length === 0) {
              <div class="mj-docs-outline-empty">
                No headings or embedded blocks yet. Type <code># Heading</code> or <code>/</code> to insert blocks.
              </div>
            } @else {
              <ul class="mj-docs-outline-list">
                @for (item of OutlineItems; track item.ID) {
                  <li
                    class="mj-docs-outline-item"
                    [class.mj-docs-outline-item--active]="IsOutlineItemActive(item)"
                    [style.padding-left.px]="(item.Level - 1) * 12 + 10"
                    (click)="SelectOutlineItem(item)"
                  >
                    @if (item.Kind === 'heading') {
                      <i class="fas fa-hashtag mj-docs-outline-icon"></i>
                      <span class="mj-docs-outline-title">{{ item.Title }}</span>
                    } @else {
                      <i class="fas fa-cube mj-docs-outline-icon mj-docs-outline-icon--block"></i>
                      <span class="mj-docs-outline-title">{{ item.Title }}</span>
                      <span class="mj-docs-badge" [class.mj-docs-badge--live]="item.BlockMode === 'Live'">
                        {{ item.BlockType === 'Artifact' ? 'Inline' : item.BlockMode }}
                      </span>
                    }
                  </li>
                }
              </ul>
            }

            <div class="mj-docs-outline-rail__footer">
              <div><i class="fas fa-bolt"></i> {{ WordStats.LiveBlocks }} Live MJ Blocks</div>
              <div><i class="fas fa-chalkboard"></i> {{ WordStats.EmbeddedArtifacts }} Embedded Artifacts</div>
            </div>
          </aside>
        }

        <!-- Center Document Canvas -->
        <main class="mj-docs-canvas" #printableCanvas data-testid="docs-main-canvas">
          @if (ViewMode === 'source') {
            <!-- Raw Markdown Source Mode -->
            <div class="mj-docs-source-container" data-testid="docs-source-editor">
              <mj-code-editor
                [(ngModel)]="MarkdownContent"
                (ngModelChange)="OnMarkdownChanged($event)"
                [language]="'markdown'"
                [readonly]="!CanUserEdit"
                style="width: 100%; height: 100%;"
              >
              </mj-code-editor>
            </div>
          } @else if (ViewMode === 'diff') {
            <!-- Version Diff Mode -->
            <div class="mj-docs-diff-view" data-testid="docs-diff-view">
              <div class="mj-docs-diff-toolbar">
                <div class="mj-docs-diff-toolbar__selectors">
                  <label>
                    Compare Base:
                    <select [(ngModel)]="DiffBaseLabel" (ngModelChange)="RecomputeDiff()">
                      <option value="initial">Initial Loaded Version (v{{ artifactVersion.VersionNumber || 1 }})</option>
                      @for (snap of SavedVersionSnapshots; track snap.VersionNumber) {
                        <option [value]="'v' + snap.VersionNumber">
                          Saved v{{ snap.VersionNumber }} ({{ snap.Timestamp }})
                        </option>
                      }
                    </select>
                  </label>
                  <i class="fas fa-arrow-right"></i>
                  <span class="mj-docs-badge mj-docs-badge--brand">Current Working Document</span>
                </div>
                <div class="mj-docs-diff-stats">
                  <span class="mj-docs-diff-stat mj-docs-diff-stat--add">+{{ CurrentDiff.AddedLines }} added</span>
                  <span class="mj-docs-diff-stat mj-docs-diff-stat--del">-{{ CurrentDiff.RemovedLines }} removed</span>
                  <span class="mj-docs-diff-stat">{{ CurrentDiff.UnchangedLines }} unchanged</span>
                  @if (CanUserEdit && (CurrentDiff.AddedLines > 0 || CurrentDiff.RemovedLines > 0)) {
                    <button
                      type="button"
                      class="mj-docs-btn"
                      data-testid="restore-base-version-btn"
                      (click)="RestoreComparisonBase()"
                    >
                      <i class="fas fa-rotate-left"></i> Restore Base Version
                    </button>
                  }
                </div>
              </div>

              <div class="mj-docs-diff-lines">
                @for (line of CurrentDiff.Lines; track $index) {
                  <div
                    class="mj-docs-diff-line"
                    [class.mj-docs-diff-line--added]="line.Type === 'added'"
                    [class.mj-docs-diff-line--removed]="line.Type === 'removed'"
                  >
                    <span class="mj-docs-diff-gutter">{{ line.OldLineNumber ?? '' }}</span>
                    <span class="mj-docs-diff-gutter">{{ line.NewLineNumber ?? '' }}</span>
                    <span class="mj-docs-diff-prefix">
                      {{ line.Type === 'added' ? '+' : line.Type === 'removed' ? '-' : ' ' }}
                    </span>
                    <pre class="mj-docs-diff-code">{{ line.Content }}</pre>
                  </div>
                }
              </div>
            </div>
          } @else {
            <!-- Collaborative Rich Editor / Suggest / Preview Canvas -->
            <div
              class="mj-docs-page"
              [class.mj-docs-page--interactive]="IsInteractiveCanvasMode"
              [class.mj-docs-page--simple]="IsSimpleNoteMode"
              [class.mj-docs-page--blocks]="!IsSimpleNoteMode"
            >
              @if (ViewMode === 'suggest' && CanUserEdit) {
                <div class="mj-docs-suggest-banner" data-testid="docs-suggest-mode-banner">
                  <i class="fas fa-code-pull-request"></i>
                  <span>
                    <strong>Suggest Mode Active:</strong> Edit any heading, paragraph, list item, callout, or table cell
                    directly in place below — your changes are tracked as pending suggestions and committed when you click
                    <strong>Accept</strong> or <strong>Save Version</strong>.
                  </span>
                  @if (PendingSuggestionsCount > 0) {
                    <button
                      type="button"
                      class="mj-docs-btn mj-docs-btn--primary"
                      data-testid="commit-all-suggestions-btn"
                      (click)="CommitPendingSuggestions()"
                    >
                      <i class="fas fa-check-double"></i>
                      <span>Accept All ({{ PendingSuggestionsCount }})</span>
                    </button>
                  }
                </div>
              }

              <!-- Segment-by-Segment Interactive Document Renderer & In-Place WYSIWYG Canvas -->
              <div
                class="mj-docs-segments"
                data-testid="docs-segments-list"
                (mouseup)="CaptureSelectionSnapshot()"
                (keyup)="CaptureSelectionSnapshot()"
              >
                @for (seg of DocumentSegments; track seg.SegmentID) {
                  <div
                    class="mj-docs-segment"
                    [class.mj-docs-segment--selected]="SelectedAnchorKey === seg.SegmentID && !IsSimpleNoteMode"
                    [class.mj-docs-segment--simple]="IsSimpleNoteMode"
                    [attr.data-segment-id]="seg.SegmentID"
                    [hidden]="IsSegmentHiddenByCollapsedHeading(seg)"
                    (focusin)="OnSegmentFocusIn(seg)"
                  >
                    @if (IsInteractiveCanvasMode && IsSimpleNoteMode) {
                      <button
                        type="button"
                        class="mj-docs-simple-plus-btn"
                        title="Add line or insert block below (/)"
                        [attr.data-testid]="'simple-insert-below-btn-' + seg.SegmentID"
                        (mousedown)="OnToolbarActionMousedown($event)"
                        (click)="InsertParagraphBelowSegment(seg)"
                      >
                        +
                      </button>
                    }
                    <!-- Hover Block Handle & Actions (Shown in Advanced Block Studio mode) -->
                    <div class="mj-docs-segment__gutter" [hidden]="IsSimpleNoteMode">
                      @if (IsInteractiveCanvasMode) {
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          title="Move Block Up"
                          [attr.data-testid]="'move-up-btn-' + seg.SegmentID"
                          (click)="MoveSegment(seg, -1)"
                        >
                          <i class="fas fa-arrow-up"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          title="Move Block Down"
                          [attr.data-testid]="'move-down-btn-' + seg.SegmentID"
                          (click)="MoveSegment(seg, 1)"
                        >
                          <i class="fas fa-arrow-down"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          title="Insert Block Below (/)"
                          [attr.data-testid]="'insert-below-btn-' + seg.SegmentID"
                          (click)="OpenSlashMenuForSegment(seg)"
                        >
                          <i class="fas fa-plus"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          title="Delete Block"
                          [attr.data-testid]="'delete-block-btn-' + seg.SegmentID"
                          (click)="DeleteSegment(seg)"
                        >
                          <i class="fas fa-trash-can"></i>
                        </button>
                      }
                      <button
                        type="button"
                        class="mj-docs-handle-btn"
                        title="Anchor Comment on this Block"
                        [attr.data-testid]="'anchor-comment-btn-' + seg.SegmentID"
                        (click)="OpenAnchorCommentForSegment(seg)"
                      >
                        <i class="fas fa-comment-medical"></i>
                        @if (GetThreadCountForAnchor(seg.SegmentID) > 0) {
                          <span class="mj-docs-handle-count">{{ GetThreadCountForAnchor(seg.SegmentID) }}</span>
                        }
                      </button>
                      @if (CanUserEdit && seg.Kind === 'markdown') {
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          title="Propose Tracked Suggestion on Block"
                          [attr.data-testid]="'propose-suggestion-btn-' + seg.SegmentID"
                          (click)="OpenSuggestionModalForSegment(seg)"
                        >
                          <i class="fas fa-lightbulb"></i>
                        </button>
                      }
                    </div>

                    <div class="mj-docs-segment__body">
                      @if (seg.Kind === 'markdown') {
                        @if (IsInteractiveCanvasMode) {
                          <!-- In-Place Interactive WYSIWYG Block Surfaces (Edit & Suggest Modes, § 4.1) -->
                          @switch (seg.BlockKind) {
                            @case ('heading') {
                              <div
                                class="mj-docs-editable-heading"
                                [ngClass]="'mj-docs-editable-heading--h' + (seg.HeadingLevel || 1)"
                              >
                                <button
                                  type="button"
                                  class="mj-docs-collapse-btn"
                                  [hidden]="IsSimpleNoteMode && !IsHeadingCollapsed(seg)"
                                  [title]="IsHeadingCollapsed(seg) ? 'Expand section' : 'Collapse section'"
                                  [attr.data-testid]="'toggle-heading-collapse-' + seg.SegmentID"
                                  (click)="ToggleHeadingCollapse(seg)"
                                >
                                  <i
                                    class="fas"
                                    [ngClass]="IsHeadingCollapsed(seg) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                  ></i>
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-heading-level-pill"
                                  [hidden]="IsSimpleNoteMode"
                                  title="Click to cycle heading level (H1–H4)"
                                  (click)="CycleHeadingLevel(seg)"
                                >
                                  H{{ seg.HeadingLevel || 1 }}
                                </button>
                                <div
                                  class="mj-docs-editable-surface mj-docs-editable-heading__text"
                                  contenteditable="true"
                                  role="textbox"
                                  data-placeholder="Heading title (press Enter for paragraph below)…"
                                  [attr.data-testid]="'editable-heading-' + seg.SegmentID"
                                  [innerHTML]="RenderInlineEditableHtml(seg.HeadingText ?? GetEditableHeadingText(seg))"
                                  (focus)="OnSegmentSurfaceFocus(seg)"
                                  (input)="OnEditableBlockInput(seg, $event)"
                                  (blur)="CommitEditableHeading(seg, $event)"
                                  (keydown)="OnEditableBlockKeydown(seg, $event)"
                                ></div>
                                @if (IsHeadingCollapsed(seg)) {
                                  <button
                                    type="button"
                                    class="mj-docs-collapsed-section-pill"
                                    (click)="ToggleHeadingCollapse(seg)"
                                  >
                                    <i class="fas fa-layer-group"></i>
                                    {{ GetCollapsedChildCount(seg) }} block(s) hidden · Expand
                                  </button>
                                }
                              </div>
                            }
                            @case ('table') {
                              @if (GetParsedTable(seg); as table) {
                                <div
                                  class="mj-docs-editable-table-wrap"
                                  [attr.data-testid]="'editable-table-' + seg.SegmentID"
                                >
                                  <div class="mj-docs-editable-table__toolbar" [hidden]="IsSimpleNoteMode">
                                    <span><i class="fas fa-table"></i> Interactive Table</span>
                                    <div class="mj-docs-editable-table__actions">
                                      <button
                                        type="button"
                                        class="mj-docs-btn"
                                        [attr.data-testid]="'table-add-row-' + seg.SegmentID"
                                        (click)="AddTableRow(seg)"
                                      >
                                        <i class="fas fa-plus"></i> Row
                                      </button>
                                      <button
                                        type="button"
                                        class="mj-docs-btn"
                                        [attr.data-testid]="'table-add-col-' + seg.SegmentID"
                                        (click)="AddTableColumn(seg)"
                                      >
                                        <i class="fas fa-plus"></i> Column
                                      </button>
                                    </div>
                                  </div>
                                  <table class="mj-docs-data-table mj-docs-editable-table">
                                    <thead>
                                      <tr>
                                        @for (hdr of table.Headers; track $index; let cIdx = $index) {
                                          <th
                                            contenteditable="true"
                                            [attr.data-testid]="'table-header-' + seg.SegmentID + '-' + cIdx"
                                            [innerHTML]="RenderInlineEditableHtml(hdr)"
                                            (focus)="OnTableCellFocus(seg, 0, cIdx, true)"
                                            (blur)="UpdateTableHeaderCell(seg, cIdx, $event)"
                                          ></th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (row of table.Rows; track $index; let rIdx = $index) {
                                        <tr>
                                          @for (cell of row; track $index; let cIdx = $index) {
                                            <td
                                              contenteditable="true"
                                              [attr.data-testid]="'table-cell-' + seg.SegmentID + '-' + rIdx + '-' + cIdx"
                                              [innerHTML]="RenderInlineEditableHtml(cell)"
                                              (focus)="OnTableCellFocus(seg, rIdx, cIdx, false)"
                                              (blur)="UpdateTableBodyCell(seg, rIdx, cIdx, $event)"
                                            ></td>
                                          }
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                </div>
                              }
                            }
                            @case ('list') {
                              <div
                                class="mj-docs-editable-list-wrap"
                                [attr.data-testid]="'editable-list-' + seg.SegmentID"
                              >
                                <ul class="mj-docs-editable-list">
                                  @for (item of GetParsedListItems(seg); track item.Index) {
                                    <li class="mj-docs-editable-list__item">
                                      @if (item.IsTask) {
                                        <input
                                          type="checkbox"
                                          class="mj-docs-task-checkbox"
                                          [checked]="item.Checked"
                                          [attr.data-testid]="'task-checkbox-' + seg.SegmentID + '-' + item.Index"
                                          (change)="ToggleTaskListItem(seg, item.Index, $event)"
                                        />
                                      } @else {
                                        <span class="mj-docs-list-bullet">{{ item.OrderedPrefix || '•' }}</span>
                                      }
                                      <span
                                        class="mj-docs-editable-surface mj-docs-editable-list__text"
                                        [class.mj-docs-editable-list__text--checked]="item.Checked"
                                        contenteditable="true"
                                        role="textbox"
                                        data-placeholder="List item (press Enter for next, or Enter when empty to exit)…"
                                        [attr.data-testid]="'list-item-text-' + seg.SegmentID + '-' + item.Index"
                                        [innerHTML]="RenderInlineEditableHtml(item.Text)"
                                        (focus)="OnListItemFocus(seg, item.Index)"
                                        (input)="OnEditableBlockInput(seg, $event)"
                                        (blur)="UpdateListItemText(seg, item.Index, $event)"
                                        (keydown)="OnListItemKeydown(seg, item.Index, $event)"
                                      ></span>
                                    </li>
                                  }
                                </ul>
                                <button
                                  type="button"
                                  class="mj-docs-btn mj-docs-list-add-btn"
                                  [hidden]="IsSimpleNoteMode"
                                  (click)="AddListItem(seg)"
                                >
                                  <i class="fas fa-plus"></i> Add Item
                                </button>
                              </div>
                            }
                            @case ('callout') {
                              @if (GetParsedCallout(seg); as callout) {
                                <div
                                  class="mj-docs-editable-callout"
                                  [ngClass]="'mj-docs-editable-callout--' + callout.CalloutType.toLowerCase()"
                                  [attr.data-testid]="'editable-callout-' + seg.SegmentID"
                                >
                                  <div class="mj-docs-editable-callout__header">
                                    <i class="fas fa-circle-info"></i>
                                    <select
                                      [ngModel]="callout.CalloutType"
                                      (ngModelChange)="UpdateCalloutType(seg, $event)"
                                      aria-label="Callout Type"
                                    >
                                      <option value="NOTE">NOTE</option>
                                      <option value="TIP">TIP</option>
                                      <option value="IMPORTANT">IMPORTANT</option>
                                      <option value="WARNING">WARNING</option>
                                      <option value="CAUTION">CAUTION</option>
                                    </select>
                                  </div>
                                  <div
                                    class="mj-docs-editable-surface mj-docs-editable-callout__body"
                                    contenteditable="true"
                                    role="textbox"
                                    data-placeholder="Callout details (press Enter for paragraph below)…"
                                    [attr.data-testid]="'editable-callout-body-' + seg.SegmentID"
                                    [innerHTML]="RenderInlineEditableHtml(callout.BodyText)"
                                    (focus)="OnSegmentSurfaceFocus(seg)"
                                    (input)="OnEditableBlockInput(seg, $event)"
                                    (blur)="CommitEditableCallout(seg, $event)"
                                    (keydown)="OnEditableBlockKeydown(seg, $event)"
                                  ></div>
                                </div>
                              }
                            }
                            @case ('code') {
                              @if (GetParsedCodeBlock(seg); as codeBlock) {
                                <div
                                  class="mj-docs-editable-code"
                                  [attr.data-testid]="'editable-code-' + seg.SegmentID"
                                >
                                  <div class="mj-docs-editable-code__header">
                                    <span><i class="fas fa-code"></i> Code Block</span>
                                    <input
                                      type="text"
                                      class="mj-docs-code-lang-input"
                                      [ngModel]="codeBlock.Language"
                                      (ngModelChange)="UpdateCodeBlockLanguage(seg, $event)"
                                      placeholder="language"
                                    />
                                  </div>
                                  <pre
                                    class="mj-docs-editable-surface mj-docs-editable-code__pre"
                                    contenteditable="true"
                                    role="textbox"
                                    data-placeholder="Code snippet…"
                                    [attr.data-testid]="'editable-code-body-' + seg.SegmentID"
                                    [textContent]="codeBlock.Code"
                                    (blur)="CommitEditableCodeBlock(seg, $event)"
                                    (keydown)="OnEditableBlockKeydown(seg, $event)"
                                  ></pre>
                                </div>
                              }
                            }
                            @default {
                              <div
                                class="mj-docs-editable-surface mj-docs-editable-paragraph"
                                contenteditable="true"
                                role="textbox"
                                aria-multiline="true"
                                data-placeholder="Type text, '/' for commands, '#' for heading, or '-' for list…"
                                [attr.data-testid]="'editable-paragraph-' + seg.SegmentID"
                                [innerHTML]="RenderInlineEditableHtml(seg.RawMarkdown)"
                                (focus)="OnSegmentSurfaceFocus(seg)"
                                (input)="OnEditableBlockInput(seg, $event)"
                                (blur)="CommitEditableParagraph(seg, $event)"
                                (keydown)="OnEditableBlockKeydown(seg, $event)"
                              ></div>
                            }
                          }
                        } @else {
                          <!-- Reader Preview Markdown Block (Double-click to switch to Write mode when editable) -->
                          <div
                            class="markdown-preview"
                            [attr.title]="CanUserEdit ? 'Double-click to edit block (or click Write in toolbar)' : null"
                            (dblclick)="OnPreviewBlockDoubleClick(seg)"
                          >
                            <mj-markdown
                              [data]="seg.RawMarkdown"
                              [enableCollapsibleHeadings]="true"
                              [enableLineNumbers]="false"
                              [enableSmartypants]="true"
                              [enableHtml]="true"
                            ></mj-markdown>
                          </div>
                        }
                      } @else if (seg.Descriptor && seg.Descriptor.Kind === 'Artifact') {
                        <!-- Embedded Artifact Block (Whiteboard, Child Document, etc. per § 3.4.1 / D12) -->
                        <div
                          class="mj-docs-ole-block"
                          [class.mj-docs-ole-block--editing]="IsInlineEditingBlock(seg.Descriptor.BlockID)"
                          [class.mj-docs-ole-block--expanded]="ExpandedOleBlockID === seg.Descriptor.BlockID"
                          [class.mj-docs-ole-block--collapsed]="IsBlockCollapsed(seg.Descriptor)"
                          [attr.data-testid]="'ole-artifact-block-' + seg.Descriptor.BlockID"
                        >
                          <div class="mj-docs-ole-block__header">
                            <div class="mj-docs-ole-block__title">
                              <button
                                type="button"
                                class="mj-docs-collapse-btn"
                                [title]="IsBlockCollapsed(seg.Descriptor) ? 'Expand embedded block' : 'Collapse embedded block'"
                                [attr.data-testid]="'toggle-block-collapse-' + seg.Descriptor.BlockID"
                                (click)="ToggleBlockCollapsed(seg.Descriptor)"
                              >
                                <i
                                  class="fas"
                                  [ngClass]="IsBlockCollapsed(seg.Descriptor) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                ></i>
                              </button>
                              <i
                                class="fas"
                                [ngClass]="
                                  seg.Descriptor.ArtifactType === 'Whiteboard' ? 'fa-chalkboard' : 'fa-cube'
                                "
                              ></i>
                              <strong>{{
                                seg.Descriptor.Title || seg.Descriptor.ArtifactType || 'Embedded Artifact'
                              }}</strong>
                              <span class="mj-docs-badge mj-docs-badge--brand">
                                Embedded · {{ seg.Descriptor.ArtifactType || 'Artifact' }}
                              </span>
                              @if (GetEmbeddedArtifactVersion(seg.Descriptor); as embHeaderVer) {
                                <span class="mj-docs-badge">
                                  v{{ embHeaderVer.VersionNumber || 1 }}
                                  {{ seg.Descriptor.VersionID ? '· Pinned' : '· Latest' }}
                                </span>
                              } @else {
                                <span class="mj-docs-badge">
                                  {{ seg.Descriptor.VersionID ? 'Pinned' : 'Latest' }}
                                </span>
                              }
                              @if (GetNewerEmbeddedArtifactVersion(seg.Descriptor); as newerVer) {
                                <button
                                  type="button"
                                  class="mj-docs-btn mj-docs-btn--accent"
                                  title="Update pinned snapshot to latest workbook version"
                                  [attr.data-testid]="'update-from-source-workbook-btn-' + seg.Descriptor.BlockID"
                                  (click)="UpdateEmbeddedArtifactToLatestVersion(seg.Descriptor)"
                                >
                                  <i class="fas fa-arrow-up-from-bracket"></i>
                                  <span>
                                    Update from Source Workbook (v{{ GetEmbeddedArtifactVersion(seg.Descriptor)?.VersionNumber || 1 }} → v{{ newerVer.VersionNumber }})
                                  </span>
                                </button>
                              }
                            </div>

                            <div class="mj-docs-ole-block__actions">
                              @if (CanUserEdit) {
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  title="Change Embedded Artifact or Display Settings"
                                  [attr.data-testid]="'configure-block-btn-' + seg.Descriptor.BlockID"
                                  (click)="OpenConfigureBlockModal(seg.Descriptor)"
                                >
                                  <i class="fas fa-sliders"></i>
                                  <span>Configure</span>
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  [class.mj-docs-btn--primary]="IsInlineEditingBlock(seg.Descriptor.BlockID)"
                                  [attr.data-testid]="'toggle-inline-ole-btn-' + seg.Descriptor.BlockID"
                                  (click)="ToggleInlineArtifactEdit(seg.Descriptor)"
                                >
                                  <i
                                    class="fas"
                                    [ngClass]="
                                      IsInlineEditingBlock(seg.Descriptor.BlockID)
                                        ? 'fa-check'
                                        : 'fa-up-right-and-down-left-from-center'
                                    "
                                  ></i>
                                  <span>
                                    {{
                                      IsInlineEditingBlock(seg.Descriptor.BlockID)
                                        ? 'Done Inline Editing'
                                        : 'Edit Inline Canvas'
                                    }}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  title="Toggle Version Pin (Pinned vs. Track Latest)"
                                  [attr.data-testid]="'toggle-pin-ole-btn-' + seg.Descriptor.BlockID"
                                  (click)="TogglePinArtifactVersion(seg.Descriptor)"
                                >
                                  <i class="fas fa-thumbtack"></i>
                                  <span>{{ GetPinArtifactVersionButtonLabel(seg.Descriptor) }}</span>
                                </button>
                              }
                              <button
                                type="button"
                                class="mj-docs-btn"
                                title="Expand / Collapse Full Screen Modal"
                                [attr.data-testid]="'expand-ole-fullscreen-btn-' + seg.Descriptor.BlockID"
                                (click)="ToggleExpandOleBlock(seg.Descriptor)"
                              >
                                <i
                                  class="fas"
                                  [ngClass]="
                                    ExpandedOleBlockID === seg.Descriptor.BlockID ? 'fa-compress' : 'fa-expand'
                                  "
                                ></i>
                                <span>{{ ExpandedOleBlockID === seg.Descriptor.BlockID ? 'Exit Full Screen' : 'Full Screen' }}</span>
                              </button>
                              <button
                                type="button"
                                class="mj-docs-btn"
                                title="Comment on Embedded Artifact"
                                (click)="OpenAnchorCommentForSegment(seg)"
                              >
                                <i class="fas fa-comment"></i>
                              </button>
                            </div>
                          </div>

                          <div
                            class="mj-docs-ole-block__viewport"
                            [hidden]="IsBlockCollapsed(seg.Descriptor)"
                            [style.height.px]="
                              ExpandedOleBlockID === seg.Descriptor.BlockID ? 680 : seg.Descriptor.HeightPx || 420
                            "
                          >
                            @if (GetEmbeddedArtifactVersion(seg.Descriptor); as embeddedVer) {
                              <mj-artifact-type-plugin-viewer
                                [Provider]="Provider"
                                [artifactVersion]="embeddedVer"
                                [ArtifactTypeName]="seg.Descriptor.ArtifactType || 'Whiteboard'"
                                [readonly]="!IsInlineEditingBlock(seg.Descriptor.BlockID)"
                                (ContentCommitted)="OnEmbeddedArtifactContentCommitted(seg.Descriptor, $event)"
                              ></mj-artifact-type-plugin-viewer>
                            } @else {
                              <div
                                class="mj-docs-live-block__empty"
                                [attr.data-testid]="'ole-artifact-placeholder-' + seg.Descriptor.BlockID"
                              >
                                @if (IsEmbeddedArtifactLoading(seg.Descriptor)) {
                                  <i class="fas fa-spinner fa-spin"></i> Loading embedded artifact…
                                } @else {
                                  <span>{{ GetEmbeddedArtifactError(seg.Descriptor) || 'Embedded artifact unavailable or access denied.' }}</span>
                                }
                              </div>
                            }
                          </div>
                        </div>
                      } @else if (seg.Descriptor) {
                        <!-- Live MJ Data Block (EntityView, SavedQuery, DashboardPart, InteractiveComponent) -->
                        <div
                          class="mj-docs-live-block"
                          [class.mj-docs-live-block--frozen]="seg.Descriptor.Mode === 'Frozen'"
                          [class.mj-docs-live-block--collapsed]="IsBlockCollapsed(seg.Descriptor)"
                          [attr.data-testid]="'live-mj-block-' + seg.Descriptor.BlockID"
                        >
                          <div class="mj-docs-live-block__header">
                            <div class="mj-docs-live-block__title">
                              <button
                                type="button"
                                class="mj-docs-collapse-btn"
                                [title]="
                                  IsBlockCollapsed(seg.Descriptor)
                                    ? 'Expand block (saved to your personal reading preferences)'
                                    : 'Collapse block (saved to your personal reading preferences)'
                                "
                                [attr.data-testid]="'toggle-block-collapse-' + seg.Descriptor.BlockID"
                                (click)="ToggleBlockCollapsed(seg.Descriptor)"
                              >
                                <i
                                  class="fas"
                                  [ngClass]="IsBlockCollapsed(seg.Descriptor) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                ></i>
                              </button>
                              <i class="fas" [ngClass]="GetLiveBlockIcon(seg.Descriptor.Kind)"></i>
                              <strong>{{
                                seg.Descriptor.Title ||
                                  seg.Descriptor.EntityName ||
                                  seg.Descriptor.QueryName ||
                                  seg.Descriptor.Kind
                              }}</strong>
                              <span
                                class="mj-docs-badge"
                                [class.mj-docs-badge--live]="seg.Descriptor.Mode === 'Live'"
                                [class.mj-docs-badge--frozen]="seg.Descriptor.Mode === 'Frozen'"
                                [attr.data-testid]="'block-mode-badge-' + seg.Descriptor.BlockID"
                              >
                                {{ seg.Descriptor.Mode === 'Live' ? '● Live' : '❄ Frozen Snapshot' }}
                              </span>
                              <span class="mj-docs-badge">{{ GetBlockKindDisplayLabel(seg.Descriptor) }}</span>
                              @if (seg.Descriptor.EntityName) {
                                <span class="mj-docs-badge">
                                  {{ seg.Descriptor.EntityName }}{{ seg.Descriptor.ViewName ? ' · ' + seg.Descriptor.ViewName : ' · Default View' }}
                                </span>
                              } @else if (seg.Descriptor.QueryName) {
                                <span class="mj-docs-badge">{{ seg.Descriptor.QueryName }}</span>
                              }
                            </div>

                            <div class="mj-docs-live-block__actions">
                              @if (CanUserEdit) {
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  [title]="
                                    seg.Descriptor.Kind === 'EntityView'
                                      ? 'Change Entity, View, Filter, or Display Settings'
                                      : seg.Descriptor.Kind === 'SavedQuery'
                                        ? 'Change Query or Display Settings'
                                        : 'Configure Block Properties'
                                  "
                                  [attr.data-testid]="'configure-block-btn-' + seg.Descriptor.BlockID"
                                  (click)="OpenConfigureBlockModal(seg.Descriptor)"
                                >
                                  <i class="fas fa-sliders"></i>
                                  <span>
                                    {{
                                      seg.Descriptor.Kind === 'EntityView'
                                        ? 'Change View'
                                        : seg.Descriptor.Kind === 'SavedQuery'
                                          ? 'Change Query'
                                          : 'Configure'
                                    }}
                                  </span>
                                </button>
                              }
                              @if (seg.Descriptor.Mode === 'Live') {
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  title="Refresh Live Data"
                                  (click)="RefreshLiveBlock(seg.Descriptor)"
                                >
                                  <i class="fas fa-arrows-rotate"></i> Refresh
                                </button>
                                @if (CanUserEdit) {
                                  <button
                                    type="button"
                                    class="mj-docs-btn"
                                    title="Freeze Snapshot into Document"
                                    [attr.data-testid]="'freeze-block-btn-' + seg.Descriptor.BlockID"
                                    (click)="PromptFreezeBlock(seg.Descriptor)"
                                  >
                                    <i class="fas fa-snowflake"></i> Freeze Snapshot
                                  </button>
                                }
                              } @else if (CanUserEdit) {
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  title="Restore Live Mode"
                                  [attr.data-testid]="'unfreeze-block-btn-' + seg.Descriptor.BlockID"
                                  (click)="UnfreezeLiveBlock(seg.Descriptor)"
                                >
                                  <i class="fas fa-bolt"></i> Switch to Live
                                </button>
                              }
                            </div>
                          </div>

                          @if (seg.Descriptor.Mode === 'Frozen' && seg.Descriptor.FrozenSnapshot) {
                            @if (IsSnapshotVerified(seg.Descriptor)) {
                              <div class="mj-docs-live-block__provenance" data-testid="frozen-provenance-banner">
                                <i class="fas fa-shield-halved"></i>
                                <span>
                                  Frozen snapshot captured at <strong>{{ seg.Descriptor.FrozenSnapshot.FrozenAt }}</strong>
                                  @if (
                                    seg.Descriptor.FrozenSnapshot.FrozenByUserName ||
                                    seg.Descriptor.FrozenSnapshot.FrozenByUserID
                                  ) {
                                    by
                                    <strong>{{
                                      seg.Descriptor.FrozenSnapshot.FrozenByUserName ||
                                        seg.Descriptor.FrozenSnapshot.FrozenByUserID
                                    }}</strong>
                                  }
                                </span>
                              </div>
                            } @else {
                              <div
                                class="mj-docs-live-block__error"
                                data-testid="unverified-snapshot-banner"
                                [attr.data-block-id]="seg.Descriptor.BlockID"
                              >
                                <i class="fas fa-triangle-exclamation"></i>
                                <span>
                                  Unverified Snapshot — signature missing or invalid (captured at
                                  {{ seg.Descriptor.FrozenSnapshot.FrozenAt }})
                                </span>
                              </div>
                            }
                          }

                          @if (GetBlockExecutionResult(seg.Descriptor); as execResult) {
                            @if (
                              execResult.StrippedServerSetParameters &&
                              execResult.StrippedServerSetParameters.length > 0
                            ) {
                              <div class="mj-docs-live-block__security-note" data-testid="block-security-note">
                                <i class="fas fa-lock"></i>
                                <span>
                                  Stripped server-only params: {{ execResult.StrippedServerSetParameters.join(', ') }}
                                </span>
                              </div>
                            }

                            <div class="mj-docs-live-block__body" [hidden]="IsBlockCollapsed(seg.Descriptor)">
                              @if (!execResult.Success) {
                                <div class="mj-docs-live-block__error">
                                  <i class="fas fa-triangle-exclamation"></i>
                                  <span>{{ execResult.ErrorMessage }}</span>
                                </div>
                              } @else if (execResult.Columns.length > 0) {
                                <div
                                  class="mj-docs-table-scroll-viewport"
                                  [attr.data-testid]="'block-scroll-viewport-' + seg.Descriptor.BlockID"
                                >
                                  <table class="mj-docs-data-table mj-docs-data-table--sticky">
                                    <thead>
                                      <tr>
                                        @for (col of execResult.Columns; track col.Name) {
                                          <th>
                                            <span class="mj-docs-col-hdr">
                                              <span>{{ col.DisplayName || col.Name }}</span>
                                              @if (col.IsPrimaryKey) {
                                                <i
                                                  class="fas fa-key mj-docs-col-hdr__icon"
                                                  title="Primary Key — click cell to open record"
                                                ></i>
                                              } @else if (col.IsForeignKey) {
                                                <i
                                                  class="fas fa-link mj-docs-col-hdr__icon"
                                                  [title]="'Linked to ' + (col.TargetEntityName || 'related record') + ' — click cell to open'"
                                                ></i>
                                              }
                                            </span>
                                          </th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (row of GetPaginatedBlockRows(seg.Descriptor, execResult.Rows); track $index) {
                                        <tr>
                                          @for (col of execResult.Columns; track col.Name) {
                                            <td>
                                              @if (IsCellRecordLink(col, row)) {
                                                <a
                                                  href="javascript:void(0)"
                                                  class="mj-docs-record-link"
                                                  [class.mj-docs-record-link--pk]="col.IsPrimaryKey || col.IsNameField"
                                                  [class.mj-docs-record-link--fk]="col.IsForeignKey"
                                                  [title]="
                                                    'Open ' +
                                                    (col.TargetEntityName || seg.Descriptor.EntityName || 'Record') +
                                                    ' record'
                                                  "
                                                  [attr.data-testid]="
                                                    'record-link-' + seg.Descriptor.BlockID + '-' + col.Name
                                                  "
                                                  (click)="OnBlockRecordCellClick(seg.Descriptor, col, row, $event)"
                                                >
                                                  <i
                                                    class="fas"
                                                    [ngClass]="
                                                      col.IsForeignKey
                                                        ? 'fa-arrow-up-right-from-square'
                                                        : 'fa-file-lines'
                                                    "
                                                  ></i>
                                                  <span>{{ FormatCellValue(row[col.Name]) }}</span>
                                                </a>
                                              } @else {
                                                {{ FormatCellValue(row[col.Name]) }}
                                              }
                                            </td>
                                          }
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                </div>
                                <div class="mj-docs-live-block__footer mj-docs-pager">
                                  <span class="mj-docs-pager__summary">
                                    Showing {{ GetBlockPageStartRow(seg.Descriptor, execResult.Rows.length) }}–{{
                                      GetBlockPageEndRow(seg.Descriptor, execResult.Rows.length)
                                    }}
                                    of {{ execResult.TotalRowCount || execResult.Rows.length }} record(s)
                                  </span>

                                  <div class="mj-docs-pager__controls">
                                    <label class="mj-docs-pager__size">
                                      <span>Rows per page:</span>
                                      <select
                                        [ngModel]="GetBlockPageSize(seg.Descriptor)"
                                        (ngModelChange)="SetBlockPageSize(seg.Descriptor, $event)"
                                        [attr.data-testid]="'block-page-size-' + seg.Descriptor.BlockID"
                                      >
                                        <option [ngValue]="10">10</option>
                                        <option [ngValue]="25">25</option>
                                        <option [ngValue]="50">50</option>
                                        <option [ngValue]="100">100</option>
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      class="mj-docs-btn"
                                      [disabled]="GetBlockPageNumber(seg.Descriptor) <= 1"
                                      [attr.data-testid]="'block-prev-page-' + seg.Descriptor.BlockID"
                                      (click)="ChangeBlockPage(seg.Descriptor, -1, execResult.Rows.length)"
                                    >
                                      <i class="fas fa-chevron-left"></i> Prev
                                    </button>
                                    <span class="mj-docs-pager__page-num">
                                      Page {{ GetBlockPageNumber(seg.Descriptor) }} /
                                      {{ GetBlockTotalPages(seg.Descriptor, execResult.Rows.length) }}
                                    </span>
                                    <button
                                      type="button"
                                      class="mj-docs-btn"
                                      [disabled]="
                                        GetBlockPageNumber(seg.Descriptor) >=
                                        GetBlockTotalPages(seg.Descriptor, execResult.Rows.length)
                                      "
                                      [attr.data-testid]="'block-next-page-' + seg.Descriptor.BlockID"
                                      (click)="ChangeBlockPage(seg.Descriptor, 1, execResult.Rows.length)"
                                    >
                                      Next <i class="fas fa-chevron-right"></i>
                                    </button>
                                  </div>
                                </div>
                              } @else {
                                <div class="mj-docs-live-block__empty">No records returned for current viewer scope.</div>
                              }
                            </div>
                          }
                        </div>
                      }

                      <!-- Pending Suggestion Cards attached to this Segment (Word / Google-Docs Granular Redline) -->
                      @for (sug of GetSuggestionsForBlock(seg.SegmentID); track sug.SuggestionID) {
                        @if (GetSuggestionWordDiff(sug); as wordDiff) {
                          <div class="mj-docs-suggestion-card" [attr.data-testid]="'suggestion-card-' + sug.SuggestionID">
                            <div class="mj-docs-suggestion-card__header">
                              <span>
                                <i class="fas fa-code-pull-request"></i>
                                Suggestion by <strong>{{ sug.AuthorName }}</strong>
                                @if (wordDiff.Hunks.length > 0) {
                                  <span class="mj-docs-suggestion-count-pill">
                                    {{ wordDiff.Hunks.length }} word/phrase {{ wordDiff.Hunks.length === 1 ? 'edit' : 'edits' }}
                                  </span>
                                }
                              </span>
                              <span class="mj-docs-badge">{{ sug.Status }}</span>
                            </div>

                            <!-- 1. Inline Tracked-Changes Redline Preview in Context -->
                            <div
                              class="mj-docs-inline-redline"
                              [attr.data-testid]="'suggestion-inline-redline-' + sug.SuggestionID"
                            >
                              @for (span of wordDiff.Spans; track $index) {
                                @if (span.Type === 'equal') {
                                  <span class="mj-docs-redline-eq">{{ span.Text }}</span>
                                } @else if (span.Type === 'delete') {
                                  <del class="mj-docs-redline-del">{{ span.Text }}</del>
                                } @else {
                                  <ins class="mj-docs-redline-ins">{{ span.Text }}</ins>
                                }
                              }
                            </div>

                            <!-- 2. Google-Docs-Style Granular Word / Phrase Hunk List -->
                            @if (wordDiff.Hunks.length > 0) {
                              <div class="mj-docs-hunk-list" [attr.data-testid]="'suggestion-hunks-' + sug.SuggestionID">
                                @for (hunk of wordDiff.Hunks; track hunk.HunkID) {
                                  <div class="mj-docs-hunk-item" [attr.data-testid]="'suggestion-hunk-' + hunk.HunkID">
                                    <div class="mj-docs-hunk-item__summary">
                                      @if (hunk.Kind === 'replace') {
                                        <span class="mj-docs-hunk-verb">Replace</span>
                                        <del class="mj-docs-redline-del">{{ hunk.DeletedText }}</del>
                                        <span class="mj-docs-hunk-verb">with</span>
                                        <ins class="mj-docs-redline-ins">{{ hunk.InsertedText }}</ins>
                                      } @else if (hunk.Kind === 'insert') {
                                        <span class="mj-docs-hunk-verb">Insert</span>
                                        <ins class="mj-docs-redline-ins">{{ hunk.InsertedText }}</ins>
                                      } @else {
                                        <span class="mj-docs-hunk-verb">Delete</span>
                                        <del class="mj-docs-redline-del">{{ hunk.DeletedText }}</del>
                                      }
                                    </div>

                                    @if (sug.Status === 'Pending' && CanUserEdit && wordDiff.Hunks.length > 1) {
                                      <div class="mj-docs-hunk-item__actions">
                                        <button
                                          type="button"
                                          class="mj-docs-btn mj-docs-btn--xs mj-docs-btn--primary"
                                          title="Accept only this word/phrase edit"
                                          [attr.data-testid]="'accept-hunk-btn-' + sug.SuggestionID + '-' + hunk.HunkID"
                                          (click)="AcceptSuggestionHunk(sug, hunk)"
                                        >
                                          <i class="fas fa-check"></i>
                                        </button>
                                        <button
                                          type="button"
                                          class="mj-docs-btn mj-docs-btn--xs"
                                          title="Reject only this word/phrase edit"
                                          [attr.data-testid]="'reject-hunk-btn-' + sug.SuggestionID + '-' + hunk.HunkID"
                                          (click)="RejectSuggestionHunk(sug, hunk)"
                                        >
                                          <i class="fas fa-xmark"></i>
                                        </button>
                                      </div>
                                    }
                                  </div>
                                }
                              </div>
                            }

                            @if (sug.Status === 'Pending' && CanUserEdit) {
                              <div class="mj-docs-suggestion-card__actions">
                                <button
                                  type="button"
                                  class="mj-docs-btn mj-docs-btn--primary"
                                  [attr.data-testid]="'accept-suggestion-btn-' + sug.SuggestionID"
                                  (click)="AcceptSuggestion(sug)"
                                >
                                  <i class="fas fa-check"></i>
                                  {{ wordDiff.Hunks.length > 1 ? 'Accept All (' + wordDiff.Hunks.length + ')' : 'Accept' }}
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  [attr.data-testid]="'reject-suggestion-btn-' + sug.SuggestionID"
                                  (click)="RejectSuggestion(sug)"
                                >
                                  <i class="fas fa-xmark"></i>
                                  {{ wordDiff.Hunks.length > 1 ? 'Reject All' : 'Reject' }}
                                </button>
                              </div>
                            }
                          </div>
                        }
                      }
                    </div>
                  </div>
                }
              </div>

              @if (IsInteractiveCanvasMode) {
                <div
                  class="mj-docs-trailing-flow-zone"
                  role="button"
                  tabindex="0"
                  data-testid="docs-trailing-flow-zone"
                  (click)="AppendOrFocusTrailingParagraph()"
                  (keydown.enter)="AppendOrFocusTrailingParagraph()"
                >
                  <span class="mj-docs-trailing-flow-zone__hint">
                    <i class="fas fa-plus"></i>
                    <span>Click or press Enter to continue writing, or type <kbd>/</kbd> for commands…</span>
                  </span>
                </div>
              }
            </div>
          }
        </main>

        <!-- Right Collapsible Anchored DocBlock Comments & @mention Drawer -->
        @if (ShowCommentsDrawer) {
          <aside class="mj-docs-comments-drawer" data-testid="docs-comments-drawer">
            <div class="mj-docs-comments-drawer__header">
              <h4><i class="fas fa-comments"></i> Anchored Comments</h4>
              <div class="mj-docs-comments-filter">
                <button
                  type="button"
                  class="mj-docs-filter-pill"
                  [class.mj-docs-filter-pill--active]="CommentFilter === 'all'"
                  (click)="CommentFilter = 'all'"
                >
                  All ({{ AnchoredThreads.length }})
                </button>
                <button
                  type="button"
                  class="mj-docs-filter-pill"
                  [class.mj-docs-filter-pill--active]="CommentFilter === 'open'"
                  (click)="CommentFilter = 'open'"
                >
                  Open ({{ OpenThreadsCount }})
                </button>
                <button
                  type="button"
                  class="mj-docs-filter-pill"
                  [class.mj-docs-filter-pill--active]="CommentFilter === 'resolved'"
                  (click)="CommentFilter = 'resolved'"
                >
                  Resolved
                </button>
              </div>
            </div>

            <!-- New Anchored Comment / @mention Agent Composer -->
            <div class="mj-docs-comment-composer" data-testid="anchored-comment-composer">
              <div class="mj-docs-comment-composer__anchor">
                <i class="fas fa-anchor"></i>
                <span>Anchor: <strong>{{ SelectedAnchorLabel || SelectedAnchorKey || 'Document Root' }}</strong></span>
              </div>
              @if (SelectedAnchorQuote) {
                <blockquote class="mj-docs-comment-composer__quote">"{{ SelectedAnchorQuote }}"</blockquote>
              }
              <textarea
                rows="3"
                class="mj-docs-comment-input"
                placeholder="Add a comment or @mention an AI assistant to collaborate..."
                [(ngModel)]="NewCommentText"
                data-testid="new-anchored-comment-input"
              ></textarea>
              <div class="mj-docs-comment-composer__footer">
                <label class="mj-docs-agent-mode-label" title="Control how @mentioned agents apply changes">
                  <span>Agent Mode:</span>
                  <select [(ngModel)]="NewCommentAgentMode" data-testid="comment-agent-mode-select">
                    <option value="suggest">Suggest Card</option>
                    <option value="edit">Direct Edit</option>
                    <option value="comment">Comment Reply</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="mj-docs-btn mj-docs-btn--primary"
                  [disabled]="!NewCommentText.trim()"
                  data-testid="post-anchored-comment-btn"
                  (click)="PostAnchoredComment()"
                >
                  <i class="fas fa-paper-plane"></i> Post
                </button>
              </div>
            </div>

            <!-- Thread List -->
            <div class="mj-docs-threads-list" data-testid="anchored-threads-list">
              @if (FilteredThreads.length === 0) {
                <div class="mj-docs-threads-empty">
                  No anchored threads in this view. Click any block's comment icon or post above.
                </div>
              } @else {
                @for (thread of FilteredThreads; track thread.ConversationID) {
                  <div
                    class="mj-docs-thread-card"
                    [class.mj-docs-thread-card--resolved]="thread.Status === 'Resolved'"
                    [attr.data-testid]="'anchored-thread-' + thread.ConversationID"
                  >
                    <div class="mj-docs-thread-card__header">
                      <span class="mj-docs-thread-anchor" (click)="FocusAnchorBlock(thread.AnchorKey)">
                        <i class="fas fa-crosshairs"></i> {{ thread.AnchorLabel }}
                      </span>
                      <button
                        type="button"
                        class="mj-docs-btn"
                        [attr.data-testid]="'resolve-thread-btn-' + thread.ConversationID"
                        (click)="ToggleResolveThread(thread)"
                      >
                        {{ thread.Status === 'Resolved' ? 'Reopen' : 'Resolve' }}
                      </button>
                    </div>
                    @if (thread.QuotedText) {
                      <div class="mj-docs-thread-card__quote">"{{ thread.QuotedText }}"</div>
                    }
                    <div class="mj-docs-thread-messages">
                      @for (msg of thread.Messages; track msg.DetailID) {
                        <div
                          class="mj-docs-thread-msg"
                          [class.mj-docs-thread-msg--agent]="msg.Role === 'Agent'"
                        >
                          <div class="mj-docs-thread-msg__meta">
                            <strong>{{ msg.UserName }}</strong>
                            @if (msg.Role === 'Agent') {
                              <span class="mj-docs-badge mj-docs-badge--brand">AI Agent</span>
                            }
                          </div>
                          <div class="mj-docs-thread-msg__body">{{ msg.Message }}</div>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          </aside>
        }
      </div>

      <!-- Freeze Live Block Security Warning Modal (O5) -->
      @if (PendingFreezeBlock) {
        <div class="mj-docs-modal-backdrop" data-testid="freeze-warning-modal">
          <div class="mj-docs-modal" role="dialog" aria-labelledby="freeze-modal-title">
            <div class="mj-docs-modal__header">
              <h3 id="freeze-modal-title">
                <i class="fas fa-triangle-exclamation"></i> Freeze Live MJ Data Snapshot?
              </h3>
            </div>
            <div class="mj-docs-modal__body">
              <p>
                You are about to freeze
                <strong>{{
                  PendingFreezeBlock.Title || PendingFreezeBlock.EntityName || PendingFreezeBlock.QueryName
                }}</strong>
                into a static snapshot inside this document.
              </p>
              <div class="mj-docs-modal__warning-box">
                <strong>Data Access &amp; Governance Notice:</strong>
                Freezing captures the rows and columns currently visible under your user permissions and stores them
                directly in this document version. Anyone with read access to this document will be able to view these
                frozen values as a static snapshot.
              </div>
              <label class="mj-docs-modal__checkbox">
                <input
                  type="checkbox"
                  [(ngModel)]="FreezeWarningAcknowledged"
                  data-testid="freeze-warning-checkbox"
                />
                <span>
                  I understand that freezing embeds my current view of this data into the document artifact.
                </span>
              </label>
            </div>
            <div class="mj-docs-modal__footer">
              <button type="button" class="mj-docs-btn" (click)="CancelFreezeBlock()">Cancel</button>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--primary"
                [disabled]="!FreezeWarningAcknowledged"
                data-testid="confirm-freeze-btn"
                (click)="ConfirmFreezeBlock()"
              >
                <i class="fas fa-snowflake"></i> Confirm Freeze Snapshot
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Insert Live Block / Embedded Artifact Configuration Modal -->
      @if (PendingBlockInsertType) {
        <div class="mj-docs-modal-backdrop" data-testid="insert-block-modal">
          <div class="mj-docs-modal mj-docs-modal--picker" role="dialog" aria-labelledby="insert-block-modal-title">
            <div class="mj-docs-modal__header mj-docs-modal__header--with-sub">
              <div>
                <h3 id="insert-block-modal-title">{{ GetInsertModalTitle() }}</h3>
                <p class="mj-docs-modal__subtitle">{{ GetInsertModalSubtitle() }}</p>
              </div>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--icon"
                title="Close"
                (click)="CancelBlockInsertModal()"
              >
                <i class="fas fa-xmark"></i>
              </button>
            </div>

            <div class="mj-docs-modal__body">
              @if (PendingBlockInsertType === 'EntityView') {
                <!-- 1. Searchable Entity Combobox Picker (matching mj-fk-search UX) -->
                <div class="mj-docs-field mj-docs-picker-field">
                  <div class="mj-docs-field__label-row">
                    <span>Entity</span>
                    @if (SelectedEntityOption; as selEnt) {
                      <span class="mj-docs-picker-selected-pill">
                        <i [class]="selEnt.Icon"></i>
                        {{ selEnt.DisplayName }}
                      </span>
                    }
                  </div>
                  <div class="mj-docs-picker-combobox">
                    <i class="fas fa-magnifying-glass mj-docs-picker-combobox__search-icon"></i>
                    <input
                      type="text"
                      class="mj-docs-picker-combobox__input"
                      [(ngModel)]="NewBlockEntityName"
                      (ngModelChange)="OnEntitySearchInput($event)"
                      (focus)="OpenEntityPickerDropdown()"
                      (keydown)="OnEntityPickerKeydown($event)"
                      placeholder="Start typing an entity name (e.g., Artifacts, Conversations, Users)…"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      spellcheck="false"
                      role="combobox"
                      [attr.aria-expanded]="ShowEntityPickerDropdown"
                      aria-autocomplete="list"
                      data-testid="new-block-entity-input"
                    />
                    @if (NewBlockEntityName) {
                      <button
                        type="button"
                        class="mj-docs-picker-combobox__clear"
                        title="Clear entity"
                        (click)="ClearSelectedEntity()"
                      >
                        <i class="fas fa-xmark"></i>
                      </button>
                    }
                    <button
                      type="button"
                      class="mj-docs-picker-combobox__chevron"
                      title="Browse all entities"
                      (click)="ToggleEntityPickerDropdown()"
                      data-testid="toggle-entity-picker-btn"
                    >
                      <i class="fas" [ngClass]="ShowEntityPickerDropdown ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                    </button>
                  </div>

                  @if (ShowEntityPickerDropdown) {
                    <div class="mj-docs-picker-dropdown" role="listbox" data-testid="entity-picker-dropdown">
                      <div class="mj-docs-picker-dropdown__meta">
                        <span>
                          Showing {{ FilteredEntityPickerOptions.length }} of {{ EntityPickerOptions.length }} entities
                        </span>
                        <span>↑↓ Navigate · Enter Select</span>
                      </div>
                      @if (FilteredEntityPickerOptions.length === 0) {
                        <div class="mj-docs-picker-dropdown__empty">
                          No matching entities found for "{{ NewBlockEntityName }}".
                        </div>
                      } @else {
                        <div class="mj-docs-picker-dropdown__list">
                          @for (opt of FilteredEntityPickerOptions; track opt.ID; let idx = $index) {
                            <button
                              type="button"
                              role="option"
                              class="mj-docs-picker-option"
                              [class.mj-docs-picker-option--active]="
                                idx === EntityPickerHighlightIndex || opt.Name === NewBlockEntityName
                              "
                              [attr.aria-selected]="opt.Name === NewBlockEntityName"
                              (mousedown)="SelectEntityOption(opt); $event.preventDefault()"
                            >
                              <span class="mj-docs-picker-option__icon">
                                <i [class]="opt.Icon"></i>
                              </span>
                              <span class="mj-docs-picker-option__content">
                                <span class="mj-docs-picker-option__title">{{ opt.DisplayName }}</span>
                                <span class="mj-docs-picker-option__sub">{{ opt.Name }} · {{ opt.Subtitle }}</span>
                              </span>
                              @if (opt.Name === NewBlockEntityName) {
                                <i class="fas fa-check mj-docs-picker-option__check"></i>
                              }
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- 2. View Selection: Default View vs. Named Saved View -->
                <div class="mj-docs-field">
                  <div class="mj-docs-field__label-row">
                    <span>View Configuration</span>
                    @if (IsLoadingEntityViews) {
                      <span class="mj-docs-picker-muted"><i class="fas fa-spinner fa-spin"></i> Loading views…</span>
                    }
                  </div>
                  <div class="mj-docs-view-mode-cards" role="radiogroup" aria-label="View Mode">
                    <button
                      type="button"
                      class="mj-docs-view-mode-card"
                      [class.mj-docs-view-mode-card--active]="NewBlockViewSelectionMode === 'default'"
                      (click)="SetBlockViewSelectionMode('default')"
                      data-testid="view-mode-default-btn"
                    >
                      <div class="mj-docs-view-mode-card__top">
                        <i class="fas fa-table-columns"></i>
                        <strong>Default View</strong>
                      </div>
                      <span class="mj-docs-view-mode-card__desc">
                        All records using default columns for {{ SelectedEntityDisplayName }}
                      </span>
                    </button>

                    <button
                      type="button"
                      class="mj-docs-view-mode-card"
                      [class.mj-docs-view-mode-card--active]="NewBlockViewSelectionMode === 'saved'"
                      (click)="SetBlockViewSelectionMode('saved')"
                      data-testid="view-mode-saved-btn"
                    >
                      <div class="mj-docs-view-mode-card__top">
                        <i class="fas fa-bookmark"></i>
                        <strong>Named View</strong>
                        <span class="mj-docs-badge">{{ AvailableEntityViews.length }}</span>
                      </div>
                      <span class="mj-docs-view-mode-card__desc">
                        Pick a saved View configured for {{ SelectedEntityDisplayName }}
                      </span>
                    </button>
                  </div>

                  @if (NewBlockViewSelectionMode === 'saved') {
                    <div class="mj-docs-saved-view-picker" data-testid="saved-view-picker-panel">
                      @if (AvailableEntityViews.length > 0) {
                        <div class="mj-docs-saved-view-list">
                          @for (viewOpt of AvailableEntityViews; track viewOpt.ID) {
                            <button
                              type="button"
                              class="mj-docs-saved-view-item"
                              [class.mj-docs-saved-view-item--active]="
                                IsSameUuid(NewBlockViewID, viewOpt.ID) || NewBlockViewName === viewOpt.Name
                              "
                              (click)="SelectSavedViewOption(viewOpt)"
                              [attr.data-testid]="'saved-view-option-' + viewOpt.ID"
                            >
                              <i class="fas fa-table-list"></i>
                              <div class="mj-docs-saved-view-item__text">
                                <strong>{{ viewOpt.Name }}</strong>
                                @if (viewOpt.Description) {
                                  <span>{{ viewOpt.Description }}</span>
                                }
                              </div>
                              @if (IsSameUuid(NewBlockViewID, viewOpt.ID) || NewBlockViewName === viewOpt.Name) {
                                <i class="fas fa-circle-check mj-docs-picker-option__check"></i>
                              }
                            </button>
                          }
                        </div>
                      } @else if (!IsLoadingEntityViews) {
                        <div class="mj-docs-saved-view-empty">
                          No saved views found yet for <strong>{{ SelectedEntityDisplayName }}</strong>. You can enter a
                          View Name below or use <strong>Default View</strong>.
                        </div>
                      }
                      <label class="mj-docs-field">
                        <span>Selected View Name</span>
                        <input
                          type="text"
                          [(ngModel)]="NewBlockViewName"
                          placeholder="Choose from list above or enter a saved View name…"
                          data-testid="new-block-view-name-input"
                        />
                      </label>
                    </div>
                  }
                </div>
              } @else if (PendingBlockInsertType === 'SavedQuery') {
                <div class="mj-docs-field mj-docs-picker-field">
                  <span>Query</span>
                  <div class="mj-docs-picker-combobox">
                    <i class="fas fa-magnifying-glass mj-docs-picker-combobox__search-icon"></i>
                    <input
                      type="text"
                      class="mj-docs-picker-combobox__input"
                      [(ngModel)]="NewBlockQueryName"
                      placeholder="Search or enter a Query name…"
                      autocomplete="off"
                      data-testid="new-block-query-input"
                    />
                  </div>
                  @if (FilteredQueryPickerOptions.length > 0) {
                    <div class="mj-docs-saved-view-list">
                      @for (qOpt of FilteredQueryPickerOptions; track qOpt.ID) {
                        <button
                          type="button"
                          class="mj-docs-saved-view-item"
                          [class.mj-docs-saved-view-item--active]="NewBlockQueryName === qOpt.Name"
                          (click)="SelectQueryOption(qOpt)"
                        >
                          <i class="fas fa-database"></i>
                          <div class="mj-docs-saved-view-item__text">
                            <strong>{{ qOpt.Name }}</strong>
                            <span>{{ qOpt.Category || 'Query' }}{{ qOpt.Description ? ' · ' + qOpt.Description : '' }}</span>
                          </div>
                        </button>
                      }
                    </div>
                  }
                </div>
              } @else if (PendingBlockInsertType === 'Artifact' && !PendingBlockIsWhiteboard) {
                @if (AvailableArtifactsForPicker.length > 0) {
                  <div class="mj-docs-field">
                    <span>Pick Existing Artifact</span>
                    <div class="mj-docs-saved-view-list">
                      @for (artOpt of AvailableArtifactsForPicker; track artOpt.ID) {
                        <button
                          type="button"
                          class="mj-docs-saved-view-item"
                          [class.mj-docs-saved-view-item--active]="IsSameUuid(NewBlockArtifactID, artOpt.ID)"
                          (click)="SelectArtifactOption(artOpt)"
                        >
                          <i class="fas fa-cube"></i>
                          <div class="mj-docs-saved-view-item__text">
                            <strong>{{ artOpt.Name }}</strong>
                            <span>{{ artOpt.Type }}</span>
                          </div>
                        </button>
                      }
                    </div>
                  </div>
                }
                <label class="mj-docs-field">
                  <span>Target Artifact ID</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockArtifactID"
                    placeholder="Artifact UUID"
                    data-testid="new-block-artifact-id-input"
                  />
                </label>
                <label class="mj-docs-field">
                  <span>Artifact Type</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockArtifactTypeName"
                    placeholder="e.g., Spreadsheet or Whiteboard"
                  />
                </label>

                @if (IsSpreadsheetArtifactPickerSelected) {
                  <div class="mj-docs-field" data-testid="sheet-embed-guided-picker">
                    <span>Step 2 · What to Embed from Workbook</span>
                    <div class="mj-docs-mode-group" role="radiogroup" aria-label="Spreadsheet Embed Mode">
                      <button
                        type="button"
                        class="mj-docs-mode-btn"
                        [class.mj-docs-mode-btn--active]="NewBlockSheetMode === 'chart'"
                        data-testid="sheet-embed-mode-chart"
                        (click)="SetSheetEmbedMode('chart')"
                      >
                        <i class="fas fa-chart-column"></i> Chart
                      </button>
                      <button
                        type="button"
                        class="mj-docs-mode-btn"
                        [class.mj-docs-mode-btn--active]="NewBlockSheetMode === 'range'"
                        data-testid="sheet-embed-mode-range"
                        (click)="SetSheetEmbedMode('range')"
                      >
                        <i class="fas fa-table-cells"></i> Cell Range
                      </button>
                      <button
                        type="button"
                        class="mj-docs-mode-btn"
                        [class.mj-docs-mode-btn--active]="NewBlockSheetMode === 'full'"
                        data-testid="sheet-embed-mode-full"
                        (click)="SetSheetEmbedMode('full')"
                      >
                        <i class="fas fa-file-excel"></i> Full Workbook
                      </button>
                    </div>
                  </div>

                  @if (SelectedWorkbookSheets.length > 0 && NewBlockSheetMode !== 'full') {
                    <label class="mj-docs-field">
                      <span>Worksheet</span>
                      <select
                        [(ngModel)]="NewBlockSheetName"
                        (ngModelChange)="OnSelectedWorkbookSheetChanged($event)"
                        data-testid="sheet-embed-worksheet-select"
                      >
                        @for (ws of SelectedWorkbookSheets; track ws.SheetID) {
                          <option [value]="ws.SheetID">{{ ws.Name }}</option>
                        }
                      </select>
                    </label>
                  }

                  @if (NewBlockSheetMode === 'chart') {
                    <label class="mj-docs-field">
                      <span>Chart</span>
                      @if (SelectedWorkbookSheetCharts.length > 0) {
                        <select
                          [(ngModel)]="NewBlockSheetChartID"
                          data-testid="sheet-embed-chart-select"
                        >
                          @for (ch of SelectedWorkbookSheetCharts; track ch.ChartID) {
                            <option [value]="ch.ChartID">{{ ch.Title || ch.ChartID }} ({{ ch.ChartType }})</option>
                          }
                        </select>
                      } @else {
                        <input
                          type="text"
                          [(ngModel)]="NewBlockSheetChartID"
                          placeholder="Chart ID (e.g., chart-1)"
                          data-testid="sheet-embed-chart-input"
                        />
                      }
                    </label>
                  } @else if (NewBlockSheetMode === 'range') {
                    <label class="mj-docs-field">
                      <span>Cell Range (e.g., A1:D8)</span>
                      <input
                        type="text"
                        [(ngModel)]="NewBlockSheetRange"
                        placeholder="A1:D8"
                        data-testid="sheet-embed-range-input"
                      />
                    </label>
                  }

                  <div class="mj-docs-field">
                    <span>Step 3 · Version Sync</span>
                    <label class="mj-docs-checkbox-row">
                      <input
                        type="checkbox"
                        [(ngModel)]="NewBlockPinToCurrentVersion"
                        data-testid="sheet-embed-pin-version-checkbox"
                      />
                      <span>
                        Pin to current version
                        @if (SelectedArtifactLatestVersionNumber > 0) {
                          (v{{ SelectedArtifactLatestVersionNumber }})
                        }
                        instead of tracking latest
                      </span>
                    </label>
                  </div>
                }
              }

              <!-- Block Display Title -->
              <label class="mj-docs-field">
                <span>Display Title</span>
                <input type="text" [(ngModel)]="NewBlockLabel" data-testid="new-block-label-input" />
              </label>

              <!-- Progressive Disclosure: Collapsible Advanced Options -->
              <div class="mj-docs-advanced-section">
                <button
                  type="button"
                  class="mj-docs-advanced-toggle"
                  [attr.aria-expanded]="ShowAdvancedBlockOptions"
                  (click)="ShowAdvancedBlockOptions = !ShowAdvancedBlockOptions"
                  data-testid="toggle-advanced-block-options-btn"
                >
                  <span>
                    <i class="fas fa-sliders"></i>
                    Advanced Options (Filter, Pagination, Default Collapse)
                  </span>
                  <i class="fas" [ngClass]="ShowAdvancedBlockOptions ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                </button>

                <div class="mj-docs-advanced-body" [hidden]="!ShowAdvancedBlockOptions">
                  @if (PendingBlockInsertType === 'EntityView') {
                    <label class="mj-docs-field">
                      <span>Extra Filter (Optional SQL WHERE Clause)</span>
                      <input
                        type="text"
                        [(ngModel)]="NewBlockExtraFilter"
                        placeholder="e.g., Name LIKE '%Report%'"
                        autocorrect="off"
                        autocapitalize="off"
                        spellcheck="false"
                        data-testid="new-block-filter-input"
                      />
                    </label>
                  }
                  @if (PendingBlockInsertType === 'EntityView' || PendingBlockInsertType === 'SavedQuery') {
                    <div class="mj-docs-advanced-grid">
                      <label class="mj-docs-field">
                        <span>Display Format</span>
                        <select [(ngModel)]="NewBlockDisplayMode" class="mj-docs-select">
                          <option value="table">Data Table</option>
                          <option value="kpi">KPI Summary Cards</option>
                        </select>
                      </label>
                      <label class="mj-docs-field">
                        <span>Rows Per Page</span>
                        <select [(ngModel)]="NewBlockPageSize" class="mj-docs-select" data-testid="new-block-page-size-select">
                          <option [ngValue]="10">10 rows / page</option>
                          <option [ngValue]="25">25 rows / page</option>
                          <option [ngValue]="50">50 rows / page</option>
                          <option [ngValue]="100">100 rows / page</option>
                        </select>
                      </label>
                    </div>
                  }
                  <label class="mj-docs-modal__checkbox">
                    <input
                      type="checkbox"
                      [(ngModel)]="NewBlockDefaultCollapsed"
                      data-testid="new-block-default-collapsed-checkbox"
                    />
                    <span>
                      Start this block collapsed by default in the document (readers can still expand/collapse for their
                      own session).
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div class="mj-docs-modal__footer">
              <button type="button" class="mj-docs-btn" (click)="CancelBlockInsertModal()">Cancel</button>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--primary"
                data-testid="confirm-insert-block-btn"
                (click)="ConfirmBlockInsertModal()"
              >
                {{ GetInsertConfirmButtonLabel() }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Share & Permissions Modal -->
      @if (ShowPermissionsModal) {
        <div class="mj-docs-modal-backdrop" data-testid="docs-permissions-modal">
          <div class="mj-docs-modal mj-docs-modal--picker" role="dialog" aria-labelledby="docs-permissions-modal-title">
            <div class="mj-docs-modal__header mj-docs-modal__header--with-sub">
              <div>
                <h3 id="docs-permissions-modal-title"><i class="fas fa-user-shield"></i> Share &amp; Document Access</h3>
                <p class="mj-docs-modal__subtitle">
                  Manage who can view, comment on, edit, or share this artifact across MJ Docs, Sheets, and Slides.
                </p>
              </div>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--icon"
                title="Close"
                data-testid="close-permissions-modal-btn"
                (click)="ClosePermissionsModal()"
              >
                <i class="fas fa-xmark"></i>
              </button>
            </div>

            <div class="mj-docs-modal__body">
              <div class="mj-docs-perm-summary">
                <div>
                  <strong>Your Effective Access:</strong>
                  <span class="mj-docs-badge mj-docs-badge--brand">{{ CurrentUserEffectiveRoleLabel }}</span>
                </div>
                <span class="mj-docs-picker-muted">
                  Live Views &amp; Queries inside this document always enforce each viewer's own entity permissions.
                </span>
              </div>

              @if (CanUserShareArtifact) {
                <div class="mj-docs-perm-grant-box" data-testid="grant-permission-form">
                  <div class="mj-docs-field" style="flex: 1;">
                    <span>Grant Access to User</span>
                    <input
                      type="text"
                      class="mj-docs-picker-combobox__input"
                      placeholder="Search users by name or email…"
                      [(ngModel)]="PermissionUserSearchQuery"
                      (ngModelChange)="OnPermissionUserSearchChange($event)"
                      data-testid="perm-user-search-input"
                    />
                    <select [(ngModel)]="SelectedPermissionUserID" class="mj-docs-select" data-testid="perm-user-select">
                      <option value="">Select a user…</option>
                      @for (u of AvailableUsersForSharing; track u.ID) {
                        <option [value]="u.ID">{{ u.Name }} ({{ u.Email }})</option>
                      }
                    </select>
                  </div>
                  <div class="mj-docs-field">
                    <span>Role</span>
                    <select [(ngModel)]="SelectedPermissionLevel" class="mj-docs-select" data-testid="perm-level-select">
                      <option value="Read">Viewer (Read &amp; Comment)</option>
                      <option value="Edit">Editor (Write &amp; Suggest)</option>
                      <option value="Share">Co-Owner (Edit &amp; Share)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    class="mj-docs-btn mj-docs-btn--primary"
                    [disabled]="!SelectedPermissionUserID || IsSavingPermission"
                    data-testid="grant-permission-btn"
                    (click)="GrantArtifactPermission()"
                  >
                    <i class="fas fa-user-plus"></i> Share
                  </button>
                </div>
              }

              <div class="mj-docs-field">
                <span>People with Access ({{ ArtifactPermissionEntries.length }})</span>
                <div class="mj-docs-saved-view-list">
                  @for (perm of ArtifactPermissionEntries; track perm.ID) {
                    <div class="mj-docs-saved-view-item" [attr.data-testid]="'perm-entry-' + perm.UserID">
                      <i class="fas" [ngClass]="perm.IsOwner ? 'fa-crown' : 'fa-user-check'"></i>
                      <div class="mj-docs-saved-view-item__text">
                        <strong>{{ perm.UserName }}</strong>
                        <span>{{ perm.UserEmail || 'Workspace Member' }}</span>
                      </div>
                      <span class="mj-docs-badge" [class.mj-docs-badge--brand]="perm.IsOwner || perm.CanEdit">
                        {{ perm.IsOwner ? 'Owner' : perm.CanShare ? 'Co-Owner' : perm.CanEdit ? 'Editor' : 'Viewer' }}
                      </span>
                      @if (CanUserShareArtifact && !perm.IsOwner) {
                        <button
                          type="button"
                          class="mj-docs-btn mj-docs-btn--icon"
                          title="Revoke access"
                          [attr.data-testid]="'revoke-perm-btn-' + perm.UserID"
                          (click)="RevokeArtifactPermission(perm)"
                        >
                          <i class="fas fa-trash-can"></i>
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="mj-docs-modal__footer">
              <button type="button" class="mj-docs-btn mj-docs-btn--primary" (click)="ClosePermissionsModal()">
                Done
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .mj-docs-workspace {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mj-bg-page);
        color: var(--mj-text-primary);
        position: relative;
        overflow: hidden;
      }

      .mj-docs-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-toolbar__left,
      .mj-docs-toolbar__right {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-docs-mode-group,
      .mj-docs-format-group,
      .mj-docs-undo-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
      }

      .mj-docs-btn--icon-only {
        padding: 5px 8px;
      }

      .mj-docs-btn:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      .mj-docs-mode-btn,
      .mj-docs-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 500;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .mj-docs-mode-btn {
        border-color: transparent;
      }

      .mj-docs-mode-btn:hover:not(:disabled),
      .mj-docs-btn:hover:not(:disabled) {
        background: var(--mj-bg-surface-hover);
      }

      .mj-docs-mode-btn--active,
      .mj-docs-btn--active,
      .mj-docs-btn--primary {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-btn--accent {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
      }

      .mj-docs-btn--saved-quiet {
        background: transparent;
        border-color: transparent;
        color: var(--mj-text-muted);
      }

      .mj-docs-btn--saved-quiet:hover:not(:disabled) {
        background: var(--mj-bg-surface-hover);
        border-color: var(--mj-border-default);
        color: var(--mj-text-primary);
      }

      .mj-docs-active-mode-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 8px 0 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 40%, var(--mj-border-default));
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
        color: var(--mj-text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, border-color 0.12s ease;
      }

      .mj-docs-active-mode-chip:hover {
        background: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-active-mode-chip--active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
      }

      .mj-docs-active-mode-chip__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        opacity: 0.7;
      }

      .mj-docs-active-mode-chip:hover .mj-docs-active-mode-chip__close {
        opacity: 1;
      }

      .mj-docs-mode-btn:disabled,
      .mj-docs-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .mj-docs-presence-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        font-size: 11px;
        border-radius: 999px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        color: var(--mj-text-secondary);
      }

      .mj-docs-presence-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--mj-status-success);
      }

      .mj-docs-presence-pill--readonly .mj-docs-presence-dot {
        background: var(--mj-status-warning);
      }

      .mj-docs-presence-pill--error {
        background: var(--mj-status-error-bg);
        border-color: var(--mj-status-error-border);
        color: var(--mj-status-error-text);
      }

      .mj-docs-presence-pill--error .mj-docs-presence-dot {
        background: var(--mj-status-error);
      }

      .mj-docs-collab-retry-btn {
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

      .mj-docs-collab-retry-btn:hover {
        background: var(--mj-bg-surface-hover);
      }

      .mj-docs-avatar-stack {
        display: inline-flex;
        gap: 3px;
      }

      .mj-docs-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 10px;
        font-weight: 700;
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
      }

      .mj-docs-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 999px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        border: 1px solid var(--mj-border-default);
      }

      .mj-docs-badge--brand {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-badge--live {
        color: var(--mj-status-success);
        border-color: var(--mj-status-success);
      }

      .mj-docs-badge--frozen {
        color: var(--mj-status-warning);
        border-color: var(--mj-status-warning);
      }

      .mj-docs-slash-popover {
        position: absolute;
        top: 52px;
        left: 160px;
        z-index: 40;
        width: 440px;
        max-height: 380px;
        display: flex;
        flex-direction: column;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-strong);
        border-radius: 8px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        overflow: hidden;
      }

      .mj-docs-slash-popover__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-slash-input {
        flex: 1;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 12px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-docs-slash-popover__list {
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-docs-slash-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        color: var(--mj-text-primary);
      }

      .mj-docs-slash-item:hover,
      .mj-docs-slash-item--active {
        background: var(--mj-bg-surface-hover);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-slash-item__icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--mj-bg-surface-card);
        color: var(--mj-brand-primary);
      }

      .mj-docs-slash-item__body {
        flex: 1;
        min-width: 0;
      }

      .mj-docs-slash-item__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
      }

      .mj-docs-slash-item__desc {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-slash-item__cat {
        font-size: 10px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-docs-status-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 14px;
        font-size: 12px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-primary);
      }

      .mj-docs-status-banner--readonly {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      .mj-docs-status-banner--warning {
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
        border-bottom-color: var(--mj-status-warning-border);
      }

      .mj-docs-body {
        flex: 1;
        min-height: 0;
        display: flex;
        overflow: hidden;
      }

      .mj-docs-outline-rail {
        width: 250px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background: var(--mj-bg-surface-card);
        border-right: 1px solid var(--mj-border-default);
        overflow-y: auto;
      }

      .mj-docs-outline-rail__header {
        padding: 12px;
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-outline-rail__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      .mj-docs-outline-rail__header h4 {
        margin: 0;
        font-size: 13px;
      }

      .mj-docs-rail-close-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 4px;
        background: transparent;
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-docs-rail-close-btn:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }

      .mj-docs-outline-stats {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-outline-empty {
        padding: 16px 12px;
        font-size: 12px;
        color: var(--mj-text-muted);
      }

      .mj-docs-outline-list {
        list-style: none;
        margin: 0;
        padding: 8px 0;
        flex: 1;
        overflow-y: auto;
      }

      .mj-docs-outline-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        color: var(--mj-text-secondary);
      }

      .mj-docs-outline-item:hover,
      .mj-docs-outline-item--active {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
        font-weight: 600;
      }

      .mj-docs-outline-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mj-docs-outline-rail__footer {
        padding: 10px 12px;
        border-top: 1px solid var(--mj-border-default);
        font-size: 11px;
        color: var(--mj-text-muted);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-docs-canvas {
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        background: var(--mj-bg-page);
      }

      .mj-docs-source-container {
        width: 100%;
        height: 100%;
      }

      .mj-docs-page {
        max-width: 920px;
        margin: 20px auto;
        padding: 28px 36px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      }

      .mj-docs-suggest-banner {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        padding: 8px 12px;
        font-size: 12px;
        border: 1px solid var(--mj-brand-primary);
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-primary);
      }

      .mj-docs-editable-surface {
        outline: none;
        border-radius: 4px;
        transition: background 0.12s ease;
        min-height: 22px;
      }

      .mj-docs-editable-surface:empty::before {
        content: attr(data-placeholder);
        color: var(--mj-text-muted);
        pointer-events: none;
        font-weight: 400;
      }

      .mj-docs-editable-surface:focus {
        background: var(--mj-bg-surface-hover);
        box-shadow: 0 0 0 1px var(--mj-brand-primary);
      }

      .mj-docs-editable-surface strong,
      .mj-docs-editable-surface b {
        font-weight: 700;
      }

      .mj-docs-editable-surface em,
      .mj-docs-editable-surface i {
        font-style: italic;
      }

      .mj-docs-editable-surface code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
      }

      .mj-docs-trailing-flow-zone {
        margin-top: 14px;
        padding: 12px 14px;
        border: 1px dashed var(--mj-border-default);
        border-radius: 8px;
        color: var(--mj-text-muted);
        font-size: 12px;
        cursor: text;
        transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
      }

      .mj-docs-trailing-flow-zone:hover,
      .mj-docs-trailing-flow-zone:focus {
        outline: none;
        border-color: var(--mj-brand-primary);
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-secondary);
      }

      .mj-docs-trailing-flow-zone__hint {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .mj-docs-editable-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
      }

      .mj-docs-heading-level-pill {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 700;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-docs-editable-heading__text {
        flex: 1;
        font-weight: 700;
        color: var(--mj-text-primary);
        padding: 2px 6px;
      }

      .mj-docs-editable-heading--h1 .mj-docs-editable-heading__text {
        font-size: 24px;
        line-height: 1.25;
      }

      .mj-docs-editable-heading--h2 .mj-docs-editable-heading__text {
        font-size: 19px;
        line-height: 1.3;
      }

      .mj-docs-editable-heading--h3 .mj-docs-editable-heading__text {
        font-size: 16px;
        line-height: 1.35;
      }

      .mj-docs-editable-paragraph {
        font-size: 14px;
        line-height: 1.65;
        padding: 4px 6px;
        white-space: pre-wrap;
        color: var(--mj-text-primary);
      }

      .mj-docs-editable-table-wrap {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface);
      }

      .mj-docs-editable-table__toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-secondary);
      }

      .mj-docs-editable-table__actions {
        display: flex;
        gap: 6px;
      }

      .mj-docs-editable-table th[contenteditable='true']:focus,
      .mj-docs-editable-table td[contenteditable='true']:focus {
        outline: 1px solid var(--mj-brand-primary);
        background: var(--mj-bg-surface-hover);
      }

      .mj-docs-editable-list-wrap {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-docs-editable-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-docs-editable-list__item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }

      .mj-docs-task-checkbox {
        width: 15px;
        height: 15px;
        cursor: pointer;
      }

      .mj-docs-list-bullet {
        font-weight: 700;
        color: var(--mj-text-secondary);
        min-width: 16px;
      }

      .mj-docs-editable-list__text {
        flex: 1;
        padding: 2px 6px;
      }

      .mj-docs-editable-list__text--checked {
        text-decoration: line-through;
        color: var(--mj-text-muted);
      }

      .mj-docs-list-add-btn {
        align-self: flex-start;
      }

      .mj-docs-editable-callout {
        border: 1px solid var(--mj-border-default);
        border-left: 4px solid var(--mj-brand-primary);
        border-radius: 8px;
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-editable-callout__header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        color: var(--mj-brand-primary);
      }

      .mj-docs-editable-callout__body {
        font-size: 13px;
        line-height: 1.55;
        padding: 2px 4px;
        white-space: pre-wrap;
      }

      .mj-docs-editable-code {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-editable-code__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        font-size: 11px;
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-code-lang-input {
        padding: 2px 6px;
        font-size: 11px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-docs-editable-code__pre {
        margin: 0;
        padding: 10px 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .mj-docs-ole-block--expanded {
        position: fixed;
        inset: 24px;
        z-index: 80;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.35);
      }

      .mj-docs-segments {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-docs-page--simple .mj-docs-segments {
        gap: 2px;
      }

      .mj-docs-segment {
        position: relative;
        display: flex;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid transparent;
        border-radius: 8px;
      }

      .mj-docs-segment--simple {
        padding: 2px 4px;
        border-radius: 4px;
        gap: 0;
      }

      .mj-docs-page--blocks .mj-docs-segment:hover,
      .mj-docs-page--blocks .mj-docs-segment--selected {
        border-color: var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-page--simple .mj-docs-editable-surface:focus {
        background: transparent;
        box-shadow: none;
      }

      .mj-docs-simple-plus-btn {
        position: absolute;
        left: -26px;
        top: 4px;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        color: var(--mj-text-muted);
        font-size: 15px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.14s ease, background 0.14s ease, color 0.14s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .mj-docs-segment:hover .mj-docs-simple-plus-btn,
      .mj-docs-segment:focus-within .mj-docs-simple-plus-btn {
        opacity: 0.7;
      }

      .mj-docs-simple-plus-btn:hover {
        opacity: 1 !important;
        background: var(--mj-bg-surface-hover);
        border-color: var(--mj-border-default);
        color: var(--mj-brand-primary);
      }

      .mj-docs-segment__gutter {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 4px;
        opacity: 0;
        transition: opacity 0.14s ease;
      }

      .mj-docs-segment:hover .mj-docs-segment__gutter,
      .mj-docs-segment:focus-within .mj-docs-segment__gutter,
      .mj-docs-segment--selected .mj-docs-segment__gutter {
        opacity: 1;
      }

      .mj-docs-handle-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 4px 6px;
        font-size: 11px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-muted);
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        cursor: pointer;
      }

      .mj-docs-handle-btn:hover {
        color: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-segment__body {
        flex: 1;
        min-width: 0;
      }

      .mj-docs-live-block,
      .mj-docs-ole-block {
        margin: 8px 0;
        border: 1px solid var(--mj-border-strong);
        border-radius: 8px;
        background: var(--mj-bg-surface);
        overflow: hidden;
      }

      .mj-docs-ole-block--editing {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
      }

      .mj-docs-live-block__header,
      .mj-docs-ole-block__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-live-block__title,
      .mj-docs-ole-block__title,
      .mj-docs-live-block__actions,
      .mj-docs-ole-block__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }

      .mj-docs-live-block__provenance,
      .mj-docs-live-block__security-note {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        font-size: 11px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-secondary);
      }

      .mj-docs-live-block__body {
        padding: 12px;
        overflow-x: auto;
      }

      .mj-docs-ole-block__viewport {
        width: 100%;
        min-height: 320px;
        display: flex;
        flex-direction: column;
      }

      .mj-docs-data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .mj-docs-data-table th,
      .mj-docs-data-table td {
        border: 1px solid var(--mj-border-default);
        padding: 6px 10px;
        text-align: left;
      }

      .mj-docs-data-table th {
        background: var(--mj-bg-surface-card);
        font-weight: 600;
      }

      .mj-docs-live-block__footer {
        margin-top: 8px;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-suggestion-card {
        margin-top: 8px;
        padding: 10px 12px;
        border: 1px solid var(--mj-brand-primary);
        border-radius: 6px;
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-suggestion-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        margin-bottom: 8px;
      }

      .mj-docs-suggestion-card__author {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--mj-text-primary);
      }

      .mj-docs-suggestion-card__author i {
        color: var(--mj-brand-primary);
      }

      .mj-docs-suggestion-card__badge {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
      }

      .mj-docs-suggestion-card__time {
        color: var(--mj-text-muted);
        font-size: 11px;
      }

      .mj-docs-inline-redline {
        font-size: 13px;
        line-height: 1.65;
        padding: 8px 10px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        margin-bottom: 8px;
        color: var(--mj-text-primary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .mj-docs-redline-eq {
        color: var(--mj-text-secondary);
      }

      .mj-docs-redline-del {
        color: var(--mj-status-error);
        background: color-mix(in srgb, var(--mj-status-error) 14%, transparent);
        text-decoration: line-through;
        padding: 1px 3px;
        border-radius: 3px;
        font-weight: 500;
      }

      .mj-docs-redline-ins {
        color: var(--mj-status-success);
        background: color-mix(in srgb, var(--mj-status-success) 15%, transparent);
        text-decoration: underline;
        text-underline-offset: 2px;
        padding: 1px 3px;
        border-radius: 3px;
        font-weight: 600;
      }

      .mj-docs-hunk-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
      }

      .mj-docs-hunk-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 5px;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-subtle);
        font-size: 12px;
      }

      .mj-docs-hunk-item__summary {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        color: var(--mj-text-secondary);
      }

      .mj-docs-hunk-item__actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .mj-docs-suggestion-card__diff {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        padding: 6px;
        background: var(--mj-bg-surface);
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .mj-docs-suggestion-card__old {
        color: var(--mj-status-error);
        text-decoration: line-through;
      }

      .mj-docs-suggestion-card__new {
        color: var(--mj-status-success);
      }

      .mj-docs-suggestion-card__actions {
        display: flex;
        gap: 8px;
      }

      .mj-docs-diff-view {
        padding: 20px;
      }

      .mj-docs-diff-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        padding: 10px 14px;
        margin-bottom: 12px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
      }

      .mj-docs-diff-toolbar__selectors,
      .mj-docs-diff-stats {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
      }

      .mj-docs-diff-stat--add {
        color: var(--mj-status-success);
        font-weight: 600;
      }

      .mj-docs-diff-stat--del {
        color: var(--mj-status-error);
        font-weight: 600;
      }

      .mj-docs-diff-lines {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }

      .mj-docs-diff-line {
        display: flex;
        align-items: stretch;
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-diff-line--added {
        background: color-mix(in srgb, var(--mj-status-success) 14%, var(--mj-bg-surface));
      }

      .mj-docs-diff-line--removed {
        background: color-mix(in srgb, var(--mj-status-error) 14%, var(--mj-bg-surface));
      }

      .mj-docs-diff-gutter {
        width: 38px;
        padding: 3px 6px;
        text-align: right;
        color: var(--mj-text-muted);
        border-right: 1px solid var(--mj-border-default);
        user-select: none;
      }

      .mj-docs-diff-prefix {
        width: 20px;
        padding: 3px 4px;
        text-align: center;
        font-weight: 700;
      }

      .mj-docs-diff-code {
        margin: 0;
        padding: 3px 8px;
        white-space: pre-wrap;
        word-break: break-word;
        flex: 1;
      }

      .mj-docs-comments-drawer {
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background: var(--mj-bg-surface-card);
        border-left: 1px solid var(--mj-border-default);
        overflow-y: auto;
      }

      .mj-docs-comments-drawer__header {
        padding: 12px;
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-comments-drawer__header h4 {
        margin: 0 0 8px 0;
        font-size: 13px;
      }

      .mj-docs-comments-filter {
        display: flex;
        gap: 4px;
      }

      .mj-docs-filter-pill {
        padding: 3px 8px;
        font-size: 11px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
      }

      .mj-docs-filter-pill--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-comment-composer {
        padding: 12px;
        border-bottom: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mj-docs-comment-composer__anchor {
        font-size: 11px;
        color: var(--mj-text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mj-docs-comment-composer__quote {
        margin: 0;
        padding: 4px 8px;
        font-size: 11px;
        font-style: italic;
        border-left: 3px solid var(--mj-brand-primary);
        background: var(--mj-bg-surface);
        color: var(--mj-text-muted);
      }

      .mj-docs-comment-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        font-size: 12px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-docs-comment-composer__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .mj-docs-agent-mode-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--mj-text-secondary);
      }

      .mj-docs-threads-list {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
        overflow-y: auto;
      }

      .mj-docs-threads-empty {
        font-size: 12px;
        color: var(--mj-text-muted);
        text-align: center;
        padding: 20px 8px;
      }

      .mj-docs-thread-card {
        padding: 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface);
      }

      .mj-docs-thread-card--resolved {
        opacity: 0.65;
      }

      .mj-docs-thread-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        font-size: 11px;
      }

      .mj-docs-thread-anchor {
        font-weight: 600;
        color: var(--mj-brand-primary);
        cursor: pointer;
      }

      .mj-docs-thread-card__quote {
        font-size: 11px;
        font-style: italic;
        color: var(--mj-text-muted);
        margin-bottom: 6px;
      }

      .mj-docs-thread-messages {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mj-docs-thread-msg {
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface-card);
        font-size: 12px;
      }

      .mj-docs-thread-msg--agent {
        border-left: 3px solid var(--mj-brand-primary);
      }

      .mj-docs-thread-msg__meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        margin-bottom: 2px;
      }

      .mj-docs-modal-backdrop {
        position: absolute;
        inset: 0;
        z-index: 60;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .mj-docs-modal {
        width: 100%;
        max-width: 520px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-strong);
        border-radius: 10px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
        overflow: hidden;
      }

      .mj-docs-modal__header {
        padding: 14px 18px;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-modal__header h3 {
        margin: 0;
        font-size: 15px;
      }

      .mj-docs-modal__body {
        padding: 16px 18px;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mj-docs-modal__warning-box {
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid var(--mj-status-warning);
        background: var(--mj-bg-surface-card);
        font-size: 12px;
        line-height: 1.5;
      }

      .mj-docs-modal__checkbox {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12px;
        cursor: pointer;
      }

      .mj-docs-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
      }

      .mj-docs-field input,
      .mj-docs-select {
        padding: 7px 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 13px;
      }

      .mj-docs-modal--picker {
        max-width: 580px;
        overflow: visible;
      }

      .mj-docs-modal__header--with-sub {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .mj-docs-modal__subtitle {
        margin: 4px 0 0 0;
        font-size: 12px;
        color: var(--mj-text-muted);
      }

      .mj-docs-field__label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .mj-docs-picker-field {
        position: relative;
      }

      .mj-docs-picker-selected-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
      }

      .mj-docs-picker-combobox {
        position: relative;
        display: flex;
        align-items: center;
        border: 1px solid var(--mj-border-strong);
        border-radius: 8px;
        background: var(--mj-bg-surface);
        transition: border-color 0.14s ease, box-shadow 0.14s ease;
      }

      .mj-docs-picker-combobox:focus-within {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 22%, transparent);
      }

      .mj-docs-picker-combobox__search-icon {
        padding-left: 11px;
        color: var(--mj-text-muted);
        font-size: 12px;
      }

      .mj-docs-picker-combobox__input {
        flex: 1;
        border: none !important;
        background: transparent !important;
        padding: 8px 10px !important;
        font-size: 13px;
        color: var(--mj-text-primary);
        outline: none;
      }

      .mj-docs-picker-combobox__clear,
      .mj-docs-picker-combobox__chevron {
        border: none;
        background: transparent;
        color: var(--mj-text-muted);
        padding: 6px 9px;
        cursor: pointer;
        font-size: 12px;
      }

      .mj-docs-picker-combobox__clear:hover,
      .mj-docs-picker-combobox__chevron:hover {
        color: var(--mj-text-primary);
      }

      .mj-docs-picker-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 95;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-strong);
        border-radius: 8px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
        overflow: hidden;
      }

      .mj-docs-picker-dropdown__meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        font-size: 11px;
        color: var(--mj-text-muted);
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-picker-dropdown__list {
        max-height: 220px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .mj-docs-picker-dropdown__empty {
        padding: 14px;
        text-align: center;
        font-size: 12px;
        color: var(--mj-text-muted);
      }

      .mj-docs-picker-option {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 12px;
        border: none;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        text-align: left;
        cursor: pointer;
      }

      .mj-docs-picker-option:hover,
      .mj-docs-picker-option--active {
        background: var(--mj-bg-surface-hover);
      }

      .mj-docs-picker-option__icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--mj-bg-surface-card);
        color: var(--mj-brand-primary);
        font-size: 13px;
        flex-shrink: 0;
      }

      .mj-docs-picker-option__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mj-docs-picker-option__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }

      .mj-docs-picker-option__sub {
        font-size: 11px;
        color: var(--mj-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-docs-picker-option__check {
        color: var(--mj-brand-primary);
        font-size: 13px;
      }

      .mj-docs-view-mode-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .mj-docs-view-mode-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        text-align: left;
        cursor: pointer;
        transition: border-color 0.14s ease, background 0.14s ease;
      }

      .mj-docs-view-mode-card:hover {
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-view-mode-card--active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-docs-view-mode-card__top {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }

      .mj-docs-view-mode-card__desc {
        font-size: 11px;
        color: var(--mj-text-muted);
        line-height: 1.35;
      }

      .mj-docs-saved-view-picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 6px;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-saved-view-list {
        max-height: 150px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-docs-saved-view-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        text-align: left;
        cursor: pointer;
      }

      .mj-docs-saved-view-item:hover,
      .mj-docs-saved-view-item--active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-docs-saved-view-item__text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .mj-docs-saved-view-item__text strong {
        font-size: 12px;
      }

      .mj-docs-saved-view-item__text span {
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-saved-view-empty {
        font-size: 12px;
        color: var(--mj-text-muted);
        padding: 6px 4px;
      }

      .mj-docs-advanced-section {
        border-top: 1px solid var(--mj-border-default);
        padding-top: 8px;
      }

      .mj-docs-advanced-toggle {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 4px;
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .mj-docs-advanced-toggle:hover {
        color: var(--mj-brand-primary);
      }

      .mj-docs-advanced-body {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mj-docs-advanced-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .mj-docs-format-ribbon {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 6px 12px;
        background: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
      }

      .mj-docs-format-ribbon[hidden] {
        display: none !important;
      }

      .mj-docs-pin-ribbon-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 24px;
        padding: 0 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }

      .mj-docs-pin-ribbon-btn:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }

      .mj-docs-pin-ribbon-btn--active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
      }

      .mj-docs-ribbon-hint {
        margin-left: auto;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-docs-ribbon-hint kbd {
        padding: 1px 5px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface-card);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
      }

      .mj-docs-more-menu-wrap {
        position: relative;
      }

      .mj-docs-more-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 85;
        width: 276px;
        max-height: 70vh;
        overflow-y: auto;
        padding: 6px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-strong);
        border-radius: 8px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mj-docs-more-menu[hidden] {
        display: none !important;
      }

      .mj-docs-more-menu__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 8px 6px 8px;
        border-bottom: 1px solid var(--mj-border-default);
        margin-bottom: 4px;
      }

      .mj-docs-more-menu__title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-secondary);
      }

      .mj-docs-menu-reset-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        font-size: 11px;
        font-weight: 500;
        color: var(--mj-text-muted);
        background: transparent;
        border: 1px solid var(--mj-border-default);
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }

      .mj-docs-menu-reset-btn:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
        border-color: var(--mj-border-strong);
      }

      .mj-docs-more-menu__section,
      .mj-docs-more-menu__section-title {
        padding: 6px 8px 2px 8px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-muted);
      }

      .mj-docs-menu-row {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 6px;
      }

      .mj-docs-menu-row:hover {
        background: var(--mj-bg-surface-hover);
      }

      .mj-docs-more-menu__item {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        font-size: 12px;
        color: var(--mj-text-primary);
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
      }

      .mj-docs-more-menu__item:hover:not(:disabled),
      .mj-docs-more-menu__item--active {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-brand-primary);
      }

      .mj-docs-more-menu__item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .mj-docs-more-menu__item-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mj-docs-menu-pin {
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--mj-text-muted);
        font-size: 11px;
        cursor: pointer;
        opacity: 0.55;
        transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
      }

      .mj-docs-menu-row:hover .mj-docs-menu-pin,
      .mj-docs-menu-pin.pinned {
        opacity: 1;
      }

      .mj-docs-menu-pin:hover:not([aria-disabled='true']) {
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-primary);
      }

      .mj-docs-menu-pin.pinned {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
      }

      .mj-docs-menu-pin.over-cap {
        opacity: 0.45;
      }

      .mj-docs-menu-pin[aria-disabled='true'] {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .mj-docs-more-menu__divider {
        height: 1px;
        margin: 4px 0;
        background: var(--mj-border-default);
      }

      .mj-docs-collapse-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        font-size: 10px;
        cursor: pointer;
      }

      .mj-docs-collapse-btn:hover {
        color: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
      }

      .mj-docs-collapsed-section-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 600;
        border: 1px dashed var(--mj-border-strong);
        border-radius: 999px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-brand-primary);
        cursor: pointer;
      }

      .mj-docs-table-scroll-viewport {
        max-height: 340px;
        overflow-y: auto;
        overflow-x: auto;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
      }

      .mj-docs-data-table--sticky thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--mj-bg-surface-card);
        box-shadow: 0 1px 0 var(--mj-border-default);
      }

      .mj-docs-col-hdr {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .mj-docs-col-hdr__icon {
        font-size: 10px;
        color: var(--mj-brand-primary);
      }

      .mj-docs-record-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--mj-brand-primary);
        text-decoration: none;
        font-weight: 500;
        cursor: pointer;
      }

      .mj-docs-record-link:hover {
        text-decoration: underline;
      }

      .mj-docs-record-link i {
        font-size: 10px;
        opacity: 0.8;
      }

      .mj-docs-pager {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
        padding-top: 6px;
      }

      .mj-docs-pager__controls {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .mj-docs-pager__size {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
      }

      .mj-docs-pager__size select {
        padding: 2px 6px;
        font-size: 11px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }

      .mj-docs-pager__page-num {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }

      .mj-docs-perm-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
        font-size: 12px;
      }

      .mj-docs-perm-grant-box {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 18px;
        border-top: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'MarkdownArtifactViewerPlugin')
export class MarkdownArtifactViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, OnChanges, OnDestroy
{
  @ViewChild('fileImportInput') public FileImportInput?: ElementRef<HTMLInputElement>;
  @ViewChild('printableCanvas') public PrintableCanvas?: ElementRef<HTMLElement>;
  @ViewChild('moreMenuWrap') public MoreMenuWrap?: ElementRef<HTMLElement>;

  /**
   * Emitted when a user clicks a primary key, record name, or foreign key link inside an embedded Live View or Query block.
   * Picked up by `ArtifactTypePluginViewerComponent` and bubbled up to MJ Explorer to open the target entity record.
   */
  @Output() public OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
  @Output() public ToolbarPinChanged = new EventEmitter<{ Key: DocsToolbarItemKey; Pinned: boolean }>();
  /** @deprecated Use {@link OpenEntityRecord}. */
  @Output() public openEntityRecord = this.OpenEntityRecord;

  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input() public CollaborationWsUrl: string | null = null;

  /** @deprecated Use {@link CollaborationWsUrl}. */
  @Input()
  public get collaborationWsUrl(): string | null {
    return this.CollaborationWsUrl;
  }
  /** @deprecated Use {@link CollaborationWsUrl}. */
  public set collaborationWsUrl(value: string | null) {
    this.CollaborationWsUrl = value;
  }

  private readonly collabService = inject(DocumentCollaborationService);
  private readonly importExportService = inject(DocumentImportExportService);
  private readonly notificationService = inject(MJNotificationService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly renderer = inject(Renderer2, { optional: true });

  public MarkdownContent = '';
  private initialLoadedMarkdown = '';

  /** @deprecated Use {@link MarkdownContent}. */
  public get markdownContent(): string {
    return this.MarkdownContent;
  }
  /** @deprecated Use {@link MarkdownContent}. */
  public set markdownContent(value: string) {
    this.MarkdownContent = value;
  }

  public ViewMode: DocsViewerMode = 'preview';
  private userExplicitlySelectedMode = false;
  public EditingStyle: DocsEditingStyle = 'simple';
  private lastFocusedSegmentId: string | null = null;
  private lastFocusedListItemIndex: number | null = null;
  private lastFocusedTableCell: { rowIndex: number; colIndex: number; isHeader: boolean } | null = null;
  private lastSelectionSnapshot: DocsSelectionSnapshot | null = null;

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): DocsViewerMode {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: DocsViewerMode) {
    this.ViewMode = value;
  }

  public ShowOutlineRail = true;
  public ShowCommentsDrawer = false;
  public ShowFormattingRibbon = false;
  public ShowMoreToolsMenu = false;
  public FormattingRibbonPinned = false;
  public readonly MaxPinnedToolbarActions = 6;
  public readonly ToolbarMenuCategories: ReadonlyArray<{
    Key: ResolvedDocsToolbarItem['Category'];
    Title: string;
  }> = [
    { Key: 'writing', Title: 'Writing & Formatting' },
    { Key: 'view', Title: 'Mode & Layout' },
    { Key: 'collab', Title: 'Collaboration & Access' },
    { Key: 'io', Title: 'Import & Export' },
  ];

  private _toolbarPinsRaw: string | null = null;
  private _toolbarPinsParsed: DocsToolbarItemKey[] | null = null;
  private _localToolbarPins: DocsToolbarItemKey[] | null = null;
  private _serverToolbarPinsRaw: string | null = null;
  private _toolbarVisibilityRaw: string | null = null;
  private _toolbarVisibilityParsed: DocsToolbarVisibilitySetting | null = null;
  private _localToolbarVisibility: DocsToolbarVisibilitySetting | null = null;
  private _serverToolbarVisibilityRaw: string | null = null;
  private _unlistenMoreMenuDocs: Array<() => void> = [];
  public ShowPermissionsModal = false;
  public ShowSlashMenu = false;
  public SlashSearchQuery = '';
  public SlashMenuHighlightIndex = 0;
  public ActiveSlashTargetSegmentID: string | null = null;
  public ExpandedOleBlockID: string | null = null;
  public StatusBannerMessage = '';
  public IsSavingVersion = false;
  private draftSegmentCounter = 0;
  private isApplyingBlockTransaction = false;

  // Parsed state
  public DocumentSegments: DocumentRenderSegment[] = [];
  public OutlineItems: DocumentOutlineItem[] = [];
  public WordStats = { Words: 0, Characters: 0, Lines: 0, LiveBlocks: 0, EmbeddedArtifacts: 0 };

  // Real-time Yjs session state
  private session: DocumentCollaborationSession | null = null;
  private liveSyncUnavailable = false;
  private sessionSubs: Subscription[] = [];
  private permissionUnsub: (() => void) | null = null;
  private sessionInitGeneration = 0;
  private isComponentDestroyed = false;
  public CollaborationStatus: CollaborationConnectionStatus = 'local';
  public Collaborators: CollaboratorPresence[] = [];
  public HasEditPermission = false;
  public CanUserShareArtifact = false;
  public CurrentUserEffectiveRoleLabel = 'Viewer';

  // Share & Permissions Modal State
  public ArtifactPermissionEntries: DocsPermissionEntry[] = [];
  public AvailableUsersForSharing: Array<{ ID: string; Name: string; Email: string }> = [];
  public PermissionUserSearchQuery = '';
  public SelectedPermissionUserID = '';
  public SelectedPermissionLevel: 'Read' | 'Edit' | 'Share' = 'Edit';
  public IsSavingPermission = false;

  // Live block execution cache, pagination, collapse overrides & inline editing state
  private blockResults = new Map<string, DocumentBlockExecutionResult>();
  private blockPageNumbers = new Map<string, number>();
  private blockPageSizes = new Map<string, number>();
  private userCollapsedBlockOverrides = new Map<string, boolean>();
  private collapsedHeadingIds = new Set<string>();
  private embeddedArtifactVersions = new Map<string, MJArtifactVersionEntity>();
  private latestArtifactVersions = new Map<string, MJArtifactVersionEntity>();
  private inFlightEmbeddedVersionKeys = new Set<string>();
  private failedEmbeddedVersionMessages = new Map<string, string>();
  private inlineEditingBlockIds = new Set<string>();

  // Freeze Warning Modal (O5)
  public PendingFreezeBlock: DocumentBlockSpec | null = null;
  public FreezeWarningAcknowledged = false;

  // Insert / Configure Block Modal & Linked Entity/View/Query/Artifact Pickers
  public PendingBlockInsertType: DocumentBlockKind | null = null;
  public PendingBlockIsWhiteboard = false;
  public EditingBlockID: string | null = null;
  public NewBlockLabel = '';
  public NewBlockEntityName = 'MJ: Artifacts';
  public NewBlockViewSelectionMode: 'default' | 'saved' = 'default';
  public NewBlockViewID = '';
  public NewBlockViewName = '';
  public NewBlockExtraFilter = '';
  public NewBlockDisplayMode: 'table' | 'kpi' = 'table';
  public NewBlockMaxRows = 50;
  public NewBlockPageSize = 10;
  public NewBlockDefaultCollapsed = false;
  public NewBlockQueryName = '';
  public NewBlockArtifactID = '';
  public NewBlockArtifactTypeName = 'Whiteboard';
  public NewBlockSheetMode: 'full' | 'chart' | 'range' = 'full';
  public NewBlockSheetName = '';
  public NewBlockSheetChartID = '';
  public NewBlockSheetRange = 'A1:D8';
  public NewBlockPinToCurrentVersion = false;
  public SelectedWorkbookSheets: WorksheetSpec[] = [];
  public SelectedArtifactLatestVersionID = '';
  public SelectedArtifactLatestVersionNumber = 0;
  public ShowEntityPickerDropdown = false;
  public EntityPickerHighlightIndex = 0;
  public ShowAdvancedBlockOptions = false;
  public IsLoadingEntityViews = false;
  public EntityPickerOptions: DocsEntityPickerOption[] = [];
  public AvailableEntityViews: DocsSavedViewOption[] = [];
  public QueryPickerOptions: DocsQueryPickerOption[] = [];
  public AvailableArtifactsForPicker: DocsArtifactPickerOption[] = [];
  private entitySearchFilteringActive = false;

  // Suggestions & Anchored Comments
  public AccessRevoked = false;
  public PermissionVerifyError = false;
  public Suggestions: DocumentSuggestionItem[] = [];
  public AnchoredThreads: DocumentAnchoredThread[] = [];
  public CommentFilter: 'all' | 'open' | 'resolved' = 'all';
  public SelectedAnchorKey = 'doc-root';
  public SelectedAnchorLabel = 'Document Root';
  public SelectedAnchorQuote = '';
  public NewCommentText = '';
  public NewCommentAgentMode: 'suggest' | 'edit' | 'comment' = 'suggest';

  // Version Diff State
  public DiffBaseLabel = 'initial';
  public SavedVersionSnapshots: Array<{ VersionNumber: number; Content: string; Timestamp: string }> = [];
  public CurrentDiff: DocumentDiffResult = { AddedLines: 0, RemovedLines: 0, UnchangedLines: 0, Lines: [] };

  public override get hasDisplayContent(): boolean {
    return true;
  }

  public override get SupportsPDFExport(): boolean {
    return true;
  }

  public override get SupportsInlineEdit(): boolean {
    return true;
  }

  public override get SupportsVersionDiff(): boolean {
    return true;
  }

  public override GetVersionDiffComponentType(): Type<IArtifactVersionDiffViewer> {
    return DocsVersionDiffComponent;
  }

  private get hasPermissionToEdit(): boolean {
    return !this.readonly && this.HasEditPermission && this.CollaborationStatus !== 'revoked';
  }

  public get CollaborationSession(): DocumentCollaborationSession | null {
    return this.session;
  }

  public get IsWaitingForInitialCollabSync(): boolean {
    return Boolean(
      this.session &&
      this.session.Transport === 'websocket' &&
      !this.session.HasCompletedInitialSync,
    );
  }

  public get LiveSyncUnavailable(): boolean {
    return this.liveSyncUnavailable || Boolean(this.session?.LiveSyncUnavailable);
  }

  public get CanUserEdit(): boolean {
    return !this.LiveSyncUnavailable && this.hasPermissionToEdit;
  }

  public get CanUndo(): boolean {
    return this.CanUserEdit && Boolean(this.session?.CanUndo);
  }

  public get CanRedo(): boolean {
    return this.CanUserEdit && Boolean(this.session?.CanRedo);
  }

  public UndoDocument(): void {
    if (!this.CanUndo || !this.session) {
      return;
    }
    if (this.session.Undo()) {
      this.cdr.detectChanges();
    }
  }

  public RedoDocument(): void {
    if (!this.CanRedo || !this.session) {
      return;
    }
    if (this.session.Redo()) {
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:keydown', ['$event'])
  public OnViewerKeydown(event: KeyboardEvent): void {
    if (!this.CanUserEdit || this.ViewMode === 'preview' || this.isComponentDestroyed) {
      return;
    }
    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const isModalOrCommentInput =
      target !== null &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        (target.tagName === 'TEXTAREA' && !target.classList.contains('mj-docs-source-editor')));
    if (isModalOrCommentInput) {
      return;
    }
    if (key === 'z' && !event.shiftKey) {
      if (this.CanUndo) {
        event.preventDefault();
        this.UndoDocument();
      }
    } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey && event.ctrlKey)) {
      if (this.CanRedo) {
        event.preventDefault();
        this.RedoDocument();
      }
    }
  }

  /**
   * True when the document canvas renders in-place WYSIWYG editable blocks (`Edit` or `Suggest` mode).
   */
  public get IsInteractiveCanvasMode(): boolean {
    return this.CanUserEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest');
  }

  /**
   * True when the canvas uses the clean Mac Notes / TextEdit continuous flow (`EditingStyle === 'simple'`).
   */
  public get IsSimpleNoteMode(): boolean {
    return this.EditingStyle === 'simple';
  }

  public get FilteredSlashCommands(): DocumentSlashCommand[] {
    return this.collabService.GetSlashCommands(this.SlashSearchQuery);
  }

  public get PendingSuggestionsCount(): number {
    return this.Suggestions.filter((s) => s.Status === 'Pending').length;
  }

  public get OpenThreadsCount(): number {
    return this.AnchoredThreads.filter((t) => t.Status === 'Open').length;
  }

  public get FilteredThreads(): DocumentAnchoredThread[] {
    if (this.CommentFilter === 'open') {
      return this.AnchoredThreads.filter((t) => t.Status === 'Open');
    }
    if (this.CommentFilter === 'resolved') {
      return this.AnchoredThreads.filter((t) => t.Status === 'Resolved');
    }
    return this.AnchoredThreads;
  }

  public ngOnInit(): void {
    this.initializeDocument();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['artifactVersion'] && !changes['artifactVersion'].firstChange) {
      this.initializeDocument();
    }
    const wsChange = changes['CollaborationWsUrl'] ?? changes['collaborationWsUrl'];
    if (wsChange && !wsChange.firstChange) {
      this.setupCollaborationSession();
    }
    if (changes['readonly']) {
      if (this.readonly && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
        this.ViewMode = 'preview';
      }
      if (!this.artifactVersion?.ArtifactID) {
        this.HasEditPermission = !this.readonly;
      }
      const canEditNow = this.hasPermissionToEdit;
      this.session?.SetCanEdit(canEditNow);
      if (!this.readonly && canEditNow && this.ViewMode === 'preview') {
        this.ViewMode = 'edit';
      }
      if (this.session && this.CollaborationStatus !== 'revoked') {
        this.CollaborationStatus = this.session.Status;
      }
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    this.stopMoreMenuDocumentListeners();
    this.destroyCollaborationSession();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    return CreateMarkdownSnapshot(this.MarkdownContent || this.getRawContent(), this.getDisplayTitle());
  }

  public override async ExportPDF(orientation: PdfOrientation = 'portrait'): Promise<void> {
    const html = this.PrintableCanvas?.nativeElement?.innerHTML ?? `<pre>${EscapeHtml(this.MarkdownContent)}</pre>`;
    this.importExportService.ExportPrintablePdf(html, this.getDisplayTitle() || 'Document', orientation);
  }

  /**
   * Switches between `edit`, `suggest`, `preview`, `source`, and `diff` modes.
   */
  public SetViewMode(mode: DocsViewerMode): void {
    if ((mode === 'edit' || mode === 'suggest') && !this.CanUserEdit) {
      return;
    }
    this.userExplicitlySelectedMode = true;
    this.ViewMode = mode;
    if (mode === 'diff') {
      this.RecomputeDiff();
    } else if ((mode === 'edit' || mode === 'suggest') && this.DocumentSegments.length === 0) {
      this.DocumentSegments = [this.createDraftParagraphSegment(1)];
    }
    this.cdr.markForCheck();
  }

  /**
   * Transitions from Reader (`preview`) mode into Write (`edit`) mode and focuses the double-clicked block
   * whenever the current user has edit permission.
   */
  public OnPreviewBlockDoubleClick(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit) {
      return;
    }
    this.SetViewMode('edit');
    this.FocusEditableSegment(seg.SegmentID, 'end');
  }

  private promoteToDefaultEditModeIfEligible(): void {
    if (!this.userExplicitlySelectedMode && this.CanUserEdit && this.ViewMode === 'preview') {
      this.ViewMode = 'edit';
      if (this.DocumentSegments.length === 0) {
        this.DocumentSegments = [this.createDraftParagraphSegment(1)];
      }
    }
  }

  private static readonly OUTLINE_PREF_SETTING_KEY = 'MJ.Docs.ShowOutlineRail';
  private static readonly EDITING_STYLE_PREF_SETTING_KEY = 'MJ.Docs.EditingStyle';

  public SetEditingStyle(style: DocsEditingStyle): void {
    this.EditingStyle = style;
    this.writeToolbarVisibility({ EditingStyle: style });
    this.resolveUserInfoEngine()?.SetSettingDebounced(
      MarkdownArtifactViewerComponent.EDITING_STYLE_PREF_SETTING_KEY,
      style,
    );
    this.cdr.markForCheck();
  }

  public OnSegmentFocusIn(seg: DocumentRenderSegment): void {
    if (this.lastFocusedSegmentId !== seg.SegmentID) {
      this.lastFocusedListItemIndex = null;
      this.lastFocusedTableCell = null;
    }
    this.lastFocusedSegmentId = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
  }

  public OnSegmentSurfaceFocus(seg: DocumentRenderSegment): void {
    if (this.lastFocusedSegmentId && this.lastFocusedSegmentId !== seg.SegmentID) {
      this.session?.StopUndoCapture();
    }
    this.lastFocusedSegmentId = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
    this.lastFocusedListItemIndex = null;
    this.lastFocusedTableCell = null;
    this.CaptureSelectionSnapshot();
  }

  public OnListItemFocus(seg: DocumentRenderSegment, itemIndex: number): void {
    if (
      (this.lastFocusedSegmentId && this.lastFocusedSegmentId !== seg.SegmentID) ||
      (this.lastFocusedListItemIndex !== null && this.lastFocusedListItemIndex !== itemIndex)
    ) {
      this.session?.StopUndoCapture();
    }
    this.lastFocusedSegmentId = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
    this.lastFocusedListItemIndex = itemIndex;
    this.lastFocusedTableCell = null;
    this.CaptureSelectionSnapshot();
  }

  public OnTableCellFocus(
    seg: DocumentRenderSegment,
    rowIndex: number,
    colIndex: number,
    isHeader: boolean,
  ): void {
    this.lastFocusedSegmentId = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
    this.lastFocusedListItemIndex = null;
    this.lastFocusedTableCell = { rowIndex, colIndex, isHeader };
    this.CaptureSelectionSnapshot();
  }

  /**
   * Captures the active browser selection offsets within an editable document block so toolbar
   * actions (Bold, Italic, H1–H3, List, Checklist, Callout) preserve and format the exact selection.
   */
  public CaptureSelectionSnapshot(explicitSnapshot?: DocsSelectionSnapshot | null): void {
    if (explicitSnapshot) {
      this.lastSelectionSnapshot = { ...explicitSnapshot };
      this.lastFocusedSegmentId = explicitSnapshot.segmentId;
      this.SelectedAnchorKey = explicitSnapshot.segmentId;
      if (explicitSnapshot.listItemIndex !== undefined) {
        this.lastFocusedListItemIndex = explicitSnapshot.listItemIndex;
      }
      if (explicitSnapshot.tableColIndex !== undefined) {
        this.lastFocusedTableCell = {
          rowIndex: explicitSnapshot.tableRowIndex ?? 0,
          colIndex: explicitSnapshot.tableColIndex,
          isHeader: Boolean(explicitSnapshot.isTableHeader),
        };
      }
      return;
    }

    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer;
    const startEl =
      startNode.nodeType === Node.ELEMENT_NODE
        ? (startNode as HTMLElement)
        : startNode.parentElement;
    const editableEl = startEl?.closest<HTMLElement>('[contenteditable="true"]') ?? null;
    if (!editableEl) {
      return;
    }
    const root: HTMLElement | null =
      this.PrintableCanvas?.nativeElement ?? this.hostElement?.nativeElement ?? null;
    if (root && !root.contains(editableEl)) {
      return;
    }
    const segWrapper = editableEl.closest<HTMLElement>('[data-segment-id]');
    const segmentId = segWrapper?.getAttribute('data-segment-id') ?? null;
    if (!segmentId) {
      return;
    }
    if (!editableEl.contains(range.startContainer) || !editableEl.contains(range.endContainer)) {
      return;
    }

    const { start, end } = this.getCaretCharacterOffsetWithin(editableEl);

    const snapshot: DocsSelectionSnapshot = { segmentId, start, end };
    const testId = editableEl.getAttribute('data-testid') ?? '';
    const listPrefix = `list-item-text-${segmentId}-`;
    const headerPrefix = `table-header-${segmentId}-`;
    const cellPrefix = `table-cell-${segmentId}-`;

    if (testId.startsWith(listPrefix)) {
      const idx = Number.parseInt(testId.slice(listPrefix.length), 10);
      if (Number.isInteger(idx) && idx >= 0) {
        snapshot.listItemIndex = idx;
        this.lastFocusedListItemIndex = idx;
      }
    } else if (testId.startsWith(headerPrefix)) {
      const colIdx = Number.parseInt(testId.slice(headerPrefix.length), 10);
      if (Number.isInteger(colIdx) && colIdx >= 0) {
        snapshot.isTableHeader = true;
        snapshot.tableRowIndex = 0;
        snapshot.tableColIndex = colIdx;
        this.lastFocusedTableCell = { rowIndex: 0, colIndex: colIdx, isHeader: true };
      }
    } else if (testId.startsWith(cellPrefix)) {
      const parts = testId.slice(cellPrefix.length).split('-');
      const rowIdx = Number.parseInt(parts[0] ?? '', 10);
      const colIdx = Number.parseInt(parts[1] ?? '', 10);
      if (Number.isInteger(rowIdx) && rowIdx >= 0 && Number.isInteger(colIdx) && colIdx >= 0) {
        snapshot.isTableHeader = false;
        snapshot.tableRowIndex = rowIdx;
        snapshot.tableColIndex = colIdx;
        this.lastFocusedTableCell = { rowIndex: rowIdx, colIndex: colIdx, isHeader: false };
      }
    }

    this.lastFocusedSegmentId = segmentId;
    this.SelectedAnchorKey = segmentId;
    this.lastSelectionSnapshot = snapshot;
  }

  public OnToolbarActionMousedown(event: MouseEvent): void {
    event.preventDefault();
  }

  public InsertParagraphBelowSegment(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit) {
      return;
    }
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const insertIdx = idx >= 0 ? idx + 1 : blocks.length;
    blocks.splice(insertIdx, 0, '');
    this.applyBlockFlowTransaction(blocks, { segmentIndex: insertIdx, position: 'start' });
  }

  public InsertSectionHeadingBelow(level = 2): void {
    if (!this.CanUserEdit) {
      return;
    }
    const targetIdx = this.resolveActiveSegmentIndex();
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const headingMd = `${'#'.repeat(Math.max(1, Math.min(4, level)))} `;
    if (
      targetIdx >= 0 &&
      this.DocumentSegments[targetIdx]?.Kind === 'markdown' &&
      (this.DocumentSegments[targetIdx]?.BlockKind === 'paragraph' ||
        !this.DocumentSegments[targetIdx]?.BlockKind) &&
      blocks[targetIdx]?.trim().length === 0
    ) {
      blocks[targetIdx] = headingMd;
      this.applyBlockFlowTransaction(blocks, { segmentIndex: targetIdx, position: 'end' });
      return;
    }
    const insertIdx = targetIdx >= 0 ? targetIdx + 1 : blocks.length;
    blocks.splice(insertIdx, 0, headingMd);
    this.applyBlockFlowTransaction(blocks, { segmentIndex: insertIdx, position: 'end' });
  }

  private resolveActiveSegmentIndex(): number {
    const candidateId =
      this.ActiveSlashTargetSegmentID ??
      this.lastFocusedSegmentId ??
      (this.SelectedAnchorKey !== 'doc-root' ? this.SelectedAnchorKey : null);
    if (candidateId) {
      const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === candidateId);
      if (idx >= 0) {
        return idx;
      }
    }
    return this.DocumentSegments.length - 1;
  }

  public ToggleOutlineRail(): void {
    this.ShowOutlineRail = !this.ShowOutlineRail;
    this.writeToolbarVisibility({ ShowOutlineRail: this.ShowOutlineRail });
    this.resolveUserInfoEngine()?.SetSettingDebounced(
      MarkdownArtifactViewerComponent.OUTLINE_PREF_SETTING_KEY,
      String(this.ShowOutlineRail),
    );
    this.cdr.markForCheck();
  }

  public ToggleFormattingRibbon(): void {
    this.ShowFormattingRibbon = !this.ShowFormattingRibbon;
    this.cdr.markForCheck();
  }

  public ToggleFormattingRibbonPinned(): void {
    this.FormattingRibbonPinned = !this.FormattingRibbonPinned;
    if (this.FormattingRibbonPinned) {
      this.ShowFormattingRibbon = true;
    }
    this.writeToolbarVisibility({ FormattingRibbonPinned: this.FormattingRibbonPinned });
    this.cdr.markForCheck();
  }

  public ToggleMoreToolsMenu(event?: Event): void {
    event?.stopPropagation();
    this.ShowMoreToolsMenu = !this.ShowMoreToolsMenu;
    this.syncMoreMenuDocumentListeners();
    this.cdr.markForCheck();
  }

  public CloseMoreToolsMenu(): void {
    if (!this.ShowMoreToolsMenu) {
      this.stopMoreMenuDocumentListeners();
      return;
    }
    this.ShowMoreToolsMenu = false;
    this.stopMoreMenuDocumentListeners();
    this.cdr.markForCheck();
  }

  // =========================================================================
  // TOOLBAR PROGRESSIVE DISCLOSURE & USER SETTINGS PERSISTENCE
  // =========================================================================

  /**
   * Returns `UserInfoEngine.Instance` when available, or `null` if unavailable.
   */
  private resolveUserInfoEngine(): UserInfoEngine | null {
    try {
      return UserInfoEngine.Instance ?? null;
    } catch {
      return null;
    }
  }

  private isValidToolbarItemKey(value: string): value is DocsToolbarItemKey {
    return this.ResolvedToolbarItems.some((item) => item.Key === value);
  }

  private normalizeToolbarPins(keys: ReadonlyArray<string>): DocsToolbarItemKey[] {
    const seen = new Set<DocsToolbarItemKey>();
    const normalized: DocsToolbarItemKey[] = [];
    for (const candidate of keys) {
      if (this.isValidToolbarItemKey(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        normalized.push(candidate);
      }
    }
    return normalized;
  }

  private readToolbarPins(): DocsToolbarItemKey[] {
    const engine = this.resolveUserInfoEngine();
    const raw = engine?.GetSetting(DOCS_TOOLBAR_PINS_SETTING_KEY) ?? null;

    // Keep immediate in-memory edits active while SetSettingDebounced waits to flush to DB
    if (this._localToolbarPins !== null && raw === this._serverToolbarPinsRaw) {
      return [...this._localToolbarPins];
    }

    if (raw == null || raw.trim() === '') {
      if (this._localToolbarPins !== null) {
        return [...this._localToolbarPins];
      }
      return [...DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS];
    }

    if (raw === this._toolbarPinsRaw && this._toolbarPinsParsed !== null) {
      return [...this._toolbarPinsParsed];
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const stringItems = parsed.filter((entry): entry is string => typeof entry === 'string');
        const normalized = this.normalizeToolbarPins(stringItems);
        this._serverToolbarPinsRaw = raw;
        this._localToolbarPins = null;
        this._toolbarPinsRaw = raw;
        this._toolbarPinsParsed = normalized;
        return [...normalized];
      }
    } catch {
      // Fall back to default pins when stored JSON is malformed
    }

    return [...DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS];
  }

  private writeToolbarPins(pins: DocsToolbarItemKey[]): void {
    const normalized = this.normalizeToolbarPins(pins);
    const json = JSON.stringify(normalized);
    const engine = this.resolveUserInfoEngine();
    this._serverToolbarPinsRaw = engine?.GetSetting(DOCS_TOOLBAR_PINS_SETTING_KEY) ?? null;
    this._localToolbarPins = [...normalized];
    this._toolbarPinsRaw = json;
    this._toolbarPinsParsed = [...normalized];
    engine?.SetSettingDebounced(DOCS_TOOLBAR_PINS_SETTING_KEY, json);
  }

  private readToolbarVisibility(): DocsToolbarVisibilitySetting {
    const engine = this.resolveUserInfoEngine();
    const raw = engine?.GetSetting(DOCS_TOOLBAR_VISIBILITY_SETTING_KEY) ?? null;

    if (this._localToolbarVisibility !== null && raw === this._serverToolbarVisibilityRaw) {
      return { ...this._localToolbarVisibility };
    }

    if (raw && raw.trim() !== '') {
      if (raw === this._toolbarVisibilityRaw && this._toolbarVisibilityParsed !== null) {
        return { ...this._toolbarVisibilityParsed };
      }
      try {
        const parsed = JSON.parse(raw) as Partial<DocsToolbarVisibilitySetting> | null;
        if (parsed && typeof parsed === 'object') {
          const normalized: DocsToolbarVisibilitySetting = {
            Version: 1,
            ShowOutlineRail: typeof parsed.ShowOutlineRail === 'boolean' ? parsed.ShowOutlineRail : true,
            EditingStyle: parsed.EditingStyle === 'blocks' ? 'blocks' : 'simple',
            FormattingRibbonPinned: parsed.FormattingRibbonPinned === true,
          };
          this._serverToolbarVisibilityRaw = raw;
          this._localToolbarVisibility = null;
          this._toolbarVisibilityRaw = raw;
          this._toolbarVisibilityParsed = normalized;
          return { ...normalized };
        }
      } catch {
        // Fall back to legacy/default visibility below
      }
    }

    if (this._localToolbarVisibility !== null) {
      return { ...this._localToolbarVisibility };
    }

    const legacyOutline = engine?.GetSetting(
      MarkdownArtifactViewerComponent.OUTLINE_PREF_SETTING_KEY,
    );
    const legacyStyle = engine?.GetSetting(
      MarkdownArtifactViewerComponent.EDITING_STYLE_PREF_SETTING_KEY,
    );
    return {
      Version: 1,
      ShowOutlineRail: legacyOutline === 'false' ? false : true,
      EditingStyle: legacyStyle === 'blocks' ? 'blocks' : 'simple',
      FormattingRibbonPinned: false,
    };
  }

  private writeToolbarVisibility(patch: Partial<DocsToolbarVisibilitySetting>): void {
    const current = this.readToolbarVisibility();
    const next: DocsToolbarVisibilitySetting = {
      Version: 1,
      ShowOutlineRail: patch.ShowOutlineRail ?? current.ShowOutlineRail ?? true,
      EditingStyle: patch.EditingStyle ?? current.EditingStyle ?? 'simple',
      FormattingRibbonPinned: patch.FormattingRibbonPinned ?? current.FormattingRibbonPinned ?? false,
    };
    const json = JSON.stringify(next);
    const engine = this.resolveUserInfoEngine();
    this._serverToolbarVisibilityRaw = engine?.GetSetting(DOCS_TOOLBAR_VISIBILITY_SETTING_KEY) ?? null;
    this._localToolbarVisibility = { ...next };
    this._toolbarVisibilityRaw = json;
    this._toolbarVisibilityParsed = { ...next };
    engine?.SetSettingDebounced(DOCS_TOOLBAR_VISIBILITY_SETTING_KEY, json);
  }

  private loadToolbarPreferencesFromUserSettings(): void {
    this._localToolbarPins = null;
    this._toolbarPinsRaw = null;
    this._toolbarPinsParsed = null;
    this._serverToolbarPinsRaw = null;
    this._localToolbarVisibility = null;
    this._toolbarVisibilityRaw = null;
    this._toolbarVisibilityParsed = null;
    this._serverToolbarVisibilityRaw = null;

    const vis = this.readToolbarVisibility();
    if (typeof vis.ShowOutlineRail === 'boolean') {
      this.ShowOutlineRail = vis.ShowOutlineRail;
    }
    if (vis.EditingStyle === 'simple' || vis.EditingStyle === 'blocks') {
      this.EditingStyle = vis.EditingStyle;
    }
    this.FormattingRibbonPinned = vis.FormattingRibbonPinned === true;
    if (this.FormattingRibbonPinned) {
      this.ShowFormattingRibbon = true;
    }
  }

  public get PinnedToolbarKeys(): DocsToolbarItemKey[] {
    return this.readToolbarPins();
  }

  public get ResolvedToolbarItems(): ResolvedDocsToolbarItem[] {
    const canEdit = this.CanUserEdit;
    const isWriteOrSuggest = this.ViewMode === 'edit' || this.ViewMode === 'suggest';
    const isFormattingAvailable = canEdit && (isWriteOrSuggest || this.ViewMode === 'source');
    const openThreads = this.OpenThreadsCount;
    const pendingSuggestions = this.PendingSuggestionsCount;

    const items: ResolvedDocsToolbarItem[] = [
      {
        Key: 'format',
        Label: 'Format',
        MenuLabel: 'Format Ribbon',
        Description: 'Toggle rich formatting ribbon',
        Icon: 'fa-font',
        Placement: 'left',
        Category: 'writing',
        Order: 10,
        Visible: isFormattingAvailable,
        Active: this.ShowFormattingRibbon,
        HasChevron: true,
        ChevronUp: this.ShowFormattingRibbon,
        TestId: 'toggle-format-ribbon-btn',
        MenuTestId: 'menu-toggle-format-ribbon-btn',
      },
      {
        Key: 'insert-block',
        Label: '+ Insert',
        MenuLabel: 'Insert View / Block',
        Description: 'Insert Live Entity View, Query, Whiteboard, or Block (/)',
        Icon: 'fa-plus',
        Placement: 'left',
        Category: 'writing',
        Order: 20,
        Visible: canEdit && isWriteOrSuggest,
        Active: this.ShowSlashMenu,
        Accent: true,
        TestId: 'open-slash-menu-btn',
        MenuTestId: 'menu-open-slash-menu-btn',
      },
      {
        Key: 'add-section',
        Label: '+ Section',
        MenuLabel: 'Add Section Heading',
        Description: 'Insert a new section heading below the current section',
        Icon: 'fa-heading',
        Placement: 'left',
        Category: 'writing',
        Order: 30,
        Visible: canEdit && isWriteOrSuggest,
        Active: false,
        TestId: 'quick-add-section-btn',
        MenuTestId: 'menu-quick-add-section-btn',
      },
      {
        Key: 'suggest-mode',
        Label: 'Suggest',
        MenuLabel: 'Suggesting Mode',
        Description: 'Propose tracked changes for review',
        Icon: 'fa-code-pull-request',
        Placement: 'left',
        Category: 'writing',
        Order: 40,
        Visible: canEdit,
        Active: this.ViewMode === 'suggest',
        Badge: pendingSuggestions > 0 ? pendingSuggestions : undefined,
        StatusTag: this.ViewMode === 'suggest' ? 'On' : undefined,
        TestId: 'mode-suggest-btn',
        MenuTestId: 'menu-mode-suggest-btn',
      },
      {
        Key: 'outline',
        Label: 'Outline',
        MenuLabel: 'Document Outline Rail',
        Description: 'Toggle Document Outline Rail',
        Icon: 'fa-list-ul',
        Placement: 'left',
        Category: 'view',
        Order: 50,
        Visible: true,
        Active: this.ShowOutlineRail,
        StatusTag: this.ShowOutlineRail ? 'Shown' : 'Hidden',
        TestId: 'toggle-outline-btn',
        MenuTestId: 'menu-toggle-outline-btn',
      },
      {
        Key: 'blocks-mode',
        Label: 'Blocks',
        MenuLabel: 'Block Studio Mode',
        Description: 'Toggle structural Block Studio rails and section cards',
        Icon: 'fa-cubes',
        Placement: 'left',
        Category: 'view',
        Order: 60,
        Visible: canEdit && isWriteOrSuggest,
        Active: this.EditingStyle === 'blocks',
        StatusTag: this.EditingStyle === 'blocks' ? 'Blocks' : 'Simple',
        TestId: 'style-blocks-btn',
        MenuTestId: 'menu-style-blocks-btn',
      },
      {
        Key: 'source-mode',
        Label: 'Source',
        MenuLabel: 'Markdown Source',
        Description: 'Inspect or edit raw Markdown source',
        Icon: 'fa-code',
        Placement: 'left',
        Category: 'view',
        Order: 70,
        Visible: true,
        Active: this.ViewMode === 'source',
        TestId: 'mode-source-btn',
        MenuTestId: 'menu-mode-source-btn',
      },
      {
        Key: 'diff-mode',
        Label: 'History & Diff',
        MenuLabel: 'Version History & Diff',
        Description: 'Compare against earlier versions',
        Icon: 'fa-code-compare',
        Placement: 'left',
        Category: 'view',
        Order: 80,
        Visible: true,
        Active: this.ViewMode === 'diff',
        TestId: 'mode-diff-btn',
        MenuTestId: 'menu-mode-diff-btn',
      },
      {
        Key: 'comments',
        Label: 'Comments',
        MenuLabel: 'Comments Drawer',
        Description: 'Toggle Anchored Comments & Agent Mentions Drawer',
        Icon: 'fa-comments',
        Placement: 'right',
        Category: 'collab',
        Order: 90,
        Visible: true,
        Active: this.ShowCommentsDrawer,
        Badge: openThreads > 0 ? openThreads : undefined,
        TestId: 'toggle-comments-btn',
        MenuTestId: 'menu-toggle-comments-btn',
      },
      {
        Key: 'share',
        Label: 'Share',
        MenuLabel: 'Share & Permissions',
        Description: 'Manage document sharing and permissions',
        Icon: 'fa-user-shield',
        Placement: 'right',
        Category: 'collab',
        Order: 100,
        Visible: this.CanUserShareArtifact,
        Active: this.ShowPermissionsModal,
        TestId: 'open-permissions-modal-btn',
        MenuTestId: 'menu-open-permissions-modal-btn',
      },
      {
        Key: 'export-docx',
        Label: 'Export .docx',
        MenuLabel: 'Export Word (.docx)',
        Description: 'Download document as Word (.docx)',
        Icon: 'fa-file-word',
        Placement: 'right',
        Category: 'io',
        Order: 110,
        Visible: true,
        Active: false,
        TestId: 'export-docx-btn',
        MenuTestId: 'menu-export-docx-btn',
      },
      {
        Key: 'export-md',
        Label: 'Export .md',
        MenuLabel: 'Export Markdown (.md)',
        Description: 'Download document as Markdown (.md)',
        Icon: 'fa-file-code',
        Placement: 'right',
        Category: 'io',
        Order: 120,
        Visible: true,
        Active: false,
        TestId: 'export-md-btn',
        MenuTestId: 'menu-export-md-btn',
      },
      {
        Key: 'copy-md',
        Label: 'Copy',
        MenuLabel: 'Copy Markdown',
        Description: 'Copy Markdown to clipboard',
        Icon: 'fa-copy',
        Placement: 'right',
        Category: 'io',
        Order: 130,
        Visible: true,
        Active: false,
        TestId: 'copy-markdown-btn',
        MenuTestId: 'menu-copy-markdown-btn',
      },
    ];

    return items.sort((a, b) => a.Order - b.Order);
  }

  public get PinnedLeftToolbarItems(): ResolvedDocsToolbarItem[] {
    const pinnedSet = new Set(this.PinnedToolbarKeys);
    return this.ResolvedToolbarItems
      .filter((item) => item.Visible && item.Placement === 'left' && pinnedSet.has(item.Key))
      .sort((a, b) => a.Order - b.Order);
  }

  public get PinnedRightToolbarItems(): ResolvedDocsToolbarItem[] {
    const pinnedSet = new Set(this.PinnedToolbarKeys);
    return this.ResolvedToolbarItems
      .filter((item) => item.Visible && item.Placement === 'right' && pinnedSet.has(item.Key))
      .sort((a, b) => a.Order - b.Order);
  }

  public get PinnedToolbarItemsCount(): number {
    return this.PinnedToolbarKeys.length;
  }

  public get CanPinMoreToolbarItems(): boolean {
    return this.PinnedToolbarKeys.length < this.MaxPinnedToolbarActions;
  }

  public get HasCustomToolbarSettings(): boolean {
    const pins = this.PinnedToolbarKeys;
    const pinsDiffer =
      pins.length !== DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS.length ||
      DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS.some((key, index) => pins[index] !== key);
    return (
      pinsDiffer ||
      this.FormattingRibbonPinned ||
      this.EditingStyle !== 'simple' ||
      !this.ShowOutlineRail
    );
  }

  public IsToolbarItemShownOnBar(key: DocsToolbarItemKey): boolean {
    if (!this.IsToolbarItemPinned(key)) {
      return false;
    }
    const item = this.ResolvedToolbarItems.find((entry) => entry.Key === key);
    return Boolean(item?.Visible);
  }

  public IsToolbarItemPinned(key: DocsToolbarItemKey): boolean {
    return this.PinnedToolbarKeys.includes(key);
  }

  public IsToolbarItemPinnedOverCap(key: DocsToolbarItemKey): boolean {
    return !this.IsToolbarItemPinned(key) && !this.CanPinMoreToolbarItems;
  }

  public GetToolbarPinTooltip(key: DocsToolbarItemKey): string {
    if (this.IsToolbarItemPinned(key)) {
      return 'Unpin from toolbar';
    }
    if (!this.CanPinMoreToolbarItems) {
      return `Pin limit reached (${this.MaxPinnedToolbarActions}). Unpin an item first.`;
    }
    return 'Pin to toolbar';
  }

  public GetMenuItemsForCategory(category: ResolvedDocsToolbarItem['Category']): ResolvedDocsToolbarItem[] {
    return this.ResolvedToolbarItems
      .filter((item) => item.Visible && item.Category === category)
      .sort((a, b) => a.Order - b.Order);
  }

  public ExecuteToolbarItem(item: ResolvedDocsToolbarItem, fromMenu = false, event?: Event): void {
    event?.stopPropagation();
    if (!item.Visible) {
      return;
    }
    switch (item.Key) {
      case 'outline':
        this.ToggleOutlineRail();
        break;
      case 'format':
        this.ToggleFormattingRibbon();
        break;
      case 'insert-block':
        this.ToggleSlashMenu();
        break;
      case 'add-section':
        this.InsertSectionHeadingBelow(2);
        break;
      case 'suggest-mode':
        this.SetViewMode(this.ViewMode === 'suggest' ? 'edit' : 'suggest');
        break;
      case 'blocks-mode':
        this.SetEditingStyle(this.EditingStyle === 'blocks' ? 'simple' : 'blocks');
        break;
      case 'source-mode':
        this.SetViewMode(this.ViewMode === 'source' ? (this.CanUserEdit ? 'edit' : 'preview') : 'source');
        break;
      case 'diff-mode':
        this.SetViewMode(this.ViewMode === 'diff' ? (this.CanUserEdit ? 'edit' : 'preview') : 'diff');
        break;
      case 'comments':
        this.ToggleCommentsDrawer();
        break;
      case 'share':
        this.OpenPermissionsModal();
        break;
      case 'export-docx':
        void this.OnExportDocx();
        break;
      case 'export-md':
        this.OnExportMarkdown();
        break;
      case 'copy-md':
        this.OnCopy();
        break;
    }
    if (fromMenu) {
      this.CloseMoreToolsMenu();
    }
  }

  public ToggleToolbarItemPin(key: DocsToolbarItemKey, event?: Event): void {
    event?.stopPropagation();
    const current = this.PinnedToolbarKeys;
    const isPinned = current.includes(key);
    if (isPinned) {
      const next = current.filter((k) => k !== key);
      this.writeToolbarPins(next);
      this.ToolbarPinChanged.emit({ Key: key, Pinned: false });
      this.cdr.markForCheck();
      return;
    }
    if (!this.CanPinMoreToolbarItems) {
      return;
    }
    const next = [...current, key];
    this.writeToolbarPins(next);
    this.ToolbarPinChanged.emit({ Key: key, Pinned: true });
    this.cdr.markForCheck();
  }

  public ResetToolbarCustomizations(event?: Event): void {
    event?.stopPropagation();
    const defaults = [...DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS];
    this.writeToolbarPins(defaults);
    this.ShowOutlineRail = true;
    this.EditingStyle = 'simple';
    this.FormattingRibbonPinned = false;
    this.writeToolbarVisibility({
      Version: 1,
      ShowOutlineRail: true,
      EditingStyle: 'simple',
      FormattingRibbonPinned: false,
    });
    const engine = this.resolveUserInfoEngine();
    engine?.SetSettingDebounced(MarkdownArtifactViewerComponent.OUTLINE_PREF_SETTING_KEY, 'true');
    engine?.SetSettingDebounced(MarkdownArtifactViewerComponent.EDITING_STYLE_PREF_SETTING_KEY, 'simple');
    this.cdr.markForCheck();
  }

  private syncMoreMenuDocumentListeners(): void {
    this.stopMoreMenuDocumentListeners();
    if (!this.ShowMoreToolsMenu || !this.renderer) {
      return;
    }
    const unlistenClick = this.renderer.listen('document', 'click', (evt: Event) => {
      const wrapEl = this.MoreMenuWrap?.nativeElement;
      const target = evt.target as Node | null;
      if (wrapEl && target && wrapEl.contains(target)) {
        return;
      }
      this.CloseMoreToolsMenu();
    });
    const unlistenKeydown = this.renderer.listen('document', 'keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        this.CloseMoreToolsMenu();
      }
    });
    this._unlistenMoreMenuDocs.push(unlistenClick, unlistenKeydown);
  }

  private stopMoreMenuDocumentListeners(): void {
    for (const unlisten of this._unlistenMoreMenuDocs) {
      unlisten();
    }
    this._unlistenMoreMenuDocs = [];
  }

  public ToggleCommentsDrawer(): void {
    this.ShowCommentsDrawer = !this.ShowCommentsDrawer;
    this.cdr.markForCheck();
  }

  public ToggleSlashMenu(): void {
    this.ShowSlashMenu = !this.ShowSlashMenu;
    if (this.ShowSlashMenu) {
      if (!this.ActiveSlashTargetSegmentID) {
        const activeIdx = this.resolveActiveSegmentIndex();
        if (activeIdx >= 0 && this.DocumentSegments[activeIdx]) {
          this.ActiveSlashTargetSegmentID = this.DocumentSegments[activeIdx].SegmentID;
          this.SelectedAnchorKey = this.DocumentSegments[activeIdx].SegmentID;
        }
      }
      this.SlashSearchQuery = '';
      this.SlashMenuHighlightIndex = 0;
    }
    this.cdr.markForCheck();
  }

  public CloseSlashMenu(): void {
    this.ShowSlashMenu = false;
    this.SlashMenuHighlightIndex = 0;
    this.ActiveSlashTargetSegmentID = null;
    this.cdr.markForCheck();
  }

  /**
   * Opens the `/` Slash Command Palette anchored to a specific document segment.
   */
  public OpenSlashMenuForSegment(seg: DocumentRenderSegment): void {
    this.ActiveSlashTargetSegmentID = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
    this.SlashSearchQuery = '';
    this.SlashMenuHighlightIndex = 0;
    this.ShowSlashMenu = true;
    this.cdr.markForCheck();
  }

  /**
   * Handles keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`) inside the `/` Slash Command Palette.
   */
  public OnSlashMenuKeydown(event: KeyboardEvent): void {
    const cmds = this.FilteredSlashCommands;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.CloseSlashMenu();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (cmds.length > 0) {
        this.SlashMenuHighlightIndex = (this.SlashMenuHighlightIndex + 1) % cmds.length;
        this.cdr.markForCheck();
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (cmds.length > 0) {
        this.SlashMenuHighlightIndex = (this.SlashMenuHighlightIndex - 1 + cmds.length) % cmds.length;
        this.cdr.markForCheck();
      }
      return;
    }
    if (event.key === 'Enter' && cmds.length > 0) {
      event.preventDefault();
      const chosen = cmds[this.SlashMenuHighlightIndex] ?? cmds[0];
      if (chosen) {
        this.ExecuteSlashCommand(chosen);
      }
    }
  }

  /**
   * Focuses the trailing empty paragraph block at the bottom of the document canvas,
   * or appends a new empty paragraph block and focuses it immediately.
   */
  public AppendOrFocusTrailingParagraph(): void {
    if (!this.CanUserEdit) {
      return;
    }
    if (this.DocumentSegments.length > 0) {
      const lastIdx = this.DocumentSegments.length - 1;
      const lastSeg = this.DocumentSegments[lastIdx];
      if (
        lastSeg.Kind === 'markdown' &&
        (lastSeg.BlockKind === 'paragraph' || !lastSeg.BlockKind) &&
        lastSeg.RawMarkdown.trim().length === 0
      ) {
        const root: ParentNode | null =
          this.PrintableCanvas?.nativeElement ??
          this.hostElement?.nativeElement ??
          (typeof document !== 'undefined' ? document : null);
        const lastEl = root?.querySelector<HTMLElement>(
          `[data-testid="editable-paragraph-${lastSeg.SegmentID}"]`,
        );
        if (!lastEl || !this.isDomNode(lastEl) || this.ExtractMarkdownFromEditableElement(lastEl).trim().length === 0) {
          this.FocusEditableSegment(lastSeg.SegmentID, 'start');
          return;
        }
      }
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    blocks.push('');
    this.applyBlockFlowTransaction(blocks, { segmentIndex: blocks.length - 1, position: 'start' });
  }

  /**
   * Handles live input inside an in-place `contenteditable` block (`Edit` / `Suggest` modes),
   * supporting instant Markdown prefix auto-formatting (`# `, `- `, `1. `, `[] `, `> `, ```` ``` ````)
   * and opening the `/` Slash Command Palette when `/` is typed at the start of a block or after whitespace.
   */
  public OnEditableBlockInput(seg: DocumentRenderSegment, event: Event): void {
    const el = event.target as HTMLElement | null;
    const text = el?.textContent ?? '';
    const trimmed = text.trim();

    // Instant Markdown prefix auto-turn-into on paragraph blocks in Edit mode
    if (
      this.CanUserEdit &&
      this.ViewMode === 'edit' &&
      (seg.BlockKind === 'paragraph' || !seg.BlockKind)
    ) {
      if (this.tryApplyInstantMarkdownAutoTurn(seg, text)) {
        return;
      }
    }

    if (trimmed === '/' || /(?:^|\s)\/$/.test(text)) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
      this.SlashSearchQuery = '';
      this.SlashMenuHighlightIndex = 0;
      this.ShowSlashMenu = true;
      this.cdr.markForCheck();
      return;
    }
    if (trimmed.startsWith('/') && trimmed.length > 1 && !trimmed.includes(' ')) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
      this.SlashSearchQuery = trimmed.slice(1);
      this.SlashMenuHighlightIndex = 0;
      this.ShowSlashMenu = true;
      this.cdr.markForCheck();
      return;
    }
    if (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID && !trimmed.startsWith('/')) {
      this.CloseSlashMenu();
    }

    // Live word-level suggestion tracking while typing in Suggest Mode
    if (this.ViewMode === 'suggest' && this.CanUserEdit && trimmed.length > 0) {
      let proposedMd = trimmed;
      if (seg.BlockKind === 'heading') {
        const level = seg.HeadingLevel ?? 1;
        proposedMd = `${'#'.repeat(level)} ${trimmed.replace(/\n+/g, ' ')}`;
      }
      if (proposedMd === seg.RawMarkdown.trim()) {
        this.Suggestions = this.Suggestions.filter(
          (s) => !(s.BlockID === seg.SegmentID && s.Status === 'Pending'),
        );
        this.cdr.markForCheck();
      } else {
        this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, proposedMd, 'Suggested edit');
      }
    }
  }

  /**
   * Detects Markdown block prefixes typed at the start of a paragraph block (`# `, `## `, `- `, `1. `, `[] `, `> `, ```` ``` ````)
   * and immediately transforms the block in place while preserving focus and caret continuity.
   */
  private tryApplyInstantMarkdownAutoTurn(seg: DocumentRenderSegment, rawText: string): boolean {
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (segIdx < 0) {
      return false;
    }
    const normalized = rawText.replace(/\u00a0/g, ' ');
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

    // 1. Heading prefix: "# ", "## ", "### ", "#### "
    const headingMatch = /^(#{1,4})[ \t](.*)$/s.exec(normalized);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rest = headingMatch[2].replace(/\n+/g, ' ').trim();
      blocks[segIdx] = `${'#'.repeat(level)} ${rest}`;
      this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'end' });
      return true;
    }

    // 2. Task checklist prefix: "[] ", "[ ] ", "[x] ", "- [ ] ", "- [x] "
    const taskMatch = /^(?:[-*][ \t]+)?\[([ xX]?)\][ \t](.*)$/s.exec(normalized);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      const rest = taskMatch[2].replace(/\n+/g, ' ').trim();
      blocks[segIdx] = `- [${checked ? 'x' : ' '}] ${rest}`;
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: segIdx,
        position: 'end',
        listItemIndex: 0,
      });
      return true;
    }

    // 3. Unordered bullet list prefix: "- " or "* "
    const bulletMatch = /^[-*][ \t](.*)$/s.exec(normalized);
    if (bulletMatch) {
      const rest = bulletMatch[1].replace(/\n+/g, ' ').trim();
      blocks[segIdx] = `- ${rest}`;
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: segIdx,
        position: 'end',
        listItemIndex: 0,
      });
      return true;
    }

    // 4. Ordered numbered list prefix: "1. "
    const orderedMatch = /^1\.[ \t](.*)$/s.exec(normalized);
    if (orderedMatch) {
      const rest = orderedMatch[1].replace(/\n+/g, ' ').trim();
      blocks[segIdx] = `1. ${rest}`;
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: segIdx,
        position: 'end',
        listItemIndex: 0,
      });
      return true;
    }

    // 5. Callout prefix: "> "
    const calloutMatch = /^>[ \t](.*)$/s.exec(normalized);
    if (calloutMatch) {
      const rest = calloutMatch[1].trim();
      blocks[segIdx] = `> [!NOTE]\n> ${rest}`;
      this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'end' });
      return true;
    }

    // 6. Code block prefix: "``` " or "```ts "
    const codeMatch = /^```([a-zA-Z0-9_-]*)[ \t\n](.*)$/s.exec(normalized);
    if (codeMatch) {
      const lang = codeMatch[1].trim() || 'typescript';
      const rest = codeMatch[2];
      blocks[segIdx] = ['```' + lang, rest, '```'].join('\n');
      this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'end' });
      return true;
    }

    return false;
  }

  public OnEditableBlockKeydown(seg: DocumentRenderSegment, event: KeyboardEvent): void {
    // 1. Slash menu keyboard navigation when open
    if (this.ShowSlashMenu) {
      if (
        event.key === 'Escape' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter'
      ) {
        this.OnSlashMenuKeydown(event);
        return;
      }
    }

    if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
      return;
    }

    if (!this.CanUserEdit || this.ViewMode !== 'edit') {
      return;
    }

    const el = event.target as HTMLElement | null;
    const rawVisibleText = el?.textContent ?? '';
    const rawMarkdown = this.ExtractMarkdownFromEditableElement(el);
    const caret = this.getCaretCharacterOffsetWithin(el);
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (segIdx < 0) {
      return;
    }

    // Inline formatting keyboard shortcuts (Cmd/Ctrl+B -> Bold, Cmd/Ctrl+I -> Italic)
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'b' || lowerKey === 'i') {
        event.preventDefault();
        const marker = lowerKey === 'b' ? '**' : '*';
        this.CaptureSelectionSnapshot({
          segmentId: seg.SegmentID,
          start: caret.start,
          end: caret.end,
        });
        this.applyInlineFormattingToSegment(segIdx, marker, marker, rawMarkdown);
        return;
      }
    }

    // 2. Enter key -> split block or transition smoothly to a new paragraph block BELOW (never above)
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (seg.BlockKind === 'heading') {
        event.preventDefault();
        const level = seg.HeadingLevel ?? 1;
        const cleanFull = rawMarkdown.replace(/\n+/g, ' ');
        const mdRange = this.mapVisibleRangeToMarkdownRange(cleanFull, caret.start, caret.end, true);
        const before = cleanFull.slice(0, mdRange.start).trim();
        const after = cleanFull.slice(mdRange.end).trim();
        const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

        if (caret.start === 0 && before.length === 0 && after.length > 0) {
          // Even if the caret was at the start of the heading, keep the heading intact and create a new paragraph BELOW it
          blocks[segIdx] = `${'#'.repeat(level)} ${after}`;
          blocks.splice(segIdx + 1, 0, '');
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        } else {
          blocks[segIdx] = `${'#'.repeat(level)} ${before}`;
          blocks.splice(segIdx + 1, 0, after);
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        }
        return;
      }

      if (seg.BlockKind === 'paragraph' || !seg.BlockKind) {
        event.preventDefault();
        const mdRange = this.mapVisibleRangeToMarkdownRange(rawMarkdown, caret.start, caret.end, true);
        const before = rawMarkdown.slice(0, mdRange.start);
        const after = rawMarkdown.slice(mdRange.end);
        const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

        if (rawVisibleText.trim().length === 0 && rawMarkdown.trim().length === 0) {
          // Pressing Enter on an empty paragraph creates or moves to the next line below cleanly
          blocks.splice(segIdx + 1, 0, '');
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
          return;
        }
        if (caret.start === 0 && before.trim().length === 0 && after.trim().length > 0) {
          // Keep current paragraph and insert new paragraph below unless user explicitly split mid-text
          blocks[segIdx] = after.trim();
          blocks.splice(segIdx + 1, 0, '');
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        } else {
          blocks[segIdx] = before.trim();
          blocks.splice(segIdx + 1, 0, after.trim());
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        }
        return;
      }

      if (seg.BlockKind === 'callout') {
        event.preventDefault();
        const parsed = this.GetParsedCallout(seg);
        const bodyText = rawMarkdown.trim();
        const bodyLines = bodyText.split('\n').map((l) => `> ${l}`);
        const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
        blocks[segIdx] = [`> [!${parsed.CalloutType}]`, ...bodyLines].join('\n');
        blocks.splice(segIdx + 1, 0, '');
        this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        return;
      }
    }

    // 3. Backspace at caret offset 0 -> demote heading/callout, delete empty block, or merge into preceding block
    if (
      event.key === 'Backspace' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      caret.collapsed &&
      caret.start === 0
    ) {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

      if (seg.BlockKind === 'heading') {
        event.preventDefault();
        blocks[segIdx] = rawMarkdown.replace(/\n+/g, ' ').trim();
        this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'start' });
        return;
      }

      if (seg.BlockKind === 'callout') {
        event.preventDefault();
        blocks[segIdx] = rawMarkdown.trim();
        this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'start' });
        return;
      }

      if (seg.BlockKind === 'paragraph' || !seg.BlockKind) {
        if (rawVisibleText.trim().length === 0 && rawMarkdown.trim().length === 0) {
          if (this.DocumentSegments.length > 1) {
            event.preventDefault();
            blocks.splice(segIdx, 1);
            const targetIdx = Math.max(0, segIdx - 1);
            this.applyBlockFlowTransaction(blocks, { segmentIndex: targetIdx, position: 'end' });
          }
          return;
        }

        if (segIdx > 0) {
          const prevSeg = this.DocumentSegments[segIdx - 1];
          if (
            prevSeg.Kind === 'markdown' &&
            (prevSeg.BlockKind === 'paragraph' || !prevSeg.BlockKind || prevSeg.BlockKind === 'heading')
          ) {
            event.preventDefault();
            const currentTrimmed = rawMarkdown.trim();
            if (prevSeg.RawMarkdown.trim().length === 0 && prevSeg.BlockKind !== 'heading') {
              blocks[segIdx] = currentTrimmed;
              blocks.splice(segIdx - 1, 1);
              this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx - 1, position: 0 });
              return;
            }
            if (prevSeg.BlockKind === 'heading') {
              const level = prevSeg.HeadingLevel ?? 1;
              const prevHeadingText = (prevSeg.HeadingText ?? this.GetEditableHeadingText(prevSeg)).trim();
              const joiner = prevHeadingText.length > 0 && currentTrimmed.length > 0 ? ' ' : '';
              const seamOffset = this.mapMarkdownOffsetToVisibleOffset(
                `${prevHeadingText}${joiner}${currentTrimmed}`,
                prevHeadingText.length + joiner.length,
              );
              blocks[segIdx - 1] = `${'#'.repeat(level)} ${prevHeadingText}${joiner}${currentTrimmed}`;
              blocks.splice(segIdx, 1);
              this.applyBlockFlowTransaction(blocks, {
                segmentIndex: segIdx - 1,
                position: seamOffset,
              });
              return;
            }
            const prevParaText = prevSeg.RawMarkdown.trim();
            const joiner = prevParaText.length > 0 && currentTrimmed.length > 0 ? ' ' : '';
            const seamOffset = this.mapMarkdownOffsetToVisibleOffset(
              `${prevParaText}${joiner}${currentTrimmed}`,
              prevParaText.length + joiner.length,
            );
            blocks[segIdx - 1] = `${prevParaText}${joiner}${currentTrimmed}`;
            blocks.splice(segIdx, 1);
            this.applyBlockFlowTransaction(blocks, {
              segmentIndex: segIdx - 1,
              position: seamOffset,
            });
            return;
          }
        }
      }
    }

    // 4. Cross-block ArrowUp / ArrowLeft at start and ArrowDown / ArrowRight at end
    if (
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      caret.collapsed
    ) {
      if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && caret.start === 0) {
        const prevIdx = this.findAdjacentEditableSegmentIndex(seg.SegmentID, -1);
        if (prevIdx >= 0) {
          event.preventDefault();
          this.flushElementBeforeNavigation(seg, el);
          this.FocusEditableSegment(this.DocumentSegments[prevIdx].SegmentID, 'end');
        }
        return;
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && caret.end >= rawVisibleText.length) {
        const nextIdx = this.findAdjacentEditableSegmentIndex(seg.SegmentID, 1);
        if (nextIdx >= 0) {
          event.preventDefault();
          this.flushElementBeforeNavigation(seg, el);
          this.FocusEditableSegment(this.DocumentSegments[nextIdx].SegmentID, 'start');
        }
      }
    }
  }

  public GetEditableHeadingText(seg: DocumentRenderSegment): string {
    return seg.RawMarkdown.replace(/^#{1,6}(?:\s+|$)/, '').trim();
  }

  public CycleHeadingLevel(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit) {
      return;
    }
    const currentLevel = seg.HeadingLevel ?? 1;
    const nextLevel = currentLevel >= 4 ? 1 : currentLevel + 1;
    const text = seg.HeadingText ?? this.GetEditableHeadingText(seg);
    const nextMd = `${'#'.repeat(nextLevel)} ${text}`;
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed heading level to H${nextLevel}`);
  }

  public CommitEditableHeading(seg: DocumentRenderSegment, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const rawText = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ').trim();
    if (rawText === '/' || (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID)) {
      return;
    }
    const level = seg.HeadingLevel ?? 1;
    const nextMd = `${'#'.repeat(level)} ${rawText}`;
    if (nextMd !== seg.RawMarkdown) {
      this.ApplyInPlaceSegmentChange(seg, nextMd, `Edited heading H${level}`);
    }
  }

  public CommitEditableParagraph(seg: DocumentRenderSegment, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextText = this.ExtractMarkdownFromEditableElement(el).trim();
    if (nextText === '/' || (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID)) {
      return;
    }
    if (!nextText) {
      if (seg.RawMarkdown.trim().length > 0 && this.CanUserEdit && this.ViewMode === 'edit') {
        const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
        if (segIdx >= 0) {
          const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
          blocks[segIdx] = '';
          this.applyBlockFlowTransaction(blocks);
        }
      }
      return;
    }
    if (nextText !== seg.RawMarkdown.trim()) {
      this.ApplyInPlaceSegmentChange(seg, nextText, 'Edited paragraph in place');
    }
  }

  public GetParsedTable(seg: DocumentRenderSegment): { Headers: string[]; Rows: string[][] } {
    const lines = seg.RawMarkdown
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const parseCells = (line: string): string[] =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());

    const headers = lines.length > 0 ? parseCells(lines[0]) : ['Column 1', 'Column 2'];
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCells(lines[i]);
      // Skip GFM separator row (| --- | --- |)
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        continue;
      }
      while (cells.length < headers.length) {
        cells.push('');
      }
      rows.push(cells.slice(0, headers.length));
    }
    return { Headers: headers, Rows: rows };
  }

  private serializeParsedTable(headers: string[], rows: string[][]): string {
    const headerLine = `| ${headers.join(' | ')} |`;
    const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyLines = rows.map((r) => `| ${headers.map((_, idx) => r[idx] ?? '').join(' | ')} |`);
    return [headerLine, sepLine, ...bodyLines].join('\n');
  }

  public UpdateTableHeaderCell(seg: DocumentRenderSegment, colIndex: number, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextVal = this.ExtractMarkdownFromEditableElement(el).replace(/\|/g, '/').trim();
    const parsed = this.GetParsedTable(seg);
    if (parsed.Headers[colIndex] === nextVal) {
      return;
    }
    parsed.Headers[colIndex] = nextVal;
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows),
      `Updated table header column ${colIndex + 1}`,
    );
  }

  public UpdateTableBodyCell(seg: DocumentRenderSegment, rowIndex: number, colIndex: number, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || !Number.isInteger(colIndex) || colIndex < 0) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextVal = this.ExtractMarkdownFromEditableElement(el).replace(/\|/g, '/').trim();
    const parsed = this.GetParsedTable(seg);
    const targetRow = parsed.Rows.at(rowIndex);
    if (!targetRow || colIndex >= targetRow.length || targetRow.at(colIndex) === nextVal) {
      return;
    }
    targetRow.splice(colIndex, 1, nextVal);
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows),
      `Updated table cell (${rowIndex + 1}, ${colIndex + 1})`,
    );
  }

  public AddTableRow(seg: DocumentRenderSegment): void {
    const parsed = this.GetParsedTable(seg);
    parsed.Rows.push(parsed.Headers.map((_, idx) => `Value ${idx + 1}`));
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows),
      'Added table row',
    );
  }

  public AddTableColumn(seg: DocumentRenderSegment): void {
    const parsed = this.GetParsedTable(seg);
    const colNum = parsed.Headers.length + 1;
    parsed.Headers.push(`Column ${colNum}`);
    for (const row of parsed.Rows) {
      row.push('—');
    }
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows),
      'Added table column',
    );
  }

  public GetParsedListItems(seg: DocumentRenderSegment): Array<{
    Index: number;
    IsTask: boolean;
    Checked: boolean;
    OrderedPrefix?: string;
    Text: string;
  }> {
    const lines = seg.RawMarkdown.split('\n').filter((l) => l.trim().length > 0);
    return lines.map((line, idx) => {
      const trimmed = line.trimStart();
      const bulletChar = trimmed[0];
      if (
        (bulletChar === '-' || bulletChar === '*' || bulletChar === '+') &&
        (trimmed.length === 1 || trimmed[1] === ' ' || trimmed[1] === '\t')
      ) {
        const afterBullet = trimmed.slice(2).trimStart();
        if (
          afterBullet.startsWith('[ ]') ||
          afterBullet.startsWith('[x]') ||
          afterBullet.startsWith('[X]')
        ) {
          return {
            Index: idx,
            IsTask: true,
            Checked: afterBullet[1].toLowerCase() === 'x',
            Text: afterBullet.slice(3).trimStart(),
          };
        }
        return {
          Index: idx,
          IsTask: false,
          Checked: false,
          Text: afterBullet,
        };
      }
      let dEnd = 0;
      while (dEnd < trimmed.length && trimmed.charCodeAt(dEnd) >= 48 && trimmed.charCodeAt(dEnd) <= 57) {
        dEnd++;
      }
      if (
        dEnd > 0 &&
        trimmed[dEnd] === '.' &&
        (dEnd + 1 === trimmed.length || trimmed[dEnd + 1] === ' ' || trimmed[dEnd + 1] === '\t')
      ) {
        return {
          Index: idx,
          IsTask: false,
          Checked: false,
          OrderedPrefix: trimmed.slice(0, dEnd + 1),
          Text: trimmed.slice(dEnd + 2).trimStart(),
        };
      }
      return {
        Index: idx,
        IsTask: false,
        Checked: false,
        Text: line.trim(),
      };
    });
  }

  private renumberListItems(
    items: Array<{ Index: number; IsTask: boolean; Checked: boolean; OrderedPrefix?: string; Text: string }>,
  ): void {
    let orderedCounter = 1;
    for (let i = 0; i < items.length; i++) {
      items[i].Index = i;
      if (items[i].OrderedPrefix) {
        items[i].OrderedPrefix = `${orderedCounter++}.`;
      }
    }
  }

  private serializeParsedListItems(
    items: Array<{ IsTask: boolean; Checked: boolean; OrderedPrefix?: string; Text: string }>,
  ): string {
    return items
      .map((item) => {
        if (item.IsTask) {
          return `- [${item.Checked ? 'x' : ' '}] ${item.Text}`;
        }
        if (item.OrderedPrefix) {
          return `${item.OrderedPrefix} ${item.Text}`;
        }
        return `- ${item.Text}`;
      })
      .join('\n');
  }

  public ToggleTaskListItem(seg: DocumentRenderSegment, itemIndex: number, event: Event): void {
    const checkbox = event.target as HTMLInputElement | null;
    const items = this.GetParsedListItems(seg);
    if (!items[itemIndex]) {
      return;
    }
    items[itemIndex].Checked = checkbox ? checkbox.checked : !items[itemIndex].Checked;
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedListItems(items),
      `Toggled task item "${items[itemIndex].Text}"`,
    );
  }

  public UpdateListItemText(seg: DocumentRenderSegment, itemIndex: number, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextText = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ').trim();
    const items = this.GetParsedListItems(seg);
    if (!items[itemIndex] || items[itemIndex].Text === nextText) {
      return;
    }
    items[itemIndex].Text = nextText;
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedListItems(items),
      'Updated list item text',
    );
  }

  public OnListItemKeydown(seg: DocumentRenderSegment, itemIndex: number, event: KeyboardEvent): void {
    if (this.ShowSlashMenu) {
      this.OnEditableBlockKeydown(seg, event);
      return;
    }

    const el = event.target as HTMLElement | null;
    const rawVisibleText = (el?.textContent ?? '').replace(/\n+/g, ' ');
    const rawMarkdown = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ');
    const caret = this.getCaretCharacterOffsetWithin(el);
    const items = this.GetParsedListItems(seg);
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);

    // Inline formatting keyboard shortcuts inside list items (Cmd/Ctrl+B -> Bold, Cmd/Ctrl+I -> Italic)
    if (
      this.CanUserEdit &&
      this.ViewMode === 'edit' &&
      segIdx >= 0 &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'b' || lowerKey === 'i') {
        event.preventDefault();
        const marker = lowerKey === 'b' ? '**' : '*';
        this.CaptureSelectionSnapshot({
          segmentId: seg.SegmentID,
          listItemIndex: itemIndex,
          start: caret.start,
          end: caret.end,
        });
        this.applyInlineFormattingToSegment(segIdx, marker, marker, rawMarkdown);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (!this.CanUserEdit || segIdx < 0) {
        return;
      }
      this.syncPeerListItemsFromDom(seg, items, itemIndex);
      const currentTrimmed = rawMarkdown.trim();
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

      // Pressing Enter on an empty list item exits the list into a fresh paragraph block below
      if (currentTrimmed.length === 0 && this.ViewMode === 'edit') {
        items.splice(itemIndex, 1);
        this.renumberListItems(items);
        if (items.length === 0) {
          blocks[segIdx] = '';
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'start' });
        } else if (itemIndex > 0 && itemIndex < items.length) {
          const leadingMd = this.serializeParsedListItems(items.slice(0, itemIndex));
          const trailingItems = items.slice(itemIndex).map((item, idx) => ({
            ...item,
            Index: idx,
          }));
          this.renumberListItems(trailingItems);
          const trailingMd = this.serializeParsedListItems(trailingItems);
          blocks.splice(segIdx, 1, leadingMd, '', trailingMd);
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        } else {
          blocks[segIdx] = this.serializeParsedListItems(items);
          blocks.splice(segIdx + 1, 0, '');
          this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx + 1, position: 'start' });
        }
        return;
      }

      const mdRange = this.mapVisibleRangeToMarkdownRange(rawMarkdown, caret.start, caret.end, true);
      const before = rawMarkdown.slice(0, mdRange.start).trim();
      const after = rawMarkdown.slice(mdRange.end).trim();
      const template = items[itemIndex] ?? { IsTask: false, Checked: false, Text: '' };
      if (caret.start === 0 && before.length === 0 && after.length > 0) {
        // Keep current item text in place and insert the new empty bullet BELOW, matching paragraph/heading Enter behavior
        if (items[itemIndex]) {
          items[itemIndex].Text = after;
        }
        items.splice(itemIndex + 1, 0, {
          Index: itemIndex + 1,
          IsTask: template.IsTask,
          Checked: false,
          OrderedPrefix: template.OrderedPrefix ? `${itemIndex + 2}.` : undefined,
          Text: '',
        });
      } else {
        if (items[itemIndex]) {
          items[itemIndex].Text = before;
        }
        items.splice(itemIndex + 1, 0, {
          Index: itemIndex + 1,
          IsTask: template.IsTask,
          Checked: false,
          OrderedPrefix: template.OrderedPrefix ? `${itemIndex + 2}.` : undefined,
          Text: after,
        });
      }
      this.renumberListItems(items);
      const nextListMd = this.serializeParsedListItems(items);
      if (this.ViewMode === 'edit') {
        blocks[segIdx] = nextListMd;
        this.applyBlockFlowTransaction(blocks, {
          segmentIndex: segIdx,
          position: 'start',
          listItemIndex: itemIndex + 1,
        });
      } else {
        this.ApplyInPlaceSegmentChange(seg, nextListMd, 'Inserted list item');
      }
      return;
    }

    // Backspace at offset 0 of a list item -> convert single-item list to paragraph or merge into previous item
    if (
      event.key === 'Backspace' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      caret.collapsed &&
      caret.start === 0 &&
      this.CanUserEdit &&
      this.ViewMode === 'edit' &&
      segIdx >= 0
    ) {
      event.preventDefault();
      const currentTrimmed = rawMarkdown.trim();
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);

      if (items.length <= 1) {
        blocks[segIdx] = currentTrimmed;
        this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'start' });
        return;
      }
      if (itemIndex === 0) {
        items.splice(0, 1);
        this.renumberListItems(items);
        blocks[segIdx] = this.serializeParsedListItems(items);
        blocks.splice(segIdx, 0, currentTrimmed);
        this.applyBlockFlowTransaction(blocks, { segmentIndex: segIdx, position: 'start' });
        return;
      }
      const prevText = items[itemIndex - 1].Text.trim();
      const joiner = prevText.length > 0 && currentTrimmed.length > 0 ? ' ' : '';
      const seamOffset = this.mapMarkdownOffsetToVisibleOffset(
        `${prevText}${joiner}${currentTrimmed}`,
        prevText.length + joiner.length,
      );
      items[itemIndex - 1].Text = `${prevText}${joiner}${currentTrimmed}`;
      items.splice(itemIndex, 1);
      this.renumberListItems(items);
      blocks[segIdx] = this.serializeParsedListItems(items);
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: segIdx,
        position: seamOffset,
        listItemIndex: itemIndex - 1,
      });
      return;
    }

    // ArrowUp / ArrowDown across list items and adjacent blocks
    if (
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      caret.collapsed &&
      this.CanUserEdit &&
      this.ViewMode === 'edit'
    ) {
      if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && caret.start === 0) {
        if (itemIndex > 0) {
          event.preventDefault();
          this.FocusEditableSegment(seg.SegmentID, 'end', itemIndex - 1);
          return;
        }
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && caret.end >= rawVisibleText.length) {
        if (itemIndex + 1 < items.length) {
          event.preventDefault();
          this.FocusEditableSegment(seg.SegmentID, 'start', itemIndex + 1);
          return;
        }
      }
    }

    this.OnEditableBlockKeydown(seg, event);
  }

  public AddListItem(seg: DocumentRenderSegment): void {
    const items = this.GetParsedListItems(seg);
    const first = items[0];
    const newIndex = items.length;
    items.push({
      Index: newIndex,
      IsTask: first?.IsTask ?? false,
      Checked: false,
      OrderedPrefix: first?.OrderedPrefix ? `${newIndex + 1}.` : undefined,
      Text: '',
    });
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (this.ViewMode === 'edit' && segIdx >= 0) {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      blocks[segIdx] = this.serializeParsedListItems(items);
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: segIdx,
        position: 'start',
        listItemIndex: newIndex,
      });
      return;
    }
    this.ApplyInPlaceSegmentChange(seg, this.serializeParsedListItems(items), 'Added list item');
  }

  public GetParsedCallout(seg: DocumentRenderSegment): {
    CalloutType: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
    BodyText: string;
  } {
    const lines = seg.RawMarkdown.split('\n').map((l) => l.replace(/^>\s?/, ''));
    const first = lines[0]?.trim() ?? '';
    if (first.startsWith('[!')) {
      const closeBracketIdx = first.indexOf(']');
      if (closeBracketIdx > 2) {
        const rawTag = first.slice(2, closeBracketIdx).toUpperCase();
        if (
          rawTag === 'NOTE' ||
          rawTag === 'TIP' ||
          rawTag === 'IMPORTANT' ||
          rawTag === 'WARNING' ||
          rawTag === 'CAUTION'
        ) {
          const trailingFirst = first.slice(closeBracketIdx + 1).trim();
          const restFirst = trailingFirst ? [trailingFirst] : [];
          const body = [...restFirst, ...lines.slice(1)].join('\n').trim();
          return { CalloutType: rawTag, BodyText: body };
        }
      }
    }
    return {
      CalloutType: 'NOTE',
      BodyText: lines.join('\n').trim(),
    };
  }

  public UpdateCalloutType(
    seg: DocumentRenderSegment,
    nextType: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION',
  ): void {
    const parsed = this.GetParsedCallout(seg);
    const bodyLines = parsed.BodyText.split('\n').map((l) => `> ${l}`);
    const nextMd = [`> [!${nextType}]`, ...bodyLines].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed callout type to ${nextType}`);
  }

  public CommitEditableCallout(seg: DocumentRenderSegment, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextBody = this.ExtractMarkdownFromEditableElement(el).trim();
    const parsed = this.GetParsedCallout(seg);
    if (nextBody === parsed.BodyText) {
      return;
    }
    const bodyLines = nextBody.split('\n').map((l) => `> ${l}`);
    const nextMd = [`> [!${parsed.CalloutType}]`, ...bodyLines].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, 'Updated callout content');
  }

  public GetParsedCodeBlock(seg: DocumentRenderSegment): { Language: string; Code: string } {
    const lines = seg.RawMarkdown.split('\n');
    const first = lines[0]?.trim() ?? '```';
    const lang = first.replace(/^```/, '').trim() || 'typescript';
    const innerLines =
      lines.length >= 2 && lines[lines.length - 1].trim().startsWith('```')
        ? lines.slice(1, -1)
        : lines.slice(1);
    return {
      Language: lang,
      Code: innerLines.join('\n'),
    };
  }

  public UpdateCodeBlockLanguage(seg: DocumentRenderSegment, nextLang: string): void {
    const parsed = this.GetParsedCodeBlock(seg);
    const nextMd = ['```' + (nextLang || '').trim(), parsed.Code, '```'].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed code block language to ${nextLang}`);
  }

  public CommitEditableCodeBlock(seg: DocumentRenderSegment, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextCode = el?.textContent ?? '';
    const parsed = this.GetParsedCodeBlock(seg);
    if (nextCode === parsed.Code) {
      return;
    }
    const nextMd = ['```' + parsed.Language, nextCode, '```'].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, 'Updated code block');
  }

  /**
   * Applies an in-place block edit either as a direct collaborative edit (`ViewMode === 'edit'`)
   * or as a tracked Suggestion Card attached to that block (`ViewMode === 'suggest'`).
   */
  public ApplyInPlaceSegmentChange(
    seg: DocumentRenderSegment,
    nextBlockMarkdown: string,
    rationale = 'In-place block edit',
  ): void {
    if (!this.CanUserEdit || nextBlockMarkdown === seg.RawMarkdown) {
      return;
    }
    if (this.ViewMode === 'suggest') {
      this.CreateOrUpdatePendingSuggestion(
        seg.SegmentID,
        seg.RawMarkdown,
        nextBlockMarkdown,
        rationale,
      );
      this.StatusBannerMessage = `Queued tracked suggestion on block (${rationale}).`;
      return;
    }
    this.ReplaceSegmentMarkdown(seg, nextBlockMarkdown);
  }

  /**
   * Replaces a single segment's Markdown in the document and broadcasts the minimal diff via Yjs,
   * preserving any other empty draft paragraph placeholders already present in `DocumentSegments`.
   */
  public ReplaceSegmentMarkdown(seg: DocumentRenderSegment, nextBlockMarkdown: string): void {
    const previousSegments = this.DocumentSegments;
    const nextBlockMarkdowns = previousSegments.map((s) =>
      s.SegmentID === seg.SegmentID ? nextBlockMarkdown : s.RawMarkdown,
    );
    const hasPreservedEmptyDrafts =
      this.ViewMode === 'edit' &&
      previousSegments.some((s) => s.SegmentID !== seg.SegmentID && s.RawMarkdown.trim().length === 0);

    const preservedBlocks: string[] = [];
    const preservedPrevSegments: DocumentRenderSegment[] = [];
    for (let i = 0; i < nextBlockMarkdowns.length; i++) {
      const md = nextBlockMarkdowns[i];
      const prevSeg = previousSegments[i];
      if (md.trim().length > 0) {
        preservedBlocks.push(md);
        preservedPrevSegments.push(prevSeg);
      } else if (hasPreservedEmptyDrafts && prevSeg && prevSeg.SegmentID !== seg.SegmentID) {
        preservedBlocks.push('');
        preservedPrevSegments.push(prevSeg);
      }
    }

    const nonEmptyJoined = preservedBlocks.filter((md) => md.trim().length > 0).join('\n\n');
    this.OnMarkdownChanged(nonEmptyJoined);
    if (hasPreservedEmptyDrafts) {
      this.preserveEmptyDraftSegments(preservedBlocks, preservedPrevSegments);
      this.cdr.markForCheck();
    }
  }

  /**
   * Returns `true` when `el` is a live browser DOM `Node` rather than a headless unit-test mock object.
   */
  private isDomNode(el: HTMLElement | null): el is HTMLElement {
    return Boolean(el && typeof Node !== 'undefined' && el instanceof Node);
  }

  private getEditableCanvasRoot(): ParentNode | null {
    return (
      this.PrintableCanvas?.nativeElement ??
      this.hostElement?.nativeElement ??
      (typeof document !== 'undefined' ? document : null)
    );
  }

  private preserveEmptyDraftSegments(
    blockMarkdowns: string[],
    previousSegments: DocumentRenderSegment[] = [],
  ): void {
    if (!blockMarkdowns.some((md) => md.trim().length === 0)) {
      return;
    }
    const parsedNonEmpty = [...this.DocumentSegments];
    const merged: DocumentRenderSegment[] = [];
    let parsedCursor = 0;
    for (let i = 0; i < blockMarkdowns.length; i++) {
      if (blockMarkdowns[i].trim().length === 0) {
        const prevLine = merged[merged.length - 1]?.EndLine ?? 0;
        const existingDraft = previousSegments[i];
        if (existingDraft && existingDraft.RawMarkdown.trim().length === 0) {
          merged.push({
            ...existingDraft,
            StartLine: prevLine + 1,
            EndLine: prevLine + 1,
          });
        } else {
          merged.push(this.createDraftParagraphSegment(prevLine + 1));
        }
      } else if (parsedCursor < parsedNonEmpty.length) {
        merged.push(parsedNonEmpty[parsedCursor++]);
      }
    }
    while (parsedCursor < parsedNonEmpty.length) {
      merged.push(parsedNonEmpty[parsedCursor++]);
    }
    this.DocumentSegments = merged;
  }

  private syncPeerListItemsFromDom(
    seg: DocumentRenderSegment,
    items: Array<{ Index: number; IsTask: boolean; Checked: boolean; OrderedPrefix?: string; Text: string }>,
    skipItemIndex?: number,
  ): void {
    const root = this.getEditableCanvasRoot();
    if (!root) {
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (i === skipItemIndex) {
        continue;
      }
      const peerEl = root.querySelector<HTMLElement>(
        `[data-testid="list-item-text-${seg.SegmentID}-${i}"]`,
      );
      if (peerEl && this.isDomNode(peerEl)) {
        const domText = this.ExtractMarkdownFromEditableElement(peerEl).replace(/\n+/g, ' ').trim();
        if (domText !== items[i].Text) {
          items[i].Text = domText;
        }
      }
    }
  }

  private syncDirtySegmentsFromDomIntoBlocks(blocks: string[]): void {
    const root = this.getEditableCanvasRoot();
    if (!root) {
      return;
    }
    for (let i = 0; i < this.DocumentSegments.length; i++) {
      const seg = this.DocumentSegments[i];
      if (seg.Kind !== 'markdown') {
        continue;
      }
      if (seg.BlockKind === 'heading') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-heading-${seg.SegmentID}"]`);
        if (el && this.isDomNode(el)) {
          const domText = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ').trim();
          const modelText = (seg.HeadingText ?? this.GetEditableHeadingText(seg)).trim();
          if (domText !== modelText) {
            const level = seg.HeadingLevel ?? 1;
            blocks[i] = `${'#'.repeat(level)} ${domText}`;
          }
        }
      } else if (seg.BlockKind === 'list') {
        const items = this.GetParsedListItems(seg);
        let changed = false;
        for (let idx = 0; idx < items.length; idx++) {
          const el = root.querySelector<HTMLElement>(
            `[data-testid="list-item-text-${seg.SegmentID}-${idx}"]`,
          );
          if (el && this.isDomNode(el)) {
            const domText = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ').trim();
            if (domText !== items[idx].Text) {
              items[idx].Text = domText;
              changed = true;
            }
          }
        }
        if (changed) {
          blocks[i] = this.serializeParsedListItems(items);
        }
      } else if (seg.BlockKind === 'callout') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-callout-body-${seg.SegmentID}"]`);
        if (el && this.isDomNode(el)) {
          const domBody = this.ExtractMarkdownFromEditableElement(el).trim();
          const parsed = this.GetParsedCallout(seg);
          if (domBody !== parsed.BodyText) {
            blocks[i] = [`> [!${parsed.CalloutType}]`, ...domBody.split('\n').map((l) => `> ${l}`)].join('\n');
          }
        }
      } else if (seg.BlockKind === 'paragraph' || !seg.BlockKind) {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-paragraph-${seg.SegmentID}"]`);
        if (el && this.isDomNode(el)) {
          const domText = this.ExtractMarkdownFromEditableElement(el).trim();
          if (domText !== seg.RawMarkdown.trim()) {
            blocks[i] = domText;
          }
        }
      }
    }
  }

  private syncRenderedEditableSurfacesWithModel(): void {
    const root = this.getEditableCanvasRoot();
    if (!root) {
      return;
    }
    const syncSurface = (el: HTMLElement | null, expectedMarkdown: string): void => {
      if (!el || !this.isDomNode(el)) {
        return;
      }
      const expectedHtml = this.RenderInlineEditableHtml(expectedMarkdown);
      if (el.innerHTML !== expectedHtml) {
        el.innerHTML = expectedHtml;
      }
    };

    for (const seg of this.DocumentSegments) {
      if (seg.Kind !== 'markdown') {
        continue;
      }
      if (seg.BlockKind === 'heading') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-heading-${seg.SegmentID}"]`);
        syncSurface(el, seg.HeadingText ?? this.GetEditableHeadingText(seg));
      } else if (seg.BlockKind === 'list') {
        const items = this.GetParsedListItems(seg);
        for (const item of items) {
          const el = root.querySelector<HTMLElement>(
            `[data-testid="list-item-text-${seg.SegmentID}-${item.Index}"]`,
          );
          syncSurface(el, item.Text);
        }
      } else if (seg.BlockKind === 'callout') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-callout-body-${seg.SegmentID}"]`);
        syncSurface(el, this.GetParsedCallout(seg).BodyText);
      } else if (seg.BlockKind === 'table') {
        const parsed = this.GetParsedTable(seg);
        parsed.Headers.forEach((hdr, cIdx) => {
          const el = root.querySelector<HTMLElement>(
            `[data-testid="table-header-${seg.SegmentID}-${cIdx}"]`,
          );
          syncSurface(el, hdr);
        });
        parsed.Rows.forEach((row, rIdx) => {
          row.forEach((cell, cIdx) => {
            const el = root.querySelector<HTMLElement>(
              `[data-testid="table-cell-${seg.SegmentID}-${rIdx}-${cIdx}"]`,
            );
            syncSurface(el, cell);
          });
        });
      } else if (seg.BlockKind === 'code') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-code-body-${seg.SegmentID}"]`);
        const expectedCode = this.GetParsedCodeBlock(seg).Code;
        if (el && this.isDomNode(el) && el.textContent !== expectedCode) {
          el.textContent = expectedCode;
        }
      } else {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-paragraph-${seg.SegmentID}"]`);
        syncSurface(el, seg.RawMarkdown);
      }
    }
  }

  /**
   * Creates an in-memory empty draft paragraph segment so newly inserted paragraphs (`Enter` after a heading
   * or paragraph, or clicking the trailing canvas flow zone) render immediately as editable DOM blocks.
   */
  private createDraftParagraphSegment(startLine: number): DocumentRenderSegment {
    const id = `paragraph-draft-${++this.draftSegmentCounter}`;
    return {
      SegmentID: id,
      Kind: 'markdown',
      BlockKind: 'paragraph',
      StartLine: startLine,
      EndLine: startLine,
      RawMarkdown: '',
    };
  }

  /**
   * Applies a block-level flow transaction (splitting, merging, inserting, or auto-converting blocks),
   * preserving any empty draft paragraph segments in `DocumentSegments` while keeping `MarkdownContent`
   * and the Yjs collaboration session clean, then focuses the target segment and places the caret.
   */
  private applyBlockFlowTransaction(
    nextBlockMarkdowns: string[],
    focusSpec?: {
      segmentIndex: number;
      position?: 'start' | 'end' | number;
      listItemIndex?: number;
    },
  ): void {
    this.isApplyingBlockTransaction = true;
    try {
      const nonEmptyBlocks = nextBlockMarkdowns.filter((md) => md.trim().length > 0);
      const nextMarkdown = nonEmptyBlocks.join('\n\n');
      this.MarkdownContent = nextMarkdown;
      this.refreshParsedStructure();
      if (this.session) {
        this.session.SetContent(this.MarkdownContent);
      }

      this.preserveEmptyDraftSegments(nextBlockMarkdowns);

      if (this.DocumentSegments.length === 0 && this.IsInteractiveCanvasMode) {
        this.DocumentSegments = [this.createDraftParagraphSegment(1)];
      }

      this.cdr.markForCheck();
      try {
        this.cdr.detectChanges();
      } catch {
        // Ignore if view is not yet attached in headless unit tests
      }

      // Ensure reused DOM nodes match model HTML even if Angular memoized the pre-edit [innerHTML]
      this.syncRenderedEditableSurfacesWithModel();

      if (focusSpec) {
        const clampedIdx = Math.max(
          0,
          Math.min(this.DocumentSegments.length - 1, focusSpec.segmentIndex),
        );
        const targetSeg = this.DocumentSegments[clampedIdx];
        if (targetSeg) {
          this.SelectedAnchorKey = targetSeg.SegmentID;
          this.lastFocusedSegmentId = targetSeg.SegmentID;
          this.FocusEditableSegment(
            targetSeg.SegmentID,
            focusSpec.position ?? 'start',
            focusSpec.listItemIndex,
          );
        }
      }
    } finally {
      this.isApplyingBlockTransaction = false;
    }
  }

  /**
   * Reads the current character selection/caret offsets inside a `contenteditable` element.
   * Always prefers live `window.getSelection()` for real DOM nodes and falls back to `selectionStart`/`selectionEnd`
   * only on headless unit-test mock elements.
   */
  private getCaretCharacterOffsetWithin(
    el: HTMLElement | null,
  ): { start: number; end: number; collapsed: boolean } {
    if (!el) {
      return { start: 0, end: 0, collapsed: true };
    }
    const totalLen = (el.textContent ?? '').length;
    if (
      this.isDomNode(el) &&
      typeof window !== 'undefined' &&
      typeof window.getSelection === 'function'
    ) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer) && el.contains(range.endContainer)) {
          const measureOffset = (container: Node, offset: number): number => {
            const pre = range.cloneRange();
            pre.selectNodeContents(el);
            pre.setEnd(container, offset);
            let charCount = pre.toString().length;
            if (typeof pre.cloneContents === 'function') {
              const frag = pre.cloneContents();
              if (typeof frag.querySelectorAll === 'function') {
                charCount += frag.querySelectorAll('br').length;
              }
            }
            return charCount;
          };
          const start = measureOffset(range.startContainer, range.startOffset);
          const end = range.collapsed
            ? start
            : Math.max(start, measureOffset(range.endContainer, range.endOffset));
          return { start, end, collapsed: range.collapsed };
        }
      }
      return { start: totalLen, end: totalLen, collapsed: true };
    }
    const testEl = el as HTMLElement & { selectionStart?: number; selectionEnd?: number };
    if (!this.isDomNode(el) && typeof testEl.selectionStart === 'number') {
      const start = Math.max(0, Math.min(totalLen, testEl.selectionStart));
      const end =
        typeof testEl.selectionEnd === 'number'
          ? Math.max(start, Math.min(totalLen, testEl.selectionEnd))
          : start;
      return { start, end, collapsed: start === end };
    }
    return { start: totalLen, end: totalLen, collapsed: true };
  }

  /**
   * Focuses the editable DOM surface for `segmentId` (or a specific list item inside it)
   * and places the DOM selection caret at `'start'`, `'end'`, or a specific character offset.
   */
  public FocusEditableSegment(
    segmentId: string,
    position: 'start' | 'end' | number = 'start',
    listItemIndex?: number,
  ): void {
    this.SelectedAnchorKey = segmentId;
    this.lastFocusedSegmentId = segmentId;
    const attemptFocus = (): boolean => {
      const root = this.getEditableCanvasRoot();
      if (!root) {
        return false;
      }
      let targetEl: HTMLElement | null = null;
      if (listItemIndex !== undefined) {
        targetEl = root.querySelector<HTMLElement>(
          `[data-testid="list-item-text-${segmentId}-${listItemIndex}"]`,
        );
      }
      if (!targetEl) {
        targetEl =
          root.querySelector<HTMLElement>(`[data-testid="editable-heading-${segmentId}"]`) ??
          root.querySelector<HTMLElement>(`[data-testid="editable-paragraph-${segmentId}"]`) ??
          root.querySelector<HTMLElement>(`[data-testid="editable-callout-body-${segmentId}"]`) ??
          root.querySelector<HTMLElement>(`[data-testid="editable-code-body-${segmentId}"]`);
      }
      if (!targetEl) {
        const listItems = root.querySelectorAll<HTMLElement>(
          `[data-testid^="list-item-text-${segmentId}-"]`,
        );
        if (listItems.length > 0) {
          targetEl =
            position === 'end' ? listItems[listItems.length - 1] : listItems[0];
        }
      }
      if (!targetEl) {
        targetEl = root.querySelector<HTMLElement>(
          `[data-testid="table-header-${segmentId}-0"]`,
        );
      }
      if (!targetEl) {
        return false;
      }
      targetEl.focus();
      this.placeCaretInEditableElement(targetEl, position);
      this.CaptureSelectionSnapshot();
      return true;
    };

    if (!attemptFocus() && typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        attemptFocus();
      });
    }
  }

  /**
   * @deprecated Use {@link FocusEditableSegment} instead.
   */
  public focusEditableSegment(
    segmentId: string,
    position: 'start' | 'end' | number = 'start',
    listItemIndex?: number,
  ): void {
    this.FocusEditableSegment(segmentId, position, listItemIndex);
  }

  private placeCaretInEditableElement(
    el: HTMLElement,
    position: 'start' | 'end' | number,
  ): void {
    const textLen = (el.textContent ?? '').length;
    const targetOffset =
      position === 'start'
        ? 0
        : position === 'end'
          ? textLen
          : Math.max(0, Math.min(textLen, position));
    const testEl = el as HTMLElement & { selectionStart?: number; selectionEnd?: number };
    if (this.isDomNode(el)) {
      delete testEl.selectionStart;
      delete testEl.selectionEnd;
    } else {
      testEl.selectionStart = targetOffset;
      testEl.selectionEnd = targetOffset;
    }

    if (
      typeof document === 'undefined' ||
      typeof window === 'undefined' ||
      typeof window.getSelection !== 'function'
    ) {
      return;
    }
    const sel = window.getSelection();
    if (!sel) {
      return;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let targetNode: Node | null = null;
    let targetNodeOffset = 0;
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent?.length ?? 0;
      if (targetOffset <= currentOffset + len) {
        targetNode = node;
        targetNodeOffset = Math.max(0, targetOffset - currentOffset);
        break;
      }
      currentOffset += len;
      targetNode = node;
      targetNodeOffset = len;
      node = walker.nextNode();
    }
    const range = document.createRange();
    if (targetNode) {
      range.setStart(targetNode, targetNodeOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(position === 'start' || targetOffset === 0);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private placeSelectionRangeInEditableElement(
    el: HTMLElement,
    startOffset: number,
    endOffset: number,
  ): void {
    const textLen = (el.textContent ?? '').length;
    const clampedStart = Math.max(0, Math.min(textLen, startOffset));
    const clampedEnd = Math.max(clampedStart, Math.min(textLen, endOffset));

    if (clampedStart === clampedEnd) {
      this.placeCaretInEditableElement(el, clampedStart);
      return;
    }

    const testEl = el as HTMLElement & { selectionStart?: number; selectionEnd?: number };
    if (this.isDomNode(el)) {
      delete testEl.selectionStart;
      delete testEl.selectionEnd;
    } else {
      testEl.selectionStart = clampedStart;
      testEl.selectionEnd = clampedEnd;
    }

    if (
      typeof document === 'undefined' ||
      typeof window === 'undefined' ||
      typeof window.getSelection !== 'function'
    ) {
      return;
    }
    const sel = window.getSelection();
    if (!sel) {
      return;
    }

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let startNode: Node | null = null;
    let startNodeOffset = 0;
    let endNode: Node | null = null;
    let endNodeOffset = 0;

    let node = walker.nextNode();
    while (node) {
      const len = node.textContent?.length ?? 0;
      const nextOffset = currentOffset + len;
      if (!startNode && clampedStart <= nextOffset) {
        startNode = node;
        startNodeOffset = Math.max(0, clampedStart - currentOffset);
      }
      if (!endNode && clampedEnd <= nextOffset) {
        endNode = node;
        endNodeOffset = Math.max(0, clampedEnd - currentOffset);
        break;
      }
      currentOffset = nextOffset;
      node = walker.nextNode();
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  private restoreInlineSelectionAfterTransaction(
    segmentIndex: number,
    selectStart: number,
    selectEnd: number,
    coords?: {
      listItemIndex?: number;
      tableRowIndex?: number;
      tableColIndex?: number;
      isTableHeader?: boolean;
    },
  ): void {
    const clampedIdx = Math.max(0, Math.min(this.DocumentSegments.length - 1, segmentIndex));
    const targetSeg = this.DocumentSegments[clampedIdx];
    if (!targetSeg) {
      return;
    }

    this.SelectedAnchorKey = targetSeg.SegmentID;
    this.lastFocusedSegmentId = targetSeg.SegmentID;
    this.lastFocusedListItemIndex = coords?.listItemIndex ?? null;
    this.lastFocusedTableCell =
      coords?.tableColIndex !== undefined
        ? {
            rowIndex: coords.tableRowIndex ?? 0,
            colIndex: coords.tableColIndex,
            isHeader: Boolean(coords.isTableHeader),
          }
        : null;
    this.lastSelectionSnapshot = {
      segmentId: targetSeg.SegmentID,
      listItemIndex: coords?.listItemIndex,
      tableRowIndex: coords?.tableRowIndex,
      tableColIndex: coords?.tableColIndex,
      isTableHeader: coords?.isTableHeader,
      start: selectStart,
      end: selectEnd,
    };

    const applyRange = (): boolean => {
      const el = this.findEditableElementForSegment(targetSeg, coords);
      if (!el) {
        return false;
      }
      el.focus();
      this.placeSelectionRangeInEditableElement(el, selectStart, selectEnd);
      return true;
    };

    if (!applyRange() && typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        applyRange();
      });
    }
  }

  private findEditableElementForSegment(
    seg: DocumentRenderSegment,
    coords?: {
      listItemIndex?: number;
      tableRowIndex?: number;
      tableColIndex?: number;
      isTableHeader?: boolean;
    },
  ): HTMLElement | null {
    const root: ParentNode | null =
      this.PrintableCanvas?.nativeElement ??
      this.hostElement?.nativeElement ??
      (typeof document !== 'undefined' ? document : null);
    if (!root) {
      return null;
    }
    if (coords?.listItemIndex !== undefined) {
      return root.querySelector<HTMLElement>(
        `[data-testid="list-item-text-${seg.SegmentID}-${coords.listItemIndex}"]`,
      );
    }
    if (coords?.tableColIndex !== undefined) {
      if (coords.isTableHeader) {
        return root.querySelector<HTMLElement>(
          `[data-testid="table-header-${seg.SegmentID}-${coords.tableColIndex}"]`,
        );
      }
      return root.querySelector<HTMLElement>(
        `[data-testid="table-cell-${seg.SegmentID}-${coords.tableRowIndex ?? 0}-${coords.tableColIndex}"]`,
      );
    }
    return (
      root.querySelector<HTMLElement>(`[data-testid="editable-heading-${seg.SegmentID}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="editable-paragraph-${seg.SegmentID}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="editable-callout-body-${seg.SegmentID}"]`) ??
      root.querySelector<HTMLElement>(`[data-testid="editable-code-body-${seg.SegmentID}"]`)
    );
  }

  private findAdjacentEditableSegmentIndex(
    currentSegmentId: string,
    direction: -1 | 1,
  ): number {
    const startIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === currentSegmentId);
    if (startIdx < 0) {
      return -1;
    }
    let idx = startIdx + direction;
    while (idx >= 0 && idx < this.DocumentSegments.length) {
      const candidate = this.DocumentSegments[idx];
      if (
        candidate.Kind === 'markdown' &&
        !this.IsSegmentHiddenByCollapsedHeading(candidate)
      ) {
        return idx;
      }
      idx += direction;
    }
    return -1;
  }

  private flushElementBeforeNavigation(
    seg: DocumentRenderSegment,
    el: HTMLElement | null,
  ): void {
    if (!el) {
      return;
    }
    if (seg.BlockKind === 'heading') {
      this.CommitEditableHeading(seg, { target: el } as unknown as Event);
    } else if (seg.BlockKind === 'paragraph' || !seg.BlockKind) {
      const text = this.ExtractMarkdownFromEditableElement(el).trim();
      if (text && text !== seg.RawMarkdown.trim()) {
        this.CommitEditableParagraph(seg, { target: el } as unknown as Event);
      }
    } else if (seg.BlockKind === 'callout') {
      this.CommitEditableCallout(seg, { target: el } as unknown as Event);
    }
  }

  /**
   * Moves a segment up (`direction = -1`) or down (`direction = 1`) in the document flow.
   */
  public MoveSegment(seg: DocumentRenderSegment, direction: -1 | 1): void {
    if (!this.CanUserEdit) {
      return;
    }
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= this.DocumentSegments.length) {
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    const [moved] = blocks.splice(idx, 1);
    blocks.splice(targetIdx, 0, moved);
    this.OnMarkdownChanged(blocks.join('\n\n'));
  }

  /**
   * Deletes a segment from the document.
   */
  public DeleteSegment(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit || this.DocumentSegments.length <= 1) {
      return;
    }
    const remaining = this.DocumentSegments.filter((s) => s.SegmentID !== seg.SegmentID).map(
      (s) => s.RawMarkdown,
    );
    this.OnMarkdownChanged(remaining.join('\n\n'));
  }

  /**
   * Toggles full-screen modal view for an embedded OLE `Artifact` block (§ 3.4.1).
   */
  public ToggleExpandOleBlock(block: DocumentBlockSpec): void {
    this.ExpandedOleBlockID = this.ExpandedOleBlockID === block.BlockID ? null : block.BlockID;
    this.cdr.markForCheck();
  }

  public GetPinArtifactVersionButtonLabel(block: DocumentBlockSpec): string {
    if (block.VersionID) {
      return 'Unpin Version';
    }
    const currentVer = this.GetEmbeddedArtifactVersion(block);
    return `Pin to v${currentVer?.VersionNumber || 1}`;
  }

  /**
   * Toggles whether an embedded OLE `Artifact` block pins a specific `VersionID` or tracks the latest version (§ 3.4.1).
   */
  public TogglePinArtifactVersion(block: DocumentBlockSpec): void {
    if (!this.CanUserEdit) {
      return;
    }
    const currentVer = this.GetEmbeddedArtifactVersion(block);
    if (!block.VersionID && !currentVer?.ID) {
      this.notifyError('Embedded artifact version is not loaded yet and cannot be pinned.');
      return;
    }
    const updatedDescriptor: DocumentBlockSpec = {
      ...block,
      VersionID: block.VersionID ? undefined : currentVer?.ID,
    };
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      block.BlockID,
      updatedDescriptor,
    );
    this.OnMarkdownChanged(updatedRes.Markdown);
    this.StatusBannerMessage = updatedDescriptor.VersionID
      ? `Pinned ${block.Title || 'embedded artifact'} to v${currentVer?.VersionNumber || 1}.`
      : `Unpinned ${block.Title || 'embedded artifact'} (now tracking latest version).`;
  }

  /**
   * Inserts a formatting snippet or opens the Slash Menu when `/` is typed at the end of a line.
   */
  public OnEditorTextareaInput(nextValue: string): void {
    if (nextValue.endsWith('\n/') || nextValue === '/') {
      this.ShowSlashMenu = true;
      this.SlashSearchQuery = '';
    }

    if (this.ViewMode === 'suggest' && nextValue !== this.MarkdownContent) {
      const targetSeg = this.DocumentSegments[0];
      const blockId = targetSeg?.SegmentID ?? 'doc-root';
      this.CreateOrUpdatePendingSuggestion(blockId, this.MarkdownContent, nextValue, 'Proposed edit in Suggest Mode');
      return;
    }

    this.OnMarkdownChanged(nextValue);
  }

  /**
   * Synchronizes Markdown edits with the parsed block segments, TOC outline, and Yjs session.
   */
  public OnMarkdownChanged(nextMarkdown: string, fromYjs = false): void {
    this.MarkdownContent = nextMarkdown ?? '';
    this.refreshParsedStructure();
    if (!fromYjs && this.session) {
      this.session.SetContent(this.MarkdownContent);
    }
    this.cdr.markForCheck();
  }

  /**
   * Formats the active selection in-place (`**bold**`, `*italic*`, headings, lists, callouts)
   * or inserts a structured block when the current target is empty or requires a new block (such as tables).
   */
  public InsertFormattingSnippet(prefix: string, suffix: string): void {
    if (!this.CanUserEdit) {
      return;
    }

    this.CaptureSelectionSnapshot();
    const segIdx = this.resolveFormattingTargetSegmentIndex();

    if (suffix.length > 0) {
      if (segIdx >= 0 && segIdx < this.DocumentSegments.length && this.DocumentSegments[segIdx]?.Kind === 'markdown') {
        this.applyInlineFormattingToSegment(segIdx, prefix, suffix);
        return;
      }
      this.insertMarkdownAtTargetSegment(`${prefix}text${suffix}`);
      return;
    }

    if (segIdx >= 0 && segIdx < this.DocumentSegments.length && this.DocumentSegments[segIdx]?.Kind === 'markdown') {
      if (this.applyBlockLevelFormattingToSegment(segIdx, prefix)) {
        return;
      }
    }

    this.insertMarkdownAtTargetSegment(prefix);
  }

  /**
   * Renders inline Markdown (`**bold**`, `*italic*`, `` `code` ``, `***both***`) as sanitized WYSIWYG HTML
   * for `contenteditable` surfaces while preserving newlines as `<br>`.
   */
  public RenderInlineEditableHtml(markdownText: string): string {
    if (!markdownText) {
      return '';
    }
    const tokens = this.tokenizeInlineMarkdown(markdownText);
    return tokens
      .map((tok) => {
        const escaped = EscapeHtml(tok.content);
        switch (tok.kind) {
          case 'code':
            return `<code>${escaped}</code>`;
          case 'bold_italic':
            return `<strong><em>${escaped}</em></strong>`;
          case 'bold':
            return `<strong>${escaped}</strong>`;
          case 'italic':
            return `<em>${escaped}</em>`;
          default:
            return escaped.replace(/\n/g, '<br>');
        }
      })
      .join('');
  }

  /**
   * Serializes a WYSIWYG `contenteditable` element's DOM tree (`<strong>`, `<b>`, `<em>`, `<i>`, `<code>`, `<br>`)
   * back into Markdown text (`**bold**`, `*italic*`, `` `code` ``). Falls back directly to `el.textContent`
   * when running in headless mocks without child nodes.
   */
  public ExtractMarkdownFromEditableElement(el: HTMLElement | null): string {
    if (!el) {
      return '';
    }
    if (!el.childNodes || el.childNodes.length === 0) {
      return el.textContent ?? '';
    }
    const out: string[] = [];
    const serializeNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push((node.textContent ?? '').replace(/\u00a0/g, ' '));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      const elm = node as HTMLElement;
      const tag = (elm.tagName || '').toUpperCase();
      if (tag === 'BR') {
        out.push('\n');
        return;
      }

      const prevLen = out.length;
      if (elm.childNodes && elm.childNodes.length > 0) {
        elm.childNodes.forEach((child) => serializeNode(child));
      } else if (elm.textContent) {
        out.push(elm.textContent.replace(/\u00a0/g, ' '));
      }
      const inner = out.splice(prevLen).join('');

      const fontWeight = elm.style?.fontWeight ?? '';
      const numericWeight = Number.parseInt(fontWeight, 10);
      const isBold =
        tag === 'STRONG' ||
        tag === 'B' ||
        fontWeight.toLowerCase() === 'bold' ||
        (!Number.isNaN(numericWeight) && numericWeight >= 600);
      const isItalic =
        tag === 'EM' ||
        tag === 'I' ||
        (elm.style?.fontStyle ?? '').toLowerCase() === 'italic';

      const splitWhitespace = (raw: string): { lead: string; core: string; trail: string } => {
        const leadMatch = /^(\s*)/.exec(raw);
        const lead = leadMatch ? leadMatch[1] : '';
        const trailMatch = /(\s*)$/.exec(raw.slice(lead.length));
        const trail = trailMatch ? trailMatch[1] : '';
        const core = raw.slice(lead.length, raw.length - trail.length);
        return { lead, core, trail };
      };

      if (tag === 'CODE') {
        const { lead, core, trail } = splitWhitespace(inner);
        if (core.length > 0) {
          const cleanCore = core.startsWith('`') && core.endsWith('`') && core.length > 2 ? core.slice(1, -1) : core;
          out.push(`${lead}\`${cleanCore}\`${trail}`);
        } else {
          out.push(inner);
        }
        return;
      }

      if (isBold || isItalic) {
        const { lead, core, trail } = splitWhitespace(inner);
        if (core.length === 0) {
          out.push(inner);
          return;
        }
        if (isBold && isItalic) {
          if (core.startsWith('***') && core.endsWith('***') && core.length > 6) {
            out.push(`${lead}${core}${trail}`);
          } else if (core.startsWith('**') && core.endsWith('**') && core.length > 4) {
            out.push(`${lead}***${core.slice(2, -2)}***${trail}`);
          } else if (core.startsWith('*') && core.endsWith('*') && core.length > 2) {
            out.push(`${lead}***${core.slice(1, -1)}***${trail}`);
          } else {
            out.push(`${lead}***${core}***${trail}`);
          }
          return;
        }
        if (isBold) {
          if (
            (core.startsWith('**') && core.endsWith('**') && core.length > 4) ||
            (core.startsWith('__') && core.endsWith('__') && core.length > 4)
          ) {
            out.push(`${lead}${core}${trail}`);
          } else {
            out.push(`${lead}**${core}**${trail}`);
          }
          return;
        }
        if (
          core.startsWith('*') &&
          !core.startsWith('**') &&
          core.endsWith('*') &&
          !core.endsWith('**') &&
          core.length > 2
        ) {
          out.push(`${lead}${core}${trail}`);
        } else {
          out.push(`${lead}*${core}*${trail}`);
        }
        return;
      }

      if ((tag === 'DIV' || tag === 'P') && out.length > 0) {
        const prev = out[out.length - 1] ?? '';
        if (prev.length > 0 && !prev.endsWith('\n')) {
          out.push('\n');
        }
      }
      out.push(inner);
    };

    el.childNodes.forEach((child) => serializeNode(child));
    return out.join('');
  }

  private tokenizeInlineMarkdown(markdown: string): DocsInlineToken[] {
    const tokens: DocsInlineToken[] = [];
    const len = markdown.length;
    let i = 0;
    let visCursor = 0;
    let textStartMd = 0;
    let textStartVis = 0;

    const flushPlainText = (endMd: number): void => {
      if (endMd > textStartMd) {
        const chunk = markdown.slice(textStartMd, endMd);
        tokens.push({
          kind: 'text',
          mdStart: textStartMd,
          mdEnd: endMd,
          visStart: textStartVis,
          visEnd: textStartVis + chunk.length,
          markerLen: 0,
          content: chunk,
        });
      }
    };

    const findCloseOnSameLine = (startPos: number, delim: string): number => {
      const lineBreak = markdown.indexOf('\n', startPos);
      const limit = lineBreak >= 0 ? lineBreak : len;
      let idx = startPos;
      while (idx + delim.length <= limit) {
        if (markdown.startsWith(delim, idx)) {
          return idx;
        }
        idx++;
      }
      return -1;
    };

    while (i < len) {
      let matched = false;
      const ch = markdown[i];

      if (ch === '`') {
        const closeIdx = findCloseOnSameLine(i + 1, '`');
        if (closeIdx > i + 1) {
          const content = markdown.slice(i + 1, closeIdx);
          flushPlainText(i);
          tokens.push({
            kind: 'code',
            mdStart: i,
            mdEnd: closeIdx + 1,
            visStart: visCursor,
            visEnd: visCursor + content.length,
            markerLen: 1,
            content,
          });
          visCursor += content.length;
          i = closeIdx + 1;
          textStartMd = i;
          textStartVis = visCursor;
          matched = true;
        }
      } else if (markdown.startsWith('***', i)) {
        const closeIdx = findCloseOnSameLine(i + 3, '***');
        if (closeIdx > i + 3) {
          const content = markdown.slice(i + 3, closeIdx);
          if (content.trim().length > 0) {
            flushPlainText(i);
            tokens.push({
              kind: 'bold_italic',
              mdStart: i,
              mdEnd: closeIdx + 3,
              visStart: visCursor,
              visEnd: visCursor + content.length,
              markerLen: 3,
              content,
            });
            visCursor += content.length;
            i = closeIdx + 3;
            textStartMd = i;
            textStartVis = visCursor;
            matched = true;
          }
        }
      } else if (markdown.startsWith('**', i)) {
        const closeIdx = findCloseOnSameLine(i + 2, '**');
        if (closeIdx > i + 2) {
          const content = markdown.slice(i + 2, closeIdx);
          if (content.trim().length > 0) {
            flushPlainText(i);
            tokens.push({
              kind: 'bold',
              mdStart: i,
              mdEnd: closeIdx + 2,
              visStart: visCursor,
              visEnd: visCursor + content.length,
              markerLen: 2,
              content,
            });
            visCursor += content.length;
            i = closeIdx + 2;
            textStartMd = i;
            textStartVis = visCursor;
            matched = true;
          }
        }
      } else if (markdown.startsWith('__', i) && (i === 0 || !/[A-Za-z0-9_]/.test(markdown[i - 1]))) {
        const closeIdx = findCloseOnSameLine(i + 2, '__');
        if (
          closeIdx > i + 2 &&
          (closeIdx + 2 >= len || !/[A-Za-z0-9_]/.test(markdown[closeIdx + 2]))
        ) {
          const content = markdown.slice(i + 2, closeIdx);
          if (content.trim().length > 0) {
            flushPlainText(i);
            tokens.push({
              kind: 'bold',
              mdStart: i,
              mdEnd: closeIdx + 2,
              visStart: visCursor,
              visEnd: visCursor + content.length,
              markerLen: 2,
              content,
            });
            visCursor += content.length;
            i = closeIdx + 2;
            textStartMd = i;
            textStartVis = visCursor;
            matched = true;
          }
        }
      } else if (ch === '*' && markdown[i + 1] !== '*' && i + 1 < len && !/\s/.test(markdown[i + 1])) {
        const lineBreak = markdown.indexOf('\n', i + 1);
        const limit = lineBreak >= 0 ? lineBreak : len;
        let search = i + 1;
        let closeIdx = -1;
        while (search < limit) {
          if (
            markdown[search] === '*' &&
            markdown[search - 1] !== '*' &&
            markdown[search + 1] !== '*' &&
            !/\s/.test(markdown[search - 1])
          ) {
            closeIdx = search;
            break;
          }
          search++;
        }
        if (closeIdx > i + 1) {
          const content = markdown.slice(i + 1, closeIdx);
          flushPlainText(i);
          tokens.push({
            kind: 'italic',
            mdStart: i,
            mdEnd: closeIdx + 1,
            visStart: visCursor,
            visEnd: visCursor + content.length,
            markerLen: 1,
            content,
          });
          visCursor += content.length;
          i = closeIdx + 1;
          textStartMd = i;
          textStartVis = visCursor;
          matched = true;
        }
      }

      if (!matched) {
        i++;
        visCursor++;
      }
    }

    flushPlainText(len);
    return tokens;
  }

  private mapVisibleOffsetToMarkdownOffset(
    markdown: string,
    visibleOffset: number,
    boundarySide: 'start' | 'end' | 'caret' = 'caret',
  ): number {
    const tokens = this.tokenizeInlineMarkdown(markdown);
    if (tokens.length === 0) {
      return 0;
    }
    const clampedVis = Math.max(0, Math.min(tokens[tokens.length - 1].visEnd, visibleOffset));
    for (const tok of tokens) {
      if (tok.kind === 'text') {
        if (clampedVis >= tok.visStart && clampedVis <= tok.visEnd) {
          return tok.mdStart + (clampedVis - tok.visStart);
        }
        continue;
      }
      if (clampedVis > tok.visStart && clampedVis < tok.visEnd) {
        return tok.mdStart + tok.markerLen + (clampedVis - tok.visStart);
      }
      if (clampedVis === tok.visStart && boundarySide !== 'end') {
        return boundarySide === 'start' ? tok.mdStart : tok.mdStart;
      }
      if (clampedVis === tok.visEnd) {
        return boundarySide === 'end' ? tok.mdEnd : tok.mdEnd;
      }
    }
    return markdown.length;
  }

  private mapVisibleRangeToMarkdownRange(
    markdown: string,
    rawStart: number,
    rawEnd: number,
    isSplitCaret = false,
  ): { start: number; end: number } {
    const tokens = this.tokenizeInlineMarkdown(markdown);
    if (tokens.length === 0) {
      return { start: 0, end: 0 };
    }
    const totalVis = tokens[tokens.length - 1].visEnd;
    const visStart = Math.max(0, Math.min(totalVis, Math.min(rawStart, rawEnd)));
    const visEnd = Math.max(visStart, Math.min(totalVis, Math.max(rawStart, rawEnd)));

    if (!isSplitCaret) {
      // If selection spans a single inline-formatted token or stays inside it, map to its inner text so bold/italic toggle works cleanly
      for (const tok of tokens) {
        if (tok.kind !== 'text' && visStart >= tok.visStart && visEnd <= tok.visEnd && visStart < visEnd) {
          return {
            start: tok.mdStart + tok.markerLen + (visStart - tok.visStart),
            end: tok.mdStart + tok.markerLen + (visEnd - tok.visStart),
          };
        }
      }
      return {
        start: this.mapVisibleOffsetToMarkdownOffset(markdown, visStart, 'start'),
        end: this.mapVisibleOffsetToMarkdownOffset(markdown, visEnd, 'end'),
      };
    }

    return {
      start: this.mapVisibleOffsetToMarkdownOffset(markdown, visStart, 'caret'),
      end: this.mapVisibleOffsetToMarkdownOffset(markdown, visEnd, 'caret'),
    };
  }

  private mapMarkdownOffsetToVisibleOffset(markdown: string, mdOffset: number): number {
    const clampedMd = Math.max(0, Math.min(markdown.length, mdOffset));
    const tokens = this.tokenizeInlineMarkdown(markdown);
    for (const tok of tokens) {
      if (clampedMd < tok.mdStart) {
        return tok.visStart;
      }
      if (clampedMd <= tok.mdEnd) {
        if (tok.kind === 'text') {
          return tok.visStart + (clampedMd - tok.mdStart);
        }
        const contentStart = tok.mdStart + tok.markerLen;
        const contentEnd = tok.mdEnd - tok.markerLen;
        if (clampedMd <= contentStart) {
          return tok.visStart;
        }
        if (clampedMd >= contentEnd) {
          return tok.visEnd;
        }
        return tok.visStart + (clampedMd - contentStart);
      }
    }
    return tokens.length > 0 ? tokens[tokens.length - 1].visEnd : 0;
  }

  private resolveFormattingTargetSegmentIndex(): number {
    const snapshotSegId = this.lastSelectionSnapshot?.segmentId;
    if (snapshotSegId) {
      const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === snapshotSegId);
      if (idx >= 0) {
        return idx;
      }
    }
    return this.resolveActiveSegmentIndex();
  }

  private resolveSelectionOffsetsForText(
    currentMarkdown: string,
    el: HTMLElement | null,
    snapshotMatchesTarget: boolean,
  ): { start: number; end: number } {
    const tokens = this.tokenizeInlineMarkdown(currentMarkdown);
    const totalVis = tokens.length > 0 ? tokens[tokens.length - 1].visEnd : currentMarkdown.length;

    if (el) {
      if (
        this.isDomNode(el) &&
        typeof window !== 'undefined' &&
        typeof window.getSelection === 'function'
      ) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (el.contains(range.startContainer) && el.contains(range.endContainer)) {
            const caret = this.getCaretCharacterOffsetWithin(el);
            return this.mapVisibleRangeToMarkdownRange(currentMarkdown, caret.start, caret.end);
          }
        }
      }
      const testEl = el as HTMLElement & { selectionStart?: number; selectionEnd?: number };
      if (!this.isDomNode(el) && typeof testEl.selectionStart === 'number') {
        const start = Math.max(0, Math.min(totalVis, testEl.selectionStart));
        const end =
          typeof testEl.selectionEnd === 'number'
            ? Math.max(start, Math.min(totalVis, testEl.selectionEnd))
            : start;
        return this.mapVisibleRangeToMarkdownRange(currentMarkdown, start, end);
      }
    }

    if (snapshotMatchesTarget && this.lastSelectionSnapshot) {
      return this.mapVisibleRangeToMarkdownRange(
        currentMarkdown,
        this.lastSelectionSnapshot.start,
        this.lastSelectionSnapshot.end,
      );
    }

    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const selectedStr = window.getSelection()?.toString() ?? '';
      if (selectedStr.length > 0) {
        const visibleText = tokens.map((t) => t.content).join('');
        const foundVisIdx = visibleText.indexOf(selectedStr);
        if (foundVisIdx >= 0) {
          return this.mapVisibleRangeToMarkdownRange(
            currentMarkdown,
            foundVisIdx,
            foundVisIdx + selectedStr.length,
          );
        }
      }
    }

    return { start: currentMarkdown.length, end: currentMarkdown.length };
  }

  private applyInlineWrapToText(
    text: string,
    rawStart: number,
    rawEnd: number,
    prefix: string,
    suffix: string,
  ): { nextText: string; selectStart: number; selectEnd: number } {
    let start = Math.max(0, Math.min(text.length, Math.min(rawStart, rawEnd)));
    let end = Math.max(start, Math.min(text.length, Math.max(rawStart, rawEnd)));

    if (start === end) {
      let wordStart = start;
      while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
        wordStart--;
      }
      let wordEnd = end;
      while (wordEnd < text.length && /\S/.test(text[wordEnd])) {
        wordEnd++;
      }
      if (wordStart < wordEnd && (start > wordStart || start < wordEnd || (start === wordEnd && text.length > 0))) {
        start = wordStart;
        end = wordEnd;
      } else {
        const placeholder = 'text';
        const wrapped = `${prefix}${placeholder}${suffix}`;
        const nextText = text.slice(0, start) + wrapped + text.slice(end);
        return {
          nextText,
          selectStart: start + prefix.length,
          selectEnd: start + prefix.length + placeholder.length,
        };
      }
    }

    while (start < end && /\s/.test(text[start])) {
      start++;
    }
    while (end > start && /\s/.test(text[end - 1])) {
      end--;
    }

    const selected = text.slice(start, end);
    if (selected.length === 0) {
      const placeholder = 'text';
      const wrapped = `${prefix}${placeholder}${suffix}`;
      const nextText = text.slice(0, start) + wrapped + text.slice(end);
      return {
        nextText,
        selectStart: start + prefix.length,
        selectEnd: start + prefix.length + placeholder.length,
      };
    }

    // Toggle off if markers are included inside the selected text (avoid misclassifying '**bold**' as single-* italic)
    const boldMismatchForItalic =
      prefix === '*' &&
      suffix === '*' &&
      selected.startsWith('**') &&
      selected.endsWith('**') &&
      !(selected.startsWith('***') && selected.endsWith('***') && selected.length > 6);
    if (
      !boldMismatchForItalic &&
      selected.length > prefix.length + suffix.length &&
      selected.startsWith(prefix) &&
      selected.endsWith(suffix)
    ) {
      const inner = selected.slice(prefix.length, selected.length - suffix.length);
      return {
        nextText: text.slice(0, start) + inner + text.slice(end),
        selectStart: start,
        selectEnd: start + inner.length,
      };
    }

    // Toggle off if markers immediately wrap the selected text
    const flankingBoldMismatchForItalic =
      prefix === '*' &&
      suffix === '*' &&
      start >= 2 &&
      end + 2 <= text.length &&
      text.slice(start - 2, start) === '**' &&
      text.slice(end, end + 2) === '**' &&
      !(start >= 3 && end + 3 <= text.length && text.slice(start - 3, start) === '***' && text.slice(end, end + 3) === '***');
    if (
      !flankingBoldMismatchForItalic &&
      start >= prefix.length &&
      end + suffix.length <= text.length &&
      text.slice(start - prefix.length, start) === prefix &&
      text.slice(end, end + suffix.length) === suffix
    ) {
      const nextStart = start - prefix.length;
      return {
        nextText: text.slice(0, nextStart) + selected + text.slice(end + suffix.length),
        selectStart: nextStart,
        selectEnd: nextStart + selected.length,
      };
    }

    const wrapped = `${prefix}${selected}${suffix}`;
    const selectStart = start + prefix.length;
    return {
      nextText: text.slice(0, start) + wrapped + text.slice(end),
      selectStart,
      selectEnd: selectStart + selected.length,
    };
  }

  private commitFormattedSegmentMarkdown(
    seg: DocumentRenderSegment,
    segIdx: number,
    nextBlockMarkdown: string,
    visibleSelectStart: number,
    visibleSelectEnd: number,
    coords?: {
      listItemIndex?: number;
      tableRowIndex?: number;
      tableColIndex?: number;
      isTableHeader?: boolean;
    },
  ): void {
    if (this.ViewMode === 'suggest') {
      this.ApplyInPlaceSegmentChange(seg, nextBlockMarkdown, 'Inline formatting update');
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    blocks[segIdx] = nextBlockMarkdown;
    this.applyBlockFlowTransaction(blocks);
    this.restoreInlineSelectionAfterTransaction(segIdx, visibleSelectStart, visibleSelectEnd, coords);
  }

  private applyInlineFormattingToSegment(
    segIdx: number,
    prefix: string,
    suffix: string,
    liveMarkdownOverride?: string,
  ): void {
    const seg = this.DocumentSegments[segIdx];
    if (!seg || seg.Kind !== 'markdown') {
      return;
    }
    const snapshot = this.lastSelectionSnapshot?.segmentId === seg.SegmentID ? this.lastSelectionSnapshot : null;

    if (seg.BlockKind === 'list') {
      const items = this.GetParsedListItems(seg);
      if (items.length === 0) {
        return;
      }
      const rawItemIdx = snapshot?.listItemIndex ?? this.lastFocusedListItemIndex ?? 0;
      const itemIdx = Math.max(0, Math.min(items.length - 1, rawItemIdx));
      const coords = { listItemIndex: itemIdx };
      const el = this.findEditableElementForSegment(seg, coords);
      const currentText =
        liveMarkdownOverride !== undefined
          ? liveMarkdownOverride
          : el
            ? this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ')
            : items[itemIdx].Text;
      const snapshotMatches = Boolean(snapshot && (snapshot.listItemIndex ?? itemIdx) === itemIdx);
      const { start, end } = this.resolveSelectionOffsetsForText(currentText, el, snapshotMatches);
      const wrapped = this.applyInlineWrapToText(currentText, start, end, prefix, suffix);
      items[itemIdx] = { ...items[itemIdx], Text: wrapped.nextText };
      const nextMd = this.serializeParsedListItems(items);
      const visStart = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectStart);
      const visEnd = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectEnd);
      this.commitFormattedSegmentMarkdown(seg, segIdx, nextMd, visStart, visEnd, coords);
      return;
    }

    if (seg.BlockKind === 'table') {
      const parsed = this.GetParsedTable(seg);
      const isHeader = snapshot?.isTableHeader ?? this.lastFocusedTableCell?.isHeader ?? true;
      const colCount = Math.max(1, parsed.Headers.length);
      const colIdx = Math.max(
        0,
        Math.min(colCount - 1, snapshot?.tableColIndex ?? this.lastFocusedTableCell?.colIndex ?? 0),
      );
      const rowIdx = Math.max(
        0,
        Math.min(Math.max(0, parsed.Rows.length - 1), snapshot?.tableRowIndex ?? this.lastFocusedTableCell?.rowIndex ?? 0),
      );
      if (!isHeader && parsed.Rows.length === 0) {
        return;
      }
      const coords = { tableRowIndex: rowIdx, tableColIndex: colIdx, isTableHeader: isHeader };
      const el = this.findEditableElementForSegment(seg, coords);
      const fallbackCellText = isHeader ? (parsed.Headers[colIdx] ?? '') : (parsed.Rows[rowIdx]?.[colIdx] ?? '');
      const currentText =
        liveMarkdownOverride !== undefined
          ? liveMarkdownOverride
          : el
            ? this.ExtractMarkdownFromEditableElement(el).replace(/\|/g, '/')
            : fallbackCellText;
      const snapshotMatches = Boolean(
        snapshot && snapshot.tableColIndex === colIdx && Boolean(snapshot.isTableHeader) === isHeader && (isHeader || snapshot.tableRowIndex === rowIdx),
      );
      const { start, end } = this.resolveSelectionOffsetsForText(currentText, el, snapshotMatches);
      const wrapped = this.applyInlineWrapToText(currentText, start, end, prefix, suffix);
      const sanitizedCellText = wrapped.nextText.replace(/\|/g, '/');
      if (isHeader) {
        parsed.Headers[colIdx] = sanitizedCellText;
      } else {
        parsed.Rows[rowIdx].splice(colIdx, 1, sanitizedCellText);
      }
      const nextMd = this.serializeParsedTable(parsed.Headers, parsed.Rows);
      const visStart = this.mapMarkdownOffsetToVisibleOffset(sanitizedCellText, wrapped.selectStart);
      const visEnd = this.mapMarkdownOffsetToVisibleOffset(sanitizedCellText, wrapped.selectEnd);
      this.commitFormattedSegmentMarkdown(seg, segIdx, nextMd, visStart, visEnd, coords);
      return;
    }

    if (seg.BlockKind === 'heading') {
      const el = this.findEditableElementForSegment(seg);
      const currentText =
        liveMarkdownOverride !== undefined
          ? liveMarkdownOverride.replace(/\n+/g, ' ')
          : el
            ? this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ')
            : seg.HeadingText ?? this.GetEditableHeadingText(seg);
      const { start, end } = this.resolveSelectionOffsetsForText(currentText, el, Boolean(snapshot));
      const wrapped = this.applyInlineWrapToText(currentText, start, end, prefix, suffix);
      const cleanWrapped = wrapped.nextText.replace(/\n+/g, ' ').trim();
      const level = Math.max(1, Math.min(6, seg.HeadingLevel ?? 1));
      const nextMd = `${'#'.repeat(level)} ${cleanWrapped}`;
      const visStart = this.mapMarkdownOffsetToVisibleOffset(cleanWrapped, wrapped.selectStart);
      const visEnd = this.mapMarkdownOffsetToVisibleOffset(cleanWrapped, wrapped.selectEnd);
      this.commitFormattedSegmentMarkdown(seg, segIdx, nextMd, visStart, visEnd);
      return;
    }

    if (seg.BlockKind === 'callout') {
      const parsed = this.GetParsedCallout(seg);
      const el = this.findEditableElementForSegment(seg);
      const currentText =
        liveMarkdownOverride !== undefined
          ? liveMarkdownOverride
          : el
            ? this.ExtractMarkdownFromEditableElement(el)
            : parsed.BodyText;
      const { start, end } = this.resolveSelectionOffsetsForText(currentText, el, Boolean(snapshot));
      const wrapped = this.applyInlineWrapToText(currentText, start, end, prefix, suffix);
      const bodyLines = wrapped.nextText.split('\n').map((l) => `> ${l}`);
      const nextMd = [`> [!${parsed.CalloutType}]`, ...bodyLines].join('\n');
      const visStart = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectStart);
      const visEnd = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectEnd);
      this.commitFormattedSegmentMarkdown(seg, segIdx, nextMd, visStart, visEnd);
      return;
    }

    // Default: paragraph / plain markdown block
    const el = this.findEditableElementForSegment(seg);
    const currentText =
      liveMarkdownOverride !== undefined
        ? liveMarkdownOverride
        : el
          ? this.ExtractMarkdownFromEditableElement(el)
          : seg.RawMarkdown.trim();
    const { start, end } = this.resolveSelectionOffsetsForText(currentText, el, Boolean(snapshot));
    const wrapped = this.applyInlineWrapToText(currentText, start, end, prefix, suffix);
    const visStart = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectStart);
    const visEnd = this.mapMarkdownOffsetToVisibleOffset(wrapped.nextText, wrapped.selectEnd);
    this.commitFormattedSegmentMarkdown(seg, segIdx, wrapped.nextText, visStart, visEnd);
  }

  private applyBlockLevelFormattingToSegment(segIdx: number, prefix: string): boolean {
    const seg = this.DocumentSegments[segIdx];
    if (!seg || seg.Kind !== 'markdown' || seg.BlockKind === 'table' || seg.BlockKind === 'code') {
      return false;
    }

    const extractPlainText = (): string => {
      const el = this.findEditableElementForSegment(seg);
      if (seg.BlockKind === 'heading') {
        const raw = el
          ? this.ExtractMarkdownFromEditableElement(el)
          : (seg.HeadingText ?? this.GetEditableHeadingText(seg));
        return raw.replace(/\n+/g, ' ').trim();
      }
      if (seg.BlockKind === 'callout') {
        const raw = el ? this.ExtractMarkdownFromEditableElement(el) : this.GetParsedCallout(seg).BodyText;
        return raw.trim();
      }
      if (seg.BlockKind === 'list') {
        const items = this.GetParsedListItems(seg);
        return items.map((i) => i.Text).join(' ').trim();
      }
      return (el ? this.ExtractMarkdownFromEditableElement(el) : seg.RawMarkdown).trim();
    };

    const headingMatch = /^(#{1,3})\s+$/.exec(prefix);
    if (headingMatch) {
      const targetLevel = headingMatch[1].length;
      const plainText = extractPlainText();
      if (seg.BlockKind === 'heading' && (seg.HeadingLevel ?? 1) === targetLevel) {
        this.commitBlockTransform(seg, segIdx, plainText, 'end');
        return true;
      }
      const nextMd = `${'#'.repeat(targetLevel)} ${plainText}`;
      this.commitBlockTransform(seg, segIdx, nextMd, 'end');
      return true;
    }

    if (prefix === '- ' || prefix === '- [ ] ') {
      const wantTask = prefix === '- [ ] ';
      if (seg.BlockKind === 'list') {
        const items = this.GetParsedListItems(seg);
        if (items.length === 0) {
          return false;
        }
        const rawItemIdx =
          this.lastSelectionSnapshot?.segmentId === seg.SegmentID
            ? this.lastSelectionSnapshot.listItemIndex
            : this.lastFocusedListItemIndex;
        const targetIdx =
          rawItemIdx !== undefined && rawItemIdx !== null
            ? Math.max(0, Math.min(items.length - 1, rawItemIdx))
            : 0;
        if (wantTask) {
          const allTasks = items.every((i) => i.IsTask);
          for (const item of items) {
            item.IsTask = !allTasks;
            if (!item.IsTask) {
              item.Checked = false;
            }
          }
        } else if (items.some((i) => i.IsTask)) {
          for (const item of items) {
            item.IsTask = false;
            item.Checked = false;
          }
        } else {
          // Convert single bullet item back to plain paragraph on second click
          this.commitBlockTransform(seg, segIdx, items.map((i) => i.Text).join(' ').trim(), 'end');
          return true;
        }
        const nextMd = this.serializeParsedListItems(items);
        this.commitBlockTransform(seg, segIdx, nextMd, 'end', targetIdx);
        return true;
      }
      const plainText = extractPlainText();
      const nextMd = `${wantTask ? '- [ ] ' : '- '}${plainText}`;
      this.commitBlockTransform(seg, segIdx, nextMd, 'end', 0);
      return true;
    }

    if (prefix.startsWith('> [!NOTE]')) {
      if (seg.BlockKind === 'callout') {
        const body = extractPlainText();
        this.commitBlockTransform(seg, segIdx, body, 'end');
        return true;
      }
      const plainText = extractPlainText();
      const bodyLines = (plainText || '').split('\n').map((l) => `> ${l}`);
      const nextMd = ['> [!NOTE]', ...bodyLines].join('\n');
      this.commitBlockTransform(seg, segIdx, nextMd, 'end');
      return true;
    }

    return false;
  }

  private commitBlockTransform(
    seg: DocumentRenderSegment,
    segIdx: number,
    nextBlockMarkdown: string,
    position: 'start' | 'end' = 'end',
    listItemIndex?: number,
  ): void {
    if (this.ViewMode === 'suggest') {
      this.ApplyInPlaceSegmentChange(seg, nextBlockMarkdown, 'Converted block format');
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    blocks[segIdx] = nextBlockMarkdown;
    this.applyBlockFlowTransaction(blocks, {
      segmentIndex: segIdx,
      position,
      listItemIndex,
    });
  }

  private insertMarkdownAtTargetSegment(snippet: string): void {
    const idx = this.resolveActiveSegmentIndex();
    this.ActiveSlashTargetSegmentID = null;

    if (idx >= 0 && idx < this.DocumentSegments.length) {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      const cleanedTarget = blocks[idx].replace(/(?:^|\s)\/[A-Za-z0-9_-]*$/, '').trim();
      const trimmedSnippet = snippet.replace(/\n+$/, '');
      if (trimmedSnippet.trim().length === 0) {
        const nextIdx = cleanedTarget.length === 0 ? idx : idx + 1;
        if (cleanedTarget.length > 0) {
          blocks[idx] = cleanedTarget;
          blocks.splice(nextIdx, 0, '');
        } else {
          blocks[idx] = '';
        }
        this.applyBlockFlowTransaction(blocks, { segmentIndex: nextIdx, position: 'start' });
        return;
      }
      let focusIdx = idx;
      if (cleanedTarget.length === 0) {
        blocks[idx] = trimmedSnippet;
      } else {
        blocks[idx] = cleanedTarget;
        blocks.splice(idx + 1, 0, trimmedSnippet);
        focusIdx = idx + 1;
      }
      this.applyBlockFlowTransaction(blocks, {
        segmentIndex: focusIdx,
        position: 'end',
      });
      return;
    }

    const cleanedBase = this.MarkdownContent.replace(/(?:^|\n)\/[A-Za-z0-9_-]*$/, '');
    const trimmedSnippet = snippet.replace(/\n+$/, '');
    if (trimmedSnippet.trim().length === 0) {
      this.AppendOrFocusTrailingParagraph();
      return;
    }
    const sep = cleanedBase.endsWith('\n') || cleanedBase.length === 0 ? '' : '\n\n';
    this.OnMarkdownChanged(`${cleanedBase}${sep}${snippet}`);
    if (this.DocumentSegments.length > 0) {
      const lastSeg = this.DocumentSegments[this.DocumentSegments.length - 1];
      this.FocusEditableSegment(lastSeg.SegmentID, 'end');
    }
  }

  /**
   * Executes a `/` slash command selected from the Slash Command Palette.
   */
  public ExecuteSlashCommand(cmd: DocumentSlashCommand): void {
    this.ShowSlashMenu = false;
    this.SlashMenuHighlightIndex = 0;

    if (cmd.Snippet !== undefined) {
      this.insertMarkdownAtTargetSegment(cmd.Snippet);
      return;
    }

    if (cmd.Command === '/whiteboard') {
      this.EditingBlockID = null;
      this.PendingBlockInsertType = 'Artifact';
      this.PendingBlockIsWhiteboard = true;
      this.NewBlockLabel = 'Interactive Architecture Whiteboard';
      this.NewBlockArtifactTypeName = 'Whiteboard';
      this.NewBlockArtifactID = '';
      this.NewBlockDefaultCollapsed = false;
      this.cdr.markForCheck();
      return;
    }

    if (cmd.BlockType) {
      this.EditingBlockID = null;
      this.PendingBlockInsertType = cmd.BlockType;
      this.PendingBlockIsWhiteboard = false;
      this.ShowEntityPickerDropdown = false;
      this.EntityPickerHighlightIndex = 0;
      this.ShowAdvancedBlockOptions = false;
      this.entitySearchFilteringActive = false;
      this.NewBlockExtraFilter = '';
      this.NewBlockDisplayMode = 'table';
      this.NewBlockMaxRows = 50;
      this.NewBlockPageSize = 10;
      this.NewBlockDefaultCollapsed = false;
      this.NewBlockViewSelectionMode = 'default';
      this.NewBlockViewID = '';
      this.NewBlockViewName = '';

      if (cmd.BlockType === 'EntityView') {
        this.EntityPickerOptions = this.resolveEntityPickerOptions();
        this.NewBlockEntityName = 'MJ: Artifacts';
        const defaultEnt = this.SelectedEntityOption;
        this.NewBlockLabel = defaultEnt ? `${defaultEnt.DisplayName} — Default View` : 'Artifacts — Default View';
        void this.loadSavedViewsForEntity(this.NewBlockEntityName, defaultEnt?.ID);
      } else if (cmd.BlockType === 'SavedQuery') {
        this.QueryPickerOptions = this.resolveQueryPickerOptions();
        this.NewBlockQueryName = this.QueryPickerOptions[0]?.Name ?? 'Active Artifacts Overview';
        this.NewBlockLabel = this.NewBlockQueryName;
      } else if (cmd.BlockType === 'Artifact') {
        this.NewBlockArtifactID = '';
        this.NewBlockArtifactTypeName = cmd.Command === '/sheet-chart' || cmd.Command === '/sheet-range' ? 'Spreadsheet' : 'Whiteboard';
        this.NewBlockSheetMode =
          cmd.Command === '/sheet-chart'
            ? 'chart'
            : cmd.Command === '/sheet-range'
              ? 'range'
              : 'full';
        this.NewBlockSheetName = '';
        this.NewBlockSheetChartID = '';
        this.NewBlockSheetRange = 'A1:D8';
        this.NewBlockPinToCurrentVersion = false;
        this.SelectedWorkbookSheets = [];
        this.SelectedArtifactLatestVersionID = '';
        this.SelectedArtifactLatestVersionNumber = 0;
        this.NewBlockLabel =
          cmd.Command === '/sheet-chart'
            ? 'Embedded Spreadsheet Chart'
            : cmd.Command === '/sheet-range'
              ? 'Embedded Spreadsheet Range'
              : 'Embedded Artifact';
        void this.loadAvailableArtifactsForPicker();
      } else {
        this.NewBlockLabel = cmd.Label;
      }
      this.cdr.markForCheck();
    }
  }

  /**
   * Opens the Block Configuration Modal pre-populated with an existing block's Entity, View, Query, or Artifact settings
   * so the user can change the View, Query, Filter, Page Size, or Default Collapse at any time.
   */
  public OpenConfigureBlockModal(block: DocumentBlockSpec): void {
    if (!this.CanUserEdit) {
      return;
    }
    this.EditingBlockID = block.BlockID;
    this.PendingBlockInsertType = block.Kind;
    this.PendingBlockIsWhiteboard = block.Kind === 'Artifact' && block.EmbedMode === 'Inline';
    this.ShowEntityPickerDropdown = false;
    this.EntityPickerHighlightIndex = 0;
    this.entitySearchFilteringActive = false;

    this.NewBlockLabel = block.Title || block.EntityName || block.QueryName || block.Kind;
    this.NewBlockDisplayMode = block.DisplayMode === 'kpi' ? 'kpi' : 'table';
    this.NewBlockMaxRows = block.MaxRows ?? 50;
    this.NewBlockPageSize = block.PageSize ?? this.GetBlockPageSize(block);
    this.NewBlockDefaultCollapsed = Boolean(block.Collapsed);
    this.ShowAdvancedBlockOptions = Boolean(block.ExtraFilter || block.Collapsed || block.PageSize);

    if (block.Kind === 'EntityView') {
      this.EntityPickerOptions = this.resolveEntityPickerOptions();
      this.NewBlockEntityName = block.EntityName || 'MJ: Artifacts';
      this.NewBlockExtraFilter = block.ExtraFilter || '';
      if (block.ViewID || block.ViewName) {
        this.NewBlockViewSelectionMode = 'saved';
        this.NewBlockViewID = block.ViewID || '';
        this.NewBlockViewName = block.ViewName || '';
      } else {
        this.NewBlockViewSelectionMode = 'default';
        this.NewBlockViewID = '';
        this.NewBlockViewName = '';
      }
      const entOpt = this.SelectedEntityOption;
      void this.loadSavedViewsForEntity(this.NewBlockEntityName, entOpt?.ID);
    } else if (block.Kind === 'SavedQuery') {
      this.QueryPickerOptions = this.resolveQueryPickerOptions();
      this.NewBlockQueryName = block.QueryName || '';
    } else if (block.Kind === 'Artifact') {
      this.NewBlockArtifactID = block.ArtifactID || '';
      this.NewBlockArtifactTypeName = block.ArtifactType || 'Whiteboard';
      this.NewBlockSheetMode = block.SheetChartID ? 'chart' : block.SheetRange ? 'range' : 'full';
      this.NewBlockSheetName = block.SheetID || '';
      this.NewBlockSheetChartID = block.SheetChartID || '';
      this.NewBlockSheetRange = block.SheetRange || 'A1:D8';
      this.NewBlockPinToCurrentVersion = Boolean(block.VersionID);
      this.SelectedWorkbookSheets = [];
      void this.loadAvailableArtifactsForPicker();
      if (this.NewBlockArtifactID && this.IsSpreadsheetArtifactPickerSelected) {
        void this.loadSelectedWorkbookSheets(this.NewBlockArtifactID);
      }
    }

    this.cdr.markForCheck();
  }

  public CancelBlockInsertModal(): void {
    this.PendingBlockInsertType = null;
    this.PendingBlockIsWhiteboard = false;
    this.EditingBlockID = null;
    this.ShowEntityPickerDropdown = false;
    this.ActiveSlashTargetSegmentID = null;
    this.cdr.markForCheck();
  }

  public get SelectedEntityOption(): DocsEntityPickerOption | null {
    const trimmed = (this.NewBlockEntityName ?? '').trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    return (
      this.EntityPickerOptions.find(
        (opt) => opt.Name.toLowerCase() === trimmed || opt.DisplayName.toLowerCase() === trimmed,
      ) ?? null
    );
  }

  public get SelectedEntityDisplayName(): string {
    return this.SelectedEntityOption?.DisplayName || this.NewBlockEntityName || 'Entity';
  }

  public get FilteredEntityPickerOptions(): DocsEntityPickerOption[] {
    if (!this.entitySearchFilteringActive) {
      return this.EntityPickerOptions.slice(0, 60);
    }
    const query = (this.NewBlockEntityName ?? '').trim().toLowerCase();
    if (!query) {
      return this.EntityPickerOptions.slice(0, 60);
    }
    const prefixMatches: DocsEntityPickerOption[] = [];
    const substringMatches: DocsEntityPickerOption[] = [];
    for (const opt of this.EntityPickerOptions) {
      const disp = opt.DisplayName.toLowerCase();
      const name = opt.Name.toLowerCase();
      const sub = opt.Subtitle.toLowerCase();
      if (disp.startsWith(query) || name.startsWith(query)) {
        prefixMatches.push(opt);
      } else if (disp.includes(query) || name.includes(query) || sub.includes(query)) {
        substringMatches.push(opt);
      }
    }
    return [...prefixMatches, ...substringMatches].slice(0, 50);
  }

  public get FilteredQueryPickerOptions(): DocsQueryPickerOption[] {
    const q = (this.NewBlockQueryName ?? '').trim().toLowerCase();
    if (!q) {
      return this.QueryPickerOptions.slice(0, 20);
    }
    return this.QueryPickerOptions.filter(
      (opt) =>
        opt.Name.toLowerCase().includes(q) ||
        opt.Category.toLowerCase().includes(q) ||
        opt.Description.toLowerCase().includes(q),
    ).slice(0, 20);
  }

  public OpenEntityPickerDropdown(): void {
    if (this.EntityPickerOptions.length === 0) {
      this.EntityPickerOptions = this.resolveEntityPickerOptions();
    }
    this.entitySearchFilteringActive = false;
    this.ShowEntityPickerDropdown = true;
    this.EntityPickerHighlightIndex = 0;
    this.cdr.markForCheck();
  }

  public ToggleEntityPickerDropdown(): void {
    if (this.ShowEntityPickerDropdown) {
      this.ShowEntityPickerDropdown = false;
    } else {
      this.OpenEntityPickerDropdown();
    }
    this.cdr.markForCheck();
  }

  public OnEntitySearchInput(value: string): void {
    this.NewBlockEntityName = value;
    this.entitySearchFilteringActive = true;
    this.ShowEntityPickerDropdown = true;
    this.EntityPickerHighlightIndex = 0;
    this.cdr.markForCheck();
  }

  public ClearSelectedEntity(): void {
    this.NewBlockEntityName = '';
    this.entitySearchFilteringActive = false;
    this.ShowEntityPickerDropdown = true;
    this.EntityPickerHighlightIndex = 0;
    this.AvailableEntityViews = [];
    this.cdr.markForCheck();
  }

  public OnEntityPickerKeydown(event: KeyboardEvent): void {
    const options = this.FilteredEntityPickerOptions;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.ShowEntityPickerDropdown) {
        this.OpenEntityPickerDropdown();
      } else if (options.length > 0) {
        this.EntityPickerHighlightIndex = (this.EntityPickerHighlightIndex + 1) % options.length;
      }
      this.cdr.markForCheck();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.ShowEntityPickerDropdown && options.length > 0) {
        this.EntityPickerHighlightIndex = (this.EntityPickerHighlightIndex - 1 + options.length) % options.length;
      }
      this.cdr.markForCheck();
    } else if (event.key === 'Enter' && this.ShowEntityPickerDropdown && options.length > 0) {
      event.preventDefault();
      const target = options[this.EntityPickerHighlightIndex] ?? options[0];
      if (target) {
        this.SelectEntityOption(target);
      }
    } else if (event.key === 'Escape' && this.ShowEntityPickerDropdown) {
      event.preventDefault();
      this.ShowEntityPickerDropdown = false;
      this.cdr.markForCheck();
    }
  }

  public SelectEntityOption(opt: DocsEntityPickerOption): void {
    this.NewBlockEntityName = opt.Name;
    this.ShowEntityPickerDropdown = false;
    this.entitySearchFilteringActive = false;
    this.NewBlockViewSelectionMode = 'default';
    this.NewBlockViewID = '';
    this.NewBlockViewName = '';
    this.NewBlockLabel = `${opt.DisplayName} — Default View`;
    void this.loadSavedViewsForEntity(opt.Name, opt.ID);
    this.cdr.markForCheck();
  }

  public SetBlockViewSelectionMode(mode: 'default' | 'saved'): void {
    this.NewBlockViewSelectionMode = mode;
    if (mode === 'default') {
      this.NewBlockViewID = '';
      this.NewBlockViewName = '';
      this.NewBlockLabel = `${this.SelectedEntityDisplayName} — Default View`;
    } else if (this.AvailableEntityViews.length > 0 && !this.NewBlockViewName) {
      this.SelectSavedViewOption(this.AvailableEntityViews[0]);
    }
    this.cdr.markForCheck();
  }

  public SelectSavedViewOption(viewOpt: DocsSavedViewOption): void {
    this.NewBlockViewSelectionMode = 'saved';
    this.NewBlockViewID = viewOpt.ID;
    this.NewBlockViewName = viewOpt.Name;
    this.NewBlockLabel = `${this.SelectedEntityDisplayName} — ${viewOpt.Name}`;
    this.cdr.markForCheck();
  }

  public SelectQueryOption(qOpt: DocsQueryPickerOption): void {
    this.NewBlockQueryName = qOpt.Name;
    this.NewBlockLabel = qOpt.Name;
    this.cdr.markForCheck();
  }

  public SelectArtifactOption(artOpt: DocsArtifactPickerOption): void {
    this.NewBlockArtifactID = artOpt.ID;
    this.NewBlockArtifactTypeName = artOpt.Type || 'Whiteboard';
    this.NewBlockLabel = artOpt.Name;
    if (this.IsSpreadsheetArtifactPickerSelected) {
      if (this.NewBlockSheetMode === 'full' && !this.EditingBlockID) {
        this.NewBlockSheetMode = 'chart';
      }
      void this.loadSelectedWorkbookSheets(artOpt.ID);
    } else {
      this.SelectedWorkbookSheets = [];
    }
    this.cdr.markForCheck();
  }

  public get IsSpreadsheetArtifactPickerSelected(): boolean {
    const t = (this.NewBlockArtifactTypeName || '').toLowerCase();
    return t.includes('spreadsheet') || t.includes('sheet') || t.includes('workbook') || t.includes('excel');
  }

  public get SelectedWorkbookSheetCharts(): Array<{ ChartID: string; Title?: string; ChartType: string }> {
    const ws =
      this.SelectedWorkbookSheets.find((s) => s.SheetID === this.NewBlockSheetName || s.Name === this.NewBlockSheetName) ??
      this.SelectedWorkbookSheets[0];
    return (ws?.Charts ?? []).map((c) => ({
      ChartID: c.ChartID,
      Title: c.Title,
      ChartType: c.ChartType,
    }));
  }

  public SetSheetEmbedMode(mode: 'full' | 'chart' | 'range'): void {
    this.NewBlockSheetMode = mode;
    if (mode === 'chart' && !this.NewBlockSheetChartID && this.SelectedWorkbookSheetCharts.length > 0) {
      this.NewBlockSheetChartID = this.SelectedWorkbookSheetCharts[0].ChartID;
    }
    this.cdr.markForCheck();
  }

  public OnSelectedWorkbookSheetChanged(sheetName: string): void {
    this.NewBlockSheetName = sheetName;
    if (this.NewBlockSheetMode === 'chart' && this.SelectedWorkbookSheetCharts.length > 0) {
      this.NewBlockSheetChartID = this.SelectedWorkbookSheetCharts[0].ChartID;
    }
    this.cdr.markForCheck();
  }

  private async loadSelectedWorkbookSheets(artifactId: string): Promise<void> {
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user || !artifactId) {
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const res = await rv.RunView<MJArtifactVersionEntity>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        user,
      );
      const latest = res.Success ? res.Results?.[0] : undefined;
      if (!latest) return;
      this.SelectedArtifactLatestVersionID = latest.ID;
      this.SelectedArtifactLatestVersionNumber = latest.VersionNumber ?? 1;
      const wb = SpreadsheetEngine.Instance.ParseWorkbook(latest.Content || '{}');
      this.SelectedWorkbookSheets = wb.Worksheets ?? [];
      if (this.SelectedWorkbookSheets.length > 0 && !this.NewBlockSheetName) {
        this.NewBlockSheetName = this.SelectedWorkbookSheets[0].SheetID;
      }
      if (this.NewBlockSheetMode === 'chart' && !this.NewBlockSheetChartID && this.SelectedWorkbookSheetCharts.length > 0) {
        this.NewBlockSheetChartID = this.SelectedWorkbookSheetCharts[0].ChartID;
      }
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  public GetInsertModalTitle(): string {
    const prefix = this.EditingBlockID ? 'Configure' : 'Insert';
    if (this.PendingBlockIsWhiteboard) {
      return `${prefix} Inline Whiteboard`;
    }
    switch (this.PendingBlockInsertType) {
      case 'EntityView':
        return `${prefix} Live View`;
      case 'SavedQuery':
        return `${prefix} Live Query`;
      case 'DashboardPart':
        return `${prefix} Dashboard Part`;
      case 'InteractiveComponent':
        return `${prefix} Interactive Component`;
      case 'Artifact':
        return this.EditingBlockID ? 'Configure Embedded Artifact' : 'Embed Artifact';
      default:
        return `${prefix} Block`;
    }
  }

  public GetInsertModalSubtitle(): string {
    if (this.PendingBlockIsWhiteboard) {
      return 'Create or configure an interactive Whiteboard canvas embedded directly inside this document.';
    }
    switch (this.PendingBlockInsertType) {
      case 'EntityView':
        return 'Pick an entity and choose its Default View or a Named View.';
      case 'SavedQuery':
        return 'Pick a parameterized MemberJunction Query to render live in this document.';
      case 'Artifact':
        return 'Pick an existing MemberJunction Artifact to embed inline.';
      default:
        return 'Configure how this live block appears inside your document.';
    }
  }

  public GetInsertConfirmButtonLabel(): string {
    if (this.EditingBlockID) {
      switch (this.PendingBlockInsertType) {
        case 'EntityView':
          return 'Update View';
        case 'SavedQuery':
          return 'Update Query';
        case 'Artifact':
          return 'Update Artifact';
        default:
          return 'Save Changes';
      }
    }
    if (this.PendingBlockIsWhiteboard) {
      return 'Insert Whiteboard';
    }
    switch (this.PendingBlockInsertType) {
      case 'EntityView':
        return 'Insert View';
      case 'SavedQuery':
        return 'Insert Query';
      case 'Artifact':
        return 'Embed Artifact';
      default:
        return 'Insert Block';
    }
  }

  public GetBlockKindDisplayLabel(descriptor: DocumentBlockSpec): string {
    switch (descriptor.Kind) {
      case 'EntityView':
        return descriptor.ViewName ? `View · ${descriptor.ViewName}` : 'View';
      case 'SavedQuery':
        return 'Query';
      case 'DashboardPart':
        return 'Dashboard';
      case 'InteractiveComponent':
        return 'Component';
      case 'Artifact':
        return descriptor.ArtifactType || 'Artifact';
      default:
        return descriptor.Kind;
    }
  }

  private resolveEntityPickerOptions(): DocsEntityPickerOption[] {
    const md = this.getSafeProvider();
    if (!md) {
      return [];
    }
    const entities: EntityInfo[] = md.Entities ?? [];
    if (entities.length === 0) {
      return [];
    }
    return [...entities]
      .sort((a, b) => (a.DisplayNameOrName || a.Name).localeCompare(b.DisplayNameOrName || b.Name))
      .map((e) => ({
        ID: e.ID,
        Name: e.Name,
        DisplayName: e.DisplayNameOrName || e.Name,
        Icon: e.Icon || 'fa-solid fa-table',
        Subtitle: `${e.SchemaName || '__mj'}.${e.BaseTable || ''} · ${e.Fields?.length || 0} fields`,
        FieldCount: e.Fields?.length || 0,
      }));
  }

  private resolveQueryPickerOptions(): DocsQueryPickerOption[] {
    const md = this.getSafeProvider();
    if (!md) {
      return [];
    }
    const queries: QueryInfo[] = md.Queries ?? [];
    if (queries.length === 0) {
      return [];
    }
    return [...queries]
      .sort((a, b) => a.Name.localeCompare(b.Name))
      .map((q) => ({
        ID: q.ID,
        Name: q.Name,
        Category: q.Category || 'General',
        Description: q.Description || '',
      }));
  }

  private async loadSavedViewsForEntity(entityName: string, entityId?: string): Promise<void> {
    const provider = this.getSafeProvider();
    if (!provider) {
      this.IsLoadingEntityViews = false;
      this.AvailableEntityViews = [];
      this.cdr.markForCheck();
      return;
    }

    this.IsLoadingEntityViews = true;
    this.AvailableEntityViews = [];
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const filter = entityId
        ? `EntityID='${EscapeSQLString(entityId)}'`
        : `Entity='${EscapeSQLString(entityName)}'`;
      const res = await rv.RunView<{ ID: string; Name: string; Description: string }>(
        {
          EntityName: 'MJ: User Views',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          Fields: ['ID', 'Name', 'Description'],
          MaxRows: 50,
          ResultType: 'simple',
        },
        this.getSafeCurrentUser(),
      );
      if (res.Success && Array.isArray(res.Results)) {
        this.AvailableEntityViews = res.Results.map((r) => ({
          ID: r.ID,
          Name: r.Name,
          Description: r.Description || '',
        }));
      }
    } catch (err) {
      LogError(err);
    } finally {
      this.IsLoadingEntityViews = false;
      this.cdr.markForCheck();
    }
  }

  private async loadAvailableArtifactsForPicker(): Promise<void> {
    const provider = this.getSafeProvider();
    if (!provider) {
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const res = await rv.RunView<{ ID: string; Name: string; Type: string }>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `Visibility='Always'`,
          OrderBy: '__mj_UpdatedAt DESC',
          Fields: ['ID', 'Name', 'Type'],
          MaxRows: 25,
          ResultType: 'simple',
        },
        this.getSafeCurrentUser(),
      );
      if (res.Success && Array.isArray(res.Results)) {
        this.AvailableArtifactsForPicker = res.Results.map((r) => ({
          ID: r.ID,
          Name: r.Name,
          Type: r.Type || 'Artifact',
        }));
        if (this.AvailableArtifactsForPicker.length > 0 && !this.NewBlockArtifactID) {
          this.SelectArtifactOption(this.AvailableArtifactsForPicker[0]);
        }
      }
    } catch (err) {
      LogError(err);
    }
  }

  /**
   * Inserts a new `:::mj-block` directive or updates an existing block (`EditingBlockID`) in place,
   * creating and saving a real delegated child `MJArtifactEntity` + `MJArtifactVersionEntity` first
   * when `PendingBlockIsWhiteboard === true` (§ 3.4.1 / O4).
   */
  public async ConfirmBlockInsertModal(): Promise<void> {
    if (!this.PendingBlockInsertType) {
      return;
    }
    const isEditingExisting = Boolean(this.EditingBlockID);
    const blockId = this.EditingBlockID || `blk-${Date.now()}`;
    const descriptor: DocumentBlockSpec = {
      BlockID: blockId,
      Kind: this.PendingBlockInsertType,
      Mode: 'Live',
      DisplayMode: this.NewBlockDisplayMode || 'table',
      Title: this.NewBlockLabel || this.PendingBlockInsertType,
    };

    if (this.NewBlockPageSize > 0) {
      descriptor.PageSize = this.NewBlockPageSize;
      this.blockPageSizes.set(blockId, this.NewBlockPageSize);
    }
    if (this.NewBlockDefaultCollapsed) {
      descriptor.Collapsed = true;
    }

    if (this.PendingBlockInsertType === 'EntityView') {
      descriptor.EntityName = this.NewBlockEntityName || 'MJ: Artifacts';
      if (this.NewBlockViewSelectionMode === 'saved') {
        if (this.NewBlockViewID.trim()) {
          descriptor.ViewID = this.NewBlockViewID.trim();
        }
        if (this.NewBlockViewName.trim()) {
          descriptor.ViewName = this.NewBlockViewName.trim();
        }
      }
      if (this.NewBlockExtraFilter.trim()) {
        descriptor.ExtraFilter = this.NewBlockExtraFilter.trim();
      }
      if (this.NewBlockMaxRows > 0) {
        descriptor.MaxRows = this.NewBlockMaxRows;
      }
    } else if (this.PendingBlockInsertType === 'SavedQuery') {
      descriptor.QueryName = this.NewBlockQueryName || 'Active Artifacts Overview';
    } else if (this.PendingBlockInsertType === 'Artifact') {
      descriptor.ArtifactType = this.PendingBlockIsWhiteboard
        ? 'Whiteboard'
        : this.NewBlockArtifactTypeName || 'Whiteboard';
      descriptor.EmbedMode = this.PendingBlockIsWhiteboard ? 'Inline' : 'Link';
      descriptor.HeightPx = 440;

      if (!isEditingExisting && this.PendingBlockIsWhiteboard) {
        const created = await this.createDelegatedChildArtifact(
          descriptor.Title || 'Interactive Architecture Whiteboard',
          descriptor.ArtifactType,
        );
        if (!created) {
          return;
        }
        descriptor.ArtifactID = created.artifact.ID;
        descriptor.VersionID = created.version.ID;
        this.inlineEditingBlockIds.add(blockId);
      } else {
        const artifactId = this.NewBlockArtifactID.trim();
        if (!artifactId) {
          this.notifyError('Please select a target artifact before embedding.');
          return;
        }
        descriptor.ArtifactID = artifactId;
        if (this.IsSpreadsheetArtifactPickerSelected) {
          if (this.NewBlockSheetMode !== 'full' && this.NewBlockSheetName.trim()) {
            descriptor.SheetID = this.NewBlockSheetName.trim();
          }
          if (this.NewBlockSheetMode === 'chart' && this.NewBlockSheetChartID.trim()) {
            descriptor.SheetChartID = this.NewBlockSheetChartID.trim();
            descriptor.SheetRange = undefined;
          } else if (this.NewBlockSheetMode === 'range' && this.NewBlockSheetRange.trim()) {
            descriptor.SheetRange = this.NewBlockSheetRange.trim();
            descriptor.SheetChartID = undefined;
          } else {
            descriptor.SheetChartID = undefined;
            descriptor.SheetRange = undefined;
          }
          if (this.NewBlockPinToCurrentVersion && this.SelectedArtifactLatestVersionID) {
            descriptor.VersionID = this.SelectedArtifactLatestVersionID;
          } else if (!this.NewBlockPinToCurrentVersion) {
            descriptor.VersionID = undefined;
          }
        }
      }
    }

    this.PendingBlockInsertType = null;
    this.PendingBlockIsWhiteboard = false;
    this.EditingBlockID = null;

    if (isEditingExisting) {
      this.blockResults.delete(blockId);
      this.blockPageNumbers.set(blockId, 1);
      const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
        this.MarkdownContent,
        blockId,
        descriptor,
      );
      this.OnMarkdownChanged(updatedRes.Markdown);
      void this.RefreshLiveBlock(descriptor);
      this.StatusBannerMessage = `Updated "${descriptor.Title}" configuration.`;
      return;
    }

    const directiveText = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(descriptor);
    this.insertMarkdownAtTargetSegment(`${directiveText}\n`);
    this.StatusBannerMessage = `Inserted ${descriptor.Title} block into document.`;
  }

  /**
   * Two-layer collapse check: returns the current user's personal collapse override (`MJ: User Settings` via `UserInfoEngine`)
   * if set; otherwise falls back to the document author's default (`block.Collapsed`).
   */
  public IsBlockCollapsed(block: DocumentBlockSpec): boolean {
    if (this.userCollapsedBlockOverrides.has(block.BlockID)) {
      return Boolean(this.userCollapsedBlockOverrides.get(block.BlockID));
    }
    return Boolean(block.Collapsed);
  }

  /**
   * Toggles the current user's collapse state for a block and persists it to `UserInfoEngine.Instance` (`MJ: User Settings`)
   * without dirtying the shared document markdown.
   */
  public ToggleBlockCollapsed(block: DocumentBlockSpec): void {
    const nextCollapsed = !this.IsBlockCollapsed(block);
    this.userCollapsedBlockOverrides.set(block.BlockID, nextCollapsed);
    this.persistCollapsedStateToUserSettings();
    this.cdr.markForCheck();
  }

  public IsHeadingCollapsed(seg: DocumentRenderSegment): boolean {
    return this.collapsedHeadingIds.has(seg.SegmentID);
  }

  public ToggleHeadingCollapse(seg: DocumentRenderSegment): void {
    if (this.collapsedHeadingIds.has(seg.SegmentID)) {
      this.collapsedHeadingIds.delete(seg.SegmentID);
    } else {
      this.collapsedHeadingIds.add(seg.SegmentID);
    }
    this.persistCollapsedStateToUserSettings();
    this.cdr.markForCheck();
  }

  /**
   * Returns true if `seg` falls underneath an earlier collapsed heading of higher/equal hierarchy.
   */
  public IsSegmentHiddenByCollapsedHeading(seg: DocumentRenderSegment): boolean {
    if (this.collapsedHeadingIds.size === 0) {
      return false;
    }
    const targetIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (targetIdx <= 0) {
      return false;
    }

    let activeCollapsedLevel: number | null = null;
    for (let i = 0; i < targetIdx; i++) {
      const candidate = this.DocumentSegments[i];
      if (candidate.Kind === 'markdown' && candidate.BlockKind === 'heading') {
        const lvl = candidate.HeadingLevel ?? 1;
        if (activeCollapsedLevel !== null && lvl <= activeCollapsedLevel) {
          activeCollapsedLevel = null;
        }
        if (activeCollapsedLevel === null && this.collapsedHeadingIds.has(candidate.SegmentID)) {
          activeCollapsedLevel = lvl;
        }
      }
    }

    if (activeCollapsedLevel === null) {
      return false;
    }
    if (seg.Kind === 'markdown' && seg.BlockKind === 'heading') {
      const segLvl = seg.HeadingLevel ?? 1;
      if (segLvl <= activeCollapsedLevel) {
        return false;
      }
    }
    return true;
  }

  public GetCollapsedChildCount(headingSeg: DocumentRenderSegment): number {
    const startIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === headingSeg.SegmentID);
    if (startIdx < 0) {
      return 0;
    }
    const headingLvl = headingSeg.HeadingLevel ?? 1;
    let count = 0;
    for (let i = startIdx + 1; i < this.DocumentSegments.length; i++) {
      const candidate = this.DocumentSegments[i];
      if (candidate.Kind === 'markdown' && candidate.BlockKind === 'heading') {
        const candidateLvl = candidate.HeadingLevel ?? 1;
        if (candidateLvl <= headingLvl) {
          break;
        }
      }
      count++;
    }
    return count;
  }

  private getCollapsedBlocksUserSettingKey(): string {
    const artifactId = this.artifactVersion?.ArtifactID || this.artifactVersion?.ID || 'default-doc';
    return `MJ.Docs.CollapsedState.${artifactId}`;
  }

  private loadCollapsedStateFromUserSettings(): void {
    this.userCollapsedBlockOverrides.clear();
    this.collapsedHeadingIds.clear();
    this.loadToolbarPreferencesFromUserSettings();

    const raw = UserInfoEngine.Instance.GetSetting(this.getCollapsedBlocksUserSettingKey());
    if (!raw) {
      return;
    }
    const parsed = SafeJSONParse<{
      blocks?: Record<string, boolean>;
      headings?: string[];
    }>(raw);
    if (!parsed) {
      return;
    }
    if (parsed.blocks && typeof parsed.blocks === 'object') {
      for (const [k, v] of Object.entries(parsed.blocks)) {
        this.userCollapsedBlockOverrides.set(k, Boolean(v));
      }
    }
    if (Array.isArray(parsed.headings)) {
      for (const h of parsed.headings) {
        this.collapsedHeadingIds.add(String(h));
      }
    }
  }

  private persistCollapsedStateToUserSettings(): void {
    const blocksObj: Record<string, boolean> = {};
    for (const [k, v] of this.userCollapsedBlockOverrides.entries()) {
      blocksObj[k] = v;
    }
    const payload = JSON.stringify({
      blocks: blocksObj,
      headings: Array.from(this.collapsedHeadingIds),
    });
    UserInfoEngine.Instance.SetSettingDebounced(this.getCollapsedBlocksUserSettingKey(), payload);
  }

  // =========================================================================
  // Bounded Block Pagination & Clickable PK / FK Record Links
  // =========================================================================

  public GetBlockPageSize(block: DocumentBlockSpec): number {
    return this.blockPageSizes.get(block.BlockID) ?? block.PageSize ?? 10;
  }

  public SetBlockPageSize(block: DocumentBlockSpec, size: number): void {
    const numeric = Number(size) || 10;
    this.blockPageSizes.set(block.BlockID, numeric);
    this.blockPageNumbers.set(block.BlockID, 1);
    this.cdr.markForCheck();
  }

  public GetBlockPageNumber(block: DocumentBlockSpec): number {
    return this.blockPageNumbers.get(block.BlockID) ?? 1;
  }

  public GetBlockTotalPages(block: DocumentBlockSpec, totalLoadedRows: number): number {
    const pageSize = this.GetBlockPageSize(block);
    return Math.max(1, Math.ceil(totalLoadedRows / pageSize));
  }

  public ChangeBlockPage(block: DocumentBlockSpec, delta: number, totalLoadedRows: number): void {
    const totalPages = this.GetBlockTotalPages(block, totalLoadedRows);
    const current = this.GetBlockPageNumber(block);
    const next = Math.min(totalPages, Math.max(1, current + delta));
    this.blockPageNumbers.set(block.BlockID, next);
    this.cdr.markForCheck();
  }

  public GetPaginatedBlockRows(
    block: DocumentBlockSpec,
    rows: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    const pageSize = this.GetBlockPageSize(block);
    const page = this.GetBlockPageNumber(block);
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }

  public GetBlockPageStartRow(block: DocumentBlockSpec, totalLoadedRows: number): number {
    if (totalLoadedRows === 0) {
      return 0;
    }
    return (this.GetBlockPageNumber(block) - 1) * this.GetBlockPageSize(block) + 1;
  }

  public GetBlockPageEndRow(block: DocumentBlockSpec, totalLoadedRows: number): number {
    if (totalLoadedRows === 0) {
      return 0;
    }
    return Math.min(totalLoadedRows, this.GetBlockPageNumber(block) * this.GetBlockPageSize(block));
  }

  /**
   * Returns true when a cell in a Live View or Query table represents a clickable Primary Key, NameField, or Foreign Key record link.
   */
  public IsCellRecordLink(col: DocumentBlockColumn, row: Record<string, unknown>): boolean {
    const cellVal = row[col.Name];
    if (cellVal === null || cellVal === undefined || cellVal === '') {
      return false;
    }
    if (col.IsPrimaryKey || col.IsNameField || col.IsForeignKey) {
      const idField = col.RecordIDFieldName || (col.IsPrimaryKey ? col.Name : 'ID');
      const targetId = row[idField] ?? (col.IsPrimaryKey || col.IsForeignKey ? cellVal : undefined);
      return targetId !== null && targetId !== undefined && String(targetId).trim().length > 0;
    }
    return false;
  }

  /**
   * Opens the linked MemberJunction entity record in MJ Explorer when a user clicks a PK, NameField, or FK cell.
   */
  public OnBlockRecordCellClick(
    block: DocumentBlockSpec,
    col: DocumentBlockColumn,
    row: Record<string, unknown>,
    event?: MouseEvent,
  ): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const entityName = col.TargetEntityName || block.EntityName;
    if (!entityName) {
      return;
    }
    const idField = col.RecordIDFieldName || (col.IsPrimaryKey ? col.Name : 'ID');
    const rawId = row[idField] ?? row[col.Name];
    if (rawId === null || rawId === undefined || String(rawId).trim().length === 0) {
      return;
    }

    const pkFieldName = col.IsForeignKey ? 'ID' : col.IsPrimaryKey ? col.Name : idField;
    const compositeKey = new CompositeKey([{ FieldName: pkFieldName, Value: String(rawId) }]);
    this.OpenEntityRecord.emit({ entityName, compositeKey });
    this.StatusBannerMessage = `Opening ${entityName} record (${String(rawId)})…`;
    this.cdr.markForCheck();
  }

  // =========================================================================
  // Share & Permissions Modal (MJ: Artifact Permissions)
  // =========================================================================

  public OpenPermissionsModal(): void {
    this.ShowPermissionsModal = true;
    this.PermissionUserSearchQuery = '';
    void this.loadArtifactPermissionsForModal();
    this.cdr.markForCheck();
  }

  public ClosePermissionsModal(): void {
    this.ShowPermissionsModal = false;
    this.cdr.markForCheck();
  }

  public OnPermissionUserSearchChange(query: string): void {
    this.PermissionUserSearchQuery = query;
    void this.SearchUsersForSharing(query);
  }

  /**
   * Queries `MJ: Users` on the server with `Name LIKE '%...%' OR Email LIKE '%...%'` so users beyond
   * the initial 100 rows can be discovered and shared with (`Round 2 Review`).
   */
  public async SearchUsersForSharing(searchQuery = this.PermissionUserSearchQuery): Promise<void> {
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!user || !provider) {
      return;
    }

    try {
      const trimmed = (searchQuery ?? '').trim();
      const escaped = EscapeSQLString(trimmed);
      const extraFilter = trimmed
        ? `IsActive=1 AND (Name LIKE '%${escaped}%' OR Email LIKE '%${escaped}%')`
        : 'IsActive=1';
      const rv = RunView.FromMetadataProvider(provider);
      const usersRes = await rv.RunView<{ ID: string; Name: string; Email: string }>(
        {
          EntityName: 'MJ: Users',
          ExtraFilter: extraFilter,
          OrderBy: 'Name ASC',
          Fields: ['ID', 'Name', 'Email'],
          MaxRows: 100,
          ResultType: 'simple',
        },
        user,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      const allUsers = usersRes.Success && Array.isArray(usersRes.Results) ? usersRes.Results : [];
      const ownerEntry = this.ArtifactPermissionEntries.find((e) => e.IsOwner);
      const ownerUserId = ownerEntry?.UserID;
      this.AvailableUsersForSharing = allUsers.filter(
        (u) => !UUIDsEqual(u.ID, user.ID) && (!ownerUserId || !UUIDsEqual(u.ID, ownerUserId)),
      );
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  private async loadArtifactPermissionsForModal(): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    const entries: DocsPermissionEntry[] = [];

    if (!artifactId || !user || !provider) {
      if (user) {
        entries.push({
          ID: `viewer-${user.ID}`,
          UserID: user.ID,
          UserName: user.Name || 'Current User',
          UserEmail: user.Email || '',
          CanRead: true,
          CanEdit: this.HasEditPermission,
          CanShare: this.CanUserShareArtifact,
          IsOwner: false,
        });
      }
      this.ArtifactPermissionEntries = entries;
      this.cdr.markForCheck();
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const [artRes, permRes, usersRes] = await Promise.all([
        rv.RunView<{ ID: string; UserID: string }>(
          {
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
            Fields: ['ID', 'UserID'],
            MaxRows: 1,
            ResultType: 'simple',
          },
          user,
        ),
        rv.RunView<{
          ID: string;
          UserID: string;
          User?: string;
          CanRead: boolean;
          CanEdit: boolean;
          CanShare: boolean;
        }>(
          {
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
            MaxRows: 100,
            ResultType: 'simple',
          },
          user,
        ),
        rv.RunView<{ ID: string; Name: string; Email: string }>(
          {
            EntityName: 'MJ: Users',
            ExtraFilter: `IsActive=1`,
            OrderBy: 'Name ASC',
            Fields: ['ID', 'Name', 'Email'],
            MaxRows: 100,
            ResultType: 'simple',
          },
          user,
        ),
      ]);

      const ownerUserId = artRes.Success ? artRes.Results?.[0]?.UserID : undefined;
      const allUsers = usersRes.Success && Array.isArray(usersRes.Results) ? usersRes.Results : [];
      const usersById = IndexByUUID(allUsers);
      this.AvailableUsersForSharing = allUsers.filter(
        (u) => !UUIDsEqual(u.ID, user.ID) && (!ownerUserId || !UUIDsEqual(u.ID, ownerUserId)),
      );

      if (ownerUserId) {
        const ownerUser = UUIDsEqual(ownerUserId, user.ID)
          ? { ID: user.ID, Name: user.Name || 'Artifact Owner', Email: user.Email || '' }
          : usersById.Get(ownerUserId);
        entries.push({
          ID: `owner-${ownerUserId}`,
          UserID: ownerUserId,
          UserName: ownerUser?.Name || ownerUserId,
          UserEmail: ownerUser?.Email || '',
          CanRead: true,
          CanEdit: true,
          CanShare: true,
          IsOwner: true,
        });
      }

      if (permRes.Success && Array.isArray(permRes.Results)) {
        for (const p of permRes.Results) {
          if (ownerUserId && UUIDsEqual(p.UserID, ownerUserId)) {
            continue;
          }
          const matchedUser = UUIDsEqual(p.UserID, user.ID)
            ? { ID: user.ID, Name: user.Name || p.User || p.UserID, Email: user.Email || '' }
            : usersById.Get(p.UserID);
          entries.push({
            ID: p.ID,
            UserID: p.UserID,
            UserName: matchedUser?.Name || p.User || p.UserID,
            UserEmail: matchedUser?.Email || '',
            CanRead: Boolean(p.CanRead),
            CanEdit: Boolean(p.CanEdit),
            CanShare: Boolean(p.CanShare),
            IsOwner: false,
          });
        }
      }
    } catch (err) {
      LogError(err);
      this.notifyError('Failed to load artifact permissions.');
    }

    this.ArtifactPermissionEntries = entries;
    this.cdr.markForCheck();
  }

  public async GrantArtifactPermission(): Promise<void> {
    if (!this.SelectedPermissionUserID || this.IsSavingPermission) {
      return;
    }
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!artifactId || !user || !provider) {
      this.notifyError('Cannot grant permissions: metadata provider or user context unavailable.');
      return;
    }

    const targetUser = this.AvailableUsersForSharing.find((u) => UUIDsEqual(u.ID, this.SelectedPermissionUserID));
    const canEdit = this.SelectedPermissionLevel === 'Edit' || this.SelectedPermissionLevel === 'Share';
    const canShare = this.SelectedPermissionLevel === 'Share';

    this.IsSavingPermission = true;
    this.cdr.markForCheck();
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const existingPermRes = await rv.RunView<MJArtifactPermissionEntity>(
        {
          EntityName: 'MJ: Artifact Permissions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}' AND UserID='${EscapeSQLString(this.SelectedPermissionUserID)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        user,
      );

      let permEntity: MJArtifactPermissionEntity;
      if (existingPermRes.Success && existingPermRes.Results && existingPermRes.Results.length > 0) {
        permEntity = existingPermRes.Results[0];
      } else {
        permEntity = await provider.GetEntityObject<MJArtifactPermissionEntity>('MJ: Artifact Permissions', user);
        permEntity.NewRecord();
        permEntity.ArtifactID = artifactId;
        permEntity.UserID = this.SelectedPermissionUserID;
      }

      permEntity.CanRead = true;
      permEntity.CanEdit = canEdit;
      permEntity.CanShare = canShare;
      permEntity.SharedByUserID = user.ID;
      const ok = await permEntity.Save();
      if (!ok || !permEntity.ID) {
        const msg = permEntity.LatestResult?.Message || 'Failed to save artifact permission.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      const existingIdx = this.ArtifactPermissionEntries.findIndex((e) =>
        UUIDsEqual(e.UserID, this.SelectedPermissionUserID),
      );
      const entry: DocsPermissionEntry = {
        ID: permEntity.ID,
        UserID: this.SelectedPermissionUserID,
        UserName: targetUser?.Name || this.SelectedPermissionUserID,
        UserEmail: targetUser?.Email || '',
        CanRead: true,
        CanEdit: canEdit,
        CanShare: canShare,
        IsOwner: false,
      };
      if (existingIdx >= 0) {
        this.ArtifactPermissionEntries[existingIdx] = entry;
      } else {
        this.ArtifactPermissionEntries = [...this.ArtifactPermissionEntries, entry];
      }
      this.SelectedPermissionUserID = '';
      this.StatusBannerMessage = `Shared document with ${entry.UserName}.`;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to grant artifact permission.');
    } finally {
      this.IsSavingPermission = false;
      this.cdr.markForCheck();
    }
  }

  public async RevokeArtifactPermission(entry: DocsPermissionEntry): Promise<void> {
    if (entry.IsOwner) {
      return;
    }
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!entry.ID || !user || !provider) {
      this.notifyError('Cannot revoke permission: metadata provider or user context unavailable.');
      return;
    }

    try {
      const permEntity = await provider.GetEntityObject<MJArtifactPermissionEntity>(
        'MJ: Artifact Permissions',
        user,
      );
      const loaded = await permEntity.Load(entry.ID);
      if (!loaded) {
        this.notifyError(`Failed to load permission record for ${entry.UserName}.`);
        return;
      }
      const deleted = await permEntity.Delete();
      if (!deleted) {
        const msg = permEntity.LatestResult?.Message || `Failed to revoke access for ${entry.UserName}.`;
        LogError(msg);
        this.notifyError(msg);
        return;
      }
      this.ArtifactPermissionEntries = this.ArtifactPermissionEntries.filter((e) => !UUIDsEqual(e.ID, entry.ID));
      this.StatusBannerMessage = `Removed access for ${entry.UserName}.`;
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : `Failed to revoke access for ${entry.UserName}.`);
    }
  }

  public IsSameUuid(a: string | null | undefined, b: string | null | undefined): boolean {
    return Boolean(a && b && UUIDsEqual(a, b));
  }

  private resolveArtifactsEntityId(provider: IMetadataProvider): string | undefined {
    return provider.EntityByName('MJ: Artifacts')?.ID;
  }

  private async resolveArtifactTypeId(
    provider: IMetadataProvider,
    typeName: string,
    user: ReturnType<MarkdownArtifactViewerComponent['getSafeCurrentUser']>,
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

  private async createDelegatedChildArtifact(
    title: string,
    artifactTypeName: string,
  ): Promise<{ artifact: MJArtifactEntity; version: MJArtifactVersionEntity } | null> {
    const hostArtifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!hostArtifactId || !user || !provider) {
      this.notifyError('Cannot create embedded Whiteboard: host artifact must be saved with an active provider.');
      return null;
    }

    try {
      const artifactsEntityId = this.resolveArtifactsEntityId(provider);
      if (!artifactsEntityId) {
        this.notifyError('Cannot create embedded Whiteboard: MJ: Artifacts entity metadata unavailable.');
        return null;
      }

      const rv = RunView.FromMetadataProvider(provider);
      const [hostArtRes, typeId] = await Promise.all([
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
        this.resolveArtifactTypeId(provider, artifactTypeName || 'Whiteboard', user),
      ]);

      if (!typeId) {
        this.notifyError(`Artifact type "${artifactTypeName || 'Whiteboard'}" could not be resolved.`);
        return null;
      }

      const hostEnvId = hostArtRes.Success ? hostArtRes.Results?.[0]?.EnvironmentID : undefined;
      const childArt = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
      childArt.NewRecord();
      childArt.Name = title || 'Embedded Whiteboard';
      childArt.TypeID = typeId;
      childArt.UserID = user.ID;
      if (hostEnvId) {
        childArt.EnvironmentID = hostEnvId;
      }
      childArt.DelegateEntityID = artifactsEntityId;
      childArt.DelegateRecordID = hostArtifactId;

      const artSaved = await childArt.Save();
      if (!artSaved || !childArt.ID) {
        const msg = childArt.LatestResult?.Message || 'Failed to save embedded Whiteboard artifact.';
        LogError(msg);
        this.notifyError(msg);
        return null;
      }

      const emptyWhiteboardJson = JSON.stringify({
        version: 1,
        activePageId: 'page-1',
        pages: [{ id: 'page-1', name: 'Page 1', items: [] }],
      });

      const childVer = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      childVer.NewRecord();
      childVer.ArtifactID = childArt.ID;
      childVer.VersionNumber = 1;
      childVer.Name = childArt.Name;
      childVer.UserID = user.ID;
      childVer.Content = emptyWhiteboardJson;

      const verSaved = await childVer.Save();
      if (!verSaved || !childVer.ID) {
        const msg = childVer.LatestResult?.Message || 'Failed to save initial Whiteboard version.';
        LogError(msg);
        this.notifyError(msg);
        return null;
      }

      this.cacheEmbeddedVersionEntity(childArt.ID, childVer);
      return { artifact: childArt, version: childVer };
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to create embedded Whiteboard.');
      return null;
    }
  }

  /**
   * Opens the `O5` Security Warning Modal before freezing a live MJ block.
   */
  public PromptFreezeBlock(block: DocumentBlockSpec): void {
    this.PendingFreezeBlock = block;
    this.FreezeWarningAcknowledged = false;
    this.cdr.markForCheck();
  }

  public SetFreezeWarningAcknowledged(acknowledged: boolean): void {
    this.FreezeWarningAcknowledged = acknowledged;
    this.cdr.markForCheck();
  }

  public CancelFreezeBlock(): void {
    this.PendingFreezeBlock = null;
    this.FreezeWarningAcknowledged = false;
    this.cdr.markForCheck();
  }

  /**
   * Freezes a live MJ block via the server `FreezeDocumentLiveBlock` mutation (with fallback to
   * `DocumentLiveBlockEngine.Instance.FreezeBlock` in offline/test environments) once the user
   * acknowledges the `O5` security warning modal (`Blocker 3`).
   */
  public async ConfirmFreezeBlock(): Promise<void> {
    if (!this.PendingFreezeBlock || !this.FreezeWarningAcknowledged) {
      return;
    }
    const target = this.PendingFreezeBlock;
    this.PendingFreezeBlock = null;
    this.FreezeWarningAcknowledged = false;
    await this.FreezeLiveBlock(target);
  }

  public async FreezeLiveBlock(block: DocumentBlockSpec): Promise<void> {
    const currentUser = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!currentUser || !provider) {
      this.notifyError('Cannot freeze block: metadata provider or user context unavailable.');
      return;
    }

    try {
      const freezeRes = await this.collabService.FreezeLiveBlockOnServer(
        block,
        true,
        this.artifactVersion?.ArtifactID,
        provider,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      if (!freezeRes.Success || !freezeRes.UpdatedSpec) {
        this.notifyError(freezeRes.ErrorMessage || 'Failed to freeze live block.');
        return;
      }

      const frozenBlock = freezeRes.UpdatedSpec;
      const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
        this.MarkdownContent,
        frozenBlock.BlockID,
        frozenBlock,
      );
      this.blockResults.delete(frozenBlock.BlockID);
      this.OnMarkdownChanged(updatedRes.Markdown);
      this.StatusBannerMessage = `Block "${frozenBlock.Title || frozenBlock.BlockID}" frozen into document snapshot.`;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to freeze live block.');
    }
  }

  /**
   * Returns true when a frozen block's `FrozenSnapshot` has a valid verified signature/hash (`Blocker 3`).
   */
  public IsSnapshotVerified(block: DocumentBlockSpec | null | undefined): boolean {
    if (!block) {
      return false;
    }
    return this.collabService.IsFrozenSnapshotVerified(block, this.blockResults.get(block.BlockID));
  }

  /**
   * Unfreezes a frozen block back to live viewer-scoped execution mode.
   */
  public UnfreezeLiveBlock(block: DocumentBlockSpec): void {
    const liveBlock = DocumentLiveBlockEngine.Instance.UnfreezeBlock(block);
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      liveBlock.BlockID,
      liveBlock,
    );
    this.blockResults.delete(liveBlock.BlockID);
    this.OnMarkdownChanged(updatedRes.Markdown);
    void this.RefreshLiveBlock(liveBlock);
    this.StatusBannerMessage = `Block "${liveBlock.Title || liveBlock.BlockID}" switched back to Live mode.`;
  }

  /**
   * Executes a live MJ block under the viewer's permissions and caches the exact execution result.
   */
  public async RefreshLiveBlock(block: DocumentBlockSpec): Promise<void> {
    const currentUser = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!currentUser || !provider) {
      this.blockResults.set(block.BlockID, {
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: block.Mode,
        Success: false,
        ErrorMessage: 'Metadata provider or user context unavailable.',
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
      });
      this.cdr.markForCheck();
      return;
    }

    try {
      const res = await DocumentLiveBlockEngine.Instance.ExecuteBlock(block, currentUser, provider);
      this.blockResults.set(block.BlockID, res);
    } catch (err) {
      LogError(err);
      this.blockResults.set(block.BlockID, {
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: block.Mode,
        Success: false,
        ErrorMessage: err instanceof Error ? err.message : String(err),
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
      });
    }
    this.cdr.markForCheck();
  }

  /**
   * Returns the cached or frozen execution result for a `:::mj-block` segment.
   */
  public GetBlockExecutionResult(block: DocumentBlockSpec): DocumentBlockExecutionResult {
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
      const verified = this.IsSnapshotVerified(block);
      return {
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: 'Frozen',
        Success: true,
        Columns: block.FrozenSnapshot.Columns,
        Rows: block.FrozenSnapshot.Rows,
        TotalRowCount: block.FrozenSnapshot.TotalRowCount,
        FrozenMetadata: {
          FrozenAt: block.FrozenSnapshot.FrozenAt,
          FrozenByUserID: verified ? block.FrozenSnapshot.FrozenByUserID : '',
          FrozenByUserName: verified ? block.FrozenSnapshot.FrozenByUserName : '',
          SnapshotVerified: verified,
        },
        FrozenSnapshot: {
          SnapshotVerified: verified,
          FrozenAt: block.FrozenSnapshot.FrozenAt,
          FrozenByUserID: verified ? block.FrozenSnapshot.FrozenByUserID : '',
          FrozenByUserName: verified ? block.FrozenSnapshot.FrozenByUserName : '',
          SnapshotContentHash: block.FrozenSnapshot.SnapshotContentHash,
        },
      };
    }

    const cached = this.blockResults.get(block.BlockID);
    if (cached) {
      return cached;
    }

    return {
      BlockID: block.BlockID,
      Kind: block.Kind,
      Mode: block.Mode,
      Success: true,
      Columns: [],
      Rows: [],
      TotalRowCount: 0,
    };
  }

  /**
   * Toggles inline OLE editing (`[readonly]="false"`) on an embedded `Artifact` block (§ 3.4.1 / D12).
   */
  public ToggleInlineArtifactEdit(block: DocumentBlockSpec): void {
    if (!this.CanUserEdit) {
      return;
    }
    if (this.inlineEditingBlockIds.has(block.BlockID)) {
      this.inlineEditingBlockIds.delete(block.BlockID);
    } else {
      this.inlineEditingBlockIds.add(block.BlockID);
    }
    this.cdr.markForCheck();
  }

  public IsInlineEditingBlock(blockId: string): boolean {
    return this.CanUserEdit && this.inlineEditingBlockIds.has(blockId);
  }

  private getEmbeddedVersionCacheKey(artifactId: string, versionId?: string | null): string {
    return `${artifactId.trim().toLowerCase()}::${(versionId || 'latest').trim().toLowerCase()}`;
  }

  private cacheEmbeddedVersionEntity(artifactId: string, ver: MJArtifactVersionEntity): void {
    const latestKey = this.getEmbeddedVersionCacheKey(artifactId, undefined);
    this.embeddedArtifactVersions.set(latestKey, ver);
    this.failedEmbeddedVersionMessages.delete(latestKey);
    if (ver.ID) {
      const pinnedKey = this.getEmbeddedVersionCacheKey(artifactId, ver.ID);
      this.embeddedArtifactVersions.set(pinnedKey, ver);
      this.failedEmbeddedVersionMessages.delete(pinnedKey);
    }
  }

  public IsEmbeddedArtifactLoading(block: DocumentBlockSpec): boolean {
    if (!block.ArtifactID || !block.ArtifactID.trim()) {
      return false;
    }
    return this.inFlightEmbeddedVersionKeys.has(
      this.getEmbeddedVersionCacheKey(block.ArtifactID, block.VersionID),
    );
  }

  public GetEmbeddedArtifactError(block: DocumentBlockSpec): string | undefined {
    if (!block.ArtifactID || !block.ArtifactID.trim()) {
      return 'Embedded artifact ID is missing.';
    }
    return this.failedEmbeddedVersionMessages.get(
      this.getEmbeddedVersionCacheKey(block.ArtifactID, block.VersionID),
    );
  }

  /**
   * Returns the loaded `MJArtifactVersionEntity` for an embedded OLE `Artifact` block, or `null`
   * while asynchronously fetching from `MJ: Artifact Versions` via `RunView` (or when unavailable).
   */
  public GetNewerEmbeddedArtifactVersion(block: DocumentBlockSpec): MJArtifactVersionEntity | null {
    const artifactId = block.ArtifactID?.trim();
    const pinnedVersionId = block.VersionID?.trim();
    if (!artifactId || !pinnedVersionId) {
      return null;
    }
    const latest = this.latestArtifactVersions.get(artifactId);
    if (!latest || UUIDsEqual(latest.ID, pinnedVersionId)) {
      return null;
    }
    const current = this.GetEmbeddedArtifactVersion(block);
    if (current && (latest.VersionNumber ?? 0) <= (current.VersionNumber ?? 0)) {
      return null;
    }
    return latest;
  }

  public UpdateEmbeddedArtifactToLatestVersion(block: DocumentBlockSpec): void {
    if (!this.CanUserEdit) {
      return;
    }
    const newer = this.GetNewerEmbeddedArtifactVersion(block);
    if (!newer) {
      return;
    }
    const updatedDescriptor: DocumentBlockSpec = {
      ...block,
      VersionID: newer.ID,
    };
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      block.BlockID,
      updatedDescriptor,
    );
    this.OnMarkdownChanged(updatedRes.Markdown);
    this.StatusBannerMessage = `Updated ${block.Title || 'embedded workbook'} to v${newer.VersionNumber}.`;
    this.cdr.markForCheck();
  }

  public GetEmbeddedArtifactVersion(block: DocumentBlockSpec): MJArtifactVersionEntity | null {
    const artifactId = block.ArtifactID?.trim();
    if (!artifactId) {
      return null;
    }
    const key = this.getEmbeddedVersionCacheKey(artifactId, block.VersionID);
    const existing = this.embeddedArtifactVersions.get(key);
    if (existing) {
      return existing;
    }
    if (!this.inFlightEmbeddedVersionKeys.has(key) && !this.failedEmbeddedVersionMessages.has(key)) {
      void this.loadEmbeddedArtifactVersion(artifactId, block.VersionID);
    }
    return null;
  }

  private async loadEmbeddedArtifactVersion(artifactId: string, versionId?: string | null): Promise<void> {
    const key = this.getEmbeddedVersionCacheKey(artifactId, versionId);
    if (this.inFlightEmbeddedVersionKeys.has(key)) {
      return;
    }

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.failedEmbeddedVersionMessages.set(key, 'Embedded artifact unavailable or access denied.');
      this.cdr.markForCheck();
      return;
    }

    this.inFlightEmbeddedVersionKeys.add(key);
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const filter = versionId
        ? `ID='${EscapeSQLString(versionId)}' AND ArtifactID='${EscapeSQLString(artifactId)}'`
        : `ArtifactID='${EscapeSQLString(artifactId)}'`;
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
      const entity = res.Success ? res.Results?.[0] : undefined;
      if (entity) {
        this.embeddedArtifactVersions.set(key, entity);
        if (!versionId && entity.ID) {
          this.embeddedArtifactVersions.set(this.getEmbeddedVersionCacheKey(artifactId, entity.ID), entity);
          this.latestArtifactVersions.set(artifactId, entity);
        } else if (versionId && !this.latestArtifactVersions.has(artifactId)) {
          const latestRes = await rv.RunView<MJArtifactVersionEntity>(
            {
              EntityName: 'MJ: Artifact Versions',
              ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
              OrderBy: 'VersionNumber DESC',
              MaxRows: 1,
              ResultType: 'entity_object',
            },
            user,
          );
          const latestEntity = latestRes.Success ? latestRes.Results?.[0] : undefined;
          if (latestEntity) {
            this.latestArtifactVersions.set(artifactId, latestEntity);
          }
        }
        this.failedEmbeddedVersionMessages.delete(key);
      } else {
        this.failedEmbeddedVersionMessages.set(
          key,
          res.ErrorMessage || 'Embedded artifact unavailable or access denied.',
        );
      }
    } catch (err) {
      LogError(err);
      this.failedEmbeddedVersionMessages.set(
        key,
        err instanceof Error ? err.message : 'Failed to load embedded artifact.',
      );
    } finally {
      this.inFlightEmbeddedVersionKeys.delete(key);
      this.cdr.markForCheck();
    }
  }

  /**
   * Handles `ContentCommitted` emitted by an inline-edited OLE child artifact (e.g. `WhiteboardArtifactViewerComponent`).
   * Queries `MAX(VersionNumber)`, saves a real `MJArtifactVersionEntity`, and updates cached state + `VersionID`
   * ONLY if `Save()` succeeds (§ 3.4.1).
   */
  public async OnEmbeddedArtifactContentCommitted(
    block: DocumentBlockSpec,
    serializedContent: string,
  ): Promise<void> {
    const childArtifactId = block.ArtifactID?.trim();
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!childArtifactId || !user || !provider) {
      this.notifyError('Cannot commit embedded artifact edits: metadata provider or user context unavailable.');
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const maxRes = await rv.RunView<{ ID: string; VersionNumber: number }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(childArtifactId)}'`,
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

      const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = childArtifactId;
      ver.VersionNumber = nextVersionNumber;
      ver.Name = block.Title || 'Embedded Artifact';
      ver.UserID = user.ID;
      ver.Content = serializedContent;
      const embedConfig = BuildArtifactVersionConfigurationWithPreview(
        null,
        serializedContent,
        null,
        ver.Name,
      );
      if (embedConfig) {
        ver.Configuration = embedConfig;
      }

      const saved = await ver.Save();
      if (!saved || !ver.ID) {
        const msg = ver.LatestResult?.Message || 'Failed to save embedded artifact version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      this.cacheEmbeddedVersionEntity(childArtifactId, ver);

      // Per § 3.4.1: Only advance VersionID on the block descriptor when VersionID was already pinned.
      if (block.VersionID) {
        const updatedDescriptor: DocumentBlockSpec = {
          ...block,
          VersionID: ver.ID,
        };
        const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
          this.MarkdownContent,
          block.BlockID,
          updatedDescriptor,
        );
        this.OnMarkdownChanged(updatedRes.Markdown);
      } else {
        this.cdr.markForCheck();
      }
      this.StatusBannerMessage = `Committed inline edits to ${block.Title || 'embedded artifact'} (v${nextVersionNumber}).`;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save embedded artifact version.');
    }
  }

  /**
   * Creates or updates a tracked Suggestion Card for a document block.
   * When a pending suggestion already exists for the same block, updates its proposed Markdown in-place.
   */
  public CreateOrUpdatePendingSuggestion(
    blockId: string,
    originalMarkdown: string,
    proposedMarkdown: string,
    rationale: string,
    authorName = 'Current User',
  ): DocumentSuggestionItem {
    const existing = this.Suggestions.find((s) => s.BlockID === blockId && s.Status === 'Pending');
    if (existing) {
      existing.ProposedMarkdown = proposedMarkdown;
      existing.Rationale = rationale;
      existing.CreatedAt = new Date().toISOString();
      this.cdr.markForCheck();
      return existing;
    }

    const item: DocumentSuggestionItem = {
      SuggestionID: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      BlockID: blockId,
      AuthorName: authorName,
      CreatedAt: new Date().toISOString(),
      OriginalMarkdown: originalMarkdown,
      ProposedMarkdown: proposedMarkdown,
      Rationale: rationale,
      Status: 'Pending',
    };
    this.Suggestions = [item, ...this.Suggestions];
    this.cdr.markForCheck();
    return item;
  }

  private applySuggestionReplacement(
    blockId: string,
    originalMarkdown: string,
    replacementMarkdown: string,
    segments: DocumentRenderSegment[],
    currentMarkdown: string,
  ): { matched: boolean; markdown: string } {
    if (!originalMarkdown) {
      return { matched: false, markdown: currentMarkdown };
    }
    const targetSeg = segments.find((s) => s.SegmentID === blockId);
    if (
      targetSeg &&
      (targetSeg.RawMarkdown === originalMarkdown || targetSeg.RawMarkdown.trim() === originalMarkdown.trim())
    ) {
      const nextMd = segments
        .map((s) => (s.SegmentID === targetSeg.SegmentID ? replacementMarkdown : s.RawMarkdown))
        .join('\n\n');
      return { matched: true, markdown: nextMd };
    }
    if (currentMarkdown.includes(originalMarkdown)) {
      return {
        matched: true,
        markdown: currentMarkdown.replace(originalMarkdown, () => replacementMarkdown),
      };
    }
    return { matched: false, markdown: currentMarkdown };
  }

  /**
   * Commits all pending tracked suggestions whose target blocks still match into the working Markdown document.
   * Leaves non-matching suggestions untouched and notifies the user on conflict.
   */
  public CommitPendingSuggestions(): number {
    const pending = this.Suggestions.filter((s) => s.Status === 'Pending');
    if (pending.length === 0) {
      return 0;
    }
    let nextMd = this.MarkdownContent;
    let workingSegments = this.DocumentSegments;
    let acceptedCount = 0;
    let conflictCount = 0;

    for (const sug of pending) {
      const applied = this.applySuggestionReplacement(
        sug.BlockID,
        sug.OriginalMarkdown,
        sug.ProposedMarkdown,
        workingSegments,
        nextMd,
      );
      if (applied.matched) {
        sug.Status = 'Accepted';
        nextMd = applied.markdown;
        workingSegments = this.collabService.ParseDocumentSegments(nextMd);
        acceptedCount++;
      } else {
        conflictCount++;
      }
    }

    if (acceptedCount > 0) {
      this.OnMarkdownChanged(nextMd);
    }
    if (conflictCount > 0) {
      this.notifyError(
        `Conflict: ${conflictCount} suggestion${conflictCount === 1 ? ' could' : 's could'} not be applied because the target block changed.`,
      );
    } else if (acceptedCount > 0) {
      this.StatusBannerMessage = `Committed ${acceptedCount} tracked suggestion${acceptedCount === 1 ? '' : 's'}.`;
    }
    return acceptedCount;
  }

  public OpenSuggestionModalForSegment(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit) {
      return;
    }
    this.SetViewMode('suggest');
    this.SelectedAnchorKey = seg.SegmentID;
    this.SelectedAnchorLabel = seg.HeadingText ?? seg.SegmentID;
    this.StatusBannerMessage = 'Suggest Mode active — edit the selected block to propose your suggestion.';
    this.cdr.markForCheck();
    queueMicrotask(() => {
      if (typeof document === 'undefined') {
        return;
      }
      const host = this.PrintableCanvas?.nativeElement;
      const targetEl = host?.querySelector<HTMLElement>(
        `[data-segment-id="${seg.SegmentID}"] [contenteditable="true"]`,
      );
      targetEl?.focus();
    });
  }

  public GetSuggestionsForBlock(blockId: string): DocumentSuggestionItem[] {
    return this.Suggestions.filter((s) => s.BlockID === blockId);
  }

  /**
   * Computes the Word / Google-Docs-style inline word-level redline diff and granular change hunks
   * for a Suggestion Card.
   */
  public GetSuggestionWordDiff(sug: DocumentSuggestionItem): DocumentWordDiffResult {
    return this.collabService.ComputeWordLevelDiff(sug.OriginalMarkdown, sug.ProposedMarkdown);
  }

  /**
   * Accepts a single word/phrase hunk within a suggestion card while leaving any other pending word edits
   * in the same paragraph open for review.
   */
  public AcceptSuggestionHunk(sug: DocumentSuggestionItem, hunk: DocumentWordChangeHunk): void {
    const applied = this.applySuggestionReplacement(
      sug.BlockID,
      sug.OriginalMarkdown,
      hunk.AcceptedMarkdown,
      this.DocumentSegments,
      this.MarkdownContent,
    );
    if (!applied.matched) {
      this.notifyError('Conflict: the target block changed and no longer matches this suggestion hunk.');
      return;
    }

    this.OnMarkdownChanged(applied.markdown);
    sug.OriginalMarkdown = hunk.AcceptedMarkdown;
    if (sug.OriginalMarkdown.trim() === sug.ProposedMarkdown.trim()) {
      sug.Status = 'Accepted';
    }
    this.StatusBannerMessage = `Accepted word edit (${hunk.Kind}).`;
    this.cdr.markForCheck();
  }

  /**
   * Rejects a single word/phrase hunk within a suggestion card while preserving any other pending word edits
   * in the same paragraph.
   */
  public RejectSuggestionHunk(sug: DocumentSuggestionItem, hunk: DocumentWordChangeHunk): void {
    sug.ProposedMarkdown = hunk.RejectedProposedMarkdown;
    if (sug.OriginalMarkdown.trim() === sug.ProposedMarkdown.trim()) {
      sug.Status = 'Rejected';
    }
    this.StatusBannerMessage = `Rejected word edit (${hunk.Kind}).`;
    this.cdr.markForCheck();
  }

  /**
   * Accepts a pending Suggestion Card and applies its proposed Markdown to the matching target block.
   */
  public AcceptSuggestion(sug: DocumentSuggestionItem): void {
    const applied = this.applySuggestionReplacement(
      sug.BlockID,
      sug.OriginalMarkdown,
      sug.ProposedMarkdown,
      this.DocumentSegments,
      this.MarkdownContent,
    );
    if (!applied.matched) {
      this.notifyError('Conflict: the target block changed and no longer matches the original text.');
      return;
    }
    sug.Status = 'Accepted';
    this.OnMarkdownChanged(applied.markdown);
    this.StatusBannerMessage = `Accepted suggestion from ${sug.AuthorName}.`;
  }

  /**
   * Rejects a pending Suggestion Card without altering the document.
   */
  public RejectSuggestion(sug: DocumentSuggestionItem): void {
    sug.Status = 'Rejected';
    this.StatusBannerMessage = `Rejected suggestion from ${sug.AuthorName}.`;
    this.cdr.markForCheck();
  }

  /**
   * Creates a tracked suggestion card on `blockId` (`CreateOrUpdatePendingSuggestion` alias).
   */
  public CreateSuggestion(
    blockId: string,
    originalMarkdown: string,
    proposedMarkdown: string,
    rationale = 'Suggested refinement',
    authorName = 'Current User',
  ): DocumentSuggestionItem {
    return this.CreateOrUpdatePendingSuggestion(
      blockId,
      originalMarkdown,
      proposedMarkdown,
      rationale,
      authorName,
    );
  }

  /**
   * Applies an incoming AI assistant `@mention` response to an anchored comment thread according to
   * `thread.AgentMode ?? this.NewCommentAgentMode` (`'comment' | 'suggest' | 'edit'`).
   * - `'comment'`: appends the agent reply to `thread.Messages` without creating a suggestion or mutating the document.
   * - `'suggest'`: creates a track-changes suggestion (`CreateSuggestion`) from `proposedMarkdown` and appends the reply.
   * - `'edit'`: when `CanUserEdit` is true, applies `proposedMarkdown` directly to the anchored segment and posts a confirmation reply.
   */
  public DispatchAgentCommentMention(
    thread: DocumentAnchoredThread,
    agentHandle: string,
    response: {
      replyMessage: string;
      proposedMarkdown?: string;
      rationale?: string;
      appliedOnServer?: boolean;
      anchorQuote?: string;
      markdownBeforeMention?: string;
      versionNumber?: number;
    },
  ): void {
    const mode = thread.AgentMode ?? this.NewCommentAgentMode;
    const nowIso = new Date().toISOString();
    const normalizedAuthor = agentHandle.startsWith('@') ? agentHandle : `@${agentHandle}`;
    const trimmedReply = (response.replyMessage ?? '').trim();
    const trimmedProposed = (response.proposedMarkdown ?? '').trim();
    const targetSeg =
      this.DocumentSegments.find((s) => s.SegmentID === thread.AnchorKey) ?? this.DocumentSegments[0];

    if (!trimmedReply && !trimmedProposed) {
      this.StatusBannerMessage = `${normalizedAuthor} did not return a reply.`;
      this.cdr.markForCheck();
      return;
    }

    if (mode === 'comment' || !trimmedProposed) {
      thread.Messages.push({
        DetailID: `msg-${Date.now()}-agent`,
        UserName: normalizedAuthor,
        Role: 'Agent',
        Message: trimmedReply,
        CreatedAt: nowIso,
        Mentions: [],
      });
      this.StatusBannerMessage = `${normalizedAuthor} replied in comment thread.`;
      this.cdr.detectChanges();
      return;
    }

    const effectiveAnchorQuote = response.anchorQuote ?? thread.QuotedText;

    if (mode === 'edit' && this.CanUserEdit && (targetSeg || response.appliedOnServer)) {
      if (response.appliedOnServer) {
        if (this.session?.Transport === 'websocket') {
          // Live WebSocket room: server (`ApplyServerContentMutation`) already merged and broadcast
          // the agent's edit directly into the Yjs room. Do NOT call `OnMarkdownChanged(..., true)`
          // or `session.SetContent(...)`, which would overwrite concurrent local typing with a 2-way snapshot.
          if (typeof response.versionNumber === 'number') {
            this.recordSavedVersionMetadata(response.versionNumber, response.proposedMarkdown!);
          }
        } else {
          const baseBefore = response.markdownBeforeMention;
          const nextMarkdown =
            baseBefore !== undefined && this.MarkdownContent !== baseBefore
              ? this.mergeConcurrentMentionEdit(
                  baseBefore,
                  this.MarkdownContent,
                  response.proposedMarkdown!,
                  effectiveAnchorQuote,
                )
              : response.proposedMarkdown!;
          this.OnMarkdownChanged(nextMarkdown);
          if (typeof response.versionNumber === 'number') {
            this.recordSavedVersionMetadata(response.versionNumber, this.MarkdownContent);
          }
        }
      } else if (targetSeg) {
        const nextSegmentMarkdown = this.spliceQuoteReplacementInSegment(
          targetSeg.RawMarkdown,
          effectiveAnchorQuote,
          response.proposedMarkdown!,
        );
        this.ReplaceSegmentMarkdown(targetSeg, nextSegmentMarkdown);
      }
      if (trimmedReply) {
        thread.Messages.push({
          DetailID: `msg-${Date.now()}-agent`,
          UserName: normalizedAuthor,
          Role: 'Agent',
          Message: trimmedReply,
          CreatedAt: nowIso,
          Mentions: [],
        });
      }
      this.StatusBannerMessage = `${normalizedAuthor} applied direct edit to ${thread.AnchorLabel}.`;
      this.cdr.detectChanges();
      return;
    }

    if (targetSeg) {
      const fullSuggestedSegment = this.spliceQuoteReplacementInSegment(
        targetSeg.RawMarkdown,
        effectiveAnchorQuote,
        response.proposedMarkdown!,
      );
      this.CreateSuggestion(
        targetSeg.SegmentID,
        targetSeg.RawMarkdown,
        fullSuggestedSegment,
        response.rationale || trimmedReply || `Suggestion from ${normalizedAuthor}`,
        normalizedAuthor,
      );
    }
    if (trimmedReply) {
      thread.Messages.push({
        DetailID: `msg-${Date.now()}-agent`,
        UserName: normalizedAuthor,
        Role: 'Agent',
        Message: trimmedReply,
        CreatedAt: nowIso,
        Mentions: [],
      });
    }
    this.StatusBannerMessage = `${normalizedAuthor} proposed a tracked suggestion.`;
    this.cdr.detectChanges();
  }

  private recordSavedVersionMetadata(versionNumber: number, contentSnapshot: string): void {
    const exists = this.SavedVersionSnapshots.some((s) => s.VersionNumber === versionNumber);
    if (!exists) {
      this.SavedVersionSnapshots.push({
        VersionNumber: versionNumber,
        Content: contentSnapshot,
        Timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  private spliceQuoteReplacementInSegment(
    segmentMarkdown: string,
    anchorQuote: string | undefined,
    replacement: string,
  ): string {
    const trimmedQuote = (anchorQuote ?? '').trim();
    if (!trimmedQuote || trimmedQuote === segmentMarkdown) {
      return replacement;
    }
    const idx = segmentMarkdown.indexOf(trimmedQuote);
    if (idx < 0) {
      return replacement;
    }
    const prefix = segmentMarkdown.slice(0, idx);
    const suffix = segmentMarkdown.slice(idx + trimmedQuote.length);
    const alreadyFullSegment =
      (prefix.length > 0 || suffix.length > 0) &&
      replacement.startsWith(prefix) &&
      replacement.endsWith(suffix) &&
      replacement.length >= prefix.length + suffix.length;
    if (alreadyFullSegment) {
      return replacement;
    }
    return `${prefix}${replacement}${suffix}`;
  }

  private mergeConcurrentMentionEdit(
    baseMarkdown: string,
    currentLocalMarkdown: string,
    serverUpdatedMarkdown: string,
    anchorQuote?: string,
  ): string {
    if (currentLocalMarkdown === baseMarkdown) {
      return serverUpdatedMarkdown;
    }
    if (serverUpdatedMarkdown === baseMarkdown) {
      return currentLocalMarkdown;
    }

    let prefixLen = 0;
    const minLen = Math.min(baseMarkdown.length, serverUpdatedMarkdown.length);
    while (prefixLen < minLen && baseMarkdown[prefixLen] === serverUpdatedMarkdown[prefixLen]) {
      prefixLen++;
    }

    let baseEnd = baseMarkdown.length;
    let serverEnd = serverUpdatedMarkdown.length;
    while (
      baseEnd > prefixLen &&
      serverEnd > prefixLen &&
      baseMarkdown[baseEnd - 1] === serverUpdatedMarkdown[serverEnd - 1]
    ) {
      baseEnd--;
      serverEnd--;
    }

    const trimmedQuote = (anchorQuote ?? '').trim();
    if (trimmedQuote.length > 0) {
      const baseQuoteIdx = baseMarkdown.indexOf(trimmedQuote);
      if (
        baseQuoteIdx >= 0 &&
        baseQuoteIdx <= prefixLen &&
        baseQuoteIdx + trimmedQuote.length >= baseEnd
      ) {
        const trailingUnchangedLen = baseMarkdown.length - (baseQuoteIdx + trimmedQuote.length);
        const quoteReplacement = serverUpdatedMarkdown.slice(
          baseQuoteIdx,
          serverUpdatedMarkdown.length - trailingUnchangedLen,
        );
        const localQuoteIdx = currentLocalMarkdown.indexOf(trimmedQuote);
        if (localQuoteIdx >= 0 && currentLocalMarkdown.indexOf(trimmedQuote, localQuoteIdx + 1) === -1) {
          return (
            currentLocalMarkdown.slice(0, localQuoteIdx) +
            quoteReplacement +
            currentLocalMarkdown.slice(localQuoteIdx + trimmedQuote.length)
          );
        }
      }
    }

    const oldSpan = baseMarkdown.slice(prefixLen, baseEnd);
    const newSpan = serverUpdatedMarkdown.slice(prefixLen, serverEnd);
    if (oldSpan.length > 0) {
      const localSpanIdx = currentLocalMarkdown.indexOf(oldSpan);
      if (localSpanIdx >= 0 && currentLocalMarkdown.indexOf(oldSpan, localSpanIdx + 1) === -1) {
        return (
          currentLocalMarkdown.slice(0, localSpanIdx) +
          newSpan +
          currentLocalMarkdown.slice(localSpanIdx + oldSpan.length)
        );
      }
    }

    return this.threeWayMergeLines(baseMarkdown, currentLocalMarkdown, serverUpdatedMarkdown);
  }

  private threeWayMergeLines(
    baseMarkdown: string,
    localMarkdown: string,
    serverMarkdown: string,
  ): string {
    const baseLines = baseMarkdown.replace(/\r\n/g, '\n').split('\n');
    const localLines = localMarkdown.replace(/\r\n/g, '\n').split('\n');
    const serverLines = serverMarkdown.replace(/\r\n/g, '\n').split('\n');

    const extractLineHunks = (
      targetLines: readonly string[],
    ): Array<{ baseStart: number; baseEnd: number; replacement: string[] }> => {
      const ops = ComputeBoundedSequenceDiff(
        baseLines,
        targetLines,
        (a, b) => a === b,
        (s) => s,
      );
      const hunks: Array<{ baseStart: number; baseEnd: number; replacement: string[] }> = [];
      let basePos = 0;
      let active: { baseStart: number; baseEnd: number; replacement: string[] } | null = null;
      for (const op of ops) {
        if (op.Kind === 'equal') {
          if (active) {
            hunks.push(active);
            active = null;
          }
          basePos = op.OldIndex + 1;
        } else if (op.Kind === 'delete') {
          if (!active) {
            active = { baseStart: op.OldIndex, baseEnd: op.OldIndex + 1, replacement: [] };
          } else {
            active.baseEnd = op.OldIndex + 1;
          }
          basePos = op.OldIndex + 1;
        } else {
          if (!active) {
            active = { baseStart: basePos, baseEnd: basePos, replacement: [targetLines[op.NewIndex]] };
          } else {
            active.replacement.push(targetLines[op.NewIndex]);
          }
        }
      }
      if (active) {
        hunks.push(active);
      }
      return hunks;
    };

    const localHunks = extractLineHunks(localLines);
    const serverHunks = extractLineHunks(serverLines);
    const merged: string[] = [];
    let baseCursor = 0;
    let lIdx = 0;
    let sIdx = 0;

    while (lIdx < localHunks.length || sIdx < serverHunks.length) {
      const lHunk = localHunks[lIdx];
      const sHunk = serverHunks[sIdx];
      const chooseLocalFirst =
        lHunk !== undefined &&
        (sHunk === undefined ||
          lHunk.baseStart < sHunk.baseStart ||
          (lHunk.baseStart === sHunk.baseStart && lHunk.baseEnd <= sHunk.baseStart));

      if (chooseLocalFirst && lHunk) {
        while (baseCursor < lHunk.baseStart) {
          merged.push(baseLines[baseCursor++]);
        }
        merged.push(...lHunk.replacement);
        baseCursor = Math.max(baseCursor, lHunk.baseEnd);
        lIdx++;
      } else if (sHunk) {
        const overlapsLocal =
          lHunk !== undefined &&
          Math.max(lHunk.baseStart, sHunk.baseStart) < Math.max(lHunk.baseEnd, sHunk.baseEnd) &&
          lHunk.baseStart <= sHunk.baseEnd &&
          sHunk.baseStart <= lHunk.baseEnd;

        if (overlapsLocal && lHunk) {
          const regionStart = Math.min(lHunk.baseStart, sHunk.baseStart);
          while (baseCursor < regionStart) {
            merged.push(baseLines[baseCursor++]);
          }
          merged.push(...sHunk.replacement);
          const extraLocal = lHunk.replacement.filter((line) => !sHunk.replacement.includes(line));
          merged.push(...extraLocal);
          baseCursor = Math.max(baseCursor, lHunk.baseEnd, sHunk.baseEnd);
          lIdx++;
          sIdx++;
        } else {
          while (baseCursor < sHunk.baseStart) {
            merged.push(baseLines[baseCursor++]);
          }
          merged.push(...sHunk.replacement);
          baseCursor = Math.max(baseCursor, sHunk.baseEnd);
          sIdx++;
        }
      }
    }

    while (baseCursor < baseLines.length) {
      merged.push(baseLines[baseCursor++]);
    }
    return merged.join('\n');
  }

  /**
   * Selects a block to anchor a new `DocBlock` comment thread in the right-margin drawer.
   * Only populates `SelectedAnchorQuote` when the user actually selected a text quote
   * (never slices `RawMarkdown.slice(0, 120)` as a fake quote).
   */
  public OpenAnchorCommentForSegment(
    seg: DocumentRenderSegment,
    explicitSelectedQuote?: string,
  ): void {
    this.SelectedAnchorKey = seg.SegmentID;
    this.SelectedAnchorLabel =
      seg.HeadingText ??
      seg.Descriptor?.Title ??
      seg.Descriptor?.EntityName ??
      seg.Descriptor?.ArtifactType ??
      seg.SegmentID;
    const rawSelection =
      explicitSelectedQuote !== undefined
        ? explicitSelectedQuote.trim()
        : typeof window !== 'undefined' && typeof window.getSelection === 'function'
          ? (window.getSelection()?.toString() ?? '').trim()
          : '';
    this.SelectedAnchorQuote =
      rawSelection && seg.RawMarkdown.includes(rawSelection)
        ? rawSelection
        : rawSelection
          ? rawSelection.slice(0, 240)
          : '';
    this.ShowCommentsDrawer = true;
    if (this.session) {
      this.session.SetActiveBlock(seg.SegmentID);
    }
    this.cdr.markForCheck();
  }

  /**
   * Posts a new anchored `DocBlock` comment thread (`MJ: Conversations` with `AnchorType='DocBlock'`,
   * `AnchorKey=<blockId>`) persisting only the user's real `Role = 'User'` comment to the server.
   */
  public async PostAnchoredComment(): Promise<void> {
    const message = this.NewCommentText.trim();
    if (!message) {
      return;
    }

    const user = this.getSafeCurrentUser();
    const mentions = ExtractAnchoredCommentMentions(message);
    const selectedQuote = this.SelectedAnchorQuote.trim();
    const nowIso = new Date().toISOString();
    const newThread: DocumentAnchoredThread = {
      ConversationID: `conv-${Date.now()}`,
      AnchorKey: this.SelectedAnchorKey,
      AnchorLabel: this.SelectedAnchorLabel,
      QuotedText: selectedQuote,
      Status: 'Open',
      AgentMode: this.NewCommentAgentMode,
      CreatedAt: nowIso,
      Messages: [
        {
          DetailID: `msg-${Date.now()}-1`,
          UserName: user?.Name || 'Current User',
          Role: 'User',
          Message: message,
          CreatedAt: nowIso,
          Mentions: mentions,
        },
      ],
    };

    const artifactId = this.artifactVersion?.ArtifactID;
    if (artifactId) {
      const persisted = await this.persistAnchoredThreadToServer(newThread);
      if (!persisted) {
        return;
      }
    }

    this.AnchoredThreads = [newThread, ...this.AnchoredThreads];
    this.NewCommentText = '';
    this.SelectedAnchorQuote = '';
    this.StatusBannerMessage = 'Posted anchored comment.';
    this.cdr.markForCheck();

    if (artifactId && mentions.length > 0) {
      const provider = this.getSafeProvider();
      const firstHandle = mentions[0];
      const markdownBeforeMention = this.MarkdownContent;
      const serverMention = await this.collabService.DispatchAnchoredCommentAgentMention(
        artifactId,
        firstHandle,
        newThread.AgentMode,
        message,
        selectedQuote || undefined,
        provider,
        newThread.ConversationID || undefined,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      const replyMessage = (serverMention.ReplyMessage ?? serverMention.ReplyBody ?? '').trim();
      const updatedContent =
        serverMention.Success &&
        typeof serverMention.UpdatedContent === 'string' &&
        serverMention.UpdatedContent.trim().length > 0
          ? serverMention.UpdatedContent
          : undefined;
      if (!serverMention.Success || (!replyMessage && !updatedContent)) {
        const errStatus =
          serverMention.ErrorMessage ||
          (!serverMention.HandledByServer
            ? `Cannot dispatch @${firstHandle}: live server agent runtime is unavailable.`
            : !serverMention.Success
              ? `Failed to run @${firstHandle} in ${newThread.AgentMode} mode.`
              : `@${firstHandle} did not return a reply.`);
        this.notifyError(errStatus);
        this.StatusBannerMessage = errStatus;
        this.cdr.detectChanges();
        return;
      }
      // In 'edit' mode, NEVER mutate document markdown locally unless UpdatedContent was returned with Success === true from server
      if (newThread.AgentMode === 'edit' && !updatedContent) {
        newThread.Messages.push({
          DetailID: `msg-${Date.now()}-agent`,
          UserName: `@${firstHandle}`,
          Role: 'Agent',
          Message: replyMessage,
          CreatedAt: new Date().toISOString(),
          Mentions: [],
        });
        this.StatusBannerMessage = `@${firstHandle} replied in comment thread.`;
        this.cdr.detectChanges();
        return;
      }
      this.DispatchAgentCommentMention(newThread, firstHandle, {
        replyMessage,
        proposedMarkdown: updatedContent,
        appliedOnServer: newThread.AgentMode === 'edit' && Boolean(updatedContent),
        anchorQuote: selectedQuote || undefined,
        markdownBeforeMention,
        versionNumber: serverMention.VersionNumber,
      });
    }
  }

  public ToggleResolveThread(thread: DocumentAnchoredThread): void {
    const previousStatus = thread.Status;
    thread.Status = thread.Status === 'Resolved' ? 'Open' : 'Resolved';
    void this.persistThreadResolutionStatus(thread, previousStatus);
    this.cdr.markForCheck();
  }

  private async persistThreadResolutionStatus(
    thread: DocumentAnchoredThread,
    previousStatus: 'Open' | 'Resolved',
  ): Promise<void> {
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!this.artifactVersion?.ArtifactID || !thread.ConversationID || !user || !provider) {
      return;
    }

    try {
      const conv = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
      const loaded = await conv.Load(thread.ConversationID);
      if (!loaded) {
        return;
      }
      conv.AnchorMetadata = JSON.stringify({
        label: thread.AnchorLabel,
        quote: thread.QuotedText,
        agentMode: thread.AgentMode,
        status: thread.Status,
      });
      const ok = await conv.Save();
      if (!ok) {
        thread.Status = previousStatus;
        const msg = conv.LatestResult?.Message || 'Failed to update comment resolution status.';
        LogError(msg);
        this.notifyError(msg);
      }
    } catch (err) {
      thread.Status = previousStatus;
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to update comment resolution status.');
    }
  }

  public GetThreadCountForAnchor(anchorKey: string): number {
    return this.AnchoredThreads.filter((t) => t.AnchorKey === anchorKey && t.Status === 'Open').length;
  }

  public FocusAnchorBlock(anchorKey: string): void {
    this.SelectedAnchorKey = anchorKey;
    this.cdr.markForCheck();
  }

  public SelectOutlineItem(item: DocumentOutlineItem): void {
    this.SelectedAnchorKey = item.ID;
    this.SelectedAnchorLabel = item.Title;
    if (this.session) {
      this.session.SetActiveBlock(item.ID);
    }
    this.cdr.markForCheck();
  }

  public IsOutlineItemActive(item: DocumentOutlineItem): boolean {
    return UUIDsEqual(this.SelectedAnchorKey, item.ID);
  }

  /**
   * Computes the line-by-line diff between the selected comparison base and current working Markdown.
   */
  public RecomputeDiff(): void {
    let baseText = this.initialLoadedMarkdown;
    if (this.DiffBaseLabel.startsWith('v')) {
      const verNum = Number(this.DiffBaseLabel.slice(1));
      const snap = this.SavedVersionSnapshots.find((s) => s.VersionNumber === verNum);
      if (snap) {
        baseText = snap.Content;
      }
    }
    this.CurrentDiff = this.collabService.ComputeLineDiff(baseText, this.MarkdownContent);
    this.cdr.markForCheck();
  }

  /**
   * Restores the selected comparison base version as the active working document.
   */
  public RestoreComparisonBase(): void {
    let baseText = this.initialLoadedMarkdown;
    if (this.DiffBaseLabel.startsWith('v')) {
      const verNum = Number(this.DiffBaseLabel.slice(1));
      const snap = this.SavedVersionSnapshots.find((s) => s.VersionNumber === verNum);
      if (snap) {
        baseText = snap.Content;
      }
    }
    this.OnMarkdownChanged(baseText);
    this.RecomputeDiff();
    this.StatusBannerMessage = 'Restored selected version content into working document.';
  }

  public get HasUnsavedChanges(): boolean {
    const latestSaved =
      this.SavedVersionSnapshots.length > 0
        ? this.SavedVersionSnapshots[this.SavedVersionSnapshots.length - 1].Content
        : this.initialLoadedMarkdown;
    return this.MarkdownContent !== latestSaved || this.PendingSuggestionsCount > 0;
  }

  /**
   * Saves a new `MJArtifactVersionEntity` snapshot (committing any pending Suggest Mode edits first),
   * triggers room compaction when connected via WebSocket, or persists via `ProviderToUse` after
   * querying `MAX(VersionNumber)` and checking `ver.Save()`. Does NOT emit `ContentCommitted` when
   * `sentViaSocket === true` to prevent duplicate version creation in `ArtifactViewerPanelComponent`.
   */
  public async OnSaveDocumentVersion(): Promise<void> {
    if (!this.CanUserEdit || this.IsSavingVersion || !this.HasUnsavedChanges) {
      return;
    }
    this.IsSavingVersion = true;
    this.cdr.markForCheck();
    try {
      const hadPendingBefore = this.PendingSuggestionsCount;
      const committedSuggestionsCount = this.CommitPendingSuggestions();
      if (hadPendingBefore > 0 && this.PendingSuggestionsCount > 0) {
        return;
      }

      const sentViaSocket = this.session?.RequestSaveVersion() ?? false;
      if (sentViaSocket) {
        this.StatusBannerMessage = 'Saving collaborative document version…';
        return;
      }

      const artifactId = this.artifactVersion?.ArtifactID;
      let savedVersionNumber: number;
      if (artifactId) {
        const persisted = await this.persistDocumentVersionToProvider(artifactId, this.MarkdownContent);
        if (!persisted.ok) {
          this.notifyError(persisted.errorMessage || 'Failed to save document version.');
          return;
        }
        savedVersionNumber = persisted.versionNumber;
      } else {
        savedVersionNumber =
          Math.max(
            this.artifactVersion?.VersionNumber ?? 1,
            ...this.SavedVersionSnapshots.map((s) => s.VersionNumber),
          ) + 1;
      }

      this.SavedVersionSnapshots.push({
        VersionNumber: savedVersionNumber,
        Content: this.MarkdownContent,
        Timestamp: new Date().toLocaleTimeString(),
      });

      this.ContentCommitted.emit(this.MarkdownContent);
      this.StatusBannerMessage =
        committedSuggestionsCount > 0
          ? `Committed ${committedSuggestionsCount} suggestion${committedSuggestionsCount === 1 ? '' : 's'} and saved document version v${savedVersionNumber}.`
          : `Saved document version v${savedVersionNumber}.`;
    } finally {
      this.IsSavingVersion = false;
      this.cdr.markForCheck();
    }
  }

  private async persistDocumentVersionToProvider(
    artifactId: string,
    content: string,
  ): Promise<{ ok: boolean; versionNumber: number; errorMessage?: string }> {
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!user || !provider) {
      return {
        ok: false,
        versionNumber: 0,
        errorMessage: 'Metadata provider or user context unavailable.',
      };
    }

    const serverCommit = await this.collabService.CommitInlineEditOnServer(
      artifactId,
      content,
      true,
      provider,
    );
    if (serverCommit.HandledByServer) {
      if (!serverCommit.Success) {
        return {
          ok: false,
          versionNumber: 0,
          errorMessage: serverCommit.ErrorMessage || 'Failed to save document version on server.',
        };
      }
      this.session?.AdoptOutOfBandCommittedContent(content);
      return {
        ok: true,
        versionNumber:
          serverCommit.VersionNumber ??
          Math.max(
            this.artifactVersion?.VersionNumber ?? 1,
            ...this.SavedVersionSnapshots.map((s) => s.VersionNumber),
          ) + 1,
      };
    }

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const maxRes = await rv.RunView<{ ID: string; VersionNumber: number }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
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
          this.artifactVersion?.VersionNumber ?? 0,
          ...this.SavedVersionSnapshots.map((s) => s.VersionNumber),
        ) + 1;

      const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = artifactId;
      ver.VersionNumber = nextVerNum;
      ver.Name = this.getDisplayTitle() || 'Document';
      ver.UserID = user.ID;
      ver.Content = content;
      const docConfig = BuildArtifactVersionConfigurationWithPreview(
        this.artifactVersion?.Configuration,
        content,
        'MarkdownArtifactViewerComponent',
        ver.Name,
      );
      if (docConfig) {
        ver.Configuration = docConfig;
      }
      const ok = await ver.Save();
      if (!ok) {
        const msg = ver.LatestResult?.Message || 'Failed to save document version.';
        LogError(msg);
        return { ok: false, versionNumber: 0, errorMessage: msg };
      }
      return { ok: true, versionNumber: nextVerNum };
    } catch (err) {
      LogError(err);
      return {
        ok: false,
        versionNumber: 0,
        errorMessage: err instanceof Error ? err.message : 'Failed to save document version.',
      };
    }
  }

  public TriggerFileImport(): void {
    this.FileImportInput?.nativeElement?.click();
  }

  public async OnImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const lowerName = file.name.toLowerCase();
      let importedMd: string;
      if (lowerName.endsWith('.docx')) {
        importedMd = await this.importExportService.ImportDocxFile(file);
      } else {
        importedMd = await this.importExportService.ImportMarkdown(file);
      }
      this.OnMarkdownChanged(importedMd);
      this.StatusBannerMessage = `Imported "${file.name}" into document.`;
    } catch (err) {
      LogError(err);
      this.notifyError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  public OnExportMarkdown(): void {
    const baseTitle = (this.getDisplayTitle() || 'document').replace(/[^a-zA-Z0-9_-]+/g, '-');
    this.importExportService.DownloadMarkdownFile(this.MarkdownContent, `${baseTitle}.md`);
    this.StatusBannerMessage = `Exported ${baseTitle}.md`;
  }

  public async OnExportDocx(): Promise<void> {
    const title = this.getDisplayTitle() || 'Document';
    const baseTitle = title.replace(/[^a-zA-Z0-9_-]+/g, '-');
    await this.importExportService.DownloadDocxFile(this.MarkdownContent, `${baseTitle}.docx`, title);
    this.StatusBannerMessage = `Exported ${baseTitle}.docx`;
  }

  public OnCopy(): void {
    if (this.MarkdownContent && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(this.MarkdownContent)
        .then(() => {
          this.StatusBannerMessage = 'Copied Markdown to clipboard.';
          this.cdr.markForCheck();
        })
        .catch((err) => {
          LogError(err);
        });
    }
  }

  /** @deprecated Use {@link OnCopy}. */
  public onCopy(): void {
    return this.OnCopy();
  }

  public GetCompactCollaborationStatusLabel(): string {
    switch (this.CollaborationStatus) {
      case 'connected':
        return 'Live';
      case 'connecting':
        return 'Syncing…';
      case 'readonly':
        return 'Read-Only';
      case 'revoked':
        return 'Revoked';
      case 'error':
        return 'Sync Issue';
      case 'disconnected':
        return 'Offline';
      default:
        return this.CanUserEdit ? 'Ready' : 'Read-Only';
    }
  }

  public GetCollaborationStatusLabel(): string {
    switch (this.CollaborationStatus) {
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
        return this.CanUserEdit ? 'Ready · Collaborative' : 'Read-Only';
    }
  }

  public RetryLiveCollaboration(): void {
    const artifactId = this.session?.ArtifactID || this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    void this.collabService.Retry(artifactId);
  }

  public GetInitials(name: string): string {
    return (name || 'U')
      .split(/\s+/)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('');
  }

  public GetLiveBlockIcon(type: DocumentBlockKind): string {
    switch (type) {
      case 'EntityView':
        return 'fa-table-list';
      case 'SavedQuery':
        return 'fa-database';
      case 'DashboardPart':
        return 'fa-chart-pie';
      case 'InteractiveComponent':
        return 'fa-puzzle-piece';
      default:
        return 'fa-cube';
    }
  }

  public FormatCellValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '—';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private notifyError(message: string): void {
    this.StatusBannerMessage = message;
    this.notificationService?.CreateSimpleNotification(message, 'error', 4000);
    this.cdr.markForCheck();
  }

  private handleCollaborationMergeConflict(event: CollaborationMergeConflictEvent): void {
    this.StatusBannerMessage = MERGE_CONFLICT_WARNING_MESSAGE;
    this.collabService.NotifyMergeConflictToastOnce(event, this.notificationService);
    this.cdr.markForCheck();
  }

  private getSafeProvider(): IMetadataProvider | null {
    try {
      return this.ProviderToUse ?? null;
    } catch {
      return null;
    }
  }

  private getSafeCurrentUser() {
    try {
      return this.getSafeProvider()?.CurrentUser;
    } catch {
      return undefined;
    }
  }

  private initializeDocument(): void {
    const raw = this.getContent();
    this.MarkdownContent = raw;
    this.initialLoadedMarkdown = raw;
    this.blockResults.clear();
    this.embeddedArtifactVersions.clear();
    this.inFlightEmbeddedVersionKeys.clear();
    this.failedEmbeddedVersionMessages.clear();
    this.AnchoredThreads = [];

    const hasPersistedArtifact = Boolean(this.artifactVersion?.ArtifactID);
    if (hasPersistedArtifact) {
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.CurrentUserEffectiveRoleLabel = 'Viewer';
    } else {
      this.HasEditPermission = !this.readonly;
      this.CanUserShareArtifact = false;
      this.CurrentUserEffectiveRoleLabel = this.readonly ? 'Viewer' : 'Editor';
    }

    this.loadCollapsedStateFromUserSettings();
    if (!this.userExplicitlySelectedMode || !this.CanUserEdit) {
      this.ViewMode = 'preview';
    }
    this.SavedVersionSnapshots = [
      {
        VersionNumber: this.artifactVersion?.VersionNumber ?? 1,
        Content: raw,
        Timestamp: 'Initial',
      },
    ];
    const gen = ++this.sessionInitGeneration;
    this.refreshParsedStructure();
    this.setupCollaborationSession();
    this.promoteToDefaultEditModeIfEligible();
    void this.evaluatePermissionsAndLoadThreads(gen);
  }

  private refreshParsedStructure(): void {
    this.DocumentSegments = this.collabService.ParseDocumentSegments(this.MarkdownContent);
    this.OutlineItems = this.collabService.ExtractOutline(this.MarkdownContent);
    this.WordStats = this.collabService.ComputeWordStats(this.MarkdownContent);
    for (const seg of this.DocumentSegments) {
      if (seg.Kind === 'mj-block' && seg.Descriptor) {
        if (seg.Descriptor.Kind === 'Artifact') {
          this.GetEmbeddedArtifactVersion(seg.Descriptor);
        } else if (seg.Descriptor.Mode === 'Frozen') {
          void this.verifyFrozenBlockOnServer(seg.Descriptor);
        } else if (!this.blockResults.has(seg.Descriptor.BlockID)) {
          void this.RefreshLiveBlock(seg.Descriptor);
        }
      }
    }
    if (this.ViewMode === 'diff') {
      this.RecomputeDiff();
    }
  }

  private async verifyFrozenBlockOnServer(block: DocumentBlockSpec): Promise<void> {
    const provider = this.getSafeProvider();
    if (!provider || !this.collabService.HasCollaborationBackend(provider)) {
      return;
    }
    await this.collabService.VerifyFrozenSnapshotOnServer(block, provider);
    if (!this.isComponentDestroyed) {
      this.cdr.markForCheck();
    }
  }

  private setupCollaborationSession(): void {
    this.destroyCollaborationSession();
    const artifactId = this.artifactVersion?.ArtifactID || this.artifactVersion?.ID || 'local-doc';
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    const hasRemoteBackend = this.collabService.HasCollaborationBackend(provider, this.CollaborationWsUrl);

    this.session = this.collabService.CreateSession(
      artifactId,
      this.MarkdownContent,
      {
        id: user?.ID ?? 'local-user',
        name: user?.Name ?? 'Collaborator',
        email: user?.Email,
      },
      this.hasPermissionToEdit,
      hasRemoteBackend,
    );
    this.liveSyncUnavailable = Boolean(this.session.LiveSyncUnavailable);

    this.sessionSubs.push(
      this.session.OnLiveSyncUnavailable$.subscribe((unavailable) => {
        if (this.isComponentDestroyed) {
          return;
        }
        const changed = this.liveSyncUnavailable !== unavailable;
        this.liveSyncUnavailable = unavailable;
        if (unavailable && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
          this.ViewMode = 'preview';
        }
        if (changed) {
          this.cdr.detectChanges();
        } else {
          this.cdr.markForCheck();
        }
      }),
      this.session.ContentChanged$.subscribe((remoteContent) => {
        if (remoteContent !== this.MarkdownContent) {
          this.OnMarkdownChanged(remoteContent, true);
        }
      }),
      this.session.StatusChanged$.subscribe((status) => {
        this.CollaborationStatus = status;
        if (status === 'revoked') {
          this.HasEditPermission = false;
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        } else if (status === 'readonly' && !this.session?.CanEdit) {
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        } else {
          this.promoteToDefaultEditModeIfEligible();
        }
        if (!this.isComponentDestroyed) {
          this.cdr.detectChanges();
        }
      }),
      this.session.CollaboratorsChanged$.subscribe((peers) => {
        this.Collaborators = peers;
        if (!this.isComponentDestroyed) {
          this.cdr.detectChanges();
        }
      }),
      this.session.VersionSaved$.subscribe((savedEvt) => {
        const exists = this.SavedVersionSnapshots.some((s) => s.VersionNumber === savedEvt.versionNumber);
        if (!exists) {
          this.SavedVersionSnapshots.push({
            VersionNumber: savedEvt.versionNumber,
            Content: this.MarkdownContent,
            Timestamp: new Date().toLocaleTimeString(),
          });
          this.ContentCommitted.emit(this.MarkdownContent);
        }
        this.StatusBannerMessage = `Saved document version v${savedEvt.versionNumber}.`;
        this.cdr.markForCheck();
      }),
    );

    this.sessionSubs.push(
      this.session.MergeConflict$.subscribe((conflictEvt: CollaborationMergeConflictEvent) => {
        if (this.isComponentDestroyed) {
          return;
        }
        this.handleCollaborationMergeConflict(conflictEvt);
      }),
      this.session.CanUndo$.subscribe(() => {
        if (!this.isComponentDestroyed) {
          this.cdr.markForCheck();
        }
      }),
      this.session.CanRedo$.subscribe(() => {
        if (!this.isComponentDestroyed) {
          this.cdr.markForCheck();
        }
      }),
    );

    if (hasRemoteBackend) {
      void this.session.Connect(this.CollaborationWsUrl, provider);
    }

    this.Collaborators = this.session.GetCollaborators();
  }

  private destroyCollaborationSession(): void {
    for (const sub of this.sessionSubs) {
      sub.unsubscribe();
    }
    this.sessionSubs = [];
    if (this.permissionUnsub) {
      this.permissionUnsub();
      this.permissionUnsub = null;
    }
    if (this.session) {
      this.session.Destroy();
      this.session = null;
    }
    this.liveSyncUnavailable = false;
  }

  public RetryVerifyPermissions(): void {
    void this.evaluatePermissionsAndLoadThreads(this.sessionInitGeneration);
  }

  private async evaluatePermissionsAndLoadThreads(gen = this.sessionInitGeneration): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.CurrentUserEffectiveRoleLabel = 'Viewer';
      this.session?.SetCanEdit(false);
      if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
        this.ViewMode = 'preview';
      }
      this.cdr.markForCheck();
      return;
    }

    try {
      const perms = await this.collabService.ResolvePermissionsFromServer(artifactId, provider);
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      if (!perms) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = false;
        this.HasEditPermission = false;
        this.CanUserShareArtifact = false;
        this.CurrentUserEffectiveRoleLabel = 'Viewer';
        this.session?.SetCanEdit(false);
        this.cdr.markForCheck();
        return;
      }
      if (perms.PermissionVerifyError) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = true;
        this.HasEditPermission = false;
        this.CanUserShareArtifact = false;
        this.CurrentUserEffectiveRoleLabel = 'Viewer';
        this.CollaborationStatus = 'readonly';
        if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
          this.ViewMode = 'preview';
        }
        this.session?.SetCanEdit(false);
        this.cdr.markForCheck();
        return;
      }
      this.PermissionVerifyError = false;
      this.HasEditPermission = perms.CanEdit;
      this.CanUserShareArtifact = perms.CanShare;
      this.CurrentUserEffectiveRoleLabel = perms.CanShare
        ? 'Owner / Co-Owner'
        : perms.CanEdit
          ? 'Editor'
          : perms.CanRead
            ? 'Viewer'
            : 'No Access';
      if (!perms.CanRead) {
        this.AccessRevoked = true;
        this.CollaborationStatus = 'revoked';
        this.ViewMode = 'preview';
        this.session?.SetCanEdit(false);
      } else {
        this.AccessRevoked = false;
        this.session?.SetCanEdit(this.hasPermissionToEdit);
        if (this.session) {
          this.CollaborationStatus = this.session.Status;
        }
        if (!perms.CanEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
          this.ViewMode = 'preview';
        } else {
          this.promoteToDefaultEditModeIfEligible();
        }
      }
      if (!this.isComponentDestroyed) {
        this.cdr.detectChanges();
      }
    } catch (err) {
      LogError(err);
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      this.AccessRevoked = false;
      this.PermissionVerifyError = true;
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.CurrentUserEffectiveRoleLabel = 'Viewer';
      this.CollaborationStatus = 'readonly';
      this.session?.SetCanEdit(false);
      if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
        this.ViewMode = 'preview';
      }
      if (!this.isComponentDestroyed) {
        this.cdr.detectChanges();
      }
    }

    await this.hydrateAnchoredThreadsFromServer(artifactId, user, provider, gen);
    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }

    if (this.permissionUnsub) {
      this.permissionUnsub();
      this.permissionUnsub = null;
    }
    this.permissionUnsub = ArtifactPermissionEngine.Instance.OnPermissionsChanged(async (evt) => {
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      if (UUIDsEqual(evt.ArtifactID, artifactId) && user) {
        try {
          const updated = await this.collabService.ResolvePermissionsFromServer(artifactId, provider);
          if (this.isComponentDestroyed || gen !== this.sessionInitGeneration || !updated) {
            return;
          }
          if (updated.PermissionVerifyError) {
            this.AccessRevoked = false;
            this.PermissionVerifyError = true;
            this.HasEditPermission = false;
            this.CanUserShareArtifact = false;
            this.CollaborationStatus = 'readonly';
            if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
              this.ViewMode = 'preview';
            }
            this.session?.SetCanEdit(false);
            this.cdr.markForCheck();
            return;
          }
          this.PermissionVerifyError = false;
          this.HasEditPermission = updated.CanEdit;
          this.CanUserShareArtifact = updated.CanShare;
          this.CurrentUserEffectiveRoleLabel = updated.CanShare
            ? 'Owner / Co-Owner'
            : updated.CanEdit
              ? 'Editor'
              : updated.CanRead
                ? 'Viewer'
                : 'No Access';
          if (!updated.CanRead) {
            this.AccessRevoked = true;
            this.CollaborationStatus = 'revoked';
            this.ViewMode = 'preview';
            this.session?.SetCanEdit(false);
          } else {
            this.AccessRevoked = false;
            this.session?.SetCanEdit(this.hasPermissionToEdit);
            if (!updated.CanEdit) {
              this.CollaborationStatus = 'readonly';
              if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
                this.ViewMode = 'preview';
              }
            } else {
              if (this.session) {
                this.CollaborationStatus = this.session.Status;
              }
              this.promoteToDefaultEditModeIfEligible();
            }
          }
          if (!this.isComponentDestroyed) {
            this.cdr.detectChanges();
          }
        } catch (err) {
          LogError(err);
        }
      }
    });
  }

  private async hydrateAnchoredThreadsFromServer(
    artifactId: string,
    user: NonNullable<ReturnType<MarkdownArtifactViewerComponent['getSafeCurrentUser']>>,
    provider: IMetadataProvider,
    gen = this.sessionInitGeneration,
  ): Promise<void> {
    try {
      const artifactEntityId = this.resolveArtifactsEntityId(provider);
      if (!artifactEntityId) {
        return;
      }

      const rv = RunView.FromMetadataProvider(provider);
      const convRes = await rv.RunView<{
        ID: string;
        Name: string;
        LinkedEntityID?: string | null;
        LinkedRecordID?: string | null;
        AnchorType?: MJConversationEntity['AnchorType'];
        AnchorKey?: string | null;
        AnchorMetadata?: string | null;
        __mj_CreatedAt?: string;
      }>(
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `LinkedEntityID='${EscapeSQLString(artifactEntityId)}' AND LinkedRecordID='${EscapeSQLString(artifactId)}' AND AnchorType='DocBlock'`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 200,
          ResultType: 'simple',
        },
        user,
      );
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }

      const rawRows = convRes.Success ? convRes.Results ?? [] : [];
      if (rawRows.length === 0) {
        return;
      }

      const normalizedRows = rawRows.map((c) => ({
        ...c,
        LinkedEntityID: c.LinkedEntityID ?? artifactEntityId,
        LinkedRecordID: c.LinkedRecordID ?? artifactId,
        AnchorType: c.AnchorType ?? ('DocBlock' as MJConversationEntity['AnchorType']),
      }));
      const convRows = await FilterReadableAnchoredConversations(provider, user, normalizedRows);
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration || convRows.length === 0) {
        return;
      }

      const convIds = convRows.filter((c) => Boolean(c.ID)).map((c) => `'${EscapeSQLString(c.ID)}'`);
      const detailsByConv = new Map<
        string,
        Array<{
          ID: string;
          ConversationID: string;
          User?: string | null;
          Role: string;
          Message: string;
          __mj_CreatedAt?: string;
        }>
      >();

      if (convIds.length > 0) {
        const detailRes = await rv.RunView<{
          ID: string;
          ConversationID: string;
          User?: string | null;
          Role: string;
          Message: string;
          __mj_CreatedAt?: string;
        }>(
          {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID IN (${convIds.join(',')})`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: 500,
            ResultType: 'simple',
          },
          user,
        );
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
        for (const d of detailRes.Results ?? []) {
          const list = detailsByConv.get(d.ConversationID) ?? [];
          list.push(d);
          detailsByConv.set(d.ConversationID, list);
        }
      }

      this.AnchoredThreads = convRows.map((c) => {
        const meta = c.AnchorMetadata
          ? (SafeJSONParse<{
              label?: string;
              quote?: string;
              agentMode?: 'suggest' | 'edit' | 'comment';
              status?: 'Open' | 'Resolved';
            }>(c.AnchorMetadata) ?? {})
          : {};
        const msgs = (detailsByConv.get(c.ID) ?? []).map((d) => ({
          DetailID: d.ID,
          UserName: d.Role === 'AI' ? 'AI Assistant' : d.User || 'Unknown User',
          Role: (d.Role === 'AI' ? 'Agent' : 'User') as 'User' | 'Agent',
          Message: d.Message,
          CreatedAt: d.__mj_CreatedAt ?? new Date().toISOString(),
          Mentions: ExtractAnchoredCommentMentions(d.Message ?? ''),
        }));

        return {
          ConversationID: c.ID,
          AnchorKey: c.AnchorKey || 'doc-root',
          AnchorLabel: meta.label || c.Name.replace(/^DocComment:\s*/i, '') || c.AnchorKey || 'Document Block',
          QuotedText: meta.quote || '',
          Status: meta.status === 'Resolved' ? 'Resolved' : 'Open',
          AgentMode: meta.agentMode === 'edit' ? 'edit' : meta.agentMode === 'comment' ? 'comment' : 'suggest',
          CreatedAt: c.__mj_CreatedAt ?? new Date().toISOString(),
          Messages: msgs,
        };
      });
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  private async persistAnchoredThreadToServer(thread: DocumentAnchoredThread): Promise<boolean> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!artifactId || !user || !provider) {
      this.notifyError('Cannot save anchored comment: metadata provider or user context unavailable.');
      return false;
    }

    try {
      const artifactEntityId = this.resolveArtifactsEntityId(provider);
      if (!artifactEntityId) {
        this.notifyError('Cannot save anchored comment: MJ: Artifacts entity metadata unavailable.');
        return false;
      }

      const conv = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
      conv.NewRecord();
      conv.UserID = user.ID;
      conv.Name = `DocComment: ${thread.AnchorLabel}`;
      conv.LinkedEntityID = artifactEntityId;
      conv.LinkedRecordID = artifactId;
      conv.AnchorType = 'DocBlock';
      conv.AnchorKey = thread.AnchorKey;
      conv.AnchorMetadata = JSON.stringify({
        label: thread.AnchorLabel,
        quote: thread.QuotedText,
        agentMode: thread.AgentMode,
        status: thread.Status,
      });
      const convSaved = await conv.Save();
      if (!convSaved || !conv.ID) {
        const msg = conv.LatestResult?.Message || 'Failed to save anchored comment conversation.';
        LogError(msg);
        this.notifyError(msg);
        return false;
      }

      thread.ConversationID = conv.ID;
      for (const msg of thread.Messages) {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', user);
        detail.NewRecord();
        detail.ConversationID = conv.ID;
        detail.UserID = user.ID;
        detail.Role = 'User';
        detail.Message = msg.Message;
        const detailSaved = await detail.Save();
        if (!detailSaved) {
          const errMsg = detail.LatestResult?.Message || 'Failed to save anchored comment detail.';
          LogError(errMsg);
          this.notifyError(errMsg);
          return false;
        }
        if (detail.ID) {
          msg.DetailID = detail.ID;
        }
      }
      return true;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save anchored comment.');
      return false;
    }
  }
}
