/**
 * @fileoverview MCP Filter Panel Component
 *
 * Provides filtering controls for the MCP Dashboard.
 * Matches the pattern used by agent-filter-panel component.
 *
 * @module MCP Filter Panel
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MCPDashboardFilters, MCPDashboardTab } from './mcp-dashboard.component';

@Component({
  standalone: false,
  selector: 'mj-mcp-filter-panel',
  templateUrl: './mcp-filter-panel.component.html',
  styleUrls: ['./mcp-filter-panel.component.css']
})
export class MCPFilterPanelComponent {
  @Input() filters: MCPDashboardFilters = {
    searchTerm: '',
    serverStatus: 'all',
    connectionStatus: 'all',
    toolStatus: 'all',
    logStatus: 'all'
  };

  @Input() activeTab: MCPDashboardTab = 'servers';
  @Input() totalCount = 0;
  @Input() filteredCount = 0;

  @Output() filtersChange = new EventEmitter<MCPDashboardFilters>();
  @Output() closePanel = new EventEmitter<void>();

  public serverStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' }
  ];

  public connectionStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' },
    { text: 'Error', value: 'Error' }
  ];

  public toolStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Deprecated', value: 'Deprecated' }
  ];

  public logStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Success', value: 'Success' },
    { text: 'Error', value: 'Error' },
    { text: 'Running', value: 'Running' }
  ];

  public onFilterChange(): void {
    this.filtersChange.emit(this.filters);
  }

  public onSearchChange(value: string): void {
    this.filters = { ...this.filters, searchTerm: value };
    this.onFilterChange();
  }

  public onServerStatusChange(value: string): void {
    this.filters = { ...this.filters, serverStatus: value };
    this.onFilterChange();
  }

  public onConnectionStatusChange(value: string): void {
    this.filters = { ...this.filters, connectionStatus: value };
    this.onFilterChange();
  }

  public onToolStatusChange(value: string): void {
    this.filters = { ...this.filters, toolStatus: value };
    this.onFilterChange();
  }

  public onLogStatusChange(value: string): void {
    this.filters = { ...this.filters, logStatus: value };
    this.onFilterChange();
  }

  public resetAllFilters(): void {
    this.filters = {
      searchTerm: '',
      serverStatus: 'all',
      connectionStatus: 'all',
      toolStatus: 'all',
      logStatus: 'all'
    };
    this.onFilterChange();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }

  public get hasActiveFilters(): boolean {
    return this.filters.searchTerm !== '' ||
           this.filters.serverStatus !== 'all' ||
           this.filters.connectionStatus !== 'all' ||
           this.filters.toolStatus !== 'all' ||
           this.filters.logStatus !== 'all';
  }

  public get currentStatusOptions(): { text: string; value: string }[] {
    switch (this.activeTab) {
      case 'servers':
        return this.serverStatusOptions;
      case 'connections':
        return this.connectionStatusOptions;
      case 'tools':
        return this.toolStatusOptions;
      case 'logs':
        return this.logStatusOptions;
      default:
        return this.serverStatusOptions;
    }
  }

  public get currentStatusValue(): string {
    switch (this.activeTab) {
      case 'servers':
        return this.filters.serverStatus;
      case 'connections':
        return this.filters.connectionStatus;
      case 'tools':
        return this.filters.toolStatus;
      case 'logs':
        return this.filters.logStatus;
      default:
        return 'all';
    }
  }

  public onCurrentStatusChange(value: string): void {
    switch (this.activeTab) {
      case 'servers':
        this.onServerStatusChange(value);
        break;
      case 'connections':
        this.onConnectionStatusChange(value);
        break;
      case 'tools':
        this.onToolStatusChange(value);
        break;
      case 'logs':
        this.onLogStatusChange(value);
        break;
    }
  }

  public getTabLabel(): string {
    switch (this.activeTab) {
      case 'servers':
        return 'Server';
      case 'connections':
        return 'Connection';
      case 'tools':
        return 'Tool';
      case 'logs':
        return 'Log';
      default:
        return 'Item';
    }
  }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPFilterPanel(): void {
  // Prevents tree-shaking by referencing the component
}
