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
