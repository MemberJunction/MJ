import { describe, it, expect } from 'vitest';

import type {
  TestLogMessage,
  TestProgress,
  TestRunOptions,
  SuiteRunOptions,
  OracleResult,
  TestRunResult,
  TestSuiteRunResult,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  RunContextDetails,
  TestVariableDataType,
  TestVariableValueSource,
  TestVariableDefinition,
  TestTypeVariablesSchema,
  TestVariablesConfig,
  TestSuiteVariablesConfig,
  ResolvedTestVariables,
  TestVariableValue,
} from '../types';

describe('TestingFramework/EngineBase types', () => {
  describe('TestLogMessage', () => {
    it('should allow creating log messages at different levels', () => {
      const msg: TestLogMessage = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test started',
      };
      expect(msg.level).toBe('info');
      expect(msg.message).toBe('Test started');
    });
  });

  describe('TestProgress', () => {
    it('should track progress with percentage', () => {
      const progress: TestProgress = {
        step: 'running_oracle',
        percentage: 50,
        message: 'Running oracle checks',
      };
      expect(progress.percentage).toBe(50);
    });
  });

  describe('TestRunOptions', () => {
    it('should allow creating run options', () => {
      const opts: TestRunOptions = {
        verbose: true,
        dryRun: false,
        environment: 'dev',
      };
      expect(opts.verbose).toBe(true);
      expect(opts.environment).toBe('dev');
    });
  });

  describe('SuiteRunOptions', () => {
    it('should extend TestRunOptions with suite-specific options', () => {
      const opts: SuiteRunOptions = {
        parallel: true,
        failFast: false,
        maxParallel: 5,
      };
      expect(opts.parallel).toBe(true);
      expect(opts.maxParallel).toBe(5);
    });
  });

  describe('OracleResult', () => {
    it('should represent a passing oracle check', () => {
      const result: OracleResult = {
        oracleType: 'exactMatch',
        passed: true,
        score: 1.0,
        message: 'Output matches expected',
      };
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    });
  });

  describe('ValidationResult', () => {
    it('should track validation errors and warnings', () => {
      const errors: ValidationError[] = [
        { category: 'configuration', message: 'Missing required field' },
      ];
      const warnings: ValidationWarning[] = [
        { category: 'cost', message: 'Expensive model selected' },
      ];
      const result: ValidationResult = {
        valid: false,
        errors,
        warnings,
      };
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe('RunContextDetails', () => {
    it('should allow capturing execution environment', () => {
      const context: RunContextDetails = {
        osType: 'linux',
        nodeVersion: '24.0.0',
        ciProvider: 'GitHub Actions',
        branch: 'main',
      };
      expect(context.osType).toBe('linux');
      expect(context.ciProvider).toBe('GitHub Actions');
    });
  });

  describe('TestTypeVariablesSchema', () => {
    it('should define a valid schema with variables', () => {
      const schema: TestTypeVariablesSchema = {
        schemaVersion: '1.0',
        variables: [
          {
            name: 'Temperature',
            displayName: 'Temperature',
            dataType: 'number',
            valueSource: 'freeform',
            required: false,
            defaultValue: 0.7,
          },
        ],
      };
      expect(schema.schemaVersion).toBe('1.0');
      expect(schema.variables).toHaveLength(1);
    });
  });

  describe('ResolvedTestVariables', () => {
    it('should track resolved values and their sources', () => {
      const resolved: ResolvedTestVariables = {
        values: { Temperature: 0.5 },
        sources: { Temperature: 'run' },
      };
      expect(resolved.values.Temperature).toBe(0.5);
      expect(resolved.sources.Temperature).toBe('run');
    });
  });

  describe('TestVariableValue type', () => {
    it('should accept string, number, boolean, and Date', () => {
      const vals: TestVariableValue[] = ['hello', 42, true, new Date()];
      expect(vals).toHaveLength(4);
    });
  });
});
