import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { MJTemplateEntity, MJTemplateParamEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
    ColDef,
    GridReadyEvent,
    GridApi,
    GetRowIdParams,
    ModuleRegistry,
    AllCommunityModule,
    RowEditingStoppedEvent,
    ICellRendererParams,
    themeAlpine,
    colorSchemeVariable,
    type Theme
} from 'ag-grid-community';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

/** Valid parameter type values, matching the entity's union type */
type ParamType = 'Array' | 'Entity' | 'Object' | 'Record' | 'Scalar';

/** Row data shape for the grid (flattened from the entity for editing) */
interface ParamRowData {
    /** Entity reference for save/delete operations */
    Entity: MJTemplateParamEntity;
    /** Used as row ID; empty string for unsaved new rows */
    ID: string;
    Name: string;
    Type: ParamType;
    IsRequired: boolean;
    Description: string;
    DefaultValue: string;
    LinkedParameterName: string;
    LinkedParameterField: string;
    /** Tracks whether this row is brand-new (not yet persisted) */
    IsNew: boolean;
}

@Component({
    standalone: false,
    selector: 'mj-template-params-grid',
    templateUrl: './template-params-grid.component.html',
    styleUrls: ['./template-params-grid.component.css']
})
export class TemplateParamsGridComponent extends BaseAngularComponent implements OnInit, OnChanges {
    @Input() template: MJTemplateEntity | null = null;
    @Input() editMode: boolean = false;

    public templateParams: ParamRowData[] = [];
    public isLoading = false;

    // Type options for dropdown
    public typeOptions = ['Scalar', 'Array', 'Object', 'Record', 'Entity'];

    // AG Grid configuration
    public ColumnDefs: ColDef[] = [];
    public DefaultColDef: ColDef = {
        sortable: true,
        resizable: true,
        filter: false,
        flex: 1
    };
    public GridTheme: Theme = themeAlpine.withPart(colorSchemeVariable);
    private gridApi: GridApi | null = null;

    /** Row currently being edited (for cancel/revert) */
    private editingRowBackup: ParamRowData | null = null;
    private editingRowId: string | null = null;

    public noRowsTemplate = `
        <div style="text-align: center; padding: 40px 20px; color: var(--mj-text-muted);">
            <i class="fa-solid fa-info-circle" style="font-size: 2em; margin-bottom: 10px;"></i>
            <p>No parameters defined for this template.</p>
        </div>
    `;

    public getRowId = (params: GetRowIdParams<ParamRowData>): string => {
        // Use entity ID if saved, otherwise use a temporary key
        return params.data.ID || `new_${params.data.Name}_${Date.now()}`;
    };

    ngOnInit() {
        this.buildColumnDefs();
        if (this.template?.ID) {
            this.loadTemplateParams();
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['template'] && this.template?.ID) {
            this.loadTemplateParams();
        }
        if (changes['editMode']) {
            this.buildColumnDefs();
        }
    }

    public onGridReady(event: GridReadyEvent): void {
        this.gridApi = event.api;
    }

    async loadTemplateParams() {
        if (!this.template?.ID) return;

        this.isLoading = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID='${this.template.ID}'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });

            if (results.Success) {
                const entities = results.Results || [];
                this.templateParams = entities.map(e => this.entityToRowData(e));
            } else {
                console.error('Failed to load template params:', results.ErrorMessage);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to load template parameters',
                    'error'
                );
            }
        } catch (error) {
            console.error('Error loading template params:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading template parameters',
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    // -- Grid editing lifecycle --

    public async addNewParam(): Promise<void> {
        if (!this.editMode || !this.template?.ID) return;

        // Cancel any in-progress edit first
        this.cancelCurrentEdit();

        const newEntity = await this.createNewParamEntity();
        if (!newEntity) return;

        const newRow = this.entityToRowData(newEntity);
        newRow.IsNew = true;
        // Prepend the new row
        this.templateParams = [newRow, ...this.templateParams];

        // Wait for grid to process the new row, then start editing it
        setTimeout(() => {
            if (!this.gridApi) return;
            const rowNode = this.gridApi.getDisplayedRowAtIndex(0);
            if (rowNode) {
                this.editingRowId = rowNode.id ?? null;
                this.editingRowBackup = { ...newRow };
                this.gridApi.startEditingCell({
                    rowIndex: 0,
                    colKey: 'Name'
                });
                this.gridApi.refreshCells({ columns: ['actions'], force: true });
            }
        });
    }

    public startEditRow(params: ICellRendererParams): void {
        if (!this.gridApi || !this.editMode) return;

        // Cancel any in-progress edit first
        this.cancelCurrentEdit();

        const rowIndex = params.node.rowIndex;
        if (rowIndex == null) return;

        this.editingRowId = params.node.id ?? null;
        this.editingRowBackup = { ...params.data };
        this.gridApi.startEditingCell({
            rowIndex,
            colKey: 'Name'
        });
        this.gridApi.refreshCells({ columns: ['actions'], force: true });
    }

    public cancelEditRow(): void {
        this.cancelCurrentEdit();
    }

    public saveEditRow(): void {
        if (!this.gridApi) return;
        // stopEditing triggers onRowEditingStopped, which handles the save
        this.gridApi.stopEditing(false);
        this.gridApi.refreshCells({ columns: ['actions'], force: true });
    }

    public async onRowEditingStopped(event: RowEditingStoppedEvent): Promise<void> {
        const rowData = event.data as ParamRowData;
        if (!rowData) return;

        // If the user cancelled (via Escape or cancel button backup restore), skip save
        if (this.editingRowBackup === null) return;

        // Validate: Name is required
        if (!rowData.Name || rowData.Name.trim().length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Parameter name is required',
                'error'
            );
            // If it was a new unsaved row, remove it
            if (rowData.IsNew) {
                this.templateParams = this.templateParams.filter(p => p !== rowData);
            } else if (this.editingRowBackup) {
                // Revert to backup
                this.revertRow(event.node, this.editingRowBackup);
            }
            this.clearEditState();
            return;
        }

        await this.saveParamRow(rowData);
        this.clearEditState();
    }

    public async deleteRow(params: ICellRendererParams): Promise<void> {
        if (!this.editMode) return;

        const rowData = params.data as ParamRowData;
        const entity = rowData.Entity;

        if (!confirm(`Are you sure you want to delete the parameter "${rowData.Name}"?`)) {
            return;
        }

        try {
            if (entity.ID) {
                const deleted = await entity.Delete();
                if (deleted) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Parameter "${rowData.Name}" deleted successfully`,
                        'success'
                    );
                    this.templateParams = this.templateParams.filter(p => p !== rowData);
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to delete parameter: ${entity.LatestResult?.Message || 'Unknown error'}`,
                        'error'
                    );
                }
            } else {
                // Not yet saved -- just remove from the array
                this.templateParams = this.templateParams.filter(p => p !== rowData);
            }
        } catch (error) {
            console.error('Error deleting parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting parameter',
                'error'
            );
        }
    }

    // -- Helpers --

    public getTypeIcon(type: string): string {
        switch (type) {
            case 'Scalar': return 'fa-font';
            case 'Array': return 'fa-list';
            case 'Object': return 'fa-cube';
            case 'Record': return 'fa-file';
            case 'Entity': return 'fa-table';
            default: return 'fa-question';
        }
    }

    private entityToRowData(entity: MJTemplateParamEntity): ParamRowData {
        return {
            Entity: entity,
            ID: entity.ID || '',
            Name: entity.Name || '',
            Type: entity.Type || 'Scalar',
            IsRequired: entity.IsRequired || false,
            Description: entity.Description || '',
            DefaultValue: entity.DefaultValue || '',
            LinkedParameterName: entity.LinkedParameterName || '',
            LinkedParameterField: entity.LinkedParameterField || '',
            IsNew: false
        };
    }

    private async saveParamRow(rowData: ParamRowData): Promise<void> {
        const entity = rowData.Entity;

        entity.Name = rowData.Name;
        entity.Type = rowData.Type;
        entity.IsRequired = rowData.IsRequired;
        entity.Description = rowData.Description;
        entity.DefaultValue = rowData.DefaultValue;

        // Handle linked parameter fields for Entity type
        if (rowData.Type === 'Entity') {
            entity.LinkedParameterName = rowData.LinkedParameterName;
            entity.LinkedParameterField = rowData.LinkedParameterField;
        } else {
            entity.LinkedParameterName = null;
            entity.LinkedParameterField = null;
        }

        try {
            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Parameter "${entity.Name}" saved successfully`,
                    'success'
                );
                // Update the row data with the saved entity ID
                rowData.ID = entity.ID;
                rowData.IsNew = false;
                // Refresh the grid to pick up the new ID
                this.templateParams = [...this.templateParams];
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save parameter: ${entity.LatestResult?.Message || 'Unknown error'}`,
                    'error'
                );
                await this.loadTemplateParams();
            }
        } catch (error) {
            console.error('Error saving parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving parameter',
                'error'
            );
            await this.loadTemplateParams();
        }
    }

    private async createNewParamEntity(): Promise<MJTemplateParamEntity | null> {
        if (!this.template?.ID) return null;

        try {
            const md = this.ProviderToUse;
            const newParam = await md.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params');
            newParam.TemplateID = this.template.ID;
            newParam.Type = 'Scalar';
            newParam.IsRequired = false;

            return newParam;
        } catch (error) {
            console.error('Error creating new parameter:', error);
            return null;
        }
    }

    private cancelCurrentEdit(): void {
        if (!this.gridApi) return;

        if (this.editingRowBackup && this.editingRowId) {
            const rowNode = this.gridApi.getRowNode(this.editingRowId);
            if (rowNode) {
                // If the row was new and unsaved, remove it
                if (this.editingRowBackup.IsNew) {
                    const backup = this.editingRowBackup;
                    this.clearEditState();
                    this.gridApi.stopEditing(true);
                    this.templateParams = this.templateParams.filter(p => p.Entity !== backup.Entity);
                    return;
                }
                // Revert to backup
                this.revertRow(rowNode, this.editingRowBackup);
            }
        }

        this.clearEditState();
        this.gridApi.stopEditing(true);
        this.gridApi.refreshCells({ columns: ['actions'], force: true });
    }

    private revertRow(rowNode: { setData: (data: ParamRowData) => void }, backup: ParamRowData): void {
        rowNode.setData(backup);
    }

    private clearEditState(): void {
        this.editingRowBackup = null;
        this.editingRowId = null;
    }

    private buildColumnDefs(): void {
        const self = this;

        const cols: ColDef[] = [
            {
                field: 'Name',
                headerName: 'Parameter Name',
                width: 200,
                editable: this.editMode,
                cellRenderer: (params: ICellRendererParams) => {
                    if (!params.value) return '';
                    const row = params.data as ParamRowData;
                    let html = `<strong>${params.value}</strong>`;
                    if (row.IsRequired) {
                        html += ` <span style="display: inline-flex; align-items: center; gap: 4px; background-color: var(--mj-status-error); color: var(--mj-text-inverse); padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 500;"><i class="fa-solid fa-asterisk" style="font-size: 0.6em;"></i> Required</span>`;
                    }
                    return html;
                }
            },
            {
                field: 'Type',
                headerName: 'Type',
                width: 140,
                editable: this.editMode,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: {
                    values: this.typeOptions
                },
                cellRenderer: (params: ICellRendererParams) => {
                    if (!params.value) return '';
                    const icon = self.getTypeIcon(params.value);
                    return `<span style="display: flex; align-items: center; gap: 6px; color: var(--mj-text-secondary);"><i class="fa-solid ${icon}" style="color: var(--mj-text-muted);"></i> ${params.value}</span>`;
                }
            },
            {
                field: 'IsRequired',
                headerName: 'Required',
                width: 100,
                editable: this.editMode,
                cellDataType: 'boolean',
                cellRenderer: (params: ICellRendererParams) => {
                    if (params.value) {
                        return `<div style="text-align: center;"><i class="fa-solid fa-check" style="color: var(--mj-status-success);"></i></div>`;
                    }
                    return `<div style="text-align: center;"><i class="fa-solid fa-times" style="color: var(--mj-text-muted);"></i></div>`;
                }
            },
            {
                field: 'Description',
                headerName: 'Description',
                width: 300,
                editable: this.editMode,
                cellRenderer: (params: ICellRendererParams) => {
                    return params.value || '<span style="color: var(--mj-text-muted); font-style: italic; font-size: 0.9em;">(No description)</span>';
                }
            },
            {
                field: 'DefaultValue',
                headerName: 'Default Value',
                width: 200,
                editable: this.editMode,
                cellRenderer: (params: ICellRendererParams) => {
                    if (params.value) {
                        return `<code style="background-color: var(--mj-bg-surface-card); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; color: var(--mj-text-secondary);">${params.value}</code>`;
                    }
                    return '<span style="color: var(--mj-text-muted); font-style: italic; font-size: 0.9em;">(No default)</span>';
                }
            }
        ];

        if (this.editMode) {
            cols.push({
                headerName: 'Actions',
                width: 120,
                sortable: false,
                resizable: false,
                editable: false,
                cellRenderer: ActionsCellRenderer,
                cellRendererParams: {
                    componentRef: self
                }
            });
        }

        this.ColumnDefs = cols;
    }
}

/**
 * Inline cell renderer for edit/delete/save/cancel action buttons.
 * This is a plain-JS AG Grid cell renderer (not an Angular component)
 * because the grid doesn't support Angular component renderers without
 * the AG Grid Enterprise "Framework Components" feature.
 */
function ActionsCellRenderer(params: ICellRendererParams & { componentRef: TemplateParamsGridComponent }): HTMLElement {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '4px';
    container.style.alignItems = 'center';

    const comp = params.componentRef;
    const isEditing = params.node.rowIndex != null && params.api.getEditingCells().some(
        cell => cell.rowIndex === params.node.rowIndex
    );

    if (isEditing) {
        // Save button
        const saveBtn = createActionButton('fa-check', 'Save changes', 'var(--mj-brand-primary)');
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            comp.saveEditRow();
        });
        container.appendChild(saveBtn);

        // Cancel button
        const cancelBtn = createActionButton('fa-times', 'Cancel changes', 'var(--mj-text-secondary)');
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            comp.cancelEditRow();
        });
        container.appendChild(cancelBtn);
    } else {
        // Edit button
        const editBtn = createActionButton('fa-edit', 'Edit parameter', 'var(--mj-text-secondary)');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            comp.startEditRow(params);
        });
        container.appendChild(editBtn);

        // Delete button
        const deleteBtn = createActionButton('fa-trash', 'Delete parameter', 'var(--mj-status-error)');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            comp.deleteRow(params);
        });
        container.appendChild(deleteBtn);
    }

    return container;
}

function createActionButton(iconClass: string, title: string, color: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.style.cssText = `
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: ${color};
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    `;
    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconClass}`;
    btn.appendChild(icon);
    return btn;
}
