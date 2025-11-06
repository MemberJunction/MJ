# DBAutoDoc - Project Plan

## Overview

DBAutoDoc is an AI-powered SQL Server database documentation generator that analyzes database schema, samples data, and uses LLMs to generate comprehensive descriptions at schema, table, and column levels. The tool works standalone with zero MemberJunction runtime dependencies, making it useful for documenting any SQL Server database.

---

## 📝 Updates from v1 (Key Changes)

### 1. ✅ BaseLLM Integration (Moved to Phase 1, High Priority)
**What Changed**: Originally, the package used `SimpleAIClient` with direct `fetch()` calls to OpenAI/Anthropic. This has been identified as a **temporary placeholder** that must be replaced early in development.

**Why**:
- MJ's `BaseLLM` class provides support for 10+ AI providers (not just OpenAI/Anthropic)
- File-based prompts are easier to maintain than inline strings
- BaseLLM handles retries, error handling, and rate limiting
- **Zero database dependency** - BaseLLM can be used standalone without MJ database running
- Consistent with MJ architecture

**Implementation**:
- **Phase 1a** (Days 1-2): Replace SimpleAIClient with BaseLLM wrapper (`LLMClient`)
- Create 6 prompt template files in `src/prompts/`
- Initialize BaseLLM from environment variables (AI_PROVIDER, AI_MODEL, AI_API_KEY)
- Support all MJ providers: OpenAI, Anthropic, Groq, Cerebras, Azure, Gemini, Vertex, Bedrock, etc.

**Example**:
```typescript
// OLD (SimpleAIClient - direct fetch() calls)
const client = new SimpleAIClient();
const result = await client.generateTableDoc(request);

// NEW (LLMClient - uses MJ ClassFactory pattern)
import { BaseLLM, GetAIAPIKey } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

// Read from environment (user provides both in init)
const modelAPIName = process.env.AI_MODEL || 'gpt-4';
const driverClass = process.env.AI_DRIVER_CLASS || 'OpenAILLM';
const apiKey = GetAIAPIKey(driverClass); // Gets OPENAI_API_KEY from env

// Use MJ ClassFactory to instantiate (NOT new OpenAILLM())
const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM,
  driverClass,
  apiKey
);

// Use with file-based prompts
const llmClient = new LLMClient(); // Reads from env
const result = await llmClient.generateTableDoc({
  promptFile: 'table-analysis.txt',
  variables: { schema, table, columns, ... }
});
```

### 2. ✅ User-Configurable Settings (No Hardcoded Values)
**What Changed**: Configuration values like `maxIterationsPerTable` (20) and `confidenceThreshold` (0.85) are no longer hardcoded.

**Why**:
- Different databases have different complexity levels
- Users should control iteration limits and quality thresholds
- Better UX - users understand what settings control behavior
- Settings persist in state file for subsequent runs

**Implementation**:
- **Phase 1b** (Days 2-3): Add interactive prompts at start of `analyze` command
- Prompt for: `maxIterationsPerTable`, `confidenceThreshold`, `enableBackPropagation`, etc.
- Store in state file's `analysisConfig` field
- Provide sensible defaults (20, 0.85, true)
- Support CLI flags to override: `--max-iterations 30`, `--confidence-threshold 0.90`, etc.
- Add `--use-defaults` flag to skip prompts entirely

**Example CLI Flow**:
```bash
$ db-auto-doc analyze

📊 Analysis Configuration
? Maximum iterations per table (prevents infinite loops)? (20)
? Confidence threshold to stop refinement (0.0-1.0)? (0.85)
? Enable back-propagation (re-analyze earlier levels)? (Yes)
? Sample data rows per table? (10)
? Maximum distinct values to extract? (20)

✓ Configuration saved to state file

# On subsequent runs, uses stored config
$ db-auto-doc analyze
✓ Using stored configuration (use --reconfigure to change)

# Or override specific settings
$ db-auto-doc analyze --max-iterations 30 --confidence-threshold 0.90
```

**State File**:
```typescript
{
  "version": "2.0",
  "analysisConfig": {  // NEW: User's choices persisted
    "maxIterationsPerTable": 20,
    "confidenceThreshold": 0.85,
    "enableBackPropagation": true,
    "backPropConfidenceThreshold": 0.70,
    "sampleDataRows": 10,
    "maxDistinctValues": 20,
    "parallelTablesPerLevel": 3
  },
  // ... rest of state
}
```

---

## Current Status

### ✅ Already Implemented (v1.0 Foundation)

The following components are **already built** and functional:

#### 1. CLI Framework (oclif-based)
- **Location**: `src/commands/`
- **Commands**:
  - `init` - Initialize project with .env and state file
  - `analyze` - Analyze database and generate documentation
  - `review` - Review and approve AI-generated docs
  - `export` - Export to SQL scripts and markdown
  - `reset` - Reset state file
- **Package**: Configured for both standalone (`db-auto-doc`) and MJ CLI integration

#### 2. State Management System
- **Location**: `src/state/state-manager.ts`, `src/types/state-file.ts`
- **Current State File Structure**:
  ```typescript
  {
    version: string;
    database: DatabaseInfo;
    seedContext?: SeedContext;
    schemas: Record<string, SchemaState>;
    runHistory: RunHistoryEntry[];
  }
  ```
- **Capabilities**:
  - User notes and descriptions
  - AI-generated documentation
  - Merged final descriptions
  - User approval tracking
  - Run history tracking
  - Incremental mode support

#### 3. Database Introspection
- **Location**: `src/database/introspection.ts`, `src/database/connection.ts`
- **Capabilities**:
  - Get all tables with row counts
  - Get columns with types, constraints, PK/FK flags
  - Get foreign key relationships
  - Get existing extended properties
  - Sample data extraction
- **Pure SQL Server**: No MJ dependencies

#### 4. AI Integration (⚠️ TEMPORARY - To Be Replaced)
- **Location**: `src/ai/simple-ai-client.ts`
- **Current Implementation**:
  - Direct HTTP calls to OpenAI and Anthropic using fetch()
  - Generates table and column descriptions
  - Returns confidence scores
  - Tracks token usage
- **Status**: ⚠️ **TEMPORARY PLACEHOLDER** - Will be replaced with MJ's BaseLLM in Phase 1
- **Why Replace**:
  - BaseLLM provides support for 10+ AI providers (OpenAI, Anthropic, Groq, Cerebras, etc.)
  - BaseLLM handles retries, error handling, and rate limiting
  - File-based prompts are easier to maintain than inline strings
  - Consistent with MJ architecture
  - **Zero database dependency** - BaseLLM can be used standalone without MJ database running

#### 5. Export Generators
- **Location**: `src/generators/sql-generator.ts`, `src/generators/markdown-generator.ts`
- **Capabilities**:
  - Generate `sp_addextendedproperty` SQL scripts
  - Generate markdown documentation
  - Filter by approval status and confidence threshold
  - Execute SQL scripts directly (optional)

#### 6. Interactive Workflow
- **Seed Context**: User can provide high-level context about database purpose
- **Incremental Mode**: Skip already-processed tables
- **Review Mode**: Approve/reject AI-generated descriptions
- **Batch Mode**: Non-interactive processing

---

## 🎯 Missing Features (Requirements from New Specification)

The following features are **required** but **not yet implemented**:

### 1. Topological Sort & Dependency-Based Processing
**Status**: ❌ Not Implemented
**Priority**: **CRITICAL** - Foundation for entire iterative approach

#### Requirements:
- Perform topological sort on tables within each schema based on foreign key dependencies
- Group tables into "levels":
  - **Level 0**: Tables with no foreign key dependencies (root tables)
  - **Level 1**: Tables that only depend on Level 0 tables
  - **Level N**: Tables that depend on tables from Level 0 through N-1
- Process tables level-by-level in dependency order
- Store level assignments in state file for tracking

#### Implementation Plan:
```typescript
// New file: src/analysis/topological-sort.ts
export interface TableDependency {
  schema: string;
  table: string;
  dependsOn: Array<{ schema: string; table: string }>;
  level: number;
}

export class TopologicalSorter {
  /**
   * Perform topological sort on tables based on foreign keys
   * Returns tables grouped by dependency level
   */
  async sortTables(
    introspector: DatabaseIntrospector,
    schemas: string[]
  ): Promise<Map<number, TableDependency[]>>
}
```

#### State File Changes:
```typescript
export interface TableState {
  // ... existing fields ...
  dependencyLevel?: number;  // NEW: Which level in the dependency graph
  dependencies?: string[];   // NEW: Array of "schema.table" this table depends on
}
```

---

### 2. Description Iteration History
**Status**: ⚠️ Partially Implemented
**Priority**: **HIGH** - Required for tracking hypothesis evolution

#### Current Limitation:
State file only tracks current `aiGenerated` description, not the full history of iterations.

#### Requirements:
- Track **all description attempts** with reasoning and timestamps
- Support reverting to previous descriptions if needed
- Maintain audit trail for understanding how descriptions evolved

#### Implementation Plan:
```typescript
export interface DescriptionIteration {
  description: string;
  reasoning: string;  // Why this description was chosen
  confidence: number;
  generatedAt: string;
  model: string;
  context?: {
    // What information was available when this was generated
    tablesAnalyzed: string[];
    levelCompleted?: number;
  };
}

export interface ColumnState {
  // REPLACE aiGenerated with:
  descriptionIterations: DescriptionIteration[];  // Full history
  currentDescription: string;  // Most recent (derived from iterations[0])

  // ... rest of fields ...
}

export interface TableState {
  // REPLACE aiGenerated with:
  descriptionIterations: DescriptionIteration[];  // Full history
  currentDescription: string;  // Most recent

  // ... rest of fields ...
}

export interface SchemaState {
  // ADD iteration tracking:
  descriptionIterations?: DescriptionIteration[];
  currentDescription?: string;

  // ... rest of fields ...
}
```

---

### 3. Back-Propagation of Learnings
**Status**: ❌ Not Implemented
**Priority**: **HIGH** - Core feature for accuracy improvement

#### Requirements:
- When analyzing a table at level N, if we discover information that invalidates assumptions from levels 0 to N-1:
  - Mark the affected table(s) for re-analysis
  - Re-run analysis for that level with new context
  - Continue forward from the re-analyzed level
- Prevent infinite loops with max iteration limits (e.g., 20 attempts per table)
- Track which tables triggered back-propagation for debugging

#### Implementation Plan:
```typescript
// New file: src/analysis/back-propagation.ts
export interface BackPropagationTrigger {
  triggerTable: string;  // Table that caused the re-think
  affectedTable: string;  // Table that needs re-analysis
  reason: string;         // Why we need to re-analyze
  discoveredAt: string;
}

export interface TableState {
  // ... existing fields ...
  analysisAttempts: number;  // NEW: How many times we've analyzed this table
  backPropagationHistory?: BackPropagationTrigger[];  // NEW: Why was this re-analyzed?
  locked?: boolean;  // NEW: Prevent re-analysis after max attempts
}

export class BackPropagationEngine {
  /**
   * Determine if a new insight requires re-analyzing earlier levels
   */
  async checkForBackPropagation(
    currentTable: TableDependency,
    newInsights: string[],
    stateManager: StateManager
  ): Promise<TableDependency[]>  // Returns tables that need re-analysis

  /**
   * Re-analyze a table with additional context from downstream analysis
   */
  async reanalyzeWithContext(
    table: TableDependency,
    additionalContext: string,
    stateManager: StateManager
  ): Promise<void>
}
```

#### Constants:
```typescript
export const MAX_ANALYSIS_ATTEMPTS = 20;  // Prevent infinite loops
export const BACK_PROP_CONFIDENCE_THRESHOLD = 0.7;  // Only back-prop if new info is high confidence
```

---

### 4. Advanced Data Profiling
**Status**: ⚠️ Partially Implemented
**Priority**: **MEDIUM** - Improves AI understanding

#### Current State:
- Basic `sampleData()` exists (top N rows)

#### Requirements:
Add sophisticated data analysis:

```typescript
// New file: src/analysis/data-profiler.ts
export interface ColumnProfile {
  columnName: string;
  dataType: string;

  // Cardinality analysis
  distinctCount?: number;
  totalCount?: number;
  cardinality?: 'unique' | 'high' | 'medium' | 'low';

  // For low-cardinality columns (<= 20 distinct values)
  possibleValues?: Array<{
    value: any;
    count: number;
    percentage: number;
  }>;

  // For numeric/date/money columns
  statistics?: {
    min?: any;
    max?: any;
    avg?: any;
    stdDev?: any;
  };

  // Patterns
  patterns?: {
    hasNulls: boolean;
    nullPercentage: number;
    hasDefaults?: boolean;
    commonPatterns?: string[];  // e.g., "email format", "phone number"
  };
}

export class DataProfiler {
  async profileColumn(
    connection: DatabaseConnection,
    schema: string,
    table: string,
    column: ColumnInfo
  ): Promise<ColumnProfile>

  async profileTable(
    connection: DatabaseConnection,
    schema: string,
    table: string,
    columns: ColumnInfo[]
  ): Promise<ColumnProfile[]>
}
```

#### Profiling Strategy:
1. **All Columns**: Count distinct values
2. **Low-Cardinality (<= 20 distinct)**: `SELECT DISTINCT` with counts
3. **Numeric/Date/Money**: `MIN`, `MAX`, `AVG`, `STDEV`
4. **Check Constraints**: Extract possible values from constraint definitions
5. **Pattern Detection**: Regex analysis on sample data

---

### 5. Iterative Refinement Loop
**Status**: ❌ Not Implemented
**Priority**: **HIGH** - Core workflow

#### Requirements:
- After each level is analyzed, ask LLM: "Are you confident in all descriptions?"
- If not confident, identify which tables/columns need refinement
- Re-analyze with additional context
- Continue until confidence threshold met or max iterations reached
- Support both automatic and interactive refinement modes

#### Implementation Plan:
```typescript
// New file: src/analysis/refinement-engine.ts
export interface RefinementRequest {
  level: number;
  tables: TableDependency[];
  currentDescriptions: Map<string, DescriptionIteration>;
}

export interface RefinementResult {
  requiresRefinement: boolean;
  tablesToRefine: string[];
  reasoning: string;
  suggestedImprovements: Array<{
    table: string;
    column?: string;
    issue: string;
    suggestion: string;
  }>;
}

export class RefinementEngine {
  /**
   * Ask LLM to review descriptions for a level and suggest improvements
   */
  async reviewLevel(
    request: RefinementRequest,
    aiClient: BaseLLM
  ): Promise<RefinementResult>

  /**
   * Apply refinements and update state
   */
  async applyRefinements(
    result: RefinementResult,
    stateManager: StateManager
  ): Promise<void>
}
```

---

### 6. Schema-Level Description Generation
**Status**: ❌ Not Implemented
**Priority**: **LOW** - Nice to have, not critical

#### Requirements:
- After all tables in a schema are analyzed, generate schema-level description
- Schema description should summarize:
  - Overall purpose of the schema
  - Main business domains covered
  - Key relationships and patterns
  - Notable tables

#### Implementation Plan:
```typescript
// Add to analyzer.ts
export class DatabaseAnalyzer {
  /**
   * Generate schema description after all tables analyzed
   */
  async generateSchemaDescription(
    schemaName: string,
    tables: TableDependency[],
    stateManager: StateManager
  ): Promise<void>
}
```

---

### 7. Final Sanity Checks
**Status**: ❌ Not Implemented
**Priority**: **MEDIUM** - Quality assurance

#### Requirements:
- **Per-Schema Sanity Check**: After completing a schema, review all descriptions for consistency
- **Cross-Schema Sanity Check**: After all schemas complete, check for cross-schema consistency
- Report inconsistencies, missing pieces, or low-confidence items

#### Implementation Plan:
```typescript
// New file: src/analysis/sanity-checker.ts
export interface SanityCheckResult {
  passed: boolean;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    location: string;  // "schema.table.column"
    issue: string;
    suggestion?: string;
  }>;
  overallScore: number;  // 0-100
}

export class SanityChecker {
  /**
   * Review all tables in a schema for consistency
   */
  async checkSchema(
    schemaName: string,
    stateManager: StateManager
  ): Promise<SanityCheckResult>

  /**
   * Review all schemas for cross-schema consistency
   */
  async checkDatabase(
    stateManager: StateManager
  ): Promise<SanityCheckResult>
}
```

---

### 8. User-Configurable Analysis Settings
**Status**: ❌ Not Implemented
**Priority**: **HIGH** - Essential UX improvement

#### Current Limitation:
Configuration values like `maxIterations` and `confidenceThreshold` are hardcoded or only available in config files.

#### Requirements:
- Prompt user for analysis settings at the start of `analyze` command
- Store settings in state file for subsequent runs
- Allow command-line flags to override stored settings
- Provide sensible defaults for all settings

#### Settings to Configure:
```typescript
export interface AnalysisConfig {
  maxIterationsPerTable: number;        // Default: 20
  confidenceThreshold: number;          // Default: 0.85
  enableBackPropagation: boolean;       // Default: true
  backPropConfidenceThreshold: number;  // Default: 0.70
  sampleDataRows: number;               // Default: 10
  maxDistinctValues: number;            // Default: 20
  parallelTablesPerLevel: number;       // Default: 3
}
```

#### Implementation Plan:
```typescript
// In analyze command, before starting analysis
async function promptForAnalysisConfig(
  existingConfig?: AnalysisConfig
): Promise<AnalysisConfig> {
  const config = await inquirer.prompt([
    {
      type: 'number',
      name: 'maxIterationsPerTable',
      message: 'Maximum iterations per table (prevents infinite loops)?',
      default: existingConfig?.maxIterationsPerTable || 20
    },
    {
      type: 'number',
      name: 'confidenceThreshold',
      message: 'Confidence threshold to stop refinement (0.0-1.0)?',
      default: existingConfig?.confidenceThreshold || 0.85
    },
    {
      type: 'confirm',
      name: 'enableBackPropagation',
      message: 'Enable back-propagation (re-analyze earlier levels)?',
      default: existingConfig?.enableBackPropagation !== false
    },
    // ... other settings
  ]);

  return config;
}
```

#### State File Storage:
```typescript
export interface StateFile {
  version: string;
  database: DatabaseInfo;
  analysisConfig?: AnalysisConfig;  // NEW: Store user's choices
  seedContext?: SeedContext;
  schemas: Record<string, SchemaState>;
  runHistory: RunHistoryEntry[];
}
```

#### CLI Flag Overrides:
```bash
# Use stored config
db-auto-doc analyze

# Override specific settings
db-auto-doc analyze \
  --max-iterations 30 \
  --confidence-threshold 0.90 \
  --no-back-propagation

# Skip prompts, use all defaults
db-auto-doc analyze --use-defaults
```

---

## 🏗️ Implementation Phases

### Phase 1: Core Infrastructure & BaseLLM (Week 1)
**Goal**: Set up foundational systems and replace SimpleAIClient with BaseLLM

#### 1a. BaseLLM Integration (Days 1-2) ⚠️ **HIGH PRIORITY - Do First**
**Why First**: All subsequent work depends on proper AI integration

- **Replace SimpleAIClient** with MJ's `BaseLLM` class using MJGlobal ClassFactory
  - Use `MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>` pattern (NOT direct instantiation)
  - Prompt for both model API name AND driver class in `init` command
  - Store in .env as `AI_MODEL` and `AI_DRIVER_CLASS`
  - **Zero database dependency** - use BaseLLM directly, NOT AIPromptRunner or AIEngine

  **Correct MJ Pattern**:
  ```typescript
  import { BaseLLM, GetAIAPIKey } from '@memberjunction/ai';
  import { MJGlobal } from '@memberjunction/global';

  // Read from environment variables (user provides both)
  const modelAPIName = process.env.AI_MODEL || 'gpt-4';
  const driverClass = process.env.AI_DRIVER_CLASS || 'OpenAILLM';
  const apiKey = GetAIAPIKey(driverClass); // Gets OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.

  // Use MJ ClassFactory to instantiate (correct pattern)
  const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
    BaseLLM,
    driverClass,
    apiKey
  );
  ```

  **Environment Variables**:
  ```bash
  # User provides all three:
  AI_MODEL=gpt-4              # Model API name to use in ChatCompletion calls
  AI_DRIVER_CLASS=OpenAILLM   # MJ driver class for instantiation
  OPENAI_API_KEY=sk-...       # Provider-specific API key
  ```

- **File-Based Prompts**
  - Create prompt templates in `src/prompts/` directory
  - Implement prompt template loader with variable substitution
  - Create initial prompts:
    - `table-analysis.txt` - Analyze a single table
    - `column-analysis.txt` - Analyze table columns (batch)
    - `level-review.txt` - Review an entire dependency level
    - `schema-summary.txt` - Generate schema-level description
    - `sanity-check.txt` - Consistency validation
    - `back-propagation-check.txt` - Determine if re-analysis needed

- **Integration**
  - Update `DatabaseAnalyzer` to use `LLMClient` instead of `SimpleAIClient`
  - Add error handling and retry logic (leveraging BaseLLM capabilities)
  - Track token usage and costs per provider

**LLMClient Wrapper Usage**:
```typescript
// LLMClient wraps the ClassFactory instantiation
export class LLMClient {
  private llm: BaseLLM;
  private modelAPIName: string;

  constructor(modelAPIName?: string, driverClass?: string) {
    this.modelAPIName = modelAPIName || process.env.AI_MODEL || 'gpt-4';
    const driver = driverClass || process.env.AI_DRIVER_CLASS || 'OpenAILLM';
    const apiKey = GetAIAPIKey(driver);

    // Use MJ ClassFactory pattern (NOT direct instantiation)
    this.llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
      BaseLLM,
      driver,
      apiKey
    );
  }

  async generateTableDoc(params: {
    promptFile: string;
    variables: Record<string, any>;
  }): Promise<AITableDocResponse> {
    // Load prompt template from file
    const promptTemplate = await loadPromptTemplate(params.promptFile);
    const prompt = substituteVariables(promptTemplate, params.variables);

    // Use BaseLLM's ChatCompletion
    const result = await this.llm.ChatCompletion({
      model: this.modelAPIName,
      messages: [
        { role: 'system', content: 'You are a database documentation expert.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      responseFormat: 'JSON'
    });

    return JSON.parse(result.data.choices[0].message.content);
  }
}
```

#### 1b. Update Init Command for Model and Driver Class (Days 2)
- **Update `init` Command**
  - Prompt for AI Model API name (e.g., "gpt-4", "claude-3-5-sonnet")
  - Prompt for Driver Class (e.g., "OpenAILLM", "AnthropicLLM", "GroqLLM")
  - Prompt for provider-specific API key
  - Store as `AI_MODEL`, `AI_DRIVER_CLASS`, and `<PROVIDER>_API_KEY` in .env
  - Provide examples/help text showing common driver classes

  **Example Init Flow**:
  ```bash
  $ db-auto-doc init

  Database Configuration:
  ? Database server? localhost
  ? Database name? AdventureWorks

  AI Configuration:
  ? AI Model API Name (e.g., gpt-4, claude-3-5-sonnet)? gpt-4
  ? AI Driver Class (OpenAILLM, AnthropicLLM, GroqLLM, etc.)? OpenAILLM
  ℹ Provider: OpenAI (will use OPENAI_API_KEY from environment)
  ? OpenAI API Key? sk-...

  ✓ Created .env file
  ✓ Created db-doc-state.json
  ```

  **Common Driver Classes**:
  - OpenAI models → `OpenAILLM`
  - Anthropic models → `AnthropicLLM`
  - Groq models → `GroqLLM`
  - Cerebras models → `CerebrasLLM`
  - Azure OpenAI → `AzureLLM`
  - Gemini → `GeminiLLM`
  - See MJ docs for full list

#### 1c. User-Configurable Settings (Days 2-3)
- **Interactive Configuration Prompts**
  - Add prompts at start of `analyze` command
  - Settings: maxIterations, confidenceThreshold, enableBackPropagation, etc.
  - Store in state file's `analysisConfig` field
  - Use stored config on subsequent runs (with option to reconfigure)

- **CLI Flag Overrides**
  - Add flags: `--max-iterations`, `--confidence-threshold`, `--no-back-propagation`
  - Add `--use-defaults` flag to skip prompts
  - Add `--reconfigure` flag to re-prompt even if config exists

- **State File Updates**
  - Add `analysisConfig?: AnalysisConfig` field
  - Validate config values (sensible ranges)
  - Provide clear defaults

#### 1d. Topological Sort (Days 3-4)
- Implement `TopologicalSorter` class
- Add dependency level calculation
- Update state file structure with `dependencyLevel` and `dependencies` fields
- Add unit tests for various dependency graphs (cycles, disconnected components, etc.)

#### 1e. Enhanced State File (Days 4-5)
- Migrate from single `aiGenerated` to `descriptionIterations[]` array
- Add `analysisAttempts` and `locked` fields
- Add migration utility to upgrade v1.0 state files to v2.0
- Update `StateManager` methods to work with iterations
- Add helper methods for common operations

#### 1f. Data Profiler (Days 5-6)
- Implement `DataProfiler` class
- Add cardinality analysis (distinct count, unique/high/medium/low)
- Add statistical analysis for numeric/date/money columns (MIN/MAX/AVG/STDEV)
- Add possible values extraction for low-cardinality columns (<= 20 distinct)
- Add pattern detection utilities (null %, common formats)

#### 1g. Testing (Day 7)
- Unit tests for BaseLLM integration
- Unit tests for TopologicalSorter
- Unit tests for DataProfiler
- Integration test: full analysis on simple test database

**Deliverables**:
- `src/ai/llm-client.ts` ✨ **NEW** (uses MJGlobal.Instance.ClassFactory)
- `src/prompts/*.txt` (6 prompt templates) ✨ **NEW**
- `src/utils/prompt-loader.ts` ✨ **NEW**
- Updated `src/commands/init.ts` (prompt for model API name AND driver class)
- `src/analysis/topological-sort.ts` ✨ **NEW**
- `src/analysis/data-profiler.ts` ✨ **NEW**
- Updated `src/types/state-file.ts` (v2.0 with `analysisConfig` and iterations)
- Updated `src/state/state-manager.ts`
- `src/utils/migration.ts` (v1.0 → v2.0 migrator) ✨ **NEW**
- Updated `src/analyzers/analyzer.ts` (use LLMClient)
- Updated `src/commands/analyze.ts` (config prompts and flags)
- Test suite for Phase 1 components

---

### Phase 2: Iterative Analysis Workflow (Week 2)
**Goal**: Implement level-by-level analysis with back-propagation

1. **Level-Based Analyzer**
   - Rewrite `DatabaseAnalyzer.analyze()` to process by levels (not alphabetically)
   - For each level:
     - Profile all tables using DataProfiler
     - Generate descriptions with context from previous levels
     - Store iteration with reasoning
     - Use user-configured `analysisConfig` settings
   - Add progress tracking and logging

2. **Back-Propagation Engine**
   - Implement `BackPropagationEngine`
   - Detect when downstream analysis invalidates upstream assumptions
   - Mark tables for re-analysis
   - Re-run affected level with additional context
   - Continue from re-analyzed level downward
   - Prevent infinite loops with `maxIterationsPerTable` from config

3. **Refinement Loop**
   - Implement `RefinementEngine`
   - After each level, ask LLM to review using `level-review.txt` prompt
   - Apply suggested refinements
   - Continue until `confidenceThreshold` met or max iterations reached
   - Track refinement history in `descriptionIterations`

**Deliverables**:
- `src/analysis/back-propagation.ts` ✨ **NEW**
- `src/analysis/refinement-engine.ts` ✨ **NEW**
- Updated `src/analyzers/analyzer.ts` with level-based workflow
- Guardrails and safety limits (using user config)

---

### Phase 3: Schema & Sanity Checks (Week 3)
**Goal**: Add final quality assurance steps

1. **Schema Description**
   - Generate schema-level descriptions after all tables analyzed
   - Summarize business domains and key patterns
   - Store in state file with iteration history

2. **Sanity Checker**
   - Implement `SanityChecker` class
   - Per-schema consistency checks
   - Cross-schema consistency checks
   - Generate quality reports

3. **Reporting**
   - Add CLI command: `db-auto-doc report`
   - Show analysis statistics
   - Show low-confidence items
   - Show back-propagation history
   - Show sanity check results

**Deliverables**:
- `src/analysis/sanity-checker.ts`
- Updated `src/analyzers/analyzer.ts` with schema descriptions
- New `src/commands/report.ts`
- Enhanced console output and logging

---

### Phase 4: Testing & Documentation (Week 4)
**Goal**: Comprehensive testing and documentation

1. **Testing**
   - Unit tests for all new classes
   - Integration tests with sample databases:
     - Simple (10 tables, 2 levels)
     - Medium (50 tables, 5 levels)
     - Complex (100+ tables, 10+ levels)
   - Test back-propagation scenarios
   - Test max iteration limits

2. **Documentation**
   - Update README with new workflow
   - Add architectural diagrams
   - Document state file format v2.0
   - Add troubleshooting guide
   - Add examples for various database types

3. **Polish**
   - Improve error messages
   - Add progress bars and status updates
   - Optimize performance (parallel analysis where possible)
   - Add configuration validation

**Deliverables**:
- Test suite (>80% coverage)
- Updated README and docs
- Sample databases for testing
- Configuration templates

---

## 📋 Updated CLI Commands

### Existing Commands (Enhanced)

#### `db-auto-doc analyze`
**Changes**: Now uses level-based analysis with back-propagation
```bash
db-auto-doc analyze \
  --schemas dbo \
  --max-iterations 20 \          # NEW: Max iterations per table
  --confidence-threshold 0.85 \  # NEW: Stop when confidence met
  --enable-back-prop \           # NEW: Enable back-propagation (default: true)
  --interactive                  # Interactive mode
```

**New Workflow**:
1. Topologically sort tables by dependencies
2. For each level (0, 1, 2, ...):
   - Profile all tables in level
   - Generate descriptions with context from prior levels
   - Ask LLM to review level
   - Apply refinements if needed
   - Check if back-propagation needed
   - If yes, re-run affected level and continue from there
3. Generate schema descriptions
4. Run sanity checks
5. Save state

---

### New Commands

#### `db-auto-doc report`
Generate analysis quality report
```bash
db-auto-doc report \
  --format console|json|html \
  --show-low-confidence \     # Show items below threshold
  --show-back-prop-history \  # Show back-propagation events
  --show-sanity-issues        # Show sanity check failures
```

**Output**:
```
📊 Analysis Report

Database: localhost.AdventureWorks
Analyzed: 2024-01-15 10:30:00

Schemas: 5
Tables: 71
  ├─ Level 0: 12 tables (no dependencies)
  ├─ Level 1: 23 tables
  ├─ Level 2: 18 tables
  ├─ Level 3: 12 tables
  └─ Level 4: 6 tables

Descriptions Generated:
  ✓ Tables: 71/71 (100%)
  ✓ Columns: 487/487 (100%)
  ✓ Schemas: 5/5 (100%)

Quality Metrics:
  Average Confidence: 0.89
  High Confidence (>0.9): 62 tables
  Medium Confidence (0.7-0.9): 8 tables
  Low Confidence (<0.7): 1 table

Back-Propagation Events: 3
  └─ Sales.SalesOrderDetail → Sales.SalesOrderHeader (relationship clarification)
  └─ HumanResources.Employee → Person.Person (role refinement)
  └─ Production.Product → Production.ProductCategory (classification update)

Sanity Check: ✓ PASSED
  Warnings: 2
    └─ Sales schema: Inconsistent date handling in 2 tables
    └─ HumanResources.Department: Low confidence (0.68)

Tokens Used: 145,234
Estimated Cost: $0.29
```

---

#### `db-auto-doc validate`
Validate state file and check for issues
```bash
db-auto-doc validate \
  --fix \                  # Attempt to fix issues
  --check-dependencies     # Verify dependency graph is valid
```

---

## 🗂️ Updated State File Structure (v2.0)

```typescript
{
  "version": "2.0",  // BREAKING CHANGE from v1.0
  "database": {
    "server": "localhost",
    "database": "AdventureWorks"
  },
  "config": {
    "maxIterationsPerTable": 20,
    "confidenceThreshold": 0.85,
    "enableBackPropagation": true
  },
  "seedContext": {
    "overallPurpose": "E-commerce and manufacturing ERP system",
    "businessDomains": ["Sales", "Production", "HR", "Purchasing"]
  },
  "schemas": {
    "Sales": {
      "descriptionIterations": [
        {
          "description": "Sales and customer order management...",
          "reasoning": "Based on analysis of all 15 tables in schema",
          "confidence": 0.92,
          "generatedAt": "2024-01-15T10:45:00Z",
          "model": "gpt-4",
          "context": {
            "tablesAnalyzed": ["Customer", "SalesOrderHeader", "..."],
            "completedAt": "level-3"
          }
        }
      ],
      "currentDescription": "Sales and customer order management...",
      "tables": {
        "Customer": {
          "dependencyLevel": 0,  // NEW: Root table, no dependencies
          "dependencies": [],     // NEW: No foreign keys to other tables
          "analysisAttempts": 2,  // NEW: Analyzed twice (initial + back-prop)

          "descriptionIterations": [  // NEW: Full history
            {
              "description": "Stores customer contact and demographic information...",
              "reasoning": "Initial analysis based on column names and sample data",
              "confidence": 0.88,
              "generatedAt": "2024-01-15T10:30:00Z",
              "model": "gpt-4",
              "context": {
                "tablesAnalyzed": ["Customer"],
                "levelCompleted": 0
              }
            },
            {
              "description": "PREVIOUS: Stores basic customer information",
              "reasoning": "Updated after analyzing SalesOrderHeader - realized Customer also tracks territory assignment",
              "confidence": 0.75,
              "generatedAt": "2024-01-15T10:25:00Z",
              "model": "gpt-4",
              "context": {
                "tablesAnalyzed": [],
                "levelCompleted": 0
              }
            }
          ],
          "currentDescription": "Stores customer contact and demographic information...",

          "backPropagationHistory": [  // NEW: Audit trail
            {
              "triggerTable": "Sales.SalesOrderHeader",
              "affectedTable": "Sales.Customer",
              "reason": "Discovered that CustomerID links to territory assignment, not just contact info",
              "discoveredAt": "2024-01-15T10:28:00Z"
            }
          ],

          "userApproved": true,
          "userNotes": "Also used for B2B and B2C customers",

          "columns": {
            "CustomerID": {
              "descriptionIterations": [
                {
                  "description": "Unique identifier for each customer",
                  "reasoning": "Primary key, identity column",
                  "confidence": 0.95,
                  "generatedAt": "2024-01-15T10:30:00Z",
                  "model": "gpt-4"
                }
              ],
              "currentDescription": "Unique identifier for each customer",
              "userApproved": true,

              "dataProfile": {  // NEW: Data profiling results
                "distinctCount": 19820,
                "totalCount": 19820,
                "cardinality": "unique",
                "patterns": {
                  "hasNulls": false,
                  "nullPercentage": 0
                }
              }
            },
            "CustomerType": {
              "descriptionIterations": [
                {
                  "description": "Type of customer: Individual (I) or Store (S)",
                  "reasoning": "Check constraint limits to 'I' or 'S', sample data confirms",
                  "confidence": 0.98,
                  "generatedAt": "2024-01-15T10:30:00Z",
                  "model": "gpt-4"
                }
              ],
              "currentDescription": "Type of customer: Individual (I) or Store (S)",

              "dataProfile": {  // NEW: Low-cardinality with possible values
                "distinctCount": 2,
                "totalCount": 19820,
                "cardinality": "low",
                "possibleValues": [
                  { "value": "I", "count": 12450, "percentage": 62.8 },
                  { "value": "S", "count": 7370, "percentage": 37.2 }
                ]
              }
            }
          }
        }
      }
    }
  },
  "dependencyGraph": {  // NEW: Topological sort results
    "Sales": {
      "levels": {
        "0": ["Customer", "Territory", "CreditCard"],
        "1": ["SalesOrderHeader", "CustomerAddress"],
        "2": ["SalesOrderDetail", "OrderTracking"],
        "3": ["Invoice"]
      },
      "maxLevel": 3
    }
  },
  "runHistory": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "phase": "analyze",
      "schemasProcessed": 1,
      "tablesProcessed": 15,
      "levelsProcessed": 4,
      "backPropagationEvents": 3,
      "iterationCount": 42,  // Total iterations across all tables
      "tokensUsed": 145234,
      "cost": 0.29,
      "duration": 325000,  // ms
      "sanityCheck": {
        "passed": true,
        "score": 0.94,
        "warnings": 2
      }
    }
  ]
}
```

---

## 🔧 Configuration (config.json or .env)

```json
{
  "database": {
    "server": "localhost",
    "database": "AdventureWorks",
    "encrypt": true,
    "trustServerCertificate": true
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4",
    "apiKey": "${AI_API_KEY}"  // From .env
  },
  "analysis": {
    "maxIterationsPerTable": 20,
    "confidenceThreshold": 0.85,
    "enableBackPropagation": true,
    "backPropConfidenceThreshold": 0.7,
    "sampleSize": 10,
    "maxDistinctValues": 20,  // For possible values extraction
    "parallelTables": 3        // Analyze N tables in parallel per level
  },
  "output": {
    "stateFilePath": "./db-doc-state.json",
    "sqlOutputPath": "./output/add-descriptions.sql",
    "markdownOutputPath": "./output/database-docs.md"
  }
}
```

---

## 🎯 Success Criteria

### Phase 1-2 Success Criteria:
- [ ] Topological sort correctly handles all dependency patterns
- [ ] State file migration from v1.0 to v2.0 works correctly
- [ ] Data profiler generates accurate statistics
- [ ] BaseLLM integration works with OpenAI, Anthropic, and Groq
- [ ] File-based prompts load and substitute variables correctly

### Phase 3 Success Criteria:
- [ ] Level-by-level analysis processes tables in correct order
- [ ] Back-propagation correctly identifies and re-analyzes affected tables
- [ ] Max iteration limits prevent infinite loops
- [ ] Refinement loop improves description quality
- [ ] Description iteration history tracks all changes with reasoning

### Phase 4 Success Criteria:
- [ ] Schema descriptions accurately summarize table collections
- [ ] Sanity checker identifies inconsistencies and low-confidence items
- [ ] Quality report provides actionable insights

### Phase 5 Success Criteria:
- [ ] All tests pass (unit + integration)
- [ ] Test databases of varying complexity complete successfully
- [ ] Documentation is clear and comprehensive
- [ ] Performance is acceptable (<5 min for 100 tables)

### Overall Success Criteria:
- [ ] Can document a 100-table database with 90%+ confidence
- [ ] Back-propagation improves accuracy without excessive iterations
- [ ] State file is human-readable and traceable
- [ ] SQL export successfully applies descriptions to database
- [ ] Tool works standalone without MJ database dependency

---

## 🚀 Future Enhancements (Post-MVP)

These are **not required** for the initial completion but could be added later:

1. **Incremental Update Mode**
   - Detect schema changes since last run
   - Only re-analyze changed tables and their dependents

2. **Pattern Library**
   - Maintain a library of common table patterns (lookup, junction, audit, etc.)
   - Use pattern matching to bootstrap descriptions

3. **Multi-Database Support**
   - PostgreSQL support
   - MySQL support
   - Unified state file format

4. **Web UI**
   - Visual dependency graph
   - Interactive description editing
   - Approval workflow

5. **CI/CD Integration**
   - GitHub Action for automatic documentation
   - PR comments with description changes
   - Quality gates based on confidence scores

6. **Advanced Analytics**
   - Identify unused tables
   - Identify missing indexes based on FKs
   - Detect potential data quality issues

7. **Export Formats**
   - JSON export for integration with other tools
   - HTML documentation site
   - ERD diagram generation

---

## 📚 Key Files & Structure

```
packages/DBAutoDoc/
├── src/
│   ├── commands/           # oclif CLI commands
│   │   ├── init.ts         # ✅ Already exists
│   │   ├── analyze.ts      # ✅ Exists - needs update for levels
│   │   ├── review.ts       # ✅ Already exists
│   │   ├── export.ts       # ✅ Already exists
│   │   ├── reset.ts        # ✅ Already exists
│   │   ├── report.ts       # ❌ NEW - Quality report
│   │   └── validate.ts     # ❌ NEW - State file validation
│   │
│   ├── analysis/           # ❌ NEW DIRECTORY - Core analysis logic
│   │   ├── topological-sort.ts       # Dependency graph sorting
│   │   ├── data-profiler.ts          # Advanced data profiling
│   │   ├── back-propagation.ts       # Back-propagation engine
│   │   ├── refinement-engine.ts      # Iterative refinement
│   │   └── sanity-checker.ts         # Quality checks
│   │
│   ├── analyzers/          # Existing - needs updates
│   │   └── analyzer.ts     # ⚠️ UPDATE - Level-based analysis
│   │
│   ├── ai/
│   │   ├── simple-ai-client.ts  # ✅ Exists - will deprecate
│   │   └── llm-client.ts        # ❌ NEW - BaseLLM wrapper
│   │
│   ├── prompts/            # ❌ NEW DIRECTORY - Prompt templates
│   │   ├── table-analysis.txt
│   │   ├── column-analysis.txt
│   │   ├── level-review.txt
│   │   ├── schema-summary.txt
│   │   ├── sanity-check.txt
│   │   └── back-propagation-check.txt
│   │
│   ├── database/
│   │   ├── connection.ts      # ✅ Already exists
│   │   └── introspection.ts   # ✅ Already exists
│   │
│   ├── state/
│   │   └── state-manager.ts   # ⚠️ UPDATE - Support iterations
│   │
│   ├── types/
│   │   └── state-file.ts      # ⚠️ UPDATE - v2.0 schema
│   │
│   ├── generators/
│   │   ├── sql-generator.ts      # ✅ Already exists
│   │   └── markdown-generator.ts # ✅ Already exists
│   │
│   └── utils/
│       ├── migration.ts       # ❌ NEW - State file migration
│       └── prompt-loader.ts   # ❌ NEW - Template loading
│
├── test/                   # ❌ NEW DIRECTORY - Test suite
│   ├── unit/
│   │   ├── topological-sort.test.ts
│   │   ├── data-profiler.test.ts
│   │   └── ...
│   ├── integration/
│   │   └── full-workflow.test.ts
│   └── fixtures/
│       ├── simple-db.sql
│       ├── medium-db.sql
│       └── complex-db.sql
│
├── docs/                   # ❌ NEW DIRECTORY - Documentation
│   ├── architecture.md
│   ├── state-file-v2.md
│   ├── workflows.md
│   └── troubleshooting.md
│
├── package.json            # ✅ Already exists
├── tsconfig.json           # ✅ Already exists
├── README.md               # ⚠️ UPDATE - Document new workflow
└── PROJECT_PLAN.md         # ✅ THIS FILE
```

---

## 🎬 Example Workflow

### Scenario: Documenting AdventureWorks Database

```bash
# 1. Initialize project
db-auto-doc init

# Prompts:
# - Database server? localhost
# - Database name? AdventureWorks
# - AI Model API Name (e.g., gpt-4, claude-3-5-sonnet)? gpt-4
# - AI Driver Class (OpenAILLM, AnthropicLLM, etc.)? OpenAILLM
# - OpenAI API Key? sk-...
# - Enable back-propagation? Yes
# - Max iterations per table? 20
# - Confidence threshold? 0.85

# Creates .env file with:
# DB_SERVER=localhost
# DB_DATABASE=AdventureWorks
# AI_MODEL=gpt-4
# AI_DRIVER_CLASS=OpenAILLM
# OPENAI_API_KEY=sk-...
#
# Seed questions:
# - What is the overall purpose? E-commerce and manufacturing ERP
# - What business domains? Sales, Production, HR, Purchasing
# - Any custom instructions? Focus on business context, not technical details

# Creates:
# - .env (with DB credentials and AI key)
# - db-doc-state.json (initial empty state)
# - config.json (analysis settings)

# 2. Analyze database
db-auto-doc analyze --schemas Sales,Production

# Processing:
# ✓ Performing topological sort...
#   Sales: 4 levels, 15 tables
#   Production: 5 levels, 23 tables
#
# ✓ Profiling Level 0 (5 tables)...
#   - Sales.Customer: 19,820 rows
#   - Sales.Territory: 10 rows
#   - Production.ProductCategory: 4 rows
#   ...
#
# ✓ Analyzing Level 0 (5 tables)...
#   ✓ Sales.Customer (confidence: 0.88)
#   ✓ Sales.Territory (confidence: 0.92)
#   ...
#
# ✓ Reviewing Level 0...
#   ⚠ Suggested refinement for Sales.Customer
#   ✓ Re-analyzing Sales.Customer (confidence: 0.91)
#
# ✓ Analyzing Level 1 (8 tables)...
#   ✓ Sales.SalesOrderHeader (confidence: 0.89)
#   ⚠ Back-propagation triggered: SalesOrderHeader → Customer
#   ↺ Re-analyzing Level 0...
#   ✓ Sales.Customer (confidence: 0.93)
#   ↺ Continuing from Level 1...
#   ...
#
# ✓ Schema summary generated for Sales
# ✓ Schema summary generated for Production
#
# ✓ Running sanity checks...
#   ✓ Sales schema: PASSED (score: 0.94, 2 warnings)
#   ✓ Production schema: PASSED (score: 0.91, 1 warning)
#   ✓ Cross-schema check: PASSED
#
# ✅ Analysis complete!
#    Schemas: 2
#    Tables: 38
#    Iterations: 87
#    Back-propagation events: 3
#    Tokens: 245,123
#    Cost: $0.49
#    Duration: 8m 32s

# 3. Review quality report
db-auto-doc report

# Shows:
# - Confidence distribution
# - Low-confidence items
# - Back-propagation history
# - Sanity check results

# 4. Manually review and approve
db-auto-doc review --unapproved-only

# Interactive:
# - Shows each unapproved table/column
# - User can approve, edit, or add notes

# 5. Export to SQL
db-auto-doc export --format sql --approved-only

# Generates:
# - output/add-descriptions.sql (sp_addextendedproperty statements)

# 6. Apply to database (optional)
db-auto-doc export --format sql --approved-only --execute

# Executes SQL script against database
```

---

## 🤝 Contributing

When implementing this plan:

1. **Follow MJ coding standards** (see `/CLAUDE.md`)
2. **Use TypeScript strict mode** with explicit typing
3. **No `any` types** - use proper generics
4. **Functional decomposition** - keep functions small and focused
5. **Use BaseLLM** - not direct API calls
6. **File-based prompts** - not inline strings
7. **Test coverage** - aim for >80%
8. **Document as you go** - keep README updated

---

## 📝 Notes & Decisions

### Why File-Based Prompts?
- **Maintainability**: Easy to update prompts without code changes
- **Consistency**: Reuse across MJ packages
- **Versioning**: Track prompt changes in git
- **Collaboration**: Non-developers can improve prompts

### Why Topological Sort?
- **Context**: Understanding parent tables helps describe child tables
- **Efficiency**: Process root tables first, then build on that knowledge
- **Accuracy**: Relationships make more sense when analyzed in dependency order

### Why Back-Propagation?
- **Accuracy**: Initial assumptions may be wrong
- **Completeness**: Downstream tables provide context about upstream tables
- **Refinement**: Iterative improvement leads to better results

### Why Iteration History?
- **Auditability**: Track how descriptions evolved
- **Debugging**: Understand why a description changed
- **Prevention**: Avoid regressing to worse descriptions
- **Learning**: Improve prompts based on iteration patterns

---

## ✅ Done Criteria

The DBAutoDoc package will be considered **complete** when:

1. ✅ All Phase 1-5 tasks are implemented
2. ✅ All success criteria are met
3. ✅ Test suite passes with >80% coverage
4. ✅ Can successfully document a real-world database (100+ tables) with 90%+ confidence
5. ✅ Back-propagation demonstrably improves accuracy
6. ✅ State file v2.0 format is stable and documented
7. ✅ README and documentation are complete
8. ✅ SQL export successfully applies to a test database
9. ✅ Quality report provides useful insights
10. ✅ Tool works standalone with zero MJ runtime dependencies

---

## 🔗 Related Documentation

- **MJ Coding Standards**: `/CLAUDE.md`
- **BaseLLM Documentation**: `packages/AI/README.md`
- **State Management Pattern**: Similar to AI CLI's conversation state
- **Topological Sort Examples**: Graph theory textbooks, many open-source implementations

---

**Last Updated**: 2024-11-06 (v2 - Updated with BaseLLM priority and user-configurable settings)
**Status**: Planning Phase - Ready for Implementation
**Next Steps**: Begin Phase 1a - BaseLLM Integration (HIGH PRIORITY)

---

## Summary of Changes from v1 Plan

1. **BaseLLM Integration moved from Phase 2 to Phase 1a** (Days 1-2) - **CRITICAL CHANGE**
   - Now the FIRST task in implementation
   - Recognized as critical foundation for all subsequent work
   - SimpleAIClient clearly marked as temporary placeholder
   - **Uses MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM> pattern**
   - **NOT** direct instantiation (no `new OpenAILLM()`)

2. **User Provides Both Model and Driver Class** - **SIMPLIFIED APPROACH**
   - Init command prompts for BOTH model API name AND driver class
   - No mapping needed - user tells us which driver to use
   - Stores as `AI_MODEL` and `AI_DRIVER_CLASS` in .env
   - Uses `GetAIAPIKey(driverClass)` to get provider-specific API key
   - Example: User enters "gpt-4" + "OpenAILLM" → gets OPENAI_API_KEY
   - More flexible - supports any model/driver combination without hardcoded maps

3. **User-Configurable Settings added to Phase 1c** (Days 2-3)
   - All analysis parameters are now user-provided (with defaults)
   - Settings persist in state file's `analysisConfig`
   - CLI flags allow per-run overrides
   - No more hardcoded values like maxIterations=20

4. **Timeline compressed to 4 weeks** (from 5)
   - Week 1: Core Infrastructure + BaseLLM + User Config
   - Week 2: Iterative Analysis Workflow
   - Week 3: Schema & Sanity Checks
   - Week 4: Testing & Documentation

5. **State file v2.0 includes `analysisConfig`**
   - Stores user's configuration choices
   - Enables consistent behavior across runs
   - Supports `--reconfigure` to update settings
