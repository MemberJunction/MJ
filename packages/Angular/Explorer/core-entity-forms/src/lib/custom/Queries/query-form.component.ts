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
import { MJConfirmService } from '@memberjunction/ng-ui-components';
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
    public QueryParameters: MJQueryParameterEntity[] = [];

    /** @deprecated Use {@link QueryParameters}. */
    public get queryParameters(): MJQueryParameterEntity[] {
      return this.QueryParameters;
    }
    /** @deprecated Use {@link QueryParameters}. */
    public set queryParameters(value: MJQueryParameterEntity[]) {
      this.QueryParameters = value;
    }
    public QueryFields: MJQueryFieldEntity[] = [];

    /** @deprecated Use {@link QueryFields}. */
    public get queryFields(): MJQueryFieldEntity[] {
      return this.QueryFields;
    }
    /** @deprecated Use {@link QueryFields}. */
    public set queryFields(value: MJQueryFieldEntity[]) {
      this.QueryFields = value;
    }
    public QueryEntities: MJQueryEntityEntity[] = [];

    /** @deprecated Use {@link QueryEntities}. */
    public get queryEntities(): MJQueryEntityEntity[] {
      return this.QueryEntities;
    }
    /** @deprecated Use {@link QueryEntities}. */
    public set queryEntities(value: MJQueryEntityEntity[]) {
      this.QueryEntities = value;
    }
    public QueryPermissions: MJQueryPermissionEntity[] = [];

    /** @deprecated Use {@link QueryPermissions}. */
    public get queryPermissions(): MJQueryPermissionEntity[] {
      return this.QueryPermissions;
    }
    /** @deprecated Use {@link QueryPermissions}. */
    public set queryPermissions(value: MJQueryPermissionEntity[]) {
      this.QueryPermissions = value;
    }
    public IsLoadingParameters = false;

    /** @deprecated Use {@link IsLoadingParameters}. */
    public get isLoadingParameters() {
      return this.IsLoadingParameters;
    }
    /** @deprecated Use {@link IsLoadingParameters}. */
    public set isLoadingParameters(value) {
      this.IsLoadingParameters = value;
    }
    public IsLoadingFields = false;

    /** @deprecated Use {@link IsLoadingFields}. */
    public get isLoadingFields() {
      return this.IsLoadingFields;
    }
    /** @deprecated Use {@link IsLoadingFields}. */
    public set isLoadingFields(value) {
      this.IsLoadingFields = value;
    }
    public IsLoadingEntities = false;

    /** @deprecated Use {@link IsLoadingEntities}. */
    public get isLoadingEntities() {
      return this.IsLoadingEntities;
    }
    /** @deprecated Use {@link IsLoadingEntities}. */
    public set isLoadingEntities(value) {
      this.IsLoadingEntities = value;
    }
    public IsLoadingPermissions = false;

    /** @deprecated Use {@link IsLoadingPermissions}. */
    public get isLoadingPermissions() {
      return this.IsLoadingPermissions;
    }
    /** @deprecated Use {@link IsLoadingPermissions}. */
    public set isLoadingPermissions(value) {
      this.IsLoadingPermissions = value;
    }
    public HasUnsavedChanges = false;

    /** @deprecated Use {@link HasUnsavedChanges}. */
    public get hasUnsavedChanges() {
      return this.HasUnsavedChanges;
    }
    /** @deprecated Use {@link HasUnsavedChanges}. */
    public set hasUnsavedChanges(value) {
      this.HasUnsavedChanges = value;
    }
    public ShowFiltersHelp = false;

    /** @deprecated Use {@link ShowFiltersHelp}. */
    public get showFiltersHelp() {
      return this.ShowFiltersHelp;
    }
    /** @deprecated Use {@link ShowFiltersHelp}. */
    public set showFiltersHelp(value) {
      this.ShowFiltersHelp = value;
    }
    public ShowRunDialog = false;

    /** @deprecated Use {@link ShowRunDialog}. */
    public get showRunDialog() {
      return this.ShowRunDialog;
    }
    /** @deprecated Use {@link ShowRunDialog}. */
    public set showRunDialog(value) {
      this.ShowRunDialog = value;
    }
    public CategoryPathDisplay = '';

    /** @deprecated Use {@link CategoryPathDisplay}. */
    public get categoryPathDisplay() {
      return this.CategoryPathDisplay;
    }
    /** @deprecated Use {@link CategoryPathDisplay}. */
    public set categoryPathDisplay(value) {
      this.CategoryPathDisplay = value;
    }
    public IsSaving = false;

    // Expansion panel states
    public SqlPanelExpanded = true;

    /** @deprecated Use {@link SqlPanelExpanded}. */
    public get sqlPanelExpanded() {
      return this.SqlPanelExpanded;
    }
    /** @deprecated Use {@link SqlPanelExpanded}. */
    public set sqlPanelExpanded(value) {
      this.SqlPanelExpanded = value;
    }
    public ParametersPanelExpanded = false;

    /** @deprecated Use {@link ParametersPanelExpanded}. */
    public get parametersPanelExpanded() {
      return this.ParametersPanelExpanded;
    }
    /** @deprecated Use {@link ParametersPanelExpanded}. */
    public set parametersPanelExpanded(value) {
      this.ParametersPanelExpanded = value;
    }
    public FieldsPanelExpanded = false;

    /** @deprecated Use {@link FieldsPanelExpanded}. */
    public get fieldsPanelExpanded() {
      return this.FieldsPanelExpanded;
    }
    /** @deprecated Use {@link FieldsPanelExpanded}. */
    public set fieldsPanelExpanded(value) {
      this.FieldsPanelExpanded = value;
    }
    public EntitiesPanelExpanded = false;

    /** @deprecated Use {@link EntitiesPanelExpanded}. */
    public get entitiesPanelExpanded() {
      return this.EntitiesPanelExpanded;
    }
    /** @deprecated Use {@link EntitiesPanelExpanded}. */
    public set entitiesPanelExpanded(value) {
      this.EntitiesPanelExpanded = value;
    }
    public TechnicalDescriptionPanelExpanded = false;

    /** @deprecated Use {@link TechnicalDescriptionPanelExpanded}. */
    public get technicalDescriptionPanelExpanded() {
      return this.TechnicalDescriptionPanelExpanded;
    }
    /** @deprecated Use {@link TechnicalDescriptionPanelExpanded}. */
    public set technicalDescriptionPanelExpanded(value) {
      this.TechnicalDescriptionPanelExpanded = value;
    }
    public DetailsPanelExpanded = false;

    /** @deprecated Use {@link DetailsPanelExpanded}. */
    public get detailsPanelExpanded() {
      return this.DetailsPanelExpanded;
    }
    /** @deprecated Use {@link DetailsPanelExpanded}. */
    public set detailsPanelExpanded(value) {
      this.DetailsPanelExpanded = value;
    }
    public PermissionsPanelExpanded = false;

    /** @deprecated Use {@link PermissionsPanelExpanded}. */
    public get permissionsPanelExpanded() {
      return this.PermissionsPanelExpanded;
    }
    /** @deprecated Use {@link PermissionsPanelExpanded}. */
    public set permissionsPanelExpanded(value) {
      this.PermissionsPanelExpanded = value;
    }
    public DependentsPanelExpanded = false;

    /** @deprecated Use {@link DependentsPanelExpanded}. */
    public get dependentsPanelExpanded() {
      return this.DependentsPanelExpanded;
    }
    /** @deprecated Use {@link DependentsPanelExpanded}. */
    public set dependentsPanelExpanded(value) {
      this.DependentsPanelExpanded = value;
    }
    
    // Category data
    public CategoryOptions: Array<{text: string, value: string}> = [
        { text: 'Select Category...', value: '' }
    ];

    /** @deprecated Use {@link CategoryOptions}. */
    public get categoryOptions(): Array<{text: string, value: string}> {
      return this.CategoryOptions;
    }
    /** @deprecated Use {@link CategoryOptions}. */
    public set categoryOptions(value: Array<{text: string, value: string}>) {
      this.CategoryOptions = value;
    }
    public Categories: MJQueryCategoryEntity[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): MJQueryCategoryEntity[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: MJQueryCategoryEntity[]) {
      this.Categories = value;
    }
    public CategoryTreeData: CategoryTreeNode[] = [];

    /** @deprecated Use {@link CategoryTreeData}. */
    public get categoryTreeData(): CategoryTreeNode[] {
      return this.CategoryTreeData;
    }
    /** @deprecated Use {@link CategoryTreeData}. */
    public set categoryTreeData(value: CategoryTreeNode[]) {
      this.CategoryTreeData = value;
    }

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
        return this.record?.CategoryID ? CompositeKey.FromID(this.record.CategoryID) : null; // first-pk-ok: FK target — Query CategoryID references the single-column ID key of Query Categories
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
    public StatusOptions = [
        { text: 'Pending', value: 'Pending' },
        { text: 'Approved', value: 'Approved' },
        { text: 'Rejected', value: 'Rejected' },
        { text: 'Expired', value: 'Expired' }
    ];

    /** @deprecated Use {@link StatusOptions}. */
    public get statusOptions() {
      return this.StatusOptions;
    }
    /** @deprecated Use {@link StatusOptions}. */
    public set statusOptions(value) {
      this.StatusOptions = value;
    }

    // Toolbar config: custom layout — hides the right-hand section-controls
    // group, keeps all left-side action buttons (delete/favorite/history/list)
    // since they're now wired through `<mj-record-form-container>`.
    public readonly ToolbarConfig: FormToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** Custom-layout Query form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    @ViewChild('sqlEditor') SqlEditor: CodeEditorComponent | null = null;

    /** @deprecated Use {@link SqlEditor}. */
    get sqlEditor(): CodeEditorComponent | null {
      return this.SqlEditor;
    }
    /** @deprecated Use {@link SqlEditor}. */
    set sqlEditor(value: CodeEditorComponent | null) {
      this.SqlEditor = value;
    }
    
    // SQL Filters for help display
    public SqlFilters = RUN_QUERY_SQL_FILTERS;

    /** @deprecated Use {@link SqlFilters}. */
    public get sqlFilters() {
      return this.SqlFilters;
    }
    /** @deprecated Use {@link SqlFilters}. */
    public set sqlFilters(value) {
      this.SqlFilters = value;
    }
    
    private navigationService = inject(NavigationService);
    private formPresenter = inject(MJFormPresenterService);
    private confirmService = inject(MJConfirmService);
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
        this.LoadCategories();
        this.LoadQueryParameters();
        this.LoadQueryFields();
        this.LoadQueryEntities();
        this.LoadQueryPermissions();

        this.isInitialLoad = false;
        this.cdr.detectChanges();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    ngAfterViewInit() {
        super.ngAfterViewInit();

        this.SqlEditor?.setEditable(this.EditMode);

        // Set initial SQL value in the editor
        this.updateEditorValue();
    }
 
    override EndEditMode(): void {
        super.EndEditMode();
        this.SqlEditor?.setEditable(false);
    }

    override StartEditMode(): void {
        super.StartEditMode();
        this.SqlEditor?.setEditable(true);
        
        // Force change detection after a brief delay to ensure form controls are initialized
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 50);
    }

    override CancelEdit(): void {
        super.CancelEdit();
        this.updateEditorValue(); // Reset editor value to record SQL
        this.SqlEditor?.setEditable(false);
        this.updateUnsavedChangesFlag(); // Reset unsaved changes flag
    }

    private updateEditorValue() {
        if (!this.SqlEditor || this.isUpdatingEditorValue) {
            return;
        }
        
        // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
            if (!this.SqlEditor) {
                return;
            }
            
            this.isUpdatingEditorValue = true;
            const sqlValue = this.record?.SQL || '';
            
            // Use the setValue method from mj-code-editor component
            this.SqlEditor.setValue(sqlValue);
            this.isUpdatingEditorValue = false;
        }, 0);
    }

    public IsFormReadOnly(): boolean {
        return !this.EditMode;
    }

    /** @deprecated Use {@link IsFormReadOnly}. */
    public isFormReadOnly(): boolean {
      return this.IsFormReadOnly();
    }

    LoadQueryParameters() {
        if (this.record && this.record.ID) {
            this.QueryParameters = this.record.QueryParameters;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadQueryParameters}. */
    loadQueryParameters() {
      return this.LoadQueryParameters();
    }

    LoadQueryFields() {
        if (this.record && this.record.ID) {
            this.QueryFields = this.record.QueryFields;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadQueryFields}. */
    loadQueryFields() {
      return this.LoadQueryFields();
    }

    LoadQueryEntities() {
        if (this.record && this.record.ID) {
            this.QueryEntities = this.record.QueryEntities;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadQueryEntities}. */
    loadQueryEntities() {
      return this.LoadQueryEntities();
    }

    LoadQueryPermissions() {
        if (this.record && this.record.ID) {
            this.QueryPermissions = this.record.QueryPermissions;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadQueryPermissions}. */
    loadQueryPermissions() {
      return this.LoadQueryPermissions();
    }

    LoadCategories() {
        this.Categories = QueryEngine.Instance.Categories;

        // Build flat options for legacy compatibility
        this.CategoryOptions = [
            { text: 'Select Category...', value: '' },
            ...this.Categories.map(cat => ({
                text: cat.Name,
                value: cat.ID
            }))
        ];

        // Build tree data after options are set
        this.CategoryTreeData = this.buildCategoryTree(this.Categories);

        // Update cached category path display
        this.updateCategoryPathDisplay();

        // Trigger change detection to update the view (skip during init)
        if (!this.isInitialLoad) this.cdr.detectChanges();
    }

    /** @deprecated Use {@link LoadCategories}. */
    loadCategories() {
      return this.LoadCategories();
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
    
    GetCategoryPath(): string {
        if (!this.record?.CategoryID) return '';

        const findPath = (categoryId: string): string[] => {
            const category = this.Categories.find(c => UUIDsEqual(c.ID, categoryId));
            if (!category) return [];

            if (category.ParentID) {
                return [...findPath(category.ParentID), category.Name];
            }
            return [category.Name];
        };

        return findPath(this.record.CategoryID).join(' / ');
    }

    /** @deprecated Use {@link GetCategoryPath}. */
    getCategoryPath(): string {
      return this.GetCategoryPath();
    }

    private updateCategoryPathDisplay(): void {
        this.CategoryPathDisplay = this.GetCategoryPath();
    }

    async OnCategoryChange(value: string) {
        // If it's a new category (string but not in existing options)
        if (value && !this.CategoryOptions.find(opt => opt.value === value)) {
            // Check for duplicate category names (case-insensitive, trimmed)
            if (this.isDuplicateCategory(value)) {
                const existingCategory = this.CategoryOptions.find(option => 
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
                    this.CategoryOptions.push({
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

    /** @deprecated Use {@link OnCategoryChange}. */
    async onCategoryChange(value: string) {
      return this.OnCategoryChange(value);
    }

    private isDuplicateCategory(categoryName: string): boolean {
        const normalizedName = categoryName?.trim().toLowerCase();
        return this.CategoryOptions.some(option => 
            option.text && option.text.trim().toLowerCase() === normalizedName
        );
    }

    /**
     * Updates the hasUnsavedChanges flag based on entity dirty states
     */
    private updateUnsavedChangesFlag() {
        this.HasUnsavedChanges = this.QueryParameters.some(param => param.Dirty) || 
                                this.record?.Dirty || false;
    }

    ToggleFiltersHelp() {
        this.ShowFiltersHelp = !this.ShowFiltersHelp;
    }

    /** @deprecated Use {@link ToggleFiltersHelp}. */
    toggleFiltersHelp() {
      return this.ToggleFiltersHelp();
    }

    /**
     * Run the query with parameter dialog
     */
    async RunQuery() {
        if (!this.record?.IsSaved) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the query before running it.', 
                'warning',
                3000
            );
            return;
        }

        // Save any unsaved changes first
        if (this.HasUnsavedChanges) {
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
        this.LoadQueryParameters();

        // Show the run dialog — set before detectChanges to avoid NG0100
        this.ShowRunDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link RunQuery}. */
    async runQuery() {
      return this.RunQuery();
    }

    /**
     * Handle run dialog close
     */
    OnRunDialogClose() {
        this.ShowRunDialog = false;
    }

    /** @deprecated Use {@link OnRunDialogClose}. */
    onRunDialogClose() {
      return this.OnRunDialogClose();
    }
    
    /**
     * Add a new parameter
     */
    async AddParameter() {
        try {
            const md = this.ProviderToUse;
            const newParam = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters');
            newParam.QueryID = this.record.ID;
            newParam.Name = `param${this.QueryParameters.length + 1}`;
            newParam.Type = 'string';
            newParam.IsRequired = false;
            
            const saved = await newParam.Save();
            if (saved) {
                this.QueryParameters.push(newParam);
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

    /** @deprecated Use {@link AddParameter}. */
    async addParameter() {
      return this.AddParameter();
    }
    
    /**
     * Edit a parameter
     */
    async EditParameter(param: MJQueryParameterEntity) {
        // TODO: Show parameter edit dialog
        console.log('Edit parameter:', param);
    }

    /** @deprecated Use {@link EditParameter}. */
    async editParameter(param: MJQueryParameterEntity) {
      return this.EditParameter(param);
    }
    
    /**
     * Delete a parameter
     */
    async DeleteParameter(param: MJQueryParameterEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Delete Parameter', message: `Delete parameter "${param.Name}"?` }))) {
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

    /** @deprecated Use {@link DeleteParameter}. */
    async deleteParameter(param: MJQueryParameterEntity) {
      return this.DeleteParameter(param);
    }

    private removeParameterFromList(param: MJQueryParameterEntity): void {
        const index = this.QueryParameters.indexOf(param);
        if (index > -1) {
            this.QueryParameters.splice(index, 1);
        }
        this.cdr.detectChanges();
    }
    
    /**
     * Create a new Query Category in a slide-in via the generic
     * MJFormPresenterService. A new record opens in edit mode automatically.
     * On save, refresh the category tree and select the new category.
     */
    async CreateCategory(): Promise<void> {
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
            this.OnCategoryCreated(saved);
        }
    }

    /** @deprecated Use {@link CreateCategory}. */
    async createCategory(): Promise<void> {
      return this.CreateCategory();
    }

    /**
     * Edit the currently-selected category in a slide-in via the generic
     * MJFormPresenterService. `StartInEditMode` opens the existing record
     * editable. On save, refresh the category tree.
     */
    async EditSelectedCategory(): Promise<void> {
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
            this.LoadCategories();
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link EditSelectedCategory}. */
    async editSelectedCategory(): Promise<void> {
      return this.EditSelectedCategory();
    }

    OnCategoryCreated(newCategory: BaseEntity) {
        // Reload categories to include the new one
        this.LoadCategories();

        // Set the new category as selected
        this.record.CategoryID = (newCategory as MJQueryCategoryEntity).ID;

        // Trigger change detection
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnCategoryCreated}. */
    onCategoryCreated(newCategory: BaseEntity) {
      return this.OnCategoryCreated(newCategory);
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
        if (this.record.CategoryID && !this.CategoryOptions.find(opt => opt.value === this.record.CategoryID)) {
            if (this.isDuplicateCategory(this.record.CategoryID)) {
                const existingCategory = this.CategoryOptions.find(option => 
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
                        this.CategoryOptions.push({
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
            for (const entity of this.QueryEntities) {
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
                this.LoadQueryParameters();
                this.LoadQueryFields();
                this.LoadQueryEntities();
                this.updateCategoryPathDisplay();
                this.cdr.detectChanges();
            }
        }
        
        return result;
    }

    GetStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Approved':  return '#28a745';
            case 'Pending':   return '#f59e0b';
            case 'Rejected':  return '#dc3545';
            case 'Expired':   return '#6c757d';
            default:          return '#6c757d';
        }
    }

    /** @deprecated Use {@link GetStatusBadgeColor}. */
    getStatusBadgeColor(): string {
      return this.GetStatusBadgeColor();
    }

    GetStatusBannerIcon(): string {
        switch (this.record?.Status) {
            case 'Pending':   return 'fa-clock';
            case 'Rejected':  return 'fa-times-circle';
            case 'Expired':   return 'fa-archive';
            default:          return 'fa-info-circle';
        }
    }

    /** @deprecated Use {@link GetStatusBannerIcon}. */
    getStatusBannerIcon(): string {
      return this.GetStatusBannerIcon();
    }

    GetStatusBannerMessage(): string {
        switch (this.record?.Status) {
            case 'Pending':   return 'It can be executed for testing but has not yet been approved.';
            case 'Rejected':  return 'It was rejected and may need revision before approval.';
            case 'Expired':   return 'It has expired and is no longer in active use.';
            default:          return '';
        }
    }

    /** @deprecated Use {@link GetStatusBannerMessage}. */
    getStatusBannerMessage(): string {
      return this.GetStatusBannerMessage();
    }

    /**
     * Handle composition token click — navigate to the referenced query
     */
    OnCompositionTokenClick(event: CompositionTokenClickEvent): void {
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
            this.navigationService.OpenEntityRecord('MJ: Queries', CompositeKey.FromID(targetQuery.ID));
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Referenced query "${event.FullPath}" not found.`,
                'warning',
                3000
            );
        }
    }

    /** @deprecated Use {@link OnCompositionTokenClick}. */
    onCompositionTokenClick(event: CompositionTokenClickEvent): void {
      return this.OnCompositionTokenClick(event);
    }

    /**
     * Navigate to a dependent query's record
     */
    OnDependentQueryClick(dep: MJQueryDependencyEntity): void {
        this.navigationService.OpenEntityRecord('MJ: Queries', CompositeKey.FromID(dep.QueryID));
    }

    /** @deprecated Use {@link OnDependentQueryClick}. */
    onDependentQueryClick(dep: MJQueryDependencyEntity): void {
      return this.OnDependentQueryClick(dep);
    }

    /**
     * Handle SQL value changes from the code editor
     */
    OnSQLChange(value: string) {
        if (this.isUpdatingEditorValue || !this.record) {
            return;
        }
        
        // Update the record SQL value
        this.record.SQL = value;
        this.updateUnsavedChangesFlag();
    }

    /** @deprecated Use {@link OnSQLChange}. */
    onSQLChange(value: string) {
      return this.OnSQLChange(value);
    }

    /**
     * Add a new field
     */
    async AddField() {
        try {
            const md = this.ProviderToUse;
            const newField = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields');
            newField.QueryID = this.record.ID;
            newField.Name = `field${this.QueryFields.length + 1}`;
            newField.Description = '';
            newField.Sequence = (this.QueryFields.length + 1) * 10;
            newField.SQLBaseType = 'nvarchar';
            newField.SQLFullType = 'nvarchar(255)';
            
            const saved = await newField.Save();
            if (saved) {
                this.QueryFields.push(newField);
                this.QueryFields.sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
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

    /** @deprecated Use {@link AddField}. */
    async addField() {
      return this.AddField();
    }

    /**
     * Delete a field
     */
    async DeleteField(field: MJQueryFieldEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Delete Field', message: `Delete field "${field.Name}"?` }))) {
            return;
        }

        try {
            const md = this.ProviderToUse;
            const freshField = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields');
            const loaded = await freshField.Load(field.ID);
            if (!loaded) {
                this.QueryFields = this.QueryFields.filter(f => !UUIDsEqual(f.ID, field.ID));
                this.cdr.detectChanges();
                return;
            }

            const deleted = await freshField.Delete();
            if (deleted) {
                this.QueryFields = this.QueryFields.filter(f => !UUIDsEqual(f.ID, field.ID));
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

    /** @deprecated Use {@link DeleteField}. */
    async deleteField(field: MJQueryFieldEntity) {
      return this.DeleteField(field);
    }

    /**
     * Add a new entity
     */
    async AddEntity() {
        try {
            const md = this.ProviderToUse;
            const newEntity = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities');
            newEntity.QueryID = this.record.ID;
            
            // Add to the list immediately for UI responsiveness
            this.QueryEntities.push(newEntity);
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

    /** @deprecated Use {@link AddEntity}. */
    async addEntity() {
      return this.AddEntity();
    }

    /**
     * Delete an entity
     */
    async DeleteEntity(entity: MJQueryEntityEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Delete Entity', message: `Delete entity "${entity.Entity}"?` }))) {
            return;
        }

        try {
            const md = this.ProviderToUse;
            const freshEntity = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities');
            const loaded = await freshEntity.Load(entity.ID);
            if (!loaded) {
                this.QueryEntities = this.QueryEntities.filter(e => !UUIDsEqual(e.ID, entity.ID));
                this.cdr.detectChanges();
                return;
            }

            const deleted = await freshEntity.Delete();
            if (deleted) {
                this.QueryEntities = this.QueryEntities.filter(e => !UUIDsEqual(e.ID, entity.ID));
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

    /** @deprecated Use {@link DeleteEntity}. */
    async deleteEntity(entity: MJQueryEntityEntity) {
      return this.DeleteEntity(entity);
    }

    /**
     * Get entity options for dropdown
     */
    GetEntityOptions(): Array<{text: string, id: string}> {
        return this.ProviderToUse.Entities.map(e => ({
            text: e.Name,
            id: e.ID
        })).sort((a, b) => a.text.localeCompare(b.text));
    }

    /** @deprecated Use {@link GetEntityOptions}. */
    getEntityOptions(): Array<{text: string, id: string}> {
      return this.GetEntityOptions();
    }

    /**
     * Get the grid edit mode based on component edit mode
     */
    override GridEditMode(): "None" | "Save" | "Queue" {
        return this.EditMode ? "Queue" : "None";
    }

}
