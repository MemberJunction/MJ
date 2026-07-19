export { ComponentLinter, LintResult, Violation } from './component-linter';
export { BaseLintRule } from './lint-rule';
export {
  LibraryLintCache,
  CompiledLibraryRules,
  CompiledValidator,
} from './library-lint-cache';
export type { LinterOptions } from './linter-options';
// Schema validation (semantic validators are @RegisterClass plugins, so they
// must be reachable from the public API).
export * from './schema-validation';

// Re-export the built-in rules. `export *` preserves the side effect that
// registers every @RegisterClass rule when the package is imported, and also
// makes the rule classes importable by name — required, since a registered
// class must be reachable from its package's public API.
export * from './runtime-rules';
