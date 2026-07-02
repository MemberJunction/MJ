import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Known utility libraries whose globals must NOT be passed to unwrapLibraryComponents().
 * These libraries expose their API as methods on the global variable and should be
 * called directly (e.g., `_.debounce(fn, 500)`, `dayjs(date).format('YYYY-MM-DD')`).
 *
 * unwrapLibraryComponents() wraps the value in a way that makes utility functions
 * non-callable, causing runtime crashes like:
 *   Uncaught TypeError: D is not a function
 */
const UTILITY_LIBS: ReadonlyMap<string, { library: string; example: string }> = new Map([
  ['_',      { library: 'lodash',    example: '_.debounce(myFunction, 500)' }],
  ['dayjs',  { library: 'Day.js',    example: "dayjs(date).format('YYYY-MM-DD')" }],
  ['d3',     { library: 'D3.js',     example: "d3.select('#chart')" }],
  ['moment', { library: 'Moment.js', example: "moment().format('YYYY-MM-DD')" }],
]);

/**
 * Rule: no-unwrap-utility-libs
 *
 * Flags unwrapLibraryComponents() calls where the first argument is a known utility
 * library global (`_`, `dayjs`, `d3`, `moment`). These libraries expose their API as
 * methods on the global variable — wrapping them with unwrapLibraryComponents() makes
 * the extracted functions non-callable, causing runtime crashes.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-unwrap-utility-libs')
export class NoUnwrapUtilityLibsRule extends BaseLintRule {
  get Name() { return 'no-unwrap-utility-libs'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!t.isIdentifier(path.node.callee) || path.node.callee.name !== 'unwrapLibraryComponents') {
          return;
        }

        const firstArg = path.node.arguments[0];
        if (!firstArg || !t.isIdentifier(firstArg)) {
          return;
        }

        const globalName = firstArg.name;
        const libInfo = UTILITY_LIBS.get(globalName);
        if (!libInfo) {
          return;
        }

        const message =
          `Do not use unwrapLibraryComponents() with utility library "${globalName}" (${libInfo.library}). ` +
          `Utility libraries expose their API as methods on the global variable — call them directly ` +
          `(e.g., ${libInfo.example}). unwrapLibraryComponents() is only for UI component libraries like antd.`;

        violations.push(
          createViolation(
            'no-unwrap-utility-libs',
            'critical',
            path.node,
            message,
            truncateCode(path.toString()),
            {
              text: 'Remove the unwrapLibraryComponents() call and use the library global directly.',
              example:
                '// Instead of:\n' +
                `const { debounce } = unwrapLibraryComponents(${globalName}, 'debounce');\n` +
                '// Use:\n' +
                `const debouncedFn = ${libInfo.example};`,
            },
          ),
        );
      },
    });

    return violations;
  }
}
