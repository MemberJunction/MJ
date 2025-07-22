import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { QueryEntity, QueryParameterEntity, QueryCategoryEntity, QueryFieldEntity, QueryEntityEntity, QueryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { QueryFormComponent } from '../../generated/Entities/Query/query.form.component';
import { Metadata, RunView, RUN_QUERY_SQL_FILTERS } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
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
    selector: 'mj-query-form',
    templateUrl: './query-form.component.html',
    styleUrls: ['../../../shared/form-styles.css', './query-form.component.css']
})
export class QueryFormExtendedComponent extends QueryFormComponent implements OnInit, OnDestroy {
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

    async ngOnInit() {
        await super.ngOnInit();
        await Promise.all([
            this.loadQueryParameters(),
            this.loadQueryFields(),
            this.loadQueryEntities(),
            this.loadQueryPermissions(),
            this.loadCategories()
        ]);
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
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
                    OrderBy: 'EntityName ASC',
                    ResultType: 'entity_object'
                });
                
                if (results.Success) {
                    this.queryEntities = results.Results || [];
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
                    OrderBy: 'Type ASC',
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
                this.categoryTreeData = this.buildCategoryTree(this.categories);
                
                // Build flat options for legacy compatibility
                this.categoryOptions = [
                    { text: 'Select Category...', value: '' },
                    ...this.categories.map(cat => ({
                        text: cat.Name,
                        value: cat.ID
                    }))
                ];
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categoryOptions = [{ text: 'Select Category...', value: '' }];
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
                        'warning'
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
                        'success'
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Failed to create new category. ${newCategory.LatestResult?.Message || ''}`, 
                        'error'
                    );
                }
            } catch (error) {
                console.error('Error creating new category:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error creating new category. Please try again.', 
                    'error'
                );
            }
        }
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName.trim().toLowerCase();
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
                'warning'
            );
            return;
        }

        // Save any unsaved changes first
        if (this.hasUnsavedChanges) {
            const saveResult = await this.SaveRecord(false); // Don't exit edit mode
            if (!saveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to save query changes.', 
                    'error'
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
                    'success'
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to add parameter',
                    'error'
                );
            }
        } catch (error) {
            console.error('Error adding parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding parameter',
                'error'
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
                    'success'
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to delete parameter',
                    'error'
                );
            }
        } catch (error) {
            console.error('Error deleting parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error deleting parameter',
                'error'
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
                        'warning'
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

        // Call the parent save method
        const result = await super.SaveRecord(StopEditModeAfterSave);
        
        if (result) {
            this.updateUnsavedChangesFlag();
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
        if (this.record) {
            // Handle both direct string value and event object
            const sqlValue = typeof value === 'string' ? value : value?.target?.value || '';
            this.record.SQL = sqlValue;
            this.updateUnsavedChangesFlag();
        }
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
                    'success'
                );
            }
        } catch (error) {
            console.error('Error adding field:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add field',
                'error'
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
                    'success'
                );
            }
        } catch (error) {
            console.error('Error deleting field:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete field',
                'error'
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
            
            const saved = await newEntity.Save();
            if (saved) {
                this.queryEntities.push(newEntity);
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Entity added successfully',
                    'success'
                );
            }
        } catch (error) {
            console.error('Error adding entity:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add entity',
                'error'
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
                    'success'
                );
            }
        } catch (error) {
            console.error('Error deleting entity:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete entity',
                'error'
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

}

export function LoadQueryFormExtendedComponent() {
    // prevents tree shaking
}