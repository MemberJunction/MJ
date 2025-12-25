/**
 * Advanced Usage Example for QueryGen
 *
 * This example demonstrates advanced features:
 * 1. Vector similarity search with golden queries
 * 2. Query refinement with evaluation
 * 3. Batch processing multiple entities
 * 4. Custom configuration
 * 5. Database export
 */

import {
  EntityGrouper,
  QuestionGenerator,
  QueryWriter,
  QueryTester,
  QueryRefiner,
  MetadataExporter,
  QueryDatabaseWriter,
  EmbeddingService,
  SimilaritySearch,
  formatEntityMetadataForPrompt,
  extractErrorMessage,
  ValidatedQuery,
  GoldenQuery,
  QueryGenConfig
} from '@memberjunction/query-gen';
import { Metadata, UserInfo, DatabaseProviderBase } from '@memberjunction/core';

/**
 * Example golden queries for few-shot learning
 * In production, these would be loaded from database or metadata files
 */
const GOLDEN_QUERIES: GoldenQuery[] = [
  {
    name: 'Top Customers By Revenue',
    userQuestion: 'What are the top 10 customers by total revenue?',
    description: 'Identify highest-value customers based on order revenue',
    technicalDescription: 'Sum order totals per customer, sort descending, limit 10',
    sql: `
      SELECT TOP 10
        c.Name as CustomerName,
        c.Email as CustomerEmail,
        COUNT(o.ID) as OrderCount,
        COALESCE(SUM(o.Total), 0) as TotalRevenue
      FROM [dbo].[vwCustomers] c
      LEFT JOIN [sales].[vwOrders] o ON o.CustomerID = c.ID
      GROUP BY c.Name, c.Email
      ORDER BY TotalRevenue DESC
    `,
    parameters: [],
    selectClause: [
      { name: 'CustomerName', description: 'Customer name', type: 'string', optional: false },
      { name: 'CustomerEmail', description: 'Customer email', type: 'string', optional: false },
      { name: 'OrderCount', description: 'Number of orders', type: 'number', optional: false },
      { name: 'TotalRevenue', description: 'Sum of order totals', type: 'number', optional: false }
    ]
  },
  {
    name: 'Recent Orders By Status',
    userQuestion: 'Show me recent orders grouped by status',
    description: 'Count orders in each status for the last 30 days',
    technicalDescription: 'Count orders grouped by status, filtered by date range',
    sql: `
      SELECT
        o.Status,
        COUNT(o.ID) as OrderCount,
        COALESCE(SUM(o.Total), 0) as TotalRevenue
      FROM [sales].[vwOrders] o
      WHERE o.OrderDate >= DATEADD(DAY, -30, GETDATE())
      GROUP BY o.Status
      ORDER BY OrderCount DESC
    `,
    parameters: [],
    selectClause: [
      { name: 'Status', description: 'Order status', type: 'string', optional: false },
      { name: 'OrderCount', description: 'Number of orders', type: 'number', optional: false },
      { name: 'TotalRevenue', description: 'Total revenue', type: 'number', optional: false }
    ]
  }
];

/**
 * Custom configuration for this example
 */
const CUSTOM_CONFIG: Partial<QueryGenConfig> = {
  maxEntitiesPerGroup: 2,
  minEntitiesPerGroup: 1,
  questionsPerGroup: 2,
  maxRefinementIterations: 3,
  maxFixingIterations: 5,
  topSimilarQueries: 3, // Use top 3 golden queries
  embeddingModel: 'text-embedding-3-small',
  verbose: true
};

/**
 * Generate queries for a single entity with full workflow
 */
async function generateQueriesForEntity(
  entityName: string,
  contextUser: UserInfo,
  goldenQueries: GoldenQuery[]
): Promise<ValidatedQuery[]> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing Entity: ${entityName}`);
  console.log('='.repeat(80));

  const validatedQueries: ValidatedQuery[] = [];

  // Load entity
  const md = new Metadata();
  const entity = md.Entities.find(e => e.Name === entityName);
  if (!entity) {
    console.error(`✗ Entity '${entityName}' not found`);
    return [];
  }

  console.log(`✓ Entity loaded: ${entity.Name}`);

  // Create entity groups
  const grouper = new EntityGrouper();
  const groups = await grouper.generateEntityGroups(
    [entity],
    CUSTOM_CONFIG.minEntitiesPerGroup!,
    CUSTOM_CONFIG.maxEntitiesPerGroup!
  );

  console.log(`✓ Created ${groups.length} entity group(s)`);

  // Process first group for this example
  const entityGroup = groups[0];

  // Generate business questions
  const questionGen = new QuestionGenerator(contextUser);
  const questions = await questionGen.generateQuestions(entityGroup);

  console.log(`✓ Generated ${questions.length} business question(s)`);

  // Initialize services
  const embeddingService = new EmbeddingService(CUSTOM_CONFIG.embeddingModel!);
  const similaritySearch = new SimilaritySearch();
  const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;

  // Embed golden queries once
  console.log('⟳ Embedding golden queries...');
  const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);
  console.log(`✓ Embedded ${embeddedGolden.length} golden queries`);

  // Process each question
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Question ${i + 1}/${questions.length}: ${question.userQuestion}`);
    console.log('─'.repeat(80));

    try {
      // 1. Embed question for similarity search
      console.log('⟳ Embedding question...');
      const questionEmbeddings = await embeddingService.embedQuery({
        name: '',
        userQuestion: question.userQuestion,
        description: question.description,
        technicalDescription: question.technicalDescription
      });

      // 2. Find similar golden queries
      console.log('⟳ Finding similar golden queries...');
      const fewShotResults = await similaritySearch.findSimilarQueries(
        questionEmbeddings,
        embeddedGolden,
        CUSTOM_CONFIG.topSimilarQueries!
      );

      console.log(`✓ Found ${fewShotResults.length} similar queries:`);
      fewShotResults.forEach((result, idx) => {
        console.log(`  ${idx + 1}. ${result.query.name} (similarity: ${result.similarity.toFixed(3)})`);
      });

      const fewShotExamples = fewShotResults.map(r => r.query);

      // 3. Generate SQL query
      console.log('⟳ Generating SQL query...');
      const entityMetadata = entityGroup.entities.map(e =>
        formatEntityMetadataForPrompt(e, entityGroup.entities)
      );

      const queryWriter = new QueryWriter(contextUser);
      const generatedQuery = await queryWriter.generateQuery(
        question,
        entityMetadata,
        fewShotExamples
      );

      console.log('✓ Query generated');
      console.log(`  Parameters: ${generatedQuery.parameters.length}`);
      console.log(`  Output fields: ${generatedQuery.selectClause.length}`);

      // 4. Test and fix query
      console.log('⟳ Testing query...');
      const tester = new QueryTester(
        dataProvider,
        entityMetadata,
        question,
        contextUser
      );

      const testResult = await tester.testQuery(
        generatedQuery,
        CUSTOM_CONFIG.maxFixingIterations!
      );

      if (!testResult.success) {
        console.error(`✗ Query test failed: ${testResult.error}`);
        continue;
      }

      console.log(`✓ Query test passed (${testResult.attempts} attempt(s))`);
      console.log(`  Rows returned: ${testResult.rowCount}`);

      // 5. Refine query with evaluation
      console.log('⟳ Refining query...');
      const refiner = new QueryRefiner(tester, contextUser);

      const refined = await refiner.refineQuery(
        generatedQuery,
        question,
        entityMetadata,
        CUSTOM_CONFIG.maxRefinementIterations!
      );

      console.log(`✓ Query refined (${refined.refinementCount} iteration(s))`);
      console.log('  Evaluation:');
      console.log(`    Answers question: ${refined.evaluation.answersQuestion}`);
      console.log(`    Confidence: ${refined.evaluation.confidence}`);
      console.log(`    Needs refinement: ${refined.evaluation.needsRefinement}`);

      if (refined.evaluation.suggestions.length > 0) {
        console.log('    Suggestions:');
        refined.evaluation.suggestions.forEach(s => {
          console.log(`      - ${s}`);
        });
      }

      // Add to validated queries
      validatedQueries.push({
        businessQuestion: question,
        query: refined.query,
        testResult: refined.testResult,
        evaluation: refined.evaluation,
        entityGroup
      });

      console.log(`✓ Query validated and added to export list`);

    } catch (error: unknown) {
      console.error(`✗ Error processing question: ${extractErrorMessage(error, 'Question Processing')}`);
    }
  }

  return validatedQueries;
}

/**
 * Main function demonstrating advanced QueryGen usage
 */
async function main() {
  console.log('QueryGen Advanced Usage Example\n');

  // ========================================
  // Setup
  // ========================================

  const contextUser = new UserInfo();
  contextUser.Email = 'system@example.com';
  contextUser.Name = 'System User';
  contextUser.FirstName = 'System';
  contextUser.LastName = 'User';

  if (!Metadata.Provider) {
    console.error('ERROR: Metadata provider not configured');
    process.exit(1);
  }

  // ========================================
  // Batch Processing Multiple Entities
  // ========================================

  const targetEntities = ['Customers', 'Orders']; // Customize as needed
  const allValidatedQueries: ValidatedQuery[] = [];

  console.log('Configuration:');
  console.log(JSON.stringify(CUSTOM_CONFIG, null, 2));

  for (const entityName of targetEntities) {
    try {
      const queries = await generateQueriesForEntity(
        entityName,
        contextUser,
        GOLDEN_QUERIES
      );

      allValidatedQueries.push(...queries);
      console.log(`\n✓ ${entityName}: Generated ${queries.length} validated query/queries`);

    } catch (error: unknown) {
      console.error(`✗ ${entityName}: ${extractErrorMessage(error, 'Entity Processing')}`);
    }
  }

  // ========================================
  // Export Results
  // ========================================

  console.log(`\n${'='.repeat(80)}`);
  console.log('Exporting Results');
  console.log('='.repeat(80));

  if (allValidatedQueries.length === 0) {
    console.log('⚠ No queries to export');
    return;
  }

  // 1. Export to metadata files
  console.log('\n1. Exporting to metadata files...');
  const exporter = new MetadataExporter();

  try {
    const exportResult = await exporter.exportQueries(
      allValidatedQueries,
      './examples/output'
    );

    console.log(`✓ Metadata export complete`);
    console.log(`  Output path: ${exportResult.outputPath}`);
    console.log(`  Query count: ${exportResult.queryCount}`);
  } catch (error: unknown) {
    console.error(`✗ Metadata export failed: ${extractErrorMessage(error, 'Metadata Export')}`);
  }

  // 2. Export to database
  console.log('\n2. Exporting to database...');
  const dbWriter = new QueryDatabaseWriter();

  try {
    await dbWriter.writeQueriesToDatabase(allValidatedQueries, contextUser);
    console.log(`✓ Database export complete`);
    console.log(`  Query count: ${allValidatedQueries.length}`);
  } catch (error: unknown) {
    console.error(`✗ Database export failed: ${extractErrorMessage(error, 'Database Export')}`);
  }

  // ========================================
  // Summary
  // ========================================

  console.log(`\n${'='.repeat(80)}`);
  console.log('Advanced QueryGen Workflow Complete!');
  console.log('='.repeat(80));
  console.log();
  console.log('Summary:');
  console.log(`  Entities Processed: ${targetEntities.length}`);
  console.log(`  Total Queries Generated: ${allValidatedQueries.length}`);
  console.log(`  Golden Queries Used: ${GOLDEN_QUERIES.length}`);
  console.log(`  Max Entities Per Group: ${CUSTOM_CONFIG.maxEntitiesPerGroup}`);
  console.log(`  Max Refinement Iterations: ${CUSTOM_CONFIG.maxRefinementIterations}`);
  console.log();

  // Show query breakdown
  if (allValidatedQueries.length > 0) {
    console.log('Query Breakdown:');
    allValidatedQueries.forEach((vq, i) => {
      console.log(`  ${i + 1}. ${vq.businessQuestion.userQuestion}`);
      console.log(`     Entities: ${vq.entityGroup.entities.map(e => e.Name).join(', ')}`);
      console.log(`     Test: ${vq.testResult.success ? 'Passed' : 'Failed'}`);
      console.log(`     Evaluation: ${vq.evaluation.answersQuestion ? 'Passed' : 'Failed'} (confidence: ${vq.evaluation.confidence})`);
    });
    console.log();
  }

  console.log('Features Demonstrated:');
  console.log('  ✓ Vector similarity search with golden queries');
  console.log('  ✓ Few-shot learning with similar examples');
  console.log('  ✓ Automatic query testing and error fixing');
  console.log('  ✓ AI-powered query evaluation and refinement');
  console.log('  ✓ Batch processing of multiple entities');
  console.log('  ✓ Export to both metadata files and database');
  console.log('  ✓ Custom configuration');
  console.log();
}

// Run main function
main()
  .then(() => {
    console.log('✓ Example completed successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('✗ Example failed:', extractErrorMessage(error, 'Advanced Usage Example'));
    process.exit(1);
  });
