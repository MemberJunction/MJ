import { Injectable } from '@angular/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { Step, StepType, STEP_CONFIGS } from '../models/step.model';
import { Connection, BooleanCondition } from '../models/connection.model';
import { MJStep, MJConnection, MJAIAgentStepExtended } from '../models/mj-extended.model';

@Injectable({
  providedIn: 'root'
})
export class MJFlowTransformerService {
  
  /**
   * Transform MJ entities to standalone flow editor models
   */
  transformToStandaloneModels(
    mjSteps: AIAgentStepEntity[], 
    mjPaths: AIAgentStepPathEntity[]
  ): { steps: MJStep[], connections: MJConnection[] } {
    // First, calculate smart positions if needed
    const positionedSteps = this.calculateSmartPositions(mjSteps, mjPaths);
    
    // Transform steps with calculated positions
    const steps = mjSteps.map(mjStep => {
      const position = positionedSteps.get(mjStep.ID);
      return this.transformStep(mjStep, position);
    });
    
    const connections = mjPaths.map(mjPath => this.transformPath(mjPath, mjSteps));
    
    return { steps, connections };
  }
  
  /**
   * Transform a single MJ step entity to standalone Step model
   */
  private transformStep(mjStep: AIAgentStepEntity & MJAIAgentStepExtended, calculatedPosition?: [number, number]): MJStep {
    // Map MJ step type to standalone step type
    const stepType = this.mapStepType(mjStep.StepType);
    const config = STEP_CONFIGS[stepType];
    
    // Use calculated position if available, otherwise use stored position
    let position: [number, number];
    if (calculatedPosition) {
      // Use the smart calculated position
      position = calculatedPosition;
    } else if (mjStep.PositionX && mjStep.PositionY && mjStep.PositionX > 0 && mjStep.PositionY > 0) {
      // Fall back to stored position
      position = [mjStep.PositionX, mjStep.PositionY];
    } else {
      // Default position as last resort
      position = [100, 100];
    }
    
    // Create the standalone step
    const step: MJStep = {
      id: this.generateNumericId(mjStep.ID),
      type: stepType,
      name: mjStep.Name || config.name,
      position: position,
      config: config,
      selectedOption: this.mapSelectedOption(mjStep),
      propertyValues: this.extractPropertyValues(mjStep),
      // Store original MJ entity ID for back-transformation
      mjEntityId: mjStep.ID,
      // Store additional MJ-specific data
      mjData: {
        startingStep: mjStep.StartingStep,
        status: mjStep.Status,
        description: mjStep.Description || undefined
      }
    };
    
    return step;
  }
  
  /**
   * Transform a single MJ path entity to standalone Connection model
   */
  private transformPath(mjPath: AIAgentStepPathEntity, mjSteps: AIAgentStepEntity[]): MJConnection {
    const sourceStep = mjSteps.find(s => s.ID === mjPath.OriginStepID);
    const targetStep = mjSteps.find(s => s.ID === mjPath.DestinationStepID);
    
    if (!sourceStep || !targetStep) {
      throw new Error(`Invalid path: source or target step not found for path ${mjPath.ID}`);
    }
    
    const connection: MJConnection = {
      id: mjPath.ID,
      source: this.generateNumericId(sourceStep.ID),
      target: this.generateNumericId(targetStep.ID),
      sourceOutput: 'out', // Default output socket
      targetInput: 'in',   // Default input socket
      condition: mjPath.Condition ? {
        expression: mjPath.Condition,
        label: this.extractConditionLabel(mjPath.Condition)
      } : undefined,
      // Store original MJ entity ID
      mjEntityId: mjPath.ID,
      // Store priority for ordering
      mjPriority: mjPath.Priority
    };
    
    return connection;
  }
  
  /**
   * Map MJ step type to standalone step type
   */
  private mapStepType(mjStepType: string | null): StepType {
    if (!mjStepType) return 'action';
    
    const typeMap: { [key: string]: StepType } = {
      'Prompt': 'prompt',
      'Sub-Agent': 'agent',
      'Action': 'action',
      // Add more mappings as needed
    };
    
    return typeMap[mjStepType] || 'action';
  }
  
  /**
   * Map MJ step to selected option for the standalone model
   */
  private mapSelectedOption(mjStep: AIAgentStepEntity & MJAIAgentStepExtended): string | undefined {
    // Map based on step type and MJ data
    if (mjStep.StepType === 'Prompt') {
      return mjStep.PromptType || 'user';
    } else if (mjStep.StepType === 'Sub-Agent') {
      return mjStep.SubAgentID ? 'subagent' : 'research';
    } else if (mjStep.StepType === 'Action') {
      return mjStep.ActionID ? 'api' : 'database';
    }
    
    return undefined;
  }
  
  /**
   * Extract property values from MJ step
   */
  private extractPropertyValues(mjStep: AIAgentStepEntity & MJAIAgentStepExtended): any {
    const values: any = {};
    
    // Extract prompt-related properties
    if (mjStep.StepType === 'Prompt') {
      if (mjStep.PromptText) {
        values.promptText = mjStep.PromptText;
      }
    }
    
    // Extract action-related properties
    if (mjStep.StepType === 'Action') {
      if (mjStep.ActionInputMapping) {
        values.inputMapping = mjStep.ActionInputMapping;
      }
      if (mjStep.ActionOutputMapping) {
        values.outputMapping = mjStep.ActionOutputMapping;
      }
    }
    
    // Extract sub-agent properties
    if (mjStep.StepType === 'Sub-Agent' && mjStep.SubAgentID) {
      values.subAgentId = mjStep.SubAgentID;
    }
    
    return values;
  }
  
  /**
   * Transform standalone models back to MJ entities for saving
   */
  transformToMJEntities(
    steps: MJStep[], 
    connections: MJConnection[],
    existingMJSteps: AIAgentStepEntity[],
    existingMJPaths: AIAgentStepPathEntity[]
  ): { 
    stepsToUpdate: AIAgentStepEntity[], 
    pathsToUpdate: AIAgentStepPathEntity[],
    stepsToCreate: Partial<AIAgentStepEntity>[],
    pathsToCreate: Partial<AIAgentStepPathEntity>[]
  } {
    const stepsToUpdate: AIAgentStepEntity[] = [];
    const stepsToCreate: Partial<AIAgentStepEntity>[] = [];
    const pathsToUpdate: AIAgentStepPathEntity[] = [];
    const pathsToCreate: Partial<AIAgentStepPathEntity>[] = [];
    
    // Process steps
    for (const step of steps) {
      const mjEntityId = step.mjEntityId;
      const existingStep = existingMJSteps.find(s => s.ID === mjEntityId);
      
      if (existingStep) {
        // Update existing step
        this.updateMJStep(existingStep, step);
        stepsToUpdate.push(existingStep);
      } else {
        // Create new step
        const newStep = this.createMJStep(step);
        stepsToCreate.push(newStep);
      }
    }
    
    // Process connections
    for (const connection of connections) {
      const mjEntityId = connection.mjEntityId;
      const existingPath = existingMJPaths.find(p => p.ID === mjEntityId);
      
      if (existingPath) {
        // Update existing path
        this.updateMJPath(existingPath, connection, steps);
        pathsToUpdate.push(existingPath);
      } else {
        // Create new path
        const newPath = this.createMJPath(connection, steps);
        pathsToCreate.push(newPath);
      }
    }
    
    return { stepsToUpdate, pathsToUpdate, stepsToCreate, pathsToCreate };
  }
  
  /**
   * Update existing MJ step with data from standalone model
   */
  private updateMJStep(mjStep: AIAgentStepEntity & MJAIAgentStepExtended, step: MJStep): void {
    mjStep.Name = step.name;
    mjStep.PositionX = Math.round(step.position[0]);
    mjStep.PositionY = Math.round(step.position[1]);
    mjStep.StepType = this.reverseMapStepType(step.type) as 'Action' | 'Sub-Agent' | 'Prompt';
    
    // Update property values
    if (step.propertyValues) {
      if (step.propertyValues.promptText !== undefined) {
        mjStep.PromptText = step.propertyValues.promptText;
      }
      if (step.propertyValues.inputMapping !== undefined) {
        mjStep.ActionInputMapping = step.propertyValues.inputMapping;
      }
      if (step.propertyValues.outputMapping !== undefined) {
        mjStep.ActionOutputMapping = step.propertyValues.outputMapping;
      }
    }
    
    // Preserve MJ-specific data if it exists
    const mjData = step.mjData;
    if (mjData) {
      if (mjData.startingStep !== undefined) {
        mjStep.StartingStep = mjData.startingStep;
      }
      if (mjData.status !== undefined) {
        mjStep.Status = mjData.status as 'Active' | 'Pending' | 'Disabled';
      }
      if (mjData.description !== undefined) {
        mjStep.Description = mjData.description;
      }
    }
  }
  
  /**
   * Create new MJ step from standalone model
   */
  private createMJStep(step: MJStep): Partial<AIAgentStepEntity & MJAIAgentStepExtended> {
    const mjData = step.mjData || {};
    
    return {
      Name: step.name,
      PositionX: Math.round(step.position[0]),
      PositionY: Math.round(step.position[1]),
      StepType: this.reverseMapStepType(step.type) as 'Action' | 'Sub-Agent' | 'Prompt',
      StartingStep: mjData.startingStep || false,
      Status: (mjData.status || 'Active') as 'Active' | 'Pending' | 'Disabled',
      Description: mjData.description || '',
      PromptText: step.propertyValues?.promptText,
      ActionInputMapping: step.propertyValues?.inputMapping,
      ActionOutputMapping: step.propertyValues?.outputMapping
    };
  }
  
  /**
   * Update existing MJ path with data from standalone model
   */
  private updateMJPath(mjPath: AIAgentStepPathEntity, connection: MJConnection, steps: MJStep[]): void {
    // Find the MJ entity IDs for source and target
    const sourceStep = steps.find(s => s.id === connection.source);
    const targetStep = steps.find(s => s.id === connection.target);
    
    if (sourceStep && targetStep) {
      mjPath.OriginStepID = sourceStep.mjEntityId || '';
      mjPath.DestinationStepID = targetStep.mjEntityId || '';
    }
    
    if (connection.condition) {
      mjPath.Condition = connection.condition.expression;
    }
    
    // Preserve priority if it exists
    const mjPriority = connection.mjPriority;
    if (mjPriority !== undefined) {
      mjPath.Priority = mjPriority;
    }
  }
  
  /**
   * Create new MJ path from standalone model
   */
  private createMJPath(connection: MJConnection, steps: MJStep[]): Partial<AIAgentStepPathEntity> {
    const sourceStep = steps.find(s => s.id === connection.source);
    const targetStep = steps.find(s => s.id === connection.target);
    
    return {
      OriginStepID: sourceStep?.mjEntityId || '',
      DestinationStepID: targetStep?.mjEntityId || '',
      Condition: connection.condition?.expression || '',
      Priority: connection.mjPriority || 0
    };
  }
  
  /**
   * Reverse map standalone step type to MJ step type
   */
  private reverseMapStepType(stepType: StepType): string {
    const reverseMap: { [key in StepType]: string } = {
      'prompt': 'Prompt',
      'agent': 'Sub-Agent',
      'action': 'Action'
    };
    
    return reverseMap[stepType];
  }
  
  /**
   * Generate numeric ID from string UUID
   * This is needed because the standalone editor uses numeric IDs
   */
  private generateNumericId(uuid: string): number {
    // Simple hash function to convert UUID to number
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      const char = uuid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Extract a readable label from a condition expression
   */
  private extractConditionLabel(condition: string): string {
    // Simple extraction - can be enhanced
    if (condition.toLowerCase().includes('success')) return 'Success';
    if (condition.toLowerCase().includes('fail')) return 'Failure';
    if (condition.toLowerCase().includes('error')) return 'Error';
    
    // Return first 20 chars if no pattern matches
    return condition.length > 20 ? condition.substring(0, 20) + '...' : condition;
  }
  
  /**
   * Calculate smart positions for steps that don't have valid positions
   */
  private calculateSmartPositions(
    mjSteps: AIAgentStepEntity[], 
    mjPaths: AIAgentStepPathEntity[]
  ): Map<string, [number, number]> {
    const positions = new Map<string, [number, number]>();
    
    // Check if all steps already have valid positions
    const allHavePositions = mjSteps.every(step => 
      step.PositionX && step.PositionY && step.PositionX > 0 && step.PositionY > 0
    );
    
    // TEMPORARY: Force recalculation for testing
    // Comment out these lines to use saved positions
    const forceRecalculate = true;
    if (allHavePositions && !forceRecalculate) {
      // Return empty map if all positions are valid
      return positions;
    }
    
    // Build adjacency lists for the flow graph
    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    const allStepIds = new Set(mjSteps.map(s => s.ID));
    
    mjPaths.forEach(path => {
      // Children of a step
      if (!children.has(path.OriginStepID)) {
        children.set(path.OriginStepID, []);
      }
      children.get(path.OriginStepID)!.push(path.DestinationStepID);
      
      // Parents of a step
      if (!parents.has(path.DestinationStepID)) {
        parents.set(path.DestinationStepID, []);
      }
      parents.get(path.DestinationStepID)!.push(path.OriginStepID);
    });
    
    // Find starting steps (no parents or marked as starting)
    const startingSteps = mjSteps.filter(step => 
      step.StartingStep || !parents.has(step.ID) || parents.get(step.ID)!.length === 0
    );
    
    // If no starting steps found, use the first step
    if (startingSteps.length === 0 && mjSteps.length > 0) {
      startingSteps.push(mjSteps[0]);
    }
    
    // Calculate levels using BFS
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const queue: { id: string, level: number }[] = [];
    
    // Start with starting steps at level 0
    startingSteps.forEach(step => {
      queue.push({ id: step.ID, level: 0 });
      levels.set(step.ID, 0);
      visited.add(step.ID);
    });
    
    // BFS to assign levels
    let maxLevel = 0;
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      maxLevel = Math.max(maxLevel, level);
      
      // Process children
      const stepChildren = children.get(id) || [];
      stepChildren.forEach(childId => {
        if (!visited.has(childId) && allStepIds.has(childId)) {
          visited.add(childId);
          levels.set(childId, level + 1);
          queue.push({ id: childId, level: level + 1 });
        }
      });
    }
    
    // Handle disconnected steps
    mjSteps.forEach(step => {
      if (!levels.has(step.ID)) {
        levels.set(step.ID, maxLevel + 1);
      }
    });
    
    // Group steps by level
    const stepsByLevel = new Map<number, AIAgentStepEntity[]>();
    mjSteps.forEach(step => {
      const level = levels.get(step.ID) || 0;
      if (!stepsByLevel.has(level)) {
        stepsByLevel.set(level, []);
      }
      stepsByLevel.get(level)!.push(step);
    });
    
    // Calculate positions
    const horizontalSpacing = 450; // Increased space between levels for better condition visibility
    const verticalSpacing = 180;   // Increased vertical spacing to see conditions clearly
    const startX = 100;            // Start closer to left edge
    const startY = 50;             // Start much closer to top
    
    stepsByLevel.forEach((stepsInLevel, level) => {
      const x = startX + (level * horizontalSpacing);
      // Center vertically based on viewport, not total levels
      const totalHeight = (stepsInLevel.length - 1) * verticalSpacing;
      const startYForLevel = startY + Math.max(0, (400 - totalHeight) / 2); // Center around 400px height for better visibility
      
      stepsInLevel.forEach((step, index) => {
        const y = startYForLevel + (index * verticalSpacing);
        positions.set(step.ID, [x, y]);
      });
    });
    
    return positions;
  }
}