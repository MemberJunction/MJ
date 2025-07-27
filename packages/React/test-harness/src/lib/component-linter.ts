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
  test: (ast: t.File, componentName: string) => Violation[];
}

export class ComponentLinter {
  // Universal rules that apply to all components with SavedUserSettings pattern
  private static universalComponentRules: Rule[] = [
    // State Management Rules
    {
      name: 'full-state-ownership',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasStateFromProps = false;
        let hasSavedUserSettings = false;
        
        // First pass: check if component expects state from props
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
                      }
                      if (propName === 'savedUserSettings') {
                        hasSavedUserSettings = true;
                      }
                    }
                  }
                }
              }
            }
          }
        });
        
        if (hasStateFromProps && hasSavedUserSettings) {
          violations.push({
            rule: 'full-state-ownership',
            severity: 'error',
            line: 1,
            column: 0,
            message: `Component "${componentName}" expects state from props. Components should manage ALL their state internally with useState, initialized from savedUserSettings.`
          });
        }
        
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
                      const ephemeralPatterns = ['hover', 'dropdown', 'modal', 'loading', 'typing', 'draft'];
                      
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
    }
  ];
  
  public static async lintComponent(
    code: string,
    componentName: string,
    componentSpec?: any
  ): Promise<LintResult> {
    try {
      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });
      
      // Use universal rules for all components in the new pattern
      const rules = this.universalComponentRules;
      
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
    
    if (componentSpec.dataRequirements?.entities) {
      for (const entity of componentSpec.dataRequirements.entities) {
        if (entity.name) {
          requiredEntities.add(entity.name);
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
  
  private static generateFixSuggestions(violations: Violation[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    for (const violation of violations) {
      switch (violation.rule) {
        case 'full-state-ownership':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Components must own ALL their state - use useState and SavedUserSettings pattern',
            example: `// ✅ CORRECT - Full state ownership:
function Component({ data, savedUserSettings, onSaveUserSettings }) {
  // Component owns ALL state
  const [selectedId, setSelectedId] = useState(
    savedUserSettings?.selectedId
  );
  const [filters, setFilters] = useState(
    savedUserSettings?.filters || {}
  );
  const [searchDraft, setSearchDraft] = useState(''); // Ephemeral
  
  // Handle selection and save preference
  const handleSelect = (id) => {
    setSelectedId(id);
    onSaveUserSettings?.({
      ...savedUserSettings,
      selectedId: id
    });
  };
  
  // Don't save ephemeral state
  const handleSearch = (text) => {
    setSearchDraft(text);
    // Only save on submit, not every keystroke
  };
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
      }
    }
    
    return suggestions;
  }
}