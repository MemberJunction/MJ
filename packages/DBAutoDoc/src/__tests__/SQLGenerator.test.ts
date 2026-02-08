import { describe, it, expect, beforeEach } from 'vitest';
import { SQLGenerator } from '../generators/SQLGenerator';
import { DatabaseDocumentation } from '../types/state';

function createState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01', lastModified: '2024-01-01',
      totalIterations: 1, totalPromptsRun: 1, totalInputTokens: 0,
      totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0,
      totalSchemas: 1, totalTables: 1, totalColumns: 2
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
            dependents: [],
            columns: [
              { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [], description: 'Primary key identifier' },
              { name: 'Name', dataType: 'nvarchar(100)', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], description: "User's full name" }
            ],
            descriptionIterations: [
              { description: 'Stores user accounts', reasoning: 'Main user table', generatedAt: '2024-01-01', modelUsed: 'test', confidence: 0.9, triggeredBy: 'initial' as const }
            ],
            description: 'Stores user accounts'
          }
        ],
        descriptionIterations: []
      }
    ]
  };
}

describe('SQLGenerator', () => {
  let generator: SQLGenerator;

  beforeEach(() => {
    generator = new SQLGenerator();
  });

  describe('generate', () => {
    it('should include SQL header comments', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain('-- Database Documentation Script');
      expect(sql).toContain('-- Database: TestDB');
      expect(sql).toContain('-- Server: localhost');
    });

    it('should generate schema description sp_addextendedproperty', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain("@level0type = N'SCHEMA'");
      expect(sql).toContain("@level0name = N'dbo'");
      expect(sql).toContain('Default schema');
    });

    it('should generate table description sp_addextendedproperty', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain("@level1type = N'TABLE'");
      expect(sql).toContain("@level1name = N'Users'");
      expect(sql).toContain('Stores user accounts');
    });

    it('should generate column description sp_addextendedproperty', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain("@level2type = N'COLUMN'");
      expect(sql).toContain("@level2name = N'ID'");
      expect(sql).toContain('Primary key identifier');
    });

    it('should include drop-before-add pattern', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain('sp_dropextendedproperty');
      expect(sql).toContain('sp_addextendedproperty');
    });

    it('should include GO statement separators', () => {
      const sql = generator.generate(createState());

      expect(sql).toContain('GO');
    });

    it('should escape single quotes in descriptions', () => {
      const state = createState();
      state.schemas[0].tables[0].description = "User's account data";
      const sql = generator.generate(state);

      expect(sql).toContain("User''s account data");
    });

    it('should skip tables without descriptions', () => {
      const state = createState();
      state.schemas[0].tables[0].description = undefined;
      const sql = generator.generate(state);

      expect(sql).not.toContain("@level1name = N'Users'");
    });

    it('should skip columns without descriptions', () => {
      const state = createState();
      state.schemas[0].tables[0].columns[0].description = undefined;
      const sql = generator.generate(state);

      // ID column should not be included (no description), but Name column should
      expect(sql).not.toContain("@level2name = N'ID'");
      expect(sql).toContain("@level2name = N'Name'");
    });
  });

  describe('generate with options', () => {
    it('should filter by approvedOnly', () => {
      const state = createState();
      state.schemas[0].tables[0].userApproved = false;
      const sql = generator.generate(state, { approvedOnly: true });

      expect(sql).not.toContain("@level1name = N'Users'");
    });

    it('should filter by confidenceThreshold', () => {
      const state = createState();
      state.schemas[0].tables[0].descriptionIterations[0].confidence = 0.5;
      const sql = generator.generate(state, { confidenceThreshold: 0.8 });

      expect(sql).not.toContain("@level1name = N'Users'");
    });

    it('should include tables above threshold', () => {
      const state = createState();
      state.schemas[0].tables[0].descriptionIterations[0].confidence = 0.95;
      const sql = generator.generate(state, { confidenceThreshold: 0.8 });

      expect(sql).toContain("@level1name = N'Users'");
    });
  });
});
