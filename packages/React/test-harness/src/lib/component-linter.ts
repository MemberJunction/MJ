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

export type ComponentType = 'root' | 'child';

interface Rule {
  name: string;
  test: (ast: t.File, componentName: string) => Violation[];
}

export class ComponentLinter {
  private static childComponentRules: Rule[] = [
    // State Management Rules
    {
      name: 'no-use-state',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Check for React.useState or just useState
            if (
              (t.isIdentifier(callee) && callee.name === 'useState') ||
              (t.isMemberExpression(callee) && 
               t.isIdentifier(callee.object) && callee.object.name === 'React' &&
               t.isIdentifier(callee.property) && callee.property.name === 'useState')
            ) {
              violations.push({
                rule: 'no-use-state',
                severity: 'error',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Child component "${componentName}" uses useState at line ${path.node.loc?.start.line}. Child components must be purely controlled - receive state via props instead.`,
                code: path.toString()
              });
            }
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'no-use-reducer',
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
                message: `Child component "${componentName}" uses useReducer at line ${path.node.loc?.start.line}. Child components must be purely controlled.`,
                code: path.toString()
              });
            }
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'no-data-fetching',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          MemberExpression(path: NodePath<t.MemberExpression>) {
            const object = path.node.object;
            const property = path.node.property;
            
            // Check for utilities.rv.RunView or utilities.rv.RunQuery
            if (
              t.isMemberExpression(object) &&
              t.isIdentifier(object.object) && object.object.name === 'utilities' &&
              t.isIdentifier(object.property) && object.property.name === 'rv' &&
              t.isIdentifier(property) && 
              (property.name === 'RunView' || property.name === 'RunQuery' || property.name === 'RunViews')
            ) {
              violations.push({
                rule: 'no-data-fetching',
                severity: 'error',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Child component "${componentName}" fetches data at line ${path.node.loc?.start.line}. Only root components should load data.`,
                code: path.toString()
              });
            }
            
            // Check for utilities.md operations
            if (
              t.isMemberExpression(object) &&
              t.isIdentifier(object.object) && object.object.name === 'utilities' &&
              t.isIdentifier(object.property) && object.property.name === 'md'
            ) {
              violations.push({
                rule: 'no-data-fetching',
                severity: 'error',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Child component "${componentName}" accesses entity operations at line ${path.node.loc?.start.line}. Only root components should manage entities.`,
                code: path.toString()
              });
            }
          }
        });
        
        return violations;
      }
    },
    
    {
      name: 'no-async-effects',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Check for useEffect
            if (
              (t.isIdentifier(callee) && callee.name === 'useEffect') ||
              (t.isMemberExpression(callee) && 
               t.isIdentifier(callee.object) && callee.object.name === 'React' &&
               t.isIdentifier(callee.property) && callee.property.name === 'useEffect')
            ) {
              // Check if the effect function contains async operations
              const effectFn = path.node.arguments[0];
              if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
                let hasAsync = false;
                
                // Check if the effect function itself is async
                if (effectFn.async) {
                  hasAsync = true;
                }
                
                // Traverse the effect function body to look for async patterns
                traverse(effectFn, {
                  CallExpression(innerPath: NodePath<t.CallExpression>) {
                    const innerCallee = innerPath.node.callee;
                    
                    // Check for async patterns
                    if (
                      (t.isIdentifier(innerCallee) && innerCallee.name === 'fetch') ||
                      (t.isMemberExpression(innerCallee) && 
                       t.isIdentifier(innerCallee.property) && 
                       (innerCallee.property.name === 'then' || innerCallee.property.name === 'catch'))
                    ) {
                      hasAsync = true;
                    }
                  },
                  AwaitExpression() {
                    hasAsync = true;
                  },
                  FunctionDeclaration(innerPath: NodePath<t.FunctionDeclaration>) {
                    if (innerPath.node.async) hasAsync = true;
                  },
                  ArrowFunctionExpression(innerPath: NodePath<t.ArrowFunctionExpression>) {
                    if (innerPath.node.async) hasAsync = true;
                  }
                }, path.scope, path.state, path.parentPath);
                
                if (hasAsync) {
                  violations.push({
                    rule: 'no-async-effects',
                    severity: 'error',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Child component "${componentName}" has async operations in useEffect at line ${path.node.loc?.start.line}. Data should be loaded by the root component and passed as props.`,
                    code: path.toString().substring(0, 100) + '...'
                  });
                }
              }
            }
          }
        });
        
        return violations;
      }
    }
  ];
  
  private static rootComponentRules: Rule[] = [
    {
      name: 'must-use-update-state',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasUpdateState = false;
        
        traverse(ast, {
          VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (t.isIdentifier(path.node.id) && path.node.id.name === 'updateState') {
              hasUpdateState = true;
            }
          },
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === 'updateState') {
              hasUpdateState = true;
            }
          }
        });
        
        if (!hasUpdateState) {
          violations.push({
            rule: 'must-use-update-state',
            severity: 'error',
            line: 1,
            column: 0,
            message: `Root component "${componentName}" must have an updateState function that syncs with callbacks.UpdateUserState.`,
          });
        }
        
        return violations;
      }
    },
    
    {
      name: 'sync-user-state',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasUserStateSync = false;
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Look for callbacks?.UpdateUserState or callbacks.UpdateUserState
            if (t.isMemberExpression(callee)) {
              // Check for callbacks.UpdateUserState
              if (
                t.isIdentifier(callee.object) && callee.object.name === 'callbacks' &&
                t.isIdentifier(callee.property) && callee.property.name === 'UpdateUserState'
              ) {
                hasUserStateSync = true;
              }
            }
            // Check for callbacks?.UpdateUserState (optional chaining)
            else if (t.isOptionalMemberExpression(callee)) {
              if (
                t.isIdentifier(callee.object) && callee.object.name === 'callbacks' &&
                t.isIdentifier(callee.property) && callee.property.name === 'UpdateUserState'
              ) {
                hasUserStateSync = true;
              }
            }
          }
        });
        
        if (!hasUserStateSync) {
          violations.push({
            rule: 'sync-user-state',
            severity: 'error',
            line: 1,
            column: 0,
            message: `Root component "${componentName}" must call callbacks?.UpdateUserState to sync state changes.`,
          });
        }
        
        return violations;
      }
    },
    
    {
      name: 'spread-user-state',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasUserStateSpread = false;
        
        traverse(ast, {
          CallExpression(path: NodePath<t.CallExpression>) {
            const callee = path.node.callee;
            
            // Check for useState call
            if (
              (t.isIdentifier(callee) && callee.name === 'useState') ||
              (t.isMemberExpression(callee) && 
               t.isIdentifier(callee.object) && callee.object.name === 'React' &&
               t.isIdentifier(callee.property) && callee.property.name === 'useState')
            ) {
              // Check if initial state includes ...userState
              const initialState = path.node.arguments[0];
              if (t.isObjectExpression(initialState)) {
                for (const prop of initialState.properties) {
                  if (t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'userState') {
                    hasUserStateSpread = true;
                    break;
                  }
                }
              }
            }
          }
        });
        
        if (!hasUserStateSpread) {
          violations.push({
            rule: 'spread-user-state',
            severity: 'error',
            line: 1,
            column: 0,
            message: `Root component "${componentName}" must spread ...userState in initial state to preserve user preferences.`,
          });
        }
        
        return violations;
      }
    },
    
    {
      name: 'no-child-implementation',
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
    }
  ];
  
  public static async lintComponent(
    code: string,
    componentType: ComponentType,
    componentName: string
  ): Promise<LintResult> {
    try {
      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });
      
      const rules = componentType === 'root' 
        ? this.rootComponentRules 
        : this.childComponentRules;
      
      const violations: Violation[] = [];
      
      // Run each rule
      for (const rule of rules) {
        const ruleViolations = rule.test(ast, componentName);
        violations.push(...ruleViolations);
      }
      
      // Generate fix suggestions
      const suggestions = this.generateFixSuggestions(violations, componentType);
      
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
  
  private static generateFixSuggestions(violations: Violation[], componentType: ComponentType): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    for (const violation of violations) {
      switch (violation.rule) {
        case 'no-use-state':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove useState and accept the value as a prop from the parent component',
            example: 'Replace: const [value, setValue] = useState(initialValue);\nWith: Accept "value" and "onValueChange" as props'
          });
          break;
          
        case 'no-data-fetching':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Move data fetching to the root component and pass data as props',
            example: 'Remove utilities.rv.RunView() calls and accept the data as props instead'
          });
          break;
          
        case 'no-async-effects':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove async operations from useEffect. Let the root component handle data loading',
            example: 'Remove the useEffect with async operations and accept loading/error states as props'
          });
          break;
          
        case 'must-use-update-state':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Add an updateState function that syncs with callbacks',
            example: `const updateState = (updates) => {
  const newState = { ...state, ...updates };
  setState(newState);
  if (callbacks?.UpdateUserState) {
    callbacks.UpdateUserState(newState);
  }
};`
          });
          break;
          
        case 'sync-user-state':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Call callbacks?.UpdateUserState in your updateState function',
            example: 'Add: if (callbacks?.UpdateUserState) callbacks.UpdateUserState(newState);'
          });
          break;
          
        case 'spread-user-state':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Include ...userState in your initial state',
            example: 'const [state, setState] = useState({ /* your fields */, ...userState });'
          });
          break;
          
        case 'no-child-implementation':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Remove child component implementations. Only the root component function should be in this file',
            example: 'Move child component functions to separate generation requests'
          });
          break;
      }
    }
    
    return suggestions;
  }
}