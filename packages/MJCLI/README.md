# @memberjunction/cli

The official command-line interface (CLI) for MemberJunction, providing essential tools for installation, database management, code generation, AI operations, testing, and database documentation.

## Overview

The MemberJunction CLI (`mj`) is a comprehensive toolset designed to streamline the development and maintenance of MemberJunction applications. It handles everything from initial installation to ongoing database migrations, code generation, AI agent execution, testing, and automated database documentation.

## Installation

### Global Installation (Recommended)
```bash
npm install -g @memberjunction/cli
```

### Local Installation
```bash
npm install --save-dev @memberjunction/cli
```

## Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **SQL Server**: Access to a SQL Server instance for database operations
- **Disk Space**: At least 2GB of free disk space for installation

## Configuration

The CLI uses a configuration file system powered by [cosmiconfig](https://github.com/davidtheclark/cosmiconfig). It searches for configuration in the following locations:

- `.mjrc`
- `.mjrc.json`
- `.mjrc.yaml`
- `.mjrc.yml`
- `.mjrc.js`
- `.mjrc.cjs`
- `mj.config.js`
- `mj.config.cjs`
- `package.json` (in a `"mj"` property)

### Configuration Schema

```typescript
interface MJConfig {
  dbHost: string;              // Database server hostname (default: 'localhost')
  dbDatabase: string;          // Database name
  dbPort: number;              // Database port (default: 1433)
  codeGenLogin: string;        // Database login for CodeGen operations
  codeGenPassword: string;     // Database password for CodeGen operations
  migrationsLocation?: string; // Location of migration files (default: 'filesystem:./migrations')
  dbTrustServerCertificate?: boolean; // Trust server certificate (default: false)
  coreSchema?: string;         // Core schema name (default: '__mj')
  cleanDisabled?: boolean;     // Disable database cleaning (default: true)
  mjRepoUrl?: string;          // MemberJunction repository URL

  // AI-specific settings (optional)
  aiSettings?: {
    defaultTimeout?: number;    // Default timeout for AI operations (default: 300000ms)
    outputFormat?: 'compact' | 'json' | 'table'; // Default output format
    logLevel?: 'info' | 'debug' | 'verbose';     // Logging detail level
    enableChat?: boolean;       // Enable chat features (default: true)
    chatHistoryLimit?: number;  // Chat history size limit
  };
}
```

### Example Configuration

```javascript
// mj.config.cjs
module.exports = {
  dbHost: 'localhost',
  dbDatabase: 'MemberJunction',
  dbPort: 1433,
  codeGenLogin: 'sa',
  codeGenPassword: 'YourPassword123!',
  dbTrustServerCertificate: true,
  coreSchema: '__mj'
};
```

## Commands

### Core Commands

#### `mj install`

Performs a complete installation of MemberJunction, including:
- Database setup
- Generated entities configuration
- API server configuration
- Explorer UI configuration

```bash
mj install [--verbose]
```

The install command will:
1. Verify Node.js version and disk space requirements
2. Check for required directories (GeneratedEntities, SQL Scripts, MJAPI, MJExplorer)
3. Prompt for configuration values or read from `install.config.json`
4. Create `.env` files with database and authentication settings
5. Run npm installations and link packages
6. Execute CodeGen to generate initial code

#### `mj codegen`

Runs the MemberJunction code generation process to create TypeScript entities and metadata from your database schema.

```bash
mj codegen [--skipdb]
```

Options:
- `--skipdb`: Skip database migration before running code generation

#### `mj codegen manifest`

Generates a class registrations manifest to prevent tree-shaking of `@RegisterClass` decorated classes. The tool walks the app's transitive dependency tree and produces a tailored import manifest.

```bash
mj codegen manifest [--output <path>] [--appDir <path>] [--filter <class>] [--quiet]
```

Options:
- `--output, -o <path>`: Output manifest file path (default: `./src/generated/class-registrations-manifest.ts`)
- `--appDir, -a <path>`: App directory containing `package.json` (default: current directory)
- `--filter, -f <class>`: Only include classes with this base class (can be repeated)
- `--quiet, -q`: Suppress progress output

Examples:
```bash
# Generate manifest for the current app
mj codegen manifest --output ./src/generated/class-registrations-manifest.ts

# Generate for a specific app directory
mj codegen manifest --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts

# Only include engine and action classes
mj codegen manifest --filter BaseEngine --filter BaseAction
```

The generated manifest imports all packages in the app's dependency tree that contain `@RegisterClass` decorators, ensuring the class factory system works correctly even with aggressive tree-shaking. See the [CodeGenLib README](../CodeGenLib/README.md) for programmatic usage.

#### `mj migrate`

Applies database migrations to update your MemberJunction schema to the latest version.

```bash
mj migrate [--verbose] [--tag <version>]
```

Options:
- `--verbose`: Enable detailed logging
- `--tag <version>`: Specify a version tag for migrations (e.g., 'v2.10.0')

#### `mj bump`

Updates all @memberjunction/* package dependencies to a specified version.

```bash
mj bump [--recursive] [--dry] [--quiet] [--tag <version>] [--verbose]
```

Options:
- `-r, --recursive`: Update dependencies in all subdirectories
- `-d, --dry`: Preview changes without writing to files
- `-q, --quiet`: Only output paths of updated packages
- `-t, --tag <version>`: Target version (defaults to CLI version)
- `-v, --verbose`: Enable detailed logging

Example - Update all packages recursively and run npm install:
```bash
mj bump -rqt v2.10.0 | xargs -n1 -I{} npm install --prefix {}
```

#### `mj clean`

Resets the MemberJunction database to a pre-installation state. **Use with caution!**

```bash
mj clean [--verbose]
```

Note: This command is disabled by default. Set `cleanDisabled: false` in your configuration to enable it.

---

### `mj sync` - Metadata Synchronization

Manages MemberJunction metadata synchronization between database and local files. This suite of commands enables version control, IDE-based editing, and CI/CD integration for MJ metadata.

```bash
mj sync [COMMAND] [OPTIONS]
```

Available sync commands:
- `validate` - Validate metadata files for correctness
- `init` - Initialize a directory for metadata sync
- `pull` - Pull metadata from database to local files
- `push` - Push local file changes to database
- `status` - Show status of local vs database metadata
- `watch` - Watch for changes and auto-sync
- `file-reset` - Reset file checksums after manual edits

**📚 For detailed documentation:** See the [MetadataSync README](../MetadataSync/README.md)

#### Adding Comments to JSON Metadata Files

Since JSON doesn't support comments natively, you can add documentation to your metadata files using custom keys with an underscore prefix. These keys are preserved but ignored during sync operations:

```json
{
  "_comments": [
    "This file configures encryption for sensitive fields",
    "See /metadata/encryption-keys/ for key configuration"
  ],
  "fields": {
    "Name": "My Entity",
    "Encrypt": true
  },
  "_note": "Comments can appear anywhere in the record"
}
```

**Key points:**
- Use underscore prefix (`_comments`, `_note`, etc.) by convention
- Comments are preserved in their original position after sync operations
- Reserved keys: `fields`, `relatedEntities`, `primaryKey`, `sync`, `deleteRecord`

See the [MetadataSync README](../MetadataSync/README.md#adding-comments-to-json-metadata-files) for complete documentation.

#### Quick Examples:
```bash
# Validate all metadata files
mj sync validate

# Pull AI Prompts from database
mj sync pull --entity="AI Prompts"

# Push changes to database
mj sync push

# Watch for changes
mj sync watch
```

---

### `mj ai` - AI Operations

Execute AI agents and actions using MemberJunction's AI framework. This command provides access to 20+ AI agents and 30+ actions for various tasks.

```bash
mj ai [COMMAND] [OPTIONS]
```

Available AI commands:
- `agents list` - List available AI agents
- `agents run` - Execute an AI agent with a prompt or start interactive chat
- `actions list` - List available AI actions
- `actions run` - Execute an AI action with parameters
- `prompts list` - List available AI models for direct prompt execution
- `prompts run` - Execute a direct prompt with an AI model
- `audit agent-run` - Audit and analyze AI agent execution runs for debugging

**📚 For detailed documentation:** See the [AI-CLI README](../AI/AICLI/README.md)

#### Quick Examples:

```bash
# List all available agents
mj ai agents list

# Execute an agent with a prompt
mj ai agents run -a "Skip: Requirements Expert" -p "Create a dashboard for sales metrics"

# Start interactive chat with an agent
mj ai agents run -a "Child Component Generator Sub-agent" --chat

# List all available actions
mj ai actions list --output=table

# Execute an action with parameters
mj ai actions run -n "Get Weather" --param "Location=Boston"

# Execute action with multiple parameters
mj ai actions run -n "Send Single Message" \
  --param "To=user@example.com" \
  --param "Subject=Test Message" \
  --param "Body=Hello from MJ CLI"

# Validate action without executing
mj ai actions run -n "Calculate Expression" --param "Expression=2+2*3" --dry-run

# List available AI models
mj ai prompts list

# Execute a direct prompt
mj ai prompts run -p "Explain quantum computing in simple terms"

# Use a specific model
mj ai prompts run -p "Write a Python function to sort a list" --model "gpt-4"

# Audit recent agent runs
mj ai audit agent-run --list --status failed --days 7

# Audit specific run with summary
mj ai audit agent-run <run-id>

# Examine specific step in detail
mj ai audit agent-run <run-id> --step 3 --detail full

# Analyze errors in a run
mj ai audit agent-run <run-id> --errors

# Export full audit data
mj ai audit agent-run <run-id> --export full --file audit.json

# Use system prompt and temperature
mj ai prompts run -p "Generate a haiku" --system "You are a poet" --temperature 0.3
```

#### AI Command Options:

**Agent Commands:**
- `-a, --agent <name>`: Agent name (required)
- `-p, --prompt <text>`: Prompt to execute
- `-c, --chat`: Start interactive chat mode
- `-o, --output <format>`: Output format (compact, json, table)
- `-v, --verbose`: Show detailed execution information
- `--timeout <ms>`: Execution timeout in milliseconds (default: 300000)

**Action Commands:**
- `-n, --name <name>`: Action name (required)
- `-p, --param <key=value>`: Action parameters (can be specified multiple times)
- `--dry-run`: Validate without executing
- `-o, --output <format>`: Output format (compact, json, table)
- `-v, --verbose`: Show detailed execution information
- `--timeout <ms>`: Execution timeout in milliseconds (default: 300000)

**Prompt Commands:**
- `-p, --prompt <text>`: The prompt to execute (required)
- `-m, --model <name>`: AI model to use (e.g., gpt-4, claude-3-opus)
- `-s, --system <text>`: System prompt to set context
- `-t, --temperature <0.0-2.0>`: Temperature for response creativity
- `--max-tokens <number>`: Maximum tokens for the response
- `-c, --configuration <id>`: AI Configuration ID to use
- `-o, --output <format>`: Output format (compact, json, table)
- `-v, --verbose`: Show detailed execution information
- `--timeout <ms>`: Execution timeout in milliseconds (default: 300000)

**Audit Commands:**
- `<run-id>`: Agent Run ID (UUID) to audit (optional for --list mode)
- `-l, --list`: List recent agent runs (filter with other options)
- `-a, --agent <name>`: Filter by agent name (requires --list)
- `--status <status>`: Filter by status: success, failed, running, all (default: all)
- `--days <number>`: Number of days to look back (default: 7)
- `--limit <number>`: Maximum runs to return (default: 50)
- `-s, --step <number>`: Show details for specific step (1-based index)
- `-d, --detail <level>`: Detail level for step: minimal, standard, detailed, full (default: standard)
- `-e, --errors`: Show only error details and context
- `--export <type>`: Export data: full, summary, steps
- `-f, --file <path>`: Output file path for export
- `--max-tokens <number>`: Max tokens per field (default: 5000, 0 = no limit)
- `-o, --output <format>`: Output format (compact, json, table, markdown)
- `-v, --verbose`: Show detailed diagnostic information

#### AI Features:

**Progress Tracking**: Real-time visual progress indicators during agent execution
- Compact single-line progress in normal mode
- Detailed progress with metadata in verbose mode
- Visual icons for each execution phase (🚀 initialization, ✓ validation, 💭 execution, etc.)

**Text Formatting**: Automatic formatting of long AI responses for better readability
- Word wrapping at console width
- Paragraph and list preservation
- Code block highlighting
- JSON syntax coloring

**Interactive Chat**: Full conversation context maintained across messages
- Agent remembers previous exchanges
- Natural back-and-forth dialogue
- Exit with "exit", "quit", or Ctrl+C

**Agent Run Auditing**: Comprehensive debugging and analysis tools
- List recent runs with filtering by agent, status, and date
- View run summaries with performance metrics and step breakdowns
- Deep dive into specific steps with smart truncation for large payloads
- Automatic error pattern detection with suggested fixes
- Multiple output formats including markdown for AI assistants
- Export capabilities for offline analysis
- Optimized for read-only performance with `simple` result type

#### AI Configuration:

Add AI-specific settings to your `mj.config.cjs`:

```javascript
module.exports = {
  // Existing database settings...

  aiSettings: {
    defaultTimeout: 300000,
    outputFormat: 'compact',
    logLevel: 'info',
    enableChat: true,
    chatHistoryLimit: 10
  }
};
```

Execution logs are stored in `.mj-ai/logs/` for debugging and audit purposes.

---

### `mj test` - Testing Framework

Execute and manage tests using MemberJunction's comprehensive testing framework. Run database-driven tests, test suites, and view execution history.

```bash
mj test [COMMAND] [OPTIONS]
```

Available test commands:
- `run` - Execute a single test by ID or name
- `suite` - Execute a test suite
- `list` - List available tests, suites, and types
- `validate` - Validate test definitions without executing
- `history` - View test execution history
- `compare` - Compare test runs for regression detection

**📚 For detailed documentation:** See the [Testing CLI README](../TestingFramework/CLI/README.md)

#### Quick Examples:

```bash
# Run a single test
mj test run <test-id>

# Run a test by name
mj test run --name="Active Members Count"

# Run a test suite
mj test suite <suite-id>

# Run suite by name
mj test suite --name="Agent Quality Suite"

# List all tests
mj test list

# List test suites
mj test list --suites

# List test types
mj test list --types

# Filter by test type
mj test list --type=agent-eval

# Validate all tests
mj test validate --all

# Validate specific test type
mj test validate --type=agent-eval

# View test execution history
mj test history --test=<test-id>

# Compare two test runs
mj test compare <run-id-1> <run-id-2>

# Output formats
mj test run <test-id> --format=json --output=results.json
mj test suite <suite-id> --format=markdown --output=report.md
```

#### Test Command Options:

**Run Command:**
- `<testId>`: Test ID to execute
- `-n, --name <name>`: Test name to execute
- `-e, --environment <env>`: Environment context (dev, staging, prod)
- `-f, --format <format>`: Output format (console, json, markdown)
- `-o, --output <path>`: Output file path
- `--dry-run`: Validate without executing
- `-v, --verbose`: Show detailed execution information

**Suite Command:**
- `<suiteId>`: Test suite ID to execute
- `-n, --name <name>`: Test suite name to execute
- `-f, --format <format>`: Output format (console, json, markdown)
- `-o, --output <path>`: Output file path
- `-v, --verbose`: Show detailed execution information

**List Command:**
- `--suites`: List test suites instead of tests
- `--types`: List test types
- `-t, --type <type>`: Filter by test type
- `--tag <tag>`: Filter by tag
- `-s, --status <status>`: Filter by status
- `-f, --format <format>`: Output format (console, json, markdown)
- `-v, --verbose`: Show detailed information

**Validate Command:**
- `<testId>`: Test ID to validate
- `-a, --all`: Validate all tests
- `-t, --type <type>`: Validate tests by type
- `--save-report`: Save validation report to file
- `-f, --format <format>`: Output format (console, json, markdown)
- `-o, --output <path>`: Output file path
- `-v, --verbose`: Show detailed information

**History Command:**
- `-t, --test <id>`: Filter by test ID
- `-r, --recent <n>`: Number of recent runs to show
- `--from <date>`: Show history from date (YYYY-MM-DD)
- `-s, --status <status>`: Filter by status
- `-f, --format <format>`: Output format (console, json, markdown)
- `-o, --output <path>`: Output file path
- `-v, --verbose`: Show detailed information

**Compare Command:**
- `<runId1>`: First test run ID to compare
- `<runId2>`: Second test run ID to compare
- `-v, --version <versions>`: Compare runs by version
- `-c, --commit <commits>`: Compare runs by git commit
- `--diff-only`: Show only differences
- `-f, --format <format>`: Output format (console, json, markdown)
- `-o, --output <path>`: Output file path
- `--verbose`: Show detailed information

---

### `mj dbdoc` - Database Documentation

AI-powered database documentation generator for SQL Server, MySQL, and PostgreSQL. Analyzes your database structure, uses AI to generate comprehensive descriptions, and saves them as database metadata.

```bash
mj dbdoc [COMMAND] [OPTIONS]
```

Available dbdoc commands:
- `init` - Initialize a new DBAutoDoc project
- `analyze` - Analyze database and generate documentation
- `generate-queries` - Generate sample SQL queries from existing analysis state
- `export` - Export documentation in multiple formats (SQL, Markdown, HTML, CSV, Mermaid)
- `export-sample-queries` - Export sample queries to MemberJunction metadata format
- `status` - Show analysis status and progress
- `reset` - Reset analysis state

**📚 For detailed documentation:** See the [DBAutoDoc README](../DBAutoDoc/README.md)

#### Quick Examples:

```bash
# Initialize new project (interactive wizard)
mj dbdoc init

# Analyze database
mj dbdoc analyze

# Resume from existing state
mj dbdoc analyze --resume ./output/run-6/state.json

# Use custom config
mj dbdoc analyze --config ./my-config.json

# Generate sample SQL queries from existing state
mj dbdoc generate-queries --from-state ./output/run-1/state.json

# Generate with custom settings
mj dbdoc generate-queries --from-state ./output/run-1/state.json \
  --queries-per-table 10 \
  --output-dir ./queries

# Export sample queries to MemberJunction metadata format
mj dbdoc export-sample-queries \
  --input ./output/sample-queries.json \
  --output ./metadata/queries/.queries.json

# Export with separate SQL files and category
mj dbdoc export-sample-queries \
  --input ./output/sample-queries.json \
  --output ./metadata/queries/.queries.json \
  --separate-sql-files \
  --category "Database Documentation" \
  --min-confidence 0.8

# Export all formats
mj dbdoc export --sql --markdown --html --csv --mermaid

# Export specific state file
mj dbdoc export --state-file ./output/run-6/state.json --sql --markdown

# Apply SQL directly to database
mj dbdoc export --sql --apply

# Export with filtering
mj dbdoc export --approved-only --confidence-threshold 0.8

# Check status
mj dbdoc status

# Reset state
mj dbdoc reset --force
```

#### DBAutoDoc Command Options:

**Init Command:**
- Interactive wizard guides you through:
  - Database connection configuration
  - AI provider setup (OpenAI, Anthropic, Google, Groq)
  - Resource limits and guardrails
  - Optional seed context for better analysis

**Analyze Command:**
- `-r, --resume <path>`: Resume from an existing state file
- `-c, --config <path>`: Path to config file (default: ./config.json)

**Generate Queries Command:**
- `--from-state <path>`: Path to existing state.json file from previous analysis (required)
- `--output-dir <path>`: Output directory for generated queries (optional)
- `-c, --config <path>`: Path to config file for database connection and AI settings (default: ./config.json)
- `--queries-per-table <number>`: Number of queries to generate per table (optional, overrides config)
- `--max-execution-time <ms>`: Maximum execution time for query validation in milliseconds (optional, overrides config)

**Export Sample Queries Command:**
- `-i, --input <path>`: Path to sample-queries.json file from generate-queries (required)
- `-o, --output <path>`: Output path for the .queries.json metadata file (required)
- `--separate-sql-files`: Write SQL to separate files and use @file: references
- `--sql-dir <name>`: Directory for SQL files when using --separate-sql-files (default: SQL)
- `--category <name>`: Category name for @lookup reference (e.g., "Database Documentation")
- `--status <value>`: Status to assign (Approved/Pending/Rejected/Expired, default: Pending)
- `--min-confidence <value>`: Minimum confidence threshold to export (0-1, default: 0)
- `--validated-only`: Only export queries that were successfully validated
- `--append`: Append to existing metadata file instead of overwriting
- `--include-primary-key`: Include primaryKey and sync fields (for updating existing records)

**Export Command:**
- `-s, --state-file <path>`: Path to state JSON file
- `-o, --output-dir <path>`: Output directory for generated files
- `--sql`: Generate SQL script with database-specific metadata statements
- `--markdown`: Generate Markdown documentation with ERD diagrams
- `--html`: Generate interactive HTML documentation
- `--csv`: Generate CSV exports (tables.csv and columns.csv)
- `--mermaid`: Generate Mermaid ERD diagram files (.mmd and .html)
- `--report`: Generate analysis report with metrics
- `--apply`: Apply SQL script directly to database
- `--approved-only`: Only export approved items
- `--confidence-threshold <value>`: Minimum confidence threshold (default: 0)

**Status Command:**
- `-s, --state-file <path>`: Path to state JSON file

**Reset Command:**
- `-f, --force`: Force reset without confirmation

#### DBAutoDoc Features:

**Core Capabilities:**
- 🤖 **AI-Powered Analysis** - Uses OpenAI, Anthropic, Google, or Groq
- 🔄 **Iterative Refinement** - Multi-pass analysis with backpropagation
- 📊 **Topological Processing** - Analyzes tables in dependency order
- 📈 **Data-Driven** - Leverages cardinality, statistics, and sample data
- 🎯 **Convergence Detection** - Automatically knows when analysis is complete
- 💾 **State Tracking** - Full audit trail of all iterations
- 🔌 **Standalone** - Works with ANY database, no MemberJunction required

**Multi-Database Support:**
- SQL Server (extended properties)
- PostgreSQL (COMMENT syntax)
- MySQL (column/table comments)

**Advanced Features:**
- 🔍 **Relationship Discovery** - Detect missing primary and foreign keys
- 🎯 **Sample Query Generation** - Generate reference SQL queries for AI agent training with alignment tracking
- 🛡️ **Granular Guardrails** - Multi-level resource controls
- ⏸️ **Resume Capability** - Pause and resume from checkpoint
- 📦 **Programmatic API** - Use as a library in your applications

**Output Formats:**
- SQL Scripts (database-specific metadata)
- Markdown Documentation (human-readable with ERD)
- HTML Documentation (interactive, searchable)
- CSV Exports (spreadsheet-ready)
- Mermaid Diagrams (standalone ERD files)
- Analysis Reports (detailed metrics)
- Sample Queries (JSON with SQL, metadata, and alignment tracking)

**Sample Query Generation:**

DBAutoDoc can generate reference SQL queries that solve the **query alignment problem** where multi-query patterns (summary + detail) have inconsistent filtering logic. These "gold standard" queries include:
- Explicit filtering rules for consistency
- Alignment tracking via `relatedQueryIds`
- Query patterns (Summary+Detail, Multi-Entity Drilldown, Time Series)
- Validated, executable SQL
- Perfect for few-shot prompting in AI agents like Skip

Enable in config:
```json
{
  "analysis": {
    "sampleQueryGeneration": {
      "enabled": true,
      "queriesPerTable": 5,
      "includeMultiQueryPatterns": true,
      "validateAlignment": true
    }
  }
}
```

Or generate separately from existing state:
```bash
mj dbdoc generate-queries --from-state ./output/run-1/state.json
```

**Export to MemberJunction Metadata:**

Transform generated queries into MemberJunction's Query entity format for use with AI agents like Skip:
```bash
mj dbdoc export-sample-queries \
  --input ./output/sample-queries.json \
  --output ./metadata/queries/.queries.json \
  --category "Database Documentation" \
  --separate-sql-files

# Then sync to database
mj sync push ./metadata/queries/
```

**Use Cases:**
- Training AI agents to generate consistent multi-query patterns
- Creating reference examples for few-shot prompting
- Documenting common query patterns for your database
- Validating that related queries use consistent filtering logic
- Syncing generated queries to MemberJunction's Query entity for use by Skip

---

### `mj querygen` - AI-Powered SQL Query Generation

Generate domain-specific SQL query templates using artificial intelligence. QueryGen analyzes your database schema, generates business questions, creates SQL queries with Nunjucks templates, tests them, and exports to metadata format.

```bash
mj querygen [COMMAND] [OPTIONS]
```

Available querygen commands:
- `generate` - Generate SQL query templates for entities using AI
- `validate` - Validate existing query templates
- `export` - Export queries from database to metadata files

**📚 For detailed documentation:** See the [QueryGen README](../QueryGen/README.md)

#### Quick Examples:

```bash
# Generate queries for all entities
mj querygen generate

# Generate for specific entities with verbose output
mj querygen generate --entities "Customers,Orders" --verbose

# Control entity grouping and refinement
mj querygen generate --max-entities 2 --max-refinements 3

# Export to specific directory
mj querygen generate --output ./metadata/queries

# Choose output mode
mj querygen generate --mode database  # Write directly to database
mj querygen generate --mode both      # Both metadata and database

# Validate existing queries
mj querygen validate

# Validate specific directory
mj querygen validate --path ./metadata/queries --verbose

# Export queries from database to metadata
mj querygen export

# Export to custom location
mj querygen export --output ./exported-queries --verbose
```

#### QueryGen Command Options:

**Generate Command:**
- `-e, --entities <value>`: Specific entities to generate queries for (comma-separated)
- `-x, --exclude-entities <value>`: Entities to exclude (comma-separated)
- `-s, --exclude-schemas <value>`: Schemas to exclude (comma-separated)
- `-m, --max-entities <value>`: Max entities per group (default: 3)
- `-r, --max-refinements <value>`: Max refinement iterations (default: 3)
- `-f, --max-fixes <value>`: Max error-fixing attempts (default: 5)
- `--model <value>`: Preferred AI model
- `--vendor <value>`: Preferred AI vendor
- `-o, --output <value>`: Output directory (default: ./metadata/queries)
- `--mode <option>`: Output mode: metadata|database|both (default: metadata)
- `-v, --verbose`: Verbose output

**Validate Command:**
- `-p, --path <value>`: Path to queries metadata file or directory (default: ./metadata/queries)
- `-v, --verbose`: Verbose output

**Export Command:**
- `-o, --output <value>`: Output directory (default: ./metadata/queries)
- `-v, --verbose`: Verbose output

#### QueryGen Features:

**11-Phase Pipeline:**
1. Entity Analysis - Analyzes database schema and relationships
2. Entity Grouping - Creates logical groups of related entities
3. Business Question Generation - Uses AI to generate domain questions
4. Vector Similarity Search - Finds similar examples for few-shot learning
5. SQL Generation - Creates Nunjucks SQL templates with AI
6. Query Testing - Executes and validates queries
7. Error Fixing - Automatically fixes SQL errors using AI
8. Query Evaluation - Assesses query quality
9. Query Refinement - Iteratively improves queries
10. Testing & Validation - Comprehensive validation workflow
11. Metadata Export - Exports to MJ metadata or database

**AI-Powered Features:**
- Generates realistic business questions for your domain
- Creates SQL queries with proper Nunjucks templating
- Automatically tests and fixes SQL errors
- Refines queries based on evaluation feedback
- Uses few-shot learning with golden query examples

**Integration:**
- Outputs to MemberJunction metadata format
- Compatible with `mj sync push` for database synchronization
- Supports both metadata files and direct database writes
- Uses MJ's Query entity with automatic field/parameter extraction

---

### Utility Commands

#### `mj help`

Display help information for any command.

```bash
mj help [COMMAND]
```

#### `mj version`

Display the CLI version and additional system information.

```bash
mj version [--verbose] [--json]
```

## Environment Variables

The CLI respects the following environment variables:

- Standard Node.js environment variables
- Database connection variables set in `.env` files
- Authentication provider settings (MSAL, Auth0)

## Integration with MemberJunction Packages

The CLI integrates seamlessly with other MemberJunction packages:

- **[@memberjunction/codegen-lib](../CodeGenLib)**: Powers the code generation functionality
- **[@memberjunction/metadata-sync](../MetadataSync)**: Provides metadata synchronization capabilities ([README](../MetadataSync/README.md))
- **[@memberjunction/query-gen](../QueryGen)**: AI-powered SQL query template generation ([README](../QueryGen/README.md))
- **[@memberjunction/ai-cli](../AI/AICLI)**: Enables AI agent and action execution ([README](../AI/AICLI/README.md))
- **[@memberjunction/testing-cli](../TestingFramework/CLI)**: Testing framework for database-driven tests ([README](../TestingFramework/CLI/README.md))
- **[@memberjunction/db-auto-doc](../DBAutoDoc)**: AI-powered database documentation generator ([README](../DBAutoDoc/README.md))
- **Generated Entities**: Automatically linked during installation
- **MJAPI**: Configured and linked during installation
- **MJExplorer**: UI configuration handled during installation

## Hooks

The CLI implements the following hooks:

- **prerun**: Displays the MemberJunction ASCII banner and version information

## Development

### Building from Source

```bash
npm run build
```

### Scripts

- `build`: Compile TypeScript to JavaScript
- `prepack`: Build and generate oclif manifest
- `postpack`: Clean up generated files

## Technical Details

- Built with [oclif](https://oclif.io/) framework
- Uses TypeScript for type safety
- Implements Flyway for database migrations
- Supports both global and project-specific configurations
- Includes comprehensive error handling and validation

## Troubleshooting

### Common Issues

1. **Node Version Error**: Ensure you're using Node.js 20 or higher
2. **Database Connection**: Verify your database credentials and network access
3. **Disk Space**: The installation requires at least 2GB of free space
4. **Configuration Not Found**: Check that your config file is in a supported location

### Debug Mode

Run any command with the `--verbose` flag for detailed logging:

```bash
mj install --verbose
mj codegen --verbose
mj ai agents run -a "My Agent" -p "My prompt" --verbose
mj test run <test-id> --verbose
mj dbdoc analyze --verbose
```

## License

ISC License - see the [LICENSE](https://github.com/MemberJunction/MJ/blob/main/LICENSE) file for details.

## Repository

[https://github.com/MemberJunction/MJ](https://github.com/MemberJunction/MJ)

## Support

For issues and feature requests, please visit the [GitHub Issues](https://github.com/MemberJunction/MJ/issues) page.
