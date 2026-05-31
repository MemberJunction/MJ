import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { LinterOptions } from '../linter-options';

/**
 * Rule: component-props-validation
 *
 * Validates that components only accept declared props from:
 * - Standard props (utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings)
 * - React special props (children)
 * - Spec-defined properties
 * - Spec-defined events (with 'on' prefix convention)
 *
 * Also checks that required props are present.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'component-props-validation')
export class ComponentPropsValidationRule extends BaseLintRule {
  get Name() { return 'component-props-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec, _options?: LinterOptions): Violation[] {
    const violations: Violation[] = [];
    const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

    // React special props that are automatically provided by React
    const reactSpecialProps = new Set(['children']);

    // Build set of allowed props: standard props + React special props + componentSpec properties + events
    const allowedProps = new Set([...standardProps, ...reactSpecialProps]);

    // Track required props separately for validation
    const requiredProps = new Set<string>();

    // Add props from componentSpec.properties if they exist
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
    const specDefinedEvents: string[] = [];
    if (componentSpec?.events) {
      for (const event of componentSpec.events) {
        if (event.name) {
          const onPrefixedName = 'on' + event.name.charAt(0).toUpperCase() + event.name.slice(1);
          allowedProps.add(event.name);
          allowedProps.add(onPrefixedName);
          specDefinedEvents.push(onPrefixedName);
        }
      }
    }

    /**
     * Validate destructured props from a parameter pattern.
     */
    const validateProps = (param: t.ObjectPattern, line: number, column: number) => {
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
          line,
          column,
          message: `Component "${componentName}" is missing required props: ${missingRequired.join(', ')}. These props are marked as required in the component specification.`,
          suggestion: {
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
          },
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
          line,
          column,
          message,
          suggestion: {
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
          },
        });
      }
    };

    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
          const param = path.node.params[0];
          if (t.isObjectPattern(param)) {
            validateProps(param, path.node.loc?.start.line || 0, path.node.loc?.start.column || 0);
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
              validateProps(param, init.loc?.start.line || 0, init.loc?.start.column || 0);
            }
          }
        }
      },
    });

    return violations;
  }
}
