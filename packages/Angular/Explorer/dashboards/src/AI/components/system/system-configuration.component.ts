import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LogError, LogStatus, CompositeKey } from '@memberjunction/core';
import { MJAIConfigurationEntity, MJAIConfigurationParamEntity, ResourceData } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';

interface SystemConfigFilter {
  searchTerm: string;
  status: string;
  isDefault: string;
}

interface ConfigurationWithParams extends MJAIConfigurationEntity {
  params?: MJAIConfigurationParamEntity[];
  isExpanded?: boolean;
  compressionPrompt?: MJAIPromptEntityExtended | null;
  summarizationPrompt?: MJAIPromptEntityExtended | null;
}
/**
 * AI Configuration Resource - displays AI system configuration management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIConfigResource')
@Component({
  standalone: false,
  selector: 'app-system-configuration',
  templateUrl: './system-configuration.component.html',
  styleUrls: ['./system-configuration.component.css']
})
export class SystemConfigurationComponent extends BaseResourceComponent implements OnInit {

  public isLoading = false;
  public error: string | null = null;
  public FilterPanelVisible = true;

  /** @deprecated Use {@link FilterPanelVisible}. */
  public get filterPanelVisible() {
    return this.FilterPanelVisible;
  }
  /** @deprecated Use {@link FilterPanelVisible}. */
  public set filterPanelVisible(value) {
    this.FilterPanelVisible = value;
  }
  public ViewMode: 'grid' | 'list' = 'grid';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list') {
    this.ViewMode = value;
  }

  public Configurations: ConfigurationWithParams[] = [];

  /** @deprecated Use {@link Configurations}. */
  public get configurations(): ConfigurationWithParams[] {
    return this.Configurations;
  }
  /** @deprecated Use {@link Configurations}. */
  public set configurations(value: ConfigurationWithParams[]) {
    this.Configurations = value;
  }
  public FilteredConfigurations: ConfigurationWithParams[] = [];

  /** @deprecated Use {@link FilteredConfigurations}. */
  public get filteredConfigurations(): ConfigurationWithParams[] {
    return this.FilteredConfigurations;
  }
  /** @deprecated Use {@link FilteredConfigurations}. */
  public set filteredConfigurations(value: ConfigurationWithParams[]) {
    this.FilteredConfigurations = value;
  }
  public AllParams: MJAIConfigurationParamEntity[] = [];

  /** @deprecated Use {@link AllParams}. */
  public get allParams(): MJAIConfigurationParamEntity[] {
    return this.AllParams;
  }
  /** @deprecated Use {@link AllParams}. */
  public set allParams(value: MJAIConfigurationParamEntity[]) {
    this.AllParams = value;
  }
  public AllPrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link AllPrompts}. */
  public get allPrompts(): MJAIPromptEntityExtended[] {
    return this.AllPrompts;
  }
  /** @deprecated Use {@link AllPrompts}. */
  public set allPrompts(value: MJAIPromptEntityExtended[]) {
    this.AllPrompts = value;
  }

  public CurrentFilters: SystemConfigFilter = {
    searchTerm: '',
    status: 'all',
    isDefault: 'all'
  };

  /** @deprecated Use {@link CurrentFilters}. */
  public get currentFilters(): SystemConfigFilter {
    return this.CurrentFilters;
  }
  /** @deprecated Use {@link CurrentFilters}. */
  public set currentFilters(value: SystemConfigFilter) {
    this.CurrentFilters = value;
  }

  // Sorting
  public SortColumn: string = 'Name';

  /** @deprecated Use {@link SortColumn}. */
  public get sortColumn(): string {
    return this.SortColumn;
  }
  /** @deprecated Use {@link SortColumn}. */
  public set sortColumn(value: string) {
    this.SortColumn = value;
  }
  public SortDirection: 'asc' | 'desc' = 'asc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }

  // Detail panel
  public SelectedConfig: ConfigurationWithParams | null = null;

  /** @deprecated Use {@link SelectedConfig}. */
  public get selectedConfig(): ConfigurationWithParams | null {
    return this.SelectedConfig;
  }
  /** @deprecated Use {@link SelectedConfig}. */
  public set selectedConfig(value: ConfigurationWithParams | null) {
    this.SelectedConfig = value;
  }
  public DetailPanelVisible = false;

  /** @deprecated Use {@link DetailPanelVisible}. */
  public get detailPanelVisible() {
    return this.DetailPanelVisible;
  }
  /** @deprecated Use {@link DetailPanelVisible}. */
  public set detailPanelVisible(value) {
    this.DetailPanelVisible = value;
  }

  // Stats
  public TotalConfigs = 0;

  /** @deprecated Use {@link TotalConfigs}. */
  public get totalConfigs() {
    return this.TotalConfigs;
  }
  /** @deprecated Use {@link TotalConfigs}. */
  public set totalConfigs(value) {
    this.TotalConfigs = value;
  }
  public ActiveConfigs = 0;

  /** @deprecated Use {@link ActiveConfigs}. */
  public get activeConfigs() {
    return this.ActiveConfigs;
  }
  /** @deprecated Use {@link ActiveConfigs}. */
  public set activeConfigs(value) {
    this.ActiveConfigs = value;
  }
  public DefaultConfig: ConfigurationWithParams | null = null;

  /** @deprecated Use {@link DefaultConfig}. */
  public get defaultConfig(): ConfigurationWithParams | null {
    return this.DefaultConfig;
  }
  /** @deprecated Use {@link DefaultConfig}. */
  public set defaultConfig(value: ConfigurationWithParams | null) {
    this.DefaultConfig = value;
  }

  constructor(
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.loadData();
  }

  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.cdr.detectChanges();

      // Ensure AIEngineBase is configured (no-op if already loaded)
      await AIEngineBase.Instance.Config(false);

      // Get cached data from AIEngineBase
      const configs = AIEngineBase.Instance.Configurations;
      const params = AIEngineBase.Instance.ConfigurationParams;
      const prompts = AIEngineBase.Instance.Prompts;

      // Create extended configurations with associated data
      this.Configurations = configs.map(config => {
        const extended = config as ConfigurationWithParams;
        extended.params = params.filter(p => UUIDsEqual(p.ConfigurationID, config.ID));
        extended.isExpanded = false;

        // Find linked prompts
        if (config.DefaultPromptForContextCompressionID) {
          extended.compressionPrompt = prompts.find(p => UUIDsEqual(p.ID, config.DefaultPromptForContextCompressionID)) || null;
        }
        if (config.DefaultPromptForContextSummarizationID) {
          extended.summarizationPrompt = prompts.find(p => UUIDsEqual(p.ID, config.DefaultPromptForContextSummarizationID)) || null;
        }

        return extended;
      });

      this.AllParams = params;
      this.AllPrompts = prompts;

      // Calculate stats
      this.TotalConfigs = this.Configurations.length;
      this.ActiveConfigs = this.Configurations.filter(c => c.Status === 'Active').length;
      this.DefaultConfig = this.Configurations.find(c => c.IsDefault) || null;

      this.applyFilters();
      LogStatus('AI Configurations loaded successfully');
    } catch (error) {
      this.error = 'Failed to load AI configurations. Please try again.';
      LogError('Error loading AI configurations', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  public ToggleFilterPanel(): void {
    this.FilterPanelVisible = !this.FilterPanelVisible;
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  public SetViewMode(mode: 'grid' | 'list'): void {
    this.ViewMode = mode;
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: 'grid' | 'list'): void {
    return this.SetViewMode(mode);
  }

  public ToggleExpanded(config: ConfigurationWithParams): void {
    config.isExpanded = !config.isExpanded;
  }

  /** @deprecated Use {@link ToggleExpanded}. */
  public toggleExpanded(config: ConfigurationWithParams): void {
    return this.ToggleExpanded(config);
  }

  public OnFiltersChange(filters: SystemConfigFilter): void {
    this.CurrentFilters = { ...filters };
    this.applyFilters();
  }

  /** @deprecated Use {@link OnFiltersChange}. */
  public onFiltersChange(filters: SystemConfigFilter): void {
    return this.OnFiltersChange(filters);
  }

  public onFilterChange(): void {
    this.applyFilters();
  }

  public OnResetFilters(): void {
    this.CurrentFilters = {
      searchTerm: '',
      status: 'all',
      isDefault: 'all'
    };
    this.applyFilters();
  }

  /** @deprecated Use {@link OnResetFilters}. */
  public onResetFilters(): void {
    return this.OnResetFilters();
  }

  /** View-mode options for the shared <mj-view-toggle>. */
  public readonly ConfigViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid View' },
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
  ];

  /** @deprecated Use {@link ConfigViewOptions}. */
  public get configViewOptions() {
    return this.ConfigViewOptions;
  }

  /** Reset only the popover filters — leave searchTerm (toolbar) untouched. */
  public ResetPopoverFilters(): void {
    this.CurrentFilters = { ...this.CurrentFilters, status: 'all', isDefault: 'all' };
    this.applyFilters();
  }

  /** @deprecated Use {@link ResetPopoverFilters}. */
  public resetPopoverFilters(): void {
    return this.ResetPopoverFilters();
  }

  /** Number of active filter criteria inside the popover (excludes searchTerm — surfaced separately). */
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.CurrentFilters.status && this.CurrentFilters.status !== 'all') n++;
    if (this.CurrentFilters.isDefault && this.CurrentFilters.isDefault !== 'all') n++;
    return n;
  }

  /** Values record consumed by the centralized <mj-filter-panel>. */
  public get ConfigFilterValues(): Record<string, unknown> {
    return {
      status: this.CurrentFilters.status,
      isDefault: this.CurrentFilters.isDefault,
    };
  }

  /** @deprecated Use {@link ConfigFilterValues}. */
  public get configFilterValues(): Record<string, unknown> {
    return this.ConfigFilterValues;
  }

  /** Field config consumed by the centralized <mj-filter-panel>. */
  public get ConfigFilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'status',
        type: 'dropdown',
        label: 'Status',
        icon: 'fa-solid fa-toggle-on',
        options: [
          { text: 'All Statuses', value: 'all' },
          { text: 'Active',       value: 'Active' },
          { text: 'Inactive',     value: 'Inactive' },
          { text: 'Deprecated',   value: 'Deprecated' },
          { text: 'Preview',      value: 'Preview' },
        ],
      },
      {
        key: 'isDefault',
        type: 'dropdown',
        label: 'Default',
        icon: 'fa-solid fa-star',
        options: [
          { text: 'All Configurations', value: 'all' },
          { text: 'Default Only',       value: 'true' },
          { text: 'Non-Default Only',   value: 'false' },
        ],
      },
    ];
  }

  /** @deprecated Use {@link ConfigFilterFields}. */
  public get configFilterFields(): FilterFieldConfig[] {
    return this.ConfigFilterFields;
  }

  /** Receive the updated values record from <mj-filter-panel> and apply it. */
  public OnFilterValuesChange(values: Record<string, unknown>): void {
    this.CurrentFilters = {
      ...this.CurrentFilters,
      status:    (values['status']    as string) ?? 'all',
      isDefault: (values['isDefault'] as string) ?? 'all',
    };
    this.applyFilters();
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(values: Record<string, unknown>): void {
    return this.OnFilterValuesChange(values);
  }

  /** Update searchTerm from the toolbar search input. */
  public OnSearchTermChange(value: string): void {
    this.CurrentFilters = { ...this.CurrentFilters, searchTerm: value ?? '' };
    this.applyFilters();
  }

  /** @deprecated Use {@link OnSearchTermChange}. */
  public onSearchTermChange(value: string): void {
    return this.OnSearchTermChange(value);
  }

  private applyFilters(): void {
    let filtered = [...this.Configurations];

    // Apply search filter
    if (this.CurrentFilters.searchTerm) {
      const searchTerm = this.CurrentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(config =>
        config.Name.toLowerCase().includes(searchTerm) ||
        (config.Description || '').toLowerCase().includes(searchTerm) ||
        (config.params?.some(p => p.Name.toLowerCase().includes(searchTerm) ||
          (p.Description || '').toLowerCase().includes(searchTerm)))
      );
    }

    // Apply status filter
    if (this.CurrentFilters.status !== 'all') {
      filtered = filtered.filter(config => config.Status === this.CurrentFilters.status);
    }

    // Apply default configuration filter
    if (this.CurrentFilters.isDefault !== 'all') {
      const isDefault = this.CurrentFilters.isDefault === 'true';
      filtered = filtered.filter(config => config.IsDefault === isDefault);
    }

    // Apply sorting
    this.FilteredConfigurations = this.applySorting(filtered);
    this.cdr.detectChanges();
  }

  /**
   * Sort the configurations by the specified column
   */
  public SortBy(column: string): void {
    if (this.SortColumn === column) {
      // Toggle direction if same column
      this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.SortColumn = column;
      this.SortDirection = 'asc';
    }
    this.applyFilters();
  }

  /** @deprecated Use {@link SortBy}. */
  public sortBy(column: string): void {
    return this.SortBy(column);
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(configs: ConfigurationWithParams[]): ConfigurationWithParams[] {
    return configs.sort((a, b) => {
      let valueA: string | number | boolean | null | undefined;
      let valueB: string | number | boolean | null | undefined;

      switch (this.SortColumn) {
        case 'Name':
          valueA = a.Name;
          valueB = b.Name;
          break;
        case 'Status':
          valueA = a.Status;
          valueB = b.Status;
          break;
        case 'Parameters':
          valueA = a.params?.length || 0;
          valueB = b.params?.length || 0;
          break;
        case 'Updated':
          valueA = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          valueB = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          break;
        default:
          valueA = a.Name;
          valueB = b.Name;
      }

      // Handle numeric comparison
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        const comparison = valueA - valueB;
        return this.SortDirection === 'desc' ? -comparison : comparison;
      }

      // Handle string/other comparison
      const strA = (valueA ?? '').toString().toLowerCase();
      const strB = (valueB ?? '').toString().toLowerCase();

      const comparison = strA.localeCompare(strB);
      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public OnOpenConfiguration(config: ConfigurationWithParams): void {
    this.navigationService.OpenEntityRecord('MJ: AI Configurations', CompositeKey.FromID(config.ID));
  }

  /** @deprecated Use {@link OnOpenConfiguration}. */
  public onOpenConfiguration(config: ConfigurationWithParams): void {
    return this.OnOpenConfiguration(config);
  }

  public OnOpenPrompt(promptId: string): void {
    this.navigationService.OpenEntityRecord('MJ: AI Prompts', CompositeKey.FromID(promptId));
  }

  /** @deprecated Use {@link OnOpenPrompt}. */
  public onOpenPrompt(promptId: string): void {
    return this.OnOpenPrompt(promptId);
  }

  public OnOpenParam(param: MJAIConfigurationParamEntity): void {
    this.navigationService.OpenEntityRecord('MJ: AI Configuration Params', CompositeKey.FromID(param.ID));
  }

  /** @deprecated Use {@link OnOpenParam}. */
  public onOpenParam(param: MJAIConfigurationParamEntity): void {
    return this.OnOpenParam(param);
  }

  /**
   * Show the detail panel for a configuration
   */
  public ShowConfigDetails(config: ConfigurationWithParams, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.SelectedConfig = config;
    this.DetailPanelVisible = true;
  }

  /** @deprecated Use {@link ShowConfigDetails}. */
  public showConfigDetails(config: ConfigurationWithParams, event?: Event): void {
    return this.ShowConfigDetails(config, event);
  }

  /**
   * Close the detail panel
   */
  public CloseDetailPanel(): void {
    this.DetailPanelVisible = false;
    // Delay clearing selectedConfig for smoother animation
    setTimeout(() => {
      if (!this.DetailPanelVisible) {
        this.SelectedConfig = null;
      }
    }, 300);
  }

  /** @deprecated Use {@link CloseDetailPanel}. */
  public closeDetailPanel(): void {
    return this.CloseDetailPanel();
  }

  /**
   * Open the full entity record from the detail panel
   */
  public OpenConfigFromPanel(): void {
    if (this.SelectedConfig) {
      this.OnOpenConfiguration(this.SelectedConfig);
    }
    // Intent moved to the full record — a lingering panel paints over the
    // records view and greets the user with stale chrome on return.
    this.CloseDetailPanel();
  }

  /** @deprecated Use {@link OpenConfigFromPanel}. */
  public openConfigFromPanel(): void {
    return this.OpenConfigFromPanel();
  }

  public GetStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'status-active';
      case 'Preview': return 'status-preview';
      case 'Inactive': return 'status-inactive';
      case 'Deprecated': return 'status-deprecated';
      default: return 'status-unknown';
    }
  }

  /** @deprecated Use {@link GetStatusClass}. */
  public getStatusClass(status: string): string {
    return this.GetStatusClass(status);
  }

  public GetStatusIcon(status: string): string {
    switch (status) {
      case 'Active': return 'fa-solid fa-circle-check';
      case 'Preview': return 'fa-solid fa-flask';
      case 'Inactive': return 'fa-solid fa-circle-pause';
      case 'Deprecated': return 'fa-solid fa-triangle-exclamation';
      default: return 'fa-solid fa-circle-question';
    }
  }

  /** @deprecated Use {@link GetStatusIcon}. */
  public getStatusIcon(status: string): string {
    return this.GetStatusIcon(status);
  }

  public GetParamTypeIcon(type: string): string {
    switch (type) {
      case 'string': return 'fa-solid fa-font';
      case 'number': return 'fa-solid fa-hashtag';
      case 'boolean': return 'fa-solid fa-toggle-on';
      case 'date': return 'fa-solid fa-calendar';
      case 'object': return 'fa-solid fa-brackets-curly';
      default: return 'fa-solid fa-code';
    }
  }

  /** @deprecated Use {@link GetParamTypeIcon}. */
  public getParamTypeIcon(type: string): string {
    return this.GetParamTypeIcon(type);
  }

  public FormatParamValue(param: MJAIConfigurationParamEntity): string {
    if (!param.Value) return '(not set)';

    switch (param.Type) {
      case 'boolean':
        return param.Value === 'true' ? 'Yes' : 'No';
      case 'object':
        try {
          return JSON.stringify(JSON.parse(param.Value), null, 2).substring(0, 50) + '...';
        } catch {
          return param.Value.substring(0, 50) + '...';
        }
      default:
        return param.Value.length > 50 ? param.Value.substring(0, 50) + '...' : param.Value;
    }
  }

  /** @deprecated Use {@link FormatParamValue}. */
  public formatParamValue(param: MJAIConfigurationParamEntity): string {
    return this.FormatParamValue(param);
  }

  public formatDate(date: Date): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'AI Configuration';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-sliders';
  }
}
