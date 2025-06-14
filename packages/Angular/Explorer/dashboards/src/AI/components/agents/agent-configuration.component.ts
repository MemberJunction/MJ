import { Component, Output, EventEmitter, OnInit, Inject, Optional } from '@angular/core';
import { RunView, CompositeKey } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';

interface AgentFilter {
  searchTerm: string;
  executionMode: string;
  exposeAsAction: string;
}

@Component({
  selector: 'app-agent-configuration',
  templateUrl: './agent-configuration.component.html',
  styleUrls: ['./agent-configuration.component.scss']
})
export class AgentConfigurationComponent implements OnInit {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();
  @Output() stateChange = new EventEmitter<any>();

  public isLoading = false;
  public filterPanelVisible = true;
  public viewMode: 'grid' | 'list' = 'grid';
  public expandedAgentId: string | null = null;
  
  public agents: AIAgentEntity[] = [];
  public filteredAgents: AIAgentEntity[] = [];
  
  public currentFilters: AgentFilter = {
    searchTerm: '',
    executionMode: 'all',
    exposeAsAction: 'all'
  };

  constructor() {}

  ngOnInit(): void {
    this.loadAgents();
  }

  private async loadAgents(): Promise<void> {
    try {
      this.isLoading = true;
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Agents',
        ExtraFilter: '',
        OrderBy: 'Name',
        MaxRows: 1000
      });
      
      this.agents = result.Results as AIAgentEntity[];
      this.filteredAgents = [...this.agents];
    } catch (error) {
      console.error('Error loading AI agents:', error);
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

  public onFiltersChange(filters: AgentFilter): void {
    this.currentFilters = { ...filters };
    this.applyFilters();
  }

  public onFilterChange(): void {
    this.applyFilters();
  }

  public onResetFilters(): void {
    this.currentFilters = {
      searchTerm: '',
      executionMode: 'all',
      exposeAsAction: 'all'
    };
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.agents];

    // Apply search filter
    if (this.currentFilters.searchTerm) {
      const searchTerm = this.currentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(agent => 
        (agent.Name || '').toLowerCase().includes(searchTerm) ||
        (agent.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply execution mode filter
    if (this.currentFilters.executionMode !== 'all') {
      filtered = filtered.filter(agent => agent.ExecutionMode === this.currentFilters.executionMode);
    }

    // Apply expose as action filter
    if (this.currentFilters.exposeAsAction !== 'all') {
      const isExposed = this.currentFilters.exposeAsAction === 'true';
      filtered = filtered.filter(agent => agent.ExposeAsAction === isExposed);
    }

    this.filteredAgents = filtered;
  }

  private emitStateChange(): void {
    const state = {
      filterPanelVisible: this.filterPanelVisible,
      filters: this.currentFilters
    };
    this.stateChange.emit(state);
  }

  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    this.emitStateChange();
  }

  public toggleAgentExpansion(agentId: string): void {
    this.expandedAgentId = this.expandedAgentId === agentId ? null : agentId;
  }

  public openAgentRecord(agentId: string): void {
    this.openEntityRecord.emit({ entityName: 'AI Agents', recordId: agentId });
  }

  public createNewAgent(): void {
    // Emit event to open a new agent form
    const compositeKey = new CompositeKey([]);
    this.openEntityRecord.emit({ entityName: 'AI Agents', recordId: '' });
  }

  public async runAgent(agent: AIAgentEntity): Promise<void> {
    // Emit event to open test harness for the agent
    this.openEntityRecord.emit({ entityName: 'AI Agents', recordId: agent.ID });
  }

  public getAgentIconColor(agent: AIAgentEntity): string {
    // Generate a consistent color based on agent properties
    const colors = ['#17a2b8', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#007bff'];
    const index = (agent.Name?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  }

  public onOpenRecord(entityName: string, recordId: string): void {
    this.openEntityRecord.emit({ entityName: entityName, recordId: recordId });
  }

  public getExecutionModeColor(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'info';
      case 'Parallel': return 'success';
      default: return 'info';
    }
  }

  public getExecutionModeIcon(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'fa-solid fa-list-ol';
      case 'Parallel': return 'fa-solid fa-layer-group';
      default: return 'fa-solid fa-robot';
    }
  }

}