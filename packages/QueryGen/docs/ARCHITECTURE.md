# QueryGen Architecture

This document provides a comprehensive technical deep-dive into the QueryGen package architecture, design decisions, and implementation details.

## Table of Contents

- [Overview](#overview)
- [11-Phase Pipeline](#11-phase-pipeline)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [AI Integration](#ai-integration)
- [Database Integration](#database-integration)
- [Error Handling Strategy](#error-handling-strategy)
- [Performance Considerations](#performance-considerations)
- [Design Decisions](#design-decisions)

## Overview

QueryGen is an AI-powered system for automatically generating, testing, and refining SQL query templates. It leverages MemberJunction's metadata system, AIEngine for LLM interactions, and vector embeddings for few-shot learning.

### Architecture Principles

1. **Modular Design** - Each phase is independent and testable
2. **Error Resilience** - Comprehensive error handling with AI-powered fixing
3. **Type Safety** - Explicit TypeScript types throughout
4. **MJ Integration** - Deep integration with MemberJunction patterns
5. **AI-First** - Leverages AI at every decision point

### Technology Stack

- **Language**: TypeScript 5.0+
- **AI**: MemberJunction AIEngine with 6-model failover
- **Vector Embeddings**: Local embeddings via `text-embedding-3-small`
- **Templates**: Nunjucks for SQL templates
- **Database**: SQL Server 2016+
- **CLI**: Commander.js, ora, chalk

## 11-Phase Pipeline

### Phase 1: Entity Analysis

**Purpose**: Load and filter entities from MemberJunction metadata

**Implementation**:
```typescript
const md = new Metadata();
const allEntities = md.Entities.filter(
  e => !config.excludeSchemas.includes(e.SchemaName || '')
);
```

**Key Operations**:
- Load all entities from Metadata.Provider
- Apply include/exclude filters from config
- Exclude system schemas (sys, INFORMATION_SCHEMA)
- Validate entity metadata completeness

**Output**: Filtered array of `EntityInfo` objects ready for grouping

---

### Phase 2: Entity Grouping

**Purpose**: Create logical groups of 1-N related entities based on foreign key relationships

**Implementation**: `EntityGrouper` class

**Algorithm**:
1. **Build Relationship Graph**:
   ```typescript
   // Map entity names to their related entities
   const graph = new Map<string, RelationshipInfo[]>();

   for (const entity of entities) {
     const relationships: RelationshipInfo[] = [];
     for (const field of entity.Fields) {
       if (isForeignKeyField(field)) {
         relationships.push({
           from: entity.Name,
           to: relatedEntityName,
           via: field.Name,
           type: 'many-to-one'
         });
       }
     }
     graph.set(entity.Name, relationships);
   }
   ```

2. **Breadth-First Traversal**:
   - Start from each entity as "primary entity"
   - Find directly related entities (1 hop away)
   - Then find entities 2 hops away, etc.
   - Generate combinations up to `maxEntitiesPerGroup`

3. **Deduplication**:
   - Sort entity IDs in each group
   - Use sorted IDs as unique key
   - Remove duplicate groups

**Output**:
```typescript
interface EntityGroup {
  entities: EntityInfo[];
  relationships: RelationshipInfo[];
  primaryEntity: EntityInfo;
  relationshipType: 'single' | 'parent-child' | 'many-to-many';
}
```

**Example**:
```
Customers (single) → [Customers]
Customers + Orders (parent-child) → [Customers, Orders]
Customers + Orders + OrderDetails (parent-child) → [Customers, Orders, OrderDetails]
```

---

### Phase 3: Business Question Generation

**Purpose**: Generate domain-specific business questions using AI

**Implementation**: `QuestionGenerator` class

**AI Prompt**: `Business Question Generator`
- Location: `metadata/prompts/templates/query-gen/business-question-generator.template.md`
- Uses Nunjucks templates to format entity metadata as structured markdown
- Includes entity descriptions, fields, relationships

**Prompt Structure**:
```markdown
# Business Question Generator

## Entity Group Context

{% for entity in entityGroupMetadata %}
### Entity: {{ entity.entityName }}
- **Schema**: {{ entity.schemaName }}
- **View**: {{ entity.baseView }}
- **Description**: {{ entity.description }}

**Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }})...
{% endfor %}

**Relationships**:
{% for rel in entity.relationships %}
- {{ rel.type }}: {{ rel.relatedEntity }} via `{{ rel.foreignKeyField }}`
{% endfor %}
{% endfor %}

## Instructions
Generate 1-2 realistic business questions...
```

**Output**:
```typescript
interface BusinessQuestion {
  userQuestion: string;
  description: string;
  technicalDescription: string;
  complexity: 'simple' | 'medium' | 'complex';
  requiresAggregation: boolean;
  requiresJoins: boolean;
  entities: string[];
}
```

---

### Phase 4: Vector Similarity Search

**Purpose**: Find similar golden queries for few-shot learning

**Implementation**:
- `EmbeddingService` - Wraps AIEngine's `EmbedTextLocal()`
- `SimilaritySearch` - Weighted cosine similarity

**Algorithm**:
1. **Embed Question Fields**:
   ```typescript
   const embeddings = {
     name: await aiEngine.EmbedTextLocal(question.name),
     userQuestion: await aiEngine.EmbedTextLocal(question.userQuestion),
     description: await aiEngine.EmbedTextLocal(question.description),
     technicalDescription: await aiEngine.EmbedTextLocal(question.technicalDescription)
   };
   ```

2. **Weighted Similarity Calculation**:
   ```typescript
   const weights = {
     name: 0.1,                    // 10%
     userQuestion: 0.2,            // 20%
     description: 0.35,            // 35%
     technicalDescription: 0.35   // 35%
   };

   for (const golden of goldenQueries) {
     const nameSim = cosineSimilarity(question.name, golden.name);
     const userQuestionSim = cosineSimilarity(question.userQuestion, golden.userQuestion);
     const descSim = cosineSimilarity(question.description, golden.description);
     const techDescSim = cosineSimilarity(question.technicalDescription, golden.technicalDescription);

     const weightedScore =
       (nameSim * weights.name) +
       (userQuestionSim * weights.userQuestion) +
       (descSim * weights.description) +
       (techDescSim * weights.technicalDescription);

     scores.push({ query: golden, similarity: weightedScore });
   }
   ```

3. **Top-K Selection**:
   - Sort by weighted similarity descending
   - Return top K results (default: 5)
   - Always return topK even if below threshold

**Why Weighted Similarity?**
- `description` and `technicalDescription` are more semantically rich than `name`
- `userQuestion` captures intent but may vary in wording
- Weights reflect information density of each field

---

### Phase 5: SQL Query Generation

**Purpose**: Generate Nunjucks SQL templates using AI with few-shot learning

**Implementation**: `QueryWriter` class

**AI Prompt**: `SQL Query Writer`
- Location: `metadata/prompts/templates/query-gen/sql-query-writer.template.md`
- Includes entity metadata, few-shot examples, query requirements
- Uses Nunjucks loops to format data as readable markdown

**Prompt Structure**:
```markdown
# SQL Query Template Writer

## Task
Generate SQL query for: "{{ userQuestion }}"

## Available Entities
{% for entity in entityMetadata %}
### {{ entity.entityName }}
- **Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
**Available Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }})...
{% endfor %}
{% endfor %}

## Example Queries (Similar to Your Task)
{% for example in fewShotExamples %}
### Example {{ loop.index }}: {{ example.name }}
**SQL Template**:
```sql
{{ example.sql }}
```
**Parameters**: ...
**Output Fields**: ...
{% endfor %}

## Requirements
1. Use Nunjucks syntax: `{{ paramName | sqlString }}`
2. Use SQL filters: sqlString, sqlNumber, sqlDate, sqlIn
3. Query from views (vw*), not tables
4. Handle NULLs with COALESCE/ISNULL
5. Include appropriate WHERE clauses
```

**Output**:
```typescript
interface GeneratedQuery {
  sql: string;
  selectClause: QueryOutputField[];
  parameters: QueryParameter[];
}
```

**Example Output**:
```typescript
{
  sql: `
    SELECT
      c.Name as CustomerName,
      COUNT(o.ID) as OrderCount,
      COALESCE(SUM(o.Total), 0) as TotalRevenue
    FROM [dbo].[vwCustomers] c
    LEFT JOIN [sales].[vwOrders] o ON o.CustomerID = c.ID
    WHERE c.Name LIKE {{ searchTerm | sqlString }}
      AND o.OrderDate >= {{ startDate | sqlDate }}
    GROUP BY c.Name
    ORDER BY TotalRevenue DESC
  `,
  selectClause: [
    { name: 'CustomerName', description: 'Name of the customer', type: 'string', optional: false },
    { name: 'OrderCount', description: 'Number of orders', type: 'number', optional: false },
    { name: 'TotalRevenue', description: 'Sum of order totals', type: 'number', optional: false }
  ],
  parameters: [
    {
      name: 'searchTerm',
      type: 'string',
      isRequired: false,
      description: 'Customer name search term',
      usage: ['WHERE clause: c.Name LIKE searchTerm'],
      defaultValue: null,
      sampleValue: '%Smith%'
    },
    {
      name: 'startDate',
      type: 'date',
      isRequired: true,
      description: 'Start date for order filter',
      usage: ['WHERE clause: o.OrderDate >= startDate'],
      defaultValue: null,
      sampleValue: '2024-01-01'
    }
  ]
}
```

---

### Phase 6: Query Testing

**Purpose**: Execute generated queries to validate they work correctly

**Implementation**: `QueryTester` class

**Process**:
1. **Template Rendering**:
   ```typescript
   const paramValues: Record<string, any> = {};
   for (const param of query.parameters) {
     paramValues[param.name] = parseSampleValue(param.sampleValue, param.type);
   }

   const result = QueryParameterProcessor.processQueryTemplate(
     { SQL: query.sql, Parameters: query.parameters },
     paramValues
   );
   ```

2. **SQL Execution**:
   ```typescript
   const result = await dataProvider.ExecuteSQL(renderedSQL);
   ```

3. **Result Validation**:
   - Check if query returns results
   - Validate result schema matches `selectClause`
   - Count rows returned

**Output**:
```typescript
interface QueryTestResult {
  success: boolean;
  renderedSQL?: string;
  rowCount?: number;
  sampleRows?: unknown[];
  attempts?: number;
  error?: string;
}
```

---

### Phase 7: Error Fixing

**Purpose**: Automatically fix SQL errors using AI

**Implementation**: `QueryFixer` class

**AI Prompt**: `SQL Query Fixer`
- Receives original SQL, error message, entity metadata
- AI analyzes error and proposes fix
- Returns corrected query

**Common Error Types**:
- Syntax errors (missing commas, parentheses)
- Invalid column names
- Type mismatches
- Missing JOINs
- Incorrect GROUP BY clauses
- Subquery issues

**Process**:
```typescript
async fixQuery(query: GeneratedQuery, errorMessage: string): Promise<GeneratedQuery> {
  const promptData = {
    originalSQL: query.sql,
    errorMessage,
    entityMetadata,
    parameters: query.parameters
  };

  const result = await promptRunner.ExecutePrompt({
    prompt: await this.getPrompt('SQL Query Fixer'),
    data: promptData,
    contextUser: this.contextUser
  });

  return result.result as GeneratedQuery;
}
```

**Retry Loop** (in QueryTester):
```typescript
let attempt = 0;
while (attempt < maxAttempts) {
  try {
    const result = await this.executeSQLQuery(renderedSQL);
    return { success: true, result };
  } catch (error) {
    if (attempt < maxAttempts) {
      query = await this.fixQuery(query, errorMessage);
    }
  }
  attempt++;
}
```

---

### Phase 8: Query Evaluation

**Purpose**: Assess if query answers the business question correctly

**Implementation**: `QueryRefiner` class (evaluation method)

**AI Prompt**: `Query Result Evaluator`
- Receives query, business question, sample results (top 10 rows)
- AI evaluates relevance, completeness, correctness
- Generates improvement suggestions

**Evaluation Criteria**:
1. **Result Relevance**: Do results match what was asked?
2. **Data Completeness**: Are all necessary columns present?
3. **Correctness**: Are calculations and aggregations correct?
4. **Usability**: Are results formatted appropriately?

**Output**:
```typescript
interface QueryEvaluation {
  answersQuestion: boolean;
  confidence: number; // 0-1
  reasoning: string;
  suggestions: string[];
  needsRefinement: boolean;
}
```

**Example**:
```typescript
{
  answersQuestion: true,
  confidence: 0.95,
  reasoning: "Query correctly aggregates orders by customer and sorts by revenue descending. Results show expected data.",
  suggestions: [
    "Consider adding customer contact info for better usability",
    "Add date range parameter to filter orders by time period"
  ],
  needsRefinement: false
}
```

---

### Phase 9: Query Refinement

**Purpose**: Iteratively improve queries based on evaluation feedback

**Implementation**: `QueryRefiner` class

**AI Prompt**: `Query Refiner`
- Receives current query, evaluation feedback, entity metadata
- AI implements suggested improvements
- Returns refined query

**Refinement Loop**:
```typescript
async refineQuery(
  query: GeneratedQuery,
  businessQuestion: BusinessQuestion,
  entityMetadata: EntityMetadataForPrompt[],
  maxRefinements: number
): Promise<RefinedQuery> {
  let currentQuery = query;
  let refinementCount = 0;

  while (refinementCount < maxRefinements) {
    // Test query
    const testResult = await this.tester.testQuery(currentQuery);
    if (!testResult.success) {
      throw new Error(`Query testing failed: ${testResult.error}`);
    }

    // Evaluate query
    const evaluation = await this.evaluateQuery(
      currentQuery,
      businessQuestion,
      testResult.sampleRows
    );

    // If evaluation passes, we're done!
    if (evaluation.answersQuestion && !evaluation.needsRefinement) {
      return {
        query: currentQuery,
        testResult,
        evaluation,
        refinementCount
      };
    }

    // Refine query based on suggestions
    refinementCount++;
    currentQuery = await this.performRefinement(
      currentQuery,
      businessQuestion,
      evaluation,
      entityMetadata
    );
  }

  // Reached max refinements
  return { query: currentQuery, ..., reachedMaxRefinements: true };
}
```

**Termination Conditions**:
- Query passes evaluation (`answersQuestion: true`, `needsRefinement: false`)
- Reached `maxRefinementIterations`
- Query testing fails after fixes

---

### Phase 10: Validation

**Purpose**: Comprehensive validation of generated queries

**Implementation**: `validate` command (CLI)

**Validation Checks**:
1. **SQL Syntax**: Query compiles without errors
2. **Parameter Validation**: All parameters have valid types and sample values
3. **Output Field Validation**: selectClause matches query output
4. **Execution Testing**: Query runs successfully against database
5. **Result Schema Validation**: Returned columns match expected schema

**Process**:
```typescript
async validateCommand(options: Record<string, unknown>): Promise<void> {
  // Load query metadata files
  const queryFiles = await loadQueryFiles(queryPath);

  for (const { file, queries } of queryFiles) {
    for (const queryRecord of queries) {
      // Convert metadata to GeneratedQuery format
      const query = convertMetadataToGeneratedQuery(queryRecord);

      // Test query execution
      const tester = new QueryTester(...);
      const testResult = await tester.testQuery(query, 1);

      if (testResult.success) {
        passCount++;
      } else {
        failCount++;
        errors.push({ file, error: testResult.error });
      }
    }
  }

  // Report results
  console.log(`Passed: ${passCount}, Failed: ${failCount}`);
}
```

---

### Phase 11: Metadata Export

**Purpose**: Export validated queries to MJ metadata format or database

**Implementation**:
- `MetadataExporter` - Exports to JSON files
- `QueryDatabaseWriter` - Inserts into database

**Metadata Format**:
```typescript
interface QueryMetadataRecord {
  fields: {
    Name: string;
    CategoryID: string;
    UserQuestion: string;
    Description: string;
    TechnicalDescription: string;
    SQL: string;
    OriginalSQL: string;
    UsesTemplate: boolean;
    Status: string;
  };
  relatedEntities: {
    'Query Fields': Array<{ fields: QueryFieldRecord }>;
    'Query Params': Array<{ fields: QueryParamRecord }>;
  };
}
```

**MetadataExporter Process**:
```typescript
async exportQueries(
  validatedQueries: ValidatedQuery[],
  outputDirectory: string
): Promise<ExportResult> {
  // Transform to MJ metadata format
  const metadata = validatedQueries.map(q => this.toQueryMetadata(q));

  // Create metadata file
  const metadataFile = {
    timestamp: new Date().toISOString(),
    generatedBy: 'query-gen',
    version: '1.0',
    queries: metadata
  };

  // Write to file
  const outputPath = path.join(outputDirectory, `queries-${Date.now()}.json`);
  await fs.writeFile(outputPath, JSON.stringify(metadataFile, null, 2));

  return { success: true, outputPath, queryCount: metadata.length };
}
```

**QueryDatabaseWriter Process**:
```typescript
async writeQueriesToDatabase(
  validatedQueries: ValidatedQuery[],
  contextUser: UserInfo
): Promise<WriteResult> {
  const md = new Metadata();

  for (const vq of validatedQueries) {
    // Create Query entity
    const query = await md.GetEntityObject<QueryEntity>('Queries', contextUser);
    query.NewRecord();
    query.Name = generateQueryName(vq.businessQuestion);
    query.SQL = vq.query.sql;
    // ... set other fields
    await query.Save();

    // Create Query Fields
    for (const field of vq.query.selectClause) {
      const qf = await md.GetEntityObject<QueryFieldEntity>('Query Fields', contextUser);
      qf.NewRecord();
      qf.QueryID = query.ID;
      qf.Name = field.name;
      // ... set other fields
      await qf.Save();
    }

    // Create Query Params
    for (const param of vq.query.parameters) {
      const qp = await md.GetEntityObject<QueryParamEntity>('Query Params', contextUser);
      qp.NewRecord();
      qp.QueryID = query.ID;
      qp.Name = param.name;
      // ... set other fields
      await qp.Save();
    }
  }
}
```

---

## Data Flow

### End-to-End Flow Diagram

```
Database Schema (SQL Server)
  ↓
MemberJunction Metadata
  ↓
EntityGrouper
  ↓
EntityGroup[]
  ↓
QuestionGenerator (AI)
  ↓
BusinessQuestion[]
  ↓
EmbeddingService (Vector Embeddings)
  ↓
SimilaritySearch
  ↓
GoldenQuery[] (few-shot examples)
  ↓
QueryWriter (AI + few-shot)
  ↓
GeneratedQuery
  ↓
QueryTester (SQL execution)
  ├─ Success → QueryRefiner
  └─ Error → QueryFixer (AI) → Retry
             ↓
QueryRefiner (AI evaluation & refinement)
  ↓
ValidatedQuery
  ↓
MetadataExporter / QueryDatabaseWriter
  ↓
JSON files or Database records
```

### Data Structures

**EntityInfo** (from MJ Metadata):
- Name, SchemaName, BaseTable, BaseView
- Fields: EntityFieldInfo[]
- Relationships: EntityRelationshipInfo[]

**EntityGroup**:
- entities: EntityInfo[]
- relationships: RelationshipInfo[]
- primaryEntity: EntityInfo
- relationshipType: 'single' | 'parent-child' | 'many-to-many'

**BusinessQuestion**:
- userQuestion: string
- description: string
- technicalDescription: string
- complexity: 'simple' | 'medium' | 'complex'
- requiresAggregation: boolean
- requiresJoins: boolean
- entities: string[]

**GeneratedQuery**:
- sql: string (Nunjucks template)
- selectClause: QueryOutputField[]
- parameters: QueryParameter[]

**ValidatedQuery**:
- businessQuestion: BusinessQuestion
- query: GeneratedQuery
- testResult: QueryTestResult
- evaluation: QueryEvaluation
- entityGroup: EntityGroup

---

## AI Integration

### AIEngine Configuration

QueryGen uses MemberJunction's AIEngine for all AI interactions:

```typescript
// Initialize AIEngine
const aiEngine = AIEngine.Instance;
await aiEngine.Config(false, contextUser);

// Prompts are already cached by AIEngine
const prompt = aiEngine.Prompts.find(p => p.Name === 'Business Question Generator');

// Execute prompt via AIPromptRunner
const promptRunner = new AIPromptRunner();
const result = await promptRunner.ExecutePrompt({
  prompt,
  data: { entityGroupMetadata, ... },
  contextUser
});
```

### Prompt Configuration

Each prompt is configured with 6 AI models in priority order:

1. **Claude 4.5 Sonnet** (Anthropic) - Priority 1
   - Best quality, highest reasoning capability
   - Used for complex refinement tasks

2. **Kimi K2** (Groq) - Priority 2
   - Fast, cost-effective
   - Good balance of speed and quality

3. **Kimi K2** (Cerebras) - Priority 3
   - Extremely fast inference
   - Backup for Groq

4. **Gemini 2.5 Flash** (Google) - Priority 4
   - Very cost-effective
   - Good for high-volume generation

5. **GPT-OSS-120B** (Groq) - Priority 5
   - Open-source model
   - Fallback option

6. **GPT 5-nano** (OpenAI) - Priority 6
   - Smallest, fastest OpenAI model
   - Final fallback

**Failover Strategy**:
- If model 1 fails (rate limit, error, timeout), try model 2
- Continue down the list until successful response
- If all models fail, throw error

### Prompt Engineering Best Practices

1. **Use Nunjucks Templates**:
   - Format data as structured markdown, not raw JSON
   - Use `{% for %}` loops to iterate over arrays
   - Use `{% if %}` conditionals for optional sections
   - Makes prompts much easier for LLMs to parse

2. **Provide Context**:
   - Entity descriptions and business domain
   - Field names, types, and descriptions
   - Relationship information (foreign keys, JOINs)

3. **Few-Shot Examples**:
   - Include 3-5 similar golden queries
   - Show both SQL and parameter definitions
   - Demonstrate expected output format

4. **Clear Instructions**:
   - Explicit requirements (Nunjucks syntax, SQL filters)
   - Output format specification (JSON schema)
   - Validation rules (use views, handle NULLs, etc.)

---

## Database Integration

### MemberJunction Patterns

QueryGen follows MJ best practices:

1. **GetEntityObject Pattern**:
   ```typescript
   // ✅ Correct
   const query = await md.GetEntityObject<QueryEntity>('Queries', contextUser);

   // ❌ Wrong
   const query = new QueryEntity();
   ```

2. **Server-Side contextUser**:
   ```typescript
   // ✅ Correct (server-side)
   const result = await rv.RunView({ EntityName: 'Queries' }, contextUser);

   // ❌ Wrong (server-side)
   const result = await rv.RunView({ EntityName: 'Queries' });
   ```

3. **RunView Error Handling**:
   ```typescript
   // ✅ Correct
   const result = await rv.RunView({...});
   if (result.Success) {
     const data = result.Results || [];
   } else {
     console.error('Failed:', result.ErrorMessage);
   }

   // ❌ Wrong (assumes success)
   const result = await rv.RunView({...});
   const data = result.Results;
   ```

### SQL Execution

QueryGen uses `DatabaseProviderBase.ExecuteSQL()` for query testing:

```typescript
const dataProvider = Metadata.Provider.DatabaseConnection as DatabaseProviderBase;
const result = await dataProvider.ExecuteSQL(renderedSQL);
// Returns: { Results: any[], RowCount: number }
```

### Schema Requirements

QueryGen requires:
- `SchemaName` on all entities (e.g., 'dbo', 'sales')
- `BaseView` on all entities (e.g., 'vwCustomers', 'vwOrders')
- Foreign key metadata on EntityField records
- Sample data for query testing (optional but recommended)

---

## Error Handling Strategy

### Error Handling Utilities

QueryGen uses MJ's error handling utilities:

```typescript
import { extractErrorMessage, requireValue, getPropertyOrDefault } from '@memberjunction/query-gen';

try {
  await operation();
} catch (error: unknown) {
  const errorMsg = extractErrorMessage(error, 'Operation Name');
  console.error(errorMsg);
}
```

### Agent Run Step Pattern

All AI operations follow the agent run step pattern:

```typescript
const step = await this.createStep('Step Name', inputData, contextUser, 'Validation');

try {
  const result = await work();

  step.Success = true;
  step.Status = 'Completed';
  step.CompletedAt = new Date();
  step.OutputData = JSON.stringify(result, null, 2);
  await step.Save();

  return result;
} catch (error: unknown) {
  step.Success = false;
  step.Status = 'Failed';
  step.CompletedAt = new Date();
  step.ErrorMessage = extractErrorMessage(error, 'Step Name');
  await step.Save();

  throw error;
}
```

### Error Categories

1. **Database Errors**:
   - Connection failures
   - SQL syntax errors
   - Schema validation errors
   - Permission errors

2. **AI Errors**:
   - Prompt not found
   - Model failures / rate limits
   - Invalid JSON responses
   - Timeout errors

3. **Template Errors**:
   - Nunjucks syntax errors
   - Unknown filter errors
   - Parameter type mismatches

4. **Validation Errors**:
   - Query returns no results
   - Schema mismatch
   - Missing required parameters

---

## Performance Considerations

### Optimization Strategies

1. **Parallel Processing**:
   ```typescript
   // Process multiple entity groups concurrently
   const parallelGenerations = 3;
   const chunks = chunkArray(entityGroups, parallelGenerations);

   for (const chunk of chunks) {
     await Promise.all(chunk.map(group => processGroup(group)));
   }
   ```

2. **Prompt Caching**:
   ```typescript
   // AIEngine caches prompts after Config()
   await aiEngine.Config(false, contextUser);
   // Subsequent prompt lookups are instant
   const prompt = aiEngine.Prompts.find(p => p.Name === 'Business Question Generator');
   ```

3. **Embedding Caching**:
   ```typescript
   // Cache golden query embeddings
   const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);
   // Reuse for all questions in session
   ```

4. **Database Connection Pooling**:
   - MJ automatically pools connections
   - Configure pool size in `mj.config.cjs`
   - Default: max 50, min 5

### Cost Optimization

1. **Use Cheaper Models**:
   - Gemini 2.5 Flash: $0.075 per 1M input tokens
   - GPT 5-nano: Low-cost OpenAI option
   - Groq/Cerebras: Very fast, low cost

2. **Reduce AI Calls**:
   - Lower `maxRefinementIterations` (3 → 2)
   - Lower `maxFixingIterations` (5 → 3)
   - Lower `topSimilarQueries` (5 → 3)

3. **Batch Operations**:
   - Generate queries for multiple entities at once
   - Use `parallelGenerations` for concurrent processing

### Scalability

QueryGen scales to handle:
- **Entities**: 100+ entities with good performance
- **Entity Groups**: 1000+ groups (depends on relationship complexity)
- **Queries**: 10-100 queries per minute (depends on AI model speed)
- **Database Size**: No limit (uses views, not full table scans)

---

## Design Decisions

### Why 11 Phases?

Each phase has a specific purpose and can be independently tested/validated:
1. **Separation of Concerns**: Each phase does one thing well
2. **Error Isolation**: Failures don't cascade
3. **Flexibility**: Can skip phases (e.g., no refinement)
4. **Observability**: Clear progress tracking

### Why Nunjucks Templates?

1. **MJ Standard**: MemberJunction uses Nunjucks for SQL templates
2. **Powerful**: Supports loops, conditionals, filters
3. **SQL Filters**: Built-in `sqlString`, `sqlNumber`, `sqlDate`, `sqlIn` filters
4. **Type Safety**: QueryParameterProcessor validates parameters

### Why Weighted Similarity?

Not all fields are equally important:
- `description` and `technicalDescription` contain richer semantic information
- `name` is often too short/generic
- `userQuestion` captures intent but varies in wording
- Weighted approach gives better few-shot examples

### Why Breadth-First Traversal?

1. **Focused Groups**: Prefer directly related entities (1 hop)
2. **Practical Queries**: Most queries use 1-2 entities
3. **Reduced Complexity**: Avoid deeply nested JOINs
4. **Better Performance**: Simpler queries run faster

### Why 6-Model Failover?

1. **High Availability**: If one model is down, others available
2. **Rate Limit Protection**: Spread load across vendors
3. **Cost Optimization**: Cheaper models as fallbacks
4. **Speed Variation**: Fast models (Cerebras) for simple tasks

### Why Local Embeddings?

1. **No API Calls**: Faster, no rate limits
2. **Privacy**: Data doesn't leave the system
3. **Cost**: Free (no per-token charges)
4. **Sufficient Quality**: `text-embedding-3-small` works well for similarity

---

## Future Enhancements

### Planned Improvements

1. **Query Optimization**:
   - Analyze execution plans
   - Suggest indexes
   - Detect expensive operations

2. **Golden Query Learning**:
   - Automatically promote good queries to golden set
   - User feedback loop
   - Continuous improvement

3. **Multi-Database Support**:
   - PostgreSQL support
   - MySQL support
   - Abstract SQL dialect differences

4. **Advanced Filtering**:
   - Exclude specific entity combinations
   - Require specific entities in groups
   - Custom grouping strategies

5. **Monitoring & Analytics**:
   - Track query generation success rates
   - Measure AI token usage
   - Performance metrics dashboard

---

## Conclusion

QueryGen's architecture is designed for:
- **Reliability**: Comprehensive error handling and AI failover
- **Quality**: Iterative refinement ensures queries work correctly
- **Scalability**: Handles hundreds of entities efficiently
- **Maintainability**: Modular design, clear separation of concerns
- **Extensibility**: Easy to add new phases or customize existing ones

For API usage examples, see [API.md](./API.md).
For user documentation, see [../README.md](../README.md).
