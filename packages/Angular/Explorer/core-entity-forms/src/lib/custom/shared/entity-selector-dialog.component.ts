import { Component, Input, OnInit } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { DialogRef } from '@progress/kendo-angular-dialog';

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
                <h3><i *ngIf="config.icon" [class]="config.icon"></i> {{ config.title }}</h3>
            </div>
            <div class="dialog-content">
                <!-- Search Bar -->
                <div class="search-bar">
                    <kendo-textbox 
                        [(ngModel)]="searchText"
                        placeholder="Search..."
                        (valueChange)="onSearchChange()"
                        class="search-input">
                        <ng-template kendoTextBoxPrefixTemplate>
                            <i class="fa-solid fa-search"></i>
                        </ng-template>
                    </kendo-textbox>
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
                            <div class="empty-state">
                                <i class="fa-solid fa-inbox"></i>
                                <p>No {{ config.entityName }} found</p>
                            </div>
                        } @else {
                            <div class="entity-list">
                                @for (entity of filteredEntities; track entity.ID) {
                                    <div class="entity-item" 
                                         [class.selected]="selectedEntity?.ID === entity.ID"
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
                <button kendoButton themeColor="primary" (click)="createNew()">
                    <i class="fa-solid fa-plus"></i> Create New
                </button>
                <button kendoButton (click)="onCancel()">Cancel</button>
                <button kendoButton themeColor="primary" [disabled]="!selectedEntity" (click)="onSelect()">Select</button>
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
            border-bottom: 1px solid #e0e6ed;
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
            border-top: 1px solid #e0e6ed;
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .search-bar {
            display: flex;
            gap: 12px;
        }

        .search-input {
            flex: 1;
        }

        .loading-state,
        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            gap: 12px;
        }

        .loading-state i,
        .empty-state i {
            font-size: 48px;
            color: #dee2e6;
        }

        .entity-list-container {
            flex: 1;
            overflow-y: auto;
            border: 1px solid #e0e6ed;
            border-radius: 8px;
            background: #f8f9fa;
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
            background: white;
            border: 1px solid #e0e6ed;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .entity-item:hover {
            border-color: #2196f3;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .entity-item.selected {
            background: #e3f2fd;
            border-color: #2196f3;
        }

        .item-icon {
            width: 36px;
            height: 36px;
            background: #f0f4f8;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .item-icon i {
            color: #2196f3;
            font-size: 16px;
        }

        .item-content {
            flex: 1;
            min-width: 0;
        }

        .item-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 4px;
        }

        .item-description {
            font-size: 13px;
            color: #6c757d;
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
            background: #e9ecef;
            color: #495057;
            font-weight: 500;
        }

        .status-badge.active {
            background: #d4edda;
            color: #28a745;
        }
    `]
})
export class EntitySelectorDialogComponent implements OnInit {
    @Input() config!: EntitySelectorConfig;

    public entities: any[] = [];
    public filteredEntities: any[] = [];
    public selectedEntity: any = null;
    public searchText: string = '';
    public isLoading: boolean = true;

    constructor(
        private sharedService: SharedService,
        public dialogRef: DialogRef
    ) {}

    async ngOnInit() {
        await this.loadEntities();
    }

    async loadEntities() {
        this.isLoading = true;
        try {
            const rv = new RunView();
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
            this.dialogRef.close({ entity: this.selectedEntity });
        }
    }

    createNew() {
        this.dialogRef.close({ createNew: true });
    }

    onCancel() {
        this.dialogRef.close(null);
    }
}