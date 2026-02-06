import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { TemplateEntity, TemplateParamEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { GridComponent, AddEvent, EditEvent, CancelEvent, SaveEvent, RemoveEvent } from '@progress/kendo-angular-grid';
import { FormGroup, FormControl, Validators } from '@angular/forms';

@Component({
  standalone: false,
    selector: 'mj-template-params-grid',
    templateUrl: './template-params-grid.component.html',
    styleUrls: ['./template-params-grid.component.css']
})
export class TemplateParamsGridComponent implements OnInit, OnChanges {
    @Input() template: TemplateEntity | null = null;
    @Input() editMode: boolean = false;
    
    @ViewChild(GridComponent) grid!: GridComponent;
    
    public templateParams: TemplateParamEntity[] = [];
    public isLoading = false;
    
    // Grid editing
    public editedRowIndex: number | undefined = undefined;
    public editedParam: TemplateParamEntity | null = null;
    public formGroup: FormGroup | undefined;
    
    // Type options for dropdown
    public typeOptions = [
        { text: 'Scalar', value: 'Scalar' },
        { text: 'Array', value: 'Array' },
        { text: 'Object', value: 'Object' },
        { text: 'Record', value: 'Record' },
        { text: 'Entity', value: 'Entity' }
    ];
    
    constructor() {}
    
    ngOnInit() {
        if (this.template?.ID) {
            this.loadTemplateParams();
        }
    }
    
    ngOnChanges(changes: SimpleChanges) {
        if (changes['template'] && this.template?.ID) {
            this.loadTemplateParams();
        }
    }
    
    async loadTemplateParams() {
        if (!this.template?.ID) return;
        
        this.isLoading = true;
        try {
            const rv = new RunView();
            const results = await rv.RunView<TemplateParamEntity>({
                EntityName: 'Template Params',
                ExtraFilter: `TemplateID='${this.template.ID}'`,
                OrderBy: 'Name ASC' 
            });
            
            if (results.Success) {
                this.templateParams = results.Results || [];
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
    
    // Grid editing handlers
    public addHandler(args: AddEvent): void {
        if (!this.editMode || !this.template?.ID) return;
        
        // Create new parameter entity
        this.createNewParam().then(newParam => {
            if (newParam) {
                // Close any existing edits
                this.closeEditor();
                
                // Add to array at the beginning
                this.templateParams = [newParam, ...this.templateParams];
                
                // Enter edit mode for the new row
                this.editedRowIndex = 0;
                this.editedParam = newParam;
                this.formGroup = this.createFormGroup(newParam);
                
                // Close the add new row
                this.grid.closeRow(args.rowIndex);
                
                // Edit the newly added row
                this.grid.editRow(0, this.formGroup);
            }
        });
    }
    
    public editHandler(args: EditEvent): void {
        if (!this.editMode) return;
        
        const { dataItem, rowIndex } = args;
        
        // Close any existing edits
        this.closeEditor();
        
        // Set up editing
        this.editedRowIndex = rowIndex;
        this.editedParam = dataItem;
        this.formGroup = this.createFormGroup(dataItem);
    }
    
    public cancelHandler(args: CancelEvent): void {
        const { rowIndex, dataItem } = args;
        
        // If this is a new unsaved parameter, remove it
        if (!dataItem.ID && rowIndex !== undefined) {
            this.templateParams.splice(rowIndex, 1);
            this.templateParams = [...this.templateParams];
        }
        
        this.closeEditor();
    }
    
    public async saveHandler(args: SaveEvent): Promise<void> {
        if (!this.formGroup || !this.formGroup.valid) return;
        
        const { dataItem, rowIndex } = args;
        const formValue = this.formGroup.value;
        
        // Update the entity with form values
        dataItem.Name = formValue.name;
        dataItem.Type = formValue.type;
        dataItem.IsRequired = formValue.isRequired;
        dataItem.Description = formValue.description;
        dataItem.DefaultValue = formValue.defaultValue;
        
        // Handle linked parameter fields for Entity type
        if (formValue.type === 'Entity') {
            dataItem.LinkedParameterName = formValue.linkedParameterName;
            dataItem.LinkedParameterField = formValue.linkedParameterField;
        } else {
            dataItem.LinkedParameterName = null;
            dataItem.LinkedParameterField = null;
        }
        
        try {
            const saved = await dataItem.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Parameter "${dataItem.Name}" saved successfully`,
                    'success'
                );
                
                // Update the array to trigger change detection
                this.templateParams = [...this.templateParams];
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save parameter: ${dataItem.LatestResult?.Message || 'Unknown error'}`,
                    'error'
                );
                
                // Reload to revert changes
                await this.loadTemplateParams();
            }
        } catch (error) {
            console.error('Error saving parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving parameter',
                'error'
            );
            
            // Reload to revert changes
            await this.loadTemplateParams();
        }
        
        this.closeEditor();
    }
    
    public async removeHandler(args: RemoveEvent): Promise<void> {
        if (!this.editMode) return;
        
        const param = args.dataItem as TemplateParamEntity;
        
        if (!confirm(`Are you sure you want to delete the parameter "${param.Name}"?`)) {
            return;
        }
        
        try {
            if (param.ID) {
                const deleted = await param.Delete();
                if (deleted) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Parameter "${param.Name}" deleted successfully`,
                        'success'
                    );
                    
                    // Remove from array
                    const index = this.templateParams.indexOf(param);
                    if (index > -1) {
                        this.templateParams.splice(index, 1);
                        this.templateParams = [...this.templateParams];
                    }
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to delete parameter: ${param.LatestResult?.Message || 'Unknown error'}`,
                        'error'
                    );
                }
            }
        } catch (error) {
            console.error('Error deleting parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting parameter',
                'error'
            );
        }
    }
    
    private createFormGroup(param: TemplateParamEntity): FormGroup {
        return new FormGroup({
            name: new FormControl(param.Name, Validators.required),
            type: new FormControl(param.Type || 'Scalar', Validators.required),
            isRequired: new FormControl(param.IsRequired || false),
            description: new FormControl(param.Description),
            defaultValue: new FormControl(param.DefaultValue),
            linkedParameterName: new FormControl(param.LinkedParameterName),
            linkedParameterField: new FormControl(param.LinkedParameterField)
        });
    }
    
    private closeEditor(): void {
        if (this.editedRowIndex !== undefined) {
            this.grid.closeRow(this.editedRowIndex);
        }
        
        this.editedRowIndex = undefined;
        this.editedParam = null;
        this.formGroup = undefined;
    }
    
    private async createNewParam(): Promise<TemplateParamEntity | null> {
        if (!this.template?.ID) return null;
        
        try {
            const md = new Metadata();
            const newParam = await md.GetEntityObject<TemplateParamEntity>('Template Params');
            newParam.TemplateID = this.template.ID;
            newParam.Type = 'Scalar';
            newParam.IsRequired = false;
            
            return newParam;
        } catch (error) {
            console.error('Error creating new parameter:', error);
            return null;
        }
    }
    
    public isInEditMode(rowIndex: number): boolean {
        return this.editedRowIndex === rowIndex;
    }
    
    // Helper for displaying type with icon
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
    
    // Helper for type descriptions
    public getTypeDescription(type: string): string {
        switch (type) {
            case 'Scalar': return 'Single value (text, number, etc.)';
            case 'Array': return 'List of values';
            case 'Object': return 'JSON object';
            case 'Record': return 'Single record from an entity';
            case 'Entity': return 'Multiple records from an entity';
            default: return '';
        }
    }
}