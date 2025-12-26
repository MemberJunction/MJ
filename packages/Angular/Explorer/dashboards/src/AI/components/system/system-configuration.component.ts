import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RunView, LogError, LogStatus, CompositeKey } from '@memberjunction/core';
import { AIConfigurationEntity, AIConfigurationParamEntity, AIPromptEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';

interface SystemConfigFilter {
  searchTerm: string;
  status: string;
  isDefault: string;
}

interface ConfigurationWithParams extends AIConfigurationEntity {
  params?: AIConfigurationParamEntity[];
  isExpanded?: boolean;
  compressionPrompt?: AIPromptEntity | null;
  summarizationPrompt?: AIPromptEntity | null;
}

/**
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadAIConfigResource() {
  // Force inclusion in production builds
}

/**
 * AI Configuration Resource - displays AI system configuration management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIConfigResource')
@Component({
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
  public allParams: AIConfigurationParamEntity[] = [];
  public allPrompts: AIPromptEntity[] = [];

  public currentFilters: SystemConfigFilter = {
    searchTerm: '',
    status: 'all',
    isDefault: 'all'
  };

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

      const rv = new RunView();

      // Load configurations, params, and prompts in parallel
      const [configResult, paramsResult, promptsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: AI Configurations',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: AI Configuration Params',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'AI Prompts',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        }
      ]);

      if (configResult?.Success && configResult.Results) {
        this.configurations = configResult.Results as ConfigurationWithParams[];
        this.allParams = (paramsResult?.Success ? paramsResult.Results : []) as AIConfigurationParamEntity[];
        this.allPrompts = (promptsResult?.Success ? promptsResult.Results : []) as AIPromptEntity[];

        // Associate params and prompts with configurations
        this.configurations.forEach(config => {
          config.params = this.allParams.filter(p => p.ConfigurationID === config.ID);
          config.isExpanded = false;

          // Find linked prompts
          if (config.DefaultPromptForContextCompressionID) {
            config.compressionPrompt = this.allPrompts.find(p => p.ID === config.DefaultPromptForContextCompressionID) || null;
          }
          if (config.DefaultPromptForContextSummarizationID) {
            config.summarizationPrompt = this.allPrompts.find(p => p.ID === config.DefaultPromptForContextSummarizationID) || null;
          }
        });

        // Calculate stats
        this.totalConfigs = this.configurations.length;
        this.activeConfigs = this.configurations.filter(c => c.Status === 'Active').length;
        this.defaultConfig = this.configurations.find(c => c.IsDefault) || null;

        this.applyFilters();
        LogStatus('AI Configurations loaded successfully');
      } else {
        throw new Error('Failed to load AI configurations');
      }
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

    this.filteredConfigurations = filtered;
    this.cdr.detectChanges();
  }

  public onOpenConfiguration(config: ConfigurationWithParams): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: config.ID }]);
    this.navigationService.OpenEntityRecord('MJ: AI Configurations', compositeKey);
  }

  public onOpenPrompt(promptId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: promptId }]);
    this.navigationService.OpenEntityRecord('AI Prompts', compositeKey);
  }

  public onOpenParam(param: AIConfigurationParamEntity): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: param.ID }]);
    this.navigationService.OpenEntityRecord('MJ: AI Configuration Params', compositeKey);
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

  public formatParamValue(param: AIConfigurationParamEntity): string {
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
