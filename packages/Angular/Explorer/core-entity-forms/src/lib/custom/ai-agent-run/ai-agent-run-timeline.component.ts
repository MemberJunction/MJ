import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject, Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { takeUntil, map, shareReplay, filter } from 'rxjs/operators';
import { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJActionExecutionLogEntity, MJAIPromptRunEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { AIAgentRunDataHelper } from './ai-agent-run-data.service';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FindAgentRunTreeNodes, type AgentRunTreeNode } from '@memberjunction/ai-core-plus';
import { NormalizeStatus, ProjectRunTreeToTimeline } from './run-tree-timeline-projection';
import { ActionEngineBase } from '@memberjunction/actions-base';

/**
 * Node kinds whose row is a LOOP, not the work inside it.
 *
 * A ForEach carries the ActionID of the action it repeats, so resolving an icon from it would draw
 * "a Google search" on a row that is a loop over five of them — losing the one distinction the row
 * exists to make.
 */
const LOOP_KINDS: ReadonlySet<string> = new Set(['ForEach', 'While']);
export interface TimelineItem {
  id: string;
  /**
   * What the row represents.
   *
   * `taskgraph` and `task` are dispatcher work — a graph that outlives the run that submitted it,
   * and the steps inside it. They are rendered as ordinary rows rather than as an embedded diagram,
   * and colour-coded so their provenance is visible without opening anything.
   */
  type: 'step' | 'subrun' | 'action' | 'prompt' | 'taskgraph' | 'task';
  /**
   * Where this row's work ran, when that is not obvious from its type.
   *
   * `'workflow'` means it ran on the task-graph dispatcher and outlives the agent run that
   * submitted it. Kept separate from `type` on purpose: a workflow step that runs an action IS an
   * action and should render as one — provenance styles it, it does not redefine it.
   */
  provenance?: 'workflow';
  title: string;
  subtitle: string;
  status: string;
  /**
   * When this row started, or NULL when it has not.
   *
   * Nullable on purpose. A projection that needed "sorts last" once filled this with the maximum
   * Date, and every unstarted row then displayed that sentinel as a real clock time — identical on
   * every row and indistinguishable from data. Ordering belongs to whatever produced the rows; a row
   * that has not run has no start time, and says so by having none.
   */
  startTime: Date | null;
  endTime?: Date;
  duration?: string;
  icon: string;
  logoUrl?: string;
  color: string;
  data: any;
  children?: TimelineItem[];
  level: number;
  parentId?: string;
  isExpanded?: boolean;
  childrenLoaded?: boolean;
  hasNoChildren?: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-timeline',
  templateUrl: './ai-agent-run-timeline.component.html',
  styleUrls: ['./ai-agent-run-timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AIAgentRunTimelineComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() aiAgentRunId!: string;

  /**
   * The run's execution tree, loaded ONCE by the form and shared with every tab.
   *
   * Received rather than fetched: three tabs need the same structure, and letting each load its own
   * issues the same recursive query three times AND lets the tabs disagree — a tab that loaded a
   * second earlier shows a different run than the one beside it.
   */
  /**
   * Setter, not a plain field: a TaskGraph step's row takes its STATUS from the graph (see
   * `graphNodeForStep`), and the tree usually arrives after the step rows have already been built.
   * Republishing rebuilds them, so a dispatched workflow stops reading Completed the moment the
   * tree says it is still running.
   */
  @Input()
  public set RunTree(value: AgentRunTreeNode | null) {
    this.runTree = value;
    this.runTree$.next(value);
  }
  public get RunTree(): AgentRunTreeNode | null {
    return this.runTree;
  }
  private runTree: AgentRunTreeNode | null = null;
  private runTree$ = new BehaviorSubject<AgentRunTreeNode | null>(null);
  @Input() dataHelper!: AIAgentRunDataHelper; // Data helper passed from parent
  @Output() itemSelected = new EventEmitter<TimelineItem>();
  @Output() navigateToEntity = new EventEmitter<{ entityName: string; recordId: string }>();

  private destroy$ = new Subject<void>();
  /** Resolved once the action cache is warm, so a first paint without icons can be re-rendered with them. */
  private actionsReady = false;
  /**
   * Execution-log id → action id, for the RUN-STEP path only.
   *
   * The tree path needs none of this — it carries `ActionID` outright. A run step of type `Actions`
   * still names only its log, so this map stays for that case, built from logs the data service has
   * already fetched by id.
   */
  private actionIDByLogID = new Map<string, string>();
  
  // Public observables from data helper
  steps$!: Observable<MJAIAgentRunStepEntity[]>;
  subRuns$!: Observable<MJAIAgentRunEntity[]>;
  actionLogs$!: Observable<MJActionExecutionLogEntity[]>;
  promptRuns$!: Observable<MJAIPromptRunEntity[]>;
  
  timelineItems$!: Observable<TimelineItem[]>;
  
  loading = true;
  error: string | null = null;
  selectedItem: TimelineItem | null = null;

  /** Graph steps currently being expanded, so a second click cannot start a second load. */
  private expandingGraphIDs = new Set<string>();

  constructor(
    private cdr: ChangeDetectorRef
  ) {
    super();}
  
  async ngOnInit() {
    // AIEngineBase is deferred at startup; ensure it's loaded before timeline
    // items render — getStepIconInfo / sub-agent lookups read .Agents synchronously.
    await AIEngineBase.Instance.EnsureLoaded();
    // Same reason, for the same kind of read: `resolveActionIcon` looks up `.Actions` synchronously
    // inside the projection. Cheap when another surface already warmed it, and a no-op on reload.
    try {
      await ActionEngineBase.Instance.EnsureLoaded();
      this.actionsReady = true;
    } catch {
      // An action cache that will not load costs icons, not rows — every action keeps the generic
      // glyph it had before. Never worth failing a run view over.
      this.actionsReady = false;
    }

    // Initialize observables from the data helper
    this.steps$ = this.dataHelper.steps$;
    this.subRuns$ = this.dataHelper.subRuns$;
    this.actionLogs$ = this.dataHelper.actionLogs$;
    this.promptRuns$ = this.dataHelper.promptRuns$;
    
    // Combine all data sources to build timeline.
    // Skip emissions where steps are empty but data is still loading —
    // the BehaviorSubjects initialise with [] so combineLatest fires
    // immediately with an empty array before the real data arrives.
    this.timelineItems$ = combineLatest([
      this.steps$,
      this.subRuns$,
      this.actionLogs$,
      this.promptRuns$,
      this.dataHelper.loading$,
      this.runTree$
    ]).pipe(
      filter(([steps, _subRuns, _actionLogs, _promptRuns, isLoading]) => {
        // While loading, suppress the empty-array emission so the
        // template keeps showing the mj-loading indicator.
        return !(isLoading && steps.length === 0);
      }),
      map(([steps, subRuns, actionLogs, promptRuns]) => {
        // Built here rather than on demand: this is where the logs arrive, and the resolver runs
        // synchronously inside the projection, which cannot await anything.
        this.actionIDByLogID = new Map(
          (actionLogs ?? [])
            .filter((log) => log.ID && log.ActionID)
            .map((log) => [log.ID.toLowerCase(), log.ActionID]),
        );
        return this.buildTimelineItems(steps, subRuns, actionLogs, promptRuns);
      }),
      shareReplay(1)
    );
    
    // Data loading is now handled by the parent component through the helper
    // Subscribe to loading state from helper
    this.dataHelper.loading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.loading = loading;
      this.cdr.markForCheck();
    });

    this.dataHelper.error$.pipe(takeUntil(this.destroy$)).subscribe(error => {
      this.error = error;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // This method is now just for compatibility - actual loading is done by parent
  async loadData() {
    if (!this.aiAgentRunId) return;
    // The parent component should handle data loading through the helper
    return this.dataHelper.loadAgentRunData(this.aiAgentRunId);
  }
  
  private buildTimelineItems(
    steps: MJAIAgentRunStepEntity[],
    subRuns: MJAIAgentRunEntity[],
    actionLogs: MJActionExecutionLogEntity[],
    promptRuns: MJAIPromptRunEntity[]
  ): TimelineItem[] {
    return this.buildHierarchicalItems(steps, 0, promptRuns);
  }

  private buildHierarchicalItems(
    steps: MJAIAgentRunStepEntity[],
    baseLevel: number,
    promptRuns?: MJAIPromptRunEntity[]
  ): TimelineItem[] {
    // Create a map of all timeline items by step ID
    const itemMap = new Map<string, TimelineItem>();

    // First pass: create all timeline items
    steps.forEach(step => {
      const item = this.createTimelineItemFromStep(step, baseLevel, promptRuns);
      itemMap.set(step.ID, item);
    });

    // Second pass: build parent-child relationships based on ParentID
    steps.forEach(step => {
      if (step.ParentID) {
        const parentItem = itemMap.get(step.ParentID);
        const childItem = itemMap.get(step.ID);

        if (parentItem && childItem) {
          // Initialize children array if needed
          if (!parentItem.children) {
            parentItem.children = [];
          }

          // Set child's level based on parent's level
          childItem.level = parentItem.level + 1;

          // Add child to parent's children array
          parentItem.children.push(childItem);
        }
      }
    });

    // Return only root-level items (those without a ParentID)
    const rootItems: TimelineItem[] = [];
    steps.forEach(step => {
      if (!step.ParentID) {
        const item = itemMap.get(step.ID);
        if (item) {
          rootItems.push(item);
        }
      }
    });

    return rootItems;
  }
  
  /**
   * Font Awesome class for a node that runs a known action or agent, or null to keep the default.
   *
   * **Why the row kind is the wrong answer.** The same action reaches this timeline through two
   * arms of the run-tree query — as a graph Task and as a loop pass — and each arm had its own
   * generic glyph, so one Google Custom Search drew a lightning bolt and the next a paper plane.
   * What the step IS does not change with where it ran.
   *
   * **No hop.** The tree carries `ActionID` and `AgentID` directly (a task holds them as columns;
   * a pass takes them from the log it expanded from), so this is one cache read. The first version
   * of this went through the execution log and silently resolved NOTHING for graph steps, because
   * the logs it consulted are only loaded for run steps of type `Actions` — of which a dispatched
   * workflow has none.
   *
   * **Loops keep their own icon.** A ForEach carries the ActionID of the action it repeats, and
   * drawing that action's mark on the loop row would say "this is a Google search" about a row that
   * is a loop over five of them. The distinction the loop icon carries is worth more.
   */
  private resolveActionIcon(node: AgentRunTreeNode): string | null {
    if (LOOP_KINDS.has(node.SourceKind ?? '')) return null;

    if (node.ActionID) {
      const action = ActionEngineBase.Instance.Actions?.find((a) => UUIDsEqual(a.ID, node.ActionID!));
      if (action?.IconClass) return action.IconClass;
    }
    if (node.AgentID) {
      const agent = AIEngineBase.Instance.Agents?.find((a) => UUIDsEqual(a.ID, node.AgentID!));
      if (agent?.IconClass) return agent.IconClass;
    }
    return null;
  }



  /**
   * The graph a TaskGraph step dispatched, from the run tree.
   *
   * Null until the tree arrives (the setter above republishes then) and null for a submission that
   * produced no graph — a failed submit, where the step's own status IS the story.
   */
  private graphNodeForStep(stepID: string): AgentRunTreeNode | null {
    if (!this.runTree) return null;
    const stepNode = FindAgentRunTreeNodes(this.runTree, (n) => UUIDsEqual(n.NodeID, stepID))[0] ?? null;
    return stepNode?.Children.find((c) => c.NodeType === 'TaskGraph') ?? null;
  }

  private createTimelineItemFromStep(step: MJAIAgentRunStepEntity, level: number, promptRuns?: MJAIPromptRunEntity[]): TimelineItem {
    let subtitle = `Type: ${step.StepType}`;

    // For prompt steps, try to find the associated prompt run to get model/vendor info
    if (step.StepType === 'Prompt' && step.TargetLogID && promptRuns) {
      const promptRun = promptRuns.find(pr => UUIDsEqual(pr.ID, step.TargetLogID));
      if (promptRun) {
        subtitle = `Model: ${promptRun.Model || 'Unknown'} | Vendor: ${promptRun.Vendor || 'Unknown'}`;
      }
    }

    // Get icon and logoUrl based on step type
    const iconInfo = this.getStepIconInfo(step);

    // A dispatched workflow's row describes the WORKFLOW, not the handoff that started it. The
    // step's own status is about submission — Completed in ~300ms, correctly — and showing that
    // under a title naming the workflow is how the timeline came to report a running graph as
    // finished while the page header said "Workflow still running".
    const graph = step.StepType === 'TaskGraph' ? this.graphNodeForStep(step.ID) : null;
    if (graph) {
      subtitle = `${subtitle} · dispatched in ${this.calculateDuration(step.StartedAt, step.CompletedAt)}`;
    }

    return {
      id: step.ID,
      type: 'step',
      title: step.StepName || `Step ${step.StepNumber}`,
      subtitle: subtitle,
      status: graph ? NormalizeStatus(graph.Status) : step.Status,
      startTime: step.StartedAt,
      endTime: (graph ? graph.CompletedAt : step.CompletedAt) || undefined,
      // A graph that has not started yet has no duration of its own — the submission's stands in,
      // and the subtitle says which it is either way.
      duration: graph?.StartedAt
        ? this.calculateDuration(graph.StartedAt, graph.CompletedAt)
        : this.calculateDuration(step.StartedAt, step.CompletedAt),
      icon: iconInfo.icon,
      logoUrl: iconInfo.logoUrl,
      color: this.getStatusColor(graph ? NormalizeStatus(graph.Status) : step.Status),
      data: step,
      children: [],
      level,
      isExpanded: false
    };
  }
  

  private getStepIconInfo(step: MJAIAgentRunStepEntity): { icon: string; logoUrl?: string } {
    // For sub-agents, try to get agent-specific icon/logo
    if (step.StepType === 'Sub-Agent' && step.TargetID) {
      const agent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, step.TargetID));
      if (agent) {
        // Prefer LogoURL - if present, use it with robot as fallback icon (icon won't be shown when logoUrl exists)
        if (agent.LogoURL) {
          return { icon: 'fa-robot', logoUrl: agent.LogoURL };
        }
        // Next preference: IconClass from agent metadata
        else if (agent.IconClass) {
          return { icon: agent.IconClass };
        }
        // Agent exists but has no custom icon or logo - use default robot icon
        else {
          return { icon: 'fa-robot' };
        }
      }
    }

    // An action step draws its OWN action's icon, exactly as a sub-agent step draws its agent's —
    // the two cases are the same idea, and only one of them was implemented. `TargetLogID` names
    // the execution log this run already loaded; that log names the action, whose IconClass is in
    // ActionEngineBase's cache. A step whose action cannot be resolved (an action with no icon, a
    // cache that did not load) falls through to the step-type default below, which is the same
    // lightning bolt it drew before.
    if (step.StepType === 'Actions' && step.TargetLogID) {
      const actionID = this.actionIDByLogID.get(step.TargetLogID.toLowerCase());
      const action = actionID
        ? ActionEngineBase.Instance.Actions?.find((a) => UUIDsEqual(a.ID, actionID))
        : undefined;
      if (action?.IconClass) return { icon: action.IconClass };
    }

    // Default icons for each step type (includes fa-robot for sub-agents without agent metadata)
    const icon = this.getStepIcon(step.StepType);
    return { icon };
  }

  private getStepIcon(stepType: string): string {
    const iconMap: Record<string, string> = {
      'Prompt': 'fa-brain',
      'Tool': 'fa-tools',
      'Sub-Agent': 'fa-robot',
      'Decision': 'fa-code-branch',
      'Actions': 'fa-wrench',
      'Validation': 'fa-square-check',
      'ForEach': 'fa-repeat',
      'While': 'fa-rotate',
      'Skill': 'fa-wand-magic-sparkles',
      'Plan': 'fa-clipboard-check'
    };
    return iconMap[stepType] || 'fa-circle';
  }
  
  private getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      'Running': 'info',
      'Completed': 'success',
      'Failed': 'error',
      'Cancelled': 'warning',
      'Paused': 'secondary'
    };
    return colorMap[status] || 'secondary';
  }
  
  calculateDuration(start: Date, end?: Date | null): string {
    if (!end) return 'Running...';
    
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const duration = endTime - startTime;
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    if (duration < 3600000) return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
    return `${Math.floor(duration / 3600000)}h ${Math.floor((duration % 3600000) / 60000)}m`;
  }
  
  selectItem(item: TimelineItem) {
    this.selectedItem = item;
    this.itemSelected.emit(item);
  }
  
  async toggleItemExpansion(item: TimelineItem, event: Event) {
    event.stopPropagation();

    // Toggle expansion state
    item.isExpanded = !item.isExpanded;

    // For Sub-Agent steps, load their run data on demand (requires DB query)
    if (item.isExpanded && !item.childrenLoaded && item.type === 'step' && item.data?.StepType === 'Sub-Agent') {
      await this.loadSubAgentChildren(item);
    }

    // A TaskGraph step expands into the graph's own steps — one query for the whole subtree, so it
    // never shows a per-level loading state the way the sub-agent path has to.
    if (item.isExpanded && item.type === 'step' && item.data?.StepType === 'TaskGraph') {
      await this.ExpandTaskGraph(item);
    }

    // For parent steps (loop containers like ForEach/While), children are already loaded via ParentID
    // Just toggle - no additional loading needed since we already have all steps from the run
    // The children were already attached in buildTimelineItems()
  }
  
  private async loadSubAgentChildren(item: TimelineItem) {
    try {
      const subAgentRunId = item.data?.TargetLogID;

      if (!subAgentRunId) {
        item.hasNoChildren = true;
        item.children = [];
        item.childrenLoaded = true;
        return;
      }

      // Load sub-agent data through service
      const data = await this.dataHelper.loadSubAgentData(subAgentRunId);

      if (!data.steps || data.steps.length === 0) {
        item.hasNoChildren = true;
        item.children = [];
        item.childrenLoaded = true;
        return;
      }

      // Build hierarchical timeline items with ParentID relationships
      // This ensures that loop steps (ForEach/While) within sub-agents also show their children
      item.children = this.buildHierarchicalItems(data.steps, item.level + 1, data.promptRuns);

      item.childrenLoaded = true;
      // Trigger change detection after updating the data
      this.cdr.markForCheck();
    } catch (error) {
      console.error('🔄 Timeline: Error loading sub-agent children:', error);
      item.hasNoChildren = true;
      item.childrenLoaded = true;
      // Trigger change detection for error state
      this.cdr.markForCheck();
    }
  }
  
  navigateToSubRun(runId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'MJ: AI Agent Runs', recordId: runId });
  }
  
  navigateToActionLog(logId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'MJ: Action Execution Logs', recordId: logId });
  }
  
  navigateToPromptRun(runId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'MJ: AI Prompt Runs', recordId: runId });
  }
  
  /**
   * TrackBy function for timeline items
   */
  /**
   * The graph a TaskGraph step submitted, read from the step's own output.
   *
   * `executeTasksStep` records `parentTaskID` there whether or not submission succeeded, because a
   * rejected graph is the case where forensics matter most. A step with no id therefore means the
   * graph never reached the dispatcher — a real state the caller renders differently, which is why
   * this returns null rather than an empty string.
   */
  GetGraphParentTaskID(item: TimelineItem): string | null {
    const raw = item?.data?.OutputData;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const id = parsed?.parentTaskID;
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * A step inside the graph was selected.
   *
   * An Agent node carries the run it started, so selecting one offers the same navigation a
   * Sub-Agent step already does — that link is the seam between the two views, and without it a
   * dispatched sub-agent run is unreachable from the run that caused it.
   */
  OnGraphNodeSelected(event: { TaskID: string; Task: MJTaskEntity | null }): void {
    const agentRunID = event.Task?.AgentRunID;
    if (agentRunID) {
      this.navigateToEntity.emit({ entityName: 'MJ: AI Agent Runs', recordId: agentRunID });
      return;
    }
    if (event.Task?.ActionID) {
      this.navigateToEntity.emit({ entityName: 'MJ: Tasks', recordId: event.TaskID });
    }
  }

  /**
   * Expands a task-graph step into the graph's own steps, as ordinary timeline rows.
   *
   * **The graph's steps are steps.** They used to appear as an embedded canvas inside the list — a
   * diagram wedged into a vertical column, in a different visual language from everything around it,
   * and the only work in a run that could not be read, selected or navigated the same way as the
   * rest. They are rows now, colour-coded so their provenance is obvious, with the canvas moved to
   * the detail panel where edges have room to be seen.
   *
   * One query rather than a walk: the whole subtree arrives at once, so there is no
   * "Loading sub-agent steps…" and no per-level round trip.
   */
  async ExpandTaskGraph(item: TimelineItem): Promise<void> {
    if (item.childrenLoaded || this.expandingGraphIDs.has(item.id)) return;

    this.expandingGraphIDs.add(item.id);
    this.cdr.markForCheck();
    try {
      if (!this.RunTree) {
        this.error = 'The run tree is not loaded yet, so this workflow cannot be expanded.';
        return;
      }

      // The graph hangs off THIS step in the tree, so the subtree to splice in is the node whose id
      // matches the step — not the whole run, which is already on screen above it.
      const stepNode = FindAgentRunTreeNodes(this.RunTree, (n) => n.NodeID === item.id)[0] ?? null;

      item.children = ProjectRunTreeToTimeline(stepNode, item.level + 1, true, (n) => this.resolveActionIcon(n));
      item.childrenLoaded = true;
      item.hasNoChildren = item.children.length === 0;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.expandingGraphIDs.delete(item.id);
      this.cdr.markForCheck();
    }
  }

  /** True while a graph's steps are being fetched, so the row can say so. */
  IsExpandingGraph(item: TimelineItem): boolean {
    return this.expandingGraphIDs.has(item.id);
  }

  trackByItemId(index: number, item: TimelineItem): string {
    return item.id;
  }
  
  createSubRunDataHelper(): AIAgentRunDataHelper {
    // Create a new data helper instance for sub-runs to prevent caching conflicts
    return new AIAgentRunDataHelper();
  }
}