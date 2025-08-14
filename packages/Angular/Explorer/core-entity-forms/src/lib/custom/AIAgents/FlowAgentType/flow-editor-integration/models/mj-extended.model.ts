import { Step } from './step.model';
import { Connection } from './connection.model';

// Extended Step interface that includes MJ-specific fields
export interface MJStep extends Step {
  mjEntityId?: string;
  mjData?: {
    startingStep?: boolean;
    status?: string;
    description?: string;
  };
}

// Extended Connection interface that includes MJ-specific fields
export interface MJConnection extends Connection {
  mjEntityId?: string;
  mjPriority?: number;
}

// Extended properties for MJ entities that don't exist in the core schema
export interface MJAIAgentStepExtended {
  PromptText?: string;
  PromptType?: string;
  PositionX?: number;
  PositionY?: number;
}