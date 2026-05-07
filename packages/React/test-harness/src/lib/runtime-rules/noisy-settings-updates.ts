import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Helper function to extract function name from a NodePath
 */
function getFunctionName(path: NodePath): string | null {
  const node = path.node;

  // Check for named function
  if (t.isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }

  // Check for arrow function assigned to variable
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      return parent.id.name;
    }
  }

  // Check for function assigned as property
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  return null;
}

/**
 * Rule: noisy-settings-updates
 *
 * Prevents saving settings on every change/keystroke. Settings should only be
 * saved on blur, submit, or after debouncing to avoid excessive updates.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'noisy-settings-updates')
export class NoisySettingsUpdatesRule extends BaseLintRule {
  get Name() { return 'noisy-settings-updates'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for onSaveUserSettings calls
        if (t.isOptionalCallExpression(path.node) || t.isCallExpression(path.node)) {
          const callee = path.node.callee;
          if (t.isIdentifier(callee) && callee.name === 'onSaveUserSettings') {
            // Check if this is inside an onChange/onInput handler
            let parent = path.getFunctionParent();
            if (parent) {
              const funcName = getFunctionName(parent);
              if (funcName && (funcName.includes('Change') || funcName.includes('Input'))) {
                // Check if it's not debounced or on blur
                const parentBody = parent.node.body;
                const hasDebounce = parentBody && parentBody.toString().includes('debounce');
                const hasTimeout = parentBody && parentBody.toString().includes('setTimeout');

                if (!hasDebounce && !hasTimeout) {
                  violations.push({
                    rule: 'noisy-settings-updates',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Saving settings on every change/keystroke. Save on blur, submit, or after debouncing.`,
                    suggestion: {
                      text: 'Save settings sparingly - only on meaningful user actions',
                      example: `// ❌ WRONG - Saving on every keystroke:
const handleSearchChange = (e) => {
  setSearchTerm(e.target.value);
  onSaveUserSettings?.({ searchTerm: e.target.value }); // TOO NOISY!
};

// ✅ CORRECT - Save on blur or debounced:
const handleSearchBlur = () => {
  if (searchTerm !== savedUserSettings?.searchTerm) {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm });
  }
};

// ✅ CORRECT - Debounced save:
const saveSearchTerm = useMemo(() =>
  debounce((term) => {
    onSaveUserSettings?.({ ...savedUserSettings, searchTerm: term });
  }, 500),
  [savedUserSettings]
);`,
                    },
                  });
                }
              }
            }
          }
        }
      },
    });

    return violations;
  }
}
