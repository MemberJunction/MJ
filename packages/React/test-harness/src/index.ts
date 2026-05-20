export { ReactTestHarness, TestHarnessOptions } from './lib/test-harness';
export { BrowserManager, BrowserContextOptions } from './lib/browser-context';
// Export the component runner that uses the real React runtime UMD bundle
export { ComponentRunner, ComponentExecutionOptions, ComponentExecutionResult } from './lib/component-runner';
export { AssertionHelpers } from './lib/assertion-helpers';

// Lint engine lives in @memberjunction/react-linter (browser-free Babel/TS
// static analysis). Re-exported here for back-compat with existing
// consumers that import from this package.
export {
  ComponentLinter,
  LintResult,
  Violation,
  BaseLintRule,
  LibraryLintCache,
  CompiledLibraryRules,
  CompiledValidator,
  LinterOptions,
} from '@memberjunction/react-linter';

export { ComponentSpec } from '@memberjunction/interactive-component-types';
