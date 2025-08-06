import * as parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

export interface LintResult {
  success: boolean;
  violations: Violation[];
  suggestions: FixSuggestion[];
}

export interface Violation {
  rule: string;
  severity: 'error' | 'warning';
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
  test: (ast: t.File, componentName: string) => Violation[];
}

// Helper function
function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

export class ComponentLinter {
  // Universal rules that apply to all components with SavedUserSettings pattern
  private static universalComponentRules: Rule[] = [
    // State Management Rules
    {
      name: 'full-state-ownership',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasStateFromProps = false;
        let hasSavedUserSettings = false;
        let usesUseState = false;
        const stateProps: string[] = [];
        
        // First pass: check if component expects state from props and uses useState
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    // Check for state-like props
                    const statePatterns = ['selectedId', 'selectedItemId', 'filters', 'sortBy', 'sortField', 'currentPage', 'activeTab'];
                    if (statePatterns.some(pattern => propName.includes(pattern))) {
                      hasStateFromProps = true;
                      stateProps.push(propName);
                    }
                    if (propName === 'savedUserSettings') {
                      hasSavedUserSettings = true;
                    }
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
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name;
                      const statePatterns = ['selectedId', 'selectedItemId', 'filters', 'sortBy', 'sortField', 'currentPage', 'activeTab'];
                      if (statePatterns.some(pattern => propName.includes(pattern))) {
                        hasStateFromProps = true;
                        stateProps.push(propName);
                      }
                      if (propName === 'savedUserSettings') {
                        hasSavedUserSettings = true;
                      }
                    }
                  }
                }
              }
            }
          },
          
          // Check for useState usage
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            if (
              (t.isIdentifier(callee) && callee.name === 'useState') ||
              (t.isMemberExpression(callee) && 
               t.isIdentifier(callee.object) && callee.object.name === 'React' &&
               t.isIdentifier(callee.property) && callee.property.name === 'useState')
            ) {
              usesUseState = true;
            }
          }
        });
        
        // CRITICAL: Components must manage ALL their own state
        // State props are NOT allowed - each component is generated separately
        if (hasStateFromProps) {
          violations.push({
            rule: 'full-state-ownership',
            severity: 'error',
            line: 1,
            column: 0,
            message: `Component "${componentName}" expects state from props (${stateProps.join(', ')}) instead of managing internally. Each component is generated separately and MUST manage ALL its own state.`
          });
        }
        
        return violations;
      }
    },
    
    {
      name: 'no-use-reducer',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
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
                severity: 'error',
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
      test: (ast: t.File, componentName: string) => {
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
                      severity: 'error',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Component "${componentName}" accepts generic 'data' prop. Use specific props like 'items', 'customers', etc. instead.`,
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
                        severity: 'error',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `Component "${componentName}" accepts generic 'data' prop. Use specific props like 'items', 'customers', etc. instead.`,
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
      test: (ast: t.File, componentName: string) => {
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
                          severity: 'warning',
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
      name: 'pass-standard-props',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        const requiredProps = ['styles', 'utilities', 'components'];
        
        traverse(ast, {
          JSXElement(path: NodePath<t.JSXElement>) {
            const openingElement = path.node.openingElement;
            
            // Check if this looks like a component (capitalized name)
            if (t.isJSXIdentifier(openingElement.name) && /^[A-Z]/.test(openingElement.name.name)) {
              const componentBeingCalled = openingElement.name.name;
              const passedProps = new Set<string>();
              
              // Collect all props being passed
              for (const attr of openingElement.attributes) {
                if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
                  passedProps.add(attr.name.name);
                }
              }
              
              // Check if required props are missing
              const missingProps = requiredProps.filter(prop => !passedProps.has(prop));
              
              if (missingProps.length > 0 && passedProps.size > 0) {
                // Only report if some props are passed (to avoid false positives on non-component JSX)
                violations.push({
                  rule: 'pass-standard-props',
                  severity: 'error',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `Component "${componentBeingCalled}" is missing required props: ${missingProps.join(', ')}. All components must receive styles, utilities, and components props.`,
                  code: `<${componentBeingCalled} ... />`
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
      test: (ast: t.File, componentName: string) => {
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
            severity: 'error',
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
      test: (ast: t.File, componentName: string) => {
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
              severity: 'warning',
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
      test: (ast: t.File, componentName: string) => {
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
                    severity: 'error',
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
      test: (ast: t.File, componentName: string) => {
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
                  severity: 'warning',
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
                  severity: 'error',
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
    
    {
      name: 'parent-event-callback-usage',
      appliesTo: 'child',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        const eventCallbacks = new Map<string, { line: number; column: number }>();
        const callbackInvocations = new Set<string>();
        const stateUpdateHandlers = new Map<string, string[]>(); // handler -> state updates
        
        // First pass: collect event callback props (onSelect, onChange, etc.)
        traverse(ast, {
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    const propName = prop.key.name;
                    // Check for event callback patterns
                    if (/^on[A-Z]/.test(propName) && 
                        propName !== 'onSaveUserSettings' && 
                        !propName.includes('StateChanged')) {
                      eventCallbacks.set(propName, {
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0
                      });
                    }
                  }
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
                  for (const prop of param.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      const propName = prop.key.name;
                      if (/^on[A-Z]/.test(propName) && 
                          propName !== 'onSaveUserSettings' && 
                          !propName.includes('StateChanged')) {
                        eventCallbacks.set(propName, {
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        });
        
        // Second pass: check if callbacks are invoked in event handlers
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            // Check for callback invocations
            if (t.isIdentifier(path.node.callee)) {
              const callbackName = path.node.callee.name;
              if (eventCallbacks.has(callbackName)) {
                callbackInvocations.add(callbackName);
              }
            }
            
            // Check for state updates (setSelectedId, setFilters, etc.)
            if (t.isIdentifier(path.node.callee) && /^set[A-Z]/.test(path.node.callee.name)) {
              // Find the containing function
              let containingFunction = path.getFunctionParent();
              if (containingFunction) {
                const funcName = ComponentLinter.getFunctionName(containingFunction);
                if (funcName) {
                  if (!stateUpdateHandlers.has(funcName)) {
                    stateUpdateHandlers.set(funcName, []);
                  }
                  stateUpdateHandlers.get(funcName)!.push(path.node.callee.name);
                }
              }
            }
          },
          
          // Check conditional callback invocations
          IfStatement(path: NodePath<t.IfStatement>) {
            if (t.isBlockStatement(path.node.consequent)) {
              // Check if the condition tests for callback existence
              if (t.isIdentifier(path.node.test)) {
                const callbackName = path.node.test.name;
                if (eventCallbacks.has(callbackName)) {
                  // Check if callback is invoked in the block
                  let hasInvocation = false;
                  path.traverse({
                    CallExpression(innerPath: NodePath<t.CallExpression>) {
                      if (t.isIdentifier(innerPath.node.callee) && 
                          innerPath.node.callee.name === callbackName) {
                        hasInvocation = true;
                        callbackInvocations.add(callbackName);
                      }
                    }
                  });
                }
              }
            }
          }
        });
        
        // Check for unused callbacks that have related state updates
        for (const [callbackName, location] of eventCallbacks) {
          if (!callbackInvocations.has(callbackName)) {
            // Try to find related state update handlers
            const relatedHandlers: string[] = [];
            const expectedStateName = callbackName.replace(/^on/, '').replace(/Change$|Select$/, '');
            
            for (const [handlerName, stateUpdates] of stateUpdateHandlers) {
              for (const stateUpdate of stateUpdates) {
                if (stateUpdate.toLowerCase().includes(expectedStateName.toLowerCase()) ||
                    handlerName.toLowerCase().includes(expectedStateName.toLowerCase())) {
                  relatedHandlers.push(handlerName);
                  break;
                }
              }
            }
            
            if (relatedHandlers.length > 0) {
              violations.push({
                rule: 'parent-event-callback-usage',
                severity: 'error',
                line: location.line,
                column: location.column,
                message: `Component receives '${callbackName}' event callback but never invokes it. Found state updates in ${relatedHandlers.join(', ')} but parent is not notified.`,
                code: `Missing: if (${callbackName}) ${callbackName}(...)`
              });
            }
          }
        }
        
        return violations;
      }
    },
    
    {
      name: 'property-name-consistency',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
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
                    severity: 'error',
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
      test: (ast: t.File, componentName: string) => {
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
                        severity: 'error',
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
      test: (ast: t.File, componentName: string) => {
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
                    severity: 'error',
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
    
    {
      name: 'performance-memoization',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        const memoizedValues = new Set<string>();
        
        // Collect memoized values
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useMemo') {
              // Find the variable being assigned
              if (t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
                memoizedValues.add(path.parent.id.name);
              }
            }
          }
        });
        
        // Check for expensive operations without memoization
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
              const method = path.node.callee.property.name;
              
              // Check for expensive array operations
              if (['filter', 'sort', 'map', 'reduce'].includes(method)) {
                // Check if this is inside a variable declaration
                let parentPath: NodePath | null = path.parentPath;
                while (parentPath && !t.isVariableDeclarator(parentPath.node)) {
                  parentPath = parentPath.parentPath;
                }
                
                if (parentPath && t.isVariableDeclarator(parentPath.node) && t.isIdentifier(parentPath.node.id)) {
                  const varName = parentPath.node.id.name;
                  
                  // Check if it's not memoized
                  if (!memoizedValues.has(varName)) {
                    // Check if it's in the render method (not in event handlers)
                    let funcParent = path.getFunctionParent();
                    if (funcParent) {
                      const funcName = ComponentLinter.getFunctionName(funcParent);
                      if (!funcName || funcName === componentName) {
                        violations.push({
                          rule: 'performance-memoization',
                          severity: 'warning',
                          line: path.node.loc?.start.line || 0,
                          column: path.node.loc?.start.column || 0,
                          message: `Expensive ${method} operation without memoization. Consider using useMemo.`,
                          code: `const ${varName} = ...${method}(...)`
                        });
                      }
                    }
                  }
                }
              }
            }
          },
          
          // Check for static arrays/objects
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id) && 
                (t.isArrayExpression(path.node.init) || t.isObjectExpression(path.node.init))) {
              
              const varName = path.node.id.name;
              if (!memoizedValues.has(varName)) {
                // Check if it looks static (no variables referenced)
                const hasVariables = path.node.init.toString().match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
                if (!hasVariables || hasVariables.length < 3) { // Allow some property names
                  violations.push({
                    rule: 'performance-memoization',
                    severity: 'warning',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: 'Static array/object recreated on every render. Consider using useMemo.',
                    code: `const ${varName} = ${path.node.init.type === 'ArrayExpression' ? '[...]' : '{...}'}`
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
      name: 'child-state-management',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useState') {
              // Check if the state name suggests child component state
              if (t.isVariableDeclarator(path.parent) && t.isArrayPattern(path.parent.id)) {
                const stateNameNode = path.parent.id.elements[0];
                if (t.isIdentifier(stateNameNode)) {
                  const stateName = stateNameNode.name;
                  
                  // Check for patterns suggesting child state management
                  const childPatterns = [
                    /^child/i,
                    /Table\w*State/,
                    /Panel\w*State/,
                    /Modal\w*State/,
                    /\w+Component\w*/
                  ];
                  
                  if (childPatterns.some(pattern => pattern.test(stateName))) {
                    violations.push({
                      rule: 'child-state-management',
                      severity: 'error',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Component trying to manage child component state: ${stateName}. Child components manage their own state!`,
                      code: `const [${stateName}, ...] = useState(...)`
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
      name: 'server-reload-on-client-operation',
      appliesTo: 'all',
      test: (ast: t.File, componentName: string) => {
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
                    severity: 'error',
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
      name: 'root-component-props-restriction',
      appliesTo: 'root',
      test: (ast: t.File, componentName: string) => {
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
                    severity: 'error',
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
                      severity: 'error',
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
    }
  ];
  
  public static async lintComponent(
    code: string,
    componentName: string,
    componentSpec?: any,
    isRootComponent?: boolean
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
        const ruleViolations = rule.test(ast, componentName);
        violations.push(...ruleViolations);
      }
      
      // Add data requirements validation if componentSpec is provided
      if (componentSpec?.dataRequirements?.entities) {
        const dataViolations = this.validateDataRequirements(ast, componentSpec);
        violations.push(...dataViolations);
      }
      
      // Generate fix suggestions
      const suggestions = this.generateFixSuggestions(violations);
      
      return {
        success: violations.filter(v => v.severity === 'error').length === 0,
        violations,
        suggestions
      };
    } catch (error) {
      // If parsing fails, return a parse error
      return {
        success: false,
        violations: [{
          rule: 'parse-error',
          severity: 'error',
          line: 0,
          column: 0,
          message: `Failed to parse component: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        suggestions: []
      };
    }
  }
  
  private static validateDataRequirements(ast: t.File, componentSpec: any): Violation[] {
    const violations: Violation[] = [];
    
    // Extract entity names from dataRequirements
    const requiredEntities = new Set<string>();
    const requiredQueries = new Set<string>();
    
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
                    // Try to find the closest match
                    const possibleMatches = Array.from(requiredEntities).filter(e => 
                      e.toLowerCase().includes(usedEntity.toLowerCase()) || 
                      usedEntity.toLowerCase().includes(e.toLowerCase())
                    );
                    
                    violations.push({
                      rule: 'entity-name-mismatch',
                      severity: 'error',
                      line: prop.value.loc?.start.line || 0,
                      column: prop.value.loc?.start.column || 0,
                      message: `Entity "${usedEntity}" not found in dataRequirements. ${
                        possibleMatches.length > 0 
                          ? `Did you mean "${possibleMatches[0]}"?` 
                          : `Available entities: ${Array.from(requiredEntities).join(', ')}`
                      }`,
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
                                severity: 'error',
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
                                  severity: 'error',
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
                            severity: 'error',
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
                  // Try to find the closest match
                  const possibleMatches = Array.from(requiredQueries).filter(q => 
                    q.toLowerCase().includes(usedQuery.toLowerCase()) || 
                    usedQuery.toLowerCase().includes(q.toLowerCase())
                  );
                  
                  violations.push({
                    rule: 'query-name-mismatch',
                    severity: 'error',
                    line: prop.value.loc?.start.line || 0,
                    column: prop.value.loc?.start.column || 0,
                    message: `Query "${usedQuery}" not found in dataRequirements. ${
                      possibleMatches.length > 0 
                        ? `Did you mean "${possibleMatches[0]}"?` 
                        : requiredQueries.size > 0 
                          ? `Available queries: ${Array.from(requiredQueries).join(', ')}`
                          : `No queries defined in dataRequirements`
                    }`,
                    code: `QueryName: "${usedQuery}"`
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
  
  private static generateFixSuggestions(violations: Violation[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    for (const violation of violations) {
      switch (violation.rule) {
        case 'full-state-ownership':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Components must manage ALL their own state internally. No state props allowed.',
            example: `// ❌ WRONG - Expecting state from props:
function Component({ selectedId, filters, sortBy, onStateChange }) {
  // This component expects parent to manage its state - WRONG!
}

// ✅ CORRECT - Component owns ALL its state:
function Component({ data, savedUserSettings, onSaveUserSettings }) {
  // Component manages ALL its own state internally
  const [selectedId, setSelectedId] = useState(
    savedUserSettings?.selectedId || null
  );
  const [filters, setFilters] = useState(
    savedUserSettings?.filters || {}
  );
  const [sortBy, setSortBy] = useState(
    savedUserSettings?.sortBy || 'name'
  );
  
  // Handle selection
  const handleSelect = (id) => {
    setSelectedId(id);  // Update internal state
    onSaveUserSettings?.({
      ...savedUserSettings,
      selectedId: id
    });
  };
  
  // Each component is generated separately - it must be self-contained
}`
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
      }
    }
    
    return suggestions;
  }
}