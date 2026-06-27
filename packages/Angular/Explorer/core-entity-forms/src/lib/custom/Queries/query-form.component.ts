import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, AfterViewInit, inject } from '@angular/core';
import { MJQueryEntityExtended, MJQueryParameterEntity, MJQueryCategoryEntity, MJQueryFieldEntity, MJQueryEntityEntity, MJQueryPermissionEntity, MJQueryDependencyEntity, QueryEngine } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, FormToolbarConfig, CUSTOM_LAYOUT_TOOLBAR_CONFIG, MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { MJQueryFormComponent } from '../../generated/Entities/MJQuery/mjquery.form.component';
import { RUN_QUERY_SQL_FILTERS, CompositeKey, BaseEntity } from '@memberjunction/core';
import { TreeBranchConfig } from '@memberjunction/ng-trees';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CodeEditorComponent, CompositionTokenClickEvent } from '@memberjunction/ng-code-editor';
import { NavigationService } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';

interface CategoryTreeNode {
    id: string;
    name: string;
    items?: CategoryTreeNode[];
}

@RegisterClass(BaseFormComponent, 'MJ: Queries')
@Component({
  standalone: false,
    selector: 'mj-query-form',
    templateUrl: './query-form.component.html',
    styleUrls: ['../../../shared/form-styles.css', './query-form.component.css']
})
export class MJQueryFormComponentExtended extends MJQueryFormComponent implements OnInit, OnDestroy, AfterViewInit {
    public record!: MJQueryEntityExtended;
    public queryParameters: MJQueryParameterEntity[] = [];
    public queryFields: MJQueryFieldEntity[] = [];
    public queryEntities: MJQueryEntityEntity[] = [];
    public queryPermissions: MJQueryPermissionEntity[] = [];
    public isLoadingParameters = false;
    public isLoadingFields = false;
    public isLoadingEntities = false;
    public isLoadingPermissions = false;
    public hasUnsavedChanges = false;
    public showFiltersHelp = false;
    public showRunDialog = false;
    public categoryPathDisplay = '';
    public IsSaving = false;

    // Expansion panel states
    public sqlPanelExpanded = true;
    public parametersPanelExpanded = false;
    public fieldsPanelExpanded = false;
    public entitiesPanelExpanded = false;
    public technicalDescriptionPanelExpanded = false;
    public detailsPanelExpanded = false;
    public permissionsPanelExpanded = false;
    public dependentsPanelExpanded = false;
    
    // Category data
    public categoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' }
    ];
    public categories: MJQueryCategoryEntity[] = [];
    public categoryTreeData: CategoryTreeNode[] = [];

    /** Tree dropdown config for Query Categories */
    public CategoryBranchConfig: TreeBranchConfig = {
        EntityName: 'MJ: Query Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    /** CategoryID as CompositeKey for tree dropdown binding */
    public get CategoryIDAsKey(): CompositeKey | null {
        return this.record?.CategoryID ? CompositeKey.FromID(this.record.CategoryID) : null;
    }

    /** Handle tree dropdown category selection */
    public OnCategoryTreeChange(value: CompositeKey | CompositeKey[] | null): void {
        if (!this.record) return;
        if (value instanceof CompositeKey && value.HasValue) {
            this.record.CategoryID = value.KeyValuePairs[0]?.Value ?? null;
        } else {
            this.record.CategoryID = null;
        }
        this.updateCategoryPathDisplay();
    }

    // Status options — matches MJQueryEntity.Status type from database CHECK constraint
    public statusOptions = [
        { text: 'Pending', value: 'Pending' },
        { text: 'Approved', value: 'Approved' },
        { text: 'Rejected', value: 'Rejected' },
        { text: 'Expired', value: 'Expired' }
    ];

    // Toolbar config: custom layout — hides the right-hand section-controls
    // group, keeps all left-side action buttons (delete/favorite/history/list)
    // since they're now wired through `<mj-record-form-container>`.
    public readonly ToolbarConfig: FormToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** Custom-layout Query form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    @ViewChild('sqlEditor') sqlEditor: CodeEditorComponent | null = null;
    
    // SQL Filters for help display
    public sqlFilters = RUN_QUERY_SQL_FILTERS;
    
    private navigationService = inject(NavigationService);
    private formPresenter = inject(MJFormPresenterService);
    private destroy$ = new Subject<void>();

    /**
     * Gets queries that depend on (reference) this query via composition.
     */
    public get DependentQueries(): MJQueryDependencyEntity[] {
        return this.record?.QueryDependents ?? [];
    }
    private isUpdatingEditorValue = false;
    private isInitialLoad = true;

    async ngOnInit() {
        await super.ngOnInit();

        // During init, suppress per-method detectChanges to avoid NG0100.
        // We do one unified detectChanges after everything completes.
        this.isInitialLoad = true;

        // Load all data synchronously from QueryEngine cache
        this.loadCategories();
        this.loadQueryParameters();
        this.loadQueryFields();
        this.loadQueryEntities();
        this.loadQueryPermissions();

        this.isInitialLoad = false;
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

    loadQueryParameters() {
        if (this.record && this.record.ID) {
            this.queryParameters = this.record.QueryParameters;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    loadQueryFields() {
        if (this.record && this.record.ID) {
            this.queryFields = this.record.QueryFields;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    loadQueryEntities() {
        if (this.record && this.record.ID) {
            this.queryEntities = this.record.QueryEntities;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    loadQueryPermissions() {
        if (this.record && this.record.ID) {
            this.queryPermissions = this.record.QueryPermissions;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    loadCategories() {
        this.categories = QueryEngine.Instance.Categories;

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

        // Update cached category path display
        this.updateCategoryPathDisplay();

        // Trigger change detection to update the view (skip during init)
        if (!this.isInitialLoad) this.cdr.detectChanges();
    }
    
    private buildCategoryTree(categories: MJQueryCategoryEntity[]): CategoryTreeNode[] {
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
        if (!this.record?.CategoryID) return '';

        const findPath = (categoryId: string): string[] => {
            const category = this.categories.find(c => UUIDsEqual(c.ID, categoryId));
            if (!category) return [];

            if (category.ParentID) {
                return [...findPath(category.ParentID), category.Name];
            }
            return [category.Name];
        };

        return findPath(this.record.CategoryID).join(' / ');
    }

    private updateCategoryPathDisplay(): void {
        this.categoryPathDisplay = this.getCategoryPath();
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
                const md = this.ProviderToUse;
                const newCategory = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories');
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

        // Warn if query is not approved
        if (this.record.Status !== 'Approved') {
            console.warn(`Executing query '${this.record.Name}' with status '${this.record.Status}'. Query has not been approved.`);
        }

        // Reload parameters in case they were updated
        this.loadQueryParameters();

        // Show the run dialog — set before detectChanges to avoid NG0100
        this.showRunDialog = true;
        this.cdr.detectChanges();
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
            const md = this.ProviderToUse;
            const newParam = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters');
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
    async editParameter(param: MJQueryParameterEntity) {
        // TODO: Show parameter edit dialog
        console.log('Edit parameter:', param);
    }
    
    /**
     * Delete a parameter
     */
    async deleteParameter(param: MJQueryParameterEntity) {
        if (!confirm(`Are you sure you want to delete parameter "${param.Name}"?`)) {
            return;
        }

        try {
            // Reload the parameter entity fresh to ensure we have a clean copy
            // not tied to any form transaction state
            const md = this.ProviderToUse;
            const freshParam = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters');
            const loaded = await freshParam.Load(param.ID);
            if (!loaded) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Could not load parameter record. It may have already been deleted.',
                    'warning',
                    3000
                );
                // Remove from local list anyway since it doesn't exist
                this.removeParameterFromList(param);
                return;
            }

            const deleted = await freshParam.Delete();
            if (deleted) {
                this.removeParameterFromList(param);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Parameter deleted successfully',
                    'success',
                    3000
                );
            } else {
                const errorDetail = freshParam.LatestResult?.CompleteMessage ?? 'Unknown reason';
                console.error('Failed to delete parameter:', errorDetail);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete parameter: ${errorDetail}`,
                    'error',
                    5000
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

    private removeParameterFromList(param: MJQueryParameterEntity): void {
        const index = this.queryParameters.indexOf(param);
        if (index > -1) {
            this.queryParameters.splice(index, 1);
        }
        this.cdr.detectChanges();
    }
    
    /**
     * Create a new Query Category in a slide-in via the generic
     * MJFormPresenterService. A new record opens in edit mode automatically.
     * On save, refresh the category tree and select the new category.
     */
    async createCategory(): Promise<void> {
        const ref = this.formPresenter.Open({
            EntityName: 'MJ: Query Categories',
            Presentation: 'slide-in',
            // Quick-create: drop the system-metadata (timestamps) section — empty
            // for a new record. Merges over the slide-in preset (toolbar still off).
            Config: { HiddenSectionKeys: ['systemMetadata'] },
            Provider: this.ProviderToUse,
        });
        const saved = await ref.AfterSaved();
        if (saved) {
            this.onCategoryCreated(saved);
        }
    }

    /**
     * Edit the currently-selected category in a slide-in via the generic
     * MJFormPresenterService. `StartInEditMode` opens the existing record
     * editable. On save, refresh the category tree.
     */
    async editSelectedCategory(): Promise<void> {
        if (!this.record.CategoryID) return;
        const ref = this.formPresenter.Open({
            EntityName: 'MJ: Query Categories',
            RecordId: this.record.CategoryID,
            Presentation: 'slide-in',
            // Open editable + drop the system-metadata section. Partial config
            // merges over the slide-in preset, so the toolbar stays suppressed.
            Config: { StartInEditMode: true, HiddenSectionKeys: ['systemMetadata'] },
            Provider: this.ProviderToUse,
        });
        const saved = await ref.AfterSaved();
        if (saved) {
            this.loadCategories();
            this.cdr.detectChanges();
        }
    }

    onCategoryCreated(newCategory: BaseEntity) {
        // Reload categories to include the new one
        this.loadCategories();

        // Set the new category as selected
        this.record.CategoryID = (newCategory as MJQueryCategoryEntity).ID;

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
        this.IsSaving = true;
        this.cdr.markForCheck();
        try {
            return await this.internalSaveRecord(StopEditModeAfterSave);
        } finally {
            await Promise.resolve(); // microtask to avoid ExpressionChangedAfterItHasBeenCheckedError
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    private async internalSaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
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
                    const md = this.ProviderToUse;
                    const newCategory = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories');
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
                this.loadQueryParameters();
                this.loadQueryFields();
                this.loadQueryEntities();
                this.updateCategoryPathDisplay();
                this.cdr.detectChanges();
            }
        }
        
        return result;
    }

    getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Approved':  return '#28a745';
            case 'Pending':   return '#f59e0b';
            case 'Rejected':  return '#dc3545';
            case 'Expired':   return '#6c757d';
            default:          return '#6c757d';
        }
    }

    getStatusBannerIcon(): string {
        switch (this.record?.Status) {
            case 'Pending':   return 'fa-clock';
            case 'Rejected':  return 'fa-times-circle';
            case 'Expired':   return 'fa-archive';
            default:          return 'fa-info-circle';
        }
    }

    getStatusBannerMessage(): string {
        switch (this.record?.Status) {
            case 'Pending':   return 'It can be executed for testing but has not yet been approved.';
            case 'Rejected':  return 'It was rejected and may need revision before approval.';
            case 'Expired':   return 'It has expired and is no longer in active use.';
            default:          return '';
        }
    }

    /**
     * Handle composition token click — navigate to the referenced query
     */
    onCompositionTokenClick(event: CompositionTokenClickEvent): void {
        const allQueries = QueryEngine.Instance.Queries;
        const segments = event.FullPath.split('/').map(s => s.trim()).filter(s => s.length > 0);
        if (segments.length === 0) return;

        const queryName = segments[segments.length - 1];
        const categorySegments = segments.slice(0, -1);

        // First try: exact match on Name + CategoryPath
        let targetQuery = allQueries.find(q => {
            if (q.Name !== queryName) return false;
            if (categorySegments.length === 0) return true;
            const expectedPath = categorySegments.join('/');
            return q.CategoryPath === expectedPath;
        });

        // Fallback: match on Name alone
        if (!targetQuery) {
            targetQuery = allQueries.find(q => q.Name === queryName);
        }

        if (targetQuery) {
            const compositeKey = CompositeKey.FromID(targetQuery.ID);
            this.navigationService.OpenEntityRecord('MJ: Queries', compositeKey);
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Referenced query "${event.FullPath}" not found.`,
                'warning',
                3000
            );
        }
    }

    /**
     * Navigate to a dependent query's record
     */
    onDependentQueryClick(dep: MJQueryDependencyEntity): void {
        const compositeKey = CompositeKey.FromID(dep.QueryID);
        this.navigationService.OpenEntityRecord('MJ: Queries', compositeKey);
    }

    /**
     * Handle SQL value changes from the code editor
     */
    onSQLChange(value: string) {
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
            const md = this.ProviderToUse;
            const newField = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields');
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
    async deleteField(field: MJQueryFieldEntity) {
        if (!confirm(`Are you sure you want to delete field "${field.Name}"?`)) {
            return;
        }

        try {
            const md = this.ProviderToUse;
            const freshField = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields');
            const loaded = await freshField.Load(field.ID);
            if (!loaded) {
                this.queryFields = this.queryFields.filter(f => !UUIDsEqual(f.ID, field.ID));
                this.cdr.detectChanges();
                return;
            }

            const deleted = await freshField.Delete();
            if (deleted) {
                this.queryFields = this.queryFields.filter(f => !UUIDsEqual(f.ID, field.ID));
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Field deleted successfully',
                    'success',
                    3000
                );
            } else {
                const errorDetail = freshField.LatestResult?.CompleteMessage ?? 'Unknown reason';
                console.error('Failed to delete field:', errorDetail);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete field: ${errorDetail}`,
                    'error',
                    5000
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
            const md = this.ProviderToUse;
            const newEntity = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities');
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
    async deleteEntity(entity: MJQueryEntityEntity) {
        if (!confirm(`Are you sure you want to delete entity "${entity.Entity}"?`)) {
            return;
        }

        try {
            const md = this.ProviderToUse;
            const freshEntity = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities');
            const loaded = await freshEntity.Load(entity.ID);
            if (!loaded) {
                this.queryEntities = this.queryEntities.filter(e => !UUIDsEqual(e.ID, entity.ID));
                this.cdr.detectChanges();
                return;
            }

            const deleted = await freshEntity.Delete();
            if (deleted) {
                this.queryEntities = this.queryEntities.filter(e => !UUIDsEqual(e.ID, entity.ID));
                this.updateUnsavedChangesFlag();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Entity deleted successfully',
                    'success',
                    3000
                );
            } else {
                const errorDetail = freshEntity.LatestResult?.CompleteMessage ?? 'Unknown reason';
                console.error('Failed to delete entity:', errorDetail);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to delete entity: ${errorDetail}`,
                    'error',
                    5000
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
        return this.ProviderToUse.Entities.map(e => ({
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
