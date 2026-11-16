import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  Output,
  OnInit,
  OnChanges,
  OnDestroy,
  Renderer2,
  SimpleChanges,
  ChangeDetectorRef,
  HostListener,
  Type,
  ViewChild,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { EscapeSQLString, IsValidUUID, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
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
  type WorksheetSpec,
  type SlideDeckSpec,
  type SlideSpec,
  type SlideRegionSpec,
  type SlideLayoutKind,
  type SlideRegionKind,
  type SlideDeckThemeSpec,
  type SlideLayoutMetadata,
  type DocumentBlockSpec,
  type DocumentBlockColumn,
  type DocumentBlockExecutionResult,
} from '@memberjunction/core-entities';
import { BaseArtifactViewerPluginComponent, IArtifactVersionDiffViewer } from '../base-artifact-viewer.component';
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
  type SlideTransitionKind,
} from './context-menus/slides-context-menu.helper';

/**
 * Workspace mode for the MJ Slides (`Presentation`) artifact editor (`§ 5`).
 */
export type SlideWorkspaceMode = 'edit' | 'present' | 'presenter' | 'source' | 'diff';

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
  | 'theme'
  | 'md-to-deck'
  | 'export-pptx'
  | 'export-pdf'
  | 'ask-ai'
  | 'lock-slide';

export const DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS: readonly SlidesToolbarItemKey[] = [
  'present',
  'add-slide',
  'duplicate-slide',
  'delete-slide',
  'theme',
  'export-pptx',
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

            <label class="mj-slides-inline-select-label">
              <span>Layout:</span>
              <select
                class="mj-slides-select"
                [ngModel]="ActiveSlide.Layout"
                (ngModelChange)="OnChangeActiveSlideLayout($event)"
                data-testid="slide-layout-select"
              >
                @for (layoutMeta of LayoutCatalog; track layoutMeta.Kind) {
                  <option [value]="layoutMeta.Kind">{{ layoutMeta.Label }}</option>
                }
              </select>
            </label>
          </div>
        }

        <!-- Right-side Collaboration, Export & Comments Controls -->
        <div class="mj-slides-toolbar-group">
          <div
            class="mj-slides-collab-pill"
            [attr.data-status]="ConnectionStatus"
            data-testid="slides-collab-status"
          >
            <span class="mj-slides-status-dot"></span>
            <span>{{ GetCollaborationStatusLabel() }}</span>
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

          @if (IsEditable && WorkspaceMode === 'edit') {
            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="!!ActiveSlide.Locked"
              (click)="ToggleCurrentSlideLock()"
              [title]="ActiveSlide.Locked ? 'Unlock current slide' : 'Lock current slide to owner-only'"
              data-testid="slides-lock-slide-quick-btn"
            >
              <i class="fa-solid" [ngClass]="ActiveSlide.Locked ? 'fa-lock' : 'fa-lock-open'"></i>
              <span>{{ ActiveSlide.Locked ? 'Locked' : 'Lock' }}</span>
            </button>
            @if (IsAiAssistantEnabled) {
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="OpenAskAiForPresentation()"
                title="Open slide-in AI Assistant for this slide"
                data-testid="slides-ask-ai-quick-btn"
              >
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Ask AI</span>
              </button>
            }
          }

          @if (IsEditable) {
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="OnSaveVersionCheckpoint()"
              [disabled]="!HasUnsavedChanges"
              [title]="HasUnsavedChanges ? 'Save changes as a new version' : 'No unsaved changes to save'"
              data-testid="save-slide-version-btn"
            >
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>{{ !HasUnsavedChanges && LastSavedVersionNumber ? 'Saved v' + LastSavedVersionNumber : 'Save v' + (LastSavedVersionNumber || CurrentVersionNumber) }}</span>
            </button>
          }

          <button
            type="button"
            class="mj-slides-tool-btn"
            [class.active]="RightDrawerTab === 'comments'"
            (click)="ToggleRightDrawer('comments')"
            data-testid="toggle-slide-comments-btn"
          >
            <i class="fa-regular fa-comments"></i>
            <span>Comments ({{ OpenThreadCount }})</span>
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
              <textarea
                class="mj-slides-source-textarea"
                [(ngModel)]="RawDeckJsonText"
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
                  [attr.data-theme-id]="ActiveDeckForDisplay.Theme.ThemeID"
                  [style.--deck-bg]="ActiveDeckForDisplay.Theme.BackgroundColor"
                  [style.--deck-surface]="ActiveDeckForDisplay.Theme.SurfaceColor"
                  [style.--deck-primary]="ActiveDeckForDisplay.Theme.PrimaryColor"
                  [style.--deck-accent]="ActiveDeckForDisplay.Theme.AccentColor"
                  [style.--deck-text]="ActiveDeckForDisplay.Theme.TextColor"
                  [style.--deck-muted]="ActiveDeckForDisplay.Theme.MutedTextColor"
                  [style.--deck-heading-font]="ActiveDeckForDisplay.Theme.HeadingFont || 'Inter, system-ui, sans-serif'"
                  [style.--deck-body-font]="ActiveDeckForDisplay.Theme.BodyFont || 'Inter, system-ui, sans-serif'"
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
                      (blur)="OnInlineSlideTitleBlur($event)"
                      (keydown.enter)="OnInlineHeadingEnter($event)"
                      data-testid="editable-slide-title"
                    >{{ DisplayedSlide.Title }}</h1>

                    @if (DisplayedSlide.Subtitle || (IsEditable && WorkspaceMode === 'edit')) {
                      <p
                        class="mj-slide-subtitle-editable"
                        [attr.contenteditable]="CanEditSlideElements ? 'true' : 'false'"
                        (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, 'subtitle')"
                        (blur)="OnInlineSlideSubtitleBlur($event)"
                        (keydown.enter)="OnInlineHeadingEnter($event)"
                        data-testid="editable-slide-subtitle"
                      >{{ DisplayedSlide.Subtitle || 'Add slide subtitle...' }}</p>
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
                        (click)="FocusedRegionID = region.RegionID"
                        (contextmenu)="OnSlideRegionContextMenu($event, region)"
                        [attr.data-region-kind]="region.Kind"
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
                                [attr.data-testid]="'region-kind-select-' + region.RegionID"
                              >
                                <option value="rich-text">Rich Text / Bullets</option>
                                <option value="callout">Callout Box</option>
                                <option value="table">Data Table</option>
                                <option value="big-number">KPI Big Number</option>
                                <option value="quote">Executive Quote</option>
                                <option value="mj-block">Live MJ Block / Artifact</option>
                              </select>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                (click)="EmbedLiveEntityViewInRegion(region)"
                                title="Embed Live Viewer-Scoped MJ EntityView Block"
                                [attr.data-testid]="'region-insert-live-block-' + region.RegionID"
                              >
                                <i class="fa-solid fa-table-list"></i> + Live View
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                (click)="EmbedInlineWhiteboardInRegion(region)"
                                title="Embed Interactive Whiteboard Canvas"
                                [attr.data-testid]="'region-insert-whiteboard-' + region.RegionID"
                              >
                                <i class="fa-solid fa-chalkboard"></i> + Whiteboard
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
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
                                (click)="ToggleRegionLock(region)"
                                [title]="region.Locked ? 'Unlock region' : 'Lock region to owner-only'"
                                [attr.data-testid]="'region-lock-btn-' + region.RegionID"
                              >
                                <i class="fa-solid" [ngClass]="region.Locked ? 'fa-lock' : 'fa-lock-open'"></i>
                              </button>

                              <button
                                type="button"
                                class="mj-slides-mini-btn"
                                (click)="OpenCommentForSlideRegion(DisplayedSlide.SlideID, region.RegionID, region.Label)"
                                title="Comment on this slide section"
                                [attr.data-testid]="'region-comment-btn-' + region.RegionID"
                              >
                                <i class="fa-regular fa-comment-dots"></i>
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
                                @if (IsSnapshotVerified(block)) {
                                  <div
                                    class="mj-slide-block-provenance"
                                    [attr.data-testid]="'slide-frozen-provenance-' + region.RegionID"
                                  >
                                    <i class="fa-solid fa-shield-halved"></i>
                                    <span>
                                      Frozen snapshot captured at {{ block.FrozenSnapshot.FrozenAt }}
                                      @if (block.FrozenSnapshot.FrozenByUserName || block.FrozenSnapshot.FrozenByUserID) {
                                        by
                                        <strong>{{
                                          block.FrozenSnapshot.FrozenByUserName || block.FrozenSnapshot.FrozenByUserID
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
                                      [readonly]="!(IsEditable && WorkspaceMode === 'edit' && IsOleRegionEditing(region.RegionID))"
                                      (ContentCommitted)="OnEmbeddedArtifactContentCommitted(region, block, $event)"
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
                                <!-- Live or Frozen MJ Data Block Table / Access-Denied Error State -->
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
                                  @if (displayData.Columns.length > 0) {
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
                              (blur)="OnBigNumberFieldBlur(region, 'value', $event)"
                              [attr.data-testid]="'editable-big-number-value-' + region.RegionID"
                            >{{ region.BigNumberValue || '99.9%' }}</div>
                            <div
                              class="mj-slide-big-number-label"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (blur)="OnBigNumberFieldBlur(region, 'label', $event)"
                            >{{ region.BigNumberLabel || 'Key Performance Indicator' }}</div>
                            @if (region.BigNumberDelta || (IsEditable && WorkspaceMode === 'edit')) {
                              <span
                                class="mj-slide-big-number-delta"
                                [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                                (blur)="OnBigNumberFieldBlur(region, 'delta', $event)"
                              >{{ region.BigNumberDelta || '+12% YoY' }}</span>
                            }
                          </div>
                        } @else if (region.Kind === 'quote') {
                          <blockquote class="mj-slide-quote-region">
                            <div
                              class="mj-slide-quote-text"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (blur)="OnInlineRegionContentBlur(region, $event)"
                              [attr.data-testid]="'editable-region-content-' + region.RegionID"
                            >{{ region.MarkdownContent }}</div>
                            <cite
                              class="mj-slide-quote-cite"
                              [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                              (blur)="OnQuoteAttributionBlur(region, $event)"
                            >— {{ region.QuoteAttribution || 'Executive Sponsor' }}</cite>
                          </blockquote>
                        } @else {
                          <!-- Rich Text / Callout / Bullet List Region -->
                          <div
                            class="mj-slide-richtext-region"
                            [class.callout-box]="region.Kind === 'callout'"
                            [attr.contenteditable]="CanEditRegion(region) ? 'true' : 'false'"
                            (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, region.RegionID)"
                            (blur)="OnInlineRegionContentBlur(region, $event)"
                            [innerHTML]="RenderRegionHtml(region.MarkdownContent)"
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
                      [readonly]="!IsEditable"
                      placeholder="Add presenter talking points and cues for this slide..."
                      data-testid="speaker-notes-input"
                    ></textarea>
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
                  <strong>Slide Comments</strong>
                  <button type="button" class="mj-slides-icon-btn" (click)="RightDrawerTab = 'none'">
                    <i class="fa-solid fa-xmark"></i>
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
                      placeholder="Add an anchored comment on this slide region..."
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

                <div class="mj-slides-thread-list" data-testid="slide-comment-thread-list">
                  @for (thread of AnchoredThreads; track thread.ConversationID) {
                    <div
                      class="mj-slides-thread-card"
                      [attr.data-status]="thread.Status"
                      [attr.data-testid]="'slide-thread-' + thread.ConversationID"
                    >
                      <div class="mj-slides-thread-header">
                        <span class="mj-slides-thread-anchor">
                          <i class="fa-solid fa-thumbtack"></i> {{ thread.AnchorLabel }}
                        </span>
                        <span class="mj-slides-badge">{{ thread.Status }}</span>
                      </div>
                      @for (msg of thread.Messages; track msg.DetailID) {
                        <div class="mj-slides-thread-msg" [attr.data-role]="msg.Role">
                          <strong>{{ msg.UserName }}:</strong> {{ msg.Message }}
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
        background: var(--mj-bg-page);
      }
      .mj-slides-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 14px;
        background: var(--mj-bg-surface-card);
        border-bottom: 1px solid var(--mj-border-default);
      }
      .mj-slides-toolbar-group {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
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
        padding: 22px 30px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
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
      .mj-slide-region-card {
        background: var(--deck-surface, var(--mj-bg-surface));
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 120px;
        overflow: auto;
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
        background: rgba(0, 0, 0, 0.55);
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
  implements OnInit, OnChanges, OnDestroy
{
  private static readonly USER_SETTING_PREFIX = 'MJ.Slides.WorkspaceState.';
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
  /** @deprecated Use {@link OpenEntityRecord}. */
  @Output() public openEntityRecord = this.OpenEntityRecord;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone, { optional: true });
  private readonly hostElRef = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly renderer = inject(Renderer2, { optional: true });
  private readonly collabService = inject(DocumentCollaborationService);
  private readonly exportService = inject(SlideDeckExportService);
  private readonly notificationService = inject(MJNotificationService, { optional: true });

  @ViewChild('moreToolsAnchor') private moreToolsAnchorRef?: ElementRef<HTMLElement>;

  public readonly MaxPinnedToolbarActions = 6;
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
  private lastSavedComparableDeckJson = '';

  public get HasUnsavedChanges(): boolean {
    if (!this.lastSavedComparableDeckJson) {
      return false;
    }
    return this.getComparableDeckJson(this.Deck) !== this.lastSavedComparableDeckJson;
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

  // Presenter View Elapsed Timer
  public PresenterElapsedSeconds = 0;
  private presenterTimerHandle: ReturnType<typeof setInterval> | null = null;

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
    return !this.LiveSyncUnavailable && this.hasPermissionToEdit;
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
    return this.findPrevNavigableSlideIndex(this.ActiveSlideIndex) >= 0;
  }

  public get CanNavigateNextSlide(): boolean {
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
    this.initializePresentationFromArtifactVersion();
    this.bindTouchPointerListenersOutsideZone();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['artifactVersion'] && !changes['artifactVersion'].firstChange) {
      this.initializePresentationFromArtifactVersion();
      return;
    }
    if (changes['CollaborationWsUrl'] && !changes['CollaborationWsUrl'].firstChange) {
      const artifactId = this.artifactVersion?.ArtifactID || 'slide-deck-default';
      this.setupCollaborationSession(artifactId, SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck));
    }
    if (changes['readonly']) {
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
        this.ConnectionStatus !== 'revoked' &&
        !this.LiveSyncUnavailable &&
        (!this.artifactVersion?.ArtifactID || this.ResolvedPermissions?.CanEdit === true);
      this.session?.SetCanEdit(nextCanEdit);
      if (this.session) {
        this.ConnectionStatus = this.session.Status;
      }
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
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
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        this.NextSlide();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        this.PrevSlide();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.ExitPresentationMode();
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

  public SetWorkspaceMode(mode: SlideWorkspaceMode): void {
    if (mode === 'present' || mode === 'presenter') {
      this.EnterPresentationMode(mode);
      return;
    }
    this.stopPresenterTimer();
    this.WorkspaceMode = mode;
    if (mode === 'source') {
      this.RawDeckJsonText = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
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
    if (startSlideId) {
      this.SelectSlide(startSlideId);
    }
    this.PresentationFrozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
      this.Deck,
      this.blockResultsByBlockId,
      this.getCurrentUserSummary(),
    );
    this.PresentationRefreshCount = 0;
    this.PresentationFrozenAt = new Date();
    this.WorkspaceMode = mode;
    if (mode === 'presenter') {
      this.startPresenterTimer();
    } else {
      this.stopPresenterTimer();
    }
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
    this.cdr.markForCheck();
  }

  public ExitPresentationMode(): void {
    this.stopPresenterTimer();
    this.PresentationFrozenDeck = null;
    this.WorkspaceMode = 'edit';
    this.cdr.markForCheck();
  }

  public SelectSlide(slideId: string): void {
    this.ActiveSlideID = slideId;
    const slide = this.ActiveSlide;
    this.FocusedRegionID = slide.Regions[0]?.RegionID ?? 'main';
    this.PendingAnchorKey = `${slide.SlideID}:${this.FocusedRegionID}`;
    this.PendingAnchorLabel = `Slide ${slide.SlideNumber} · ${slide.Regions[0]?.Label ?? 'Primary Content'}`;
    this.session?.SetActiveBlock(this.PendingAnchorKey);
    this.cdr.markForCheck();
  }

  public PrevSlide(): void {
    const targetIdx = this.findPrevNavigableSlideIndex(this.ActiveSlideIndex);
    if (targetIdx >= 0) {
      const target = this.ActiveDeckForDisplay.Slides[targetIdx];
      this.SelectSlide(target.SlideID);
    }
  }

  public NextSlide(): void {
    const targetIdx = this.findNextNavigableSlideIndex(this.ActiveSlideIndex);
    if (targetIdx >= 0) {
      const target = this.ActiveDeckForDisplay.Slides[targetIdx];
      this.SelectSlide(target.SlideID);
    }
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
        Disabled: this.Deck.Slides.length <= 1,
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
    const { Deck: updatedDeck, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(
      this.Deck,
      this.ActiveSlide.SlideID,
      { Layout: newLayout },
    );
    if (UpdatedSlide) {
      this.Deck = updatedDeck;
      this.session?.UpdateSlideInDeck(UpdatedSlide, this.Deck);
      void this.executeAllLiveBlocksInDeck(this.Deck);
      this.syncRawDeckJson();
      this.cdr.markForCheck();
    }
  }

  public OnFocusSlideElement(slideId: string, regionOrFieldId: string): void {
    this.FocusedRegionID = regionOrFieldId;
    this.PendingAnchorKey = `${slideId}:${regionOrFieldId}`;
    this.PendingAnchorLabel = `Slide ${this.ActiveSlide.SlideNumber} · ${regionOrFieldId}`;
    this.session?.SetActiveBlock(this.PendingAnchorKey);
  }

  public OnInlineHeadingEnter(event: Event): void {
    event.preventDefault();
    (event.target as HTMLElement | null)?.blur();
  }

  public OnInlineSlideTitleBlur(event: FocusEvent): void {
    if (!this.IsEditable) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextTitle = (el?.innerText ?? '').trim();
    if (!nextTitle || nextTitle === this.ActiveSlide.Title) {
      return;
    }
    this.applySingleSlideMetadataPatch(this.ActiveSlide.SlideID, { Title: nextTitle });
  }

  public OnInlineSlideSubtitleBlur(event: FocusEvent): void {
    if (!this.IsEditable) {
      return;
    }
    const el = event.target as HTMLElement | null;
    const nextSubtitle = (el?.innerText ?? '').trim();
    if (nextSubtitle === (this.ActiveSlide.Subtitle ?? '')) {
      return;
    }
    this.applySingleSlideMetadataPatch(this.ActiveSlide.SlideID, { Subtitle: nextSubtitle });
  }

  public OnSpeakerNotesChange(notes: string): void {
    if (!this.IsEditable) {
      return;
    }
    this.applySingleSlideMetadataPatch(this.ActiveSlide.SlideID, { SpeakerNotes: notes });
  }

  public OnInlineRegionContentBlur(region: SlideRegionSpec, event: FocusEvent): void {
    if (!this.IsEditable) {
      return;
    }
    const el = event.target as HTMLElement | null;
    if (!el) {
      return;
    }
    const nextMarkdown = this.convertEditableRegionDomToMarkdown(el);
    if (nextMarkdown === region.MarkdownContent) {
      return;
    }
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      MarkdownContent: nextMarkdown,
    });
  }

  public OnBigNumberFieldBlur(
    region: SlideRegionSpec,
    field: 'value' | 'label' | 'delta',
    event: FocusEvent,
  ): void {
    if (!this.IsEditable) {
      return;
    }
    const text = ((event.target as HTMLElement | null)?.innerText ?? '').trim();
    const patch: Partial<SlideRegionSpec> & { RegionID: string } = { RegionID: region.RegionID };
    if (field === 'value') {
      patch.BigNumberValue = text;
    } else if (field === 'label') {
      patch.BigNumberLabel = text;
    } else {
      patch.BigNumberDelta = text;
    }
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, patch);
  }

  public OnQuoteAttributionBlur(region: SlideRegionSpec, event: FocusEvent): void {
    if (!this.IsEditable) {
      return;
    }
    const raw = ((event.target as HTMLElement | null)?.innerText ?? '').replace(/^—\s*/, '').trim();
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      QuoteAttribution: raw,
    });
  }

  public OnChangeRegionKind(region: SlideRegionSpec, nextKind: SlideRegionKind): void {
    if (!this.IsEditable) {
      return;
    }
    if (nextKind === 'mj-block' && !region.BlockSpec) {
      this.EmbedLiveEntityViewInRegion(region);
      return;
    }
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
      RegionID: region.RegionID,
      Kind: nextKind,
      BigNumberValue: nextKind === 'big-number' ? region.BigNumberValue || '$12.4M' : region.BigNumberValue,
      BigNumberLabel: nextKind === 'big-number' ? region.BigNumberLabel || 'Annual Recurring Revenue' : region.BigNumberLabel,
      BigNumberDelta: nextKind === 'big-number' ? region.BigNumberDelta || '+28% YoY' : region.BigNumberDelta,
    });
  }

  /**
   * Embeds a viewer-scoped Live MJ `EntityView` block into `region`.
   */
  public EmbedLiveEntityViewInRegion(region: SlideRegionSpec): void {
    if (!this.IsEditable) {
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
    if (!this.IsEditable) {
      return;
    }
    const created = await this.createDelegatedWhiteboardArtifact(
      `${this.ActiveSlide.Title} · Architecture Whiteboard`,
    );
    if (!created) {
      return;
    }
    const blockSpec: DocumentBlockSpec = {
      BlockID: `slide-wb-${this.ActiveSlide.SlideID}-${region.RegionID}`,
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
    this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
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
    const cached = this.embeddedArtifactVersions.get(key);
    if (cached) {
      return cached;
    }
    if (!this.inFlightEmbeddedVersionKeys.has(key) && !this.failedEmbeddedVersionMessages.has(key)) {
      void this.loadEmbeddedArtifactVersion(artifactId, block.VersionID);
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
    if (!this.IsEditable) return;
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
    if (!region) {
      this.ShowSheetEmbedModal = false;
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
    const artifactId = block.ArtifactID.trim();
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
    if (!this.IsEditable) return;
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

    if (!IsValidUUID(artifactId) || (versionId && !IsValidUUID(versionId))) {
      this.failedEmbeddedVersionMessages.set(
        key,
        `Embedded artifact reference "${artifactId}" is not a valid artifact UUID.`,
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
          this.latestWorkbookVersions.set(artifactId, entity);
        } else if (versionId && !this.latestWorkbookVersions.has(artifactId)) {
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
            this.latestWorkbookVersions.set(artifactId, latestEntity);
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
    if (!this.IsEditable) {
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
  ): Promise<void> {
    if (this.IsInlineOleArtifactBlock(block)) {
      return;
    }
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
      const provider = this.getSafeProvider();
      const verified = provider && this.collabService.HasCollaborationBackend(provider)
        ? await this.collabService.VerifyFrozenSnapshotOnServer(block, provider)
        : this.IsSnapshotVerified(block);
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
    this.PendingFreezeRegion = region;
    this.PendingFreezeBlock = block;
    this.cdr.markForCheck();
  }

  public CancelFreezeSlideBlock(): void {
    this.PendingFreezeRegion = null;
    this.PendingFreezeBlock = null;
    this.cdr.markForCheck();
  }

  public IsSnapshotVerified(block: DocumentBlockSpec | null | undefined): boolean {
    if (!block) {
      return false;
    }
    return this.collabService.IsFrozenSnapshotVerified(
      block,
      this.blockResultsByBlockId.get(block.BlockID),
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
      this.applySingleSlideRegionPatch(this.ActiveSlide.SlideID, {
        RegionID: region.RegionID,
        Kind: 'mj-block',
        BlockSpec: serverRes.UpdatedSpec,
        MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(
          serverRes.UpdatedSpec,
        ),
      });
      this.cdr.markForCheck();
    } catch (err) {
      LogError(err);
      this.notifyError(err instanceof Error ? err.message : 'Failed to freeze live block on server.');
    }
  }

  public UnfreezeSlideRegionBlock(region: SlideRegionSpec, block: DocumentBlockSpec): void {
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
    this.cdr.markForCheck();
  }

  /**
   * Exports the presentation as an OpenXML `.pptx` file, freezing live MJ blocks (`Accept #2`)
   * and emitting editable `<p:sp>` text shapes, `<a:tbl>` tables, and speaker notes (`Accept #5`).
   */
  public OnExportPptx(): PptxExportPackage {
    const fileName = `${(this.Deck.Title || 'presentation').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pptx`;
    const pkg = this.exportService.DownloadPptxFile(
      this.Deck,
      this.blockResultsByBlockId,
      fileName,
      this.getCurrentUserSummary(),
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
    return this.exportService.ExportPrintablePdf(
      this.Deck,
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
    if (!this.IsEditable || !this.HasUnsavedChanges) {
      return;
    }
    const { Policy, CapturedThumbnailDataUrl } = await CaptureThumbnailForDriverIfAllowed(
      'SlideDeckArtifactViewerPlugin',
      this.resolveCaptureRootElement(),
    );
    const sentOverWs = this.session?.RequestSaveVersion(CapturedThumbnailDataUrl) ?? false;
    if (!sentOverWs) {
      await this.saveArtifactVersionViaProvider(CapturedThumbnailDataUrl, Policy);
    }
  }

  public ApplyRawJsonSource(): void {
    if (!this.IsEditable) {
      return;
    }
    this.Deck = SlideDeckEngine.Instance.ParseDeckSpec(
      this.RawDeckJsonText,
      this.Deck.Title,
      this.Deck.DeckID,
    );
    this.ActiveSlideID = this.Deck.Slides[0]?.SlideID ?? 'slide-1';
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
    this.session?.SetContent(serialized);
    void this.executeAllLiveBlocksInDeck(this.Deck);
    this.cdr.markForCheck();
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
    this.embeddedArtifactVersions.clear();
    this.inFlightEmbeddedVersionKeys.clear();
    this.failedEmbeddedVersionMessages.clear();
    this.AnchoredThreads = [];
    this.ResolvedPermissions = null;
    this.artifactOwnerUserId = null;
    this.ConnectionStatus = 'local';

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
    void this.resolveViewerPermissionsAndThreads(gen);
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
    const hasRemoteBackend = this.collabService.HasCollaborationBackend(provider, this.CollaborationWsUrl);

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
        this.RawDeckJsonText = SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck);
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
        const isNewSavedVersion = versionNumber > this.LastSavedVersionNumber;
        this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
        this.LastSavedVersionNumber = versionNumber;
        this.CurrentVersionNumber = versionNumber;
        if (isNewSavedVersion) {
          this.ContentCommitted.emit(SlideDeckEngine.Instance.SerializeDeckSpec(this.Deck));
        }
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
    for (const slide of deck.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (block && !this.IsInlineOleArtifactBlock(block)) {
          const effectiveBlock: DocumentBlockSpec = forceLiveRefresh
            ? { ...block, Mode: 'Live' }
            : block;
          await this.ExecuteSlideRegionBlock(region, effectiveBlock);
        }
      }
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

  private startPresenterTimer(): void {
    this.stopPresenterTimer();
    this.PresenterElapsedSeconds = 0;
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

  public RetryVerifyPermissions(): void {
    void this.resolveViewerPermissionsAndThreads(this.sessionInitGeneration);
  }

  private async resolveViewerPermissionsAndThreads(gen = this.sessionInitGeneration): Promise<void> {
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
    policy?: import('@memberjunction/core-entities').ArtifactTypeThumbnailPolicy,
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
        this.artifactVersion?.Configuration,
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
      const [slideId, regionId] = thread.AnchorKey.split(':');

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
      const [slideId, regionId] = thread.AnchorKey.split(':');
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
