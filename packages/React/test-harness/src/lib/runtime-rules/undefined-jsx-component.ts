import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

// Standard HTML elements (lowercase) - subset needed for this rule
const HTML_ELEMENTS = new Set([
  'html', 'base', 'head', 'link', 'meta', 'style', 'title', 'body',
  'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'main', 'nav', 'section', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'hr', 'li', 'menu', 'ol', 'p', 'pre', 'ul',
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd',
  'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
  'time', 'u', 'var', 'wbr',
  'area', 'audio', 'img', 'map', 'track', 'video',
  'embed', 'iframe', 'object', 'param', 'picture', 'portal', 'source',
  'svg', 'math', 'canvas', 'noscript', 'script', 'del', 'ins',
  'caption', 'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  'button', 'datalist', 'fieldset', 'form', 'input', 'label', 'legend', 'meter', 'optgroup',
  'option', 'output', 'progress', 'select', 'textarea',
  'details', 'dialog', 'summary', 'slot', 'template',
  // SVG elements
  'circle', 'clipPath', 'defs', 'ellipse', 'g', 'image', 'line', 'linearGradient', 'mask',
  'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'stop', 'text',
  'textPath', 'tspan', 'use',
]);

// React built-in components (PascalCase)
const REACT_BUILT_INS = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);

/**
 * Rule: undefined-jsx-component
 *
 * DISABLED: Too many false positives - needs better dependency/library checking.
 * Re-enable after improving to check dependencies before assuming library components.
 *
 * Detects JSX elements that reference undefined components, providing guidance
 * on how to properly access library components, dependency components, etc.
 *
 * Severity: critical/high/medium
 * Applies to: all components
 *
 * NOTE: This rule is currently commented out in the monolith. Extracted as-is for
 * future re-enablement.
 */
@RegisterClass(BaseLintRule, 'undefined-jsx-component')
export class UndefinedJsxComponentRule extends BaseLintRule {
  get Name() { return 'undefined-jsx-component'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Track what's available in scope
    const availableIdentifiers = new Set<string>();
    const componentsFromProp = new Set<string>();
    const libraryGlobalVars = new Set<string>();

    // Add React hooks and built-ins
    availableIdentifiers.add('React');
    REACT_BUILT_INS.forEach((name) => availableIdentifiers.add(name));
    availableIdentifiers.add('useState');
    availableIdentifiers.add('useEffect');
    availableIdentifiers.add('useCallback');
    availableIdentifiers.add('useMemo');
    availableIdentifiers.add('useRef');
    availableIdentifiers.add('useContext');
    availableIdentifiers.add('useReducer');
    availableIdentifiers.add('useLayoutEffect');

    // Add HTML elements from our comprehensive list
    HTML_ELEMENTS.forEach((el) => availableIdentifiers.add(el));

    // Add library global variables
    if (componentSpec?.libraries) {
      for (const lib of componentSpec.libraries) {
        if (lib.globalVariable) {
          libraryGlobalVars.add(lib.globalVariable);
          availableIdentifiers.add(lib.globalVariable);
        }
      }
    }

    // Track dependency components
    if (componentSpec?.dependencies) {
      for (const dep of componentSpec.dependencies) {
        if (dep.name) {
          componentsFromProp.add(dep.name);
        }
      }
    }

    traverse(ast, {
      // Track variable declarations
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isIdentifier(path.node.id)) {
          availableIdentifiers.add(path.node.id.name);
        } else if (t.isObjectPattern(path.node.id)) {
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

          if (objectName && !availableIdentifiers.has(objectName)) {
            const isLikelyLibrary = /^[a-z][a-zA-Z]*$/.test(objectName) || /^[A-Z][a-zA-Z]*$/.test(objectName);

            if (isLikelyLibrary) {
              const availableLibraries = Array.from(libraryGlobalVars);

              if (availableLibraries.length > 0) {
                let suggestion = '';
                for (const lib of availableLibraries) {
                  if (objectName.toLowerCase().includes(lib.toLowerCase().replace('grid', '')) ||
                      lib.toLowerCase().includes(objectName.toLowerCase().replace('react', ''))) {
                    suggestion = lib;
                    break;
                  }
                }

                const propStr = t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...';

                if (suggestion) {
                  violations.push({
                    rule: 'undefined-jsx-component',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `Library global "${objectName}" is not defined. Did you mean "${suggestion}"? Available library globals: ${availableLibraries.join(', ')}`,
                    code: `<${objectName}.${propStr} />`,
                  });
                } else {
                  violations.push({
                    rule: 'undefined-jsx-component',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `Library global "${objectName}" is not defined. Available library globals: ${availableLibraries.join(', ')}`,
                    code: `<${objectName}.${propStr} />`,
                  });
                }
              } else {
                violations.push({
                  rule: 'undefined-jsx-component',
                  severity: 'critical',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `"${objectName}" is not defined. It appears to be a library global, but no libraries are specified in the component specification.`,
                  code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`,
                });
              }
            } else {
              violations.push({
                rule: 'undefined-jsx-component',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `"${objectName}" is not defined in the current scope.`,
                code: `<${objectName}.${t.isJSXIdentifier(openingElement.name.property) ? openingElement.name.property.name : '...'} />`,
              });
            }
          }
          return;
        }

        // Handle regular JSXIdentifier (e.g., <Component>)
        if (t.isJSXIdentifier(openingElement.name)) {
          const tagName = openingElement.name.name;

          if (!availableIdentifiers.has(tagName)) {
            const isHTMLElement = HTML_ELEMENTS.has(tagName.toLowerCase());
            const isReactBuiltIn = REACT_BUILT_INS.has(tagName);

            if (!isHTMLElement && !isReactBuiltIn) {
              const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(tagName);

              if (isPascalCase) {
                const availableLibraries = componentSpec?.libraries || [];

                if (availableLibraries.length > 0) {
                  const libraryNames = availableLibraries
                    .filter((lib) => lib.globalVariable)
                    .map((lib) => lib.globalVariable);

                  if (libraryNames.length === 1) {
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'critical',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is not defined. This looks like it should be from the ${libraryNames[0]} library. Add: const { ${tagName} } = unwrapComponents(${libraryNames[0]}, ['${tagName}']); at the top of your component function.`,
                      code: `<${tagName} ... />`,
                    });
                  } else {
                    violations.push({
                      rule: 'undefined-jsx-component',
                      severity: 'critical',
                      line: openingElement.loc?.start.line || 0,
                      column: openingElement.loc?.start.column || 0,
                      message: `JSX component "${tagName}" is not defined. Available libraries: ${libraryNames.join(', ')}. Use unwrapComponents to access it: const { ${tagName} } = unwrapComponents(LibraryName, ['${tagName}']);`,
                      code: `<${tagName} ... />`,
                    });
                  }
                } else {
                  violations.push({
                    rule: 'undefined-jsx-component',
                    severity: 'critical',
                    line: openingElement.loc?.start.line || 0,
                    column: openingElement.loc?.start.column || 0,
                    message: `JSX component "${tagName}" is not defined. This appears to be a library component, but no libraries have been specified in the component specification. The use of external libraries has not been authorized for this component. Components without library specifications cannot use external libraries.`,
                    code: `<${tagName} ... />`,
                  });
                }
              } else if (componentsFromProp.has(tagName)) {
                violations.push({
                  rule: 'undefined-jsx-component',
                  severity: 'high',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `JSX component "${tagName}" is in dependencies but appears to be undefined. Make sure to destructure it from the components prop: const { ${tagName} } = components;`,
                  code: `<${tagName} ... />`,
                });
              } else {
                violations.push({
                  rule: 'undefined-jsx-component',
                  severity: 'high',
                  line: openingElement.loc?.start.line || 0,
                  column: openingElement.loc?.start.column || 0,
                  message: `JSX component "${tagName}" is not defined. You must either: (1) define it in your component, (2) use a component that's already in the spec's dependencies, or (3) destructure it from a library that's already in the spec's libraries.`,
                  code: `<${tagName} ... />`,
                });
              }
            } else {
              violations.push({
                rule: 'undefined-jsx-component',
                severity: 'medium',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `JSX element "${tagName}" is not recognized as a valid HTML element or React component. Check the spelling or ensure it's properly defined.`,
                code: `<${tagName} ... />`,
              });
            }
          }
        }
      },
    });

    return violations;
    }
}
