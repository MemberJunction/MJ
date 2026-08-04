/**
 * Tests for LazyModuleRegistry — chunk load dedup and diagnostics.
 *
 * The regression these lock down: chunks must be deduped by their declared `chunkId`,
 * never by anything derived from the loader function. The generated LAZY_FEATURE_CONFIG
 * builds every chunk's `load` the same way, so their closures are source-identical —
 * keying off `Function.toString()` collapsed all 18 chunks into one, and the first chunk
 * loaded made every other chunk look already-loaded (so its classes never registered).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      ClassFactory: {
        RegisterLazyLoader: vi.fn(),
      },
    },
  },
}));

import { LazyModuleRegistry, LazyFeatureChunk } from '../services/lazy-module-registry';

/**
 * Mirrors how the generator emits chunks: every `load` closure has the same source text,
 * so anything source-derived cannot tell two chunks apart.
 */
function makeChunk(chunkId: string, onLoad: () => Promise<void>): LazyFeatureChunk {
  return { chunkId, load: () => onLoad() };
}

describe('LazyModuleRegistry', () => {
  let registry: LazyModuleRegistry;
  let aiLoads: number;
  let coreLoads: number;
  let ai: LazyFeatureChunk;
  let core: LazyFeatureChunk;

  beforeEach(() => {
    registry = new LazyModuleRegistry();
    aiLoads = 0;
    coreLoads = 0;
    ai = makeChunk('@memberjunction/ng-dashboards/ai-dashboards.module', async () => { aiLoads++; });
    core = makeChunk('@memberjunction/ng-dashboards/core-dashboards.module', async () => { coreLoads++; });
    registry.RegisterBulk({
      'BaseResourceComponent::FeaturePipelinesResource': ai,
      'BaseResourceComponent::AIModelsResource': ai,
      'BaseApplication::HomeApplication': core,
    });
  });

  it('loads a different chunk even after another chunk has loaded', async () => {
    expect(await registry.Load('BaseApplication::HomeApplication')).toBe(true);
    expect(coreLoads).toBe(1);

    // The bug: this returned true without importing, so FeaturePipelinesResource never registered.
    expect(await registry.Load('BaseResourceComponent::FeaturePipelinesResource')).toBe(true);
    expect(aiLoads).toBe(1);
  });

  it('imports a chunk only once no matter how many of its keys are requested', async () => {
    await registry.Load('BaseResourceComponent::FeaturePipelinesResource');
    await registry.Load('BaseResourceComponent::AIModelsResource');
    await registry.Load('BaseResourceComponent::FeaturePipelinesResource');

    expect(aiLoads).toBe(1);
    expect(coreLoads).toBe(0);
  });

  it('does not collapse concurrent loads of different chunks into one', async () => {
    await Promise.all([
      registry.Load('BaseResourceComponent::FeaturePipelinesResource'),
      registry.Load('BaseApplication::HomeApplication'),
    ]);

    expect(aiLoads).toBe(1);
    expect(coreLoads).toBe(1);
  });

  it('returns false for an unregistered compound key', async () => {
    expect(await registry.Load('BaseResourceComponent::NotARealResource')).toBe(false);
    expect(aiLoads).toBe(0);
    expect(coreLoads).toBe(0);
  });

  // ClassFactory builds the lookup from `baseClass.name`, but the emitted identifier differs by
  // build mode: `_BaseResourceComponent` unminified (Angular's named class expression) and
  // `BaseResourceComponent2` minified (esbuild's collision rename). The generated config uses the
  // TypeScript source name. Any mismatch used to mean no chunk was ever imported.
  it.each([
    ['_BaseResourceComponent', 'unminified — Angular named class expression'],
    ['BaseResourceComponent2', 'minified — esbuild collision rename'],
    ['n', 'fully mangled identifier'],
  ])('resolves regardless of the runtime base-class name: %s (%s)', async (runtimeName) => {
    expect(await registry.Load(`${runtimeName}::FeaturePipelinesResource`)).toBe(true);
    expect(aiLoads).toBe(1);
  });

  it('does not load a second time when the same chunk is reached via a different base-class name', async () => {
    await registry.Load('BaseResourceComponent::FeaturePipelinesResource');
    await registry.Load('BaseResourceComponent2::FeaturePipelinesResource');

    expect(aiLoads).toBe(1);
  });

  it('still returns false for a subclass key that is genuinely unregistered', async () => {
    expect(await registry.Load('BaseResourceComponent::NoSuchResource')).toBe(false);
    expect(aiLoads).toBe(0);
    expect(coreLoads).toBe(0);
  });

  it('loads every candidate when one subclass key is claimed by multiple chunks', async () => {
    let otherLoads = 0;
    const other = makeChunk('pkg/other.module', async () => { otherLoads++; });
    registry.Register('BaseDashboard::FeaturePipelinesResource', other);

    expect(await registry.Load('mangled::FeaturePipelinesResource')).toBe(true);
    expect(aiLoads).toBe(1);
    expect(otherLoads).toBe(1);
  });

  // A later candidate may be the chunk that actually holds the class, so one failure must not
  // abort the sweep. Sequential awaits without a try/catch stopped at the first rejection.
  it('still loads a later candidate when an earlier one fails', async () => {
    let goodLoads = 0;
    registry.Register('BaseA::SharedResource', makeChunk('pkg/broken.module', async () => {
      throw new Error('chunk 404');
    }));
    registry.Register('BaseB::SharedResource', makeChunk('pkg/good.module', async () => { goodLoads++; }));

    expect(await registry.Load('mangled::SharedResource')).toBe(true);
    expect(goodLoads).toBe(1);
  });

  it('rejects with the first error when every candidate for a subclass key fails', async () => {
    registry.Register('BaseA::AllBrokenResource', makeChunk('pkg/broken-a.module', async () => {
      throw new Error('first failure');
    }));
    registry.Register('BaseB::AllBrokenResource', makeChunk('pkg/broken-b.module', async () => {
      throw new Error('second failure');
    }));

    await expect(registry.Load('mangled::AllBrokenResource')).rejects.toThrow('first failure');
  });

  // Re-registering a compound key REPLACES it in the primary map; the subclass-key index must
  // follow. Accumulating into a Set kept the superseded chunk as a fallback candidate forever.
  it('drops the superseded chunk when a compound key is re-registered', async () => {
    let overrideLoads = 0;
    registry.Register(
      'BaseResourceComponent::FeaturePipelinesResource',
      makeChunk('pkg/override.module', async () => { overrideLoads++; })
    );

    expect(await registry.Load('mangled::FeaturePipelinesResource')).toBe(true);
    expect(overrideLoads).toBe(1);
    expect(aiLoads).toBe(0);
  });

  it('shares one in-flight import between concurrent loads of the same chunk', async () => {
    let releaseImport: () => void = () => {};
    const importGate = new Promise<void>(resolve => { releaseImport = resolve; });
    let deferredLoads = 0;
    const deferred = makeChunk('pkg/deferred.module', async () => {
      deferredLoads++;
      await importGate;
    });
    registry.Register('BaseResourceComponent::DeferredOne', deferred);
    registry.Register('BaseResourceComponent::DeferredTwo', deferred);

    const first = registry.Load('BaseResourceComponent::DeferredOne');
    const second = registry.Load('BaseResourceComponent::DeferredTwo');
    // The second caller must join the in-flight import, not start a new one.
    expect(deferredLoads).toBe(1);

    releaseImport();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(deferredLoads).toBe(1);
  });

  it('clears a failed load so the next attempt retries instead of re-throwing', async () => {
    let attempts = 0;
    registry.Register('BaseResourceComponent::FlakyResource', makeChunk('pkg/flaky.module', async () => {
      attempts++;
      if (attempts === 1) throw new Error('chunk 404');
    }));

    await expect(registry.Load('BaseResourceComponent::FlakyResource')).rejects.toThrow('chunk 404');

    // Without the rejection cleanup this re-awaited the stored rejected promise and threw again.
    expect(await registry.Load('BaseResourceComponent::FlakyResource')).toBe(true);
    expect(attempts).toBe(2);
  });

  it('groups snapshot keys by chunkId and reports per-chunk loaded state', async () => {
    await registry.Load('BaseResourceComponent::AIModelsResource');
    const snap = registry.GetSnapshot();

    expect(snap.chunks).toHaveLength(2);
    expect(snap.loadedChunkCount).toBe(1);

    const aiChunk = snap.chunks.find(c => c.chunkId === ai.chunkId);
    expect(aiChunk?.loaded).toBe(true);
    expect(aiChunk?.keys).toEqual([
      'BaseResourceComponent::AIModelsResource',
      'BaseResourceComponent::FeaturePipelinesResource',
    ]);

    expect(snap.chunks.find(c => c.chunkId === core.chunkId)?.loaded).toBe(false);
    expect(snap.loaded).toEqual([
      'BaseResourceComponent::AIModelsResource',
      'BaseResourceComponent::FeaturePipelinesResource',
    ]);
  });
});
