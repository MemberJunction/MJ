import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoftKeysLoader } from '../utils/soft-keys-loader';
import { SchemaDefinition } from '../types/state';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import * as fsPromises from 'fs/promises';

const readFileMock = vi.mocked(fsPromises.readFile);

/** Helper: create a minimal SchemaDefinition for validation tests */
function createSchemas(): SchemaDefinition[] {
  return [
    {
      name: 'dbo',
      descriptionIterations: [],
      tables: [
        {
          name: 'Users',
          rowCount: 100,
          dependsOn: [],
          dependents: [],
          descriptionIterations: [],
          columns: [
            { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'Name', dataType: 'varchar', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
            { name: 'DepartmentID', dataType: 'int', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
          ],
        },
        {
          name: 'Departments',
          rowCount: 10,
          dependsOn: [],
          dependents: [],
          descriptionIterations: [],
          columns: [
            { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'Name', dataType: 'varchar', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
          ],
        },
      ],
    },
    {
      name: 'hr',
      descriptionIterations: [],
      tables: [
        {
          name: 'Employees',
          rowCount: 50,
          dependsOn: [],
          dependents: [],
          descriptionIterations: [],
          columns: [
            { name: 'EmployeeID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
            { name: 'ManagerID', dataType: 'int', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
          ],
        },
      ],
    },
  ];
}

describe('SoftKeysLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars if modified
    delete process.env.TEST_SCHEMA;
  });

  describe('loadFromFile', () => {
    it('should load flat Tables array format', async () => {
      const fileContent = JSON.stringify({
        Tables: [
          {
            SchemaName: 'dbo',
            TableName: 'Users',
            PrimaryKey: [{ FieldName: 'ID' }],
            ForeignKeys: [
              { FieldName: 'DepartmentID', RelatedTable: 'Departments', RelatedField: 'ID' },
            ],
          },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].SchemaName).toBe('dbo');
      expect(result.tables[0].TableName).toBe('Users');
      expect(result.tables[0].PrimaryKey).toHaveLength(1);
      expect(result.tables[0].ForeignKeys).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should load schema-as-key format', async () => {
      const fileContent = JSON.stringify({
        dbo: [
          {
            TableName: 'Users',
            PrimaryKey: [{ FieldName: 'ID' }],
            ForeignKeys: [],
          },
        ],
        hr: [
          {
            TableName: 'Employees',
            ForeignKeys: [
              { FieldName: 'ManagerID', SchemaName: 'hr', RelatedTable: 'Employees', RelatedField: 'EmployeeID' },
            ],
          },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].SchemaName).toBe('dbo');
      expect(result.tables[0].TableName).toBe('Users');
      expect(result.tables[1].SchemaName).toBe('hr');
      expect(result.tables[1].TableName).toBe('Employees');
    });

    it('should default SchemaName to dbo when absent in flat format', async () => {
      const fileContent = JSON.stringify({
        Tables: [
          { TableName: 'Orders', ForeignKeys: [] },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables[0].SchemaName).toBe('dbo');
    });

    it('should default PrimaryKey and ForeignKeys to empty arrays when absent', async () => {
      const fileContent = JSON.stringify({
        Tables: [
          { SchemaName: 'dbo', TableName: 'Logs' },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables[0].PrimaryKey).toEqual([]);
      expect(result.tables[0].ForeignKeys).toEqual([]);
    });

    it('should expand environment variables', async () => {
      process.env.TEST_SCHEMA = 'custom_schema';
      const fileContent = JSON.stringify({
        Tables: [
          { SchemaName: '${TEST_SCHEMA}', TableName: 'Data' },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables[0].SchemaName).toBe('custom_schema');
    });

    it('should skip reserved keys in schema-as-key format', async () => {
      const fileContent = JSON.stringify({
        Schemas: [{ name: 'dbo', entityNamePrefix: '' }],
        VirtualEntities: [],
        ISARelationships: [],
        Entities: [],
        dbo: [{ TableName: 'Users', ForeignKeys: [] }],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].TableName).toBe('Users');
    });

    it('should warn on entries with no TableName', async () => {
      const fileContent = JSON.stringify({
        Tables: [
          { SchemaName: 'dbo' },
          { SchemaName: 'dbo', TableName: 'Valid' },
        ],
      });

      readFileMock.mockResolvedValue(fileContent);

      const result = await SoftKeysLoader.loadFromFile('/fake/soft-keys.json');

      expect(result.tables).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('no TableName');
    });
  });

  describe('validate', () => {
    it('should return no warnings for valid references', () => {
      const tables = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          PrimaryKey: [{ FieldName: 'ID' }],
          ForeignKeys: [
            { FieldName: 'DepartmentID', RelatedTable: 'Departments', RelatedField: 'ID' },
          ],
        },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(0);
    });

    it('should warn when table not found in schema', () => {
      const tables = [
        { SchemaName: 'dbo', TableName: 'NonExistent', PrimaryKey: [], ForeignKeys: [] },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('not found in database schema');
    });

    it('should warn when PK column not found', () => {
      const tables = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'BadColumn' }], ForeignKeys: [] },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("PK column 'BadColumn'");
    });

    it('should warn when FK source column not found', () => {
      const tables = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'BadCol', RelatedTable: 'Departments', RelatedField: 'ID' }],
        },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("FK source column 'BadCol'");
    });

    it('should warn when FK target table not found', () => {
      const tables = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'DepartmentID', RelatedTable: 'NonExistent', RelatedField: 'ID' }],
        },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("FK target table");
    });

    it('should warn when FK target column not found', () => {
      const tables = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'DepartmentID', RelatedTable: 'Departments', RelatedField: 'BadCol' }],
        },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("FK target column 'BadCol'");
    });

    it('should support cross-schema FK validation', () => {
      const tables = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          PrimaryKey: [],
          ForeignKeys: [
            { FieldName: 'DepartmentID', SchemaName: 'hr', RelatedTable: 'Employees', RelatedField: 'EmployeeID' },
          ],
        },
      ];

      const warnings = SoftKeysLoader.validate(tables, createSchemas());
      expect(warnings).toHaveLength(0);
    });
  });
});
