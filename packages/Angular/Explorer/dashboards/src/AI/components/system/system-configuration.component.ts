import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LogError, LogStatus, CompositeKey } from '@memberjunction/core';
import { MJAIConfigurationEntity, MJAIConfigurationParamEntity, ResourceData } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

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
  public filterPanelVisible = true;
  public viewMode: 'grid' | 'list' = 'grid';

  public configurations: ConfigurationWithParams[] = [];
  public filteredConfigurations: ConfigurationWithParams[] = [];
  public allParams: MJAIConfigurationParamEntity[] = [];
  public allPrompts: MJAIPromptEntityExtended[] = [];

  public currentFilters: SystemConfigFilter = {
    searchTerm: '',
    status: 'all',
    isDefault: 'all'
  };

  // Sorting
  public sortColumn: string = 'Name';
  public sortDirection: 'asc' | 'desc' = 'asc';

  // Detail panel
  public selectedConfig: ConfigurationWithParams | null = null;
  public detailPanelVisible = false;

  // Stats
  public totalConfigs = 0;
  public activeConfigs = 0;
  public defaultConfig: ConfigurationWithParams | null = null;

  constructor(
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
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
      this.configurations = configs.map(config => {
        const extended = config as ConfigurationWithParams;
        extended.params = params.filter(p => UUIDsEqual(p.ConfigurationID, config.ID))
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

      this.allParams = params;
      this.allPrompts = prompts;

      // Calculate stats
      this.totalConfigs = this.configurations.length;
      this.activeConfigs = this.configurations.filter(c => c.Status === 'Active').length;
      this.defaultConfig = this.configurations.find(c => c.IsDefault) || null;

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

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
  }

  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  public toggleExpanded(config: ConfigurationWithParams): void {
    config.isExpanded = !config.isExpanded;
  }

  public onFiltersChange(filters: SystemConfigFilter): void {
    this.currentFilters = { ...filters };
    this.applyFilters();
  }

  public onFilterChange(): void {
    this.applyFilters();
  }

  public onResetFilters(): void {
    this.currentFilters = {
      searchTerm: '',
      status: 'all',
      isDefault: 'all'
    };
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.configurations];

    // Apply search filter
    if (this.currentFilters.searchTerm) {
      const searchTerm = this.currentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(config =>
        config.Name.toLowerCase().includes(searchTerm) ||
        (config.Description || '').toLowerCase().includes(searchTerm) ||
        (config.params?.some(p => p.Name.toLowerCase().includes(searchTerm) ||
          (p.Description || '').toLowerCase().includes(searchTerm)))
      );
    }

    // Apply status filter
    if (this.currentFilters.status !== 'all') {
      filtered = filtered.filter(config => config.Status === this.currentFilters.status);
    }

    // Apply default configuration filter
    if (this.currentFilters.isDefault !== 'all') {
      const isDefault = this.currentFilters.isDefault === 'true';
      filtered = filtered.filter(config => config.IsDefault === isDefault);
    }

    // Apply sorting
    this.filteredConfigurations = this.applySorting(filtered);
    this.cdr.detectChanges();
  }

  /**
   * Sort the configurations by the specified column
   */
  public sortBy(column: string): void {
    if (this.sortColumn === column) {
      // Toggle direction if same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(configs: ConfigurationWithParams[]): ConfigurationWithParams[] {
    return configs.sort((a, b) => {
      let valueA: string | number | boolean | null | undefined;
      let valueB: string | number | boolean | null | undefined;

      switch (this.sortColumn) {
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
        return this.sortDirection === 'desc' ? -comparison : comparison;
      }

      // Handle string/other comparison
      const strA = (valueA ?? '').toString().toLowerCase();
      const strB = (valueB ?? '').toString().toLowerCase();

      const comparison = strA.localeCompare(strB);
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public onOpenConfiguration(config: ConfigurationWithParams): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: config.ID }]);
    this.navigationService.OpenEntityRecord('MJ: AI Configurations', compositeKey);
  }

  public onOpenPrompt(promptId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: promptId }]);
    this.navigationService.OpenEntityRecord('MJ: AI Prompts', compositeKey);
  }

  public onOpenParam(param: MJAIConfigurationParamEntity): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: param.ID }]);
    this.navigationService.OpenEntityRecord('MJ: AI Configuration Params', compositeKey);
  }

  /**
   * Show the detail panel for a configuration
   */
  public showConfigDetails(config: ConfigurationWithParams, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedConfig = config;
    this.detailPanelVisible = true;
  }

  /**
   * Close the detail panel
   */
  public closeDetailPanel(): void {
    this.detailPanelVisible = false;
    // Delay clearing selectedConfig for smoother animation
    setTimeout(() => {
      if (!this.detailPanelVisible) {
        this.selectedConfig = null;
      }
    }, 300);
  }

  /**
   * Open the full entity record from the detail panel
   */
  public openConfigFromPanel(): void {
    if (this.selectedConfig) {
      this.onOpenConfiguration(this.selectedConfig);
    }
  }

  public getStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'status-active';
      case 'Preview': return 'status-preview';
      case 'Inactive': return 'status-inactive';
      case 'Deprecated': return 'status-deprecated';
      default: return 'status-unknown';
    }
  }

  public getStatusIcon(status: string): string {
    switch (status) {
      case 'Active': return 'fa-solid fa-circle-check';
      case 'Preview': return 'fa-solid fa-flask';
      case 'Inactive': return 'fa-solid fa-circle-pause';
      case 'Deprecated': return 'fa-solid fa-triangle-exclamation';
      default: return 'fa-solid fa-circle-question';
    }
  }

  public getParamTypeIcon(type: string): string {
    switch (type) {
      case 'string': return 'fa-solid fa-font';
      case 'number': return 'fa-solid fa-hashtag';
      case 'boolean': return 'fa-solid fa-toggle-on';
      case 'date': return 'fa-solid fa-calendar';
      case 'object': return 'fa-solid fa-brackets-curly';
      default: return 'fa-solid fa-code';
    }
  }

  public formatParamValue(param: MJAIConfigurationParamEntity): string {
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
