/**
 * Unit tests for Open App server-extension collect / normalize / merge.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    MJ_SERVER_EXTENSIONS_EXPORT,
    extractServerExtensionsFromModule,
    extractServerExtensionsFromPackageJson,
    mergeServerExtensionConfigs,
    normalizeServerExtensionConfigs,
} from '../collect.js';
import { ServerExtensionConfig } from '../types.js';

const webhook: ServerExtensionConfig = {
    Enabled: true,
    DriverClass: 'OrdersPaymentWebhook',
    RootPath: '/webhooks/payments',
    Settings: {},
};

const checkout: ServerExtensionConfig = {
    Enabled: true,
    DriverClass: 'OrdersCheckoutEdge',
    RootPath: '/checkout',
    Settings: {},
};

const slack: ServerExtensionConfig = {
    Enabled: true,
    DriverClass: 'SlackMessagingExtension',
    RootPath: '/webhook/slack',
    Settings: { BotToken: 'x' },
};

describe('normalizeServerExtensionConfigs', () => {
    it('returns [] for null/undefined', () => {
        expect(normalizeServerExtensionConfigs(null)).toEqual([]);
        expect(normalizeServerExtensionConfigs(undefined)).toEqual([]);
    });

    it('returns [] and reports when raw is not an array', () => {
        const onInvalid = vi.fn();
        expect(normalizeServerExtensionConfigs({ DriverClass: 'X' }, { source: 'pkg', onInvalid })).toEqual([]);
        expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining('must be an array (pkg)'));
    });

    it('accepts a valid array and defaults Enabled/Settings', () => {
        const result = normalizeServerExtensionConfigs([
            { DriverClass: 'ExtA', RootPath: '/a' },
        ]);
        expect(result).toEqual([
            { Enabled: true, DriverClass: 'ExtA', RootPath: '/a', Settings: {} },
        ]);
    });

    it('trims DriverClass and RootPath', () => {
        const result = normalizeServerExtensionConfigs([
            { Enabled: false, DriverClass: '  ExtA  ', RootPath: ' /a/ ', Settings: { k: 1 } },
        ]);
        expect(result).toEqual([
            { Enabled: false, DriverClass: 'ExtA', RootPath: '/a/', Settings: { k: 1 } },
        ]);
    });

    it('skips non-objects, missing DriverClass, missing RootPath, and non-boolean Enabled', () => {
        const onInvalid = vi.fn();
        const result = normalizeServerExtensionConfigs(
            [
                null,
                'nope',
                { RootPath: '/a' },
                { DriverClass: '  ', RootPath: '/a' },
                { DriverClass: 'NoPath' },
                { DriverClass: 'BadEnabled', RootPath: '/b', Enabled: 'true' },
                { DriverClass: 'Good', RootPath: '/g' },
            ],
            { source: 'pkg', onInvalid }
        );
        expect(result).toEqual([
            { Enabled: true, DriverClass: 'Good', RootPath: '/g', Settings: {} },
        ]);
        expect(onInvalid).toHaveBeenCalledTimes(6);
    });

    it('coerces non-object Settings to {} and reports', () => {
        const onInvalid = vi.fn();
        const result = normalizeServerExtensionConfigs(
            [{ DriverClass: 'ExtA', RootPath: '/a', Settings: 'nope' }],
            { onInvalid }
        );
        expect(result).toEqual([
            { Enabled: true, DriverClass: 'ExtA', RootPath: '/a', Settings: {} },
        ]);
        expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining('Settings is not an object'));
    });
});

describe('extractServerExtensionsFromModule', () => {
    it('returns [] for null/undefined/non-object modules', () => {
        expect(extractServerExtensionsFromModule(null)).toEqual([]);
        expect(extractServerExtensionsFromModule(undefined)).toEqual([]);
    });

    it('returns [] when the named export is absent', () => {
        expect(extractServerExtensionsFromModule({ RESOLVER_PATHS: ['/x'] })).toEqual([]);
    });

    it(`reads ${MJ_SERVER_EXTENSIONS_EXPORT}`, () => {
        const mod = {
            [MJ_SERVER_EXTENSIONS_EXPORT]: [webhook, checkout],
        };
        expect(extractServerExtensionsFromModule(mod)).toEqual([
            webhook,
            { ...checkout, Settings: {} },
        ]);
    });

    it('normalizes invalid export payloads instead of throwing', () => {
        const onInvalid = vi.fn();
        expect(
            extractServerExtensionsFromModule(
                { [MJ_SERVER_EXTENSIONS_EXPORT]: { DriverClass: 'X' } },
                { onInvalid }
            )
        ).toEqual([]);
        expect(onInvalid).toHaveBeenCalled();
    });
});

describe('extractServerExtensionsFromPackageJson', () => {
    it('returns [] when memberjunction.serverExtensions is absent', () => {
        expect(extractServerExtensionsFromPackageJson(null)).toEqual([]);
        expect(extractServerExtensionsFromPackageJson({})).toEqual([]);
        expect(extractServerExtensionsFromPackageJson({ memberjunction: {} })).toEqual([]);
        expect(extractServerExtensionsFromPackageJson({ memberjunction: 'nope' })).toEqual([]);
    });

    it('reads memberjunction.serverExtensions', () => {
        const pkg = {
            name: '@mj-biz-apps/orders-server',
            memberjunction: {
                serverExtensions: [webhook],
            },
        };
        expect(extractServerExtensionsFromPackageJson(pkg)).toEqual([webhook]);
    });
});

describe('mergeServerExtensionConfigs', () => {
    it('returns [] when both sides are empty/null', () => {
        expect(mergeServerExtensionConfigs(null, undefined)).toEqual([]);
        expect(mergeServerExtensionConfigs([], [])).toEqual([]);
    });

    it('returns discovered-only and host-only lists unchanged (cloned)', () => {
        const discoveredOnly = mergeServerExtensionConfigs([webhook, checkout], []);
        expect(discoveredOnly).toEqual([webhook, checkout]);
        expect(discoveredOnly[0]).not.toBe(webhook);
        expect(discoveredOnly[0].Settings).not.toBe(webhook.Settings);

        expect(mergeServerExtensionConfigs([], [slack])).toEqual([slack]);
    });

    it('host overlays Settings per-key and RootPath when provided', () => {
        const discovered: ServerExtensionConfig[] = [
            {
                Enabled: true,
                DriverClass: 'OrdersCheckoutEdge',
                RootPath: '/checkout',
                Settings: { RateLimitMax: 30 },
            },
        ];
        const host: ServerExtensionConfig[] = [
            {
                Enabled: true,
                DriverClass: 'OrdersCheckoutEdge',
                RootPath: '/c',
                Settings: { ServiceUserEmail: 'checkout@example.com', RateLimitMax: 10 },
            },
        ];
        expect(mergeServerExtensionConfigs(discovered, host)).toEqual([
            {
                Enabled: true,
                DriverClass: 'OrdersCheckoutEdge',
                RootPath: '/c',
                Settings: { RateLimitMax: 10, ServiceUserEmail: 'checkout@example.com' },
            },
        ]);
    });

    it('keeps discovered RootPath when host RootPath is empty', () => {
        const discovered: ServerExtensionConfig[] = [checkout];
        const host: ServerExtensionConfig[] = [
            { Enabled: true, DriverClass: 'OrdersCheckoutEdge', RootPath: '  ', Settings: { k: 1 } },
        ];
        expect(mergeServerExtensionConfigs(discovered, host)[0].RootPath).toBe('/checkout');
        expect(mergeServerExtensionConfigs(discovered, host)[0].Settings).toEqual({ k: 1 });
    });

    it('host Enabled: false keeps the DriverClass so the loader skips it (no discovered fallback)', () => {
        const merged = mergeServerExtensionConfigs(
            [checkout],
            [{ Enabled: false, DriverClass: 'OrdersCheckoutEdge', RootPath: '/checkout', Settings: {} }]
        );
        expect(merged).toEqual([
            { Enabled: false, DriverClass: 'OrdersCheckoutEdge', RootPath: '/checkout', Settings: {} },
        ]);
    });

    it('appends host-only DriverClasses after discovered ones', () => {
        const merged = mergeServerExtensionConfigs([webhook, checkout], [slack]);
        expect(merged.map((c) => c.DriverClass)).toEqual([
            'OrdersPaymentWebhook',
            'OrdersCheckoutEdge',
            'SlackMessagingExtension',
        ]);
    });

    it('later discovered entry with the same DriverClass replaces the earlier one', () => {
        const first: ServerExtensionConfig = {
            Enabled: true,
            DriverClass: 'SharedEdge',
            RootPath: '/first',
            Settings: { from: 'a' },
        };
        const second: ServerExtensionConfig = {
            Enabled: true,
            DriverClass: 'SharedEdge',
            RootPath: '/second',
            Settings: { from: 'b' },
        };
        const merged = mergeServerExtensionConfigs([first, second], []);
        expect(merged).toEqual([second]);
        expect(merged).toHaveLength(1);
    });

    it('skips entries with empty DriverClass', () => {
        const merged = mergeServerExtensionConfigs(
            [{ Enabled: true, DriverClass: '', RootPath: '/x', Settings: {} }, webhook],
            [{ Enabled: true, DriverClass: '  ', RootPath: '/y', Settings: {} }]
        );
        expect(merged).toEqual([webhook]);
    });

    it('does not mutate inputs', () => {
        const discovered = [{ ...checkout, Settings: { a: 1 } }];
        const host = [{ ...checkout, Settings: { b: 2 } }];
        mergeServerExtensionConfigs(discovered, host);
        expect(discovered[0].Settings).toEqual({ a: 1 });
        expect(host[0].Settings).toEqual({ b: 2 });
    });
});
