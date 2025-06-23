import { Component, Output, EventEmitter, OnInit, OnDestroy, Input, ViewContainerRef } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { NewAgentDialogService } from '@memberjunction/ng-core-entity-forms';

interface AgentFilter {
  searchTerm: string;
  agentType: string;
  parentAgent: string;
  status: string;
  executionMode: string;
  exposeAsAction: string;
}

@Component({
  selector: 'app-agent-configuration',
  templateUrl: './agent-configuration.component.html',
  styleUrls: ['./agent-configuration.component.scss']
})
export class AgentConfigurationComponent implements OnInit, OnDestroy {
  @Input() initialState: any = null;
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
    agentType: 'all',
    parentAgent: 'all',
    status: 'all',
    executionMode: 'all',
    exposeAsAction: 'all'
  };

  public selectedAgentForTest: AIAgentEntity | null = null;

  constructor(
    private newAgentDialogService: NewAgentDialogService,
    private viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit(): void {
    if (this.initialState) {
      this.applyInitialState(this.initialState);
    }
    this.loadAgents();
  }

  ngOnDestroy(): void {
    // Clean up if needed
  }

  private applyInitialState(state: any): void {
    if (state.filterPanelVisible !== undefined) {
      this.filterPanelVisible = state.filterPanelVisible;
    }
    if (state.viewMode) {
      this.viewMode = state.viewMode;
    }
    if (state.expandedAgentId) {
      this.expandedAgentId = state.expandedAgentId;
    }
    if (state.currentFilters) {
      this.currentFilters = { ...this.currentFilters, ...state.currentFilters };
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      this.isLoading = true;
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: '',
        OrderBy: 'Name',
        MaxRows: 1000,
        ResultType: 'entity_object'
      });
      
      this.agents = result.Results || [];
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
      agentType: 'all',
      parentAgent: 'all',
      status: 'all',
      executionMode: 'all',
      exposeAsAction: 'all'
    };
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.agents];

    // Apply search filter (name contains)
    if (this.currentFilters.searchTerm) {
      const searchTerm = this.currentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(agent => 
        (agent.Name || '').toLowerCase().includes(searchTerm) ||
        (agent.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply agent type filter
    if (this.currentFilters.agentType !== 'all') {
      filtered = filtered.filter(agent => agent.TypeID === this.currentFilters.agentType);
    }

    // Apply parent agent filter
    if (this.currentFilters.parentAgent !== 'all') {
      if (this.currentFilters.parentAgent === 'none') {
        filtered = filtered.filter(agent => !agent.ParentID);
      } else {
        filtered = filtered.filter(agent => agent.ParentID === this.currentFilters.parentAgent);
      }
    }

    // Apply status filter
    if (this.currentFilters.status !== 'all') {
      const wantActive = this.currentFilters.status === 'active';
      if (wantActive) {
        filtered = filtered.filter(agent => agent.Status === 'Active');
      } else {
        filtered = filtered.filter(agent => agent.Status !== 'Active');
      }
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
      viewMode: this.viewMode,
      expandedAgentId: this.expandedAgentId,
      currentFilters: this.currentFilters,
      agentCount: this.filteredAgents.length
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
    this.newAgentDialogService.openForNewAgent(this.viewContainerRef).subscribe(result => {
      if (result.action === 'created' && result.agent) {
        // Reload the agents list to show the new agent
        this.loadAgents();
      }
    });
  }

  public runAgent(agent: AIAgentEntity): void {
    this.selectedAgentForTest = agent;
  }

  public closeTestHarness(): void {
    this.selectedAgentForTest = null;
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