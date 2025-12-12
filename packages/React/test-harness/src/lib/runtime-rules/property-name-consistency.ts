import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: property-name-consistency
 *
 * Detects property name mismatches when data is transformed (especially in map functions).
 * Ensures that accessed property names match the transformed property names, catching
 * common errors where properties are renamed during transformation but code still tries
 * to access them by the original name.
 *
 * Severity: critical (causes runtime errors or undefined values)
 * Applies to: all components
 */
export const propertyNameConsistencyRule: LintRule = {
  name: 'property-name-consistency',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];
    const dataTransformations = new Map<
      string,
      { originalProps: Set<string>; transformedProps: Set<string>; location: { line: number; column: number } }
    >();
    const propertyAccesses = new Map<string, Set<string>>(); // variable -> accessed properties

    // Track data transformations (especially in map functions)
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Look for array.map transformations
        if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'map') {
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
                    if (
                      t.isMemberExpression(prop.value) &&
                      t.isIdentifier(prop.value.object) &&
                      prop.value.object.name === paramName &&
                      t.isIdentifier(prop.value.property)
                    ) {
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
                        column: path.node.loc?.start.column || 0,
                      },
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
      },
    });

    // Check for mismatches
    for (const [varName, transformation] of dataTransformations) {
      const accesses = propertyAccesses.get(varName);
      if (accesses) {
        for (const accessedProp of accesses) {
          // Check if accessed property exists in transformed props
          if (!transformation.transformedProps.has(accessedProp)) {
            // Check if it's trying to use original prop name
            const matchingOriginal = Array.from(transformation.originalProps).find((orig) => orig.toLowerCase() === accessedProp.toLowerCase());

            if (matchingOriginal) {
              // Find the transformed name
              const transformedName = Array.from(transformation.transformedProps).find((t) => t.toLowerCase() === accessedProp.toLowerCase());

              violations.push({
                rule: 'property-name-consistency',
                severity: 'critical',
                line: transformation.location.line,
                column: transformation.location.column,
                message: `Property name mismatch: data transformed with different casing. Accessing '${accessedProp}' but property was transformed to '${transformedName || 'different name'}'`,
                code: `Transform uses '${Array.from(transformation.transformedProps).join(', ')}' but code accesses '${accessedProp}'`,
              });
            }
          }
        }
      }
    }

    return violations;
  },
};
