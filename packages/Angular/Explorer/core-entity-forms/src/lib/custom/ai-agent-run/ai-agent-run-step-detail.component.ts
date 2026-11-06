import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ViewChild } from '@angular/core';
import { TimelineItem } from './ai-agent-run-timeline.component';
import { MJAIAgentRunStepEntity, MJAIAgentRunStepEntity_AgentSkillInvocation } from '@memberjunction/core-entities';
import { ResolveTaskGraphPositions, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { FlowPosition } from '@memberjunction/ng-flow-editor';
import { TaskGraphRunViewComponent } from '@memberjunction/ng-task-graph-editor';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';

interface ScratchpadSnapshotView {
  notes: string;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    notes?: string;
  }>;
}

@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-step-detail',
  templateUrl: './ai-agent-run-step-detail.component.html',
  styleUrls: ['./ai-agent-run-step-detail.component.css']
})
export class AIAgentRunStepDetailComponent {
  @Input() SelectedTimelineItem: TimelineItem | null = null;

  /** @deprecated Use {@link SelectedTimelineItem}. */
  @Input() set selectedTimelineItem(value: TimelineItem | null) {
    this.SelectedTimelineItem = value;
  }
  /** @deprecated Use {@link SelectedTimelineItem}. */
  get selectedTimelineItem(): TimelineItem | null {
    return this.SelectedTimelineItem;
  }
  /** The provider the host is on, so the run view reads through the right one. */
  @Input() Provider: IMetadataProvider | null = null;
  /** True while the host is persisting the workflow via WorkflowSaveOperation. */
  @Input() SavingWorkflow = false;
  @Output() ClosePanel = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ClosePanel}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closePanel) keeps working. Must stay AFTER ClosePanel: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closePanel = this.ClosePanel;
  @Output() NavigateToActionLog = new EventEmitter<string>();

  /**
   * @deprecated Use {@link NavigateToActionLog}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigateToActionLog) keeps working. Must stay AFTER NavigateToActionLog: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigateToActionLog = this.NavigateToActionLog;
  @Output() CopyToClipboard = new EventEmitter<string>();

  /**
   * @deprecated Use {@link CopyToClipboard}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (copyToClipboard) keeps working. Must stay AFTER CopyToClipboard: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() copyToClipboard = this.CopyToClipboard;
  /**
   * The user asked to promote this run's graph into a reusable workflow (D17).
   *
   * Intent only — this component renders a run, it does not persist agents. The host performs the
   * conversion and the `AgentSpecSync` write, which keeps the one place that writes an agent the
   * one place that writes an agent.
   */
  @Output() SaveAsWorkflowRequested = new EventEmitter<TaskGraphSpec>();

  /**
   * @deprecated Use {@link SaveAsWorkflowRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (saveAsWorkflowRequested) keeps working. Must stay AFTER SaveAsWorkflowRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() saveAsWorkflowRequested = this.SaveAsWorkflowRequested;

  SelectedItemJsonString = '{}';

  /** @deprecated Use {@link SelectedItemJsonString}. */
  get selectedItemJsonString() {
    return this.SelectedItemJsonString;
  }
  /** @deprecated Use {@link SelectedItemJsonString}. */
  set selectedItemJsonString(value) {
    this.SelectedItemJsonString = value;
  }
  DetailPaneTab: 'json' | 'diff' | 'scratchpad' | 'skills' | 'graph' = 'diff';

  /** @deprecated Use {@link DetailPaneTab}. */
  get detailPaneTab(): 'json' | 'diff' | 'scratchpad' | 'skills' | 'graph' {
    return this.DetailPaneTab;
  }
  /** @deprecated Use {@link DetailPaneTab}. */
  set detailPaneTab(value: 'json' | 'diff' | 'scratchpad' | 'skills' | 'graph') {
    this.DetailPaneTab = value;
  }
  ScratchpadSubTab: 'input' | 'output' | 'diff' = 'diff';

  /** @deprecated Use {@link ScratchpadSubTab}. */
  get scratchpadSubTab(): 'input' | 'output' | 'diff' {
    return this.ScratchpadSubTab;
  }
  /** @deprecated Use {@link ScratchpadSubTab}. */
  set scratchpadSubTab(value: 'input' | 'output' | 'diff') {
    this.ScratchpadSubTab = value;
  }

  private static readonly EMPTY_SKILL_INVOCATIONS: MJAIAgentRunStepEntity_AgentSkillInvocation[] = [];
  private _cacheFingerprint: string | null = null;
  private _cachedSelectedItem: TimelineItem | null = null;
  private _stepNoticeCache: { Variant: 'info' | 'warning' | 'error'; Message: string } | null = null;
  private _selectedItemJsonCache = '{}';
  private _showStepPayloadDiffCache = false;
  private _stepPayloadAtStartObjectCache: ReturnType<typeof ParseJSONRecursive> | null = null;
  private _stepPayloadAtEndObjectCache: ReturnType<typeof ParseJSONRecursive> | null = null;
  private _stepSkillInvocationsCache: MJAIAgentRunStepEntity_AgentSkillInvocation[] =
    AIAgentRunStepDetailComponent.EMPTY_SKILL_INVOCATIONS;
  private _stepTaskGraphCache: TaskGraphSpec | null = null;
  private _stepTaskGraphPositionsCache: Map<string, FlowPosition> | null = null;
  private _stepTaskGraphParentTaskIdCache: string | null = null;
  private _stepTaskGraphWasFoldedCache = false;
  private _stepScratchpadInputCache: ScratchpadSnapshotView | null = null;
  private _stepScratchpadOutputCache: ScratchpadSnapshotView | null = null;
  private _scratchpadTaskChangeCountCache = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  private computeCacheFingerprint(item: TimelineItem | null): string {
    if (!item) {
      return '';
    }
    const d = item.data ?? {};
    return `${item.id ?? ''}|${item.type ?? ''}|${item.status ?? ''}|${d.StepType ?? ''}|${Boolean(d.IsWorkflowStep)}|${d.PayloadAtStart ?? ''}|${d.PayloadAtEnd ?? ''}|${typeof d.Skills === 'string' ? d.Skills : JSON.stringify(d.Skills ?? '')}|${typeof d.InputData === 'string' ? d.InputData : JSON.stringify(d.InputData ?? '')}|${typeof d.OutputData === 'string' ? d.OutputData : JSON.stringify(d.OutputData ?? '')}`;
  }

  private ensureStepDetailCache(): void {
    const item = this.SelectedTimelineItem;
    const fp = this.computeCacheFingerprint(item);
    if (this._cachedSelectedItem === item && this._cacheFingerprint === fp) {
      return;
    }
    this._cachedSelectedItem = item;
    this._cacheFingerprint = fp;

    this._stepNoticeCache = this.computeStepNotice(item);
    this._selectedItemJsonCache = this.computeSelectedItemJson(item);
    this._showStepPayloadDiffCache = this.computeShowStepPayloadDiff(item);
    this._stepPayloadAtStartObjectCache = this.computeStepPayloadObject(item, 'PayloadAtStart');
    this._stepPayloadAtEndObjectCache = this.computeStepPayloadObject(item, 'PayloadAtEnd');
    this._stepSkillInvocationsCache = this.computeStepSkillInvocations(item);
    this._stepTaskGraphCache = this.computeStepTaskGraph(item);
    this._stepTaskGraphPositionsCache = this._stepTaskGraphCache
      ? ResolveTaskGraphPositions(this._stepTaskGraphCache)
      : null;
    this._stepTaskGraphParentTaskIdCache = this.computeStepTaskGraphParentTaskID(item);
    this._stepTaskGraphWasFoldedCache = this.computeStepTaskGraphWasFolded(item);
    this._stepScratchpadInputCache = this.extractScratchpadFromField('InputData');
    this._stepScratchpadOutputCache = this.extractScratchpadFromField('OutputData');
    this._scratchpadTaskChangeCountCache = this.computeScratchpadTaskChangeCount(
      this._stepScratchpadInputCache,
      this._stepScratchpadOutputCache
    );
    this.SelectedItemJsonString = this._selectedItemJsonCache;
  }

  ngOnChanges() {
    this._cacheFingerprint = null;
    this.ensureStepDetailCache();
    if (this.SelectedTimelineItem) {
      // Default to diff tab if step has payload diff, skills for Skill steps (the activation IS
      // the story there), scratchpad if available, otherwise json
      if (this.ShowStepPayloadDiff) {
        this.DetailPaneTab = 'diff';
      } else if (this.ShowGraphTab) {
        // A TaskGraph step's whole content IS the graph; opening on the JSON would bury the one
        // thing the step exists to show.
        this.DetailPaneTab = 'graph';
      } else if (this.ShowSkillsTab && this.SelectedTimelineItem.data?.StepType === 'Skill') {
        this.DetailPaneTab = 'skills';
      } else if (this.ShowScratchpadTab) {
        this.DetailPaneTab = 'scratchpad';
      } else if (this.ShowSkillsTab) {
        this.DetailPaneTab = 'skills';
      } else {
        this.DetailPaneTab = 'json';
      }
      this.ScratchpadSubTab = 'diff';
      this.cdr.detectChanges();
    }
  }

  /**
   * What to say about a step that never executed, or null when it ran.
   *
   * **Why this needs saying at all.** A workflow persists every step at submission, before anything
   * runs — the rows are the dispatcher's work queue, and the skip cascade is computed from the graph
   * they form. So a branch the workflow did not take still has a row, and opening it shows a
   * perfectly normal record with empty payloads. Without a word of explanation the reader is left to
   * work out whether that emptiness is a branch that was not chosen, work still queued, or a step
   * that broke silently — three very different situations that look identical in JSON.
   *
   * The distinction between Skipped and Blocked is load-bearing and deliberately preserved here:
   * `Skipped` means the workflow chose another route, `Blocked` means something upstream failed. The
   * dispatcher separated them precisely because conflating them made every conditional workflow look
   * half-broken.
   */
  get StepNotice(): { Variant: 'info' | 'warning' | 'error'; Message: string } | null {
    this.ensureStepDetailCache();
    return this._stepNoticeCache;
  }

  private computeStepNotice(
    item: TimelineItem | null
  ): { Variant: 'info' | 'warning' | 'error'; Message: string } | null {
    if (!item?.data?.IsWorkflowStep) return null;

    switch (item.status) {
      case 'Skipped':
        return {
          Variant: 'info',
          Message: 'This step never ran — the workflow took another route. Its row exists because ' +
                   'every step is created when the workflow is submitted, so the record of the branch ' +
                   'that was not taken survives. Nothing went wrong here.',
        };
      case 'Blocked':
        return {
          Variant: 'error',
          Message: 'This step could not run: something it depended on failed, so no path to it was ' +
                   'left. It is not a branch that lost — it is work that became unreachable.',
        };
      case 'Pending':
        return {
          Variant: 'warning',
          Message: 'This step has not started yet. A workflow runs on the dispatcher and outlives the ' +
                   'agent run that submitted it, so a finished run can still contain steps that are ' +
                   'queued or in flight.',
        };
      default:
        return null;
    }
  }

  GetSelectedItemJson(): string {
    this.ensureStepDetailCache();
    return this._selectedItemJsonCache;
  }

  private computeSelectedItemJson(item: TimelineItem | null): string {
    if (!item) return '{}';
    
    // Get all the data from the entity
    let data: unknown;
    if (item.data instanceof MJAIAgentRunStepEntity) {
      // If it's a step entity, we need to get the full run data
      data = item.data.GetAll();
    } else {
      data = item.data;
    }
    
    // Apply recursive JSON parsing to the entire data object
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false
    };
    const parsedData = ParseJSONRecursive(data, parseOptions);
    
    return JSON.stringify(parsedData, null, 2);
  }

  /** @deprecated Use {@link GetSelectedItemJson}. */
  getSelectedItemJson(): string {
    return this.GetSelectedItemJson();
  }

  /**
   * Check if selected timeline item is a step with payload changes
   */
  get ShowStepPayloadDiff(): boolean {
    this.ensureStepDetailCache();
    return this._showStepPayloadDiffCache;
  }

  private computeShowStepPayloadDiff(item: TimelineItem | null): boolean {
    if (!item || item.type !== 'step') {
      return false;
    }
    
    const stepData = item.data;
    if (stepData && (stepData.PayloadAtStart?.trim().length > 0 
                 || stepData.PayloadAtEnd?.trim().length > 0)) {
      return stepData.PayloadAtStart !== stepData.PayloadAtEnd;
    } else {
      return false;
    }
  }

  /** @deprecated Use {@link ShowStepPayloadDiff}. */
  get showStepPayloadDiff(): boolean {
    return this.ShowStepPayloadDiff;
  }

  /**
   * Get parsed PayloadAtStart for the selected step
   */
  get StepPayloadAtStartObject(): ReturnType<typeof ParseJSONRecursive> | null {
    this.ensureStepDetailCache();
    return this._stepPayloadAtStartObjectCache;
  }

  /** @deprecated Use {@link StepPayloadAtStartObject}. */
  get stepPayloadAtStartObject(): ReturnType<typeof ParseJSONRecursive> | null {
    return this.StepPayloadAtStartObject;
  }

  /**
   * Get parsed PayloadAtEnd for the selected step
   */
  get StepPayloadAtEndObject(): ReturnType<typeof ParseJSONRecursive> | null {
    this.ensureStepDetailCache();
    return this._stepPayloadAtEndObjectCache;
  }

  /** @deprecated Use {@link StepPayloadAtEndObject}. */
  get stepPayloadAtEndObject(): ReturnType<typeof ParseJSONRecursive> | null {
    return this.StepPayloadAtEndObject;
  }

  private computeStepPayloadObject(
    item: TimelineItem | null,
    field: 'PayloadAtStart' | 'PayloadAtEnd'
  ): ReturnType<typeof ParseJSONRecursive> | null {
    if (!item || item.type !== 'step') {
      return null;
    }
    
    const stepData = item.data;
    const rawPayload = stepData?.[field];
    if (!rawPayload) return null;
    
    try {
      let payloadData: unknown = rawPayload;
      try {
        payloadData = JSON.parse(rawPayload);
      } catch {
        payloadData = rawPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch {
      return null;
    }
  }

  OnClosePanel() {
    this.ClosePanel.emit();
  }

  /** @deprecated Use {@link OnClosePanel}. */
  onClosePanel() {
    return this.OnClosePanel();
  }

  OnNavigateToActionLog(logId: string) {
    this.NavigateToActionLog.emit(logId);
  }

  /** @deprecated Use {@link OnNavigateToActionLog}. */
  onNavigateToActionLog(logId: string) {
    return this.OnNavigateToActionLog(logId);
  }

  OnCopyToClipboard() {
    this.CopyToClipboard.emit(this.GetSelectedItemJson());
  }

  /** @deprecated Use {@link OnCopyToClipboard}. */
  onCopyToClipboard() {
    return this.OnCopyToClipboard();
  }

  /**
   * Whether the Skills tab should be shown — true when the step has skill-invocation records
   * on its `Skills` column (Skill steps, Prompt steps with skills in effect, and Actions/
   * Sub-Agent steps whose tool was granted through a skill).
   */
  get ShowSkillsTab(): boolean {
    return this.StepSkillInvocations.length > 0;
  }

  /** @deprecated Use {@link ShowSkillsTab}. */
  get showSkillsTab(): boolean {
    return this.ShowSkillsTab;
  }

  /**
   * Parsed {@link MJAIAgentRunStepEntity_AgentSkillInvocation} records from the step's `Skills`
   * JSON column. Empty array when the step has no skill linkage or the JSON is malformed.
   */
  get StepSkillInvocations(): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    this.ensureStepDetailCache();
    return this._stepSkillInvocationsCache;
  }

  private computeStepSkillInvocations(
    item: TimelineItem | null
  ): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    if (!item || item.type !== 'step') {
      return AIAgentRunStepDetailComponent.EMPTY_SKILL_INVOCATIONS;
    }
    const raw = item.data?.Skills;
    if (!raw) return AIAgentRunStepDetailComponent.EMPTY_SKILL_INVOCATIONS;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed)
        ? (parsed as MJAIAgentRunStepEntity_AgentSkillInvocation[])
        : AIAgentRunStepDetailComponent.EMPTY_SKILL_INVOCATIONS;
    } catch {
      return AIAgentRunStepDetailComponent.EMPTY_SKILL_INVOCATIONS;
    }
  }

  /** @deprecated Use {@link StepSkillInvocations}. */
  get stepSkillInvocations(): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    return this.StepSkillInvocations;
  }

  /** Human-readable label for an invocation's activation type. */
  public GetActivationTypeLabel(inv: MJAIAgentRunStepEntity_AgentSkillInvocation): string {
    return inv.ActivationType === 'requested' ? 'User Requested' : 'Agent Self-Activated';
  }

  /**
   * Whether the Workflow tab should be shown — true for a `TaskGraph` step that carries a spec.
   *
   * Phase 3 writes this step for EVERY emitted graph, dispatched or constant-folded, so a folded
   * single-node graph is just as promotable as a dispatched one. That was the point of recording
   * the fold rather than letting it vanish.
   */
  get ShowGraphTab(): boolean {
    return this.StepTaskGraph !== null;
  }

  /** @deprecated Use {@link ShowGraphTab}. */
  get showGraphTab(): boolean {
    return this.ShowGraphTab;
  }

  /**
   * The `TaskGraphSpec` recorded on a `TaskGraph` step, or null.
   *
   * Read from InputData, falling back to OutputData: the step records the spec on the way in, and
   * a malformed or absent payload simply means no tab rather than a broken panel.
   */
  get StepTaskGraph(): TaskGraphSpec | null {
    this.ensureStepDetailCache();
    return this._stepTaskGraphCache;
  }

  private computeStepTaskGraph(item: TimelineItem | null): TaskGraphSpec | null {
    if (!item || item.type !== 'step') return null;
    if (item.data?.StepType !== 'TaskGraph') return null;

    for (const raw of [item.data?.InputData, item.data?.OutputData]) {
      if (!raw) continue;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const spec = (parsed as { spec?: TaskGraphSpec })?.spec;
        if (spec?.tasks?.length) return spec;
      } catch {
        // A step whose payload cannot be parsed shows no tab, which is honest — better than a
        // canvas rendering half a graph.
      }
    }
    return null;
  }

  /** @deprecated Use {@link StepTaskGraph}. */
  get stepTaskGraph(): TaskGraphSpec | null {
    return this.StepTaskGraph;
  }

  /**
   * Where the recorded graph's nodes go on the canvas.
   *
   * Without this the editor receives a spec and no geometry, so every node projects to the origin —
   * all of them, in one place. The canvas then rescues it with a deferred layout pass whose
   * zoom-to-fit measures a bounding box one node wide, and a four-step workflow renders as a single
   * enormous box at 265%. The positions exist the whole time: a workflow compiled from a Flow agent
   * carries the arrangement its author dragged into place, on every node.
   */
  get StepTaskGraphPositions(): Map<string, FlowPosition> | null {
    this.ensureStepDetailCache();
    return this._stepTaskGraphPositionsCache;
  }

  /** @deprecated Use {@link StepTaskGraphPositions}. */
  get stepTaskGraphPositions(): Map<string, FlowPosition> | null {
    return this.StepTaskGraphPositions;
  }

  /**
   * The graph's parent `MJ: Tasks` row, when this step actually dispatched one.
   *
   * **This is what turns the panel from a picture of the plan into a picture of the run.** With it,
   * the same `mj-task-graph-run-view` the Workflows app uses reads the Task rows and draws what
   * happened — declined branches hatched, untravelled edges absent, the toolbar available and the
   * legend off. Without it the panel had only the SPEC, so it rendered in design mode: every branch
   * drawn as though it had run, on a canvas that could not know otherwise.
   *
   * Null for a graph that was constant-folded (D9) — it never reached the dispatcher, so there are no
   * rows and no run to show. The spec view is the honest rendering there: it is a plan, and it is
   * drawn as one.
   */
  get StepTaskGraphParentTaskID(): string | null {
    this.ensureStepDetailCache();
    return this._stepTaskGraphParentTaskIdCache;
  }

  private computeStepTaskGraphParentTaskID(item: TimelineItem | null): string | null {
    const raw = item?.data?.OutputData;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const id = (parsed as { parentTaskID?: unknown })?.parentTaskID;
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /** @deprecated Use {@link StepTaskGraphParentTaskID}. */
  get stepTaskGraphParentTaskID(): string | null {
    return this.StepTaskGraphParentTaskID;
  }

  /** True when the recorded graph was constant-folded rather than dispatched (D9). */
  get StepTaskGraphWasFolded(): boolean {
    this.ensureStepDetailCache();
    return this._stepTaskGraphWasFoldedCache;
  }

  private computeStepTaskGraphWasFolded(item: TimelineItem | null): boolean {
    if (!item) return false;
    const raw = item.data?.InputData;
    if (!raw) return false;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (parsed as { folded?: boolean })?.folded === true;
    } catch {
      return false;
    }
  }

  /** @deprecated Use {@link StepTaskGraphWasFolded}. */
  get stepTaskGraphWasFolded(): boolean {
    return this.StepTaskGraphWasFolded;
  }

  @ViewChild(TaskGraphRunViewComponent)
  public TaskGraphRunView?: TaskGraphRunViewComponent;

  /** Asks the host to save this run's graph as a reusable workflow. */
  public RequestSaveAsWorkflow(): void {
    const spec = this.StepTaskGraph ?? this.TaskGraphRunView?.Spec ?? null;
    if (spec) this.SaveAsWorkflowRequested.emit(spec);
  }

  /**
   * Whether the scratchpad tab should be shown (step has scratchpad data in InputData or OutputData)
   */
  get ShowScratchpadTab(): boolean {
    if (!this.SelectedTimelineItem || this.SelectedTimelineItem.type !== 'step') {
      return false;
    }
    return this.StepScratchpadInput !== null || this.StepScratchpadOutput !== null;
  }

  /** @deprecated Use {@link ShowScratchpadTab}. */
  get showScratchpadTab(): boolean {
    return this.ShowScratchpadTab;
  }

  /**
   * Parse scratchpad snapshot from InputData JSON
   */
  get StepScratchpadInput(): ScratchpadSnapshotView | null {
    this.ensureStepDetailCache();
    return this._stepScratchpadInputCache;
  }

  /** @deprecated Use {@link StepScratchpadInput}. */
  get stepScratchpadInput(): ScratchpadSnapshotView | null {
    return this.StepScratchpadInput;
  }

  /**
   * Parse scratchpad snapshot from OutputData JSON
   */
  get StepScratchpadOutput(): ScratchpadSnapshotView | null {
    this.ensureStepDetailCache();
    return this._stepScratchpadOutputCache;
  }

  /** @deprecated Use {@link StepScratchpadOutput}. */
  get stepScratchpadOutput(): ScratchpadSnapshotView | null {
    return this.StepScratchpadOutput;
  }

  /**
   * Number of tasks that changed between input and output scratchpad snapshots
   */
  get ScratchpadTaskChangeCount(): number {
    this.ensureStepDetailCache();
    return this._scratchpadTaskChangeCountCache;
  }

  private computeScratchpadTaskChangeCount(
    input: ScratchpadSnapshotView | null,
    output: ScratchpadSnapshotView | null
  ): number {
    if (!input && !output) return 0;
    if (!input || !output) return (output?.tasks?.length ?? 0) + (input?.tasks?.length ?? 0);

    let changes = 0;
    const inputMap = new Map(input.tasks.map(t => [t.id, t]));
    const outputMap = new Map(output.tasks.map(t => [t.id, t]));

    for (const [id, task] of outputMap) {
      const prev = inputMap.get(id);
      if (!prev || prev.status !== task.status || prev.title !== task.title || prev.notes !== task.notes) {
        changes++;
      }
    }
    for (const id of inputMap.keys()) {
      if (!outputMap.has(id)) changes++; // removed tasks
    }
    if (input.notes !== output.notes) changes++;
    return changes;
  }

  /** @deprecated Use {@link ScratchpadTaskChangeCount}. */
  get scratchpadTaskChangeCount(): number {
    return this.ScratchpadTaskChangeCount;
  }

  private extractScratchpadFromField(fieldName: 'InputData' | 'OutputData'): ScratchpadSnapshotView | null {
    if (!this.SelectedTimelineItem || this.SelectedTimelineItem.type !== 'step') {
      return null;
    }

    const stepData = this.SelectedTimelineItem.data;
    const rawValue = stepData?.[fieldName];
    if (!rawValue) return null;

    try {
      let parsed = rawValue;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      const scratchpad = parsed?.scratchpad;
      if (!scratchpad) return null;
      return {
        notes: scratchpad.notes ?? '',
        tasks: Array.isArray(scratchpad.tasks) ? scratchpad.tasks : []
      };
    } catch {
      return null;
    }
  }
}