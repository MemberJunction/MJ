import { Injectable, EventEmitter } from '@angular/core';
import { RunView, CompositeKey, Metadata, IMetadataProvider } from '@memberjunction/core';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { buildCuratedFormSchema, CuratedFormSchema, FormMode } from '@memberjunction/interactive-component-types/forms';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { BehaviorSubject, Subject } from 'rxjs';
import { FormCanvasModel } from './form-canvas-model';

/**
 * Lightweight summary of a database component for the browser list.
 * Only contains fields needed for display — Specification and other heavy
 * columns are fetched on demand when a component is selected.
 */
export interface DbComponentSummary {
  ID: string;
  Name: string;
  Namespace: string | null;
  Version: string | null;
  Type: string | null;
  Status: string | null;
  Description: string | null;
  HasRequiredCustomProps: boolean;
  __mj_UpdatedAt: Date | null;
  isFileLoaded?: false;
}

/**
 * Interface for components loaded from files, text, or artifacts (not from database)
 */
export interface FileLoadedComponent {
  id: string;
  name: string;
  description?: string;
  specification: ComponentSpec;
  filename: string;
  loadedAt: Date;
  isFileLoaded: true;
  type?: string;
  status?: string;
  sourceArtifactID?: string;
  sourceVersionID?: string;
}

/**
 * Union type for both database and file-loaded components
 */
export type DisplayComponent = DbComponentSummary | FileLoadedComponent;

/**
 * Category for filtering
 */
export interface Category {
  name: string;
  count: number;
  color: string;
}

/**
 * Component error info
 */
export interface ComponentError {
  type: string;
  message: string;
  technicalDetails?: Record<string, unknown> | string;
}

/**
 * Code section for the code editor tabbed panel
 */
export interface CodeSection {
  title: string;
  code: string;
  originalCode: string;
  isDependency: boolean;
  index?: number;
}

/**
 * Central state management service for Component Studio.
 * Decouples state from components so sub-components can share state.
 */
@Injectable()
export class ComponentStudioStateService {

  // --- Component Data ---
  private _dbComponents: DbComponentSummary[] = [];
  private _fileLoadedComponents: FileLoadedComponent[] = [];

  get DbComponents(): DbComponentSummary[] { return this._dbComponents; }
  get FileLoadedComponents(): FileLoadedComponent[] { return this._fileLoadedComponents; }

  /** Combined list of all components (file-loaded first, then DB) */
  get AllComponents(): DisplayComponent[] {
    return [
      ...this._fileLoadedComponents,
      ...this._dbComponents
    ] as DisplayComponent[];
  }

  // --- Filtered Components ---
  private _filteredComponents: DisplayComponent[] = [];
  get FilteredComponents(): DisplayComponent[] { return this._filteredComponents; }

  // --- Selection & Running ---
  private _selectedComponent: DisplayComponent | null = null;
  private _expandedComponent: DisplayComponent | null = null;
  private _componentSpec: ComponentSpec | null = null;
  private _isRunning = false;

  get SelectedComponent(): DisplayComponent | null { return this._selectedComponent; }
  set SelectedComponent(value: DisplayComponent | null) { this._selectedComponent = value; }

  get ExpandedComponent(): DisplayComponent | null { return this._expandedComponent; }
  set ExpandedComponent(value: DisplayComponent | null) { this._expandedComponent = value; }

  get ComponentSpec(): ComponentSpec | null { return this._componentSpec; }
  set ComponentSpec(value: ComponentSpec | null) { this._componentSpec = value; }

  get IsRunning(): boolean { return this._isRunning; }
  set IsRunning(value: boolean) { this._isRunning = value; }

  // --- Form-role target entity (shared between Field Binding Inspector
  // and the fixture-record live preview) ---
  // Tracks which entity a form-role Component is being authored against.
  // Inspector writes; Preview reads to build fixture FormHostProps; either
  // can clear by setting to null. Independent of ComponentSpec because the
  // author may want to inspect Customer fields while editing a form for
  // Accounts, or simply hasn't decided yet.
  private _formTargetEntityName: string | null = null;
  get FormTargetEntityName(): string | null { return this._formTargetEntityName; }
  set FormTargetEntityName(value: string | null) {
    if (value === this._formTargetEntityName) return;
    this._formTargetEntityName = value;
    // Schema is keyed by entity — invalidate when target changes.
    this._formSchema = null;
    this.StateChanged.emit();
  }

  // --- Form Builder canvas state (live inside the Form Builder tab). ---
  // The canvas is the source of truth WHILE the Form Builder tab is active;
  // on save we serialize it back to ComponentSpec.code via canvas-to-code.
  // When the user instead edits Code directly, the canvas is rebuilt via
  // code-to-canvas (lossy) on tab focus. Schema is cached per entity so
  // tab toggles don't pay the build cost repeatedly.
  private _formCanvas: FormCanvasModel | null = null;
  get FormCanvas(): FormCanvasModel | null { return this._formCanvas; }
  set FormCanvas(value: FormCanvasModel | null) {
    this._formCanvas = value;
    this.StateChanged.emit();
  }

  private _formSchema: CuratedFormSchema | null = null;
  get FormSchema(): CuratedFormSchema | null { return this._formSchema; }

  private _formSelectedElementId: string | null = null;
  get FormSelectedElementId(): string | null { return this._formSelectedElementId; }
  set FormSelectedElementId(value: string | null) {
    this._formSelectedElementId = value;
    this.StateChanged.emit();
  }

  private _formSelectedSectionId: string | null = null;
  get FormSelectedSectionId(): string | null { return this._formSelectedSectionId; }
  set FormSelectedSectionId(value: string | null) {
    this._formSelectedSectionId = value;
    this.StateChanged.emit();
  }

  /** True when the parser couldn't fully round-trip code → canvas. UI shows a banner. */
  private _formCodeOnlySectionsDetected = false;
  get FormCodeOnlySectionsDetected(): boolean { return this._formCodeOnlySectionsDetected; }
  set FormCodeOnlySectionsDetected(value: boolean) {
    this._formCodeOnlySectionsDetected = value;
    this.StateChanged.emit();
  }

  /** Preview mode for the Form Builder tab — drives the toolbar pills AND the preview pane. */
  private _formPreviewMode: FormMode = 'view';
  get FormPreviewMode(): FormMode { return this._formPreviewMode; }
  set FormPreviewMode(value: FormMode) {
    if (this._formPreviewMode === value) return;
    this._formPreviewMode = value;
    this.StateChanged.emit();
  }

  /** Build (and cache) the curated schema for the given entity. */
  BuildFormSchema(entityName: string | null): CuratedFormSchema | null {
    if (!entityName) {
      this._formSchema = null;
      return null;
    }
    if (this._formSchema && this._formSchema.entityName === entityName) {
      return this._formSchema;
    }
    const schema = buildCuratedFormSchema(entityName, this.Provider);
    this._formSchema = schema;
    return schema;
  }

  // --- Loading ---
  private _isLoading = true;
  get IsLoading(): boolean { return this._isLoading; }

  // --- Error ---
  private _currentError: ComponentError | null = null;
  get CurrentError(): ComponentError | null { return this._currentError; }
  set CurrentError(value: ComponentError | null) { this._currentError = value; }

  // --- Filters ---
  private _searchQuery = '';
  private _selectedCategories: Set<string> = new Set();
  private _showOnlyFavorites = false;
  private _showDeprecatedComponents = false;
  private _showAllCategories = false;
  private _isFilterPanelExpanded = false;

  get SearchQuery(): string { return this._searchQuery; }
  set SearchQuery(value: string) {
    this._searchQuery = value;
    this.ApplyFilters();
  }

  get SelectedCategories(): Set<string> { return this._selectedCategories; }
  get ShowOnlyFavorites(): boolean { return this._showOnlyFavorites; }
  get ShowDeprecatedComponents(): boolean { return this._showDeprecatedComponents; }
  get ShowAllCategories(): boolean { return this._showAllCategories; }
  get IsFilterPanelExpanded(): boolean { return this._isFilterPanelExpanded; }

  // --- Favorites ---
  private _favoriteComponents: Set<string> = new Set();
  get FavoriteComponents(): Set<string> { return this._favoriteComponents; }

  // --- Categories ---
  private _availableCategories: Category[] = [];
  get AvailableCategories(): Category[] { return this._availableCategories; }

  // --- Editor State ---
  private _editableSpec = '';
  private _editableCode = '';
  private _codeSections: CodeSection[] = [];
  private _isEditingSpec = false;
  private _isEditingCode = false;
  private _activeTab = 0;
  private _isDetailsPaneCollapsed = true;

  get EditableSpec(): string { return this._editableSpec; }
  set EditableSpec(value: string) { this._editableSpec = value; }

  get EditableCode(): string { return this._editableCode; }
  set EditableCode(value: string) { this._editableCode = value; }

  get CodeSections(): CodeSection[] { return this._codeSections; }

  get IsEditingSpec(): boolean { return this._isEditingSpec; }
  set IsEditingSpec(value: boolean) { this._isEditingSpec = value; }

  get IsEditingCode(): boolean { return this._isEditingCode; }
  set IsEditingCode(value: boolean) { this._isEditingCode = value; }

  get ActiveTab(): number { return this._activeTab; }
  set ActiveTab(value: number) { this._activeTab = value; }

  get IsDetailsPaneCollapsed(): boolean { return this._isDetailsPaneCollapsed; }
  set IsDetailsPaneCollapsed(value: boolean) { this._isDetailsPaneCollapsed = value; }

  // --- Unsaved changes tracking ---
  private _hasUnsavedChanges = false;
  private _hasResolvedSpec = false;
  get HasUnsavedChanges(): boolean { return this._hasUnsavedChanges; }
  set HasUnsavedChanges(value: boolean) { this._hasUnsavedChanges = value; }

  // --- AI Panel ---
  private _isAIPanelCollapsed = false;
  get IsAIPanelCollapsed(): boolean { return this._isAIPanelCollapsed; }
  set IsAIPanelCollapsed(value: boolean) { this._isAIPanelCollapsed = value; }

  // --- Events ---
  /** Emitted when state changes require UI update */
  StateChanged = new EventEmitter<void>();

  /** Emitted when the running component needs to refresh */
  RefreshComponent = new EventEmitter<void>();

  /** Emitted when an error should be sent to AI for diagnosis */
  SendErrorToAI = new EventEmitter<ComponentError>();

  /** Emitted when a component spec is updated (e.g. by AI) */
  SpecUpdated = new EventEmitter<ComponentSpec>();

  /** Emitted when the Form Builder tab's "Open in Chat" button is clicked.
   * The dashboard subscribes and forwards to NavigationService.SetAgentContext. */
  OpenInChatRequested = new EventEmitter<void>();

  private _provider: IMetadataProvider | null = null;

  /** Set the metadata provider this service should use. Components should call this after injection. */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  private get metadata(): IMetadataProvider {
    return this.Provider;
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  async LoadComponents(): Promise<void> {
    this._isLoading = true;
    this.StateChanged.emit();

    try {
      const rv = RunView.FromMetadataProvider(this.Provider);
      const result = await rv.RunView<DbComponentSummary>({
        EntityName: 'MJ: Components',
        ExtraFilter: 'HasRequiredCustomProps = 0',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Namespace', 'Version', 'Type', 'Status', 'Description', 'HasRequiredCustomProps', '__mj_UpdatedAt'],
        MaxRows: 1000,
        ResultType: 'simple'
      });

      if (result.Success) {
        this._dbComponents = result.Results || [];
        this.ApplyFilters();
        this._isLoading = false;
        this.StateChanged.emit();

        // Load favorites in background
        this.loadFavorites();
      } else {
        console.error('Failed to load components:', result.ErrorMessage);
        this._isLoading = false;
        this.StateChanged.emit();
      }
    } catch (error) {
      console.error('Error loading components:', error);
      this._isLoading = false;
      this.StateChanged.emit();
    }
  }

  private async loadFavorites(): Promise<void> {
    const currentUserId = this.metadata.CurrentUser?.ID;
    if (!currentUserId) return;

    this._favoriteComponents.clear();

    try {
      // Batch-load all favorites for this user + entity in a single query
      // instead of one GetRecordFavoriteStatus call per component.
      const rv = RunView.FromMetadataProvider(this.Provider);
      const safeUserId = currentUserId.replace(/'/g, "''");
      const result = await rv.RunView<{RecordID: string}>({
        EntityName: 'MJ: User Favorites',
        ExtraFilter: `UserID='${safeUserId}' AND Entity='MJ: Components'`,
        Fields: ['RecordID'],
        ResultType: 'simple'
      });

      if (result.Success) {
        for (const row of result.Results) {
          this._favoriteComponents.add(row.RecordID);
        }
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }

    this.StateChanged.emit();
  }

  // ============================================================
  // FILTERING
  // ============================================================

  ApplyFilters(): void {
    this.buildCategories();

    let filtered = [...this.AllComponents];

    // Filter out deprecated
    if (!this._showDeprecatedComponents) {
      filtered = filtered.filter(c => this.GetComponentStatus(c) !== 'Deprecated');
    }

    // Favorites filter
    if (this._showOnlyFavorites) {
      filtered = filtered.filter(c => this.IsFavorite(c));
    }

    // Category filter
    if (this._selectedCategories.size > 0) {
      filtered = filtered.filter(c => {
        const namespace = this.GetComponentNamespace(c) || 'Uncategorized';
        const category = this.extractCategoryFromNamespace(namespace);
        return this._selectedCategories.has(category);
      });
    }

    // Search filter
    if (this._searchQuery) {
      const query = this._searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const name = this.GetComponentName(c)?.toLowerCase() || '';
        const description = this.GetComponentDescription(c)?.toLowerCase() || '';
        const type = this.GetComponentType(c)?.toLowerCase() || '';
        const namespace = this.GetComponentNamespace(c)?.toLowerCase() || '';
        return name.includes(query) || description.includes(query) || type.includes(query) || namespace.includes(query);
      });
    }

    this._filteredComponents = filtered;
  }

  private buildCategories(): void {
    const categoryMap = new Map<string, number>();
    for (const component of this.AllComponents) {
      const namespace = this.GetComponentNamespace(component) || 'Uncategorized';
      const category = this.extractCategoryFromNamespace(namespace);
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    }

    this._availableCategories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        color: this.getCategoryColor(name)
      }))
      .sort((a, b) => b.count - a.count);
  }

  private extractCategoryFromNamespace(namespace: string): string {
    if (!namespace || namespace === 'Uncategorized') return 'Uncategorized';
    const parts = namespace.split('/').filter(p => p.length > 0);
    return parts[0] || 'Uncategorized';
  }

  private getCategoryColor(category: string): string {
    const colors = [
      '#3B82F6', '#8B5CF6', '#10B981', '#F97316', '#06B6D4',
      '#EC4899', '#6366F1', '#14B8A6', '#EAB308', '#EF4444',
    ];
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  ToggleFilterPanel(): void {
    this._isFilterPanelExpanded = !this._isFilterPanelExpanded;
    this.StateChanged.emit();
  }

  ToggleCategory(category: string): void {
    if (this._selectedCategories.has(category)) {
      this._selectedCategories.delete(category);
    } else {
      this._selectedCategories.add(category);
    }
    this.ApplyFilters();
    this.StateChanged.emit();
  }

  ToggleShowOnlyFavorites(): void {
    this._showOnlyFavorites = !this._showOnlyFavorites;
    this.ApplyFilters();
    this.StateChanged.emit();
  }

  ToggleShowDeprecatedComponents(): void {
    this._showDeprecatedComponents = !this._showDeprecatedComponents;
    this.ApplyFilters();
    this.StateChanged.emit();
  }

  ToggleShowAllCategories(): void {
    this._showAllCategories = !this._showAllCategories;
    this.StateChanged.emit();
  }

  ClearAllFilters(): void {
    this._selectedCategories.clear();
    this._showOnlyFavorites = false;
    this._showDeprecatedComponents = false;
    this.ApplyFilters();
    this.StateChanged.emit();
  }

  GetActiveFilterCount(): number {
    let count = 0;
    if (this._showOnlyFavorites) count++;
    if (this._showDeprecatedComponents) count++;
    count += this._selectedCategories.size;
    return count;
  }

  GetDeprecatedCount(): number {
    return this.AllComponents.filter(c => this.GetComponentStatus(c) === 'Deprecated').length;
  }

  GetVisibleCategories(): Category[] {
    return this._showAllCategories ? this._availableCategories : this._availableCategories.slice(0, 5);
  }

  IsCategorySelected(category: string): boolean {
    return this._selectedCategories.has(category);
  }

  // ============================================================
  // FAVORITES
  // ============================================================

  IsFavorite(component: DisplayComponent): boolean {
    if (this.IsFileLoadedComponent(component)) return false;
    return this._favoriteComponents.has(this.GetComponentId(component));
  }

  async ToggleFavorite(component: DisplayComponent): Promise<void> {
    if (this.IsFileLoadedComponent(component)) return;

    const currentUserId = this.metadata.CurrentUser?.ID;
    if (!currentUserId) return;

    const componentId = this.GetComponentId(component);
    const isFavorite = this._favoriteComponents.has(componentId);

    try {
      await this.metadata.SetRecordFavoriteStatus(
        currentUserId,
        'MJ: Components',
        CompositeKey.FromID(componentId),
        !isFavorite,
        this.metadata.CurrentUser
      );

      if (isFavorite) {
        this._favoriteComponents.delete(componentId);
      } else {
        this._favoriteComponents.add(componentId);
      }
      this.StateChanged.emit();
    } catch (error) {
      console.error('Error toggling favorite status:', error);
    }
  }

  // ============================================================
  // COMPONENT ACCESSORS (for union type)
  // ============================================================

  IsFileLoadedComponent(component: DisplayComponent): component is FileLoadedComponent {
    return component.isFileLoaded === true;
  }

  GetComponentName(component: DisplayComponent): string {
    return component.isFileLoaded ? component.name : component.Name;
  }

  GetComponentDescription(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.description : (component.Description || undefined);
  }

  GetComponentType(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.type : (component.Type || undefined);
  }

  GetComponentStatus(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.status : (component.Status || undefined);
  }

  GetComponentVersion(component: DisplayComponent): string {
    return component.isFileLoaded ? '1.0.0' : (component.Version || '1.0.0');
  }

  /**
   * Fetches the full component specification. For file-loaded components, returns
   * the in-memory spec. For database components, loads the full entity record
   * on demand via ComponentMetadataEngine.FindComponentByID() — the lightweight
   * summary loaded at startup does not include the Specification column.
   */
  async GetComponentSpec(component: DisplayComponent): Promise<ComponentSpec> {
    if (component.isFileLoaded) {
      return component.specification;
    }
    const fullEntity = await ComponentMetadataEngine.Instance.FindComponentByID(component.ID);
    if (!fullEntity || !fullEntity.Specification) {
      throw new Error(`Component specification not found for: ${component.Name}`);
    }
    return JSON.parse(fullEntity.Specification);
  }

  GetComponentId(component: DisplayComponent): string {
    return component.isFileLoaded ? component.id : component.ID;
  }

  GetComponentNamespace(component: DisplayComponent): string | undefined {
    if (component.isFileLoaded) {
      return component.specification.namespace;
    }
    return component.Namespace || undefined;
  }

  GetComponentFilename(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.filename : undefined;
  }

  GetComponentLoadedAt(component: DisplayComponent): Date | undefined {
    return component.isFileLoaded ? component.loadedAt : undefined;
  }

  GetComponentUpdatedAt(component: DisplayComponent): Date | undefined {
    return !component.isFileLoaded && component.__mj_UpdatedAt ? component.__mj_UpdatedAt : undefined;
  }

  // ============================================================
  // COMPONENT RUNNING
  // ============================================================

  async StartComponent(component: DisplayComponent): Promise<void> {
    this._selectedComponent = component;
    this._componentSpec = await this.GetComponentSpec(component);
    this._isRunning = true;
    this._currentError = null;
    this._isDetailsPaneCollapsed = false;
    this._hasUnsavedChanges = false;
    this._hasResolvedSpec = false;
    this.InitializeEditors();
    this.StateChanged.emit();
  }

  StopComponent(): void {
    this._isRunning = false;
    this._selectedComponent = null;
    this._componentSpec = null;
    this._currentError = null;
    this._hasUnsavedChanges = false;
    this._hasResolvedSpec = false;
    this.StateChanged.emit();
  }

  async RunComponent(component: DisplayComponent): Promise<void> {
    const componentId = this.GetComponentId(component);
    const selectedId = this._selectedComponent ? this.GetComponentId(this._selectedComponent) : null;

    if (this._isRunning && selectedId !== componentId) {
      this.StopComponent();
    }
    await this.StartComponent(component);
  }

  // ============================================================
  // EDITORS
  // ============================================================

  InitializeEditors(): void {
    if (!this._selectedComponent || !this._componentSpec) return;

    const spec = this._componentSpec;
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false
    };
    const parsed = ParseJSONRecursive(spec, parseOptions);
    this._editableSpec = JSON.stringify(parsed, null, 2);
    this._editableCode = spec.code || '// No code available';
    this.BuildCodeSections();
    this._isEditingSpec = false;
    this._isEditingCode = false;
    this._hasUnsavedChanges = false;
  }

  BuildCodeSections(): void {
    if (!this._selectedComponent) {
      this._codeSections = [];
      return;
    }

    // Use the in-memory spec (which may be the resolved version from the React bridge)
    if (!this._componentSpec) return;
    const spec = this._componentSpec;
    const sections: CodeSection[] = [];

    const mainCode = spec.code || '// No code available';
    sections.push({
      title: spec.name || 'Main Component',
      code: mainCode,
      originalCode: mainCode,
      isDependency: false
    });

    if (spec.dependencies && Array.isArray(spec.dependencies)) {
      spec.dependencies.forEach((dep: ComponentSpec, index: number) => {
        const depCode = dep.code || '// No code available';
        sections.push({
          title: dep.name || `Dependency ${index + 1}`,
          code: depCode,
          originalCode: depCode,
          isDependency: true,
          index
        });
      });
    }

    this._codeSections = sections;
  }

  /**
   * Apply spec changes from the JSON editor back to the component
   */
  ApplySpecChanges(): boolean {
    try {
      const parsed = JSON.parse(this._editableSpec);

      if (this._selectedComponent) {
        if (this.IsFileLoadedComponent(this._selectedComponent)) {
          this._selectedComponent.specification = parsed;
        }

        this._componentSpec = parsed;
        this._editableCode = parsed.code || '// No code available';
        this.BuildCodeSections();
        this._isEditingSpec = false;
        this._hasUnsavedChanges = true;
        this.RefreshComponent.emit();
        this.StateChanged.emit();
        return true;
      }
    } catch (error) {
      console.error('Invalid JSON in spec editor:', error);
    }
    return false;
  }

  /**
   * Apply code changes from the code editor back to the spec
   */
  ApplyCodeChanges(): boolean {
    if (!this._selectedComponent) return false;

    try {
      const spec = JSON.parse(this._editableSpec);

      if (this._codeSections.length > 0) {
        spec.code = this._codeSections[0].code;

        if (this._codeSections.length > 1 && spec.dependencies) {
          for (let i = 1; i < this._codeSections.length; i++) {
            const section = this._codeSections[i];
            if (section.index !== undefined && spec.dependencies[section.index]) {
              spec.dependencies[section.index].code = section.code;
            }
          }
        }
      }

      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      const parsed = ParseJSONRecursive(spec, parseOptions);
      this._editableSpec = JSON.stringify(parsed, null, 2);

      if (this.IsFileLoadedComponent(this._selectedComponent)) {
        this._selectedComponent.specification = spec;
      }

      this._componentSpec = spec;
      this._isEditingCode = false;
      this._hasUnsavedChanges = true;
      this.RefreshComponent.emit();
      this.StateChanged.emit();
      return true;
    } catch (error) {
      console.error('Error applying code changes:', error);
    }
    return false;
  }

  /**
   * Update the internal spec with the fully resolved version returned by the
   * React bridge after it loads the component hierarchy.  This replaces
   * registry-reference stubs with real code so code sections show actual source.
   * Does NOT mark the component as having unsaved changes or trigger a re-render.
   *
   * Runs at most once per component load. The bridge re-resolves from the registry
   * on every refresh (including the refresh triggered by Apply Changes), and we
   * must not let that round-trip clobber edits the user has already applied.
   */
  UpdateWithResolvedSpec(resolvedSpec: ComponentSpec): void {
    if (!this._selectedComponent) return;
    if (this._hasResolvedSpec) return;

    // Only update if the resolved spec actually differs (has real code)
    const current = this._componentSpec;
    if (!current || current === resolvedSpec) return;

    this._hasResolvedSpec = true;
    this._componentSpec = resolvedSpec;

    // Update editable spec JSON so Spec/Requirements/Design/Data tabs reflect resolved data
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false
    };
    const parsed = ParseJSONRecursive(resolvedSpec, parseOptions);
    this._editableSpec = JSON.stringify(parsed, null, 2);

    // Update editable code with the resolved main code
    this._editableCode = resolvedSpec.code || '// No code available';

    // Rebuild code sections so the editor shows resolved dependency code
    this.BuildCodeSections();
    this.StateChanged.emit();
  }

  /**
   * Update the component spec directly (e.g., from AI)
   */
  UpdateSpec(newSpec: ComponentSpec): void {
    if (!this._selectedComponent) return;

    if (this.IsFileLoadedComponent(this._selectedComponent)) {
      this._selectedComponent.specification = newSpec;
    }

    this._componentSpec = newSpec;
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false
    };
    const parsed = ParseJSONRecursive(newSpec, parseOptions);
    this._editableSpec = JSON.stringify(parsed, null, 2);
    this._editableCode = newSpec.code || '// No code available';
    this.BuildCodeSections();
    this._isEditingSpec = false;
    this._isEditingCode = false;
    this._hasUnsavedChanges = true;
    this.SpecUpdated.emit(newSpec);
    this.RefreshComponent.emit();
    this.StateChanged.emit();
  }

  // ============================================================
  // FILE-LOADED COMPONENT MANAGEMENT
  // ============================================================

  AddFileLoadedComponent(component: FileLoadedComponent): void {
    this._fileLoadedComponents.push(component);
    this.ApplyFilters();
    this.StateChanged.emit();
  }

  RemoveFileLoadedComponent(component: FileLoadedComponent): void {
    const index = this._fileLoadedComponents.indexOf(component);
    if (index > -1) {
      this._fileLoadedComponents.splice(index, 1);
      if (this._selectedComponent === component) {
        this.StopComponent();
      }
      if (this._expandedComponent === component) {
        this._expandedComponent = null;
      }
      this.ApplyFilters();
      this.StateChanged.emit();
    }
  }

  GenerateId(): string {
    return 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  GetComponentTypeIcon(type: string | null | undefined): string {
    const icons: Record<string, string> = {
      'Report': 'fa-file-alt',
      'Dashboard': 'fa-tachometer-alt',
      'Form': 'fa-edit',
      'Chart': 'fa-chart-bar',
      'Table': 'fa-table',
      'Widget': 'fa-cube',
      'Navigation': 'fa-compass',
      'Search': 'fa-search',
      'Utility': 'fa-cog'
    };
    return icons[type || ''] || 'fa-puzzle-piece';
  }

  GetComponentTypeColor(type: string | null | undefined): string {
    const colors: Record<string, string> = {
      'Report': '#3B82F6',
      'Dashboard': '#8B5CF6',
      'Form': '#10B981',
      'Chart': '#F97316',
      'Table': '#06B6D4',
      'Widget': '#EC4899',
      'Navigation': '#6366F1',
      'Search': '#14B8A6',
      'Utility': '#64748B'
    };
    return colors[type || ''] || '#9CA3AF';
  }

  GetNamespaceColor(namespace: string | undefined): string {
    if (!namespace || namespace === 'Uncategorized') return '#6C757D';
    const category = this.extractCategoryFromNamespace(namespace);
    return this.getCategoryColor(category);
  }

  FormatNamespace(namespace: string | undefined): string {
    if (!namespace || namespace === 'Uncategorized') return 'Uncategorized';
    const parts = namespace.split('/').filter(p => p.length > 0);
    if (parts.length > 3) {
      return `${parts[0]} / ... / ${parts[parts.length - 1]}`;
    }
    return parts.join(' / ');
  }

  /**
   * Get the current spec, preferring edited version if available
   */
  GetCurrentSpec(): ComponentSpec | null {
    if (!this._selectedComponent || !this._componentSpec) return null;

    if (this._isEditingSpec || this._isEditingCode) {
      try {
        return JSON.parse(this._editableSpec);
      } catch {
        return this._componentSpec;
      }
    }
    return this._componentSpec;
  }
}
