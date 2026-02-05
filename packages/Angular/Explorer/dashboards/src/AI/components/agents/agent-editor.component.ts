import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { CreateAgentService, CreateAgentResult } from '@memberjunction/ng-agents';
import { NavigationService } from '@memberjunction/ng-shared';
import * as d3 from 'd3';

interface AgentHierarchyNode {
  id: string;
  name: string;
  agent: AIAgentEntityExtended;
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
  selector: 'mj-agent-editor',
  templateUrl: './agent-editor.component.html',
  styleUrls: ['./agent-editor.component.css']
})
export class AgentEditorComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() agentId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() openAgent = new EventEmitter<string>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  @ViewChild('hierarchyChart', { static: false }) hierarchyChartRef!: ElementRef;

  public isLoading = false;
  public error: string | null = null;
  public currentAgent: AIAgentEntityExtended | null = null;
  public allAgents: AIAgentEntityExtended[] = [];
  public hierarchyData: AgentHierarchyNode | null = null;
  public selectedNode: AgentHierarchyNode | null = null;
  public agentPrompts: AgentPrompt[] = [];

  // Tab settings
  public activeTab: 'hierarchy' | 'prompts' | 'properties' = 'hierarchy';
  
  // Legacy layout settings (keeping for compatibility)
  public showHierarchy = true;
  public showPrompts = true;
  public showProperties = true;
  
  // D3 variables
  private svg: any;
  private g: any;
  private tree: any;
  private root: any;
  private zoom: any;

  constructor(
    private createAgentService: CreateAgentService,
    private navigationService: NavigationService
  ) {}

  ngOnInit(): void {
    if (this.agentId) {
      this.loadAgentData();
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

  public async loadAgentData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      // Load all agents to build hierarchy
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Agents',
        ExtraFilter: '',
        OrderBy: 'Name',
        MaxRows: 1000
      });

      this.allAgents = result.Results as AIAgentEntityExtended[];
      this.currentAgent = this.allAgents.find(a => a.ID === this.agentId) || null;

      if (this.currentAgent) {
        this.buildHierarchy();
        this.loadAgentPrompts();
        
        // Initialize chart after data is loaded
        setTimeout(() => {
          if (this.hierarchyChartRef) {
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

  private buildHierarchy(): void {
    if (!this.currentAgent) return;

    // Find the root of the hierarchy that contains our current agent
    const rootAgent = this.findRootAgent(this.currentAgent);
    
    this.hierarchyData = this.buildHierarchyTree(rootAgent);
    this.selectedNode = this.findNodeInHierarchy(this.hierarchyData, this.currentAgent.ID);
  }

  private findRootAgent(agent: AIAgentEntityExtended): AIAgentEntityExtended {
    let current = agent;
    while (current.ParentID) {
      const parent = this.allAgents.find(a => a.ID === current.ParentID);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  private buildHierarchyTree(agent: AIAgentEntityExtended): AgentHierarchyNode {
    const children = this.allAgents
      .filter(a => a.ParentID === agent.ID)
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
    if (!this.currentAgent) return;
    
    try {
      // This would load prompts associated with the agent
      // For now, using mock data structure
      this.agentPrompts = [
        { id: '1', name: 'System Prompt', content: 'Default system instructions...', type: 'system' },
        { id: '2', name: 'User Prompt', content: 'User interaction template...', type: 'user' }
      ];
    } catch (error) {
      console.error('Error loading agent prompts:', error);
    }
  }

  private initializeChart(): void {
    if (!this.hierarchyChartRef?.nativeElement) {
      return;
    }

    const container = this.hierarchyChartRef.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear any existing SVG
    d3.select(container).selectAll('*').remove();

    // Create SVG with zoom/pan functionality
    this.svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#fafafa')
      .style('border', '1px solid #e0e0e0');

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
    if (!this.hierarchyData || !this.g || !this.tree) {
      return;
    }

    // Create hierarchy
    this.root = d3.hierarchy(this.hierarchyData);
    this.tree(this.root);

    // Clear previous render
    this.g.selectAll('*').remove();

    // Get container dimensions
    const container = this.hierarchyChartRef.nativeElement;
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
      .on('click', (_event: any, d: any) => this.onNodeClick(d.data));

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
      .style('stroke-width', (d: any) => d.data.id === this.currentAgent?.ID ? '3px' : '2px')
      .style('opacity', 0.9);

    // Add node labels (agent names)
    nodes.append('text')
      .attr('dy', -2)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', (d: any) => d.data.id === this.currentAgent?.ID ? 'bold' : '500')
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
    const isCurrentAgent = d.data.id === this.currentAgent?.ID;
    
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
    const isCurrentAgent = d.data.id === this.currentAgent?.ID;
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

  public onNodeClick(node: AgentHierarchyNode): void {
    if (node.id !== this.currentAgent?.ID) {
      this.openAgent.emit(node.id);
    }
  }

  public zoomIn(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().call(
        this.zoom.scaleBy, 1.5
      );
    }
  }

  public zoomOut(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().call(
        this.zoom.scaleBy, 1 / 1.5
      );
    }
  }

  public resetZoom(): void {
    if (this.svg && this.zoom) {
      // Reset to initial centered position
      this.svg.transition().call(
        this.zoom.transform,
        d3.zoomIdentity
      );
    }
  }

  public navigateToAgent(agentId: string): void {
    this.openAgent.emit(agentId);
  }

  public closeEditor(): void {
    this.close.emit();
  }

  public setActiveTab(tab: 'hierarchy' | 'prompts' | 'properties'): void {
    this.activeTab = tab;
  }

  public getExecutionModeColor(mode: string): string {
    return mode === 'Sequential' ? '#2196f3' : '#4caf50';
  }

  public getExecutionModeIcon(mode: string): string {
    return mode === 'Sequential' ? 'fa-solid fa-list-ol' : 'fa-solid fa-layer-group';
  }

  /**
   * Opens the create sub-agent slide-in panel using the new CreateAgentService.
   * After successful creation, saves the agent and navigates to it.
   */
  public openCreateSubAgent(): void {
    if (!this.currentAgent) return;

    this.error = null;

    this.createAgentService.OpenSubAgentSlideIn(
      this.currentAgent.ID,
      this.currentAgent.Name || 'Agent'
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

  /**
   * Handles the result from the create agent slide-in.
   * Saves the agent and navigates to the new record.
   */
  private async handleAgentCreated(result: CreateAgentResult): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const agent = result.Agent;

      // Save the new agent
      const saveResult = await agent.Save();

      if (saveResult) {
        LogStatus('Sub-agent created successfully');

        // Save any linked prompts
        if (result.AgentPrompts && result.AgentPrompts.length > 0) {
          for (const agentPrompt of result.AgentPrompts) {
            // Update the AgentID now that the agent has been saved
            agentPrompt.AgentID = agent.ID;
            await agentPrompt.Save();
          }
        }

        // Save any linked actions
        if (result.AgentActions && result.AgentActions.length > 0) {
          for (const agentAction of result.AgentActions) {
            // Update the AgentID now that the agent has been saved
            agentAction.AgentID = agent.ID;
            await agentAction.Save();
          }
        }

        // Reload agent data to show the new hierarchy
        await this.loadAgentData();

        // Navigate to the newly created agent record
        this.navigationService.OpenEntityRecord('AI Agents', agent.PrimaryKey);
      } else {
        const errorMessage = agent.LatestResult?.Message || 'Unknown error occurred while creating sub-agent';
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

  public hasChildren(): boolean {
    return this.selectedNode?.children && this.selectedNode.children.length > 0 || false;
  }

  public hasParent(): boolean {
    return this.selectedNode?.parent !== undefined;
  }

  public getChildCount(): number {
    return this.selectedNode?.children?.length || 0;
  }

  public openCurrentAgentRecord(): void {
    if (this.currentAgent) {
      this.openEntityRecord.emit({ entityName: 'AI Agents', recordId: this.currentAgent.ID });
    }
  }
}