# @memberjunction/code-execution

Sandboxed JavaScript code execution service for MemberJunction AI agents and workflows.

## Overview

This package provides secure, isolated execution of JavaScript code in a sandboxed environment using `isolated-vm` with worker process isolation. It's designed to enable AI agents to generate and run code for data analysis, transformations, and calculations without compromising system security or stability.

**⚠️ Security**: This package handles untrusted code execution. Please review [security-research.md](./security-research.md) for comprehensive security analysis, threat model, and implementation details.

## Features

- **Multi-Layer Security**: 5 independent defense layers (process isolation, V8 isolates, module blocking, resource limits, library allowlist)
- **Fault Isolation**: Workers run in separate processes - crashes don't affect main application
- **Automatic Recovery**: Crashed workers automatically restart with circuit breaker protection
- **Timeout Protection**: Configurable execution timeouts (default: 30 seconds)
- **Memory Limits**: Configurable per-execution memory limits (default: 128MB)
- **Safe Library Access**: Curated allowlist of npm packages with inline implementations
- **Console Logging**: Captures console output for debugging
- **Type Safety**: Full TypeScript support with comprehensive interfaces
- **Audit Trail**: Integrated with MemberJunction action logging

## Installation

```bash
npm install @memberjunction/code-execution
```

## Usage

### Direct TypeScript Usage

```typescript
import { CodeExecutionService } from '@memberjunction/code-execution';

// Create service with optional worker pool configuration
const service = new CodeExecutionService({
  poolSize: 2,              // Number of worker processes (default: 2)
  maxQueueSize: 100,        // Max queued requests (default: 100)
  maxCrashesPerWorker: 3,   // Crashes before marking unhealthy (default: 3)
  crashTimeWindow: 60000    // Time window for crash counting (default: 60s)
});

// Initialize the worker pool (can also be done automatically on first execute)
await service.initialize();

// Execute code
const result = await service.execute({
  code: `
    const sum = input.values.reduce((a, b) => a + b, 0);
    const average = sum / input.values.length;
    output = { sum, average };
  `,
  language: 'javascript',
  inputData: { values: [10, 20, 30, 40, 50] },
  timeoutSeconds: 30,       // Optional: execution timeout (default: 30)
  memoryLimitMB: 128        // Optional: memory limit (default: 128)
});

if (result.success) {
  console.log(result.output); // { sum: 150, average: 30 }
  console.log(result.logs);   // Any console.log output from the code
} else {
  console.error(result.error);
  console.error(result.errorType); // 'TIMEOUT' | 'MEMORY_LIMIT' | 'SYNTAX_ERROR' | etc.
}

// Check worker pool health
const stats = service.getStats();
console.log('Active workers:', stats.activeWorkers);
console.log('Busy workers:', stats.busyWorkers);
console.log('Queue length:', stats.queueLength);

// Graceful shutdown (important for clean application exit)
await service.shutdown();
```

### With Actions (for AI Agents)

Agents use the "Execute Code" action:

```json
{
  "type": "Action",
  "action": {
    "name": "Execute Code",
    "params": {
      "code": "const total = input.prices.reduce((sum, p) => sum + p, 0); output = total;",
      "language": "javascript",
      "inputData": "{\"prices\": [10, 20, 30]}"
    }
  }
}
```

## Supported Libraries

The sandbox includes these pre-approved npm packages:

- **lodash** - Data manipulation and utilities
- **date-fns** - Modern date library
- **mathjs** - Advanced mathematics
- **papaparse** - CSV parsing
- **uuid** - UUID generation
- **validator** - String validation and sanitization

### Using Libraries in Code

```typescript
const result = await service.execute({
  code: `
    const _ = require('lodash');
    const { format, addDays } = require('date-fns');
    const math = require('mathjs');

    // Group data by category
    const grouped = _.groupBy(input.data, 'category');

    // Calculate statistics
    const stats = {};
    for (const [category, items] of Object.entries(grouped)) {
      const values = items.map(i => i.value);
      stats[category] = {
        mean: math.mean(values),
        median: math.median(values),
        total: math.sum(values)
      };
    }

    output = stats;
  `,
  language: 'javascript',
  inputData: {
    data: [
      { category: 'A', value: 10 },
      { category: 'B', value: 20 },
      { category: 'A', value: 15 }
    ]
  }
});
```

## Security Model

**For detailed security analysis, see [security-research.md](./security-research.md)**

This package uses a **defense-in-depth** approach with five independent security layers:

1. **Process Isolation** - Workers run in separate OS processes
2. **V8 Isolates** - Each execution runs in isolated V8 context (via `isolated-vm`)
3. **Module Blocking** - Dangerous Node.js modules are blocked
4. **Resource Limits** - Enforced timeout and memory limits
5. **Library Allowlist** - Only pre-vetted libraries available

### What Code CAN Do

- Access input data via `input` variable
- Set output data via `output` variable
- Use console methods (log, error, warn, info)
- Require allowed npm packages (lodash, date-fns, uuid, validator)
- Perform calculations and data transformations
- Use safe built-in objects (JSON, Math, Date, Array, Object, String, Number, Boolean)

### What Code CANNOT Do

- Access filesystem (`fs`, `path` modules blocked)
- Make network requests (`http`, `https`, `net`, `axios` blocked)
- Spawn processes (`child_process`, `cluster` blocked)
- Access system information (`os`, `process` blocked)
- Access environment variables
- Use `eval()` or `Function` constructor (for user code)
- Run indefinitely (timeout enforced)
- Exceed memory limits (128MB default)

## API Reference

### CodeExecutionService

#### `execute(params: CodeExecutionParams): Promise<CodeExecutionResult>`

Executes code in a sandboxed environment.

**Parameters:**

```typescript
interface CodeExecutionParams {
  code: string;              // JavaScript code to execute
  language: 'javascript';    // Currently only 'javascript' supported
  inputData?: any;           // Data available as 'input' variable
  timeoutSeconds?: number;   // Execution timeout (default: 30)
  memoryLimitMB?: number;    // Memory limit (default: 128)
}
```

**Returns:**

```typescript
interface CodeExecutionResult {
  success: boolean;           // Whether execution succeeded
  output?: any;              // Value of 'output' variable
  logs?: string[];           // Console output
  error?: string;            // Error message if failed
  errorType?: 'TIMEOUT' | 'MEMORY_LIMIT' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'SECURITY_ERROR';
  executionTimeMs?: number;  // Execution duration
}
```

## Error Handling

The service handles various error conditions gracefully:

```typescript
const result = await service.execute({
  code: 'invalid syntax here',
  language: 'javascript'
});

if (!result.success) {
  switch (result.errorType) {
    case 'SYNTAX_ERROR':
      console.error('Code has syntax errors:', result.error);
      break;
    case 'TIMEOUT':
      console.error('Code execution timed out');
      break;
    case 'RUNTIME_ERROR':
      console.error('Runtime error:', result.error);
      break;
    case 'SECURITY_ERROR':
      console.error('Security violation:', result.error);
      break;
  }
}
```

## Examples

### Data Analysis

```typescript
const result = await service.execute({
  code: `
    const _ = require('lodash');

    // Calculate key metrics
    const metrics = {
      totalSales: _.sumBy(input.sales, 'amount'),
      avgSale: _.meanBy(input.sales, 'amount'),
      topProducts: _.chain(input.sales)
        .groupBy('product')
        .map((items, product) => ({
          product,
          revenue: _.sumBy(items, 'amount')
        }))
        .orderBy('revenue', 'desc')
        .take(5)
        .value()
    };

    output = metrics;
  `,
  language: 'javascript',
  inputData: {
    sales: [
      { product: 'Widget', amount: 100 },
      { product: 'Gadget', amount: 200 },
      // ... more sales
    ]
  }
});
```

### Date Manipulation

```typescript
const result = await service.execute({
  code: `
    const { format, addDays, differenceInDays } = require('date-fns');

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);

    output = {
      duration: differenceInDays(end, start),
      milestones: [
        format(addDays(start, 30), 'yyyy-MM-dd'),
        format(addDays(start, 60), 'yyyy-MM-dd'),
        format(addDays(start, 90), 'yyyy-MM-dd')
      ]
    };
  `,
  language: 'javascript',
  inputData: {
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  }
});
```

### CSV Processing

```typescript
const result = await service.execute({
  code: `
    const Papa = require('papaparse');

    const parsed = Papa.parse(input.csvData, {
      header: true,
      dynamicTyping: true
    });

    // Filter and transform
    const processed = parsed.data
      .filter(row => row.status === 'active')
      .map(row => ({
        id: row.id,
        name: row.name,
        value: row.value * 1.1 // 10% markup
      }));

    output = processed;
  `,
  language: 'javascript',
  inputData: {
    csvData: 'id,name,value,status\n1,Item A,100,active\n2,Item B,200,inactive'
  }
});
```

## Best Practices

1. **Initialize Once**: Create one `CodeExecutionService` instance and reuse it (worker pool is shared)
2. **Shutdown Gracefully**: Call `service.shutdown()` during application shutdown to clean up workers
3. **Set Appropriate Timeouts**: Adjust `timeoutSeconds` based on expected workload
4. **Validate Input Data**: Ensure input data is in expected format before execution
5. **Handle Errors Gracefully**: Always check `result.success` before using `result.output`
6. **Monitor Pool Health**: Use `service.getStats()` to monitor worker health and queue depth
7. **Use Console Logging**: Add `console.log()` statements for debugging
8. **Leverage Libraries**: Use lodash, date-fns, etc. instead of reinventing the wheel
9. **Keep Code Focused**: Break complex logic into smaller execution chunks
10. **Review Security Docs**: Read [security-research.md](./security-research.md) for threat model and security considerations

## Architecture

### Worker Process Pool

The service maintains a pool of worker processes for fault isolation:

```
┌─────────────────────────────────────┐
│   Main Application Process          │
│                                      │
│  ┌────────────────────────────┐    │
│  │  CodeExecutionService       │    │
│  │                              │    │
│  │  ┌──────────────────────┐   │    │
│  │  │   WorkerPool         │   │    │
│  │  │   - Queue Requests   │   │    │
│  │  │   - Monitor Health   │   │    │
│  │  │   - Auto Restart     │   │    │
│  │  └──────────────────────┘   │    │
│  └────────────────────────────┘    │
│          │          │               │
└──────────┼──────────┼───────────────┘
           │          │ IPC (JSON)
    ┌──────▼───┐  ┌───▼──────┐
    │ Worker 1 │  │ Worker 2 │  (Separate OS Processes)
    │          │  │          │
    │ isolated │  │ isolated │
    │   -vm    │  │   -vm    │
    │          │  │          │
    └──────────┘  └──────────┘
```

### Benefits of Process Isolation

- **Fault Tolerance**: Worker crashes don't affect main app or other workers
- **Resource Isolation**: Per-process memory limits and cleanup
- **Automatic Recovery**: Crashed workers restart automatically
- **Circuit Breaker**: Too many crashes → worker disabled to prevent crash loops

## Limitations

- **Language Support**: Currently only JavaScript (Python may be added in future)
- **Async Code**: No support for `async/await` or Promises (synchronous code only)
- **Library Expansion**: New libraries require code changes (not configurable at runtime)
- **Throughput**: ~100-200 executions/sec per worker (horizontal scaling recommended for higher loads)

## Contributing

This package is part of the MemberJunction project. See the main repository for contribution guidelines.

## License

ISC
