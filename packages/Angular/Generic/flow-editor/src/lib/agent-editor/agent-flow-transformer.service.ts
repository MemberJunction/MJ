import { Injectable } from '@angular/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowNode, FlowConnection, FlowNodeTypeConfig, FlowNodePort } from '../interfaces/flow-types';

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
    return paths.map(path => this.pathToConnection(path));
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
    const effectiveStatus = (baseStatus !== 'disabled' && this.IsStepMissingConfiguration(step))
      ? 'warning'
      : baseStatus;

    return {
      ID: stepId,
      Type: step.StepType,
      Label: step.Name,
      Subtitle: this.BuildStepSubtitle(step),
      Icon: this.getIconForType(step.StepType),
      Status: effectiveStatus,
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
      Data: { StepEntityID: stepId }
    };
  }

  private pathToConnection(path: AIAgentStepPathEntity): FlowConnection {
    const hasCondition = path.Condition != null && path.Condition.trim().length > 0;

    return {
      ID: path.ID,
      SourceNodeID: path.OriginStepID,
      SourcePortID: `${path.OriginStepID}-output`,
      TargetNodeID: path.DestinationStepID,
      TargetPortID: `${path.DestinationStepID}-input`,
      Label: path.Description || (hasCondition ? this.truncateCondition(path.Condition!) : undefined),
      Condition: path.Condition ?? undefined,
      Priority: path.Priority,
      Style: hasCondition ? 'dashed' : 'solid',
      Color: hasCondition ? '#f59e0b' : '#94a3b8',
      Data: { PathEntityID: path.ID }
    };
  }

  private getIconForType(stepType: string): string {
    const config = AGENT_STEP_TYPE_CONFIGS.find(c => c.Type === stepType);
    return config?.Icon ?? 'fa-circle-nodes';
  }

  private buildLoopSubtitle(step: AIAgentStepEntity, prefix: string): string {
    const bodyType = step.LoopBodyType ?? 'Action';
    return `${prefix} → ${bodyType}`;
  }

  private truncateCondition(condition: string): string {
    const maxLen = 30;
    if (condition.length <= maxLen) return condition;
    return condition.substring(0, maxLen) + '...';
  }
}
