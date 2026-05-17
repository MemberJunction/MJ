import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, SharedService } from '@memberjunction/ng-shared';
import { ResourceData, MJListEntity, MJListDetailEntity, MJUserSettingEntity, MJUserViewEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, RunView, EntityInfo, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { ListSetOperationsService, SetOperand, VennData, VennIntersection, SetOperation, SetOperationResult, operandCacheKey } from '../services/list-set-operations.service';
import { VennRegionClickEvent } from './venn-diagram/venn-diagram.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ExportService } from '@memberjunction/ng-export-service';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import type { ListDelta, ListSource } from '@memberjunction/lists';
interface ListSelection {
  list: MJListEntity;
  entityName: string;
  color: string;
}

/**
 * Parallel structure for view operands. Views resolve to record IDs the
 * same way lists do (via the operations service's cache), but are tracked
 * separately in component state so existing list-only flows keep working.
 */
interface ViewSelection {
  view: MJUserViewEntity;
  entityName: string;
  entityID: string;
  color: string;
}

/**
 * Preview record with meaningful display fields
 */
interface PreviewRecord {
  id: string;
  displayName: string;
  secondaryInfo?: string;
  entityName: string;
}

/**
 * Entity option for filtering
 */
interface EntityOption {
  id: string;
  name: string;
  listCount: number;
}

@RegisterClass(BaseResourceComponent, 'ListsOperationsResource')
@Component({
  standalone: false,
  selector: 'mj-lists-operations-resource',
  template: `
    <div class="operations-container">
      <!-- Header -->
      <div class="operations-header">
        <div class="header-top">
          <div class="header-title">
            <i class="fa-solid fa-diagram-project"></i>
            <h2>List Operations</h2>
          </div>
          @if (totalOperandCount > 0 || selectedEntityId) {
            <button
              class="clear-all-btn"
              (click)="clearAllSelections()"
              title="Clear all selections">
              <i class="fa-solid fa-xmark"></i>
              Clear
            </button>
          }
        </div>
        <div class="header-subtitle">
          Visualize overlaps and perform set operations on your lists
        </div>
      </div>
    
      <!-- Main Content -->
      <div class="operations-content">
        <!-- Left Panel: List Selection -->
        <div class="selection-panel">
          <div class="panel-header">
            <h3>Selected Operands</h3>
            @if (totalOperandCount > 0) {
              <span class="list-count">
                {{totalOperandCount}}/{{maxLists}}
              </span>
            }
          </div>
    
          <!-- Entity Filter Selector -->
          <div class="entity-filter-section">
            <label class="filter-label">Filter by Entity</label>
            <div class="entity-selector">
              <select
                [(ngModel)]="selectedEntityId"
                (ngModelChange)="onEntityFilterChange()"
                class="entity-select">
                <option value="">All Entities</option>
                @for (entity of entityOptions; track entity) {
                  <option [value]="entity.id">
                    {{entity.name}} ({{entity.listCount}})
                  </option>
                }
              </select>
            </div>
          </div>
    
          <!-- Selected lists -->
          <div class="selected-lists">
            @for (item of selectedLists; track item; let i = $index) {
              <div class="selected-item">
                <div class="item-color" [style.background-color]="item.color"></div>
                <div class="item-info">
                  <span class="item-name">{{item.list.Name}}</span>
                  <span class="item-entity">{{item.entityName}}</span>
                </div>
                <button class="remove-btn" (click)="removeList(i)">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            }
    
            @if (totalOperandCount < maxLists) {
              <div class="add-list-area">
                <div class="add-list-search">
                  <i class="fa-solid fa-search"></i>
                  <input
                    type="text"
                    [(ngModel)]="listSearchTerm"
                    (ngModelChange)="filterAvailableLists()"
                    placeholder="Search lists to add..."
                    (focus)="showListDropdown = true" />
                </div>
                <!-- Available lists dropdown -->
                @if (showListDropdown && filteredAvailableLists.length > 0) {
                  <div class="list-dropdown">
                    <div class="dropdown-backdrop" (click)="showListDropdown = false"></div>
                    <div class="dropdown-content">
                      @for (list of filteredAvailableLists; track list) {
                        <div
                          class="dropdown-item"
                          (click)="addList(list)">
                          <span class="dropdown-name">{{list.Name}}</span>
                          <span class="dropdown-entity">{{list.Entity}}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
    
            @if (totalOperandCount >= maxLists) {
              <div class="lists-full">
                <i class="fa-solid fa-info-circle"></i>
                Maximum {{maxLists}} operands can be compared
              </div>
            }
          </div>

          <!-- Selected views (Phase 1.8). Tracked separately from lists
               so the existing list flows stay untouched, but combined at
               compute time via SetOperand[]. Dashed-style icon flags them
               as dynamic-at-resolution. -->
          <div class="selected-views">
            @for (item of selectedViews; track item; let i = $index) {
              <div class="selected-item selected-item--view">
                <div class="item-color item-color--view" [style.border-color]="item.color"></div>
                <div class="item-info">
                  <span class="item-name">
                    <i class="fa-solid fa-eye" [title]="'View'"></i>
                    {{item.view.Name}}
                  </span>
                  <span class="item-entity">{{item.entityName}}</span>
                </div>
                <button class="remove-btn" (click)="removeView(i)">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            }

            @if (totalOperandCount < maxLists) {
              <div class="add-list-area">
                <div class="add-list-search">
                  <i class="fa-solid fa-eye"></i>
                  <input
                    type="text"
                    [(ngModel)]="viewSearchTerm"
                    (ngModelChange)="filterAvailableViews()"
                    placeholder="Search views to add..."
                    (focus)="showViewDropdown = true" />
                </div>
                @if (showViewDropdown && filteredAvailableViews.length > 0) {
                  <div class="list-dropdown">
                    <div class="dropdown-backdrop" (click)="showViewDropdown = false"></div>
                    <div class="dropdown-content">
                      @for (view of filteredAvailableViews; track view) {
                        <div
                          class="dropdown-item"
                          (click)="addView(view)">
                          <span class="dropdown-name">
                            <i class="fa-solid fa-eye"></i>
                            {{view.Name}}
                          </span>
                          <span class="dropdown-entity">{{view.Entity}}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Entity consistency note -->
          @if (totalOperandCount > 0 && lockedEntityName) {
            <div class="entity-note">
              <i class="fa-solid fa-info-circle"></i>
              <span>Comparing operands of type: <strong>{{lockedEntityName}}</strong></span>
            </div>
          }

          <!-- Quick Operations -->
          @if (totalOperandCount >= 2) {
            <div class="quick-operations">
              <h4>Quick Operations</h4>
              <div class="operation-buttons">
                <button class="op-btn" (click)="performOperation('union')" [disabled]="isCalculating">
                  <i class="fa-solid fa-layer-group"></i>
                  <span>Union All</span>
                </button>
                <button class="op-btn" (click)="performOperation('intersection')" [disabled]="isCalculating">
                  <i class="fa-solid fa-circle-notch"></i>
                  <span>Intersection</span>
                </button>
                <button class="op-btn" (click)="performOperation('symmetric_difference')" [disabled]="isCalculating">
                  <i class="fa-solid fa-arrows-split-up-and-left"></i>
                  <span>Unique Each</span>
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Center: Venn Diagram -->
        <div class="venn-panel">
          @if (totalOperandCount > 0) {
            <mj-venn-diagram
              [data]="vennData"
              [selectedRegion]="selectedRegion"
              (regionClick)="onRegionClick($event)">
            </mj-venn-diagram>
          }

          @if (totalOperandCount === 0) {
            <div class="venn-empty">
              <div class="empty-icon">
                <i class="fa-solid fa-circle-nodes"></i>
              </div>
              <h3>Add Lists or Views to Compare</h3>
              <p>Select 2-4 lists or views from the same entity to visualize their overlaps and perform set operations.</p>
            </div>
          }
    
          @if (isCalculating) {
            <div class="loading-overlay">
              <mj-loading text="Calculating..."></mj-loading>
            </div>
          }
        </div>
    
        <!-- Right Panel: Selected Region / Results -->
        <div class="results-panel">
          <div class="panel-header">
            <h3>
              <i class="fa-solid fa-crosshairs"></i>
              {{selectedRegion ? 'Selected Region' : 'Results'}}
            </h3>
          </div>
    
          <!-- Selected region details -->
          @if (selectedRegion) {
            <div class="region-details">
              <div class="region-header">
                <span class="region-label">{{selectedRegion.label}}</span>
                <span class="region-count">{{selectedRegion.size}} records</span>
              </div>
              <div class="region-actions">
                <button mjButton variant="primary" (click)="createListFromSelection()">
                  <i class="fa-solid fa-plus"></i>
                  Create New List
                </button>
                <button mjButton (click)="addToExistingList()">
                  <i class="fa-solid fa-folder-plus"></i>
                  Add to List
                </button>
                <button mjButton (click)="exportToExcel()">
                  <i class="fa-solid fa-file-excel"></i>
                  Export
                </button>
              </div>
              @if (previewRecordsDisplay.length > 0) {
                <div class="record-preview">
                  <h5>Preview (first 10)</h5>
                  <div class="preview-list">
                    @for (record of previewRecordsDisplay; track record) {
                      <div class="preview-card">
                        <div class="preview-card-content">
                          <span class="preview-name">{{record.displayName}}</span>
                          @if (record.secondaryInfo) {
                            <span class="preview-secondary">{{record.secondaryInfo}}</span>
                          }
                        </div>
                        <button class="preview-open-btn" (click)="openRecord(record)" title="Open record">
                          <i class="fa-solid fa-external-link-alt"></i>
                        </button>
                      </div>
                    }
                  </div>
                  @if (loadingPreview) {
                    <div class="preview-loading">
                      <mj-loading text="Loading preview..." size="small"></mj-loading>
                    </div>
                  }
                </div>
              }
            </div>
          }
    
          <!-- Operation result -->
          @if (lastOperationResult && !selectedRegion) {
            <div class="operation-result">
              <div class="result-header">
                <span class="result-operation">{{getOperationLabel(lastOperationResult.operation)}}</span>
                <span class="result-count">{{lastOperationResult.resultCount}} records</span>
              </div>
              <div class="region-actions">
                <button mjButton variant="primary" (click)="createListFromResult()">
                  <i class="fa-solid fa-plus"></i>
                  Create New List
                </button>
                <button mjButton (click)="addResultToExistingList()">
                  <i class="fa-solid fa-folder-plus"></i>
                  Add to List
                </button>
              </div>
            </div>
          }
    
          <!-- Empty state -->
          @if (!selectedRegion && !lastOperationResult) {
            <div class="results-empty">
              <i class="fa-solid fa-hand-pointer"></i>
              <p>Click a region in the diagram or run an operation to see results</p>
            </div>
          }
        </div>
      </div>

      <!-- Compose-into-target panel (Phase 1.10). Lives outside operations-content
           so it spans the full panel width per mockup 11. Only shows once
           the user has at least 2 operands selected. -->
      @if (totalOperandCount >= 2) {
        <div class="compose-panel">
          <div class="compose-panel__header">
            <i class="fa-solid fa-shapes"></i>
            <h3>Compose into a Target List</h3>
          </div>
          <div class="compose-panel__body">
            <div class="compose-grid">
              <!-- Sources column (read-only — reflects the chips above) -->
              <div class="compose-column">
                <div class="compose-column__label">Sources ({{ totalOperandCount }})</div>
                <div class="compose-sources">
                  @for (s of selectedLists; track s.list.ID) {
                    <div class="compose-source-chip">
                      <i class="fa-solid fa-list" [style.color]="s.color"></i>
                      <span class="compose-source-name">{{ s.list.Name }}</span>
                      <span class="compose-source-badge">List</span>
                    </div>
                  }
                  @for (s of selectedViews; track s.view.ID) {
                    <div class="compose-source-chip compose-source-chip--view">
                      <i class="fa-solid fa-eye" [style.color]="s.color"></i>
                      <span class="compose-source-name">{{ s.view.Name }}</span>
                      <span class="compose-source-badge compose-source-badge--view">View</span>
                    </div>
                  }
                </div>
              </div>

              <div class="compose-arrow">→</div>

              <!-- Operation column -->
              <div class="compose-column">
                <div class="compose-column__label">Operation</div>
                <div class="compose-options">
                  <label class="compose-option" [class.compose-option--selected]="composeOp === 'union'">
                    <input type="radio" name="composeOp" [checked]="composeOp === 'union'" (change)="composeOp = 'union'" />
                    <i class="fa-solid fa-layer-group"></i>
                    <div>
                      <div class="compose-option__title">Union</div>
                      <div class="compose-option__desc">Combine all sources, dedupe</div>
                    </div>
                  </label>
                  <label class="compose-option" [class.compose-option--selected]="composeOp === 'intersection'">
                    <input type="radio" name="composeOp" [checked]="composeOp === 'intersection'" (change)="composeOp = 'intersection'" />
                    <i class="fa-solid fa-circle-notch"></i>
                    <div>
                      <div class="compose-option__title">Intersection</div>
                      <div class="compose-option__desc">Only records in all sources</div>
                    </div>
                  </label>
                  <label class="compose-option" [class.compose-option--selected]="composeOp === 'difference'">
                    <input type="radio" name="composeOp" [checked]="composeOp === 'difference'" (change)="composeOp = 'difference'" />
                    <i class="fa-solid fa-minus-circle"></i>
                    <div>
                      <div class="compose-option__title">Difference</div>
                      <div class="compose-option__desc">First minus the rest</div>
                    </div>
                  </label>
                </div>
              </div>

              <div class="compose-arrow">→</div>

              <!-- Target column -->
              <div class="compose-column">
                <div class="compose-column__label">Target</div>
                <div class="compose-options">
                  <label class="compose-option" [class.compose-option--selected]="composeTarget === 'new'">
                    <input type="radio" name="composeTarget" [checked]="composeTarget === 'new'" (change)="composeTarget = 'new'" />
                    <div class="compose-option__title">Create New List</div>
                  </label>
                  <label class="compose-option" [class.compose-option--selected]="composeTarget === 'existing'">
                    <input type="radio" name="composeTarget" [checked]="composeTarget === 'existing'" (change)="composeTarget = 'existing'" />
                    <div class="compose-option__title">Existing List…</div>
                  </label>

                  @if (composeTarget === 'new') {
                    <input
                      class="compose-input"
                      type="text"
                      [(ngModel)]="composeNewListName"
                      placeholder="New list name…" />
                  } @else {
                    <div class="compose-target-search">
                      <input
                        class="compose-input"
                        type="text"
                        [(ngModel)]="composeTargetSearch"
                        (focus)="showComposeTargetDropdown = true"
                        placeholder="Search lists…" />
                      @if (showComposeTargetDropdown && filteredComposeTargets.length > 0) {
                        <div class="compose-target-dropdown">
                          <div class="dropdown-backdrop" (click)="showComposeTargetDropdown = false"></div>
                          <div class="dropdown-content">
                            @for (l of filteredComposeTargets; track l.ID) {
                              <div class="dropdown-item" (click)="selectComposeTarget(l)">
                                <span class="dropdown-name">{{ l.Name }}</span>
                                <span class="dropdown-entity">{{ l.Entity }}</span>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="compose-footer">
              <button class="op-btn" (click)="previewCompose()" [disabled]="isCalculating || isComposing">
                <i class="fa-solid fa-eye"></i>
                <span>Preview Result</span>
              </button>
              <button class="op-btn op-btn--primary" (click)="composeAndSave()" [disabled]="!canCompose || isCalculating || isComposing">
                @if (isComposing) {
                  <i class="fa-solid fa-spinner fa-spin"></i>
                } @else {
                  <i class="fa-solid fa-bolt"></i>
                }
                <span>{{ isComposing ? 'Composing…' : 'Compute & Save' }}</span>
              </button>
              <div class="compose-footer__spacer"></div>
              @if (lastOperationResult) {
                <div class="compose-footer__hint">
                  Expected output: <strong>{{ lastOperationResult.resultCount }} records</strong>
                  ({{ getOperationLabel(lastOperationResult.operation) }})
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- Compose-into-existing-list delta-confirm -->
      <mj-list-delta-confirm
        [Visible]="composeConfirmVisible && !!composeDelta"
        [Delta]="composeDelta"
        [TargetListName]="composeTargetDisplayName()"
        [SourceLabel]="'compose result'"
        (Confirm)="onComposeConfirmCommit($event)"
        (Cancel)="onComposeConfirmCancel()">
      </mj-list-delta-confirm>

      <!-- Create List Dialog -->
      @if (showCreateDialog) {
        <div class="modal-overlay" (click)="cancelCreateDialog()"></div>
      }
      @if (showCreateDialog) {
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Create New List from Selection</h3>
            <button class="modal-close" (click)="cancelCreateDialog()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>List Name *</label>
              <input
                type="text"
                [(ngModel)]="newListName"
                placeholder="Enter list name"
                class="form-input" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea
                [(ngModel)]="newListDescription"
                placeholder="Optional description"
                class="form-input"
              rows="3"></textarea>
            </div>
            <div class="form-info">
              <i class="fa-solid fa-info-circle"></i>
              {{recordsToAdd.length}} record{{recordsToAdd.length !== 1 ? 's' : ''}} will be added to this list
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" (click)="confirmCreateList()" [disabled]="!newListName || isSaving">
              @if (isSaving) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              }
              {{isSaving ? 'Creating...' : 'Create List'}}
            </button>
            <button class="btn-secondary" (click)="cancelCreateDialog()">Cancel</button>
          </div>
        </div>
      }
    
      <!-- Add to Existing List Dialog -->
      @if (showAddToListDialog) {
        <div class="modal-overlay" (click)="cancelAddToListDialog()"></div>
      }
      @if (showAddToListDialog) {
        <div class="modal-dialog add-to-list-dialog">
          <div class="modal-header">
            <h3>Add to Existing List</h3>
            <button class="modal-close" (click)="cancelAddToListDialog()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-info" style="margin-bottom: 16px;">
              <i class="fa-solid fa-info-circle"></i>
              {{recordsToAdd.length}} record{{recordsToAdd.length !== 1 ? 's' : ''}} will be added
            </div>
            <!-- Search input -->
            <div class="list-search">
              <i class="fa-solid fa-search"></i>
              <input
                type="text"
                [(ngModel)]="addToListSearchTerm"
                (ngModelChange)="filterAddToListOptions()"
                placeholder="Search lists..."
                class="form-input" />
            </div>
            <!-- List options -->
            <div class="list-options">
              @for (list of filteredAddToListOptions; track list) {
                <div
                  class="list-option"
                  [class.selected]="IsTargetListSelected(list)"
                  (click)="selectTargetList(list.ID)">
                  <div class="list-option-radio">
                    <input
                      type="radio"
                      [checked]="IsTargetListSelected(list)"
                      name="targetList" />
                  </div>
                  <div class="list-option-info">
                    <span class="list-option-name">{{list.Name}}</span>
                    <span class="list-option-entity">{{list.Entity}}</span>
                  </div>
                </div>
              }
              @if (filteredAddToListOptions.length === 0) {
                <div class="list-options-empty">
                  <i class="fa-solid fa-inbox"></i>
                  <p>{{addToListSearchTerm ? 'No lists match your search' : 'No other lists available'}}</p>
                </div>
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" (click)="confirmAddToList()" [disabled]="!selectedTargetListId || isSaving">
              @if (isSaving) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              }
              {{isSaving ? 'Adding...' : 'Add to List'}}
            </button>
            <button class="btn-secondary" (click)="cancelAddToListDialog()">Cancel</button>
          </div>
        </div>
      }
    </div>
    `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .operations-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface);
    }

    .operations-header {
      padding: 20px 24px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .clear-all-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 13px;
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .clear-all-btn:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border-color: var(--mj-status-error);
      color: var(--mj-status-error);
    }

    .clear-all-btn i {
      font-size: 12px;
    }

    .header-title i {
      font-size: 24px;
      color: var(--mj-brand-primary);
    }

    .header-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .header-subtitle {
      color: var(--mj-text-secondary);
      font-size: 14px;
    }

    .operations-content {
      display: grid;
      grid-template-columns: 280px 1fr 300px;
      gap: 16px;
      flex: 1;
      padding: 16px;
      overflow: hidden;
    }

    /* Panels */
    .selection-panel,
    .results-panel {
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .venn-panel {
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      position: relative;
      min-height: 400px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .list-count {
      font-size: 12px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Entity Filter */
    .entity-filter-section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .filter-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .entity-select {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      background: var(--mj-bg-surface-card);
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }

    .entity-select:focus {
      border-color: var(--mj-brand-primary);
    }

    .entity-note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 12px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      border-radius: 6px;
      font-size: 12px;
      color: var(--mj-status-success);
    }

    .entity-note i {
      color: var(--mj-status-success);
    }

    /* Selected Lists */
    .selected-lists {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    /* Selected Views (sibling section) */
    .selected-views {
      overflow-y: auto;
      padding: 0 12px 12px 12px;
    }

    .selected-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      margin-bottom: 8px;
    }

    /* View operands get a dashed outline so they read distinctly from
       list operands. The fill stays muted because views are dynamic. */
    .selected-item--view {
      border: 1px dashed var(--mj-border-default);
      background: var(--mj-bg-surface);
    }

    .item-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    /* View color swatch is a ring around a hollow centre — mirrors the
       dashed-stroke convention from the Venn diagram. */
    .item-color--view {
      background: transparent !important;
      border: 2px dashed currentColor;
      border-radius: 50%;
    }

    .item-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-entity {
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .remove-btn {
      background: none;
      border: none;
      color: var(--mj-text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }

    .remove-btn:hover {
      background: var(--mj-border-default);
      color: var(--mj-text-secondary);
    }

    /* Add list area */
    .add-list-area {
      position: relative;
    }

    .add-list-search {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px dashed var(--mj-border-default);
      border-radius: 6px;
      transition: border-color 0.2s;
    }

    .add-list-search:focus-within {
      border-color: var(--mj-brand-primary);
    }

    .add-list-search i {
      color: var(--mj-text-muted);
    }

    .add-list-search input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 13px;
    }

    .list-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 100;
      margin-top: 4px;
    }

    .dropdown-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }

    .dropdown-content {
      position: relative;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      box-shadow: var(--mj-shadow-md);
      max-height: 200px;
      overflow-y: auto;
    }

    .dropdown-item {
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .dropdown-item:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .dropdown-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
    }

    .dropdown-entity {
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .lists-full {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      font-size: 12px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
    }

    .entity-warning {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 12px;
      padding: 10px;
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      border-radius: 6px;
      font-size: 12px;
      color: var(--mj-status-warning);
    }

    .entity-warning i {
      color: var(--mj-status-warning);
      margin-top: 2px;
    }

    /* Quick Operations */
    .quick-operations {
      padding: 12px;
      border-top: 1px solid var(--mj-border-default);
    }

    .quick-operations h4 {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .operation-buttons {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .op-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 13px;
      color: var(--mj-text-primary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .op-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    .op-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Venn Panel */
    .venn-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      padding: 40px;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-radius: 50%;
      margin-bottom: 20px;
    }

    .empty-icon i {
      font-size: 36px;
      color: var(--mj-brand-primary);
    }

    .venn-empty h3 {
      margin: 0 0 8px;
      font-size: 18px;
      color: var(--mj-text-primary);
    }

    .venn-empty p {
      margin: 0;
      color: var(--mj-text-secondary);
      font-size: 14px;
      max-width: 300px;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: color-mix(in srgb, var(--mj-bg-surface-card) 90%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Results Panel */
    .region-details,
    .operation-result {
      padding: 16px;
    }

    .region-header,
    .result-header {
      margin-bottom: 16px;
    }

    .region-label,
    .result-operation {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
      margin-bottom: 4px;
    }

    .region-count,
    .result-count {
      font-size: 13px;
      color: var(--mj-brand-primary);
      font-weight: 500;
    }

    .region-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 13px;
      color: var(--mj-text-primary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .action-btn.primary {
      background: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .action-btn.primary:hover {
      background: var(--mj-brand-primary-hover);
    }

    .record-preview h5 {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--mj-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preview-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .preview-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      margin-bottom: 6px;
      transition: all 0.15s ease;
    }

    .preview-card:hover {
      background: var(--mj-bg-surface-sunken);
      box-shadow: var(--mj-shadow-sm);
    }

    .preview-card-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .preview-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-secondary {
      font-size: 11px;
      color: var(--mj-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-open-btn {
      background: none;
      border: none;
      color: var(--mj-brand-primary);
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 4px;
      opacity: 0.6;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .preview-open-btn:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .preview-loading {
      padding: 12px;
      text-align: center;
    }

    .results-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      text-align: center;
      color: var(--mj-text-muted);
    }

    .results-empty i {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .results-empty p {
      font-size: 13px;
      margin: 0;
      max-width: 200px;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--mj-bg-overlay);
      z-index: 1000;
    }

    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--mj-bg-surface-card);
      border-radius: 12px;
      width: 420px;
      max-width: 90vw;
      z-index: 1001;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 16px;
      color: var(--mj-text-primary);
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--mj-text-muted);
      cursor: pointer;
      padding: 4px 8px;
    }

    .modal-body {
      padding: 20px;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    textarea.form-input {
      resize: vertical;
    }

    .form-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    .form-info i {
      color: var(--mj-brand-primary);
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 10px 20px;
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-secondary);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-secondary:hover {
      background: var(--mj-bg-surface-sunken);
    }

    /* Add to List Dialog */
    .add-to-list-dialog {
      width: 480px;
    }

    .add-to-list-dialog .modal-body {
      max-height: 400px;
      overflow-y: auto;
    }

    .list-search {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .list-search i {
      color: var(--mj-text-muted);
      flex-shrink: 0;
    }

    .list-search .form-input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 0;
      font-size: 14px;
    }

    .list-search .form-input:focus {
      box-shadow: none;
      outline: none;
    }

    .list-options {
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      max-height: 250px;
      overflow-y: auto;
    }

    .list-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .list-option:last-child {
      border-bottom: none;
    }

    .list-option:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .list-option.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .list-option-radio {
      flex-shrink: 0;
    }

    .list-option-radio input[type="radio"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--mj-brand-primary);
    }

    .list-option-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .list-option-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--mj-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-option-entity {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .list-options-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
      text-align: center;
      color: var(--mj-text-muted);
    }

    .list-options-empty i {
      font-size: 28px;
      margin-bottom: 10px;
      opacity: 0.5;
    }

    .list-options-empty p {
      margin: 0;
      font-size: 13px;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .operations-content {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr auto;
      }

      .selection-panel {
        order: 1;
      }

      .venn-panel {
        order: 2;
        min-height: 300px;
      }

      .results-panel {
        order: 3;
      }
    }

    /* Compose-into-target panel (Phase 1.10) */
    .compose-panel {
      margin: 16px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 10px;
      overflow: hidden;
    }

    .compose-panel__header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .compose-panel__header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .compose-panel__body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .compose-grid {
      display: grid;
      grid-template-columns: 1.2fr auto 1fr auto 1fr;
      gap: 16px;
      align-items: flex-start;
    }

    .compose-arrow {
      align-self: center;
      font-size: 24px;
      color: var(--mj-text-muted);
    }

    .compose-column {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .compose-column__label {
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mj-text-muted);
    }

    .compose-sources {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .compose-source-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      font-size: 12.5px;
    }

    .compose-source-chip--view {
      border: 1px dashed var(--mj-border-default);
      background: var(--mj-bg-surface);
    }

    .compose-source-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .compose-source-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .compose-source-badge--view {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .compose-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .compose-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      background: var(--mj-bg-surface);
      cursor: pointer;
      font-size: 12.5px;
    }

    .compose-option--selected {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
    }

    .compose-option__title {
      font-weight: 600;
    }

    .compose-option__desc {
      font-size: 11.5px;
      color: var(--mj-text-muted);
    }

    .compose-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      background: var(--mj-bg-surface);
      font-size: 12.5px;
    }

    .compose-target-search {
      position: relative;
    }

    .compose-target-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 50;
    }

    .compose-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--mj-border-default);
    }

    .compose-footer__spacer { flex: 1; }

    .compose-footer__hint {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .op-btn--primary {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .op-btn--primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsOperationsResource extends BaseResourceComponent implements OnDestroy {
  protected override destroy$ = new Subject<void>();

  maxLists = 4;
  selectedLists: ListSelection[] = [];
  availableLists: MJListEntity[] = [];
  filteredAvailableLists: MJListEntity[] = [];
  listSearchTerm = '';
  showListDropdown = false;

  // View operands (new in Phase 1.8). Tracked separately from selectedLists
  // so the existing list-only logic keeps working; the operand-aware
  // service combines both into a single computation.
  selectedViews: ViewSelection[] = [];
  availableViews: MJUserViewEntity[] = [];
  filteredAvailableViews: MJUserViewEntity[] = [];
  viewSearchTerm = '';
  showViewDropdown = false;

  // Entity filter
  entityOptions: EntityOption[] = [];
  selectedEntityId = '';

  vennData: VennData | null = null;
  selectedRegion: VennIntersection | null = null;
  lastOperationResult: SetOperationResult | null = null;
  previewRecords: string[] = [];
  previewRecordsDisplay: PreviewRecord[] = [];
  loadingPreview = false;

  isCalculating = false;
  isSaving = false;

  // Create dialog
  showCreateDialog = false;
  newListName = '';
  newListDescription = '';
  recordsToAdd: string[] = [];

  // Add to existing list dialog
  showAddToListDialog = false;
  addToListSearchTerm = '';
  filteredAddToListOptions: MJListEntity[] = [];
  selectedTargetListId: string | null = null;

  // Compose-into-target panel (Phase 1.10) — picks an op + target for
  // committing the result of the selected operands.
  composeOp: SetOperation = 'union';
  composeTarget: 'new' | 'existing' = 'new';
  composeNewListName = '';
  composeTargetListId: string | null = null;
  composeTargetSearch = '';
  showComposeTargetDropdown = false;
  isComposing = false;
  composeDelta: ListDelta | null = null;
  composeConfirmVisible = false;

  private entityIdFromSelectedLists: string | null = null;
  private currentEntityInfo: EntityInfo | null = null;

  // User Settings persistence
  private readonly USER_SETTING_KEY = 'ListsOperations.State';
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private isLoadingSettings = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private setOperationsService: ListSetOperationsService,
    private notificationService: MJNotificationService,
    private exportService: ExportService
  ) {
    super();
  }

  get hasMultipleEntities(): boolean {
    if (this.totalOperandCount < 2) return false;
    const entities = new Set<string>();
    for (const s of this.selectedLists) entities.add(s.list.EntityID);
    for (const s of this.selectedViews) entities.add(s.entityID);
    return entities.size > 1;
  }

  async ngOnInit() {
    super.ngOnInit();
    this.setOperationsService.Provider = this.ProviderToUse;
    await this.loadAvailableLists();
    await this.loadSavedState();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();

    // Clear any pending save timeout
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }
  }

  async loadAvailableLists() {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    // RunViews's typed overload doesn't express tuple positions, so we
    // run them as two parallel single-typed RunView calls — same number
    // of round trips, cleaner typing.
    const [listResult, viewResult] = await Promise.all([
      rv.RunView<MJListEntity>({
        EntityName: 'MJ: Lists',
        ExtraFilter: `UserID = '${md.CurrentUser?.ID}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object',
      }),
      rv.RunView<MJUserViewEntity>({
        EntityName: 'MJ: User Views',
        ExtraFilter: `UserID = '${md.CurrentUser?.ID}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object',
      }),
    ]);

    if (listResult.Success) {
      this.availableLists = listResult.Results || [];
      this.buildEntityOptions();
      this.filterAvailableLists();
    }
    if (viewResult.Success) {
      this.availableViews = viewResult.Results || [];
      this.filterAvailableViews();
    }
  }

  /**
   * Build entity options for the filter dropdown
   */
  private buildEntityOptions(): void {
    const entityCounts = new Map<string, { name: string; count: number }>();

    for (const list of this.availableLists) {
      const existing = entityCounts.get(list.EntityID);
      if (existing) {
        existing.count++;
      } else {
        entityCounts.set(list.EntityID, { name: list.Entity || 'Unknown', count: 1 });
      }
    }

    this.entityOptions = Array.from(entityCounts.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        listCount: data.count
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Handle entity filter change
   */
  onEntityFilterChange(): void {
    // If we're locked to an entity and the filter changes to a different
    // one, wipe both list AND view selections — the entity invariant
    // applies to all operands.
    const lockedEntityId = this.lockedEntityID;
    if (lockedEntityId && this.selectedEntityId && this.selectedEntityId !== lockedEntityId) {
      this.selectedLists = [];
      this.selectedViews = [];
      this.vennData = null;
      this.selectedRegion = null;
      this.lastOperationResult = null;
      this.previewRecordsDisplay = [];
    }
    this.filterAvailableLists();
    this.filterAvailableViews();
    this.saveState();
  }

  filterAvailableLists() {
    const selectedIds = new Set(this.selectedLists.map(s => s.list.ID));
    let filtered = this.availableLists.filter(l => !selectedIds.has(l.ID));

    // Apply entity filter from dropdown
    if (this.selectedEntityId) {
      filtered = filtered.filter(l => UUIDsEqual(l.EntityID, this.selectedEntityId));
    }

    // If we have any operands selected (list or view), restrict to same entity.
    const lockedEntityId = this.lockedEntityID;
    if (lockedEntityId) {
      filtered = filtered.filter(l => UUIDsEqual(l.EntityID, lockedEntityId));
    }

    if (this.listSearchTerm) {
      const term = this.listSearchTerm.toLowerCase();
      filtered = filtered.filter(l =>
        l.Name.toLowerCase().includes(term) ||
        (l.Entity && l.Entity.toLowerCase().includes(term))
      );
    }

    this.filteredAvailableLists = filtered.slice(0, 10);
  }

  /**
   * Same logic as `filterAvailableLists` for the view picker. Views are
   * locked to the same entity as any already-selected list or view.
   */
  filterAvailableViews() {
    const selectedIds = new Set(this.selectedViews.map(s => s.view.ID));
    let filtered = this.availableViews.filter(v => !selectedIds.has(v.ID));

    if (this.selectedEntityId) {
      filtered = filtered.filter(v => UUIDsEqual(v.EntityID, this.selectedEntityId));
    }

    const lockedEntityId = this.lockedEntityID;
    if (lockedEntityId) {
      filtered = filtered.filter(v => UUIDsEqual(v.EntityID, lockedEntityId));
    }

    if (this.viewSearchTerm) {
      const term = this.viewSearchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.Name.toLowerCase().includes(term) ||
        (v.Entity && v.Entity.toLowerCase().includes(term))
      );
    }

    this.filteredAvailableViews = filtered.slice(0, 10);
  }

  /**
   * Returns the entity ID that operands are currently locked to, or null
   * if no operands are selected. Lists win over views purely because they
   * come first in the operand list; either source is authoritative.
   */
  private get lockedEntityID(): string | null {
    if (this.selectedLists.length > 0) return this.selectedLists[0].list.EntityID;
    if (this.selectedViews.length > 0) return this.selectedViews[0].entityID;
    return null;
  }

  /**
   * Display name of the entity currently locking the picker — drives the
   * "Comparing operands of type: …" hint in the UI. Falls back to the
   * first available denormalized name we have.
   */
  public get lockedEntityName(): string | null {
    if (this.selectedLists.length > 0) return this.selectedLists[0].entityName;
    if (this.selectedViews.length > 0) return this.selectedViews[0].entityName;
    return null;
  }

  addList(list: MJListEntity) {
    const color = this.setOperationsService.getColorForIndex(this.totalOperandCount);

    this.selectedLists.push({
      list,
      entityName: list.Entity || 'Unknown',
      color
    });

    this.listSearchTerm = '';
    this.showListDropdown = false;
    this.filterAvailableLists();
    this.filterAvailableViews();
    this.recalculateVenn();
    this.saveState();
  }

  removeList(index: number) {
    this.selectedLists.splice(index, 1);

    // Reassign colors across BOTH lists and views so the palette stays in order.
    this.reassignOperandColors();

    this.filterAvailableLists();
    this.filterAvailableViews();
    this.recalculateVenn();
    this.saveState();
  }

  addView(view: MJUserViewEntity) {
    const color = this.setOperationsService.getColorForIndex(this.totalOperandCount);
    this.selectedViews.push({
      view,
      entityName: view.Entity || 'Unknown',
      entityID: view.EntityID,
      color,
    });
    this.viewSearchTerm = '';
    this.showViewDropdown = false;
    this.filterAvailableLists();
    this.filterAvailableViews();
    this.recalculateVenn();
    this.saveState();
  }

  removeView(index: number) {
    this.selectedViews.splice(index, 1);
    this.reassignOperandColors();
    this.filterAvailableLists();
    this.filterAvailableViews();
    this.recalculateVenn();
    this.saveState();
  }

  private reassignOperandColors(): void {
    let i = 0;
    for (const s of this.selectedLists) {
      s.color = this.setOperationsService.getColorForIndex(i++);
    }
    for (const s of this.selectedViews) {
      s.color = this.setOperationsService.getColorForIndex(i++);
    }
  }

  async recalculateVenn() {
    if (this.totalOperandCount === 0) {
      this.vennData = null;
      this.selectedRegion = null;
      this.lastOperationResult = null;
      return;
    }

    this.isCalculating = true;
    this.cdr.detectChanges();

    try {
      const operands = this.buildAllOperands();
      this.vennData = await this.setOperationsService.calculateVennDataForOperands(operands);
      this.selectedRegion = null;
      this.lastOperationResult = null;
    } catch (error) {
      console.error('Error calculating Venn data:', error);
    } finally {
      this.isCalculating = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Combined operand count — drives "≥ 2 operands" checks for showing
   * operation buttons + the Venn diagram empty-state.
   */
  get totalOperandCount(): number {
    return this.selectedLists.length + this.selectedViews.length;
  }

  /**
   * Build the unified `SetOperand[]` for the service. Lists come first
   * (preserving the existing color order); views follow. Each view's
   * color is picked sequentially from the same palette.
   */
  private buildAllOperands(): SetOperand[] {
    const fromLists: SetOperand[] = this.selectedLists.map((s) => ({
      kind: 'list',
      id: s.list.ID,
      name: s.list.Name,
      entityID: s.list.EntityID,
      entityName: s.entityName,
      color: s.color,
    }));
    const fromViews: SetOperand[] = this.selectedViews.map((s) => ({
      kind: 'view',
      id: s.view.ID,
      name: s.view.Name,
      entityID: s.entityID,
      entityName: s.entityName,
      color: s.color,
    }));
    return [...fromLists, ...fromViews];
  }

  onRegionClick(event: VennRegionClickEvent) {
    this.selectedRegion = event.intersection;
    this.lastOperationResult = null;
    this.previewRecords = event.recordIds.slice(0, 10);
    this.loadPreviewRecords(event.recordIds.slice(0, 10));
    this.cdr.detectChanges();
  }

  /**
   * Load preview records with meaningful display fields
   */
  private async loadPreviewRecords(recordIds: string[]): Promise<void> {
    if (recordIds.length === 0 || this.selectedLists.length === 0) {
      this.previewRecordsDisplay = [];
      return;
    }

    this.loadingPreview = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const entityId = this.selectedLists[0].list.EntityID;
      const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityId));

      if (!entityInfo) {
        // Fallback to showing just IDs
        this.previewRecordsDisplay = recordIds.map(id => ({
          id,
          displayName: id,
          entityName: this.selectedLists[0].entityName
        }));
        return;
      }

      this.currentEntityInfo = entityInfo;

      // Find the best display fields
      const displayFields = this.getDisplayFields(entityInfo);

      // Build filter for the records
      const primaryKeyFields = entityInfo.PrimaryKeys;
      const primaryKeyField = primaryKeyFields.length > 0 ? primaryKeyFields[0].Name : 'ID';
      const recordIdFilter = recordIds.map(id => `'${id}'`).join(',');

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entityInfo.Name,
        ExtraFilter: `${primaryKeyField} IN (${recordIdFilter})`,
        Fields: [primaryKeyField, ...displayFields],
        ResultType: 'simple'
      });

      if (result.Success && result.Results) {
        this.previewRecordsDisplay = result.Results.map(record => {
          const id = String(record[primaryKeyField] || '');
          const displayName = this.getDisplayValue(record, displayFields[0]) || id;
          const secondaryInfo = displayFields.length > 1
            ? this.getDisplayValue(record, displayFields[1])
            : undefined;

          return {
            id,
            displayName,
            secondaryInfo,
            entityName: entityInfo.Name
          };
        });
      } else {
        // Fallback
        this.previewRecordsDisplay = recordIds.map(id => ({
          id,
          displayName: id,
          entityName: entityInfo.Name
        }));
      }
    } catch (error) {
      console.error('Error loading preview records:', error);
      this.previewRecordsDisplay = recordIds.map(id => ({
        id,
        displayName: id,
        entityName: this.selectedLists[0]?.entityName || 'Unknown'
      }));
    } finally {
      this.loadingPreview = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Get the best display fields for an entity based on metadata
   */
  private getDisplayFields(entityInfo: EntityInfo): string[] {
    const fields: string[] = [];

    // First priority: NameField (IsNameField = true)
    const nameField = entityInfo.Fields.find(f => f.IsNameField);
    if (nameField) {
      fields.push(nameField.Name);
    }

    // Second priority: DefaultInView fields (excluding primary key unless it's also the name field)
    const defaultViewFields = entityInfo.Fields
      .filter(f => f.DefaultInView && !f.IsPrimaryKey && f.Name !== nameField?.Name)
      .slice(0, 2); // Take up to 2 more fields

    for (const field of defaultViewFields) {
      if (!fields.includes(field.Name)) {
        fields.push(field.Name);
      }
    }

    // If we still don't have any fields, use common field names
    if (fields.length === 0) {
      const commonNames = ['Name', 'Title', 'Subject', 'Description', 'Email', 'FirstName'];
      for (const name of commonNames) {
        const field = entityInfo.Fields.find(f => f.Name === name);
        if (field) {
          fields.push(field.Name);
          break;
        }
      }
    }

    // If still nothing, include primary key
    if (fields.length === 0 && entityInfo.PrimaryKeys.length > 0) {
      fields.push(entityInfo.PrimaryKeys[0].Name);
    }

    return fields.slice(0, 3); // Max 3 fields
  }

  /**
   * Get a display value from a record
   */
  private getDisplayValue(record: Record<string, unknown>, fieldName: string): string | undefined {
    const value = record[fieldName];
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  }

  /**
   * Open a record in the entity viewer
   */
  openRecord(record: PreviewRecord): void {
    if (!this.currentEntityInfo) {
      // Try to get entity info
      const md = this.ProviderToUse;
      const entityId = this.selectedLists[0]?.list.EntityID;
      if (entityId) {
        this.currentEntityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityId)) || null;
      }
    }

    if (this.currentEntityInfo) {
      SharedService.Instance.InvokeManualResize();
      // Create composite key for navigation
      const primaryKeyField = this.currentEntityInfo.PrimaryKeys.length > 0
        ? this.currentEntityInfo.PrimaryKeys[0].Name
        : 'ID';
      const compositeKey = new CompositeKey([{ FieldName: primaryKeyField, Value: record.id }]);
      SharedService.Instance.OpenEntityRecord(this.currentEntityInfo.Name, compositeKey);
    } else {
      this.notificationService.CreateSimpleNotification('Unable to open record', 'error', 3000);
    }
  }

  async performOperation(operation: SetOperation) {
    if (this.totalOperandCount < 2) return;

    this.isCalculating = true;
    this.selectedRegion = null;
    this.cdr.detectChanges();

    try {
      const operands = this.buildAllOperands();
      this.lastOperationResult = await this.setOperationsService.performOperationForOperands(operation, operands);
      this.previewRecords = this.lastOperationResult.resultRecordIds.slice(0, 10);
    } catch (error) {
      console.error('Error performing operation:', error);
    } finally {
      this.isCalculating = false;
      this.cdr.detectChanges();
    }
  }

  // -------------------------------------------------------------------
  // Compose-into-target (Phase 1.10)
  //
  // The "Compose" panel sits below the Venn diagram. It mirrors the
  // operand list already chosen above but adds the explicit target step:
  // either materialize the result into a brand-new List, or merge into an
  // existing one (which routes through the delta-confirm dialog because
  // existing-target operations can produce drops).
  //
  // The op selector here only supports the three set-ops the server
  // exposes (union / intersection / difference). The Quick Operations
  // panel above still has `symmetric_difference` for preview, but that
  // doesn't map to a server compose op — and a target commit needs the
  // server side for the delta + drop-guard.
  // -------------------------------------------------------------------

  /**
   * Server-side compose preview — builds inputs from the currently selected
   * operands (lists + views) and calls `ComposeLists`. Returns the signed
   * delta so `composeAndSave` can route through `ApplyListDelta` when the
   * target is an existing list.
   */
  private buildComposeInputs(): ListSource[] {
    const inputs: ListSource[] = this.selectedLists.map<ListSource>((s) => ({
      kind: 'list',
      listId: s.list.ID,
    }));
    for (const s of this.selectedViews) {
      inputs.push({ kind: 'view', viewId: s.view.ID });
    }
    return inputs;
  }

  public get canCompose(): boolean {
    if (this.totalOperandCount < 2) return false;
    if (this.composeTarget === 'new') return this.composeNewListName.trim().length > 0;
    return !!this.composeTargetListId;
  }

  /**
   * "Preview Result" — re-runs the Quick-Operation path with the compose
   * panel's chosen op so the user can see the expected output count
   * before committing. We use the local set-op service rather than the
   * server here because preview is a read-only operation that doesn't
   * need a delta token (target is null) — staying local keeps it fast.
   */
  public async previewCompose(): Promise<void> {
    if (this.totalOperandCount < 2) return;
    await this.performOperation(this.composeOp);
  }

  /**
   * Commit the compose: either materialize a new list (client-side using
   * the previewed record IDs) or merge into an existing list via the
   * server's ComposeLists + ApplyListDelta flow.
   */
  public async composeAndSave(): Promise<void> {
    if (!this.canCompose || this.isComposing) return;
    this.isComposing = true;
    this.cdr.detectChanges();
    try {
      if (this.composeTarget === 'new') {
        await this.composeToNewList();
      } else {
        await this.composeToExistingList();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Compose failed: ${message}`, 'error', 5000);
    } finally {
      this.isComposing = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * New-list path: ensure preview is fresh, then route through the
   * existing "create list from selection" machinery using the result's
   * record IDs. This keeps materialization + naming in one place.
   */
  private async composeToNewList(): Promise<void> {
    // Refresh preview so result reflects the compose-panel's op (the user
    // may have run a different op via Quick Operations).
    await this.performOperation(this.composeOp);
    if (!this.lastOperationResult || this.lastOperationResult.resultCount === 0) {
      this.notificationService.CreateSimpleNotification(
        'Compose produced zero records — nothing to save.',
        'warning',
        3000,
      );
      return;
    }
    this.newListName = this.composeNewListName.trim();
    this.newListDescription = `Composed via ${this.getOperationLabel(this.composeOp)} of ${this.totalOperandCount} source(s).`;
    this.recordsToAdd = this.lastOperationResult.resultRecordIds;
    await this.confirmCreateList();
    // Clear the compose form on success.
    this.composeNewListName = '';
    this.cdr.detectChanges();
  }

  /**
   * Existing-list path: compose server-side to get a signed delta, then
   * surface the delta-confirm dialog. Sync semantics (replace contents)
   * apply implicitly — the server returns ToRemove for any records that
   * are in the target but not in the compose result.
   */
  private async composeToExistingList(): Promise<void> {
    if (!this.composeTargetListId) return;
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
    const client = new GraphQLListsClient(provider);
    const delta = await client.ComposeLists({
      Op: this.composeOp as 'union' | 'intersection' | 'difference',
      Inputs: this.buildComposeInputs(),
      Target: { kind: 'list', listId: this.composeTargetListId },
    });
    this.composeDelta = delta;
    this.composeConfirmVisible = true;
  }

  public onComposeConfirmCancel(): void {
    this.composeConfirmVisible = false;
    this.composeDelta = null;
    this.cdr.detectChanges();
  }

  public async onComposeConfirmCommit(deltaToken: string): Promise<void> {
    if (!this.composeDelta) return;
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
    const client = new GraphQLListsClient(provider);
    try {
      const result = await client.ApplyListDelta({
        Delta: { ...this.composeDelta, DeltaToken: deltaToken },
        ConfirmDrops: (this.composeDelta.Counts.Remove ?? 0) > 0,
      });
      if (result.Success) {
        this.composeConfirmVisible = false;
        this.composeDelta = null;
        this.notificationService.CreateSimpleNotification(
          `Target updated: +${result.Counts?.Added ?? 0} / -${result.Counts?.Removed ?? 0}`,
          'success',
          3000,
        );
      } else {
        this.notificationService.CreateSimpleNotification(
          `Compose apply failed: ${result.Message}`,
          'error',
          5000,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Compose apply failed: ${message}`, 'error', 5000);
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * Filtered list of existing lists eligible as compose targets. We
   * exclude lists already in the selected operands (committing to a
   * source list would be a self-referential compose) and lists from
   * other entities (the entity invariant still applies).
   */
  public get filteredComposeTargets(): MJListEntity[] {
    const operandListIds = new Set(this.selectedLists.map((s) => s.list.ID));
    const lockedEntityId = this.lockedEntityID;
    let pool = this.availableLists.filter((l) => !operandListIds.has(l.ID));
    if (lockedEntityId) {
      pool = pool.filter((l) => UUIDsEqual(l.EntityID, lockedEntityId));
    }
    if (this.composeTargetSearch.trim().length > 0) {
      const term = this.composeTargetSearch.toLowerCase();
      pool = pool.filter((l) => l.Name.toLowerCase().includes(term));
    }
    return pool.slice(0, 10);
  }

  public selectComposeTarget(list: MJListEntity): void {
    this.composeTargetListId = list.ID;
    this.composeTargetSearch = list.Name;
    this.showComposeTargetDropdown = false;
  }

  public composeTargetDisplayName(): string {
    if (!this.composeTargetListId) return '';
    const found = this.availableLists.find((l) => UUIDsEqual(l.ID, this.composeTargetListId!));
    return found?.Name ?? '';
  }

  getOperationLabel(operation: SetOperation): string {
    switch (operation) {
      case 'union': return 'Union (All Records)';
      case 'intersection': return 'Intersection (Common Records)';
      case 'difference': return 'Difference';
      case 'symmetric_difference': return 'Unique to Each List';
      case 'complement': return 'Complement';
      default: return operation;
    }
  }

  createListFromSelection() {
    if (!this.selectedRegion || this.selectedRegion.size === 0) return;
    this.recordsToAdd = [...this.selectedRegion.recordIds];
    this.newListName = '';
    this.newListDescription = `Created from: ${this.selectedRegion.label}`;
    this.showCreateDialog = true;
  }

  createListFromResult() {
    if (!this.lastOperationResult || this.lastOperationResult.resultCount === 0) return;
    this.recordsToAdd = [...this.lastOperationResult.resultRecordIds];
    this.newListName = '';
    this.newListDescription = `Created from: ${this.getOperationLabel(this.lastOperationResult.operation)}`;
    this.showCreateDialog = true;
  }

  cancelCreateDialog() {
    this.showCreateDialog = false;
    this.newListName = '';
    this.newListDescription = '';
    this.recordsToAdd = [];
  }

  async confirmCreateList() {
    if (!this.newListName || this.recordsToAdd.length === 0) return;

    // Get entity ID from selected lists
    if (this.selectedLists.length === 0) return;
    const entityId = this.selectedLists[0].list.EntityID;

    this.isSaving = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const tg = await md.CreateTransactionGroup();

      // Queue the list plus all of its initial detail records in a single transaction.
      // NewRecord() assigns a client-side UUID so the details can reference list.ID
      // before the list actually persists.
      const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', md.CurrentUser);
      list.NewRecord();
      list.Name = this.newListName;
      list.Description = this.newListDescription || null;
      list.EntityID = entityId;
      list.UserID = md.CurrentUser!.ID;
      list.TransactionGroup = tg;
      await list.Save();

      for (const recordId of this.recordsToAdd) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', md.CurrentUser);
        detail.NewRecord();
        detail.ListID = list.ID;
        detail.RecordID = recordId;
        detail.Sequence = 0;
        detail.TransactionGroup = tg;
        await detail.Save();
      }

      if (!await tg.Submit()) {
        this.notificationService.CreateSimpleNotification(
          'Failed to create list — all changes have been rolled back',
          'error',
          4000
        );
        return;
      }

      this.notificationService.CreateSimpleNotification(
        `Created "${this.newListName}" with ${this.recordsToAdd.length} items`,
        'success',
        3000
      );

      this.cancelCreateDialog();

      // Refresh available lists
      await this.loadAvailableLists();
    } catch (error) {
      console.error('Error creating list:', error);
      this.notificationService.CreateSimpleNotification('Error creating list', 'error', 4000);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  addToExistingList() {
    if (!this.selectedRegion || this.selectedRegion.size === 0) return;
    this.recordsToAdd = [...this.selectedRegion.recordIds];
    this.openAddToListDialog();
  }

  addResultToExistingList() {
    if (!this.lastOperationResult || this.lastOperationResult.resultCount === 0) return;
    this.recordsToAdd = [...this.lastOperationResult.resultRecordIds];
    this.openAddToListDialog();
  }

  /**
   * Open the Add to Existing List dialog
   */
  private openAddToListDialog(): void {
    this.showAddToListDialog = true;
    this.addToListSearchTerm = '';
    this.selectedTargetListId = null;
    this.filterAddToListOptions();
  }

  /**
   * Filter available lists for add-to-list dialog
   */
  filterAddToListOptions(): void {
    // Get entity ID from selected lists to filter to same entity type
    if (this.selectedLists.length === 0) {
      this.filteredAddToListOptions = [];
      return;
    }

    const entityId = this.selectedLists[0].list.EntityID;

    // Filter to same entity, exclude already selected lists
    const selectedIds = new Set(this.selectedLists.map(s => s.list.ID));
    let filtered = this.availableLists.filter(l =>
      UUIDsEqual(l.EntityID, entityId) && !selectedIds.has(l.ID)
    );

    // Apply search filter
    if (this.addToListSearchTerm) {
      const term = this.addToListSearchTerm.toLowerCase();
      filtered = filtered.filter(l =>
        l.Name.toLowerCase().includes(term)
      );
    }

    this.filteredAddToListOptions = filtered;
  }

  /**
   * Select a target list for adding records
   */
  IsTargetListSelected(list: MJListEntity): boolean {
    return UUIDsEqual(this.selectedTargetListId, list.ID);
  }

  selectTargetList(listId: string): void {
    this.selectedTargetListId = listId;
  }

  /**
   * Cancel the add to list dialog
   */
  cancelAddToListDialog(): void {
    this.showAddToListDialog = false;
    this.addToListSearchTerm = '';
    this.selectedTargetListId = null;
    this.recordsToAdd = [];
  }

  /**
   * Confirm adding records to selected list
   */
  async confirmAddToList(): Promise<void> {
    if (!this.selectedTargetListId || this.recordsToAdd.length === 0) return;

    this.isSaving = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const tg = await md.CreateTransactionGroup();

      for (const recordId of this.recordsToAdd) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', md.CurrentUser);
        detail.ListID = this.selectedTargetListId;
        detail.RecordID = recordId;
        detail.Sequence = 0;
        detail.TransactionGroup = tg;
        await detail.Save();
      }

      const success = await tg.Submit();

      if (success) {
        const targetList = this.availableLists.find(l => UUIDsEqual(l.ID, this.selectedTargetListId));
        this.notificationService.CreateSimpleNotification(
          `Added ${this.recordsToAdd.length} records to "${targetList?.Name || 'list'}"`,
          'success',
          3000
        );
      } else {
        this.notificationService.CreateSimpleNotification(
          'Failed to add some records',
          'warning',
          4000
        );
      }

      this.cancelAddToListDialog();
    } catch (error) {
      console.error('Error adding to list:', error);
      this.notificationService.CreateSimpleNotification('Error adding records to list', 'error', 4000);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Export the currently-selected region (or full last-op result) to
   * Excel. Bulk-loads the underlying records by ID so the export
   * contains real data, not just primary keys. Column-picker is a
   * future polish; we ship with "all fields" for now.
   */
  async exportToExcel(): Promise<void> {
    const recordIds = this.selectedRegion?.recordIds ?? this.lastOperationResult?.resultRecordIds ?? [];
    if (recordIds.length === 0) {
      this.notificationService.CreateSimpleNotification('Nothing to export — pick a region first.', 'info', 3000);
      return;
    }
    // Find the entity name from the first available operand. The
    // entity-invariant guarantees they're all the same entity.
    const entityName =
      this.selectedLists[0]?.entityName ?? this.selectedViews[0]?.entityName ?? null;
    if (!entityName) {
      this.notificationService.CreateSimpleNotification('Cannot determine entity for export.', 'error', 4000);
      return;
    }
    this.isSaving = true;
    this.cdr.detectChanges();
    try {
      this.notificationService.CreateSimpleNotification(
        'Working on the export, will notify you when complete…',
        'info',
        2000,
      );
      const md = this.ProviderToUse;
      const entityInfo = md.EntityByName(entityName);
      if (!entityInfo) throw new Error(`Entity '${entityName}' not found`);
      // Single-PK fast path. Composite-PK entities require a different
      // filter shape; surface a clear error and stop rather than emit
      // a broken file.
      if (entityInfo.PrimaryKeys.length !== 1) {
        this.notificationService.CreateSimpleNotification(
          `Composite-PK entities ('${entityName}') aren't yet supported for Operations export.`,
          'warning',
          5000,
        );
        return;
      }
      const pk = entityInfo.PrimaryKeys[0].Name;
      const escaped = recordIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');

      const rv = RunView.FromMetadataProvider(md);
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entityName,
        ExtraFilter: `${pk} IN (${escaped})`,
        ResultType: 'simple',
      });
      if (!result.Success) {
        this.notificationService.CreateSimpleNotification(`Export failed: ${result.ErrorMessage}`, 'error', 5000);
        return;
      }
      const rows = result.Results ?? [];
      const fileName = `lists-operations-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const exportResult = await this.exportService.toExcel(rows, { fileName, includeHeaders: true });
      if (exportResult.success) {
        this.exportService.downloadResult(exportResult);
        this.notificationService.CreateSimpleNotification(`Exported ${rows.length} record(s)`, 'success', 3000);
      } else {
        this.notificationService.CreateSimpleNotification('Export failed', 'error', 5000);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.notificationService.CreateSimpleNotification(`Export error: ${message}`, 'error', 5000);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Operations';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }

  /**
   * Clear all selections and reset state
   */
  clearAllSelections(): void {
    this.selectedLists = [];
    this.selectedViews = [];
    this.selectedEntityId = '';
    this.vennData = null;
    this.selectedRegion = null;
    this.lastOperationResult = null;
    this.previewRecordsDisplay = [];
    this.filterAvailableLists();
    this.filterAvailableViews();
    this.saveState();
    this.cdr.detectChanges();
  }

  /**
   * Save state to User Settings (debounced to avoid excessive writes)
   */
  private saveState(): void {
    // Don't save during initial load
    if (this.isLoadingSettings) return;

    // Debounce the server save
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }
    this.saveSettingsTimeout = setTimeout(() => {
      this.saveStateToServer();
    }, 1000); // 1 second debounce
  }

  /**
   * Save state to User Settings entity on server
   */
  private async saveStateToServer(): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const userId = md.CurrentUser?.ID;
      if (!userId) return;

      const stateToSave = {
        entityId: this.selectedEntityId,
        listIds: this.selectedLists.map(s => s.list.ID)
      };

      const engine = UserInfoEngine.Instance;

      // Find existing setting from cached user settings
      let setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_KEY);

      if (!setting) {
        // Create new setting
        setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
        setting.UserID = userId;
        setting.Setting = this.USER_SETTING_KEY;
      }

      setting.Value = JSON.stringify(stateToSave);
      await setting.Save();
    } catch (error) {
      console.warn('Failed to save operations state to User Settings:', error);
    }
  }

  /**
   * Load saved state from User Settings
   */
  private async loadSavedState(): Promise<void> {
    this.isLoadingSettings = true;

    try {
      const md = this.ProviderToUse;
      const userId = md.CurrentUser?.ID;
      if (!userId) {
        this.isLoadingSettings = false;
        return;
      }

      // Load from cached User Settings
      const engine = UserInfoEngine.Instance;
      const setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_KEY);

      if (setting?.Value) {
        const state = JSON.parse(setting.Value) as { entityId?: string; listIds?: string[] };

        // Restore entity filter
        if (state.entityId) {
          this.selectedEntityId = state.entityId;
        }

        // Restore selected lists
        if (state.listIds && state.listIds.length > 0) {
          for (const listId of state.listIds) {
            const list = this.availableLists.find(l => UUIDsEqual(l.ID, listId));
            if (list) {
              const color = this.setOperationsService.getColorForIndex(this.selectedLists.length);
              this.selectedLists.push({
                list,
                entityName: list.Entity || 'Unknown',
                color
              });
            }
          }

          // If we restored lists, recalculate venn
          if (this.selectedLists.length > 0) {
            this.filterAvailableLists();
            await this.recalculateVenn();
          }
        }

        this.cdr.detectChanges();
      }
    } catch (error) {
      console.warn('Failed to load operations state from User Settings:', error);
    } finally {
      this.isLoadingSettings = false;
    }
  }
}
