import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import * as d3 from 'd3';

interface AgentHierarchyNode {
  id: string;
  name: string;
  agent: AIAgentEntity;
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
  styleUrls: ['./agent-editor.component.scss']
})
export class AgentEditorComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() agentId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() openAgent = new EventEmitter<string>();

  @ViewChild('hierarchyChart', { static: false }) hierarchyChartRef!: ElementRef;

  public isLoading = false;
  public error: string | null = null;
  public currentAgent: AIAgentEntity | null = null;
  public allAgents: AIAgentEntity[] = [];
  public hierarchyData: AgentHierarchyNode | null = null;
  public selectedNode: AgentHierarchyNode | null = null;
  public agentPrompts: AgentPrompt[] = [];

  // Tab settings
  public activeTab: 'hierarchy' | 'prompts' | 'properties' = 'hierarchy';
  
  // Legacy layout settings (keeping for compatibility)
  public showHierarchy = true;
  public showPrompts = true;
  public showProperties = true;
  
  // Sub-agent creation
  public showCreateSubAgent = false;
  public newSubAgentName = '';
  public newSubAgentDescription = '';

  // D3 variables
  private svg: any;
  private g: any;
  private tree: any;
  private root: any;

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

      this.allAgents = result.Results as AIAgentEntity[];
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

    console.log('Building hierarchy for agent:', this.currentAgent.Name, 'ID:', this.currentAgent.ID);
    console.log('All agents:', this.allAgents.length);

    // Find the root of the hierarchy that contains our current agent
    const rootAgent = this.findRootAgent(this.currentAgent);
    console.log('Root agent found:', rootAgent.Name);
    
    this.hierarchyData = this.buildHierarchyTree(rootAgent);
    this.selectedNode = this.findNodeInHierarchy(this.hierarchyData, this.currentAgent.ID);
    
    console.log('Hierarchy data:', this.hierarchyData);
    console.log('Selected node:', this.selectedNode);
  }

  private findRootAgent(agent: AIAgentEntity): AIAgentEntity {
    let current = agent;
    while (current.ParentID) {
      const parent = this.allAgents.find(a => a.ID === current.ParentID);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  private buildHierarchyTree(agent: AIAgentEntity): AgentHierarchyNode {
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
      console.log('No hierarchy chart ref available');
      return;
    }

    const container = this.hierarchyChartRef.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    console.log('Initializing chart with dimensions:', width, 'x', height);

    // Clear any existing SVG
    d3.select(container).selectAll('*').remove();

    this.svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#fafafa');

    this.g = this.svg.append('g')
      .attr('transform', `translate(${width / 2}, 50)`);

    // Create tree layout
    this.tree = d3.tree()
      .size([width - 100, height - 100])
      .separation((a: any, b: any) => a.parent === b.parent ? 1 : 2);

    console.log('Chart initialized, rendering hierarchy...');
    this.renderHierarchy();
  }

  private renderHierarchy(): void {
    if (!this.hierarchyData || !this.g || !this.tree) {
      console.log('Cannot render hierarchy:', {
        hierarchyData: !!this.hierarchyData,
        g: !!this.g,
        tree: !!this.tree
      });
      return;
    }

    console.log('Rendering hierarchy with data:', this.hierarchyData);

    // Create hierarchy
    this.root = d3.hierarchy(this.hierarchyData);
    this.tree(this.root);

    // Clear previous render
    this.g.selectAll('*').remove();

    // Draw links
    const links = this.g.selectAll('.link')
      .data(this.root.links())
      .enter().append('path')
      .attr('class', 'link')
      .attr('d', d3.linkVertical()
        .x((d: any) => d.x)
        .y((d: any) => d.y))
      .style('fill', 'none')
      .style('stroke', '#ccc')
      .style('stroke-width', '2px');

    // Draw nodes
    const nodes = this.g.selectAll('.node')
      .data(this.root.descendants())
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (event: any, d: any) => this.onNodeClick(d.data));

    // Add circles for nodes
    nodes.append('circle')
      .attr('r', (d: any) => d.data.id === this.currentAgent?.ID ? 12 : 8)
      .style('fill', (d: any) => {
        if (d.data.id === this.currentAgent?.ID) return '#2196f3';
        if (d.data.agent.ExposeAsAction) return '#4caf50';
        return '#fff';
      })
      .style('stroke', (d: any) => d.data.id === this.currentAgent?.ID ? '#1976d2' : '#ccc')
      .style('stroke-width', '2px');

    // Add labels
    nodes.append('text')
      .attr('dy', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', (d: any) => d.data.id === this.currentAgent?.ID ? 'bold' : 'normal')
      .text((d: any) => {
        const name = d.data.name;
        return name.length > 15 ? name.substring(0, 12) + '...' : name;
      });

    // Add execution mode indicators
    nodes.append('text')
      .attr('dy', -15)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#666')
      .text((d: any) => d.data.agent.ExecutionMode.charAt(0));
  }

  public onNodeClick(node: AgentHierarchyNode): void {
    if (node.id !== this.currentAgent?.ID) {
      this.openAgent.emit(node.id);
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

  public openCreateSubAgent(): void {
    this.showCreateSubAgent = true;
    this.newSubAgentName = '';
    this.newSubAgentDescription = '';
    this.error = null;
  }

  public closeCreateSubAgent(): void {
    this.showCreateSubAgent = false;
    this.newSubAgentName = '';
    this.newSubAgentDescription = '';
  }

  public async createSubAgent(): Promise<void> {
    if (!this.currentAgent || !this.newSubAgentName.trim()) return;

    try {
      this.isLoading = true;
      this.error = null;

      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      // Create new AI Agent entity
      const newAgent = await md.GetEntityObject<AIAgentEntity>('AI Agents', md.CurrentUser);
      
      // Set agent properties
      newAgent.Name = this.newSubAgentName.trim();
      newAgent.Description = this.newSubAgentDescription.trim() || '';
      newAgent.ParentID = this.currentAgent.ID;
      
      // Set default values based on parent agent
      newAgent.ExecutionMode = this.currentAgent.ExecutionMode || 'Sequential';
      newAgent.ExecutionOrder = 1; // Default to 1, could be made configurable
      newAgent.ExposeAsAction = false; // Default to false for sub-agents
      newAgent.EnableContextCompression = this.currentAgent.EnableContextCompression || false;
      newAgent.ContextCompressionMessageThreshold = this.currentAgent.ContextCompressionMessageThreshold || 10;
      newAgent.ContextCompressionMessageRetentionCount = this.currentAgent.ContextCompressionMessageRetentionCount || 5;

      // Save the new agent
      const result = await newAgent.Save();
      
      if (result) {
        LogStatus('Sub-agent created successfully');
        
        // Close the dialog
        this.closeCreateSubAgent();
        
        // Reload agent data to show the new hierarchy
        await this.loadAgentData();
        
        // Navigate to the newly created agent
        this.openAgent.emit(newAgent.ID);
      } else {
        // Handle save failure
        const errorMessage = newAgent.LatestResult?.Message || 'Unknown error occurred while creating sub-agent';
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
}