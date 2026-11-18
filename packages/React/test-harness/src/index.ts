export { ReactTestHarness, TestHarnessOptions } from './lib/test-harness';
export { BrowserManager, BrowserContextOptions, ClassifyConnectEndpoint } from './lib/browser-context';
export { NetworkAllowlist, NetworkAccessMode, HostOfUrl, RedactUrl } from './lib/network-policy';
// Export the component runner that uses the real React runtime UMD bundle
export {
  ComponentRunner,
  ComponentExecutionOptions,
  ComponentExecutionResult,
  DataCapOptions,
  DataAccessRecord,
  // Exported so callers can reason about the ceiling they are overriding.
  DEFAULT_RUN_VIEW_MAX_ROWS,
  DEFAULT_RUN_QUERY_MAX_ROWS,
  // Identity resolution for the data bridges, mirroring how RunView/RunQuery resolve a target.
  DescribeQueryTarget,
  DescribeViewTarget,
  ResolveQueryTarget,
  ResolveViewTarget,
  DataAccessIdentity,
  // The page's network allowlist: which library URLs it allows, and the rule of a blocked request.
  LibraryNetworkUrls,
  NETWORK_REQUEST_BLOCKED_RULE,
} from './lib/component-runner';
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
