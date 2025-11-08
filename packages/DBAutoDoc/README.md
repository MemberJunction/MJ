# DBAutoDoc - AI-Powered Database Documentation Generator

Automatically generate comprehensive documentation for SQL Server databases using AI. DBAutoDoc analyzes your database structure, uses Large Language Models to understand the purpose of tables and columns, and saves descriptions as SQL Server extended properties.

## Features

- **🤖 AI-Powered Analysis** - Uses OpenAI, Anthropic, or Groq to generate intelligent descriptions
- **🔄 Iterative Refinement** - Multi-pass analysis with backpropagation for accuracy
- **📊 Topological Processing** - Analyzes tables in dependency order for better context
- **📈 Data-Driven** - Leverages cardinality, statistics, and sample data for insights
- **🎯 Convergence Detection** - Automatically knows when analysis is complete
- **💾 State Tracking** - Full audit trail of all iterations and reasoning
- **🔌 Standalone** - Works with ANY SQL Server database, no MemberJunction required
- **📝 Multiple Outputs** - SQL scripts, Markdown docs, and analysis reports

## Installation

### Global Installation (Recommended for DBAs)

```bash
npm install -g @memberjunction/db-auto-doc
```

### Within MemberJunction Project

```bash
npm install @memberjunction/db-auto-doc
```

## Quick Start

### 1. Initialize

```bash
db-auto-doc init
```

This interactive wizard will:
- Configure database connection
- Set up AI provider (OpenAI, Anthropic, or Groq)
- Optionally add seed context for better analysis
- Create `config.json`

### 2. Analyze

```bash
db-auto-doc analyze
```

This will:
- Introspect your database structure
- Analyze data (cardinality, statistics, patterns)
- Build dependency graph
- Run iterative AI analysis with backpropagation
- Perform sanity checks
- Save state to `db-doc-state.json`

### 3. Export

```bash
db-auto-doc export --sql --markdown
```

This generates:
- **SQL Script**: `sp_addextendedproperty` statements
- **Markdown Documentation**: Human-readable docs

Optionally apply directly to database:

```bash
db-auto-doc export --sql --apply
```

### 4. Check Status

```bash
db-auto-doc status
```

Shows:
- Analysis progress
- Convergence status
- Low-confidence tables
- Token usage and cost

## How It Works

### Topological Analysis

DBAutoDoc processes tables in dependency order:

```
Level 0: Users, Products, Categories (no dependencies)
  ↓
Level 1: Orders (depends on Users), ProductCategories (Products + Categories)
  ↓
Level 2: OrderItems (depends on Orders + Products)
  ↓
Level 3: Shipments (depends on OrderItems)
```

Processing in this order allows child tables to benefit from parent table context.

### Backpropagation

After analyzing child tables, DBAutoDoc can detect insights about parent tables and trigger re-analysis:

```
Level 0: "Persons" → Initially thinks: "General contact information"
  ↓
Level 1: "Students" table reveals Persons.Type has values: Student, Teacher, Staff
  ↓
BACKPROPAGATE to Level 0: "Persons" → Revise to: "School personnel with role-based typing"
```

### Convergence

Analysis stops when:
1. **No changes** in last N iterations
2. **All tables** meet confidence threshold
3. **Max iterations** reached

### Data Analysis

For each column, DBAutoDoc collects:
- **Cardinality**: Distinct value counts
- **Statistics**: Min, max, average, standard deviation
- **Patterns**: Common prefixes, format detection
- **Value Distribution**: Actual enum values if low cardinality
- **Sample Data**: Stratified sampling across value ranges

This rich context enables AI to make accurate inferences.

## Configuration

Example `config.json`:

```json
{
  "version": "1.0.0",
  "database": {
    "server": "localhost",
    "database": "MyDatabase",
    "user": "sa",
    "password": "YourPassword",
    "encrypt": true,
    "trustServerCertificate": false
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "temperature": 0.1,
    "maxTokens": 4000
  },
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "convergence": {
      "maxIterations": 10,
      "stabilityWindow": 2,
      "confidenceThreshold": 0.85
    },
    "backpropagation": {
      "enabled": true,
      "maxDepth": 3
    },
    "sanityChecks": {
      "schemaLevel": true,
      "crossSchema": true
    }
  },
  "output": {
    "stateFile": "./db-doc-state.json",
    "sqlFile": "./output/add-descriptions.sql",
    "markdownFile": "./output/database-documentation.md"
  },
  "schemas": {
    "exclude": ["sys", "INFORMATION_SCHEMA"]
  },
  "tables": {
    "exclude": ["sysdiagrams", "__MigrationHistory"]
  }
}
```

## Supported AI Providers

### OpenAI
```json
{
  "provider": "openai",
  "model": "gpt-4-turbo-preview",
  "apiKey": "sk-..."
}
```

### Anthropic
```json
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "apiKey": "sk-ant-..."
}
```

### Groq
```json
{
  "provider": "groq",
  "model": "mixtral-8x7b-32768",
  "apiKey": "gsk_..."
}
```

## State File

The `db-doc-state.json` file tracks:
- All schemas, tables, and columns
- **Description iterations** with reasoning and confidence
- **Analysis runs** with metrics (tokens, cost, duration)
- **Processing logs** for debugging

### Iteration Tracking

Each description has an iteration history:

```json
{
  "descriptionIterations": [
    {
      "description": "Initial hypothesis...",
      "reasoning": "Based on column names...",
      "generatedAt": "2024-01-15T10:00:00Z",
      "modelUsed": "gpt-4",
      "confidence": 0.75,
      "triggeredBy": "initial"
    },
    {
      "description": "Revised hypothesis...",
      "reasoning": "Child table analysis revealed...",
      "generatedAt": "2024-01-15T10:05:00Z",
      "modelUsed": "gpt-4",
      "confidence": 0.92,
      "triggeredBy": "backpropagation",
      "changedFrom": "Initial hypothesis..."
    }
  ]
}
```

## Programmatic Usage

DBAutoDoc can be used programmatically:

```typescript
import {
  ConfigLoader,
  DatabaseConnection,
  Introspector,
  TopologicalSorter,
  StateManager,
  PromptEngine,
  AnalysisEngine,
  SQLGenerator,
  MarkdownGenerator
} from '@memberjunction/db-auto-doc';

// Load config
const config = await ConfigLoader.load('./config.json');

// Connect to database
const db = new DatabaseConnection(config.database);
await db.connect();

// Introspect
const introspector = new Introspector(db);
const schemas = await introspector.getSchemas(config.schemas, config.tables);

// Initialize analysis
const promptEngine = new PromptEngine(config.ai, './prompts');
await promptEngine.initialize();

const stateManager = new StateManager(config.output.stateFile);
const state = stateManager.createInitialState(config.database.database, config.database.server);
state.schemas = schemas;

// Run analysis
const analysisEngine = new AnalysisEngine(config, promptEngine, stateManager, iterationTracker);
// ... custom analysis workflow

// Generate outputs
const sqlGen = new SQLGenerator();
const sql = sqlGen.generate(state);

const mdGen = new MarkdownGenerator();
const markdown = mdGen.generate(state);
```

## Cost Estimation

Typical costs (will vary by database size and complexity):

| Database Size | Tables | Iterations | Tokens | Cost (GPT-4) |
|---------------|--------|------------|--------|--------------|
| Small | 10-20 | 2-3 | ~50K | $0.50 |
| Medium | 50-100 | 3-5 | ~200K | $2.00 |
| Large | 200+ | 5-8 | ~500K | $5.00 |

Groq is significantly cheaper but may have quality trade-offs.

## Best Practices

1. **Start with seed context** - Helps AI understand database purpose
2. **Review low-confidence items** - Focus manual effort where AI is uncertain
3. **Use backpropagation** - Improves accuracy significantly
4. **Filter exports** - Use `--confidence-threshold` to only apply high-confidence descriptions
5. **Iterate** - Run analysis multiple times if first pass isn't satisfactory

## Troubleshooting

### "Connection failed"
- Check server, database, user, password in config
- Verify SQL Server is running and accessible
- Check firewall rules

### "Analysis not converging"
- Increase `maxIterations` in config
- Lower `confidenceThreshold`
- Add more seed context
- Check warnings in state file

### "High token usage"
- Reduce `maxTokens` in config
- Filter schemas/tables to focus on subset
- Use cheaper model (e.g., Groq)

## Architecture

See [DESIGN.md](./DESIGN.md) for comprehensive architecture documentation.

## Contributing

DBAutoDoc is part of the MemberJunction project. Contributions welcome!

## License

MIT

## Demo Databases

### LousyDB - Legacy Database Demo

Located in `/Demos/LousyDB/`, this demo showcases **Relationship Discovery** capabilities on a realistic legacy database:

- ❌ **Zero metadata** - No PK or FK constraints defined
- 🔤 **Cryptic naming** - Short abbreviations (`cst`, `ord`, `pmt`)
- 🔡 **Single-char codes** - Undocumented status values (`A`, `T`, `P`)
- 💔 **Data quality issues** - Orphaned records, NULLs, duplicates
- 📊 **20 tables** across 2 schemas with 1000+ rows

Perfect for testing DBAutoDoc's ability to **reverse-engineer** poorly-documented databases.

See `/Demos/LousyDB/README.md` for details and testing instructions.

## Links

- **GitHub**: https://github.com/MemberJunction/MJ
- **Documentation**: https://docs.memberjunction.org
- **Support**: https://github.com/MemberJunction/MJ/issues
