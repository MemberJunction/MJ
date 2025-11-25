import { Component, OnInit } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus, CompositeKey } from '@memberjunction/core';
import { AIConfigurationEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';

interface SystemConfigFilter {
  searchTerm: string;
  status: string;
  isDefault: string;
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
  styleUrls: ['./system-configuration.component.scss']
})
export class SystemConfigurationComponent extends BaseResourceComponent implements OnInit {

  public isLoading = false;
  public error: string | null = null;
  public filterPanelVisible = true;
  
  public configurations: AIConfigurationEntity[] = [];
  public filteredConfigurations: AIConfigurationEntity[] = [];
  
  public currentFilters: SystemConfigFilter = {
    searchTerm: '',
    status: 'all',
    isDefault: 'all'
  };

  constructor(private navigationService: NavigationService) {
    super();
  }

  ngOnInit(): void {
    this.loadData();
    this.NotifyLoadComplete();
  }

  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ: AI Configurations',
        OrderBy: 'Name' 
      });

      if (result && result.Success && result.Results) {
        this.configurations = result.Results as AIConfigurationEntity[];
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
    }
  }

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
  }

  public onMainSplitterChange(event: any): void {
    // No longer need to emit state changes
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
        (config.Description || '').toLowerCase().includes(searchTerm)
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
  }

  public onOpenEntityRecord(entityName: string, recordId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: recordId }]);
    this.navigationService.OpenEntityRecord(entityName, compositeKey);
  }

  public getStatusColor(status: string): string {
    switch (status) {
      case 'Active': return 'success';
      case 'Preview': return 'warning';
      case 'Inactive': return 'error';
      case 'Deprecated': return 'error';
      default: return 'info';
    }
  }

  public getConfigIcon(): string {
    return 'fa-solid fa-cogs';
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Configuration';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-cogs';
  }
}