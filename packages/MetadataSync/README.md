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
- Supporting embedded collections for related entities
- Enabling version control for all MJ metadata through Git
- Supporting CI/CD workflows for metadata deployment
- Providing a familiar file-based editing experience

## Key Features

### Hybrid File Storage
- **JSON files**: Store structured metadata for entities
- **External files**: Store large text fields (prompts, templates, etc.) in appropriate formats (.md, .html, .sql)
- **File references**: Use `@file:filename.ext` to link external files from JSON

### Embedded Collections (NEW)
- **Related Entities**: Store related records as arrays within parent JSON files
- **Hierarchical References**: Use `@parent:` and `@root:` to reference parent/root entity fields
- **Automatic Metadata**: Related entities maintain their own primaryKey and sync metadata
- **Nested Support**: Support for multiple levels of nested relationships

### Synchronization Operations
- **Pull**: Download metadata from database to local files
  - Optionally pull related entities based on configuration
  - Filter support for selective pulling
- **Push**: Upload local file changes to database
  - Process embedded collections automatically
  - Verbose mode (`-v`) for detailed output
- **Status**: Show what would change without making modifications

### Development Workflow Integration
- Watch mode for automatic syncing during development
- Dry-run mode to preview changes
- CI/CD mode for automated deployments
- Integration with existing mj.config.cjs configuration

## Supported Entities

The tool works with any MemberJunction entity - both core system entities and user-created entities. Each entity type can have its own directory structure, file naming conventions, and related entity configurations.

### Important Limitation: Database-Reflected Metadata

**This tool should NOT be used to modify metadata that is reflected from the underlying database catalog.** Examples include:
- Entity field data types
- Column lengths/precision
- Primary key definitions
- Foreign key relationships
- Table/column existence

These properties are designed to flow **from** the database catalog **up** into MJ metadata, not the other way around. Attempting to modify these via file sync could create inconsistencies between the metadata and actual database schema.

The tool is intended for managing business-level metadata such as:
- Descriptions and documentation
- Display names and user-facing text
- Categories and groupings
- Custom properties and settings
- AI prompts, templates, and other content
- Permissions and security settings
- Any other data that is not reflected **up** from the underlying system database catalogs

For more information about how CodeGen reflects system-level data from the database into the MJ metadata layer, see the [CodeGen documentation](../CodeGen/README.md).

## File Structure

The tool uses a hierarchical directory structure with cascading defaults:
- Each top-level directory represents an entity type
- `.mj-sync.json` files define entities and base defaults
- `.mj-folder.json` files define folder-specific defaults (optional)
- Only dot-prefixed JSON files (e.g., `.prompt-template.json`, `.category.json`) are treated as metadata records
- Regular JSON files without the dot prefix are ignored, allowing package.json and other config files to coexist
- External files (`.md`, `.html`, etc.) are referenced from the JSON files
- Defaults cascade down through the folder hierarchy

### File Naming Convention

**Metadata files must be prefixed with a dot (.)** to be recognized by the sync tool. This convention:
- Clearly distinguishes metadata files from regular configuration files
- Allows `package.json`, `tsconfig.json` and other standard files to coexist without being processed
- Follows established patterns like `.gitignore` and `.eslintrc.json`

Examples:
- ✅ `.greeting.json` - Will be processed as metadata
- ✅ `.customer-prompt.json` - Will be processed as metadata  
- ❌ `greeting.json` - Will be ignored
- ❌ `package.json` - Will be ignored

### File Format Options

#### Single Record per File (Default)
Each JSON file contains one record:
```json
{
  "fields": { ... },
  "relatedEntities": { ... }
}
```

#### Multiple Records per File (NEW)
JSON files can contain arrays of records:
```json
[
  {
    "fields": { ... },
    "relatedEntities": { ... }
  },
  {
    "fields": { ... },
    "relatedEntities": { ... }
  }
]
```

This is useful for:
- Grouping related records in a single file
- Reducing file clutter for entities with many small records
- Maintaining logical groupings while using `@file:` references for large content

### Example Structure
```
metadata/
├── .mj-sync.json                    # Global sync configuration
├── ai-prompts/
│   ├── .mj-sync.json               # Defines entity: "AI Prompts"
│   ├── customer-service/
│   │   ├── .mj-folder.json         # Folder metadata (CategoryID, etc.)
│   │   ├── .greeting.json          # AI Prompt record with embedded models
│   │   ├── greeting.prompt.md      # Prompt content (referenced)
│   │   └── greeting.notes.md       # Notes field (referenced)
│   └── analytics/
│       ├── .mj-folder.json         # Folder metadata (CategoryID, etc.)
│       ├── .daily-report.json      # AI Prompt record
│       └── daily-report.prompt.md  # Prompt content (referenced)
├── templates/                       # Reusable JSON templates
│   ├── standard-prompt-settings.json # Common prompt configurations
│   ├── standard-ai-models.json     # Standard model configurations
│   ├── high-performance-models.json # High-power model configurations
│   └── customer-service-defaults.json # CS-specific defaults
└── template-entities/
    ├── .mj-sync.json               # Defines entity: "Templates"
    ├── email/
    │   ├── .mj-folder.json         # Folder metadata
    │   ├── .welcome.json           # Template record (dot-prefixed)
    │   └── welcome.template.html   # Template content (referenced)
    └── reports/
        ├── .mj-folder.json         # Folder metadata
        ├── .invoice.json           # Template record (dot-prefixed)
        └── invoice.template.html   # Template content (referenced)
```

## JSON Metadata Format

### Individual Record (e.g., ai-prompts/customer-service/.greeting.json)
```json
{
  "fields": {
    "Name": "Customer Greeting",
    "Description": "Friendly customer service greeting",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "CategoryID": "@lookup:AI Prompt Categories.Name=Customer Service",
    "Temperature": 0.7,
    "MaxTokens": 1000,
    "Prompt": "@file:greeting.prompt.md",
    "Notes": "@file:../shared/notes/greeting-notes.md",
    "SystemPrompt": "@url:https://raw.githubusercontent.com/company/prompts/main/system/customer-service.md"
  },
  "primaryKey": {
    "ID": "550e8400-e29b-41d4-a716-446655440000"
  },
  "sync": {
    "lastModified": "2024-01-15T10:30:00Z",
    "checksum": "sha256:abcd1234..."
  }
}
```

### Record with Embedded Collections (NEW)
```json
{
  "fields": {
    "Name": "Customer Service Chat",
    "Description": "Main customer service prompt",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:customer-service.md",
    "Status": "Active"
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=GPT 4.1",
          "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI",
          "Priority": 1,
          "Status": "Active"
        },
        "primaryKey": {
          "ID": "BFA2433E-F36B-1410-8DB0-00021F8B792E"
        },
        "sync": {
          "lastModified": "2025-06-07T17:18:31.687Z",
          "checksum": "a642ebea748cb1f99467af2a7e6f4ffd3649761be27453b988af973bed57f070"
        }
      },
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude 4 Sonnet",
          "Priority": 2,
          "Status": "Active"
        }
      }
    ]
  },
  "primaryKey": {
    "ID": "C2A1433E-F36B-1410-8DB0-00021F8B792E"
  },
  "sync": {
    "lastModified": "2025-06-07T17:18:31.698Z",
    "checksum": "7cbd241cbf0d67c068c1434e572a78c87bb31751cbfe7734bfd32f8cea17a2c9"
  }
}
```

### Composite Primary Key Example
```json
{
  "primaryKey": {
    "UserID": "550e8400-e29b-41d4-a716-446655440000",
    "RoleID": "660f9400-f39c-51e5-b827-557766551111"
  },
  "fields": {
    "GrantedAt": "2024-01-15T10:30:00Z",
    "GrantedBy": "@lookup:Users.Email=admin@company.com",
    "ExpiresAt": "2025-01-15T10:30:00Z",
    "Notes": "@file:user-role-notes.md"
  },
  "sync": {
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

### @lookup: References (ENHANCED)
Enable entity relationships using human-readable values:
- Basic syntax: `@lookup:EntityName.FieldName=Value`
- Auto-create syntax: `@lookup:EntityName.FieldName=Value?create`
- With additional fields: `@lookup:EntityName.FieldName=Value?create&Field2=Value2`

Examples:
- `@lookup:AI Prompt Types.Name=Chat` - Fails if not found
- `@lookup:AI Prompt Categories.Name=Examples?create` - Creates if missing
- `@lookup:AI Prompt Categories.Name=Examples?create&Description=Example prompts` - Creates with description

### @parent: References (NEW)
Reference fields from the immediate parent entity in embedded collections:
- `@parent:ID` - Get the parent's ID field
- `@parent:Name` - Get the parent's Name field
- Works with any field from the parent entity

### @root: References (NEW)
Reference fields from the root entity in nested structures:
- `@root:ID` - Get the root entity's ID
- `@root:CategoryID` - Get the root's CategoryID
- Useful for deeply nested relationships

### @env: References
Support environment-specific values:
- `@env:VARIABLE_NAME`
- Useful for different environments (dev/staging/prod)

### @template: References (NEW)
Enable JSON template composition for reusable configurations:

#### String Template Reference
Use `@template:` to replace any value with template content:
```json
{
  "relatedEntities": {
    "MJ: AI Prompt Models": "@template:templates/standard-ai-models.json"
  }
}
```

#### Object Template Merging
Use `@template` field within objects to merge template content:
```json
{
  "fields": {
    "Name": "My Prompt",
    "@template": "templates/standard-prompt-settings.json",
    "Temperature": 0.9  // Overrides template value
  }
}
```

#### Multiple Template Merging
Merge multiple templates in order (later templates override earlier ones):
```json
{
  "fields": {
    "@template": [
      "templates/base-settings.json",
      "templates/customer-service-defaults.json"
    ],
    "Name": "Customer Bot"  // Local fields override all templates
  }
}
```

#### Nested Templates
Templates can reference other templates:
```json
// templates/high-performance-models.json
[
  {
    "fields": {
      "@template": "../templates/model-defaults.json",
      "ModelID": "@lookup:AI Models.Name=GPT 4o"
    }
  }
]
```

#### Template Benefits
- **DRY Principle**: Define configurations once, use everywhere
- **Maintainability**: Update template to affect all uses
- **Flexibility**: Use at any JSON level
- **Composability**: Build complex configurations from simple parts
- **Override Support**: Local values always override template values

## CLI Commands

```bash
# Initialize a directory for metadata sync
mj-sync init

# Pull all AI Prompts from database to ai-prompts directory
mj-sync pull --entity="AI Prompts"

# Pull specific records by filter
mj-sync pull --entity="AI Prompts" --filter="CategoryID='customer-service-id'"

# Pull multiple records into a single file (NEW)
mj-sync pull --entity="AI Prompts" --multi-file="all-prompts"
mj-sync pull --entity="AI Prompts" --filter="Status='Active'" --multi-file="active-prompts.json"

# Push all changes from current directory and subdirectories
mj-sync push

# Push only specific entity directory
mj-sync push --dir="ai-prompts"

# Push with verbose output (NEW)
mj-sync push -v
mj-sync push --verbose

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
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "Temperature": 0.7,
    "MaxTokens": 1500,
    "Status": "Active"
  },
  "pull": {
    "filter": "Status = 'Active'",
    "relatedEntities": {
      "MJ: AI Prompt Models": {
        "entity": "MJ: AI Prompt Models",
        "foreignKey": "ID",
        "filter": "Status = 'Active'"
      }
    }
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

## Embedded Collections (NEW)

The tool now supports managing related entities as embedded collections within parent JSON files. This is ideal for entities that have a strong parent-child relationship.

### Benefits
- **Single File Management**: Keep related data together
- **Atomic Operations**: Parent and children sync together
- **Cleaner Organization**: Fewer files to manage
- **Relationship Clarity**: Visual representation of data relationships

### Configuration for Pull
Configure which related entities to pull in `.mj-sync.json`:
```json
{
  "entity": "AI Prompts",
  "pull": {
    "relatedEntities": {
      "MJ: AI Prompt Models": {
        "entity": "MJ: AI Prompt Models",
        "foreignKey": "ID",
        "filter": "Status = 'Active'"
      },
      "AI Prompt Parameters": {
        "entity": "AI Prompt Parameters",
        "foreignKey": "ID"
      }
    }
  }
}
```

### Nested Related Entities
Support for multiple levels of nesting:
```json
{
  "fields": {
    "Name": "Parent Entity"
  },
  "relatedEntities": {
    "Child Entity": [
      {
        "fields": {
          "ParentID": "@parent:ID",
          "Name": "Child 1"
        },
        "relatedEntities": {
          "Grandchild Entity": [
            {
              "fields": {
                "ChildID": "@parent:ID",
                "RootID": "@root:ID",
                "Name": "Grandchild 1"
              }
            }
          ]
        }
      }
    ]
  }
}
```

## Console Output

### Normal Mode
Shows high-level progress:
```
Processing AI Prompts in demo/ai-prompts
  ↳ Processing 2 related MJ: AI Prompt Models records
Created: 1
Updated: 2
```

### Verbose Mode (-v flag)
Shows detailed field-level operations with hierarchical indentation:
```
Processing AI Prompts in demo/ai-prompts
  Setting Name: "Example Greeting Prompt 3" -> "Example Greeting Prompt 3"
  Setting Description: "A simple example prompt..." -> "A simple example prompt..."
  ↳ Processing 2 related MJ: AI Prompt Models records
    Setting PromptID: "@parent:ID" -> "C2A1433E-F36B-1410-8DB0-00021F8B792E"
    Setting ModelID: "@lookup:AI Models.Name=GPT 4.1" -> "123-456-789"
    Setting Priority: 1 -> 1
    ✓ Created MJ: AI Prompt Models record
```

## Use Cases

### Developer Workflow
1. `mj-sync pull --entity="AI Prompts"` to get latest prompts with their models
2. Edit prompts and adjust model configurations in VS Code
3. Test locally with `mj-sync push --dry-run`
4. Commit changes to Git
5. PR review with diff visualization
6. CI/CD runs `mj-sync push --ci` on merge

### Content Team Workflow
1. Pull prompts to local directory
2. Edit in preferred markdown editor
3. Adjust model priorities in JSON
4. Preview changes
5. Push updates back to database

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
7. **Related Data**: Manage parent-child relationships easily

## Technical Architecture

- Built with Node.js and TypeScript
- Uses oclif for CLI framework
- Integrates with MJ Core infrastructure
- Leverages existing data providers
- Supports watch mode via chokidar
- Checksums for change detection
- Dynamic primary key detection from entity metadata
- No hardcoded assumptions about entity structure
- Proper database connection cleanup

## Future Enhancements

- Plugin system for custom entity handlers
- Merge conflict resolution UI
- Bulk operations across entities
- Metadata validation rules
- Schema migration support
- Team collaboration features
- Bidirectional sync for related entities
- Custom transformation pipelines
