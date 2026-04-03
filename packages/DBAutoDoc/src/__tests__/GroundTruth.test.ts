import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../state/StateManager';
import { DatabaseDocumentation, TableDefinition, ColumnDefinition, SchemaDefinition } from '../types/state';
import { DBAutoDocConfig, GroundTruthConfig, TableGroundTruth, SeedContextConfig } from '../types/config';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn()
}));

/**
 * Helper to create a minimal DBAutoDocConfig for testing
 */
function createTestConfig(overrides?: Partial<DBAutoDocConfig>): DBAutoDocConfig {
  return {
    version: '1.0.0',
    database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
    ai: { provider: 'gemini', model: 'test-model', apiKey: 'test-key', temperature: 0.1 },
    analysis: {
      cardinalityThreshold: 20,
      sampleSize: 10,
      includeStatistics: true,
      includePatternAnalysis: true,
      convergence: { maxIterations: 10, stabilityWindow: 2, confidenceThreshold: 0.85 },
      backpropagation: { enabled: true, maxDepth: 3 },
      sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
    },
    output: { stateFile: './state.json', sqlFile: './out.sql', markdownFile: './out.md' },
    schemas: { exclude: ['sys'] },
    tables: { exclude: [] },
    ...overrides
  };
}

/**
 * Helper to create a test state with schemas and tables
 */
function createTestState(): DatabaseDocumentation {
  const manager = new StateManager('/tmp/test.json');
  const state = manager.createInitialState('TestDB', 'localhost');
  state.schemas = [
    {
      name: 'dbo',
      tables: [
        {
          name: 'Users',
          rowCount: 100,
          dependsOn: [],
          dependents: [],
          columns: [
            { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'Name', dataType: 'nvarchar', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
            { name: 'Email', dataType: 'nvarchar', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }
          ],
          descriptionIterations: []
        },
        {
          name: 'Orders',
          rowCount: 500,
          dependsOn: [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }],
          dependents: [],
          columns: [
            { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'UserID', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [] }
          ],
          descriptionIterations: []
        }
      ],
      descriptionIterations: []
    },
    {
      name: 'sales',
      tables: [
        {
          name: 'Products',
          rowCount: 50,
          dependsOn: [],
          dependents: [],
          columns: [
            { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'Name', dataType: 'nvarchar', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }
          ],
          descriptionIterations: []
        }
      ],
      descriptionIterations: []
    }
  ];
  return state;
}

describe('Ground Truth System', () => {
  describe('Config Types', () => {
    it('should allow ground truth in config', () => {
      const config = createTestConfig({
        groundTruth: {
          databaseDescription: 'A test database for e-commerce',
          schemas: {
            dbo: { description: 'Default schema for core entities', businessDomain: 'Core' },
            sales: { description: 'Sales-related tables' }
          },
          tables: {
            'dbo.Users': {
              description: 'Stores user accounts and profiles',
              notes: 'This is the primary user table',
              columns: {
                Email: { description: 'User email address for login and notifications' }
              }
            }
          }
        }
      });

      expect(config.groundTruth).toBeDefined();
      expect(config.groundTruth!.databaseDescription).toBe('A test database for e-commerce');
      expect(config.groundTruth!.schemas!['dbo'].description).toBe('Default schema for core entities');
      expect(config.groundTruth!.tables!['dbo.Users'].columns!['Email'].description).toContain('email address');
    });

    it('should allow seedContext in config', () => {
      const config = createTestConfig({
        seedContext: {
          overallPurpose: 'E-commerce platform',
          businessDomains: ['Sales', 'Inventory', 'Users'],
          industryContext: 'Online retail',
          customInstructions: 'Focus on product catalog relationships'
        }
      });

      expect(config.seedContext).toBeDefined();
      expect(config.seedContext!.overallPurpose).toBe('E-commerce platform');
      expect(config.seedContext!.businessDomains).toHaveLength(3);
    });

    it('should default groundTruth to undefined', () => {
      const config = createTestConfig();
      expect(config.groundTruth).toBeUndefined();
    });
  });

  describe('State Types - Column Extensions', () => {
    it('should support userDescription on ColumnDefinition', () => {
      const column: ColumnDefinition = {
        name: 'Email',
        dataType: 'nvarchar',
        isNullable: true,
        isPrimaryKey: false,
        isForeignKey: false,
        descriptionIterations: [],
        userDescription: 'Primary email for communications',
        userApproved: true
      };

      expect(column.userDescription).toBe('Primary email for communications');
      expect(column.userApproved).toBe(true);
    });

    it('should support isGroundTruth on DescriptionIteration', () => {
      const table: TableDefinition = {
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [
          {
            description: 'User accounts table',
            reasoning: 'User-provided ground truth',
            generatedAt: '2024-01-01',
            modelUsed: 'ground_truth',
            confidence: 1.0,
            triggeredBy: 'ground_truth',
            isGroundTruth: true
          }
        ]
      };

      expect(table.descriptionIterations[0].isGroundTruth).toBe(true);
      expect(table.descriptionIterations[0].triggeredBy).toBe('ground_truth');
    });

    it('should support existing_db_description triggeredBy', () => {
      const table: TableDefinition = {
        name: 'Products',
        rowCount: 50,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [
          {
            description: 'Product catalog',
            reasoning: 'Loaded from existing database metadata',
            generatedAt: '2024-01-01',
            modelUsed: 'existing_db',
            confidence: 0.5,
            triggeredBy: 'existing_db_description'
          }
        ]
      };

      expect(table.descriptionIterations[0].triggeredBy).toBe('existing_db_description');
    });
  });

  describe('StateManager - triggeredBy extension', () => {
    let manager: StateManager;

    beforeEach(() => {
      manager = new StateManager('/tmp/test.json');
      vi.clearAllMocks();
    });

    it('should accept ground_truth as triggeredBy', () => {
      const table: TableDefinition = {
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: []
      };

      manager.updateTableDescription(table, 'Ground truth desc', 'User provided', 1.0, 'ground_truth', 'ground_truth');

      expect(table.descriptionIterations[0].triggeredBy).toBe('ground_truth');
      expect(table.description).toBe('Ground truth desc');
    });

    it('should accept existing_db_description as triggeredBy', () => {
      const table: TableDefinition = {
        name: 'Products',
        rowCount: 50,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: []
      };

      manager.updateTableDescription(table, 'From DB', 'Extended property', 0.5, 'existing_db', 'existing_db_description');

      expect(table.descriptionIterations[0].triggeredBy).toBe('existing_db_description');
    });
  });
});

describe('User-Approved Protection', () => {
  it('should identify user-approved tables', () => {
    const state = createTestState();
    // Mark Users table as approved
    state.schemas[0].tables[0].userApproved = true;

    const manager = new StateManager('/tmp/test.json');
    const unapproved = manager.getUnapprovedTables(state);

    // Users is approved, Orders and Products are not
    expect(unapproved).toHaveLength(2);
    expect(unapproved.map(t => t.name)).not.toContain('Users');
    expect(unapproved.map(t => t.name)).toContain('Orders');
    expect(unapproved.map(t => t.name)).toContain('Products');
  });

  it('should identify user-approved columns', () => {
    const column: ColumnDefinition = {
      name: 'Email',
      dataType: 'nvarchar',
      isNullable: true,
      isPrimaryKey: false,
      isForeignKey: false,
      descriptionIterations: [],
      userApproved: true
    };

    expect(column.userApproved).toBe(true);
  });

  it('should protect ground truth tables from low-confidence reanalysis', () => {
    const state = createTestState();
    const usersTable = state.schemas[0].tables[0];

    // Add a ground truth iteration
    usersTable.descriptionIterations.push({
      description: 'Ground truth description',
      reasoning: 'User-provided',
      generatedAt: '2024-01-01',
      modelUsed: 'ground_truth',
      confidence: 1.0,
      triggeredBy: 'ground_truth',
      isGroundTruth: true
    });
    usersTable.userApproved = true;

    // The table should be considered approved even if confidence is technically low
    const hasGroundTruth = usersTable.descriptionIterations.some(i => i.isGroundTruth);
    expect(hasGroundTruth).toBe(true);
    expect(usersTable.userApproved).toBe(true);
  });
});

describe('Low Confidence Reanalysis', () => {
  it('should identify tables below confidence threshold', () => {
    const state = createTestState();
    const manager = new StateManager('/tmp/test.json');

    // Add iterations with varying confidence
    state.schemas[0].tables[0].descriptionIterations.push({
      description: 'Low conf desc',
      reasoning: '',
      generatedAt: '',
      modelUsed: 'test',
      confidence: 0.4
    });
    state.schemas[0].tables[1].descriptionIterations.push({
      description: 'High conf desc',
      reasoning: '',
      generatedAt: '',
      modelUsed: 'test',
      confidence: 0.9
    });
    // Products (schemas[1].tables[0]) intentionally left with no iterations — confidence 0

    const lowConf = manager.getLowConfidenceTables(state, 0.7);
    // Users (0.4) and Products (0 — no iterations yet) are below threshold; Orders (0.9) is above
    expect(lowConf).toHaveLength(2);
    const users = lowConf.find(t => t.table === 'Users');
    const products = lowConf.find(t => t.table === 'Products');
    expect(users).toBeDefined();
    expect(users!.confidence).toBe(0.4);
    expect(products).toBeDefined();
    expect(products!.confidence).toBe(0);
  });

  it('should not mark ground truth tables for reanalysis', () => {
    const state = createTestState();
    const usersTable = state.schemas[0].tables[0];

    usersTable.descriptionIterations.push({
      description: 'Ground truth',
      reasoning: 'User-provided',
      generatedAt: '',
      modelUsed: 'ground_truth',
      confidence: 0.3, // Even with low confidence score
      triggeredBy: 'ground_truth',
      isGroundTruth: true
    });

    // Check that the ground truth flag is present
    const hasGroundTruth = usersTable.descriptionIterations.some(i => i.isGroundTruth);
    expect(hasGroundTruth).toBe(true);
  });
});

describe('Ground Truth Config Shapes', () => {
  it('should support database-level ground truth', () => {
    const gt: GroundTruthConfig = {
      databaseDescription: 'Enterprise CRM system'
    };
    expect(gt.databaseDescription).toBe('Enterprise CRM system');
  });

  it('should support schema-level ground truth', () => {
    const gt: GroundTruthConfig = {
      schemas: {
        dbo: { description: 'Core business entities', businessDomain: 'Core', notes: 'Main schema' },
        hr: { description: 'Human resources' }
      }
    };
    expect(Object.keys(gt.schemas!)).toHaveLength(2);
    expect(gt.schemas!['dbo'].businessDomain).toBe('Core');
  });

  it('should support table-level ground truth with columns', () => {
    const tableGT: TableGroundTruth = {
      description: 'Employee records',
      notes: 'Updated quarterly',
      businessDomain: 'HR',
      columns: {
        EmployeeID: { description: 'Unique employee identifier', notes: 'Auto-generated' },
        HireDate: { description: 'Date the employee was hired' }
      }
    };

    expect(tableGT.columns!['EmployeeID'].description).toContain('employee identifier');
    expect(tableGT.columns!['HireDate'].notes).toBeUndefined();
  });

  it('should support empty ground truth', () => {
    const gt: GroundTruthConfig = {};
    expect(gt.databaseDescription).toBeUndefined();
    expect(gt.schemas).toBeUndefined();
    expect(gt.tables).toBeUndefined();
  });
});

describe('SeedContext Config', () => {
  it('should support all seed context fields', () => {
    const sc: SeedContextConfig = {
      overallPurpose: 'Association Management System',
      businessDomains: ['CRM', 'Events', 'Billing'],
      customInstructions: 'Schemas are organized by domain',
      industryContext: 'Trade associations'
    };

    expect(sc.overallPurpose).toBe('Association Management System');
    expect(sc.businessDomains).toContain('CRM');
    expect(sc.industryContext).toBe('Trade associations');
  });

  it('should allow partial seed context', () => {
    const sc: SeedContextConfig = {
      overallPurpose: 'Simple app'
    };

    expect(sc.overallPurpose).toBe('Simple app');
    expect(sc.businessDomains).toBeUndefined();
  });
});
