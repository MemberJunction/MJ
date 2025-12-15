/**
 * Simple test runner for linter tests
 * Mimics Jest/Mocha API but runs synchronously
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: Error;
  duration: number;
}

export interface SuiteResult {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

class TestRunner {
  private suites: Map<string, TestSuite> = new Map();
  private currentSuite: TestSuite | null = null;

  describe(name: string, fn: () => void | Promise<void>): void {
    const suite = new TestSuite(name);
    this.suites.set(name, suite);
    this.currentSuite = suite;
    fn();
    this.currentSuite = null;
  }

  it(name: string, fn: () => void | Promise<void>): void {
    if (!this.currentSuite) {
      throw new Error('it() must be called inside describe()');
    }
    this.currentSuite.addTest(name, fn);
  }

  beforeEach(fn: () => void | Promise<void>): void {
    if (!this.currentSuite) {
      throw new Error('beforeEach() must be called inside describe()');
    }
    this.currentSuite.setBeforeEach(fn);
  }

  async run(): Promise<SuiteResult[]> {
    const results: SuiteResult[] = [];

    for (const suite of this.suites.values()) {
      const result = await suite.run();
      results.push(result);
    }

    return results;
  }
}

class TestSuite {
  private tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  private beforeEachFn?: () => void | Promise<void>;

  constructor(public name: string) {}

  addTest(name: string, fn: () => void | Promise<void>): void {
    this.tests.push({ name, fn });
  }

  setBeforeEach(fn: () => void | Promise<void>): void {
    this.beforeEachFn = fn;
  }

  async run(): Promise<SuiteResult> {
    const results: TestResult[] = [];
    const suiteStart = Date.now();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📦 ${this.name}`);
    console.log('='.repeat(80));

    for (const test of this.tests) {
      const testStart = Date.now();
      let testPassed = false;
      let testError: Error | null = null;

      // Capture console output during test execution
      const capturedOutput: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        capturedOutput.push(args.map(arg => String(arg)).join(' '));
      };

      try {
        // Run beforeEach if defined
        if (this.beforeEachFn) {
          await this.beforeEachFn();
        }

        // Run test
        await test.fn();
        testPassed = true;
      } catch (error) {
        testPassed = false;
        testError = error as Error;
      } finally {
        // Restore console.log
        console.log = originalLog;
      }

      const duration = Date.now() - testStart;

      // Print test result FIRST, then captured output
      if (testPassed) {
        results.push({
          name: test.name,
          passed: true,
          duration
        });
        console.log(`  ✅ ${test.name} (${duration}ms)`);
      } else {
        results.push({
          name: test.name,
          passed: false,
          error: testError!,
          duration
        });
        console.log(`  ❌ ${test.name} (${duration}ms)`);
        console.log(`     ${testError!.message}`);
      }

      // Print captured output after test status
      if (capturedOutput.length > 0) {
        capturedOutput.forEach(line => console.log(line));
      }
    }

    const duration = Date.now() - suiteStart;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\n  Passed: ${passed}, Failed: ${failed}, Total: ${results.length}`);
    console.log(`  Duration: ${duration}ms\n`);

    return {
      name: this.name,
      tests: results,
      passed,
      failed,
      duration
    };
  }
}

// Global test runner instance
const runner = new TestRunner();

// Export Jest/Mocha-like API
export const describe = runner.describe.bind(runner);
export const it = runner.it.bind(runner);
export const beforeEach = runner.beforeEach.bind(runner);

// Simple assertion library
export function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error('Expected value to be undefined');
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || (actual as any) <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) && typeof actual !== 'string') {
        throw new Error('Expected value to have length property');
      }
      if ((actual as any).length !== expected) {
        throw new Error(`Expected length ${(actual as any).length} to be ${expected}`);
      }
    },
    toContain(expected: any) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}`);
        }
      } else {
        throw new Error('Expected string or array');
      }
    }
  };
}

// Run all tests and return results
export async function runTests(): Promise<SuiteResult[]> {
  return runner.run();
}
