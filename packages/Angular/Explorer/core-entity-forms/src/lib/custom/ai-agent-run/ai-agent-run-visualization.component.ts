import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
import { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJActionExecutionLogEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { TimelineItem } from './ai-agent-run-timeline.component';
import { AIAgentRunDataHelper } from './ai-agent-run-data.service';
import { UUIDsEqual } from '@memberjunction/global';

interface NodeData {
  step: MJAIAgentRunStepEntity;
  x: number;
  y: number;
  width: number;
  height: number;
  element?: SVGGElement;
}

interface ScopeData {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
  nodes: NodeData[];
  element?: SVGGElement;
}

@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-visualization',
  templateUrl: './ai-agent-run-visualization.component.html',
  styleUrls: ['./ai-agent-run-visualization.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AIAgentRunVisualizationComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('svgContainer', { static: false }) svgContainer!: ElementRef<HTMLDivElement>;
  @Input() aiAgentRunId!: string;
  @Input() dataHelper!: AIAgentRunDataHelper;
  
  private destroy$ = new Subject<void>();
  private viewInitialized = false;
  
  /** Track active timeouts for cleanup */
  private activeTimeouts: number[] = [];
  
  /** Remove timeout from tracking array */
  private removeTimeoutFromTracking(timeoutId: number): void {
    const index = this.activeTimeouts.indexOf(timeoutId);
    if (index > -1) {
      this.activeTimeouts.splice(index, 1);
    }
  }
  private pendingData: { steps: MJAIAgentRunStepEntity[], subRuns: MJAIAgentRunEntity[], actionLogs: MJActionExecutionLogEntity[], promptRuns: MJAIPromptRunEntity[] } | null = null;
  
  loading = false;  // Start with false so the container renders
  error: string | null = null;
  private dataLoading = false;  // Track data loading state from service
  
  selectedItem: TimelineItem | null = null;
  
  // Node management
  private nodes = new Map<string, NodeData>();
  private scopes = new Map<string, ScopeData>();
  private connections: Array<{from: string, to: string, path?: SVGPathElement}> = [];
  
  // Pan and zoom state
  panZoom = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isPanning: false,
    startX: 0,
    startY: 0
  };
  
  // Drag state
  private dragState: {
    isDragging: boolean;
    element: SVGGElement | null;
    nodeId: string | null;
    startX: number;
    startY: number;
    startTransform: { x: number; y: number };
    initialX?: number;
    initialY?: number;
  } = {
    isDragging: false,
    element: null,
    nodeId: null,
    startX: 0,
    startY: 0,
    startTransform: { x: 0, y: 0 }
  };
  
  // Pan state
  private panState = {
    isPanning: false,
    startX: 0,
    startY: 0,
    initialTranslateX: 0,
    initialTranslateY: 0
  };
  
  // Animation frame ID for cleanup
  private animationFrameId: number | null = null;
  
  // Bound event handlers for proper cleanup
  private boundOnWheel = this.onWheel.bind(this);
  private boundOnSvgMouseDown = this.onSvgMouseDown.bind(this);
  private boundOnSvgMouseMove = this.onSvgMouseMove.bind(this);
  private boundOnSvgMouseUp = this.onSvgMouseUp.bind(this);
  
  constructor(
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit() {
    if (this.aiAgentRunId) {
      // Subscribe to data from helper
      combineLatest([
        this.dataHelper.steps$,
        this.dataHelper.subRuns$,
        this.dataHelper.actionLogs$,
        this.dataHelper.promptRuns$,
        this.dataHelper.loading$
      ]).pipe(
        takeUntil(this.destroy$)
      ).subscribe(([steps, subRuns, actionLogs, promptRuns, loading]) => {
        this.dataLoading = loading;
        
        if (!loading && steps && steps.length > 0) {
          console.log('Visualization: Received data from service', {
            steps: steps.length,
            subRuns: subRuns.length,
            viewInitialized: this.viewInitialized
          });
          
          if (this.viewInitialized && this.svgContainer?.nativeElement) {
            // View is ready, build immediately
            this.buildVisualization(steps, subRuns, actionLogs, promptRuns);
          } else {
            // Store data for when view is ready
            console.log('View not ready, storing data for later');
            this.pendingData = { steps, subRuns, actionLogs, promptRuns };
          }
        } else if (!loading && (!steps || steps.length === 0)) {
          console.log('Visualization: No steps available');
          this.error = null;
        }
      });
      
      // Subscribe to error state
      this.dataHelper.error$.pipe(takeUntil(this.destroy$)).subscribe((error: string | null) => {
        if (error) {
          this.error = error;
          this.loading = false;
        }
      });
    } else {
      console.error('Visualization: No agent run ID provided');
      this.error = 'No agent run ID provided';
    }
  }
  
  ngAfterViewInit() {
    console.log('Visualization ngAfterViewInit');
    this.viewInitialized = true;
    
    // Initialize SVG
    if (this.svgContainer && this.svgContainer.nativeElement) {
      this.initializeSVG();
      
      // If we have pending data, process it now
      if (this.pendingData) {
        console.log('Processing pending data after view init');
        this.buildVisualization(
          this.pendingData.steps,
          this.pendingData.subRuns,
          this.pendingData.actionLogs,
          this.pendingData.promptRuns
        );
        this.pendingData = null;
      }
      
      this.cdr.detectChanges();
    } else {
      console.error('SVG container not found in ngAfterViewInit');
    }
  }
  
  ngOnDestroy() {
    // Signal all subscriptions to complete
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clear all active timeouts
    this.activeTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.length = 0;
    
    // Clean up document-level event listeners
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    
    // Clean up SVG and all its event listeners
    if (this.svgContainer?.nativeElement) {
      const svg = this.svgContainer.nativeElement.querySelector('svg');
      if (svg) {
        // Remove all SVG event listeners with bound handlers
        svg.removeEventListener('wheel', this.boundOnWheel);
        svg.removeEventListener('mousedown', this.boundOnSvgMouseDown);
        svg.removeEventListener('mousemove', this.boundOnSvgMouseMove);
        svg.removeEventListener('mouseup', this.boundOnSvgMouseUp);
        
        // Remove all node and scope event listeners
        // We can't remove specific listeners if we don't have references to them
        // The best approach is to clone and replace the elements, which removes all listeners
        svg.querySelectorAll('g[id^="node-"], g[id^="scope-"]').forEach(element => {
          const clone = element.cloneNode(true);
          element.parentNode?.replaceChild(clone, element);
        });
        
        // Remove expand button listeners
        svg.querySelectorAll('.expand-button').forEach(button => {
          const clone = button.cloneNode(true);
          button.parentNode?.replaceChild(clone, button);
        });
        
        // Clear all SVG content
        while (svg.firstChild) {
          svg.removeChild(svg.firstChild);
        }
      }
    }
    
    // Clear data structures
    this.nodes.clear();
    this.scopes.clear();
    this.connections = [];
    
    // Clear any pending animation frames
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Reset state
    this.dragState = {
      isDragging: false,
      element: null,
      nodeId: null,
      startX: 0,
      startY: 0,
      startTransform: { x: 0, y: 0 }
    };
    
    this.panState = {
      isPanning: false,
      startX: 0,
      startY: 0,
      initialTranslateX: 0,
      initialTranslateY: 0
    };
  }
  
  private initializeSVG() {
    const container = this.svgContainer?.nativeElement;
    if (!container) {
      console.error('SVG container element not found');
      return;
    }
    
    // Create SVG element if it doesn't exist
    let svg = container.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'visualization-svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      
      // Add event listeners with bound handlers
      svg.addEventListener('wheel', this.boundOnWheel);
      svg.addEventListener('mousedown', this.boundOnSvgMouseDown);
      svg.addEventListener('mousemove', this.boundOnSvgMouseMove);
      svg.addEventListener('mouseup', this.boundOnSvgMouseUp);
      
      container.appendChild(svg);
    }
    
    // Add arrow marker definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead-viz');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#4a90e2');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    
    console.log('SVG initialized successfully');
  }
  
  private async buildVisualization(
    steps: MJAIAgentRunStepEntity[],
    subRuns: MJAIAgentRunEntity[],
    actionLogs: MJActionExecutionLogEntity[],
    promptRuns: MJAIPromptRunEntity[]
  ) {
    console.log('buildVisualization called', { 
      steps: steps?.length || 0, 
      hasContainer: !!this.svgContainer,
      containerElement: this.svgContainer?.nativeElement
    });
    
    if (!this.svgContainer || !this.svgContainer.nativeElement) {
      console.error('SVG container not available');
      this.loading = false;
      this.error = 'Visualization container not ready';
      return;
    }
    
    // If no steps, show empty state
    if (!steps || steps.length === 0) {
      console.log('No steps to visualize');
      this.loading = false;
      this.error = null;
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    try {
      // Wait a tick for the view to be fully ready
      await new Promise(resolve => {
        const timeoutId = setTimeout(() => {
          this.removeTimeoutFromTracking(timeoutId);
          resolve(undefined);
        }, 0) as any as number;
        this.activeTimeouts.push(timeoutId);
      });
      
      // Clear existing elements
      this.clearVisualization();
      
      // Build nodes and scopes
      await this.buildNodesAndScopes(steps, subRuns, promptRuns);
      
      // Arrange layout
      this.arrangeLayout();
      
      // Draw connections
      this.drawConnections();
      
      // Fit to view
      this.fitToView();
      
      this.loading = false;
      console.log('Visualization built successfully');
      
      // Trigger change detection since we're using OnPush
      this.cdr.markForCheck();
    } catch (error) {
      this.error = 'Failed to build visualization';
      console.error('Visualization error:', error);
      this.loading = false;
      
      // Trigger change detection since we're using OnPush
      this.cdr.markForCheck();
    }
  }
  
  private clearVisualization() {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg');
    if (!svg) return;
    
    const mainGroup = svg.querySelector('.main-group');
    if (mainGroup) {
      // Remove all child elements except defs
      while (mainGroup.firstChild) {
        mainGroup.removeChild(mainGroup.firstChild);
      }
    }
    
    this.nodes.clear();
    this.scopes.clear();
    this.connections = [];
  }
  
  private async buildNodesAndScopes(
    steps: MJAIAgentRunStepEntity[],
    subRuns: MJAIAgentRunEntity[],
    promptRuns: MJAIPromptRunEntity[]
  ) {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg');
    if (!svg) return;
    
    let mainGroup = svg.querySelector('.main-group') as SVGGElement;
    if (!mainGroup) {
      mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      mainGroup.setAttribute('class', 'main-group');
      svg.appendChild(mainGroup);
    }
    
    // Create nodes for each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      if (step.StepType === 'Sub-Agent' && step.TargetLogID) {
        // Create a scope for sub-agent
        const subRun = subRuns.find(sr => UUIDsEqual(sr.ID, step.TargetLogID))
        const scopeElement = await this.createScopeElement(step, subRun);
        mainGroup.appendChild(scopeElement);
        
        const scope: ScopeData = {
          id: step.ID,
          name: subRun?.Agent || 'Sub-Agent',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          expanded: false,
          nodes: [],
          element: scopeElement
        };
        
        this.scopes.set(step.ID, scope);
      } else {
        // Create regular node
        const nodeElement = this.createNodeElement(step, promptRuns);
        mainGroup.appendChild(nodeElement);
        
        const nodeData: NodeData = {
          step: step,
          x: 0,
          y: 0,
          width: 180,
          height: 80,
          element: nodeElement
        };
        
        this.nodes.set(step.ID, nodeData);
      }
      
      // Add connection info
      if (i > 0) {
        this.connections.push({
          from: steps[i - 1].ID,
          to: step.ID
        });
      }
    }
  }
  
  private createNodeElement(step: MJAIAgentRunStepEntity, promptRuns: MJAIPromptRunEntity[]): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'step-node');
    g.setAttribute('data-step-id', step.ID);
    
    // Add event handlers
    g.addEventListener('click', (e) => this.onNodeClick(e, step));
    g.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, step.ID));
    g.style.cursor = 'pointer';
    
    const nodeWidth = 180;
    const nodeHeight = 80;
    
    // Background rectangle
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', nodeWidth.toString());
    rect.setAttribute('height', nodeHeight.toString());
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', 'white');
    rect.setAttribute('stroke', this.getStepColor(step));
    rect.setAttribute('stroke-width', '2');
    g.appendChild(rect);
    
    // Status indicator
    const statusCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    statusCircle.setAttribute('cx', '12');
    statusCircle.setAttribute('cy', '12');
    statusCircle.setAttribute('r', '6');
    statusCircle.setAttribute('fill', this.getStatusColor(step.Status));
    g.appendChild(statusCircle);
    
    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '35');
    icon.setAttribute('y', '20');
    icon.setAttribute('font-size', '18');
    icon.setAttribute('fill', this.getStepColor(step));
    icon.textContent = this.getStepEmoji(step.StepType);
    g.appendChild(icon);
    
    // Title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', '60');
    title.setAttribute('y', '20');
    title.setAttribute('font-size', '14');
    title.setAttribute('font-weight', '600');
    title.setAttribute('fill', '#2c3e50');
    title.textContent = this.truncateText(step.StepName || `Step ${step.StepNumber}`, 15);
    g.appendChild(title);
    
    // Step type
    const type = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    type.setAttribute('x', '12');
    type.setAttribute('y', '40');
    type.setAttribute('font-size', '12');
    type.setAttribute('fill', '#6c757d');
    type.textContent = step.StepType;
    g.appendChild(type);
    
    // Model info for prompts
    if (step.StepType === 'Prompt' && step.TargetLogID && promptRuns) {
      const promptRun = promptRuns.find(pr => UUIDsEqual(pr.ID, step.TargetLogID))
      if (promptRun) {
        const model = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        model.setAttribute('x', '12');
        model.setAttribute('y', '55');
        model.setAttribute('font-size', '11');
        model.setAttribute('fill', '#868e96');
        model.textContent = `${promptRun.Model || 'Unknown'}`;
        g.appendChild(model);
      }
    }
    
    // Duration
    if (step.CompletedAt) {
      const duration = this.calculateDuration(step.StartedAt, step.CompletedAt);
      const durationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      durationText.setAttribute('x', '12');
      durationText.setAttribute('y', '70');
      durationText.setAttribute('font-size', '11');
      durationText.setAttribute('fill', '#868e96');
      durationText.textContent = `⏱️ ${duration}`;
      g.appendChild(durationText);
    }
    
    return g;
  }
  
  private async createScopeElement(step: MJAIAgentRunStepEntity, subRun?: MJAIAgentRunEntity): Promise<SVGGElement> {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'scope-container');
    g.setAttribute('data-scope-id', step.ID);
    
    const scopeWidth = 300;
    const scopeHeight = 200;
    const headerHeight = 40;
    
    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', scopeWidth.toString());
    bg.setAttribute('height', scopeHeight.toString());
    bg.setAttribute('rx', '12');
    bg.setAttribute('fill', '#f8f9fa');
    bg.setAttribute('stroke', '#4a90e2');
    bg.setAttribute('stroke-width', '2');
    bg.setAttribute('stroke-dasharray', '5,5');
    g.appendChild(bg);
    
    // Header background
    const headerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerBg.setAttribute('width', scopeWidth.toString());
    headerBg.setAttribute('height', headerHeight.toString());
    headerBg.setAttribute('rx', '12');
    headerBg.setAttribute('fill', '#e3f2fd');
    g.appendChild(headerBg);
    
    // Fix bottom corners
    const headerFix = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerFix.setAttribute('y', (headerHeight - 12).toString());
    headerFix.setAttribute('width', scopeWidth.toString());
    headerFix.setAttribute('height', '12');
    headerFix.setAttribute('fill', '#e3f2fd');
    g.appendChild(headerFix);
    
    // Robot icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '12');
    icon.setAttribute('y', '26');
    icon.setAttribute('font-size', '20');
    icon.textContent = '🤖';
    g.appendChild(icon);
    
    // Title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', '40');
    title.setAttribute('y', '26');
    title.setAttribute('font-size', '14');
    title.setAttribute('font-weight', '600');
    title.setAttribute('fill', '#1976d2');
    title.textContent = subRun?.Agent || 'Sub-Agent';
    g.appendChild(title);
    
    // Expand/collapse button
    const expandBtn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    expandBtn.setAttribute('class', 'expand-button');
    expandBtn.style.cursor = 'pointer';
    expandBtn.setAttribute('transform', `translate(${scopeWidth - 30}, 10)`);
    
    const expandBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    expandBg.setAttribute('cx', '10');
    expandBg.setAttribute('cy', '10');
    expandBg.setAttribute('r', '10');
    expandBg.setAttribute('fill', 'white');
    expandBg.setAttribute('stroke', '#4a90e2');
    expandBtn.appendChild(expandBg);
    
    const expandIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    expandIcon.setAttribute('x', '10');
    expandIcon.setAttribute('y', '15');
    expandIcon.setAttribute('text-anchor', 'middle');
    expandIcon.setAttribute('font-size', '12');
    expandIcon.setAttribute('fill', '#4a90e2');
    expandIcon.textContent = '+';
    expandBtn.appendChild(expandIcon);
    
    expandBtn.addEventListener('click', (e) => this.onScopeExpandClick(e, step.ID));
    g.appendChild(expandBtn);
    
    // Click handler for scope
    g.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('.expand-button')) {
        this.onNodeClick(e, step);
      }
    });
    
    return g;
  }
  
  private arrangeLayout() {
    const nodeSpacingX = 250;
    const nodeSpacingY = 120;
    const startX = 50;
    const startY = 50;
    
    let currentY = startY;
    let index = 0;
    
    // Arrange nodes and scopes sequentially
    const allItems = [...this.nodes.values(), ...Array.from(this.scopes.values()).map(s => ({ 
      step: { ID: s.id } as MJAIAgentRunStepEntity, 
      x: 0, 
      y: 0, 
      width: s.width, 
      height: s.height 
    }))];
    
    // Sort by step number if available
    allItems.sort((a, b) => {
      const aStep = a.step as MJAIAgentRunStepEntity;
      const bStep = b.step as MJAIAgentRunStepEntity;
      return (aStep.StepNumber || 0) - (bStep.StepNumber || 0);
    });
    
    for (const item of allItems) {
      const nodeData = this.nodes.get(item.step.ID);
      const scopeData = this.scopes.get(item.step.ID);
      
      if (nodeData) {
        nodeData.x = startX;
        nodeData.y = currentY;
        
        if (nodeData.element) {
          nodeData.element.setAttribute('transform', `translate(${nodeData.x}, ${nodeData.y})`);
        }
        
        currentY += nodeSpacingY;
      } else if (scopeData) {
        scopeData.x = startX;
        scopeData.y = currentY;
        
        if (scopeData.element) {
          scopeData.element.setAttribute('transform', `translate(${scopeData.x}, ${scopeData.y})`);
        }
        
        currentY += scopeData.height + nodeSpacingY;
      }
    }
  }
  
  private drawConnections() {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg');
    if (!svg) return;
    
    const mainGroup = svg.querySelector('.main-group');
    if (!mainGroup) return;
    
    // Create connections group if not exists
    let connectionsGroup = mainGroup.querySelector('.connections-group') as SVGGElement;
    if (!connectionsGroup) {
      connectionsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      connectionsGroup.setAttribute('class', 'connections-group');
      mainGroup.insertBefore(connectionsGroup, mainGroup.firstChild);
    }
    
    // Clear existing connections
    while (connectionsGroup.firstChild) {
      connectionsGroup.removeChild(connectionsGroup.firstChild);
    }
    
    // Draw each connection
    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.from);
      const fromScope = this.scopes.get(conn.from);
      const toNode = this.nodes.get(conn.to);
      const toScope = this.scopes.get(conn.to);
      
      let fromX = 0, fromY = 0, toX = 0, toY = 0;
      
      if (fromNode) {
        fromX = fromNode.x + fromNode.width / 2;
        fromY = fromNode.y + fromNode.height;
      } else if (fromScope) {
        fromX = fromScope.x + fromScope.width / 2;
        fromY = fromScope.y + fromScope.height;
      }
      
      if (toNode) {
        toX = toNode.x + toNode.width / 2;
        toY = toNode.y;
      } else if (toScope) {
        toX = toScope.x + toScope.width / 2;
        toY = toScope.y;
      }
      
      if (fromX && fromY && toX && toY) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${fromX} ${fromY} L ${toX} ${toY}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#4a90e2');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('marker-end', 'url(#arrowhead-viz)');
        path.setAttribute('opacity', '0.6');
        
        connectionsGroup.appendChild(path);
        conn.path = path;
      }
    }
  }
  
  private fitToView() {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg') as SVGSVGElement;
    const mainGroup = svg?.querySelector('.main-group') as SVGGElement;
    if (!svg || !mainGroup) return;
    
    const bbox = mainGroup.getBBox();
    const padding = 50;
    
    const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`;
    svg.setAttribute('viewBox', viewBox);
  }
  
  private getStepColor(step: MJAIAgentRunStepEntity): string {
    const colorMap: Record<string, string> = {
      'Prompt': '#2196f3',
      'Actions': '#4caf50',
      'Sub-Agent': '#ff9800',
      'Tool': '#9c27b0',
      'Decision': '#f44336'
    };
    return colorMap[step.StepType] || '#757575';
  }
  
  private getStepEmoji(stepType: string): string {
    const emojiMap: Record<string, string> = {
      'Prompt': '💬',
      'Actions': '⚙️',
      'Sub-Agent': '🤖',
      'Tool': '🔧',
      'Decision': '🔀',
      'ForEach': '🔁',
      'While': '🔄'
    };
    return emojiMap[stepType] || '⚪';
  }
  
  private getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      'Running': '#1976d2',
      'Completed': '#388e3c',
      'Failed': '#d32f2f',
      'Cancelled': '#f57c00',
      'Paused': '#757575'
    };
    return colorMap[status] || '#9e9e9e';
  }
  
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
  
  private calculateDuration(start: Date, end?: Date | null): string {
    if (!end) return 'Running...';
    
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }
  
  // Event handlers
  private onNodeClick(event: MouseEvent, step: MJAIAgentRunStepEntity) {
    event.stopPropagation();
    
    // Create timeline item from step
    const item: TimelineItem = {
      id: step.ID,
      type: 'step',
      title: step.StepName || `Step ${step.StepNumber}`,
      subtitle: `Type: ${step.StepType}`,
      status: step.Status,
      startTime: step.StartedAt,
      endTime: step.CompletedAt || undefined,
      duration: this.calculateDuration(step.StartedAt, step.CompletedAt),
      icon: this.getStepIcon(step.StepType),
      color: this.getStatusColorName(step.Status),
      data: step,
      level: 0
    };
    
    this.selectedItem = item;
    this.cdr.detectChanges();
  }
  
  private getStepIcon(stepType: string): string {
    const iconMap: Record<string, string> = {
      'Prompt': 'fa-microchip',
      'Tool': 'fa-tools',
      'Sub-Agent': 'fa-robot',
      'Decision': 'fa-code-branch',
      'Actions': 'fa-cog',
      'ForEach': 'fa-repeat',
      'While': 'fa-rotate'
    };
    return iconMap[stepType] || 'fa-circle';
  }
  
  private getStatusColorName(status: string): string {
    const colorMap: Record<string, string> = {
      'Running': 'info',
      'Completed': 'success',
      'Failed': 'error',
      'Cancelled': 'warning',
      'Paused': 'secondary'
    };
    return colorMap[status] || 'secondary';
  }
  
  private async onScopeExpandClick(event: MouseEvent, scopeId: string) {
    event.stopPropagation();
    
    const scope = this.scopes.get(scopeId);
    if (!scope) return;
    
    scope.expanded = !scope.expanded;
    
    if (scope.expanded) {
      // Load sub-agent steps
      await this.loadScopeContents(scopeId);
    }
    
    // Update UI
    this.updateScopeVisual(scope);
    this.arrangeLayout();
    this.drawConnections();
  }
  
  private async loadScopeContents(scopeId: string) {
    const scope = this.scopes.get(scopeId);
    if (!scope) return;
    
    // Find the step
    const step = Array.from(this.nodes.values()).find(n => UUIDsEqual(n.step.ID, scopeId))?.step
      || Array.from(this.scopes.values()).find(s => s.id === scopeId);
    
    if (!step || !(step as any).TargetLogID) return;
    
    const targetLogId = (step as any).TargetLogID;
    
    try {
      // Load sub-agent data through service
      const data = await this.dataHelper.loadSubAgentData(targetLogId);
      
      if (data.steps && data.steps.length > 0) {
        // Create nodes from data
        this.createScopeNodes(scope, data.steps, data.promptRuns);
      }
    } catch (error) {
      console.error('Failed to load scope contents:', error);
    }
  }
  
  private createScopeNodes(scope: ScopeData, steps: MJAIAgentRunStepEntity[], promptRuns: MJAIPromptRunEntity[]) {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg');
    if (!svg) return;
    
    const mainGroup = svg.querySelector('.main-group');
    if (!mainGroup || !scope.element) return;
    
    // Create nodes inside scope
    const nodeSpacingY = 60;
    const startX = 20;
    const startY = 60;
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const nodeElement = this.createNodeElement(step, promptRuns);
      
      // Add node to scope group
      scope.element.appendChild(nodeElement);
      
      const nodeData: NodeData = {
        step: step,
        x: startX,
        y: startY + i * nodeSpacingY,
        width: 160,
        height: 60,
        element: nodeElement
      };
      
      nodeElement.setAttribute('transform', `translate(${nodeData.x}, ${nodeData.y})`);
      
      scope.nodes.push(nodeData);
      this.nodes.set(step.ID, nodeData);
    }
    
    // Update scope height
    scope.height = Math.max(200, startY + steps.length * nodeSpacingY + 20);
  }
  
  private updateScopeVisual(scope: ScopeData) {
    if (!scope.element) return;
    
    // Update background height
    const bg = scope.element.querySelector('rect');
    if (bg) {
      bg.setAttribute('height', scope.height.toString());
    }
    
    // Update expand button
    const expandIcon = scope.element.querySelector('.expand-button text');
    if (expandIcon) {
      expandIcon.textContent = scope.expanded ? '−' : '+';
    }
  }
  
  // Drag handling
  private onNodeMouseDown(event: MouseEvent, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    
    const node = this.nodes.get(nodeId);
    if (!node || !node.element) return;
    
    // Get current transform
    const transform = node.element.getAttribute('transform');
    const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    if (!match) return;
    
    // Get SVG coordinates
    const svg = node.element.ownerSVGElement;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    this.dragState = {
      isDragging: true,
      element: node.element,
      nodeId: nodeId,
      startX: svgP.x,
      startY: svgP.y,
      startTransform: {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      }
    };
    
    node.element.classList.add('dragging');
    
    // Add document-level event listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }
  
  private onMouseMove = (event: MouseEvent) => {
    if (!this.dragState.isDragging || !this.dragState.element) return;
    
    const svg = this.dragState.element.ownerSVGElement;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    const dx = svgP.x - this.dragState.startX;
    const dy = svgP.y - this.dragState.startY;
    
    const newX = this.dragState.startTransform.x + dx;
    const newY = this.dragState.startTransform.y + dy;
    
    // Update element position
    this.dragState.element.setAttribute('transform', `translate(${newX}, ${newY})`);
    
    // Update node data
    const node = this.nodes.get(this.dragState.nodeId!);
    if (node) {
      node.x = newX;
      node.y = newY;
    }
    
    // Update connections
    this.drawConnections();
  }
  
  private onMouseUp = (event: MouseEvent) => {
    if (!this.dragState.isDragging || !this.dragState.element) return;
    
    this.dragState.element.classList.remove('dragging');
    
    // Clean up
    this.dragState = {
      isDragging: false,
      element: null,
      nodeId: null,
      startX: 0,
      startY: 0,
      startTransform: { x: 0, y: 0 }
    };
    
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
  
  // Pan and zoom
  onWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.panZoom.scale = Math.max(0.3, Math.min(3, this.panZoom.scale * delta));
    this.updateTransform();
  }
  
  onSvgMouseDown(event: MouseEvent) {
    if (event.button === 0 && event.target === event.currentTarget) {
      this.panZoom.isPanning = true;
      this.panZoom.startX = event.clientX - this.panZoom.translateX;
      this.panZoom.startY = event.clientY - this.panZoom.translateY;
      event.preventDefault();
    }
  }
  
  onSvgMouseMove(event: MouseEvent) {
    if (this.panZoom.isPanning) {
      this.panZoom.translateX = event.clientX - this.panZoom.startX;
      this.panZoom.translateY = event.clientY - this.panZoom.startY;
      this.updateTransform();
    }
  }
  
  onSvgMouseUp(event: MouseEvent) {
    this.panZoom.isPanning = false;
  }
  
  private updateTransform() {
    const svg = this.svgContainer?.nativeElement?.querySelector('svg');
    if (svg) {
      const mainGroup = svg.querySelector('.main-group');
      if (mainGroup) {
        mainGroup.setAttribute('transform', 
          `translate(${this.panZoom.translateX}, ${this.panZoom.translateY}) scale(${this.panZoom.scale})`);
      }
    }
  }
  
  // Toolbar actions
  zoomIn() {
    this.panZoom.scale = Math.min(this.panZoom.scale * 1.2, 3);
    this.updateTransform();
  }
  
  zoomOut() {
    this.panZoom.scale = Math.max(this.panZoom.scale / 1.2, 0.3);
    this.updateTransform();
  }
  
  resetZoom() {
    this.panZoom.scale = 1;
    this.panZoom.translateX = 0;
    this.panZoom.translateY = 0;
    this.updateTransform();
  }
  
  // Detail pane handlers
  closeDetailPane() {
    this.selectedItem = null;
    this.cdr.detectChanges();
  }
  
  navigateToActionLog(logId: string) {
    // Emit event to parent component
    // Parent will handle navigation
  }
  
  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }
}