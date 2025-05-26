import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';

interface AgentFilter {
  searchTerm: string;
  executionMode: string;
  exposeAsAction: string;
}

@Component({
  selector: 'mj-agent-filter-panel',
  templateUrl: './agent-filter-panel.component.html',
  styleUrls: ['./agent-filter-panel.component.scss']
})
export class AgentFilterPanelComponent implements OnInit {
  @Input() agents: AIAgentEntity[] = [];
  @Input() filteredAgents: AIAgentEntity[] = [];
  @Input() filters: AgentFilter = {
    searchTerm: '',
    executionMode: 'all',
    exposeAsAction: 'all'
  };

  @Output() filtersChange = new EventEmitter<AgentFilter>();
  @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  public executionModeOptions = [
    { text: 'All Execution Modes', value: 'all' },
    { text: 'Sequential', value: 'Sequential' },
    { text: 'Parallel', value: 'Parallel' }
  ];

  public exposeAsActionOptions = [
    { text: 'All Agents', value: 'all' },
    { text: 'Exposed as Action', value: 'true' },
    { text: 'Not Exposed', value: 'false' }
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