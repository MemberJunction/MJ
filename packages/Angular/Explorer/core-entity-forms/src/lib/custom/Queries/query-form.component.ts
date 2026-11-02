import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, AfterViewInit, inject } from '@angular/core';
import { MJQueryEntityExtended, MJQueryParameterEntity, MJQueryCategoryEntity, MJQueryFieldEntity, MJQueryEntityEntity, MJQueryPermissionEntity, MJQueryDependencyEntity, QueryEngine, ParseQueryDiagnostics } from '@memberjunction/core-entities';
import type { QueryDiagnosticLine, QueryRefreshExtractionOutput } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, FormToolbarConfig, CUSTOM_LAYOUT_TOOLBAR_CONFIG, MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { MJQueryFormComponent } from '../../generated/Entities/MJQuery/mjquery.form.component';
import { RUN_QUERY_SQL_FILTERS, CompositeKey, BaseEntity } from '@memberjunction/core';
import { TreeBranchConfig } from '@memberjunction/ng-trees';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CodeEditorComponent, CompositionTokenClickEvent } from '@memberjunction/ng-code-editor';
import { EditorMarkersFor, ExtractionSeverityOf, HideUnreadableFieldRows, SaveRefusalOf } from './query-form-logic';
import type { QueryRefreshScope } from '@memberjunction/ng-query-viewer';
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

    /** Custom-layout form owns its entire body; suppress auto-filled relationship sections. */
    public override get OwnsEntireFormBody(): boolean { return true; }

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

        // The editable child rows come from the database, not the cache, so a save writes exactly
        // what the user saw and changed.
        await this.loadDeclaredChildren();
    }

    ngOnDestroy() {
        super.ngOnDestroy();
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
        this.clearSaveDiagnostics();
        this.updateEditorValue(); // Reset editor value to record SQL
        this.SqlEditor?.setEditable(false);
        // Discard added, removed and edited child rows: reload them as stored.
        void this.loadDeclaredChildren(true).then(() => this.updateUnsavedChangesFlag());
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
            // Replacing the text drops the markers, so set them again for the new text.
            this.applyEditorMarkers();
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
        if (this.record) {
            const declared = this.record.DeclaredParameters;
            this.QueryParameters = declared.IsLoaded || !this.record.IsSaved ? [...declared.Items] : this.record.QueryParameters;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadQueryParameters}. */
    loadQueryParameters() {
      return this.LoadQueryParameters();
    }

    LoadQueryFields() {
        if (this.record) {
            const declared = this.record.DeclaredFields;
            const rows = declared.IsLoaded || !this.record.IsSaved ? [...declared.Items] : this.record.QueryFields;
            this.QueryFields = this.fieldsVisibleToUser(rows);
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /**
     * Leaves out the fields whose source the current user may not read: the user's results never
     * carry those columns, so the form does not name them either.
     */
    private fieldsVisibleToUser(rows: MJQueryFieldEntity[]): MJQueryFieldEntity[] {
        const provider = this.ProviderToUse;
        const visible = this.record.QueryFieldsVisibleTo(provider.CurrentUser, provider.Entities);
        return HideUnreadableFieldRows(rows, this.record.QueryFields, visible);
    }

    /** @deprecated Use {@link LoadQueryFields}. */
    loadQueryFields() {
      return this.LoadQueryFields();
    }

    LoadQueryEntities() {
        if (this.record) {
            const declared = this.record.DeclaredEntities;
            this.QueryEntities = declared.IsLoaded || !this.record.IsSaved ? [...declared.Items] : this.record.QueryEntities;
            if (!this.isInitialLoad) this.cdr.detectChanges();
        }
    }

    /**
     * Loads the query's parameters, fields and entity links into the declared collections, which
     * the form edits and the query's save writes as one unit (a graph save). `force` discards
     * unsaved changes to them.
     */
    private async loadDeclaredChildren(force = false): Promise<void> {
        if (!this.record?.IsSaved) {
            this.refreshChildLists();
            return;
        }
        this.IsLoadingParameters = this.IsLoadingFields = this.IsLoadingEntities = true;
        this.cdr.detectChanges();
        try {
            await Promise.all([
                this.record.DeclaredParameters.Load(force),
                this.record.DeclaredFields.Load(force),
                this.record.DeclaredEntities.Load(force),
            ]);
        } catch (error) {
            console.error('Error loading the query\'s parameters, fields and entities:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Could not load this query\'s parameters, fields and entities for editing; showing the cached copy.', 'warning', 5000);
        } finally {
            this.IsLoadingParameters = this.IsLoadingFields = this.IsLoadingEntities = false;
            this.refreshChildLists();
        }
    }

    /** Copies the declared collections into the lists the template shows. */
    private refreshChildLists(): void {
        this.LoadQueryParameters();
        this.LoadQueryFields();
        this.LoadQueryEntities();
        this.updateUnsavedChangesFlag();
        this.cdr.detectChanges();
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
        // The record's Dirty includes its declared collections (added, removed and edited rows).
        this.HasUnsavedChanges = this.record?.Dirty ?? false;
    }

    /** A child row's annotation changed in a grid. */
    public OnChildRowChanged(): void {
        this.updateUnsavedChangesFlag();
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
     * Adds a parameter the user declares. It is written with the query when the query is saved.
     */
    async AddParameter() {
        try {
            const param = await this.record.DeclaredParameters.Create();
            param.Name = `param${this.QueryParameters.length + 1}`;
            param.Type = 'string';
            param.IsRequired = false;
            param.DetectionMethod = 'Manual';
            this.ParametersPanelExpanded = true;
            this.refreshChildLists();
        } catch (error) {
            console.error('Error adding parameter:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error adding parameter', 'error', 3000);
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
     * Removes a parameter. A stored one is deleted when the query is saved.
     */
    async DeleteParameter(param: MJQueryParameterEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Remove Parameter', message: `Remove parameter "${param.Name}"? It is deleted when you save the query.` }))) {
            return;
        }
        this.removeChildRow(this.record.DeclaredParameters.Items, row => this.record.DeclaredParameters.Remove(row), param);
    }

    /** @deprecated Use {@link DeleteParameter}. */
    async deleteParameter(param: MJQueryParameterEntity) {
      return this.DeleteParameter(param);
    }

    /**
     * Removes a row from one of the declared collections and refreshes the lists. A row the form
     * shows from the cache (the collections could not be loaded) cannot be removed this way.
     */
    private removeChildRow<T>(items: readonly T[], remove: (row: T) => void, row: T): void {
        if (!items.includes(row)) {
            MJNotificationService.Instance.CreateSimpleNotification('This row cannot be removed here; reload the query and try again.', 'warning', 4000);
            return;
        }
        remove(row);
        this.refreshChildLists();
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

        // An entity link with no entity chosen yet is not saved with the query.
        for (const link of [...this.record.DeclaredEntities.Items]) {
            if (!link.IsSaved && !link.EntityID) this.record.DeclaredEntities.Remove(link);
        }

        // One graph save: the query row and its declared parameters, fields and entity links are
        // written together, so the server's extraction sees the children in the same transaction.
        const result = await super.SaveRecord(StopEditModeAfterSave);

        if (result) {
            this.clearSaveDiagnostics();
            // The server re-derives facts after the save, so reload the rows as now stored.
            await this.loadDeclaredChildren(true);
            this.updateCategoryPathDisplay();
            this.applyEditorMarkers();
            this.cdr.detectChanges();
        } else {
            this.showSaveDiagnostics();
        }

        return result;
    }

    /**
     * Saves the query with its declared parameters, fields and entity links as one graph save, then
     * any permission rows the permissions grid queued, in a transaction group of their own.
     *
     * The base form enrols the record in a transaction group whenever rows are queued, and a graph
     * save cannot run inside one (the group defers the query's own write, so its children would be
     * written against a row that does not exist yet). The query is therefore written first; if a
     * permission row then fails, the query stays saved and the save reports the failure.
     */
    protected override async InternalSaveRecord(): Promise<boolean> {
        if (!this.record) return false;
        if (!(await this.record.Save())) return false;
        return this.savePendingRows();
    }

    private async savePendingRows(): Promise<boolean> {
        const pending = this.PendingRecords;
        if (pending.length === 0) return true;
        const tg = await this.ProviderToUse.CreateTransactionGroup();
        try {
            for (const item of pending) {
                item.entityObject.TransactionGroup = tg;
                if (item.action === 'save') await item.entityObject.Save();
                else await item.entityObject.Delete();
            }
            return await tg.Submit();
        } finally {
            // A member left in a submitted group would queue its next write into a group that is done.
            for (const item of pending) {
                if (item.entityObject.TransactionGroup === tg) item.entityObject.TransactionGroup = null;
            }
        }
    }

    // ─── Save-time diagnostics and extraction status ────────────────────────────

    /** Why the last save was refused, one finding per rule the SQL broke; empty after a successful save. */
    public SaveDiagnostics: QueryDiagnosticLine[] = [];
    /** The refusal's headline, e.g. `Query "X" was not saved:`. */
    public SaveDiagnosticsHeadline: string | null = null;

    /** The findings of the query's last metadata extraction (`ExtractionMessage`), one per line. */
    public get ExtractionDiagnostics(): QueryDiagnosticLine[] {
        return ParseQueryDiagnostics(this.record?.ExtractionMessage);
    }

    /** The extraction status as the badge shows it. */
    public get ExtractionStatusLabel(): string {
        return this.record?.ExtractionStatus ?? 'Not extracted';
    }

    /** CSS modifier for the extraction status badge. */
    public get ExtractionStatusClass(): string {
        return `extraction-badge--${(this.record?.ExtractionStatus ?? 'none').toLowerCase()}`;
    }

    /** How serious the extraction message is, for the diagnostics list. */
    public get ExtractionSeverity(): 'error' | 'warning' | 'info' {
        return ExtractionSeverityOf(this.record?.ExtractionStatus);
    }

    private showSaveDiagnostics(): void {
        const refusal = SaveRefusalOf(this.record.LatestResult?.Message || this.record.LatestResult?.CompleteMessage);
        this.SaveDiagnostics = refusal ? [...refusal.Diagnostics] : [];
        this.SaveDiagnosticsHeadline = refusal?.Headline ?? null;
        if (refusal) this.SqlPanelExpanded = true;
        this.applyEditorMarkers();
        this.cdr.detectChanges();
    }

    private clearSaveDiagnostics(): void {
        this.SaveDiagnostics = [];
        this.SaveDiagnosticsHeadline = null;
    }

    /**
     * Marks findings in the SQL editor: a refused save's findings as errors while there are any,
     * otherwise the last extraction's findings that carry a location.
     */
    private applyEditorMarkers(): void {
        this.SqlEditor?.SetDiagnosticMarkers(EditorMarkersFor(this.SaveDiagnostics, this.ExtractionDiagnostics, this.record?.ExtractionStatus));
    }

    /** A finding's location was clicked: show that place in the SQL editor. */
    public OnDiagnosticLocationClick(diagnostic: QueryDiagnosticLine): void {
        if (diagnostic.Line === null || diagnostic.Column === null) return;
        this.SqlPanelExpanded = true;
        this.cdr.detectChanges();
        this.SqlEditor?.RevealPosition(diagnostic.Line, diagnostic.Column);
    }

    // ─── Refresh metadata ───────────────────────────────────────────────────────

    public ShowRefreshDialog = false;

    /** This query, as the refresh dialog's scope. */
    public get RefreshScope(): QueryRefreshScope | null {
        return this.record?.IsSaved ? { Kind: 'Queries', QueryIDs: [this.record.ID] } : null;
    }

    /** Names this query in the refresh dialog. */
    public get RefreshScopeLabel(): string {
        return `Query “${this.record?.Name ?? ''}”`;
    }

    /** Whether the user may refresh this query's metadata: a saved query, not being edited, and Update permission on queries. */
    public get CanRefreshMetadata(): boolean {
        if (!this.record?.IsSaved || this.EditMode) return false;
        const user = this.ProviderToUse.CurrentUser;
        return !!user && !!this.record.EntityInfo?.GetUserPermisions(user)?.CanUpdate;
    }

    public OpenRefreshDialog(): void {
        this.ShowRefreshDialog = true;
        this.cdr.detectChanges();
    }

    public OnRefreshDialogClosed(): void {
        this.ShowRefreshDialog = false;
        this.cdr.detectChanges();
    }

    /** A refresh was applied: reload the query row (its extraction status) and its child rows. */
    public async OnRefreshApplied(_output: QueryRefreshExtractionOutput): Promise<void> {
        try {
            await this.record.Load(this.record.ID);
        } catch (error) {
            console.error('Error reloading the query after a refresh:', error);
        }
        await this.loadDeclaredChildren(true);
        this.applyEditorMarkers();
        this.cdr.detectChanges();
    }

    /** Opens a query named in the refresh report. */
    public OnRefreshOpenQuery(queryID: string): void {
        this.navigationService.OpenEntityRecord('MJ: Queries', CompositeKey.FromID(queryID));
    }

    /** Opens the entity field a query column comes from. */
    public OnOpenSourceField(entityFieldID: string): void {
        this.navigationService.OpenEntityRecord('MJ: Entity Fields', CompositeKey.FromID(entityFieldID));
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
     * Adds a field the user declares, by name. Its facts (type, nullability, source) come from the
     * database server when the query is saved; the user supplies the annotations.
     */
    async AddField() {
        try {
            const field = await this.record.DeclaredFields.Create();
            field.Name = `field${this.QueryFields.length + 1}`;
            field.Description = '';
            field.Sequence = this.QueryFields.length + 1;
            field.SQLBaseType = 'nvarchar';
            field.SQLFullType = 'nvarchar(255)';
            field.DetectionMethod = 'Manual';
            this.FieldsPanelExpanded = true;
            this.refreshChildLists();
        } catch (error) {
            console.error('Error adding field:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Failed to add field', 'error', 3000);
        }
    }

    /** @deprecated Use {@link AddField}. */
    async addField() {
      return this.AddField();
    }

    /**
     * Removes a field. A stored one is deleted when the query is saved.
     */
    async DeleteField(field: MJQueryFieldEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Remove Field', message: `Remove field "${field.Name}"? It is deleted when you save the query.` }))) {
            return;
        }
        this.removeChildRow(this.record.DeclaredFields.Items, row => this.record.DeclaredFields.Remove(row), field);
    }

    /** @deprecated Use {@link DeleteField}. */
    async deleteField(field: MJQueryFieldEntity) {
      return this.DeleteField(field);
    }

    /**
     * Adds an entity link the user declares. It is written with the query when the query is saved.
     */
    async AddEntity() {
        try {
            const entity = await this.record.DeclaredEntities.Create();
            entity.DetectionMethod = 'Manual';
            this.EntitiesPanelExpanded = true;
            this.refreshChildLists();
        } catch (error) {
            console.error('Error adding entity:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Failed to add entity', 'error', 3000);
        }
    }

    /** @deprecated Use {@link AddEntity}. */
    async addEntity() {
      return this.AddEntity();
    }

    /**
     * Removes an entity link. A stored one is deleted when the query is saved.
     */
    async DeleteEntity(entity: MJQueryEntityEntity) {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Remove Entity', message: `Remove entity "${entity.Entity || 'this entity'}"? It is deleted when you save the query.` }))) {
            return;
        }
        this.removeChildRow(this.record.DeclaredEntities.Items, row => this.record.DeclaredEntities.Remove(row), entity);
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
