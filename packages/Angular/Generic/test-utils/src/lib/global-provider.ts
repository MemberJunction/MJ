import { afterEach, beforeEach } from 'vitest';
import { Metadata, RunView } from '@memberjunction/core';
import type { IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import { createFakeProvider, FakeProviderOptions } from './fake-provider';

/**
 * Install a fake GLOBAL provider for DOM specs of data-bound components that load through the
 * process-global provider rather than an injectable `@Input() Provider` — i.e. components that call
 * a bare `new RunView()` (which reads `RunView.Provider`) and/or `new Metadata()` /
 * `Metadata.Provider` (`EntityByName`, `GetEntityObject`).
 *
 * Call ONCE at the top of a `describe`. It registers `beforeEach`/`afterEach` to save and restore
 * BOTH globals (`RunView.Provider` and `Metadata.Provider`) so nothing leaks into other tests, and
 * returns an `install` function you call — typically inside a per-test render helper — to swap in a
 * fake whose `RunView`/`RunViews` return your canned rows. The fake is exactly what
 * {@link createFakeProvider} builds, so the options are identical.
 *
 * PREFER passing `createFakeProvider(...)` through the component's `[Provider]` input when the
 * component reads `ProviderToUse`. Use this only for components that reach the GLOBAL provider and
 * that you do not want to refactor — the save/restore is what keeps the global swap safe. See
 * `guides/ANGULAR_TESTING_GUIDE.md`.
 *
 * @example
 * describe('MyDataComponent (DOM)', () => {
 *   const installProvider = useFakeGlobalProvider();
 *
 *   it('renders the loaded rows', async () => {
 *     installProvider({ runViewResults: ROWS });
 *     const f = renderComponentFixture(MyDataComponent);
 *     await new Promise((r) => setTimeout(r, 0)); // let the async ngOnInit load settle
 *     f.detectChanges();
 *     expect(queryAll(f, '.row').length).toBe(ROWS.length);
 *   });
 * });
 */
export function useFakeGlobalProvider<T = unknown>(): (options?: FakeProviderOptions<T>) => IMetadataProvider {
  let priorRunView: IRunViewProvider | undefined;
  let priorMetadata: IMetadataProvider | undefined;

  beforeEach(() => {
    priorRunView = safeRead(() => RunView.Provider);
    priorMetadata = safeRead(() => Metadata.Provider);
  });
  afterEach(() => {
    RunView.Provider = priorRunView as IRunViewProvider;
    Metadata.Provider = priorMetadata as IMetadataProvider;
  });

  return (options: FakeProviderOptions<T> = {}) => {
    const fake = createFakeProvider<T>(options);
    // createFakeProvider returns IMetadataProvider; at runtime it also implements the
    // IRunViewProvider surface (RunView/RunViews) — the same justified seam that
    // RunView.FromMetadataProvider relies on (`provider as unknown as IRunViewProvider`).
    RunView.Provider = fake as unknown as IRunViewProvider;
    Metadata.Provider = fake;
    return fake;
  };
}

/** Read a getter that may throw (e.g. before any global store exists) without failing the spec. */
function safeRead<V>(read: () => V): V | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
