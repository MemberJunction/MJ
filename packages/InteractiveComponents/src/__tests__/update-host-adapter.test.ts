import { describe, it, expect, vi } from 'vitest';
import {
    IsUpdateErrorDescriptor,
    IsUpdateHostAdapter,
    IsUpdatePlatform,
    IsUpdateStateSnapshot,
    IsUpdateStatus,
    IsValidUpdateTransition,
    UPDATE_PLATFORMS,
    UPDATE_STATE_TRANSITIONS,
    UPDATE_STATUSES,
    UpdateHostAdapter,
    UpdatePlatform,
    UpdateStateListener,
    UpdateStateSnapshot,
    ValidateUpdateTransition,
} from '../index';

function createSimulatedAdapter(
    platform: UpdatePlatform,
    currentVersion: string,
    scenario: 'ota-ready' | 'store-required' | 'offline-error' | 'signature-error'
): { adapter: UpdateHostAdapter; emitted: UpdateStateSnapshot[]; applyCount: () => number } {
    const listeners = new Set<UpdateStateListener>();
    const emitted: UpdateStateSnapshot[] = [];
    let applied = 0;
    let snapshot: UpdateStateSnapshot = {
        status: 'idle',
        currentVersion,
        platform,
    };

    const publish = (next: UpdateStateSnapshot): void => {
        const check = ValidateUpdateTransition(snapshot, next);
        if (!check.valid) {
            throw new Error(`Transition violation: ${check.errors.join('; ')}`);
        }
        snapshot = next;
        emitted.push(next);
        for (const listener of listeners) {
            listener(next);
        }
    };

    const adapter: UpdateHostAdapter = {
        platform,
        checkForUpdates: async () => {
            publish({ status: 'checking', currentVersion, platform });

            if (scenario === 'offline-error') {
                publish({
                    status: 'idle',
                    currentVersion,
                    platform,
                    lastCheckedAt: '2026-11-28T16:30:00Z',
                    error: {
                        code: 'network-offline',
                        message: 'Device is offline; update check skipped.',
                        recoverable: true,
                        timestamp: '2026-11-28T16:30:00Z',
                    },
                });
                return snapshot;
            }

            if (scenario === 'store-required') {
                publish({
                    status: 'store-upgrade-required',
                    currentVersion,
                    targetVersion: '6.5.0',
                    minSupportedClientVersion: '6.4.0',
                    releaseNotesUrl: 'https://releases.memberjunction.org/v6.5.0',
                    platform,
                    lastCheckedAt: '2026-11-28T16:30:00Z',
                });
                return snapshot;
            }

            publish({
                status: 'downloading',
                currentVersion,
                targetVersion: '6.3.1',
                downloadProgress: 0,
                platform,
            });
            publish({
                status: 'downloading',
                currentVersion,
                targetVersion: '6.3.1',
                downloadProgress: 50,
                platform,
            });

            if (scenario === 'signature-error') {
                publish({
                    status: 'idle',
                    currentVersion,
                    platform,
                    lastCheckedAt: '2026-11-28T16:30:01Z',
                    error: {
                        code: 'signature-invalid',
                        message: 'Update bundle failed code signature verification.',
                        recoverable: false,
                        timestamp: '2026-11-28T16:30:01Z',
                    },
                });
                return snapshot;
            }

            publish({
                status: 'downloading',
                currentVersion,
                targetVersion: '6.3.1',
                downloadProgress: 100,
                platform,
            });
            publish({
                status: 'ready-to-apply',
                currentVersion,
                targetVersion: '6.3.1',
                releaseNotesUrl: 'https://releases.memberjunction.org/v6.3.1',
                downloadProgress: 100,
                platform,
                lastCheckedAt: '2026-11-28T16:30:02Z',
            });
            return snapshot;
        },
        applyUpdate: async () => {
            if (snapshot.status !== 'ready-to-apply') {
                throw new Error(`Cannot apply update in status "${snapshot.status}".`);
            }
            applied += 1;
            publish({
                status: 'idle',
                currentVersion: snapshot.targetVersion ?? currentVersion,
                platform,
            });
        },
        subscribe: (listener: UpdateStateListener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };

    return { adapter, emitted, applyCount: () => applied };
}

describe('Unified UpdateHostAdapter contract (P18)', () => {
    it('exports canonical status and platform unions with type guards', () => {
        expect(UPDATE_STATUSES).toEqual([
            'idle',
            'checking',
            'downloading',
            'ready-to-apply',
            'store-upgrade-required',
        ]);
        expect(UPDATE_PLATFORMS).toEqual(['web', 'mobile', 'desktop']);

        for (const s of UPDATE_STATUSES) {
            expect(IsUpdateStatus(s)).toBe(true);
        }
        expect(IsUpdateStatus('error')).toBe(false);

        for (const p of UPDATE_PLATFORMS) {
            expect(IsUpdatePlatform(p)).toBe(true);
        }
        expect(IsUpdatePlatform('tvos')).toBe(false);
    });

    it('validates UpdateStateSnapshot and UpdateErrorDescriptor shapes and bounds', () => {
        expect(
            IsUpdateStateSnapshot({
                status: 'downloading',
                currentVersion: '6.3.0',
                targetVersion: '6.3.1',
                downloadProgress: 42,
                platform: 'desktop',
            })
        ).toBe(true);

        expect(
            IsUpdateErrorDescriptor({
                code: 'download-failed',
                message: 'Connection reset',
                recoverable: true,
            })
        ).toBe(true);

        expect(IsUpdateStateSnapshot({ status: 'idle', currentVersion: '' })).toBe(false);
        expect(
            IsUpdateStateSnapshot({
                status: 'downloading',
                currentVersion: '6.3.0',
                downloadProgress: 101,
            })
        ).toBe(false);
        expect(
            IsUpdateStateSnapshot({
                status: 'downloading',
                currentVersion: '6.3.0',
                downloadProgress: -1,
            })
        ).toBe(false);
        expect(
            IsUpdateErrorDescriptor({
                code: 'bogus-code',
                message: 'bad',
                recoverable: true,
            })
        ).toBe(false);
    });

    it('enforces deterministic UpdateStatus state-machine transitions', () => {
        expect(UPDATE_STATE_TRANSITIONS.idle).toContain('checking');
        expect(IsValidUpdateTransition('idle', 'checking')).toBe(true);
        expect(IsValidUpdateTransition('checking', 'downloading')).toBe(true);
        expect(IsValidUpdateTransition('downloading', 'ready-to-apply')).toBe(true);
        expect(IsValidUpdateTransition('checking', 'store-upgrade-required')).toBe(true);
        expect(IsValidUpdateTransition('checking', 'idle')).toBe(true);
        expect(IsValidUpdateTransition('downloading', 'idle')).toBe(true);

        // Forbidden transitions
        expect(IsValidUpdateTransition('idle', 'downloading')).toBe(false);
        expect(IsValidUpdateTransition('idle', 'ready-to-apply')).toBe(false);
        expect(IsValidUpdateTransition('store-upgrade-required', 'downloading')).toBe(false);
        expect(IsValidUpdateTransition('store-upgrade-required', 'ready-to-apply')).toBe(false);

        const regression = ValidateUpdateTransition(
            { status: 'downloading', currentVersion: '6.3.0', downloadProgress: 75 },
            { status: 'downloading', currentVersion: '6.3.0', downloadProgress: 40 }
        );
        expect(regression.valid).toBe(false);
        expect(regression.errors[0]).toContain('regress');

        const incompleteReady = ValidateUpdateTransition(
            { status: 'downloading', currentVersion: '6.3.0', downloadProgress: 90 },
            { status: 'ready-to-apply', currentVersion: '6.3.0', downloadProgress: 90 }
        );
        expect(incompleteReady.valid).toBe(false);
        expect(incompleteReady.errors[0]).toContain('100');
    });

    it('exercises Web (SwUpdate), Mobile (expo-updates), and Desktop (electron-updater) OTA fixtures', async () => {
        for (const platform of UPDATE_PLATFORMS) {
            const { adapter, emitted, applyCount } = createSimulatedAdapter(platform, '6.3.0', 'ota-ready');
            expect(IsUpdateHostAdapter(adapter)).toBe(true);

            const listener = vi.fn();
            const unsubscribe = adapter.subscribe(listener);

            const finalSnapshot = await adapter.checkForUpdates();
            expect(finalSnapshot.status).toBe('ready-to-apply');
            expect(finalSnapshot.targetVersion).toBe('6.3.1');
            expect(finalSnapshot.downloadProgress).toBe(100);
            expect(emitted.map((s) => s.status)).toEqual([
                'checking',
                'downloading',
                'downloading',
                'downloading',
                'ready-to-apply',
            ]);
            expect(listener).toHaveBeenCalledTimes(5);

            await adapter.applyUpdate();
            expect(applyCount()).toBe(1);
            expect(listener).toHaveBeenCalledTimes(6);

            // Idempotent unsubscribe
            unsubscribe();
            unsubscribe();
        }
    });

    it('handles hard store-upgrade-required and transient failure reversions to idle', async () => {
        const mobileStore = createSimulatedAdapter('mobile', '6.1.0', 'store-required');
        const storeSnapshot = await mobileStore.adapter.checkForUpdates();
        expect(storeSnapshot.status).toBe('store-upgrade-required');
        expect(storeSnapshot.minSupportedClientVersion).toBe('6.4.0');
        await expect(mobileStore.adapter.applyUpdate()).rejects.toThrow('Cannot apply update');

        const offlineWeb = createSimulatedAdapter('web', '6.3.0', 'offline-error');
        const offlineSnapshot = await offlineWeb.adapter.checkForUpdates();
        expect(offlineSnapshot.status).toBe('idle');
        expect(offlineSnapshot.error?.code).toBe('network-offline');
        expect(offlineSnapshot.error?.recoverable).toBe(true);

        const badSigDesktop = createSimulatedAdapter('desktop', '6.3.0', 'signature-error');
        const sigSnapshot = await badSigDesktop.adapter.checkForUpdates();
        expect(sigSnapshot.status).toBe('idle');
        expect(sigSnapshot.error?.code).toBe('signature-invalid');
        expect(sigSnapshot.error?.recoverable).toBe(false);
    });
});
