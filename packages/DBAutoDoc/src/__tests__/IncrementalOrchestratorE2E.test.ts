import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';
import { DBAutoDocAPI } from '../api/DBAutoDocAPI.js';
import { DBAutoDocConfig } from '../types/config.js';
import { DatabaseDocumentation, SchemaDefinition } from '../types/state.js';

const liveIntrospectedSchemas = vi.hoisted(() => ({ current: [] as SchemaDefinition[] }));
const executePromptMock = vi.hoisted(() => vi.fn());
const writtenFiles = vi.hoisted(() => new Map<string, string>());
const savedStates = vi.hoisted(() => [] as DatabaseDocumentation[]);

const mockDriver = vi.hoisted(() => ({
  getExistingDescriptions: vi.fn().mockResolvedValue([]),
  getColumnStatistics: vi.fn(async (_schema: string, _table: string, colName: string) => ({
    totalRows: 100,
    distinctCount: colName.toLowerCase().endsWith('id') ? 100 : 25,
    uniquenessRatio: colName.toLowerCase().endsWith('id') ? 1.0 : 0.25,
    nullCount: 0,
    nullPercentage: 0,
    sampleValues: [101, 102, 103],
  })),
  getColumnStatisticsForDiscovery: vi.fn(async () => ({
    columnName: 'ID',
    dataType: 'int',
    totalRows: 100,
    nullCount: 0,
    distinctCount: 100,
    sampleValues: [101, 102, 103],
  })),
  testValueOverlap: vi.fn(async (srcTable: string, srcCol: string, tgtTable: string, tgtCol: string) => {
    if (srcTable === 'dbo.Orders' && srcCol === 'PromoCampaignID' && tgtTable === 'dbo.PromoCampaigns' && tgtCol === 'PromoCampaignID') {
      return 1.0;
    }
    return 0;
  }),
  getSampleValues: vi.fn().mockResolvedValue([101, 102]),
  getColumnInfo: vi.fn().mockResolvedValue({ type: 'int' }),
  checkColumnCombinationUniqueness: vi.fn().mockResolvedValue(false),
  GetIndexes: vi.fn().mockResolvedValue([]),
  close: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../database/Database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database/Database.js')>();
  class DatabaseConnection {
    connect = vi.fn().mockResolvedValue(undefined);
    test = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
    getDriver = vi.fn().mockReturnValue(mockDriver);
    close = vi.fn().mockResolvedValue(undefined);
  }
  class Introspector {
    getSchemas = vi.fn(async () => structuredClone(liveIntrospectedSchemas.current));
    LoadIndexes = vi.fn().mockResolvedValue([]);
  }
  return {
    ...actual,
    DatabaseConnection,
    Introspector,
  };
});

vi.mock('../prompts/PromptEngine.js', () => {
  class PromptEngine {
    initialize = vi.fn().mockResolvedValue(undefined);
    setGuardrailCheck = vi.fn();
    executePrompt = executePromptMock;
  }
  return { PromptEngine };
});

vi.mock('../discovery/LLMSanityChecker.js', () => {
  class LLMSanityChecker {
    reviewCandidates = vi.fn().mockResolvedValue({
      invalidPKs: [],
      invalidFKs: [],
      Suggestions: [],
      tokensUsed: 0,
      InputTokens: 0,
      OutputTokens: 0,
    });
  }
  return { LLMSanityChecker };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn(async (p: string) => {
    const content = writtenFiles.get(p);
    if (!content) throw new Error(`ENOENT: ${p}`);
    return content;
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    writtenFiles.set(p, data);
    if (p.endsWith('state.json')) {
      savedStates.push(JSON.parse(data) as DatabaseDocumentation);
    }
  }),
  access: vi.fn(async (p: string) => {
    if (!writtenFiles.has(p)) throw new Error(`ENOENT: ${p}`);
  }),
}));

function buildConfig(): DBAutoDocConfig {
  return {
    version: '1.0.0',
    database: { server: 'localhost', database: 'ShopDB', user: 'sa', password: 'pw' },
    ai: { provider: 'gemini', model: 'gemini-flash', apiKey: 'test-key', temperature: 0.1 },
    analysis: {
      cardinalityThreshold: 20,
      sampleSize: 10,
      includeStatistics: true,
      includePatternAnalysis: true,
      convergence: { maxIterations: 3, stabilityWindow: 2, confidenceThreshold: 0.85 },
      backpropagation: { enabled: true, maxDepth: 2 },
      sanityChecks: { dependencyLevel: false, schemaLevel: false, crossSchema: false },
      relationshipDiscovery: {
        enabled: true,
        triggers: { runOnMissingPKs: true, runOnInsufficientFKs: true, fkDeficitThreshold: 0.4 },
        tokenBudget: { maxTokens: 50000 },
        confidence: { primaryKeyMinimum: 0.7, foreignKeyMinimum: 0.6, llmValidationThreshold: 0.8 },
        sampling: { maxRowsPerTable: 1000, statisticalSignificance: 100, valueOverlapSampleSize: 500 },
        patterns: { primaryKeyNames: ['.*[Ii][Dd]$'], foreignKeyNames: ['.*[Ii][Dd]$'], compositeKeyIndicators: [] },
        llmValidation: { enabled: false, batchSize: 5 },
        backpropagation: { enabled: true, maxIterations: 2 },
      },
    },
    output: {
      stateFile: '/virtual/out/state.json',
      outputDir: '/virtual/out',
      sqlFile: '/virtual/out/extended-props.sql',
      markdownFile: '/virtual/out/summary.md',
    },
    schemas: { exclude: ['sys'] },
    tables: { exclude: [] },
    plugins: [{ Name: 'IndexAdvisor', Enabled: false }],
  };
}

describe('AnalysisOrchestrator — End-to-End Incremental Schema Evolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writtenFiles.clear();
    savedStates.length = 0;
  });

  it('rejects specifying both resumeFromState and incrementalFromState', async () => {
    const orchestrator = new AnalysisOrchestrator({
      config: buildConfig(),
      resumeFromState: '/virtual/r1/state.json',
      incrementalFromState: '/virtual/r1/state.json',
    });
    const res = await orchestrator.Execute();
    expect(res.success).toBe(false);
    expect(res.message).toContain('Cannot specify both resumeFromState and incrementalFromState');
  });

  it('executes an end-to-end incremental run: delta-samples new columns, wires incoming FKs from existing tables to new tables, prunes dropped tables, and skips LLM calls on untouched tables', async () => {
    // Baseline state from Run 1: Customers, Products, Orders (with unresolved PromoCampaignID), and LegacyTemp
    const baselineState: DatabaseDocumentation = {
      version: '1.0.0',
      summary: {
        createdAt: '2026-01-01T00:00:00Z',
        lastModified: '2026-01-01T00:05:00Z',
        totalIterations: 2,
        totalPromptsRun: 4,
        totalInputTokens: 1000,
        totalOutputTokens: 400,
        totalTokens: 1400,
        estimatedCost: 0.01,
        totalSchemas: 1,
        totalTables: 4,
        totalColumns: 7,
      },
      database: { name: 'ShopDB', server: 'localhost', analyzedAt: '2026-01-01T00:00:00Z', provider: 'sqlserver' },
      phases: {
        dataSampling: { status: 'completed', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:00Z', sampledTables: 4, totalTables: 4 },
        descriptionGeneration: [],
        keyDetection: {
          triggered: true,
          triggerReason: 'both',
          triggerDetails: { tablesWithoutPK: 0, expectedFKs: 1, actualFKs: 1, fkDeficitPercentage: 0 },
          startedAt: '2026-01-01T00:01:00Z',
          completedAt: '2026-01-01T00:02:00Z',
          tokenBudget: { allocated: 50000, used: 0, remaining: 50000 },
          iterations: [],
          discovered: { primaryKeys: [], foreignKeys: [] },
          schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 100 },
          feedbackFromAnalysis: [],
          summary: { totalTablesAnalyzed: 4, tablesWithDiscoveredPKs: 0, relationshipsDiscovered: 0, averageConfidence: 100, highConfidenceCount: 0, mediumConfidenceCount: 0, lowConfidenceCount: 0, rejectedCount: 0 },
        },
      },
      schemas: [
        {
          name: 'dbo',
          descriptionIterations: [],
          tables: [
            {
              name: 'Customers',
              rowCount: 100,
              dependsOn: [],
              dependents: [{ schema: 'dbo', table: 'Orders', column: 'CustomerID', referencedColumn: 'CustomerID' }],
              description: 'Customer master records',
              descriptionIterations: [{ description: 'Customer master records', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.95 }],
              columns: [
                {
                  name: 'CustomerID',
                  dataType: 'int',
                  isNullable: false,
                  isPrimaryKey: true,
                  isCatalogPrimaryKey: true,
                  isForeignKey: false,
                  description: 'Customer PK',
                  descriptionIterations: [],
                  statistics: { totalRows: 100, distinctCount: 100, uniquenessRatio: 1, nullCount: 0, nullPercentage: 0, sampleValues: [1, 2, 3] },
                },
              ],
            },
            {
              name: 'Products',
              rowCount: 80,
              dependsOn: [],
              dependents: [],
              description: 'Product catalog',
              descriptionIterations: [{ description: 'Product catalog', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.94 }],
              columns: [
                {
                  name: 'ProductID',
                  dataType: 'int',
                  isNullable: false,
                  isPrimaryKey: true,
                  isCatalogPrimaryKey: true,
                  isForeignKey: false,
                  description: 'Product PK',
                  descriptionIterations: [],
                  statistics: { totalRows: 80, distinctCount: 80, uniquenessRatio: 1, nullCount: 0, nullPercentage: 0, sampleValues: [1, 2] },
                },
              ],
            },
            {
              name: 'Orders',
              rowCount: 500,
              dependsOn: [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID', constraintName: 'FK_Orders_Customers' }],
              dependents: [],
              description: 'Customer orders',
              descriptionIterations: [{ description: 'Customer orders', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.92 }],
              columns: [
                {
                  name: 'OrderID',
                  dataType: 'int',
                  isNullable: false,
                  isPrimaryKey: true,
                  isCatalogPrimaryKey: true,
                  isForeignKey: false,
                  descriptionIterations: [],
                  statistics: { totalRows: 500, distinctCount: 500, uniquenessRatio: 1, nullCount: 0, nullPercentage: 0, sampleValues: [10, 20] },
                },
                {
                  name: 'CustomerID',
                  dataType: 'int',
                  isNullable: false,
                  isPrimaryKey: false,
                  isForeignKey: true,
                  isCatalogForeignKey: true,
                  descriptionIterations: [],
                  statistics: { totalRows: 500, distinctCount: 90, uniquenessRatio: 0.18, nullCount: 0, nullPercentage: 0, sampleValues: [1, 2, 3] },
                },
                {
                  name: 'PromoCampaignID',
                  dataType: 'int',
                  isNullable: true,
                  isPrimaryKey: false,
                  isForeignKey: false,
                  descriptionIterations: [],
                  statistics: { totalRows: 500, distinctCount: 10, uniquenessRatio: 0.02, nullCount: 0, nullPercentage: 0, sampleValues: [101, 102, 103] },
                },
              ],
            },
            {
              name: 'LegacyTemp',
              rowCount: 10,
              dependsOn: [],
              dependents: [],
              description: 'Old temp table',
              descriptionIterations: [{ description: 'Old temp table', reasoning: 'r', generatedAt: '2026-01-01', modelUsed: 'm', confidence: 0.9 }],
              columns: [
                { name: 'TempID', dataType: 'int', isNullable: false, isPrimaryKey: true, isCatalogPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
              ],
            },
          ],
        },
      ],
    };

    const basePath = '/virtual/run-0/state.json';
    writtenFiles.set(basePath, JSON.stringify(baselineState));

    // Evolved live schema:
    //  - Products: UNCHANGED
    //  - Customers: UNCHANGED
    //  - Orders: UNCHANGED DDL, but its PromoCampaignID now matches newly added PromoCampaigns!
    //  - PromoCampaigns: ADDED (soft PK PromoCampaignID, soft column Title)
    //  - LegacyTemp: DROPPED
    liveIntrospectedSchemas.current = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          {
            name: 'Customers',
            rowCount: 100,
            dependsOn: [],
            dependents: [{ schema: 'dbo', table: 'Orders', column: 'CustomerID', referencedColumn: 'CustomerID' }],
            descriptionIterations: [],
            columns: [{ name: 'CustomerID', dataType: 'int', isNullable: false, isPrimaryKey: true, isCatalogPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }],
          },
          {
            name: 'Products',
            rowCount: 80,
            dependsOn: [],
            dependents: [],
            descriptionIterations: [],
            columns: [{ name: 'ProductID', dataType: 'int', isNullable: false, isPrimaryKey: true, isCatalogPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }],
          },
          {
            name: 'Orders',
            rowCount: 500,
            dependsOn: [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID', constraintName: 'FK_Orders_Customers' }],
            dependents: [],
            descriptionIterations: [],
            columns: [
              { name: 'OrderID', dataType: 'int', isNullable: false, isPrimaryKey: true, isCatalogPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
              { name: 'CustomerID', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true, isCatalogForeignKey: true, descriptionIterations: [] },
              { name: 'PromoCampaignID', dataType: 'int', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
            ],
          },
          {
            name: 'PromoCampaigns',
            rowCount: 20,
            dependsOn: [],
            dependents: [],
            descriptionIterations: [],
            columns: [
              { name: 'PromoCampaignID', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
              { name: 'Title', dataType: 'nvarchar', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
            ],
          },
        ],
      },
    ];

    const analyzedTables: string[] = [];
    executePromptMock.mockImplementation(async (promptName: string, ctx: Record<string, unknown>) => {
      if (promptName === 'table-analysis') {
        const key = `${ctx['schema']}.${ctx['table']}`;
        analyzedTables.push(key);
        return {
          success: true,
          tokensUsed: 120,
          inputTokens: 80,
          outputTokens: 40,
          result: {
            tableDescription: key === 'dbo.PromoCampaigns'
              ? 'Promotional marketing campaigns'
              : 'Customer orders optionally attributed to promotional campaigns',
            reasoning: 'incremental analysis',
            confidence: 0.94,
            columnDescriptions: [],
            parentTableInsights: [],
          },
        };
      }
      if (promptName === 'semantic-comparison') {
        return {
          success: true,
          tokensUsed: 30,
          inputTokens: 20,
          outputTokens: 10,
          result: {
            tableMateriallyChanged: true,
            tableChangeReasoning: 'Added promo campaign relationship',
            columnChanges: [],
          },
        };
      }
      return { success: true, tokensUsed: 0, result: [] };
    });

    const orchestrator = new AnalysisOrchestrator({
      config: buildConfig(),
      incrementalFromState: basePath,
    });
    // Stub LLMSanityChecker network call inside DiscoveryEngine via prototype if needed;
    // sanityChecker handles errors gracefully or we let DiscoveryEngine run.
    const result = await orchestrator.Execute();

    expect(result.success).toBe(true);
    const finalState = result.state;

    // 1. LegacyTemp was removed; 4 tables survive (Customers, Products, Orders, PromoCampaigns)
    expect(finalState.schemas[0].tables.map((t) => t.name)).toEqual([
      'Customers',
      'Products',
      'Orders',
      'PromoCampaigns',
    ]);

    // 2. Delta sampling ONLY sampled PromoCampaigns's 2 columns (Customers, Products, Orders reused stats!)
    expect(mockDriver.getColumnStatistics).toHaveBeenCalledTimes(2);
    expect(finalState.phases.incremental?.SampledColumnsCount).toBe(2);

    // 3. Discovery found PromoCampaigns.PromoCampaignID as PK AND wired Orders.PromoCampaignID -> PromoCampaigns.PromoCampaignID!
    const promoTable = finalState.schemas[0].tables.find((t) => t.name === 'PromoCampaigns')!;
    expect(promoTable.columns[0].isPrimaryKey).toBe(true);

    const ordersTable = finalState.schemas[0].tables.find((t) => t.name === 'Orders')!;
    const promoFKCol = ordersTable.columns.find((c) => c.name === 'PromoCampaignID')!;
    expect(promoFKCol.isForeignKey).toBe(true);
    expect(promoFKCol.foreignKeyReferences?.table).toBe('PromoCampaigns');

    // 4. LLM table-analysis ran ONLY on PromoCampaigns (added) and Orders (relationship-affected)!
    //    Customers and Products were completely skipped (0 LLM calls) and kept their Run 1 descriptions!
    expect(analyzedTables).toEqual(['dbo.PromoCampaigns', 'dbo.Orders']);
    expect(finalState.phases.incremental?.TablesAnalyzedCount).toBe(2);
    expect(finalState.phases.incremental?.TablesSkippedUnchangedCount).toBe(2);

    const productsTable = finalState.schemas[0].tables.find((t) => t.name === 'Products')!;
    expect(productsTable.description).toBe('Product catalog');

    // 5. Generated additionalSchemaInfo.json includes the newly discovered cross-table soft PK & FK!
    const schemaInfoJson = writtenFiles.get('/virtual/out/run-1/additionalSchemaInfo.json');
    expect(schemaInfoJson).toBeDefined();
    const schemaInfo = JSON.parse(schemaInfoJson!);
    const ordersInfo = schemaInfo['dbo'].find((t: { TableName: string }) => t.TableName === 'Orders');
    expect(ordersInfo.ForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          FieldName: 'PromoCampaignID',
          RelatedTable: 'PromoCampaigns',
          RelatedField: 'PromoCampaignID',
        }),
      ]),
    );
  });

  it('exposes AnalyzeIncremental on DBAutoDocAPI and returns a clean error when baseline state is missing', async () => {
    const api = new DBAutoDocAPI();
    const res = await api.AnalyzeIncremental('/virtual/does-not-exist/state.json', {
      database: { server: 'localhost', database: 'ShopDB', user: 'sa', password: 'pw' },
      ai: { provider: 'gemini', model: 'gemini-flash', apiKey: 'test-key' },
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Baseline state file not found');
  });
});
