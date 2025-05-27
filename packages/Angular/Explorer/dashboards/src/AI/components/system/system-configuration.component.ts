import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIConfigurationEntity } from '@memberjunction/core-entities';

interface SystemConfigFilter {
  searchTerm: string;
  status: string;
  isDefault: string;
}

@Component({
  selector: 'app-system-configuration',
  templateUrl: './system-configuration.component.html',
  styleUrls: ['./system-configuration.component.scss']
})
export class SystemConfigurationComponent implements OnInit {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();
  @Output() stateChange = new EventEmitter<any>();

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

  ngOnInit(): void {
    this.loadData();
  }

  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ: AI Configurations',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        IgnoreMaxRows: false,
        MaxRows: 1000
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
    this.emitStateChange();
  }

  public onMainSplitterChange(event: any): void {
    this.emitStateChange();
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

  private emitStateChange(): void {
    const state = {
      filterPanelVisible: this.filterPanelVisible,
      filters: this.currentFilters
    };
    this.stateChange.emit(state);
  }

  public onOpenEntityRecord(entityName: string, recordId: string): void {
    this.openEntityRecord.emit({entityName, recordId});
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
}