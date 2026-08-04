export { ComponentLinter, LintResult, Violation } from './component-linter';
export { BaseLintRule } from './lint-rule';
export {
  LibraryLintCache,
  CompiledLibraryRules,
  CompiledValidator,
} from './library-lint-cache';
export type { LinterOptions } from './linter-options';
// Side-effect import — ensures all built-in @RegisterClass rules are registered
// when the package is imported. The barrel pulls in component-linter, which
// already has this side-effect import internally, so this line is defensive.
import './runtime-rules';
