import { describe, it, expect, vi } from 'vitest';
import { DiffSchemas } from '../incremental/SchemaDiffer.js';
import { MergeIncrementalState } from '../incremental/IncrementalStateMerger.js';
import { DiscoveryEngine } from '../discovery/DiscoveryEngine.js';
import { DiscoveryTriggerAnalyzer } from '../discovery/DiscoveryTriggerAnalyzer.js';
import { StateManager } from '../state/StateManager.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { AIConfig, RelationshipDiscoveryConfig } from '../types/config.js';
import {
  ColumnDefinition,
  ColumnStatistics,
  DatabaseDocumentation,
  SchemaDefinition,
  TableDefinition,
} from '../types/state.js';

function stats(totalRows: number, distinctCount: number, sampleValues: Array<string | number> = [1, 2, 3]): ColumnStatistics {
  return {
    totalRows,
    distinctCount,
    uniquenessRatio: totalRows > 0 ? distinctCount / totalRows : 0,
    nullCount: 0,
    nullPercentage: 0,
    sampleValues,
  };
}

function col(name: string, dataType: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name,
    dataType,
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides,
  };
}

function tbl(name: string, columns: ColumnDefinition[], rowCount = 100): TableDefinition {
  return {
    name,
    rowCount,
    dependsOn: [],
    dependents: [],
    columns,
    descriptionIterations: [],
  };
}

function discoveryConfig(): RelationshipDiscoveryConfig {
  return {
    enabled: true,
    triggers: { runOnMissingPKs: true, runOnInsufficientFKs: true, fkDeficitThreshold: 0.4 },
    tokenBudget: { maxTokens: 50000 },
    confidence: { primaryKeyMinimum: 0.7, foreignKeyMinimum: 0.6, llmValidationThreshold: 0.8 },
    sampling: { maxRowsPerTable: 1000, statisticalSignificance: 100, valueOverlapSampleSize: 500 },
    patterns: { primaryKeyNames: ['.*[Ii][Dd]$', '^id$'], foreignKeyNames: ['.*[Ii][Dd]$'], compositeKeyIndicators: [] },
    llmValidation: { enabled: false, batchSize: 5 },
    backpropagation: { enabled: true, maxIterations: 3 },
  };
}

const aiConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-test',
  apiKey: 'fake-key',
};

describe('IncrementalStateMerger & Bidirectional Discovery', () => {
  it('discovers incoming FKs from UNCHANGED existing tables to NEWLY ADDED tables (S_old x T_delta) with zero redundant probes on unchanged pairs', async () => {
    const sm = new StateManager('/tmp/s.json');
    const priorState = sm.createInitialState('ShopDB', 'localhost');

    // Run 1 had Customers and Orders (where Orders.PromoCampaignID had no target table yet!)
    const priorCustomers = tbl('Customers', [
      col('CustomerID', 'int', {
        isPrimaryKey: true,
        isCatalogPrimaryKey: false,
        statistics: stats(100, 100, [1, 2, 3]),
        description: 'Primary customer key',
      }),
    ]);
    priorCustomers.description = 'Registered customers';
    priorCustomers.descriptionIterations = [{ description: 'Registered customers', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.92 }];

    const priorOrders = tbl('Orders', [
      col('OrderID', 'int', {
        isPrimaryKey: true,
        isCatalogPrimaryKey: false,
        statistics: stats(500, 500, [10, 20, 30]),
      }),
      col('CustomerID', 'int', {
        isForeignKey: true,
        isCatalogForeignKey: false,
        foreignKeyReferences: { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' },
        statistics: stats(500, 80, [1, 2, 3]),
      }),
      col('PromoCampaignID', 'int', {
        isNullable: true,
        statistics: stats(500, 12, [101, 102, 103]),
        description: 'Unresolved promo reference',
      }),
    ], 500);
    priorOrders.dependsOn = [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' }];
    priorCustomers.dependents = [{ schema: 'dbo', table: 'Orders', column: 'CustomerID', referencedColumn: 'CustomerID' }];
    priorOrders.description = 'Customer orders';
    priorOrders.descriptionIterations = [{ description: 'Customer orders', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.9 }];

    priorState.schemas = [{ name: 'dbo', tables: [priorCustomers, priorOrders], descriptionIterations: [] }];
    priorState.phases.keyDetection = {
      triggered: true,
      triggerReason: 'missing_pks',
      triggerDetails: { tablesWithoutPK: 2, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 1 },
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      tokenBudget: { allocated: 50000, used: 0, remaining: 50000 },
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
            evidence: { uniqueness: 1, nullCount: 0, totalRows: 500, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
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
            confidence: 95,
            evidence: { namingMatch: 1, valueOverlap: 1, cardinalityRatio: 0.8, dataTypeMatch: true, nullPercentage: 0, sampleSize: 500, orphanCount: 0, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'confirmed',
          },
        ],
      },
      schemaEnhancements: { pkeysAdded: 2, fkeysAdded: 1, overallConfidence: 95 },
      feedbackFromAnalysis: [],
      summary: { totalTablesAnalyzed: 2, tablesWithDiscoveredPKs: 2, relationshipsDiscovered: 1, averageConfidence: 95, highConfidenceCount: 3, mediumConfidenceCount: 0, lowConfidenceCount: 0, rejectedCount: 0 },
    };

    // Run 2 live catalog: Customers and Orders are UNCHANGED; PromoCampaigns is ADDED!
    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          tbl('Customers', [col('CustomerID', 'int')]),
          tbl('Orders', [
            col('OrderID', 'int'),
            col('CustomerID', 'int'),
            col('PromoCampaignID', 'int', { isNullable: true }),
          ], 500),
          tbl('PromoCampaigns', [
            // Pre-populate statistics as delta sampling would right before discovery
            col('PromoCampaignID', 'int', { statistics: stats(20, 20, [101, 102, 103]) }),
            col('CampaignName', 'nvarchar', { statistics: stats(20, 20, ['Fall', 'Spring']) }),
          ], 20),
        ],
      },
    ];

    const diff = DiffSchemas(priorState, liveSchemas);
    expect(diff.AddedTables).toEqual(['dbo.PromoCampaigns']);
    expect(diff.UnchangedTables).toEqual(['dbo.Customers', 'dbo.Orders']);

    const { State: mergedState, DiscoveryScope: scope } = MergeIncrementalState(priorState, liveSchemas, diff, {
      BaseStateFile: '/tmp/s.json',
    });

    // Only PromoCampaigns needs PK detection!
    expect(Array.from(scope.PKTablesToAnalyze)).toEqual(['dbo.PromoCampaigns']);

    const testValueOverlap = vi.fn(async (srcTable: string, srcCol: string, tgtTable: string, tgtCol: string) => {
      if (srcTable === 'dbo.Orders' && srcCol === 'PromoCampaignID' && tgtTable === 'dbo.PromoCampaigns' && tgtCol === 'PromoCampaignID') {
        return 1.0;
      }
      return 0;
    });
    const getColumnStatsSpy = vi.fn();

    const mockDriver = {
      testValueOverlap,
      getColumnStatisticsForDiscovery: getColumnStatsSpy,
      getSampleValues: vi.fn().mockResolvedValue([]),
      getColumnInfo: vi.fn().mockResolvedValue({ type: 'int' }),
      checkColumnCombinationUniqueness: vi.fn().mockResolvedValue(false),
    } as unknown as BaseAutoDocDriver;

    const cfg = discoveryConfig();
    const engine = new DiscoveryEngine({
      Driver: mockDriver,
      Config: cfg,
      AiConfig: aiConfig,
      schemas: mergedState.schemas,
    });
    // Disable LLM sanity checker for deterministic unit test
    (engine as unknown as { sanityChecker?: undefined }).sanityChecker = undefined;

    const trigger = DiscoveryTriggerAnalyzer.analyzeSchemas(mergedState.schemas);
    const res = await engine.DiscoverIncremental(50000, trigger, scope);
    engine.ApplyDiscoveriesToState(mergedState, res.Phase);

    // 0 stats queries to DB because ColumnStatsCache seeded all 3 tables from column.statistics!
    expect(getColumnStatsSpy).not.toHaveBeenCalled();

    // Crucially: Orders.CustomerID -> Customers.CustomerID was NEVER re-probed!
    expect(testValueOverlap).not.toHaveBeenCalledWith(
      'dbo.Orders',
      'CustomerID',
      'dbo.Customers',
      'CustomerID',
      expect.anything(),
    );

    // Orders.PromoCampaignID -> PromoCampaigns.PromoCampaignID WAS probed and discovered!
    expect(testValueOverlap).toHaveBeenCalledWith(
      'dbo.Orders',
      'PromoCampaignID',
      'dbo.PromoCampaigns',
      'PromoCampaignID',
      500,
    );

    const orders = mergedState.schemas[0].tables.find((t) => t.name === 'Orders')!;
    const promoCol = orders.columns.find((c) => c.name === 'PromoCampaignID')!;
    expect(promoCol.isForeignKey).toBe(true);
    expect(promoCol.foreignKeyReferences?.table).toBe('PromoCampaigns');
    expect(orders.dependsOn).toHaveLength(2);
    expect(scope.DirtyFKPruningTables.has('dbo.Orders')).toBe(true);
    expect(scope.DirtyFKPruningTables.has('dbo.Customers')).toBe(false);
  });

  it('prunes stale FKs when a target table is dropped and re-binds the orphaned source column to a replacement table', async () => {
    const sm = new StateManager('/tmp/s2.json');
    const priorState = sm.createInitialState('ShopDB', 'localhost');

    const priorCustOld = tbl('CustomerLegacy', [
      col('CustomerID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: false, statistics: stats(50, 50, [1, 2]) }),
    ], 50);
    const priorOrders = tbl('Orders', [
      col('OrderID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true, statistics: stats(200, 200, [10, 20]) }),
      col('CustomerID', 'int', {
        isForeignKey: true,
        isCatalogForeignKey: false,
        foreignKeyReferences: { schema: 'dbo', table: 'CustomerLegacy', column: 'CustomerID', referencedColumn: 'CustomerID' },
        statistics: stats(200, 45, [1, 2]),
      }),
    ], 200);
    priorOrders.dependsOn = [{ schema: 'dbo', table: 'CustomerLegacy', column: 'CustomerID', referencedColumn: 'CustomerID' }];
    priorState.schemas = [{ name: 'dbo', tables: [priorCustOld, priorOrders], descriptionIterations: [] }];
    priorState.phases.keyDetection = {
      triggered: true,
      triggerReason: 'both',
      triggerDetails: { tablesWithoutPK: 1, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 1 },
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      tokenBudget: { allocated: 10000, used: 0, remaining: 10000 },
      iterations: [],
      discovered: {
        primaryKeys: [{
          schemaName: 'dbo',
          tableName: 'CustomerLegacy',
          columnNames: ['CustomerID'],
          confidence: 95,
          evidence: { uniqueness: 1, nullCount: 0, totalRows: 50, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
          discoveredInIteration: 1,
          validatedByLLM: true,
          status: 'confirmed',
        }],
        foreignKeys: [{
          schemaName: 'dbo',
          sourceTable: 'Orders',
          sourceColumn: 'CustomerID',
          targetSchema: 'dbo',
          targetTable: 'CustomerLegacy',
          targetColumn: 'CustomerID',
          confidence: 92,
          evidence: { namingMatch: 1, valueOverlap: 1, cardinalityRatio: 0.9, dataTypeMatch: true, nullPercentage: 0, sampleSize: 200, orphanCount: 0, warnings: [] },
          discoveredInIteration: 1,
          validatedByLLM: true,
          status: 'confirmed',
        }],
      },
      schemaEnhancements: { pkeysAdded: 1, fkeysAdded: 1, overallConfidence: 93 },
      feedbackFromAnalysis: [],
      summary: { totalTablesAnalyzed: 2, tablesWithDiscoveredPKs: 1, relationshipsDiscovered: 1, averageConfidence: 93, highConfidenceCount: 2, mediumConfidenceCount: 0, lowConfidenceCount: 0, rejectedCount: 0 },
    };

    // CustomerLegacy is dropped and CustomerAccount (existing or newly added) has CustomerID!
    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          tbl('CustomerAccount', [
            col('CustomerID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true, statistics: stats(50, 50, [1, 2]) }),
          ], 50),
          tbl('Orders', [
            col('OrderID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
            col('CustomerID', 'int'),
          ], 200),
        ],
      },
    ];

    const diff = DiffSchemas(priorState, liveSchemas);
    expect(diff.RemovedTables).toEqual(['dbo.CustomerLegacy']);
    expect(diff.AddedTables).toEqual(['dbo.CustomerAccount']);

    const { State: mergedState, DiscoveryScope: scope } = MergeIncrementalState(priorState, liveSchemas, diff, {
      BaseStateFile: '/tmp/s2.json',
    });

    expect(scope.StalePKsRemoved).toBe(1);
    expect(scope.StaleFKsRemoved).toBe(1);
    // Orders.CustomerID was orphaned and placed in FullFKSourceColumnsByTable!
    expect(scope.FullFKSourceColumnsByTable.get('dbo.Orders')?.has('customerid')).toBe(true);

    // And stale CustomerLegacy FK is NOT on Orders anymore
    const ordersBefore = mergedState.schemas[0].tables.find((t) => t.name === 'Orders')!;
    expect(ordersBefore.dependsOn).toHaveLength(0);

    const mockDriver = {
      testValueOverlap: vi.fn().mockResolvedValue(1.0),
      getColumnStatisticsForDiscovery: vi.fn(),
      getSampleValues: vi.fn().mockResolvedValue([]),
      getColumnInfo: vi.fn().mockResolvedValue({ type: 'int' }),
      checkColumnCombinationUniqueness: vi.fn().mockResolvedValue(false),
    } as unknown as BaseAutoDocDriver;

    // Notice: CustomerAccount has a catalog-declared PK, and DiscoverIncremental automatically
    // includes catalog PKs in FK target matching without needing manual seeding!
    const engine = new DiscoveryEngine({
      Driver: mockDriver,
      Config: discoveryConfig(),
      AiConfig: aiConfig,
      schemas: mergedState.schemas,
    });
    (engine as unknown as { sanityChecker?: undefined }).sanityChecker = undefined;

    const trigger = DiscoveryTriggerAnalyzer.analyzeSchemas(mergedState.schemas);
    const res = await engine.DiscoverIncremental(50000, trigger, scope);
    engine.ApplyDiscoveriesToState(mergedState, res.Phase);

    const ordersAfter = mergedState.schemas[0].tables.find((t) => t.name === 'Orders')!;
    expect(ordersAfter.dependsOn).toEqual([
      { schema: 'dbo', table: 'CustomerAccount', column: 'CustomerID', referencedColumn: 'CustomerID' },
    ]);
  });
});
