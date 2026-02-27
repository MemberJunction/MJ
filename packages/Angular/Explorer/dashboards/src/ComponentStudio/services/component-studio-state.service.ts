import { Injectable, EventEmitter } from '@angular/core';
import { RunView, CompositeKey, Metadata } from '@memberjunction/core';
import { MJComponentEntityExtended } from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { BehaviorSubject, Subject } from 'rxjs';

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
export type DisplayComponent = (MJComponentEntityExtended & { isFileLoaded?: false }) | FileLoadedComponent;

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
  private _dbComponents: MJComponentEntityExtended[] = [];
  private _fileLoadedComponents: FileLoadedComponent[] = [];

  get DbComponents(): MJComponentEntityExtended[] { return this._dbComponents; }
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

  private metadata: Metadata = new Metadata();

  // ============================================================
  // DATA LOADING
  // ============================================================

  async LoadComponents(): Promise<void> {
    this._isLoading = true;
    this.StateChanged.emit();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJComponentEntityExtended>({
        EntityName: 'MJ: Components',
        ExtraFilter: 'HasRequiredCustomProps = 0',
        OrderBy: 'Name',
        MaxRows: 1000,
        ResultType: 'entity_object'
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

    const favoritePromises = this._dbComponents.map(component =>
      this.metadata.GetRecordFavoriteStatus(
        currentUserId,
        'MJ: Components',
        CompositeKey.FromID(component.ID)
      )
        .then(isFavorite => ({ componentId: component.ID, isFavorite }))
        .catch(() => ({ componentId: component.ID, isFavorite: false }))
    );

    const results = await Promise.all(favoritePromises);
    for (const result of results) {
      if (result.isFavorite) {
        this._favoriteComponents.add(result.componentId);
      }
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
        !isFavorite
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

  GetComponentSpec(component: DisplayComponent): ComponentSpec {
    return component.isFileLoaded ? component.specification : JSON.parse(component.Specification);
  }

  GetComponentId(component: DisplayComponent): string {
    return component.isFileLoaded ? component.id : component.ID;
  }

  GetComponentNamespace(component: DisplayComponent): string | undefined {
    if (component.isFileLoaded) {
      return component.specification.namespace;
    }
    return (component as MJComponentEntityExtended).Namespace || undefined;
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

  StartComponent(component: DisplayComponent): void {
    this._selectedComponent = component;
    this._componentSpec = this.GetComponentSpec(component);
    this._isRunning = true;
    this._currentError = null;
    this._isDetailsPaneCollapsed = false;
    this._hasUnsavedChanges = false;
    this.InitializeEditors();
    this.StateChanged.emit();
  }

  StopComponent(): void {
    this._isRunning = false;
    this._selectedComponent = null;
    this._componentSpec = null;
    this._currentError = null;
    this._hasUnsavedChanges = false;
    this.StateChanged.emit();
  }

  RunComponent(component: DisplayComponent): void {
    const componentId = this.GetComponentId(component);
    const selectedId = this._selectedComponent ? this.GetComponentId(this._selectedComponent) : null;

    if (this._isRunning && selectedId !== componentId) {
      this.StopComponent();
    }
    this.StartComponent(component);
  }

  // ============================================================
  // EDITORS
  // ============================================================

  InitializeEditors(): void {
    if (!this._selectedComponent) return;

    const spec = this.GetComponentSpec(this._selectedComponent);
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
    // rather than re-parsing from the entity's raw Specification field.
    const spec = this._componentSpec || this.GetComponentSpec(this._selectedComponent);
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
        } else {
          (this._selectedComponent as MJComponentEntityExtended).Specification = JSON.stringify(parsed);
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
      } else {
        (this._selectedComponent as MJComponentEntityExtended).Specification = JSON.stringify(spec);
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
   */
  UpdateWithResolvedSpec(resolvedSpec: ComponentSpec): void {
    if (!this._selectedComponent) return;

    // Only update if the resolved spec actually differs (has real code)
    const current = this._componentSpec;
    if (!current || current === resolvedSpec) return;

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
    } else {
      (this._selectedComponent as MJComponentEntityExtended).Specification = JSON.stringify(newSpec);
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
