import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { ConversionPipeline } from '../ConversionPipeline.js';
import type { ILLMFallback, IDatabaseVerifier, ConversionPipelineConfig } from '../types.js';

let pythonAvailable = false;

beforeAll(() => {
  try {
    execSync('python3 -c "import sqlglot; import fastapi; import uvicorn"', {
      stdio: 'pipe',
    });
    pythonAvailable = true;
  } catch {
    console.warn('Skipping ConversionPipeline integration tests: Python/sqlglot not available');
  }
}, 10000);

function makeConfig(overrides: Partial<ConversionPipelineConfig> & { source: string }): ConversionPipelineConfig {
  return {
    sourceIsFile: false,
    sourceDialect: 'tsql',
    targetDialect: 'postgres',
    verify: false,
    llmFallback: false,
    audit: false,
    stopOnError: false,
    maxLLMRetries: 3,
    pretty: true,
    ...overrides,
  };
}

describe('ConversionPipeline', () => {
  // ============================================================
  // Basic conversion
  // ============================================================
  describe('Basic conversion', () => {
    it('should convert a simple SELECT statement', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({ source: 'SELECT TOP 10 * FROM Users' })
      );
      expect(result.success).toBe(true);
      expect(result.totalStatements).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.sqlglotCount).toBe(1);
      expect(result.outputSQL.toUpperCase()).toContain('LIMIT');
    });

    it('should convert multiple statements', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const sql = "SELECT ISNULL(a, 0) FROM t\nGO\nSELECT TOP 5 * FROM u\nGO";
      const result = await pipeline.Run(makeConfig({ source: sql }));
      expect(result.success).toBe(true);
      expect(result.totalStatements).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.outputSQL.toUpperCase()).toContain('COALESCE');
      expect(result.outputSQL.toUpperCase()).toContain('LIMIT');
    });

    it('should handle empty input', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(makeConfig({ source: '' }));
      expect(result.success).toBe(true);
      expect(result.totalStatements).toBe(0);
    });

    it('should track duration', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({ source: 'SELECT 1' })
      );
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Progress reporting
  // ============================================================
  describe('Progress reporting', () => {
    it('should call onProgress callback', async () => {
      if (!pythonAvailable) return;
      const messages: string[] = [];
      const pipeline = new ConversionPipeline();
      await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          onProgress: (msg) => messages.push(msg),
        })
      );
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.includes('Reading source'))).toBe(true);
    });
  });

  // ============================================================
  // Error handling
  // ============================================================
  describe('Error handling', () => {
    it('should continue on error by default', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      // Mix of valid and potentially failing SQL
      const sql = "SELECT 1\nGO\nSELECT GETDATE()\nGO";
      const result = await pipeline.Run(makeConfig({ source: sql }));
      expect(result.totalStatements).toBe(2);
    });

    it('should stop on error when configured', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const sql = "SELECT 1\nGO\nSELECT 2\nGO\nSELECT 3\nGO";
      const result = await pipeline.Run(
        makeConfig({ source: sql, stopOnError: true })
      );
      // All should succeed since these are simple statements
      expect(result.totalStatements).toBe(3);
    });
  });

  // ============================================================
  // Statistics accuracy
  // ============================================================
  describe('Statistics', () => {
    it('should accurately count methods', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const sql = "SELECT 1\nGO\nSELECT TOP 5 * FROM t\nGO\nSELECT GETDATE()\nGO";
      const result = await pipeline.Run(makeConfig({ source: sql }));
      expect(result.totalStatements).toBe(3);
      expect(result.sqlglotCount).toBe(result.successCount);
      expect(result.llmCount).toBe(0);
      expect(result.passthroughCount).toBe(0);
      expect(result.successCount + result.failureCount).toBe(result.totalStatements);
    });

    it('should set per-statement method to sqlglot', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({ source: 'SELECT 1' })
      );
      expect(result.statements[0].method).toBe('sqlglot');
      expect(result.statements[0].success).toBe(true);
    });
  });

  // ============================================================
  // LLM fallback (mocked)
  // ============================================================
  describe('LLM fallback', () => {
    it('should call LLM fallback when enabled and sqlglot fails verification', async () => {
      if (!pythonAvailable) return;

      const mockLLM: ILLMFallback = {
        FixConversion: vi.fn().mockResolvedValue({
          sql: 'SELECT 1 /* fixed by LLM */',
          model: 'test-model',
        }),
      };

      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn()
          .mockResolvedValueOnce('syntax error') // First verify fails (sqlglot output)
          .mockResolvedValueOnce(null),            // Second verify succeeds (LLM output)
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          llmFallback: true,
          llmFallbackHandler: mockLLM,
          verifier: mockVerifier,
        })
      );

      expect(result.statements[0].method).toBe('llm');
      expect(result.statements[0].success).toBe(true);
      expect(result.statements[0].llmModel).toBe('test-model');
      expect(result.llmCount).toBe(1);
    });

    it('should handle LLM returning null', async () => {
      if (!pythonAvailable) return;

      const mockLLM: ILLMFallback = {
        FixConversion: vi.fn().mockResolvedValue({ sql: null }),
      };

      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn().mockResolvedValue('syntax error'),
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          llmFallback: true,
          llmFallbackHandler: mockLLM,
          verifier: mockVerifier,
        })
      );

      expect(result.statements[0].success).toBe(false);
      expect(result.statements[0].method).toBe('failed');
    });

    it('should retry LLM up to maxLLMRetries', async () => {
      if (!pythonAvailable) return;

      const fixFn = vi.fn()
        .mockResolvedValueOnce({ sql: 'attempt 1', model: 'm1' })
        .mockResolvedValueOnce({ sql: 'attempt 2', model: 'm2' })
        .mockResolvedValueOnce({ sql: 'attempt 3 -- final', model: 'm3' });

      const mockLLM: ILLMFallback = { FixConversion: fixFn };

      const verifyFn = vi.fn()
        .mockResolvedValueOnce('sqlglot output failed')   // sqlglot output fails
        .mockResolvedValueOnce('attempt 1 failed')        // LLM attempt 1 fails
        .mockResolvedValueOnce('attempt 2 failed')        // LLM attempt 2 fails
        .mockResolvedValueOnce(null);                     // LLM attempt 3 succeeds

      const mockVerifier: IDatabaseVerifier = {
        Verify: verifyFn,
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          llmFallback: true,
          llmFallbackHandler: mockLLM,
          verifier: mockVerifier,
          maxLLMRetries: 3,
        })
      );

      expect(fixFn).toHaveBeenCalledTimes(3);
      expect(result.statements[0].success).toBe(true);
      expect(result.statements[0].method).toBe('llm');
    });
  });

  // ============================================================
  // Database verification (mocked)
  // ============================================================
  describe('Database verification', () => {
    it('should mark as verified when verification passes', async () => {
      if (!pythonAvailable) return;

      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn().mockResolvedValue(null),
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          verifier: mockVerifier,
        })
      );

      expect(result.statements[0].verified).toBe(true);
      expect(result.statements[0].success).toBe(true);
    });

    it('should mark as failed when verification fails without LLM fallback', async () => {
      if (!pythonAvailable) return;

      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn().mockResolvedValue('ERROR: syntax error at position 5'),
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          verifier: mockVerifier,
          llmFallback: false,
        })
      );

      expect(result.statements[0].success).toBe(false);
      expect(result.statements[0].error).toContain('Verification failed');
    });

    it('should call Close on verifier after completion', async () => {
      if (!pythonAvailable) return;

      const closeFn = vi.fn().mockResolvedValue(undefined);
      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn().mockResolvedValue(null),
        Close: closeFn,
      };

      const pipeline = new ConversionPipeline();
      await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          verifier: mockVerifier,
        })
      );

      expect(closeFn).toHaveBeenCalledOnce();
    });
  });

  // ============================================================
  // Output formatting
  // ============================================================
  describe('Output formatting', () => {
    it('should join statements with semicolons', async () => {
      if (!pythonAvailable) return;
      const pipeline = new ConversionPipeline();
      const sql = "SELECT 1\nGO\nSELECT 2\nGO";
      const result = await pipeline.Run(makeConfig({ source: sql }));
      expect(result.outputSQL).toContain(';');
    });

    it('should include failure comments for failed statements', async () => {
      if (!pythonAvailable) return;

      const mockVerifier: IDatabaseVerifier = {
        Verify: vi.fn().mockResolvedValue('ERROR: bad sql'),
        Close: vi.fn().mockResolvedValue(undefined),
      };

      const pipeline = new ConversionPipeline();
      const result = await pipeline.Run(
        makeConfig({
          source: 'SELECT 1',
          verify: true,
          verifier: mockVerifier,
        })
      );

      expect(result.outputSQL).toContain('CONVERSION FAILED');
    });
  });
});
