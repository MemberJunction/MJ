# Database Auto-Documentation Generator

AI-powered documentation generator for SQL Server databases. Analyzes your database structure, uses AI to generate comprehensive table and column descriptions, and saves them as SQL Server extended properties.

## 🚀 **Standalone Tool - No MemberJunction Runtime Required**

This tool works with **ANY** SQL Server database. You don't need MemberJunction installed or running.

## Features

- **🤖 AI-Powered**: Uses LLMs (OpenAI, Anthropic, etc.) to generate intelligent descriptions
- **🔄 Human-in-Loop**: Interactive mode to provide context and approve AI-generated descriptions
- **💾 State Management**: JSON state file tracks progress, user input, and AI generations across runs
- **🎯 Incremental**: Only processes new or changed tables on subsequent runs
- **🔍 Smart Analysis**:
  - Dependency graph analysis (documents root tables first)
  - Pattern detection (lookup tables, bridge tables, audit tables)
  - Data profiling (sample data, statistics, pattern recognition)
  - Constraint analysis (PKs, FKs, CHECK, UNIQUE)
- **📊 Multiple Outputs**:
  - SQL scripts with `sp_addextendedproperty` statements
  - Markdown documentation
  - Updated state file for next run

## Installation

```bash
# Install globally (for standalone use)
npm install -g @memberjunction/db-auto-doc

# Or use with npx
npx @memberjunction/db-auto-doc

# Or use via MJ CLI (if you have MemberJunction installed)
mj dbdoc --help
```

## Quick Start

### Standalone CLI

```bash
# 1. Initialize project
db-auto-doc init

# 2. Edit .env and add your AI API key
# AI_API_KEY=sk-your-key-here

# 3. Analyze database
db-auto-doc analyze

# 4. Review results
db-auto-doc review

# 5. Export documentation
db-auto-doc export --format=all
```

### Via MJ CLI (MemberJunction Users)

```bash
# Same commands, different prefix
mj dbdoc init
mj dbdoc analyze --schemas=dbo
mj dbdoc review --unapproved-only
mj dbdoc export --approved-only --execute
```

### Programmatic Usage

```typescript
import {
  DatabaseConnection,
  StateManager,
  DatabaseAnalyzer,
  SimpleAIClient,
} from '@memberjunction/db-auto-doc';

// Initialize
const connection = DatabaseConnection.fromEnv();
const stateManager = new StateManager();
const aiClient = new SimpleAIClient();
const analyzer = new DatabaseAnalyzer(connection, stateManager, aiClient);

// Analyze
await analyzer.analyze({ schemas: ['dbo'] });

// Export
import { SQLGenerator, MarkdownGenerator } from '@memberjunction/db-auto-doc';
const state = stateManager.getState();
const sqlGen = new SQLGenerator();
const sql = sqlGen.generate(state);
```

## CLI Commands

### `db-auto-doc init`
Initialize new documentation project
- Prompts for database connection
- Creates `.env` file
- Creates `db-doc-state.json`
- Optionally asks seed questions

### `db-auto-doc analyze`
Analyze database and generate documentation
- `--interactive` - Ask questions during analysis
- `--incremental` - Only process new/changed tables
- `--schemas <schemas>` - Comma-separated schema list
- `--batch` - Non-interactive mode

### `db-auto-doc review`
Review and approve AI-generated documentation
- `--schema <schema>` - Review specific schema
- `--unapproved-only` - Only show unapproved items

### `db-auto-doc export`
Generate output files
- `--format <format>` - sql|markdown|all (default: all)
- `--output <path>` - Output directory
- `--execute` - Execute SQL script (apply to database)
- `--approved-only` - Only export approved items

### `db-auto-doc reset`
Reset state file
- `--all` - Reset entire state file

## Configuration

Create a `.env` file:

```env
# Database Connection
DB_SERVER=localhost
DB_DATABASE=YourDatabase
DB_USER=sa
DB_PASSWORD=YourPassword
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_API_KEY=sk-your-api-key-here
```

## State File

The `db-doc-state.json` file tracks everything:

```json
{
  "version": "1.0",
  "database": {
    "server": "localhost",
    "database": "MyDatabase"
  },
  "seedContext": {
    "overallPurpose": "E-commerce platform",
    "businessDomains": ["Sales", "Inventory"]
  },
  "schemas": {
    "dbo": {
      "tables": {
        "Customers": {
          "userNotes": "Merged from Stripe and internal CRM",
          "userApproved": true,
          "aiGenerated": {
            "description": "Primary customer records...",
            "confidence": 0.85
          },
          "finalDescription": "...",
          "columns": { }
        }
      }
    }
  },
  "runHistory": [ ]
}
```

## Example Workflow

```bash
# First run
db-auto-doc init
db-auto-doc analyze --interactive
db-auto-doc review
db-auto-doc export --format=all

# Add context and refine
# Edit db-doc-state.json to add notes
db-auto-doc analyze --incremental
db-auto-doc review --unapproved-only

# Ready for production
db-auto-doc export --approved-only --execute
```

## How It Works

1. **Introspection**: Queries SQL Server system catalogs
2. **Profiling**: Samples data and analyzes patterns
3. **AI Generation**: Sends context to LLM for descriptions
4. **Human Review**: User approves/refines results
5. **Output**: Generates SQL scripts and markdown docs
6. **Application**: Optionally executes SQL to add extended properties

## Architecture

Built following the **AI CLI pattern** (similar to `@memberjunction/ai-cli`):
- **oclif-based commands** in `src/commands/` (init, analyze, review, export, reset)
- **Standalone package** with zero MJ runtime dependencies
- **MJCLI integration** via thin delegation commands in `packages/MJCLI/src/commands/dbdoc/`
- **Reusable services** exported for programmatic use
- **State file architecture** enables incremental refinement across runs

## Future Enhancements

Possible future additions (not needed for current functionality):
- Support for more AI providers (Groq, Cerebras, local models)
- PostgreSQL/MySQL versions
- Web UI for review
- Dependency graph visualization
- CI/CD integration examples
- Schema diff detection for automatic re-documentation

## Requirements

- Node.js 18+
- SQL Server database access
- OpenAI or Anthropic API key

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.org

## Credits

Built by the MemberJunction team for the SQL Server community.
