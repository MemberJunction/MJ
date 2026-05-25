export { ReactTestHarness, TestHarnessOptions } from './lib/test-harness';
export { BrowserManager, BrowserContextOptions } from './lib/browser-context';
// Export the component runner that uses the real React runtime UMD bundle
export { ComponentRunner, ComponentExecutionOptions, ComponentExecutionResult } from './lib/component-runner';
export { AssertionHelpers } from './lib/assertion-helpers';

// NOTE: The lint engine API (ComponentLinter, LintResult, Violation, BaseLintRule,
// LibraryLintCache, CompiledLibraryRules, CompiledValidator, LinterOptions) was
// previously re-exported here for back-compat after the 5.37 extraction. Those
// re-exports were removed in 5.38 per the project's no-re-exports-between-packages
// rule.
//
// Import directly from the source packages:
//   import { ComponentLinter, LintResult, Violation } from '@memberjunction/react-linter';
//   import { ComponentSpec } from '@memberjunction/interactive-component-types';
