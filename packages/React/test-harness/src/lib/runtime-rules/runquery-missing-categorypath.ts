import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: runquery-missing-categorypath
 *
 * Ensures that RunQuery calls include CategoryPath when required by the component spec.
 * CategoryPath is essential for uniquely identifying queries that may share the same name.
 *
 * Severity: critical
 * Applies to: all components
 */
export const runqueryMissingCategorypathRule: LintRule = {
  name: 'runquery-missing-categorypath',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Build a map of query names to their category paths from the spec
    const queryCategories = new Map<string, string>();
    if (componentSpec?.dataRequirements?.queries) {
      for (const query of componentSpec.dataRequirements.queries) {
        // Only track queries with non-empty categoryPath (empty string means no categoryPath requirement)
        if (query.name && query.categoryPath && query.categoryPath.trim().length > 0) {
          queryCategories.set(query.name, query.categoryPath);
        }
      }
    }

    // If no queries with categoryPath in spec, this rule doesn't apply
    if (queryCategories.size === 0) {
      return violations;
    }

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for utilities.rq.RunQuery
        if (
          t.isMemberExpression(callee) &&
          t.isMemberExpression(callee.object) &&
          t.isIdentifier(callee.object.object) &&
          callee.object.object.name === 'utilities' &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'rq' &&
          t.isIdentifier(callee.property) &&
          callee.property.name === 'RunQuery'
        ) {
          // Get the first argument (RunQuery params object)
          const runQueryParams = path.node.arguments[0];
          if (!t.isObjectExpression(runQueryParams)) return;

          // Extract QueryName and CategoryPath from the call
          let queryName: string | null = null;
          let hasCategoryPath = false;
          let queryNameProp: t.ObjectProperty | undefined;

          for (const prop of runQueryParams.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                queryName = prop.value.value;
                queryNameProp = prop;
              } else if (prop.key.name === 'CategoryPath') {
                hasCategoryPath = true;
              }
            }
          }

          // Check if this query requires a CategoryPath based on the spec
          if (queryName && queryCategories.has(queryName) && !hasCategoryPath) {
            const expectedCategoryPath = queryCategories.get(queryName)!;

            violations.push({
              rule: 'runquery-missing-categorypath',
              severity: 'critical',
              line: queryNameProp?.loc?.start.line || path.node.loc?.start.line || 0,
              column: queryNameProp?.loc?.start.column || path.node.loc?.start.column || 0,
              message: `RunQuery with QueryName '${queryName}' is missing required CategoryPath parameter. Queries are uniquely identified by both QueryName and CategoryPath together. Without CategoryPath, RunQuery may find a different query with the same name, causing collisions and unintended behavior.`,
              code: `RunQuery({ QueryName: '${queryName}' })  // Missing: CategoryPath`,
              suggestion: {
                text: `Add CategoryPath property to uniquely identify the query. The CategoryPath should match what's defined in your dataRequirements.queries[].categoryPath`,
                example: `await utilities.rq.RunQuery({
  QueryName: '${queryName}',
  CategoryPath: '${expectedCategoryPath}',  // Required: ensures correct query is used
  Parameters: {
    // Your query parameters here
  }
})`,
              },
            });
          }
        }
      },
    });

    return violations;
  },
};
