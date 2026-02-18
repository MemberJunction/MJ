import * as parser from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

// @babel/traverse is CJS - in Node.js ESM, the function is at .default
// See: https://github.com/babel/babel/discussions/13093
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;
import { ComponentSpec, ComponentQueryDataRequirement, SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import type { EntityFieldInfo, EntityInfo, RunQueryResult, RunViewResult } from '@memberjunction/core';
import { Metadata } from '@memberjunction/core';
import { MJComponentLibraryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { LibraryLintCache } from './library-lint-cache';
import { ComponentExecutionOptions } from './component-runner';
import { StylesTypeAnalyzer } from './styles-type-analyzer';
import { TypeContext, mapSQLTypeToJSType, FieldTypeInfo, StandardTypes } from './type-context';
import { TypeInferenceEngine } from './type-inference-engine';
import { ControlFlowAnalyzer } from './control-flow-analyzer';
import { ValidationContext, BaseConstraintValidator } from './constraint-validators';
import { PropValueExtractor } from './prop-value-extractor';
import type { PropertyConstraint, ConstraintViolation } from '@memberjunction/interactive-component-types';
import { MJGlobal } from '@memberjunction/global';

export interface LintResult {
  success: boolean;
  violations: Violation[];
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  hasErrors: boolean;
}

export interface LintOptions {
  debugMode?: boolean;
}

export interface Violation {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number;
  column: number;
  message: string;
  code?: string;
  source?: 'user-component' | 'runtime-wrapper' | 'react-framework' | 'test-harness';
  suggestion?: {
    text: string;
    example?: string;
  };
}

interface Rule {
  name: string;
  appliesTo: 'all' | 'child' | 'root';
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec, options?: ComponentExecutionOptions) => Violation[];
}

// Standard HTML elements (lowercase)
const HTML_ELEMENTS = new Set([
  // Main root
  'html',
  // Document metadata
  'base',
  'head',
  'link',
  'meta',
  'style',
  'title',
  // Sectioning root
  'body',
  // Content sectioning
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'main',
  'nav',
  'section',
  // Text content
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'menu',
  'ol',
  'p',
  'pre',
  'ul',
  // Inline text semantics
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
  // Image and multimedia
  'area',
  'audio',
  'img',
  'map',
  'track',
  'video',
  // Embedded content
  'embed',
  'iframe',
  'object',
  'param',
  'picture',
  'portal',
  'source',
  // SVG and MathML
  'svg',
  'math',
  // Scripting
  'canvas',
  'noscript',
  'script',
  // Demarcating edits
  'del',
  'ins',
  // Table content
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  // Forms
  'button',
  'datalist',
  'fieldset',
  'form',
  'input',
  'label',
  'legend',
  'meter',
  'optgroup',
  'option',
  'output',
  'progress',
  'select',
  'textarea',
  // Interactive elements
  'details',
  'dialog',
  'summary',
  // Web Components
  'slot',
  'template',
  // SVG elements (common ones)
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'stop',
  'switch',
  'symbol',
  'text',
  'textPath',
  'tspan',
  'use',
  'view',
]);

// React built-in components (PascalCase)
const REACT_BUILT_INS = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);

// Helper function
function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

// Extract property names from TypeScript types at compile time
// These will be evaluated at TypeScript compile time and become static arrays
const runQueryResultProps: readonly string[] = [
  'QueryID',
  'QueryName',
  'Success',
  'Results',
  'RowCount',
  'TotalRowCount',
  'ExecutionTime',
  'ErrorMessage',
  'AppliedParameters',
  'CacheHit',
  'CacheKey',
  'CacheTTLRemaining',
] as const satisfies readonly (keyof RunQueryResult)[];

const runViewResultProps: readonly string[] = [
  'Success',
  'Results',
  'UserViewRunID',
  'RowCount',
  'TotalRowCount',
  'ExecutionTime',
  'ErrorMessage',
] as const satisfies readonly (keyof RunViewResult)[];
// ═══════════════════════════════════════════════════════════════════════════// SHARED CONSTANTS - Used across multiple rules// ═══════════════════════════════════════════════════════════════════════════// Standard props that are always valid (passed by the runtime to all components)const STANDARD_PROPS = new Set([  'utilities', 'styles', 'components', 'callbacks',  'savedUserSettings', 'onSaveUserSettings']);// React special props that are automatically provided by Reactconst REACT_SPECIAL_PROPS = new Set(['children', 'key', 'ref']);// ═══════════════════════════════════════════════════════════════════════════// SHARED HELPER FUNCTIONS - Used across multiple rules// ═══════════════════════════════════════════════════════════════════════════/** * Convert an event name to its React prop name format. * Events follow React convention: 'dataPointClick' -> 'onDataPointClick' * If already prefixed with 'on', returns as-is. */function toEventPropName(eventName: string): string {  // If already starts with 'on' and next char is uppercase, it's already in prop format  if (eventName.startsWith('on') && eventName.length > 2 &&      eventName[2] === eventName[2].toUpperCase()) {    return eventName;  }  // Convert to 'onEventName' format  return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;}/** * Simple Levenshtein distance implementation for typo suggestions */function levenshteinDistance(a: string, b: string): number {  const matrix: number[][] = [];  for (let i = 0; i <= b.length; i++) {    matrix[i] = [i];  }  for (let j = 0; j <= a.length; j++) {    matrix[0][j] = j;  }  for (let i = 1; i <= b.length; i++) {    for (let j = 1; j <= a.length; j++) {      if (b.charAt(i - 1) === a.charAt(j - 1)) {        matrix[i][j] = matrix[i - 1][j - 1];      } else {        matrix[i][j] = Math.min(          matrix[i - 1][j - 1] + 1,          matrix[i][j - 1] + 1,          matrix[i - 1][j] + 1        );      }    }  }  return matrix[b.length][a.length];}/** * Find the closest matching string from candidates using Levenshtein distance */function findClosestMatch(target: string, candidates: string[]): string | null {  if (candidates.length === 0) return null;  let bestMatch = '';  let bestDistance = Infinity;  for (const candidate of candidates) {    const distance = levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());    if (distance < bestDistance && distance <= 3) { // Max distance of 3 for suggestions      bestDistance = distance;      bestMatch = candidate;    }  }  return bestMatch || null;}

export class ComponentLinter {
  private static stylesAnalyzer: StylesTypeAnalyzer;

  // Get or create the styles analyzer instance
  private static getStylesAnalyzer(): StylesTypeAnalyzer {
    if (!ComponentLinter.stylesAnalyzer) {
      ComponentLinter.stylesAnalyzer = new StylesTypeAnalyzer();
    }
    return ComponentLinter.stylesAnalyzer;
  }

  // Helper method to check if a statement contains a return
  private static containsReturn(node: t.Node): boolean {
    let hasReturn = false;

    // Create a mini AST to traverse - handle both Statements and Expressions
    let programBody: t.Statement[];
    if (t.isStatement(node)) {
      programBody = [node];
    } else if (t.isExpression(node)) {
      programBody = [t.expressionStatement(node)];
    } else {
      // For other node types, just return false
      return false;
    }

    const file = t.file(t.program(programBody));

    traverse(file, {
      ReturnStatement(path) {
        // Don't count returns in nested functions
        const parent = path.getFunctionParent();
        if (!parent || parent.node === node) {
          hasReturn = true;
        }
      },
    });

    return hasReturn;
  }

  // Helper method to check if a variable comes from RunQuery or RunView
  private static isVariableFromRunQueryOrView(path: NodePath<any>, varName: string, methodName: string): boolean {
    let isFromMethod = false;

    // Look up the binding for this variable
    const binding = path.scope.getBinding(varName);
    if (binding && binding.path) {
      // Check if it's from a .then() or await of RunQuery/RunView
      const parent = binding.path.parent;
      if (t.isVariableDeclarator(binding.path.node)) {
        const init = binding.path.node.init;

        // Check for await utilities.rq.RunQuery or utilities.rv.RunView
        if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
          const callee = init.argument.callee;
          if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
            if (callee.property.name === methodName || callee.property.name === methodName + 's') {
              // RunViews
              isFromMethod = true;
            }
          }
        }

        // Check for .then() pattern
        if (t.isCallExpression(init) && t.isMemberExpression(init.callee)) {
          if (t.isIdentifier(init.callee.property) && init.callee.property.name === 'then') {
            // Check if the object being called is RunQuery/RunView
            const obj = init.callee.object;
            if (t.isCallExpression(obj) && t.isMemberExpression(obj.callee)) {
              if (t.isIdentifier(obj.callee.property) && (obj.callee.property.name === methodName || obj.callee.property.name === methodName + 's')) {
                isFromMethod = true;
              }
            }
          }
        }
      }
    }

    return isFromMethod;
  }

  // Universal rules that apply to all components with SavedUserSettings pattern
  private static universalComponentRules: Rule[] = [
    {
      name: 'no-import-statements',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
            violations.push({
              rule: 'no-import-statements',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an import statement. Interactive components cannot use import statements - all dependencies must be passed as props.`,
              code: path.toString().substring(0, 100),
            });
          },
        });

        return violations;
      },
    },

    {
      name: 'no-export-statements',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Track if we're inside the main function and where it ends
        let mainFunctionEnd = 0;

        // First pass: find the main component function
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id?.name === componentName) {
              mainFunctionEnd = path.node.loc?.end.line || 0;
              path.stop(); // Stop traversing once we find it
            }
          },
          FunctionExpression(path: NodePath<t.FunctionExpression>) {
            // Check for function expressions assigned to const/let/var
            const parent = path.parent;
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
              mainFunctionEnd = path.node.loc?.end.line || 0;
              path.stop();
            }
          },
          ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
            // Check for arrow functions assigned to const/let/var
            const parent = path.parent;
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
              mainFunctionEnd = path.node.loc?.end.line || 0;
              path.stop();
            }
          },
        });

        // Second pass: check for export statements
        traverse(ast, {
          ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
            const line = path.node.loc?.start.line || 0;
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: line,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100),
            });
          },
          ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
            const line = path.node.loc?.start.line || 0;
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: line,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export default statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100),
            });
          },
          ExportAllDeclaration(path: NodePath<t.ExportAllDeclaration>) {
            const line = path.node.loc?.start.line || 0;
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: line,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export * statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100),
            });
          },
        });

        return violations;
      },
    },

    {
      name: 'no-require-statements',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for require() calls
            if (t.isIdentifier(callee) && callee.name === 'require') {
              violations.push({
                rule: 'no-require-statements',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component "${componentName}" contains a require() statement. Interactive components cannot use require - all dependencies must be passed as props.`,
                code: path.toString().substring(0, 100),
              });
            }

            // Also check for dynamic import() calls
            if (t.isImport(callee)) {
              violations.push({
                rule: 'no-require-statements',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component "${componentName}" contains a dynamic import() statement. Interactive components cannot use dynamic imports - all dependencies must be passed as props.`,
                code: path.toString().substring(0, 100),
              });
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'use-function-declaration',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Only check TOP-LEVEL declarations (not nested inside functions)
            // This prevents flagging arrow functions inside the component
            const isTopLevel = path.getFunctionParent() === null || path.scope.path.type === 'Program';

            if (!isTopLevel) {
              return; // Skip non-top-level declarations
            }

            // Check if this is the main component being defined as arrow function
            if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
              const init = path.node.init;

              // Check if it's an arrow function
              if (t.isArrowFunctionExpression(init)) {
                violations.push({
                  rule: 'use-function-declaration',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" must be defined using function declaration syntax, not arrow function.`,
                  code: path.toString().substring(0, 150),
                });
              }
            }

            // Also check for any other TOP-LEVEL component-like arrow functions (starts with capital letter)
            // But ONLY at the top level, not inside the component
            if (t.isIdentifier(path.node.id) && /^[A-Z]/.test(path.node.id.name)) {
              const init = path.node.init;
              if (t.isArrowFunctionExpression(init)) {
                // Only flag if it's at the top level (parallel to main component)
                violations.push({
                  rule: 'use-function-declaration',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Top-level component "${path.node.id.name}" should use function declaration syntax.`,
                  code: path.toString().substring(0, 150),
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'no-return-component',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Check for return statements at the program/top level
        if (ast.program && ast.program.body) {
          for (const statement of ast.program.body) {
            // Check for return statement returning the component
            if (t.isReturnStatement(statement)) {
              const argument = statement.argument;

              // Check if it's returning the component identifier or any identifier
              if (argument && t.isIdentifier(argument)) {
                // If it's returning the component name or any identifier at top level
                violations.push({
                  rule: 'no-return-component',
                  severity: 'critical',
                  line: statement.loc?.start.line || 0,
                  column: statement.loc?.start.column || 0,
                  message: `Do not return the component at the end of the file. The component function should stand alone.`,
                  code: `return ${argument.name};`,
                });
              }
            }

            // Also check for expression statements that might be standalone identifiers
            if (t.isExpressionStatement(statement) && t.isIdentifier(statement.expression) && statement.expression.name === componentName) {
              violations.push({
                rule: 'no-return-component',
                severity: 'critical',
                line: statement.loc?.start.line || 0,
                column: statement.loc?.start.column || 0,
                message: `Do not reference the component "${componentName}" at the end of the file. The component function should stand alone.`,
                code: statement.expression.name,
              });
            }
          }
        }

        return violations;
      },
    },

    {
      name: 'component-name-mismatch',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // The expected component name from the spec
        const expectedName = componentSpec?.name || componentName;

        // Find the main function declaration
        let foundMainFunction = false;
        let actualFunctionName: string | null = null;

        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            // Only check top-level function declarations
            if (path.parent === ast.program && path.node.id) {
              const funcName = path.node.id.name;

              // Check if this looks like the main component function
              // (starts with capital letter and has the typical props parameter)
              if (/^[A-Z]/.test(funcName)) {
                foundMainFunction = true;
                actualFunctionName = funcName;

                // Check if the function name matches the spec name
                if (funcName !== expectedName) {
                  violations.push({
                    rule: 'component-name-mismatch',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component function name "${funcName}" does not match the spec name "${expectedName}". The function must be named exactly as specified in the component spec. Rename the function to: function ${expectedName}(...)`,
                    code: `function ${funcName}(...)`,
                  });
                }

                // Also check that the first letter case matches
                const expectedFirstChar = expectedName.charAt(0);
                const actualFirstChar = funcName.charAt(0);
                if (expectedFirstChar !== actualFirstChar && expectedName.toLowerCase() === funcName.toLowerCase()) {
                  violations.push({
                    rule: 'component-name-mismatch',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component function name "${funcName}" has incorrect capitalization. Expected "${expectedName}" (note the case of the first letter). The function name must match exactly, including capitalization: function ${expectedName}(...)`,
                    code: `function ${funcName}(...)`,
                  });
                }
              }
            }
          },
        });

        // If we didn't find a main function with the expected name
        if (!foundMainFunction && componentSpec?.name) {
          violations.push({
            rule: 'component-name-mismatch',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `No function declaration found with the expected name "${expectedName}". The main component function must be named exactly as specified in the spec. Add a function declaration: function ${expectedName}({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { ... }`,
          });
        }

        return violations;
      },
    },

    {
      name: 'dependency-shadowing',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Get all dependency component names
        const dependencyNames = new Set<string>();
        if (componentSpec?.dependencies) {
          for (const dep of componentSpec.dependencies) {
            if (dep.location === 'embedded' && dep.name) {
              dependencyNames.add(dep.name);
            }
          }
        }

        // If no dependencies, nothing to check
        if (dependencyNames.size === 0) {
          return violations;
        }

        // Find the main component function
        let mainComponentPath: NodePath<t.FunctionDeclaration> | null = null;

        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            // Check if this is the main component function
            if (path.parent === ast.program && path.node.id && path.node.id.name === componentName) {
              mainComponentPath = path;
              path.stop();
            }
          },
        });

        if (!mainComponentPath) {
          return violations;
        }

        // Now traverse inside the main component to find shadowing definitions
        (mainComponentPath as NodePath<t.FunctionDeclaration>).traverse({
          // Check for const/let/var ComponentName = ...
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id)) {
              const varName = path.node.id.name;

              // Check if this shadows a dependency
              if (dependencyNames.has(varName)) {
                // Check if it's a function (component)
                const init = path.node.init;
                if (init && (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init))) {
                  violations.push({
                    rule: 'dependency-shadowing',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component '${varName}' shadows a dependency component. The component '${varName}' should be accessed via destructuring from components prop or as components.${varName}, but this code is creating a new definition which overrides it.`,
                    code: `const ${varName} = ...`,
                  });
                }
              }
            }
          },

          // Check for function ComponentName() { ... }
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id) {
              const funcName = path.node.id.name;

              // Check if this shadows a dependency
              if (dependencyNames.has(funcName)) {
                violations.push({
                  rule: 'dependency-shadowing',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component '${funcName}' shadows a dependency component. The component '${funcName}' should be accessed via destructuring from components prop or as components.${funcName}, but this code is creating a new function which overrides it.`,
                  code: `function ${funcName}(...)`,
                });
              }
            }
          },
        });

        // Components must be destructured from the components prop or accessed via components.ComponentName
        // Check if they're being used correctly
        let hasComponentsUsage = false;
        const usedDependencies = new Set<string>();

        (mainComponentPath as NodePath<t.FunctionDeclaration>).traverse({
          // Look for direct usage of dependency components
          Identifier(path: NodePath<t.Identifier>) {
            const name = path.node.name;
            if (dependencyNames.has(name)) {
              // Check if this is actually being used (not just in a declaration)
              if (path.isBindingIdentifier()) {
                return;
              }
              usedDependencies.add(name);
              hasComponentsUsage = true;
            }
          },

          // Still support legacy components.ComponentName usage
          MemberExpression(path: NodePath<t.MemberExpression>) {
            if (t.isIdentifier(path.node.object) && path.node.object.name === 'components' && t.isIdentifier(path.node.property)) {
              const name = path.node.property.name;
              if (dependencyNames.has(name)) {
                usedDependencies.add(name);
                hasComponentsUsage = true;
              }
            }
          },

          // Also look in JSX elements
          JSXMemberExpression(path: NodePath<t.JSXMemberExpression>) {
            if (t.isJSXIdentifier(path.node.object) && path.node.object.name === 'components' && t.isJSXIdentifier(path.node.property)) {
              const name = path.node.property.name;
              if (dependencyNames.has(name)) {
                usedDependencies.add(name);
                hasComponentsUsage = true; // Mark as properly accessed
              }
            }
          },
        });

        // Check for unused dependencies - components must be destructured or accessed via components prop
        if (dependencyNames.size > 0 && usedDependencies.size === 0) {
          const depList = Array.from(dependencyNames).join(', ');
          violations.push({
            rule: 'dependency-shadowing',
            severity: 'low',
            line: (mainComponentPath as NodePath<t.FunctionDeclaration>).node.loc?.start.line || 0,
            column: (mainComponentPath as NodePath<t.FunctionDeclaration>).node.loc?.start.column || 0,
            message: `Component has dependencies [${depList}] defined in spec but they're not being used. These components must be destructured from the components prop or accessed as components.ComponentName to use them.`,
            code: `// Available: ${depList}`,
          });
        }

        return violations;
      },
    },

    {
      name: 'no-window-access',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Build a map of library names to their global variables from the component spec
        const libraryMap = new Map<string, string>();
        if (componentSpec?.libraries) {
          for (const lib of componentSpec.libraries) {
            // Skip empty library objects or those without required fields
            if (lib.globalVariable && lib.name) {
              // Store both the library name and globalVariable for lookup
              libraryMap.set(lib.name.toLowerCase(), lib.globalVariable);
              libraryMap.set(lib.globalVariable.toLowerCase(), lib.globalVariable);
            }
          }
        }

        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Check if accessing window object
            if (t.isIdentifier(path.node.object) && path.node.object.name === 'window') {
              // Check what property is being accessed from window
              let propertyName = '';
              let isDestructuring = false;

              if (t.isIdentifier(path.node.property)) {
                propertyName = path.node.property.name;
              } else if (t.isMemberExpression(path.node.property)) {
                // Handle chained access like window.Recharts.ResponsiveContainer
                const firstProp = path.node.property;
                if (t.isIdentifier(firstProp.object)) {
                  propertyName = firstProp.object.name;
                }
              }

              // Check if this is part of a destructuring assignment
              let currentPath: NodePath<t.Node> | null = path.parentPath;
              while (currentPath) {
                if (t.isVariableDeclarator(currentPath.node) && t.isObjectPattern(currentPath.node.id)) {
                  isDestructuring = true;
                  break;
                }
                currentPath = currentPath.parentPath;
              }

              // Check if the property matches a known library
              const matchedLibrary = libraryMap.get(propertyName.toLowerCase());

              // Allow export handler patterns: window.ComponentNameExport
              // These are intentional patterns for export functionality with proper cleanup
              const isExportPattern = propertyName.endsWith('Export') || propertyName.endsWith('Handler') || propertyName.endsWith('Callback');

              if (isExportPattern) {
                // Skip - this is an intentional pattern for component export functionality
                return;
              }

              if (matchedLibrary) {
                // Specific guidance for library access
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" should not access window.${propertyName}. Use "${matchedLibrary}" directly - it's already available in the component's closure scope. Change "window.${propertyName}" to just "${matchedLibrary}".`,
                  code: path.toString().substring(0, 100),
                });
              } else if (isDestructuring) {
                // Likely trying to destructure from an unknown library
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" is trying to access window.${propertyName}. Libraries must be accessed using unwrapComponents, not through the window object. If this library is in your spec, use: const { ... } = unwrapComponents(${propertyName}, [...]); If it's not in your spec, you cannot use it.`,
                  code: path.toString().substring(0, 100),
                });
              } else {
                // General window access
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" must not access the window object. Interactive components should be self-contained and not rely on global state.`,
                  code: path.toString().substring(0, 100),
                });
              }
            }
          },
          Identifier(path: NodePath<t.Identifier>) {
            // Also check for direct window references (less common but possible)
            if (path.node.name === 'window' && path.isReferencedIdentifier()) {
              // Make sure it's not part of a member expression we already caught
              const parent = path.parent;
              if (!t.isMemberExpression(parent) || parent.object !== path.node) {
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" must not reference the window object directly. Interactive components should be self-contained.`,
                  code: path.toString().substring(0, 100),
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'no-iife-wrapper',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Check if the entire code is wrapped in an IIFE
        if (ast.program && ast.program.body) {
          for (const statement of ast.program.body) {
            // Check for IIFE pattern: (function() { ... })() or (function() { ... }())
            if (t.isExpressionStatement(statement)) {
              const expr = statement.expression;

              // Pattern 1: (function() { ... })()
              if (t.isCallExpression(expr)) {
                const callee = expr.callee;

                // Check if calling a function expression wrapped in parentheses
                if (t.isParenthesizedExpression && t.isParenthesizedExpression(callee)) {
                  const inner = callee.expression;
                  if (t.isFunctionExpression(inner) || t.isArrowFunctionExpression(inner)) {
                    violations.push({
                      rule: 'no-iife-wrapper',
                      severity: 'critical',
                      line: statement.loc?.start.line || 0,
                      column: statement.loc?.start.column || 0,
                      message: `Component code must not be wrapped in an IIFE (Immediately Invoked Function Expression). Define the component function directly.`,
                      code: statement.toString().substring(0, 50) + '...',
                    });
                  }
                }

                // Also check without ParenthesizedExpression (some parsers handle it differently)
                if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                  violations.push({
                    rule: 'no-iife-wrapper',
                    severity: 'critical',
                    line: statement.loc?.start.line || 0,
                    column: statement.loc?.start.column || 0,
                    message: `Component code must not be wrapped in an IIFE. Define the component function directly.`,
                    code: statement.toString().substring(0, 50) + '...',
                  });
                }
              }

              // Pattern 2: (function() { ... }())
              if (t.isParenthesizedExpression && t.isParenthesizedExpression(expr)) {
                const inner = expr.expression;
                if (t.isCallExpression(inner)) {
                  const callee = inner.callee;
                  if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                    violations.push({
                      rule: 'no-iife-wrapper',
                      severity: 'critical',
                      line: statement.loc?.start.line || 0,
                      column: statement.loc?.start.column || 0,
                      message: `Component code must not be wrapped in an IIFE. Define the component function directly.`,
                      code: statement.toString().substring(0, 50) + '...',
                    });
                  }
                }
              }
            }

            // Also check for variable assignment with IIFE
            if (t.isVariableDeclaration(statement)) {
              for (const decl of statement.declarations) {
                if (decl.init && t.isCallExpression(decl.init)) {
                  const callee = decl.init.callee;
                  if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                    violations.push({
                      rule: 'no-iife-wrapper',
                      severity: 'critical',
                      line: decl.loc?.start.line || 0,
                      column: decl.loc?.start.column || 0,
                      message: `Do not use IIFE pattern for component initialization. Define components as plain functions.`,
                      code: decl.toString().substring(0, 50) + '...',
                    });
                  }
                }
              }
            }
          }
        }

        return violations;
      },
    },

    {
      name: 'no-use-reducer',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            if (
              (t.isIdentifier(callee) && callee.name === 'useReducer') ||
              (t.isMemberExpression(callee) &&
                t.isIdentifier(callee.object) &&
                callee.object.name === 'React' &&
                t.isIdentifier(callee.property) &&
                callee.property.name === 'useReducer')
            ) {
              violations.push({
                rule: 'no-use-reducer',
                severity: 'high', // High but not critical - it's a pattern violation
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component "${componentName}" uses useReducer at line ${path.node.loc?.start.line}. Components should manage state with useState and persist important settings with onSaveUserSettings.`,
                code: path.toString(),
              });
            }
          },
        });

        return violations;
      },
    },

    // New rules for the controlled component pattern
    {
      name: 'no-data-prop',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip this rule for chart/visualization components that legitimately need generic data props
        // These are reusable components designed to work with any entity type
        const isChartComponent =
          componentSpec?.type === 'chart' ||
          componentName.toLowerCase().includes('chart') ||
          componentName.toLowerCase().includes('graph') ||
          componentName.toLowerCase().includes('visualization') ||
          componentName.toLowerCase().includes('grid') ||
          componentName.toLowerCase().includes('table');

        if (isChartComponent) {
          return violations; // Skip - generic data prop is expected for chart components
        }

        traverse(ast, {
          // Check function parameters for 'data' prop
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'data') {
                    violations.push({
                      rule: 'no-data-prop',
                      severity: 'low', // Opinion-based style preference, not a functional issue
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                      code: 'data prop in component signature',
                    });
                  }
                }
              }
            }
          },

          // Also check arrow functions
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
              const init = path.node.init;
              if (t.isArrowFunctionExpression(init) && init.params[0]) {
                const param = init.params[0];
                if (t.isObjectPattern(param)) {
                  for (const prop of param.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'data') {
                      violations.push({
                        rule: 'no-data-prop',
                        severity: 'low', // Opinion-based style preference, not a functional issue
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                        code: 'data prop in component signature',
                      });
                    }
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'saved-user-settings-pattern',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Check for improper onSaveUserSettings usage
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for onSaveUserSettings calls
            if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'onSaveUserSettings') {
              // Check if saving ephemeral state
              if (path.node.arguments.length > 0) {
                const arg = path.node.arguments[0];
                if (t.isObjectExpression(arg)) {
                  for (const prop of arg.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const key = prop.key.name;
                      const ephemeralPatterns = ['hover', 'dropdown', 'modal', 'loading', 'typing', 'draft', 'expanded', 'collapsed', 'focused'];

                      if (ephemeralPatterns.some((pattern) => key.toLowerCase().includes(pattern))) {
                        violations.push({
                          rule: 'saved-user-settings-pattern',
                          severity: 'medium', // Pattern issue but not breaking
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message: `Saving ephemeral UI state "${key}" to savedUserSettings. Only save important user preferences.`,
                        });
                      }
                    }
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'use-unwrap-components',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Build a set of library global variables
        const libraryGlobals = new Set<string>();
        if (componentSpec?.libraries) {
          for (const lib of componentSpec.libraries) {
            if (lib.globalVariable) {
              libraryGlobals.add(lib.globalVariable);
            }
          }
        }

        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Check for direct destructuring from library globals
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              const sourceVar = path.node.init.name;

              // Check if this is destructuring from a library global
              if (libraryGlobals.has(sourceVar)) {
                // Extract the destructured component names
                const componentNames: string[] = [];
                for (const prop of path.node.id.properties) {
                  if (t.isObjectProperty(prop)) {
                    if (t.isIdentifier(prop.key)) {
                      componentNames.push(prop.key.name);
                    }
                  }
                }

                violations.push({
                  rule: 'use-unwrap-components',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Direct destructuring from library "${sourceVar}" is not allowed. You MUST use unwrapComponents to access library components. Replace "const { ${componentNames.join(', ')} } = ${sourceVar};" with "const { ${componentNames.join(', ')} } = unwrapComponents(${sourceVar}, [${componentNames.map((n) => `'${n}'`).join(', ')}]);"`,
                });
              }
            }

            // Also check for MemberExpression destructuring like const { Button } = antd.Button
            if (t.isObjectPattern(path.node.id) && t.isMemberExpression(path.node.init)) {
              const memberExpr = path.node.init;
              if (t.isIdentifier(memberExpr.object)) {
                const objName = memberExpr.object.name;
                if (libraryGlobals.has(objName)) {
                  violations.push({
                    rule: 'use-unwrap-components',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Direct destructuring from library member expression is not allowed. Use unwrapComponents to safely access library components. Example: Instead of "const { Something } = ${objName}.Something;", use "const { Something } = unwrapComponents(${objName}, ['Something']);"`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'library-variable-names',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Build a map of library names to their globalVariables
        const libraryGlobals = new Map<string, string>();
        if (componentSpec?.libraries) {
          for (const lib of componentSpec.libraries) {
            // Skip empty library objects or those without required fields
            if (lib.name && lib.globalVariable) {
              // Store both the exact name and lowercase for comparison
              libraryGlobals.set(lib.name.toLowerCase(), lib.globalVariable);
            }
          }
        }

        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Check for destructuring from a variable (library global)
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              const sourceVar = path.node.init.name;

              // Check if this looks like a library name (case-insensitive match)
              const matchedLib = Array.from(libraryGlobals.entries()).find(
                ([libName, globalVar]) => sourceVar.toLowerCase() === libName || sourceVar.toLowerCase() === globalVar.toLowerCase(),
              );

              if (matchedLib) {
                const [libName, correctGlobal] = matchedLib;
                if (sourceVar !== correctGlobal) {
                  violations.push({
                    rule: 'library-variable-names',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Incorrect library global variable "${sourceVar}". Use unwrapComponents with the correct global: "const { ... } = unwrapComponents(${correctGlobal}, [...]);"`,
                  });
                }
              }
            }

            // Check for self-assignment (const chroma = chroma)
            if (t.isIdentifier(path.node.id) && t.isIdentifier(path.node.init)) {
              const idName = path.node.id.name;
              const initName = path.node.init.name;

              if (idName === initName) {
                // Check if this is a library global
                const isLibraryGlobal = Array.from(libraryGlobals.values()).some((global) => global === idName);

                if (isLibraryGlobal) {
                  violations.push({
                    rule: 'library-variable-names',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Self-assignment of library global "${idName}". This variable is already available as a global from the library. Remove this line entirely - the library global is already accessible.`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'pass-standard-props',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const requiredProps = ['styles', 'utilities', 'components'];

        // ONLY check components that are explicitly in our dependencies
        // Do NOT check library components, HTML elements, or anything else
        const ourComponentNames = new Set<string>();

        // Only add components from the componentSpec.dependencies array
        if (componentSpec?.dependencies && Array.isArray(componentSpec.dependencies)) {
          for (const dep of componentSpec.dependencies) {
            if (dep && dep.name) {
              ourComponentNames.add(dep.name);
            }
          }
        }

        // If there are no dependencies, skip this rule entirely
        if (ourComponentNames.size === 0) {
          return violations;
        }

        // Now check only our dependency components for standard props
        traverse(ast, {
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;

            // Only check if it's one of our dependency components
            if (t.isJSXIdentifier(openingElement.name)) {
              const elementName = openingElement.name.name;

              // CRITICAL: Only check if this component is in our dependencies
              // Skip all library components (like TableHead, PieChart, etc.)
              // Skip all HTML elements
              if (!ourComponentNames.has(elementName)) {
                return; // Skip this element - it's not one of our dependencies
              }

              const passedProps = new Set<string>();

              // Collect all props being passed
              for (const attr of openingElement.attributes) {
                if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                  passedProps.add(attr.name.name);
                }
              }

              // Check if required props are missing
              const missingProps = requiredProps.filter((prop) => !passedProps.has(prop));

              if (missingProps.length > 0) {
                violations.push({
                  rule: 'pass-standard-props',
                  severity: 'critical',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `Dependency component "${elementName}" is missing required props: ${missingProps.join(', ')}. Components from dependencies must receive styles, utilities, and components props.`,
                  code: `<${elementName} ... />`,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'no-child-implementation',
      appliesTo: 'root',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const rootFunctionName = componentName;
        const declaredFunctions: string[] = [];

        // First pass: collect all function declarations
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id) {
              declaredFunctions.push(path.node.id.name);
            }
          },
        });

        // If there are multiple function declarations and they look like components
        // (start with capital letter), it's likely implementing children
        const componentFunctions = declaredFunctions.filter((name) => name !== rootFunctionName && /^[A-Z]/.test(name));

        if (componentFunctions.length > 0) {
          violations.push({
            rule: 'no-child-implementation',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `Root component file contains child component implementations: ${componentFunctions.join(', ')}. Root should only reference child components, not implement them.`,
          });
        }

        return violations;
      },
    },

    {
      name: 'undefined-component-usage',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const componentsFromProps = new Set<string>();
        const componentsUsedInJSX = new Set<string>();
        let hasComponentsProp = false;

        traverse(ast, {
          // First, find what's destructured from the components prop
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              // Check if destructuring from 'components'
              if (path.node.init.name === 'components') {
                hasComponentsProp = true;
                for (const prop of path.node.id.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    componentsFromProps.add(prop.key.name);
                  }
                }
              }
            }
          },

          // Also check object destructuring in function parameters
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components') {
                    hasComponentsProp = true;
                    // Look for nested destructuring like { components: { A, B } }
                    if (t.isObjectPattern(prop.value)) {
                      for (const innerProp of prop.value.properties) {
                        if (t.isObjectProperty(innerProp) && t.isIdentifier(innerProp.key)) {
                          componentsFromProps.add(innerProp.key.name);
                        }
                      }
                    }
                  }
                }
              }
            }
          },

          // Track JSX element usage
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;

            // Check for direct usage (e.g., <ComponentName>)
            if (t.isJSXIdentifier(openingElement.name) && /^[A-Z]/.test(openingElement.name.name)) {
              const componentName = openingElement.name.name;
              // Only track if it's from our destructured components
              if (componentsFromProps.has(componentName)) {
                componentsUsedInJSX.add(componentName);
              }
            }

            // Also check for components.X pattern (e.g., <components.ComponentName>)
            if (t.isJSXMemberExpression(openingElement.name)) {
              if (
                t.isJSXIdentifier(openingElement.name.object) &&
                openingElement.name.object.name === 'components' &&
                t.isJSXIdentifier(openingElement.name.property)
              ) {
                const componentName = openingElement.name.property.name;
                // Track usage of components accessed via dot notation
                if (componentsFromProps.has(componentName)) {
                  componentsUsedInJSX.add(componentName);
                }
              }
            }
          },
        });

        // Only check if we found a components prop
        if (hasComponentsProp && componentsFromProps.size > 0) {
          // Find components that are destructured but never used
          const unusedComponents = Array.from(componentsFromProps).filter((comp) => !componentsUsedInJSX.has(comp));

          if (unusedComponents.length > 0) {
            violations.push({
              rule: 'undefined-component-usage',
              severity: 'low',
              line: 1,
              column: 0,
              message: `Component destructures ${unusedComponents.join(', ')} from components prop but never uses them. These may be missing from the component spec's dependencies array.`,
            });
          }
        }

        return violations;
      },
    },

    {
      name: 'component-not-in-dependencies',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Get the list of available component names from dependencies
        const availableComponents = new Set<string>();
        if (componentSpec?.dependencies) {
          for (const dep of componentSpec.dependencies) {
            if (dep.name) {
              availableComponents.add(dep.name);
            }
          }
        }

        traverse(ast, {
          // Check for components.X usage in JSX
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;

            // Check for components.X pattern (e.g., <components.Loading>)
            if (t.isJSXMemberExpression(openingElement.name)) {
              if (
                t.isJSXIdentifier(openingElement.name.object) &&
                openingElement.name.object.name === 'components' &&
                t.isJSXIdentifier(openingElement.name.property)
              ) {
                const componentName = openingElement.name.property.name;

                // Check if this component is NOT in the dependencies
                if (!availableComponents.has(componentName)) {
                  violations.push({
                    rule: 'component-not-in-dependencies',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `Component "${componentName}" is used via components.${componentName} but is not defined in the component spec's dependencies array. This will cause a runtime error.`,
                    code: `<components.${componentName}>`,
                  });
                }
              }
            }
          },

          // Also check for components.X usage in JavaScript expressions
          MemberExpression(path: NodePath<t.MemberExpression>) {
            if (t.isIdentifier(path.node.object) && path.node.object.name === 'components' && t.isIdentifier(path.node.property)) {
              const componentName = path.node.property.name;

              // Skip if this is a method call like components.hasOwnProperty
              const parent = path.parent;
              if (t.isCallExpression(parent) && parent.callee === path.node) {
                // Check if it looks like a component (starts with uppercase)
                if (!/^[A-Z]/.test(componentName)) {
                  return; // Skip built-in methods
                }
              }

              // Check if this component is NOT in the dependencies
              if (/^[A-Z]/.test(componentName) && !availableComponents.has(componentName)) {
                violations.push({
                  rule: 'component-not-in-dependencies',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" is accessed via components.${componentName} but is not defined in the component spec's dependencies array. This will cause a runtime error.`,
                  code: `components.${componentName}`,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'property-name-consistency',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const dataTransformations = new Map<
          string,
          { originalProps: Set<string>; transformedProps: Set<string>; location: { line: number; column: number } }
        >();
        const propertyAccesses = new Map<string, Set<string>>(); // variable -> accessed properties

        // Track data transformations (especially in map functions)
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Look for array.map transformations
            if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'map') {
              const mapArg = path.node.arguments[0];
              if (mapArg && (t.isArrowFunctionExpression(mapArg) || t.isFunctionExpression(mapArg))) {
                const param = mapArg.params[0];
                if (t.isIdentifier(param)) {
                  const paramName = param.name;
                  const originalProps = new Set<string>();
                  const transformedProps = new Set<string>();

                  // Check the return value
                  let returnValue: t.Node | null = null;
                  if (t.isArrowFunctionExpression(mapArg)) {
                    if (t.isObjectExpression(mapArg.body)) {
                      returnValue = mapArg.body;
                    } else if (t.isBlockStatement(mapArg.body)) {
                      // Find return statement
                      for (const stmt of mapArg.body.body) {
                        if (t.isReturnStatement(stmt) && stmt.argument) {
                          returnValue = stmt.argument;
                          break;
                        }
                      }
                    }
                  }

                  // Analyze object mapping
                  if (returnValue && t.isObjectExpression(returnValue)) {
                    for (const prop of returnValue.properties) {
                      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                        transformedProps.add(prop.key.name);

                        // Check if value is a member expression from the parameter
                        if (
                          t.isMemberExpression(prop.value) &&
                          t.isIdentifier(prop.value.object) &&
                          prop.value.object.name === paramName &&
                          t.isIdentifier(prop.value.property)
                        ) {
                          originalProps.add(prop.value.property.name);
                        }
                      }
                    }
                  }

                  // Store the transformation if we found property mappings
                  if (transformedProps.size > 0) {
                    // Find the variable being assigned
                    let parentPath: NodePath | null = path.parentPath;
                    while (parentPath && !t.isVariableDeclarator(parentPath.node) && !t.isCallExpression(parentPath.node)) {
                      parentPath = parentPath.parentPath;
                    }

                    if (parentPath && t.isCallExpression(parentPath.node)) {
                      // Check for setState calls
                      if (t.isIdentifier(parentPath.node.callee) && /^set[A-Z]/.test(parentPath.node.callee.name)) {
                        const stateName = parentPath.node.callee.name.replace(/^set/, '');
                        const varName = stateName.charAt(0).toLowerCase() + stateName.slice(1);
                        dataTransformations.set(varName, {
                          originalProps,
                          transformedProps,
                          location: {
                            line: path.node.loc?.start.line || 0,
                            column: path.node.loc?.start.column || 0,
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          },

          // Track property accesses
          MemberExpression(path: NodePath<t.MemberExpression>) {
            if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
              const objName = path.node.object.name;
              const propName = path.node.property.name;

              if (!propertyAccesses.has(objName)) {
                propertyAccesses.set(objName, new Set());
              }
              propertyAccesses.get(objName)!.add(propName);
            }
          },
        });

        // Check for mismatches
        for (const [varName, transformation] of dataTransformations) {
          const accesses = propertyAccesses.get(varName);
          if (accesses) {
            for (const accessedProp of accesses) {
              // Check if accessed property exists in transformed props
              if (!transformation.transformedProps.has(accessedProp)) {
                // Check if it's trying to use original prop name
                const matchingOriginal = Array.from(transformation.originalProps).find((orig) => orig.toLowerCase() === accessedProp.toLowerCase());

                if (matchingOriginal) {
                  // Find the transformed name
                  const transformedName = Array.from(transformation.transformedProps).find((t) => t.toLowerCase() === accessedProp.toLowerCase());

                  violations.push({
                    rule: 'property-name-consistency',
                    severity: 'critical',
                    line: transformation.location.line,
                    column: transformation.location.column,
                    message: `Property name mismatch: data transformed with different casing. Accessing '${accessedProp}' but property was transformed to '${transformedName || 'different name'}'`,
                    code: `Transform uses '${Array.from(transformation.transformedProps).join(', ')}' but code accesses '${accessedProp}'`,
                  });
                }
              }
            }
          }
        }

        return violations;
      },
    },

    // New rules to align with AI linter
    {
      name: 'noisy-settings-updates',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for onSaveUserSettings calls
            if (t.isOptionalCallExpression(path.node) || t.isCallExpression(path.node)) {
              const callee = path.node.callee;
              if (t.isIdentifier(callee) && callee.name === 'onSaveUserSettings') {
                // Check if this is inside an onChange/onInput handler
                let parent = path.getFunctionParent();
                if (parent) {
                  const funcName = ComponentLinter.getFunctionName(parent);
                  if (funcName && (funcName.includes('Change') || funcName.includes('Input'))) {
                    // Check if it's not debounced or on blur
                    const parentBody = parent.node.body;
                    const hasDebounce = parentBody && parentBody.toString().includes('debounce');
                    const hasTimeout = parentBody && parentBody.toString().includes('setTimeout');

                    if (!hasDebounce && !hasTimeout) {
                      violations.push({
                        rule: 'noisy-settings-updates',
                        severity: 'critical',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `Saving settings on every change/keystroke. Save on blur, submit, or after debouncing.`,
                      });
                    }
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'prop-state-sync',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') {
              const effectBody = path.node.arguments[0];
              const deps = path.node.arguments[1];

              if (effectBody && (t.isArrowFunctionExpression(effectBody) || t.isFunctionExpression(effectBody))) {
                const bodyString = effectBody.body.toString();

                // Check if it's setting state based on props
                const hasSetState = /set[A-Z]\w*\s*\(/.test(bodyString);
                const depsString = deps ? deps.toString() : '';

                // Check if deps include prop-like names
                const propPatterns = ['Prop', 'value', 'data', 'items'];
                const hasPropDeps = propPatterns.some((p) => depsString.includes(p));

                if (hasSetState && hasPropDeps && !bodyString.includes('async')) {
                  violations.push({
                    rule: 'prop-state-sync',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Syncing props to internal state with useEffect creates dual state management',
                    code: path.toString().substring(0, 100),
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'react-hooks-rules',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect'];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isIdentifier(path.node.callee) && hooks.includes(path.node.callee.name)) {
              const hookName = path.node.callee.name;

              // Rule 1: Check if hook is inside the main component function or custom hook
              let funcParent = path.getFunctionParent();

              if (funcParent) {
                const funcName = ComponentLinter.getFunctionName(funcParent);

                // Violation: Hook not in component or custom hook
                if (funcName && funcName !== componentName && !funcName.startsWith('use')) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" cannot be called inside function "${funcName}". Hooks can only be called at the top level of React components or custom hooks.`,
                    code: path.toString().substring(0, 100),
                  });
                  return; // Skip further checks for this hook
                }
              }

              // Rule 2: Check if hook is inside a conditional (if statement)
              let parent: NodePath | null = path.parentPath;
              while (parent) {
                // Check if we've reached the component function - stop looking
                if (t.isFunctionDeclaration(parent.node) || t.isFunctionExpression(parent.node) || t.isArrowFunctionExpression(parent.node)) {
                  const parentFuncName = ComponentLinter.getFunctionName(parent as any);
                  if (parentFuncName === componentName || parentFuncName?.startsWith('use')) {
                    break; // We've reached the component/hook boundary
                  }
                }

                // Check for conditional statements
                if (t.isIfStatement(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" is called conditionally. Hooks must be called in the exact same order in every component render.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Check for ternary expressions
                if (t.isConditionalExpression(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" is called conditionally in a ternary expression. Hooks must be called unconditionally.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Check for logical expressions (&&, ||)
                if (t.isLogicalExpression(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" is called conditionally in a logical expression. Hooks must be called unconditionally.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Check for switch statements
                if (t.isSwitchStatement(parent.node) || t.isSwitchCase(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" is called inside a switch statement. Hooks must be called at the top level.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Rule 3: Check for loops
                if (
                  t.isForStatement(parent.node) ||
                  t.isForInStatement(parent.node) ||
                  t.isForOfStatement(parent.node) ||
                  t.isWhileStatement(parent.node) ||
                  t.isDoWhileStatement(parent.node)
                ) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" may not be called inside a loop. This can lead to hooks being called in different order between renders.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Rule 4: Check for try/catch blocks
                if (t.isTryStatement(parent.node) || t.isCatchClause(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'high', // Less severe as it might be intentional
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" is called inside a try/catch block. While not strictly forbidden, this can lead to issues if the hook throws.`,
                    code: path.toString().substring(0, 100),
                  });
                  break;
                }

                // Rule 5: Check for early returns before this hook
                // This is complex and would need to track control flow, so we'll do a simpler check
                if (t.isBlockStatement(parent.node)) {
                  const statements = parent.node.body;

                  // Find the statement that contains this hook by walking up the path
                  let statementNode: NodePath | null = path.parentPath;
                  while (statementNode && !statements.includes(statementNode.node as t.Statement)) {
                    statementNode = statementNode.parentPath;
                  }

                  if (statementNode) {
                    const hookIndex = statements.indexOf(statementNode.node as t.Statement);

                    // Check if there's a return statement before this hook
                    for (let i = 0; i < hookIndex; i++) {
                      const stmt = statements[i];
                      if (t.isReturnStatement(stmt)) {
                        violations.push({
                          rule: 'react-hooks-rules',
                          severity: 'critical',
                          line: path.node.loc?.start.line || 0,
                          column: path.node.loc?.start.column || 0,
                          message: `React Hook "${hookName}" is called after a conditional early return. All hooks must be called before any conditional returns.`,
                          code: path.toString().substring(0, 100),
                        });
                        break;
                      }

                      // Check for conditional returns
                      // NOTE: This check is too aggressive and produces false positives
                      // It triggers when ANY if statement exists before hooks, even if the early return
                      // is in the render section (after hooks) or in nested callbacks
                      // TODO: Improve this to only catch actual violations where hooks come after conditional returns
                      // if (t.isIfStatement(stmt) && ComponentLinter.containsReturn(stmt)) {
                      //   violations.push({
                      //     rule: 'react-hooks-rules',
                      //     severity: 'critical',
                      //     line: path.node.loc?.start.line || 0,
                      //     column: path.node.loc?.start.column || 0,
                      //     message: `React Hook "${hookName}" is called after a possible early return. Move this hook before any conditional logic.`,
                      //     code: path.toString().substring(0, 100),
                      //   });
                      //   break;
                      // }
                    }
                  }
                }

                parent = parent.parentPath;
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'useeffect-unstable-dependencies',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Known prop names that are always objects/functions and unstable
        const unstablePropNames = new Set([
          'utilities',
          'components',
          'callbacks',
          'styles',
          'savedUserSettings', // Can be unstable if not memoized by parent
        ]);

        // Helper to find the component function and extract parameters with object defaults
        const findComponentParams = (useEffectPath: NodePath<t.CallExpression>): Map<string, t.ObjectExpression | t.ArrayExpression> => {
          const paramsWithObjectDefaults = new Map<string, t.ObjectExpression | t.ArrayExpression>();

          let current: NodePath | null = useEffectPath.parentPath;
          while (current) {
            // Look for FunctionDeclaration or ArrowFunctionExpression/FunctionExpression
            if (
              t.isFunctionDeclaration(current.node) ||
              t.isArrowFunctionExpression(current.node) ||
              t.isFunctionExpression(current.node)
            ) {
              const func = current.node as t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression;

              // Check if this looks like a component (starts with uppercase)
              let isComponent = false;
              if (t.isFunctionDeclaration(func) && func.id && /^[A-Z]/.test(func.id.name)) {
                isComponent = true;
              }

              // For arrow functions, check the variable declarator name
              if ((t.isArrowFunctionExpression(func) || t.isFunctionExpression(func)) && current.parentPath) {
                const parent = current.parentPath.node;
                if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && /^[A-Z]/.test(parent.id.name)) {
                  isComponent = true;
                }
              }

              if (isComponent) {
                // Extract parameters with object literal defaults
                for (const param of func.params) {
                  // Case 1: ObjectPattern (destructured props): { foo = {}, bar = [] }
                  if (t.isObjectPattern(param)) {
                    for (const prop of param.properties) {
                      if (t.isObjectProperty(prop)) {
                        const value = prop.value;
                        // Check if this destructured property has a default: queryParameters = {}
                        if (t.isAssignmentPattern(value) && t.isIdentifier(value.left)) {
                          const defaultVal = value.right;
                          if (t.isObjectExpression(defaultVal) || t.isArrayExpression(defaultVal)) {
                            paramsWithObjectDefaults.set(value.left.name, defaultVal);
                          }
                        }
                      }
                    }
                  }
                  // Case 2: AssignmentPattern (param with default): queryParameters = {}
                  else if (t.isAssignmentPattern(param)) {
                    const left = param.left;
                    const right = param.right;

                    // Simple param with object default: queryParameters = {}
                    if (t.isIdentifier(left) && (t.isObjectExpression(right) || t.isArrayExpression(right))) {
                      paramsWithObjectDefaults.set(left.name, right);
                    }
                    // ObjectPattern with object default: { foo, bar } = {}
                    else if (t.isObjectPattern(left) && (t.isObjectExpression(right) || t.isArrayExpression(right))) {
                      // The whole destructured object gets a default - mark all properties
                      for (const prop of left.properties) {
                        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                          paramsWithObjectDefaults.set(prop.key.name, right);
                        }
                      }
                    }
                  }
                }
                break; // Found the component, stop traversing up
              }
            }
            current = current.parentPath;
          }

          return paramsWithObjectDefaults;
        };

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for useEffect calls
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') {
              // Get the dependency array (second argument)
              const depsArg = path.node.arguments[1];

              if (!depsArg || !t.isArrayExpression(depsArg)) {
                return; // No deps array or empty deps []
              }

              // Find component parameters with object defaults
              const paramsWithObjectDefaults = findComponentParams(path);

              // Check each dependency
              for (const dep of depsArg.elements) {
                if (!dep) continue;

                let unstableDep: string | null = null;
                let severity: 'critical' | 'high' = 'high';
                let message = '';
                let suggestionText = '';

                // Case 1: Member expression (utilities.rq.RunQuery, callbacks?.onSelect)
                if (t.isMemberExpression(dep) || t.isOptionalMemberExpression(dep)) {
                  const memberExpr = dep as t.MemberExpression;

                  // Get the root object (e.g., 'utilities' from 'utilities.rq.RunQuery')
                  let rootObj: t.Expression = memberExpr.object;
                  while ((t.isMemberExpression(rootObj) || t.isOptionalMemberExpression(rootObj)) && 'object' in rootObj) {
                    rootObj = rootObj.object;
                  }

                  if (t.isIdentifier(rootObj) && unstablePropNames.has(rootObj.name)) {
                    unstableDep = `${rootObj.name}.${t.isIdentifier(memberExpr.property) ? memberExpr.property.name : '...'}`;
                    severity = 'high';
                    message = `useEffect has unstable dependency '${unstableDep}' that may cause infinite render loops. Object/function references from props typically change on every render. This works if the parent provides stable references (via useMemo), but is fragile and should be avoided.`;
                    suggestionText = `Remove '${unstableDep}' from dependency array. These utilities/services are typically stable and don't need to be tracked.`;
                  }
                }
                // Case 2: Direct identifier (utilities, components, etc.)
                else if (t.isIdentifier(dep)) {
                  // Check if it's a known unstable prop name
                  if (unstablePropNames.has(dep.name)) {
                    unstableDep = dep.name;
                    severity = 'high';
                    message = `useEffect has unstable dependency '${unstableDep}' that may cause infinite render loops. Object/function references from props typically change on every render. This works if the parent provides stable references (via useMemo), but is fragile and should be avoided.`;
                    suggestionText = `Remove '${unstableDep}' from dependency array. These utilities/services are typically stable and don't need to be tracked.`;
                  }
                  // Check if it's a param with object literal default
                  else if (paramsWithObjectDefaults.has(dep.name)) {
                    unstableDep = dep.name;
                    severity = 'critical';
                    const defaultValue = paramsWithObjectDefaults.get(dep.name);
                    const defaultStr = t.isObjectExpression(defaultValue) ? '{}' : '[]';
                    message = `useEffect has CRITICAL unstable dependency '${unstableDep}' with object literal default (${dep.name} = ${defaultStr}). This creates a NEW object on EVERY render, causing infinite loops. This is ALWAYS broken.`;
                    suggestionText = `Remove '${unstableDep}' from dependency array. Props with object literal defaults (${dep.name} = ${defaultStr}) create new references every render.`;
                  }
                }

                // Report violation if we found an unstable dependency
                if (unstableDep) {
                  let fixedDeps = depsArg.elements
                    .filter((e) => e !== dep)
                    .map((e) => {
                      if (!e) return '';
                      if (t.isIdentifier(e)) return e.name;
                      if (t.isMemberExpression(e) || t.isOptionalMemberExpression(e)) {
                        // Try to extract the full path
                        const parts: string[] = [];
                        let current: t.Expression | t.PrivateName = e;
                        while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
                          if ('property' in current && t.isIdentifier(current.property)) {
                            parts.unshift(current.property.name);
                          }
                          if ('object' in current) {
                            current = current.object;
                          } else {
                            break;
                          }
                        }
                        if (t.isIdentifier(current)) {
                          parts.unshift(current.name);
                        }
                        return parts.join('.');
                      }
                      return '...';
                    })
                    .filter(Boolean);

                  violations.push({
                    rule: 'useeffect-unstable-dependencies',
                    severity: severity,
                    line: dep.loc?.start.line || path.node.loc?.start.line || 0,
                    column: dep.loc?.start.column || path.node.loc?.start.column || 0,
                    message: message,
                    code: `}, [${fixedDeps.join(', ')}${fixedDeps.length > 0 ? ', ' : ''}${unstableDep}]);  // ${severity === 'critical' ? '🚨' : '⚠️'} Remove '${unstableDep}'`,
                    suggestion: {
                      text: suggestionText,
                      example: fixedDeps.length > 0
                        ? `}, [${fixedDeps.join(', ')}]);  // ✅ Removed unstable '${unstableDep}'`
                        : `}, []);  // ✅ Run once on mount - dependencies are stable`
                    }
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'server-reload-on-client-operation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Look for data loading functions
            if (t.isIdentifier(callee) && (callee.name.includes('load') || callee.name.includes('fetch'))) {
              // Check if it's called in sort/filter handlers
              let funcParent = path.getFunctionParent();
              if (funcParent) {
                const funcName = ComponentLinter.getFunctionName(funcParent);
                if (
                  funcName &&
                  (funcName.includes('Sort') || funcName.includes('Filter') || funcName.includes('handleSort') || funcName.includes('handleFilter'))
                ) {
                  violations.push({
                    rule: 'server-reload-on-client-operation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Reloading data from server on sort/filter. Use useMemo for client-side operations.',
                    code: `${funcName} calls ${callee.name}`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'runview-runquery-valid-properties',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Valid properties for RunView/RunViews
        const validRunViewProps = new Set(['EntityName', 'ExtraFilter', 'OrderBy', 'Fields', 'MaxRows', 'StartRow', 'ResultType']);

        // Valid properties for RunQuery
        const validRunQueryProps = new Set([
          'QueryID',
          'QueryName',
          'CategoryID',
          'CategoryPath',
          'Parameters',
          'MaxRows',
          'StartRow',
          'ForceAuditLog',
          'AuditLogDescription',
        ]);

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for utilities.rv.RunView or utilities.rv.RunViews
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rv' &&
              t.isIdentifier(callee.property)
            ) {
              const methodName = callee.property.name;

              if (methodName === 'RunView' || methodName === 'RunViews') {
                // Check that first parameter exists
                if (!path.node.arguments[0]) {
                  violations.push({
                    rule: 'runview-runquery-valid-properties',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `${methodName} requires a ${methodName === 'RunViews' ? 'array of RunViewParams objects' : 'RunViewParams object'} as the first parameter.`,
                    code: `${methodName}()`,
                  });
                  return;
                }

                // Get the config object(s)
                let configs: t.ObjectExpression[] = [];
                let hasValidFirstParam = false;

                if (methodName === 'RunViews') {
                  // RunViews takes an array of configs
                  if (t.isArrayExpression(path.node.arguments[0])) {
                    hasValidFirstParam = true;
                    configs = path.node.arguments[0].elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
                  } else {
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: path.node.arguments[0].loc?.start.line || 0,
                      column: path.node.arguments[0].loc?.start.column || 0,
                      message: `RunViews expects an array of RunViewParams objects, not a ${t.isObjectExpression(path.node.arguments[0]) ? 'single object' : 'non-array'}.
Use: RunViews([
  { 
    EntityName: 'Entity1',
    ExtraFilter: 'IsActive = 1',
    Fields: 'ID, Name',
    StartRow: 0,
    MaxRows: 50
  },
  { 
    EntityName: 'Entity2',
    OrderBy: 'CreatedAt DESC',
    StartRow: 0,
    MaxRows: 100
  }
])
Each object supports: EntityName, ExtraFilter, Fields, OrderBy, MaxRows, StartRow, ResultType`,
                      code: path.toString().substring(0, 100),
                    });
                  }
                } else if (methodName === 'RunView') {
                  // RunView takes a single config
                  if (t.isObjectExpression(path.node.arguments[0])) {
                    hasValidFirstParam = true;
                    configs = [path.node.arguments[0]];
                  } else {
                    const argType = t.isStringLiteral(path.node.arguments[0])
                      ? 'string'
                      : t.isArrayExpression(path.node.arguments[0])
                        ? 'array'
                        : t.isIdentifier(path.node.arguments[0])
                          ? 'identifier'
                          : 'non-object';
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: path.node.arguments[0].loc?.start.line || 0,
                      column: path.node.arguments[0].loc?.start.column || 0,
                      message: `RunView expects a RunViewParams object, not ${argType === 'array' ? 'an' : 'a'} ${argType}.
Use: RunView({ 
  EntityName: 'YourEntity',
  ExtraFilter: 'Status = "Active"',  // Optional WHERE clause
  Fields: 'ID, Name, Status',        // Optional columns to return
  OrderBy: 'Name ASC',                // Optional sort
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})
Valid properties: EntityName, ExtraFilter, Fields, OrderBy, MaxRows, StartRow, ResultType`,
                      code: path.toString().substring(0, 100),
                    });
                  }
                }

                if (!hasValidFirstParam) {
                  return;
                }

                // Check each config for invalid properties and required fields
                for (const config of configs) {
                  // Check for required properties (must have EntityName)
                  let hasEntityName = false;

                  for (const prop of config.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name;

                      if (propName === 'EntityName') hasEntityName = true;

                      if (!validRunViewProps.has(propName)) {
                        // Special error messages for common mistakes
                        let message = `Invalid property '${propName}' on ${methodName}. Valid properties: ${Array.from(validRunViewProps).join(', ')}`;
                        let fix = `Remove '${propName}' property`;

                        if (propName === 'Parameters') {
                          message = `${methodName} does not support 'Parameters'. Use 'ExtraFilter' for WHERE clauses.`;
                          fix = `Replace 'Parameters' with 'ExtraFilter' and format as SQL WHERE clause`;
                        } else if (propName === 'ViewID' || propName === 'ViewName') {
                          message = `${methodName} property '${propName}' is not allowed in components. Use 'EntityName' instead.`;
                          fix = `Replace '${propName}' with 'EntityName' and specify the entity name`;
                        } else if (propName === 'UserSearchString') {
                          message = `${methodName} property 'UserSearchString' is not allowed in components. Use 'ExtraFilter' for filtering.`;
                          fix = `Remove 'UserSearchString' and use 'ExtraFilter' with appropriate WHERE clause`;
                        } else if (propName === 'ForceAuditLog' || propName === 'AuditLogDescription') {
                          message = `${methodName} property '${propName}' is not allowed in components.`;
                          fix = `Remove '${propName}' property`;
                        } else if (propName === 'GroupBy') {
                          message = `${methodName} does not support 'GroupBy'. Use RunQuery with a pre-defined query for aggregations.`;
                          fix = `Remove 'GroupBy' and use RunQuery instead for aggregated data`;
                        } else if (propName === 'Having') {
                          message = `${methodName} does not support 'Having'. Use RunQuery with a pre-defined query.`;
                          fix = `Remove 'Having' and use RunQuery instead`;
                        }

                        violations.push({
                          rule: 'runview-runquery-valid-properties',
                          severity: 'critical',
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message,
                          code: `${propName}: ...`,
                        });
                      } else {
                        // Property name is valid, now check its type
                        const value = prop.value;

                        // Helper to check if a node is null or undefined
                        const isNullOrUndefined = (node: t.Node): boolean => {
                          return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined');
                        };

                        // Helper to check if a node could evaluate to a string
                        const isStringLike = (node: t.Node, depth: number = 0): boolean => {
                          // Prevent infinite recursion
                          if (depth > 3) return false;

                          // Special handling for ternary operators - check both branches
                          if (t.isConditionalExpression(node)) {
                            const consequentOk = isStringLike(node.consequent, depth + 1) || isNullOrUndefined(node.consequent);
                            const alternateOk = isStringLike(node.alternate, depth + 1) || isNullOrUndefined(node.alternate);
                            return consequentOk && alternateOk;
                          }

                          // Explicitly reject object and array expressions
                          if (t.isObjectExpression(node) || t.isArrayExpression(node)) {
                            return false;
                          }

                          return (
                            t.isStringLiteral(node) ||
                            t.isTemplateLiteral(node) ||
                            t.isBinaryExpression(node) || // String concatenation
                            t.isIdentifier(node) || // Variable
                            t.isCallExpression(node) || // Function call
                            t.isMemberExpression(node)
                          ); // Property access
                        };

                        // Helper to check if a node could evaluate to a number
                        const isNumberLike = (node: t.Node): boolean => {
                          return (
                            t.isNumericLiteral(node) ||
                            t.isBinaryExpression(node) || // Math operations
                            t.isUnaryExpression(node) || // Negative numbers, etc
                            t.isConditionalExpression(node) || // Ternary
                            t.isIdentifier(node) || // Variable
                            t.isCallExpression(node) || // Function call
                            t.isMemberExpression(node)
                          ); // Property access
                        };

                        // Helper to check if a node is array-like
                        const isArrayLike = (node: t.Node): boolean => {
                          return (
                            t.isArrayExpression(node) ||
                            t.isIdentifier(node) || // Variable
                            t.isCallExpression(node) || // Function returning array
                            t.isMemberExpression(node) || // Property access
                            t.isConditionalExpression(node)
                          ); // Ternary
                        };

                        // Helper to check if a node is object-like (but not array)
                        const isObjectLike = (node: t.Node): boolean => {
                          if (t.isArrayExpression(node)) return false;
                          return (
                            t.isObjectExpression(node) ||
                            t.isIdentifier(node) || // Variable
                            t.isCallExpression(node) || // Function returning object
                            t.isMemberExpression(node) || // Property access
                            t.isConditionalExpression(node) || // Ternary
                            t.isSpreadElement(node)
                          ); // Spread syntax (though this is the problem case)
                        };

                        // Validate types based on property name
                        if (propName === 'ExtraFilter' || propName === 'OrderBy' || propName === 'EntityName') {
                          // These must be strings (ExtraFilter and OrderBy can also be null/undefined)
                          const allowNullUndefined = propName === 'ExtraFilter' || propName === 'OrderBy';
                          if (!isStringLike(value) && !(allowNullUndefined && isNullOrUndefined(value))) {
                            let exampleValue = '';
                            if (propName === 'ExtraFilter') {
                              exampleValue = `"Status = 'Active' AND Type = 'Customer'"`;
                            } else if (propName === 'OrderBy') {
                              exampleValue = `"CreatedAt DESC"`;
                            } else if (propName === 'EntityName') {
                              exampleValue = `"Products"`;
                            }

                            violations.push({
                              rule: 'runview-runquery-valid-properties',
                              severity: 'critical',
                              line: prop.loc?.start.line || 0,
                              column: prop.loc?.start.column || 0,
                              message: `${methodName} property '${propName}' must be a string, not ${t.isObjectExpression(value) ? 'an object' : t.isArrayExpression(value) ? 'an array' : 'a non-string value'}. Example: ${propName}: ${exampleValue}`,
                              code: `${propName}: ${prop.value.type === 'ObjectExpression' ? '{...}' : prop.value.type === 'ArrayExpression' ? '[...]' : '...'}`,
                            });
                          }
                        } else if (propName === 'Fields') {
                          // Fields must be an array of strings (or a string that we'll interpret as comma-separated)
                          if (!isArrayLike(value) && !isStringLike(value)) {
                            violations.push({
                              rule: 'runview-runquery-valid-properties',
                              severity: 'critical',
                              line: prop.loc?.start.line || 0,
                              column: prop.loc?.start.column || 0,
                              message: `${methodName} property 'Fields' must be an array of field names or a comma-separated string. Example: Fields: ['ID', 'Name', 'Status'] or Fields: 'ID, Name, Status'`,
                              code: `Fields: ${prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                            });
                          }
                        } else if (propName === 'MaxRows' || propName === 'StartRow') {
                          // These must be numbers
                          if (!isNumberLike(value)) {
                            violations.push({
                              rule: 'runview-runquery-valid-properties',
                              severity: 'critical',
                              line: prop.loc?.start.line || 0,
                              column: prop.loc?.start.column || 0,
                              message: `${methodName} property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
                              code: `${propName}: ${prop.value.type === 'StringLiteral' ? '"..."' : prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                            });
                          }
                        }
                      }
                    }
                  }

                  // Check that EntityName is present (required property)
                  if (!hasEntityName) {
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: config.loc?.start.line || 0,
                      column: config.loc?.start.column || 0,
                      message: `${methodName} requires 'EntityName' property. Add EntityName to identify what data to retrieve.`,
                      code: `${methodName}({ ... })`,
                    });
                  }
                }
              }
            }

            // Check for utilities.rq.RunQuery
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rq' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'RunQuery'
            ) {
              // Check that first parameter exists and is an object
              if (!path.node.arguments[0]) {
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `RunQuery requires a RunQueryParams object as the first parameter.
Use: RunQuery({ 
  QueryName: 'YourQuery',             // Or use QueryID: 'uuid'
  CategoryPath: 'Category/Subcategory', // Optional. Used when QueryName is provided to provide a better filter
  Parameters: {                       // Optional query parameters
    param1: 'value1'
  },
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})`,
                  code: `RunQuery()`,
                });
              } else if (!t.isObjectExpression(path.node.arguments[0])) {
                // First parameter is not an object
                const argType = t.isStringLiteral(path.node.arguments[0]) ? 'string' : t.isIdentifier(path.node.arguments[0]) ? 'identifier' : 'non-object';
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.arguments[0].loc?.start.line || 0,
                  column: path.node.arguments[0].loc?.start.column || 0,
                  message: `RunQuery expects a RunQueryParams object, not a ${argType}.
Use: RunQuery({ 
  QueryName: 'YourQuery',             // Or use QueryID: 'uuid'
  CategoryPath: 'Category/Subcategory', // Optional. Used when QueryName is provided to provide a better filter
  Parameters: {                       // Optional query parameters
    startDate: '2024-01-01',
    endDate: '2024-12-31'
  },
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})
Valid properties: QueryID, QueryName, CategoryID, CategoryPath, Parameters, MaxRows, StartRow, ForceAuditLog, AuditLogDescription`,
                  code: path.toString().substring(0, 100),
                });
              } else {
                const config = path.node.arguments[0];

                // Check for required properties (must have QueryID or QueryName)
                let hasQueryID = false;
                let hasQueryName = false;
                let hasCategoryPath = false;
                const foundProps: string[] = [];

                for (const prop of config.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    foundProps.push(propName);

                    if (propName === 'QueryID') hasQueryID = true;
                    if (propName === 'QueryName') hasQueryName = true;
                    if (propName === 'CategoryPath') hasCategoryPath = true;

                    if (!validRunQueryProps.has(propName)) {
                      let message = `Invalid property '${propName}' on RunQuery. Valid properties: ${Array.from(validRunQueryProps).join(', ')}`;
                      let fix = `Remove '${propName}' property`;

                      if (propName === 'ExtraFilter') {
                        message = `RunQuery does not support 'ExtraFilter'. WHERE clauses should be in the pre-defined query or passed as Parameters.`;
                        fix = `Remove 'ExtraFilter'. Add WHERE logic to the query definition or pass as Parameters`;
                      } else if (propName === 'Fields') {
                        message = `RunQuery does not support 'Fields'. The query definition determines returned fields.`;
                        fix = `Remove 'Fields'. Modify the query definition to return desired fields`;
                      } else if (propName === 'OrderBy') {
                        message = `RunQuery does not support 'OrderBy'. ORDER BY should be in the query definition.`;
                        fix = `Remove 'OrderBy'. Add ORDER BY to the query definition`;
                      }

                      violations.push({
                        rule: 'runview-runquery-valid-properties',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message,
                        code: `${propName}: ...`,
                      });
                    } else {
                      // Property name is valid, now check its type
                      const value = prop.value;

                      // Helper to check if a node is null or undefined
                      const isNullOrUndefined = (node: t.Node): boolean => {
                        return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined');
                      };

                      // Helper to check if a node could evaluate to a string
                      const isStringLike = (node: t.Node, depth: number = 0): boolean => {
                        // Prevent infinite recursion
                        if (depth > 3) return false;

                        // Special handling for ternary operators - check both branches
                        if (t.isConditionalExpression(node)) {
                          const consequentOk = isStringLike(node.consequent, depth + 1) || isNullOrUndefined(node.consequent);
                          const alternateOk = isStringLike(node.alternate, depth + 1) || isNullOrUndefined(node.alternate);
                          return consequentOk && alternateOk;
                        }

                        // Explicitly reject object and array expressions
                        if (t.isObjectExpression(node) || t.isArrayExpression(node)) {
                          return false;
                        }

                        return (
                          t.isStringLiteral(node) ||
                          t.isTemplateLiteral(node) ||
                          t.isBinaryExpression(node) || // String concatenation
                          t.isIdentifier(node) || // Variable
                          t.isCallExpression(node) || // Function call
                          t.isMemberExpression(node)
                        ); // Property access
                      };

                      // Helper to check if a node could evaluate to a number
                      const isNumberLike = (node: t.Node): boolean => {
                        return (
                          t.isNumericLiteral(node) ||
                          t.isBinaryExpression(node) || // Math operations
                          t.isUnaryExpression(node) || // Negative numbers, etc
                          t.isConditionalExpression(node) || // Ternary
                          t.isIdentifier(node) || // Variable
                          t.isCallExpression(node) || // Function call
                          t.isMemberExpression(node)
                        ); // Property access
                      };

                      // Helper to check if a node is object-like (but not array)
                      const isObjectLike = (node: t.Node): boolean => {
                        if (t.isArrayExpression(node)) return false;
                        return (
                          t.isObjectExpression(node) ||
                          t.isIdentifier(node) || // Variable
                          t.isCallExpression(node) || // Function returning object
                          t.isMemberExpression(node) || // Property access
                          t.isConditionalExpression(node) || // Ternary
                          t.isSpreadElement(node)
                        ); // Spread syntax
                      };

                      // Validate types based on property name
                      if (propName === 'QueryID' || propName === 'QueryName' || propName === 'CategoryID' || propName === 'CategoryPath') {
                        // These must be strings
                        if (!isStringLike(value)) {
                          let exampleValue = '';
                          if (propName === 'QueryID') {
                            exampleValue = `"550e8400-e29b-41d4-a716-446655440000"`;
                          } else if (propName === 'QueryName') {
                            exampleValue = `"Sales by Region"`;
                          } else if (propName === 'CategoryID') {
                            exampleValue = `"123e4567-e89b-12d3-a456-426614174000"`;
                          } else if (propName === 'CategoryPath') {
                            exampleValue = `"/Reports/Sales/"`;
                          }

                          violations.push({
                            rule: 'runview-runquery-valid-properties',
                            severity: 'critical',
                            line: prop.loc?.start.line || 0,
                            column: prop.loc?.start.column || 0,
                            message: `RunQuery property '${propName}' must be a string. Example: ${propName}: ${exampleValue}`,
                            code: `${propName}: ${prop.value.type === 'ObjectExpression' ? '{...}' : prop.value.type === 'ArrayExpression' ? '[...]' : '...'}`,
                          });
                        }
                      } else if (propName === 'Parameters') {
                        // Parameters must be an object (Record<string, any>)
                        if (!isObjectLike(value)) {
                          violations.push({
                            rule: 'runview-runquery-valid-properties',
                            severity: 'critical',
                            line: prop.loc?.start.line || 0,
                            column: prop.loc?.start.column || 0,
                            message: `RunQuery property 'Parameters' must be an object containing key-value pairs. Example: Parameters: { startDate: '2024-01-01', status: 'Active' }`,
                            code: `Parameters: ${t.isArrayExpression(value) ? '[...]' : t.isStringLiteral(value) ? '"..."' : '...'}`,
                          });
                        }
                      } else if (propName === 'MaxRows' || propName === 'StartRow') {
                        // These must be numbers
                        if (!isNumberLike(value)) {
                          violations.push({
                            rule: 'runview-runquery-valid-properties',
                            severity: 'critical',
                            line: prop.loc?.start.line || 0,
                            column: prop.loc?.start.column || 0,
                            message: `RunQuery property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
                            code: `${propName}: ${prop.value.type === 'StringLiteral' ? '"..."' : prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                          });
                        }
                      }
                    }
                  }
                }

                // Check that at least one required property is present
                if (!hasQueryID && !hasQueryName) {
                  // Build helpful context about what properties were found
                  const propsContext = foundProps.length > 0 ? ` Found properties: ${foundProps.join(', ')}.` : '';

                  // Special message if CategoryPath was provided without QueryName
                  const message = hasCategoryPath
                    ? `RunQuery requires QueryName (or QueryID). CategoryPath alone is insufficient - it's only used to help filter when QueryName is ambiguous.${propsContext}`
                    : `RunQuery requires either QueryID or QueryName property to identify which query to run.${propsContext}`;

                  // Suggest QueryName from spec if available
                  const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';

                  violations.push({
                    rule: 'runview-runquery-valid-properties',
                    severity: 'critical',
                    line: config.loc?.start.line || 0,
                    column: config.loc?.start.column || 0,
                    message,
                    code: `RunQuery({ QueryName: '${exampleQueryName}', ... })`,
                    suggestion: {
                      text: 'Add QueryName property to identify the query',
                      example: `await utilities.rq.RunQuery({\n  QueryName: '${exampleQueryName}',${hasCategoryPath ? "\n  CategoryPath: '...',  // Optional, helps disambiguate" : ''}\n  Parameters: { ... }  // Optional query parameters\n})`,
                    },
                  });
                }

                // Special check for CategoryPath-only calls (common Skip generation issue)
                // This provides a more targeted error for this specific anti-pattern
                if (!hasQueryID && !hasQueryName && hasCategoryPath) {
                  const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';
                  const categoryPathProp = config.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'CategoryPath') as
                    | t.ObjectProperty
                    | undefined;

                  violations.push({
                    rule: 'runquery-categorypath-without-queryname',
                    severity: 'critical',
                    line: categoryPathProp?.loc?.start.line || config.loc?.start.line || 0,
                    column: categoryPathProp?.loc?.start.column || config.loc?.start.column || 0,
                    message: `CategoryPath cannot be used alone - it requires QueryName. CategoryPath is only used to disambiguate when multiple queries share the same name. You must specify which query to run using QueryName.`,
                    code: `CategoryPath: '...'  // Missing: QueryName`,
                    suggestion: {
                      text: 'Add QueryName property alongside CategoryPath. The query name should come from your dataRequirements.queries[].name',
                      example: `// Query name from your spec: "${exampleQueryName}"\nawait utilities.rq.RunQuery({\n  QueryName: '${exampleQueryName}',  // Required: identifies which query to run\n  CategoryPath: '...',  // Optional: helps disambiguate if multiple queries have same name\n  Parameters: {\n    // Your query parameters here\n  }\n})`,
                    },
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'runquery-missing-categorypath',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Build a map of query names to their category paths from the spec
        const queryCategories = new Map<string, string>();
        if (componentSpec?.dataRequirements?.queries) {
          for (const query of componentSpec.dataRequirements.queries) {
            // Only track queries with non-empty categoryPath (empty string means no categoryPath requirement)
            if (query.name && query.categoryPath && query.categoryPath.trim().length > 0) {
              queryCategories.set(query.name, query.categoryPath);
            }
          }
        }

        // If no queries with categoryPath in spec, this rule doesn't apply
        if (queryCategories.size === 0) {
          return violations;
        }

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for utilities.rq.RunQuery
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rq' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'RunQuery'
            ) {
              // Get the first argument (RunQuery params object)
              const runQueryParams = path.node.arguments[0];
              if (!t.isObjectExpression(runQueryParams)) return;

              // Extract QueryName and CategoryPath from the call
              let queryName: string | null = null;
              let hasCategoryPath = false;
              let queryNameProp: t.ObjectProperty | undefined;

              for (const prop of runQueryParams.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                    queryName = prop.value.value;
                    queryNameProp = prop;
                  } else if (prop.key.name === 'CategoryPath') {
                    hasCategoryPath = true;
                  }
                }
              }

              // Check if this query requires a CategoryPath based on the spec
              if (queryName && queryCategories.has(queryName) && !hasCategoryPath) {
                const expectedCategoryPath = queryCategories.get(queryName)!;

                violations.push({
                  rule: 'runquery-missing-categorypath',
                  severity: 'critical',
                  line: queryNameProp?.loc?.start.line || path.node.loc?.start.line || 0,
                  column: queryNameProp?.loc?.start.column || path.node.loc?.start.column || 0,
                  message: `RunQuery with QueryName '${queryName}' is missing required CategoryPath parameter. Queries are uniquely identified by both QueryName and CategoryPath together. Without CategoryPath, RunQuery may find a different query with the same name, causing collisions and unintended behavior.`,
                  code: `RunQuery({ QueryName: '${queryName}' })  // Missing: CategoryPath`,
                  suggestion: {
                    text: `Add CategoryPath property to uniquely identify the query. The CategoryPath should match what's defined in your dataRequirements.queries[].categoryPath`,
                    example: `await utilities.rq.RunQuery({
  QueryName: '${queryName}',
  CategoryPath: '${expectedCategoryPath}',  // Required: ensures correct query is used
  Parameters: {
    // Your query parameters here
  }
})`,
                  },
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'runquery-parameters-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for utilities.rq.RunQuery
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rq' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'RunQuery'
            ) {
              // Get the first argument (RunQuery params object)
              const runQueryParams = path.node.arguments[0];
              if (!t.isObjectExpression(runQueryParams)) return;

              // Find QueryName or QueryID to identify the query
              let queryName: string | null = null;
              let parametersNode: t.ObjectProperty | null = null;

              for (const prop of runQueryParams.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                    queryName = prop.value.value;
                  } else if (prop.key.name === 'Parameters') {
                    parametersNode = prop;
                  }
                }
              }

              // IMPORTANT: Validate query name existence FIRST, before checking Parameters
              // This ensures we catch missing queries even when no Parameters are provided
              if (queryName && componentSpec?.dataRequirements?.queries) {
                const queryExists = componentSpec.dataRequirements.queries.some((q) => q.name === queryName);
                if (!queryExists) {
                  const availableQueries = componentSpec.dataRequirements.queries.map((q) => q.name).join(', ');
                  violations.push({
                    rule: 'runquery-parameters-validation',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Query '${queryName}' not found in component spec. Available queries: ${availableQueries || 'none'}`,
                    code: `QueryName: '${componentSpec.dataRequirements.queries[0]?.name || 'QueryNameFromSpec'}'`,
                  });
                }
              }

              // Check if query requires parameters but Parameters property is missing
              if (!parametersNode) {
                // Find the query spec to check if it has required parameters
                let specQuery: ComponentQueryDataRequirement | undefined;
                if (componentSpec?.dataRequirements?.queries && queryName) {
                  specQuery = componentSpec.dataRequirements.queries.find((q) => q.name === queryName);
                }

                if (specQuery?.parameters && specQuery.parameters.length > 0) {
                  // Check if any parameters are required
                  // Note: isRequired field is being added to ComponentQueryParameterValue type
                  const requiredParams = specQuery.parameters.filter((p) => {
                    // Check for explicit isRequired flag (when available)
                    const hasRequiredFlag = (p as any).isRequired === true || (p as any).isRequired === '1';
                    // Or infer required if value is '@runtime' (runtime parameters should be provided)
                    const isRuntimeParam = p.value === '@runtime';
                    return hasRequiredFlag || isRuntimeParam;
                  });

                  if (requiredParams.length > 0) {
                    const paramNames = requiredParams.map((p) => p.name).join(', ');
                    const exampleParams = requiredParams.map((p) => `  ${p.name}: ${p.testValue ? `'${p.testValue}'` : "'value'"}`).join(',\n');

                    violations.push({
                      rule: 'runquery-parameters-validation',
                      severity: 'high',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Query '${queryName}' requires parameters but RunQuery call is missing 'Parameters' property. Required: ${paramNames}`,
                      code: `Parameters: {\n${exampleParams}\n}`,
                    });
                  }
                }

                // Skip further parameter validation since there's no Parameters property
                return;
              }

              // Find the query in componentSpec if available
              let specQuery: ComponentQueryDataRequirement | undefined;
              if (componentSpec?.dataRequirements?.queries && queryName) {
                specQuery = componentSpec.dataRequirements.queries.find((q) => q.name === queryName);
              }

              // Validate Parameters structure
              const paramValue = parametersNode.value;

              // Case 1: Parameters is an array (incorrect format)
              if (t.isArrayExpression(paramValue)) {
                const arrayElements = paramValue.elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));

                // Check if it's an array of {Name/FieldName, Value} objects
                const paramPairs: { name: string; value: any }[] = [];
                let isNameValueFormat = true;

                for (const elem of arrayElements) {
                  let name: string | null = null;
                  let value: any = null;

                  for (const prop of elem.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name.toLowerCase();
                      if (propName === 'name' || propName === 'fieldname') {
                        if (t.isStringLiteral(prop.value)) {
                          name = prop.value.value;
                        } else if (t.isIdentifier(prop.value)) {
                          name = prop.value.name;
                        }
                      } else if (propName === 'value') {
                        // Get the actual value (could be string, number, boolean, etc.)
                        if (t.isStringLiteral(prop.value)) {
                          value = `'${prop.value.value}'`;
                        } else if (t.isNumericLiteral(prop.value)) {
                          value = prop.value.value;
                        } else if (t.isBooleanLiteral(prop.value)) {
                          value = prop.value.value;
                        } else if (t.isIdentifier(prop.value)) {
                          value = prop.value.name;
                        } else {
                          value = '/* value */';
                        }
                      }
                    }
                  }

                  if (name && value !== null) {
                    paramPairs.push({ name, value });
                  } else {
                    isNameValueFormat = false;
                    break;
                  }
                }

                // Generate fix suggestion
                let fixMessage: string;
                let fixCode: string;

                if (isNameValueFormat && paramPairs.length > 0) {
                  // Convert array format to object
                  const objProps = paramPairs.map((p) => `  ${p.name}: ${p.value}`).join(',\n');
                  fixCode = `Parameters: {\n${objProps}\n}`;

                  // Check against spec if available
                  if (specQuery?.parameters) {
                    const specParamNames = specQuery.parameters.map((p) => p.name);
                    const providedNames = paramPairs.map((p) => p.name);
                    const missing = specParamNames.filter((n) => !providedNames.includes(n));
                    const extra = providedNames.filter((n) => !specParamNames.includes(n));

                    if (missing.length > 0 || extra.length > 0) {
                      fixMessage = `RunQuery Parameters must be object, not array. `;
                      if (missing.length > 0) {
                        fixMessage += `Missing required: ${missing.join(', ')}. `;
                      }
                      if (extra.length > 0) {
                        fixMessage += `Unknown params: ${extra.join(', ')}. `;
                      }
                      fixMessage += `Expected params from spec: ${specParamNames.join(', ')}`;
                    } else {
                      fixMessage = `RunQuery Parameters must be object with key-value pairs, not array. Auto-fix: convert [{Name,Value}] to object format`;
                    }
                  } else {
                    fixMessage = `RunQuery Parameters must be object with key-value pairs, not array of {Name/Value} objects`;
                  }
                } else {
                  // Invalid array format - provide example
                  if (specQuery?.parameters && specQuery.parameters.length > 0) {
                    const exampleParams = specQuery.parameters
                      .slice(0, 3)
                      .map((p) => `  ${p.name}: '${p.testValue || 'value'}'`)
                      .join(',\n');
                    fixCode = `Parameters: {\n${exampleParams}\n}`;
                    fixMessage = `RunQuery Parameters must be object. Expected params: ${specQuery.parameters.map((p) => p.name).join(', ')}`;
                  } else {
                    fixCode = `Parameters: {\n  paramName1: 'value1',\n  paramName2: 'value2'\n}`;
                    fixMessage = `RunQuery Parameters must be object with key-value pairs, not array`;
                  }
                }

                violations.push({
                  rule: 'runquery-parameters-validation',
                  severity: 'critical',
                  line: parametersNode.loc?.start.line || 0,
                  column: parametersNode.loc?.start.column || 0,
                  message: fixMessage,
                  code: fixCode,
                });
              }
              // Case 2: Parameters is an object (correct format, but validate against spec)
              else if (t.isObjectExpression(paramValue) && specQuery?.parameters) {
                // Create maps for case-insensitive comparison
                const providedParamsMap = new Map<string, string>(); // lowercase -> original

                for (const prop of paramValue.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    providedParamsMap.set(prop.key.name.toLowerCase(), prop.key.name);
                  }
                }

                // Filter to only required parameters for validation
                const requiredParams = specQuery.parameters.filter((p) => {
                  const hasRequiredFlag = (p as any).isRequired === true || (p as any).isRequired === '1';
                  const isRuntimeParam = p.value === '@runtime';
                  return hasRequiredFlag || isRuntimeParam;
                });

                const specParamNames = specQuery.parameters.map((p) => p.name);
                const specParamNamesLower = specParamNames.map((n) => n.toLowerCase());

                // Find missing REQUIRED parameters only (case-insensitive)
                const missing = requiredParams
                  .map((p) => p.name)
                  .filter((n) => !providedParamsMap.has(n.toLowerCase()));

                // Find extra parameters (not matching any spec param case-insensitively)
                const extra = Array.from(providedParamsMap.values()).filter((providedName) => !specParamNamesLower.includes(providedName.toLowerCase()));

                if (missing.length > 0 || extra.length > 0) {
                  let message = `Query '${queryName}' parameter mismatch. `;
                  if (missing.length > 0) {
                    message += `Missing: ${missing.join(', ')}. `;
                  }
                  if (extra.length > 0) {
                    message += `Unknown: ${extra.join(', ')}. `;
                  }

                  // Generate correct parameters object
                  const correctParams = specQuery.parameters
                    .map((p) => {
                      // Check if we have this param (case-insensitive)
                      const providedName = providedParamsMap.get(p.name.toLowerCase());
                      if (providedName) {
                        // Keep existing value, find the property with case-insensitive match
                        const existingProp = paramValue.properties.find(
                          (prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name.toLowerCase() === p.name.toLowerCase(),
                        ) as t.ObjectProperty | undefined;

                        if (existingProp && t.isStringLiteral(existingProp.value)) {
                          return `  ${p.name}: '${existingProp.value.value}'`;
                        } else if (existingProp && t.isNumericLiteral(existingProp.value)) {
                          return `  ${p.name}: ${existingProp.value.value}`;
                        } else if (existingProp && t.isIdentifier(existingProp.value)) {
                          return `  ${p.name}: ${existingProp.value.name}`;
                        }
                      }
                      // Add missing with test value
                      return `  ${p.name}: '${p.testValue || 'value'}'`;
                    })
                    .join(',\n');

                  violations.push({
                    rule: 'runquery-parameters-validation',
                    severity: 'high',
                    line: parametersNode.loc?.start.line || 0,
                    column: parametersNode.loc?.start.column || 0,
                    message: message + `Expected: {${specParamNames.join(', ')}}`,
                    code: `Parameters: {\n${correctParams}\n}`,
                  });
                }
              }
              // Case 3: Parameters is a valid format we can't or don't need to validate further
              // - Variable reference (e.g., Parameters: statusParams) - can't validate without scope tracking
              // - Object expression without spec query params - nothing to validate against
              else if (t.isIdentifier(paramValue) || t.isObjectExpression(paramValue)) {
                // Valid format - skip further validation
                // Either a variable reference or an object when we have no spec to validate against
              }
              // Case 4: Parameters is neither array, object, nor variable reference
              else {
                let fixCode: string;
                let message: string;

                if (specQuery?.parameters && specQuery.parameters.length > 0) {
                  const exampleParams = specQuery.parameters.map((p) => `  ${p.name}: '${p.testValue || 'value'}'`).join(',\n');
                  fixCode = `Parameters: {\n${exampleParams}\n}`;
                  message = `RunQuery Parameters must be object. Expected params from spec: ${specQuery.parameters.map((p) => p.name).join(', ')}`;
                } else {
                  fixCode = `Parameters: {\n  paramName: 'value'\n}`;
                  message = `RunQuery Parameters must be object with key-value pairs`;
                }

                violations.push({
                  rule: 'runquery-parameters-validation',
                  severity: 'critical',
                  line: parametersNode.loc?.start.line || 0,
                  column: parametersNode.loc?.start.column || 0,
                  message,
                  code: fixCode,
                });
              }

              // Note: Query name validation happens earlier (before Parameters check)
              // to ensure we catch missing queries even when no Parameters are provided
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'query-parameter-type-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no queries in spec
        if (!componentSpec?.dataRequirements?.queries || componentSpec.dataRequirements.queries.length === 0) {
          return violations;
        }

        // Build a map of query parameters with their types
        const queryParamsMap = new Map<string, Map<string, { type: string; sqlType: string }>>();
        for (const query of componentSpec.dataRequirements.queries) {
          if (query.parameters) {
            const paramMap = new Map<string, { type: string; sqlType: string }>();
            for (const param of query.parameters) {
              // Extended parameter info includes type
              const extParam = param as { name: string; type?: string };
              if (extParam.type) {
                paramMap.set(param.name.toLowerCase(), {
                  type: mapSQLTypeToJSType(extParam.type),
                  sqlType: extParam.type
                });
              }
            }
            if (paramMap.size > 0) {
              queryParamsMap.set(query.name, paramMap);
            }
          }
        }

        // If no parameter type info available, skip validation
        if (queryParamsMap.size === 0) {
          return violations;
        }

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for utilities.rq.RunQuery
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rq' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'RunQuery'
            ) {
              // Get the first argument (RunQuery params object)
              const runQueryParams = path.node.arguments[0];
              if (!t.isObjectExpression(runQueryParams)) return;

              // Find QueryName and Parameters
              let queryName: string | null = null;
              let parametersNode: t.ObjectExpression | null = null;

              for (const prop of runQueryParams.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                    queryName = prop.value.value;
                  } else if (prop.key.name === 'Parameters' && t.isObjectExpression(prop.value)) {
                    parametersNode = prop.value;
                  }
                }
              }

              // Skip if no query name or no parameters
              if (!queryName || !parametersNode) return;

              // Get the parameter types for this query
              const paramTypes = queryParamsMap.get(queryName);
              if (!paramTypes) return;

              // Validate each parameter value type
              for (const prop of parametersNode.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const paramName = prop.key.name;
                  const paramTypeInfo = paramTypes.get(paramName.toLowerCase());

                  if (!paramTypeInfo) continue;

                  const expectedType = paramTypeInfo.type;
                  let actualType: string | null = null;
                  let valueDesc: string = '';

                  // Determine the actual type of the value
                  if (t.isStringLiteral(prop.value)) {
                    actualType = 'string';
                    valueDesc = `'${prop.value.value}'`;
                  } else if (t.isNumericLiteral(prop.value)) {
                    actualType = 'number';
                    valueDesc = String(prop.value.value);
                  } else if (t.isBooleanLiteral(prop.value)) {
                    actualType = 'boolean';
                    valueDesc = String(prop.value.value);
                  } else if (t.isNullLiteral(prop.value)) {
                    actualType = 'null';
                    valueDesc = 'null';
                  } else if (t.isIdentifier(prop.value)) {
                    // Variable - skip type checking (would need type inference)
                    continue;
                  } else if (t.isTemplateLiteral(prop.value)) {
                    actualType = 'string';
                    valueDesc = 'template string';
                  } else {
                    // Complex expression - skip
                    continue;
                  }

                  // Check for type mismatch
                  if (actualType && actualType !== expectedType) {
                    // Special cases: allow null for nullable parameters
                    if (actualType === 'null') {
                      continue;
                    }

                    // Generate suggestion based on expected type
                    let suggestion = '';
                    if (expectedType === 'number' && actualType === 'string') {
                      // If the string looks like a number, suggest removing quotes
                      if (t.isStringLiteral(prop.value) && !isNaN(Number(prop.value.value))) {
                        suggestion = `Use ${paramName}: ${prop.value.value} (without quotes)`;
                      } else {
                        suggestion = `Use a numeric value`;
                      }
                    } else if (expectedType === 'boolean' && actualType === 'string') {
                      if (t.isStringLiteral(prop.value)) {
                        const val = prop.value.value.toLowerCase();
                        if (val === 'true' || val === 'false') {
                          suggestion = `Use ${paramName}: ${val} (without quotes)`;
                        } else {
                          suggestion = `Use ${paramName}: true or ${paramName}: false`;
                        }
                      }
                    } else if (expectedType === 'string' && actualType === 'number') {
                      suggestion = `Use ${paramName}: '${valueDesc}'`;
                    }

                    violations.push({
                      rule: 'query-parameter-type-validation',
                      severity: 'high',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Parameter "${paramName}" has wrong type. Expected ${expectedType} (${paramTypeInfo.sqlType}), got ${actualType} (${valueDesc}).${suggestion ? ' ' + suggestion : ''}`,
                      code: suggestion || `${paramName}: <${expectedType} value>`,
                    });
                  }

                  // NOTE: Date parameter validation has been moved to TypeInferenceEngine
                  // and is surfaced via the 'type-inference-errors' rule
                }
              }
            }
          },
        });

        return violations;
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // TYPE INFERENCE ERRORS RULE
    // Surfaces errors found by TypeInferenceEngine (e.g., date parameter validation)
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    {
      name: 'type-inference-errors',
      appliesTo: 'all',
      test: (ast: t.File, _componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Create type inference engine
        const typeEngine = new TypeInferenceEngine(componentSpec);

        // Run analysis synchronously (validateQueryParameters is called during traversal)
        // The async part of analyze() is not needed for date validation
        typeEngine.analyze(ast);

        // Get errors collected during analysis
        const errors = typeEngine.getErrors();

        // Convert type inference errors to violations
        for (const error of errors) {
          violations.push({
            rule: 'type-inference-errors',
            severity: error.type === 'error' ? 'high' : 'medium',
            line: error.line,
            column: error.column,
            message: error.message,
            code: error.code || ''
          });
        }

        return violations;
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // TYPE MISMATCH OPERATION RULE
    // Validates that operations are type-safe (e.g., no arithmetic on strings, array methods on non-arrays)
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    {
      name: 'type-mismatch-operation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Create type inference engine
        const typeEngine = new TypeInferenceEngine(componentSpec);

        // Create control flow analyzer
        const cfa = new ControlFlowAnalyzer(ast, componentSpec);

        // Run analysis synchronously (the async part is not needed for basic inference)
        typeEngine.analyze(ast);

        traverse(ast, {
          // Check binary operations for type mismatches
          BinaryExpression(path: NodePath<t.BinaryExpression>) {
            const node = path.node;
            const operator = node.operator;

            // Skip comparison operators - they work with any types
            if (['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(operator)) {
              return;
            }

            // Check arithmetic operators (should be numbers)
            if (['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>'].includes(operator)) {
              // Skip if left is PrivateName
              if (t.isPrivateName(node.left)) return;

              const leftType = typeEngine.inferExpressionType(node.left, path);
              const rightType = typeEngine.inferExpressionType(node.right, path);

              // Special case: Date - Date is valid (subtraction only)
              if (operator === '-' && leftType.type === 'Date' && rightType.type === 'Date') {
                // Date - Date produces a number (milliseconds), this is valid
                return;
              }

              // Check if both sides are guarded by typeof checks using Control Flow Analyzer
              const leftGuarded = cfa.isNarrowedToType(node.left, path, 'number');
              const rightGuarded = cfa.isNarrowedToType(node.right, path, 'number');

              // Only flag if we know the type is wrong (not unknown) AND not guarded by typeof
              if (!leftGuarded && leftType.type !== 'unknown' && leftType.type !== 'number' && leftType.type !== 'Date') {
                violations.push({
                  rule: 'type-mismatch-operation',
                  severity: 'high',
                  line: node.loc?.start.line || 0,
                  column: node.loc?.start.column || 0,
                  message: `Arithmetic operator "${operator}" used with ${leftType.type} on left side. Expected number.`,
                  code: `Convert to number: Number(value) ${operator} ...`,
                });
              }

              if (!rightGuarded && rightType.type !== 'unknown' && rightType.type !== 'number' && rightType.type !== 'Date') {
                violations.push({
                  rule: 'type-mismatch-operation',
                  severity: 'high',
                  line: node.loc?.start.line || 0,
                  column: node.loc?.start.column || 0,
                  message: `Arithmetic operator "${operator}" used with ${rightType.type} on right side. Expected number.`,
                  code: `Convert to number: ... ${operator} Number(value)`,
                });
              }
            }
          },

          // Check array method calls on non-arrays
          CallExpression(path: NodePath<t.CallExpression>) {
            const node = path.node;

            if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
              const methodName = node.callee.property.name;

              // Array-specific methods
              const arrayOnlyMethods = [
                'push', 'pop', 'shift', 'unshift', 'splice', 'slice',
                'map', 'filter', 'reduce', 'reduceRight', 'forEach',
                'find', 'findIndex', 'some', 'every', 'flat', 'flatMap',
                'sort', 'reverse', 'concat', 'join', 'fill', 'copyWithin'
              ];

              if (arrayOnlyMethods.includes(methodName)) {
                const objectType = typeEngine.inferExpressionType(node.callee.object, path);

                // Only flag if we know it's definitely not an array
                if (objectType.type !== 'unknown' && objectType.type !== 'array') {
                  violations.push({
                    rule: 'type-mismatch-operation',
                    severity: 'high',
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    message: `Array method "${methodName}()" called on ${objectType.type}. This will fail at runtime.`,
                    code: `Ensure value is an array before calling .${methodName}()`,
                  });
                }
              }

              // String-specific methods
              const stringOnlyMethods = [
                'charAt', 'charCodeAt', 'codePointAt', 'substring', 'substr',
                'toUpperCase', 'toLowerCase', 'trim', 'trimStart', 'trimEnd',
                'padStart', 'padEnd', 'repeat', 'split', 'match', 'replace',
                'replaceAll', 'search', 'localeCompare', 'normalize'
              ];

              if (stringOnlyMethods.includes(methodName)) {
                const objectType = typeEngine.inferExpressionType(node.callee.object, path);

                // Only flag if we know it's definitely not a string
                if (objectType.type !== 'unknown' && objectType.type !== 'string') {
                  violations.push({
                    rule: 'type-mismatch-operation',
                    severity: 'high',
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    message: `String method "${methodName}()" called on ${objectType.type}. This may fail at runtime.`,
                    code: `Ensure value is a string or convert: String(value).${methodName}()`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'runview-entity-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for utilities.rv.RunView or RunViews
            if (
              t.isMemberExpression(callee) &&
              t.isMemberExpression(callee.object) &&
              t.isIdentifier(callee.object.object) &&
              callee.object.object.name === 'utilities' &&
              t.isIdentifier(callee.object.property) &&
              callee.object.property.name === 'rv' &&
              t.isIdentifier(callee.property)
            ) {
              const methodName = callee.property.name;
              if (methodName !== 'RunView' && methodName !== 'RunViews') return;

              // Get the configs
              let configs: t.ObjectExpression[] = [];

              if (methodName === 'RunViews' && t.isArrayExpression(path.node.arguments[0])) {
                configs = path.node.arguments[0].elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
              } else if (methodName === 'RunView' && t.isObjectExpression(path.node.arguments[0])) {
                configs = [path.node.arguments[0]];
              }

              // Check each config against spec
              if (componentSpec?.dataRequirements?.entities) {
                const specEntityNames = componentSpec.dataRequirements.entities.map((e) => e.name);

                for (const config of configs) {
                  let entityName: string | null = null;

                  for (const prop of config.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      if (prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
                        entityName = prop.value.value;
                        break;
                      }
                    }
                  }

                  if (entityName && specEntityNames.length > 0 && !specEntityNames.includes(entityName)) {
                    violations.push({
                      rule: 'runview-entity-validation',
                      severity: 'medium',
                      line: config.loc?.start.line || 0,
                      column: config.loc?.start.column || 0,
                      message: `Entity '${entityName}' not in component spec. Available entities: ${specEntityNames.join(', ')}`,
                      code: `EntityName: '${specEntityNames[0] || 'EntityFromSpec'}'`,
                    });
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'react-component-naming',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName) {
              // Check if it's the main component function
              const funcName = path.node.id.name;

              // Check if function has component-like parameters (props structure)
              const firstParam = path.node.params[0];
              const hasComponentProps = firstParam && (t.isObjectPattern(firstParam) || t.isIdentifier(firstParam));

              if (hasComponentProps && funcName[0] !== funcName[0].toUpperCase()) {
                violations.push({
                  rule: 'react-component-naming',
                  severity: 'critical',
                  line: path.node.id.loc?.start.line || 0,
                  column: path.node.id.loc?.start.column || 0,
                  message: `React component "${funcName}" must start with uppercase. JSX treats lowercase as HTML elements.`,
                  code: `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`,
                });
              }
            }

            // Also check for any other component-like functions
            if (path.node.id && path.node.params[0]) {
              const funcName = path.node.id.name;
              const firstParam = path.node.params[0];

              // Check if it looks like a component (has props parameter and returns JSX)
              let returnsJSX = false;
              path.traverse({
                ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
                  if (returnPath.node.argument && t.isJSXElement(returnPath.node.argument)) {
                    returnsJSX = true;
                  }
                },
              });

              if (returnsJSX && t.isObjectPattern(firstParam)) {
                // Check if any props match component prop pattern
                const propNames = firstParam.properties
                  .filter((p): p is t.ObjectProperty => t.isObjectProperty(p))
                  .filter((p) => t.isIdentifier(p.key))
                  .map((p) => (p.key as t.Identifier).name);

                const hasComponentLikeProps = propNames.some((name) =>
                  ['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings', 'data', 'userState', 'onStateChanged'].includes(
                    name,
                  ),
                );

                if (hasComponentLikeProps && funcName[0] !== funcName[0].toUpperCase()) {
                  violations.push({
                    rule: 'react-component-naming',
                    severity: 'critical',
                    line: path.node.id.loc?.start.line || 0,
                    column: path.node.id.loc?.start.column || 0,
                    message: `Function "${funcName}" appears to be a React component and must start with uppercase.`,
                    code: `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'string-template-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          // Check for malformed template literals
          TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
            // Template literals are parsed correctly by Babel, so if we're here it's valid
            // But we can check for common issues like empty expressions
            path.node.expressions.forEach((expr, index) => {
              if (t.isIdentifier(expr) && expr.name === 'undefined') {
                violations.push({
                  rule: 'string-template-validation',
                  severity: 'high',
                  line: expr.loc?.start.line || 0,
                  column: expr.loc?.start.column || 0,
                  message: 'Template literal contains undefined expression',
                  code: '${/* value */}',
                });
              }
            });
          },

          // Check for string concatenation issues
          BinaryExpression(path: NodePath<t.BinaryExpression>) {
            if (path.node.operator === '+') {
              const left = path.node.left;
              const right = path.node.right;

              // Check for incomplete string concatenation patterns
              // e.g., 'text' + without right side, or + 'text' without left
              if (t.isStringLiteral(left) && t.isIdentifier(right) && right.name === 'undefined') {
                violations.push({
                  rule: 'string-template-validation',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: 'String concatenation with undefined',
                  code: `'${(left as t.StringLiteral).value}'`,
                });
              }
            }
          },

          // Check for malformed return statements with strings
          ReturnStatement(path: NodePath<t.ReturnStatement>) {
            const arg = path.node.argument;

            // Look for patterns like: return ' + value (missing opening quote)
            if (t.isBinaryExpression(arg) && arg.operator === '+') {
              const left = arg.left;

              // Check if it starts with just a quote (malformed)
              if (t.isStringLiteral(left) && left.value === '') {
                const code = path.toString();
                // Check for patterns that suggest missing quotes
                if (code.includes("' +") || code.includes('" +')) {
                  violations.push({
                    rule: 'string-template-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Malformed string concatenation - possible missing quote',
                    code: 'Check string quotes and concatenation',
                  });
                }
              }
            }

            // Detect pattern like: return ' + y.toFixed(4)
            // This is checking for a literal string that starts with space and plus
            if (t.isCallExpression(arg)) {
              const code = path.toString();
              if (code.match(/return\s+['"`]\s*\+/)) {
                violations.push({
                  rule: 'string-template-validation',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: 'Malformed string template - missing opening quote or backtick',
                  code: `return \`$\{value}\``,
                });
              }
            }
          },

          // Check inside function bodies for malformed strings
          StringLiteral(path: NodePath<t.StringLiteral>) {
            const value = path.node.value;

            // Check for strings that look like incomplete templates
            // e.g., a string that starts with $ but isn't in a template
            // Check if this string literal is not inside a template literal
            let isInTemplate = false;
            let currentPath: NodePath<t.Node> | null = path.parentPath;
            while (currentPath) {
              if (t.isTemplateLiteral(currentPath.node)) {
                isInTemplate = true;
                break;
              }
              currentPath = currentPath.parentPath;
            }

            if (value.includes('${') && !isInTemplate) {
              violations.push({
                rule: 'string-template-validation',
                severity: 'high',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: 'String contains template syntax but is not a template literal',
                code: `\`${value}\``,
              });
            }
          },
        });

        // Additional check for specific malformed patterns in raw code
        const code = ast.toString ? ast.toString() : '';
        const lines = code.split('\n');

        lines.forEach((line, index) => {
          // Pattern: return ' + something or return " + something
          const malformedReturn = line.match(/return\s+['"`]\s*\+\s*[\w.()]/);
          if (malformedReturn) {
            violations.push({
              rule: 'string-template-validation',
              severity: 'critical',
              line: index + 1,
              column: malformedReturn.index || 0,
              message: 'Malformed string return - missing opening quote',
              code: 'return `${value}`',
            });
          }

          // Pattern: unclosed template literal
          const templateStart = line.match(/`[^`]*\$\{[^}]*$/);
          if (templateStart && !line.includes('`', templateStart.index! + 1)) {
            violations.push({
              rule: 'string-template-validation',
              severity: 'critical',
              line: index + 1,
              column: templateStart.index || 0,
              message: 'Unclosed template literal',
              code: 'Close template with backtick',
            });
          }
        });

        return violations;
      },
    },

    {
      name: 'string-replace-all-occurrences',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Template patterns that are HIGH severity (likely to have multiple occurrences)
        const templatePatterns = [
          { pattern: /\{\{[^}]+\}\}/, example: '{{field}}', desc: 'double curly braces' },
          { pattern: /\{[^}]+\}/, example: '{field}', desc: 'single curly braces' },
          { pattern: /<<[^>]+>>/, example: '<<field>>', desc: 'double angle brackets' },
          { pattern: /<[^>]+>/, example: '<field>', desc: 'single angle brackets' },
        ];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check if it's a .replace() method call
            if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'replace') {
              const args = path.node.arguments;
              if (args.length >= 2) {
                const [searchArg, replaceArg] = args;

                // Handle string literal search patterns
                if (t.isStringLiteral(searchArg)) {
                  const searchValue = searchArg.value;

                  // Check if it matches any template pattern
                  let matchedPattern = null;
                  for (const tp of templatePatterns) {
                    if (tp.pattern.test(searchValue)) {
                      matchedPattern = tp;
                      break;
                    }
                  }

                  if (matchedPattern) {
                    // HIGH severity for template patterns
                    violations.push({
                      rule: 'string-replace-all-occurrences',
                      severity: 'high',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Using replace() with ${matchedPattern.desc} template '${searchValue}' only replaces the first occurrence. This will cause bugs if the template appears multiple times.`,
                      suggestion: {
                        text: `Use .replaceAll('${searchValue}', ...) to replace all occurrences`,
                        example: `str.replaceAll('${searchValue}', value)`,
                      },
                    });
                  } else {
                    // LOW severity for general replace() usage
                    violations.push({
                      rule: 'string-replace-all-occurrences',
                      severity: 'low',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Note: replace() only replaces the first occurrence of '${searchValue}'. If you need to replace all occurrences, use replaceAll() or a global regex.`,
                      suggestion: {
                        text: `Consider if you need replaceAll() instead`,
                        example: `str.replaceAll('${searchValue}', value) or str.replace(/${searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/g, value)`,
                      },
                    });
                  }
                }
                // Handle regex patterns - only warn if not global
                else if (t.isRegExpLiteral(searchArg)) {
                  const flags = searchArg.flags || '';
                  if (!flags.includes('g')) {
                    violations.push({
                      rule: 'string-replace-all-occurrences',
                      severity: 'low',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Regex pattern without 'g' flag only replaces first match. Add 'g' flag for global replacement.`,
                      suggestion: {
                        text: `Add 'g' flag to replace all matches`,
                        example: `str.replace(/${searchArg.pattern}/${flags}g, value)`,
                      },
                    });
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'component-props-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

        // React special props that are automatically provided by React
        const reactSpecialProps = new Set(['children']);

        // Build set of allowed props: standard props + React special props + componentSpec properties + events
        const allowedProps = new Set([...standardProps, ...reactSpecialProps]);

        // Track required props separately for validation
        const requiredProps = new Set<string>();

        // Add props from componentSpec.properties if they exist
        // These are the architect-defined props that this component is allowed to accept
        const specDefinedProps: string[] = [];
        if (componentSpec?.properties) {
          for (const prop of componentSpec.properties) {
            if (prop.name) {
              allowedProps.add(prop.name);
              specDefinedProps.push(prop.name);
              if (prop.required) {
                requiredProps.add(prop.name);
              }
            }
          }
        }

        // Add events from componentSpec.events if they exist
        // Events are functions passed as props to the component
        // Events are received as props with 'on' prefix: event 'dataPointClick' becomes prop 'onDataPointClick'
        const specDefinedEvents: string[] = [];
        if (componentSpec?.events) {
          for (const event of componentSpec.events) {
            if (event.name) {
              // Add both the raw event name and the 'on' prefixed version
              // The 'on' prefix is the standard React convention for event handlers
              const onPrefixedName = 'on' + event.name.charAt(0).toUpperCase() + event.name.slice(1);
              allowedProps.add(event.name);
              allowedProps.add(onPrefixedName);
              specDefinedEvents.push(onPrefixedName);
              // Events are typically optional unless explicitly marked required
            }
          }
        }

        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                const invalidProps: string[] = [];
                const allProps: string[] = [];

                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    allProps.push(propName);
                    if (!allowedProps.has(propName)) {
                      invalidProps.push(propName);
                    }
                  }
                }

                // Check for missing required props
                const missingRequired = Array.from(requiredProps).filter((prop) => !allProps.includes(prop) && !standardProps.has(prop));

                // Report missing required props
                if (missingRequired.length > 0) {
                  violations.push({
                    rule: 'component-props-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component "${componentName}" is missing required props: ${missingRequired.join(', ')}. These props are marked as required in the component specification.`,
                  });
                }

                // Only report if there are non-allowed props
                if (invalidProps.length > 0) {
                  let message: string;
                  if (specDefinedProps.length > 0 || specDefinedEvents.length > 0) {
                    message =
                      `Component "${componentName}" accepts undeclared props: ${invalidProps.join(', ')}. ` +
                      `This component can only accept: ` +
                      `(1) Standard props: ${Array.from(standardProps).join(', ')}, ` +
                      (specDefinedProps.length > 0 ? `(2) Spec-defined props: ${specDefinedProps.join(', ')}, ` : '') +
                      (specDefinedEvents.length > 0 ? `(3) Spec-defined events: ${specDefinedEvents.join(', ')}, ` : '') +
                      `(4) React props: ${Array.from(reactSpecialProps).join(', ')}. ` +
                      `Any additional props must be defined in the component spec's properties or events array.`;
                  } else {
                    message =
                      `Component "${componentName}" accepts undeclared props: ${invalidProps.join(', ')}. ` +
                      `This component can only accept: ` +
                      `(1) Standard props: ${Array.from(standardProps).join(', ')}, ` +
                      `(2) React props: ${Array.from(reactSpecialProps).join(', ')}. ` +
                      `To accept additional props, they must be defined in the component spec's properties or events array.`;
                  }

                  violations.push({
                    rule: 'component-props-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message,
                  });
                }
              }
            }
          },

          // Also check arrow function components
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
              const init = path.node.init;
              if (t.isArrowFunctionExpression(init) && init.params[0]) {
                const param = init.params[0];
                if (t.isObjectPattern(param)) {
                  const invalidProps: string[] = [];
                  const allProps: string[] = [];

                  for (const prop of param.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name;
                      allProps.push(propName);
                      if (!allowedProps.has(propName)) {
                        invalidProps.push(propName);
                      }
                    }
                  }

                  // Check for missing required props
                  const missingRequired = Array.from(requiredProps).filter((prop) => !allProps.includes(prop) && !standardProps.has(prop));

                  // Report missing required props
                  if (missingRequired.length > 0) {
                    violations.push({
                      rule: 'component-props-validation',
                      severity: 'critical',
                      line: init.loc?.start.line || 0,
                      column: init.loc?.start.column || 0,
                      message: `Component "${componentName}" is missing required props: ${missingRequired.join(', ')}. These props are marked as required in the component specification.`,
                    });
                  }

                  if (invalidProps.length > 0) {
                    let message: string;
                    if (specDefinedProps.length > 0 || specDefinedEvents.length > 0) {
                      message =
                        `Component "${componentName}" accepts undeclared props: ${invalidProps.join(', ')}. ` +
                        `This component can only accept: ` +
                        `(1) Standard props: ${Array.from(standardProps).join(', ')}, ` +
                        (specDefinedProps.length > 0 ? `(2) Spec-defined props: ${specDefinedProps.join(', ')}, ` : '') +
                        (specDefinedEvents.length > 0 ? `(3) Spec-defined events: ${specDefinedEvents.join(', ')}, ` : '') +
                        `(4) React props: ${Array.from(reactSpecialProps).join(', ')}. ` +
                        `Any additional props must be defined in the component spec's properties or events array.`;
                    } else {
                      message =
                        `Component "${componentName}" accepts undeclared props: ${invalidProps.join(', ')}. ` +
                        `This component can only accept: ` +
                        `(1) Standard props: ${Array.from(standardProps).join(', ')}, ` +
                        `(2) React props: ${Array.from(reactSpecialProps).join(', ')}. ` +
                        `To accept additional props, they must be defined in the component spec's properties or events array.`;
                    }

                    violations.push({
                      rule: 'component-props-validation',
                      severity: 'critical',
                      line: init.loc?.start.line || 0,
                      column: init.loc?.start.column || 0,
                      message,
                    });
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'unsafe-array-operations',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Create control flow analyzer for guard detection
        const cfa = new ControlFlowAnalyzer(ast, componentSpec);

        // Track which parameters are from props (likely from queries/RunView)
        const propsParams = new Set<string>();

        traverse(ast, {
          // Find the main component function to identify props
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id?.name === componentName) {
              const params = path.node.params[0];
              if (t.isObjectPattern(params)) {
                params.properties.forEach((prop) => {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    propsParams.add(prop.key.name);
                  }
                });
              }
            }
          },

          FunctionExpression(path: NodePath<t.FunctionExpression>) {
            // Also check function expressions
            const parent = path.parent;
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
              if (parent.id.name === componentName) {
                const params = path.node.params[0];
                if (t.isObjectPattern(params)) {
                  params.properties.forEach((prop) => {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      propsParams.add(prop.key.name);
                    }
                  });
                }
              }
            }
          },

          // Check for direct array access patterns like arr[0]
          MemberExpression(path: NodePath<t.MemberExpression>) {
            const { object, property, computed } = path.node;

            // Check for array[index] patterns
            if (computed && (t.isNumericLiteral(property) || (t.isIdentifier(property) && /^\d+$/.test(property.name)))) {
              const code = path.toString();

              // Check if there's optional chaining
              if (!path.node.optional) {
                // Check for safe patterns before flagging
                let isSafe = false;

                // Get the access index
                const accessIndex = t.isNumericLiteral(property) ? property.value : parseInt(property.name, 10);

                // Use CFA to check if array access is safe due to bounds checking
                if (!isNaN(accessIndex) && cfa.isArrayAccessSafe(object, accessIndex, path)) {
                  isSafe = true;
                }

                // Pattern 1: Result of split() always has at least one element
                // e.g., str.split('T')[0] or isoString.split('T')[0]
                if (!isSafe &&
                    t.isCallExpression(object) &&
                    t.isMemberExpression(object.callee) &&
                    t.isIdentifier(object.callee.property) &&
                    object.callee.property.name === 'split'
                ) {
                  isSafe = true;
                }

                // Pattern 1b: Object.entries() callback parameters always have [0] and [1]
                // e.g., .sort((a, b) => b[1] - a[1]) where a and b are [key, value] tuples
                // Check if this access is inside a callback function parameter
                if (t.isIdentifier(object) && t.isNumericLiteral(property) && property.value <= 1) {
                  const funcParent = path.getFunctionParent();
                  if (funcParent) {
                    // Check if the identifier is a parameter of an arrow function or function expression
                    const params = funcParent.node.params;
                    for (const param of params) {
                      if (t.isIdentifier(param) && param.name === object.name) {
                        // Check if this function is a callback to array methods (sort, filter, map, etc.)
                        const callParent = funcParent.parentPath;
                        if (callParent && t.isCallExpression(callParent.node)) {
                          const calleeNode = callParent.node.callee;
                          if (t.isMemberExpression(calleeNode) && t.isIdentifier(calleeNode.property)) {
                            const methodName = calleeNode.property.name;
                            // Array methods that pass elements to callbacks
                            if (['sort', 'filter', 'map', 'forEach', 'find', 'some', 'every', 'reduce', 'findIndex'].includes(methodName)) {
                              // Check if the array being iterated originates from Object.entries
                              // This could be Object.entries() directly or chained through filter/map/etc.
                              const checkForObjectEntries = (node: t.Node): boolean => {
                                // Direct Object.entries() call
                                if (
                                  t.isCallExpression(node) &&
                                  t.isMemberExpression(node.callee) &&
                                  t.isIdentifier(node.callee.object) &&
                                  node.callee.object.name === 'Object' &&
                                  t.isIdentifier(node.callee.property) &&
                                  node.callee.property.name === 'entries'
                                ) {
                                  return true;
                                }
                                // Chained method call: Object.entries().filter().map() etc.
                                if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
                                  const chainMethod = node.callee.property.name;
                                  if (['filter', 'map', 'slice', 'concat', 'flat', 'flatMap', 'reverse', 'toSorted', 'toReversed'].includes(chainMethod)) {
                                    // Recursively check the object being called on
                                    return checkForObjectEntries(node.callee.object);
                                  }
                                }
                                return false;
                              };

                              if (checkForObjectEntries(calleeNode.object)) {
                                // Object.entries() always returns [key, value] tuples
                                isSafe = true;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }

                // Pattern 1c: Fallback pattern with array access (|| operator)
                // e.g., (colors || defaultColors)[0] - array has a fallback so won't be null
                // Note: CFA handles most guards, but this is a special safe pattern
                if (!isSafe && t.isLogicalExpression(object) && object.operator === '||') {
                  isSafe = true;
                }

                // Pattern 2: Object.keys/values/entries always returns an array
                // e.g., Object.keys(obj)[0]
                if (
                  t.isCallExpression(object) &&
                  t.isMemberExpression(object.callee) &&
                  t.isIdentifier(object.callee.object) &&
                  object.callee.object.name === 'Object' &&
                  t.isIdentifier(object.callee.property) &&
                  ['keys', 'values', 'entries'].includes(object.callee.property.name)
                ) {
                  // This is safe in that it won't throw, but may return undefined
                  // We'll allow it since it's a common pattern
                  isSafe = true;
                }

                // Pattern 4: Chained array methods that preserve or filter arrays
                // e.g., Object.entries(obj).filter(...).sort(...)[0]
                // These methods always return arrays, so accessing [0] won't throw
                // (though it may return undefined if the result is empty)
                if (!isSafe && t.isCallExpression(object)) {
                  // Length-preserving methods: sort, reverse, fill, copyWithin
                  // Array-returning methods: filter, map, slice, concat, flat, flatMap
                  const arrayReturningMethods = [
                    'sort', 'reverse', 'fill', 'copyWithin',  // mutating but return same array
                    'filter', 'map', 'slice', 'concat', 'flat', 'flatMap',  // return new array
                    'splice'  // returns removed elements as array
                  ];

                  // Check if the call is a chained array method
                  if (t.isMemberExpression(object.callee) && t.isIdentifier(object.callee.property)) {
                    const methodName = object.callee.property.name;
                    if (arrayReturningMethods.includes(methodName)) {
                      // This is an array method that returns an array
                      // The access won't throw, though may return undefined
                      isSafe = true;
                    }
                  }
                }

                if (!isSafe) {
                  violations.push({
                    rule: 'unsafe-array-operations',
                    severity: 'low',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Direct array access "${code}" may be undefined. Consider using optional chaining: ${code.replace('[', '?.[')} or check array bounds first.`,
                    code: code.substring(0, 50),
                  });
                }
              }
            }

            // Check for array methods that could fail on undefined
            const unsafeArrayMethods = ['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'length'];

            if (t.isIdentifier(property) && unsafeArrayMethods.includes(property.name)) {
              // Check if the object is a prop parameter
              if (t.isIdentifier(object) && propsParams.has(object.name)) {
                // Look for common data prop patterns
                const isDataProp =
                  object.name.toLowerCase().includes('data') ||
                  object.name.toLowerCase().includes('items') ||
                  object.name.toLowerCase().includes('results') ||
                  object.name.toLowerCase().includes('records') ||
                  object.name.toLowerCase().includes('list') ||
                  object.name.toLowerCase().includes('types') ||
                  object.name.toLowerCase().includes('options');

                if (isDataProp || property.name === 'length') {
                  // Check if there's a guard nearby (within the same function/block)
                  let hasGuard = false;

                  // Check for optional chaining (?.length, ?.map)
                  if (path.node.optional) {
                    hasGuard = true;
                  }

                  // Check for (data || []).map pattern
                  const parent = path.parent;
                  if (t.isMemberExpression(parent) && t.isLogicalExpression(parent.object)) {
                    if (parent.object.operator === '||' && t.isIdentifier(parent.object.left)) {
                      if (parent.object.left.name === object.name) {
                        hasGuard = true;
                      }
                    }
                  }

                  // Check for inline guards like: data && data.map(...)
                  const grandParent = path.parentPath?.parent;
                  if (t.isLogicalExpression(grandParent) && grandParent.operator === '&&') {
                    if (t.isIdentifier(grandParent.left) && grandParent.left.name === object.name) {
                      hasGuard = true;
                    }
                  }

                  // Check for short-circuit OR guard like: !data || data.property
                  // This is logically equivalent to the && guard but with opposite polarity
                  // If !data is true, the right side never evaluates (short-circuit)
                  // Therefore data.property is safe on the right side of ||
                  if (!hasGuard && t.isLogicalExpression(grandParent) && grandParent.operator === '||') {
                    // Check if the left side is !identifier
                    if (t.isUnaryExpression(grandParent.left) &&
                        grandParent.left.operator === '!' &&
                        t.isIdentifier(grandParent.left.argument) &&
                        grandParent.left.argument.name === object.name) {
                      hasGuard = true;
                    }
                  }

                  // Check with CFA for guards in conditional branches
                  if (!hasGuard && cfa.isDefinitelyNonNull(object, path)) {
                    hasGuard = true;
                  }

                  // Walk up the && chain to find guards in chained expressions
                  // e.g., !isDateField && data && data.length > 0
                  if (!hasGuard) {
                    // Find the containing if statement or logical expression
                    let currentPath: NodePath | null = path.parentPath;
                    while (currentPath) {
                      if (t.isIfStatement(currentPath.node)) {
                        const test = currentPath.node.test;
                        // Check if test is a logical expression with && that includes our guard
                        if (t.isLogicalExpression(test) && test.operator === '&&') {
                          // Collect all operands in the && chain
                          const collectAndOperands = (node: t.Node): t.Node[] => {
                            if (t.isLogicalExpression(node) && node.operator === '&&') {
                              return [...collectAndOperands(node.left), ...collectAndOperands(node.right)];
                            }
                            return [node];
                          };

                          const operands = collectAndOperands(test);

                          // Find our data.length access in the operands
                          let foundGuard = false;

                          for (let i = 0; i < operands.length; i++) {
                            const op = operands[i];

                            // Check if this operand is our data check (guard)
                            if (t.isIdentifier(op) && op.name === object.name) {
                              foundGuard = true;
                            }

                            // Check if this operand contains our length access
                            // Could be: data.length > 0, data.length === 0, etc.
                            let containsLengthAccess = false;
                            if (t.isBinaryExpression(op)) {
                              // Check left side for our array.length
                              if (t.isMemberExpression(op.left) &&
                                  t.isIdentifier(op.left.object) &&
                                  op.left.object.name === object.name &&
                                  t.isIdentifier(op.left.property) &&
                                  op.left.property.name === 'length') {
                                containsLengthAccess = true;
                              }
                            } else if (t.isMemberExpression(op) &&
                                       t.isIdentifier(op.object) &&
                                       op.object.name === object.name) {
                              containsLengthAccess = true;
                            }

                            if (containsLengthAccess) {
                              // If we already found the guard before this, we're safe
                              if (foundGuard) {
                                hasGuard = true;
                                break;
                              }
                            }
                          }
                        }
                        break;
                      }
                      currentPath = currentPath.parentPath;
                    }
                  }

                  // Check for early return guards in the function
                  // This is harder to detect perfectly, but we can look for common patterns
                  const functionParent = path.getFunctionParent();
                  if (functionParent && !hasGuard) {
                    let hasEarlyReturn = false;

                    // Look for if statements with returns that check our variable
                    functionParent.traverse({
                      IfStatement(ifPath: NodePath<t.IfStatement>) {
                        // Skip if this if statement comes after our usage
                        if (ifPath.node.loc && path.node.loc) {
                          if (ifPath.node.loc.start.line > path.node.loc.start.line) {
                            return;
                          }
                        }

                        const test = ifPath.node.test;
                        let checksOurVariable = false;

                        // Check if the test involves our variable
                        if (t.isUnaryExpression(test) && test.operator === '!') {
                          if (t.isIdentifier(test.argument) && test.argument.name === object.name) {
                            checksOurVariable = true;
                          }
                        }

                        if (t.isLogicalExpression(test)) {
                          // Check for !data || !Array.isArray(data) pattern
                          ifPath.traverse({
                            Identifier(idPath: NodePath<t.Identifier>) {
                              if (idPath.node.name === object.name) {
                                checksOurVariable = true;
                              }
                            },
                          });
                        }

                        // Check if the consequent has a return statement
                        if (checksOurVariable) {
                          const consequent = ifPath.node.consequent;
                          if (t.isBlockStatement(consequent)) {
                            for (const stmt of consequent.body) {
                              if (t.isReturnStatement(stmt)) {
                                hasEarlyReturn = true;
                                break;
                              }
                            }
                          } else if (t.isReturnStatement(consequent)) {
                            hasEarlyReturn = true;
                          }
                        }
                      },
                    });

                    if (hasEarlyReturn) {
                      hasGuard = true;
                    }
                  }

                  if (!hasGuard) {
                    const methodName = property.name;

                    violations.push({
                      rule: 'unsafe-array-operations',
                      severity: 'low',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Potentially unsafe operation "${object.name}.${methodName}" on prop that may be undefined. Consider using optional chaining: ${object.name}?.${methodName} or provide a default: (${object.name} || []).${methodName}`,
                      code: `${object.name}.${methodName}`,
                    });
                  }
                }
              }
            }
          },

          // Check for reduce without initial value
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'reduce') {
              const hasInitialValue = path.node.arguments.length > 1;

              if (!hasInitialValue) {
                const code = path.toString();
                violations.push({
                  rule: 'unsafe-array-operations',
                  severity: 'low',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `reduce() without initial value may fail on empty arrays. Consider providing an initial value as the second argument.`,
                  code: code.substring(0, 100),
                });
              }
            }
          },
        });

        return violations;
      },
    },

    // DISABLED: Too many false positives - needs better dependency/library checking
    // Re-enable after improving to check dependencies before assuming library components
    /* {
      name: 'undefined-jsx-component',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Track what's available in scope
        const availableIdentifiers = new Set<string>();
        const componentsFromProp = new Set<string>();
        const libraryGlobalVars = new Set<string>();
        
        // Add React hooks and built-ins
        availableIdentifiers.add('React');
        REACT_BUILT_INS.forEach(name => availableIdentifiers.add(name));
        availableIdentifiers.add('useState');
        availableIdentifiers.add('useEffect');
        availableIdentifiers.add('useCallback');
        availableIdentifiers.add('useMemo');
        availableIdentifiers.add('useRef');
        availableIdentifiers.add('useContext');
        availableIdentifiers.add('useReducer');
        availableIdentifiers.add('useLayoutEffect');
        
        // Add HTML elements from our comprehensive list
        HTML_ELEMENTS.forEach(el => availableIdentifiers.add(el));
        
        // Add library global variables
        if (componentSpec?.libraries) {
          for (const lib of componentSpec.libraries) {
            if (lib.globalVariable) {
              libraryGlobalVars.add(lib.globalVariable);
              availableIdentifiers.add(lib.globalVariable);
            }
          }
        }
        
        // Track dependency components (NOT auto-destructured - must be manually destructured or accessed via components.X)
        if (componentSpec?.dependencies) {
          for (const dep of componentSpec.dependencies) {
            if (dep.name) {
              componentsFromProp.add(dep.name);
              // DO NOT add to availableIdentifiers - components must be destructured first
            }
          }
        }
        
        traverse(ast, {
          // Track variable declarations
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id)) {
              availableIdentifiers.add(path.node.id.name);
            } else if (t.isObjectPattern(path.node.id)) {
              // Track destructured variables
              for (const prop of path.node.id.properties) {
                if (t.isObjectProperty(prop)) {
                  if (t.isIdentifier(prop.value)) {
                    availableIdentifiers.add(prop.value.name);
                  } else if (t.isIdentifier(prop.key)) {
                    availableIdentifiers.add(prop.key.name);
                  }
                }
              }
            }
          },
          
          // Track function declarations
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id) {
              availableIdentifiers.add(path.node.id.name);
            }
          },
          
          // Check JSX elements
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;
            
            // Handle JSXMemberExpression (e.g., <library.Component>)
            if (t.isJSXMemberExpression(openingElement.name)) {
              let objectName = '';
              
              if (t.isJSXIdentifier(openingElement.name.object)) {
                objectName = openingElement.name.object.name;
              }
              
              // Check if the object (library global) is available
              if (objectName && !availableIdentifiers.has(objectName)) {
                // Check if it looks like a library global that should exist
                const isLikelyLibrary = /^[a-z][a-zA-Z]*$/.test(objectName) || // camelCase like agGrid
                                       /^[A-Z][a-zA-Z]*$/.test(objectName);    // PascalCase like MaterialUI
                
                if (isLikelyLibrary) {
                  // Suggest available library globals
                  const availableLibraries = Array.from(libraryGlobalVars);
                  
                  if (availableLibraries.length > 0) {
                    // Try to find a close match
                    let suggestion = '';
                    for (const lib of availableLibraries) {
                      // Check for common patterns like agGridReact -> agGrid
                      if (objectName.toLowerCase().includes(lib.toLowerCase().replace('grid', '')) ||
                          lib.toLowerCase().includes(objectName.toLowerCase().replace('react', ''))) {
                        suggestion = lib;
                        break;
                      }
                    }
                    
                    if (suggestion) {
                      violations.push({
                        rule: 'undefined-jsx-component',
                        severity: 'critical',
                        line: openingElement.loc?.start.line || 0,
                        column: openingElement.loc?.start.column || 0,
                        message: `Library global "${objectName}" is not defined. Did you mean "${suggestion}"? Available library globals: ${availableLibraries.join(', ')}`,
                        code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`
                      });
                    } else {
                      violations.push({
                        rule: 'undefined-jsx-component',
                        severity: 'critical',
                        line: openingElement.loc?.start.line || 0,
                        column: openingElement.loc?.start.column || 0,
                        message: `Library global "${objectName}" is not defined. Available library globals: ${availableLibraries.join(', ')}`,
                        code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`
                      });
                    }
                  } else {
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'critical',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `"${objectName}" is not defined. It appears to be a library global, but no libraries are specified in the component specification.`,
                      code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`
                    });
                  }
                } else {
                  // Not a typical library pattern, just undefined
                  violations.push({
                    rule: 'undefined-jsx-component',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `"${objectName}" is not defined in the current scope.`,
                    code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`
                  });
                }
              }
              return; // Done with member expression
            }
            
            // Handle regular JSXIdentifier (e.g., <Component>)
            if (t.isJSXIdentifier(openingElement.name)) {
              const tagName = openingElement.name.name;
              
              // Check if this component is available in scope
              if (!availableIdentifiers.has(tagName)) {
                // It's not defined - check if it's a built-in or needs to be defined
                const isHTMLElement = HTML_ELEMENTS.has(tagName.toLowerCase());
                const isReactBuiltIn = REACT_BUILT_INS.has(tagName);
                
                if (!isHTMLElement && !isReactBuiltIn) {
                  // Not a built-in element, so it needs to be defined
                  // Check if it looks like PascalCase (likely a component)
                  const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(tagName);
                  
                  if (isPascalCase) {
                  // Check what libraries are actually available in the spec
                  const availableLibraries = componentSpec?.libraries || [];
                  
                  if (availableLibraries.length > 0) {
                    // We have libraries available - provide specific guidance
                    const libraryNames = availableLibraries
                      .filter(lib => lib.globalVariable)
                      .map(lib => lib.globalVariable);
                    
                    if (libraryNames.length === 1) {
                      // Single library - be very specific
                      violations.push({
                        rule: 'undefined-jsx-component',
                        severity: 'critical',
                        line: openingElement.loc?.start.line || 0,
                        column: openingElement.loc?.start.column || 0,
                        message: `JSX component "${tagName}" is not defined. This looks like it should be from the ${libraryNames[0]} library. Add: const { ${tagName} } = unwrapComponents(${libraryNames[0]}, ['${tagName}']); at the top of your component function.`,
                        code: `<${tagName} ... />`
                      });
                    } else {
                      // Multiple libraries - suggest checking which one
                      violations.push({
                        rule: 'undefined-jsx-component',
                        severity: 'critical',
                        line: openingElement.loc?.start.line || 0,
                        column: openingElement.loc?.start.column || 0,
                        message: `JSX component "${tagName}" is not defined. Available libraries: ${libraryNames.join(', ')}. Use unwrapComponents to access it: const { ${tagName} } = unwrapComponents(LibraryName, ['${tagName}']);`,
                        code: `<${tagName} ... />`
                      });
                    }
                  } else {
                    // No libraries in spec but looks like a library component
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'critical',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is not defined. This appears to be a library component, but no libraries have been specified in the component specification. The use of external libraries has not been authorized for this component. Components without library specifications cannot use external libraries.`,
                      code: `<${tagName} ... />`
                    });
                  }
                  } else if (componentsFromProp.has(tagName)) {
                    // Component is in dependencies but not destructured/accessible
                    // This indicates the component wasn't properly destructured from components prop
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'high',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is in dependencies but appears to be undefined. Make sure to destructure it from the components prop: const { ${tagName} } = components;`,
                      code: `<${tagName} ... />`
                    });
                  } else {
                    // Unknown component - not in libraries, not in dependencies
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'high',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is not defined. You must either: (1) define it in your component, (2) use a component that's already in the spec's dependencies, or (3) destructure it from a library that's already in the spec's libraries.`,
                      code: `<${tagName} ... />`
                    });
                  }
                } else {
                  // Not PascalCase but also not a built-in - suspicious
                  violations.push({
                    rule: 'undefined-jsx-component',
                    severity: 'medium',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `JSX element "${tagName}" is not recognized as a valid HTML element or React component. Check the spelling or ensure it's properly defined.`,
                    code: `<${tagName} ... />`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    }, */

    {
      name: 'runquery-runview-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // NOTE: Entity/Query name validation removed from this rule to avoid duplication
        // The 'data-requirements-validation' rule handles comprehensive entity/query validation
        // This rule now focuses on RunQuery/RunView specific issues like SQL injection

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for RunQuery calls - focus on SQL injection detection
            if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'RunQuery') {
              const args = path.node.arguments;
              if (args.length > 0 && t.isObjectExpression(args[0])) {
                const props = args[0].properties;

                // Find QueryName property
                const queryNameProp = props.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'QueryName');

                if (queryNameProp && t.isObjectProperty(queryNameProp)) {
                  const value = queryNameProp.value;

                  // Check if it's a string literal
                  if (t.isStringLiteral(value)) {
                    const queryName = value.value;

                    // Check if it looks like SQL (contains SELECT, FROM, etc.)
                    const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN'];
                    const upperQuery = queryName.toUpperCase();
                    const looksLikeSQL = sqlKeywords.some((keyword) => upperQuery.includes(keyword));

                    if (looksLikeSQL) {
                      violations.push({
                        rule: 'runquery-runview-validation',
                        severity: 'critical',
                        line: value.loc?.start.line || 0,
                        column: value.loc?.start.column || 0,
                        message: `RunQuery cannot accept SQL statements. QueryName must be a registered query name, not SQL: "${queryName.substring(0, 50)}..."`,
                        code: value.value.substring(0, 100),
                      });
                    }
                  } else if (t.isIdentifier(value) || t.isTemplateLiteral(value)) {
                    // Dynamic query name - warn that it shouldn't be SQL
                    violations.push({
                      rule: 'runquery-runview-validation',
                      severity: 'medium',
                      line: value.loc?.start.line || 0,
                      column: value.loc?.start.column || 0,
                      message: `Dynamic QueryName detected. Ensure this is a query name, not a SQL statement.`,
                      code: path.toString().substring(0, 100),
                    });
                  }
                } else {
                  // Missing QueryName property
                  violations.push({
                    rule: 'runquery-runview-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `RunQuery call is missing the required "QueryName" property.`,
                    code: path.toString().substring(0, 100),
                  });
                }
              }
            }

            // RunView validation removed - handled by data-requirements-validation
          },
        });

        return violations;
      },
    },

    {
      name: 'runview-runquery-result-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Valid properties for RunView and RunQuery results
        const validRunQueryResultProps = new Set(runQueryResultProps);
        const validRunViewResultProps = new Set(runViewResultProps);

        // Array methods that would fail on a result object
        const arrayMethods = new Set(['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'sort', 'concat']);

        // Functions that typically expect arrays
        const arrayExpectingFuncs = new Set([
          'map', 'filter', 'forEach', 'reduce', 'sort', 'concat',
          'processChartData', 'processData', 'transformData',
          'setData', 'setItems', 'setResults', 'setRows',
        ]);

        // Map of common incorrect properties to the correct property
        const incorrectToCorrectMap: Record<string, string> = {
          data: 'Results', Data: 'Results',
          rows: 'Results', Rows: 'Results',
          records: 'Results', Records: 'Results',
          items: 'Results', Items: 'Results',
          values: 'Results', Values: 'Results',
          result: 'Results', Result: 'Results',
          resultSet: 'Results', ResultSet: 'Results',
          dataset: 'Results', Dataset: 'Results',
          response: 'Results', Response: 'Results',
        };

        // Track variables that hold RunView/RunQuery results
        const resultVariables = new Map<
          string,
          {
            line: number;
            column: number;
            method: 'RunView' | 'RunViews' | 'RunQuery';
            varName: string;
          }
        >();

        // First pass: identify all RunView/RunQuery calls and their assigned variables
        traverse(ast, {
          AwaitExpression(path: NodePath<t.AwaitExpression>) {
            const callExpr = path.node.argument;

            if (t.isCallExpression(callExpr) && t.isMemberExpression(callExpr.callee)) {
              const callee = callExpr.callee;

              // Check for utilities.rv.RunView/RunViews or utilities.rq.RunQuery pattern
              if (
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) &&
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property)
              ) {
                const subObject = callee.object.property.name;
                const method = t.isIdentifier(callee.property) ? callee.property.name : '';

                let methodType: 'RunView' | 'RunViews' | 'RunQuery' | null = null;
                if (subObject === 'rv' && (method === 'RunView' || method === 'RunViews')) {
                  methodType = method as 'RunView' | 'RunViews';
                } else if (subObject === 'rq' && method === 'RunQuery') {
                  methodType = 'RunQuery';
                }

                if (methodType) {
                  const parent = path.parent;

                  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
                    resultVariables.set(parent.id.name, {
                      line: parent.id.loc?.start.line || 0,
                      column: parent.id.loc?.start.column || 0,
                      method: methodType,
                      varName: parent.id.name,
                    });
                  } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
                    resultVariables.set(parent.left.name, {
                      line: parent.left.loc?.start.line || 0,
                      column: parent.left.loc?.start.column || 0,
                      method: methodType,
                      varName: parent.left.name,
                    });
                  }
                }
              }
            }
          },
        });

        // Helper to validate property access
        const validatePropertyAccess = (
          objName: string,
          propName: string,
          isFromRunQuery: boolean,
          isFromRunView: boolean,
          line: number,
          column: number,
          code: string,
        ) => {
          if (!isFromRunQuery && !isFromRunView) return;

          const isValidQueryProp = validRunQueryResultProps.has(propName);
          const isValidViewProp = validRunViewResultProps.has(propName);

          if (isFromRunQuery && !isValidQueryProp) {
            const suggestion = incorrectToCorrectMap[propName];
            violations.push({
              rule: 'runview-runquery-result-validation',
              severity: 'critical',
              line,
              column,
              message: suggestion
                ? `RunQuery results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
                : `Invalid property "${propName}" on RunQuery result. Valid properties: ${runQueryResultProps.join(', ')}`,
              code,
            });
          } else if (isFromRunView && !isValidViewProp) {
            const suggestion = incorrectToCorrectMap[propName];
            violations.push({
              rule: 'runview-runquery-result-validation',
              severity: 'critical',
              line,
              column,
              message: suggestion
                ? `RunView results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
                : `Invalid property "${propName}" on RunView result. Valid properties: ${runViewResultProps.join(', ')}`,
              code,
            });
          }
        };

        // Second pass: check for incorrect usage patterns
        traverse(ast, {
          // Check for direct array method calls and property access
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for result.map(), result.filter(), etc.
            if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
              const objName = callee.object.name;
              const methodName = callee.property.name;

              if (arrayMethods.has(methodName)) {
                const isFromRunView = ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunView');
                const isFromRunQuery = ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunQuery');

                if (isFromRunView || isFromRunQuery) {
                  const methodType = isFromRunView ? 'RunView' : 'RunQuery';
                  violations.push({
                    rule: 'runview-runquery-result-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Cannot call array method "${methodName}" directly on ${methodType} result. Use "${objName}.Results.${methodName}(...)" instead. ${methodType} returns an object with { Success, Results, ... }, not an array.`,
                    code: `${objName}.${methodName}(...)`,
                  });
                }
              }
            }

            // Check for setState patterns
            if (t.isIdentifier(callee)) {
              const funcName = callee.name;
              const setStatePatterns = [/^set[A-Z]/, /^update[A-Z]/];
              const isSetStateFunction = setStatePatterns.some((pattern) => pattern.test(funcName));

              if (isSetStateFunction && path.node.arguments.length > 0) {
                const firstArg = path.node.arguments[0];

                // Check for Array.isArray ternary pattern in setState
                if (t.isConditionalExpression(firstArg)) {
                  const test = firstArg.test;
                  const consequent = firstArg.consequent;

                  if (
                    t.isCallExpression(test) &&
                    t.isMemberExpression(test.callee) &&
                    t.isIdentifier(test.callee.object) &&
                    test.callee.object.name === 'Array' &&
                    t.isIdentifier(test.callee.property) &&
                    test.callee.property.name === 'isArray' &&
                    test.arguments.length === 1 &&
                    t.isIdentifier(test.arguments[0])
                  ) {
                    const varName = test.arguments[0].name;

                    if (resultVariables.has(varName) && t.isIdentifier(consequent) && consequent.name === varName) {
                      const resultInfo = resultVariables.get(varName)!;
                      violations.push({
                        rule: 'runview-runquery-result-validation',
                        severity: 'critical',
                        line: firstArg.loc?.start.line || 0,
                        column: firstArg.loc?.start.column || 0,
                        message: `Passing ${resultInfo.method} result with incorrect Array.isArray check to ${funcName}. This will always pass an empty array because ${resultInfo.method} returns an object, not an array.

Correct pattern:
  if (${varName}.Success) {
    ${funcName}(${varName}.Results || []);
  } else {
    console.error('Failed to load data:', ${varName}.ErrorMessage);
  }`,
                        code: `${funcName}(Array.isArray(${varName}) ? ${varName} : [])`,
                      });
                    }
                  }
                }

                // Check for passing result directly to setState
                if (t.isIdentifier(firstArg) && resultVariables.has(firstArg.name)) {
                  const resultInfo = resultVariables.get(firstArg.name)!;
                  violations.push({
                    rule: 'runview-runquery-result-validation',
                    severity: 'critical',
                    line: firstArg.loc?.start.line || 0,
                    column: firstArg.loc?.start.column || 0,
                    message: `Passing ${resultInfo.method} result directly to ${funcName}. Use "${firstArg.name}.Results" or check "${firstArg.name}.Success" first. ${resultInfo.method} returns { Success, Results, ErrorMessage }, not the data array.`,
                    code: `${funcName}(${firstArg.name})`,
                  });
                }
              }
            }

            // Check for passing result to array-expecting functions
            for (const arg of path.node.arguments) {
              if (t.isIdentifier(arg) && resultVariables.has(arg.name)) {
                const resultInfo = resultVariables.get(arg.name)!;
                let funcName = '';
                if (t.isIdentifier(path.node.callee)) {
                  funcName = path.node.callee.name;
                } else if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
                  funcName = path.node.callee.property.name;
                }

                if (arrayExpectingFuncs.has(funcName.toLowerCase()) ||
                    Array.from(arrayExpectingFuncs).some(f => funcName.toLowerCase().includes(f.toLowerCase()))) {
                  violations.push({
                    rule: 'runview-runquery-result-validation',
                    severity: 'critical',
                    line: arg.loc?.start.line || 0,
                    column: arg.loc?.start.column || 0,
                    message: `Passing ${resultInfo.method} result object directly to ${funcName}() which expects an array.
Correct pattern:
  if (${resultInfo.varName}?.Success) {
    ${funcName}(${resultInfo.varName}.Results);
  } else {
    console.error('${resultInfo.method} failed:', ${resultInfo.varName}?.ErrorMessage);
    ${funcName}([]); // Provide empty array as fallback
  }`,
                    code: `${funcName}(${arg.name})`,
                  });
                }
              }
            }
          },

          // Check member expressions for invalid property access
          MemberExpression(path: NodePath<t.MemberExpression>) {
            if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
              const objName = path.node.object.name;
              const propName = path.node.property.name;

              const isFromRunQuery = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunQuery');
              const isFromRunView = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunView');

              // Check for .length on result
              if (propName === 'length' && resultVariables.has(objName)) {
                const resultInfo = resultVariables.get(objName)!;
                violations.push({
                  rule: 'runview-runquery-result-validation',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Cannot check .length on ${resultInfo.method} result directly. ${resultInfo.method} returns an object with Success and Results properties.
Correct pattern:
  if (${resultInfo.varName}?.Success && ${resultInfo.varName}?.Results?.length > 0) {
    // Process ${resultInfo.varName}.Results array
  }`,
                  code: `${objName}.length`,
                });
              }

              // Validate property access
              validatePropertyAccess(
                objName,
                propName,
                isFromRunQuery,
                isFromRunView,
                path.node.loc?.start.line || 0,
                path.node.loc?.start.column || 0,
                `${objName}.${propName}`,
              );

              // Check for nested incorrect access like result.data.entities
              if (
                (isFromRunQuery || isFromRunView) &&
                t.isMemberExpression(path.parent) &&
                t.isIdentifier(path.parent.property) &&
                (propName === 'data' || propName === 'Data')
              ) {
                const nestedProp = path.parent.property.name;
                violations.push({
                  rule: 'runview-runquery-result-validation',
                  severity: 'critical',
                  line: path.parent.loc?.start.line || 0,
                  column: path.parent.loc?.start.column || 0,
                  message: `Incorrect nested property access "${objName}.${propName}.${nestedProp}". RunQuery/RunView results use ".Results" directly for the data array. Change to "${objName}.Results"`,
                  code: `${objName}.${propName}.${nestedProp}`,
                });
              }
            }
          },

          // Check optional member expressions
          OptionalMemberExpression(path: NodePath<t.OptionalMemberExpression>) {
            if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
              const objName = path.node.object.name;
              const propName = path.node.property.name;

              const isFromRunQuery = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunQuery');
              const isFromRunView = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunView');

              validatePropertyAccess(
                objName,
                propName,
                isFromRunQuery,
                isFromRunView,
                path.node.loc?.start.line || 0,
                path.node.loc?.start.column || 0,
                `${objName}?.${propName}`,
              );
            }
          },

          // Check for weak fallback patterns
          LogicalExpression(path: NodePath<t.LogicalExpression>) {
            if (path.node.operator !== '??') return;

            const invalidAccesses: Array<{ objName: string; propName: string; line: number }> = [];

            const checkNode = (node: t.Node) => {
              if (t.isOptionalMemberExpression(node) && t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
                const objName = node.object.name;
                const propName = node.property.name;

                const isFromRunQuery = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunQuery');
                const isFromRunView = path.scope.hasBinding(objName) && ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunView');

                if (isFromRunQuery || isFromRunView) {
                  const isValidQueryProp = validRunQueryResultProps.has(propName);
                  const isValidViewProp = validRunViewResultProps.has(propName);

                  if ((isFromRunQuery && !isValidQueryProp) || (isFromRunView && !isValidViewProp)) {
                    invalidAccesses.push({ objName, propName, line: node.loc?.start.line || 0 });
                  }
                }
              } else if (t.isLogicalExpression(node) && node.operator === '??') {
                checkNode(node.left);
                checkNode(node.right);
              }
            };

            checkNode(path.node);

            if (invalidAccesses.length >= 2) {
              const objName = invalidAccesses[0].objName;
              const props = invalidAccesses.map((a) => a.propName).join(', ');

              violations.push({
                rule: 'runview-runquery-result-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Weak fallback pattern detected: "${objName}?.${invalidAccesses[0].propName} ?? ${objName}?.${invalidAccesses[1].propName} ?? ..." uses multiple INVALID properties (${props}). This masks the real issue. Use "${objName}?.Results ?? []" instead.`,
                code: path.toString().substring(0, 100),
              });
            }
          },

          // Check destructuring patterns
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              const sourceName = path.node.init.name;

              const isFromRunQuery = path.scope.hasBinding(sourceName) && ComponentLinter.isVariableFromRunQueryOrView(path, sourceName, 'RunQuery');
              const isFromRunView = path.scope.hasBinding(sourceName) && ComponentLinter.isVariableFromRunQueryOrView(path, sourceName, 'RunView');

              if (isFromRunQuery || isFromRunView) {
                for (const prop of path.node.id.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    const isValidQueryProp = validRunQueryResultProps.has(propName);
                    const isValidViewProp = validRunViewResultProps.has(propName);

                    if (isFromRunQuery && !isValidQueryProp) {
                      const suggestion = incorrectToCorrectMap[propName];
                      violations.push({
                        rule: 'runview-runquery-result-validation',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: suggestion
                          ? `Destructuring invalid property "${propName}" from RunQuery result. Use "${suggestion}" instead.`
                          : `Destructuring invalid property "${propName}" from RunQuery result. Valid properties: ${runQueryResultProps.join(', ')}`,
                        code: `{ ${propName} }`,
                      });
                    } else if (isFromRunView && !isValidViewProp) {
                      const suggestion = incorrectToCorrectMap[propName];
                      violations.push({
                        rule: 'runview-runquery-result-validation',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: suggestion
                          ? `Destructuring invalid property "${propName}" from RunView result. Use "${suggestion}" instead.`
                          : `Destructuring invalid property "${propName}" from RunView result. Valid properties: ${runViewResultProps.join(', ')}`,
                        code: `{ ${propName} }`,
                      });
                    }
                  }
                }
              }
            }
          },

          // Check conditional expressions for Array.isArray pattern
          ConditionalExpression(path: NodePath<t.ConditionalExpression>) {
            const test = path.node.test;
            const consequent = path.node.consequent;
            const alternate = path.node.alternate;

            if (
              t.isCallExpression(test) &&
              t.isMemberExpression(test.callee) &&
              t.isIdentifier(test.callee.object) &&
              test.callee.object.name === 'Array' &&
              t.isIdentifier(test.callee.property) &&
              test.callee.property.name === 'isArray' &&
              test.arguments.length === 1 &&
              t.isIdentifier(test.arguments[0])
            ) {
              const varName = test.arguments[0].name;

              if (
                resultVariables.has(varName) &&
                t.isIdentifier(consequent) &&
                consequent.name === varName &&
                t.isArrayExpression(alternate) &&
                alternate.elements.length === 0
              ) {
                const resultInfo = resultVariables.get(varName)!;
                violations.push({
                  rule: 'runview-runquery-result-validation',
                  severity: 'critical',
                  line: test.loc?.start.line || 0,
                  column: test.loc?.start.column || 0,
                  message: `${resultInfo.method} never returns an array directly. The pattern "Array.isArray(${varName}) ? ${varName} : []" will always evaluate to [] because ${varName} is an object with { Success, Results, ErrorMessage }.

Correct patterns:
  // Option 1: Simple with fallback
  ${varName}.Results || []

  // Option 2: Check success first
  if (${varName}.Success) {
    setData(${varName}.Results || []);
  } else {
    console.error('Failed:', ${varName}.ErrorMessage);
    setData([]);
  }`,
                  code: `Array.isArray(${varName}) ? ${varName} : []`,
                });
              }
            }
          },

          // Check if statements for result access without Success check
          IfStatement(path: NodePath<t.IfStatement>) {
            const test = path.node.test;

            // Pattern: if (result) or if (result?.length)
            if (t.isIdentifier(test) && resultVariables.has(test.name)) {
              const resultInfo = resultVariables.get(test.name)!;
              let checksSuccess = false;
              let checksResults = false;

              path.traverse({
                MemberExpression(innerPath: NodePath<t.MemberExpression>) {
                  if (t.isIdentifier(innerPath.node.object) && innerPath.node.object.name === test.name) {
                    const prop = t.isIdentifier(innerPath.node.property) ? innerPath.node.property.name : '';
                    if (prop === 'Success') checksSuccess = true;
                    if (prop === 'Results') checksResults = true;
                  }
                },
              });

              if (checksResults && !checksSuccess) {
                violations.push({
                  rule: 'runview-runquery-result-validation',
                  severity: 'high',
                  line: test.loc?.start.line || 0,
                  column: test.loc?.start.column || 0,
                  message: `Checking ${resultInfo.method} result without verifying Success property.
Correct pattern:
  if (${resultInfo.varName}?.Success) {
    const data = ${resultInfo.varName}.Results;
  } else {
    // Handle error: ${resultInfo.varName}.ErrorMessage
  }`,
                  code: `if (${test.name})`,
                });
              }
            }

            // Pattern: if (result?.length)
            if (
              t.isOptionalMemberExpression(test) &&
              t.isIdentifier(test.object) &&
              t.isIdentifier(test.property) &&
              test.property.name === 'length' &&
              resultVariables.has(test.object.name)
            ) {
              const resultInfo = resultVariables.get(test.object.name)!;
              violations.push({
                rule: 'runview-runquery-result-validation',
                severity: 'critical',
                line: test.loc?.start.line || 0,
                column: test.loc?.start.column || 0,
                message: `Incorrect check: "${test.object.name}?.length" on ${resultInfo.method} result.
Correct pattern:
  if (${resultInfo.varName}?.Success && ${resultInfo.varName}?.Results?.length > 0) {
    const processedData = processChartData(${resultInfo.varName}.Results);
  }`,
                code: `if (${test.object.name}?.length)`,
              });
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'entity-field-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no data requirements with entities
        if (!componentSpec?.dataRequirements?.entities || componentSpec.dataRequirements.entities.length === 0) {
          return violations;
        }

        // Build a map of entity names to their field names from metadata
        const entityFieldsMap = new Map<string, Set<string>>();
        const typeContext = new TypeContext(componentSpec);

        for (const entityReq of componentSpec.dataRequirements.entities) {
          const fields = typeContext.getEntityFieldTypesSync(entityReq.name);
          if (fields.size > 0) {
            entityFieldsMap.set(entityReq.name, new Set(fields.keys()));
          }
        }

        // If we couldn't load any entity metadata, skip validation
        if (entityFieldsMap.size === 0) {
          return violations;
        }

        // Track variables that hold RunView results and their entity names
        const runViewResultVars = new Map<string, string>(); // varName -> entityName
        // Track variables that hold entity row arrays (from .Results)
        const entityArrayVars = new Map<string, string>(); // varName -> entityName

        // Helper function to validate field access within a callback body
        const validateFieldAccessInCallback = (
          callbackBody: t.Node,
          paramName: string,
          entityName: string
        ) => {
          const validFields = entityFieldsMap.get(entityName);
          if (!validFields) return;

          // Simple AST walk to find member expressions within callback body
          const checkNode = (node: t.Node) => {
            if (t.isMemberExpression(node)) {
              // Skip if computed access (e.g., obj[prop])
              if (node.computed) return;

              // Check if accessing a field on the entity row variable
              if (t.isIdentifier(node.object) &&
                  node.object.name === paramName &&
                  t.isIdentifier(node.property)) {
                const fieldName = node.property.name;

                if (!validFields.has(fieldName)) {
                  // Get a sample of valid fields for the error message
                  const availableFields = Array.from(validFields).slice(0, 10);
                  const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

                  violations.push({
                    rule: 'entity-field-validation',
                    severity: 'critical',
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    message: `Field "${fieldName}" does not exist on entity "${entityName}". Available fields: ${availableFields.join(', ')}${moreText}`,
                    code: `${paramName}.${fieldName}`,
                  });
                }
              }
            }
          };

          // Walk the callback body to find all member expressions
          traverse(callbackBody, {
            MemberExpression(innerPath: NodePath<t.MemberExpression>) {
              checkNode(innerPath.node);
            },
            noScope: true
          });
        };

        // First pass: identify RunView result variables and their entity names
        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (!t.isIdentifier(path.node.id)) return;
            const varName = path.node.id.name;
            const init = path.node.init;

            if (!init) return;

            // Check for await utilities.rv.RunView(...)
            if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
              const call = init.argument;
              if (t.isMemberExpression(call.callee) &&
                  t.isMemberExpression(call.callee.object) &&
                  t.isIdentifier(call.callee.property) &&
                  call.callee.property.name === 'RunView') {
                // Extract EntityName from arguments
                if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
                  for (const prop of call.arguments[0].properties) {
                    if (t.isObjectProperty(prop) &&
                        t.isIdentifier(prop.key) &&
                        prop.key.name === 'EntityName' &&
                        t.isStringLiteral(prop.value)) {
                      runViewResultVars.set(varName, prop.value.value);
                      break;
                    }
                  }
                }
              }
            }

            // Check for result.Results assignment
            if (t.isMemberExpression(init) &&
                t.isIdentifier(init.object) &&
                t.isIdentifier(init.property) &&
                init.property.name === 'Results') {
              const sourceVar = init.object.name;
              if (runViewResultVars.has(sourceVar)) {
                entityArrayVars.set(varName, runViewResultVars.get(sourceVar)!);
              }
            }
          },

          // Track array element access like results[0] or items.map(item => ...)
          CallExpression(path: NodePath<t.CallExpression>) {
            // Handle array methods like map, forEach, filter
            if (t.isMemberExpression(path.node.callee) &&
                t.isIdentifier(path.node.callee.property)) {
              const methodName = path.node.callee.property.name;
              const arrayMethods = ['map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce'];

              if (arrayMethods.includes(methodName)) {
                // Check if the array is an entity array
                let entityName: string | undefined;

                // Check if calling on a known entity array variable
                if (t.isIdentifier(path.node.callee.object)) {
                  entityName = entityArrayVars.get(path.node.callee.object.name);
                }

                // Check if calling on result.Results
                if (t.isMemberExpression(path.node.callee.object) &&
                    t.isIdentifier(path.node.callee.object.object) &&
                    t.isIdentifier(path.node.callee.object.property) &&
                    path.node.callee.object.property.name === 'Results') {
                  const resultVar = path.node.callee.object.object.name;
                  entityName = runViewResultVars.get(resultVar);
                }

                if (entityName && path.node.arguments.length > 0) {
                  // Get the callback function
                  const callback = path.node.arguments[0];
                  if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
                      callback.params.length > 0) {
                    const param = callback.params[0];
                    if (t.isIdentifier(param)) {
                      // Validate field access within this callback's scope only
                      validateFieldAccessInCallback(callback.body, param.name, entityName);
                    }
                  }
                }
              }
            }
          }
        });

        return violations;
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // query-field-validation
    // Validates that accessed fields exist in the query result definition (from component spec)
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    {
      name: 'query-field-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no data requirements with queries
        if (!componentSpec?.dataRequirements?.queries || componentSpec.dataRequirements.queries.length === 0) {
          return violations;
        }

        // Build a map of query names to their field names from spec
        const queryFieldsMap = new Map<string, Set<string>>();
        const typeContext = new TypeContext(componentSpec);

        for (const queryReq of componentSpec.dataRequirements.queries) {
          const fields = typeContext.getQueryFieldTypes(queryReq.name, queryReq.categoryPath);
          if (fields && fields.size > 0) {
            queryFieldsMap.set(queryReq.name, new Set(fields.keys()));
          }
        }

        // If we couldn't load any query field metadata, skip validation
        if (queryFieldsMap.size === 0) {
          return violations;
        }

        // Track variables that hold RunQuery results and their query names
        const runQueryResultVars = new Map<string, string>(); // varName -> queryName
        // Track variables that hold query row arrays (from .Results)
        const queryArrayVars = new Map<string, string>(); // varName -> queryName

        // Helper function to validate field access within a callback body
        const validateFieldAccessInCallback = (
          callbackBody: t.Node,
          paramName: string,
          queryName: string
        ) => {
          const validFields = queryFieldsMap.get(queryName);
          if (!validFields) return;

          // Simple AST walk to find member expressions within callback body
          const checkNode = (node: t.Node) => {
            if (t.isMemberExpression(node)) {
              // Skip if computed access (e.g., obj[prop])
              if (node.computed) return;

              // Check if accessing a field on the query row variable
              if (t.isIdentifier(node.object) &&
                  node.object.name === paramName &&
                  t.isIdentifier(node.property)) {
                const fieldName = node.property.name;

                if (!validFields.has(fieldName)) {
                  // Get a sample of valid fields for the error message
                  const availableFields = Array.from(validFields).slice(0, 10);
                  const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

                  violations.push({
                    rule: 'query-field-validation',
                    severity: 'critical',
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    message: `Field "${fieldName}" does not exist on query "${queryName}". Available fields: ${availableFields.join(', ')}${moreText}`,
                    code: `${paramName}.${fieldName}`,
                  });
                }
              }
            }
          };

          // Walk the callback body to find all member expressions
          traverse(callbackBody, {
            MemberExpression(innerPath: NodePath<t.MemberExpression>) {
              checkNode(innerPath.node);
            },
            noScope: true
          });
        };

        // First pass: identify RunQuery result variables and their query names
        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (!t.isIdentifier(path.node.id)) return;
            const varName = path.node.id.name;
            const init = path.node.init;

            if (!init) return;

            // Check for await utilities.rq.RunQuery(...)
            if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
              const call = init.argument;
              if (t.isMemberExpression(call.callee) &&
                  t.isMemberExpression(call.callee.object) &&
                  t.isIdentifier(call.callee.property) &&
                  call.callee.property.name === 'RunQuery') {
                // Extract QueryName from arguments
                if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
                  for (const prop of call.arguments[0].properties) {
                    if (t.isObjectProperty(prop) &&
                        t.isIdentifier(prop.key) &&
                        prop.key.name === 'QueryName' &&
                        t.isStringLiteral(prop.value)) {
                      runQueryResultVars.set(varName, prop.value.value);
                      break;
                    }
                  }
                }
              }
            }

            // Check for result.Results assignment
            if (t.isMemberExpression(init) &&
                t.isIdentifier(init.object) &&
                t.isIdentifier(init.property) &&
                init.property.name === 'Results') {
              const sourceVar = init.object.name;
              if (runQueryResultVars.has(sourceVar)) {
                queryArrayVars.set(varName, runQueryResultVars.get(sourceVar)!);
              }
            }
          },

          // Track array element access like results[0] or items.map(item => ...)
          CallExpression(path: NodePath<t.CallExpression>) {
            // Handle array methods like map, forEach, filter
            if (t.isMemberExpression(path.node.callee) &&
                t.isIdentifier(path.node.callee.property)) {
              const methodName = path.node.callee.property.name;
              const arrayMethods = ['map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce'];

              if (arrayMethods.includes(methodName)) {
                // Check if the array is a query array
                let queryName: string | undefined;

                // Check if calling on a known query array variable
                if (t.isIdentifier(path.node.callee.object)) {
                  queryName = queryArrayVars.get(path.node.callee.object.name);
                }

                // Check if calling on result.Results
                if (t.isMemberExpression(path.node.callee.object) &&
                    t.isIdentifier(path.node.callee.object.object) &&
                    t.isIdentifier(path.node.callee.object.property) &&
                    path.node.callee.object.property.name === 'Results') {
                  const resultVar = path.node.callee.object.object.name;
                  queryName = runQueryResultVars.get(resultVar);
                }

                if (queryName && path.node.arguments.length > 0) {
                  // Get the callback function
                  const callback = path.node.arguments[0];
                  if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
                      callback.params.length > 0) {
                    const param = callback.params[0];
                    if (t.isIdentifier(param)) {
                      // Validate field access within this callback's scope only
                      validateFieldAccessInCallback(callback.body, param.name, queryName);
                    }
                  }
                }
              }
            }
          }
        });

        return violations;
      },
    },

    {
      name: 'dependency-prop-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no dependencies
        if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
          return violations;
        }

        // Build a map of dependency components to their full specs
        const dependencySpecs = new Map<string, ComponentSpec>();

        // Process all dependencies (embedded and registry)
        for (const dep of componentSpec.dependencies) {
          if (dep && dep.name) {
            if (dep.location === 'registry') {
              // Try to load from registry
              // check if registry is defined; if not, don't pass it to find component
              let match;
              if (dep.registry) {
                match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace, dep.registry);
              } else {
                match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace);
              }

              if (!match) {
                console.warn(`Dependency component not found in registry: ${dep.name} (${dep.namespace || 'no namespace'})`);
              } else {
                dependencySpecs.set(dep.name, match.spec);
              }
            } else {
              // Embedded dependencies have their spec inline
              dependencySpecs.set(dep.name, dep);
            }
          } else {
            console.warn(`Invalid dependency in component spec: ${dep?.name || 'unknown'}`);
          }
        }

        // Helper function to find closest matching prop name using Levenshtein distance
        function findClosestMatch(target: string, candidates: string[]): string | null {
          if (candidates.length === 0) return null;

          // Simple Levenshtein distance implementation
          function levenshtein(a: string, b: string): number {
            const matrix: number[][] = [];
            for (let i = 0; i <= b.length; i++) {
              matrix[i] = [i];
            }
            for (let j = 0; j <= a.length; j++) {
              matrix[0][j] = j;
            }
            for (let i = 1; i <= b.length; i++) {
              for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                  matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                  matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
              }
            }
            return matrix[b.length][a.length];
          }

          // Find the closest match
          let bestMatch = '';
          let bestDistance = Infinity;

          for (const candidate of candidates) {
            const distance = levenshtein(target.toLowerCase(), candidate.toLowerCase());
            if (distance < bestDistance && distance <= 3) {
              // Max distance of 3 for suggestions
              bestDistance = distance;
              bestMatch = candidate;
            }
          }

          return bestMatch || null;
        }

        // Standard props that are always valid (passed by the runtime)
        const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

        const reactSpecialProps = new Set(['children', 'key', 'ref']);

        // Create type inference engine for variable type checking
        const typeEngine = new TypeInferenceEngine(componentSpec);
        typeEngine.analyze(ast);

        // Helper to get the actual type of an expression (including variables)
        function getExpressionType(expr: t.Expression | t.JSXEmptyExpression): string {
          if (t.isJSXEmptyExpression(expr)) return 'unknown';

          // Use type inference for identifiers and complex expressions
          const inferredType = typeEngine.inferExpressionType(expr);
          return inferredType.type;
        }

        // Traverse JSX to find component usage
        traverse(ast, {
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;

            // Get the element name
            let elementName = '';
            if (t.isJSXIdentifier(openingElement.name)) {
              elementName = openingElement.name.name;
            } else if (t.isJSXMemberExpression(openingElement.name)) {
              // Handle cases like <components.Button> - skip for now
              return;
            }

            // Check if this is one of our dependency components
            const depSpec = dependencySpecs.get(elementName);
            if (!depSpec) return;

            // Collect passed props
            const passedProps = new Set<string>();
            const passedPropNodes = new Map<string, t.JSXAttribute>();

            for (const attr of openingElement.attributes) {
              if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                const propName = attr.name.name;
                passedProps.add(propName);
                passedPropNodes.set(propName, attr);
              }
            }

            // Build lists of valid props and events
            const specPropNames: string[] = depSpec.properties?.map((p) => p.name).filter(Boolean) || [];
            // Convert event names to their callback prop form (e.g., "dataPointClick" -> "onDataPointClick")
            // This follows React's convention where events become "on" + PascalCase event name
            // Note: Some specs may already use the "on" prefix in event names (e.g., "onFilterChange")
            // so we need to handle both conventions
            const specEventNames: string[] = depSpec.events?.map((e) => e.name).filter(Boolean) || [];
            const specEventPropNames: string[] = specEventNames.map((name) => {
              // If the event already starts with "on", use it as-is
              if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
                return name;
              }
              // Otherwise, convert to "onEventName" format
              return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
            });
            const allValidProps = [...specPropNames, ...specEventPropNames];

            // Get required props
            const requiredProps: string[] = [];
            if (depSpec.properties && Array.isArray(depSpec.properties)) {
              for (const prop of depSpec.properties) {
                if (prop && prop.name && prop.required === true) {
                  requiredProps.push(prop.name);
                }
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // 1. CHECK MISSING REQUIRED PROPS
            // ═══════════════════════════════════════════════════════════════
            const missingRequired = requiredProps.filter((prop) => {
              // Special handling for 'children' prop
              if (prop === 'children') {
                // Check if JSX element has children nodes
                const hasChildren =
                  path.node.children &&
                  path.node.children.length > 0 &&
                  path.node.children.some((child) => !t.isJSXText(child) || (t.isJSXText(child) && child.value.trim() !== ''));
                return !passedProps.has(prop) && !hasChildren;
              }
              return !passedProps.has(prop) && !standardProps.has(prop);
            });

            // Separate children warnings from other critical props
            const missingChildren = missingRequired.filter((prop) => prop === 'children');
            const missingOtherProps = missingRequired.filter((prop) => prop !== 'children');

            // Critical violation for non-children required props
            if (missingOtherProps.length > 0) {
              violations.push({
                rule: 'dependency-prop-validation',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `Dependency component "${elementName}" is missing required props: ${missingOtherProps.join(', ')}. These props are marked as required in the component's specification.`,
                code: `<${elementName} ... />`,
              });
            }

            // Medium severity warning for missing children when required
            if (missingChildren.length > 0) {
              violations.push({
                rule: 'dependency-prop-validation',
                severity: 'medium',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `Component "${elementName}" expects children but none were provided. The 'children' prop is marked as required in the component's specification.`,
                code: `<${elementName} ... />`,
              });
            }

            // ═══════════════════════════════════════════════════════════════
            // 2. VALIDATE PROP TYPES (Enhanced with Type Inference)
            // ═══════════════════════════════════════════════════════════════
            if (depSpec.properties && Array.isArray(depSpec.properties)) {
              for (const [propName, attrNode] of passedPropNodes) {
                const propSpec = depSpec.properties.find((p) => p.name === propName);
                if (propSpec && propSpec.type) {
                  const value = attrNode.value;

                  if (value && t.isJSXExpressionContainer(value)) {
                    const expr = value.expression;
                    if (t.isJSXEmptyExpression(expr)) continue;

                    // Use type inference to get the actual type (works for literals AND variables)
                    const actualType = getExpressionType(expr);

                    // Skip if type is unknown (we can't prove it's wrong)
                    if (actualType === 'unknown') continue;

                    // Get the expected type (normalize it)
                    const expectedType = propSpec.type.toLowerCase();

                    // Check type compatibility
                    let isCompatible = true;
                    let normalizedExpected = expectedType;

                    if (expectedType === 'string') {
                      isCompatible = actualType === 'string';
                    } else if (expectedType === 'number' || expectedType === 'int' || expectedType === 'integer' || expectedType === 'float') {
                      isCompatible = actualType === 'number';
                      normalizedExpected = 'number';
                    } else if (expectedType === 'boolean' || expectedType === 'bool') {
                      isCompatible = actualType === 'boolean';
                      normalizedExpected = 'boolean';
                    } else if (expectedType === 'array' || expectedType.startsWith('array<')) {
                      isCompatible = actualType === 'array';
                      normalizedExpected = 'array';
                    } else if (expectedType === 'object') {
                      // Objects, entity-rows, query-rows are all compatible with 'object'
                      isCompatible = ['object', 'entity-row', 'query-row'].includes(actualType);
                    } else if (expectedType === 'function') {
                      isCompatible = actualType === 'function';
                    }

                    if (!isCompatible) {
                      // Generate helpful message with variable name if it's an identifier
                      let valueDesc = actualType;
                      if (t.isIdentifier(expr)) {
                        valueDesc = `variable "${expr.name}" (${actualType})`;
                      }

                      violations.push({
                        rule: 'dependency-prop-validation',
                        severity: 'high',
                        line: attrNode.loc?.start.line || 0,
                        column: attrNode.loc?.start.column || 0,
                        message: `Prop "${propName}" on component "${elementName}" expects type "${normalizedExpected}" but received ${valueDesc}.`,
                        code: `${propName}={<${normalizedExpected} value>}`,
                      });
                    }
                  }
                }
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // 3. CHECK UNKNOWN PROPS (with Levenshtein suggestions)
            // ═══════════════════════════════════════════════════════════════
            for (const passedProp of passedProps) {
              // Skip standard props and React special props
              if (standardProps.has(passedProp) || reactSpecialProps.has(passedProp)) {
                continue;
              }

              // Check if prop is valid (in properties or events)
              if (!allValidProps.includes(passedProp)) {
                // Try to find a close match using Levenshtein distance
                const suggestion = findClosestMatch(passedProp, allValidProps);
                const loc = passedPropNodes.get(passedProp);

                // Build informative message showing props and event handlers separately
                const propsListStr = specPropNames.length > 0 ? `Properties: ${specPropNames.join(', ')}` : '';
                const eventsListStr = specEventPropNames.length > 0 ? `Event handlers: ${specEventPropNames.join(', ')}` : '';
                const expectedListStr = [propsListStr, eventsListStr].filter(Boolean).join('. ') || 'none';

                if (suggestion) {
                  violations.push({
                    rule: 'dependency-prop-validation',
                    severity: 'high',
                    line: loc?.loc?.start.line || openingElement.loc?.start.line || 0,
                    column: loc?.loc?.start.column || openingElement.loc?.start.column || 0,
                    message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. Did you mean '${suggestion}'?`,
                    code: `${passedProp}={...}`,
                  });
                } else {
                  violations.push({
                    rule: 'dependency-prop-validation',
                    severity: 'medium',
                    line: loc?.loc?.start.line || openingElement.loc?.start.line || 0,
                    column: loc?.loc?.start.column || openingElement.loc?.start.column || 0,
                    message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. ${expectedListStr}.`,
                    code: `${passedProp}={...}`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

        {
      name: 'utilities-api-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Define the complete utilities API surface
        const utilitiesAPI: Record<string, { methods: Set<string>; properties: Set<string> }> = {
          rv: { methods: new Set(['RunView', 'RunViews']), properties: new Set() },
          rq: { methods: new Set(['RunQuery']), properties: new Set() },
          md: { methods: new Set(['GetEntityObject']), properties: new Set(['Entities']) },
          ai: { methods: new Set(['ExecutePrompt', 'EmbedText']), properties: new Set(['VectorService']) },
        };

        const validUtilityProps = new Set(Object.keys(utilitiesAPI));

        traverse(ast, {
          // Check for utilities.* property access
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Check for direct utilities.* access
            if (t.isIdentifier(path.node.object) && path.node.object.name === 'utilities') {
              if (t.isIdentifier(path.node.property)) {
                const propName = path.node.property.name;

                if (!validUtilityProps.has(propName)) {
                  violations.push({
                    rule: 'utilities-api-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Invalid utilities property '${propName}'. Valid properties are: rv (RunView), rq (RunQuery), md (Metadata), ai (AI Tools)`,
                    code: `utilities.${propName}`,
                  });
                }
              }
              return; // Don't check deeper for this node
            }

            // Check for utilities.{rv|rq|md|ai}.property access (non-call)
            if (t.isCallExpression(path.parent) && path.parent.callee === path.node) {
              return; // Skip - this is a method call, handled below
            }

            if (
              t.isMemberExpression(path.node.object) &&
              t.isIdentifier(path.node.object.object) &&
              path.node.object.object.name === 'utilities' &&
              t.isIdentifier(path.node.object.property) &&
              t.isIdentifier(path.node.property)
            ) {
              const utilityName = path.node.object.property.name;
              const propName = path.node.property.name;
              const api = utilitiesAPI[utilityName];

              if (api && !api.properties.has(propName) && !api.methods.has(propName)) {
                const validItems = [
                  ...Array.from(api.methods).map((m) => `${m}()`),
                  ...Array.from(api.properties),
                ];
                violations.push({
                  rule: 'utilities-api-validation',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Invalid access '${propName}' on utilities.${utilityName}. Valid: ${validItems.join(', ')}`,
                  code: `utilities.${utilityName}.${propName}`,
                });
              }
            }
          },

          // Check for utilities.{rv|rq|md|ai}.method() calls
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isMemberExpression(path.node.callee)) {
              const callee = path.node.callee;

              if (
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) &&
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property) &&
                t.isIdentifier(callee.property)
              ) {
                const utilityName = callee.object.property.name;
                const methodName = callee.property.name;
                const api = utilitiesAPI[utilityName];

                if (api && !api.methods.has(methodName)) {
                  const validMethods = Array.from(api.methods).join(', ');
                  violations.push({
                    rule: 'utilities-api-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Invalid method '${methodName}' on utilities.${utilityName}. Valid methods: ${validMethods}`,
                    code: `utilities.${utilityName}.${methodName}()`,
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'utilities-no-direct-instantiation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const restrictedClasses = new Map([
          ['RunView', 'utilities.rv'],
          ['RunQuery', 'utilities.rq'],
          ['Metadata', 'utilities.md'],
          ['SimpleVectorService', 'utilities.ai.VectorService'],
        ]);

        traverse(ast, {
          NewExpression(path: NodePath<t.NewExpression>) {
            // Check if instantiating a restricted class
            if (t.isIdentifier(path.node.callee)) {
              const className = path.node.callee.name;

              if (restrictedClasses.has(className)) {
                const utilityPath = restrictedClasses.get(className);
                violations.push({
                  rule: 'utilities-no-direct-instantiation',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Don't instantiate ${className} directly. Use ${utilityPath} instead which is provided in the component's utilities parameter.`,
                  code: `new ${className}()`,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'unsafe-formatting-methods',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec, options?: ComponentExecutionOptions) => {
        const violations: Violation[] = [];

        // Standard props that are always defined (passed by runtime to all components)
        const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

        // Create control flow analyzer for guard detection
        const cfa = new ControlFlowAnalyzer(ast, componentSpec);

        // Create type inference engine for property safety checking
        const typeInferenceEngine = new TypeInferenceEngine(componentSpec);
        // Run analysis synchronously (the async part is not needed for basic inference)
        typeInferenceEngine.analyze(ast);
        const typeContext = typeInferenceEngine.getTypeContext();

        /**
         * Check if an object property is safe to access based on type inference.
         * Returns true if the object is locally defined with known structure and the property exists.
         *
         * Example: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
         */
        const isKnownObjectProperty = (objectName: string, propertyName: string): boolean => {
          const varType = typeContext.getVariableType(objectName);
          if (!varType) {
            return false;
          }

          // Check if it's an object type with known fields
          if (varType.type === 'object' && varType.fields) {
            const fieldInfo = varType.fields.get(propertyName);
            // Property exists in the object definition and is non-null
            return fieldInfo !== undefined && !fieldInfo.nullable;
          }

          return false;
        };

        // Common formatting methods that can fail on null/undefined
        const formattingMethods = new Set([
          // Number methods
          'toFixed',
          'toPrecision',
          'toExponential',
          // Conversion methods
          'toLocaleString',
          'toString',
          // String methods
          'toLowerCase',
          'toUpperCase',
          'trim',
          'split',
          'slice',
          'substring',
          'substr',
          'charAt',
          'charCodeAt',
          'indexOf',
          'lastIndexOf',
          'padStart',
          'padEnd',
          'repeat',
          'replace',
        ]);

        // Helper to check if a field is nullable in entity metadata
        interface FieldNullabilityResult {
          found: boolean;
          nullable: boolean;
          entityName?: string;
          fieldName?: string;
        }

        const checkFieldNullability = (propertyName: string): FieldNullabilityResult => {
          // Step 1: Check if componentSpec has data requirements and utilities are available
          if (!componentSpec?.dataRequirements?.entities || !options?.utilities?.md?.Entities) {
            return { found: false, nullable: false };
          }

          try {
            // Step 2: Iterate through only the entities defined in dataRequirements
            for (const dataReqEntity of componentSpec.dataRequirements.entities) {
              const entityName = dataReqEntity.name; // e.g., "AI Prompt Runs"

              // Step 3: Find this entity in the full metadata (case insensitive)
              // Use proper typing - we know Entities is an array of EntityInfo objects
              const fullEntity = options.utilities.md?.Entities.find((e: EntityInfo) => e.Name && e.Name.toLowerCase() === entityName.toLowerCase());

              if (fullEntity && fullEntity.Fields && Array.isArray(fullEntity.Fields)) {
                // Step 4: Look for the field in this specific entity (case insensitive)
                const field = fullEntity.Fields.find((f: EntityFieldInfo) => f.Name && f.Name.trim().toLowerCase() === propertyName.trim().toLowerCase());

                if (field) {
                  // Field found - check if it's nullable
                  // In MJ, AllowsNull is a boolean property
                  return {
                    found: true,
                    nullable: field.AllowsNull,
                    entityName: fullEntity.Name,
                    fieldName: field.Name,
                  };
                }
              }
            }
          } catch (error) {
            // If there's any error accessing metadata, fail gracefully
            console.warn('Error checking field nullability:', error);
          }

          return { found: false, nullable: false };
        };

        traverse(ast, {
          // Check JSX expressions
          JSXExpressionContainer(path: NodePath<t.JSXExpressionContainer>) {
            const expr = path.node.expression;

            // Look for object.property.method() pattern
            if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property)) {
              const methodName = expr.callee.property.name;

              // Check if it's a formatting method
              if (formattingMethods.has(methodName)) {
                const callee = expr.callee;

                // Check if the object being called on is also a member expression (x.y pattern)
                if (t.isMemberExpression(callee.object) && t.isIdentifier(callee.object.property)) {
                  const propertyName = callee.object.property.name;

                  // Check if optional chaining is already used
                  const hasOptionalChaining = callee.object.optional || callee.optional;

                  // Check if there's a fallback (looking in parent for || or ??)
                  let hasFallback = false;
                  const parent = path.parent;
                  const grandParent = path.parentPath?.parent;

                  // Check if parent is a logical expression with fallback
                  if (grandParent && t.isLogicalExpression(grandParent) && (grandParent.operator === '||' || grandParent.operator === '??')) {
                    hasFallback = true;
                  }

                  // Also check conditional expressions
                  if (grandParent && t.isConditionalExpression(grandParent)) {
                    hasFallback = true;
                  }

                  // Check if inside a null/undefined check using Control Flow Analyzer
                  const hasNullCheck = cfa.isDefinitelyNonNull(callee.object, path);

                  // Skip if accessing properties on standard props (guaranteed to be defined)
                  // Pattern: styles.borders.radius is ALWAYS safe (styles is always provided)
                  let isStandardProp = false;
                  if (t.isIdentifier(callee.object.object)) {
                    const objectName = callee.object.object.name;
                    if (standardProps.has(objectName)) {
                      isStandardProp = true;
                    }
                  }

                  // Skip if the object property is known to be safe via type inference
                  // Pattern: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
                  // This uses TypeInferenceEngine to track object literal assignments
                  let isKnownObjectProperty_flag = false;
                  if (t.isIdentifier(callee.object.object)) {
                    const objectName = callee.object.object.name;
                    isKnownObjectProperty_flag = isKnownObjectProperty(objectName, propertyName);
                  }

                  if (!hasOptionalChaining && !hasFallback && !hasNullCheck && !isStandardProp && !isKnownObjectProperty_flag) {
                    // Check entity metadata for this field
                    const fieldInfo = checkFieldNullability(propertyName);

                    // Determine severity based on metadata
                    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
                    let message = `Unsafe formatting method '${methodName}()' called on '${propertyName}'. Consider using optional chaining.`;

                    if (fieldInfo.found) {
                      if (fieldInfo.nullable) {
                        severity = 'high';
                        message = `Field '${fieldInfo.fieldName}' from entity '${fieldInfo.entityName}' is nullable. Use optional chaining to prevent runtime errors when calling '${methodName}()'.`;
                      } else {
                        // Keep medium severity but note it's non-nullable
                        message = `Field '${fieldInfo.fieldName}' from entity '${fieldInfo.entityName}' appears to be non-nullable, but consider using optional chaining for safety when calling '${methodName}()'.`;
                      }
                    }

                    // Get the object name for better error message
                    let objectName = '';
                    if (t.isIdentifier(callee.object.object)) {
                      objectName = callee.object.object.name;
                    }

                    violations.push({
                      rule: 'unsafe-formatting-methods',
                      severity: severity,
                      line: expr.loc?.start.line || 0,
                      column: expr.loc?.start.column || 0,
                      message: message,
                      code: `${objectName}.${propertyName}.${methodName}() → ${objectName}.${propertyName}?.${methodName}() ?? defaultValue`,
                    });
                  }
                }
              }
            }
          },

          // Also check template literals
          TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
            for (const expr of path.node.expressions) {
              // Look for object.property.method() pattern in template expressions
              if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property)) {
                const methodName = expr.callee.property.name;

                // Check if it's a formatting method
                if (formattingMethods.has(methodName)) {
                  const callee = expr.callee;

                  // Check if the object being called on is also a member expression (x.y pattern)
                  if (t.isMemberExpression(callee.object) && t.isIdentifier(callee.object.property)) {
                    const propertyName = callee.object.property.name;

                    // Check if optional chaining is already used
                    const hasOptionalChaining = callee.object.optional || callee.optional;

                    // Check if inside a null/undefined check using Control Flow Analyzer
                    // Note: For template literals, we need to check the template itself since
                    // the expression doesn't have its own NodePath
                    let hasNullCheck = cfa.isDefinitelyNonNull(callee.object, path) ||
                                      cfa.isProtectedByTernary(callee.object, path);

                    // Skip if accessing properties on standard props (guaranteed to be defined)
                    let isStandardProp = false;
                    if (t.isIdentifier(callee.object.object)) {
                      const objectName = callee.object.object.name;
                      if (standardProps.has(objectName)) {
                        isStandardProp = true;
                      }
                    }

                    // Skip if the object property is known to be safe via type inference
                    // Pattern: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
                    // This uses TypeInferenceEngine to track object literal assignments
                    let isKnownObjectProperty_flag = false;
                    if (t.isIdentifier(callee.object.object)) {
                      const objectName = callee.object.object.name;
                      isKnownObjectProperty_flag = isKnownObjectProperty(objectName, propertyName);
                    }

                    if (!hasOptionalChaining && !hasNullCheck && !isStandardProp && !isKnownObjectProperty_flag) {
                      // Check entity metadata for this field
                      const fieldInfo = checkFieldNullability(propertyName);

                      // Determine severity based on metadata
                      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
                      let message = `Unsafe formatting method '${methodName}()' called on '${propertyName}' in template literal. Consider using optional chaining.`;

                      if (fieldInfo.found) {
                        if (fieldInfo.nullable) {
                          severity = 'high';
                          message = `Field '${propertyName}' is nullable in entity metadata. Use optional chaining to prevent runtime errors when calling '${methodName}()' in template literal.`;
                        } else {
                          // Keep medium severity but note it's non-nullable
                          message = `Field '${propertyName}' appears to be non-nullable, but consider using optional chaining for safety when calling '${methodName}()' in template literal.`;
                        }
                      }

                      // Get the object name for better error message
                      let objectName = '';
                      if (t.isIdentifier(callee.object.object)) {
                        objectName = callee.object.object.name;
                      }

                      violations.push({
                        rule: 'unsafe-formatting-methods',
                        severity: severity,
                        line: expr.loc?.start.line || 0,
                        column: expr.loc?.start.column || 0,
                        message: message,
                        code: `\${${objectName}.${propertyName}.${methodName}()} → \${${objectName}.${propertyName}?.${methodName}() ?? defaultValue}`,
                      });
                    }
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'validate-component-references',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no spec or no dependencies
        if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
          return violations;
        }

        // Build a set of available component names from dependencies
        const availableComponents = new Set<string>();
        for (const dep of componentSpec.dependencies) {
          if (dep.location === 'embedded' && dep.name) {
            availableComponents.add(dep.name);
          }
        }

        // If no embedded dependencies, nothing to validate
        if (availableComponents.size === 0) {
          return violations;
        }

        // Track ALL defined variables in scope (from destructuring, imports, declarations, etc.)
        const definedVariables = new Set<string>();
        const referencedComponents = new Set<string>();

        // First pass: collect all variable declarations and destructuring
        traverse(ast, {
          // Track variable declarations (const x = ...)
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id)) {
              definedVariables.add(path.node.id.name);
            } else if (t.isObjectPattern(path.node.id)) {
              // Track all destructured variables
              const collectDestructured = (pattern: t.ObjectPattern) => {
                for (const prop of pattern.properties) {
                  if (t.isObjectProperty(prop)) {
                    if (t.isIdentifier(prop.value)) {
                      definedVariables.add(prop.value.name);
                    } else if (t.isObjectPattern(prop.value)) {
                      collectDestructured(prop.value);
                    }
                  } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
                    definedVariables.add(prop.argument.name);
                  }
                }
              };
              collectDestructured(path.node.id);
            } else if (t.isArrayPattern(path.node.id)) {
              // Track array destructuring
              for (const elem of path.node.id.elements) {
                if (t.isIdentifier(elem)) {
                  definedVariables.add(elem.name);
                }
              }
            }
          },

          // Track function declarations
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id) {
              definedVariables.add(path.node.id.name);
            }
          },

          // Track class declarations
          ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
            if (path.node.id) {
              definedVariables.add(path.node.id.name);
            }
          },

          // Track function parameters
          Function(path: NodePath<t.Function>) {
            for (const param of path.node.params) {
              if (t.isIdentifier(param)) {
                definedVariables.add(param.name);
              } else if (t.isObjectPattern(param)) {
                // Track destructured parameters
                const collectParams = (pattern: t.ObjectPattern) => {
                  for (const prop of pattern.properties) {
                    if (t.isObjectProperty(prop)) {
                      if (t.isIdentifier(prop.value)) {
                        definedVariables.add(prop.value.name);
                      } else if (t.isObjectPattern(prop.value)) {
                        collectParams(prop.value);
                      }
                    }
                  }
                };
                collectParams(param);
              }
            }
          },
        });

        // Second pass: check component usage
        traverse(ast, {
          // Look for React.createElement calls
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for React.createElement(ComponentName, ...)
            if (
              t.isMemberExpression(callee) &&
              t.isIdentifier(callee.object) &&
              callee.object.name === 'React' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'createElement'
            ) {
              const firstArg = path.node.arguments[0];

              // If first argument is an identifier (component reference)
              if (t.isIdentifier(firstArg)) {
                const componentRef = firstArg.name;

                // Skip HTML elements and React built-ins
                if (!componentRef.match(/^[a-z]/) && componentRef !== 'Fragment') {
                  // Only check if it's supposed to be a component dependency
                  // and it's not defined elsewhere in the code
                  if (availableComponents.has(componentRef)) {
                    referencedComponents.add(componentRef);
                  } else if (!definedVariables.has(componentRef)) {
                    // Only complain if it's not defined anywhere
                    const availableList = Array.from(availableComponents).sort().join(', ');
                    const availableLibs =
                      componentSpec?.libraries
                        ?.map((lib) => lib.globalVariable)
                        .filter(Boolean)
                        .join(', ') || '';

                    let message = `Component "${componentRef}" is not defined. Available component dependencies: ${availableList}`;
                    if (availableLibs) {
                      message += `. Available libraries: ${availableLibs}`;
                    }

                    violations.push({
                      rule: 'validate-component-references',
                      severity: 'critical',
                      line: firstArg.loc?.start.line || 0,
                      column: firstArg.loc?.start.column || 0,
                      message: message,
                      code: `React.createElement(${componentRef}, ...)`,
                    });
                  }
                }
              }
            }
          },

          // Look for JSX elements
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;
            const elementName = openingElement.name;

            if (t.isJSXIdentifier(elementName)) {
              const componentRef = elementName.name;

              // Skip HTML elements and fragments
              if (!componentRef.match(/^[a-z]/) && componentRef !== 'Fragment') {
                // Track if it's a known component dependency
                if (availableComponents.has(componentRef)) {
                  referencedComponents.add(componentRef);
                } else if (!definedVariables.has(componentRef)) {
                  // Only complain if it's not defined anywhere (not from libraries, not from declarations)
                  const availableList = Array.from(availableComponents).sort().join(', ');
                  const availableLibs =
                    componentSpec?.libraries
                      ?.map((lib) => lib.globalVariable)
                      .filter(Boolean)
                      .join(', ') || '';

                  let message = `Component "${componentRef}" is not defined. Available component dependencies: ${availableList}`;
                  if (availableLibs) {
                    message += `. Available libraries: ${availableLibs}`;
                  }

                  violations.push({
                    rule: 'validate-component-references',
                    severity: 'critical',
                    line: elementName.loc?.start.line || 0,
                    column: elementName.loc?.start.column || 0,
                    message: message,
                    code: `<${componentRef} ... />`,
                  });
                }
              }
            }
          },

          // Look for destructuring from components prop specifically
          ObjectPattern(path: NodePath<t.ObjectPattern>) {
            // Check if this is destructuring from a 'components' parameter
            const parent = path.parent;

            // Check if it's a function parameter with components
            if (
              (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent) || t.isArrowFunctionExpression(parent)) &&
              parent.params.includes(path.node)
            ) {
              // Look for components property
              for (const prop of path.node.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components' && t.isObjectPattern(prop.value)) {
                  // Check each destructured component
                  for (const componentProp of prop.value.properties) {
                    if (t.isObjectProperty(componentProp) && t.isIdentifier(componentProp.key)) {
                      const componentRef = componentProp.key.name;
                      referencedComponents.add(componentRef);

                      if (!availableComponents.has(componentRef)) {
                        const availableList = Array.from(availableComponents).sort().join(', ');

                        // Try to find similar names for suggestions
                        const suggestions = Array.from(availableComponents).filter(
                          (name) => name.toLowerCase().includes(componentRef.toLowerCase()) || componentRef.toLowerCase().includes(name.toLowerCase()),
                        );

                        let message = `Destructured component "${componentRef}" is not found in dependencies. Available components: ${availableList}`;
                        if (suggestions.length > 0) {
                          message += `. Did you mean: ${suggestions.join(' or ')}?`;
                        }

                        violations.push({
                          rule: 'validate-component-references',
                          severity: 'critical',
                          line: componentProp.key.loc?.start.line || 0,
                          column: componentProp.key.loc?.start.column || 0,
                          message: message,
                          code: `{ components: { ${componentRef}, ... } }`,
                        });
                      }
                    }
                  }
                }
              }
            }
          },
        });

        // Also warn about unused dependencies
        for (const depName of availableComponents) {
          if (!referencedComponents.has(depName)) {
            violations.push({
              rule: 'validate-component-references',
              severity: 'low',
              line: 1,
              column: 0,
              message: `Component dependency "${depName}" is defined but never used in the code.`,
              code: `dependencies: [..., { name: "${depName}", ... }, ...]`,
            });
          }
        }

        return violations;
      },
    },

    {
      name: 'unused-libraries',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no libraries declared
        if (!componentSpec?.libraries || componentSpec.libraries.length === 0) {
          return violations;
        }

        // Get the function body to search within
        let functionBody: string = '';
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName) {
              functionBody = path.toString();
            }
          },
        });

        // If we couldn't find the function body, use the whole code
        if (!functionBody) {
          functionBody = ast.toString ? ast.toString() : '';
        }

        // Track which libraries are used and unused
        const unusedLibraries: Array<{ name: string; globalVariable: string }> = [];
        const usedLibraries: Array<{ name: string; globalVariable: string }> = [];

        // Check each library for usage
        for (const lib of componentSpec.libraries) {
          const globalVar = lib.globalVariable;
          if (!globalVar) continue;

          // Check for various usage patterns
          const usagePatterns = [
            globalVar + '.', // Direct property access: Chart.defaults
            globalVar + '(', // Direct call: dayjs()
            'new ' + globalVar + '(', // Constructor: new Chart()
            globalVar + '[', // Array/property access: XLSX['utils']
            '= ' + globalVar, // Assignment: const myChart = Chart
            ', ' + globalVar, // In parameter list
            '(' + globalVar, // Start of expression
            '{' + globalVar, // In object literal
            '<' + globalVar, // JSX component
            globalVar + ' ', // Followed by space (various uses)
            'unwrapLibraryComponents(' + globalVar, // unwrapLibraryComponents(antd, ...)
            'unwrapLibraryComponents( ' + globalVar, // unwrapLibraryComponents( antd, ...)
          ];

          const isUsed = usagePatterns.some((pattern) => functionBody.includes(pattern));

          if (isUsed) {
            usedLibraries.push({ name: lib.name, globalVariable: globalVar });
          } else {
            unusedLibraries.push({ name: lib.name, globalVariable: globalVar });
          }
        }

        // Determine severity based on usage patterns
        const totalLibraries = componentSpec.libraries.length;
        const usedCount = usedLibraries.length;

        if (usedCount === 0 && totalLibraries > 0) {
          // CRITICAL: No libraries used at all
          violations.push({
            rule: 'unused-libraries',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `CRITICAL: None of the ${totalLibraries} declared libraries are used. This indicates missing core functionality.`,
            code: `Unused libraries: ${unusedLibraries.map((l) => l.name).join(', ')}`,
          });
        } else if (unusedLibraries.length > 0) {
          // Some libraries unused, severity depends on ratio
          for (const lib of unusedLibraries) {
            const severity = totalLibraries === 1 ? 'high' : 'low';
            const contextMessage =
              totalLibraries === 1
                ? "This is the only declared library and it's not being used."
                : `${usedCount} of ${totalLibraries} libraries are being used. This might be an alternative/optional library.`;

            violations.push({
              rule: 'unused-libraries',
              severity: severity,
              line: 1,
              column: 0,
              message: `Library "${lib.name}" (${lib.globalVariable}) is declared but not used. ${contextMessage}`,
              code: `Consider removing if not needed: { name: "${lib.name}", globalVariable: "${lib.globalVariable}" }`,
            });
          }
        }

        return violations;
      },
    },

    {
      name: 'unused-component-dependencies',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no dependencies declared
        if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
          return violations;
        }

        // Filter to only embedded components
        const embeddedDeps = componentSpec.dependencies.filter((dep) => dep.location === 'embedded' && dep.name);

        if (embeddedDeps.length === 0) {
          return violations;
        }

        // Get the function body to search within
        let functionBody: string = '';
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName) {
              functionBody = path.toString();
            }
          },
        });

        // If we couldn't find the function body, use the whole code
        if (!functionBody) {
          functionBody = ast.toString ? ast.toString() : '';
        }

        // Check each component dependency for usage
        for (const dep of embeddedDeps) {
          const depName = dep.name!;

          // Check for various usage patterns
          // Components can be used directly (if destructured) or via components object
          const usagePatterns = [
            // Direct usage (after destructuring)
            '<' + depName + ' ', // JSX: <AccountList />
            '<' + depName + '>', // JSX: <AccountList>
            '<' + depName + '/', // JSX self-closing: <AccountList/>
            depName + '(', // Direct call: AccountList()
            '= ' + depName, // Assignment: const List = AccountList
            depName + ' ||', // Fallback: AccountList || DefaultComponent
            depName + ' &&', // Conditional: AccountList && ...
            depName + ' ?', // Ternary: AccountList ? ... : ...
            ', ' + depName, // In parameter/array list
            '(' + depName, // Start of expression
            '{' + depName, // In object literal

            // Via components object
            'components.' + depName, // Dot notation: components.AccountList
            "components['" + depName + "']", // Bracket notation single quotes
            'components["' + depName + '"]', // Bracket notation double quotes
            'components[`' + depName + '`]', // Bracket notation template literal
            '<components.' + depName, // JSX via components: <components.AccountList
          ];

          const isUsed = usagePatterns.some((pattern) => functionBody.includes(pattern));

          if (!isUsed) {
            violations.push({
              rule: 'unused-component-dependencies',
              severity: 'low',
              line: 1,
              column: 0,
              message: `Component dependency "${depName}" is declared but never used. Consider removing it if not needed.`,
              code: `Expected usage: <${depName} /> or <components.${depName} />`,
            });
          }
        }

        return violations;
      },
    },

    {
      name: 'component-usage-without-destructuring',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Skip if no dependencies
        if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
          return violations;
        }

        // Track dependency names
        const dependencyNames = new Set(componentSpec.dependencies.map((d) => d.name).filter(Boolean));

        // Track what's been destructured from components prop
        const destructuredComponents = new Set<string>();

        traverse(ast, {
          // Track destructuring from components
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              // Check if destructuring from 'components'
              if (path.node.init.name === 'components') {
                for (const prop of path.node.id.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const name = prop.key.name;
                    if (dependencyNames.has(name)) {
                      destructuredComponents.add(name);
                    }
                  }
                }
              }
            }
          },

          // Also check function parameter destructuring
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components') {
                    // Check for nested destructuring like { components: { A, B } }
                    if (t.isObjectPattern(prop.value)) {
                      for (const innerProp of prop.value.properties) {
                        if (t.isObjectProperty(innerProp) && t.isIdentifier(innerProp.key)) {
                          const name = innerProp.key.name;
                          if (dependencyNames.has(name)) {
                            destructuredComponents.add(name);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },

          // Check JSX usage
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;

            // Check for direct component usage (e.g., <ComponentName>)
            if (t.isJSXIdentifier(openingElement.name)) {
              const name = openingElement.name.name;

              // Check if this is one of our dependencies being used directly
              if (dependencyNames.has(name) && !destructuredComponents.has(name)) {
                violations.push({
                  rule: 'component-usage-without-destructuring',
                  severity: 'critical',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `Component "${name}" used without destructuring. Either destructure it from components prop (const { ${name} } = components;) or use <components.${name} />`,
                  code: `<${name}>`,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'prefer-jsx-syntax',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for React.createElement
            if (
              t.isMemberExpression(callee) &&
              t.isIdentifier(callee.object) &&
              callee.object.name === 'React' &&
              t.isIdentifier(callee.property) &&
              callee.property.name === 'createElement'
            ) {
              violations.push({
                rule: 'prefer-jsx-syntax',
                severity: 'low',
                line: callee.loc?.start.line || 0,
                column: callee.loc?.start.column || 0,
                message: 'Prefer JSX syntax over React.createElement for better readability',
                code: 'React.createElement(...) → <ComponentName ... />',
              });
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'prefer-async-await',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;

            // Check for .then() chains
            if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'then') {
              // Try to get the context of what's being chained
              let context = '';
              if (t.isMemberExpression(callee.object)) {
                context = ' Consider using async/await for cleaner code.';
              }

              violations.push({
                rule: 'prefer-async-await',
                severity: 'low',
                line: callee.property.loc?.start.line || 0,
                column: callee.property.loc?.start.column || 0,
                message: `Prefer async/await over .then() chains for better readability.${context}`,
                code: '.then(result => ...) → const result = await ...',
              });
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'single-function-only',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];

        // Check that the AST body contains exactly one statement and it's a function declaration
        const programBody = ast.program.body;

        // First, check if there's anything other than a single function declaration
        if (programBody.length === 0) {
          violations.push({
            rule: 'single-function-only',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `Component code must contain exactly one function declaration named "${componentName}". No code found.`,
            code: `Add: function ${componentName}({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { ... }`,
          });
          return violations;
        }

        if (programBody.length > 1) {
          // Multiple top-level statements - not allowed
          violations.push({
            rule: 'single-function-only',
            severity: 'critical',
            line: programBody[1].loc?.start.line || 0,
            column: programBody[1].loc?.start.column || 0,
            message: `Component code must contain ONLY a single function declaration. Found ${programBody.length} top-level statements. No code should exist before or after the function.`,
            code: `Remove all code except: function ${componentName}(...) { ... }`,
          });

          // Report each extra statement
          for (let i = 1; i < programBody.length; i++) {
            const stmt = programBody[i];
            let stmtType = 'statement';
            if (t.isVariableDeclaration(stmt)) {
              stmtType = 'variable declaration';
            } else if (t.isFunctionDeclaration(stmt)) {
              stmtType = 'function declaration';
            } else if (t.isExpressionStatement(stmt)) {
              stmtType = 'expression';
            }

            violations.push({
              rule: 'single-function-only',
              severity: 'critical',
              line: stmt.loc?.start.line || 0,
              column: stmt.loc?.start.column || 0,
              message: `Extra ${stmtType} not allowed. Only the component function should exist.`,
              code: '',
            });
          }
        }

        // Check that the single statement is a function declaration (not arrow function or other)
        const firstStatement = programBody[0];

        if (!t.isFunctionDeclaration(firstStatement)) {
          let actualType = 'unknown statement';
          let suggestion = '';

          if (t.isVariableDeclaration(firstStatement)) {
            // Check if it's an arrow function or other variable
            const declarator = firstStatement.declarations[0];
            if (t.isVariableDeclarator(declarator)) {
              if (t.isArrowFunctionExpression(declarator.init) || t.isFunctionExpression(declarator.init)) {
                actualType = 'arrow function or function expression';
                suggestion = `Use function declaration syntax: function ${componentName}(...) { ... }`;
              } else {
                actualType = 'variable declaration';
                suggestion = 'Remove this variable and ensure only the component function exists';
              }
            }
          } else if (t.isExpressionStatement(firstStatement)) {
            actualType = 'expression statement';
            suggestion = 'Remove this expression and add the component function';
          }

          violations.push({
            rule: 'single-function-only',
            severity: 'critical',
            line: firstStatement.loc?.start.line || 0,
            column: firstStatement.loc?.start.column || 0,
            message: `Component must be a function declaration, not ${actualType}. ${suggestion}`,
            code: '',
          });

          // Don't check name if it's not a function declaration
          return violations;
        }

        // Check that the function name matches the component name
        const functionName = firstStatement.id?.name;
        if (functionName !== componentName) {
          violations.push({
            rule: 'single-function-only',
            severity: 'critical',
            line: firstStatement.loc?.start.line || 0,
            column: firstStatement.loc?.start.column || 0,
            message: `Component function name "${functionName}" does not match component name "${componentName}". The function must be named exactly as specified.`,
            code: `Rename to: function ${componentName}(...)`,
          });
        }

        // Additional check: look for any code before the function that might have been missed
        // (e.g., leading variable declarations that destructure from React)
        if (programBody.length === 1 && t.isFunctionDeclaration(firstStatement)) {
          // Use traverse to find any problematic patterns inside
          traverse(ast, {
            Program(path: NodePath<t.Program>) {
              // Check if there are any directives or other non-obvious code
              if (path.node.directives && path.node.directives.length > 0) {
                violations.push({
                  rule: 'single-function-only',
                  severity: 'high',
                  line: 1,
                  column: 0,
                  message: 'Component should not have directives like "use strict". These are added automatically.',
                  code: '',
                });
              }
            },
          });
        }

        return violations;
      },
    },

    {
      name: 'styles-invalid-path',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const analyzer = ComponentLinter.getStylesAnalyzer();

        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Build the complete property chain first
            let propertyChain: string[] = [];
            let current: any = path.node;

            // Walk up from the deepest member expression to build the full chain
            while (t.isMemberExpression(current)) {
              if (t.isIdentifier(current.property)) {
                propertyChain.unshift(current.property.name);
              }

              if (t.isIdentifier(current.object)) {
                propertyChain.unshift(current.object.name);
                break;
              }

              current = current.object;
            }

            // Only process if this is a styles access
            if (propertyChain[0] === 'styles') {
              // Validate the path
              if (!analyzer.isValidPath(propertyChain)) {
                const suggestions = analyzer.getSuggestionsForPath(propertyChain);
                const accessPath = propertyChain.join('.');

                let message = `Invalid styles property path: "${accessPath}"`;

                if (suggestions.didYouMean) {
                  message += `\n\nDid you mean: ${suggestions.didYouMean}?`;
                }

                if (suggestions.correctPaths.length > 0) {
                  message += `\n\nThe property "${propertyChain[propertyChain.length - 1]}" exists at:`;
                  suggestions.correctPaths.forEach((p: string) => {
                    message += `\n  - ${p}`;
                  });
                }

                if (suggestions.availableAtParent.length > 0) {
                  const parentPath = propertyChain.slice(0, -1).join('.');
                  message += `\n\nAvailable properties at ${parentPath}:`;
                  message += `\n  ${suggestions.availableAtParent.slice(0, 5).join(', ')}`;
                  if (suggestions.availableAtParent.length > 5) {
                    message += ` (and ${suggestions.availableAtParent.length - 5} more)`;
                  }
                }

                // Get a contextual default value
                const defaultValue = analyzer.getDefaultValueForPath(propertyChain);
                message += `\n\nSuggested fix with safe access:\n  ${accessPath.replace(/\./g, '?.')} || ${defaultValue}`;

                violations.push({
                  rule: 'styles-invalid-path',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: message,
                  code: accessPath,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'styles-unsafe-access',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const analyzer = ComponentLinter.getStylesAnalyzer();

        // Standard props that are always defined with guaranteed structure
        // The ComponentStyles interface guarantees all required properties exist
        // So we don't need to check for optional chaining on the styles object itself
        const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Build the complete property chain first
            let propertyChain: string[] = [];
            let current: any = path.node;
            let hasOptionalChaining = path.node.optional || false;

            // Walk up from the deepest member expression to build the full chain
            while (t.isMemberExpression(current)) {
              if (current.optional) {
                hasOptionalChaining = true;
              }
              if (t.isIdentifier(current.property)) {
                propertyChain.unshift(current.property.name);
              }

              if (t.isIdentifier(current.object)) {
                propertyChain.unshift(current.object.name);
                break;
              }

              current = current.object;
            }

            // Only process if this is a styles access
            if (propertyChain[0] === 'styles') {
              // Skip styles access entirely - ComponentStyles interface guarantees structure
              // styles is a standard prop with a fixed interface, all required properties exist
              // This prevents false positives for patterns like: styles.borders.radius
              // The ComponentStyles interface (runtime-types.ts) defines all required properties
              // including colors, spacing, typography, borders, etc. as non-optional
              return;
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'runquery-runview-spread-operator',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Track variables that hold RunView/RunQuery results
        const resultVariables = new Map<
          string,
          {
            line: number;
            column: number;
            method: 'RunView' | 'RunViews' | 'RunQuery';
            varName: string;
          }
        >();

        // First pass: identify all RunView/RunQuery calls
        traverse(ast, {
          AwaitExpression(path: NodePath<t.AwaitExpression>) {
            const callExpr = path.node.argument;

            if (t.isCallExpression(callExpr) && t.isMemberExpression(callExpr.callee)) {
              const callee = callExpr.callee;

              if (
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) &&
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property)
              ) {
                const subObject = callee.object.property.name;
                const method = t.isIdentifier(callee.property) ? callee.property.name : '';

                let methodType: 'RunView' | 'RunViews' | 'RunQuery' | null = null;
                if (subObject === 'rv' && (method === 'RunView' || method === 'RunViews')) {
                  methodType = method as 'RunView' | 'RunViews';
                } else if (subObject === 'rq' && method === 'RunQuery') {
                  methodType = 'RunQuery';
                }

                if (methodType) {
                  const parent = path.parent;

                  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
                    resultVariables.set(parent.id.name, {
                      line: parent.id.loc?.start.line || 0,
                      column: parent.id.loc?.start.column || 0,
                      method: methodType,
                      varName: parent.id.name,
                    });
                  }
                }
              }
            }
          },
        });

        // Second pass: check for spread operator usage
        traverse(ast, {
          SpreadElement(path: NodePath<t.SpreadElement>) {
            if (t.isIdentifier(path.node.argument)) {
              const varName = path.node.argument.name;

              if (resultVariables.has(varName)) {
                const resultInfo = resultVariables.get(varName)!;

                violations.push({
                  rule: 'runquery-runview-spread-operator',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Cannot use spread operator on ${resultInfo.method} result object. Use ...${varName}.Results to spread the data array.

Correct pattern:
  const allData = [...existingData, ...${varName}.Results];
  
  // Or with null safety:
  const allData = [...existingData, ...(${varName}.Results || [])];`,
                  code: `...${varName}`,
                });
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'no-react-destructuring',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Check for destructuring from React
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init) && path.node.init.name === 'React') {
              // Get the destructured properties
              const destructuredProps = path.node.id.properties
                .filter((prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key))
                .map((prop) => (prop as t.ObjectProperty).key as t.Identifier)
                .map((key) => key.name);

              violations.push({
                rule: 'no-react-destructuring',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Cannot destructure from React. The hooks (${destructuredProps.join(', ')}) are already available as global functions in the React runtime.`,
                code: path.toString().substring(0, 100),
                suggestion: {
                  text: `Remove the destructuring statement. React hooks like ${destructuredProps.join(', ')} are already available globally and don't need to be imported or destructured.`,
                  example: `// Remove this line entirely:
// const { ${destructuredProps.join(', ')} } = React;

// Just use the hooks directly:
const [state, setState] = useState(initialValue);`,
                },
              });
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'callbacks-usage-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Define the allowed methods on ComponentCallbacks interface
        const allowedCallbackMethods = new Set(['OpenEntityRecord', 'RegisterMethod', 'CreateSimpleNotification']);

        // Build list of component's event names from spec
        const componentEvents = new Set<string>();
        if (componentSpec?.events) {
          for (const event of componentSpec.events) {
            if (event.name) {
              componentEvents.add(event.name);
            }
          }
        }

        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Check for callbacks.something access
            if (t.isIdentifier(path.node.object) && path.node.object.name === 'callbacks') {
              if (t.isIdentifier(path.node.property)) {
                const methodName = path.node.property.name;

                // IMPORTANT: Check if it's a known runtime callback FIRST
                // This prevents false positives when components mistakenly declare
                // runtime callbacks as events in their spec
                if (allowedCallbackMethods.has(methodName)) {
                  // This is a valid runtime callback - allow it
                  return;
                }

                // Check if it's trying to access an event
                if (componentEvents.has(methodName)) {
                  violations.push({
                    rule: 'callbacks-usage-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Event "${methodName}" should not be accessed from callbacks. Events are passed as direct props to the component. Use the prop directly: ${methodName}`,
                    suggestion: {
                      text: `Events defined in the component spec are passed as direct props, not through callbacks. Access the event directly as a prop.`,
                      example: `// ❌ WRONG - Accessing event from callbacks
const { ${methodName} } = callbacks || {};
callbacks?.${methodName}?.(data);

// ✅ CORRECT - Event is a direct prop
// In the component props destructuring:
function MyComponent({ ..., ${methodName} }) {
  // Use with null checking:
  if (${methodName}) {
    ${methodName}(data);
  }
}`,
                    },
                  });
                } else {
                  // It's not a runtime callback or an event - it's invalid
                  violations.push({
                    rule: 'callbacks-usage-validation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Invalid callback method "${methodName}". The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                    suggestion: {
                      text: `The callbacks prop is reserved for specific MemberJunction framework methods. Custom events should be defined in the component spec's events array and passed as props.`,
                      example: `// Allowed callbacks methods:
callbacks?.OpenEntityRecord?.(entityName, key);
callbacks?.RegisterMethod?.(methodName, handler);
callbacks?.CreateSimpleNotification?.(message, style, hideAfter);

// For custom events, define them in the spec and use as props:
function MyComponent({ onCustomEvent }) {
  if (onCustomEvent) {
    onCustomEvent(data);
  }
}`,
                    },
                  });
                }
              }
            }
          },

          // Also check for destructuring from callbacks
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init) && path.node.init.name === 'callbacks') {
              // Check each destructured property
              for (const prop of path.node.id.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const methodName = prop.key.name;

                  // IMPORTANT: Check if it's a known runtime callback FIRST
                  if (allowedCallbackMethods.has(methodName)) {
                    // This is a valid runtime callback - allow it
                    continue;
                  }

                  if (componentEvents.has(methodName)) {
                    violations.push({
                      rule: 'callbacks-usage-validation',
                      severity: 'critical',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Event "${methodName}" should not be destructured from callbacks. Events are passed as direct props to the component.`,
                      suggestion: {
                        text: `Events should be destructured from the component props, not from callbacks.`,
                        example: `// ❌ WRONG
const { ${methodName} } = callbacks || {};

// ✅ CORRECT
function MyComponent({ utilities, styles, callbacks, ${methodName} }) {
  // ${methodName} is now available as a prop
}`,
                      },
                    });
                  } else if (!allowedCallbackMethods.has(methodName)) {
                    violations.push({
                      rule: 'callbacks-usage-validation',
                      severity: 'critical',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Invalid callback method "${methodName}" being destructured. The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                    });
                  }
                }
              }
            }

            // Also check for: const { something } = callbacks || {}
            if (
              t.isObjectPattern(path.node.id) &&
              t.isLogicalExpression(path.node.init) &&
              path.node.init.operator === '||' &&
              t.isIdentifier(path.node.init.left) &&
              path.node.init.left.name === 'callbacks'
            ) {
              // Check each destructured property
              for (const prop of path.node.id.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const methodName = prop.key.name;

                  if (componentEvents.has(methodName)) {
                    violations.push({
                      rule: 'callbacks-usage-validation',
                      severity: 'critical',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Event "${methodName}" should not be destructured from callbacks. Events are passed as direct props to the component.`,
                      suggestion: {
                        text: `Events should be destructured from the component props, not from callbacks.`,
                        example: `// ❌ WRONG
const { ${methodName} } = callbacks || {};

// ✅ CORRECT
function MyComponent({ utilities, styles, callbacks, ${methodName} }) {
  // ${methodName} is now available as a prop
}`,
                      },
                    });
                  } else if (!allowedCallbackMethods.has(methodName)) {
                    violations.push({
                      rule: 'callbacks-usage-validation',
                      severity: 'critical',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Invalid callback method "${methodName}" being destructured. The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                    });
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'event-invocation-pattern',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Build list of component's event names from spec
        const componentEvents = new Set<string>();
        if (componentSpec?.events) {
          for (const event of componentSpec.events) {
            if (event.name) {
              componentEvents.add(event.name);
            }
          }
        }

        // If no events defined, skip this rule
        if (componentEvents.size === 0) {
          return violations;
        }

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check if calling an event without null checking
            if (t.isIdentifier(path.node.callee)) {
              const eventName = path.node.callee.name;
              if (componentEvents.has(eventName)) {
                // Check if this call is inside a conditional that checks for the event
                let hasNullCheck = false;
                let currentPath: NodePath<t.Node> | null = path.parentPath;

                // Walk up the tree to see if we're inside an if statement that checks this event
                while (currentPath && !hasNullCheck) {
                  if (t.isIfStatement(currentPath.node)) {
                    const test = currentPath.node.test;
                    // Check if the test checks for the event (simple cases)
                    if (t.isIdentifier(test) && test.name === eventName) {
                      hasNullCheck = true;
                    } else if (t.isLogicalExpression(test) && test.operator === '&&') {
                      // Check for patterns like: eventName && ...
                      if (t.isIdentifier(test.left) && test.left.name === eventName) {
                        hasNullCheck = true;
                      }
                    }
                  } else if (t.isLogicalExpression(currentPath.node) && currentPath.node.operator === '&&') {
                    // Check for inline conditional: eventName && eventName()
                    if (t.isIdentifier(currentPath.node.left) && currentPath.node.left.name === eventName) {
                      hasNullCheck = true;
                    }
                  } else if (t.isConditionalExpression(currentPath.node)) {
                    // Check for ternary: eventName ? eventName() : null
                    if (t.isIdentifier(currentPath.node.test) && currentPath.node.test.name === eventName) {
                      hasNullCheck = true;
                    }
                  }
                  currentPath = currentPath.parentPath || null;
                }

                if (!hasNullCheck) {
                  violations.push({
                    rule: 'event-invocation-pattern',
                    severity: 'medium',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Event "${eventName}" is being invoked without null-checking. Events are optional props and should be checked before invocation.`,
                    suggestion: {
                      text: `Always check that an event prop exists before invoking it, as events are optional.`,
                      example: `// ❌ WRONG - No null check
${eventName}(data);

// ✅ CORRECT - With null check
if (${eventName}) {
  ${eventName}(data);
}

// ✅ ALSO CORRECT - Inline check
${eventName} && ${eventName}(data);

// ✅ ALSO CORRECT - Optional chaining
${eventName}?.(data);`,
                    },
                  });
                }
              }
            }
          },

          // Check for optional chaining on events (this is good!)
          OptionalCallExpression(path: NodePath<t.OptionalCallExpression>) {
            if (t.isIdentifier(path.node.callee)) {
              const eventName = path.node.callee.name;
              if (componentEvents.has(eventName)) {
                // This is actually the correct pattern, no violation
                return;
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'callbacks-passthrough-only',
      appliesTo: 'all',
      test: (ast: t.File, _componentName: string, _componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          JSXAttribute(path: NodePath<t.JSXAttribute>) {
            // Check if this is a callbacks prop being passed to a component
            if (t.isJSXIdentifier(path.node.name) && path.node.name.name === 'callbacks') {
              const value = path.node.value;

              // Check if value is a JSXExpressionContainer
              if (t.isJSXExpressionContainer(value)) {
                const expr = value.expression;

                // Valid patterns:
                // - callbacks={callbacks}
                // - callbacks={props.callbacks}
                // - callbacks={restProps.callbacks}
                const isValidPassthrough =
                  (t.isIdentifier(expr) && expr.name === 'callbacks') ||
                  (t.isMemberExpression(expr) && t.isIdentifier(expr.property) && expr.property.name === 'callbacks');

                if (!isValidPassthrough) {
                  // Check for spreading pattern: {...callbacks, ...}
                  if (t.isObjectExpression(expr)) {
                    const hasSpread = expr.properties.some(
                      (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks',
                    );

                    if (hasSpread) {
                      // Found spreading callbacks with additional properties
                      const addedProps = expr.properties
                        .filter((prop) => !t.isSpreadElement(prop) && t.isObjectProperty(prop))
                        .map((prop) => {
                          if (t.isObjectProperty(prop)) {
                            if (t.isIdentifier(prop.key)) {
                              return prop.key.name;
                            } else if (t.isStringLiteral(prop.key)) {
                              return prop.key.value;
                            }
                          }
                          return 'unknown';
                        });

                      violations.push({
                        rule: 'callbacks-passthrough-only',
                        severity: 'critical',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `Callbacks must be passed through unchanged. Found spreading with additional properties: ${addedProps.join(', ')}. Component events should be passed as direct props, not added to callbacks.`,
                        suggestion: {
                          text: `The callbacks prop should only contain OpenEntityRecord and RegisterMethod. Pass component events as separate props.`,
                          example: `// ❌ WRONG - Modifying callbacks
<ChildComponent 
  callbacks={{ ...callbacks, onOpen: handleOpen }}
/>

// ✅ CORRECT - Pass callbacks unchanged, events as props
<ChildComponent 
  callbacks={callbacks}
  onOpen={handleOpen}
/>`,
                        },
                      });
                    } else if (expr.properties.length > 0) {
                      // Creating new callbacks object
                      violations.push({
                        rule: 'callbacks-passthrough-only',
                        severity: 'critical',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `Callbacks must be passed through unchanged. Do not create new callback objects. Pass the callbacks prop directly.`,
                        suggestion: {
                          text: `Pass callbacks directly without modification.`,
                          example: `// ❌ WRONG - Creating new callbacks object
<ChildComponent 
  callbacks={{ OpenEntityRecord: customHandler }}
/>

// ✅ CORRECT - Pass callbacks unchanged
<ChildComponent 
  callbacks={callbacks}
/>`,
                        },
                      });
                    }
                  }
                  // Check for conditional expressions
                  else if (t.isConditionalExpression(expr) || t.isLogicalExpression(expr)) {
                    violations.push({
                      rule: 'callbacks-passthrough-only',
                      severity: 'medium',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Callbacks should be passed through directly without conditional logic. Consider handling the condition at a higher level.`,
                      suggestion: {
                        text: `Pass callbacks directly or handle conditions in parent component.`,
                        example: `// ⚠️ AVOID - Conditional callbacks
<ChildComponent 
  callbacks={someCondition ? callbacks : undefined}
/>

// ✅ BETTER - Pass callbacks directly
<ChildComponent 
  callbacks={callbacks}
/>`,
                      },
                    });
                  }
                  // Check for function calls or other expressions
                  else if (!t.isIdentifier(expr) && !t.isMemberExpression(expr)) {
                    violations.push({
                      rule: 'callbacks-passthrough-only',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Callbacks must be passed through unchanged. Found complex expression instead of direct passthrough.`,
                      suggestion: {
                        text: `Pass the callbacks prop directly without modification.`,
                        example: `// ✅ CORRECT
<ChildComponent callbacks={callbacks} />`,
                      },
                    });
                  }
                }
              }
            }
          },

          // Also check for Object.assign or spread operations on callbacks
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for Object.assign(callbacks, ...)
            if (
              t.isMemberExpression(path.node.callee) &&
              t.isIdentifier(path.node.callee.object) &&
              path.node.callee.object.name === 'Object' &&
              t.isIdentifier(path.node.callee.property) &&
              path.node.callee.property.name === 'assign'
            ) {
              const args = path.node.arguments;
              if (args.length > 0) {
                // Check if callbacks is being modified
                const hasCallbacks = args.some((arg) => t.isIdentifier(arg) && arg.name === 'callbacks');

                if (hasCallbacks) {
                  violations.push({
                    rule: 'callbacks-passthrough-only',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Do not modify callbacks with Object.assign. Callbacks should be passed through unchanged.`,
                    suggestion: {
                      text: `Pass callbacks directly and use separate props for component events.`,
                      example: `// ❌ WRONG
const modifiedCallbacks = Object.assign({}, callbacks, { onOpen: handler });

// ✅ CORRECT - Keep callbacks separate from events
<Component callbacks={callbacks} onOpen={handler} />`,
                    },
                  });
                }
              }
            }
          },

          // Check for variable assignments that modify callbacks
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isObjectExpression(path.node.init)) {
              const hasCallbacksSpread = path.node.init.properties.some(
                (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks',
              );

              if (hasCallbacksSpread) {
                const hasAdditionalProps = path.node.init.properties.some((prop) => !t.isSpreadElement(prop));

                if (hasAdditionalProps) {
                  violations.push({
                    rule: 'callbacks-passthrough-only',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Do not create modified copies of callbacks. Pass callbacks unchanged and use separate props for events.`,
                    suggestion: {
                      text: `Keep callbacks immutable and pass component events as separate props.`,
                      example: `// ❌ WRONG
const extendedCallbacks = { ...callbacks, onCustomEvent: handler };

// ✅ CORRECT - Keep them separate
// Pass to child component:
<Component callbacks={callbacks} onCustomEvent={handler} />`,
                    },
                  });
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'callback-parameter-validation',
      appliesTo: 'all',
      test: (ast: t.File, _componentName: string, _componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for callbacks?.method() calls
            if (t.isOptionalMemberExpression(path.node.callee) || t.isMemberExpression(path.node.callee)) {
              const callee = path.node.callee;

              // Check if it's callbacks.something or callbacks?.something
              if (
                (t.isIdentifier(callee.object) && callee.object.name === 'callbacks') ||
                (t.isOptionalMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'callbacks')
              ) {
                if (t.isIdentifier(callee.property)) {
                  const methodName = callee.property.name;
                  const args = path.node.arguments;

                  // Validate parameters based on the method
                  if (methodName === 'OpenEntityRecord') {
                    // OpenEntityRecord(entityName: string, key: any)
                    if (args.length < 2) {
                      violations.push({
                        rule: 'callback-parameter-validation',
                        severity: 'high',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `OpenEntityRecord requires 2 parameters (entityName, key), but ${args.length} provided`,
                        suggestion: {
                          text: `OpenEntityRecord expects an entity name and a key parameter.`,
                          example: `callbacks?.OpenEntityRecord?.(entityName, recordKey);`,
                        },
                      });
                    }
                  } else if (methodName === 'RegisterMethod') {
                    // RegisterMethod(methodName: string, handler: Function)
                    if (args.length < 2) {
                      violations.push({
                        rule: 'callback-parameter-validation',
                        severity: 'high',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `RegisterMethod requires 2 parameters (methodName, handler), but ${args.length} provided`,
                        suggestion: {
                          text: `RegisterMethod expects a method name and a handler function.`,
                          example: `callbacks?.RegisterMethod?.('myMethod', myHandler);`,
                        },
                      });
                    }
                  } else if (methodName === 'CreateSimpleNotification') {
                    // CreateSimpleNotification(message: string, style?: NotificationStyle, hideAfter?: number)
                    if (args.length < 1) {
                      violations.push({
                        rule: 'callback-parameter-validation',
                        severity: 'high',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `CreateSimpleNotification requires at least 1 parameter (message), but ${args.length} provided`,
                        suggestion: {
                          text: `CreateSimpleNotification expects a message and optional style and hideAfter parameters.`,
                          example: `callbacks?.CreateSimpleNotification?.('Success!', 'success', 3000);`,
                        },
                      });
                    } else if (args.length >= 2) {
                      // Validate style parameter (second argument)
                      const styleArg = args[1];
                      if (t.isStringLiteral(styleArg)) {
                        const validStyles = ['none', 'success', 'error', 'warning', 'info'];
                        if (!validStyles.includes(styleArg.value)) {
                          violations.push({
                            rule: 'callback-parameter-validation',
                            severity: 'medium',
                            line: styleArg.loc?.start.line || 0,
                            column: styleArg.loc?.start.column || 0,
                            message: `Invalid notification style "${styleArg.value}". Must be one of: ${validStyles.join(', ')}`,
                            suggestion: {
                              text: `Use one of the valid notification styles.`,
                              example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000);`,
                            },
                          });
                        }
                      }
                    }

                    // Validate hideAfter parameter (third argument) if provided
                    if (args.length >= 3) {
                      const hideAfterArg = args[2];
                      if (t.isNumericLiteral(hideAfterArg) && hideAfterArg.value < 0) {
                        violations.push({
                          rule: 'callback-parameter-validation',
                          severity: 'low',
                          line: hideAfterArg.loc?.start.line || 0,
                          column: hideAfterArg.loc?.start.column || 0,
                          message: `hideAfter parameter should be a positive number (milliseconds)`,
                          suggestion: {
                            text: `Use a positive number for auto-hide duration in milliseconds.`,
                            example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000); // Hide after 3 seconds`,
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          },
        });

        return violations;
      },
    },

    {
      name: 'required-queries-not-called',
      appliesTo: 'root', // Only apply to root components
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Check the mode - only enforce for 'queries' or 'hybrid' mode
        const mode = componentSpec?.dataRequirements?.mode;
        if (mode !== 'queries' && mode !== 'hybrid') {
          // Mode is not 'queries' or 'hybrid', so this rule doesn't apply
          return violations;
        }

        // Check if there are any queries defined in dataRequirements
        const hasQueries = componentSpec?.dataRequirements?.queries && componentSpec.dataRequirements.queries.length > 0;

        if (!hasQueries) {
          // No queries defined, so no violation
          return violations;
        }

        // Track whether RunQuery is called anywhere
        let hasRunQueryCall = false;
        const queryNames = componentSpec!.dataRequirements!.queries!.map((q) => q.name).filter(Boolean);

        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for utilities.rq.RunQuery pattern
            if (
              t.isMemberExpression(path.node.callee) &&
              t.isMemberExpression(path.node.callee.object) &&
              t.isIdentifier(path.node.callee.object.object) &&
              path.node.callee.object.object.name === 'utilities' &&
              t.isIdentifier(path.node.callee.object.property) &&
              path.node.callee.object.property.name === 'rq' &&
              t.isIdentifier(path.node.callee.property) &&
              path.node.callee.property.name === 'RunQuery'
            ) {
              hasRunQueryCall = true;
            }

            // Also check for destructured pattern: rq.RunQuery
            if (
              t.isMemberExpression(path.node.callee) &&
              t.isIdentifier(path.node.callee.object) &&
              path.node.callee.object.name === 'rq' &&
              t.isIdentifier(path.node.callee.property) &&
              path.node.callee.property.name === 'RunQuery'
            ) {
              hasRunQueryCall = true;
            }
          },
        });

        // If queries are defined but RunQuery is never called, that's a critical violation
        if (!hasRunQueryCall) {
          violations.push({
            rule: 'required-queries-not-called',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `Component has ${queryNames.length} defined ${queryNames.length === 1 ? 'query' : 'queries'} in dataRequirements (mode: '${mode}') but never calls RunQuery. Queries defined: ${queryNames.join(', ')}`,
            suggestion: {
              text: `When dataRequirements.mode is '${mode}' and includes queries, you must use utilities.rq.RunQuery to execute them, not RunView.`,
              example: `// Your dataRequirements defines these queries: ${queryNames.join(', ')}
// Mode is set to: '${mode}'

// ❌ WRONG - Using RunView for a query:
const result = await utilities.rv.RunView({
  EntityName: '${queryNames[0] || 'QueryName'}'
});

// ✅ CORRECT - Using RunQuery for queries:
const result = await utilities.rq.RunQuery({
  QueryName: '${queryNames[0] || 'QueryName'}'
});

// Key differences:
// - RunView: For entity-based data access (uses EntityName)
// - RunQuery: For pre-defined queries (uses QueryName)
// - dataRequirements.mode: '${mode}' requires RunQuery for queries`,
            },
          });
        }

        return violations;
      },
    },

    {
      name: 'validate-component-props',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];

        // Only validate if component spec exists
        if (!componentSpec || !componentSpec.dependencies || componentSpec.dependencies.length === 0) {
          return violations;
        }

        // Build a map of dependency components to their full specs
        // Pattern from dependency-prop-validation rule
        const dependencySpecs = new Map<string, ComponentSpec>();

        for (const dep of componentSpec.dependencies) {
          if (dep && typeof dep === 'object' && dep.name) {
            if (dep.location === 'registry') {
              let match;
              if (dep.registry) {
                match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace, dep.registry);
              } else {
                match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace);
              }

              if (match) {
                dependencySpecs.set(dep.name, match.spec);
              }
            } else {
              // Embedded dependencies have their spec inline
              dependencySpecs.set(dep.name, dep);
            }
          }
        }

        // Build validation context helpers from parent spec's dataRequirements
        const getEntityFields = (entityName: string) => {
          if (!componentSpec.dataRequirements?.entities) return [];
          const entity = componentSpec.dataRequirements.entities.find(e => e.name === entityName);
          if (!entity) return [];

          // Prefer fieldMetadata if available (provides type info, allowsNull, isPrimaryKey, etc.)
          if (entity.fieldMetadata && Array.isArray(entity.fieldMetadata) && entity.fieldMetadata.length > 0) {
            return entity.fieldMetadata.map((f: any) => ({
              name: f.name,
              type: f.type || 'string',
              required: !f.allowsNull,
              allowedValues: f.possibleValues || undefined,
              isPrimaryKey: f.isPrimaryKey || false,
            }));
          }

          // Fallback: Collect all field names from display/filter/sort arrays
          const allFieldNames = new Set<string>();
          if (entity.displayFields) entity.displayFields.forEach((f: string) => allFieldNames.add(f));
          if (entity.filterFields) entity.filterFields.forEach((f: string) => allFieldNames.add(f));
          if (entity.sortFields) entity.sortFields.forEach((f: string) => allFieldNames.add(f));

          // Convert to EntityFieldInfo format (we don't have type info from field name lists)
          return Array.from(allFieldNames).map(name => ({
            name,
            type: 'string', // Unknown type from field name lists
            required: false,
            allowedValues: undefined,
          }));
        };

        const getEntityFieldType = (entityName: string, fieldName: string) => {
          const fields = getEntityFields(entityName);
          const field = fields.find((f: any) => f.name === fieldName);
          return field?.type || null;
        };

        const hasEntity = (entityName: string) => {
          if (!componentSpec.dataRequirements?.entities) return false;
          return componentSpec.dataRequirements.entities.some(e => e.name === entityName);
        };

        // GENERIC validation for ALL components with constraints
        traverse(ast, {
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;
            let elementName = '';

            if (t.isJSXIdentifier(openingElement.name)) {
              elementName = openingElement.name.name;
            } else if (t.isJSXMemberExpression(openingElement.name)) {
              // Handle cases like <components.EntityDataGrid> - skip for now
              return;
            }

            // Get the spec for this dependency component
            const depSpec = dependencySpecs.get(elementName);
            if (!depSpec || !depSpec.properties) return;

            // Check if this component has any properties with constraints
            const hasConstraints = depSpec.properties.some(p => p.constraints && p.constraints.length > 0);
            if (!hasConstraints) return;

            // Extract all props into a map for sibling prop lookups
            const siblingProps = new Map<string, any>();
            for (const attr of openingElement.attributes) {
              if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                const extractedValue = PropValueExtractor.extract(attr);
                siblingProps.set(attr.name.name, extractedValue);
              }
            }

            // GENERIC: Iterate through all properties with constraints
            for (const property of depSpec.properties) {
              if (!property.constraints || property.constraints.length === 0) {
                continue;
              }

              // Find the JSX attribute for this property
              const propAttr = openingElement.attributes.find(
                (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === property.name
              );

              if (!propAttr || !t.isJSXAttribute(propAttr)) {
                continue;
              }

              // Extract the property value
              const propValue = PropValueExtractor.extract(propAttr);

              // Skip dynamic values
              if (PropValueExtractor.isDynamicValue(propValue)) {
                continue;
              }

              // Run all validators for this property's constraints
              for (const constraint of property.constraints) {
                // Use ClassFactory to instantiate validator by constraint type
                const validator = MJGlobal.Instance.ClassFactory.CreateInstance<BaseConstraintValidator>(
                  BaseConstraintValidator,
                  constraint.type
                );

                if (!validator) {
                  // Validator not registered for this constraint type
                  console.warn(`No validator registered for constraint type: ${constraint.type}`);
                  continue;
                }

                // Build ValidationContext
                const context: ValidationContext = {
                  node: propAttr,
                  path: path as any,
                  componentName: elementName,
                  componentSpec: depSpec,
                  propertyName: property.name,
                  propertyValue: propValue,
                  siblingProps,
                  entities: new Map(),
                  queries: new Map(),
                  typeEngine: null as any,

                  getEntityFields,
                  getEntityFieldType,
                  findSimilarFieldNames: (fieldName: string, entityName: string, maxResults?: number) => {
                    const fields = getEntityFields(entityName);
                    const fieldNames = fields.map((f: any) => f.name);
                    const similar: Array<{ name: string; distance: number }> = [];

                    // Simple Levenshtein distance calculation
                    const levenshtein = (a: string, b: string): number => {
                      const matrix: number[][] = [];
                      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                      for (let i = 1; i <= b.length; i++) {
                        for (let j = 1; j <= a.length; j++) {
                          if (b.charAt(i - 1) === a.charAt(j - 1)) {
                            matrix[i][j] = matrix[i - 1][j - 1];
                          } else {
                            matrix[i][j] = Math.min(
                              matrix[i - 1][j - 1] + 1,
                              matrix[i][j - 1] + 1,
                              matrix[i - 1][j] + 1
                            );
                          }
                        }
                      }
                      return matrix[b.length][a.length];
                    };

                    for (const fn of fieldNames) {
                      const distance = levenshtein(fieldName.toLowerCase(), fn.toLowerCase());
                      if (distance <= 3) {
                        similar.push({ name: fn, distance });
                      }
                    }
                    similar.sort((a, b) => a.distance - b.distance);
                    return similar.slice(0, maxResults || 3).map(s => s.name);
                  },
                  getQueryParameters: () => [],
                  hasQuery: () => false,
                  hasEntity,
                };

                // Run the validator
                try {
                  const constraintViolations = validator.validate(context, constraint);
                  for (const cv of constraintViolations) {
                    violations.push({
                      rule: 'validate-component-props',
                      severity: cv.severity,
                      line: propAttr.loc?.start.line || 0,
                      column: propAttr.loc?.start.column || 0,
                      message: cv.message,
                      code: cv.suggestion || '',
                    });
                  }
                } catch (error) {
                  console.error(`Error validating ${property.name} constraint (${constraint.type}):`, error);
                }
              }
            }
          },
        });

        return violations;
      },
    },
  ];

  public static async validateComponentSyntax(code: string, componentName: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const parseResult = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
        ranges: true,
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        const errors = parseResult.errors.map((error: any) => {
          const location = error.loc ? `Line ${error.loc.line}, Column ${error.loc.column}` : 'Unknown location';
          return `${location}: ${error.message || error.toString()}`;
        });

        return {
          valid: false,
          errors,
        };
      }

      return {
        valid: true,
        errors: [],
      };
    } catch (error: unknown) {
      // Handle catastrophic parse failures
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      return {
        valid: false,
        errors: [`Failed to parse component: ${errorMessage}`],
      };
    }
  }

  public static async lintComponent(
    code: string,
    componentName: string,
    componentSpec?: ComponentSpec,
    isRootComponent?: boolean,
    contextUser?: UserInfo,
    debugMode?: boolean,
    options?: ComponentExecutionOptions,
  ): Promise<LintResult> {
    try {
      // Require contextUser when libraries need to be checked
      if (componentSpec?.libraries && componentSpec.libraries.length > 0 && !contextUser) {
        throw new Error(
          'contextUser is required when linting components with library dependencies. This is needed to load library-specific lint rules from the database.',
        );
      }
      // Parse with error recovery to get both AST and errors
      const parseResult = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
        attachComment: false,
        ranges: true,
        tokens: false,
      });

      // Check for syntax errors from parser
      const syntaxViolations: Violation[] = [];
      if (parseResult.errors && parseResult.errors.length > 0) {
        for (const error of parseResult.errors) {
          const err = error as any; // Babel parser errors don't have proper types
          syntaxViolations.push({
            rule: 'syntax-error',
            severity: 'critical',
            line: err.loc?.line || 0,
            column: err.loc?.column || 0,
            message: `Syntax error in component "${componentName}": ${err.message || err.toString()}`,
            code: err.code || 'BABEL_PARSER_ERROR',
          });
        }
      }

      // If we have critical syntax errors, return immediately with those
      if (syntaxViolations.length > 0) {
        // Add suggestions directly to syntax violations
        this.generateSyntaxErrorSuggestions(syntaxViolations);

        return {
          success: false,
          violations: syntaxViolations,
          criticalCount: syntaxViolations.length,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          hasErrors: true,
        };
      }

      // Continue with existing linting logic
      const ast = parseResult;

      // Use universal rules for all components in the new pattern
      let rules = this.universalComponentRules;

      // Filter rules based on component type and appliesTo property
      if (isRootComponent) {
        // Root components: include 'all' and 'root' rules
        rules = rules.filter((rule) => rule.appliesTo === 'all' || rule.appliesTo === 'root');
      } else {
        // Child components: include 'all' and 'child' rules
        rules = rules.filter((rule) => rule.appliesTo === 'all' || rule.appliesTo === 'child');
      }

      const violations: Violation[] = [];

      // Run each rule with error handling to prevent crashes
      for (const rule of rules) {
        try {
          const ruleViolations = rule.test(ast, componentName, componentSpec, options);
          violations.push(...ruleViolations);
        } catch (error) {
          // Log rule execution errors but don't crash the entire linting process
          console.warn(`Rule "${rule.name}" failed during execution:`, error instanceof Error ? error.message : error);
          if (debugMode) {
            console.error('Full error:', error);
          }
        }
      }

      // Add data requirements validation if componentSpec is provided
      if (componentSpec?.dataRequirements?.entities) {
        try {
          const dataViolations = this.validateDataRequirements(ast, componentSpec, options);
          violations.push(...dataViolations);
        } catch (error) {
          console.warn('Data requirements validation failed:', error instanceof Error ? error.message : error);
          if (debugMode) {
            console.error('Full error:', error);
          }
        }
      }

      // Apply library-specific lint rules if available
      if (componentSpec?.libraries) {
        const libraryViolations = await this.applyLibraryLintRules(ast, componentSpec, contextUser, debugMode);
        violations.push(...libraryViolations);
      }

      // Deduplicate violations - keep only unique rule+message combinations
      const uniqueViolations = this.deduplicateViolations(violations);

      // Count violations by severity
      const criticalCount = uniqueViolations.filter((v) => v.severity === 'critical').length;
      const highCount = uniqueViolations.filter((v) => v.severity === 'high').length;
      const mediumCount = uniqueViolations.filter((v) => v.severity === 'medium').length;
      const lowCount = uniqueViolations.filter((v) => v.severity === 'low').length;

      // Debug mode summary
      if (debugMode && uniqueViolations.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 LINT SUMMARY:');
        console.log('='.repeat(60));
        if (criticalCount > 0) console.log(`  🔴 Critical: ${criticalCount}`);
        if (highCount > 0) console.log(`  🟠 High: ${highCount}`);
        if (mediumCount > 0) console.log(`  🟡 Medium: ${mediumCount}`);
        if (lowCount > 0) console.log(`  🟢 Low: ${lowCount}`);
        console.log('='.repeat(60));

        // Group violations by library
        const libraryViolations = uniqueViolations.filter((v) => v.rule.includes('-validator'));
        if (libraryViolations.length > 0) {
          console.log('\n📚 Library-Specific Issues:');
          const byLibrary = new Map<string, Violation[]>();
          libraryViolations.forEach((v) => {
            const lib = v.rule.replace('-validator', '');
            if (!byLibrary.has(lib)) byLibrary.set(lib, []);
            byLibrary.get(lib)!.push(v);
          });

          byLibrary.forEach((violations, library) => {
            console.log(`  • ${library}: ${violations.length} issue${violations.length > 1 ? 's' : ''}`);
          });
        }
        console.log('');
      }

      // Add suggestions directly to violations
      this.addSuggestionsToViolations(uniqueViolations);

      return {
        success: criticalCount === 0 && highCount === 0, // Only fail on critical/high
        violations: uniqueViolations,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        hasErrors: criticalCount > 0 || highCount > 0,
      };
    } catch (error) {
      // If parsing fails, return a parse error
      // Log stack trace for debugging
      if (error instanceof Error && error.stack) {
        console.error('Parse error stack trace:', error.stack);
      }
      return {
        success: false,
        violations: [
          {
            rule: 'parse-error',
            severity: 'critical',
            line: 0,
            column: 0,
            message: `Failed to parse component: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        hasErrors: true,
      };
    }
  }

  private static validateDataRequirements(ast: t.File, componentSpec: ComponentSpec, options?: ComponentExecutionOptions): Violation[] {
    const violations: Violation[] = [];

    // Extract entity names from dataRequirements
    const requiredEntities = new Set<string>();
    const requiredQueries = new Set<string>();

    // Map to store full query definitions for parameter validation
    const queryDefinitionsMap = new Map<string, ComponentQueryDataRequirement>();

    // Map to track allowed fields per entity (from dataRequirements display/filter/sort arrays)
    const entityFieldsMap = new Map<
      string,
      {
        displayFields: Set<string>;
        filterFields: Set<string>;
        sortFields: Set<string>;
      }
    >();

    // Map to track ALL fields that exist in the entity
    // Used to distinguish "field not in requirements" (medium) from "field doesn't exist" (critical)
    const entityAllFieldsMap = new Map<string, Set<string>>();

    // FIRST: Populate entityAllFieldsMap from options.entityMetadata if provided
    // This gives us the complete list of fields that actually exist in each entity
    if (options?.entityMetadata && Array.isArray(options.entityMetadata)) {
      for (const entity of options.entityMetadata) {
        if (entity.name && entity.fields) {
          const fieldNames = new Set<string>(entity.fields.map((f: SimpleEntityFieldInfo) => f.name));
          entityAllFieldsMap.set(entity.name, fieldNames);
        }
      }
    }

    if (componentSpec.dataRequirements?.entities) {
      for (const entity of componentSpec.dataRequirements.entities) {
        if (entity.name) {
          requiredEntities.add(entity.name);
          entityFieldsMap.set(entity.name, {
            displayFields: new Set(entity.displayFields || []),
            filterFields: new Set(entity.filterFields || []),
            sortFields: new Set(entity.sortFields || []),
          });

          // Build set of ALL fields from fieldMetadata if available
          // Only use fieldMetadata as fallback if entityMetadata wasn't provided for this entity
          if (!entityAllFieldsMap.has(entity.name) && entity.fieldMetadata && Array.isArray(entity.fieldMetadata)) {
            const allFields = new Set<string>();
            for (const field of entity.fieldMetadata) {
              if (field.name) {
                allFields.add(field.name);
              }
            }
            entityAllFieldsMap.set(entity.name, allFields);
          }
        }
      }
    }

    if (componentSpec.dataRequirements?.queries) {
      for (const query of componentSpec.dataRequirements.queries) {
        if (query.name) {
          requiredQueries.add(query.name);
          queryDefinitionsMap.set(query.name, query);
        }
      }
    }

    // Also check child components' dataRequirements
    if (componentSpec.dependencies) {
      for (const dep of componentSpec.dependencies) {
        if (dep.dataRequirements?.entities) {
          for (const entity of dep.dataRequirements.entities) {
            if (entity.name) {
              requiredEntities.add(entity.name);
              // Merge fields if entity already exists
              const existing = entityFieldsMap.get(entity.name);
              if (existing) {
                (entity.displayFields || []).forEach((f: string) => existing.displayFields.add(f));
                (entity.filterFields || []).forEach((f: string) => existing.filterFields.add(f));
                (entity.sortFields || []).forEach((f: string) => existing.sortFields.add(f));
              } else {
                entityFieldsMap.set(entity.name, {
                  displayFields: new Set(entity.displayFields || []),
                  filterFields: new Set(entity.filterFields || []),
                  sortFields: new Set(entity.sortFields || []),
                });
              }

              // Merge fieldMetadata into allFields map only if entityMetadata wasn't provided
              // If entityMetadata was provided, it already has the complete field list
              if (!entityAllFieldsMap.has(entity.name) && entity.fieldMetadata && Array.isArray(entity.fieldMetadata)) {
                const existingAll = new Set<string>();
                for (const field of entity.fieldMetadata) {
                  if (field.name) {
                    existingAll.add(field.name);
                  }
                }
                entityAllFieldsMap.set(entity.name, existingAll);
              }
            }
          }
        }
        if (dep.dataRequirements?.queries) {
          for (const query of dep.dataRequirements.queries) {
            if (query.name) {
              requiredQueries.add(query.name);
              queryDefinitionsMap.set(query.name, query);
            }
          }
        }
      }
    }

    // Find all RunView, RunViews, and RunQuery calls in the code
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for utilities.rv.RunView or utilities.rv.RunViews pattern
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isMemberExpression(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.object.object) &&
          path.node.callee.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.callee.object.property) &&
          path.node.callee.object.property.name === 'rv' &&
          t.isIdentifier(path.node.callee.property) &&
          (path.node.callee.property.name === 'RunView' || path.node.callee.property.name === 'RunViews')
        ) {
          // For RunViews, it might be an array of configs
          const configs =
            path.node.callee.property.name === 'RunViews' && path.node.arguments.length > 0 && t.isArrayExpression(path.node.arguments[0])
              ? path.node.arguments[0].elements.filter((e) => t.isObjectExpression(e))
              : path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])
                ? [path.node.arguments[0]]
                : [];

          // Check each config object
          for (const configObj of configs) {
            if (t.isObjectExpression(configObj)) {
              // Find EntityName property
              for (const prop of configObj.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
                  const usedEntity = prop.value.value;

                  // Check if this entity is in the required entities
                  if (requiredEntities.size > 0 && !requiredEntities.has(usedEntity)) {
                    // Enhanced fuzzy matching for better suggestions
                    const possibleMatches = Array.from(requiredEntities).filter((e) => {
                      const eLower = e.toLowerCase();
                      const usedLower = usedEntity.toLowerCase();

                      // Check various matching patterns
                      return (
                        // Contains match
                        eLower.includes(usedLower) ||
                        usedLower.includes(eLower) ||
                        // Remove spaces and check
                        eLower.replace(/\s+/g, '').includes(usedLower.replace(/\s+/g, '')) ||
                        usedLower.replace(/\s+/g, '').includes(eLower.replace(/\s+/g, '')) ||
                        // Check if the main words match (ignore prefixes like "MJ:")
                        eLower.replace(/^mj:\s*/i, '').includes(usedLower) ||
                        usedLower.includes(eLower.replace(/^mj:\s*/i, ''))
                      );
                    });

                    // Always show all available entities for clarity
                    const allEntities = Array.from(requiredEntities);
                    const entityList =
                      allEntities.length <= 5 ? allEntities.join(', ') : allEntities.slice(0, 5).join(', ') + `, ... (${allEntities.length} total)`;

                    let message = `Entity "${usedEntity}" not found in dataRequirements.`;

                    if (possibleMatches.length > 0) {
                      message += ` Did you mean "${possibleMatches[0]}"?`;
                    }

                    message += ` Available entities: ${entityList}`;

                    violations.push({
                      rule: 'entity-name-mismatch',
                      severity: 'critical',
                      line: prop.value.loc?.start.line || 0,
                      column: prop.value.loc?.start.column || 0,
                      message,
                      code: `EntityName: "${usedEntity}"`,
                    });
                  } else {
                    // Entity is valid, now check fields
                    const entityFields = entityFieldsMap.get(usedEntity);
                    if (entityFields) {
                      // Check Fields array
                      const fieldsProperty = configObj.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'Fields');

                      if (fieldsProperty && t.isObjectProperty(fieldsProperty) && t.isArrayExpression(fieldsProperty.value)) {
                        for (const fieldElement of fieldsProperty.value.elements) {
                          if (t.isStringLiteral(fieldElement)) {
                            const fieldName = fieldElement.value;

                            // Check for SQL functions
                            if (/COUNT\s*\(|SUM\s*\(|AVG\s*\(|MAX\s*\(|MIN\s*\(/i.test(fieldName)) {
                              violations.push({
                                rule: 'runview-sql-function',
                                severity: 'critical',
                                line: fieldElement.loc?.start.line || 0,
                                column: fieldElement.loc?.start.column || 0,
                                message: `RunView does not support SQL aggregations. Use RunQuery for aggregations or fetch raw data and aggregate in JavaScript.`,
                                code: fieldName,
                              });
                            } else {
                              // Check if field is in allowed fields
                              const isAllowed =
                                entityFields.displayFields.has(fieldName) || entityFields.filterFields.has(fieldName) || entityFields.sortFields.has(fieldName);

                              if (!isAllowed) {
                                // Check if field exists in entity metadata (two-tier severity)
                                const allFields = entityAllFieldsMap.get(usedEntity);
                                const existsInEntity = allFields ? allFields.has(fieldName) : false;

                                if (existsInEntity) {
                                  // Field exists but not in dataRequirements - medium severity (works but suboptimal)
                                  violations.push({
                                    rule: 'field-not-in-requirements',
                                    severity: 'medium',
                                    line: fieldElement.loc?.start.line || 0,
                                    column: fieldElement.loc?.start.column || 0,
                                    message: `Field "${fieldName}" exists in entity "${usedEntity}" but not declared in dataRequirements. Consider adding to displayFields, filterFields, or sortFields.`,
                                    code: fieldName,
                                  });
                                } else {
                                  // Field doesn't exist in entity - critical severity (will fail at runtime)
                                  violations.push({
                                    rule: 'field-not-in-requirements',
                                    severity: 'critical',
                                    line: fieldElement.loc?.start.line || 0,
                                    column: fieldElement.loc?.start.column || 0,
                                    message: `Field "${fieldName}" does not exist in entity "${usedEntity}". Available fields: ${[
                                      ...entityFields.displayFields,
                                      ...entityFields.filterFields,
                                      ...entityFields.sortFields,
                                    ].join(', ')}`,
                                    code: fieldName,
                                  });
                                }
                              }
                            }
                          }
                        }
                      }

                      // Check OrderBy field
                      const orderByProperty = configObj.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'OrderBy');

                      if (orderByProperty && t.isObjectProperty(orderByProperty) && t.isStringLiteral(orderByProperty.value)) {
                        const orderByValue = orderByProperty.value.value;
                        // Extract field name from OrderBy (e.g., "AccountName ASC" -> "AccountName")
                        const orderByField = orderByValue.split(/\s+/)[0];

                        if (!entityFields.sortFields.has(orderByField)) {
                          // Check if field exists in entity metadata (two-tier severity)
                          const allFields = entityAllFieldsMap.get(usedEntity);
                          const existsInEntity = allFields ? allFields.has(orderByField) : false;

                          if (existsInEntity) {
                            // Field exists but not in sortFields - medium severity (works but suboptimal)
                            violations.push({
                              rule: 'orderby-field-not-sortable',
                              severity: 'medium',
                              line: orderByProperty.value.loc?.start.line || 0,
                              column: orderByProperty.value.loc?.start.column || 0,
                              message: `OrderBy field "${orderByField}" exists in entity "${usedEntity}" but not declared in sortFields. Consider adding for optimization.`,
                              code: orderByValue,
                            });
                          } else {
                            // Field doesn't exist in entity - critical severity (will fail at runtime)
                            violations.push({
                              rule: 'orderby-field-not-sortable',
                              severity: 'critical',
                              line: orderByProperty.value.loc?.start.line || 0,
                              column: orderByProperty.value.loc?.start.column || 0,
                              message: `OrderBy field "${orderByField}" does not exist in entity "${usedEntity}". Available sort fields: ${[
                                ...entityFields.sortFields,
                              ].join(', ')}`,
                              code: orderByValue,
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Check for utilities.rv.RunQuery pattern
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isMemberExpression(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.object.object) &&
          path.node.callee.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.callee.object.property) &&
          path.node.callee.object.property.name === 'rv' &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === 'RunQuery'
        ) {
          // Check the first argument (should be an object with QueryName)
          if (path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])) {
            const configObj = path.node.arguments[0];

            // Find QueryName property
            for (const prop of configObj.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                const usedQuery = prop.value.value;

                // Check if this query is in the required queries
                if (requiredQueries.size > 0 && !requiredQueries.has(usedQuery)) {
                  // Enhanced fuzzy matching for better suggestions
                  const possibleMatches = Array.from(requiredQueries).filter((q) => {
                    const qLower = q.toLowerCase();
                    const usedLower = usedQuery.toLowerCase();

                    return (
                      // Contains match
                      qLower.includes(usedLower) ||
                      usedLower.includes(qLower) ||
                      // Remove spaces and check
                      qLower.replace(/\s+/g, '').includes(usedLower.replace(/\s+/g, '')) ||
                      usedLower.replace(/\s+/g, '').includes(qLower.replace(/\s+/g, ''))
                    );
                  });

                  // Always show all available queries for clarity
                  const allQueries = Array.from(requiredQueries);
                  const queryList = allQueries.length <= 5 ? allQueries.join(', ') : allQueries.slice(0, 5).join(', ') + `, ... (${allQueries.length} total)`;

                  let message = `Query "${usedQuery}" not found in dataRequirements.`;

                  if (possibleMatches.length > 0) {
                    message += ` Did you mean "${possibleMatches[0]}"?`;
                  }

                  if (requiredQueries.size > 0) {
                    message += ` Available queries: ${queryList}`;
                  } else {
                    message += ` No queries defined in dataRequirements.`;
                  }

                  violations.push({
                    rule: 'query-name-mismatch',
                    severity: 'critical',
                    line: prop.value.loc?.start.line || 0,
                    column: prop.value.loc?.start.column || 0,
                    message,
                    code: `QueryName: "${usedQuery}"`,
                  });
                } else if (queryDefinitionsMap.has(usedQuery)) {
                  // Query is valid, now check parameters
                  const queryDef = queryDefinitionsMap.get(usedQuery);
                  if (queryDef?.parameters && queryDef.parameters.length > 0) {
                    // Extract parameters from the RunQuery call
                    const paramsInCall = new Map<string, any>();

                    // Look for Parameters property in the config object
                    for (const prop of configObj.properties) {
                      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'Parameters' && t.isObjectExpression(prop.value)) {
                        // Extract each parameter from the Parameters object
                        for (const paramProp of prop.value.properties) {
                          if (t.isObjectProperty(paramProp) && t.isIdentifier(paramProp.key)) {
                            paramsInCall.set(paramProp.key.name, paramProp);
                          }
                        }

                        // Check for required parameters
                        const requiredParams = queryDef.parameters.filter((p) => p.value !== '@runtime' || p.value === '@runtime');
                        for (const reqParam of requiredParams) {
                          if (!paramsInCall.has(reqParam.name)) {
                            violations.push({
                              rule: 'missing-query-parameter',
                              severity: 'critical',
                              line: prop.value.loc?.start.line || 0,
                              column: prop.value.loc?.start.column || 0,
                              message: `Missing required parameter "${reqParam.name}" for query "${usedQuery}". ${reqParam.description ? `Description: ${reqParam.description}` : ''}`,
                              code: `Parameters: { ${reqParam.name}: ... }`,
                            });
                          }
                        }

                        // Check for unknown parameters
                        const validParamNames = new Set(queryDef.parameters.map((p) => p.name));
                        for (const [paramName, paramNode] of paramsInCall) {
                          if (!validParamNames.has(paramName)) {
                            violations.push({
                              rule: 'unknown-query-parameter',
                              severity: 'high',
                              line: (paramNode as any).loc?.start.line || 0,
                              column: (paramNode as any).loc?.start.column || 0,
                              message: `Unknown parameter "${paramName}" for query "${usedQuery}". Valid parameters: ${Array.from(validParamNames).join(', ')}`,
                              code: `${paramName}: ...`,
                            });
                          }
                        }

                        break; // Found Parameters property, no need to continue
                      }
                    }

                    // If query has parameters but no Parameters property was found in the call
                    if (paramsInCall.size === 0 && queryDef?.parameters && queryDef.parameters.length > 0) {
                      violations.push({
                        rule: 'missing-parameters-object',
                        severity: 'critical',
                        line: configObj.loc?.start.line || 0,
                        column: configObj.loc?.start.column || 0,
                        message: `Query "${usedQuery}" requires parameters but none were provided. Required parameters: ${queryDef.parameters.map((p) => p.name).join(', ')}`,
                        code: `RunQuery({ QueryName: "${usedQuery}", Parameters: { ... } })`,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    return violations;
  }

  private static getFunctionName(path: NodePath): string | null {
    const node = path.node;

    // Check for named function
    if (t.isFunctionDeclaration(node) && node.id) {
      return node.id.name;
    }

    // Check for arrow function assigned to variable
    if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
      const parent = path.parent;
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
        return parent.id.name;
      }
    }

    // Check for function assigned as property
    if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
      const parent = path.parent;
      if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
        return parent.key.name;
      }
    }

    return null;
  }

  private static deduplicateViolations(violations: Violation[]): Violation[] {
    const seen = new Set<string>();
    const unique: Violation[] = [];

    for (const violation of violations) {
      // Create a key from the complete violation details (case-insensitive for message)
      const key = `${violation.rule}:${violation.severity}:${violation.line}:${violation.column}:${violation.message.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(violation);
      }
    }

    // Sort by severity (critical > high > medium > low) and then by line number
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    unique.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.line - b.line;
    });

    return unique;
  }

  /**
   * Adds suggestions directly to violations based on their rule type
   * @param violations Array of violations to enhance with suggestions
   * @returns The same violations array with suggestions embedded
   */
  private static addSuggestionsToViolations(violations: Violation[]): Violation[] {
    for (const violation of violations) {
      switch (violation.rule) {
        case 'no-import-statements':
          violation.suggestion = {
            text: 'Remove all import statements. Interactive components receive everything through props.',
            example: `// ❌ WRONG - Using import statements:
import React from 'react';
import { useState } from 'react';
import { format } from 'date-fns';
import './styles.css';

function MyComponent({ utilities, styles }) {
  // ...
}

// ✅ CORRECT - Everything passed as props:
function MyComponent({ utilities, styles, components }) {
  // React hooks are available globally (useState, useEffect, etc.)
  const [value, setValue] = useState('');
  
  // Utilities include formatting functions
  const formatted = utilities.formatDate(new Date());
  
  // Styles are passed as props
  return <div style={styles.container}>...</div>;
}

// All dependencies must be:
// 1. Passed through the 'utilities' prop (formatting, helpers)
// 2. Passed through the 'components' prop (child components)
// 3. Passed through the 'styles' prop (styling)
// 4. Available globally (React hooks)`,
          };
          break;

        case 'no-export-statements':
          violation.suggestion = {
            text: 'Remove all export statements. The component function should be the only code, not exported.',
            example: `// ❌ WRONG - Using export:
export function MyComponent({ utilities }) {
  return <div>Hello</div>;
}

export const helper = () => {};
export default MyComponent;

// ✅ CORRECT - Just the function, no exports:
function MyComponent({ utilities, styles, components }) {
  // Helper functions defined inside if needed
  const helper = () => {
    // ...
  };
  
  return <div>Hello</div>;
}

// The component is self-contained.
// No exports needed - the host environment
// will execute the function directly.`,
          };
          break;

        case 'no-require-statements':
          violation.suggestion = {
            text: 'Remove all require() and dynamic import() statements. Use props instead.',
            example: `// ❌ WRONG - Using require or dynamic import:
function MyComponent({ utilities }) {
  const lodash = require('lodash');
  const module = await import('./module');
  
  return <div>...</div>;
}

// ✅ CORRECT - Use utilities and components props:
function MyComponent({ utilities, styles, components }) {
  // Use utilities for helper functions
  const result = utilities.debounce(() => {
    // ...
  }, 300);
  
  // Use components prop for child components
  const { DataTable, FilterPanel } = components;
  
  return (
    <div>
      <DataTable {...props} />
      <FilterPanel {...props} />
    </div>
  );
}

// Everything the component needs must be:
// - Passed via props (utilities, components, styles)
// - Available globally (React hooks)
// No module loading allowed!`,
          };
          break;

        case 'use-function-declaration':
          violation.suggestion = {
            text: 'Use function declaration syntax for TOP-LEVEL component definitions. Arrow functions are fine inside components.',
            example: `// ❌ WRONG - Top-level arrow function component:
const MyComponent = ({ utilities, styles, components }) => {
  const [state, setState] = useState('');
  
  return <div>{state}</div>;
};

// ✅ CORRECT - Function declaration for top-level:
function MyComponent({ utilities, styles, components }) {
  const [state, setState] = useState('');
  
  // Arrow functions are FINE inside the component:
  const handleClick = () => {
    setState('clicked');
  };
  
  const ChildComponent = () => <div>This is OK inside the component</div>;
  
  return <div onClick={handleClick}>{state}</div>;
}

// Child components also use function declaration:
function ChildComponent() {
  return <div>Child</div>;
}

// Why function declarations?
// 1. Clearer component identification
// 2. Better debugging experience (named functions)
// 3. Hoisting allows flexible code organization
// 4. Consistent with React documentation patterns
// 5. Easier to distinguish from regular variables`,
          };
          break;

        case 'no-return-component':
          violation.suggestion = {
            text: 'Remove the return statement at the end of the file. The component function should stand alone.',
            example: `// ❌ WRONG - Returning the component:
function MyComponent({ utilities, styles, components }) {
  const [state, setState] = useState('');
  
  return <div>{state}</div>;
}

return MyComponent; // <-- Remove this!

// ❌ ALSO WRONG - Component reference at end:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

MyComponent; // <-- Remove this!

// ✅ CORRECT - Just the function declaration:
function MyComponent({ utilities, styles, components }) {
  const [state, setState] = useState('');
  
  return <div>{state}</div>;
}
// Nothing after the function - file ends here

// The runtime will find and execute your component
// by its function name. No need to return or reference it!`,
          };
          break;

        case 'no-iife-wrapper':
          violation.suggestion = {
            text: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
            example: `// ❌ WRONG - IIFE wrapper patterns:
(function() {
  function MyComponent({ utilities, styles, components }) {
    return <div>Hello</div>;
  }
  return MyComponent;
})();

// Also wrong:
(function() {
  const MyComponent = ({ utilities }) => {
    return <div>Hello</div>;
  };
})();

// Also wrong - arrow function IIFE:
(() => {
  function MyComponent({ utilities }) {
    return <div>Hello</div>;
  }
})();

// ✅ CORRECT - Direct function declaration:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

// Why no IIFE?
// 1. Components run in their own scope already
// 2. The runtime handles isolation
// 3. IIFEs prevent proper component discovery
// 4. Makes debugging harder
// 5. Unnecessary complexity`,
          };
          break;

        case 'full-state-ownership':
          violation.suggestion = {
            text: 'Components must manage ALL their own state internally. Use proper naming conventions for initialization.',
            example: `// ❌ WRONG - Controlled state props:
function PaginationControls({ currentPage, filters, sortBy, onPageChange }) {
  // These props suggest parent controls the state - WRONG!
}

// ❌ WRONG - State props without handlers (still controlled):
function Component({ selectedId, activeTab }) {
  // Parent is managing this component's state
}

// ✅ CORRECT - Using initialization props:
function PaginationControls({ initialPage, defaultPageSize, onPageChange, savedUserSettings, onSaveUserSettings }) {
  // Component owns ALL its state, initialized from props
  const [currentPage, setCurrentPage] = useState(
    savedUserSettings?.currentPage || initialPage || 1
  );
  const [pageSize] = useState(defaultPageSize || 10);
  
  const handlePageChange = (page) => {
    setCurrentPage(page);  // Update internal state
    onPageChange?.(page);  // Notify parent if needed
    onSaveUserSettings?.({
      ...savedUserSettings,
      currentPage: page
    });
  };
}

// ✅ CORRECT - Configuration props are allowed:
function DataTable({ 
  items,              // Data prop - allowed
  pageSize,           // Configuration - allowed
  maxItems,           // Configuration - allowed
  initialSortBy,      // Initialization - allowed
  defaultFilters,     // Initialization - allowed
  onSelectionChange,  // Event handler - allowed
  savedUserSettings,
  onSaveUserSettings 
}) {
  // Component manages its own state
  const [sortBy, setSortBy] = useState(initialSortBy || 'name');
  const [filters, setFilters] = useState(defaultFilters || {});
  const [selectedItems, setSelectedItems] = useState(
    savedUserSettings?.selectedItems || []
  );
}

// Naming conventions:
// ✅ ALLOWED props:
// - initial* (initialPage, initialValue, initialSelection)
// - default* (defaultTab, defaultSortBy, defaultFilters)  
// - Configuration (pageSize, maxItems, minValue, disabled)
// - Data props (items, options, data, rows, columns)
// - Event handlers (onChange, onSelect, onPageChange)

// ❌ DISALLOWED props (suggest controlled component):
// - Direct state names (currentPage, selectedId, activeTab)
// - State without 'initial'/'default' prefix (sortBy, filters, searchTerm)
// - Controlled patterns (value + onChange, checked + onChange)`,
          };
          break;

        case 'no-use-reducer':
          violation.suggestion = {
            text: 'Use useState for state management, not useReducer',
            example: `// Instead of:
const [state, dispatch] = useReducer(reducer, initialState);

// Use useState:
function Component({ savedUserSettings, onSaveUserSettings }) {
  const [selectedId, setSelectedId] = useState(
    savedUserSettings?.selectedId
  );
  const [filters, setFilters] = useState(
    savedUserSettings?.filters || {}
  );
  
  // Handle actions directly
  const handleAction = (action) => {
    switch(action.type) {
      case 'SELECT':
        setSelectedId(action.payload);
        onSaveUserSettings?.({ ...savedUserSettings, selectedId: action.payload });
        break;
    }
  };
}`,
          };
          break;

        case 'no-data-prop':
          violation.suggestion = {
            text: 'Replace generic data prop with specific named props',
            example: `// Instead of:
function Component({ data, savedUserSettings, onSaveUserSettings }) {
  return <div>{data.items.map(...)}</div>;
}

// Use specific props:
function Component({ items, customers, savedUserSettings, onSaveUserSettings }) {
  // Component owns its state
  const [selectedItemId, setSelectedItemId] = useState(
    savedUserSettings?.selectedItemId
  );
  
  return <div>{items.map(...)}</div>;
}

// Load data using utilities:
const result = await utilities.rv.RunView({ entityName: 'Items' });`,
          };
          break;

        case 'saved-user-settings-pattern':
          violation.suggestion = {
            text: 'Only save important user preferences, not ephemeral UI state',
            example: `// ✅ SAVE these (important preferences):
- Selected items/tabs: selectedCustomerId, activeTab
- Sort preferences: sortBy, sortDirection  
- Filter selections: activeFilters
- View preferences: viewMode, pageSize

// ❌ DON'T SAVE these (ephemeral UI):
- Hover states: hoveredItemId
- Dropdown states: isDropdownOpen
- Text being typed: searchDraft (save on submit)
- Loading states: isLoading

// Example:
const handleHover = (id) => {
  setHoveredId(id); // Just local state
};

const handleSelect = (id) => {
  setSelectedId(id);
  onSaveUserSettings?.({ // Save important preference
    ...savedUserSettings,
    selectedId: id
  });
};`,
          };
          break;

        case 'pass-standard-props':
          violation.suggestion = {
            text: 'Always pass standard props to all components',
            example: `// Always include these props when calling components:
<ChildComponent
  items={items}  // Data props
  
  // Settings persistence
  savedUserSettings={savedUserSettings?.childComponent}
  onSaveUserSettings={handleChildSettings}
  
  // Standard props
  styles={styles}
  utilities={utilities}
  components={components}
  callbacks={callbacks}
/>`,
          };
          break;

        case 'no-child-implementation':
          violation.suggestion = {
            text: 'Remove child component implementations. Only the root component function should be in this file',
            example: 'Move child component functions to separate generation requests',
          };
          break;

        case 'undefined-component-usage':
          violation.suggestion = {
            text: 'Ensure all components destructured from the components prop are defined in the component spec dependencies',
            example: `// Component spec should include all referenced components:
{
  "name": "MyComponent",
  "code": "...",
  "dependencies": [
    {
      "name": "ModelTreeView",
      "code": "function ModelTreeView({ ... }) { ... }"
    },
    {
      "name": "PromptTable", 
      "code": "function PromptTable({ ... }) { ... }"
    },
    {
      "name": "FilterPanel",
      "code": "function FilterPanel({ ... }) { ... }"
    }
    // Add ALL components referenced in the root component
  ]
}

// Then in your component:
const { ModelTreeView, PromptTable, FilterPanel } = components;
// All these will be available`,
          };
          break;

        case 'component-usage-without-destructuring':
          violation.suggestion = {
            text: 'Components must be properly accessed - either destructure from components prop or use dot notation',
            example: `// ❌ WRONG - Using component without destructuring:
function MyComponent({ components }) {
  return <AccountList />; // Error: AccountList not destructured
}

// ✅ CORRECT - Option 1: Destructure from components
function MyComponent({ components }) {
  const { AccountList } = components;
  return <AccountList />;
}

// ✅ CORRECT - Option 2: Use dot notation
function MyComponent({ components }) {
  return <components.AccountList />;
}

// ✅ CORRECT - Option 3: Destructure in function parameters
function MyComponent({ components: { AccountList } }) {
  return <AccountList />;
}`,
          };
          break;

        case 'unsafe-array-access':
          violation.suggestion = {
            text: 'Always check array bounds before accessing elements',
            example: `// ❌ UNSAFE:
const firstItem = items[0].name;
const total = data[0].reduce((sum, item) => sum + item.value, 0);

// ✅ SAFE:
const firstItem = items.length > 0 ? items[0].name : 'No items';
const total = data.length > 0 
  ? data[0].reduce((sum, item) => sum + item.value, 0)
  : 0;

// ✅ BETTER - Use optional chaining:
const firstItem = items[0]?.name || 'No items';
const total = data[0]?.reduce((sum, item) => sum + item.value, 0) || 0;`,
          };
          break;

        case 'array-reduce-safety':
          violation.suggestion = {
            text: 'Always provide an initial value for reduce() or check array length',
            example: `// ❌ UNSAFE:
const sum = numbers.reduce((a, b) => a + b); // Fails on empty array
const total = data[0].reduce((sum, item) => sum + item.value); // Multiple issues

// ✅ SAFE:
const sum = numbers.reduce((a, b) => a + b, 0); // Initial value
const total = data.length > 0 && data[0]
  ? data[0].reduce((sum, item) => sum + item.value, 0)
  : 0;

// ✅ ALSO SAFE:
const sum = numbers.length > 0 
  ? numbers.reduce((a, b) => a + b)
  : 0;`,
          };
          break;

        case 'entity-name-mismatch':
          violation.suggestion = {
            text: 'Use the exact entity name from dataRequirements in RunView calls',
            example: `// The component spec defines the entities to use:
// dataRequirements: {
//   entities: [
//     { name: "MJ: AI Prompt Runs", ... }
//   ]
// }

// ❌ WRONG - Missing prefix or incorrect name:
await utilities.rv.RunView({
  EntityName: "AI Prompt Runs",  // Missing "MJ:" prefix
  Fields: ["RunAt", "Success"]
});

// ✅ CORRECT - Use exact name from dataRequirements:
await utilities.rv.RunView({
  EntityName: "MJ: AI Prompt Runs",  // Matches dataRequirements
  Fields: ["RunAt", "Success"]
});

// Also works with RunViews (parallel execution):
await utilities.rv.RunViews([
  { EntityName: "MJ: AI Prompt Runs", Fields: ["RunAt"] },
  { EntityName: "MJ: Users", Fields: ["Name", "Email"] }
]);

// The linter validates that all entity names in RunView/RunViews calls
// match those declared in the component spec's dataRequirements`,
          };
          break;

        case 'missing-query-parameter':
          violation.suggestion = {
            text: 'Provide all required parameters defined in dataRequirements for the query',
            example: `// The component spec defines required parameters:
// dataRequirements: {
//   queries: [
//     { 
//       name: "User Activity Summary",
//       parameters: [
//         { name: "UserID", value: "@runtime", description: "User to filter by" },
//         { name: "StartDate", value: "@runtime", description: "Start of date range" }
//       ]
//     }
//   ]
// }

// ❌ WRONG - Missing required parameter:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary",
  Parameters: {
    UserID: currentUserId
    // Missing StartDate!
  }
});

// ✅ CORRECT - All required parameters provided:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary",
  Parameters: {
    UserID: currentUserId,
    StartDate: startDate  // All parameters included
  }
});`,
          };
          break;

        case 'unknown-query-parameter':
          violation.suggestion = {
            text: 'Only use parameters that are defined in dataRequirements for the query',
            example: `// ❌ WRONG - Using undefined parameter:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary",
  Parameters: {
    UserID: currentUserId,
    EndDate: endDate,  // Not defined in dataRequirements!
    ExtraParam: 123    // Unknown parameter!
  }
});

// ✅ CORRECT - Only use defined parameters:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary",
  Parameters: {
    UserID: currentUserId,
    StartDate: startDate  // Only parameters from dataRequirements
  }
});`,
          };
          break;

        case 'missing-parameters-object':
          violation.suggestion = {
            text: 'Queries with parameters must include a Parameters object in RunQuery',
            example: `// ❌ WRONG - Query requires parameters but none provided:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary"
  // Missing Parameters object!
});

// ✅ CORRECT - Include Parameters object:
await utilities.rq.RunQuery({
  QueryName: "User Activity Summary",
  Parameters: {
    UserID: currentUserId,
    StartDate: startDate
  }
});`,
          };
          break;

        case 'query-name-mismatch':
          violation.suggestion = {
            text: 'Use the exact query name from dataRequirements in RunQuery calls',
            example: `// The component spec defines the queries to use:
// dataRequirements: {
//   queries: [
//     { name: "User Activity Summary", ... }
//   ]
// }

// ❌ WRONG - Incorrect query name:
await utilities.rv.RunQuery({
  QueryName: "UserActivitySummary",  // Wrong name format
  Parameters: { startDate, endDate }
});

// ✅ CORRECT - Use exact name from dataRequirements:
await utilities.rv.RunQuery({
  QueryName: "User Activity Summary",  // Matches dataRequirements
  Parameters: { startDate, endDate }
});

// The linter validates that all query names in RunQuery calls
// match those declared in the component spec's dataRequirements.queries`,
          };
          break;

        case 'runview-sql-function':
          violation.suggestion = {
            text: 'RunView does not support SQL aggregations. Use RunQuery or aggregate in JavaScript.',
            example: `// ❌ WRONG - SQL functions in RunView:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  Fields: ['COUNT(*) as Total', 'SUM(Revenue) as TotalRevenue']
});

// ✅ OPTION 1 - Use a pre-defined query:
await utilities.rq.RunQuery({
  QueryName: 'Account Summary Statistics'
});

// ✅ OPTION 2 - Fetch raw data and aggregate in JavaScript:
const result = await utilities.rv.RunView({
  EntityName: 'Accounts',
  Fields: ['ID', 'Revenue']
});

if (result?.Success) {
  const total = result.Results.length;
  const totalRevenue = result.Results.reduce((sum, acc) => sum + (acc.Revenue || 0), 0);
}`,
          };
          break;

        case 'field-not-in-requirements':
          violation.suggestion = {
            text: 'Only use fields that are defined in dataRequirements for the entity',
            example: `// Check your dataRequirements to see allowed fields:
// dataRequirements: {
//   entities: [{
//     name: "Accounts",
//     displayFields: ["ID", "AccountName", "Industry"],
//     filterFields: ["IsActive", "AccountType"],
//     sortFields: ["AccountName", "CreatedDate"]
//   }]
// }

// ❌ WRONG - Using undefined field:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  Fields: ['ID', 'AccountName', 'RandomField'] // RandomField not in requirements
});

// ✅ CORRECT - Only use defined fields:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  Fields: ['ID', 'AccountName', 'Industry'] // All from displayFields
});`,
          };
          break;

        case 'orderby-field-not-sortable':
          violation.suggestion = {
            text: 'OrderBy fields must be in the sortFields array for the entity',
            example: `// ❌ WRONG - Sorting by non-sortable field:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  OrderBy: 'Industry ASC' // Industry not in sortFields
});

// ✅ CORRECT - Use fields from sortFields:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  OrderBy: 'AccountName ASC' // AccountName is in sortFields
});`,
          };
          break;

        case 'parent-event-callback-usage':
          violation.suggestion = {
            text: 'Components must invoke parent event callbacks when state changes',
            example: `// ❌ WRONG - Only updating internal state:
function ChildComponent({ onSelectAccount, savedUserSettings, onSaveUserSettings }) {
  const [selectedAccountId, setSelectedAccountId] = useState(savedUserSettings?.selectedAccountId);
  
  const handleSelectAccount = (accountId) => {
    setSelectedAccountId(accountId); // Updates internal state
    onSaveUserSettings?.({ ...savedUserSettings, selectedAccountId: accountId }); // Saves settings
    // MISSING: Parent is never notified!
  };
}

// ✅ CORRECT - Update state AND invoke parent callback:
function ChildComponent({ onSelectAccount, savedUserSettings, onSaveUserSettings }) {
  const [selectedAccountId, setSelectedAccountId] = useState(savedUserSettings?.selectedAccountId);
  
  const handleSelectAccount = (accountId) => {
    // 1. Update internal state
    setSelectedAccountId(accountId);
    
    // 2. Invoke parent's event callback
    if (onSelectAccount) {
      onSelectAccount(accountId);
    }
    
    // 3. Save user preference
    onSaveUserSettings?.({ ...savedUserSettings, selectedAccountId: accountId });
  };
}`,
          };
          break;

        case 'property-name-consistency':
          violation.suggestion = {
            text: 'Maintain consistent property names when transforming data',
            example: `// ❌ WRONG - Transform to camelCase but access as PascalCase:
setAccountData(results.map(item => ({
  accountName: item.AccountName,      // camelCase
  annualRevenue: item.AnnualRevenue   // camelCase
})));
// Later in render...
<td>{account.AccountName}</td>        // PascalCase - UNDEFINED!
<td>{formatCurrency(account.AnnualRevenue)}</td> // Returns $NaN

// ✅ CORRECT Option 1 - Keep original casing:
setAccountData(results.map(item => ({
  AccountName: item.AccountName,       // Keep PascalCase
  AnnualRevenue: item.AnnualRevenue    // Keep PascalCase
})));
// Later in render...
<td>{account.AccountName}</td>        // Matches!
<td>{formatCurrency(account.AnnualRevenue)}</td> // Works!

// ✅ CORRECT Option 2 - Transform and use consistently:
setAccountData(results.map(item => ({
  accountName: item.AccountName,       // Transform to camelCase
  annualRevenue: item.AnnualRevenue    // Transform to camelCase
})));
// Later in render...
<td>{account.accountName}</td>        // Use camelCase consistently
<td>{formatCurrency(account.annualRevenue)}</td> // Works!`,
          };
          break;

        case 'noisy-settings-updates':
          violation.suggestion = {
            text: 'Save settings sparingly - only on meaningful user actions',
            example: `// ❌ WRONG - Saving on every keystroke:
const handleSearchChange = (e) => {
  setSearchTerm(e.target.value);
  onSaveUserSettings?.({ searchTerm: e.target.value }); // TOO NOISY!
};

// ✅ CORRECT - Save on blur or debounced:
const handleSearchBlur = () => {
  if (searchTerm !== savedUserSettings?.searchTerm) {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm });
  }
};

// ✅ CORRECT - Debounced save:
const saveSearchTerm = useMemo(() => 
  debounce((term) => {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm: term });
  }, 500),
  [savedUserSettings]
);`,
          };
          break;

        case 'prop-state-sync':
          violation.suggestion = {
            text: "Initialize state once, don't sync from props",
            example: `// ❌ WRONG - Syncing prop to state:
const [value, setValue] = useState(propValue);
useEffect(() => {
  setValue(propValue); // Creates dual state management!
}, [propValue]);

// ✅ CORRECT - Initialize once:
const [value, setValue] = useState(
  savedUserSettings?.value || defaultValue
);

// ✅ CORRECT - If you need prop changes, use derived state:
const displayValue = propOverride || value;`,
          };
          break;

        case 'performance-memoization':
          violation.suggestion = {
            text: 'Use useMemo for expensive operations and static data',
            example: `// ❌ WRONG - Expensive operation on every render:
const filteredItems = items.filter(item => 
  item.name.toLowerCase().includes(searchTerm.toLowerCase())
);

// ✅ CORRECT - Memoized:
const filteredItems = useMemo(() => 
  items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  ),
  [items, searchTerm]
);

// ❌ WRONG - Static array recreated:
const columns = [
  { field: 'name', header: 'Name' },
  { field: 'value', header: 'Value' }
];

// ✅ CORRECT - Memoized static data:
const columns = useMemo(() => [
  { field: 'name', header: 'Name' },
  { field: 'value', header: 'Value' }
], []); // Empty deps = never changes`,
          };
          break;

        case 'child-state-management':
          violation.suggestion = {
            text: 'Never manage state for child components',
            example: `// ❌ WRONG - Managing child state:
const [childTableSort, setChildTableSort] = useState('name');
const [modalOpen, setModalOpen] = useState(false);

<ChildTable 
  sortBy={childTableSort}
  onSortChange={setChildTableSort}
/>

// ✅ CORRECT - Let children manage themselves:
<ChildTable 
  data={tableData}
  savedUserSettings={savedUserSettings?.childTable}
  onSaveUserSettings={handleChildSettings}
  // Child manages its own sort state!
/>`,
          };
          break;

        case 'server-reload-on-client-operation':
          violation.suggestion = {
            text: 'Use client-side operations for sorting and filtering',
            example: `// ❌ WRONG - Reload from server:
const handleSort = (field) => {
  setSortBy(field);
  loadData(); // Unnecessary server call!
};

// ✅ CORRECT - Client-side sort:
const handleSort = (field) => {
  setSortBy(field);
  setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
};

// Use memoized sorted data:
const sortedData = useMemo(() => {
  const sorted = [...data];
  sorted.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? result : -result;
  });
  return sorted;
}, [data, sortBy, sortDirection]);`,
          };
          break;

        case 'runview-runquery-valid-properties':
          violation.suggestion = {
            text: 'Use only valid properties for RunView/RunViews and RunQuery',
            example: `// ❌ WRONG - Invalid properties on RunView:
await utilities.rv.RunView({
  EntityName: 'MJ: AI Prompt Runs',
  Parameters: { startDate, endDate },  // INVALID!
  GroupBy: 'Status'                    // INVALID!
});

// ✅ CORRECT - Use ExtraFilter for WHERE clauses:
await utilities.rv.RunView({
  EntityName: 'MJ: AI Prompt Runs',
  ExtraFilter: \`RunAt >= '\${startDate.toISOString()}' AND RunAt <= '\${endDate.toISOString()}'\`,
  OrderBy: 'RunAt DESC',
  Fields: ['RunAt', 'Status', 'Success']
});

// ✅ For aggregations, use RunQuery with a pre-defined query:
await utilities.rq.RunQuery({
  QueryName: 'Prompt Run Summary',
  Parameters: { startDate, endDate }  // Parameters ARE valid for RunQuery
});

// Valid RunView properties:
// - EntityName (required)
// - ExtraFilter, OrderBy, Fields, MaxRows, StartRow, ResultType (optional)

// Valid RunQuery properties:
// - QueryName (required)
// - CategoryPath, CategoryID, Parameters (optional)`,
          };
          break;

        case 'component-props-validation':
          violation.suggestion = {
            text: 'Components can only accept standard props and props explicitly defined in the component spec. The spec is provided by the architect and cannot be modified - your code must match the spec exactly.',
            example: `// ❌ WRONG - Component with undeclared props:
function MyComponent({ utilities, styles, components, customers, orders, selectedId }) {
  // ERROR: customers, orders, selectedId are NOT in the spec
  // The spec defines what props are allowed - you cannot add new ones
}

// ✅ CORRECT - Use only standard props and props defined in the spec:
function MyComponent({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // If you need data like customers/orders, load it internally using utilities
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(savedUserSettings?.selectedId);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load customers data internally
        const result = await utilities.rv.RunView({
          EntityName: 'Customers',
          Fields: ['ID', 'Name', 'Status']
        });
        if (result?.Success) {
          setCustomers(result.Results);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
  }, []);
  
  return <div>{/* Use state variables, not props */}</div>;
}

// NOTE: If the spec DOES define additional props (e.g., customers, orders),
// then you MUST accept and use them. Check the spec's properties array
// to see what props are required/optional beyond the standard ones.`,
          };
          break;

        case 'runview-runquery-result-direct-usage':
          violation.suggestion = {
            text: 'RunView and RunQuery return result objects, not arrays. Access the data with .Results property.',
            example: `// ❌ WRONG - Using result directly as array:
const result = await utilities.rv.RunView({
  EntityName: 'Users',
  Fields: ['ID', 'Name']
});

// These will all fail:
setUsers(result);  // Wrong! result is an object
result.map(u => u.Name);  // Wrong! Can't map on object
const users = Array.isArray(result) ? result : [];  // Wrong! Will always be []

// ✅ CORRECT - Access the Results property:
const result = await utilities.rv.RunView({
  EntityName: 'Users',
  Fields: ['ID', 'Name']
});

// Check success first (recommended):
if (result.Success) {
  setUsers(result.Results || []);
} else {
  console.error('Failed:', result.ErrorMessage);
  setUsers([]);
}

// Or use optional chaining:
setUsers(result?.Results || []);

// Now array methods work:
const names = result.Results?.map(u => u.Name) || [];

// ✅ For RunQuery - same pattern:
const queryResult = await utilities.rq.RunQuery({
  QueryName: 'UserSummary'
});
setData(queryResult.Results || []);  // NOT queryResult directly!

// Result object structure:
// {
//   Success: boolean,
//   Results: Array,  // Your data is here!
//   ErrorMessage?: string,
//   TotalRowCount?: number,
//   ExecutionTime?: number
// }`,
          };
          break;

        case 'styles-invalid-path':
          violation.suggestion = {
            text: 'Fix invalid styles property paths. Use the correct ComponentStyles interface structure.',
            example: `// ❌ WRONG - Invalid property paths:
styles.fontSize.small           // fontSize is not at root level
styles.colors.background        // colors.background exists
styles.spacing.small            // should be styles.spacing.sm

// ✅ CORRECT - Valid property paths:
styles.typography.fontSize.sm   // fontSize is under typography
styles.colors.background        // correct path
styles.spacing.sm               // correct size name

// With safe access and fallbacks:
styles?.typography?.fontSize?.sm || '14px'
styles?.colors?.background || '#FFFFFF'
styles?.spacing?.sm || '8px'`,
          };
          break;

        case 'styles-unsafe-access':
          violation.suggestion = {
            text: 'Use optional chaining for nested styles access to prevent runtime errors.',
            example: `// ❌ UNSAFE - Direct nested access:
const fontSize = styles.typography.fontSize.md;
const borderRadius = styles.borders.radius.sm;

// ✅ SAFE - With optional chaining and fallbacks:
const fontSize = styles?.typography?.fontSize?.md || '14px';
const borderRadius = styles?.borders?.radius?.sm || '6px';

// Even better - destructure with defaults:
const {
  typography: {
    fontSize: { md: fontSize = '14px' } = {}
  } = {}
} = styles || {};`,
          };
          break;
      }
    }

    return violations;
  }

  private static generateSyntaxErrorSuggestions(violations: Violation[]): void {
    for (const violation of violations) {
      if (violation.message.includes('Unterminated string')) {
        violation.suggestion = {
          text: 'Check that all string literals are properly closed with matching quotes',
          example: 'Template literals with interpolation must use backticks: `text ${variable} text`',
        };
      } else if (violation.message.includes('Unexpected token') || violation.message.includes('export')) {
        violation.suggestion = {
          text: 'Ensure all code is within the component function body',
          example: 'Remove any export statements or code outside the function definition',
        };
      } else if (violation.message.includes('import') && violation.message.includes('top level')) {
        violation.suggestion = {
          text: 'Import statements are not allowed in components - use props instead',
          example: 'Access libraries through props: const { React, MaterialUI } = props.components',
        };
      } else {
        violation.suggestion = {
          text: 'Fix the syntax error before the component can be compiled',
          example: 'Review the code at the specified line and column for syntax issues',
        };
      }
    }
  }

  /**
   * Apply library-specific lint rules based on ComponentLibrary LintRules field
   */
  private static async applyLibraryLintRules(ast: t.File, componentSpec: ComponentSpec, contextUser?: UserInfo, debugMode?: boolean): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      // Use the cached and compiled library rules
      const cache = LibraryLintCache.getInstance();
      await cache.loadLibraryRules(contextUser);

      // Check each library that this component uses
      if (componentSpec.libraries) {
        // Run library checks in parallel for performance
        const libraryPromises = componentSpec.libraries.map(async (lib) => {
          const libraryViolations: Violation[] = [];

          // Get the cached and compiled rules for this library
          const compiledRules = cache.getLibraryRules(lib.name);

          if (debugMode) {
            console.log(`\n  📚 Library: ${lib.name}`);
            if (compiledRules) {
              console.log(`  ┌─ Has lint rules: ✅`);
              if (compiledRules.validators) {
                console.log(`  ├─ Validators: ${Object.keys(compiledRules.validators).length}`);
              }
              if (compiledRules.initialization) {
                console.log(`  ├─ Initialization rules: ✅`);
              }
              if (compiledRules.lifecycle) {
                console.log(`  ├─ Lifecycle rules: ✅`);
              }
              console.log(`  └─ Starting checks...`);
            } else {
              console.log(`  └─ No lint rules defined`);
            }
          }

          if (compiledRules) {
            const library = compiledRules.library;
            const libraryName = library.Name || lib.name;

            // Apply initialization rules
            if (compiledRules.initialization) {
              if (debugMode) {
                console.log(`  ├─ 🔍 Checking ${libraryName} initialization patterns...`);
              }
              const initViolations = this.checkLibraryInitialization(ast, libraryName, compiledRules.initialization);

              // Debug logging for library violations
              if (debugMode && initViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${initViolations.length} initialization issue${initViolations.length > 1 ? 's' : ''}`);
                initViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...initViolations);
            }

            // Apply lifecycle rules
            if (compiledRules.lifecycle) {
              if (debugMode) {
                console.log(`  ├─ 🔄 Checking ${libraryName} lifecycle management...`);
              }
              const lifecycleViolations = this.checkLibraryLifecycle(ast, libraryName, compiledRules.lifecycle);

              // Debug logging for library violations
              if (debugMode && lifecycleViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${lifecycleViolations.length} lifecycle issue${lifecycleViolations.length > 1 ? 's' : ''}`);
                lifecycleViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...lifecycleViolations);
            }

            // Apply options validation
            if (compiledRules.options) {
              if (debugMode) {
                console.log(`  ├─ ⚙️  Checking ${libraryName} configuration options...`);
              }
              const optionsViolations = this.checkLibraryOptions(ast, libraryName, compiledRules.options);

              // Debug logging for library violations
              if (debugMode && optionsViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${optionsViolations.length} configuration issue${optionsViolations.length > 1 ? 's' : ''}`);
                optionsViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...optionsViolations);
            }

            // Apply compiled validators (already compiled in cache)
            if (compiledRules.validators) {
              const validatorViolations = this.executeCompiledValidators(ast, libraryName, library.GlobalVariable || '', compiledRules.validators, debugMode);
              libraryViolations.push(...validatorViolations);
            }
          }

          return libraryViolations;
        });

        // Wait for all library checks to complete
        const allLibraryViolations = await Promise.all(libraryPromises);

        // Flatten the results
        allLibraryViolations.forEach((libViolations) => {
          violations.push(...libViolations);
        });
      }
    } catch (error) {
      console.warn('Failed to apply library lint rules:', error);
    }

    return violations;
  }

  /**
   * Check library initialization patterns (constructor, element type, etc.)
   */
  private static checkLibraryInitialization(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      // Check for new ConstructorName() patterns
      NewExpression(path: NodePath<t.NewExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === rules.constructorName) {
          // Check if it requires 'new' keyword
          if (rules.requiresNew === false) {
            violations.push({
              rule: 'library-initialization',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `${libraryName}: ${rules.constructorName} should not use 'new' keyword`,
              code: `${rules.constructorName}(...) // without new`,
            });
          }

          // Check element type if first argument is a ref
          if (rules.elementType && path.node.arguments[0]) {
            const firstArg = path.node.arguments[0];

            // Check if it's chartRef.current or similar
            if (t.isMemberExpression(firstArg) && t.isIdentifier(firstArg.property) && firstArg.property.name === 'current') {
              // Try to find what element the ref is attached to
              const refName = t.isIdentifier(firstArg.object) ? firstArg.object.name : null;
              if (refName) {
                ComponentLinter.checkRefElementType(ast, refName, rules.elementType, libraryName, violations);
              }
            }
          }
        }
      },

      // Check for function calls without new (if requiresNew is true)
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === rules.constructorName && rules.requiresNew === true) {
          violations.push({
            rule: 'library-initialization',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `${libraryName}: ${rules.constructorName} requires 'new' keyword`,
            code: `new ${rules.constructorName}(...)`,
          });
        }
      },
    });

    return violations;
  }

  /**
   * Check if a library is directly instantiated in the component code
   * Returns false if the library is only used indirectly (e.g., by dependency components)
   */
  private static isLibraryDirectlyInstantiated(ast: t.File, constructorName: string): boolean {
    let isDirectlyUsed = false;

    traverse(ast, {
      // Check for: new Chart(...), new ApexCharts(...), etc.
      NewExpression(path: NodePath<t.NewExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === constructorName) {
          isDirectlyUsed = true;
        }
      },

      // Check for: Chart.register(...), Chart.defaults.set(...), etc.
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee) &&
            t.isIdentifier(path.node.callee.object) &&
            path.node.callee.object.name === constructorName) {
          isDirectlyUsed = true;
        }
      },
    });

    return isDirectlyUsed;
  }

  /**
   * Check if a ref is attached to the correct element type
   */
  private static checkRefElementType(ast: t.File, refName: string, expectedType: string, libraryName: string, violations: Violation[]): void {
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;

        // Check if this element has a ref attribute
        const refAttr = openingElement.attributes.find((attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'ref');

        if (refAttr && t.isJSXAttribute(refAttr)) {
          // Check if the ref value matches our refName
          const refValue = refAttr.value;
          if (t.isJSXExpressionContainer(refValue) && t.isIdentifier(refValue.expression) && refValue.expression.name === refName) {
            // Check element type
            const elementName = t.isJSXIdentifier(openingElement.name) ? openingElement.name.name : '';

            if (elementName.toLowerCase() !== expectedType.toLowerCase()) {
              violations.push({
                rule: 'library-element-type',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `${libraryName} requires a <${expectedType}> element, not <${elementName}>`,
                code: `<${expectedType} ref={${refName}}>`,
              });
            }
          }
        }
      },
    });
  }

  /**
   * Check library lifecycle methods (render, destroy, etc.)
   */
  private static checkLibraryLifecycle(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    // Track which methods are called
    const calledMethods = new Set<string>();
    const instanceVariables = new Set<string>();

    traverse(ast, {
      // Track instance variables
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) && t.isIdentifier(path.node.init.callee)) {
          if (t.isIdentifier(path.node.id)) {
            instanceVariables.add(path.node.id.name);
          }
        }
      },

      // Track method calls
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee)) {
          const callee = path.node.callee as t.MemberExpression;

          if (t.isIdentifier(callee.property)) {
            const methodName = callee.property.name;
            const objectName = t.isIdentifier(callee.object) ? callee.object.name : null;

            if (objectName && instanceVariables.has(objectName)) {
              calledMethods.add(methodName);
            }
          }
        }
      },
    });

    // Check required methods
    if (rules.requiredMethods) {
      for (const method of rules.requiredMethods) {
        if (!calledMethods.has(method)) {
          violations.push({
            rule: 'library-lifecycle',
            severity: 'high',
            line: 0,
            column: 0,
            message: `${libraryName}: Missing required method call '${method}()' after initialization`,
            code: `instance.${method}()`,
          });
        }
      }
    }

    // Check cleanup in useEffect
    if (rules.cleanupMethods && rules.cleanupMethods.length > 0) {
      // First, check if the library is directly instantiated in the component
      // If it's only used by dependency components, skip cleanup check
      const isLibraryDirectlyUsed = ComponentLinter.isLibraryDirectlyInstantiated(ast, rules.constructorName);

      if (!isLibraryDirectlyUsed) {
        // Library is only used indirectly (e.g., by dependency components)
        // No cleanup check needed
        return violations;
      }

      let hasCleanup = false;

      // Track local variables that are instances of the library
      const libraryInstances = new Set<string>();

      traverse(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
          // Check for both useEffect and React.useEffect
          const isUseEffect =
            (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') ||
            (t.isMemberExpression(path.node.callee) &&
              t.isIdentifier(path.node.callee.object) &&
              path.node.callee.object.name === 'React' &&
              t.isIdentifier(path.node.callee.property) &&
              path.node.callee.property.name === 'useEffect');

          if (isUseEffect) {
            const firstArg = path.node.arguments[0];
            if (t.isArrowFunctionExpression(firstArg) || t.isFunctionExpression(firstArg)) {
              // First, identify local variables that are library instances
              // e.g., const chart = new ApexCharts(...)
              libraryInstances.clear();
              traverse(
                firstArg,
                {
                  VariableDeclarator(varPath: NodePath<t.VariableDeclarator>) {
                    if (
                      t.isIdentifier(varPath.node.id) &&
                      t.isNewExpression(varPath.node.init) &&
                      t.isIdentifier(varPath.node.init.callee) &&
                      varPath.node.init.callee.name === rules.constructorName
                    ) {
                      libraryInstances.add(varPath.node.id.name);
                    }
                  },
                },
                path.scope,
                path.state,
                path,
              );

              // Check if it returns a cleanup function
              traverse(
                firstArg,
                {
                  ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
                    if (t.isArrowFunctionExpression(returnPath.node.argument) || t.isFunctionExpression(returnPath.node.argument)) {
                      // Check if cleanup function calls destroy
                      traverse(
                        returnPath.node.argument,
                        {
                          CallExpression(cleanupPath: NodePath<t.CallExpression>) {
                            if (t.isMemberExpression(cleanupPath.node.callee)) {
                              const callee = cleanupPath.node.callee as t.MemberExpression;

                              // Check if the method name is a cleanup method
                              if (t.isIdentifier(callee.property) && rules.cleanupMethods.includes(callee.property.name)) {
                                // Pattern 1: instance.destroy() where instance is a tracked library instance
                                // e.g., chart.destroy() where chart is from const chart = new ApexCharts(...)
                                if (t.isIdentifier(callee.object) && libraryInstances.has(callee.object.name)) {
                                  hasCleanup = true;
                                }
                                // Pattern 2: ref.current.destroy() or ref.current._chart.destroy()
                                // Any member expression chain ending in cleanup method
                                // e.g., chartRef.current._chart.destroy()
                                else if (t.isMemberExpression(callee.object)) {
                                  hasCleanup = true;
                                }
                                // Pattern 3: d3.select(...).selectAll('*').remove()
                                // Chained method calls ending in cleanup
                                else if (t.isCallExpression(callee.object)) {
                                  hasCleanup = true;
                                }
                                // Pattern 4: Any identifier calling cleanup method
                                // e.g., selection.remove() where selection = d3.select(...)
                                else if (t.isIdentifier(callee.object)) {
                                  hasCleanup = true;
                                }
                              }
                            }
                          },
                        },
                        returnPath.scope,
                        returnPath.state,
                        returnPath,
                      );
                    }
                  },
                },
                path.scope,
                path.state,
                path,
              );
            }
          }
        },
      });

      if (!hasCleanup) {
        violations.push({
          rule: 'library-cleanup',
          severity: 'medium',
          line: 0,
          column: 0,
          message: `${libraryName}: Missing cleanup in useEffect. Call ${rules.cleanupMethods.join(' or ')} in cleanup function`,
          code: `useEffect(() => {\n  // ... initialization\n  return () => {\n    instance.${rules.cleanupMethods[0]}();\n  };\n}, []);`,
        });
      }
    }

    return violations;
  }

  /**
   * Check library options and configuration
   */
  private static checkLibraryOptions(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      ObjectExpression(path: NodePath<t.ObjectExpression>) {
        // Check if this might be a config object for the library
        const properties = path.node.properties.filter((p): p is t.ObjectProperty => t.isObjectProperty(p));
        const propNames = properties.filter((p) => t.isIdentifier(p.key)).map((p) => (p.key as t.Identifier).name);

        // Check for required properties
        if (rules.requiredProperties) {
          const hasChartType = propNames.some((name) => rules.requiredProperties.includes(name));

          if (hasChartType) {
            // This looks like a config object, check all required props
            for (const required of rules.requiredProperties) {
              if (!propNames.includes(required)) {
                violations.push({
                  rule: 'library-options',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `${libraryName}: Missing required option '${required}'`,
                  code: `${required}: /* value */`,
                });
              }
            }
          }
        }

        // Check property types
        if (rules.propertyTypes) {
          for (const prop of properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const propName = prop.key.name;
              const expectedType = rules.propertyTypes[propName];

              if (expectedType) {
                // Check if the value matches expected type
                if (expectedType.includes('array') && !t.isArrayExpression(prop.value)) {
                  violations.push({
                    rule: 'library-options',
                    severity: 'medium',
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message: `${libraryName}: Option '${propName}' should be an array`,
                    code: `${propName}: []`,
                  });
                }
              }
            }
          }
        }
      },
    });

    return violations;
  }

  /**
   * Execute pre-compiled validators from cache
   */
  private static executeCompiledValidators(
    ast: t.File,
    libraryName: string,
    globalVariable: string,
    validators: Record<string, any>,
    debugMode?: boolean,
  ): Violation[] {
    const violations: Violation[] = [];

    // Create context object for validators
    const context: any = {
      libraryName,
      globalVariable,
      instanceVariables: new Set<string>(),
      violations: [], // Validators push violations here
    };

    // First pass: identify library instance variables
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) && t.isIdentifier(path.node.init.callee)) {
          // Check if it's a library constructor
          if (path.node.init.callee.name === globalVariable) {
            if (t.isIdentifier(path.node.id)) {
              context.instanceVariables.add(path.node.id.name);
            }
          }
        }
      },
    });

    // Execute each compiled validator
    for (const [validatorName, validator] of Object.entries(validators)) {
      if (validator && validator.validateFn) {
        const beforeCount = context.violations.length;

        // Log that we're running this specific validator
        if (debugMode) {
          console.log(`  ├─ 🔬 Running ${libraryName} validator: ${validatorName}`);
          if (validator.description) {
            console.log(`  │   ℹ️  ${validator.description}`);
          }
        }

        // Traverse AST and apply validator
        traverse(ast, {
          enter(path: NodePath) {
            try {
              // Validators don't return violations, they push to context.violations
              validator.validateFn(ast, path, t, context);
            } catch (error) {
              // Validator execution error - log but don't crash
              console.warn(`Validator ${validatorName} failed:`, error);
              if (debugMode) {
                console.error('Full error:', error);
              }
            }
          },
        });

        // Debug logging for this specific validator
        const newViolations = context.violations.length - beforeCount;
        if (debugMode && newViolations > 0) {
          console.log(`  │   ✓ Found ${newViolations} violation${newViolations > 1 ? 's' : ''}`);

          // Show the violations from this validator
          const validatorViolations = context.violations.slice(beforeCount);
          validatorViolations.forEach((v: any) => {
            const icon =
              v.type === 'error' || v.severity === 'critical'
                ? '🔴'
                : v.type === 'warning' || v.severity === 'high'
                  ? '🟠'
                  : v.severity === 'medium'
                    ? '🟡'
                    : '🟢';
            console.log(`  │   ${icon} Line ${v.line || 'unknown'}: ${v.message}`);
            if (v.suggestion) {
              console.log(`  │      💡 ${v.suggestion}`);
            }
          });
        } else if (debugMode) {
          console.log(`  │   ✓ No violations found`);
        }
      }
    }

    // Convert context violations to standard format
    const standardViolations = context.violations.map((v: any) => ({
      rule: `${libraryName.toLowerCase()}-validator`,
      severity: v.severity || (v.type === 'error' ? 'critical' : v.type === 'warning' ? 'high' : 'medium'),
      line: v.line || 0,
      column: v.column || 0,
      message: v.message,
      code: v.code,
    }));

    violations.push(...standardViolations);

    return violations;
  }
}
