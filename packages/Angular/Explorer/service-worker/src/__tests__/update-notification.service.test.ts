import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import type { SwUpdate, VersionEvent } from '@angular/service-worker';

// Mock the SW module so importing UpdateNotificationService doesn't pull in
// SwPush/SwUpdate decorators (which need @angular/compiler at runtime in JIT).
vi.mock('@angular/service-worker', () => ({
    SwUpdate: class {},
    SwPush: class {},
}));

import { UpdateNotificationService } from '../lib/update-notification.service';

/**
 * We don't bring up TestBed here — UpdateNotificationService is a thin RxJS
 * wrapper around SwUpdate with no Angular-runtime dependencies beyond the
 * `inject()` call. We swap `inject()` out via a mock of `@angular/core` so
 * the service constructs in plain Node/jsdom.
 */

type MockSwUpdate = {
    isEnabled: boolean;
    versionUpdates: Subject<VersionEvent>;
    checkForUpdate: ReturnType<typeof vi.fn>;
};

let mockSw: MockSwUpdate;

vi.mock('@angular/core', async () => {
    const actual = await vi.importActual<typeof import('@angular/core')>('@angular/core');
    return {
        ...actual,
        inject: vi.fn(() => mockSw as unknown as SwUpdate),
    };
});

function makeMockSw(isEnabled = true): MockSwUpdate {
    return {
        isEnabled,
        versionUpdates: new Subject<VersionEvent>(),
        checkForUpdate: vi.fn().mockResolvedValue(true),
    };
}

function versionReady(): VersionEvent {
    return {
        type: 'VERSION_READY',
        currentVersion: { hash: 'old' },
        latestVersion: { hash: 'new' },
    } as VersionEvent;
}

class TestableService extends UpdateNotificationService {
    public reloadCalls = 0;
    protected override performReload(): void {
        this.reloadCalls++;
    }

    /** Skip auto-poll setup in tests — we exercise checkForUpdate() directly. */
    public override startAutoCheck(_intervalMs: number): void {
        // no-op
    }
}

describe('UpdateNotificationService', () => {
    beforeEach(() => {
        mockSw = makeMockSw(true);
    });

    it('starts with updateAvailable = false', () => {
        const svc = new TestableService();
        expect(svc.isUpdateAvailable).toBe(false);
        expect(svc.lastVersionEvent).toBeNull();
    });

    it('flips to true on VERSION_READY', () => {
        const svc = new TestableService();
        mockSw.versionUpdates.next(versionReady());
        expect(svc.isUpdateAvailable).toBe(true);
        expect(svc.lastVersionEvent?.type).toBe('VERSION_READY');
    });

    it('ignores non-VERSION_READY events', () => {
        const svc = new TestableService();
        mockSw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'x' } } as VersionEvent);
        expect(svc.isUpdateAvailable).toBe(false);
    });

    it('does not subscribe when SwUpdate is disabled', () => {
        mockSw = makeMockSw(false);
        const svc = new TestableService();
        mockSw.versionUpdates.next(versionReady());
        expect(svc.isUpdateAvailable).toBe(false);
        expect(svc.isServiceWorkerEnabled).toBe(false);
    });

    it('emits update state changes through updateAvailable$', async () => {
        const svc = new TestableService();
        const collected = svc.updateAvailable$.pipe(take(3), toArray()).toPromise();
        mockSw.versionUpdates.next(versionReady());
        svc.dismissForSession();
        expect(await collected).toEqual([false, true, false]);
    });

    it('applyUpdate clears state and triggers reload', () => {
        const svc = new TestableService();
        mockSw.versionUpdates.next(versionReady());
        svc.applyUpdate();
        expect(svc.isUpdateAvailable).toBe(false);
        expect(svc.reloadCalls).toBe(1);
    });

    it('dismissForSession clears state without reloading', () => {
        const svc = new TestableService();
        mockSw.versionUpdates.next(versionReady());
        svc.dismissForSession();
        expect(svc.isUpdateAvailable).toBe(false);
        expect(svc.reloadCalls).toBe(0);
    });

    it('checkForUpdate delegates to SwUpdate when enabled', async () => {
        const svc = new TestableService();
        const result = await svc.checkForUpdate();
        expect(result).toBe(true);
        expect(mockSw.checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('checkForUpdate returns false when SW disabled', async () => {
        mockSw = makeMockSw(false);
        const svc = new TestableService();
        const result = await svc.checkForUpdate();
        expect(result).toBe(false);
        expect(mockSw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('checkForUpdate swallows errors and returns false', async () => {
        mockSw.checkForUpdate.mockRejectedValueOnce(new Error('boom'));
        const svc = new TestableService();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await svc.checkForUpdate();
        expect(result).toBe(false);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('ngOnDestroy stops further emissions', () => {
        const svc = new TestableService();
        svc.ngOnDestroy();
        // After destroy, pushing to the subject should not flip state
        mockSw.versionUpdates.next(versionReady());
        expect(svc.isUpdateAvailable).toBe(false);
    });
});
