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
      durationMs: 8000,
      totalCost: 0.0823,
      testResults: [mockTestResult, mockFailedResult],
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
      expect(output).toContain('1/2 passed');
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
