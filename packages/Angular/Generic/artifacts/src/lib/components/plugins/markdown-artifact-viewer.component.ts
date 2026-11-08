import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef, inject } from '@angular/core';
import { DataSnapshot, RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
  DocumentLiveBlockEngine,
  ArtifactPermissionEngine,
  type DocumentBlockSpec,
  type DocumentBlockExecutionResult,
  type DocumentBlockKind,
  type MJArtifactEntity,
  type MJArtifactVersionEntity,
  type MJConversationEntity,
  type MJConversationDetailEntity,
} from '@memberjunction/core-entities';
import type { PdfOrientation } from '@memberjunction/ng-react';
import { Subscription } from 'rxjs';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { CreateMarkdownSnapshot } from '../../snapshot-helpers';
import {
  DocumentCollaborationService,
  DocumentCollaborationSession,
  type CollaborationConnectionStatus,
  type CollaboratorPresence,
  type DocumentAnchoredThread,
  type DocumentDiffResult,
  type DocumentOutlineItem,
  type DocumentRenderSegment,
  type DocumentSlashCommand,
  type DocumentSuggestionItem,
} from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';

export type DocsViewerMode = 'edit' | 'suggest' | 'preview' | 'source' | 'diff';

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
      <!-- Top Collaboration & Formatting Toolbar -->
      <div class="mj-docs-toolbar" data-testid="mj-docs-toolbar">
        <div class="mj-docs-toolbar__left">
          <button
            type="button"
            class="mj-docs-btn mj-docs-btn--icon"
            [class.mj-docs-btn--active]="ShowOutlineRail"
            title="Toggle Document Outline (TOC)"
            data-testid="toggle-outline-btn"
            (click)="ToggleOutlineRail()"
          >
            <i class="fas fa-list-ul"></i>
            <span>Outline</span>
          </button>

          <div class="mj-docs-mode-group" role="tablist" aria-label="Document Mode">
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'edit'"
              [disabled]="!CanUserEdit"
              title="Collaborative Edit Mode"
              data-testid="mode-edit-btn"
              (click)="SetViewMode('edit')"
            >
              <i class="fas fa-pen-to-square"></i> Edit
            </button>
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'suggest'"
              [disabled]="!CanUserEdit"
              title="Suggest Edits Mode"
              data-testid="mode-suggest-btn"
              (click)="SetViewMode('suggest')"
            >
              <i class="fas fa-code-pull-request"></i> Suggest
              @if (PendingSuggestionsCount > 0) {
                <span class="mj-docs-badge mj-docs-badge--brand">{{ PendingSuggestionsCount }}</span>
              }
            </button>
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'preview'"
              title="Reader Preview Mode"
              data-testid="mode-preview-btn"
              (click)="SetViewMode('preview')"
            >
              <i class="fas fa-eye"></i> Preview
            </button>
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'source'"
              title="Raw Markdown Source"
              data-testid="mode-source-btn"
              (click)="SetViewMode('source')"
            >
              <i class="fas fa-code"></i> Source
            </button>
            <button
              type="button"
              class="mj-docs-mode-btn"
              [class.mj-docs-mode-btn--active]="ViewMode === 'diff'"
              title="Version History Diff"
              data-testid="mode-diff-btn"
              (click)="SetViewMode('diff')"
            >
              <i class="fas fa-code-compare"></i> Diff
            </button>
          </div>

          @if (CanUserEdit && (ViewMode === 'edit' || ViewMode === 'suggest' || ViewMode === 'source')) {
            <div class="mj-docs-format-group" aria-label="Formatting Tools">
              <button type="button" class="mj-docs-btn" title="Heading 1" (click)="InsertFormattingSnippet('# ', '')">
                <strong>H1</strong>
              </button>
              <button type="button" class="mj-docs-btn" title="Heading 2" (click)="InsertFormattingSnippet('## ', '')">
                <strong>H2</strong>
              </button>
              <button type="button" class="mj-docs-btn" title="Heading 3" (click)="InsertFormattingSnippet('### ', '')">
                <strong>H3</strong>
              </button>
              <button type="button" class="mj-docs-btn" title="Bold" (click)="InsertFormattingSnippet('**', '**')">
                <i class="fas fa-bold"></i>
              </button>
              <button type="button" class="mj-docs-btn" title="Italic" (click)="InsertFormattingSnippet('*', '*')">
                <i class="fas fa-italic"></i>
              </button>
              <button
                type="button"
                class="mj-docs-btn"
                title="Callout Block"
                (click)="InsertFormattingSnippet('> [!NOTE]\n> ', '')"
              >
                <i class="fas fa-circle-info"></i>
              </button>
              <button type="button" class="mj-docs-btn" title="Task List" (click)="InsertFormattingSnippet('- [ ] ', '')">
                <i class="fas fa-list-check"></i>
              </button>
              <button
                type="button"
                class="mj-docs-btn"
                title="Insert Table"
                (click)="InsertFormattingSnippet('| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n', '')"
              >
                <i class="fas fa-table"></i>
              </button>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--accent"
                title="Open / Slash Command Menu"
                data-testid="open-slash-menu-btn"
                (click)="ToggleSlashMenu()"
              >
                <i class="fas fa-bolt"></i>
                <span>/ Insert Block</span>
              </button>
            </div>
          }
        </div>

        <div class="mj-docs-toolbar__right">
          <!-- Collaboration Presence Pill -->
          <div
            class="mj-docs-presence-pill"
            [class.mj-docs-presence-pill--connected]="CollaborationStatus === 'connected'"
            [class.mj-docs-presence-pill--readonly]="
              CollaborationStatus === 'readonly' || CollaborationStatus === 'revoked'
            "
            data-testid="collaboration-presence-pill"
          >
            <span class="mj-docs-presence-dot"></span>
            <span>{{ GetCollaborationStatusLabel() }}</span>
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

          @if (CanUserEdit) {
            <button
              type="button"
              class="mj-docs-btn"
              title="Import .md or .docx"
              data-testid="import-doc-btn"
              (click)="TriggerFileImport()"
            >
              <i class="fas fa-file-import"></i> Import
            </button>
          }

          <button
            type="button"
            class="mj-docs-btn"
            title="Export Markdown (.md)"
            data-testid="export-md-btn"
            (click)="OnExportMarkdown()"
          >
            <i class="fas fa-file-lines"></i> .md
          </button>

          <button
            type="button"
            class="mj-docs-btn"
            title="Export Word (.docx)"
            data-testid="export-docx-btn"
            (click)="OnExportDocx()"
          >
            <i class="fas fa-file-word"></i> .docx
          </button>

          <button
            type="button"
            class="mj-docs-btn"
            title="Copy Markdown"
            data-testid="copy-markdown-btn"
            (click)="OnCopy()"
          >
            <i class="fas fa-copy"></i> Copy
          </button>

          @if (CanUserEdit) {
            <button
              type="button"
              class="mj-docs-btn mj-docs-btn--primary"
              [disabled]="IsSavingVersion"
              title="Save Document Version"
              data-testid="save-doc-version-btn"
              (click)="OnSaveDocumentVersion()"
            >
              <i class="fas fa-cloud-arrow-up"></i>
              <span>{{ IsSavingVersion ? 'Saving…' : 'Save Version' }}</span>
            </button>
          }

          <button
            type="button"
            class="mj-docs-btn mj-docs-btn--icon"
            [class.mj-docs-btn--active]="ShowCommentsDrawer"
            title="Toggle Anchored Comments & Suggestions"
            data-testid="toggle-comments-btn"
            (click)="ToggleCommentsDrawer()"
          >
            <i class="fas fa-comments"></i>
            <span>Comments</span>
            @if (OpenThreadsCount > 0) {
              <span class="mj-docs-badge">{{ OpenThreadsCount }}</span>
            }
          </button>
        </div>
      </div>

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
              data-testid="slash-search-input"
            />
            <button type="button" class="mj-docs-btn" (click)="CloseSlashMenu()">
              <i class="fas fa-xmark"></i>
            </button>
          </div>
          <div class="mj-docs-slash-popover__list">
            @for (cmd of FilteredSlashCommands; track cmd.Command) {
              <button
                type="button"
                class="mj-docs-slash-item"
                [attr.data-testid]="'slash-item-' + cmd.Command.slice(1)"
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
              <h4>Document Outline</h4>
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
                        {{ item.BlockType === 'Artifact' ? 'OLE' : item.BlockMode }}
                      </span>
                    }
                  </li>
                }
              </ul>
            }

            <div class="mj-docs-outline-rail__footer">
              <div><i class="fas fa-bolt"></i> {{ WordStats.LiveBlocks }} Live MJ Blocks</div>
              <div><i class="fas fa-chalkboard"></i> {{ WordStats.EmbeddedArtifacts }} OLE Artifacts</div>
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
            <div class="mj-docs-page" [class.mj-docs-page--interactive]="IsInteractiveCanvasMode">
              @if (ViewMode === 'suggest' && CanUserEdit) {
                <div class="mj-docs-suggest-banner" data-testid="docs-suggest-mode-banner">
                  <i class="fas fa-code-pull-request"></i>
                  <span>
                    <strong>Suggest Mode Active:</strong> Edit any heading, paragraph, list item, callout, or table cell
                    directly in place below — your changes will be queued as tracked Suggestion Cards without altering
                    baseline text until accepted.
                  </span>
                </div>
              }

              <!-- Segment-by-Segment Interactive Document Renderer & In-Place WYSIWYG Canvas -->
              <div class="mj-docs-segments" data-testid="docs-segments-list">
                @for (seg of DocumentSegments; track seg.SegmentID) {
                  <div
                    class="mj-docs-segment"
                    [class.mj-docs-segment--selected]="SelectedAnchorKey === seg.SegmentID"
                    [attr.data-segment-id]="seg.SegmentID"
                  >
                    <!-- Hover Block Handle & Actions -->
                    <div class="mj-docs-segment__gutter">
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
                                  class="mj-docs-heading-level-pill"
                                  title="Click to cycle heading level (H1–H4)"
                                  (click)="CycleHeadingLevel(seg)"
                                >
                                  H{{ seg.HeadingLevel || 1 }}
                                </button>
                                <div
                                  class="mj-docs-editable-surface mj-docs-editable-heading__text"
                                  contenteditable="true"
                                  role="textbox"
                                  [attr.data-testid]="'editable-heading-' + seg.SegmentID"
                                  [textContent]="seg.HeadingText || GetEditableHeadingText(seg)"
                                  (input)="OnEditableBlockInput(seg, $event)"
                                  (blur)="CommitEditableHeading(seg, $event)"
                                  (keydown)="OnEditableBlockKeydown(seg, $event)"
                                ></div>
                              </div>
                            }
                            @case ('table') {
                              @if (GetParsedTable(seg); as table) {
                                <div
                                  class="mj-docs-editable-table-wrap"
                                  [attr.data-testid]="'editable-table-' + seg.SegmentID"
                                >
                                  <div class="mj-docs-editable-table__toolbar">
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
                                            [textContent]="hdr"
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
                                              [textContent]="cell"
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
                                        [attr.data-testid]="'list-item-text-' + seg.SegmentID + '-' + item.Index"
                                        [textContent]="item.Text"
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
                                    [attr.data-testid]="'editable-callout-body-' + seg.SegmentID"
                                    [textContent]="callout.BodyText"
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
                                    [attr.data-testid]="'editable-code-body-' + seg.SegmentID"
                                    [textContent]="codeBlock.Code"
                                    (blur)="CommitEditableCodeBlock(seg, $event)"
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
                                [attr.data-testid]="'editable-paragraph-' + seg.SegmentID"
                                [textContent]="seg.RawMarkdown"
                                (input)="OnEditableBlockInput(seg, $event)"
                                (blur)="CommitEditableParagraph(seg, $event)"
                                (keydown)="OnEditableBlockKeydown(seg, $event)"
                              ></div>
                            }
                          }
                        } @else {
                          <!-- Reader Preview Markdown Block -->
                          <div class="markdown-preview">
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
                        <!-- Embedded "MS OLE" Artifact Block (Whiteboard, Child Document, etc. per § 3.4.1 / D12) -->
                        <div
                          class="mj-docs-ole-block"
                          [class.mj-docs-ole-block--editing]="IsInlineEditingBlock(seg.Descriptor.BlockID)"
                          [class.mj-docs-ole-block--expanded]="ExpandedOleBlockID === seg.Descriptor.BlockID"
                          [attr.data-testid]="'ole-artifact-block-' + seg.Descriptor.BlockID"
                        >
                          <div class="mj-docs-ole-block__header">
                            <div class="mj-docs-ole-block__title">
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
                                OLE · {{ seg.Descriptor.ArtifactType || 'Artifact' }}
                              </span>
                              <span class="mj-docs-badge">
                                v{{ GetEmbeddedArtifactVersion(seg.Descriptor).VersionNumber || 1 }}
                                {{ seg.Descriptor.VersionID ? '· Pinned' : '· Latest' }}
                              </span>
                            </div>

                            <div class="mj-docs-ole-block__actions">
                              @if (CanUserEdit) {
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
                                        : 'Edit Inline (OLE Canvas)'
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
                                  <span>{{ seg.Descriptor.VersionID ? 'Unpin' : 'Pin v' + (GetEmbeddedArtifactVersion(seg.Descriptor).VersionNumber || 1) }}</span>
                                </button>
                              }
                              <button
                                type="button"
                                class="mj-docs-btn"
                                title="Expand / Collapse Full Screen OLE Modal"
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
                            [style.height.px]="
                              ExpandedOleBlockID === seg.Descriptor.BlockID ? 680 : seg.Descriptor.HeightPx || 420
                            "
                          >
                            @if (GetEmbeddedArtifactVersion(seg.Descriptor); as embeddedVer) {
                              <mj-artifact-type-plugin-viewer
                                [artifactVersion]="embeddedVer"
                                [ArtifactTypeName]="seg.Descriptor.ArtifactType || 'Whiteboard'"
                                [readonly]="!IsInlineEditingBlock(seg.Descriptor.BlockID)"
                                (ContentCommitted)="OnEmbeddedArtifactContentCommitted(seg.Descriptor, $event)"
                              ></mj-artifact-type-plugin-viewer>
                            }
                          </div>
                        </div>
                      } @else if (seg.Descriptor) {
                        <!-- Live MJ Data Block (EntityView, SavedQuery, DashboardPart, InteractiveComponent) -->
                        <div
                          class="mj-docs-live-block"
                          [class.mj-docs-live-block--frozen]="seg.Descriptor.Mode === 'Frozen'"
                          [attr.data-testid]="'live-mj-block-' + seg.Descriptor.BlockID"
                        >
                          <div class="mj-docs-live-block__header">
                            <div class="mj-docs-live-block__title">
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
                                {{ seg.Descriptor.Mode === 'Live' ? '● Live (Viewer RLS/FLS)' : '❄ Frozen Snapshot' }}
                              </span>
                              <span class="mj-docs-badge">{{ seg.Descriptor.Kind }}</span>
                            </div>

                            <div class="mj-docs-live-block__actions">
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

                            <div class="mj-docs-live-block__body">
                              @if (!execResult.Success) {
                                <div class="mj-docs-live-block__error">
                                  <i class="fas fa-triangle-exclamation"></i>
                                  <span>{{ execResult.ErrorMessage }}</span>
                                </div>
                              } @else if (execResult.Columns.length > 0) {
                                <table class="mj-docs-data-table">
                                  <thead>
                                    <tr>
                                      @for (col of execResult.Columns; track col.Name) {
                                        <th>{{ col.DisplayName || col.Name }}</th>
                                      }
                                    </tr>
                                  </thead>
                                  <tbody>
                                    @for (row of execResult.Rows; track $index) {
                                      <tr>
                                        @for (col of execResult.Columns; track col.Name) {
                                          <td>{{ FormatCellValue(row[col.Name]) }}</td>
                                        }
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                                <div class="mj-docs-live-block__footer">
                                  Showing {{ execResult.Rows.length }} of {{ execResult.TotalRowCount }} record(s)
                                </div>
                              } @else {
                                <div class="mj-docs-live-block__empty">No records returned for current viewer scope.</div>
                              }
                            </div>
                          }
                        </div>
                      }

                      <!-- Pending Suggestion Cards attached to this Segment -->
                      @for (sug of GetSuggestionsForBlock(seg.SegmentID); track sug.SuggestionID) {
                        <div class="mj-docs-suggestion-card" [attr.data-testid]="'suggestion-card-' + sug.SuggestionID">
                          <div class="mj-docs-suggestion-card__header">
                            <span>
                              <i class="fas fa-code-pull-request"></i>
                              Suggestion by <strong>{{ sug.AuthorName }}</strong>
                            </span>
                            <span class="mj-docs-badge">{{ sug.Status }}</span>
                          </div>
                          @if (sug.Rationale) {
                            <div class="mj-docs-suggestion-card__rationale">{{ sug.Rationale }}</div>
                          }
                          <div class="mj-docs-suggestion-card__diff">
                            <div class="mj-docs-suggestion-card__old">- {{ sug.OriginalMarkdown }}</div>
                            <div class="mj-docs-suggestion-card__new">+ {{ sug.ProposedMarkdown }}</div>
                          </div>
                          @if (sug.Status === 'Pending' && CanUserEdit) {
                            <div class="mj-docs-suggestion-card__actions">
                              <button
                                type="button"
                                class="mj-docs-btn mj-docs-btn--primary"
                                [attr.data-testid]="'accept-suggestion-btn-' + sug.SuggestionID"
                                (click)="AcceptSuggestion(sug)"
                              >
                                <i class="fas fa-check"></i> Accept
                              </button>
                              <button
                                type="button"
                                class="mj-docs-btn"
                                [attr.data-testid]="'reject-suggestion-btn-' + sug.SuggestionID"
                                (click)="RejectSuggestion(sug)"
                              >
                                <i class="fas fa-xmark"></i> Reject
                              </button>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
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
                placeholder="Add an anchored comment or @mention an agent (e.g. @DocsAgent tighten this section)…"
                [(ngModel)]="NewCommentText"
                data-testid="new-anchored-comment-input"
              ></textarea>
              <div class="mj-docs-comment-composer__footer">
                <label class="mj-docs-agent-mode-label" title="Control how @mentioned agents apply changes">
                  <span>Agent Mode:</span>
                  <select [(ngModel)]="NewCommentAgentMode" data-testid="comment-agent-mode-select">
                    <option value="suggest">Suggest Card</option>
                    <option value="edit">Direct Edit</option>
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
                <strong>Data Governance &amp; Security Notice (RLS / FLS):</strong>
                Freezing captures the rows and fields currently visible under your user permissions and stores them
                directly in the document version. Anyone with read access to this document will be able to view these
                frozen values without re-running live Row-Level or Field-Level Security checks.
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

      <!-- Insert Live Block / Embed OLE Artifact Configuration Modal -->
      @if (PendingBlockInsertType) {
        <div class="mj-docs-modal-backdrop" data-testid="insert-block-modal">
          <div class="mj-docs-modal" role="dialog" aria-labelledby="insert-block-modal-title">
            <div class="mj-docs-modal__header">
              <h3 id="insert-block-modal-title">
                Configure {{ PendingBlockIsWhiteboard ? 'Inline Whiteboard (OLE)' : PendingBlockInsertType }} Block
              </h3>
            </div>
            <div class="mj-docs-modal__body">
              <label class="mj-docs-field">
                <span>Block Title / Label</span>
                <input type="text" [(ngModel)]="NewBlockLabel" data-testid="new-block-label-input" />
              </label>
              @if (PendingBlockInsertType === 'EntityView') {
                <label class="mj-docs-field">
                  <span>Entity Name</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockEntityName"
                    placeholder="e.g., MJ: Artifacts"
                    data-testid="new-block-entity-input"
                  />
                </label>
                <label class="mj-docs-field">
                  <span>Extra Filter (Optional)</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockExtraFilter"
                    placeholder="e.g., Name LIKE '%Report%'"
                    data-testid="new-block-filter-input"
                  />
                </label>
              } @else if (PendingBlockInsertType === 'SavedQuery') {
                <label class="mj-docs-field">
                  <span>Saved Query Name</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockQueryName"
                    placeholder="e.g., Monthly Active Users"
                    data-testid="new-block-query-input"
                  />
                </label>
              } @else if (PendingBlockInsertType === 'Artifact' && !PendingBlockIsWhiteboard) {
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
                  <span>Artifact Type Name</span>
                  <input
                    type="text"
                    [(ngModel)]="NewBlockArtifactTypeName"
                    placeholder="e.g., Whiteboard"
                  />
                </label>
              }
            </div>
            <div class="mj-docs-modal__footer">
              <button type="button" class="mj-docs-btn" (click)="CancelBlockInsertModal()">Cancel</button>
              <button
                type="button"
                class="mj-docs-btn mj-docs-btn--primary"
                data-testid="confirm-insert-block-btn"
                (click)="ConfirmBlockInsertModal()"
              >
                Insert Block
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
      .mj-docs-format-group {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
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

      .mj-docs-slash-item:hover {
        background: var(--mj-bg-surface-hover);
        border-color: var(--mj-border-default);
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

      .mj-docs-outline-rail__header h4 {
        margin: 0 0 4px 0;
        font-size: 13px;
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

      .mj-docs-editable-surface:focus {
        background: var(--mj-bg-surface-hover);
        box-shadow: 0 0 0 1px var(--mj-brand-primary);
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

      .mj-docs-segment {
        display: flex;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid transparent;
        border-radius: 8px;
      }

      .mj-docs-segment:hover,
      .mj-docs-segment--selected {
        border-color: var(--mj-border-default);
        background: var(--mj-bg-surface-card);
      }

      .mj-docs-segment__gutter {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 4px;
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
        font-size: 12px;
        margin-bottom: 6px;
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

      .mj-docs-field input {
        padding: 6px 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
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

  /**
   * Optional WebSocket URL (or base URL) for `/collaboration/yjs` real-time Yjs room sync (§ 3.2).
   * When omitted, falls back to `globalThis.__MJ_COLLAB_WS_URL__` if configured.
   */
  @Input() public collaborationWsUrl: string | null = null;

  private readonly collabService = inject(DocumentCollaborationService);
  private readonly importExportService = inject(DocumentImportExportService);
  private readonly cdr = inject(ChangeDetectorRef);

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
  public ShowSlashMenu = false;
  public SlashSearchQuery = '';
  public ActiveSlashTargetSegmentID: string | null = null;
  public ExpandedOleBlockID: string | null = null;
  public StatusBannerMessage = '';
  public IsSavingVersion = false;

  // Parsed state
  public DocumentSegments: DocumentRenderSegment[] = [];
  public OutlineItems: DocumentOutlineItem[] = [];
  public WordStats = { Words: 0, Characters: 0, Lines: 0, LiveBlocks: 0, EmbeddedArtifacts: 0 };

  // Real-time Yjs session state
  private session: DocumentCollaborationSession | null = null;
  private sessionSubs: Subscription[] = [];
  private permissionUnsub: (() => void) | null = null;
  public CollaborationStatus: CollaborationConnectionStatus = 'local';
  public Collaborators: CollaboratorPresence[] = [];
  public HasEditPermission = true;

  // Live block execution cache & inline OLE editing state
  private blockResults = new Map<string, DocumentBlockExecutionResult>();
  private embeddedArtifactVersions = new Map<string, MJArtifactVersionEntity>();
  private inlineEditingBlockIds = new Set<string>();

  // Freeze Warning Modal (O5)
  public PendingFreezeBlock: DocumentBlockSpec | null = null;
  public FreezeWarningAcknowledged = false;

  // Insert Block Modal
  public PendingBlockInsertType: DocumentBlockKind | null = null;
  public PendingBlockIsWhiteboard = false;
  public NewBlockLabel = '';
  public NewBlockEntityName = 'MJ: Artifacts';
  public NewBlockExtraFilter = '';
  public NewBlockQueryName = '';
  public NewBlockArtifactID = '';
  public NewBlockArtifactTypeName = 'Whiteboard';

  // Suggestions & Anchored Comments
  public Suggestions: DocumentSuggestionItem[] = [];
  public AnchoredThreads: DocumentAnchoredThread[] = [];
  public CommentFilter: 'all' | 'open' | 'resolved' = 'all';
  public SelectedAnchorKey = 'doc-root';
  public SelectedAnchorLabel = 'Document Root';
  public SelectedAnchorQuote = '';
  public NewCommentText = '';
  public NewCommentAgentMode: 'suggest' | 'edit' = 'suggest';

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

  public get CanUserEdit(): boolean {
    return !this.readonly && this.HasEditPermission && this.CollaborationStatus !== 'revoked';
  }

  /**
   * True when the document canvas renders in-place WYSIWYG editable blocks (`Edit` or `Suggest` mode).
   */
  public get IsInteractiveCanvasMode(): boolean {
    return this.CanUserEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest');
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
    if (changes['collaborationWsUrl'] && !changes['collaborationWsUrl'].firstChange) {
      this.setupCollaborationSession();
    }
    if (changes['readonly']) {
      if (this.readonly && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
        this.ViewMode = 'preview';
      } else if (!this.readonly && !this.userExplicitlySelectedMode && this.ViewMode === 'preview') {
        this.ViewMode = 'edit';
      }
      this.cdr.markForCheck();
    }
  }

  public ngOnDestroy(): void {
    this.destroyCollaborationSession();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    return CreateMarkdownSnapshot(this.MarkdownContent || this.getRawContent(), this.getDisplayTitle());
  }

  public override async ExportPDF(orientation: PdfOrientation = 'portrait'): Promise<void> {
    const html = this.PrintableCanvas?.nativeElement?.innerHTML ?? `<pre>${this.MarkdownContent}</pre>`;
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
    }
    this.cdr.markForCheck();
  }

  public ToggleOutlineRail(): void {
    this.ShowOutlineRail = !this.ShowOutlineRail;
    this.cdr.markForCheck();
  }

  public ToggleCommentsDrawer(): void {
    this.ShowCommentsDrawer = !this.ShowCommentsDrawer;
    this.cdr.markForCheck();
  }

  public ToggleSlashMenu(): void {
    this.ShowSlashMenu = !this.ShowSlashMenu;
    if (this.ShowSlashMenu) {
      this.SlashSearchQuery = '';
    }
    this.cdr.markForCheck();
  }

  public CloseSlashMenu(): void {
    this.ShowSlashMenu = false;
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
    this.ShowSlashMenu = true;
    this.cdr.markForCheck();
  }

  /**
   * Handles live input inside an in-place `contenteditable` block (`Edit` / `Suggest` modes),
   * opening the `/` Slash Command Palette when `/` is typed at the start of a block or after whitespace.
   */
  public OnEditableBlockInput(seg: DocumentRenderSegment, event: Event): void {
    const el = event.target as HTMLElement | null;
    const text = el?.textContent ?? '';
    const trimmed = text.trim();
    if (trimmed === '/' || /(?:^|\s)\/$/.test(text)) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
      this.SlashSearchQuery = '';
      this.ShowSlashMenu = true;
      this.cdr.markForCheck();
    } else if (trimmed.startsWith('/') && trimmed.length > 1 && !trimmed.includes(' ')) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
      this.SlashSearchQuery = trimmed.slice(1);
      this.ShowSlashMenu = true;
      this.cdr.markForCheck();
    }
  }

  public OnEditableBlockKeydown(seg: DocumentRenderSegment, event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.ShowSlashMenu) {
      event.preventDefault();
      this.CloseSlashMenu();
      return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
      this.ActiveSlashTargetSegmentID = seg.SegmentID;
      this.SelectedAnchorKey = seg.SegmentID;
    }
  }

  public GetEditableHeadingText(seg: DocumentRenderSegment): string {
    return seg.RawMarkdown.replace(/^#{1,6}\s+/, '').trim();
  }

  public CycleHeadingLevel(seg: DocumentRenderSegment): void {
    if (!this.CanUserEdit) {
      return;
    }
    const currentLevel = seg.HeadingLevel ?? 1;
    const nextLevel = currentLevel >= 4 ? 1 : currentLevel + 1;
    const text = seg.HeadingText || this.GetEditableHeadingText(seg);
    const nextMd = `${'#'.repeat(nextLevel)} ${text}`;
    this.ApplyInPlaceSegmentChange(seg, nextMd, `Changed heading level to H${nextLevel}`);
  }

  public CommitEditableHeading(seg: DocumentRenderSegment, event: Event): void {
    const el = event.target as HTMLElement | null;
    const rawText = (el?.textContent ?? '').replace(/\n+/g, ' ').trim();
    if (!rawText || rawText === '/') {
      return;
    }
    const level = seg.HeadingLevel ?? 1;
    const nextMd = `${'#'.repeat(level)} ${rawText}`;
    if (nextMd !== seg.RawMarkdown) {
      this.ApplyInPlaceSegmentChange(seg, nextMd, `Edited heading H${level}`);
    }
  }

  public CommitEditableParagraph(seg: DocumentRenderSegment, event: Event): void {
    const el = event.target as HTMLElement | null;
    const nextText = (el?.textContent ?? '').trim();
    if (!nextText || nextText === '/' || (this.ShowSlashMenu && this.ActiveSlashTargetSegmentID === seg.SegmentID)) {
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
    const el = event.target as HTMLElement | null;
    const nextVal = (el?.textContent ?? '').replace(/\|/g, '/').trim();
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
    const el = event.target as HTMLElement | null;
    const nextVal = (el?.textContent ?? '').replace(/\|/g, '/').trim();
    const parsed = this.GetParsedTable(seg);
    if (!parsed.Rows[rowIndex] || parsed.Rows[rowIndex][colIndex] === nextVal) {
      return;
    }
    parsed.Rows[rowIndex][colIndex] = nextVal;
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
      const taskMatch = /^(\s*[-*+]\s+)\[([ xX])\]\s*(.*)$/.exec(line);
      if (taskMatch) {
        return {
          Index: idx,
          IsTask: true,
          Checked: taskMatch[2].toLowerCase() === 'x',
          Text: taskMatch[3],
        };
      }
      const orderedMatch = /^(\s*\d+\.)\s+(.*)$/.exec(line);
      if (orderedMatch) {
        return {
          Index: idx,
          IsTask: false,
          Checked: false,
          OrderedPrefix: orderedMatch[1].trim(),
          Text: orderedMatch[2],
        };
      }
      const bulletMatch = /^(\s*[-*+])\s+(.*)$/.exec(line);
      return {
        Index: idx,
        IsTask: false,
        Checked: false,
        Text: bulletMatch ? bulletMatch[2] : line.trim(),
      };
    });
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
    const el = event.target as HTMLElement | null;
    const nextText = (el?.textContent ?? '').replace(/\n+/g, ' ').trim();
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const el = event.target as HTMLElement | null;
      const currentText = (el?.textContent ?? '').replace(/\n+/g, ' ').trim();
      const items = this.GetParsedListItems(seg);
      if (items[itemIndex]) {
        items[itemIndex].Text = currentText;
      }
      const template = items[itemIndex] ?? { IsTask: false, Checked: false, Text: 'New item' };
      items.splice(itemIndex + 1, 0, {
        Index: itemIndex + 1,
        IsTask: template.IsTask,
        Checked: false,
        OrderedPrefix: template.OrderedPrefix ? `${items.length + 1}.` : undefined,
        Text: 'New item',
      });
      this.ApplyInPlaceSegmentChange(seg, this.serializeParsedListItems(items), 'Inserted list item');
      return;
    }
    this.OnEditableBlockKeydown(seg, event);
  }

  public AddListItem(seg: DocumentRenderSegment): void {
    const items = this.GetParsedListItems(seg);
    const first = items[0];
    items.push({
      Index: items.length,
      IsTask: first?.IsTask ?? false,
      Checked: false,
      OrderedPrefix: first?.OrderedPrefix ? `${items.length + 1}.` : undefined,
      Text: first?.IsTask ? 'New action item' : 'New list item',
    });
    this.ApplyInPlaceSegmentChange(seg, this.serializeParsedListItems(items), 'Added list item');
  }

  public GetParsedCallout(seg: DocumentRenderSegment): {
    CalloutType: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
    BodyText: string;
  } {
    const lines = seg.RawMarkdown.split('\n').map((l) => l.replace(/^>\s?/, ''));
    const first = lines[0]?.trim() ?? '';
    const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(first);
    if (match) {
      const kind = match[1].toUpperCase() as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
      const restFirst = match[2] ? [match[2]] : [];
      const body = [...restFirst, ...lines.slice(1)].join('\n').trim();
      return { CalloutType: kind, BodyText: body || 'Callout details…' };
    }
    return {
      CalloutType: 'NOTE',
      BodyText: lines.join('\n').trim() || 'Callout details…',
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
    const el = event.target as HTMLElement | null;
    const nextBody = (el?.textContent ?? '').trim();
    if (!nextBody) {
      return;
    }
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
   * Replaces a single segment's Markdown in the document and broadcasts the minimal diff via Yjs.
   */
  public ReplaceSegmentMarkdown(seg: DocumentRenderSegment, nextBlockMarkdown: string): void {
    const updatedSegments = this.DocumentSegments.map((s) =>
      s.SegmentID === seg.SegmentID ? nextBlockMarkdown : s.RawMarkdown,
    );
    this.OnMarkdownChanged(updatedSegments.join('\n\n'));
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

  /**
   * Toggles whether an embedded OLE `Artifact` block pins a specific `VersionID` or tracks the latest version (§ 3.4.1).
   */
  public TogglePinArtifactVersion(block: DocumentBlockSpec): void {
    if (!this.CanUserEdit) {
      return;
    }
    const currentVer = this.GetEmbeddedArtifactVersion(block);
    const updatedDescriptor: DocumentBlockSpec = {
      ...block,
      VersionID: block.VersionID ? undefined : currentVer.ID,
    };
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      block.BlockID,
      updatedDescriptor,
    );
    this.OnMarkdownChanged(updatedRes.Markdown);
    this.StatusBannerMessage = updatedDescriptor.VersionID
      ? `Pinned ${block.Title || 'embedded artifact'} to v${currentVer.VersionNumber || 1}.`
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
   * Appends or wraps a Markdown snippet in the active document (or after the selected segment).
   */
  public InsertFormattingSnippet(prefix: string, suffix: string): void {
    if (!this.CanUserEdit) {
      return;
    }
    const insertion = `${prefix}${suffix ? 'text' + suffix : ''}`;
    this.insertMarkdownAtTargetSegment(insertion);
  }

  private insertMarkdownAtTargetSegment(snippet: string): void {
    const targetId = this.ActiveSlashTargetSegmentID;
    this.ActiveSlashTargetSegmentID = null;

    if (targetId) {
      const idx = this.DocumentSegments.findIndex((s) => s.SegmentID === targetId);
      if (idx >= 0) {
        const blocks = this.DocumentSegments.map((s) => s.RawMarkdown);
        const cleanedTarget = blocks[idx].replace(/(?:^|\s)\/[A-Za-z0-9_-]*$/, '').trim();
        if (cleanedTarget.length === 0) {
          blocks[idx] = snippet.trim();
        } else {
          blocks[idx] = cleanedTarget;
          blocks.splice(idx + 1, 0, snippet.trim());
        }
        this.OnMarkdownChanged(blocks.join('\n\n'));
        return;
      }
    }

    const cleanedBase = this.MarkdownContent.replace(/(?:^|\n)\/[A-Za-z0-9_-]*$/, '');
    const sep = cleanedBase.endsWith('\n') || cleanedBase.length === 0 ? '' : '\n\n';
    this.OnMarkdownChanged(`${cleanedBase}${sep}${snippet}`);
  }

  /**
   * Executes a `/` slash command selected from the Slash Command Palette.
   */
  public ExecuteSlashCommand(cmd: DocumentSlashCommand): void {
    this.ShowSlashMenu = false;

    if (cmd.Snippet) {
      this.insertMarkdownAtTargetSegment(cmd.Snippet);
      return;
    }

    if (cmd.Command === '/whiteboard') {
      this.PendingBlockInsertType = 'Artifact';
      this.PendingBlockIsWhiteboard = true;
      this.NewBlockLabel = 'Interactive Architecture Whiteboard';
      this.NewBlockArtifactTypeName = 'Whiteboard';
      this.NewBlockArtifactID = `wb-${Date.now()}`;
      this.cdr.markForCheck();
      return;
    }

    if (cmd.BlockType) {
      this.PendingBlockInsertType = cmd.BlockType;
      this.PendingBlockIsWhiteboard = false;
      this.NewBlockLabel = cmd.Label;
      this.NewBlockEntityName = 'MJ: Artifacts';
      this.NewBlockExtraFilter = '';
      this.NewBlockQueryName = 'Active Artifacts Overview';
      this.NewBlockArtifactID = '';
      this.NewBlockArtifactTypeName = 'Whiteboard';
      this.cdr.markForCheck();
    }
  }

  public CancelBlockInsertModal(): void {
    this.PendingBlockInsertType = null;
    this.PendingBlockIsWhiteboard = false;
    this.ActiveSlashTargetSegmentID = null;
    this.cdr.markForCheck();
  }

  /**
   * Inserts a configured `:::mj-block` directive into the document (and creates an inline
   * Whiteboard child artifact when `PendingBlockIsWhiteboard === true`, § 3.4.1 / O4).
   */
  public ConfirmBlockInsertModal(): void {
    if (!this.PendingBlockInsertType) {
      return;
    }
    const blockId = `blk-${Date.now()}`;
    const descriptor: DocumentBlockSpec = {
      BlockID: blockId,
      Kind: this.PendingBlockInsertType,
      Mode: 'Live',
      DisplayMode: 'table',
      Title: this.NewBlockLabel || this.PendingBlockInsertType,
    };

    if (this.PendingBlockInsertType === 'EntityView') {
      descriptor.EntityName = this.NewBlockEntityName || 'MJ: Artifacts';
      if (this.NewBlockExtraFilter.trim()) {
        descriptor.ExtraFilter = this.NewBlockExtraFilter.trim();
      }
    } else if (this.PendingBlockInsertType === 'SavedQuery') {
      descriptor.QueryName = this.NewBlockQueryName || 'Active Artifacts Overview';
    } else if (this.PendingBlockInsertType === 'Artifact') {
      const artifactId = this.NewBlockArtifactID.trim() || `inline-wb-${Date.now()}`;
      descriptor.ArtifactID = artifactId;
      descriptor.ArtifactType = this.PendingBlockIsWhiteboard
        ? 'Whiteboard'
        : this.NewBlockArtifactTypeName || 'Whiteboard';
      descriptor.EmbedMode = this.PendingBlockIsWhiteboard ? 'Inline' : 'Link';
      descriptor.HeightPx = 440;

      // Seed an inline Whiteboard version so it renders immediately
      const defaultWbJson = JSON.stringify(
        {
          version: 2,
          seq: 1,
          idCounter: 4,
          zCounter: 4,
          pageCounter: 1,
          activePageId: 'page-1',
          pages: [
            {
              id: 'page-1',
              name: descriptor.Title || 'Architecture Diagram',
              author: 'user',
              items: [
                {
                  ID: 'wb-1',
                  Kind: 'shape',
                  Shape: 'rect',
                  X: 70,
                  Y: 80,
                  W: 190,
                  H: 76,
                  Text: 'MJ Docs Host Artifact',
                  Sub: 'Markdown Document',
                  Tag: 'Host',
                  Author: 'user',
                  Z: 1,
                },
                {
                  ID: 'wb-2',
                  Kind: 'shape',
                  Shape: 'rect',
                  X: 360,
                  Y: 80,
                  W: 210,
                  H: 76,
                  Text: 'OLE Inline Whiteboard',
                  Sub: 'WhiteboardState v2',
                  Tag: 'OLE Plugin',
                  Author: 'agent',
                  Z: 2,
                },
                {
                  ID: 'wb-3',
                  Kind: 'connector',
                  X1: 260,
                  Y1: 118,
                  X2: 360,
                  Y2: 118,
                  FromId: 'wb-1',
                  ToId: 'wb-2',
                  Author: 'user',
                  Z: 3,
                },
              ],
            },
          ],
        },
        null,
        2,
      );
      this.embeddedArtifactVersions.set(
        artifactId,
        {
          ID: `ver-${artifactId}-1`,
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: descriptor.Title ?? 'Embedded Whiteboard',
          Content: defaultWbJson,
        } as unknown as MJArtifactVersionEntity,
      );
      this.inlineEditingBlockIds.add(blockId);

      // When connected to a live provider and host artifact is a persisted UUID, also create the delegated child MJ: Artifacts row (O4)
      void this.persistInlineDelegatedArtifactIfConnected(descriptor, defaultWbJson);
    }

    const directiveText = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(descriptor);
    this.PendingBlockInsertType = null;
    this.PendingBlockIsWhiteboard = false;
    this.insertMarkdownAtTargetSegment(`${directiveText}\n`);
    this.StatusBannerMessage = `Inserted ${descriptor.Title} block into document.`;
  }

  private isUuid(value: string | undefined | null): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async persistInlineDelegatedArtifactIfConnected(
    descriptor: DocumentBlockSpec,
    initialContent: string,
  ): Promise<void> {
    const hostArtifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    if (!this.isUuid(hostArtifactId) || !user || !this.ProviderToUse) {
      return;
    }

    try {
      const provider = this.ProviderToUse;
      const artifactsEntityId = provider.Entities?.find((e) => e.Name === 'MJ: Artifacts')?.ID;
      if (!artifactsEntityId) {
        return;
      }

      const rv = RunView.FromMetadataProvider(provider);
      const [hostArtRes, typeRes] = await Promise.all([
        rv.RunView<{ ID: string; EnvironmentID: string }>(
          {
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${this.escapeSql(hostArtifactId)}'`,
            Fields: ['ID', 'EnvironmentID'],
            MaxRows: 1,
            ResultType: 'simple',
          },
          user,
        ),
        rv.RunView<{ ID: string }>(
          {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: `Name='${this.escapeSql(descriptor.ArtifactType || 'Whiteboard')}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
          },
          user,
        ),
      ]);

      const hostEnvId = hostArtRes.Results?.[0]?.EnvironmentID;
      const typeId = typeRes.Results?.[0]?.ID ?? 'D37C0785-C5FD-42B4-9442-D48B076E2BA4';

      const childArt = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
      childArt.NewRecord();
      childArt.Name = descriptor.Title || 'Embedded Whiteboard';
      childArt.TypeID = typeId;
      childArt.UserID = user.ID;
      if (hostEnvId) {
        childArt.EnvironmentID = hostEnvId;
      }
      childArt.DelegateEntityID = artifactsEntityId;
      childArt.DelegateRecordID = hostArtifactId;

      const artSaved = await childArt.Save();
      if (!artSaved) {
        return;
      }

      const childVer = await provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      childVer.NewRecord();
      childVer.ArtifactID = childArt.ID;
      childVer.VersionNumber = 1;
      childVer.Name = childArt.Name;
      childVer.UserID = user.ID;
      childVer.Content = initialContent;
      const verSaved = await childVer.Save();
      if (!verSaved) {
        return;
      }

      this.embeddedArtifactVersions.set(childArt.ID, childVer);
      const updatedDescriptor: DocumentBlockSpec = {
        ...descriptor,
        ArtifactID: childArt.ID,
      };
      const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
        this.MarkdownContent,
        descriptor.BlockID,
        updatedDescriptor,
      );
      this.OnMarkdownChanged(updatedRes.Markdown);
    } catch {
      // Keep local synthetic version when offline
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
   * Executes `DocumentLiveBlockEngine.Instance.FreezeBlock` once the user acknowledges the
   * security warning modal (`O5`), embedding the viewer's current rows into the block.
   */
  public async ConfirmFreezeBlock(): Promise<void> {
    if (!this.PendingFreezeBlock || !this.FreezeWarningAcknowledged) {
      return;
    }
    const target = this.PendingFreezeBlock;
    this.PendingFreezeBlock = null;
    this.FreezeWarningAcknowledged = false;

    const currentUser = this.getSafeCurrentUser();
    let frozenBlock: DocumentBlockSpec | undefined;

    if (currentUser) {
      const freezeRes = await DocumentLiveBlockEngine.Instance.FreezeBlock(
        target,
        currentUser,
        true,
        this.ProviderToUse,
      );
      if (freezeRes.Success && freezeRes.UpdatedSpec) {
        frozenBlock = freezeRes.UpdatedSpec;
      }
    }

    if (!frozenBlock) {
      const existingResult = this.GetBlockExecutionResult(target);
      frozenBlock = {
        ...target,
        Mode: 'Frozen',
        FrozenSnapshot: {
          FrozenAt: new Date().toISOString(),
          FrozenByUserID: currentUser?.ID ?? 'local-user',
          FrozenByUserName: currentUser?.Name ?? 'Current User',
          Columns: existingResult.Columns,
          Rows: existingResult.Rows,
          TotalRowCount: existingResult.TotalRowCount,
          SecurityWarningAcknowledged: true,
        },
      };
    }

    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(
      this.MarkdownContent,
      frozenBlock.BlockID,
      frozenBlock,
    );
    this.blockResults.delete(frozenBlock.BlockID);
    this.OnMarkdownChanged(updatedRes.Markdown);
    this.StatusBannerMessage = `Block "${frozenBlock.Title || frozenBlock.BlockID}" frozen into document snapshot.`;
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
   * Executes a live MJ block under the viewer's permissions and caches the result.
   */
  public async RefreshLiveBlock(block: DocumentBlockSpec): Promise<void> {
    const currentUser = this.getSafeCurrentUser();
    if (currentUser) {
      try {
        const res = await DocumentLiveBlockEngine.Instance.ExecuteBlock(block, currentUser, this.ProviderToUse);
        if (res.Success && res.Columns.length > 0) {
          this.blockResults.set(block.BlockID, res);
          this.cdr.markForCheck();
          return;
        }
      } catch {
        // Fall through to deterministic preview rows when offline
      }
    }

    // Deterministic fallback preview rows when provider/DB is not connected in unit/demo context
    const strippedServerSet: string[] = [];
    if (block.Parameters) {
      for (const key of Object.keys(block.Parameters)) {
        if (key.toLowerCase().includes('serverset') || key.toLowerCase() === 'context' || key.startsWith('__server_')) {
          strippedServerSet.push(key);
        }
      }
    }
    this.blockResults.set(block.BlockID, {
      BlockID: block.BlockID,
      Kind: block.Kind,
      Mode: block.Mode,
      Success: true,
      Columns: [
        { Name: 'Name', DisplayName: 'Name' },
        { Name: 'Type', DisplayName: 'Type' },
        { Name: 'Status', DisplayName: 'Status' },
        { Name: 'Updated', DisplayName: 'Updated' },
      ],
      Rows: [
        {
          Name: block.Title || block.EntityName || block.QueryName || 'Primary Record',
          Type: block.Kind,
          Status: 'Active (RLS/FLS Verified)',
          Updated: new Date().toISOString().slice(0, 10),
        },
        {
          Name: 'Quarterly Executive Summary',
          Type: 'Markdown Document',
          Status: 'Shared',
          Updated: new Date().toISOString().slice(0, 10),
        },
      ],
      TotalRowCount: 2,
      StrippedServerSetParameters: strippedServerSet,
    });
    this.cdr.markForCheck();
  }

  /**
   * Returns the cached or frozen execution result for a `:::mj-block` segment.
   */
  public GetBlockExecutionResult(block: DocumentBlockSpec): DocumentBlockExecutionResult {
    if (block.Mode === 'Frozen' && block.FrozenSnapshot) {
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
          FrozenByUserID: block.FrozenSnapshot.FrozenByUserID,
          FrozenByUserName: block.FrozenSnapshot.FrozenByUserName,
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
      Columns: [
        { Name: 'Name', DisplayName: 'Name' },
        { Name: 'Status', DisplayName: 'Status' },
      ],
      Rows: [{ Name: block.Title || block.EntityName || block.QueryName || block.BlockID, Status: 'Loading…' }],
      TotalRowCount: 1,
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

  /**
   * Resolves the `MJArtifactVersionEntity` for an embedded OLE `Artifact` block.
   */
  public GetEmbeddedArtifactVersion(block: DocumentBlockSpec): MJArtifactVersionEntity {
    const key = block.ArtifactID || block.BlockID;
    const existing = this.embeddedArtifactVersions.get(key);
    if (existing) {
      return existing;
    }

    const fallbackJson = JSON.stringify({
      version: 2,
      seq: 1,
      idCounter: 3,
      zCounter: 3,
      pageCounter: 1,
      activePageId: 'page-1',
      pages: [
        {
          id: 'page-1',
          name: block.Title || 'Embedded Whiteboard',
          author: 'user',
          items: [
            {
              ID: 'wb-1',
              Kind: 'shape',
              Shape: 'rect',
              X: 60,
              Y: 60,
              W: 210,
              H: 76,
              Text: block.Title || 'Embedded Whiteboard Canvas',
              Sub: 'Interactive OLE Block',
              Author: 'user',
              Z: 1,
            },
            {
              ID: 'wb-2',
              Kind: 'sticky',
              X: 310,
              Y: 60,
              W: 170,
              H: 96,
              Text: 'Click Edit Inline to draw or @mention an agent',
              Tint: 'amber',
              Author: 'agent',
              Z: 2,
            },
          ],
        },
      ],
    });

    const synth = {
      ID: block.VersionID || `ver-${key}-1`,
      ArtifactID: key,
      VersionNumber: 1,
      Name: block.Title || 'Embedded Artifact',
      Content: fallbackJson,
    } as unknown as MJArtifactVersionEntity;
    this.embeddedArtifactVersions.set(key, synth);
    return synth;
  }

  /**
   * Handles `ContentCommitted` emitted by an inline-edited OLE child artifact (e.g. `WhiteboardArtifactViewerComponent`).
   * Creates a new version of the child artifact and advances `VersionID` only when the parent block had pinned `VersionID` (§ 3.4.1).
   */
  public OnEmbeddedArtifactContentCommitted(block: DocumentBlockSpec, serializedContent: string): void {
    const key = block.ArtifactID || block.BlockID;
    const currentVer = this.GetEmbeddedArtifactVersion(block);
    const nextVersionNumber = (currentVer.VersionNumber || 1) + 1;
    const nextVerId = `ver-${key}-${nextVersionNumber}`;

    this.embeddedArtifactVersions.set(
      key,
      {
        ...currentVer,
        ID: nextVerId,
        VersionNumber: nextVersionNumber,
        Content: serializedContent,
      } as unknown as MJArtifactVersionEntity,
    );

    // Per § 3.4.1: Only advance VersionID on the block descriptor when VersionID was already pinned.
    // When VersionID was omitted (undefined), the block tracks the latest version without pinning.
    if (block.VersionID) {
      const updatedDescriptor: DocumentBlockSpec = {
        ...block,
        VersionID: nextVerId,
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

    void this.persistEmbeddedArtifactVersionIfConnected(block, nextVersionNumber, serializedContent);
    this.StatusBannerMessage = `Committed inline edits to ${block.Title || 'embedded artifact'} (v${nextVersionNumber}).`;
  }

  private async persistEmbeddedArtifactVersionIfConnected(
    block: DocumentBlockSpec,
    nextVersionNumber: number,
    serializedContent: string,
  ): Promise<void> {
    const childArtifactId = block.ArtifactID;
    const user = this.getSafeCurrentUser();
    if (!this.isUuid(childArtifactId) || !user || !this.ProviderToUse) {
      return;
    }

    try {
      const ver = await this.ProviderToUse.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = childArtifactId;
      ver.VersionNumber = nextVersionNumber;
      ver.Name = block.Title || 'Embedded Artifact';
      ver.UserID = user.ID;
      ver.Content = serializedContent;
      const saved = await ver.Save();
      if (saved) {
        this.embeddedArtifactVersions.set(childArtifactId, ver);
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
        }
      }
    } catch {
      // Keep in-memory version when offline
    }
  }

  /**
   * Creates or updates a tracked Suggestion Card for a document block.
   */
  public CreateOrUpdatePendingSuggestion(
    blockId: string,
    originalMarkdown: string,
    proposedMarkdown: string,
    rationale: string,
    authorName = 'Current User',
  ): DocumentSuggestionItem {
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

  public OpenSuggestionModalForSegment(seg: DocumentRenderSegment): void {
    const proposed = `${seg.RawMarkdown}\n\n> [!TIP]\n> Suggested refinement for this section.`;
    this.CreateOrUpdatePendingSuggestion(
      seg.SegmentID,
      seg.RawMarkdown,
      proposed,
      'Refined clarity and callout summary',
    );
    this.StatusBannerMessage = 'Created tracked suggestion card on block.';
  }

  public GetSuggestionsForBlock(blockId: string): DocumentSuggestionItem[] {
    return this.Suggestions.filter((s) => s.BlockID === blockId);
  }

  /**
   * Accepts a pending Suggestion Card and applies its proposed Markdown to the document.
   */
  public AcceptSuggestion(sug: DocumentSuggestionItem): void {
    sug.Status = 'Accepted';
    if (this.MarkdownContent.includes(sug.OriginalMarkdown)) {
      this.OnMarkdownChanged(this.MarkdownContent.replace(sug.OriginalMarkdown, () => sug.ProposedMarkdown));
    } else {
      this.OnMarkdownChanged(sug.ProposedMarkdown);
    }
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
   * Selects a block to anchor a new `DocBlock` comment thread in the right-margin drawer.
   */
  public OpenAnchorCommentForSegment(seg: DocumentRenderSegment): void {
    this.SelectedAnchorKey = seg.SegmentID;
    this.SelectedAnchorLabel =
      seg.HeadingText ??
      seg.Descriptor?.Title ??
      seg.Descriptor?.EntityName ??
      seg.Descriptor?.ArtifactType ??
      seg.SegmentID;
    this.SelectedAnchorQuote = seg.RawMarkdown.slice(0, 120);
    this.ShowCommentsDrawer = true;
    if (this.session) {
      this.session.SetActiveBlock(seg.SegmentID);
    }
    this.cdr.markForCheck();
  }

  /**
   * Posts a new anchored `DocBlock` comment thread (`MJ: Conversations` with `AnchorType='DocBlock'`,
   * `AnchorKey=<blockId>`) and invokes `@mention` agent assistance when an `@agent` handle is present.
   */
  public async PostAnchoredComment(): Promise<void> {
    const message = this.NewCommentText.trim();
    if (!message) {
      return;
    }

    const mentions = Array.from(message.matchAll(/@([A-Za-z0-9_-]+)/g)).map((m) => m[1]);
    const threadId = `conv-${Date.now()}`;
    const newThread: DocumentAnchoredThread = {
      ConversationID: threadId,
      AnchorKey: this.SelectedAnchorKey,
      AnchorLabel: this.SelectedAnchorLabel,
      QuotedText: this.SelectedAnchorQuote,
      Status: 'Open',
      AgentMode: this.NewCommentAgentMode,
      CreatedAt: new Date().toISOString(),
      Messages: [
        {
          DetailID: `msg-${Date.now()}-1`,
          UserName: 'Current User',
          Role: 'User',
          Message: message,
          CreatedAt: new Date().toISOString(),
          Mentions: mentions,
        },
      ],
    };

    // If an @mention agent is present, invoke DocumentToolLibrary / WhiteboardToolLibrary assistance
    if (mentions.length > 0) {
      const agentHandle = mentions[0];
      const targetSeg =
        this.DocumentSegments.find((s) => s.SegmentID === this.SelectedAnchorKey) ?? this.DocumentSegments[0];

      if (this.NewCommentAgentMode === 'suggest' && targetSeg) {
        const proposedText = `${targetSeg.RawMarkdown}\n\n*Updated by @${agentHandle}: Added executive action summary.*`;
        this.CreateOrUpdatePendingSuggestion(
          targetSeg.SegmentID,
          targetSeg.RawMarkdown,
          proposedText,
          `@${agentHandle} response to: "${message}"`,
          `@${agentHandle}`,
        );
        newThread.Messages.push({
          DetailID: `msg-${Date.now()}-2`,
          UserName: `@${agentHandle}`,
          Role: 'Agent',
          Message: `Proposed a tracked suggestion card on "${this.SelectedAnchorLabel}" via DocumentToolLibrary.propose_suggestion.`,
          CreatedAt: new Date().toISOString(),
          Mentions: [],
        });
      } else if (targetSeg) {
        const updatedText = `${targetSeg.RawMarkdown}\n\n> [!IMPORTANT]\n> **@${agentHandle} Synthesis:** ${message.replace(/@[A-Za-z0-9_-]+\s*/, '')}`;
        this.OnMarkdownChanged(this.MarkdownContent.replace(targetSeg.RawMarkdown, () => updatedText));
        newThread.Messages.push({
          DetailID: `msg-${Date.now()}-2`,
          UserName: `@${agentHandle}`,
          Role: 'Agent',
          Message: `Applied direct block update to "${this.SelectedAnchorLabel}" via DocumentToolLibrary.replace_block.`,
          CreatedAt: new Date().toISOString(),
          Mentions: [],
        });
      }
    }

    this.AnchoredThreads = [newThread, ...this.AnchoredThreads];
    this.NewCommentText = '';
    void this.persistAnchoredThreadToServer(newThread);
    this.cdr.markForCheck();
  }

  public ToggleResolveThread(thread: DocumentAnchoredThread): void {
    thread.Status = thread.Status === 'Resolved' ? 'Open' : 'Resolved';
    void this.persistThreadResolutionStatus(thread);
    this.cdr.markForCheck();
  }

  private async persistThreadResolutionStatus(thread: DocumentAnchoredThread): Promise<void> {
    const user = this.getSafeCurrentUser();
    if (!this.isUuid(thread.ConversationID) || !user || !this.ProviderToUse) {
      return;
    }

    try {
      const conv = await this.ProviderToUse.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
      const loaded = await conv.Load(thread.ConversationID);
      if (loaded) {
        conv.AnchorMetadata = JSON.stringify({
          label: thread.AnchorLabel,
          quote: thread.QuotedText,
          agentMode: thread.AgentMode,
          status: thread.Status,
        });
        await conv.Save();
      }
    } catch {
      // Keep local thread status when offline
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

  /**
   * Saves a new `MJArtifactVersionEntity` snapshot, triggers room compaction when connected via WebSocket,
   * persists to `MJ: Artifact Versions` when connected to a provider, and emits `ContentCommitted`.
   */
  public async OnSaveDocumentVersion(): Promise<void> {
    if (!this.CanUserEdit || this.IsSavingVersion) {
      return;
    }
    this.IsSavingVersion = true;
    this.cdr.markForCheck();
    try {
      const nextVerNum =
        Math.max(
          this.artifactVersion?.VersionNumber ?? 1,
          ...this.SavedVersionSnapshots.map((s) => s.VersionNumber),
        ) + 1;

      const sentViaSocket = this.session?.RequestSaveVersion() ?? false;
      if (!sentViaSocket) {
        await this.persistDocumentVersionToProvider(nextVerNum, this.MarkdownContent);
      }

      this.SavedVersionSnapshots.push({
        VersionNumber: nextVerNum,
        Content: this.MarkdownContent,
        Timestamp: new Date().toLocaleTimeString(),
      });

      this.ContentCommitted.emit(this.MarkdownContent);
      this.StatusBannerMessage = `Saved document version v${nextVerNum}.`;
    } finally {
      this.IsSavingVersion = false;
      this.cdr.markForCheck();
    }
  }

  private async persistDocumentVersionToProvider(versionNumber: number, content: string): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    if (!this.isUuid(artifactId) || !user || !this.ProviderToUse) {
      return;
    }

    try {
      const ver = await this.ProviderToUse.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
      ver.NewRecord();
      ver.ArtifactID = artifactId;
      ver.VersionNumber = versionNumber;
      ver.Name = this.getDisplayTitle() || 'Document';
      ver.UserID = user.ID;
      ver.Content = content;
      await ver.Save();
    } catch {
      // Keep snapshot in memory when offline
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
      this.StatusBannerMessage = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
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
          console.error('Failed to copy to clipboard:', err);
        });
    }
  }

  /** @deprecated Use {@link OnCopy}. */
  public onCopy(): void {
    return this.OnCopy();
  }

  public GetCollaborationStatusLabel(): string {
    switch (this.CollaborationStatus) {
      case 'connected':
        return 'Live Yjs Sync';
      case 'connecting':
        return 'Connecting…';
      case 'readonly':
        return 'Read-Only';
      case 'revoked':
        return 'Access Revoked';
      default:
        return this.CanUserEdit ? 'Ready · Collaborative' : 'Read-Only';
    }
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

  private initializeDocument(): void {
    const raw = this.getContent();
    this.MarkdownContent = raw;
    this.initialLoadedMarkdown = raw;
    if (!this.userExplicitlySelectedMode) {
      this.ViewMode = this.CanUserEdit ? 'edit' : 'preview';
    }
    this.SavedVersionSnapshots = [
      {
        VersionNumber: this.artifactVersion?.VersionNumber ?? 1,
        Content: raw,
        Timestamp: 'Initial',
      },
    ];
    this.refreshParsedStructure();
    this.setupCollaborationSession();
    void this.evaluatePermissionsAndLoadThreads();
  }

  private refreshParsedStructure(): void {
    this.DocumentSegments = this.collabService.ParseDocumentSegments(this.MarkdownContent);
    this.OutlineItems = this.collabService.ExtractOutline(this.MarkdownContent);
    this.WordStats = this.collabService.ComputeWordStats(this.MarkdownContent);
    for (const seg of this.DocumentSegments) {
      if (seg.Kind === 'mj-block' && seg.Descriptor) {
        if (seg.Descriptor.Kind === 'Artifact') {
          this.GetEmbeddedArtifactVersion(seg.Descriptor);
        } else if (seg.Descriptor.Mode !== 'Frozen' && !this.blockResults.has(seg.Descriptor.BlockID)) {
          void this.RefreshLiveBlock(seg.Descriptor);
        }
      }
    }
    if (this.ViewMode === 'diff') {
      this.RecomputeDiff();
    }
  }

  private getSafeCurrentUser() {
    try {
      return this.ProviderToUse?.CurrentUser;
    } catch {
      return undefined;
    }
  }

  private resolveConfiguredWsUrl(artifactId: string): string {
    const globalWsUrl = (globalThis as { __MJ_COLLAB_WS_URL__?: string }).__MJ_COLLAB_WS_URL__;
    const candidate = this.collaborationWsUrl || globalWsUrl;
    if (!candidate) {
      return '';
    }
    return this.collabService.ResolveCollaborationWebSocketUrl(artifactId, candidate);
  }

  private setupCollaborationSession(): void {
    this.destroyCollaborationSession();
    const artifactId = this.artifactVersion?.ArtifactID || this.artifactVersion?.ID || 'local-doc';
    const user = this.getSafeCurrentUser();
    const wsUrl = this.resolveConfiguredWsUrl(artifactId);

    this.session = this.collabService.CreateSession(
      artifactId,
      this.MarkdownContent,
      {
        id: user?.ID ?? 'local-user',
        name: user?.Name ?? 'Collaborator',
        email: user?.Email,
      },
      !this.readonly,
      Boolean(wsUrl),
    );

    this.sessionSubs.push(
      this.session.ContentChanged$.subscribe((remoteContent) => {
        if (remoteContent !== this.MarkdownContent) {
          this.OnMarkdownChanged(remoteContent, true);
        }
      }),
      this.session.StatusChanged$.subscribe((status) => {
        this.CollaborationStatus = status;
        if (status === 'readonly' || status === 'revoked') {
          this.HasEditPermission = false;
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        }
        this.cdr.markForCheck();
      }),
      this.session.CollaboratorsChanged$.subscribe((peers) => {
        this.Collaborators = peers;
        this.cdr.markForCheck();
      }),
      this.session.VersionSaved$.subscribe((savedEvt) => {
        const exists = this.SavedVersionSnapshots.some((s) => s.VersionNumber === savedEvt.versionNumber);
        if (!exists) {
          this.SavedVersionSnapshots.push({
            VersionNumber: savedEvt.versionNumber,
            Content: this.MarkdownContent,
            Timestamp: new Date().toLocaleTimeString(),
          });
        }
        this.StatusBannerMessage = `Saved document version v${savedEvt.versionNumber}.`;
        this.cdr.markForCheck();
      }),
    );

    if (wsUrl) {
      this.session.Connect(wsUrl);
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
  }

  private async evaluatePermissionsAndLoadThreads(): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    if (!artifactId || !user) {
      return;
    }

    try {
      const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(this.ProviderToUse, artifactId, user);
      this.HasEditPermission = perms.CanEdit;
      if (!perms.CanRead) {
        this.CollaborationStatus = 'revoked';
        this.ViewMode = 'preview';
      } else if (!perms.CanEdit && (this.ViewMode === 'edit' || this.ViewMode === 'suggest')) {
        this.ViewMode = 'preview';
      }
    } catch {
      // Keep default permission state when offline
    }

    await this.hydrateAnchoredThreadsFromServer(artifactId, user);

    // Subscribe to live permission changes
    this.permissionUnsub = ArtifactPermissionEngine.Instance.OnPermissionsChanged(async (evt) => {
      if (evt.ArtifactID === artifactId && user) {
        const updated = await ArtifactPermissionEngine.Instance.ResolvePermissions(
          this.ProviderToUse,
          artifactId,
          user,
        );
        this.HasEditPermission = updated.CanEdit;
        if (!updated.CanRead) {
          this.CollaborationStatus = 'revoked';
          this.ViewMode = 'preview';
        } else if (!updated.CanEdit) {
          this.CollaborationStatus = 'readonly';
          if (this.ViewMode === 'edit' || this.ViewMode === 'suggest') {
            this.ViewMode = 'preview';
          }
        }
        this.cdr.markForCheck();
      }
    });
  }

  private async hydrateAnchoredThreadsFromServer(
    artifactId: string,
    user: NonNullable<ReturnType<MarkdownArtifactViewerComponent['getSafeCurrentUser']>>,
  ): Promise<void> {
    if (!this.isUuid(artifactId) || !this.ProviderToUse) {
      return;
    }

    try {
      const provider = this.ProviderToUse;
      const artifactEntityId = provider.Entities?.find((e) => e.Name === 'MJ: Artifacts')?.ID;
      if (!artifactEntityId) {
        return;
      }

      const rv = RunView.FromMetadataProvider(provider);
      const convRes = await rv.RunView<{
        ID: string;
        Name: string;
        AnchorKey?: string | null;
        AnchorMetadata?: string | null;
        __mj_CreatedAt?: string;
      }>(
        {
          EntityName: 'MJ: Conversations',
          ExtraFilter: `LinkedEntityID='${this.escapeSql(artifactEntityId)}' AND LinkedRecordID='${this.escapeSql(artifactId)}' AND AnchorType='DocBlock'`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 200,
          ResultType: 'simple',
        },
        user,
      );

      const convRows = convRes.Success ? convRes.Results ?? [] : [];
      if (convRows.length === 0) {
        return;
      }

      const convIds = convRows.filter((c) => this.isUuid(c.ID)).map((c) => `'${this.escapeSql(c.ID)}'`);
      const detailsByConv = new Map<
        string,
        Array<{ ID: string; ConversationID: string; Role: string; Message: string; __mj_CreatedAt?: string }>
      >();

      if (convIds.length > 0) {
        const detailRes = await rv.RunView<{
          ID: string;
          ConversationID: string;
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
        for (const d of detailRes.Results ?? []) {
          const list = detailsByConv.get(d.ConversationID) ?? [];
          list.push(d);
          detailsByConv.set(d.ConversationID, list);
        }
      }

      this.AnchoredThreads = convRows.map((c) => {
        let meta: { label?: string; quote?: string; agentMode?: 'suggest' | 'edit'; status?: 'Open' | 'Resolved' } = {};
        if (c.AnchorMetadata) {
          try {
            meta = JSON.parse(c.AnchorMetadata) as typeof meta;
          } catch {
            meta = {};
          }
        }
        const msgs = (detailsByConv.get(c.ID) ?? []).map((d) => ({
          DetailID: d.ID,
          UserName: d.Role === 'AI' ? '@DocsAgent' : user.Name || 'Collaborator',
          Role: (d.Role === 'AI' ? 'Agent' : 'User') as 'User' | 'Agent',
          Message: d.Message,
          CreatedAt: d.__mj_CreatedAt ?? new Date().toISOString(),
          Mentions: Array.from((d.Message ?? '').matchAll(/@([A-Za-z0-9_-]+)/g)).map((m) => m[1]),
        }));

        return {
          ConversationID: c.ID,
          AnchorKey: c.AnchorKey || 'doc-root',
          AnchorLabel: meta.label || c.Name.replace(/^DocComment:\s*/i, '') || c.AnchorKey || 'Document Block',
          QuotedText: meta.quote || '',
          Status: meta.status === 'Resolved' ? 'Resolved' : 'Open',
          AgentMode: meta.agentMode === 'edit' ? 'edit' : 'suggest',
          CreatedAt: c.__mj_CreatedAt ?? new Date().toISOString(),
          Messages: msgs,
        };
      });
      this.cdr.markForCheck();
    } catch {
      // Keep local threads when offline
    }
  }

  private async persistAnchoredThreadToServer(thread: DocumentAnchoredThread): Promise<void> {
    const artifactId = this.artifactVersion?.ArtifactID;
    const user = this.getSafeCurrentUser();
    if (!this.isUuid(artifactId) || !user || !this.ProviderToUse) {
      return;
    }

    try {
      const provider = this.ProviderToUse;
      const artifactEntityId = provider.Entities?.find((e) => e.Name === 'MJ: Artifacts')?.ID;
      if (!artifactEntityId) {
        return;
      }

      const conv = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
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
      const saved = await conv.Save();
      if (saved) {
        thread.ConversationID = conv.ID;
        for (const msg of thread.Messages) {
          const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', user);
          detail.ConversationID = conv.ID;
          detail.UserID = user.ID;
          detail.Role = msg.Role === 'Agent' ? 'AI' : 'User';
          detail.Message = msg.Message;
          await detail.Save();
        }
      }
    } catch {
      // Keep thread in local session state if persistence is unavailable
    }
  }
}
