/**
 * Integration Tests for Constraint Validators
 *
 * These tests verify that validators work correctly with the linter integration.
 */

import { describe, it, expect } from 'vitest';
import { SubsetOfEntityFieldsValidator } from './subset-of-entity-fields-validator';
import { SqlWhereClauseValidator } from './sql-where-clause-validator';
import { ConstraintValidatorRegistry } from './constraint-validator-registry';
import type { ValidationContext, PropertyConstraint } from './validation-context';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

describe('Constraint Validator Integration', () => {
  describe('ConstraintValidatorRegistry', () => {
    it('should have subset-of-entity-fields validator registered', () => {
      expect(ConstraintValidatorRegistry.has('subset-of-entity-fields')).toBe(true);
    });

    it('should have sql-where-clause validator registered', () => {
      expect(ConstraintValidatorRegistry.has('sql-where-clause')).toBe(true);
    });

    it('should return validator instances', () => {
      const validator = ConstraintValidatorRegistry.get('subset-of-entity-fields');
      expect(validator).toBeInstanceOf(SubsetOfEntityFieldsValidator);
    });
  });

  describe('SubsetOfEntityFieldsValidator', () => {
    const validator = new SubsetOfEntityFieldsValidator();

    it('should validate correct field names', () => {
      const context = createMockContext({
        propertyValue: ['FirstName', 'LastName', 'Email'],
        siblingProps: new Map([['entityName', 'Members']]),
        entityFields: [
          { name: 'ID', type: 'uniqueidentifier' },
          { name: 'FirstName', type: 'nvarchar' },
          { name: 'LastName', type: 'nvarchar' },
          { name: 'Email', type: 'nvarchar' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'subset-of-entity-fields',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      expect(violations).toHaveLength(0);
    });

    it('should detect invalid field names', () => {
      const context = createMockContext({
        propertyValue: ['FullName', 'Status', 'StartDate'],
        siblingProps: new Map([['entityName', 'Members']]),
        entityFields: [
          { name: 'ID', type: 'uniqueidentifier' },
          { name: 'FirstName', type: 'nvarchar' },
          { name: 'LastName', type: 'nvarchar' },
          { name: 'Email', type: 'nvarchar' },
          { name: 'JoinDate', type: 'datetime' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'subset-of-entity-fields',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: expect.stringContaining('invalid-field'),
            severity: 'critical',
            message: expect.stringContaining('FullName'),
          }),
        ])
      );
    });

    it('should provide "Did you mean?" suggestions', () => {
      const context = createMockContext({
        propertyValue: ['StartDate'], // Should suggest JoinDate
        siblingProps: new Map([['entityName', 'Members']]),
        entityFields: [
          { name: 'JoinDate', type: 'datetime' },
          { name: 'CreatedAt', type: 'datetime' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'subset-of-entity-fields',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].suggestion).toBeDefined();
    });
  });

  describe('SqlWhereClauseValidator', () => {
    const validator = new SqlWhereClauseValidator();

    it('should validate correct WHERE clause', () => {
      const context = createMockContext({
        propertyValue: "Status='Active' AND CreatedAt > '2024-01-01'",
        siblingProps: new Map([['entityName', 'Products']]),
        entityFields: [
          { name: 'ID', type: 'uniqueidentifier' },
          { name: 'Name', type: 'nvarchar' },
          { name: 'Status', type: 'nvarchar' },
          { name: 'CreatedAt', type: 'datetime' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'sql-where-clause',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      expect(violations).toHaveLength(0);
    });

    it('should detect invalid field in WHERE clause', () => {
      const context = createMockContext({
        propertyValue: "Status='Active' AND LastModified > '2024-01-01'",
        siblingProps: new Map([['entityName', 'Products']]),
        entityFields: [
          { name: 'ID', type: 'uniqueidentifier' },
          { name: 'Status', type: 'nvarchar' },
          { name: 'CreatedAt', type: 'datetime' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'sql-where-clause',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('LastModified'),
          }),
        ])
      );
    });

    it('should ignore SQL functions and their arguments', () => {
      // Test with YEAR() function which doesn't have identifier arguments like DATEDIFF's 'day'
      const context = createMockContext({
        propertyValue: "YEAR(CreatedAt) = 2024 AND Status = 'Active'",
        siblingProps: new Map([['entityName', 'Products']]),
        entityFields: [
          { name: 'ID', type: 'uniqueidentifier' },
          { name: 'CreatedAt', type: 'datetime' },
          { name: 'Status', type: 'nvarchar' },
        ],
      });

      const constraint: PropertyConstraint = {
        type: 'sql-where-clause',
        dependsOn: 'entityName',
      };

      const violations = validator.validate(context, constraint);
      if (violations.length > 0) {
        console.log('Unexpected violations:', JSON.stringify(violations, null, 2));
      }
      expect(violations).toHaveLength(0);
    });
  });
});

/**
 * Helper to create a mock ValidationContext
 */
function createMockContext(overrides: Partial<ValidationContext> & { entityFields?: Array<{ name: string; type: string }> }): ValidationContext {
  const entityFields = overrides.entityFields || [];
  const entityName = overrides.siblingProps?.get('entityName') as string || 'MJTestEntity';

  return {
    node: {} as any,
    path: {} as any,
    componentName: 'TestComponent',
    componentSpec: {} as ComponentSpec,
    propertyName: 'fields',
    propertyValue: overrides.propertyValue || [],
    siblingProps: overrides.siblingProps || new Map(),
    entities: new Map(),
    queries: new Map(),
    typeEngine: null as any,

    getEntityFields: (name: string) => {
      if (name === entityName) {
        return entityFields.map(f => ({
          name: f.name,
          type: f.type,
          required: false,
          allowedValues: undefined,
        }));
      }
      return [];
    },

    getEntityFieldType: (name: string, fieldName: string) => {
      if (name === entityName) {
        const field = entityFields.find(f => f.name === fieldName);
        return field?.type || null;
      }
      return null;
    },

    findSimilarFieldNames: (fieldName: string, name: string) => {
      if (name === entityName) {
        // Simple Levenshtein-like matching
        return entityFields
          .map(f => f.name)
          .filter(fn => {
            const dist = levenshteinDistance(fieldName.toLowerCase(), fn.toLowerCase());
            return dist <= 3;
          })
          .slice(0, 3);
      }
      return [];
    },

    getQueryParameters: () => [],
    hasQuery: () => false,
    hasEntity: (name: string) => name === entityName,

    ...overrides,
  };
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(a: string, b: string): number {
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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
