export { run } from '@oclif/core';

// Export services for potential programmatic use
export { AgentService } from './services/AgentService';
export { ActionService } from './services/ActionService';
export { ConversationService } from './services/ConversationService';
export { ValidationService } from './services/ValidationService';

// Export utilities
export { OutputFormatter } from './lib/output-formatter';
export { ExecutionLogger, createExecutionLogger } from './lib/execution-logger';
export { initializeMJProvider, getConnectionPool, closeMJProvider } from './lib/mj-provider';
export { loadAIConfig } from './config';