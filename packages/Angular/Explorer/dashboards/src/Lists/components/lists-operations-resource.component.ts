import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, SharedService } from '@memberjunction/ng-shared';
import { ResourceData, ListEntity, ListDetailEntity, UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, RunView, EntityInfo, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { ListSetOperationsService, VennData, VennIntersection, SetOperation, SetOperationResult } from '../services/list-set-operations.service';
import { VennRegionClickEvent } from './venn-diagram/venn-diagram.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
interface ListSelection {
  list: ListEntity;
  entityName: string;
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
          @if (selectedLists.length > 0 || selectedEntityId) {
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
            <h3>Selected Lists</h3>
            @if (selectedLists.length > 0) {
              <span class="list-count">
                {{selectedLists.length}}/{{maxLists}}
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
    
            @if (selectedLists.length < maxLists) {
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
    
            @if (selectedLists.length >= maxLists) {
              <div class="lists-full">
                <i class="fa-solid fa-info-circle"></i>
                Maximum {{maxLists}} lists can be compared
              </div>
            }
          </div>
    
          <!-- Entity consistency note -->
          @if (selectedLists.length > 0) {
            <div class="entity-note">
              <i class="fa-solid fa-info-circle"></i>
              <span>Comparing lists of type: <strong>{{selectedLists[0].entityName}}</strong></span>
            </div>
          }
    
          <!-- Quick Operations -->
          @if (selectedLists.length >= 2) {
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
          @if (selectedLists.length > 0) {
            <mj-venn-diagram
              [data]="vennData"
              [selectedRegion]="selectedRegion"
              (regionClick)="onRegionClick($event)">
            </mj-venn-diagram>
          }
    
          @if (selectedLists.length === 0) {
            <div class="venn-empty">
              <div class="empty-icon">
                <i class="fa-solid fa-circle-nodes"></i>
              </div>
              <h3>Add Lists to Compare</h3>
              <p>Select 2-4 lists from the same entity to visualize their overlaps and perform set operations.</p>
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
                <button class="action-btn primary" (click)="createListFromSelection()">
                  <i class="fa-solid fa-plus"></i>
                  Create New List
                </button>
                <button class="action-btn" (click)="addToExistingList()">
                  <i class="fa-solid fa-folder-plus"></i>
                  Add to List
                </button>
                <button class="action-btn" (click)="exportToExcel()">
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
                <button class="action-btn primary" (click)="createListFromResult()">
                  <i class="fa-solid fa-plus"></i>
                  Create New List
                </button>
                <button class="action-btn" (click)="addResultToExistingList()">
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
                  [class.selected]="selectedTargetListId === list.ID"
                  (click)="selectTargetList(list.ID)">
                  <div class="list-option-radio">
                    <input
                      type="radio"
                      [checked]="selectedTargetListId === list.ID"
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
      background: #f5f7fa;
    }

    .operations-header {
      padding: 20px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
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
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 13px;
      color: #666;
      cursor: pointer;
      transition: all 0.2s;
    }

    .clear-all-btn:hover {
      background: #ffebee;
      border-color: #f44336;
      color: #d32f2f;
    }

    .clear-all-btn i {
      font-size: 12px;
    }

    .header-title i {
      font-size: 24px;
      color: #9C27B0;
    }

    .header-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .header-subtitle {
      color: #666;
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .venn-panel {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      position: relative;
      min-height: 400px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .list-count {
      font-size: 12px;
      color: #999;
      background: #f0f0f0;
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Entity Filter */
    .entity-filter-section {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .filter-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .entity-select {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }

    .entity-select:focus {
      border-color: #9C27B0;
    }

    .entity-note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 12px;
      padding: 8px 10px;
      background: #e8f5e9;
      border-radius: 6px;
      font-size: 12px;
      color: #2e7d32;
    }

    .entity-note i {
      color: #4caf50;
    }

    /* Selected Lists */
    .selected-lists {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .selected-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .item-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      flex-shrink: 0;
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
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-entity {
      font-size: 11px;
      color: #999;
    }

    .remove-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }

    .remove-btn:hover {
      background: #e0e0e0;
      color: #666;
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
      border: 1px dashed #ddd;
      border-radius: 6px;
      transition: border-color 0.2s;
    }

    .add-list-search:focus-within {
      border-color: #9C27B0;
    }

    .add-list-search i {
      color: #999;
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
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
      background: #f5f5f5;
    }

    .dropdown-name {
      font-size: 13px;
      font-weight: 500;
      color: #333;
    }

    .dropdown-entity {
      font-size: 11px;
      color: #999;
    }

    .lists-full {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      font-size: 12px;
      color: #999;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .entity-warning {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 12px;
      padding: 10px;
      background: #fff8e1;
      border-radius: 6px;
      font-size: 12px;
      color: #856404;
    }

    .entity-warning i {
      color: #ffc107;
      margin-top: 2px;
    }

    /* Quick Operations */
    .quick-operations {
      padding: 12px;
      border-top: 1px solid #f0f0f0;
    }

    .quick-operations h4 {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 600;
      color: #666;
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
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      color: #333;
      cursor: pointer;
      transition: all 0.2s;
    }

    .op-btn:hover:not(:disabled) {
      background: #e8f4fd;
      border-color: #9C27B0;
      color: #9C27B0;
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
      background: linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(156, 39, 176, 0.05) 100%);
      border-radius: 50%;
      margin-bottom: 20px;
    }

    .empty-icon i {
      font-size: 36px;
      color: #9C27B0;
    }

    .venn-empty h3 {
      margin: 0 0 8px;
      font-size: 18px;
      color: #333;
    }

    .venn-empty p {
      margin: 0;
      color: #666;
      font-size: 14px;
      max-width: 300px;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255,255,255,0.9);
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
      color: #333;
      margin-bottom: 4px;
    }

    .region-count,
    .result-count {
      font-size: 13px;
      color: #9C27B0;
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
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 13px;
      color: #333;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #f5f5f5;
    }

    .action-btn.primary {
      background: #9C27B0;
      border-color: #9C27B0;
      color: white;
    }

    .action-btn.primary:hover {
      background: #7B1FA2;
    }

    .record-preview h5 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #666;
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
      background: #f8f9fa;
      border-radius: 6px;
      margin-bottom: 6px;
      transition: all 0.15s ease;
    }

    .preview-card:hover {
      background: #eef1f5;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
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
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-secondary {
      font-size: 11px;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-open-btn {
      background: none;
      border: none;
      color: #9C27B0;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 4px;
      opacity: 0.6;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .preview-open-btn:hover {
      opacity: 1;
      background: rgba(156, 39, 176, 0.1);
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
      color: #999;
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
      background: rgba(0,0,0,0.5);
      z-index: 1000;
    }

    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
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
      border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 16px;
      color: #333;
    }

    .modal-close {
      background: none;
      border: none;
      color: #999;
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
      color: #666;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: #9C27B0;
      box-shadow: 0 0 0 3px rgba(156, 39, 176, 0.1);
    }

    textarea.form-input {
      resize: vertical;
    }

    .form-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 6px;
      font-size: 13px;
      color: #666;
    }

    .form-info i {
      color: #9C27B0;
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #9C27B0;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-primary:hover:not(:disabled) {
      background: #7B1FA2;
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 10px 20px;
      background: white;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }

    .btn-secondary:hover {
      background: #f5f5f5;
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
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .list-search i {
      color: #999;
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
      border: 1px solid #e0e0e0;
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
      border-bottom: 1px solid #f0f0f0;
    }

    .list-option:last-child {
      border-bottom: none;
    }

    .list-option:hover {
      background: #f8f9fa;
    }

    .list-option.selected {
      background: #f3e5f5;
    }

    .list-option-radio {
      flex-shrink: 0;
    }

    .list-option-radio input[type="radio"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #9C27B0;
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
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-option-entity {
      font-size: 12px;
      color: #888;
    }

    .list-options-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
      text-align: center;
      color: #999;
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
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsOperationsResource extends BaseResourceComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  maxLists = 4;
  selectedLists: ListSelection[] = [];
  availableLists: ListEntity[] = [];
  filteredAvailableLists: ListEntity[] = [];
  listSearchTerm = '';
  showListDropdown = false;

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
  filteredAddToListOptions: ListEntity[] = [];
  selectedTargetListId: string | null = null;

  private entityIdFromSelectedLists: string | null = null;
  private currentEntityInfo: EntityInfo | null = null;

  // User Settings persistence
  private readonly USER_SETTING_KEY = 'ListsOperations.State';
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private isLoadingSettings = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private setOperationsService: ListSetOperationsService,
    private notificationService: MJNotificationService
  ) {
    super();
  }

  get hasMultipleEntities(): boolean {
    if (this.selectedLists.length < 2) return false;
    const entities = new Set(this.selectedLists.map(s => s.list.EntityID));
    return entities.size > 1;
  }

  async ngOnInit() {
    await this.loadAvailableLists();
    await this.loadSavedState();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Clear any pending save timeout
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }
  }

  async loadAvailableLists() {
    const rv = new RunView();
    const md = new Metadata();

    const result = await rv.RunView<ListEntity>({
      EntityName: 'Lists',
      ExtraFilter: `UserID = '${md.CurrentUser?.ID}'`,
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this.availableLists = result.Results || [];
      this.buildEntityOptions();
      this.filterAvailableLists();
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
    // Clear selected lists if changing entity filter
    if (this.selectedLists.length > 0) {
      const firstEntityId = this.selectedLists[0].list.EntityID;
      if (this.selectedEntityId && this.selectedEntityId !== firstEntityId) {
        // Entity changed - clear selections
        this.selectedLists = [];
        this.vennData = null;
        this.selectedRegion = null;
        this.lastOperationResult = null;
        this.previewRecordsDisplay = [];
      }
    }
    this.filterAvailableLists();
    this.saveState();
  }

  filterAvailableLists() {
    const selectedIds = new Set(this.selectedLists.map(s => s.list.ID));
    let filtered = this.availableLists.filter(l => !selectedIds.has(l.ID));

    // Apply entity filter from dropdown
    if (this.selectedEntityId) {
      filtered = filtered.filter(l => l.EntityID === this.selectedEntityId);
    }

    // If we have selected lists, restrict to same entity
    if (this.selectedLists.length > 0) {
      this.entityIdFromSelectedLists = this.selectedLists[0].list.EntityID;
      filtered = filtered.filter(l => l.EntityID === this.entityIdFromSelectedLists);
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

  addList(list: ListEntity) {
    const color = this.setOperationsService.getColorForIndex(this.selectedLists.length);

    this.selectedLists.push({
      list,
      entityName: list.Entity || 'Unknown',
      color
    });

    this.listSearchTerm = '';
    this.showListDropdown = false;
    this.filterAvailableLists();
    this.recalculateVenn();
    this.saveState();
  }

  removeList(index: number) {
    this.selectedLists.splice(index, 1);

    // Reassign colors
    this.selectedLists.forEach((item, i) => {
      item.color = this.setOperationsService.getColorForIndex(i);
    });

    this.filterAvailableLists();
    this.recalculateVenn();
    this.saveState();
  }

  async recalculateVenn() {
    if (this.selectedLists.length === 0) {
      this.vennData = null;
      this.selectedRegion = null;
      this.lastOperationResult = null;
      return;
    }

    this.isCalculating = true;
    this.cdr.detectChanges();

    try {
      const lists = this.selectedLists.map(s => s.list);
      this.vennData = await this.setOperationsService.calculateVennData(lists);
      this.selectedRegion = null;
      this.lastOperationResult = null;
    } catch (error) {
      console.error('Error calculating Venn data:', error);
    } finally {
      this.isCalculating = false;
      this.cdr.detectChanges();
    }
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
      const md = new Metadata();
      const entityId = this.selectedLists[0].list.EntityID;
      const entityInfo = md.Entities.find(e => e.ID === entityId);

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

      const rv = new RunView();
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
      const md = new Metadata();
      const entityId = this.selectedLists[0]?.list.EntityID;
      if (entityId) {
        this.currentEntityInfo = md.Entities.find(e => e.ID === entityId) || null;
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
    if (this.selectedLists.length < 2) return;

    this.isCalculating = true;
    this.selectedRegion = null;
    this.cdr.detectChanges();

    try {
      const listIds = this.selectedLists.map(s => s.list.ID);
      this.lastOperationResult = await this.setOperationsService.performOperation(operation, listIds);
      this.previewRecords = this.lastOperationResult.resultRecordIds.slice(0, 10);
    } catch (error) {
      console.error('Error performing operation:', error);
    } finally {
      this.isCalculating = false;
      this.cdr.detectChanges();
    }
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
      const md = new Metadata();

      // Create the list
      const list = await md.GetEntityObject<ListEntity>('Lists', md.CurrentUser);
      list.Name = this.newListName;
      list.Description = this.newListDescription || null;
      list.EntityID = entityId;
      list.UserID = md.CurrentUser!.ID;

      const saved = await list.Save();
      if (!saved) {
        this.notificationService.CreateSimpleNotification('Failed to create list', 'error', 4000);
        return;
      }

      // Add records to the list using transaction group
      const tg = await md.CreateTransactionGroup();

      for (const recordId of this.recordsToAdd) {
        const detail = await md.GetEntityObject<ListDetailEntity>('List Details', md.CurrentUser);
        detail.ListID = list.ID;
        detail.RecordID = recordId;
        detail.Sequence = 0;
        detail.TransactionGroup = tg;
        await detail.Save();
      }

      const success = await tg.Submit();

      if (success) {
        this.notificationService.CreateSimpleNotification(
          `Created "${this.newListName}" with ${this.recordsToAdd.length} items`,
          'success',
          3000
        );
      } else {
        this.notificationService.CreateSimpleNotification(
          `Created list but failed to add some records`,
          'warning',
          4000
        );
      }

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
      l.EntityID === entityId && !selectedIds.has(l.ID)
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
      const md = new Metadata();
      const tg = await md.CreateTransactionGroup();

      for (const recordId of this.recordsToAdd) {
        const detail = await md.GetEntityObject<ListDetailEntity>('List Details', md.CurrentUser);
        detail.ListID = this.selectedTargetListId;
        detail.RecordID = recordId;
        detail.Sequence = 0;
        detail.TransactionGroup = tg;
        await detail.Save();
      }

      const success = await tg.Submit();

      if (success) {
        const targetList = this.availableLists.find(l => l.ID === this.selectedTargetListId);
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

  exportToExcel() {
    // TODO: Implement Excel export
    this.notificationService.CreateSimpleNotification('Export to Excel - coming soon', 'info', 2000);
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
    this.selectedEntityId = '';
    this.vennData = null;
    this.selectedRegion = null;
    this.lastOperationResult = null;
    this.previewRecordsDisplay = [];
    this.filterAvailableLists();
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
      const md = new Metadata();
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
        setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings');
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
      const md = new Metadata();
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
            const list = this.availableLists.find(l => l.ID === listId);
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
