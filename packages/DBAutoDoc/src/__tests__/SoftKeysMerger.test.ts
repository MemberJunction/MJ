import { describe, it, expect } from 'vitest';
import { SoftKeysMerger } from '../utils/soft-keys-merger';
import { SoftPKFKTableConfig } from '../utils/soft-keys-loader';
import { DatabaseDocumentation, SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state';
import { StateManager } from '../state/StateManager';

/** Create a column with defaults */
function col(
  name: string,
  overrides?: Partial<ColumnDefinition>
): ColumnDefinition {
  return {
    name,
    dataType: 'int',
    isNullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides,
  };
}

/** Create a table with defaults */
function tbl(name: string, columns: ColumnDefinition[], overrides?: Partial<TableDefinition>): TableDefinition {
  return {
    name,
    rowCount: 100,
    dependsOn: [],
    dependents: [],
    columns,
    descriptionIterations: [],
    ...overrides,
  };
}

/** Create a minimal state for testing */
function createState(schemas: SchemaDefinition[]): DatabaseDocumentation {
  const manager = new StateManager('/tmp/test.json');
  const state = manager.createInitialState('TestDB', 'localhost');
  state.schemas = schemas;
  return state;
}

describe('SoftKeysMerger', () => {
  describe('Primary Key merging', () => {
    it('should set isPrimaryKey and pkSource on columns', () => {
      const state = createState([
        { name: 'dbo', tables: [tbl('Users', [col('ID'), col('Name')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      const userTable = state.schemas[0].tables[0];
      const idCol = userTable.columns.find(c => c.name === 'ID')!;
      expect(idCol.isPrimaryKey).toBe(true);
      expect(idCol.pkSource).toBe('manual');
      expect(result.pkAdded).toBe(1);
      expect(result.tablesAffected).toBe(1);
    });

    it('should skip columns already marked as schema PK (undefined pkSource)', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [tbl('Users', [col('ID', { isPrimaryKey: true })])],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.pkAdded).toBe(0);
      expect(state.schemas[0].tables[0].columns[0].pkSource).toBeUndefined();
    });

    it('should skip columns already marked as schema PK (explicit pkSource)', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [tbl('Users', [col('ID', { isPrimaryKey: true, pkSource: 'schema' })])],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.pkAdded).toBe(0);
    });

    it('should be idempotent — merging same PK twice adds nothing', () => {
      const state = createState([
        { name: 'dbo', tables: [tbl('Users', [col('ID')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
      ];

      SoftKeysMerger.merge(state, softKeys);
      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.pkAdded).toBe(0);
    });
  });

  describe('Foreign Key merging', () => {
    it('should set isForeignKey, fkSource, and foreignKeyReferences', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('ID'), col('UserID')]),
            tbl('Users', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' }],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      const ordersTable = state.schemas[0].tables[0];
      const userIdCol = ordersTable.columns.find(c => c.name === 'UserID')!;
      expect(userIdCol.isForeignKey).toBe(true);
      expect(userIdCol.fkSource).toBe('manual');
      expect(userIdCol.foreignKeyReferences).toEqual({
        schema: 'dbo',
        table: 'Users',
        column: 'UserID',
        referencedColumn: 'ID',
      });
      expect(result.fkAdded).toBe(1);
    });

    it('should update dependsOn on source table', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('UserID')]),
            tbl('Users', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' }],
        },
      ];

      SoftKeysMerger.merge(state, softKeys);

      const ordersTable = state.schemas[0].tables[0];
      expect(ordersTable.dependsOn).toHaveLength(1);
      expect(ordersTable.dependsOn[0].table).toBe('Users');
    });

    it('should update dependents on target table', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('UserID')]),
            tbl('Users', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' }],
        },
      ];

      SoftKeysMerger.merge(state, softKeys);

      const usersTable = state.schemas[0].tables[1];
      expect(usersTable.dependents).toHaveLength(1);
      expect(usersTable.dependents[0].table).toBe('Orders');
    });

    it('should skip columns already marked as schema FK', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('UserID', { isForeignKey: true, fkSource: 'schema' })]),
            tbl('Users', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' }],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.fkAdded).toBe(0);
    });

    it('should not duplicate dependsOn entries', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('UserID')]),
            tbl('Users', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' }],
        },
      ];

      SoftKeysMerger.merge(state, softKeys);
      SoftKeysMerger.merge(state, softKeys);

      const ordersTable = state.schemas[0].tables[0];
      expect(ordersTable.dependsOn).toHaveLength(1);
    });

    it('should handle cross-schema FKs', () => {
      const state = createState([
        { name: 'sales', tables: [tbl('Orders', [col('EmployeeID')])], descriptionIterations: [] },
        { name: 'hr', tables: [tbl('Employees', [col('ID')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'sales',
          TableName: 'Orders',
          PrimaryKey: [],
          ForeignKeys: [{ FieldName: 'EmployeeID', SchemaName: 'hr', RelatedTable: 'Employees', RelatedField: 'ID' }],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.fkAdded).toBe(1);
      const ordersTable = state.schemas[0].tables[0];
      expect(ordersTable.dependsOn[0].schema).toBe('hr');

      const employeesTable = state.schemas[1].tables[0];
      expect(employeesTable.dependents).toHaveLength(1);
      expect(employeesTable.dependents[0].schema).toBe('sales');
    });
  });

  describe('Table description injection', () => {
    it('should inject description as ground truth when table has none', () => {
      const state = createState([
        { name: 'dbo', tables: [tbl('Users', [col('ID')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          Description: 'Stores user accounts',
          PrimaryKey: [{ FieldName: 'ID' }],
          ForeignKeys: [],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      const usersTable = state.schemas[0].tables[0];
      expect(usersTable.description).toBe('Stores user accounts');
      expect(usersTable.userDescription).toBe('Stores user accounts');
      expect(usersTable.userApproved).toBe(true);
      expect(usersTable.descriptionIterations).toHaveLength(1);
      expect(usersTable.descriptionIterations[0].isGroundTruth).toBe(true);
      expect(result.tableDescriptionsAdded).toBe(1);
    });

    it('should not overwrite existing table description', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [tbl('Users', [col('ID')], { description: 'Existing description' })],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Users',
          Description: 'New description',
          PrimaryKey: [],
          ForeignKeys: [],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(state.schemas[0].tables[0].description).toBe('Existing description');
      expect(result.tableDescriptionsAdded).toBe(0);
    });
  });

  describe('Missing table handling', () => {
    it('should produce a warning for non-existent tables', () => {
      const state = createState([
        { name: 'dbo', tables: [tbl('Users', [col('ID')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'NonExistent', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('not found in state');
      expect(result.pkAdded).toBe(0);
    });

    it('should produce a warning for non-existent columns', () => {
      const state = createState([
        { name: 'dbo', tables: [tbl('Users', [col('ID')])], descriptionIterations: [] },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        { SchemaName: 'dbo', TableName: 'Users', PrimaryKey: [{ FieldName: 'BadCol' }], ForeignKeys: [] },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("PK column 'BadCol'");
    });
  });

  describe('Return stats', () => {
    it('should return accurate aggregate counts', () => {
      const state = createState([
        {
          name: 'dbo',
          tables: [
            tbl('Orders', [col('ID'), col('UserID'), col('ProductID')]),
            tbl('Users', [col('ID')]),
            tbl('Products', [col('ID')]),
          ],
          descriptionIterations: [],
        },
      ]);

      const softKeys: SoftPKFKTableConfig[] = [
        {
          SchemaName: 'dbo',
          TableName: 'Orders',
          PrimaryKey: [{ FieldName: 'ID' }],
          ForeignKeys: [
            { FieldName: 'UserID', RelatedTable: 'Users', RelatedField: 'ID' },
            { FieldName: 'ProductID', RelatedTable: 'Products', RelatedField: 'ID' },
          ],
        },
      ];

      const result = SoftKeysMerger.merge(state, softKeys);

      expect(result.pkAdded).toBe(1);
      expect(result.fkAdded).toBe(2);
      expect(result.tablesAffected).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
