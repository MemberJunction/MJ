export { run } from '@oclif/core';

// Export services for potential programmatic use
export { AgentService } from './services/AgentService';
export { ActionService } from './services/ActionService';
export { ConversationService } from './services/ConversationService';
export { ValidationService } from './services/ValidationService';
export { PromptService } from './services/PromptService';
export { AgentAuditService } from './services/AgentAuditService';

// Export utilities
export { OutputFormatter } from './lib/output-formatter';
export { ExecutionLogger, createExecutionLogger } from './lib/execution-logger';
export { initializeMJProvider, getConnectionPool, closeMJProvider } from './lib/mj-provider';
export { loadAIConfig } from './config';
export { AuditAnalyzer } from './lib/audit-analyzer';
export { AuditFormatter } from './lib/audit-formatter';

// Export types for AgentAuditService
export type {
  RunSummary,
  StepDetail,
  ErrorAnalysis,
  ListRunsOptions,
  StepDetailOptions,
  RunSummaryOptions,
} from './services/AgentAuditService';


