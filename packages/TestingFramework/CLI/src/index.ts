/**
 * MemberJunction Testing CLI
 *
 * Command-line interface for the Testing Framework.
 * Provides thin wrappers around Testing Engine for CLI execution.
 */

// Command implementations
export { RunCommand } from './commands/run';
export { SuiteCommand } from './commands/suite';
export { ListCommand } from './commands/list';
export { ValidateCommand } from './commands/validate';
export { ReportCommand } from './commands/report';
export { HistoryCommand } from './commands/history';
export { CompareCommand } from './commands/compare';

// Utilities
export { OutputFormatter } from './utils/output-formatter';
export { loadCLIConfig } from './utils/config-loader';
export { SpinnerManager } from './utils/spinner-manager';

// Types
export * from './types';
