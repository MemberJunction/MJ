import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub globals before imports
vi.stubGlobal('window', {
  setInterval: vi.fn().mockReturnValue(1),
  clearInterval: vi.fn(),
});

// Mock ComponentMetadataEngine before importing ComponentManager
vi.mock('@memberjunction/core-entities', () => ({
  ComponentMetadataEngine: {
    Instance: {
      Config: vi.fn().mockResolvedValue(undefined),
      Components: [],
      ComponentLibraries: [],
    },
  },
  MJComponentLibraryEntity: class {},
  MJComponentEntityExtended: class {},
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class {},
  Metadata: class {},
  LogError: vi.fn(),
}));

import { ComponentManager } from '../component-manager/component-manager';
import { ComponentRegistry } from '../registry/component-registry';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Creates a minimal mock ComponentCompiler.
 * The compile() result returns a factory that produces a tagged component object
 * so tests can verify which code was actually compiled.
 */
function createMockCompiler() {
  return {
    compile: vi.fn().mockImplementation(async (opts: { componentName: string; componentCode: string }) => ({
      success: true,
      component: {
        factory: () => ({ __name: opts.componentName, __code: opts.componentCode }),
      },
      loadedLibraries: new Map(),
    })),
    setBabelInstance: vi.fn(),
  } as any;
}

/**
 * Creates a minimal mock RuntimeContext.
 */
function createMockRuntimeContext() {
  return {
    React: {},
    globals: {},
    libraries: {},
    getLibrary: vi.fn(),
  } as any;
}

/**
 * Helper to build a ComponentSpec with sensible defaults.
 */
function makeSpec(overrides: Partial<ComponentSpec> & { name: string }): ComponentSpec {
  return {
    location: 'embedded',
    version: '1.0.0',
    namespace: 'Test',
    code: `function ${overrides.name}() { return null; }`,
    ...overrides,
  } as ComponentSpec;
}

describe('ComponentManager', () => {
  let compiler: ReturnType<typeof createMockCompiler>;
  let registry: ComponentRegistry;
  let manager: ComponentManager;

  beforeEach(() => {
    compiler = createMockCompiler();
    registry = new ComponentRegistry({ cleanupInterval: 0 });
    manager = new ComponentManager(compiler, registry, createMockRuntimeContext(), {
      debug: false,
      enableUsageTracking: false,
    });
  });

  // --------------------------------------------------------------------------
  // Basic loading
  // --------------------------------------------------------------------------
  describe('loadComponent', () => {
    it('should compile and return a component on first load', async () => {
      const spec = makeSpec({ name: 'Button' });
      const result = await manager.loadComponent(spec);

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('should return from cache on second load with same spec', async () => {
      const spec = makeSpec({ name: 'Button' });

      await manager.loadComponent(spec);
      compiler.compile.mockClear();

      const result2 = await manager.loadComponent(spec);
      expect(result2.success).toBe(true);
      expect(result2.fromCache).toBe(true);
      expect(compiler.compile).not.toHaveBeenCalled();
    });

    it('should recompile when code changes (different hash)', async () => {
      const specV1 = makeSpec({ name: 'Button', code: 'function Button() { return 1; }' });
      const specV2 = makeSpec({ name: 'Button', code: 'function Button() { return 2; }' });

      await manager.loadComponent(specV1);
      compiler.compile.mockClear();

      const result = await manager.loadComponent(specV2);
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('should recompile when forceRecompile is set', async () => {
      const spec = makeSpec({ name: 'Button' });

      await manager.loadComponent(spec);
      compiler.compile.mockClear();

      const result = await manager.loadComponent(spec, { forceRecompile: true });
      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // loadHierarchy – dependency resolution
  // --------------------------------------------------------------------------
  describe('loadHierarchy', () => {
    it('should load root and its dependencies', async () => {
      const childSpec = makeSpec({ name: 'ChildBtn', code: 'function ChildBtn() { return "child"; }' });
      const rootSpec = makeSpec({
        name: 'ParentForm',
        code: 'function ParentForm() { return "parent"; }',
        dependencies: [childSpec],
      });

      const result = await manager.loadHierarchy(rootSpec);

      expect(result.success).toBe(true);
      expect(result.loadedComponents).toContain('ParentForm');
      expect(result.loadedComponents).toContain('ChildBtn');
      expect(compiler.compile).toHaveBeenCalledTimes(2);
    });

    it('should use updated dependency code even when root is cached', async () => {
      const childV1 = makeSpec({ name: 'Search', code: 'function Search() { return "v1"; }' });
      const rootSpec = makeSpec({
        name: 'Dashboard',
        code: 'function Dashboard() { return "root"; }',
        dependencies: [childV1],
      });

      // First load – populates cache
      await manager.loadHierarchy(rootSpec);
      expect(compiler.compile).toHaveBeenCalledTimes(2);
      compiler.compile.mockClear();

      // Second load – same root code, but updated Search dependency code
      const childV2 = makeSpec({ name: 'Search', code: 'function Search() { return "v2"; }' });
      const rootSpecUpdated = makeSpec({
        name: 'Dashboard',
        code: 'function Dashboard() { return "root"; }', // same root code
        dependencies: [childV2],
      });

      const result = await manager.loadHierarchy(rootSpecUpdated);

      expect(result.success).toBe(true);
      // Root should be cached, Search should recompile with new code
      expect(result.stats?.fromCache).toBe(1); // root only
      expect(compiler.compile).toHaveBeenCalledTimes(1); // Search recompiled
      // Verify the recompiled dependency used the v2 code
      const compileCall = compiler.compile.mock.calls[0][0];
      expect(compileCall.componentCode).toContain('return "v2"');
    });

    it('should cache dependencies individually by content hash', async () => {
      const child = makeSpec({ name: 'Grid', code: 'function Grid() { return "grid"; }' });
      const root1 = makeSpec({
        name: 'Page1',
        code: 'function Page1() { return "p1"; }',
        dependencies: [child],
      });
      const root2 = makeSpec({
        name: 'Page2',
        code: 'function Page2() { return "p2"; }',
        dependencies: [{ ...child }], // same Grid dependency
      });

      await manager.loadHierarchy(root1);
      expect(compiler.compile).toHaveBeenCalledTimes(2); // Page1 + Grid
      compiler.compile.mockClear();

      // Loading Page2 with the exact same Grid dep should reuse Grid from cache
      const result = await manager.loadHierarchy(root2);
      expect(result.success).toBe(true);
      expect(compiler.compile).toHaveBeenCalledTimes(1); // Only Page2 compiled, Grid cached
    });

    it('should handle deeply nested dependency updates', async () => {
      const leafV1 = makeSpec({ name: 'Leaf', code: 'function Leaf() { return "leaf-v1"; }' });
      const mid = makeSpec({
        name: 'Middle',
        code: 'function Middle() { return "mid"; }',
        dependencies: [leafV1],
      });
      const root = makeSpec({
        name: 'Root',
        code: 'function Root() { return "root"; }',
        dependencies: [mid],
      });

      // First load
      await manager.loadHierarchy(root);
      expect(compiler.compile).toHaveBeenCalledTimes(3);
      compiler.compile.mockClear();

      // Update only the leaf
      const leafV2 = makeSpec({ name: 'Leaf', code: 'function Leaf() { return "leaf-v2"; }' });
      const midUpdated = makeSpec({
        name: 'Middle',
        code: 'function Middle() { return "mid"; }',
        dependencies: [leafV2],
      });
      const rootUpdated = makeSpec({
        name: 'Root',
        code: 'function Root() { return "root"; }',
        dependencies: [midUpdated],
      });

      const result = await manager.loadHierarchy(rootUpdated);
      expect(result.success).toBe(true);
      // Root cached, Middle cached, only Leaf recompiled
      expect(compiler.compile).toHaveBeenCalledTimes(1);
      const compileCall = compiler.compile.mock.calls[0][0];
      expect(compileCall.componentCode).toContain('leaf-v2');
    });

    it('should handle circular dependencies without infinite loop', async () => {
      const specA = makeSpec({ name: 'CompA', code: 'function CompA() {}' });
      const specB = makeSpec({
        name: 'CompB',
        code: 'function CompB() {}',
        dependencies: [specA],
      });
      specA.dependencies = [specB];

      const root = makeSpec({
        name: 'Root',
        code: 'function Root() {}',
        dependencies: [specA],
      });

      const result = await manager.loadHierarchy(root);
      expect(result.success).toBe(true);
      expect(result.loadedComponents).toContain('Root');
    });

    it('should fallback to cached spec dependencies when input has none', async () => {
      const child = makeSpec({ name: 'Chart', code: 'function Chart() {}' });
      const fullRootSpec = makeSpec({
        name: 'Dashboard',
        code: 'function Dashboard() {}',
        dependencies: [child],
      });

      // First load with full spec (has dependencies)
      await manager.loadHierarchy(fullRootSpec);
      expect(compiler.compile).toHaveBeenCalledTimes(2);
      compiler.compile.mockClear();

      // Second load with no dependencies field - simulates registry reference
      const minimalSpec = makeSpec({
        name: 'Dashboard',
        code: 'function Dashboard() {}',
      });
      delete (minimalSpec as any).dependencies;

      const result = await manager.loadHierarchy(minimalSpec);
      expect(result.success).toBe(true);
      expect(result.loadedComponents).toContain('Dashboard');
      // Chart should still be loaded via cached spec's dependencies
      expect(result.loadedComponents).toContain('Chart');
    });

    it('should prefer input dependencies over stale cached dependencies', async () => {
      const depA = makeSpec({ name: 'DepA', code: 'function DepA() { return "A"; }' });
      const root = makeSpec({
        name: 'App',
        code: 'function App() { return "app"; }',
        dependencies: [depA],
      });
      await manager.loadHierarchy(root);
      compiler.compile.mockClear();

      // Same root code but dependency list changed (depB instead of depA)
      const depB = makeSpec({ name: 'DepB', code: 'function DepB() { return "B"; }' });
      const rootUpdated = makeSpec({
        name: 'App',
        code: 'function App() { return "app"; }',
        dependencies: [depB],
      });
      const result = await manager.loadHierarchy(rootUpdated);

      expect(result.success).toBe(true);
      expect(result.loadedComponents).toContain('DepB');
      expect(compiler.compile).toHaveBeenCalledTimes(1); // only DepB
    });
  });

  // --------------------------------------------------------------------------
  // Cache management
  // --------------------------------------------------------------------------
  describe('clearCache', () => {
    it('should clear the fetch cache', async () => {
      const spec = makeSpec({ name: 'Widget' });
      await manager.loadComponent(spec);

      manager.clearCache();

      const stats = manager.getCacheStats();
      expect(stats.fetchCacheSize).toBe(0);
    });
  });
});
