# MemberJunction Metadata Sync

A library for synchronizing MemberJunction database metadata with local file system representations. This library is integrated into the MemberJunction CLI (`mj`) and enables developers and non-technical users to manage MJ metadata using their preferred editors and version control systems while maintaining the database as the source of truth.

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

## Creating Error-Free Entity Files

### Quick Start Checklist

Before creating entity JSON files, follow this checklist to avoid common mistakes:

✅ **1. Find the Entity Definition**
- Open `packages/MJCoreEntities/src/generated/entity_subclasses.ts` or `packages/GeneratedEntities/src/generated/entity_subclasses.ts`
- Search for `class [EntityName]Entity` (e.g., `class TemplateEntity`)
- Review JSDoc comments and property definitions to identify required vs optional fields

✅ **2. Check Required Fields**
- Look for JSDoc comments with `@required` annotations
- Fields without `?` in TypeScript definitions are typically required
- Always include `Name` (almost always required)
- Always include `UserID` (use System User ID: `ECAFCCEC-6A37-EF11-86D4-000D3A4E707E`)

✅ **3. Validate Field Names**
- Use exact field names from the BaseEntity class definition
- Field names are case-sensitive
- Don't assume fields exist (e.g., not all entities have `Status`)

✅ **4. Use Correct File Naming**
- Configuration files (.mj-sync.json, .mj-folder.json) must start with dot
- Metadata files follow the `filePattern` in your .mj-sync.json
- Most common: `"filePattern": "*.json"` (matches any .json file)
- Alternative: `"filePattern": ".*.json"` (matches dot-prefixed .json files)

✅ **5. Set Up Directory Structure**
- Create `.mj-sync.json` in the entity directory
- Use glob patterns: `"filePattern": "*.json"` (not regex: `".*.json"`)

### Discovering Entity Structure

**CRITICAL**: Before creating entity files, you must understand the entity's field structure. Most errors occur because users are unfamiliar with the required fields, data types, and constraints.

#### Finding Entity Definitions

The approach depends on whether you're working inside or outside the MemberJunction monorepo:

##### Working Inside MJ Monorepo

Entity classes are located in:

- **Core MJ Entities**: `packages/MJCoreEntities/src/generated/entity_subclasses.ts`
  - System entities like Users, Roles, EntityFields, etc.
  - AI-related entities like AI Prompts, AI Models, etc.
  
- **Custom Entities**: `packages/GeneratedEntities/src/generated/entity_subclasses.ts`  
  - Your application-specific entities
  - Business domain entities

##### Working Outside MJ Monorepo (In Your Own Project)

Entity classes are located in:

- **Core MJ Entities**: `node_modules/@memberjunction/core-entities/dist/generated/entity_subclasses.js`
  - Note: This is compiled JavaScript, but your IDE should provide IntelliSense
  - For TypeScript definitions: `node_modules/@memberjunction/core-entities/dist/generated/entity_subclasses.d.ts`
  
- **Custom Entities**: Your project's generated entities location (varies by project structure)
  - Common locations: `src/generated/`, `packages/entities/`, or similar
  - Look for files containing your custom entity classes

##### Best Practice: Use Your IDE's IntelliSense

**Recommended approach for all scenarios:**

1. **Import the entity class** in your IDE:
   ```typescript
   import { TemplateEntity } from '@memberjunction/core-entities';
   ```

2. **Create an instance and explore with IntelliSense**:
   ```typescript
   const template = new TemplateEntity();
   // Type "template." and let your IDE show available properties
   ```

3. **Check the class definition** (F12 or "Go to Definition") to see:
   - JSDoc comments with field descriptions
   - Required vs optional fields
   - Field types and validation rules
   - Relationships and constraints

#### How to Find Required Fields

1. **Use IDE IntelliSense** (Recommended):
   - Import the entity class
   - Create an instance: `const entity = new TemplateEntity();`
   - Use "Go to Definition" (F12) to see the BaseEntity class
   - Look for JSDoc comments and field definitions

2. **Examine the BaseEntity Class**:
   - Find the entity class (e.g., `class TemplateEntity`)
   - Look at property declarations with JSDoc comments
   - Check for required vs optional field annotations
   - Review any validation methods or constraints

3. **Runtime Metadata Discovery**:
   ```typescript
   import { Metadata } from '@memberjunction/core';
   
   const md = new Metadata();
   const entityInfo = md.EntityByName('Templates');
   console.log('Required fields:', entityInfo.Fields.filter(f => !f.AllowsNull));
   ```

#### Example: Templates Entity Structure
```typescript
// BaseEntity class (accessible via IDE IntelliSense)
export class TemplateEntity extends BaseEntity {
  /**
   * Primary key - auto-generated GUID
   */
  ID: string;
  
  /**
   * Template name - REQUIRED
   * @required
   */
  Name: string;
  
  /**
   * Template description - optional
   */
  Description?: string;
  
  /**
   * User who created this template - REQUIRED
   * Must be a valid User ID
   * @required
   * @foreignKey Users.ID
   */
  UserID: string;
  
  /**
   * Category for organizing templates - optional
   * @foreignKey TemplateCategories.ID
   */
  CategoryID?: string;
  
  // Note: Status field may not exist on all entities!
}
```

#### Common Required Fields Pattern

Most MJ entities follow these patterns:

**Always Required:**
- `ID` - Primary key (GUID) - auto-generated if not provided
- `Name` - Human-readable name
- `UserID` - Creator/owner (use System User: `ECAFCCEC-6A37-EF11-86D4-000D3A4E707E`)

**Often Required:**
- `Description` - Usually optional but recommended
- Foreign key fields ending in `ID` - Check if they have `.optional()`

**Be Careful With:**
- `Status` fields - Some entities have them, others don't
- Enum fields - Must match exact values from database
- DateTime fields - Use ISO format: `2024-01-15T10:30:00Z`

### Common Mistakes and Solutions

#### ❌ Mistake 1: Using Non-Existent Fields
```json
{
  "fields": {
    "Name": "My Template",
    "Status": "Active"  // ❌ Templates entity may not have Status field
  }
}
```

**✅ Solution**: Check the BaseEntity class first
```typescript
// In entity_subclasses.ts - if you don't see Status here, don't use it
export class TemplateEntity extends BaseEntity {
  Name: string;  // Required
  Description?: string;  // Optional (note the ?)
  // No Status field defined
}
```

#### ❌ Mistake 2: Missing Required Fields
```json
{
  "fields": {
    "Name": "My Template"
    // ❌ Missing required UserID
  }
}
```

**✅ Solution**: Include all required fields
```json
{
  "fields": {
    "Name": "My Template",
    "UserID": "ECAFCCEC-6A37-EF11-86D4-000D3A4E707E"
  }
}
```

#### ❌ Mistake 3: Wrong File Pattern in .mj-sync.json
```json
{
  "entity": "Templates",
  "filePattern": ".*.json"  // ❌ This is regex, not glob
}
```

**✅ Solution**: Use glob patterns
```json
{
  "entity": "Templates", 
  "filePattern": "*.json"  // ✅ Correct glob pattern
}
```

#### ❌ Mistake 4: Incorrect Data Types
```json
{
  "fields": {
    "Name": "My Template",
    "CreatedAt": "2024-01-15",  // ❌ Wrong datetime format
    "Priority": "1"  // ❌ Should be number, not string
  }
}
```

**✅ Solution**: Use correct data types
```json
{
  "fields": {
    "Name": "My Template",
    "CreatedAt": "2024-01-15T10:30:00Z",  // ✅ ISO format
    "Priority": 1  // ✅ Number type
  }
}
```

#### ❌ Mistake 5: Files Not Being Detected
```
mydir/
├── .mj-sync.json (with "filePattern": "*.json")
├── template1.txt  // ❌ Wrong extension
└── .template2.json  // ❌ Dot prefix when pattern is "*.json"
```

**✅ Solution**: Match your filePattern
```
mydir/
├── .mj-sync.json (with "filePattern": "*.json")
├── template1.json  // ✅ Matches *.json pattern
└── template2.json  // ✅ Matches *.json pattern
```

### Step-by-Step Entity File Creation

#### Step 1: Research the Entity
```bash
# Open in your IDE:
packages/MJCoreEntities/src/generated/entity_subclasses.ts

# Search for your entity class (Ctrl+F):
class TemplateEntity

# Note the required vs optional fields:
Name: string;           // Required (no ?)
UserID: string;         // Required (no ?)  
Description?: string;   // Optional (note the ?)
```

#### Step 2: Create Directory Structure
```bash
mkdir templates
cd templates

# Create entity config (dot-prefixed configuration file)
echo '{
  "entity": "Templates",
  "filePattern": "*.json"
}' > .mj-sync.json
```

#### Step 3: Create Your First Entity File
```bash
# Create metadata file (follows filePattern from .mj-sync.json)
echo '{
  "fields": {
    "Name": "My First Template",
    "Description": "A test template",
    "UserID": "ECAFCCEC-6A37-EF11-86D4-000D3A4E707E"
  }
}' > my-first-template.json
```

#### Step 4: Test and Validate
```bash
# Dry run to check for errors
mj sync push --dir="templates" --dry-run

# If successful, do actual push
mj sync push --dir="templates"
```

### AI/LLM Guidelines

When using AI tools (like Claude, ChatGPT, etc.) to generate entity files:

**🤖 For AI Assistants:**

1. **Always check entity definitions first** - Never assume field names or requirements
2. **Look up the exact BaseEntity class** in the generated entity files
3. **Use the System User ID** (`ECAFCCEC-6A37-EF11-86D4-000D3A4E707E`) for UserID fields
4. **Include only fields that exist** in the entity definition
5. **Use proper data types** as defined in the BaseEntity class
6. **Remember file naming rules**:
   - Configuration files (.mj-sync.json) must have dot prefix
   - Metadata files follow the filePattern in .mj-sync.json
7. **Use glob patterns** in .mj-sync.json, not regex patterns

**📝 Prompt Template for AI:**
```
I need to create entity files for the [EntityName] entity in MemberJunction.

Please:
1. First, check the entity definition in packages/MJCoreEntities/src/generated/entity_subclasses.ts
2. Find the class [EntityName]Entity (e.g., class TemplateEntity)
3. Review JSDoc comments and property definitions to identify required vs optional fields
4. Create a .mj-sync.json file with correct glob pattern
5. Create sample metadata JSON files following the filePattern
6. Use UserID: "ECAFCCEC-6A37-EF11-86D4-000D3A4E707E" for required UserID fields
7. Follow the exact field names and data types from the BaseEntity class definition

CRITICAL: Configuration files (.mj-sync.json) must start with dot, but metadata files follow the filePattern specified in the configuration.
```

### Understanding File Naming Rules

**Configuration Files (Always Dot-Prefixed):**
- ✅ `.mj-sync.json` - Entity configuration
- ✅ `.mj-folder.json` - Folder defaults
- ❌ `mj-sync.json` - Won't be recognized

**Metadata Files (Follow filePattern):**
With `"filePattern": "*.json"`:
- ✅ `my-template.json` - Will be processed
- ✅ `greeting.json` - Will be processed  
- ❌ `.my-template.json` - Won't match pattern
- ❌ `package.json` - Will be ignored (add to ignore list if needed)

With `"filePattern": ".*.json"`:
- ✅ `.my-template.json` - Will be processed
- ✅ `.greeting.json` - Will be processed
- ❌ `my-template.json` - Won't match pattern
- ❌ `package.json` - Won't match pattern

### Troubleshooting Quick Reference

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `No entity directories found` | Missing .mj-sync.json or wrong filePattern | Check .mj-sync.json exists and uses `"*.json"` |
| `Field 'X' does not exist on entity 'Y'` | Using non-existent field | Check BaseEntity class in entity_subclasses.ts |
| `User ID cannot be null` | Missing required UserID | Add `"UserID": "ECAFCCEC-6A37-EF11-86D4-000D3A4E707E"` |
| `Processing 0 records` | Files don't match filePattern | Check files match pattern in .mj-sync.json |
| Failed validation | Wrong data type or format | Check BaseEntity class for field types |

### System User ID Reference

**Always use this GUID for UserID fields:**
```
ECAFCCEC-6A37-EF11-86D4-000D3A4E707E
```

This is the System User ID that should be used when creating entity records through the MetadataSync tool. Using any other ID or leaving it null will cause validation errors.

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

All MetadataSync commands are available through the MemberJunction CLI under the `sync` namespace:

```bash
# Validate all metadata files
mj sync validate

# Validate a specific directory
mj sync validate --dir="./metadata"

# Validate with detailed output
mj sync validate --verbose

# Validate with JSON output for CI/CD
mj sync validate --format=json

# Initialize a directory for metadata sync
mj sync init

# Pull all AI Prompts from database to ai-prompts directory
mj sync pull --entity="AI Prompts"

# Pull specific records by filter
mj sync pull --entity="AI Prompts" --filter="CategoryID='customer-service-id'"

# Pull multiple records into a single file (NEW)
mj sync pull --entity="AI Prompts" --multi-file="all-prompts"
mj sync pull --entity="AI Prompts" --filter="Status='Active'" --multi-file="active-prompts.json"

# Push all changes from current directory and subdirectories
mj sync push

# Push only specific entity directory
mj sync push --dir="ai-prompts"

# Push with verbose output (NEW)
mj sync push -v
mj sync push --verbose

# Dry run to see what would change
mj sync push --dry-run

# Show status of local vs database
mj sync status

# Watch for changes and auto-push
mj sync watch

# CI/CD mode (push with no prompts, fails on validation errors)
mj sync push --ci

# Push/Pull without validation
mj sync push --no-validate
mj sync pull --entity="AI Prompts" --no-validate
```

## Configuration

The tool uses the existing `mj.config.cjs` for database configuration, eliminating the need for separate connection settings.

Configuration follows a hierarchical structure:
- **Root config**: Global settings for all operations
- **Entity configs**: Each entity directory has its own config defining the entity type
- **Inheritance**: All files within an entity directory are treated as records of that entity type

### Directory Processing Order (NEW)

The MetadataSync tool now supports custom directory processing order to handle dependencies between entity types. This feature ensures that dependent entities are processed in the correct order.

#### Directory Order Configuration

Directory order is configured in the root-level `.mj-sync.json` file only (not inherited by subdirectories):

```json
{
  "version": "1.0.0",
  "directoryOrder": [
    "prompts",
    "agent-types"
  ]
}
```

#### How It Works

- **Ordered Processing**: Directories listed in `directoryOrder` are processed first, in the specified order
- **Remaining Directories**: Any directories not listed are processed after the ordered ones, in alphabetical order
- **Dependency Management**: Ensures prompts are created before agent types that reference them
- **Flexible**: Only specify the directories that have order requirements

#### Example Use Cases

1. **AI Prompts → Agent Types**: Create prompts before agent types that reference them
2. **Categories → Items**: Create category records before items that reference them
3. **Parent → Child**: Process parent entities before child entities with foreign key dependencies

### SQL Logging (NEW)

The MetadataSync tool now supports SQL logging for capturing all database operations during push commands. This feature is useful for:
- Creating migration files from MetadataSync operations
- Debugging database changes
- Understanding what SQL operations occur during push
- Creating migration scripts for deployment to other environments

#### SQL Logging Configuration

SQL logging is configured in the root-level `.mj-sync.json` file only (not inherited by subdirectories):

```json
{
  "version": "1.0.0",
  "sqlLogging": {
    "enabled": true,
    "outputDirectory": "./sql_logging",
    "formatAsMigration": true
  }
}
```

#### SQL Logging Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | false | Whether to enable SQL logging during push operations |
| `outputDirectory` | string | "./sql_logging" | Directory to output SQL log files (relative to command execution directory) |
| `formatAsMigration` | boolean | false | Whether to format SQL as migration-ready files with Flyway schema placeholders |

#### SQL Log File Format

When `formatAsMigration` is `false`, log files are named:
```
metadatasync-push-YYYY-MM-DDTHH-MM-SS.sql
```

When `formatAsMigration` is `true`, log files are named as Flyway migrations:
```
VYYYYMMDDHHMMSS__MetadataSync_Push.sql
```

Migration files include:
- Header comments with timestamp and description
- Schema placeholders that can be replaced during deployment
- Properly formatted SQL statements with parameters

#### Example Usage

1. **Enable SQL logging** in your root `.mj-sync.json`:
   ```json
   {
     "version": "1.0.0",
     "sqlLogging": {
       "enabled": true,
       "outputDirectory": "./migrations",
       "formatAsMigration": true
     }
   }
   ```

2. **Run push command** as normal:
   ```bash
   mj sync push
   ```

3. **Review generated SQL** in the output directory:
   ```
   migrations/
   └── V20241215103045__MetadataSync_Push.sql
   ```

The SQL logging runs in parallel with the actual database operations, ensuring minimal performance impact while capturing all SQL statements for review and potential migration use.

### Root Configuration (metadata/.mj-sync.json)
```json
{
  "version": "1.0.0",
  "directoryOrder": [
    "prompts",
    "agent-types"
  ],
  "push": {
    "validateBeforePush": true,
    "requireConfirmation": true
  },
  "sqlLogging": {
    "enabled": true,
    "outputDirectory": "./sql_logging",
    "formatAsMigration": false
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
  "filePattern": ".*.json",
  "defaults": {
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "Temperature": 0.7,
    "MaxTokens": 1500,
    "Status": "Active"
  },
  "pull": {
    "filePattern": ".*.json",
    "updateExistingRecords": true,
    "createNewFileIfNotFound": true,
    "mergeStrategy": "merge",
    "filter": "Status = 'Active'",
    "externalizeFields": [
      {
        "field": "Prompt",
        "pattern": "@file:{Name}.prompt.md"
      }
    ],
    "relatedEntities": {
      "MJ: AI Prompt Models": {
        "entity": "MJ: AI Prompt Models",
        "foreignKey": "PromptID",
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

## Recursive Patterns (NEW)

The tool now supports automatic recursive patterns for self-referencing entities, eliminating the need to manually define each nesting level for hierarchical data structures.

### Benefits
- **Simplified Configuration**: No need to manually define each hierarchy level
- **Automatic Depth Handling**: Adapts to actual data depth dynamically
- **Reduced Maintenance**: Configuration stays simple regardless of data changes
- **Safeguards**: Built-in protection against infinite loops and excessive memory usage

### Recursive Configuration

Enable recursive patterns for self-referencing entities:

```json
{
  "pull": {
    "entities": {
      "AI Agents": {
        "relatedEntities": {
          "AI Agents": {
            "entity": "AI Agents",
            "foreignKey": "ParentID",
            "recursive": true,        // Enable recursive fetching
            "maxDepth": 10,          // Optional depth limit (omit for default of 10)
            "filter": "Status = 'Active'"
          }
        }
      }
    }
  }
}
```

### How It Works

When `recursive: true` is set:

1. **Automatic Child Fetching**: The tool automatically fetches child records at each level
2. **Dynamic Depth**: Continues until no more children are found or max depth is reached
3. **Circular Reference Protection**: Prevents infinite loops by tracking processed record IDs
4. **Consistent Configuration**: All recursive levels use the same `lookupFields`, `externalizeFields`, etc.

### Before vs After

**Before (Manual Configuration):**
```json
{
  "pull": {
    "relatedEntities": {
      "AI Agents": {
        "entity": "AI Agents", 
        "foreignKey": "ParentID",
        "relatedEntities": {
          "AI Agents": {
            "entity": "AI Agents",
            "foreignKey": "ParentID",
            "relatedEntities": {
              "AI Agents": {
                "entity": "AI Agents",
                "foreignKey": "ParentID"
                // Must manually add more levels...
              }
            }
          }
        }
      }
    }
  }
}
```

**After (Recursive Configuration):**
```json
{
  "pull": {
    "relatedEntities": {
      "AI Agents": {
        "entity": "AI Agents",
        "foreignKey": "ParentID", 
        "recursive": true,
        "maxDepth": 10
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `recursive` | boolean | false | Enable automatic recursive fetching |
| `maxDepth` | number | 10 | Maximum recursion depth to prevent infinite loops |

### Safeguards

- **Circular Reference Detection**: Tracks processed record IDs to prevent infinite loops
- **Maximum Depth Limit**: Configurable depth limit (default: 10) prevents excessive memory usage
- **Performance Monitoring**: Verbose mode shows recursion depth and skipped circular references
- **Backward Compatibility**: Existing configurations continue to work unchanged

### Configuration for Pull

The pull command now supports smart update capabilities with extensive configuration options:

```json
{
  "entity": "AI Prompts",
  "filePattern": ".*.json",
  "pull": {
    "filePattern": ".*.json",
    "createNewFileIfNotFound": true,
    "newFileName": ".all-new.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "preserveFields": ["customField", "localNotes"],
    "mergeStrategy": "merge",
    "backupBeforeUpdate": true,
    "filter": "Status = 'Active'",
    "externalizeFields": [
      {
        "field": "TemplateText",
        "pattern": "@file:{Name}.template.md"
      },
      {
        "field": "PromptText",
        "pattern": "@file:prompts/{Name}.prompt.md"
      }
    ],
    "excludeFields": ["InternalID", "TempField"],
    "lookupFields": {
      "CategoryID": {
        "entity": "AI Prompt Categories",
        "field": "Name"
      },
      "TypeID": {
        "entity": "AI Prompt Types",
        "field": "Name"
      }
    },
    "relatedEntities": {
      "MJ: AI Prompt Models": {
        "entity": "MJ: AI Prompt Models",
        "foreignKey": "PromptID",
        "filter": "Status = 'Active'",
        "lookupFields": {
          "ModelID": {
            "entity": "AI Models",
            "field": "Name"
          }
        }
      }
    }
  }
}
```

#### Pull Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filePattern` | string | Entity filePattern | Pattern for finding existing files to update |
| `createNewFileIfNotFound` | boolean | true | Create files for records not found locally |
| `newFileName` | string | - | Filename for new records when appending (see warning below) |
| `appendRecordsToExistingFile` | boolean | false | Append new records to a single file |
| `updateExistingRecords` | boolean | true | Update existing records found in local files |
| `preserveFields` | string[] | [] | Fields that retain local values during updates (see detailed explanation below) |
| `mergeStrategy` | string | "merge" | How to merge updates: "merge", "overwrite", or "skip" |
| `backupBeforeUpdate` | boolean | false | Create timestamped backups before updating files |
| `backupDirectory` | string | ".backups" | Directory name for backup files (relative to entity directory) |
| `filter` | string | - | SQL WHERE clause for filtering records |
| `externalizeFields` | array/object | - | Fields to save as external files with optional patterns |
| `excludeFields` | string[] | [] | Fields to completely omit from pulled data (see detailed explanation below) |
| `lookupFields` | object | - | Foreign keys to convert to @lookup references |
| `relatedEntities` | object | - | Related entities to pull as embedded collections |

> **⚠️ Important Configuration Warning**
> 
> When both `appendRecordsToExistingFile: true` and `newFileName` are set, ALL new records will be appended to the single file specified by `newFileName`, effectively ignoring the standard per-record file pattern. This can lead to unexpected file organization:
> 
> ```json
> // This configuration will put ALL new records in .all-new.json
> "pull": {
>   "appendRecordsToExistingFile": true,
>   "newFileName": ".all-new.json"  // ⚠️ Overrides individual file creation
> }
> ```
> 
> **Recommended configurations:**
> - For individual files per record: Set `appendRecordsToExistingFile: false` (or omit it)
> - For grouped new records: Set both `appendRecordsToExistingFile: true` and `newFileName`
> - For mixed approach: Omit `newFileName` to let new records follow the standard pattern

#### Merge Strategies

- **`merge`** (default): Combines fields from database and local file, with database values taking precedence for existing fields
- **`overwrite`**: Completely replaces local record with database version (except preserved fields)
- **`skip`**: Leaves existing records unchanged, only adds new records

#### Understanding excludeFields vs preserveFields

These two configuration options serve different purposes for managing fields during pull operations:

##### excludeFields
- **Purpose**: Completely omit specified fields from your local files
- **Use Case**: Remove internal/system fields you don't want in version control
- **Effect**: Fields never appear in the JSON files
- **Example**: Excluding internal IDs, timestamps, or sensitive data

##### preserveFields  
- **Purpose**: Protect local customizations from being overwritten during updates
- **Use Case**: Keep locally modified values while updating other fields
- **Effect**: Fields exist in files but retain their local values during pull
- **Example**: Preserving custom file paths, local notes, or environment-specific values
- **Special Behavior for @file: references**: When a preserved field contains a `@file:` reference, the tool will update the content at the existing file path rather than creating a new file with a generated name

##### Example Configuration
```json
{
  "pull": {
    "excludeFields": ["TemplateID", "InternalNotes", "CreatedAt"],
    "preserveFields": ["TemplateText", "OutputExample", "LocalConfig"]
  }
}
```

With this configuration:
- **TemplateID, InternalNotes, CreatedAt** → Never appear in local files
- **TemplateText, OutputExample, LocalConfig** → Keep their local values during updates

##### Common Scenario: Customized File References
When you customize file paths (e.g., changing `@file:templates/skip-conductor.md` to `@file:templates/conductor.md`), use `preserveFields` to protect these customizations:

```json
{
  "pull": {
    "preserveFields": ["TemplateText", "OutputExample"],
    "externalizeFields": [
      {
        "field": "TemplateText",
        "pattern": "@file:templates/{Name}.template.md"
      }
    ]
  }
}
```

This ensures your custom paths aren't overwritten when pulling updates from the database.

**How it works:**
1. **Without preserveFields**: Pull would create a new file using the pattern (e.g., `templates/skip-conductor.template.md`) and update the JSON to point to it
2. **With preserveFields**: Pull keeps your custom path (e.g., `@file:templates/conductor.md`) in the JSON and updates the content at that existing location

This is particularly useful when:
- You've reorganized your file structure after initial pull
- You've renamed files to follow your own naming conventions
- You want to maintain consistent paths across team members

#### Backup Configuration

When `backupBeforeUpdate` is enabled, the tool creates timestamped backups before updating existing files:

- **Backup Location**: Files are backed up to the `backupDirectory` (default: `.backups`) within the entity directory
- **Backup Naming**: Original filename + timestamp + `.backup` extension (e.g., `.greeting.json` → `.greeting.2024-03-15T10-30-45-123Z.backup`)
- **Extension**: All backup files use the `.backup` extension, preventing them from being processed by push/pull/status commands
- **Deduplication**: Only one backup is created per file per pull operation, even if the file contains multiple records

Example configuration:
```json
"pull": {
  "backupBeforeUpdate": true,
  "backupDirectory": ".backups"  // Custom backup directory name
}
```

#### Externalize Fields Patterns

The `externalizeFields` configuration supports dynamic file naming with placeholders:

```json
"externalizeFields": [
  {
    "field": "TemplateText",
    "pattern": "@file:{Name}.template.md"
  },
  {
    "field": "SQLQuery", 
    "pattern": "@file:queries/{CategoryName}/{Name}.sql"
  }
]
```

Supported placeholders:
- `{Name}` - The entity's name field value
- `{ID}` - The entity's primary key
- `{FieldName}` - The field being externalized
- `{AnyFieldName}` - Any field from the entity record

All values are sanitized for filesystem compatibility (lowercase, spaces to hyphens, special characters removed).

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
1. `mj sync pull --entity="AI Prompts"` to get latest prompts with their models
2. Edit prompts and adjust model configurations in VS Code
3. Test locally with `mj sync push --dry-run`
4. Commit changes to Git
5. PR review with diff visualization
6. CI/CD runs `mj sync push --ci` on merge

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
    npm install -g @memberjunction/cli
    mj sync push --ci --entity="AI Prompts"
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

## Validation System

The MetadataSync tool includes a comprehensive validation system that checks your metadata files for correctness before pushing to the database. This helps catch errors early and ensures data integrity.

### Validation Features

#### Automatic Validation
By default, validation runs automatically before push and pull operations:
```bash
# These commands validate first, then proceed if valid
mj sync push
mj sync pull --entity="AI Prompts"
```

#### Manual Validation
Run validation without performing any sync operations:
```bash
# Validate current directory
mj sync validate

# Validate specific directory
mj sync validate --dir="./metadata"

# Verbose output shows all files checked
mj sync validate --verbose
```

#### CI/CD Integration
Get JSON output for automated pipelines:
```bash
# JSON output for parsing
mj sync validate --format=json

# In CI mode, validation failures cause immediate exit
mj sync push --ci
```

#### Validation During Push

**Important:** The `push` command automatically validates your metadata before pushing to the database:
- ❌ **Push stops on any validation errors** - You cannot push invalid metadata
- 🛑 **In CI mode** - Push fails immediately without prompts
- 💬 **In interactive mode** - You'll be asked if you want to continue despite errors
- ✅ **Clean validation** - Push proceeds automatically

#### Skip Validation
For emergency fixes or when you know validation will fail:
```bash
# Skip validation checks (USE WITH CAUTION!)
mj sync push --no-validate
mj sync pull --entity="AI Prompts" --no-validate
```

⚠️ **Warning:** Using `--no-validate` may push invalid metadata to your database, potentially breaking your application. Only use this flag when absolutely necessary.

### What Gets Validated

#### Entity Validation
- ✓ Entity names exist in database metadata
- ✓ Entity is accessible to current user
- ✓ Entity allows data modifications

#### Field Validation
- ✓ Field names exist on the entity
- ✓ Virtual properties (getter/setter methods) are automatically detected
- ✓ Fields are settable (not system fields)
- ✓ Field values match expected data types
- ✓ Required fields are checked intelligently:
  - Skips fields with default values
  - Skips computed/virtual fields (e.g., `Action` derived from `ActionID`)
  - Skips fields when related virtual property is used (e.g., `TemplateID` when `TemplateText` is provided)
  - Skips ReadOnly and AutoUpdateOnly fields
- ✓ Foreign key relationships are valid

#### Reference Validation
- ✓ `@file:` references point to existing files
- ✓ `@lookup:` references find matching records
- ✓ `@template:` references load valid JSON
- ✓ `@parent:` and `@root:` have proper context
- ✓ Circular references are detected

#### Best Practice Checks
- ⚠️ Deep nesting (>10 levels) generates warnings
- ⚠️ Missing required fields are flagged
- ⚠️ Large file sizes trigger performance warnings
- ⚠️ Naming convention violations

#### Dependency Order Validation
- ✓ Entities are processed in dependency order
- ✓ Parent entities exist before children
- ✓ Circular dependencies are detected
- ✓ Suggests corrected directory order

### Validation Output

#### Human-Readable Format (Default)
```
════════════════════════════════════════════════════════════
║                    Validation Report                     ║
════════════════════════════════════════════════════════════

┌────────────────────────────────────────────────┐
│ Files:          4                              │
│ Entities:       29                             │
│ Errors:         2                              │
│ Warnings:       5                              │
├────────────────────────────────────────────────┤
│ Errors by Type:                                │
│   field:        1                              │
│   reference:    1                              │
├────────────────────────────────────────────────┤
│ Warnings by Type:                              │
│   bestpractice: 3                              │
│   nesting:      2                              │
└────────────────────────────────────────────────┘

Errors

1. Field "Status" does not exist on entity "Templates"
   Entity: Templates
   Field: Status
   File: ./metadata/templates/.my-template.json
   → Suggestion: Check spelling of 'Status'. Run 'mj sync list-entities' to see available entities.

2. File not found: ./shared/footer.html
   Entity: Templates
   Field: FooterHTML
   File: ./metadata/templates/.my-template.json
   → Suggestion: Ensure file './shared/footer.html' exists and path is relative to the metadata directory.
```

#### JSON Format (CI/CD)
```json
{
  "isValid": false,
  "summary": {
    "totalFiles": 4,
    "totalEntities": 29,
    "totalErrors": 2,
    "totalWarnings": 5,
    "errorsByType": {
      "field": 1,
      "reference": 1
    },
    "warningsByType": {
      "bestpractice": 3,
      "nesting": 2
    }
  },
  "errors": [
    {
      "type": "field",
      "entity": "Templates",
      "field": "Status",
      "file": "./metadata/templates/.my-template.json",
      "message": "Field \"Status\" does not exist on entity \"Templates\"",
      "suggestion": "Check spelling of 'Status'. Run 'mj sync list-entities' to see available entities."
    }
  ],
  "warnings": [...]
}
```

### Virtual Properties Support

Some MemberJunction entities include virtual properties - getter/setter methods that aren't database fields but provide convenient access to related data. The validation system automatically detects these properties.

#### Example: TemplateText Virtual Property
The `Templates` entity includes a `TemplateText` virtual property that:
- Automatically manages `Template` and `TemplateContent` records
- Isn't a database field but appears as a property on the entity class
- Can be used in metadata files just like regular fields

```json
{
  "fields": {
    "Name": "My Template",
    "TemplateText": "@file:template.html"  // Virtual property - works!
  }
}
```

The validator checks both database metadata AND entity class properties, ensuring virtual properties are properly recognized.

### Intelligent Required Field Validation

The validator intelligently handles required fields to avoid false warnings:

#### Fields with Default Values
Required fields that have database defaults are not flagged:
```json
{
  "fields": {
    "Name": "My Entity"
    // CreatedAt is required but has default value - no warning
  }
}
```

#### Computed/Virtual Fields
Fields that are computed from other fields are skipped:
```json
{
  "fields": {
    "ActionID": "123-456-789"
    // Action field is computed from ActionID - no warning
  }
}
```

#### Virtual Property Relationships
When using virtual properties, related required fields are skipped:
```json
{
  "fields": {
    "Name": "My Prompt",
    "TemplateText": "@file:template.md"
    // TemplateID and Template are not required when TemplateText is used
  }
}
```

### Common Validation Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Field "X" does not exist` | Typo or wrong entity | Check entity definition in generated files |
| `Entity "X" not found` | Wrong entity name | Use exact entity name from database |
| `File not found` | Bad @file: reference | Check file path is relative and exists |
| `Lookup not found` | No matching record | Verify lookup value or use ?create |
| `Circular dependency` | A→B→A references | Restructure to avoid cycles |
| `Required field missing` | Missing required field | Add field with appropriate value |

### Validation Configuration

Control validation behavior in your workflow:

```json
{
  "push": {
    "validateBeforePush": true  // Default: true
  },
  "pull": {
    "validateBeforePull": false  // Default: false
  }
}
```

### Best Practices

1. **Run validation during development**: `mj sync validate` frequently
2. **Fix errors before warnings**: Errors block operations, warnings don't
3. **Use verbose mode** to understand issues: `mj sync validate -v`
4. **Include in CI/CD**: Parse JSON output for automated checks
5. **Don't skip validation** unless absolutely necessary

## Troubleshooting

### Validation Errors

If validation fails:

1. **Read the error message carefully** - It includes specific details
2. **Check the suggestion** - Most errors include how to fix them
3. **Use verbose mode** for more context: `mj sync validate -v`
4. **Verify entity definitions** in generated entity files
5. **Check file paths** are relative to the metadata directory

### Performance Issues

For large metadata sets:

1. **Disable best practice checks**: `mj sync validate --no-best-practices`
2. **Validate specific directories**: `mj sync validate --dir="./prompts"`
3. **Reduce nesting depth warning**: `mj sync validate --max-depth=20`

## Programmatic Usage

### Using ValidationService in Your Code

The MetadataSync validation can be used programmatically in any Node.js project:

```typescript
import { ValidationService, FormattingService } from '@memberjunction/metadata-sync';
import { ValidationOptions } from '@memberjunction/metadata-sync/dist/types/validation';

// Initialize validation options
const options: ValidationOptions = {
    verbose: false,
    outputFormat: 'human',
    maxNestingDepth: 10,
    checkBestPractices: true
};

// Create validator instance
const validator = new ValidationService(options);

// Validate a directory
const result = await validator.validateDirectory('/path/to/metadata');

// Check results
if (result.isValid) {
    console.log('Validation passed!');
} else {
    console.log(`Found ${result.errors.length} errors`);
    
    // Format results for display
    const formatter = new FormattingService();
    
    // Get human-readable output
    const humanOutput = formatter.formatValidationResult(result, true);
    console.log(humanOutput);
    
    // Get JSON output
    const jsonOutput = formatter.formatValidationResultAsJson(result);
    
    // Get beautiful markdown report
    const markdownReport = formatter.formatValidationResultAsMarkdown(result);
}
```

### ValidationResult Structure

The validation service returns a structured object with complete details:

```typescript
interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    summary: {
        totalFiles: number;
        totalEntities: number;
        totalErrors: number;
        totalWarnings: number;
        fileResults: Map<string, FileValidationResult>;
    };
}

interface ValidationError {
    type: 'entity' | 'field' | 'reference' | 'circular' | 'dependency' | 'nesting' | 'bestpractice';
    severity: 'error' | 'warning';
    entity?: string;
    field?: string;
    file: string;
    message: string;
    suggestion?: string;
    details?: any;
}
```

### Integration Example

```typescript
import { ValidationService } from '@memberjunction/metadata-sync';

export async function validateBeforeDeploy(metadataPath: string): Promise<boolean> {
    const validator = new ValidationService({
        checkBestPractices: true,
        maxNestingDepth: 10
    });
    
    const result = await validator.validateDirectory(metadataPath);
    
    if (!result.isValid) {
        // Log errors to your monitoring system
        result.errors.forEach(error => {
            logger.error('Metadata validation error', {
                type: error.type,
                entity: error.entity,
                field: error.field,
                file: error.file,
                message: error.message
            });
        });
        
        // Optionally save report
        const report = new FormattingService().formatValidationResultAsMarkdown(result);
        await fs.writeFile('validation-report.md', report);
        
        return false;
    }
    
    return true;
}
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Validate Metadata
  run: |
    npm install @memberjunction/cli
    npx mj sync validate --dir=./metadata --format=json > validation-results.json
    
- name: Check Validation Results
  run: |
    if [ $(jq '.isValid' validation-results.json) = "false" ]; then
      echo "Metadata validation failed!"
      jq '.errors' validation-results.json
      exit 1
    fi
```

## Future Enhancements

- Plugin system for custom entity handlers
- Merge conflict resolution UI
- Bulk operations across entities
- Extended validation rules
- Schema migration support
- Team collaboration features
- Bidirectional sync for related entities
- Custom transformation pipelines
