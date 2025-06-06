# MemberJunction Metadata Sync

A CLI tool for synchronizing MemberJunction database metadata with local file system representations. This tool enables developers and non-technical users to manage MJ metadata using their preferred editors and version control systems while maintaining the database as the source of truth.

## Purpose

MemberJunction is a powerful metadata-driven system where configuration, business logic, AI prompts, templates, and more are stored as metadata in the database. This approach provides tremendous flexibility and runtime configurability, but it can create friction in modern development workflows.

### Why This Tool Matters

**For Developers:**
- **Full IDE Support**: Edit complex prompts and templates with syntax highlighting, IntelliSense, and all your favorite editor features
- **Version Control**: Track every change with Git - see diffs, blame, history, and collaborate through pull requests
- **Branch-based Development**: Work on features in isolation, test changes, and merge when ready
- **CI/CD Integration**: Automatically deploy metadata changes as code moves through environments
- **Bulk Operations**: Use familiar command-line tools (grep, sed, find) to make sweeping changes
- **Offline Development**: Work on metadata without database connectivity

**For Non-Technical Users:**
- **Familiar Tools**: Edit prompts in Word, Notepad++, or any text editor
- **No Database Access Needed**: IT can set up sync, users just edit files
- **Folder Organization**: Intuitive file/folder structure instead of database IDs
- **Easy Sharing**: Send prompt files via email or shared drives
- **Simple Backups**: Copy/paste folders for personal backups

**For Organizations:**
- **Migration Path**: Metadata flows naturally from dev → staging → production with code
- **Compliance**: Full audit trail through version control
- **Collaboration**: Multiple team members can work on different metadata simultaneously
- **Disaster Recovery**: File-based backups complement database backups
- **Cross-System Sync**: Export from one MJ instance, import to another

### The Best of Both Worlds

This tool preserves the power of MJ's metadata-driven architecture while adding the convenience of file-based workflows. The database remains the source of truth for runtime operations, while files become the medium for creation, editing, and deployment.

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

The tool uses a hierarchical directory structure with cascading defaults:
- Each top-level directory represents an entity type
- `.mj-sync.json` files define entities and base defaults
- `.mj-folder.json` files define folder-specific defaults (optional)
- All JSON files within are treated as records of that entity type
- External files (`.md`, `.html`, etc.) are referenced from the JSON files
- Defaults cascade down through the folder hierarchy

### Example Structure
```
metadata/
├── .mj-sync.json                    # Global sync configuration
├── ai-prompts/
│   ├── .mj-sync.json               # Defines entity: "AI Prompts"
│   ├── customer-service/
│   │   ├── .mj-folder.json         # Folder metadata (CategoryID, etc.)
│   │   ├── greeting.json           # AI Prompt record
│   │   ├── greeting.prompt.md      # Prompt content (referenced)
│   │   └── greeting.notes.md       # Notes field (referenced)
│   └── analytics/
│       ├── .mj-folder.json         # Folder metadata (CategoryID, etc.)
│       ├── daily-report.json       # AI Prompt record
│       └── daily-report.prompt.md  # Prompt content (referenced)
└── templates/
    ├── .mj-sync.json               # Defines entity: "Templates"
    ├── email/
    │   ├── .mj-folder.json         # Folder metadata
    │   ├── welcome.json            # Template record
    │   └── welcome.template.html   # Template content (referenced)
    └── reports/
        ├── .mj-folder.json         # Folder metadata
        ├── invoice.json            # Template record
        └── invoice.template.html   # Template content (referenced)
```

## JSON Metadata Format

### Individual Record (e.g., ai-prompts/customer-service/greeting.json)
```json
{
  "_primaryKey": {
    "ID": "550e8400-e29b-41d4-a716-446655440000"
  },
  "_fields": {
    "Name": "Customer Greeting",
    "Description": "Friendly customer service greeting",
    "PromptTypeID": "@lookup:AI Prompt Types.Name=Chat",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Customer Service",
    "Temperature": 0.7,
    "MaxTokens": 1000,
    "Prompt": "@file:greeting.prompt.md",
    "Notes": "@file:../shared/notes/greeting-notes.md",
    "SystemPrompt": "@url:https://raw.githubusercontent.com/company/prompts/main/system/customer-service.md"
  },
  "_sync": {
    "lastModified": "2024-01-15T10:30:00Z",
    "checksum": "sha256:abcd1234..."
  }
}
```

### Composite Primary Key Example (e.g., entity-relationships/user-role.json)
```json
{
  "_primaryKey": {
    "UserID": "550e8400-e29b-41d4-a716-446655440000",
    "RoleID": "660f9400-f39c-51e5-b827-557766551111"
  },
  "_fields": {
    "GrantedAt": "2024-01-15T10:30:00Z",
    "GrantedBy": "@lookup:Users.Email=admin@company.com",
    "ExpiresAt": "2025-01-15T10:30:00Z",
    "Notes": "@file:user-role-notes.md"
  },
  "_sync": {
    "lastModified": "2024-01-15T10:30:00Z",
    "checksum": "sha256:abcd1234..."
  }
}
```

## Default Value Inheritance

The tool implements a cascading inheritance system for field defaults, similar to CSS or OOP inheritance:

1. **Entity-level defaults** (in `.mj-sync.json`) - Base defaults for all records
2. **Folder-level defaults** (in `.mj-folder.json`) - Override/extend entity defaults
3. **Nested folder defaults** - Override/extend parent folder defaults
4. **Record-level values** - Override all inherited defaults

### Inheritance Example
```
ai-prompts/.mj-sync.json         → Temperature: 0.7, MaxTokens: 1500
├── customer-service/.mj-folder.json → Temperature: 0.8 (overrides)
│   ├── greeting.json            → Uses Temperature: 0.8, MaxTokens: 1500
│   └── escalation/.mj-folder.json → Temperature: 0.6 (overrides again)
│       └── urgent.json          → Temperature: 0.9 (record override)
```

Final values for `urgent.json`:
- Temperature: 0.9 (from record)
- MaxTokens: 1500 (from entity defaults)
- All other fields from folder hierarchy

## Special Conventions

The tool supports special reference types that can be used in ANY field that accepts text content. These references are processed during push/pull operations to handle external content, lookups, and environment-specific values.

### Primary Key Handling
The tool automatically detects primary key fields from entity metadata:
- **Single primary keys**: Most common, stored as `{"ID": "value"}` or `{"CustomKeyName": "value"}`
- **Composite primary keys**: Multiple fields that together form the primary key
- **Auto-detection**: Tool reads entity metadata to determine primary key structure
- **No hardcoding**: Works with any primary key field name(s)

### @file: References
When a field value starts with `@file:`, the tool will:
1. Read content from the specified file for push operations
2. Write content to the specified file for pull operations
3. Track both files for change detection

Examples:
- `@file:greeting.prompt.md` - File in same directory as JSON
- `@file:./shared/common-prompt.md` - Relative path
- `@file:../templates/standard-header.md` - Parent directory reference

### @url: References
When a field value starts with `@url:`, the tool will:
1. Fetch content from the URL during push operations
2. Cache the content with appropriate headers
3. Support both HTTP(S) and file:// protocols

Examples:
- `@url:https://example.com/prompts/greeting.md` - Remote content
- `@url:https://raw.githubusercontent.com/company/prompts/main/customer.md` - GitHub raw content
- `@url:file:///shared/network/drive/prompts/standard.md` - Local file URL

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
  "defaults": {
    "PromptTypeID": "@lookup:AI Prompt Types.Name=Chat",
    "Temperature": 0.7,
    "MaxTokens": 1500,
    "IsActive": true
  }
}
```

### Folder Defaults (metadata/ai-prompts/customer-service/.mj-folder.json)
```json
{
  "defaults": {
    "CategoryID": "@lookup:AI Prompt Categories.Name=Customer Service",
    "Temperature": 0.8,
    "Tags": ["customer-service", "support"]
  }
}
```

### Nested Folder Defaults (metadata/ai-prompts/customer-service/escalation/.mj-folder.json)
```json
{
  "defaults": {
    "Tags": ["customer-service", "support", "escalation", "priority"],
    "MaxTokens": 2000,
    "Temperature": 0.6
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
- Dynamic primary key detection from entity metadata
- No hardcoded assumptions about entity structure

## Future Enhancements

- Plugin system for custom entity handlers
- Merge conflict resolution UI
- Bulk operations across entities
- Metadata validation rules
- Schema migration support
- Team collaboration features