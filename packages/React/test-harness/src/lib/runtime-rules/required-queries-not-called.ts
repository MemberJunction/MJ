import { traverse, NodePath, extractRunQueryNamesFromCode } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: required-queries-not-called
 *
 * Ensures that components with dataRequirements in 'queries' or 'hybrid' mode
 * actually call RunQuery for queries that are not delegated to child components.
 *
 * Severity: critical
 * Applies to: root components only
 */
@RegisterClass(BaseLintRule, 'required-queries-not-called')
export class RequiredQueriesNotCalledRule extends BaseLintRule {
  get Name() { return 'required-queries-not-called'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'root'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Check the mode - only enforce for 'queries' or 'hybrid' mode
    const mode = componentSpec?.dataRequirements?.mode;
    if (mode !== 'queries' && mode !== 'hybrid') {
      // Mode is not 'queries' or 'hybrid', so this rule doesn't apply
      return violations;
    }

    // Check if there are any queries defined in dataRequirements
    const hasQueries = componentSpec?.dataRequirements?.queries && componentSpec.dataRequirements.queries.length > 0;

    if (!hasQueries) {
      // No queries defined, so no violation
      return violations;
    }

    const allQueryNames = componentSpec!.dataRequirements!.queries!.map((q) => q.name).filter(Boolean);

    // In hierarchical components, the root's dataRequirements contains the complete
    // set of queries for the entire tree, but child components can own subsets and
    // call RunQuery themselves. Collect query names claimed by child dependencies
    // via two methods:
    //   1. Child spec has dataRequirements.queries (explicit delegation)
    //   2. Child spec has code that contains RunQuery + the query name (implicit delegation)
    const childClaimedQueries = new Set<string>();
    if (componentSpec!.dependencies) {
      for (const dep of componentSpec!.dependencies) {
        // Method 1: Explicit dataRequirements on child
        if (dep.dataRequirements?.queries) {
          for (const q of dep.dataRequirements.queries) {
            if (q.name) {
              childClaimedQueries.add(q.name);
            }
          }
        }

        // Method 2: Parse child code AST and extract actual RunQuery QueryName values
        if (dep.code) {
          for (const name of extractRunQueryNamesFromCode(dep.code)) {
            childClaimedQueries.add(name);
          }
        }

        // Recurse into nested dependencies (grandchildren)
        if (dep.dependencies) {
          for (const grandchild of dep.dependencies) {
            if (grandchild.dataRequirements?.queries) {
              for (const q of grandchild.dataRequirements.queries) {
                if (q.name) childClaimedQueries.add(q.name);
              }
            }
            if (grandchild.code) {
              for (const name of extractRunQueryNamesFromCode(grandchild.code)) {
                childClaimedQueries.add(name);
              }
            }
          }
        }
      }
    }

    const unclaimedQueryNames = allQueryNames.filter((name) => !childClaimedQueries.has(name));

    // If all queries are delegated to child components, no violation for the root
    if (unclaimedQueryNames.length === 0) {
      return violations;
    }

    // Track whether RunQuery is called anywhere in the root component's code
    let hasRunQueryCall = false;

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for utilities.rq.RunQuery pattern
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isMemberExpression(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.object.object) &&
          path.node.callee.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.callee.object.property) &&
          path.node.callee.object.property.name === 'rq' &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === 'RunQuery'
        ) {
          hasRunQueryCall = true;
        }

        // Also check for destructured pattern: rq.RunQuery
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) &&
          path.node.callee.object.name === 'rq' &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === 'RunQuery'
        ) {
          hasRunQueryCall = true;
        }
      },
    });

    // If unclaimed queries exist but RunQuery is never called, that's a critical violation
    if (!hasRunQueryCall) {
      violations.push({
        rule: 'required-queries-not-called',
        severity: 'critical',
        line: 1,
        column: 0,
        message: `Component has ${unclaimedQueryNames.length} defined ${unclaimedQueryNames.length === 1 ? 'query' : 'queries'} in dataRequirements (mode: '${mode}') but never calls RunQuery. Queries defined: ${unclaimedQueryNames.join(', ')}`,
        suggestion: {
          text: `When dataRequirements.mode is '${mode}' and includes queries, you must use utilities.rq.RunQuery to execute them, not RunView.`,
          example: `// Your dataRequirements defines these queries: ${unclaimedQueryNames.join(', ')}
// Mode is set to: '${mode}'

// ❌ WRONG - Using RunView for a query:
const result = await utilities.rv.RunView({
  EntityName: '${unclaimedQueryNames[0] || 'QueryName'}'
});

// ✅ CORRECT - Using RunQuery for queries:
const result = await utilities.rq.RunQuery({
  QueryName: '${unclaimedQueryNames[0] || 'QueryName'}'
});

// Key differences:
// - RunView: For entity-based data access (uses EntityName)
// - RunQuery: For pre-defined queries (uses QueryName)
// - dataRequirements.mode: '${mode}' requires RunQuery for queries`,
        },
      });
    }

    return violations;
    }
}
