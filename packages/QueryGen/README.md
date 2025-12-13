# QueryGen - AI-Powered SQL Query Template Generator

**@memberjunction/query-gen** is a comprehensive tool for generating domain-specific SQL query templates using artificial intelligence. It analyzes your database schema, generates meaningful business questions, creates SQL queries, tests them, refines them through iterative feedback, and exports them to MemberJunction metadata format.

## Overview

QueryGen automates the creation of SQL query templates through an 11-phase pipeline:

1. **Entity Analysis** - Analyzes database schema and entity relationships
2. **Entity Grouping** - Creates logical groups of 1-N related entities
3. **Business Question Generation** - Uses AI to generate domain-specific questions
4. **Vector Similarity Search** - Finds similar golden queries for few-shot learning
5. **SQL Generation** - Generates Nunjucks SQL templates using AI
6. **Query Testing** - Executes queries and validates results
7. **Error Fixing** - Automatically fixes SQL errors using AI
8. **Query Evaluation** - Assesses if queries answer business questions correctly
9. **Query Refinement** - Iteratively improves queries based on feedback
10. **Testing & Validation** - Comprehensive validation workflow
11. **Metadata Export** - Exports to MJ metadata format or database

## Installation

```bash
# From MJ repository root
cd packages/QueryGen
npm install
npm run build

# Link for global CLI usage (optional)
npm link
```

## Quick Start

### Basic Usage

```bash
# Generate queries for all entities
mj-querygen generate

# Generate with verbose output
mj-querygen generate -v

# Generate for specific entities
mj-querygen generate -e Customers Orders Products

# Exclude specific schemas
mj-querygen generate -s sys INFORMATION_SCHEMA
```

### Validate Existing Queries

```bash
# Validate all queries in default directory
mj-querygen validate

# Validate queries in specific directory
mj-querygen validate -p ./metadata/queries
```

### Export Queries from Database

```bash
# Export all queries to metadata files
mj-querygen export

# Export to specific directory
mj-querygen export -o ./exported-queries
```

## Configuration

### CLI Options

#### Generate Command

```bash
mj-querygen generate [options]

Options:
  -e, --entities <names...>        Specific entities to generate queries for
  -x, --exclude-entities <names...> Entities to exclude from generation
  -s, --exclude-schemas <names...>  Schemas to exclude (default: sys, INFORMATION_SCHEMA)
  -m, --max-entities <number>       Max entities per group (default: 3)
  -r, --max-refinements <number>    Max refinement iterations (default: 3)
  -f, --max-fixes <number>          Max error-fixing attempts (default: 5)
  --model <name>                    Preferred AI model (overrides config)
  --vendor <name>                   Preferred AI vendor (overrides config)
  -o, --output <path>               Output directory (default: ./metadata/queries)
  --mode <mode>                     Output mode: metadata|database|both (default: metadata)
  -v, --verbose                     Enable verbose output
  -h, --help                        Display help information
```

#### Validate Command

```bash
mj-querygen validate [options]

Options:
  -p, --path <path>    Path to queries metadata directory (default: ./metadata/queries)
  -v, --verbose        Enable verbose output
  -h, --help           Display help information
```

#### Export Command

```bash
mj-querygen export [options]

Options:
  -o, --output <path>  Output directory (default: ./metadata/queries)
  -v, --verbose        Enable verbose output
  -h, --help           Display help information
```

### Configuration File (mj.config.cjs)

Add a `queryGen` section to your `mj.config.cjs` file:

```javascript
module.exports = {
  // ... other MJ configuration

  queryGen: {
    // Entity Filtering
    includeEntities: ['*'],           // Default: all entities
    excludeEntities: [],              // Default: none
    excludeSchemas: ['sys', 'INFORMATION_SCHEMA'], // Exclude system schemas

    // Entity Grouping
    maxEntitiesPerGroup: 3,           // Max entities in a query (1-N)
    minEntitiesPerGroup: 1,           // Min entities (1 = single-table queries)
    questionsPerGroup: 2,             // Questions to generate per entity group
    entityGroupStrategy: 'breadth',   // 'breadth' or 'depth' traversal

    // AI Configuration
    modelOverride: undefined,         // Optional: specific AI model
    vendorOverride: undefined,        // Optional: specific AI vendor
    embeddingModel: 'text-embedding-3-small', // Embedding model for similarity

    // Iteration Limits
    maxRefinementIterations: 3,       // Max refinement cycles
    maxFixingIterations: 5,           // Max error-fixing attempts

    // Few-Shot Learning
    topSimilarQueries: 5,             // Number of example queries to use
    similarityThreshold: 0.7,         // Minimum similarity score (informational)

    // Similarity Weighting
    similarityWeights: {
      name: 0.1,                      // 10% weight for name similarity
      userQuestion: 0.2,              // 20% weight for question similarity
      description: 0.35,              // 35% weight for description similarity
      technicalDescription: 0.35      // 35% weight for technical description
    },

    // Output Configuration
    outputMode: 'metadata',           // 'metadata', 'database', or 'both'
    outputDirectory: './metadata/queries',

    // Performance
    parallelGenerations: 1,           // Number of parallel query generations
    enableCaching: true,              // Cache AI prompt results

    // Validation
    testWithSampleData: true,         // Test queries before export
    requireMinRows: 0,                // Minimum rows required (0 = optional)
    maxRefinementRows: 10,            // Max rows used for refinement evaluation

    // Logging
    verbose: false                    // Enable verbose logging
  }
};
```

### Configuration Priority

Configuration is merged in this order (highest to lowest priority):

1. **CLI options** - Command line flags
2. **mj.config.cjs** - queryGen section
3. **Default values** - Built-in defaults

## Architecture

### 11-Phase Pipeline

QueryGen orchestrates an 11-phase workflow:

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Entity Analysis                                    │
│ - Load entities from Metadata                               │
│ - Filter by include/exclude lists                           │
│ - Build foreign key relationship graph                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Entity Grouping                                    │
│ - Generate combinations of 1-N related entities             │
│ - Use breadth-first traversal for focused groups            │
│ - Deduplicate entity groups                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Business Question Generation                       │
│ - Use AI to generate domain-specific questions              │
│ - 1-2 questions per entity group                            │
│ - Vary complexity (simple aggregations → complex joins)     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Vector Similarity Search                           │
│ - Embed business question using local embeddings            │
│ - Find top-K similar golden queries                         │
│ - Weighted cosine similarity across multiple fields         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: SQL Query Generation                               │
│ - Use AI with few-shot examples                             │
│ - Generate Nunjucks SQL templates                           │
│ - Define parameters and output fields                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Query Testing                                      │
│ - Render template with sample parameter values              │
│ - Execute SQL against database                              │
│ - Validate results (row count, schema)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 7: Error Fixing (if needed)                           │
│ - Pass error message to AI                                  │
│ - AI fixes SQL syntax/logic errors                          │
│ - Retry up to maxFixingIterations                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 8: Query Evaluation                                   │
│ - AI evaluates if query answers business question           │
│ - Checks result relevance, completeness, correctness        │
│ - Generates improvement suggestions                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 9: Query Refinement (if needed)                       │
│ - AI refines query based on evaluation feedback             │
│ - Iterative loop up to maxRefinementIterations              │
│ - Returns best refined query                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 10: Validation                                        │
│ - Comprehensive validation of all generated queries         │
│ - Type checking, parameter validation, execution tests      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 11: Metadata Export                                   │
│ - Export to JSON metadata files (metadata mode)             │
│ - Insert into database tables (database mode)               │
│ - Create Queries, Query Fields, Query Params records        │
└─────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed technical architecture.

## Core Components

### EntityGrouper

Analyzes entity relationships and creates logical groups:

```typescript
const grouper = new EntityGrouper();
const groups = await grouper.generateEntityGroups(entities, 1, 3);
// Returns groups of 1-3 related entities
```

### QuestionGenerator

Generates business questions using AI:

```typescript
const generator = new QuestionGenerator(contextUser);
const questions = await generator.generateQuestions(entityGroup);
```

### QueryWriter

Generates SQL templates using AI with few-shot learning:

```typescript
const writer = new QueryWriter(contextUser);
const query = await writer.generateQuery(
  businessQuestion,
  entityMetadata,
  fewShotExamples
);
```

### QueryTester

Tests queries and fixes errors:

```typescript
const tester = new QueryTester(dataProvider, entityMetadata, question, contextUser);
const result = await tester.testQuery(query, 5); // max 5 attempts
```

### QueryRefiner

Evaluates and refines queries iteratively:

```typescript
const refiner = new QueryRefiner(tester, contextUser);
const refined = await refiner.refineQuery(
  query,
  businessQuestion,
  entityMetadata,
  3 // max refinements
);
```

### MetadataExporter

Exports validated queries to metadata files:

```typescript
const exporter = new MetadataExporter();
const result = await exporter.exportQueries(
  validatedQueries,
  './metadata/queries'
);
```

### QueryDatabaseWriter

Writes queries directly to database:

```typescript
const writer = new QueryDatabaseWriter();
await writer.writeQueriesToDatabase(validatedQueries, contextUser);
```

## Workflow Examples

### Example 1: Generate Queries for Specific Entities

```bash
# Generate queries for customer-related entities
mj-querygen generate \
  -e Customers Orders "Order Details" Products \
  -m 2 \
  -v

# Output:
# ✓ Metadata loaded
# ✓ Found 6 entity groups
# ✓ Embedded 20 golden queries
# [1/6] Processing Customers...
# [1/6] ✓ Customers complete (2 queries)
# [2/6] Processing Orders...
# [2/6] ✓ Orders complete (2 queries)
# ...
# ✓ Exported to ./metadata/queries/queries-1234567890.json
#
# ✓ Query generation complete!
#
# Summary:
#   Entity Groups Processed: 6
#   Queries Generated: 12
#   Output Location: ./metadata/queries
```

### Example 2: Validate Existing Queries

```bash
# Validate all queries in metadata directory
mj-querygen validate -p ./metadata/queries -v

# Output:
# ✓ Metadata loaded
# ✓ Found 3 query files
# [1/3] Validating queries-1234567890.json...
# [1/3] ✓ Top Customers By Revenue
# [1/3] ✓ Recent Orders By Status
# [1/3] ✗ Product Sales Analysis: Column 'ProductName' not found
# ...
# ⚠ Validation completed with errors
#
# Summary:
#   Total Queries: 15
#   Passed: 12
#   Failed: 3
```

### Example 3: Export Database Queries to Metadata

```bash
# Export all queries from database
mj-querygen export -o ./exported-queries -v

# Output:
# ✓ Metadata loaded
# ✓ Found 25 queries
# [1/25] Exporting Customer Summary...
# [1/25] ✓ Exported Customer Summary
# ...
# ✓ All 25 queries exported successfully!
```

## Troubleshooting

### Common Errors

#### Database Connection Errors

**Error**: `Metadata provider not configured`

**Solution**: Ensure database connection is configured in `mj.config.cjs`

#### AI Prompt Failures

**Error**: `Prompt 'Business Question Generator' not found`

**Solution**: Sync AI prompts to database with `npx mj-sync push`

#### Template Rendering Errors

**Error**: `Template rendering failed: Unknown filter 'sqlString'`

**Solution**: Verify QueryParameterProcessor is imported and SQL filters are registered

#### Validation Failures

**Error**: `Query returned no results`

**Solution**: Ensure database has sample data or set `requireMinRows: 0`

### Performance Issues

#### Slow Generation

**Solutions**:
- Reduce `maxEntitiesPerGroup` (3 → 2)
- Reduce `questionsPerGroup` (2 → 1)
- Increase `parallelGenerations` (1 → 3)
- Enable `enableCaching: true`

#### High Token Costs

**Solutions**:
- Use cheaper models (Gemini 2.5 Flash, GPT 5-nano)
- Reduce `topSimilarQueries` (5 → 3)
- Reduce `maxRefinementIterations` (3 → 2)
- Reduce `maxFixingIterations` (5 → 3)

## Programmatic Usage

QueryGen can be used as a library in your applications:

```typescript
import {
  EntityGrouper,
  QuestionGenerator,
  QueryWriter,
  QueryTester,
  QueryRefiner,
  MetadataExporter
} from '@memberjunction/query-gen';

async function generateQueriesForEntity(entityName: string, contextUser: UserInfo) {
  // 1. Load entity metadata
  const md = new Metadata();
  const entity = md.Entities.find(e => e.Name === entityName);

  // 2. Create entity group
  const grouper = new EntityGrouper();
  const groups = await grouper.generateEntityGroups([entity], 1, 1);

  // 3. Generate business questions
  const questionGen = new QuestionGenerator(contextUser);
  const questions = await questionGen.generateQuestions(groups[0]);

  // 4. Generate and test SQL queries
  const queryWriter = new QueryWriter(contextUser);
  const query = await queryWriter.generateQuery(
    questions[0],
    entityMetadata,
    fewShotExamples
  );

  // 5. Test and refine
  const tester = new QueryTester(dataProvider, entityMetadata, questions[0], contextUser);
  const testResult = await tester.testQuery(query, 5);

  if (testResult.success) {
    const refiner = new QueryRefiner(tester, contextUser);
    const refined = await refiner.refineQuery(query, questions[0], entityMetadata, 3);
    return refined.query;
  }
}
```

See [docs/API.md](./docs/API.md) for detailed API documentation.

## Environment Requirements

### Database

- SQL Server 2016 or later
- MemberJunction metadata tables populated
- Sample data for query testing (recommended)

### AI Models

QueryGen uses 5 AI prompts, each configured with 6 models:

1. Claude 4.5 Sonnet (Anthropic) - Priority 1
2. Kimi K2 (Groq) - Priority 2
3. Kimi K2 (Cerebras) - Priority 3
4. Gemini 2.5 Flash (Google) - Priority 4
5. GPT-OSS-120B (Groq) - Priority 5
6. GPT 5-nano (OpenAI) - Priority 6

### Embeddings

- Default: `text-embedding-3-small`
- Runs via AIEngine's `EmbedTextLocal()` method
- No external API calls required

## Best Practices

1. **Start Small**: Begin with 1-2 entities
2. **Sample Data**: Ensure representative sample data exists
3. **Refinement**: Use 3-5 refinement cycles for best results
4. **Golden Queries**: Maintain high-quality golden query library
5. **Review**: Always review generated queries before use

## Contributing

QueryGen is part of the MemberJunction project. Contributions are welcome!

```bash
# Development setup
cd MJ/packages/QueryGen
npm install
npm run build

# Run in watch mode
npm run watch

# Lint and format
npm run lint
npm run format
```

## Support

- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.com
- Community: https://community.memberjunction.com

## Related Documentation

- [Architecture Deep Dive](./docs/ARCHITECTURE.md) - Technical details
- [API Documentation](./docs/API.md) - Programmatic API reference
- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Development roadmap
- [MemberJunction Docs](https://docs.memberjunction.com) - Platform documentation

## License

MIT License - see LICENSE file for details
