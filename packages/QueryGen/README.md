# @memberjunction/query-gen

AI-powered generation of domain-specific SQL query templates with automatic testing, refinement, and metadata export.

## Overview

QueryGen is a MemberJunction package that automatically generates SQL query templates from your database schema using AI. It analyzes entity relationships, generates meaningful business questions, and creates tested, validated SQL queries that can be used throughout your application.

## Features

- **Entity Analysis**: Automatically groups related entities based on foreign key relationships
- **Business Question Generation**: AI generates realistic business questions for each entity group
- **Few-Shot Learning**: Uses golden query examples to guide SQL generation
- **Automatic Testing**: Tests generated queries against your database with sample data
- **Error Fixing**: Automatically fixes SQL syntax and logic errors through AI
- **Query Refinement**: Iteratively improves queries based on evaluation feedback
- **Metadata Export**: Exports queries to MJ metadata format or directly to database

## Installation

```bash
npm install @memberjunction/query-gen
```

## Usage

### CLI Commands

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

### Configuration

Add to your `mj.config.cjs`:

```javascript
module.exports = {
  queryGeneration: {
    // Entity Filtering
    includeEntities: ['*'],
    excludeEntities: [],
    excludeSchemas: ['__mj'],

    // Entity Grouping
    maxEntitiesPerGroup: 3,
    minEntitiesPerGroup: 1,
    questionsPerGroup: 2,

    // AI Configuration
    embeddingModel: 'all-MiniLM-L6-v2',

    // Iteration Limits
    maxRefinementIterations: 3,
    maxFixingIterations: 5,

    // Few-Shot Learning
    topSimilarQueries: 5,
    similarityThreshold: 0.7,

    // Output Configuration
    outputMode: 'metadata',
    outputDirectory: './metadata/queries',

    // Performance
    parallelGenerations: 3,
    enableCaching: true,

    // Validation
    testWithSampleData: true,
    requireMinRows: 1,

    // Verbose Logging
    verbose: false
  }
};
```

## How It Works

1. **Entity Grouping**: Analyzes foreign key relationships to create logical groups of 1-N related entities
2. **Question Generation**: Uses AI to generate business questions for each entity group
3. **Similarity Search**: Finds similar golden queries using vector embeddings for few-shot learning
4. **SQL Generation**: AI generates Nunjucks SQL templates using few-shot examples
5. **Testing & Fixing**: Renders templates with sample values and executes them, fixing errors automatically
6. **Refinement**: Evaluates if queries answer the business questions correctly and refines them
7. **Export**: Exports validated queries to metadata files or database

## AI Prompts

QueryGen uses 5 AI prompts:

- **Business Question Generator**: Generates domain-specific business questions
- **SQL Query Writer**: Creates Nunjucks SQL templates
- **SQL Query Fixer**: Fixes SQL errors automatically
- **Query Result Evaluator**: Evaluates if queries answer the questions
- **Query Refiner**: Improves queries based on feedback

All prompts use a 6-model failover configuration for high availability.

## Package Structure

```
packages/QueryGen/
├── src/
│   ├── cli/              # CLI commands and configuration
│   ├── core/             # Core query generation logic
│   ├── prompts/          # AI prompt name constants
│   ├── vectors/          # Vector similarity search
│   ├── data/             # Golden queries and schemas
│   ├── utils/            # Utility functions
│   └── index.ts          # Package entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Development Status

This package is currently under active development. Phase 1 (Project Setup) is complete.

## License

MIT

## Contributing

See the main MemberJunction repository for contribution guidelines.
