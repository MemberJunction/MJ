import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { TreeBranchConfig } from '@memberjunction/ng-trees';

interface AgentFilter {
  searchTerm: string;
  agentType: string;
  parentAgent: string;
  status: string;
  executionMode: string;
  exposeAsAction: string;
  categoryId: string;
}

@Component({
  standalone: false,
  selector: 'mj-agent-filter-panel',
  templateUrl: './agent-filter-panel.component.html',
  styleUrls: ['./agent-filter-panel.component.css']
})
export class AgentFilterPanelComponent implements OnInit {
  @Input() agents: MJAIAgentEntityExtended[] = [];
  @Input() filteredAgents: MJAIAgentEntityExtended[] = [];
  @Input() filters: AgentFilter = {
    searchTerm: '',
    agentType: 'all',
    parentAgent: 'all',
    status: 'all',
    executionMode: 'all',
    exposeAsAction: 'all',
    categoryId: 'all'
  };

  @Output() filtersChange = new EventEmitter<AgentFilter>();
  @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  public agentTypeOptions: { text: string; value: string }[] = [
    { text: 'All Types', value: 'all' }
  ];

  public parentAgentOptions: { text: string; value: string }[] = [
    { text: 'All Agents', value: 'all' },
    { text: 'No Parent', value: 'none' }
  ];

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'active' },
    { text: 'Inactive', value: 'inactive' }
  ];

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

  /** TreeDropdown configuration for agent categories */
  public CategoryBranchConfig: TreeBranchConfig = {
    EntityName: 'MJ: AI Agent Categories',
    DisplayField: 'Name',
    ParentIDField: 'ParentID',
    DefaultIcon: 'fa-solid fa-folder',
    OrderBy: 'Name ASC',
    DescriptionField: 'Description'
  };

  /** Current category selection for the tree dropdown */
  public SelectedCategoryKey: CompositeKey | null = null;

  async ngOnInit(): Promise<void> {
    // Load agent types from AIEngineBase
    try {
      const aiEngine = AIEngineBase.Instance;
      if (!aiEngine.Loaded) {
        await aiEngine.Config();
      }
      
      // Add agent types to options
      const agentTypes = aiEngine.AgentTypes;
      agentTypes.forEach((type: MJAIAgentTypeEntity) => {
        this.agentTypeOptions.push({
          text: type.Name,
          value: type.ID
        });
      });

      // Add parent agents to options (only those without parents themselves)
      const parentAgents = this.agents.filter(agent => !agent.ParentID);
      parentAgents.forEach(agent => {
        this.parentAgentOptions.push({
          text: agent.Name || 'Unnamed Agent',
          value: agent.ID
        });
      });
    } catch (error) {
      console.error('Error loading agent metadata:', error);
    }
  }

  public onFilterChange(): void {
    this.filtersChange.emit(this.filters);
    this.filterChange.emit();
  }

  public onCategoryChange(value: CompositeKey | CompositeKey[] | null): void {
    if (value && !Array.isArray(value)) {
      const idValue = value.KeyValuePairs?.find(kv => kv.FieldName === 'ID')?.Value;
      this.filters.categoryId = idValue ?? 'all';
    } else {
      this.filters.categoryId = 'all';
    }
    this.SelectedCategoryKey = Array.isArray(value) ? null : value;
    this.onFilterChange();
  }

  public resetAllFilters(): void {
    this.resetFilters.emit();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }
}