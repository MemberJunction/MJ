import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Mock chalk to pass through strings for testable output
vi.mock('chalk', () => {
  const chainable = (fn: (s: string) => string): Record<string, unknown> => {
    const handler: ProxyHandler<typeof fn> = {
      get(_target, prop) {
        if (prop === 'bold') return chainable(fn);
        if (typeof prop === 'symbol') return undefined;
        return chainable(fn);
      },
      apply(_target, _thisArg, args) {
        return fn(args[0]);
      },
    };
    return new Proxy(fn, handler) as unknown as Record<string, unknown>;
  };
  const identity = (s: string) => s;
  return {
    default: {
      bold: chainable(identity),
      gray: chainable(identity),
      cyan: chainable(identity),
      green: chainable(identity),
      red: chainable(identity),
      yellow: chainable(identity),
      blue: chainable(identity),
    },
  };
});

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

vi.mock('@memberjunction/testing-engine', () => ({
  TestRunResult: class {},
  TestSuiteRunResult: class {},
}));

import { OutputFormatter } from '../utils/output-formatter';

// Helper type to match the expected structure
type TestRunResult = {
  testName: string;
  status: string;
  score: number;
  durationMs: number;
  totalCost: number;
  oracleResults: Array<{ passed: boolean; oracleType: string; message: string; score?: number }>;
  errorMessage?: string;
  targetType: string;
  targetLogId: string;
  passedChecks: number;
  totalChecks: number;
};

type TestSuiteRunResult = {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
  totalCost: number;
  testResults: TestRunResult[];
};

describe('OutputFormatter', () => {
  const mockTestResult: TestRunResult = {
    testName: 'Test Auth Flow',
    status: 'Passed',
    score: 0.95,
    durationMs: 5000,
    totalCost: 0.0523,
    oracleResults: [
      { passed: true, oracleType: 'exactMatch', message: 'Output matches expected', score: 1.0 },
    ],
    targetType: 'agent',
    targetLogId: 'log-001',
    passedChecks: 5,
    totalChecks: 5,
  };

  const mockFailedResult: TestRunResult = {
    testName: 'Test Failing',
    status: 'Failed',
    score: 0.2,
    durationMs: 3000,
    totalCost: 0.03,
    oracleResults: [
      { passed: false, oracleType: 'semanticMatch', message: 'Output does not match', score: 0.2 },
    ],
    errorMessage: 'Assertion failed',
    targetType: 'agent',
    targetLogId: 'log-002',
    passedChecks: 1,
    totalChecks: 5,
  };

  describe('formatTestResult', () => {
    it('should format test result as JSON', () => {
      const output = OutputFormatter.formatTestResult(mockTestResult as never, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.testName).toBe('Test Auth Flow');
      expect(parsed.score).toBe(0.95);
    });

    it('should format test result as markdown', () => {
      const output = OutputFormatter.formatTestResult(mockTestResult as never, 'markdown');
      expect(output).toContain('# Test Run: Test Auth Flow');
      expect(output).toContain('**Status:** PASSED');
      expect(output).toContain('95.0%');
    });

    it('should format test result for console', () => {
      const output = OutputFormatter.formatTestResult(mockTestResult as never, 'console');
      expect(output).toContain('Test Auth Flow');
      expect(output).toContain('[SCORE]');
    });

    it('should include error information in markdown for failed results', () => {
      const output = OutputFormatter.formatTestResult(mockFailedResult as never, 'markdown');
      expect(output).toContain('FAILED');
      expect(output).toContain('Assertion failed');
    });
  });

  describe('formatSuiteResult', () => {
    const suiteResult: TestSuiteRunResult = {
      suiteName: 'Auth Suite',
      totalTests: 2,
      passedTests: 1,
      failedTests: 1,
      skippedTests: 0,
      durationMs: 8000,
      totalCost: 0.0823,
      testResults: [mockTestResult, mockFailedResult],
    };

    /** A test the driver did not execute — a platform-excluded bundle carries a 'gate' oracle. */
    const mockSkippedResult: TestRunResult = {
      testName: 'IT24 Metadata Consistency',
      status: 'Skipped',
      score: 0,
      durationMs: 1,
      totalCost: 0,
      oracleResults: [
        { passed: true, oracleType: 'gate', message: 'Skipped: bundle(s) metadata-consistency do not run on postgresql (declared platform restriction)', score: 0 },
      ],
      targetType: 'Integration Check Bundle',
      targetLogId: 'log-003',
      passedChecks: 0,
      totalChecks: 0,
    };

    const suiteWithSkip: TestSuiteRunResult = {
      suiteName: 'PG Suite',
      totalTests: 2,
      passedTests: 1,
      failedTests: 0,
      skippedTests: 1,
      durationMs: 8000,
      totalCost: 0.0523,
      testResults: [mockTestResult, mockSkippedResult],
    };

    it('should format suite result as JSON', () => {
      const output = OutputFormatter.formatSuiteResult(suiteResult as never, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.suiteName).toBe('Auth Suite');
      expect(parsed.totalTests).toBe(2);
    });

    it('should format suite result as markdown', () => {
      const output = OutputFormatter.formatSuiteResult(suiteResult as never, 'markdown');
      expect(output).toContain('# Test Suite: Auth Suite');
      expect(output).toContain('**Passed:** 1');
      expect(output).toContain('**Failed:** 1');
    });

    it('should format suite result for console', () => {
      const output = OutputFormatter.formatSuiteResult(suiteResult as never, 'console');
      expect(output).toContain('Auth Suite');
      expect(output).toContain('1/2 executed tests passed');
    });

    it('should render a skipped test as SKIP rather than FAIL, with its reason', () => {
      const output = OutputFormatter.formatSuiteResult(suiteWithSkip as never, 'console');
      expect(output).toContain('SKIPPED');
      expect(output).toContain('do not run on postgresql');
      // A skip must never be reported as a failure — that is what made a correctly-configured
      // PostgreSQL run look broken.
      expect(output).not.toContain('[FAILURES]');
      expect(output).toContain('[SKIPPED] 1 test(s) did not execute');
    });

    it('should compute the pass rate over EXECUTED tests, so skips do not depress it', () => {
      const output = OutputFormatter.formatSuiteResult(suiteWithSkip as never, 'console');
      // 1 passed of 1 executed = 100%, not 1 of 2 = 50%.
      expect(output).toContain('1/1 executed tests passed (100.0%)');
    });

    it('should list skipped tests and their reasons in markdown', () => {
      const output = OutputFormatter.formatSuiteResult(suiteWithSkip as never, 'markdown');
      expect(output).toContain('**Skipped:** 1');
      expect(output).toContain('## Skipped');
      expect(output).toContain('do not run on postgresql');
      expect(output).toContain('⊘ SKIP');
      // The Failures section must not claim a skip as a failure.
      expect(output).not.toContain('## Failures');
    });
  });

  describe('isTestFailure', () => {
    it('should treat only genuine failures as failures', () => {
      expect(OutputFormatter.isTestFailure('Failed')).toBe(true);
      expect(OutputFormatter.isTestFailure('Error')).toBe(true);
      expect(OutputFormatter.isTestFailure('Timeout')).toBe(true);
    });

    it('should treat a skip as neither a pass nor a failure', () => {
      expect(OutputFormatter.isTestFailure('Skipped')).toBe(false);
      expect(OutputFormatter.isTestFailure('Passed')).toBe(false);
    });
  });

  describe('writeToFile', () => {
    it('should not write when no file path given', () => {
      OutputFormatter.writeToFile('content');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should write to file when path is provided', () => {
      OutputFormatter.writeToFile('content', '/tmp/output.txt');
      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/output.txt', 'content', 'utf-8');
    });
  });

  describe('formatError', () => {
    it('should format basic error message', () => {
      const output = OutputFormatter.formatError('Something went wrong');
      expect(output).toContain('Something went wrong');
    });

    it('should include error details when Error object provided', () => {
      const error = new Error('Detailed error');
      const output = OutputFormatter.formatError('Operation failed', error);
      expect(output).toContain('Operation failed');
      expect(output).toContain('Detailed error');
    });
  });

  describe('formatSuccess', () => {
    it('should format success message', () => {
      const output = OutputFormatter.formatSuccess('All tests passed');
      expect(output).toContain('All tests passed');
    });
  });

  describe('formatWarning', () => {
    it('should format warning message', () => {
      const output = OutputFormatter.formatWarning('Slow test detected');
      expect(output).toContain('Slow test detected');
    });
  });

  describe('formatInfo', () => {
    it('should format info message', () => {
      const output = OutputFormatter.formatInfo('Running 5 tests');
      expect(output).toContain('Running 5 tests');
    });
  });
});
