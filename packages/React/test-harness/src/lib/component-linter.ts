import * as parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ComponentSpec, ComponentQueryDataRequirement } from '@memberjunction/interactive-component-types';
import type { RunQueryResult, RunViewResult } from '@memberjunction/core';
import { ComponentLibraryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { LibraryLintCache } from './library-lint-cache';

export interface LintResult {
  success: boolean;
  violations: Violation[];
  suggestions: FixSuggestion[];
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
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
}

export interface FixSuggestion {
  violation: string;
  suggestion: string;
  example?: string;
}

interface Rule {
  name: string;
  appliesTo: 'all' | 'child' | 'root';
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => Violation[];
}

// Standard HTML elements (lowercase)
const HTML_ELEMENTS = new Set([
  // Main root
  'html',
  // Document metadata
  'base', 'head', 'link', 'meta', 'style', 'title',
  // Sectioning root
  'body',
  // Content sectioning
  'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'main', 'nav', 'section',
  // Text content
  'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'hr', 'li', 'menu', 'ol', 'p', 'pre', 'ul',
  // Inline text semantics
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark',
  'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
  // Image and multimedia
  'area', 'audio', 'img', 'map', 'track', 'video',
  // Embedded content
  'embed', 'iframe', 'object', 'param', 'picture', 'portal', 'source',
  // SVG and MathML
  'svg', 'math',
  // Scripting
  'canvas', 'noscript', 'script',
  // Demarcating edits
  'del', 'ins',
  // Table content
  'caption', 'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  // Forms
  'button', 'datalist', 'fieldset', 'form', 'input', 'label', 'legend', 'meter', 'optgroup',
  'option', 'output', 'progress', 'select', 'textarea',
  // Interactive elements
  'details', 'dialog', 'summary',
  // Web Components
  'slot', 'template',
  // SVG elements (common ones)
  'animate', 'animateMotion', 'animateTransform', 'circle', 'clipPath', 'defs', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line', 'linearGradient', 'marker',
  'mask', 'metadata', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'stop', 'switch', 'symbol', 'text', 'textPath', 'tspan', 'use', 'view'
]);

// React built-in components (PascalCase)
const REACT_BUILT_INS = new Set([
  'Fragment',
  'StrictMode',
  'Suspense',
  'Profiler'
]);

// Helper function
function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

// Extract property names from TypeScript types at compile time
// These will be evaluated at TypeScript compile time and become static arrays
const runQueryResultProps: readonly string[] = [
  'QueryID', 'QueryName', 'Success', 'Results', 'RowCount', 
  'TotalRowCount', 'ExecutionTime', 'ErrorMessage'
] as const satisfies readonly (keyof RunQueryResult)[];

const runViewResultProps: readonly string[] = [
  'Success', 'Results', 'UserViewRunID', 'RowCount', 
  'TotalRowCount', 'ExecutionTime', 'ErrorMessage'
] as const satisfies readonly (keyof RunViewResult)[];

export class ComponentLinter {
  // Helper method to check if a statement contains a return
  private static containsReturn(node: t.Node): boolean {
    let hasReturn = false;
    
    // Create a mini AST to traverse
    const file = t.file(t.program([t.expressionStatement(node as any)]));
    
    traverse(file, {
      ReturnStatement(path) {
        // Don't count returns in nested functions
        const parent = path.getFunctionParent();
        if (!parent || parent.node === node) {
          hasReturn = true;
        }
      }
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
            if (callee.property.name === methodName || 
                callee.property.name === methodName + 's') { // RunViews
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
              if (t.isIdentifier(obj.callee.property) && 
                  (obj.callee.property.name === methodName || 
                   obj.callee.property.name === methodName + 's')) {
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
              code: path.toString().substring(0, 100)
            });
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'no-export-statements',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export statement. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100)
            });
          },
          ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export default statement. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100)
            });
          },
          ExportAllDeclaration(path: NodePath<t.ExportAllDeclaration>) {
            violations.push({
              rule: 'no-export-statements',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" contains an export * statement. Interactive components are self-contained and cannot export values.`,
              code: path.toString().substring(0, 100)
            });
          }
        });
        
        return violations;
      }
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
                code: path.toString().substring(0, 100)
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
                code: path.toString().substring(0, 100)
              });
            }
          }
        });
        
        return violations;
      }
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
            const isTopLevel = path.getFunctionParent() === null || 
                              path.scope.path.type === 'Program';
            
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
                  code: path.toString().substring(0, 150)
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
                  code: path.toString().substring(0, 150)
                });
              }
            }
          }
        });
        
        return violations;
      }
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
                  code: `return ${argument.name};`
                });
              }
            }
            
            // Also check for expression statements that might be standalone identifiers
            if (t.isExpressionStatement(statement) && 
                t.isIdentifier(statement.expression) && 
                statement.expression.name === componentName) {
              violations.push({
                rule: 'no-return-component',
                severity: 'critical',
                line: statement.loc?.start.line || 0,
                column: statement.loc?.start.column || 0,
                message: `Do not reference the component "${componentName}" at the end of the file. The component function should stand alone.`,
                code: statement.expression.name
              });
            }
          }
        }
        
        return violations;
      }
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
                    code: `function ${funcName}(...)`
                  });
                }
                
                // Also check that the first letter case matches
                const expectedFirstChar = expectedName.charAt(0);
                const actualFirstChar = funcName.charAt(0);
                if (expectedFirstChar !== actualFirstChar && 
                    expectedName.toLowerCase() === funcName.toLowerCase()) {
                  violations.push({
                    rule: 'component-name-mismatch',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component function name "${funcName}" has incorrect capitalization. Expected "${expectedName}" (note the case of the first letter). The function name must match exactly, including capitalization: function ${expectedName}(...)`,
                    code: `function ${funcName}(...)`
                  });
                }
              }
            }
          }
        });
        
        // If we didn't find a main function with the expected name
        if (!foundMainFunction && componentSpec?.name) {
          violations.push({
            rule: 'component-name-mismatch',
            severity: 'critical',
            line: 1,
            column: 0,
            message: `No function declaration found with the expected name "${expectedName}". The main component function must be named exactly as specified in the spec. Add a function declaration: function ${expectedName}({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { ... }`
          });
        }
        
        return violations;
      }
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
            if (path.parent === ast.program && 
                path.node.id && 
                path.node.id.name === componentName) {
              mainComponentPath = path;
              path.stop();
            }
          }
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
                if (init && (
                  t.isArrowFunctionExpression(init) ||
                  t.isFunctionExpression(init)
                )) {
                  violations.push({
                    rule: 'dependency-shadowing',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component '${varName}' shadows a dependency component. The component '${varName}' is already available from dependencies (auto-destructured), but this code is creating a new definition which overrides it.`,
                    code: `const ${varName} = ...`
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
                  message: `Component '${funcName}' shadows a dependency component. The component '${funcName}' is already available from dependencies (auto-destructured), but this code is creating a new function which overrides it.`,
                  code: `function ${funcName}(...)`
                });
              }
            }
          }
        });
        
        // Components are now auto-destructured in the wrapper, so we don't need to check for manual destructuring
        // We just need to check if they're being used directly
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
            if (t.isIdentifier(path.node.object) && 
                path.node.object.name === 'components' &&
                t.isIdentifier(path.node.property)) {
              const name = path.node.property.name;
              if (dependencyNames.has(name)) {
                usedDependencies.add(name);
                hasComponentsUsage = true;
              }
            }
          },
          
          // Also look in JSX elements
          JSXMemberExpression(path: NodePath<t.JSXMemberExpression>) {
            if (t.isJSXIdentifier(path.node.object) && 
                path.node.object.name === 'components' &&
                t.isJSXIdentifier(path.node.property)) {
              const name = path.node.property.name;
              if (dependencyNames.has(name)) {
                usedDependencies.add(name);
                hasComponentsUsage = true; // Mark as properly accessed
              }
            }
          }
        });
        
        // Components are now auto-destructured, so just check for unused dependencies
        if (dependencyNames.size > 0 && usedDependencies.size === 0) {
          const depList = Array.from(dependencyNames).join(', ');
          violations.push({
            rule: 'dependency-shadowing',
            severity: 'low',
            line: (mainComponentPath as NodePath<t.FunctionDeclaration>).node.loc?.start.line || 0,
            column: (mainComponentPath as NodePath<t.FunctionDeclaration>).node.loc?.start.column || 0,
            message: `Component has dependencies [${depList}] defined in spec but they're not being used. These components are available for use.`,
            code: `// Available: ${depList}`
          });
        }
        
        return violations;
      }
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
            if (lib.globalVariable) {
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
                if (t.isVariableDeclarator(currentPath.node) && 
                    t.isObjectPattern(currentPath.node.id)) {
                  isDestructuring = true;
                  break;
                }
                currentPath = currentPath.parentPath;
              }
              
              // Check if the property matches a known library
              const matchedLibrary = libraryMap.get(propertyName.toLowerCase());
              
              if (matchedLibrary) {
                // Specific guidance for library access
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" should not access window.${propertyName}. Use "${matchedLibrary}" directly - it's already available in the component's closure scope. Change "window.${propertyName}" to just "${matchedLibrary}".`,
                  code: path.toString().substring(0, 100)
                });
              } else if (isDestructuring) {
                // Likely trying to destructure from an unknown library
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" is trying to destructure from window.${propertyName}. If this is a library, it should be added to the component's libraries array in the spec and accessed via its globalVariable name.`,
                  code: path.toString().substring(0, 100)
                });
              } else {
                // General window access
                violations.push({
                  rule: 'no-window-access',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Component "${componentName}" must not access the window object. Interactive components should be self-contained and not rely on global state.`,
                  code: path.toString().substring(0, 100)
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
                  code: path.toString().substring(0, 100)
                });
              }
            }
          }
        });
        
        return violations;
      }
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
                      code: statement.toString().substring(0, 50) + '...'
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
                    code: statement.toString().substring(0, 50) + '...'
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
                      code: statement.toString().substring(0, 50) + '...'
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
                      code: decl.toString().substring(0, 50) + '...'
                    });
                  }
                }
              }
            }
          }
        }
        
        return violations;
      }
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
               t.isIdentifier(callee.object) && callee.object.name === 'React' &&
               t.isIdentifier(callee.property) && callee.property.name === 'useReducer')
            ) {
              violations.push({
                rule: 'no-use-reducer',
                severity: 'high',  // High but not critical - it's a pattern violation
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component "${componentName}" uses useReducer at line ${path.node.loc?.start.line}. Components should manage state with useState and persist important settings with onSaveUserSettings.`,
                code: path.toString()
              });
            }
          }
        });
        
        return violations;
      }
    },
    
    
    // New rules for the controlled component pattern
    {
      name: 'no-data-prop',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
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
                      severity: 'low',  // Opinion-based style preference, not a functional issue
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                      code: 'data prop in component signature'
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
                        severity: 'low',  // Opinion-based style preference, not a functional issue
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                        code: 'data prop in component signature'
                      });
                    }
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
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
            if (t.isMemberExpression(callee) && 
                t.isIdentifier(callee.object) && callee.object.name === 'onSaveUserSettings') {
              
              // Check if saving ephemeral state
              if (path.node.arguments.length > 0) {
                const arg = path.node.arguments[0];
                if (t.isObjectExpression(arg)) {
                  for (const prop of arg.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const key = prop.key.name;
                      const ephemeralPatterns = ['hover', 'dropdown', 'modal', 'loading', 'typing', 'draft', 'expanded', 'collapsed', 'focused'];
                      
                      if (ephemeralPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
                        violations.push({
                          rule: 'saved-user-settings-pattern',
                          severity: 'medium',  // Pattern issue but not breaking
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message: `Saving ephemeral UI state "${key}" to savedUserSettings. Only save important user preferences.`
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
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
            // Store both the exact name and lowercase for comparison
            libraryGlobals.set(lib.name.toLowerCase(), lib.globalVariable);
          }
        }
        
        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Check for destructuring from a variable (library global)
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              const sourceVar = path.node.init.name;
              
              // Check if this looks like a library name (case-insensitive match)
              const matchedLib = Array.from(libraryGlobals.entries()).find(([libName, globalVar]) => 
                sourceVar.toLowerCase() === libName || 
                sourceVar.toLowerCase() === globalVar.toLowerCase()
              );
              
              if (matchedLib) {
                const [libName, correctGlobal] = matchedLib;
                if (sourceVar !== correctGlobal) {
                  violations.push({
                    rule: 'library-variable-names',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Incorrect library global variable "${sourceVar}". Use the exact globalVariable from the library spec: "${correctGlobal}". Change "const { ... } = ${sourceVar};" to "const { ... } = ${correctGlobal};"`
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
                const isLibraryGlobal = Array.from(libraryGlobals.values()).some(
                  global => global === idName
                );
                
                if (isLibraryGlobal) {
                  violations.push({
                    rule: 'library-variable-names', 
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Self-assignment of library global "${idName}". This variable is already available as a global from the library. Remove this line entirely - the library global is already accessible.`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
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
              const missingProps = requiredProps.filter(prop => !passedProps.has(prop));
              
              if (missingProps.length > 0) {
                violations.push({
                  rule: 'pass-standard-props',
                  severity: 'critical',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `Dependency component "${elementName}" is missing required props: ${missingProps.join(', ')}. Components from dependencies must receive styles, utilities, and components props.`,
                  code: `<${elementName} ... />`
                });
              }
            }
          }
        });
        
        return violations;
      }
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
          }
        });
        
        // If there are multiple function declarations and they look like components
        // (start with capital letter), it's likely implementing children
        const componentFunctions = declaredFunctions.filter(name => 
          name !== rootFunctionName && /^[A-Z]/.test(name)
        );
        
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
      }
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
            if (t.isJSXIdentifier(openingElement.name) && /^[A-Z]/.test(openingElement.name.name)) {
              const componentName = openingElement.name.name;
              // Only track if it's from our destructured components
              if (componentsFromProps.has(componentName)) {
                componentsUsedInJSX.add(componentName);
              }
            }
          }
        });
        
        // Only check if we found a components prop
        if (hasComponentsProp && componentsFromProps.size > 0) {
          // Find components that are destructured but never used
          const unusedComponents = Array.from(componentsFromProps).filter(
            comp => !componentsUsedInJSX.has(comp)
          );
          
          if (unusedComponents.length > 0) {
            violations.push({
              rule: 'undefined-component-usage',
              severity: 'low',
              line: 1,
              column: 0,
              message: `Component destructures ${unusedComponents.join(', ')} from components prop but never uses them. These may be missing from the component spec's dependencies array.`
            });
          }
        }
        
        return violations;
      }
    },
    
    {
      name: 'unsafe-array-access',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Check for array[index] patterns
            if (t.isNumericLiteral(path.node.property) || 
                (t.isIdentifier(path.node.property) && path.node.computed && /^\d+$/.test(path.node.property.name))) {
              
              // Look for patterns like: someArray[0].method()
              const parent = path.parent;
              if (t.isMemberExpression(parent) && parent.object === path.node) {
                const code = path.toString();
                
                // Check if it's an array access followed by a method call
                if (/\[\d+\]\.\w+/.test(code)) {
                  violations.push({
                    rule: 'unsafe-array-access',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Unsafe array access: ${code}. Check array bounds before accessing elements.`,
                    code: code
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    },

    {
      name: 'array-reduce-safety',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for .reduce() calls
            if (t.isMemberExpression(path.node.callee) && 
                t.isIdentifier(path.node.callee.property) && 
                path.node.callee.property.name === 'reduce') {
              
              // Check if the array might be empty
              const arrayExpression = path.node.callee.object;
              const code = path.toString();
              
              // Look for patterns that suggest no safety check
              const hasInitialValue = path.node.arguments.length > 1;
              
              if (!hasInitialValue) {
                violations.push({
                  rule: 'array-reduce-safety',
                  severity: 'low',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `reduce() without initial value may fail on empty arrays: ${code}`,
                  code: code.substring(0, 100) + (code.length > 100 ? '...' : '')
                });
              }
              
              // Check for reduce on array access like arr[0].reduce()
              if (t.isMemberExpression(arrayExpression) && 
                  (t.isNumericLiteral(arrayExpression.property) || 
                   (t.isIdentifier(arrayExpression.property) && arrayExpression.computed))) {
                violations.push({
                  rule: 'array-reduce-safety',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `reduce() on array element access is unsafe: ${code}`,
                  code: code.substring(0, 100) + (code.length > 100 ? '...' : '')
                });
              }
            }
          }
        });
        
        return violations;
      }
    },
    
    // {
    //   name: 'parent-event-callback-usage',
    //   appliesTo: 'child',
    //   test: (ast: t.File, componentName: string) => {
    //     const violations: Violation[] = [];
    //     const eventCallbacks = new Map<string, { line: number; column: number }>();
    //     const callbackInvocations = new Set<string>();
    //     const stateUpdateHandlers = new Map<string, string[]>(); // handler -> state updates
        
    //     // First pass: collect event callback props (onSelect, onChange, etc.)
    //     traverse(ast, {
    //       FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
    //         if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
    //           const param = path.node.params[0];
    //           if (t.isObjectPattern(param)) {
    //             for (const prop of param.properties) {
    //               if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
    //                 const propName = prop.key.name;
    //                 // Check for event callback patterns
    //                 if (/^on[A-Z]/.test(propName) && 
    //                     propName !== 'onSaveUserSettings' && 
    //                     !propName.includes('StateChanged')) {
    //                   eventCallbacks.set(propName, {
    //                     line: prop.loc?.start.line || 0,
    //                     column: prop.loc?.start.column || 0
    //                   });
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       },
          
    //       // Also check arrow function components
    //       VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
    //         if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
    //           const init = path.node.init;
    //           if (t.isArrowFunctionExpression(init) && init.params[0]) {
    //             const param = init.params[0];
    //             if (t.isObjectPattern(param)) {
    //               for (const prop of param.properties) {
    //                 if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
    //                   const propName = prop.key.name;
    //                   if (/^on[A-Z]/.test(propName) && 
    //                       propName !== 'onSaveUserSettings' && 
    //                       !propName.includes('StateChanged')) {
    //                     eventCallbacks.set(propName, {
    //                       line: prop.loc?.start.line || 0,
    //                       column: prop.loc?.start.column || 0
    //                     });
    //                   }
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       }
    //     });
        
    //     // Second pass: check if callbacks are invoked in event handlers
    //     traverse(ast, {
    //       CallExpression(path: NodePath<t.CallExpression>) {
    //         // Check for callback invocations
    //         if (t.isIdentifier(path.node.callee)) {
    //           const callbackName = path.node.callee.name;
    //           if (eventCallbacks.has(callbackName)) {
    //             callbackInvocations.add(callbackName);
    //           }
    //         }
            
    //         // Check for state updates (setSelectedId, setFilters, etc.)
    //         if (t.isIdentifier(path.node.callee) && /^set[A-Z]/.test(path.node.callee.name)) {
    //           // Find the containing function
    //           let containingFunction = path.getFunctionParent();
    //           if (containingFunction) {
    //             const funcName = ComponentLinter.getFunctionName(containingFunction);
    //             if (funcName) {
    //               if (!stateUpdateHandlers.has(funcName)) {
    //                 stateUpdateHandlers.set(funcName, []);
    //               }
    //               stateUpdateHandlers.get(funcName)!.push(path.node.callee.name);
    //             }
    //           }
    //         }
    //       },
          
    //       // Check conditional callback invocations
    //       IfStatement(path: NodePath<t.IfStatement>) {
    //         if (t.isBlockStatement(path.node.consequent)) {
    //           // Check if the condition tests for callback existence
    //           if (t.isIdentifier(path.node.test)) {
    //             const callbackName = path.node.test.name;
    //             if (eventCallbacks.has(callbackName)) {
    //               // Check if callback is invoked in the block
    //               let hasInvocation = false;
    //               path.traverse({
    //                 CallExpression(innerPath: NodePath<t.CallExpression>) {
    //                   if (t.isIdentifier(innerPath.node.callee) && 
    //                       innerPath.node.callee.name === callbackName) {
    //                     hasInvocation = true;
    //                     callbackInvocations.add(callbackName);
    //                   }
    //                 }
    //               });
    //             }
    //           }
    //         }
    //       }
    //     });
        
    //     // Check for unused callbacks that have related state updates
    //     for (const [callbackName, location] of eventCallbacks) {
    //       if (!callbackInvocations.has(callbackName)) {
    //         // Try to find related state update handlers
    //         const relatedHandlers: string[] = [];
    //         const expectedStateName = callbackName.replace(/^on/, '').replace(/Change$|Select$/, '');
            
    //         for (const [handlerName, stateUpdates] of stateUpdateHandlers) {
    //           for (const stateUpdate of stateUpdates) {
    //             if (stateUpdate.toLowerCase().includes(expectedStateName.toLowerCase()) ||
    //                 handlerName.toLowerCase().includes(expectedStateName.toLowerCase())) {
    //               relatedHandlers.push(handlerName);
    //               break;
    //             }
    //           }
    //         }
            
    //         if (relatedHandlers.length > 0) {
    //           violations.push({
    //             rule: 'parent-event-callback-usage',
    //             severity: 'critical',
    //             line: location.line,
    //             column: location.column,
    //             message: `Component receives '${callbackName}' event callback but never invokes it. Found state updates in ${relatedHandlers.join(', ')} but parent is not notified.`,
    //             code: `Missing: if (${callbackName}) ${callbackName}(...)`
    //           });
    //         }
    //       }
    //     }
        
    //     return violations;
    //   }
    // },
    
    {
      name: 'property-name-consistency',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const dataTransformations = new Map<string, { originalProps: Set<string>, transformedProps: Set<string>, location: { line: number, column: number } }>();
        const propertyAccesses = new Map<string, Set<string>>(); // variable -> accessed properties
        
        // Track data transformations (especially in map functions)
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Look for array.map transformations
            if (t.isMemberExpression(path.node.callee) && 
                t.isIdentifier(path.node.callee.property) && 
                path.node.callee.property.name === 'map') {
              
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
                        if (t.isMemberExpression(prop.value) && 
                            t.isIdentifier(prop.value.object) && 
                            prop.value.object.name === paramName &&
                            t.isIdentifier(prop.value.property)) {
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
                            column: path.node.loc?.start.column || 0
                          }
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
          }
        });
        
        // Check for mismatches
        for (const [varName, transformation] of dataTransformations) {
          const accesses = propertyAccesses.get(varName);
          if (accesses) {
            for (const accessedProp of accesses) {
              // Check if accessed property exists in transformed props
              if (!transformation.transformedProps.has(accessedProp)) {
                // Check if it's trying to use original prop name
                const matchingOriginal = Array.from(transformation.originalProps).find(
                  orig => orig.toLowerCase() === accessedProp.toLowerCase()
                );
                
                if (matchingOriginal) {
                  // Find the transformed name
                  const transformedName = Array.from(transformation.transformedProps).find(
                    t => t.toLowerCase() === accessedProp.toLowerCase()
                  );
                  
                  violations.push({
                    rule: 'property-name-consistency',
                    severity: 'critical',
                    line: transformation.location.line,
                    column: transformation.location.column,
                    message: `Property name mismatch: data transformed with different casing. Accessing '${accessedProp}' but property was transformed to '${transformedName || 'different name'}'`,
                    code: `Transform uses '${Array.from(transformation.transformedProps).join(', ')}' but code accesses '${accessedProp}'`
                  });
                }
              }
            }
          }
        }
        
        return violations;
      }
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
                        message: `Saving settings on every change/keystroke. Save on blur, submit, or after debouncing.`
                      });
                    }
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
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
                const hasPropDeps = propPatterns.some(p => depsString.includes(p));
                
                if (hasSetState && hasPropDeps && !bodyString.includes('async')) {
                  violations.push({
                    rule: 'prop-state-sync',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Syncing props to internal state with useEffect creates dual state management',
                    code: path.toString().substring(0, 100)
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    },
    
    // DISABLED: Too aggressive - not all array operations need memoization
    // {
    //   name: 'performance-memoization',
    //   appliesTo: 'all',
    //   test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    //     const violations: Violation[] = [];
    //     const memoizedValues = new Set<string>();
    //     
    //     // Collect memoized values
    //     traverse(ast, {
    //       CallExpression(path: NodePath<t.CallExpression>) {
    //         if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useMemo') {
    //           // Find the variable being assigned
    //           if (t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
    //             memoizedValues.add(path.parent.id.name);
    //           }
    //         }
    //       }
    //     });
    //     
    //     // Check for expensive operations without memoization
    //     traverse(ast, {
    //       CallExpression(path: NodePath<t.CallExpression>) {
    //         if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
    //           const method = path.node.callee.property.name;
    //           
    //           // Check for expensive array operations
    //           if (['filter', 'sort', 'map', 'reduce'].includes(method)) {
    //             // Check if this is inside a variable declaration
    //             let parentPath: NodePath | null = path.parentPath;
    //             while (parentPath && !t.isVariableDeclarator(parentPath.node)) {
    //               parentPath = parentPath.parentPath;
    //             }
    //             
    //             if (parentPath && t.isVariableDeclarator(parentPath.node) && t.isIdentifier(parentPath.node.id)) {
    //               const varName = parentPath.node.id.name;
    //               
    //               // Check if it's not memoized
    //               if (!memoizedValues.has(varName)) {
    //                 // Check if it's in the render method (not in event handlers)
    //                 let funcParent = path.getFunctionParent();
    //                 if (funcParent) {
    //                   const funcName = ComponentLinter.getFunctionName(funcParent);
    //                   if (!funcName || funcName === componentName) {
    //                     violations.push({
    //                       rule: 'performance-memoization',
    //                       severity: 'low',  // Just a suggestion, not mandatory
    //                       line: path.node.loc?.start.line || 0,
    //                       column: path.node.loc?.start.column || 0,
    //                       message: `Expensive ${method} operation without memoization. Consider using useMemo.`,
    //                       code: `const ${varName} = ...${method}(...)`
    //                     });
    //                   }
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       },
    //       
    //       // Check for static arrays/objects
    //       VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
    //         if (t.isIdentifier(path.node.id) && 
    //             (t.isArrayExpression(path.node.init) || t.isObjectExpression(path.node.init))) {
    //           
    //           const varName = path.node.id.name;
    //           if (!memoizedValues.has(varName)) {
    //             // Check if it looks static (no variables referenced)
    //             const hasVariables = path.node.init.toString().match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
    //             if (!hasVariables || hasVariables.length < 3) { // Allow some property names
    //               violations.push({
    //                 rule: 'performance-memoization',
    //                 severity: 'low',  // Just a suggestion
    //                 line: path.node.loc?.start.line || 0,
    //                 column: path.node.loc?.start.column || 0,
    //                 message: 'Static array/object recreated on every render. Consider using useMemo.',
    //                 code: `const ${varName} = ${path.node.init.type === 'ArrayExpression' ? '[...]' : '{...}'}`
    //               });
    //             }
    //           }
    //         }
    //       }
    //     });
    //     
    //     return violations;
    //   }
    // },
    
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
                    code: path.toString().substring(0, 100)
                  });
                  return; // Skip further checks for this hook
                }
              }
              
              // Rule 2: Check if hook is inside a conditional (if statement)
              let parent: NodePath | null = path.parentPath;
              while (parent) {
                // Check if we've reached the component function - stop looking
                if (t.isFunctionDeclaration(parent.node) || 
                    t.isFunctionExpression(parent.node) || 
                    t.isArrowFunctionExpression(parent.node)) {
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
                    code: path.toString().substring(0, 100)
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
                    code: path.toString().substring(0, 100)
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
                    code: path.toString().substring(0, 100)
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
                    code: path.toString().substring(0, 100)
                  });
                  break;
                }
                
                // Rule 3: Check for loops
                if (t.isForStatement(parent.node) || 
                    t.isForInStatement(parent.node) || 
                    t.isForOfStatement(parent.node) ||
                    t.isWhileStatement(parent.node) ||
                    t.isDoWhileStatement(parent.node)) {
                  violations.push({
                    rule: 'react-hooks-rules',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `React Hook "${hookName}" may not be called inside a loop. This can lead to hooks being called in different order between renders.`,
                    code: path.toString().substring(0, 100)
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
                    code: path.toString().substring(0, 100)
                  });
                  break;
                }
                
                // Rule 5: Check for early returns before this hook
                // This is complex and would need to track control flow, so we'll do a simpler check
                if (t.isBlockStatement(parent.node)) {
                  const statements = parent.node.body;
                  const hookIndex = statements.findIndex(stmt => stmt === path.parentPath?.node);
                  
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
                        code: path.toString().substring(0, 100)
                      });
                      break;
                    }
                    
                    // Check for conditional returns
                    if (t.isIfStatement(stmt) && ComponentLinter.containsReturn(stmt)) {
                      violations.push({
                        rule: 'react-hooks-rules',
                        severity: 'critical',
                        line: path.node.loc?.start.line || 0,
                        column: path.node.loc?.start.column || 0,
                        message: `React Hook "${hookName}" is called after a possible early return. Move this hook before any conditional logic.`,
                        code: path.toString().substring(0, 100)
                      });
                      break;
                    }
                  }
                }
                
                parent = parent.parentPath;
              }
            }
          }
        });
        
        return violations;
      }
    },
    
    // DISABLED: Too aggressive - flags legitimate state based on naming patterns
    // {
    //   name: 'child-state-management',
    //   appliesTo: 'all',
    //   test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    //     const violations: Violation[] = [];
    //     
    //     traverse(ast, {
    //       CallExpression(path: NodePath<t.CallExpression>) {
    //         if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useState') {
    //           // Check if the state name suggests child component state
    //           if (t.isVariableDeclarator(path.parent) && t.isArrayPattern(path.parent.id)) {
    //             const stateNameNode = path.parent.id.elements[0];
    //             if (t.isIdentifier(stateNameNode)) {
    //               const stateName = stateNameNode.name;
    //               
    //               // Check for patterns suggesting child state management
    //               const childPatterns = [
    //                 /^child/i,
    //                 /Table\w*State/,
    //                 /Panel\w*State/,
    //                 /Modal\w*State/,
    //                 /\w+Component\w*/
    //               ];
    //               
    //               if (childPatterns.some(pattern => pattern.test(stateName))) {
    //                 violations.push({
    //                   rule: 'child-state-management',
    //                   severity: 'critical',
    //                   line: path.node.loc?.start.line || 0,
    //                   column: path.node.loc?.start.column || 0,
    //                   message: `Component trying to manage child component state: ${stateName}. Child components manage their own state!`,
    //                   code: `const [${stateName}, ...] = useState(...)`
    //                 });
    //               }
    //             }
    //           }
    //         }
    //       }
    //     });
    //     
    //     return violations;
    //   }
    // },
    
    {
      name: 'server-reload-on-client-operation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Look for data loading functions
            if (t.isIdentifier(callee) && 
                (callee.name.includes('load') || callee.name.includes('fetch'))) {
              
              // Check if it's called in sort/filter handlers
              let funcParent = path.getFunctionParent();
              if (funcParent) {
                const funcName = ComponentLinter.getFunctionName(funcParent);
                if (funcName && 
                    (funcName.includes('Sort') || funcName.includes('Filter') || 
                     funcName.includes('handleSort') || funcName.includes('handleFilter'))) {
                  violations.push({
                    rule: 'server-reload-on-client-operation',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Reloading data from server on sort/filter. Use useMemo for client-side operations.',
                    code: `${funcName} calls ${callee.name}`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    },

    {
      name: 'runview-runquery-valid-properties',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Valid properties for RunView/RunViews
        const validRunViewProps = new Set([
          'ViewID','ViewName', 'EntityName', 'ExtraFilter', 'OrderBy', 'Fields', 
          'MaxRows', 'StartRow', 'ResultType', 'UserSearchString', 'ForceAuditLog','AuditLogDescription',
          'ResultType'
        ]);
        
        // Valid properties for RunQuery
        const validRunQueryProps = new Set([
          'QueryID', 'QueryName', 'CategoryID', 'CategoryPath', 'Parameters', 'MaxRows', 'StartRow', 'ForceAuditLog','AuditLogDescription'
        ]);
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Check for utilities.rv.RunView or utilities.rv.RunViews
            if (t.isMemberExpression(callee) && 
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) && 
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property) && 
                callee.object.property.name === 'rv' &&
                t.isIdentifier(callee.property)) {
              
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
                    code: `${methodName}()`
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
                    configs = path.node.arguments[0].elements
                      .filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
                  } else {
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: path.node.arguments[0].loc?.start.line || 0,
                      column: path.node.arguments[0].loc?.start.column || 0,
                      message: `RunViews expects an array of RunViewParams objects, not a ${t.isObjectExpression(path.node.arguments[0]) ? 'single object' : 'non-array'}. Use: RunViews([{ EntityName: 'Entity1' }, { EntityName: 'Entity2' }])`,
                      code: path.toString().substring(0, 100)
                    });
                  }
                } else if (methodName === 'RunView') {
                  // RunView takes a single config
                  if (t.isObjectExpression(path.node.arguments[0])) {
                    hasValidFirstParam = true;
                    configs = [path.node.arguments[0]];
                  } else {
                    const argType = t.isStringLiteral(path.node.arguments[0]) ? 'string' : 
                                   t.isArrayExpression(path.node.arguments[0]) ? 'array' :
                                   t.isIdentifier(path.node.arguments[0]) ? 'identifier' : 
                                   'non-object';
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: path.node.arguments[0].loc?.start.line || 0,
                      column: path.node.arguments[0].loc?.start.column || 0,
                      message: `RunView expects a RunViewParams object, not ${argType === 'array' ? 'an' : 'a'} ${argType}. Use: RunView({ EntityName: 'YourEntity' }) or for multiple use RunViews([...])`,
                      code: path.toString().substring(0, 100)
                    });
                  }
                }
                
                if (!hasValidFirstParam) {
                  return;
                }
                
                // Check each config for invalid properties and required fields
                for (const config of configs) {
                  // Check for required properties (must have ViewID, ViewName, ViewEntity, or EntityName)
                  let hasViewID = false;
                  let hasViewName = false;
                  let hasViewEntity = false;
                  let hasEntityName = false;
                  
                  for (const prop of config.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name;
                      
                      if (propName === 'ViewID') hasViewID = true;
                      if (propName === 'ViewName') hasViewName = true;
                      if (propName === 'ViewEntity') hasViewEntity = true;
                      if (propName === 'EntityName') hasEntityName = true;
                      
                      if (!validRunViewProps.has(propName)) {
                        // Special error messages for common mistakes
                        let message = `Invalid property '${propName}' on ${methodName}. Valid properties: ${Array.from(validRunViewProps).join(', ')}`;
                        let fix = `Remove '${propName}' property`;
                        
                        if (propName === 'Parameters') {
                          message = `${methodName} does not support 'Parameters'. Use 'ExtraFilter' for WHERE clauses.`;
                          fix = `Replace 'Parameters' with 'ExtraFilter' and format as SQL WHERE clause`;
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
                          code: `${propName}: ...`
                        });
                      }
                    }
                  }
                  
                  // Check that at least one required property is present
                  if (!hasViewID && !hasViewName && !hasViewEntity && !hasEntityName) {
                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: config.loc?.start.line || 0,
                      column: config.loc?.start.column || 0,
                      message: `${methodName} requires one of: ViewID, ViewName, ViewEntity, or EntityName. Add one to identify what data to retrieve.`,
                      code: `${methodName}({ ... })`
                    });
                  }
                }
              }
            }
            
            // Check for utilities.rq.RunQuery
            if (t.isMemberExpression(callee) && 
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) && 
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property) && 
                callee.object.property.name === 'rq' &&
                t.isIdentifier(callee.property) && 
                callee.property.name === 'RunQuery') {
              
              // Check that first parameter exists and is an object
              if (!path.node.arguments[0]) {
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `RunQuery requires a RunQueryParams object as the first parameter. Must provide an object with either QueryID or QueryName.`,
                  code: `RunQuery()`
                });
              } else if (!t.isObjectExpression(path.node.arguments[0])) {
                // First parameter is not an object
                const argType = t.isStringLiteral(path.node.arguments[0]) ? 'string' : 
                               t.isIdentifier(path.node.arguments[0]) ? 'identifier' : 
                               'non-object';
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.arguments[0].loc?.start.line || 0,
                  column: path.node.arguments[0].loc?.start.column || 0,
                  message: `RunQuery expects a RunQueryParams object, not a ${argType}. Use: RunQuery({ QueryName: 'YourQuery' }) or RunQuery({ QueryID: 'id' })`,
                  code: path.toString().substring(0, 100)
                });
              } else {
                const config = path.node.arguments[0];
                
                // Check for required properties (must have QueryID or QueryName)
                let hasQueryID = false;
                let hasQueryName = false;
                
                for (const prop of config.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    
                    if (propName === 'QueryID') hasQueryID = true;
                    if (propName === 'QueryName') hasQueryName = true;
                    
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
                        code: `${propName}: ...`
                      });
                    }
                  }
                }
                
                // Check that at least one required property is present
                if (!hasQueryID && !hasQueryName) {
                  violations.push({
                    rule: 'runview-runquery-valid-properties',
                    severity: 'critical',
                    line: config.loc?.start.line || 0,
                    column: config.loc?.start.column || 0,
                    message: `RunQuery requires either QueryID or QueryName property. Add one of these to identify the query to run.`,
                    code: `RunQuery({ ... })`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
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
            if (t.isMemberExpression(callee) && 
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) && 
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property) && 
                callee.object.property.name === 'rq' &&
                t.isIdentifier(callee.property) && 
                callee.property.name === 'RunQuery') {
              
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
              
              // Skip if no Parameters property
              if (!parametersNode) return;
              
              // Find the query in componentSpec if available
              let specQuery: ComponentQueryDataRequirement | undefined;
              if (componentSpec?.dataRequirements?.queries && queryName) {
                specQuery = componentSpec.dataRequirements.queries.find(q => q.name === queryName);
              }
              
              // Validate Parameters structure
              const paramValue = parametersNode.value;
              
              // Case 1: Parameters is an array (incorrect format)
              if (t.isArrayExpression(paramValue)) {
                const arrayElements = paramValue.elements.filter((e): e is t.ObjectExpression => 
                  t.isObjectExpression(e)
                );
                
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
                  const objProps = paramPairs.map(p => `  ${p.name}: ${p.value}`).join(',\n');
                  fixCode = `Parameters: {\n${objProps}\n}`;
                  
                  // Check against spec if available
                  if (specQuery?.parameters) {
                    const specParamNames = specQuery.parameters.map(p => p.name);
                    const providedNames = paramPairs.map(p => p.name);
                    const missing = specParamNames.filter(n => !providedNames.includes(n));
                    const extra = providedNames.filter(n => !specParamNames.includes(n));
                    
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
                      .map(p => `  ${p.name}: '${p.testValue || 'value'}'`)
                      .join(',\n');
                    fixCode = `Parameters: {\n${exampleParams}\n}`;
                    fixMessage = `RunQuery Parameters must be object. Expected params: ${specQuery.parameters.map(p => p.name).join(', ')}`;
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
                  code: fixCode
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
                
                const specParamNames = specQuery.parameters.map(p => p.name);
                const specParamNamesLower = specParamNames.map(n => n.toLowerCase());
                
                // Find missing parameters (case-insensitive)
                const missing = specParamNames.filter(n => !providedParamsMap.has(n.toLowerCase()));
                
                // Find extra parameters (not matching any spec param case-insensitively)
                const extra = Array.from(providedParamsMap.values()).filter(
                  providedName => !specParamNamesLower.includes(providedName.toLowerCase())
                );
                
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
                    .map(p => {
                      // Check if we have this param (case-insensitive)
                      const providedName = providedParamsMap.get(p.name.toLowerCase());
                      if (providedName) {
                        // Keep existing value, find the property with case-insensitive match
                        const existingProp = paramValue.properties.find(
                          prop => t.isObjectProperty(prop) && 
                                  t.isIdentifier(prop.key) && 
                                  prop.key.name.toLowerCase() === p.name.toLowerCase()
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
                    code: `Parameters: {\n${correctParams}\n}`
                  });
                }
              }
              // Case 3: Parameters is neither array nor object
              else if (!t.isObjectExpression(paramValue)) {
                let fixCode: string;
                let message: string;
                
                if (specQuery?.parameters && specQuery.parameters.length > 0) {
                  const exampleParams = specQuery.parameters
                    .map(p => `  ${p.name}: '${p.testValue || 'value'}'`)
                    .join(',\n');
                  fixCode = `Parameters: {\n${exampleParams}\n}`;
                  message = `RunQuery Parameters must be object. Expected params from spec: ${specQuery.parameters.map(p => p.name).join(', ')}`;
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
                  code: fixCode
                });
              }
              
              // Additional check: Validate against spec queries list
              if (queryName && componentSpec?.dataRequirements?.queries) {
                const queryExists = componentSpec.dataRequirements.queries.some(q => q.name === queryName);
                if (!queryExists) {
                  const availableQueries = componentSpec.dataRequirements.queries.map(q => q.name).join(', ');
                  violations.push({
                    rule: 'runquery-parameters-validation',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Query '${queryName}' not found in component spec. Available queries: ${availableQueries || 'none'}`,
                    code: `QueryName: '${componentSpec.dataRequirements.queries[0]?.name || 'QueryNameFromSpec'}'`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
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
            if (t.isMemberExpression(callee) && 
                t.isMemberExpression(callee.object) &&
                t.isIdentifier(callee.object.object) && 
                callee.object.object.name === 'utilities' &&
                t.isIdentifier(callee.object.property) && 
                callee.object.property.name === 'rv' &&
                t.isIdentifier(callee.property)) {
              
              const methodName = callee.property.name;
              if (methodName !== 'RunView' && methodName !== 'RunViews') return;
              
              // Get the configs
              let configs: t.ObjectExpression[] = [];
              
              if (methodName === 'RunViews' && t.isArrayExpression(path.node.arguments[0])) {
                configs = path.node.arguments[0].elements
                  .filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
              } else if (methodName === 'RunView' && t.isObjectExpression(path.node.arguments[0])) {
                configs = [path.node.arguments[0]];
              }
              
              // Check each config against spec
              if (componentSpec?.dataRequirements?.entities) {
                const specEntityNames = componentSpec.dataRequirements.entities.map(e => e.name);
                
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
                      code: `EntityName: '${specEntityNames[0] || 'EntityFromSpec'}'`
                    });
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
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
              const hasComponentProps = firstParam && (
                t.isObjectPattern(firstParam) || 
                t.isIdentifier(firstParam)
              );
              
              if (hasComponentProps && funcName[0] !== funcName[0].toUpperCase()) {
                violations.push({
                  rule: 'react-component-naming',
                  severity: 'critical',
                  line: path.node.id.loc?.start.line || 0,
                  column: path.node.id.loc?.start.column || 0,
                  message: `React component "${funcName}" must start with uppercase. JSX treats lowercase as HTML elements.`,
                  code: `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`
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
                }
              });
              
              if (returnsJSX && t.isObjectPattern(firstParam)) {
                // Check if any props match component prop pattern
                const propNames = firstParam.properties
                  .filter((p): p is t.ObjectProperty => t.isObjectProperty(p))
                  .filter(p => t.isIdentifier(p.key))
                  .map(p => (p.key as t.Identifier).name);
                
                const hasComponentLikeProps = propNames.some(name => 
                  ['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings', 
                   'data', 'userState', 'onStateChanged'].includes(name)
                );
                
                if (hasComponentLikeProps && funcName[0] !== funcName[0].toUpperCase()) {
                  violations.push({
                    rule: 'react-component-naming',
                    severity: 'critical',
                    line: path.node.id.loc?.start.line || 0,
                    column: path.node.id.loc?.start.column || 0,
                    message: `Function "${funcName}" appears to be a React component and must start with uppercase.`,
                    code: `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
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
                  code: '${/* value */}'
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
                  code: `'${(left as t.StringLiteral).value}'`
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
                    code: 'Check string quotes and concatenation'
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
                  code: `return \`$\{value}\``
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
                code: `\`${value}\``
              });
            }
          }
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
              code: 'return `${value}`'
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
              code: 'Close template with backtick'
            });
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'root-component-props-restriction',
      appliesTo: 'root',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);
        
        // This rule applies when testing root components
        // We can identify this by checking if the component spec indicates it's a root component
        // For now, we'll apply this rule universally and let the caller decide when to use it
        
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
                    if (!standardProps.has(propName)) {
                      invalidProps.push(propName);
                    }
                  }
                }
                
                // Only report if there are non-standard props
                // This allows the rule to be selectively applied to root components
                if (invalidProps.length > 0) {
                  violations.push({
                    rule: 'root-component-props-restriction',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Component "${componentName}" accepts non-standard props: ${invalidProps.join(', ')}. Root components can only accept standard props: ${Array.from(standardProps).join(', ')}. Load data internally using utilities.rv.RunView().`
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
                      if (!standardProps.has(propName)) {
                        invalidProps.push(propName);
                      }
                    }
                  }
                  
                  if (invalidProps.length > 0) {
                    violations.push({
                      rule: 'root-component-props-restriction',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Component "${componentName}" accepts non-standard props: ${invalidProps.join(', ')}. Root components can only accept standard props: ${Array.from(standardProps).join(', ')}. Load data internally using utilities.rv.RunView().`
                    });
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
    },

    {
      name: 'invalid-components-destructuring',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Build sets of valid component names and library names
        const validComponentNames = new Set<string>();
        const libraryNames = new Set<string>();
        const libraryGlobalVars = new Set<string>();
        
        // Add dependency components
        if (componentSpec?.dependencies) {
          for (const dep of componentSpec.dependencies) {
            if (dep.name) {
              validComponentNames.add(dep.name);
            }
          }
        }
        
        // Add libraries
        if (componentSpec?.libraries) {
          for (const lib of componentSpec.libraries) {
            if (lib.name) {
              libraryNames.add(lib.name);
            }
            if (lib.globalVariable) {
              libraryGlobalVars.add(lib.globalVariable);
            }
          }
        }
        
        // Check for manual destructuring from components (now optional since auto-destructuring is in place)
        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Look for: const { Something } = components;
            if (t.isObjectPattern(path.node.id) && 
                t.isIdentifier(path.node.init) && 
                path.node.init.name === 'components') {
              
              for (const prop of path.node.id.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const destructuredName = prop.key.name;
                  
                  // Check if this is NOT a valid component from dependencies
                  if (!validComponentNames.has(destructuredName)) {
                    // Check if it might be a library being incorrectly destructured
                    if (libraryNames.has(destructuredName) || libraryGlobalVars.has(destructuredName)) {
                      violations.push({
                        rule: 'invalid-components-destructuring',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `Attempting to destructure library "${destructuredName}" from components prop. Libraries should be accessed directly via their globalVariable, not from components.`,
                        code: `const { ${destructuredName} } = components;`
                      });
                    } else {
                      violations.push({
                        rule: 'invalid-components-destructuring',
                        severity: 'high',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `Destructuring "${destructuredName}" from components prop, but it's not in the component's dependencies array. Either add it to dependencies or it might be a missing library.`,
                        code: `const { ${destructuredName} } = components;`
                      });
                    }
                  } else {
                    // Valid component, but manual destructuring is now redundant
                    violations.push({
                      rule: 'invalid-components-destructuring',
                      severity: 'low',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Manual destructuring of "${destructuredName}" from components prop is redundant. Components are now auto-destructured and available directly.`,
                      code: `const { ${destructuredName} } = components; // Can be removed`
                    });
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
    },

    {
      name: 'unsafe-array-operations',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Track which parameters are from props (likely from queries/RunView)
        const propsParams = new Set<string>();
        
        traverse(ast, {
          // Find the main component function to identify props
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id?.name === componentName) {
              const params = path.node.params[0];
              if (t.isObjectPattern(params)) {
                params.properties.forEach(prop => {
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
                  params.properties.forEach(prop => {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      propsParams.add(prop.key.name);
                    }
                  });
                }
              }
            }
          },
          
          // Check for unsafe array operations
          MemberExpression(path: NodePath<t.MemberExpression>) {
            const { object, property } = path.node;
            
            // Check for array methods that will crash on undefined
            const unsafeArrayMethods = ['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'length'];
            
            if (t.isIdentifier(property) && unsafeArrayMethods.includes(property.name)) {
              // Check if the object is a prop parameter
              if (t.isIdentifier(object) && propsParams.has(object.name)) {
                // Look for common data prop patterns
                const isDataProp = object.name.toLowerCase().includes('data') ||
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
                            }
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
                      }
                    });
                    
                    if (hasEarlyReturn) {
                      hasGuard = true;
                    }
                  }
                  
                  if (!hasGuard) {
                    const methodName = property.name;
                    const severity = methodName === 'length' ? 'high' : 'high';
                    
                    violations.push({
                      rule: 'unsafe-array-operations',
                      severity,
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Unsafe operation "${object.name}.${methodName}" on prop that may be undefined. Props from queries/RunView can be null/undefined on initial render. Add a guard: if (!${object.name} || !Array.isArray(${object.name})) return <div>Loading...</div>; OR use: ${object.name}?.${methodName} or (${object.name} || []).${methodName}`,
                      code: `${object.name}.${methodName}`
                    });
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
    },

    {
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
        
        // Track dependency components (these are now auto-destructured in the wrapper)
        if (componentSpec?.dependencies) {
          for (const dep of componentSpec.dependencies) {
            if (dep.name) {
              componentsFromProp.add(dep.name);
              // Mark as available since they're auto-destructured
              availableIdentifiers.add(dep.name);
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
                        message: `JSX component "${tagName}" is not defined. This looks like it should be destructured from the ${libraryNames[0]} library. Add: const { ${tagName} } = ${libraryNames[0]}; at the top of your component function.`,
                        code: `<${tagName} ... />`
                      });
                    } else {
                      // Multiple libraries - suggest checking which one
                      violations.push({
                        rule: 'undefined-jsx-component',
                        severity: 'critical',
                        line: openingElement.loc?.start.line || 0,
                        column: openingElement.loc?.start.column || 0,
                        message: `JSX component "${tagName}" is not defined. Available libraries: ${libraryNames.join(', ')}. Destructure it from the appropriate library, e.g., const { ${tagName} } = LibraryName;`,
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
                    // This shouldn't happen since dependency components are auto-destructured
                    // But keep as a fallback check
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'high',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is in dependencies but appears to be undefined. There may be an issue with component registration.`,
                      code: `<${tagName} ... />`
                    });
                  } else {
                    // Unknown component - not in libraries, not in dependencies
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'high',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is not defined. Either define it in your component, add it to dependencies, or check if it should be destructured from a library.`,
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
    },
    
    {
      name: 'runquery-runview-validation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Extract declared queries and entities from dataRequirements
        const declaredQueries = new Set<string>();
        const declaredEntities = new Set<string>();
        
        if (componentSpec?.dataRequirements) {
          // Handle queries in different possible locations
          if (Array.isArray(componentSpec.dataRequirements)) {
            // If it's an array directly
            componentSpec.dataRequirements.forEach((req: any) => {
              if (req.type === 'query' && req.name) {
                declaredQueries.add(req.name.toLowerCase());
              }
              if (req.type === 'entity' && req.name) {
                declaredEntities.add(req.name.toLowerCase());
              }
            });
          } else if (typeof componentSpec.dataRequirements === 'object') {
            // If it's an object with queries/entities properties
            if (componentSpec.dataRequirements.queries) {
              componentSpec.dataRequirements.queries.forEach((q: any) => {
                if (q.name) declaredQueries.add(q.name.toLowerCase());
              });
            }
            if (componentSpec.dataRequirements.entities) {
              componentSpec.dataRequirements.entities.forEach((e: any) => {
                if (e.name) declaredEntities.add(e.name.toLowerCase());
              });
            }
          }
        }
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Check for RunQuery calls
            if (t.isMemberExpression(callee) && 
                t.isIdentifier(callee.property) && 
                callee.property.name === 'RunQuery') {
              
              const args = path.node.arguments;
              if (args.length > 0 && t.isObjectExpression(args[0])) {
                const props = args[0].properties;
                
                // Find QueryName property
                const queryNameProp = props.find(p => 
                  t.isObjectProperty(p) && 
                  t.isIdentifier(p.key) && 
                  p.key.name === 'QueryName'
                );
                
                if (queryNameProp && t.isObjectProperty(queryNameProp)) {
                  const value = queryNameProp.value;
                  
                  // Check if it's a string literal
                  if (t.isStringLiteral(value)) {
                    const queryName = value.value;
                    
                    // Check if it looks like SQL (contains SELECT, FROM, etc.)
                    const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN'];
                    const upperQuery = queryName.toUpperCase();
                    const looksLikeSQL = sqlKeywords.some(keyword => upperQuery.includes(keyword));
                    
                    if (looksLikeSQL) {
                      violations.push({
                        rule: 'runquery-runview-validation',
                        severity: 'critical',
                        line: value.loc?.start.line || 0,
                        column: value.loc?.start.column || 0,
                        message: `RunQuery cannot accept SQL statements. QueryName must be a registered query name, not SQL: "${queryName.substring(0, 50)}..."`,
                        code: value.value.substring(0, 100)
                      });
                    } else if (declaredQueries.size > 0 && !declaredQueries.has(queryName.toLowerCase())) {
                      // Only validate if we have declared queries
                      violations.push({
                        rule: 'runquery-runview-validation',
                        severity: 'high',
                        line: value.loc?.start.line || 0,
                        column: value.loc?.start.column || 0,
                        message: `Query "${queryName}" is not declared in dataRequirements.queries. Available queries: ${Array.from(declaredQueries).join(', ')}`,
                        code: path.toString().substring(0, 100)
                      });
                    }
                  } else if (t.isIdentifier(value) || t.isTemplateLiteral(value)) {
                    // Dynamic query name - check if it might be SQL
                    violations.push({
                      rule: 'runquery-runview-validation',
                      severity: 'medium',
                      line: value.loc?.start.line || 0,
                      column: value.loc?.start.column || 0,
                      message: `Dynamic QueryName detected. Ensure this is a query name, not a SQL statement.`,
                      code: path.toString().substring(0, 100)
                    });
                  }
                }
              }
            }
            
            // Check for RunView calls
            if (t.isMemberExpression(callee) && 
                t.isIdentifier(callee.property) && 
                (callee.property.name === 'RunView' || callee.property.name === 'RunViews')) {
              
              const args = path.node.arguments;
              
              // Handle both single object and array of objects
              const checkEntityName = (objExpr: t.ObjectExpression) => {
                const entityNameProp = objExpr.properties.find(p => 
                  t.isObjectProperty(p) && 
                  t.isIdentifier(p.key) && 
                  p.key.name === 'EntityName'
                );
                
                if (entityNameProp && t.isObjectProperty(entityNameProp) && t.isStringLiteral(entityNameProp.value)) {
                  const entityName = entityNameProp.value.value;
                  
                  if (declaredEntities.size > 0 && !declaredEntities.has(entityName.toLowerCase())) {
                    violations.push({
                      rule: 'runquery-runview-validation',
                      severity: 'high',
                      line: entityNameProp.value.loc?.start.line || 0,
                      column: entityNameProp.value.loc?.start.column || 0,
                      message: `Entity "${entityName}" is not declared in dataRequirements.entities. Available entities: ${Array.from(declaredEntities).join(', ')}`,
                      code: path.toString().substring(0, 100)
                    });
                  }
                }
              };
              
              if (args.length > 0) {
                if (t.isObjectExpression(args[0])) {
                  checkEntityName(args[0]);
                } else if (t.isArrayExpression(args[0])) {
                  args[0].elements.forEach(elem => {
                    if (t.isObjectExpression(elem)) {
                      checkEntityName(elem);
                    }
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'runview-runquery-result-direct-usage',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Track variables that hold RunView/RunQuery results
        const resultVariables = new Map<string, { line: number; column: number; method: string }>();
        
        traverse(ast, {
          // First pass: identify RunView/RunQuery calls and their assigned variables
          AwaitExpression(path: NodePath<t.AwaitExpression>) {
            const callExpr = path.node.argument;
            
            if (t.isCallExpression(callExpr) && t.isMemberExpression(callExpr.callee)) {
              const callee = callExpr.callee;
              
              // Check for utilities.rv.RunView or utilities.rq.RunQuery pattern
              if (t.isMemberExpression(callee.object) && 
                  t.isIdentifier(callee.object.object) && 
                  callee.object.object.name === 'utilities') {
                
                const method = t.isIdentifier(callee.property) ? callee.property.name : '';
                const isRunView = method === 'RunView' || method === 'RunViews';
                const isRunQuery = method === 'RunQuery';
                
                if (isRunView || isRunQuery) {
                  // Check if this is being assigned to a variable
                  const parent = path.parent;
                  
                  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
                    // const result = await utilities.rv.RunView(...)
                    resultVariables.set(parent.id.name, {
                      line: parent.id.loc?.start.line || 0,
                      column: parent.id.loc?.start.column || 0,
                      method: isRunView ? 'RunView' : 'RunQuery'
                    });
                  } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
                    // result = await utilities.rv.RunView(...)
                    resultVariables.set(parent.left.name, {
                      line: parent.left.loc?.start.line || 0,
                      column: parent.left.loc?.start.column || 0,
                      method: isRunView ? 'RunView' : 'RunQuery'
                    });
                  }
                }
              }
            }
          }
        });
        
        // Second pass: check for misuse of these result variables
        traverse(ast, {
          // Check for direct array operations
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for array methods being called on result objects
            if (t.isMemberExpression(path.node.callee) && 
                t.isIdentifier(path.node.callee.object) &&
                t.isIdentifier(path.node.callee.property)) {
              
              const objName = path.node.callee.object.name;
              const methodName = path.node.callee.property.name;
              
              // Array methods that would fail on a result object
              const arrayMethods = ['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'sort', 'concat'];
              
              if (resultVariables.has(objName) && arrayMethods.includes(methodName)) {
                const resultInfo = resultVariables.get(objName)!;
                violations.push({
                  rule: 'runview-runquery-result-direct-usage',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Cannot call array method "${methodName}" directly on ${resultInfo.method} result. Use "${objName}.Results.${methodName}(...)" instead. ${resultInfo.method} returns an object with { Success, Results, ... }, not an array.`,
                  code: `${objName}.${methodName}(...)`
                });
              }
            }
          },
          
          // Check for direct usage in setState or as function arguments
          Identifier(path: NodePath<t.Identifier>) {
            const varName = path.node.name;
            
            if (resultVariables.has(varName)) {
              const resultInfo = resultVariables.get(varName)!;
              const parent = path.parent;
              
              // Check if being passed to setState-like functions
              if (t.isCallExpression(parent) && path.node === parent.arguments[0]) {
                const callee = parent.callee;
                
                // Check for setState patterns
                if (t.isIdentifier(callee) && /^set[A-Z]/.test(callee.name)) {
                  // Likely a setState function
                  violations.push({
                    rule: 'runview-runquery-result-direct-usage',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Passing ${resultInfo.method} result directly to setState. Use "${varName}.Results" or check "${varName}.Success" first. ${resultInfo.method} returns { Success, Results, ErrorMessage }, not the data array.`,
                    code: `${callee.name}(${varName})`
                  });
                }
                
                // Check for array-expecting functions
                if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                  const methodName = callee.property.name;
                  if (methodName === 'concat' || methodName === 'push' || methodName === 'unshift') {
                    violations.push({
                      rule: 'runview-runquery-result-direct-usage',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Passing ${resultInfo.method} result to array method. Use "${varName}.Results" instead of "${varName}".`,
                      code: `...${methodName}(${varName})`
                    });
                  }
                }
              }
              
              // Check for ternary with Array.isArray check (common pattern)
              if (t.isConditionalExpression(parent) && 
                  t.isCallExpression(parent.test) &&
                  t.isMemberExpression(parent.test.callee) &&
                  t.isIdentifier(parent.test.callee.object) &&
                  parent.test.callee.object.name === 'Array' &&
                  t.isIdentifier(parent.test.callee.property) &&
                  parent.test.callee.property.name === 'isArray') {
                
                // Pattern: Array.isArray(result) ? result : []
                if (parent.test.arguments[0] === path.node && parent.consequent === path.node) {
                  violations.push({
                    rule: 'runview-runquery-result-direct-usage',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `${resultInfo.method} result is never an array. Use "${varName}.Results || []" instead of "Array.isArray(${varName}) ? ${varName} : []".`,
                    code: `Array.isArray(${varName}) ? ${varName} : []`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'runquery-runview-result-structure',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
        const violations: Violation[] = [];
        
        // Valid properties for RunQueryResult based on MJCore type definition
        const validRunQueryResultProps = new Set([
          'QueryID',           // string
          'QueryName',         // string
          'Success',           // boolean
          'Results',           // any[]
          'RowCount',          // number
          'TotalRowCount',     // number
          'ExecutionTime',     // number
          'ErrorMessage',      // string
          'AppliedParameters', // Record<string, any> (optional)
          'CacheHit',          // boolean (optional)
          'CacheKey',          // string (optional)
          'CacheTTLRemaining'  // number (optional)
        ]);
        
        // Valid properties for RunViewResult based on MJCore type definition
        const validRunViewResultProps = new Set([
          'Success',           // boolean
          'Results',           // Array<T>
          'UserViewRunID',     // string (optional)
          'RowCount',          // number
          'TotalRowCount',     // number
          'ExecutionTime',     // number
          'ErrorMessage'       // string
        ]);
        
        // Map of common incorrect properties to the correct property
        const incorrectToCorrectMap: Record<string, string> = {
          'data': 'Results',
          'Data': 'Results',
          'rows': 'Results',
          'Rows': 'Results',
          'records': 'Results',
          'Records': 'Results',
          'items': 'Results',
          'Items': 'Results',
          'values': 'Results',
          'Values': 'Results',
          'result': 'Results',
          'Result': 'Results',
          'resultSet': 'Results',
          'ResultSet': 'Results',
          'dataset': 'Results',
          'Dataset': 'Results',
          'response': 'Results',
          'Response': 'Results'
        };
        
        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            // Check if this is accessing a property on a variable that looks like a query/view result
            if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
              const objName = path.node.object.name;
              const propName = path.node.property.name;
              
              // Only check if we can definitively trace this to RunQuery or RunView
              const isFromRunQuery = path.scope.hasBinding(objName) && 
                                    ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunQuery');
              const isFromRunView = path.scope.hasBinding(objName) && 
                                   ComponentLinter.isVariableFromRunQueryOrView(path, objName, 'RunView');
              
              // Only validate if we're CERTAIN it's from RunQuery or RunView
              if (isFromRunQuery || isFromRunView) {
                // WHITELIST APPROACH: Check if the property is valid for the result type
                const isValidQueryProp = validRunQueryResultProps.has(propName);
                const isValidViewProp = validRunViewResultProps.has(propName);
                
                // If it's specifically from RunQuery or RunView, be more specific
                if (isFromRunQuery && !isValidQueryProp) {
                  // Property is not valid for RunQueryResult
                  const suggestion = incorrectToCorrectMap[propName];
                  if (suggestion) {
                    violations.push({
                      rule: 'runquery-result-invalid-property',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `RunQuery results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`,
                      code: `${objName}.${propName}`
                    });
                  } else {
                    violations.push({
                      rule: 'runquery-result-invalid-property',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Invalid property "${propName}" on RunQuery result. Valid properties are: ${Array.from(validRunQueryResultProps).join(', ')}`,
                      code: `${objName}.${propName}`
                    });
                  }
                } else if (isFromRunView && !isValidViewProp) {
                  // Property is not valid for RunViewResult
                  const suggestion = incorrectToCorrectMap[propName];
                  if (suggestion) {
                    violations.push({
                      rule: 'runview-result-invalid-property',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `RunView results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`,
                      code: `${objName}.${propName}`
                    });
                  } else {
                    violations.push({
                      rule: 'runview-result-invalid-property',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Invalid property "${propName}" on RunView result. Valid properties are: ${Array.from(validRunViewResultProps).join(', ')}`,
                      code: `${objName}.${propName}`
                    });
                  }
                }
                
                // Check for nested incorrect access like result.data.entities or result.Data.entities
                if (t.isMemberExpression(path.parent) && 
                    t.isIdentifier(path.parent.property) && 
                    (propName === 'data' || propName === 'Data')) {
                  const nestedProp = path.parent.property.name;
                  violations.push({
                    rule: 'runquery-runview-result-structure',
                    severity: 'critical',
                    line: path.parent.loc?.start.line || 0,
                    column: path.parent.loc?.start.column || 0,
                    message: `Incorrect nested property access "${objName}.${propName}.${nestedProp}". RunQuery/RunView results use ".Results" directly for the data array. Change to "${objName}.Results"`,
                    code: `${objName}.${propName}.${nestedProp}`
                  });
                }
              }
            }
          },
          
          // Check for destructuring patterns
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            // Check for destructuring from a result object
            if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
              const sourceName = path.node.init.name;
              
              // Only check if we can definitively trace this to RunQuery or RunView
              const isFromRunQuery = path.scope.hasBinding(sourceName) && 
                                    ComponentLinter.isVariableFromRunQueryOrView(path, sourceName, 'RunQuery');
              const isFromRunView = path.scope.hasBinding(sourceName) && 
                                   ComponentLinter.isVariableFromRunQueryOrView(path, sourceName, 'RunView');
              
              // Only validate if we're CERTAIN it's from RunQuery or RunView
              if (isFromRunQuery || isFromRunView) {
                for (const prop of path.node.id.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    
                    // WHITELIST APPROACH: Check if property is valid
                    const isValidQueryProp = validRunQueryResultProps.has(propName);
                    const isValidViewProp = validRunViewResultProps.has(propName);
                    
                    if (isFromRunQuery && !isValidQueryProp) {
                      const suggestion = incorrectToCorrectMap[propName];
                      violations.push({
                        rule: 'runquery-result-invalid-destructuring',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: suggestion 
                          ? `Destructuring invalid property "${propName}" from RunQuery result. Use "${suggestion}" instead. Change "const { ${propName} } = ${sourceName}" to "const { ${suggestion} } = ${sourceName}"`
                          : `Destructuring invalid property "${propName}" from RunQuery result. Valid properties: ${Array.from(validRunQueryResultProps).join(', ')}`,
                        code: `{ ${propName} }`
                      });
                    } else if (isFromRunView && !isValidViewProp) {
                      const suggestion = incorrectToCorrectMap[propName];
                      violations.push({
                        rule: 'runview-result-invalid-destructuring',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: suggestion
                          ? `Destructuring invalid property "${propName}" from RunView result. Use "${suggestion}" instead. Change "const { ${propName} } = ${sourceName}" to "const { ${suggestion} } = ${sourceName}"`
                          : `Destructuring invalid property "${propName}" from RunView result. Valid properties: ${Array.from(validRunViewResultProps).join(', ')}`,
                        code: `{ ${propName} }`
                      });
                    }
                  }
                }
              }
            }
          },
          
          // Check for conditional access without checking Success
          IfStatement(path: NodePath<t.IfStatement>) {
            const test = path.node.test;
            
            // Look for patterns like: if (result) or if (result.Results) without checking Success
            if (t.isIdentifier(test) || 
                (t.isMemberExpression(test) && 
                 t.isIdentifier(test.object) && 
                 t.isIdentifier(test.property) && 
                 test.property.name === 'Results')) {
              
              let varName = '';
              if (t.isIdentifier(test)) {
                varName = test.name;
              } else if (t.isMemberExpression(test) && t.isIdentifier(test.object)) {
                varName = test.object.name;
              }
              
              // Check if this variable is from RunQuery/RunView
              if (/result|response|res/i.test(varName)) {
                // Look for .Results access in the consequent without .Success check
                let hasResultsAccess = false;
                let hasSuccessCheck = false;
                
                traverse(path.node, {
                  MemberExpression(innerPath: NodePath<t.MemberExpression>) {
                    if (t.isIdentifier(innerPath.node.object) && 
                        innerPath.node.object.name === varName) {
                      if (t.isIdentifier(innerPath.node.property)) {
                        if (innerPath.node.property.name === 'Results') {
                          hasResultsAccess = true;
                        }
                        if (innerPath.node.property.name === 'Success') {
                          hasSuccessCheck = true;
                        }
                      }
                    }
                  }
                }, path.scope);
                
                if (hasResultsAccess && !hasSuccessCheck) {
                  violations.push({
                    rule: 'runquery-runview-result-structure',
                    severity: 'medium',
                    line: test.loc?.start.line || 0,
                    column: test.loc?.start.column || 0,
                    message: `Accessing "${varName}.Results" without checking "${varName}.Success" first. Always verify Success before accessing Results.`,
                    code: `if (${varName}) { ... ${varName}.Results ... }`
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
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
        
        // Build a map of dependency components and their expected props
        const dependencyPropsMap = new Map<string, { 
          required: string[], 
          all: string[],
          location: string 
        }>();
        
        for (const dep of componentSpec.dependencies) {
          const requiredProps = dep.properties
            ?.filter(p => p.required)
            ?.map(p => p.name) || [];
          const allProps = dep.properties?.map(p => p.name) || [];
          dependencyPropsMap.set(dep.name, { 
            required: requiredProps, 
            all: allProps,
            location: dep.location || 'embedded'
          });
        }
        
        // Helper function to find closest matching prop name
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
                  matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                  );
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
            if (distance < bestDistance && distance <= 3) { // Max distance of 3 for suggestions
              bestDistance = distance;
              bestMatch = candidate;
            }
          }
          
          return bestMatch || null;
        }
        
        // Standard props that are always valid (passed by the runtime)
        const standardProps = new Set([
          'styles', 'utilities', 'components', 'callbacks', 
          'savedUserSettings', 'onSaveUserSettings'
        ]);
        
        // Track JSX elements and their props
        traverse(ast, {
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;
            
            // Get the element name
            let elementName = '';
            if (t.isJSXIdentifier(openingElement.name)) {
              elementName = openingElement.name.name;
            } else if (t.isJSXMemberExpression(openingElement.name)) {
              // Handle cases like <MaterialUI.Button>
              return; // Skip member expressions for now
            }
            
            // Check if this is one of our dependencies
            if (dependencyPropsMap.has(elementName)) {
              const { required, all, location } = dependencyPropsMap.get(elementName)!;
              
              // Get passed props
              const passedProps = new Set<string>();
              const propLocations = new Map<string, { line: number, column: number }>();
              
              for (const attr of openingElement.attributes) {
                if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                  const propName = attr.name.name;
                  passedProps.add(propName);
                  propLocations.set(propName, {
                    line: attr.loc?.start.line || 0,
                    column: attr.loc?.start.column || 0
                  });
                }
              }
              
              // Check for missing required props
              for (const requiredProp of required) {
                if (!passedProps.has(requiredProp) && !standardProps.has(requiredProp)) {
                  violations.push({
                    rule: 'dependency-prop-validation',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `Missing required prop '${requiredProp}' for dependency component '${elementName}'`,
                    code: `<${elementName} ... />`
                  });
                }
              }
              
              // Check for unknown props (potential typos)
              for (const passedProp of passedProps) {
                // Skip standard props and spread operators
                if (standardProps.has(passedProp) || passedProp === 'key' || passedProp === 'ref') {
                  continue;
                }
                
                if (!all.includes(passedProp)) {
                  // Try to find a close match
                  const suggestion = findClosestMatch(passedProp, all);
                  
                  if (suggestion) {
                    const loc = propLocations.get(passedProp);
                    violations.push({
                      rule: 'dependency-prop-validation',
                      severity: 'high',
                      line: loc?.line || openingElement.loc?.start.line || 0,
                      column: loc?.column || openingElement.loc?.start.column || 0,
                      message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. Did you mean '${suggestion}'?`,
                      code: `${passedProp}={...}`
                    });
                  } else {
                    const loc = propLocations.get(passedProp);
                    violations.push({
                      rule: 'dependency-prop-validation',
                      severity: 'medium',
                      line: loc?.line || openingElement.loc?.start.line || 0,
                      column: loc?.column || openingElement.loc?.start.column || 0,
                      message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. Expected props: ${all.join(', ')}`,
                      code: `${passedProp}={...}`
                    });
                  }
                }
              }
            }
          }
        });
        
        return violations;
      }
    }
  ];
  
  public static async lintComponent(
    code: string,
    componentName: string,
    componentSpec?: ComponentSpec,
    isRootComponent?: boolean,
    contextUser?: UserInfo,
    debugMode?: boolean
  ): Promise<LintResult> {
    try {
      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });
      
      // Use universal rules for all components in the new pattern
      let rules = this.universalComponentRules;
      
      // Filter rules based on component type and appliesTo property
      if (isRootComponent) {
        // Root components: include 'all' and 'root' rules
        rules = rules.filter(rule => rule.appliesTo === 'all' || rule.appliesTo === 'root');
      } else {
        // Child components: include 'all' and 'child' rules
        rules = rules.filter(rule => rule.appliesTo === 'all' || rule.appliesTo === 'child');
      }
      
      const violations: Violation[] = [];
      
      // Run each rule
      for (const rule of rules) {
        const ruleViolations = rule.test(ast, componentName, componentSpec);
        violations.push(...ruleViolations);
      }
      
      // Add data requirements validation if componentSpec is provided
      if (componentSpec?.dataRequirements?.entities) {
        const dataViolations = this.validateDataRequirements(ast, componentSpec);
        violations.push(...dataViolations);
      }
      
      // Apply library-specific lint rules if available
      if (componentSpec?.libraries && contextUser) {
        const libraryViolations = await this.applyLibraryLintRules(ast, componentSpec, contextUser, debugMode);
        violations.push(...libraryViolations);
      }
      
      // Deduplicate violations - keep only unique rule+message combinations
      const uniqueViolations = this.deduplicateViolations(violations);
      
      // Count violations by severity
      const criticalCount = uniqueViolations.filter(v => v.severity === 'critical').length;
      const highCount = uniqueViolations.filter(v => v.severity === 'high').length;
      const mediumCount = uniqueViolations.filter(v => v.severity === 'medium').length;
      const lowCount = uniqueViolations.filter(v => v.severity === 'low').length;
      
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
        const libraryViolations = uniqueViolations.filter(v => v.rule.includes('-validator'));
        if (libraryViolations.length > 0) {
          console.log('\n📚 Library-Specific Issues:');
          const byLibrary = new Map<string, Violation[]>();
          libraryViolations.forEach(v => {
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
      
      // Generate fix suggestions
      const suggestions = this.generateFixSuggestions(uniqueViolations);
      
      return {
        success: criticalCount === 0 && highCount === 0,  // Only fail on critical/high
        violations: uniqueViolations,
        suggestions,
        criticalCount,
        highCount,
        mediumCount,
        lowCount
      };
    } catch (error) {
      // If parsing fails, return a parse error
      return {
        success: false,
        violations: [{
          rule: 'parse-error',
          severity: 'critical',
          line: 0,
          column: 0,
          message: `Failed to parse component: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        suggestions: []
      };
    }
  }
  
  private static validateDataRequirements(ast: t.File, componentSpec: ComponentSpec): Violation[] {
    const violations: Violation[] = [];
    
    // Extract entity names from dataRequirements
    const requiredEntities = new Set<string>();
    const requiredQueries = new Set<string>();
    
    // Map to store full query definitions for parameter validation
    const queryDefinitionsMap = new Map<string, ComponentQueryDataRequirement>();
    
    // Map to track allowed fields per entity
    const entityFieldsMap = new Map<string, {
      displayFields: Set<string>;
      filterFields: Set<string>;
      sortFields: Set<string>;
    }>();
    
    if (componentSpec.dataRequirements?.entities) {
      for (const entity of componentSpec.dataRequirements.entities) {
        if (entity.name) {
          requiredEntities.add(entity.name);
          entityFieldsMap.set(entity.name, {
            displayFields: new Set(entity.displayFields || []),
            filterFields: new Set(entity.filterFields || []),
            sortFields: new Set(entity.sortFields || [])
          });
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
                  sortFields: new Set(entity.sortFields || [])
                });
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
        if (t.isMemberExpression(path.node.callee) && 
            t.isMemberExpression(path.node.callee.object) &&
            t.isIdentifier(path.node.callee.object.object) && 
            path.node.callee.object.object.name === 'utilities' &&
            t.isIdentifier(path.node.callee.object.property) && 
            path.node.callee.object.property.name === 'rv' &&
            t.isIdentifier(path.node.callee.property) && 
            (path.node.callee.property.name === 'RunView' || path.node.callee.property.name === 'RunViews')) {
          
          // For RunViews, it might be an array of configs
          const configs = path.node.callee.property.name === 'RunViews' && 
                          path.node.arguments.length > 0 && 
                          t.isArrayExpression(path.node.arguments[0])
            ? path.node.arguments[0].elements.filter(e => t.isObjectExpression(e))
            : path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])
            ? [path.node.arguments[0]]
            : [];
          
          // Check each config object
          for (const configObj of configs) {
            if (t.isObjectExpression(configObj)) {
              // Find EntityName property
              for (const prop of configObj.properties) {
                if (t.isObjectProperty(prop) && 
                    t.isIdentifier(prop.key) && 
                    prop.key.name === 'EntityName' &&
                    t.isStringLiteral(prop.value)) {
                  
                  const usedEntity = prop.value.value;
                  
                  // Check if this entity is in the required entities
                  if (requiredEntities.size > 0 && !requiredEntities.has(usedEntity)) {
                    // Enhanced fuzzy matching for better suggestions
                    const possibleMatches = Array.from(requiredEntities).filter(e => {
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
                    const entityList = allEntities.length <= 5 
                      ? allEntities.join(', ')
                      : allEntities.slice(0, 5).join(', ') + `, ... (${allEntities.length} total)`;
                    
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
                      code: `EntityName: "${usedEntity}"`
                    });
                  } else {
                    // Entity is valid, now check fields
                    const entityFields = entityFieldsMap.get(usedEntity);
                    if (entityFields) {
                      // Check Fields array
                      const fieldsProperty = configObj.properties.find(p => 
                        t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'Fields'
                      );
                      
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
                                code: fieldName
                              });
                            } else {
                              // Check if field is in allowed fields
                              const isAllowed = entityFields.displayFields.has(fieldName) ||
                                              entityFields.filterFields.has(fieldName) ||
                                              entityFields.sortFields.has(fieldName);
                              
                              if (!isAllowed) {
                                violations.push({
                                  rule: 'field-not-in-requirements',
                                  severity: 'critical',
                                  line: fieldElement.loc?.start.line || 0,
                                  column: fieldElement.loc?.start.column || 0,
                                  message: `Field "${fieldName}" not found in dataRequirements for entity "${usedEntity}". Available fields: ${
                                    [...entityFields.displayFields, ...entityFields.filterFields, ...entityFields.sortFields].join(', ')
                                  }`,
                                  code: fieldName
                                });
                              }
                            }
                          }
                        }
                      }
                      
                      // Check OrderBy field
                      const orderByProperty = configObj.properties.find(p => 
                        t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'OrderBy'
                      );
                      
                      if (orderByProperty && t.isObjectProperty(orderByProperty) && t.isStringLiteral(orderByProperty.value)) {
                        const orderByValue = orderByProperty.value.value;
                        // Extract field name from OrderBy (e.g., "AccountName ASC" -> "AccountName")
                        const orderByField = orderByValue.split(/\s+/)[0];
                        
                        if (!entityFields.sortFields.has(orderByField)) {
                          violations.push({
                            rule: 'orderby-field-not-sortable',
                            severity: 'critical',
                            line: orderByProperty.value.loc?.start.line || 0,
                            column: orderByProperty.value.loc?.start.column || 0,
                            message: `OrderBy field "${orderByField}" not in sortFields for entity "${usedEntity}". Available sort fields: ${
                              [...entityFields.sortFields].join(', ')
                            }`,
                            code: orderByValue
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
        
        // Check for utilities.rv.RunQuery pattern
        if (t.isMemberExpression(path.node.callee) && 
            t.isMemberExpression(path.node.callee.object) &&
            t.isIdentifier(path.node.callee.object.object) && 
            path.node.callee.object.object.name === 'utilities' &&
            t.isIdentifier(path.node.callee.object.property) && 
            path.node.callee.object.property.name === 'rv' &&
            t.isIdentifier(path.node.callee.property) && 
            path.node.callee.property.name === 'RunQuery') {
          
          // Check the first argument (should be an object with QueryName)
          if (path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])) {
            const configObj = path.node.arguments[0];
            
            // Find QueryName property
            for (const prop of configObj.properties) {
              if (t.isObjectProperty(prop) && 
                  t.isIdentifier(prop.key) && 
                  prop.key.name === 'QueryName' &&
                  t.isStringLiteral(prop.value)) {
                
                const usedQuery = prop.value.value;
                
                // Check if this query is in the required queries
                if (requiredQueries.size > 0 && !requiredQueries.has(usedQuery)) {
                  // Enhanced fuzzy matching for better suggestions
                  const possibleMatches = Array.from(requiredQueries).filter(q => {
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
                  const queryList = allQueries.length <= 5
                    ? allQueries.join(', ')
                    : allQueries.slice(0, 5).join(', ') + `, ... (${allQueries.length} total)`;
                  
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
                    code: `QueryName: "${usedQuery}"`
                  });
                } else if (queryDefinitionsMap.has(usedQuery)) {
                  // Query is valid, now check parameters
                  const queryDef = queryDefinitionsMap.get(usedQuery);
                  if (queryDef?.parameters && queryDef.parameters.length > 0) {
                    // Extract parameters from the RunQuery call
                    const paramsInCall = new Map<string, any>();
                    
                    // Look for Parameters property in the config object
                    for (const prop of configObj.properties) {
                      if (t.isObjectProperty(prop) && 
                          t.isIdentifier(prop.key) && 
                          prop.key.name === 'Parameters' &&
                          t.isObjectExpression(prop.value)) {
                        
                        // Extract each parameter from the Parameters object
                        for (const paramProp of prop.value.properties) {
                          if (t.isObjectProperty(paramProp) && t.isIdentifier(paramProp.key)) {
                            paramsInCall.set(paramProp.key.name, paramProp);
                          }
                        }
                        
                        // Check for required parameters
                        const requiredParams = queryDef.parameters.filter(p => p.value !== '@runtime' || p.value === '@runtime');
                        for (const reqParam of requiredParams) {
                          if (!paramsInCall.has(reqParam.name)) {
                            violations.push({
                              rule: 'missing-query-parameter',
                              severity: 'critical',
                              line: prop.value.loc?.start.line || 0,
                              column: prop.value.loc?.start.column || 0,
                              message: `Missing required parameter "${reqParam.name}" for query "${usedQuery}". ${reqParam.description ? `Description: ${reqParam.description}` : ''}`,
                              code: `Parameters: { ${reqParam.name}: ... }`
                            });
                          }
                        }
                        
                        // Check for unknown parameters
                        const validParamNames = new Set(queryDef.parameters.map(p => p.name));
                        for (const [paramName, paramNode] of paramsInCall) {
                          if (!validParamNames.has(paramName)) {
                            violations.push({
                              rule: 'unknown-query-parameter',
                              severity: 'high',
                              line: (paramNode as any).loc?.start.line || 0,
                              column: (paramNode as any).loc?.start.column || 0,
                              message: `Unknown parameter "${paramName}" for query "${usedQuery}". Valid parameters: ${Array.from(validParamNames).join(', ')}`,
                              code: `${paramName}: ...`
                            });
                          }
                        }
                        
                        break; // Found Parameters property, no need to continue
                      }
                    }
                    
                    // If query has parameters but no Parameters property was found in the call
                    if (paramsInCall.size === 0 && queryDef.parameters.length > 0) {
                      violations.push({
                        rule: 'missing-parameters-object',
                        severity: 'critical',
                        line: configObj.loc?.start.line || 0,
                        column: configObj.loc?.start.column || 0,
                        message: `Query "${usedQuery}" requires parameters but none were provided. Required parameters: ${queryDef.parameters.map(p => p.name).join(', ')}`,
                        code: `RunQuery({ QueryName: "${usedQuery}", Parameters: { ... } })`
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
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
  
  private static generateFixSuggestions(violations: Violation[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    for (const violation of violations) {
      switch (violation.rule) {
        case 'no-import-statements':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove all import statements. Interactive components receive everything through props.',
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
// 4. Available globally (React hooks)`
          });
          break;
          
        case 'no-export-statements':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove all export statements. The component function should be the only code, not exported.',
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
// will execute the function directly.`
          });
          break;
          
        case 'no-require-statements':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove all require() and dynamic import() statements. Use props instead.',
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
// No module loading allowed!`
          });
          break;
          
        case 'use-function-declaration':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use function declaration syntax for TOP-LEVEL component definitions. Arrow functions are fine inside components.',
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
// 5. Easier to distinguish from regular variables`
          });
          break;
          
        case 'no-return-component':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove the return statement at the end of the file. The component function should stand alone.',
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
// by its function name. No need to return or reference it!`
          });
          break;
          
        case 'no-iife-wrapper':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
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
// 5. Unnecessary complexity`
          });
          break;
          
        case 'full-state-ownership':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Components must manage ALL their own state internally. Use proper naming conventions for initialization.',
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
// - Controlled patterns (value + onChange, checked + onChange)`
          });
          break;
          
        case 'no-use-reducer':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use useState for state management, not useReducer',
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
}`
          });
          break;
          
        case 'no-data-prop':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Replace generic data prop with specific named props',
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
const result = await utilities.rv.RunView({ entityName: 'Items' });`
          });
          break;
          
          
        case 'saved-user-settings-pattern':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Only save important user preferences, not ephemeral UI state',
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
};`
          });
          break;
          
        case 'pass-standard-props':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Always pass standard props to all components',
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
/>`
          });
          break;
          
        case 'no-child-implementation':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove child component implementations. Only the root component function should be in this file',
            example: 'Move child component functions to separate generation requests'
          });
          break;
          
        case 'undefined-component-usage':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Ensure all components destructured from the components prop are defined in the component spec dependencies',
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
// All these will be available`
          });
          break;
          
        case 'unsafe-array-access':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Always check array bounds before accessing elements',
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
const total = data[0]?.reduce((sum, item) => sum + item.value, 0) || 0;`
          });
          break;

        case 'array-reduce-safety':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Always provide an initial value for reduce() or check array length',
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
  : 0;`
          });
          break;
          
        case 'entity-name-mismatch':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use the exact entity name from dataRequirements in RunView calls',
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
// match those declared in the component spec's dataRequirements`
          });
          break;
          
        case 'missing-query-parameter':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Provide all required parameters defined in dataRequirements for the query',
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
});`
          });
          break;
          
        case 'unknown-query-parameter':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Only use parameters that are defined in dataRequirements for the query',
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
});`
          });
          break;
          
        case 'missing-parameters-object':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Queries with parameters must include a Parameters object in RunQuery',
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
});`
          });
          break;
          
        case 'query-name-mismatch':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use the exact query name from dataRequirements in RunQuery calls',
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
// match those declared in the component spec's dataRequirements.queries`
          });
          break;
          
        case 'runview-sql-function':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'RunView does not support SQL aggregations. Use RunQuery or aggregate in JavaScript.',
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
}`
          });
          break;
          
        case 'field-not-in-requirements':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Only use fields that are defined in dataRequirements for the entity',
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
});`
          });
          break;
          
        case 'orderby-field-not-sortable':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'OrderBy fields must be in the sortFields array for the entity',
            example: `// ❌ WRONG - Sorting by non-sortable field:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  OrderBy: 'Industry ASC' // Industry not in sortFields
});

// ✅ CORRECT - Use fields from sortFields:
await utilities.rv.RunView({
  EntityName: 'Accounts',
  OrderBy: 'AccountName ASC' // AccountName is in sortFields
});`
          });
          break;
          
        case 'parent-event-callback-usage':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Components must invoke parent event callbacks when state changes',
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
}`
          });
          break;
          
        case 'property-name-consistency':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Maintain consistent property names when transforming data',
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
<td>{formatCurrency(account.annualRevenue)}</td> // Works!`
          });
          break;
          
        case 'noisy-settings-updates':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Save settings sparingly - only on meaningful user actions',
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
);`
          });
          break;
          
        case 'prop-state-sync':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Initialize state once, don\'t sync from props',
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
const displayValue = propOverride || value;`
          });
          break;
          
        case 'performance-memoization':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use useMemo for expensive operations and static data',
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
], []); // Empty deps = never changes`
          });
          break;
          
        case 'child-state-management':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Never manage state for child components',
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
/>`
          });
          break;
          
        case 'server-reload-on-client-operation':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use client-side operations for sorting and filtering',
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
}, [data, sortBy, sortDirection]);`
          });
          break;
          
        case 'runview-runquery-valid-properties':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use only valid properties for RunView/RunViews and RunQuery',
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
// - CategoryName, CategoryID, Parameters (optional)`
          });
          break;
          
        case 'root-component-props-restriction':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Root components can only accept standard props. Load data internally.',
            example: `// ❌ WRONG - Root component with additional props:
function RootComponent({ utilities, styles, components, customers, orders, selectedId }) {
  // Additional props will break hosting environment
}

// ✅ CORRECT - Root component with only standard props:
function RootComponent({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load ALL data internally using utilities
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(savedUserSettings?.selectedId);
  
  useEffect(() => {
    const loadData = async () => {
      try {
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
  
  return <div>{/* Use state, not props */}</div>;
}`
          });
          break;
          
        case 'runview-runquery-result-direct-usage':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'RunView and RunQuery return result objects, not arrays. Access the data with .Results property.',
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
// }`
          });
          break;
      }
    }
    
    return suggestions;
  }

  /**
   * Apply library-specific lint rules based on ComponentLibrary LintRules field
   */
  private static async applyLibraryLintRules(
    ast: t.File,
    componentSpec: ComponentSpec,
    contextUser?: UserInfo,
    debugMode?: boolean
  ): Promise<Violation[]> {
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
          
          if (compiledRules) {
            const library = compiledRules.library;
            const libraryName = library.Name || lib.name;
            
            // Apply initialization rules
            if (compiledRules.initialization) {
              const initViolations = this.checkLibraryInitialization(
                ast, 
                libraryName,
                compiledRules.initialization
              );
              
              // Debug logging for library violations
              if (debugMode && initViolations.length > 0) {
                console.log(`\n🔍 ${libraryName} Initialization Violations Found:`);
                initViolations.forEach(v => {
                  const icon = v.severity === 'critical' ? '🔴' : 
                               v.severity === 'high' ? '🟠' :
                               v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  ${icon} [${v.severity}] Line ${v.line}: ${v.message}`);
                });
              }
              
              libraryViolations.push(...initViolations);
            }
            
            // Apply lifecycle rules
            if (compiledRules.lifecycle) {
              const lifecycleViolations = this.checkLibraryLifecycle(
                ast,
                libraryName,
                compiledRules.lifecycle
              );
              
              // Debug logging for library violations
              if (debugMode && lifecycleViolations.length > 0) {
                console.log(`\n🔍 ${libraryName} Lifecycle Violations Found:`);
                lifecycleViolations.forEach(v => {
                  const icon = v.severity === 'critical' ? '🔴' : 
                               v.severity === 'high' ? '🟠' :
                               v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  ${icon} [${v.severity}] Line ${v.line}: ${v.message}`);
                });
              }
              
              libraryViolations.push(...lifecycleViolations);
            }
            
            // Apply options validation
            if (compiledRules.options) {
              const optionsViolations = this.checkLibraryOptions(
                ast,
                libraryName,
                compiledRules.options
              );
              
              // Debug logging for library violations
              if (debugMode && optionsViolations.length > 0) {
                console.log(`\n🔍 ${libraryName} Options Violations Found:`);
                optionsViolations.forEach(v => {
                  const icon = v.severity === 'critical' ? '🔴' : 
                               v.severity === 'high' ? '🟠' :
                               v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  ${icon} [${v.severity}] Line ${v.line}: ${v.message}`);
                });
              }
              
              libraryViolations.push(...optionsViolations);
            }
            
            // Apply compiled validators (already compiled in cache)
            if (compiledRules.validators) {
              const validatorViolations = this.executeCompiledValidators(
                ast,
                libraryName,
                library.GlobalVariable || '',
                compiledRules.validators,
                debugMode
              );
              libraryViolations.push(...validatorViolations);
            }
          }
          
          return libraryViolations;
        });
        
        // Wait for all library checks to complete
        const allLibraryViolations = await Promise.all(libraryPromises);
        
        // Flatten the results
        allLibraryViolations.forEach(libViolations => {
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
  private static checkLibraryInitialization(
    ast: t.File,
    libraryName: string,
    rules: any
  ): Violation[] {
    const violations: Violation[] = [];
    
    traverse(ast, {
      // Check for new ConstructorName() patterns
      NewExpression(path: NodePath<t.NewExpression>) {
        if (t.isIdentifier(path.node.callee) && 
            path.node.callee.name === rules.constructorName) {
          
          // Check if it requires 'new' keyword
          if (rules.requiresNew === false) {
            violations.push({
              rule: 'library-initialization',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `${libraryName}: ${rules.constructorName} should not use 'new' keyword`,
              code: `${rules.constructorName}(...) // without new`
            });
          }
          
          // Check element type if first argument is a ref
          if (rules.elementType && path.node.arguments[0]) {
            const firstArg = path.node.arguments[0];
            
            // Check if it's chartRef.current or similar
            if (t.isMemberExpression(firstArg) && 
                t.isIdentifier(firstArg.property) && 
                firstArg.property.name === 'current') {
              
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
        if (t.isIdentifier(path.node.callee) && 
            path.node.callee.name === rules.constructorName &&
            rules.requiresNew === true) {
          
          violations.push({
            rule: 'library-initialization',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `${libraryName}: ${rules.constructorName} requires 'new' keyword`,
            code: `new ${rules.constructorName}(...)`
          });
        }
      }
    });
    
    return violations;
  }
  
  /**
   * Check if a ref is attached to the correct element type
   */
  private static checkRefElementType(
    ast: t.File,
    refName: string,
    expectedType: string,
    libraryName: string,
    violations: Violation[]
  ): void {
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;
        
        // Check if this element has a ref attribute
        const refAttr = openingElement.attributes.find(attr => 
          t.isJSXAttribute(attr) && 
          t.isJSXIdentifier(attr.name) && 
          attr.name.name === 'ref'
        );
        
        if (refAttr && t.isJSXAttribute(refAttr)) {
          // Check if the ref value matches our refName
          const refValue = refAttr.value;
          if (t.isJSXExpressionContainer(refValue) && 
              t.isIdentifier(refValue.expression) && 
              refValue.expression.name === refName) {
            
            // Check element type
            const elementName = t.isJSXIdentifier(openingElement.name) 
              ? openingElement.name.name 
              : '';
            
            if (elementName.toLowerCase() !== expectedType.toLowerCase()) {
              violations.push({
                rule: 'library-element-type',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `${libraryName} requires a <${expectedType}> element, not <${elementName}>`,
                code: `<${expectedType} ref={${refName}}>`
              });
            }
          }
        }
      }
    });
  }
  
  /**
   * Check library lifecycle methods (render, destroy, etc.)
   */
  private static checkLibraryLifecycle(
    ast: t.File,
    libraryName: string,
    rules: any
  ): Violation[] {
    const violations: Violation[] = [];
    
    // Track which methods are called
    const calledMethods = new Set<string>();
    const instanceVariables = new Set<string>();
    
    traverse(ast, {
      // Track instance variables
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) && 
            t.isIdentifier(path.node.init.callee)) {
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
            const objectName = t.isIdentifier(callee.object) 
              ? callee.object.name 
              : null;
          
            if (objectName && instanceVariables.has(objectName)) {
              calledMethods.add(methodName);
            }
          }
        }
      }
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
            code: `instance.${method}()`
          });
        }
      }
    }
    
    // Check cleanup in useEffect
    if (rules.cleanupMethods && rules.cleanupMethods.length > 0) {
      let hasCleanup = false;
      
      traverse(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
          if (t.isIdentifier(path.node.callee) && 
              path.node.callee.name === 'useEffect') {
            
            const firstArg = path.node.arguments[0];
            if (t.isArrowFunctionExpression(firstArg) || t.isFunctionExpression(firstArg)) {
              // Check if it returns a cleanup function
              traverse(firstArg, {
                ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
                  if (t.isArrowFunctionExpression(returnPath.node.argument) || 
                      t.isFunctionExpression(returnPath.node.argument)) {
                    
                    // Check if cleanup function calls destroy
                    traverse(returnPath.node.argument, {
                      CallExpression(cleanupPath: NodePath<t.CallExpression>) {
                        if (t.isMemberExpression(cleanupPath.node.callee)) {
                          const callee = cleanupPath.node.callee as t.MemberExpression;
                          
                          if (t.isIdentifier(callee.property) && 
                              rules.cleanupMethods.includes(callee.property.name)) {
                            hasCleanup = true;
                          }
                        }
                      }
                    }, returnPath.scope, returnPath.state, returnPath);
                  }
                }
              }, path.scope, path.state, path);
            }
          }
        }
      });
      
      if (!hasCleanup) {
        violations.push({
          rule: 'library-cleanup',
          severity: 'medium',
          line: 0,
          column: 0,
          message: `${libraryName}: Missing cleanup in useEffect. Call ${rules.cleanupMethods.join(' or ')} in cleanup function`,
          code: `useEffect(() => {\n  // ... initialization\n  return () => {\n    instance.${rules.cleanupMethods[0]}();\n  };\n}, []);`
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Check library options and configuration
   */
  private static checkLibraryOptions(
    ast: t.File,
    libraryName: string,
    rules: any
  ): Violation[] {
    const violations: Violation[] = [];
    
    traverse(ast, {
      ObjectExpression(path: NodePath<t.ObjectExpression>) {
        // Check if this might be a config object for the library
        const properties = path.node.properties
          .filter((p): p is t.ObjectProperty => t.isObjectProperty(p));
        const propNames = properties
          .filter(p => t.isIdentifier(p.key))
          .map(p => (p.key as t.Identifier).name);
        
        // Check for required properties
        if (rules.requiredProperties) {
          const hasChartType = propNames.some(name => 
            rules.requiredProperties.includes(name)
          );
          
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
                  code: `${required}: /* value */`
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
                    code: `${propName}: []`
                  });
                }
              }
            }
          }
        }
      }
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
    debugMode?: boolean
  ): Violation[] {
    const violations: Violation[] = [];
    
    // Create context object for validators
    const context: any = {
      libraryName,
      globalVariable,
      instanceVariables: new Set<string>(),
      violations: [] // Validators push violations here
    };
    
    // First pass: identify library instance variables
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) &&
            t.isIdentifier(path.node.init.callee)) {
          // Check if it's a library constructor
          if (path.node.init.callee.name === globalVariable) {
            if (t.isIdentifier(path.node.id)) {
              context.instanceVariables.add(path.node.id.name);
            }
          }
        }
      }
    });
    
    // Execute each compiled validator
    for (const [validatorName, validator] of Object.entries(validators)) {
      if (validator && validator.validateFn) {
        const beforeCount = context.violations.length;
        
        // Traverse AST and apply validator
        traverse(ast, {
          enter(path: NodePath) {
            try {
              // Validators don't return violations, they push to context.violations
              validator.validateFn(ast, path, t, context);
            } catch (error) {
              // Validator execution error - log but don't crash
              console.warn(`Validator ${validatorName} failed:`, error);
            }
          }
        });
        
        // Debug logging for this specific validator
        const newViolations = context.violations.length - beforeCount;
        if (debugMode && newViolations > 0) {
          console.log(`\n📋 ${libraryName} - ${validatorName}:`);
          console.log(`  📊 ${validator.description || 'No description'}`);
          console.log(`  ⚠️  Found ${newViolations} violation${newViolations > 1 ? 's' : ''}`);
          
          // Show the violations from this validator
          const validatorViolations = context.violations.slice(beforeCount);
          validatorViolations.forEach((v: any) => {
            const icon = v.type === 'error' || v.severity === 'critical' ? '🔴' : 
                         v.type === 'warning' || v.severity === 'high' ? '🟠' :
                         v.severity === 'medium' ? '🟡' : '🟢';
            console.log(`    ${icon} Line ${v.line || 'unknown'}: ${v.message}`);
            if (v.suggestion) {
              console.log(`       💡 ${v.suggestion}`);
            }
          });
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
      code: v.code
    }));
    
    violations.push(...standardViolations);
    
    return violations;
  }

}