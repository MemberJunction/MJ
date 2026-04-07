/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal mock for AngularAdapterService
function createMockAdapter(options?: {
  initializeShouldFail?: boolean;
  createRootAvailable?: boolean;
}) {
  const { initializeShouldFail = false, createRootAvailable = true } = options ?? {};

  return {
    initialize: initializeShouldFail
      ? vi.fn().mockRejectedValue(new Error('Failed to load React from all CDN sources'))
      : vi.fn().mockResolvedValue(undefined),
    getRuntimeContext: vi.fn().mockReturnValue({
      ReactDOM: createRootAvailable
        ? { createRoot: vi.fn().mockReturnValue({ unmount: vi.fn() }) }
        : undefined,
    }),
    isInitialized: vi.fn().mockReturnValue(!initializeShouldFail && createRootAvailable),
    destroy: vi.fn(),
  };
}

// Mock external dependencies
vi.mock('@memberjunction/react-runtime', () => ({
  reactRootManager: {
    RegisterHook: vi.fn(),
    cleanup: vi.fn(),
  },
}));

vi.mock('../lib/config/react-debug.config', () => ({
  ReactDebugConfig: {
    getDebugMode: () => false,
  },
}));

vi.mock('../lib/hooks/antd-dropdown-position-hook', () => ({
  createAntdDropdownPositionHook: vi.fn().mockReturnValue({}),
}));

import { ReactBridgeService } from '../lib/services/react-bridge.service';

/** Construct a ReactBridgeService with a mocked adapter. */
function createService(adapter: ReturnType<typeof createMockAdapter>): ReactBridgeService {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const service = new (ReactBridgeService as unknown as new (a: unknown) => ReactBridgeService)(adapter);

  return service;
}

/** Shorten timeouts so tests run fast. */
function setFastTimeouts(
  service: ReactBridgeService,
  overrides?: { maxWaitTime?: number; checkInterval?: number; maxBootstrapRetries?: number; retryBaseDelay?: number }
) {
  const s = service as unknown as Record<string, number>;
  s.maxWaitTime = overrides?.maxWaitTime ?? 150;
  s.checkInterval = overrides?.checkInterval ?? 30;
  s.maxBootstrapRetries = overrides?.maxBootstrapRetries ?? 2;
  s.retryBaseDelay = overrides?.retryBaseDelay ?? 50;
}

describe('ReactBridgeService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('bootstrapWithRetries (via getReactContext)', () => {
    it('should resolve on first attempt when CDN is reachable', async () => {
      const adapter = createMockAdapter();
      const service = createService(adapter);
      setFastTimeouts(service);

      const context = await service.getReactContext();
      expect(context.ReactDOM).toBeDefined();
      expect(adapter.initialize).toHaveBeenCalled();
    });

    it('should retry and succeed when CDN recovers after initial failure', async () => {
      const adapter = createMockAdapter({ initializeShouldFail: true });
      const service = createService(adapter);
      // Use 0 retries so the constructor's bootstrap fails fast
      setFastTimeouts(service, { maxBootstrapRetries: 0 });

      // Wait for constructor's bootstrap to fail (sets bootstrapPromise to null)
      try {
        await (service as unknown as { bootstrapPromise: Promise<void> | null }).bootstrapPromise;
      } catch {
        // Expected — CDN was "down"
      }

      // CDN recovers
      adapter.initialize.mockResolvedValue(undefined);
      adapter.getRuntimeContext.mockReturnValue({
        ReactDOM: { createRoot: vi.fn().mockReturnValue({ unmount: vi.fn() }) },
      });

      // Restore retries and call getReactContext — should create a fresh bootstrap and succeed
      setFastTimeouts(service, { maxBootstrapRetries: 2 });
      const context = await service.getReactContext();
      expect(context.ReactDOM).toBeDefined();
    });

    it('should throw after all bootstrap retries are exhausted', async () => {
      const adapter = createMockAdapter({ initializeShouldFail: true });
      const service = createService(adapter);
      setFastTimeouts(service, { maxBootstrapRetries: 1 });

      await expect(service.getReactContext()).rejects.toThrow(/CDN/);
    });
  });

  describe('waitForReactReady', () => {
    it('should resolve immediately when React is already available', async () => {
      const adapter = createMockAdapter();
      const service = createService(adapter);
      setFastTimeouts(service);

      // Await bootstrap first (same as component flow)
      await service.getReactContext();
      await expect(service.waitForReactReady()).resolves.toBeUndefined();
      expect(service.isReady()).toBe(true);
    });

    it('should resolve after re-bootstrap when createRoot is initially broken (stale cache)', async () => {
      // Bootstrap succeeds (scripts loaded) but createRoot not available (corrupt cache)
      const adapter = createMockAdapter({ createRootAvailable: false });
      const service = createService(adapter);
      setFastTimeouts(service);

      // Wait for initial bootstrap to complete
      await service.getReactContext().catch(() => {});

      // On re-bootstrap (triggered by createRoot poll failure), fix createRoot
      let destroyCount = 0;
      adapter.destroy.mockImplementation(() => {
        destroyCount++;
        // After destroy + re-init, make createRoot available
        adapter.getRuntimeContext.mockReturnValue({
          ReactDOM: { createRoot: vi.fn().mockReturnValue({ unmount: vi.fn() }) },
        });
        adapter.initialize.mockResolvedValue(undefined);
      });

      await expect(service.waitForReactReady()).resolves.toBeUndefined();
      expect(service.isReady()).toBe(true);
      expect(destroyCount).toBeGreaterThanOrEqual(1);
    });

    it('should throw with hard-refresh suggestion after all attempts fail', async () => {
      const adapter = createMockAdapter({ createRootAvailable: false });
      const service = createService(adapter);
      setFastTimeouts(service, { maxBootstrapRetries: 0 });

      await service.getReactContext().catch(() => {});

      await expect(service.waitForReactReady()).rejects.toThrow(/hard refresh/);
    });

    it('should allow subsequent components to resolve via reactReady$ after first succeeds', async () => {
      const adapter = createMockAdapter();
      const service = createService(adapter);
      setFastTimeouts(service);

      await service.getReactContext();
      await service.waitForReactReady();

      // Second call resolves immediately via BehaviorSubject
      await expect(service.waitForReactReady()).resolves.toBeUndefined();
      expect(service.isReady()).toBe(true);
    });
  });
});
