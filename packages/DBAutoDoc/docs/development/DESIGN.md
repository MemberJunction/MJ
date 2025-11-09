# DBAutoDoc - Architecture & Design Document

## Overview

**DBAutoDoc** is an AI-powered documentation generator for SQL Server databases. It uses Large Language Models to automatically generate intelligent descriptions for schemas, tables, and columns, saving them as SQL Server extended properties (`MS_Description`).

### Key Characteristics

- **Standalone tool** - Works with ANY SQL Server database, zero MemberJunction runtime dependencies
- **Iterative refinement** - Multi-pass analysis with backpropagation for accuracy
- **Human-in-the-loop** - Optional review and approval workflow
- **State-driven** - Maintains `db-doc-state.json` to track progress across runs
- **Topologically aware** - Processes tables in dependency order for better context

---

## Core Philosophy

This is not just a documentation generator - it's a **reasoning engine** that:

1. **Builds understanding incrementally** through topological processing
2. **Refines hypotheses iteratively** through backpropagation
3. **Tracks its reasoning** with full audit trails
4. **Knows when it's done** through convergence detection
5. **Validates globally** through multi-level sanity checks

---

## Architecture Components

### 1. Prompt System (`src/prompts/`)

**PromptFileLoader** - Custom Nunjucks loader for file-based prompts
- Extends `nunjucks.Loader`
- Loads `.md` files from `prompts/` directory
- Implements `getSource(name, callback)` for Nunjucks integration

**PromptEngine** - Combines Nunjucks templating with AI/Core
- Renders prompt templates with context data
- Executes prompts via AI/Core's `BaseLLM`
- Supports multiple providers (OpenAI, Anthropic, Groq)
- Handles response parsing (JSON and text)
- Tracks token usage and cost

### 2. Database Layer (`src/database/`)

**DatabaseConnection** - SQL Server connection management
- Pure `mssql` driver (no MJ DataProvider)
- Connection pool lifecycle
- Retry logic for transient failures
- Configuration from config.json

**Introspector** - Schema introspection
- Query system catalogs for tables, columns, constraints
- Extract foreign key relationships
- Read existing extended properties
- Build dependency graph metadata

**DataSampler** - Advanced data analysis
- Cardinality analysis (distinct counts, uniqueness ratios)
- Value distribution (if cardinality <= threshold)
- Statistical analysis (min, max, avg, stddev, percentiles)
- Pattern analysis (string formats, common prefixes)
- Temporal analysis (date ranges, time components)
- Stratified sampling (not purely random)

**TopologicalSorter** - Dependency graph processing
- Build graph from foreign key relationships
- Kahn's algorithm for topological sort
- Produces dependency levels (Level 0 = no deps, Level N depends on 0..N-1)
- Cycle detection for validation

### 3. State Management (`src/state/`)

**StateManager** - CRUD operations for state file
- Load/save `db-doc-state.json`
- Update schemas, tables, columns with AI results
- Track iteration history
- Merge user input with AI generations
- Query state (unapproved items, low confidence, etc.)

**IterationTracker** - Manages iteration metadata
- Track iterations per analysis run
- Record changes between iterations
- Detect convergence patterns

**StateValidator** - Validate state integrity
- Schema validation (required fields present)
- Reference validation (FKs point to valid tables)
- Iteration history consistency

### 4. Analysis Engine (`src/core/`)

**AnalysisEngine** - Main orchestrator
- Coordinates entire analysis workflow
- Processes tables level-by-level
- Calls PromptEngine for AI analysis
- Updates StateManager with results
- Tracks metrics (tokens, cost, duration)

**IterationManager** - Manages iteration cycles
- Controls iteration flow
- Determines when to iterate again
- Aggregates iteration metrics

**BackpropagationEngine** - Handles hypothesis refinement
- Detects insights about parent tables from child analysis
- Triggers re-analysis of upstream tables
- Tracks backpropagation depth
- Prevents infinite loops

**ConvergenceDetector** - Determines completion
- Checks against convergence criteria:
  - Max iterations limit
  - Stability window (no changes in N iterations)
  - Confidence threshold (all tables above threshold)
  - LLM explicit "done" signal (optional)
- Returns convergence status and reasoning

### 5. Generators (`src/generators/`)

**SQLGenerator** - Produces `sp_addextendedproperty` statements
- Generates SQL for schemas, tables, columns
- Proper string escaping for SQL
- Supports filtering (approved-only, confidence threshold)
- Idempotent (checks if property exists first)

**MarkdownGenerator** - Human-readable documentation
- Structured markdown with tables
- Includes relationships and statistics
- Generation metadata (time, tokens, model)
- Schema organization

**ReportGenerator** - Analysis reports
- Convergence metrics
- Iteration history
- Token usage and cost breakdown
- Low-confidence items
- Warnings and errors

### 6. CLI Commands (`src/commands/`)

**init** - Initialize new project
- Interactive database connection setup
- AI provider configuration
- Optional seed context gathering
- Creates config.json and initial state file

**analyze** - Run analysis
- Load configuration and state
- Introspect database
- Execute iterative analysis with backpropagation
- Perform sanity checks
- Save updated state

**status** - View current state
- Show convergence status
- List low-confidence items
- Display iteration history
- Show token usage and cost

**export** - Generate outputs
- SQL script generation
- Markdown documentation
- Analysis reports
- Optional: apply SQL to database

**reset** - Clear state
- Remove state file
- Start fresh analysis

---

## Data Model

### State File Structure (`db-doc-state.json`)

```typescript
interface DatabaseDocumentation {
  version: string;
  database: {
    name: string;
    server: string;
    analyzedAt: string;
  };
  seedContext?: {
    overallPurpose?: string;
    businessDomains?: string[];
    customInstructions?: string;
    industryContext?: string;
  };
  schemas: SchemaDefinition[];
  analysisRuns: AnalysisRun[];
  createdAt: string;
  lastModified: string;
  totalIterations: number;
}

interface SchemaDefinition {
  name: string;
  tables: TableDefinition[];
  description?: string;
  descriptionIterations: DescriptionIteration[];
  inferredPurpose?: string;
  businessDomains?: string[];
}

interface TableDefinition {
  name: string;
  rowCount: number;
  dependencyLevel?: number;
  dependsOn: ForeignKeyReference[];
  dependents: ForeignKeyReference[];
  columns: ColumnDefinition[];
  description?: string;
  descriptionIterations: DescriptionIteration[];
  userNotes?: string;
  userDescription?: string;
  userApproved?: boolean;
}

interface ColumnDefinition {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyReferences?: ForeignKeyReference;
  checkConstraint?: string;
  defaultValue?: string;
  possibleValues?: any[];
  statistics?: ColumnStatistics;
  description?: string;
  descriptionIterations: DescriptionIteration[];
}

interface DescriptionIteration {
  description: string;
  reasoning: string;
  generatedAt: string;
  modelUsed: string;
  confidence?: number;
  triggeredBy?: 'initial' | 'backpropagation' | 'refinement' | 'sanity_check';
  changedFrom?: string;
}

interface AnalysisRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'failed' | 'converged';
  levelsProcessed: number;
  iterationsPerformed: number;
  backpropagationCount: number;
  converged: boolean;
  convergenceReason?: string;
  modelUsed: string;
  totalTokensUsed: number;
  estimatedCost: number;
  warnings: string[];
  errors: string[];
  processingLog: ProcessingLogEntry[];
}
```

---

## Workflow

### Phase 1: Initialization
```bash
db-auto-doc init
```
1. Gather database connection details
2. Configure AI provider (model, API key)
3. Optional: collect seed context
4. Create config.json
5. Create empty state file

### Phase 2: Analysis
```bash
db-auto-doc analyze
```

**Iteration Loop**:
```
For iteration 1..maxIterations:
  For each dependency level (0..N):
    For each table in level:
      1. Gather parent table context (from previous levels)
      2. Analyze table with PromptEngine
      3. Update state with description iteration
      4. Detect insights about parent tables

    If insights detected:
      Execute backpropagation to parent levels
      Re-analyze affected tables

  Check convergence:
    - No changes in last N iterations?
    - All confidence scores above threshold?
    - Max iterations reached?

  If converged: break

Perform schema-level sanity checks
Perform cross-schema sanity checks (if multiple schemas)
Finalize analysis run
```

### Phase 3: Export
```bash
db-auto-doc export --sql --markdown --apply
```
1. Generate SQL script with `sp_addextendedproperty`
2. Generate markdown documentation
3. Optionally apply SQL to database

---

## Topological Processing

### Why Dependency Order Matters

Analyzing `OrderItems` before `Orders` misses critical context. By processing `Orders` first, we understand the parent entity, which informs the child table analysis.

### Dependency Levels

```
Level 0: Users, Products, Categories (no dependencies)
Level 1: Orders (→ Users), ProductCategories (→ Products, Categories)
Level 2: OrderItems (→ Orders, Products)
Level 3: Shipments (→ OrderItems)
```

### Algorithm (Kahn's)

1. Build graph from FK relationships
2. Compute in-degree for each table
3. Add tables with in-degree 0 to Level 0
4. Process Level 0, remove from graph
5. Decrement in-degrees of dependent tables
6. Repeat until all tables assigned to levels
7. Detect cycles (error if any remain)

---

## Backpropagation

### The Problem

Understanding emerges incrementally. Later analysis can reveal that earlier hypotheses were wrong.

### Example

```
Level 0: Analyze "Persons" table
  → Hypothesis: "General contact information"

Level 1: Analyze "Students" table (FK to Persons)
  → Insight: Persons.Type has values 'Student', 'Teacher', 'Staff'
  → Realization: Persons is actually school personnel, not general contacts!

BACKPROPAGATE:
  → Return to Persons (Level 0)
  → Re-analyze with new insight
  → Add new iteration with reasoning
```

### Implementation

1. During level processing, detect "parent insights"
2. Collect insights as backpropagation triggers
3. After level completes, execute backpropagation
4. Re-analyze affected parent tables with insights as context
5. Track depth to prevent infinite loops

---

## Convergence Detection

### Criteria

1. **Max Iterations**: Hard limit (default: 10)
2. **Stability Window**: No changes in last N iterations (default: 2)
3. **Confidence Threshold**: All tables above threshold (default: 0.85)
4. **LLM Signal**: Optional - ask LLM if analysis is complete

### Strategy

- Start with low iteration limit for cost control
- Use stability window to detect early convergence
- Require minimum 2 iterations before allowing convergence
- Track which criterion triggered convergence

---

## Data Sampling Strategy

### Cardinality Analysis

```sql
-- Always run for every column
SELECT
  COUNT(DISTINCT [Column]) as DistinctCount,
  COUNT(*) as TotalCount,
  SUM(CASE WHEN [Column] IS NULL THEN 1 ELSE 0 END) as NullCount
FROM [Schema].[Table];
```

**Uniqueness Ratio** = DistinctCount / TotalCount
- 1.0 = fully unique (likely ID or unique constraint)
- < 0.01 = very low cardinality (likely enum/category)

### Value Distribution (if DistinctCount ≤ threshold)

```sql
SELECT TOP 100
  [Column],
  COUNT(*) as Frequency,
  CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) as Percentage
FROM [Schema].[Table]
GROUP BY [Column]
ORDER BY COUNT(*) DESC;
```

Provides actual enum values, frequency distribution

### Statistical Analysis (numeric/date/money types)

```sql
SELECT
  MIN([Column]) as MinValue,
  MAX([Column]) as MaxValue,
  AVG([Column]) as AvgValue,
  STDEV([Column]) as StdDev,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY [Column]) as Median
FROM [Schema].[Table]
WHERE [Column] IS NOT NULL;
```

Reveals domain ranges, outliers, distribution shape

### Pattern Analysis (string types)

```sql
-- Length analysis
SELECT
  AVG(LEN([Column])) as AvgLength,
  MAX(LEN([Column])) as MaxLength,
  MIN(LEN([Column])) as MinLength
FROM [Schema].[Table]
WHERE [Column] IS NOT NULL;

-- Pattern detection (simple heuristics)
-- Check for common prefixes, formats (email, phone, URL, etc.)
```

### Stratified Sampling

Not purely random - sample from different value ranges to capture diversity:

```sql
WITH ValueRanges AS (
  SELECT [Column], NTILE(10) OVER (ORDER BY [Column]) as Bucket
  FROM [Schema].[Table]
)
SELECT TOP 1 [Column] FROM ValueRanges WHERE Bucket = 1
UNION ALL
SELECT TOP 1 [Column] FROM ValueRanges WHERE Bucket = 5
UNION ALL
SELECT TOP 1 [Column] FROM ValueRanges WHERE Bucket = 10;
```

---

## AI Integration

### Using AI/Core

**Dependencies**:
- `@memberjunction/ai` - Core abstractions (BaseLLM, ChatParams, ChatResult)
- `@memberjunction/ai-openai` - OpenAI provider
- `@memberjunction/ai-anthropic` - Anthropic provider
- `@memberjunction/ai-groq` - Groq provider

**No MJ Database Dependencies** - AI/Core is standalone

### Prompt Execution Pattern

```typescript
// 1. Render Nunjucks template with context
const renderedPrompt = await promptEngine.renderTemplate('table-analysis', {
  tableName: 'Orders',
  columns: [...],
  dependsOn: [...],
  // ... other context
});

// 2. Build ChatParams
const params: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: renderedPrompt }
  ],
  temperature: 0.1,
  maxOutputTokens: 4000,
  responseFormat: 'JSON'
};

// 3. Execute with AI/Core
const result = await llm.ChatCompletion(params);

// 4. Check success (like RunView - doesn't throw)
if (!result.success) {
  console.error('Error:', result.errorMessage);
  return;
}

// 5. Parse response
const content = result.data.choices[0].message.content;
const parsed = JSON.parse(content);
const tokensUsed = result.data.usage.totalTokens;
```

### Nunjucks Integration

**Custom Loader** (pattern from Templates package):

```typescript
class PromptFileLoader extends nunjucks.Loader {
  async: true;
  private prompts: Map<string, string> = new Map();

  getSource(name: string, callback: any) {
    const content = this.prompts.get(name);
    if (content) {
      callback(null, { src: content, path: name, noCache: true });
    } else {
      callback(new Error(`Prompt not found: ${name}`));
    }
  }
}
```

**Template Rendering** (pattern from Templates package):

```typescript
const nunjucksEnv = new nunjucks.Environment(loader, {
  autoescape: false,
  dev: true
});

// Add custom filters
nunjucksEnv.addFilter('json', (obj, indent = 2) => JSON.stringify(obj, null, indent));

// Render template
const result = await new Promise((resolve, reject) => {
  nunjucksEnv.render(promptName, context, (err, result) => {
    if (err) reject(err);
    else resolve(result);
  });
});
```

---

## Prompt Templates

All prompts stored as `.md` files in `prompts/` directory.

### `table-analysis.md`
**Purpose**: Analyze a single table at a dependency level
**Input**: Table metadata, columns, relationships, sample data
**Output**: JSON with table description, column descriptions, confidence, reasoning

### `table-with-context.md`
**Purpose**: Analyze table with parent table context (levels 1+)
**Input**: Same as table-analysis PLUS parent table descriptions
**Output**: Same format, but informed by parent context

### `backpropagation.md`
**Purpose**: Re-analyze table with new insights from child tables
**Input**: Current description, insights from children
**Output**: Revised description or confirmation of current

### `schema-sanity-check.md`
**Purpose**: Review all tables in schema for consistency
**Input**: All table descriptions in schema
**Output**: Schema-level description, inconsistencies found

### `cross-schema-check.md`
**Purpose**: Review relationships between schemas
**Input**: All schema descriptions
**Output**: Cross-schema insights, global patterns

### `convergence-check.md`
**Purpose**: Determine if analysis has converged
**Input**: Iteration count, recent changes, low-confidence items
**Output**: Converged boolean, reasoning, recommended actions

---

## Configuration

### `config.json`

```json
{
  "version": "1.0.0",
  "database": {
    "server": "localhost",
    "port": 1433,
    "database": "MyDatabase",
    "user": "sa",
    "password": "YourPassword",
    "encrypt": true,
    "trustServerCertificate": true,
    "connectionTimeout": 30000
  },
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "temperature": 0.1,
    "maxTokens": 4000
  },
  "analysis": {
    "cardinalityThreshold": 20,
    "sampleSize": 10,
    "includeStatistics": true,
    "includePatternAnalysis": true,
    "convergence": {
      "maxIterations": 10,
      "stabilityWindow": 2,
      "confidenceThreshold": 0.85
    },
    "backpropagation": {
      "enabled": true,
      "maxDepth": 3
    },
    "sanityChecks": {
      "schemaLevel": true,
      "crossSchema": true
    }
  },
  "output": {
    "stateFile": "./db-doc-state.json",
    "sqlFile": "./output/add-descriptions.sql",
    "markdownFile": "./output/database-documentation.md"
  },
  "schemas": {
    "include": ["dbo", "app"],
    "exclude": ["sys", "INFORMATION_SCHEMA"]
  },
  "tables": {
    "exclude": ["sysdiagrams", "__MigrationHistory"]
  }
}
```

---

## Error Handling

### RunView Pattern

AI/Core follows the RunView pattern - **does not throw exceptions**:

```typescript
// ✅ Correct
const result = await llm.ChatCompletion(params);
if (result.success) {
  // Process result
} else {
  console.error('Error:', result.errorMessage);
}

// ❌ Wrong - won't catch failures
try {
  const result = await llm.ChatCompletion(params);
} catch (error) {
  // This won't be reached for API errors!
}
```

### State File Validation

- Validate on load
- Detect corruption
- Provide recovery options (reset, restore from backup)

### Database Connection Issues

- Retry with exponential backoff
- Clear error messages for connection failures
- Validate credentials before analysis

---

## Code Style Guidelines

### MemberJunction Standards

1. **No `any` types** - Use proper TypeScript types
2. **Functional decomposition** - Small, focused functions (≤ 40 lines)
3. **Error handling** - Check `.success` property, don't assume exceptions
4. **Entity patterns** - Use Metadata system (though not needed here)
5. **Descriptive names** - Clear purpose from function/variable names

### Specific Patterns

**Small Functions**:
```typescript
// ❌ Bad - 200+ line monolith
async function analyzeDatabase() {
  // Everything in one function
}

// ✅ Good - Decomposed
async function analyzeDatabase() {
  const schemas = await introspectSchemas();
  const graph = buildDependencyGraph(schemas);
  const levels = sortTopologically(graph);
  await processLevels(levels);
}
```

**Type Safety**:
```typescript
// ❌ Bad
const data: any = await loadData();

// ✅ Good
const data: TableDefinition[] = await loadTables();
```

**Error Handling**:
```typescript
// ❌ Bad - assumes success
const result = await someOperation();
processResult(result.data);

// ✅ Good - checks success
const result = await someOperation();
if (result.success) {
  processResult(result.data);
} else {
  handleError(result.errorMessage);
}
```

---

## Testing Strategy

### Unit Tests
- Type validation (Zod schemas)
- Topological sort (various graph structures)
- Backpropagation logic (insight detection)
- Convergence detection (various scenarios)
- Prompt rendering (Nunjucks)

### Integration Tests
- Full analysis on sample database
- Multiple iterations with backpropagation
- Convergence scenarios
- SQL generation and application
- State file persistence

### Test Databases
- Simple (5 tables, no FKs)
- Medium (20 tables, 2-3 levels)
- Complex (50+ tables, 5+ levels, cycles to detect)
- Edge cases (self-referencing, circular FKs)

---

## Future Enhancements

### Phase 2 Features
- Incremental mode (skip analyzed tables)
- Manual review workflow (approve/reject)
- Cost estimation before running
- Budget limits
- Multiple LLM support (compare outputs)
- Column-level backpropagation
- SQLite state storage (for huge databases)

### Phase 3 Features
- PostgreSQL support
- MySQL support
- Web UI for review
- Git integration (commit state changes)
- CI/CD integration
- Multi-database analysis (compare schemas)
- AI-powered schema migration suggestions

---

## Dependencies

### MemberJunction Packages (All DB-Independent)
- `@memberjunction/ai` - Core LLM abstractions
- `@memberjunction/ai-openai` - OpenAI provider
- `@memberjunction/ai-anthropic` - Anthropic provider
- `@memberjunction/ai-groq` - Groq provider
- `@memberjunction/global` - Class factory

### External Packages
- `mssql` - SQL Server driver
- `nunjucks` - Template engine
- `@oclif/core` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal colors
- `ora` - Spinners
- `dotenv` - Environment variables

**Total**: Zero MemberJunction database dependencies. Fully standalone.

---

## Success Metrics

1. **Convergence Rate**: % of databases that converge within N iterations
2. **Confidence Scores**: Average confidence across all descriptions
3. **Iteration Count**: Typical iterations needed for convergence
4. **Backpropagation Frequency**: How often backpropagation improves results
5. **Cost Efficiency**: Tokens used per table described
6. **Accuracy**: Description quality vs manual documentation (when available)

---

## References

- AI/Core package: `/packages/AI/Core`
- Templates package: `/packages/Templates`
- State file format: See TypeScript types in `src/types/state.ts`
- Prompt templates: See `prompts/*.md` files
