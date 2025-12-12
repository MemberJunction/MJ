import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: no-window-access
 *
 * Prevents components from accessing the window object. Libraries should be accessed
 * through unwrapComponents, not through window. Interactive components must be
 * self-contained and not rely on global state.
 *
 * Allows export handler patterns (window.ComponentNameExport) for intentional
 * component export functionality with proper cleanup.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noWindowAccessRule: LintRule = {
  name: 'no-window-access',
  appliesTo: 'all',
  test: (ast, componentName, componentSpec?: ComponentSpec) => {
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
};
