/**
 * Component Prop Rule - Unified component property validation
 *
 * This rule consolidates all component prop validation:
 * 1. Prop existence (from dependency-prop-validation)
 * 2. Required props checking
 * 3. Prop type validation (via TypeContext)
 * 4. Semantic constraint validation (via SemanticValidators)
 * 5. Unknown props warning
 *
 * @category schema
 * @severity high
 *
 * ## Rationale
 * Component props are the contract between components. This rule ensures:
 * - All required props are provided
 * - Prop types match expected types
 * - Prop values meet semantic constraints
 * - Unknown props are flagged (may be typos)
 *
 * ## Integration
 * - Uses SemanticValidatorRegistry for constraint validation
 * - Uses TypeInferenceEngine for type checking
 * - Uses ComponentMetadataEngine for dependency specs
 *
 * ## Phase 3 Consolidation
 * This rule merges:
 * - dependency-prop-validation (prop existence, required, types, unknown)
 * - validate-component-props (semantic constraint validation)
 */

import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ComponentSpec, PropertyConstraint } from '@memberjunction/interactive-component-types';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';
import { PropValueExtractor } from '../prop-value-extractor';
import { SemanticValidator } from './semantic-validators/semantic-validator';
import { SemanticValidatorRegistry } from './semantic-validators/semantic-validator-registry';
import { ValidationContext } from './semantic-validators/validation-context';

// Import types from type-rules
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

export interface LintContext {
  componentName: string;
  componentSpec?: ComponentSpec;
  typeContext: any; // TypeContext - avoiding import for now
  typeEngine: any; // TypeInferenceEngine
  controlFlowAnalyzer: any; // ControlFlowAnalyzer
}

/**
 * ComponentPropRule - Validates all aspects of component property usage
 *
 * Validates:
 * 1. Props exist in component spec (schema validation)
 * 2. Required props are provided
 * 3. Prop types match expected types (via TypeContext)
 * 4. Semantic constraints are met (via SemanticValidators)
 * 5. Unknown props warning
 */
export class ComponentPropRule {
  name = 'component-props';
  appliesTo: 'all' | 'child' | 'root' = 'all';

  // Standard props that are always allowed on any component
  private readonly standardProps = new Set([
    'key',
    'ref',
    'className',
    'style',
    'id',
    'data-testid',
    'aria-label',
    'aria-describedby',
    'title',
    // Runtime props passed through to all components
    'utilities',
    'styles',
    'components',
    'callbacks',
    'savedUserSettings',
    'onSaveUserSettings',
  ]);

  // React special props
  private readonly reactSpecialProps = new Set(['children', 'dangerouslySetInnerHTML']);

  /**
   * Validate component props
   */
  validate(ast: t.File, context: LintContext): Violation[] {
    const violations: Violation[] = [];

    // Skip if no dependencies
    if (!context.componentSpec?.dependencies || context.componentSpec.dependencies.length === 0) {
      return violations;
    }

    // Build a map of dependency components to their full specs
    const dependencySpecs = this.buildDependencySpecs(context.componentSpec);

    // Build validation context helpers from parent spec's dataRequirements
    const validationHelpers = this.buildValidationHelpers(context.componentSpec);

    // Traverse AST and validate each component usage
    traverse(ast, {
      JSXElement: (path: NodePath<t.JSXElement>) => {
        const openingElement = path.node.openingElement;
        const elementName = this.getElementName(openingElement);

        if (!elementName) return;

        // Get the spec for this dependency component
        const depSpec = dependencySpecs.get(elementName);
        if (!depSpec) return; // Not a dependency, skip

        // Get provided props
        const providedProps = this.getProvidedProps(openingElement);
        const providedPropNodes = this.getProvidedPropNodes(openingElement);

        // 1. Check required props
        violations.push(
          ...this.validateRequiredProps(elementName, providedProps, depSpec, openingElement, path.node),
        );

        // 2. Check prop types
        violations.push(
          ...this.validatePropTypes(elementName, providedPropNodes, depSpec, context, openingElement),
        );

        // 3. Check unknown props
        violations.push(
          ...this.validateUnknownProps(elementName, providedProps, providedPropNodes, depSpec, openingElement),
        );

        // 4. Run semantic validators (if component has constraints)
        violations.push(
          ...this.validateSemanticConstraints(
            elementName,
            depSpec,
            openingElement,
            path,
            validationHelpers,
          ),
        );
      },
    });

    return violations;
  }

  /**
   * Build map of dependency components to their full specs
   */
  private buildDependencySpecs(componentSpec: ComponentSpec): Map<string, ComponentSpec> {
    const dependencySpecs = new Map<string, ComponentSpec>();

    for (const dep of componentSpec.dependencies || []) {
      if (dep && dep.name) {
        if (dep.location === 'registry') {
          // Try to load from registry
          let match;
          if (dep.registry) {
            match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace, dep.registry);
          } else {
            match = ComponentMetadataEngine.Instance.FindComponent(dep.name, dep.namespace);
          }

          if (!match) {
            console.warn(`Dependency component not found in registry: ${dep.name} (${dep.namespace || 'no namespace'})`);
          } else {
            dependencySpecs.set(dep.name, match.spec);
          }
        } else {
          // Embedded dependencies have their spec inline
          dependencySpecs.set(dep.name, dep);
        }
      } else {
        console.warn(`Invalid dependency in component spec: ${dep?.name || 'unknown'}`);
      }
    }

    return dependencySpecs;
  }

  /**
   * Build validation context helpers from parent spec's dataRequirements
   */
  private buildValidationHelpers(componentSpec: ComponentSpec) {
    const getEntityFields = (entityName: string) => {
      if (!componentSpec.dataRequirements?.entities) return [];
      const entity = componentSpec.dataRequirements.entities.find((e) => e.name === entityName);
      if (!entity) return [];

      // Prefer fieldMetadata if available (provides type info, allowsNull, isPrimaryKey, etc.)
      if (entity.fieldMetadata && Array.isArray(entity.fieldMetadata) && entity.fieldMetadata.length > 0) {
        return entity.fieldMetadata.map((f: any) => ({
          name: f.name,
          type: f.type || 'string',
          required: !f.allowsNull,
          allowedValues: f.possibleValues || undefined,
          isPrimaryKey: f.isPrimaryKey || false,
        }));
      }

      // Fallback: Collect all field names from display/filter/sort arrays
      const allFieldNames = new Set<string>();
      if (entity.displayFields) entity.displayFields.forEach((f: string) => allFieldNames.add(f));
      if (entity.filterFields) entity.filterFields.forEach((f: string) => allFieldNames.add(f));
      if (entity.sortFields) entity.sortFields.forEach((f: string) => allFieldNames.add(f));

      // Convert to EntityFieldInfo format (we don't have type info from field name lists)
      return Array.from(allFieldNames).map((name) => ({
        name,
        type: 'string', // Unknown type from field name lists
        required: false,
        allowedValues: undefined,
      }));
    };

    const getEntityFieldType = (entityName: string, fieldName: string) => {
      const fields = getEntityFields(entityName);
      const field = fields.find((f: any) => f.name === fieldName);
      return field?.type || null;
    };

    const hasEntity = (entityName: string) => {
      if (!componentSpec.dataRequirements?.entities) return false;
      return componentSpec.dataRequirements.entities.some((e) => e.name === entityName);
    };

    const findSimilarFieldNames = (fieldName: string, entityName: string, maxResults?: number) => {
      const fields = getEntityFields(entityName);
      const fieldNames = fields.map((f: any) => f.name);
      const similar: Array<{ name: string; distance: number }> = [];

      // Simple Levenshtein distance calculation
      const levenshtein = (a: string, b: string): number => {
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j] + 1,
              );
            }
          }
        }
        return matrix[b.length][a.length];
      };

      for (const fn of fieldNames) {
        const distance = levenshtein(fieldName.toLowerCase(), fn.toLowerCase());
        if (distance <= 3) {
          similar.push({ name: fn, distance });
        }
      }
      similar.sort((a, b) => a.distance - b.distance);
      return similar.slice(0, maxResults || 3).map((s) => s.name);
    };

    return {
      getEntityFields,
      getEntityFieldType,
      hasEntity,
      findSimilarFieldNames,
      getQueryParameters: () => [],
      hasQuery: () => false,
    };
  }

  /**
   * Get element name from JSX opening element
   */
  private getElementName(element: t.JSXOpeningElement): string | null {
    if (t.isJSXIdentifier(element.name)) {
      return element.name.name;
    } else if (t.isJSXMemberExpression(element.name)) {
      // Handle cases like <components.EntityDataGrid> - skip for now
      return null;
    }
    return null;
  }

  /**
   * Get set of provided prop names
   */
  private getProvidedProps(element: t.JSXOpeningElement): Set<string> {
    const props = new Set<string>();
    for (const attr of element.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        props.add(attr.name.name);
      }
    }
    return props;
  }

  /**
   * Get map of provided prop names to their JSXAttribute nodes
   */
  private getProvidedPropNodes(element: t.JSXOpeningElement): Map<string, t.JSXAttribute> {
    const propNodes = new Map<string, t.JSXAttribute>();
    for (const attr of element.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        propNodes.set(attr.name.name, attr);
      }
    }
    return propNodes;
  }

  /**
   * Validate required props are provided
   */
  private validateRequiredProps(
    elementName: string,
    providedProps: Set<string>,
    depSpec: ComponentSpec,
    openingElement: t.JSXOpeningElement,
    jsxElement: t.JSXElement,
  ): Violation[] {
    const violations: Violation[] = [];

    // Get required props
    const requiredProps: string[] = [];
    if (depSpec.properties && Array.isArray(depSpec.properties)) {
      for (const prop of depSpec.properties) {
        if (prop && prop.name && prop.required === true) {
          requiredProps.push(prop.name);
        }
      }
    }

    // Check missing required props
    const missingRequired = requiredProps.filter((prop) => {
      // Special handling for 'children' prop
      if (prop === 'children') {
        // Check if JSX element has children nodes
        const hasChildren =
          jsxElement.children &&
          jsxElement.children.length > 0 &&
          jsxElement.children.some((child) => !t.isJSXText(child) || (t.isJSXText(child) && child.value.trim() !== ''));
        return !providedProps.has(prop) && !hasChildren;
      }
      return !providedProps.has(prop) && !this.standardProps.has(prop);
    });

    // Separate children warnings from other critical props
    const missingChildren = missingRequired.filter((prop) => prop === 'children');
    const missingOtherProps = missingRequired.filter((prop) => prop !== 'children');

    // Critical violation for non-children required props
    if (missingOtherProps.length > 0) {
      violations.push({
        rule: 'component-props',
        severity: 'critical',
        line: openingElement.loc?.start.line || 0,
        column: openingElement.loc?.start.column || 0,
        message: `Dependency component "${elementName}" is missing required props: ${missingOtherProps.join(', ')}. These props are marked as required in the component's specification.`,
        code: `<${elementName} ... />`,
      });
    }

    // Medium severity warning for missing children when required
    if (missingChildren.length > 0) {
      violations.push({
        rule: 'component-props',
        severity: 'medium',
        line: openingElement.loc?.start.line || 0,
        column: openingElement.loc?.start.column || 0,
        message: `Component "${elementName}" expects children but none were provided. The 'children' prop is marked as required in the component's specification.`,
        code: `<${elementName} ... />`,
      });
    }

    return violations;
  }

  /**
   * Validate prop types match expected types
   */
  private validatePropTypes(
    elementName: string,
    providedPropNodes: Map<string, t.JSXAttribute>,
    depSpec: ComponentSpec,
    context: LintContext,
    openingElement: t.JSXOpeningElement,
  ): Violation[] {
    const violations: Violation[] = [];

    if (!depSpec.properties || !Array.isArray(depSpec.properties)) {
      return violations;
    }

    for (const [propName, attrNode] of providedPropNodes) {
      const propSpec = depSpec.properties.find((p) => p.name === propName);
      if (propSpec && propSpec.type) {
        const value = attrNode.value;

        if (value && t.isJSXExpressionContainer(value)) {
          const expr = value.expression;
          if (t.isJSXEmptyExpression(expr)) continue;

          // Use type inference to get the actual type (works for literals AND variables)
          const actualType = this.getExpressionType(expr, context);

          // Skip if type is unknown (we can't prove it's wrong)
          if (actualType === 'unknown') continue;

          // Get the expected type (normalize it)
          const expectedType = propSpec.type.toLowerCase();

          // Check type compatibility
          const compatibility = this.checkTypeCompatibility(actualType, expectedType);

          if (!compatibility.compatible) {
            // Generate helpful message with variable name if it's an identifier
            let valueDesc = actualType;
            if (t.isIdentifier(expr)) {
              valueDesc = `variable "${expr.name}" (${actualType})`;
            }

            violations.push({
              rule: 'component-props',
              severity: 'high',
              line: attrNode.loc?.start.line || 0,
              column: attrNode.loc?.start.column || 0,
              message: `Prop "${propName}" on component "${elementName}" expects type "${compatibility.normalizedExpected}" but received ${valueDesc}.`,
              code: `${propName}={<${compatibility.normalizedExpected} value>}`,
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Get the type of an expression
   */
  private getExpressionType(expr: t.Expression, context: LintContext): string {
    // Try to infer type from literal values first
    if (t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) {
      return 'string';
    } else if (t.isNumericLiteral(expr)) {
      return 'number';
    } else if (t.isBooleanLiteral(expr)) {
      return 'boolean';
    } else if (t.isArrayExpression(expr)) {
      return 'array';
    } else if (t.isObjectExpression(expr)) {
      return 'object';
    } else if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
      return 'function';
    } else if (t.isIdentifier(expr)) {
      // Try to get type from type engine
      if (context.typeEngine && context.typeEngine.getType) {
        const inferredType = context.typeEngine.getType(expr);
        if (inferredType && inferredType.kind) {
          return inferredType.kind;
        }
      }
      // Fallback to unknown
      return 'unknown';
    } else if (t.isMemberExpression(expr)) {
      // Try to get type from type engine
      if (context.typeEngine && context.typeEngine.getType) {
        const inferredType = context.typeEngine.getType(expr);
        if (inferredType && inferredType.kind) {
          return inferredType.kind;
        }
      }
      return 'unknown';
    }

    return 'unknown';
  }

  /**
   * Check if actual type is compatible with expected type
   */
  private checkTypeCompatibility(
    actualType: string,
    expectedType: string,
  ): { compatible: boolean; normalizedExpected: string } {
    let isCompatible = true;
    let normalizedExpected = expectedType;

    if (expectedType === 'string') {
      isCompatible = actualType === 'string';
    } else if (expectedType === 'number' || expectedType === 'int' || expectedType === 'integer' || expectedType === 'float') {
      isCompatible = actualType === 'number';
      normalizedExpected = 'number';
    } else if (expectedType === 'boolean' || expectedType === 'bool') {
      isCompatible = actualType === 'boolean';
      normalizedExpected = 'boolean';
    } else if (expectedType === 'array' || expectedType.startsWith('array<')) {
      isCompatible = actualType === 'array';
      normalizedExpected = 'array';
    } else if (expectedType === 'object') {
      // Objects, entity-rows, query-rows are all compatible with 'object'
      isCompatible = ['object', 'entity-row', 'query-row'].includes(actualType);
    } else if (expectedType === 'function') {
      isCompatible = actualType === 'function';
    }

    return { compatible: isCompatible, normalizedExpected };
  }

  /**
   * Validate unknown props (may be typos)
   */
  private validateUnknownProps(
    elementName: string,
    providedProps: Set<string>,
    providedPropNodes: Map<string, t.JSXAttribute>,
    depSpec: ComponentSpec,
    openingElement: t.JSXOpeningElement,
  ): Violation[] {
    const violations: Violation[] = [];

    // Build lists of valid props and events
    const specPropNames: string[] = depSpec.properties?.map((p) => p.name).filter(Boolean) || [];
    // Convert event names to their callback prop form (e.g., "dataPointClick" -> "onDataPointClick")
    const specEventNames: string[] = depSpec.events?.map((e) => e.name).filter(Boolean) || [];
    const specEventPropNames: string[] = specEventNames.map((name) => {
      // If the event already starts with "on", use it as-is
      if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
        return name;
      }
      // Otherwise, convert to "onEventName" format
      return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    });
    const allValidProps = [...specPropNames, ...specEventPropNames];

    // Check unknown props
    for (const passedProp of providedProps) {
      // Skip standard props and React special props
      if (this.standardProps.has(passedProp) || this.reactSpecialProps.has(passedProp)) {
        continue;
      }

      // Check if prop is valid (in properties or events)
      if (!allValidProps.includes(passedProp)) {
        // Try to find a close match using Levenshtein distance
        const suggestion = this.findClosestMatch(passedProp, allValidProps);
        const loc = providedPropNodes.get(passedProp);

        // Build informative message showing props and event handlers separately
        const propsListStr = specPropNames.length > 0 ? `Properties: ${specPropNames.join(', ')}` : '';
        const eventsListStr = specEventPropNames.length > 0 ? `Event handlers: ${specEventPropNames.join(', ')}` : '';
        const expectedListStr = [propsListStr, eventsListStr].filter(Boolean).join('. ') || 'none';

        if (suggestion) {
          violations.push({
            rule: 'component-props',
            severity: 'high',
            line: loc?.loc?.start.line || openingElement.loc?.start.line || 0,
            column: loc?.loc?.start.column || openingElement.loc?.start.column || 0,
            message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. Did you mean '${suggestion}'?`,
            code: `${passedProp}={...}`,
          });
        } else {
          violations.push({
            rule: 'component-props',
            severity: 'medium',
            line: loc?.loc?.start.line || openingElement.loc?.start.line || 0,
            column: loc?.loc?.start.column || openingElement.loc?.start.column || 0,
            message: `Unknown prop '${passedProp}' passed to dependency component '${elementName}'. ${expectedListStr}.`,
            code: `${passedProp}={...}`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Find closest matching prop name using Levenshtein distance
   */
  private findClosestMatch(target: string, candidates: string[]): string | null {
    if (candidates.length === 0) return null;

    // Simple Levenshtein distance implementation
    function levenshtein(a: string, b: string): number {
      const matrix: number[][] = [];
      for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
      }
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1, // substitution
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1, // deletion
            );
          }
        }
      }
      return matrix[b.length][a.length];
    }

    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const candidate of candidates) {
      const distance = levenshtein(target.toLowerCase(), candidate.toLowerCase());
      // Only suggest if distance is reasonable (not too far off)
      if (distance < bestDistance && distance <= 3) {
        bestMatch = candidate;
        bestDistance = distance;
      }
    }

    return bestMatch;
  }

  /**
   * Validate semantic constraints on props
   */
  private validateSemanticConstraints(
    elementName: string,
    depSpec: ComponentSpec,
    openingElement: t.JSXOpeningElement,
    path: NodePath<t.JSXElement>,
    validationHelpers: any,
  ): Violation[] {
    const violations: Violation[] = [];

    // Check if this component has any properties with constraints
    if (!depSpec.properties) return violations;

    const hasConstraints = depSpec.properties.some((p) => p.constraints && p.constraints.length > 0);
    if (!hasConstraints) return violations;

    // Extract all props into a map for sibling prop lookups
    const siblingProps = new Map<string, any>();
    for (const attr of openingElement.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        const extractedValue = PropValueExtractor.extract(attr);
        siblingProps.set(attr.name.name, extractedValue);
      }
    }

    // Iterate through all properties with constraints
    for (const property of depSpec.properties) {
      if (!property.constraints || property.constraints.length === 0) {
        continue;
      }

      // Find the JSX attribute for this property
      const propAttr = openingElement.attributes.find(
        (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === property.name,
      );

      if (!propAttr || !t.isJSXAttribute(propAttr)) {
        continue;
      }

      // Extract the property value
      const propValue = PropValueExtractor.extract(propAttr);

      // Skip dynamic values
      if (PropValueExtractor.isDynamicValue(propValue)) {
        continue;
      }

      // Run all validators for this property's constraints
      for (const constraint of property.constraints) {
        // Get validator from registry
        const registry = SemanticValidatorRegistry.getInstance();
        const validator = registry.get(constraint.type);

        if (!validator) {
          // Validator not registered for this constraint type
          console.warn(`No validator registered for constraint type: ${constraint.type}`);
          continue;
        }

        // Build ValidationContext
        const context: ValidationContext = {
          node: propAttr,
          path: path as any,
          componentName: elementName,
          componentSpec: depSpec,
          propertyName: property.name,
          propertyValue: propValue,
          siblingProps,
          entities: new Map(),
          queries: new Map(),
          typeEngine: null as any,

          getEntityFields: validationHelpers.getEntityFields,
          getEntityFieldType: validationHelpers.getEntityFieldType,
          findSimilarFieldNames: validationHelpers.findSimilarFieldNames,
          getQueryParameters: validationHelpers.getQueryParameters,
          hasQuery: validationHelpers.hasQuery,
          hasEntity: validationHelpers.hasEntity,
        };

        // Run the validator
        try {
          const constraintViolations = validator.validate(context, constraint);
          for (const cv of constraintViolations) {
            violations.push({
              rule: 'component-props',
              severity: cv.severity,
              line: propAttr.loc?.start.line || 0,
              column: propAttr.loc?.start.column || 0,
              message: cv.message,
              code: cv.suggestion || '',
            });
          }
        } catch (error) {
          console.error(`Error validating ${property.name} constraint (${constraint.type}):`, error);
        }
      }
    }

    return violations;
  }
}
