import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/**
 * A METADATA REFRESH THAT COMES BACK EMPTY MUST NOT REPLACE THE METADATA ALREADY LOADED (MJ#4486).
 *
 * One dropped connection during a background refresh produced an MJ_Metadata dataset with zero
 * entities that still said Success; GetAllMetadata built an AllMetadata from it and Config()
 * installed it, after which every EntityByName in the process failed until restart. There is
 * no deployment in which MJ_Metadata legitimately holds zero entities, so an empty Entities
 * item is a failed read and the previous metadata stays.
 */
class RefreshableProvider extends TestMetadataProvider {
    public mustWait = false;
    protected override get MetadataMemberRefreshMustWait(): boolean { return this.mustWait; }
    public schedule(): void { this.scheduleMetadataMemberRefresh(); }
    public refreshAfterChange(): Promise<boolean> { return this.RefreshAfterMetadataMemberChange(); }
    public cancelPending(): void { this.CancelPendingMetadataMemberRefresh(); }
    public hasPendingTimer(): boolean { return (this as unknown as { _metadataMemberRefreshTimer: unknown })._metadataMemberRefreshTimer !== null; }
}

const config = () => new ProviderConfigDataBase({}, '__mj', [], [], true);

describe('GetAllMetadata with an empty Entities item', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps the entities already loaded when a refresh returns none', async () => {
        const provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        await provider.Config(config());
        const loaded = provider.Entities.length;
        expect(loaded).toBeGreaterThan(0);

        // The shape a swallowed batch failure produced: Success, every item present, no rows.
        provider.setMockMetadata({ Entities: [], EntityFields: [], Applications: [] });
        await provider.Refresh();

        expect(provider.Entities.length).toBe(loaded);
    });

    it('still adopts a refresh that carries entities', async () => {
        const provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        await provider.Config(config());
        const before = provider.Entities.map(e => e.Name);

        await provider.Refresh();

        // The mock mints a new entity name per call, so an adopted refresh changes the names.
        expect(provider.Entities.length).toBeGreaterThan(0);
        expect(provider.Entities.map(e => e.Name)).not.toEqual(before);
    });
});

describe('a member-change refresh that must wait re-arms instead of running', () => {
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('does not refresh while it must wait, and refreshes once it may', async () => {
        vi.useFakeTimers();
        const provider = new RefreshableProvider();
        provider.setMockDelay(0);
        const refresh = vi.spyOn(provider, 'Refresh').mockResolvedValue(true);

        provider.mustWait = true;
        provider.schedule();
        await vi.advanceTimersByTimeAsync(RefreshableProvider.MetadataDatasetRefreshDebounceMs + 1);
        expect(refresh).not.toHaveBeenCalled();

        // The window was re-armed: once the provider is free, the next firing refreshes.
        provider.mustWait = false;
        await vi.advanceTimersByTimeAsync(RefreshableProvider.MetadataDatasetRefreshDebounceMs + 1);
        expect(refresh).toHaveBeenCalledTimes(1);
        provider.cancelPending();
    });

    it('stops re-arming after the cap and drops the refresh, so a stuck transaction cannot hold the process open', async () => {
        vi.useFakeTimers();
        const provider = new RefreshableProvider();
        const refresh = vi.spyOn(provider, 'Refresh').mockResolvedValue(true);
        const cap = RefreshableProvider.MaxMetadataMemberRefreshWaits;
        provider.mustWait = true;
        provider.schedule();

        // One firing per window: the cap-th wait still re-arms, the next one drops.
        await vi.advanceTimersByTimeAsync((RefreshableProvider.MetadataDatasetRefreshDebounceMs + 1) * (cap + 1));
        expect(refresh).not.toHaveBeenCalled();
        expect(provider.hasPendingTimer()).toBe(false);

        // Nothing is armed now, so freeing the provider alone does not refresh...
        provider.mustWait = false;
        await vi.advanceTimersByTimeAsync(RefreshableProvider.MetadataDatasetRefreshDebounceMs * 5);
        expect(refresh).not.toHaveBeenCalled();
        // ...but the next member write does, and the wait count started over.
        provider.schedule();
        await vi.advanceTimersByTimeAsync(RefreshableProvider.MetadataDatasetRefreshDebounceMs + 1);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes immediately when nothing is waiting', async () => {
        const provider = new RefreshableProvider();
        const refresh = vi.spyOn(provider, 'Refresh').mockResolvedValue(true);
        await provider.refreshAfterChange();
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
