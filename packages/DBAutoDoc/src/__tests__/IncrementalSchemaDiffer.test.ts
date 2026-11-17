import { describe, it, expect } from 'vitest';
import { DiffSchemas, WasCatalogPrimaryKey, IsCatalogForeignKeyRef } from '../incremental/SchemaDiffer.js';
import { StateManager } from '../state/StateManager.js';
import { ColumnDefinition, DatabaseDocumentation, SchemaDefinition, TableDefinition } from '../types/state.js';
import { AutoDocIndex } from '../types/driver.js';

function makeColumn(name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name,
    dataType: 'int',
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides,
  };
}

function makeTable(name: string, columns: ColumnDefinition[], overrides: Partial<TableDefinition> = {}): TableDefinition {
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

function makeBaseState(schemas: SchemaDefinition[]): DatabaseDocumentation {
  const sm = new StateManager('/tmp/base-state.json');
  const state = sm.createInitialState('TestDB', 'localhost');
  state.schemas = schemas;
  return state;
}

describe('SchemaDiffer', () => {
  it('treats soft AI-discovered PKs and FKs on prior state as unchanged when live catalog lacks constraints', () => {
    const priorCustomers = makeTable('Customers', [
      makeColumn('CustomerID', { isPrimaryKey: true, isCatalogPrimaryKey: false }),
      makeColumn('Email', { dataType: 'nvarchar', maxLength: 255, isNullable: true }),
    ]);
    const priorOrders = makeTable(
      'Orders',
      [
        makeColumn('OrderID', { isPrimaryKey: true, isCatalogPrimaryKey: false }),
        makeColumn('CustomerID', {
          isForeignKey: true,
          isCatalogForeignKey: false,
          foreignKeyReferences: { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' },
        }),
      ],
      {
        dependsOn: [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' }],
      },
    );

    const priorState = makeBaseState([{ name: 'dbo', tables: [priorCustomers, priorOrders], descriptionIterations: [] }]);
    priorState.phases.keyDetection = {
      triggered: true,
      triggerReason: 'both',
      triggerDetails: { tablesWithoutPK: 2, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 1 },
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:01:00Z',
      tokenBudget: { allocated: 10000, used: 500, remaining: 9500 },
      iterations: [],
      discovered: {
        primaryKeys: [
          {
            schemaName: 'dbo',
            tableName: 'Customers',
            columnNames: ['CustomerID'],
            confidence: 95,
            evidence: { uniqueness: 1, nullCount: 0, totalRows: 100, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
          {
            schemaName: 'dbo',
            tableName: 'Orders',
            columnNames: ['OrderID'],
            confidence: 95,
            evidence: { uniqueness: 1, nullCount: 0, totalRows: 100, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
        ],
        foreignKeys: [
          {
            schemaName: 'dbo',
            sourceTable: 'Orders',
            sourceColumn: 'CustomerID',
            targetSchema: 'dbo',
            targetTable: 'Customers',
            targetColumn: 'CustomerID',
            confidence: 92,
            evidence: { namingMatch: 1, valueOverlap: 1, cardinalityRatio: 5, dataTypeMatch: true, nullPercentage: 0, sampleSize: 100, orphanCount: 0, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
        ],
      },
      schemaEnhancements: { pkeysAdded: 2, fkeysAdded: 1, overallConfidence: 94 },
      feedbackFromAnalysis: [],
      summary: { totalTablesAnalyzed: 2, tablesWithDiscoveredPKs: 2, relationshipsDiscovered: 1, averageConfidence: 94, highConfidenceCount: 3, mediumConfidenceCount: 0, lowConfidenceCount: 0, rejectedCount: 0 },
    };

    // Live catalog has NO declared PK or FK constraints (just like Run 1's raw introspection)
    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          makeTable('Customers', [
            makeColumn('CustomerID', { isPrimaryKey: false, isCatalogPrimaryKey: false }),
            makeColumn('Email', { dataType: 'nvarchar', maxLength: 255, isNullable: true }),
          ]),
          makeTable('Orders', [
            makeColumn('OrderID', { isPrimaryKey: false, isCatalogPrimaryKey: false }),
            makeColumn('CustomerID', { isForeignKey: false, isCatalogForeignKey: false }),
          ]),
        ],
      },
    ];

    expect(WasCatalogPrimaryKey(priorState, 'dbo', 'Customers', priorCustomers.columns[0])).toBe(false);
    expect(IsCatalogForeignKeyRef(priorState, 'dbo', 'Orders', priorOrders.dependsOn[0])).toBe(false);

    const diff = DiffSchemas(priorState, liveSchemas);
    expect(diff.HasChanges).toBe(false);
    expect(diff.ModifiedTables).toHaveLength(0);
    expect(diff.UnchangedTables).toEqual(['dbo.Customers', 'dbo.Orders']);
    expect(diff.TotalColumnsToSample).toBe(0);
  });

  it('detects added/removed schemas, added/removed tables, and granular column & index modifications', () => {
    const idxOld: AutoDocIndex = {
      SchemaName: 'dbo',
      TableName: 'Customers',
      IndexName: 'IX_Customers_Email',
      Columns: ['Email'],
      IncludeColumns: [],
      IsUnique: false,
      IsPrimaryKey: false,
      Method: 'NONCLUSTERED',
      HasExpressions: false,
    };
    const idxNew: AutoDocIndex = {
      ...idxOld,
      IsUnique: true,
    };

    const priorState = makeBaseState([
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          makeTable(
            'Customers',
            [
              makeColumn('ID', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
              makeColumn('Email', { dataType: 'varchar', maxLength: 100, isNullable: true }),
              makeColumn('Status', { dataType: 'varchar', defaultValue: "'Active'" }),
              makeColumn('LegacyCode', { dataType: 'varchar' }),
            ],
            { indexes: [idxOld] },
          ),
          makeTable('EmptyStaging', [makeColumn('ID', { isPrimaryKey: false })], { rowCount: 0 }),
          makeTable('DroppedTable', [makeColumn('ID', { isPrimaryKey: true })]),
        ],
      },
      {
        name: 'legacy_schema',
        descriptionIterations: [],
        tables: [makeTable('OldArchive', [makeColumn('ID')])],
      },
    ]);

    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          makeTable(
            'Customers',
            [
              makeColumn('ID', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
              makeColumn('Email', { dataType: 'nvarchar', maxLength: 255, isNullable: false }),
              makeColumn('Status', { dataType: 'varchar', defaultValue: "'Pending'" }),
              makeColumn('LoyaltyTier', { dataType: 'varchar', isNullable: true }),
            ],
            { indexes: [idxNew] },
          ),
          makeTable('EmptyStaging', [makeColumn('ID', { isPrimaryKey: false })], { rowCount: 42 }),
        ],
      },
      {
        name: 'marketing',
        descriptionIterations: [],
        tables: [makeTable('Campaigns', [makeColumn('CampaignID'), makeColumn('Name', { dataType: 'nvarchar' })])],
      },
    ];

    const diff = DiffSchemas(priorState, liveSchemas);
    expect(diff.HasChanges).toBe(true);
    expect(diff.AddedSchemas).toEqual(['marketing']);
    expect(diff.RemovedSchemas).toEqual(['legacy_schema']);
    expect(diff.AddedTables).toEqual(['marketing.Campaigns']);
    expect(diff.RemovedTables).toEqual(['dbo.DroppedTable', 'legacy_schema.OldArchive']);
    expect(diff.ModifiedTables).toHaveLength(2);

    const custDiff = diff.ModifiedTables.find((m) => m.TableKey === 'dbo.Customers')!;
    expect(custDiff.AddedColumns).toEqual(['LoyaltyTier']);
    expect(custDiff.RemovedColumns).toEqual(['LegacyCode']);
    expect(custDiff.IndexesChanged).toBe(true);
    expect(custDiff.ModifiedColumns).toHaveLength(2);

    const emailDiff = custDiff.ModifiedColumns.find((c) => c.ColumnName === 'Email')!;
    expect(emailDiff.Changes).toEqual(['dataType', 'maxLength', 'nullability']);
    expect(emailDiff.RequiresResampling).toBe(true);

    const statusDiff = custDiff.ModifiedColumns.find((c) => c.ColumnName === 'Status')!;
    expect(statusDiff.Changes).toEqual(['defaultValue']);
    expect(statusDiff.RequiresResampling).toBe(false);

    const stagingDiff = diff.ModifiedTables.find((m) => m.TableKey === 'dbo.EmptyStaging')!;
    expect(stagingDiff.PopulatedFromEmpty).toBe(true);

    // TotalColumnsToSample = Campaigns(2) + Customers(LoyaltyTier + Email = 2, Status skipped) + EmptyStaging(1) = 5
    expect(diff.TotalColumnsToSample).toBe(5);
  });

  it('respects reanalyzePopulatedTables: false for empty-to-populated tables', () => {
    const priorState = makeBaseState([
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [makeTable('Staging', [makeColumn('ID')], { rowCount: 0 })],
      },
    ]);
    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [makeTable('Staging', [makeColumn('ID')], { rowCount: 25 })],
      },
    ];

    const diff = DiffSchemas(priorState, liveSchemas, { reanalyzePopulatedTables: false });
    expect(diff.HasChanges).toBe(false);
    expect(diff.UnchangedTables).toEqual(['dbo.Staging']);
  });

  it('handles legacy state files with rejected composite PK sibling flags and target-divergent soft FKs', () => {
    const priorEmployee = makeTable(
      'Employee',
      [
        makeColumn('BusinessEntityID', { isPrimaryKey: false, isForeignKey: true }),
        makeColumn('LoginID', { isPrimaryKey: true }), // legacy orphaned flag from a rejected composite PK
      ],
      {
        dependsOn: [{ schema: 'Person', table: 'Person', column: 'BusinessEntityID', referencedColumn: 'BusinessEntityID' }],
      },
    );
    const priorState = makeBaseState([{ name: 'HumanResources', tables: [priorEmployee], descriptionIterations: [] }]);
    priorState.phases.keyDetection = {
      triggered: true,
      triggerReason: 'both',
      triggerDetails: { tablesWithoutPK: 1, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 1 },
      startedAt: '2026-01-01T00:00:00Z',
      tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
      iterations: [],
      discovered: {
        primaryKeys: [
          {
            schemaName: 'HumanResources',
            tableName: 'Employee',
            columnNames: ['BusinessEntityID', 'LoginID'],
            confidence: 75,
            evidence: { uniqueness: 1, nullCount: 0, totalRows: 100, dataPattern: 'composite', namingScore: 0.8, dataTypeScore: 0.9, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: false,
            status: 'rejected',
          },
          {
            schemaName: 'HumanResources',
            tableName: 'Employee',
            columnNames: ['BusinessEntityID'],
            confidence: 100,
            evidence: { uniqueness: 1, nullCount: 0, totalRows: 100, dataPattern: 'sequential', namingScore: 0.8, dataTypeScore: 0.9, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
        ],
        foreignKeys: [
          {
            schemaName: 'HumanResources',
            sourceTable: 'Employee',
            sourceColumn: 'BusinessEntityID',
            targetSchema: 'Person',
            targetTable: 'BusinessEntity',
            targetColumn: 'BusinessEntityID',
            confidence: 90,
            evidence: { namingMatch: 1, valueOverlap: 1, cardinalityRatio: 1, dataTypeMatch: true, nullPercentage: 0, sampleSize: 100, orphanCount: 0, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
        ],
      },
      schemaEnhancements: { pkeysAdded: 1, fkeysAdded: 1, overallConfidence: 95 },
      feedbackFromAnalysis: [],
      summary: { totalTablesAnalyzed: 1, tablesWithDiscoveredPKs: 1, relationshipsDiscovered: 1, averageConfidence: 95, highConfidenceCount: 2, mediumConfidenceCount: 0, lowConfidenceCount: 0, rejectedCount: 1 },
    };

    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'HumanResources',
        descriptionIterations: [],
        tables: [
          makeTable('Employee', [
            makeColumn('BusinessEntityID', { isPrimaryKey: false, isCatalogPrimaryKey: false, isForeignKey: false, isCatalogForeignKey: false }),
            makeColumn('LoginID', { isPrimaryKey: false, isCatalogPrimaryKey: false }),
          ]),
        ],
      },
    ];

    const diff = DiffSchemas(priorState, liveSchemas);
    expect(diff.HasChanges).toBe(false);
    expect(diff.UnchangedTables).toEqual(['HumanResources.Employee']);
  });
});
