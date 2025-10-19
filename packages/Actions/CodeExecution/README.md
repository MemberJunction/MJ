# @memberjunction/code-execution

Sandboxed JavaScript code execution service for MemberJunction AI agents and workflows.

## Overview

This package provides secure, isolated execution of JavaScript code in a sandboxed environment using vm2. It's designed to enable AI agents to generate and run code for data analysis, transformations, and calculations without compromising system security.

## Features

- **Secure Sandboxing**: Executes code in isolated VM with no filesystem or network access
- **Timeout Protection**: Configurable execution timeouts (default: 30 seconds)
- **Safe Library Access**: Curated allowlist of npm packages for data manipulation
- **Console Logging**: Captures console output for debugging
- **Type Safety**: Full TypeScript support with comprehensive interfaces

## Installation

```bash
npm install @memberjunction/code-execution
```

## Usage

### Direct TypeScript Usage

```typescript
import { CodeExecutionService } from '@memberjunction/code-execution';

const service = new CodeExecutionService();

const result = await service.execute({
  code: `
    const sum = input.values.reduce((a, b) => a + b, 0);
    const average = sum / input.values.length;
    output = { sum, average };
  `,
  language: 'javascript',
  inputData: { values: [10, 20, 30, 40, 50] }
});

if (result.success) {
  console.log(result.output); // { sum: 150, average: 30 }
  console.log(result.logs);   // Any console.log output from the code
} else {
  console.error(result.error);
}
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

### What Code CAN Do

- Access input data via `input` variable
- Set output data via `output` variable
- Use console methods (log, error, warn, info)
- Require allowed npm packages
- Perform calculations and data transformations
- Use safe built-in objects (JSON, Math, Date, Array, Object, String, Number, Boolean)

### What Code CANNOT Do

- Access filesystem (`fs` module is mocked)
- Make network requests (`http`, `https`, `net`, `axios` are blocked)
- Spawn processes (`child_process` is blocked)
- Access environment variables
- Use `eval()` or `Function` constructor
- Run indefinitely (timeout enforced)

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

1. **Set Appropriate Timeouts**: Adjust `timeoutSeconds` based on expected workload
2. **Validate Input Data**: Ensure input data is in expected format before execution
3. **Handle Errors Gracefully**: Always check `result.success` before using `result.output`
4. **Use Console Logging**: Add `console.log()` statements for debugging
5. **Leverage Libraries**: Use lodash, mathjs, etc. instead of reinventing the wheel
6. **Keep Code Focused**: Break complex logic into smaller execution chunks

## Limitations

- **Language Support**: Currently only JavaScript (Python may be added in future)
- **Async Code**: No support for `async/await` or Promises (synchronous code only)
- **Memory**: No hard memory limits enforced (relies on Node.js process limits)
- **Library Expansion**: New libraries require code changes (not configurable at runtime)

## Contributing

This package is part of the MemberJunction project. See the main repository for contribution guidelines.

## License

ISC
