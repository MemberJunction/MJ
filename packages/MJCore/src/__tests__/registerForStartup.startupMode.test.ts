/**
 * Tests for startup modes ('full' | 'task') on StartupManager and the
 * ResolveStartupMode precedence chain:
 *   MJ_STARTUP_MODE env var > programmatic option > config value > caller default
 */

import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import {
    StartupManager,
    ResolveStartupMode,
    STARTUP_MODE_ENV_VAR,
    IStartupSink,
    RegisterForStartupOptions,
    StartupRegistration
} from '../generic/RegisterForStartup';
import { LocalCacheManager } from '../generic/localCacheManager';
import { IMetadataProvider, UserInfo } from '../index';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

type HandleStartupSpy = ReturnType<typeof vi.fn<(contextUser?: UserInfo, provider?: IMetadataProvider) => Promise<void>>>;

function resetSingleton(className: string): void {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g[`___SINGLETON__${className}`];
    }
}

function makeProvider(): IMetadataProvider {
    // ExecuteLoad only touches LocalStorageProvider on the provider it receives
    return { LocalStorageProvider: new MockCacheStorageProvider() } as unknown as IMetadataProvider;
}

function registerFakeEngine(name: string, options: RegisterForStartupOptions = {}): HandleStartupSpy {
    const spy: HandleStartupSpy = vi.fn(async () => undefined);
    const instance: IStartupSink = { HandleStartup: spy };
    StartupManager.Instance.Register({
        constructor: { name } as unknown as new (...args: unknown[]) => IStartupSink,
        getInstance: () => instance,
        options
    });
    return spy;
}

describe('ResolveStartupMode precedence', () => {
    let warnSpy: MockInstance;

    beforeEach(() => {
        delete process.env[STARTUP_MODE_ENV_VAR];
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        delete process.env[STARTUP_MODE_ENV_VAR];
        warnSpy.mockRestore();
    });

    it('env var overrides option, config, and default', () => {
        process.env[STARTUP_MODE_ENV_VAR] = 'full';
        const resolved = ResolveStartupMode({ option: 'task', configValue: 'task', defaultMode: 'task' });
        expect(resolved).toEqual({ mode: 'full', source: 'env' });
    });

    it('env var is case- and whitespace-insensitive', () => {
        process.env[STARTUP_MODE_ENV_VAR] = '  TASK ';
        expect(ResolveStartupMode()).toEqual({ mode: 'task', source: 'env' });
    });

    it('programmatic option beats config value', () => {
        const resolved = ResolveStartupMode({ option: 'task', configValue: 'full' });
        expect(resolved).toEqual({ mode: 'task', source: 'option' });
    });

    it('config value beats entry-point default', () => {
        const resolved = ResolveStartupMode({ configValue: 'task', defaultMode: 'full' });
        expect(resolved).toEqual({ mode: 'task', source: 'config' });
    });

    it('falls back to the caller default, then to full', () => {
        expect(ResolveStartupMode({ defaultMode: 'task' })).toEqual({ mode: 'task', source: 'default' });
        expect(ResolveStartupMode()).toEqual({ mode: 'full', source: 'default' });
    });

    it('invalid env var warns once and falls through to the next level', () => {
        process.env[STARTUP_MODE_ENV_VAR] = 'turbo';
        const resolved = ResolveStartupMode({ configValue: 'task' });
        expect(resolved).toEqual({ mode: 'task', source: 'config' });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain(`invalid ${STARTUP_MODE_ENV_VAR}='turbo'`);
    });

    it('invalid config value warns and falls through to the default', () => {
        const resolved = ResolveStartupMode({ configValue: 'lite', defaultMode: 'task' });
        expect(resolved).toEqual({ mode: 'task', source: 'default' });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain(`invalid startup.mode='lite'`);
    });
});

describe('StartupManager startup modes', () => {
    let provider: IMetadataProvider;

    beforeEach(() => {
        resetSingleton('StartupManager');
        resetSingleton('LocalCacheManager');
        provider = makeProvider();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('full mode executes all registrations (sync and deferred), matching pre-change behavior', async () => {
        const syncSpy = registerFakeEngine('SyncEngine', { priority: 10 });
        const deferredSpy = registerFakeEngine('DeferredEngine', { deferred: true });

        const result = await StartupManager.Instance.Startup(false, undefined, provider);

        expect(result.success).toBe(true);
        expect(syncSpy).toHaveBeenCalledTimes(1);
        expect(deferredSpy).toHaveBeenCalledTimes(1);
        expect(result.results.map(r => r.className)).toEqual(['SyncEngine']);
    });

    it('omitted options behave identically to full mode (backward compatibility)', async () => {
        const spy = registerFakeEngine('LegacyEngine');
        const result = await StartupManager.Instance.Startup(false, undefined, provider, undefined);
        expect(result.success).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('task mode executes zero registrations but still succeeds', async () => {
        const syncSpy = registerFakeEngine('SyncEngine');
        const deferredSpy = registerFakeEngine('DeferredEngine', { deferred: true });

        const result = await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });

        expect(result.success).toBe(true);
        expect(result.results).toEqual([]);
        expect(syncSpy).not.toHaveBeenCalled();
        expect(deferredSpy).not.toHaveBeenCalled();
        expect(StartupManager.Instance.LoadCompleted).toBe(true);
    });

    it('task mode still initializes LocalCacheManager', async () => {
        registerFakeEngine('SyncEngine');
        expect(LocalCacheManager.Instance.IsInitialized).toBe(false);
        await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });
        expect(LocalCacheManager.Instance.IsInitialized).toBe(true);
    });

    it('engineFilter restricts the execution set in full mode', async () => {
        const keepSpy = registerFakeEngine('KeepEngine');
        const dropSpy = registerFakeEngine('DropEngine');
        const dropDeferredSpy = registerFakeEngine('DropDeferredEngine', { deferred: true });

        const result = await StartupManager.Instance.Startup(false, undefined, provider, {
            mode: 'full',
            engineFilter: (reg: StartupRegistration) => reg.constructor.name === 'KeepEngine'
        });

        expect(result.success).toBe(true);
        expect(keepSpy).toHaveBeenCalledTimes(1);
        expect(dropSpy).not.toHaveBeenCalled();
        expect(dropDeferredSpy).not.toHaveBeenCalled();
    });

    it('repeat Startup calls return the cached result without re-executing', async () => {
        const spy = registerFakeEngine('SyncEngine');

        const first = await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });
        const second = await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });

        expect(second).toBe(first);
        expect(spy).not.toHaveBeenCalled();
    });

    it('a task-mode boot can opt up to a full run via forceRefresh', async () => {
        const syncSpy = registerFakeEngine('SyncEngine');
        const deferredSpy = registerFakeEngine('DeferredEngine', { deferred: true });

        await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });
        expect(syncSpy).not.toHaveBeenCalled();

        const full = await StartupManager.Instance.Startup(true, undefined, provider, { mode: 'full' });

        expect(full.success).toBe(true);
        expect(syncSpy).toHaveBeenCalledTimes(1);
        expect(deferredSpy).toHaveBeenCalledTimes(1);
    });
});
