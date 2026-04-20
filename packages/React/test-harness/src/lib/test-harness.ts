import { BrowserManager, BrowserContextOptions } from './browser-context';
import { ComponentExecutionOptions, ComponentExecutionResult, ComponentRunner } from './component-runner';
import { AssertionHelpers } from './assertion-helpers';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

export interface TestHarnessOptions extends BrowserContextOptions {
  debug?: boolean;
  screenshotOnError?: boolean;
  screenshotPath?: string;
  componentLibraries?: any[]; // Array of MJComponentLibraryEntity objects (can be serialized JSON)
}

/**
 * React Test Harness for testing React components in an isolated browser environment
 * 
 * IMPORTANT: Parallel Testing Limitation
 * ----------------------------------------
 * This test harness uses a single browser page instance and is NOT safe for parallel test execution
 * on the same instance. For parallel testing, create separate ReactTestHarness instances:
 * 
 * @example
 * // ✅ CORRECT - Parallel testing with separate instances
 * const results = await Promise.all(tests.map(async (test) => {
 *   const harness = new ReactTestHarness(options);
 *   await harness.initialize();
 *   try {
 *     return await harness.testComponent(test);
 *   } finally {
 *     await harness.close();
 *   }
 * }));
 * 
 * @example  
 * // ❌ WRONG - Parallel testing on same instance (will cause conflicts)
 * const harness = new ReactTestHarness(options);
 * await harness.initialize();
 * const results = await Promise.all(tests.map(test => harness.testComponent(test)));
 */
export class ReactTestHarness {
  private browserManager: BrowserManager;
  private componentRunner: ComponentRunner;
  private options: TestHarnessOptions;

  constructor(options: TestHarnessOptions = {}) {
    this.options = {
      headless: true,
      debug: false,
      screenshotOnError: true,
      ...options
    };

    this.browserManager = new BrowserManager(this.options);
    this.componentRunner = new ComponentRunner(this.browserManager);
  }

  async initialize(): Promise<void> {
    await this.browserManager.initialize();
  }

  /**
   * Test a component with its full hierarchy of child components
   */
  async testComponent(
    options: ComponentExecutionOptions
  ): Promise<ComponentExecutionResult> {
    // Check if contextUser is required for library lint rules
    const spec = options.componentSpec;
    if (spec.libraries && spec.libraries.length > 0 && !options.contextUser) {
      throw new Error('contextUser is required in ComponentExecutionOptions when testing components with library dependencies. This is needed to load library-specific lint rules from the database.');
    }
    
    // First, lint the component code
    if (spec.code) {
      const lintResult = await this.componentRunner.lintComponent(
        spec.code,
        spec.name,
        spec,
        options.isRootComponent,
        options.contextUser,
        options
      );

      if (lintResult.hasErrors) {
        // Return early with lint errors
        return {
          success: false,
          html: '',
          errors: lintResult.violations,
          warnings: [],
          console: [],
          executionTime: 0,
          lintViolations: lintResult.violations
        };
      }
    }

    const result = await this.componentRunner.executeComponent(options);

    if (this.options.debug) {
      console.log('=== Test Execution Debug Info ===');
      console.log('Component:', spec.name);
      console.log('Success:', result.success);
      console.log('Execution Time:', result.executionTime, 'ms');
      console.log('Errors:', result.errors);
      console.log('Console Output:', result.console);
      console.log('================================');
    }

    if (!result.success && this.options.screenshotOnError && result.screenshot) {
      const screenshotPath = this.options.screenshotPath || './error-screenshot.png';
      const fs = await import('fs');
      // Ensure the screenshot Buffer is properly typed for writeFileSync
      fs.writeFileSync(screenshotPath, result.screenshot as any);
      console.log(`Screenshot saved to: ${screenshotPath}`);
    }

    return result;
  }


  /**
   * Test a simple component from code string
   * This is a convenience method for testing component code directly
   */
  async testComponentCode(
    componentCode: string,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult> {
    const componentName = 'Component';
    const spec = {
      name: componentName,
      code: componentCode,
      dependencies: [],
      description: 'Test component',
      title: componentName,
      type: 'React',
      functionalRequirements: {},
      technicalDesign: {},
      dataRequirements: {},
      exampleUsage: ''
    } as any as ComponentSpec;
    
    const fullOptions: ComponentExecutionOptions = {
      componentSpec: spec,
      props: props || {},
      contextUser: options?.contextUser || { Name: 'Test User', Email: 'test@test.com' } as any,
      ...options
    };
    
    return this.testComponent(fullOptions);
  }

  /**
   * Test a component from a file path
   * This is a convenience method for the CLI
   */
  async testComponentFromFile(
    filePath: string,
    props: Record<string, any>,
    options: Omit<ComponentExecutionOptions, 'componentSpec'>
  ): Promise<ComponentExecutionResult> {
    const fs = await import('fs');
    const path = await import('path');
    
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Component file not found: ${absolutePath}`);
    }
    
    const componentCode = fs.readFileSync(absolutePath, 'utf-8');
    const componentName = path.basename(absolutePath, path.extname(absolutePath));
    
    // Create a minimal ComponentSpec for the file
    const spec: ComponentSpec = {
      name: componentName,
      location: 'embedded',
      code: componentCode,
      description: `Component loaded from ${filePath}`,
      title: componentName,
      type: 'component',
      functionalRequirements: '',
      technicalDesign: '',
      exampleUsage: `<${componentName} />`,
      dependencies: []
    };
    
    return this.testComponent({
      ...options,
      componentSpec: spec
    });
  }

  async runTest(
    name: string,
    testFn: () => Promise<void>
  ): Promise<{ name: string; passed: boolean; error?: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      
      if (this.options.debug) {
        console.log(`✓ ${name} (${duration}ms)`);
      }
      
      return { name, passed: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.options.debug) {
        console.log(`✗ ${name} (${duration}ms)`);
        console.error(`  Error: ${errorMessage}`);
      }
      
      return { name, passed: false, error: errorMessage, duration };
    }
  }

  async runTests(tests: Array<{ name: string; fn: () => Promise<void> }>): Promise<{
    total: number;
    passed: number;
    failed: number;
    duration: number;
    results: Array<{ name: string; passed: boolean; error?: string; duration: number }>;
  }> {
    const startTime = Date.now();
    const results = [];

    for (const test of tests) {
      const result = await this.runTest(test.name, test.fn);
      results.push(result);
    }

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const duration = Date.now() - startTime;

    if (this.options.debug) {
      console.log('\n=== Test Summary ===');
      console.log(`Total: ${total}`);
      console.log(`Passed: ${passed}`);
      console.log(`Failed: ${failed}`);
      console.log(`Duration: ${duration}ms`);
      console.log('==================');
    }

    return { total, passed, failed, duration, results };
  }

  getAssertionHelpers() {
    return AssertionHelpers;
  }

  createMatcher(html: string) {
    return AssertionHelpers.createMatcher(html);
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  async screenshot(path?: string): Promise<Buffer> {
    return await this.browserManager.screenshot(path);
  }

  async reload(): Promise<void> {
    await this.browserManager.reload();
  }

  async navigateTo(url: string): Promise<void> {
    await this.browserManager.navigateTo(url);
  }

  async evaluateInPage<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
    return await this.browserManager.evaluateInPage(fn, ...args);
  }
}