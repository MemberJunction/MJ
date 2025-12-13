# QueryGen API Documentation

This document provides comprehensive API documentation for programmatic usage of the QueryGen package.

## Table of Contents

- [Installation](#installation)
- [Core Classes](#core-classes)
- [Usage Patterns](#usage-patterns)
- [TypeScript Types](#typescript-types)
- [Configuration](#configuration)
- [Examples](#examples)

## Installation

```bash
npm install @memberjunction/query-gen
```

## Core Classes

### EntityGrouper

Analyzes entity relationships and creates logical groups for query generation.

#### Constructor

```typescript
new EntityGrouper()
```

#### Methods

##### `generateEntityGroups()`

Generates entity groups from available entities based on foreign key relationships.

```typescript
async generateEntityGroups(
  entities: EntityInfo[],
  minSize: number,
  maxSize: number
): Promise<EntityGroup[]>
```

**Parameters:**
- `entities` - Array of EntityInfo objects to analyze
- `minSize` - Minimum number of entities per group (usually 1)
- `maxSize` - Maximum number of entities per group (typically 3)

**Returns:** Array of EntityGroup objects with relationship metadata

**Example:**
```typescript
import { EntityGrouper } from '@memberjunction/query-gen';
import { Metadata } from '@memberjunction/core';

const md = new Metadata();
const entities = md.Entities.filter(e => e.SchemaName === 'dbo');

const grouper = new EntityGrouper();
const groups = await grouper.generateEntityGroups(entities, 1, 3);

console.log(`Generated ${groups.length} entity groups`);
// Output: Generated 42 entity groups

// Single entity group
console.log(groups[0]);
// {
//   entities: [CustomersEntity],
//   relationships: [],
//   primaryEntity: CustomersEntity,
//   relationshipType: 'single'
// }

// Multi-entity group
console.log(groups[1]);
// {
//   entities: [CustomersEntity, OrdersEntity],
//   relationships: [
//     { from: 'Orders', to: 'Customers', via: 'CustomerID', type: 'many-to-one' }
//   ],
//   primaryEntity: OrdersEntity,
//   relationshipType: 'parent-child'
// }
```

---

### QuestionGenerator

Generates domain-specific business questions using AI.

#### Constructor

```typescript
new QuestionGenerator(contextUser: UserInfo)
```

**Parameters:**
- `contextUser` - User context for server-side operations

#### Methods

##### `generateQuestions()`

Generates 1-2 business questions for an entity group using AI.

```typescript
async generateQuestions(
  entityGroup: EntityGroup
): Promise<BusinessQuestion[]>
```

**Parameters:**
- `entityGroup` - Entity group to generate questions for

**Returns:** Array of BusinessQuestion objects

**Example:**
```typescript
import { QuestionGenerator } from '@memberjunction/query-gen';
import { UserInfo } from '@memberjunction/core';

const contextUser = new UserInfo();
contextUser.Email = 'user@example.com';
contextUser.Name = 'Test User';

const generator = new QuestionGenerator(contextUser);
const questions = await generator.generateQuestions(entityGroup);

console.log(questions);
// [
//   {
//     userQuestion: "What are the top customers by revenue?",
//     description: "Identify high-value customers based on total order revenue",
//     technicalDescription: "Sum order totals per customer, sort descending, limit to top 10",
//     complexity: "medium",
//     requiresAggregation: true,
//     requiresJoins: true,
//     entities: ["Customers", "Orders"]
//   },
//   {
//     userQuestion: "How many orders does each customer have?",
//     description: "Count number of orders per customer",
//     technicalDescription: "Count orders grouped by customer",
//     complexity: "simple",
//     requiresAggregation: true,
//     requiresJoins: true,
//     entities: ["Customers", "Orders"]
//   }
// ]
```

---

### QueryWriter

Generates SQL query templates using AI with few-shot learning.

#### Constructor

```typescript
new QueryWriter(contextUser: UserInfo)
```

**Parameters:**
- `contextUser` - User context for server-side operations

#### Methods

##### `generateQuery()`

Generates a Nunjucks SQL query template from a business question.

```typescript
async generateQuery(
  businessQuestion: BusinessQuestion,
  entityMetadata: EntityMetadataForPrompt[],
  fewShotExamples: GoldenQuery[]
): Promise<GeneratedQuery>
```

**Parameters:**
- `businessQuestion` - The business question to answer
- `entityMetadata` - Formatted metadata for entities involved
- `fewShotExamples` - Similar golden queries for few-shot learning

**Returns:** GeneratedQuery object with SQL, parameters, and output fields

**Example:**
```typescript
import { QueryWriter, formatEntityMetadataForPrompt } from '@memberjunction/query-gen';
import { UserInfo } from '@memberjunction/core';

const contextUser = new UserInfo();
const writer = new QueryWriter(contextUser);

// Format entity metadata for prompt
const entityMetadata = entityGroup.entities.map(e =>
  formatEntityMetadataForPrompt(e, entityGroup.entities)
);

// Find similar golden queries (from vector similarity search)
const fewShotExamples = []; // Array of GoldenQuery objects

// Generate query
const query = await writer.generateQuery(
  businessQuestion,
  entityMetadata,
  fewShotExamples
);

console.log(query.sql);
// SELECT
//   c.Name as CustomerName,
//   COUNT(o.ID) as OrderCount,
//   COALESCE(SUM(o.Total), 0) as TotalRevenue
// FROM [dbo].[vwCustomers] c
// LEFT JOIN [sales].[vwOrders] o ON o.CustomerID = c.ID
// WHERE c.Name LIKE {{ searchTerm | sqlString }}
// GROUP BY c.Name
// ORDER BY TotalRevenue DESC

console.log(query.parameters);
// [
//   {
//     name: 'searchTerm',
//     type: 'string',
//     isRequired: false,
//     description: 'Customer name search term',
//     usage: ['WHERE clause: c.Name LIKE searchTerm'],
//     defaultValue: null,
//     sampleValue: '%Smith%'
//   }
// ]
```

---

### QueryTester

Tests generated queries by executing them against the database.

#### Constructor

```typescript
new QueryTester(
  dataProvider: DatabaseProviderBase,
  entityMetadata: EntityMetadataForPrompt[],
  businessQuestion: BusinessQuestion,
  contextUser: UserInfo
)
```

**Parameters:**
- `dataProvider` - Database provider for SQL execution
- `entityMetadata` - Entity metadata for error context
- `businessQuestion` - Business question for error context
- `contextUser` - User context for server-side operations

#### Methods

##### `testQuery()`

Tests a query by rendering and executing it. Automatically fixes errors up to maxAttempts.

```typescript
async testQuery(
  query: GeneratedQuery,
  maxAttempts: number = 5
): Promise<QueryTestResult>
```

**Parameters:**
- `query` - The query to test
- `maxAttempts` - Maximum error-fixing attempts (default: 5)

**Returns:** QueryTestResult with success status, rendered SQL, and sample rows

**Example:**
```typescript
import { QueryTester } from '@memberjunction/query-gen';
import { Metadata, UserInfo } from '@memberjunction/core';

const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;
const contextUser = new UserInfo();

const tester = new QueryTester(
  dataProvider,
  entityMetadata,
  businessQuestion,
  contextUser
);

const result = await tester.testQuery(query, 5);

if (result.success) {
  console.log(`Query returned ${result.rowCount} rows in ${result.attempts} attempt(s)`);
  console.log('Sample rows:', result.sampleRows);
  console.log('Rendered SQL:', result.renderedSQL);
} else {
  console.error(`Query failed after ${result.attempts} attempts:`, result.error);
}
```

---

### QueryFixer

Fixes SQL errors using AI.

#### Constructor

```typescript
new QueryFixer(
  entityMetadata: EntityMetadataForPrompt[],
  businessQuestion: BusinessQuestion,
  contextUser: UserInfo
)
```

**Parameters:**
- `entityMetadata` - Entity metadata for error context
- `businessQuestion` - Business question for error context
- `contextUser` - User context for server-side operations

#### Methods

##### `fixQuery()`

Fixes a broken SQL query using AI analysis of the error message.

```typescript
async fixQuery(
  query: GeneratedQuery,
  errorMessage: string
): Promise<GeneratedQuery>
```

**Parameters:**
- `query` - The broken query
- `errorMessage` - SQL error message from database

**Returns:** Fixed GeneratedQuery

**Example:**
```typescript
import { QueryFixer } from '@memberjunction/query-gen';
import { UserInfo } from '@memberjunction/core';

const contextUser = new UserInfo();
const fixer = new QueryFixer(entityMetadata, businessQuestion, contextUser);

try {
  const result = await dataProvider.ExecuteSQL(renderedSQL);
} catch (error) {
  // Fix the query
  const errorMsg = extractErrorMessage(error, 'SQL Execution');
  const fixedQuery = await fixer.fixQuery(query, errorMsg);

  // Try again with fixed query
  const fixedSQL = renderTemplate(fixedQuery);
  const result = await dataProvider.ExecuteSQL(fixedSQL);
}
```

---

### QueryRefiner

Evaluates and refines queries iteratively using AI feedback.

#### Constructor

```typescript
new QueryRefiner(
  queryTester: QueryTester,
  contextUser: UserInfo
)
```

**Parameters:**
- `queryTester` - QueryTester instance for executing queries
- `contextUser` - User context for server-side operations

#### Methods

##### `refineQuery()`

Evaluates and refines a query through iterative feedback loops.

```typescript
async refineQuery(
  query: GeneratedQuery,
  businessQuestion: BusinessQuestion,
  entityMetadata: EntityMetadataForPrompt[],
  maxRefinements: number = 3
): Promise<RefinedQuery>
```

**Parameters:**
- `query` - The query to refine
- `businessQuestion` - Business question for evaluation context
- `entityMetadata` - Entity metadata for refinement context
- `maxRefinements` - Maximum refinement iterations (default: 3)

**Returns:** RefinedQuery with final query, test results, and evaluation

**Example:**
```typescript
import { QueryRefiner } from '@memberjunction/query-gen';
import { UserInfo } from '@memberjunction/core';

const contextUser = new UserInfo();
const refiner = new QueryRefiner(queryTester, contextUser);

const refined = await refiner.refineQuery(
  query,
  businessQuestion,
  entityMetadata,
  3 // max 3 refinement cycles
);

console.log(`Refined in ${refined.refinementCount} iteration(s)`);
console.log('Evaluation:', refined.evaluation);
// {
//   answersQuestion: true,
//   confidence: 0.95,
//   reasoning: "Query correctly aggregates...",
//   suggestions: [],
//   needsRefinement: false
// }

console.log('Final query:', refined.query.sql);
console.log('Test result:', refined.testResult);
```

---

### MetadataExporter

Exports validated queries to MemberJunction metadata format.

#### Constructor

```typescript
new MetadataExporter()
```

#### Methods

##### `exportQueries()`

Exports queries to JSON metadata files.

```typescript
async exportQueries(
  validatedQueries: ValidatedQuery[],
  outputDirectory: string
): Promise<ExportResult>
```

**Parameters:**
- `validatedQueries` - Array of validated queries to export
- `outputDirectory` - Directory path for output files

**Returns:** ExportResult with output path and query count

**Example:**
```typescript
import { MetadataExporter } from '@memberjunction/query-gen';

const exporter = new MetadataExporter();
const result = await exporter.exportQueries(
  validatedQueries,
  './metadata/queries'
);

console.log(`Exported ${result.queryCount} queries to ${result.outputPath}`);
// Exported 15 queries to ./metadata/queries/queries-1234567890.json
```

---

### QueryDatabaseWriter

Writes queries directly to the database.

#### Constructor

```typescript
new QueryDatabaseWriter()
```

#### Methods

##### `writeQueriesToDatabase()`

Inserts queries into Queries, Query Fields, and Query Params tables.

```typescript
async writeQueriesToDatabase(
  validatedQueries: ValidatedQuery[],
  contextUser: UserInfo
): Promise<void>
```

**Parameters:**
- `validatedQueries` - Array of validated queries to write
- `contextUser` - User context for entity operations

**Example:**
```typescript
import { QueryDatabaseWriter } from '@memberjunction/query-gen';
import { UserInfo } from '@memberjunction/core';

const contextUser = new UserInfo();
const writer = new QueryDatabaseWriter();

await writer.writeQueriesToDatabase(validatedQueries, contextUser);
console.log(`Wrote ${validatedQueries.length} queries to database`);
```

---

### EmbeddingService

Generates vector embeddings for similarity search.

#### Constructor

```typescript
new EmbeddingService(modelName: string)
```

**Parameters:**
- `modelName` - Embedding model name (default: 'text-embedding-3-small')

#### Methods

##### `embedQuery()`

Embeds all fields of a query for similarity search.

```typescript
async embedQuery(query: {
  name: string;
  userQuestion: string;
  description: string;
  technicalDescription: string;
}): Promise<{
  name: number[];
  userQuestion: number[];
  description: number[];
  technicalDescription: number[];
}>
```

**Parameters:**
- `query` - Query object with fields to embed

**Returns:** Embeddings for each field

##### `embedGoldenQueries()`

Embeds all golden queries for similarity comparison.

```typescript
async embedGoldenQueries(
  goldenQueries: GoldenQuery[]
): Promise<Array<{
  query: GoldenQuery;
  embeddings: {
    name: number[];
    userQuestion: number[];
    description: number[];
    technicalDescription: number[];
  };
}>>
```

**Parameters:**
- `goldenQueries` - Array of golden queries to embed

**Returns:** Array of golden queries with their embeddings

**Example:**
```typescript
import { EmbeddingService } from '@memberjunction/query-gen';

const embeddingService = new EmbeddingService('text-embedding-3-small');

// Embed a question
const questionEmbeddings = await embeddingService.embedQuery({
  name: '',
  userQuestion: "What are the top customers by revenue?",
  description: "Identify high-value customers",
  technicalDescription: "Sum order totals per customer"
});

// Embed golden queries
const goldenQueries = loadGoldenQueries(); // Load from database/files
const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);

console.log(`Embedded ${embeddedGolden.length} golden queries`);
```

---

### SimilaritySearch

Finds similar queries using weighted cosine similarity.

#### Constructor

```typescript
new SimilaritySearch(weights?: {
  name: number;
  userQuestion: number;
  description: number;
  technicalDescription: number;
})
```

**Parameters:**
- `weights` - Optional custom similarity weights (defaults to: name=0.1, userQuestion=0.2, description=0.35, technicalDescription=0.35)

#### Methods

##### `findSimilarQueries()`

Finds top-K most similar golden queries using weighted cosine similarity.

```typescript
async findSimilarQueries(
  queryEmbeddings: {
    name: number[];
    userQuestion: number[];
    description: number[];
    technicalDescription: number[];
  },
  goldenEmbeddings: Array<{
    query: GoldenQuery;
    embeddings: { ... };
  }>,
  topK: number = 5
): Promise<SimilarQuery[]>
```

**Parameters:**
- `queryEmbeddings` - Embeddings for the target query
- `goldenEmbeddings` - Array of golden queries with embeddings
- `topK` - Number of top results to return (default: 5)

**Returns:** Array of SimilarQuery objects sorted by similarity descending

**Example:**
```typescript
import { SimilaritySearch } from '@memberjunction/query-gen';

const search = new SimilaritySearch();

const similar = await search.findSimilarQueries(
  questionEmbeddings,
  embeddedGolden,
  5 // top 5
);

console.log('Top 5 similar golden queries:');
for (const result of similar) {
  console.log(`- ${result.query.name} (similarity: ${result.similarity.toFixed(2)})`);
  console.log(`  Field scores:`, result.fieldScores);
}

// Output:
// Top 5 similar golden queries:
// - Top Customers By Order Count (similarity: 0.92)
//   Field scores: { nameSim: 0.85, userQuestionSim: 0.94, descSim: 0.90, techDescSim: 0.95 }
// - Revenue By Customer Segment (similarity: 0.87)
//   Field scores: { nameSim: 0.72, userQuestionSim: 0.88, descSim: 0.89, techDescSim: 0.91 }
// ...
```

---

## Usage Patterns

### Complete Query Generation Workflow

```typescript
import {
  EntityGrouper,
  QuestionGenerator,
  QueryWriter,
  QueryTester,
  QueryRefiner,
  MetadataExporter,
  EmbeddingService,
  SimilaritySearch,
  formatEntityMetadataForPrompt
} from '@memberjunction/query-gen';
import { Metadata, UserInfo } from '@memberjunction/core';

async function generateQueriesForEntity(
  entityName: string,
  contextUser: UserInfo
): Promise<void> {
  // 1. Load entity metadata
  const md = new Metadata();
  const entity = md.Entities.find(e => e.Name === entityName);
  if (!entity) {
    throw new Error(`Entity not found: ${entityName}`);
  }

  // 2. Create entity group
  const grouper = new EntityGrouper();
  const groups = await grouper.generateEntityGroups([entity], 1, 1);
  const entityGroup = groups[0];

  // 3. Generate business questions
  const questionGen = new QuestionGenerator(contextUser);
  const questions = await questionGen.generateQuestions(entityGroup);

  // 4. Process each question
  for (const question of questions) {
    console.log(`\nGenerating query for: ${question.userQuestion}`);

    // 5. Embed question for similarity search
    const embeddingService = new EmbeddingService('text-embedding-3-small');
    const questionEmbeddings = await embeddingService.embedQuery({
      name: '',
      userQuestion: question.userQuestion,
      description: question.description,
      technicalDescription: question.technicalDescription
    });

    // 6. Find similar golden queries
    const goldenQueries = await loadGoldenQueries(); // Your implementation
    const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);

    const similaritySearch = new SimilaritySearch();
    const fewShotResults = await similaritySearch.findSimilarQueries(
      questionEmbeddings,
      embeddedGolden,
      5
    );
    const fewShotExamples = fewShotResults.map(r => r.query);

    // 7. Generate SQL query
    const entityMetadata = [entity].map(e =>
      formatEntityMetadataForPrompt(e, [entity])
    );
    const queryWriter = new QueryWriter(contextUser);
    const query = await queryWriter.generateQuery(
      question,
      entityMetadata,
      fewShotExamples
    );

    console.log('Generated SQL:', query.sql.substring(0, 100) + '...');

    // 8. Test query
    const dataProvider = Metadata.Provider.DatabaseConnection;
    const tester = new QueryTester(
      dataProvider,
      entityMetadata,
      question,
      contextUser
    );
    const testResult = await tester.testQuery(query, 5);

    if (!testResult.success) {
      console.error('Query test failed:', testResult.error);
      continue;
    }

    console.log(`Query test passed: ${testResult.rowCount} rows returned`);

    // 9. Refine query
    const refiner = new QueryRefiner(tester, contextUser);
    const refined = await refiner.refineQuery(query, question, entityMetadata, 3);

    console.log(`Query refined in ${refined.refinementCount} iteration(s)`);
    console.log('Evaluation confidence:', refined.evaluation.confidence);

    // 10. Export query
    const exporter = new MetadataExporter();
    await exporter.exportQueries(
      [{
        businessQuestion: question,
        query: refined.query,
        testResult: refined.testResult,
        evaluation: refined.evaluation,
        entityGroup
      }],
      './metadata/queries'
    );

    console.log('Query exported successfully!');
  }
}

// Usage
const contextUser = new UserInfo();
contextUser.Email = 'system@example.com';
contextUser.Name = 'System';

await generateQueriesForEntity('Customers', contextUser);
```

### Batch Query Generation

```typescript
async function generateQueriesForMultipleEntities(
  entityNames: string[],
  contextUser: UserInfo
): Promise<ValidatedQuery[]> {
  const allValidatedQueries: ValidatedQuery[] = [];

  for (const entityName of entityNames) {
    console.log(`\nProcessing ${entityName}...`);

    // Load entity
    const md = new Metadata();
    const entity = md.Entities.find(e => e.Name === entityName);
    if (!entity) {
      console.error(`Entity not found: ${entityName}`);
      continue;
    }

    // Generate queries (using workflow from previous example)
    const queries = await generateQueriesForEntity(entityName, contextUser);
    allValidatedQueries.push(...queries);
  }

  // Export all queries at once
  const exporter = new MetadataExporter();
  await exporter.exportQueries(allValidatedQueries, './metadata/queries');

  console.log(`\nTotal queries generated: ${allValidatedQueries.length}`);
  return allValidatedQueries;
}
```

### Query Validation

```typescript
async function validateQueryMetadataFile(
  filePath: string,
  contextUser: UserInfo
): Promise<{ passed: number; failed: number; errors: string[] }> {
  const results = { passed: 0, failed: 0, errors: [] };

  // Load queries from file
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  const queries = Array.isArray(data) ? data : [data];

  // Validate each query
  for (const queryRecord of queries) {
    const query = convertMetadataToGeneratedQuery(queryRecord);

    // Create dummy context for testing
    const dummyQuestion = {
      userQuestion: queryRecord.fields.UserQuestion || 'Test query',
      description: queryRecord.fields.Description || '',
      technicalDescription: queryRecord.fields.TechnicalDescription || '',
      complexity: 'medium' as const,
      requiresAggregation: false,
      requiresJoins: false,
      entities: []
    };

    const dataProvider = Metadata.Provider.DatabaseConnection;
    const tester = new QueryTester(dataProvider, [], dummyQuestion, contextUser);

    try {
      const testResult = await tester.testQuery(query, 1);

      if (testResult.success) {
        results.passed++;
        console.log(`✓ ${queryRecord.fields.Name}`);
      } else {
        results.failed++;
        results.errors.push(`${queryRecord.fields.Name}: ${testResult.error}`);
        console.error(`✗ ${queryRecord.fields.Name}: ${testResult.error}`);
      }
    } catch (error) {
      results.failed++;
      const errorMsg = extractErrorMessage(error, 'Validation');
      results.errors.push(`${queryRecord.fields.Name}: ${errorMsg}`);
      console.error(`✗ ${queryRecord.fields.Name}: ${errorMsg}`);
    }
  }

  return results;
}
```

---

## TypeScript Types

### Core Types

```typescript
import type {
  EntityGroup,
  RelationshipInfo,
  EntityMetadataForPrompt,
  BusinessQuestion,
  GeneratedQuery,
  QueryParameter,
  QueryOutputField,
  GoldenQuery,
  SimilarQuery,
  QueryTestResult,
  QueryEvaluation,
  RefinedQuery,
  ValidatedQuery,
  QueryMetadataRecord
} from '@memberjunction/query-gen';
```

### Type Definitions

See [../src/data/schema.ts](../src/data/schema.ts) for complete type definitions.

---

## Configuration

### QueryGenConfig Type

```typescript
interface QueryGenConfig {
  // Entity Filtering
  includeEntities: string[];
  excludeEntities: string[];
  excludeSchemas: string[];

  // Entity Grouping
  maxEntitiesPerGroup: number;
  minEntitiesPerGroup: number;
  questionsPerGroup: number;
  entityGroupStrategy: 'breadth' | 'depth';

  // AI Configuration
  modelOverride?: string;
  vendorOverride?: string;
  embeddingModel: string;

  // Iteration Limits
  maxRefinementIterations: number;
  maxFixingIterations: number;

  // Few-Shot Learning
  topSimilarQueries: number;
  similarityThreshold: number;

  // Similarity Weighting
  similarityWeights: {
    name: number;
    userQuestion: number;
    description: number;
    technicalDescription: number;
  };

  // Output Configuration
  outputMode: 'metadata' | 'database' | 'both';
  outputDirectory: string;

  // Performance
  parallelGenerations: number;
  enableCaching: boolean;

  // Validation
  testWithSampleData: boolean;
  requireMinRows: number;
  maxRefinementRows: number;

  // Verbose Logging
  verbose: boolean;
}
```

### Loading Configuration

```typescript
import { loadConfig } from '@memberjunction/query-gen';

// Load from mj.config.cjs with CLI overrides
const config = loadConfig({
  entities: ['Customers', 'Orders'],
  maxEntities: 2,
  verbose: true
});

// Use configuration
console.log(config.maxEntitiesPerGroup); // 2
console.log(config.verbose); // true
```

---

## Examples

See the [examples](../examples/) directory for complete working examples:

- [basic-usage.ts](../examples/basic-usage.ts) - Basic query generation workflow
- [advanced-usage.ts](../examples/advanced-usage.ts) - Advanced patterns and customization

---

## Error Handling

All QueryGen functions use proper error handling:

```typescript
import { extractErrorMessage } from '@memberjunction/query-gen';

try {
  const queries = await generateQueries();
} catch (error: unknown) {
  const errorMsg = extractErrorMessage(error, 'Query Generation');
  console.error('Failed:', errorMsg);
}
```

Never use `any` for error types - always use `unknown` and extract messages safely.

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.com
- Community: https://community.memberjunction.com
