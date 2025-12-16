/**
 * Basic Usage Example for QueryGen
 *
 * This example demonstrates the fundamental workflow:
 * 1. Load entities
 * 2. Create entity groups
 * 3. Generate business questions
 * 4. Generate SQL queries
 * 5. Test queries
 * 6. Export results
 */

import {
  EntityGrouper,
  QuestionGenerator,
  QueryWriter,
  QueryTester,
  MetadataExporter,
  formatEntityMetadataForPrompt,
  extractErrorMessage,
  ValidatedQuery
} from '@memberjunction/query-gen';
import { Metadata, UserInfo, DatabaseProviderBase } from '@memberjunction/core';

/**
 * Main function demonstrating basic QueryGen usage
 */
async function main() {
  console.log('QueryGen Basic Usage Example\n');

  // ========================================
  // Step 1: Setup
  // ========================================

  // Create context user for server-side operations
  const contextUser = new UserInfo();
  contextUser.Email = 'system@example.com';
  contextUser.Name = 'System User';
  contextUser.FirstName = 'System';
  contextUser.LastName = 'User';

  // Ensure metadata provider is configured
  if (!Metadata.Provider) {
    console.error('ERROR: Metadata provider not configured');
    console.error('Please configure database connection before running this example');
    process.exit(1);
  }

  // ========================================
  // Step 2: Load Entities
  // ========================================

  console.log('Step 1: Loading entities...');
  const md = new Metadata();

  // Filter to specific entity for this example
  const targetEntityName = 'Customers'; // Change this to test with different entities
  const entity = md.Entities.find(e => e.Name === targetEntityName);

  if (!entity) {
    console.error(`ERROR: Entity '${targetEntityName}' not found`);
    process.exit(1);
  }

  console.log(`✓ Found entity: ${entity.Name}\n`);

  // ========================================
  // Step 3: Create Entity Groups
  // ========================================

  console.log('Step 2: Creating entity groups...');
  const grouper = new EntityGrouper();

  // Create groups of 1-2 entities
  const groups = await grouper.generateEntityGroups([entity], 1, 2);

  console.log(`✓ Created ${groups.length} entity group(s)\n`);

  // Show first group
  const entityGroup = groups[0];
  console.log('Entity group:', {
    entities: entityGroup.entities.map(e => e.Name),
    relationshipType: entityGroup.relationshipType,
    primaryEntity: entityGroup.primaryEntity.Name
  });
  console.log();

  // ========================================
  // Step 4: Generate Business Questions
  // ========================================

  console.log('Step 3: Generating business questions...');
  const questionGen = new QuestionGenerator(contextUser);

  let questions;
  try {
    questions = await questionGen.generateQuestions(entityGroup);
    console.log(`✓ Generated ${questions.length} business question(s)\n`);

    // Show questions
    questions.forEach((q, i) => {
      console.log(`Question ${i + 1}:`);
      console.log(`  User Question: ${q.userQuestion}`);
      console.log(`  Description: ${q.description}`);
      console.log(`  Complexity: ${q.complexity}`);
      console.log(`  Requires Aggregation: ${q.requiresAggregation}`);
      console.log(`  Requires Joins: ${q.requiresJoins}`);
      console.log();
    });
  } catch (error: unknown) {
    console.error('ERROR generating questions:', extractErrorMessage(error, 'Question Generation'));
    process.exit(1);
  }

  // ========================================
  // Step 5: Generate SQL Query
  // ========================================

  console.log('Step 4: Generating SQL query...');

  // Format entity metadata for prompt
  const entityMetadata = entityGroup.entities.map(e =>
    formatEntityMetadataForPrompt(e, entityGroup.entities)
  );

  // Use first question for this example
  const businessQuestion = questions[0];

  // For this basic example, we'll skip few-shot learning (no golden queries)
  const fewShotExamples: any[] = [];

  const queryWriter = new QueryWriter(contextUser);

  let generatedQuery;
  try {
    generatedQuery = await queryWriter.generateQuery(
      businessQuestion,
      entityMetadata,
      fewShotExamples
    );

    console.log('✓ Generated SQL query\n');
    console.log('SQL Template:');
    console.log('─'.repeat(80));
    console.log(generatedQuery.sql);
    console.log('─'.repeat(80));
    console.log();

    console.log('Parameters:', generatedQuery.parameters.length);
    generatedQuery.parameters.forEach(param => {
      console.log(`  - ${param.name} (${param.type}): ${param.description}`);
    });
    console.log();

    console.log('Output Fields:', generatedQuery.selectClause.length);
    generatedQuery.selectClause.forEach(field => {
      console.log(`  - ${field.name} (${field.type}): ${field.description}`);
    });
    console.log();
  } catch (error: unknown) {
    console.error('ERROR generating query:', extractErrorMessage(error, 'Query Generation'));
    process.exit(1);
  }

  // ========================================
  // Step 6: Test Query
  // ========================================

  console.log('Step 5: Testing query...');

  const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;
  const tester = new QueryTester(
    dataProvider,
    entityMetadata,
    businessQuestion,
    contextUser
  );

  let testResult;
  try {
    // Test with up to 5 error-fixing attempts
    testResult = await tester.testQuery(generatedQuery, 5);

    if (testResult.success) {
      console.log(`✓ Query test passed in ${testResult.attempts} attempt(s)`);
      console.log(`  Rows returned: ${testResult.rowCount}`);
      console.log();

      // Show sample results (first 3 rows)
      if (testResult.sampleRows && testResult.sampleRows.length > 0) {
        console.log('Sample Results (first 3 rows):');
        console.log('─'.repeat(80));
        testResult.sampleRows.slice(0, 3).forEach((row, i) => {
          console.log(`Row ${i + 1}:`, JSON.stringify(row, null, 2));
        });
        console.log('─'.repeat(80));
        console.log();
      }
    } else {
      console.error(`✗ Query test failed after ${testResult.attempts} attempt(s)`);
      console.error('  Error:', testResult.error);
      console.log();
      console.log('Note: This example will continue with export despite test failure');
      console.log();
    }
  } catch (error: unknown) {
    console.error('ERROR testing query:', extractErrorMessage(error, 'Query Testing'));
    console.log('Note: This example will continue with export despite test error');
    console.log();
  }

  // ========================================
  // Step 7: Export Results
  // ========================================

  console.log('Step 6: Exporting query...');

  // Create ValidatedQuery object
  const validatedQuery: ValidatedQuery = {
    businessQuestion,
    query: generatedQuery,
    testResult: testResult || {
      success: false,
      error: 'Test was skipped or failed',
      attempts: 0
    },
    evaluation: {
      answersQuestion: true,
      confidence: 0.8,
      reasoning: 'Basic example - no formal evaluation performed',
      suggestions: [],
      needsRefinement: false
    },
    entityGroup
  };

  const exporter = new MetadataExporter();

  try {
    const exportResult = await exporter.exportQueries(
      [validatedQuery],
      './examples/output'
    );

    console.log(`✓ Query exported successfully`);
    console.log(`  Output path: ${exportResult.outputPath}`);
    console.log(`  Query count: ${exportResult.queryCount}`);
    console.log();
  } catch (error: unknown) {
    console.error('ERROR exporting query:', extractErrorMessage(error, 'Query Export'));
    process.exit(1);
  }

  // ========================================
  // Summary
  // ========================================

  console.log('═'.repeat(80));
  console.log('Basic QueryGen Workflow Complete!');
  console.log('═'.repeat(80));
  console.log();
  console.log('Summary:');
  console.log(`  Entity: ${entity.Name}`);
  console.log(`  Questions Generated: ${questions.length}`);
  console.log(`  Query Generated: Yes`);
  console.log(`  Query Tested: ${testResult?.success ? 'Passed' : 'Failed/Skipped'}`);
  console.log(`  Query Exported: Yes`);
  console.log();
  console.log('Next Steps:');
  console.log('  1. Review the exported query metadata file');
  console.log('  2. Test the query with different parameter values');
  console.log('  3. Run the advanced-usage.ts example for refinement workflow');
  console.log();
}

// Run main function
main()
  .then(() => {
    console.log('✓ Example completed successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('✗ Example failed:', extractErrorMessage(error, 'Basic Usage Example'));
    process.exit(1);
  });
