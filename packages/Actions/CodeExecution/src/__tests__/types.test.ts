import { describe, it, expect } from 'vitest';
import type { CodeExecutionParams, CodeExecutionResult, JavaScriptExecutionOptions, SandboxContext } from '../types';

/**
 * Type-level tests to verify the shape of exported interfaces.
 * These tests validate that types are properly structured and compile correctly.
 * Since interfaces have no runtime representation, we test by creating conforming objects.
 */
describe('Types', () => {
  describe('CodeExecutionParams', () => {
    it('should require code and language', () => {
      const params: CodeExecutionParams = {
        code: 'console.log("hello")',
        language: 'javascript'
      };
      expect(params.code).toBe('console.log("hello")');
      expect(params.language).toBe('javascript');
    });

    it('should allow optional inputData', () => {
      const params: CodeExecutionParams = {
        code: 'output = input.x;',
        language: 'javascript',
        inputData: { x: 42 }
      };
      expect(params.inputData).toEqual({ x: 42 });
    });

    it('should allow optional timeoutSeconds', () => {
      const params: CodeExecutionParams = {
        code: '',
        language: 'javascript',
        timeoutSeconds: 10
      };
      expect(params.timeoutSeconds).toBe(10);
    });

    it('should allow optional memoryLimitMB', () => {
      const params: CodeExecutionParams = {
        code: '',
        language: 'javascript',
        memoryLimitMB: 64
      };
      expect(params.memoryLimitMB).toBe(64);
    });

    it('should allow all optional fields together', () => {
      const params: CodeExecutionParams = {
        code: 'output = input.count * 2;',
        language: 'javascript',
        inputData: { count: 5 },
        timeoutSeconds: 15,
        memoryLimitMB: 256
      };
      expect(params.code).toBeDefined();
      expect(params.inputData).toBeDefined();
      expect(params.timeoutSeconds).toBe(15);
      expect(params.memoryLimitMB).toBe(256);
    });
  });

  describe('CodeExecutionResult', () => {
    it('should represent a successful result', () => {
      const result: CodeExecutionResult = {
        success: true,
        output: 42,
        logs: ['[LOG] Hello'],
        executionTimeMs: 150
      };
      expect(result.success).toBe(true);
      expect(result.output).toBe(42);
      expect(result.logs).toHaveLength(1);
    });

    it('should represent a failed result with error', () => {
      const result: CodeExecutionResult = {
        success: false,
        error: 'Something went wrong',
        errorType: 'RUNTIME_ERROR'
      };
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorType).toBe('RUNTIME_ERROR');
    });

    it('should support all error types', () => {
      const errorTypes: CodeExecutionResult['errorType'][] = [
        'TIMEOUT',
        'MEMORY_LIMIT',
        'SYNTAX_ERROR',
        'RUNTIME_ERROR',
        'SECURITY_ERROR'
      ];

      for (const errorType of errorTypes) {
        const result: CodeExecutionResult = {
          success: false,
          error: `Error of type ${errorType}`,
          errorType
        };
        expect(result.errorType).toBe(errorType);
      }
    });

    it('should allow minimal success result', () => {
      const result: CodeExecutionResult = {
        success: true
      };
      expect(result.success).toBe(true);
      expect(result.output).toBeUndefined();
      expect(result.logs).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should allow output with various data types', () => {
      const stringResult: CodeExecutionResult = { success: true, output: 'hello' };
      expect(stringResult.output).toBe('hello');

      const numberResult: CodeExecutionResult = { success: true, output: 3.14 };
      expect(numberResult.output).toBe(3.14);

      const objectResult: CodeExecutionResult = { success: true, output: { key: 'value' } };
      expect(objectResult.output).toEqual({ key: 'value' });

      const arrayResult: CodeExecutionResult = { success: true, output: [1, 2, 3] };
      expect(arrayResult.output).toEqual([1, 2, 3]);

      const nullResult: CodeExecutionResult = { success: true, output: null };
      expect(nullResult.output).toBeNull();
    });
  });

  describe('JavaScriptExecutionOptions', () => {
    it('should require timeout and memoryLimit', () => {
      const options: JavaScriptExecutionOptions = {
        timeout: 30,
        memoryLimit: 128
      };
      expect(options.timeout).toBe(30);
      expect(options.memoryLimit).toBe(128);
    });

    it('should allow optional allowedLibraries', () => {
      const options: JavaScriptExecutionOptions = {
        timeout: 30,
        memoryLimit: 128,
        allowedLibraries: ['lodash', 'uuid']
      };
      expect(options.allowedLibraries).toEqual(['lodash', 'uuid']);
    });
  });

  describe('SandboxContext', () => {
    it('should define input, output, and console', () => {
      const context: SandboxContext = {
        input: { data: [1, 2, 3] },
        output: null,
        console: {
          log: () => {},
          error: () => {},
          warn: () => {},
          info: () => {}
        }
      };
      expect(context.input).toBeDefined();
      expect(context.console.log).toBeDefined();
      expect(context.console.error).toBeDefined();
      expect(context.console.warn).toBeDefined();
      expect(context.console.info).toBeDefined();
    });
  });
});
