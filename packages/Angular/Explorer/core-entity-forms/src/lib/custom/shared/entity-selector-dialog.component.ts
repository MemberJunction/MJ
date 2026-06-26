import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface EntitySelectorConfig {
    entityName: string;
    title: string;
    displayField: string;
    descriptionField?: string;
    statusField?: string;
    filters?: string;
    orderBy?: string;
    icon?: string;
}

@Component({
  standalone: false,
    selector: 'mj-entity-selector-dialog',
    template: `
        <div class="dialog-wrapper">
          <div class="dialog-header">
            <h3>@if (config.icon) {
              <i [class]="config.icon"></i>
            } {{ config.title }}</h3>
          </div>
          <div class="dialog-content">
            <!-- Search Bar -->
            <div class="search-bar">
              <div class="search-input-wrapper">
                <i class="fa-solid fa-search search-icon"></i>
                <input class="mj-input search-input" [(ngModel)]="searchText" placeholder="Search..." (ngModelChange)="onSearchChange()" />
              </div>
            </div>
        
            <!-- Loading State -->
            @if (isLoading) {
              <div class="loading-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Loading {{ config.entityName }}...</p>
              </div>
            }

            <!-- Entity List -->
            @if (!isLoading) {
              <div class="entity-list-container">
                @if (filteredEntities.length === 0) {
                  <mj-empty-state class="empty-state"
                    [Variant]="searchText ? 'no-results' : 'empty'"
                    [Title]="EmptyStateTitle" />
                } @else {
                  <div class="entity-list">
                    @for (entity of filteredEntities; track entity.ID) {
                      <div class="entity-item"
                        [class.selected]="IsEntitySelected(entity)"
                        (click)="selectEntity(entity)">
                        <div class="item-icon">
                          <i [class]="config.icon || 'fa-solid fa-file'"></i>
                        </div>
                        <div class="item-content">
                          <div class="item-title">{{ entity[config.displayField] || 'Untitled' }}</div>
                          @if (config.descriptionField && entity[config.descriptionField]) {
                            <div class="item-description">{{ entity[config.descriptionField] }}</div>
                          }
                          @if (config.statusField && entity[config.statusField]) {
                            <div class="item-status">
                              <span class="status-badge" [class.active]="entity[config.statusField] === 'Active'">
                                {{ entity[config.statusField] }}
                              </span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
          <div class="dialog-actions">
            <button mjButton variant="primary" (click)="createNew()">
              <i class="fa-solid fa-plus"></i> Create New
            </button>
            <button mjButton (click)="onCancel()">Cancel</button>
            <button mjButton variant="primary" [disabled]="!selectedEntity" (click)="onSelect()">Select</button>
          </div>
        </div>
        `,
    styles: [`
        .dialog-wrapper {
            display: flex;
            flex-direction: column;
            height: 600px;
            width: 800px;
        }

        .dialog-header {
            padding: 16px;
            border-bottom: 1px solid var(--mj-border-default);
        }

        .dialog-header h3 {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .dialog-content {
            display: flex;
            flex-direction: column;
            flex: 1;
            padding: 16px;
            gap: 16px;
            overflow: hidden;
        }

        .dialog-actions {
            padding: 16px;
            border-top: 1px solid var(--mj-border-default);
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .search-bar {
            display: flex;
            gap: 12px;
        }

        .search-input-wrapper {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
        }

        .search-icon {
            position: absolute;
            left: 10px;
            color: var(--mj-text-muted);
            pointer-events: none;
        }

        .search-input {
            flex: 1;
            padding-left: 32px;
        }

        .loading-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--mj-text-muted);
            gap: 12px;
        }

        .loading-state i {
            font-size: 48px;
            color: var(--mj-border-default);
        }

        mj-empty-state.empty-state {
            flex: 1;
        }

        .entity-list-container {
            flex: 1;
            overflow-y: auto;
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            background: var(--mj-bg-surface-sunken);
        }

        .entity-list {
            padding: 8px;
        }

        .entity-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            margin-bottom: 8px;
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .entity-item:hover {
            border-color: var(--mj-brand-primary);
            box-shadow: var(--mj-shadow-md);
        }

        .entity-item.selected {
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            border-color: var(--mj-brand-primary);
        }

        .item-icon {
            width: 36px;
            height: 36px;
            background: var(--mj-bg-surface-sunken);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .item-icon i {
            color: var(--mj-brand-primary);
            font-size: 16px;
        }

        .item-content {
            flex: 1;
            min-width: 0;
        }

        .item-title {
            font-weight: 600;
            color: var(--mj-text-primary);
            margin-bottom: 4px;
        }

        .item-description {
            font-size: 13px;
            color: var(--mj-text-muted);
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .item-status {
            margin-top: 4px;
        }

        .status-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-secondary);
            font-weight: 500;
        }

        .status-badge.active {
            background: var(--mj-status-success-bg);
            color: var(--mj-status-success-text);
        }
    `]
})
export class EntitySelectorDialogComponent extends BaseAngularComponent implements OnInit {
    @Input() config!: EntitySelectorConfig;

    public entities: any[] = [];
    public filteredEntities: any[] = [];
    public selectedEntity: any = null;
    public searchText: string = '';
    public isLoading: boolean = true;

    @Output() DialogClosed = new EventEmitter<Record<string, unknown> | null>();

    constructor(
        private sharedService: SharedService
    ) {
    super();}

    /** Title for the empty/no-results placeholder, echoing the active search term when narrowed. */
    public get EmptyStateTitle(): string {
        return this.searchText
            ? `No ${this.config.entityName} match "${this.searchText}"`
            : `No ${this.config.entityName} found`;
    }

    async ngOnInit() {
        await this.loadEntities();
    }

    async loadEntities() {
        this.isLoading = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({
                EntityName: this.config.entityName,
                ExtraFilter: this.config.filters,
                OrderBy: this.config.orderBy 
            });

            this.entities = result.Results;
            this.filteredEntities = [...this.entities];
        } catch (error) {
            console.error('Error loading entities:', error);
            this.entities = [];
            this.filteredEntities = [];
        } finally {
            this.isLoading = false;
        }
    }

    onSearchChange() {
        if (!this.searchText) {
            this.filteredEntities = [...this.entities];
        } else {
            const searchLower = this.searchText.toLowerCase();
            this.filteredEntities = this.entities.filter(entity => {
                const displayValue = entity[this.config.displayField] || '';
                const descriptionValue = this.config.descriptionField ? (entity[this.config.descriptionField] || '') : '';
                return displayValue.toLowerCase().includes(searchLower) || 
                       descriptionValue.toLowerCase().includes(searchLower);
            });
        }
    }

    selectEntity(entity: any) {
        this.selectedEntity = entity;
    }

    onSelect() {
        if (this.selectedEntity) {
            this.DialogClosed.emit({ entity: this.selectedEntity });
        }
    }

    createNew() {
        this.DialogClosed.emit({ createNew: true });
    }

    IsEntitySelected(entity: Record<string, unknown>): boolean {
        return UUIDsEqual(this.selectedEntity?.ID, entity.ID as string);
    }

    onCancel() {
        this.DialogClosed.emit(null);
    }
}