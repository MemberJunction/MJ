import { describe, it, expect, vi, afterEach } from 'vitest';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

/**
 * An explicit Refresh() must reload metadata even when a save is in flight. Saves suspend refresh
 * for the length of their SQL; Refresh() used to return true WITHOUT reloading in that window, so a
 * caller (CodeGen, right after a fire-and-forget AI Prompt Run save) kept a stale metadata snapshot.
 */

/** Structural view of the provider surface these tests drive. */
interface ProviderTestSurface {
  OnSuspendRefresh(): void;
  OnResumeRefresh(): void;
  readonly AllowRefresh: boolean;
  Config(configData: unknown, providerToUse?: unknown): Promise<boolean>;
  Refresh(): Promise<boolean>;
  Save(entity: unknown, user: unknown, options: unknown): Promise<unknown>;
}

function makeProvider(): { provider: ProviderTestSurface; configSpy: ReturnType<typeof vi.fn> } {
  const provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
  const configSpy = vi.fn(async () => true);
  provider.Config = configSpy;
  return { provider, configSpy };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
});

describe('SQLServerDataProvider.Refresh while a save is in flight', () => {
  it('reloads immediately when no save is in flight', async () => {
    const { provider, configSpy } = makeProvider();
    expect(await provider.Refresh()).toBe(true);
    expect(configSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for the in-flight save to finish, then really reloads', async () => {
    const { provider, configSpy } = makeProvider();
    provider.OnSuspendRefresh();
    const pending = provider.Refresh();
    await flush();
    expect(configSpy).not.toHaveBeenCalled();
    provider.OnResumeRefresh();
    expect(await pending).toBe(true);
    expect(configSpy).toHaveBeenCalledTimes(1);
  });

  it('counts overlapping saves: refresh stays suspended until the last one resumes', async () => {
    const { provider, configSpy } = makeProvider();
    provider.OnSuspendRefresh();
    provider.OnSuspendRefresh();
    expect(provider.AllowRefresh).toBe(false);
    const pending = provider.Refresh();
    provider.OnResumeRefresh();
    await flush();
    expect(provider.AllowRefresh).toBe(false);
    expect(configSpy).not.toHaveBeenCalled();
    provider.OnResumeRefresh();
    expect(await pending).toBe(true);
    expect(provider.AllowRefresh).toBe(true);
  });

  it('gives up with false (not a fake true) when a save never finishes', async () => {
    vi.useFakeTimers();
    const { provider, configSpy } = makeProvider();
    provider.OnSuspendRefresh();
    const pending = provider.Refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toBe(false);
    expect(configSpy).not.toHaveBeenCalled();
  });

  it('a save that fails before suspending does not release another in-flight save', async () => {
    const { provider } = makeProvider();
    provider.OnSuspendRefresh(); // another save is running
    const externalEntity = {
      RegisterTransactionPreprocessing: () => undefined,
      EntityInfo: { Name: 'External Thing', ExternalDataSourceID: 'ext-1' },
    };
    await expect(provider.Save(externalEntity, {}, undefined)).rejects.toThrow(/external data source/);
    expect(provider.AllowRefresh).toBe(false);
    provider.OnResumeRefresh();
    expect(provider.AllowRefresh).toBe(true);
  });

  it('RefreshIfNeeded does not silently drop peer metadata checks while saves or an unrelated transaction are active', async () => {
    const provider = new SQLServerDataProvider();
    const internal = provider as unknown as {
      OnSuspendRefresh(): void;
      OnResumeRefresh(): void;
      AllowRefresh: boolean;
      AllowRefreshCheck: boolean;
      RefreshRemoteMetadataTimestamps(): Promise<boolean>;
      LoadLocalMetadataFromStorage(): Promise<void>;
      LocalMetadataObsolete(): boolean;
    };

    const tsSpy = vi.spyOn(internal, 'RefreshRemoteMetadataTimestamps').mockResolvedValue(true);
    const loadSpy = vi.spyOn(internal, 'LoadLocalMetadataFromStorage').mockResolvedValue(undefined);
    vi.spyOn(internal, 'LocalMetadataObsolete').mockReturnValue(false);
    vi.spyOn(provider, 'IsTransactionActive', 'get').mockReturnValue(true);

    internal.OnSuspendRefresh();
    try {
      expect(internal.AllowRefresh).toBe(false);
      expect(internal.AllowRefreshCheck).toBe(true);

      // Previously: IsTransactionActive caused RefreshIfNeeded to return false immediately,
      // and AllowRefresh=false caused CheckToSeeIfRefreshNeeded to return false without reading
      // remote timestamps or adopting a peer snapshot from shared storage.
      const ok = await provider.RefreshIfNeeded(undefined, true);
      expect(ok).toBe(true);
      expect(tsSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledTimes(1);
    } finally {
      internal.OnResumeRefresh();
      vi.restoreAllMocks();
    }
  });
});
