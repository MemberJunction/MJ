import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  Output,
  OnInit,
  OnDestroy,
  Renderer2,
  ChangeDetectorRef,
  HostListener,
  Type,
  ViewChild,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { EscapeSQLString, IsValidUUID, NormalizeUUID, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
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
  DocumentLiveBlockEngine,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SlideDeckEngine,
  SpreadsheetEngine,
  SLIDE_LAYOUT_CATALOG,
  SLIDE_DECK_THEME_PRESETS,
  type ArtifactTypeThumbnailPolicy,
  type WorksheetSpec,
  type SlideDeckSpec,
  type SlideSpec,
  type SlideRegionSpec,
  type SlideLayoutKind,
  type SlideRegionKind,
  type SlideDeckThemeSpec,
  type SlideLayoutMetadata,
  type SlideTransitionKind,
  type SlideBackgroundStyle,
  type SlideCardElevation,
  type DocumentBlockSpec,
  type DocumentBlockColumn,
  type DocumentBlockExecutionResult,
} from '@memberjunction/core-entities';
import {
  ArtifactNavigationAnchor,
  ArtifactViewerViewMode,
  BaseArtifactViewerPluginComponent,
  IArtifactVersionDiffViewer,
  type NavigationRequest,
  type PreVerifiedFrozenSnapshotEntry,
} from '../base-artifact-viewer.component';
import { ResolvePreVerifiedFrozenSnapshotState } from '../../utils/frozen-snapshot-verification.util';
import {
  BuildCanonicalSlideSuggestionRecord,
  NormalizeSlideSuggestion,
  ParseSuggestionsFromConfiguration,
  ReadArtifactVersionConfigurationSafe,
  UpsertArtifactSuggestionInVersionConfiguration,
} from '../../utils/artifact-suggestion-normalizer.util';
import {
  MJ_EMBEDDED_ARTIFACT_ANCESTORS,
  MJ_MAX_EMBED_DEPTH,
} from '../artifact-type-plugin-viewer.component';
import { CaptureThumbnailForDriverIfAllowed } from '../../utils/artifact-dom-capture';
import { SlidesVersionDiffComponent } from '../version-diff/slides-version-diff.component';
import { ARTIFACT_AI_ASSISTANT_ENABLED, RequestArtifactAiAssistant } from '../../services/artifact-ai-assistant-bridge';
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
import {
  SlideDeckExportService,
  type PptxExportPackage,
} from '../../services/slide-deck-export.service';
import { EscapeHtml } from '../previews/office-preview.logic';
import type { ContextMenuItem } from '../context-menu/context-menu.types';
import type { ArtifactCommandPaletteItem } from './artifact-command-palette.component';
import {
  ComputeElementContextMenuAnchor,
  IsKeyboardContextMenuShortcut,
  IsNativeContextMenuTarget,
  ShouldBypassCustomContextMenu,
  TouchContextMenuMonitor,
} from '../context-menu/context-menu-position.util';
import {
  BuildSlidesContextMenu,
  ComputeSlidesMenuAriaLabel,
  SerializeSlideToMarkdown,
  type SlidesContextMenuCommand,
  type SlidesContextMenuSnapshot,
  type SlidesContextMenuZone,
} from './context-menus/slides-context-menu.helper';

/**
 * Workspace mode for the MJ Slides (`Presentation`) artifact editor (`§ 5`).
 */
export type SlideWorkspaceMode = 'edit' | 'present' | 'presenter' | 'source' | 'diff';

/**
 * Shared Yjs suggestion record (`doc.getMap('suggestions')`) targeting a slide title, subtitle, or region (`NW-3`).
 */
export interface SlideDeckSuggestion {
  SuggestionID: string;
  SlideID: string;
  SlideNumber?: number;
  RegionID?: string;
  Field: 'region-markdown' | 'slide-title' | 'slide-subtitle';
  AuthorID: string;
  AuthorName: string;
  OriginalText: string;
  SuggestedText: string;
  Rationale?: string;
  Status: 'Pending' | 'Accepted' | 'Rejected';
  CreatedAt: string;
}

/**
 * Computed delta between a Frozen block snapshot and its live query/workbook state (`NW-1`).
 */
export interface SlideRegionDriftSummary {
  RegionID: string;
  BlockID: string;
  BlockTitle: string;
  FrozenAt: string;
  FrozenByUserName: string;
  SignatureVerified: boolean;
  FrozenRowCount: number;
  LiveRowCount: number | null;
  HasDrift: boolean;
  ChangedRowCount: number;
  AddedRowCount: number;
  RemovedRowCount: number;
  ErrorMessage?: string;
}

/**
 * Normalized SVG chart geometry rendered on the visual slide canvas for chart-mode blocks.
 */
export interface SlideStageChartModel {
  ChartType: 'bar' | 'line' | 'pie' | 'area';
  Categories: string[];
  Series: Array<{ Name: string; Values: number[]; Color: string }>;
  MaxValue: number;
  PieSlices?: Array<{ Label: string; Value: number; Percentage: number; PathData: string; Color: string }>;
}

/**
 * Right-hand inspector drawer tab in MJ Slides.
 */
export type SlideRightDrawerTab = 'none' | 'theme' | 'comments';

/**
 * Collaborative Presentation (`SlideDeckArtifactViewerPlugin`) editor and viewer component (`§ 5`).
 *
 * Implements:
 * - Structured 16:9 `SlideDeckSpec` visual stage with 10 canonical layouts (`Title`, `SectionHeader`,
 *   `TitleAndBody`, `TwoColumn`, `Comparison`, `LiveDataSlide`, `ChartAndText`, `BigNumber`, `Quote`,
 *   `FullBleedImage`, `Blank`), master header/footer/slide numbers, and speaker notes (`§ 5.1`).
 * - Per-slide Yjs CRDT real-time co-editing (`slidesById` `Y.Map` + `slideOrder` `Y.Array` + `deckMeta` `Y.Map`)
 *   so concurrent edits to different slides and deck reordering merge with zero data loss (`Accept #1`).
 * - Live MJ Blocks (`EntityView`, `SavedQuery`, `DashboardPart`, `InteractiveComponent`) with viewer-scoped
 *   RLS + FLS execution, `IsServerSet` parameter stripping, and `O5` freeze confirmation modal.
 * - Inline MS OLE `Artifact` / `Whiteboard` slide regions mounting `<mj-artifact-type-plugin-viewer>` ->
 *   `<mj-realtime-whiteboard-host>` inline on the slide canvas (`§ 3.4.1`, `§ 5.1`).
 * - Presentation Mode & Presenter View (`O6`): automatically freezes live blocks when Presentation Mode
 *   begins so numbers stay stable while presenting, with a one-click `Refresh Live Data` button.
 * - Theme presets & Organization Brand Color Seeds (`Accept #4`) deriving contrast-safe palettes.
 * - Anchored `SlideRegion` comments (`AnchorType = 'SlideRegion'`, `AnchorKey = '<SlideID>:<RegionID>'`)
 *   with `@SlidesAgent` single-slide region updates (`Accept #3`).
 * - OpenXML `.pptx` export (freezing live blocks per `Accept #2` and emitting editable `<p:sp>` text runs
 *   and `<a:tbl>` tables per `Accept #5`) and 16:9 `.pdf` export (`§ 5.3`).
 */
export const SLIDES_TOOLBAR_PINS_SETTING_KEY = 'MJ.Slides.Toolbar.PinnedActions';

export type SlidesToolbarItemKey =
  | 'present'
  | 'presenter'
  | 'source-mode'
  | 'diff-mode'
  | 'add-slide'
  | 'duplicate-slide'
  | 'delete-slide'
  | 'polish-slide'
  | 'theme'
  | 'md-to-deck'
  | 'export-pptx'
  | 'export-pdf'
  | 'ask-ai'
  | 'lock-slide';

export const DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS: readonly SlidesToolbarItemKey[] = [
  'present',
  'add-slide',
];

export interface ResolvedSlidesToolbarItem {
  Key: SlidesToolbarItemKey;
  Label: string;
  ShortLabel?: string;
  Description: string;
  Icon: string;
  Category: 'Slide Actions' | 'Design & AI' | 'View & Export';
  Placement: 'left' | 'right';
  TestId: string;
  Active: boolean;
  Disabled?: boolean;
  Visible: boolean;
}

@Component({
  selector: 'mj-slide-deck-artifact-viewer',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mj-slides-shell"
      [class.mj-slides-fullscreen]="WorkspaceMode === 'present' || WorkspaceMode === 'presenter'"
      [class.mj-slides-stage-blackout]="IsPresentationActive && PresentationOverlayMode === 'blackout'"
      [class.mj-slides-stage-whiteout]="IsPresentationActive && PresentationOverlayMode === 'whiteout'"
      (mousemove)="OnPresentShellPointerMove($event)"
      data-testid="mj-slides-shell"
    >
      <!-- Top Presentation Toolbar -->
      <div class="mj-slides-toolbar" data-testid="slides-toolbar">
        <div class="mj-slides-toolbar-group">
          <button
            type="button"
            class="mj-slides-tool-btn"
            [class.active]="ShowFilmstrip"
            (click)="ToggleFilmstrip()"
            title="Toggle Slide Sorter Filmstrip"
            data-testid="toggle-filmstrip-btn"
          >
            <i class="fa-solid fa-film"></i>
            <span>Slides ({{ Deck.Slides.length }})</span>
          </button>

          <div class="mj-slides-mode-pills" role="tablist" aria-label="Presentation workspace mode">
            <button
              type="button"
              class="mj-slides-mode-pill"
              [class.active]="WorkspaceMode === 'edit'"
              (click)="SetWorkspaceMode('edit')"
              data-testid="slides-mode-edit"
            >
              <i class="fa-solid fa-pen-ruler"></i> Edit
            </button>
          </div>

          @if (
            (WorkspaceMode === 'present' && !IsToolbarItemShownOnBar('present')) ||
            (WorkspaceMode === 'presenter' && !IsToolbarItemShownOnBar('presenter')) ||
            (WorkspaceMode === 'source' && !IsToolbarItemShownOnBar('source-mode')) ||
            (WorkspaceMode === 'diff' && !IsToolbarItemShownOnBar('diff-mode'))
          ) {
            <button
              type="button"
              class="mj-slides-active-mode-chip"
              title="Click to return to Edit mode"
              data-testid="slides-active-mode-chip"
              (click)="SetWorkspaceMode('edit')"
            >
              <i
                class="fa-solid"
                [class.fa-play]="WorkspaceMode === 'present'"
                [class.fa-chalkboard-user]="WorkspaceMode === 'presenter'"
                [class.fa-code]="WorkspaceMode === 'source'"
                [class.fa-code-compare]="WorkspaceMode === 'diff'"
              ></i>
              <span>{{
                WorkspaceMode === 'present'
                  ? 'Present'
                  : WorkspaceMode === 'presenter'
                    ? 'Presenter'
                    : WorkspaceMode === 'source'
                      ? 'Source'
                      : 'Diff'
              }}</span>
              <i class="fa-solid fa-xmark"></i>
            </button>
          }

          @if (IsEditable) {
            <div class="mj-slides-undo-group" role="group" aria-label="Undo and Redo">
              <button
                type="button"
                class="mj-slides-tool-btn mj-slides-tool-btn--icon"
                [disabled]="!CanUndo"
                (click)="UndoDeck()"
                title="Undo (Cmd/Ctrl+Z)"
                data-testid="slides-undo-btn"
              >
                <i class="fa-solid fa-rotate-left"></i>
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn mj-slides-tool-btn--icon"
                [disabled]="!CanRedo"
                (click)="RedoDeck()"
                title="Redo (Cmd/Ctrl+Shift+Z)"
                data-testid="slides-redo-btn"
              >
                <i class="fa-solid fa-rotate-right"></i>
              </button>
            </div>
          }
        </div>

        <!-- Pinned Authoring Controls (UserInfoEngine-persisted) -->
        @if (WorkspaceMode === 'edit' && IsEditable) {
          <div class="mj-slides-toolbar-group" data-testid="slides-pinned-left-group">
            @for (item of PinnedLeftToolbarItems; track item.Key) {
              <button
                type="button"
                class="mj-slides-tool-btn"
                [class.primary]="item.Key === 'add-slide'"
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

        <!-- Right-side Calm Status, Presence, AI, ⌘K, Comments & Overflow -->
        <div class="mj-slides-toolbar-group mj-slides-toolbar-right">
          @if (IsEditable) {
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.primary]="HasUnsavedChanges"
              [class.mj-slides-save-quiet]="!HasUnsavedChanges"
              (click)="OnSaveVersionCheckpoint()"
              [disabled]="IsSavingVersion || !HasUnsavedChanges"
              [title]="IsSavingVersion ? 'Saving checkpoint...' : (HasUnsavedChanges ? 'Save changes as a new version' : 'All changes synced — no unsaved changes')"
              data-testid="save-slide-version-btn"
            >
              @if (IsSavingVersion) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              } @else if (HasUnsavedChanges) {
                <i class="fa-solid fa-cloud-arrow-up"></i>
              } @else {
                <span class="mj-slides-saved-dot" aria-hidden="true"></span>
              }
              <span>{{ IsSavingVersion ? 'Saving…' : (!HasUnsavedChanges && LastSavedVersionNumber ? 'Saved v' + LastSavedVersionNumber : (HasUnsavedChanges ? 'Save v' + (LastSavedVersionNumber || CurrentVersionNumber) : 'Saved')) }}</span>
            </button>
          }

          <div
            class="mj-slides-collab-pill mj-slides-collab-pill--compact"
            [attr.data-status]="ConnectionStatus"
            [title]="GetCollaborationStatusLabel()"
            data-testid="slides-collab-status"
          >
            <span class="mj-slides-status-dot"></span>
            @if (IsWaitingForInitialCollabSync) {
              <span class="mj-slides-syncing-pill" data-testid="slides-initial-sync-badge">
                <i class="fa-solid fa-spinner fa-spin"></i>
              </span>
            }
            @if (ConnectionStatus === 'error') {
              <button
                type="button"
                class="mj-slides-collab-retry-btn"
                aria-label="Retry live collaboration sync"
                data-testid="slides-collab-retry-btn"
                (click)="RetryLiveCollaboration()"
              >
                Retry
              </button>
            }
          </div>

          @if (HumanCollaborators.length > 0) {
            <div class="mj-slides-collaborators" data-testid="slides-collaborator-list">
              @for (peer of HumanCollaborators; track peer.ClientID) {
                <span
                  class="mj-slides-peer-avatar"
                  [title]="peer.Name + (peer.ActiveBlockID ? ' · ' + peer.ActiveBlockID : '')"
                >
                  {{ GetInitials(peer.Name) }}
                </span>
              }
            </div>
          }
          <mj-artifact-agent-presence-bar
            [Collaborators]="Collaborators"
            ActiveDomain="slides"
            (JumpToAgentLocation)="JumpToAgentSlideLocation($event)"
          ></mj-artifact-agent-presence-bar>

          @for (item of PinnedRightToolbarItems; track item.Key) {
            <button
              type="button"
              class="mj-slides-tool-btn"
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

          @if (IsEditable && WorkspaceMode === 'edit' && IsAiAssistantEnabled) {
            <button
              type="button"
              class="mj-slides-tool-btn mj-slides-ai-pill"
              (click)="OpenAskAiForPresentation()"
              title="Ask AI about this presentation (/ai)"
              data-testid="slides-ask-ai-quick-btn"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span>AI</span>
            </button>
          }

          <button
            type="button"
            class="mj-slides-tool-btn"
            [class.active]="RightDrawerTab === 'comments'"
            (click)="ToggleRightDrawer('comments')"
            [title]="'Comments (' + OpenThreadCount + ')'"
            data-testid="toggle-slide-comments-btn"
          >
            <i class="fa-regular fa-comments"></i>
            @if (OpenThreadCount > 0) {
              <span class="mj-slides-count-badge">{{ OpenThreadCount }}</span>
            }
          </button>

          <button
            type="button"
            class="mj-slides-tool-btn mj-slides-cmdk-btn"
            (click)="OpenCommandPalette()"
            title="Search all slide actions, layouts, themes & exports (Cmd/Ctrl+K)"
            data-testid="slides-cmdk-btn"
          >
            <span class="mj-slides-kbd-tag">⌘K</span>
          </button>

          <div class="mj-slides-more-anchor" #moreToolsAnchor>
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="ShowMoreToolsMenu"
              aria-haspopup="menu"
              [attr.aria-expanded]="ShowMoreToolsMenu"
              title="Tools & View — pin favorite actions to your toolbar"
              data-testid="slides-more-tools-btn"
              (click)="ToggleMoreToolsMenu()"
            >
              <i class="fa-solid fa-ellipsis"></i>
            </button>

            @if (ShowMoreToolsMenu) {
              <div class="mj-slides-more-menu" role="menu" data-testid="slides-more-tools-menu">
                <div class="mj-slides-more-menu-header">
                  <div>
                    <span class="mj-slides-more-menu-title">Tools &amp; View</span>
                    <span class="mj-slides-more-menu-hint">
                      Pin up to {{ MaxPinnedToolbarActions }} actions ({{ PinnedToolbarActions.length }}/{{ MaxPinnedToolbarActions }})
                    </span>
                  </div>
                  @if (HasCustomToolbarPreferences) {
                    <button
                      type="button"
                      class="mj-slides-more-reset-btn"
                      data-testid="slides-reset-toolbar-btn"
                      (click)="ResetToolbarPreferences()"
                    >
                      Reset
                    </button>
                  }
                </div>

                @for (section of OverflowToolbarSections; track section.Category) {
                  <div class="mj-slides-more-section">
                    <div class="mj-slides-more-section-label">{{ section.Category }}</div>
                    @for (item of section.Items; track item.Key) {
                      <div class="mj-slides-more-row">
                        <button
                          type="button"
                          class="mj-slides-more-action"
                          [class.active]="item.Active"
                          [disabled]="item.Disabled"
                          role="menuitem"
                          [attr.data-testid]="'slides-overflow-' + item.Key"
                          (click)="ExecuteToolbarItem(item, true)"
                        >
                          <i class="fa-solid" [ngClass]="item.Icon"></i>
                          <div class="mj-slides-more-action-text">
                            <span class="mj-slides-more-action-label">{{ item.Label }}</span>
                            <span class="mj-slides-more-action-desc">{{ item.Description }}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          class="mj-slides-pin-btn"
                          [class.pinned]="IsToolbarItemPinned(item.Key)"
                          [disabled]="!IsToolbarItemPinned(item.Key) && PinnedToolbarActions.length >= MaxPinnedToolbarActions"
                          [title]="IsToolbarItemPinned(item.Key) ? 'Unpin from toolbar' : 'Pin to toolbar'"
                          [attr.data-testid]="'slides-pin-btn-' + item.Key"
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
        </div>
      </div>

      @if (LiveSyncUnavailable) {
        <div
          class="mj-slides-presentation-banner mj-slides-presentation-banner--readonly"
          role="status"
          data-testid="slides-live-sync-unavailable-banner"
        >
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid fa-plug-circle-xmark"></i>
            <span>Live collaborative sync is unavailable on this server — viewing in read-only mode.</span>
          </div>
        </div>
      }

      @if (PermissionVerifyError) {
        <div
          class="mj-slides-presentation-banner mj-slides-presentation-banner--warning"
          role="alert"
          data-testid="slides-permission-verify-error-banner"
        >
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Couldn't verify permissions — Retry</span>
          </div>
          <button
            type="button"
            class="mj-slides-tool-btn"
            data-testid="slides-permission-retry-btn"
            (click)="RetryVerifyPermissions()"
          >
            Retry
          </button>
        </div>
      }

      @if (StatusBannerMessage) {
        <div class="mj-slides-presentation-banner" data-testid="slides-status-banner">
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid fa-circle-info"></i>
            <span>{{ StatusBannerMessage }}</span>
          </div>
          <button type="button" class="mj-slides-tool-btn" (click)="StatusBannerMessage = ''">
            Dismiss
          </button>
        </div>
      }

      @if (HasPendingResetConflict) {
        <div
          class="mj-slides-presentation-banner mj-slides-presentation-banner--warning"
          role="alert"
          data-testid="slides-room-reset-conflict-banner"
        >
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid fa-code-merge"></i>
            <span>The collaborative presentation room was reset on the server. Apply your recovered local draft or keep the server copy.</span>
          </div>
          <div class="mj-slides-presentation-banner-actions">
            <button
              type="button"
              class="mj-slides-tool-btn primary"
              data-testid="slides-apply-reset-draft-btn"
              (click)="ApplyPendingResetConflictDraft()"
            >
              Restore Local Draft
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              data-testid="slides-dismiss-reset-draft-btn"
              (click)="DismissPendingResetConflictDraft()"
            >
              Keep Server Version
            </button>
          </div>
        </div>
      }

      <!-- NW-1: Live-vs-Frozen Governance Drift Banner -->
      @if (WorkspaceMode === 'edit' && ActiveSlideDriftSummaries.length > 0) {
        <div
          class="mj-slides-presentation-banner mj-slides-drift-banner"
          [class.has-drift]="ActiveSlideHasAnyDrift"
          data-testid="slides-nw1-drift-banner"
        >
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid" [ngClass]="ActiveSlideHasAnyDrift ? 'fa-scale-unbalanced-flip' : 'fa-shield-halved'"></i>
            <span>
              <strong>{{ ActiveSlideDriftSummaries.length }} Frozen {{ ActiveSlideDriftSummaries.length === 1 ? 'Snapshot' : 'Snapshots' }}</strong>
              @if (ActiveSlideHasAnyDrift) {
                — Source data has drifted since capture.
              } @else {
                — All signed snapshots match live query state.
              }
            </span>
          </div>
          <div class="mj-slides-presentation-banner-actions">
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="CompareActiveSlideDriftWithLive()"
              [disabled]="IsCheckingSlideDrift"
              data-testid="slides-nw1-compare-live-btn"
            >
              <i class="fa-solid" [ngClass]="IsCheckingSlideDrift ? 'fa-spinner fa-spin' : 'fa-code-compare'"></i>
              {{ ShowDriftComparePopover ? 'Hide Drift Delta' : 'Compare with Live' }}
            </button>
            @if (CanEditSlideElements) {
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="RefreezeAllDriftBlocksOnActiveSlide()"
                data-testid="slides-nw1-refreeze-all-btn"
              >
                <i class="fa-solid fa-snowflake"></i> Re-Freeze All
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn"
                (click)="SwitchAllFrozenBlocksOnActiveSlideToLive()"
                data-testid="slides-nw1-switch-live-all-btn"
              >
                <i class="fa-solid fa-bolt"></i> Switch All to Live
              </button>
            }
          </div>
        </div>
        @if (ShowDriftComparePopover) {
          <div class="mj-slides-drift-popover" data-testid="slides-nw1-drift-popover">
            @for (item of ActiveSlideDriftSummaries; track item.BlockID) {
              <div class="mj-slides-drift-row" [attr.data-has-drift]="item.HasDrift ? 'true' : 'false'">
                <div class="mj-slides-drift-row-title">
                  <strong>{{ item.BlockTitle }}</strong>
                  @if (item.SignatureVerified) {
                    <span class="mj-slides-badge" data-testid="slides-nw1-hmac-verified">
                      <i class="fa-solid fa-shield-halved"></i> Signed by {{ item.FrozenByUserName || 'Verified Author' }} · {{ item.FrozenAt }}
                    </span>
                  }
                </div>
                <div class="mj-slides-drift-row-delta">
                  @if (item.ErrorMessage) {
                    <span>{{ item.ErrorMessage }}</span>
                  } @else if (item.LiveRowCount === null) {
                    <span>{{ item.FrozenRowCount }} frozen rows (click Compare with Live to query source)</span>
                  } @else {
                    <span>
                      Frozen: {{ item.FrozenRowCount }} rows vs Live: {{ item.LiveRowCount }} rows
                      (+{{ item.AddedRowCount }} added, -{{ item.RemovedRowCount }} removed, ~{{ item.ChangedRowCount }} changed)
                    </span>
                  }
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Presentation Freeze Banner (shown in Present and Presenter View modes) -->
      @if (WorkspaceMode === 'present' || WorkspaceMode === 'presenter') {
        <div
          class="mj-slides-presentation-banner"
          [attr.data-frozen-at]="PresentationFrozenAt?.toISOString()"
          [attr.data-refresh-count]="PresentationRefreshCount"
          data-testid="o6-presentation-freeze-banner"
        >
          <div class="mj-slides-presentation-banner-info">
            <i class="fa-solid fa-snowflake"></i>
            <span>
              <strong>Presentation Mode:</strong> Live Views &amp; Queries are paused at
              {{ PresentationFrozenAt | date:'shortTime' }} so metrics remain stable while presenting.
            </span>
          </div>
          <div class="mj-slides-presentation-banner-actions">
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="RefreshLiveBlocksDuringPresentation()"
              data-testid="presenter-refresh-live-btn"
            >
              <i class="fa-solid fa-arrows-rotate"></i> Refresh Live Data
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="PrevSlide()"
              [disabled]="!CanNavigatePrevSlide"
              data-testid="present-prev-slide-btn"
            >
              <i class="fa-solid fa-chevron-left"></i> Prev
            </button>
            <span class="mj-slides-counter-pill" data-testid="present-slide-counter">
              Slide {{ ActiveSlideIndex + 1 }} / {{ ActiveDeckForDisplay.Slides.length }}
            </span>
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="NextSlide()"
              [disabled]="!CanNavigateNextSlide"
              data-testid="present-next-slide-btn"
            >
              Next <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="LaserPointerActive"
              (click)="ToggleLaserPointer()"
              title="Toggle Laser Pointer (L)"
              data-testid="present-laser-btn"
            >
              <i class="fa-solid fa-crosshairs"></i> Laser
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="PresentationOverlayMode === 'blackout'"
              (click)="TogglePresentationOverlay('blackout')"
              title="Blackout screen (B)"
              data-testid="present-blackout-btn"
            >
              <i class="fa-solid fa-moon"></i>
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="OpenAudienceStageWindow()"
              title="Pop out dual-window Audience Stage (BroadcastChannel synced)"
              data-testid="present-popout-audience-btn"
            >
              <i class="fa-solid fa-up-right-from-square"></i> Audience Window
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="IsBrowserFullscreen"
              (click)="ToggleBrowserFullscreen()"
              title="Toggle Browser Fullscreen (F)"
              data-testid="present-fullscreen-toggle-btn"
            >
              <i class="fa-solid" [ngClass]="IsBrowserFullscreen ? 'fa-compress' : 'fa-expand'"></i>
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="ExitPresentationMode()"
              data-testid="exit-presentation-btn"
            >
              <i class="fa-solid fa-xmark"></i> Exit
            </button>
          </div>
        </div>
      }

      <!-- Main Workspace Body -->
      <div class="mj-slides-workspace-body">
        <!-- Left Slide Sorter / Filmstrip Rail -->
        @if (ShowFilmstrip && WorkspaceMode !== 'present') {
          <aside
            class="mj-slides-filmstrip"
            (contextmenu)="OnFilmstripEmptyContextMenu($event)"
            data-testid="slides-filmstrip-rail"
          >
            <div class="mj-slides-filmstrip-header">
              <span>Slide Sorter</span>
              <span class="mj-slides-badge">{{ Deck.AspectRatio }}</span>
            </div>
            <div class="mj-slides-filmstrip-list">
              @for (slide of Deck.Slides; track slide.SlideID; let idx = $index) {
                <div
                  class="mj-slides-thumbnail-card"
                  [class.active]="slide.SlideID === ActiveSlide.SlideID"
                  [class.hidden-slide]="!!slide.Hidden"
                  [class.dragging]="DraggingSlideID === slide.SlideID"
                  [class.drag-over]="DragOverSlideID === slide.SlideID"
                  [attr.draggable]="IsEditable"
                  [attr.data-hidden-slide]="slide.Hidden ? 'true' : null"
                  (dragstart)="OnSlideDragStart(slide.SlideID, $event)"
                  (dragover)="OnSlideDragOver(slide.SlideID, $event)"
                  (dragleave)="OnSlideDragLeave(slide.SlideID)"
                  (drop)="OnSlideDrop(slide.SlideID, $event)"
                  (dragend)="OnSlideDragEnd()"
                  (click)="SelectSlide(slide.SlideID)"
                  (contextmenu)="OnFilmstripSlideContextMenu($event, slide)"
                  [attr.data-testid]="'filmstrip-slide-' + slide.SlideID"
                >
                  <div class="mj-slides-thumbnail-top">
                    <span class="mj-slides-thumb-number">{{ idx + 1 }}</span>
                    <span class="mj-slides-thumb-layout">{{ slide.Layout }}</span>
                    @if (slide.Hidden) {
                      <span
                        class="mj-slides-thumb-hidden-badge"
                        title="Skipped in Presentation mode"
                        [attr.data-testid]="'filmstrip-hidden-badge-' + slide.SlideID"
                      >
                        <i class="fa-solid fa-eye-slash"></i>
                      </span>
                    }
                    @if (IsEditable && WorkspaceMode === 'edit') {
                      <div class="mj-slides-thumb-reorder" (click)="$event.stopPropagation()">
                        <button
                          type="button"
                          class="mj-slides-icon-btn"
                          [disabled]="idx === 0"
                          (click)="OnMoveSlide(slide.SlideID, -1)"
                          title="Move Slide Up"
                          [attr.data-testid]="'move-slide-up-' + slide.SlideID"
                        >
                          <i class="fa-solid fa-arrow-up"></i>
                        </button>
                        <button
                          type="button"
                          class="mj-slides-icon-btn"
                          [disabled]="idx === Deck.Slides.length - 1"
                          (click)="OnMoveSlide(slide.SlideID, 1)"
                          title="Move Slide Down"
                          [attr.data-testid]="'move-slide-down-' + slide.SlideID"
                        >
                          <i class="fa-solid fa-arrow-down"></i>
                        </button>
                      </div>
                    }
                  </div>
                  <div class="mj-slides-thumbnail-preview">
                    <div class="mj-slides-thumb-title">{{ slide.Title }}</div>
                    @if (slide.Subtitle) {
                      <div class="mj-slides-thumb-subtitle">{{ slide.Subtitle }}</div>
                    }
                    <div class="mj-slides-thumb-badges">
                      @if (GetSlideOpenCommentCount(slide.SlideID) > 0) {
                        <span
                          class="mj-slides-mini-tag"
                          [attr.data-testid]="'filmstrip-comment-count-' + slide.SlideID"
                        >
                          <i class="fa-solid fa-comments"></i> {{ GetSlideOpenCommentCount(slide.SlideID) }}
                        </span>
                      }
                      @if (GetSlidePendingSuggestionCount(slide.SlideID) > 0) {
                        <span
                          class="mj-slides-mini-tag"
                          [attr.data-testid]="'filmstrip-suggestion-count-' + slide.SlideID"
                        >
                          <i class="fa-solid fa-lightbulb"></i> {{ GetSlidePendingSuggestionCount(slide.SlideID) }}
                        </span>
                      }
                      @for (reg of slide.Regions; track reg.RegionID) {
                        @if (reg.Kind === 'mj-block') {
                          <span class="mj-slides-mini-tag">
                            <i class="fa-solid fa-bolt"></i> {{ reg.BlockSpec?.Kind || 'Block' }}
                          </span>
                        }
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </aside>
        }

        <!-- Center Stage Area -->
        <main class="mj-slides-center-stage">
          @if (WorkspaceMode === 'source') {
            <div class="mj-slides-source-panel" data-testid="slides-source-panel">
              <div class="mj-slides-source-header">
                <strong>Presentation JSON Specification (<code>application/vnd.mj.presentation+json</code>)</strong>
                @if (IsEditable) {
                  <button
                    type="button"
                    class="mj-slides-tool-btn primary"
                    (click)="ApplyRawJsonSource()"
                    data-testid="apply-raw-json-btn"
                  >
                    Apply JSON Changes
                  </button>
                }
              </div>
              @if (RawJsonErrorMessage) {
                <div class="mj-slides-presentation-banner mj-slides-presentation-banner--warning" role="alert" data-testid="slides-raw-json-error-banner">
                  <div class="mj-slides-presentation-banner-info">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>{{ RawJsonErrorMessage }}</span>
                  </div>
                </div>
              }
              @if (RawJsonRemoteConflictPending) {
                <div class="mj-slides-presentation-banner mj-slides-presentation-banner--warning" role="alert" data-testid="slides-raw-json-conflict-banner">
                  <div class="mj-slides-presentation-banner-info">
                    <i class="fa-solid fa-code-merge"></i>
                    <span>Another collaborator updated this deck while you have unapplied JSON edits.</span>
                  </div>
                  <div class="mj-slides-presentation-banner-actions">
                    <button type="button" class="mj-slides-tool-btn primary" data-testid="slides-raw-json-keep-btn" (click)="KeepLocalRawJsonEdits()">
                      Keep My Edits
                    </button>
                    <button type="button" class="mj-slides-tool-btn" data-testid="slides-raw-json-reload-btn" (click)="ReloadRemoteDeckIntoRawJson()">
                      Reload Latest
                    </button>
                  </div>
                </div>
              }
              <textarea
                class="mj-slides-source-textarea"
                [ngModel]="RawDeckJsonText"
                (ngModelChange)="OnRawDeckJsonTextChange($event)"
                [readonly]="!IsEditable"
                data-testid="slides-source-textarea"
              ></textarea>
            </div>
          } @else if (WorkspaceMode === 'diff') {
            <div class="mj-slides-diff-panel" data-testid="slides-diff-view">
              <div class="mj-slides-diff-header">
                <strong>Slide Deck Version Diff</strong>
                <span class="mj-slides-diff-stats">
                  +{{ CurrentDiff.AddedLines }} added / -{{ CurrentDiff.RemovedLines }} removed /
                  {{ CurrentDiff.UnchangedLines }} unchanged
                </span>
              </div>
              <div class="mj-slides-diff-lines">
                @for (line of CurrentDiff.Lines; track $index) {
                  <div class="mj-slides-diff-line" [attr.data-diff-type]="line.Type">
                    <span class="mj-slides-diff-gutter">{{ line.NewLineNumber ?? line.OldLineNumber ?? '' }}</span>
                    <span class="mj-slides-diff-marker">
                      @if (line.Type === 'added') { + } @else if (line.Type === 'removed') { - } @else { &nbsp; }
                    </span>
                    <span class="mj-slides-diff-code">{{ line.Content }}</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <!-- 16:9 Visual Slide Stage (used in Edit, Present, and Presenter View) -->
            <div class="mj-slides-stage-layout" [class.presenter-split]="WorkspaceMode === 'presenter'">
              <div class="mj-slides-canvas-wrapper">
                @if (GetActiveSlideAgentPresence(); as slideAgent) {
                  <mj-artifact-agent-region-indicator
                    [Agent]="slideAgent"
                    (JumpToAgent)="JumpToAgentSlideLocation($event)"
                  ></mj-artifact-agent-region-indicator>
                }
                <section
                  class="mj-slide-canvas-stage"
                  [attr.data-layout]="DisplayedSlide.Layout"
                  [attr.data-aspect-ratio]="ActiveDeckForDisplay.AspectRatio"
                  [style.aspect-ratio]="ActiveDeckForDisplay.AspectRatio === '4:3' ? '4 / 3' : '16 / 9'"
                  [attr.data-theme-id]="ActiveDeckForDisplay.Theme.ThemeID"
                  [attr.data-bg-style]="SafeTheme.BackgroundStyle"
                  [attr.data-card-elevation]="SafeTheme.CardElevation"
                  [attr.data-transition]="DisplayedSlide.Transition || 'fade'"
                  [style.--deck-bg]="SafeTheme.BackgroundColor"
                  [style.--deck-secondary-bg]="SafeTheme.SecondaryGradientColor"
                  [style.--deck-surface]="SafeTheme.SurfaceColor"
                  [style.--deck-primary]="SafeTheme.PrimaryColor"
                  [style.--deck-accent]="SafeTheme.AccentColor"
                  [style.--deck-text]="SafeTheme.TextColor"
                  [style.--deck-muted]="SafeTheme.MutedTextColor"
                  [style.--deck-heading-font]="SafeTheme.HeadingFont"
                  [style.--deck-body-font]="SafeTheme.BodyFont"
                  [style.--deck-card-radius.px]="SafeTheme.CardRadiusPx"
                  (contextmenu)="OnSlideStageContextMenu($event)"
                  data-testid="slide-canvas-stage"
                >
                  <!-- Master Slide Header -->
                  <header class="mj-slide-master-header" data-testid="slide-master-header">
                    <span class="mj-slide-master-brand">
                      <i class="fa-solid fa-layer-group"></i>
                      {{ ActiveDeckForDisplay.Master.HeaderText || ActiveDeckForDisplay.Title }}
                    </span>
                    <span class="mj-slide-master-org">
                      {{ ActiveDeckForDisplay.Master.OrganizationName || 'MemberJunction' }}
                      @if (ActiveDeckForDisplay.Theme.BrandSeedSource) {
                        <span class="mj-slide-brand-seed-pill" data-testid="active-brand-seed-badge">
                          Brand: {{ ActiveDeckForDisplay.Theme.BrandSeedSource }}
                        </span>
                      }
                    </span>
                  </header>

                  <!-- Slide Heading Area (In-Place ContentEditable Title & Subtitle) -->
                  <div class="mj-slide-heading-zone">
                    <h1
                      class="mj-slide-title-editable"
                      [attr.contenteditable]="CanEditSlideElements ? 'true' : 'false'"
                      (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, 'title')"
                      (input)="OnSlideContentEditableInput()"
                      (blur)="OnInlineSlideTitleBlur($event, DisplayedSlide.SlideID)"
                      (keydown.enter)="OnInlineHeadingEnter($event)"
                      data-placeholder="Slide Title"
                      data-testid="editable-slide-title"
                    >{{ DisplayedSlide.Title }}</h1>

                    @if (DisplayedSlide.Subtitle || (CanEditSlideElements && WorkspaceMode === 'edit')) {
                      <p
                        class="mj-slide-subtitle-editable"
                        [attr.contenteditable]="CanEditSlideElements ? 'true' : 'false'"
                        (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, 'subtitle')"
                        (input)="OnSlideContentEditableInput()"
                        (blur)="OnInlineSlideSubtitleBlur($event, DisplayedSlide.SlideID)"
                        (keydown.enter)="OnInlineHeadingEnter($event)"
                        data-placeholder="Add slide subtitle..."
                        data-testid="editable-slide-subtitle"
                      >{{ DisplayedSlide.Subtitle || '' }}</p>
                    }
                  </div>

                  <!-- Structured Slide Regions Grid -->
                  <div
                    class="mj-slide-regions-grid"
                    [attr.data-layout]="DisplayedSlide.Layout"
                    data-testid="slide-regions-grid"
                  >
                    @for (region of DisplayedSlide.Regions; track region.RegionID) {
                      <div
                        class="mj-slide-region-card"
                        [class.active-region]="FocusedRegionID === region.RegionID"
                        [class.mj-slide-region--agent-active]="IsRegionEditedByAgent(region.RegionID)"
                        [class.mj-slide-region--unrevealed]="IsPresentationActive && !IsRegionRevealed(region)"
                        (click)="FocusedRegionID = region.RegionID"
                        (contextmenu)="OnSlideRegionContextMenu($event, region)"
                        [attr.data-region-id]="region.RegionID"
                        [attr.data-region-kind]="region.Kind"
                        [attr.data-reveal-step]="region.RevealStep ?? null"
                        [attr.data-testid]="'slide-region-' + region.RegionID"
                      >
                        <!-- Region Authoring Bar (only in Edit mode) -->
                        @if (WorkspaceMode === 'edit' && IsEditable) {
                          <div class="mj-slide-region-toolbar">
                            <span class="mj-slide-region-label">
                              <i class="fa-solid fa-vector-square"></i> {{ region.Label }}
                            </span>
                            <div class="mj-slide-region-actions">
                              <select
                                class="mj-slides-mini-select"
                                [ngModel]="region.Kind"
                                (ngModelChange)="OnChangeRegionKind(region, $event)"
                                [disabled]="!CanEditRegion(region)"
                                [attr.data-testid]="'region-kind-select-' + region.RegionID"
                              >
                                <option value="rich-text">Rich Text / Bullets</option>
                                <option value="callout">Callout Box</option>
                                <option value="table">Data Table</option>
                                <option value="image">Image</option>
                                <option value="big-number">KPI Big Number</option>
                                <option value="quote">Executive Quote</option>
                                <option value="mj-block">Live MJ Block / Artifact</option>
                              </select>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                [disabled]="!CanEditRegion(region)"
                                (click)="EmbedLiveEntityViewInRegion(region)"
                                title="Embed Live Viewer-Scoped MJ EntityView Block"
                                [attr.data-testid]="'region-insert-live-block-' + region.RegionID"
                              >
                                <i class="fa-solid fa-table-list"></i> + Live View
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                [disabled]="!CanEditRegion(region)"
                                (click)="EmbedInlineWhiteboardInRegion(region)"
                                title="Embed Interactive Whiteboard Canvas"
                                [attr.data-testid]="'region-insert-whiteboard-' + region.RegionID"
                              >
                                <i class="fa-solid fa-chalkboard"></i> + Whiteboard
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                [disabled]="!CanEditRegion(region)"
                                (click)="OpenSheetEmbedModal(region)"
                                title="Embed Live Chart or Range from MJ Spreadsheet"
                                [attr.data-testid]="'region-insert-sheet-embed-' + region.RegionID"
                              >
                                <i class="fa-solid fa-chart-column"></i> + Sheet Chart/Range
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                [class.active]="!!region.Locked"
                                [disabled]="!CanToggleRegionLock(region)"
                                (click)="ToggleRegionLock(region)"
                                [title]="region.Locked ? (region.AllowEditors ? 'Locked to collaborators with edit rights (click to unlock)' : 'Locked to owner-only (click to unlock)') : 'Lock region to owner-only'"
                                [attr.data-testid]="'region-lock-btn-' + region.RegionID"
                              >
                                <i class="fa-solid" [ngClass]="region.Locked ? 'fa-lock' : 'fa-lock-open'"></i>
                              </button>

                              @if (region.Locked && CanToggleRegionLock(region)) {
                                <button
                                  type="button"
                                  class="mj-slides-mini-btn"
                                  [class.active]="!!region.AllowEditors"
                                  (click)="ToggleRegionLockScope(region)"
                                  [title]="region.AllowEditors ? 'Restrict locked region to Owner-only' : 'Allow editors on locked region'"
                                  [attr.data-testid]="'region-lock-scope-btn-' + region.RegionID"
                                >
                                  <i class="fa-solid" [ngClass]="region.AllowEditors ? 'fa-users' : 'fa-user-shield'"></i>
                                </button>
                              }

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                (click)="OpenCommentForSlideRegion(DisplayedSlide.SlideID, region.RegionID, region.Label)"
                                title="Comment on this slide section"
                                [attr.data-testid]="'region-comment-btn-' + region.RegionID"
                              >
                                <i class="fa-regular fa-comment-dots"></i>
                                @if (GetRegionOpenCommentCount(DisplayedSlide.SlideID, region.RegionID) > 0) {
                                  <span
                                    class="mj-slides-region-pill-count"
                                    [attr.data-testid]="'region-comment-count-' + region.RegionID"
                                  >
                                    {{ GetRegionOpenCommentCount(DisplayedSlide.SlideID, region.RegionID) }}
                                  </span>
                                }
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Region Content by Kind -->
                        @if (region.Kind === 'mj-block' || region.BlockSpec) {
                          @if (GetRegionBlockSpec(region); as block) {
                            <div
                              class="mj-slide-live-block-box"
                              [attr.data-block-kind]="block.Kind"
                              [attr.data-block-mode]="block.Mode"
                              [attr.data-testid]="'slide-block-host-' + region.RegionID"
                            >
                              <div class="mj-slide-live-block-header">
                                <div class="mj-slide-live-block-title">
                                  <i class="fa-solid" [ngClass]="block.Kind === 'Artifact' ? 'fa-chalkboard' : 'fa-database'"></i>
                                  <strong>{{ block.Title || region.Label }}</strong>
                                  <span
                                    class="mj-slide-block-mode-pill"
                                    [attr.data-mode]="block.Mode"
                                    [attr.data-testid]="'slide-block-mode-' + region.RegionID"
                                  >
                                    @if (block.Mode === 'Frozen') {
                                      <i class="fa-solid fa-snowflake"></i> Frozen Snapshot
                                    } @else {
                                      <i class="fa-solid fa-bolt"></i> Live
                                    }
                                  </span>
                                </div>

                                @if (WorkspaceMode === 'edit' && !IsInlineOleArtifactBlock(block)) {
                                  <div class="mj-slide-live-block-controls">
                                    @if (GetNewerSourceWorkbookVersion(block); as newerWbVer) {
                                      <button
                                        type="button"
                                        class="mj-slides-mini-btn primary"
                                        title="Update pinned snapshot to latest workbook version"
                                        [attr.data-testid]="'slides-update-from-source-workbook-btn-' + region.RegionID"
                                        (click)="UpdateRegionBlockToLatestWorkbookVersion(region, block)"
                                      >
                                        <i class="fa-solid fa-arrow-up-from-bracket"></i>
                                        Update from Source Workbook (v{{ GetEmbeddedVersionNumber(block) }} → v{{ newerWbVer.VersionNumber }})
                                      </button>
                                    }
                                    <button
                                      type="button"
                                      class="mj-slides-mini-btn"
                                      (click)="ExecuteSlideRegionBlock(region, block)"
                                      [attr.data-testid]="'refresh-slide-block-' + region.RegionID"
                                    >
                                      <i class="fa-solid fa-arrows-rotate"></i> Refresh
                                    </button>
                                    @if (IsEditable && block.Mode === 'Live') {
                                      <button
                                        type="button"
                                        class="mj-slides-mini-btn"
                                        (click)="PromptFreezeSlideRegionBlock(region, block)"
                                        [attr.data-testid]="'freeze-slide-block-' + region.RegionID"
                                      >
                                        <i class="fa-solid fa-snowflake"></i> Freeze
                                      </button>
                                    } @else if (IsEditable && block.Mode === 'Frozen') {
                                      <button
                                        type="button"
                                        class="mj-slides-mini-btn"
                                        (click)="UnfreezeSlideRegionBlock(region, block)"
                                        [attr.data-testid]="'unfreeze-slide-block-' + region.RegionID"
                                      >
                                        <i class="fa-solid fa-bolt"></i> Switch to Live
                                      </button>
                                    }
                                  </div>
                                }

                                @if (IsInlineOleArtifactBlock(block) && WorkspaceMode === 'edit' && IsEditable) {
                                  <div class="mj-slide-live-block-controls">
                                    <button
                                      type="button"
                                      class="mj-slides-mini-btn"
                                      [class.active]="IsOleRegionEditing(region.RegionID)"
                                      [disabled]="!CanEditRegion(region)"
                                      (click)="ToggleOleRegionEditing(region.RegionID)"
                                      [attr.data-testid]="'slide-ole-toggle-edit-' + region.RegionID"
                                    >
                                      <i class="fa-solid fa-pen-to-square"></i>
                                      {{ IsOleRegionEditing(region.RegionID) ? 'Editing Inline' : 'Edit Inline' }}
                                    </button>
                                  </div>
                                }
                              </div>

                              <!-- Inline OLE Artifact / Whiteboard Region (§ 3.4.1 & § 5.1) -->
                              @if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
                                @if (IsSnapshotVerified(block, region.RegionID, ActiveSlide.SlideID)) {
                                  @let preVerifiedSnap = GetBlockPreVerifiedSnapshot(block, region.RegionID, ActiveSlide.SlideID);
                                  <div
                                    class="mj-slide-block-provenance"
                                    [attr.data-testid]="'slide-frozen-provenance-' + region.RegionID"
                                  >
                                    <i class="fa-solid fa-shield-halved"></i>
                                    <span>
                                      Frozen snapshot captured at {{ block.FrozenSnapshot.FrozenAt || preVerifiedSnap?.FrozenAt }}
                                      @if (block.FrozenSnapshot.FrozenByUserName || preVerifiedSnap?.FrozenByUserName || block.FrozenSnapshot.FrozenByUserID) {
                                        by
                                        <strong>{{
                                          block.FrozenSnapshot.FrozenByUserName ||
                                            preVerifiedSnap?.FrozenByUserName ||
                                            block.FrozenSnapshot.FrozenByUserID
                                        }}</strong>
                                      }
                                    </span>
                                  </div>
                                } @else {
                                  <div
                                    class="mj-slide-block-error"
                                    data-testid="unverified-snapshot-banner"
                                    [attr.data-region-id]="region.RegionID"
                                  >
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                    <span>Unverified Snapshot — signature missing or invalid</span>
                                  </div>
                                }
                              }
                              @if (IsInlineOleArtifactBlock(block)) {
                                <div
                                  class="mj-slide-ole-viewer-container"
                                  [attr.data-testid]="'slide-ole-artifact-host-' + region.RegionID"
                                >
                                  @if (GetOrCreateEmbeddedArtifactVersion(region, block); as childVersion) {
                                    <mj-artifact-type-plugin-viewer
                                      [Provider]="Provider"
                                      [artifactVersion]="childVersion"
                                      [artifactTypeName]="block.ArtifactType || 'Whiteboard'"
                                      [AncestorArtifactIDs]="ChildEmbedAncestorIds"
                                      [readonly]="!(CanEditRegion(region) && IsOleRegionEditing(region.RegionID))"
                                      (ContentCommitted)="OnEmbeddedArtifactContentCommitted(region, block, $event)"
                                      (OpenEntityRecord)="OpenEntityRecord.emit($event)"
                                      (navigationRequest)="navigationRequest.emit($event)"
                                    ></mj-artifact-type-plugin-viewer>
                                  } @else {
                                    <div
                                      class="mj-slide-empty-block"
                                      [attr.data-testid]="'slide-ole-placeholder-' + region.RegionID"
                                    >
                                      @if (IsEmbeddedArtifactLoading(block)) {
                                        <i class="fa-solid fa-spinner fa-spin"></i> Loading embedded artifact…
                                      } @else {
                                        <span>{{ GetEmbeddedArtifactError(block) || 'Embedded artifact unavailable or access denied.' }}</span>
                                      }
                                    </div>
                                  }
                                </div>
                              } @else {
                                <!-- Live or Frozen MJ Data Block Table / SVG Chart / Access-Denied Error State -->
                                @if (GetBlockExecutionError(block); as blockError) {
                                  <div
                                    class="mj-slide-block-error"
                                    [attr.data-access-denied]="blockError.AccessDenied ? 'true' : 'false'"
                                    [attr.data-testid]="'slide-block-error-' + region.RegionID"
                                  >
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                    <span>{{ blockError.ErrorMessage || 'Access denied or block execution failed.' }}</span>
                                  </div>
                                } @else if (GetDisplayRowsForBlock(block); as displayData) {
                                  @if (IsChartDisplayBlock(block) && BuildStageChartModel(block, displayData); as chart) {
                                    <div class="mj-slide-chart-svg-wrap" [attr.data-testid]="'slide-block-chart-' + region.RegionID">
                                      <svg
                                        class="mj-slide-chart-svg"
                                        viewBox="0 0 360 180"
                                        role="img"
                                        [attr.aria-label]="block.Title || region.Label"
                                      >
                                        @if (chart.ChartType === 'pie' && chart.PieSlices) {
                                          @for (slice of chart.PieSlices; track slice.Label) {
                                            <path [attr.d]="slice.PathData" [attr.fill]="slice.Color"></path>
                                          }
                                        } @else if (chart.ChartType === 'line' || chart.ChartType === 'area') {
                                          @for (ser of chart.Series; track ser.Name) {
                                            <polyline
                                              fill="none"
                                              [attr.stroke]="ser.Color"
                                              stroke-width="2.5"
                                              [attr.points]="FormatChartPolylinePoints(ser.Values, chart.MaxValue)"
                                            ></polyline>
                                          }
                                          @for (cat of chart.Categories; track $index) {
                                            <text
                                              [attr.x]="GetChartCategoryX($index, chart.Categories.length)"
                                              y="170"
                                              text-anchor="middle"
                                              class="mj-slide-chart-axis-label"
                                            >{{ cat }}</text>
                                          }
                                        } @else {
                                          @for (ser of chart.Series; track ser.Name; let sIdx = $index) {
                                            @for (val of ser.Values; track $index; let cIdx = $index) {
                                              <rect
                                                [attr.x]="GetChartBarX(cIdx, sIdx, chart.Categories.length, chart.Series.length)"
                                                [attr.y]="GetChartBarY(val, chart.MaxValue)"
                                                [attr.width]="GetChartBarWidth(chart.Categories.length, chart.Series.length)"
                                                [attr.height]="GetChartBarHeight(val, chart.MaxValue)"
                                                [attr.fill]="ser.Color"
                                                rx="2"
                                              ></rect>
                                            }
                                          }
                                          @for (cat of chart.Categories; track $index) {
                                            <text
                                              [attr.x]="GetChartCategoryX($index, chart.Categories.length)"
                                              y="170"
                                              text-anchor="middle"
                                              class="mj-slide-chart-axis-label"
                                            >{{ cat }}</text>
                                          }
                                        }
                                      </svg>
                                      <div class="mj-slide-chart-legend">
                                        @for (ser of chart.Series; track ser.Name) {
                                          <span class="mj-slide-chart-legend-item">
                                            <span class="mj-slide-chart-swatch" [style.background]="ser.Color"></span>
                                            {{ ser.Name }}
                                          </span>
                                        }
                                      </div>
                                    </div>
                                  } @else if (displayData.Columns.length > 0) {
                                    <div class="mj-slide-data-table-wrap">
                                      <table
                                        class="mj-slide-data-table"
                                        [attr.data-testid]="'slide-live-block-table-' + region.RegionID"
                                      >
                                        <thead>
                                          <tr>
                                            @for (col of displayData.Columns; track col.Name) {
                                              <th>{{ col.DisplayName || col.Name }}</th>
                                            }
                                          </tr>
                                        </thead>
                                        <tbody>
                                          @for (row of displayData.Rows; track $index) {
                                            <tr>
                                              @for (col of displayData.Columns; track col.Name) {
                                                <td>{{ FormatCellValue(row[col.Name]) }}</td>
                                              }
                                            </tr>
                                          }
                                        </tbody>
                                      </table>
                                    </div>
                                  } @else {
                                    <div class="mj-slide-empty-block">
                                      No rows returned for {{ block.EntityName || block.QueryName || block.Title }}.
                                    </div>
                                  }
                                }
                              }
                            </div>
                          }
                        } @else if (region.Kind === 'big-number') {
                          <div class="mj-slide-big-number-region" [attr.data-testid]="'slide-big-number-' + region.RegionID">
                            <div
                              class="mj-slide-big-number-value"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (input)="OnSlideContentEditableInput()"
                              (blur)="OnBigNumberFieldBlur(region, 'value', $event, DisplayedSlide.SlideID)"
                              data-placeholder="0%"
                              [attr.data-testid]="'editable-big-number-value-' + region.RegionID"
                            >{{ region.BigNumberValue || '' }}</div>
                            <div
                              class="mj-slide-big-number-label"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (input)="OnSlideContentEditableInput()"
                              (blur)="OnBigNumberFieldBlur(region, 'label', $event, DisplayedSlide.SlideID)"
                              data-placeholder="Key Performance Indicator"
                            >{{ region.BigNumberLabel || '' }}</div>
                            @if (region.BigNumberDelta || (CanEditRegion(region) && WorkspaceMode === 'edit')) {
                              <span
                                class="mj-slide-big-number-delta"
                                [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                                (input)="OnSlideContentEditableInput()"
                                (blur)="OnBigNumberFieldBlur(region, 'delta', $event, DisplayedSlide.SlideID)"
                                data-placeholder="+0% YoY"
                              >{{ region.BigNumberDelta || '' }}</span>
                            }
                          </div>
                        } @else if (region.Kind === 'quote') {
                          <blockquote class="mj-slide-quote-region">
                            <div
                              class="mj-slide-quote-text"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (input)="OnSlideContentEditableInput()"
                              (blur)="OnInlineRegionContentBlur(region, $event, DisplayedSlide.SlideID)"
                              data-placeholder="Enter executive quote..."
                              [attr.data-testid]="'editable-region-content-' + region.RegionID"
                            >{{ region.MarkdownContent }}</div>
                            <cite
                              class="mj-slide-quote-cite"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (input)="OnSlideContentEditableInput()"
                              (blur)="OnQuoteAttributionBlur(region, $event, DisplayedSlide.SlideID)"
                              data-placeholder="Executive Sponsor"
                            >{{ region.QuoteAttribution || '' }}</cite>
                          </blockquote>
                        } @else if (region.Kind === 'image') {
                          <div class="mj-slide-image-region" [attr.data-testid]="'slide-image-region-' + region.RegionID">
                            @if (GetSanitizedRegionImageUrl(region); as safeImageUrl) {
                              <img
                                class="mj-slide-region-img"
                                [src]="safeImageUrl"
                                [alt]="region.ImageAlt || region.Label"
                              />
                            } @else {
                              <div class="mj-slide-empty-block">
                                <span>{{ region.ImageAlt || 'No valid image URL configured' }}</span>
                              </div>
                            }
                          </div>
                        } @else if (region.Kind === 'table' && ParseMarkdownTable(region.MarkdownContent); as mdTable) {
                          <div class="mj-slide-data-table-wrap" [attr.data-testid]="'slide-markdown-table-' + region.RegionID">
                            <table class="mj-slide-data-table">
                              <thead>
                                <tr>
                                  @for (hdr of mdTable.Headers; track $index) {
                                    <th>{{ hdr }}</th>
                                  }
                                </tr>
                              </thead>
                              <tbody>
                                @for (row of mdTable.Rows; track $index) {
                                  <tr>
                                    @for (cell of row; track $index) {
                                      <td>{{ cell }}</td>
                                    }
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        } @else {
                          <!-- Rich Text / Callout / Bullet List Region -->
                          <div
                            class="mj-slide-richtext-region"
                            [class.callout-box]="region.Kind === 'callout'"
                            [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                            (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, region.RegionID)"
                            (input)="OnSlideContentEditableInput()"
                            (blur)="OnInlineRegionContentBlur(region, $event, DisplayedSlide.SlideID)"
                            [innerHTML]="RenderRegionHtml(region.MarkdownContent)"
                            data-placeholder="Click to add slide content..."
                            [attr.data-testid]="'editable-region-content-' + region.RegionID"
                          ></div>
                        }
                      </div>
                    }
                  </div>

                  <!-- Master Slide Footer -->
                  <footer class="mj-slide-master-footer" data-testid="slide-master-footer">
                    <span>{{ ActiveDeckForDisplay.Master.FooterText || 'Confidential' }}</span>
                    @if (ActiveDeckForDisplay.Master.ShowSlideNumbers) {
                      <span data-testid="slide-footer-number">
                        Slide {{ ActiveSlideIndex + 1 }} / {{ ActiveDeckForDisplay.Slides.length }}
                      </span>
                    }
                  </footer>
                </section>

                <!-- Collapsible Speaker Notes Bar (in Edit Mode) -->
                @if (WorkspaceMode === 'edit') {
                  <div
                    class="mj-slides-speaker-notes-bar"
                    (contextmenu)="OnSpeakerNotesContextMenu($event)"
                    data-testid="speaker-notes-panel"
                  >
                    <div class="mj-slides-speaker-notes-header">
                      <span><i class="fa-regular fa-note-sticky"></i> Speaker Notes (Slide {{ ActiveSlideIndex + 1 }})</span>
                      <span class="mj-slides-muted-hint">Included in Presenter View &amp; PowerPoint export</span>
                    </div>
                    <textarea
                      class="mj-slides-speaker-notes-input"
                      [ngModel]="ActiveSlide.SpeakerNotes"
                      (ngModelChange)="OnSpeakerNotesChange($event)"
                      [readonly]="!CanEditSlideElements"
                      placeholder="Add presenter talking points and cues for this slide..."
                      data-testid="speaker-notes-input"
                    ></textarea>
                  </div>
                }

                <!-- Option A Contextual Floating Slide Design Pill (keeps Row 1 calm while putting Layout/Theme/Motion/Lock/Polish inline) -->
                @if (WorkspaceMode === 'edit' && IsEditable && !IsPresentationActive) {
                  <div class="mj-slides-floating-design-wrap">
                    @if (ShowDesignPopover) {
                      <div class="mj-slides-design-popover" data-testid="slides-design-popover">
                        <div class="mj-slides-design-popover-head">
                          <span>Layout &amp; Theme Preset</span>
                          <button
                            type="button"
                            class="mj-slides-icon-btn"
                            aria-label="Close design popover"
                            (click)="ShowDesignPopover = false"
                          >
                            <i class="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                        <div class="mj-slides-design-grid">
                          @for (layoutMeta of LayoutCatalog; track layoutMeta.Kind) {
                            <button
                              type="button"
                              class="mj-slides-design-chip"
                              [class.active]="ActiveSlide.Layout === layoutMeta.Kind"
                              [disabled]="!CanEditSlideElements"
                              [title]="layoutMeta.Description"
                              [attr.data-testid]="'slide-layout-opt-' + layoutMeta.Kind"
                              (click)="OnChangeActiveSlideLayout(layoutMeta.Kind); ShowDesignPopover = false"
                            >
                              {{ layoutMeta.Label }}
                            </button>
                          }
                        </div>
                        <div class="mj-slides-design-section-label">Theme Presets</div>
                        <div class="mj-slides-design-swatches">
                          @for (preset of ThemePresets; track preset.ThemeID) {
                            <button
                              type="button"
                              class="mj-slides-design-swatch"
                              [class.active]="Deck.Theme.ThemeID === preset.ThemeID"
                              [title]="preset.ThemeID"
                              [attr.data-testid]="'slide-theme-swatch-' + preset.ThemeID"
                              (click)="OnSelectThemePreset(preset.ThemeID)"
                            >
                              <span
                                class="mj-slides-swatch-dot"
                                [style.background]="preset.PrimaryColor"
                              ></span>
                              <span>{{ preset.ThemeID }}</span>
                            </button>
                          }
                        </div>
                      </div>
                    }

                    <div class="mj-slides-floating-pill" data-testid="slides-floating-design-pill">
                      <button
                        type="button"
                        class="mj-slides-pill-btn"
                        [class.active]="ShowDesignPopover"
                        [disabled]="!CanEditSlideElements"
                        (click)="ShowDesignPopover = !ShowDesignPopover"
                        title="Choose slide layout or theme preset"
                        data-testid="slides-floating-layout-btn"
                      >
                        <i class="fa-solid fa-table-columns"></i>
                        <span>{{ ActiveSlideLayoutLabel }}</span>
                        <i class="fa-solid fa-caret-down"></i>
                      </button>

                      <button
                        type="button"
                        class="mj-slides-pill-btn"
                        [disabled]="!CanEditSlideElements"
                        (click)="CycleActiveSlideTransition()"
                        title="Cycle Present transition (None / Fade / Slide / Zoom)"
                        data-testid="slides-floating-motion-btn"
                      >
                        <i class="fa-solid fa-wand-sparkles"></i>
                        <span>{{ ActiveSlide.Transition || 'fade' }}</span>
                      </button>

                      <button
                        type="button"
                        class="mj-slides-pill-btn"
                        [class.active]="!!ActiveSlide.Locked"
                        [disabled]="!CanToggleCurrentSlideLock"
                        (click)="ToggleCurrentSlideLock()"
                        [title]="ActiveSlide.Locked ? (ActiveSlide.AllowEditors ? 'Locked (editors allowed)' : 'Locked (owner only)') : 'Lock slide'"
                        data-testid="slides-lock-slide-quick-btn"
                      >
                        <i class="fa-solid" [ngClass]="ActiveSlide.Locked ? 'fa-lock' : 'fa-lock-open'"></i>
                        @if (ActiveSlide.Locked) {
                          <span>Locked</span>
                        }
                      </button>

                      @if (ActiveSlide.Locked && CanToggleCurrentSlideLock) {
                        <button
                          type="button"
                          class="mj-slides-pill-btn"
                          [class.active]="!!ActiveSlide.AllowEditors"
                          (click)="ToggleCurrentSlideLockScope()"
                          [title]="ActiveSlide.AllowEditors ? 'Switch to Owner-only lock' : 'Allow collaborators with edit rights'"
                          data-testid="slides-lock-slide-scope-btn"
                        >
                          <i class="fa-solid" [ngClass]="ActiveSlide.AllowEditors ? 'fa-users' : 'fa-user-shield'"></i>
                        </button>
                      }

                      <span class="mj-slides-pill-sep"></span>

                      <button
                        type="button"
                        class="mj-slides-pill-btn polish"
                        (click)="OnPolishActiveSlide()"
                        [disabled]="!CanEditSlideElements"
                        title="Auto-polish typography, KPI cards, and progressive reveal steps"
                        data-testid="polish-slide-btn"
                      >
                        <i class="fa-solid fa-sparkles"></i>
                        <span>Polish</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Presenter View Side Cockpit (Next Slide + Speaker Notes + Elapsed Timer) -->
              @if (WorkspaceMode === 'presenter') {
                <aside class="mj-slides-presenter-cockpit" data-testid="presenter-view-cockpit">
                  <div class="mj-presenter-timer-card">
                    <div>
                      <div class="mj-presenter-card-label">Elapsed Time</div>
                      <div class="mj-presenter-timer-digits" data-testid="presenter-elapsed-timer">
                        {{ FormattedPresenterElapsed }}
                      </div>
                    </div>
                    <span class="mj-presenter-live-frozen-pill">
                      <i class="fa-solid fa-snowflake"></i> Presentation Snapshot
                    </span>
                  </div>

                  <div class="mj-presenter-next-card" data-testid="presenter-next-slide-card">
                    <div class="mj-presenter-card-label">Next Slide</div>
                    @if (NextSlidePreview; as nextSlide) {
                      <div class="mj-presenter-next-preview">
                        <strong>{{ nextSlide.SlideNumber }}. {{ nextSlide.Title }}</strong>
                        @if (nextSlide.Subtitle) {
                          <p>{{ nextSlide.Subtitle }}</p>
                        }
                        <span class="mj-slides-badge">{{ nextSlide.Layout }}</span>
                      </div>
                    } @else {
                      <div class="mj-presenter-next-preview">End of Presentation</div>
                    }
                  </div>

                  <div
                    class="mj-presenter-notes-card"
                    (contextmenu)="OnSpeakerNotesContextMenu($event)"
                    data-testid="presenter-speaker-notes-card"
                  >
                    <div class="mj-presenter-card-label">Speaker Notes — Slide {{ ActiveSlideIndex + 1 }}</div>
                    <div class="mj-presenter-notes-body">
                      {{ DisplayedSlide.SpeakerNotes || 'No speaker notes recorded for this slide.' }}
                    </div>
                  </div>
                </aside>
              }
            </div>
          }
        </main>

        <!-- Right Drawer: Theme & Brand Colors OR Slide Comments -->
        @if (RightDrawerTab !== 'none' && WorkspaceMode !== 'present') {
          <aside class="mj-slides-right-drawer" data-testid="slides-right-drawer">
            @if (RightDrawerTab === 'theme') {
              <div class="mj-slides-drawer-section" data-testid="theme-brand-drawer">
                <div class="mj-slides-drawer-header">
                  <strong>Theme &amp; Brand Colors</strong>
                  <button type="button" class="mj-slides-icon-btn" (click)="RightDrawerTab = 'none'">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div class="mj-slides-drawer-subtitle">Preset Themes</div>
                <div class="mj-slides-theme-preset-list">
                  @for (preset of ThemePresets; track preset.ThemeID) {
                    <button
                      type="button"
                      class="mj-slides-theme-preset-btn"
                      [class.active]="Deck.Theme.ThemeID === preset.ThemeID"
                      (click)="OnSelectThemePreset(preset.ThemeID)"
                      [attr.data-testid]="'theme-preset-' + preset.ThemeID"
                    >
                      <span>{{ preset.Name }}</span>
                      <span class="mj-slides-theme-swatches">
                        <span class="mj-slides-swatch" [style.background]="preset.PrimaryColor"></span>
                        <span class="mj-slides-swatch" [style.background]="preset.AccentColor"></span>
                        <span class="mj-slides-swatch" [style.background]="preset.BackgroundColor"></span>
                      </span>
                    </button>
                  }
                </div>

                <div class="mj-slides-drawer-subtitle">Organization Brand Colors</div>
                <div class="mj-slides-brand-seed-form">
                  <label class="mj-slides-field">
                    <span>Organization Name</span>
                    <input
                      type="text"
                      class="mj-slides-input"
                      [(ngModel)]="BrandSeedOrgName"
                      placeholder="e.g., Acme FinTech"
                      data-testid="brand-seed-org-input"
                    />
                  </label>
                  <label class="mj-slides-field">
                    <span>Primary Brand Hex</span>
                    <input
                      type="text"
                      class="mj-slides-input"
                      [(ngModel)]="BrandSeedPrimaryColor"
                      placeholder="#7C3AED"
                      data-testid="brand-seed-primary-input"
                    />
                  </label>
                  <label class="mj-slides-field">
                    <span>Accent Brand Hex</span>
                    <input
                      type="text"
                      class="mj-slides-input"
                      [(ngModel)]="BrandSeedAccentColor"
                      placeholder="#F59E0B"
                      data-testid="brand-seed-accent-input"
                    />
                  </label>
                  <label class="mj-slides-field">
                    <span>Stage Background Hex</span>
                    <input
                      type="text"
                      class="mj-slides-input"
                      [(ngModel)]="BrandSeedBackgroundColor"
                      placeholder="#0F172A"
                      data-testid="brand-seed-bg-input"
                    />
                  </label>
                  <button
                    type="button"
                    class="mj-slides-tool-btn primary full-width"
                    (click)="OnApplyOrganizationBrandSeeds()"
                    data-testid="apply-brand-seeds-btn"
                  >
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Apply Brand Colors
                  </button>
                </div>

                @if (LastExportedPptxSummary) {
                  <div class="mj-slides-export-audit" data-testid="pptx-export-audit-summary">
                    <strong>Last .pptx Export Verified:</strong>
                    <div>Slides: {{ LastExportedPptxSummary.SlideCount }}</div>
                    <div>Frozen Live Blocks: {{ LastExportedPptxSummary.FrozenBlockCount }}</div>
                    <div>Archive Size: {{ LastExportedPptxSummary.ByteLength }} bytes</div>
                  </div>
                }
              </div>
            }

            @if (RightDrawerTab === 'comments') {
              <div class="mj-slides-drawer-section" data-testid="slide-comments-drawer">
                <div class="mj-slides-drawer-header">
                  <strong>Comments &amp; Suggestions</strong>
                  <button type="button" class="mj-slides-icon-btn" (click)="RightDrawerTab = 'none'">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <!-- NW-3 Filter: This Slide Only vs Entire Deck -->
                <div class="mj-slides-comment-filter-bar" role="group" aria-label="Filter comment threads">
                  <button
                    type="button"
                    class="mj-slides-mini-btn"
                    [class.active]="CommentFilterScope === 'slide'"
                    (click)="CommentFilterScope = 'slide'"
                    data-testid="slides-comment-filter-slide-btn"
                  >
                    This Slide ({{ GetSlideOpenCommentCount(ActiveSlide.SlideID) }})
                  </button>
                  <button
                    type="button"
                    class="mj-slides-mini-btn"
                    [class.active]="CommentFilterScope === 'deck'"
                    (click)="CommentFilterScope = 'deck'"
                    data-testid="slides-comment-filter-deck-btn"
                  >
                    Entire Deck ({{ AnchoredThreads.length }})
                  </button>
                </div>

                @if (CanComment) {
                  <div class="mj-slides-new-comment-box">
                    <div class="mj-slides-comment-target-pill">
                      Section: <strong>{{ PendingAnchorLabel }}</strong>
                    </div>
                    <textarea
                      class="mj-slides-input"
                      rows="3"
                      [(ngModel)]="NewCommentDraft"
                      placeholder="Add a comment or @Agent mention on this slide region..."
                      data-testid="slide-comment-draft-input"
                    ></textarea>
                    <button
                      type="button"
                      class="mj-slides-tool-btn primary full-width"
                      (click)="SubmitSlideRegionComment()"
                      data-testid="submit-slide-comment-btn"
                    >
                      <i class="fa-solid fa-paper-plane"></i> Post Comment
                    </button>
                  </div>
                }

                <!-- NW-3 Shared Yjs Suggestions -->
                @if (FilteredSlideSuggestions.length > 0) {
                  <div class="mj-slides-suggestions-section" data-testid="slides-nw3-suggestions-list">
                    <div class="mj-slides-more-section-label">
                      Suggested Edits ({{ FilteredSlideSuggestions.length }})
                    </div>
                    @for (sug of FilteredSlideSuggestions; track sug.SuggestionID) {
                      <div
                        class="mj-slides-suggestion-card"
                        [attr.data-status]="sug.Status"
                        [attr.data-testid]="'slides-suggestion-card-' + sug.SuggestionID"
                      >
                        <div class="mj-slides-thread-header">
                          <button
                            type="button"
                            class="mj-slides-anchor-jump-btn"
                            (click)="JumpToSlideAnchorKey(sug.SlideID + ':' + (sug.RegionID || 'title'))"
                          >
                            <i class="fa-solid fa-lightbulb"></i> {{ sug.AuthorName }} · {{ sug.Field }}
                          </button>
                          <span class="mj-slides-badge">{{ sug.Status }}</span>
                        </div>
                        @if (sug.OriginalText) {
                          <div class="mj-slides-suggestion-diff-old">- {{ sug.OriginalText }}</div>
                        }
                        <div class="mj-slides-suggestion-diff-new">+ {{ sug.SuggestedText }}</div>
                        @if (sug.Rationale) {
                          <div class="mj-slides-muted-hint">{{ sug.Rationale }}</div>
                        }
                        @if (sug.Status === 'Pending' && CanEditSlideElements) {
                          <div class="mj-slides-thread-actions">
                            <button
                              type="button"
                              class="mj-slides-mini-btn primary"
                              (click)="AcceptSlideSuggestion(sug)"
                              [attr.data-testid]="'slides-accept-suggestion-' + sug.SuggestionID"
                            >
                              <i class="fa-solid fa-check"></i> Accept
                            </button>
                            <button
                              type="button"
                              class="mj-slides-mini-btn"
                              (click)="RejectSlideSuggestion(sug)"
                              [attr.data-testid]="'slides-reject-suggestion-' + sug.SuggestionID"
                            >
                              <i class="fa-solid fa-xmark"></i> Reject
                            </button>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                <div class="mj-slides-thread-list" data-testid="slide-comment-thread-list">
                  @for (thread of FilteredAnchoredThreads; track thread.ConversationID) {
                    <div
                      class="mj-slides-thread-card"
                      [attr.data-status]="thread.Status"
                      [attr.data-testid]="'slide-thread-' + thread.ConversationID"
                    >
                      <div class="mj-slides-thread-header">
                        <button
                          type="button"
                          class="mj-slides-anchor-jump-btn"
                          title="Jump to anchored slide section"
                          (click)="JumpToSlideAnchorKey(thread.AnchorKey)"
                          [attr.data-testid]="'jump-slide-thread-' + thread.ConversationID"
                        >
                          <i class="fa-solid fa-thumbtack"></i> {{ thread.AnchorLabel }}
                        </button>
                        <span class="mj-slides-badge">{{ thread.Status }}</span>
                      </div>
                      @for (msg of thread.Messages; track msg.DetailID) {
                        <div class="mj-slides-thread-msg" [attr.data-role]="msg.Role">
                          <strong>{{ msg.UserName }}:</strong> {{ msg.Message }}
                        </div>
                      }
                      @if (CanComment) {
                        <div class="mj-slides-thread-reply-box">
                          <input
                            type="text"
                            class="mj-slides-input"
                            [ngModel]="GetThreadReplyDraft(thread.ConversationID)"
                            (ngModelChange)="SetThreadReplyDraft(thread.ConversationID, $event)"
                            (keydown.enter)="SubmitReplyToAnchoredSlideThread(thread)"
                            placeholder="Reply or @Agent..."
                            [attr.data-testid]="'reply-input-slide-thread-' + thread.ConversationID"
                          />
                          <button
                            type="button"
                            class="mj-slides-mini-btn primary"
                            (click)="SubmitReplyToAnchoredSlideThread(thread)"
                            [attr.data-testid]="'reply-submit-slide-thread-' + thread.ConversationID"
                          >
                            Reply
                          </button>
                        </div>
                      }
                      @if (IsEditable) {
                        <div class="mj-slides-thread-actions">
                          <button
                            type="button"
                            class="mj-slides-mini-btn"
                            (click)="ToggleResolveSlideThread(thread)"
                            [attr.data-testid]="'resolve-slide-thread-' + thread.ConversationID"
                          >
                            {{ thread.Status === 'Open' ? 'Resolve' : 'Reopen' }}
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </aside>
        }
      </div>

      <!-- Freeze Live Block Confirmation Modal -->
      @if (PendingFreezeBlock && PendingFreezeRegion) {
        <div class="mj-slides-modal-backdrop" data-testid="slides-freeze-warning-modal">
          <div class="mj-slides-modal-card">
            <h3><i class="fa-solid fa-triangle-exclamation"></i> Freeze Live Slide Snapshot</h3>
            <p>
              Freezing <strong>{{ PendingFreezeBlock.Title || PendingFreezeRegion.Label }}</strong> embeds the rows
              currently visible under your user permissions directly into this presentation. Anyone with read access
              to this presentation will see these frozen values.
            </p>
            <div class="mj-slides-modal-actions">
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="ConfirmFreezeSlideBlock()"
                data-testid="confirm-slide-freeze-btn"
              >
                Acknowledge &amp; Freeze Snapshot
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn"
                (click)="CancelFreezeSlideBlock()"
                data-testid="cancel-slide-freeze-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      <!-- § 5.2 "Make a Deck from This Doc" Modal -->
      @if (ShowMarkdownToDeckModal) {
        <div class="mj-slides-modal-backdrop" data-testid="markdown-to-deck-modal">
          <div class="mj-slides-modal-card wide">
            <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Slide Deck from Markdown Document (§ 5.2)</h3>
            <p>
              Paste or edit a Markdown Document (including <code>#</code> headings, bullet lists, tables,
              <code>&gt; Speaker Notes:</code>, and <code>:::mj-block</code> directives) to convert it into a structured
              16:9 presentation.
            </p>
            <textarea
              class="mj-slides-source-textarea"
              rows="10"
              [(ngModel)]="MarkdownConversionDraft"
              data-testid="markdown-to-deck-textarea"
            ></textarea>
            <div class="mj-slides-modal-actions">
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="ConvertDraftMarkdownToDeck()"
                data-testid="confirm-markdown-to-deck-btn"
              >
                Convert Document to Slides
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn"
                (click)="ShowMarkdownToDeckModal = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      <!-- P1.2 Guided Cross-Artifact Sheet Chart / Range Picker Modal -->
      @if (ShowSheetEmbedModal) {
        <div class="mj-slides-modal-backdrop" data-testid="slides-sheet-embed-modal">
          <div class="mj-slides-modal-card wide">
            <h3><i class="fa-solid fa-chart-column"></i> Embed Spreadsheet Chart or Range</h3>
            <p>Pick a Spreadsheet workbook, choose a Chart or Cell Range, and optionally pin to its current version.</p>

            <div class="mj-slides-field-stack">
              <label class="mj-slides-inline-select-label">
                <span>Step 1 · Spreadsheet Workbook</span>
                <select
                  class="mj-slides-select"
                  [(ngModel)]="SheetEmbedArtifactID"
                  (ngModelChange)="OnSheetEmbedArtifactSelected($event)"
                  data-testid="slides-sheet-embed-artifact-select"
                >
                  @for (wb of AvailableSpreadsheetArtifacts; track wb.ID) {
                    <option [value]="wb.ID">{{ wb.Name }}</option>
                  }
                </select>
              </label>

              <div class="mj-slides-mode-pills" role="radiogroup" aria-label="Sheet Embed Type">
                <button
                  type="button"
                  class="mj-slides-mode-pill"
                  [class.active]="SheetEmbedMode === 'chart'"
                  data-testid="slides-sheet-embed-mode-chart"
                  (click)="SheetEmbedMode = 'chart'"
                >
                  <i class="fa-solid fa-chart-column"></i> Chart
                </button>
                <button
                  type="button"
                  class="mj-slides-mode-pill"
                  [class.active]="SheetEmbedMode === 'range'"
                  data-testid="slides-sheet-embed-mode-range"
                  (click)="SheetEmbedMode = 'range'"
                >
                  <i class="fa-solid fa-table-cells"></i> Cell Range
                </button>
              </div>

              @if (SheetEmbedWorkbookSheets.length > 0) {
                <label class="mj-slides-inline-select-label">
                  <span>Worksheet</span>
                  <select
                    class="mj-slides-select"
                    [(ngModel)]="SheetEmbedWorksheetName"
                    (ngModelChange)="OnSheetEmbedWorksheetChanged($event)"
                    data-testid="slides-sheet-embed-worksheet-select"
                  >
                    @for (ws of SheetEmbedWorkbookSheets; track ws.SheetID) {
                      <option [value]="ws.SheetID">{{ ws.Name }}</option>
                    }
                  </select>
                </label>
              }

              @if (SheetEmbedMode === 'chart') {
                <label class="mj-slides-inline-select-label">
                  <span>Chart</span>
                  @if (SheetEmbedWorksheetCharts.length > 0) {
                    <select
                      class="mj-slides-select"
                      [(ngModel)]="SheetEmbedChartID"
                      data-testid="slides-sheet-embed-chart-select"
                    >
                      @for (ch of SheetEmbedWorksheetCharts; track ch.ChartID) {
                        <option [value]="ch.ChartID">{{ ch.Title || ch.ChartID }} ({{ ch.ChartType }})</option>
                      }
                    </select>
                  } @else {
                    <input
                      type="text"
                      class="mj-slides-input"
                      [(ngModel)]="SheetEmbedChartID"
                      placeholder="Chart ID (e.g., chart-1)"
                      data-testid="slides-sheet-embed-chart-input"
                    />
                  }
                </label>
              } @else {
                <label class="mj-slides-inline-select-label">
                  <span>Cell Range</span>
                  <input
                    type="text"
                    class="mj-slides-input"
                    [(ngModel)]="SheetEmbedRange"
                    placeholder="A1:D8"
                    data-testid="slides-sheet-embed-range-input"
                  />
                </label>
              }

              <label class="mj-slides-checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="SheetEmbedPinVersion"
                  data-testid="slides-sheet-embed-pin-checkbox"
                />
                <span>
                  Pin to current version
                  @if (SheetEmbedLatestVersionNumber > 0) {
                    (v{{ SheetEmbedLatestVersionNumber }})
                  }
                  instead of tracking latest
                </span>
              </label>
            </div>

            <div class="mj-slides-modal-actions">
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                [disabled]="!SheetEmbedArtifactID"
                (click)="ConfirmSheetEmbedModal()"
                data-testid="slides-sheet-embed-confirm-btn"
              >
                Embed in Slide
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn"
                (click)="ShowSheetEmbedModal = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Full-Screen Presentation Overlays: Blackout / Whiteout / Laser / Floating Auto-Hide HUD -->
      @if (IsPresentationActive && PresentationOverlayMode !== 'none') {
        <div
          class="mj-slides-stage-overlay"
          [class.blackout]="PresentationOverlayMode === 'blackout'"
          [class.whiteout]="PresentationOverlayMode === 'whiteout'"
          (click)="TogglePresentationOverlay('none')"
          data-testid="present-screen-overlay"
        >
          <span>
            {{ PresentationOverlayMode === 'blackout' ? 'Screen Blacked Out — Press B or Esc to resume' : 'White Screen — Press W or Esc to resume' }}
          </span>
        </div>
      }

      @if (IsPresentationActive && LaserPointerActive) {
        <div
          class="mj-slides-laser-dot"
          [style.left.%]="LaserPointerX"
          [style.top.%]="LaserPointerY"
          data-testid="present-laser-dot"
        ></div>
      }

      @if (IsPresentationActive) {
        <div
          class="mj-slides-floating-hud"
          [class.visible]="PresentHudVisible"
          (mouseenter)="KeepPresentHudVisible()"
          data-testid="present-floating-hud"
        >
          <button
            type="button"
            class="mj-slides-hud-btn"
            [disabled]="!CanNavigatePrevSlide"
            (click)="PrevSlide()"
            title="Previous (Left Arrow / PageUp)"
            data-testid="hud-prev-btn"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span class="mj-slides-hud-counter" data-testid="hud-slide-counter">
            {{ ActiveSlideIndex + 1 }} / {{ ActiveDeckForDisplay.Slides.length }}
            @if (MaxRevealStepOnDisplayedSlide > 0) {
              <small>· Step {{ CurrentRevealStep }}/{{ MaxRevealStepOnDisplayedSlide }}</small>
            }
          </span>
          <button
            type="button"
            class="mj-slides-hud-btn"
            [disabled]="!CanNavigateNextSlide"
            (click)="NextSlide()"
            title="Next (Right Arrow / Space / PageDown)"
            data-testid="hud-next-btn"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <span class="mj-slides-hud-divider"></span>
          <button
            type="button"
            class="mj-slides-hud-btn"
            [class.active]="LaserPointerActive"
            (click)="ToggleLaserPointer()"
            title="Laser Pointer (L)"
            data-testid="hud-laser-btn"
          >
            <i class="fa-solid fa-crosshairs"></i>
          </button>
          <button
            type="button"
            class="mj-slides-hud-btn"
            [class.active]="PresentationOverlayMode === 'blackout'"
            (click)="TogglePresentationOverlay('blackout')"
            title="Blackout (B)"
            data-testid="hud-blackout-btn"
          >
            <i class="fa-solid fa-moon"></i>
          </button>
          <button
            type="button"
            class="mj-slides-hud-btn"
            [class.active]="PresentationOverlayMode === 'whiteout'"
            (click)="TogglePresentationOverlay('whiteout')"
            title="Whiteout (W)"
            data-testid="hud-whiteout-btn"
          >
            <i class="fa-regular fa-square"></i>
          </button>
          <button
            type="button"
            class="mj-slides-hud-btn"
            [class.active]="IsBrowserFullscreen"
            (click)="ToggleBrowserFullscreen()"
            title="Fullscreen (F)"
            data-testid="hud-fullscreen-btn"
          >
            <i class="fa-solid" [ngClass]="IsBrowserFullscreen ? 'fa-compress' : 'fa-expand'"></i>
          </button>
          <button
            type="button"
            class="mj-slides-hud-btn"
            (click)="ExitPresentationMode()"
            title="Exit Presentation (Esc)"
            data-testid="hud-exit-btn"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      }

      <mj-context-menu
        [IsOpen]="ContextMenuOpen"
        [AnchorX]="ContextMenuX"
        [AnchorY]="ContextMenuY"
        [Items]="ContextMenuItems"
        [AriaLabel]="ContextMenuAriaLabel"
        [RestoreFocusElement]="ContextMenuRestoreFocusEl"
        (ItemSelected)="OnSlidesContextMenuCommand($event)"
        (Closed)="CloseContextMenu()"
      ></mj-context-menu>

      <mj-artifact-command-palette
        [Open]="ShowCommandPalette"
        Title="Slide Deck Commands"
        Placeholder="Search layouts, themes, transitions, present, export..."
        [Commands]="SlidesCommandPaletteItems"
        (Execute)="ExecuteSlidePaletteCommand($event)"
        (Closed)="ShowCommandPalette = false"
      ></mj-artifact-command-palette>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .mj-slides-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 640px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-family: var(--mj-font-family, Inter, system-ui, sans-serif);
      }
      .mj-slides-shell.mj-slides-fullscreen {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #090d16;
      }
      .mj-slides-fullscreen .mj-slides-center-stage {
        background: radial-gradient(circle at top center, #111827 0%, #05070c 85%);
        justify-content: center;
        align-items: center;
        padding: 20px 32px;
      }
      .mj-slides-fullscreen .mj-slide-canvas-stage {
        max-width: min(1440px, 94vw);
        max-height: calc(100vh - 110px);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
      }
      .mj-slides-stage-overlay {
        position: fixed;
        inset: 0;
        z-index: 10020;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        cursor: pointer;
      }
      .mj-slides-stage-overlay.blackout {
        background: #000000;
        color: rgba(255, 255, 255, 0.35);
      }
      .mj-slides-stage-overlay.whiteout {
        background: #ffffff;
        color: rgba(15, 23, 42, 0.35);
      }
      .mj-slides-laser-dot {
        position: fixed;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.32), 0 0 18px 4px rgba(239, 68, 68, 0.75);
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10030;
      }
      .mj-slides-floating-hud {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        z-index: 10025;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.82);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f8fafc;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .mj-slides-floating-hud.visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0);
      }
      .mj-slides-hud-btn {
        border: none;
        background: transparent;
        color: #e2e8f0;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .mj-slides-hud-btn:hover:not(:disabled),
      .mj-slides-hud-btn.active {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
      }
      .mj-slides-hud-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .mj-slides-hud-counter {
        font-size: 12px;
        font-weight: 600;
        padding: 0 6px;
        font-variant-numeric: tabular-nums;
      }
      .mj-slides-hud-divider {
        width: 1px;
        height: 16px;
        background: rgba(255, 255, 255, 0.18);
      }
      .mj-slides-polish-btn {
        background: linear-gradient(135deg, color-mix(in srgb, var(--mj-brand-primary) 14%, transparent), color-mix(in srgb, var(--mj-brand-accent, var(--mj-brand-primary)) 12%, transparent));
        border-color: color-mix(in srgb, var(--mj-brand-primary) 45%, transparent);
        color: var(--mj-brand-primary);
      }
      .mj-slides-toolbar {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        min-height: 40px;
        padding: 4px 10px;
        background: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .mj-slides-toolbar::-webkit-scrollbar {
        display: none;
      }
      .mj-slides-toolbar-group {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 5px;
        flex-shrink: 0;
      }
      .mj-slides-toolbar-right {
        margin-left: auto;
      }
      .mj-slides-save-quiet {
        border-color: transparent;
        background: transparent;
        color: var(--mj-text-muted);
      }
      .mj-slides-save-quiet:hover:not(:disabled) {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      .mj-slides-saved-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--mj-status-success);
        display: inline-block;
      }
      .mj-slides-ai-pill {
        background: color-mix(in srgb, var(--mj-text-violet) 10%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-text-violet) 28%, transparent);
        color: var(--mj-text-violet);
      }
      .mj-slides-cmdk-btn {
        padding: 3px 7px;
        background: var(--mj-bg-surface-sunken);
      }
      .mj-slides-kbd-tag {
        font-size: 10px;
        font-weight: 700;
        color: var(--mj-text-muted);
      }
      .mj-slides-count-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 999px;
        background: var(--mj-brand-primary);
        color: var(--mj-brand-on-primary);
      }
      .mj-slides-collab-pill--compact {
        padding: 4px 7px;
      }
      .mj-slides-floating-design-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 8px;
        z-index: var(--mj-z-dropdown, 100);
      }
      .mj-slides-floating-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px;
        border-radius: 999px;
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-strong);
        box-shadow: var(--mj-shadow-lg);
      }
      .mj-slides-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 26px;
        padding: 0 9px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--mj-text-primary);
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .mj-slides-pill-btn:hover:not(:disabled),
      .mj-slides-pill-btn.active {
        background: var(--mj-bg-surface-hover);
      }
      .mj-slides-pill-btn.polish {
        color: var(--mj-text-violet);
        background: color-mix(in srgb, var(--mj-text-violet) 10%, transparent);
      }
      .mj-slides-pill-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .mj-slides-pill-sep {
        width: 1px;
        height: 16px;
        background: var(--mj-border-default);
        margin: 0 2px;
      }
      .mj-slides-design-popover {
        width: min(380px, 92vw);
        margin-bottom: 8px;
        padding: 10px;
        border-radius: 12px;
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-default);
        box-shadow: var(--mj-shadow-lg);
      }
      .mj-slides-design-popover-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mj-text-muted);
        margin-bottom: 8px;
      }
      .mj-slides-design-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
      }
      .mj-slides-design-chip {
        padding: 6px 7px;
        border-radius: 7px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
      }
      .mj-slides-design-chip.active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
      }
      .mj-slides-design-section-label {
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mj-text-muted);
        margin: 10px 0 6px;
      }
      .mj-slides-design-swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .mj-slides-design-swatch {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
      }
      .mj-slides-design-swatch.active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
        font-weight: 600;
      }
      .mj-slides-swatch-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }

      .mj-slides-undo-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
      }

      .mj-slides-tool-btn--icon {
        padding: 4px 8px;
      }

      .mj-slides-active-mode-chip {
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

      .mj-slides-more-anchor {
        position: relative;
        display: inline-flex;
      }

      .mj-slides-more-menu {
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

      .mj-slides-more-menu-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 6px 8px;
        border-bottom: 1px solid var(--mj-border-subtle);
        margin-bottom: 6px;
      }

      .mj-slides-more-menu-title {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: var(--mj-text-primary);
      }

      .mj-slides-more-menu-hint {
        display: block;
        font-size: 11px;
        color: var(--mj-text-muted);
      }

      .mj-slides-more-reset-btn {
        font-size: 11px;
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
      }

      .mj-slides-more-reset-btn:hover {
        background: var(--mj-brand-primary-subtle);
      }

      .mj-slides-more-section {
        margin-bottom: 8px;
      }

      .mj-slides-more-section-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mj-text-muted);
        padding: 4px 6px;
      }

      .mj-slides-more-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .mj-slides-more-action {
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

      .mj-slides-more-action:hover:not(:disabled),
      .mj-slides-more-action.active {
        background: var(--mj-bg-surface-hover);
      }

      .mj-slides-more-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .mj-slides-more-action-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .mj-slides-more-action-label {
        font-size: 12px;
        font-weight: 600;
      }

      .mj-slides-more-action-desc {
        font-size: 11px;
        color: var(--mj-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-slides-pin-btn {
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

      .mj-slides-pin-btn.pinned {
        color: var(--mj-brand-primary);
        background: var(--mj-brand-primary-subtle);
      }

      .mj-slides-pin-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .mj-slides-mode-pills {
        display: inline-flex;
        background: var(--mj-bg-surface-sunken);
        border-radius: 6px;
        padding: 2px;
        border: 1px solid var(--mj-border-subtle);
      }
      .mj-slides-mode-pill {
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .mj-slides-mode-pill.active {
        background: var(--mj-bg-surface-card);
        color: var(--mj-brand-primary);
        box-shadow: var(--mj-shadow-sm);
      }
      .mj-slides-tool-btn {
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 12px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .mj-slides-tool-btn.primary {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }
      .mj-slides-tool-btn.active {
        border-color: var(--mj-brand-primary);
        color: var(--mj-brand-primary);
      }
      .mj-slides-tool-btn.full-width {
        width: 100%;
        justify-content: center;
      }
      .mj-slides-inline-select-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--mj-text-secondary);
      }
      .mj-slides-select,
      .mj-slides-mini-select,
      .mj-slides-input {
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
      }
      .mj-slides-collab-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
      }
      .mj-slides-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--mj-status-success);
      }
      .mj-slides-collab-pill[data-status='readonly'] .mj-slides-status-dot {
        background: var(--mj-status-warning);
      }
      .mj-slides-collab-pill[data-status='revoked'] .mj-slides-status-dot {
        background: var(--mj-status-error);
      }
      .mj-slides-collab-pill[data-status='error'] {
        background: var(--mj-status-error-bg);
        border-color: var(--mj-status-error-border);
        color: var(--mj-status-error-text);
      }
      .mj-slides-collab-pill[data-status='error'] .mj-slides-status-dot {
        background: var(--mj-status-error);
      }
      .mj-slides-collab-retry-btn {
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
      .mj-slides-collab-retry-btn:hover {
        background: var(--mj-bg-surface-hover);
      }
      .mj-slides-collaborators {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mj-slides-peer-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        font-size: 10px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .mj-slides-presentation-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        background: var(--mj-bg-surface-sunken);
        border-bottom: 1px solid var(--mj-border-default);
        font-size: 12px;
      }
      .mj-slides-presentation-banner--readonly {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }
      .mj-slides-presentation-banner--warning {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-warning);
        border-bottom-color: var(--mj-status-warning);
      }
      .mj-slides-presentation-banner-info,
      .mj-slides-presentation-banner-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mj-slides-workspace-body {
        flex: 1;
        display: flex;
        min-height: 0;
        overflow: hidden;
      }
      .mj-slides-filmstrip {
        width: 230px;
        min-width: 230px;
        border-right: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
      }
      .mj-slides-filmstrip-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
        border-bottom: 1px solid var(--mj-border-subtle);
      }
      .mj-slides-filmstrip-list {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mj-slides-thumbnail-card {
        border: 2px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface-card);
        padding: 8px;
        cursor: pointer;
        transition: border-color 0.15s ease;
      }
      .mj-slides-thumbnail-card.active {
        border-color: var(--mj-brand-primary);
        box-shadow: var(--mj-shadow-sm);
      }
      .mj-slides-thumbnail-card.hidden-slide {
        opacity: 0.62;
        border-style: dashed;
      }
      .mj-slides-thumb-hidden-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
      }
      .mj-slides-thumbnail-card.dragging {
        opacity: 0.45;
      }
      .mj-slides-thumbnail-card.drag-over {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 -3px 0 0 var(--mj-brand-primary);
      }
      .mj-slides-thumbnail-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        margin-bottom: 6px;
      }
      .mj-slides-thumb-number {
        font-weight: 700;
        color: var(--mj-brand-primary);
      }
      .mj-slides-thumb-layout {
        font-size: 10px;
        color: var(--mj-text-muted);
      }
      .mj-slides-thumb-reorder {
        display: inline-flex;
        gap: 2px;
      }
      .mj-slides-icon-btn {
        border: none;
        background: transparent;
        color: var(--mj-text-secondary);
        cursor: pointer;
        padding: 2px 4px;
        font-size: 11px;
      }
      .mj-slides-thumbnail-preview {
        aspect-ratio: 16 / 9;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: 4px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
      }
      .mj-slides-thumb-title {
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-slides-thumb-subtitle {
        font-size: 10px;
        color: var(--mj-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-slides-mini-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-brand-primary);
      }
      .mj-slides-center-stage {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 18px 24px;
        background: var(--mj-bg-page);
      }
      .mj-slides-stage-layout {
        display: flex;
        flex-direction: column;
        gap: 16px;
        height: 100%;
      }
      .mj-slides-stage-layout.presenter-split {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 20px;
        align-items: start;
      }
      .mj-slides-canvas-wrapper {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .mj-slide-canvas-stage {
        width: 100%;
        max-width: 1120px;
        aspect-ratio: 16 / 9;
        margin: 0 auto;
        background: var(--deck-bg, var(--mj-bg-surface-card));
        color: var(--deck-text, var(--mj-text-primary));
        font-family: var(--deck-body-font, var(--mj-font-family));
        border: 2px solid var(--deck-primary, var(--mj-brand-primary));
        border-radius: 14px;
        box-shadow: var(--mj-shadow-md);
        padding: 24px 32px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        position: relative;
      }
      .mj-slide-canvas-stage[data-bg-style='gradient'] {
        background: linear-gradient(135deg, var(--deck-bg, #ffffff) 0%, var(--deck-secondary-bg, var(--deck-surface, #f8fafc)) 100%);
      }
      .mj-slide-canvas-stage[data-bg-style='mesh'] {
        background:
          radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--deck-primary, #4f46e5) 18%, transparent), transparent 46%),
          radial-gradient(circle at 88% 82%, color-mix(in srgb, var(--deck-accent, #0ea5e9) 16%, transparent), transparent 48%),
          linear-gradient(160deg, var(--deck-bg, #0f172a) 0%, var(--deck-secondary-bg, var(--deck-bg, #0f172a)) 100%);
      }
      .mj-slide-canvas-stage[data-bg-style='accent-strip']::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 5px;
        background: linear-gradient(90deg, var(--deck-primary, #4f46e5), var(--deck-accent, #0ea5e9));
      }
      .mj-slide-canvas-stage[data-transition='fade'] {
        animation: mjSlideFadeIn 0.28s ease-out;
      }
      .mj-slide-canvas-stage[data-transition='slide'] {
        animation: mjSlidePushIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .mj-slide-canvas-stage[data-transition='zoom'] {
        animation: mjSlideZoomIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes mjSlideFadeIn {
        from { opacity: 0.35; }
        to { opacity: 1; }
      }
      @keyframes mjSlidePushIn {
        from { opacity: 0.4; transform: translateX(24px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes mjSlideZoomIn {
        from { opacity: 0.45; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .mj-slide-master-header,
      .mj-slide-master-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: var(--deck-muted, var(--mj-text-muted));
        border-bottom: 1px solid var(--mj-border-subtle);
        padding-bottom: 6px;
      }
      .mj-slide-master-footer {
        border-bottom: none;
        border-top: 1px solid var(--mj-border-subtle);
        padding-bottom: 0;
        padding-top: 6px;
      }
      .mj-slide-brand-seed-pill {
        margin-left: 8px;
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        background: var(--deck-accent, var(--mj-brand-accent));
        color: var(--mj-text-inverse);
      }
      .mj-slide-heading-zone {
        margin: 10px 0;
      }
      .mj-slide-title-editable {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        color: var(--deck-primary, var(--mj-brand-primary));
        font-family: var(--deck-heading-font, var(--mj-font-family));
        outline: none;
        border-radius: 4px;
        padding: 2px 4px;
      }
      .mj-slide-title-editable:focus,
      .mj-slide-subtitle-editable:focus {
        box-shadow: 0 0 0 2px var(--deck-accent, var(--mj-brand-primary));
      }
      .mj-slide-subtitle-editable {
        margin: 4px 0 0;
        font-size: 14px;
        color: var(--deck-muted, var(--mj-text-secondary));
        outline: none;
        border-radius: 4px;
        padding: 2px 4px;
      }
      .mj-slide-regions-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        min-height: 0;
        overflow-y: auto;
        margin: 6px 0;
      }
      .mj-slide-regions-grid[data-layout='TwoColumn'],
      .mj-slide-regions-grid[data-layout='Comparison'],
      .mj-slide-regions-grid[data-layout='LiveDataSlide'],
      .mj-slide-regions-grid[data-layout='ChartAndText'],
      .mj-slide-regions-grid[data-layout='BigNumber'] {
        grid-template-columns: 1fr 1fr;
      }
      .mj-slide-regions-grid[data-layout='KpiStrip'] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .mj-slide-regions-grid[data-layout='Timeline'] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        position: relative;
      }
      .mj-slide-regions-grid[data-layout='BentoGrid'] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .mj-slide-regions-grid[data-layout='BentoGrid'] .mj-slide-region-card:first-child {
        grid-column: 1 / -1;
      }
      .mj-slide-regions-grid[data-layout='Quadrant'] {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .mj-slide-regions-grid[data-layout='MetricComparison'] {
        grid-template-columns: 1fr 1fr;
      }
      .mj-slide-regions-grid[data-layout='MetricComparison'] .mj-slide-region-card:nth-child(3) {
        grid-column: 1 / -1;
      }
      .mj-slide-region-card {
        background: var(--deck-surface, var(--mj-bg-surface));
        border: 1px solid var(--mj-border-default);
        border-radius: var(--deck-card-radius, 12px);
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        overflow: auto;
        transition: opacity 0.25s ease, transform 0.25s ease, box-shadow 0.2s ease;
      }
      .mj-slide-canvas-stage[data-card-elevation='soft'] .mj-slide-region-card {
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
      }
      .mj-slide-canvas-stage[data-card-elevation='glass'] .mj-slide-region-card {
        background: color-mix(in srgb, var(--deck-surface, #1e293b) 82%, transparent);
        border-color: color-mix(in srgb, var(--deck-primary, #38bdf8) 28%, rgba(255, 255, 255, 0.14));
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
      }
      .mj-slide-region-card.mj-slide-region--unrevealed {
        opacity: 0.06;
        transform: translateY(8px);
        pointer-events: none;
      }
      .mj-slide-region-card.active-region {
        border-color: var(--deck-primary, var(--mj-brand-primary));
      }
      .mj-slide-region-card.mj-slide-region--agent-active {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
      }
      .mj-slide-region-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px;
        padding-bottom: 6px;
        border-bottom: 1px dashed var(--mj-border-subtle);
        font-size: 11px;
      }
      .mj-slide-region-label {
        font-weight: 600;
        color: var(--deck-muted, var(--mj-text-secondary));
      }
      .mj-slide-region-actions {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
      }
      .mj-slides-mini-btn {
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-primary);
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        cursor: pointer;
      }
      .mj-slides-mini-btn.active {
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
        border-color: var(--mj-brand-primary);
      }
      .mj-slide-richtext-region {
        flex: 1;
        font-size: 14px;
        line-height: 1.55;
        outline: none;
      }
      .mj-slide-richtext-region.callout-box {
        border-left: 4px solid var(--deck-accent, var(--mj-brand-primary));
        padding-left: 12px;
      }
      .mj-slide-big-number-region {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 6px;
        padding: 12px;
      }
      .mj-slide-big-number-value {
        font-size: 46px;
        font-weight: 800;
        color: var(--deck-accent, var(--mj-brand-primary));
        line-height: 1.1;
      }
      .mj-slide-big-number-label {
        font-size: 15px;
        font-weight: 600;
      }
      .mj-slide-big-number-delta {
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-success);
      }
      .mj-slide-quote-region {
        margin: 0;
        padding: 12px;
        border-left: 4px solid var(--deck-primary, var(--mj-brand-primary));
        font-style: italic;
        font-size: 16px;
      }
      .mj-slide-quote-cite {
        display: block;
        margin-top: 8px;
        font-size: 12px;
        font-style: normal;
        font-weight: 600;
        color: var(--deck-muted, var(--mj-text-secondary));
      }
      .mj-slide-live-block-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
      }
      .mj-slide-live-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 12px;
      }
      .mj-slide-live-block-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .mj-slide-block-mode-pill {
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-success);
      }
      .mj-slide-block-mode-pill[data-mode='Frozen'] {
        color: var(--mj-brand-primary);
      }
      .mj-slide-data-table-wrap {
        overflow-x: auto;
      }
      .mj-slide-data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .mj-slide-data-table th,
      .mj-slide-data-table td {
        border: 1px solid var(--mj-border-default);
        padding: 5px 8px;
        text-align: left;
      }
      .mj-slide-data-table th {
        background: var(--mj-bg-surface-sunken);
        font-weight: 600;
      }
      .mj-slide-ole-viewer-container {
        min-height: 220px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        overflow: hidden;
        background: var(--mj-bg-surface-card);
      }
      .mj-slides-speaker-notes-bar {
        max-width: 1120px;
        width: 100%;
        margin: 0 auto;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        padding: 10px 14px;
      }
      .mj-slides-speaker-notes-header {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .mj-slides-muted-hint {
        font-size: 11px;
        font-weight: 400;
        color: var(--mj-text-muted);
      }
      .mj-slides-speaker-notes-input {
        width: 100%;
        min-height: 58px;
        border: 1px solid var(--mj-border-subtle);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        padding: 6px 10px;
        font-size: 12px;
        resize: vertical;
      }
      .mj-slides-presenter-cockpit {
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        padding: 16px;
      }
      .mj-presenter-timer-card,
      .mj-presenter-next-card,
      .mj-presenter-notes-card {
        border: 1px solid var(--mj-border-subtle);
        border-radius: 8px;
        padding: 12px;
        background: var(--mj-bg-surface);
      }
      .mj-presenter-timer-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .mj-presenter-card-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--mj-text-muted);
        margin-bottom: 4px;
      }
      .mj-presenter-timer-digits {
        font-size: 24px;
        font-weight: 800;
        font-family: monospace;
      }
      .mj-presenter-live-frozen-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-brand-primary);
      }
      .mj-presenter-notes-body {
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .mj-slides-right-drawer {
        width: 320px;
        min-width: 320px;
        border-left: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-card);
        padding: 14px;
        overflow-y: auto;
      }
      .mj-slides-drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 13px;
      }
      .mj-slides-drawer-subtitle {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--mj-text-muted);
        margin: 12px 0 8px;
      }
      .mj-slides-theme-preset-list,
      .mj-slides-brand-seed-form,
      .mj-slides-thread-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .mj-slides-theme-preset-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        cursor: pointer;
        font-size: 12px;
      }
      .mj-slides-theme-preset-btn.active {
        border-color: var(--mj-brand-primary);
        font-weight: 600;
      }
      .mj-slides-theme-swatches {
        display: inline-flex;
        gap: 4px;
      }
      .mj-slides-swatch {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 1px solid var(--mj-border-default);
      }
      .mj-slides-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
      }
      .mj-slides-new-comment-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--mj-border-subtle);
      }
      .mj-slides-comment-target-pill {
        font-size: 11px;
        color: var(--mj-text-secondary);
      }
      .mj-slides-thread-card {
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 10px;
        background: var(--mj-bg-surface);
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mj-slides-thread-header {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--mj-text-secondary);
      }
      .mj-slides-thread-msg[data-role='Agent'] {
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        border-left: 3px solid var(--mj-brand-primary);
      }
      .mj-slides-source-panel,
      .mj-slides-diff-panel {
        max-width: 1120px;
        width: 100%;
        margin: 0 auto;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mj-slides-source-header,
      .mj-slides-diff-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .mj-slides-source-textarea {
        width: 100%;
        min-height: 360px;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }
      .mj-slides-diff-line {
        display: flex;
        font-family: monospace;
        font-size: 12px;
        padding: 2px 6px;
      }
      .mj-slides-diff-line[data-diff-type='added'] {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-success);
      }
      .mj-slides-diff-line[data-diff-type='removed'] {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-status-error);
      }
      .mj-slides-diff-gutter {
        width: 36px;
        color: var(--mj-text-muted);
      }
      .mj-slides-diff-marker {
        width: 18px;
        font-weight: 700;
      }
      .mj-slides-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: color-mix(in srgb, var(--mj-text-primary) 55%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .mj-slides-modal-card {
        max-width: 520px;
        width: 100%;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-primary);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        padding: 20px;
        box-shadow: var(--mj-shadow-lg);
      }
      .mj-slides-modal-card.wide {
        max-width: 720px;
      }
      .mj-slides-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      .mj-slides-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }
      .mj-slides-syncing-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
        color: var(--mj-brand-primary);
      }
      .mj-slides-region-pill-count {
        margin-left: 3px;
        padding: 0 5px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        background: var(--mj-brand-primary);
        color: var(--mj-text-inverse);
      }
      .mj-slide-title-editable[data-placeholder]:empty::before,
      .mj-slide-subtitle-editable[data-placeholder]:empty::before,
      .mj-slide-big-number-value[data-placeholder]:empty::before,
      .mj-slide-big-number-label[data-placeholder]:empty::before,
      .mj-slide-big-number-delta[data-placeholder]:empty::before,
      .mj-slide-quote-text[data-placeholder]:empty::before,
      .mj-slide-quote-cite[data-placeholder]:empty::before,
      .mj-slide-richtext-region[data-placeholder]:empty::before {
        content: attr(data-placeholder);
        color: var(--deck-muted, var(--mj-text-muted));
        opacity: 0.65;
        pointer-events: none;
      }
      .mj-slide-quote-cite:not(:empty)::before {
        content: '— ';
      }
      .mj-slide-chart-svg-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }
      .mj-slide-chart-svg {
        width: 100%;
        height: 180px;
        display: block;
      }
      .mj-slide-chart-axis-label {
        font-size: 9px;
        fill: var(--deck-muted, var(--mj-text-muted));
      }
      .mj-slide-chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 11px;
      }
      .mj-slide-chart-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mj-slide-chart-swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        display: inline-block;
      }
      .mj-slide-image-region {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
      .mj-slide-region-img {
        max-width: 100%;
        max-height: 260px;
        object-fit: contain;
        border-radius: 8px;
      }
      .mj-slides-drift-banner.has-drift {
        border-color: var(--mj-status-warning, var(--mj-brand-accent));
      }
      .mj-slides-drift-popover {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 14px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
        font-size: 12px;
      }
      .mj-slides-drift-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
      }
      .mj-slides-drift-row[data-has-drift='true'] {
        border-color: var(--mj-status-warning, var(--mj-brand-accent));
      }
      .mj-slides-drift-row-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .mj-slides-comment-filter-bar {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
      }
      .mj-slides-anchor-jump-btn {
        background: transparent;
        border: none;
        padding: 0;
        color: var(--mj-brand-primary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .mj-slides-thread-reply-box {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .mj-slides-suggestions-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 10px 0 14px;
      }
      .mj-slides-suggestion-card {
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
      }
      .mj-slides-suggestion-diff-old {
        color: var(--mj-status-error, var(--mj-text-secondary));
        text-decoration: line-through;
        font-size: 11px;
      }
      .mj-slides-suggestion-diff-new {
        color: var(--mj-status-success, var(--mj-brand-primary));
        font-weight: 600;
        font-size: 11px;
      }
      .mj-slides-export-audit {
        margin-top: 14px;
        padding: 10px;
        border-radius: 8px;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
        font-size: 11px;
      }
    `,
  ],
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'SlideDeckArtifactViewerPlugin')
export class SlideDeckArtifactViewerComponent
  extends BaseArtifactViewerPluginComponent
  implements OnInit, OnDestroy
{
  private static readonly USER_SETTING_PREFIX = 'MJ.Slides.WorkspaceState.';
  public readonly IsAiAssistantEnabled = ARTIFACT_AI_ASSISTANT_ENABLED;

  private _collaborationWsUrl: string | null = null;
  private _artifactVersionShadow!: MJArtifactVersionEntity;
  private _readonlyShadow = true;
  private hasComponentInitialized = false;

  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input()
  public get CollaborationWsUrl(): string | null {
    return this._collaborationWsUrl;
  }
  public set CollaborationWsUrl(value: string | null) {
    const prev = this._collaborationWsUrl;
    this._collaborationWsUrl = value;
    if (this.hasComponentInitialized && prev !== value) {
      const artifactId = this.artifactVersion?.ArtifactID || 'slide-deck-default';
      this.setupCollaborationSession(artifactId, SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck));
    }
  }

  /**
   * Ancestor artifact ID chain propagated to nested OLE `<mj-artifact-type-plugin-viewer>` hosts
   * to prevent circular self-embedding and enforce `MJ_MAX_EMBED_DEPTH` (<= 3).
   */
  @Input() public AncestorArtifactIDs: ReadonlySet<string> | null = null;

  @Output() public OpenEntityRecord = new EventEmitter<{
    entityName: string;
    compositeKey: CompositeKey;
  }>();
  /** @deprecated Use {@link OpenEntityRecord}. */
  @Output() public openEntityRecord = this.OpenEntityRecord;

  @Output() public override navigationRequest = new EventEmitter<NavigationRequest>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone, { optional: true });
  private readonly hostElRef = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly renderer = inject(Renderer2, { optional: true });
  private readonly collabService = inject(DocumentCollaborationService);
  private readonly exportService = inject(SlideDeckExportService);
  private readonly notificationService = inject(MJNotificationService, { optional: true });
  private readonly injectedAncestorIds = inject(MJ_EMBEDDED_ARTIFACT_ANCESTORS, { optional: true });

  constructor() {
    super();
    this._artifactVersionShadow = this.artifactVersion;
    this._readonlyShadow = this.readonly;
    Object.defineProperty(this, 'artifactVersion', {
      configurable: true,
      enumerable: true,
      get: (): MJArtifactVersionEntity => this._artifactVersionShadow,
      set: (value: MJArtifactVersionEntity): void => {
        const prev = this._artifactVersionShadow;
        this._artifactVersionShadow = value;
        if (this.hasComponentInitialized && prev !== value) {
          this.initializePresentationFromArtifactVersion();
        }
      },
    });
    Object.defineProperty(this, 'readonly', {
      configurable: true,
      enumerable: true,
      get: (): boolean => this._readonlyShadow,
      set: (value: boolean): void => {
        const next = Boolean(value);
        const prev = this._readonlyShadow;
        this._readonlyShadow = next;
        if (this.hasComponentInitialized && prev !== next) {
          this.handleReadonlyInputChange();
        }
      },
    });
  }

  @ViewChild('moreToolsAnchor') private moreToolsAnchorRef?: ElementRef<HTMLElement>;

  public readonly MaxPinnedToolbarActions = 4;
  public ShowMoreToolsMenu = false;
  public DraggingSlideID: string | null = null;
  public DragOverSlideID: string | null = null;
  private _localToolbarPins: SlidesToolbarItemKey[] | null = null;
  private _serverToolbarPinsRaw: string | null = null;
  private _unlistenMoreMenuDocs: Array<() => void> = [];
  private touchPointerCleanup: (() => void) | null = null;
  private artifactOwnerUserId: string | null = null;

  // Context Menu & Clipboard State
  public ContextMenuOpen = false;
  public ContextMenuX = 0;
  public ContextMenuY = 0;
  public ContextMenuItems: ContextMenuItem<SlidesContextMenuCommand>[] = [];
  public ContextMenuAriaLabel = 'Slide actions';
  public ContextMenuRestoreFocusEl: HTMLElement | null = null;
  private copiedSlideRegionSpec: SlideRegionSpec | null = null;
  public LastClipboardText = '';
  private readonly touchMenuMonitor = new TouchContextMenuMonitor({
    OnLongPress: (trigger) => {
      if (this.ngZone) {
        this.ngZone.run(() => {
          this.openContextMenuForTargetElement(trigger.Target, trigger.AnchorX, trigger.AnchorY);
          this.cdr.detectChanges();
        });
      } else {
        this.openContextMenuForTargetElement(trigger.Target, trigger.AnchorX, trigger.AnchorY);
      }
    },
  });

  public readonly LayoutCatalog: ReadonlyArray<SlideLayoutMetadata> = SLIDE_LAYOUT_CATALOG;
  public readonly ThemePresets: ReadonlyArray<SlideDeckThemeSpec> = SLIDE_DECK_THEME_PRESETS;

  public Deck: SlideDeckSpec = SlideDeckEngine.Instance.CreateDefaultDeck();
  public PresentationFrozenDeck: SlideDeckSpec | null = null;
  public PresentationFrozenAt: Date | null = null;
  public PresentationRefreshCount = 0;

  public ActiveSlideID = 'slide-1';
  public FocusedRegionID = 'main';
  public WorkspaceMode: SlideWorkspaceMode = 'edit';
  public ShowCommandPalette = false;
  public ShowDesignPopover = false;
  public RightDrawerTab: SlideRightDrawerTab = 'none';
  public ShowFilmstrip = true;
  public StatusBannerMessage = '';

  public RawDeckJsonText = '';
  public BaselineDeckJsonText = '';
  public CurrentDiff: DocumentDiffResult = {
    AddedLines: 0,
    RemovedLines: 0,
    UnchangedLines: 0,
    Lines: [],
  };

  public ConnectionStatus: CollaborationConnectionStatus = 'local';
  public Collaborators: CollaboratorPresence[] = [];

  public get HumanCollaborators(): CollaboratorPresence[] {
    return this.Collaborators.filter((c) => c.IsAgent !== true);
  }

  public GetActiveSlideAgentPresence(): CollaboratorPresence | null {
    const activeSlideId = this.DisplayedSlide?.SlideID ?? this.ActiveSlideID;
    const activeSlideIndex = this.Deck?.Slides?.findIndex((s) => s.SlideID === activeSlideId) ?? -1;
    const activeSlideNumber = activeSlideIndex >= 0 ? activeSlideIndex + 1 : undefined;
    for (const peer of this.Collaborators) {
      if (peer.IsAgent !== true || peer.AgentPhase === 'exit') {
        continue;
      }
      const loc = peer.AgentLocation;
      if (loc?.SlideID && loc.SlideID === activeSlideId) {
        return peer;
      }
      if (typeof loc?.SlideNumber === 'number' && activeSlideNumber === loc.SlideNumber) {
        return peer;
      }
      if (!loc && peer.ActiveBlockID && peer.ActiveBlockID === activeSlideId) {
        return peer;
      }
    }
    return null;
  }

  public IsRegionEditedByAgent(regionId: string): boolean {
    const slideAgent = this.GetActiveSlideAgentPresence();
    return Boolean(slideAgent?.AgentLocation?.ElementID && slideAgent.AgentLocation.ElementID === regionId);
  }

  public JumpToAgentSlideLocation(agent: CollaboratorPresence): void {
    const loc = agent.AgentLocation;
    const slides = this.Deck?.Slides ?? [];
    let target = loc?.SlideID ? slides.find((s) => s.SlideID === loc.SlideID) : undefined;
    if (!target && typeof loc?.SlideNumber === 'number' && loc.SlideNumber >= 1) {
      target = slides[loc.SlideNumber - 1];
    }
    if (target) {
      this.SelectSlide(target.SlideID);
      if (loc?.ElementID) {
        this.FocusedRegionID = loc.ElementID;
      }
      this.cdr.markForCheck();
    }
  }
  public ResolvedPermissions: VerifiedArtifactPermissions | null = null;
  public AccessRevoked = false;
  public PermissionVerifyError = false;
  public CurrentVersionNumber = 1;
  public LastSavedVersionNumber = 0;
  public IsSavingVersion = false;
  private pendingVersionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedComparableDeckJson = '';
  private editingSlideId: string | null = null;
  private isRawJsonDirty = false;
  public RawJsonErrorMessage = '';
  public RawJsonRemoteConflictPending = false;
  private pendingRemoteDeckJson: string | null = null;
  public HasPendingResetConflict = false;

  // NW-1 & NW-3 Next-Wave UI State
  public CommentFilterScope: 'slide' | 'deck' = 'slide';
  private readonly threadReplyDrafts = new Map<string, string>();
  public SharedSuggestions: SlideDeckSuggestion[] = [];
  public ActiveSlideDriftSummaries: SlideRegionDriftSummary[] = [];
  public ShowDriftComparePopover = false;
  public IsCheckingSlideDrift = false;
  private readonly driftLiveResultsByBlockId = new Map<string, DocumentBlockExecutionResult>();
  private hasUncommittedDomInput = false;

  public OnSlideContentEditableInput(): void {
    if (!this.hasUncommittedDomInput) {
      this.hasUncommittedDomInput = true;
      this.cdr.markForCheck();
    }
  }

  public get HasUnsavedChanges(): boolean {
    if (this.hasUncommittedDomInput || this.isRawJsonDirty) {
      return true;
    }
    if (!this.lastSavedComparableDeckJson) {
      return false;
    }
    return this.getComparableDeckJson(this.Deck) !== this.lastSavedComparableDeckJson;
  }

  public get EffectiveAncestorArtifactIds(): ReadonlySet<string> {
    const merged = new Set<string>();
    if (this.injectedAncestorIds) {
      for (const id of this.injectedAncestorIds) {
        if (id && id.trim()) {
          merged.add(id.trim().toLowerCase());
        }
      }
    }
    if (this.AncestorArtifactIDs) {
      for (const id of this.AncestorArtifactIDs) {
        if (id && id.trim()) {
          merged.add(id.trim().toLowerCase());
        }
      }
    }
    return merged;
  }

  public get ChildEmbedAncestorIds(): ReadonlySet<string> {
    const next = new Set<string>(this.EffectiveAncestorArtifactIds);
    const currentArtifactId = this.artifactVersion?.ArtifactID?.trim().toLowerCase();
    if (currentArtifactId) {
      next.add(currentArtifactId);
    }
    return next;
  }

  private getComparableDeckJson(deck: SlideDeckSpec): string {
    const copy: SlideDeckSpec = {
      ...deck,
      UpdatedAt: undefined,
    };
    return JSON.stringify(copy);
  }

  // Brand Theme Seed Form State (Accept #4)
  public BrandSeedOrgName = 'Acme Enterprise';
  public BrandSeedPrimaryColor = '#0F766E';
  public BrandSeedAccentColor = '#F59E0B';
  public BrandSeedBackgroundColor = '#0F172A';

  // Live MJ Block & Inline OLE Whiteboard State
  private readonly blockResultsByBlockId = new Map<string, DocumentBlockExecutionResult>();
  private readonly embeddedArtifactVersions = new Map<string, MJArtifactVersionEntity>();
  private readonly latestWorkbookVersions = new Map<string, MJArtifactVersionEntity>();
  private readonly inFlightEmbeddedVersionKeys = new Set<string>();

  public ShowSheetEmbedModal = false;
  private targetSheetEmbedRegionID: string | null = null;
  public AvailableSpreadsheetArtifacts: Array<{ ID: string; Name: string }> = [];
  public SheetEmbedArtifactID = '';
  public SheetEmbedMode: 'chart' | 'range' = 'chart';
  public SheetEmbedWorksheetName = '';
  public SheetEmbedChartID = '';
  public SheetEmbedRange = 'A1:D8';
  public SheetEmbedPinVersion = false;
  public SheetEmbedWorkbookSheets: WorksheetSpec[] = [];
  public SheetEmbedLatestVersionID = '';
  public SheetEmbedLatestVersionNumber = 0;
  private readonly failedEmbeddedVersionMessages = new Map<string, string>();
  private readonly oleEditingRegionIds = new Set<string>();
  public PendingFreezeBlock: DocumentBlockSpec | null = null;
  public PendingFreezeRegion: SlideRegionSpec | null = null;

  // Anchored SlideRegion Comment State
  public AnchoredThreads: DocumentAnchoredThread[] = [];
  public PendingAnchorKey = 'slide-1:main';
  public PendingAnchorLabel = 'Slide 1 · Primary Content';
  public NewCommentDraft = '';

  // Markdown-to-Slides Conversion Modal (§ 5.2)
  public ShowMarkdownToDeckModal = false;
  public MarkdownConversionDraft = [
    '# Executive Cloud & AI Strategy',
    'Board presentation generated directly from an MJ Markdown Document.',
    '> Speaker Notes: Welcome the board and review our Q4 strategic pillars.',
    '',
    '## Core Architecture Pillars',
    '- Unified metadata governance across Docs, Slides, and Sheets',
    '- Real-time collaborative editing per slide and section',
    '- Live data views and queries scoped to each viewer',
    '',
    '## Live Portfolio Telemetry',
    ':::mj-block',
    '{"BlockID":"slide-blk-ev-1","Kind":"EntityView","Mode":"Live","Title":"Live Governed Artifacts","EntityName":"MJ: Artifacts","DisplayMode":"table"}',
    ':::',
  ].join('\n');

  // Presenter View Elapsed Timer & Full-Screen Presentation Controls (#1)
  public PresenterElapsedSeconds = 0;
  private presenterTimerHandle: ReturnType<typeof setInterval> | null = null;
  public IsBrowserFullscreen = false;
  public PresentationOverlayMode: 'none' | 'blackout' | 'whiteout' = 'none';
  public LaserPointerActive = false;
  public LaserPointerX = 50;
  public LaserPointerY = 50;
  public PresentHudVisible = true;
  public CurrentRevealStep = 0;
  public HasPopoutAudienceWindow = false;
  private jumpDigitBuffer = '';
  private jumpDigitTimer: ReturnType<typeof setTimeout> | null = null;
  private presentHudHideTimer: ReturnType<typeof setTimeout> | null = null;
  private fullscreenChangeHandler: (() => void) | null = null;
  private audienceChannel: BroadcastChannel | null = null;
  private popoutAudienceWindow: Window | null = null;

  // Last Exported .pptx Package Audit Summary (for deterministic E2E & unit verification)
  public LastExportedPptxPackage: PptxExportPackage | null = null;
  public LastExportedPptxSummary: {
    SlideCount: number;
    FrozenBlockCount: number;
    ByteLength: number;
  } | null = null;

  private session: DocumentCollaborationSession | null = null;
  private liveSyncUnavailable = false;
  private permissionUnsub: (() => void) | null = null;
  private readonly subs: Subscription[] = [];
  private sessionInitGeneration = 0;
  private isComponentDestroyed = false;

  private get hasPermissionToEdit(): boolean {
    if (this.readonly) {
      return false;
    }
    if (this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      if (this.ResolvedPermissions?.CanEdit !== true) {
        return false;
      }
      if (this.session && !this.session.CanEdit && this.ConnectionStatus === 'readonly') {
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
      this.session &&
      this.session.Transport === 'websocket' &&
      !this.session.HasCompletedInitialSync,
    );
  }

  public get LiveSyncUnavailable(): boolean {
    return this.liveSyncUnavailable || Boolean(this.session?.LiveSyncUnavailable);
  }

  public get IsEditable(): boolean {
    return !this.LiveSyncUnavailable && !this.IsWaitingForInitialCollabSync && this.hasPermissionToEdit;
  }

  public get CanComment(): boolean {
    if (this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      return this.ResolvedPermissions?.CanRead === true;
    }
    return !this.readonly;
  }

  public get HasDisplayContent(): boolean {
    return this.Deck.Slides.length > 0;
  }

  public override get hasDisplayContent(): boolean {
    return this.Deck.Slides.length > 0;
  }

  public override get SupportsInlineEdit(): boolean {
    return true;
  }

  public override get SupportsVersionDiff(): boolean {
    return true;
  }

  public override GetVersionDiffComponentType(): Type<IArtifactVersionDiffViewer> {
    return SlidesVersionDiffComponent;
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    return CreateJsonSnapshot(serialized, this.Deck.Title || this.getDisplayTitle());
  }

  public get ActiveDeckForDisplay(): SlideDeckSpec {
    if (
      (this.WorkspaceMode === 'present' || this.WorkspaceMode === 'presenter') &&
      this.PresentationFrozenDeck
    ) {
      return this.PresentationFrozenDeck;
    }
    return this.Deck;
  }

  public get SafeTheme(): {
    BackgroundColor: string;
    SecondaryGradientColor: string;
    SurfaceColor: string;
    PrimaryColor: string;
    AccentColor: string;
    TextColor: string;
    MutedTextColor: string;
    HeadingFont: string;
    BodyFont: string;
    BackgroundStyle: SlideBackgroundStyle;
    CardRadiusPx: number;
    CardElevation: SlideCardElevation;
  } {
    const raw = this.ActiveDeckForDisplay.Theme;
    const engine = SlideDeckEngine.Instance;
    const surface = engine.SanitizeCssValue(raw?.SurfaceColor, '#f8fafc');
    return {
      BackgroundColor: engine.SanitizeCssValue(raw?.BackgroundColor, '#ffffff'),
      SecondaryGradientColor: engine.SanitizeCssValue(raw?.SecondaryGradientColor, surface),
      SurfaceColor: surface,
      PrimaryColor: engine.SanitizeCssValue(raw?.PrimaryColor, '#4f46e5'),
      AccentColor: engine.SanitizeCssValue(raw?.AccentColor, '#0ea5e9'),
      TextColor: engine.SanitizeCssValue(raw?.TextColor, '#0f172a'),
      MutedTextColor: engine.SanitizeCssValue(raw?.MutedTextColor, '#475569'),
      HeadingFont: engine.SanitizeCssValue(raw?.HeadingFont, 'Inter, system-ui, sans-serif'),
      BodyFont: engine.SanitizeCssValue(raw?.BodyFont, 'Inter, system-ui, sans-serif'),
      BackgroundStyle: raw?.BackgroundStyle ?? 'accent-strip',
      CardRadiusPx: typeof raw?.CardRadiusPx === 'number' ? Math.max(0, Math.min(32, raw.CardRadiusPx)) : 14,
      CardElevation: raw?.CardElevation ?? 'soft',
    };
  }

  public get MaxRevealStepOnDisplayedSlide(): number {
    let maxStep = 0;
    for (const r of this.DisplayedSlide?.Regions ?? []) {
      if (typeof r.RevealStep === 'number' && r.RevealStep > maxStep) {
        maxStep = r.RevealStep;
      }
    }
    return maxStep;
  }

  public IsRegionRevealed(region: SlideRegionSpec): boolean {
    if (!this.IsPresentationActive) {
      return true;
    }
    const step = region.RevealStep ?? 0;
    if (step <= 0 || this.MaxRevealStepOnDisplayedSlide === 0) {
      return true;
    }
    return this.CurrentRevealStep >= step;
  }

  public get ActiveSlideIndex(): number {
    const deck = this.ActiveDeckForDisplay;
    const idx = deck.Slides.findIndex((s) => s.SlideID === this.ActiveSlideID);
    return idx >= 0 ? idx : 0;
  }

  public get ActiveSlide(): SlideSpec {
    const found = this.Deck.Slides.find((s) => s.SlideID === this.ActiveSlideID);
    return found ?? this.Deck.Slides[0];
  }

  public get DisplayedSlide(): SlideSpec {
    const deck = this.ActiveDeckForDisplay;
    const found = deck.Slides.find((s) => s.SlideID === this.ActiveSlideID);
    return found ?? deck.Slides[0];
  }

  public get IsPresentationActive(): boolean {
    return this.WorkspaceMode === 'present' || this.WorkspaceMode === 'presenter';
  }

  public get CanNavigatePrevSlide(): boolean {
    if (this.IsPresentationActive && this.CurrentRevealStep > 0) {
      return true;
    }
    return this.findPrevNavigableSlideIndex(this.ActiveSlideIndex) >= 0;
  }

  public get CanNavigateNextSlide(): boolean {
    if (this.IsPresentationActive && this.CurrentRevealStep < this.MaxRevealStepOnDisplayedSlide) {
      return true;
    }
    return this.findNextNavigableSlideIndex(this.ActiveSlideIndex) >= 0;
  }

  public get NextSlidePreview(): SlideSpec | null {
    const deck = this.ActiveDeckForDisplay;
    const nextIdx = this.findNextNavigableSlideIndex(this.ActiveSlideIndex);
    return nextIdx >= 0 ? deck.Slides[nextIdx] : null;
  }

  public get FormattedPresenterElapsed(): string {
    const mins = Math.floor(this.PresenterElapsedSeconds / 60);
    const secs = this.PresenterElapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  public get OpenThreadCount(): number {
    return this.AnchoredThreads.filter((t) => t.Status === 'Open').length;
  }

  /**
   * Exposes the active Yjs collaboration session for testing and parent inspection.
   */
  public get CollaborationSession(): DocumentCollaborationSession | null {
    return this.session;
  }

  public ngOnInit(): void {
    this.hasComponentInitialized = true;
    this.initializePresentationFromArtifactVersion();
    this.bindTouchPointerListenersOutsideZone();
  }

  private handleReadonlyInputChange(): void {
    if (
      !this.readonly &&
      this.ConnectionStatus === 'readonly' &&
      !this.AccessRevoked &&
      !this.PermissionVerifyError &&
      !this.LiveSyncUnavailable
    ) {
      if (!this.artifactVersion?.ArtifactID || this.ResolvedPermissions?.CanEdit === true) {
        const nextStatus =
          this.session?.Status && this.session.Status !== 'readonly'
            ? this.session.Status
            : 'local';
        this.ConnectionStatus = nextStatus;
      }
    }
    const nextCanEdit =
      !this.readonly &&
      !this.isGuestSnapshotMode &&
      this.ConnectionStatus !== 'revoked' &&
      !this.LiveSyncUnavailable &&
      (!this.artifactVersion?.ArtifactID || this.ResolvedPermissions?.CanEdit === true);
    this.session?.SetCanEdit(nextCanEdit);
    if (this.session) {
      this.ConnectionStatus = this.session.Status;
    }
    this.cdr.markForCheck();
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    if (this.pendingVersionSaveTimer) {
      clearTimeout(this.pendingVersionSaveTimer);
      this.pendingVersionSaveTimer = null;
    }
    this.cleanupPresentationRuntime();
    this.unbindTouchPointerListeners();
    this.touchMenuMonitor.Destroy();
    this.stopMoreMenuDocumentListeners();
    this.destroyCollaborationSession();
  }

  public get CanUndo(): boolean {
    return this.IsEditable && Boolean(this.session?.CanUndo);
  }

  public get CanRedo(): boolean {
    return this.IsEditable && Boolean(this.session?.CanRedo);
  }

  public UndoDeck(): void {
    if (!this.CanUndo || !this.session) {
      return;
    }
    if (this.session.Undo()) {
      this.cdr.markForCheck();
    }
  }

  public RedoDeck(): void {
    if (!this.CanRedo || !this.session) {
      return;
    }
    if (this.session.Redo()) {
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:keydown', ['$event'])
  public OnGlobalKeyDown(event: KeyboardEvent): void {
    if (this.ContextMenuOpen) {
      return;
    }

    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    if (isCmdOrCtrl && !event.altKey && event.key.toLowerCase() === 'k') {
      const targetEl = event.target instanceof HTMLElement ? event.target : null;
      const hostEl = this.hostElRef?.nativeElement ?? null;
      if (!hostEl || (targetEl && hostEl.contains(targetEl))) {
        event.preventDefault();
        event.stopPropagation();
        this.OpenCommandPalette();
      }
      return;
    }

    if (IsKeyboardContextMenuShortcut(event)) {
      const targetEl = event.target instanceof HTMLElement ? event.target : null;
      const hostEl = this.hostElRef?.nativeElement ?? null;
      const inHost =
        targetEl !== null &&
        (!hostEl || hostEl.contains(targetEl) || (targetEl === document.body && this.IsPresentationActive));
      if (targetEl && inHost && !IsNativeContextMenuTarget(targetEl)) {
        event.preventDefault();
        event.stopPropagation();
        this.openContextMenuForTargetElement(targetEl);
      }
      return;
    }

    if (this.WorkspaceMode === 'present' || this.WorkspaceMode === 'presenter') {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inEditable = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
      );
      if (inEditable) {
        return;
      }

      this.KeepPresentHudVisible();
      const key = event.key;
      const lower = key.toLowerCase();

      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
        if (key === ' ' && target && target.tagName === 'BUTTON') {
          return;
        }
        event.preventDefault();
        this.NextSlide();
      } else if (key === 'ArrowLeft' || key === 'PageUp' || key === 'Backspace') {
        event.preventDefault();
        this.PrevSlide();
      } else if (key === 'Home') {
        event.preventDefault();
        this.jumpToNavigableEdge('first');
      } else if (key === 'End') {
        event.preventDefault();
        this.jumpToNavigableEdge('last');
      } else if (lower === 'b') {
        event.preventDefault();
        this.TogglePresentationOverlay('blackout');
      } else if (lower === 'w') {
        event.preventDefault();
        this.TogglePresentationOverlay('whiteout');
      } else if (lower === 'l') {
        event.preventDefault();
        this.ToggleLaserPointer();
      } else if (lower === 'f') {
        event.preventDefault();
        this.ToggleBrowserFullscreen();
      } else if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        this.bufferSlideJumpDigit(key);
      } else if (key === 'Enter' && this.jumpDigitBuffer.length > 0) {
        event.preventDefault();
        this.commitSlideJumpBuffer();
      } else if (key === 'Escape') {
        event.preventDefault();
        if (this.PresentationOverlayMode !== 'none') {
          this.TogglePresentationOverlay('none');
        } else {
          this.ExitPresentationMode();
        }
      }
      return;
    }

    if (!this.IsEditable) {
      return;
    }
    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      if (this.CanUndo) {
        event.preventDefault();
        this.UndoDeck();
      }
    } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey && event.ctrlKey)) {
      if (this.CanRedo) {
        event.preventDefault();
        this.RedoDeck();
      }
    }
  }

  public ToggleFilmstrip(): void {
    this.ShowFilmstrip = !this.ShowFilmstrip;
    this.persistWorkspacePreferences();
  }

  /**
   * Maps host-synchronized {@link ArtifactViewerViewMode} (`NW-6`) onto Slides workspace modes & drawers.
   */
  protected override onViewerViewModeChanged(mode: ArtifactViewerViewMode): void {
    switch (mode) {
      case 'present':
        this.EnterPresentationMode('present');
        break;
      case 'diff':
        this.SetWorkspaceMode('diff');
        break;
      case 'suggest':
        this.SetWorkspaceMode('edit');
        this.RightDrawerTab = 'comments';
        this.cdr.markForCheck();
        break;
      case 'edit':
        this.SetWorkspaceMode('edit');
        break;
    }
  }

  /**
   * Navigates to target slide/region when {@link NavigationAnchor} updates (`NW-6`).
   */
  protected override onNavigationAnchorChanged(anchor: ArtifactNavigationAnchor): void {
    const slides = this.Deck?.Slides ?? [];
    let targetSlide: SlideSpec | undefined;
    if (anchor.SlideID) {
      targetSlide = slides.find((s) => UUIDsEqual(s.SlideID, anchor.SlideID));
    } else if (typeof anchor.SlideNumber === 'number') {
      targetSlide = slides.find((s) => s.SlideNumber === anchor.SlideNumber);
    }
    if (targetSlide) {
      this.SelectSlide(targetSlide.SlideID);
      if (anchor.ElementID) {
        this.OnFocusSlideElement(targetSlide.SlideID, anchor.ElementID);
      }
      return;
    }
    if (anchor.ElementID && this.ActiveSlide) {
      this.OnFocusSlideElement(this.ActiveSlide.SlideID, anchor.ElementID);
    }
  }

  /**
   * Recomputes drift summaries when server-verified snapshot provenance map changes (`NW-1`).
   */
  protected override onPreVerifiedFrozenSnapshotsChanged(): void {
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
  }

  public SetWorkspaceMode(mode: SlideWorkspaceMode): void {
    if (this.WorkspaceMode === 'source' && mode !== 'source' && this.isRawJsonDirty) {
      if (!this.ApplyRawJsonSource()) {
        return;
      }
    }
    this.flushPendingEdits();
    if (mode === 'present' || mode === 'presenter') {
      this.EnterPresentationMode(mode);
      return;
    }
    this.stopPresenterTimer();
    this.WorkspaceMode = mode;
    if (mode === 'source' && !this.isRawJsonDirty) {
      this.RawDeckJsonText = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
      this.RawJsonErrorMessage = '';
    } else if (mode === 'diff') {
      this.recomputeDiff();
    }
    this.persistWorkspacePreferences();
    this.cdr.markForCheck();
  }

  /**
   * Enters Presentation Mode or Presenter View (`O6`), automatically freezing all live MJ blocks
   * with the viewer's current rendered data so numbers do not shift mid-presentation.
   */
  public EnterPresentationMode(mode: 'present' | 'presenter', startSlideId?: string): void {
    this.flushPendingEdits();
    const alreadyPresenting =
      (this.WorkspaceMode === 'present' || this.WorkspaceMode === 'presenter') &&
      this.PresentationFrozenDeck !== null;
    if (startSlideId) {
      this.SelectSlide(startSlideId);
    }
    if (!alreadyPresenting) {
      this.PresentationFrozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
        this.Deck,
        this.blockResultsByBlockId,
        this.getCurrentUserSummary(),
      );
      this.PresentationRefreshCount = 0;
      this.PresentationFrozenAt = new Date();
      this.CurrentRevealStep = 0;
      this.PresentationOverlayMode = 'none';
      this.LaserPointerActive = false;
    }
    this.WorkspaceMode = mode;
    if (mode === 'presenter') {
      this.startPresenterTimer(!alreadyPresenting);
    } else {
      this.stopPresenterTimer();
    }
    this.ensureFullscreenListener();
    this.ensureBroadcastChannel();
    if (mode === 'present' && !alreadyPresenting) {
      this.requestShellFullscreen();
    }
    this.KeepPresentHudVisible();
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  /**
   * One-click live data refresh during Presentation Mode or Presenter View (`O6`).
   */
  public async RefreshLiveBlocksDuringPresentation(): Promise<void> {
    await this.executeAllLiveBlocksInDeck(this.Deck, true);
    this.PresentationFrozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
      this.Deck,
      this.blockResultsByBlockId,
      this.getCurrentUserSummary(),
    );
    this.PresentationRefreshCount++;
    const prevTime = this.PresentationFrozenAt?.getTime() ?? 0;
    const nowTime = Date.now();
    this.PresentationFrozenAt = new Date(nowTime > prevTime ? nowTime : prevTime + 1);
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  public ExitPresentationMode(): void {
    this.stopPresenterTimer();
    this.PresentationFrozenDeck = null;
    this.PresentationOverlayMode = 'none';
    this.LaserPointerActive = false;
    this.CurrentRevealStep = 0;
    this.clearPresentTimers();
    this.exitShellFullscreen();
    this.WorkspaceMode = 'edit';
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  public ToggleBrowserFullscreen(): void {
    if (this.IsBrowserFullscreen) {
      this.exitShellFullscreen();
    } else {
      this.ensureFullscreenListener();
      this.requestShellFullscreen();
    }
    this.cdr.markForCheck();
  }

  public TogglePresentationOverlay(mode: 'none' | 'blackout' | 'whiteout'): void {
    this.PresentationOverlayMode = this.PresentationOverlayMode === mode ? 'none' : mode;
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  public ToggleLaserPointer(): void {
    this.LaserPointerActive = !this.LaserPointerActive;
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  public KeepPresentHudVisible(): void {
    if (!this.IsPresentationActive) {
      return;
    }
    this.PresentHudVisible = true;
    if (this.presentHudHideTimer) {
      clearTimeout(this.presentHudHideTimer);
      this.presentHudHideTimer = null;
    }
    if (this.WorkspaceMode === 'present') {
      this.presentHudHideTimer = setTimeout(() => {
        this.PresentHudVisible = false;
        this.cdr.markForCheck();
      }, 2800);
    }
  }

  public OnPresentShellPointerMove(event: MouseEvent): void {
    if (!this.IsPresentationActive) {
      return;
    }
    this.KeepPresentHudVisible();
    if (this.LaserPointerActive && typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.LaserPointerX = Math.max(0, Math.min(100, (event.clientX / window.innerWidth) * 100));
      this.LaserPointerY = Math.max(0, Math.min(100, (event.clientY / window.innerHeight) * 100));
      this.broadcastPresentationState();
    }
  }

  /**
   * Opens a clean second-screen Audience window synchronized in real time via `BroadcastChannel`
   * (zero `localStorage` used, per AGENTS.md § 9).
   */
  public OpenAudienceStageWindow(): void {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return;
    }
    this.ensureBroadcastChannel();
    const channelName = this.getSyncChannelName();
    const win = window.open('', `mj-slides-audience-${channelName}`, 'width=1280,height=720');
    if (!win) {
      return;
    }
    this.popoutAudienceWindow = win;
    this.HasPopoutAudienceWindow = true;
    try {
      initializeAudienceWindowDom(win.document);
    } catch {
      // Cross-origin or sandboxed window open guard
    }
    this.broadcastPresentationState();
    this.cdr.markForCheck();
  }

  public SelectSlide(slideId: string): void {
    if (this.ActiveSlideID !== slideId) {
      this.flushPendingEdits();
    }
    this.ActiveSlideID = slideId;
    this.CurrentRevealStep = 0;
    const slide = this.ActiveSlide;
    this.FocusedRegionID = slide.Regions[0]?.RegionID ?? 'main';
    this.PendingAnchorKey = `${slide.SlideID}:${this.FocusedRegionID}`;
    this.PendingAnchorLabel = `Slide ${slide.SlideNumber} · ${slide.Regions[0]?.Label ?? 'Primary Content'}`;
    this.session?.SetActiveBlock(this.PendingAnchorKey);
    this.ShowDriftComparePopover = false;
    this.refreshDriftSummariesForActiveSlide();
    this.SelectionChanged.emit({
      domain: 'slides',
      slideId: slide.SlideID,
      slideNumber: slide.SlideNumber,
      elementId: this.FocusedRegionID || undefined,
    });
    if (this.IsPresentationActive) {
      this.broadcastPresentationState();
    }
    this.cdr.markForCheck();
  }

  private flushPendingEdits(): void {
    const hostEl = this.hostElRef?.nativeElement ?? this.captureHostElementRef?.nativeElement ?? null;
    if (!hostEl) {
      return;
    }
    const targetSlideId = this.editingSlideId ?? this.ActiveSlide?.SlideID;
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === targetSlideId);
    if (!targetSlide) {
      return;
    }

    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (activeEl && hostEl.contains(activeEl) && activeEl.isContentEditable) {
      activeEl.blur();
    }

    if (!this.IsEditable || this.WorkspaceMode !== 'edit') {
      return;
    }

    const titleEl = hostEl.querySelector<HTMLElement>('[data-testid="editable-slide-title"]');
    if (titleEl) {
      const nextTitle = (titleEl.innerText ?? '').trim();
      if (nextTitle && nextTitle !== targetSlide.Title) {
        this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Title: nextTitle });
      }
    }

    const subtitleEl = hostEl.querySelector<HTMLElement>('[data-testid="editable-slide-subtitle"]');
    if (subtitleEl) {
      const nextSub = (subtitleEl.innerText ?? '').trim();
      if (nextSub !== (targetSlide.Subtitle ?? '')) {
        this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Subtitle: nextSub });
      }
    }

    for (const region of targetSlide.Regions) {
      if (region.Kind === 'big-number') {
        const valEl = hostEl.querySelector<HTMLElement>(
          `[data-testid="editable-big-number-value-${region.RegionID}"]`,
        );
        if (valEl) {
          const valText = (valEl.innerText ?? '').trim();
          if (valText !== (region.BigNumberValue ?? '')) {
            this.applySingleSlideRegionPatch(targetSlide.SlideID, {
              RegionID: region.RegionID,
              BigNumberValue: valText,
            });
          }
        }
      } else if (region.Kind === 'rich-text' || region.Kind === 'callout' || region.Kind === 'quote') {
        const regEl = hostEl.querySelector<HTMLElement>(
          `[data-testid="editable-region-content-${region.RegionID}"]`,
        );
        if (regEl) {
          const md = this.convertEditableRegionDomToMarkdown(regEl);
          if (md !== (region.MarkdownContent ?? '')) {
            this.applySingleSlideRegionPatch(targetSlide.SlideID, {
              RegionID: region.RegionID,
              MarkdownContent: md,
            });
          }
        }
      }
    }
    this.hasUncommittedDomInput = false;
    this.editingSlideId = null;
  }

  public PrevSlide(): void {
    if (this.IsPresentationActive && this.CurrentRevealStep > 0) {
      this.CurrentRevealStep--;
      this.broadcastPresentationState();
      this.cdr.markForCheck();
      return;
    }
    const targetIdx = this.findPrevNavigableSlideIndex(this.ActiveSlideIndex);
    if (targetIdx >= 0) {
      const target = this.ActiveDeckForDisplay.Slides[targetIdx];
      this.SelectSlide(target.SlideID);
      if (this.IsPresentationActive) {
        this.CurrentRevealStep = this.MaxRevealStepOnDisplayedSlide;
        this.broadcastPresentationState();
        this.cdr.markForCheck();
      }
    }
  }

  public NextSlide(): void {
    const maxStep = this.MaxRevealStepOnDisplayedSlide;
    if (this.IsPresentationActive && maxStep > 0 && this.CurrentRevealStep < maxStep) {
      this.CurrentRevealStep++;
      this.broadcastPresentationState();
      this.cdr.markForCheck();
      return;
    }
    const targetIdx = this.findNextNavigableSlideIndex(this.ActiveSlideIndex);
    if (targetIdx >= 0) {
      const target = this.ActiveDeckForDisplay.Slides[targetIdx];
      this.SelectSlide(target.SlideID);
    }
  }

  /**
   * Auto-polishes the active slide deterministically (`BeautifySlide`), syncing via Yjs (`Accept #1`).
   */
  public get ActiveSlideLayoutLabel(): string {
    const meta = this.LayoutCatalog.find((m) => m.Kind === this.ActiveSlide.Layout);
    return meta?.Label ?? this.ActiveSlide.Layout;
  }

  public CycleActiveSlideTransition(): void {
    const transitions: ReadonlyArray<SlideTransitionKind> = ['none', 'fade', 'slide', 'zoom'];
    const current = this.ActiveSlide.Transition || 'fade';
    const next = transitions[(transitions.indexOf(current) + 1) % transitions.length];
    this.OnChangeActiveSlideTransition(next);
  }

  public OpenCommandPalette(): void {
    this.ShowMoreToolsMenu = false;
    this.ShowDesignPopover = false;
    this.ShowCommandPalette = true;
    this.cdr.markForCheck();
  }

  public get SlidesCommandPaletteItems(): ArtifactCommandPaletteItem[] {
    const items: ArtifactCommandPaletteItem[] = [
      {
        Id: 'present',
        Label: 'Present Fullscreen',
        Category: 'Present',
        Icon: 'fa-play',
        Description: 'Start full-screen slide presentation',
      },
      {
        Id: 'presenter',
        Label: 'Open Presenter View',
        Category: 'Present',
        Icon: 'fa-chalkboard-user',
        Description: 'Speaker notes, next-slide cockpit & timer',
      },
      {
        Id: 'polish-slide',
        Label: 'Polish Active Slide',
        Category: 'Design',
        Icon: 'fa-sparkles',
        Disabled: !this.CanEditSlideElements,
        Description: 'Auto-improve spacing, KPI cards, and reveal steps',
      },
      {
        Id: 'toggle-filmstrip',
        Label: this.ShowFilmstrip ? 'Hide Slide Sorter Filmstrip' : 'Show Slide Sorter Filmstrip',
        Category: 'View',
        Icon: 'fa-film',
      },
      {
        Id: 'comments',
        Label: `Toggle Comments (${this.OpenThreadCount})`,
        Category: 'Review',
        Icon: 'fa-comments',
      },
      {
        Id: 'lock-slide',
        Label: this.ActiveSlide.Locked ? 'Unlock Current Slide' : 'Lock Current Slide',
        Category: 'Permissions',
        Icon: this.ActiveSlide.Locked ? 'fa-lock-open' : 'fa-lock',
        Disabled: !this.CanToggleCurrentSlideLock,
      },
    ];

    for (const item of this.AllToolbarItems) {
      if (!items.some((existing) => existing.Id === `tb:${item.Key}`)) {
        items.push({
          Id: `tb:${item.Key}`,
          Label: item.Label,
          Category: item.Category,
          Icon: item.Icon,
          Description: item.Description,
          Active: item.Active,
          Disabled: item.Disabled,
        });
      }
    }

    for (const layoutMeta of this.LayoutCatalog) {
      items.push({
        Id: `layout:${layoutMeta.Kind}`,
        Label: `Layout: ${layoutMeta.Label}`,
        Category: 'Layout',
        Icon: 'fa-table-columns',
        Active: this.ActiveSlide.Layout === layoutMeta.Kind,
        Disabled: !this.CanEditSlideElements,
      });
    }

    for (const preset of this.ThemePresets) {
      items.push({
        Id: `theme:${preset.ThemeID}`,
        Label: `Theme: ${preset.ThemeID}`,
        Category: 'Theme',
        Icon: 'fa-palette',
        Active: this.Deck.Theme.ThemeID === preset.ThemeID,
        Disabled: !this.IsEditable,
      });
    }
    return items;
  }

  public ExecuteSlidePaletteCommand(commandId: string): void {
    if (commandId === 'present') {
      this.SetWorkspaceMode('present');
      return;
    }
    if (commandId === 'presenter') {
      this.SetWorkspaceMode('presenter');
      return;
    }
    if (commandId === 'polish-slide') {
      this.OnPolishActiveSlide();
      return;
    }
    if (commandId === 'toggle-filmstrip') {
      this.ToggleFilmstrip();
      return;
    }
    if (commandId === 'comments') {
      this.ToggleRightDrawer('comments');
      return;
    }
    if (commandId === 'lock-slide') {
      this.ToggleCurrentSlideLock();
      return;
    }
    if (commandId.startsWith('tb:')) {
      const key = commandId.slice(3) as SlidesToolbarItemKey;
      const found = this.AllToolbarItems.find((i) => i.Key === key);
      if (found) {
        this.ExecuteToolbarItem(found, false);
      }
      return;
    }
    if (commandId.startsWith('layout:')) {
      this.OnChangeActiveSlideLayout(commandId.slice(7) as SlideLayoutKind);
      return;
    }
    if (commandId.startsWith('theme:')) {
      this.OnSelectThemePreset(commandId.slice(6));
    }
  }

  public OnPolishActiveSlide(): void {
    if (!this.IsEditable || !this.CanEditSlideElements) {
      return;
    }
    this.flushPendingEdits();
    const lockCtx = this.buildLockContext();
    try {
      const res = SlideDeckEngine.Instance.BeautifySlide(this.Deck, this.ActiveSlide.SlideID, lockCtx);
      if (!res.UpdatedSlide) {
        return;
      }
      this.Deck = res.Deck;
      this.session?.UpdateSlideInDeck(res.UpdatedSlide, this.Deck);
      this.session?.UpdateDeckMeta(this.Deck);
      this.syncRawDeckJson();
      this.FocusedRegionID = res.UpdatedSlide.Regions[0]?.RegionID ?? this.FocusedRegionID;
      if (res.Improvements.length > 0) {
        this.notificationService?.CreateSimpleNotification(
          `Slide polished: ${res.Improvements[0]}`,
          'success',
          2600,
        );
      }
      this.cdr.markForCheck();
    } catch (err) {
      this.StatusBannerMessage = err instanceof Error ? err.message : String(err);
      this.cdr.markForCheck();
    }
  }

  public OnChangeActiveSlideTransition(transition: SlideTransitionKind): void {
    if (!this.CanEditSlideElements) {
      return;
    }
    this.applySingleSlideMetadataPatch(this.ActiveSlide.SlideID, { Transition: transition });
  }

  private findPrevNavigableSlideIndex(fromIdx: number): number {
    const slides = this.ActiveDeckForDisplay.Slides;
    for (let i = fromIdx - 1; i >= 0; i--) {
      if (!this.IsPresentationActive || !slides[i].Hidden) {
        return i;
      }
    }
    return -1;
  }

  private findNextNavigableSlideIndex(fromIdx: number): number {
    const slides = this.ActiveDeckForDisplay.Slides;
    for (let i = fromIdx + 1; i < slides.length; i++) {
      if (!this.IsPresentationActive || !slides[i].Hidden) {
        return i;
      }
    }
    return -1;
  }

  public ToggleRightDrawer(tab: 'theme' | 'comments'): void {
    this.RightDrawerTab = this.RightDrawerTab === tab ? 'none' : tab;
    this.persistWorkspacePreferences();
    this.cdr.markForCheck();
  }

  /**
   * Adds a new slide right after the currently active slide and syncs via Yjs (`Accept #1`).
   */
  public OnAddSlide(layout: SlideLayoutKind = 'TitleAndBody'): void {
    if (!this.IsEditable) {
      return;
    }
    const insertIdx = this.ActiveSlideIndex + 1;
    const { Deck: updatedDeck, AddedSlide } = SlideDeckEngine.Instance.AddSlide(this.Deck, {
      Layout: layout,
      Title: `Slide ${this.Deck.Slides.length + 1}: Strategic Overview`,
      Subtitle: 'Click to edit subtitle or choose a layout',
      InsertAtIndex: insertIdx,
    });
    const orderedSlideIds = updatedDeck.Slides.map((s) => s.SlideID);
    this.Deck = updatedDeck;
    this.ActiveSlideID = AddedSlide.SlideID;
    this.FocusedRegionID = AddedSlide.Regions[0]?.RegionID ?? 'main';

    if (this.session) {
      this.session.UpdateSlideInDeck(AddedSlide, updatedDeck);
      this.session.ReorderSlidesInDeck(orderedSlideIds, updatedDeck);
    }
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  public OnDuplicateActiveSlide(): void {
    if (!this.IsEditable) {
      return;
    }
    const { Deck: updatedDeck, DuplicatedSlide } = SlideDeckEngine.Instance.DuplicateSlide(
      this.Deck,
      this.ActiveSlide.SlideID,
    );
    if (!DuplicatedSlide) {
      return;
    }
    const orderedSlideIds = updatedDeck.Slides.map((s) => s.SlideID);
    this.Deck = updatedDeck;
    this.ActiveSlideID = DuplicatedSlide.SlideID;
    if (this.session) {
      this.session.UpdateSlideInDeck(DuplicatedSlide, updatedDeck);
      this.session.ReorderSlidesInDeck(orderedSlideIds, updatedDeck);
    }
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  public OnDeleteActiveSlide(): void {
    if (!this.IsEditable || this.Deck.Slides.length <= 1) {
      return;
    }
    this.DeleteSlideById(this.ActiveSlide.SlideID);
  }

  /**
   * Moves a slide up (`-1`) or down (`+1`) in the filmstrip rail and broadcasts the new
   * `slideOrder` (`Y.Array`) without overwriting any slide's content (`Accept #1`).
   */
  public OnMoveSlide(slideId: string, delta: -1 | 1): void {
    if (!this.IsEditable) {
      return;
    }
    this.Deck = SlideDeckEngine.Instance.MoveSlide(this.Deck, slideId, delta);
    this.session?.ReorderSlidesInDeck(
      this.Deck.Slides.map((s) => s.SlideID),
      this.Deck,
    );
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  // =========================================================================
  // Touch Long-Press & Right-Click Context Menu Support
  // =========================================================================

  private bindTouchPointerListenersOutsideZone(): void {
    this.unbindTouchPointerListeners();
    const hostEl = this.hostElRef?.nativeElement ?? null;
    if (!hostEl || typeof hostEl.addEventListener !== 'function') {
      return;
    }
    const onDown = (event: PointerEvent): void => this.OnTouchPointerDown(event);
    const onMove = (event: PointerEvent): void => this.OnTouchPointerMove(event);
    const onUp = (event: PointerEvent): void => this.OnTouchPointerUp(event);
    const onCancel = (event: PointerEvent): void => this.OnTouchPointerCancel(event);
    const onClickCapture = (event: MouseEvent): void => this.OnShellClick(event);

    const attach = (): void => {
      hostEl.addEventListener('pointerdown', onDown, { passive: true });
      hostEl.addEventListener('pointermove', onMove, { passive: true });
      hostEl.addEventListener('pointerup', onUp, { passive: true });
      hostEl.addEventListener('pointercancel', onCancel, { passive: true });
      // Register click suppression in true DOM capture phase (Angular templates bind '(click.capture)' as a literal event name)
      hostEl.addEventListener('click', onClickCapture, { capture: true });
    };
    if (this.ngZone) {
      this.ngZone.runOutsideAngular(attach);
    } else {
      attach();
    }

    this.touchPointerCleanup = () => {
      hostEl.removeEventListener('pointerdown', onDown);
      hostEl.removeEventListener('pointermove', onMove);
      hostEl.removeEventListener('pointerup', onUp);
      hostEl.removeEventListener('pointercancel', onCancel);
      hostEl.removeEventListener('click', onClickCapture, { capture: true });
    };
  }

  private unbindTouchPointerListeners(): void {
    if (this.touchPointerCleanup) {
      this.touchPointerCleanup();
      this.touchPointerCleanup = null;
    }
  }

  public OnTouchPointerDown(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerDown(event);
  }

  public OnTouchPointerMove(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerMove(event);
  }

  public OnTouchPointerUp(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerUp(event);
  }

  public OnTouchPointerCancel(event: PointerEvent): void {
    this.touchMenuMonitor.OnPointerCancel(event);
  }

  public OnShellClick(event: MouseEvent): void {
    if (this.touchMenuMonitor.ConsumeSuppressedClick()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Opens the filmstrip context menu for a specific slide thumbnail (Zone 3a).
   */
  public OnFilmstripSlideContextMenu(event: MouseEvent, slide: SlideSpec): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openContextMenuAt('filmstrip-slide', event.clientX, event.clientY, slide, undefined, restoreEl);
  }

  /**
   * Opens the filmstrip context menu on empty rail whitespace (Zone 3a empty state).
   */
  public OnFilmstripEmptyContextMenu(event: MouseEvent): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openContextMenuAt('filmstrip-empty', event.clientX, event.clientY, this.ActiveSlide, undefined, restoreEl);
  }

  /**
   * Opens the stage background, viewer, or presentation navigation context menu (Zones 3b & 3d).
   */
  public OnSlideStageContextMenu(event: MouseEvent): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const zone: SlidesContextMenuZone = this.IsPresentationActive
      ? 'presentation-stage'
      : this.IsEditable
        ? 'stage-background'
        : 'viewer-stage';
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openContextMenuAt(zone, event.clientX, event.clientY, this.DisplayedSlide, undefined, restoreEl);
  }

  /**
   * Opens the context menu for a slide region / live block / inline OLE card (Zone 3c),
   * delegating to navigation/viewer zones when read-only or presenting.
   */
  public OnSlideRegionContextMenu(event: MouseEvent, region: SlideRegionSpec): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const zone: SlidesContextMenuZone = this.IsPresentationActive
      ? 'presentation-stage'
      : this.IsEditable
        ? 'slide-region'
        : 'viewer-stage';
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openContextMenuAt(zone, event.clientX, event.clientY, this.DisplayedSlide, region, restoreEl);
  }

  /**
   * Opens the speaker-notes context menu (Zone 3d), bypassing when native `<textarea>` handles editing.
   */
  public OnSpeakerNotesContextMenu(event: MouseEvent): void {
    if (ShouldBypassCustomContextMenu(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const restoreEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.openContextMenuAt('speaker-notes', event.clientX, event.clientY, this.DisplayedSlide, undefined, restoreEl);
  }

  /**
   * Closes any active context menu without exiting active presentation mode.
   */
  public CloseContextMenu(): void {
    if (!this.ContextMenuOpen) {
      return;
    }
    this.ContextMenuOpen = false;
    this.ContextMenuItems = [];
    this.ContextMenuRestoreFocusEl = null;
    this.cdr.markForCheck();
  }

  /**
   * Executes a selected context menu command dispatched by `<mj-context-menu>`.
   */
  public OnSlidesContextMenuCommand(command: SlidesContextMenuCommand): void {
    this.ContextMenuOpen = false;
    this.ContextMenuItems = [];

    switch (command.Type) {
      case 'add-slide':
        this.InsertSlideAfter(command.Layout, command.AfterSlideID);
        break;
      case 'duplicate-slide':
        this.DuplicateSlideById(command.SlideID);
        break;
      case 'delete-slide':
        this.DeleteSlideById(command.SlideID);
        break;
      case 'move-slide':
        this.OnMoveSlide(command.SlideID, command.Delta);
        break;
      case 'move-slide-edge':
        this.MoveSlideToEdge(command.SlideID, command.Edge);
        break;
      case 'change-layout':
        this.ChangeSlideLayoutById(command.SlideID, command.Layout);
        break;
      case 'set-transition':
        this.SetSlideTransition(command.SlideID, command.Transition);
        break;
      case 'toggle-slide-hidden':
        this.ToggleSlideHidden(command.SlideID);
        break;
      case 'toggle-slide-lock':
        this.ToggleSlideLockById(command.SlideID);
        break;
      case 'focus-speaker-notes':
        this.FocusSpeakerNotesForSlide(command.SlideID);
        break;
      case 'comment-slide': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID) ?? this.ActiveSlide;
        const primaryRegion = slide.Regions[0];
        this.OpenCommentForSlideRegion(
          slide.SlideID,
          primaryRegion?.RegionID ?? 'main',
          primaryRegion?.Label ?? 'Slide',
        );
        break;
      }
      case 'copy-slide-markdown':
        this.CopySlideAsMarkdown(command.SlideID);
        break;
      case 'select-theme-preset':
        this.OnSelectThemePreset(command.ThemeID);
        break;
      case 'open-theme-drawer':
        this.RightDrawerTab = 'theme';
        this.persistWorkspacePreferences();
        this.cdr.markForCheck();
        break;
      case 'ask-ai-slide':
        this.SelectSlide(command.SlideID);
        this.OpenAskAiForPresentation();
        break;
      case 'present':
        this.EnterPresentationMode(command.Mode, command.SlideID);
        break;
      case 'exit-presentation':
        this.ExitPresentationMode();
        break;
      case 'navigate-slide':
        if (command.Direction === 'prev') {
          this.PrevSlide();
        } else {
          this.NextSlide();
        }
        break;
      case 'jump-to-slide':
        this.SelectSlide(command.SlideID);
        break;
      case 'refresh-presentation-live-blocks':
        void this.RefreshLiveBlocksDuringPresentation();
        break;
      case 'export':
        if (command.Format === 'pptx') {
          this.OnExportPptx();
        } else {
          this.OnExportPdf();
        }
        break;
      case 'insert-region-content':
        this.InsertRegionContentPreset(command.SlideID, command.RegionID, command.Preset);
        break;
      case 'edit-region-inline':
        this.FocusRegionInlineEditor(command.SlideID, command.RegionID);
        break;
      case 'toggle-ole-edit':
        this.ToggleOleRegionEditing(command.RegionID);
        break;
      case 'cut-region':
        this.CutSlideRegion(command.SlideID, command.RegionID);
        break;
      case 'copy-region':
        this.CopySlideRegion(command.SlideID, command.RegionID);
        break;
      case 'duplicate-region':
        this.DuplicateSlideRegion(command.SlideID, command.RegionID);
        break;
      case 'paste-region':
        this.PasteIntoSlideRegion(command.SlideID, command.RegionID);
        break;
      case 'change-region-kind': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        if (region) {
          this.OnChangeRegionKind(region, command.Kind);
        }
        break;
      }
      case 'swap-region':
        this.SwapSlideRegion(command.SlideID, command.RegionID, command.Delta);
        break;
      case 'clear-region':
        this.ClearSlideRegion(command.SlideID, command.RegionID);
        break;
      case 'toggle-region-lock':
        this.ToggleRegionLockById(command.SlideID, command.RegionID);
        break;
      case 'comment-region': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        this.OpenCommentForSlideRegion(command.SlideID, command.RegionID, region?.Label ?? 'Region');
        break;
      }
      case 'refresh-region-block': {
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        const block = region ? this.GetRegionBlockSpec(region) : null;
        if (region && block) {
          void this.ExecuteSlideRegionBlock(region, block);
        }
        break;
      }
      case 'open-sheet-embed': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        if (region) {
          void this.OpenSheetEmbedModal(region);
        }
        break;
      }
      case 'update-workbook-version': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        const block = region ? this.GetRegionBlockSpec(region) : null;
        if (region && block) {
          this.UpdateRegionBlockToLatestWorkbookVersion(region, block);
        }
        break;
      }
      case 'freeze-region-block': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        const block = region ? this.GetRegionBlockSpec(region) : null;
        if (region && block) {
          this.PromptFreezeSlideRegionBlock(region, block);
        }
        break;
      }
      case 'unfreeze-region-block': {
        this.SelectSlide(command.SlideID);
        const slide = this.Deck.Slides.find((s) => s.SlideID === command.SlideID);
        const region = slide?.Regions.find((r) => r.RegionID === command.RegionID);
        const block = region ? this.GetRegionBlockSpec(region) : null;
        if (region && block) {
          this.UnfreezeSlideRegionBlock(region, block);
        }
        break;
      }
      case 'open-source-artifact':
        this.OpenSourceArtifactById(command.ArtifactID);
        break;
      case 'copy-block-json':
        this.CopyBlockJson(command.SlideID, command.RegionID);
        break;
      case 'copy-speaker-notes':
        this.CopySpeakerNotesForSlide(command.SlideID);
        break;
      case 'copy-slide-and-notes-markdown':
        this.CopySlideAndNotesAsMarkdown(command.SlideID);
        break;
      case 'reset-presenter-timer':
        this.ResetPresenterTimer();
        break;
    }
    this.cdr.markForCheck();
  }

  /**
   * Inserts a new slide immediately after `afterSlideId` (or after the active slide).
   */
  public InsertSlideAfter(layout: SlideLayoutKind = 'TitleAndBody', afterSlideId?: string): void {
    if (!this.IsEditable) {
      return;
    }
    const afterIdx = afterSlideId
      ? this.Deck.Slides.findIndex((s) => s.SlideID === afterSlideId)
      : this.ActiveSlideIndex;
    const insertIdx = afterIdx >= 0 ? afterIdx + 1 : this.Deck.Slides.length;
    const { Deck: updatedDeck, AddedSlide } = SlideDeckEngine.Instance.AddSlide(this.Deck, {
      Layout: layout,
      Title: `Slide ${this.Deck.Slides.length + 1}: Strategic Overview`,
      Subtitle: 'Click to edit subtitle or choose a layout',
      InsertAtIndex: insertIdx,
    });
    const orderedSlideIds = updatedDeck.Slides.map((s) => s.SlideID);
    this.Deck = updatedDeck;
    this.ActiveSlideID = AddedSlide.SlideID;
    this.FocusedRegionID = AddedSlide.Regions[0]?.RegionID ?? 'main';

    if (this.session) {
      this.session.UpdateSlideInDeck(AddedSlide, updatedDeck);
      this.session.ReorderSlidesInDeck(orderedSlideIds, updatedDeck);
    }
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Duplicates the specified slide and focuses the copy.
   */
  public DuplicateSlideById(slideId: string): void {
    if (!this.IsEditable) {
      return;
    }
    const { Deck: updatedDeck, DuplicatedSlide } = SlideDeckEngine.Instance.DuplicateSlide(
      this.Deck,
      slideId,
    );
    if (!DuplicatedSlide) {
      return;
    }
    const orderedSlideIds = updatedDeck.Slides.map((s) => s.SlideID);
    this.Deck = updatedDeck;
    this.ActiveSlideID = DuplicatedSlide.SlideID;
    this.FocusedRegionID = DuplicatedSlide.Regions[0]?.RegionID ?? 'main';
    if (this.session) {
      this.session.UpdateSlideInDeck(DuplicatedSlide, updatedDeck);
      this.session.ReorderSlidesInDeck(orderedSlideIds, updatedDeck);
    }
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Deletes `slideId` when more than one slide exists and the actor may edit the slide.
   */
  public DeleteSlideById(slideId: string): void {
    if (!this.IsEditable || this.Deck.Slides.length <= 1) {
      return;
    }
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (targetSlide) {
      const check = SlideDeckEngine.Instance.CanActorEditSlide(
        targetSlide,
        userId,
        ownerId,
        this.IsEditable,
      );
      if (!check.Allowed) {
        this.StatusBannerMessage = check.Reason || 'This slide is locked.';
        this.cdr.markForCheck();
        return;
      }
    }
    const targetIdx = this.Deck.Slides.findIndex((s) => s.SlideID === slideId);
    const { Deck: updatedDeck, Deleted } = SlideDeckEngine.Instance.DeleteSlide(this.Deck, slideId, {
      ActorUserID: userId,
      OwnerUserID: ownerId,
      IsEditor: this.IsEditable,
    });
    if (!Deleted) {
      return;
    }
    this.Deck = updatedDeck;
    if (this.ActiveSlideID === slideId || !this.Deck.Slides.some((s) => s.SlideID === this.ActiveSlideID)) {
      const fallbackIdx = Math.min(Math.max(targetIdx, 0), this.Deck.Slides.length - 1);
      const nextSlide = this.Deck.Slides[fallbackIdx];
      this.ActiveSlideID = nextSlide.SlideID;
      this.FocusedRegionID = nextSlide.Regions[0]?.RegionID ?? 'main';
    }
    this.session?.DeleteSlideFromDeck(slideId, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Moves `slideId` directly to the beginning (`start`) or end (`end`) of the deck.
   */
  public MoveSlideToEdge(slideId: string, edge: 'start' | 'end'): void {
    if (!this.IsEditable) {
      return;
    }
    const slides = this.Deck.Slides;
    const currentIdx = slides.findIndex((s) => s.SlideID === slideId);
    if (currentIdx < 0) {
      return;
    }
    if ((edge === 'start' && currentIdx === 0) || (edge === 'end' && currentIdx === slides.length - 1)) {
      return;
    }
    const remainingIds = slides.filter((s) => s.SlideID !== slideId).map((s) => s.SlideID);
    const orderedSlideIds = edge === 'start' ? [slideId, ...remainingIds] : [...remainingIds, slideId];
    this.Deck = SlideDeckEngine.Instance.ReorderSlides(this.Deck, orderedSlideIds);
    this.SelectSlide(slideId);
    this.session?.ReorderSlidesInDeck(orderedSlideIds, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Changes the layout of a specific slide (selecting it if not already active).
   */
  public ChangeSlideLayoutById(slideId: string, newLayout: SlideLayoutKind): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (targetSlide) {
      const check = SlideDeckEngine.Instance.CanActorEditSlide(
        targetSlide,
        userId,
        ownerId,
        this.IsEditable,
      );
      if (!check.Allowed) {
        this.StatusBannerMessage = check.Reason || 'This slide is locked.';
        this.cdr.markForCheck();
        return;
      }
      for (const reg of targetSlide.Regions) {
        const regCheck = SlideDeckEngine.Instance.CanActorEditRegion(
          targetSlide,
          reg,
          userId,
          ownerId,
          this.IsEditable,
        );
        if (!regCheck.Allowed) {
          this.StatusBannerMessage =
            regCheck.Reason || 'Cannot change layout while a region on this slide is locked.';
          this.cdr.markForCheck();
          return;
        }
      }
    }
    this.applySingleSlideMetadataPatch(slideId, { Layout: newLayout });
    const updatedSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    if (updatedSlide) {
      this.ActiveSlideID = updatedSlide.SlideID;
      this.FocusedRegionID = updatedSlide.Regions[0]?.RegionID ?? 'main';
    }
    this.cdr.markForCheck();
  }

  /**
   * Sets the slide transition (`none`, `fade`, or `slide`) on `slideId`.
   */
  public SetSlideTransition(slideId: string, transition: SlideTransitionKind): void {
    if (!this.IsEditable) {
      return;
    }
    this.applySingleSlideMetadataPatch(slideId, { Transition: transition });
  }

  /**
   * Toggles `SlideSpec.Hidden` so the slide shows a skip badge in Studio and is skipped in Presentation Mode.
   */
  public ToggleSlideHidden(slideId: string): void {
    if (!this.IsEditable) {
      return;
    }
    const target = this.Deck.Slides.find((s) => s.SlideID === slideId);
    if (!target) {
      return;
    }
    this.applySingleSlideMetadataPatch(slideId, { Hidden: !target.Hidden });
  }

  /**
   * Toggles the lock state of a specific slide by ID.
   */
  public ToggleSlideLockById(slideId: string): void {
    this.SelectSlide(slideId);
    this.ToggleCurrentSlideLock();
  }

  /**
   * Selects `slideId` and focuses the speaker notes textarea.
   */
  public FocusSpeakerNotesForSlide(slideId: string): void {
    this.SelectSlide(slideId);
    const hostEl = this.hostElRef?.nativeElement ?? this.captureHostElementRef?.nativeElement ?? null;
    const focusNotes = () => {
      const textarea = hostEl?.querySelector<HTMLTextAreaElement>('[data-testid="speaker-notes-input"]');
      textarea?.focus();
    };
    focusNotes();
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(focusNotes);
    }
  }

  /**
   * Copies the serialized Markdown of `slideId` to the clipboard.
   */
  public CopySlideAsMarkdown(slideId: string): void {
    const slide = this.ActiveDeckForDisplay.Slides.find((s) => s.SlideID === slideId) ?? this.DisplayedSlide;
    const markdown = SerializeSlideToMarkdown(slide, false);
    this.writeTextToClipboard(markdown, `Copied Slide ${slide.SlideNumber} as Markdown.`);
  }

  /**
   * Copies only the speaker notes for `slideId` to the clipboard.
   */
  public CopySpeakerNotesForSlide(slideId: string): void {
    const slide = this.ActiveDeckForDisplay.Slides.find((s) => s.SlideID === slideId) ?? this.DisplayedSlide;
    const notes = slide.SpeakerNotes ?? '';
    this.writeTextToClipboard(notes, `Copied Speaker Notes for Slide ${slide.SlideNumber}.`);
  }

  /**
   * Copies the serialized Markdown of `slideId` together with its speaker notes.
   */
  public CopySlideAndNotesAsMarkdown(slideId: string): void {
    const slide = this.ActiveDeckForDisplay.Slides.find((s) => s.SlideID === slideId) ?? this.DisplayedSlide;
    const markdown = SerializeSlideToMarkdown(slide, true);
    this.writeTextToClipboard(markdown, `Copied Slide ${slide.SlideNumber} and Speaker Notes.`);
  }

  /**
   * Inserts a starter text, bullet list, Live View, Sheet chart, or inline Whiteboard into a slide region.
   */
  public InsertRegionContentPreset(
    slideId: string,
    regionId: string,
    preset: 'text' | 'bullets' | 'live-view' | 'sheet-chart' | 'whiteboard',
  ): void {
    if (!this.IsEditable) {
      return;
    }
    this.SelectSlide(slideId);
    this.FocusedRegionID = regionId;
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const region = slide?.Regions.find((r) => r.RegionID === regionId);
    if (!region) {
      return;
    }

    switch (preset) {
      case 'text':
        this.applySingleSlideRegionPatch(slideId, {
          RegionID: regionId,
          Kind: 'rich-text',
          MarkdownContent: region.MarkdownContent?.trim()
            ? `${region.MarkdownContent.trim()}\n\nNew section narrative`
            : 'Key takeaway summary — click to edit',
        });
        this.FocusRegionInlineEditor(slideId, regionId);
        break;
      case 'bullets':
        this.applySingleSlideRegionPatch(slideId, {
          RegionID: regionId,
          Kind: 'rich-text',
          MarkdownContent: region.MarkdownContent?.trim()
            ? `${region.MarkdownContent.trim()}\n- New bullet point`
            : '- Strategic priority 1\n- Strategic priority 2\n- Strategic priority 3',
        });
        this.FocusRegionInlineEditor(slideId, regionId);
        break;
      case 'live-view':
        this.EmbedLiveEntityViewInRegion(region);
        break;
      case 'sheet-chart':
        void this.OpenSheetEmbedModal(region);
        break;
      case 'whiteboard':
        void this.EmbedInlineWhiteboardInRegion(region);
        break;
    }
  }

  /**
   * Focuses the inline contenteditable surface inside `regionId`.
   */
  public FocusRegionInlineEditor(slideId: string, regionId: string): void {
    this.SelectSlide(slideId);
    this.FocusedRegionID = regionId;
    this.cdr.detectChanges();
    const hostEl = this.hostElRef?.nativeElement ?? this.captureHostElementRef?.nativeElement ?? null;
    const regionCard = hostEl?.querySelector<HTMLElement>(`[data-testid="slide-region-${regionId}"]`);
    const editableEl = regionCard?.querySelector<HTMLElement>('[contenteditable="true"]') ?? regionCard;
    editableEl?.focus();
    this.cdr.markForCheck();
  }

  /**
   * Copies `regionId` into the internal slide region clipboard without mutating the slide.
   */
  public CopySlideRegion(slideId: string, regionId: string): void {
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const region = slide?.Regions.find((r) => r.RegionID === regionId);
    if (!region) {
      return;
    }
    this.copiedSlideRegionSpec = this.cloneRegionSpec(region);
    this.StatusBannerMessage = `Copied region "${region.Label}".`;
    this.cdr.markForCheck();
  }

  /**
   * Copies `regionId` into the region clipboard and clears the original region.
   */
  public CutSlideRegion(slideId: string, regionId: string): void {
    if (!this.IsEditable) {
      return;
    }
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const region = slide?.Regions.find((r) => r.RegionID === regionId);
    if (!slide || !region) {
      return;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const check = SlideDeckEngine.Instance.CanActorEditRegion(
      slide,
      region,
      userId,
      ownerId,
      this.IsEditable,
    );
    if (!check.Allowed) {
      this.StatusBannerMessage = check.Reason || 'This slide region is locked.';
      this.cdr.markForCheck();
      return;
    }
    this.CopySlideRegion(slideId, regionId);
    this.ClearSlideRegion(slideId, regionId);
  }

  /**
   * Inserts a duplicate copy of `regionId` directly after the source region on `slideId`.
   */
  public DuplicateSlideRegion(slideId: string, regionId: string): void {
    if (!this.IsEditable) {
      return;
    }
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const idx = slide?.Regions.findIndex((r) => r.RegionID === regionId) ?? -1;
    if (!slide || idx < 0) {
      return;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const slideCheck = SlideDeckEngine.Instance.CanActorEditSlide(slide, userId, ownerId, this.IsEditable);
    if (!slideCheck.Allowed) {
      this.StatusBannerMessage = slideCheck.Reason || 'This slide is locked.';
      this.cdr.markForCheck();
      return;
    }
    const sourceRegion = slide.Regions[idx];
    const cloned = this.cloneRegionSpec(sourceRegion);
    const duplicatedRegion: SlideRegionSpec = {
      ...cloned,
      RegionID: `${sourceRegion.RegionID}-copy-${Date.now()}`,
      Label: `${sourceRegion.Label} (Copy)`,
      Locked: false,
      LockedByUserID: undefined,
    };
    const nextRegions = [
      ...slide.Regions.slice(0, idx + 1),
      duplicatedRegion,
      ...slide.Regions.slice(idx + 1),
    ];
    this.commitSlideRegionsOrder(slideId, nextRegions);
    this.FocusedRegionID = duplicatedRegion.RegionID;
    this.cdr.markForCheck();
  }

  /**
   * Pastes `copiedSlideRegionSpec` content into `regionId` on `slideId`.
   */
  public PasteIntoSlideRegion(slideId: string, regionId: string): void {
    if (!this.IsEditable || !this.copiedSlideRegionSpec) {
      return;
    }
    const copied = this.cloneRegionSpec(this.copiedSlideRegionSpec);
    this.applySingleSlideRegionPatch(slideId, {
      RegionID: regionId,
      Kind: copied.Kind,
      MarkdownContent: copied.MarkdownContent,
      BlockSpec: copied.BlockSpec,
      BigNumberValue: copied.BigNumberValue,
      BigNumberLabel: copied.BigNumberLabel,
      BigNumberDelta: copied.BigNumberDelta,
      QuoteAttribution: copied.QuoteAttribution,
      CalloutTone: copied.CalloutTone,
      ImageUrl: copied.ImageUrl,
      ImageAlt: copied.ImageAlt,
    });
    this.FocusedRegionID = regionId;
  }

  /**
   * Swaps `regionId` earlier (`-1`) or later (`+1`) within `slideId.Regions`.
   */
  public SwapSlideRegion(slideId: string, regionId: string, delta: -1 | 1): void {
    if (!this.IsEditable) {
      return;
    }
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    if (!slide) {
      return;
    }
    const idx = slide.Regions.findIndex((r) => r.RegionID === regionId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= slide.Regions.length) {
      return;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const sourceCheck = SlideDeckEngine.Instance.CanActorEditRegion(
      slide,
      slide.Regions[idx],
      userId,
      ownerId,
      this.IsEditable,
    );
    if (!sourceCheck.Allowed) {
      this.StatusBannerMessage = sourceCheck.Reason || 'This slide region is locked.';
      this.cdr.markForCheck();
      return;
    }
    const targetCheck = SlideDeckEngine.Instance.CanActorEditRegion(
      slide,
      slide.Regions[targetIdx],
      userId,
      ownerId,
      this.IsEditable,
    );
    if (!targetCheck.Allowed) {
      this.StatusBannerMessage = targetCheck.Reason || 'The target slide region is locked.';
      this.cdr.markForCheck();
      return;
    }
    const nextRegions = [...slide.Regions];
    const currentRegion = nextRegions[idx];
    nextRegions[idx] = nextRegions[targetIdx];
    nextRegions[targetIdx] = currentRegion;
    this.commitSlideRegionsOrder(slideId, nextRegions);
  }

  /**
   * Resets `regionId` on `slideId` to an empty `rich-text` region while preserving its slot metadata.
   */
  public ClearSlideRegion(slideId: string, regionId: string): void {
    if (!this.IsEditable) {
      return;
    }
    this.oleEditingRegionIds.delete(regionId);
    this.applySingleSlideRegionPatch(slideId, {
      RegionID: regionId,
      Kind: 'rich-text',
      MarkdownContent: '',
      BlockSpec: undefined,
      BigNumberValue: undefined,
      BigNumberLabel: undefined,
      BigNumberDelta: undefined,
      QuoteAttribution: undefined,
      CalloutTone: undefined,
      ImageUrl: undefined,
      ImageAlt: undefined,
    });
  }

  /**
   * Toggles the lock state of `regionId` on `slideId`.
   */
  public ToggleRegionLockById(slideId: string, regionId: string): void {
    this.SelectSlide(slideId);
    const slide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const region = slide?.Regions.find((r) => r.RegionID === regionId);
    if (region) {
      this.ToggleRegionLock(region);
    }
  }

  /**
   * Emits `OpenEntityRecord` for an embedded source artifact ID.
   */
  public OpenSourceArtifactById(artifactId: string): void {
    if (!artifactId) {
      return;
    }
    this.OpenEntityRecord.emit({
      entityName: 'MJ: Artifacts',
      compositeKey: CompositeKey.FromID(artifactId),
    });
  }

  /**
   * Copies the serialized JSON of the live block in `regionId`.
   */
  public CopyBlockJson(slideId: string, regionId: string): void {
    const slide = this.ActiveDeckForDisplay.Slides.find((s) => s.SlideID === slideId);
    const region = slide?.Regions.find((r) => r.RegionID === regionId);
    const block = region ? this.GetRegionBlockSpec(region) : null;
    if (!block) {
      return;
    }
    this.writeTextToClipboard(
      JSON.stringify(block, null, 2),
      `Copied Live Block JSON for "${block.Title || region?.Label || regionId}".`,
    );
  }

  /**
   * Resets the presenter view elapsed timer back to `00:00`.
   */
  public ResetPresenterTimer(): void {
    this.PresenterElapsedSeconds = 0;
    if (this.WorkspaceMode === 'presenter') {
      this.startPresenterTimer();
    }
    this.cdr.markForCheck();
  }

  private commitSlideRegionsOrder(slideId: string, nextRegions: SlideRegionSpec[]): void {
    let updatedSlide: SlideSpec | null = null;
    const nextSlides = this.Deck.Slides.map((s) => {
      if (s.SlideID !== slideId) {
        return s;
      }
      updatedSlide = { ...s, Regions: nextRegions };
      return updatedSlide;
    });
    if (!updatedSlide) {
      return;
    }
    this.Deck = {
      ...this.Deck,
      Slides: nextSlides,
      UpdatedAt: new Date().toISOString(),
    };
    this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  private cloneRegionSpec(region: SlideRegionSpec): SlideRegionSpec {
    let clonedBlock: DocumentBlockSpec | undefined;
    if (region.BlockSpec) {
      const parsed = SafeJSONParse<DocumentBlockSpec>(JSON.stringify(region.BlockSpec));
      const baseBlock: DocumentBlockSpec = parsed ?? { ...region.BlockSpec };
      clonedBlock = {
        ...baseBlock,
        BlockID: generateSlideBlockUuid(),
      };
    }
    const nextMarkdown =
      clonedBlock && (region.Kind === 'mj-block' || (region.MarkdownContent ?? '').includes(':::mj-block'))
        ? DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(clonedBlock)
        : region.MarkdownContent;
    return {
      ...region,
      MarkdownContent: nextMarkdown,
      BlockSpec: clonedBlock,
    };
  }

  private writeTextToClipboard(text: string, statusBanner: string): void {
    this.LastClipboardText = text;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text).catch(() => {
        // Ignore clipboard permission errors in headless/sandbox environments
      });
    }
    this.StatusBannerMessage = statusBanner;
    this.cdr.markForCheck();
  }

  private openContextMenuAt(
    zone: SlidesContextMenuZone,
    clientX: number,
    clientY: number,
    slide: SlideSpec,
    region?: SlideRegionSpec,
    restoreFocusEl: HTMLElement | null = null,
  ): void {
    const snapshot = this.buildContextMenuSnapshot(zone, slide, region);
    this.ContextMenuItems = BuildSlidesContextMenu(snapshot);
    this.ContextMenuAriaLabel = ComputeSlidesMenuAriaLabel(zone);
    this.ContextMenuX = clientX;
    this.ContextMenuY = clientY;
    this.ContextMenuRestoreFocusEl = restoreFocusEl;
    this.ContextMenuOpen = this.ContextMenuItems.length > 0;
    this.cdr.markForCheck();
  }

  private openContextMenuForTargetElement(
    rawTarget: EventTarget | null,
    overrideX?: number,
    overrideY?: number,
  ): void {
    const targetEl =
      rawTarget instanceof HTMLElement
        ? rawTarget
        : rawTarget instanceof Node && rawTarget.parentElement instanceof HTMLElement
          ? rawTarget.parentElement
          : null;
    if (!targetEl) {
      return;
    }

    const anchor =
      typeof overrideX === 'number' && typeof overrideY === 'number'
        ? { X: overrideX, Y: overrideY }
        : ComputeElementContextMenuAnchor(targetEl);

    const thumbCard = targetEl.closest<HTMLElement>('.mj-slides-thumbnail-card');
    if (thumbCard) {
      const testId = thumbCard.getAttribute('data-testid') ?? '';
      const slideId = testId.startsWith('filmstrip-slide-') ? testId.slice('filmstrip-slide-'.length) : '';
      const slide = this.Deck.Slides.find((s) => s.SlideID === slideId) ?? this.ActiveSlide;
      this.openContextMenuAt('filmstrip-slide', anchor.X, anchor.Y, slide, undefined, thumbCard);
      return;
    }

    const regionCard = targetEl.closest<HTMLElement>('.mj-slide-region-card');
    if (regionCard) {
      const testId = regionCard.getAttribute('data-testid') ?? '';
      const regionId = testId.startsWith('slide-region-') ? testId.slice('slide-region-'.length) : '';
      const slide = this.DisplayedSlide;
      const region = slide.Regions.find((r) => r.RegionID === regionId);
      const zone: SlidesContextMenuZone = this.IsPresentationActive
        ? 'presentation-stage'
        : this.IsEditable
          ? 'slide-region'
          : 'viewer-stage';
      this.openContextMenuAt(zone, anchor.X, anchor.Y, slide, region, regionCard);
      return;
    }

    const notesEl = targetEl.closest<HTMLElement>('.mj-slides-speaker-notes-bar, .mj-presenter-notes-card');
    if (notesEl) {
      this.openContextMenuAt('speaker-notes', anchor.X, anchor.Y, this.DisplayedSlide, undefined, notesEl);
      return;
    }

    const filmstripEl = targetEl.closest<HTMLElement>('.mj-slides-filmstrip');
    if (filmstripEl) {
      this.openContextMenuAt('filmstrip-empty', anchor.X, anchor.Y, this.ActiveSlide, undefined, filmstripEl);
      return;
    }

    const stageEl = targetEl.closest<HTMLElement>('.mj-slide-canvas-stage');
    const zone: SlidesContextMenuZone = this.IsPresentationActive
      ? 'presentation-stage'
      : this.IsEditable
        ? 'stage-background'
        : 'viewer-stage';
    this.openContextMenuAt(zone, anchor.X, anchor.Y, this.DisplayedSlide, undefined, stageEl ?? targetEl);
  }

  private buildContextMenuSnapshot(
    zone: SlidesContextMenuZone,
    slide: SlideSpec,
    region?: SlideRegionSpec,
  ): SlidesContextMenuSnapshot {
    const deck = this.ActiveDeckForDisplay;
    const slides = deck.Slides;
    const slideIdx = Math.max(
      0,
      slides.findIndex((s) => s.SlideID === slide.SlideID),
    );
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const slideEditCheck = SlideDeckEngine.Instance.CanActorEditSlide(
      slide,
      userId,
      ownerId,
      this.IsEditable,
    );
    const slideLockToggleCheck = !userId
      ? { Allowed: false, Reason: 'Sign in to lock or unlock slides' }
      : slide.Locked
        ? SlideDeckEngine.Instance.CanActorEditSlide(slide, userId, ownerId, false)
        : { Allowed: this.IsEditable, Reason: undefined };

    let regionIdx: number | undefined;
    let regionEditAllowed: boolean | undefined;
    let regionLockedReason: string | undefined;
    let regionLockToggleAllowed: boolean | undefined;
    let regionLockToggleDisabledReason: string | undefined;
    let canSwapEarlier: boolean | undefined;
    let swapEarlierDisabledReason: string | undefined;
    let canSwapLater: boolean | undefined;
    let swapLaterDisabledReason: string | undefined;
    let isOleBlock = false;
    let isOleEditing = false;
    let isSheetBacked = false;
    let blockMode: DocumentBlockSpec['Mode'] | undefined;
    let sourceArtifactId: string | undefined;
    let newerWorkbookVersionNumber: number | null = null;

    if (region) {
      regionIdx = slide.Regions.findIndex((r) => r.RegionID === region.RegionID);
      const regionCheck = SlideDeckEngine.Instance.CanActorEditRegion(
        slide,
        region,
        userId,
        ownerId,
        this.IsEditable,
      );
      regionEditAllowed = regionCheck.Allowed;
      regionLockedReason = regionCheck.Reason;

      const regionLockCheck = !userId
        ? { Allowed: false, Reason: 'Sign in to lock or unlock regions' }
        : region.Locked
          ? SlideDeckEngine.Instance.CanActorEditRegion(slide, region, userId, ownerId, false)
          : { Allowed: this.IsEditable, Reason: undefined };
      regionLockToggleAllowed = regionLockCheck.Allowed;
      regionLockToggleDisabledReason = regionLockCheck.Reason;

      if (regionIdx > 0) {
        const prevCheck = SlideDeckEngine.Instance.CanActorEditRegion(
          slide,
          slide.Regions[regionIdx - 1],
          userId,
          ownerId,
          this.IsEditable,
        );
        canSwapEarlier = regionCheck.Allowed && prevCheck.Allowed;
        swapEarlierDisabledReason = !regionCheck.Allowed ? regionCheck.Reason : prevCheck.Reason;
      }
      if (regionIdx >= 0 && regionIdx < slide.Regions.length - 1) {
        const nextCheck = SlideDeckEngine.Instance.CanActorEditRegion(
          slide,
          slide.Regions[regionIdx + 1],
          userId,
          ownerId,
          this.IsEditable,
        );
        canSwapLater = regionCheck.Allowed && nextCheck.Allowed;
        swapLaterDisabledReason = !regionCheck.Allowed ? regionCheck.Reason : nextCheck.Reason;
      }

      const block = this.GetRegionBlockSpec(region);
      if (block) {
        blockMode = block.Mode;
        sourceArtifactId = block.ArtifactID;
        isOleBlock = this.IsInlineOleArtifactBlock(block);
        isOleEditing = isOleBlock && this.IsOleRegionEditing(region.RegionID);
        isSheetBacked =
          block.Kind === 'Artifact' &&
          Boolean(block.SheetChartID || block.SheetRange || block.ArtifactType === 'Spreadsheet');
        if (isSheetBacked) {
          const newer = this.GetNewerSourceWorkbookVersion(block);
          newerWorkbookVersionNumber = newer ? newer.VersionNumber : null;
        }
      }
    }

    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

    return {
      Zone: zone,
      IsEditable: this.IsEditable,
      CanComment: this.CanComment,
      IsAiAssistantEnabled: this.IsAiAssistantEnabled,
      WorkspaceMode: this.WorkspaceMode,
      TotalSlides: slides.length,
      Slides: slides.map((s) => ({
        SlideID: s.SlideID,
        SlideNumber: s.SlideNumber,
        Title: s.Title,
        Hidden: Boolean(s.Hidden),
      })),
      Slide: slide,
      SlideIndex: slideIdx,
      CanEditSlide: slideEditCheck.Allowed,
      SlideLockedReason: slideEditCheck.Reason,
      CanToggleSlideLock: slideLockToggleCheck.Allowed,
      SlideLockToggleDisabledReason: slideLockToggleCheck.Reason,
      TargetRegion: region,
      RegionIndex: regionIdx,
      TotalRegions: slide.Regions.length,
      CanEditRegion: regionEditAllowed,
      RegionLockedReason: regionLockedReason,
      CanToggleRegionLock: regionLockToggleAllowed,
      RegionLockToggleDisabledReason: regionLockToggleDisabledReason,
      CanSwapEarlier: canSwapEarlier,
      SwapEarlierDisabledReason: swapEarlierDisabledReason,
      CanSwapLater: canSwapLater,
      SwapLaterDisabledReason: swapLaterDisabledReason,
      IsOleBlock: isOleBlock,
      IsOleEditing: isOleEditing,
      IsSheetBackedBlock: isSheetBacked,
      BlockMode: blockMode,
      SourceArtifactID: sourceArtifactId,
      NewerWorkbookVersionNumber: newerWorkbookVersionNumber,
      HasCopiedRegion: this.copiedSlideRegionSpec !== null,
      HasPreviousVisibleSlide: this.findPrevNavigableSlideIndex(slideIdx) >= 0,
      HasNextVisibleSlide: this.findNextNavigableSlideIndex(slideIdx) >= 0,
      ActiveThemeID: deck.Theme.ThemeID,
      LayoutCatalog: this.LayoutCatalog,
      ThemePresets: this.ThemePresets,
      IsMac: isMac,
    };
  }

  public OnSlideDragStart(slideId: string, event: DragEvent): void {
    if (!this.IsEditable) {
      event.preventDefault();
      return;
    }
    this.DraggingSlideID = slideId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', slideId);
    }
    this.cdr.markForCheck();
  }

  public OnSlideDragOver(targetSlideId: string, event: DragEvent): void {
    if (!this.IsEditable || !this.DraggingSlideID || this.DraggingSlideID === targetSlideId) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.DragOverSlideID !== targetSlideId) {
      this.DragOverSlideID = targetSlideId;
      this.cdr.markForCheck();
    }
  }

  public OnSlideDragLeave(targetSlideId: string): void {
    if (this.DragOverSlideID === targetSlideId) {
      this.DragOverSlideID = null;
      this.cdr.markForCheck();
    }
  }

  public OnSlideDrop(targetSlideId: string, event: DragEvent): void {
    event.preventDefault();
    const draggedId = this.DraggingSlideID || event.dataTransfer?.getData('text/plain') || null;
    this.DraggingSlideID = null;
    this.DragOverSlideID = null;
    if (!this.IsEditable || !draggedId || draggedId === targetSlideId) {
      this.cdr.markForCheck();
      return;
    }
    const slides = [...this.Deck.Slides];
    const fromIdx = slides.findIndex((s) => s.SlideID === draggedId);
    const toIdx = slides.findIndex((s) => s.SlideID === targetSlideId);
    if (fromIdx < 0 || toIdx < 0) {
      this.cdr.markForCheck();
      return;
    }
    const [moved] = slides.splice(fromIdx, 1);
    slides.splice(toIdx, 0, moved);
    const orderedSlideIds = slides.map((s) => s.SlideID);
    this.Deck = SlideDeckEngine.Instance.ReorderSlides(this.Deck, orderedSlideIds);
    this.SelectSlide(draggedId);
    this.session?.ReorderSlidesInDeck(orderedSlideIds, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  public OnSlideDragEnd(): void {
    this.DraggingSlideID = null;
    this.DragOverSlideID = null;
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Progressive Disclosure Toolbar (UserInfoEngine-persisted)
  // ---------------------------------------------------------------------------

  public get PinnedToolbarActions(): SlidesToolbarItemKey[] {
    if (this._localToolbarPins !== null) {
      return [...this._localToolbarPins];
    }
    const engine = UserInfoEngine.Instance;
    const raw = engine?.GetSetting(SLIDES_TOOLBAR_PINS_SETTING_KEY) ?? null;
    if (raw) {
      const parsed = SafeJSONParse<string[]>(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k): k is SlidesToolbarItemKey => typeof k === 'string');
        return valid.slice(0, this.MaxPinnedToolbarActions);
      }
    }
    return [...DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS];
  }

  private savePinnedToolbarActions(pins: SlidesToolbarItemKey[]): void {
    const trimmed = pins.slice(0, this.MaxPinnedToolbarActions);
    this._localToolbarPins = [...trimmed];
    const json = JSON.stringify(trimmed);
    const engine = UserInfoEngine.Instance;
    this._serverToolbarPinsRaw = engine?.GetSetting(SLIDES_TOOLBAR_PINS_SETTING_KEY) ?? null;
    engine?.SetSettingDebounced(SLIDES_TOOLBAR_PINS_SETTING_KEY, json);
  }

  public get HasCustomToolbarPreferences(): boolean {
    const pins = this.PinnedToolbarActions;
    return (
      pins.length !== DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS.length ||
      DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS.some((key, idx) => pins[idx] !== key)
    );
  }

  public IsToolbarItemPinned(key: SlidesToolbarItemKey): boolean {
    return this.PinnedToolbarActions.includes(key);
  }

  public IsToolbarItemShownOnBar(key: SlidesToolbarItemKey): boolean {
    return this.IsToolbarItemPinned(key);
  }

  public TogglePinToolbarAction(key: SlidesToolbarItemKey, event?: MouseEvent): void {
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
    this.savePinnedToolbarActions([...DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS]);
    this.cdr.markForCheck();
  }

  public get AllToolbarItems(): ResolvedSlidesToolbarItem[] {
    const canSlideEdit = this.WorkspaceMode === 'edit' && this.IsEditable;
    return [
      {
        Key: 'add-slide',
        Label: 'Add Slide',
        ShortLabel: 'Add Slide',
        Description: 'Insert a new slide after the active slide',
        Icon: 'fa-plus',
        Category: 'Slide Actions',
        Placement: 'left',
        TestId: 'add-slide-btn',
        Active: false,
        Visible: canSlideEdit,
      },
      {
        Key: 'duplicate-slide',
        Label: 'Duplicate Slide',
        Description: 'Duplicate Current Slide',
        Icon: 'fa-copy',
        Category: 'Slide Actions',
        Placement: 'left',
        TestId: 'duplicate-slide-btn',
        Active: false,
        Visible: canSlideEdit,
      },
      {
        Key: 'delete-slide',
        Label: 'Delete Slide',
        Description: 'Delete Current Slide',
        Icon: 'fa-trash-can',
        Category: 'Slide Actions',
        Placement: 'left',
        TestId: 'delete-slide-btn',
        Active: false,
        Disabled: this.Deck.Slides.length <= 1 || !this.CanEditSlideElements,
        Visible: canSlideEdit,
      },
      {
        Key: 'polish-slide',
        Label: 'Polish Slide',
        ShortLabel: 'Polish',
        Description: 'Auto-beautify typography, KPI layout & progressive reveal steps',
        Icon: 'fa-sparkles',
        Category: 'Design & AI',
        Placement: 'left',
        TestId: 'polish-slide-btn',
        Active: false,
        Disabled: !this.CanEditSlideElements,
        Visible: canSlideEdit,
      },
      {
        Key: 'theme',
        Label: `Theme (${this.Deck.Theme.Name})`,
        ShortLabel: `Theme (${this.Deck.Theme.Name})`,
        Description: 'Customize deck theme and brand colors',
        Icon: 'fa-palette',
        Category: 'Design & AI',
        Placement: 'left',
        TestId: 'toggle-theme-drawer-btn',
        Active: this.RightDrawerTab === 'theme',
        Visible: canSlideEdit,
      },
      {
        Key: 'md-to-deck',
        Label: 'Doc → Slides',
        ShortLabel: 'Doc → Slides',
        Description: 'Convert a Markdown Document into Slides',
        Icon: 'fa-wand-magic-sparkles',
        Category: 'Design & AI',
        Placement: 'left',
        TestId: 'open-markdown-to-deck-btn',
        Active: false,
        Visible: canSlideEdit,
      },
      {
        Key: 'present',
        Label: 'Present',
        ShortLabel: 'Present',
        Description: 'Full-screen Presentation Mode with frozen live blocks',
        Icon: 'fa-play',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'slides-mode-present',
        Active: this.WorkspaceMode === 'present',
        Visible: true,
      },
      {
        Key: 'presenter',
        Label: 'Presenter View',
        ShortLabel: 'Presenter',
        Description: 'Speaker notes, next-slide preview, and elapsed timer',
        Icon: 'fa-chalkboard-user',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'slides-mode-presenter',
        Active: this.WorkspaceMode === 'presenter',
        Visible: true,
      },
      {
        Key: 'source-mode',
        Label: 'Source JSON',
        ShortLabel: 'Source',
        Description: 'Inspect and edit raw SlideDeck JSON',
        Icon: 'fa-code',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'slides-mode-source',
        Active: this.WorkspaceMode === 'source',
        Visible: true,
      },
      {
        Key: 'diff-mode',
        Label: 'Version Diff',
        ShortLabel: 'Diff',
        Description: 'Compare deck versions',
        Icon: 'fa-code-compare',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'slides-mode-diff',
        Active: this.WorkspaceMode === 'diff',
        Visible: true,
      },
      {
        Key: 'export-pptx',
        Label: 'Export .pptx',
        ShortLabel: '.pptx',
        Description: 'Export PowerPoint (.pptx) with Live Data Snapshots',
        Icon: 'fa-file-powerpoint',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'export-pptx-btn',
        Active: false,
        Visible: true,
      },
      {
        Key: 'export-pdf',
        Label: 'Export .pdf',
        ShortLabel: '.pdf',
        Description: 'Export 16:9 Printable PDF (.pdf)',
        Icon: 'fa-file-pdf',
        Category: 'View & Export',
        Placement: 'right',
        TestId: 'export-pdf-btn',
        Active: false,
        Visible: true,
      },
      {
        Key: 'ask-ai',
        Label: 'Ask AI Assistant',
        ShortLabel: 'Ask AI',
        Description: 'Open slide-in AI Assistant for this slide',
        Icon: 'fa-wand-magic-sparkles',
        Category: 'Design & AI',
        Placement: 'right',
        TestId: 'slides-ask-ai-btn',
        Active: false,
        Visible: ARTIFACT_AI_ASSISTANT_ENABLED && this.IsEditable,
      },
      {
        Key: 'lock-slide',
        Label: 'Lock / Unlock Slide',
        ShortLabel: 'Lock',
        Description: 'Protect current slide against unauthorized edits',
        Icon: 'fa-lock',
        Category: 'Slide Actions',
        Placement: 'right',
        TestId: 'slides-lock-slide-btn',
        Active: Boolean(this.ActiveSlide?.Locked),
        Visible: this.IsEditable,
      },
    ];
  }

  public get PinnedLeftToolbarItems(): ResolvedSlidesToolbarItem[] {
    const pins = this.PinnedToolbarActions;
    const byKey = new Map(this.AllToolbarItems.map((item) => [item.Key, item]));
    return pins
      .map((k) => byKey.get(k))
      .filter((item): item is ResolvedSlidesToolbarItem => Boolean(item && item.Visible && item.Placement === 'left'));
  }

  public get PinnedRightToolbarItems(): ResolvedSlidesToolbarItem[] {
    const pins = this.PinnedToolbarActions;
    const byKey = new Map(this.AllToolbarItems.map((item) => [item.Key, item]));
    return pins
      .map((k) => byKey.get(k))
      .filter((item): item is ResolvedSlidesToolbarItem => Boolean(item && item.Visible && item.Placement === 'right'));
  }

  public get OverflowToolbarSections(): Array<{
    Category: ResolvedSlidesToolbarItem['Category'];
    Items: ResolvedSlidesToolbarItem[];
  }> {
    const categories: Array<ResolvedSlidesToolbarItem['Category']> = [
      'Slide Actions',
      'Design & AI',
      'View & Export',
    ];
    const items = this.AllToolbarItems.filter((item) => item.Visible);
    return categories
      .map((Category) => ({ Category, Items: items.filter((i) => i.Category === Category) }))
      .filter((s) => s.Items.length > 0);
  }

  public ExecuteToolbarItem(item: ResolvedSlidesToolbarItem, closeMenu: boolean): void {
    if (closeMenu) {
      this.CloseMoreToolsMenu();
    }
    switch (item.Key) {
      case 'add-slide':
        this.OnAddSlide();
        break;
      case 'duplicate-slide':
        this.OnDuplicateActiveSlide();
        break;
      case 'delete-slide':
        this.OnDeleteActiveSlide();
        break;
      case 'polish-slide':
        this.OnPolishActiveSlide();
        break;
      case 'theme':
        this.ToggleRightDrawer('theme');
        break;
      case 'md-to-deck':
        this.ShowMarkdownToDeckModal = true;
        this.cdr.markForCheck();
        break;
      case 'present':
        this.EnterPresentationMode('present');
        break;
      case 'presenter':
        this.EnterPresentationMode('presenter');
        break;
      case 'source-mode':
        this.SetWorkspaceMode(this.WorkspaceMode === 'source' ? 'edit' : 'source');
        break;
      case 'diff-mode':
        this.SetWorkspaceMode(this.WorkspaceMode === 'diff' ? 'edit' : 'diff');
        break;
      case 'export-pptx':
        this.OnExportPptx();
        break;
      case 'export-pdf':
        this.OnExportPdf();
        break;
      case 'ask-ai':
        this.OpenAskAiForPresentation();
        break;
      case 'lock-slide':
        this.ToggleCurrentSlideLock();
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

  public OnChangeActiveSlideLayout(newLayout: SlideLayoutKind): void {
    if (!this.IsEditable) {
      return;
    }
    const check = SlideDeckEngine.Instance.CanActorEditSlide(
      this.ActiveSlide,
      this.getSafeCurrentUser()?.ID ?? null,
      this.resolveArtifactOwnerUserId(this.getSafeCurrentUser()?.ID ?? null),
      this.IsEditable,
    );
    if (!check.Allowed) {
      this.StatusBannerMessage = check.Reason || 'This slide is locked.';
      this.cdr.markForCheck();
      return;
    }
    const { Deck: updatedDeck, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(
      this.Deck,
      this.ActiveSlide.SlideID,
      { Layout: newLayout },
      this.buildLockContext(),
    );
    if (!UpdatedSlide) {
      this.StatusBannerMessage = 'Cannot change slide layout while the slide or one of its regions is locked.';
      this.cdr.markForCheck();
      return;
    }
    this.Deck = updatedDeck;
    this.session?.UpdateSlideInDeck(UpdatedSlide, this.Deck);
    void this.executeAllLiveBlocksInDeck(this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  public OnFocusSlideElement(slideId: string, regionOrFieldId: string): void {
    this.editingSlideId = slideId;
    this.FocusedRegionID = regionOrFieldId;
    this.PendingAnchorKey = `${slideId}:${regionOrFieldId}`;
    this.PendingAnchorLabel = `Slide ${this.ActiveSlide.SlideNumber} · ${regionOrFieldId}`;
    this.session?.SetActiveBlock(this.PendingAnchorKey);
    const slide = this.Deck.Slides.find((s) => UUIDsEqual(s.SlideID, slideId)) ?? this.ActiveSlide;
    this.SelectionChanged.emit({
      domain: 'slides',
      slideId: slide?.SlideID ?? slideId,
      slideNumber: slide?.SlideNumber,
      elementId: regionOrFieldId,
    });
  }

  public OnInlineHeadingEnter(event: Event): void {
    event.preventDefault();
    (event.target as HTMLElement | null)?.blur();
  }

  public OnInlineSlideTitleBlur(event: FocusEvent, slideId?: string): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlideId = slideId ?? this.editingSlideId ?? this.ActiveSlide.SlideID;
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === targetSlideId);
    if (!targetSlide) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextTitle = (el?.innerText ?? '').trim();
    if (!nextTitle || nextTitle === targetSlide.Title) {
      return;
    }
    this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Title: nextTitle });
  }

  public OnInlineSlideSubtitleBlur(event: FocusEvent, slideId?: string): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlideId = slideId ?? this.editingSlideId ?? this.ActiveSlide.SlideID;
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === targetSlideId);
    if (!targetSlide) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextSubtitle = (el?.innerText ?? '').trim();
    if (nextSubtitle === (targetSlide.Subtitle ?? '')) {
      return;
    }
    this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Subtitle: nextSubtitle });
  }

  public OnSpeakerNotesChange(notes: string): void {
    if (!this.CanEditSlideElements) {
      return;
    }
    this.applySingleSlideMetadataPatch(this.ActiveSlide.SlideID, { SpeakerNotes: notes });
  }

  public OnInlineRegionContentBlur(
    region: SlideRegionSpec,
    event: FocusEvent,
    slideId?: string,
  ): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlideId = slideId ?? this.editingSlideId ?? this.ActiveSlide.SlideID;
    const el = event.target as HTMLElement | null;
    if (!el) {
      return;
    }
    const nextMarkdown = this.convertEditableRegionDomToMarkdown(el);
    if (nextMarkdown === region.MarkdownContent) {
      return;
    }
    this.applySingleSlideRegionPatch(targetSlideId, {
      RegionID: region.RegionID,
      MarkdownContent: nextMarkdown,
    });
  }

  public OnBigNumberFieldBlur(
    region: SlideRegionSpec,
    field: 'value' | 'label' | 'delta',
    event: FocusEvent,
    slideId?: string,
  ): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlideId = slideId ?? this.editingSlideId ?? this.ActiveSlide.SlideID;
    const text = ((event.target as HTMLElement | null)?.innerText ?? '').trim();
    const patch: Partial<SlideRegionSpec> & { RegionID: string } = { RegionID: region.RegionID };
    if (field === 'value') {
      patch.BigNumberValue = text;
    } else if (field === 'label') {
      patch.BigNumberLabel = text;
    } else {
      patch.BigNumberDelta = text;
    }
    this.applySingleSlideRegionPatch(targetSlideId, patch);
  }

  public OnQuoteAttributionBlur(
    region: SlideRegionSpec,
    event: FocusEvent,
    slideId?: string,
  ): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlideId = slideId ?? this.editingSlideId ?? this.ActiveSlide.SlideID;
    const raw = ((event.target as HTMLElement | null)?.innerText ?? '').replace(/^—\s*/, '').trim();
    this.applySingleSlideRegionPatch(targetSlideId, {
      RegionID: region.RegionID,
      QuoteAttribution: raw,
    });
  }

  public OnChangeRegionKind(region: SlideRegionSpec, nextKind: SlideRegionKind): void {
    if (!this.CanEditRegion(region)) {
      return;
    }
    if (nextKind === 'mj-block' && !region.BlockSpec) {
      this.EmbedLiveEntityViewInRegion(region);
      return;
    }
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      Kind: nextKind,
      BigNumberValue: nextKind === 'big-number' ? region.BigNumberValue : region.BigNumberValue,
      BigNumberLabel: nextKind === 'big-number' ? region.BigNumberLabel : region.BigNumberLabel,
      BigNumberDelta: nextKind === 'big-number' ? region.BigNumberDelta : region.BigNumberDelta,
    });
  }

  /**
   * Embeds a viewer-scoped Live MJ `EntityView` block into `region`.
   */
  public EmbedLiveEntityViewInRegion(region: SlideRegionSpec): void {
    if (!this.CanEditRegion(region)) {
      return;
    }
    const blockSpec: DocumentBlockSpec = {
      BlockID: `slide-blk-${this.ActiveSlide.SlideID}-${region.RegionID}`,
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Live Enterprise Artifacts',
      EntityName: 'MJ: Artifacts',
      ExtraFilter: 'IsActive = 1',
      DisplayMode: 'table',
    };
    const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec);
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      Kind: 'mj-block',
      BlockSpec: blockSpec,
      MarkdownContent: directive,
    });
    void this.ExecuteSlideRegionBlock(region, blockSpec);
  }

  /**
   * Embeds an interactive MS OLE `Whiteboard` `Artifact` block into `region` (`§ 3.4.1`, `§ 5.1`),
   * creating and persisting a real delegated child `MJArtifactEntity` + `MJArtifactVersionEntity`
   * BEFORE inserting the region descriptor (`O4`, `A6`).
   */
  public async EmbedInlineWhiteboardInRegion(region: SlideRegionSpec): Promise<void> {
    if (!this.CanEditRegion(region)) {
      return;
    }
    const targetSlideId = this.ActiveSlide.SlideID;
    const targetSlideTitle = this.ActiveSlide.Title;
    const created = await this.createDelegatedWhiteboardArtifact(
      `${targetSlideTitle} · Architecture Whiteboard`,
    );
    if (!created || this.isComponentDestroyed) {
      return;
    }
    const blockSpec: DocumentBlockSpec = {
      BlockID: `slide-wb-${targetSlideId}-${region.RegionID}`,
      Kind: 'Artifact',
      Mode: 'Live',
      Title: 'Interactive Architecture Whiteboard',
      ArtifactID: created.artifact.ID,
      VersionID: created.version.ID,
      ArtifactType: 'Whiteboard',
      EmbedMode: 'Inline',
    };
    const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec);
    this.oleEditingRegionIds.add(region.RegionID);
    this.applySingleSlideRegionPatch(targetSlideId, {
      RegionID: region.RegionID,
      Kind: 'mj-block',
      BlockSpec: blockSpec,
      MarkdownContent: directive,
    });
    this.cdr.markForCheck();
  }

  public IsOleRegionEditing(regionId: string): boolean {
    return this.oleEditingRegionIds.has(regionId);
  }

  public ToggleOleRegionEditing(regionId: string): void {
    if (this.oleEditingRegionIds.has(regionId)) {
      this.oleEditingRegionIds.delete(regionId);
    } else {
      this.oleEditingRegionIds.add(regionId);
    }
    this.cdr.markForCheck();
  }

  public GetRegionBlockSpec(region: SlideRegionSpec): DocumentBlockSpec | null {
    return SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
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
    const artifactId = block.ArtifactID?.trim();
    if (!artifactId) {
      return false;
    }
    return this.inFlightEmbeddedVersionKeys.has(
      this.getEmbeddedVersionCacheKey(artifactId, block.VersionID),
    );
  }

  public GetEmbeddedArtifactError(block: DocumentBlockSpec): string | undefined {
    const artifactId = block.ArtifactID?.trim();
    if (!artifactId) {
      return 'Embedded artifact ID is missing.';
    }
    return this.failedEmbeddedVersionMessages.get(
      this.getEmbeddedVersionCacheKey(artifactId, block.VersionID),
    );
  }

  public GetOrCreateEmbeddedArtifactVersion(
    _region: SlideRegionSpec,
    block: DocumentBlockSpec,
  ): MJArtifactVersionEntity | null {
    const artifactId = block.ArtifactID?.trim();
    if (!artifactId) {
      return null;
    }
    const key = this.getEmbeddedVersionCacheKey(artifactId, block.VersionID);
    const guardMsg = this.validateEmbeddedArtifactDepthAndCycle(artifactId);
    if (guardMsg) {
      if (!this.failedEmbeddedVersionMessages.has(key)) {
        this.failedEmbeddedVersionMessages.set(key, guardMsg);
      }
      return null;
    }
    const cached = this.embeddedArtifactVersions.get(key);
    if (cached) {
      return cached;
    }
    if (!this.inFlightEmbeddedVersionKeys.has(key) && !this.failedEmbeddedVersionMessages.has(key)) {
      void this.loadEmbeddedArtifactVersion(artifactId, block.VersionID);
    }
    return null;
  }

  private validateEmbeddedArtifactDepthAndCycle(targetArtifactId: string): string | null {
    const normalizedTarget = targetArtifactId.trim().toLowerCase();
    const selfId = this.artifactVersion?.ArtifactID?.trim().toLowerCase() ?? '';
    const ancestors = this.EffectiveAncestorArtifactIds;
    if ((selfId && normalizedTarget === selfId) || ancestors.has(normalizedTarget)) {
      return 'Circular artifact embedding prevented: cannot embed an artifact inside itself or an ancestor.';
    }
    const currentDepth = ancestors.size + (selfId ? 1 : 0);
    if (currentDepth >= MJ_MAX_EMBED_DEPTH) {
      return `Maximum nested artifact embed depth (${MJ_MAX_EMBED_DEPTH}) reached.`;
    }
    return null;
  }

  public get SheetEmbedWorksheetCharts(): Array<{ ChartID: string; Title?: string; ChartType: string }> {
    const ws =
      this.SheetEmbedWorkbookSheets.find(
        (s) => s.SheetID === this.SheetEmbedWorksheetName || s.Name === this.SheetEmbedWorksheetName,
      ) ?? this.SheetEmbedWorkbookSheets[0];
    return (ws?.Charts ?? []).map((c) => ({
      ChartID: c.ChartID,
      Title: c.Title,
      ChartType: c.ChartType,
    }));
  }

  public async OpenSheetEmbedModal(region: SlideRegionSpec): Promise<void> {
    if (!this.CanEditRegion(region)) return;
    this.targetSheetEmbedRegionID = region.RegionID;
    this.ShowSheetEmbedModal = true;
    this.SheetEmbedMode = 'chart';
    this.SheetEmbedWorksheetName = '';
    this.SheetEmbedChartID = '';
    this.SheetEmbedRange = 'A1:D8';
    this.SheetEmbedPinVersion = false;
    this.SheetEmbedWorkbookSheets = [];
    this.SheetEmbedLatestVersionID = '';
    this.SheetEmbedLatestVersionNumber = 0;

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (provider && user) {
      try {
        const rv = RunView.FromMetadataProvider(provider);
        const res = await rv.RunView<{ ID: string; Name: string; Type: string }>(
          {
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `Type LIKE '%Spreadsheet%'`,
            OrderBy: '__mj_UpdatedAt DESC',
            Fields: ['ID', 'Name', 'Type'],
            MaxRows: 30,
            ResultType: 'simple',
          },
          user,
        );
        if (res.Success && res.Results) {
          this.AvailableSpreadsheetArtifacts = res.Results.map((r) => ({ ID: r.ID, Name: r.Name }));
          if (this.AvailableSpreadsheetArtifacts.length > 0 && !this.SheetEmbedArtifactID) {
            this.SheetEmbedArtifactID = this.AvailableSpreadsheetArtifacts[0].ID;
            await this.OnSheetEmbedArtifactSelected(this.SheetEmbedArtifactID);
          }
        }
      } catch (err) {
        LogError(err);
      }
    }
    this.cdr.markForCheck();
  }

  public async OnSheetEmbedArtifactSelected(artifactId: string): Promise<void> {
    this.SheetEmbedArtifactID = artifactId;
    this.SheetEmbedWorkbookSheets = [];
    this.SheetEmbedWorksheetName = '';
    this.SheetEmbedChartID = '';
    this.SheetEmbedLatestVersionID = '';
    this.SheetEmbedLatestVersionNumber = 0;

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user || !artifactId) {
      this.cdr.markForCheck();
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
      if (latest) {
        this.latestWorkbookVersions.set(artifactId.trim().toLowerCase(), latest);
        this.cacheEmbeddedVersionEntity(artifactId, latest);
        this.SheetEmbedLatestVersionID = latest.ID;
        this.SheetEmbedLatestVersionNumber = latest.VersionNumber ?? 1;
        const wb = SpreadsheetEngine.Instance.ParseWorkbook(latest.Content || '{}');
        this.SheetEmbedWorkbookSheets = wb.Worksheets ?? [];
        if (this.SheetEmbedWorkbookSheets.length > 0) {
          this.SheetEmbedWorksheetName = this.SheetEmbedWorkbookSheets[0].SheetID;
          if (this.SheetEmbedWorksheetCharts.length > 0) {
            this.SheetEmbedChartID = this.SheetEmbedWorksheetCharts[0].ChartID;
          }
        }
      }
    } catch (err) {
      LogError(err);
    }
    this.cdr.markForCheck();
  }

  public OnSheetEmbedWorksheetChanged(sheetName: string): void {
    this.SheetEmbedWorksheetName = sheetName;
    if (this.SheetEmbedMode === 'chart' && this.SheetEmbedWorksheetCharts.length > 0) {
      this.SheetEmbedChartID = this.SheetEmbedWorksheetCharts[0].ChartID;
    }
    this.cdr.markForCheck();
  }

  public ConfirmSheetEmbedModal(): void {
    if (!this.IsEditable || !this.targetSheetEmbedRegionID || !this.SheetEmbedArtifactID) {
      return;
    }
    const region = this.ActiveSlide.Regions.find((r) => r.RegionID === this.targetSheetEmbedRegionID);
    if (!region || !this.CanEditRegion(region)) {
      this.ShowSheetEmbedModal = false;
      this.StatusBannerMessage = region ? 'This slide region is locked.' : '';
      this.cdr.markForCheck();
      return;
    }
    const blockId = `sheet-block-${Date.now().toString(36)}`;
    const selectedArt = this.AvailableSpreadsheetArtifacts.find((a) => UUIDsEqual(a.ID, this.SheetEmbedArtifactID));
    const blockSpec: DocumentBlockSpec = {
      BlockID: blockId,
      Kind: 'Artifact',
      Title:
        this.SheetEmbedMode === 'chart'
          ? `${selectedArt?.Name || 'Spreadsheet'} — Chart`
          : `${selectedArt?.Name || 'Spreadsheet'} (${this.SheetEmbedRange})`,
      Mode: 'Live',
      ArtifactID: this.SheetEmbedArtifactID,
      ArtifactType: 'Spreadsheet',
      SheetID: this.SheetEmbedWorksheetName || undefined,
      SheetChartID: this.SheetEmbedMode === 'chart' ? this.SheetEmbedChartID || undefined : undefined,
      SheetRange: this.SheetEmbedMode === 'range' ? this.SheetEmbedRange || undefined : undefined,
      VersionID: this.SheetEmbedPinVersion && this.SheetEmbedLatestVersionID ? this.SheetEmbedLatestVersionID : undefined,
    };

    const { Deck: updatedDeck, UpdatedRegion } = SlideDeckEngine.Instance.UpsertSlideRegion(
      this.Deck,
      this.ActiveSlide.SlideID,
      { RegionID: region.RegionID, Kind: 'mj-block', BlockSpec: blockSpec },
      this.buildLockContext(),
    );
    const updatedSlide = updatedDeck.Slides.find((s) => s.SlideID === this.ActiveSlide.SlideID);
    if (UpdatedRegion && updatedSlide) {
      this.Deck = updatedDeck;
      this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
      this.syncRawDeckJson();
      void this.ExecuteSlideRegionBlock(UpdatedRegion, blockSpec);
    }
    this.ShowSheetEmbedModal = false;
    this.targetSheetEmbedRegionID = null;
    this.cdr.markForCheck();
  }

  public GetEmbeddedVersionNumber(block: DocumentBlockSpec): number {
    const artifactId = block.ArtifactID?.trim();
    if (!artifactId) return 1;
    const key = this.getEmbeddedVersionCacheKey(artifactId, block.VersionID);
    return this.embeddedArtifactVersions.get(key)?.VersionNumber ?? 1;
  }

  public GetNewerSourceWorkbookVersion(block: DocumentBlockSpec): MJArtifactVersionEntity | null {
    if (block.Kind !== 'Artifact' || !block.ArtifactID || !block.VersionID) {
      return null;
    }
    const artifactId = block.ArtifactID.trim().toLowerCase();
    const latest = this.latestWorkbookVersions.get(artifactId);
    if (!latest || UUIDsEqual(latest.ID, block.VersionID)) {
      return null;
    }
    const currentNum = this.GetEmbeddedVersionNumber(block);
    if ((latest.VersionNumber ?? 0) <= currentNum) {
      return null;
    }
    return latest;
  }

  public UpdateRegionBlockToLatestWorkbookVersion(region: SlideRegionSpec, block: DocumentBlockSpec): void {
    if (!this.CanEditRegion(region)) return;
    const newer = this.GetNewerSourceWorkbookVersion(block);
    if (!newer) return;
    const nextBlock: DocumentBlockSpec = {
      ...block,
      VersionID: newer.ID,
    };
    const { Deck: updatedDeck, UpdatedRegion } = SlideDeckEngine.Instance.UpsertSlideRegion(
      this.Deck,
      this.ActiveSlide.SlideID,
      { RegionID: region.RegionID, Kind: 'mj-block', BlockSpec: nextBlock },
      this.buildLockContext(),
    );
    const updatedSlide = updatedDeck.Slides.find((s) => s.SlideID === this.ActiveSlide.SlideID);
    if (UpdatedRegion && updatedSlide) {
      this.Deck = updatedDeck;
      this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
      this.syncRawDeckJson();
      void this.ExecuteSlideRegionBlock(UpdatedRegion, nextBlock);
      this.StatusBannerMessage = `Updated ${block.Title || 'embedded workbook'} to v${newer.VersionNumber}.`;
    }
    this.cdr.markForCheck();
  }

  private async loadEmbeddedArtifactVersion(artifactId: string, versionId?: string | null): Promise<void> {
    const key = this.getEmbeddedVersionCacheKey(artifactId, versionId);
    if (this.inFlightEmbeddedVersionKeys.has(key)) {
      return;
    }

    const guardMsg = this.validateEmbeddedArtifactDepthAndCycle(artifactId);
    if (guardMsg) {
      this.failedEmbeddedVersionMessages.set(key, guardMsg);
      this.cdr.markForCheck();
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

    if (this.isGuestSnapshotMode) {
      return;
    }

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.failedEmbeddedVersionMessages.set(key, 'Embedded artifact unavailable or access denied.');
      this.cdr.markForCheck();
      return;
    }

    const normalizedArtifactId = artifactId.trim().toLowerCase();
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
          this.latestWorkbookVersions.set(normalizedArtifactId, entity);
        } else if (versionId && !this.latestWorkbookVersions.has(normalizedArtifactId)) {
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
            this.latestWorkbookVersions.set(normalizedArtifactId, latestEntity);
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

  public async OnEmbeddedArtifactContentCommitted(
    region: SlideRegionSpec,
    block: DocumentBlockSpec,
    committedContent: string,
  ): Promise<void> {
    if (!this.CanEditRegion(region)) {
      return;
    }
    const childArtifactId = block.ArtifactID?.trim();
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!childArtifactId || !provider || !user) {
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
      const nextVerNum = currentMax + 1;

      const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = childArtifactId;
      ver.VersionNumber = nextVerNum;
      ver.Name = block.Title || 'Embedded Slide Whiteboard';
      ver.UserID = user.ID;
      ver.Content = committedContent;

      const saved = await ver.Save();
      if (!saved || !ver.ID) {
        const msg = ver.LatestResult?.Message || 'Failed to save embedded artifact version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }

      this.cacheEmbeddedVersionEntity(childArtifactId, ver);

      if (block.VersionID) {
        const updatedBlock: DocumentBlockSpec = {
          ...block,
          VersionID: ver.ID,
        };
        this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
          RegionID: region.RegionID,
          Kind: 'mj-block',
          BlockSpec: updatedBlock,
          MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(updatedBlock),
        });
      } else {
        this.cdr.markForCheck();
      }
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save embedded artifact version.');
    }
  }

  public async ExecuteSlideRegionBlock(
    _region: SlideRegionSpec,
    block: DocumentBlockSpec,
    slideId?: string,
  ): Promise<void> {
    if (this.IsInlineOleArtifactBlock(block)) {
      return;
    }
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
      const provider = this.getSafeProvider();
      const verified =
        !this.isGuestSnapshotMode && provider && this.collabService.HasCollaborationBackend(provider)
          ? await this.collabService.VerifyFrozenSnapshotOnServer(
              block,
              this.artifactVersion?.ArtifactID ?? '',
              provider,
            )
          : this.IsSnapshotVerified(block, _region.RegionID, slideId);
      if (this.isComponentDestroyed) {
        return;
      }
      this.blockResultsByBlockId.set(block.BlockID, {
        Success: true,
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: 'Frozen',
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
      });
      this.cdr.markForCheck();
      return;
    }

    if (this.isGuestSnapshotMode) {
      return;
    }

    const provider = this.getSafeProvider();
    const currentUser = this.getSafeCurrentUser();

    if (!provider || !currentUser) {
      this.blockResultsByBlockId.set(block.BlockID, {
        Success: false,
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: block.Mode,
        ErrorMessage: 'Metadata provider or user context unavailable.',
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
      });
      this.cdr.markForCheck();
      return;
    }

    try {
      const execResult = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
        block,
        currentUser,
        provider,
      );
      this.blockResultsByBlockId.set(block.BlockID, execResult);
    } catch (err) {
      LogError(err);
      this.blockResultsByBlockId.set(block.BlockID, {
        Success: false,
        BlockID: block.BlockID,
        Kind: block.Kind,
        Mode: block.Mode,
        ErrorMessage: err instanceof Error ? err.message : 'Failed to execute live block.',
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
      });
    }
    this.cdr.markForCheck();
  }

  public GetBlockExecutionError(block: DocumentBlockSpec): DocumentBlockExecutionResult | null {
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
      return null;
    }
    const live = this.blockResultsByBlockId.get(block.BlockID);
    if (live && !live.Success) {
      return live;
    }
    return null;
  }

  public GetDisplayRowsForBlock(block: DocumentBlockSpec): {
    Columns: DocumentBlockColumn[];
    Rows: DocumentBlockExecutionResult['Rows'];
  } {
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
      return {
        Columns: block.FrozenSnapshot.Columns,
        Rows: block.FrozenSnapshot.Rows,
      };
    }
    const live = this.blockResultsByBlockId.get(block.BlockID);
    if (live && live.Success) {
      return {
        Columns: live.Columns,
        Rows: live.Rows,
      };
    }
    return { Columns: [], Rows: [] };
  }

  public FormatCellValue(value: DocumentBlockExecutionResult['Rows'][number][string]): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  public PromptFreezeSlideRegionBlock(region: SlideRegionSpec, block: DocumentBlockSpec): void {
    if (!this.CanEditRegion(region)) {
      this.StatusBannerMessage = 'Cannot freeze block: slide or region is locked.';
      this.cdr.markForCheck();
      return;
    }
    this.PendingFreezeRegion = region;
    this.PendingFreezeBlock = block;
    this.cdr.markForCheck();
  }

  public CancelFreezeSlideBlock(): void {
    this.PendingFreezeRegion = null;
    this.PendingFreezeBlock = null;
    this.cdr.markForCheck();
  }

  public GetBlockPreVerifiedSnapshot(
    block: DocumentBlockSpec | null | undefined,
    regionId?: string,
    slideId?: string,
  ): PreVerifiedFrozenSnapshotEntry | null {
    if (!block) {
      return null;
    }
    const compoundKey = slideId && regionId ? `${slideId}:${regionId}` : undefined;
    return ResolvePreVerifiedFrozenSnapshotState(this.PreVerifiedFrozenSnapshots, [
      block.BlockID,
      regionId,
      compoundKey,
      slideId,
    ]);
  }

  public IsSnapshotVerified(
    block: DocumentBlockSpec | null | undefined,
    regionId?: string,
    slideId?: string,
  ): boolean {
    if (!block) {
      return false;
    }
    const compoundKey = slideId && regionId ? `${slideId}:${regionId}` : undefined;
    const preVerified = ResolvePreVerifiedFrozenSnapshotState(this.PreVerifiedFrozenSnapshots, [
      block.BlockID,
      regionId,
      compoundKey,
      slideId,
    ]);
    if (preVerified !== null) {
      return preVerified.Verified;
    }
    return this.collabService.IsFrozenSnapshotVerified(
      block,
      this.blockResultsByBlockId.get(block.BlockID),
      this.artifactVersion?.ArtifactID,
    );
  }

  public ConfirmFreezeSlideBlock(): void {
    if (!this.PendingFreezeRegion || !this.PendingFreezeBlock) {
      return;
    }
    const region = this.PendingFreezeRegion;
    const block = this.PendingFreezeBlock;
    this.PendingFreezeRegion = null;
    this.PendingFreezeBlock = null;
    void this.FreezeLiveBlock(region, block);
  }

  public async FreezeLiveBlock(region: SlideRegionSpec, block: DocumentBlockSpec): Promise<void> {
    if (!this.CanEditRegion(region)) {
      this.notifyError('Cannot freeze block: slide or region is locked.');
      return;
    }
    const targetSlideId = this.ActiveSlide.SlideID;
    const provider = this.getSafeProvider();
    if (!provider) {
      this.notifyError('Cannot freeze block: metadata provider unavailable.');
      return;
    }
    try {
      const serverRes = await this.collabService.FreezeLiveBlockOnServer(
        block,
        true,
        this.artifactVersion?.ArtifactID,
        provider,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      if (!serverRes.Success || !serverRes.UpdatedSpec) {
        this.notifyError(serverRes.ErrorMessage || 'Failed to freeze live block on server.');
        return;
      }
      this.applySingleSlideRegionPatch(targetSlideId, {
        RegionID: region.RegionID,
        Kind: 'mj-block',
        BlockSpec: serverRes.UpdatedSpec,
        MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(
          serverRes.UpdatedSpec,
        ),
      });
      this.refreshDriftSummariesForActiveSlide();
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to freeze live block on server.');
    }
  }

  public UnfreezeSlideRegionBlock(region: SlideRegionSpec, block: DocumentBlockSpec): void {
    if (!this.CanEditRegion(region)) {
      this.StatusBannerMessage = 'Cannot switch block to Live: slide or region is locked.';
      this.cdr.markForCheck();
      return;
    }
    const liveBlock: DocumentBlockSpec = {
      ...block,
      Mode: 'Live',
      FrozenSnapshot: undefined,
    };
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      Kind: 'mj-block',
      BlockSpec: liveBlock,
      MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(liveBlock),
    });
    this.refreshDriftSummariesForActiveSlide();
    void this.ExecuteSlideRegionBlock(region, liveBlock);
  }

  /**
   * Applies a named theme preset (`Accept #4`).
   */
  public OnSelectThemePreset(themeId: string): void {
    if (!this.IsEditable) {
      return;
    }
    this.Deck = SlideDeckEngine.Instance.ApplyTheme(this.Deck, themeId);
    this.session?.UpdateDeckMeta(this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Derives a contrast-safe theme from Organization Brand Color Seeds (`Accept #4`) and applies it
   * across the entire deck.
   */
  public OnApplyOrganizationBrandSeeds(): void {
    if (!this.IsEditable) {
      return;
    }
    this.Deck = SlideDeckEngine.Instance.ApplyTheme(this.Deck, {
      OrganizationName: this.BrandSeedOrgName,
      PrimaryColor: this.BrandSeedPrimaryColor,
      AccentColor: this.BrandSeedAccentColor,
      BackgroundColor: this.BrandSeedBackgroundColor,
    });
    if (this.BrandSeedOrgName.trim()) {
      this.Deck = {
        ...this.Deck,
        Master: {
          ...this.Deck.Master,
          OrganizationName: this.BrandSeedOrgName.trim(),
        },
      };
    }
    this.session?.UpdateDeckMeta(this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Converts the Markdown Document in `MarkdownConversionDraft` into a structured `SlideDeckSpec` (`§ 5.2`).
   */
  public ConvertDraftMarkdownToDeck(): void {
    if (!this.IsEditable) {
      return;
    }
    const lockViolation = this.findDeckLockViolation(this.Deck, null);
    if (lockViolation) {
      this.StatusBannerMessage = lockViolation;
      this.cdr.markForCheck();
      return;
    }
    const converted = SlideDeckEngine.Instance.ConvertMarkdownToSlideDeck(
      this.MarkdownConversionDraft,
      undefined,
      this.Deck.Theme,
      this.Deck.DeckID,
    );
    this.Deck = converted;
    this.ActiveSlideID = converted.Slides[0]?.SlideID ?? 'slide-1';
    this.ShowMarkdownToDeckModal = false;
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    this.session?.SetContent(serialized);
    this.syncRawDeckJson();
    void this.executeAllLiveBlocksInDeck(this.Deck);
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
  }

  /**
   * Exports the presentation as an OpenXML `.pptx` file, freezing live MJ blocks (`Accept #2`)
   * and emitting editable `<p:sp>` text shapes, `<a:tbl>` tables, and speaker notes (`Accept #5`).
   */
  public OnExportPptx(): PptxExportPackage {
    const deckToExport = this.PresentationFrozenDeck ?? this.Deck;
    const verifiedBlockIds = new Set<string>();
    for (const slide of deckToExport.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (!block) {
          continue;
        }
        const origSlide = this.Deck.Slides.find((s) => s.SlideID === slide.SlideID);
        const origRegion = origSlide?.Regions.find((r) => r.RegionID === region.RegionID);
        const origBlock = origRegion ? SlideDeckEngine.Instance.ExtractRegionBlockSpec(origRegion) : null;
        const blockResult = this.blockResultsByBlockId.get(block.BlockID);
        const isFreshlyFrozenLiveResult =
          origBlock?.Mode !== 'Frozen' &&
          blockResult?.Success === true &&
          blockResult.Mode === 'Live' &&
          blockResult.FrozenSnapshot?.SnapshotVerified !== false &&
          blockResult.FrozenMetadata?.SnapshotVerified !== false;
        const isVerified =
          isFreshlyFrozenLiveResult ||
          blockResult?.FrozenSnapshot?.SnapshotVerified === true ||
          blockResult?.FrozenMetadata?.SnapshotVerified === true ||
          this.IsSnapshotVerified(block, region.RegionID, slide.SlideID);
        if (isVerified) {
          verifiedBlockIds.add(block.BlockID);
          if (region.RegionID) {
            verifiedBlockIds.add(region.RegionID);
            if (slide.SlideID) {
              verifiedBlockIds.add(`${slide.SlideID}:${region.RegionID}`);
            }
          }
        }
      }
    }
    const fileName = `${(deckToExport.Title || 'presentation').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pptx`;
    const pkg = this.exportService.DownloadPptxFile(
      deckToExport,
      this.blockResultsByBlockId,
      fileName,
      this.getCurrentUserSummary(),
      { VerifiedBlockIds: verifiedBlockIds },
    );
    this.LastExportedPptxPackage = pkg;
    this.LastExportedPptxSummary = {
      SlideCount: pkg.SlideCount,
      FrozenBlockCount: pkg.FrozenBlockCount,
      ByteLength: pkg.Bytes.byteLength,
    };
    this.cdr.markForCheck();
    return pkg;
  }

  public OnExportPdf(): string {
    const deckToExport = this.PresentationFrozenDeck ?? this.Deck;
    return this.exportService.ExportPrintablePdf(
      deckToExport,
      this.blockResultsByBlockId,
      true,
      this.getCurrentUserSummary(),
    );
  }

  protected override resolveCaptureRootElement(): HTMLElement | null {
    const el = this.captureHostElementRef?.nativeElement;
    if (!el) return null;
    return (
      el.querySelector<HTMLElement>('.mj-slide-canvas-stage') ??
      el.querySelector<HTMLElement>('.mj-slides-center-stage') ??
      el
    );
  }

  public async OnSaveVersionCheckpoint(): Promise<void> {
    if (!this.IsEditable || this.IsSavingVersion) {
      return;
    }
    this.flushPendingEdits();
    if (!this.HasUnsavedChanges) {
      return;
    }
    this.IsSavingVersion = true;
    this.cdr.markForCheck();
    try {
      const { Policy, CapturedThumbnailDataUrl } = await CaptureThumbnailForDriverIfAllowed(
        'SlideDeckArtifactViewerPlugin',
        this.resolveCaptureRootElement(),
        null,
        this.Provider,
      );
      const sentOverWs = this.session?.RequestSaveVersion(CapturedThumbnailDataUrl) ?? false;
      if (sentOverWs) {
        if (this.pendingVersionSaveTimer) {
          clearTimeout(this.pendingVersionSaveTimer);
        }
        this.pendingVersionSaveTimer = setTimeout(() => {
          this.pendingVersionSaveTimer = null;
          if (this.IsSavingVersion) {
            this.IsSavingVersion = false;
            this.StatusBannerMessage = 'Save checkpoint timed out waiting for server acknowledgment.';
            this.cdr.markForCheck();
          }
        }, 15000);
        return;
      }
      await this.saveArtifactVersionViaProvider(CapturedThumbnailDataUrl, Policy);
      this.IsSavingVersion = false;
      this.cdr.markForCheck();
    } catch (err) {
      this.IsSavingVersion = false;
      this.notifyError(err instanceof Error ? err.message : 'Failed to save presentation version.');
    }
  }

  public OnRawDeckJsonTextChange(nextText: string): void {
    this.RawDeckJsonText = nextText;
    this.isRawJsonDirty = true;
    this.RawJsonErrorMessage = '';
    this.cdr.markForCheck();
  }

  public KeepLocalRawJsonEdits(): void {
    this.RawJsonRemoteConflictPending = false;
    this.pendingRemoteDeckJson = null;
    this.cdr.markForCheck();
  }

  public ReloadRemoteDeckIntoRawJson(): void {
    if (this.pendingRemoteDeckJson !== null) {
      this.RawDeckJsonText = this.pendingRemoteDeckJson;
    } else {
      this.RawDeckJsonText = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    }
    this.isRawJsonDirty = false;
    this.RawJsonRemoteConflictPending = false;
    this.RawJsonErrorMessage = '';
    this.pendingRemoteDeckJson = null;
    this.cdr.markForCheck();
  }

  public ApplyRawJsonSource(): boolean {
    if (!this.IsEditable) {
      return false;
    }
    let parsedRaw: { Slides?: SlideSpec[] } | null = null;
    try {
      const parsedValue = JSON.parse(this.RawDeckJsonText) as { Slides?: SlideSpec[] } | null;
      if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue) || !Array.isArray(parsedValue.Slides)) {
        this.RawJsonErrorMessage = 'Invalid SlideDeck JSON schema: root must be an object with a "Slides" array.';
        this.StatusBannerMessage = this.RawJsonErrorMessage;
        this.cdr.markForCheck();
        return false;
      }
      parsedRaw = parsedValue;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Malformed JSON';
      this.RawJsonErrorMessage = `Invalid JSON syntax: ${detail}`;
      this.StatusBannerMessage = this.RawJsonErrorMessage;
      this.cdr.markForCheck();
      return false;
    }

    if (!parsedRaw) {
      return false;
    }
    const candidateDeck = SlideDeckEngine.Instance.ParseDeckSpec(
      this.RawDeckJsonText,
      this.Deck.Title,
      this.Deck.DeckID,
    );
    const lockViolation = this.findDeckLockViolation(this.Deck, candidateDeck);
    if (lockViolation) {
      this.RawJsonErrorMessage = lockViolation;
      this.StatusBannerMessage = lockViolation;
      this.cdr.markForCheck();
      return false;
    }

    this.RawJsonErrorMessage = '';
    this.isRawJsonDirty = false;
    this.RawJsonRemoteConflictPending = false;
    this.pendingRemoteDeckJson = null;
    this.Deck = candidateDeck;
    if (!this.Deck.Slides.some((s) => s.SlideID === this.ActiveSlideID)) {
      this.ActiveSlideID = this.Deck.Slides[0]?.SlideID ?? 'slide-1';
    }
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    this.RawDeckJsonText = serialized;
    this.session?.SetContent(serialized);
    void this.executeAllLiveBlocksInDeck(this.Deck);
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
    return true;
  }

  private findDeckLockViolation(existingDeck: SlideDeckSpec, nextDeck: SlideDeckSpec | null): string | null {
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    for (const slide of existingDeck.Slides) {
      const nextSlide = nextDeck?.Slides.find((s) => s.SlideID === slide.SlideID) ?? null;
      const slideCheck = SlideDeckEngine.Instance.CanActorEditSlide(slide, userId, ownerId, this.IsEditable);
      if (!slideCheck.Allowed) {
        if (!nextSlide || JSON.stringify(slide) !== JSON.stringify(nextSlide)) {
          return slideCheck.Reason || `Slide ${slide.SlideNumber} (${slide.Title}) is locked.`;
        }
        continue;
      }
      for (const region of slide.Regions) {
        const regCheck = SlideDeckEngine.Instance.CanActorEditRegion(
          slide,
          region,
          userId,
          ownerId,
          this.IsEditable,
        );
        if (!regCheck.Allowed) {
          const nextRegion = nextSlide?.Regions.find((r) => r.RegionID === region.RegionID) ?? null;
          if (!nextRegion || JSON.stringify(region) !== JSON.stringify(nextRegion)) {
            return regCheck.Reason || `Region "${region.Label}" on Slide ${slide.SlideNumber} is locked.`;
          }
        }
      }
    }
    return null;
  }

  public OpenCommentForSlideRegion(slideId: string, regionId: string, label: string): void {
    this.FocusedRegionID = regionId;
    this.PendingAnchorKey = `${slideId}:${regionId}`;
    this.PendingAnchorLabel = `Slide ${this.ActiveSlide.SlideNumber} · ${label}`;
    this.RightDrawerTab = 'comments';
    this.cdr.markForCheck();
  }

  /**
   * Posts an anchored `SlideRegion` comment (`AnchorType = 'SlideRegion'`, `AnchorKey = '<SlideID>:<RegionID>'`),
   * persisting only the user's real `Role = 'User'` comment to the server.
   */
  public async SubmitSlideRegionComment(): Promise<void> {
    const trimmed = this.NewCommentDraft.trim();
    if (!trimmed || !this.CanComment) {
      return;
    }
    const user = this.getCurrentUserSummary();
    const mentions = ExtractAnchoredCommentMentions(trimmed);
    const nowIso = new Date().toISOString();

    const newThread: DocumentAnchoredThread = {
      ConversationID: `slide-conv-${Date.now()}`,
      AnchorKey: this.PendingAnchorKey,
      AnchorLabel: this.PendingAnchorLabel,
      QuotedText: this.ActiveSlide.Title,
      Status: 'Open',
      AgentMode: 'edit',
      CreatedAt: nowIso,
      Messages: [
        {
          DetailID: `msg-${Date.now()}-1`,
          UserName: user.Name,
          Role: 'User',
          Message: trimmed,
          CreatedAt: nowIso,
          Mentions: mentions,
        },
      ],
    };

    if (this.artifactVersion?.ArtifactID) {
      const saved = await this.persistAnchoredSlideThread(newThread);
      if (!saved) {
        return;
      }
    }

    this.AnchoredThreads = [newThread, ...this.AnchoredThreads];
    this.NewCommentDraft = '';
    this.cdr.markForCheck();
  }

  public async ToggleResolveSlideThread(thread: DocumentAnchoredThread): Promise<void> {
    const previousStatus = thread.Status;
    thread.Status = thread.Status === 'Open' ? 'Resolved' : 'Open';
    const ok = await this.persistThreadStatusUpdateIfPossible(thread);
    if (!ok) {
      thread.Status = previousStatus;
    }
    this.cdr.markForCheck();
  }

  public get FilteredAnchoredThreads(): DocumentAnchoredThread[] {
    if (this.CommentFilterScope === 'deck') {
      return this.AnchoredThreads;
    }
    const activeSlideId = this.ActiveSlide?.SlideID ?? this.ActiveSlideID;
    return this.AnchoredThreads.filter((t) => {
      const parsed = this.parseSlideRegionAnchorKey(t.AnchorKey);
      return parsed.SlideID === activeSlideId;
    });
  }

  public get FilteredSlideSuggestions(): SlideDeckSuggestion[] {
    if (this.CommentFilterScope === 'deck') {
      return this.SharedSuggestions;
    }
    const activeSlideId = this.ActiveSlide?.SlideID ?? this.ActiveSlideID;
    return this.SharedSuggestions.filter((s) => s.SlideID === activeSlideId);
  }

  public GetSlideOpenCommentCount(slideId: string): number {
    return this.AnchoredThreads.filter((t) => {
      if (t.Status !== 'Open') return false;
      return this.parseSlideRegionAnchorKey(t.AnchorKey).SlideID === slideId;
    }).length;
  }

  public GetSlidePendingSuggestionCount(slideId: string): number {
    return this.SharedSuggestions.filter((s) => s.Status === 'Pending' && s.SlideID === slideId).length;
  }

  public GetRegionOpenCommentCount(slideId: string, regionId: string): number {
    return this.AnchoredThreads.filter((t) => {
      if (t.Status !== 'Open') return false;
      const parsed = this.parseSlideRegionAnchorKey(t.AnchorKey);
      return parsed.SlideID === slideId && parsed.RegionID === regionId;
    }).length;
  }

  public JumpToSlideAnchorKey(anchorKey: string): void {
    const { SlideID: slideId, RegionID: regionId } = this.parseSlideRegionAnchorKey(anchorKey);
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    if (!targetSlide) {
      return;
    }
    this.SelectSlide(targetSlide.SlideID);
    if (regionId && regionId !== 'title' && regionId !== 'notes') {
      const matchingRegion = targetSlide.Regions.find((r) => r.RegionID === regionId);
      if (matchingRegion) {
        this.FocusedRegionID = matchingRegion.RegionID;
        this.PendingAnchorKey = `${targetSlide.SlideID}:${matchingRegion.RegionID}`;
        this.PendingAnchorLabel = `Slide ${targetSlide.SlideNumber} · ${matchingRegion.Label}`;
      }
    }
    this.cdr.markForCheck();
  }

  public GetThreadReplyDraft(conversationId: string): string {
    return this.threadReplyDrafts.get(conversationId) ?? '';
  }

  public SetThreadReplyDraft(conversationId: string, value: string): void {
    this.threadReplyDrafts.set(conversationId, value);
  }

  public async SubmitReplyToAnchoredSlideThread(thread: DocumentAnchoredThread): Promise<void> {
    const trimmed = (this.threadReplyDrafts.get(thread.ConversationID) ?? '').trim();
    if (!trimmed || !this.CanComment) {
      return;
    }
    const user = this.getCurrentUserSummary();
    const mentions = ExtractAnchoredCommentMentions(trimmed);
    const nowIso = new Date().toISOString();
    const replyMsg = {
      DetailID: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      UserName: user.Name,
      Role: 'User' as const,
      Message: trimmed,
      CreatedAt: nowIso,
      Mentions: mentions,
    };

    const artifactId = this.artifactVersion?.ArtifactID;
    const provider = this.getSafeProvider();
    const currentUser = this.getSafeCurrentUser();
    if (artifactId && provider && currentUser && IsValidUUID(thread.ConversationID)) {
      try {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
          'MJ: Conversation Details',
          currentUser,
        );
        detail.NewRecord();
        detail.ConversationID = thread.ConversationID;
        detail.UserID = currentUser.ID;
        detail.Message = trimmed;
        detail.Role = 'User';
        const saved = await detail.Save();
        if (!saved) {
          const errMsg = detail.LatestResult?.Message || 'Failed to save comment reply.';
          this.notifyError(errMsg);
          return;
        }
        if (detail.ID) {
          replyMsg.DetailID = detail.ID;
        }
      } catch (err) {
        LogError(err);
        this.notifyError(err instanceof Error ? err.message : 'Failed to save comment reply.');
        return;
      }
    }

    thread.Messages = [...thread.Messages, replyMsg];
    this.threadReplyDrafts.delete(thread.ConversationID);
    this.cdr.markForCheck();

    if (mentions.length > 0 && artifactId && provider) {
      const agentHandle = mentions[0];
      const agentMode = thread.AgentMode ?? 'edit';
      const mentionRes = await this.collabService.ExecuteAnchoredCommentAgentMention(
        artifactId,
        agentHandle,
        agentMode,
        trimmed,
        thread.QuotedText,
        provider,
        thread.ConversationID,
      );
      if (this.isComponentDestroyed) {
        return;
      }
      if (mentionRes.Success) {
        if (mentionRes.ReplyBody) {
          thread.Messages = [
            ...thread.Messages,
            {
              DetailID: `msg-agent-${Date.now()}`,
              UserName: agentHandle,
              Role: 'Agent',
              Message: mentionRes.ReplyBody,
              CreatedAt: new Date().toISOString(),
              Mentions: [],
            },
          ];
        }
        if (mentionRes.UpdatedContent && this.IsEditable) {
          const nextDeck = SlideDeckEngine.Instance.ParseDeckSpec(
            mentionRes.UpdatedContent,
            this.Deck.Title,
            this.Deck.DeckID,
          );
          const lockViolation = this.findDeckLockViolation(this.Deck, nextDeck);
          if (!lockViolation) {
            this.Deck = nextDeck;
            const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
            this.session?.SetContent(serialized);
            this.syncRawDeckJson();
            void this.executeAllLiveBlocksInDeck(this.Deck);
            this.refreshDriftSummariesForActiveSlide();
          } else {
            this.StatusBannerMessage = lockViolation;
          }
        }
      } else if (mentionRes.HandledByServer && mentionRes.ErrorMessage) {
        this.notifyError(mentionRes.ErrorMessage);
      }
      this.cdr.markForCheck();
    }
  }

  public AcceptSlideSuggestion(suggestion: SlideDeckSuggestion): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlide =
      this.Deck.Slides.find((s) => s.SlideID === suggestion.SlideID) ??
      (suggestion.SlideNumber !== undefined
        ? this.Deck.Slides.find((s) => s.SlideNumber === suggestion.SlideNumber)
        : undefined);
    if (!targetSlide) {
      return;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const slideCheck = SlideDeckEngine.Instance.CanActorEditSlide(
      targetSlide,
      userId,
      ownerId,
      this.IsEditable,
    );
    if (!slideCheck.Allowed) {
      this.StatusBannerMessage = slideCheck.Reason || 'Slide is locked.';
      this.cdr.markForCheck();
      return;
    }

    if (suggestion.Field === 'slide-title') {
      this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Title: suggestion.SuggestedText });
    } else if (suggestion.Field === 'slide-subtitle') {
      this.applySingleSlideMetadataPatch(targetSlide.SlideID, { Subtitle: suggestion.SuggestedText });
    } else {
      const targetRegionId = suggestion.RegionID || targetSlide.Regions[0]?.RegionID || 'main';
      const targetRegion = targetSlide.Regions.find((r) => r.RegionID === targetRegionId);
      if (targetRegion) {
        const regCheck = SlideDeckEngine.Instance.CanActorEditRegion(
          targetSlide,
          targetRegion,
          userId,
          ownerId,
          this.IsEditable,
        );
        if (!regCheck.Allowed) {
          this.StatusBannerMessage = regCheck.Reason || 'Slide region is locked.';
          this.cdr.markForCheck();
          return;
        }
      }
      const nextRegionMarkdown =
        suggestion.OriginalText &&
        targetRegion &&
        targetRegion.MarkdownContent.includes(suggestion.OriginalText)
          ? targetRegion.MarkdownContent.replace(
              suggestion.OriginalText,
              () => suggestion.SuggestedText,
            )
          : suggestion.SuggestedText;
      this.applySingleSlideRegionPatch(targetSlide.SlideID, {
        RegionID: targetRegionId,
        MarkdownContent: nextRegionMarkdown,
      });
    }

    const updated: SlideDeckSuggestion = {
      ...suggestion,
      SlideID: targetSlide.SlideID,
      Status: 'Accepted',
    };
    this.persistSlideSuggestion(updated, targetSlide.SlideNumber);
    this.StatusBannerMessage = `Accepted suggested edit on Slide ${targetSlide.SlideNumber}.`;
    this.cdr.markForCheck();
  }

  public RejectSlideSuggestion(suggestion: SlideDeckSuggestion): void {
    if (!this.IsEditable) {
      return;
    }
    const targetSlide =
      this.Deck.Slides.find((s) => s.SlideID === suggestion.SlideID) ??
      (suggestion.SlideNumber !== undefined
        ? this.Deck.Slides.find((s) => s.SlideNumber === suggestion.SlideNumber)
        : undefined);
    const updated: SlideDeckSuggestion = {
      ...suggestion,
      SlideID: targetSlide?.SlideID ?? suggestion.SlideID,
      Status: 'Rejected',
    };
    this.persistSlideSuggestion(updated, targetSlide?.SlideNumber);
    this.StatusBannerMessage = 'Rejected suggested edit.';
    this.cdr.markForCheck();
  }

  private persistSlideSuggestion(suggestion: SlideDeckSuggestion, slideNumber?: number): void {
    const userId = this.getSafeCurrentUser()?.ID;
    const canonical = BuildCanonicalSlideSuggestionRecord(
      suggestion,
      slideNumber,
      this.artifactVersion?.ArtifactID,
      suggestion.Status === 'Pending'
        ? undefined
        : { ReviewedByUserID: userId, ReviewedAt: new Date().toISOString() },
    );
    UpsertArtifactSuggestionInVersionConfiguration(this.artifactVersion, canonical);
    this.SharedSuggestions = this.SharedSuggestions.some(
      (s) => s.SuggestionID === suggestion.SuggestionID,
    )
      ? this.SharedSuggestions.map((s) =>
          s.SuggestionID === suggestion.SuggestionID ? suggestion : s,
        )
      : [...this.SharedSuggestions, suggestion];
    this.session?.SetSharedSuggestionRaw(suggestion.SuggestionID, JSON.stringify(canonical));
  }

  private syncSharedSuggestionsFromSession(): void {
    const rawMap = this.session ? this.session.GetSharedSuggestionsRaw() : new Map<string, string>();
    const configSuggestions = ParseSuggestionsFromConfiguration(
      ReadArtifactVersionConfigurationSafe(this.artifactVersion),
      'slides',
    );
    const shouldSeedSession = Boolean(this.session) && rawMap.size === 0 && configSuggestions.length > 0;
    const byId = new Map<string, SlideDeckSuggestion>();
    for (const [id, rawJson] of rawMap.entries()) {
      const sug = NormalizeSlideSuggestion(rawJson, id);
      if (sug) {
        if (!sug.SlideID && sug.SlideNumber !== undefined) {
          const matchedSlide = this.Deck.Slides.find((s) => s.SlideNumber === sug.SlideNumber);
          if (matchedSlide) {
            sug.SlideID = matchedSlide.SlideID;
          }
        }
        byId.set(sug.SuggestionID, sug);
      }
    }
    for (const cfgItem of configSuggestions) {
      if (byId.has(cfgItem.SuggestionID)) {
        continue;
      }
      const sug = NormalizeSlideSuggestion(cfgItem, cfgItem.SuggestionID);
      if (sug) {
        if (!sug.SlideID && sug.SlideNumber !== undefined) {
          const matchedSlide = this.Deck.Slides.find((s) => s.SlideNumber === sug.SlideNumber);
          if (matchedSlide) {
            sug.SlideID = matchedSlide.SlideID;
          }
        }
        byId.set(sug.SuggestionID, sug);
        if (shouldSeedSession && this.session) {
          this.session.SetSharedSuggestionRaw(cfgItem.SuggestionID, JSON.stringify(cfgItem));
        }
      }
    }
    const parsedList = Array.from(byId.values()).sort((a, b) =>
      (a.CreatedAt || '').localeCompare(b.CreatedAt || ''),
    );
    this.SharedSuggestions = parsedList;
  }

  private parseSlideRegionAnchorKey(anchorKey: string): { SlideID: string; RegionID: string } {
    const raw = (anchorKey || '').trim();
    if (!raw) {
      return { SlideID: '', RegionID: '' };
    }
    const doubleIdx = raw.indexOf('::');
    if (doubleIdx >= 0) {
      return {
        SlideID: raw.slice(0, doubleIdx),
        RegionID: raw.slice(doubleIdx + 2),
      };
    }
    const colonIdx = raw.indexOf(':');
    if (colonIdx >= 0) {
      return {
        SlideID: raw.slice(0, colonIdx),
        RegionID: raw.slice(colonIdx + 1),
      };
    }
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) {
      return {
        SlideID: raw.slice(0, hashIdx),
        RegionID: raw.slice(hashIdx + 1),
      };
    }
    return { SlideID: raw, RegionID: '' };
  }

  public get ActiveSlideHasAnyDrift(): boolean {
    return this.ActiveSlideDriftSummaries.some((d) => d.HasDrift);
  }

  private refreshDriftSummariesForActiveSlide(): void {
    const slide = this.DisplayedSlide ?? this.ActiveSlide;
    if (!slide) {
      this.ActiveSlideDriftSummaries = [];
      return;
    }
    const summaries: SlideRegionDriftSummary[] = [];
    for (const region of slide.Regions) {
      const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
      if (!block || block.Mode !== 'Frozen' || !block.FrozenSnapshot || this.IsInlineOleArtifactBlock(block)) {
        continue;
      }
      const frozenRows = block.FrozenSnapshot.Rows ?? [];
      const live = this.driftLiveResultsByBlockId.get(block.BlockID) ?? null;
      let liveRowCount: number | null = null;
      let added = 0;
      let removed = 0;
      let changed = 0;
      let hasDrift = false;
      let errorMessage: string | undefined;

      if (live) {
        if (!live.Success) {
          errorMessage = live.ErrorMessage || 'Failed to query live source.';
        } else {
          const liveRows = live.Rows ?? [];
          liveRowCount = liveRows.length;
          const maxLen = Math.max(frozenRows.length, liveRows.length);
          for (let i = 0; i < maxLen; i++) {
            const fRow = frozenRows[i];
            const lRow = liveRows[i];
            if (!fRow && lRow) {
              added++;
            } else if (fRow && !lRow) {
              removed++;
            } else if (fRow && lRow && JSON.stringify(fRow) !== JSON.stringify(lRow)) {
              changed++;
            }
          }
          hasDrift = added > 0 || removed > 0 || changed > 0;
        }
      }

      const preVerified = this.GetBlockPreVerifiedSnapshot(block, region.RegionID, this.ActiveSlide.SlideID);
      const signatureVerified = this.IsSnapshotVerified(block, region.RegionID, this.ActiveSlide.SlideID);
      summaries.push({
        RegionID: region.RegionID,
        BlockID: block.BlockID,
        BlockTitle: block.Title || region.Label,
        FrozenAt: block.FrozenSnapshot.FrozenAt || preVerified?.FrozenAt || '',
        FrozenByUserName: signatureVerified
          ? block.FrozenSnapshot.FrozenByUserName ||
            preVerified?.FrozenByUserName ||
            block.FrozenSnapshot.FrozenByUserID ||
            ''
          : '',
        SignatureVerified: signatureVerified,
        FrozenRowCount: frozenRows.length,
        LiveRowCount: liveRowCount,
        HasDrift: hasDrift,
        ChangedRowCount: changed,
        AddedRowCount: added,
        RemovedRowCount: removed,
        ErrorMessage: errorMessage,
      });
    }
    this.ActiveSlideDriftSummaries = summaries;
  }

  public async CompareActiveSlideDriftWithLive(): Promise<void> {
    if (this.ShowDriftComparePopover && !this.IsCheckingSlideDrift) {
      const allEvaluated = this.ActiveSlideDriftSummaries.every(
        (d) => d.LiveRowCount !== null || Boolean(d.ErrorMessage),
      );
      if (allEvaluated) {
        this.ShowDriftComparePopover = false;
        this.cdr.markForCheck();
        return;
      }
    }

    const slide = this.DisplayedSlide ?? this.ActiveSlide;
    if (!slide) {
      return;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    this.IsCheckingSlideDrift = true;
    this.ShowDriftComparePopover = true;
    this.cdr.markForCheck();

    try {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (!block || block.Mode !== 'Frozen' || !block.FrozenSnapshot || this.IsInlineOleArtifactBlock(block)) {
          continue;
        }
        if (!provider || !user) {
          this.driftLiveResultsByBlockId.set(block.BlockID, {
            Success: false,
            BlockID: block.BlockID,
            Kind: block.Kind,
            Mode: 'Live',
            ErrorMessage: 'Metadata provider or user context unavailable to compare live rows.',
            Columns: [],
            Rows: [],
            TotalRowCount: 0,
          });
          continue;
        }
        const liveRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
          { ...block, Mode: 'Live' },
          user,
          provider,
        );
        this.driftLiveResultsByBlockId.set(block.BlockID, liveRes);
      }
    } catch (err) {
      LogError(err);
    } finally {
      this.IsCheckingSlideDrift = false;
      this.refreshDriftSummariesForActiveSlide();
      this.cdr.markForCheck();
    }
  }

  public async RefreezeAllDriftBlocksOnActiveSlide(): Promise<void> {
    if (!this.IsEditable || !this.ActiveSlide) {
      return;
    }
    for (const region of this.ActiveSlide.Regions) {
      const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
      if (!block || block.Mode !== 'Frozen' || this.IsInlineOleArtifactBlock(block)) {
        continue;
      }
      if (this.CanEditRegion(region)) {
        await this.FreezeLiveBlock(region, { ...block, Mode: 'Live' });
      }
    }
    this.driftLiveResultsByBlockId.clear();
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
  }

  public SwitchAllFrozenBlocksOnActiveSlideToLive(): void {
    if (!this.IsEditable || !this.ActiveSlide) {
      return;
    }
    for (const region of this.ActiveSlide.Regions) {
      const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
      if (!block || block.Mode !== 'Frozen' || this.IsInlineOleArtifactBlock(block)) {
        continue;
      }
      if (this.CanEditRegion(region)) {
        this.UnfreezeSlideRegionBlock(region, block);
      }
    }
    this.ShowDriftComparePopover = false;
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
  }

  public GetSanitizedRegionImageUrl(region: SlideRegionSpec): string | null {
    return SlideDeckEngine.Instance.SanitizeImageUrl(region.ImageUrl) ?? null;
  }

  public ParseMarkdownTable(markdown: string): { Headers: string[]; Rows: string[][] } | null {
    const lines = (markdown ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|') && l.includes('|', 1));
    if (lines.length < 2) {
      return null;
    }
    const splitRow = (line: string): string[] =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    const headers = splitRow(lines[0]);
    if (headers.length === 0) {
      return null;
    }
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      const isSeparator = cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (isSeparator) {
        continue;
      }
      const normalizedRow = headers.map((_, idx) => cells[idx] ?? '');
      rows.push(normalizedRow);
    }
    if (rows.length === 0) {
      return null;
    }
    return { Headers: headers, Rows: rows };
  }

  public IsChartDisplayBlock(block: DocumentBlockSpec): boolean {
    return Boolean(block.DisplayMode === 'chart' || block.ChartType || block.SheetChartID);
  }

  public BuildStageChartModel(
    block: DocumentBlockSpec,
    displayData: { Columns: DocumentBlockColumn[]; Rows: DocumentBlockExecutionResult['Rows'] },
  ): SlideStageChartModel | null {
    if (!displayData || displayData.Columns.length === 0 || displayData.Rows.length === 0) {
      return null;
    }
    const numericCols: DocumentBlockColumn[] = [];
    let categoryCol: DocumentBlockColumn | null = null;
    for (const col of displayData.Columns) {
      const numericCount = displayData.Rows.filter((r) => {
        const v = r[col.Name];
        return typeof v === 'number' && Number.isFinite(v);
      }).length;
      if (numericCount > 0 && numericCount >= Math.ceil(displayData.Rows.length * 0.5)) {
        numericCols.push(col);
      } else if (!categoryCol) {
        categoryCol = col;
      }
    }
    if (numericCols.length === 0) {
      return null;
    }
    const resolvedCatCol = categoryCol ?? displayData.Columns[0];
    const seriesCols = numericCols.filter((c) => c.Name !== resolvedCatCol.Name || numericCols.length === 1);
    if (seriesCols.length === 0) {
      return null;
    }

    const palette = [
      this.Deck.Theme.PrimaryColor || '#0F766E',
      this.Deck.Theme.AccentColor || '#F59E0B',
      '#2563EB',
      '#10B981',
      '#8B5CF6',
      '#EC4899',
    ];
    const cappedRows = displayData.Rows.slice(0, 24);
    const categories = cappedRows.map((r, idx) => {
      const raw = r[resolvedCatCol.Name];
      return raw !== null && raw !== undefined && String(raw).trim() !== ''
        ? String(raw).slice(0, 18)
        : `Item ${idx + 1}`;
    });

    const series = seriesCols.map((sc, sIdx) => ({
      Name: sc.DisplayName || sc.Name,
      Color: palette[sIdx % palette.length],
      Values: cappedRows.map((r) => {
        const v = r[sc.Name];
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
      }),
    }));

    const allValues = series.flatMap((s) => s.Values);
    const maxValue = Math.max(1, ...allValues);
    const chartType = block.ChartType ?? 'bar';

    let pieSlices: SlideStageChartModel['PieSlices'];
    if (chartType === 'pie' && series.length > 0) {
      const vals = series[0].Values.map((v) => Math.max(0, v));
      const total = vals.reduce((acc, v) => acc + v, 0);
      if (total > 0) {
        const cx = 180;
        const cy = 86;
        const r = 68;
        let currentAngle = -Math.PI / 2;
        pieSlices = [];
        for (let i = 0; i < vals.length; i++) {
          const val = vals[i];
          if (val <= 0) continue;
          const pct = (val / total) * 100;
          const angle = (val / total) * Math.PI * 2;
          let pathData: string;
          if (angle >= Math.PI * 2 - 0.0001) {
            pathData = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
          } else {
            const x1 = (cx + r * Math.cos(currentAngle)).toFixed(2);
            const y1 = (cy + r * Math.sin(currentAngle)).toFixed(2);
            const endAngle = currentAngle + angle;
            const x2 = (cx + r * Math.cos(endAngle)).toFixed(2);
            const y2 = (cy + r * Math.sin(endAngle)).toFixed(2);
            const largeArc = angle > Math.PI ? 1 : 0;
            pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            currentAngle = endAngle;
          }
          pieSlices.push({
            Label: categories[i] ?? `Slice ${i + 1}`,
            Value: val,
            Percentage: pct,
            PathData: pathData,
            Color: palette[i % palette.length],
          });
        }
      }
    }

    return {
      ChartType: chartType,
      Categories: categories,
      Series: series,
      MaxValue: maxValue,
      PieSlices: pieSlices,
    };
  }

  public FormatChartPolylinePoints(values: number[], maxValue: number): string {
    const count = Math.max(1, values.length);
    const safeMax = Math.max(1, maxValue);
    return values
      .map((val, idx) => {
        const x = this.GetChartCategoryX(idx, count);
        const y = (152 - (Math.max(0, val) / safeMax) * 134).toFixed(1);
        return `${x},${y}`;
      })
      .join(' ');
  }

  public GetChartCategoryX(catIndex: number, catCount: number): number {
    const safeCount = Math.max(1, catCount);
    return Number((24 + ((catIndex + 0.5) / safeCount) * 316).toFixed(1));
  }

  public GetChartBarWidth(catCount: number, seriesCount: number): number {
    const safeCats = Math.max(1, catCount);
    const safeSer = Math.max(1, seriesCount);
    const slotWidth = 316 / safeCats;
    return Math.max(4, Math.floor((slotWidth - 8) / safeSer));
  }

  public GetChartBarX(catIndex: number, seriesIndex: number, catCount: number, seriesCount: number): number {
    const barW = this.GetChartBarWidth(catCount, seriesCount);
    const gap = 2;
    const groupW = barW * Math.max(1, seriesCount) + Math.max(0, seriesCount - 1) * gap;
    const center = this.GetChartCategoryX(catIndex, catCount);
    return Number((center - groupW / 2 + seriesIndex * (barW + gap)).toFixed(1));
  }

  public GetChartBarHeight(value: number, maxValue: number): number {
    if (value <= 0) {
      return 0;
    }
    const safeMax = Math.max(1, maxValue);
    return Number(Math.max(3, (value / safeMax) * 134).toFixed(1));
  }

  public GetChartBarY(value: number, maxValue: number): number {
    const h = this.GetChartBarHeight(value, maxValue);
    return Number((152 - h).toFixed(1));
  }

  public RenderRegionHtml(markdown: string): string {
    const lines = (markdown ?? '').split('\n');
    const htmlParts: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith('### ')) {
        htmlParts.push(`<h3>${EscapeHtml(trimmed.slice(4))}</h3>`);
      } else if (trimmed.startsWith('## ')) {
        htmlParts.push(`<h2>${EscapeHtml(trimmed.slice(3))}</h2>`);
      } else if (trimmed.startsWith('# ')) {
        htmlParts.push(`<h1>${EscapeHtml(trimmed.slice(2))}</h1>`);
      } else if (/^[-*+]\s+/.test(trimmed)) {
        htmlParts.push(`<div>• ${this.formatInlineBoldAndCode(trimmed.replace(/^[-*+]\s+/, ''))}</div>`);
      } else {
        htmlParts.push(`<p>${this.formatInlineBoldAndCode(trimmed)}</p>`);
      }
    }
    return htmlParts.join('');
  }

  public GetInitials(name: string): string {
    return (name || 'U')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
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
    const artifactId = this.session?.ArtifactID || this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      return;
    }
    void this.collabService.Retry(artifactId);
  }

  private handleCollaborationMergeConflict(event: CollaborationMergeConflictEvent): void {
    this.StatusBannerMessage = MERGE_CONFLICT_WARNING_MESSAGE;
    this.collabService.NotifyMergeConflictToastOnce(event, this.notificationService);
    this.cdr.markForCheck();
  }

  private formatInlineBoldAndCode(text: string): string {
    const escaped = EscapeHtml(text);
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`)
      .replace(/`([^`]+)`/g, (_m, inner: string) => `<code>${inner}</code>`);
  }

  private convertEditableRegionDomToMarkdown(el: HTMLElement): string {
    if (!el.childNodes || el.childNodes.length === 0) {
      const rawText = (el.innerText ?? el.textContent ?? '').replace(/\r\n/g, '\n').trim();
      return rawText
        .split('\n')
        .map((line) => line.replace(/^•\s+/, '- ').trimEnd())
        .join('\n');
    }
    const lines: string[] = [];
    this.collectEditableBlockLines(el, lines);
    return lines
      .map((line) => line.replace(/^•\s+/, '- ').trimEnd())
      .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1))
      .join('\n')
      .trim();
  }

  private collectEditableBlockLines(container: Node, outLines: string[]): void {
    const blockTags = new Set(['H1', 'H2', 'H3', 'P', 'DIV', 'BLOCKQUOTE', 'UL', 'OL', 'LI']);
    let inlineBuf = '';
    const flushInline = (): void => {
      const normalized = inlineBuf.replace(/\r\n/g, '\n');
      if (normalized.trim().length > 0) {
        for (const l of normalized.split('\n')) {
          if (l.trim().length > 0) {
            outLines.push(l.trimEnd());
          }
        }
      }
      inlineBuf = '';
    };

    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === 3) {
        inlineBuf += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== 1) {
        continue;
      }
      const el = child as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (!blockTags.has(tag)) {
        inlineBuf += this.serializeEditableInlineNode(el);
        continue;
      }
      flushInline();

      if (tag === 'H1') {
        const text = this.serializeEditableInlineChildren(el).trim();
        if (text) outLines.push(`# ${text}`);
      } else if (tag === 'H2') {
        const text = this.serializeEditableInlineChildren(el).trim();
        if (text) outLines.push(`## ${text}`);
      } else if (tag === 'H3') {
        const text = this.serializeEditableInlineChildren(el).trim();
        if (text) outLines.push(`### ${text}`);
      } else if (tag === 'UL' || tag === 'OL') {
        const listItems = Array.from(el.childNodes).filter(
          (n) => n.nodeType === 1 && (n as HTMLElement).tagName.toUpperCase() === 'LI',
        );
        listItems.forEach((li, index) => {
          const prefix = tag === 'OL' ? `${index + 1}. ` : '- ';
          const text = this.serializeEditableInlineChildren(li).trim();
          if (text) outLines.push(`${prefix}${text}`);
        });
      } else if (tag === 'LI') {
        const text = this.serializeEditableInlineChildren(el).trim();
        if (text) outLines.push(`- ${text}`);
      } else {
        const hasNestedBlock = Array.from(el.childNodes).some(
          (n) => n.nodeType === 1 && blockTags.has((n as HTMLElement).tagName.toUpperCase()),
        );
        if (hasNestedBlock) {
          this.collectEditableBlockLines(el, outLines);
        } else {
          const text = this.serializeEditableInlineChildren(el).replace(/\r\n/g, '\n');
          for (const l of text.split('\n')) {
            const trimmed = l.trimEnd();
            if (trimmed.trim().length > 0) {
              outLines.push(trimmed);
            }
          }
        }
      }
    }
    flushInline();
  }

  private serializeEditableInlineChildren(parent: Node): string {
    let out = '';
    for (const child of Array.from(parent.childNodes)) {
      out += this.serializeEditableInlineNode(child);
    }
    return out;
  }

  private serializeEditableInlineNode(node: Node): string {
    if (node.nodeType === 3) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== 1) {
      return '';
    }
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') {
      return '\n';
    }
    if (tag === 'STRONG' || tag === 'B') {
      const inner = this.serializeEditableInlineChildren(el);
      return inner ? `**${inner}**` : '';
    }
    if (tag === 'EM' || tag === 'I') {
      const inner = this.serializeEditableInlineChildren(el);
      return inner ? `*${inner}*` : '';
    }
    if (tag === 'CODE') {
      const inner = el.textContent ?? '';
      return inner ? `\`${inner}\`` : '';
    }
    return this.serializeEditableInlineChildren(el);
  }

  private resolveArtifactOwnerUserId(currentUserId: string | null): string | null {
    if (this.artifactOwnerUserId) {
      return this.artifactOwnerUserId;
    }
    if (this.ResolvedPermissions?.Source === 'Owner' && currentUserId) {
      return currentUserId;
    }
    return null;
  }

  private buildLockContext(): {
    ActorUserID: string | null;
    OwnerUserID: string | null;
    IsEditor: boolean;
  } {
    const actorId = this.getSafeCurrentUser()?.ID ?? null;
    return {
      ActorUserID: actorId,
      OwnerUserID: this.resolveArtifactOwnerUserId(actorId),
      IsEditor: this.IsEditable,
    };
  }

  /**
   * Updates ONLY the targeted slide's metadata in `this.Deck` and broadcasts the single-slide
   * update via `session.UpdateSlideInDeck` (`Accept #1`).
   */
  public get CanEditSlideElements(): boolean {
    if (!this.IsEditable || this.WorkspaceMode !== 'edit' || !this.ActiveSlide) {
      return false;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    return SlideDeckEngine.Instance.CanActorEditSlide(
      this.ActiveSlide,
      userId,
      ownerId,
      this.IsEditable,
    ).Allowed;
  }

  public CanEditRegion(region: SlideRegionSpec): boolean {
    if (!this.IsEditable || this.WorkspaceMode !== 'edit' || !this.ActiveSlide) {
      return false;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    return SlideDeckEngine.Instance.CanActorEditRegion(
      this.ActiveSlide,
      region,
      userId,
      ownerId,
      this.IsEditable,
    ).Allowed;
  }

  public get CanToggleCurrentSlideLock(): boolean {
    if (!this.IsEditable || !this.ActiveSlide) {
      return false;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    if (!userId) {
      return false;
    }
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (!this.ActiveSlide.Locked) {
      return true;
    }
    return SlideDeckEngine.Instance.CanActorEditSlide(
      this.ActiveSlide,
      userId,
      ownerId,
      false,
    ).Allowed;
  }

  public CanToggleRegionLock(region: SlideRegionSpec): boolean {
    if (!this.IsEditable || !this.ActiveSlide) {
      return false;
    }
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    if (!userId) {
      return false;
    }
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (!region.Locked && !this.ActiveSlide.Locked) {
      return true;
    }
    return SlideDeckEngine.Instance.CanActorEditRegion(
      this.ActiveSlide,
      region,
      userId,
      ownerId,
      false,
    ).Allowed;
  }

  public ToggleCurrentSlideLock(): void {
    const userId = this.getSafeCurrentUser()?.ID;
    if (!this.IsEditable || !userId || !this.ActiveSlide) {
      return;
    }
    const nextLocked = !this.ActiveSlide.Locked;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (!nextLocked) {
      const canUnlock = SlideDeckEngine.Instance.CanActorEditSlide(
        this.ActiveSlide,
        userId,
        ownerId,
        false,
      );
      if (!canUnlock.Allowed) {
        this.StatusBannerMessage = canUnlock.Reason || 'Only the locker or owner can unlock this slide.';
        this.cdr.markForCheck();
        return;
      }
    }
    try {
      const res = SlideDeckEngine.Instance.SetSlideLock(
        this.Deck,
        this.ActiveSlide.SlideID,
        nextLocked,
        userId,
        false,
        ownerId,
      );
      if (!res.UpdatedSlide) {
        this.StatusBannerMessage = 'Only the locker or owner can unlock this slide.';
        this.cdr.markForCheck();
        return;
      }
      this.Deck = res.Deck;
      this.session?.UpdateSlideInDeck(res.UpdatedSlide, this.Deck);
      this.syncRawDeckJson();
      this.StatusBannerMessage = nextLocked
        ? `Locked Slide ${res.UpdatedSlide.SlideNumber} (${res.UpdatedSlide.Title}).`
        : `Unlocked Slide ${res.UpdatedSlide.SlideNumber}.`;
      this.cdr.markForCheck();
    } catch (err) {
      this.StatusBannerMessage = err instanceof Error ? err.message : 'Unable to toggle slide lock.';
      this.cdr.markForCheck();
    }
  }

  public ToggleCurrentSlideLockScope(): void {
    const userId = this.getSafeCurrentUser()?.ID;
    if (!this.IsEditable || !userId || !this.ActiveSlide || !this.ActiveSlide.Locked) {
      return;
    }
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const nextAllowEditors = !this.ActiveSlide.AllowEditors;
    try {
      const res = SlideDeckEngine.Instance.SetSlideLock(
        this.Deck,
        this.ActiveSlide.SlideID,
        true,
        userId,
        nextAllowEditors,
        ownerId,
      );
      if (!res.UpdatedSlide) {
        return;
      }
      this.Deck = res.Deck;
      this.session?.UpdateSlideInDeck(res.UpdatedSlide, this.Deck);
      this.syncRawDeckJson();
      this.StatusBannerMessage = nextAllowEditors
        ? `Slide ${res.UpdatedSlide.SlideNumber} lock updated: editors may now edit.`
        : `Slide ${res.UpdatedSlide.SlideNumber} lock updated: locker and owner only.`;
      this.cdr.markForCheck();
    } catch (err) {
      this.StatusBannerMessage = err instanceof Error ? err.message : 'Only the locker or owner can change lock scope.';
      this.cdr.markForCheck();
    }
  }

  public ToggleRegionLock(region: SlideRegionSpec): void {
    const userId = this.getSafeCurrentUser()?.ID;
    if (!this.IsEditable || !userId || !this.ActiveSlide) {
      return;
    }
    const nextLocked = !region.Locked;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (region.Locked || this.ActiveSlide.Locked) {
      const canUnlock = SlideDeckEngine.Instance.CanActorEditRegion(
        this.ActiveSlide,
        region,
        userId,
        ownerId,
        false,
      );
      if (!canUnlock.Allowed) {
        this.StatusBannerMessage = canUnlock.Reason || 'Only the locker or owner can unlock this region.';
        this.cdr.markForCheck();
        return;
      }
    }
    try {
      const res = SlideDeckEngine.Instance.SetRegionLock(
        this.Deck,
        this.ActiveSlide.SlideID,
        region.RegionID,
        nextLocked,
        userId,
        false,
        ownerId,
      );
      if (!res.UpdatedRegion) {
        this.StatusBannerMessage = 'Only the locker or owner can unlock this region.';
        this.cdr.markForCheck();
        return;
      }
      this.Deck = res.Deck;
      const updatedSlide = this.Deck.Slides.find((s) => s.SlideID === this.ActiveSlide.SlideID);
      if (updatedSlide) {
        this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
      }
      this.syncRawDeckJson();
      this.StatusBannerMessage = nextLocked
        ? `Locked slide region "${region.Label}".`
        : `Unlocked slide region "${region.Label}".`;
      this.cdr.markForCheck();
    } catch (err) {
      this.StatusBannerMessage = err instanceof Error ? err.message : 'Unable to toggle region lock.';
      this.cdr.markForCheck();
    }
  }

  public ToggleRegionLockScope(region: SlideRegionSpec): void {
    const userId = this.getSafeCurrentUser()?.ID;
    if (!this.IsEditable || !userId || !this.ActiveSlide || !region.Locked) {
      return;
    }
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    const nextAllowEditors = !region.AllowEditors;
    try {
      const res = SlideDeckEngine.Instance.SetRegionLock(
        this.Deck,
        this.ActiveSlide.SlideID,
        region.RegionID,
        true,
        userId,
        nextAllowEditors,
        ownerId,
      );
      if (!res.UpdatedRegion) {
        return;
      }
      this.Deck = res.Deck;
      const updatedSlide = this.Deck.Slides.find((s) => s.SlideID === this.ActiveSlide.SlideID);
      if (updatedSlide) {
        this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
      }
      this.syncRawDeckJson();
      this.StatusBannerMessage = nextAllowEditors
        ? `Region "${region.Label}" lock updated: editors may now edit.`
        : `Region "${region.Label}" lock updated: locker and owner only.`;
      this.cdr.markForCheck();
    } catch (err) {
      this.StatusBannerMessage = err instanceof Error ? err.message : 'Only the locker or owner can change region lock scope.';
      this.cdr.markForCheck();
    }
  }

  public OpenAskAiForPresentation(): void {
    if (!ARTIFACT_AI_ASSISTANT_ENABLED) {
      return;
    }
    const slide = this.ActiveSlide;
    const targetRegion =
      slide?.Regions.find((r) => r.RegionID === this.FocusedRegionID) ?? slide?.Regions[0];
    RequestArtifactAiAssistant({
      ArtifactID: this.artifactVersion?.ArtifactID ?? null,
      ArtifactTitle: this.Deck.Title || 'Presentation',
      ArtifactKind: 'slides',
      ContextLabel: slide
        ? `Slide ${slide.SlideNumber}: ${slide.Title}${targetRegion ? ' · ' + targetRegion.Label : ''}`
        : 'Presentation',
      SelectedContent: targetRegion?.MarkdownContent || slide?.Title || '',
      SuggestingModeDefault: true,
      TargetSlideID: slide?.SlideID,
      ApplySuggestion: (proposedText: string, _asSuggestion: boolean) => {
        if (!proposedText.trim() || !slide) {
          return;
        }
        if (targetRegion) {
          this.applySingleSlideRegionPatch(slide.SlideID, {
            RegionID: targetRegion.RegionID,
            MarkdownContent: proposedText.trim(),
          });
          this.StatusBannerMessage = `Applied AI Assistant draft to Slide ${slide.SlideNumber} (${targetRegion.Label}).`;
        } else {
          this.applySingleSlideMetadataPatch(slide.SlideID, { Title: proposedText.trim() });
        }
        this.cdr.markForCheck();
      },
    });
  }

  private applySingleSlideMetadataPatch(
    slideId: string,
    patch: Parameters<typeof SlideDeckEngine.Instance.UpdateSlideMetadata>[2],
  ): void {
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (targetSlide) {
      const check = SlideDeckEngine.Instance.CanActorEditSlide(
        targetSlide,
        userId,
        ownerId,
        this.IsEditable,
      );
      if (!check.Allowed) {
        this.StatusBannerMessage = check.Reason || 'This slide is locked.';
        this.cdr.markForCheck();
        return;
      }
    }
    const { Deck: updatedDeck, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(
      this.Deck,
      slideId,
      patch,
      {
        ActorUserID: userId,
        OwnerUserID: ownerId,
        IsEditor: this.IsEditable,
      },
    );
    if (!UpdatedSlide) {
      return;
    }
    this.Deck = updatedDeck;
    this.session?.UpdateSlideInDeck(UpdatedSlide, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  /**
   * Updates ONLY the targeted region on `slideId` and broadcasts the single-slide update via
   * `session.UpdateSlideInDeck` (`Accept #1`).
   */
  private applySingleSlideRegionPatch(
    slideId: string,
    regionPatch: Partial<SlideRegionSpec> & { RegionID: string },
  ): void {
    const targetSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    const targetRegion = targetSlide?.Regions.find((r) => r.RegionID === regionPatch.RegionID);
    const userId = this.getSafeCurrentUser()?.ID ?? null;
    const ownerId = this.resolveArtifactOwnerUserId(userId);
    if (targetSlide && targetRegion) {
      const check = SlideDeckEngine.Instance.CanActorEditRegion(
        targetSlide,
        targetRegion,
        userId,
        ownerId,
        this.IsEditable,
      );
      if (!check.Allowed) {
        this.StatusBannerMessage = check.Reason || 'This slide region is locked.';
        this.cdr.markForCheck();
        return;
      }
    }
    const { Deck: updatedDeck, UpdatedRegion } = SlideDeckEngine.Instance.UpsertSlideRegion(
      this.Deck,
      slideId,
      regionPatch,
      this.buildLockContext(),
    );
    if (!UpdatedRegion) {
      return;
    }
    this.Deck = updatedDeck;
    const updatedSlide = this.Deck.Slides.find((s) => s.SlideID === slideId);
    if (updatedSlide) {
      this.session?.UpdateSlideInDeck(updatedSlide, this.Deck);
    }
    this.syncRawDeckJson();
    this.cdr.markForCheck();
  }

  private destroyCollaborationSession(): void {
    this.stopPresenterTimer();
    if (this.pendingVersionSaveTimer) {
      clearTimeout(this.pendingVersionSaveTimer);
      this.pendingVersionSaveTimer = null;
    }
    this.IsSavingVersion = false;
    this.HasPendingResetConflict = false;
    for (const s of this.subs) {
      s.unsubscribe();
    }
    this.subs.length = 0;
    if (this.permissionUnsub) {
      this.permissionUnsub();
      this.permissionUnsub = null;
    }
    if (this.session) {
      this.session.Destroy();
      this.session = null;
    }
  }

  private initializePresentationFromArtifactVersion(): void {
    this.destroyCollaborationSession();
    this.blockResultsByBlockId.clear();
    this.driftLiveResultsByBlockId.clear();
    this.embeddedArtifactVersions.clear();
    this.inFlightEmbeddedVersionKeys.clear();
    this.failedEmbeddedVersionMessages.clear();
    this.AnchoredThreads = [];
    this.SharedSuggestions = [];
    this.ResolvedPermissions = null;
    this.artifactOwnerUserId = null;
    this.ConnectionStatus = 'local';
    this.isRawJsonDirty = false;
    this.RawJsonErrorMessage = '';
    this.RawJsonRemoteConflictPending = false;
    this.pendingRemoteDeckJson = null;

    const rawContent = this.extractArtifactVersionContent();
    const fallbackTitle = this.artifactVersion?.Name || 'Executive Strategy Presentation';
    const artifactId = this.artifactVersion?.ArtifactID || 'slide-deck-default';
    this.CurrentVersionNumber = this.artifactVersion?.VersionNumber || 1;

    this.Deck = SlideDeckEngine.Instance.ParseDeckSpec(rawContent, fallbackTitle, artifactId);
    this.ActiveSlideID = this.Deck.Slides[0]?.SlideID ?? 'slide-1';
    this.FocusedRegionID = this.Deck.Slides[0]?.Regions[0]?.RegionID ?? 'main';
    this.PendingAnchorKey = `${this.ActiveSlideID}:${this.FocusedRegionID}`;
    this.PendingAnchorLabel = `Slide 1 · ${this.Deck.Slides[0]?.Regions[0]?.Label ?? 'Primary Content'}`;

    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    this.RawDeckJsonText = serialized;
    this.BaselineDeckJsonText = serialized;
    this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);

    const gen = ++this.sessionInitGeneration;
    this.restoreWorkspacePreferences();
    this.setupCollaborationSession(artifactId, serialized);
    this.syncSharedSuggestionsFromSession();
    this.refreshDriftSummariesForActiveSlide();
    if (this.SyncViewMode !== undefined) {
      this.onViewerViewModeChanged(this.SyncViewMode);
    }
    if (this.NavigationAnchor) {
      this.onNavigationAnchorChanged(this.NavigationAnchor);
    }
    if (!this.isGuestSnapshotMode) {
      void this.resolveViewerPermissionsAndThreads(gen);
      void this.refreshLatestWorkbookVersionsForDeck(this.Deck, gen);
    }
    void this.executeAllLiveBlocksInDeck(this.Deck);
  }

  private setupCollaborationSession(artifactId: string, initialSerializedDeck: string): void {
    this.liveSyncUnavailable = false;
    if (this.session) {
      for (const s of this.subs) {
        s.unsubscribe();
      }
      this.subs.length = 0;
      this.session.Destroy();
      this.session = null;
    }

    const provider = this.getSafeProvider();
    const user = this.getCurrentUserSummary();
    const hasRemoteBackend =
      !this.isGuestSnapshotMode &&
      this.collabService.HasCollaborationBackend(provider, this.CollaborationWsUrl);

    this.session = this.collabService.CreateSession(
      artifactId,
      initialSerializedDeck,
      { id: user.ID, name: user.Name, email: user.Email },
      this.hasPermissionToEdit,
      hasRemoteBackend,
    );
    this.liveSyncUnavailable = Boolean(this.session.LiveSyncUnavailable);

    this.subs.push(
      this.session.OnLiveSyncUnavailable$.subscribe((unavailable) => {
        if (this.isComponentDestroyed) {
          return;
        }
        const changed = this.liveSyncUnavailable !== unavailable;
        this.liveSyncUnavailable = unavailable;
        if (changed) {
          this.cdr.detectChanges();
        } else {
          this.cdr.markForCheck();
        }
      }),
      this.session.ContentChanged$.subscribe((nextContent) => {
        if (!nextContent || !nextContent.trim()) {
          return;
        }
        const parsed = SlideDeckEngine.Instance.ParseDeckSpec(
          nextContent,
          this.Deck.Title,
          this.Deck.DeckID,
        );
        this.Deck = parsed;
        if (!this.Deck.Slides.some((s) => s.SlideID === this.ActiveSlideID)) {
          this.ActiveSlideID = this.Deck.Slides[0]?.SlideID ?? 'slide-1';
        }
        const serializedRemote = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
        if (this.WorkspaceMode === 'source' && this.isRawJsonDirty) {
          this.RawJsonRemoteConflictPending = true;
          this.pendingRemoteDeckJson = serializedRemote;
        } else {
          this.RawDeckJsonText = serializedRemote;
        }
        this.refreshDriftSummariesForActiveSlide();
        this.cdr.markForCheck();
      }),
      this.session.StatusChanged$.subscribe((status) => {
        this.ConnectionStatus = status;
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
      this.session.VersionSaved$.subscribe(({ versionNumber }) => {
        if (this.pendingVersionSaveTimer) {
          clearTimeout(this.pendingVersionSaveTimer);
          this.pendingVersionSaveTimer = null;
        }
        this.IsSavingVersion = false;
        const isNewSavedVersion = versionNumber > this.LastSavedVersionNumber;
        this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
        this.LastSavedVersionNumber = versionNumber;
        this.CurrentVersionNumber = versionNumber;
        if (isNewSavedVersion) {
          this.ContentCommitted.emit(SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck));
        }
        this.cdr.markForCheck();
      }),
      this.session.RoomResetConflict$.subscribe((conflict) => {
        if (this.isComponentDestroyed) {
          return;
        }
        this.HasPendingResetConflict = conflict !== null;
        this.cdr.markForCheck();
      }),
      this.session.SuggestionsChanged$.subscribe(() => {
        if (this.isComponentDestroyed) {
          return;
        }
        this.syncSharedSuggestionsFromSession();
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
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
  }

  public ApplyPendingResetConflictDraft(): void {
    if (!this.session) {
      this.HasPendingResetConflict = false;
      return;
    }
    this.session.ApplyResetConflictDraft();
    this.HasPendingResetConflict = false;
    const latest = this.session.GetContent();
    if (latest) {
      this.Deck = SlideDeckEngine.Instance.ParseDeckSpec(latest, this.Deck.Title, this.Deck.DeckID);
      this.syncRawDeckJson();
      this.refreshDriftSummariesForActiveSlide();
    }
    this.StatusBannerMessage = 'Restored local unsaved edits after collaboration room reset.';
    this.cdr.markForCheck();
  }

  public DismissPendingResetConflictDraft(): void {
    this.session?.DismissResetConflictDraft();
    this.HasPendingResetConflict = false;
    this.cdr.markForCheck();
  }

  public IsInlineOleArtifactBlock(block: DocumentBlockSpec): boolean {
    if (block.Kind !== 'Artifact') {
      return false;
    }
    if (block.SheetChartID || block.SheetRange) {
      return false;
    }
    return true;
  }

  private async executeAllLiveBlocksInDeck(
    deck: SlideDeckSpec,
    forceLiveRefresh = false,
  ): Promise<void> {
    if (!this.isGuestSnapshotMode) {
      void this.refreshLatestWorkbookVersionsForDeck(deck, this.sessionInitGeneration);
    }
    for (const slide of deck.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (block && !this.IsInlineOleArtifactBlock(block)) {
          if (this.isGuestSnapshotMode && block.Mode !== 'Frozen') {
            continue;
          }
          const effectiveBlock: DocumentBlockSpec =
            forceLiveRefresh && !this.isGuestSnapshotMode
              ? { ...block, Mode: 'Live' }
              : block;
          await this.ExecuteSlideRegionBlock(region, effectiveBlock, slide.SlideID);
        }
      }
    }
    this.refreshDriftSummariesForActiveSlide();
    this.cdr.markForCheck();
  }

  private async refreshLatestWorkbookVersionsForDeck(
    deck: SlideDeckSpec,
    gen = this.sessionInitGeneration,
  ): Promise<void> {
    if (this.isGuestSnapshotMode) {
      return;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      return;
    }
    const referencedArtifactIds = new Set<string>();
    const pinnedPairs: Array<{ ArtifactID: string; VersionID: string }> = [];
    for (const slide of deck.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (!block || block.Kind !== 'Artifact' || !block.ArtifactID) {
          continue;
        }
        const artId = block.ArtifactID.trim();
        if (!IsValidUUID(artId)) {
          continue;
        }
        referencedArtifactIds.add(artId);
        if (block.VersionID && IsValidUUID(block.VersionID)) {
          pinnedPairs.push({ ArtifactID: artId, VersionID: block.VersionID.trim() });
        }
      }
    }
    if (referencedArtifactIds.size === 0) {
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const idFilter = Array.from(referencedArtifactIds)
        .map((id) => `'${EscapeSQLString(id)}'`)
        .join(',');
      const res = await rv.RunView<MJArtifactVersionEntity>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID IN (${idFilter})`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: Math.max(50, referencedArtifactIds.size * 10),
          ResultType: 'entity_object',
        },
        user,
      );
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      if (res.Success && Array.isArray(res.Results)) {
        const seenLatest = new Set<string>();
        const pinnedPairKeys = new Set(
          pinnedPairs.map((p) => `${NormalizeUUID(p.ArtifactID)}:${NormalizeUUID(p.VersionID)}`),
        );
        for (const ver of res.Results) {
          const normArtId = NormalizeUUID(ver.ArtifactID);
          if (!normArtId) continue;
          if (!seenLatest.has(normArtId)) {
            seenLatest.add(normArtId);
            this.latestWorkbookVersions.set(normArtId, ver);
          }
          if (pinnedPairKeys.has(`${normArtId}:${NormalizeUUID(ver.ID)}`)) {
            this.cacheEmbeddedVersionEntity(normArtId, ver);
          }
        }
      }
      for (const pair of pinnedPairs) {
        const key = this.getEmbeddedVersionCacheKey(pair.ArtifactID, pair.VersionID);
        if (!this.embeddedArtifactVersions.has(key)) {
          const pinRes = await rv.RunView<MJArtifactVersionEntity>(
            {
              EntityName: 'MJ: Artifact Versions',
              ExtraFilter: `ID='${EscapeSQLString(pair.VersionID)}'`,
              MaxRows: 1,
              ResultType: 'entity_object',
            },
            user,
          );
          if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
            return;
          }
          const pinnedEntity = pinRes.Success ? pinRes.Results?.[0] : undefined;
          if (pinnedEntity) {
            this.cacheEmbeddedVersionEntity(pair.ArtifactID, pinnedEntity);
          }
        }
      }
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
    }
  }

  private syncRawDeckJson(): void {
    this.RawDeckJsonText = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    if (this.WorkspaceMode === 'diff') {
      this.recomputeDiff();
    }
  }

  private recomputeDiff(): void {
    const currentJson = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    this.CurrentDiff = this.collabService.ComputeLineDiff(this.BaselineDeckJsonText, currentJson);
  }

  private startPresenterTimer(resetElapsed = true): void {
    this.stopPresenterTimer();
    if (resetElapsed) {
      this.PresenterElapsedSeconds = 0;
    }
    this.presenterTimerHandle = setInterval(() => {
      this.PresenterElapsedSeconds++;
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopPresenterTimer(): void {
    if (this.presenterTimerHandle) {
      clearInterval(this.presenterTimerHandle);
      this.presenterTimerHandle = null;
    }
  }

  private extractArtifactVersionContent(): string {
    if (!this.artifactVersion) {
      return '';
    }
    if (typeof this.artifactVersion.Content === 'string' && this.artifactVersion.Content.trim()) {
      return this.artifactVersion.Content;
    }
    return '';
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

  private getSafeCurrentUser(): UserInfo | null {
    try {
      return this.getSafeProvider()?.CurrentUser ?? null;
    } catch {
      return null;
    }
  }

  private getCurrentUserSummary(): { ID: string; Name: string; Email: string } {
    const user = this.getSafeCurrentUser();
    if (user) {
      return {
        ID: user.ID,
        Name: user.Name || user.Email || 'Collaborator',
        Email: user.Email || '',
      };
    }
    return {
      ID: 'local-user',
      Name: 'Collaborator',
      Email: '',
    };
  }

  private resolveArtifactsEntityId(provider: IMetadataProvider): string | undefined {
    return provider.EntityByName('MJ: Artifacts')?.ID;
  }

  private async resolveArtifactTypeId(
    provider: IMetadataProvider,
    typeName: string,
    user: UserInfo,
  ): Promise<string | undefined> {
    const metadataEngine = ArtifactMetadataEngine.GetProviderInstance(
      provider,
      ArtifactMetadataEngine,
    ) as ArtifactMetadataEngine;
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

  public RetryVerifyPermissions(): void {
    void this.resolveViewerPermissionsAndThreads(this.sessionInitGeneration);
  }

  private async resolveViewerPermissionsAndThreads(gen = this.sessionInitGeneration): Promise<void> {
    if (this.isGuestSnapshotMode) {
      this.ResolvedPermissions = null;
      this.AccessRevoked = false;
      this.PermissionVerifyError = false;
      this.ConnectionStatus = 'readonly';
      this.session?.SetCanEdit(false);
      this.cdr.markForCheck();
      return;
    }
    const persistedArtifactId = this.artifactVersion?.ArtifactID;
    if (!persistedArtifactId) {
      this.cdr.markForCheck();
      return;
    }

    const provider = this.getSafeProvider();
    const currentUser = this.getSafeCurrentUser();
    if (!provider || !currentUser) {
      this.ResolvedPermissions = null;
      this.AccessRevoked = false;
      this.PermissionVerifyError = false;
      this.ConnectionStatus = 'readonly';
      this.session?.SetCanEdit(false);
      this.cdr.markForCheck();
      return;
    }

    try {
      const perms = await this.collabService.ResolvePermissionsFromServer(
        persistedArtifactId,
        provider,
      );
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      this.ResolvedPermissions = perms;
      if (perms?.Source === 'Owner') {
        this.artifactOwnerUserId = currentUser.ID;
      } else if (perms?.CanRead) {
        await this.resolveArtifactOwnerFromProvider(persistedArtifactId, currentUser, provider, gen);
        if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
          return;
        }
      } else {
        this.artifactOwnerUserId = null;
      }
      if (!perms) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = false;
        this.ConnectionStatus = 'readonly';
        this.session?.SetCanEdit(false);
      } else if (perms.PermissionVerifyError) {
        this.AccessRevoked = false;
        this.PermissionVerifyError = true;
        this.ConnectionStatus = 'readonly';
        this.session?.SetCanEdit(false);
        if (this.WorkspaceMode === 'edit' || this.WorkspaceMode === 'source') {
          this.EnterPresentationMode('present');
        }
      } else if (!perms.CanRead) {
        this.PermissionVerifyError = false;
        this.AccessRevoked = true;
        this.ConnectionStatus = 'revoked';
        this.session?.SetCanEdit(false);
        if (this.WorkspaceMode === 'edit' || this.WorkspaceMode === 'source') {
          this.EnterPresentationMode('present');
        }
      } else if (!perms.CanEdit) {
        this.PermissionVerifyError = false;
        this.AccessRevoked = false;
        this.ConnectionStatus = 'readonly';
        this.session?.SetCanEdit(false);
      } else {
        this.PermissionVerifyError = false;
        this.AccessRevoked = false;
        const effectiveCanEdit = !this.readonly && !this.LiveSyncUnavailable;
        if (this.session) {
          this.session.SetCanEdit(effectiveCanEdit);
          this.ConnectionStatus = this.session.Status;
        } else {
          this.ConnectionStatus = effectiveCanEdit ? 'local' : 'readonly';
        }
        if (this.SyncViewMode !== undefined) {
          this.onViewerViewModeChanged(this.SyncViewMode);
        }
      }
    } catch (err) {
      LogError(err);
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      this.ResolvedPermissions = null;
      this.AccessRevoked = false;
      this.PermissionVerifyError = true;
      this.ConnectionStatus = 'readonly';
      this.session?.SetCanEdit(false);
    }

    if (!this.isComponentDestroyed) {
      this.cdr.detectChanges();
    }

    if (this.permissionUnsub) {
      this.permissionUnsub();
      this.permissionUnsub = null;
    }
    this.permissionUnsub = ArtifactPermissionEngine.Instance.OnPermissionsChanged(async (evt) => {
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
        return;
      }
      if (UUIDsEqual(evt.ArtifactID, persistedArtifactId)) {
        try {
          const updated = await this.collabService.ResolvePermissionsFromServer(
            persistedArtifactId,
            provider,
          );
          if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
            return;
          }
          this.ResolvedPermissions = updated;
          if (updated?.Source === 'Owner') {
            this.artifactOwnerUserId = currentUser.ID;
          } else if (updated?.CanRead) {
            await this.resolveArtifactOwnerFromProvider(persistedArtifactId, currentUser, provider, gen);
            if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
              return;
            }
          } else {
            this.artifactOwnerUserId = null;
          }
          if (!updated) {
            this.AccessRevoked = false;
            this.PermissionVerifyError = false;
            this.ConnectionStatus = 'readonly';
            this.session?.SetCanEdit(false);
          } else if (updated.PermissionVerifyError) {
            this.AccessRevoked = false;
            this.PermissionVerifyError = true;
            this.ConnectionStatus = 'readonly';
            this.session?.SetCanEdit(false);
            if (this.WorkspaceMode === 'edit' || this.WorkspaceMode === 'source') {
              this.EnterPresentationMode('present');
            }
          } else if (!updated.CanRead) {
            this.PermissionVerifyError = false;
            this.AccessRevoked = true;
            this.ConnectionStatus = 'revoked';
            this.session?.SetCanEdit(false);
            if (this.WorkspaceMode === 'edit' || this.WorkspaceMode === 'source') {
              this.EnterPresentationMode('present');
            }
          } else if (!updated.CanEdit) {
            this.PermissionVerifyError = false;
            this.AccessRevoked = false;
            this.ConnectionStatus = 'readonly';
            this.session?.SetCanEdit(false);
          } else {
            this.PermissionVerifyError = false;
            this.AccessRevoked = false;
            const effectiveCanEdit = !this.readonly && !this.LiveSyncUnavailable;
            if (this.session) {
              this.session.SetCanEdit(effectiveCanEdit);
              this.ConnectionStatus = this.session.Status;
            } else {
              this.ConnectionStatus = effectiveCanEdit ? 'local' : 'readonly';
            }
          }
          this.cdr.markForCheck();
        } catch (err) {
          LogError(err);
          this.AccessRevoked = false;
          this.PermissionVerifyError = true;
          this.ConnectionStatus = 'readonly';
          this.session?.SetCanEdit(false);
          this.cdr.markForCheck();
        }
      }
    });

    await this.hydrateAnchoredSlideThreadsFromServer(persistedArtifactId, currentUser, provider, gen);
    if (this.isComponentDestroyed || gen !== this.sessionInitGeneration) {
      return;
    }
    this.cdr.markForCheck();
  }

  private async resolveArtifactOwnerFromProvider(
    artifactId: string,
    user: UserInfo,
    provider: IMetadataProvider,
    gen: number,
  ): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const artRes = await rv.RunView<{ ID: string; UserID?: string }>(
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
      this.artifactOwnerUserId = artRes.Success ? (artRes.Results?.[0]?.UserID ?? null) : null;
    } catch {
      // Leave null on query failure so non-owners never elevate to owner privileges
    }
  }

  private async hydrateAnchoredSlideThreadsFromServer(
    artifactId: string,
    user: UserInfo,
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
        IsResolved?: boolean | null;
        IsArchived?: boolean | null;
        __mj_CreatedAt?: string;
      }>(
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `LinkedEntityID='${EscapeSQLString(artifactEntityId)}' AND LinkedRecordID='${EscapeSQLString(artifactId)}' AND AnchorType='SlideRegion'`,
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

      const readableRows = await FilterReadableAnchoredConversations(provider, user, rawRows);
      if (this.isComponentDestroyed || gen !== this.sessionInitGeneration || readableRows.length === 0) {
        return;
      }

      const convIds = readableRows
        .filter((c) => Boolean(c.ID))
        .map((c) => `'${EscapeSQLString(c.ID)}'`);
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
            OrderBy: '__mj_CreatedAt DESC',
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
        for (const list of detailsByConv.values()) {
          list.reverse();
        }
      }

      this.AnchoredThreads = readableRows.map((c) => {
        const meta = c.AnchorMetadata
          ? (SafeJSONParse<{
              slideId?: string;
              regionId?: string;
              anchorDisplayName?: string;
              quotedText?: string;
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

        const isResolved =
          Boolean(c.IsResolved) || Boolean(c.IsArchived) || meta.status === 'Resolved';
        return {
          ConversationID: c.ID,
          AnchorKey: c.AnchorKey || `${this.ActiveSlideID}:main`,
          AnchorLabel:
            meta.anchorDisplayName ||
            c.Name.replace(/^SlideComment:\s*/i, () => '') ||
            c.AnchorKey ||
            'Slide Region',
          QuotedText: meta.quotedText || '',
          Status: isResolved ? 'Resolved' : 'Open',
          AgentMode: meta.agentMode === 'suggest' ? 'suggest' : 'edit',
          CreatedAt: c.__mj_CreatedAt ?? new Date().toISOString(),
          Messages: msgs,
        };
      });
    } catch (err) {
      LogError(err);
    }
  }

  private async createDelegatedWhiteboardArtifact(
    name: string,
  ): Promise<{ artifact: MJArtifactEntity; version: MJArtifactVersionEntity } | null> {
    const hostArtifactId = this.artifactVersion?.ArtifactID;
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!hostArtifactId || !provider || !user) {
      this.notifyError('Cannot create embedded Whiteboard: host presentation must be saved with an active provider.');
      return null;
    }

    try {
      const artifactEntityId = this.resolveArtifactsEntityId(provider);
      if (!artifactEntityId) {
        this.notifyError('Cannot create embedded Whiteboard: MJ: Artifacts entity metadata unavailable.');
        return null;
      }

      const rv = RunView.FromMetadataProvider(provider);
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
        this.resolveArtifactTypeId(provider, 'Whiteboard', user),
      ]);

      if (!wbTypeId) {
        this.notifyError('Artifact type "Whiteboard" could not be resolved.');
        return null;
      }

      const hostEnvId = hostArtRes.Success ? hostArtRes.Results?.[0]?.EnvironmentID : undefined;
      const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
      artifact.NewRecord();
      artifact.UserID = user.ID;
      artifact.Name = name;
      artifact.Description = 'Inline Whiteboard embedded in MJ Slides presentation';
      artifact.TypeID = wbTypeId;
      if (hostEnvId) {
        artifact.EnvironmentID = hostEnvId;
      }
      artifact.DelegateEntityID = artifactEntityId;
      artifact.DelegateRecordID = hostArtifactId;

      const artSaved = await artifact.Save();
      if (!artSaved || !artifact.ID) {
        const msg = artifact.LatestResult?.Message || 'Failed to save embedded Whiteboard artifact.';
        LogError(msg);
        this.notifyError(msg);
        return null;
      }

      const emptyWhiteboardJson = JSON.stringify({
        version: 1,
        activePageId: 'page-1',
        pages: [{ id: 'page-1', name: 'Page 1', items: [] }],
      });

      const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.UserID = user.ID;
      ver.ArtifactID = artifact.ID;
      ver.VersionNumber = 1;
      ver.Name = artifact.Name;
      ver.Content = emptyWhiteboardJson;
      const wbConfig = BuildArtifactVersionConfigurationWithPreview(
        null,
        emptyWhiteboardJson,
        null,
        artifact.Name,
      );
      if (wbConfig) {
        ver.Configuration = wbConfig;
      }

      const verSaved = await ver.Save();
      if (!verSaved || !ver.ID) {
        const msg = ver.LatestResult?.Message || 'Failed to save initial Whiteboard version.';
        LogError(msg);
        this.notifyError(msg);
        return null;
      }

      this.cacheEmbeddedVersionEntity(artifact.ID, ver);
      return { artifact, version: ver };
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to create embedded Whiteboard.');
      return null;
    }
  }

  private async saveArtifactVersionViaProvider(
    capturedThumbnailDataUrl?: string | null,
    policy?: ArtifactTypeThumbnailPolicy,
  ): Promise<void> {
    const serializedContent = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    const artifactId = this.artifactVersion?.ArtifactID;
    if (!artifactId) {
      this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
      this.LastSavedVersionNumber = this.CurrentVersionNumber + 1;
      this.CurrentVersionNumber = this.LastSavedVersionNumber;
      this.ContentCommitted.emit(serializedContent);
      this.cdr.markForCheck();
      return;
    }

    if (this.isGuestSnapshotMode) {
      return;
    }

    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.notifyError('Cannot save presentation version: metadata provider or user context unavailable.');
      return;
    }

    const serverCommit = await this.collabService.CommitInlineEditOnServer(
      artifactId,
      serializedContent,
      true,
      provider,
      capturedThumbnailDataUrl,
    );
    if (serverCommit.HandledByServer) {
      if (!serverCommit.Success) {
        this.notifyError(serverCommit.ErrorMessage || 'Failed to save presentation version on server.');
        return;
      }
      this.session?.AdoptOutOfBandCommittedContent(serializedContent);
      const nextVerNum =
        serverCommit.VersionNumber ??
        Math.max(this.CurrentVersionNumber, this.LastSavedVersionNumber) + 1;
      this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
      this.CurrentVersionNumber = nextVerNum;
      this.LastSavedVersionNumber = nextVerNum;
      this.StatusBannerMessage = `Saved presentation version v${nextVerNum}.`;
      this.ContentCommitted.emit(serializedContent);
      this.cdr.markForCheck();
      return;
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
      const nextVerNum = Math.max(dbMax, this.CurrentVersionNumber, this.LastSavedVersionNumber) + 1;

      const ver = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.UserID = user.ID;
      ver.ArtifactID = artifactId;
      ver.VersionNumber = nextVerNum;
      ver.Name = this.Deck.Title || this.artifactVersion?.Name || 'Presentation';
      ver.Content = serializedContent;
      const deckConfig = BuildArtifactVersionConfigurationWithPreview(
        ReadArtifactVersionConfigurationSafe(this.artifactVersion),
        serializedContent,
        'SlideDeckArtifactViewerPlugin',
        ver.Name,
        {
          Policy: policy,
          CapturedThumbnailDataUrl: capturedThumbnailDataUrl,
        },
      );
      if (deckConfig) {
        ver.Configuration = deckConfig;
      }
      const saved = await ver.Save();
      if (!saved) {
        const msg = ver.LatestResult?.Message || 'Failed to save presentation version.';
        LogError(msg);
        this.notifyError(msg);
        return;
      }
      this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
      this.CurrentVersionNumber = nextVerNum;
      this.LastSavedVersionNumber = nextVerNum;
      this.StatusBannerMessage = `Saved presentation version v${nextVerNum}.`;
      this.ContentCommitted.emit(serializedContent);
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to save presentation version.');
    }
  }

  private async persistAnchoredSlideThread(thread: DocumentAnchoredThread): Promise<boolean> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!artifactId || !provider || !user) {
      this.notifyError('Cannot save slide comment: metadata provider or user context unavailable.');
      return false;
    }

    try {
      const artifactEntityId = this.resolveArtifactsEntityId(provider);
      if (!artifactEntityId) {
        this.notifyError('Cannot save slide comment: MJ: Artifacts entity metadata unavailable.');
        return false;
      }
      const parsedAnchor = this.parseSlideRegionAnchorKey(thread.AnchorKey);
      const slideId = parsedAnchor.SlideID;
      const regionId = parsedAnchor.RegionID;

      const conv = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
      conv.NewRecord();
      conv.UserID = user.ID;
      conv.Name = `SlideComment: ${thread.AnchorLabel} (${thread.AnchorKey})`;
      conv.Status = 'Available';
      conv.LinkedEntityID = artifactEntityId;
      conv.LinkedRecordID = artifactId;
      conv.AnchorType = 'SlideRegion';
      conv.AnchorKey = thread.AnchorKey;
      conv.IsResolved = thread.Status === 'Resolved';
      conv.IsArchived = thread.Status === 'Resolved';
      conv.AnchorMetadata = JSON.stringify({
        slideId: slideId || this.ActiveSlideID,
        regionId: regionId || this.FocusedRegionID,
        anchorDisplayName: thread.AnchorLabel,
        quotedText: thread.QuotedText,
        agentMode: thread.AgentMode,
        status: thread.Status,
      });

      const convSaved = await conv.Save();
      if (!convSaved || !conv.ID) {
        const msg = conv.LatestResult?.Message || 'Failed to save slide comment conversation.';
        LogError(msg);
        this.notifyError(msg);
        return false;
      }

      thread.ConversationID = conv.ID;
      for (const msg of thread.Messages) {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
          'MJ: Conversation Details',
          user,
        );
        detail.NewRecord();
        detail.ConversationID = conv.ID;
        detail.UserID = user.ID;
        detail.Message = msg.Message;
        detail.Role = 'User';
        const detailSaved = await detail.Save();
        if (!detailSaved) {
          const errMsg = detail.LatestResult?.Message || 'Failed to save slide comment detail.';
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
      this.notifyError(err instanceof Error ? err.message : 'Failed to save slide comment.');
      return false;
    }
  }

  private async persistThreadStatusUpdateIfPossible(thread: DocumentAnchoredThread): Promise<boolean> {
    if (!this.artifactVersion?.ArtifactID) {
      return true;
    }
    const provider = this.getSafeProvider();
    const user = this.getSafeCurrentUser();
    if (!provider || !user) {
      this.notifyError('Cannot update comment resolution: metadata provider or user context unavailable.');
      return false;
    }
    try {
      const parsedAnchor = this.parseSlideRegionAnchorKey(thread.AnchorKey);
      const slideId = parsedAnchor.SlideID;
      const regionId = parsedAnchor.RegionID;
      const conv = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
      const loaded = await conv.Load(thread.ConversationID);
      if (!loaded) {
        return false;
      }
      conv.IsResolved = thread.Status === 'Resolved';
      conv.IsArchived = thread.Status === 'Resolved';
      conv.AnchorMetadata = JSON.stringify({
        slideId: slideId || this.ActiveSlideID,
        regionId: regionId || this.FocusedRegionID,
        anchorDisplayName: thread.AnchorLabel,
        quotedText: thread.QuotedText,
        agentMode: thread.AgentMode,
        status: thread.Status,
      });
      const ok = await conv.Save();
      if (!ok) {
        const msg = conv.LatestResult?.Message || 'Failed to update comment resolution status.';
        LogError(msg);
        this.notifyError(msg);
      }
      return ok;
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to update comment resolution status.');
      return false;
    }
  }

  private restoreWorkspacePreferences(): void {
    const artifactId = this.artifactVersion?.ArtifactID || 'default';
    const raw = UserInfoEngine.Instance.GetSetting(
      `${SlideDeckArtifactViewerComponent.USER_SETTING_PREFIX}${artifactId}`,
    );
    if (raw) {
      const parsed = SafeJSONParse<{
        showFilmstrip?: boolean;
        rightDrawerTab?: SlideRightDrawerTab;
      }>(raw);
      if (parsed) {
        if (typeof parsed.showFilmstrip === 'boolean') {
          this.ShowFilmstrip = parsed.showFilmstrip;
        }
        if (parsed.rightDrawerTab) {
          this.RightDrawerTab = parsed.rightDrawerTab;
        }
      }
    }
  }

  private persistWorkspacePreferences(): void {
    const artifactId = this.artifactVersion?.ArtifactID || 'default';
    void UserInfoEngine.Instance.SetSettingDebounced(
      `${SlideDeckArtifactViewerComponent.USER_SETTING_PREFIX}${artifactId}`,
      JSON.stringify({
        showFilmstrip: this.ShowFilmstrip,
        rightDrawerTab: this.RightDrawerTab,
      }),
    );
  }

  private getSyncChannelName(): string {
    const key = this.artifactVersion?.ArtifactID || this.Deck.DeckID || 'default';
    return `mj-slides-sync-${key}`;
  }

  private ensureFullscreenListener(): void {
    if (this.fullscreenChangeHandler || typeof document === 'undefined') {
      return;
    }
    this.fullscreenChangeHandler = () => {
      const activeFullscreen = Boolean(document.fullscreenElement);
      const wasFullscreen = this.IsBrowserFullscreen;
      this.IsBrowserFullscreen = activeFullscreen;
      if (wasFullscreen && !activeFullscreen && this.WorkspaceMode === 'present') {
        this.ExitPresentationMode();
        return;
      }
      this.cdr.markForCheck();
    };
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
  }

  private requestShellFullscreen(): void {
    const hostEl = this.hostElRef?.nativeElement ?? null;
    const shell = hostEl?.querySelector<HTMLElement>('.mj-slides-shell') ?? hostEl;
    if (shell && typeof shell.requestFullscreen === 'function') {
      try {
        const res = shell.requestFullscreen();
        if (res && typeof (res as Promise<void>).then === 'function') {
          void (res as Promise<void>).then(
            () => {
              this.IsBrowserFullscreen = true;
              this.cdr.markForCheck();
            },
            () => undefined,
          );
        }
      } catch {
        // Non-user-gesture or headless browser environment without Fullscreen support
      }
    }
  }

  private exitShellFullscreen(): void {
    if (typeof document !== 'undefined' && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      try {
        void document.exitFullscreen().catch(() => undefined);
      } catch {
        // Ignore exit failures in headless environments
      }
    }
    this.IsBrowserFullscreen = false;
  }

  private ensureBroadcastChannel(): void {
    if (this.audienceChannel || typeof BroadcastChannel === 'undefined') {
      return;
    }
    try {
      this.audienceChannel = new BroadcastChannel(this.getSyncChannelName());
      this.audienceChannel.onmessage = (event: MessageEvent<{ type?: string; slideId?: string }>) => {
        const msg = event?.data;
        if (!msg) return;
        if (msg.type === 'audience-ready') {
          this.broadcastPresentationState();
        } else if (msg.type === 'select-slide' && typeof msg.slideId === 'string') {
          this.SelectSlide(msg.slideId);
        }
      };
    } catch {
      this.audienceChannel = null;
    }
  }

  private broadcastPresentationState(): void {
    const hasOpenPopout = Boolean(this.popoutAudienceWindow && !this.popoutAudienceWindow.closed);
    if (!this.audienceChannel && !hasOpenPopout) {
      return;
    }
    const slide = this.DisplayedSlide;
    if (!slide) {
      return;
    }
    const theme = this.SafeTheme;
    const payload: AudienceStagePayload = {
      type: 'state',
      presenting: this.IsPresentationActive,
      slideNumber: this.ActiveSlideIndex + 1,
      slideCount: this.ActiveDeckForDisplay.Slides.length,
      layout: slide.Layout,
      title: slide.Title,
      subtitle: slide.Subtitle || '',
      overlayMode: this.PresentationOverlayMode,
      revealStep: this.CurrentRevealStep,
      maxRevealStep: this.MaxRevealStepOnDisplayedSlide,
      laserActive: this.LaserPointerActive,
      laserX: this.LaserPointerX,
      laserY: this.LaserPointerY,
      footerText: this.ActiveDeckForDisplay.Master.FooterText || '',
      theme,
      regions: (slide.Regions ?? []).map((r) => ({
        RegionID: r.RegionID,
        Label: r.Label,
        Kind: r.Kind,
        MarkdownContent: r.MarkdownContent,
        BigNumberValue: r.BigNumberValue || '',
        BigNumberLabel: r.BigNumberLabel || '',
        BigNumberDelta: r.BigNumberDelta || '',
        QuoteAttribution: r.QuoteAttribution || '',
        RevealStep: r.RevealStep ?? 0,
      })),
    };
    if (this.audienceChannel) {
      try {
        this.audienceChannel.postMessage(payload);
      } catch {
        // Channel may have closed externally
      }
    }
    if (hasOpenPopout && this.popoutAudienceWindow) {
      try {
        renderAudienceWindowState(this.popoutAudienceWindow.document, payload);
      } catch {
        // Cross-origin or closed popout guard
      }
    }
  }

  private jumpToNavigableEdge(edge: 'first' | 'last'): void {
    const slides = this.ActiveDeckForDisplay.Slides;
    if (slides.length === 0) return;
    const target =
      edge === 'first'
        ? slides.find((s) => !s.Hidden) ?? slides[0]
        : [...slides].reverse().find((s) => !s.Hidden) ?? slides[slides.length - 1];
    this.SelectSlide(target.SlideID);
  }

  private bufferSlideJumpDigit(digit: string): void {
    this.jumpDigitBuffer = `${this.jumpDigitBuffer}${digit}`.slice(-3);
    if (this.jumpDigitTimer) {
      clearTimeout(this.jumpDigitTimer);
    }
    this.jumpDigitTimer = setTimeout(() => {
      this.commitSlideJumpBuffer();
    }, 1100);
  }

  private commitSlideJumpBuffer(): void {
    if (this.jumpDigitTimer) {
      clearTimeout(this.jumpDigitTimer);
      this.jumpDigitTimer = null;
    }
    const num = Number.parseInt(this.jumpDigitBuffer, 10);
    this.jumpDigitBuffer = '';
    if (!Number.isFinite(num) || num < 1) {
      return;
    }
    const target = this.ActiveDeckForDisplay.Slides[num - 1];
    if (target) {
      this.SelectSlide(target.SlideID);
    }
  }

  private clearPresentTimers(): void {
    if (this.presentHudHideTimer) {
      clearTimeout(this.presentHudHideTimer);
      this.presentHudHideTimer = null;
    }
    if (this.jumpDigitTimer) {
      clearTimeout(this.jumpDigitTimer);
      this.jumpDigitTimer = null;
    }
    this.jumpDigitBuffer = '';
  }

  private cleanupPresentationRuntime(): void {
    this.clearPresentTimers();
    if (this.fullscreenChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }
    this.exitShellFullscreen();
    if (this.audienceChannel) {
      try {
        this.audienceChannel.close();
      } catch {
        // Ignore close failure
      }
      this.audienceChannel = null;
    }
    if (this.popoutAudienceWindow && !this.popoutAudienceWindow.closed) {
      try {
        this.popoutAudienceWindow.close();
      } catch {
        // Ignore cross-window close restriction
      }
    }
    this.popoutAudienceWindow = null;
    this.HasPopoutAudienceWindow = false;
  }
}

interface AudienceStagePayload {
  type: 'state';
  presenting: boolean;
  slideNumber: number;
  slideCount: number;
  layout: string;
  title: string;
  subtitle: string;
  overlayMode: string;
  revealStep: number;
  maxRevealStep: number;
  laserActive: boolean;
  laserX: number;
  laserY: number;
  footerText: string;
  theme: Pick<
    SlideDeckThemeSpec,
    'BackgroundColor' | 'SurfaceColor' | 'PrimaryColor' | 'AccentColor' | 'TextColor' | 'MutedTextColor'
  >;
  regions: Array<{
    RegionID: string;
    Label?: string;
    Kind: string;
    MarkdownContent: string;
    BigNumberValue: string;
    BigNumberLabel: string;
    BigNumberDelta: string;
    QuoteAttribution: string;
    RevealStep: number;
  }>;
}

const AUDIENCE_STAGE_STYLES = [
  '*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#05070c;color:#f8fafc;font-family:Inter,system-ui,sans-serif;overflow:hidden}',
  'body{display:flex;align-items:center;justify-content:center;padding:24px}',
  '#stage{width:100%;max-width:1440px;aspect-ratio:16/9;background:var(--bg,#fff);color:var(--text,#0f172a);border-radius:16px;padding:36px 48px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 28px 80px rgba(0,0,0,.6);position:relative;overflow:hidden}',
  '#title{margin:0;font-size:38px;font-weight:800;color:var(--primary,#4f46e5)}',
  '#subtitle{margin:8px 0 0;font-size:18px;color:var(--muted,#475569)}',
  '#regions{flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin:20px 0;align-content:stretch}',
  '.card{background:var(--surface,#f8fafc);border-radius:14px;padding:18px 22px;border:1px solid rgba(148,163,184,.28);display:flex;flex-direction:column;gap:8px;transition:opacity .25s ease}',
  '.card.hidden-step{opacity:.06}',
  '.kpi-val{font-size:48px;font-weight:800;color:var(--accent,#0ea5e9);line-height:1.1}',
  '.kpi-lbl{font-size:16px;font-weight:600}',
  '.kpi-delta{font-size:13px;color:var(--primary,#4f46e5);font-weight:600}',
  '#footer{display:flex;justify-content:space-between;font-size:13px;color:var(--muted,#475569);border-top:1px solid rgba(148,163,184,.25);padding-top:10px}',
  '#overlay{position:fixed;inset:0;display:none;z-index:20}',
  '#laser{position:fixed;width:16px;height:16px;border-radius:50%;background:#ef4444;box-shadow:0 0 18px 4px rgba(239,68,68,.75);transform:translate(-50%,-50%);pointer-events:none;display:none;z-index:30}',
].join('');

/** Builds the audience stage popup DOM directly via DOM APIs without document.write or HTML strings. */
function initializeAudienceWindowDom(doc: Document): void {
  doc.title = 'MJ Slides — Audience Stage';
  if (doc.head) {
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    const style = doc.createElement('style');
    style.textContent = AUDIENCE_STAGE_STYLES;
    doc.head.replaceChildren(meta, style);
  }
  if (!doc.body) {
    return;
  }

  const header = doc.createElement('div');
  const titleEl = doc.createElement('h1');
  titleEl.id = 'title';
  titleEl.textContent = 'Waiting for presenter…';
  const subtitleEl = doc.createElement('p');
  subtitleEl.id = 'subtitle';
  header.append(titleEl, subtitleEl);

  const regionsEl = doc.createElement('div');
  regionsEl.id = 'regions';

  const footer = doc.createElement('div');
  footer.id = 'footer';
  const footerLeft = doc.createElement('span');
  footerLeft.id = 'f-left';
  const footerRight = doc.createElement('span');
  footerRight.id = 'f-right';
  footer.append(footerLeft, footerRight);

  const stage = doc.createElement('div');
  stage.id = 'stage';
  stage.append(header, regionsEl, footer);

  const overlay = doc.createElement('div');
  overlay.id = 'overlay';
  const laser = doc.createElement('div');
  laser.id = 'laser';

  doc.body.replaceChildren(stage, overlay, laser);
}

/** Renders presenter state into the audience window document using safe textContent and style updates. */
function renderAudienceWindowState(doc: Document, payload: AudienceStagePayload): void {
  const stage = doc.getElementById('stage');
  const titleEl = doc.getElementById('title');
  const subEl = doc.getElementById('subtitle');
  const regEl = doc.getElementById('regions');
  const fLeft = doc.getElementById('f-left');
  const fRight = doc.getElementById('f-right');
  const overlay = doc.getElementById('overlay');
  const laser = doc.getElementById('laser');
  if (!stage || !titleEl || !subEl || !regEl || !fLeft || !fRight || !overlay || !laser) {
    return;
  }

  const theme = payload.theme;
  stage.style.setProperty('--bg', theme.BackgroundColor || '#fff');
  stage.style.setProperty('--surface', theme.SurfaceColor || '#f8fafc');
  stage.style.setProperty('--primary', theme.PrimaryColor || '#4f46e5');
  stage.style.setProperty('--accent', theme.AccentColor || '#0ea5e9');
  stage.style.setProperty('--text', theme.TextColor || '#0f172a');
  stage.style.setProperty('--muted', theme.MutedTextColor || '#475569');

  titleEl.textContent = payload.title || '';
  subEl.textContent = payload.subtitle || '';
  fLeft.textContent = payload.footerText || '';
  fRight.textContent = `${payload.slideNumber} / ${payload.slideCount}`;

  overlay.style.display = payload.overlayMode && payload.overlayMode !== 'none' ? 'block' : 'none';
  overlay.style.background = payload.overlayMode === 'whiteout' ? '#fff' : '#000';

  laser.style.display = payload.laserActive ? 'block' : 'none';
  laser.style.left = `${payload.laserX || 50}%`;
  laser.style.top = `${payload.laserY || 50}%`;

  const maxStep = payload.maxRevealStep || 0;
  const curStep = payload.revealStep || 0;
  const cards: HTMLElement[] = [];
  for (const r of payload.regions) {
    const card = doc.createElement('div');
    const revealed = !maxStep || !r.RevealStep || curStep >= r.RevealStep;
    card.className = revealed ? 'card' : 'card hidden-step';
    if (r.Kind === 'big-number') {
      const valEl = doc.createElement('div');
      valEl.className = 'kpi-val';
      valEl.textContent = r.BigNumberValue || '—';
      const lblEl = doc.createElement('div');
      lblEl.className = 'kpi-lbl';
      lblEl.textContent = r.BigNumberLabel || r.Label || '';
      const deltaEl = doc.createElement('div');
      deltaEl.className = 'kpi-delta';
      deltaEl.textContent = r.BigNumberDelta || '';
      card.append(valEl, lblEl, deltaEl);
    } else {
      const bodyEl = doc.createElement('div');
      bodyEl.style.whiteSpace = 'pre-wrap';
      bodyEl.textContent = r.MarkdownContent || r.Label || '';
      card.append(bodyEl);
    }
    cards.push(card);
  }
  regEl.replaceChildren(...cards);
}

function generateSlideBlockUuid(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
