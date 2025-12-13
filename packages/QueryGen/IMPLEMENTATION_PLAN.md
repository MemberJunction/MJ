# Query Generation Package Implementation Plan

## Package Overview
**Package Name**: `@memberjunction/query-gen`
**Purpose**: AI-powered generation of domain-specific SQL query templates with automatic testing, refinement, and metadata export
**CLI Command**: `mj querygen`

---

## Phase 1: Project Setup & Infrastructure (Week 1)

### 1.1 Package Structure Creation
```
packages/QueryGen/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── generate.ts          # Main generation command
│   │   │   ├── validate.ts          # Query validation command
│   │   │   └── export.ts            # Metadata export command
│   │   ├── config.ts                # Configuration loader
│   │   └── index.ts                 # CLI entry point
│   ├── core/
│   │   ├── EntityGrouper.ts         # Entity relationship analysis
│   │   ├── QuestionGenerator.ts     # Business question generation
│   │   ├── QueryWriter.ts           # SQL template generation
│   │   ├── QueryTester.ts           # Query execution & validation
│   │   ├── QueryRefiner.ts          # Query refinement logic
│   │   └── MetadataExporter.ts      # MJ metadata file export
│   ├── prompts/
│   │   └── PromptNames.ts           # Static prompt name constants
│   ├── vectors/
│   │   └── SimilaritySearch.ts      # Weighted similarity logic for golden queries
│   ├── data/
│   │   ├── golden-queries.json      # 20 example queries
│   │   └── schema.ts                # Type definitions
│   ├── utils/
│   │   ├── sql-helpers.ts           # SQL parsing utilities
│   │   └── error-handlers.ts        # Error handling helpers
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 1.2 Configuration System
**Decision**: Integrate with `mj.config.cjs` for consistency with existing MJ packages

```typescript
// Add to mj.config.cjs
queryGeneration: {
  // Entity Filtering
  includeEntities: ['*'],           // Default: all entities
  excludeEntities: [],              // Default: none
  excludeSchemas: ['__mj'],         // Default: exclude MJ core schema

  // Entity Grouping
  maxEntitiesPerGroup: 3,           // Default: 3 related entities
  minEntitiesPerGroup: 1,           // Default: 1 (single entity queries)
  questionsPerGroup: 2,             // Default: 1-2 questions per group
  entityGroupStrategy: 'breadth',   // 'breadth' | 'depth' - prefer breadth-first grouping

  // AI Configuration
  modelOverride: undefined,          // Optional: prefer specific model
  vendorOverride: undefined,         // Optional: prefer specific vendor
  embeddingModel: 'all-MiniLM-L6-v2', // Local embedding model

  // Iteration Limits
  maxRefinementIterations: 3,        // Default: 3 refinement cycles
  maxFixingIterations: 5,            // Default: 5 error-fixing attempts

  // Few-Shot Learning
  topSimilarQueries: 5,              // Default: top 5 example queries
  similarityThreshold: 0.7,          // Similarity threshold (still returns topN even if below threshold)

  // Similarity Weighting
  similarityWeights: {
    name: 0.1,                       // 10% weight for name similarity
    userQuestion: 0.2,               // 20% weight for user question similarity
    description: 0.35,               // 35% weight for description similarity
    technicalDescription: 0.35       // 35% weight for technical description similarity
  },

  // Output Configuration
  outputMode: 'metadata',            // 'metadata' | 'database' | 'both'
  outputDirectory: './metadata/queries',

  // Performance
  parallelGenerations: 3,            // Generate 3 queries in parallel
  enableCaching: true,               // Cache prompt results

  // Validation
  testWithSampleData: true,          // Test queries before export
  requireMinRows: 1,                 // Queries must return at least 1 row
  maxRefinementRows: 10,             // Maximum rows to use for refinement evaluation

  // Verbose Logging
  verbose: false
}
```

### 1.3 Golden Queries Data Structure
**Decision**: Embed as JSON file in `src/data/` directory (distributed with npm package)

```typescript
// src/data/golden-queries.json structure
[
  {
    "name": "Customer Orders Summary",
    "userQuestion": "Show me a summary of customer orders by region",
    "description": "Aggregates order data by customer region with totals",
    "technicalDescription": "Groups orders by customer region, calculates total orders and revenue per region",
    "sql": "SELECT ...",
    "parameters": [...],
    "selectClause": [...]
  },
  // ... 19 more queries
]

// Note: Embeddings for each field will be generated at runtime using AIEngine
// We don't pre-compute embeddings - they're computed on-demand during CLI execution
// This allows flexibility if embedding models change
```

### 1.4 Dependencies
```json
{
  "dependencies": {
    "@memberjunction/core": "workspace:*",
    "@memberjunction/core-entities": "workspace:*",
    "@memberjunction/ai": "workspace:*",
    "@memberjunction/ai-engine": "workspace:*",
    "@memberjunction/ai-prompts": "workspace:*",
    "@memberjunction/ai-vectors-memory": "workspace:*",
    "@memberjunction/sql-server-dataprovider": "workspace:*",
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "nunjucks": "^3.2.4"
  }
}
```

---

## Phase 2: Entity Analysis & Grouping (Week 2)

### 2.1 EntityGrouper Implementation
**Purpose**: Create logical groups of 1-N related entities for query generation

**Key Features**:
- Load all entities from Metadata (respecting include/exclude filters)
- Analyze foreign key relationships to identify related entities
- Generate all valid combinations of 1-N entities
- Ensure no duplicate entity groups
- Allow same entity in multiple groups (different combinations)

**Algorithm**:
```typescript
class EntityGrouper {
  async generateEntityGroups(
    entities: EntityInfo[],
    minSize: number,
    maxSize: number
  ): Promise<EntityGroup[]> {
    // 1. Build relationship graph from foreign keys
    // 2. For each entity, find all connected entities using BREADTH-FIRST traversal
    //    - Prefer entities with direct relationships (1 hop away)
    //    - Then add entities 2 hops away, etc.
    //    - This creates more focused, practical entity groups
    // 3. Generate combinations of size 1 to maxSize
    // 4. Deduplicate groups (same entities = same group)
    // 5. Return unique groups with relationship metadata
  }
}

interface EntityGroup {
  entities: EntityInfo[];
  relationships: RelationshipInfo[];
  primaryEntity: EntityInfo;        // The "main" entity
  relationshipType: 'single' | 'parent-child' | 'many-to-many';
}
```

**Output Example**:
```typescript
[
  {
    entities: [CustomersEntity],
    relationships: [],
    primaryEntity: CustomersEntity,
    relationshipType: 'single'
  },
  {
    entities: [CustomersEntity, OrdersEntity],
    relationships: [{ from: 'Orders', to: 'Customers', via: 'CustomerID' }],
    primaryEntity: OrdersEntity,
    relationshipType: 'parent-child'
  },
  {
    entities: [CustomersEntity, OrdersEntity, OrderDetailsEntity],
    relationships: [...],
    primaryEntity: OrdersEntity,
    relationshipType: 'parent-child'
  }
]
```

### 2.2 Metadata Preparation
**Purpose**: Format entity metadata for AI prompts

**⚠️ CRITICAL**: Entity metadata MUST include SchemaName and BaseView for functional SQL generation

**Data Structure**:
```typescript
interface EntityMetadataForPrompt {
  entityName: string;
  description: string;
  schemaName: string;        // REQUIRED: e.g., "dbo", "sales", "hr"
  baseTable: string;
  baseView: string;          // REQUIRED: e.g., "vwCustomers", "vwOrders"
  fields: {
    name: string;
    displayName: string;
    type: string;
    description: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    relatedEntity?: string;
    isRequired: boolean;
    defaultValue?: string;
  }[];
  relationships: {
    type: 'one-to-many' | 'many-to-one' | 'many-to-many';
    relatedEntity: string;
    relatedEntityView: string;   // Include view name for joins
    relatedEntitySchema: string;  // Include schema for joins
    foreignKeyField: string;
    description: string;
  }[];
}

// Example formatted metadata:
{
  entityName: "Customers",
  description: "Customer information and contact details",
  schemaName: "dbo",
  baseTable: "Customer",
  baseView: "vwCustomers",  // Query FROM [dbo].[vwCustomers]
  fields: [...],
  relationships: [
    {
      type: "one-to-many",
      relatedEntity: "Orders",
      relatedEntityView: "vwOrders",
      relatedEntitySchema: "sales",
      foreignKeyField: "CustomerID",
      description: "Customer orders"
    }
  ]
}
```

**Why This Matters**:
- SQL queries MUST reference `[SchemaName].[BaseView]` to work
- Without schema: Query fails with "Invalid object name"
- Without BaseView: Query uses base table instead of view (missing computed fields)
- Relationships need schema/view info for proper JOINs

**Example Query Fragment**:
```sql
-- ✅ CORRECT: Includes schema and uses view
SELECT c.Name, c.Email, COUNT(o.ID) as OrderCount
FROM [dbo].[vwCustomers] c
LEFT JOIN [sales].[vwOrders] o ON o.CustomerID = c.ID
GROUP BY c.Name, c.Email

-- ❌ WRONG: Missing schema or using table name
SELECT c.Name, c.Email
FROM Customers c  -- Will fail with "Invalid object name"!
```

---

## Phase 3: Business Question Generation (Week 2-3)

**⚠️ IMPORTANT: Use Nunjucks Templates for All Prompts**

All AI prompts in this package MUST use Nunjucks template syntax to format data for readability:
- ✅ Use `{% for %}` loops to iterate over arrays
- ✅ Use `{{ variable }}` for simple values
- ✅ Use conditional logic with `{% if %}`
- ✅ Format structured data as markdown (not JSON dumps)
- ❌ AVOID `{{ data | json }}` - This makes prompts harder for LLMs to read
- ✅ PREFER structured markdown with loops and conditionals

**Why**: Structured markdown is much easier for LLMs to parse than raw JSON, leading to better AI responses.

### 3.1 QuestionGenerator Implementation
**Purpose**: Generate 1-2 domain-specific business questions per entity group

**AI Prompt**: `metadata/prompts/templates/query-gen/business-question-generator.template.md`

**Prompt Content**:
```markdown
# Business Question Generator

You are an expert data analyst helping to generate meaningful business questions that can be answered with SQL queries.

## Entity Group Context

{% for entity in entityGroupMetadata %}
### Entity: {{ entity.entityName }}
- **Schema**: {{ entity.schemaName }}
- **View**: {{ entity.baseView }}
- **Description**: {{ entity.description }}

**Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }}){% if field.description %} - {{ field.description }}{% endif %}{% if field.isPrimaryKey %} [PRIMARY KEY]{% endif %}{% if field.isForeignKey %} [FK to {{ field.relatedEntity }}]{% endif %}
{% endfor %}

{% if entity.relationships.length > 0 %}
**Relationships**:
{% for rel in entity.relationships %}
- {{ rel.type }}: {{ rel.relatedEntity }} via `{{ rel.foreignKeyField }}`{% if rel.description %} - {{ rel.description }}{% endif %}
{% endfor %}
{% endif %}

---
{% endfor %}

## Instructions
Generate 1-2 realistic business questions that:
1. Use the available entities and their relationships
2. Are answerable with the data in these tables
3. Are practical questions a business user would ask
4. Vary in complexity (simple aggregations vs. complex joins)
5. Leverage entity descriptions to understand domain context

## Output Format
Return JSON array of questions:
```json
{
  "questions": [
    {
      "userQuestion": "What are the top 5 customers by order volume?",
      "description": "Identify customers with the most orders",
      "technicalDescription": "Count orders per customer, sort descending, limit 5",
      "complexity": "simple",
      "requiresAggregation": true,
      "requiresJoins": true,
      "entities": ["Customers", "Orders"]
    }
  ]
}
```
```

**AI Prompt Configuration** (`.prompts.json`):
```json
{
  "fields": {
    "Name": "Business Question Generator",
    "Description": "Generates domain-specific business questions for entity groups",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/query-gen/business-question-generator.template.md",
    "Status": "Active",
    "ResponseFormat": "JSON",
    "SelectionStrategy": "Specific",
    "PowerPreference": "Highest",
    "ParallelizationMode": "None",
    "OutputType": "object",
    "ValidationBehavior": "Strict",
    "MaxRetries": 3,
    "FailoverMaxAttempts": 5,
    "PromptRole": "System",
    "PromptPosition": "First",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation?create&Description=Prompts for QueryGen system"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 1 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras", "Priority": 3 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.5 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 4 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT 5-nano", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 6 } }
    ]
  }
}
```

**Using AIEngine for Prompts**:
```typescript
// Static prompt name constant
export const PROMPT_BUSINESS_QUESTION_GENERATOR = 'Business Question Generator';

// In QuestionGenerator class:
class QuestionGenerator {
  async generateQuestions(entityGroup: EntityGroup): Promise<BusinessQuestion[]> {
    // 1. Ensure AIEngine is configured
    const aiEngine = AIEngine.Instance;
    await aiEngine.Config(false, this.contextUser);

    // 2. Find the prompt by name (AIEngine caches all prompts)
    const prompt = aiEngine.Prompts.find(p => p.Name === PROMPT_BUSINESS_QUESTION_GENERATOR);
    if (!prompt) {
      throw new Error(`Prompt '${PROMPT_BUSINESS_QUESTION_GENERATOR}' not found`);
    }

    // 3. Use AIPromptRunner to execute
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt({
      prompt,
      data: { entityGroupMetadata: formatEntityGroupForPrompt(entityGroup) },
      contextUser: this.contextUser
    });

    return result.result.questions;
  }
}
```

**Note**: AIEngine loads all prompts during Config() - no need for separate PromptManager or caching.

### 3.2 Question Validation
**Purpose**: Filter out low-quality or unanswerable questions

**Validation Criteria**:
- Question must reference entities in the group
- Question should be specific enough to generate a query
- Avoid overly generic questions ("Show me all data")
- Prefer questions with measurable outcomes

---

## Phase 4: Vector Similarity Search (Week 3)

### 4.1 Using AIEngine for Embeddings
**Purpose**: Use MemberJunction's AIEngine for all embedding operations

**Key Features**:
```typescript
// Use AIEngine.Instance.EmbedTextLocal() for all embeddings
// AIEngine is already configured with local embedding models
// No need for a separate EmbeddingService wrapper

// Example usage:
const aiEngine = AIEngine.Instance;
await aiEngine.Config(false, contextUser);

// Embed a query field
const nameEmbedding = await aiEngine.EmbedTextLocal(query.name);
const descEmbedding = await aiEngine.EmbedTextLocal(query.description);
const techDescEmbedding = await aiEngine.EmbedTextLocal(query.technicalDescription);
```

**Note**: We embed each field separately (name, description, technicalDescription) for weighted similarity scoring, not as a concatenated string.

### 4.2 Weighted Similarity Search Implementation
**Purpose**: Find top-K most similar golden queries using weighted field similarity

**Algorithm**: Weighted cosine similarity across multiple fields

```typescript
class SimilaritySearch {
  private weights = {
    name: 0.1,
    userQuestion: 0.2,
    description: 0.35,
    technicalDescription: 0.35
  };

  async findSimilarQueries(
    queryEmbeddings: {
      name: number[],
      userQuestion: number[],
      description: number[],
      technicalDescription: number[]
    },
    goldenEmbeddings: Array<{
      query: GoldenQuery,
      embeddings: {
        name: number[],
        userQuestion: number[],
        description: number[],
        technicalDescription: number[]
      }
    }>,
    topK: number = 5
  ): Promise<SimilarQuery[]> {
    // 1. Calculate weighted similarity for each golden query
    const similarities = goldenEmbeddings.map(golden => {
      // Calculate cosine similarity for each field
      const nameSim = this.cosineSimilarity(
        queryEmbeddings.name,
        golden.embeddings.name
      );
      const userQuestionSim = this.cosineSimilarity(
        queryEmbeddings.userQuestion,
        golden.embeddings.userQuestion
      );
      const descSim = this.cosineSimilarity(
        queryEmbeddings.description,
        golden.embeddings.description
      );
      const techDescSim = this.cosineSimilarity(
        queryEmbeddings.technicalDescription,
        golden.embeddings.technicalDescription
      );

      // Calculate weighted sum
      const weightedScore =
        (nameSim * this.weights.name) +
        (userQuestionSim * this.weights.userQuestion) +
        (descSim * this.weights.description) +
        (techDescSim * this.weights.technicalDescription);

      return {
        query: golden.query,
        similarity: weightedScore,
        fieldScores: { nameSim, userQuestionSim, descSim, techDescSim }
      };
    });

    // 2. Sort descending by weighted similarity
    const sorted = similarities.sort((a, b) => b.similarity - a.similarity);

    // 3. Return top K (ALWAYS return topK results, even if below threshold)
    // Threshold is informational only - we still use the best matches available
    return sorted.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    // Use SimpleVectorService.CosineSimilarity() from @memberjunction/ai-vectors-memory
    // Or implement: dot product / (magnitude(a) * magnitude(b))
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
  }
}
```

### 4.3 Few-Shot Example Selection
**Output**: 3-5 most relevant golden queries to include in SQL generation prompt

**Example**:
```typescript
// User question: "What are the top customers by revenue?"
// Similar golden queries:
[
  { name: "Top Customers by Order Count", similarity: 0.92, sql: "..." },
  { name: "Revenue by Customer Segment", similarity: 0.87, sql: "..." },
  { name: "Customer Purchase Analysis", similarity: 0.83, sql: "..." }
]
```

---

## Phase 5: SQL Query Generation (Week 4)

### 5.1 QueryWriter Implementation
**Purpose**: Generate Nunjucks SQL templates using AI with few-shot learning

**AI Prompt**: `metadata/prompts/templates/query-gen/sql-query-writer.template.md`

**Prompt Content** (based on Skip's query-writer.md):
```markdown
# SQL Query Template Writer

You are an expert SQL developer specializing in creating MemberJunction-compatible Nunjucks SQL query templates.

## Task
Generate a SQL query template that answers the following business question:

**User Question**: {{ userQuestion }}
**Description**: {{ description }}
**Technical Description**: {{ technicalDescription }}

## Available Entities

{% for entity in entityMetadata %}
### {{ entity.entityName }}
- **Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
- **Description**: {{ entity.description }}

**Available Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }}){% if field.description %} - {{ field.description }}{% endif %}{% if field.isPrimaryKey %} [PK]{% endif %}{% if field.isForeignKey %} [FK→{{ field.relatedEntity }}]{% endif %}
{% endfor %}

{% if entity.relationships.length > 0 %}
**Join Information**:
{% for rel in entity.relationships %}
- To join `{{ rel.relatedEntity }}`: `LEFT JOIN [{{ rel.relatedEntitySchema }}].[{{ rel.relatedEntityView }}] alias ON alias.{{ rel.foreignKeyField }} = {{ entity.entityName.substring(0,1).toLowerCase() }}.ID`
{% endfor %}
{% endif %}

---
{% endfor %}

## Example Queries (Similar to Your Task)

{% for example in fewShotExamples %}
### Example {{ loop.index }}: {{ example.name }}
**User Question**: {{ example.userQuestion }}
**Description**: {{ example.description }}

**SQL Template**:
```sql
{{ example.sql }}
```

**Parameters**:
{% for param in example.parameters %}
- `{{ param.name }}` ({{ param.type }}){% if param.isRequired %} [REQUIRED]{% endif %} - {{ param.description }}
  - Sample: `{{ param.sampleValue }}`
{% endfor %}

**Output Fields**:
{% for field in example.selectClause %}
- `{{ field.name }}` ({{ field.type }}) - {{ field.description }}
{% endfor %}

---
{% endfor %}

## Requirements
1. **Use Nunjucks Syntax**: Parameters use `{{ paramName }}` syntax
2. **Use SQL Filters**: Apply `| sqlString`, `| sqlNumber`, `| sqlDate`, `| sqlIn` filters
3. **Use Base Views**: Query from `vw*` views, not base tables
4. **Include Comments**: Document query purpose and logic
5. **Handle NULLs**: Use COALESCE or ISNULL for aggregations
6. **Performance**: Include appropriate WHERE clauses and JOINs
7. **Parameterize**: Make queries reusable with parameters

## Output Format
Return JSON with three properties:

```json
{
  "sql": "SELECT ... FROM ... WHERE ...",
  "selectClause": [
    {
      "name": "CustomerName",
      "description": "Name of the customer",
      "type": "string",
      "optional": false
    }
  ],
  "parameters": [
    {
      "name": "minRevenue",
      "type": "number",
      "isRequired": true,
      "description": "Minimum revenue threshold",
      "usage": ["WHERE clause: Revenue >= {{ minRevenue | sqlNumber }}"],
      "defaultValue": null,
      "sampleValue": "10000"
    }
  ]
}
```
```

**AI Prompt Configuration** (`.prompts.json`):
```json
{
  "fields": {
    "Name": "SQL Query Writer",
    "Description": "Generates Nunjucks SQL query templates from business questions",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/query-gen/sql-query-writer.template.md",
    "Status": "Active",
    "ResponseFormat": "JSON",
    "SelectionStrategy": "Specific",
    "PowerPreference": "Highest",
    "ParallelizationMode": "None",
    "OutputType": "object",
    "ValidationBehavior": "Strict",
    "MaxRetries": 3,
    "FailoverMaxAttempts": 5,
    "PromptRole": "System",
    "PromptPosition": "First",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 1 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras", "Priority": 3 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.5 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 4 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT 5-nano", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 6 } }
    ]
  }
}
```

### 5.2 QueryParameterProcessor Integration
**Purpose**: Render Nunjucks templates with sample parameter values for testing

```typescript
class QueryWriter {
  async generateQuery(
    businessQuestion: BusinessQuestion,
    entityMetadata: EntityMetadataForPrompt[],
    fewShotExamples: GoldenQuery[]
  ): Promise<GeneratedQuery> {
    // 1. Prepare prompt data
    const promptData = {
      userQuestion: businessQuestion.userQuestion,
      description: businessQuestion.description,
      technicalDescription: businessQuestion.technicalDescription,
      entityMetadata,
      fewShotExamples
    };

    // 2. Execute SQL Query Writer prompt
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt({
      prompt: await this.getPrompt('SQL Query Writer'),
      data: promptData,
      contextUser: this.contextUser
    });

    // 3. Parse result
    const generated: GeneratedQuery = result.result as any;

    // 4. Validate structure
    this.validateGeneratedQuery(generated);

    return generated;
  }

  private validateGeneratedQuery(query: GeneratedQuery): void {
    if (!query.sql || !query.parameters || !query.selectClause) {
      throw new Error('Invalid query structure returned from AI');
    }
  }
}
```

---

## Phase 6: Query Testing & Fixing (Week 5)

### 6.1 QueryTester Implementation
**Purpose**: Render and execute SQL queries to validate they work correctly

**Key Features**:
```typescript
class QueryTester {
  private processor: QueryParameterProcessor;

  async testQuery(
    query: GeneratedQuery,
    maxAttempts: number = 5
  ): Promise<QueryTestResult> {
    let attempt = 0;
    let lastError: string | undefined;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        // 1. Render template with sample parameter values
        const renderedSQL = this.renderQueryTemplate(query);

        // 2. Execute SQL on database
        const results = await this.executeSQLQuery(renderedSQL);

        // 3. Validate results
        if (results.length === 0) {
          throw new Error('Query returned no results (may need sample data)');
        }

        // 4. Success!
        return {
          success: true,
          renderedSQL,
          rowCount: results.length,
          sampleRows: results.slice(0, 10),
          attempts: attempt
        };

      } catch (error) {
        lastError = extractErrorMessage(error, 'Query Testing');
        console.error(`Attempt ${attempt}/${maxAttempts} failed:`, lastError);

        // 5. If not last attempt, try to fix the query
        if (attempt < maxAttempts) {
          query = await this.fixQuery(query, lastError);
        }
      }
    }

    // Failed after max attempts
    return {
      success: false,
      error: lastError,
      attempts: maxAttempts
    };
  }

  private renderQueryTemplate(query: GeneratedQuery): string {
    // Use QueryParameterProcessor to render Nunjucks template
    const paramValues: Record<string, any> = {};

    // Convert sampleValue strings to proper types
    for (const param of query.parameters) {
      paramValues[param.name] = this.parseSampleValue(param.sampleValue, param.type);
    }

    const result = QueryParameterProcessor.processQueryTemplate(
      { SQL: query.sql, Parameters: query.parameters } as any,
      paramValues
    );

    if (!result.success) {
      throw new Error(`Template rendering failed: ${result.error}`);
    }

    return result.processedSQL;
  }

  private parseSampleValue(value: string, type: string): any {
    switch (type) {
      case 'number': return Number(value);
      case 'boolean': return value.toLowerCase() === 'true';
      case 'date': return new Date(value);
      case 'array': return JSON.parse(value);
      default: return value;
    }
  }

  private async executeSQLQuery(sql: string): Promise<any[]> {
    // Execute SQL against database
    const result = await this.dataProvider.ExecuteSQL(sql);
    return result.Results;
  }

  private async fixQuery(
    query: GeneratedQuery,
    errorMessage: string
  ): Promise<GeneratedQuery> {
    // Use SQL Query Fixer prompt to correct the query
    const fixer = new QueryFixer();
    return await fixer.fixQuery(query, errorMessage);
  }
}
```

### 6.2 SQL Query Fixer Prompt
**AI Prompt**: `metadata/prompts/templates/query-gen/sql-query-fixer.template.md`

**Prompt Content** (based on Skip's query-fixer.md):
```markdown
# SQL Query Fixer

You are an expert SQL developer tasked with fixing a broken SQL query.

## Original Query
```sql
{{ originalSQL }}
```

## Error Message
```
{{ errorMessage }}
```

## Entity Metadata

{% for entity in entityMetadata %}
### {{ entity.entityName }}
- **Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
- **Description**: {{ entity.description }}

**Available Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }}){% if field.isPrimaryKey %} [PK]{% endif %}{% if field.isForeignKey %} [FK→{{ field.relatedEntity }}]{% endif %}
{% endfor %}
{% endfor %}

## Query Parameters

{% if parameters.length > 0 %}
{% for param in parameters %}
- `{{ param.name }}` ({{ param.type }}){% if param.isRequired %} [REQUIRED]{% endif %} - {{ param.description }}
  - Sample value: `{{ param.sampleValue }}`
{% endfor %}
{% else %}
No parameters defined for this query.
{% endif %}

## Instructions
Analyze the error and fix the SQL query. Common issues:
- Syntax errors (missing commas, parentheses, keywords)
- Invalid column names (check entity metadata)
- Type mismatches (ensure correct types for parameters)
- Missing JOINs or incorrect JOIN conditions
- Aggregation errors (missing GROUP BY, invalid aggregate usage)
- Subquery issues

## Requirements
1. Preserve the query's intent and logic
2. Fix only what's broken (minimal changes)
3. Maintain Nunjucks parameter syntax
4. Ensure SQL is valid for SQL Server
5. Update parameters array if needed

## Output Format
Return JSON with corrected query:

```json
{
  "sql": "SELECT ... (corrected)",
  "selectClause": [...],
  "parameters": [...],
  "changesSummary": "Fixed missing GROUP BY clause for aggregate functions"
}
```
```

**AI Prompt Configuration** (`.prompts.json`):
```json
{
  "fields": {
    "Name": "SQL Query Fixer",
    "Description": "Fixes SQL syntax and logic errors in generated queries",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/query-gen/sql-query-fixer.template.md",
    "Status": "Active",
    "ResponseFormat": "JSON",
    "SelectionStrategy": "Specific",
    "PowerPreference": "Highest",
    "ParallelizationMode": "None",
    "OutputType": "object",
    "ValidationBehavior": "Strict",
    "MaxRetries": 3,
    "FailoverMaxAttempts": 5,
    "PromptRole": "System",
    "PromptPosition": "First",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 1 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras", "Priority": 3 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.5 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 4 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT 5-nano", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 6 } }
    ]
  }
}
```

---

## Phase 7: Query Refinement & Evaluation (Week 6)

### 7.1 Query Evaluator Prompt
**Purpose**: Assess if the query answers the business question correctly

**AI Prompt**: `metadata/prompts/templates/query-gen/query-evaluator.template.md`

**Prompt Content**:
```markdown
# Query Result Evaluator

You are a data analyst evaluating whether a SQL query answers a business question correctly.

## Business Question
**User Question**: {{ userQuestion }}
**Description**: {{ description }}
**Technical Description**: {{ technicalDescription }}

## Generated SQL Query
```sql
{{ generatedSQL }}
```

## Query Parameters
{% if parameters.length > 0 %}
{% for param in parameters %}
- `{{ param.name }}` ({{ param.type }}){% if param.isRequired %} [REQUIRED]{% endif %} - {{ param.description }}
  - Sample value used: `{{ param.sampleValue }}`
{% endfor %}
{% else %}
No parameters defined for this query.
{% endif %}

## Sample Results (Limited to Top 10 Rows for Efficiency)

{% if sampleResults.length > 0 %}
**Total rows returned**: {{ sampleResults.length }}

{% for row in sampleResults %}
### Row {{ loop.index }}
{% for key, value in row %}
- **{{ key }}**: {{ value }}
{% endfor %}
{% if not loop.last %}---{% endif %}
{% endfor %}

**Note**: Only the first 10 rows are shown to keep the prompt size manageable and reduce token costs.
{% else %}
⚠️ Query returned no results.
{% endif %}

## Instructions
Evaluate if the query answers the business question:
1. **Result Relevance**: Do the results match what was asked?
2. **Data Completeness**: Are all necessary columns present?
3. **Correctness**: Are calculations and aggregations correct?
4. **Usability**: Are results formatted appropriately?

## Output Format
Return JSON evaluation:

```json
{
  "answersQuestion": true,
  "confidence": 0.95,
  "reasoning": "Query correctly aggregates orders by customer and sorts by total revenue descending. Sample results show expected data.",
  "suggestions": [
    "Consider adding customer contact info for better usability",
    "Add date range parameter to filter orders by time period"
  ],
  "needsRefinement": false
}
```
```

**AI Prompt Configuration** (`.prompts.json`):
```json
{
  "fields": {
    "Name": "Query Result Evaluator",
    "Description": "Evaluates if a query correctly answers the business question",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/query-gen/query-evaluator.template.md",
    "Status": "Active",
    "ResponseFormat": "JSON",
    "SelectionStrategy": "Specific",
    "PowerPreference": "Highest",
    "ParallelizationMode": "None",
    "OutputType": "object",
    "ValidationBehavior": "Strict",
    "MaxRetries": 3,
    "FailoverMaxAttempts": 5,
    "PromptRole": "System",
    "PromptPosition": "First",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 1 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras", "Priority": 3 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.5 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 4 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT 5-nano", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 6 } }
    ]
  }
}
```

### 7.2 Query Refiner Implementation
**Purpose**: Iteratively improve queries based on evaluation feedback

**AI Prompt**: `metadata/prompts/templates/query-gen/query-refiner.template.md`

**Prompt Content**:
```markdown
# Query Refiner

You are an expert SQL developer refining a query based on evaluation feedback.

## Original Business Question
**User Question**: {{ userQuestion }}
**Description**: {{ description }}

## Current Query
```sql
{{ currentSQL }}
```

## Evaluation Feedback

**Answers Question**: {% if evaluationFeedback.answersQuestion %}✅ Yes{% else %}❌ No{% endif %}
**Confidence**: {{ evaluationFeedback.confidence * 100 }}%
**Needs Refinement**: {% if evaluationFeedback.needsRefinement %}Yes{% else %}No{% endif %}

**Reasoning**: {{ evaluationFeedback.reasoning }}

{% if evaluationFeedback.suggestions.length > 0 %}
**Suggestions for Improvement**:
{% for suggestion in evaluationFeedback.suggestions %}
{{ loop.index }}. {{ suggestion }}
{% endfor %}
{% endif %}

## Entity Metadata

{% for entity in entityMetadata %}
### {{ entity.entityName }}
- **Schema.View**: `[{{ entity.schemaName }}].[{{ entity.baseView }}]`
- **Description**: {{ entity.description }}

**Available Fields**:
{% for field in entity.fields %}
- `{{ field.name }}` ({{ field.type }}){% if field.isPrimaryKey %} [PK]{% endif %}{% if field.isForeignKey %} [FK→{{ field.relatedEntity }}]{% endif %}
{% endfor %}
{% endfor %}

## Instructions
Refine the query based on suggestions:
1. Address concerns raised in evaluation
2. Implement suggested improvements
3. Maintain query correctness and performance
4. Preserve existing parameters unless changing them improves the query

## Output Format
Return JSON with refined query:

```json
{
  "sql": "SELECT ... (refined)",
  "selectClause": [...],
  "parameters": [...],
  "improvementsSummary": "Added customer contact columns and date range filter as suggested"
}
```
```

**AI Prompt Configuration** (`.prompts.json`):
```json
{
  "fields": {
    "Name": "Query Refiner",
    "Description": "Refines queries based on evaluation feedback",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/query-gen/query-refiner.template.md",
    "Status": "Active",
    "ResponseFormat": "JSON",
    "SelectionStrategy": "Specific",
    "PowerPreference": "Highest",
    "ParallelizationMode": "None",
    "OutputType": "object",
    "ValidationBehavior": "Strict",
    "MaxRetries": 3,
    "FailoverMaxAttempts": 5,
    "PromptRole": "System",
    "PromptPosition": "First",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 1 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Cerebras", "Priority": 3 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.5 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 4 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-OSS-120B", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
      { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT 5-nano", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 6 } }
    ]
  }
}
```

### 7.3 Refinement Loop Implementation
```typescript
class QueryRefiner {
  async refineQuery(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    entityMetadata: EntityMetadataForPrompt[],
    maxRefinements: number = 3
  ): Promise<RefinedQuery> {
    let currentQuery = query;
    let refinementCount = 0;

    while (refinementCount < maxRefinements) {
      // 1. Test the current query
      const testResult = await this.tester.testQuery(currentQuery);

      if (!testResult.success) {
        throw new Error(`Query testing failed: ${testResult.error}`);
      }

      // 2. Evaluate if it answers the question
      const evaluation = await this.evaluateQuery(
        currentQuery,
        businessQuestion,
        testResult.sampleRows
      );

      // 3. If evaluation passes, we're done!
      if (evaluation.answersQuestion && !evaluation.needsRefinement) {
        return {
          query: currentQuery,
          testResult,
          evaluation,
          refinementCount
        };
      }

      // 4. Refine the query based on suggestions
      refinementCount++;
      console.log(`Refinement iteration ${refinementCount}/${maxRefinements}`);

      currentQuery = await this.performRefinement(
        currentQuery,
        businessQuestion,
        evaluation,
        entityMetadata
      );
    }

    // Reached max refinements - return best attempt
    return {
      query: currentQuery,
      testResult: await this.tester.testQuery(currentQuery),
      evaluation: await this.evaluateQuery(currentQuery, businessQuestion, []),
      refinementCount,
      reachedMaxRefinements: true
    };
  }

  private async evaluateQuery(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    sampleResults: any[]
  ): Promise<QueryEvaluation> {
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt({
      prompt: await this.getPrompt('Query Result Evaluator'),
      data: {
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
        technicalDescription: businessQuestion.technicalDescription,
        generatedSQL: query.sql,
        parameters: query.parameters,
        sampleResults
      },
      contextUser: this.contextUser
    });

    return result.result as QueryEvaluation;
  }

  private async performRefinement(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    evaluation: QueryEvaluation,
    entityMetadata: EntityMetadataForPrompt[]
  ): Promise<GeneratedQuery> {
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt({
      prompt: await this.getPrompt('Query Refiner'),
      data: {
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
        currentSQL: query.sql,
        evaluationFeedback: evaluation,
        entityMetadata
      },
      contextUser: this.contextUser
    });

    return result.result as GeneratedQuery;
  }
}
```

---

## Phase 8: Metadata Export (Week 7)

### 8.1 MetadataExporter Implementation
**Purpose**: Export validated queries to MJ metadata format

**Output Format**: MJ Queries metadata JSON file

```typescript
class MetadataExporter {
  async exportQueries(
    validatedQueries: ValidatedQuery[],
    outputDirectory: string
  ): Promise<ExportResult> {
    // 1. Transform to MJ Query metadata format
    const metadata = validatedQueries.map(q => this.toQueryMetadata(q));

    // 2. Create metadata file structure
    const metadataFile = {
      timestamp: new Date().toISOString(),
      generatedBy: 'query-gen',
      version: '1.0',
      queries: metadata
    };

    // 3. Write to file
    const outputPath = path.join(outputDirectory, `queries-${Date.now()}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(metadataFile, null, 2),
      'utf-8'
    );

    return {
      success: true,
      outputPath,
      queryCount: metadata.length
    };
  }

  private toQueryMetadata(query: ValidatedQuery): QueryMetadataRecord {
    return {
      fields: {
        Name: this.generateQueryName(query.businessQuestion),
        CategoryID: '@lookup:Query Categories.Name=Auto-Generated',
        UserQuestion: query.businessQuestion.userQuestion,
        Description: query.businessQuestion.description,
        TechnicalDescription: query.businessQuestion.technicalDescription,
        SQL: query.query.sql,
        OriginalSQL: query.query.sql,
        UsesTemplate: true,
        Status: 'Active'
      },
      relatedEntities: {
        'Query Fields': query.query.selectClause.map((field, i) => ({
          fields: {
            QueryID: '@parent:ID',
            Name: field.name,
            Description: field.description,
            SQLBaseType: field.type,
            Sequence: i + 1
          }
        })),
        'Query Params': query.query.parameters.map((param, i) => ({
          fields: {
            QueryID: '@parent:ID',
            Name: param.name,
            Type: param.type,
            Description: param.description,
            ValidationFilters: param.usage.join(', '),
            IsRequired: param.isRequired,
            DefaultValue: param.defaultValue,
            Sequence: i + 1
          }
        }))
      }
    };
  }

  private generateQueryName(question: BusinessQuestion): string {
    // Convert user question to a concise name
    // "What are the top customers by revenue?" -> "Top Customers By Revenue"
    return question.userQuestion
      .replace(/\?/g, '')
      .split(' ')
      .filter(word => word.length > 2)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .slice(0, 5)
      .join(' ');
  }
}
```

### 8.2 Database Direct Insert (Optional)
**Purpose**: Alternative to metadata files - insert directly into database

```typescript
class QueryDatabaseWriter {
  async writeQueriesToDatabase(
    validatedQueries: ValidatedQuery[],
    contextUser: UserInfo
  ): Promise<WriteResult> {
    const md = new Metadata();
    const results: string[] = [];

    for (const vq of validatedQueries) {
      try {
        // 1. Create Query entity
        const query = await md.GetEntityObject<QueryEntity>('Queries', contextUser);
        query.NewRecord();
        query.Name = this.generateQueryName(vq.businessQuestion);
        query.CategoryID = await this.findOrCreateCategory('Auto-Generated');
        query.UserQuestion = vq.businessQuestion.userQuestion;
        query.Description = vq.businessQuestion.description;
        query.TechnicalDescription = vq.businessQuestion.technicalDescription;
        query.SQL = vq.query.sql;
        query.OriginalSQL = vq.query.sql;
        query.UsesTemplate = true;
        query.Status = 'Active';

        const saved = await query.Save();
        if (!saved) {
          throw new Error(`Failed to save query: ${query.LatestResult?.Message}`);
        }

        // 2. Create Query Fields
        for (let i = 0; i < vq.query.selectClause.length; i++) {
          const field = vq.query.selectClause[i];
          const qf = await md.GetEntityObject<QueryFieldEntity>('Query Fields', contextUser);
          qf.NewRecord();
          qf.QueryID = query.ID;
          qf.Name = field.name;
          qf.Description = field.description;
          qf.SQLBaseType = field.type;
          qf.Sequence = i + 1;
          await qf.Save();
        }

        // 3. Create Query Params
        for (let i = 0; i < vq.query.parameters.length; i++) {
          const param = vq.query.parameters[i];
          const qp = await md.GetEntityObject<QueryParamEntity>('Query Params', contextUser);
          qp.NewRecord();
          qp.QueryID = query.ID;
          qp.Name = param.name;
          qp.Type = param.type;
          qp.Description = param.description;
          qp.IsRequired = param.isRequired;
          qp.DefaultValue = param.defaultValue;
          qp.Sequence = i + 1;
          await qp.Save();
        }

        results.push(`✓ ${query.Name} (ID: ${query.ID})`);

      } catch (error) {
        results.push(`✗ ${vq.businessQuestion.userQuestion}: ${extractErrorMessage(error, 'Database Write')}`);
      }
    }

    return {
      success: true,
      results
    };
  }
}
```

---

## Phase 9: CLI Implementation (Week 8)

### 9.1 CLI Command Structure
```typescript
// src/cli/index.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('mj querygen')
  .description('AI-powered SQL query template generation for MemberJunction')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate queries for entities')
  .option('-e, --entities <names...>', 'Specific entities to generate queries for')
  .option('-x, --exclude-entities <names...>', 'Entities to exclude')
  .option('-s, --exclude-schemas <names...>', 'Schemas to exclude')
  .option('-m, --max-entities <number>', 'Max entities per group', '3')
  .option('-r, --max-refinements <number>', 'Max refinement iterations', '3')
  .option('-f, --max-fixes <number>', 'Max error-fixing attempts', '5')
  .option('--model <name>', 'Preferred AI model')
  .option('--vendor <name>', 'Preferred AI vendor')
  .option('-o, --output <path>', 'Output directory', './metadata/queries')
  .option('--mode <mode>', 'Output mode: metadata|database|both', 'metadata')
  .option('-v, --verbose', 'Verbose output')
  .action(generateCommand);

program
  .command('validate')
  .description('Validate existing query templates')
  .option('-p, --path <path>', 'Path to queries metadata file')
  .action(validateCommand);

program
  .command('export')
  .description('Export queries from database to metadata files')
  .option('-o, --output <path>', 'Output directory')
  .action(exportCommand);

program.parse();
```

### 9.2 Generate Command Implementation
```typescript
async function generateCommand(options: any): Promise<void> {
  const spinner = ora('Initializing query generation...').start();

  try {
    // 1. Load configuration
    const config = await loadConfig(options);

    // 2. Connect to database and load metadata
    spinner.text = 'Loading metadata...';
    await Metadata.Provider.Config(false, contextUser);

    // 3. Build entity groups
    spinner.text = 'Analyzing entity relationships...';
    const grouper = new EntityGrouper(config);
    const entityGroups = await grouper.generateEntityGroups();
    spinner.succeed(`Found ${entityGroups.length} entity groups`);

    // 4. Initialize vector similarity search
    spinner.start('Embedding golden queries...');
    const embeddingService = new EmbeddingService(config.embeddingModel);
    const goldenQueries = await loadGoldenQueries();
    const embeddedGolden = await embeddingService.embedGoldenQueries(goldenQueries);
    spinner.succeed(`Embedded ${goldenQueries.length} golden queries`);

    // 5. Generate queries for each entity group
    const totalGroups = entityGroups.length;
    let processedGroups = 0;
    const allValidatedQueries: ValidatedQuery[] = [];

    for (const group of entityGroups) {
      processedGroups++;
      spinner.start(`[${processedGroups}/${totalGroups}] Processing ${group.primaryEntity.Name}...`);

      try {
        // 5a. Generate business questions
        const questionGen = new QuestionGenerator(config);
        const questions = await questionGen.generateQuestions(group);

        // 5b. For each question, generate and validate query
        for (const question of questions) {
          spinner.text = `[${processedGroups}/${totalGroups}] Generating query: ${question.userQuestion}`;

          // Embed question for similarity search
          const questionEmbedding = await embeddingService.embedQuery({
            name: '',
            userQuestion: question.userQuestion,
            description: question.description,
            technicalDescription: question.technicalDescription,
            sql: ''
          });

          // Find similar golden queries
          const similaritySearch = new SimilaritySearch();
          const fewShotExamples = await similaritySearch.findSimilarQueries(
            questionEmbedding,
            embeddedGolden,
            config.topSimilarQueries,
            config.similarityThreshold
          );

          // Generate SQL query
          const queryWriter = new QueryWriter(config);
          const generatedQuery = await queryWriter.generateQuery(
            question,
            group.entities.map(e => formatEntityMetadata(e)),
            fewShotExamples.map(s => s.query)
          );

          // Test and fix query
          const queryTester = new QueryTester(config);
          const testResult = await queryTester.testQuery(
            generatedQuery,
            config.maxFixingIterations
          );

          if (!testResult.success) {
            spinner.warn(`Query failed after ${config.maxFixingIterations} attempts: ${question.userQuestion}`);
            continue;
          }

          // Refine query
          const queryRefiner = new QueryRefiner(config);
          const refinedResult = await queryRefiner.refineQuery(
            generatedQuery,
            question,
            group.entities.map(e => formatEntityMetadata(e)),
            config.maxRefinementIterations
          );

          allValidatedQueries.push({
            businessQuestion: question,
            query: refinedResult.query,
            testResult: refinedResult.testResult,
            evaluation: refinedResult.evaluation,
            entityGroup: group
          });

          spinner.text = `[${processedGroups}/${totalGroups}] ✓ ${question.userQuestion}`;
        }

        spinner.succeed(`[${processedGroups}/${totalGroups}] ${group.primaryEntity.Name} complete (${questions.length} queries)`);

      } catch (error) {
        spinner.warn(`[${processedGroups}/${totalGroups}] Error processing ${group.primaryEntity.Name}: ${extractErrorMessage(error, 'Query Generation')}`);
      }
    }

    // 6. Export results
    spinner.start(`Exporting ${allValidatedQueries.length} queries...`);

    if (config.outputMode === 'metadata' || config.outputMode === 'both') {
      const exporter = new MetadataExporter();
      const exportResult = await exporter.exportQueries(
        allValidatedQueries,
        config.outputDirectory
      );
      spinner.succeed(`Exported to ${exportResult.outputPath}`);
    }

    if (config.outputMode === 'database' || config.outputMode === 'both') {
      const dbWriter = new QueryDatabaseWriter();
      const writeResult = await dbWriter.writeQueriesToDatabase(
        allValidatedQueries,
        contextUser
      );
      spinner.succeed(`Wrote ${allValidatedQueries.length} queries to database`);
    }

    // 7. Summary
    console.log('\n✅ Query generation complete!\n');
    console.log(`Entity Groups Processed: ${processedGroups}`);
    console.log(`Queries Generated: ${allValidatedQueries.length}`);
    console.log(`Output Location: ${config.outputDirectory}`);

  } catch (error) {
    spinner.fail('Query generation failed');
    console.error(extractErrorMessage(error, 'Query Generation'));
    process.exit(1);
  }
}
```

### 9.3 Progress Reporting
**Features**:
- Use `ora` for spinners during long operations
- Use `chalk` for colored console output
- Show progress for each entity group: `[3/15] Processing Customers...`
- Display summary statistics at the end
- Save detailed logs to file if verbose mode enabled

---

## Phase 10: Testing & Documentation (Week 9)

### 10.1 Unit Tests
**Test Coverage**:
- Entity grouping logic
- Vector similarity search
- Query parameter rendering
- SQL execution and error handling
- Metadata export format

### 10.2 Integration Tests
**Test Scenarios**:
- Full generation workflow on test database
- AI prompt failover scenarios
- Query refinement iterations
- Database vs. metadata output modes

### 10.3 Documentation
**README.md Contents**:
- Installation instructions
- Configuration guide
- CLI command reference
- Example workflows
- Troubleshooting guide

**Example Usage**:
```bash
# Generate queries for all entities
mj querygen generate

# Generate for specific entities
mj querygen generate -e Customers Orders Products

# Exclude schemas
mj querygen generate -s __mj internal

# Override AI model
mj querygen generate --model "Claude 4.5 Sonnet" --vendor Anthropic

# Output to database
mj querygen generate --mode database

# Verbose output
mj querygen generate -v
```

---

## Phase 11: Optimization & Polish (Week 10)

### 11.1 Performance Optimizations
- **Parallel Processing**: Generate queries for multiple entity groups in parallel (config: `parallelGenerations: 3`)
- **Caching**: Cache AI prompt results to avoid re-running identical prompts
- **Connection Pooling**: Reuse database connections efficiently
- **Streaming**: Process large entity lists in batches

### 11.2 Error Handling Improvements
- Graceful degradation when AI models are unavailable
- Detailed error logs with context
- Retry logic with exponential backoff
- User-friendly error messages

### 11.3 Code Quality
- ESLint/Prettier formatting
- TypeScript strict mode
- Comprehensive JSDoc comments
- Refactor long functions (follow functional decomposition guidelines)

---

## Summary Timeline

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Project Setup | Week 1 | Package structure, config system, dependencies |
| 2. Entity Analysis | Week 2 | EntityGrouper, relationship graph |
| 3. Business Questions | Week 2-3 | QuestionGenerator, AI prompt |
| 4. Vector Similarity | Week 3 | EmbeddingService, SimilaritySearch |
| 5. SQL Generation | Week 4 | QueryWriter, few-shot learning |
| 6. Query Testing | Week 5 | QueryTester, QueryFixer, error handling |
| 7. Query Refinement | Week 6 | QueryRefiner, evaluation loop |
| 8. Metadata Export | Week 7 | MetadataExporter, database writer |
| 9. CLI Implementation | Week 8 | Command structure, progress reporting |
| 10. Testing & Docs | Week 9 | Unit tests, integration tests, README |
| 11. Optimization | Week 10 | Performance tuning, error handling, polish |

**Total Duration**: ~10 weeks

---

## Key Design Decisions Summary

1. **Configuration**: Integrate with `mj.config.cjs` for consistency
2. **Golden Queries**: Embed as JSON file in `src/data/` directory
3. **AI Prompts**: 5 new prompts with 6-model failover configuration
4. **Vector Search**: Use local embeddings (`all-MiniLM-L6-v2`) for similarity
5. **Testing Strategy**: Render with sample values → execute → fix → refine
6. **Output Modes**: Metadata files (default), database, or both
7. **Parallelization**: Process multiple entity groups concurrently
8. **Error Handling**: Follow MJ standards with `extractErrorMessage` utility

---

This comprehensive plan provides a clear roadmap for implementing the `@memberjunction/query-gen` package. The phased approach ensures steady progress with testable milestones at each stage.
