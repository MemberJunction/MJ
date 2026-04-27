import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: string-replace-all-occurrences
 *
 * Detects usage of .replace() that may only replace the first occurrence.
 * Flags template patterns (high severity) and general string patterns (low severity).
 * Also checks for regex patterns without the 'g' flag.
 *
 * Severity: high (template patterns) / low (general)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'string-replace-all-occurrences')
export class StringReplaceAllOccurrencesRule extends BaseLintRule {
  get Name() { return 'string-replace-all-occurrences'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // Template patterns that are HIGH severity (likely to have multiple occurrences)
    const templatePatterns = [
      { pattern: /\{\{[^}]+\}\}/, example: '{{field}}', desc: 'double curly braces' },
      { pattern: /\{[^}]+\}/, example: '{field}', desc: 'single curly braces' },
      { pattern: /<<[^>]+>>/, example: '<<field>>', desc: 'double angle brackets' },
      { pattern: /<[^>]+>/, example: '<field>', desc: 'single angle brackets' },
    ];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check if it's a .replace() method call
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'replace') {
          const args = path.node.arguments;
          if (args.length >= 2) {
            const [searchArg] = args;

            // Handle string literal search patterns
            if (t.isStringLiteral(searchArg)) {
              const searchValue = searchArg.value;

              // Check if it matches any template pattern
              let matchedPattern = null;
              for (const tp of templatePatterns) {
                if (tp.pattern.test(searchValue)) {
                  matchedPattern = tp;
                  break;
                }
              }

              if (matchedPattern) {
                // HIGH severity for template patterns
                violations.push({
                  rule: 'string-replace-all-occurrences',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Using replace() with ${matchedPattern.desc} template '${searchValue}' only replaces the first occurrence. This will cause bugs if the template appears multiple times.`,
                  suggestion: {
                    text: `Use .replaceAll('${searchValue}', ...) to replace all occurrences`,
                    example: `str.replaceAll('${searchValue}', value)`,
                  },
                });
              } else {
                // LOW severity for general replace() usage
                violations.push({
                  rule: 'string-replace-all-occurrences',
                  severity: 'low',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Note: replace() only replaces the first occurrence of '${searchValue}'. If you need to replace all occurrences, use replaceAll() or a global regex.`,
                  suggestion: {
                    text: `Consider if you need replaceAll() instead`,
                    example: `str.replaceAll('${searchValue}', value) or str.replace(/${searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/g, value)`,
                  },
                });
              }
            }
            // Handle regex patterns - only warn if not global
            else if (t.isRegExpLiteral(searchArg)) {
              const flags = searchArg.flags || '';
              if (!flags.includes('g')) {
                violations.push({
                  rule: 'string-replace-all-occurrences',
                  severity: 'low',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Regex pattern without 'g' flag only replaces first match. Add 'g' flag for global replacement.`,
                  suggestion: {
                    text: `Add 'g' flag to replace all matches`,
                    example: `str.replace(/${searchArg.pattern}/${flags}g, value)`,
                  },
                });
              }
            }
          }
        }
      },
    });

    return violations;
  }
}
