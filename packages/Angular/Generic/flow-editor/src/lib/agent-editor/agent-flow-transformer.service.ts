import { Injectable } from '@angular/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowNode, FlowConnection, FlowConnectionStyle, FlowNodeTypeConfig, FlowNodePort } from '../interfaces/flow-types';
import { UUIDsEqual } from '@memberjunction/global';

/** Picker item shape for Actions with optional icon */
export interface ActionPickerItem { ID: string; Name: string; IconClass?: string | null; }

/** Picker item shape for Agents with optional icon and logo */
export interface AgentPickerItem { ID: string; Name: string; IconClass?: string | null; LogoURL?: string | null; }

/** Step types mapped to visual configuration */
export const AGENT_STEP_TYPE_CONFIGS: FlowNodeTypeConfig[] = [
  {
    Type: 'Action',
    Label: 'Action',
    Icon: 'fa-bolt',
    Color: '#3B82F6',
    Category: 'Steps',
    DefaultPorts: [
      { ID: 'input', Direction: 'input', Side: 'top', Multiple: true },
      { ID: 'output', Direction: 'output', Side: 'bottom', Multiple: true }
    ]
  },
  {
    Type: 'Prompt',
    Label: 'Prompt',
    Icon: 'fa-comment-dots',
    Color: '#8B5CF6',
    Category: 'Steps',
    DefaultPorts: [
      { ID: 'input', Direction: 'input', Side: 'top', Multiple: true },
      { ID: 'output', Direction: 'output', Side: 'bottom', Multiple: true }
    ]
  },
  {
    Type: 'Sub-Agent',
    Label: 'Sub-Agent',
    Icon: 'fa-robot',
    Color: '#10B981',
    Category: 'Steps',
    DefaultPorts: [
      { ID: 'input', Direction: 'input', Side: 'top', Multiple: true },
      { ID: 'output', Direction: 'output', Side: 'bottom', Multiple: true }
    ]
  },
  {
    Type: 'ForEach',
    Label: 'For Each',
    Icon: 'fa-arrows-repeat',
    Color: '#F59E0B',
    Category: 'Loops',
    DefaultPorts: [
      { ID: 'input', Direction: 'input', Side: 'top', Multiple: true },
      { ID: 'output', Direction: 'output', Side: 'bottom', Multiple: true }
    ]
  },
  {
    Type: 'While',
    Label: 'While',
    Icon: 'fa-rotate',
    Color: '#F97316',
    Category: 'Loops',
    DefaultPorts: [
      { ID: 'input', Direction: 'input', Side: 'top', Multiple: true },
      { ID: 'output', Direction: 'output', Side: 'bottom', Multiple: true }
    ]
  }
];

/** "1st", "2nd", "3rd", … for the precedence note on an exclusive branch. */
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * Transforms MJ AIAgentStep/Path entities to/from generic FlowNode/FlowConnection models.
 */
@Injectable()
export class AgentFlowTransformerService {

  /** Convert MJ step entities to generic FlowNodes */
  StepsToNodes(
    steps: MJAIAgentStepEntity[],
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): FlowNode[] {
    return steps.map(step => this.StepToNode(step, actions, agents));
  }

  /** Convert MJ path entities to generic FlowConnections */
  PathsToConnections(paths: MJAIAgentStepPathEntity[]): FlowConnection[] {
    return paths.map(path => this.pathToConnection(path, paths));
  }

  /** Build the subtitle for a step based on its configured action/prompt/agent */
  BuildStepSubtitle(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Action':
        return step.Action ? `Action: ${step.Action}` : 'No action selected';
      case 'Prompt':
        return step.Prompt ? `Prompt: ${step.Prompt}` : 'No prompt selected';
      case 'Sub-Agent':
        return step.SubAgent ? `Agent: ${step.SubAgent}` : 'No sub-agent selected';
      case 'ForEach':
        return this.buildLoopSubtitle(step, 'For Each');
      case 'While':
        return this.buildLoopSubtitle(step, 'While');
      default:
        return step.StepType;
    }
  }

  /** Apply FlowNode position changes back to a step entity */
  ApplyNodePosition(step: MJAIAgentStepEntity, node: FlowNode): void {
    step.PositionX = Math.round(node.Position.X);
    step.PositionY = Math.round(node.Position.Y);
    if (node.Size) {
      step.Width = Math.round(node.Size.Width);
      step.Height = Math.round(node.Size.Height);
    }
  }

  /** Map FlowNode status from step entity status */
  MapStepStatus(stepStatus: string): FlowNode['Status'] {
    switch (stepStatus) {
      case 'Active': return 'default';
      case 'Disabled': return 'disabled';
      case 'Pending': return 'pending';
      default: return 'default';
    }
  }

  /**
   * Returns a short human-readable message describing what's missing,
   * or null if the step is fully configured.
   */
  BuildConfigWarningMessage(step: MJAIAgentStepEntity): string | null {
    switch (step.StepType) {
      case 'Action':
        return !step.ActionID ? 'No action selected' : null;
      case 'Prompt':
        return !step.PromptID ? 'No prompt selected' : null;
      case 'Sub-Agent':
        return !step.SubAgentID ? 'No sub-agent selected' : null;
      case 'ForEach':
      case 'While':
        return this.buildLoopWarningMessage(step);
      default:
        return null;
    }
  }

  private buildLoopWarningMessage(step: MJAIAgentStepEntity): string | null {
    const bodyType = step.LoopBodyType;
    if (!bodyType) return 'No loop body type selected';
    switch (bodyType) {
      case 'Action': return !step.ActionID ? 'No action selected for loop body' : null;
      case 'Prompt': return !step.PromptID ? 'No prompt selected for loop body' : null;
      case 'Sub-Agent': return !step.SubAgentID ? 'No sub-agent selected for loop body' : null;
      default: return null;
    }
  }

  /**
   * Returns true when a step is missing its required configuration reference
   * (e.g., an Action step with no ActionID, a Prompt step with no PromptID).
   */
  IsStepMissingConfiguration(step: MJAIAgentStepEntity): boolean {
    switch (step.StepType) {
      case 'Action':
        return !step.ActionID;
      case 'Prompt':
        return !step.PromptID;
      case 'Sub-Agent':
        return !step.SubAgentID;
      case 'ForEach':
      case 'While':
        return this.isLoopBodyMissingReference(step);
      default:
        return false;
    }
  }

  private isLoopBodyMissingReference(step: MJAIAgentStepEntity): boolean {
    const bodyType = step.LoopBodyType;
    if (!bodyType) return true; // No body type selected at all
    switch (bodyType) {
      case 'Action': return !step.ActionID;
      case 'Prompt': return !step.PromptID;
      case 'Sub-Agent': return !step.SubAgentID;
      default: return false;
    }
  }

  /**
   * Resolve the best icon and optional logo URL for a step based on its
   * configured action/agent and available picker data.
   *
   * Resolution chain:
   * - Action step: action's IconClass -> step-type fallback
   * - Sub-Agent step: agent's LogoURL (stored in Data) -> agent's IconClass -> step-type fallback
   * - Other steps: step-type icon
   */
  ResolveStepIcon(
    step: MJAIAgentStepEntity,
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): { Icon: string; LogoURL?: string | null } {
    const fallbackIcon = this.getIconForType(step.StepType);

    if (step.StepType === 'Action' && step.ActionID && actions) {
      const action = actions.find(a => UUIDsEqual(a.ID, step.ActionID));
      return { Icon: action?.IconClass || fallbackIcon };
    }

    if (step.StepType === 'Sub-Agent' && step.SubAgentID && agents) {
      const agent = agents.find(a => UUIDsEqual(a.ID, step.SubAgentID));
      if (agent?.LogoURL) {
        return { Icon: agent.IconClass || fallbackIcon, LogoURL: agent.LogoURL };
      }
      return { Icon: agent?.IconClass || fallbackIcon };
    }

    // For loop steps, resolve based on loop body type
    if ((step.StepType === 'ForEach' || step.StepType === 'While') && step.LoopBodyType) {
      return this.resolveLoopBodyIcon(step, actions, agents);
    }

    return { Icon: fallbackIcon };
  }

  private resolveLoopBodyIcon(
    step: MJAIAgentStepEntity,
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): { Icon: string; LogoURL?: string | null } {
    const fallbackIcon = this.getIconForType(step.StepType);

    if (step.LoopBodyType === 'Action' && step.ActionID && actions) {
      const action = actions.find(a => UUIDsEqual(a.ID, step.ActionID));
      if (action?.IconClass) return { Icon: fallbackIcon }; // Loop keeps its own icon; body icon handled separately
    }

    if (step.LoopBodyType === 'Sub-Agent' && step.SubAgentID && agents) {
      const agent = agents.find(a => UUIDsEqual(a.ID, step.SubAgentID));
      if (agent?.LogoURL) return { Icon: fallbackIcon, LogoURL: agent.LogoURL };
    }

    return { Icon: fallbackIcon };
  }

  // ── Public Conversion Methods ───────────────────────────────

  /** Convert a single MJ step entity to a FlowNode (public for direct use when adding nodes) */
  StepToNode(
    step: MJAIAgentStepEntity,
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): FlowNode {
    const stepId = step.ID;
    const ports: FlowNodePort[] = [
      {
        ID: `${stepId}-input`,
        Direction: 'input',
        Side: 'top',
        Multiple: true,
        Disabled: step.StartingStep === true
      },
      {
        ID: `${stepId}-output`,
        Direction: 'output',
        Side: 'bottom',
        Multiple: true
      }
    ];

    // Show warning status when the step is missing its required configuration,
    // unless the step is explicitly disabled (respect the user's intent).
    const baseStatus = this.MapStepStatus(step.Status);
    const warningMessage = (baseStatus !== 'disabled') ? this.BuildConfigWarningMessage(step) : null;
    const effectiveStatus = warningMessage ? 'warning' : baseStatus;

    // Build loop-specific data for ForEach/While nodes
    const data: Record<string, unknown> = { StepEntityID: stepId };
    if (step.StepType === 'ForEach' || step.StepType === 'While') {
      this.populateLoopData(step, data, actions, agents);
    }

    // Resolve icon (and optional logo URL) from picker data
    const resolved = this.ResolveStepIcon(step, actions, agents);
    if (resolved.LogoURL) {
      data['LogoURL'] = resolved.LogoURL;
    }

    return {
      ID: stepId,
      Type: step.StepType,
      Label: step.Name,
      Subtitle: this.BuildStepSubtitle(step),
      Icon: resolved.Icon,
      Status: effectiveStatus,
      StatusMessage: warningMessage ?? undefined,
      IsStartNode: step.StartingStep === true,
      Position: {
        X: step.PositionX ?? 0,
        Y: step.PositionY ?? 0
      },
      Size: {
        Width: step.Width ?? 220,
        Height: step.Height ?? 100
      },
      Ports: ports,
      Data: data
    };
  }

  private pathToConnection(path: MJAIAgentStepPathEntity, allPaths: MJAIAgentStepPathEntity[]): FlowConnection {
    const hasCondition = path.Condition != null && path.Condition.trim().length > 0;
    const isAlwaysPath = !hasCondition;

    // Analyze sibling paths from the same origin step
    const siblingPaths = allPaths.filter(p => UUIDsEqual(p.OriginStepID, path.OriginStepID));
    const isOnlyPath = siblingPaths.length === 1;
    const unconditionalSiblings = siblingPaths.filter(
      p => !p.Condition || p.Condition.trim().length === 0
    );
    // Flag as ambiguous when 2+ unconditional paths exist from the same source.
    // Multiple unconditional paths are always ambiguous because only the
    // highest-priority one will execute — regardless of whether they have descriptions.
    const hasAmbiguousAlways = isAlwaysPath && unconditionalSiblings.length > 1;

    // Where this path sits in its exclusive group, when it is IN one. Highest Priority wins, ties
    // broken by path ID — and none of that precedence is visible on the canvas today, so someone
    // debugging a fork cannot tell which branch takes it when two conditions are both true.
    const conditionalSiblings = siblingPaths.filter(p => p.Condition && p.Condition.trim().length > 0);
    const rank = hasCondition && conditionalSiblings.length > 1
      ? this.rankWithinGroup(path, conditionalSiblings)
      : null;

    // Build label, icon, and visual style
    const visual = this.buildPathVisuals(path, hasCondition, isOnlyPath, hasAmbiguousAlways, rank);

    return {
      ID: path.ID,
      SourceNodeID: path.OriginStepID,
      SourcePortID: `${path.OriginStepID}-output`,
      TargetNodeID: path.DestinationStepID,
      TargetPortID: `${path.DestinationStepID}-input`,
      Label: visual.label,
      LabelIcon: visual.labelIcon,
      LabelIconColor: visual.labelIconColor,
      LabelDetail: visual.labelDetail,
      Condition: path.Condition ?? undefined,
      Priority: path.Priority,
      Style: visual.style,
      Color: visual.color,
      Data: {
        PathEntityID: path.ID,
        IsAlwaysPath: !hasCondition,
        HasAmbiguousAlways: hasAmbiguousAlways
      }
    };
  }

  /**
   * What an edge says on the canvas, and what it says on inspection.
   *
   * **An edge label answers one question: WHEN is this path taken?** That is the condition. The
   * `Description` is the author's rationale — genuinely useful, and inspection-time content: it is
   * prose, it is arbitrarily long, and rendering it always turned the least important element on the
   * canvas into the most visually dominant one, overlapping nodes and other labels.
   *
   * So the condition is the LABEL (truncated), the description is the DETAIL (the hover tooltip),
   * and an unconditional edge says nothing at all — a plain line already means "then". That last
   * rule removes most of the clutter on a real graph, because most edges are unconditional.
   */
  private buildPathVisuals(
    path: MJAIAgentStepPathEntity,
    hasCondition: boolean,
    isOnlyPath: boolean,
    hasAmbiguousAlways: boolean,
    rank: { position: number; total: number } | null = null
  ): { label?: string; labelIcon?: string; labelIconColor?: string; labelDetail?: string; color: string; style: FlowConnectionStyle } {
    const rationale = path.Description?.trim();

    // Conditional path — amber dashed, labelled with the RULE.
    if (hasCondition) {
      const condition = path.Condition!.trim();
      // The rank prefix is tiny and always fits, so it survives truncation — which matters, because
      // precedence is exactly what a truncated condition would otherwise hide.
      const prefix = rank ? `${rank.position}/${rank.total} ` : '';
      const precedence = rank
        ? `\n\nChecked ${ordinal(rank.position)} of ${rank.total}: highest priority wins, ties by path ID.`
        : '';
      return {
        label: prefix + this.truncateLabel(condition, rank ? 28 : 32),
        labelIcon: 'fa-code-branch',
        labelIconColor: '#f59e0b',
        // Full condition first — a truncated label is only safe if the whole thing is one hover
        // away — then the rationale, then how this branch is chosen against its siblings.
        labelDetail: (rationale ? `${condition}\n\n${rationale}` : condition) + precedence,
        color: '#f59e0b',
        style: 'dashed'
      };
    }

    // Ambiguous: multiple unconditional paths from the same step. This one KEEPS its label, because
    // it is a defect the author needs to see without hovering anything.
    if (hasAmbiguousAlways) {
      return {
        label: 'Duplicate default',
        labelIcon: 'fa-triangle-exclamation',
        labelIconColor: '#ef4444',
        labelDetail: rationale
          ? `Duplicate default paths: only the highest-priority one will execute.\n\n${rationale}`
          : 'Duplicate default paths: only the highest-priority one will execute',
        color: '#ef4444',
        style: 'solid'
      };
    }

    // Every other unconditional path — NO LABEL. The line already means "then", and "Default" on
    // every edge of a linear flow is a caption on each arrow of a diagram saying "arrow".
    // The rationale stays reachable on hover.
    return {
      labelDetail: rationale || undefined,
      color: isOnlyPath ? '#64748b' : '#16a34a',
      style: 'solid'
    };
  }

  /**
   * This path's position among its conditional siblings, in the order the dispatcher checks them.
   *
   * Mirrors the COMPILER, which is where the order is actually decided: `buildDependencies` sorts a
   * fan-out by `Priority` descending, then path ID ascending, and writes that ordinal into
   * `TaskDependency.Sequence` — which is what `ResolveExclusiveGroups` then reads at runtime. A path
   * row has no `Sequence` of its own and deliberately never has: a compiled edge gets a fresh UUID
   * and needs a stored ordinal to stay deterministic across machines, while a design-time path still
   * has its own stable ID to break the tie with. Ranking here by anything else would disagree with
   * the engine precisely on ties — and `Priority` defaults to 0, so ties are the common case.
   */
  private rankWithinGroup(
    path: MJAIAgentStepPathEntity,
    siblings: MJAIAgentStepPathEntity[]
  ): { position: number; total: number } {
    const ordered = [...siblings].sort((a, b) =>
      (b.Priority ?? 0) - (a.Priority ?? 0) || a.ID.localeCompare(b.ID)
    );
    return {
      position: ordered.findIndex(p => UUIDsEqual(p.ID, path.ID)) + 1,
      total: ordered.length
    };
  }

  /**
   * Trims a condition to what fits on an edge without covering its neighbours.
   *
   * Breaks on a word boundary when there is one near the limit, so the visible part stays readable
   * rather than ending mid-identifier. The full text is always in `labelDetail`.
   */
  private truncateLabel(text: string, limit = 32): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= limit) return flat;

    const cut = flat.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }

  /** Populate loop-specific display data on the node's Data payload */
  private populateLoopData(
    step: MJAIAgentStepEntity,
    data: Record<string, unknown>,
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): void {
    const bodyType = step.LoopBodyType;
    data['LoopBodyType'] = bodyType ?? null;
    data['LoopBodyName'] = bodyType ? this.resolveLoopBodyName(step) : null;
    data['LoopBodyIcon'] = bodyType ? this.resolveLoopBodySpecificIcon(step, actions, agents) : null;
    data['LoopBodyColor'] = bodyType ? this.getBodyTypeColor(bodyType) : null;
    data['LoopIterationSummary'] = this.BuildLoopIterationSummary(step);

    // Store logo URL for loop body sub-agents
    if (bodyType === 'Sub-Agent' && step.SubAgentID && agents) {
      const agent = agents.find(a => UUIDsEqual(a.ID, step.SubAgentID));
      if (agent?.LogoURL) {
        data['LoopBodyLogoURL'] = agent.LogoURL;
      }
    }

    const config = this.parseLoopConfig(step);
    if (config) {
      data['MaxIterations'] = config['maxIterations'] ?? null;
      data['LoopItemVariable'] = config['itemVariable'] ?? null;
    }
  }

  /** Resolve the best icon for a loop body, checking picker data first */
  private resolveLoopBodySpecificIcon(
    step: MJAIAgentStepEntity,
    actions?: ActionPickerItem[],
    agents?: AgentPickerItem[]
  ): string {
    const bodyType = step.LoopBodyType;
    const fallback = this.getBodyTypeIcon(bodyType ?? '');

    if (bodyType === 'Action' && step.ActionID && actions) {
      const action = actions.find(a => UUIDsEqual(a.ID, step.ActionID));
      return action?.IconClass || fallback;
    }
    if (bodyType === 'Sub-Agent' && step.SubAgentID && agents) {
      const agent = agents.find(a => UUIDsEqual(a.ID, step.SubAgentID));
      return agent?.IconClass || fallback;
    }
    return fallback;
  }

  /** Get icon for a loop body type */
  private getBodyTypeIcon(bodyType: string): string {
    switch (bodyType) {
      case 'Action': return 'fa-bolt';
      case 'Prompt': return 'fa-comment-dots';
      case 'Sub-Agent': return 'fa-robot';
      default: return 'fa-circle-nodes';
    }
  }

  /** Get color for a loop body type */
  private getBodyTypeColor(bodyType: string): string {
    switch (bodyType) {
      case 'Action': return '#3B82F6';
      case 'Prompt': return '#8B5CF6';
      case 'Sub-Agent': return '#10B981';
      default: return '#6B7280';
    }
  }

  private getIconForType(stepType: string): string {
    const config = AGENT_STEP_TYPE_CONFIGS.find(c => c.Type === stepType);
    return config?.Icon ?? 'fa-circle-nodes';
  }

  private buildLoopSubtitle(step: MJAIAgentStepEntity, prefix: string): string {
    const bodyType = step.LoopBodyType;
    if (!bodyType) return `${prefix} (no body type)`;
    const bodyName = this.resolveLoopBodyName(step);
    return bodyName ? `${prefix} → ${bodyName}` : `${prefix} → ${bodyType}`;
  }

  /** Resolve the display name for the loop body operation */
  private resolveLoopBodyName(step: MJAIAgentStepEntity): string | null {
    switch (step.LoopBodyType) {
      case 'Action': return step.Action ?? null;
      case 'Prompt': return step.Prompt ?? null;
      case 'Sub-Agent': return step.SubAgent ?? null;
      default: return null;
    }
  }

  /** Parse the Configuration JSON, returning null on failure */
  private parseLoopConfig(step: MJAIAgentStepEntity): Record<string, unknown> | null {
    if (!step.Configuration) return null;
    try {
      return JSON.parse(step.Configuration) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Build a short iteration summary for display on loop nodes */
  BuildLoopIterationSummary(step: MJAIAgentStepEntity): string {
    const config = this.parseLoopConfig(step);
    if (step.StepType === 'ForEach') {
      const collection = config?.['collectionPath'] as string | undefined;
      return collection ? `over ${collection}` : 'over collection';
    }
    if (step.StepType === 'While') {
      const condition = config?.['condition'] as string | undefined;
      return condition ? `while ${this.truncateCondition(condition)}` : 'while condition';
    }
    return '';
  }

  private truncateCondition(condition: string): string {
    const maxLen = 30;
    if (condition.length <= maxLen) return condition;
    return condition.substring(0, maxLen) + '...';
  }
}
