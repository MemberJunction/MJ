import {
  Component, Input, Output, EventEmitter, ViewChild, OnInit, OnChanges, OnDestroy,
  SimpleChanges, ChangeDetectorRef, ViewEncapsulation, HostListener, HostBinding,
  ElementRef, Renderer2
} from '@angular/core';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity, ActionEntity, AIPromptEntity, AIAgentEntity } from '@memberjunction/core-entities';
import { FlowNode, FlowConnection, FlowNodeAddedEvent, FlowConnectionCreatedEvent, FlowNodeTypeConfig } from '../interfaces/flow-types';
import { FlowEditorComponent } from '../components/flow-editor.component';
import { AgentFlowTransformerService, AGENT_STEP_TYPE_CONFIGS } from './agent-flow-transformer.service';

/** View mode for the agent editor */
export type AgentEditorViewMode = 'diagram' | 'list';

/**
 * Flow Agent Editor — wraps the generic FlowEditorComponent with
 * MJ agent-specific CRUD, properties panel, and data transformation.
 */
@Component({
  selector: 'mj-flow-agent-editor',
  templateUrl: './flow-agent-editor.component.html',
  styleUrls: ['./flow-agent-editor.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [AgentFlowTransformerService]
})
export class FlowAgentEditorComponent implements OnInit, OnChanges, OnDestroy {
  // ── Host Bindings ─────────────────────────────────────────────
  @HostBinding('class.mj-flow-agent-editor--fullscreen') get HostFullScreen(): boolean { return this.FullScreen; }

  // ── Inputs ──────────────────────────────────────────────────
  @Input() AgentID: string | null = null;
  @Input() EditMode = true;
  @Input() FullScreen = false;

  // ── Outputs ─────────────────────────────────────────────────
  @Output() FlowSaved = new EventEmitter<void>();
  @Output() FlowChanged = new EventEmitter<boolean>();
  @Output() FullScreenToggled = new EventEmitter<boolean>();
  @Output() StepSelected = new EventEmitter<AIAgentStepEntity | null>();

  // ── View Children ───────────────────────────────────────────
  @ViewChild('flowEditor') protected flowEditor: FlowEditorComponent | undefined;

  // ── State ───────────────────────────────────────────────────
  protected nodes: FlowNode[] = [];
  protected connections: FlowConnection[] = [];
  protected nodeTypes: FlowNodeTypeConfig[] = AGENT_STEP_TYPE_CONFIGS;
  protected viewMode: AgentEditorViewMode = 'diagram';
  protected isLoading = true;
  protected isSaving = false;
  protected hasUnsavedChanges = false;
  protected lastSaved: Date | null = null;

  // Entity data
  protected steps: AIAgentStepEntity[] = [];
  protected paths: AIAgentStepPathEntity[] = [];
  protected deletedStepIDs: string[] = [];
  protected deletedPathIDs: string[] = [];

  // Selected items
  protected selectedStep: AIAgentStepEntity | null = null;
  protected selectedConnection: FlowConnection | null = null;
  protected selectedPathEntity: AIAgentStepPathEntity | null = null;
  protected showPropertiesPanel = false;

  // Picker data
  protected availableActions: Array<{ ID: string; Name: string }> = [];
  protected availablePrompts: Array<{ ID: string; Name: string }> = [];
  protected availableAgents: Array<{ ID: string; Name: string }> = [];

  // Fullscreen DOM relocation state
  private originalParent: HTMLElement | null = null;
  private originalNextSibling: Node | null = null;
  private backdropElement: HTMLElement | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private transformer: AgentFlowTransformerService,
    private elRef: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────

  ngOnInit(): void {
    if (this.AgentID) {
      this.loadAll();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['AgentID'] && !changes['AgentID'].firstChange && this.AgentID) {
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    // Restore element to original parent if still in fullscreen
    if (this.FullScreen) {
      this.restoreFromFullscreen();
    }
  }

  // ── Data Loading ────────────────────────────────────────────

  private async loadAll(): Promise<void> {
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      await Promise.all([
        this.loadStepsAndPaths(),
        this.loadPickerData()
      ]);
      this.rebuildFlowModel();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadStepsAndPaths(): Promise<void> {
    if (!this.AgentID) return;
    const rv = new RunView();
    const [stepsResult, pathsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: AI Agent Steps',
        ExtraFilter: `AgentID='${this.AgentID}'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'MJ: AI Agent Step Paths',
        ExtraFilter: `OriginStepID IN (SELECT ID FROM [__mj].[AIAgentStep] WHERE AgentID='${this.AgentID}')`,
        OrderBy: 'Priority DESC',
        ResultType: 'entity_object'
      }
    ]);

    this.steps = stepsResult.Success ? (stepsResult.Results as AIAgentStepEntity[]) : [];
    this.paths = pathsResult.Success ? (pathsResult.Results as AIAgentStepPathEntity[]) : [];
    this.deletedStepIDs = [];
    this.deletedPathIDs = [];
  }

  private async loadPickerData(): Promise<void> {
    const rv = new RunView();
    const [actionsResult, promptsResult, agentsResult] = await rv.RunViews([
      {
        EntityName: 'Actions',
        Fields: ['ID', 'Name'],
        ExtraFilter: `Status='Active'`,
        OrderBy: 'Name ASC',
        ResultType: 'simple'
      },
      {
        EntityName: 'AI Prompts',
        Fields: ['ID', 'Name'],
        ExtraFilter: '',
        OrderBy: 'Name ASC',
        ResultType: 'simple'
      },
      {
        EntityName: 'AI Agents',
        Fields: ['ID', 'Name'],
        ExtraFilter: this.AgentID ? `ID <> '${this.AgentID}'` : '',
        OrderBy: 'Name ASC',
        ResultType: 'simple'
      }
    ]);

    this.availableActions = actionsResult.Success
      ? (actionsResult.Results as Array<{ ID: string; Name: string }>)
      : [];
    this.availablePrompts = promptsResult.Success
      ? (promptsResult.Results as Array<{ ID: string; Name: string }>)
      : [];
    this.availableAgents = agentsResult.Success
      ? (agentsResult.Results as Array<{ ID: string; Name: string }>)
      : [];
  }

  private rebuildFlowModel(): void {
    this.nodes = this.transformer.StepsToNodes(this.steps);
    this.connections = this.transformer.PathsToConnections(this.paths);

    // Auto-layout if no positions are set (all at 0,0)
    const allAtOrigin = this.nodes.every(n => n.Position.X === 0 && n.Position.Y === 0);
    if (allAtOrigin && this.nodes.length > 0) {
      setTimeout(() => this.flowEditor?.AutoArrange(), 300);
    }
  }

  // ── Save ────────────────────────────────────────────────────

  async Save(): Promise<void> {
    if (this.isSaving || !this.AgentID) return;
    this.isSaving = true;
    this.cdr.detectChanges();

    try {
      // Update positions from canvas to entities
      this.syncPositionsFromCanvas();

      // Delete removed items first
      await this.deleteRemovedEntities();

      // Save all steps
      for (const step of this.steps) {
        const result = await step.Save();
        if (!result) {
          console.error(`Failed to save step: ${step.Name}`, step.LatestResult);
        }
      }

      // Save all paths
      for (const path of this.paths) {
        const result = await path.Save();
        if (!result) {
          console.error(`Failed to save path: ${path.ID}`, path.LatestResult);
        }
      }

      this.hasUnsavedChanges = false;
      this.lastSaved = new Date();
      this.FlowSaved.emit();
    } catch (err) {
      console.error('Error saving flow:', err);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  private syncPositionsFromCanvas(): void {
    for (const node of this.nodes) {
      const step = this.steps.find(s => s.ID === node.ID);
      if (step) {
        this.transformer.ApplyNodePosition(step, node);
      }
    }
  }

  private async deleteRemovedEntities(): Promise<void> {
    const md = new Metadata();

    for (const pathId of this.deletedPathIDs) {
      const pathEntity = await md.GetEntityObject<AIAgentStepPathEntity>('MJ: AI Agent Step Paths');
      await pathEntity.InnerLoad(CompositeKey.FromID(pathId));
      await pathEntity.Delete();
    }

    for (const stepId of this.deletedStepIDs) {
      const stepEntity = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
      await stepEntity.InnerLoad(CompositeKey.FromID(stepId));
      await stepEntity.Delete();
    }

    this.deletedPathIDs = [];
    this.deletedStepIDs = [];
  }

  // ── Flow Editor Event Handlers ──────────────────────────────

  protected async onNodeAdded(event: FlowNodeAddedEvent): Promise<void> {
    if (!this.AgentID) return;

    const md = new Metadata();
    const step = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
    step.NewRecord();
    step.AgentID = this.AgentID;
    step.Name = event.Node.Label;
    step.StepType = event.Node.Type as 'Action' | 'Prompt' | 'Sub-Agent' | 'ForEach' | 'While';
    step.Status = 'Active';
    step.StartingStep = this.steps.length === 0; // First step is starting step
    step.PositionX = Math.round(event.DropPosition.X);
    step.PositionY = Math.round(event.DropPosition.Y);
    step.OnErrorBehavior = 'fail';
    step.RetryCount = 0;
    step.TimeoutSeconds = 600;

    // Save immediately to get an ID
    const saved = await step.Save();
    if (saved) {
      this.steps.push(step);
      this.rebuildFlowModel();
      this.markDirty();

      // Select the new node
      setTimeout(() => {
        this.flowEditor?.SelectNode(step.ID);
        this.onNodeSelected(this.nodes.find(n => n.ID === step.ID) ?? null);
      }, 100);
    } else {
      console.error('Failed to save new step:', step.LatestResult);
    }
    this.cdr.detectChanges();
  }

  protected async onConnectionCreated(event: FlowConnectionCreatedEvent): Promise<void> {
    if (!this.AgentID) return;

    // Prevent duplicate
    const exists = this.paths.some(
      p => p.OriginStepID === event.SourceNodeID && p.DestinationStepID === event.TargetNodeID
    );
    if (exists) return;

    const md = new Metadata();
    const path = await md.GetEntityObject<AIAgentStepPathEntity>('MJ: AI Agent Step Paths');
    path.NewRecord();
    path.OriginStepID = event.SourceNodeID;
    path.DestinationStepID = event.TargetNodeID;
    path.Priority = 0;

    const saved = await path.Save();
    if (saved) {
      this.paths.push(path);
      this.rebuildFlowModel();
      this.markDirty();
    } else {
      console.error('Failed to save new path:', path.LatestResult);
    }
    this.cdr.detectChanges();
  }

  protected onNodeSelected(node: FlowNode | null): void {
    if (node) {
      this.selectedStep = this.steps.find(s => s.ID === node.ID) ?? null;
      this.selectedConnection = null;
      this.selectedPathEntity = null;
      this.showPropertiesPanel = true;
      this.StepSelected.emit(this.selectedStep);
    } else {
      this.selectedStep = null;
      this.showPropertiesPanel = false;
      this.StepSelected.emit(null);
    }
    this.cdr.detectChanges();
  }

  protected onConnectionSelected(conn: FlowConnection | null): void {
    if (conn) {
      this.selectedConnection = conn;
      this.selectedPathEntity = this.paths.find(p => p.ID === conn.ID) ?? null;
      this.selectedStep = null;
      this.showPropertiesPanel = true;
    } else {
      this.selectedConnection = null;
      this.selectedPathEntity = null;
    }
    this.cdr.detectChanges();
  }

  protected onNodeRemoved(node: FlowNode): void {
    const step = this.steps.find(s => s.ID === node.ID);
    if (step) {
      // Track for deletion on save (only if it was previously saved)
      if (step.IsSaved) {
        this.deletedStepIDs.push(step.ID);
        // Also mark paths connected to this step for deletion
        const connectedPaths = this.paths.filter(
          p => p.OriginStepID === step.ID || p.DestinationStepID === step.ID
        );
        for (const path of connectedPaths) {
          if (path.IsSaved) {
            this.deletedPathIDs.push(path.ID);
          }
        }
      }
      this.steps = this.steps.filter(s => s.ID !== node.ID);
      this.paths = this.paths.filter(
        p => p.OriginStepID !== node.ID && p.DestinationStepID !== node.ID
      );
      this.markDirty();
    }
  }

  protected onConnectionRemoved(conn: FlowConnection): void {
    const path = this.paths.find(p => p.ID === conn.ID);
    if (path) {
      if (path.IsSaved) {
        this.deletedPathIDs.push(path.ID);
      }
      this.paths = this.paths.filter(p => p.ID !== conn.ID);
      this.markDirty();
    }
  }

  protected onNodesChanged(nodes: FlowNode[]): void {
    this.nodes = nodes;
    this.markDirty();
  }

  protected onConnectionsChanged(connections: FlowConnection[]): void {
    this.connections = connections;
    this.markDirty();
  }

  // ── Properties Panel Events ─────────────────────────────────

  protected onStepChanged(step: AIAgentStepEntity): void {
    // Update the corresponding flow node
    const nodeIndex = this.nodes.findIndex(n => n.ID === step.ID);
    if (nodeIndex >= 0) {
      this.nodes[nodeIndex].Label = step.Name;
      this.nodes[nodeIndex].Subtitle = this.transformer.BuildStepSubtitle(step);
      this.nodes[nodeIndex].Status = this.transformer.MapStepStatus(step.Status);
      this.nodes[nodeIndex].IsStartNode = step.StartingStep === true;

      // Update input port disabled state for starting steps
      const inputPort = this.nodes[nodeIndex].Ports.find(p => p.Direction === 'input');
      if (inputPort) {
        inputPort.Disabled = step.StartingStep === true;
      }
    }
    this.markDirty();
    this.cdr.detectChanges();
  }

  protected onPathChanged(_path: AIAgentStepPathEntity): void {
    this.rebuildFlowModel();
    this.markDirty();
    this.cdr.detectChanges();
  }

  protected onDeleteStepRequested(step: AIAgentStepEntity): void {
    const node = this.nodes.find(n => n.ID === step.ID);
    if (node) {
      this.flowEditor?.SelectNode(step.ID);
      this.flowEditor?.DeleteSelected();
    }
    this.showPropertiesPanel = false;
    this.selectedStep = null;
    this.cdr.detectChanges();
  }

  protected onCloseProperties(): void {
    this.showPropertiesPanel = false;
    this.flowEditor?.ClearSelection();
  }

  // ── View & UI Controls ──────────────────────────────────────

  protected toggleViewMode(): void {
    this.viewMode = this.viewMode === 'diagram' ? 'list' : 'diagram';
    this.cdr.detectChanges();
  }

  protected toggleFullScreen(): void {
    this.FullScreen = !this.FullScreen;

    if (this.FullScreen) {
      this.moveToBodyForFullscreen();
    } else {
      this.restoreFromFullscreen();
    }

    this.FullScreenToggled.emit(this.FullScreen);
    this.cdr.detectChanges();
    // Re-fit after layout change
    setTimeout(() => this.flowEditor?.ZoomToFit(), 200);
  }

  private moveToBodyForFullscreen(): void {
    const hostEl = this.elRef.nativeElement;
    this.originalParent = hostEl.parentElement;
    this.originalNextSibling = hostEl.nextSibling;

    // Create backdrop as a separate body-level element so it covers everything
    this.backdropElement = this.renderer.createElement('div');
    this.renderer.addClass(this.backdropElement, 'mj-agent-editor-backdrop');
    this.renderer.listen(this.backdropElement, 'click', () => this.toggleFullScreen());
    this.renderer.appendChild(document.body, this.backdropElement);

    // Move the host element to body — @HostBinding applies the fixed-position class
    this.renderer.appendChild(document.body, hostEl);
  }

  private restoreFromFullscreen(): void {
    // Remove backdrop
    if (this.backdropElement) {
      this.renderer.removeChild(document.body, this.backdropElement);
      this.backdropElement = null;
    }

    // Restore host element to original position
    if (!this.originalParent) return;
    const hostEl = this.elRef.nativeElement;
    if (this.originalNextSibling) {
      this.renderer.insertBefore(this.originalParent, hostEl, this.originalNextSibling);
    } else {
      this.renderer.appendChild(this.originalParent, hostEl);
    }
    this.originalParent = null;
    this.originalNextSibling = null;
  }

  protected onStepClickedInList(step: AIAgentStepEntity): void {
    this.selectedStep = step;
    this.selectedConnection = null;
    this.selectedPathEntity = null;
    this.showPropertiesPanel = true;
    this.StepSelected.emit(step);
    this.cdr.detectChanges();
  }

  // ── Keyboard Shortcuts ─────────────────────────────────────

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.FullScreen) {
      this.toggleFullScreen();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private markDirty(): void {
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      this.FlowChanged.emit(true);
    }
  }
}
