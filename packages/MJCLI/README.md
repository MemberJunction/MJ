# @memberjunction/cli

The official command-line interface (CLI) for MemberJunction, providing essential tools for installation, database management, code generation, and dependency management.

## Overview

The MemberJunction CLI (`mj`) is a comprehensive toolset designed to streamline the development and maintenance of MemberJunction applications. It handles everything from initial installation to ongoing database migrations and code generation.

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

### `mj sync`

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

For detailed documentation on metadata sync, see the [MetadataSync README](../MetadataSync/README.md).

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

### `mj ai`

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

### `mj install`

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

### `mj codegen`

Runs the MemberJunction code generation process to create TypeScript entities and metadata from your database schema.

```bash
mj codegen [--skipdb]
```

Options:
- `--skipdb`: Skip database migration before running code generation

### `mj migrate`

Applies database migrations to update your MemberJunction schema to the latest version.

```bash
mj migrate [--verbose] [--tag <version>]
```

Options:
- `--verbose`: Enable detailed logging
- `--tag <version>`: Specify a version tag for migrations (e.g., 'v2.10.0')

### `mj bump`

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

### `mj clean`

Resets the MemberJunction database to a pre-installation state. **Use with caution!**

```bash
mj clean [--verbose]
```

Note: This command is disabled by default. Set `cleanDisabled: false` in your configuration to enable it.

### `mj help`

Display help information for any command.

```bash
mj help [COMMAND]
```

### `mj version`

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

- **@memberjunction/codegen-lib**: Powers the code generation functionality
- **@memberjunction/metadata-sync**: Provides metadata synchronization capabilities
- **@memberjunction/ai-cli**: Enables AI agent and action execution
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
```

## License

ISC License - see the [LICENSE](https://github.com/MemberJunction/MJ/blob/main/LICENSE) file for details.

## Repository

[https://github.com/MemberJunction/MJ](https://github.com/MemberJunction/MJ)

## Support

For issues and feature requests, please visit the [GitHub Issues](https://github.com/MemberJunction/MJ/issues) page.
