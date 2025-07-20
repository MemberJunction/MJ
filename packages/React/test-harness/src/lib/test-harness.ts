import { BrowserManager, BrowserContextOptions } from './browser-context';
import { ComponentRunner, ComponentExecutionOptions, ComponentExecutionResult, ComponentSpec } from './component-runner';
import { AssertionHelpers } from './assertion-helpers';
import { ComponentRootSpec, ComponentChildSpec } from '@memberjunction/interactive-component-types';

export interface TestHarnessOptions extends BrowserContextOptions {
  debug?: boolean;
  screenshotOnError?: boolean;
  screenshotPath?: string;
}

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
   * Test a root component with its full hierarchy of child components
   */
  async testRootComponent(
    rootSpec: ComponentRootSpec,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult> {
    // Convert ComponentRootSpec to ComponentSpec format
    const spec: ComponentSpec = {
      componentName: rootSpec.componentName,
      componentCode: rootSpec.componentCode,
      childComponents: this.convertSkipChildSpecs(rootSpec.childComponents)
    };

    const result = await this.componentRunner.executeComponent({
      componentSpec: spec,
      props,
      ...options
    });

    if (this.options.debug) {
      console.log('=== Test Execution Debug Info ===');
      console.log('Component:', spec.componentName);
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
   * Test a single child component
   */
  async testChildComponent(
    childSpec: ComponentChildSpec,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult> {
    const spec: ComponentSpec = {
      componentName: childSpec.componentName,
      componentCode: childSpec.componentCode || '',
      childComponents: childSpec.components ? this.convertSkipChildSpecs(childSpec.components) : []
    };

    return this.componentRunner.executeComponent({
      componentSpec: spec,
      props,
      ...options
    });
  }

  /**
   * Convert Skip child specs to test harness ComponentSpec format
   */
  private convertSkipChildSpecs(children: ComponentChildSpec[]): ComponentSpec[] {
    return children.map(child => ({
      componentName: child.componentName,
      componentCode: child.componentCode,
      childComponents: child.components ? this.convertSkipChildSpecs(child.components) : []
    }));
  }

  /**
   * Test a component from a file path
   * This is a convenience method for the CLI
   */
  async testComponentFromFile(
    filePath: string,
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult> {
    const fs = await import('fs');
    const path = await import('path');
    
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Component file not found: ${absolutePath}`);
    }
    
    const componentCode = fs.readFileSync(absolutePath, 'utf-8');
    const componentName = path.basename(absolutePath, path.extname(absolutePath));
    
    // Create a minimal ComponentChildSpec for the file
    const childSpec: ComponentChildSpec = {
      componentName,
      componentCode,
      description: `Component loaded from ${filePath}`,
      exampleUsage: `<${componentName} />`,
      components: []
    };
    
    return this.testChildComponent(childSpec, props, options);
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