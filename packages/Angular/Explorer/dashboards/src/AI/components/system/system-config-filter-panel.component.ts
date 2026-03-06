import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { MJAIConfigurationEntity } from '@memberjunction/core-entities';

interface SystemConfigFilter {
  searchTerm: string;
  status: string;
  isDefault: string;
}

@Component({
  standalone: false,
  selector: 'mj-system-config-filter-panel',
  templateUrl: './system-config-filter-panel.component.html',
  styleUrls: ['./system-config-filter-panel.component.css']
})
export class SystemConfigFilterPanelComponent implements OnInit {
  @Input() configurations: MJAIConfigurationEntity[] = [];
  @Input() filteredConfigurations: MJAIConfigurationEntity[] = [];
  @Input() filters: SystemConfigFilter = {
    searchTerm: '',
    status: 'all',
    isDefault: 'all'
  };

  @Output() filtersChange = new EventEmitter<SystemConfigFilter>();
  @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' },
    { text: 'Deprecated', value: 'Deprecated' },
    { text: 'Preview', value: 'Preview' }
  ];

  public isDefaultOptions = [
    { text: 'All Configurations', value: 'all' },
    { text: 'Default Only', value: 'true' },
    { text: 'Non-Default Only', value: 'false' }
  ];

  ngOnInit(): void {
    // Initialize component
  }

  public onFilterChange(): void {
    this.filtersChange.emit(this.filters);
    this.filterChange.emit();
  }

  public resetAllFilters(): void {
    this.resetFilters.emit();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }
}