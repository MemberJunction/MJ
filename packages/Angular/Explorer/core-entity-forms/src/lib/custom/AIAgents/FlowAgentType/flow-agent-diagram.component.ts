import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'mj-flow-agent-diagram',
  template: `
    <div class="flow-diagram-container">
      @if (loading) {
        <div class="loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Loading flow diagram...</span>
        </div>
      } @else if (error) {
        <div class="error-state">
          <i class="fa-solid fa-exclamation-triangle"></i>
          <span>{{ error }}</span>
        </div>
      } @else if (!steps || steps.length === 0) {
        <div class="empty-state">
          <i class="fa-solid fa-info-circle"></i>
          <span>No workflow steps to display</span>
        </div>
      } @else {
        <div class="rete-container" #reteContainer>
          <svg class="rete-svg" width="100%" height="100%"></svg>
        </div>
      }
    </div>
  `,
  styles: [`
    .flow-diagram-container {
      width: 100%;
      height: 600px;
      position: relative;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .rete-container {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: auto;
    }
    
    .rete-svg {
      min-width: 100%;
      min-height: 100%;
    }
    
    .loading-state, .error-state, .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 0.5rem;
      color: #666;
    }
    
    .error-state {
      color: #c00;
    }
    
    .empty-state {
      flex-direction: column;
    }
    
    .empty-state i {
      font-size: 2rem;
      opacity: 0.5;
    }
    
    :host ::ng-deep .step-node {
      cursor: move;
    }
    
    :host ::ng-deep .step-node.dragging {
      opacity: 0.8;
    }
    
    :host ::ng-deep .step-node-title {
      font-family: Arial, sans-serif;
    }
    
    :host ::ng-deep .connection-path {
      cursor: pointer;
    }
    
    :host ::ng-deep .connection-path:hover {
      stroke-width: 3;
    }
  `]
})
export class FlowAgentDiagramComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @ViewChild('reteContainer', { static: false }) reteContainer!: ElementRef<HTMLDivElement>;
  
  @Input() agentId: string | null = null;
  @Input() steps: AIAgentStepEntity[] = [];
  @Input() paths: AIAgentStepPathEntity[] = [];
  
  loading = true;
  error: string | null = null;
  
  private destroy$ = new Subject<void>();
  private nodeElements = new Map<string, SVGGElement>();
  private connectionElements = new Map<string, SVGGElement>();
  private positionChanges$ = new Subject<{ stepId: string, x: number, y: number }>();
  private dragState: {
    isDragging: boolean;
    element: SVGGElement | null;
    stepId: string | null;
    startX: number;
    startY: number;
    startTransform: { x: number; y: number };
  } = {
    isDragging: false,
    element: null,
    stepId: null,
    startX: 0,
    startY: 0,
    startTransform: { x: 0, y: 0 }
  };
  
  ngOnInit() {
    // Initial setup will happen in ngAfterViewInit when container is ready
    
    // Subscribe to position changes with debounce
    this.positionChanges$.pipe(
      debounceTime(500), // Save after 500ms of no movement
      takeUntil(this.destroy$)
    ).subscribe(change => {
      this.saveStepPosition(change.stepId, change.x, change.y);
    });
  }
  
  ngAfterViewInit() {
    // Defer initialization to ensure container is ready
    setTimeout(() => {
      this.initializeDiagram();
    }, 0);
  }
  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['steps'] || changes['paths']) {
      // Initialize diagram when data is provided or changes
      if (this.reteContainer) {
        this.initializeDiagram();
      } else {
        // If container not ready yet, just update loading state
        this.loading = false;
      }
    }
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanup();
    
    // Clean up any active drag state
    if (this.dragState.isDragging) {
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUp);
    }
  }
  
  private async initializeDiagram() {
    if (!this.reteContainer) {
      this.loading = false;
      return;
    }
    
    // If no steps, just show empty state
    if (!this.steps || this.steps.length === 0) {
      this.loading = false;
      this.error = null;
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    try {
      // Clean up previous instance if exists
      this.cleanup();
      
      // Get the SVG element
      const container = this.reteContainer.nativeElement;
      const svg = container.querySelector('svg');
      
      if (!svg) {
        throw new Error('SVG element not found');
      }
      
      // Clear the SVG
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }
      
      // Create defs for arrow markers
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrowhead');
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
      
      // Create main group for zoom/pan
      const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      svg.appendChild(mainGroup);
      
      // Create nodes and connections
      await this.createNodesAndConnections(mainGroup);
      
      // Auto-arrange nodes
      await this.arrangeNodes();
      
      // Fit to view
      this.fitToView(svg, mainGroup);
      
      this.loading = false;
    } catch (error) {
      console.error('Error initializing flow diagram:', error);
      this.error = 'Failed to initialize flow diagram';
      this.loading = false;
    }
  }
  
  private createNodeElement(step: AIAgentStepEntity): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'step-node');
    g.setAttribute('data-step-id', step.ID);
    
    // Add drag event handlers
    g.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, step.ID));
    g.style.cursor = 'move';
    
    const nodeWidth = 140;
    const nodeHeight = 80;
    const headerHeight = 35; // Increased from 30 for better text margin
    
    // Create rectangle background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', nodeWidth.toString());
    rect.setAttribute('height', nodeHeight.toString());
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', step.StartingStep ? '#f0fff4' : 'white');
    rect.setAttribute('stroke', step.StartingStep ? '#28a745' : '#4a90e2');
    rect.setAttribute('stroke-width', '2');
    g.appendChild(rect);
    
    // Create title background
    const titleBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    titleBg.setAttribute('width', nodeWidth.toString());
    titleBg.setAttribute('height', headerHeight.toString());
    titleBg.setAttribute('rx', '6');
    titleBg.setAttribute('fill', step.StartingStep ? '#28a745' : '#4a90e2');
    g.appendChild(titleBg);
    
    // Fix bottom corners of title background
    const titleFix = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    titleFix.setAttribute('y', (headerHeight - 6).toString());
    titleFix.setAttribute('width', nodeWidth.toString());
    titleFix.setAttribute('height', '6');
    titleFix.setAttribute('fill', step.StartingStep ? '#28a745' : '#4a90e2');
    g.appendChild(titleFix);
    
    // Create title text with text wrapping
    const titleWords = (step.Name || 'Unnamed Step').split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxCharsPerLine = 18;
    
    for (const word of titleWords) {
      if ((currentLine + word).length > maxCharsPerLine && currentLine) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }
    if (currentLine) lines.push(currentLine.trim());
    
    // Add icon for step type or starting step
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', '15');
    iconText.setAttribute('y', (headerHeight / 2 + 5).toString());
    iconText.setAttribute('fill', 'white');
    iconText.setAttribute('font-size', '16');
    iconText.setAttribute('font-family', 'Font Awesome 6 Free');
    iconText.setAttribute('font-weight', '900');
    
    if (step.StartingStep) {
      iconText.textContent = '\uf135'; // fa-rocket
    } else if (step.StepType === 'Action') {
      iconText.textContent = '\uf085'; // fa-cogs
    } else if (step.StepType === 'Sub-Agent') {
      iconText.textContent = '\uf544'; // fa-robot
    } else if (step.StepType === 'Prompt') {
      iconText.textContent = '\uf075'; // fa-comment
    } else {
      iconText.textContent = '\uf111'; // fa-circle (default)
    }
    g.appendChild(iconText);
    
    // Render title lines (shifted right to accommodate icon)
    const lineHeight = 12;
    const startY = headerHeight / 2 - (lines.length - 1) * lineHeight / 2 + 2; // Added 2px margin
    lines.forEach((line, index) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', ((nodeWidth / 2) + 10).toString()); // Shifted right for icon
      text.setAttribute('y', (startY + index * lineHeight).toString());
      text.setAttribute('fill', 'white');
      text.setAttribute('font-weight', '600');
      text.setAttribute('font-size', '11');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'step-node-title');
      text.textContent = line;
      g.appendChild(text);
    });
    
    // Add step type if available
    if (step.StepType) {
      const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      typeText.setAttribute('x', (nodeWidth / 2).toString());
      typeText.setAttribute('y', (headerHeight + 20).toString());
      typeText.setAttribute('fill', '#666');
      typeText.setAttribute('font-size', '10');
      typeText.setAttribute('text-anchor', 'middle');
      typeText.textContent = step.StepType;
      g.appendChild(typeText);
    }
    
    // Add status if not active
    if (step.Status && step.Status !== 'Active') {
      const statusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      statusText.setAttribute('x', (nodeWidth / 2).toString());
      statusText.setAttribute('y', (headerHeight + 35).toString());
      statusText.setAttribute('fill', step.Status === 'Disabled' ? '#c00' : '#f57c00');
      statusText.setAttribute('font-size', '10');
      statusText.setAttribute('text-anchor', 'middle');
      statusText.textContent = `[${step.Status}]`;
      g.appendChild(statusText);
    }
    
    // Add sockets
    const socketY = nodeHeight / 2;
    
    if (!step.StartingStep) {
      // Input socket
      const inputSocket = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      inputSocket.setAttribute('cx', '0');
      inputSocket.setAttribute('cy', socketY.toString());
      inputSocket.setAttribute('r', '5');
      inputSocket.setAttribute('fill', 'white');
      inputSocket.setAttribute('stroke', '#4a90e2');
      inputSocket.setAttribute('stroke-width', '2');
      g.appendChild(inputSocket);
    }
    
    // Add multiple output sockets for different conditions
    const paths = this.paths.filter(p => p.OriginStepID === step.ID);
    if (paths.length > 1) {
      // Multiple outputs - distribute them vertically
      const spacing = Math.min(20, (nodeHeight - 20) / (paths.length - 1));
      const startY = socketY - (paths.length - 1) * spacing / 2;
      
      paths.forEach((path, index) => {
        const outputSocket = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        outputSocket.setAttribute('cx', nodeWidth.toString());
        outputSocket.setAttribute('cy', (startY + index * spacing).toString());
        outputSocket.setAttribute('r', '5');
        outputSocket.setAttribute('fill', 'white');
        outputSocket.setAttribute('stroke', '#4a90e2');
        outputSocket.setAttribute('stroke-width', '2');
        outputSocket.setAttribute('data-path-id', path.ID);
        g.appendChild(outputSocket);
      });
    } else {
      // Single output socket
      const outputSocket = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outputSocket.setAttribute('cx', nodeWidth.toString());
      outputSocket.setAttribute('cy', socketY.toString());
      outputSocket.setAttribute('r', '5');
      outputSocket.setAttribute('fill', 'white');
      outputSocket.setAttribute('stroke', '#4a90e2');
      outputSocket.setAttribute('stroke-width', '2');
      g.appendChild(outputSocket);
    }
    
    return g;
  }
  
  private createConnectionElement(fromPos: {x: number, y: number}, toPos: {x: number, y: number}, pathData?: AIAgentStepPathEntity): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'connection-group');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // Calculate control points for a nice curve
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const cx1 = fromPos.x + dx * 0.5;
    const cy1 = fromPos.y;
    const cx2 = toPos.x - dx * 0.5;
    const cy2 = toPos.y;
    
    const d = `M ${fromPos.x} ${fromPos.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toPos.x} ${toPos.y}`;
    
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#4a90e2');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('class', 'connection-path');
    g.appendChild(path);
    
    // Add condition label if present
    if (pathData?.Condition) {
      const midX = (fromPos.x + toPos.x) / 2;
      const midY = (fromPos.y + toPos.y) / 2;
      
      // Truncate condition text if too long
      const maxConditionLength = 100;
      const conditionText = pathData.Condition.length > maxConditionLength 
        ? pathData.Condition.substring(0, maxConditionLength - 3) + '...'
        : pathData.Condition;
      
      // Measure text width (approximate)
      const charWidth = 6;
      const padding = 10;
      const textWidth = conditionText.length * charWidth + padding * 2;
      const rectWidth = Math.min(textWidth, 200); // Max width 200px
      
      // Background rect for better readability
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', (midX - rectWidth / 2).toString());
      bgRect.setAttribute('y', (midY - 10).toString());
      bgRect.setAttribute('width', rectWidth.toString());
      bgRect.setAttribute('height', '20');
      bgRect.setAttribute('fill', 'white');
      bgRect.setAttribute('stroke', '#4a90e2');
      bgRect.setAttribute('stroke-width', '1');
      bgRect.setAttribute('rx', '3');
      bgRect.setAttribute('opacity', '0.95');
      g.appendChild(bgRect);
      
      // Condition text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX.toString());
      text.setAttribute('y', (midY + 4).toString());
      text.setAttribute('fill', '#4a90e2');
      text.setAttribute('font-size', '10');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'condition-label');
      
      // Wrap text if needed
      if (conditionText.length > 30) {
        const words = conditionText.split(' ');
        let line1 = '';
        let line2 = '';
        let currentLine = 1;
        
        for (const word of words) {
          if (currentLine === 1 && line1.length + word.length < 30) {
            line1 += (line1 ? ' ' : '') + word;
          } else {
            currentLine = 2;
            line2 += (line2 ? ' ' : '') + word;
          }
        }
        
        if (line2) {
          // Adjust rect height for two lines
          bgRect.setAttribute('height', '30');
          bgRect.setAttribute('y', (midY - 15).toString());
          
          // First line
          const tspan1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan1.setAttribute('x', midX.toString());
          tspan1.setAttribute('dy', '-5');
          tspan1.textContent = line1;
          text.appendChild(tspan1);
          
          // Second line
          const tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan2.setAttribute('x', midX.toString());
          tspan2.setAttribute('dy', '12');
          tspan2.textContent = line2;
          text.appendChild(tspan2);
        } else {
          text.textContent = conditionText;
        }
      } else {
        text.textContent = conditionText;
      }
      
      g.appendChild(text);
    }
    
    return g;
  }
  
  private async createNodesAndConnections(container: SVGGElement) {
    const nodeMap = new Map<string, {element: SVGGElement, step: AIAgentStepEntity}>();
    
    // Create nodes for each step
    for (const step of this.steps) {
      const nodeElement = this.createNodeElement(step);
      container.appendChild(nodeElement);
      nodeMap.set(step.ID, {element: nodeElement, step});
      this.nodeElements.set(step.ID, nodeElement);
    }
    
    // Create connections based on paths
    for (const path of this.paths) {
      const fromNode = nodeMap.get(path.OriginStepID);
      const toNode = nodeMap.get(path.DestinationStepID);
      
      if (fromNode && toNode) {
        // Get positions (will be set properly after arrangement)
        const nodeWidth = 140;
        const nodeHeight = 80;
        const fromPos = { x: nodeWidth, y: nodeHeight / 2 }; // Default output socket position
        const toPos = { x: 0, y: nodeHeight / 2 }; // Input socket position
        
        const connectionElement = this.createConnectionElement(fromPos, toPos, path);
        connectionElement.setAttribute('data-from', path.OriginStepID);
        connectionElement.setAttribute('data-to', path.DestinationStepID);
        connectionElement.setAttribute('data-path-id', path.ID);
        
        // Insert connections before nodes so they appear behind
        container.insertBefore(connectionElement, container.firstChild);
        this.connectionElements.set(`${path.OriginStepID}-${path.DestinationStepID}`, connectionElement);
      }
    }
  }
  
  private async arrangeNodes() {
    const startingNodes = this.steps.filter(s => s.StartingStep);
    const otherNodes = this.steps.filter(s => !s.StartingStep);
    
    const xSpacing = 280; // Increased from 200 for better visibility of conditions
    const ySpacing = 150; // Increased from 120 for better vertical spacing
    const startX = 50;
    const startY = 50;
    
    // Check if any steps have saved positions
    const hasPositions = this.steps.some(s => s.PositionX !== 0 || s.PositionY !== 0);
    
    if (hasPositions) {
      // Use saved positions
      for (const step of this.steps) {
        const element = this.nodeElements.get(step.ID);
        if (element) {
          const x = step.PositionX || startX;
          const y = step.PositionY || startY;
          element.setAttribute('transform', `translate(${x}, ${y})`);
        }
      }
    } else {
      // Auto-layout when no positions are saved
      // Position starting nodes on the left
      let y = startY;
      for (const step of startingNodes) {
        const element = this.nodeElements.get(step.ID);
        if (element) {
          element.setAttribute('transform', `translate(${startX}, ${y})`);
        }
        y += ySpacing;
      }
    
      // Create a simple tree layout for other nodes
      // Group nodes by their distance from start
      const nodeDepths = new Map<string, number>();
      const visited = new Set<string>();
      
      // BFS to calculate depths
      const queue: { id: string, depth: number }[] = [];
      startingNodes.forEach(node => {
        queue.push({ id: node.ID, depth: 0 });
        nodeDepths.set(node.ID, 0);
      });
      
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        
        // Find all nodes connected from this one
        const outgoingPaths = this.paths.filter(p => p.OriginStepID === id);
        for (const path of outgoingPaths) {
          const targetStep = this.steps.find(s => s.ID === path.DestinationStepID);
          if (targetStep && !visited.has(targetStep.ID)) {
            nodeDepths.set(targetStep.ID, depth + 1);
            queue.push({ id: targetStep.ID, depth: depth + 1 });
          }
        }
      }
      
      // Group nodes by depth
      const nodesByDepth = new Map<number, AIAgentStepEntity[]>();
      for (const step of this.steps) {
        const depth = nodeDepths.get(step.ID) || 0;
        if (!nodesByDepth.has(depth)) {
          nodesByDepth.set(depth, []);
        }
        nodesByDepth.get(depth)!.push(step);
      }
      
      // Position nodes by depth
      for (const [depth, nodes] of nodesByDepth) {
        const x = startX + depth * xSpacing;
        const totalHeight = (nodes.length - 1) * ySpacing;
        const startYForDepth = startY + (y - startY - totalHeight) / 2;
        
        nodes.forEach((node, index) => {
          const element = this.nodeElements.get(node.ID);
          if (element) {
            element.setAttribute('transform', `translate(${x}, ${startYForDepth + index * ySpacing})`);
          }
        });
      }
    }
    
    // Update connection paths based on node positions
    this.updateConnections();
  }
  
  private updateConnections() {
    for (const [key, connectionGroup] of this.connectionElements) {
      const fromId = connectionGroup.getAttribute('data-from');
      const toId = connectionGroup.getAttribute('data-to');
      const pathId = connectionGroup.getAttribute('data-path-id');
      
      if (fromId && toId) {
        const fromElement = this.nodeElements.get(fromId);
        const toElement = this.nodeElements.get(toId);
        
        if (fromElement && toElement) {
          const fromTransform = fromElement.getAttribute('transform');
          const toTransform = toElement.getAttribute('transform');
          
          const fromMatch = fromTransform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
          const toMatch = toTransform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
          
          if (fromMatch && toMatch) {
            const nodeWidth = 140;
            const nodeHeight = 80;
            const socketY = nodeHeight / 2;
            
            // Get the proper output socket Y position for this path
            const fromPaths = this.paths.filter(p => p.OriginStepID === fromId);
            let fromY = parseInt(fromMatch[2]) + socketY;
            
            if (fromPaths.length > 1) {
              // Find this path's index to determine socket position
              const pathIndex = fromPaths.findIndex(p => p.ID === pathId);
              if (pathIndex !== -1) {
                const spacing = Math.min(20, (nodeHeight - 20) / (fromPaths.length - 1));
                const startY = socketY - (fromPaths.length - 1) * spacing / 2;
                fromY = parseInt(fromMatch[2]) + startY + pathIndex * spacing;
              }
            }
            
            const fromX = parseInt(fromMatch[1]) + nodeWidth; // Output socket
            const toX = parseInt(toMatch[1]); // Input socket
            const toY = parseInt(toMatch[2]) + socketY;
            
            // Update path element
            const pathElement = connectionGroup.querySelector('path');
            if (pathElement) {
              const dx = toX - fromX;
              const cx1 = fromX + dx * 0.5;
              const cy1 = fromY;
              const cx2 = toX - dx * 0.5;
              const cy2 = toY;
              
              const d = `M ${fromX} ${fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${toY}`;
              pathElement.setAttribute('d', d);
            }
            
            // Update condition label position if present
            const conditionRect = connectionGroup.querySelector('rect');
            const conditionText = connectionGroup.querySelector('.condition-label');
            if (conditionRect && conditionText) {
              const midX = (fromX + toX) / 2;
              const midY = (fromY + toY) / 2;
              
              // Get rect width to center it properly
              const rectWidth = parseFloat(conditionRect.getAttribute('width') || '80');
              const rectHeight = parseFloat(conditionRect.getAttribute('height') || '20');
              
              conditionRect.setAttribute('x', (midX - rectWidth / 2).toString());
              conditionRect.setAttribute('y', (midY - rectHeight / 2).toString());
              
              // Update text position
              conditionText.setAttribute('x', midX.toString());
              if (rectHeight > 20) {
                // Multi-line text
                const tspans = conditionText.querySelectorAll('tspan');
                tspans.forEach((tspan, index) => {
                  tspan.setAttribute('x', midX.toString());
                });
              } else {
                conditionText.setAttribute('y', (midY + 4).toString());
              }
            }
          }
        }
      }
    }
  }
  
  private fitToView(svg: SVGSVGElement, container: SVGGElement) {
    const bbox = container.getBBox();
    const padding = 40;
    
    // Add extra zoom out by increasing the viewBox
    const zoomFactor = 1.2; // 20% zoom out
    const width = bbox.width * zoomFactor;
    const height = bbox.height * zoomFactor;
    const x = bbox.x - padding - (width - bbox.width) / 2;
    const y = bbox.y - padding - (height - bbox.height) / 2;
    
    const viewBox = `${x} ${y} ${width + 2 * padding} ${height + 2 * padding}`;
    svg.setAttribute('viewBox', viewBox);
  }
  
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
  
  private cleanup() {
    this.nodeElements.clear();
    this.connectionElements.clear();
  }
  
  private onNodeMouseDown(event: MouseEvent, stepId: string) {
    event.preventDefault();
    event.stopPropagation();
    
    const element = this.nodeElements.get(stepId);
    if (!element) return;
    
    // Get current transform
    const transform = element.getAttribute('transform');
    const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    if (!match) return;
    
    // Get SVG element and calculate mouse position in SVG coordinates
    const svg = element.ownerSVGElement;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    this.dragState = {
      isDragging: true,
      element: element,
      stepId: stepId,
      startX: svgP.x,
      startY: svgP.y,
      startTransform: {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      }
    };
    
    element.classList.add('dragging');
    
    // Add document-level event listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }
  
  private onMouseMove = (event: MouseEvent) => {
    if (!this.dragState.isDragging || !this.dragState.element) return;
    
    // Get SVG element and calculate mouse position in SVG coordinates
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
    
    // Update connections
    this.updateConnections();
  }
  
  private onMouseUp = (event: MouseEvent) => {
    if (!this.dragState.isDragging || !this.dragState.element || !this.dragState.stepId) return;
    
    this.dragState.element.classList.remove('dragging');
    
    // Get final position
    const transform = this.dragState.element.getAttribute('transform');
    const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    if (match) {
      const x = Math.round(parseFloat(match[1]));
      const y = Math.round(parseFloat(match[2]));
      
      // Emit position change for saving
      this.positionChanges$.next({ stepId: this.dragState.stepId, x, y });
    }
    
    // Clean up
    this.dragState = {
      isDragging: false,
      element: null,
      stepId: null,
      startX: 0,
      startY: 0,
      startTransform: { x: 0, y: 0 }
    };
    
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
  
  private async saveStepPosition(stepId: string, x: number, y: number) {
    const step = this.steps.find(s => s.ID === stepId);
    if (!step) return;
    
    try {
      step.PositionX = x;
      step.PositionY = y;
      
      // Save the step
      const result = await step.Save();
      if (!result) {
        console.error('Failed to save step position');
      }
    } catch (error) {
      console.error('Error saving step position:', error);
    }
  }
}