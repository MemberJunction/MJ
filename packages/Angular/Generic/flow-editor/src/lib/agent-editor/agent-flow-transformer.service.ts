import { Injectable } from '@angular/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowNode, FlowConnection, FlowConnectionStyle, FlowNodeTypeConfig, FlowNodePort } from '../interfaces/flow-types';

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

/**
 * Transforms MJ AIAgentStep/Path entities to/from generic FlowNode/FlowConnection models.
 */
@Injectable()
export class AgentFlowTransformerService {

  /** Convert MJ step entities to generic FlowNodes */
  StepsToNodes(steps: AIAgentStepEntity[]): FlowNode[] {
    return steps.map(step => this.stepToNode(step));
  }

  /** Convert MJ path entities to generic FlowConnections */
  PathsToConnections(paths: AIAgentStepPathEntity[]): FlowConnection[] {
    return paths.map(path => this.pathToConnection(path, paths));
  }

  /** Build the subtitle for a step based on its configured action/prompt/agent */
  BuildStepSubtitle(step: AIAgentStepEntity): string {
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
  ApplyNodePosition(step: AIAgentStepEntity, node: FlowNode): void {
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
  BuildConfigWarningMessage(step: AIAgentStepEntity): string | null {
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

  private buildLoopWarningMessage(step: AIAgentStepEntity): string | null {
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
  IsStepMissingConfiguration(step: AIAgentStepEntity): boolean {
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

  private isLoopBodyMissingReference(step: AIAgentStepEntity): boolean {
    const bodyType = step.LoopBodyType;
    if (!bodyType) return true; // No body type selected at all
    switch (bodyType) {
      case 'Action': return !step.ActionID;
      case 'Prompt': return !step.PromptID;
      case 'Sub-Agent': return !step.SubAgentID;
      default: return false;
    }
  }

  // ── Private Helpers ─────────────────────────────────────────

  private stepToNode(step: AIAgentStepEntity): FlowNode {
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
      this.populateLoopData(step, data);
    }

    return {
      ID: stepId,
      Type: step.StepType,
      Label: step.Name,
      Subtitle: this.BuildStepSubtitle(step),
      Icon: this.getIconForType(step.StepType),
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

  private pathToConnection(path: AIAgentStepPathEntity, allPaths: AIAgentStepPathEntity[]): FlowConnection {
    const hasCondition = path.Condition != null && path.Condition.trim().length > 0;
    const isAlwaysPath = !hasCondition;

    // Analyze sibling paths from the same origin step
    const siblingPaths = allPaths.filter(p => p.OriginStepID === path.OriginStepID);
    const isOnlyPath = siblingPaths.length === 1;
    const unconditionalSiblings = siblingPaths.filter(
      p => !p.Condition || p.Condition.trim().length === 0
    );
    // Flag as ambiguous when 2+ unconditional paths exist from the same source.
    // Multiple unconditional paths are always ambiguous because only the
    // highest-priority one will execute — regardless of whether they have descriptions.
    const hasAmbiguousAlways = isAlwaysPath && unconditionalSiblings.length > 1;

    // Build label, icon, and visual style
    const visual = this.buildPathVisuals(path, hasCondition, isOnlyPath, hasAmbiguousAlways);

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

  private buildPathVisuals(
    path: AIAgentStepPathEntity,
    hasCondition: boolean,
    isOnlyPath: boolean,
    hasAmbiguousAlways: boolean
  ): { label?: string; labelIcon?: string; labelIconColor?: string; labelDetail?: string; color: string; style: FlowConnectionStyle } {
    // Conditional path — amber dashed with condition text
    if (hasCondition) {
      return {
        label: path.Description || path.Condition!,
        color: '#f59e0b',
        style: 'dashed'
      };
    }

    // Sole unconditional (only exit path) — neutral dark slate with Default indicator
    if (isOnlyPath) {
      return {
        label: path.Description || 'Default',
        labelIcon: 'fa-circle-check',
        labelIconColor: '#16a34a',
        color: '#64748b',
        style: 'solid'
      };
    }

    // Ambiguous: multiple unconditional paths from the same step
    if (hasAmbiguousAlways) {
      return {
        label: path.Description || 'Default',
        labelIcon: 'fa-triangle-exclamation',
        labelIconColor: '#ef4444',
        labelDetail: 'Duplicate default paths: only the highest-priority one will execute',
        color: '#ef4444',
        style: 'solid'
      };
    }

    // Valid default path (unconditional among conditional siblings) — forest green with checkmark
    return {
      label: path.Description || 'Default',
      labelIcon: 'fa-circle-check',
      labelIconColor: '#16a34a',
      color: '#16a34a',
      style: 'solid'
    };
  }

  /** Populate loop-specific display data on the node's Data payload */
  private populateLoopData(step: AIAgentStepEntity, data: Record<string, unknown>): void {
    const bodyType = step.LoopBodyType;
    data['LoopBodyType'] = bodyType ?? null;
    data['LoopBodyName'] = bodyType ? this.resolveLoopBodyName(step) : null;
    data['LoopBodyIcon'] = bodyType ? this.getBodyTypeIcon(bodyType) : null;
    data['LoopBodyColor'] = bodyType ? this.getBodyTypeColor(bodyType) : null;
    data['LoopIterationSummary'] = this.BuildLoopIterationSummary(step);

    const config = this.parseLoopConfig(step);
    if (config) {
      data['MaxIterations'] = config['maxIterations'] ?? null;
      data['LoopItemVariable'] = config['itemVariable'] ?? null;
    }
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

  private buildLoopSubtitle(step: AIAgentStepEntity, prefix: string): string {
    const bodyType = step.LoopBodyType;
    if (!bodyType) return `${prefix} (no body type)`;
    const bodyName = this.resolveLoopBodyName(step);
    return bodyName ? `${prefix} → ${bodyName}` : `${prefix} → ${bodyType}`;
  }

  /** Resolve the display name for the loop body operation */
  private resolveLoopBodyName(step: AIAgentStepEntity): string | null {
    switch (step.LoopBodyType) {
      case 'Action': return step.Action ?? null;
      case 'Prompt': return step.Prompt ?? null;
      case 'Sub-Agent': return step.SubAgent ?? null;
      default: return null;
    }
  }

  /** Parse the Configuration JSON, returning null on failure */
  private parseLoopConfig(step: AIAgentStepEntity): Record<string, unknown> | null {
    if (!step.Configuration) return null;
    try {
      return JSON.parse(step.Configuration) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Build a short iteration summary for display on loop nodes */
  BuildLoopIterationSummary(step: AIAgentStepEntity): string {
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
