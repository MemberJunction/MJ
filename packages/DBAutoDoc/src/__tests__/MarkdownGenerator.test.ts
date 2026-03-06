import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownGenerator } from '../generators/MarkdownGenerator';
import { DatabaseDocumentation } from '../types/state';

function createMinimalState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01T00:00:00Z',
      lastModified: '2024-01-01T00:00:00Z',
      totalIterations: 2,
      totalPromptsRun: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalTokens: 8000,
      estimatedCost: 0.10,
      totalSchemas: 1,
      totalTables: 2,
      totalColumns: 4
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01T00:00:00Z' },
    phases: {
      descriptionGeneration: [
        {
          runId: 'run_001',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          status: 'converged',
          levelsProcessed: 2,
          iterationsPerformed: 3,
          backpropagationCount: 1,
          sanityCheckCount: 1,
          converged: true,
          convergenceReason: 'All tables above threshold',
          modelUsed: 'gemini-3-flash-preview',
          vendor: 'google',
          temperature: 0.1,
          totalTokensUsed: 8000,
          estimatedCost: 0.10,
          warnings: [],
          errors: [],
          processingLog: [],
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
            dependencyLevel: 0,
            dependsOn: [],
            dependents: [{ schema: 'dbo', table: 'Orders', column: 'UserID', referencedColumn: 'ID' }],
            columns: [
              { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [], description: 'Primary key' },
              { name: 'Name', dataType: 'nvarchar(100)', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], description: 'Full name' }
            ],
            descriptionIterations: [
              {
                description: 'Stores user accounts',
                reasoning: 'Contains user data',
                generatedAt: '2024-01-01T00:10:00Z',
                modelUsed: 'gemini-3-flash-preview',
                confidence: 0.95,
                triggeredBy: 'initial'
              }
            ],
            description: 'Stores user accounts'
          },
          {
            name: 'Orders',
            rowCount: 500,
            dependencyLevel: 1,
            dependsOn: [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }],
            dependents: [],
            columns: [
              { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [], description: 'Order ID' },
              { name: 'UserID', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [], description: 'Foreign key to Users' }
            ],
            descriptionIterations: [
              {
                description: 'First attempt at orders description',
                reasoning: 'Initial',
                generatedAt: '2024-01-01T00:15:00Z',
                modelUsed: 'gemini-3-flash-preview',
                confidence: 0.7,
                triggeredBy: 'initial'
              },
              {
                description: 'Customer purchase orders',
                reasoning: 'Refined after backpropagation',
                generatedAt: '2024-01-01T00:30:00Z',
                modelUsed: 'gemini-3-flash-preview',
                confidence: 0.9,
                triggeredBy: 'backpropagation'
              }
            ],
            description: 'Customer purchase orders'
          }
        ],
        descriptionIterations: []
      }
    ]
  };
}

describe('MarkdownGenerator', () => {
  let generator: MarkdownGenerator;

  beforeEach(() => {
    generator = new MarkdownGenerator();
  });

  describe('generate', () => {
    it('should include database name in header', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('# Database Documentation: TestDB');
    });

    it('should include server info', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('**Server**: localhost');
    });

    it('should include analysis summary', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('## Analysis Summary');
      expect(md).toContain('**Status**: converged');
      expect(md).toContain('gemini-3-flash-preview');
      expect(md).toContain('google');
    });

    it('should include table of contents', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('## Table of Contents');
      expect(md).toContain('Users');
      expect(md).toContain('Orders');
    });

    it('should include schema sections', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('## Schema: dbo');
    });

    it('should include table descriptions', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('Stores user accounts');
      expect(md).toContain('Customer purchase orders');
    });

    it('should render column table with correct headers', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('| Column | Type | Description |');
      expect(md).toContain('|--------|------|-------------|');
    });

    it('should mark PK columns', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('PK');
    });

    it('should mark FK columns', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('FK');
    });

    it('should show dependency relationships', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('**Depends On**:');
      expect(md).toContain('**Referenced By**:');
    });

    it('should include row count', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('**Row Count**: 100');
      expect(md).toContain('**Row Count**: 500');
    });

    it('should include confidence percentage', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('**Confidence**: 95%');
    });

    it('should include iteration analysis appendix', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('## Appendix: Iteration Analysis');
    });

    it('should show backpropagation refinements in appendix', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('Total Tables with Refinements');
      expect(md).toContain('Refinements Triggered by Backpropagation');
    });

    it('should include mermaid ERD diagram', () => {
      const state = createMinimalState();
      const md = generator.generate(state);

      expect(md).toContain('```mermaid');
      expect(md).toContain('erDiagram');
    });

    it('should handle seed context when provided', () => {
      const state = createMinimalState();
      state.seedContext = {
        overallPurpose: 'E-commerce platform',
        industryContext: 'Retail',
        businessDomains: ['Sales', 'Users']
      };

      const md = generator.generate(state);

      expect(md).toContain('## Database Context');
      expect(md).toContain('E-commerce platform');
      expect(md).toContain('Retail');
      expect(md).toContain('Sales, Users');
    });

    it('should handle empty schemas array', () => {
      const state = createMinimalState();
      state.schemas = [];
      state.phases.descriptionGeneration = [];

      const md = generator.generate(state);

      expect(md).toContain('# Database Documentation: TestDB');
    });
  });
});
