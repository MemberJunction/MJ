# DBAutoDoc Programmatic API

The DBAutoDoc API provides a clean, type-safe interface for using DBAutoDoc as a library in your Node.js applications. No CLI required - just import and use.

## Installation

```bash
npm install @memberjunction/db-auto-doc
```

## Basic Usage

### Simple Analysis

```typescript
import { DBAutoDocAPI } from '@memberjunction/db-auto-doc';

const api = new DBAutoDocAPI();

const result = await api.analyze({
  database: {
    provider: 'sqlserver',
    server: 'localhost',
    database: 'MyDatabase',
    user: 'sa',
    password: 'your_password'
  },
  ai: {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  onProgress: (message, data) => {
    console.log(`[${new Date().toISOString()}] ${message}`, data || '');
  }
});

if (result.success) {
  console.log(`Analysis complete!`);
  console.log(`Output folder: ${result.outputFolder}`);
  console.log(`Tokens used: ${result.summary.totalTokens}`);
  console.log(`Estimated cost: $${result.summary.estimatedCost.toFixed(2)}`);
} else {
  console.error(`Analysis failed: ${result.message}`);
}
```

## API Methods

### `analyze(config, progressCallback?): Promise<AnalysisExecutionResult>`

Runs a complete database analysis.

**Parameters:**
- `config` - Configuration object with database and AI settings
- `onProgress` (optional) - Callback function for progress updates

**Returns:** `AnalysisExecutionResult` with:
- `success: boolean` - Whether analysis succeeded
- `outputFolder: string` - Path to output directory
- `stateFile: string` - Path to state.json
- `summary: AnalysisSummary` - Analysis metrics

**Example:**
```typescript
const result = await api.analyze({
  database: {
    provider: 'sqlserver',
    server: 'sql-server.example.com',
    database: 'ProductDB',
    user: 'admin',
    password: process.env.DB_PASSWORD,
    port: 1433,
    encrypt: true,
    trustServerCertificate: false
  },
  ai: {
    provider: 'openai',
    model: 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.1,
    maxTokens: 4000
  },
  analysis: {
    cardinalityThreshold: 100,
    sampleSize: 1000,
    includeStatistics: true,
    relationshipDiscovery: {
      enabled: true,
      triggers: {
        runOnMissingPKs: true,
        runOnInsufficientFKs: true,
        fkDeficitThreshold: 0.4
      }
    }
  },
  seedContext: {
    overallPurpose: 'E-commerce product management system',
    businessDomains: ['Inventory', 'Pricing', 'Catalog'],
    industryContext: 'Retail'
  },
  schemas: {
    include: ['dbo', 'sales'],
    exclude: ['temp']
  },
  tables: {
    exclude: ['LogTable', 'AuditTrail']
  },
  onProgress: (msg, data) => console.log(msg, data)
});
```

### `resume(stateFile, config?): Promise<AnalysisExecutionResult>`

Resumes an analysis from a previous checkpoint.

**Parameters:**
- `stateFile` - Path to the state.json file to resume from
- `config` (optional) - Updated configuration (if not provided, uses defaults)

**Returns:** `AnalysisExecutionResult`

**Example:**
```typescript
// Resume with original config
const result = await api.resume('./output/run-5/state.json');

// Or resume with updated config
const result = await api.resume('./output/run-5/state.json', {
  database: { /* ... */ },
  ai: {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});
```

### `export(stateFile, options?): Promise<ExportResult>`

Generates SQL and/or Markdown from an analysis state file.

**Parameters:**
- `stateFile` - Path to the state.json file
- `options` (optional):
  - `sql: boolean` - Generate SQL script (default: true)
  - `markdown: boolean` - Generate Markdown documentation (default: true)
  - `outputDir: string` - Directory for generated files (default: same as state file)
  - `approvedOnly: boolean` - Only export approved items (default: false)
  - `confidenceThreshold: number` - Minimum confidence 0-1 (default: 0)

**Returns:** `ExportResult` with:
- `success: boolean` - Whether export succeeded
- `sqlFile?: string` - Path to generated SQL file
- `markdownFile?: string` - Path to generated Markdown file

**Example:**
```typescript
// Generate both SQL and Markdown
const result = await api.export('./output/run-5/state.json', {
  sql: true,
  markdown: true,
  outputDir: './documentation'
});

if (result.success) {
  console.log(`SQL file: ${result.sqlFile}`);
  console.log(`Markdown file: ${result.markdownFile}`);

  // Apply SQL to database if needed
  const fs = require('fs');
  const sql = fs.readFileSync(result.sqlFile, 'utf-8');
  // ... execute SQL in your database
}

// Or just generate SQL for high-confidence items
const sqlOnly = await api.export('./output/run-5/state.json', {
  sql: true,
  markdown: false,
  confidenceThreshold: 0.8,
  outputDir: './sql-only'
});
```

### `getStatus(stateFile): Promise<AnalysisStatus>`

Gets the current status and metrics from an analysis state file.

**Parameters:**
- `stateFile` - Path to the state.json file

**Returns:** `AnalysisStatus` with:
- `exists: boolean` - Whether state file exists
- `createdAt?: string` - Creation timestamp
- `lastModified?: string` - Last modification timestamp
- `totalIterations?: number` - Iterations performed
- `totalTokens?: number` - Total tokens used
- `estimatedCost?: number` - Estimated API cost
- `totalSchemas?: number` - Number of schemas analyzed
- `totalTables?: number` - Number of tables analyzed
- `totalColumns?: number` - Number of columns analyzed

**Example:**
```typescript
const status = await api.getStatus('./output/run-5/state.json');

if (status.exists) {
  console.log(`Analysis status:`);
  console.log(`  Created: ${status.createdAt}`);
  console.log(`  Schemas: ${status.totalSchemas}`);
  console.log(`  Tables: ${status.totalTables}`);
  console.log(`  Columns: ${status.totalColumns}`);
  console.log(`  Iterations: ${status.totalIterations}`);
  console.log(`  Tokens: ${status.totalTokens}`);
  console.log(`  Cost: $${status.estimatedCost?.toFixed(2)}`);
} else {
  console.log('No analysis found at this location');
}
```

## Configuration Guide

### Database Configuration (DatabaseConfig)

Supports SQL Server, MySQL, PostgreSQL, and Oracle:

```typescript
{
  provider?: 'sqlserver' | 'mysql' | 'postgresql' | 'oracle';  // Default: sqlserver
  server: string;           // Host or IP
  port?: number;            // Database port (default varies by provider)
  database: string;         // Database name
  user: string;             // Username
  password: string;         // Password

  // SQL Server specific
  encrypt?: boolean;        // Use encrypted connection
  trustServerCertificate?: boolean; // For self-signed certificates

  // Connection pool settings
  connectionTimeout?: number;    // ms (default: 30000)
  requestTimeout?: number;       // ms (default: 30000)
  maxConnections?: number;       // Pool size (default: 50)
  minConnections?: number;       // Min pool size (default: 5)
  idleTimeoutMillis?: number;    // Idle timeout (default: 30000)
}
```

### AI Configuration (AIConfig)

```typescript
{
  provider: 'openai' | 'anthropic' | 'groq' | 'mistral' | 'gemini';
  model: string;            // Model name/ID
  apiKey: string;           // API key (use env vars!)
  temperature?: number;     // 0.0-2.0 (default: 0.1 for consistency)
  maxTokens?: number;       // Max output tokens (default: 4000)
  requestsPerMinute?: number; // Rate limiting
  effortLevel?: number;     // 1-100 (if supported by model)
}
```

### Analysis Configuration (Optional)

Most settings have sensible defaults, but you can customize:

```typescript
{
  analysis: {
    cardinalityThreshold: 100,          // Treat as dimension if > X% unique
    sampleSize: 1000,                   // Rows to sample per table
    includeStatistics: true,            // Compute column statistics
    includePatternAnalysis: true,       // Detect data patterns

    convergence: {
      maxIterations: 3,                 // Max analysis iterations
      stabilityWindow: 2,               // Iterations before convergence
      confidenceThreshold: 0.85         // Confidence target
    },

    backpropagation: {
      enabled: true,                    // Re-analyze based on findings
      maxDepth: 2                       // Propagation depth
    },

    sanityChecks: {
      dependencyLevel: true,            // Check table dependencies
      schemaLevel: true,                // Check schema consistency
      crossSchema: true                 // Check cross-schema relationships
    },

    relationshipDiscovery: {
      enabled: true,                    // Auto-discover PKs/FKs
      triggers: {
        runOnMissingPKs: true,         // Run if PK missing
        runOnInsufficientFKs: true,    // Run if FKs below threshold
        fkDeficitThreshold: 0.4        // Threshold (40% default)
      },
      tokenBudget: {
        ratioOfTotal: 0.25             // 25% of token budget
      },
      confidence: {
        primaryKeyMinimum: 0.7,        // Confidence to accept PK
        foreignKeyMinimum: 0.6,        // Confidence to accept FK
        llmValidationThreshold: 0.8    // Validate if below 0.8
      }
    }
  }
}
```

### Seed Context (Optional)

Provide business context for better analysis:

```typescript
{
  seedContext: {
    overallPurpose: 'E-commerce platform with multi-vendor support',
    businessDomains: ['Products', 'Orders', 'Payments', 'Shipping'],
    industryContext: 'Retail & Logistics',
    customInstructions: 'Focus on data quality issues in the OrderStatus table'
  }
}
```

## Progress Monitoring

The `onProgress` callback provides real-time status updates:

```typescript
const result = await api.analyze({
  // ... config ...
  onProgress: (message, data) => {
    if (data?.percentage) {
      console.log(`[${data.percentage}%] ${message}`);
    } else if (data?.table) {
      console.log(`Analyzing ${data.table}: ${message}`);
    } else if (data?.tokens) {
      console.log(`Tokens used: ${data.tokens}, Cost: $${data.cost.toFixed(2)}`);
    } else {
      console.log(message);
    }
  }
});
```

## Complete Example: Analysis Pipeline

```typescript
import { DBAutoDocAPI } from '@memberjunction/db-auto-doc';
import * as fs from 'fs';

async function documentDatabase() {
  const api = new DBAutoDocAPI();

  try {
    console.log('Starting database analysis...\n');

    // 1. Run analysis
    const analysisResult = await api.analyze({
      database: {
        provider: 'sqlserver',
        server: process.env.DB_SERVER!,
        database: process.env.DB_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!
      },
      ai: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        apiKey: process.env.ANTHROPIC_API_KEY!
      },
      onProgress: (msg, data) => {
        console.log(`  ${msg}`);
        if (data?.percentage) console.log(`    Progress: ${data.percentage}%`);
      }
    });

    if (!analysisResult.success) {
      console.error(`Analysis failed: ${analysisResult.message}`);
      return;
    }

    console.log(`\nAnalysis complete!`);
    console.log(`  Output: ${analysisResult.outputFolder}`);
    console.log(`  Tokens: ${analysisResult.summary.totalTokens}`);
    console.log(`  Cost: $${analysisResult.summary.estimatedCost.toFixed(2)}`);

    // 2. Check status
    const status = await api.getStatus(analysisResult.stateFile);
    console.log(`\nAnalysis summary:`);
    console.log(`  Schemas: ${status.totalSchemas}`);
    console.log(`  Tables: ${status.totalTables}`);
    console.log(`  Columns: ${status.totalColumns}`);

    // 3. Export documentation
    console.log(`\nGenerating documentation...`);
    const exportResult = await api.export(analysisResult.stateFile, {
      sql: true,
      markdown: true,
      outputDir: './documentation'
    });

    if (exportResult.success) {
      console.log(`  SQL: ${exportResult.sqlFile}`);
      console.log(`  Markdown: ${exportResult.markdownFile}`);

      // 4. Apply SQL if desired
      if (process.env.APPLY_SQL === 'true') {
        console.log(`\nApplying SQL to database...`);
        const sql = fs.readFileSync(exportResult.sqlFile!, 'utf-8');
        // ... execute SQL in your database connection
        console.log('SQL applied successfully');
      }
    }

  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

// Run pipeline
documentDatabase();
```

## Environment Variables

```bash
# Database
DB_SERVER=localhost
DB_NAME=MyDatabase
DB_USER=sa
DB_PASSWORD=your_password

# AI Provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
OPENAI_API_KEY=sk-...
# OR
GROQ_API_KEY=gsk-...

# Optional
APPLY_SQL=false  # Whether to apply generated SQL
```

## Error Handling

All API methods return results with a `success` flag:

```typescript
const result = await api.analyze({...});

if (!result.success) {
  console.error(`Error: ${result.message}`);
  console.log(`Output folder: ${result.outputFolder}`);
  // Check state.json for more details
  return;
}
```

For detailed error information, check the state.json file in the output folder:
- `summary` - Overall metrics and status
- `phases.descriptionGeneration[0].processingLog` - Detailed operation logs
- `phases.descriptionGeneration[0].errors` - Error messages

## File Output Structure

After analysis, the output folder contains:

```
output/run-5/
├── state.json              # Complete analysis state (resumable)
├── extended-props.sql      # SQL to apply documentation to database
└── summary.md              # Human-readable documentation
```

The `state.json` file can be used to:
- Resume incomplete analysis
- Re-export in different formats
- Access raw analysis data programmatically
- Track analysis history

## Type Definitions

All types are fully exported for TypeScript support:

```typescript
import {
  DBAutoDocAPI,
  DBAutoDocAPIConfig,
  AnalysisExecutionResult,
  ExportResult,
  AnalysisStatus,
  ProgressCallback
} from '@memberjunction/db-auto-doc';
```

## Performance Tips

1. **Reuse API instance** - Create once, use for multiple operations
2. **Monitor token usage** - Check `result.summary.totalTokens`
3. **Use appropriate sample sizes** - Larger samples = more accurate but slower
4. **Filter tables** - Exclude test/temp tables to reduce analysis time
5. **Resume from checkpoints** - Don't start from scratch if analysis fails

## Support

For issues, feature requests, or documentation:
- GitHub: https://github.com/MemberJunction/MJ
- Docs: https://docs.memberjunction.org
