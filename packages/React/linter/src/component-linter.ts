import * as parser from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

// @babel/traverse is CJS - in Node.js ESM, the function is at .default
// See: https://github.com/babel/babel/discussions/13093
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;
import { ComponentSpec, ComponentQueryDataRequirement, SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import type { EntityFieldInfo } from '@memberjunction/core';
import { Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { LibraryLintCache } from './library-lint-cache';
import type { LinterOptions } from './linter-options';
import { TypeContext } from './type-context';
import { TypeInferenceEngine } from './type-inference-engine';
import { ControlFlowAnalyzer } from './control-flow-analyzer';
import { SemanticValidator } from './schema-validation';
import { TypeCompatibilityRule, LintContext as TypeRuleLintContext } from './type-rules/type-compatibility-rule';
import { ComponentPropRule } from './schema-validation/component-prop-rule';
import { BaseLintRule } from './lint-rule';
import { MJGlobal } from '@memberjunction/global';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { GetDialect } from '@memberjunction/sql-dialect';
// Side-effect import: triggers @RegisterClass decorators on all built-in rules
import './runtime-rules';

export interface LintResult {
  success: boolean;
  violations: Violation[];
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  hasErrors: boolean;
}

export interface LintOptions {
  debugMode?: boolean;
}

export interface Violation {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number;
  column: number;
  message: string;
  code?: string;
  source?: 'user-component' | 'runtime-wrapper' | 'react-framework' | 'test-harness';
  suggestion?: {
    text: string;
    example?: string;
  };
}

export class ComponentLinter {

  public static async validateComponentSyntax(code: string, componentName: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const parseResult = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
        ranges: true,
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        const errors = parseResult.errors.map((error: any) => {
          const location = error.loc ? `Line ${error.loc.line}, Column ${error.loc.column}` : 'Unknown location';
          return `${location}: ${error.message || error.toString()}`;
        });

        return {
          valid: false,
          errors,
        };
      }

      return {
        valid: true,
        errors: [],
      };
    } catch (error: unknown) {
      // Handle catastrophic parse failures
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      return {
        valid: false,
        errors: [`Failed to parse component: ${errorMessage}`],
      };
    }
  }

  /**
   * The SQL dialect used for WHERE clause validation in semantic validators.
   * Defaults to SQL Server. Set via the `sqlDialect` parameter on `lintComponent()`.
   */
  private static _sqlDialect: SQLParserDialect = GetDialect('sqlserver');

  /** Current SQL dialect used for WHERE clause parsing */
  public static get SqlDialect(): SQLParserDialect {
    return ComponentLinter._sqlDialect;
  }

  public static async lintComponent(
    code: string,
    componentName: string,
    componentSpec?: ComponentSpec,
    isRootComponent?: boolean,
    contextUser?: UserInfo,
    debugMode?: boolean,
    options?: LinterOptions,
    sqlDialect?: SQLParserDialect,
  ): Promise<LintResult> {
    if (sqlDialect) {
      ComponentLinter._sqlDialect = sqlDialect;
    }
    try {
      // Require contextUser when libraries need to be checked
      if (componentSpec?.libraries && componentSpec.libraries.length > 0 && !contextUser) {
        throw new Error(
          'contextUser is required when linting components with library dependencies. This is needed to load library-specific lint rules from the database.',
        );
      }
      // Parse with error recovery to get both AST and errors
      const parseResult = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
        attachComment: false,
        ranges: true,
        tokens: false,
      });

      // Check for syntax errors from parser
      const syntaxViolations: Violation[] = [];
      if (parseResult.errors && parseResult.errors.length > 0) {
        for (const error of parseResult.errors) {
          const err = error as any; // Babel parser errors don't have proper types
          syntaxViolations.push({
            rule: 'syntax-error',
            severity: 'critical',
            line: err.loc?.line || 0,
            column: err.loc?.column || 0,
            message: `Syntax error in component "${componentName}": ${err.message || err.toString()}`,
            code: err.code || 'BABEL_PARSER_ERROR',
          });
        }
      }

      // If we have critical syntax errors, return immediately with those
      if (syntaxViolations.length > 0) {
        // Add suggestions directly to syntax violations
        this.generateSyntaxErrorSuggestions(syntaxViolations);

        return {
          success: false,
          violations: syntaxViolations,
          criticalCount: syntaxViolations.length,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          hasErrors: true,
        };
      }

      // Continue with existing linting logic
      const ast = parseResult;

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 1 REFACTOR: Run Type Inference ONCE before all rules
      // This creates a shared TypeContext that all rules can consume
      // ═══════════════════════════════════════════════════════════════════════════
      const typeEngine = new TypeInferenceEngine(componentSpec, contextUser);
      const controlFlowAnalyzer = new ControlFlowAnalyzer(ast, componentSpec);

      // Run type inference analysis once
      await typeEngine.analyze(ast);
      const typeContext = typeEngine.getTypeContext();

      // Discover all registered lint rules via ClassFactory
      const ruleRegistrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseLintRule);
      const allRules: BaseLintRule[] = [];
      for (const reg of ruleRegistrations) {
        if (!reg.Key) continue; // Skip the base class registration (no key)
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLintRule>(BaseLintRule, reg.Key);
        if (instance) allRules.push(instance);
      }

      // Filter rules based on component type
      const applicableRules = isRootComponent
        ? allRules.filter(rule => rule.AppliesTo === 'all' || rule.AppliesTo === 'root')
        : allRules.filter(rule => rule.AppliesTo === 'all' || rule.AppliesTo === 'child');

      const violations: Violation[] = [];

      // Run each rule with error handling to prevent crashes
      for (const rule of applicableRules) {
        try {
          const ruleViolations = rule.Test(ast, componentName, componentSpec, options, typeContext);
          violations.push(...ruleViolations);
        } catch (error) {
          console.warn(`Rule "${rule.Name}" failed during execution:`, error instanceof Error ? error.message : error);
          if (debugMode) {
            console.error('Full error:', error);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 1 REFACTOR: Run new TypeCompatibilityRule with shared context
      // This consolidates all type checking into a single rule
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const typeCompatRule = new TypeCompatibilityRule();
        const lintContext: TypeRuleLintContext = {
          componentName,
          componentSpec,
          typeContext,
          typeEngine,
          controlFlowAnalyzer,
          sqlDialect: ComponentLinter._sqlDialect,
        };
        const typeViolations = typeCompatRule.validate(ast, lintContext);
        violations.push(...typeViolations);
      } catch (error) {
        console.warn('TypeCompatibilityRule failed during execution:', error instanceof Error ? error.message : error);
        if (debugMode) {
          console.error('Full error:', error);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // PHASE 3 REFACTOR: Run new ComponentPropRule with shared context
      // This consolidates all component prop validation into a single rule:
      // - Prop existence (from dependency-prop-validation)
      // - Required props checking
      // - Prop type validation (via TypeContext)
      // - Semantic constraint validation (via SemanticValidators)
      // - Unknown props warning
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const componentPropRule = new ComponentPropRule();
        const lintContext: TypeRuleLintContext = {
          componentName,
          componentSpec,
          typeContext,
          typeEngine,
          controlFlowAnalyzer,
          sqlDialect: ComponentLinter._sqlDialect,
        };
        const propViolations = componentPropRule.validate(ast, lintContext);
        violations.push(...propViolations);
      } catch (error) {
        console.warn('ComponentPropRule failed during execution:', error instanceof Error ? error.message : error);
        if (debugMode) {
          console.error('Full error:', error);
        }
      }

      // Add data requirements validation if componentSpec is provided
      if (componentSpec?.dataRequirements?.entities) {
        try {
          const dataViolations = this.validateDataRequirements(ast, componentSpec, options);
          violations.push(...dataViolations);
        } catch (error) {
          console.warn('Data requirements validation failed:', error instanceof Error ? error.message : error);
          if (debugMode) {
            console.error('Full error:', error);
          }
        }
      }

      // Apply library-specific lint rules if available
      if (componentSpec?.libraries) {
        const libraryViolations = await this.applyLibraryLintRules(ast, componentSpec, contextUser, debugMode);
        violations.push(...libraryViolations);
      }

      // Deduplicate violations - keep only unique rule+message combinations
      const uniqueViolations = this.deduplicateViolations(violations);

      // Count violations by severity
      const criticalCount = uniqueViolations.filter((v) => v.severity === 'critical').length;
      const highCount = uniqueViolations.filter((v) => v.severity === 'high').length;
      const mediumCount = uniqueViolations.filter((v) => v.severity === 'medium').length;
      const lowCount = uniqueViolations.filter((v) => v.severity === 'low').length;

      // Debug mode summary
      if (debugMode && uniqueViolations.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 LINT SUMMARY:');
        console.log('='.repeat(60));
        if (criticalCount > 0) console.log(`  🔴 Critical: ${criticalCount}`);
        if (highCount > 0) console.log(`  🟠 High: ${highCount}`);
        if (mediumCount > 0) console.log(`  🟡 Medium: ${mediumCount}`);
        if (lowCount > 0) console.log(`  🟢 Low: ${lowCount}`);
        console.log('='.repeat(60));

        // Group violations by library
        const libraryViolations = uniqueViolations.filter((v) => v.rule.includes('-validator'));
        if (libraryViolations.length > 0) {
          console.log('\n📚 Library-Specific Issues:');
          const byLibrary = new Map<string, Violation[]>();
          libraryViolations.forEach((v) => {
            const lib = v.rule.replace('-validator', '');
            if (!byLibrary.has(lib)) byLibrary.set(lib, []);
            byLibrary.get(lib)!.push(v);
          });

          byLibrary.forEach((violations, library) => {
            console.log(`  • ${library}: ${violations.length} issue${violations.length > 1 ? 's' : ''}`);
          });
        }
        console.log('');
      }

      return {
        success: criticalCount === 0 && highCount === 0, // Only fail on critical/high
        violations: uniqueViolations,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        hasErrors: criticalCount > 0 || highCount > 0,
      };
    } catch (error) {
      // If parsing fails, return a parse error
      // Log stack trace for debugging
      if (error instanceof Error && error.stack) {
        console.error('Parse error stack trace:', error.stack);
      }
      return {
        success: false,
        violations: [
          {
            rule: 'parse-error',
            severity: 'critical',
            line: 0,
            column: 0,
            message: `Failed to parse component: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        hasErrors: true,
      };
    }
  }

  private static validateDataRequirements(ast: t.File, componentSpec: ComponentSpec, options?: LinterOptions): Violation[] {
    const violations: Violation[] = [];

    // Extract entity names from dataRequirements
    const requiredEntities = new Set<string>();
    const requiredQueries = new Set<string>();

    // Map to store full query definitions for parameter validation
    const queryDefinitionsMap = new Map<string, ComponentQueryDataRequirement>();

    // Map to track allowed fields per entity (from dataRequirements display/filter/sort arrays)
    const entityFieldsMap = new Map<
      string,
      {
        displayFields: Set<string>;
        filterFields: Set<string>;
        sortFields: Set<string>;
      }
    >();

    // Map to track ALL fields that exist in the entity
    // Used to distinguish "field not in requirements" (medium) from "field doesn't exist" (critical)
    const entityAllFieldsMap = new Map<string, Set<string>>();

    // FIRST: Populate entityAllFieldsMap from options.entityMetadata if provided
    // This gives us the complete list of fields that actually exist in each entity
    if (options?.entityMetadata && Array.isArray(options.entityMetadata)) {
      for (const entity of options.entityMetadata) {
        if (entity.name && entity.fields) {
          const fieldNames = new Set<string>(entity.fields.map((f: SimpleEntityFieldInfo) => f.name));
          entityAllFieldsMap.set(entity.name, fieldNames);
        }
      }
    }

    if (componentSpec.dataRequirements?.entities) {
      for (const entity of componentSpec.dataRequirements.entities) {
        if (entity.name) {
          requiredEntities.add(entity.name);
          entityFieldsMap.set(entity.name, {
            displayFields: new Set(entity.displayFields || []),
            filterFields: new Set(entity.filterFields || []),
            sortFields: new Set(entity.sortFields || []),
          });

          // Build set of ALL fields from fieldMetadata if available
          // Only use fieldMetadata as fallback if entityMetadata wasn't provided for this entity
          if (!entityAllFieldsMap.has(entity.name) && entity.fieldMetadata && Array.isArray(entity.fieldMetadata)) {
            const allFields = new Set<string>();
            for (const field of entity.fieldMetadata) {
              if (field.name) {
                allFields.add(field.name);
              }
            }
            entityAllFieldsMap.set(entity.name, allFields);
          }
        }
      }
    }

    if (componentSpec.dataRequirements?.queries) {
      for (const query of componentSpec.dataRequirements.queries) {
        if (query.name) {
          requiredQueries.add(query.name);
          queryDefinitionsMap.set(query.name, query);
        }
      }
    }

    // Also check child components' dataRequirements
    if (componentSpec.dependencies) {
      for (const dep of componentSpec.dependencies) {
        if (dep.dataRequirements?.entities) {
          for (const entity of dep.dataRequirements.entities) {
            if (entity.name) {
              requiredEntities.add(entity.name);
              // Merge fields if entity already exists
              const existing = entityFieldsMap.get(entity.name);
              if (existing) {
                (entity.displayFields || []).forEach((f: string) => existing.displayFields.add(f));
                (entity.filterFields || []).forEach((f: string) => existing.filterFields.add(f));
                (entity.sortFields || []).forEach((f: string) => existing.sortFields.add(f));
              } else {
                entityFieldsMap.set(entity.name, {
                  displayFields: new Set(entity.displayFields || []),
                  filterFields: new Set(entity.filterFields || []),
                  sortFields: new Set(entity.sortFields || []),
                });
              }

              // Merge fieldMetadata into allFields map only if entityMetadata wasn't provided
              // If entityMetadata was provided, it already has the complete field list
              if (!entityAllFieldsMap.has(entity.name) && entity.fieldMetadata && Array.isArray(entity.fieldMetadata)) {
                const existingAll = new Set<string>();
                for (const field of entity.fieldMetadata) {
                  if (field.name) {
                    existingAll.add(field.name);
                  }
                }
                entityAllFieldsMap.set(entity.name, existingAll);
              }
            }
          }
        }
        if (dep.dataRequirements?.queries) {
          for (const query of dep.dataRequirements.queries) {
            if (query.name) {
              requiredQueries.add(query.name);
              queryDefinitionsMap.set(query.name, query);
            }
          }
        }
      }
    }

    // Find all RunView, RunViews, and RunQuery calls in the code
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for utilities.rv.RunView or utilities.rv.RunViews pattern
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isMemberExpression(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.object.object) &&
          path.node.callee.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.callee.object.property) &&
          path.node.callee.object.property.name === 'rv' &&
          t.isIdentifier(path.node.callee.property) &&
          (path.node.callee.property.name === 'RunView' || path.node.callee.property.name === 'RunViews')
        ) {
          // For RunViews, it might be an array of configs
          const configs =
            path.node.callee.property.name === 'RunViews' && path.node.arguments.length > 0 && t.isArrayExpression(path.node.arguments[0])
              ? path.node.arguments[0].elements.filter((e) => t.isObjectExpression(e))
              : path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])
                ? [path.node.arguments[0]]
                : [];

          // Check each config object
          for (const configObj of configs) {
            if (t.isObjectExpression(configObj)) {
              // Find EntityName property
              for (const prop of configObj.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
                  const usedEntity = prop.value.value;

                  // Check if this entity is in the required entities
                  if (requiredEntities.size > 0 && !requiredEntities.has(usedEntity)) {
                    // Enhanced fuzzy matching for better suggestions
                    const possibleMatches = Array.from(requiredEntities).filter((e) => {
                      const eLower = e.toLowerCase();
                      const usedLower = usedEntity.toLowerCase();

                      // Check various matching patterns
                      return (
                        // Contains match
                        eLower.includes(usedLower) ||
                        usedLower.includes(eLower) ||
                        // Remove spaces and check
                        eLower.replace(/\s+/g, '').includes(usedLower.replace(/\s+/g, '')) ||
                        usedLower.replace(/\s+/g, '').includes(eLower.replace(/\s+/g, '')) ||
                        // Check if the main words match (ignore prefixes like "MJ:")
                        eLower.replace(/^mj:\s*/i, '').includes(usedLower) ||
                        usedLower.includes(eLower.replace(/^mj:\s*/i, ''))
                      );
                    });

                    // Always show all available entities for clarity
                    const allEntities = Array.from(requiredEntities);
                    const entityList =
                      allEntities.length <= 5 ? allEntities.join(', ') : allEntities.slice(0, 5).join(', ') + `, ... (${allEntities.length} total)`;

                    let message = `Entity "${usedEntity}" not found in dataRequirements.`;

                    if (possibleMatches.length > 0) {
                      message += ` Did you mean "${possibleMatches[0]}"?`;
                    }

                    message += ` Available entities: ${entityList}`;

                    violations.push({
                      rule: 'entity-name-mismatch',
                      severity: 'critical',
                      line: prop.value.loc?.start.line || 0,
                      column: prop.value.loc?.start.column || 0,
                      message,
                      code: `EntityName: "${usedEntity}"`,
                    });
                  } else {
                    // Entity is valid, now check fields
                    const entityFields = entityFieldsMap.get(usedEntity);
                    if (entityFields) {
                      // Check Fields array
                      const fieldsProperty = configObj.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'Fields');

                      if (fieldsProperty && t.isObjectProperty(fieldsProperty) && t.isArrayExpression(fieldsProperty.value)) {
                        for (const fieldElement of fieldsProperty.value.elements) {
                          if (t.isStringLiteral(fieldElement)) {
                            const fieldName = fieldElement.value;

                            // Check for SQL functions
                            if (/COUNT\s*\(|SUM\s*\(|AVG\s*\(|MAX\s*\(|MIN\s*\(/i.test(fieldName)) {
                              violations.push({
                                rule: 'runview-sql-function',
                                severity: 'critical',
                                line: fieldElement.loc?.start.line || 0,
                                column: fieldElement.loc?.start.column || 0,
                                message: `RunView does not support SQL aggregations. Use RunQuery for aggregations or fetch raw data and aggregate in JavaScript.`,
                                code: fieldName,
                              });
                            } else {
                              // Check if field is in allowed fields
                              const isAllowed =
                                entityFields.displayFields.has(fieldName) || entityFields.filterFields.has(fieldName) || entityFields.sortFields.has(fieldName);

                              if (!isAllowed) {
                                // Check if field exists in entity metadata (two-tier severity)
                                const allFields = entityAllFieldsMap.get(usedEntity);
                                const existsInEntity = allFields ? allFields.has(fieldName) : false;

                                if (existsInEntity) {
                                  // Field exists but not in dataRequirements - medium severity (works but suboptimal)
                                  violations.push({
                                    rule: 'field-not-in-requirements',
                                    severity: 'medium',
                                    line: fieldElement.loc?.start.line || 0,
                                    column: fieldElement.loc?.start.column || 0,
                                    message: `Field "${fieldName}" exists in entity "${usedEntity}" but not declared in dataRequirements. Consider adding to displayFields, filterFields, or sortFields.`,
                                    code: fieldName,
                                  });
                                } else {
                                  // Field doesn't exist in entity - critical severity (will fail at runtime)
                                  violations.push({
                                    rule: 'field-not-in-requirements',
                                    severity: 'critical',
                                    line: fieldElement.loc?.start.line || 0,
                                    column: fieldElement.loc?.start.column || 0,
                                    message: `Field "${fieldName}" does not exist in entity "${usedEntity}". Available fields: ${[
                                      ...entityFields.displayFields,
                                      ...entityFields.filterFields,
                                      ...entityFields.sortFields,
                                    ].join(', ')}`,
                                    code: fieldName,
                                  });
                                }
                              }
                            }
                          }
                        }
                      }

                      // Check OrderBy field
                      const orderByProperty = configObj.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'OrderBy');

                      if (orderByProperty && t.isObjectProperty(orderByProperty) && t.isStringLiteral(orderByProperty.value)) {
                        const orderByValue = orderByProperty.value.value;
                        // Extract field name from OrderBy (e.g., "AccountName ASC" -> "AccountName")
                        const orderByField = orderByValue.split(/\s+/)[0];

                        if (!entityFields.sortFields.has(orderByField)) {
                          // Check if field exists in entity metadata (two-tier severity)
                          const allFields = entityAllFieldsMap.get(usedEntity);
                          const existsInEntity = allFields ? allFields.has(orderByField) : false;

                          if (existsInEntity) {
                            // Field exists but not in sortFields - medium severity (works but suboptimal)
                            violations.push({
                              rule: 'orderby-field-not-sortable',
                              severity: 'medium',
                              line: orderByProperty.value.loc?.start.line || 0,
                              column: orderByProperty.value.loc?.start.column || 0,
                              message: `OrderBy field "${orderByField}" exists in entity "${usedEntity}" but not declared in sortFields. Consider adding for optimization.`,
                              code: orderByValue,
                            });
                          } else {
                            // Field doesn't exist in entity - critical severity (will fail at runtime)
                            violations.push({
                              rule: 'orderby-field-not-sortable',
                              severity: 'critical',
                              line: orderByProperty.value.loc?.start.line || 0,
                              column: orderByProperty.value.loc?.start.column || 0,
                              message: `OrderBy field "${orderByField}" does not exist in entity "${usedEntity}". Available sort fields: ${[
                                ...entityFields.sortFields,
                              ].join(', ')}`,
                              code: orderByValue,
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Check for utilities.rv.RunQuery pattern
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isMemberExpression(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.object.object) &&
          path.node.callee.object.object.name === 'utilities' &&
          t.isIdentifier(path.node.callee.object.property) &&
          path.node.callee.object.property.name === 'rv' &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === 'RunQuery'
        ) {
          // Check the first argument (should be an object with QueryName)
          if (path.node.arguments.length > 0 && t.isObjectExpression(path.node.arguments[0])) {
            const configObj = path.node.arguments[0];

            // Find QueryName property
            for (const prop of configObj.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                const usedQuery = prop.value.value;

                // Check if this query is in the required queries
                if (requiredQueries.size > 0 && !requiredQueries.has(usedQuery)) {
                  // Enhanced fuzzy matching for better suggestions
                  const possibleMatches = Array.from(requiredQueries).filter((q) => {
                    const qLower = q.toLowerCase();
                    const usedLower = usedQuery.toLowerCase();

                    return (
                      // Contains match
                      qLower.includes(usedLower) ||
                      usedLower.includes(qLower) ||
                      // Remove spaces and check
                      qLower.replace(/\s+/g, '').includes(usedLower.replace(/\s+/g, '')) ||
                      usedLower.replace(/\s+/g, '').includes(qLower.replace(/\s+/g, ''))
                    );
                  });

                  // Always show all available queries for clarity
                  const allQueries = Array.from(requiredQueries);
                  const queryList = allQueries.length <= 5 ? allQueries.join(', ') : allQueries.slice(0, 5).join(', ') + `, ... (${allQueries.length} total)`;

                  let message = `Query "${usedQuery}" not found in dataRequirements.`;

                  if (possibleMatches.length > 0) {
                    message += ` Did you mean "${possibleMatches[0]}"?`;
                  }

                  if (requiredQueries.size > 0) {
                    message += ` Available queries: ${queryList}`;
                  } else {
                    message += ` No queries defined in dataRequirements.`;
                  }

                  violations.push({
                    rule: 'query-name-mismatch',
                    severity: 'critical',
                    line: prop.value.loc?.start.line || 0,
                    column: prop.value.loc?.start.column || 0,
                    message,
                    code: `QueryName: "${usedQuery}"`,
                  });
                } else if (queryDefinitionsMap.has(usedQuery)) {
                  // Query is valid, now check parameters
                  const queryDef = queryDefinitionsMap.get(usedQuery);
                  if (queryDef?.parameters && queryDef.parameters.length > 0) {
                    // Extract parameters from the RunQuery call
                    const paramsInCall = new Map<string, any>();

                    // Look for Parameters property in the config object
                    for (const prop of configObj.properties) {
                      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'Parameters' && t.isObjectExpression(prop.value)) {
                        // Extract each parameter from the Parameters object
                        for (const paramProp of prop.value.properties) {
                          if (t.isObjectProperty(paramProp) && t.isIdentifier(paramProp.key)) {
                            paramsInCall.set(paramProp.key.name, paramProp);
                          }
                        }

                        // Check for required parameters
                        const requiredParams = queryDef.parameters.filter((p) => p.value !== '@runtime' || p.value === '@runtime');
                        for (const reqParam of requiredParams) {
                          if (!paramsInCall.has(reqParam.name)) {
                            violations.push({
                              rule: 'missing-query-parameter',
                              severity: 'critical',
                              line: prop.value.loc?.start.line || 0,
                              column: prop.value.loc?.start.column || 0,
                              message: `Missing required parameter "${reqParam.name}" for query "${usedQuery}". ${reqParam.description ? `Description: ${reqParam.description}` : ''}`,
                              code: `Parameters: { ${reqParam.name}: ... }`,
                            });
                          }
                        }

                        // Check for unknown parameters
                        const validParamNames = new Set(queryDef.parameters.map((p) => p.name));
                        for (const [paramName, paramNode] of paramsInCall) {
                          if (!validParamNames.has(paramName)) {
                            violations.push({
                              rule: 'unknown-query-parameter',
                              severity: 'high',
                              line: (paramNode as any).loc?.start.line || 0,
                              column: (paramNode as any).loc?.start.column || 0,
                              message: `Unknown parameter "${paramName}" for query "${usedQuery}". Valid parameters: ${Array.from(validParamNames).join(', ')}`,
                              code: `${paramName}: ...`,
                            });
                          }
                        }

                        break; // Found Parameters property, no need to continue
                      }
                    }

                    // If query has parameters but no Parameters property was found in the call
                    if (paramsInCall.size === 0 && queryDef?.parameters && queryDef.parameters.length > 0) {
                      violations.push({
                        rule: 'missing-parameters-object',
                        severity: 'critical',
                        line: configObj.loc?.start.line || 0,
                        column: configObj.loc?.start.column || 0,
                        message: `Query "${usedQuery}" requires parameters but none were provided. Required parameters: ${queryDef.parameters.map((p) => p.name).join(', ')}`,
                        code: `RunQuery({ QueryName: "${usedQuery}", Parameters: { ... } })`,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    return violations;
  }


  private static deduplicateViolations(violations: Violation[]): Violation[] {
    const seen = new Set<string>();
    const unique: Violation[] = [];

    for (const violation of violations) {
      // Create a key from the complete violation details (case-insensitive for message)
      const key = `${violation.rule}:${violation.severity}:${violation.line}:${violation.column}:${violation.message.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(violation);
      }
    }

    // Sort by severity (critical > high > medium > low) and then by line number
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    unique.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.line - b.line;
    });

    return unique;
  }


  private static generateSyntaxErrorSuggestions(violations: Violation[]): void {
    for (const violation of violations) {
      if (violation.message.includes('Unterminated string')) {
        violation.suggestion = {
          text: 'Check that all string literals are properly closed with matching quotes',
          example: 'Template literals with interpolation must use backticks: `text ${variable} text`',
        };
      } else if (violation.message.includes('Unexpected token') || violation.message.includes('export')) {
        violation.suggestion = {
          text: 'Ensure all code is within the component function body',
          example: 'Remove any export statements or code outside the function definition',
        };
      } else if (violation.message.includes('import') && violation.message.includes('top level')) {
        violation.suggestion = {
          text: 'Import statements are not allowed in components - use props instead',
          example: 'Access libraries through props: const { React, MaterialUI } = props.components',
        };
      } else {
        violation.suggestion = {
          text: 'Fix the syntax error before the component can be compiled',
          example: 'Review the code at the specified line and column for syntax issues',
        };
      }
    }
  }

  /**
   * Apply library-specific lint rules based on ComponentLibrary LintRules field
   */
  private static async applyLibraryLintRules(ast: t.File, componentSpec: ComponentSpec, contextUser?: UserInfo, debugMode?: boolean): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      // Use the cached and compiled library rules
      const cache = LibraryLintCache.getInstance();
      await cache.loadLibraryRules(contextUser);

      // Check each library that this component uses
      if (componentSpec.libraries) {
        // Run library checks in parallel for performance
        const libraryPromises = componentSpec.libraries.map(async (lib) => {
          const libraryViolations: Violation[] = [];

          // Get the cached and compiled rules for this library
          const compiledRules = cache.getLibraryRules(lib.name);

          if (debugMode) {
            console.log(`\n  📚 Library: ${lib.name}`);
            if (compiledRules) {
              console.log(`  ┌─ Has lint rules: ✅`);
              if (compiledRules.validators) {
                console.log(`  ├─ Validators: ${Object.keys(compiledRules.validators).length}`);
              }
              if (compiledRules.initialization) {
                console.log(`  ├─ Initialization rules: ✅`);
              }
              if (compiledRules.lifecycle) {
                console.log(`  ├─ Lifecycle rules: ✅`);
              }
              console.log(`  └─ Starting checks...`);
            } else {
              console.log(`  └─ No lint rules defined`);
            }
          }

          if (compiledRules) {
            const library = compiledRules.library;
            const libraryName = library.Name || lib.name;

            // Apply initialization rules
            if (compiledRules.initialization) {
              if (debugMode) {
                console.log(`  ├─ 🔍 Checking ${libraryName} initialization patterns...`);
              }
              const initViolations = this.checkLibraryInitialization(ast, libraryName, compiledRules.initialization);

              // Debug logging for library violations
              if (debugMode && initViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${initViolations.length} initialization issue${initViolations.length > 1 ? 's' : ''}`);
                initViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...initViolations);
            }

            // Apply lifecycle rules
            if (compiledRules.lifecycle) {
              if (debugMode) {
                console.log(`  ├─ 🔄 Checking ${libraryName} lifecycle management...`);
              }
              const lifecycleViolations = this.checkLibraryLifecycle(ast, libraryName, compiledRules.lifecycle);

              // Debug logging for library violations
              if (debugMode && lifecycleViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${lifecycleViolations.length} lifecycle issue${lifecycleViolations.length > 1 ? 's' : ''}`);
                lifecycleViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...lifecycleViolations);
            }

            // Apply options validation
            if (compiledRules.options) {
              if (debugMode) {
                console.log(`  ├─ ⚙️  Checking ${libraryName} configuration options...`);
              }
              const optionsViolations = this.checkLibraryOptions(ast, libraryName, compiledRules.options);

              // Debug logging for library violations
              if (debugMode && optionsViolations.length > 0) {
                console.log(`  │   ⚠️  Found ${optionsViolations.length} configuration issue${optionsViolations.length > 1 ? 's' : ''}`);
                optionsViolations.forEach((v) => {
                  const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🟢';
                  console.log(`  │   ${icon} Line ${v.line}: ${v.message}`);
                });
              }

              libraryViolations.push(...optionsViolations);
            }

            // Apply compiled validators (already compiled in cache)
            if (compiledRules.validators) {
              const validatorViolations = this.executeCompiledValidators(ast, libraryName, library.GlobalVariable || '', compiledRules.validators, debugMode);
              libraryViolations.push(...validatorViolations);
            }
          }

          return libraryViolations;
        });

        // Wait for all library checks to complete
        const allLibraryViolations = await Promise.all(libraryPromises);

        // Flatten the results
        allLibraryViolations.forEach((libViolations) => {
          violations.push(...libViolations);
        });
      }
    } catch (error) {
      console.warn('Failed to apply library lint rules:', error);
    }

    return violations;
  }

  /**
   * Check library initialization patterns (constructor, element type, etc.)
   */
  private static checkLibraryInitialization(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      // Check for new ConstructorName() patterns
      NewExpression(path: NodePath<t.NewExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === rules.constructorName) {
          // Check if it requires 'new' keyword
          if (rules.requiresNew === false) {
            violations.push({
              rule: 'library-initialization',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `${libraryName}: ${rules.constructorName} should not use 'new' keyword`,
              code: `${rules.constructorName}(...) // without new`,
            });
          }

          // Check element type if first argument is a ref
          if (rules.elementType && path.node.arguments[0]) {
            const firstArg = path.node.arguments[0];

            // Check if it's chartRef.current or similar
            if (t.isMemberExpression(firstArg) && t.isIdentifier(firstArg.property) && firstArg.property.name === 'current') {
              // Try to find what element the ref is attached to
              const refName = t.isIdentifier(firstArg.object) ? firstArg.object.name : null;
              if (refName) {
                ComponentLinter.checkRefElementType(ast, refName, rules.elementType, libraryName, violations);
              }
            }
          }
        }
      },

      // Check for function calls without new (if requiresNew is true)
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === rules.constructorName && rules.requiresNew === true) {
          violations.push({
            rule: 'library-initialization',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `${libraryName}: ${rules.constructorName} requires 'new' keyword`,
            code: `new ${rules.constructorName}(...)`,
          });
        }
      },
    });

    return violations;
  }

  /**
   * Check if a library is directly instantiated in the component code
   * Returns false if the library is only used indirectly (e.g., by dependency components)
   */
  private static isLibraryDirectlyInstantiated(ast: t.File, constructorName: string): boolean {
    let isDirectlyUsed = false;

    traverse(ast, {
      // Check for: new Chart(...), new ApexCharts(...), etc.
      NewExpression(path: NodePath<t.NewExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === constructorName) {
          isDirectlyUsed = true;
        }
      },

      // Check for: Chart.register(...), Chart.defaults.set(...), etc.
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee) &&
            t.isIdentifier(path.node.callee.object) &&
            path.node.callee.object.name === constructorName) {
          isDirectlyUsed = true;
        }
      },
    });

    return isDirectlyUsed;
  }

  /**
   * Check if a ref is attached to the correct element type
   */
  private static checkRefElementType(ast: t.File, refName: string, expectedType: string, libraryName: string, violations: Violation[]): void {
    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;

        // Check if this element has a ref attribute
        const refAttr = openingElement.attributes.find((attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'ref');

        if (refAttr && t.isJSXAttribute(refAttr)) {
          // Check if the ref value matches our refName
          const refValue = refAttr.value;
          if (t.isJSXExpressionContainer(refValue) && t.isIdentifier(refValue.expression) && refValue.expression.name === refName) {
            // Check element type
            const elementName = t.isJSXIdentifier(openingElement.name) ? openingElement.name.name : '';

            if (elementName.toLowerCase() !== expectedType.toLowerCase()) {
              violations.push({
                rule: 'library-element-type',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `${libraryName} requires a <${expectedType}> element, not <${elementName}>`,
                code: `<${expectedType} ref={${refName}}>`,
              });
            }
          }
        }
      },
    });
  }

  /**
   * Check library lifecycle methods (render, destroy, etc.)
   */
  private static checkLibraryLifecycle(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    // Track which methods are called
    const calledMethods = new Set<string>();
    const instanceVariables = new Set<string>();

    traverse(ast, {
      // Track instance variables
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) && t.isIdentifier(path.node.init.callee)) {
          if (t.isIdentifier(path.node.id)) {
            instanceVariables.add(path.node.id.name);
          }
        }
      },

      // Track method calls
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee)) {
          const callee = path.node.callee as t.MemberExpression;

          if (t.isIdentifier(callee.property)) {
            const methodName = callee.property.name;
            const objectName = t.isIdentifier(callee.object) ? callee.object.name : null;

            if (objectName && instanceVariables.has(objectName)) {
              calledMethods.add(methodName);
            }
          }
        }
      },
    });

    // Check required methods
    if (rules.requiredMethods) {
      for (const method of rules.requiredMethods) {
        if (!calledMethods.has(method)) {
          violations.push({
            rule: 'library-lifecycle',
            severity: 'high',
            line: 0,
            column: 0,
            message: `${libraryName}: Missing required method call '${method}()' after initialization`,
            code: `instance.${method}()`,
          });
        }
      }
    }

    // Check cleanup in useEffect
    if (rules.cleanupMethods && rules.cleanupMethods.length > 0) {
      // First, check if the library is directly instantiated in the component
      // If it's only used by dependency components, skip cleanup check
      const isLibraryDirectlyUsed = ComponentLinter.isLibraryDirectlyInstantiated(ast, rules.constructorName);

      if (!isLibraryDirectlyUsed) {
        // Library is only used indirectly (e.g., by dependency components)
        // No cleanup check needed
        return violations;
      }

      let hasCleanup = false;

      // Track local variables that are instances of the library
      const libraryInstances = new Set<string>();

      traverse(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
          // Check for both useEffect and React.useEffect
          const isUseEffect =
            (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') ||
            (t.isMemberExpression(path.node.callee) &&
              t.isIdentifier(path.node.callee.object) &&
              path.node.callee.object.name === 'React' &&
              t.isIdentifier(path.node.callee.property) &&
              path.node.callee.property.name === 'useEffect');

          if (isUseEffect) {
            const firstArg = path.node.arguments[0];
            if (t.isArrowFunctionExpression(firstArg) || t.isFunctionExpression(firstArg)) {
              // First, identify local variables that are library instances
              // e.g., const chart = new ApexCharts(...)
              libraryInstances.clear();
              traverse(
                firstArg,
                {
                  VariableDeclarator(varPath: NodePath<t.VariableDeclarator>) {
                    if (
                      t.isIdentifier(varPath.node.id) &&
                      t.isNewExpression(varPath.node.init) &&
                      t.isIdentifier(varPath.node.init.callee) &&
                      varPath.node.init.callee.name === rules.constructorName
                    ) {
                      libraryInstances.add(varPath.node.id.name);
                    }
                  },
                },
                path.scope,
                path.state,
                path,
              );

              // Check if it returns a cleanup function
              traverse(
                firstArg,
                {
                  ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
                    if (t.isArrowFunctionExpression(returnPath.node.argument) || t.isFunctionExpression(returnPath.node.argument)) {
                      // Check if cleanup function calls destroy
                      traverse(
                        returnPath.node.argument,
                        {
                          CallExpression(cleanupPath: NodePath<t.CallExpression>) {
                            if (t.isMemberExpression(cleanupPath.node.callee)) {
                              const callee = cleanupPath.node.callee as t.MemberExpression;

                              // Check if the method name is a cleanup method
                              if (t.isIdentifier(callee.property) && rules.cleanupMethods.includes(callee.property.name)) {
                                // Pattern 1: instance.destroy() where instance is a tracked library instance
                                // e.g., chart.destroy() where chart is from const chart = new ApexCharts(...)
                                if (t.isIdentifier(callee.object) && libraryInstances.has(callee.object.name)) {
                                  hasCleanup = true;
                                }
                                // Pattern 2: ref.current.destroy() or ref.current._chart.destroy()
                                // Any member expression chain ending in cleanup method
                                // e.g., chartRef.current._chart.destroy()
                                else if (t.isMemberExpression(callee.object)) {
                                  hasCleanup = true;
                                }
                                // Pattern 3: d3.select(...).selectAll('*').remove()
                                // Chained method calls ending in cleanup
                                else if (t.isCallExpression(callee.object)) {
                                  hasCleanup = true;
                                }
                                // Pattern 4: Any identifier calling cleanup method
                                // e.g., selection.remove() where selection = d3.select(...)
                                else if (t.isIdentifier(callee.object)) {
                                  hasCleanup = true;
                                }
                              }
                            }
                          },
                        },
                        returnPath.scope,
                        returnPath.state,
                        returnPath,
                      );
                    }
                  },
                },
                path.scope,
                path.state,
                path,
              );
            }
          }
        },
      });

      if (!hasCleanup) {
        violations.push({
          rule: 'library-cleanup',
          severity: 'medium',
          line: 0,
          column: 0,
          message: `${libraryName}: Missing cleanup in useEffect. Call ${rules.cleanupMethods.join(' or ')} in cleanup function`,
          code: `useEffect(() => {\n  // ... initialization\n  return () => {\n    instance.${rules.cleanupMethods[0]}();\n  };\n}, []);`,
        });
      }
    }

    return violations;
  }

  /**
   * Check library options and configuration
   */
  private static checkLibraryOptions(ast: t.File, libraryName: string, rules: any): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      ObjectExpression(path: NodePath<t.ObjectExpression>) {
        // Check if this might be a config object for the library
        const properties = path.node.properties.filter((p): p is t.ObjectProperty => t.isObjectProperty(p));
        const propNames = properties.filter((p) => t.isIdentifier(p.key)).map((p) => (p.key as t.Identifier).name);

        // Check for required properties
        if (rules.requiredProperties) {
          const hasChartType = propNames.some((name) => rules.requiredProperties.includes(name));

          if (hasChartType) {
            // This looks like a config object, check all required props
            for (const required of rules.requiredProperties) {
              if (!propNames.includes(required)) {
                violations.push({
                  rule: 'library-options',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `${libraryName}: Missing required option '${required}'`,
                  code: `${required}: /* value */`,
                });
              }
            }
          }
        }

        // Check property types
        if (rules.propertyTypes) {
          for (const prop of properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const propName = prop.key.name;
              const expectedType = rules.propertyTypes[propName];

              if (expectedType) {
                // Check if the value matches expected type
                if (expectedType.includes('array') && !t.isArrayExpression(prop.value)) {
                  violations.push({
                    rule: 'library-options',
                    severity: 'medium',
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message: `${libraryName}: Option '${propName}' should be an array`,
                    code: `${propName}: []`,
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

  /**
   * Execute pre-compiled validators from cache
   */
  private static executeCompiledValidators(
    ast: t.File,
    libraryName: string,
    globalVariable: string,
    validators: Record<string, any>,
    debugMode?: boolean,
  ): Violation[] {
    const violations: Violation[] = [];

    // Create context object for validators
    const context: any = {
      libraryName,
      globalVariable,
      instanceVariables: new Set<string>(),
      violations: [], // Validators push violations here
    };

    // First pass: identify library instance variables
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isNewExpression(path.node.init) && t.isIdentifier(path.node.init.callee)) {
          // Check if it's a library constructor
          if (path.node.init.callee.name === globalVariable) {
            if (t.isIdentifier(path.node.id)) {
              context.instanceVariables.add(path.node.id.name);
            }
          }
        }
      },
    });

    // Execute each compiled validator
    for (const [validatorName, validator] of Object.entries(validators)) {
      if (validator && validator.validateFn) {
        const beforeCount = context.violations.length;

        // Log that we're running this specific validator
        if (debugMode) {
          console.log(`  ├─ 🔬 Running ${libraryName} validator: ${validatorName}`);
          if (validator.description) {
            console.log(`  │   ℹ️  ${validator.description}`);
          }
        }

        // Traverse AST and apply validator
        traverse(ast, {
          enter(path: NodePath) {
            try {
              // Validators don't return violations, they push to context.violations
              validator.validateFn(ast, path, t, context);
            } catch (error) {
              // Validator execution error - log but don't crash
              console.warn(`Validator ${validatorName} failed:`, error);
              if (debugMode) {
                console.error('Full error:', error);
              }
            }
          },
        });

        // Debug logging for this specific validator
        const newViolations = context.violations.length - beforeCount;
        if (debugMode && newViolations > 0) {
          console.log(`  │   ✓ Found ${newViolations} violation${newViolations > 1 ? 's' : ''}`);

          // Show the violations from this validator
          const validatorViolations = context.violations.slice(beforeCount);
          validatorViolations.forEach((v: any) => {
            const icon =
              v.type === 'error' || v.severity === 'critical'
                ? '🔴'
                : v.type === 'warning' || v.severity === 'high'
                  ? '🟠'
                  : v.severity === 'medium'
                    ? '🟡'
                    : '🟢';
            console.log(`  │   ${icon} Line ${v.line || 'unknown'}: ${v.message}`);
            if (v.suggestion) {
              console.log(`  │      💡 ${v.suggestion}`);
            }
          });
        } else if (debugMode) {
          console.log(`  │   ✓ No violations found`);
        }
      }
    }

    // Convert context violations to standard format
    const standardViolations = context.violations.map((v: any) => ({
      rule: `${libraryName.toLowerCase()}-validator`,
      severity: v.severity || (v.type === 'error' ? 'critical' : v.type === 'warning' ? 'high' : 'medium'),
      line: v.line || 0,
      column: v.column || 0,
      message: v.message,
      code: v.code,
    }));

    violations.push(...standardViolations);

    return violations;
  }
}
