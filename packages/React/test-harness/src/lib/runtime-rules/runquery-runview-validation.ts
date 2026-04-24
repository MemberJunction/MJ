import _traverse, { NodePath } from '@babel/traverse';
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: runquery-runview-validation
 *
 * Validates RunQuery/RunView calls for specific issues like SQL injection detection.
 * Entity/Query name validation is handled by the 'data-requirements-validation' rule.
 *
 * Severity: critical/medium
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'runquery-runview-validation')
export class RunqueryRunviewValidationRule extends BaseLintRule {
  get Name() { return 'runquery-runview-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for RunQuery calls - focus on SQL injection detection
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'RunQuery') {
          const args = path.node.arguments;
          if (args.length > 0 && t.isObjectExpression(args[0])) {
            const props = args[0].properties;

            // Find QueryName property
            const queryNameProp = props.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'QueryName');

            if (queryNameProp && t.isObjectProperty(queryNameProp)) {
              const value = queryNameProp.value;

              // Check if it's a string literal
              if (t.isStringLiteral(value)) {
                const queryName = value.value;

                // Check if it looks like SQL (contains SELECT, FROM, etc.)
                const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN'];
                const upperQuery = queryName.toUpperCase();
                const looksLikeSQL = sqlKeywords.some((keyword) => upperQuery.includes(keyword));

                if (looksLikeSQL) {
                  violations.push({
                    rule: 'runquery-runview-validation',
                    severity: 'critical',
                    line: value.loc?.start.line || 0,
                    column: value.loc?.start.column || 0,
                    message: `RunQuery cannot accept SQL statements. QueryName must be a registered query name, not SQL: "${queryName.substring(0, 50)}..."`,
                    code: value.value.substring(0, 100),
                  });
                }
              } else if (t.isIdentifier(value) || t.isTemplateLiteral(value)) {
                // Dynamic query name - warn that it shouldn't be SQL
                violations.push({
                  rule: 'runquery-runview-validation',
                  severity: 'medium',
                  line: value.loc?.start.line || 0,
                  column: value.loc?.start.column || 0,
                  message: `Dynamic QueryName detected. Ensure this is a query name, not a SQL statement.`,
                  code: path.toString().substring(0, 100),
                });
              }
            } else {
              // Missing QueryName property
              violations.push({
                rule: 'runquery-runview-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `RunQuery call is missing the required "QueryName" property.`,
                code: path.toString().substring(0, 100),
              });
            }
          }
        }

        // RunView validation removed - handled by data-requirements-validation
      },
    });

    return violations;
    }
}
