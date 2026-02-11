import { describe, it, expect, beforeEach } from 'vitest';
import { MermaidGenerator } from '../generators/MermaidGenerator';
import { DatabaseDocumentation } from '../types/state';

function createState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01', lastModified: '2024-01-01',
      totalIterations: 1, totalPromptsRun: 0, totalInputTokens: 0,
      totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0,
      totalSchemas: 1, totalTables: 2, totalColumns: 4
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01' },
    phases: { descriptionGeneration: [] },
    schemas: [
      {
        name: 'dbo',
        description: 'Default schema',
        tables: [
          {
            name: 'Users',
            rowCount: 100,
            dependsOn: [],
            dependents: [{ schema: 'dbo', table: 'Orders', column: 'UserID', referencedColumn: 'ID' }],
            columns: [
              { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [], description: 'Primary key' },
              { name: 'Name', dataType: 'nvarchar(100)', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], description: 'User name' }
            ],
            descriptionIterations: [{ description: 'Users', reasoning: '', generatedAt: '2024-01-01', modelUsed: 'test', confidence: 0.9, triggeredBy: 'initial' as const }],
            description: 'Stores users'
          },
          {
            name: 'Orders',
            rowCount: 500,
            dependsOn: [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }],
            dependents: [],
            columns: [
              { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [], description: 'Order ID' },
              { name: 'UserID', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [], description: 'FK to Users' }
            ],
            descriptionIterations: [{ description: 'Orders', reasoning: '', generatedAt: '2024-01-01', modelUsed: 'test', confidence: 0.85, triggeredBy: 'initial' as const }],
            description: 'Customer orders'
          }
        ],
        descriptionIterations: []
      }
    ]
  };
}

describe('MermaidGenerator', () => {
  let generator: MermaidGenerator;

  beforeEach(() => {
    generator = new MermaidGenerator();
  });

  describe('generate', () => {
    it('should output erDiagram header', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('erDiagram');
    });

    it('should include entity definitions', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('Users {');
      expect(mmd).toContain('Orders {');
    });

    it('should include column types', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('int ID');
      expect(mmd).toContain('nvarchar(100) Name');
    });

    it('should include PK and FK constraints', () => {
      const mmd = generator.generate(createState());
      // Constraints are combined in the output, e.g. "PK,NOT_NULL" and "FK,NOT_NULL"
      expect(mmd).toContain('PK');
      expect(mmd).toContain('FK');
    });

    it('should include NOT_NULL constraint', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('NOT_NULL');
    });

    it('should include relationships', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('Users ||--o{ Orders : "has"');
    });

    it('should include header comments by default', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('%% Entity Relationship Diagram');
      expect(mmd).toContain('%% Database: TestDB');
    });

    it('should suppress comments when includeComments is false', () => {
      const mmd = generator.generate(createState(), { includeComments: false });
      expect(mmd).not.toContain('%%');
    });

    it('should include column descriptions as comments', () => {
      const mmd = generator.generate(createState());
      expect(mmd).toContain('%% Primary key');
    });

    it('should not duplicate relationships', () => {
      const mmd = generator.generate(createState());
      const matches = mmd.match(/Users \|\|--o\{ Orders/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('generate with filters', () => {
    it('should filter by approvedOnly', () => {
      const state = createState();
      state.schemas[0].tables[0].userApproved = false;
      state.schemas[0].tables[1].userApproved = true;

      const mmd = generator.generate(state, { approvedOnly: true });

      expect(mmd).not.toContain('Users {');
      expect(mmd).toContain('Orders {');
    });

    it('should filter by confidenceThreshold', () => {
      const state = createState();
      state.schemas[0].tables[0].descriptionIterations[0].confidence = 0.5;
      state.schemas[0].tables[1].descriptionIterations[0].confidence = 0.9;

      const mmd = generator.generate(state, { confidenceThreshold: 0.8 });

      expect(mmd).not.toContain('Users {');
      expect(mmd).toContain('Orders {');
    });
  });

  describe('generateHtml', () => {
    it('should return valid HTML document', () => {
      const html = generator.generateHtml(createState());

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should include mermaid script', () => {
      const html = generator.generateHtml(createState());

      expect(html).toContain('mermaid');
    });

    it('should include database name in title', () => {
      const html = generator.generateHtml(createState());

      expect(html).toContain('TestDB');
    });

    it('should escape HTML in database name', () => {
      const state = createState();
      state.database.name = 'Test<DB>';
      const html = generator.generateHtml(state);

      expect(html).toContain('Test&lt;DB&gt;');
    });
  });
});
