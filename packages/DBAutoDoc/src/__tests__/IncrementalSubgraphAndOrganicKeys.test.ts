import { describe, it, expect, vi } from 'vitest';
import { DiffSchemas } from '../incremental/SchemaDiffer.js';
import { MergeIncrementalState } from '../incremental/IncrementalStateMerger.js';
import { IncrementalAnalysisTracker } from '../incremental/IncrementalAnalysisTracker.js';
import {
  BuildUpdatedNormalizationCache,
  ComputeTableNormalizationFingerprint,
  EmbedNormalizedColumnsWithCache,
  PartitionTableNormalizations,
} from '../incremental/OrganicKeyCache.js';
import { TopologicalSorter } from '../database/TopologicalSorter.js';
import { AnalysisEngine } from '../core/AnalysisEngine.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { NormalizedColumn, TableNormalizationInput } from '../discovery/ColumnNormalizer.js';
import { DBAutoDocConfig } from '../types/config.js';
import { ColumnDefinition, DatabaseDocumentation, SchemaDefinition, TableDefinition } from '../types/state.js';

function makeCol(name: string, dataType = 'int', overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
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

function makeTbl(name: string, columns: ColumnDefinition[], desc?: string): TableDefinition {
  return {
    name,
    rowCount: 100,
    dependsOn: [],
    dependents: [],
    columns,
    description: desc,
    descriptionIterations: desc
      ? [{ description: desc, reasoning: 'prior', generatedAt: '2026-01-01', modelUsed: 'test', confidence: 0.92 }]
      : [],
  };
}

function makeConfig(): DBAutoDocConfig {
  return {
    version: '1.0.0',
    database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pw' },
    ai: {
      provider: 'gemini',
      model: 'gemini-flash',
      apiKey: 'key',
      modelOverrides: { fkPruning: { model: 'gemini-pro' } },
    },
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
        backpropagation: { enabled: true, maxIterations: 3 },
      },
    },
    output: { stateFile: '/tmp/state.json', outputDir: '/tmp/out', sqlFile: '/tmp/out.sql', markdownFile: '/tmp/out.md' },
    schemas: {},
    tables: {},
  };
}

function buildThreeTableState(): DatabaseDocumentation {
  const sm = new StateManager('/tmp/base.json');
  const state = sm.createInitialState('TestDB', 'localhost');
  const customers = makeTbl('Customers', [makeCol('CustomerID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true })], 'Core customer master records');
  const products = makeTbl('Products', [makeCol('ProductID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true })], 'Catalog of sellable products');
  const orders = makeTbl(
    'Orders',
    [
      makeCol('OrderID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
      makeCol('CustomerID', 'int', { isForeignKey: true, isCatalogForeignKey: true }),
    ],
    'Sales orders placed by customers',
  );
  orders.dependsOn = [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID', constraintName: 'FK_Orders_Customers' }];
  customers.dependents = [{ schema: 'dbo', table: 'Orders', column: 'CustomerID', referencedColumn: 'CustomerID' }];
  state.schemas = [{ name: 'dbo', tables: [customers, products, orders], descriptionIterations: [] }];
  return state;
}

describe('IncrementalAnalysisTracker & AnalysisEngine Subgraph Execution', () => {
  it('propagates material parent description changes to child tables in the SAME topological pass while skipping unrelated tables', async () => {
    const priorState = buildThreeTableState();

    // Modify Customers (add LoyaltyTier column); Products and Orders have ZERO DDL changes
    const liveSchemas: SchemaDefinition[] = [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          makeTbl('Customers', [
            makeCol('CustomerID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
            makeCol('LoyaltyTier', 'nvarchar'),
          ]),
          makeTbl('Products', [makeCol('ProductID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true })]),
          (() => {
            const o = makeTbl('Orders', [
              makeCol('OrderID', 'int', { isPrimaryKey: true, isCatalogPrimaryKey: true }),
              makeCol('CustomerID', 'int', { isForeignKey: true, isCatalogForeignKey: true }),
            ]);
            o.dependsOn = [{ schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID', constraintName: 'FK_Orders_Customers' }];
            return o;
          })(),
        ],
      },
    ];
    liveSchemas[0].tables[0].dependents = [{ schema: 'dbo', table: 'Orders', column: 'CustomerID', referencedColumn: 'CustomerID' }];

    const diff = DiffSchemas(priorState, liveSchemas);
    const { State: merged } = MergeIncrementalState(priorState, liveSchemas, diff, { BaseStateFile: '/tmp/base.json' });
    const { nodes, levels } = new TopologicalSorter().BuildAndSort(merged.schemas);

    const tracker = new IncrementalAnalysisTracker({
      PreviousState: priorState,
      CurrentState: merged,
      Diff: diff,
      Nodes: nodes,
      ConfidenceThreshold: 0.85,
    });
    expect(tracker.InitialDirtyCount).toBe(1); // Only dbo.Customers initially!

    const analyzedPrompts: string[] = [];
    const executePrompt = vi.fn(async (promptName: string, ctx: Record<string, unknown>) => {
      if (promptName === 'table-analysis') {
        const key = `${ctx['schema']}.${ctx['table']}`;
        analyzedPrompts.push(key);
        return {
          success: true,
          tokensUsed: 100,
          inputTokens: 70,
          outputTokens: 30,
          result: {
            tableDescription: key === 'dbo.Customers' ? 'Customers and B2B loyalty members' : 'Orders linked to loyalty members',
            reasoning: 'updated',
            confidence: 0.93,
            columnDescriptions: [],
            parentTableInsights: [],
          },
        };
      }
      if (promptName === 'semantic-comparison') {
        return {
          success: true,
          tokensUsed: 40,
          inputTokens: 30,
          outputTokens: 10,
          result: {
            // Customers materially changed -> wakes up Orders at level 1!
            tableMateriallyChanged: ctx['tableName'] === 'Customers',
            tableChangeReasoning: 'Loyalty program added',
            columnChanges: [],
          },
        };
      }
      throw new Error(`Unexpected prompt: ${promptName}`);
    });

    const mockPromptEngine = {
      executePrompt,
      setGuardrailCheck: vi.fn(),
    } as unknown as PromptEngine;

    const sm = new StateManager('/tmp/run2.json');
    vi.spyOn(sm, 'save').mockResolvedValue(undefined);
    const itTracker = new IterationTracker();
    const engine = new AnalysisEngine(makeConfig(), mockPromptEngine, sm, itTracker);
    engine.SetIncrementalTracker(tracker, nodes);

    const run = sm.createAnalysisRun(merged, 'gemini-flash', 'gemini', 0.1);
    itTracker.incrementIteration(merged, run);

    for (let lvl = 0; lvl < levels.length; lvl++) {
      await engine.ProcessLevel(merged, run, lvl, levels[lvl]);
    }

    // Customers (level 0) materially changed -> Orders (level 1) was woken up and analyzed; Products (level 0) was skipped!
    expect(analyzedPrompts).toEqual(['dbo.Customers', 'dbo.Orders']);
    expect(tracker.PropagatedTablesCount).toBe(1);
    expect(tracker.TablesSkippedCount).toBe(1); // dbo.Products
    // Both achieved confidence 0.93 >= 0.85, so 0 tables need Iteration 2!
    expect(tracker.AdvanceToNextIteration()).toBe(false);
  });

  it('does NOT wake child tables when modified parent description did NOT materially change', async () => {
    const priorState = buildThreeTableState();
    const liveSchemas: SchemaDefinition[] = structuredClone(priorState.schemas);
    liveSchemas[0].tables[0].columns.push(makeCol('InternalNote', 'nvarchar', { isNullable: true }));

    const diff = DiffSchemas(priorState, liveSchemas);
    const { State: merged } = MergeIncrementalState(priorState, liveSchemas, diff, { BaseStateFile: '/tmp/base.json' });
    const { nodes, levels } = new TopologicalSorter().BuildAndSort(merged.schemas);

    const tracker = new IncrementalAnalysisTracker({
      PreviousState: priorState,
      CurrentState: merged,
      Diff: diff,
      Nodes: nodes,
      ConfidenceThreshold: 0.85,
    });

    const analyzedPrompts: string[] = [];
    const mockPromptEngine = {
      setGuardrailCheck: vi.fn(),
      executePrompt: vi.fn(async (promptName: string, ctx: Record<string, unknown>) => {
        if (promptName === 'table-analysis') {
          analyzedPrompts.push(`${ctx['schema']}.${ctx['table']}`);
          return {
            success: true,
            tokensUsed: 80,
            result: { tableDescription: 'Core customer master records', reasoning: 'same', confidence: 0.95, columnDescriptions: [] },
          };
        }
        return {
          success: true,
          tokensUsed: 30,
          result: { tableMateriallyChanged: false, tableChangeReasoning: 'Minor note column only', columnChanges: [] },
        };
      }),
    } as unknown as PromptEngine;

    const sm = new StateManager('/tmp/run3.json');
    vi.spyOn(sm, 'save').mockResolvedValue(undefined);
    const itTracker = new IterationTracker();
    const engine = new AnalysisEngine(makeConfig(), mockPromptEngine, sm, itTracker);
    engine.SetIncrementalTracker(tracker, nodes);

    const run = sm.createAnalysisRun(merged, 'gemini-flash', 'gemini', 0.1);
    itTracker.incrementIteration(merged, run);
    for (let lvl = 0; lvl < levels.length; lvl++) {
      await engine.ProcessLevel(merged, run, lvl, levels[lvl]);
    }

    // ONLY Customers ran; neither Products nor Orders was touched!
    expect(analyzedPrompts).toEqual(['dbo.Customers']);
    expect(tracker.PropagatedTablesCount).toBe(0);
    expect(tracker.TablesSkippedCount).toBe(2);
  });

  it('scopes FK pruning to dirty tables only and unflags rejected soft FKs from schema columns', async () => {
    const state = buildThreeTableState();
    const orders = state.schemas[0].tables.find((t) => t.name === 'Orders')!;
    const products = state.schemas[0].tables.find((t) => t.name === 'Products')!;
    products.columns.push(makeCol('BadRefID', 'int', {
      isForeignKey: true,
      isCatalogForeignKey: false,
      foreignKeyReferences: { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' },
    }));
    products.dependsOn.push({ schema: 'dbo', table: 'Customers', column: 'BadRefID', referencedColumn: 'CustomerID' });

    state.phases.keyDetection = {
      triggered: true,
      triggerReason: 'insufficient_fks',
      triggerDetails: { tablesWithoutPK: 0, expectedFKs: 2, actualFKs: 1, fkDeficitPercentage: 0.5 },
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      tokenBudget: { allocated: 10000, used: 0, remaining: 10000 },
      iterations: [],
      discovered: {
        primaryKeys: [],
        foreignKeys: [
          {
            // Surviving candidate on Orders (already evaluated in Run 1, confidence 78 < 90)
            schemaName: 'dbo',
            sourceTable: 'Orders',
            sourceColumn: 'CustomerID',
            targetSchema: 'dbo',
            targetTable: 'Customers',
            targetColumn: 'CustomerID',
            confidence: 78,
            evidence: { namingMatch: 1, valueOverlap: 1, cardinalityRatio: 1, dataTypeMatch: true, nullPercentage: 0, sampleSize: 100, orphanCount: 0, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: true,
            status: 'candidate',
          },
          {
            // Newly discovered candidate on Products (dirty table)
            schemaName: 'dbo',
            sourceTable: 'Products',
            sourceColumn: 'BadRefID',
            targetSchema: 'dbo',
            targetTable: 'Customers',
            targetColumn: 'CustomerID',
            confidence: 65,
            evidence: { namingMatch: 0.6, valueOverlap: 0.8, cardinalityRatio: 1, dataTypeMatch: true, nullPercentage: 0, sampleSize: 100, orphanCount: 20, warnings: [] },
            discoveredInIteration: 1,
            validatedByLLM: false,
            status: 'candidate',
          },
        ],
      },
      schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 72 },
      feedbackFromAnalysis: [],
      summary: { totalTablesAnalyzed: 3, tablesWithDiscoveredPKs: 0, relationshipsDiscovered: 2, averageConfidence: 72, highConfidenceCount: 0, mediumConfidenceCount: 2, lowConfidenceCount: 0, rejectedCount: 0 },
    };

    const prunedTables: string[] = [];
    const mockPromptEngine = {
      setGuardrailCheck: vi.fn(),
      executePrompt: vi.fn(async (promptName: string, ctx: Record<string, unknown>) => {
        if (promptName === 'fk-pruning-table') {
          prunedTables.push(`${ctx['sourceSchema']}.${ctx['sourceTable']}`);
          return {
            success: true,
            tokensUsed: 50,
            result: [{ index: 1, action: 'remove', reasoning: 'False positive join' }],
          };
        }
        return {
          success: true,
          tokensUsed: 50,
          result: [{ index: 1, action: 'remove', reasoning: 'Confirmed false positive' }],
        };
      }),
    } as unknown as PromptEngine;

    const sm = new StateManager('/tmp/prune.json');
    vi.spyOn(sm, 'save').mockResolvedValue(undefined);
    const engine = new AnalysisEngine(makeConfig(), mockPromptEngine, sm, new IterationTracker());
    const run = sm.createAnalysisRun(state, 'gemini-flash', 'gemini', 0.1);

    const res = await engine.PruneForeignKeys(state, run, new Set(['dbo.Products']));
    expect(prunedTables).toEqual(['dbo.Products']); // Orders was NOT re-pruned!
    expect(res.removed).toBe(1);
    expect(orders.columns[1].isForeignKey).toBe(true); // Untouched

    const badCol = products.columns.find((c) => c.name === 'BadRefID')!;
    expect(badCol.isForeignKey).toBe(false);
    expect(badCol.foreignKeyReferences).toBeUndefined();
    expect(products.dependsOn).toHaveLength(0);
  });
});

describe('OrganicKeyCache — Per-Table Normalization & Embedding Reuse', () => {
  it('reuses cached table normalizations and embeddings for clean tables and invalidates modified tables', async () => {
    const crmContacts: TableNormalizationInput = {
      schema: 'crm',
      SchemaDescription: 'CRM system',
      table: 'Contacts',
      TableDescription: 'Customer contacts',
      columns: [
        {
          schema: 'crm',
          table: 'Contacts',
          Column: 'EmailAddress',
          dataType: 'nvarchar(255)',
          OriginalDescription: 'Primary contact email',
          SampleValues: ['a@b.com', 'c@d.com'],
          ParticipatesInFK: false,
          FkTarget: null,
          isPrimaryKey: false,
        },
      ],
    };

    const billingUsers: TableNormalizationInput = {
      schema: 'billing',
      SchemaDescription: 'Billing system',
      table: 'Subscribers',
      TableDescription: 'Billing subscribers',
      columns: [
        {
          schema: 'billing',
          table: 'Subscribers',
          Column: 'SubscriberEmail',
          dataType: 'varchar(200)',
          OriginalDescription: 'Subscriber email',
          SampleValues: ['a@b.com', 'x@y.com'],
          ParticipatesInFK: false,
          FkTarget: null,
          isPrimaryKey: false,
        },
      ],
    };

    const normalizedRun1: NormalizedColumn[] = [
      {
        ...crmContacts.columns[0],
        ConceptName: 'email_address',
        NormalizationStrategy: 'LowerCaseTrim',
        NormalizedDescription: 'RFC-5322 email address identifying a natural person; lowercase trim.',
        IsUsefulOrganicKey: true,
        confidence: 0.96,
        reasoning: 'Shared email',
      },
      {
        ...billingUsers.columns[0],
        ConceptName: 'email_address',
        NormalizationStrategy: 'LowerCaseTrim',
        NormalizedDescription: 'RFC-5322 email address identifying a natural person; lowercase trim.',
        IsUsefulOrganicKey: true,
        confidence: 0.95,
        reasoning: 'Shared email',
      },
    ];

    const textsRun1 = ['email_address. text 1', 'email_address. text 2'];
    const vecsRun1 = [new Float32Array([0.6, 0.8]), new Float32Array([0.6, 0.8])];
    const rejectedRun1 = new Map<string, number>([
      ['crm.contacts', 0],
      ['billing.subscribers', 0],
    ]);

    const cacheAfterRun1 = BuildUpdatedNormalizationCache(
      [crmContacts, billingUsers],
      normalizedRun1,
      textsRun1,
      vecsRun1,
      'gemini:default',
      rejectedRun1,
      new Set(),
    );

    expect(cacheAfterRun1['crm.Contacts'].Fingerprint).toBe(ComputeTableNormalizationFingerprint(crmContacts));

    // Run 2: crm.Contacts is UNCHANGED, billing.Subscribers has an updated column description, and events.Attendees is ADDED!
    const billingUsersModified: TableNormalizationInput = {
      ...billingUsers,
      TableDescription: 'Updated billing subscribers with enterprise accounts',
    };
    const eventsAttendees: TableNormalizationInput = {
      schema: 'events',
      table: 'Attendees',
      TableDescription: 'Event registrants',
      columns: [
        {
          schema: 'events',
          table: 'Attendees',
          Column: 'AttendeeEmail',
          dataType: 'varchar(255)',
          OriginalDescription: 'Registrant email',
          SampleValues: ['a@b.com'],
          ParticipatesInFK: false,
          FkTarget: null,
          isPrimaryKey: false,
        },
      ],
    };

    const partitioned = PartitionTableNormalizations(
      [crmContacts, billingUsersModified, eventsAttendees],
      cacheAfterRun1,
    );

    expect(partitioned.CachedTablesCount).toBe(1);
    expect(partitioned.CachedNormalized).toHaveLength(1);
    expect(partitioned.CachedNormalized[0].table).toBe('Contacts');
    expect(partitioned.DirtyInputs.map((d) => `${d.schema}.${d.table}`)).toEqual([
      'billing.Subscribers',
      'events.Attendees',
    ]);

    // Verify EmbedNormalizedColumnsWithCache skips embedding crm.Contacts.EmailAddress!
    const freshCols: NormalizedColumn[] = [
      normalizedRun1[1],
      {
        ...eventsAttendees.columns[0],
        ConceptName: 'email_address',
        NormalizationStrategy: 'LowerCaseTrim',
        NormalizedDescription: 'RFC-5322 email address identifying a natural person; lowercase trim.',
        IsUsefulOrganicKey: true,
        confidence: 0.94,
        reasoning: 'Shared email',
      },
    ];
    const combinedCols = [...partitioned.CachedNormalized, ...freshCols];
    const combinedTexts = ['email_address. text 1', 'email_address. text 2', 'email_address. text 3'];

    const embedSpy = vi.fn(async (batch: string[]) => batch.map(() => new Float32Array([0.6, 0.8])));
    const embedRes = await EmbedNormalizedColumnsWithCache(
      combinedCols,
      combinedTexts,
      'gemini:default',
      embedSpy,
      partitioned.CachedEmbeddings,
    );

    expect(embedRes.ReusedCount).toBe(1);
    expect(embedRes.ComputedCount).toBe(2);
    expect(embedSpy).toHaveBeenCalledTimes(1);
    expect(embedSpy).toHaveBeenCalledWith(['email_address. text 2', 'email_address. text 3']);
  });
});
