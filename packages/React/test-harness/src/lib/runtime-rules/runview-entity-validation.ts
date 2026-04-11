import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';

/**
 * Rule: runview-entity-validation
 *
 * Validates that RunView/RunViews calls use entity names that are declared
 * in the component specification's data requirements.
 *
 * Severity: medium
 * Applies to: all components
 */
export const runviewEntityValidationRule: LintRule = {
  name: 'runview-entity-validation',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for utilities.rv.RunView or RunViews
        if (
          t.isMemberExpression(callee) &&
          t.isMemberExpression(callee.object) &&
          t.isIdentifier(callee.object.object) &&
          callee.object.object.name === 'utilities' &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'rv' &&
          t.isIdentifier(callee.property)
        ) {
          const methodName = callee.property.name;
          if (methodName !== 'RunView' && methodName !== 'RunViews') return;

          // Get the configs
          let configs: t.ObjectExpression[] = [];

          if (methodName === 'RunViews' && t.isArrayExpression(path.node.arguments[0])) {
            configs = path.node.arguments[0].elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
          } else if (methodName === 'RunView' && t.isObjectExpression(path.node.arguments[0])) {
            configs = [path.node.arguments[0]];
          }

          // Check each config against spec
          if (componentSpec?.dataRequirements?.entities) {
            const specEntityNames = componentSpec.dataRequirements.entities.map((e) => e.name);

            for (const config of configs) {
              let entityName: string | null = null;

              for (const prop of config.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  if (prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
                    entityName = prop.value.value;
                    break;
                  }
                }
              }

              if (entityName && specEntityNames.length > 0 && !specEntityNames.includes(entityName)) {
                violations.push({
                  rule: 'runview-entity-validation',
                  severity: 'medium',
                  line: config.loc?.start.line || 0,
                  column: config.loc?.start.column || 0,
                  message: `Entity '${entityName}' not in component spec. Available entities: ${specEntityNames.join(', ')}`,
                  code: `EntityName: '${specEntityNames[0] || 'EntityFromSpec'}'`,
                });
              }
            }
          }
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(runviewEntityValidationRule);
