import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { QueryPartComponent } from '../lib/parts/query-part.component';

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('QueryPartComponent teardown during async loadContent', () => {
    it('does not start the auto-refresh interval when destroyed while awaiting query load', async () => {
        vi.useFakeTimers();
        let resolveLoad!: (ok: boolean) => void;
        const loadPromise = new Promise<boolean>((r) => {
            resolveLoad = r;
        });

        const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
        const part = new QueryPartComponent(cdr);
        const open = part as unknown as Record<string, unknown>;
        open.getConfig = () => ({ queryId: 'q-1', autoRefreshSeconds: 10 });
        open.applyQueryInputs = async () => true;
        Object.defineProperty(part, 'ProviderToUse', {
            get: () => ({
                CurrentUser: { ID: 'u-1' },
                GetEntityObject: async () => ({ Load: () => loadPromise }),
            }),
            configurable: true,
        });

        const load = part.loadContent();
        part.ngOnDestroy();
        resolveLoad(true);
        await load;

        expect(open.autoRefreshTimer).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
});
