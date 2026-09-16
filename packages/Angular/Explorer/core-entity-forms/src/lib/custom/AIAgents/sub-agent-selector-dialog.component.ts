import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil, startWith } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface SubAgentSelectorResult {
  SelectedAgents: MJAIAgentEntityExtended[];
  CreateNew: boolean;
}

export interface SubAgentSelectorConfig {
  Title: string;
  MultiSelect: boolean;
  SelectedAgentIds: string[];
  ShowCreateNew: boolean;
  ParentAgentId: string; // To exclude from selection
}

export interface AgentDisplayItem extends MJAIAgentEntityExtended {
  Selected: boolean;
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
export class SubAgentSelectorDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  config!: SubAgentSelectorConfig;
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public Result = new Subject<SubAgentSelectorResult | null>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Data streams
  AllAgents$ = new BehaviorSubject<AgentDisplayItem[]>([]);

  /** @deprecated Use {@link AllAgents$}. */
  get allAgents$() {
    return this.AllAgents$;
  }
  /** @deprecated Use {@link AllAgents$}. */
  set allAgents$(value) {
    this.AllAgents$ = value;
  }
  AgentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);

  /** @deprecated Use {@link AgentTypes$}. */
  get agentTypes$() {
    return this.AgentTypes$;
  }
  /** @deprecated Use {@link AgentTypes$}. */
  set agentTypes$(value) {
    this.AgentTypes$ = value;
  }
  FilteredAgents$ = new BehaviorSubject<AgentDisplayItem[]>([]);

  /** @deprecated Use {@link FilteredAgents$}. */
  get filteredAgents$() {
    return this.FilteredAgents$;
  }
  /** @deprecated Use {@link FilteredAgents$}. */
  set filteredAgents$(value) {
    this.FilteredAgents$ = value;
  }
  SelectedAgents$ = new BehaviorSubject<Set<string>>(new Set());

  /** @deprecated Use {@link SelectedAgents$}. */
  get selectedAgents$() {
    return this.SelectedAgents$;
  }
  /** @deprecated Use {@link SelectedAgents$}. */
  set selectedAgents$(value) {
    this.SelectedAgents$ = value;
  }
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
  }
  
  // UI state
  SearchControl = new FormControl('');

  /** @deprecated Use {@link SearchControl}. */
  get searchControl() {
    return this.SearchControl;
  }
  /** @deprecated Use {@link SearchControl}. */
  set searchControl(value) {
    this.SearchControl = value;
  }
  SelectedTypeId$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedTypeId$}. */
  get selectedTypeId$() {
    return this.SelectedTypeId$;
  }
  /** @deprecated Use {@link SelectedTypeId$}. */
  set selectedTypeId$(value) {
    this.SelectedTypeId$ = value;
  }
  
  // Computed values
  get SelectedCount(): number {
    return this.SelectedAgents$.value.size;
  }

  /** @deprecated Use {@link SelectedCount}. */
  get selectedCount(): number {
    return this.SelectedCount;
  }

  get TotalAgentCount(): number {
    return this.AllAgents$.value.length;
  }

  /** @deprecated Use {@link TotalAgentCount}. */
  get totalAgentCount(): number {
    return this.TotalAgentCount;
  }

  get FilteredCount(): number {
    return this.FilteredAgents$.value.length;
  }

  /** @deprecated Use {@link FilteredCount}. */
  get filteredCount(): number {
    return this.FilteredCount;
  }

  /** True when the empty list is the result of search/type filtering (vs. no eligible agents at all). */
  get IsAgentListNarrowed(): boolean {
    return this.TotalAgentCount > 0;
  }

  /** Supporting copy for the no-agents empty state. */
  get NoAgentsMessage(): string {
    return this.IsAgentListNarrowed
      ? 'Try adjusting your search criteria or selecting a different agent type.'
      : 'No eligible root agents are available to become sub-agents.';
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef
  ) {
    super();}

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
    this.IsLoading$.next(true);
    
    try {
      await this.loadAgentsAndTypes();
    } catch (error) {
      console.error('Error loading dialog data:', error);
    } finally {
      this.IsLoading$.next(false);
    }
  }

  private async loadAgentsAndTypes() {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    
    // Load both agents and types in a single batch for better performance
    const results = await rv.RunViews([
      // Root agents (index 0)
      {
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `ParentID IS NULL AND ID != '${this.config.ParentAgentId}' AND Status = 'Active' AND (ExposeAsAction = 0 OR ExposeAsAction IS NULL)`,
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
        Selected: false,
        typeName: agent.Type || 'Default'
      } as AgentDisplayItem));
      
      this.AllAgents$.next(agents);
    }

    // Process agent types (index 1)
    if (results[1].Success) {
      this.AgentTypes$.next(results[1].Results || []);
    }
  }

  private setupFiltering() {
    combineLatest([
      this.AllAgents$,
      this.SearchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        startWith('')
      ),
      this.SelectedTypeId$
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
      filtered = filtered.filter(agent => UUIDsEqual(agent.TypeID, typeId));
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

    this.FilteredAgents$.next(filtered);
  }

  private preselectExistingAgents() {
    if (this.config.SelectedAgentIds.length > 0) {
      const selected = new Set(this.config.SelectedAgentIds);
      this.SelectedAgents$.next(selected);
      
      // Update agent selection state
      const agents = this.AllAgents$.value;
      agents.forEach(agent => {
        agent.Selected = selected.has(agent.ID);
      });
      this.AllAgents$.next(agents);
    }
  }

  // === UI Event Handlers ===

  SelectType(typeId: string) {
    this.SelectedTypeId$.next(typeId);
  }

  /** @deprecated Use {@link SelectType}. */
  selectType(typeId: string) {
    return this.SelectType(typeId);
  }

  ToggleAgentSelection(agent: AgentDisplayItem) {
    const selected = this.SelectedAgents$.value;
    const agents = this.AllAgents$.value;
    
    // Find the agent and toggle its selection
    const agentToUpdate = agents.find(a => UUIDsEqual(a.ID, agent.ID));
    if (agentToUpdate) {
      agentToUpdate.Selected = !agentToUpdate.Selected;
      
      if (agentToUpdate.Selected) {
        if (!this.config.MultiSelect) {
          // Single select mode - clear other selections
          selected.clear();
          agents.forEach(a => {
            if (!UUIDsEqual(a.ID, agent.ID)) {
              a.Selected = false;
            }
          });
        }
        selected.add(agent.ID);
      } else {
        selected.delete(agent.ID);
      }
      
      this.SelectedAgents$.next(new Set(selected));
      this.AllAgents$.next(agents);
      
      // Update filtered agents to reflect selection state
      const filtered = this.FilteredAgents$.value;
      const filteredAgent = filtered.find(a => UUIDsEqual(a.ID, agent.ID));
      if (filteredAgent) {
        filteredAgent.Selected = agentToUpdate.Selected;
        this.FilteredAgents$.next(filtered);
      }
    }
  }

  /** @deprecated Use {@link ToggleAgentSelection}. */
  toggleAgentSelection(agent: AgentDisplayItem) {
    return this.ToggleAgentSelection(agent);
  }

  ClearSearch() {
    this.SearchControl.reset();
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch() {
    return this.ClearSearch();
  }

  /**
   * Backs the no-results empty-state "Clear Filters" CTA. Unlike clearSearch (the
   * inline search-box X, which must only clear the search), this resets every
   * dimension the list narrows on — search AND the agent-type filter — so the CTA
   * actually returns results instead of appearing to do nothing.
   */
  ClearFilters() {
    this.SearchControl.reset();
    this.SelectedTypeId$.next('all');
  }

  /** @deprecated Use {@link ClearFilters}. */
  clearFilters() {
    return this.ClearFilters();
  }

  GetAgentIcon(agent: AgentDisplayItem): string {
    if (agent.IconClass) {
      return agent.IconClass;
    }
    return 'fa-solid fa-robot';
  }

  /** @deprecated Use {@link GetAgentIcon}. */
  getAgentIcon(agent: AgentDisplayItem): string {
    return this.GetAgentIcon(agent);
  }

  GetAgentStatusColor(agent: AgentDisplayItem): string {
    switch (agent.Status) {
      case 'Active': return 'var(--mj-status-success)';
      case 'Disabled': return 'var(--mj-text-muted)';
      case 'Pending': return 'var(--mj-status-warning)';
      default: return 'var(--mj-text-muted)';
    }
  }

  /** @deprecated Use {@link GetAgentStatusColor}. */
  getAgentStatusColor(agent: AgentDisplayItem): string {
    return this.GetAgentStatusColor(agent);
  }

  // === Dialog Actions ===

  cancel() {
    this.Result.next(null);
    this.DialogClose.emit();
  }

  CreateNew() {
    this.Result.next({
      SelectedAgents: [],
      CreateNew: true
    });
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link CreateNew}. */
  createNew() {
    return this.CreateNew();
  }

  async AddSelectedAgents() {
    const selectedIds = this.SelectedAgents$.value;
    const allAgents = this.AllAgents$.value;
    
    // Get the selected agent display items
    const selectedDisplayItems = allAgents
      .filter(agent => selectedIds.has(agent.ID));
    
    // Convert AgentDisplayItem to MJAIAgentEntityExtended by casting (they have the same structure)
    const selectedAgents: MJAIAgentEntityExtended[] = selectedDisplayItems.map(item => item as MJAIAgentEntityExtended);
    
    this.Result.next({
      SelectedAgents: selectedAgents,
      CreateNew: false
    });
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link AddSelectedAgents}. */
  async addSelectedAgents() {
    return this.AddSelectedAgents();
  }
}