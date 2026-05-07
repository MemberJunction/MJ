import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: string-template-validation
 *
 * Validates string templates and concatenation patterns for common issues:
 * - Template literals with undefined expressions
 * - String concatenation with undefined
 * - Malformed string return statements
 * - Strings containing template syntax but not using template literals
 * - Unclosed template literals
 *
 * Severity: critical/high
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'string-template-validation')
export class StringTemplateValidationRule extends BaseLintRule {
  get Name() { return 'string-template-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      // Check for malformed template literals
      TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
        // Template literals are parsed correctly by Babel, so if we're here it's valid
        // But we can check for common issues like empty expressions
        path.node.expressions.forEach((expr) => {
          if (t.isIdentifier(expr) && expr.name === 'undefined') {
            violations.push({
              rule: 'string-template-validation',
              severity: 'high',
              line: expr.loc?.start.line || 0,
              column: expr.loc?.start.column || 0,
              message: 'Template literal contains undefined expression',
              code: '${/* value */}',
            });
          }
        });
      },

      // Check for string concatenation issues
      BinaryExpression(path: NodePath<t.BinaryExpression>) {
        if (path.node.operator === '+') {
          const left = path.node.left;
          const right = path.node.right;

          // Check for incomplete string concatenation patterns
          if (t.isStringLiteral(left) && t.isIdentifier(right) && right.name === 'undefined') {
            violations.push({
              rule: 'string-template-validation',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: 'String concatenation with undefined',
              code: `'${(left as t.StringLiteral).value}'`,
            });
          }
        }
      },

      // Check for malformed return statements with strings
      ReturnStatement(path: NodePath<t.ReturnStatement>) {
        const arg = path.node.argument;

        // Look for patterns like: return ' + value (missing opening quote)
        if (t.isBinaryExpression(arg) && arg.operator === '+') {
          const left = arg.left;

          // Check if it starts with just a quote (malformed)
          if (t.isStringLiteral(left) && left.value === '') {
            const code = path.toString();
            // Check for patterns that suggest missing quotes
            if (code.includes("' +") || code.includes('" +')) {
              violations.push({
                rule: 'string-template-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: 'Malformed string concatenation - possible missing quote',
                code: 'Check string quotes and concatenation',
              });
            }
          }
        }

        // Detect pattern like: return ' + y.toFixed(4)
        if (t.isCallExpression(arg)) {
          const code = path.toString();
          if (code.match(/return\s+['"`]\s*\+/)) {
            violations.push({
              rule: 'string-template-validation',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: 'Malformed string template - missing opening quote or backtick',
              code: `return \`$\{value}\``,
            });
          }
        }
      },

      // Check inside function bodies for malformed strings
      StringLiteral(path: NodePath<t.StringLiteral>) {
        const value = path.node.value;

        // Check for strings that look like incomplete templates
        let isInTemplate = false;
        let currentPath: NodePath<t.Node> | null = path.parentPath;
        while (currentPath) {
          if (t.isTemplateLiteral(currentPath.node)) {
            isInTemplate = true;
            break;
          }
          currentPath = currentPath.parentPath;
        }

        if (value.includes('${') && !isInTemplate) {
          violations.push({
            rule: 'string-template-validation',
            severity: 'high',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: 'String contains template syntax but is not a template literal',
            code: `\`${value}\``,
          });
        }
      },
    });

    // Additional check for specific malformed patterns in raw code
    const code = ast.toString ? ast.toString() : '';
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      // Pattern: return ' + something or return " + something
      const malformedReturn = line.match(/return\s+['"`]\s*\+\s*[\w.()]/);
      if (malformedReturn) {
        violations.push({
          rule: 'string-template-validation',
          severity: 'critical',
          line: index + 1,
          column: malformedReturn.index || 0,
          message: 'Malformed string return - missing opening quote',
          code: 'return `${value}`',
        });
      }

      // Pattern: unclosed template literal
      const templateStart = line.match(/`[^`]*\$\{[^}]*$/);
      if (templateStart && !line.includes('`', templateStart.index! + 1)) {
        violations.push({
          rule: 'string-template-validation',
          severity: 'critical',
          line: index + 1,
          column: templateStart.index || 0,
          message: 'Unclosed template literal',
          code: 'Close template with backtick',
        });
      }
    });

    return violations;
  }
}
