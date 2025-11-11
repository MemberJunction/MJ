# DBAutoDoc User Guide

A comprehensive guide to using DBAutoDoc for AI-powered database documentation.

## Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [Installation](#installation)
3. [Configuration Reference](#configuration-reference)
4. [Commands](#commands)
5. [Understanding the Analysis](#understanding-the-analysis)
6. [Relationship Discovery](#relationship-discovery)
7. [Output and Results](#output-and-results)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Usage](#advanced-usage)

---

## Quick Start Guide

### Step 1: Installation

Install DBAutoDoc globally for easy command-line access:

```bash
npm install -g @memberjunction/db-auto-doc
```

Or install locally within your project:

```bash
npm install @memberjunction/db-auto-doc
npx db-auto-doc --help
```

### Step 2: Initialize Project

Run the interactive setup wizard:

```bash
db-auto-doc init
```

This will guide you through:
- **Database connection details** (server, database name, credentials)
- **AI provider selection** (OpenAI, Anthropic, Groq, etc.)
- **API key configuration**
- **Seed context** (optional - helps AI understand your database)

The wizard creates `config.json` with all settings.

### Step 3: Run Analysis

```bash
db-auto-doc analyze
```

This performs:
- **Schema introspection** - discovers all tables, columns, relationships
- **Data analysis** - collects statistics and sample data
- **AI analysis** - generates descriptions with confidence scores
- **Iterative refinement** - improves descriptions through multiple passes
- **Relationship discovery** - optionally detects missing primary/foreign keys

Watch the progress indicators as your database is analyzed.

### Step 4: Check Status

View current analysis progress:

```bash
db-auto-doc status
```

Shows:
- Database name and server
- Total tables and schemas analyzed
- Latest run metrics (iterations, tokens, cost)
- Convergence status
- Low-confidence items needing attention

### Step 5: Export Results

Generate SQL and/or Markdown documentation:

```bash
# Generate both SQL and Markdown
db-auto-doc export --sql --markdown

# Generate only SQL
db-auto-doc export --sql

# Generate only Markdown
db-auto-doc export --markdown

# Apply SQL directly to database
db-auto-doc export --sql --apply

# Export only high-confidence descriptions (>80%)
db-auto-doc export --sql --confidence-threshold=0.8
```

### Step 6: Review and Apply

1. **Review the SQL script** (`extended-props.sql`) to see what will be applied
2. **Review the Markdown** (`summary.md`) for documentation
3. **Apply to database** using SQL Management Studio or:
   ```bash
   db-auto-doc export --sql --apply
   ```

---

## Installation

### System Requirements

- **Node.js**: v18 or higher
- **SQL Server**: 2016 or later
- **Database Access**: User with permissions to read schema and statistics

### Installation Methods

#### Global Installation (Recommended for DBAs)

```bash
npm install -g @memberjunction/db-auto-doc
```

Then use anywhere:
```bash
db-auto-doc init
db-auto-doc analyze
db-auto-doc export
```

#### Project Installation

```bash
cd your-project
npm install @memberjunction/db-auto-doc
```

Then use with `npx`:
```bash
npx db-auto-doc init
npx db-auto-doc analyze
npx db-auto-doc export
```

#### Development Installation

Clone from source and install dependencies:

```bash
git clone https://github.com/MemberJunction/MJ.git
cd packages/DBAutoDoc
npm install
npm run build
npm start -- init
```

### Upgrading

```bash
npm install -g @memberjunction/db-auto-doc@latest
```

Or update locally:
```bash
npm install @memberjunction/db-auto-doc@latest
```

---

## Configuration Reference

### Configuration File Structure

The `config.json` file controls all aspects of DBAutoDoc:

```json
{
  "version": "1.0.0",
  "database": { ... },
  "ai": { ... },
  "analysis": { ... },
  "output": { ... },
  "schemas": { ... },
  "tables": { ... }
}
```

### Database Configuration

```json
{
  "database": {
    "provider": "sqlserver",
    "server": "localhost",
    "port": 1433,
    "database": "MyDatabase",
    "user": "sa",
    "password": "YourPassword",
    "encrypt": true,
    "trustServerCertificate": false,
    "connectionTimeout": 30000,
    "requestTimeout": 30000,
    "maxConnections": 10,
    "minConnections": 2,
    "idleTimeoutMillis": 30000
  }
}
```

**Key Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `sqlserver` | Database type: `sqlserver`, `mysql`, `postgresql`, `oracle` |
| `server` | string | Required | Server hostname or IP address |
| `port` | number | 1433 | Database port |
| `database` | string | Required | Database name |
| `user` | string | Required | Login username |
| `password` | string | Required | Login password |
| `encrypt` | boolean | true | Use SSL/TLS encryption |
| `trustServerCertificate` | boolean | false | Accept self-signed certificates |
| `connectionTimeout` | number | 30000 | Connection timeout in milliseconds |
| `requestTimeout` | number | 30000 | Query timeout in milliseconds |
| `maxConnections` | number | 10 | Maximum connection pool size |
| `minConnections` | number | 2 | Minimum connection pool size |
| `idleTimeoutMillis` | number | 30000 | Close idle connections after (ms) |

**Tips:**
- Use environment variables for sensitive data: `${DB_SERVER}`, `${DB_PASSWORD}`, etc.
- Increase `connectionTimeout` for slow networks
- Increase `requestTimeout` for large databases

### AI Provider Configuration

```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "temperature": 0.1,
    "maxTokens": 4000,
    "requestsPerMinute": 60,
    "effortLevel": 50
  }
}
```

**Key Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | Required | `openai`, `anthropic`, `groq`, `mistral`, `gemini` |
| `model` | string | Required | Model identifier (e.g., `gpt-4-turbo-preview`) |
| `apiKey` | string | Required | API key for provider |
| `temperature` | number | 0.1 | Randomness (0=deterministic, 1=creative). Use 0.1 for documentation |
| `maxTokens` | number | 4000 | Max tokens per API call |
| `requestsPerMinute` | number | 60 | Rate limiting |
| `effortLevel` | number | - | Model-specific effort (1-100) |

**Supported Models:**

#### OpenAI
- `gpt-4-turbo-preview` - Highest quality, most expensive
- `gpt-4` - Very capable, expensive
- `gpt-3.5-turbo` - Cheaper, adequate quality

#### Anthropic
- `claude-3-opus-20240229` - Highest quality, most expensive
- `claude-3-sonnet-20240229` - Good balance
- `claude-3-haiku-20240307` - Cheapest, basic quality

#### Groq (Fastest, Cheapest)
- `mixtral-8x7b-32768` - Best quality
- `llama-2-70b-4096` - Lower quality
- `gemma-7b-it` - Fastest

#### Mistral
- `mistral-large` - Highest quality
- `mistral-medium` - Good balance
- `mistral-small` - Cheaper

#### Google Gemini
- `gemini-pro` - Latest

**Configuration Examples:**

```json
// High Quality (Expensive)
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "temperature": 0.1,
  "maxTokens": 8000
}

// Good Balance (Moderate Cost)
{
  "provider": "groq",
  "model": "mixtral-8x7b-32768",
  "temperature": 0.1,
  "maxTokens": 6000
}

// Budget-Conscious (Cheap)
{
  "provider": "groq",
  "model": "llama-2-70b-4096",
  "temperature": 0.1,
  "maxTokens": 4000
}
```

### Analysis Configuration

```json
{
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "includePatternAnalysis": true,
    "convergence": { ... },
    "backpropagation": { ... },
    "sanityChecks": { ... },
    "guardrails": { ... },
    "relationshipDiscovery": { ... }
  }
}
```

#### Basic Analysis Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cardinalityThreshold` | number | 20 | Columns with <= N distinct values are treated as enums |
| `sampleSize` | number | 10 | Number of sample values to collect per column |
| `includeStatistics` | boolean | true | Include min/max/avg in analysis |
| `includePatternAnalysis` | boolean | true | Detect data patterns (sequential, GUID, etc.) |

#### Convergence Configuration

Controls when analysis stops:

```json
{
  "convergence": {
    "maxIterations": 50,
    "stabilityWindow": 2,
    "confidenceThreshold": 0.85
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxIterations` | number | 50 | Stop analysis after N iterations |
| `stabilityWindow` | number | 2 | Stop if no changes in last N iterations |
| `confidenceThreshold` | number | 0.85 | Target confidence level (0-1) |

**How It Works:**
1. Analysis stops if all tables reach `confidenceThreshold`
2. OR if `stabilityWindow` iterations show no improvement
3. OR if `maxIterations` is reached

**Tuning:**
- **Faster analysis**: Reduce `maxIterations`, increase `stabilityWindow`
- **Better quality**: Increase `maxIterations`, lower `confidenceThreshold`
- **Balanced**: Default values (50, 2, 0.85)

#### Backpropagation Configuration

Re-analyze parent tables after discovering child patterns:

```json
{
  "backpropagation": {
    "enabled": true,
    "maxDepth": 3
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable backpropagation |
| `maxDepth` | number | 3 | Re-analyze up to N levels up dependency tree |

**Example:**
```
If analyzing:
Orders → OrderItems → OrderItemDetails
Insights from OrderItemDetails can backpropagate to Orders
```

#### Sanity Checks Configuration

Validate analysis results:

```json
{
  "sanityChecks": {
    "dependencyLevel": true,
    "schemaLevel": true,
    "crossSchema": true
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dependencyLevel` | boolean | true | Validate within dependency chains |
| `schemaLevel` | boolean | true | Validate within schemas |
| `crossSchema` | boolean | true | Validate across schemas |

#### Guardrails Configuration

Prevent runaway analysis (excessive tokens, cost, time):

```json
{
  "guardrails": {
    "maxTokensPerRun": 250000,
    "maxDurationSeconds": 3600,
    "maxCostDollars": 50,
    "maxTokensPerPrompt": 8000,
    "warnThresholds": {
      "tokenPercentage": 80,
      "durationPercentage": 80,
      "costPercentage": 80
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `maxTokensPerRun` | number | Stop if total tokens exceed this |
| `maxDurationSeconds` | number | Stop if analysis takes longer than this |
| `maxCostDollars` | number | Stop if estimated cost exceeds this |
| `maxTokensPerPrompt` | number | Truncate individual prompts to this size |
| `warnThresholds.tokenPercentage` | number | Warn when X% of token limit reached |
| `warnThresholds.durationPercentage` | number | Warn when X% of duration limit reached |
| `warnThresholds.costPercentage` | number | Warn when X% of cost limit reached |

**Typical Values:**
```json
// Development (fast, cheap)
{
  "maxTokensPerRun": 50000,
  "maxDurationSeconds": 600,
  "maxCostDollars": 2
}

// Production (thorough, expensive)
{
  "maxTokensPerRun": 500000,
  "maxDurationSeconds": 3600,
  "maxCostDollars": 50
}
```

### Relationship Discovery Configuration

Automatically detect missing primary and foreign keys:

```json
{
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
      "primaryKeyNames": [
        "^id$",
        ".*_id$",
        "^pk_.*",
        ".*_key$"
      ],
      "foreignKeyNames": [
        ".*_id$",
        ".*_fk$",
        "^fk_.*"
      ]
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
}
```

#### Discovery Triggers

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable relationship discovery phase |
| `runOnMissingPKs` | boolean | true | Run if any table lacks primary key |
| `runOnInsufficientFKs` | boolean | true | Run if FK count below threshold |
| `fkDeficitThreshold` | number | 0.4 | Run if actual FKs < threshold % of expected |

#### Token Budget

```json
"tokenBudget": {
  "ratioOfTotal": 0.4  // or "maxTokens": 100000
}
```

- Either `ratioOfTotal` (0-1) OR `maxTokens` (absolute)
- Controls how many tokens discovery can consume
- Default: 40% of total token budget

#### Confidence Thresholds

```json
"confidence": {
  "primaryKeyMinimum": 0.7,      // 70% confidence = acceptable PK
  "foreignKeyMinimum": 0.6,      // 60% confidence = acceptable FK
  "llmValidationThreshold": 0.8  // <80% triggers LLM review
}
```

- Higher values = more selective, fewer discoveries
- Lower values = more aggressive, more discoveries
- Validate high-uncertainty relationships with LLM

#### Sampling Configuration

```json
"sampling": {
  "maxRowsPerTable": 1000,           // Analyze up to N rows per table
  "valueOverlapSampleSize": 100,     // Check N rows for FK value overlap
  "statisticalSignificance": 100,    // Min sample size for valid stats
  "compositeKeyMaxColumns": 3        // Max columns in composite key
}
```

#### Pattern Matching

Regex patterns to recognize key columns by name:

```json
"patterns": {
  "primaryKeyNames": [
    "^id$",              // exact match "id"
    ".*_id$",            // ends with "_id"
    "^pk_.*",            // starts with "pk_"
    ".*_key$"            // ends with "_key"
  ],
  "foreignKeyNames": [
    ".*_id$",            // ends with "_id"
    ".*_fk$",            // ends with "_fk"
    "^fk_.*"             // starts with "fk_"
  ]
}
```

Customize for your naming conventions:
```json
"patterns": {
  "primaryKeyNames": [
    "^id$",
    "^[A-Z][a-z]+Id$",   // CamelCase: "UserId", "ProductId"
    ".*_pk$"
  ],
  "foreignKeyNames": [
    "^[A-Z][a-z]+Id$",
    ".*_fk$"
  ]
}
```

#### LLM Validation

Use AI to validate discovered relationships:

```json
"llmValidation": {
  "enabled": true,       // Ask AI to review candidates
  "batchSize": 10        // Validate N candidates per LLM call
}
```

#### Discovery Backpropagation

Re-run discovery if analysis reveals new relationships:

```json
"backpropagation": {
  "enabled": true,       // Re-run discovery after analysis
  "maxIterations": 5     // Max discovery iterations
}
```

### Output Configuration

```json
{
  "output": {
    "stateFile": "./db-doc-state.json",
    "outputDir": "./output",
    "sqlFile": "./output/add-descriptions.sql",
    "markdownFile": "./output/database-documentation.md"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `stateFile` | string | Where to save analysis state (for resume, export) |
| `outputDir` | string | Base directory for numbered run outputs |
| `sqlFile` | string | Path for generated SQL script |
| `markdownFile` | string | Path for generated Markdown documentation |

**Notes:**
- `outputDir` enables numbered runs: `./output/run-1/`, `./output/run-2/`, etc.
- State file tracks complete analysis history
- Use for resuming interrupted analysis

### Schema and Table Filters

```json
{
  "schemas": {
    "include": ["dbo", "sales"],
    "exclude": ["sys", "INFORMATION_SCHEMA"]
  },
  "tables": {
    "exclude": ["sysdiagrams", "__MigrationHistory", "dtproperties"]
  }
}
```

**Examples:**

```json
// Only analyze dbo schema
"schemas": {
  "include": ["dbo"]
}

// Analyze all except system schemas
"schemas": {
  "exclude": ["sys", "INFORMATION_SCHEMA", "msdb"]
}

// Exclude temp tables
"tables": {
  "exclude": ["_.*", "tmp.*", "temp.*"]
}
```

### Using Environment Variables

Reference environment variables in config:

```json
{
  "database": {
    "server": "${DB_SERVER}",
    "database": "${DB_NAME}",
    "user": "${DB_USER}",
    "password": "${DB_PASSWORD}"
  },
  "ai": {
    "apiKey": "${API_KEY}"
  }
}
```

Create `.env` file:
```
DB_SERVER=localhost
DB_NAME=MyDatabase
DB_USER=sa
DB_PASSWORD=YourPassword
API_KEY=sk-...
```

Load with:
```bash
source .env
db-auto-doc analyze
```

Or use `.env.example` as template:
```bash
cp .env.example .env
# Edit .env with your credentials
db-auto-doc analyze
```

---

## Commands

### db-auto-doc init

Initialize a new project and create config.json.

```bash
db-auto-doc init
```

**Interactive Prompts:**
1. SQL Server host (default: localhost)
2. Database name (required)
3. Username (default: sa)
4. Password (masked input)
5. Use encryption? (default: yes)
6. Trust server certificate? (default: no)
7. AI provider (choices: openai, anthropic, groq)
8. Model name (shows default for selected provider)
9. API key (masked input)
10. Add seed context? (helps AI understand database)
11. Database purpose (optional)
12. Business domains (optional, comma-separated)
13. Industry context (optional)

**Output:**
- Creates `config.json` in current directory
- Tests database connection
- Reports success/failure

**Example:**
```bash
$ db-auto-doc init
DBAutoDoc Initialization

SQL Server host: localhost
Database name: AdventureWorks
Username: sa
Password: ****
Use encryption? (Y/n): y
Trust server certificate? (y/N): n
AI Provider: (openai/anthropic/groq): anthropic
Model name: claude-3-opus-20240229
API Key: ****
Add seed context? (Y/n): y
Database purpose: E-commerce platform
Business domains: Sales, Inventory, Billing
Industry context: Retail

✓ Database connection successful!
✓ Configuration saved to config.json

Next steps:
  1. Run: db-auto-doc analyze
  2. Run: db-auto-doc export --sql --markdown
```

### db-auto-doc analyze

Run the analysis on your database.

```bash
db-auto-doc analyze [OPTIONS]
```

**Options:**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--resume` | `-r` | Resume from state file | - |
| `--config` | `-c` | Path to config file | `./config.json` |

**Examples:**

```bash
# Basic analysis
db-auto-doc analyze

# Use custom config
db-auto-doc analyze --config=/path/to/config.json

# Resume from checkpoint
db-auto-doc analyze --resume=./output/run-5/state.json
```

**What It Does:**

1. **Introspection** - Discovers all schemas, tables, columns
2. **Data Analysis** - Collects statistics and sample data
3. **Initial Analysis** - Generates first-pass descriptions
4. **Iterative Refinement** - Improves descriptions through multiple passes
5. **Convergence Check** - Stops when criteria met
6. **Relationship Discovery** (optional) - Detects missing PKs/FKs
7. **Sanity Checks** - Validates consistency

**Output:**
- Progress messages showing current phase
- `db-doc-state.json` - Complete analysis state
- Can be large (MB range for big databases)

**Status Indicators:**
```
✓ Configuration loaded
- Introspecting database schema...
- Analyzing data statistics...
- Starting analysis (iteration 1/50)...
- Analysis complete!
```

**Resume Capability:**

If analysis interrupts (crash, timeout):
```bash
db-auto-doc analyze --resume=./output/run-5/state.json
```

This continues from where it left off without re-analyzing completed tables.

### db-auto-doc export

Generate SQL and/or Markdown from analysis results.

```bash
db-auto-doc export [OPTIONS]
```

**Options:**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--state-file` | `-s` | Path to state file | From config |
| `--output-dir` | `-o` | Output directory | From config |
| `--sql` | - | Generate SQL script | false |
| `--markdown` | - | Generate Markdown docs | false |
| `--report` | - | Generate analysis report | false |
| `--apply` | - | Apply SQL to database | false |
| `--approved-only` | - | Only export approved items | false |
| `--confidence-threshold` | - | Minimum confidence (0-1) | 0 |

**Examples:**

```bash
# Export both SQL and Markdown
db-auto-doc export --sql --markdown

# Export only SQL
db-auto-doc export --sql

# Export only Markdown
db-auto-doc export --markdown

# Export with confidence threshold
db-auto-doc export --sql --confidence-threshold=0.8

# Generate analysis report
db-auto-doc export --report

# Apply SQL directly to database
db-auto-doc export --sql --apply

# Use different state file
db-auto-doc export --state-file=./output/run-3/state.json --sql

# Custom output directory
db-auto-doc export --output-dir=/path/to/output --sql --markdown

# All together
db-auto-doc export --sql --markdown --report --confidence-threshold=0.75
```

**Output Files:**

1. **extended-props.sql**
   - SQL Server extended properties
   - `sp_addextendedproperty` statements
   - Can be applied with SQL Management Studio or `--apply` flag
   - Safe to run multiple times (idempotent)

2. **summary.md**
   - Human-readable documentation
   - Tables, columns, descriptions organized by schema
   - Confidence scores and reasoning
   - Good for documentation wiki

3. **analysis-report.md** (with `--report`)
   - Analysis metrics and statistics
   - Convergence details
   - Token usage and cost
   - Relationship discovery results (if enabled)

**Confidence Threshold:**

Control quality of exported items:

```bash
# Only export high-confidence items (>80%)
db-auto-doc export --sql --confidence-threshold=0.8

# Export everything
db-auto-doc export --sql --confidence-threshold=0
```

**Applying SQL Directly:**

```bash
# Review first
db-auto-doc export --sql

# Then apply when satisfied
db-auto-doc export --sql --apply
```

Use `--apply` with caution - it modifies your database. Always backup first.

### db-auto-doc status

View current analysis status without running analysis.

```bash
db-auto-doc status
```

**Output:**

```
Database Documentation Status

Database: MyDatabase
Server: localhost
Last Modified: 2024-01-15T10:30:00Z

Schemas: 3
Tables: 45

Latest Analysis Run:
  Status: completed
  Iterations: 12
  Tokens Used: 245,600
  Estimated Cost: $2.45
  Converged: Yes - Confidence threshold reached

Low Confidence Tables (< 0.7): 3
Unprocessed Tables: 0
```

**Use Cases:**
- Check if analysis has run
- View progress without starting new analysis
- See metrics from last run
- Identify items needing attention

### db-auto-doc reset

Reset analysis state and start over.

```bash
db-auto-doc reset
```

**Effect:**
- Deletes state file
- Clears analysis history
- Next `analyze` command starts fresh

**Caution:**
- Cannot be undone
- Use only if restarting analysis

---

## Understanding the Analysis

### How DBAutoDoc Works

DBAutoDoc uses a multi-phase, iterative approach:

#### Phase 1: Introspection

```
Database
  ↓
[Introspection Phase]
  - Read all schemas, tables, columns
  - Get primary and foreign keys
  - Collect data types, constraints
  ↓
Schema/Table/Column Model
```

Discovers database structure without running AI.

#### Phase 2: Data Analysis

```
Each Table
  ↓
[Sampling & Statistics]
  - Sample rows for data distribution
  - Calculate cardinality (distinct values)
  - Detect data patterns (GUID, sequential, etc.)
  - Identify enum columns (low cardinality)
  ↓
Enhanced Column Metadata
```

Collects statistical context for AI analysis.

#### Phase 3: Topological Sorting

```
All Tables
  ↓
[Dependency Graph Building]
  - Analyze foreign key relationships
  - Build dependency tree
  ↓
Level 0: Users, Products (no deps)
Level 1: Orders (depends on Users)
Level 2: OrderItems (depends on Orders + Products)
Level 3: Shipments (depends on OrderItems)
```

Process tables in dependency order for better context.

#### Phase 4: Iterative AI Analysis

```
Table → [AI Analysis] → Description + Confidence

Iteration 1:
  - Analyze all tables
  - Generate initial descriptions
  - Assign confidence scores

Iteration 2:
  - Use child table insights
  - Refine parent descriptions (backpropagation)
  - Improve confidence scores

Iteration N:
  - Continue until convergence
```

Each iteration improves upon previous results.

#### Phase 5: Backpropagation

```
OrderItems analyzed:
  - "Contains individual items purchased"
  - Reveals Orders also contains multiple items

Orders re-analyzed (backpropagation):
  - Initial: "Sales transactions"
  - Refined: "Sales transactions containing multiple ordered items"
```

Child table insights improve parent descriptions.

#### Phase 6: Convergence Check

```
Check stopping conditions:
  ✓ All tables above confidence threshold?
  ✓ No changes in last N iterations?
  ✓ Maximum iterations reached?

If any true → Stop analysis
If all false → Continue iteration
```

Automatically stops when analysis is "done".

#### Phase 7: Sanity Checks (Optional)

```
Check consistency across:
  - Within dependency levels
  - Within schemas
  - Across schemas

Identify contradictions or anomalies
```

Validates analysis quality.

#### Phase 8: Relationship Discovery (Optional)

```
If enabled:
  - Analyze tables without primary keys
  - Detect orphaned foreign keys
  - Suggest missing relationships

Result:
  - Primary key candidates with confidence
  - Foreign key candidates with confidence
```

Reverse-engineer missing key constraints.

### Understanding Confidence Scores

Each description has a confidence score (0.0 to 1.0):

```
0.0 -------|-------|-------|-------|------- 1.0
Very Low   Low     Medium   High    Very High
```

**How Confidence is Calculated:**

```
Confidence = (
  + Column name matching (30%)
  + Data pattern evidence (25%)
  + Statistical evidence (20%)
  + Relationship context (15%)
  + LLM validation (10%)
) × AI model reliability
```

**Interpreting Scores:**

| Score | Meaning | Action |
|-------|---------|--------|
| 0.9+ | Extremely confident | Safe to apply |
| 0.7-0.9 | Confident | Apply with minor review |
| 0.5-0.7 | Somewhat confident | Review before applying |
| 0.3-0.5 | Low confidence | Manual review required |
| <0.3 | Very uncertain | Don't trust this |

**Low Confidence Causes:**

1. **Ambiguous column names** - Generic names like "Value", "Data"
2. **Complex relationships** - Many-to-many, self-referential
3. **Weak data patterns** - Diverse values, no clear enum
4. **Unclear context** - No seed context provided
5. **New columns** - Not analyzed in previous iterations

**Improving Low Confidence:**

```json
// Strategy 1: Add seed context
{
  "seedContext": {
    "overallPurpose": "E-commerce platform",
    "businessDomains": ["Sales", "Inventory"],
    "industryContext": "Retail"
  }
}

// Strategy 2: More iterations
{
  "convergence": {
    "maxIterations": 100,        // Increase from 50
    "confidenceThreshold": 0.7   // Lower threshold
  }
}

// Strategy 3: Backpropagation
{
  "backpropagation": {
    "enabled": true,
    "maxDepth": 5  // Increase from 3
  }
}

// Strategy 4: Better model
{
  "ai": {
    "model": "gpt-4-turbo-preview",  // Higher quality
    "temperature": 0.05              // More deterministic
  }
}
```

### Iteration Tracking

Each table tracks description iterations:

```json
{
  "tableName": "Orders",
  "descriptionIterations": [
    {
      "iteration": 1,
      "description": "Sales orders",
      "reasoning": "Based on columns OrderDate, CustomerId",
      "confidence": 0.65,
      "triggeredBy": "initial",
      "generatedAt": "2024-01-15T10:00:00Z",
      "modelUsed": "gpt-4"
    },
    {
      "iteration": 3,
      "description": "Sales transactions containing customer purchases with multiple ordered items",
      "reasoning": "OrderItems analysis revealed many-to-one relationship. Customers table shows repeat purchases.",
      "confidence": 0.92,
      "triggeredBy": "backpropagation",
      "changedFrom": "Sales orders"
    }
  ]
}
```

**Interpreting Iterations:**

- **Iteration 1**: Initial analysis based on schema
- **Iteration 2+**: Refinements based on:
  - Child table analysis (backpropagation)
  - Convergence improvements
  - New relationship discoveries

Monitor iterations to understand how confidence evolved.

---

## Relationship Discovery

### What It Does

Relationship Discovery analyzes databases lacking proper constraints:

```
Legacy Database (No PKs/FKs)
  ↓
[Relationship Discovery]
  - Sample data from each table
  - Analyze uniqueness patterns
  - Detect foreign key candidates
  - Validate with LLM (optional)
  ↓
Discovered Relationships with Confidence Scores
  ↓
[Generated SQL]
  - ALTER TABLE ADD CONSTRAINT statements
  - Can be applied or reviewed first
```

### When It Runs

Discovery is triggered automatically when:

1. **Missing Primary Keys** - Any table without declared PK
2. **Insufficient Foreign Keys** - Actual FKs < threshold
3. **Manual Trigger** - Explicitly enabled in config

Check trigger analysis:
```bash
db-auto-doc status
```

### Configuring Discovery

#### Enable/Disable

```json
{
  "relationshipDiscovery": {
    "enabled": true,  // Set to false to skip
    "triggers": { ... }
  }
}
```

#### Trigger Sensitivity

```json
{
  "triggers": {
    "runOnMissingPKs": true,        // Run if any table missing PK
    "runOnInsufficientFKs": true,   // Run if FK count low
    "fkDeficitThreshold": 0.4       // Run if FKs < 40% of expected
  }
}
```

Higher `fkDeficitThreshold` = more aggressive discovery
Lower value = more conservative

#### Token Budget

```json
{
  "tokenBudget": {
    "ratioOfTotal": 0.4  // Use 40% of total token budget
  }
}
```

Or absolute limit:
```json
{
  "tokenBudget": {
    "maxTokens": 100000  // Max 100K tokens for discovery
  }
}
```

#### Confidence Thresholds

```json
{
  "confidence": {
    "primaryKeyMinimum": 0.7,      // 70% = acceptable PK
    "foreignKeyMinimum": 0.6,      // 60% = acceptable FK
    "llmValidationThreshold": 0.8  // LLM reviews if <80%
  }
}
```

Stricter values = fewer but higher-confidence discoveries

#### Sampling

```json
{
  "sampling": {
    "maxRowsPerTable": 1000,           // Analyze up to 1000 rows
    "valueOverlapSampleSize": 100,     // Check 100 rows for FK matches
    "statisticalSignificance": 100,    // Need 100+ samples for validity
    "compositeKeyMaxColumns": 3        // Composite keys max 3 cols
  }
}
```

Larger samples = more accurate but slower

#### Pattern Matching

Customize column name patterns:

```json
{
  "patterns": {
    "primaryKeyNames": [
      "^id$",              // Exact "id"
      ".*_id$",            // Ends with "_id"
      "^pk_.*",            // Starts with "pk_"
      "^[A-Z][a-z]+Id$"    // CamelCase like "UserId"
    ],
    "foreignKeyNames": [
      ".*_id$",            // Common pattern
      "^fk_.*"             // Explicit fk_ prefix
    ]
  }
}
```

### Understanding Discovery Results

Export relationship discovery results:

```bash
db-auto-doc export --report
```

Check `analysis-report.md` for:

```markdown
# Relationship Discovery Results

## Primary Keys Discovered
- Orders.OrderID (confidence: 0.95, pattern: sequential ID)
- Products.ProductID (confidence: 0.92, pattern: sequential ID)

## Foreign Keys Discovered
- OrderItems.OrderID → Orders.OrderID (confidence: 0.88)
- OrderItems.ProductID → Products.ProductID (confidence: 0.85)

## Warnings
- Shipments table: No matching customer table found
  - Recommendation: Verify if Shipments should reference Orders
```

**Interpreting Results:**

| Item | Confidence | Action |
|------|-----------|--------|
| PK: 95% | Very High | Definitely use |
| FK: 85% | High | Review then use |
| FK: 70% | Medium | Manual verification needed |
| FK: 50% | Low | Don't use without review |

### Applying Discovered Relationships

Export discovered relationships as SQL:

```bash
db-auto-doc export --sql
```

The generated SQL will include:

```sql
-- Auto-discovered primary keys
ALTER TABLE Orders ADD CONSTRAINT PK_Orders_OrderID
  PRIMARY KEY (OrderID);

-- Auto-discovered foreign keys
ALTER TABLE OrderItems ADD CONSTRAINT FK_OrderItems_Orders
  FOREIGN KEY (OrderID) REFERENCES Orders(OrderID);
```

**Before Applying:**

1. Review the SQL script carefully
2. Check any warnings in analysis report
3. Test in development database first
4. Backup production database
5. Apply during maintenance window

### Discovery Backpropagation

Discovery can trigger re-analysis:

```json
{
  "backpropagation": {
    "enabled": true,
    "maxIterations": 5
  }
}
```

**Example Flow:**

```
Analysis Phase:
  Tables analyzed with current schema

Discovery Phase:
  Discovers OrderID is primary key in Orders

Backpropagation:
  Re-analyze OrderItems knowing it FK→Orders
  Improves OrderItems description from 0.70 → 0.92

Second Discovery Iteration:
  With improved understanding, discovers more FKs
```

Multiple discovery iterations can improve schema understanding.

---

## Output and Results

### State File (db-doc-state.json)

Complete analysis state saved after each run:

```json
{
  "database": {
    "name": "MyDatabase",
    "server": "localhost"
  },
  "summary": {
    "lastModified": "2024-01-15T10:30:00Z",
    "totalTables": 45,
    "analyzedTables": 45,
    "lowConfidenceTables": 3
  },
  "schemas": [
    {
      "name": "dbo",
      "tables": [
        {
          "schemaName": "dbo",
          "tableName": "Orders",
          "description": "Sales transactions...",
          "confidence": 0.92,
          "descriptionIterations": [ ... ],
          "columns": [
            {
              "name": "OrderID",
              "description": "Unique order identifier...",
              "confidence": 0.95
            }
          ]
        }
      ]
    }
  ],
  "phases": {
    "descriptionGeneration": [
      {
        "runNumber": 1,
        "status": "completed",
        "startedAt": "2024-01-15T10:00:00Z",
        "completedAt": "2024-01-15T10:30:00Z",
        "iterationsPerformed": 12,
        "totalTokensUsed": 245600,
        "estimatedCost": 2.45,
        "converged": true,
        "convergenceReason": "Confidence threshold reached",
        "warnings": []
      }
    ],
    "relationshipDiscovery": {
      "triggered": true,
      "triggerReason": "missing_pks",
      "discovered": {
        "primaryKeys": [ ... ],
        "foreignKeys": [ ... ]
      }
    }
  }
}
```

### SQL Output (extended-props.sql)

Ready-to-apply SQL statements:

```sql
-- Extended properties for dbo.Orders
EXEC sp_addextendedproperty @name=N'MS_Description',
  @value=N'Sales transactions containing customer purchases with multiple ordered items',
  @level0type=N'SCHEMA', @level0name=N'dbo',
  @level1type=N'TABLE', @level1name=N'Orders';

EXEC sp_addextendedproperty @name=N'MS_Description',
  @value=N'Unique order identifier',
  @level0type=N'SCHEMA', @level0name=N'dbo',
  @level1type=N'TABLE', @level1name=N'Orders',
  @level2type=N'COLUMN', @level2name=N'OrderID';

EXEC sp_addextendedproperty @name=N'MS_Description',
  @value=N'Customer who placed the order',
  @level0type=N'SCHEMA', @level0name=N'dbo',
  @level1type=N'TABLE', @level1name=N'Orders',
  @level2type=N'COLUMN', @level2name=N'CustomerID';

-- ... more columns and tables
```

**Applying SQL:**

Option 1: Using CLI
```bash
db-auto-doc export --sql --apply
```

Option 2: Using SQL Management Studio
```
1. Open extended-props.sql
2. Review the statements
3. Execute in target database
4. Verify with: SELECT * FROM sys.extended_properties
```

Option 3: Using Command Line
```bash
sqlcmd -S localhost -U sa -P YourPassword -d MyDatabase -i extended-props.sql
```

### Markdown Output (summary.md)

Human-readable documentation:

```markdown
# Database Documentation: MyDatabase

**Server:** localhost
**Generated:** 2024-01-15T10:30:00Z

## Schema: dbo

### Orders
Sales transactions containing customer purchases with multiple ordered items

**Confidence:** 92%

**Columns:**

| Column | Type | Description | Confidence |
|--------|------|-------------|-----------|
| OrderID | int | Unique order identifier | 95% |
| CustomerID | int | Customer who placed the order | 88% |
| OrderDate | datetime | Date order was placed | 94% |
| TotalAmount | decimal | Total order amount in USD | 91% |

### Customers
...
```

**Use Cases:**

1. **Team Documentation** - Share with development team
2. **Confluence/Wiki** - Copy to documentation system
3. **Data Dictionary** - Reference during development
4. **Compliance** - Document data for audits

### Analysis Report (analysis-report.md)

Detailed analysis metrics:

```markdown
# Analysis Report

## Summary
- Total tables analyzed: 45
- Analysis converged: Yes
- Total iterations: 12
- Total tokens used: 245,600
- Estimated cost: $2.45
- Duration: 30 minutes

## Convergence Details
- Confidence threshold: 0.85
- Achieved: Yes (12 of 12 iterations)
- Average confidence increase per iteration: +0.08

## Relationship Discovery
- Triggered: Yes (missing PKs)
- Primary keys discovered: 3
- Foreign keys discovered: 8
- High confidence (>80%): 9
- Medium confidence (50-80%): 2

## Token Usage by Phase
1. Introspection: 5,000 tokens
2. Data Analysis: 15,000 tokens
3. Description Generation: 200,000 tokens
4. Sanity Checks: 25,600 tokens

## Low Confidence Items
- dbo.LegacyTable: 42% (recommend manual review)
- dbo.AmbiguousStatus: 58% (recommend refinement)
```

---

## Troubleshooting

### Connection Failures

**Problem:** "Connection failed" when initializing

**Solutions:**

1. **Verify server is running:**
   ```bash
   # Windows
   sqlcmd -S localhost

   # Or test with SQL Management Studio
   ```

2. **Check firewall:**
   - SQL Server default port: 1433
   - Verify port is open
   - Check network connectivity

3. **Verify credentials:**
   ```bash
   # Test connection manually
   sqlcmd -S your-server -U sa -P your-password -d your-database
   ```

4. **Check config values:**
   ```json
   {
     "database": {
       "server": "localhost",      // Not "127.0.0.1:1433"
       "port": 1433,               // Explicit port
       "database": "MyDatabase",   // Exact name (case-sensitive on Linux)
       "encrypt": true             // May need false for local dev
     }
   }
   ```

5. **Try without encryption:**
   ```json
   {
     "encrypt": false,
     "trustServerCertificate": true
   }
   ```

6. **Increase timeout:**
   ```json
   {
     "connectionTimeout": 60000,  // 60 seconds
     "requestTimeout": 60000
   }
   ```

### Analysis Not Starting

**Problem:** "No analysis has been run yet"

**Solutions:**

1. **Check config exists:**
   ```bash
   ls -la config.json
   ```

2. **Run init first:**
   ```bash
   db-auto-doc init
   ```

3. **Verify config.json is valid:**
   ```bash
   # Check JSON syntax
   cat config.json | python -m json.tool
   ```

4. **Check permissions:**
   - User needs SELECT on all tables
   - User needs SELECT on sys.objects, sys.columns
   - User needs VIEW DEFINITION (optional, for advanced features)

### Analysis Not Converging

**Problem:** Analysis runs many iterations without stopping

**Solutions:**

1. **Lower confidence threshold:**
   ```json
   {
     "convergence": {
       "confidenceThreshold": 0.75  // From 0.85
     }
   }
   ```

2. **Increase stability window:**
   ```json
   {
     "convergence": {
       "stabilityWindow": 3  // From 2 - stop if no change in 3 iterations
     }
   }
   ```

3. **Reduce max iterations:**
   ```json
   {
     "convergence": {
       "maxIterations": 25  // From 50
     }
   }
   ```

4. **Disable backpropagation:**
   ```json
   {
     "backpropagation": {
       "enabled": false
     }
   }
   ```

5. **Use cheaper model for faster feedback:**
   ```json
   {
     "ai": {
       "provider": "groq",
       "model": "mixtral-8x7b-32768"
     }
   }
   ```

### High Token Usage / Costs

**Problem:** "Tokens exceeded guardrail limit"

**Solutions:**

1. **Add guardrails:**
   ```json
   {
     "guardrails": {
       "maxTokensPerRun": 100000,     // Stop after 100K tokens
       "maxCostDollars": 5            // Stop after $5 cost
     }
   }
   ```

2. **Reduce analysis scope:**
   ```json
   {
     "schemas": {
       "include": ["dbo"]  // Only analyze one schema
     }
   }
   ```

3. **Reduce token limits:**
   ```json
   {
     "ai": {
       "maxTokens": 2000  // From 4000
     }
   }
   ```

4. **Use cheaper model:**
   ```json
   {
     "ai": {
       "provider": "groq",
       "model": "llama-2-70b-4096"
     }
   }
   ```

5. **Shorter analysis:**
   ```json
   {
     "convergence": {
       "maxIterations": 5,
       "stabilityWindow": 1
     }
   }
   ```

### Low Confidence Descriptions

**Problem:** Many descriptions have <70% confidence

**Solutions:**

1. **Add seed context:**
   ```bash
   # Re-run init to add context
   db-auto-doc init
   ```

   Or edit config.json:
   ```json
   {
     "seedContext": {
       "overallPurpose": "E-commerce platform",
       "businessDomains": ["Sales", "Inventory", "Billing"],
       "industryContext": "Retail"
     }
   }
   ```

2. **Use better model:**
   ```json
   {
     "ai": {
       "provider": "anthropic",
       "model": "claude-3-opus-20240229"
     }
   }
   ```

3. **More iterations:**
   ```json
   {
     "convergence": {
       "maxIterations": 100,
       "confidenceThreshold": 0.5
     }
   }
   ```

4. **Enable backpropagation:**
   ```json
   {
     "backpropagation": {
       "enabled": true,
       "maxDepth": 5
     }
   }
   ```

5. **Lower temperature for consistency:**
   ```json
   {
     "ai": {
       "temperature": 0.05
     }
   }
   ```

### Template Rendering Errors

**Problem:** "Error rendering template" or broken Markdown output

**Solutions:**

1. **Check template files exist:**
   ```bash
   ls -la src/templates/
   ```

2. **Verify Markdown syntax:**
   - Check for unescaped `{{` or `{%`
   - SQL Generator uses Nunjucks templating

3. **Review state file for problematic descriptions:**
   ```bash
   grep -n '{{' db-doc-state.json
   ```

4. **Contact support** with state file and error message

### Database Query Errors

**Problem:** "Query error: Incorrect syntax" or timeout

**Solutions:**

1. **Increase request timeout:**
   ```json
   {
     "database": {
       "requestTimeout": 60000  // 60 seconds
     }
   }
   ```

2. **Reduce sample size:**
   ```json
   {
     "analysis": {
       "sampleSize": 5  // From 10
     }
   }
   ```

3. **Filter large tables:**
   ```json
   {
     "tables": {
       "exclude": ["LargeTable", "HugeAuditLog"]
     }
   }
   ```

4. **Check database is accessible:**
   ```bash
   sqlcmd -S your-server -U sa -P password -d your-database -Q "SELECT COUNT(*) FROM sys.tables"
   ```

### Relationship Discovery Not Working

**Problem:** "No relationships discovered" or low confidence

**Solutions:**

1. **Enable discovery explicitly:**
   ```json
   {
     "relationshipDiscovery": {
       "enabled": true,
       "triggers": {
         "runOnMissingPKs": true
       }
     }
   }
   ```

2. **Lower confidence threshold:**
   ```json
   {
     "confidence": {
       "primaryKeyMinimum": 0.6,
       "foreignKeyMinimum": 0.5
     }
   }
   ```

3. **Fix pattern matching for your schema:**
   ```json
   {
     "patterns": {
       "primaryKeyNames": [
         "^id$",
         ".*_id$",
         "^[A-Z][a-z]+Id$"  // Your naming convention
       ],
       "foreignKeyNames": [
         ".*_id$",
         "^[A-Z][a-z]+Id$"
       ]
     }
   }
   ```

4. **Increase sample size:**
   ```json
   {
     "sampling": {
       "maxRowsPerTable": 5000,
       "valueOverlapSampleSize": 1000
     }
   }
   ```

5. **Enable LLM validation:**
   ```json
   {
     "llmValidation": {
       "enabled": true,
       "batchSize": 5
     }
   }
   ```

### Resume from Checkpoint

**Problem:** Previous analysis was interrupted

**Solution:**

```bash
# Find the state file from last run
db-auto-doc analyze --resume=./output/run-5/state.json

# Or look for most recent output
ls -lt output/run-*/state.json | head -1
```

The `--resume` flag:
- Skips already-analyzed tables
- Continues from where analysis stopped
- Uses same configuration as original run
- Much faster than starting over

### Out of Memory

**Problem:** "JavaScript heap out of memory" or "FATAL ERROR"

**Solutions:**

1. **Increase Node.js memory limit:**
   ```bash
   node --max-old-space-size=4096 /usr/local/bin/db-auto-doc analyze
   ```

   Or set environment variable:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   db-auto-doc analyze
   ```

2. **Reduce analysis scope:**
   ```json
   {
     "analysis": {
       "sampleSize": 5,
       "cardinalityThreshold": 10
     }
   }
   ```

3. **Filter to subset of tables:**
   ```json
   {
     "schemas": {
       "include": ["dbo"]
     }
   }
   ```

4. **Process in batches:**
   - Analyze one schema at a time
   - Merge results manually

---

## Advanced Usage

### Programmatic API

Use DBAutoDoc in your own code:

```typescript
import {
  ConfigLoader,
  AnalysisOrchestrator,
  StateManager,
  SQLGenerator,
  MarkdownGenerator
} from '@memberjunction/db-auto-doc';

// Load configuration
const config = await ConfigLoader.load('./config.json');

// Run analysis
const orchestrator = new AnalysisOrchestrator({
  config,
  resumeFromState: undefined,
  onProgress: (message, data) => {
    console.log(`Progress: ${message}`, data);
  }
});

const result = await orchestrator.execute();

if (result.success) {
  const stateManager = new StateManager(config.output.stateFile);
  const state = await stateManager.load();

  // Generate SQL
  const sqlGen = new SQLGenerator();
  const sql = sqlGen.generate(state);

  // Generate Markdown
  const mdGen = new MarkdownGenerator();
  const markdown = mdGen.generate(state);

  console.log('SQL:', sql);
  console.log('Markdown:', markdown);
}
```

### Custom Configuration

Create profiles for different scenarios:

```bash
# Development profile
db-auto-doc analyze --config=config.dev.json

# Production profile
db-auto-doc analyze --config=config.prod.json

# Large database profile
db-auto-doc analyze --config=config.large.json
```

**config.dev.json** (fast, cheap):
```json
{
  "ai": {
    "provider": "groq",
    "model": "mixtral-8x7b-32768",
    "maxTokens": 2000
  },
  "analysis": {
    "convergence": {
      "maxIterations": 10,
      "stabilityWindow": 1
    }
  },
  "guardrails": {
    "maxTokensPerRun": 50000
  }
}
```

**config.prod.json** (thorough, expensive):
```json
{
  "ai": {
    "provider": "anthropic",
    "model": "claude-3-opus-20240229",
    "maxTokens": 8000
  },
  "analysis": {
    "convergence": {
      "maxIterations": 50,
      "stabilityWindow": 2,
      "confidenceThreshold": 0.9
    }
  },
  "guardrails": {
    "maxTokensPerRun": 500000,
    "maxCostDollars": 100
  }
}
```

### Batch Processing

Analyze multiple databases:

```bash
#!/bin/bash

for db in Database1 Database2 Database3; do
  echo "Analyzing $db..."

  # Update config
  jq ".database.database = \"$db\"" config.template.json > config.json

  # Run analysis
  db-auto-doc analyze

  # Export
  db-auto-doc export --sql --markdown

  # Save results
  mv output results/$db
done
```

### CI/CD Integration

Automate documentation generation:

```yaml
# GitHub Actions example
name: Generate Database Documentation

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly at 2 AM
  workflow_dispatch:

jobs:
  document:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install DBAutoDoc
        run: npm install -g @memberjunction/db-auto-doc

      - name: Run Analysis
        env:
          DB_SERVER: ${{ secrets.DB_SERVER }}
          DB_NAME: ${{ secrets.DB_NAME }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          db-auto-doc analyze
          db-auto-doc export --sql --markdown

      - name: Commit Results
        run: |
          git config user.name "Bot"
          git config user.email "bot@example.com"
          git add docs/
          git commit -m "docs: update database documentation"
          git push
```

### Monitoring and Logging

Track analysis progress:

```bash
# Monitor in real-time
db-auto-doc analyze 2>&1 | tee analysis.log

# Check for errors
grep -i error analysis.log

# Extract metrics
grep "Tokens Used" analysis.log
grep "Estimated Cost" analysis.log
```

### Debugging Analysis

Enable verbose logging:

```typescript
// Programmatic debugging
import { AnalysisOrchestrator } from '@memberjunction/db-auto-doc';

const orchestrator = new AnalysisOrchestrator({
  config,
  onProgress: (message, data) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
    if (data) console.log('Data:', JSON.stringify(data, null, 2));
  }
});
```

### Exporting to Different Formats

SQL output can be processed further:

```bash
# Generate SQL
db-auto-doc export --sql

# Convert to other formats
# SQL → PowerShell
cat extended-props.sql | sed 's/EXEC/Invoke-SqlCmd/' > script.ps1

# SQL → Python
python -c "
import re
with open('extended-props.sql') as f:
    for line in f:
        # Parse and convert as needed
        pass
"
```

### Integration with MemberJunction

If using MemberJunction, integrate descriptions into metadata:

```typescript
import { Metadata } from '@memberjunction/global';
import { StateManager } from '@memberjunction/db-auto-doc';

const stateManager = new StateManager('./db-doc-state.json');
const state = await stateManager.load();

const md = new Metadata();

// Sync to MJ metadata
for (const schema of state.schemas) {
  for (const table of schema.tables) {
    const mjEntity = await md.GetEntityObject('Entities', user);
    mjEntity.Description = table.description;
    // Save to MJ system
  }
}
```

---

## Best Practices

### Planning Your Analysis

1. **Start small** - Test on one schema first
2. **Use seed context** - Tell AI about your database
3. **Review results** - Check for issues in first run
4. **Iterate** - Re-run to improve quality
5. **Batch by schema** - Analyze large databases schema-by-schema

### Cost Management

```json
// Control spending
{
  "guardrails": {
    "maxCostDollars": 10,           // Daily limit
    "warnThresholds": {
      "costPercentage": 75          // Warn at 75% of limit
    }
  }
}
```

### Quality Assurance

```bash
# Export with confidence filter
db-auto-doc export --confidence-threshold=0.8

# Review low-confidence items
db-auto-doc status | grep "Low Confidence"

# Compare iterations
jq '.schemas[0].tables[0].descriptionIterations' db-doc-state.json
```

### Maintenance

```bash
# Keep recent runs
ls -lt output/run-* | head -5

# Archive old runs
tar czf archive/runs-jan.tar.gz output/run-{1..5}

# Clean up
rm -rf output/run-{1..10}
```

### Documentation Best Practices

1. **Be specific** - Avoid generic descriptions
2. **Include context** - Explain purpose and relationships
3. **Note dependencies** - Mention related tables
4. **Flag issues** - Call out data quality problems
5. **Update regularly** - Re-run quarterly

---

## Getting Help

### Checking Logs

```bash
# View last run output
tail -f db-auto-doc.log

# Check for warnings
grep -i warning db-doc-state.json | head -20
```

### Diagnostics

```bash
# Check configuration
cat config.json | jq .

# Verify database connection
sqlcmd -S your-server -U sa -P password -Q "SELECT @@VERSION"

# List schema/tables
sqlcmd -S your-server -U sa -P password -d your-db -Q "SELECT SCHEMA_NAME(schema_id), name FROM sys.tables"
```

### Contact Support

- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Include:
  - Config (with credentials removed)
  - db-doc-state.json (if available)
  - Error messages
  - Database size/complexity info

---

## Version History

See CHANGELOG.md for release notes and breaking changes.

## License

MIT - See LICENSE file

## Related Documentation

- [Design Documentation](./DESIGN.md) - Architecture details
- [README.md](./README.md) - Quick overview
- [MemberJunction Docs](https://docs.memberjunction.org) - Integration guide
