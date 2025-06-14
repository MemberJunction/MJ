# MemberJunction Core Metadata

This directory contains the core metadata definitions for MemberJunction system components, maintained using the MemberJunction Metadata Sync (`mj-sync`) tool.

## Overview

The metadata directory serves as the source of truth for core system configurations including:
- **Actions** - Reusable action definitions for the Action Engine
- **AI Agent Types** - Agent type definitions and configurations
- **AI Agents** - Individual agent instances with their specific settings
- **AI Prompts** - Prompt templates and configurations for AI operations

Many directories include demo/example records for illustrative purposes, showing best practices and common patterns for implementing these components.

## Directory Structure

```
metadata/
├── .mj-sync.json           # Global sync configuration
├── actions/                # Action definitions
│   ├── .mj-sync.json      # Actions entity sync config
│   └── .actions.json      # Action records (includes demo actions)
├── agent-types/            # AI Agent Type definitions
│   ├── .mj-sync.json      # Agent Types entity sync config
│   └── .agent-types.json  # Agent Type records (includes Loop demo type)
├── agents/                 # AI Agent instances
│   ├── .mj-sync.json      # Agents entity sync config
│   └── .agents.json       # Agent records (includes Demo Loop Agent)
└── prompts/                # AI Prompt configurations
    ├── .mj-sync.json      # Prompts entity sync config
    ├── .prompts.json      # Prompt records
    ├── templates/         # Prompt template files (.md)
    │   └── *.template.md  # Including demo templates
    └── output/            # Example output files (.json)
        └── *.example.json # Demo output examples
```

## Demo Records

The metadata includes several demonstration records to illustrate proper usage:

- **Demo Actions**: Fibonacci sequence generator, weather lookup, delay action, console logging
- **Demo Agent Type**: "Loop" type showing basic agent structure
- **Demo Agent**: "Demo Loop Agent" implementing the Loop type
- **Demo Prompts**: Example prompt templates with proper formatting and output structures

These demos serve as reference implementations for creating new components.

## Configuration

The root `.mj-sync.json` file defines:
- **directoryOrder**: Processing sequence for entity directories (important for dependencies)
- **sqlLogging**: Configuration for SQL output logging during sync operations

## Using mj-sync

The `mj-sync` tool (from `@memberjunction/metadata-sync`) manages bidirectional synchronization between these files and the database.

### Common Commands

```bash
# Push all metadata to database
npx mj-sync push --dir ./metadata

# Push specific entity type
npx mj-sync push --dir ./metadata/actions

# Pull metadata from database
npx mj-sync pull --dir ./metadata

# Dry run to see what would change
npx mj-sync push --dir ./metadata --dry-run

# Watch for changes and auto-sync
npx mj-sync watch --dir ./metadata
```

## Entity Dependencies

The `directoryOrder` in `.mj-sync.json` ensures entities are processed in the correct order:
1. **actions** - Independent entity, no dependencies
2. **prompts** - May be referenced by agents
3. **agent-types** - Referenced by agents
4. **agents** - Depends on agent-types and prompts

## File Conventions

### Entity Files
- Named with dot prefix: `.{entity-name}.json`
- Contains array of entity records
- Supports lookups: `@lookup:EntityName.Field=Value`
- Supports file references: `@file:relative/path/to/file`
- Supports parent references: `@parent:FieldName`

### Template Files
- Stored in `templates/` subdirectories
- Use `.md` extension for prompt templates
- Referenced via `@file:` notation in entity records

### Example Output Files
- Stored in `output/` subdirectories
- Use `.json` extension for structured examples
- Help document expected AI response formats

## Best Practices

1. **Version Control**: All metadata files should be committed to version control
2. **Atomic Changes**: Make related changes together (e.g., agent + its prompts)
3. **Validation**: Use `--dry-run` to preview changes before pushing
4. **Backups**: Configure backups in `.mj-sync.json` for pull operations
5. **Documentation**: Include descriptions for all entities
6. **Naming**: Use clear, consistent naming conventions

## SQL Logging

When `sqlLogging.enabled` is true, all database operations are logged to:
```
./sql_logging/metadata-sync-{command}_{entity}_{timestamp}.sql
```

This is useful for:
- Auditing changes
- Debugging sync issues
- Manual database updates if needed

## See Also

- [MemberJunction Metadata Sync Documentation](https://github.com/MemberJunction/MJ/tree/main/packages/MetadataSync)
- [MemberJunction Documentation](https://docs.memberjunction.org)