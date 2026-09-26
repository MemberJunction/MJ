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
  @Input() Filters: MCPDashboardFilters = {
    searchTerm: '',
    serverStatus: 'all',
    connectionStatus: 'all',
    toolStatus: 'all',
    logStatus: 'all',
    toolsServer: 'all',
    toolsCategory: 'all',
    favoritesOnly: false
  };

  /** @deprecated Use {@link Filters}. */
  @Input() set filters(value: MCPDashboardFilters) {
    this.Filters = value;
  }
  /** @deprecated Use {@link Filters}. */
  get filters(): MCPDashboardFilters {
    return this.Filters;
  }

  @Input() ActiveTab: MCPDashboardTab = 'servers';

  /** @deprecated Use {@link ActiveTab}. */
  @Input() set activeTab(value: MCPDashboardTab) {
    this.ActiveTab = value;
  }
  /** @deprecated Use {@link ActiveTab}. */
  get activeTab(): MCPDashboardTab {
    return this.ActiveTab;
  }
  @Input() TotalCount = 0;

  /** @deprecated Use {@link TotalCount}. */
  @Input() set totalCount(value: MCPFilterPanelComponent['TotalCount']) {
    this.TotalCount = value;
  }
  /** @deprecated Use {@link TotalCount}. */
  get totalCount(): MCPFilterPanelComponent['TotalCount'] {
    return this.TotalCount;
  }
  @Input() FilteredCount = 0;

  /** @deprecated Use {@link FilteredCount}. */
  @Input() set filteredCount(value: MCPFilterPanelComponent['FilteredCount']) {
    this.FilteredCount = value;
  }
  /** @deprecated Use {@link FilteredCount}. */
  get filteredCount(): MCPFilterPanelComponent['FilteredCount'] {
    return this.FilteredCount;
  }

  /** Part 3.3 — available servers for the Tools tab server-filter dropdown */
  @Input() AvailableServers: Array<{ ID: string; Name: string }> = [];

  /** @deprecated Use {@link AvailableServers}. */
  @Input() set availableServers(value: Array<{ ID: string; Name: string }>) {
    this.AvailableServers = value;
  }
  /** @deprecated Use {@link AvailableServers}. */
  get availableServers(): Array<{ ID: string; Name: string }> {
    return this.AvailableServers;
  }
  /** Part 3.3 — available categories (derived from snake_case tool-name prefix) with counts */
  @Input() AvailableCategories: Array<{ category: string; count: number }> = [];

  /** @deprecated Use {@link AvailableCategories}. */
  @Input() set availableCategories(value: Array<{ category: string; count: number }>) {
    this.AvailableCategories = value;
  }
  /** @deprecated Use {@link AvailableCategories}. */
  get availableCategories(): Array<{ category: string; count: number }> {
    return this.AvailableCategories;
  }

  @Output() FiltersChange = new EventEmitter<MCPDashboardFilters>();

  /**
   * @deprecated Use {@link FiltersChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (filtersChange) keeps working. Must stay AFTER FiltersChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() filtersChange = this.FiltersChange;
  @Output() ClosePanel = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ClosePanel}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closePanel) keeps working. Must stay AFTER ClosePanel: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closePanel = this.ClosePanel;

  public ServerStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' }
  ];

  /** @deprecated Use {@link ServerStatusOptions}. */
  public get serverStatusOptions() {
    return this.ServerStatusOptions;
  }
  /** @deprecated Use {@link ServerStatusOptions}. */
  public set serverStatusOptions(value) {
    this.ServerStatusOptions = value;
  }

  public ConnectionStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' },
    { text: 'Error', value: 'Error' }
  ];

  /** @deprecated Use {@link ConnectionStatusOptions}. */
  public get connectionStatusOptions() {
    return this.ConnectionStatusOptions;
  }
  /** @deprecated Use {@link ConnectionStatusOptions}. */
  public set connectionStatusOptions(value) {
    this.ConnectionStatusOptions = value;
  }

  public ToolStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Deprecated', value: 'Deprecated' }
  ];

  /** @deprecated Use {@link ToolStatusOptions}. */
  public get toolStatusOptions() {
    return this.ToolStatusOptions;
  }
  /** @deprecated Use {@link ToolStatusOptions}. */
  public set toolStatusOptions(value) {
    this.ToolStatusOptions = value;
  }

  public LogStatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Success', value: 'Success' },
    { text: 'Error', value: 'Error' },
    { text: 'Running', value: 'Running' }
  ];

  /** @deprecated Use {@link LogStatusOptions}. */
  public get logStatusOptions() {
    return this.LogStatusOptions;
  }
  /** @deprecated Use {@link LogStatusOptions}. */
  public set logStatusOptions(value) {
    this.LogStatusOptions = value;
  }

  public OnFilterChange(): void {
    this.FiltersChange.emit(this.Filters);
  }

  /** @deprecated Use {@link OnFilterChange}. */
  public onFilterChange(): void {
    return this.OnFilterChange();
  }

  public OnSearchChange(value: string): void {
    this.Filters = { ...this.Filters, searchTerm: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(value: string): void {
    return this.OnSearchChange(value);
  }

  public OnServerStatusChange(value: string): void {
    this.Filters = { ...this.Filters, serverStatus: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnServerStatusChange}. */
  public onServerStatusChange(value: string): void {
    return this.OnServerStatusChange(value);
  }

  public OnConnectionStatusChange(value: string): void {
    this.Filters = { ...this.Filters, connectionStatus: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnConnectionStatusChange}. */
  public onConnectionStatusChange(value: string): void {
    return this.OnConnectionStatusChange(value);
  }

  public OnToolStatusChange(value: string): void {
    this.Filters = { ...this.Filters, toolStatus: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnToolStatusChange}. */
  public onToolStatusChange(value: string): void {
    return this.OnToolStatusChange(value);
  }

  public OnLogStatusChange(value: string): void {
    this.Filters = { ...this.Filters, logStatus: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnLogStatusChange}. */
  public onLogStatusChange(value: string): void {
    return this.OnLogStatusChange(value);
  }

  public OnToolsServerChange(value: string): void {
    this.Filters = { ...this.Filters, toolsServer: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnToolsServerChange}. */
  public onToolsServerChange(value: string): void {
    return this.OnToolsServerChange(value);
  }

  public OnToolsCategoryChange(value: string): void {
    this.Filters = { ...this.Filters, toolsCategory: value };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnToolsCategoryChange}. */
  public onToolsCategoryChange(value: string): void {
    return this.OnToolsCategoryChange(value);
  }

  public OnFavoritesOnlyChange(checked: boolean): void {
    this.Filters = { ...this.Filters, favoritesOnly: checked };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link OnFavoritesOnlyChange}. */
  public onFavoritesOnlyChange(checked: boolean): void {
    return this.OnFavoritesOnlyChange(checked);
  }

  public ResetAllFilters(): void {
    this.Filters = {
      searchTerm: '',
      serverStatus: 'all',
      connectionStatus: 'all',
      toolStatus: 'all',
      logStatus: 'all',
      toolsServer: 'all',
      toolsCategory: 'all',
      favoritesOnly: false
    };
    this.OnFilterChange();
  }

  /** @deprecated Use {@link ResetAllFilters}. */
  public resetAllFilters(): void {
    return this.ResetAllFilters();
  }

  /** Part 3.3 — count of non-default filter dimensions, used for "Filters (N)" badge */
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.Filters.searchTerm) n++;
    if (this.Filters.serverStatus && this.Filters.serverStatus !== 'all') n++;
    if (this.Filters.connectionStatus && this.Filters.connectionStatus !== 'all') n++;
    if (this.Filters.toolStatus && this.Filters.toolStatus !== 'all') n++;
    if (this.Filters.logStatus && this.Filters.logStatus !== 'all') n++;
    if (this.Filters.toolsServer && this.Filters.toolsServer !== 'all') n++;
    if (this.Filters.toolsCategory && this.Filters.toolsCategory !== 'all') n++;
    if (this.Filters.favoritesOnly) n++;
    return n;
  }

  /** @deprecated Use {@link ActiveFilterCount}. */
  public get activeFilterCount(): number {
    return this.ActiveFilterCount;
  }

  public ToggleFilterPanel(): void {
    this.ClosePanel.emit();
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  public get HasActiveFilters(): boolean {
    return this.Filters.searchTerm !== '' ||
           this.Filters.serverStatus !== 'all' ||
           this.Filters.connectionStatus !== 'all' ||
           this.Filters.toolStatus !== 'all' ||
           this.Filters.logStatus !== 'all';
  }

  /** @deprecated Use {@link HasActiveFilters}. */
  public get hasActiveFilters(): boolean {
    return this.HasActiveFilters;
  }

  public get CurrentStatusOptions(): { text: string; value: string }[] {
    switch (this.ActiveTab) {
      case 'servers':
        return this.ServerStatusOptions;
      case 'connections':
        return this.ConnectionStatusOptions;
      case 'tools':
        return this.ToolStatusOptions;
      case 'logs':
        return this.LogStatusOptions;
      default:
        return this.ServerStatusOptions;
    }
  }

  /** @deprecated Use {@link CurrentStatusOptions}. */
  public get currentStatusOptions(): { text: string; value: string }[] {
    return this.CurrentStatusOptions;
  }

  public get CurrentStatusValue(): string {
    switch (this.ActiveTab) {
      case 'servers':
        return this.Filters.serverStatus;
      case 'connections':
        return this.Filters.connectionStatus;
      case 'tools':
        return this.Filters.toolStatus;
      case 'logs':
        return this.Filters.logStatus;
      default:
        return 'all';
    }
  }

  /** @deprecated Use {@link CurrentStatusValue}. */
  public get currentStatusValue(): string {
    return this.CurrentStatusValue;
  }

  public OnCurrentStatusChange(value: string): void {
    switch (this.ActiveTab) {
      case 'servers':
        this.OnServerStatusChange(value);
        break;
      case 'connections':
        this.OnConnectionStatusChange(value);
        break;
      case 'tools':
        this.OnToolStatusChange(value);
        break;
      case 'logs':
        this.OnLogStatusChange(value);
        break;
    }
  }

  /** @deprecated Use {@link OnCurrentStatusChange}. */
  public onCurrentStatusChange(value: string): void {
    return this.OnCurrentStatusChange(value);
  }

  public GetTabLabel(): string {
    switch (this.ActiveTab) {
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

  /** @deprecated Use {@link GetTabLabel}. */
  public getTabLabel(): string {
    return this.GetTabLabel();
  }
}
