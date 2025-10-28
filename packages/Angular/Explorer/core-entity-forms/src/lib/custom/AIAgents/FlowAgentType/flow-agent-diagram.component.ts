import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input, SimpleChanges, OnChanges, AfterViewInit, Output, EventEmitter, HostListener } from '@angular/core';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { DialogService } from '@progress/kendo-angular-dialog';

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
        <kendo-splitter orientation="horizontal" style="height: 100%;">
          <kendo-splitter-pane [collapsible]="false">
            <div class="rete-container" #reteContainer>
              <div class="diagram-toolbar">
                @if (EditMode) {
                  <button (click)="addNewStep()" title="Add new step">
                    <i class="fa-solid fa-plus"></i>
                    Add Step
                  </button>
                  @if (false) {
                    <button (click)="autoArrange()" title="Auto-arrange nodes">
                      <i class="fa-solid fa-magic"></i>
                      Auto Arrange
                    </button>
                  }
                  @if (connectionMode) {
                    <button (click)="cancelConnectionMode()" class="connection-mode-active">
                      <i class="fa-solid fa-times"></i>
                      Cancel Connection
                    </button>
                  }
                }
                <div class="zoom-controls">
                  <button (click)="zoomIn()" title="Zoom in">
                    <i class="fa-solid fa-search-plus"></i>
                  </button>
                  <button (click)="zoomOut()" title="Zoom out">
                    <i class="fa-solid fa-search-minus"></i>
                  </button>
                  <button (click)="resetZoom()" title="Reset zoom">
                    <i class="fa-solid fa-compress"></i>
                  </button>
                  <span class="zoom-level">{{ (panZoom.scale * 100).toFixed(0) }}%</span>
                </div>
              </div>
              <svg class="rete-svg" width="100%" height="100%" 
                   (click)="onSvgClick($event)"
                   (contextmenu)="onSvgContextMenu($event)"
                   (wheel)="onWheel($event)"
                   (mousedown)="onSvgMouseDown($event)"
                   (mousemove)="onSvgMouseMove($event)"
                   (mouseup)="onSvgMouseUp($event)"
                   [class.connection-mode]="connectionMode">
                @if (tempConnection) {
                  <path [attr.d]="tempConnection.path" 
                        fill="none" 
                        stroke="#4a90e2" 
                        stroke-width="2"
                        stroke-dasharray="5,5"
                        opacity="0.6"/>
                }
              </svg>
              @if (connectionMode) {
                <div class="connection-hint">
                  Click on a target step to create connection
                </div>
              }
              @if (contextMenu.visible) {
                <div class="context-menu" 
                     [style.left.px]="contextMenu.x" 
                     [style.top.px]="contextMenu.y"
                     (click)="$event.stopPropagation()">
                  @if (contextMenu.type === 'step') {
                    <button (click)="connectFromContextMenu()">
                      <i class="fa-solid fa-link"></i>
                      Connect To...
                    </button>
                    <button (click)="deleteFromContextMenu()" class="danger">
                      <i class="fa-solid fa-trash"></i>
                      Delete Step
                    </button>
                  } @else if (contextMenu.type === 'path') {
                    <button (click)="deletePathFromContextMenu()" class="danger">
                      <i class="fa-solid fa-trash"></i>
                      Delete Path
                    </button>
                  }
                </div>
              }
            </div>
          </kendo-splitter-pane>
          @if (selectedItem) {
            <kendo-splitter-pane [size]="'300px'" [min]="'250px'" [max]="'400px'" [collapsible]="true">
              <div class="properties-pane">
                <div class="properties-header">
                  <h4>
                    @if (selectedItem.type === 'step') {
                      <i class="fa-solid fa-circle-nodes"></i> Step Properties
                    } @else {
                      <i class="fa-solid fa-route"></i> Path Properties
                    }
                  </h4>
                  <button (click)="closeProperties()" title="Close">
                    <i class="fa-solid fa-times"></i>
                  </button>
                </div>
                <div class="properties-content">
                  @if (selectedItem.type === 'step') {
                    <div class="property-group">
                      <h5>Basic Information</h5>
                      <div class="property-item">
                        <div class="property-label">Name</div>
                        @if (EditMode) {
                          <input type="text" 
                                 class="property-input" 
                                 [(ngModel)]="selectedStep!.Name"
                                 (blur)="saveStepProperties()">
                        } @else {
                          <div class="property-value">{{ selectedStep!.Name }}</div>
                        }
                      </div>
                      <div class="property-item">
                        <div class="property-label">Type</div>
                        @if (EditMode) {
                          <kendo-dropdownlist 
                            [data]="stepTypes"
                            [(ngModel)]="selectedStep!.StepType"
                            (valueChange)="saveStepProperties()">
                          </kendo-dropdownlist>
                        } @else {
                          <div class="property-value">{{ selectedStep!.StepType }}</div>
                        }
                      </div>
                      <div class="property-item">
                        <div class="property-label">Description</div>
                        @if (EditMode) {
                          <textarea class="property-textarea" 
                                    [(ngModel)]="selectedStep!.Description"
                                    (blur)="saveStepProperties()"
                                    rows="3"></textarea>
                        } @else {
                          <div class="property-value">{{ selectedStep!.Description || 'No description' }}</div>
                        }
                      </div>
                      <div class="property-item">
                        <div class="property-label">Status</div>
                        @if (EditMode) {
                          <kendo-dropdownlist 
                            [data]="stepStatuses"
                            [(ngModel)]="selectedStep!.Status"
                            (valueChange)="saveStepProperties()">
                          </kendo-dropdownlist>
                        } @else {
                          <div class="property-value">{{ selectedStep!.Status }}</div>
                        }
                      </div>
                    </div>
                    @if (selectedStep!.StepType === 'Action') {
                      <div class="property-group">
                        <h5>Action Configuration</h5>
                        <div class="property-item">
                          <div class="property-label">Input Mapping</div>
                          @if (EditMode) {
                            <textarea class="property-textarea" 
                                      [(ngModel)]="selectedStep!.ActionInputMapping"
                                      (blur)="saveStepProperties()"
                                      rows="2"></textarea>
                          } @else {
                            <div class="property-value">{{ selectedStep!.ActionInputMapping || 'None' }}</div>
                          }
                        </div>
                        <div class="property-item">
                          <div class="property-label">Output Mapping</div>
                          @if (EditMode) {
                            <textarea class="property-textarea" 
                                      [(ngModel)]="selectedStep!.ActionOutputMapping"
                                      (blur)="saveStepProperties()"
                                      rows="2"></textarea>
                          } @else {
                            <div class="property-value">{{ selectedStep!.ActionOutputMapping || 'None' }}</div>
                          }
                        </div>
                      </div>
                    }
                    @if (EditMode) {
                      <div class="property-actions">
                        <button (click)="deleteSelectedStep()" class="danger-button">
                          <i class="fa-solid fa-trash"></i>
                          Delete Step
                        </button>
                        <button (click)="connectFromStep()" [disabled]="connectionMode">
                          <i class="fa-solid fa-link"></i>
                          Connect To...
                        </button>
                      </div>
                    }
                  } @else {
                    <div class="property-group">
                      <h5>Path Information</h5>
                      <div class="property-item">
                        <div class="property-label">From Step</div>
                        <div class="property-value">{{ getStepName(selectedPath!.OriginStepID) }}</div>
                      </div>
                      <div class="property-item">
                        <div class="property-label">To Step</div>
                        <div class="property-value">{{ getStepName(selectedPath!.DestinationStepID) }}</div>
                      </div>
                      <div class="property-item">
                        <div class="property-label">Condition</div>
                        @if (EditMode) {
                          <textarea class="property-textarea" 
                                    [(ngModel)]="selectedPath!.Condition"
                                    (blur)="savePathProperties()"
                                    rows="3"></textarea>
                        } @else {
                          <div class="property-value">{{ selectedPath!.Condition || 'No condition' }}</div>
                        }
                      </div>
                      <div class="property-item">
                        <div class="property-label">Priority</div>
                        @if (EditMode) {
                          <input type="number" 
                                 class="property-input" 
                                 [(ngModel)]="selectedPath!.Priority"
                                 (blur)="savePathProperties()">
                        } @else {
                          <div class="property-value">{{ selectedPath!.Priority }}</div>
                        }
                      </div>
                    </div>
                    @if (EditMode) {
                      <div class="property-actions">
                        <button (click)="deleteSelectedPath()" class="danger-button">
                          <i class="fa-solid fa-trash"></i>
                          Delete Path
                        </button>
                      </div>
                    }
                  }
                </div>
              </div>
            </kendo-splitter-pane>
          }
        </kendo-splitter>
      }
    </div>
  `,
  styles: [`
    .flow-diagram-container {
      width: 100%;
      height: 600px;
      min-height: 400px;
      max-height: 1200px;
      position: relative;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: auto;
      resize: vertical;
    }
    
    .flow-diagram-container::after {
      content: '';
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      cursor: ns-resize;
      background: linear-gradient(135deg, transparent 50%, #999 50%);
      border-bottom-right-radius: 4px;
      pointer-events: none;
    }
    
    .diagram-toolbar {
      position: absolute;
      top: 10px;
      right: 10px;
      left: 10px;
      display: flex;
      gap: 5px;
      z-index: 10;
      background: white;
      padding: 5px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      justify-content: space-between;
    }
    
    .zoom-controls {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    
    .zoom-level {
      font-size: 12px;
      color: #666;
      margin-left: 8px;
    }
    
    .diagram-toolbar button {
      padding: 5px 10px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .diagram-toolbar button:hover {
      background: #f0f0f0;
      border-color: #4a90e2;
    }
    
    .diagram-toolbar button i {
      font-size: 14px;
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
    
    .context-menu {
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      padding: 5px 0;
      min-width: 150px;
      z-index: 1000;
      display: none;
    }
    
    .context-menu.show {
      display: block;
    }
    
    .context-menu-item {
      padding: 8px 15px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .context-menu-item:hover {
      background: #f0f0f0;
    }
    
    .context-menu-item i {
      width: 16px;
      text-align: center;
    }
    
    .context-menu-divider {
      height: 1px;
      background: #e0e0e0;
      margin: 5px 0;
    }
    
    .properties-pane {
      height: 100%;
      background: white;
      display: flex;
      flex-direction: column;
    }
    
    .connection-mode-active {
      background: #ff4444 !important;
      color: white !important;
      border-color: #ff4444 !important;
    }
    
    .rete-svg.connection-mode {
      cursor: crosshair;
    }
    
    .connection-hint {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    .context-menu {
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 1000;
      padding: 4px 0;
      min-width: 150px;
    }
    
    .context-menu button {
      display: block;
      width: 100%;
      padding: 8px 16px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 13px;
      transition: background-color 0.2s;
    }
    
    .context-menu button:hover {
      background-color: #f0f0f0;
    }
    
    .context-menu button.danger {
      color: #c00;
    }
    
    .context-menu button.danger:hover {
      background-color: #fee;
    }
    
    .context-menu i {
      margin-right: 8px;
      width: 16px;
      text-align: center;
    }
    
    .properties-header {
      padding: 10px 15px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .properties-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    
    .properties-header button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: #666;
    }
    
    .properties-content {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
    }
    
    .property-group {
      margin-bottom: 20px;
    }
    
    .property-group h5 {
      margin: 0 0 10px 0;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }
    
    .property-item {
      margin-bottom: 10px;
    }
    
    .property-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 3px;
    }
    
    .property-value {
      font-size: 13px;
      color: #333;
      padding: 5px 8px;
      background: #f5f5f5;
      border-radius: 3px;
      word-break: break-word;
    }
    
    .property-actions {
      margin-top: 10px;
      display: flex;
      gap: 5px;
    }
    
    .property-actions button {
      padding: 5px 10px;
      font-size: 12px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 3px;
      cursor: pointer;
    }
    
    .property-actions button:hover {
      background: #f0f0f0;
      border-color: #4a90e2;
    }
    
    .property-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #ddd;
      border-radius: 3px;
      font-size: 13px;
    }
    
    .property-textarea {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #ddd;
      border-radius: 3px;
      font-size: 13px;
      resize: vertical;
    }
    
    .property-value {
      font-size: 13px;
      color: #333;
      padding: 6px 10px;
      background: #f5f5f5;
      border-radius: 3px;
      min-height: 32px;
      display: flex;
      align-items: center;
    }
    
    .danger-button {
      background: #ff4444 !important;
      color: white !important;
      border-color: #ff4444 !important;
    }
    
    .danger-button:hover {
      background: #cc0000 !important;
      border-color: #cc0000 !important;
    }
    
    :host ::ng-deep .step-node.selected {
      filter: drop-shadow(0 0 8px #4a90e2);
    }
    
    :host ::ng-deep .connection-path.selected {
      stroke: #ff9800;
      stroke-width: 3;
    }
    
    :host ::ng-deep .output-socket:hover {
      r: 7;
      fill: #e3f2fd;
    }
    
    :host ::ng-deep .input-socket:hover {
      r: 7;
      fill: #e3f2fd;
    }
  `]
})
export class FlowAgentDiagramComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @ViewChild('reteContainer', { static: false }) reteContainer!: ElementRef<HTMLDivElement>;
  
  constructor(private dialogService: DialogService) {}
  
  @Input() agentId: string | null = null;
  @Input() steps: AIAgentStepEntity[] = [];
  @Input() paths: AIAgentStepPathEntity[] = [];
  @Input() EditMode: boolean = false;
  
  @Output() stepsChanged = new EventEmitter<void>();
  @Output() pathsChanged = new EventEmitter<void>();
  
  loading = true;
  error: string | null = null;
  
  // Selection state
  selectedItem: { type: 'step' | 'path', id: string } | null = null;
  selectedStep: AIAgentStepEntity | null = null;
  selectedPath: AIAgentStepPathEntity | null = null;
  
  // Connection mode state
  connectionMode = false;
  connectionSourceStepId: string | null = null;
  tempConnection: { path: string } | null = null;
  
  // Context menu state
  contextMenu = {
    visible: false,
    x: 0,
    y: 0,
    type: null as 'step' | 'path' | null,
    targetId: null as string | null
  };
  
  // Dropdown data
  stepTypes = ['Action', 'Sub-Agent', 'Prompt'];
  stepStatuses = ['Active', 'Disabled', 'Testing'];
  
  // Pan and zoom state
  panZoom = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isPanning: false,
    startX: 0,
    startY: 0
  };
  
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
      this.error = 'Failed to initialize flow diagram';
      this.loading = false;
    }
  }
  
  private createNodeElement(step: AIAgentStepEntity): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'step-node');
    g.setAttribute('data-step-id', step.ID);
    
    // Add event handlers
    g.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, step.ID));
    g.addEventListener('click', (e) => this.onNodeClick(e, step.ID));
    g.addEventListener('contextmenu', (e) => this.onNodeContextMenu(e, step.ID));
    g.style.cursor = this.EditMode ? 'move' : 'pointer';
    
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
    
    // Add icon for step type or starting step using simple text symbols
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', '15');
    iconText.setAttribute('y', (headerHeight / 2 + 5).toString());
    iconText.setAttribute('fill', 'white');
    iconText.setAttribute('font-size', '16');
    iconText.setAttribute('font-weight', 'bold');
    
    if (step.StartingStep) {
      iconText.textContent = '▶'; // Play symbol for start
    } else if (step.StepType === 'Action') {
      iconText.textContent = '⚙'; // Gear symbol for action
    } else if (step.StepType === 'Sub-Agent') {
      iconText.textContent = '🤖'; // Robot emoji for sub-agent
    } else if (step.StepType === 'Prompt') {
      iconText.textContent = '💬'; // Speech bubble for prompt
    } else {
      iconText.textContent = '●'; // Circle (default)
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
      inputSocket.setAttribute('class', 'input-socket');
      
      // Add drop zone handler for input socket
      if (this.EditMode) {
        inputSocket.addEventListener('mouseenter', (e) => this.onSocketMouseEnter(e, step.ID, 'input'));
        inputSocket.addEventListener('mouseleave', (e) => this.onSocketMouseLeave(e));
        inputSocket.addEventListener('mouseup', (e) => this.onSocketMouseUp(e, step.ID, 'input'));
      }
      
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
        outputSocket.setAttribute('class', 'output-socket');
        
        // Add drag handlers for socket
        if (this.EditMode) {
          outputSocket.addEventListener('mousedown', (e) => this.onSocketMouseDown(e, step.ID, 'output'));
          outputSocket.style.cursor = 'crosshair';
        }
        
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
      outputSocket.setAttribute('class', 'output-socket');
      
      // Add drag handlers for socket
      if (this.EditMode) {
        outputSocket.addEventListener('mousedown', (e) => this.onSocketMouseDown(e, step.ID, 'output'));
        outputSocket.style.cursor = 'crosshair';
      }
      
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
    path.setAttribute('data-path-id', pathData?.ID || '');
    
    // Add click handler
    g.addEventListener('click', (e) => {
      if (pathData) {
        this.onPathClick(e, pathData.ID);
      }
    });
    // Add context menu handler
    g.addEventListener('contextmenu', (e) => {
      if (pathData) {
        this.onPathContextMenu(e, pathData.ID);
      }
    });
    g.style.cursor = 'pointer';
    
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
    
    // Only allow dragging in edit mode
    if (!this.EditMode) return;
    
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
      step.PositionX = Math.round(x);
      step.PositionY = Math.round(y);
      
      // Save the step
      const result = await step.Save();
      if (!result) {
        // Failed to save step position
      }
    } catch (error) {
      // Error saving step position
    }
  }
  
  public async addNewStep() {
    try {
      const md = new Metadata();
      const newStep = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
      
      // Set default values
      newStep.AgentID = this.agentId!;
      newStep.Name = 'New Step';
      newStep.StepType = 'Action';
      newStep.Status = 'Active';
      newStep.StartingStep = this.steps.length === 0; // First step is starting step
      
      // Find a good position for the new step
      let x = 350;
      let y = 50;
      if (this.steps.length > 0) {
        // Place it to the right of existing steps
        const maxX = Math.max(...this.steps.map(s => s.PositionX || 0));
        x = maxX + 280;
        
        // Center vertically
        const avgY = this.steps.reduce((sum, s) => sum + (s.PositionY || 0), 0) / this.steps.length;
        y = avgY;
      }
      
      newStep.PositionX = Math.round(x);
      newStep.PositionY = Math.round(y);
      
      const result = await newStep.Save();
      if (result) {
        // Add to steps array
        this.steps.push(newStep);
        
        // Recreate diagram
        await this.initializeDiagram();
        
        // Select the new step
        this.selectStep(newStep.ID);
        
        // Emit change
        this.stepsChanged.emit();
      }
    } catch (error) {
      alert('Failed to create new step');
    }
  }
  
  public async autoArrange() {
    // Reset all positions to 0,0 to trigger auto-layout
    for (const step of this.steps) {
      step.PositionX = 0;
      step.PositionY = 0;
    }
    
    // Re-arrange nodes
    await this.arrangeNodes();
    
    // Save all positions
    for (const step of this.steps) {
      const element = this.nodeElements.get(step.ID);
      if (element) {
        const transform = element.getAttribute('transform');
        const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (match) {
          const x = Math.round(parseFloat(match[1]));
          const y = Math.round(parseFloat(match[2]));
          await this.saveStepPosition(step.ID, x, y);
        }
      }
    }
  }
  
  // Selection handling
  private onNodeClick(event: MouseEvent, stepId: string) {
    event.stopPropagation();
    
    if (this.connectionMode) {
      // Handle connection creation
      this.handleConnectionCreation(stepId);
    } else {
      // Handle selection
      this.selectStep(stepId);
    }
  }
  
  private onPathClick(event: MouseEvent, pathId: string) {
    event.stopPropagation();
    this.selectPath(pathId);
  }
  
  private selectStep(stepId: string) {
    // Clear previous selection
    this.clearSelection();
    
    // Set new selection
    this.selectedItem = { type: 'step', id: stepId };
    this.selectedStep = this.steps.find(s => s.ID === stepId) || null;
    this.selectedPath = null;
    
    // Update visual selection
    const element = this.nodeElements.get(stepId);
    if (element) {
      element.classList.add('selected');
    }
  }
  
  private selectPath(pathId: string) {
    // Clear previous selection
    this.clearSelection();
    
    // Set new selection
    this.selectedItem = { type: 'path', id: pathId };
    this.selectedPath = this.paths.find(p => p.ID === pathId) || null;
    this.selectedStep = null;
    
    // Update visual selection
    const element = this.connectionElements.get(pathId);
    if (element) {
      const path = element.querySelector('path');
      if (path) {
        path.classList.add('selected');
      }
    }
  }
  
  private clearSelection() {
    // Clear visual selection
    this.nodeElements.forEach(element => {
      element.classList.remove('selected');
    });
    
    this.connectionElements.forEach(element => {
      const path = element.querySelector('path');
      if (path) {
        path.classList.remove('selected');
      }
    });
  }
  
  public closeProperties() {
    this.selectedItem = null;
    this.selectedStep = null;
    this.selectedPath = null;
    this.clearSelection();
  }
  
  // Connection mode handling
  public connectFromStep() {
    if (!this.selectedStep) return;
    
    this.connectionMode = true;
    this.connectionSourceStepId = this.selectedStep.ID;
    this.closeProperties();
  }
  
  public cancelConnectionMode() {
    this.connectionMode = false;
    this.connectionSourceStepId = null;
    this.tempConnection = null;
  }
  
  private async handleConnectionCreation(targetStepId: string) {
    if (!this.connectionSourceStepId || this.connectionSourceStepId === targetStepId) {
      this.cancelConnectionMode();
      return;
    }
    
    try {
      // Create new path entity
      const md = new Metadata();
      const newPath = await md.GetEntityObject<AIAgentStepPathEntity>('MJ: AI Agent Step Paths');
      
      newPath.OriginStepID = this.connectionSourceStepId;
      newPath.DestinationStepID = targetStepId;
      newPath.Priority = 0;
      newPath.Condition = '';
      
      const result = await newPath.Save();
      if (result) {
        // Add to paths array
        this.paths.push(newPath);
        
        // Recreate the diagram to show new path
        await this.initializeDiagram();
        
        // Emit change
        this.pathsChanged.emit();
        
        // Select the new path
        this.selectPath(newPath.ID);
      }
    } catch (error) {
      alert('Failed to create connection');
    } finally {
      this.cancelConnectionMode();
    }
  }
  
  public onSvgClick(event: MouseEvent) {
    // Clear selection if clicking on empty space
    if (event.target === event.currentTarget) {
      this.closeProperties();
    }
    // Hide context menu
    this.contextMenu.visible = false;
  }
  
  public onSvgContextMenu(event: MouseEvent) {
    event.preventDefault();
    // Hide context menu if right-clicking on empty space
    this.contextMenu.visible = false;
  }
  
  // Document click handler to hide context menu
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Hide context menu when clicking outside
    if (this.contextMenu.visible) {
      this.contextMenu.visible = false;
    }
  }
  
  // Mouse move handler for magnetic connection
  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (this.connectionMode && this.connectionSourceStepId) {
      this.updateTempConnection(event);
    }
  }
  
  private updateTempConnection(event: MouseEvent) {
    if (!this.reteContainer) return;
    
    const svg = this.reteContainer.nativeElement.querySelector('svg');
    if (!svg) return;
    
    const sourceElement = this.nodeElements.get(this.connectionSourceStepId!);
    if (!sourceElement) return;
    
    // Get source position
    const sourceTransform = sourceElement.getAttribute('transform');
    const sourceMatch = sourceTransform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    if (!sourceMatch) return;
    
    const sourceX = parseFloat(sourceMatch[1]) + 140; // node width
    const sourceY = parseFloat(sourceMatch[2]) + 40; // half height
    
    // Get mouse position in SVG coordinates
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    // Create bezier path
    const dx = svgP.x - sourceX;
    const cx1 = sourceX + dx * 0.5;
    const cy1 = sourceY;
    const cx2 = svgP.x - dx * 0.5;
    const cy2 = svgP.y;
    
    this.tempConnection = {
      path: `M ${sourceX} ${sourceY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${svgP.x} ${svgP.y}`
    };
  }
  
  // Property editing methods
  public async saveStepProperties() {
    if (!this.selectedStep) return;
    
    try {
      const result = await this.selectedStep.Save();
      if (result) {
        // Don't reinitialize the diagram - just emit change event
        this.stepsChanged.emit();
      }
    } catch (error) {
      alert('Failed to save step properties');
    }
  }
  
  public async savePathProperties() {
    if (!this.selectedPath) return;
    
    try {
      const result = await this.selectedPath.Save();
      if (result) {
        // Don't reinitialize the diagram - just emit change event
        this.pathsChanged.emit();
      }
    } catch (error) {
      alert('Failed to save path properties');
    }
  }
  
  private async showConfirmDialog(title: string, content: string): Promise<boolean> {
    const dialog = this.dialogService.open({
      title: title,
      content: content,
      actions: [
        { text: 'No', primary: false },
        { text: 'Yes', primary: true, themeColor: 'primary' }
      ],
      width: 450,
      height: 200
    });
    
    try {
      const result = await dialog.result;
      return !!(result && (result as any).text === 'Yes');
    } catch {
      // Dialog was closed with X button or ESC
      return false;
    }
  }
  
  public async deleteSelectedStep() {
    if (!this.selectedStep) return;
    
    const confirmed = await this.showConfirmDialog(
      'Delete Step',
      `Are you sure you want to delete the step "${this.selectedStep.Name}"? This will also delete all connected paths.`
    );
    
    if (!confirmed) return;
    
    try {
      // Delete all paths connected to this step
      const connectedPaths = this.paths.filter(p => 
        p.OriginStepID === this.selectedStep!.ID || 
        p.DestinationStepID === this.selectedStep!.ID
      );
      
      for (const path of connectedPaths) {
        const pathResult = await path.Delete();
        if (!pathResult) {
          // Log the error details
          if (path.LatestResult) {
            console.error('Failed to delete path:', {
              pathId: path.ID,
              error: path.LatestResult.CompleteMessage,
              errors: path.LatestResult.Errors,
              message: path.LatestResult.CompleteMessage
            });
          }
          alert('Failed to delete connected paths. Cannot delete step.');
          return;
        }
      }
      
      // Delete the step
      const result = await this.selectedStep.Delete();
      if (result) {
        // Remove from arrays
        this.steps = this.steps.filter(s => s.ID !== this.selectedStep!.ID);
        this.paths = this.paths.filter(p => 
          p.OriginStepID !== this.selectedStep!.ID && 
          p.DestinationStepID !== this.selectedStep!.ID
        );
        
        // Close properties
        this.closeProperties();
        
        // Recreate diagram
        await this.initializeDiagram();
        
        // Emit changes
        this.stepsChanged.emit();
        this.pathsChanged.emit();
      } else {
        // Log the error details
        if (this.selectedStep.LatestResult) {
          console.error('Failed to delete step:', {
            stepId: this.selectedStep.ID,
            stepName: this.selectedStep.Name,
            error: this.selectedStep.LatestResult.CompleteMessage,
            errors: this.selectedStep.LatestResult.Errors,
            message: this.selectedStep.LatestResult.CompleteMessage
          });
        }
        alert('Failed to delete step. Please check the console for details.');
      }
    } catch (error) {
      console.error('Exception while deleting step:', error);
      alert('Failed to delete step. Please ensure all related connections are removed first.');
    }
  }
  
  public async deleteSelectedPath() {
    if (!this.selectedPath) return;
    
    const confirmed = await this.showConfirmDialog(
      'Delete Connection',
      'Are you sure you want to delete this connection?'
    );
    
    if (!confirmed) return;
    
    try {
      const result = await this.selectedPath.Delete();
      if (result) {
        // Remove from array
        this.paths = this.paths.filter(p => p.ID !== this.selectedPath!.ID);
        
        // Close properties
        this.closeProperties();
        
        // Recreate diagram
        await this.initializeDiagram();
        
        // Emit change
        this.pathsChanged.emit();
      } else {
        // Log the error details
        if (this.selectedPath.LatestResult) {
          console.error('Failed to delete path:', {
            pathId: this.selectedPath.ID,
            originStepId: this.selectedPath.OriginStepID,
            destinationStepId: this.selectedPath.DestinationStepID,
            error: this.selectedPath.LatestResult.CompleteMessage,
            errors: this.selectedPath.LatestResult.Errors,
            message: this.selectedPath.LatestResult.CompleteMessage
          });
        }
        alert('Failed to delete connection. Please check the console for details.');
      }
    } catch (error) {
      console.error('Exception while deleting path:', error);
      alert('Failed to delete connection');
    }
  }
  
  public getStepName(stepId: string): string {
    const step = this.steps.find(s => s.ID === stepId);
    return step?.Name || 'Unknown Step';
  }
  
  // Pan and zoom methods
  public zoomIn() {
    this.panZoom.scale = Math.min(this.panZoom.scale * 1.2, 3);
    this.updateTransform();
  }
  
  public zoomOut() {
    this.panZoom.scale = Math.max(this.panZoom.scale / 1.2, 0.3);
    this.updateTransform();
  }
  
  public resetZoom() {
    this.panZoom.scale = 1;
    this.panZoom.translateX = 0;
    this.panZoom.translateY = 0;
    this.updateTransform();
  }
  
  onWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.panZoom.scale = Math.max(0.3, Math.min(3, this.panZoom.scale * delta));
    this.updateTransform();
  }
  
  onSvgMouseDown(event: MouseEvent) {
    if (event.button === 0 && !this.connectionMode && event.target === event.currentTarget) {
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
    const svg = this.reteContainer?.nativeElement?.querySelector('svg');
    if (svg) {
      const mainGroup = svg.querySelector('g');
      if (mainGroup) {
        mainGroup.setAttribute('transform', 
          `translate(${this.panZoom.translateX}, ${this.panZoom.translateY}) scale(${this.panZoom.scale})`);
      }
    }
  }
  
  // Context menu methods
  private onNodeContextMenu(event: MouseEvent, stepId: string) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.EditMode) return;
    
    // Show context menu
    const rect = this.reteContainer.nativeElement.getBoundingClientRect();
    this.contextMenu = {
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      type: 'step',
      targetId: stepId
    };
    
    // Select the step
    this.selectStep(stepId);
  }
  
  private onPathContextMenu(event: MouseEvent, pathId: string) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.EditMode) return;
    
    // Show context menu
    const rect = this.reteContainer.nativeElement.getBoundingClientRect();
    this.contextMenu = {
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      type: 'path',
      targetId: pathId
    };
    
    // Select the path
    this.selectPath(pathId);
  }
  
  public connectFromContextMenu() {
    if (this.contextMenu.targetId) {
      this.contextMenu.visible = false;
      this.connectFromStep();
    }
  }
  
  public deleteFromContextMenu() {
    if (this.contextMenu.targetId) {
      this.contextMenu.visible = false;
      this.deleteSelectedStep();
    }
  }
  
  public deletePathFromContextMenu() {
    if (this.contextMenu.targetId) {
      this.contextMenu.visible = false;
      this.deleteSelectedPath();
    }
  }
  
  // Socket drag-and-drop handlers
  private onSocketMouseDown(event: MouseEvent, stepId: string, socketType: 'input' | 'output') {
    event.stopPropagation();
    event.preventDefault();
    
    if (socketType === 'output') {
      // Start connection from output socket
      this.connectionMode = true;
      this.connectionSourceStepId = stepId;
      
      // Create temp connection that follows mouse
      const sourceNode = this.nodeElements.get(stepId);
      if (sourceNode) {
        const transform = sourceNode.getAttribute('transform');
        const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (match) {
          const nodeX = parseFloat(match[1]);
          const nodeY = parseFloat(match[2]);
          const outputX = nodeX + 140; // Node width
          const outputY = nodeY + 40; // Node height / 2
          
          // Start tracking mouse for temp connection
          this.updateTempConnection(event);
        }
      }
    }
  }
  
  private onSocketMouseEnter(event: MouseEvent, stepId: string, socketType: 'input' | 'output') {
    if (this.connectionMode && socketType === 'input' && stepId !== this.connectionSourceStepId) {
      // Highlight socket when hovering during connection mode
      const socket = event.target as SVGElement;
      socket.setAttribute('r', '7');
      socket.setAttribute('fill', '#4a90e2');
    }
  }
  
  private onSocketMouseLeave(event: MouseEvent) {
    if (this.connectionMode) {
      // Remove highlight
      const socket = event.target as SVGElement;
      socket.setAttribute('r', '5');
      socket.setAttribute('fill', 'white');
    }
  }
  
  private onSocketMouseUp(event: MouseEvent, stepId: string, socketType: 'input' | 'output') {
    if (this.connectionMode && socketType === 'input' && this.connectionSourceStepId && stepId !== this.connectionSourceStepId) {
      // Complete the connection
      event.stopPropagation();
      this.handleConnectionCreation(stepId);
    }
  }
}