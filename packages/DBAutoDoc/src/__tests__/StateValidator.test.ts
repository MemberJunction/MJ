import { describe, it, expect, beforeEach } from 'vitest';
import { StateValidator, ValidationResult } from '../state/StateValidator';
import { DatabaseDocumentation } from '../types/state';

function createValidState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01T00:00:00Z',
      lastModified: '2024-01-01T00:00:00Z',
      totalIterations: 1,
      totalPromptsRun: 5,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalTokens: 1500,
      estimatedCost: 0.05,
      totalSchemas: 1,
      totalTables: 2,
      totalColumns: 4
    },
    database: {
      name: 'TestDB',
      server: 'localhost',
      analyzedAt: '2024-01-01T00:00:00Z'
    },
    phases: {
      descriptionGeneration: [
        {
          runId: 'run_001',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          status: 'completed',
          levelsProcessed: 2,
          iterationsPerformed: 3,
          backpropagationCount: 1,
          sanityCheckCount: 1,
          converged: true,
          convergenceReason: 'Stability achieved',
          modelUsed: 'gemini-3-flash-preview',
          vendor: 'google',
          temperature: 0.1,
          totalTokensUsed: 1500,
          estimatedCost: 0.05,
          warnings: [],
          errors: [],
          processingLog: [
            {
              timestamp: '2024-01-01T00:10:00Z',
              level: 0,
              schema: 'dbo',
              table: 'Users',
              action: 'analyze',
              result: 'success',
              tokensUsed: 500
            }
          ],
          sanityChecks: []
        }
      ]
    },
    schemas: [
      {
        name: 'dbo',
        tables: [
          {
            name: 'Users',
            rowCount: 100,
            dependsOn: [],
            dependents: [{ schema: 'dbo', table: 'Orders', column: 'UserID', referencedColumn: 'ID' }],
            columns: [
              {
                name: 'ID',
                dataType: 'int',
                isNullable: false,
                isPrimaryKey: true,
                isForeignKey: false,
                descriptionIterations: [
                  {
                    description: 'Primary key',
                    reasoning: 'Auto-incremented ID',
                    generatedAt: '2024-01-01T00:10:00Z',
                    modelUsed: 'gemini-3-flash-preview'
                  }
                ],
                description: 'Primary key'
              },
              {
                name: 'Name',
                dataType: 'nvarchar(100)',
                isNullable: false,
                isPrimaryKey: false,
                isForeignKey: false,
                descriptionIterations: [],
                description: 'User name'
              }
            ],
            descriptionIterations: [
              {
                description: 'Stores user accounts',
                reasoning: 'Contains user data',
                generatedAt: '2024-01-01T00:10:00Z',
                modelUsed: 'gemini-3-flash-preview',
                confidence: 0.9,
                triggeredBy: 'initial'
              }
            ],
            description: 'Stores user accounts'
          },
          {
            name: 'Orders',
            rowCount: 500,
            dependsOn: [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }],
            dependents: [],
            columns: [
              {
                name: 'ID',
                dataType: 'int',
                isNullable: false,
                isPrimaryKey: true,
                isForeignKey: false,
                descriptionIterations: [],
                description: 'Order ID'
              },
              {
                name: 'UserID',
                dataType: 'int',
                isNullable: false,
                isPrimaryKey: false,
                isForeignKey: true,
                foreignKeyReferences: { schema: 'dbo', table: 'Users', column: 'ID', referencedColumn: 'ID' },
                descriptionIterations: [],
                description: 'Reference to Users table'
              }
            ],
            descriptionIterations: [
              {
                description: 'Customer orders',
                reasoning: 'Tracks purchase orders',
                generatedAt: '2024-01-01T00:15:00Z',
                modelUsed: 'gemini-3-flash-preview',
                confidence: 0.85,
                triggeredBy: 'initial'
              }
            ],
            description: 'Customer orders'
          }
        ],
        descriptionIterations: []
      }
    ]
  };
}

describe('StateValidator', () => {
  let validator: StateValidator;

  beforeEach(() => {
    validator = new StateValidator();
  });

  describe('validate', () => {
    it('should validate a well-formed state file', () => {
      const state = createValidState();
      const result = validator.validate(state);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing version field', () => {
      const state = createValidState();
      (state as Record<string, unknown>).version = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing version field');
    });

    it('should detect missing database field', () => {
      const state = createValidState();
      (state as Record<string, unknown>).database = undefined;
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing database field'))).toBe(true);
    });

    it('should detect missing database.name', () => {
      const state = createValidState();
      state.database.name = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing database.name');
    });

    it('should detect missing database.server', () => {
      const state = createValidState();
      state.database.server = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing database.server');
    });

    it('should detect non-array schemas', () => {
      const state = createValidState();
      (state as Record<string, unknown>).schemas = 'not an array';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('schemas must be an array'))).toBe(true);
    });

    it('should detect schema missing name', () => {
      const state = createValidState();
      state.schemas[0].name = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing name'))).toBe(true);
    });

    it('should detect table missing name', () => {
      const state = createValidState();
      state.schemas[0].tables[0].name = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing name'))).toBe(true);
    });

    it('should detect missing columns array', () => {
      const state = createValidState();
      (state.schemas[0].tables[0] as Record<string, unknown>).columns = undefined;
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing or invalid columns array'))).toBe(true);
    });

    it('should detect missing descriptionIterations on table', () => {
      const state = createValidState();
      (state.schemas[0].tables[0] as Record<string, unknown>).descriptionIterations = undefined;
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing or invalid descriptionIterations array'))).toBe(true);
    });

    it('should warn about references to non-existent tables', () => {
      const state = createValidState();
      state.schemas[0].tables[1].dependsOn = [
        { schema: 'dbo', table: 'NonExistent', column: 'ID', referencedColumn: 'ID' }
      ];
      const result = validator.validate(state);

      expect(result.warnings.some(w => w.includes('non-existent table'))).toBe(true);
    });

    it('should detect analysis run missing runId', () => {
      const state = createValidState();
      state.phases.descriptionGeneration[0].runId = '';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing runId'))).toBe(true);
    });

    it('should detect invalid analysis run status', () => {
      const state = createValidState();
      (state.phases.descriptionGeneration[0] as Record<string, unknown>).status = 'invalid_status';
      const result = validator.validate(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid status'))).toBe(true);
    });

    it('should accept all valid analysis run statuses', () => {
      for (const status of ['in_progress', 'completed', 'failed', 'converged'] as const) {
        const state = createValidState();
        state.phases.descriptionGeneration[0].status = status;
        const result = validator.validate(state);

        expect(result.errors.filter(e => e.includes('invalid status'))).toHaveLength(0);
      }
    });
  });

  describe('validateAndRepair', () => {
    it('should repair missing descriptionIterations arrays', () => {
      const state = createValidState();
      // Remove descriptionIterations to simulate old format
      (state.schemas[0] as Record<string, unknown>).descriptionIterations = undefined;

      const result = validator.validateAndRepair(state);

      // After repair, descriptionIterations should exist
      expect(state.schemas[0].descriptionIterations).toBeDefined();
      expect(Array.isArray(state.schemas[0].descriptionIterations)).toBe(true);
    });

    it('should repair missing schemas array', () => {
      const state = createValidState();
      (state as Record<string, unknown>).schemas = undefined;

      validator.validateAndRepair(state);

      expect(state.schemas).toBeDefined();
      expect(Array.isArray(state.schemas)).toBe(true);
    });

    it('should repair missing descriptionGeneration array', () => {
      const state = createValidState();
      (state.phases as Record<string, unknown>).descriptionGeneration = undefined;

      validator.validateAndRepair(state);

      expect(state.phases.descriptionGeneration).toBeDefined();
      expect(Array.isArray(state.phases.descriptionGeneration)).toBe(true);
    });
  });
});
