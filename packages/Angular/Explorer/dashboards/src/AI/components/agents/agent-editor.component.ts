import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { CreateAgentService, CreateAgentResult } from '@memberjunction/ng-agents';
import { NavigationService } from '@memberjunction/ng-shared';
import * as d3 from 'd3';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface AgentHierarchyNode {
  id: string;
  name: string;
  agent: MJAIAgentEntityExtended;
  children?: AgentHierarchyNode[];
  parent?: AgentHierarchyNode;
  x?: number;
  y?: number;
}

interface AgentPrompt {
  id: string;
  name: string;
  content: string;
  type: string;
}

@Component({
  standalone: false,
  selector: 'mj-agent-editor',
  templateUrl: './agent-editor.component.html',
  styleUrls: ['./agent-editor.component.css']
})
export class AgentEditorComponent extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() AgentId: string | null = null;

  /** @deprecated Use {@link AgentId}. */
  @Input() set agentId(value: string | null) {
    this.AgentId = value;
  }
  /** @deprecated Use {@link AgentId}. */
  get agentId(): string | null {
    return this.AgentId;
  }
  @Output() close = new EventEmitter<void>();
  @Output() OpenAgent = new EventEmitter<string>();

  /**
   * @deprecated Use {@link OpenAgent}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openAgent) keeps working. Must stay AFTER OpenAgent: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openAgent = this.OpenAgent;
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;

  @ViewChild('hierarchyChart', { static: false }) HierarchyChartRef!: ElementRef;

  /** @deprecated Use {@link HierarchyChartRef}. */
  get hierarchyChartRef(): ElementRef {
    return this.HierarchyChartRef;
  }
  /** @deprecated Use {@link HierarchyChartRef}. */
  set hierarchyChartRef(value: ElementRef) {
    this.HierarchyChartRef = value;
  }

  public isLoading = false;
  public error: string | null = null;
  public CurrentAgent: MJAIAgentEntityExtended | null = null;

  /** @deprecated Use {@link CurrentAgent}. */
  public get currentAgent(): MJAIAgentEntityExtended | null {
    return this.CurrentAgent;
  }
  /** @deprecated Use {@link CurrentAgent}. */
  public set currentAgent(value: MJAIAgentEntityExtended | null) {
    this.CurrentAgent = value;
  }
  public AllAgents: MJAIAgentEntityExtended[] = [];

  /** @deprecated Use {@link AllAgents}. */
  public get allAgents(): MJAIAgentEntityExtended[] {
    return this.AllAgents;
  }
  /** @deprecated Use {@link AllAgents}. */
  public set allAgents(value: MJAIAgentEntityExtended[]) {
    this.AllAgents = value;
  }
  public HierarchyData: AgentHierarchyNode | null = null;

  /** @deprecated Use {@link HierarchyData}. */
  public get hierarchyData(): AgentHierarchyNode | null {
    return this.HierarchyData;
  }
  /** @deprecated Use {@link HierarchyData}. */
  public set hierarchyData(value: AgentHierarchyNode | null) {
    this.HierarchyData = value;
  }
  public SelectedNode: AgentHierarchyNode | null = null;

  /** @deprecated Use {@link SelectedNode}. */
  public get selectedNode(): AgentHierarchyNode | null {
    return this.SelectedNode;
  }
  /** @deprecated Use {@link SelectedNode}. */
  public set selectedNode(value: AgentHierarchyNode | null) {
    this.SelectedNode = value;
  }
  public AgentPrompts: AgentPrompt[] = [];

  /** @deprecated Use {@link AgentPrompts}. */
  public get agentPrompts(): AgentPrompt[] {
    return this.AgentPrompts;
  }
  /** @deprecated Use {@link AgentPrompts}. */
  public set agentPrompts(value: AgentPrompt[]) {
    this.AgentPrompts = value;
  }

  // Tab settings
  public ActiveTab: 'hierarchy' | 'prompts' | 'properties' = 'hierarchy';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab(): 'hierarchy' | 'prompts' | 'properties' {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value: 'hierarchy' | 'prompts' | 'properties') {
    this.ActiveTab = value;
  }
  
  // Legacy layout settings (keeping for compatibility)
  public ShowHierarchy = true;

  /** @deprecated Use {@link ShowHierarchy}. */
  public get showHierarchy() {
    return this.ShowHierarchy;
  }
  /** @deprecated Use {@link ShowHierarchy}. */
  public set showHierarchy(value) {
    this.ShowHierarchy = value;
  }
  public ShowPrompts = true;

  /** @deprecated Use {@link ShowPrompts}. */
  public get showPrompts() {
    return this.ShowPrompts;
  }
  /** @deprecated Use {@link ShowPrompts}. */
  public set showPrompts(value) {
    this.ShowPrompts = value;
  }
  public ShowProperties = true;

  /** @deprecated Use {@link ShowProperties}. */
  public get showProperties() {
    return this.ShowProperties;
  }
  /** @deprecated Use {@link ShowProperties}. */
  public set showProperties(value) {
    this.ShowProperties = value;
  }
  
  // D3 variables
  private svg: any;
  private g: any;
  private tree: any;
  private root: any;
  private zoom: any;

  constructor(
    private navigationService: NavigationService,
    private createAgentService: CreateAgentService) { super(); }

  ngOnInit(): void {
    if (this.AgentId) {
      this.LoadAgentData();
    }
  }

  ngAfterViewInit(): void {
    // Chart initialization now happens after data loading in loadAgentData()
  }

  ngOnDestroy(): void {
    // Cleanup D3
    if (this.svg) {
      this.svg.remove();
    }
  }

  public async LoadAgentData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      // Load all agents to build hierarchy
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: '',
        OrderBy: 'Name',
        MaxRows: 1000
      });

      this.AllAgents = result.Results as MJAIAgentEntityExtended[];
      this.CurrentAgent = this.AllAgents.find(a => UUIDsEqual(a.ID, this.AgentId)) || null;

      if (this.CurrentAgent) {
        this.buildHierarchy();
        this.loadAgentPrompts();
        
        // Initialize chart after data is loaded
        setTimeout(() => {
          if (this.HierarchyChartRef) {
            this.initializeChart();
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error loading agent data:', error);
      this.error = 'Failed to load agent data';
    } finally {
      this.isLoading = false;
    }
  }

  /** @deprecated Use {@link LoadAgentData}. */
  public async loadAgentData(): Promise<void> {
    return this.LoadAgentData();
  }

  private buildHierarchy(): void {
    if (!this.CurrentAgent) return;

    // Find the root of the hierarchy that contains our current agent
    const rootAgent = this.findRootAgent(this.CurrentAgent);
    
    this.HierarchyData = this.buildHierarchyTree(rootAgent);
    this.SelectedNode = this.findNodeInHierarchy(this.HierarchyData, this.CurrentAgent.ID);
  }

  private findRootAgent(agent: MJAIAgentEntityExtended): MJAIAgentEntityExtended {
    let current = agent;
    while (current.ParentID) {
      const parent = this.AllAgents.find(a => UUIDsEqual(a.ID, current.ParentID));
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  private buildHierarchyTree(agent: MJAIAgentEntityExtended): AgentHierarchyNode {
    const children = this.AllAgents
      .filter(a => UUIDsEqual(a.ParentID, agent.ID))
      .map(child => this.buildHierarchyTree(child));

    const node: AgentHierarchyNode = {
      id: agent.ID,
      name: agent.Name || 'Unnamed Agent',
      agent: agent,
      children: children
    };

    // Set parent references
    if (node.children) {
      node.children.forEach(child => child.parent = node);
    }

    return node;
  }

  private findNodeInHierarchy(node: AgentHierarchyNode, agentId: string): AgentHierarchyNode | null {
    if (node.id === agentId) return node;
    
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeInHierarchy(child, agentId);
        if (found) return found;
      }
    }
    
    return null;
  }

  private async loadAgentPrompts(): Promise<void> {
    if (!this.CurrentAgent) return;
    
    try {
      // This would load prompts associated with the agent
      // For now, using mock data structure
      this.AgentPrompts = [
        { id: '1', name: 'System Prompt', content: 'Default system instructions...', type: 'system' },
        { id: '2', name: 'User Prompt', content: 'User interaction template...', type: 'user' }
      ];
    } catch (error) {
      console.error('Error loading agent prompts:', error);
    }
  }

  private initializeChart(): void {
    if (!this.HierarchyChartRef?.nativeElement) {
      return;
    }

    const container = this.HierarchyChartRef.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear any existing SVG
    d3.select(container).selectAll('*').remove();

    // Create SVG with zoom/pan functionality
    this.svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', 'var(--mj-bg-surface-card)')
      .style('border', '1px solid var(--mj-border-default)');

    // Create zoom behavior with wheel support
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .wheelDelta((event: any) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * (event.ctrlKey ? 10 : 1))
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    // Apply zoom to SVG
    this.svg.call(this.zoom);

    // Create main group for chart content
    this.g = this.svg.append('g');

    // Create tree layout with proper spacing - use nodeSize for fixed spacing
    this.tree = d3.tree()
      .nodeSize([150, 100]) // Fixed node spacing: 150px horizontal, 100px vertical
      .separation((a: any, b: any) => a.parent === b.parent ? 1 : 1.5);

    this.renderHierarchy();
  }

  private renderHierarchy(): void {
    if (!this.HierarchyData || !this.g || !this.tree) {
      return;
    }

    // Create hierarchy
    this.root = d3.hierarchy(this.HierarchyData);
    this.tree(this.root);

    // Clear previous render
    this.g.selectAll('*').remove();

    // Get container dimensions
    const container = this.HierarchyChartRef.nativeElement;
    const containerWidth = container.clientWidth || 800;
    
    // Calculate the tree bounds after layout
    const treeBounds = this.getTreeBounds(this.root);
    
    // Calculate centering offsets
    const offsetX = (containerWidth - treeBounds.width) / 2 - treeBounds.minX;
    const offsetY = 150; // Top margin for the tree
    
    // Apply transform to center the tree properly
    this.g.attr('transform', `translate(${offsetX}, ${offsetY})`);

    // Draw links
    this.g.selectAll('.link')
      .data(this.root.links())
      .enter().append('path')
      .attr('class', 'link')
      .attr('d', d3.linkVertical()
        .x((d: any) => d.x)
        .y((d: any) => d.y))
      .style('fill', 'none')
      .style('stroke', '#999')
      .style('stroke-width', '2px')
      .style('stroke-opacity', 0.6);

    // Draw nodes
    const nodes = this.g.selectAll('.node')
      .data(this.root.descendants())
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: any) => this.OnNodeClick(d.data));

    // Add rectangles for nodes
    const nodeWidth = 120;
    const nodeHeight = 40;
    
    nodes.append('rect')
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 6)
      .attr('ry', 6)
      .style('fill', (d: any) => this.getNodeColor(d))
      .style('stroke', (d: any) => this.getNodeStrokeColor(d))
      .style('stroke-width', (d: any) => d.data.id === this.CurrentAgent?.ID ? '3px' : '2px')
      .style('opacity', 0.9);

    // Add node labels (agent names)
    nodes.append('text')
      .attr('dy', -2)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', (d: any) => d.data.id === this.CurrentAgent?.ID ? 'bold' : '500')
      .style('fill', '#333')
      .style('pointer-events', 'none')
      .text((d: any) => {
        const name = d.data.name;
        return name.length > 14 ? name.substring(0, 11) + '...' : name;
      });

    // Add execution mode labels
    nodes.append('text')
      .attr('dy', 12)
      .attr('text-anchor', 'middle')
      .style('font-size', '9px')
      .style('fill', '#666')
      .style('pointer-events', 'none')
      .text((d: any) => d.data.agent.ExecutionMode);

    // Add level indicators
    nodes.append('text')
      .attr('x', nodeWidth / 2 - 8)
      .attr('y', -nodeHeight / 2 + 12)
      .attr('text-anchor', 'middle')
      .style('font-size', '8px')
      .style('font-weight', 'bold')
      .style('fill', '#fff')
      .style('pointer-events', 'none')
      .text((d: any) => `L${d.depth}`);
  }

  private getTreeBounds(root: any): { width: number, height: number, minX: number, maxX: number, minY: number, maxY: number } {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    root.descendants().forEach((d: any) => {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    });
    
    return {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      maxX,
      minY,
      maxY
    };
  }

  private getNodeColor(d: any): string {
    const level = d.depth;
    const isCurrentAgent = d.data.id === this.CurrentAgent?.ID;
    
    // Level-based color scheme
    const levelColors = [
      '#1976d2', // Level 0 (root) - Blue
      '#388e3c', // Level 1 - Green  
      '#f57c00', // Level 2 - Orange
      '#7b1fa2', // Level 3 - Purple
      '#c2185b', // Level 4 - Pink
      '#5d4037'  // Level 5+ - Brown
    ];
    
    const baseColor = levelColors[Math.min(level, levelColors.length - 1)];
    
    // Highlight current agent with brighter color
    if (isCurrentAgent) {
      return baseColor;
    }
    
    // Make non-current agents slightly lighter
    return this.lightenColor(baseColor, 0.3);
  }

  private getNodeStrokeColor(d: any): string {
    const isCurrentAgent = d.data.id === this.CurrentAgent?.ID;
    if (isCurrentAgent) {
      return '#000';
    }
    return '#666';
  }

  private lightenColor(color: string, factor: number): string {
    // Simple color lightening function
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    
    const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
    const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
    const newB = Math.min(255, Math.floor(b + (255 - b) * factor));
    
    return `rgb(${newR}, ${newG}, ${newB})`;
  }

  public OnNodeClick(node: AgentHierarchyNode): void {
    if (node.id !== this.CurrentAgent?.ID) {
      this.OpenAgent.emit(node.id);
    }
  }

  /** @deprecated Use {@link OnNodeClick}. */
  public onNodeClick(node: AgentHierarchyNode): void {
    return this.OnNodeClick(node);
  }

  public ZoomIn(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().call(
        this.zoom.scaleBy, 1.5
      );
    }
  }

  /** @deprecated Use {@link ZoomIn}. */
  public zoomIn(): void {
    return this.ZoomIn();
  }

  public ZoomOut(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().call(
        this.zoom.scaleBy, 1 / 1.5
      );
    }
  }

  /** @deprecated Use {@link ZoomOut}. */
  public zoomOut(): void {
    return this.ZoomOut();
  }

  public ResetZoom(): void {
    if (this.svg && this.zoom) {
      // Reset to initial centered position
      this.svg.transition().call(
        this.zoom.transform,
        d3.zoomIdentity
      );
    }
  }

  /** @deprecated Use {@link ResetZoom}. */
  public resetZoom(): void {
    return this.ResetZoom();
  }

  public NavigateToAgent(agentId: string): void {
    this.OpenAgent.emit(agentId);
  }

  /** @deprecated Use {@link NavigateToAgent}. */
  public navigateToAgent(agentId: string): void {
    return this.NavigateToAgent(agentId);
  }

  public CloseEditor(): void {
    this.close.emit();
  }

  /** @deprecated Use {@link CloseEditor}. */
  public closeEditor(): void {
    return this.CloseEditor();
  }

  public SetActiveTab(tab: 'hierarchy' | 'prompts' | 'properties'): void {
    this.ActiveTab = tab;
  }

  /** @deprecated Use {@link SetActiveTab}. */
  public setActiveTab(tab: 'hierarchy' | 'prompts' | 'properties'): void {
    return this.SetActiveTab(tab);
  }

  public GetExecutionModeColor(mode: string): string {
    return mode === 'Sequential' ? '#2196f3' : '#4caf50';
  }

  /** @deprecated Use {@link GetExecutionModeColor}. */
  public getExecutionModeColor(mode: string): string {
    return this.GetExecutionModeColor(mode);
  }

  public GetExecutionModeIcon(mode: string): string {
    return mode === 'Sequential' ? 'fa-solid fa-list-ol' : 'fa-solid fa-layer-group';
  }

  /** @deprecated Use {@link GetExecutionModeIcon}. */
  public getExecutionModeIcon(mode: string): string {
    return this.GetExecutionModeIcon(mode);
  }

  /**
   * Opens the create sub-agent slide-in panel using the new CreateAgentService.
   * After successful creation, saves the agent and navigates to it.
   */
  public OpenCreateSubAgent(): void {
    if (!this.CurrentAgent) return;

    this.error = null;

    this.createAgentService.OpenSubAgentSlideIn(
      this.CurrentAgent.ID,
      this.CurrentAgent.Name || 'Agent'
    ).subscribe({
      next: async (dialogResult) => {
        if (!dialogResult.Cancelled && dialogResult.Result) {
          await this.handleAgentCreated(dialogResult.Result);
        }
      },
      error: (err) => {
        console.error('Error in create sub-agent slide-in:', err);
        this.error = 'Failed to open create sub-agent panel';
      }
    });
  }

  /** @deprecated Use {@link OpenCreateSubAgent}. */
  public openCreateSubAgent(): void {
    return this.OpenCreateSubAgent();
  }

  /**
   * Handles the result from the create agent slide-in.
   * Saves the agent and navigates to the new record.
   */
  private async handleAgentCreated(result: CreateAgentResult): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const agent = result.Agent;

      // Create the agent and all of its linked prompts/actions in one atomic transaction.
      // agent.ID is assigned client-side by NewRecord() so we can use it on child records before submit.
      const md = this.ProviderToUse;
      const tg = await md.CreateTransactionGroup();

      agent.TransactionGroup = tg;
      await agent.Save();

      if (result.AgentPrompts && result.AgentPrompts.length > 0) {
        for (const agentPrompt of result.AgentPrompts) {
          agentPrompt.AgentID = agent.ID;
          agentPrompt.TransactionGroup = tg;
          await agentPrompt.Save();
        }
      }

      if (result.AgentActions && result.AgentActions.length > 0) {
        for (const agentAction of result.AgentActions) {
          agentAction.AgentID = agent.ID;
          agentAction.TransactionGroup = tg;
          await agentAction.Save();
        }
      }

      if (await tg.Submit()) {
        LogStatus('Sub-agent created successfully');

        // Reload agent data to show the new hierarchy
        await this.LoadAgentData();

        // Navigate to the newly created agent record
        this.navigationService.OpenEntityRecord('MJ: AI Agents', agent.PrimaryKey);
      } else {
        const errorMessage = agent.LatestResult?.CompleteMessage || 'Unknown error occurred while creating sub-agent';
        this.error = `Failed to create sub-agent: ${errorMessage}`;
        LogError('Sub-agent creation failed', undefined, errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      this.error = `Failed to create sub-agent: ${errorMessage}`;
      LogError('Error creating sub-agent', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }

  public HasChildren(): boolean {
    return this.SelectedNode?.children && this.SelectedNode.children.length > 0 || false;
  }

  /** @deprecated Use {@link HasChildren}. */
  public hasChildren(): boolean {
    return this.HasChildren();
  }

  public HasParent(): boolean {
    return this.SelectedNode?.parent !== undefined;
  }

  /** @deprecated Use {@link HasParent}. */
  public hasParent(): boolean {
    return this.HasParent();
  }

  public GetChildCount(): number {
    return this.SelectedNode?.children?.length || 0;
  }

  /** @deprecated Use {@link GetChildCount}. */
  public getChildCount(): number {
    return this.GetChildCount();
  }

  public OpenCurrentAgentRecord(): void {
    if (this.CurrentAgent) {
      this.OpenEntityRecord.emit({ entityName: 'MJ: AI Agents', recordId: this.CurrentAgent.ID });
    }
  }

  /** @deprecated Use {@link OpenCurrentAgentRecord}. */
  public openCurrentAgentRecord(): void {
    return this.OpenCurrentAgentRecord();
  }
}