import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, ViewContainerRef, ComponentRef, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowEditorService } from '../../services/flow-editor.service';
import { FlowExecutorService } from '../../services/flow-executor.service';
import { StepComponent } from '../step/step.component';
import { SimpleConditionEditorComponent } from '../simple-condition-editor/simple-condition-editor.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { Step, StepType, STEP_CONFIGS } from '../../models/step.model';
import { Connection, BooleanCondition } from '../../models/connection.model';

@Component({
  selector: 'app-flow-editor',
  standalone: true,
  imports: [CommonModule, StepComponent, SimpleConditionEditorComponent, ConfirmationDialogComponent],
  templateUrl: './flow-editor.component.html',
  styleUrls: ['./flow-editor.component.scss']
})
export class FlowEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('reteEditor', { static: true }) reteEditor!: ElementRef<HTMLDivElement>;
  @Output() toggleExecution = new EventEmitter<void>();
  @Output() stepMoved = new EventEmitter<Step>();

  steps: Step[] = [];
  connections: Connection[] = [];
  selectedStepId: number | null = null;
  executingStepId: number | null = null;
  showExecutionPanel = false;
  legendCollapsed = true;
  
  // Fixed dimensions for all steps
  private readonly STEP_WIDTH = 320;
  private readonly STEP_HEIGHT = 140;
  
  private nextStepId = 1;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  currentScale = 1;
  canvasOffset = { x: 50, y: 50 };
  
  // Connection creation state
  tempConnection: { source: Step, sourceType: string, mouseX: number, mouseY: number } | null = null;
  private isCreatingConnection = false;
  
  // Condition editing
  editingConnection: Connection | null = null;
  
  // Deletion confirmation
  stepToDelete: Step | null = null;
  connectionToDelete: Connection | null = null;

  constructor(
    private flowEditorService: FlowEditorService,
    private flowExecutor: FlowExecutorService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    // Subscribe to current executing step to highlight it
    this.flowExecutor.currentStepId.subscribe(stepId => {
      this.executingStepId = stepId;
      this.changeDetector.detectChanges();
    });
  }

  ngAfterViewInit() {
    this.initializeEditor();
    // Load the actual data from the service instead of creating example flow
    this.loadFlowData();
  }

  initializeEditor() {
    // Setup canvas events
    this.setupCanvasEvents();
  }

  loadFlowData() {
    // Load steps and connections from the service
    this.steps = this.flowEditorService.getAllSteps();
    this.connections = (this.flowEditorService as any).connections || [];
    
    // Log the loaded data
    if (this.steps.length > 0 || this.connections.length > 0) {
      // Auto-arrange steps with proper spacing
      this.autoArrangeSteps();
      
      // The template will automatically render the steps and connections
      // through Angular's change detection
      this.changeDetector.detectChanges();
      
      // Fit entire flow in view after DOM is ready
      // Need longer delay to ensure canvas element has dimensions
      setTimeout(() => {
        this.fitToView();
      }, 500);
    }
  }
  
  centerOnStartingStep() {
    // Find a starting step or the first step
    const startingStep = this.steps.find(s => (s as any).mjData?.startingStep) || this.steps[0];
    
    if (startingStep) {
      // Center the canvas on this step
      const container = this.reteEditor.nativeElement;
      const rect = container.getBoundingClientRect();
      
      // Calculate offset to center the step
      this.canvasOffset.x = (rect.width / 2) - (startingStep.position[0] * this.currentScale) - 120; // 120 is half step width
      this.canvasOffset.y = (rect.height / 2) - (startingStep.position[1] * this.currentScale) - 60; // 60 is half step height
      
      // Ensure we don't go too far up
      this.canvasOffset.y = Math.min(this.canvasOffset.y, 50);
      
      this.updateCanvasTransform();
    }
  }

  createExampleFlow() {
    // Create example steps with more spacing
    this.createStep('prompt', [100, 200]);
    this.createStep('agent', [500, 200]);
    this.createStep('action', [900, 200]);
    this.createStep('prompt', [1300, 100]);
    this.createStep('action', [1300, 300]);

    // Create connections
    this.createConnection(1, 2);
    this.createConnection(2, 3);
    this.createConnection(3, 4);
    this.createConnection(3, 5);
  }

  createStep(type: StepType, position: [number, number]): Step {
    const config = STEP_CONFIGS[type];
    const step: Step = {
      id: this.nextStepId++,
      type: type,
      name: config.name,
      position: position,
      config: config
    };
    
    this.steps.push(step);
    // console.log('Step created:', step);
    // console.log('Total steps:', this.steps.length);
    // console.log('Current steps array:', this.steps);
    
    // Update the service with all steps
    this.flowEditorService.setAllSteps(this.steps);
    
    // Force Angular change detection
    this.changeDetector.detectChanges();
    
    // Log the DOM elements after change detection
    setTimeout(() => {
      // Step elements have been created
    }, 0);
    
    return step;
  }

  createConnection(sourceId: number, targetId: number) {
    const connection: Connection = {
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      sourceOutput: 'out',
      targetInput: 'in',
      condition: {
        expression: 'success',
        label: 'Success'
      }
    };
    
    this.connections.push(connection);
    // console.log('Connection created:', connection);
    // console.log('Total connections:', this.connections.length);
    this.changeDetector.detectChanges();
  }

  setupCanvasEvents() {
    const container = this.reteEditor.nativeElement;
    
    // Click on empty canvas to deselect
    container.addEventListener('click', (e: MouseEvent) => {
      // Only deselect if clicking on the canvas itself or the SVG
      const target = e.target as HTMLElement;
      if (target === container || target.tagName === 'svg' || target.classList.contains('canvas-wrapper')) {
        this.selectedStepId = null;
        this.flowEditorService.selectNode(null);
      }
    });
    
    // Setup drop handling on the container itself
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      container.classList.add('drag-over');
    });
    
    container.addEventListener('dragleave', (e) => {
      const rect = container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || 
          e.clientY < rect.top || e.clientY > rect.bottom) {
        container.classList.remove('drag-over');
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.remove('drag-over');
      
      const plainData = e.dataTransfer?.getData('text/plain') || '';
      const stepType = e.dataTransfer?.getData('stepType') as StepType;
      
      // Handle drag and drop of steps
      
      // Check if this is a step drop
      if (plainData.startsWith('step:')) {
        // Extract the step type from the plain data
        const extractedType = plainData.replace('step:', '') as StepType;
        const rect = container.getBoundingClientRect();
        let x = (e.clientX - rect.left - this.canvasOffset.x) / this.currentScale;
        let y = (e.clientY - rect.top - this.canvasOffset.y) / this.currentScale;
        
        // Snap to grid for better alignment (optional)
        const gridSize = 50;
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
        
        // Create step at calculated position
        
        this.createStep(extractedType, [x, y]);
      }
    });

    // Pan canvas
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    container.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      // Only pan if clicking on empty canvas area
      if (target.classList.contains('canvas-wrapper') || target.classList.contains('steps-container') || target.classList.contains('rete-container')) {
        isPanning = true;
        startX = e.clientX - this.canvasOffset.x;
        startY = e.clientY - this.canvasOffset.y;
        container.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        this.canvasOffset.x = e.clientX - startX;
        this.canvasOffset.y = e.clientY - startY;
        this.updateCanvasTransform();
      }
    });

    document.addEventListener('mouseup', () => {
      isPanning = false;
      container.style.cursor = 'grab';
    });

    // Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.currentScale = Math.max(0.1, Math.min(2, this.currentScale * delta));
      this.updateCanvasTransform();
    });
  }

  updateCanvasTransform() {
    const canvasWrapper = this.reteEditor.nativeElement.querySelector('.canvas-wrapper') as HTMLElement;
    
    if (canvasWrapper) {
      canvasWrapper.style.transform = `translate(${this.canvasOffset.x}px, ${this.canvasOffset.y}px) scale(${this.currentScale})`;
    }
  }

  selectStep(step: Step) {
    // Toggle selection if clicking the same step
    if (this.selectedStepId === step.id) {
      this.selectedStepId = null;
      this.flowEditorService.selectNode(null);
    } else {
      this.selectedStepId = step.id;
      this.flowEditorService.selectNode(step as any);
    }
  }

  deleteStep(step: Step) {
    this.stepToDelete = step;
  }
  
  confirmDeleteStep() {
    if (!this.stepToDelete) return;
    
    const stepId = this.stepToDelete.id;
    this.steps = this.steps.filter(s => s.id !== stepId);
    this.connections = this.connections.filter(c => c.source !== stepId && c.target !== stepId);
    
    // Update the service with all steps
    this.flowEditorService.setAllSteps(this.steps);
    
    if (this.selectedStepId === stepId) {
      this.selectedStepId = null;
      this.flowEditorService.selectNode(null);
    }
    
    this.stepToDelete = null;
  }
  
  cancelDeleteStep() {
    this.stepToDelete = null;
  }
  
  deleteConnection(connection: Connection) {
    this.connectionToDelete = connection;
  }
  
  confirmDeleteConnection() {
    if (!this.connectionToDelete) return;
    
    this.connections = this.connections.filter(c => c.id !== this.connectionToDelete!.id);
    this.connectionToDelete = null;
  }
  
  cancelDeleteConnection() {
    this.connectionToDelete = null;
  }
  
  onConnectionClick(event: MouseEvent, connection: Connection) {
    event.stopPropagation();
    
    // Check if Shift key is held for delete
    if (event.shiftKey) {
      this.deleteConnection(connection);
    } else {
      // Open condition editor
      this.editingConnection = { ...connection };
    }
  }
  
  getConnectionMidpoint(connection: Connection): { x: number, y: number } {
    const source = this.steps.find(s => s.id === connection.source);
    const target = this.steps.find(s => s.id === connection.target);
    
    if (!source || !target) {
      return { x: 0, y: 0 };
    }
    
    // Use fixed dimensions for all steps
    const sourceDimensions = { width: this.STEP_WIDTH, height: this.STEP_HEIGHT };
    const targetDimensions = { width: this.STEP_WIDTH, height: this.STEP_HEIGHT };
    
    const x1 = source.position[0] + sourceDimensions.width; // Output socket center at edge
    const y1 = source.position[1] + (sourceDimensions.height / 2);
    const x2 = target.position[0]; // Input socket center at edge
    const y2 = target.position[1] + (targetDimensions.height / 2);
    
    // For backward connections, adjust midpoint to be on the curve
    if (this.isBackwardConnection(connection)) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 + 50; // Offset down to match the curve
      return { x: midX, y: midY };
    }
    
    // Return the midpoint of the connection
    const midpoint = {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2
    };
    
    return midpoint;
  }
  
  saveConnectionConditions(updatedConnection: Connection) {
    const index = this.connections.findIndex(c => c.id === updatedConnection.id);
    if (index !== -1) {
      this.connections[index] = updatedConnection;
    }
    this.closeConditionEditor();
  }
  
  closeConditionEditor() {
    this.editingConnection = null;
  }
  
  getConditionPreview(connection: Connection): string {
    if (!connection.condition) {
      return 'Always';
    }
    
    return connection.condition.expression;
  }
  
  getConditionLabel(connection: Connection): string {
    if (!connection.condition) {
      return 'Always';
    }
    
    const label = connection.condition.label || connection.condition.expression;
    
    // Truncate if too long
    const maxLength = 12;
    if (label.length > maxLength) {
      return label.substring(0, maxLength - 2) + '...';
    }
    
    return label;
  }
  
  getConditionBoxWidth(connection: Connection): number {
    const label = this.getConditionLabel(connection);
    // Estimate width based on character count (approx 7px per character + padding)
    const estimatedWidth = Math.max(80, Math.min(140, label.length * 7 + 30));
    return estimatedWidth;
  }
  
  getConnectionColor(connection: Connection): string {
    // Check if this is a backward connection
    if (this.isBackwardConnection(connection)) {
      return '#EF4444'; // Red for backward connections
    }
    
    // Define a palette of distinct colors for forward connections
    const colorPalette = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#14B8A6', // Teal
      '#F97316', // Orange
      '#06B6D4', // Cyan
    ];
    
    // Get all forward connections from the same source
    const sourceConnections = this.connections
      .filter(c => c.source === connection.source && !this.isBackwardConnection(c))
      .sort((a, b) => (a.id || '').localeCompare(b.id || '')); // Sort by ID for consistency
    
    // Find the index of this connection among connections from the same source
    const connectionIndex = sourceConnections.findIndex(c => c.id === connection.id);
    
    // Use modulo to cycle through colors if there are more connections than colors
    return colorPalette[connectionIndex % colorPalette.length];
  }
  
  isBackwardConnection(connection: Connection): boolean {
    // A connection is backward if the target step is positioned to the left of the source step
    const sourceStep = this.steps.find(s => s.id === connection.source);
    const targetStep = this.steps.find(s => s.id === connection.target);
    
    if (!sourceStep || !targetStep) return false;
    
    // Check if target is to the left of source (backward in the flow)
    return targetStep.position[0] < sourceStep.position[0];
  }
  
  getConnectionDashArray(connection: Connection): string {
    // Return dash array for backward connections, solid for forward
    return this.isBackwardConnection(connection) ? '10,5' : '';
  }
  
  getConnectionMarker(connection: Connection): string {
    // Add arrow marker for backward connections
    return this.isBackwardConnection(connection) ? 'url(#backward-arrow)' : '';
  }

  updateStep(step: Step) {
    // Step updated, trigger any necessary updates
    this.flowEditorService.updateNode(step as any);
  }

  onStepDragStart(event: MouseEvent, step: Step) {
    event.preventDefault();
    this.isDragging = true;
    this.currentDraggedStep = step;
    
    // Calculate the offset between the mouse position and the step position
    // We need to account for the canvas transform (scale and offset)
    const rect = this.reteEditor.nativeElement.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left - this.canvasOffset.x) / this.currentScale;
    const mouseY = (event.clientY - rect.top - this.canvasOffset.y) / this.currentScale;
    
    // Store the offset between mouse and step position
    this.dragOffset.x = mouseX - step.position[0];
    this.dragOffset.y = mouseY - step.position[1];
    
    // Add document level mouse move and up listeners
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  private currentDraggedStep: Step | null = null;
  
  private handleMouseMove = (event: MouseEvent) => {
    if (this.isDragging && this.currentDraggedStep) {
      const rect = this.reteEditor.nativeElement.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.canvasOffset.x) / this.currentScale;
      const mouseY = (event.clientY - rect.top - this.canvasOffset.y) / this.currentScale;
      
      // Update position by subtracting the initial offset
      this.currentDraggedStep.position[0] = mouseX - this.dragOffset.x;
      this.currentDraggedStep.position[1] = mouseY - this.dragOffset.y;
    }
  }

  private handleMouseUp = () => {
    if (this.isDragging && this.currentDraggedStep) {
      // Emit an event that the step position has changed
      this.stepMoved.emit(this.currentDraggedStep);
    }
    
    this.isDragging = false;
    this.currentDraggedStep = null;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }
  
  onStepDragEnd() {
    this.handleMouseUp();
  }

  getConnectionPath(connection: Connection): string {
    const source = this.steps.find(s => s.id === connection.source);
    const target = this.steps.find(s => s.id === connection.target);
    
    if (!source || !target) {
      return '';
    }
    
    // Use fixed dimensions for all steps
    const sourceDimensions = { width: this.STEP_WIDTH, height: this.STEP_HEIGHT };
    const targetDimensions = { width: this.STEP_WIDTH, height: this.STEP_HEIGHT };
    
    // Socket positions - sockets are at 50% of total step height
    // The sockets are 16px diameter circles centered at edges
    // Output socket center is at right edge (the socket extends beyond with right: -8px)
    // Input socket center is at left edge (the socket extends beyond with left: -8px)
    
    // Socket positioning: sockets are 16px diameter circles
    // With right: -8px, the socket center is at the step edge (not beyond)
    // With left: -8px, the socket center is at the step edge (not beyond)
    const x1 = source.position[0] + sourceDimensions.width; // Output socket center at right edge
    const y1 = source.position[1] + (sourceDimensions.height / 2); // 50% of step height
    const x2 = target.position[0]; // Input socket center at left edge
    const y2 = target.position[1] + (targetDimensions.height / 2); // 50% of step height
    
    // Check if this is a backward connection
    if (this.isBackwardConnection(connection)) {
      // For backward connections, create a more pronounced curve that goes below
      const dx = x2 - x1;
      
      // Make the curve go below the steps for better visibility
      const curveOffset = 100; // How far below to curve
      const midX = (x1 + x2) / 2;
      const midY = Math.max(y1, y2) + curveOffset;
      
      // Create a path that curves below with a smoother quadratic curve
      const cp1x = x1 + 50;
      const cp1y = y1 + curveOffset / 2;
      const cp2x = x2 - 50;
      const cp2y = y2 + curveOffset / 2;
      
      return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }
    
    // For forward connections, use the standard bezier curve
    const dx = x2 - x1;
    const controlPointOffset = Math.max(50, Math.min(150, Math.abs(dx) * 0.4));
    
    const path = `M ${x1} ${y1} C ${x1 + controlPointOffset} ${y1}, ${x2 - controlPointOffset} ${y2}, ${x2} ${y2}`;
    return path;
  }

  onZoomIn() {
    this.currentScale = Math.min(2, this.currentScale * 1.2);
    this.updateCanvasTransform();
  }

  onZoomOut() {
    this.currentScale = Math.max(0.1, this.currentScale * 0.8);
    this.updateCanvasTransform();
  }

  onResetView() {
    // Fit entire flow in view
    this.fitToView();
  }
  
  onAutoArrange() {
    // Recalculate optimal positions for all steps
    this.autoArrangeSteps();
    
    // Fit all steps in view
    this.fitToView();
  }
  
  private autoArrangeSteps() {
    if (this.steps.length === 0) return;
    
    // Spacing adjusted for larger step dimensions and condition text
    // Step width is 320px, so we need spacing > 320px to avoid overlap
    const horizontalSpacing = 500; // Balanced spacing - enough room for connections without being too spread out
    const verticalSpacing = 200; // Good vertical separation
    
    // Build adjacency map for BFS traversal
    const adjacencyMap = new Map<number, number[]>();
    const incomingEdges = new Map<number, number>();
    
    this.steps.forEach(step => {
      adjacencyMap.set(step.id, []);
      incomingEdges.set(step.id, 0);
    });
    
    this.connections.forEach(conn => {
      const sourceSteps = adjacencyMap.get(conn.source) || [];
      sourceSteps.push(conn.target);
      adjacencyMap.set(conn.source, sourceSteps);
      
      const targetCount = incomingEdges.get(conn.target) || 0;
      incomingEdges.set(conn.target, targetCount + 1);
    });
    
    // Find starting nodes (no incoming edges or marked as starting)
    const startingSteps = this.steps.filter(step => 
      incomingEdges.get(step.id) === 0 || (step as any).mjData?.startingStep
    );
    
    // Use BFS to assign levels
    const levels = new Map<number, number>();
    const queue = [...startingSteps];
    startingSteps.forEach(step => levels.set(step.id, 0));
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current.id) || 0;
      
      const neighbors = adjacencyMap.get(current.id) || [];
      neighbors.forEach(neighborId => {
        if (!levels.has(neighborId)) {
          levels.set(neighborId, currentLevel + 1);
          const neighborStep = this.steps.find(s => s.id === neighborId);
          if (neighborStep) queue.push(neighborStep);
        }
      });
    }
    
    // Group steps by level
    const stepsByLevel = new Map<number, Step[]>();
    this.steps.forEach(step => {
      const level = levels.get(step.id) || 0;
      if (!stepsByLevel.has(level)) {
        stepsByLevel.set(level, []);
      }
      stepsByLevel.get(level)!.push(step);
    });
    
    // Calculate positions
    const startX = 100;
    const startY = 50;
    
    stepsByLevel.forEach((stepsInLevel, level) => {
      const x = startX + (level * horizontalSpacing);
      const totalHeight = (stepsInLevel.length - 1) * verticalSpacing;
      const startYForLevel = startY + Math.max(0, (400 - totalHeight) / 2);
      
      stepsInLevel.forEach((step, index) => {
        const y = startYForLevel + (index * verticalSpacing);
        step.position = [x, y];
      });
    });
  }
  
  private fitToView() {
    if (this.steps.length === 0) {
      // If no steps, just reset to default view
      this.currentScale = 1;
      this.canvasOffset = { x: 0, y: 0 };
      this.updateCanvasTransform();
      return;
    }
    
    // Get viewport dimensions
    const viewportWidth = this.reteEditor.nativeElement.clientWidth;
    const viewportHeight = this.reteEditor.nativeElement.clientHeight;
    
    // Check if DOM is ready - if not, retry
    if (viewportWidth === 0 || viewportHeight === 0) {
      setTimeout(() => this.fitToView(), 200);
      return;
    }
    
    // Find bounds of all steps
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    this.steps.forEach(step => {
      minX = Math.min(minX, step.position[0]);
      minY = Math.min(minY, step.position[1]);
      maxX = Math.max(maxX, step.position[0] + this.STEP_WIDTH);
      maxY = Math.max(maxY, step.position[1] + this.STEP_HEIGHT);
    });
    
    // Calculate content dimensions
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Calculate scale to fit content with padding
    const padding = 100;
    const scaleX = (viewportWidth - padding * 2) / contentWidth;
    const scaleY = (viewportHeight - padding * 2) / contentHeight;
    
    // Use the smaller scale to ensure everything fits
    // But don't zoom out too much or zoom in too much
    const idealScale = Math.min(scaleX, scaleY);
    this.currentScale = Math.max(0.3, Math.min(idealScale, 1.0));
    
    // Calculate the center point of the content
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;
    
    // Calculate the center point of the viewport
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;
    
    // Calculate offset to center the content
    this.canvasOffset.x = viewportCenterX - (contentCenterX * this.currentScale);
    this.canvasOffset.y = viewportCenterY - (contentCenterY * this.currentScale);
    
    this.updateCanvasTransform();
  }
  
  toggleExecutionPanel() {
    this.showExecutionPanel = !this.showExecutionPanel;
    this.toggleExecution.emit();
  }
  

  runFlow() {
    // Run the flow with current steps and connections
    
    if (this.steps.length === 0) {
      alert('Please add some steps to the flow first!');
      return;
    }
    
    this.flowExecutor.executeFlow(this.steps, this.connections);
  }

  ngOnDestroy() {
    // Cleanup
    document.removeEventListener('mousemove', this.handleConnectionMouseMove);
    document.removeEventListener('mouseup', this.handleConnectionMouseUp);
  }

  // Socket event handlers
  onSocketMouseDown(event: { event: MouseEvent, step: Step, type: string }) {
    event.event.stopPropagation();
    event.event.preventDefault();
    
    this.isCreatingConnection = true;
    const rect = this.reteEditor.nativeElement.getBoundingClientRect();
    
    this.tempConnection = {
      source: event.step,
      sourceType: event.type,
      mouseX: (event.event.clientX - rect.left - this.canvasOffset.x) / this.currentScale,
      mouseY: (event.event.clientY - rect.top - this.canvasOffset.y) / this.currentScale
    };
    
    // Add document-level listeners for connection creation
    document.addEventListener('mousemove', this.handleConnectionMouseMove);
    document.addEventListener('mouseup', this.handleConnectionMouseUp);
  }

  onSocketMouseEnter(event: { event: MouseEvent, step: Step, type: string }) {
    if (this.isCreatingConnection && this.tempConnection) {
      const targetStep = event.step;
      const sourceStep = this.tempConnection.source;
      
      // Check if we can create a connection
      if (this.canCreateConnection(sourceStep, targetStep, this.tempConnection.sourceType, event.type)) {
        // Highlight the socket
        const socket = event.event.target as HTMLElement;
        socket.classList.add('can-connect');
        
        // Store the potential target for the mouseup event
        (socket as any)._connectionTarget = {
          step: targetStep,
          type: event.type
        };
      }
    }
  }

  onSocketMouseLeave(event: MouseEvent) {
    const socket = event.target as HTMLElement;
    socket.classList.remove('can-connect');
    delete (socket as any)._connectionTarget;
  }

  private handleConnectionMouseMove = (event: MouseEvent) => {
    if (this.isCreatingConnection && this.tempConnection) {
      const rect = this.reteEditor.nativeElement.getBoundingClientRect();
      this.tempConnection.mouseX = (event.clientX - rect.left - this.canvasOffset.x) / this.currentScale;
      this.tempConnection.mouseY = (event.clientY - rect.top - this.canvasOffset.y) / this.currentScale;
    }
  }

  private handleConnectionMouseUp = (event: MouseEvent) => {
    if (this.isCreatingConnection && this.tempConnection) {
      // Check if we're over a socket
      const target = event.target as HTMLElement;
      if (target.classList.contains('socket') && (target as any)._connectionTarget) {
        const connectionTarget = (target as any)._connectionTarget;
        const sourceStep = this.tempConnection.source;
        const targetStep = connectionTarget.step;
        
        // Create the connection
        if (this.tempConnection.sourceType === 'output') {
          this.createConnection(sourceStep.id, targetStep.id);
        } else {
          this.createConnection(targetStep.id, sourceStep.id);
        }
        
        // Force change detection to show the new connection
        this.changeDetector.detectChanges();
      }
      
      // Clean up
      this.isCreatingConnection = false;
      this.tempConnection = null;
      document.removeEventListener('mousemove', this.handleConnectionMouseMove);
      document.removeEventListener('mouseup', this.handleConnectionMouseUp);
    }
  }

  private canCreateConnection(source: Step, target: Step, sourceType: string, targetType: string): boolean {
    // Don't connect to self
    if (source.id === target.id) return false;
    
    // Only connect output to input
    if (sourceType === 'output' && targetType === 'input') {
      // Check if connection already exists
      return !this.connections.some(c => c.source === source.id && c.target === target.id);
    }
    
    return false;
  }

  getTempConnectionPath(): string {
    if (!this.tempConnection) return '';
    
    const source = this.tempConnection.source;
    const sourceType = this.tempConnection.sourceType;
    
    let x1: number, y1: number;
    const socketY = source.position[1] + (this.STEP_HEIGHT / 2);
    
    if (sourceType === 'output') {
      x1 = source.position[0] + this.STEP_WIDTH; // Output socket center at edge
      y1 = socketY;
    } else {
      x1 = source.position[0]; // Input socket center at edge
      y1 = socketY;
    }
    
    const x2 = this.tempConnection.mouseX;
    const y2 = this.tempConnection.mouseY;
    
    // Create a smooth bezier curve
    const dx = x2 - x1;
    const controlPointOffset = Math.max(50, Math.min(150, Math.abs(dx) * 0.4));
    
    if (sourceType === 'output') {
      return `M ${x1} ${y1} C ${x1 + controlPointOffset} ${y1}, ${x2 - controlPointOffset} ${y2}, ${x2} ${y2}`;
    } else {
      return `M ${x1} ${y1} C ${x1 - controlPointOffset} ${y1}, ${x2 + controlPointOffset} ${y2}, ${x2} ${y2}`;
    }
  }
  
}