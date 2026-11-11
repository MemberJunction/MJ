import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectorRef,
  HostListener,
  Type,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { EscapeSQLString, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
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
  DocumentLiveBlockEngine,
  ArtifactPermissionEngine,
  FilterReadableAnchoredConversations,
  SlideDeckEngine,
  SLIDE_LAYOUT_CATALOG,
  SLIDE_DECK_THEME_PRESETS,
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
import { SlidesVersionDiffComponent } from '../version-diff/slides-version-diff.component';
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
@Component({
  selector: 'mj-slide-deck-artifact-viewer',
  standalone: false,
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
            <button
              type="button"
              class="mj-slides-mode-pill"
              [class.active]="WorkspaceMode === 'present'"
              (click)="EnterPresentationMode('present')"
              data-testid="slides-mode-present"
            >
              <i class="fa-solid fa-play"></i> Present
            </button>
            <button
              type="button"
              class="mj-slides-mode-pill"
              [class.active]="WorkspaceMode === 'presenter'"
              (click)="EnterPresentationMode('presenter')"
              data-testid="slides-mode-presenter"
            >
              <i class="fa-solid fa-chalkboard-user"></i> Presenter View
            </button>
            <button
              type="button"
              class="mj-slides-mode-pill"
              [class.active]="WorkspaceMode === 'source'"
              (click)="SetWorkspaceMode('source')"
              data-testid="slides-mode-source"
            >
              <i class="fa-solid fa-code"></i> Source
            </button>
            <button
              type="button"
              class="mj-slides-mode-pill"
              [class.active]="WorkspaceMode === 'diff'"
              (click)="SetWorkspaceMode('diff')"
              data-testid="slides-mode-diff"
            >
              <i class="fa-solid fa-code-compare"></i> Diff
            </button>
          </div>
        </div>

        <!-- Authoring Controls (visible in Edit Mode when editable) -->
        @if (WorkspaceMode === 'edit' && IsEditable) {
          <div class="mj-slides-toolbar-group">
            <button
              type="button"
              class="mj-slides-tool-btn primary"
              (click)="OnAddSlide()"
              data-testid="add-slide-btn"
            >
              <i class="fa-solid fa-plus"></i> Add Slide
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="OnDuplicateActiveSlide()"
              title="Duplicate Current Slide"
              data-testid="duplicate-slide-btn"
            >
              <i class="fa-solid fa-copy"></i>
            </button>
            <button
              type="button"
              class="mj-slides-tool-btn"
              [disabled]="Deck.Slides.length <= 1"
              (click)="OnDeleteActiveSlide()"
              title="Delete Current Slide"
              data-testid="delete-slide-btn"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>

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

            <button
              type="button"
              class="mj-slides-tool-btn"
              [class.active]="RightDrawerTab === 'theme'"
              (click)="ToggleRightDrawer('theme')"
              data-testid="toggle-theme-drawer-btn"
            >
              <i class="fa-solid fa-palette"></i>
              <span>Theme ({{ Deck.Theme.Name }})</span>
            </button>

            <button
              type="button"
              class="mj-slides-tool-btn"
              (click)="ShowMarkdownToDeckModal = true"
              title="Convert a Markdown Document into Slides (§ 5.2)"
              data-testid="open-markdown-to-deck-btn"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i> Doc → Slides
            </button>
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
            @for (peer of Collaborators; track peer.ClientID) {
              <span
                class="mj-slides-peer-avatar"
                [title]="peer.Name + (peer.ActiveBlockID ? ' · ' + peer.ActiveBlockID : '')"
              >
                {{ GetInitials(peer.Name) }}
              </span>
            }
          </div>

          <button
            type="button"
            class="mj-slides-tool-btn"
            (click)="OnExportPptx()"
            title="Export PowerPoint (.pptx) with Live Data Snapshots"
            data-testid="export-pptx-btn"
          >
            <i class="fa-solid fa-file-powerpoint"></i> .pptx
          </button>

          <button
            type="button"
            class="mj-slides-tool-btn"
            (click)="OnExportPdf()"
            title="Export 16:9 Printable PDF (.pdf)"
            data-testid="export-pdf-btn"
          >
            <i class="fa-solid fa-file-pdf"></i> .pdf
          </button>

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
              [disabled]="ActiveSlideIndex <= 0"
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
              [disabled]="ActiveSlideIndex >= ActiveDeckForDisplay.Slides.length - 1"
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
          <aside class="mj-slides-filmstrip" data-testid="slides-filmstrip-rail">
            <div class="mj-slides-filmstrip-header">
              <span>Slide Sorter</span>
              <span class="mj-slides-badge">{{ Deck.AspectRatio }}</span>
            </div>
            <div class="mj-slides-filmstrip-list">
              @for (slide of Deck.Slides; track slide.SlideID; let idx = $index) {
                <div
                  class="mj-slides-thumbnail-card"
                  [class.active]="slide.SlideID === ActiveSlide.SlideID"
                  (click)="SelectSlide(slide.SlideID)"
                  [attr.data-testid]="'filmstrip-slide-' + slide.SlideID"
                >
                  <div class="mj-slides-thumbnail-top">
                    <span class="mj-slides-thumb-number">{{ idx + 1 }}</span>
                    <span class="mj-slides-thumb-layout">{{ slide.Layout }}</span>
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
                      [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                      (focus)="OnFocusSlideElement(DisplayedSlide.SlideID, 'title')"
                      (blur)="OnInlineSlideTitleBlur($event)"
                      (keydown.enter)="OnInlineHeadingEnter($event)"
                      data-testid="editable-slide-title"
                    >{{ DisplayedSlide.Title }}</h1>

                    @if (DisplayedSlide.Subtitle || (IsEditable && WorkspaceMode === 'edit')) {
                      <p
                        class="mj-slide-subtitle-editable"
                        [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
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
                        (click)="FocusedRegionID = region.RegionID"
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
                              [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                              (blur)="OnBigNumberFieldBlur(region, 'value', $event)"
                              [attr.data-testid]="'editable-big-number-value-' + region.RegionID"
                            >{{ region.BigNumberValue || '99.9%' }}</div>
                            <div
                              class="mj-slide-big-number-label"
                              [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                              (blur)="OnBigNumberFieldBlur(region, 'label', $event)"
                            >{{ region.BigNumberLabel || 'Key Performance Indicator' }}</div>
                            @if (region.BigNumberDelta || (IsEditable && WorkspaceMode === 'edit')) {
                              <span
                                class="mj-slide-big-number-delta"
                                [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                                (blur)="OnBigNumberFieldBlur(region, 'delta', $event)"
                              >{{ region.BigNumberDelta || '+12% YoY' }}</span>
                            }
                          </div>
                        } @else if (region.Kind === 'quote') {
                          <blockquote class="mj-slide-quote-region">
                            <div
                              class="mj-slide-quote-text"
                              [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                              (blur)="OnInlineRegionContentBlur(region, $event)"
                              [attr.data-testid]="'editable-region-content-' + region.RegionID"
                            >{{ region.MarkdownContent }}</div>
                            <cite
                              class="mj-slide-quote-cite"
                              [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
                              (blur)="OnQuoteAttributionBlur(region, $event)"
                            >— {{ region.QuoteAttribution || 'Executive Sponsor' }}</cite>
                          </blockquote>
                        } @else {
                          <!-- Rich Text / Callout / Bullet List Region -->
                          <div
                            class="mj-slide-richtext-region"
                            [class.callout-box]="region.Kind === 'callout'"
                            [attr.contenteditable]="IsEditable && WorkspaceMode === 'edit' ? 'true' : 'false'"
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
                  <div class="mj-slides-speaker-notes-bar" data-testid="speaker-notes-panel">
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

                  <div class="mj-presenter-notes-card" data-testid="presenter-speaker-notes-card">
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
                class="mj-slides-tool-btn"
                (click)="CancelFreezeSlideBlock()"
                data-testid="cancel-slide-freeze-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="ConfirmFreezeSlideBlock()"
                data-testid="confirm-slide-freeze-btn"
              >
                Acknowledge &amp; Freeze Snapshot
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
                class="mj-slides-tool-btn"
                (click)="ShowMarkdownToDeckModal = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="mj-slides-tool-btn primary"
                (click)="ConvertDraftMarkdownToDeck()"
                data-testid="confirm-markdown-to-deck-btn"
              >
                Convert Document to Slides
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

  /**
   * Optional WebSocket URL (or base URL) override for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, `DocumentCollaborationService` mints a single-use ticket via `GraphQLDataProvider`.
   */
  @Input() public CollaborationWsUrl: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly collabService = inject(DocumentCollaborationService);
  private readonly exportService = inject(SlideDeckExportService);
  private readonly notificationService = inject(MJNotificationService, { optional: true });

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
  private readonly inFlightEmbeddedVersionKeys = new Set<string>();
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
    if (this.ConnectionStatus === 'readonly' || this.ConnectionStatus === 'revoked') {
      return false;
    }
    if (this.artifactVersion?.ArtifactID) {
      return this.ResolvedPermissions?.CanEdit === true;
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
    return !this.LiveSyncUnavailable && this.hasPermissionToEdit && !this.IsWaitingForInitialCollabSync;
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

  public get NextSlidePreview(): SlideSpec | null {
    const deck = this.ActiveDeckForDisplay;
    const nextIdx = this.ActiveSlideIndex + 1;
    return nextIdx < deck.Slides.length ? deck.Slides[nextIdx] : null;
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
      this.session?.SetCanEdit(this.hasPermissionToEdit);
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.sessionInitGeneration++;
    this.destroyCollaborationSession();
  }

  @HostListener('document:keydown', ['$event'])
  public OnGlobalKeyDown(event: KeyboardEvent): void {
    if (this.WorkspaceMode !== 'present' && this.WorkspaceMode !== 'presenter') {
      return;
    }
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
  public EnterPresentationMode(mode: 'present' | 'presenter'): void {
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
    const idx = this.ActiveSlideIndex;
    if (idx > 0) {
      const target = this.ActiveDeckForDisplay.Slides[idx - 1];
      this.SelectSlide(target.SlideID);
    }
  }

  public NextSlide(): void {
    const idx = this.ActiveSlideIndex;
    const deck = this.ActiveDeckForDisplay;
    if (idx < deck.Slides.length - 1) {
      const target = deck.Slides[idx + 1];
      this.SelectSlide(target.SlideID);
    }
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
    const targetId = this.ActiveSlide.SlideID;
    const { Deck: updatedDeck, Deleted } = SlideDeckEngine.Instance.DeleteSlide(this.Deck, targetId);
    if (!Deleted) {
      return;
    }
    this.Deck = updatedDeck;
    this.ActiveSlideID = this.Deck.Slides[0].SlideID;
    this.session?.DeleteSlideFromDeck(targetId, this.Deck);
    this.syncRawDeckJson();
    this.cdr.markForCheck();
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
    const hasProviderBackend =
      Boolean(provider) &&
      (typeof (provider as { RunView?: unknown }).RunView === 'function' ||
        (Array.isArray(provider?.Entities) && provider.Entities.length > 0));

    if (!provider || !currentUser || !hasProviderBackend) {
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
    Rows: Array<Record<string, unknown>>;
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

  public FormatCellValue(value: unknown): string {
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

  public async OnSaveVersionCheckpoint(): Promise<void> {
    if (!this.IsEditable || !this.HasUnsavedChanges) {
      return;
    }
    const sentOverWs = this.session?.RequestSaveVersion() ?? false;
    if (!sentOverWs) {
      await this.saveArtifactVersionViaProvider();
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
    const artifactId =
      this.session?.ArtifactID ||
      this.artifactVersion?.ArtifactID ||
      this.artifactVersion?.ID ||
      'slide-deck-default';
    void this.collabService.Retry(artifactId);
  }

  private handleCollaborationMergeConflict(event: CollaborationMergeConflictEvent): void {
    this.StatusBannerMessage = MERGE_CONFLICT_WARNING_MESSAGE;
    if (typeof this.collabService.NotifyMergeConflictToastOnce === 'function') {
      this.collabService.NotifyMergeConflictToastOnce(event, this.notificationService);
    } else {
      this.notificationService?.CreateSimpleNotification?.(
        MERGE_CONFLICT_WARNING_MESSAGE,
        'warning',
        5000,
      );
    }
    this.cdr.markForCheck();
  }

  private formatInlineBoldAndCode(text: string): string {
    const escaped = EscapeHtml(text);
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`)
      .replace(/`([^`]+)`/g, (_m, inner: string) => `<code>${inner}</code>`);
  }

  private convertEditableRegionDomToMarkdown(el: HTMLElement): string {
    const rawText = (el.innerText ?? '').replace(/\r\n/g, '\n').trim();
    return rawText
      .split('\n')
      .map((line) => line.replace(/^•\s+/, '- ').trimEnd())
      .join('\n');
  }

  /**
   * Updates ONLY the targeted slide's metadata in `this.Deck` and broadcasts the single-slide
   * update via `session.UpdateSlideInDeck` (`Accept #1`).
   */
  private applySingleSlideMetadataPatch(
    slideId: string,
    patch: Parameters<typeof SlideDeckEngine.Instance.UpdateSlideMetadata>[2],
  ): void {
    const { Deck: updatedDeck, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(
      this.Deck,
      slideId,
      patch,
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
        this.cdr.markForCheck();
      }),
      this.session.CollaboratorsChanged$.subscribe((peers) => {
        this.Collaborators = peers;
        this.cdr.markForCheck();
      }),
      this.session.VersionSaved$.subscribe(({ versionNumber }) => {
        this.lastSavedComparableDeckJson = this.getComparableDeckJson(this.Deck);
        this.LastSavedVersionNumber = versionNumber;
        this.CurrentVersionNumber = versionNumber;
        this.cdr.markForCheck();
      }),
    );

    if (this.session.MergeConflict$) {
      this.subs.push(
        this.session.MergeConflict$.subscribe((conflictEvt: CollaborationMergeConflictEvent) => {
          if (this.isComponentDestroyed) {
            return;
          }
          this.handleCollaborationMergeConflict(conflictEvt);
        }),
      );
    }

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

  private async saveArtifactVersionViaProvider(): Promise<void> {
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
    try {
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
    } catch {
      // Ignore when UserInfoEngine is not initialized in isolated unit tests
    }
  }

  private persistWorkspacePreferences(): void {
    try {
      const artifactId = this.artifactVersion?.ArtifactID || 'default';
      void UserInfoEngine.Instance.SetSettingDebounced(
        `${SlideDeckArtifactViewerComponent.USER_SETTING_PREFIX}${artifactId}`,
        JSON.stringify({
          showFilmstrip: this.ShowFilmstrip,
          rightDrawerTab: this.RightDrawerTab,
        }),
      );
    } catch {
      // Ignore when UserInfoEngine is not initialized in isolated unit tests
    }
  }
}
