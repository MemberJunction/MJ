import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormControl } from '@angular/forms';
import { WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil, startWith } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { AIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIAgentEntityExtended } from "@memberjunction/ai-core-plus";

export interface SubAgentSelectorResult {
  selectedAgents: AIAgentEntityExtended[];
  createNew: boolean;
}

export interface SubAgentSelectorConfig {
  title: string;
  multiSelect: boolean;
  selectedAgentIds: string[];
  showCreateNew: boolean;
  parentAgentId: string; // To exclude from selection
}

export interface AgentDisplayItem extends AIAgentEntityExtended {
  selected: boolean;
  typeName?: string;
}

/**
 * Sub-Agent Selector Dialog for selecting agents to convert to sub-agents.
 * Only shows agents with NULL ParentID (root agents) that can become sub-agents.
 */
@Component({
  standalone: false,
  selector: 'mj-sub-agent-selector-dialog',
  templateUrl: './sub-agent-selector-dialog.component.html',
  styleUrls: ['./sub-agent-selector-dialog.component.css']
})
export class SubAgentSelectorDialogComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  config!: SubAgentSelectorConfig;
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public result = new Subject<SubAgentSelectorResult | null>();
  
  // Data streams
  allAgents$ = new BehaviorSubject<AgentDisplayItem[]>([]);
  agentTypes$ = new BehaviorSubject<AIAgentTypeEntity[]>([]);
  filteredAgents$ = new BehaviorSubject<AgentDisplayItem[]>([]);
  selectedAgents$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$ = new BehaviorSubject<boolean>(false);
  
  // UI state
  searchControl = new FormControl('');
  selectedTypeId$ = new BehaviorSubject<string>('all');
  
  // Computed values
  get selectedCount(): number {
    return this.selectedAgents$.value.size;
  }

  get totalAgentCount(): number {
    return this.allAgents$.value.length;
  }

  get filteredCount(): number {
    return this.filteredAgents$.value.length;
  }

  constructor(
    private dialogRef: WindowRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initializeData();
    this.setupFiltering();
    this.preselectExistingAgents();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async initializeData() {
    this.isLoading$.next(true);
    
    try {
      await this.loadAgentsAndTypes();
    } catch (error) {
      console.error('Error loading dialog data:', error);
    } finally {
      this.isLoading$.next(false);
    }
  }

  private async loadAgentsAndTypes() {
    const rv = new RunView();
    
    // Load both agents and types in a single batch for better performance
    const results = await rv.RunViews([
      // Root agents (index 0)
      {
        EntityName: 'AI Agents',
        ExtraFilter: `ParentID IS NULL AND ID != '${this.config.parentAgentId}' AND Status = 'Active' AND (ExposeAsAction = 0 OR ExposeAsAction IS NULL)`,
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      },
      // Agent types (index 1)
      {
        EntityName: 'MJ: AI Agent Types',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      }
    ]);

    // Process root agents (index 0)
    if (results[0].Success) {
      const agents: AgentDisplayItem[] = (results[0].Results || []).map(agent => ({
        ...agent.GetAll(),
        selected: false,
        typeName: agent.Type || 'Default'
      } as AgentDisplayItem));
      
      this.allAgents$.next(agents);
    }

    // Process agent types (index 1)
    if (results[1].Success) {
      this.agentTypes$.next(results[1].Results || []);
    }
  }

  private setupFiltering() {
    combineLatest([
      this.allAgents$,
      this.searchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        startWith('')
      ),
      this.selectedTypeId$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([agents, searchTerm, typeId]) => {
      this.filterAgents(agents, searchTerm || '', typeId);
    });
  }

  private filterAgents(agents: AgentDisplayItem[], searchTerm: string, typeId: string) {
    let filtered = [...agents];

    // Type filter
    if (typeId !== 'all') {
      filtered = filtered.filter(agent => agent.TypeID === typeId);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        (agent.Name && agent.Name.toLowerCase().includes(term)) ||
        (agent.Description && agent.Description.toLowerCase().includes(term)) ||
        (agent.typeName && agent.typeName.toLowerCase().includes(term))
      );
    }

    this.filteredAgents$.next(filtered);
  }

  private preselectExistingAgents() {
    if (this.config.selectedAgentIds.length > 0) {
      const selected = new Set(this.config.selectedAgentIds);
      this.selectedAgents$.next(selected);
      
      // Update agent selection state
      const agents = this.allAgents$.value;
      agents.forEach(agent => {
        agent.selected = selected.has(agent.ID);
      });
      this.allAgents$.next(agents);
    }
  }

  // === UI Event Handlers ===

  selectType(typeId: string) {
    this.selectedTypeId$.next(typeId);
  }

  toggleAgentSelection(agent: AgentDisplayItem) {
    const selected = this.selectedAgents$.value;
    const agents = this.allAgents$.value;
    
    // Find the agent and toggle its selection
    const agentToUpdate = agents.find(a => a.ID === agent.ID);
    if (agentToUpdate) {
      agentToUpdate.selected = !agentToUpdate.selected;
      
      if (agentToUpdate.selected) {
        if (!this.config.multiSelect) {
          // Single select mode - clear other selections
          selected.clear();
          agents.forEach(a => {
            if (a.ID !== agent.ID) {
              a.selected = false;
            }
          });
        }
        selected.add(agent.ID);
      } else {
        selected.delete(agent.ID);
      }
      
      this.selectedAgents$.next(new Set(selected));
      this.allAgents$.next(agents);
      
      // Update filtered agents to reflect selection state
      const filtered = this.filteredAgents$.value;
      const filteredAgent = filtered.find(a => a.ID === agent.ID);
      if (filteredAgent) {
        filteredAgent.selected = agentToUpdate.selected;
        this.filteredAgents$.next(filtered);
      }
    }
  }

  clearSearch() {
    this.searchControl.reset();
  }

  getAgentIcon(agent: AgentDisplayItem): string {
    if (agent.IconClass) {
      return agent.IconClass;
    }
    return 'fa-solid fa-robot';
  }

  getAgentStatusColor(agent: AgentDisplayItem): string {
    switch (agent.Status) {
      case 'Active': return '#28a745';
      case 'Disabled': return '#6c757d';
      case 'Pending': return '#ffc107';
      default: return '#6c757d';
    }
  }

  // === Dialog Actions ===

  cancel() {
    this.result.next(null);
    this.dialogRef.close();
  }

  createNew() {
    this.result.next({
      selectedAgents: [],
      createNew: true
    });
    this.dialogRef.close();
  }

  async addSelectedAgents() {
    const selectedIds = this.selectedAgents$.value;
    const allAgents = this.allAgents$.value;
    
    // Get the selected agent display items
    const selectedDisplayItems = allAgents
      .filter(agent => selectedIds.has(agent.ID));
    
    // Convert AgentDisplayItem to AIAgentEntityExtended by casting (they have the same structure)
    const selectedAgents: AIAgentEntityExtended[] = selectedDisplayItems.map(item => item as AIAgentEntityExtended);
    
    this.result.next({
      selectedAgents,
      createNew: false
    });
    this.dialogRef.close();
  }
}