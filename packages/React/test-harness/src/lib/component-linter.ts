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
  // Universal rules that apply to all components in the new controlled pattern
  private static universalComponentRules: Rule[] = [
    // State Management Rules
    {
      name: 'hybrid-state-management',
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
              // Check what's being stored in state
              const parent = path.parent;
              if (t.isVariableDeclarator(parent) && t.isArrayPattern(parent.id)) {
                const stateName = parent.id.elements[0];
                if (t.isIdentifier(stateName)) {
                  const name = stateName.name.toLowerCase();
                  
                  // Check for likely application state
                  const appStatePatterns = [
                    'selected', 'filter', 'sort', 'page', 'active',
                    'current', 'saved', 'submitted', 'confirmed'
                  ];
                  
                  const isLikelyAppState = appStatePatterns.some(pattern => 
                    name.includes(pattern) && 
                    !name.includes('draft') && 
                    !name.includes('temp') &&
                    !name.includes('hover') &&
                    !name.includes('dropdown') &&
                    !name.includes('modal')
                  );
                  
                  if (isLikelyAppState) {
                    violations.push({
                      rule: 'hybrid-state-management',
                      severity: 'warning',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `Component "${componentName}" may be using useState for application state "${stateName.name}". Application state should come from props and update via onStateChanged. Use useState only for ephemeral UI state like typing, hover, or dropdowns.`,
                      code: path.toString()
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
                message: `Component "${componentName}" uses useReducer at line ${path.node.loc?.start.line}. All components must be purely controlled - use props and onStateChanged instead.`,
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
      name: 'use-onStateChanged-pattern',
      test: (ast: t.File, componentName: string) => {
        const violations: Violation[] = [];
        let hasOnStateChanged = false;
        
        traverse(ast, {
          // Check for onStateChanged in function parameters
          FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
              const param = path.node.params[0];
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'onStateChanged') {
                    hasOnStateChanged = true;
                  }
                }
              }
            }
          },
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
  
  private static generateFixSuggestions(violations: Violation[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    for (const violation of violations) {
      switch (violation.rule) {
        case 'hybrid-state-management':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use hybrid state management - useState for ephemeral UI state only, props + onStateChanged for application state',
            example: `// ✅ CORRECT - Ephemeral UI state:
const [searchDraft, setSearchDraft] = useState('');
const [isDropdownOpen, setIsDropdownOpen] = useState(false);
const [hoveredId, setHoveredId] = useState(null);

// ❌ WRONG - Application state should come from props:
const [selectedCustomerId, setSelectedCustomerId] = useState(null);
const [activeFilters, setActiveFilters] = useState([]);

// Instead use:
function Component({ selectedCustomerId, activeFilters, onStateChanged }) {
  // Local state for UI
  const [searchDraft, setSearchDraft] = useState('');
  
  // Application state updates
  const handleSelect = (id) => {
    onStateChanged?.({ selectedCustomerId: id });
  };
  
  const handleSearchSubmit = () => {
    onStateChanged?.({ searchQuery: searchDraft });
  };
}`
          });
          break;
          
        case 'no-use-reducer':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Components must be purely controlled - remove useReducer',
            example: `// Instead of:
const [state, dispatch] = useReducer(reducer, initialState);

// Use:
function Component({ state, onStateChanged }) {
  const handleAction = (action) => {
    // Map action to state change
    onStateChanged?.({ /* new state values */ });
  };
}`
          });
          break;
          
        case 'no-data-prop':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Replace generic data prop with specific named props',
            example: `// Instead of:
function Component({ data, utilities, styles, components, onStateChanged }) {
  return <div>{data.items.map(...)}</div>;
}

// Use specific props:
function Component({ items, customers, utilities, styles, components, onStateChanged }) {
  return <div>{items.map(...)}</div>;
}

// Load data using utilities:
const result = await utilities.rv.RunView({ entityName: 'Items' });`
          });
          break;
          
          
        case 'use-onStateChanged-pattern':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Use onStateChanged callback pattern instead of callbacks?.UpdateUserState',
            example: `// Instead of:
callbacks?.UpdateUserState({ someValue });

// Use:
onStateChanged?.({ someValue });

// Component should accept onStateChanged in props:
function Component({ onStateChanged, styles, utilities, components }) {
  // Handle state changes
  const handleClick = () => {
    onStateChanged?.({ selectedId: id });
  };
}`
          });
          break;
          
        case 'pass-standard-props':
          suggestions.push({
            violation: violation.rule,
            suggestion: 'Always pass standard props (styles, utilities, components) to all components',
            example: `// Always include these props when calling components:
<ChildComponent
  items={items}  // Specific props, not generic 'data'
  selectedId={selectedId}
  onStateChanged={onStateChanged}
  styles={styles}
  utilities={utilities}
  components={components}
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
      }
    }
    
    return suggestions;
  }
}