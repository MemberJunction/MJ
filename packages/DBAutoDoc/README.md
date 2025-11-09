# DBAutoDoc - AI-Powered Database Documentation Generator

Automatically generate comprehensive documentation for SQL Server, MySQL, and PostgreSQL databases using AI. DBAutoDoc analyzes your database structure, uses Large Language Models to understand the purpose of tables and columns, and saves descriptions as database metadata (extended properties for SQL Server, comments for MySQL/PostgreSQL).

## Features

### Core Capabilities
- **🤖 AI-Powered Analysis** - Uses OpenAI, Anthropic, Google, or Groq to generate intelligent descriptions
- **🔄 Iterative Refinement** - Multi-pass analysis with backpropagation for accuracy
- **📊 Topological Processing** - Analyzes tables in dependency order for better context
- **📈 Data-Driven** - Leverages cardinality, statistics, and sample data for insights
- **🎯 Convergence Detection** - Automatically knows when analysis is complete
- **💾 State Tracking** - Full audit trail of all iterations and reasoning
- **🔌 Standalone** - Works with ANY database, no MemberJunction required

### Multi-Database Support
- **SQL Server** - Full support with extended properties
- **PostgreSQL** - Complete implementation with COMMENT syntax
- **MySQL** - Full support with column/table comments
- **Unified Interface** - Single configuration approach across all databases

### Advanced Features
- **🔍 Relationship Discovery** - Automatically detect missing primary and foreign keys using statistical analysis and LLM validation
- **🛡️ Granular Guardrails** - Multi-level resource controls (run, phase, iteration limits)
- **⏸️ Resume Capability** - Pause and resume analysis from checkpoint state files
- **📦 Programmatic API** - Use as a library in your own applications
- **🔧 Extensible** - Custom database drivers and analysis plugins

### Output Formats
- **SQL Scripts** - Database-specific metadata scripts (extended properties, comments)
- **Markdown Documentation** - Human-readable docs with ERD diagrams
- **HTML Documentation** - Interactive, searchable documentation with embedded CSS/JS
- **CSV Exports** - Spreadsheet-ready table and column data
- **Mermaid Diagrams** - Standalone ERD files (.mmd and .html)
- **Analysis Reports** - Detailed metrics and quality assessments

## Installation

### Global Installation (Recommended for DBAs)

```bash
npm install -g @memberjunction/db-auto-doc
```

### Within MemberJunction Project

```bash
npm install @memberjunction/db-auto-doc
```

### As a Library Dependency

```bash
npm install @memberjunction/db-auto-doc --save
```

## Quick Start

### 1. Initialize

```bash
db-auto-doc init
```

This interactive wizard will:
- Configure database connection
- Set up AI provider (OpenAI, Anthropic, Google, or Groq)
- Configure guardrails and resource limits
- Optionally add seed context for better analysis
- Create `config.json`

### 2. Analyze

```bash
db-auto-doc analyze
```

This will:
- Introspect your database structure
- Analyze data (cardinality, statistics, patterns)
- Optionally discover missing primary and foreign keys
- Build dependency graph
- Run iterative AI analysis with backpropagation
- Perform sanity checks
- Save state to `db-doc-state.json`

### 3. Export

```bash
db-auto-doc export --sql --markdown --html --csv --mermaid
```

This generates:
- **SQL Script**: Database-specific metadata statements
- **Markdown Documentation**: Human-readable docs with ERD links
- **HTML Documentation**: Interactive searchable documentation
- **CSV Files**: tables.csv and columns.csv for spreadsheet analysis
- **Mermaid Diagrams**: erd.mmd and erd.html for visualization

Optionally apply directly to database:

```bash
db-auto-doc export --sql --apply
```

### 4. Check Status

```bash
db-auto-doc status
```

Shows:
- Analysis progress and phase completion
- Convergence status
- Low-confidence tables and columns
- Token usage, cost, and duration
- Guardrail status and warnings

### 5. Resume Analysis

```bash
db-auto-doc analyze --resume ./db-doc-state.json
```

Resume a previous analysis from a checkpoint state file, useful for:
- Continuing after hitting guardrail limits
- Recovering from interruptions
- Incremental database updates

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

### Relationship Discovery

For legacy databases missing primary/foreign key constraints, DBAutoDoc can:
- **Detect Primary Keys** using statistical analysis (uniqueness, nullability, cardinality)
- **Find Foreign Keys** using value overlap analysis and naming patterns
- **LLM Validation** to verify discovered relationships make business sense
- **Backpropagation** to refine parent table analysis based on child relationships

Triggered automatically when:
- Tables lack primary key constraints
- Insufficient foreign key relationships detected (below threshold)

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
1. **No changes** in last N iterations (stability window)
2. **All tables** meet confidence threshold
3. **Max iterations** reached
4. **Guardrail limits** exceeded (tokens, cost, duration)

### Granular Guardrails

Multi-level resource controls ensure analysis stays within bounds:

**Run-Level Limits**:
- `maxTokensPerRun`: Total token budget for entire analysis
- `maxDurationSeconds`: Maximum wall-clock time
- `maxCostDollars`: Maximum AI cost

**Phase-Level Limits**:
- `maxTokensPerPhase.discovery`: Budget for relationship discovery
- `maxTokensPerPhase.analysis`: Budget for description generation
- `maxTokensPerPhase.sanityChecks`: Budget for validation

**Iteration-Level Limits**:
- `maxTokensPerIteration`: Per-iteration token cap
- `maxIterationDurationSeconds`: Per-iteration time limit

**Warning Thresholds**:
- Configurable percentage-based warnings (default 80-85%)
- Early notification before hitting hard limits

### Data Analysis

For each column, DBAutoDoc collects:
- **Cardinality**: Distinct value counts
- **Statistics**: Min, max, average, standard deviation
- **Patterns**: Common prefixes, format detection
- **Value Distribution**: Actual enum values if low cardinality
- **Sample Data**: Stratified sampling across value ranges

This rich context enables AI to make accurate inferences.

## Configuration

### SQL Server Configuration

```json
{
  "version": "1.0.0",
  "database": {
    "provider": "sqlserver",
    "host": "localhost",
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
    "maxTokens": 8000,
    "effortLevel": 50
  },
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "includePatternAnalysis": true,
    "convergence": {
      "maxIterations": 50,
      "stabilityWindow": 2,
      "confidenceThreshold": 0.85
    },
    "backpropagation": {
      "enabled": true,
      "maxDepth": 3
    },
    "sanityChecks": {
      "dependencyLevel": true,
      "schemaLevel": true,
      "crossSchema": true
    },
    "guardrails": {
      "enabled": true,
      "stopOnExceeded": true,
      "maxTokensPerRun": 250000,
      "maxDurationSeconds": 3600,
      "maxCostDollars": 50,
      "maxTokensPerPhase": {
        "discovery": 100000,
        "analysis": 150000,
        "sanityChecks": 50000
      },
      "maxTokensPerIteration": 50000,
      "maxIterationDurationSeconds": 600,
      "warnThresholds": {
        "tokenPercentage": 80,
        "durationPercentage": 80,
        "costPercentage": 80,
        "iterationTokenPercentage": 85,
        "phaseTokenPercentage": 85
      }
    },
    "relationshipDiscovery": {
      "enabled": true,
      "triggers": {
        "runOnMissingPKs": true,
        "runOnInsufficientFKs": true,
        "fkDeficitThreshold": 0.4
      },
      "tokenBudget": {
        "ratioOfTotal": 0.4
      },
      "confidence": {
        "primaryKeyMinimum": 0.7,
        "foreignKeyMinimum": 0.6,
        "llmValidationThreshold": 0.8
      },
      "sampling": {
        "maxRowsPerTable": 1000,
        "valueOverlapSampleSize": 100,
        "statisticalSignificance": 100,
        "compositeKeyMaxColumns": 3
      },
      "patterns": {
        "primaryKeyNames": ["^id$", ".*_id$", "^pk_.*", ".*_key$"],
        "foreignKeyNames": [".*_id$", ".*_fk$", "^fk_.*"]
      },
      "llmValidation": {
        "enabled": true,
        "batchSize": 10
      },
      "backpropagation": {
        "enabled": true,
        "maxIterations": 5
      }
    }
  },
  "output": {
    "stateFile": "./db-doc-state.json",
    "outputDir": "./output",
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

### PostgreSQL Configuration

```json
{
  "version": "1.0.0",
  "database": {
    "provider": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "mydatabase",
    "user": "postgres",
    "password": "YourPassword",
    "ssl": false
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "temperature": 0.1,
    "maxTokens": 8000
  },
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "guardrails": {
      "enabled": true,
      "maxTokensPerRun": 250000
    }
  },
  "output": {
    "stateFile": "./db-doc-state.json",
    "outputDir": "./output",
    "sqlFile": "./output/add-descriptions.sql",
    "markdownFile": "./output/database-documentation.md"
  },
  "schemas": {
    "exclude": ["pg_catalog", "information_schema"]
  }
}
```

### MySQL Configuration

```json
{
  "version": "1.0.0",
  "database": {
    "provider": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "mydatabase",
    "user": "root",
    "password": "YourPassword"
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "temperature": 0.1,
    "maxTokens": 8000
  },
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "guardrails": {
      "enabled": true,
      "maxTokensPerRun": 250000
    }
  },
  "output": {
    "stateFile": "./db-doc-state.json",
    "outputDir": "./output",
    "sqlFile": "./output/add-descriptions.sql",
    "markdownFile": "./output/database-documentation.md"
  },
  "schemas": {
    "exclude": ["mysql", "information_schema", "performance_schema", "sys"]
  }
}
```

## Supported AI Providers

DBAutoDoc integrates with MemberJunction's AI provider system, supporting:

### OpenAI
```json
{
  "provider": "OpenAILLM",
  "model": "gpt-4-turbo-preview",
  "apiKey": "sk-..."
}
```

### Anthropic
```json
{
  "provider": "AnthropicLLM",
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "sk-ant-..."
}
```

### Google
```json
{
  "provider": "GoogleLLM",
  "model": "gemini-1.5-pro",
  "apiKey": "..."
}
```

### Groq
```json
{
  "provider": "GroqLLM",
  "model": "llama-3.3-70b-versatile",
  "apiKey": "gsk_..."
}
```

### Other Providers
Any BaseLLM-compatible provider registered with MemberJunction can be used.

## State File

The `db-doc-state.json` file tracks:
- All schemas, tables, and columns
- **Description iterations** with reasoning and confidence
- **Analysis runs** with metrics (tokens, cost, duration)
- **Processing logs** for debugging
- **Relationship discovery results** (primary keys, foreign keys)
- **Guardrail metrics** (phase and iteration budgets)

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

DBAutoDoc can be used as a library with a comprehensive programmatic API:

### Simple API (Recommended)

```typescript
import { DBAutoDocAPI } from '@memberjunction/db-auto-doc';

const api = new DBAutoDocAPI();

// Analyze database
const result = await api.analyze({
  database: {
    provider: 'sqlserver',
    host: 'localhost',
    database: 'MyDB',
    user: 'sa',
    password: 'password'
  },
  ai: {
    provider: 'OpenAILLM',
    model: 'gpt-4-turbo-preview',
    apiKey: 'sk-...'
  },
  analysis: {
    convergence: { maxIterations: 10 },
    guardrails: { maxTokensPerRun: 100000 }
  },
  output: {
    outputDir: './output'
  },
  onProgress: (message, data) => {
    console.log(message, data);
  }
});

// Resume from state file
const resumed = await api.resume('./db-doc-state.json', {
  analysis: {
    convergence: { maxIterations: 20 }
  }
});

// Export documentation
const exported = await api.export('./db-doc-state.json', {
  formats: ['sql', 'markdown', 'html', 'csv', 'mermaid'],
  outputDir: './docs',
  applyToDatabase: true
});

// Get analysis status
const status = await api.getStatus('./db-doc-state.json');
console.log('Progress:', status.progress);
console.log('Tokens used:', status.metrics.totalTokens);
console.log('Estimated cost:', status.metrics.estimatedCost);
```

### Advanced API (Full Control)

```typescript
import {
  ConfigLoader,
  DatabaseConnection,
  Introspector,
  TopologicalSorter,
  StateManager,
  PromptEngine,
  AnalysisEngine,
  GuardrailsManager,
  SQLGenerator,
  MarkdownGenerator,
  HTMLGenerator,
  CSVGenerator,
  MermaidGenerator
} from '@memberjunction/db-auto-doc';

// Load config
const config = await ConfigLoader.load('./config.json');

// Connect to database
const db = new DatabaseConnection(config.database);
await db.connect();

// Introspect
const driver = db.getDriver();
const introspector = new Introspector(driver);
const schemas = await introspector.getSchemas(config.schemas, config.tables);

// Initialize analysis components
const promptEngine = new PromptEngine(config.ai, './prompts');
await promptEngine.initialize();

const stateManager = new StateManager(config.output.stateFile);
const state = stateManager.createInitialState(config.database.database, config.database.server);
state.schemas = schemas;

const guardrails = new GuardrailsManager(config.analysis.guardrails);
const iterationTracker = new IterationTracker();

// Run analysis
const analysisEngine = new AnalysisEngine(config, promptEngine, stateManager, iterationTracker);
// ... custom analysis workflow

// Generate outputs
const sqlGen = new SQLGenerator();
const sql = sqlGen.generate(state, { approvedOnly: false });

const mdGen = new MarkdownGenerator();
const markdown = mdGen.generate(state);

const htmlGen = new HTMLGenerator();
const html = htmlGen.generate(state, { confidenceThreshold: 0.7 });

const csvGen = new CSVGenerator();
const { tables, columns } = csvGen.generate(state);

const mermaidGen = new MermaidGenerator();
const erdDiagram = mermaidGen.generate(state);
const erdHtml = mermaidGen.generateHtml(state);
```

## Cost Estimation

Typical costs (will vary by database size and complexity):

| Database Size | Tables | Iterations | Tokens | Cost (GPT-4) | Cost (Groq) |
|---------------|--------|------------|--------|--------------|-------------|
| Small | 10-20 | 2-3 | ~50K | $0.50 | $0.02 |
| Medium | 50-100 | 3-5 | ~200K | $2.00 | $0.08 |
| Large | 200+ | 5-8 | ~500K | $5.00 | $0.20 |
| Enterprise | 500+ | 8-15 | ~1.5M | $15.00 | $0.60 |

**With Relationship Discovery**: Add 25-40% to token/cost estimates for databases with missing constraints.

**Guardrails** help control costs by setting hard limits on token usage and runtime.

## Best Practices

1. **Start with guardrails** - Set reasonable token/cost limits to avoid surprises
2. **Add seed context** - Helps AI understand database purpose and domain
3. **Review low-confidence items** - Focus manual effort where AI is uncertain
4. **Use backpropagation** - Improves accuracy significantly
5. **Enable relationship discovery** - For legacy databases missing constraints
6. **Filter exports** - Use `--confidence-threshold` to only apply high-confidence descriptions
7. **Iterate** - Run analysis multiple times if first pass isn't satisfactory
8. **Resume from checkpoints** - Save costs by continuing previous runs
9. **Use appropriate models** - Balance cost vs. quality (GPT-4 vs. Groq)
10. **Export multiple formats** - HTML for browsing, CSV for analysis, SQL for database

## Troubleshooting

### "Connection failed"
- Check server, database, user, password in config
- Verify database server is running and accessible
- Check firewall rules and network connectivity
- For PostgreSQL: verify SSL settings
- For MySQL: check port and authentication method

### "Analysis not converging"
- Increase `maxIterations` in config
- Lower `confidenceThreshold`
- Add more seed context
- Check warnings in state file for specific issues
- Review guardrail limits (may be hitting token budget)

### "High token usage"
- Enable guardrails with appropriate limits
- Reduce `maxTokens` per prompt
- Filter schemas/tables to focus on subset
- Use cheaper model (Groq instead of GPT-4)
- Disable relationship discovery if not needed

### "Guardrail limits exceeded"
- Review metrics in state file
- Adjust limits upward if budget allows
- Use `--resume` to continue from checkpoint
- Focus on specific schemas/tables
- Reduce iteration count

### "Relationship discovery not finding keys"
- Check confidence thresholds (may be too high)
- Review statistical significance settings
- Enable LLM validation for better accuracy
- Check naming patterns configuration
- Verify sample size is adequate

## Documentation

Comprehensive documentation is available in the `docs/` folder:

- **[USER_GUIDE.md](./docs/USER_GUIDE.md)** - Complete user documentation
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Technical architecture and design
- **[API_USAGE.md](./docs/API_USAGE.md)** - Programmatic API examples
- **[GUARDRAILS.md](./docs/GUARDRAILS.md)** - Guardrails system documentation
- **[CHANGES.md](./docs/CHANGES.md)** - Recent changes and enhancements

## Architecture

DBAutoDoc uses a sophisticated multi-phase architecture:

1. **Discovery Phase** - Introspection and optional relationship discovery
2. **Analysis Phase** - Iterative LLM-based description generation
3. **Sanity Check Phase** - Validation and quality assurance
4. **Export Phase** - Multi-format documentation generation

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for comprehensive architecture documentation, including:
- Phase flow diagrams
- Extension points for customization
- Database driver development guide
- LLM intelligence strategy

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
