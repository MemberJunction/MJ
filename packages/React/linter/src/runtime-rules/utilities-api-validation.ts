import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: utilities-api-validation
 *
 * Validates that components only access valid properties and methods
 * on the utilities object (rv, rq, md, ai) and their sub-objects.
 *
 * Valid API surface:
 * - utilities.rv: RunView(), RunViews()
 * - utilities.rq: RunQuery()
 * - utilities.md: GetEntityObject(), Entities
 * - utilities.ai: ExecutePrompt(), EmbedText(), VectorService
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'utilities-api-validation')
export class UtilitiesApiValidationRule extends BaseLintRule {
  get Name() { return 'utilities-api-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // Define the complete utilities API surface
    const utilitiesAPI: Record<string, { methods: Set<string>; properties: Set<string> }> = {
      rv: { methods: new Set(['RunView', 'RunViews']), properties: new Set() },
      rq: { methods: new Set(['RunQuery']), properties: new Set() },
      md: { methods: new Set(['GetEntityObject']), properties: new Set(['Entities']) },
      ai: { methods: new Set(['ExecutePrompt', 'EmbedText']), properties: new Set(['VectorService']) },
    };

    const validUtilityProps = new Set(Object.keys(utilitiesAPI));

    traverse(ast, {
      // Check for utilities.* property access
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // Check for direct utilities.* access
        if (t.isIdentifier(path.node.object) && path.node.object.name === 'utilities') {
          if (t.isIdentifier(path.node.property)) {
            const propName = path.node.property.name;

            if (!validUtilityProps.has(propName)) {
              violations.push({
                rule: 'utilities-api-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Invalid utilities property '${propName}'. Valid properties are: rv (RunView), rq (RunQuery), md (Metadata), ai (AI Tools)`,
                code: `utilities.${propName}`,
              });
            }
          }
          return; // Don't check deeper for this node
        }

        // Check for utilities.{rv|rq|md|ai}.property access (non-call)
        if (t.isCallExpression(path.parent) && path.parent.callee === path.node) {
          return; // Skip - this is a method call, handled below
        }

        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object) &&
          path.node.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.object.property) &&
          t.isIdentifier(path.node.property)
        ) {
          const utilityName = path.node.object.property.name;
          const propName = path.node.property.name;
          const api = utilitiesAPI[utilityName];

          if (api && !api.properties.has(propName) && !api.methods.has(propName)) {
            const validItems = [
              ...Array.from(api.methods).map((m) => `${m}()`),
              ...Array.from(api.properties),
            ];
            violations.push({
              rule: 'utilities-api-validation',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Invalid access '${propName}' on utilities.${utilityName}. Valid: ${validItems.join(', ')}`,
              code: `utilities.${utilityName}.${propName}`,
            });
          }
        }
      },

      // Check for utilities.{rv|rq|md|ai}.method() calls
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee)) {
          const callee = path.node.callee;

          if (
            t.isMemberExpression(callee.object) &&
            t.isIdentifier(callee.object.object) &&
            callee.object.object.name === 'utilities' &&
            t.isIdentifier(callee.object.property) &&
            t.isIdentifier(callee.property)
          ) {
            const utilityName = callee.object.property.name;
            const methodName = callee.property.name;
            const api = utilitiesAPI[utilityName];

            if (api && !api.methods.has(methodName)) {
              const validMethods = Array.from(api.methods).join(', ');
              violations.push({
                rule: 'utilities-api-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Invalid method '${methodName}' on utilities.${utilityName}. Valid methods: ${validMethods}`,
                code: `utilities.${utilityName}.${methodName}()`,
              });
            }
          }
        }
      },
    });

    return violations;
    }
}
