import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: dependency-shadowing
 *
 * Ensures that component dependencies (embedded components) are not shadowed
 * by local variable or function declarations. Dependencies must be accessed
 * via destructuring from the components prop or as components.ComponentName.
 *
 * Severity: critical (for shadowing), low (for unused dependencies)
 * Applies to: all components
 */
export const dependencyShadowingRule: LintRule = {
  name: 'dependency-shadowing',
  appliesTo: 'all',
  test: (ast, componentName, componentSpec?: ComponentSpec) => {
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
};
