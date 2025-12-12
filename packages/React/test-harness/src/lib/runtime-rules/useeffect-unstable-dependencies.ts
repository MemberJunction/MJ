import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: useeffect-unstable-dependencies
 *
 * Detects unstable dependencies in useEffect hooks that can cause infinite render loops.
 * Two types of issues:
 *
 * 1. Object/function props (utilities, components, callbacks, styles, savedUserSettings)
 *    - Severity: high - May cause infinite loops if parent doesn't provide stable references
 *
 * 2. Parameters with object literal defaults (queryParameters = {})
 *    - Severity: critical - ALWAYS causes infinite loops (new object every render)
 *
 * Applies to: all components
 */
export const useeffectUnstableDependenciesRule: LintRule = {
  name: 'useeffect-unstable-dependencies',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    // Known prop names that are always objects/functions and unstable
    const unstablePropNames = new Set([
      'utilities',
      'components',
      'callbacks',
      'styles',
      'savedUserSettings', // Can be unstable if not memoized by parent
    ]);

    // Helper to find the component function and extract parameters with object defaults
    const findComponentParams = (useEffectPath: NodePath<t.CallExpression>): Map<string, t.ObjectExpression | t.ArrayExpression> => {
      const paramsWithObjectDefaults = new Map<string, t.ObjectExpression | t.ArrayExpression>();

      let current: NodePath | null = useEffectPath.parentPath;
      while (current) {
        // Look for FunctionDeclaration or ArrowFunctionExpression/FunctionExpression
        if (
          t.isFunctionDeclaration(current.node) ||
          t.isArrowFunctionExpression(current.node) ||
          t.isFunctionExpression(current.node)
        ) {
          const func = current.node as t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression;

          // Check if this looks like a component (starts with uppercase)
          let isComponent = false;
          if (t.isFunctionDeclaration(func) && func.id && /^[A-Z]/.test(func.id.name)) {
            isComponent = true;
          }

          // For arrow functions, check the variable declarator name
          if ((t.isArrowFunctionExpression(func) || t.isFunctionExpression(func)) && current.parentPath) {
            const parent = current.parentPath.node;
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && /^[A-Z]/.test(parent.id.name)) {
              isComponent = true;
            }
          }

          if (isComponent) {
            // Extract parameters with object literal defaults
            for (const param of func.params) {
              // Case 1: ObjectPattern (destructured props): { foo = {}, bar = [] }
              if (t.isObjectPattern(param)) {
                for (const prop of param.properties) {
                  if (t.isObjectProperty(prop)) {
                    const value = prop.value;
                    // Check if this destructured property has a default: queryParameters = {}
                    if (t.isAssignmentPattern(value) && t.isIdentifier(value.left)) {
                      const defaultVal = value.right;
                      if (t.isObjectExpression(defaultVal) || t.isArrayExpression(defaultVal)) {
                        paramsWithObjectDefaults.set(value.left.name, defaultVal);
                      }
                    }
                  }
                }
              }
              // Case 2: AssignmentPattern (param with default): queryParameters = {}
              else if (t.isAssignmentPattern(param)) {
                const left = param.left;
                const right = param.right;

                // Simple param with object default: queryParameters = {}
                if (t.isIdentifier(left) && (t.isObjectExpression(right) || t.isArrayExpression(right))) {
                  paramsWithObjectDefaults.set(left.name, right);
                }
                // ObjectPattern with object default: { foo, bar } = {}
                else if (t.isObjectPattern(left) && (t.isObjectExpression(right) || t.isArrayExpression(right))) {
                  // The whole destructured object gets a default - mark all properties
                  for (const prop of left.properties) {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                      paramsWithObjectDefaults.set(prop.key.name, right);
                    }
                  }
                }
              }
            }
            break; // Found the component, stop traversing up
          }
        }
        current = current.parentPath;
      }

      return paramsWithObjectDefaults;
    };

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for useEffect calls
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') {
          // Get the dependency array (second argument)
          const depsArg = path.node.arguments[1];

          if (!depsArg || !t.isArrayExpression(depsArg)) {
            return; // No deps array or empty deps []
          }

          // Find component parameters with object defaults
          const paramsWithObjectDefaults = findComponentParams(path);

          // Check each dependency
          for (const dep of depsArg.elements) {
            if (!dep) continue;

            let unstableDep: string | null = null;
            let severity: 'critical' | 'high' = 'high';
            let message = '';
            let suggestionText = '';

            // Case 1: Member expression (utilities.rq.RunQuery, callbacks?.onSelect)
            if (t.isMemberExpression(dep) || t.isOptionalMemberExpression(dep)) {
              const memberExpr = dep as t.MemberExpression;

              // Get the root object (e.g., 'utilities' from 'utilities.rq.RunQuery')
              let rootObj: t.Expression = memberExpr.object;
              while ((t.isMemberExpression(rootObj) || t.isOptionalMemberExpression(rootObj)) && 'object' in rootObj) {
                rootObj = rootObj.object;
              }

              if (t.isIdentifier(rootObj) && unstablePropNames.has(rootObj.name)) {
                unstableDep = `${rootObj.name}.${t.isIdentifier(memberExpr.property) ? memberExpr.property.name : '...'}`;
                severity = 'high';
                message = `useEffect has unstable dependency '${unstableDep}' that may cause infinite render loops. Object/function references from props typically change on every render. This works if the parent provides stable references (via useMemo), but is fragile and should be avoided.`;
                suggestionText = `Remove '${unstableDep}' from dependency array. These utilities/services are typically stable and don't need to be tracked.`;
              }
            }
            // Case 2: Direct identifier (utilities, components, etc.)
            else if (t.isIdentifier(dep)) {
              // Check if it's a known unstable prop name
              if (unstablePropNames.has(dep.name)) {
                unstableDep = dep.name;
                severity = 'high';
                message = `useEffect has unstable dependency '${unstableDep}' that may cause infinite render loops. Object/function references from props typically change on every render. This works if the parent provides stable references (via useMemo), but is fragile and should be avoided.`;
                suggestionText = `Remove '${unstableDep}' from dependency array. These utilities/services are typically stable and don't need to be tracked.`;
              }
              // Check if it's a param with object literal default
              else if (paramsWithObjectDefaults.has(dep.name)) {
                unstableDep = dep.name;
                severity = 'critical';
                const defaultValue = paramsWithObjectDefaults.get(dep.name);
                const defaultStr = t.isObjectExpression(defaultValue) ? '{}' : '[]';
                message = `useEffect has CRITICAL unstable dependency '${unstableDep}' with object literal default (${dep.name} = ${defaultStr}). This creates a NEW object on EVERY render, causing infinite loops. This is ALWAYS broken.`;
                suggestionText = `Remove '${unstableDep}' from dependency array. Props with object literal defaults (${dep.name} = ${defaultStr}) create new references every render.`;
              }
            }

            // Report violation if we found an unstable dependency
            if (unstableDep) {
              let fixedDeps = depsArg.elements
                .filter((e) => e !== dep)
                .map((e) => {
                  if (!e) return '';
                  if (t.isIdentifier(e)) return e.name;
                  if (t.isMemberExpression(e) || t.isOptionalMemberExpression(e)) {
                    // Try to extract the full path
                    const parts: string[] = [];
                    let current: t.Expression | t.PrivateName = e;
                    while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
                      if ('property' in current && t.isIdentifier(current.property)) {
                        parts.unshift(current.property.name);
                      }
                      if ('object' in current) {
                        current = current.object;
                      } else {
                        break;
                      }
                    }
                    if (t.isIdentifier(current)) {
                      parts.unshift(current.name);
                    }
                    return parts.join('.');
                  }
                  return '...';
                })
                .filter(Boolean);

              violations.push({
                rule: 'useeffect-unstable-dependencies',
                severity: severity,
                line: dep.loc?.start.line || path.node.loc?.start.line || 0,
                column: dep.loc?.start.column || path.node.loc?.start.column || 0,
                message: message,
                code: `}, [${fixedDeps.join(', ')}${fixedDeps.length > 0 ? ', ' : ''}${unstableDep}]);  // ${severity === 'critical' ? '🚨' : '⚠️'} Remove '${unstableDep}'`,
                suggestion: {
                  text: suggestionText,
                  example: fixedDeps.length > 0
                    ? `}, [${fixedDeps.join(', ')}]);  // ✅ Removed unstable '${unstableDep}'`
                    : `}, []);  // ✅ Run once on mount - dependencies are stable`
                }
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
