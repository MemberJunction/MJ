import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeExecutionService } from '../CodeExecutionService';
import { CodeExecutionParams, CodeExecutionResult } from '../types';
import { WorkerPool } from '../WorkerPool';
import { CODE_EXECUTION_LIMITS } from '../limits';
import { LogStatus } from '@memberjunction/core';

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn()
}));

// Mock the WorkerPool to avoid actually forking child processes
vi.mock('../WorkerPool', () => {
  const MockWorkerPool = vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue({
        success: true,
        output: 'test output',
        executionTimeMs: 10
      }),
      getStats: vi.fn().mockReturnValue({
        totalWorkers: 2,
        activeWorkers: 2,
        busyWorkers: 0,
        queueLength: 0
      }),
      shutdown: vi.fn().mockResolvedValue(undefined)
    };
  });

  return {
    WorkerPool: MockWorkerPool
  };
});

describe('CodeExecutionService', () => {
  let service: CodeExecutionService;
  let mockPoolInstance: ReturnType<typeof getMockPool>;

  function getMockPool() {
    // Access the mocked pool instance through the service
    const pool = (service as Record<string, unknown>)['workerPool'] as {
      initialize: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
      getStats: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
    };
    return pool;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CodeExecutionService();
    mockPoolInstance = getMockPool();
  });

  describe('constructor', () => {
    it('should create a service with default options', () => {
      const svc = new CodeExecutionService();
      expect(svc).toBeDefined();
      expect(WorkerPool).toHaveBeenCalledWith({});
    });

    it('should pass options to WorkerPool', () => {
      const options = { poolSize: 4, maxQueueSize: 50 };
      const svc = new CodeExecutionService(options);
      expect(svc).toBeDefined();
      expect(WorkerPool).toHaveBeenCalledWith(options);
    });

    it('should not be initialized on construction', () => {
      const svc = new CodeExecutionService();
      const initialized = (svc as Record<string, unknown>)['initialized'];
      expect(initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize the worker pool', async () => {
      await service.initialize();
      expect(mockPoolInstance.initialize).toHaveBeenCalledOnce();
    });

    it('should set initialized flag to true', async () => {
      await service.initialize();
      const initialized = (service as Record<string, unknown>)['initialized'];
      expect(initialized).toBe(true);
    });

    it('should not initialize twice on repeated calls', async () => {
      await service.initialize();
      await service.initialize();
      expect(mockPoolInstance.initialize).toHaveBeenCalledOnce();
    });
  });

  describe('execute', () => {
    it('should auto-initialize if not already initialized', async () => {
      const params: CodeExecutionParams = {
        code: 'output = 42;',
        language: 'javascript'
      };

      await service.execute(params);
      expect(mockPoolInstance.initialize).toHaveBeenCalledOnce();
    });

    it('should not re-initialize on second execute call', async () => {
      const params: CodeExecutionParams = {
        code: 'output = 42;',
        language: 'javascript'
      };

      await service.execute(params);
      await service.execute(params);
      expect(mockPoolInstance.initialize).toHaveBeenCalledOnce();
    });

    it('should return error for empty code', async () => {
      const params: CodeExecutionParams = {
        code: '',
        language: 'javascript'
      };

      const result = await service.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code parameter is required');
      expect(result.errorType).toBe('RUNTIME_ERROR');
    });

    it('should return error for non-string code', async () => {
      const params = {
        code: null,
        language: 'javascript'
      } as unknown as CodeExecutionParams;

      const result = await service.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code parameter is required');
    });

    it('should return error for unsupported language', async () => {
      const params = {
        code: 'print("hello")',
        language: 'python'
      } as unknown as CodeExecutionParams;

      const result = await service.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported language');
      expect(result.error).toContain('python');
      expect(result.errorType).toBe('RUNTIME_ERROR');
    });

    it('should delegate valid requests to worker pool', async () => {
      const params: CodeExecutionParams = {
        code: 'output = 42;',
        language: 'javascript'
      };

      const result = await service.execute(params);

      expect(mockPoolInstance.execute).toHaveBeenCalledWith(params);
      expect(result.success).toBe(true);
      expect(result.output).toBe('test output');
    });

    it('should pass input data to worker pool', async () => {
      const params: CodeExecutionParams = {
        code: 'output = input.name;',
        language: 'javascript',
        inputData: { name: 'test' }
      };

      await service.execute(params);
      expect(mockPoolInstance.execute).toHaveBeenCalledWith(params);
    });

    it('should pass timeout and memory limit to worker pool', async () => {
      const params: CodeExecutionParams = {
        code: 'output = 1;',
        language: 'javascript',
        timeoutSeconds: 10,
        memoryLimitMB: 64
      };

      await service.execute(params);
      expect(mockPoolInstance.execute).toHaveBeenCalledWith(params);
    });

    describe('limit policy', () => {
      const run = async (extra: Partial<CodeExecutionParams>) => {
        await service.execute({ code: 'output = 1;', language: 'javascript', ...extra });
        return mockPoolInstance.execute.mock.calls[0][0] as CodeExecutionParams;
      };

      it('clamps an enormous timeout to the ceiling', async () => {
        const sent = await run({ timeoutSeconds: 86_400 });
        expect(sent.timeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.MaxSeconds);
      });

      it('clamps an enormous memory limit to the ceiling', async () => {
        const sent = await run({ memoryLimitMB: 8192 });
        expect(sent.memoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.MaxMB);
      });

      it('treats Infinity as above the ceiling rather than "no limit"', async () => {
        const sent = await run({ timeoutSeconds: Infinity, memoryLimitMB: Infinity });
        expect(sent.timeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.MaxSeconds);
        expect(sent.memoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.MaxMB);
      });

      it('replaces zero, negative and NaN limits with the default', async () => {
        const zero = await run({ timeoutSeconds: 0, memoryLimitMB: -5 });
        expect(zero.timeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.DefaultSeconds);
        expect(zero.memoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.DefaultMB);

        mockPoolInstance.execute.mockClear();
        const nan = await run({ timeoutSeconds: NaN });
        expect(nan.timeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.DefaultSeconds);
      });

      it('raises a below-floor memory limit to the floor', async () => {
        const sent = await run({ memoryLimitMB: 1 });
        expect(sent.memoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.MinMB);
      });

      it('passes in-range limits through unchanged, as the same object', async () => {
        const params: CodeExecutionParams = {
          code: 'output = 1;',
          language: 'javascript',
          timeoutSeconds: 45,
          memoryLimitMB: 256
        };
        await service.execute(params);
        expect(mockPoolInstance.execute.mock.calls[0][0]).toBe(params);
      });

      it('does not invent limits the caller did not supply', async () => {
        const sent = await run({});
        expect(sent).not.toHaveProperty('timeoutSeconds');
        expect(sent).not.toHaveProperty('memoryLimitMB');
      });

      it('preserves bridge handlers and the abort signal when it clamps', async () => {
        const handler = vi.fn();
        const controller = new AbortController();
        const sent = await run({
          timeoutSeconds: 99_999,
          bridgeHandlers: { ping: handler },
          abortSignal: controller.signal
        });
        expect(sent.bridgeHandlers?.ping).toBe(handler);
        expect(sent.abortSignal).toBe(controller.signal);
      });

      it('logs when it clamps', async () => {
        await run({ timeoutSeconds: 99_999 });
        expect(LogStatus).toHaveBeenCalledWith(expect.stringContaining('timeoutSeconds=99999 is above-maximum'));
      });
    });

    it('should not call execute on worker pool for invalid params', async () => {
      const params: CodeExecutionParams = {
        code: '',
        language: 'javascript'
      };

      await service.execute(params);
      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should delegate to worker pool getStats', () => {
      const stats = service.getStats();

      expect(mockPoolInstance.getStats).toHaveBeenCalledOnce();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.activeWorkers).toBe(2);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.queueLength).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shut down the worker pool when initialized', async () => {
      await service.initialize();
      await service.shutdown();

      expect(mockPoolInstance.shutdown).toHaveBeenCalledOnce();
    });

    it('should set initialized to false after shutdown', async () => {
      await service.initialize();
      await service.shutdown();

      const initialized = (service as Record<string, unknown>)['initialized'];
      expect(initialized).toBe(false);
    });

    it('should not shut down if never initialized', async () => {
      await service.shutdown();
      expect(mockPoolInstance.shutdown).not.toHaveBeenCalled();
    });

    it('should allow re-initialization after shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      await service.initialize();

      expect(mockPoolInstance.initialize).toHaveBeenCalledTimes(2);
    });
  });
});
