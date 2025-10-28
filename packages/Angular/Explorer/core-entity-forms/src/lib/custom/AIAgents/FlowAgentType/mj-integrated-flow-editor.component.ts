import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, AfterViewInit, OnChanges, SimpleChanges, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

// Import standalone flow editor components
import { FlowEditorComponent } from './flow-editor-integration/components/flow-editor/flow-editor.component';
import { PropertiesPanelComponent } from './flow-editor-integration/components/properties-panel/properties-panel.component';
import { ExecutionPanelComponent } from './flow-editor-integration/components/execution-panel/execution-panel.component';
import { ToolbarComponent } from './flow-editor-integration/components/toolbar/toolbar.component';

// Import services
import { FlowEditorService } from './flow-editor-integration/services/flow-editor.service';
import { FlowExecutorService } from './flow-editor-integration/services/flow-executor.service';
import { MJFlowTransformerService } from './flow-editor-integration/services/mj-flow-transformer.service';

// Import models
import { Step } from './flow-editor-integration/models/step.model';
import { Connection } from './flow-editor-integration/models/connection.model';
import { MJStep, MJConnection } from './flow-editor-integration/models/mj-extended.model';

@Component({
  selector: 'mj-integrated-flow-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FlowEditorComponent,
    PropertiesPanelComponent,
    ExecutionPanelComponent,
    ToolbarComponent
  ],
  template: `
    <div class="mj-integrated-flow-editor">
      <!-- Header with mode toggle -->
      <div class="editor-header">
        <div class="header-left">
          <span class="agent-id" *ngIf="agentId">Agent ID: {{ agentId }}</span>
        </div>
        <div class="header-right">
          <button class="btn-save" *ngIf="EditMode" (click)="saveAllChanges()" [disabled]="saving">
            <i class="fa-solid" [class.fa-save]="!saving" [class.fa-spinner]="saving" [class.fa-spin]="saving"></i>
            {{ saving ? 'Saving...' : 'Save All Changes' }}
          </button>
        </div>
      </div>

      <!-- Main editor area -->
      <div class="editor-container" [class.with-execution]="showExecutionPanel">
        <!-- Toolbar -->
        <div class="toolbar-container" *ngIf="EditMode">
          <app-toolbar 
            (stepDragStart)="onStepDragStart($event)"
            (stepDragEnd)="onStepDragEnd()"></app-toolbar>
        </div>

        <!-- Flow Editor Canvas -->
        <div class="canvas-container">
          <app-flow-editor #flowEditor 
                          (toggleExecution)="toggleExecutionPanel()"
                          (stepMoved)="onStepMoved($event)"></app-flow-editor>
        </div>

        <!-- Properties Panel -->
        <div class="properties-container" 
             [class.visible]="selectedStep"
             [style.width.px]="selectedStep ? 320 : 0">
          <app-properties-panel *ngIf="selectedStep"></app-properties-panel>
        </div>
      </div>

      <!-- Execution Panel -->
      <div class="execution-container" *ngIf="showExecutionPanel">
        <app-execution-panel></app-execution-panel>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <span class="status-item">
          <i class="fa-solid fa-circle-nodes"></i>
          {{ stepCount }} Steps
        </span>
        <span class="status-item">
          <i class="fa-solid fa-link"></i>
          {{ connectionCount }} Connections
        </span>
        <span class="status-item" *ngIf="lastSaved">
          <i class="fa-solid fa-clock"></i>
          Last saved: {{ lastSaved | date:'short' }}
        </span>
        <span class="status-item unsaved" *ngIf="hasUnsavedChanges">
          <i class="fa-solid fa-exclamation-triangle"></i>
          Unsaved changes
        </span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 600px; /* Ensure minimum height */
    }
    
    .mj-integrated-flow-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 600px; /* Ensure minimum height */
      background: #f5f6fa;
      border-radius: 8px;
      overflow: hidden;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      background: white;
      border-bottom: 1px solid #e1e4e8;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .header-left h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .agent-id {
      font-size: 12px;
      color: #6c757d;
      background: #f0f2f5;
      padding: 4px 10px;
      border-radius: 12px;
    }

    .header-right {
      display: flex;
      gap: 10px;
    }

    .btn-save, .btn-mode {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-save {
      background: #10b981;
      color: white;
    }

    .btn-save:hover:not(:disabled) {
      background: #059669;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }

    .btn-save:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-mode {
      background: #6366f1;
      color: white;
    }

    .btn-mode:hover {
      background: #4f46e5;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
    }

    .editor-container {
      flex: 1;
      display: flex;
      position: relative;
      overflow: visible; /* Allow properties panel to be visible */
      transition: margin-bottom 0.3s;
      min-height: 500px;
    }

    .editor-container.with-execution {
      margin-bottom: 250px;
    }

    .toolbar-container {
      width: 80px;
      background: white;
      border-right: 1px solid #e1e4e8;
      padding: 10px;
      overflow-y: auto;
    }

    .canvas-container {
      flex: 1;
      position: relative;
      background: #fafbfc;
      overflow: hidden; /* Keep canvas overflow hidden */
    }

    .properties-container {
      width: 0;
      min-width: 0;
      max-width: 320px;
      background: white;
      border-left: 1px solid #e1e4e8;
      overflow: hidden;
      transition: width 0.3s ease, min-width 0.3s ease;
      position: relative;
      box-shadow: -2px 0 5px rgba(0,0,0,0.05);
      flex-shrink: 0; /* Prevent the container from shrinking */
      height: 100%; /* Full height of parent */
    }

    .properties-container.visible {
      width: 320px !important; /* Force the width with !important */
      min-width: 320px !important;
      overflow-y: auto;
      overflow-x: hidden;
    }
    
    app-properties-panel {
      display: block;
      width: 100%;
      height: 100%;
    }

    .execution-container {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 250px;
      background: white;
      border-top: 2px solid #e1e4e8;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
      z-index: 100;
    }

    .status-bar {
      display: flex;
      gap: 20px;
      padding: 8px 20px;
      background: white;
      border-top: 1px solid #e1e4e8;
      font-size: 12px;
      color: #6c757d;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .status-item.unsaved {
      color: #f59e0b;
      font-weight: 500;
    }

    .status-item i {
      font-size: 11px;
    }
  `],
  providers: [FlowEditorService, FlowExecutorService, MJFlowTransformerService]
})
export class MJIntegratedFlowEditorComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @ViewChild('flowEditor') flowEditorComponent!: FlowEditorComponent;
  
  @Input() agentId: string | null = null;
  @Input() steps: AIAgentStepEntity[] = [];
  @Input() paths: AIAgentStepPathEntity[] = [];
  @Input() EditMode: boolean = false;
  
  @Output() stepsChanged = new EventEmitter<void>();
  @Output() pathsChanged = new EventEmitter<void>();
  
  // UI state
  showExecutionPanel = false;
  selectedStep: MJStep | null = null;
  stepCount = 0;
  connectionCount = 0;
  lastSaved: Date | null = null;
  hasUnsavedChanges = false;
  saving = false;
  
  private destroy$ = new Subject<void>();
  private changeDebounce$ = new Subject<void>();
  
  constructor(
    private flowEditorService: FlowEditorService,
    private flowExecutorService: FlowExecutorService,
    private transformerService: MJFlowTransformerService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnChanges(changes: SimpleChanges) {
    // When input data changes, reload the flow
    if ((changes['steps'] || changes['paths']) && this.flowEditorComponent) {
      this.loadFlowData();
    }
  }
  
  ngOnInit() {
    // Subscribe to flow editor changes
    if (this.flowEditorService && (this.flowEditorService as any).selectedNode) {
      (this.flowEditorService as any).selectedNode
        .pipe(takeUntil(this.destroy$))
        .subscribe((node: MJStep | null) => {
          this.selectedStep = node;
          this.cdr.detectChanges();
        });
    }
    
    // Track changes for auto-save indication
    this.changeDebounce$
      .pipe(
        debounceTime(1000),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.hasUnsavedChanges = true;
        this.cdr.detectChanges();
      });
    
    // Subscribe to flow changes
    this.subscribeToFlowChanges();
  }
  
  ngAfterViewInit() {
    // Load flow data after view is initialized
    // This ensures the flow editor component is ready
    this.loadFlowData();
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  private loadFlowData() {
    // Transform MJ entities to standalone models
    const { steps: transformedSteps, connections } = this.transformerService.transformToStandaloneModels(
      this.steps,
      this.paths
    );
    
    // Load saved positions from LocalStorage if available
    if (this.agentId) {
      const savedPositions = this.loadPositionsFromLocalStorage();
      if (savedPositions) {
        transformedSteps.forEach(step => {
          const savedPos = savedPositions[step.id];
          if (savedPos) {
            step.position = [savedPos.x, savedPos.y];
          }
        });
      }
    }
    
    // Load transformed data into the flow editor
    
    // Load into flow editor service
    this.flowEditorService.setAllSteps(transformedSteps);
    // Store connections in a property for now
    (this.flowEditorService as any).connections = connections;
    
    // Update counts
    this.stepCount = transformedSteps.length;
    this.connectionCount = connections.length;
    
    // Initialize the flow editor component if it exists
    // We need to wait for the component to be ready
    setTimeout(() => {
      if (this.flowEditorComponent) {
        this.flowEditorComponent.steps = transformedSteps;
        this.flowEditorComponent.connections = connections;
        // Trigger the flow editor to render the data
        this.flowEditorComponent.loadFlowData();
      }
    }, 100);
  }
  
  private subscribeToFlowChanges() {
    // For now, we'll track changes through the component itself
    // since the service doesn't have observables for these
    this.stepCount = this.steps.length;
    this.connectionCount = this.paths.length;
  }
  
  async saveAllChanges() {
    if (!this.EditMode || this.saving) return;
    
    this.saving = true;
    
    try {
      // Get current state from flow editor
      const currentSteps = this.flowEditorService.getAllSteps() as MJStep[];
      const currentConnections = ((this.flowEditorService as any).connections || []) as MJConnection[];
      
      // Transform back to MJ entities
      const {
        stepsToUpdate,
        pathsToUpdate,
        stepsToCreate,
        pathsToCreate
      } = this.transformerService.transformToMJEntities(
        currentSteps,
        currentConnections,
        this.steps,
        this.paths
      );
      
      // Save all updates
      const md = new Metadata();
      
      // Update existing steps
      for (const step of stepsToUpdate) {
        await step.Save();
      }
      
      // Create new steps
      for (const stepData of stepsToCreate) {
        const newStep = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
        Object.assign(newStep, stepData);
        newStep.AgentID = this.agentId!;
        await newStep.Save();
        
        // Add to our steps array and update the standalone model
        this.steps.push(newStep);
        
        // Update the mjEntityId in the standalone model
        const standaloneStep = currentSteps.find((s: MJStep) => s.name === stepData.Name);
        if (standaloneStep) {
          (standaloneStep as any).mjEntityId = newStep.ID;
        }
      }
      
      // Update existing paths
      for (const path of pathsToUpdate) {
        await path.Save();
      }
      
      // Create new paths
      for (const pathData of pathsToCreate) {
        const newPath = await md.GetEntityObject<AIAgentStepPathEntity>('MJ: AI Agent Step Paths');
        Object.assign(newPath, pathData);
        await newPath.Save();
        
        // Add to our paths array
        this.paths.push(newPath);
        
        // Update the mjEntityId in the standalone model
        // Note: We need to find by comparing the original step IDs, not the numeric IDs
        const standaloneConnection = currentConnections.find(
          (c: MJConnection) => {
            // Find source and target steps by their MJ entity IDs
            const sourceStep = currentSteps.find(s => s.mjEntityId === pathData.OriginStepID);
            const targetStep = currentSteps.find(s => s.mjEntityId === pathData.DestinationStepID);
            return sourceStep && targetStep && c.source === sourceStep.id && c.target === targetStep.id;
          }
        );
        if (standaloneConnection) {
          (standaloneConnection as any).mjEntityId = newPath.ID;
        }
      }
      
      // Handle deletions (steps/paths that exist in MJ but not in current editor state)
      await this.handleDeletions(currentSteps, currentConnections);
      
      // Update state
      this.lastSaved = new Date();
      this.hasUnsavedChanges = false;
      
      // Emit change events
      this.stepsChanged.emit();
      this.pathsChanged.emit();
      
    } catch (error) {
      console.error('Failed to save changes:', error);
      alert('Failed to save changes. Please check the console for details.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
  
  private async handleDeletions(currentSteps: MJStep[], currentConnections: MJConnection[]) {
    // Find steps that exist in MJ but not in current state
    const currentStepIds = new Set(currentSteps.map(s => s.mjEntityId).filter(id => id));
    const stepsToDelete = this.steps.filter(mjStep => !currentStepIds.has(mjStep.ID));
    
    // Find paths that exist in MJ but not in current state
    const currentPathIds = new Set(currentConnections.map(c => c.mjEntityId).filter(id => id));
    const pathsToDelete = this.paths.filter(mjPath => !currentPathIds.has(mjPath.ID));
    
    // Delete removed paths first (due to foreign key constraints)
    for (const path of pathsToDelete) {
      await path.Delete();
      const index = this.paths.indexOf(path);
      if (index > -1) {
        this.paths.splice(index, 1);
      }
    }
    
    // Delete removed steps
    for (const step of stepsToDelete) {
      await step.Delete();
      const index = this.steps.indexOf(step);
      if (index > -1) {
        this.steps.splice(index, 1);
      }
    }
  }
  
  toggleExecutionPanel() {
    this.showExecutionPanel = !this.showExecutionPanel;
    this.cdr.detectChanges();
  }
  
  onStepDragStart(event: any) {
    // Handle drag start from toolbar
  }
  
  onStepDragEnd() {
    // Handle drag end
    // Save positions when step dragging ends
    this.savePositionsToLocalStorage();
  }
  
  onStepMoved(step: Step) {
    // Save positions to LocalStorage when a step is moved
    this.savePositionsToLocalStorage();
  }
  
  onStepUpdated(updatedStep: MJStep) {
    // Handle step updates from properties panel
    
    // Find and update the step in our local array
    const index = this.flowEditorService.getAllSteps().findIndex((s: any) => s.id === updatedStep.id);
    if (index !== -1) {
      const steps = this.flowEditorService.getAllSteps();
      steps[index] = updatedStep;
      this.flowEditorService.setAllSteps(steps);
      
      // Mark as having unsaved changes
      this.hasUnsavedChanges = true;
      this.changeDebounce$.next();
      this.cdr.detectChanges();
    }
  }
  
  // Public methods for parent component interaction
  public refreshFlow() {
    this.loadFlowData();
  }
  
  public async executeFlow() {
    if (!this.showExecutionPanel) {
      this.showExecutionPanel = true;
    }
    
    // Execute using the flow executor service
    const steps = this.flowEditorService.getAllSteps() as MJStep[];
    const connections = ((this.flowEditorService as any).connections || []) as MJConnection[];
    
    await this.flowExecutorService.executeFlow(steps, connections);
  }
  
  private loadPositionsFromLocalStorage(): { [stepId: string]: { x: number, y: number } } | null {
    if (!this.agentId) return null;
    
    const storageKey = `flow-positions-${this.agentId}`;
    const savedData = localStorage.getItem(storageKey);
    
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        return parsed.steps || null;
      } catch (e) {
        console.error('Failed to parse saved positions:', e);
        return null;
      }
    }
    
    return null;
  }
  
  private savePositionsToLocalStorage() {
    if (!this.agentId || !this.flowEditorComponent) return;
    
    const positions: { [stepId: string]: { x: number, y: number } } = {};
    
    this.flowEditorComponent.steps.forEach(step => {
      positions[step.id] = {
        x: step.position[0],
        y: step.position[1]
      };
    });
    
    const storageKey = `flow-positions-${this.agentId}`;
    const dataToSave = {
      steps: positions,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(storageKey, JSON.stringify(dataToSave));
  }
}