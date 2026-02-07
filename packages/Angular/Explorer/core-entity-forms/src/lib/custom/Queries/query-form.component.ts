import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { QueryEntity, QueryParameterEntity, QueryCategoryEntity, QueryFieldEntity, QueryEntityEntity, QueryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { QueryFormComponent } from '../../generated/Entities/Query/query.form.component';
import { Metadata, RunView, RUN_QUERY_SQL_FILTERS } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { Subject } from 'rxjs';

interface CategoryTreeNode {
    id: string;
    name: string;
    items?: CategoryTreeNode[];
}

@RegisterClass(BaseFormComponent, 'Queries') 
@Component({
  standalone: false,
    selector: 'mj-query-form',
    templateUrl: './query-form.component.html',
    styleUrls: ['../../../shared/form-styles.css', './query-form.component.css']
})
export class QueryFormExtendedComponent extends QueryFormComponent implements OnInit, OnDestroy, AfterViewInit {
    public override cdr!: ChangeDetectorRef;
    public record!: QueryEntity;
    public queryParameters: QueryParameterEntity[] = [];
    public queryFields: QueryFieldEntity[] = [];
    public queryEntities: QueryEntityEntity[] = [];
    public queryPermissions: QueryPermissionEntity[] = [];
    public isLoadingParameters = false;
    public isLoadingFields = false;
    public isLoadingEntities = false;
    public isLoadingPermissions = false;
    public hasUnsavedChanges = false;
    public showFiltersHelp = false;
    public showRunDialog = false;
    public showCategoryDialog = false;
    
    // Expansion panel states
    public sqlPanelExpanded = true;
    public parametersPanelExpanded = false;
    public fieldsPanelExpanded = false;
    public entitiesPanelExpanded = false;
    public detailsPanelExpanded = false;
    public permissionsPanelExpanded = false;
    
    // Category data
    public categoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' }
    ];
    public categories: QueryCategoryEntity[] = [];
    public categoryTreeData: CategoryTreeNode[] = [];
    
    // Status options
    public statusOptions = [
        { text: 'Pending', value: 'Pending' },
        { text: 'Approved', value: 'Approved' },
        { text: 'Rejected', value: 'Rejected' },
        { text: 'Expired', value: 'Expired' }
    ];

    @ViewChild('sqlEditor') sqlEditor: CodeEditorComponent | null = null;
    
    // SQL Filters for help display
    public sqlFilters = RUN_QUERY_SQL_FILTERS;
    
    private destroy$ = new Subject<void>();
    private isUpdatingEditorValue = false;

    async ngOnInit() {
        await super.ngOnInit();
        
        // Load categories first to ensure they're available for the dropdown
        await this.loadCategories();
        
        // Then load other data in parallel
        await Promise.all([
            this.loadQueryParameters(),
            this.loadQueryFields(),
            this.loadQueryEntities(),
            this.loadQueryPermissions()
        ]);
        
        // Ensure form is properly initialized after all data is loaded
        this.cdr.detectChanges();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    ngAfterViewInit() {
        super.ngAfterViewInit();

        this.sqlEditor?.setEditable(this.EditMode);

        // Set initial SQL value in the editor
        this.updateEditorValue();
        
        // Ensure all form controls are properly initialized with data
        setTimeout(() => {
            // Force Angular to update all bindings
            this.cdr.detectChanges();
            
            // If in edit mode, trigger another update to ensure Kendo components are initialized
            if (this.EditMode) {
                setTimeout(() => {
                    this.cdr.detectChanges();
                }, 50);
            }
        }, 100);
    }
 
    override EndEditMode(): void {
        super.EndEditMode();
        this.sqlEditor?.setEditable(false);
    }

    override StartEditMode(): void {
        super.StartEditMode();
        this.sqlEditor?.setEditable(true);
        
        // Force change detection after a brief delay to ensure form controls are initialized
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 50);
    }

    override CancelEdit(): void {
        super.CancelEdit();
        this.updateEditorValue(); // Reset editor value to record SQL
        this.sqlEditor?.setEditable(false);
        this.updateUnsavedChangesFlag(); // Reset unsaved changes flag
    }

    private updateEditorValue() {
        if (!this.sqlEditor || this.isUpdatingEditorValue) {
            return;
        }
        
        // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
            if (!this.sqlEditor) {
                return;
            }
            
            this.isUpdatingEditorValue = true;
            const sqlValue = this.record?.SQL || '';
            
            // Use the setValue method from mj-code-editor component
            this.sqlEditor.setValue(sqlValue);
            this.isUpdatingEditorValue = false;
        }, 0);
    }

    public isFormReadOnly(): boolean {
        return !this.EditMode;
    }

    async loadQueryParameters() {
        if (this.record && this.record.ID) {
            this.isLoadingParameters = true;
            try {
                const rv = new RunView();
                const results = await rv.RunView<QueryParameterEntity>({
                    EntityName: 'MJ: Query Parameters',
                    ExtraFilter: `QueryID='${this.record.ID}'`,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                });
                
                if (results.Success) {
                    this.queryParameters = results.Results || [];
                }
            } catch (error) {
                console.error('Error loading query parameters:', error);
            } finally {
                this.isLoadingParameters = false;
            }
        }
    }

    async loadQueryFields() {
        if (this.record && this.record.ID) {
            this.isLoadingFields = true;
            try {
                const rv = new RunView();
                const results = await rv.RunView<QueryFieldEntity>({
                    EntityName: 'Query Fields',
                    ExtraFilter: `QueryID='${this.record.ID}'`,
                    OrderBy: 'Sequence ASC, Name ASC',
                    ResultType: 'entity_object'
                });
                
                if (results.Success) {
                    this.queryFields = results.Results || [];
                }
            } catch (error) {
                console.error('Error loading query fields:', error);
            } finally {
                this.isLoadingFields = false;
            }
        }
    }

    async loadQueryEntities() {
        if (this.record && this.record.ID) {
            this.isLoadingEntities = true;
            try {
                const rv = new RunView();
                const results = await rv.RunView<QueryEntityEntity>({
                    EntityName: 'Query Entities',
                    ExtraFilter: `QueryID='${this.record.ID}'`,
                    OrderBy: 'Entity ASC',
                    ResultType: 'entity_object'
                });
                
                if (results.Success) {
                    this.queryEntities = results.Results || [];
                    console.log('Loaded query entities:', this.queryEntities);
                }
            } catch (error) {
                console.error('Error loading query entities:', error);
            } finally {
                this.isLoadingEntities = false;
            }
        }
    }

    async loadQueryPermissions() {
        if (this.record && this.record.ID) {
            this.isLoadingPermissions = true;
            try {
                const rv = new RunView();
                const results = await rv.RunView<QueryPermissionEntity>({
                    EntityName: 'Query Permissions',
                    ExtraFilter: `QueryID='${this.record.ID}'`,
                    OrderBy: 'Role ASC',
                    ResultType: 'entity_object'
                });
                
                if (results.Success) {
                    this.queryPermissions = results.Results || [];
                }
            } catch (error) {
                console.error('Error loading query permissions:', error);
            } finally {
                this.isLoadingPermissions = false;
            }
        }
    }

    async loadCategories() {
        try {
            const rv = new RunView();
            const results = await rv.RunView<QueryCategoryEntity>({
                EntityName: 'Query Categories',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });
            
            if (results.Success && results.Results) {
                this.categories = results.Results;
                
                // Build flat options for legacy compatibility
                this.categoryOptions = [
                    { text: 'Select Category...', value: '' },
                    ...this.categories.map(cat => ({
                        text: cat.Name,
                        value: cat.ID
                    }))
                ];
                
                // Build tree data after options are set
                this.categoryTreeData = this.buildCategoryTree(this.categories);
                
                // Trigger change detection to update the view
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categoryOptions = [{ text: 'Select Category...', value: '' }];
            this.categoryTreeData = [];
        }
    }
    
    private buildCategoryTree(categories: QueryCategoryEntity[]): CategoryTreeNode[] {
        const categoryMap = new Map<string, CategoryTreeNode>();
        const rootCategories: CategoryTreeNode[] = [];
        
        // Create nodes for all categories
        categories.forEach(cat => {
            categoryMap.set(cat.ID, {
                id: cat.ID,
                name: cat.Name,
                items: []
            });
        });
        
        // Build the tree structure
        categories.forEach(cat => {
            const node = categoryMap.get(cat.ID)!;
            if (cat.ParentID && categoryMap.has(cat.ParentID)) {
                const parent = categoryMap.get(cat.ParentID)!;
                if (!parent.items) parent.items = [];
                parent.items.push(node);
            } else {
                rootCategories.push(node);
            }
        });
        
        // Sort children alphabetically
        const sortNodes = (nodes: CategoryTreeNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            nodes.forEach(node => {
                if (node.items && node.items.length > 0) {
                    sortNodes(node.items);
                }
            });
        };
        sortNodes(rootCategories);
        
        return rootCategories;
    }
    
    getCategoryPath(): string {
        if (!this.record.CategoryID) return '';
        
        const findPath = (categoryId: string): string[] => {
            const category = this.categories.find(c => c.ID === categoryId);
            if (!category) return [];
            
            if (category.ParentID) {
                return [...findPath(category.ParentID), category.Name];
            }
            return [category.Name];
        };
        
        return findPath(this.record.CategoryID).join(' / ');
    }

    async onCategoryChange(value: string) {
        // If it's a new category (string but not in existing options)
        if (value && !this.categoryOptions.find(opt => opt.value === value)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(value)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === value.trim().toLowerCase()
                );
                if (existingCategory) {
                    // Use the existing category instead
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning',
                        3000
                    );
                }
                return;
            }

            try {
                // Create new category with trimmed name
                const md = new Metadata();
                const newCategory = await md.GetEntityObject<QueryCategoryEntity>('Query Categories');
                newCategory.Name = value.trim();
                const saved = await newCategory.Save();
                
                if (saved) {
                    // Add to options and set the ID
                    this.categoryOptions.push({
                        text: newCategory.Name,
                        value: newCategory.ID
                    });
                    this.record.CategoryID = newCategory.ID;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `New category "${newCategory.Name}" created successfully.`, 
                        'success',
                        3000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to create new category. ${newCategory.LatestResult?.Message || ''}`, 
                        'error',
                        3000
                    );
                }
            } catch (error) {
                console.error('Error creating new category:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error creating new category. Please try again.', 
                    'error',
                    3000
                );
            }
        }
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName?.trim().toLowerCase();
        return this.categoryOptions.some(option => 
            option.text && option.text.trim().toLowerCase() === normalizedName
        );
    }

    /**
     * Updates the hasUnsavedChanges flag based on entity dirty states
     */
    private updateUnsavedChangesFlag() {
        this.hasUnsavedChanges = this.queryParameters.some(param => param.Dirty) || 
                                this.record?.Dirty || false;
    }

    toggleFiltersHelp() {
        this.showFiltersHelp = !this.showFiltersHelp;
    }

    /**
     * Run the query with parameter dialog
     */
    async runQuery() {
        if (!this.record?.IsSaved) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the query before running it.', 
                'warning',
                3000
            );
            return;
        }

        // Save any unsaved changes first
        if (this.hasUnsavedChanges) {
            const saveResult = await this.SaveRecord(false); // Don't exit edit mode
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save query changes.', 
                    'error',
                    3000
                );
                return;
            }
        }

        // Reload parameters in case they were updated
        await this.loadQueryParameters();

        // Show the run dialog
        this.showRunDialog = true;
    }

    /**
     * Handle run dialog close
     */
    onRunDialogClose() {
        this.showRunDialog = false;
    }
    
    /**
     * Add a new parameter
     */
    async addParameter() {
        try {
            const md = new Metadata();
            const newParam = await md.GetEntityObject<QueryParameterEntity>('MJ: Query Parameters');
            newParam.QueryID = this.record.ID;
            newParam.Name = `param${this.queryParameters.length + 1}`;
            newParam.Type = 'string';
            newParam.IsRequired = false;
            
            const saved = await newParam.Save();
            if (saved) {
                this.queryParameters.push(newParam);
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Parameter added successfully',
                    'success',
                    3000
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to add parameter',
                    'error',
                    3000
                );
            }
        } catch (error) {
            console.error('Error adding parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding parameter',
                'error',
                3000
            );
        }
    }
    
    /**
     * Edit a parameter
     */
    async editParameter(param: QueryParameterEntity) {
        // TODO: Show parameter edit dialog
        console.log('Edit parameter:', param);
    }
    
    /**
     * Delete a parameter
     */
    async deleteParameter(param: QueryParameterEntity) {
        if (!confirm(`Are you sure you want to delete parameter "${param.Name}"?`)) {
            return;
        }
        
        try {
            const deleted = await param.Delete();
            if (deleted) {
                const index = this.queryParameters.indexOf(param);
                if (index > -1) {
                    this.queryParameters.splice(index, 1);
                }
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Parameter deleted successfully',
                    'success',
                    3000
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to delete parameter',
                    'error',
                    3000
                );
            }
        } catch (error) {
            console.error('Error deleting parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting parameter',
                'error',
                3000
            );
        }
    }
    
    /**
     * Handle category creation from dialog
     */
    async onCategoryCreated(newCategory: QueryCategoryEntity) {
        // Reload categories to include the new one
        await this.loadCategories();
        
        // Set the new category as selected
        this.record.CategoryID = newCategory.ID;
        
        // Trigger change detection
        this.cdr.detectChanges();
    }
    
    /**
     * Format date for display
     */
    formatDate(date: Date | string | null): string {
        if (!date) return '-';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }

    async SaveRecord(StopEditModeAfterSave: boolean = true): Promise<boolean> {
        // Handle category creation before saving query
        if (this.record.CategoryID && !this.categoryOptions.find(opt => opt.value === this.record.CategoryID)) {
            if (this.isDuplicateCategory(this.record.CategoryID)) {
                const existingCategory = this.categoryOptions.find(option => 
                    option.text && option.text.trim().toLowerCase() === this.record.CategoryID?.trim().toLowerCase()
                );
                if (existingCategory) {
                    this.record.CategoryID = existingCategory.value;
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Category "${existingCategory.text}" already exists. Using existing category.`, 
                        'warning',
                        3000
                    );
                }
            } else {
                try {
                    const md = new Metadata();
                    const newCategory = await md.GetEntityObject<QueryCategoryEntity>('Query Categories');
                    newCategory.Name = this.record.CategoryID.trim();
                    const saved = await newCategory.Save();
                    
                    if (saved) {
                        this.categoryOptions.push({
                            text: newCategory.Name,
                            value: newCategory.ID
                        });
                        this.record.CategoryID = newCategory.ID;
                    } else {
                        console.error('Failed to create new category');
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to create new category. ${newCategory.LatestResult?.Message || ''}`, 
                            'error'
                        );
                        return false;
                    }
                } catch (error) {
                    console.error('Error creating new category during save:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error creating new category during save. Please try again.', 
                        'error'
                    );
                    return false;
                }
            }
        }

        // Save any unsaved query entities first
        if (this.EditMode) {
            for (const entity of this.queryEntities) {
                if (!entity.IsSaved && entity.EntityID) {
                    try {
                        await entity.Save();
                    } catch (error) {
                        console.error('Error saving query entity:', error);
                    }
                }
            }
        }

        // Call the parent save method
        const result = await super.SaveRecord(StopEditModeAfterSave);
        
        if (result) {
            this.updateUnsavedChangesFlag();
            
            // Reload related data after successful save as server-side processes may have updated them
            if (this.record && this.record.ID) {
                await Promise.all([
                    this.loadQueryParameters(),
                    this.loadQueryFields(),
                    this.loadQueryEntities()
                ]);
            }
        }
        
        return result;
    }

    getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Approved':
                return '#28a745';
            case 'Pending':
                return '#ffc107';
            case 'Rejected':
                return '#dc3545';
            default:
                return '#6c757d';
        }
    }

    /**
     * Handle SQL value changes from the code editor
     */
    onSQLChange(value: any) {
        if (this.isUpdatingEditorValue || !this.record) {
            return;
        }
        
        // Update the record SQL value
        this.record.SQL = value;
        this.updateUnsavedChangesFlag();
    }

    /**
     * Add a new field
     */
    async addField() {
        try {
            const md = new Metadata();
            const newField = await md.GetEntityObject<QueryFieldEntity>('Query Fields');
            newField.QueryID = this.record.ID;
            newField.Name = `field${this.queryFields.length + 1}`;
            newField.Description = '';
            newField.Sequence = (this.queryFields.length + 1) * 10;
            newField.SQLBaseType = 'nvarchar';
            newField.SQLFullType = 'nvarchar(255)';
            
            const saved = await newField.Save();
            if (saved) {
                this.queryFields.push(newField);
                this.queryFields.sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Field added successfully',
                    'success',
                    3000
                );
            }
        } catch (error) {
            console.error('Error adding field:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add field',
                'error',
                3000
            );
        }
    }

    /**
     * Delete a field
     */
    async deleteField(field: QueryFieldEntity) {
        if (!confirm(`Are you sure you want to delete field "${field.Name}"?`)) {
            return;
        }
        
        try {
            const deleted = await field.Delete();
            if (deleted) {
                this.queryFields = this.queryFields.filter(f => f.ID !== field.ID);
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Field deleted successfully',
                    'success',
                    3000
                );
            }
        } catch (error) {
            console.error('Error deleting field:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete field',
                'error',
                3000
            );
        }
    }

    /**
     * Add a new entity
     */
    async addEntity() {
        try {
            const md = new Metadata();
            const newEntity = await md.GetEntityObject<QueryEntityEntity>('Query Entities');
            newEntity.QueryID = this.record.ID;
            
            // Add to the list immediately for UI responsiveness
            this.queryEntities.push(newEntity);
            this.updateUnsavedChangesFlag();
        } catch (error) {
            console.error('Error adding entity:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add entity',
                'error',
                3000
            );
        }
    }

    /**
     * Delete an entity
     */
    async deleteEntity(entity: QueryEntityEntity) {
        if (!confirm(`Are you sure you want to delete entity "${entity.Entity}"?`)) {
            return;
        }
        
        try {
            const deleted = await entity.Delete();
            if (deleted) {
                this.queryEntities = this.queryEntities.filter(e => e.ID !== entity.ID);
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Entity deleted successfully',
                    'success',
                    3000
                );
            }
        } catch (error) {
            console.error('Error deleting entity:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete entity',
                'error',
                3000
            );
        }
    }

    /**
     * Get entity options for dropdown
     */
    getEntityOptions(): Array<{text: string, id: string}> {
        return Metadata.Provider.Entities.map(e => ({
            text: e.Name,
            id: e.ID
        })).sort((a, b) => a.text.localeCompare(b.text));
    }

    /**
     * Get the grid edit mode based on component edit mode
     */
    override GridEditMode(): "None" | "Save" | "Queue" {
        return this.EditMode ? "Queue" : "None";
    }

}
