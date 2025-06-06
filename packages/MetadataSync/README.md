# MemberJunction Metadata Sync

A CLI tool for synchronizing MemberJunction database metadata with local file system representations. This tool enables developers and non-technical users to manage MJ metadata using their preferred editors and version control systems while maintaining the database as the source of truth.

## Overview

The Metadata Sync tool bridges the gap between database-stored metadata and file-based workflows by:
- Pulling metadata entities from database to JSON files with external file support
- Pushing local file changes back to the database
- Enabling version control for all MJ metadata through Git
- Supporting CI/CD workflows for metadata deployment
- Providing a familiar file-based editing experience

## Key Features

### Hybrid File Storage
- **JSON files**: Store structured metadata for entities
- **External files**: Store large text fields (prompts, templates, etc.) in appropriate formats (.md, .html, .sql)
- **File references**: Use `@file:filename.ext` to link external files from JSON

### Synchronization Operations
- **Pull**: Download metadata from database to local files
- **Push**: Upload local file changes to database
- **Status**: Show what would change without making modifications

### Development Workflow Integration
- Watch mode for automatic syncing during development
- Dry-run mode to preview changes
- CI/CD mode for automated deployments
- Integration with existing mj.config.cjs configuration

## Supported Entities

### Phase 1: AI Prompts (Current)
- Full support for all AI Prompt fields
- Markdown files for prompt content
- Category-based organization

### Future Phases
- Templates
- AI Models
- AI Vendors
- Query definitions
- Any MJ entity with metadata

## File Structure

The tool uses a hierarchical directory structure where:
- Each top-level directory represents an entity type
- Each directory contains a `.mj-sync.json` defining the entity
- All JSON files within are treated as records of that entity type
- External files (`.md`, `.html`, etc.) are referenced from the JSON files

### Example Structure
```
metadata/
├── .mj-sync.json                    # Global sync configuration
├── ai-prompts/
│   ├── .mj-sync.json               # Defines entity: "AI Prompts"
│   ├── customer-service/
│   │   ├── greeting.json           # AI Prompt record
│   │   ├── greeting.prompt.md      # Prompt content (referenced)
│   │   └── greeting.notes.md       # Notes field (referenced)
│   └── analytics/
│       ├── daily-report.json       # AI Prompt record
│       └── daily-report.prompt.md  # Prompt content (referenced)
└── templates/
    ├── .mj-sync.json               # Defines entity: "Templates"
    ├── email/
    │   ├── welcome.json            # Template record
    │   └── welcome.template.html   # Template content (referenced)
    └── reports/
        ├── invoice.json            # Template record
        └── invoice.template.html   # Template content (referenced)
```

## JSON Metadata Format

### Individual Record (e.g., ai-prompts/customer-service/greeting.json)
```json
{
  "_id": "550e8400-e29b-41d4-a716-446655440000",
  "_sync": {
    "lastModified": "2024-01-15T10:30:00Z",
    "checksum": "sha256:abcd1234..."
  },
  "Name": "Customer Greeting",
  "Description": "Friendly customer service greeting",
  "PromptTypeID": "@lookup:AI Prompt Types.Name=Chat",
  "CategoryID": "@lookup:AI Prompt Categories.Name=Customer Service",
  "Temperature": 0.7,
  "MaxTokens": 1000,
  "Prompt": "@file:greeting.prompt.md",
  "Notes": "@file:greeting.notes.md"
}
```

## Special Conventions

### @file: References
When a field value is exactly `@file:filename`, the tool will:
1. Read content from the specified file for push operations
2. Write content to the specified file for pull operations
3. Track both files for change detection

### @lookup: References
Enable entity relationships using human-readable values:
- `@lookup:EntityName.FieldName=Value`
- Resolved to IDs during sync operations

### @env: References
Support environment-specific values:
- `@env:VARIABLE_NAME`
- Useful for different environments (dev/staging/prod)

## CLI Commands

```bash
# Initialize a directory for metadata sync
mj-sync init

# Pull all AI Prompts from database to ai-prompts directory
mj-sync pull --entity="AI Prompts"

# Pull specific records by filter
mj-sync pull --entity="AI Prompts" --filter="CategoryID='customer-service-id'"

# Push all changes from current directory and subdirectories
mj-sync push

# Push only specific entity directory
mj-sync push --dir="ai-prompts"

# Dry run to see what would change
mj-sync push --dry-run

# Show status of local vs database
mj-sync status

# Watch for changes and auto-push
mj-sync watch

# CI/CD mode (push with no prompts)
mj-sync push --ci
```

## Configuration

The tool uses the existing `mj.config.cjs` for database configuration, eliminating the need for separate connection settings.

Configuration follows a hierarchical structure:
- **Root config**: Global settings for all operations
- **Entity configs**: Each entity directory has its own config defining the entity type
- **Inheritance**: All files within an entity directory are treated as records of that entity type

### Root Configuration (metadata/.mj-sync.json)
```json
{
  "version": "1.0.0",
  "push": {
    "validateBeforePush": true,
    "requireConfirmation": true
  },
  "watch": {
    "debounceMs": 1000,
    "ignorePatterns": ["*.tmp", "*.bak"]
  }
}
```

### Entity Configuration (metadata/ai-prompts/.mj-sync.json)
```json
{
  "entity": "AI Prompts",
  "filePattern": "*.json",
  "externalFileFields": ["Prompt", "Notes"],
  "fileExtensions": {
    "Prompt": ".prompt.md",
    "Notes": ".notes.md"
  },
  "organizationStrategy": {
    "mode": "category-folders",
    "categoryField": "CategoryID"
  }
}
```

## Use Cases

### Developer Workflow
1. `mj-sync pull` to get latest prompts
2. Edit prompts in VS Code with full markdown support
3. Test locally with `mj-sync push --dry-run`
4. Commit changes to Git
5. PR review with diff visualization
6. CI/CD runs `mj-sync push` on merge

### Content Team Workflow
1. Pull prompts to local directory
2. Edit in preferred markdown editor
3. Preview changes
4. Push updates back to database

### CI/CD Integration
```yaml
- name: Push Metadata to Production
  run: |
    npm install -g @memberjunction/metadata-sync
    mj-sync push --ci --entity="AI Prompts"
```

## Benefits

1. **Version Control**: Full Git history for all metadata changes
2. **Collaboration**: Standard PR workflows for metadata updates  
3. **Tooling**: Use any editor (VS Code, Sublime, etc.)
4. **Backup**: File-based backups of critical metadata
5. **Portability**: Easy migration between environments
6. **Automation**: CI/CD pipeline integration

## Technical Architecture

- Built with Node.js and TypeScript
- Uses Commander.js for CLI framework
- Integrates with MJ Core infrastructure
- Leverages existing data providers
- Supports watch mode via chokidar
- Checksums for change detection

## Future Enhancements

- Plugin system for custom entity handlers
- Merge conflict resolution UI
- Bulk operations across entities
- Metadata validation rules
- Schema migration support
- Team collaboration features