import * as t from '@babel/types';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentExecutionOptions } from './component-runner';

/**
 * Context object passed to lint rules for validation.
 * Provides all necessary information for rules to perform analysis.
 */
export interface LintContext {
  /**
   * The parsed Babel AST of the component code
   */
  ast: t.File;

  /**
   * Name of the component being linted
   */
  componentName: string;

  /**
   * Optional component specification with metadata (libraries, dependencies, events, etc.)
   */
  componentSpec?: ComponentSpec;

  /**
   * Optional execution options for the component
   */
  options?: ComponentExecutionOptions;

  /**
   * Debug mode flag
   */
  debugMode?: boolean;
}
