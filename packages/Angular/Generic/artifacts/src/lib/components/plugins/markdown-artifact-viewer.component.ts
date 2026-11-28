import { Component, ChangeDetectionStrategy, HostListener, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck, ChangeDetectorRef, ViewChild, ElementRef, NgZone, Renderer2, Type, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { CompositeKey, DataSnapshot, LogError, RunView, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MentionSuggestion } from '@memberjunction/ng-composer';
import { EscapeSQLString, IndexByUUID, IsValidUUID, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
  ApplyDocumentDesignConfigToMarkdown,
  ArtifactMetadataEngine,
  BuildArtifactVersionConfigurationWithPreview,
  ComputeDocumentStats,
  DOCUMENT_DESIGN_PRESETS,
  DocumentLiveBlockEngine,
  ExtractDocumentDesignConfig,
  GetDocumentDesignPreset,
  ParseDocumentFrontmatter,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SpreadsheetEngine,
  UserInfoEngine,
  type ArtifactTypeThumbnailPolicy,
  type BlockRecord,
  type DocumentDesignConfig,
  type DocumentDesignPreset,
  type DocumentDesignPresetID,
  type DocumentPageOrientation,
  type DocumentPageSize,
  type DocumentStats,
  type WorksheetSpec,
  type DocumentBlockColumn,
  type DocumentBlockSpec,
  type DocumentBlockExecutionResult,
  type DocumentBlockKind,
  type DocumentLockedRange,
  type MJArtifactEntity,
  type MJArtifactPermissionEntity,
  type MJArtifactVersionEntity,
  type MJConversationEntity,
  type MJConversationDetailEntity,
  QueryEngine,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { PdfOrientation } from '@memberjunction/ng-react';
import { Subscription } from 'rxjs';
import {
  ArtifactNavigationAnchor,
  ArtifactViewerViewMode,
  BaseArtifactViewerPluginComponent,
  IArtifactVersionDiffViewer,
  type ArtifactExportOption,
  type PreVerifiedFrozenSnapshotEntry,
} from '../base-artifact-viewer.component';
import { ResolvePreVerifiedFrozenSnapshotState } from '../../utils/frozen-snapshot-verification.util';
import {
  BuildCanonicalDocumentSuggestionRecord,
  NormalizeDocumentSuggestion,
  ParseSuggestionsFromConfiguration,
  ReadArtifactVersionConfigurationSafe,
  UpsertArtifactSuggestionInVersionConfiguration,
} from '../../utils/artifact-suggestion-normalizer.util';
import { MJ_EMBEDDED_ARTIFACT_ANCESTORS, MJ_MAX_EMBED_DEPTH } from '../artifact-type-plugin-viewer.component';
import { CaptureThumbnailForDriverIfAllowed } from '../../utils/artifact-dom-capture';
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
  type CollaborationResetConflictDraft,
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
import {
  DocumentImportExportService,
  type DocExportMode,
  type DocumentExportPreflightReport,
  type DocxImportFidelityReport,
} from '../../services/document-import-export.service';
import { ArtifactLinkTriggerProvider } from '../../services/artifact-link-trigger.provider';
import {
  CheckDocRecordLinksAccessBatch,
  DOC_LINK_PREVIEW_HREF_READABLE,
  DOC_LINK_PREVIEW_HREF_UNREADABLE,
  ExtractDocRecordLinks,
  FindActiveDocLinkTrigger,
  HasDocRecordLinks,
  RenderDocRecordLinkChipHtml,
  ReplaceDocLinkTriggerWithToken,
  ReplaceDocRecordLinksWithPreviewMarkdown,
  ResolveDocRecordLinkCompositeKey,
  StripDocRecordLinksToPlainText,
  type DocRecordLinkAccessState,
  type ParsedDocRecordLink,
} from '../../utils/doc-record-link.util';
import { ARTIFACT_AI_ASSISTANT_ENABLED, RequestArtifactAiAssistant } from '../../services/artifact-ai-assistant-bridge';
import { ComputeBoundedSequenceDiff } from '../../utils/line-diff';
import type { ContextMenuItem, TouchContextMenuTrigger } from '../context-menu/context-menu.types';
import {
  ComputeElementContextMenuAnchor,
  IsKeyboardContextMenuShortcut,
  IsNativeContextMenuTarget,
  ShouldBypassCustomContextMenu,
  TouchContextMenuMonitor,
} from '../context-menu/context-menu-position.util';
import {
  BuildDocsContextMenu,
  type DocsCalloutType,
  type DocsContextMenuCommand,
  type DocsContextMenuSnapshot,
  type DocsContextTarget,
  type DocsLiveRecordLinkContext,
  type DocsTableAlignment,
} from './context-menus/docs-context-menu.helper';
import type { ArtifactCommandPaletteItem } from './artifact-command-palette.component';

export type DocsViewerMode = 'edit' | 'suggest' | 'preview' | 'source' | 'diff';
export type DocsEditingStyle = 'simple' | 'blocks';
type DocsBlockRow = DocumentBlockExecutionResult['Rows'][number];
type DocsBlockCellValue = DocsBlockRow[string];

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
  | 'design-preset'
  | 'page-layout'
  | 'comments'
  | 'share'
  | 'source-mode'
  | 'diff-mode'
  | 'export-studio'
  | 'export-docx'
  | 'export-md'
  | 'copy-md'
  | 'ask-ai';

export type DocsPageLayoutMode = 'continuous' | 'paginated';
export type DocsStatsMetricMode = 'words' | 'chars' | 'charsNoSpaces';

export const DEFAULT_PINNED_DOCS_TOOLBAR_ACTIONS: readonly DocsToolbarItemKey[] = [
  'format',
  'comments',
];

export interface DocsToolbarVisibilitySetting {
  Version: 1;
  ShowOutlineRail?: boolean;
  EditingStyle?: DocsEditingStyle;
  FormattingRibbonPinned?: boolean;
  PageLayoutMode?: DocsPageLayoutMode;
  StatsMetric?: DocsStatsMetricMode;
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

export interface FrozenBlockDriftComparison {
  BlockID: string;
  Loading: boolean;
  ErrorMessage?: string;
  CheckedAt?: string;
  AddedRows: number;
  RemovedRows: number;
  ModifiedCells: number;
  UnchangedRows: number;
  SampleDiffs: Array<{
    Kind: 'added' | 'removed' | 'modified';
    RowLabel: string;
    Summary: string;
  }>;
  LiveRowCount: number;
  FrozenRowCount: number;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mj-docs-workspace"
      [class.mj-docs-workspace--compact]="CompactMode"
      [ngClass]="cssClass"
      data-testid="mj-docs-workspace"
      (keydown)="OnDocsWorkspaceKeydown($event)"
    >
      <!-- Tier 1: Calm Progressive Disclosure Collaboration & Mode Toolbar -->
      @if (!CompactMode) {
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
              <i class="fa-solid fa-eye"></i> Read
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
                <i class="fa-solid fa-pen-to-square"></i> Write
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
                <i class="fa-solid fa-rotate-left"></i>
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
                <i class="fa-solid fa-rotate-right"></i>
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
              <i class="fa-solid fa-code-pull-request"></i>
              <span>Suggest</span>
              @if (PendingSuggestionsCount > 0) {
                <span class="mj-docs-badge mj-docs-badge--brand">{{ PendingSuggestionsCount }}</span>
              }
              @if (ViewMode === 'suggest') {
                <i class="fa-solid fa-xmark mj-docs-active-mode-chip__close"></i>
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
              <i class="fa-solid fa-cubes"></i>
              <span>Blocks</span>
              <i class="fa-solid fa-xmark mj-docs-active-mode-chip__close"></i>
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
              <i class="fa-solid" [ngClass]="ViewMode === 'source' ? 'fa-code' : 'fa-code-compare'"></i>
              <span>{{ ViewMode === 'source' ? 'Source' : 'Diff' }}</span>
              <i class="fa-solid fa-xmark mj-docs-active-mode-chip__close"></i>
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
              <i class="fa-solid" [ngClass]="item.Icon"></i>
              <span>{{ item.Label }}</span>
              @if (item.Badge != null) {
                <span class="mj-docs-badge mj-docs-badge--brand">{{ item.Badge }}</span>
              }
              @if (item.HasChevron) {
                <i class="fa-solid" [ngClass]="item.ChevronUp ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              }
            </button>
          }
        </div>

        <div class="mj-docs-toolbar__right">
          @if (IsAiAssistantEnabled && CanUserEdit && !IsToolbarItemShownOnBar('ask-ai')) {
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--ai"
              title="Open slide-in AI Assistant for this document (/ai)"
              data-testid="docs-ask-ai-quick-btn"
              (mousedown)="OnToolbarActionMousedown($event)"
              (click)="OpenAskAiAssistant()"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span>AI</span>
            </button>
          }
          <!-- Compact Collaboration Presence Indicator (full status on hover) -->
          <div
            class="mj-docs-presence-pill mj-docs-presence-pill--compact"
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
            @if (HumanCollaborators.length > 0) {
              <div class="mj-docs-avatar-stack">
                @for (peer of HumanCollaborators; track peer.ClientID) {
                  <span class="mj-docs-avatar" [title]="peer.Name + (peer.CanEdit ? ' (Editing)' : ' (Viewing)')">
                    {{ GetInitials(peer.Name) }}
                  </span>
                }
              </div>
            }
            <mj-artifact-agent-presence-bar
              [Collaborators]="Collaborators"
              ActiveDomain="document"
              (JumpToAgentLocation)="JumpToAgentDocumentLocation($event)"
            ></mj-artifact-agent-presence-bar>
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
              <i class="fa-solid" [ngClass]="item.Icon"></i>
              @if (item.Key !== 'comments') {
                <span>{{ item.Label }}</span>
              }
              @if (item.Badge != null && (typeof item.Badge !== 'number' || item.Badge > 0)) {
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
              [title]="HasUnsavedChanges ? 'Save Document Version' : 'All changes synced — no unsaved changes'"
              data-testid="save-doc-version-btn"
              (click)="OnSaveDocumentVersion()"
            >
              @if (HasUnsavedChanges) {
                <i class="fa-solid fa-cloud-arrow-up"></i>
              } @else {
                <span class="mj-docs-saved-dot" aria-hidden="true"></span>
              }
              <span>{{ IsSavingVersion ? 'Saving…' : HasUnsavedChanges ? 'Save Version' : 'Saved' }}</span>
            </button>
          }

          <button
            type="button"
            class="mj-docs-btn mj-docs-cmdk-btn"
            title="Search all document commands, blocks, suggest mode, diff & export (Cmd/Ctrl+K)"
            data-testid="docs-cmdk-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="OpenCommandPalette()"
          >
            <span class="mj-docs-kbd-tag">⌘K</span>
          </button>

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
              <i class="fa-solid fa-ellipsis"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Rendered outside .mj-docs-toolbar so toolbar horizontal scrolling (overflow-x: auto) never clips the menu -->
      <div
        class="mj-docs-more-menu"
        #moreMenuPanel
        [hidden]="!ShowMoreToolsMenu"
        [style.top.px]="MoreMenuTopPx"
        [style.right.px]="MoreMenuRightPx"
        data-testid="docs-more-tools-menu"
      >
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
                  <i class="fa-solid" [ngClass]="item.Icon"></i>
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
                  <i class="fa-solid fa-thumbtack"></i>
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
                  <i class="fa-solid fa-file-import"></i>
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
      }

      <!-- Tier 2 (Progressive Disclosure): Collapsible Formatting Ribbon -->
      @if (!CompactMode && CanUserEdit && (ViewMode === 'edit' || ViewMode === 'suggest' || ViewMode === 'source')) {
        <div
          class="mj-docs-format-ribbon"
          [hidden]="!ShowFormattingRibbon"
          aria-label="Formatting Tools"
          data-testid="docs-format-ribbon"
        >
          <button type="button" class="mj-docs-btn" title="Bold" data-testid="fmt-bold-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('**', '**')">
            <i class="fa-solid fa-bold"></i>
          </button>
          <button type="button" class="mj-docs-btn" title="Italic" data-testid="fmt-italic-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('*', '*')">
            <i class="fa-solid fa-italic"></i>
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
            <i class="fa-solid fa-list-ul"></i> List
          </button>
          <button type="button" class="mj-docs-btn" title="Task List" data-testid="fmt-checklist-btn" (mousedown)="OnToolbarActionMousedown($event)" (click)="InsertFormattingSnippet('- [ ] ', '')">
            <i class="fa-solid fa-list-check"></i> Checklist
          </button>
          <button
            type="button"
            class="mj-docs-btn"
            title="Insert Table"
            data-testid="fmt-table-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="InsertFormattingSnippet('| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n', '')"
          >
            <i class="fa-solid fa-table"></i> Table
          </button>
          <button
            type="button"
            class="mj-docs-btn"
            title="Callout Block"
            data-testid="fmt-callout-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="InsertFormattingSnippet('> [!NOTE]\n> ', '')"
          >
            <i class="fa-solid fa-circle-info"></i> Callout
          </button>
          <span class="mj-docs-ribbon-sep"></span>
          <button
            type="button"
            class="mj-docs-btn"
            title="Insert Linked Spreadsheet Chart (/sheet-chart)"
            data-testid="fmt-sheet-chart-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="OpenSlashBlockInsert('/sheet-chart')"
          >
            <i class="fa-solid fa-chart-column"></i> Sheet Chart
          </button>
          <button
            type="button"
            class="mj-docs-btn"
            title="Insert Linked Spreadsheet Range (/sheet-range)"
            data-testid="fmt-sheet-range-btn"
            (mousedown)="OnToolbarActionMousedown($event)"
            (click)="OpenSlashBlockInsert('/sheet-range')"
          >
            <i class="fa-solid fa-table-cells"></i> Sheet Range
          </button>
          <span class="mj-docs-ribbon-hint">
            Tip: Type <kbd>/</kbd> anywhere to insert a live <strong>View</strong>, <strong>Query</strong>,
            <strong>Sheet Chart/Range</strong>, or <strong>Whiteboard</strong>
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
            <i class="fa-solid fa-thumbtack"></i>
            <span>{{ FormattingRibbonPinned ? 'Pinned' : 'Pin Ribbon' }}</span>
          </button>
        </div>
      }

      <!-- Slash Command Palette Popover -->
      @if (ShowSlashMenu) {
        <div class="mj-docs-slash-popover" data-testid="slash-command-menu">
          <div class="mj-docs-slash-popover__header">
            <i class="fa-solid fa-terminal"></i>
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
              <i class="fa-solid fa-xmark"></i>
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
                  <i class="fa-solid" [ngClass]="cmd.Icon"></i>
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

      <!-- Durable Doc Link Autocomplete Dropdown (triggered by typing [[ in edit/suggest modes) -->
      <mj-mention-dropdown
        [Suggestions]="DocLinkSuggestions"
        [Visible]="ShowDocLinkMenu"
        [Position]="DocLinkMenuPosition"
        [UseFixedPositioning]="true"
        (SuggestionSelected)="OnDocLinkSuggestionSelected($event)"
        (Closed)="CloseDocLinkMenu()"
        data-testid="doc-link-autocomplete-dropdown"
      ></mj-mention-dropdown>

      <!-- Collaboration & Permission Status Banners (E1 & Low Retry State) -->
      @if (LiveSyncUnavailable) {
        <div
          class="mj-docs-status-banner mj-docs-status-banner--readonly"
          role="status"
          data-testid="docs-live-sync-unavailable-banner"
        >
          <span>
            <i class="fa-solid fa-plug-circle-xmark"></i>
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
            <i class="fa-solid fa-triangle-exclamation"></i>
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
      @if (PendingResetConflictDraft; as conflictDraft) {
        <div
          class="mj-docs-status-banner mj-docs-status-banner--warning"
          role="alert"
          data-testid="docs-reset-conflict-banner"
        >
          <span>
            <i class="fa-solid fa-code-merge"></i>
            Collaborative room reset detected at {{ conflictDraft.CapturedAt }}. Your unsent local edits are preserved — recover them or keep the server snapshot.
          </span>
          <div class="mj-docs-reset-conflict__actions">
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--primary"
              data-testid="apply-reset-conflict-btn"
              (click)="ApplyResetConflictDraft()"
            >
              Restore My Draft
            </button>
            <button
              type="button"
              class="mj-docs-btn"
              data-testid="dismiss-reset-conflict-btn"
              (click)="DismissResetConflictDraft()"
            >
              Keep Server Version
            </button>
          </div>
        </div>
      }

      <!-- Status Banner when Notification is Active -->
      @if (StatusBannerMessage) {
        <div class="mj-docs-status-banner" data-testid="docs-status-banner">
          <i class="fa-solid fa-circle-check"></i>
          <span>{{ StatusBannerMessage }}</span>
          <button type="button" class="mj-docs-btn" (click)="StatusBannerMessage = ''">Dismiss</button>
        </div>
      }

      <!-- .docx Import Fidelity Summary Banner -->
      @if (LastImportFidelityReport; as report) {
        <div class="mj-docs-import-fidelity-banner" data-testid="docs-import-fidelity-banner">
          <div class="mj-docs-import-fidelity-banner__main">
            <i class="fa-solid fa-file-word"></i>
            <div class="mj-docs-import-fidelity-banner__text">
              <strong>{{ report.SummaryText }}</strong>
              @if (report.Warnings.length > 0) {
                <div class="mj-docs-import-fidelity-banner__warnings">
                  @for (warn of report.Warnings; track warn.Code) {
                    <span class="mj-docs-badge" [attr.data-testid]="'import-warning-' + warn.Code">
                      <i class="fa-solid fa-circle-info"></i> {{ warn.Message }}
                    </span>
                  }
                </div>
              }
            </div>
          </div>
          <button
            type="button"
            class="mj-docs-btn"
            data-testid="dismiss-import-fidelity-btn"
            (click)="LastImportFidelityReport = null"
          >
            Dismiss
          </button>
        </div>
      }

      <!-- Document Design Preset & Page Setup Popover -->
      @if (!CompactMode && ShowDesignPopover) {
        <div
          class="mj-docs-design-popover"
          role="region"
          aria-label="Document Design & Page Setup"
          data-testid="docs-design-popover"
        >
          <div class="mj-docs-design-popover__header">
            <div>
              <strong><i class="fa-solid fa-palette"></i> Document Design &amp; Page Setup</strong>
              <span class="mj-docs-design-popover__subtitle">Applies identically to Canvas, Word (.docx), and PDF Print</span>
            </div>
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--icon"
              aria-label="Close design popover"
              data-testid="close-design-popover-btn"
              (click)="ShowDesignPopover = false"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="mj-docs-design-preset-grid" role="radiogroup" aria-label="Document Design Presets">
            @for (preset of AvailableDesignPresets; track preset.ID) {
              <button
                type="button"
                class="mj-docs-design-card"
                [class.mj-docs-design-card--active]="IsDesignPresetActive(preset.ID)"
                [attr.aria-pressed]="IsDesignPresetActive(preset.ID)"
                [attr.data-testid]="'doc-preset-card-' + preset.ID"
                [disabled]="!CanUserEdit"
                (click)="ApplyDesignPreset(preset.ID)"
              >
                <div class="mj-docs-design-card__top">
                  <span class="mj-docs-design-card__name">{{ preset.Name }}</span>
                  <span class="mj-docs-badge">{{ preset.Category }}</span>
                </div>
                <span class="mj-docs-design-card__desc">{{ preset.Description }}</span>
                <div class="mj-docs-design-card__meta">
                  <span>{{ preset.DefaultPageSize.toUpperCase() }}</span>
                  <span>·</span>
                  <span>{{ preset.BodyFontSizePt }}pt</span>
                  @if (preset.HeadingUnderline) {
                    <span>· Rule</span>
                  }
                </div>
              </button>
            }
          </div>

          <div class="mj-docs-design-controls">
            <div class="mj-docs-design-control-group">
              <span class="mj-docs-design-control-label">Canvas Layout</span>
              <div class="mj-docs-segmented">
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="PageLayoutMode === 'continuous'"
                  data-testid="layout-continuous-btn"
                  (click)="SetPageLayoutMode('continuous')"
                >
                  Continuous
                </button>
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="PageLayoutMode === 'paginated'"
                  data-testid="layout-paginated-btn"
                  (click)="SetPageLayoutMode('paginated')"
                >
                  Page View
                </button>
              </div>
            </div>

            <div class="mj-docs-design-control-group">
              <span class="mj-docs-design-control-label">Paper Size</span>
              <div class="mj-docs-segmented">
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ActiveDesignConfig.PageSize === 'letter'"
                  [disabled]="!CanUserEdit"
                  data-testid="paper-letter-btn"
                  (click)="UpdateDesignConfig({ PageSize: 'letter' })"
                >
                  Letter
                </button>
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ActiveDesignConfig.PageSize === 'a4'"
                  [disabled]="!CanUserEdit"
                  data-testid="paper-a4-btn"
                  (click)="UpdateDesignConfig({ PageSize: 'a4' })"
                >
                  A4
                </button>
              </div>
            </div>

            <div class="mj-docs-design-control-group">
              <span class="mj-docs-design-control-label">Orientation</span>
              <div class="mj-docs-segmented">
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ActiveDesignConfig.Orientation === 'portrait'"
                  [disabled]="!CanUserEdit"
                  data-testid="orientation-portrait-btn"
                  (click)="UpdateDesignConfig({ Orientation: 'portrait' })"
                >
                  Portrait
                </button>
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ActiveDesignConfig.Orientation === 'landscape'"
                  [disabled]="!CanUserEdit"
                  data-testid="orientation-landscape-btn"
                  (click)="UpdateDesignConfig({ Orientation: 'landscape' })"
                >
                  Landscape
                </button>
              </div>
            </div>

            @if (CanUserEdit) {
              <label class="mj-docs-design-control-group mj-docs-design-control-group--wide">
                <span class="mj-docs-design-control-label">Watermark</span>
                <input
                  type="text"
                  class="mj-docs-design-input"
                  placeholder="e.g. DRAFT, CONFIDENTIAL"
                  [ngModel]="ActiveDesignConfig.Watermark"
                  (change)="OnDesignWatermarkChange($event)"
                  data-testid="design-watermark-input"
                />
              </label>
              <label class="mj-docs-design-control-group mj-docs-design-control-group--wide">
                <span class="mj-docs-design-control-label">Running Header</span>
                <input
                  type="text"
                  class="mj-docs-design-input"
                  placeholder="Optional header shown in Page View &amp; exports"
                  [ngModel]="ActiveDesignConfig.RunningHeader"
                  (change)="OnDesignHeaderChange($event)"
                  data-testid="design-header-input"
                />
              </label>
            }
          </div>
        </div>
      }

      <!-- NW-1 Live-vs-Frozen Drift Governance Banner -->
      @let frozenBlocks = FrozenBlocksInDocument;
      @if (frozenBlocks.length > 0) {
        <div class="mj-docs-drift-banner" data-testid="docs-frozen-drift-banner">
          <div class="mj-docs-drift-banner__main">
            <i class="fa-solid fa-snowflake"></i>
            <span>
              <strong>{{ frozenBlocks.length }} Frozen Live {{ frozenBlocks.length === 1 ? 'Block' : 'Blocks' }}</strong>
            </span>
            @for (fb of frozenBlocks; track fb.BlockID) {
              @let isVerified = IsSnapshotVerified(fb);
              @let preVerified = GetBlockPreVerifiedSnapshot(fb);
              <span class="mj-docs-frozen-chip" [attr.data-testid]="'docs-frozen-chip-' + fb.BlockID">
                <i
                  class="fa-solid"
                  [class.fa-shield-halved]="isVerified"
                  [class.fa-triangle-exclamation]="!isVerified"
                  [title]="isVerified ? 'Snapshot verified' : 'Snapshot signature unverified'"
                ></i>
                <span>{{ fb.Title || fb.BlockID }}</span>
                @if (isVerified && (fb.FrozenSnapshot?.FrozenByUserName || fb.FrozenSnapshot?.FrozenByUserID || preVerified?.FrozenByUserName)) {
                  <span class="mj-docs-frozen-meta">
                    signed by {{ fb.FrozenSnapshot?.FrozenByUserName || preVerified?.FrozenByUserName || fb.FrozenSnapshot?.FrozenByUserID }}
                  </span>
                }
              </span>
            }
          </div>
          <div class="mj-docs-drift-banner__actions">
            <button
              type="button"
              class="mj-docs-btn"
              data-testid="docs-compare-frozen-live-btn"
              (click)="CompareAllFrozenBlocksWithLive()"
            >
              <i class="fa-solid fa-scale-balanced"></i> Compare with Live
            </button>
            @if (CanUserEdit) {
              <button
                type="button"
                class="mj-docs-btn"
                data-testid="docs-refreeze-all-btn"
                (click)="RefreezeAllFrozenBlocks()"
              >
                <i class="fa-solid fa-rotate"></i> Re-Freeze All
              </button>
              <button
                type="button"
                class="mj-docs-btn"
                data-testid="docs-switch-all-live-btn"
                (click)="SwitchAllFrozenBlocksToLive()"
              >
                <i class="fa-solid fa-bolt"></i> Switch All to Live
              </button>
            }
          </div>
        </div>
      }

      <!-- 3-Column Body: Left Outline Rail + Center Canvas + Right Comments Drawer -->
      <div class="mj-docs-body">
        <!-- Left Collapsible Table of Contents & Block Outline Rail -->
        @if (ShowOutlineRail && !CompactMode) {
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
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <span class="mj-docs-outline-stats" data-testid="docs-outline-stats">
                {{ WordStats.Words }} words · {{ EstimatedReadingMinutes }} min read · {{ WordStats.Lines }} lines
              </span>
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
                    [attr.data-outline-id]="item.ID"
                    (click)="SelectOutlineItem(item)"
                    (contextmenu)="OnDocsOutlineContextMenu($event, item)"
                  >
                    @if (item.Kind === 'heading') {
                      <i class="fa-solid fa-hashtag mj-docs-outline-icon"></i>
                      <span class="mj-docs-outline-title">{{ item.Title }}</span>
                    } @else {
                      <i class="fa-solid fa-cube mj-docs-outline-icon mj-docs-outline-icon--block"></i>
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
              <div><i class="fa-solid fa-bolt"></i> {{ WordStats.LiveBlocks }} Live MJ Blocks</div>
              <div><i class="fa-solid fa-chalkboard"></i> {{ WordStats.EmbeddedArtifacts }} Embedded Artifacts</div>
            </div>
          </aside>
        }

        <!-- Center Document Canvas -->
        <main class="mj-docs-canvas" #printableCanvas data-testid="docs-main-canvas">
          @if (ViewMode === 'source') {
            <!-- Raw Markdown Source Mode -->
            <div class="mj-docs-source-container" data-testid="docs-source-editor">
              @if (CanUserEdit && HasUneditableLockedSegments) {
                <div class="mj-docs-status-banner mj-docs-status-banner--warning" data-testid="docs-source-lock-notice">
                  <i class="fa-solid fa-lock"></i>
                  <span>Source editing is read-only because this document contains owner-locked sections. Use Write mode to edit unlocked sections.</span>
                </div>
              }
              <mj-code-editor
                [ngModel]="MarkdownContent"
                (ngModelChange)="OnSourceMarkdownChanged($event)"
                [language]="'markdown'"
                [readonly]="!CanUserEdit || HasUneditableLockedSegments"
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
                  <i class="fa-solid fa-arrow-right"></i>
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
                      <i class="fa-solid fa-rotate-left"></i> Restore Base Version
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
              [class.mj-docs-page--paginated]="PageLayoutMode === 'paginated'"
              [class.mj-docs-page--a4]="ActiveDesignConfig.PageSize === 'a4'"
              [class.mj-docs-page--landscape]="ActiveDesignConfig.Orientation === 'landscape'"
              [attr.data-doc-preset]="ActiveDesignConfig.PresetID"
              data-testid="docs-canvas-page"
            >
              @if (PageLayoutMode === 'paginated') {
                <div class="mj-docs-sheet-header" data-testid="docs-paginated-header">
                  <span class="mj-docs-sheet-header__title">
                    {{ ActiveDesignConfig.RunningHeader || getDisplayTitle() || 'Document' }}
                  </span>
                  <div class="mj-docs-sheet-header__right">
                    @if (ActiveDesignConfig.Watermark) {
                      <span class="mj-docs-sheet-watermark" data-testid="docs-paginated-watermark">
                        {{ ActiveDesignConfig.Watermark }}
                      </span>
                    }
                    <span class="mj-docs-sheet-meta">
                      {{ ActiveDesignPreset.Name }} · {{ ActiveDesignConfig.PageSize.toUpperCase() }}
                      {{ ActiveDesignConfig.Orientation === 'landscape' ? 'Landscape' : 'Portrait' }}
                    </span>
                  </div>
                </div>
              }
              @if (FrontmatterHeader; as fm) {
                <header
                  class="mj-docs-frontmatter-hero"
                  [style.--mj-docs-fm-accent]="fm.Accent || null"
                  data-testid="docs-frontmatter-hero"
                >
                  @if (fm.Category) {
                    <span class="mj-docs-fm-category">{{ fm.Category }}</span>
                  }
                  @if (fm.Title) {
                    <h1 class="mj-docs-fm-title">{{ fm.Title }}</h1>
                  }
                  @if (fm.Subtitle) {
                    <p class="mj-docs-fm-subtitle">{{ fm.Subtitle }}</p>
                  }
                  <div class="mj-docs-fm-meta">
                    @if (fm.Author) {
                      <span class="mj-docs-fm-meta-item">
                        <i class="fa-regular fa-user"></i> {{ fm.Author }}
                      </span>
                    }
                    @if (fm.Date) {
                      <span class="mj-docs-fm-meta-item">
                        <i class="fa-regular fa-calendar"></i> {{ fm.Date }}
                      </span>
                    }
                    <span class="mj-docs-fm-meta-item">
                      <i class="fa-regular fa-clock"></i> {{ EstimatedReadingMinutes }} min read
                    </span>
                    @for (tag of fm.Tags; track tag) {
                      <span class="mj-docs-fm-tag">#{{ tag }}</span>
                    }
                  </div>
                </header>
              }

              @if (ViewMode === 'suggest' && CanUserEdit) {
                <div class="mj-docs-suggest-banner" data-testid="docs-suggest-mode-banner">
                  <i class="fa-solid fa-code-pull-request"></i>
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
                      <i class="fa-solid fa-check-double"></i>
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
                @for (seg of VisibleDocumentSegments; track seg.SegmentID) {
                  <div
                    class="mj-docs-segment"
                    [class.mj-docs-segment--selected]="SelectedAnchorKey === seg.SegmentID && !IsSimpleNoteMode"
                    [class.mj-docs-segment--simple]="IsSimpleNoteMode"
                    [attr.data-segment-id]="seg.SegmentID"
                    [hidden]="IsSegmentHiddenByCollapsedHeading(seg)"
                    (focusin)="OnSegmentFocusIn(seg)"
                    (contextmenu)="OnDocsSegmentContextMenu($event, seg)"
                  >
                    @if (GetAgentForSegment(seg); as segAgent) {
                      <mj-artifact-agent-region-indicator
                        [Agent]="segAgent"
                        [Compact]="true"
                        (JumpToAgent)="JumpToAgentDocumentLocation($event)"
                      ></mj-artifact-agent-region-indicator>
                    }
                    @if (IsInteractiveCanvasMode && IsSimpleNoteMode) {
                      <button
                        type="button"
                        class="mj-docs-simple-plus-btn"
                        [disabled]="!CanEditSegment(seg)"
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
                          [disabled]="!CanEditSegment(seg)"
                          title="Move Block Up"
                          [attr.data-testid]="'move-up-btn-' + seg.SegmentID"
                          (click)="MoveSegment(seg, -1)"
                        >
                          <i class="fa-solid fa-arrow-up"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          [disabled]="!CanEditSegment(seg)"
                          title="Move Block Down"
                          [attr.data-testid]="'move-down-btn-' + seg.SegmentID"
                          (click)="MoveSegment(seg, 1)"
                        >
                          <i class="fa-solid fa-arrow-down"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          [disabled]="!CanEditSegment(seg)"
                          title="Insert Block Below (/)"
                          [attr.data-testid]="'insert-below-btn-' + seg.SegmentID"
                          (click)="OpenSlashMenuForSegment(seg)"
                        >
                          <i class="fa-solid fa-plus"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          [disabled]="!CanEditSegment(seg)"
                          title="Delete Block"
                          [attr.data-testid]="'delete-block-btn-' + seg.SegmentID"
                          (click)="DeleteSegment(seg)"
                        >
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      }
                      <button
                        type="button"
                        class="mj-docs-handle-btn"
                        title="Anchor Comment on this Block"
                        [attr.data-testid]="'anchor-comment-btn-' + seg.SegmentID"
                        (click)="OpenAnchorCommentForSegment(seg)"
                      >
                        <i class="fa-solid fa-comment-medical"></i>
                        @if (GetThreadCountForAnchor(seg.SegmentID) > 0) {
                          <span class="mj-docs-handle-count">{{ GetThreadCountForAnchor(seg.SegmentID) }}</span>
                        }
                      </button>
                      @if (CanUserEdit && seg.Kind === 'markdown') {
                        <button
                          type="button"
                          class="mj-docs-handle-btn"
                          [disabled]="!CanEditSegment(seg)"
                          [title]="CanEditSegment(seg) ? 'Propose Tracked Suggestion on Block' : 'Section locked by owner'"
                          [attr.data-testid]="'propose-suggestion-btn-' + seg.SegmentID"
                          (click)="OpenSuggestionModalForSegment(seg)"
                        >
                          <i class="fa-solid fa-lightbulb"></i>
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
                                    class="fa-solid"
                                    [ngClass]="IsHeadingCollapsed(seg) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                  ></i>
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-heading-level-pill"
                                  [hidden]="IsSimpleNoteMode"
                                  [disabled]="!CanEditSegment(seg)"
                                  title="Click to cycle heading level (H1–H4)"
                                  (click)="CycleHeadingLevel(seg)"
                                >
                                  H{{ seg.HeadingLevel || 1 }}
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-collapse-btn"
                                  [hidden]="IsSimpleNoteMode && !IsSegmentLocked(seg)"
                                  [title]="IsSegmentLocked(seg) ? 'Unlock section (currently protected)' : 'Lock section to owner-only'"
                                  [attr.data-testid]="'toggle-heading-lock-' + seg.SegmentID"
                                  (click)="ToggleHeadingLock(seg)"
                                >
                                  <i
                                    class="fa-solid"
                                    [ngClass]="IsSegmentLocked(seg) ? 'fa-lock' : 'fa-lock-open'"
                                  ></i>
                                </button>
                                <div
                                  class="mj-docs-editable-surface mj-docs-editable-heading__text"
                                  [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                  role="textbox"
                                  data-placeholder="Heading title (press Enter for paragraph below)…"
                                  [attr.data-testid]="'editable-heading-' + seg.SegmentID"
                                  [innerHTML]="RenderInlineEditableSafeHtml(seg.HeadingText ?? GetEditableHeadingText(seg))"
                                  (focus)="OnSegmentSurfaceFocus(seg)"
                                  (input)="OnEditableBlockInput(seg, $event)"
                                  (blur)="CommitEditableHeading(seg, $event)"
                                  (keydown)="OnEditableBlockKeydown(seg, $event)"
                                  (click)="OnDocRecordLinkClick($event)"
                                ></div>
                                @if (IsSegmentLocked(seg)) {
                                  <span
                                    class="mj-docs-badge"
                                    title="This section is protected by a document lock"
                                    [attr.data-testid]="'locked-section-badge-' + seg.SegmentID"
                                  >
                                    <i class="fa-solid fa-lock"></i> Locked
                                  </span>
                                }
                                @if (IsHeadingCollapsed(seg)) {
                                  <button
                                    type="button"
                                    class="mj-docs-collapsed-section-pill"
                                    (click)="ToggleHeadingCollapse(seg)"
                                  >
                                    <i class="fa-solid fa-layer-group"></i>
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
                                    <span><i class="fa-solid fa-table"></i> Interactive Table</span>
                                    <div class="mj-docs-editable-table__actions">
                                      <button
                                        type="button"
                                        class="mj-docs-btn"
                                        [disabled]="!CanEditSegment(seg)"
                                        [attr.data-testid]="'table-add-row-' + seg.SegmentID"
                                        (click)="AddTableRow(seg)"
                                      >
                                        <i class="fa-solid fa-plus"></i> Row
                                      </button>
                                      <button
                                        type="button"
                                        class="mj-docs-btn"
                                        [disabled]="!CanEditSegment(seg)"
                                        [attr.data-testid]="'table-add-col-' + seg.SegmentID"
                                        (click)="AddTableColumn(seg)"
                                      >
                                        <i class="fa-solid fa-plus"></i> Column
                                      </button>
                                    </div>
                                  </div>
                                  <table class="mj-docs-data-table mj-docs-editable-table">
                                    <thead>
                                      <tr>
                                        @for (hdr of table.Headers; track $index; let cIdx = $index) {
                                          <th
                                            [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                            [attr.data-testid]="'table-header-' + seg.SegmentID + '-' + cIdx"
                                            [style.text-align]="GetColumnTextAlign(table, cIdx)"
                                            [innerHTML]="RenderInlineEditableSafeHtml(hdr)"
                                            (focus)="OnTableCellFocus(seg, 0, cIdx, true)"
                                            (input)="OnEditableBlockDomDirty(seg)"
                                            (blur)="UpdateTableHeaderCell(seg, cIdx, $event)"
                                            (click)="OnDocRecordLinkClick($event)"
                                            (contextmenu)="OnDocsTableCellContextMenu($event, seg, 0, cIdx, true)"
                                          ></th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (row of table.Rows; track $index; let rIdx = $index) {
                                        <tr>
                                          @for (cell of row; track $index; let cIdx = $index) {
                                            <td
                                              [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                              [attr.data-testid]="'table-cell-' + seg.SegmentID + '-' + rIdx + '-' + cIdx"
                                              [style.text-align]="GetColumnTextAlign(table, cIdx)"
                                              [innerHTML]="RenderInlineEditableSafeHtml(cell)"
                                              (focus)="OnTableCellFocus(seg, rIdx, cIdx, false)"
                                              (input)="OnEditableBlockDomDirty(seg)"
                                              (blur)="UpdateTableBodyCell(seg, rIdx, cIdx, $event)"
                                              (click)="OnDocRecordLinkClick($event)"
                                              (contextmenu)="OnDocsTableCellContextMenu($event, seg, rIdx, cIdx, false)"
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
                                          [disabled]="!CanEditSegment(seg)"
                                          [attr.data-testid]="'task-checkbox-' + seg.SegmentID + '-' + item.Index"
                                          (change)="ToggleTaskListItem(seg, item.Index, $event)"
                                        />
                                      } @else {
                                        <span class="mj-docs-list-bullet">{{ item.OrderedPrefix || '•' }}</span>
                                      }
                                      <span
                                        class="mj-docs-editable-surface mj-docs-editable-list__text"
                                        [class.mj-docs-editable-list__text--checked]="item.Checked"
                                        [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                        role="textbox"
                                        data-placeholder="List item (press Enter for next, or Enter when empty to exit)…"
                                        [attr.data-testid]="'list-item-text-' + seg.SegmentID + '-' + item.Index"
                                        [attr.data-list-item-index]="item.Index"
                                        [innerHTML]="RenderInlineEditableSafeHtml(item.Text)"
                                        (focus)="OnListItemFocus(seg, item.Index)"
                                        (input)="OnEditableBlockInput(seg, $event)"
                                        (blur)="UpdateListItemText(seg, item.Index, $event)"
                                        (keydown)="OnListItemKeydown(seg, item.Index, $event)"
                                        (click)="OnDocRecordLinkClick($event)"
                                      ></span>
                                    </li>
                                  }
                                </ul>
                                <button
                                  type="button"
                                  class="mj-docs-btn mj-docs-list-add-btn"
                                  [hidden]="IsSimpleNoteMode"
                                  [disabled]="!CanEditSegment(seg)"
                                  (click)="AddListItem(seg)"
                                >
                                  <i class="fa-solid fa-plus"></i> Add Item
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
                                    <i class="fa-solid fa-circle-info"></i>
                                    <select
                                      [ngModel]="callout.CalloutType"
                                      [disabled]="!CanEditSegment(seg)"
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
                                    [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                    role="textbox"
                                    data-placeholder="Callout details (press Enter for paragraph below)…"
                                    [attr.data-testid]="'editable-callout-body-' + seg.SegmentID"
                                    [innerHTML]="RenderInlineEditableSafeHtml(callout.BodyText)"
                                    (focus)="OnSegmentSurfaceFocus(seg)"
                                    (input)="OnEditableBlockInput(seg, $event)"
                                    (blur)="CommitEditableCallout(seg, $event)"
                                    (keydown)="OnEditableBlockKeydown(seg, $event)"
                                    (click)="OnDocRecordLinkClick($event)"
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
                                    <span><i class="fa-solid fa-code"></i> Code Block</span>
                                    <input
                                      type="text"
                                      class="mj-docs-code-lang-input"
                                      [ngModel]="codeBlock.Language"
                                      [disabled]="!CanEditSegment(seg)"
                                      (ngModelChange)="UpdateCodeBlockLanguage(seg, $event)"
                                      placeholder="language"
                                    />
                                  </div>
                                  <pre
                                    class="mj-docs-editable-surface mj-docs-editable-code__pre"
                                    [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                    role="textbox"
                                    data-placeholder="Code snippet…"
                                    [attr.data-testid]="'editable-code-body-' + seg.SegmentID"
                                    [textContent]="codeBlock.Code"
                                    (focus)="OnSegmentSurfaceFocus(seg)"
                                    (input)="OnEditableBlockDomDirty(seg)"
                                    (blur)="CommitEditableCodeBlock(seg, $event)"
                                    (keydown)="OnEditableBlockKeydown(seg, $event)"
                                  ></pre>
                                </div>
                              }
                            }
                            @default {
                              <div
                                class="mj-docs-editable-surface mj-docs-editable-paragraph"
                                [attr.contenteditable]="CanEditSegment(seg) ? 'true' : 'false'"
                                role="textbox"
                                aria-multiline="true"
                                data-placeholder="Type text, '/' for commands, '#' for heading, or '-' for list…"
                                [attr.data-testid]="'editable-paragraph-' + seg.SegmentID"
                                [innerHTML]="RenderInlineEditableSafeHtml(seg.RawMarkdown)"
                                (focus)="OnSegmentSurfaceFocus(seg)"
                                (input)="OnEditableBlockInput(seg, $event)"
                                (blur)="CommitEditableParagraph(seg, $event)"
                                (keydown)="OnEditableBlockKeydown(seg, $event)"
                                (click)="OnDocRecordLinkClick($event)"
                              ></div>
                            }
                          }
                        } @else {
                          <!-- Reader Preview Markdown Block (Double-click to switch to Write mode when editable) -->
                          <div
                            class="markdown-preview"
                            [attr.title]="CanUserEdit ? 'Double-click to edit block (or click Write in toolbar)' : null"
                            (dblclick)="OnPreviewBlockDoubleClick(seg, $event)"
                            (click)="OnDocRecordLinkClick($event)"
                            (keydown.enter)="OnDocRecordLinkClick($event)"
                          >
                            <mj-markdown
                              [Data]="RenderPreviewMarkdown(seg.RawMarkdown)"
                              [EnableCollapsibleHeadings]="true"
                              [EnableLineNumbers]="false"
                              [EnableHighlight]="true"
                              [EnableSmartypants]="true"
                              [EnableCodeCopy]="true"
                              [EnableHeadingIds]="true"
                              [EnableHtml]="false"
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
                                  class="fa-solid"
                                  [ngClass]="IsBlockCollapsed(seg.Descriptor) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                ></i>
                              </button>
                              <i
                                class="fa-solid"
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
                                  <i class="fa-solid fa-arrow-up-from-bracket"></i>
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
                                  [disabled]="!CanEditSegment(seg)"
                                  title="Change Embedded Artifact or Display Settings"
                                  [attr.data-testid]="'configure-block-btn-' + seg.Descriptor.BlockID"
                                  (click)="OpenConfigureBlockModal(seg.Descriptor)"
                                >
                                  <i class="fa-solid fa-sliders"></i>
                                  <span>Configure</span>
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  [disabled]="!CanEditSegment(seg)"
                                  [class.mj-docs-btn--primary]="IsInlineEditingBlock(seg.Descriptor.BlockID)"
                                  [attr.data-testid]="'toggle-inline-ole-btn-' + seg.Descriptor.BlockID"
                                  (click)="ToggleInlineArtifactEdit(seg.Descriptor)"
                                >
                                  <i
                                    class="fa-solid"
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
                                  [disabled]="!CanEditSegment(seg)"
                                  title="Toggle Version Pin (Pinned vs. Track Latest)"
                                  [attr.data-testid]="'toggle-pin-ole-btn-' + seg.Descriptor.BlockID"
                                  (click)="TogglePinArtifactVersion(seg.Descriptor)"
                                >
                                  <i class="fa-solid fa-thumbtack"></i>
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
                                  class="fa-solid"
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
                                <i class="fa-solid fa-comment"></i>
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
                                [ArtifactTypeName]="GetEmbeddedArtifactTypeName(seg.Descriptor)"
                                [AncestorArtifactIDs]="EffectiveAncestorArtifactIDs"
                                [readonly]="!CanEditSegment(seg) || !IsInlineEditingBlock(seg.Descriptor.BlockID)"
                                (ContentCommitted)="OnEmbeddedArtifactContentCommitted(seg.Descriptor, $event)"
                              ></mj-artifact-type-plugin-viewer>
                            } @else {
                              <div
                                class="mj-docs-live-block__empty"
                                [attr.data-testid]="'ole-artifact-placeholder-' + seg.Descriptor.BlockID"
                              >
                                @if (IsEmbeddedArtifactLoading(seg.Descriptor)) {
                                  <i class="fa-solid fa-spinner fa-spin"></i> Loading embedded artifact…
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
                                  class="fa-solid"
                                  [ngClass]="IsBlockCollapsed(seg.Descriptor) ? 'fa-chevron-right' : 'fa-chevron-down'"
                                ></i>
                              </button>
                              <i class="fa-solid" [ngClass]="GetLiveBlockIcon(seg.Descriptor.Kind)"></i>
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
                                  [disabled]="!CanEditSegment(seg)"
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
                                  <i class="fa-solid fa-sliders"></i>
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
                                  <i class="fa-solid fa-arrows-rotate"></i> Refresh
                                </button>
                                @if (CanUserEdit) {
                                  <button
                                    type="button"
                                    class="mj-docs-btn"
                                    [disabled]="!CanEditSegment(seg)"
                                    title="Freeze Snapshot into Document"
                                    [attr.data-testid]="'freeze-block-btn-' + seg.Descriptor.BlockID"
                                    (click)="PromptFreezeBlock(seg.Descriptor)"
                                  >
                                    <i class="fa-solid fa-snowflake"></i> Freeze Snapshot
                                  </button>
                                }
                              } @else {
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  title="Compare this frozen snapshot with live viewer data"
                                  [attr.data-testid]="'compare-live-btn-' + seg.Descriptor.BlockID"
                                  (click)="CompareFrozenBlockWithLive(seg.Descriptor)"
                                >
                                  <i class="fa-solid fa-code-compare"></i>
                                  {{ OpenDriftPanelBlockID === seg.Descriptor.BlockID ? 'Hide Drift' : 'Compare with Live' }}
                                </button>
                                @if (CanUserEdit) {
                                  <button
                                    type="button"
                                    class="mj-docs-btn"
                                    [disabled]="!CanEditSegment(seg)"
                                    title="Restore Live Mode"
                                    [attr.data-testid]="'unfreeze-block-btn-' + seg.Descriptor.BlockID"
                                    (click)="UnfreezeLiveBlock(seg.Descriptor)"
                                  >
                                    <i class="fa-solid fa-bolt"></i> Switch to Live
                                  </button>
                                }
                              }
                            </div>
                          </div>

                          @if (seg.Descriptor.Mode === 'Frozen' && seg.Descriptor.FrozenSnapshot) {
                            @if (IsSnapshotVerified(seg.Descriptor)) {
                              @let preVerifiedSnap = GetBlockPreVerifiedSnapshot(seg.Descriptor);
                              <div class="mj-docs-live-block__provenance" data-testid="frozen-provenance-banner">
                                <i class="fa-solid fa-shield-halved"></i>
                                <span>
                                  Verified Snapshot captured at
                                  <strong>{{ seg.Descriptor.FrozenSnapshot.FrozenAt || preVerifiedSnap?.FrozenAt }}</strong>
                                  @if (
                                    seg.Descriptor.FrozenSnapshot.FrozenByUserName ||
                                    preVerifiedSnap?.FrozenByUserName ||
                                    seg.Descriptor.FrozenSnapshot.FrozenByUserID
                                  ) {
                                    by
                                    <strong>{{
                                      seg.Descriptor.FrozenSnapshot.FrozenByUserName ||
                                        preVerifiedSnap?.FrozenByUserName ||
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
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                <span>
                                  Unverified Snapshot — signature missing or invalid (captured at
                                  {{ seg.Descriptor.FrozenSnapshot.FrozenAt }})
                                </span>
                              </div>
                            }

                            @if (OpenDriftPanelBlockID === seg.Descriptor.BlockID) {
                              @if (GetFrozenDriftComparison(seg.Descriptor.BlockID); as drift) {
                                <div
                                  class="mj-docs-drift-panel"
                                  [attr.data-testid]="'frozen-drift-panel-' + seg.Descriptor.BlockID"
                                >
                                  <div class="mj-docs-drift-panel__header">
                                    <strong>
                                      <i class="fa-solid fa-code-compare"></i>
                                      Live vs. Frozen Comparison
                                    </strong>
                                    @if (drift.Loading) {
                                      <span class="mj-docs-picker-muted">
                                        <i class="fa-solid fa-spinner fa-spin"></i> Checking live query…
                                      </span>
                                    } @else if (drift.CheckedAt) {
                                      <span class="mj-docs-picker-muted">Checked {{ drift.CheckedAt }}</span>
                                    }
                                  </div>
                                  @if (drift.ErrorMessage) {
                                    <div class="mj-docs-live-block__error">
                                      <i class="fa-solid fa-triangle-exclamation"></i>
                                      <span>{{ drift.ErrorMessage }}</span>
                                    </div>
                                  } @else if (!drift.Loading) {
                                    <div class="mj-docs-drift-panel__summary" [attr.data-testid]="'drift-summary-' + seg.Descriptor.BlockID">
                                      <span class="mj-docs-badge mj-docs-badge--live">+{{ drift.AddedRows }} new rows</span>
                                      <span class="mj-docs-badge">-{{ drift.RemovedRows }} removed</span>
                                      <span class="mj-docs-badge mj-docs-badge--brand">{{ drift.ModifiedCells }} updated cells</span>
                                      <span class="mj-docs-badge">{{ drift.UnchangedRows }} unchanged</span>
                                    </div>
                                    @if (drift.SampleDiffs.length > 0) {
                                      <ul class="mj-docs-drift-panel__list">
                                        @for (item of drift.SampleDiffs; track $index) {
                                          <li>
                                            <span class="mj-docs-badge">{{ item.Kind }}</span>
                                            <strong>{{ item.RowLabel }}:</strong>
                                            <span>{{ item.Summary }}</span>
                                          </li>
                                        }
                                      </ul>
                                    } @else {
                                      <div class="mj-docs-picker-muted">Frozen snapshot matches current live rows cleanly.</div>
                                    }
                                    @if (CanUserEdit) {
                                      <div class="mj-docs-drift-panel__actions">
                                        <button
                                          type="button"
                                          class="mj-docs-btn mj-docs-btn--primary"
                                          [disabled]="!CanEditSegment(seg)"
                                          [attr.data-testid]="'refreeze-block-btn-' + seg.Descriptor.BlockID"
                                          (click)="RefreezeFrozenBlock(seg.Descriptor)"
                                        >
                                          <i class="fa-solid fa-snowflake"></i> Re-Freeze Snapshot
                                        </button>
                                        <button
                                          type="button"
                                          class="mj-docs-btn"
                                          [disabled]="!CanEditSegment(seg)"
                                          (click)="UnfreezeLiveBlock(seg.Descriptor)"
                                        >
                                          <i class="fa-solid fa-bolt"></i> Switch to Live
                                        </button>
                                      </div>
                                    }
                                  }
                                </div>
                              }
                            }
                          }

                          @if (GetBlockExecutionResult(seg.Descriptor); as execResult) {
                            @if (
                              execResult.StrippedServerSetParameters &&
                              execResult.StrippedServerSetParameters.length > 0
                            ) {
                              <div class="mj-docs-live-block__security-note" data-testid="block-security-note">
                                <i class="fa-solid fa-lock"></i>
                                <span>
                                  Stripped server-only params: {{ execResult.StrippedServerSetParameters.join(', ') }}
                                </span>
                              </div>
                            }

                            <div class="mj-docs-live-block__body" [hidden]="IsBlockCollapsed(seg.Descriptor)">
                              @if (!execResult.Success) {
                                <div class="mj-docs-live-block__error">
                                  <i class="fa-solid fa-triangle-exclamation"></i>
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
                                                  class="fa-solid fa-key mj-docs-col-hdr__icon"
                                                  title="Primary Key — click cell to open record"
                                                ></i>
                                              } @else if (col.IsForeignKey) {
                                                <i
                                                  class="fa-solid fa-link mj-docs-col-hdr__icon"
                                                  [title]="'Linked to ' + (col.TargetEntityName || 'related record') + ' — click cell to open'"
                                                ></i>
                                              }
                                            </span>
                                          </th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (row of GetPaginatedBlockRows(seg.Descriptor, execResult.Rows); track $index; let rIdx = $index) {
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
                                                  [attr.data-record-col]="col.Name"
                                                  [attr.data-record-row-idx]="rIdx"
                                                  (click)="OnBlockRecordCellClick(seg.Descriptor, col, row, $event)"
                                                >
                                                  <i
                                                    class="fa-solid"
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
                                      <i class="fa-solid fa-chevron-left"></i> Prev
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
                                      Next <i class="fa-solid fa-chevron-right"></i>
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
                          <div
                            class="mj-docs-suggestion-card"
                            [attr.data-testid]="'suggestion-card-' + sug.SuggestionID"
                            [attr.data-suggestion-id]="sug.SuggestionID"
                            (contextmenu)="OnDocsSuggestionContextMenu($event, sug)"
                          >
                            <div class="mj-docs-suggestion-card__header">
                              <span>
                                <i class="fa-solid fa-code-pull-request"></i>
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
                                          [disabled]="!CanEditSuggestionTarget(sug)"
                                          title="Accept only this word/phrase edit"
                                          [attr.data-testid]="'accept-hunk-btn-' + sug.SuggestionID + '-' + hunk.HunkID"
                                          (click)="AcceptSuggestionHunk(sug, hunk)"
                                        >
                                          <i class="fa-solid fa-check"></i>
                                        </button>
                                        <button
                                          type="button"
                                          class="mj-docs-btn mj-docs-btn--xs"
                                          [disabled]="!CanEditSuggestionTarget(sug)"
                                          title="Reject only this word/phrase edit"
                                          [attr.data-testid]="'reject-hunk-btn-' + sug.SuggestionID + '-' + hunk.HunkID"
                                          (click)="RejectSuggestionHunk(sug, hunk)"
                                        >
                                          <i class="fa-solid fa-xmark"></i>
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
                                  [disabled]="!CanEditSuggestionTarget(sug)"
                                  [attr.data-testid]="'accept-suggestion-btn-' + sug.SuggestionID"
                                  (click)="AcceptSuggestion(sug)"
                                >
                                  <i class="fa-solid fa-check"></i>
                                  {{ wordDiff.Hunks.length > 1 ? 'Accept All (' + wordDiff.Hunks.length + ')' : 'Accept' }}
                                </button>
                                <button
                                  type="button"
                                  class="mj-docs-btn"
                                  [disabled]="!CanEditSuggestionTarget(sug)"
                                  [attr.data-testid]="'reject-suggestion-btn-' + sug.SuggestionID"
                                  (click)="RejectSuggestion(sug)"
                                >
                                  <i class="fa-solid fa-xmark"></i>
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
                    <i class="fa-solid fa-plus"></i>
                    <span>Click or press Enter to continue writing, or type <kbd>/</kbd> for commands…</span>
                  </span>
                </div>
              }

              @if (PageLayoutMode === 'paginated') {
                <div class="mj-docs-sheet-footer" data-testid="docs-paginated-footer">
                  <span>{{ ActiveDesignConfig.RunningFooter || ActiveDesignPreset.Name }}</span>
                  @if (ActiveDesignConfig.ShowPageNumbers) {
                    <span>Page 1 of ~{{ LiveDocumentStats.EstimatedPages }}</span>
                  }
                </div>
              }
            </div>
          }
        </main>

        <!-- Right Collapsible Anchored DocBlock Comments & @mention Drawer -->
        @if (ShowCommentsDrawer) {
          <aside class="mj-docs-comments-drawer" data-testid="docs-comments-drawer">
            <div class="mj-docs-comments-drawer__header">
              <h4><i class="fa-solid fa-comments"></i> Anchored Comments</h4>
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
                <i class="fa-solid fa-anchor"></i>
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
                  [disabled]="IsPostingComment || !NewCommentText.trim()"
                  data-testid="post-anchored-comment-btn"
                  (click)="PostAnchoredComment()"
                >
                  <i class="fa-solid fa-paper-plane"></i> Post
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
                        <i class="fa-solid fa-crosshairs"></i> {{ thread.AnchorLabel }}
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
                      @for (msg of thread.Messages; track msg.DetailID + '::' + $index) {
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
                    <div class="mj-docs-thread-reply" [attr.data-testid]="'thread-reply-box-' + thread.ConversationID">
                      <input
                        type="text"
                        class="mj-docs-thread-reply__input"
                        placeholder="Reply in thread (use @Agent to mention)…"
                        [ngModel]="GetThreadReplyDraft(thread.ConversationID)"
                        (ngModelChange)="SetThreadReplyDraft(thread.ConversationID, $event)"
                        (keydown.enter)="ReplyToAnchoredThread(thread)"
                        [attr.data-testid]="'thread-reply-input-' + thread.ConversationID"
                      />
                      <button
                        type="button"
                        class="mj-docs-btn mj-docs-btn--xs mj-docs-btn--primary"
                        [disabled]="!GetThreadReplyDraft(thread.ConversationID).trim() || ReplyingThreadIds.has(thread.ConversationID)"
                        [attr.data-testid]="'thread-reply-submit-' + thread.ConversationID"
                        (click)="ReplyToAnchoredThread(thread)"
                      >
                        <i class="fa-solid fa-reply"></i> Reply
                      </button>
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
                <i class="fa-solid fa-triangle-exclamation"></i> Freeze Live MJ Data Snapshot?
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
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--primary"
                [disabled]="!FreezeWarningAcknowledged"
                data-testid="confirm-freeze-btn"
                (click)="ConfirmFreezeBlock()"
              >
                <i class="fa-solid fa-snowflake"></i> Confirm Freeze Snapshot
              </button>
              <button type="button" class="mj-docs-btn" (click)="CancelFreezeBlock()">Cancel</button>
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
                <i class="fa-solid fa-xmark"></i>
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
                    <i class="fa-solid fa-magnifying-glass mj-docs-picker-combobox__search-icon"></i>
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
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    }
                    <button
                      type="button"
                      class="mj-docs-picker-combobox__chevron"
                      title="Browse all entities"
                      (click)="ToggleEntityPickerDropdown()"
                      data-testid="toggle-entity-picker-btn"
                    >
                      <i class="fa-solid" [ngClass]="ShowEntityPickerDropdown ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
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
                                <i class="fa-solid fa-check mj-docs-picker-option__check"></i>
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
                      <span class="mj-docs-picker-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading views…</span>
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
                        <i class="fa-solid fa-table-columns"></i>
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
                        <i class="fa-solid fa-bookmark"></i>
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
                              <i class="fa-solid fa-table-list"></i>
                              <div class="mj-docs-saved-view-item__text">
                                <strong>{{ viewOpt.Name }}</strong>
                                @if (viewOpt.Description) {
                                  <span>{{ viewOpt.Description }}</span>
                                }
                              </div>
                              @if (IsSameUuid(NewBlockViewID, viewOpt.ID) || NewBlockViewName === viewOpt.Name) {
                                <i class="fa-solid fa-circle-check mj-docs-picker-option__check"></i>
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
                    <i class="fa-solid fa-magnifying-glass mj-docs-picker-combobox__search-icon"></i>
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
                          <i class="fa-solid fa-database"></i>
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
                          <i class="fa-solid fa-cube"></i>
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
                    [ngModel]="NewBlockArtifactID"
                    (ngModelChange)="OnNewBlockArtifactIdChanged($event)"
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
                        <i class="fa-solid fa-chart-column"></i> Chart
                      </button>
                      <button
                        type="button"
                        class="mj-docs-mode-btn"
                        [class.mj-docs-mode-btn--active]="NewBlockSheetMode === 'range'"
                        data-testid="sheet-embed-mode-range"
                        (click)="SetSheetEmbedMode('range')"
                      >
                        <i class="fa-solid fa-table-cells"></i> Cell Range
                      </button>
                      <button
                        type="button"
                        class="mj-docs-mode-btn"
                        [class.mj-docs-mode-btn--active]="NewBlockSheetMode === 'full'"
                        data-testid="sheet-embed-mode-full"
                        (click)="SetSheetEmbedMode('full')"
                      >
                        <i class="fa-solid fa-file-excel"></i> Full Workbook
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
                    <i class="fa-solid fa-sliders"></i>
                    Advanced Options (Filter, Pagination, Default Collapse)
                  </span>
                  <i class="fa-solid" [ngClass]="ShowAdvancedBlockOptions ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
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
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--primary"
                data-testid="confirm-insert-block-btn"
                (click)="ConfirmBlockInsertModal()"
              >
                {{ GetInsertConfirmButtonLabel() }}
              </button>
              <button type="button" class="mj-docs-btn" (click)="CancelBlockInsertModal()">Cancel</button>
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
                <h3 id="docs-permissions-modal-title"><i class="fa-solid fa-user-shield"></i> Share &amp; Document Access</h3>
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
                <i class="fa-solid fa-xmark"></i>
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
                    <i class="fa-solid fa-user-plus"></i> Share
                  </button>
                </div>
              }

              <div class="mj-docs-field">
                <span>People with Access ({{ ArtifactPermissionEntries.length }})</span>
                <div class="mj-docs-saved-view-list">
                  @for (perm of ArtifactPermissionEntries; track perm.ID) {
                    <div class="mj-docs-saved-view-item" [attr.data-testid]="'perm-entry-' + perm.UserID">
                      <i class="fa-solid" [ngClass]="perm.IsOwner ? 'fa-crown' : 'fa-user-check'"></i>
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
                          <i class="fa-solid fa-trash-can"></i>
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

      <!-- Compact Bottom Status Bar (Stats Cycler, Active Design Preset, Page View Toggle, Export Studio) -->
      @if (!CompactMode) {
        <footer class="mj-docs-status-footer" data-testid="docs-status-footer">
          <div class="mj-docs-status-footer__left">
            <button
              type="button"
              class="mj-docs-footer-pill"
              title="Click to cycle between words, characters, and characters without spaces"
              data-testid="docs-stats-cycle-btn"
              (click)="CycleStatsMetric()"
            >
              <i class="fa-regular fa-file-lines"></i>
              <span>{{ PrimaryStatsLabel }}</span>
            </button>
            <span class="mj-docs-footer-sep" aria-hidden="true">·</span>
            <span class="mj-docs-footer-meta" data-testid="docs-read-time-stat">
              ~{{ LiveDocumentStats.EstimatedReadMinutes }} min read
            </span>
            <span class="mj-docs-footer-sep" aria-hidden="true">·</span>
            <span class="mj-docs-footer-meta" data-testid="docs-est-pages-stat">
              ~{{ LiveDocumentStats.EstimatedPages }} {{ LiveDocumentStats.EstimatedPages === 1 ? 'page' : 'pages' }}
            </span>
          </div>
          <div class="mj-docs-status-footer__right">
            <button
              type="button"
              class="mj-docs-footer-pill"
              [class.mj-docs-footer-pill--active]="ShowDesignPopover"
              title="Document Design Preset &amp; Page Setup"
              data-testid="docs-footer-design-btn"
              (click)="ToggleDesignPopover()"
            >
              <i class="fa-solid fa-palette"></i>
              <span>{{ ActiveDesignPreset.Name }}</span>
              @if (ActiveDesignConfig.Watermark) {
                <span class="mj-docs-badge">{{ ActiveDesignConfig.Watermark }}</span>
              }
            </button>
            <button
              type="button"
              class="mj-docs-footer-pill"
              [class.mj-docs-footer-pill--active]="PageLayoutMode === 'paginated'"
              title="Toggle between Continuous and Paginated Sheet View"
              data-testid="docs-footer-layout-btn"
              (click)="TogglePageLayoutMode()"
            >
              <i class="fa-solid" [ngClass]="PageLayoutMode === 'paginated' ? 'fa-file-lines' : 'fa-align-left'"></i>
              <span>{{ PageLayoutMode === 'paginated' ? 'Page View' : 'Continuous' }}</span>
            </button>
            <button
              type="button"
              class="mj-docs-footer-pill"
              title="Open Export &amp; Preflight Studio (.docx, PDF, Markdown)"
              data-testid="docs-footer-export-btn"
              (click)="OpenExportDialog('docx')"
            >
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
              <span>Export</span>
            </button>
          </div>
        </footer>
      }

      <!-- Native <dialog> Export & Preflight Studio (Clean vs. Markup, .docx Round-Trip & Strict Preflight) -->
      <dialog
        #exportDialog
        class="mj-docs-native-dialog"
        closedby="any"
        aria-labelledby="docs-export-dialog-title"
        data-testid="docs-export-dialog"
        (close)="OnExportDialogClosed()"
      >
        <div class="mj-docs-modal mj-docs-modal--export">
          <div class="mj-docs-modal__header">
            <h1 id="docs-export-dialog-title" class="mj-docs-dialog-h1">
              <i class="fa-solid fa-arrow-up-from-bracket"></i> Export &amp; Preflight
            </h1>
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--icon"
              aria-label="Close export dialog"
              data-testid="close-export-dialog-btn"
              (click)="CloseExportDialog()"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="mj-docs-modal__body">
            <div class="mj-docs-export-row">
              <span class="mj-docs-design-control-label">Export Format</span>
              <div class="mj-docs-segmented">
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ExportDialogFormat === 'docx'"
                  data-testid="export-format-docx-btn"
                  (click)="SetExportDialogFormat('docx')"
                >
                  <i class="fa-solid fa-file-word"></i> Word (.docx)
                </button>
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ExportDialogFormat === 'pdf'"
                  data-testid="export-format-pdf-btn"
                  (click)="SetExportDialogFormat('pdf')"
                >
                  <i class="fa-solid fa-file-pdf"></i> Print / PDF
                </button>
                <button
                  type="button"
                  class="mj-docs-segmented__btn"
                  [class.mj-docs-segmented__btn--active]="ExportDialogFormat === 'md'"
                  data-testid="export-format-md-btn"
                  (click)="SetExportDialogFormat('md')"
                >
                  <i class="fa-solid fa-file-code"></i> Markdown (.md)
                </button>
              </div>
            </div>

            @if (ExportDialogFormat !== 'md') {
              <div class="mj-docs-export-row">
                <span class="mj-docs-design-control-label">Review Markup</span>
                <div class="mj-docs-segmented">
                  <button
                    type="button"
                    class="mj-docs-segmented__btn"
                    [class.mj-docs-segmented__btn--active]="ExportDialogMode === 'clean'"
                    data-testid="export-mode-clean-btn"
                    (click)="SetExportDialogMode('clean')"
                  >
                    Clean Final
                  </button>
                  <button
                    type="button"
                    class="mj-docs-segmented__btn"
                    [class.mj-docs-segmented__btn--active]="ExportDialogMode === 'markup'"
                    data-testid="export-mode-markup-btn"
                    (click)="SetExportDialogMode('markup')"
                  >
                    With Markup ({{ PendingSuggestionsCount }} redlines, {{ OpenThreadsCount }} comments)
                  </button>
                </div>
              </div>

              <div class="mj-docs-export-grid-2">
                <div class="mj-docs-export-row">
                  <span class="mj-docs-design-control-label">Paper Size</span>
                  <div class="mj-docs-segmented">
                    <button
                      type="button"
                      class="mj-docs-segmented__btn"
                      [class.mj-docs-segmented__btn--active]="ExportDialogPageSize === 'letter'"
                      data-testid="export-size-letter-btn"
                      (click)="ExportDialogPageSize = 'letter'; RefreshExportPreflight()"
                    >
                      Letter
                    </button>
                    <button
                      type="button"
                      class="mj-docs-segmented__btn"
                      [class.mj-docs-segmented__btn--active]="ExportDialogPageSize === 'a4'"
                      data-testid="export-size-a4-btn"
                      (click)="ExportDialogPageSize = 'a4'; RefreshExportPreflight()"
                    >
                      A4
                    </button>
                  </div>
                </div>
                <div class="mj-docs-export-row">
                  <span class="mj-docs-design-control-label">Orientation</span>
                  <div class="mj-docs-segmented">
                    <button
                      type="button"
                      class="mj-docs-segmented__btn"
                      [class.mj-docs-segmented__btn--active]="ExportDialogOrientation === 'portrait'"
                      data-testid="export-orient-portrait-btn"
                      (click)="ExportDialogOrientation = 'portrait'; RefreshExportPreflight()"
                    >
                      Portrait
                    </button>
                    <button
                      type="button"
                      class="mj-docs-segmented__btn"
                      [class.mj-docs-segmented__btn--active]="ExportDialogOrientation === 'landscape'"
                      data-testid="export-orient-landscape-btn"
                      (click)="ExportDialogOrientation = 'landscape'; RefreshExportPreflight()"
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>

              <div class="mj-docs-export-checks">
                @if (ExportDialogFormat === 'docx') {
                  <label class="mj-docs-modal__checkbox">
                    <input
                      type="checkbox"
                      [(ngModel)]="ExportEmbedLiveMetadata"
                      data-testid="export-embed-metadata-checkbox"
                    />
                    <span>Embed live <code>:::mj-block</code> &amp; preset metadata for lossless Word round-trip</span>
                  </label>
                }
                <label class="mj-docs-modal__checkbox">
                  <input
                    type="checkbox"
                    [(ngModel)]="ExportStrictPreflight"
                    (ngModelChange)="RefreshExportPreflight()"
                    data-testid="export-strict-preflight-checkbox"
                  />
                  <span>Strict preflight — refuse export if broken images or malformed blocks exist</span>
                </label>
              </div>
            }

            @if (ExportPreflightReport; as preflight) {
              <div
                class="mj-docs-preflight-panel"
                [class.mj-docs-preflight-panel--passed]="preflight.ErrorCount === 0 && preflight.WarningCount === 0"
                [class.mj-docs-preflight-panel--error]="preflight.ErrorCount > 0"
                data-testid="docs-export-preflight-panel"
              >
                <div class="mj-docs-preflight-panel__header">
                  <strong>
                    <i
                      class="fa-solid"
                      [ngClass]="
                        preflight.ErrorCount > 0
                          ? 'fa-circle-exclamation'
                          : preflight.WarningCount > 0
                            ? 'fa-triangle-exclamation'
                            : 'fa-circle-check'
                      "
                    ></i>
                    Preflight:
                    {{
                      preflight.ErrorCount > 0
                        ? preflight.ErrorCount + ' error(s), ' + preflight.WarningCount + ' warning(s)'
                        : preflight.WarningCount > 0
                          ? 'Ready with ' + preflight.WarningCount + ' warning(s)'
                          : 'All checks passed'
                    }}
                  </strong>
                  <span class="mj-docs-footer-meta">
                    {{ preflight.Stats.WordCount }} words · ~{{ preflight.Stats.EstimatedPages }} pp · {{ ActiveDesignPreset.Name }}
                  </span>
                </div>

                @if (preflight.Issues.length > 0) {
                  <ul class="mj-docs-preflight-list">
                    @for (issue of preflight.Issues; track issue.Code + '::' + $index) {
                      <li
                        class="mj-docs-preflight-item"
                        [attr.data-severity]="issue.Severity"
                        [attr.data-testid]="'preflight-issue-' + issue.Code"
                      >
                        <span class="mj-docs-preflight-item__msg">{{ issue.Message }}</span>
                        @if (issue.Code === 'wide_table_portrait' && ExportDialogOrientation === 'portrait') {
                          <button
                            type="button"
                            class="mj-docs-btn mj-docs-btn--xs"
                            data-testid="preflight-fix-landscape-btn"
                            (click)="ExportDialogOrientation = 'landscape'; RefreshExportPreflight()"
                          >
                            Switch to Landscape
                          </button>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </div>

          <div class="mj-docs-modal__footer">
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--primary"
              autofocus
              [disabled]="IsRunningExport || (ExportStrictPreflight && (ExportPreflightReport?.ErrorCount ?? 0) > 0)"
              data-testid="docs-export-confirm-btn"
              (click)="ConfirmExportFromDialog()"
            >
              <i class="fa-solid fa-download"></i>
              {{
                IsRunningExport
                  ? 'Exporting…'
                  : ExportDialogFormat === 'docx'
                    ? 'Download Word (.docx)'
                    : ExportDialogFormat === 'pdf'
                      ? 'Print / Save PDF'
                      : 'Download Markdown (.md)'
              }}
            </button>
            <button
              type="button"
              class="mj-docs-btn"
              data-testid="cancel-export-dialog-btn"
              (click)="CloseExportDialog()"
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>

      <mj-context-menu
        [IsOpen]="ContextMenuOpen"
        [AnchorX]="ContextMenuX"
        [AnchorY]="ContextMenuY"
        [Items]="ContextMenuItems"
        [AriaLabel]="ContextMenuAriaLabel"
        [RestoreFocusElement]="ContextMenuRestoreFocusEl"
        (ItemSelected)="OnDocsContextMenuCommand($event)"
        (Closed)="CloseDocsContextMenu()"
      ></mj-context-menu>

      <mj-artifact-command-palette
        [Open]="ShowCommandPalette"
        Title="Document Commands"
        Placeholder="Search outline, blocks, suggest mode, diff, export..."
        [Commands]="DocsCommandPaletteItems"
        (Execute)="ExecuteDocsPaletteCommand($event)"
        (Closed)="ShowCommandPalette = false"
      ></mj-artifact-command-palette>
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
        flex-wrap: nowrap;
        gap: 6px;
        min-height: 40px;
        padding: 4px 10px;
        background: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .mj-docs-toolbar::-webkit-scrollbar {
        display: none;
      }

      .mj-docs-toolbar__left,
      .mj-docs-toolbar__right {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 5px;
        flex-shrink: 0;
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

      .mj-docs-saved-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--mj-status-success);
        display: inline-block;
      }

      .mj-docs-btn--ai {
        background: color-mix(in srgb, var(--mj-text-violet) 10%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-text-violet) 28%, transparent);
        color: var(--mj-text-violet);
      }

      .mj-docs-cmdk-btn {
        padding: 4px 7px;
        background: var(--mj-bg-surface-sunken);
      }

      .mj-docs-kbd-tag {
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-muted);
      }

      .mj-docs-presence-pill--compact {
        padding: 4px 7px;
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

      .mj-docs-drift-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 6px 14px;
        font-size: 12px;
        background: color-mix(in srgb, var(--mj-status-info) 12%, var(--mj-bg-surface));
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-primary);
      }

      .mj-docs-drift-banner__main {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .mj-docs-frozen-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        font-size: 11px;
      }

      .mj-docs-frozen-meta {
        color: var(--mj-text-secondary);
      }

      .mj-docs-drift-banner__actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
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

      /* Targeted modern typography wrapping (balanced headings, orphan-free prose) */
      .mj-docs-page h1,
      .mj-docs-page h2,
      .mj-docs-page h3,
      .mj-docs-page h4 {
        text-wrap: balance;
      }
      .mj-docs-page p,
      .mj-docs-page li,
      .mj-docs-page blockquote {
        text-wrap: pretty;
      }

      /* Document Design Preset canvas styling (pure --mj-* design tokens) */
      .mj-docs-page[data-doc-preset='executive-memo'] h1,
      .mj-docs-page[data-doc-preset='executive-memo'] h2,
      .mj-docs-page[data-doc-preset='executive-memo'] .mj-docs-h1,
      .mj-docs-page[data-doc-preset='executive-memo'] .mj-docs-h2 {
        font-family: Georgia, 'Times New Roman', serif;
        border-bottom: 1.5px solid var(--mj-brand-primary);
        padding-bottom: 4px;
      }
      .mj-docs-page[data-doc-preset='technical-spec'] {
        font-size: 13.5px;
        line-height: 1.52;
      }
      .mj-docs-page[data-doc-preset='technical-spec'] h1,
      .mj-docs-page[data-doc-preset='technical-spec'] h2,
      .mj-docs-page[data-doc-preset='technical-spec'] .mj-docs-h1,
      .mj-docs-page[data-doc-preset='technical-spec'] .mj-docs-h2 {
        border-bottom: 1px solid var(--mj-border-strong);
        padding-bottom: 3px;
        letter-spacing: -0.015em;
      }
      .mj-docs-page[data-doc-preset='client-proposal'] h1,
      .mj-docs-page[data-doc-preset='client-proposal'] h2,
      .mj-docs-page[data-doc-preset='client-proposal'] .mj-docs-h1,
      .mj-docs-page[data-doc-preset='client-proposal'] .mj-docs-h2 {
        color: var(--mj-brand-primary);
        border-bottom: 2px solid var(--mj-brand-primary);
        padding-bottom: 5px;
      }
      .mj-docs-page[data-doc-preset='editorial'] {
        font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
        line-height: 1.75;
      }

      /* Paginated Sheet View */
      .mj-docs-page--paginated {
        max-width: 816px;
        min-height: 980px;
        padding: 40px 56px;
        border-radius: 4px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        display: flex;
        flex-direction: column;
      }
      .mj-docs-page--paginated.mj-docs-page--a4 {
        max-width: 794px;
      }
      .mj-docs-page--paginated.mj-docs-page--landscape {
        max-width: 1056px;
        min-height: 760px;
      }
      .mj-docs-sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding-bottom: 10px;
        margin-bottom: 18px;
        border-bottom: 1px solid var(--mj-border-subtle);
        font-size: 11px;
        color: var(--mj-text-muted);
      }
      .mj-docs-sheet-header__title {
        font-weight: 600;
        color: var(--mj-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-docs-sheet-header__right {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .mj-docs-sheet-watermark {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: var(--mj-bg-surface-card);
      }
      .mj-docs-sheet-meta {
        font-size: 11px;
        color: var(--mj-text-muted);
      }
      .mj-docs-sheet-footer {
        margin-top: auto;
        padding-top: 16px;
        border-top: 1px solid var(--mj-border-subtle);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      /* Import Fidelity Banner */
      .mj-docs-import-fidelity-banner {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 8px 14px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        font-size: 12px;
        color: var(--mj-text-primary);
      }
      .mj-docs-import-fidelity-banner__main {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
      }
      .mj-docs-import-fidelity-banner__main > i {
        color: var(--mj-brand-primary);
        margin-top: 2px;
      }
      .mj-docs-import-fidelity-banner__text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mj-docs-import-fidelity-banner__warnings {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      /* Document Design & Page Setup Popover */
      .mj-docs-design-popover {
        padding: 12px 16px;
        background: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 25;
      }
      .mj-docs-design-popover__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .mj-docs-design-popover__header > div {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .mj-docs-design-popover__subtitle {
        font-size: 11.5px;
        color: var(--mj-text-muted);
      }
      .mj-docs-design-preset-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 8px;
      }
      .mj-docs-design-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 9px 11px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-primary);
        text-align: left;
        cursor: pointer;
        transition: border-color 0.12s ease, background 0.12s ease;
      }
      .mj-docs-design-card:hover:not(:disabled) {
        border-color: var(--mj-brand-primary);
        background: var(--mj-bg-surface-hover);
      }
      .mj-docs-design-card--active {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 1px var(--mj-brand-primary);
      }
      .mj-docs-design-card__top {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .mj-docs-design-card__name {
        font-size: 12.5px;
        font-weight: 600;
      }
      .mj-docs-design-card__desc {
        font-size: 11px;
        color: var(--mj-text-secondary);
        line-height: 1.35;
      }
      .mj-docs-design-card__meta {
        display: flex;
        gap: 5px;
        font-size: 10.5px;
        color: var(--mj-text-muted);
        margin-top: 2px;
      }
      .mj-docs-design-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 14px;
      }
      .mj-docs-design-control-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mj-docs-design-control-group--wide {
        min-width: 180px;
        flex: 1 1 180px;
      }
      .mj-docs-design-control-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }
      .mj-docs-design-input {
        height: 28px;
        padding: 0 8px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-primary);
        font-size: 12px;
      }
      .mj-docs-segmented {
        display: inline-flex;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        overflow: hidden;
        background: var(--mj-bg-surface-sunken);
      }
      .mj-docs-segmented__btn {
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 11.5px;
        font-weight: 500;
        padding: 4px 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .mj-docs-segmented__btn--active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
      }

      /* Compact Bottom Status Footer Bar */
      .mj-docs-status-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        min-height: 28px;
        padding: 2px 12px;
        background: var(--mj-bg-surface);
        border-top: 1px solid var(--mj-border-default);
        font-size: 11.5px;
        color: var(--mj-text-muted);
        flex-shrink: 0;
      }
      .mj-docs-status-footer__left,
      .mj-docs-status-footer__right {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .mj-docs-footer-sep {
        color: var(--mj-border-strong);
      }
      .mj-docs-footer-meta {
        font-size: 11px;
        color: var(--mj-text-muted);
        white-space: nowrap;
      }
      .mj-docs-footer-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 7px;
        border-radius: 5px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }
      .mj-docs-footer-pill:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      .mj-docs-footer-pill--active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        background: var(--mj-bg-surface-card);
      }

      /* Native <dialog> Export & Preflight Studio (modern-web-guidance compliant) */
      dialog.mj-docs-native-dialog {
        padding: 0;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: var(--mj-text-primary);
        max-width: min(560px, calc(100vw - 32px));
        width: fit-content;
        box-shadow: none;
        overflow: visible;
      }
      dialog.mj-docs-native-dialog:modal {
        overscroll-behavior: contain;
      }
      dialog.mj-docs-native-dialog::backdrop {
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        overflow: hidden;
        overscroll-behavior: contain;
      }
      .mj-docs-modal--export {
        width: min(560px, calc(100vw - 32px));
        max-width: 100%;
        margin: 0;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
      }
      .mj-docs-modal--export .mj-docs-modal__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .mj-docs-modal--export .mj-docs-modal__footer {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 8px;
      }
      .mj-docs-dialog-h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .mj-docs-export-row {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 12px;
      }
      .mj-docs-export-grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .mj-docs-export-checks {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .mj-docs-preflight-panel {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 10px 12px;
        background: var(--mj-bg-surface-card);
        font-size: 12px;
      }
      .mj-docs-preflight-panel--passed {
        border-color: var(--mj-status-success);
      }
      .mj-docs-preflight-panel--error {
        border-color: var(--mj-status-error);
      }
      .mj-docs-preflight-panel__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .mj-docs-preflight-list {
        margin: 8px 0 0;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .mj-docs-preflight-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        color: var(--mj-text-secondary);
      }
      .mj-docs-preflight-item[data-severity='error'] {
        color: var(--mj-status-error);
      }
      .mj-docs-preflight-item[data-severity='warning'] {
        color: var(--mj-status-warning);
      }

      .mj-docs-frontmatter-hero {
        border-left: 4px solid var(--mj-docs-fm-accent, var(--mj-brand-primary));
        padding: 12px 18px;
        margin-bottom: 20px;
        background: var(--mj-bg-surface-card);
        border-radius: 0 10px 10px 0;
        border-top: 1px solid var(--mj-border-subtle);
        border-right: 1px solid var(--mj-border-subtle);
        border-bottom: 1px solid var(--mj-border-subtle);
      }
      .mj-docs-fm-category {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--mj-docs-fm-accent, var(--mj-brand-primary));
        margin-bottom: 4px;
      }
      .mj-docs-fm-title {
        margin: 0 0 6px;
        font-size: 24px;
        font-weight: 800;
        color: var(--mj-text-primary);
      }
      .mj-docs-fm-subtitle {
        margin: 0 0 10px;
        font-size: 14px;
        color: var(--mj-text-secondary);
      }
      .mj-docs-fm-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--mj-text-muted);
      }
      .mj-docs-fm-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .mj-docs-fm-tag {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
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
        top: 44px;
        right: 10px;
        z-index: 200;
        width: 276px;
        max-height: min(70vh, calc(100% - 56px));
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

      :host ::ng-deep .mj-doc-link-chip,
      :host ::ng-deep a[href^="#mj-doc-link-readable/"],
      :host ::ng-deep a[href^="#mj-doc-link-unreadable/"] {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 7px;
        margin: 0 2px;
        border-radius: 999px;
        font-size: 0.9em;
        font-weight: 500;
        line-height: 1.45;
        vertical-align: baseline;
        text-decoration: none;
        border: 1px solid var(--mj-border-subtle);
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }

      :host ::ng-deep .mj-doc-link-chip i {
        font-size: 0.8em;
      }

      :host ::ng-deep .mj-doc-link-chip--readable,
      :host ::ng-deep a[href^="#mj-doc-link-readable/"] {
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-brand-primary) 28%, var(--mj-border-default));
        cursor: pointer;
      }

      :host ::ng-deep .mj-doc-link-chip--readable:hover,
      :host ::ng-deep a[href^="#mj-doc-link-readable/"]:hover {
        background: color-mix(in srgb, var(--mj-brand-primary) 18%, var(--mj-bg-surface));
        border-color: var(--mj-brand-primary);
        text-decoration: none;
      }

      :host ::ng-deep .mj-doc-link-chip--readable:focus-visible,
      :host ::ng-deep a[href^="#mj-doc-link-readable/"]:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      }

      :host ::ng-deep .mj-doc-link-chip--unreadable,
      :host ::ng-deep a[href^="#mj-doc-link-unreadable/"] {
        color: var(--mj-text-disabled);
        background: var(--mj-bg-surface-sunken);
        border-color: var(--mj-border-subtle);
        cursor: not-allowed;
        user-select: none;
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

      .mj-docs-reset-conflict__actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .mj-docs-drift-panel {
        margin: 8px 12px;
        padding: 10px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        background: var(--mj-bg-surface-card);
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
      }

      .mj-docs-drift-panel__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .mj-docs-drift-panel__summary,
      .mj-docs-drift-panel__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .mj-docs-drift-panel__list {
        margin: 0;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mj-docs-thread-reply {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--mj-border-subtle);
      }

      .mj-docs-thread-reply__input {
        flex: 1;
        min-width: 0;
        padding: 5px 8px;
        font-size: 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'MarkdownArtifactViewerPlugin')
export class MarkdownArtifactViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, DoCheck, OnDestroy
{
  @ViewChild('fileImportInput') public FileImportInput?: ElementRef<HTMLInputElement>;
  @ViewChild('printableCanvas') public PrintableCanvas?: ElementRef<HTMLElement>;
  @ViewChild('moreMenuWrap') public MoreMenuWrap?: ElementRef<HTMLElement>;
  @ViewChild('moreMenuPanel') public MoreMenuPanel?: ElementRef<HTMLElement>;
  @ViewChild('exportDialog') public ExportDialogRef?: ElementRef<HTMLDialogElement>;

  /**
   * Emitted when a user clicks a primary key, record name, or foreign key link inside an embedded Live View or Query block.
   * Picked up by `ArtifactTypePluginViewerComponent` and bubbled up to MJ Explorer to open the target entity record.
   */
  @Output() public OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
  @Output() public ToolbarPinChanged = new EventEmitter<{ Key: DocsToolbarItemKey; Pinned: boolean }>();
  @Output() public DraftContentChanged = new EventEmitter<string>();
  /** @deprecated Use {@link OpenEntityRecord}. */
  @Output() public openEntityRecord = this.OpenEntityRecord;

  /** When true, hides the left outline rail and secondary studio toolbars for compact embedded editing. */
  @Input() public CompactMode = false;

  public readonly IsAiAssistantEnabled = ARTIFACT_AI_ASSISTANT_ENABLED;

  private _collaborationWsUrl: string | null = null;

  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input()
  public get CollaborationWsUrl(): string | null {
    return this._collaborationWsUrl;
  }
  public set CollaborationWsUrl(value: string | null) {
    if (value !== this._collaborationWsUrl) {
      this._collaborationWsUrl = value;
      if (this.isInitialized) {
        this.setupCollaborationSession();
      }
    }
  }

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
  private readonly ngZone = inject(NgZone, { optional: true });
  private readonly injectedAncestorArtifactIDs = inject(MJ_EMBEDDED_ARTIFACT_ANCESTORS, {
    optional: true,
    skipSelf: true,
  });

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
  public ShowDesignPopover = false;
  public PageLayoutMode: DocsPageLayoutMode = 'continuous';
  public StatsMetricMode: DocsStatsMetricMode = 'words';
  public LastImportFidelityReport: DocxImportFidelityReport | null = null;
  public readonly AvailableDesignPresets: readonly DocumentDesignPreset[] = DOCUMENT_DESIGN_PRESETS;

  // Export & Preflight Native <dialog> State
  public ExportDialogFormat: 'docx' | 'pdf' | 'md' = 'docx';
  public ExportDialogMode: DocExportMode = 'clean';
  public ExportDialogPageSize: DocumentPageSize = 'letter';
  public ExportDialogOrientation: DocumentPageOrientation = 'portrait';
  public ExportEmbedLiveMetadata = true;
  public ExportStrictPreflight = false;
  public ExportPreflightReport: DocumentExportPreflightReport | null = null;
  public IsRunningExport = false;
  private exportDialogFallbackBound = false;

  public FormattingRibbonPinned = false;
  public readonly MaxPinnedToolbarActions = 4;
  public ShowCommandPalette = false;
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

  // Durable Doc Link (`[[`) Autocomplete & Chip Access State
  public ShowDocLinkMenu = false;
  public DocLinkSuggestions: MentionSuggestion[] = [];
  public DocLinkMenuPosition: { top: number; left: number } = { top: 0, left: 0 };
  private readonly domSanitizer = inject(DomSanitizer, { optional: true });
  private readonly docLinkTriggerProvider = new ArtifactLinkTriggerProvider();
  private readonly docLinkAccessCache = new Map<string, DocRecordLinkAccessState>();
  private readonly docLinkAccessPending = new Set<string>();
  private readonly docLinkAccessQueue = new Map<string, ParsedDocRecordLink>();
  private readonly docLinksByKeySignature = new Map<string, ParsedDocRecordLink>();
  private readonly editableSafeHtmlCache = new Map<string, SafeHtml>();
  private docLinkAccessFlushScheduled = false;
  private docLinkAccessEpoch = 0;
  private activeDocLinkSegmentID: string | null = null;
  private activeDocLinkQuery = '';
  private activeDocLinkElement: HTMLElement | null = null;
  private docLinkSearchSeq = 0;
  public ExpandedOleBlockID: string | null = null;
  public StatusBannerMessage = '';
  public IsSavingVersion = false;
  private draftSegmentCounter = 0;
  private isApplyingBlockTransaction = false;

  // Context Menu State
  public ContextMenuOpen = false;
  public ContextMenuX = 0;
  public ContextMenuY = 0;
  public ContextMenuItems: ContextMenuItem<DocsContextMenuCommand>[] = [];
  public ContextMenuAriaLabel = 'Document context menu';
  public ContextMenuRestoreFocusEl: HTMLElement | null = null;
  private contextMenuSelectionSnapshot: DocsSelectionSnapshot | null = null;
  private contextMenuSelectionText = '';
  private readonly touchMenuMonitor = new TouchContextMenuMonitor({
    OnLongPress: (trigger) => this.onTouchLongPressContextMenu(trigger),
  });

  // Parsed state
  public DocumentSegments: DocumentRenderSegment[] = [];
  private frontmatterEndLine = 0;
  private visibleSegmentsCache: {
    source: DocumentRenderSegment[];
    frontmatterEndLine: number;
    result: DocumentRenderSegment[];
  } | null = null;
  public OutlineItems: DocumentOutlineItem[] = [];
  public WordStats = { Words: 0, Characters: 0, Lines: 0, LiveBlocks: 0, EmbeddedArtifacts: 0 };
  public FrontmatterHeader: DocumentFrontmatterHeader | null = null;

  /**
   * Returns `true` when a parsed segment belongs strictly inside leading YAML frontmatter (`--- ... ---`),
   * which drives Design Presets & metadata but should not render as raw prose on the canvas or in prints.
   */
  public IsYamlFrontmatterSegment(seg: DocumentRenderSegment): boolean {
    return (
      this.frontmatterEndLine > 0 &&
      seg.Kind === 'markdown' &&
      seg.EndLine <= this.frontmatterEndLine
    );
  }

  /**
   * Canvas-visible segments (excluding leading YAML frontmatter metadata lines while keeping
   * `DocumentSegments` complete for line-accurate editing and Source mode).
   */
  public get VisibleDocumentSegments(): DocumentRenderSegment[] {
    if (
      this.visibleSegmentsCache &&
      this.visibleSegmentsCache.source === this.DocumentSegments &&
      this.visibleSegmentsCache.frontmatterEndLine === this.frontmatterEndLine
    ) {
      return this.visibleSegmentsCache.result;
    }
    const result =
      this.frontmatterEndLine > 0
        ? this.DocumentSegments.filter((seg) => !this.IsYamlFrontmatterSegment(seg))
        : this.DocumentSegments;
    this.visibleSegmentsCache = {
      source: this.DocumentSegments,
      frontmatterEndLine: this.frontmatterEndLine,
      result,
    };
    return result;
  }

  public get EstimatedReadingMinutes(): number {
    return Math.max(1, Math.ceil((this.WordStats.Words || 0) / 200));
  }

  // Real-time Yjs session state
  private session: DocumentCollaborationSession | null = null;
  private liveSyncUnavailable = false;
  private sessionSubs: Subscription[] = [];
  private permissionUnsub: (() => void) | null = null;
  private sessionInitGeneration = 0;
  private isComponentDestroyed = false;
  private isCurrentUserArtifactOwner = false;
  private artifactOwnerUserId: string | null = null;
  private unlistenTouchPointerListeners: Array<() => void> = [];
  public CollaborationStatus: CollaborationConnectionStatus = 'local';
  public Collaborators: CollaboratorPresence[] = [];

  public get HumanCollaborators(): CollaboratorPresence[] {
    return this.Collaborators.filter((c) => c.IsAgent !== true);
  }

  public GetAgentForSegment(seg: DocumentRenderSegment): CollaboratorPresence | null {
    for (const peer of this.Collaborators) {
      if (peer.IsAgent !== true || peer.AgentPhase === 'exit') {
        continue;
      }
      const loc = peer.AgentLocation;
      if (!loc) {
        if (peer.ActiveBlockID && peer.ActiveBlockID === seg.SegmentID) {
          return peer;
        }
        continue;
      }
      if (loc.BlockID && (loc.BlockID === seg.SegmentID || loc.BlockID === seg.Descriptor?.BlockID)) {
        return peer;
      }
      if (
        loc.SectionHeading &&
        seg.HeadingText &&
        seg.HeadingText.trim().toLowerCase() === loc.SectionHeading.trim().toLowerCase()
      ) {
        return peer;
      }
      if (
        typeof loc.StartLine === 'number' &&
        loc.StartLine > 0 &&
        seg.StartLine <= (loc.EndLine ?? loc.StartLine) &&
        seg.EndLine >= loc.StartLine
      ) {
        return peer;
      }
    }
    return null;
  }

  public JumpToAgentDocumentLocation(agent: CollaboratorPresence): void {
    const match = this.DocumentSegments.find((seg) => this.GetAgentForSegment(seg) === agent)
      ?? this.DocumentSegments.find((seg) => {
        const loc = agent.AgentLocation;
        return Boolean(
          (loc?.BlockID && (loc.BlockID === seg.SegmentID || loc.BlockID === seg.Descriptor?.BlockID)) ||
          (loc?.SectionHeading &&
            seg.HeadingText &&
            seg.HeadingText.trim().toLowerCase() === loc.SectionHeading.trim().toLowerCase()),
        );
      });
    if (match) {
      this.SelectedAnchorKey = match.SegmentID;
      this.scrollToSegmentElement(match);
      this.cdr.markForCheck();
    }
  }

  private scrollToSegmentElement(seg: DocumentRenderSegment): void {
    this.expandCollapsedHeadingsForSegment(seg);
    const root = this.PrintableCanvas?.nativeElement ?? this.hostElement?.nativeElement ?? null;
    if (!root) {
      return;
    }
    const selector = `[data-segment-id="${this.escapeCssSelectorValue(seg.SegmentID)}"]`;
    const tryScroll = (): boolean => {
      const el = root.querySelector<HTMLElement>(selector);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return Boolean(el);
    };
    if (!tryScroll() && typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        if (this.isComponentDestroyed) {
          return;
        }
        tryScroll();
      });
    }
  }

  private expandCollapsedHeadingsForSegment(seg: DocumentRenderSegment): void {
    if (this.collapsedHeadingIds.size === 0) {
      return;
    }
    const targetIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (targetIdx <= 0) {
      return;
    }
    const ancestorHeadings: Array<{ id: string; level: number }> = [];
    for (let i = 0; i < targetIdx; i++) {
      const candidate = this.DocumentSegments[i];
      if (candidate.Kind === 'markdown' && candidate.BlockKind === 'heading') {
        const level = candidate.HeadingLevel ?? 1;
        while (ancestorHeadings.length > 0 && ancestorHeadings[ancestorHeadings.length - 1].level >= level) {
          ancestorHeadings.pop();
        }
        ancestorHeadings.push({ id: candidate.SegmentID, level });
      }
    }
    const targetLevel =
      seg.Kind === 'markdown' && seg.BlockKind === 'heading' ? (seg.HeadingLevel ?? 1) : Number.POSITIVE_INFINITY;
    let expandedAny = false;
    for (const anc of ancestorHeadings) {
      if (anc.level < targetLevel && this.collapsedHeadingIds.delete(anc.id)) {
        expandedAny = true;
      }
    }
    if (expandedAny) {
      this.persistCollapsedStateToUserSettings();
      this.cdr.markForCheck();
    }
  }

  private escapeCssSelectorValue(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, '\\$&');
  }

  private isSafeLinkUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.startsWith('#')) {
      return true;
    }
    try {
      const parsed = new URL(trimmed, 'https://localhost');
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
    } catch {
      return false;
    }
  }
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
  private embeddedArtifactTypes = new Map<string, string>();
  private inFlightEmbeddedVersionKeys = new Set<string>();
  private failedEmbeddedVersionMessages = new Map<string, string>();
  private inlineEditingBlockIds = new Set<string>();
  private frozenBlockDriftMap = new Map<string, FrozenBlockDriftComparison>();
  public OpenDriftPanelBlockID: string | null = null;
  private hasUncommittedDomInput = false;
  private pendingSocketSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  public PendingResetConflictDraft: CollaborationResetConflictDraft | null = null;
  public IsPostingComment = false;
  private threadReplyDrafts = new Map<string, string>();
  public ReplyingThreadIds = new Set<string>();
  private isApplyingRemoteSuggestions = false;
  private nextLocalIdSeq = 0;
  private isInitialized = false;
  private lastCheckedArtifactVersion: MJArtifactVersionEntity | undefined = undefined;
  private lastCheckedReadonly: boolean | undefined = undefined;

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
    this.lastCheckedArtifactVersion = this.artifactVersion;
    this.lastCheckedReadonly = this.readonly;
    this.isInitialized = true;
    this.initializeDocument();
    this.attachTouchPointerListenersOutsideZone();
  }

  public ngDoCheck(): void {
    if (!this.isInitialized || this.isComponentDestroyed) {
      return;
    }
    if (this.artifactVersion !== this.lastCheckedArtifactVersion) {
      this.lastCheckedArtifactVersion = this.artifactVersion;
      this.initializeDocument();
    }
    if (this.readonly !== this.lastCheckedReadonly) {
      this.lastCheckedReadonly = this.readonly;
      this.handleReadonlyInputChanged();
    }
  }

  private handleReadonlyInputChanged(): void {
    if (this.readonly && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
      this.FlushPendingEdits();
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

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    this.docLinkSearchSeq++;
    this.docLinkAccessEpoch++;
    this.docLinkAccessCache.clear();
    this.docLinkAccessPending.clear();
    this.docLinkAccessQueue.clear();
    this.docLinksByKeySignature.clear();
    this.editableSafeHtmlCache.clear();
    this.docLinkAccessFlushScheduled = false;
    this.clearPendingSocketSaveTimeout();
    this.detachTouchPointerListeners();
    this.touchMenuMonitor.Destroy();
    this.stopMoreMenuDocumentListeners();
    this.destroyCollaborationSession();
  }

  private attachTouchPointerListenersOutsideZone(): void {
    this.detachTouchPointerListeners();
    const targetEl =
      this.hostElement?.nativeElement?.querySelector<HTMLElement>('[data-testid="mj-docs-workspace"]') ??
      this.hostElement?.nativeElement;
    if (!targetEl || typeof targetEl.addEventListener !== 'function') {
      return;
    }
    const register = (): void => {
      const asPointerEvent = (event: Event): PointerEvent | null => {
        if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) {
          return event;
        }
        return 'pointerId' in event || 'clientX' in event ? (event as PointerEvent) : null;
      };
      const onDown = (event: Event): void => {
        const pe = asPointerEvent(event);
        if (pe) {
          this.OnDocsPointerDown(pe);
        }
      };
      const onMove = (event: Event): void => {
        const pe = asPointerEvent(event);
        if (pe) {
          this.OnDocsPointerMove(pe);
        }
      };
      const onUp = (event: Event): void => {
        const pe = asPointerEvent(event);
        if (pe) {
          this.OnDocsPointerUp(pe);
        }
      };
      const onCancel = (event: Event): void => {
        const pe = asPointerEvent(event);
        if (pe) {
          this.OnDocsPointerCancel(pe);
        }
      };
      const onClickCapture = (event: Event): void => {
        this.OnDocsClickCapture(event);
      };
      targetEl.addEventListener('pointerdown', onDown, { passive: true });
      targetEl.addEventListener('pointermove', onMove, { passive: true });
      targetEl.addEventListener('pointerup', onUp, { passive: true });
      targetEl.addEventListener('pointercancel', onCancel, { passive: true });
      targetEl.addEventListener('click', onClickCapture, { capture: true });
      this.unlistenTouchPointerListeners = [
        () => targetEl.removeEventListener('pointerdown', onDown),
        () => targetEl.removeEventListener('pointermove', onMove),
        () => targetEl.removeEventListener('pointerup', onUp),
        () => targetEl.removeEventListener('pointercancel', onCancel),
        () => targetEl.removeEventListener('click', onClickCapture, { capture: true }),
      ];
    };
    if (this.ngZone) {
      this.ngZone.runOutsideAngular(register);
    } else {
      register();
    }
  }

  private detachTouchPointerListeners(): void {
    for (const unlisten of this.unlistenTouchPointerListeners) {
      unlisten();
    }
    this.unlistenTouchPointerListeners = [];
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    this.FlushPendingEdits();
    return CreateMarkdownSnapshot(this.MarkdownContent || this.getRawContent(), this.getDisplayTitle());
  }

  public override async ExportPDF(
    orientation: PdfOrientation = 'portrait',
    exportMode: DocExportMode = 'clean',
    designOverride?: Partial<DocumentDesignConfig>,
  ): Promise<void> {
    this.FlushPendingEdits();
    const designConfig: DocumentDesignConfig = {
      ...this.ActiveDesignConfig,
      Orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
      ...(designOverride ?? {}),
    };
    const html = this.renderDocumentPrintableHtml(exportMode, designConfig);
    this.importExportService.ExportPrintablePdf(
      html,
      this.getDisplayTitle() || 'Document',
      designConfig.Orientation,
      {
        DesignConfig: designConfig,
        ExportMode: exportMode,
        MarkdownSource: this.MarkdownContent,
      },
    );
  }

  /** Word and Markdown, then the PDF entries. */
  public override GetExportOptions(): ArtifactExportOption[] {
    return [
      { Key: 'docx', Label: 'Word (.docx)', Icon: 'fa-solid fa-file-word', Description: 'Opens in Word' },
      { Key: 'md', Label: 'Markdown (.md)', Icon: 'fa-brands fa-markdown', Description: 'Plain text with formatting marks' },
      ...super.GetExportOptions(),
    ];
  }

  public override async RunExport(key: string): Promise<void> {
    if (key === 'docx') {
      return this.OnExportDocx();
    }
    if (key === 'md') {
      this.OnExportMarkdown();
      return;
    }
    return super.RunExport(key);
  }

  /**
   * Flushes any uncommitted DOM input from focused `contenteditable` blocks into `MarkdownContent`
   * (or into pending suggestions in Suggest Mode) before saving, switching modes, exporting, or merging remote Yjs updates (`P0-20`).
   */
  public FlushPendingEdits(): boolean {
    if (!this.CanUserEdit || !this.hasUncommittedDomInput) {
      this.hasUncommittedDomInput = false;
      return false;
    }
    if (this.ViewMode === 'edit') {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      this.syncDirtySegmentsFromDomIntoBlocks(blocks);
      const changed = blocks.some((b, i) => b !== this.DocumentSegments[i]?.RawMarkdown);
      this.hasUncommittedDomInput = false;
      if (changed) {
        const nextMd = blocks.filter((b) => b.trim().length > 0).join('\n\n');
        this.OnMarkdownChanged(nextMd);
      }
      return changed;
    }
    if (this.ViewMode === 'suggest') {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      this.syncDirtySegmentsFromDomIntoBlocks(blocks);
      let proposedAny = false;
      for (let i = 0; i < this.DocumentSegments.length; i++) {
        const seg = this.DocumentSegments[i];
        if (blocks[i] !== seg.RawMarkdown && this.CanEditSegment(seg)) {
          this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, blocks[i], 'Suggested edit');
          proposedAny = true;
        }
      }
      this.hasUncommittedDomInput = false;
      return proposedAny;
    }
    this.hasUncommittedDomInput = false;
    return false;
  }

  public OnEditableBlockDomDirty(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    this.hasUncommittedDomInput = true;
    this.emitLiveDraftContentFromDom();
  }

  private emitLiveDraftContentFromDom(): void {
    if (!this.CanUserEdit || this.ViewMode !== 'edit') {
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const liveMarkdown =
      blocks.length > 0 ? blocks.filter((b) => b.trim().length > 0).join('\n\n') : this.MarkdownContent;
    this.DraftContentChanged.emit(liveMarkdown);
  }

  /**
   * Maps host-synchronized {@link ArtifactViewerViewMode} (`NW-6`) onto Docs modes, falling back
   * gracefully to `'preview'` when `'edit'` / `'suggest'` is requested without edit permission.
   */
  protected override onViewerViewModeChanged(mode: ArtifactViewerViewMode): void {
    switch (mode) {
      case 'edit':
        this.SetViewMode(this.CanUserEdit ? 'edit' : 'preview', false);
        break;
      case 'suggest':
        this.SetViewMode(this.CanUserEdit ? 'suggest' : 'preview', false);
        break;
      case 'diff':
        this.SetViewMode('diff', false);
        break;
      case 'present':
        this.SetViewMode('preview', false);
        break;
    }
  }

  /**
   * Focuses and scrolls to a target block or heading when {@link NavigationAnchor} updates (`NW-6`).
   */
  protected override onNavigationAnchorChanged(anchor: ArtifactNavigationAnchor): void {
    if (anchor.BlockID) {
      const targetSeg = this.DocumentSegments.find(
        (s) =>
          UUIDsEqual(s.Descriptor?.BlockID, anchor.BlockID) ||
          UUIDsEqual(s.SegmentID, anchor.BlockID),
      );
      if (targetSeg) {
        this.FocusSegmentByAnchorKey(targetSeg.SegmentID);
        return;
      }
      this.FocusSegmentByAnchorKey(anchor.BlockID);
      return;
    }
    if (anchor.Heading) {
      const normalized = anchor.Heading.trim().toLowerCase();
      const outlineMatch = this.OutlineItems.find(
        (item) => item.Title.trim().toLowerCase() === normalized,
      );
      if (outlineMatch) {
        this.SelectOutlineItem(outlineMatch);
        return;
      }
      const segMatch = this.DocumentSegments.find(
        (s) => (s.HeadingText ?? '').trim().toLowerCase() === normalized,
      );
      if (segMatch) {
        this.FocusSegmentByAnchorKey(segMatch.SegmentID);
      }
    }
  }

  /**
   * Refreshes view when server-verified snapshot provenance map changes (`NW-1`).
   */
  protected override onPreVerifiedFrozenSnapshotsChanged(): void {
    this.cdr.markForCheck();
  }

  /**
   * Switches between `edit`, `suggest`, `preview`, `source`, and `diff` modes.
   */
  public SetViewMode(mode: DocsViewerMode, markUserExplicit = true): void {
    if ((mode === 'edit' || mode === 'suggest') && !this.CanUserEdit) {
      return;
    }
    if (mode !== this.ViewMode && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
      this.FlushPendingEdits();
    }
    if (markUserExplicit) {
      this.userExplicitlySelectedMode = true;
    }
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
  public OnPreviewBlockDoubleClick(seg: DocumentRenderSegment, event?: Event): void {
    if (
      typeof Element !== 'undefined' &&
      event?.target instanceof Element &&
      (event.target.closest('[data-doc-record-link="true"]') ||
        event.target.closest(`a[href^="${DOC_LINK_PREVIEW_HREF_READABLE}"], a[href^="${DOC_LINK_PREVIEW_HREF_UNREADABLE}"]`))
    ) {
      return;
    }
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
    this.session?.SetActiveBlock(seg.SegmentID);
  }

  public OnSegmentSurfaceFocus(seg: DocumentRenderSegment): void {
    if (this.lastFocusedSegmentId && this.lastFocusedSegmentId !== seg.SegmentID) {
      this.session?.StopUndoCapture();
    }
    this.lastFocusedSegmentId = seg.SegmentID;
    this.SelectedAnchorKey = seg.SegmentID;
    this.session?.SetActiveBlock(seg.SegmentID);
    this.lastFocusedListItemIndex = null;
    this.lastFocusedTableCell = null;
    this.CaptureSelectionSnapshot();
    this.SelectionChanged.emit({
      domain: 'document',
      blockId: seg.Descriptor?.BlockID ?? seg.SegmentID,
      heading: seg.HeadingText,
    });
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
    this.session?.SetActiveBlock(seg.SegmentID);
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
    this.session?.SetActiveBlock(seg.SegmentID);
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
    if (!this.CanEditSegment(seg)) {
      if (this.CanUserEdit) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.ViewMode === 'suggest') {
      const nextMd = seg.RawMarkdown.trim().length > 0 ? `${seg.RawMarkdown}\n\nNew paragraph` : 'New paragraph';
      this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, nextMd, 'Insert paragraph below');
      this.StatusBannerMessage = 'Queued tracked suggestion to insert paragraph below.';
      this.cdr.markForCheck();
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const insertIdx = idx >= 0 ? idx + 1 : blocks.length;
    blocks.splice(insertIdx, 0, '');
    this.applyBlockFlowTransaction(blocks, { segmentIndex: insertIdx, position: 'start' });
  }

  public InsertSectionHeadingBelow(level = 2): void {
    if (!this.CanUserEdit) {
      return;
    }
    const targetIdx = this.resolveActiveSegmentIndex();
    const targetSeg = targetIdx >= 0 ? this.DocumentSegments[targetIdx] : undefined;
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const headingMd = `${'#'.repeat(Math.max(1, Math.min(4, level)))} `;
    if (
      targetIdx >= 0 &&
      targetSeg?.Kind === 'markdown' &&
      (targetSeg?.BlockKind === 'paragraph' ||
        !targetSeg?.BlockKind) &&
      blocks[targetIdx]?.trim().length === 0
    ) {
      if (!this.enforceSegmentLock(targetSeg, 'insert section heading')) {
        return;
      }
      blocks[targetIdx] = headingMd;
      this.applyBlockFlowTransaction(blocks, { segmentIndex: targetIdx, position: 'end' });
      return;
    }
    if (targetSeg && !this.enforceSegmentLock(targetSeg, 'insert section heading inside locked section')) {
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

  public MoreMenuTopPx = 44;
  public MoreMenuRightPx = 10;

  public ToggleMoreToolsMenu(event?: Event): void {
    event?.stopPropagation();
    this.ShowMoreToolsMenu = !this.ShowMoreToolsMenu;
    if (this.ShowMoreToolsMenu) {
      const btnEl = this.MoreMenuWrap?.nativeElement;
      const wsEl = btnEl?.closest('.mj-docs-workspace') as HTMLElement | null;
      const btnRect = btnEl?.getBoundingClientRect();
      const wsRect = wsEl?.getBoundingClientRect();
      if (btnRect && wsRect && btnRect.height > 0 && wsRect.width > 0) {
        this.MoreMenuTopPx = Math.max(36, Math.round(btnRect.bottom - wsRect.top + 6));
        this.MoreMenuRightPx = Math.max(8, Math.round(wsRect.right - btnRect.right));
      } else {
        this.MoreMenuTopPx = 44;
        this.MoreMenuRightPx = 10;
      }
    }
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
   * Returns the provider-scoped `UserInfoEngine` when available, or falls back safely to `UserInfoEngine.Instance`.
   */
  private resolveUserInfoEngine(): UserInfoEngine | null {
    try {
      const provider = this.getSafeProvider();
      if (provider) {
        return (UserInfoEngine.GetProviderInstance<UserInfoEngine>(provider, UserInfoEngine) as UserInfoEngine) ?? null;
      }
      return UserInfoEngine.Instance ?? null;
    } catch {
      return null;
    }
  }

  private resolveArtifactMetadataEngine(): ArtifactMetadataEngine {
    const provider = this.getSafeProvider();
    return provider
      ? (ArtifactMetadataEngine.GetProviderInstance<ArtifactMetadataEngine>(provider, ArtifactMetadataEngine) as ArtifactMetadataEngine)
      : ArtifactMetadataEngine.Instance;
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

    const parsed = SafeJSONParse<string[]>(raw, false);
    if (Array.isArray(parsed)) {
      const stringItems = parsed.filter((entry): entry is string => typeof entry === 'string');
      const normalized = this.normalizeToolbarPins(stringItems);
      this._serverToolbarPinsRaw = raw;
      this._localToolbarPins = null;
      this._toolbarPinsRaw = raw;
      this._toolbarPinsParsed = [...normalized];
      return [...normalized];
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
            PageLayoutMode: parsed.PageLayoutMode === 'paginated' ? 'paginated' : 'continuous',
            StatsMetric:
              parsed.StatsMetric === 'chars' || parsed.StatsMetric === 'charsNoSpaces'
                ? parsed.StatsMetric
                : 'words',
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
      PageLayoutMode: patch.PageLayoutMode ?? current.PageLayoutMode ?? 'continuous',
      StatsMetric: patch.StatsMetric ?? current.StatsMetric ?? 'words',
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
    this.PageLayoutMode = vis.PageLayoutMode === 'paginated' ? 'paginated' : 'continuous';
    this.StatsMetricMode =
      vis.StatsMetric === 'chars' || vis.StatsMetric === 'charsNoSpaces' ? vis.StatsMetric : 'words';
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
        Key: 'design-preset',
        Label: this.ActiveDesignPreset.Name,
        MenuLabel: 'Document Design & Page Setup',
        Description: 'Choose typography preset, paper size, watermark & running headers',
        Icon: 'fa-palette',
        Placement: 'left',
        Category: 'view',
        Order: 55,
        Visible: true,
        Active: this.ShowDesignPopover,
        StatusTag: this.ActiveDesignPreset.Name,
        TestId: 'docs-design-trigger-btn',
        MenuTestId: 'menu-docs-design-trigger-btn',
      },
      {
        Key: 'page-layout',
        Label: this.PageLayoutMode === 'paginated' ? 'Page View' : 'Continuous',
        MenuLabel: 'Paginated Sheet View',
        Description: 'Toggle Letter/A4 paginated page layout with running header and footer',
        Icon: 'fa-file-lines',
        Placement: 'left',
        Category: 'view',
        Order: 58,
        Visible: true,
        Active: this.PageLayoutMode === 'paginated',
        StatusTag: this.PageLayoutMode === 'paginated' ? 'Pages' : 'Scroll',
        TestId: 'docs-page-layout-btn',
        MenuTestId: 'menu-docs-page-layout-btn',
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
        Key: 'export-studio',
        Label: 'Export…',
        MenuLabel: 'Export & Preflight Studio…',
        Description: 'Configure Clean vs. Markup redlines, preflight checks & .docx / PDF export',
        Icon: 'fa-arrow-up-from-bracket',
        Placement: 'right',
        Category: 'io',
        Order: 105,
        Visible: true,
        Active: false,
        TestId: 'open-export-studio-btn',
        MenuTestId: 'menu-open-export-studio-btn',
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
        Key: 'ask-ai',
        Label: 'Ask AI',
        MenuLabel: 'Ask AI Assistant',
        Description: 'Open slide-in AI Assistant for this section (/ai)',
        Icon: 'fa-wand-magic-sparkles',
        Placement: 'right',
        Category: 'writing',
        Order: 25,
        Visible: ARTIFACT_AI_ASSISTANT_ENABLED && canEdit,
        Active: false,
        Accent: true,
        TestId: 'docs-ask-ai-btn',
        MenuTestId: 'menu-docs-ask-ai-btn',
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
      case 'design-preset':
        this.ToggleDesignPopover();
        break;
      case 'page-layout':
        this.TogglePageLayoutMode();
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
      case 'export-studio':
        this.OpenExportDialog('docx');
        break;
      case 'export-docx':
        this.OpenExportDialog('docx');
        break;
      case 'export-md':
        this.OnExportMarkdown();
        break;
      case 'copy-md':
        this.OnCopy();
        break;
      case 'ask-ai':
        this.OpenAskAiAssistant();
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
      const panelEl = this.MoreMenuPanel?.nativeElement;
      const target = evt.target as Node | null;
      if (target && ((wrapEl && wrapEl.contains(target)) || (panelEl && panelEl.contains(target)))) {
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
    if (!this.CanEditSegment(seg)) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const text = el?.textContent ?? '';
    const trimmed = text.trim();
    this.hasUncommittedDomInput = true;

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

    this.emitLiveDraftContentFromDom();

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

    // Durable doc-link (`[[`) autocomplete in both Edit and Suggest modes
    if (this.CanUserEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
      this.updateDocLinkAutocompleteFromInput(seg, el);
    }

    // Live word-level suggestion tracking while typing in Suggest Mode
    if (this.ViewMode === 'suggest' && this.CanUserEdit && trimmed.length > 0) {
      const extractedText = this.ExtractMarkdownFromEditableElement(el).trim();
      let proposedMd = extractedText || trimmed;
      if (seg.BlockKind === 'heading') {
        const level = seg.HeadingLevel ?? 1;
        proposedMd = `${'#'.repeat(level)} ${proposedMd.replace(/\n+/g, ' ')}`;
      }
      if (proposedMd === seg.RawMarkdown.trim()) {
        const removed = this.Suggestions.filter(
          (s) => s.BlockID === seg.SegmentID && s.Status === 'Pending',
        );
        this.Suggestions = this.Suggestions.filter(
          (s) => !(s.BlockID === seg.SegmentID && s.Status === 'Pending'),
        );
        for (const r of removed) {
          this.session?.DeleteSharedSuggestion(r.SuggestionID);
        }
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
    // 0. Durable doc-link (`[[`) dropdown owns navigation keys while open
    if (this.ShowDocLinkMenu) {
      if (
        event.key === 'Escape' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === 'Tab'
      ) {
        event.preventDefault();
        return;
      }
    }

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

    if (!this.CanUserEdit || this.ViewMode !== 'edit' || !this.CanEditSegment(seg)) {
      if (this.CanUserEdit && !this.CanEditSegment(seg) && (event.key === 'Enter' || event.key === 'Backspace')) {
        event.preventDefault();
        this.enforceSegmentLock(seg, 'edit this section');
      }
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
          if (prevSeg && !this.CanEditSegment(prevSeg)) {
            event.preventDefault();
            this.enforceSegmentLock(prevSeg, 'merge into a locked section');
            return;
          }
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
    if (!this.enforceSegmentLock(seg, 'change heading level')) {
      return;
    }
    const currentLevel = seg.HeadingLevel ?? 1;
    const nextLevel = currentLevel >= 4 ? 1 : currentLevel + 1;
    const text = seg.HeadingText ?? this.GetEditableHeadingText(seg);
    const nextMd = `${'#'.repeat(nextLevel)} ${text}`;
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed heading level to H${nextLevel}`);
  }

  public CommitEditableHeading(seg: DocumentRenderSegment, event: Event): void {
    this.commitEditableHeadingElement(seg, event.target as HTMLElement | null);
  }

  private commitEditableHeadingElement(seg: DocumentRenderSegment, el: HTMLElement | null): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const rawText = this.ExtractMarkdownFromEditableElement(el).replace(/\n+/g, ' ').trim();
    if (
      rawText === '/' ||
      (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID) ||
      (this.ShowDocLinkMenu && this.activeDocLinkSegmentID === seg.SegmentID)
    ) {
      return;
    }
    const level = seg.HeadingLevel ?? 1;
    const nextMd = `${'#'.repeat(level)} ${rawText}`;
    if (nextMd !== seg.RawMarkdown) {
      this.ApplyInPlaceSegmentChange(seg, nextMd, `Edited heading H${level}`);
    }
  }

  public CommitEditableParagraph(seg: DocumentRenderSegment, event: Event): void {
    this.commitEditableParagraphElement(seg, event.target as HTMLElement | null);
  }

  private commitEditableParagraphElement(seg: DocumentRenderSegment, el: HTMLElement | null): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    const nextText = this.ExtractMarkdownFromEditableElement(el).trim();
    if (
      nextText === '/' ||
      (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID) ||
      (this.ShowDocLinkMenu && this.activeDocLinkSegmentID === seg.SegmentID)
    ) {
      return;
    }
    if (!nextText) {
      if (seg.RawMarkdown.trim().length > 0 && this.CanEditSegment(seg) && this.ViewMode === 'edit') {
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

  private splitEscapedPipeRow(line: string): string[] {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
      trimmed = trimmed.slice(0, -1);
    }
    const cells: string[] = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '\\' && i + 1 < trimmed.length && (trimmed[i + 1] === '|' || trimmed[i + 1] === '\\')) {
        current += trimmed[i + 1];
        i++;
      } else if (ch === '|') {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  private escapeTableCellMarkdown(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  }

  public GetParsedTable(seg: DocumentRenderSegment): {
    Headers: string[];
    Rows: string[][];
    Alignments: DocsTableAlignment[];
  } {
    const lines = seg.RawMarkdown
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const parseCells = (line: string): string[] => this.splitEscapedPipeRow(line);

    const headers = lines.length > 0 ? parseCells(lines[0]) : ['Column 1', 'Column 2'];
    const alignments: DocsTableAlignment[] = headers.map(() => 'none');
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCells(lines[i]);
      // Parse & skip GFM separator row (| --- | :---: | ---: | :--- |)
      if (cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        for (let cIdx = 0; cIdx < headers.length; cIdx++) {
          const marker = cells[cIdx] ?? '';
          if (marker.startsWith(':') && marker.endsWith(':')) {
            alignments[cIdx] = 'center';
          } else if (marker.startsWith(':')) {
            alignments[cIdx] = 'left';
          } else if (marker.endsWith(':')) {
            alignments[cIdx] = 'right';
          } else {
            alignments[cIdx] = 'none';
          }
        }
        continue;
      }
      while (cells.length < headers.length) {
        cells.push('');
      }
      rows.push(cells.slice(0, headers.length));
    }
    return { Headers: headers, Rows: rows, Alignments: alignments };
  }

  public GetColumnTextAlign(
    table: { Alignments: ReadonlyArray<DocsTableAlignment> },
    colIndex: number,
  ): string | null {
    const align = table.Alignments[colIndex] ?? 'none';
    return align === 'none' ? null : align;
  }

  private serializeParsedTable(
    headers: string[],
    rows: string[][],
    alignments: ReadonlyArray<DocsTableAlignment> = [],
  ): string {
    const headerLine = `| ${headers.map((h) => this.escapeTableCellMarkdown(h)).join(' | ')} |`;
    const sepMarkers = headers.map((_, idx) => {
      switch (alignments[idx] ?? 'none') {
        case 'left':
          return ':---';
        case 'center':
          return ':---:';
        case 'right':
          return '---:';
        default:
          return '---';
      }
    });
    const sepLine = `| ${sepMarkers.join(' | ')} |`;
    const bodyLines = rows.map(
      (r) => `| ${headers.map((_, idx) => this.escapeTableCellMarkdown(r[idx] ?? '')).join(' | ')} |`,
    );
    return [headerLine, sepLine, ...bodyLines].join('\n');
  }

  public UpdateTableHeaderCell(seg: DocumentRenderSegment, colIndex: number, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    if (!this.CanEditSegment(seg)) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextVal = this.ExtractMarkdownFromEditableElement(el).replace(/\r?\n/g, ' ').trim();
    const parsed = this.GetParsedTable(seg);
    if (parsed.Headers[colIndex] === nextVal) {
      return;
    }
    parsed.Headers[colIndex] = nextVal;
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      `Updated table header column ${colIndex + 1}`,
    );
  }

  public UpdateTableBodyCell(seg: DocumentRenderSegment, rowIndex: number, colIndex: number, event: Event): void {
    if (this.isApplyingBlockTransaction) {
      return;
    }
    if (!this.CanEditSegment(seg)) {
      return;
    }
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || !Number.isInteger(colIndex) || colIndex < 0) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextVal = this.ExtractMarkdownFromEditableElement(el).replace(/\r?\n/g, ' ').trim();
    const parsed = this.GetParsedTable(seg);
    const targetRow = parsed.Rows.at(rowIndex);
    if (!targetRow || colIndex >= targetRow.length || targetRow.at(colIndex) === nextVal) {
      return;
    }
    targetRow.splice(colIndex, 1, nextVal);
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      `Updated table cell (${rowIndex + 1}, ${colIndex + 1})`,
    );
  }

  public AddTableRow(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    parsed.Rows.push(parsed.Headers.map((_, idx) => `Value ${idx + 1}`));
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      'Added table row',
    );
  }

  public AddTableColumn(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    const colNum = parsed.Headers.length + 1;
    parsed.Headers.push(`Column ${colNum}`);
    parsed.Alignments.push('none');
    for (const row of parsed.Rows) {
      row.push('—');
    }
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      'Added table column',
    );
  }

  public InsertTableRowAt(
    seg: DocumentRenderSegment,
    rowIndex: number,
    placement: 'above' | 'below',
    isHeaderRow = false,
  ): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    const emptyRow = parsed.Headers.map(() => '');
    const insertIdx = isHeaderRow
      ? 0
      : placement === 'above'
        ? Math.max(0, Math.min(parsed.Rows.length, rowIndex))
        : Math.max(0, Math.min(parsed.Rows.length, rowIndex + 1));
    parsed.Rows.splice(insertIdx, 0, emptyRow);
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      `Inserted table row ${placement}`,
    );
  }

  public DeleteTableRowAt(seg: DocumentRenderSegment, rowIndex: number): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    if (parsed.Rows.length <= 1 || rowIndex < 0 || rowIndex >= parsed.Rows.length) {
      return;
    }
    parsed.Rows.splice(rowIndex, 1);
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      'Deleted table row',
    );
  }

  public InsertTableColumnAt(
    seg: DocumentRenderSegment,
    colIndex: number,
    placement: 'left' | 'right',
  ): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    const insertIdx =
      placement === 'left'
        ? Math.max(0, Math.min(parsed.Headers.length, colIndex))
        : Math.max(0, Math.min(parsed.Headers.length, colIndex + 1));
    parsed.Headers.splice(insertIdx, 0, `Column ${parsed.Headers.length + 1}`);
    parsed.Alignments.splice(insertIdx, 0, 'none');
    for (const row of parsed.Rows) {
      row.splice(insertIdx, 0, '');
    }
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      `Inserted table column ${placement}`,
    );
  }

  public DeleteTableColumnAt(seg: DocumentRenderSegment, colIndex: number): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    if (parsed.Headers.length <= 1 || colIndex < 0 || colIndex >= parsed.Headers.length) {
      return;
    }
    parsed.Headers.splice(colIndex, 1);
    parsed.Alignments.splice(colIndex, 1);
    for (const row of parsed.Rows) {
      row.splice(colIndex, 1);
    }
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      'Deleted table column',
    );
  }

  public SetTableColumnAlignment(
    seg: DocumentRenderSegment,
    colIndex: number,
    alignment: 'left' | 'center' | 'right',
  ): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    if (colIndex < 0 || colIndex >= parsed.Headers.length) {
      return;
    }
    parsed.Alignments[colIndex] = alignment;
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments),
      `Aligned column ${colIndex + 1} ${alignment}`,
    );
  }

  public SortTableByColumn(
    seg: DocumentRenderSegment,
    colIndex: number,
    direction: 'asc' | 'desc',
  ): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedTable(seg);
    if (colIndex < 0 || colIndex >= parsed.Headers.length || parsed.Rows.length <= 1) {
      return;
    }
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const factor = direction === 'asc' ? 1 : -1;
    const sortedRows = [...parsed.Rows].sort((a, b) => {
      const av = (a[colIndex] ?? '').trim();
      const bv = (b[colIndex] ?? '').trim();
      return collator.compare(av, bv) * factor;
    });
    this.ApplyInPlaceSegmentChange(
      seg,
      this.serializeParsedTable(parsed.Headers, sortedRows, parsed.Alignments),
      `Sorted table by column ${colIndex + 1} (${direction})`,
    );
  }

  public CopyTableAs(seg: DocumentRenderSegment, format: 'markdown' | 'csv' | 'tsv'): void {
    if (format === 'markdown') {
      this.writeClipboardText(seg.RawMarkdown, 'Copied table as Markdown.');
      return;
    }
    const parsed = this.GetParsedTable(seg);
    const allRows = [parsed.Headers, ...parsed.Rows];
    if (format === 'csv') {
      const csv = allRows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\n');
      this.writeClipboardText(csv, 'Copied table as CSV.');
      return;
    }
    const tsv = allRows
      .map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, ' ')).join('\t'))
      .join('\n');
    this.writeClipboardText(tsv, 'Copied table as TSV.');
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
    if (!this.enforceSegmentLock(seg, 'toggle task item')) {
      if (checkbox) {
        const items = this.GetParsedListItems(seg);
        if (items[itemIndex]) {
          checkbox.checked = items[itemIndex].Checked;
        }
      }
      return;
    }
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
    if (
      this.isApplyingBlockTransaction ||
      !this.CanEditSegment(seg) ||
      (this.ShowDocLinkMenu && this.activeDocLinkSegmentID === seg.SegmentID)
    ) {
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
    if (this.ShowSlashMenu || this.ShowDocLinkMenu) {
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
      this.CanEditSegment(seg) &&
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
      if (!this.enforceSegmentLock(seg, 'edit this list') || segIdx < 0) {
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
      this.CanEditSegment(seg) &&
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
    if (!this.enforceSegmentLock(seg, 'add a list item')) {
      return;
    }
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
    if (!this.CanEditSegment(seg)) {
      return;
    }
    seg = this.flushDirtyDomBeforeContextMutation(seg);
    const parsed = this.GetParsedCallout(seg);
    const bodyLines = parsed.BodyText.split('\n').map((l) => `> ${l}`);
    const nextMd = [`> [!${nextType}]`, ...bodyLines].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed callout type to ${nextType}`);
  }

  public CommitEditableCallout(seg: DocumentRenderSegment, event: Event): void {
    this.commitEditableCalloutElement(seg, event.target as HTMLElement | null);
  }

  private commitEditableCalloutElement(seg: DocumentRenderSegment, el: HTMLElement | null): void {
    if (this.isApplyingBlockTransaction || (this.ShowDocLinkMenu && this.activeDocLinkSegmentID === seg.SegmentID)) {
      return;
    }
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
    if (!this.enforceSegmentLock(seg, 'change code block language')) {
      return;
    }
    const safeLang = (nextLang || '').replace(/[`\r\n]/g, '').trim();
    const parsed = this.GetParsedCodeBlock(seg);
    const nextMd = ['```' + safeLang, parsed.Code, '```'].join('\n');
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed code block language to ${safeLang || 'plain'}`);
  }

  public CommitEditableCodeBlock(seg: DocumentRenderSegment, event: Event): void {
    if (this.isApplyingBlockTransaction || !this.CanEditSegment(seg)) {
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
    if (!this.CanEditSegment(seg) || nextBlockMarkdown === seg.RawMarkdown) {
      if (this.CanUserEdit && !this.CanEditSegment(seg)) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
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
      if (seg.Kind !== 'markdown' || !this.CanEditSegment(seg)) {
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
      } else if (seg.BlockKind === 'table') {
        const parsed = this.GetParsedTable(seg);
        let changed = false;
        parsed.Headers.forEach((hdr, cIdx) => {
          const el = root.querySelector<HTMLElement>(
            `[data-testid="table-header-${seg.SegmentID}-${cIdx}"]`,
          );
          if (el && this.isDomNode(el)) {
            const domText = this.ExtractMarkdownFromEditableElement(el).replace(/\r?\n/g, ' ').trim();
            if (domText !== hdr) {
              parsed.Headers[cIdx] = domText;
              changed = true;
            }
          }
        });
        parsed.Rows.forEach((row, rIdx) => {
          row.forEach((cell, cIdx) => {
            const el = root.querySelector<HTMLElement>(
              `[data-testid="table-cell-${seg.SegmentID}-${rIdx}-${cIdx}"]`,
            );
            if (el && this.isDomNode(el)) {
              const domText = this.ExtractMarkdownFromEditableElement(el).replace(/\r?\n/g, ' ').trim();
              if (domText !== cell) {
                row[cIdx] = domText;
                changed = true;
              }
            }
          });
        });
        if (changed) {
          blocks[i] = this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments);
        }
      } else if (seg.BlockKind === 'code') {
        const el = root.querySelector<HTMLElement>(`[data-testid="editable-code-body-${seg.SegmentID}"]`);
        if (el && this.isDomNode(el)) {
          const parsed = this.GetParsedCodeBlock(seg);
          const domCode = el.textContent ?? '';
          if (domCode !== parsed.Code) {
            blocks[i] = ['```' + parsed.Language, domCode, '```'].join('\n');
          }
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

  private flushDirtyDomBeforeContextMutation(targetSeg: DocumentRenderSegment): DocumentRenderSegment {
    if (this.ViewMode !== 'edit') {
      return targetSeg;
    }
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === targetSeg.SegmentID);
    const previousSegments = this.DocumentSegments;
    const blocks = previousSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const dirtyChanged = blocks.some((b, i) => b !== previousSegments[i]?.RawMarkdown);
    if (!dirtyChanged) {
      return targetSeg;
    }
    const nonEmpty = blocks.filter((b) => b.trim().length > 0).join('\n\n');
    this.OnMarkdownChanged(nonEmpty);
    if (blocks.some((b) => b.trim().length === 0)) {
      this.preserveEmptyDraftSegments(blocks, previousSegments);
    }
    return (
      this.findSegmentById(targetSeg.SegmentID) ??
      (segIdx >= 0 && this.DocumentSegments.length > 0
        ? this.DocumentSegments[Math.min(segIdx, this.DocumentSegments.length - 1)]
        : undefined) ??
      targetSeg
    );
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
        if (this.isComponentDestroyed) {
          return;
        }
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
        if (this.isComponentDestroyed) {
          return;
        }
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
      this.commitEditableHeadingElement(seg, el);
    } else if (seg.BlockKind === 'paragraph' || !seg.BlockKind) {
      const text = this.ExtractMarkdownFromEditableElement(el).trim();
      if (text && text !== seg.RawMarkdown.trim()) {
        this.commitEditableParagraphElement(seg, el);
      }
    } else if (seg.BlockKind === 'callout') {
      this.commitEditableCalloutElement(seg, el);
    }
  }

  /**
   * Moves a segment up (`direction = -1`) or down (`direction = 1`) in the document flow.
   */
  public MoveSegment(seg: DocumentRenderSegment, direction: -1 | 1): void {
    if (!this.CanEditSegment(seg)) {
      if (this.CanUserEdit) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
      return;
    }
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= this.DocumentSegments.length) {
      return;
    }
    const targetSeg = this.DocumentSegments[targetIdx];
    if (!targetSeg || !this.CanEditSegment(targetSeg)) {
      this.StatusBannerMessage = 'Cannot move a block across an owner-locked section.';
      this.cdr.markForCheck();
      return;
    }
    if (this.ViewMode === 'suggest') {
      const firstSeg = idx < targetIdx ? seg : targetSeg;
      const secondSeg = idx < targetIdx ? targetSeg : seg;
      const originalPair = `${firstSeg.RawMarkdown}\n\n${secondSeg.RawMarkdown}`;
      const swappedPair = `${secondSeg.RawMarkdown}\n\n${firstSeg.RawMarkdown}`;
      this.CreateOrUpdatePendingSuggestion(
        seg.SegmentID,
        originalPair,
        swappedPair,
        direction < 0 ? 'Move block up' : 'Move block down',
      );
      this.StatusBannerMessage = `Queued tracked suggestion to move block ${direction < 0 ? 'up' : 'down'}.`;
      this.cdr.markForCheck();
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const [moved] = blocks.splice(idx, 1);
    blocks.splice(targetIdx, 0, moved);
    this.OnMarkdownChanged(blocks.filter((b) => b.trim().length > 0).join('\n\n'));
  }

  /**
   * Deletes a segment from the document.
   */
  public DeleteSegment(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      if (this.CanUserEdit) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.DocumentSegments.length <= 1) {
      return;
    }
    if (this.ViewMode === 'suggest') {
      this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, '', 'Delete block');
      this.StatusBannerMessage = 'Queued tracked suggestion to delete block.';
      this.cdr.markForCheck();
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const remaining = blocks.filter((b, i) => i !== idx && b.trim().length > 0);
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'pin or unpin embedded artifact version')) {
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

  public OnSourceMarkdownChanged(nextValue: string): void {
    if (!this.CanUserEdit) {
      this.cdr.markForCheck();
      return;
    }
    const incoming = nextValue ?? '';
    const lockCheck = this.validateDocumentEditLocks(incoming);
    if (!lockCheck.Allowed) {
      this.cdr.markForCheck();
      return;
    }
    this.OnMarkdownChanged(incoming);
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
    this.hasUncommittedDomInput = false;
    this.MarkdownContent = nextMarkdown ?? '';
    if (!fromYjs && this.session) {
      this.session.SetContent(this.MarkdownContent);
    }
    this.refreshParsedStructure();
    if (!fromYjs) {
      this.DraftContentChanged.emit(this.MarkdownContent);
    }
    this.cdr.markForCheck();
  }

  /**
   * Formats the active selection in-place (`**bold**`, `*italic*`, headings, lists, callouts)
   * or inserts a structured block when the current target is empty or requires a new block (such as tables).
   */
  public InsertFormattingSnippet(
    prefix: string,
    suffix: string,
    preserveSelectionSnapshot = false,
  ): void {
    if (!this.CanUserEdit) {
      return;
    }

    if (!preserveSelectionSnapshot) {
      this.CaptureSelectionSnapshot();
    }
    const segIdx = this.resolveFormattingTargetSegmentIndex();
    const targetSeg = segIdx >= 0 && segIdx < this.DocumentSegments.length ? this.DocumentSegments[segIdx] : undefined;
    if (targetSeg && !this.CanEditSegment(targetSeg)) {
      this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
      this.cdr.markForCheck();
      return;
    }

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
   * Memoized `SafeHtml` wrapper over {@link RenderInlineEditableHtml} for Angular `[innerHTML]`
   * bindings on `contenteditable` surfaces. Every plain markdown segment is HTML-escaped in
   * {@link renderPlainInlineMarkdownHtml} and every chip attribute is escaped in
   * {@link RenderDocRecordLinkChipHtml}; trusting the constructed HTML prevents Angular's default
   * sanitizer from stripping `data-doc-link-*` and `contenteditable="false"`, while memoization
   * preserves object identity across change-detection cycles so the caret never resets while typing.
   */
  public RenderInlineEditableSafeHtml(markdownText: string): SafeHtml | string {
    const html = this.RenderInlineEditableHtml(markdownText);
    if (!this.domSanitizer) {
      return html;
    }
    const cached = this.editableSafeHtmlCache.get(html);
    if (cached) {
      return cached;
    }
    if (this.editableSafeHtmlCache.size >= 256) {
      this.editableSafeHtmlCache.clear();
    }
    const trusted = this.domSanitizer.bypassSecurityTrustHtml(html);
    this.editableSafeHtmlCache.set(html, trusted);
    return trusted;
  }

  /**
   * Renders inline Markdown (`**bold**`, `*italic*`, `` `code` ``, `***both***`) and durable
   * record-mention tokens (`@{"_mode":"mention","type":"record",...}`) as sanitized WYSIWYG HTML
   * for `contenteditable` surfaces while preserving newlines as `<br>`.
   */
  public RenderInlineEditableHtml(markdownText: string): string {
    if (!markdownText) {
      return '';
    }
    const links = ExtractDocRecordLinks(markdownText, { SkipCode: true });
    if (links.length === 0) {
      return this.renderPlainInlineMarkdownHtml(markdownText);
    }
    const parts: string[] = [];
    let cursor = 0;
    for (const link of links) {
      this.docLinksByKeySignature.set(link.KeySignature, link);
      if (link.Token.startIndex > cursor) {
        parts.push(this.renderPlainInlineMarkdownHtml(markdownText.slice(cursor, link.Token.startIndex)));
      }
      parts.push(RenderDocRecordLinkChipHtml(link, this.GetDocRecordLinkAccessState(link), { Editable: true }));
      cursor = link.Token.endIndex;
    }
    if (cursor < markdownText.length) {
      parts.push(this.renderPlainInlineMarkdownHtml(markdownText.slice(cursor)));
    }
    return parts.join('');
  }

  private renderPlainInlineMarkdownHtml(markdownText: string): string {
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

  /** Returns true when a markdown block contains at least one durable record-mention token. */
  public HasDocRecordLinksInText(markdownText: string): boolean {
    return HasDocRecordLinks(markdownText);
  }

  /**
   * Prepares a markdown block for `<mj-markdown [EnableHtml]="false">` preview rendering by
   * replacing durable record-mention tokens outside code blocks with safe Markdown fragment links
   * (stored label only; `#mj-doc-link-readable/...` iff readable, `#mj-doc-link-unreadable/...`
   * with "You don't have access" otherwise).
   */
  public RenderPreviewMarkdown(rawMarkdown: string): string {
    if (!rawMarkdown || !HasDocRecordLinks(rawMarkdown)) {
      return rawMarkdown ?? '';
    }
    return ReplaceDocRecordLinksWithPreviewMarkdown(rawMarkdown, (link) => {
      this.docLinksByKeySignature.set(link.KeySignature, link);
      return this.GetDocRecordLinkAccessState(link);
    });
  }

  /**
   * Returns the cached access state for a durable record link (`'readable'`, `'unreadable'`, or
   * `'checking'`), queuing any uncached link into a microtask-coalesced batch so every render
   * resolves all links in one DB-optimal pass (one `RunView` per entity via `RunViews`).
   * Fails closed until proven readable. Cache entries are scoped to the current viewer ID.
   */
  public GetDocRecordLinkAccessState(link: ParsedDocRecordLink): DocRecordLinkAccessState {
    const cacheKey = this.buildDocLinkAccessCacheKey(link);
    const cached = this.docLinkAccessCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    this.queueDocRecordLinkAccessCheck(link, cacheKey);
    return 'checking';
  }

  private buildDocLinkAccessCacheKey(link: ParsedDocRecordLink): string {
    const user = this.getSafeCurrentUser();
    return `${(user?.ID ?? '').trim().toLowerCase()}|${link.KeySignature}`;
  }

  private queueDocRecordLinkAccessChecks(links: ReadonlyArray<ParsedDocRecordLink>): void {
    for (const link of links) {
      const cacheKey = this.buildDocLinkAccessCacheKey(link);
      if (!this.docLinkAccessCache.has(cacheKey)) {
        this.queueDocRecordLinkAccessCheck(link, cacheKey);
      }
    }
  }

  private queueDocRecordLinkAccessCheck(link: ParsedDocRecordLink, cacheKey: string): void {
    if (this.docLinkAccessPending.has(cacheKey) || this.docLinkAccessQueue.has(cacheKey)) {
      return;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.docLinkAccessCache.set(cacheKey, 'unreadable');
      return;
    }
    this.docLinkAccessQueue.set(cacheKey, link);
    if (!this.docLinkAccessFlushScheduled) {
      this.docLinkAccessFlushScheduled = true;
      const epoch = this.docLinkAccessEpoch;
      void Promise.resolve().then(() => this.flushDocRecordLinkAccessBatch(epoch));
    }
  }

  private async flushDocRecordLinkAccessBatch(epoch: number): Promise<void> {
    this.docLinkAccessFlushScheduled = false;
    if (this.isComponentDestroyed || epoch !== this.docLinkAccessEpoch || this.docLinkAccessQueue.size === 0) {
      return;
    }
    const entries = Array.from(this.docLinkAccessQueue.entries());
    this.docLinkAccessQueue.clear();

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      for (const [cacheKey] of entries) {
        this.docLinkAccessCache.set(cacheKey, 'unreadable');
      }
      this.cdr.markForCheck();
      return;
    }

    for (const [cacheKey] of entries) {
      this.docLinkAccessPending.add(cacheKey);
    }

    try {
      const batchResults = await CheckDocRecordLinksAccessBatch(
        entries.map(([, link]) => link),
        provider,
        user,
      );
      if (this.isComponentDestroyed || epoch !== this.docLinkAccessEpoch) {
        return;
      }
      for (const [cacheKey, link] of entries) {
        this.docLinkAccessCache.set(cacheKey, batchResults.get(link.KeySignature) ?? 'unreadable');
      }
    } catch {
      if (!this.isComponentDestroyed && epoch === this.docLinkAccessEpoch) {
        for (const [cacheKey] of entries) {
          this.docLinkAccessCache.set(cacheKey, 'unreadable');
        }
      }
    } finally {
      for (const [cacheKey] of entries) {
        this.docLinkAccessPending.delete(cacheKey);
      }
      if (!this.isComponentDestroyed && epoch === this.docLinkAccessEpoch) {
        this.cdr.markForCheck();
      }
    }
  }

  /** Handles click or Enter on a rendered durable record-link chip in preview or edit mode. */
  public OnDocRecordLinkClick(event: Event): void {
    const target = typeof Element !== 'undefined' && event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    // 1. Preview mode safe fragment-link chip (`<a href="#mj-doc-link-readable/..." | "#mj-doc-link-unreadable/...">`)
    const anchorEl = target.closest<HTMLAnchorElement>('a[href]');
    const href = anchorEl?.getAttribute('href') ?? '';
    if (href.startsWith(DOC_LINK_PREVIEW_HREF_UNREADABLE)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (href.startsWith(DOC_LINK_PREVIEW_HREF_READABLE)) {
      event.preventDefault();
      event.stopPropagation();
      let keySig = '';
      try {
        keySig = decodeURIComponent(href.slice(DOC_LINK_PREVIEW_HREF_READABLE.length));
      } catch {
        return;
      }
      const link = this.docLinksByKeySignature.get(keySig);
      if (!link || this.GetDocRecordLinkAccessState(link) !== 'readable') {
        return;
      }
      const resolved = ResolveDocRecordLinkCompositeKey(link, this.getSafeProvider());
      if (resolved) {
        this.OpenEntityRecord.emit({ entityName: resolved.Entity.Name, compositeKey: resolved.Key });
      }
      return;
    }

    // 2. Edit / Suggest / Table mode inline chip (`<span data-doc-record-link="true">`)
    const chipEl = target.closest<HTMLElement>('[data-doc-record-link="true"]');
    if (!chipEl) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (chipEl.getAttribute('data-doc-link-access') !== 'readable') {
      return;
    }
    const entityName = chipEl.getAttribute('data-record-entity') ?? '';
    const keysJson = chipEl.getAttribute('data-record-keys') ?? '';
    if (!entityName) {
      return;
    }
    let keys: Record<string, string | number> = {};
    try {
      keys = keysJson ? (JSON.parse(keysJson) as Record<string, string | number>) : {};
    } catch {
      return;
    }
    const resolved = ResolveDocRecordLinkCompositeKey(
      {
        EntityName: entityName,
        Content: { type: 'record', entityName, keys },
      },
      this.getSafeProvider(),
    );
    if (!resolved) {
      return;
    }
    this.OpenEntityRecord.emit({ entityName: resolved.Entity.Name, compositeKey: resolved.Key });
  }

  /** Closes the `[[` durable doc-link autocomplete dropdown. */
  public CloseDocLinkMenu(): void {
    this.ShowDocLinkMenu = false;
    this.DocLinkSuggestions = [];
    this.activeDocLinkSegmentID = null;
    this.activeDocLinkQuery = '';
    this.activeDocLinkElement = null;
    this.cdr.markForCheck();
  }

  /** Inserts the selected durable record-mention token into the active edit/suggest block. */
  public OnDocLinkSuggestionSelected(suggestion: MentionSuggestion): void {
    const segId = this.activeDocLinkSegmentID;
    const query = this.activeDocLinkQuery;
    const el = this.activeDocLinkElement;
    const token = ArtifactLinkTriggerProvider.FormatSelectionToken(suggestion);
    this.CloseDocLinkMenu();

    if (!segId) {
      return;
    }
    const seg = this.DocumentSegments.find((s) => s.SegmentID === segId);
    if (!seg) {
      return;
    }
    const currentMarkdown = el ? this.ExtractMarkdownFromEditableElement(el) : seg.RawMarkdown;
    let updatedBody = ReplaceDocLinkTriggerWithToken(currentMarkdown, query, token);
    if (seg.BlockKind === 'heading') {
      const level = seg.HeadingLevel ?? 1;
      const stripped = updatedBody.replace(/^#{1,6}\s+/, '').replace(/\n+/g, ' ').trim();
      updatedBody = `${'#'.repeat(level)} ${stripped}`;
    } else if (seg.BlockKind === 'list') {
      const itemIdxAttr = el?.getAttribute?.('data-list-item-index');
      const itemIdx = itemIdxAttr != null ? Number.parseInt(itemIdxAttr, 10) : Number.NaN;
      const items = this.GetParsedListItems(seg);
      if (!Number.isNaN(itemIdx) && items[itemIdx]) {
        items[itemIdx].Text = updatedBody.replace(/\n+/g, ' ').trim();
        updatedBody = this.serializeParsedListItems(items);
      }
    } else if (seg.BlockKind === 'callout') {
      const parsed = this.GetParsedCallout(seg);
      const bodyLines = updatedBody.trim().split('\n').map((l) => `> ${l}`);
      updatedBody = [`> [!${parsed.CalloutType}]`, ...bodyLines].join('\n');
    }
    this.ApplyInPlaceSegmentChange(seg, updatedBody, `Linked ${suggestion.name}`);
  }

  private updateDocLinkAutocompleteFromInput(seg: DocumentRenderSegment, el: HTMLElement | null): void {
    const markdown = el ? this.ExtractMarkdownFromEditableElement(el) : '';
    const trigger = FindActiveDocLinkTrigger(markdown);
    if (!trigger) {
      if (this.ShowDocLinkMenu && this.activeDocLinkSegmentID === seg.SegmentID) {
        this.CloseDocLinkMenu();
      }
      return;
    }

    this.activeDocLinkSegmentID = seg.SegmentID;
    this.activeDocLinkQuery = trigger.Query;
    this.activeDocLinkElement = el;
    this.DocLinkMenuPosition = this.computeDocLinkDropdownPosition(el);
    this.ShowDocLinkMenu = true;
    this.docLinkTriggerProvider.ExcludeArtifactID = this.artifactVersion?.ArtifactID ?? null;
    const seq = ++this.docLinkSearchSeq;
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    this.cdr.markForCheck();

    void this.docLinkTriggerProvider
      .GetSuggestions({
        Query: trigger.Query,
        MaxResults: 12,
        ContextUser: user ?? null,
        Provider: provider ?? null,
      })
      .then((suggestions) => {
        if (this.isComponentDestroyed || seq !== this.docLinkSearchSeq || !this.ShowDocLinkMenu) {
          return;
        }
        this.DocLinkSuggestions = suggestions;
        this.cdr.markForCheck();
      })
      .catch(() => {
        if (!this.isComponentDestroyed && seq === this.docLinkSearchSeq && this.ShowDocLinkMenu) {
          this.DocLinkSuggestions = [];
          this.cdr.markForCheck();
        }
      });
  }

  private computeDocLinkDropdownPosition(el: HTMLElement | null): { top: number; left: number } {
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (typeof range.getBoundingClientRect === 'function') {
          const rect = range.getBoundingClientRect();
          if (rect && (rect.bottom > 0 || rect.left > 0)) {
            return { top: Math.round(rect.bottom + 6), left: Math.round(rect.left) };
          }
        }
      }
    }
    if (el && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.bottom + 6), left: Math.round(rect.left) };
    }
    return { top: 120, left: 120 };
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
      const rawDocLink = elm.getAttribute?.('data-doc-link-raw');
      if (rawDocLink) {
        out.push(rawDocLink);
        return;
      }
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
        let leadEnd = 0;
        while (leadEnd < raw.length && /\s/.test(raw[leadEnd])) {
          leadEnd++;
        }
        let trailStart = raw.length;
        while (trailStart > leadEnd && /\s/.test(raw[trailStart - 1])) {
          trailStart--;
        }
        return {
          lead: raw.slice(0, leadEnd),
          core: raw.slice(leadEnd, trailStart),
          trail: raw.slice(trailStart),
        };
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
            const hasNonCollapsedSnapshot =
              snapshotMatchesTarget &&
              this.lastSelectionSnapshot !== null &&
              this.lastSelectionSnapshot.end > this.lastSelectionSnapshot.start;
            if (caret.end > caret.start || !hasNonCollapsedSnapshot) {
              return this.mapVisibleRangeToMarkdownRange(currentMarkdown, caret.start, caret.end);
            }
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
      const nextMd = this.serializeParsedTable(parsed.Headers, parsed.Rows, parsed.Alignments);
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

    const trimTrailingNewlines = (raw: string): string => {
      let end = raw.length;
      while (end > 0 && raw[end - 1] === '\n') {
        end--;
      }
      return raw.slice(0, end);
    };

    if (idx >= 0 && idx < this.DocumentSegments.length) {
      const targetSeg = this.DocumentSegments[idx];
      if (targetSeg && !this.CanEditSegment(targetSeg)) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
        return;
      }
      if (this.ViewMode === 'suggest' && targetSeg) {
        const trimmedSnippet = trimTrailingNewlines(snippet);
        if (trimmedSnippet.trim().length > 0) {
          this.ApplyInPlaceSegmentChange(
            targetSeg,
            `${targetSeg.RawMarkdown}\n\n${trimmedSnippet}`,
            'Insert block via / menu',
          );
        }
        return;
      }
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      this.syncDirtySegmentsFromDomIntoBlocks(blocks);
      const cleanedTarget = blocks[idx].replace(/(?:^|\s)\/[A-Za-z0-9_-]*$/, '').trim();
      const trimmedSnippet = trimTrailingNewlines(snippet);
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
    const trimmedSnippet = trimTrailingNewlines(snippet);
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
   * Opens the interactive block-insert dialog preselected to a known slash command
   * (used by direct formatting-ribbon actions such as Sheet Chart and Sheet Range).
   */
  public OpenSlashBlockInsert(commandName: '/sheet-chart' | '/sheet-range'): void {
    if (!this.CanUserEdit) {
      return;
    }
    this.ActiveSlashTargetSegmentID = null;
    const cmd = this.collabService.GetSlashCommands().find((c) => c.Command === commandName);
    if (cmd) {
      this.ExecuteSlashCommand(cmd);
    }
  }

  /**
   * Executes a `/` slash command selected from the Slash Command Palette.
   */
  public ExecuteSlashCommand(cmd: DocumentSlashCommand): void {
    this.ShowSlashMenu = false;
    this.SlashMenuHighlightIndex = 0;

    if (cmd.Command === '/ai') {
      if (!ARTIFACT_AI_ASSISTANT_ENABLED) {
        return;
      }
      let targetSeg =
        this.DocumentSegments.find((s) => s.SegmentID === this.ActiveSlashTargetSegmentID) ??
        this.DocumentSegments[0];
      if (targetSeg && targetSeg.Kind === 'markdown') {
        const cleanedSegMd = targetSeg.RawMarkdown.replace(/(?:^|\s)\/[A-Za-z0-9_-]*$/, '');
        if (cleanedSegMd !== targetSeg.RawMarkdown && this.CanEditSegment(targetSeg)) {
          this.ReplaceSegmentMarkdown(targetSeg, cleanedSegMd);
          targetSeg =
            this.DocumentSegments.find((s) => s.SegmentID === targetSeg!.SegmentID) ?? targetSeg;
        }
      }
      this.OpenAskAiAssistant(targetSeg);
      return;
    }

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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'configure this block')) {
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

  public OnNewBlockArtifactIdChanged(value: string): void {
    this.NewBlockArtifactID = value;
    const trimmed = value.trim();
    if (IsValidUUID(trimmed) && this.IsSpreadsheetArtifactPickerSelected) {
      void this.loadSelectedWorkbookSheets(trimmed);
    } else if (!trimmed) {
      this.SelectedWorkbookSheets = [];
      this.SelectedArtifactLatestVersionID = '';
    }
  }

  public SelectArtifactOption(artOpt: DocsArtifactPickerOption): void {
    this.NewBlockArtifactID = artOpt.ID;
    this.NewBlockArtifactTypeName = artOpt.Type || 'Whiteboard';
    if (artOpt.ID && artOpt.Type) {
      this.embeddedArtifactTypes.set(artOpt.ID.trim().toLowerCase(), artOpt.Type);
    }
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
    // The QueryEngine bound to this viewer's provider; it loads at client startup.
    const queries = (QueryEngine.GetProviderInstance(md, QueryEngine) as QueryEngine).Queries ?? [];
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
        const ancestors = this.EffectiveAncestorArtifactIDs;
        this.AvailableArtifactsForPicker = res.Results
          .filter((r) => Boolean(r.ID) && !ancestors.has(r.ID.trim().toLowerCase()))
          .map((r) => {
            const typeName = r.Type || 'Artifact';
            this.embeddedArtifactTypes.set(r.ID.trim().toLowerCase(), typeName);
            return {
              ID: r.ID,
              Name: r.Name,
              Type: typeName,
            };
          });
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
    if (isEditingExisting) {
      const existingSeg = this.findSegmentForBlockId(this.EditingBlockID);
      if (!this.enforceSegmentLock(existingSeg, 'update this block configuration')) {
        return;
      }
    } else {
      const targetIdx = this.resolveActiveSegmentIndex();
      const targetSeg = targetIdx >= 0 ? this.DocumentSegments[targetIdx] : undefined;
      if (targetSeg && !this.enforceSegmentLock(targetSeg, 'insert a block into this locked section')) {
        return;
      }
    }
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
        if (this.EffectiveAncestorArtifactIDs.size >= MJ_MAX_EMBED_DEPTH) {
          this.notifyError(`Maximum embedded artifact nesting depth (${MJ_MAX_EMBED_DEPTH}) reached.`);
          return;
        }
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
        const ancestors = this.EffectiveAncestorArtifactIDs;
        if (ancestors.has(artifactId.toLowerCase())) {
          this.notifyError('Cannot embed an artifact inside itself or one of its ancestors (circular embed detected).');
          return;
        }
        if (ancestors.size >= MJ_MAX_EMBED_DEPTH) {
          this.notifyError(`Maximum embedded artifact nesting depth (${MJ_MAX_EMBED_DEPTH}) reached.`);
          return;
        }
        this.embeddedArtifactTypes.set(artifactId.toLowerCase(), descriptor.ArtifactType);
        descriptor.ArtifactID = artifactId;
        if (this.IsSpreadsheetArtifactPickerSelected) {
          if (this.NewBlockSheetMode !== 'full' && this.NewBlockSheetName.trim()) {
            descriptor.SheetID = this.NewBlockSheetName.trim();
          }
          if (this.NewBlockSheetMode === 'chart') {
            const chartId = this.NewBlockSheetChartID.trim();
            if (!chartId) {
              this.notifyError('Select a Spreadsheet Chart (or switch embed mode to Cell Range / Entire Workbook).');
              return;
            }
            descriptor.SheetChartID = chartId;
            descriptor.SheetRange = undefined;
          } else if (this.NewBlockSheetMode === 'range') {
            const sheetRange = this.NewBlockSheetRange.trim();
            if (!sheetRange) {
              this.notifyError('Enter a Spreadsheet cell range (for example, A1:D8) to embed.');
              return;
            }
            descriptor.SheetRange = sheetRange;
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
      if (descriptor.Kind === 'Artifact' && descriptor.ArtifactID) {
        const cacheKey = this.getEmbeddedVersionCacheKey(descriptor.ArtifactID, descriptor.VersionID);
        this.failedEmbeddedVersionMessages.delete(cacheKey);
        this.embeddedArtifactVersions.delete(cacheKey);
      }
      const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
        this.MarkdownContent,
        blockId,
        descriptor,
      );
      this.OnMarkdownChanged(updatedRes.Markdown);
      if (descriptor.Kind === 'Artifact') {
        void this.GetEmbeddedArtifactVersion(descriptor);
      } else {
        void this.RefreshLiveBlock(descriptor);
      }
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
   * Opens the slide-in `@memberjunction/ng-conversations` AI Assistant with context
   * from the currently focused or `/ai`-invoked document segment.
   */
  public OpenAskAiAssistant(explicitSegment?: DocumentRenderSegment): void {
    if (!ARTIFACT_AI_ASSISTANT_ENABLED) {
      return;
    }
    const targetSeg =
      explicitSegment ??
      this.DocumentSegments.find(
        (s) => s.SegmentID === (this.ActiveSlashTargetSegmentID ?? this.lastFocusedSegmentId),
      ) ??
      this.DocumentSegments[0];

    const originalMd = targetSeg?.RawMarkdown ?? this.MarkdownContent;
    const contextLabel = targetSeg?.HeadingText
      ? `Heading: ${targetSeg.HeadingText}`
      : targetSeg
        ? `Section (${targetSeg.BlockKind})`
        : 'Document';

    RequestArtifactAiAssistant({
      ArtifactID: this.artifactVersion?.ArtifactID ?? null,
      ArtifactTitle:
        this.OutlineItems.find((item) => item.Kind === 'heading')?.Title || 'Document',
      ArtifactKind: 'doc',
      ContextLabel: contextLabel,
      SelectedContent: originalMd.slice(0, 4000),
      SuggestingModeDefault: true,
      TargetSegmentID: targetSeg?.SegmentID,
      ApplySuggestion: (proposedText: string, asSuggestion: boolean) => {
        const cleaned = proposedText ?? '';
        if (!cleaned.trim() || !this.CanUserEdit) {
          return;
        }
        const liveSeg =
          (targetSeg
            ? this.DocumentSegments.find((s) => s.SegmentID === targetSeg.SegmentID)
            : undefined) ?? this.DocumentSegments[0];

        if (asSuggestion || this.ViewMode === 'suggest') {
          this.CreateOrUpdatePendingSuggestion(
            liveSeg?.SegmentID ?? 'doc-root',
            liveSeg?.RawMarkdown ?? this.MarkdownContent,
            cleaned,
            'Proposed by AI Assistant',
            'AI Assistant',
          );
          if (this.ViewMode !== 'suggest') {
            this.SetViewMode('suggest');
          }
          this.StatusBannerMessage = 'AI Assistant proposal added as a tracked suggestion.';
          this.cdr.markForCheck();
          return;
        }

        if (liveSeg && this.CanEditSegment(liveSeg)) {
          this.ReplaceSegmentMarkdown(liveSeg, cleaned);
        } else if (!liveSeg) {
          this.OnMarkdownChanged(cleaned);
        } else {
          this.StatusBannerMessage = 'Target section is locked and cannot be edited directly.';
        }
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Returns parsed lock ranges from `<!-- mj-lock -->` directives and locked blocks in the document.
   */
  public GetDocumentLockedRanges(): DocumentLockedRange[] {
    return DocumentLiveBlockEngine.Instance.ParseDocumentLocks(this.MarkdownContent);
  }

  private findLocksForSegment(seg: DocumentRenderSegment): DocumentLockedRange[] {
    const locks = this.GetDocumentLockedRanges();
    return locks.filter(
      (lock) => seg.StartLine <= lock.EndLine && seg.EndLine >= lock.StartLine,
    );
  }

  /**
   * Returns true if `seg` intersects any `<!-- mj-lock -->` section or block lock.
   */
  public IsSegmentLocked(seg: DocumentRenderSegment): boolean {
    return this.findLocksForSegment(seg).length > 0;
  }

  /**
   * Returns true if the current user can edit `seg` after checking document lock governance rules.
   */
  public CanEditSegment(seg: DocumentRenderSegment): boolean {
    if (!this.CanUserEdit) {
      return false;
    }
    const intersecting = this.findLocksForSegment(seg);
    if (intersecting.length === 0) {
      return true;
    }
    const { actorId, ownerId } = this.getLockActorAndOwnerIds();
    for (const lock of intersecting) {
      if (
        !DocumentLiveBlockEngine.Instance.CanActorEditLockedRange(
          lock,
          actorId,
          ownerId,
          this.HasEditPermission,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private getLockActorAndOwnerIds(): { actorId: string | null; ownerId: string | null } {
    const actorId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerEntry = this.ArtifactPermissionEntries.find((entry) => entry.IsOwner);
    const ownerId =
      ownerEntry?.UserID ??
      this.artifactOwnerUserId ??
      (this.artifactVersion?.ArtifactID
        ? (this.isCurrentUserArtifactOwner ? actorId : null)
        : (this.CanUserShareArtifact || this.HasEditPermission ? actorId : null));
    return { actorId, ownerId };
  }

  public get HasUneditableLockedSegments(): boolean {
    return this.DocumentSegments.some((seg) => this.IsSegmentLocked(seg) && !this.CanEditSegment(seg));
  }

  private findSegmentForBlockId(blockId: string | null | undefined): DocumentRenderSegment | undefined {
    if (!blockId) {
      return undefined;
    }
    return this.DocumentSegments.find(
      (s) => s.SegmentID === blockId || s.Descriptor?.BlockID === blockId,
    );
  }

  private enforceSegmentLock(seg: DocumentRenderSegment | undefined, actionLabel: string): boolean {
    if (!this.CanUserEdit) {
      return false;
    }
    if (seg && !this.CanEditSegment(seg)) {
      this.StatusBannerMessage = `This section is protected by a lock and you cannot ${actionLabel}.`;
      this.cdr.markForCheck();
      return false;
    }
    return true;
  }

  private validateDocumentEditLocks(
    nextMarkdown: string,
  ): { Allowed: boolean; ViolationReason?: string; ViolatedLock?: DocumentLockedRange } {
    const { actorId, ownerId } = this.getLockActorAndOwnerIds();
    const res = DocumentLiveBlockEngine.Instance.ValidateDocumentEditAgainstLocks(
      this.MarkdownContent,
      nextMarkdown,
      actorId,
      ownerId,
      this.HasEditPermission,
    );
    if (!res.Allowed) {
      this.StatusBannerMessage =
        res.ViolationReason || 'This document contains locked sections that cannot be modified.';
      this.cdr.markForCheck();
    }
    return res;
  }

  public CanEditSuggestionTarget(sug: DocumentSuggestionItem): boolean {
    if (!this.CanUserEdit) {
      return false;
    }
    const resolvedBlockId = sug.BlockID || this.resolveDocumentSuggestionBlockId(sug, this.DocumentSegments);
    const targetSeg = resolvedBlockId ? this.findSegmentForBlockId(resolvedBlockId) : undefined;
    if (targetSeg) {
      return this.CanEditSegment(targetSeg);
    }
    return !this.HasUneditableLockedSegments;
  }

  private resolveDocumentSuggestionBlockId(
    sug: DocumentSuggestionItem,
    segments: DocumentRenderSegment[],
  ): string {
    if (sug.BlockID) {
      return sug.BlockID;
    }
    const needle = (sug.OriginalMarkdown || sug.Quote || '').trim();
    if (sug.Heading) {
      const targetHeading = sug.Heading.trim().toLowerCase();
      const headingIdx = segments.findIndex(
        (s) =>
          s.HeadingText &&
          s.HeadingText.trim().toLowerCase() === targetHeading,
      );
      if (headingIdx >= 0) {
        const headingLevel = segments[headingIdx].HeadingLevel ?? 6;
        if (needle) {
          for (let i = headingIdx; i < segments.length; i++) {
            const seg = segments[i];
            if (i > headingIdx && seg.HeadingLevel && seg.HeadingLevel <= headingLevel) {
              break;
            }
            if (seg.RawMarkdown.includes(needle)) {
              return seg.SegmentID;
            }
          }
        }
        return segments[headingIdx].SegmentID;
      }
    }
    if (needle) {
      const matchingSeg = segments.find((s) => s.RawMarkdown.includes(needle));
      if (matchingSeg) {
        return matchingSeg.SegmentID;
      }
    }
    return '';
  }

  public get EffectiveAncestorArtifactIDs(): ReadonlySet<string> {
    const ids = new Set<string>();
    if (this.injectedAncestorArtifactIDs) {
      for (const id of this.injectedAncestorArtifactIDs) {
        if (id && id.trim()) {
          ids.add(id.trim().toLowerCase());
        }
      }
    }
    const hostId = this.artifactVersion?.ArtifactID?.trim().toLowerCase();
    if (hostId) {
      ids.add(hostId);
    }
    return ids;
  }

  public GetEmbeddedArtifactTypeName(block: DocumentBlockSpec | null | undefined): string {
    if (!block) {
      return 'Whiteboard';
    }
    const direct = block.ArtifactType?.trim();
    if (direct) {
      return direct;
    }
    const idKey = block.ArtifactID?.trim().toLowerCase();
    if (idKey) {
      const cached = this.embeddedArtifactTypes.get(idKey);
      if (cached) {
        return cached;
      }
    }
    return 'Whiteboard';
  }

  private renderDocumentPrintableHtml(
    exportMode: DocExportMode = 'clean',
    designConfig: DocumentDesignConfig = this.ActiveDesignConfig,
  ): string {
    const parts: string[] = [];
    const headerTitle = designConfig.RunningHeader || this.getDisplayTitle() || 'Document';
    const watermarkBadge = designConfig.Watermark
      ? `<span class="mj-print-watermark">${EscapeHtml(designConfig.Watermark)}</span>`
      : '';
    parts.push(
      `<header class="mj-print-header"><span>${EscapeHtml(headerTitle)}</span>${watermarkBadge}</header>`,
    );

    const pendingSuggestions =
      exportMode === 'markup' ? this.Suggestions.filter((s) => s.Status === 'Pending') : [];

    for (const seg of this.VisibleDocumentSegments) {
      if (seg.Kind === 'markdown') {
        const raw = seg.RawMarkdown.trim();
        if (!raw) {
          continue;
        }
        const segSug =
          exportMode === 'markup'
            ? pendingSuggestions.find((s) => s.BlockID === seg.SegmentID)
            : undefined;
        if (segSug) {
          const wordDiff = this.GetSuggestionWordDiff(segSug);
          if (wordDiff && wordDiff.Spans.length > 0) {
            const redlineHtml = wordDiff.Spans.map((span) => {
              const safe = EscapeHtml(span.Text);
              if (span.Type === 'delete') return `<del class="mj-print-del">${safe}</del>`;
              if (span.Type === 'insert') return `<ins class="mj-print-ins">${safe}</ins>`;
              return safe;
            }).join('');
            parts.push(
              `<p>${redlineHtml}</p><div class="mj-print-markup-meta">Tracked suggestion by ${EscapeHtml(segSug.AuthorName)}${segSug.Rationale ? ` — ${EscapeHtml(segSug.Rationale)}` : ''}</div>`,
            );
            continue;
          }
        }
        if (seg.BlockKind === 'heading') {
          const level = Math.min(6, Math.max(1, seg.HeadingLevel ?? 1));
          const text = StripDocRecordLinksToPlainText(seg.HeadingText ?? this.GetEditableHeadingText(seg));
          parts.push(`<h${level}>${EscapeHtml(text)}</h${level}>`);
        } else if (seg.BlockKind === 'code') {
          const parsed = this.GetParsedCodeBlock(seg);
          parts.push(`<pre><code>${EscapeHtml(parsed.Code)}</code></pre>`);
        } else if (seg.BlockKind === 'table') {
          const parsed = this.GetParsedTable(seg);
          const th = parsed.Headers.map((h) => `<th>${EscapeHtml(StripDocRecordLinksToPlainText(h))}</th>`).join('');
          const trs = parsed.Rows.map(
            (r) => `<tr>${r.map((c) => `<td>${EscapeHtml(StripDocRecordLinksToPlainText(c))}</td>`).join('')}</tr>`,
          ).join('');
          parts.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
        } else if (seg.BlockKind === 'list') {
          const items = this.GetParsedListItems(seg);
          const isOrdered = Boolean(items[0]?.OrderedPrefix);
          const tag = isOrdered ? 'ol' : 'ul';
          const lis = items
            .map((it) => {
              const plain = EscapeHtml(StripDocRecordLinksToPlainText(it.Text));
              return it.IsTask ? `<li>[${it.Checked ? 'x' : ' '}] ${plain}</li>` : `<li>${plain}</li>`;
            })
            .join('');
          parts.push(`<${tag}>${lis}</${tag}>`);
        } else if (seg.BlockKind === 'callout') {
          const parsed = this.GetParsedCallout(seg);
          parts.push(
            `<blockquote><strong>${EscapeHtml(parsed.CalloutType)}:</strong> ${EscapeHtml(StripDocRecordLinksToPlainText(parsed.BodyText))}</blockquote>`,
          );
        } else {
          parts.push(`<p>${EscapeHtml(StripDocRecordLinksToPlainText(raw)).replace(/\n/g, '<br>')}</p>`);
        }
      } else if (seg.Kind === 'mj-block' && seg.Descriptor) {
        const desc = seg.Descriptor;
        const title = EscapeHtml(desc.Title || desc.EntityName || desc.QueryName || desc.Kind);
        if (desc.Kind === 'Artifact') {
          parts.push(
            `<div class="mj-print-block"><h3>${title}</h3><p>Embedded ${EscapeHtml(this.GetEmbeddedArtifactTypeName(desc))} Artifact</p></div>`,
          );
        } else {
          const res = this.GetBlockExecutionResult(desc);
          const verified = desc.Mode === 'Frozen' ? this.IsSnapshotVerified(desc) : true;
          const badge =
            desc.Mode === 'Frozen'
              ? verified
                ? `<p><em>Frozen snapshot (${EscapeHtml(desc.FrozenSnapshot?.FrozenAt || '')}${desc.FrozenSnapshot?.FrozenByUserName ? ` by ${EscapeHtml(desc.FrozenSnapshot.FrozenByUserName)}` : ''})</em></p>`
                : `<p><em>WARNING: Unverified frozen snapshot — integrity signature missing or invalid.</em></p>`
              : `<p><em>Live MJ Block (${EscapeHtml(desc.Kind)})</em></p>`;
          if (res.Columns.length > 0) {
            const th = res.Columns.map((c) => `<th>${EscapeHtml(c.DisplayName || c.Name)}</th>`).join('');
            const trs = res.Rows.map(
              (r) =>
                `<tr>${res.Columns.map((c) => `<td>${EscapeHtml(String(r[c.Name] ?? ''))}</td>`).join('')}</tr>`,
            ).join('');
            parts.push(
              `<div class="mj-print-block"><h3>${title}</h3>${badge}<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`,
            );
          } else {
            parts.push(`<div class="mj-print-block"><h3>${title}</h3>${badge}</div>`);
          }
        }
      }
    }

    if (exportMode === 'markup') {
      const openThreads = this.AnchoredThreads.filter((t) => t.Status === 'Open' && t.Messages.length > 0);
      if (openThreads.length > 0) {
        const commentCards = openThreads
          .map((t) => {
            const msgs = t.Messages.map(
              (m) => `<div><strong>${EscapeHtml(m.UserName)}:</strong> ${EscapeHtml(m.Message)}</div>`,
            ).join('');
            const quote = t.QuotedText ? `<div><em>"${EscapeHtml(t.QuotedText)}"</em></div>` : '';
            return `<div class="mj-print-comment-card"><div><strong>${EscapeHtml(t.AnchorLabel)}</strong></div>${quote}${msgs}</div>`;
          })
          .join('');
        parts.push(`<section class="mj-print-comments-section"><h3>Review Comments (${openThreads.length})</h3>${commentCards}</section>`);
      }
    }

    if (designConfig.RunningFooter || designConfig.ShowPageNumbers) {
      const footerLeft = EscapeHtml(designConfig.RunningFooter || GetDocumentDesignPreset(designConfig.PresetID).Name);
      const footerRight = designConfig.ShowPageNumbers
        ? `~${this.LiveDocumentStats.EstimatedPages} ${this.LiveDocumentStats.EstimatedPages === 1 ? 'page' : 'pages'}`
        : '';
      parts.push(`<footer class="mj-print-footer"><span>${footerLeft}</span><span>${footerRight}</span></footer>`);
    }

    return parts.join('\n');
  }

  /**
   * Toggles `<!-- mj-lock: owner-only -->` immediately above the specified heading segment.
   */
  public ToggleHeadingLock(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit || seg.BlockKind !== 'heading') {
      return;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? undefined;
    const isOwner =
      this.isCurrentUserArtifactOwner ||
      Boolean(
        userId &&
          this.ArtifactPermissionEntries.some((entry) => entry.IsOwner && UUIDsEqual(entry.UserID, userId)),
      );
    const canToggle = this.artifactVersion?.ArtifactID ? isOwner : (isOwner || this.CanUserShareArtifact);
    if (!canToggle) {
      this.StatusBannerMessage = 'Only the artifact owner can toggle section locks.';
      this.cdr.markForCheck();
      return;
    }
    const currentlyLocked = this.IsSegmentLocked(seg);
    const nextMarkdown = DocumentLiveBlockEngine.Instance.ToggleHeadingLockInMarkdown(
      this.MarkdownContent,
      seg.StartLine,
      !currentlyLocked,
      userId,
    );
    if (nextMarkdown !== this.MarkdownContent) {
      this.OnMarkdownChanged(nextMarkdown);
      this.StatusBannerMessage = !currentlyLocked
        ? `Locked section "${seg.HeadingText || 'Heading'}" to owner-only editing.`
        : `Unlocked section "${seg.HeadingText || 'Heading'}".`;
      this.cdr.markForCheck();
    }
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

    const raw = this.resolveUserInfoEngine()?.GetSetting(this.getCollapsedBlocksUserSettingKey());
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
    this.resolveUserInfoEngine()?.SetSettingDebounced(this.getCollapsedBlocksUserSettingKey(), payload);
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
    rows: DocumentBlockExecutionResult['Rows'],
  ): DocumentBlockExecutionResult['Rows'] {
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
  public IsCellRecordLink(col: DocumentBlockColumn, row: DocsBlockRow): boolean {
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
    row: DocsBlockRow,
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
      if (ownerUserId) {
        this.artifactOwnerUserId = ownerUserId;
        this.isCurrentUserArtifactOwner = UUIDsEqual(ownerUserId, user.ID);
      }
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
    const metadataEngine = this.resolveArtifactMetadataEngine();
    const cachedType =
      metadataEngine.FindArtifactType(typeName) ??
      metadataEngine.ArtifactTypes?.find(
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'freeze this block')) {
      return;
    }
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'freeze this block')) {
      return;
    }
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
      this.frozenBlockDriftMap.delete(frozenBlock.BlockID);
      this.OnMarkdownChanged(updatedRes.Markdown);
      this.StatusBannerMessage = `Block "${frozenBlock.Title || frozenBlock.BlockID}" frozen into document snapshot.`;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to freeze live block.');
    }
  }

  /**
   * All Frozen `:::mj-block` descriptors currently present in the document (`NW-1`).
   */
  public get FrozenBlocksInDocument(): DocumentBlockSpec[] {
    const segBlocks = this.DocumentSegments
      .map((s) => s.Descriptor)
      .filter((d): d is DocumentBlockSpec => Boolean(d && d.Mode === 'Frozen'));
    if (segBlocks.length > 0) {
      return segBlocks;
    }
    return DocumentLiveBlockEngine.Instance
      .ParseMarkdownDirectives(this.MarkdownContent)
      .map((seg) => seg.BlockSpec)
      .filter((d): d is DocumentBlockSpec => Boolean(d && d.Mode === 'Frozen'));
  }

  /**
   * Resolves server pre-verified frozen snapshot provenance for a block when provided by host containers (`NW-1`).
   */
  public GetBlockPreVerifiedSnapshot(
    block: DocumentBlockSpec | null | undefined,
  ): PreVerifiedFrozenSnapshotEntry | null {
    if (!block) {
      return null;
    }
    return ResolvePreVerifiedFrozenSnapshotState(this.PreVerifiedFrozenSnapshots, [
      block.BlockID,
      block.ArtifactID,
    ]);
  }

  /**
   * Returns true when a frozen block's `FrozenSnapshot` has a valid verified signature/hash (`Blocker 3`)
   * or was explicitly pre-verified by the server (`NW-1` Guest Share).
   */
  public IsSnapshotVerified(block: DocumentBlockSpec | null | undefined): boolean {
    if (!block) {
      return false;
    }
    const preVerified = ResolvePreVerifiedFrozenSnapshotState(this.PreVerifiedFrozenSnapshots, [
      block.BlockID,
      block.ArtifactID,
    ]);
    if (preVerified !== null) {
      return preVerified.Verified;
    }
    return this.collabService.IsFrozenSnapshotVerified(
      block,
      this.blockResults.get(block.BlockID),
      this.artifactVersion?.ArtifactID,
    );
  }

  /**
   * Compares every frozen block in the document against live query/view output (`NW-1`).
   */
  public async CompareAllFrozenBlocksWithLive(): Promise<void> {
    for (const block of this.FrozenBlocksInDocument) {
      await this.CompareFrozenBlockWithLive(block);
    }
  }

  /**
   * Re-freezes all unlocked frozen blocks in the document with fresh live data + signatures (`NW-1`).
   */
  public async RefreezeAllFrozenBlocks(): Promise<void> {
    let updatedCount = 0;
    let skippedLocked = 0;
    for (const block of this.FrozenBlocksInDocument) {
      const seg = this.findSegmentForBlockId(block.BlockID);
      if (seg && !this.CanEditSegment(seg)) {
        skippedLocked++;
        continue;
      }
      await this.FreezeLiveBlock(block);
      if (this.OpenDriftPanelBlockID === block.BlockID) {
        this.OpenDriftPanelBlockID = null;
      }
      updatedCount++;
    }
    if (skippedLocked > 0 && updatedCount === 0) {
      this.StatusBannerMessage = 'Cannot re-freeze: all frozen blocks are in locked sections.';
    } else if (skippedLocked > 0) {
      this.StatusBannerMessage = `Re-froze ${updatedCount} block(s); ${skippedLocked} locked block(s) skipped.`;
    } else if (updatedCount > 0) {
      this.StatusBannerMessage = `Re-froze ${updatedCount} frozen block(s) from live data.`;
    }
    this.cdr.markForCheck();
  }

  /**
   * Switches all unlocked frozen blocks back to Live mode (`NW-1`).
   */
  public SwitchAllFrozenBlocksToLive(): void {
    let nextMarkdown = this.MarkdownContent;
    let switchedCount = 0;
    let skippedLocked = 0;
    for (const block of this.FrozenBlocksInDocument) {
      const seg = this.findSegmentForBlockId(block.BlockID);
      if (seg && !this.CanEditSegment(seg)) {
        skippedLocked++;
        continue;
      }
      const liveBlock = DocumentLiveBlockEngine.Instance.UnfreezeBlock(block);
      const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
        nextMarkdown,
        liveBlock.BlockID,
        liveBlock,
      );
      nextMarkdown = updatedRes.Markdown;
      this.blockResults.delete(liveBlock.BlockID);
      this.frozenBlockDriftMap.delete(liveBlock.BlockID);
      if (this.OpenDriftPanelBlockID === liveBlock.BlockID) {
        this.OpenDriftPanelBlockID = null;
      }
      switchedCount++;
      void this.RefreshLiveBlock(liveBlock);
    }
    if (switchedCount > 0) {
      this.OnMarkdownChanged(nextMarkdown);
    }
    if (skippedLocked > 0 && switchedCount === 0) {
      this.StatusBannerMessage = 'Cannot switch to Live: all frozen blocks are in locked sections.';
    } else if (skippedLocked > 0) {
      this.StatusBannerMessage = `Switched ${switchedCount} block(s) to Live mode; ${skippedLocked} locked block(s) skipped.`;
    } else if (switchedCount > 0) {
      this.StatusBannerMessage = `Switched ${switchedCount} block(s) back to Live mode.`;
    }
    this.cdr.markForCheck();
  }

  /**
   * Unfreezes a frozen block back to live viewer-scoped execution mode.
   */
  public UnfreezeLiveBlock(block: DocumentBlockSpec): void {
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'switch this block to Live mode')) {
      return;
    }
    const liveBlock = DocumentLiveBlockEngine.Instance.UnfreezeBlock(block);
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      liveBlock.BlockID,
      liveBlock,
    );
    this.blockResults.delete(liveBlock.BlockID);
    this.frozenBlockDriftMap.delete(liveBlock.BlockID);
    if (this.OpenDriftPanelBlockID === liveBlock.BlockID) {
      this.OpenDriftPanelBlockID = null;
    }
    this.OnMarkdownChanged(updatedRes.Markdown);
    void this.RefreshLiveBlock(liveBlock);
    this.StatusBannerMessage = `Block "${liveBlock.Title || liveBlock.BlockID}" switched back to Live mode.`;
  }

  /**
   * Returns cached Live-vs-Frozen drift comparison metrics (`NW-1`).
   */
  public GetFrozenDriftComparison(blockId: string): FrozenBlockDriftComparison | undefined {
    return this.frozenBlockDriftMap.get(blockId);
  }

  /**
   * Executes the frozen block's underlying query/view live under current viewer permissions
   * and compares row-by-row with the stored `FrozenSnapshot` (`NW-1`).
   */
  public async CompareFrozenBlockWithLive(block: DocumentBlockSpec): Promise<void> {
    if (!block?.BlockID) {
      return;
    }
    if (this.OpenDriftPanelBlockID === block.BlockID) {
      this.OpenDriftPanelBlockID = null;
      this.cdr.markForCheck();
      return;
    }

    this.OpenDriftPanelBlockID = block.BlockID;
    const frozenSnapshot = block.FrozenSnapshot;
    if (!frozenSnapshot) {
      this.frozenBlockDriftMap.set(block.BlockID, {
        BlockID: block.BlockID,
        Loading: false,
        ErrorMessage: 'This block has no frozen snapshot to compare.',
        AddedRows: 0,
        RemovedRows: 0,
        ModifiedCells: 0,
        UnchangedRows: 0,
        SampleDiffs: [],
        LiveRowCount: 0,
        FrozenRowCount: 0,
      });
      this.cdr.markForCheck();
      return;
    }

    const currentUser = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    if (!currentUser || !provider) {
      this.frozenBlockDriftMap.set(block.BlockID, {
        BlockID: block.BlockID,
        Loading: false,
        ErrorMessage: 'Metadata provider or user context unavailable for live drift check.',
        AddedRows: 0,
        RemovedRows: 0,
        ModifiedCells: 0,
        UnchangedRows: 0,
        SampleDiffs: [],
        LiveRowCount: 0,
        FrozenRowCount: frozenSnapshot.Rows.length,
      });
      this.cdr.markForCheck();
      return;
    }

    this.frozenBlockDriftMap.set(block.BlockID, {
      BlockID: block.BlockID,
      Loading: true,
      AddedRows: 0,
      RemovedRows: 0,
      ModifiedCells: 0,
      UnchangedRows: 0,
      SampleDiffs: [],
      LiveRowCount: 0,
      FrozenRowCount: frozenSnapshot.Rows.length,
    });
    this.cdr.markForCheck();

    try {
      const liveSpec: DocumentBlockSpec = {
        ...block,
        Mode: 'Live',
      };
      const liveRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(liveSpec, currentUser, provider);
      if (this.isComponentDestroyed) {
        return;
      }
      if (!liveRes.Success) {
        this.frozenBlockDriftMap.set(block.BlockID, {
          BlockID: block.BlockID,
          Loading: false,
          ErrorMessage: liveRes.ErrorMessage || 'Live execution failed during drift comparison.',
          AddedRows: 0,
          RemovedRows: 0,
          ModifiedCells: 0,
          UnchangedRows: 0,
          SampleDiffs: [],
          LiveRowCount: 0,
          FrozenRowCount: frozenSnapshot.Rows.length,
        });
      } else {
        const drift = this.computeFrozenBlockDrift(
          block.BlockID,
          frozenSnapshot.Columns,
          frozenSnapshot.Rows,
          liveRes.Rows,
        );
        this.frozenBlockDriftMap.set(block.BlockID, drift);
      }
    } catch (err) {
      LogError(err);
      this.frozenBlockDriftMap.set(block.BlockID, {
        BlockID: block.BlockID,
        Loading: false,
        ErrorMessage: err instanceof Error ? err.message : 'Failed to compute live-vs-frozen drift.',
        AddedRows: 0,
        RemovedRows: 0,
        ModifiedCells: 0,
        UnchangedRows: 0,
        SampleDiffs: [],
        LiveRowCount: 0,
        FrozenRowCount: frozenSnapshot.Rows.length,
      });
    }
    this.cdr.markForCheck();
  }

  public async RefreezeFrozenBlock(block: DocumentBlockSpec): Promise<void> {
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 're-freeze this snapshot')) {
      return;
    }
    await this.FreezeLiveBlock(block);
    if (this.OpenDriftPanelBlockID === block.BlockID) {
      this.OpenDriftPanelBlockID = null;
      this.cdr.markForCheck();
    }
  }

  private computeFrozenBlockDrift(
    blockId: string,
    columns: DocumentBlockColumn[],
    frozenRows: BlockRecord[],
    liveRows: BlockRecord[],
  ): FrozenBlockDriftComparison {
    const keyField =
      columns.find((c) => c.IsPrimaryKey)?.Name ??
      columns[0]?.Name ??
      '';
    const colNames = columns.map((c) => c.Name);
    const makeRowKey = (row: BlockRecord, idx: number): string => {
      if (keyField && row[keyField] != null && String(row[keyField]).trim().length > 0) {
        return String(row[keyField]);
      }
      return `row-${idx}`;
    };

    const frozenMap = new Map<string, BlockRecord>();
    frozenRows.forEach((r, i) => frozenMap.set(makeRowKey(r, i), r));

    const liveMap = new Map<string, BlockRecord>();
    liveRows.forEach((r, i) => liveMap.set(makeRowKey(r, i), r));

    let addedRows = 0;
    let removedRows = 0;
    let modifiedCells = 0;
    let unchangedRows = 0;
    const sampleDiffs: FrozenBlockDriftComparison['SampleDiffs'] = [];

    for (const [k, liveRow] of liveMap.entries()) {
      const frozenRow = frozenMap.get(k);
      if (!frozenRow) {
        addedRows++;
        if (sampleDiffs.length < 6) {
          sampleDiffs.push({
            Kind: 'added',
            RowLabel: k,
            Summary: 'Added in live data since snapshot was frozen.',
          });
        }
        continue;
      }
      const changedCols: string[] = [];
      const keysToCheck = colNames.length > 0 ? colNames : Object.keys({ ...frozenRow, ...liveRow });
      for (const col of keysToCheck) {
        const prevVal = frozenRow[col] ?? null;
        const nextVal = liveRow[col] ?? null;
        if (String(prevVal ?? '') !== String(nextVal ?? '')) {
          modifiedCells++;
          changedCols.push(`${col}: "${prevVal ?? ''}" -> "${nextVal ?? ''}"`);
        }
      }
      if (changedCols.length > 0) {
        if (sampleDiffs.length < 6) {
          sampleDiffs.push({
            Kind: 'modified',
            RowLabel: k,
            Summary: changedCols.slice(0, 3).join('; '),
          });
        }
      } else {
        unchangedRows++;
      }
    }

    for (const k of frozenMap.keys()) {
      if (!liveMap.has(k)) {
        removedRows++;
        if (sampleDiffs.length < 6) {
          sampleDiffs.push({
            Kind: 'removed',
            RowLabel: k,
            Summary: 'No longer present in live query results.',
          });
        }
      }
    }

    return {
      BlockID: blockId,
      Loading: false,
      CheckedAt: new Date().toLocaleTimeString(),
      AddedRows: addedRows,
      RemovedRows: removedRows,
      ModifiedCells: modifiedCells,
      UnchangedRows: unchangedRows,
      SampleDiffs: sampleDiffs,
      LiveRowCount: liveRows.length,
      FrozenRowCount: frozenRows.length,
    };
  }

  /**
   * Executes a live MJ block under the viewer's permissions and caches the exact execution result.
   */
  public async RefreshLiveBlock(block: DocumentBlockSpec): Promise<void> {
    if (this.isGuestSnapshotMode) {
      return;
    }
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
      const preVerified = this.GetBlockPreVerifiedSnapshot(block);
      const frozenAt = block.FrozenSnapshot.FrozenAt || preVerified?.FrozenAt || '';
      const frozenByUserId = verified ? block.FrozenSnapshot.FrozenByUserID : '';
      const frozenByUserName = verified
        ? block.FrozenSnapshot.FrozenByUserName || preVerified?.FrozenByUserName || ''
        : '';
      return {
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: 'Frozen',
        Success: true,
        Columns: block.FrozenSnapshot.Columns,
        Rows: block.FrozenSnapshot.Rows,
        TotalRowCount: block.FrozenSnapshot.TotalRowCount,
        FrozenMetadata: {
          FrozenAt: frozenAt,
          FrozenByUserID: frozenByUserId,
          FrozenByUserName: frozenByUserName,
          SnapshotVerified: verified,
        },
        FrozenSnapshot: {
          SnapshotVerified: verified,
          FrozenAt: frozenAt,
          FrozenByUserID: frozenByUserId,
          FrozenByUserName: frozenByUserName,
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'toggle inline editing on this embedded artifact')) {
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
    const artifactId = block.ArtifactID?.trim().toLowerCase();
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'update embedded artifact version')) {
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
    if (this.isGuestSnapshotMode) {
      return null;
    }
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

    if (!IsValidUUID(artifactId) || (versionId && !IsValidUUID(versionId))) {
      this.failedEmbeddedVersionMessages.set(
        key,
        `Embedded artifact reference "${artifactId}" is not a valid artifact UUID.`,
      );
      this.cdr.markForCheck();
      return;
    }

    const normalizedArtifactId = artifactId.trim().toLowerCase();
    const ancestors = this.EffectiveAncestorArtifactIDs;
    if (ancestors.has(normalizedArtifactId)) {
      this.failedEmbeddedVersionMessages.set(
        key,
        'Circular artifact embedding blocked: an artifact cannot embed itself or an ancestor.',
      );
      this.cdr.markForCheck();
      return;
    }
    if (ancestors.size >= MJ_MAX_EMBED_DEPTH) {
      this.failedEmbeddedVersionMessages.set(
        key,
        `Embedded artifact nesting depth exceeds maximum (${MJ_MAX_EMBED_DEPTH}).`,
      );
      this.cdr.markForCheck();
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
      const [res, metaRes] = await Promise.all([
        rv.RunView<MJArtifactVersionEntity>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: filter,
            OrderBy: 'VersionNumber DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
          },
          user,
        ),
        this.embeddedArtifactTypes.has(normalizedArtifactId)
          ? Promise.resolve(null)
          : rv.RunView<{ ID: string; Type: string }>(
              {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
                Fields: ['ID', 'Type'],
                MaxRows: 1,
                ResultType: 'simple',
              },
              user,
            ),
      ]);
      const resolvedType = metaRes?.Success ? metaRes.Results?.[0]?.Type : undefined;
      if (resolvedType && resolvedType.trim().length > 0) {
        this.embeddedArtifactTypes.set(normalizedArtifactId, resolvedType.trim());
      }

      const entity = res.Success ? res.Results?.[0] : undefined;
      if (entity) {
        this.embeddedArtifactVersions.set(key, entity);
        if (!versionId && entity.ID) {
          this.embeddedArtifactVersions.set(this.getEmbeddedVersionCacheKey(artifactId, entity.ID), entity);
          this.latestArtifactVersions.set(normalizedArtifactId, entity);
        } else if (versionId && !this.latestArtifactVersions.has(normalizedArtifactId)) {
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
            this.latestArtifactVersions.set(normalizedArtifactId, latestEntity);
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
    const seg = this.findSegmentForBlockId(block.BlockID);
    if (!this.enforceSegmentLock(seg, 'commit embedded artifact edits')) {
      return;
    }
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

  private nextUniqueId(prefix: string): string {
    this.nextLocalIdSeq++;
    return `${prefix}-${Date.now()}-${this.nextLocalIdSeq}`;
  }

  private syncSuggestionToSession(sug: DocumentSuggestionItem): void {
    const canonical = BuildCanonicalDocumentSuggestionRecord(sug, this.artifactVersion?.ArtifactID);
    const serialized = JSON.stringify(canonical);
    UpsertArtifactSuggestionInVersionConfiguration(this.artifactVersion, canonical);
    if (this.isApplyingRemoteSuggestions || !this.session) {
      return;
    }
    this.session.SetSharedSuggestionRaw(sug.SuggestionID, serialized);
  }

  private syncSuggestionsFromSession(): void {
    const rawMap = this.session ? this.session.GetSharedSuggestionsRaw() : new Map<string, string>();
    const configSuggestions = ParseSuggestionsFromConfiguration(
      ReadArtifactVersionConfigurationSafe(this.artifactVersion),
      'document',
    );
    const shouldSeedSession = Boolean(this.session) && rawMap.size === 0 && configSuggestions.length > 0;
    if (rawMap.size === 0 && configSuggestions.length === 0) {
      return;
    }
    this.isApplyingRemoteSuggestions = true;
    try {
      const byId = new Map<string, DocumentSuggestionItem>(
        this.Suggestions.map((s) => [s.SuggestionID, s]),
      );
      let changed = false;
      for (const [id, jsonStr] of rawMap.entries()) {
        const parsed = NormalizeDocumentSuggestion(jsonStr, id);
        if (!parsed) {
          continue;
        }
        if (!parsed.BlockID) {
          parsed.BlockID = this.resolveDocumentSuggestionBlockId(parsed, this.DocumentSegments);
        }
        const existing = byId.get(id);
        if (!existing) {
          byId.set(id, parsed);
          changed = true;
        } else if (
          existing.Status !== parsed.Status ||
          existing.ProposedMarkdown !== parsed.ProposedMarkdown ||
          existing.OriginalMarkdown !== parsed.OriginalMarkdown ||
          existing.BlockID !== parsed.BlockID
        ) {
          byId.set(id, parsed);
          changed = true;
        }
      }
      for (const cfgItem of configSuggestions) {
        if (rawMap.has(cfgItem.SuggestionID)) {
          continue;
        }
        const parsed = NormalizeDocumentSuggestion(cfgItem, cfgItem.SuggestionID);
        if (!parsed) {
          continue;
        }
        if (!parsed.BlockID) {
          parsed.BlockID = this.resolveDocumentSuggestionBlockId(parsed, this.DocumentSegments);
        }
        if (shouldSeedSession && this.session) {
          this.session.SetSharedSuggestionRaw(cfgItem.SuggestionID, JSON.stringify(cfgItem));
        }
        const existing = byId.get(parsed.SuggestionID);
        if (!existing || existing.Status !== parsed.Status) {
          byId.set(parsed.SuggestionID, parsed);
          changed = true;
        }
      }
      if (changed) {
        this.Suggestions = Array.from(byId.values()).sort((a, b) =>
          (b.CreatedAt || '').localeCompare(a.CreatedAt || ''),
        );
        this.cdr.markForCheck();
      }
    } finally {
      this.isApplyingRemoteSuggestions = false;
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
      this.syncSuggestionToSession(existing);
      this.cdr.markForCheck();
      return existing;
    }

    const item: DocumentSuggestionItem = {
      SuggestionID: this.nextUniqueId('sug'),
      BlockID: blockId,
      AuthorName: authorName,
      CreatedAt: new Date().toISOString(),
      OriginalMarkdown: originalMarkdown,
      ProposedMarkdown: proposedMarkdown,
      Rationale: rationale,
      Status: 'Pending',
    };
    this.Suggestions = [item, ...this.Suggestions];
    this.syncSuggestionToSession(item);
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
      const nextParts = segments.map((s) => (s.SegmentID === targetSeg.SegmentID ? replacementMarkdown : s.RawMarkdown));
      const nextMd =
        replacementMarkdown.trim().length === 0
          ? nextParts.filter((part) => part.trim().length > 0).join('\n\n')
          : nextParts.join('\n\n');
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
    let lockBlockedCount = 0;

    for (const sug of pending) {
      if (!this.CanEditSuggestionTarget(sug)) {
        lockBlockedCount++;
        continue;
      }
      const applied = this.applySuggestionReplacement(
        sug.BlockID || this.resolveDocumentSuggestionBlockId(sug, workingSegments),
        sug.OriginalMarkdown,
        sug.ProposedMarkdown,
        workingSegments,
        nextMd,
      );
      if (applied.matched) {
        const lockCheck = this.validateDocumentEditLocks(applied.markdown);
        if (!lockCheck.Allowed) {
          lockBlockedCount++;
          continue;
        }
        sug.Status = 'Accepted';
        this.syncSuggestionToSession(sug);
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
    if (lockBlockedCount > 0) {
      this.notifyError(
        `${lockBlockedCount} suggestion${lockBlockedCount === 1 ? '' : 's'} target${lockBlockedCount === 1 ? 's' : ''} a locked section and cannot be committed.`,
      );
    } else if (conflictCount > 0) {
      this.notifyError(
        `Conflict: ${conflictCount} suggestion${conflictCount === 1 ? ' could' : 's could'} not be applied because the target block changed.`,
      );
    } else if (acceptedCount > 0) {
      this.StatusBannerMessage = `Committed ${acceptedCount} tracked suggestion${acceptedCount === 1 ? '' : 's'}.`;
    }
    return acceptedCount;
  }

  public OpenSuggestionModalForSegment(seg: DocumentRenderSegment): void {
    if (!this.enforceSegmentLock(seg, 'propose a suggestion')) {
      return;
    }
    this.SetViewMode('suggest');
    this.SelectedAnchorKey = seg.SegmentID;
    this.SelectedAnchorLabel = seg.HeadingText ?? seg.SegmentID;
    this.StatusBannerMessage = 'Suggest Mode active — edit the selected block to propose your suggestion.';
    this.cdr.markForCheck();
    queueMicrotask(() => {
      if (this.isComponentDestroyed || typeof document === 'undefined') {
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
    if (!this.CanEditSuggestionTarget(sug)) {
      this.StatusBannerMessage = 'This section is protected by a lock and this suggestion hunk cannot be accepted.';
      this.cdr.markForCheck();
      return;
    }
    const applied = this.applySuggestionReplacement(
      sug.BlockID || this.resolveDocumentSuggestionBlockId(sug, this.DocumentSegments),
      sug.OriginalMarkdown,
      hunk.AcceptedMarkdown,
      this.DocumentSegments,
      this.MarkdownContent,
    );
    if (!applied.matched) {
      this.notifyError('Conflict: the target block changed and no longer matches this suggestion hunk.');
      return;
    }
    if (!this.validateDocumentEditLocks(applied.markdown).Allowed) {
      return;
    }

    this.OnMarkdownChanged(applied.markdown);
    sug.OriginalMarkdown = hunk.AcceptedMarkdown;
    if (sug.OriginalMarkdown.trim() === sug.ProposedMarkdown.trim()) {
      sug.Status = 'Accepted';
    }
    this.syncSuggestionToSession(sug);
    this.StatusBannerMessage = `Accepted word edit (${hunk.Kind}).`;
    this.cdr.markForCheck();
  }

  /**
   * Rejects a single word/phrase hunk within a suggestion card while preserving any other pending word edits
   * in the same paragraph.
   */
  public RejectSuggestionHunk(sug: DocumentSuggestionItem, hunk: DocumentWordChangeHunk): void {
    if (!this.CanEditSuggestionTarget(sug)) {
      this.StatusBannerMessage = 'This section is protected by a lock and this suggestion hunk cannot be rejected.';
      this.cdr.markForCheck();
      return;
    }
    sug.ProposedMarkdown = hunk.RejectedProposedMarkdown;
    if (sug.OriginalMarkdown.trim() === sug.ProposedMarkdown.trim()) {
      sug.Status = 'Rejected';
    }
    this.syncSuggestionToSession(sug);
    this.StatusBannerMessage = `Rejected word edit (${hunk.Kind}).`;
    this.cdr.markForCheck();
  }

  /**
   * Accepts a pending Suggestion Card and applies its proposed Markdown to the matching target block.
   */
  public AcceptSuggestion(sug: DocumentSuggestionItem): void {
    if (!this.CanEditSuggestionTarget(sug)) {
      this.StatusBannerMessage = 'This section is protected by a lock and this suggestion cannot be accepted.';
      this.cdr.markForCheck();
      return;
    }
    const applied = this.applySuggestionReplacement(
      sug.BlockID || this.resolveDocumentSuggestionBlockId(sug, this.DocumentSegments),
      sug.OriginalMarkdown,
      sug.ProposedMarkdown,
      this.DocumentSegments,
      this.MarkdownContent,
    );
    if (!applied.matched) {
      this.notifyError('Conflict: the target block changed and no longer matches the original text.');
      return;
    }
    if (!this.validateDocumentEditLocks(applied.markdown).Allowed) {
      return;
    }
    sug.Status = 'Accepted';
    this.syncSuggestionToSession(sug);
    this.OnMarkdownChanged(applied.markdown);
    this.StatusBannerMessage = `Accepted suggestion from ${sug.AuthorName}.`;
  }

  /**
   * Rejects a pending Suggestion Card without altering the document.
   */
  public RejectSuggestion(sug: DocumentSuggestionItem): void {
    if (!this.CanEditSuggestionTarget(sug)) {
      this.StatusBannerMessage = 'This section is protected by a lock and this suggestion cannot be rejected.';
      this.cdr.markForCheck();
      return;
    }
    sug.Status = 'Rejected';
    this.syncSuggestionToSession(sug);
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
        DetailID: this.nextUniqueId('msg-agent'),
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
        if (!this.CanEditSegment(targetSeg)) {
          thread.Messages.push({
            DetailID: this.nextUniqueId('msg-agent'),
            UserName: normalizedAuthor,
            Role: 'Agent',
            Message: trimmedReply || 'Target section is locked; edit could not be applied directly.',
            CreatedAt: nowIso,
            Mentions: [],
          });
          this.StatusBannerMessage = 'Target section is locked and cannot be edited directly.';
          this.cdr.detectChanges();
          return;
        }
        const nextSegmentMarkdown = this.spliceQuoteReplacementInSegment(
          targetSeg.RawMarkdown,
          effectiveAnchorQuote,
          response.proposedMarkdown!,
        );
        this.ReplaceSegmentMarkdown(targetSeg, nextSegmentMarkdown);
      }
      if (trimmedReply) {
        thread.Messages.push({
          DetailID: this.nextUniqueId('msg-agent'),
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
        DetailID: this.nextUniqueId('msg-agent'),
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
    if (!message || this.IsPostingComment) {
      return;
    }

    this.IsPostingComment = true;
    this.cdr.markForCheck();
    try {
      const user = this.getSafeCurrentUser();
      const mentions = ExtractAnchoredCommentMentions(message);
      const selectedQuote = this.SelectedAnchorQuote.trim();
      const nowIso = new Date().toISOString();
      const newThread: DocumentAnchoredThread = {
        ConversationID: this.nextUniqueId('conv'),
        AnchorKey: this.SelectedAnchorKey,
        AnchorLabel: this.SelectedAnchorLabel,
        QuotedText: selectedQuote,
        Status: 'Open',
        AgentMode: this.NewCommentAgentMode,
        CreatedAt: nowIso,
        Messages: [
          {
            DetailID: this.nextUniqueId('msg'),
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
        await this.dispatchThreadMention(newThread, mentions[0], message, selectedQuote || undefined);
      }
    } finally {
      this.IsPostingComment = false;
      this.cdr.markForCheck();
    }
  }

  public GetThreadReplyDraft(conversationId: string): string {
    return this.threadReplyDrafts.get(conversationId) ?? '';
  }

  public SetThreadReplyDraft(conversationId: string, value: string): void {
    this.threadReplyDrafts.set(conversationId, value ?? '');
  }

  public async ReplyToAnchoredThread(
    thread: DocumentAnchoredThread,
    explicitText?: string,
  ): Promise<void> {
    const convId = thread.ConversationID;
    if (!convId || this.ReplyingThreadIds.has(convId)) {
      return;
    }
    const rawDraft = explicitText !== undefined ? explicitText : this.GetThreadReplyDraft(convId);
    const message = rawDraft.trim();
    if (!message) {
      return;
    }

    const user = this.getSafeCurrentUser();
    const provider = this.getSafeProvider();
    const mentions = ExtractAnchoredCommentMentions(message);
    const nowIso = new Date().toISOString();
    let detailId = this.nextUniqueId('msg');

    this.ReplyingThreadIds.add(convId);
    this.threadReplyDrafts.set(convId, '');
    this.cdr.markForCheck();

    try {
      const artifactId = this.artifactVersion?.ArtifactID;
      if (artifactId && provider && user && !convId.startsWith('conv-')) {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', user);
        detail.NewRecord();
        detail.ConversationID = convId;
        detail.UserID = user.ID;
        detail.Role = 'User';
        detail.Message = message;
        const ok = await detail.Save();
        if (!ok) {
          this.threadReplyDrafts.set(convId, rawDraft);
          const msg = detail.LatestResult?.Message || 'Failed to save thread reply.';
          LogError(msg);
          this.notifyError(msg);
          return;
        }
        if (detail.ID) {
          detailId = detail.ID;
        }
      }

      thread.Messages.push({
        DetailID: detailId,
        UserName: user?.Name || 'Current User',
        Role: 'User',
        Message: message,
        CreatedAt: nowIso,
        Mentions: mentions,
      });
      this.StatusBannerMessage = 'Replied to comment thread.';
      this.cdr.markForCheck();

      if (artifactId && mentions.length > 0) {
        await this.dispatchThreadMention(thread, mentions[0], message, thread.QuotedText || undefined);
      }
    } catch (err) {
      this.threadReplyDrafts.set(convId, rawDraft);
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to post thread reply.');
    } finally {
      this.ReplyingThreadIds.delete(convId);
      this.cdr.markForCheck();
    }
  }

  private async dispatchThreadMention(
    thread: DocumentAnchoredThread,
    firstHandle: string,
    message: string,
    quotedText?: string,
  ): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    const provider = this.getSafeProvider();
    const markdownBeforeMention = this.MarkdownContent;
    const serverMention = await this.collabService.DispatchAnchoredCommentAgentMention(
      artifactId,
      firstHandle,
      thread.AgentMode,
      message,
      quotedText,
      provider,
      thread.ConversationID || undefined,
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
            ? `Failed to run @${firstHandle} in ${thread.AgentMode} mode.`
            : `@${firstHandle} did not return a reply.`);
      this.notifyError(errStatus);
      this.StatusBannerMessage = errStatus;
      this.cdr.detectChanges();
      return;
    }
    if (thread.AgentMode === 'edit' && !updatedContent) {
      thread.Messages.push({
        DetailID: this.nextUniqueId('msg-agent'),
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
    this.DispatchAgentCommentMention(thread, firstHandle, {
      replyMessage,
      proposedMarkdown: updatedContent,
      appliedOnServer: thread.AgentMode === 'edit' && Boolean(updatedContent),
      anchorQuote: quotedText,
      markdownBeforeMention,
      versionNumber: serverMention.VersionNumber,
    });
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
        this.cdr.markForCheck();
      }
    } catch (err) {
      thread.Status = previousStatus;
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to update comment resolution status.');
      this.cdr.markForCheck();
    }
  }

  public GetThreadCountForAnchor(anchorKey: string): number {
    return this.AnchoredThreads.filter((t) => t.AnchorKey === anchorKey && t.Status === 'Open').length;
  }

  public FocusAnchorBlock(anchorKey: string): void {
    this.FocusSegmentByAnchorKey(anchorKey);
  }

  public SelectOutlineItem(item: DocumentOutlineItem): void {
    this.SelectedAnchorKey = item.ID;
    this.SelectedAnchorLabel = item.Title;
    if (this.session) {
      this.session.SetActiveBlock(item.ID);
    }
    const seg = this.DocumentSegments.find((s) => UUIDsEqual(s.SegmentID, item.ID));
    if (seg) {
      this.scrollToSegmentElement(seg);
    }
    this.SelectionChanged.emit({
      domain: 'document',
      heading: item.Kind === 'heading' ? item.Title : seg?.HeadingText,
      blockId: seg?.Descriptor?.BlockID ?? item.ID,
    });
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
    if (!this.CanUserEdit) {
      return;
    }
    let baseText = this.initialLoadedMarkdown;
    if (this.DiffBaseLabel.startsWith('v')) {
      const verNum = Number(this.DiffBaseLabel.slice(1));
      const snap = this.SavedVersionSnapshots.find((s) => s.VersionNumber === verNum);
      if (snap) {
        baseText = snap.Content;
      }
    }
    const lockCheck = this.validateDocumentEditLocks(baseText);
    if (!lockCheck.Allowed) {
      return;
    }
    this.OnMarkdownChanged(baseText);
    this.RecomputeDiff();
    this.StatusBannerMessage = 'Restored selected version content into working document.';
  }

  public get HasUnsavedChanges(): boolean {
    if (this.hasUncommittedDomInput) {
      return true;
    }
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
    this.FlushPendingEdits();
    if (!this.CanUserEdit || this.IsSavingVersion || !this.HasUnsavedChanges) {
      return;
    }
    this.IsSavingVersion = true;
    this.cdr.markForCheck();
    let awaitingSocketSaveAck = false;
    try {
      const hadPendingBefore = this.PendingSuggestionsCount;
      const committedSuggestionsCount = this.CommitPendingSuggestions();
      if (hadPendingBefore > 0 && this.PendingSuggestionsCount > 0) {
        return;
      }

      const { Policy, CapturedThumbnailDataUrl } = await CaptureThumbnailForDriverIfAllowed(
        'MarkdownArtifactViewerPlugin',
        this.resolveCaptureRootElement(),
        null,
        this.getSafeProvider(),
      );

      const sentViaSocket = this.session?.RequestSaveVersion(CapturedThumbnailDataUrl) ?? false;
      if (sentViaSocket) {
        awaitingSocketSaveAck = true;
        this.clearPendingSocketSaveTimeout();
        this.pendingSocketSaveTimeout = setTimeout(() => {
          this.pendingSocketSaveTimeout = null;
          if (!this.isComponentDestroyed && this.IsSavingVersion) {
            this.IsSavingVersion = false;
            this.notifyError('Timed out waiting for collaborative save confirmation.');
            this.cdr.markForCheck();
          }
        }, 15_000);
        this.StatusBannerMessage = 'Saving collaborative document version…';
        return;
      }

      const artifactId = this.artifactVersion?.ArtifactID;
      let savedVersionNumber: number;
      if (artifactId) {
        const persisted = await this.persistDocumentVersionToProvider(
          artifactId,
          this.MarkdownContent,
          CapturedThumbnailDataUrl,
          Policy,
        );
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
      if (!awaitingSocketSaveAck) {
        this.IsSavingVersion = false;
      }
      this.cdr.markForCheck();
    }
  }

  private clearPendingSocketSaveTimeout(): void {
    if (this.pendingSocketSaveTimeout !== null) {
      clearTimeout(this.pendingSocketSaveTimeout);
      this.pendingSocketSaveTimeout = null;
    }
  }

  protected override resolveCaptureRootElement(): HTMLElement | null {
    const el = this.captureHostElementRef?.nativeElement;
    if (!el) return null;
    return (
      el.querySelector<HTMLElement>('.mj-docs-page') ??
      el.querySelector<HTMLElement>('.mj-docs-canvas') ??
      el
    );
  }

  private async persistDocumentVersionToProvider(
    artifactId: string,
    content: string,
    capturedThumbnailDataUrl?: string | null,
    policy?: ArtifactTypeThumbnailPolicy,
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
      capturedThumbnailDataUrl,
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
        ReadArtifactVersionConfigurationSafe(this.artifactVersion),
        content,
        'MarkdownArtifactViewerPlugin',
        ver.Name,
        {
          Policy: policy,
          CapturedThumbnailDataUrl: capturedThumbnailDataUrl,
        },
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

  public get ActiveDesignConfig(): DocumentDesignConfig {
    return ExtractDocumentDesignConfig(this.MarkdownContent);
  }

  public IsDesignPresetActive(presetId: DocumentDesignPresetID): boolean {
    return this.ActiveDesignConfig.PresetID === presetId;
  }

  public get ActiveDesignPreset(): DocumentDesignPreset {
    return GetDocumentDesignPreset(this.ActiveDesignConfig.PresetID);
  }

  public get LiveDocumentStats(): DocumentStats {
    return ComputeDocumentStats(this.MarkdownContent);
  }

  public get PrimaryStatsLabel(): string {
    const stats = this.LiveDocumentStats;
    if (this.StatsMetricMode === 'chars') {
      return `${stats.CharCount.toLocaleString()} chars`;
    }
    if (this.StatsMetricMode === 'charsNoSpaces') {
      return `${stats.CharCountNoSpaces.toLocaleString()} chars (no spaces)`;
    }
    return `${stats.WordCount.toLocaleString()} ${stats.WordCount === 1 ? 'word' : 'words'}`;
  }

  public CycleStatsMetric(): void {
    const order: DocsStatsMetricMode[] = ['words', 'chars', 'charsNoSpaces'];
    const idx = order.indexOf(this.StatsMetricMode);
    this.StatsMetricMode = order[(idx + 1) % order.length];
    this.writeToolbarVisibility({ StatsMetric: this.StatsMetricMode });
    this.cdr.markForCheck();
  }

  public ToggleDesignPopover(): void {
    this.ShowDesignPopover = !this.ShowDesignPopover;
    if (this.ShowDesignPopover) {
      this.CloseMoreToolsMenu();
    }
    this.cdr.markForCheck();
  }

  public TogglePageLayoutMode(): void {
    this.SetPageLayoutMode(this.PageLayoutMode === 'paginated' ? 'continuous' : 'paginated');
  }

  public SetPageLayoutMode(mode: DocsPageLayoutMode): void {
    this.PageLayoutMode = mode;
    this.writeToolbarVisibility({ PageLayoutMode: mode });
    this.cdr.markForCheck();
  }

  public ApplyDesignPreset(presetId: DocumentDesignPresetID): void {
    if (!this.CanUserEdit) {
      return;
    }
    const preset = GetDocumentDesignPreset(presetId);
    this.UpdateDesignConfig({
      PresetID: preset.ID,
      PageSize: preset.DefaultPageSize,
    });
    this.StatusBannerMessage = `Applied "${preset.Name}" document design preset.`;
  }

  public UpdateDesignConfig(patch: Partial<DocumentDesignConfig>): void {
    if (!this.CanUserEdit) {
      return;
    }
    this.FlushPendingEdits();
    const updated = ApplyDocumentDesignConfigToMarkdown(this.MarkdownContent, patch);
    if (updated !== this.MarkdownContent) {
      this.OnMarkdownChanged(updated);
    }
    this.cdr.markForCheck();
  }

  public OnDesignWatermarkChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.UpdateDesignConfig({ Watermark: (input?.value ?? '').trim().slice(0, 64) });
  }

  public OnDesignHeaderChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.UpdateDesignConfig({ RunningHeader: (input?.value ?? '').trim().slice(0, 140) });
  }

  public OpenExportDialog(initialFormat: 'docx' | 'pdf' | 'md' = 'docx'): void {
    this.FlushPendingEdits();
    this.CloseMoreToolsMenu();
    this.ShowDesignPopover = false;
    const design = this.ActiveDesignConfig;
    this.ExportDialogFormat = initialFormat;
    this.ExportDialogPageSize = design.PageSize;
    this.ExportDialogOrientation = design.Orientation;
    this.ExportDialogMode =
      this.PendingSuggestionsCount > 0 || this.OpenThreadsCount > 0 ? 'markup' : 'clean';
    this.RefreshExportPreflight();
    this.cdr.detectChanges();

    const dialog = this.ExportDialogRef?.nativeElement;
    if (dialog) {
      this.ensureExportDialogLightDismissFallback(dialog);
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    }
  }

  public CloseExportDialog(): void {
    const dialog = this.ExportDialogRef?.nativeElement;
    if (dialog?.open) {
      dialog.close('cancel');
    }
  }

  public OnExportDialogClosed(): void {
    const dialog = this.ExportDialogRef?.nativeElement;
    if (dialog) {
      // Reset returnValue per modern-web-guidance dialog best practices so stale values never leak
      dialog.returnValue = '';
    }
    this.cdr.markForCheck();
  }

  private ensureExportDialogLightDismissFallback(dialog: HTMLDialogElement): void {
    if (this.exportDialogFallbackBound || typeof HTMLDialogElement === 'undefined') {
      return;
    }
    this.exportDialogFallbackBound = true;
    // Safari fallback for <dialog closedby="any"> using pointerdown + pointerup bounding-rect check
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent): boolean => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e) && dialog.open) {
          dialog.close('backdrop');
        }
      });
    }
  }

  public SetExportDialogFormat(format: 'docx' | 'pdf' | 'md'): void {
    this.ExportDialogFormat = format;
    this.RefreshExportPreflight();
    this.cdr.markForCheck();
  }

  public SetExportDialogMode(mode: DocExportMode): void {
    this.ExportDialogMode = mode;
    this.RefreshExportPreflight();
    this.cdr.markForCheck();
  }

  public RefreshExportPreflight(): void {
    this.ExportPreflightReport = this.importExportService.RunExportPreflight(this.MarkdownContent, {
      LiveBlockResults: this.blockResults,
      VerifyFrozenSnapshot: (block) => this.IsSnapshotVerified(block),
      Suggestions: this.Suggestions,
      AnchoredThreads: this.AnchoredThreads,
      Orientation: this.ExportDialogOrientation,
      Strict: this.ExportStrictPreflight,
    });
  }

  public async ConfirmExportFromDialog(): Promise<void> {
    if (this.IsRunningExport) {
      return;
    }
    this.RefreshExportPreflight();
    if (this.ExportStrictPreflight && (this.ExportPreflightReport?.ErrorCount ?? 0) > 0) {
      return;
    }
    this.IsRunningExport = true;
    this.cdr.markForCheck();
    try {
      const designOverride: Partial<DocumentDesignConfig> = {
        PageSize: this.ExportDialogPageSize,
        Orientation: this.ExportDialogOrientation,
      };
      if (this.ExportDialogFormat === 'md') {
        this.OnExportMarkdown();
      } else if (this.ExportDialogFormat === 'pdf') {
        await this.ExportPDF(this.ExportDialogOrientation, this.ExportDialogMode, designOverride);
        this.StatusBannerMessage = `Prepared ${this.ExportDialogMode === 'markup' ? 'Markup ' : ''}PDF print view (${this.ExportDialogPageSize.toUpperCase()} ${this.ExportDialogOrientation}).`;
      } else {
        await this.OnExportDocx({
          ExportMode: this.ExportDialogMode,
          DesignConfig: designOverride,
          EmbedLiveBlockMetadata: this.ExportEmbedLiveMetadata,
          Strict: this.ExportStrictPreflight,
        });
      }
      this.CloseExportDialog();
    } catch (err) {
      LogError(err);
      this.notifyError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.IsRunningExport = false;
      this.cdr.markForCheck();
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
    if (!this.CanUserEdit) {
      if (input) {
        input.value = '';
      }
      return;
    }
    try {
      const lowerName = file.name.toLowerCase();
      let importedMd: string;
      if (lowerName.endsWith('.docx')) {
        const importRes = await this.importExportService.ImportDocxFileWithReport(file);
        importedMd = importRes.Markdown;
        const lockCheck = this.validateDocumentEditLocks(importedMd);
        if (!lockCheck.Allowed) {
          return;
        }
        this.OnMarkdownChanged(importedMd);
        if (importRes.ImportedSuggestions.length > 0) {
          const existingIds = new Set(this.Suggestions.map((s) => s.SuggestionID));
          const merged = [
            ...this.Suggestions,
            ...importRes.ImportedSuggestions.filter((s) => !existingIds.has(s.SuggestionID)),
          ];
          this.Suggestions = merged;
        }
        if (importRes.ImportedComments.length > 0) {
          const existingIds = new Set(this.AnchoredThreads.map((t) => t.ConversationID));
          this.AnchoredThreads = [
            ...this.AnchoredThreads,
            ...importRes.ImportedComments.filter((t) => !existingIds.has(t.ConversationID)),
          ];
        }
        this.LastImportFidelityReport = importRes.Report;
        this.StatusBannerMessage = '';
        this.cdr.markForCheck();
        return;
      } else {
        importedMd = await this.importExportService.ImportMarkdown(file);
        this.LastImportFidelityReport = null;
      }
      const lockCheck = this.validateDocumentEditLocks(importedMd);
      if (!lockCheck.Allowed) {
        return;
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
    this.FlushPendingEdits();
    const baseTitle = (this.getDisplayTitle() || 'document').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const exportableMarkdown = StripDocRecordLinksToPlainText(this.MarkdownContent);
    this.importExportService.DownloadMarkdownFile(exportableMarkdown, `${baseTitle}.md`);
    this.StatusBannerMessage = `Exported ${baseTitle}.md`;
  }

  public async OnExportDocx(overrides?: {
    ExportMode?: DocExportMode;
    DesignConfig?: Partial<DocumentDesignConfig>;
    EmbedLiveBlockMetadata?: boolean;
    Strict?: boolean;
  }): Promise<void> {
    this.FlushPendingEdits();
    const title = this.getDisplayTitle() || 'Document';
    const baseTitle = title.replace(/[^a-zA-Z0-9_-]+/g, '-');
    const mode = overrides?.ExportMode ?? 'clean';
    await this.importExportService.DownloadDocxFile(
      this.MarkdownContent,
      `${baseTitle}.docx`,
      title,
      {
        LiveBlockResults: this.blockResults,
        VerifyFrozenSnapshot: (block) => this.IsSnapshotVerified(block),
        ExportMode: mode,
        Suggestions: mode === 'markup' ? this.Suggestions : [],
        AnchoredThreads: mode === 'markup' ? this.AnchoredThreads : [],
        DesignConfig: overrides?.DesignConfig ?? this.ActiveDesignConfig,
        EmbedLiveBlockMetadata: overrides?.EmbedLiveBlockMetadata ?? true,
        Strict: overrides?.Strict ?? false,
      },
    );
    this.StatusBannerMessage = `Exported ${baseTitle}.docx (${mode === 'markup' ? 'with Track Changes & Comments' : 'Clean Final'}).`;
  }

  public OnCopy(): void {
    this.FlushPendingEdits();
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

  public FormatCellValue(value: DocsBlockCellValue): string {
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
    this.docLinkAccessEpoch++;
    this.docLinkAccessCache.clear();
    this.docLinkAccessPending.clear();
    this.docLinkAccessQueue.clear();
    this.docLinksByKeySignature.clear();
    this.editableSafeHtmlCache.clear();
    this.docLinkAccessFlushScheduled = false;
    this.ShowDocLinkMenu = false;
    this.DocLinkSuggestions = [];
    this.activeDocLinkSegmentID = null;
    this.activeDocLinkQuery = '';
    this.activeDocLinkElement = null;
    this.AnchoredThreads = [];

    const hasPersistedArtifact = Boolean(this.artifactVersion?.ArtifactID);
    if (hasPersistedArtifact) {
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.artifactOwnerUserId = null;
      this.isCurrentUserArtifactOwner = false;
      this.CurrentUserEffectiveRoleLabel = 'Viewer';
    } else {
      this.HasEditPermission = !this.readonly;
      this.CanUserShareArtifact = false;
      this.artifactOwnerUserId = null;
      this.isCurrentUserArtifactOwner = false;
      this.CurrentUserEffectiveRoleLabel = this.readonly ? 'Viewer' : 'Editor';
    }

    this.loadCollapsedStateFromUserSettings();
    if (!this.userExplicitlySelectedMode && this.SyncViewMode === undefined) {
      this.ViewMode = 'preview';
    } else if (!this.CanUserEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
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
    if (!this.userExplicitlySelectedMode && this.SyncViewMode !== undefined) {
      this.onViewerViewModeChanged(this.SyncViewMode);
    }
    if (this.NavigationAnchor) {
      this.onNavigationAnchorChanged(this.NavigationAnchor);
    }
    if (!this.isGuestSnapshotMode) {
      void this.evaluatePermissionsAndLoadThreads(gen);
    }
  }

  private refreshParsedStructure(): void {
    const previousSegments = this.DocumentSegments;
    const nextSegments = this.collabService.ParseDocumentSegments(this.MarkdownContent);
    this.DocumentSegments = nextSegments;
    this.reconcileSuggestionsAndAnchorsAcrossSegments(previousSegments, nextSegments);
    this.OutlineItems = this.collabService.ExtractOutline(this.MarkdownContent);
    this.WordStats = this.collabService.ComputeWordStats(this.MarkdownContent);
    const parsedFrontmatter = ParseDocumentFrontmatter(this.MarkdownContent);
    this.frontmatterEndLine = parsedFrontmatter.HasFrontmatter ? parsedFrontmatter.EndLine : 0;
    this.FrontmatterHeader = ParseMarkdownFrontmatterHeader(this.MarkdownContent);
    const docLinks = ExtractDocRecordLinks(this.MarkdownContent);
    if (docLinks.length > 0) {
      this.queueDocRecordLinkAccessChecks(docLinks);
    }
    for (const seg of this.DocumentSegments) {
      if (seg.Kind === 'mj-block' && seg.Descriptor) {
        if (this.isGuestSnapshotMode) {
          continue;
        }
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

  private isPositionalSegmentId(id: string): boolean {
    return /^(heading|paragraph|callout|code|table|list|seg)-\d+/.test(id);
  }

  /**
   * Keeps positional Suggestion Card targets and anchored comment keys aligned when blocks are
   * inserted or deleted above them (`NW-3`).
   */
  private reconcileSuggestionsAndAnchorsAcrossSegments(
    previousSegments: DocumentRenderSegment[],
    nextSegments: DocumentRenderSegment[],
  ): void {
    if (previousSegments.length === 0 || nextSegments.length === 0) {
      return;
    }

    const nextById = new Map(nextSegments.map((s) => [s.SegmentID, s]));
    const prevById = new Map(previousSegments.map((s) => [s.SegmentID, s]));

    for (const sug of this.Suggestions) {
      if (sug.Status !== 'Pending' || !this.isPositionalSegmentId(sug.BlockID)) {
        continue;
      }
      const currentAtOldId = nextById.get(sug.BlockID);
      const origTrimmed = sug.OriginalMarkdown.trim();
      if (currentAtOldId && currentAtOldId.RawMarkdown.trim() === origTrimmed) {
        continue;
      }
      const matchingTargets = nextSegments.filter((s) => s.RawMarkdown.trim() === origTrimmed);
      if (matchingTargets.length === 1 && matchingTargets[0].SegmentID !== sug.BlockID) {
        sug.BlockID = matchingTargets[0].SegmentID;
        this.syncSuggestionToSession(sug);
      } else if (matchingTargets.length > 1) {
        const oldIdx = previousSegments.findIndex((s) => s.SegmentID === sug.BlockID);
        let best = matchingTargets[0];
        let bestDist = Infinity;
        for (const candidate of matchingTargets) {
          const nextIdx = nextSegments.findIndex((s) => s.SegmentID === candidate.SegmentID);
          const dist = oldIdx >= 0 ? Math.abs(nextIdx - oldIdx) : nextIdx;
          if (dist < bestDist) {
            bestDist = dist;
            best = candidate;
          }
        }
        if (best.SegmentID !== sug.BlockID) {
          sug.BlockID = best.SegmentID;
          this.syncSuggestionToSession(sug);
        }
      }
    }

    for (const thread of this.AnchoredThreads) {
      if (!this.isPositionalSegmentId(thread.AnchorKey)) {
        continue;
      }
      const prevSeg = prevById.get(thread.AnchorKey);
      if (!prevSeg) {
        continue;
      }
      const prevTrimmed = prevSeg.RawMarkdown.trim();
      const currentAtOldKey = nextById.get(thread.AnchorKey);
      if (currentAtOldKey && currentAtOldKey.RawMarkdown.trim() === prevTrimmed) {
        continue;
      }
      const matches = nextSegments.filter((s) => s.RawMarkdown.trim() === prevTrimmed);
      if (matches.length === 1 && matches[0].SegmentID !== thread.AnchorKey) {
        thread.AnchorKey = matches[0].SegmentID;
        if (matches[0].HeadingText) {
          thread.AnchorLabel = matches[0].HeadingText;
        }
      }
    }
  }

  private async verifyFrozenBlockOnServer(block: DocumentBlockSpec): Promise<void> {
    if (this.isGuestSnapshotMode) {
      return;
    }
    const provider = this.getSafeProvider();
    if (!provider || !this.collabService.HasCollaborationBackend(provider)) {
      return;
    }
    await this.collabService.VerifyFrozenSnapshotOnServer(
      block,
      this.artifactVersion?.ArtifactID ?? '',
      provider,
    );
    if (!this.isComponentDestroyed) {
      this.cdr.markForCheck();
    }
  }

  private setupCollaborationSession(): void {
    this.destroyCollaborationSession();
    const artifactId = this.artifactVersion?.ArtifactID || this.artifactVersion?.ID || 'local-doc';
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    const hasRemoteBackend =
      !this.isGuestSnapshotMode &&
      this.collabService.HasCollaborationBackend(provider, this.CollaborationWsUrl);

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
        if (this.hasUncommittedDomInput) {
          this.FlushPendingEdits();
        }
        const effectiveContent = this.session?.GetContent() ?? remoteContent;
        if (effectiveContent !== this.MarkdownContent) {
          this.OnMarkdownChanged(effectiveContent, true);
        }
      }),
      this.session.StatusChanged$.subscribe((status) => {
        this.CollaborationStatus = status;
        if (status === 'revoked') {
          this.HasEditPermission = false;
          this.IsSavingVersion = false;
          this.clearPendingSocketSaveTimeout();
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        } else if (status === 'readonly' && !this.session?.CanEdit) {
          this.IsSavingVersion = false;
          this.clearPendingSocketSaveTimeout();
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        } else if (status === 'error' || status === 'disconnected') {
          if (this.IsSavingVersion && this.pendingSocketSaveTimeout !== null) {
            this.IsSavingVersion = false;
            this.clearPendingSocketSaveTimeout();
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
        this.clearPendingSocketSaveTimeout();
        this.IsSavingVersion = false;
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
      this.session.SuggestionsChanged$.subscribe(() => {
        if (!this.isComponentDestroyed) {
          this.syncSuggestionsFromSession();
        }
      }),
      this.session.RoomResetConflict$.subscribe((draft) => {
        if (this.isComponentDestroyed) {
          return;
        }
        this.PendingResetConflictDraft = draft;
        this.cdr.markForCheck();
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

    this.PendingResetConflictDraft = this.session.PendingResetConflictDraft;
    this.syncSuggestionsFromSession();

    if (hasRemoteBackend) {
      void this.session.Connect(this.CollaborationWsUrl, provider);
    }

    this.Collaborators = this.session.GetCollaborators();
  }

  public ApplyResetConflictDraft(): void {
    const draft = this.PendingResetConflictDraft;
    if (!draft || !this.CanUserEdit) {
      return;
    }
    const lockCheck = this.validateDocumentEditLocks(draft.LocalDraft);
    if (!lockCheck.Allowed) {
      return;
    }
    if (this.session?.ApplyResetConflictDraft()) {
      const next = this.session.GetContent();
      this.OnMarkdownChanged(next, true);
    } else {
      this.OnMarkdownChanged(draft.LocalDraft);
    }
    this.PendingResetConflictDraft = null;
    this.StatusBannerMessage = 'Re-applied recovered local edits onto the reset room.';
    this.cdr.markForCheck();
  }

  public DismissResetConflictDraft(): void {
    this.session?.DismissResetConflictDraft();
    this.PendingResetConflictDraft = null;
    this.StatusBannerMessage = 'Dismissed conflict draft and kept the latest server version.';
    this.cdr.markForCheck();
  }

  private destroyCollaborationSession(): void {
    this.clearPendingSocketSaveTimeout();
    this.IsSavingVersion = false;
    this.PendingResetConflictDraft = null;
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
    if (this.isGuestSnapshotMode) {
      this.AccessRevoked = false;
      this.PermissionVerifyError = false;
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.CurrentUserEffectiveRoleLabel = 'Viewer';
      this.session?.SetCanEdit(false);
      this.cdr.markForCheck();
      return;
    }
    const artifactId = this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.HasEditPermission = false;
      this.CanUserShareArtifact = false;
      this.artifactOwnerUserId = null;
      this.isCurrentUserArtifactOwner = false;
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
        this.artifactOwnerUserId = null;
        this.isCurrentUserArtifactOwner = false;
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
        this.artifactOwnerUserId = null;
        this.isCurrentUserArtifactOwner = false;
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
      if (!(await this.resolveOwnerFromPermissions(artifactId, perms, user, provider, gen))) {
        return;
      }
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
          if (!this.userExplicitlySelectedMode && this.SyncViewMode !== undefined) {
            this.onViewerViewModeChanged(this.SyncViewMode);
          }
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
      this.artifactOwnerUserId = null;
      this.isCurrentUserArtifactOwner = false;
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
            this.artifactOwnerUserId = null;
            this.isCurrentUserArtifactOwner = false;
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
          if (!(await this.resolveOwnerFromPermissions(artifactId, updated, user, provider, gen))) {
            return;
          }
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
              if (!this.userExplicitlySelectedMode && this.SyncViewMode !== undefined) {
                this.onViewerViewModeChanged(this.SyncViewMode);
              }
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

  private async resolveOwnerFromPermissions(
    artifactId: string,
    perms: { Source?: string | null; CanRead: boolean },
    user: UserInfo,
    provider: IMetadataProvider,
    gen: number,
  ): Promise<boolean> {
    if (perms.Source === 'Owner') {
      this.artifactOwnerUserId = user.ID;
      this.isCurrentUserArtifactOwner = true;
      return true;
    }
    if (perms.CanRead) {
      await this.resolveArtifactOwnerFromProvider(artifactId, user, provider, gen);
      return !this.isComponentDestroyed && gen === this.sessionInitGeneration;
    }
    this.artifactOwnerUserId = null;
    this.isCurrentUserArtifactOwner = false;
    return true;
  }

  private async resolveArtifactOwnerFromProvider(
    artifactId: string,
    user: UserInfo,
    provider: IMetadataProvider,
    gen: number,
  ): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const artRes = await rv.RunView<{ ID: string; UserID?: string | null }>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
          Fields: ['ID', 'UserID'],
          MaxRows: 1,
          ResultType: 'simple',
        },
        user,
      );
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      const ownerUserId = artRes.Success ? (artRes.Results?.[0]?.UserID ?? null) : null;
      this.artifactOwnerUserId = ownerUserId;
      this.isCurrentUserArtifactOwner = Boolean(ownerUserId && UUIDsEqual(ownerUserId, user.ID));
    } catch {
      // Leave null/false on query failure so non-owners never elevate to owner privileges
      this.artifactOwnerUserId = null;
      this.isCurrentUserArtifactOwner = false;
    }
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
          await conv.Delete().catch(() => false);
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

  // =========================================================================
  // Right-Click Context Menu (Zones 2a–2d)
  // =========================================================================

  public OnDocsSegmentContextMenu(event: MouseEvent, seg: DocumentRenderSegment): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    const targetEl = event.target instanceof Element ? event.target : null;
    if (targetEl?.closest('select') != null) {
      return;
    }
    this.CaptureSelectionSnapshot();
    event.preventDefault();
    event.stopPropagation();

    this.openSegmentContextMenuAt(event.clientX, event.clientY, targetEl, seg);
  }

  private openSegmentContextMenuAt(
    anchorX: number,
    anchorY: number,
    targetEl: Element | null,
    seg: DocumentRenderSegment,
  ): void {
    const activeEl =
      targetEl instanceof HTMLElement
        ? targetEl
        : (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null);

    if (seg.Kind === 'mj-block' && seg.Descriptor) {
      if (seg.Descriptor.Kind === 'Artifact') {
        const block = seg.Descriptor;
        const newerVer = this.GetNewerEmbeddedArtifactVersion(block);
        this.openDocsContextMenuForTarget(
          anchorX,
          anchorY,
          seg,
          {
            Kind: 'embedded-artifact',
            Segment: seg,
            Block: block,
            IsCollapsed: this.IsBlockCollapsed(block),
            IsInlineEditing: this.IsInlineEditingBlock(block.BlockID),
            CanInlineEdit: this.CanInlineEditEmbeddedArtifact(block),
            IsFullScreen: this.ExpandedOleBlockID === block.BlockID,
            NewerVersionNumber: newerVer?.VersionNumber ?? null,
          },
          'Embedded artifact actions',
          activeEl,
        );
        return;
      }

      const block = seg.Descriptor;
      const execResult = this.GetBlockExecutionResult(block);
      const recordLinkEl = targetEl?.closest<HTMLElement>('[data-record-col]') ?? null;
      let recordLinkContext: DocsLiveRecordLinkContext | undefined;
      if (recordLinkEl) {
        const colName = recordLinkEl.getAttribute('data-record-col') ?? '';
        const rawRowIdx = recordLinkEl.getAttribute('data-record-row-idx');
        const rowIdx = rawRowIdx ? Number.parseInt(rawRowIdx, 10) : -1;
        const matchedCol = execResult.Columns.find((c) => c.Name === colName);
        if (colName && rowIdx >= 0) {
          recordLinkContext = {
            ColumnName: colName,
            TargetEntityName: matchedCol?.TargetEntityName || block.EntityName || 'Record',
            RowIndex: rowIdx,
          };
        }
      }
      this.openDocsContextMenuForTarget(
        anchorX,
        anchorY,
        seg,
        {
          Kind: 'live-block',
          Segment: seg,
          Block: block,
          HasResultRows: execResult.Rows.length > 0,
          IsCollapsed: this.IsBlockCollapsed(block),
          RecordLinkContext: recordLinkContext,
        },
        'Live data block actions',
        activeEl,
      );
      return;
    }

    if (!this.IsInteractiveCanvasMode) {
      if (seg.BlockKind === 'table') {
        const cellEl = targetEl?.closest<HTMLTableCellElement>('th, td') ?? null;
        const parsed = this.GetParsedTable(seg);
        let rowIndex = 0;
        let colIndex = 0;
        let isHeaderRow = true;
        if (cellEl) {
          colIndex = Math.max(
            0,
            Math.min(parsed.Headers.length - 1, cellEl.cellIndex >= 0 ? cellEl.cellIndex : 0),
          );
          isHeaderRow = cellEl.tagName === 'TH' || cellEl.closest('thead') !== null;
          if (!isHeaderRow) {
            const tr = cellEl.closest('tr');
            const tbody = tr?.closest('tbody');
            if (tr && tbody) {
              const foundIdx = Array.from(tbody.querySelectorAll('tr')).indexOf(tr);
              rowIndex = foundIdx >= 0 ? foundIdx : 0;
            }
          }
        }
        const cellText = isHeaderRow
          ? (parsed.Headers[colIndex] ?? '')
          : (parsed.Rows[rowIndex]?.[colIndex] ?? '');
        this.openDocsContextMenuForTarget(
          anchorX,
          anchorY,
          seg,
          {
            Kind: 'table',
            Segment: seg,
            RowIndex: rowIndex,
            ColIndex: colIndex,
            IsHeaderRow: isHeaderRow,
            TableHeadersCount: parsed.Headers.length,
            TableBodyRowCount: parsed.Rows.length,
            ColumnAlignment: parsed.Alignments[colIndex] ?? 'none',
            CellText: cellText,
          },
          'Table actions',
          activeEl,
        );
        return;
      }

      const anchorEl = targetEl?.closest<HTMLAnchorElement>('a[href]') ?? null;
      const rawHref = anchorEl?.getAttribute('href') ?? null;
      const linkUrl = rawHref && rawHref !== 'javascript:void(0)' ? rawHref : null;
      const imgEl = targetEl?.closest<HTMLImageElement>('img[src]') ?? null;
      const imageUrl = imgEl?.getAttribute('src') ?? null;
      const isInsidePre = targetEl?.closest('pre') !== null;
      const isInsideTable = targetEl?.closest('table') !== null;

      this.openDocsContextMenuForTarget(
        anchorX,
        anchorY,
        seg,
        {
          Kind: 'preview-prose',
          Segment: seg,
          LinkUrl: linkUrl,
          ImageUrl: imageUrl,
          IsInsidePre: isInsidePre,
          IsInsideTable: isInsideTable,
        },
        'Reader block actions',
        activeEl,
      );
      return;
    }

    if (seg.BlockKind === 'table') {
      const parsed = this.GetParsedTable(seg);
      const colIndex = Math.max(
        0,
        Math.min(parsed.Headers.length - 1, this.lastFocusedTableCell?.colIndex ?? 0),
      );
      const isHeaderRow = this.lastFocusedTableCell?.isHeader ?? true;
      const rowIndex = isHeaderRow
        ? 0
        : Math.max(0, Math.min(Math.max(0, parsed.Rows.length - 1), this.lastFocusedTableCell?.rowIndex ?? 0));
      const cellText = isHeaderRow
        ? (parsed.Headers[colIndex] ?? '')
        : (parsed.Rows[rowIndex]?.[colIndex] ?? '');
      this.openDocsContextMenuForTarget(
        anchorX,
        anchorY,
        seg,
        {
          Kind: 'table',
          Segment: seg,
          RowIndex: rowIndex,
          ColIndex: colIndex,
          IsHeaderRow: isHeaderRow,
          TableHeadersCount: parsed.Headers.length,
          TableBodyRowCount: parsed.Rows.length,
          ColumnAlignment: parsed.Alignments[colIndex] ?? 'none',
          CellText: cellText,
        },
        'Table actions',
        activeEl,
      );
      return;
    }

    const listItems = seg.BlockKind === 'list' ? this.GetParsedListItems(seg) : [];
    const currentListKind: 'bullet' | 'ordered' | 'task' | undefined =
      seg.BlockKind === 'list'
        ? listItems.some((i) => i.IsTask)
          ? 'task'
          : listItems.some((i) => Boolean(i.OrderedPrefix))
            ? 'ordered'
            : 'bullet'
        : undefined;
    const currentCalloutType: DocsCalloutType | undefined =
      seg.BlockKind === 'callout' ? this.GetParsedCallout(seg).CalloutType : undefined;
    const hasCodeContent =
      seg.BlockKind === 'code' ? this.GetParsedCodeBlock(seg).Code.trim().length > 0 : undefined;

    this.openDocsContextMenuForTarget(
      anchorX,
      anchorY,
      seg,
      {
        Kind: 'prose',
        Segment: seg,
        CurrentCalloutType: currentCalloutType,
        CurrentListKind: currentListKind,
        HasCodeContent: hasCodeContent,
      },
      'Block actions',
      activeEl,
    );
  }

  public OnDocsTableCellContextMenu(
    event: MouseEvent,
    seg: DocumentRenderSegment,
    rowIndex: number,
    colIndex: number,
    isHeaderRow: boolean,
  ): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    this.lastFocusedSegmentId = seg.SegmentID;
    this.lastFocusedTableCell = { rowIndex, colIndex, isHeader: isHeaderRow };
    this.CaptureSelectionSnapshot();
    event.preventDefault();
    event.stopPropagation();

    const parsed = this.GetParsedTable(seg);
    const cellText = isHeaderRow
      ? (parsed.Headers[colIndex] ?? '')
      : (parsed.Rows[rowIndex]?.[colIndex] ?? '');
    const activeEl = event.target instanceof HTMLElement ? event.target : null;

    this.openDocsContextMenuForTarget(
      event.clientX,
      event.clientY,
      seg,
      {
        Kind: 'table',
        Segment: seg,
        RowIndex: rowIndex,
        ColIndex: colIndex,
        IsHeaderRow: isHeaderRow,
        TableHeadersCount: parsed.Headers.length,
        TableBodyRowCount: parsed.Rows.length,
        ColumnAlignment: parsed.Alignments[colIndex] ?? 'none',
        CellText: cellText,
      },
      'Table cell actions',
      activeEl,
    );
  }

  public OnDocsOutlineContextMenu(event: MouseEvent, item: DocumentOutlineItem): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const segIdx = this.DocumentSegments.findIndex((s) => UUIDsEqual(s.SegmentID, item.ID));
    const targetSeg = segIdx >= 0 ? this.DocumentSegments[segIdx] : null;
    const activeEl = event.target instanceof HTMLElement ? event.target : null;

    this.openDocsContextMenuForTarget(
      event.clientX,
      event.clientY,
      targetSeg,
      {
        Kind: 'outline-item',
        OutlineItem: item,
        TargetSegment: targetSeg,
        TargetSegmentIndex: segIdx,
      },
      'Outline item actions',
      activeEl,
    );
  }

  public OnDocsSuggestionContextMenu(event: MouseEvent, sug: DocumentSuggestionItem): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const targetSeg = this.DocumentSegments.find((s) => s.SegmentID === sug.BlockID) ?? null;
    const activeEl = event.target instanceof HTMLElement ? event.target : null;

    this.openDocsContextMenuForTarget(
      event.clientX,
      event.clientY,
      targetSeg,
      {
        Kind: 'suggestion-card',
        Suggestion: sug,
      },
      'Suggestion actions',
      activeEl,
    );
  }

  public OpenCommandPalette(): void {
    this.CloseMoreToolsMenu();
    this.ShowCommandPalette = true;
    this.cdr.markForCheck();
  }

  public get DocsCommandPaletteItems(): ArtifactCommandPaletteItem[] {
    const items: ArtifactCommandPaletteItem[] = [
      {
        Id: 'mode:preview',
        Label: 'Switch to Read Mode',
        Category: 'Mode',
        Icon: 'fa-eye',
        Active: this.ViewMode === 'preview',
      },
      {
        Id: 'mode:edit',
        Label: 'Switch to Write Mode',
        Category: 'Mode',
        Icon: 'fa-pen-to-square',
        Active: this.ViewMode === 'edit',
        Disabled: !this.CanUserEdit,
      },
    ];
    for (const item of this.ResolvedToolbarItems) {
      if (item.Visible) {
        items.push({
          Id: `tb:${item.Key}`,
          Label: item.MenuLabel,
          Category: item.Category,
          Icon: item.Icon,
          Description: item.Description,
          Active: item.Active,
        });
      }
    }
    for (const preset of this.AvailableDesignPresets) {
      items.push({
        Id: `design:${preset.ID}`,
        Label: `Apply Design Preset: ${preset.Name}`,
        Category: 'Design',
        Icon: 'fa-palette',
        Description: preset.Description,
        Active: this.IsDesignPresetActive(preset.ID),
        Disabled: !this.CanUserEdit,
      });
    }
    items.push({
      Id: 'toggle:page-layout',
      Label: this.PageLayoutMode === 'paginated' ? 'Switch to Continuous Scroll View' : 'Switch to Paginated Sheet View',
      Category: 'View',
      Icon: 'fa-file-lines',
      Active: this.PageLayoutMode === 'paginated',
    });
    items.push({
      Id: 'export:studio',
      Label: 'Open Export & Preflight Studio (.docx / PDF / Clean vs. Markup)',
      Category: 'File',
      Icon: 'fa-arrow-up-from-bracket',
    });
    if (this.CanUserEdit) {
      items.push({
        Id: 'import',
        Label: 'Import .docx or .md...',
        Category: 'File',
        Icon: 'fa-file-import',
      });
    }
    return items;
  }

  public ExecuteDocsPaletteCommand(commandId: string): void {
    if (commandId === 'mode:preview') {
      this.SetViewMode('preview');
      return;
    }
    if (commandId === 'mode:edit') {
      this.SetViewMode('edit');
      return;
    }
    if (commandId === 'toggle:page-layout') {
      this.TogglePageLayoutMode();
      return;
    }
    if (commandId === 'export:studio') {
      this.OpenExportDialog('docx');
      return;
    }
    if (commandId.startsWith('design:')) {
      const presetId = commandId.slice(7) as DocumentDesignPresetID;
      this.ApplyDesignPreset(presetId);
      return;
    }
    if (commandId === 'import') {
      this.TriggerFileImport();
      return;
    }
    if (commandId.startsWith('tb:')) {
      const key = commandId.slice(3) as DocsToolbarItemKey;
      const found = this.ResolvedToolbarItems.find((i) => i.Key === key);
      if (found) {
        this.ExecuteToolbarItem(found, false);
      }
    }
  }

  public OnDocsWorkspaceKeydown(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      this.OpenCommandPalette();
      return;
    }
    if (!IsKeyboardContextMenuShortcut(event) || IsNativeContextMenuTarget(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.CaptureSelectionSnapshot();

    const activeEl =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : event.target instanceof HTMLElement
          ? event.target
          : null;

    const anchorPoint = activeEl
      ? ComputeElementContextMenuAnchor(activeEl)
      : { X: 40, Y: 80 };

    const sugEl = activeEl?.closest<HTMLElement>('[data-suggestion-id]') ?? null;
    if (sugEl) {
      const sugId = sugEl.getAttribute('data-suggestion-id');
      const sug = this.Suggestions.find((s) => s.SuggestionID === sugId);
      if (sug) {
        this.openDocsContextMenuForTarget(
          anchorPoint.X,
          anchorPoint.Y,
          this.DocumentSegments.find((s) => s.SegmentID === sug.BlockID) ?? null,
          { Kind: 'suggestion-card', Suggestion: sug },
          'Suggestion actions',
          activeEl,
        );
        return;
      }
    }

    const outlineEl = activeEl?.closest<HTMLElement>('[data-outline-id]') ?? null;
    if (outlineEl) {
      const outlineId = outlineEl.getAttribute('data-outline-id');
      const outlineItem = this.OutlineItems.find((o) => UUIDsEqual(o.ID, outlineId));
      if (outlineItem) {
        const segIdx = this.DocumentSegments.findIndex((s) => UUIDsEqual(s.SegmentID, outlineItem.ID));
        const seg = segIdx >= 0 ? this.DocumentSegments[segIdx] : null;
        this.openDocsContextMenuForTarget(
          anchorPoint.X,
          anchorPoint.Y,
          seg,
          {
            Kind: 'outline-item',
            OutlineItem: outlineItem,
            TargetSegment: seg,
            TargetSegmentIndex: segIdx,
          },
          'Outline item actions',
          activeEl,
        );
        return;
      }
    }

    const segEl = activeEl?.closest<HTMLElement>('[data-segment-id]') ?? null;
    const segId =
      segEl?.getAttribute('data-segment-id') ??
      this.lastFocusedSegmentId ??
      (this.SelectedAnchorKey !== 'doc-root' ? this.SelectedAnchorKey : null);
    const seg =
      (segId ? this.DocumentSegments.find((s) => s.SegmentID === segId) : undefined) ??
      this.DocumentSegments[0];
    if (!seg) {
      return;
    }

    this.openSegmentContextMenuAt(anchorPoint.X, anchorPoint.Y, activeEl, seg);
  }

  public OnDocsPointerDown(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerDown(event);
  }

  public OnDocsPointerMove(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerMove(event);
  }

  public OnDocsPointerUp(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerUp(event);
  }

  public OnDocsPointerCancel(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerCancel(event);
  }

  public OnDocsClickCapture(event: Event): void {
    if (this.ShowDocLinkMenu && typeof Element !== 'undefined' && event.target instanceof Element) {
      const insideDropdown = Boolean(event.target.closest('[data-testid="doc-link-autocomplete-dropdown"]'));
      const insideActiveBlock = Boolean(this.activeDocLinkElement && this.activeDocLinkElement.contains(event.target));
      if (!insideDropdown && !insideActiveBlock) {
        this.CloseDocLinkMenu();
      }
    }
    if (this.touchMenuMonitor.ConsumeSuppressedClick()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private onTouchLongPressContextMenu(trigger: TouchContextMenuTrigger): void {
    if (IsNativeContextMenuTarget(trigger.Target)) {
      return;
    }
    const targetEl = trigger.Target instanceof Element ? trigger.Target : null;
    const segEl = targetEl?.closest<HTMLElement>('[data-segment-id]') ?? null;
    const segId = segEl?.getAttribute('data-segment-id');
    const seg = segId ? this.DocumentSegments.find((s) => s.SegmentID === segId) : undefined;
    if (!seg) {
      return;
    }
    if (seg.Kind === 'mj-block' && seg.Descriptor?.Kind === 'Artifact' && this.IsInlineEditingBlock(seg.Descriptor.BlockID)) {
      return;
    }
    const openMenu = (): void => {
      this.CaptureSelectionSnapshot();
      this.openSegmentContextMenuAt(trigger.AnchorX, trigger.AnchorY, targetEl, seg);
    };
    if (this.ngZone) {
      this.ngZone.run(openMenu);
    } else {
      openMenu();
    }
  }

  private openDocsContextMenuForTarget(
    anchorX: number,
    anchorY: number,
    seg: DocumentRenderSegment | null,
    target: DocsContextTarget,
    ariaLabel: string,
    restoreFocusEl: HTMLElement | null,
  ): void {
    if (seg) {
      this.SelectedAnchorKey = seg.SegmentID;
      this.lastFocusedSegmentId = seg.SegmentID;
    }

    const selectedText = this.resolveContextMenuSelectedText(seg);
    this.contextMenuSelectionText = selectedText;
    this.contextMenuSelectionSnapshot = this.lastSelectionSnapshot ? { ...this.lastSelectionSnapshot } : null;

    const segIndex = seg
      ? this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID)
      : -1;
    const snapshot: DocsContextMenuSnapshot = {
      ViewMode: this.ViewMode,
      CanUserEdit: this.CanUserEdit,
      CanUserShareArtifact: this.CanUserShareArtifact,
      IsArtifactOwner: this.artifactVersion?.ArtifactID ? this.isCurrentUserArtifactOwner : this.CanUserShareArtifact,
      IsSimpleNoteMode: this.IsSimpleNoteMode,
      IsAiAssistantEnabled: this.IsAiAssistantEnabled,
      CommentsEnabled: true,
      SegmentCount: this.DocumentSegments.length,
      SegmentIndex: segIndex,
      SegmentEditable: seg ? this.CanEditSegment(seg) : this.CanUserEdit,
      IsSegmentLocked: seg ? this.IsSegmentLocked(seg) : false,
      IsHeadingCollapsed: seg ? this.IsHeadingCollapsed(seg) : false,
      SelectedText: selectedText,
      Target: target,
    };

    this.ContextMenuItems = BuildDocsContextMenu(snapshot);
    this.ContextMenuX = anchorX;
    this.ContextMenuY = anchorY;
    this.ContextMenuAriaLabel = ariaLabel;
    this.ContextMenuRestoreFocusEl = restoreFocusEl;
    this.ContextMenuOpen = this.ContextMenuItems.length > 0;
    this.cdr.markForCheck();
  }

  private resolveContextMenuSelectedText(seg: DocumentRenderSegment | null): string {
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const selText = window.getSelection()?.toString() ?? '';
      if (selText.length > 0) {
        return selText;
      }
    }
    if (
      seg &&
      this.lastSelectionSnapshot?.segmentId === seg.SegmentID &&
      this.lastSelectionSnapshot.end > this.lastSelectionSnapshot.start
    ) {
      const el = this.findEditableElementForSegment(seg, {
        listItemIndex: this.lastSelectionSnapshot.listItemIndex,
        tableRowIndex: this.lastSelectionSnapshot.tableRowIndex,
        tableColIndex: this.lastSelectionSnapshot.tableColIndex,
        isTableHeader: this.lastSelectionSnapshot.isTableHeader,
      });
      const sourceText =
        el?.textContent ?? this.resolveSegmentSubElementContext(seg, this.lastSelectionSnapshot).text;
      return sourceText.slice(this.lastSelectionSnapshot.start, this.lastSelectionSnapshot.end);
    }
    return '';
  }

  public CloseDocsContextMenu(): void {
    if (!this.ContextMenuOpen) {
      return;
    }
    this.ContextMenuOpen = false;
    this.cdr.markForCheck();
  }

  public OnDocsContextMenuCommand(cmd: DocsContextMenuCommand): void {
    this.CloseDocsContextMenu();

    switch (cmd.Type) {
      case 'clipboard': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (!seg) return;
        if (cmd.Action === 'cut') {
          this.CutDocsSelectionOrBlock(seg);
        } else if (cmd.Action === 'copy-rich') {
          this.CopyDocsSelectionOrBlock(seg, 'rich');
        } else if (cmd.Action === 'copy-markdown') {
          this.CopyDocsSelectionOrBlock(seg, 'markdown');
        } else if (cmd.Action === 'copy-code') {
          this.CopyCodeBlockText(seg);
        } else {
          this.PasteIntoDocsSegment(seg);
        }
        return;
      }
      case 'format-text': {
        this.SelectedAnchorKey = cmd.SegmentID;
        this.lastFocusedSegmentId = cmd.SegmentID;
        if (this.contextMenuSelectionSnapshot?.segmentId === cmd.SegmentID) {
          this.lastSelectionSnapshot = { ...this.contextMenuSelectionSnapshot };
        }
        const pair = this.getFormatPrefixSuffix(cmd.Format);
        this.InsertFormattingSnippet(
          pair.prefix,
          pair.suffix,
          Boolean(this.contextMenuSelectionSnapshot?.segmentId === cmd.SegmentID),
        );
        return;
      }
      case 'turn-into': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.ConvertSegmentBlockType(seg, cmd.Target);
        }
        return;
      }
      case 'callout-style': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.UpdateCalloutType(seg, cmd.CalloutType);
        }
        return;
      }
      case 'insert-block': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (!seg) return;
        if (cmd.Placement === 'above') {
          this.InsertParagraphAboveSegment(seg);
        } else if (cmd.Placement === 'below') {
          this.InsertParagraphBelowSegment(seg);
        } else {
          this.OpenSlashMenuForSegment(seg);
        }
        return;
      }
      case 'duplicate-block': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.DuplicateSegment(seg);
        }
        return;
      }
      case 'move-block': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.MoveSegment(seg, cmd.Direction);
        }
        return;
      }
      case 'delete-block': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.DeleteSegment(seg);
        }
        return;
      }
      case 'toggle-heading-collapse': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.ToggleHeadingCollapse(seg);
        }
        return;
      }
      case 'toggle-heading-lock': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.ToggleHeadingLock(seg);
        }
        return;
      }
      case 'add-comment': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.OpenAnchorCommentForSegment(seg, cmd.SelectedText ?? this.contextMenuSelectionText);
        }
        return;
      }
      case 'propose-suggestion': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.OpenSuggestionModalForSegment(seg);
        }
        return;
      }
      case 'ask-ai': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.OpenAskAiAssistant(seg);
        }
        return;
      }
      case 'table-insert-row': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.InsertTableRowAt(seg, cmd.RowIndex, cmd.Placement, cmd.IsHeaderRow);
        }
        return;
      }
      case 'table-delete-row': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.DeleteTableRowAt(seg, cmd.RowIndex);
        }
        return;
      }
      case 'table-insert-col': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.InsertTableColumnAt(seg, cmd.ColIndex, cmd.Placement);
        }
        return;
      }
      case 'table-delete-col': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.DeleteTableColumnAt(seg, cmd.ColIndex);
        }
        return;
      }
      case 'table-align-col': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.SetTableColumnAlignment(seg, cmd.ColIndex, cmd.Alignment);
        }
        return;
      }
      case 'table-sort-col': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.SortTableByColumn(seg, cmd.ColIndex, cmd.Direction);
        }
        return;
      }
      case 'table-copy-cell': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          const parsed = this.GetParsedTable(seg);
          const cellText = cmd.IsHeaderRow
            ? (parsed.Headers[cmd.ColIndex] ?? '')
            : (parsed.Rows[cmd.RowIndex]?.[cmd.ColIndex] ?? '');
          this.writeClipboardText(cellText, 'Copied cell text to clipboard.');
        }
        return;
      }
      case 'table-copy-as': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.CopyTableAs(seg, cmd.Format);
        }
        return;
      }
      case 'live-block-refresh': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          void this.RefreshLiveBlock(block);
        }
        return;
      }
      case 'live-block-configure': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.OpenConfigureBlockModal(block);
        }
        return;
      }
      case 'live-block-open-record': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          const execResult = this.GetBlockExecutionResult(block);
          const rows = this.GetPaginatedBlockRows(block, execResult.Rows);
          const col = execResult.Columns.find((c) => c.Name === cmd.ColumnName);
          const row = rows[cmd.RowIndex];
          if (col && row) {
            this.OnBlockRecordCellClick(block, col, row);
          }
        }
        return;
      }
      case 'live-block-toggle-freeze': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          if (cmd.Action === 'freeze') {
            this.PromptFreezeBlock(block);
          } else {
            this.UnfreezeLiveBlock(block);
          }
        }
        return;
      }
      case 'live-block-copy-csv': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.CopyLiveBlockResultAsCsv(block);
        }
        return;
      }
      case 'live-block-copy-json': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.CopyBlockDirectiveJson(block);
        }
        return;
      }
      case 'live-block-toggle-collapse': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.ToggleBlockCollapsed(block);
        }
        return;
      }
      case 'ole-toggle-inline-edit': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.ToggleInlineArtifactEdit(block);
        }
        return;
      }
      case 'ole-toggle-fullscreen': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.ToggleExpandOleBlock(block);
        }
        return;
      }
      case 'ole-open-source': {
        this.OpenSourceArtifactRecord(cmd.ArtifactID);
        return;
      }
      case 'ole-update-latest': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.UpdateEmbeddedArtifactToLatestVersion(block);
        }
        return;
      }
      case 'ole-toggle-pin': {
        const block = this.findBlockDescriptorById(cmd.BlockID);
        if (block) {
          this.TogglePinArtifactVersion(block);
        }
        return;
      }
      case 'preview-copy-selection': {
        this.writeClipboardText(cmd.SelectedText, 'Copied selection to clipboard.');
        return;
      }
      case 'preview-copy-link': {
        this.writeClipboardText(cmd.Url, 'Copied link URL to clipboard.');
        return;
      }
      case 'preview-open-link': {
        if (!this.isSafeLinkUrl(cmd.Url)) {
          this.StatusBannerMessage = 'Blocked opening unsafe link protocol.';
          this.cdr.markForCheck();
          return;
        }
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(cmd.Url, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      case 'preview-copy-image': {
        this.writeClipboardText(cmd.Url, 'Copied image URL to clipboard.');
        return;
      }
      case 'preview-copy-anchor': {
        this.SelectedAnchorKey = cmd.AnchorKey;
        this.writeClipboardText(`#${cmd.AnchorKey}`, 'Copied section reference to clipboard.');
        return;
      }
      case 'preview-switch-to-write': {
        const seg = this.findSegmentById(cmd.SegmentID);
        if (seg) {
          this.OnPreviewBlockDoubleClick(seg);
        }
        return;
      }
      case 'suggestion-accept': {
        const sug = this.Suggestions.find((s) => s.SuggestionID === cmd.SuggestionID);
        if (sug) {
          this.AcceptSuggestion(sug);
        }
        return;
      }
      case 'suggestion-reject': {
        const sug = this.Suggestions.find((s) => s.SuggestionID === cmd.SuggestionID);
        if (sug) {
          this.RejectSuggestion(sug);
        }
        return;
      }
      case 'suggestion-jump': {
        this.FocusSegmentByAnchorKey(cmd.AnchorKey);
        return;
      }
      case 'suggestion-copy-proposed': {
        const sug = this.Suggestions.find((s) => s.SuggestionID === cmd.SuggestionID);
        if (sug) {
          this.writeClipboardText(sug.ProposedMarkdown, 'Copied proposed Markdown to clipboard.');
        }
        return;
      }
      case 'outline-jump': {
        const item = this.OutlineItems.find((o) => UUIDsEqual(o.ID, cmd.ItemID));
        if (item) {
          this.SelectOutlineItem(item);
          this.FocusSegmentByAnchorKey(item.ID);
        }
        return;
      }
    }
  }

  public InsertParagraphAboveSegment(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      if (this.CanUserEdit) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.ViewMode === 'suggest') {
      const nextMd = seg.RawMarkdown.trim().length > 0 ? `New paragraph\n\n${seg.RawMarkdown}` : 'New paragraph';
      this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, nextMd, 'Insert paragraph above');
      this.StatusBannerMessage = 'Queued tracked suggestion to insert paragraph above.';
      this.cdr.markForCheck();
      return;
    }
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const insertIdx = idx >= 0 ? idx : 0;
    blocks.splice(insertIdx, 0, '');
    this.applyBlockFlowTransaction(blocks, { segmentIndex: insertIdx, position: 'start' });
  }

  public DuplicateSegment(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      if (this.CanUserEdit) {
        this.StatusBannerMessage = 'This section is protected by an owner lock and cannot be edited.';
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.ViewMode === 'suggest') {
      const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
      const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
      const cloneMd = (idx >= 0 ? blocks[idx] : undefined) ?? seg.RawMarkdown;
      const nextMd = cloneMd.trim().length > 0 ? `${cloneMd}\n\n${cloneMd}` : cloneMd;
      this.CreateOrUpdatePendingSuggestion(seg.SegmentID, seg.RawMarkdown, nextMd, 'Duplicate block');
      this.StatusBannerMessage = 'Queued tracked suggestion to duplicate block.';
      this.cdr.markForCheck();
      return;
    }
    const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (idx < 0) {
      return;
    }
    const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
    this.syncDirtySegmentsFromDomIntoBlocks(blocks);
    const cloneMd = blocks[idx] ?? seg.RawMarkdown;
    blocks.splice(idx + 1, 0, cloneMd);
    this.applyBlockFlowTransaction(blocks, { segmentIndex: idx + 1, position: 'end' });
  }

  public ConvertSegmentBlockType(
    seg: DocumentRenderSegment,
    target:
      | 'paragraph'
      | 'heading-1'
      | 'heading-2'
      | 'heading-3'
      | 'bullet-list'
      | 'ordered-list'
      | 'task-list'
      | 'callout'
      | 'code',
  ): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    const segIdx = this.DocumentSegments.findIndex((s) => s.SegmentID === seg.SegmentID);
    if (segIdx < 0) {
      return;
    }

    let plainText: string;
    if (seg.BlockKind === 'heading') {
      plainText = (seg.HeadingText ?? this.GetEditableHeadingText(seg)).trim();
    } else if (seg.BlockKind === 'callout') {
      plainText = this.GetParsedCallout(seg).BodyText.trim();
    } else if (seg.BlockKind === 'list') {
      plainText = this.GetParsedListItems(seg)
        .map((i) => i.Text)
        .join('\n')
        .trim();
    } else if (seg.BlockKind === 'code') {
      plainText = this.GetParsedCodeBlock(seg).Code.trim();
    } else {
      plainText = seg.RawMarkdown.trim();
    }

    const lines = (plainText || 'Text').split('\n');
    const singleLine = lines.join(' ').trim() || 'Heading';
    let nextMd: string;
    switch (target) {
      case 'paragraph':
        nextMd = plainText;
        break;
      case 'heading-1':
        nextMd = `# ${singleLine}`;
        break;
      case 'heading-2':
        nextMd = `## ${singleLine}`;
        break;
      case 'heading-3':
        nextMd = `### ${singleLine}`;
        break;
      case 'bullet-list':
        nextMd = lines.map((l) => `- ${l}`).join('\n');
        break;
      case 'ordered-list':
        nextMd = lines.map((l, idx) => `${idx + 1}. ${l}`).join('\n');
        break;
      case 'task-list':
        nextMd = lines.map((l) => `- [ ] ${l}`).join('\n');
        break;
      case 'callout':
        nextMd = ['> [!NOTE]', ...lines.map((l) => `> ${l}`)].join('\n');
        break;
      case 'code':
        nextMd = ['```typescript', plainText, '```'].join('\n');
        break;
    }

    if (this.ViewMode === 'suggest') {
      this.ApplyInPlaceSegmentChange(seg, nextMd, `Converted block to ${target}`);
      return;
    }
    this.commitBlockTransform(seg, segIdx, nextMd, 'end');
  }

  public CopyDocsSelectionOrBlock(seg: DocumentRenderSegment, mode: 'rich' | 'markdown'): void {
    const text =
      mode === 'rich' && this.contextMenuSelectionText.trim().length > 0
        ? this.contextMenuSelectionText
        : seg.RawMarkdown;
    this.writeClipboardText(
      text,
      mode === 'markdown' ? 'Copied block Markdown to clipboard.' : 'Copied to clipboard.',
    );
  }

  private resolveSegmentSubElementContext(
    seg: DocumentRenderSegment,
    snapshot: DocsSelectionSnapshot | null,
  ): { text: string; isCodeBlock: boolean; applySubMarkdown: (nextSubMd: string) => string } {
    if (seg.BlockKind === 'heading') {
      const level = seg.HeadingLevel ?? 1;
      const prefix = `${'#'.repeat(level)} `;
      const text = seg.HeadingText ?? this.GetEditableHeadingText(seg);
      return {
        text,
        isCodeBlock: false,
        applySubMarkdown: (nextSubMd) => `${prefix}${nextSubMd}`,
      };
    }
    if (seg.BlockKind === 'list') {
      const items = this.GetParsedListItems(seg);
      const itemIndex = snapshot?.listItemIndex;
      if (itemIndex !== undefined && itemIndex !== null && items[itemIndex]) {
        return {
          text: items[itemIndex].Text,
          isCodeBlock: false,
          applySubMarkdown: (nextSubMd) => {
            const nextItems = items.map((item) => ({ ...item }));
            nextItems[itemIndex].Text = nextSubMd;
            return this.serializeParsedListItems(nextItems);
          },
        };
      }
    }
    if (seg.BlockKind === 'table' && snapshot?.tableColIndex !== undefined && snapshot.tableColIndex !== null) {
      const parsed = this.GetParsedTable(seg);
      const colIdx = Math.max(0, Math.min(parsed.Headers.length - 1, snapshot.tableColIndex));
      if (snapshot.isTableHeader) {
        return {
          text: parsed.Headers[colIdx] ?? '',
          isCodeBlock: false,
          applySubMarkdown: (nextSubMd) => {
            const sanitizedCell = nextSubMd.replace(/\|/g, '/');
            const nextHeaders = parsed.Headers.map((h, hIdx) => (hIdx === colIdx ? sanitizedCell : h));
            return this.serializeParsedTable(nextHeaders, parsed.Rows, parsed.Alignments);
          },
        };
      }
      if (
        typeof snapshot.tableRowIndex === 'number' &&
        Number.isInteger(snapshot.tableRowIndex) &&
        snapshot.tableRowIndex >= 0 &&
        snapshot.tableRowIndex < parsed.Rows.length &&
        Number.isInteger(colIdx) &&
        colIdx >= 0 &&
        colIdx < (parsed.Rows[snapshot.tableRowIndex]?.length ?? 0)
      ) {
        const rowIdx = snapshot.tableRowIndex;
        return {
          text: parsed.Rows[rowIdx][colIdx] ?? '',
          isCodeBlock: false,
          applySubMarkdown: (nextSubMd) => {
            const sanitizedCell = nextSubMd.replace(/\|/g, '/');
            const nextRows = parsed.Rows.map((row, rIdx) =>
              rIdx === rowIdx
                ? row.map((cell, cIdx) => (cIdx === colIdx ? sanitizedCell : cell))
                : [...row],
            );
            return this.serializeParsedTable(parsed.Headers, nextRows, parsed.Alignments);
          },
        };
      }
    }
    if (seg.BlockKind === 'callout') {
      const parsed = this.GetParsedCallout(seg);
      return {
        text: parsed.BodyText,
        isCodeBlock: false,
        applySubMarkdown: (nextSubMd) =>
          [`> [!${parsed.CalloutType}]`, ...nextSubMd.split('\n').map((l) => `> ${l}`)].join('\n'),
      };
    }
    if (seg.BlockKind === 'code') {
      const parsed = this.GetParsedCodeBlock(seg);
      return {
        text: parsed.Code,
        isCodeBlock: true,
        applySubMarkdown: (nextSubMd) => ['```' + parsed.Language, nextSubMd, '```'].join('\n'),
      };
    }
    return {
      text: seg.RawMarkdown,
      isCodeBlock: false,
      applySubMarkdown: (nextSubMd) => nextSubMd,
    };
  }

  private cutVisibleRangeFromMarkdown(markdown: string, rawVisStart: number, rawVisEnd: number): string {
    const tokens = this.tokenizeInlineMarkdown(markdown);
    if (tokens.length === 0) {
      return markdown;
    }
    const totalVis = tokens[tokens.length - 1].visEnd;
    const visStart = Math.max(0, Math.min(totalVis, Math.min(rawVisStart, rawVisEnd)));
    const visEnd = Math.max(visStart, Math.min(totalVis, Math.max(rawVisStart, rawVisEnd)));
    if (visStart === visEnd) {
      return markdown;
    }

    const parts: string[] = [];
    for (const tok of tokens) {
      const cutStart = Math.max(visStart, tok.visStart);
      const cutEnd = Math.min(visEnd, tok.visEnd);
      if (cutStart >= cutEnd) {
        parts.push(markdown.slice(tok.mdStart, tok.mdEnd));
        continue;
      }
      const relStart = cutStart - tok.visStart;
      const relEnd = cutEnd - tok.visStart;
      const keptContent = tok.content.slice(0, relStart) + tok.content.slice(relEnd);
      if (keptContent.length === 0) {
        continue;
      }
      if (tok.kind === 'text') {
        parts.push(keptContent);
        continue;
      }
      if (keptContent.trim().length === 0) {
        parts.push(keptContent);
        continue;
      }
      const openMarker = markdown.slice(tok.mdStart, tok.mdStart + tok.markerLen);
      const closeMarker = markdown.slice(tok.mdEnd - tok.markerLen, tok.mdEnd);
      parts.push(`${openMarker}${keptContent}${closeMarker}`);
    }
    return parts.join('');
  }

  public CutDocsSelectionOrBlock(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    const snap = this.contextMenuSelectionSnapshot ? { ...this.contextMenuSelectionSnapshot } : null;
    const selectedText = this.contextMenuSelectionText;
    const originalSegId = seg.SegmentID;
    const currentSeg = this.ViewMode === 'edit' ? this.flushDirtyDomBeforeContextMutation(seg) : seg;
    const snapMatchesSeg =
      snap !== null && (snap.segmentId === originalSegId || snap.segmentId === currentSeg.SegmentID);

    if (snapMatchesSeg && snap.end > snap.start) {
      const subCtx = this.resolveSegmentSubElementContext(currentSeg, snap);
      const nextSubMd = subCtx.isCodeBlock
        ? subCtx.text.slice(0, snap.start) + subCtx.text.slice(snap.end)
        : this.cutVisibleRangeFromMarkdown(subCtx.text, snap.start, snap.end);
      const clipText = selectedText.length > 0 ? selectedText : subCtx.text.slice(snap.start, snap.end);
      this.writeClipboardText(clipText, 'Cut selection to clipboard.');
      const nextSegMd = subCtx.applySubMarkdown(nextSubMd.trimEnd());
      this.ApplyInPlaceSegmentChange(currentSeg, nextSegMd.trim() || '', 'Cut selection');
      return;
    }

    if (selectedText.length > 0) {
      const subCtx = this.resolveSegmentSubElementContext(currentSeg, snap);
      const idx = subCtx.text.indexOf(selectedText);
      if (idx >= 0) {
        this.writeClipboardText(selectedText, 'Cut selection to clipboard.');
        const nextSubMd = subCtx.text.slice(0, idx) + subCtx.text.slice(idx + selectedText.length);
        const nextSegMd = subCtx.applySubMarkdown(nextSubMd.trimEnd());
        this.ApplyInPlaceSegmentChange(currentSeg, nextSegMd.trim() || '', 'Cut selection');
        return;
      }
      this.writeClipboardText(selectedText, 'Copied selection to clipboard.');
      return;
    }

    this.writeClipboardText(currentSeg.RawMarkdown, 'Cut block to clipboard.');
    if (this.DocumentSegments.length > 1) {
      this.DeleteSegment(currentSeg);
    } else {
      this.ApplyInPlaceSegmentChange(currentSeg, '', 'Cut block');
    }
  }

  public PasteIntoDocsSegment(seg: DocumentRenderSegment): void {
    if (!this.CanEditSegment(seg)) {
      return;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.readText !== 'function'
    ) {
      this.StatusBannerMessage = 'Clipboard paste requires browser permission — press Cmd/Ctrl+V in the block.';
      this.cdr.markForCheck();
      return;
    }
    const snap = this.contextMenuSelectionSnapshot ? { ...this.contextMenuSelectionSnapshot } : null;
    const originalSegId = seg.SegmentID;
    navigator.clipboard
      .readText()
      .then((clipText) => {
        if (this.isComponentDestroyed || !clipText) {
          return;
        }
        let liveSeg = this.findSegmentById(originalSegId) ?? seg;
        if (!this.CanEditSegment(liveSeg)) {
          return;
        }
        if (this.ViewMode === 'edit') {
          liveSeg = this.flushDirtyDomBeforeContextMutation(liveSeg);
        }
        const snapMatchesSeg =
          snap !== null && (snap.segmentId === originalSegId || snap.segmentId === liveSeg.SegmentID);
        if (snapMatchesSeg && snap.end >= snap.start) {
          const subCtx = this.resolveSegmentSubElementContext(liveSeg, snap);
          const range = subCtx.isCodeBlock
            ? {
                start: Math.max(0, Math.min(subCtx.text.length, snap.start)),
                end: Math.max(0, Math.min(subCtx.text.length, snap.end)),
              }
            : this.mapVisibleRangeToMarkdownRange(subCtx.text, snap.start, snap.end, snap.start === snap.end);
          const nextSubMd =
            subCtx.text.slice(0, range.start) + clipText + subCtx.text.slice(range.end);
          const nextSegMd = subCtx.applySubMarkdown(nextSubMd);
          this.ApplyInPlaceSegmentChange(liveSeg, nextSegMd, 'Pasted clipboard text');
        } else {
          const subCtx = this.resolveSegmentSubElementContext(liveSeg, null);
          const sep = subCtx.text.trim().length > 0 ? ' ' : '';
          const nextSegMd = subCtx.applySubMarkdown(`${subCtx.text}${sep}${clipText}`);
          this.ApplyInPlaceSegmentChange(liveSeg, nextSegMd, 'Pasted clipboard text');
        }
      })
      .catch(() => {
        if (this.isComponentDestroyed) {
          return;
        }
        this.StatusBannerMessage = 'Clipboard paste requires browser permission — press Cmd/Ctrl+V in the block.';
        this.cdr.markForCheck();
      });
  }

  public CopyCodeBlockText(seg: DocumentRenderSegment): void {
    const parsed = this.GetParsedCodeBlock(seg);
    this.writeClipboardText(parsed.Code, 'Copied code to clipboard.');
  }

  public CopyLiveBlockResultAsCsv(block: DocumentBlockSpec): void {
    const execResult = this.GetBlockExecutionResult(block);
    if (execResult.Columns.length === 0 || execResult.Rows.length === 0) {
      return;
    }
    const header = execResult.Columns.map((c) => this.escapeCsvCell(c.DisplayName || c.Name)).join(',');
    const body = execResult.Rows.map((row) =>
      execResult.Columns.map((c) => this.escapeCsvCell(this.FormatCellValue(row[c.Name]))).join(','),
    );
    this.writeClipboardText([header, ...body].join('\n'), 'Copied live block result as CSV.');
  }

  public CopyBlockDirectiveJson(block: DocumentBlockSpec): void {
    const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(block);
    this.writeClipboardText(directive, 'Copied :::mj-block directive to clipboard.');
  }

  public OpenSourceArtifactRecord(artifactId: string): void {
    const trimmed = artifactId.trim();
    if (!trimmed) {
      return;
    }
    const entityName = 'MJ: Artifacts';
    const compositeKey = CompositeKey.FromID(trimmed);
    this.OpenEntityRecord.emit({ entityName, compositeKey });
    this.StatusBannerMessage = 'Opening source artifact…';
    this.cdr.markForCheck();
  }

  public CanInlineEditEmbeddedArtifact(block: DocumentBlockSpec): boolean {
    return (
      this.CanUserEdit &&
      Boolean(block.ArtifactID?.trim()) &&
      (block.EmbedMode ?? 'Inline') === 'Inline'
    );
  }

  public FocusSegmentByAnchorKey(anchorKey: string): void {
    const seg =
      this.DocumentSegments.find((s) => s.SegmentID === anchorKey) ?? this.DocumentSegments[0];
    if (!seg) {
      return;
    }
    this.SelectedAnchorKey = seg.SegmentID;
    this.lastFocusedSegmentId = seg.SegmentID;
    this.scrollToSegmentElement(seg);
    if (this.IsInteractiveCanvasMode) {
      this.FocusEditableSegment(seg.SegmentID, 'start');
    } else {
      this.cdr.markForCheck();
    }
  }

  private findSegmentById(segmentId: string): DocumentRenderSegment | undefined {
    return this.DocumentSegments.find((s) => s.SegmentID === segmentId);
  }

  private findBlockDescriptorById(blockId: string): DocumentBlockSpec | undefined {
    return this.DocumentSegments.find((s) => s.Descriptor?.BlockID === blockId)?.Descriptor;
  }

  private getFormatPrefixSuffix(
    format: 'bold' | 'italic' | 'strikethrough' | 'inline-code' | 'link',
  ): { prefix: string; suffix: string } {
    switch (format) {
      case 'bold':
        return { prefix: '**', suffix: '**' };
      case 'italic':
        return { prefix: '*', suffix: '*' };
      case 'strikethrough':
        return { prefix: '~~', suffix: '~~' };
      case 'inline-code':
        return { prefix: '`', suffix: '`' };
      case 'link':
        return { prefix: '[', suffix: '](https://)' };
    }
  }

  private escapeCsvCell(raw: string): string {
    const text = raw ?? '';
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private writeClipboardText(text: string, successMessage: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text).catch((err) => {
        LogError(err);
      });
    }
    this.StatusBannerMessage = successMessage;
    this.cdr.markForCheck();
  }
}

/**
 * Optional metadata extracted from YAML frontmatter (`--- ... ---`) at the top of a Markdown document.
 */
export interface DocumentFrontmatterHeader {
  Title?: string;
  Subtitle?: string;
  Author?: string;
  Date?: string;
  Category?: string;
  Tags: string[];
  Accent?: string;
}

/**
 * Parses leading YAML frontmatter metadata into a cover header strip, returning `null` if no valid
 * frontmatter metadata keys are present.
 */
export function ParseMarkdownFrontmatterHeader(markdown: string): DocumentFrontmatterHeader | null {
  const normalized = (markdown ?? '').replace(/\r\n/g, '\n');
  const match = /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/.exec(normalized);
  if (!match) {
    return null;
  }
  const block = match[1];
  const header: DocumentFrontmatterHeader = { Tags: [] };
  let hasField = false;
  for (const rawLine of block.split('\n')) {
    const kv = /^([a-zA-Z_-]+)\s*:\s*(.+)$/.exec(rawLine.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const rawVal = kv[2].trim().replace(/^['"]|['"]$/g, '');
    if (!rawVal) continue;
    switch (key) {
      case 'title':
        header.Title = rawVal;
        hasField = true;
        break;
      case 'subtitle':
      case 'description':
        header.Subtitle = rawVal;
        hasField = true;
        break;
      case 'author':
        header.Author = rawVal;
        hasField = true;
        break;
      case 'date':
        header.Date = rawVal;
        hasField = true;
        break;
      case 'category':
      case 'section':
        header.Category = rawVal;
        hasField = true;
        break;
      case 'tags': {
        const cleaned = rawVal.replace(/^\[|\]$/g, '');
        header.Tags = cleaned
          .split(',')
          .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        if (header.Tags.length > 0) hasField = true;
        break;
      }
      case 'accent': {
        if (/^#[0-9a-f]{3,8}$/i.test(rawVal)) {
          header.Accent = rawVal;
          hasField = true;
        }
        break;
      }
    }
  }
  return hasField ? header : null;
}
