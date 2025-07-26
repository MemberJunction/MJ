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
      }
    }
    
    return suggestions;
  }
}