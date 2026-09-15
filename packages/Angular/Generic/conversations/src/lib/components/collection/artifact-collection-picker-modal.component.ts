import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { FormsModule } from '@angular/forms';
import { UserInfo, RunView, LogError } from '@memberjunction/core';
import { MJCollectionEntity, MJCollectionArtifactEntity } from '@memberjunction/core-entities';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ToastService } from '../../services/toast.service';
import { CollectionPermissionService, CollectionPermission } from '../../services/collection-permission.service';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';

type SaveStatus = 'pending' | 'saving' | 'success' | 'error';
type FilterMode = 'editable' | 'recent';

interface CollectionNode {
  collection: MJCollectionEntity;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  alreadyContainsArtifact: boolean;
  /** Breadcrumb of parent names — only used in search mode */
  ancestry: string;
}

interface SaveResult {
  collectionId: string;
  collectionName: string;
  status: SaveStatus;
  errorMessage?: string;
}

/**
 * Modal for saving an artifact version to one or more collections.
 *
 * Owns the full UX *and* the writes:
 *   - Left pane: searchable, expandable tree of collections the user can edit
 *   - Right pane: artifact preview + live selection chips, and (post-save) per-collection results
 *   - Save runs inline (modal stays open during writes) and reports per-collection success/failure with retry
 *
 * Emits {@link completed} on full success (parent should reload bookmark state) and on user-acknowledged
 * partial failure. Emits {@link cancelled} when the user backs out without saving anything.
 */
@Component({
  selector: 'mj-artifact-collection-picker-modal',
  standalone: true,
  imports: [
    FormsModule,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJButtonDirective,
    SharedGenericModule
  ],
  template: `
    @if (isOpen) {
      <mj-dialog
        Title="Save to Collection"
        (Close)="onCancel()"
        [Visible]="true"
        [Width]="960"
        [MinWidth]="720">
        <div class="picker-shell">
          <!-- ============================================================ -->
          <!--  LEFT PANE  · search + tree                                  -->
          <!-- ============================================================ -->
          <div class="pane pane-left">
            <div class="toolbar">
              <div class="search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input
                  #searchInput
                  type="text"
                  [(ngModel)]="searchQuery"
                  (ngModelChange)="onSearchChange()"
                  placeholder="Search collections…"
                  [disabled]="isLoading || isSaving" />
                @if (searchQuery) {
                  <button class="search-clear" (click)="clearSearch()" title="Clear">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                }
              </div>
              <button class="chip-btn"
                      [class.active]="filterMode === 'editable'"
                      (click)="setFilter('editable')"
                      [disabled]="isSaving">
                <i class="fa-solid fa-user-pen"></i> Editable
              </button>
              <button class="chip-btn"
                      [class.active]="filterMode === 'recent'"
                      (click)="setFilter('recent')"
                      [disabled]="isSaving">
                <i class="fa-solid fa-clock"></i> Recent
              </button>
            </div>

            <div class="tree-wrap">
              @if (isLoading) {
                <div class="state-block">
                  <mj-loading text="Loading collections…" size="medium"></mj-loading>
                </div>
              } @else if (errorMessage) {
                <div class="state-block error">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>{{ errorMessage }}</span>
                </div>
              } @else if (visibleNodes.length === 0) {
                <div class="state-block muted">
                  @if (searchQuery) {
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>No collections match &ldquo;{{ searchQuery }}&rdquo;</p>
                    <button class="link-btn" (click)="clearSearch()">Clear search</button>
                  } @else {
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No editable collections yet</p>
                    @if (showCreateForm) {
                      <div class="empty-create-form">
                        <input #newNameInput type="text"
                               class="create-input"
                               [(ngModel)]="newCollectionName"
                               (keydown.enter)="createCollection()"
                               (keydown.escape)="cancelCreate()"
                               placeholder="Collection name"
                               [disabled]="isCreatingCollection" />
                        <div class="empty-create-actions">
                          <button mjButton variant="primary" size="sm"
                                  (click)="createCollection()"
                                  [disabled]="isCreatingCollection || !newCollectionName.trim()">
                            @if (isCreatingCollection) {
                              <i class="fa-solid fa-spinner fa-spin"></i>
                            } @else {
                              Create
                            }
                          </button>
                          <button mjButton size="sm" (click)="cancelCreate()" [disabled]="isCreatingCollection">
                            Cancel
                          </button>
                        </div>
                      </div>
                    } @else {
                      <p class="hint">Create one to get started</p>
                      <button mjButton variant="primary" size="sm" (click)="openCreateForm()">
                        <i class="fa-solid fa-plus"></i> New collection
                      </button>
                    }
                  }
                </div>
              } @else {
                <div class="tree" role="tree">
                  @for (node of visibleNodes; track node.collection.ID) {
                    <div class="row"
                         role="treeitem"
                         [class.selected]="isSelected(node.collection.ID)"
                         [class.already]="node.alreadyContainsArtifact"
                         [style.padding-left.px]="searchQuery ? 12 : 12 + node.depth * 18"
                         (click)="onRowClick(node)">
                      <span class="caret" (click)="$event.stopPropagation(); toggleExpand(node)">
                        @if (node.hasChildren && !searchQuery) {
                          <i class="fa-solid" [class.fa-chevron-down]="node.expanded" [class.fa-chevron-right]="!node.expanded"></i>
                        }
                      </span>
                      <span class="check"
                            [class.checked]="isSelected(node.collection.ID)"
                            [class.locked]="node.alreadyContainsArtifact"
                            [attr.aria-label]="node.alreadyContainsArtifact ? 'Already saved' : 'Toggle selection'">
                        @if (isSelected(node.collection.ID) || node.alreadyContainsArtifact) {
                          <i class="fa-solid fa-check"></i>
                        }
                      </span>
                      <i class="fa-solid fa-folder folder-icon"
                         [style.color]="node.collection.Color || 'var(--mj-brand-primary)'"></i>
                      <span class="row-title">
                        {{ node.collection.Name }}
                        @if (searchQuery && node.ancestry) {
                          <span class="row-ancestry">· {{ node.ancestry }}</span>
                        }
                      </span>
                      @if (node.alreadyContainsArtifact) {
                        <span class="row-tag success">Already saved</span>
                      }
                    </div>
                  }

                  <!-- Inline "create new" row -->
                  @if (!isSaving && !searchQuery && !showCreateForm) {
                    <button class="row create-row" (click)="openCreateForm()">
                      <span class="caret"></span>
                      <span class="check dashed"><i class="fa-solid fa-plus"></i></span>
                      <span class="row-title">Create new collection…</span>
                    </button>
                  } @else if (showCreateForm) {
                    <div class="row create-form-row">
                      <span class="caret"></span>
                      <span class="check dashed"><i class="fa-solid fa-plus"></i></span>
                      <input #newNameInput type="text"
                             class="create-input"
                             [(ngModel)]="newCollectionName"
                             (keydown.enter)="createCollection()"
                             (keydown.escape)="cancelCreate()"
                             placeholder="Collection name"
                             [disabled]="isCreatingCollection" />
                      <button mjButton variant="primary" size="sm"
                              (click)="createCollection()"
                              [disabled]="isCreatingCollection || !newCollectionName.trim()">
                        @if (isCreatingCollection) {
                          <i class="fa-solid fa-spinner fa-spin"></i>
                        } @else {
                          Create
                        }
                      </button>
                      <button mjButton size="sm" (click)="cancelCreate()" [disabled]="isCreatingCollection">
                        Cancel
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- ============================================================ -->
          <!--  RIGHT PANE  · preview + chips / results                     -->
          <!-- ============================================================ -->
          <div class="pane pane-right">
            <div class="preview-block">
              <div class="block-label">Saving</div>
              <div class="preview-card">
                <div class="preview-thumb"><i class="fa-solid fa-file-lines"></i></div>
                <div class="preview-meta">
                  <div class="preview-name" [title]="artifactName">{{ artifactName || 'Artifact' }}</div>
                  @if (artifactVersionNumber != null) {
                    <span class="badge neutral">v{{ artifactVersionNumber }}</span>
                  }
                </div>
              </div>
            </div>

            <div class="chips-block">
              <div class="block-label">
                @if (saveResults.size > 0) {
                  <span>Results</span>
                  <span class="block-count">{{ successCount }} / {{ saveResults.size }}</span>
                } @else {
                  <span>Selected</span>
                  <span class="block-count">{{ selectedIds.size }}</span>
                }
              </div>

              @if (saveResults.size > 0) {
                <!-- Per-collection results -->
                <div class="chips">
                  @for (r of resultsList; track r.collectionId) {
                    <div class="chip result" [class.success]="r.status === 'success'"
                                              [class.error]="r.status === 'error'"
                                              [class.saving]="r.status === 'saving'">
                      <span class="chip-status">
                        @switch (r.status) {
                          @case ('saving') { <i class="fa-solid fa-spinner fa-spin"></i> }
                          @case ('success') { <i class="fa-solid fa-check"></i> }
                          @case ('error') { <i class="fa-solid fa-triangle-exclamation"></i> }
                          @default { <i class="fa-solid fa-circle"></i> }
                        }
                      </span>
                      <div class="chip-body">
                        <div class="chip-name">{{ r.collectionName }}</div>
                        @if (r.status === 'error' && r.errorMessage) {
                          <div class="chip-error">{{ r.errorMessage }}</div>
                        }
                      </div>
                      @if (r.status === 'error') {
                        <button class="chip-action" (click)="retryOne(r.collectionId)" title="Retry">
                          <i class="fa-solid fa-rotate-right"></i>
                        </button>
                      }
                    </div>
                  }
                </div>
              } @else if (selectedIds.size > 0) {
                <div class="chips">
                  @for (c of selectedCollections; track c.ID) {
                    <div class="chip">
                      <i class="fa-solid fa-folder folder-icon" [style.color]="c.Color || 'var(--mj-brand-primary)'"></i>
                      <div class="chip-body">
                        <div class="chip-name">{{ c.Name }}</div>
                      </div>
                      <button class="chip-action" (click)="deselect(c.ID)"
                              [disabled]="isSaving"
                              title="Remove">
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  }
                </div>
              } @else {
                <div class="chips-empty">
                  <i class="fa-solid fa-hand-pointer"></i>
                  <p>Pick a collection on the left</p>
                </div>
              }
            </div>

            <div class="footnote">
              <i class="fa-solid fa-shield-halved"></i>
              Only collections you can edit are shown
            </div>
          </div>
        </div>

        <mj-dialog-actions>
          <!-- Primary on the LEFT per MJ convention -->
          @if (failedCount > 0 && !isSaving) {
            <button mjButton variant="primary" (click)="retryFailed()">
              <i class="fa-solid fa-rotate-right"></i> Retry {{ failedCount }} failed
            </button>
            <button mjButton (click)="onAcknowledgeAndClose()">Done</button>
          } @else if (saveResults.size > 0 && successCount === saveResults.size && !isSaving) {
            <!-- All succeeded — auto-closes, but render fallback button just in case -->
            <button mjButton variant="primary" (click)="onAcknowledgeAndClose()">
              <i class="fa-solid fa-check"></i> Done
            </button>
          } @else {
            <button mjButton variant="primary"
                    (click)="onSave()"
                    [disabled]="selectedIds.size === 0 || isSaving">
              @if (isSaving) {
                <i class="fa-solid fa-spinner fa-spin"></i> Saving to {{ selectedIds.size }}…
              } @else {
                <i class="fa-solid fa-bookmark"></i>
                Save to {{ selectedIds.size }} {{ selectedIds.size === 1 ? 'collection' : 'collections' }}
              }
            </button>
            <button mjButton (click)="onCancel()" [disabled]="isSaving">Cancel</button>
          }
        </mj-dialog-actions>
      </mj-dialog>
    }
  `,
  styles: [`
    /* ===== Shell ===== */
    .picker-shell {
      display: grid;
      grid-template-columns: 1fr 300px;
      min-height: 460px;
      max-height: 70vh;
      gap: 0;
      margin: -8px -4px 0;
    }
    .pane { display:flex; flex-direction:column; min-height: 0; }
    .pane-left  { border-right: 1px solid var(--mj-border-subtle); }
    .pane-right { background: var(--mj-bg-surface-card); }

    /* ===== Toolbar / search / chip filters ===== */
    .toolbar {
      display:flex; gap: 8px; padding: 10px 12px;
      border-bottom: 1px solid var(--mj-border-subtle);
      flex-wrap: wrap;
    }
    .search {
      flex: 1; min-width: 200px;
      display:flex; align-items:center; gap: 8px;
      padding: 8px 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid transparent;
      border-radius: 8px;
      transition: all .15s ease;
    }
    .search:focus-within {
      background: var(--mj-bg-surface);
      border-color: var(--mj-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
    }
    .search i { color: var(--mj-text-muted); font-size: 13px; }
    .search input {
      flex: 1; border: 0; outline: 0; background: transparent;
      font-size: 13.5px; color: var(--mj-text-primary);
      min-width: 0;
    }
    .search input::placeholder { color: var(--mj-text-disabled); }
    .search-clear {
      background: transparent; border: 0; cursor: pointer;
      color: var(--mj-text-muted); padding: 2px 4px; border-radius: 4px;
    }
    .search-clear:hover { color: var(--mj-text-primary); background: var(--mj-bg-surface-hover); }

    .chip-btn {
      display:inline-flex; align-items:center; gap: 6px;
      padding: 7px 11px; border-radius: 8px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
      font-size: 12.5px; font-weight: 600; cursor: pointer;
      transition: all .15s ease;
    }
    .chip-btn:hover:not(:disabled) { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
    .chip-btn.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
    }
    .chip-btn:disabled { opacity: .55; cursor: not-allowed; }

    /* ===== Tree ===== */
    .tree-wrap { flex: 1; overflow-y: auto; padding: 8px 8px 16px; }
    .tree { display:flex; flex-direction: column; gap: 1px; }
    .row {
      display:flex; align-items:center; gap: 10px;
      padding: 7px 12px; border-radius: 8px; cursor: pointer;
      user-select: none;
      border: 1px solid transparent;
      background: transparent;
      text-align: left;
      transition: background .12s ease;
      min-height: 36px;
    }
    .row:hover { background: var(--mj-bg-surface-hover); }
    .row.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 9%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
    }
    .row.already { cursor: default; }
    .row.already:hover { background: transparent; }
    .row.already .row-title { color: var(--mj-text-secondary); }

    .caret {
      width: 16px; flex-shrink: 0; text-align: center;
      color: var(--mj-text-muted); font-size: 10px;
      cursor: pointer;
    }
    .caret:hover { color: var(--mj-text-primary); }

    .check {
      width: 18px; height: 18px; border-radius: 5px;
      border: 1.5px solid var(--mj-border-strong);
      background: var(--mj-bg-surface);
      display:flex; align-items:center; justify-content:center;
      color: transparent; font-size: 10px; flex-shrink: 0;
      transition: all .12s ease;
    }
    .check.checked {
      background: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
      color: #fff;
    }
    .check.locked {
      background: var(--mj-status-success);
      border-color: var(--mj-status-success);
      color: #fff;
    }
    .check.dashed {
      border-style: dashed;
      color: var(--mj-text-muted);
    }

    .folder-icon { font-size: 14px; flex-shrink: 0; }

    .row-title {
      flex: 1; font-size: 13.5px; font-weight: 600;
      color: var(--mj-text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .row-ancestry {
      font-weight: 500; color: var(--mj-text-muted); font-size: 12px;
      margin-left: 2px;
    }
    .row-tag {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: 999px; flex-shrink: 0;
    }
    .row-tag.success {
      background: var(--mj-status-success-bg);
      color: var(--mj-status-success-text);
      border: 1px solid color-mix(in srgb, var(--mj-status-success) 35%, transparent);
    }

    .create-row {
      width: 100%;
      border: 1.5px dashed var(--mj-border-strong);
      color: var(--mj-text-secondary);
      margin-top: 8px;
      background: transparent;
    }
    .create-row .row-title { color: var(--mj-text-secondary); font-weight: 600; }
    .create-row:hover {
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface));
    }
    .create-row:hover .row-title { color: var(--mj-brand-primary); }

    .create-form-row {
      margin-top: 8px;
      border: 1.5px solid var(--mj-border-focus);
      background: var(--mj-bg-surface);
      cursor: default;
      gap: 8px;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }
    .create-input {
      flex: 1; min-width: 0;
      padding: 7px 10px;
      font-size: 13.5px; color: var(--mj-text-primary);
      background: var(--mj-bg-surface);
      border: 1.5px solid var(--mj-border-strong);
      border-radius: 6px;
      outline: 0;
      transition: all .12s ease;
    }
    .create-input::placeholder {
      color: var(--mj-text-muted);
    }
    .create-input:focus {
      border-color: var(--mj-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
    }

    /* ===== State blocks ===== */
    .state-block {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding: 48px 24px; gap: 8px; color: var(--mj-text-muted);
      text-align: center;
    }
    .state-block i { font-size: 28px; opacity: .6; }
    .state-block.error { color: var(--mj-status-error-text); }
    .state-block .hint { font-size: 12.5px; color: var(--mj-text-disabled); margin: 0; }
    .state-block .link-btn {
      background: transparent; border: 0; color: var(--mj-text-link);
      font-weight: 600; cursor: pointer; font-size: 13px; padding: 6px 12px;
    }
    .state-block .link-btn:hover { color: var(--mj-text-link-hover); text-decoration: underline; }
    .state-block p { margin: 0; font-size: 13.5px; }
    /* Buttons inside state blocks: keep their icons at button scale, not the 28px empty-state glyph size */
    .state-block button i { font-size: inherit; opacity: 1; }
    .empty-create-form {
      display: flex; flex-direction: column; gap: 8px;
      width: 100%; max-width: 280px; margin-top: 4px;
    }
    .empty-create-actions { display: flex; gap: 8px; justify-content: center; }

    /* ===== Right pane ===== */
    .preview-block { padding: 16px 18px; border-bottom: 1px solid var(--mj-border-subtle); }
    .block-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
      font-weight: 700; color: var(--mj-text-muted); margin-bottom: 8px;
      display:flex; justify-content:space-between; align-items:center;
    }
    .block-count {
      color: var(--mj-brand-primary); font-size: 12px;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      padding: 2px 8px; border-radius: 999px;
    }
    .preview-card {
      display:flex; gap: 12px; align-items:center;
      background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default);
      border-radius: 10px; padding: 12px;
      box-shadow: 0 1px 2px rgba(15,23,42,.04);
    }
    .preview-thumb {
      width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
      background: linear-gradient(135deg, var(--mj-color-accent-400), var(--mj-brand-primary));
      color: #fff; display:flex; align-items:center; justify-content:center;
      font-size: 14px;
    }
    .preview-meta { flex: 1; min-width: 0; display:flex; flex-direction: column; gap: 4px; }
    .preview-name {
      font-weight: 700; font-size: 13.5px; color: var(--mj-text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .badge {
      display:inline-flex; align-items:center; gap: 4px;
      padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
      width: fit-content;
    }
    .badge.neutral {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      border: 1px solid var(--mj-border-default);
    }

    .chips-block { flex: 1; min-height: 0; display:flex; flex-direction: column;
                    padding: 16px 18px 8px; overflow-y: auto; }
    .chips { display:flex; flex-direction: column; gap: 6px; }
    .chip {
      display:flex; align-items:center; gap: 10px; padding: 8px 10px;
      background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default);
      border-radius: 8px;
    }
    .chip-body { flex: 1; min-width: 0; }
    .chip-name {
      font-weight: 600; font-size: 13px; color: var(--mj-text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chip-error {
      font-size: 11.5px; color: var(--mj-status-error-text); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chip-action {
      width: 24px; height: 24px; border-radius: 6px;
      background: transparent; border: 0; cursor: pointer;
      color: var(--mj-text-muted); font-size: 11px;
      display:flex; align-items:center; justify-content:center;
    }
    .chip-action:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover); color: var(--mj-text-primary);
    }
    .chip-action:disabled { opacity: .4; cursor: not-allowed; }
    .chip-status {
      width: 20px; flex-shrink: 0; text-align: center; font-size: 12px;
    }
    .chip.result.success { border-color: color-mix(in srgb, var(--mj-status-success) 35%, transparent);
                            background: var(--mj-status-success-bg); }
    .chip.result.success .chip-status { color: var(--mj-status-success-text); }
    .chip.result.error { border-color: color-mix(in srgb, var(--mj-status-error) 35%, transparent);
                          background: var(--mj-status-error-bg); }
    .chip.result.error .chip-status { color: var(--mj-status-error-text); }
    .chip.result.saving .chip-status { color: var(--mj-brand-primary); }

    .chips-empty {
      flex: 1; display:flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 32px 16px; text-align: center; color: var(--mj-text-muted);
      border: 1.5px dashed var(--mj-border-default); border-radius: 10px;
    }
    .chips-empty i { font-size: 22px; margin-bottom: 8px; opacity: .55; }
    .chips-empty p { margin: 0; font-size: 12.5px; }

    .footnote {
      padding: 12px 18px;
      font-size: 11.5px; color: var(--mj-text-muted);
      display:flex; align-items:center; gap: 6px;
      border-top: 1px solid var(--mj-border-subtle);
    }
    .footnote i { font-size: 11px; }

    /* Tighten dialog content padding so panes meet edges cleanly */
    :host ::ng-deep mj-dialog .k-window-content,
    :host ::ng-deep mj-dialog .mj-dialog-content {
      padding: 0 !important;
    }
  `]
})
export class ArtifactCollectionPickerModalComponent extends BaseAngularComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() IsOpen: boolean = false;

  /** @deprecated Use {@link IsOpen}. */
  @Input() set isOpen(value: boolean) {
    this.IsOpen = value;
  }
  /** @deprecated Use {@link IsOpen}. */
  get isOpen(): boolean {
    return this.IsOpen;
  }
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  /** Collections that already contain the *current version* — rendered with a green check and locked. */
  @Input() ExcludeCollectionIds: string[] = [];

  /** @deprecated Use {@link ExcludeCollectionIds}. */
  @Input() set excludeCollectionIds(value: string[]) {
    this.ExcludeCollectionIds = value;
  }
  /** @deprecated Use {@link ExcludeCollectionIds}. */
  get excludeCollectionIds(): string[] {
    return this.ExcludeCollectionIds;
  }
  /** ID of the artifact version being saved. Required for writes. */
  @Input() ArtifactVersionId: string | null = null;

  /** @deprecated Use {@link ArtifactVersionId}. */
  @Input() set artifactVersionId(value: string | null) {
    this.ArtifactVersionId = value;
  }
  /** @deprecated Use {@link ArtifactVersionId}. */
  get artifactVersionId(): string | null {
    return this.ArtifactVersionId;
  }
  /** Display-only: artifact name shown in the preview pane. */
  @Input() ArtifactName: string = '';

  /** @deprecated Use {@link ArtifactName}. */
  @Input() set artifactName(value: string) {
    this.ArtifactName = value;
  }
  /** @deprecated Use {@link ArtifactName}. */
  get artifactName(): string {
    return this.ArtifactName;
  }
  /** Display-only: version number shown in the preview pane. */
  @Input() ArtifactVersionNumber: number | null = null;

  /** @deprecated Use {@link ArtifactVersionNumber}. */
  @Input() set artifactVersionNumber(value: number | null) {
    this.ArtifactVersionNumber = value;
  }
  /** @deprecated Use {@link ArtifactVersionNumber}. */
  get artifactVersionNumber(): number | null {
    return this.ArtifactVersionNumber;
  }

  /** Fired when the save flow finishes (fully successful, or user acknowledged partial result). */
  @Output() completed = new EventEmitter<{ successIds: string[]; failedIds: string[] }>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('newNameInput') newNameInputRef?: ElementRef<HTMLInputElement>;

  // Data
  private allCollections: MJCollectionEntity[] = [];
  private editableCollections: MJCollectionEntity[] = [];
  private userPermissions: Map<string, CollectionPermission> = new Map();
  private collectionById: Map<string, MJCollectionEntity> = new Map();
  private expandedIds: Set<string> = new Set();

  // Selection (normalized UUIDs so SQL Server vs Postgres casing doesn't bite us)
  public SelectedIds: Set<string> = new Set();

  /** @deprecated Use {@link SelectedIds}. */
  public get selectedIds(): Set<string> {
    return this.SelectedIds;
  }
  /** @deprecated Use {@link SelectedIds}. */
  public set selectedIds(value: Set<string>) {
    this.SelectedIds = value;
  }

  // Filter / search
  public SearchQuery: string = '';

  /** @deprecated Use {@link SearchQuery}. */
  public get searchQuery(): string {
    return this.SearchQuery;
  }
  /** @deprecated Use {@link SearchQuery}. */
  public set searchQuery(value: string) {
    this.SearchQuery = value;
  }
  public FilterMode: FilterMode = 'editable';

  /** @deprecated Use {@link FilterMode}. */
  public get filterMode(): FilterMode {
    return this.FilterMode;
  }
  /** @deprecated Use {@link FilterMode}. */
  public set filterMode(value: FilterMode) {
    this.FilterMode = value;
  }

  // Render output
  public VisibleNodes: CollectionNode[] = [];

  /** @deprecated Use {@link VisibleNodes}. */
  public get visibleNodes(): CollectionNode[] {
    return this.VisibleNodes;
  }
  /** @deprecated Use {@link VisibleNodes}. */
  public set visibleNodes(value: CollectionNode[]) {
    this.VisibleNodes = value;
  }

  // States
  public isLoading: boolean = false;
  public IsSaving: boolean = false;

  /** @deprecated Use {@link IsSaving}. */
  public get isSaving(): boolean {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  public set isSaving(value: boolean) {
    this.IsSaving = value;
  }
  public errorMessage: string = '';
  public ShowCreateForm: boolean = false;

  /** @deprecated Use {@link ShowCreateForm}. */
  public get showCreateForm(): boolean {
    return this.ShowCreateForm;
  }
  /** @deprecated Use {@link ShowCreateForm}. */
  public set showCreateForm(value: boolean) {
    this.ShowCreateForm = value;
  }
  public NewCollectionName: string = '';

  /** @deprecated Use {@link NewCollectionName}. */
  public get newCollectionName(): string {
    return this.NewCollectionName;
  }
  /** @deprecated Use {@link NewCollectionName}. */
  public set newCollectionName(value: string) {
    this.NewCollectionName = value;
  }
  public IsCreatingCollection: boolean = false;

  /** @deprecated Use {@link IsCreatingCollection}. */
  public get isCreatingCollection(): boolean {
    return this.IsCreatingCollection;
  }
  /** @deprecated Use {@link IsCreatingCollection}. */
  public set isCreatingCollection(value: boolean) {
    this.IsCreatingCollection = value;
  }

  // Per-collection save outcomes
  public SaveResults: Map<string, SaveResult> = new Map();

  /** @deprecated Use {@link SaveResults}. */
  public get saveResults(): Map<string, SaveResult> {
    return this.SaveResults;
  }
  /** @deprecated Use {@link SaveResults}. */
  public set saveResults(value: Map<string, SaveResult>) {
    this.SaveResults = value;
  }

  constructor(
    private toastService: ToastService,
    private permissionService: CollectionPermissionService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  // ============================================================
  //  Lifecycle
  // ============================================================
  async ngOnInit() {
    this.permissionService.Provider = this.ProviderToUse;
    if (this.IsOpen) {
      await this.loadCollections();
    }
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']) {
      if (this.IsOpen) {
        this.resetState();
        await this.loadCollections();
        // Autofocus search on next tick
        Promise.resolve().then(() => this.searchInputRef?.nativeElement?.focus());
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.IsOpen) {
      this.searchInputRef?.nativeElement?.focus();
    }
  }

  // ============================================================
  //  Selection helpers (normalized UUIDs)
  // ============================================================
  public IsSelected(id: string): boolean {
    return this.SelectedIds.has(NormalizeUUID(id));
  }

  /** @deprecated Use {@link IsSelected}. */
  public isSelected(id: string): boolean {
    return this.IsSelected(id);
  }

  public get SelectedCollections(): MJCollectionEntity[] {
    const list: MJCollectionEntity[] = [];
    for (const id of this.SelectedIds) {
      const c = this.collectionById.get(id);
      if (c) list.push(c);
    }
    return list;
  }

  /** @deprecated Use {@link SelectedCollections}. */
  public get selectedCollections(): MJCollectionEntity[] {
    return this.SelectedCollections;
  }

  public get ResultsList(): SaveResult[] {
    return Array.from(this.SaveResults.values());
  }

  /** @deprecated Use {@link ResultsList}. */
  public get resultsList(): SaveResult[] {
    return this.ResultsList;
  }

  public get SuccessCount(): number {
    let n = 0;
    for (const r of this.SaveResults.values()) if (r.status === 'success') n++;
    return n;
  }

  /** @deprecated Use {@link SuccessCount}. */
  public get successCount(): number {
    return this.SuccessCount;
  }

  public get FailedCount(): number {
    let n = 0;
    for (const r of this.SaveResults.values()) if (r.status === 'error') n++;
    return n;
  }

  /** @deprecated Use {@link FailedCount}. */
  public get failedCount(): number {
    return this.FailedCount;
  }

  // ============================================================
  //  Load + tree build
  // ============================================================
  private resetState(): void {
    this.allCollections = [];
    this.editableCollections = [];
    this.userPermissions.clear();
    this.collectionById.clear();
    this.expandedIds.clear();
    this.SelectedIds.clear();
    this.VisibleNodes = [];
    this.SearchQuery = '';
    this.FilterMode = 'editable';
    this.errorMessage = '';
    this.ShowCreateForm = false;
    this.NewCollectionName = '';
    this.SaveResults.clear();
    this.IsSaving = false;
    this.IsCreatingCollection = false;
  }

  private async loadCollections(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = '';

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJCollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `EnvironmentID='${this.EnvironmentId}'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      }, this.CurrentUser);

      if (!result.Success) {
        this.errorMessage = result.ErrorMessage || 'Failed to load collections';
        return;
      }

      this.allCollections = result.Results || [];
      await this.loadUserPermissions();

      this.editableCollections = this.allCollections.filter(c => this.canEdit(c));
      this.collectionById.clear();
      for (const c of this.editableCollections) {
        this.collectionById.set(NormalizeUUID(c.ID), c);
      }

      this.rebuildVisibleNodes();
    } catch (error) {
      LogError(error);
      this.errorMessage = 'An error occurred while loading collections';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadUserPermissions(): Promise<void> {
    const nonOwned = this.allCollections.filter(
      c => c.OwnerID && !UUIDsEqual(c.OwnerID, this.CurrentUser.ID)
    );
    if (nonOwned.length === 0) return;

    const ids = nonOwned.map(c => c.ID);
    const permissions = await this.permissionService.checkBulkPermissions(
      ids, this.CurrentUser.ID, this.CurrentUser
    );
    permissions.forEach((permission, id) => this.userPermissions.set(id, permission));
  }

  private canEdit(c: MJCollectionEntity): boolean {
    if (!c.OwnerID || UUIDsEqual(c.OwnerID, this.CurrentUser.ID)) return true;
    return this.userPermissions.get(c.ID)?.canEdit || false;
  }

  // ============================================================
  //  Tree rendering — flat list of CollectionNode, ordered DFS
  // ============================================================
  private rebuildVisibleNodes(): void {
    const q = this.SearchQuery.trim().toLowerCase();
    if (q) {
      this.VisibleNodes = this.buildSearchNodes(q);
    } else {
      this.VisibleNodes = this.buildTreeNodes();
    }
  }

  private buildTreeNodes(): CollectionNode[] {
    const byParent = new Map<string | null, MJCollectionEntity[]>();
    for (const c of this.editableCollections) {
      const key = c.ParentID ? NormalizeUUID(c.ParentID) : null;
      const arr = byParent.get(key) || [];
      arr.push(c);
      byParent.set(key, arr);
    }

    const out: CollectionNode[] = [];
    const walk = (parentId: string | null, depth: number): void => {
      const children = byParent.get(parentId) || [];
      for (const c of children) {
        const id = NormalizeUUID(c.ID);
        const kids = byParent.get(id) || [];
        const hasChildren = kids.length > 0;
        out.push({
          collection: c,
          depth,
          expanded: this.expandedIds.has(id),
          hasChildren,
          alreadyContainsArtifact: this.isAlreadyAdded(c.ID),
          ancestry: ''
        });
        if (hasChildren && this.expandedIds.has(id)) {
          walk(id, depth + 1);
        }
      }
    };
    walk(null, 0);
    return out;
  }

  private buildSearchNodes(query: string): CollectionNode[] {
    const matches = this.editableCollections.filter(c => c.Name.toLowerCase().includes(query));
    return matches.map(c => ({
      collection: c,
      depth: 0,
      expanded: false,
      hasChildren: false,
      alreadyContainsArtifact: this.isAlreadyAdded(c.ID),
      ancestry: this.buildAncestry(c)
    }));
  }

  private buildAncestry(c: MJCollectionEntity): string {
    const names: string[] = [];
    let parentId = c.ParentID;
    let guard = 0;
    while (parentId && guard++ < 32) {
      const p = this.collectionById.get(NormalizeUUID(parentId));
      if (!p) break;
      names.unshift(p.Name);
      parentId = p.ParentID;
    }
    return names.join(' / ');
  }

  private isAlreadyAdded(id: string): boolean {
    return this.ExcludeCollectionIds.some(eid => UUIDsEqual(eid, id));
  }

  // ============================================================
  //  Tree interactions
  // ============================================================
  public OnRowClick(node: CollectionNode): void {
    if (this.IsSaving) return;
    if (node.alreadyContainsArtifact) return;
    this.ToggleSelection(node.collection);
  }

  /** @deprecated Use {@link OnRowClick}. */
  public onRowClick(node: CollectionNode): void {
    return this.OnRowClick(node);
  }

  public ToggleSelection(c: MJCollectionEntity): void {
    const id = NormalizeUUID(c.ID);
    if (this.SelectedIds.has(id)) {
      this.SelectedIds.delete(id);
    } else {
      this.SelectedIds.add(id);
    }
  }

  /** @deprecated Use {@link ToggleSelection}. */
  public toggleSelection(c: MJCollectionEntity): void {
    return this.ToggleSelection(c);
  }

  public Deselect(id: string): void {
    if (this.IsSaving) return;
    this.SelectedIds.delete(NormalizeUUID(id));
  }

  /** @deprecated Use {@link Deselect}. */
  public deselect(id: string): void {
    return this.Deselect(id);
  }

  public ToggleExpand(node: CollectionNode): void {
    if (!node.hasChildren) return;
    const id = NormalizeUUID(node.collection.ID);
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
    this.rebuildVisibleNodes();
  }

  /** @deprecated Use {@link ToggleExpand}. */
  public toggleExpand(node: CollectionNode): void {
    return this.ToggleExpand(node);
  }

  public OnSearchChange(): void {
    this.rebuildVisibleNodes();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(): void {
    return this.OnSearchChange();
  }

  public ClearSearch(): void {
    this.SearchQuery = '';
    this.rebuildVisibleNodes();
    this.searchInputRef?.nativeElement?.focus();
  }

  /** @deprecated Use {@link ClearSearch}. */
  public clearSearch(): void {
    return this.ClearSearch();
  }

  public SetFilter(mode: FilterMode): void {
    this.FilterMode = mode;
    // 'recent' filter is a placeholder for now — same data, future sort change.
    // Keeping the chip wired so the UI is honest and a future PR can flip the sort.
    this.rebuildVisibleNodes();
  }

  /** @deprecated Use {@link SetFilter}. */
  public setFilter(mode: FilterMode): void {
    return this.SetFilter(mode);
  }

  // ============================================================
  //  Create new collection (root-level only — keeps the picker simple)
  // ============================================================
  public OpenCreateForm(): void {
    this.ShowCreateForm = true;
    // Force the @if branch to render now, then focus the input it created.
    // A microtask alone isn't enough — Angular hasn't run change detection by then,
    // so the @ViewChild ref is still undefined.
    this.cdr.detectChanges();
    this.newNameInputRef?.nativeElement?.focus();
  }

  /** @deprecated Use {@link OpenCreateForm}. */
  public openCreateForm(): void {
    return this.OpenCreateForm();
  }

  public CancelCreate(): void {
    this.ShowCreateForm = false;
    this.NewCollectionName = '';
  }

  /** @deprecated Use {@link CancelCreate}. */
  public cancelCreate(): void {
    return this.CancelCreate();
  }

  public async CreateCollection(): Promise<void> {
    const name = this.NewCollectionName.trim();
    if (!name) {
      this.toastService.warning('Please enter a collection name');
      return;
    }
    try {
      this.IsCreatingCollection = true;
      const p = this.ProviderToUse;
      const collection = await p.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.CurrentUser);
      collection.Name = name;
      collection.EnvironmentID = this.EnvironmentId;
      collection.OwnerID = this.CurrentUser.ID;

      const saved = await collection.Save();
      if (!saved) {
        this.toastService.error(collection.LatestResult?.CompleteMessage || 'Failed to create collection');
        return;
      }

      // No explicit owner permission row needed — CollectionPermissionProvider treats the
      // OwnerID as an implicit full-access grant. Writing a self-share row was both redundant
      // and triggering a server-side auth failure on freshly-created collections.

      this.toastService.success('Collection created');
      this.CancelCreate();

      // Splice the new collection into local state directly. Re-running loadCollections() here
      // races with the server's cache-invalidation propagation and intermittently returns the
      // pre-create result; we already own the freshly-saved entity, so just use it.
      this.allCollections = [...this.allCollections, collection];
      this.editableCollections = [...this.editableCollections, collection];
      this.collectionById.set(NormalizeUUID(collection.ID), collection);
      // Auto-select the new one
      this.SelectedIds.add(NormalizeUUID(collection.ID));
      this.rebuildVisibleNodes();
    } catch (error) {
      LogError(error);
      this.toastService.error('Failed to create collection');
    } finally {
      this.IsCreatingCollection = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link CreateCollection}. */
  public async createCollection(): Promise<void> {
    return this.CreateCollection();
  }

  // ============================================================
  //  Save flow (writes happen here, dialog stays open until done)
  // ============================================================
  public async OnSave(): Promise<void> {
    if (this.IsSaving) return;
    if (this.SelectedIds.size === 0) {
      this.toastService.warning('Pick at least one collection');
      return;
    }
    if (!this.ArtifactVersionId) {
      this.toastService.error('No version selected to save');
      return;
    }

    this.IsSaving = true;
    this.SaveResults.clear();
    // Seed each result as pending so they render in order
    for (const c of this.SelectedCollections) {
      this.SaveResults.set(NormalizeUUID(c.ID), {
        collectionId: c.ID,
        collectionName: c.Name,
        status: 'pending'
      });
    }
    this.cdr.detectChanges();

    for (const c of this.SelectedCollections) {
      await this.saveOne(c);
    }

    this.IsSaving = false;

    // Auto-close on full success
    if (this.FailedCount === 0) {
      this.emitCompleted();
    } else {
      this.toastService.warning(`Saved to ${this.SuccessCount} of ${this.SaveResults.size} collections`);
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnSave}. */
  public async onSave(): Promise<void> {
    return this.OnSave();
  }

  public async RetryFailed(): Promise<void> {
    if (this.IsSaving) return;
    const toRetry: MJCollectionEntity[] = [];
    for (const r of this.SaveResults.values()) {
      if (r.status === 'error') {
        const c = this.collectionById.get(NormalizeUUID(r.collectionId));
        if (c) toRetry.push(c);
      }
    }
    if (toRetry.length === 0) return;

    this.IsSaving = true;
    this.cdr.detectChanges();
    for (const c of toRetry) {
      await this.saveOne(c);
    }
    this.IsSaving = false;

    if (this.FailedCount === 0) {
      this.emitCompleted();
    } else {
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link RetryFailed}. */
  public async retryFailed(): Promise<void> {
    return this.RetryFailed();
  }

  public async RetryOne(collectionId: string): Promise<void> {
    if (this.IsSaving) return;
    const c = this.collectionById.get(NormalizeUUID(collectionId));
    if (!c) return;
    this.IsSaving = true;
    this.cdr.detectChanges();
    await this.saveOne(c);
    this.IsSaving = false;
    if (this.FailedCount === 0 && this.SuccessCount === this.SaveResults.size) {
      this.emitCompleted();
    } else {
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link RetryOne}. */
  public async retryOne(collectionId: string): Promise<void> {
    return this.RetryOne(collectionId);
  }

  private async saveOne(collection: MJCollectionEntity): Promise<void> {
    const key = NormalizeUUID(collection.ID);
    const r = this.SaveResults.get(key);
    if (!r) return;
    r.status = 'saving';
    r.errorMessage = undefined;
    this.cdr.detectChanges();

    try {
      const versionId = this.ArtifactVersionId;
      if (!versionId) {
        r.status = 'error';
        r.errorMessage = 'No artifact version selected';
        return;
      }

      const p = this.ProviderToUse;

      // Server-side cache + remote-invalidation make this idempotent in practice,
      // but we still pre-check to avoid creating duplicate junction rows in races.
      const rv = RunView.FromMetadataProvider(p);
      const existing = await rv.RunView<MJCollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${collection.ID}' AND ArtifactVersionID='${versionId}'`,
        ResultType: 'simple',
        Fields: ['ID']
      }, this.CurrentUser);

      if (existing.Success && (existing.Results?.length ?? 0) > 0) {
        r.status = 'success';
        return;
      }

      const junction = await p.GetEntityObject<MJCollectionArtifactEntity>(
        'MJ: Collection Artifacts', this.CurrentUser
      );
      junction.CollectionID = collection.ID;
      junction.ArtifactVersionID = versionId;
      junction.Sequence = 0;

      const ok = await junction.Save();
      if (ok) {
        r.status = 'success';
      } else {
        r.status = 'error';
        r.errorMessage = junction.LatestResult?.CompleteMessage || 'Save failed';
      }
    } catch (err) {
      LogError(err);
      r.status = 'error';
      r.errorMessage = err instanceof Error ? err.message : 'Unexpected error';
    }
  }

  // ============================================================
  //  Close paths
  // ============================================================
  public onCancel(): void {
    if (this.IsSaving) return; // can't close while writes are in flight
    // If any saves completed before cancel, treat it as completion so the viewer reloads
    if (this.SuccessCount > 0) {
      this.emitCompleted();
    } else {
      this.cancelled.emit();
    }
  }

  public OnAcknowledgeAndClose(): void {
    this.emitCompleted();
  }

  /** @deprecated Use {@link OnAcknowledgeAndClose}. */
  public onAcknowledgeAndClose(): void {
    return this.OnAcknowledgeAndClose();
  }

  private emitCompleted(): void {
    const successIds: string[] = [];
    const failedIds: string[] = [];
    for (const r of this.SaveResults.values()) {
      if (r.status === 'success') successIds.push(r.collectionId);
      else if (r.status === 'error') failedIds.push(r.collectionId);
    }
    this.completed.emit({ successIds, failedIds });
  }
}
