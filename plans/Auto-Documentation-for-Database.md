# Database Documentation Generator - Implementation Plan

## Summary

An AI-powered database documentation system that automatically generates comprehensive table and column descriptions by analyzing database structure, constraints, relationships, and sample data. The system produces both human-readable documentation and executable SQL scripts that inject descriptions into the database via `sp_addextendedproperty`, which then flow into MemberJunction metadata through CodeGen.

**Created**: 2025-01-21
**Status**: ⏳ Pending Review & Approval
**Package**: `@memberjunction/db-documenter`

---

## Problem Statement

### Current State
- Users bring external data into MJ (read-only replicas, custom tables, SaaS integrations)
- Most databases lack comprehensive documentation
- Empty or minimal descriptions in MJ Entity/EntityField metadata
- Agents and humans struggle to understand schema purpose and relationships
- Manual documentation is time-consuming and often skipped

### Desired State
- Automated analysis of database structure and relationships
- AI-generated descriptions for all tables and columns
- Documentation injected into database via extended properties
- Metadata automatically synced to MJ entities through CodeGen
- Both human-readable docs and machine-readable metadata

### Value Proposition
- **For AI Agents**: Rich schema context improves query generation and data understanding
- **For Developers**: Instant onboarding to unfamiliar databases
- **For Documentation**: Always up-to-date, automatically maintained
- **For MJ Platform**: Enhanced metadata drives better UI generation and validation

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                  DatabaseDocumenter                         │
│                   (Core Engine)                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1: Structural Analysis                              │
│  ├─ Build dependency graph (PK/FK relationships)           │
│  ├─ Identify root tables (no dependencies)                 │
│  ├─ Extract constraints (CHECK, UNIQUE, DEFAULT)           │
│  ├─ Detect patterns (audit fields, soft delete, etc.)      │
│  └─ Load existing MJ metadata (Entity/EntityField)         │
│                                                             │
│  Phase 2: Data Profiling                                   │
│  ├─ Top N rows per table                                   │
│  ├─ Random sampling (multiple passes)                      │
│  ├─ Statistical analysis (nulls, distinct values, etc.)    │
│  ├─ Pattern detection (enums, common values, etc.)         │
│  └─ Data type inference (email, phone, URL, etc.)          │
│                                                             │
│  Phase 3: Table-Level Documentation (Micro Analysis)       │
│  ├─ Process tables in dependency order (roots first)       │
│  ├─ Include parent table context in prompts                │
│  ├─ Generate table + column descriptions via AI            │
│  ├─ Assign confidence scores                               │
│  └─ Store in-memory documentation state                    │
│                                                             │
│  Phase 4: Schema-Level Review (Macro Analysis)             │
│  ├─ Group tables by schema/business domain                 │
│  ├─ Review all descriptions in context                     │
│  ├─ Identify inconsistencies or improvements               │
│  └─ Refine documentation based on holistic view            │
│                                                             │
│  Phase 5: Output Generation                                │
│  ├─ Generate Markdown documentation                        │
│  ├─ Generate sp_addextendedproperty SQL scripts            │
│  ├─ Generate summary report                                │
│  └─ Optionally execute SQL (with safeguards)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │                              │
         ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│   CLI Interface  │          │   Output Files   │
│   mj-document    │          ├──────────────────┤
├──────────────────┤          │ • documentation/ │
│ • analyze        │          │   ├─ README.md   │
│ • configure      │          │   ├─ schema1.md  │
│ • help           │          │   └─ schema2.md  │
└──────────────────┘          │ • scripts/       │
                              │   └─ extended-   │
                              │     properties.  │
                              │     sql          │
                              └──────────────────┘
```

### Design Principles

1. **Stateless Execution** (MVP)
   - No database tables for tracking runs (future enhancement)
   - In-memory state during execution only
   - All outputs persisted to files
   - Idempotent operations (can re-run safely)

2. **Dependency-Aware Processing**
   - Build full dependency graph via FK analysis
   - Document root tables first (no dependencies)
   - Each level inherits context from parent tables
   - Ensures accurate relationship descriptions

3. **Two-Phase AI Analysis**
   - **Micro**: Table-by-table with parent context
   - **Macro**: Schema-level holistic review
   - Catches inconsistencies missed in micro phase
   - Provides cross-table insights

4. **Non-Destructive Outputs**
   - Never auto-execute SQL without explicit flag
   - Always generate review-able scripts first
   - Respect existing extended properties (configurable)
   - Provide confidence scores for all descriptions

5. **MJ Integration**
   - Read existing Entity/EntityField metadata
   - Include MJ context in AI prompts
   - Output compatible with CodeGen expectations
   - Extended properties flow into MJ metadata

---

## Data Structures

### Configuration
```typescript
interface DocumenterConfig {
  // Scope
  schemas?: string[];           // Specific schemas (default: all non-system)
  tables?: string[];            // Specific tables as 'schema.table'
  excludeSchemas?: string[];    // Schemas to skip (e.g., 'sys', 'INFORMATION_SCHEMA')
  excludeTables?: string[];     // Tables to skip as 'schema.table'

  // Sampling Strategy
  topN?: number;                // Top N rows ordered by PK (default: 100)
  randomSamplePasses?: number;  // Number of random sample passes (default: 2)
  randomSampleSize?: number;    // Rows per random sample (default: 50)
  maxSampleRows?: number;       // Max total sample rows per table (default: 200)

  // AI Configuration
  aiProvider?: string;          // Provider name (default: from config)
  modelName?: string;           // Model name (default: from config)
  maxTablesPerPrompt?: number;  // Tables in macro review prompt (default: 10)
  temperature?: number;         // LLM temperature (default: 0.3)

  // Output Options
  outputPath?: string;          // Base output directory (default: './db-docs')
  generateMarkdown?: boolean;   // Create markdown docs (default: true)
  generateSQL?: boolean;        // Create SQL scripts (default: true)
  executeSQL?: boolean;         // Auto-execute SQL (default: false, requires confirmation)

  // Behavioral Options
  overwriteExisting?: boolean;  // Overwrite existing extended properties (default: false)
  onlyIfEmpty?: boolean;        // Only add if no existing description (default: true)
  confidenceThreshold?: number; // Min confidence to include (0-1, default: 0.6)
  includeSystemColumns?: boolean; // Document __mj columns (default: false)
}
```

### Dependency Graph
```typescript
interface TableNode {
  schema: string;
  table: string;
  fullName: string;              // 'schema.table'

  // Relationships
  dependsOn: TableReference[];    // Foreign keys pointing to other tables
  referencedBy: TableReference[]; // Tables that reference this table
  dependencyLevel: number;        // Distance from root (0 = no dependencies)

  // Pattern Detection
  tableType: TableType;           // Lookup, Transactional, Bridge, Audit, Config
  isLookup: boolean;              // ID + Name + few columns
  isBridge: boolean;              // Composite PK of all FKs
  isAudit: boolean;               // _Audit, _History suffix or audit columns
  hasAuditFields: boolean;        // CreatedAt, CreatedBy, ModifiedAt, ModifiedBy
  hasSoftDelete: boolean;         // IsDeleted, DeletedAt, __mj_DeletedAt
  hasRowVersion: boolean;         // timestamp/rowversion column

  // MJ Metadata
  mjEntity?: EntityInfo;          // Existing MJ entity (if any)
  hasExistingDescription: boolean;
}

interface TableReference {
  schema: string;
  table: string;
  constraintName: string;
  columns: ColumnMapping[];       // FK column → PK column mappings
}

type TableType =
  | 'Lookup'          // Reference data (countries, statuses, categories)
  | 'Transactional'   // Business events (orders, invoices, logs)
  | 'Bridge'          // M:M junction tables
  | 'Audit'           // Change tracking tables
  | 'Configuration'   // System settings
  | 'Unknown';
```

### Structural Analysis
```typescript
interface TableStructure {
  // Identity
  schema: string;
  table: string;
  fullName: string;

  // Existing Metadata
  mjEntity?: EntityInfo;
  existingDescription?: string;
  existingExtendedProperty?: string;

  // Statistics
  rowCount: number;
  approximateSizeKB: number;
  indexCount: number;

  // Keys & Constraints
  primaryKey?: PrimaryKeyInfo;
  foreignKeys: ForeignKeyInfo[];
  uniqueConstraints: UniqueConstraintInfo[];
  checkConstraints: CheckConstraintInfo[];
  defaultConstraints: DefaultConstraintInfo[];
  indexes: IndexInfo[];

  // Columns
  columns: ColumnStructure[];

  // Patterns
  node: TableNode;                // From dependency graph
}

interface ColumnStructure {
  name: string;
  dataType: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isIdentity: boolean;
  isComputed: boolean;
  computedFormula?: string;
  defaultValue?: string;

  // Existing Metadata
  mjField?: EntityFieldInfo;
  existingDescription?: string;
  existingExtendedProperty?: string;

  // Foreign Key Info
  referencedTable?: string;       // 'schema.table'
  referencedColumn?: string;
  foreignKeyName?: string;

  // Constraints
  checkConstraints: string[];     // CHECK constraint expressions
  uniqueConstraintName?: string;
}

interface ColumnProfile {
  column: ColumnStructure;

  // Statistics
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  distinctPercentage: number;

  // Value Analysis
  minValue?: any;
  maxValue?: any;
  avgValue?: number;              // For numeric columns
  minLength?: number;             // For string columns
  maxLength?: number;
  avgLength?: number;

  // Common Values
  topValues: ValueFrequency[];    // Top 10 most common values

  // Pattern Detection
  isLikelyEnum: boolean;          // Low cardinality (< 50 distinct)
  isLikelyBoolean: boolean;       // Only 0/1 or true/false
  likelyDataType?: InferredType;  // email, phone, url, date, currency, etc.
  regexPatterns?: string[];       // Detected patterns in values

  // Sample Data (anonymized)
  sampleValues: any[];            // Up to 10 example values
}

type InferredType =
  | 'email' | 'phone' | 'url' | 'ip_address'
  | 'currency' | 'percentage' | 'quantity'
  | 'date' | 'datetime' | 'time'
  | 'guid' | 'hash' | 'base64'
  | 'json' | 'xml'
  | 'zip_code' | 'country_code' | 'state_code'
  | 'ssn' | 'credit_card'        // Detect but don't sample!
  | 'unknown';

interface ValueFrequency {
  value: any;
  count: number;
  percentage: number;
}
```

### Documentation Output
```typescript
interface TableDocumentation {
  table: TableStructure;

  // Generated Descriptions
  tableDescription: string;
  tablePurpose: string;           // High-level purpose
  tableUsageNotes?: string;       // How to use this table
  businessDomain?: string;        // CRM, Finance, HR, etc.

  columnDescriptions: Map<string, ColumnDocumentation>;

  // Relationship Explanations
  parentRelationships: RelationshipDescription[];   // Tables this depends on
  childRelationships: RelationshipDescription[];    // Tables that depend on this

  // Confidence & Quality
  tableConfidence: number;        // 0-1 confidence score
  columnConfidenceAvg: number;    // Average column confidence

  // Generation Metadata
  generatedAt: Date;
  aiModel: string;
  processingPhase: 'micro' | 'macro';
  refinedInMacro: boolean;        // True if changed during macro phase
}

interface ColumnDocumentation {
  column: ColumnStructure;
  profile: ColumnProfile;

  description: string;
  purpose?: string;               // Why this column exists
  validValues?: string;           // Allowed values/ranges
  usageNotes?: string;            // How to use this column

  confidence: number;             // 0-1 confidence score
}

interface RelationshipDescription {
  fromTable: string;
  toTable: string;
  constraintName: string;
  description: string;            // Natural language explanation
  cardinality: string;            // "One-to-Many", "Many-to-Many", etc.
  isRequired: boolean;            // FK column is NOT NULL
}
```

### Processing State
```typescript
interface DocumentationState {
  // Configuration
  config: DocumenterConfig;

  // Progress Tracking
  phase: 'analyzing' | 'profiling' | 'documenting' | 'reviewing' | 'generating';
  currentSchema?: string;
  currentTable?: string;
  tablesProcessed: number;
  tablesTotal: number;
  startTime: Date;

  // Analysis Results
  dependencyGraph: Map<string, TableNode>;
  tableStructures: Map<string, TableStructure>;
  tableProfiles: Map<string, ColumnProfile[]>;

  // Documentation Results
  tableDocs: Map<string, TableDocumentation>;

  // Statistics
  stats: {
    schemasAnalyzed: number;
    tablesAnalyzed: number;
    columnsAnalyzed: number;
    descriptionsGenerated: number;
    existingDescriptionsFound: number;
    lowConfidenceItems: number;
    aiTokensUsed: number;
    aiCostEstimate: number;
  };

  // Errors & Warnings
  errors: ProcessingError[];
  warnings: ProcessingWarning[];
}
```

---

## Implementation Tasks

### Phase 1: Package Setup & Core Infrastructure
**Estimated Time**: 4-6 hours

#### Task 1.1: Create Package Structure
- [ ] Create `packages/DocUtils/` directory structure
- [ ] Set up `package.json` with dependencies:
  - `@memberjunction/core`
  - `@memberjunction/global`
  - `@memberjunction/ai`
  - `mssql` (already used in MJ)
  - `commander` (for CLI)
  - `zod` (for validation)
- [ ] Create `tsconfig.json` extending base config
- [ ] Add package to workspace `package.json`
- [ ] Add package to `turbo.json` build pipeline

#### Task 1.2: Define Core Interfaces
- [ ] Create `src/types/config.ts` - DocumenterConfig interface
- [ ] Create `src/types/graph.ts` - TableNode, TableReference, etc.
- [ ] Create `src/types/structure.ts` - TableStructure, ColumnStructure, etc.
- [ ] Create `src/types/profile.ts` - ColumnProfile, ValueFrequency, etc.
- [ ] Create `src/types/documentation.ts` - TableDocumentation, etc.
- [ ] Create `src/types/state.ts` - DocumentationState, errors, warnings

#### Task 1.3: Create Engine Class Skeleton
- [ ] Create `src/Engine.ts` with `DatabaseDocumenter` class
- [ ] Implement constructor with config validation (Zod schema)
- [ ] Create main orchestration method `documentDatabase()`
- [ ] Add progress tracking and logging
- [ ] Implement state management (in-memory)
- [ ] Add error handling and recovery

---

### Phase 2: Structural Analysis
**Estimated Time**: 8-10 hours

#### Task 2.1: Database Connection & Introspection
- [ ] Create `src/database/connection.ts`
  - [ ] Establish SQL Server connection using MJ config
  - [ ] Handle connection pooling
  - [ ] Add retry logic for transient failures
- [ ] Create `src/database/introspection.ts`
  - [ ] Query `INFORMATION_SCHEMA` for tables/columns
  - [ ] Query `sys.tables`, `sys.columns` for detailed metadata
  - [ ] Extract data types, lengths, nullability, defaults
  - [ ] Handle user-defined types

#### Task 2.2: Constraint Analysis
- [ ] Create `src/analyzers/constraints.ts`
- [ ] Extract Primary Keys (`sys.key_constraints`, `sys.index_columns`)
- [ ] Extract Foreign Keys (`sys.foreign_keys`, `sys.foreign_key_columns`)
- [ ] Extract Unique Constraints (`sys.indexes` where `is_unique = 1`)
- [ ] Extract Check Constraints (`sys.check_constraints`)
- [ ] Extract Default Constraints (`sys.default_constraints`)
- [ ] Parse constraint definitions for insights

#### Task 2.3: Index Analysis
- [ ] Create `src/analyzers/indexes.ts`
- [ ] Extract all indexes (`sys.indexes`, `sys.index_columns`)
- [ ] Identify clustered vs non-clustered
- [ ] Identify unique vs non-unique
- [ ] Extract included columns
- [ ] Identify filtered indexes

#### Task 2.4: Dependency Graph Builder
- [ ] Create `src/analyzers/dependency-graph.ts`
- [ ] Build directed graph from FK relationships
- [ ] Implement topological sort to determine levels
- [ ] Identify root tables (level 0)
- [ ] Detect circular dependencies (log warnings)
- [ ] Calculate dependency depth for each table

#### Task 2.5: Pattern Detection
- [ ] Create `src/analyzers/pattern-detector.ts`
- [ ] Detect lookup tables (ID + Name pattern, few columns, no FKs)
- [ ] Detect bridge tables (composite PK of all FKs)
- [ ] Detect audit tables (naming suffixes, audit columns)
- [ ] Detect soft delete pattern (`IsDeleted`, `__mj_DeletedAt`)
- [ ] Detect audit fields (`CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy`)
- [ ] Detect row version fields (`timestamp`, `rowversion`)
- [ ] Classify table types (Lookup, Transactional, Bridge, etc.)

#### Task 2.6: MJ Metadata Integration
- [ ] Create `src/analyzers/mj-metadata.ts`
- [ ] Load Entity metadata from `__mj.Entity` (match by schema.table)
- [ ] Load EntityField metadata from `__mj.EntityField`
- [ ] Extract existing descriptions
- [ ] Query extended properties (`sys.extended_properties`)
- [ ] Merge MJ and SQL Server metadata
- [ ] Flag tables/columns already documented

---

### Phase 3: Data Profiling
**Estimated Time**: 8-10 hours

#### Task 3.1: Sampling Strategy
- [ ] Create `src/profilers/sampler.ts`
- [ ] Implement top N sampling (ORDER BY primary key)
- [ ] Implement random sampling (TABLESAMPLE or ORDER BY NEWID())
- [ ] Handle tables without primary keys (use OFFSET/FETCH)
- [ ] Respect `maxSampleRows` configuration
- [ ] Skip very large BLOBs (log warning)

#### Task 3.2: Statistical Analysis
- [ ] Create `src/profilers/statistics.ts`
- [ ] Calculate null counts and percentages
- [ ] Calculate distinct value counts
- [ ] Calculate min/max/avg for numeric columns
- [ ] Calculate min/max/avg length for string columns
- [ ] Generate value frequency distribution (top 10 values)
- [ ] Handle NULL values correctly in statistics

#### Task 3.3: Pattern Recognition
- [ ] Create `src/profilers/pattern-recognizer.ts`
- [ ] Detect enum-like columns (low cardinality < 50)
- [ ] Detect boolean columns (only 0/1 or true/false)
- [ ] Detect email addresses (regex pattern)
- [ ] Detect phone numbers (regex pattern)
- [ ] Detect URLs (regex pattern)
- [ ] Detect GUIDs (regex pattern)
- [ ] Detect dates/times (parse success rate)
- [ ] Detect JSON/XML content
- [ ] Detect sensitive data (SSN, credit card) - log warning, DO NOT SAMPLE

#### Task 3.4: Column Profiler
- [ ] Create `src/profilers/column-profiler.ts`
- [ ] Orchestrate sampling + statistics + pattern recognition
- [ ] Generate `ColumnProfile` for each column
- [ ] Handle errors gracefully (continue on failure)
- [ ] Add timeout protection for slow queries
- [ ] Log profiling progress

#### Task 3.5: Sensitive Data Protection
- [ ] Create `src/profilers/privacy.ts`
- [ ] Never send actual PII/PHI to AI models
- [ ] Replace sensitive values with patterns (e.g., "XXX-XX-1234")
- [ ] Anonymize sample data before AI processing
- [ ] Log when sensitive data detected

---

### Phase 4: AI-Powered Documentation (Micro Analysis)
**Estimated Time**: 12-15 hours

#### Task 4.1: Prompt Engineering - Table Level
- [ ] Create `src/ai/prompts/table-prompt-builder.ts`
- [ ] Design prompt structure:
  - [ ] Table name and schema
  - [ ] Column list with types, constraints, FK references
  - [ ] Existing MJ descriptions (if any)
  - [ ] Existing extended properties (if any)
  - [ ] Primary key and unique constraints
  - [ ] Check constraints
  - [ ] Table type classification (lookup, transactional, etc.)
  - [ ] Pattern detection results (audit fields, soft delete, etc.)
- [ ] Include parent table context (already documented tables this depends on)
- [ ] Include sample data (anonymized)
- [ ] Request structured JSON output:
  ```json
  {
    "tableDescription": "...",
    "tablePurpose": "...",
    "tableUsageNotes": "...",
    "businessDomain": "...",
    "confidence": 0.85,
    "columns": [
      {
        "name": "...",
        "description": "...",
        "purpose": "...",
        "validValues": "...",
        "usageNotes": "...",
        "confidence": 0.9
      }
    ],
    "relationships": [
      {
        "type": "parent",
        "table": "...",
        "description": "...",
        "cardinality": "..."
      }
    ]
  }
  ```

#### Task 4.2: Prompt Engineering - Relationship Context
- [ ] Create `src/ai/prompts/relationship-context-builder.ts`
- [ ] For each FK, generate natural language explanation:
  - "This table references {ParentTable} via {ColumnName}"
  - Include parent table's purpose (if already documented)
  - Explain cardinality (one-to-many, many-to-many)
  - Note if FK is required (NOT NULL) or optional
- [ ] Build hierarchical context (grandparent tables if available)

#### Task 4.3: AI Integration
- [ ] Create `src/ai/ai-client.ts`
- [ ] Use `@memberjunction/ai` package for LLM calls
- [ ] Support multiple providers (OpenAI, Anthropic, etc.)
- [ ] Implement retry logic with exponential backoff
- [ ] Track token usage and costs
- [ ] Implement rate limiting to avoid API throttling
- [ ] Handle structured output (JSON mode if available)

#### Task 4.4: Table Documentation Processor
- [ ] Create `src/processors/table-documenter.ts`
- [ ] Process tables in dependency order (level 0 first)
- [ ] For each table:
  - [ ] Build prompt with all available context
  - [ ] Call AI with structured output request
  - [ ] Parse and validate response (Zod schema)
  - [ ] Store documentation in state
  - [ ] Update progress tracking
  - [ ] Handle AI errors (retry or log failure)
- [ ] Batch tables at same level if `maxTablesPerPrompt > 1`

#### Task 4.5: Confidence Scoring
- [ ] Create `src/processors/confidence-scorer.ts`
- [ ] Use AI-provided confidence scores
- [ ] Adjust confidence based on:
  - Availability of sample data (higher confidence)
  - Existence of FK relationships (higher confidence)
  - Presence of constraints (higher confidence)
  - Existing MJ/extended property descriptions (boost confidence)
  - Generic table/column names (lower confidence)
- [ ] Flag low-confidence items for review

---

### Phase 5: AI-Powered Review (Macro Analysis)
**Estimated Time**: 6-8 hours

#### Task 5.1: Schema-Level Prompt Engineering
- [ ] Create `src/ai/prompts/schema-review-prompt-builder.ts`
- [ ] Design macro review prompt:
  - [ ] List all tables in schema with generated descriptions
  - [ ] Show table relationships (dependency graph)
  - [ ] Highlight table types (lookup, transactional, etc.)
  - [ ] Request review for:
    - Inconsistent terminology
    - Missing relationships
    - Incorrect business domain classification
    - Better descriptions based on holistic view
- [ ] Request structured JSON output with refinements:
  ```json
  {
    "overallAssessment": "...",
    "businessDomain": "...",
    "refinements": [
      {
        "table": "...",
        "field": "tableDescription" | "columnName",
        "currentValue": "...",
        "suggestedValue": "...",
        "reason": "...",
        "confidence": 0.8
      }
    ]
  }
  ```

#### Task 5.2: Schema Grouping Strategy
- [ ] Create `src/processors/schema-grouper.ts`
- [ ] Group tables by schema
- [ ] Optionally sub-group by business domain (if detected in micro phase)
- [ ] Respect `maxTablesPerPrompt` when batching
- [ ] Handle large schemas (split into multiple macro reviews)

#### Task 5.3: Refinement Processor
- [ ] Create `src/processors/refinement-processor.ts`
- [ ] For each schema/group:
  - [ ] Build macro review prompt
  - [ ] Call AI with all table documentation
  - [ ] Parse refinement suggestions
  - [ ] Apply high-confidence refinements automatically
  - [ ] Log medium-confidence refinements as warnings
  - [ ] Track which descriptions were refined
- [ ] Update confidence scores based on macro review

---

### Phase 6: Output Generation
**Estimated Time**: 8-10 hours

#### Task 6.1: Markdown Documentation Generator
- [ ] Create `src/generators/markdown-generator.ts`
- [ ] Generate overall README.md:
  - [ ] Database overview
  - [ ] Schema list with descriptions
  - [ ] Table counts and statistics
  - [ ] Business domains identified
  - [ ] Generation metadata (date, model, token usage)
- [ ] Generate per-schema markdown files:
  - [ ] Schema description
  - [ ] Table of contents
  - [ ] Table dependency diagram (Mermaid ERD)
  - [ ] Table-by-table detailed documentation:
    - Table description and purpose
    - Column list with descriptions
    - Primary key, foreign keys, indexes
    - Relationships (parent and child tables)
    - Sample queries (if applicable)
  - [ ] Cross-reference links between related tables
- [ ] Use proper markdown formatting (headers, tables, code blocks)
- [ ] Include confidence scores in metadata section

#### Task 6.2: SQL Script Generator
- [ ] Create `src/generators/sql-generator.ts`
- [ ] Generate `sp_addextendedproperty` calls for tables:
  ```sql
  EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Table description here',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'TableName';
  ```
- [ ] Generate `sp_addextendedproperty` calls for columns:
  ```sql
  EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Column description here',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'TableName',
    @level2type = N'COLUMN', @level2name = N'ColumnName';
  ```
- [ ] Respect `overwriteExisting` and `onlyIfEmpty` flags:
  - If `onlyIfEmpty`: Wrap in `IF NOT EXISTS` check
  - If `overwriteExisting`: Use `sp_updateextendedproperty` for existing
- [ ] Respect `confidenceThreshold` - only include high-confidence items
- [ ] Add comments with confidence scores and generation metadata
- [ ] Add transaction wrapper (BEGIN TRAN / COMMIT / ROLLBACK)
- [ ] Add rollback script (drop extended properties)

#### Task 6.3: Summary Report Generator
- [ ] Create `src/generators/summary-generator.ts`
- [ ] Generate summary report with:
  - [ ] Execution time
  - [ ] Schemas analyzed
  - [ ] Tables processed
  - [ ] Columns documented
  - [ ] Descriptions generated vs existing
  - [ ] Low confidence items (require review)
  - [ ] Errors and warnings
  - [ ] AI token usage and estimated cost
  - [ ] Next steps (review, execute SQL, etc.)
- [ ] Output as both console log and text file

#### Task 6.4: File Output Manager
- [ ] Create `src/generators/file-manager.ts`
- [ ] Create output directory structure:
  ```
  {outputPath}/
  ├─ README.md
  ├─ summary.txt
  ├─ documentation/
  │  ├─ schema1.md
  │  ├─ schema2.md
  │  └─ ...
  └─ scripts/
     ├─ extended-properties.sql
     └─ rollback.sql
  ```
- [ ] Handle file write errors gracefully
- [ ] Overwrite existing files with user confirmation
- [ ] Log file paths after generation

---

### Phase 7: CLI Implementation
**Estimated Time**: 6-8 hours

#### Task 7.1: Create Standalone CLI
- [ ] Create `src/cli.ts`
- [ ] Use `commander` for CLI parsing
- [ ] Implement `analyze` command:
  ```bash
  mj-document analyze [options]
    --schemas <schemas>       Comma-separated schema names
    --tables <tables>         Comma-separated table names (schema.table)
    --exclude <schemas>       Exclude these schemas
    --output <path>           Output directory (default: ./db-docs)
    --execute                 Execute SQL (apply extended properties)
    --overwrite               Overwrite existing descriptions
    --only-if-empty          Only add if no existing description
    --confidence <n>          Min confidence threshold (0-1)
    --provider <name>         AI provider (default: from config)
    --model <name>            AI model name
    --top-n <n>               Top N rows to sample (default: 100)
    --random-samples <n>      Random sample passes (default: 2)
  ```
- [ ] Add `--dry-run` flag to show what would be processed
- [ ] Add `--verbose` flag for detailed logging
- [ ] Add `--help` with examples

#### Task 7.2: Configuration File Support
- [ ] Support `.mjdocrc` or `mjdoc.config.json` file
- [ ] Allow overriding config with CLI flags
- [ ] Validate configuration with Zod schema
- [ ] Support environment variable overrides

#### Task 7.3: Interactive Mode
- [ ] Prompt for confirmation before executing SQL
- [ ] Show summary and ask "Proceed? (y/n)"
- [ ] Allow reviewing low-confidence items
- [ ] Support cancellation (SIGINT handler)

#### Task 7.4: Progress Reporting
- [ ] Create `src/cli/progress-reporter.ts`
- [ ] Show progress bar for table processing
- [ ] Display current phase and table being processed
- [ ] Show real-time statistics (tables processed, tokens used)
- [ ] Use colored output for better UX (chalk or similar)

#### Task 7.5: Integration with Main MJ CLI
- [ ] Update `packages/MJCLI/src/index.ts`
- [ ] Add `document` command that delegates to DocUtils CLI:
  ```typescript
  program
    .command('document', 'Generate database documentation', {
      executableFile: '../DocUtils/dist/cli.js'
    });
  ```
- [ ] Test integration: `npx mj document analyze --help`

---

### Phase 8: Testing & Validation
**Estimated Time**: 8-10 hours

#### Task 8.1: Unit Tests
- [ ] Create `tests/` directory
- [ ] Test dependency graph builder with mock data
- [ ] Test pattern detector with known table structures
- [ ] Test sampler with different table sizes
- [ ] Test statistical analyzers with sample data
- [ ] Test prompt builders (verify output structure)
- [ ] Test confidence scoring logic
- [ ] Test SQL generator output correctness

#### Task 8.2: Integration Tests
- [ ] Create test database with sample schemas:
  - [ ] Lookup tables (Countries, Statuses)
  - [ ] Transactional tables (Orders, Invoices)
  - [ ] Bridge tables (OrderItems)
  - [ ] Audit tables (Orders_Audit)
  - [ ] Tables with complex FKs and constraints
- [ ] Run full documentation process
- [ ] Validate markdown output format
- [ ] Validate SQL script syntax
- [ ] Verify extended properties are applied correctly

#### Task 8.3: AI Prompt Validation
- [ ] Test prompts with different AI providers
- [ ] Verify structured JSON output parsing
- [ ] Test error handling for malformed AI responses
- [ ] Validate confidence scores are reasonable
- [ ] Test macro review refinements

#### Task 8.4: Edge Case Testing
- [ ] Tables with no primary key
- [ ] Tables with no foreign keys
- [ ] Tables with circular FK references
- [ ] Very large tables (test sampling strategy)
- [ ] Tables with complex check constraints
- [ ] Tables with user-defined types
- [ ] Empty tables (no data to profile)
- [ ] Tables with existing extended properties

#### Task 8.5: Performance Testing
- [ ] Test with small database (10 tables)
- [ ] Test with medium database (100 tables)
- [ ] Test with large database (500+ tables)
- [ ] Measure execution time and token usage
- [ ] Optimize slow queries
- [ ] Add caching where beneficial

---

### Phase 9: Documentation & Examples
**Estimated Time**: 4-6 hours

#### Task 9.1: Package README
- [ ] Create `packages/DocUtils/README.md`
- [ ] Document purpose and features
- [ ] Add installation instructions
- [ ] Provide usage examples (CLI and programmatic)
- [ ] Document configuration options
- [ ] Add troubleshooting section

#### Task 9.2: API Documentation
- [ ] Document `DatabaseDocumenter` class API
- [ ] Document configuration interfaces
- [ ] Add JSDoc comments to all public methods
- [ ] Provide code examples for programmatic usage

#### Task 9.3: Examples Directory
- [ ] Create `packages/DocUtils/examples/`
- [ ] Add example configuration files
- [ ] Add example output (markdown and SQL)
- [ ] Add example scripts for common scenarios

#### Task 9.4: CLAUDE.md
- [ ] Create `packages/DocUtils/CLAUDE.md`
- [ ] Document package architecture
- [ ] Explain design decisions
- [ ] Add AI prompt templates
- [ ] Document future enhancement ideas

---

### Phase 10: Deployment & CI
**Estimated Time**: 2-3 hours

#### Task 10.1: Build Configuration
- [ ] Ensure package builds correctly in Turbo pipeline
- [ ] Add CLI shebang to `src/cli.ts`
- [ ] Configure `bin` field in package.json:
  ```json
  {
    "bin": {
      "mj-document": "./dist/cli.js"
    }
  }
  ```
- [ ] Make CLI executable after build

#### Task 10.2: NPM Publishing
- [ ] Add package to `@memberjunction` scope
- [ ] Configure version and dependencies
- [ ] Test local installation: `npm link`
- [ ] Publish to NPM registry

#### Task 10.3: CI/CD Integration
- [ ] Add package to GitHub Actions build workflow
- [ ] Run tests in CI pipeline
- [ ] Add linting and type checking
- [ ] Configure automated publishing on release

---

## AI Prompt Templates

### Table Documentation Prompt (Micro Analysis)

```markdown
You are a database documentation expert. Analyze the following SQL Server table and generate comprehensive documentation.

## Table Information
- **Schema**: {schema}
- **Table**: {table}
- **Type**: {tableType} (Lookup, Transactional, Bridge, Audit, etc.)
- **Row Count**: {rowCount}
- **Pattern Detection**:
  - Has Audit Fields: {hasAuditFields}
  - Has Soft Delete: {hasSoftDelete}
  - Is Bridge Table: {isBridge}

## Columns
{columnList with types, constraints, FK references}

## Primary Key
{primaryKey definition}

## Foreign Keys
{foreignKey list with referenced tables}

## Constraints
- Unique Constraints: {uniqueConstraints}
- Check Constraints: {checkConstraints}
- Default Constraints: {defaultConstraints}

## Sample Data (Anonymized)
{sampleData in table format}

## Existing Documentation
- Existing Table Description: {existingDescription || "None"}
- Existing Column Descriptions: {existingColumnDescriptions || "None"}

## Parent Tables (Already Documented)
{parentTableDescriptions}

## Task
Generate comprehensive documentation for this table and all columns. Return ONLY a JSON object with this exact structure:

{
  "tableDescription": "Detailed description of the table's purpose and contents (2-3 sentences)",
  "tablePurpose": "High-level purpose in one sentence",
  "tableUsageNotes": "How to use this table, important notes, caveats (optional)",
  "businessDomain": "Business domain (e.g., CRM, Finance, HR, Inventory, etc.)",
  "confidence": 0.85,
  "columns": [
    {
      "name": "ColumnName",
      "description": "What this column stores (1-2 sentences)",
      "purpose": "Why this column exists (optional)",
      "validValues": "Allowed values, ranges, or patterns (optional)",
      "usageNotes": "Important notes about using this column (optional)",
      "confidence": 0.9
    }
  ],
  "relationships": [
    {
      "type": "parent" | "child",
      "table": "SchemaName.TableName",
      "description": "Natural language explanation of the relationship",
      "cardinality": "One-to-Many" | "Many-to-Many" | etc.,
      "isRequired": true | false
    }
  ]
}

Guidelines:
- Use business-friendly language, not just technical descriptions
- Explain WHY, not just WHAT (purpose, not just content)
- For FK columns, explain the relationship in business terms
- Confidence score should reflect certainty (0-1 scale)
- Use sample data to infer purpose and valid values
- Consider table type when describing purpose (lookup vs transactional)
- Include audit field information if detected
- Note if this appears to be a soft-delete enabled table
```

### Schema Review Prompt (Macro Analysis)

```markdown
You are a database architecture expert. Review the following schema documentation for consistency, accuracy, and completeness.

## Schema: {schemaName}

## Overall Context
- Total Tables: {tableCount}
- Business Domains Detected: {businessDomains}
- Dependency Depth: {maxDependencyLevel} levels

## Table Documentation
{allTableDescriptions with relationships}

## Dependency Graph
{tableDependencyGraph in text format}

## Task
Review all table and column descriptions for:
1. **Consistency**: Do tables use consistent terminology?
2. **Accuracy**: Are relationships and business domains correct?
3. **Completeness**: Are any important aspects missing?
4. **Clarity**: Can descriptions be improved based on the holistic view?

Return ONLY a JSON object with this exact structure:

{
  "overallAssessment": "Summary of the schema's purpose and business domain (2-3 sentences)",
  "primaryBusinessDomain": "Primary business domain for this schema",
  "refinements": [
    {
      "table": "TableName",
      "field": "tableDescription" | "tablePurpose" | "columnName",
      "currentValue": "Current description",
      "suggestedValue": "Improved description",
      "reason": "Why this refinement is suggested",
      "confidence": 0.8
    }
  ],
  "terminologyStandardization": {
    "inconsistentTerms": ["term1", "term2"],
    "suggestedStandard": "Standard term to use"
  },
  "missingRelationships": [
    {
      "fromTable": "TableA",
      "toTable": "TableB",
      "description": "Relationship that should be documented"
    }
  ]
}

Guidelines:
- Only suggest refinements if you're confident they improve clarity or accuracy
- Look for inconsistent terminology (e.g., "Customer" vs "Client")
- Verify business domains are appropriate based on table relationships
- Suggest improvements that add value, not just rephrase
- Consider the entire schema context when evaluating individual tables
- Confidence score should reflect certainty (0-1 scale)
```

---

## Success Criteria

### Functional Requirements
- [ ] Successfully analyzes any SQL Server database schema
- [ ] Generates accurate dependency graphs with correct levels
- [ ] Profiles data efficiently (within reasonable time limits)
- [ ] Produces high-quality AI-generated descriptions
- [ ] Generates valid `sp_addextendedproperty` SQL scripts
- [ ] Integrates existing MJ metadata correctly
- [ ] Respects configuration options (schemas, tables, thresholds)
- [ ] Handles errors gracefully without crashing

### Quality Requirements
- [ ] Table descriptions are business-friendly, not just technical
- [ ] Column descriptions explain purpose, not just repeat the name
- [ ] Relationships are described in natural language
- [ ] Confidence scores accurately reflect certainty
- [ ] Markdown documentation is well-formatted and readable
- [ ] SQL scripts are syntactically correct and idempotent

### Performance Requirements
- [ ] Small database (10 tables): < 2 minutes
- [ ] Medium database (100 tables): < 15 minutes
- [ ] Large database (500 tables): < 60 minutes
- [ ] Token usage is reasonable (< $5 for typical database)
- [ ] No memory leaks during long runs

### Usability Requirements
- [ ] CLI is intuitive with helpful error messages
- [ ] Progress reporting keeps user informed
- [ ] Configuration is flexible and well-documented
- [ ] Output files are organized and easy to navigate
- [ ] Low-confidence items are clearly flagged for review

---

## Non-Goals (Future Enhancements)

These are explicitly **out of scope** for MVP but may be added later:

1. **Persistent State** - Storing runs in database tables
2. **Web UI** - MJ Explorer dashboard for reviewing/editing
3. **Incremental Updates** - Only process new/changed tables
4. **Multi-Database Support** - Cross-database relationship analysis
5. **User Feedback Loop** - Learning from manual edits
6. **Auto-Scheduling** - Periodic re-documentation via Actions
7. **Version Comparison** - Tracking schema changes over time
8. **Custom Prompt Templates** - User-defined prompts
9. **Database Support Beyond SQL Server** - PostgreSQL, MySQL, etc.
10. **Diagram Generation** - Visual ERD diagrams (beyond Mermaid)

---

## Risks & Mitigations

### Risk 1: AI Hallucinations
**Risk**: LLM generates incorrect or nonsensical descriptions
**Likelihood**: Medium
**Impact**: Medium
**Mitigation**:
- Use structured output (JSON mode) to constrain responses
- Include sample data and constraints in prompts for grounding
- Assign confidence scores and flag low-confidence items
- Two-phase analysis catches inconsistencies
- User review before executing SQL

### Risk 2: Sensitive Data Exposure
**Risk**: PII/PHI sent to AI provider
**Likelihood**: Medium
**Impact**: High
**Mitigation**:
- Never send actual data, only anonymized patterns
- Detect sensitive columns (SSN, credit card) and skip sampling
- Replace sample values with patterns (e.g., "XXX-XX-1234")
- Log warnings when sensitive data detected
- Document data privacy approach in README

### Risk 3: API Rate Limiting
**Risk**: AI provider throttles requests during large runs
**Likelihood**: Medium
**Impact**: Low
**Mitigation**:
- Implement retry logic with exponential backoff
- Add rate limiting to stay within provider limits
- Batch tables in macro review to reduce API calls
- Show progress so user knows it's not stuck

### Risk 4: Poor Performance on Large Databases
**Risk**: Analysis takes too long or runs out of memory
**Likelihood**: Low
**Impact**: Medium
**Mitigation**:
- Implement sampling limits (max rows per table)
- Process tables in batches, not all at once
- Add timeout protection for slow queries
- Use streaming/pagination for large result sets
- Add progress reporting so user can cancel if needed

### Risk 5: Overwriting Existing Documentation
**Risk**: Accidentally replacing good human-written descriptions
**Likelihood**: Low
**Impact**: Medium
**Mitigation**:
- Default to `onlyIfEmpty: true` (never overwrite)
- Require explicit `--overwrite` flag to replace existing
- Always generate SQL script for review before execution
- Include existing descriptions in AI prompts (preserve good ones)
- Log all changes clearly in summary report

### Risk 6: SQL Injection or Invalid SQL
**Risk**: Generated SQL scripts contain errors or injection risks
**Likelihood**: Low
**Impact**: Medium
**Mitigation**:
- Use parameterized queries for introspection
- Escape special characters in descriptions
- Validate generated SQL syntax before writing file
- Wrap all operations in transactions (rollback on error)
- Test SQL scripts in integration tests

---

## Open Questions

### Question 1: AI Provider Selection
**Question**: Which AI provider should be the default?
**Options**:
- OpenAI GPT-4 (widely used, structured output support)
- Anthropic Claude (longer context, better at analysis)
- Google Gemini (large context, cost-effective)
**Recommendation**: Default to configured provider in MJ settings, allow override via CLI flag

### Question 2: Confidence Threshold Default
**Question**: What should the default confidence threshold be?
**Options**:
- 0.5 (permissive, include most items)
- 0.6 (balanced, filter low-confidence)
- 0.7 (conservative, only high-confidence)
**Recommendation**: 0.6 (balanced) for initial version, configurable via flag

### Question 3: Extended Property Overwrite Strategy
**Question**: How should we handle existing extended properties by default?
**Options**:
- Never overwrite (safest)
- Always overwrite (most automated)
- Merge AI + existing (complex)
**Recommendation**: Default to `onlyIfEmpty: true`, require explicit flag to overwrite

### Question 4: Sample Data Privacy
**Question**: Should we support on-premise AI models to avoid sending data externally?
**Options**:
- Phase 1: Cloud only (simpler)
- Phase 2: Add local LLM support (complex)
**Recommendation**: Phase 1 cloud only with anonymization, consider local models in future

---

## Timeline Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Package Setup | 1.1 - 1.3 | 4-6 hours |
| Phase 2: Structural Analysis | 2.1 - 2.6 | 8-10 hours |
| Phase 3: Data Profiling | 3.1 - 3.5 | 8-10 hours |
| Phase 4: Micro AI Documentation | 4.1 - 4.5 | 12-15 hours |
| Phase 5: Macro AI Review | 5.1 - 5.3 | 6-8 hours |
| Phase 6: Output Generation | 6.1 - 6.4 | 8-10 hours |
| Phase 7: CLI Implementation | 7.1 - 7.5 | 6-8 hours |
| Phase 8: Testing & Validation | 8.1 - 8.5 | 8-10 hours |
| Phase 9: Documentation | 9.1 - 9.4 | 4-6 hours |
| Phase 10: Deployment | 10.1 - 10.3 | 2-3 hours |
| **Total** | **All Phases** | **66-86 hours** |

**Realistic Calendar Estimate**: 2-3 weeks with focused development

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Answer open questions** (AI provider, confidence threshold, overwrite strategy)
3. **Approve plan** for implementation
4. **Set up development branch** (`feature/db-documenter`)
5. **Begin Phase 1** (Package Setup)

---

## Document Metadata

**Document Version**: 1.0
**Created**: 2025-01-21
**Status**: ⏳ Awaiting Review & Approval
**Estimated Effort**: 66-86 hours (2-3 weeks)
**Package**: `@memberjunction/db-documenter`
**Dependencies**: `@memberjunction/core`, `@memberjunction/ai`, `mssql`, `commander`
