import {
  Component, Input, Output, EventEmitter, ViewChild, OnInit, OnChanges, OnDestroy,
  SimpleChanges, ChangeDetectorRef, ViewEncapsulation, HostListener, HostBinding,
  ElementRef, Renderer2
} from '@angular/core';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { AIAgentStepEntity, AIAgentStepPathEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { FlowNode, FlowConnection, FlowNodeAddedEvent, FlowConnectionCreatedEvent, FlowConnectionReassignedEvent, FlowNodeTypeConfig } from '../interfaces/flow-types';
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
  styleUrls: ['./flow-agent-editor.component.css'],
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

  // Fullscreen self-contained edit mode
  protected fullscreenEditMode = false;
  protected showUnsavedDialog = false;

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

  // Picker data (includes icon fields for node rendering)
  protected availableActions: Array<{ ID: string; Name: string; IconClass?: string | null }> = [];
  protected availablePrompts: Array<{ ID: string; Name: string }> = [];
  protected availableAgents: Array<{ ID: string; Name: string; IconClass?: string | null; LogoURL?: string | null }> = [];

  // Permission state — cached once on init
  protected userCanUpdate = false;

  // User view preferences (persisted via UserInfoEngine)
  protected prefShowGrid = true;
  protected prefShowMinimap = true;
  protected prefShowLegend = true;

  private static readonly PREF_KEY = 'flow-editor/view-prefs';

  // Initial zoom state
  private needsInitialZoom = false;
  private resizeObserver: ResizeObserver | null = null;

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
    this.loadViewPreferences();
    this.checkUpdatePermission();
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
    this.teardownResizeObserver();
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

      // Flag that we need an initial zoom; it will fire when the host element
      // first becomes visible (e.g. Kendo PanelBar expands)
      this.setupInitialZoomObserver();
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
        Fields: ['ID', 'Name', 'IconClass'],
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
        Fields: ['ID', 'Name', 'IconClass', 'LogoURL'],
        ExtraFilter: this.AgentID ? `ID <> '${this.AgentID}'` : '',
        OrderBy: 'Name ASC',
        ResultType: 'simple'
      }
    ]);

    this.availableActions = actionsResult.Success
      ? (actionsResult.Results as Array<{ ID: string; Name: string; IconClass?: string | null }>)
      : [];
    this.availablePrompts = promptsResult.Success
      ? (promptsResult.Results as Array<{ ID: string; Name: string }>)
      : [];
    this.availableAgents = agentsResult.Success
      ? (agentsResult.Results as Array<{ ID: string; Name: string; IconClass?: string | null; LogoURL?: string | null }>)
      : [];
  }

  private rebuildFlowModel(): void {
    this.nodes = this.transformer.StepsToNodes(this.steps, this.availableActions, this.availableAgents);
    this.connections = this.transformer.PathsToConnections(this.paths);
  }

  /**
   * Observe the host element's size. When it transitions from zero to non-zero height
   * (i.e. the collapsed Kendo panel expands), trigger the initial auto-arrange or zoom-to-fit.
   */
  private setupInitialZoomObserver(): void {
    if (this.nodes.length === 0) return;

    this.needsInitialZoom = true;
    this.teardownResizeObserver();

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0 && this.needsInitialZoom) {
          this.needsInitialZoom = false;
          this.teardownResizeObserver();
          // Short delay for Foblex canvas to finish its own init after becoming visible
          setTimeout(() => this.applyInitialZoom(), 100);
        }
      }
    });

    this.resizeObserver.observe(this.elRef.nativeElement);
  }

  private applyInitialZoom(): void {
    if (!this.flowEditor || this.nodes.length === 0) return;
    const allAtOrigin = this.nodes.every(n => n.Position.X === 0 && n.Position.Y === 0);
    if (allAtOrigin) {
      this.flowEditor.AutoArrange();
    } else {
      this.flowEditor.ZoomToFit();
    }
  }

  private teardownResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
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

      // Exit self-contained fullscreen edit mode after successful save
      if (this.fullscreenEditMode) {
        this.fullscreenEditMode = false;
      }

      this.FlowSaved.emit();
    } catch (err) {
      console.error('Error saving flow:', err);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  private syncPositionsFromCanvas(): void {
    this.syncPositionsToEntities();
  }

  /** Write current FlowNode positions back to the underlying step entities.
   *  Called on every node move so that rebuildFlowModel() never loses drag changes. */
  private syncPositionsToEntities(): void {
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
    const x=1;
    console.log(x);

    if (!this.AgentID) return;

    const md = new Metadata();
    const step = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
    step.NewRecord(); // This generates a UUID immediately - available before Save()
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

    // Add the unsaved step to the array - it already has a UUID from NewRecord()
    // This allows connections to be drawn immediately without waiting for a database save
    this.steps.push(step);

    // Build a FlowNode using the entity's pre-generated ID so Foblex can track it
    const newNode = this.transformer.StepToNode(step, this.availableActions, this.availableAgents);
    this.nodes.push(newNode);
    this.markDirty();

    // Select the new node
    setTimeout(() => {
      this.flowEditor?.SelectNode(step.ID);
      this.onNodeSelected(newNode);
    }, 100);

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
    path.NewRecord(); // Generates UUID immediately - available before Save()
    path.OriginStepID = event.SourceNodeID;
    path.DestinationStepID = event.TargetNodeID;
    path.Priority = 0;

    // Add unsaved path to the array - save will happen on main Save() button
    this.paths.push(path);
    this.rebuildFlowModel();
    this.markDirty();
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
      // Only hide the panel if no connection is currently selected.
      // When the user clicks a connection, Foblex fires NodeSelected(null) AND
      // ConnectionSelected(conn) — we must not let the null-node event hide
      // the panel that the connection event just opened.
      if (!this.selectedConnection) {
        this.showPropertiesPanel = false;
      }
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

  protected onConnectionReassigned(event: FlowConnectionReassignedEvent): void {
    const path = this.paths.find(p => p.ID === event.ConnectionID);
    if (!path) return;

    // Update the entity's origin/destination to match the new visual endpoints
    path.OriginStepID = event.NewSourceNodeID;
    path.DestinationStepID = event.NewTargetNodeID;

    // Rebuild all connections so sibling-based visual logic recalculates
    // (e.g., Default vs Duplicate Default labels depend on sibling analysis)
    this.rebuildFlowModel();
    this.markDirty();
    this.cdr.detectChanges();
  }

  protected onNodesChanged(nodes: FlowNode[]): void {
    this.nodes = nodes;
    // Sync canvas positions back to entities immediately so that
    // any subsequent rebuildFlowModel() preserves drag changes.
    this.syncPositionsToEntities();
    this.markDirty(); 
  }

  protected onConnectionsChanged(connections: FlowConnection[]): void {
    this.connections = connections;
    this.markDirty();
  }

  // ── Properties Panel Events ─────────────────────────────────

  protected onStepChanged(step: AIAgentStepEntity): void {
    // Update the corresponding flow node in-place and push to generic editor
    const node = this.nodes.find(n => n.ID === step.ID);
    if (node) {
      const newLabel = step.Name;
      const newSubtitle = this.transformer.BuildStepSubtitle(step);
      const baseStatus = this.transformer.MapStepStatus(step.Status);
      const warningMessage = (baseStatus !== 'disabled') ? this.transformer.BuildConfigWarningMessage(step) : null;
      const newStatus = warningMessage ? 'warning' : baseStatus;
      const newIsStart = step.StartingStep === true;

      node.Label = newLabel;
      node.Subtitle = newSubtitle;
      node.Status = newStatus;
      node.StatusMessage = warningMessage ?? undefined;
      node.IsStartNode = newIsStart;

      // Update input port disabled state for starting steps
      const inputPort = node.Ports.find(p => p.Direction === 'input');
      if (inputPort) {
        inputPort.Disabled = newIsStart;
      }

      // Re-resolve icon from picker data (handles action/agent assignment changes)
      const resolved = this.transformer.ResolveStepIcon(step, this.availableActions, this.availableAgents);
      node.Icon = resolved.Icon;
      if (!node.Data) node.Data = {};
      node.Data['LogoURL'] = resolved.LogoURL ?? null;

      // For loop nodes, rebuild the loop-specific Data properties so the
      // inner body card updates immediately when the user changes body type / config
      if (step.StepType === 'ForEach' || step.StepType === 'While') {
        this.updateLoopNodeData(step, node);
      }

      // Push visual update to the generic flow editor (creates new object ref for OnPush)
      this.flowEditor?.UpdateNode(step.ID, {
        Label: newLabel,
        Subtitle: newSubtitle,
        Status: newStatus,
        StatusMessage: warningMessage ?? undefined,
        IsStartNode: newIsStart,
        Icon: resolved.Icon,
        Data: node.Data
      });
    }
    this.markDirty();
    this.cdr.detectChanges();
  }

  /** Update loop-specific data fields on a FlowNode from the step entity */
  private updateLoopNodeData(step: AIAgentStepEntity, node: FlowNode): void {
    if (!node.Data) node.Data = {};
    // Delegate to the transformer's public methods for consistency
    const bodyType = step.LoopBodyType;
    node.Data['LoopBodyType'] = bodyType ?? null;
    node.Data['LoopBodyName'] = this.resolveLoopBodyNameFromStep(step);
    node.Data['LoopBodyIcon'] = this.getBodyTypeIcon(bodyType);
    node.Data['LoopBodyColor'] = this.getBodyTypeColor(bodyType);
    node.Data['LoopIterationSummary'] = this.transformer.BuildLoopIterationSummary(step);
  }

  private resolveLoopBodyNameFromStep(step: AIAgentStepEntity): string | null {
    switch (step.LoopBodyType) {
      case 'Action': return step.Action ?? null;
      case 'Prompt': return step.Prompt ?? null;
      case 'Sub-Agent': return step.SubAgent ?? null;
      default: return null;
    }
  }

  private getBodyTypeIcon(bodyType: string | null): string {
    switch (bodyType) {
      case 'Action': return 'fa-bolt';
      case 'Prompt': return 'fa-comment-dots';
      case 'Sub-Agent': return 'fa-robot';
      default: return 'fa-circle-nodes';
    }
  }

  private getBodyTypeColor(bodyType: string | null): string {
    switch (bodyType) {
      case 'Action': return '#3B82F6';
      case 'Prompt': return '#8B5CF6';
      case 'Sub-Agent': return '#10B981';
      default: return '#6B7280';
    }
  }

  protected onPathChanged(path: AIAgentStepPathEntity): void {
    // Rebuild all connections from the same origin since always/conditional logic
    // depends on sibling paths (e.g., "Default" label only appears when siblings exist)
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

  protected onDeletePathRequested(path: AIAgentStepPathEntity): void {
    const conn = this.connections.find(c => c.ID === path.ID);
    if (conn) {
      if (path.IsSaved) {
        this.deletedPathIDs.push(path.ID);
      }
      this.paths = this.paths.filter(p => p.ID !== path.ID);
      this.rebuildFlowModel();
      this.markDirty();
    }
    this.showPropertiesPanel = false;
    this.selectedConnection = null;
    this.selectedPathEntity = null;
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

  /** Whether editing is currently allowed — combines parent EditMode + fullscreen self-contained edit */
  get isEditingActive(): boolean {
    return this.EditMode || this.fullscreenEditMode;
  }

  protected toggleFullscreenEditMode(): void {
    this.fullscreenEditMode = !this.fullscreenEditMode;
    this.cdr.detectChanges();
  }

  protected cancelFullscreenEdit(): void {
    if (this.hasUnsavedChanges) {
      // Reload to discard changes
      this.fullscreenEditMode = false;
      this.hasUnsavedChanges = false;
      this.loadAll();
    } else {
      this.fullscreenEditMode = false;
      this.cdr.detectChanges();
    }
  }

  protected toggleFullScreen(): void {
    if (this.FullScreen && this.hasUnsavedChanges) {
      this.showUnsavedDialog = true;
      this.cdr.detectChanges();
      return;
    }
    this.performFullscreenToggle();
  }

  protected onUnsavedDialogSave(): void {
    this.showUnsavedDialog = false;
    this.Save().then(() => this.performFullscreenToggle());
  }

  protected onUnsavedDialogDiscard(): void {
    this.showUnsavedDialog = false;
    this.hasUnsavedChanges = false;
    this.fullscreenEditMode = false;
    this.performFullscreenToggle();
    // Reload original data
    this.loadAll();
  }

  protected onUnsavedDialogCancel(): void {
    this.showUnsavedDialog = false;
    this.cdr.detectChanges();
  }

  private performFullscreenToggle(): void {
    this.FullScreen = !this.FullScreen;

    if (this.FullScreen) {
      this.moveToBodyForFullscreen();
    } else {
      this.fullscreenEditMode = false;
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
    if (this.showUnsavedDialog) {
      this.onUnsavedDialogCancel();
    } else if (this.FullScreen) {
      this.toggleFullScreen();
    }
  }

  // ── Permission Check ────────────────────────────────────────

  private checkUpdatePermission(): void {
    const md = new Metadata();
    const entity = md.EntityByName('AI Agents');
    if (entity) {
      const perms = entity.GetUserPermisions(md.CurrentUser);
      this.userCanUpdate = perms?.CanUpdate === true;
    }
  }

  // ── View Preference Persistence ─────────────────────────────

  private loadViewPreferences(): void {
    const raw = UserInfoEngine.Instance.GetSetting(FlowAgentEditorComponent.PREF_KEY);
    if (raw) {
      try {
        const prefs = JSON.parse(raw) as { grid?: boolean; minimap?: boolean; legend?: boolean };
        if (prefs.grid != null) this.prefShowGrid = prefs.grid;
        if (prefs.minimap != null) this.prefShowMinimap = prefs.minimap;
        if (prefs.legend != null) this.prefShowLegend = prefs.legend;
      } catch {
        // Ignore malformed preference data
      }
    }
  }

  private saveViewPreferences(): void {
    const prefs = JSON.stringify({
      grid: this.prefShowGrid,
      minimap: this.prefShowMinimap,
      legend: this.prefShowLegend
    });
    // Fire-and-forget — preference save errors are non-critical
    UserInfoEngine.Instance.SetSetting(FlowAgentEditorComponent.PREF_KEY, prefs);
  }

  protected onGridPrefChanged(show: boolean): void {
    this.prefShowGrid = show;
    this.saveViewPreferences();
  }

  protected onMinimapPrefChanged(show: boolean): void {
    this.prefShowMinimap = show;
    this.saveViewPreferences();
  }

  protected onLegendPrefChanged(show: boolean): void {
    this.prefShowLegend = show;
    this.saveViewPreferences();
  }

  // ── Helpers ─────────────────────────────────────────────────

  private markDirty(): void {
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      this.FlowChanged.emit(true);
    }
  }
}
