# @memberjunction/react-test-harness

A powerful test harness for React components using Playwright, designed specifically for MemberJunction's React runtime components.

## Overview

This package provides a comprehensive testing solution for React components, allowing you to:
- Load and execute React components in a real browser environment
- Run assertions on rendered output
- Execute tests via CLI or programmatically
- Capture screenshots and console output
- Run in headless or headed mode for debugging

## Installation

```bash
npm install @memberjunction/react-test-harness
```

## CLI Usage

### Run a Single Component

```bash
# Basic usage
mj-react-test run MyComponent.jsx

# With props
mj-react-test run MyComponent.jsx --props '{"title":"Hello","count":42}'

# With screenshot
mj-react-test run MyComponent.jsx --screenshot ./output.png

# In headed mode (visible browser)
mj-react-test run MyComponent.jsx --headed

# With debug output
mj-react-test run MyComponent.jsx --debug

# Wait for specific selector
mj-react-test run MyComponent.jsx --selector "#loaded-content" --timeout 5000
```

### Run Test Files

```bash
# Run a test file with multiple test cases
mj-react-test test my-tests.js

# With options
mj-react-test test my-tests.js --headed --debug
```

### Create Example Files

```bash
# Create example component and test files
mj-react-test create-example

# Create in specific directory
mj-react-test create-example --dir ./my-tests
```

## Programmatic Usage via TypeScript/JavaScript

The test harness is designed to be used as a library in your TypeScript/JavaScript code, not just via CLI. All classes and types are fully exported for programmatic use.

### Importing Classes and Types

```typescript
// Import main classes
import { 
  ReactTestHarness,
  BrowserManager,
  ComponentRunner,
  AssertionHelpers,
  FluentMatcher
} from '@memberjunction/react-test-harness';

// Import types for TypeScript
import type {
  TestHarnessOptions,
  ComponentExecutionResult,
  ComponentExecutionOptions,
  BrowserContextOptions,
  TestCase,
  TestSummary
} from '@memberjunction/react-test-harness';
```

### Basic Component Testing

```typescript
import { ReactTestHarness } from '@memberjunction/react-test-harness';

async function testMyComponent() {
  const harness = new ReactTestHarness({
    headless: true,
    debug: false
  });

  try {
    await harness.initialize();

    // Test component code directly
    const result = await harness.testComponent(`
      const Component = ({ message }) => {
        return <div className="greeting">{message}</div>;
      };
    `, { message: 'Hello World' });

    console.log('Success:', result.success);
    console.log('HTML:', result.html);
    console.log('Console logs:', result.console);
    
    return result;
  } finally {
    await harness.close();
  }
}
```

### Integration into Jest/Mocha/Vitest

```typescript
import { ReactTestHarness, AssertionHelpers } from '@memberjunction/react-test-harness';
import { describe, it, beforeAll, afterAll } from 'vitest';

describe('My React Components', () => {
  let harness: ReactTestHarness;

  beforeAll(async () => {
    harness = new ReactTestHarness({ headless: true });
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('should render greeting component', async () => {
    const result = await harness.testComponent(`
      const Component = ({ name }) => <h1>Hello, {name}!</h1>;
    `, { name: 'World' });

    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Hello, World!');
  });

  it('should handle click events', async () => {
    const result = await harness.testComponent(`
      const Component = () => {
        const [count, setCount] = React.useState(0);
        return (
          <button onClick={() => setCount(count + 1)}>
            Count: {count}
          </button>
        );
      };
    `);

    AssertionHelpers.assertContainsText(result.html, 'Count: 0');
  });
});
```

### Advanced Class Usage

```typescript
import { 
  ReactTestHarness, 
  BrowserManager, 
  ComponentRunner,
  AssertionHelpers 
} from '@memberjunction/react-test-harness';

class ComponentTestSuite {
  private harness: ReactTestHarness;
  private browserManager: BrowserManager;
  private componentRunner: ComponentRunner;

  constructor() {
    // You can also use the underlying classes directly
    this.browserManager = new BrowserManager({
      viewport: { width: 1920, height: 1080 },
      headless: true
    });
    
    this.componentRunner = new ComponentRunner(this.browserManager);
    
    // Or use the high-level harness
    this.harness = new ReactTestHarness({
      headless: true,
      debug: true
    });
  }

  async initialize() {
    await this.harness.initialize();
  }

  async testComponent(code: string, props?: any) {
    const result = await this.harness.testComponent(code, props);
    
    // Use static assertion methods
    AssertionHelpers.assertSuccess(result);
    
    // Or create a fluent matcher
    const matcher = AssertionHelpers.createMatcher(result.html);
    matcher.toContainText('Expected text');
    
    return result;
  }

  async cleanup() {
    await this.harness.close();
  }
}

// Usage
const suite = new ComponentTestSuite();
await suite.initialize();
await suite.testComponent(`const Component = () => <div>Test</div>;`);
await suite.cleanup();
```

### Test Component Files

```typescript
const result = await harness.testComponentFromFile(
  './MyComponent.jsx',
  { title: 'Test', value: 123 },
  {
    waitForSelector: '.loaded',
    timeout: 10000
  }
);
```

### Running Multiple Tests

```typescript
const harness = new ReactTestHarness({ debug: true });

await harness.runTest('Component renders correctly', async () => {
  const result = await harness.testComponent(`
    const Component = () => <h1>Test</h1>;
  `);
  
  const { AssertionHelpers } = harness;
  AssertionHelpers.assertSuccess(result);
  AssertionHelpers.assertContainsText(result.html, 'Test');
});

// Run multiple tests
const summary = await harness.runTests([
  {
    name: 'Has correct elements',
    fn: async () => {
      const result = await harness.testComponent(`
        const Component = () => (
          <div>
            <h1 id="title">Title</h1>
            <button className="action">Click</button>
          </div>
        );
      `);
      
      const matcher = harness.createMatcher(result.html);
      matcher.toHaveElement('#title');
      matcher.toHaveElement('.action');
    }
  },
  {
    name: 'Handles props correctly',
    fn: async () => {
      const result = await harness.testComponent(`
        const Component = ({ items }) => (
          <ul>
            {items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        );
      `, { items: ['A', 'B', 'C'] });
      
      const { AssertionHelpers } = harness;
      AssertionHelpers.assertElementCount(result.html, 'li', 3);
    }
  }
]);

console.log(`Tests passed: ${summary.passed}/${summary.total}`);
```

## Complete API Reference

### ReactTestHarness Class

The main class for testing React components.

```typescript
class ReactTestHarness {
  constructor(options?: TestHarnessOptions);
  
  // Lifecycle methods
  async initialize(): Promise<void>;
  async close(): Promise<void>;
  
  // Component testing methods
  async testComponent(
    componentCode: string,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult>;
  
  async testComponentFromFile(
    filePath: string,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult>;
  
  // Test running methods
  async runTest(name: string, fn: () => Promise<void>): Promise<void>;
  async runTests(tests: TestCase[]): Promise<TestSummary>;
  
  // Utility methods
  getAssertionHelpers(): typeof AssertionHelpers;
  createMatcher(html: string): FluentMatcher;
  async screenshot(path?: string): Promise<Buffer>;
  async evaluateInPage<T>(fn: () => T): Promise<T>;
}
```

### BrowserManager Class

Manages the Playwright browser instance.

```typescript
class BrowserManager {
  constructor(options?: BrowserContextOptions);
  
  async initialize(): Promise<void>;
  async close(): Promise<void>;
  async getPage(): Promise<Page>;
  async navigate(url: string): Promise<void>;
  async evaluateInPage<T>(fn: () => T): Promise<T>;
  async screenshot(path?: string): Promise<Buffer>;
}
```

### ComponentRunner Class

Executes React components in the browser.

```typescript
class ComponentRunner {
  constructor(browserManager: BrowserManager);
  
  async executeComponent(options: ComponentExecutionOptions): Promise<ComponentExecutionResult>;
  async executeComponentFromFile(
    filePath: string,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult>;
}
```

### AssertionHelpers Static Class

Provides assertion methods for testing.

```typescript
class AssertionHelpers {
  // Result assertions
  static assertSuccess(result: ComponentExecutionResult): void;
  static assertNoErrors(result: ComponentExecutionResult): void;
  static assertNoConsoleErrors(console: Array<{ type: string; text: string }>): void;
  
  // Content assertions
  static assertContainsText(html: string, text: string): void;
  static assertNotContainsText(html: string, text: string): void;
  static assertHasElement(html: string, selector: string): void;
  static assertElementCount(html: string, tagName: string, expectedCount: number): void;
  
  // Utility methods
  static containsText(html: string, text: string): boolean;
  static hasElement(html: string, selector: string): boolean;
  static countElements(html: string, tagName: string): number;
  static hasAttribute(html: string, selector: string, attribute: string, value?: string): boolean;
  
  // Fluent matcher creation
  static createMatcher(html: string): FluentMatcher;
}
```

### FluentMatcher Interface

Provides fluent assertions for better readability.

```typescript
interface FluentMatcher {
  toContainText(text: string): void;
  toHaveElement(selector: string): void;
  toHaveElementCount(tagName: string, count: number): void;
  toHaveAttribute(selector: string, attribute: string, value?: string): void;
}
```

## Usage Examples for TypeScript Projects

### Creating a Reusable Test Utility

```typescript
// test-utils.ts
import { ReactTestHarness, AssertionHelpers } from '@memberjunction/react-test-harness';
import type { ComponentExecutionResult } from '@memberjunction/react-test-harness';

export class ReactComponentTester {
  private harness: ReactTestHarness;
  
  constructor() {
    this.harness = new ReactTestHarness({
      headless: process.env.HEADED !== 'true',
      debug: process.env.DEBUG === 'true'
    });
  }
  
  async setup() {
    await this.harness.initialize();
  }
  
  async teardown() {
    await this.harness.close();
  }
  
  async testSkipComponent(
    componentCode: string,
    data: any,
    userState?: any,
    callbacks?: any,
    utilities?: any,
    styles?: any
  ): Promise<ComponentExecutionResult> {
    // Test with Skip-style props structure
    const props = { data, userState, callbacks, utilities, styles };
    return this.harness.testComponent(componentCode, props);
  }
  
  expectSuccess(result: ComponentExecutionResult) {
    AssertionHelpers.assertSuccess(result);
    return this;
  }
  
  expectText(result: ComponentExecutionResult, text: string) {
    AssertionHelpers.assertContainsText(result.html, text);
    return this;
  }
  
  expectNoText(result: ComponentExecutionResult, text: string) {
    AssertionHelpers.assertNotContainsText(result.html, text);
    return this;
  }
}

// Usage in tests
const tester = new ReactComponentTester();
await tester.setup();

const result = await tester.testSkipComponent(
  skipComponentCode,
  { title: 'Test', items: [] },
  { viewMode: 'grid' }
);

tester
  .expectSuccess(result)
  .expectText(result, 'Test')
  .expectNoText(result, 'Error');

await tester.teardown();
```

### Testing MemberJunction Skip Components

```typescript
import { ReactTestHarness } from '@memberjunction/react-test-harness';
import type { 
  SkipComponentRootSpec,
  SkipComponentCallbacks,
  SkipComponentStyles 
} from '@memberjunction/skip-types';

async function testSkipComponent(spec: SkipComponentRootSpec) {
  const harness = new ReactTestHarness({ headless: true });
  
  try {
    await harness.initialize();
    
    // Create Skip-compatible props
    const props = {
      data: spec.data || {},
      userState: spec.userState || {},
      callbacks: {
        RefreshData: () => console.log('Refresh requested'),
        UpdateUserState: (state: any) => console.log('State update:', state),
        OpenEntityRecord: (entity: string, id: string) => console.log('Open:', entity, id),
        NotifyEvent: (event: string, data: any) => console.log('Event:', event, data)
      } as SkipComponentCallbacks,
      utilities: spec.utilities || {},
      styles: spec.styles || {} as SkipComponentStyles
    };
    
    const result = await harness.testComponent(spec.componentCode, props);
    
    if (!result.success) {
      throw new Error(`Component failed: ${result.error}`);
    }
    
    return result;
  } finally {
    await harness.close();
  }
}
```

### CI/CD Integration

```typescript
// ci-test-runner.ts
import { ReactTestHarness } from '@memberjunction/react-test-harness';
import * as fs from 'fs';
import * as path from 'path';

export async function runComponentTests(testDir: string) {
  const harness = new ReactTestHarness({ 
    headless: true,
    screenshotOnError: true,
    screenshotPath: './test-failures/'
  });
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: [] as Array<{ component: string; error: string }>
  };
  
  await harness.initialize();
  
  try {
    const files = fs.readdirSync(testDir)
      .filter(f => f.endsWith('.jsx') || f.endsWith('.tsx'));
    
    for (const file of files) {
      results.total++;
      
      try {
        const result = await harness.testComponentFromFile(
          path.join(testDir, file)
        );
        
        if (result.success) {
          results.passed++;
        } else {
          results.failed++;
          results.failures.push({
            component: file,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        results.failed++;
        results.failures.push({
          component: file,
          error: String(error)
        });
      }
    }
  } finally {
    await harness.close();
  }
  
  return results;
}

// Run in CI
const results = await runComponentTests('./components');
console.log(`Tests: ${results.passed}/${results.total} passed`);

if (results.failed > 0) {
  console.error('Failures:', results.failures);
  process.exit(1);
}
```

## Component Execution Options

```typescript
interface ComponentExecutionOptions {
  componentCode: string;
  props?: Record<string, any>;
  setupCode?: string;           // Additional setup code
  timeout?: number;              // Default: 30000ms
  waitForSelector?: string;      // Wait for element before capture
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
}
```

## Test Harness Options

```typescript
interface TestHarnessOptions {
  headless?: boolean;            // Default: true
  viewport?: {                   // Default: 1280x720
    width: number;
    height: number;
  };
  debug?: boolean;               // Default: false
  screenshotOnError?: boolean;   // Default: true
  screenshotPath?: string;       // Default: './error-screenshot.png'
  userAgent?: string;
  deviceScaleFactor?: number;
  locale?: string;
  timezoneId?: string;
}
```

## Writing Test Files

Test files should export a default async function:

```javascript
// my-component.test.js
export default async function runTests(harness) {
  const { AssertionHelpers } = harness;

  await harness.runTest('Component renders', async () => {
    const result = await harness.testComponentFromFile('./MyComponent.jsx');
    AssertionHelpers.assertSuccess(result);
  });

  await harness.runTest('Component handles props', async () => {
    const result = await harness.testComponentFromFile(
      './MyComponent.jsx',
      { value: 100 }
    );
    AssertionHelpers.assertContainsText(result.html, '100');
  });
}
```

## Advanced Usage

### Custom Browser Context

```typescript
import { BrowserManager } from '@memberjunction/react-test-harness';

const browser = new BrowserManager({
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
  timezoneId: 'America/New_York'
});

await browser.initialize();
const page = await browser.getPage();
```

### Direct Page Evaluation

```typescript
const harness = new ReactTestHarness();
await harness.initialize();

// Evaluate JavaScript in the page context
const result = await harness.evaluateInPage(() => {
  return document.querySelector('h1')?.textContent;
});

// Take screenshots
const screenshot = await harness.screenshot('./output.png');
```

## Limitations

Due to the architecture of the test harness (Node.js controlling a browser via Playwright), there are some important limitations to be aware of. See [docs/limitations.md](./docs/limitations.md) for details on:

- Serialization requirements between Node.js and browser
- BaseEntity method access limitations
- Differences between test and production environments

## Best Practices

1. **Always close the harness** after tests to free resources:
   ```typescript
   try {
     // Run tests
   } finally {
     await harness.close();
   }
   ```

2. **Use waitForSelector** for dynamic content:
   ```typescript
   const result = await harness.testComponent(componentCode, props, {
     waitForSelector: '.async-content',
     timeout: 5000
   });
   ```

3. **Enable debug mode** during development:
   ```typescript
   const harness = new ReactTestHarness({ debug: true });
   ```

4. **Group related tests** for better organization:
   ```typescript
   await harness.runTests([
     { name: 'Feature A - Test 1', fn: async () => { /* ... */ } },
     { name: 'Feature A - Test 2', fn: async () => { /* ... */ } },
     { name: 'Feature B - Test 1', fn: async () => { /* ... */ } },
   ]);
   ```

## Troubleshooting

### Component Not Rendering
- Ensure your component is named `Component` or modify the execution template
- Check for syntax errors in your component code
- Enable debug mode to see console output

### Timeout Errors
- Increase timeout value: `--timeout 60000`
- Use `waitForLoadState: 'networkidle'` for components that load external resources
- Check if the selector in `waitForSelector` actually exists

### Screenshot Issues
- Ensure the screenshot path directory exists
- Use absolute paths for consistent results
- Check file permissions

## License

ISC