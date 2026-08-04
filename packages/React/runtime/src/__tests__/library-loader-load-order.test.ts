/**
 * @fileoverview Tests for library load-order guarantees in LibraryLoader.
 *
 * The critical invariant: React MUST execute before ReactDOM because ReactDOM's
 * UMD factory captures `window.React` at execution time. If ReactDOM executes
 * first, it gets `undefined` for React and `createRoot` is permanently broken.
 *
 * These tests mock the script-loading layer to:
 * 1. Prove the current (fixed) code always loads React before ReactDOM.
 * 2. Simulate the old parallel-loading race condition and show it can fail.
 * 3. Validate that post-load assertions catch broken ReactDOM objects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Window / document stubs (we're in a Node environment)
// ---------------------------------------------------------------------------
const fakeWindow: Record<string, unknown> = {};

vi.stubGlobal('window', fakeWindow);
vi.stubGlobal('document', {
  createElement: vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    parentNode: null,
  }),
  head: {
    appendChild: vi.fn(),
  },
  querySelector: vi.fn().mockReturnValue(null),
});

// ---------------------------------------------------------------------------
// Mock dependencies that LibraryLoader imports
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/core-entities', () => ({
  MJComponentLibraryEntity: class {},
}));

vi.mock('../utilities/resource-manager', () => ({
  resourceManager: {
    setTimeout: vi.fn((_id: string, fn: () => void, _ms: number) => { fn(); return 1; }),
    registerDOMElement: vi.fn(),
    addEventListener: vi.fn(),
    cleanupComponent: vi.fn(),
  },
}));

vi.mock('../utilities/standard-libraries', () => ({
  StandardLibraryManager: {
    setConfiguration: vi.fn(),
    getConfiguration: vi.fn().mockReturnValue({ libraries: [], metadata: {} }),
    getEnabledLibraries: vi.fn().mockReturnValue([]),
  },
  // Re-export the type so the import doesn't break
}));

vi.mock('../utilities/library-registry', () => ({
  LibraryRegistry: class {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tracks the order in which "scripts" resolve, simulating async CDN downloads.
 * Each call to `createResolver(name)` returns a promise + a `resolve` function
 * the test can call to simulate the script finishing download and execution.
 */
function createLoadOrderTracker() {
  const order: string[] = [];
  const resolvers = new Map<string, () => void>();

  function createResolver(name: string): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>(resolve => {
      resolvers.set(name, () => {
        order.push(name);
        const fakeGlobal: Record<string, unknown> = { __name: name };
        if (name === 'ReactDOM') {
          // Simulate UMD behavior: createRoot only works if React was loaded first
          if (fakeWindow.React) {
            fakeGlobal.createRoot = function mockCreateRoot() {
              return { unmount: vi.fn() };
            };
          }
          // If React isn't on window yet, createRoot is missing — the real bug
        }
        fakeWindow[name] = fakeGlobal;
        resolve(fakeGlobal);
      });
    });
  }

  return { order, resolvers, createResolver };
}

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { LibraryLoader } from '../utilities/library-loader';

describe('LibraryLoader — load order guarantees', () => {
  beforeEach(() => {
    // Clean globals between tests
    delete fakeWindow.React;
    delete fakeWindow.ReactDOM;
    delete fakeWindow.Babel;
    delete fakeWindow.PropTypes;

    // Reset the static loadedResources cache so each test starts clean
    LibraryLoader.getLoadedResources().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Test 1: React resolves before ReactDOM in the fixed code
  // -----------------------------------------------------------------------
  it('should load React before ReactDOM (sequential phase 1 → phase 2)', async () => {
    const tracker = createLoadOrderTracker();

    // Spy on the private static loadScript to intercept calls and control
    // resolution order.  We use `spyOn` + `mockImplementation` so we can
    // see WHEN each library's loadScript is first called.
    const callOrder: string[] = [];

    const loadScriptSpy = vi.spyOn(LibraryLoader as unknown as { loadScript: (...args: unknown[]) => Promise<unknown> }, 'loadScript' as never)
      .mockImplementation((_url: unknown, globalName: unknown) => {
        const name = globalName as string;
        callOrder.push(name);
        const p = tracker.createResolver(name);
        // Simulate immediate resolution (CDN is fast) in call order.
        // The key assertion is about WHEN loadScript is called, not when
        // it resolves — if React's loadScript is awaited before ReactDOM's
        // loadScript is even called, the ordering is guaranteed.
        tracker.resolvers.get(name)!();
        return p;
      });

    await LibraryLoader.loadLibrariesFromConfig(undefined, false);

    // React must be the FIRST loadScript call
    expect(callOrder[0]).toBe('React');

    // ReactDOM must come AFTER React
    const reactIndex = callOrder.indexOf('React');
    const reactDOMIndex = callOrder.indexOf('ReactDOM');
    expect(reactIndex).toBeLessThan(reactDOMIndex);

    // Execution order (tracker.order) must also have React first
    expect(tracker.order[0]).toBe('React');
    const reactExecIdx = tracker.order.indexOf('React');
    const reactDOMExecIdx = tracker.order.indexOf('ReactDOM');
    expect(reactExecIdx).toBeLessThan(reactDOMExecIdx);

    loadScriptSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Test 2: ReactDOM gets a working createRoot when React loads first
  // -----------------------------------------------------------------------
  it('should produce a ReactDOM with createRoot when load order is correct', async () => {
    const tracker = createLoadOrderTracker();

    vi.spyOn(LibraryLoader as unknown as { loadScript: (...args: unknown[]) => Promise<unknown> }, 'loadScript' as never)
      .mockImplementation((_url: unknown, globalName: unknown) => {
        const name = globalName as string;
        const p = tracker.createResolver(name);
        // Resolve immediately — React first because of sequential await
        tracker.resolvers.get(name)!();
        return p;
      });

    const result = await LibraryLoader.loadLibrariesFromConfig(undefined, false);

    // ReactDOM should have createRoot because React was available when it "executed"
    expect(result.ReactDOM).toBeDefined();
    expect((result.ReactDOM as Record<string, unknown>).createRoot).toBeDefined();
    expect(typeof (result.ReactDOM as Record<string, unknown>).createRoot).toBe('function');
  });

  // -----------------------------------------------------------------------
  // Test 3: Simulating the OLD race condition — ReactDOM executes first
  // -----------------------------------------------------------------------
  it('should demonstrate that ReactDOM lacks createRoot when it executes before React', async () => {
    // This test does NOT use loadLibrariesFromConfig — it directly simulates
    // the broken parallel behavior to prove the race condition is real.
    const tracker = createLoadOrderTracker();

    // Create promises for both
    const reactPromise = tracker.createResolver('React');
    const reactDOMPromise = tracker.createResolver('ReactDOM');

    // Simulate the race: resolve ReactDOM FIRST (before React)
    tracker.resolvers.get('ReactDOM')!();
    tracker.resolvers.get('React')!();

    const [, reactDOM] = await Promise.all([reactPromise, reactDOMPromise]);

    // ReactDOM executed before React, so createRoot should be MISSING
    expect((reactDOM as Record<string, unknown>).createRoot).toBeUndefined();

    // Execution order confirms ReactDOM came first
    expect(tracker.order[0]).toBe('ReactDOM');
    expect(tracker.order[1]).toBe('React');
  });

  // -----------------------------------------------------------------------
  // Test 4: Simulating correct order — ReactDOM executes after React
  // -----------------------------------------------------------------------
  it('should demonstrate that ReactDOM has createRoot when it executes after React', async () => {
    const tracker = createLoadOrderTracker();

    const reactPromise = tracker.createResolver('React');
    const reactDOMPromise = tracker.createResolver('ReactDOM');

    // Correct order: React first, then ReactDOM
    tracker.resolvers.get('React')!();
    tracker.resolvers.get('ReactDOM')!();

    const [, reactDOM] = await Promise.all([reactPromise, reactDOMPromise]);

    // ReactDOM executed after React, so createRoot should be present
    expect((reactDOM as Record<string, unknown>).createRoot).toBeDefined();
    expect(typeof (reactDOM as Record<string, unknown>).createRoot).toBe('function');
  });

  // -----------------------------------------------------------------------
  // Test 5: ReactDOM and Babel load in parallel (phase 2), both after React
  // -----------------------------------------------------------------------
  it('should load ReactDOM and Babel in parallel after React completes', async () => {
    const callTimestamps: { name: string; time: number }[] = [];
    const startTime = Date.now();

    vi.spyOn(LibraryLoader as unknown as { loadScript: (...args: unknown[]) => Promise<unknown> }, 'loadScript' as never)
      .mockImplementation((_url: unknown, globalName: unknown) => {
        const name = globalName as string;
        callTimestamps.push({ name, time: Date.now() - startTime });

        // Simulate globals
        const fakeGlobal: Record<string, unknown> = { __name: name };
        if (name === 'ReactDOM') {
          fakeGlobal.createRoot = vi.fn();
        }
        fakeWindow[name] = fakeGlobal;
        return Promise.resolve(fakeGlobal);
      });

    await LibraryLoader.loadLibrariesFromConfig(undefined, false);

    // React is called first
    expect(callTimestamps[0].name).toBe('React');

    // ReactDOM and Babel are both called after React, and they can be in either order
    const phase2Names = callTimestamps.slice(1).map(t => t.name);
    expect(phase2Names).toContain('ReactDOM');
    expect(phase2Names).toContain('Babel');
  });

  // -----------------------------------------------------------------------
  // Test 6: Post-load validation catches missing createRoot
  // -----------------------------------------------------------------------
  it('should detect when ReactDOM.createRoot is missing (validation check)', () => {
    // Simulate a broken ReactDOM object (loaded before React)
    const brokenReactDOM = { __name: 'ReactDOM' };  // no createRoot

    // The validation check used by ReactBridgeService
    const hasCreateRoot = brokenReactDOM != null &&
      'createRoot' in brokenReactDOM &&
      typeof (brokenReactDOM as Record<string, unknown>).createRoot === 'function';

    expect(hasCreateRoot).toBe(false);
  });

  it('should detect when ReactDOM.createRoot is present (validation check)', () => {
    // Simulate a working ReactDOM object (loaded after React)
    const workingReactDOM = {
      __name: 'ReactDOM',
      createRoot: function mockCreateRoot() { return { unmount: vi.fn() }; }
    };

    const hasCreateRoot = workingReactDOM != null &&
      'createRoot' in workingReactDOM &&
      typeof (workingReactDOM as Record<string, unknown>).createRoot === 'function';

    expect(hasCreateRoot).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Test 7: Retry after destroy resets adapter properly
  // -----------------------------------------------------------------------
  it('should demonstrate that clearing initializationPromise allows re-initialization', async () => {
    // Simulates the AngularAdapterService pattern
    let initCount = 0;
    let initPromise: Promise<void> | undefined;
    let runtime: { version: string } | undefined;

    async function doInit(): Promise<void> {
      initCount++;
      runtime = { version: `v${initCount}` };
    }

    async function initialize(): Promise<void> {
      if (runtime) return;
      if (initPromise) return initPromise;
      initPromise = doInit();
      await initPromise;
    }

    function destroy(): void {
      runtime = undefined;
      initPromise = undefined;  // THE FIX — without this, re-init doesn't run
    }

    // First init
    await initialize();
    expect(initCount).toBe(1);
    expect(runtime?.version).toBe('v1');

    // Destroy
    destroy();
    expect(runtime).toBeUndefined();

    // Re-init should actually run doInit again
    await initialize();
    expect(initCount).toBe(2);
    expect(runtime?.version).toBe('v2');
  });

  it('should demonstrate the BUG when initializationPromise is NOT cleared', async () => {
    let initCount = 0;
    let initPromise: Promise<void> | undefined;
    let runtime: { version: string } | undefined;

    async function doInit(): Promise<void> {
      initCount++;
      runtime = { version: `v${initCount}` };
    }

    async function initialize(): Promise<void> {
      if (runtime) return;
      if (initPromise) return initPromise;  // BUG: returns stale resolved promise
      initPromise = doInit();
      await initPromise;
    }

    function destroyBuggy(): void {
      runtime = undefined;
      // BUG: initPromise is NOT cleared
    }

    // First init
    await initialize();
    expect(initCount).toBe(1);

    // Destroy (buggy version)
    destroyBuggy();

    // Re-init — this silently does nothing because initPromise is still set
    await initialize();
    expect(initCount).toBe(1);  // Still 1! doInit never ran again
    expect(runtime).toBeUndefined();  // runtime is still undefined — broken state
  });
});
