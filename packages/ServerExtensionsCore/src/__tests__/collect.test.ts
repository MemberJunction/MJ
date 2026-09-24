/**
 * Unit tests for Open App server-extension collect / normalize / merge.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    MJ_SERVER_EXTENSIONS_EXPORT,
    DescribeServerExtensionMount,
    ExtractServerExtensionsFromModule,
    ExtractServerExtensionsFromPackageJson,
    MergeServerExtensionConfigs,
    NormalizeServerExtensionConfigs,
    PrepareServerExtensionConfigs,
    ServerExtensionRootsOverlap,
    ValidateServerExtensionRootPath,
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
        expect(NormalizeServerExtensionConfigs(null)).toEqual([]);
        expect(NormalizeServerExtensionConfigs(undefined)).toEqual([]);
    });

    it('returns [] and reports when raw is not an array', () => {
        const onInvalid = vi.fn();
        expect(NormalizeServerExtensionConfigs({ DriverClass: 'X' }, { source: 'pkg', onInvalid })).toEqual([]);
        expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining('must be an array (pkg)'));
    });

    it('accepts a valid array and defaults Enabled/Settings', () => {
        const result = NormalizeServerExtensionConfigs([
            { DriverClass: 'ExtA', RootPath: '/a' },
        ]);
        expect(result).toEqual([
            { Enabled: true, DriverClass: 'ExtA', RootPath: '/a', Settings: {} },
        ]);
    });

    it('trims DriverClass and RootPath', () => {
        const result = NormalizeServerExtensionConfigs([
            { Enabled: false, DriverClass: '  ExtA  ', RootPath: ' /a/ ', Settings: { k: 1 } },
        ]);
        expect(result).toEqual([
            { Enabled: false, DriverClass: 'ExtA', RootPath: '/a/', Settings: { k: 1 } },
        ]);
    });

    it('skips reserved RootPaths fail-closed', () => {
            const onInvalid = vi.fn();
            const result = NormalizeServerExtensionConfigs(
                [
                    { DriverClass: 'ShadowGraphql', RootPath: '/graphql' },
                    { DriverClass: 'Ok', RootPath: '/checkout' },
                ],
                { onInvalid }
            );
            expect(result.map((c) => c.DriverClass)).toEqual(['Ok']);
            expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining('reserved prefix'));
        });

    it('skips non-objects, missing DriverClass, missing RootPath, and non-boolean Enabled', () => {
        const onInvalid = vi.fn();
        const result = NormalizeServerExtensionConfigs(
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
        const result = NormalizeServerExtensionConfigs(
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
        expect(ExtractServerExtensionsFromModule(null)).toEqual([]);
        expect(ExtractServerExtensionsFromModule(undefined)).toEqual([]);
    });

    it('returns [] when the named export is absent', () => {
        expect(ExtractServerExtensionsFromModule({ RESOLVER_PATHS: ['/x'] })).toEqual([]);
    });

    it(`reads ${MJ_SERVER_EXTENSIONS_EXPORT}`, () => {
        const mod = {
            [MJ_SERVER_EXTENSIONS_EXPORT]: [webhook, checkout],
        };
        expect(ExtractServerExtensionsFromModule(mod)).toEqual([
            webhook,
            { ...checkout, Settings: {} },
        ]);
    });

    it('normalizes invalid export payloads instead of throwing', () => {
        const onInvalid = vi.fn();
        expect(
            ExtractServerExtensionsFromModule(
                { [MJ_SERVER_EXTENSIONS_EXPORT]: { DriverClass: 'X' } },
                { onInvalid }
            )
        ).toEqual([]);
        expect(onInvalid).toHaveBeenCalled();
    });
});

describe('extractServerExtensionsFromPackageJson', () => {
    it('returns [] when memberjunction.serverExtensions is absent', () => {
        expect(ExtractServerExtensionsFromPackageJson(null)).toEqual([]);
        expect(ExtractServerExtensionsFromPackageJson({})).toEqual([]);
        expect(ExtractServerExtensionsFromPackageJson({ memberjunction: {} })).toEqual([]);
        expect(ExtractServerExtensionsFromPackageJson({ memberjunction: 'nope' })).toEqual([]);
    });

    it('reads memberjunction.serverExtensions', () => {
        const pkg = {
            name: '@mj-biz-apps/orders-server',
            memberjunction: {
                serverExtensions: [webhook],
            },
        };
        expect(ExtractServerExtensionsFromPackageJson(pkg)).toEqual([webhook]);
    });
});

describe('mergeServerExtensionConfigs', () => {
    it('returns [] when both sides are empty/null', () => {
        expect(MergeServerExtensionConfigs(null, undefined)).toEqual([]);
        expect(MergeServerExtensionConfigs([], [])).toEqual([]);
    });

    it('returns discovered-only and host-only lists unchanged (cloned)', () => {
        const discoveredOnly = MergeServerExtensionConfigs([webhook, checkout], []);
        expect(discoveredOnly).toEqual([webhook, checkout]);
        expect(discoveredOnly[0]).not.toBe(webhook);
        expect(discoveredOnly[0].Settings).not.toBe(webhook.Settings);

        expect(MergeServerExtensionConfigs([], [slack])).toEqual([slack]);
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
        expect(MergeServerExtensionConfigs(discovered, host)).toEqual([
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
        expect(MergeServerExtensionConfigs(discovered, host)[0].RootPath).toBe('/checkout');
        expect(MergeServerExtensionConfigs(discovered, host)[0].Settings).toEqual({ k: 1 });
    });

    it('host Enabled: false keeps the DriverClass so the loader skips it (no discovered fallback)', () => {
        const merged = MergeServerExtensionConfigs(
            [checkout],
            [{ Enabled: false, DriverClass: 'OrdersCheckoutEdge', RootPath: '/checkout', Settings: {} }]
        );
        expect(merged).toEqual([
            { Enabled: false, DriverClass: 'OrdersCheckoutEdge', RootPath: '/checkout', Settings: {} },
        ]);
    });

    it('appends host-only DriverClasses after discovered ones', () => {
        const merged = MergeServerExtensionConfigs([webhook, checkout], [slack]);
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
        const merged = MergeServerExtensionConfigs([first, second], []);
        expect(merged).toEqual([second]);
        expect(merged).toHaveLength(1);
    });

    it('skips entries with empty DriverClass', () => {
        const merged = MergeServerExtensionConfigs(
            [{ Enabled: true, DriverClass: '', RootPath: '/x', Settings: {} }, webhook],
            [{ Enabled: true, DriverClass: '  ', RootPath: '/y', Settings: {} }]
        );
        expect(merged).toEqual([webhook]);
    });

    it('does not mutate inputs', () => {
        const discovered = [{ ...checkout, Settings: { a: 1 } }];
        const host = [{ ...checkout, Settings: { b: 2 } }];
        MergeServerExtensionConfigs(discovered, host);
        expect(discovered[0].Settings).toEqual({ a: 1 });
        expect(host[0].Settings).toEqual({ b: 2 });
    });
});

describe('validateServerExtensionRootPath', () => {
    it('accepts ordinary extension roots', () => {
        expect(ValidateServerExtensionRootPath('/checkout')).toBeNull();
        expect(ValidateServerExtensionRootPath('/webhooks/payments')).toBeNull();
        expect(ValidateServerExtensionRootPath('/webhook/slack')).toBeNull();
    });

    it('rejects missing slash, wildcards, overlong paths, and the server root', () => {
        expect(ValidateServerExtensionRootPath('checkout')).toMatch(/must start with '\//);
        expect(ValidateServerExtensionRootPath('/check*out')).toMatch(/wildcards/);
        expect(ValidateServerExtensionRootPath('/')).toMatch(/reserved/);
        expect(ValidateServerExtensionRootPath(`/${'a'.repeat(128)}`)).toMatch(/exceeds/);
    });

    it('rejects reserved core prefixes without false-positive on similar names', () => {
        expect(ValidateServerExtensionRootPath('/graphql')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/graphql/extra')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/auth/providers')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/health/extensions')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/oauth')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/magic-link/redeem')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/healthcare')).toBeNull();
        expect(ValidateServerExtensionRootPath('/authorize-me')).toBeNull();
    });

    it('rejects reserved prefixes case-insensitively (Express routing is case-insensitive)', () => {
        expect(ValidateServerExtensionRootPath('/Auth')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/AUTH/providers')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/GraphQL')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/OAuth')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/Health')).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/Magic-Link/redeem')).toMatch(/reserved prefix/);
        // Sibling of /health, not nested under it — needs extraReservedRoots from serve().
        expect(ValidateServerExtensionRootPath('/healthcheck')).toBeNull();
        expect(ValidateServerExtensionRootPath('/Healthcheck')).toBeNull();
    });

    it('rejects extra reserved roots from the running server, including parent-path shadowing', () => {
        const extra = ['/healthcheck', '/esignature', '/media', '/widget', '/telephony/twilio', '/api'];
        expect(ValidateServerExtensionRootPath('/healthcheck', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/Healthcheck', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/esignature/webhook', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/media', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/widget/session', extra)).toMatch(/reserved prefix/);
        // Parent of a reserved mount: Express prefix-match would shadow the core route.
        expect(ValidateServerExtensionRootPath('/telephony', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/telephony/twilio', extra)).toMatch(/reserved prefix/);
        // graphqlRootPath other than the static /graphql baseline.
        expect(ValidateServerExtensionRootPath('/api', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/api/v1', extra)).toMatch(/reserved prefix/);
        expect(ValidateServerExtensionRootPath('/apiv2', extra)).toBeNull();
        expect(ValidateServerExtensionRootPath('/checkout', extra)).toBeNull();
        expect(ValidateServerExtensionRootPath('/healthcare', extra)).toBeNull();
    });
});

describe('serverExtensionRootsOverlap', () => {
    it('detects equal and nested roots', () => {
        expect(ServerExtensionRootsOverlap('/checkout', '/checkout/')).toBe(true);
        expect(ServerExtensionRootsOverlap('/webhooks', '/webhooks/payments')).toBe(true);
        expect(ServerExtensionRootsOverlap('/a', '/b')).toBe(false);
        expect(ServerExtensionRootsOverlap('/checkout', '/check')).toBe(false);
    });

    it('treats casing as overlapping because Express does', () => {
        expect(ServerExtensionRootsOverlap('/Checkout', '/checkout')).toBe(true);
        expect(ServerExtensionRootsOverlap('/Webhooks', '/webhooks/payments')).toBe(true);
    });
});

describe('prepareServerExtensionConfigs', () => {
    it('drops invalid roots fail-closed and keeps valid ones', () => {
        const onInvalid = vi.fn();
        const result = PrepareServerExtensionConfigs(
            [
                { Enabled: true, DriverClass: 'Good', RootPath: '/checkout', Settings: {} },
                { Enabled: true, DriverClass: 'BadRoot', RootPath: '/', Settings: {} },
                { Enabled: true, DriverClass: 'BadGraphql', RootPath: '/graphql', Settings: {} },
            ],
            { onInvalid }
        );
        expect(result.map((c) => c.DriverClass)).toEqual(['Good']);
        expect(onInvalid).toHaveBeenCalledTimes(2);
    });

    it('warns when two enabled extensions overlap, and keeps disabled entries', () => {
        const onOverlap = vi.fn();
        const result = PrepareServerExtensionConfigs(
            [
                { Enabled: true, DriverClass: 'A', RootPath: '/webhooks', Settings: {} },
                { Enabled: true, DriverClass: 'B', RootPath: '/webhooks/payments', Settings: {} },
                { Enabled: false, DriverClass: 'Off', RootPath: '/webhooks', Settings: {} },
            ],
            { onOverlap }
        );
        expect(result).toHaveLength(3);
        expect(onOverlap).toHaveBeenCalledWith(expect.stringContaining('overlapping RootPaths'));
        expect(result.find((c) => c.DriverClass === 'Off')?.Enabled).toBe(false);
    });

    it('drops extra-reserved and cased reserved roots fail-closed, keeping original RootPath casing', () => {
        const onInvalid = vi.fn();
        const result = PrepareServerExtensionConfigs(
            [
                { Enabled: true, DriverClass: 'Checkout', RootPath: '/Checkout', Settings: {} },
                { Enabled: true, DriverClass: 'AuthCased', RootPath: '/Auth', Settings: {} },
                { Enabled: true, DriverClass: 'Healthcheck', RootPath: '/healthcheck', Settings: {} },
                { Enabled: true, DriverClass: 'TelephonyParent', RootPath: '/telephony', Settings: {} },
            ],
            {
                onInvalid,
                extraReservedRoots: ['/healthcheck', '/telephony/twilio'],
            }
        );
        expect(result.map((c) => c.DriverClass)).toEqual(['Checkout']);
        expect(result[0].RootPath).toBe('/Checkout');
        expect(onInvalid).toHaveBeenCalledTimes(3);
    });

    it('warns on case-insensitive overlap between enabled extensions', () => {
        const onOverlap = vi.fn();
        PrepareServerExtensionConfigs(
            [
                { Enabled: true, DriverClass: 'A', RootPath: '/Webhooks', Settings: {} },
                { Enabled: true, DriverClass: 'B', RootPath: '/webhooks/payments', Settings: {} },
            ],
            { onOverlap }
        );
        expect(onOverlap).toHaveBeenCalledTimes(1);
    });
});

describe('describeServerExtensionMount', () => {
    it('names DriverClass, RootPath, enabled state, and PRE-AUTH', () => {
        const line = DescribeServerExtensionMount(checkout);
        expect(line).toContain('OrdersCheckoutEdge');
        expect(line).toContain('/checkout');
        expect(line).toContain('enabled');
        expect(line).toContain('PRE-AUTH');
        expect(line).toContain('Enabled: false');
    });

    it('names POST-AUTH when Phase is post-auth', () => {
        const line = DescribeServerExtensionMount({ ...checkout, Phase: 'post-auth' });
        expect(line).toContain('POST-AUTH');
    });
});

describe('Phase support in collect', () => {
    it('normalizes valid Phase values', () => {
        const normalized = NormalizeServerExtensionConfigs([
            { DriverClass: 'Pre', RootPath: '/pre', Phase: 'pre-auth' },
            { DriverClass: 'Post', RootPath: '/post', Phase: 'post-auth' },
        ]);
        expect(normalized[0].Phase).toBe('pre-auth');
        expect(normalized[1].Phase).toBe('post-auth');
    });

    it('rejects invalid Phase values and logs warning', () => {
        const onInvalid = vi.fn();
        const raw = [{ DriverClass: 'BadPhase', RootPath: '/bad', Phase: 'invalid-phase' }];
        const normalized = NormalizeServerExtensionConfigs(raw, { onInvalid });
        expect(normalized[0].Phase).toBeUndefined();
        expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining("Phase must be 'pre-auth' or 'post-auth'"));
    });

    it('merges Phase with host overlay precedence', () => {
        const discovered: ServerExtensionConfig[] = [
            { Enabled: true, DriverClass: 'Ext', RootPath: '/ext', Phase: 'pre-auth', Settings: {} },
        ];
        const host: ServerExtensionConfig[] = [
            { Enabled: true, DriverClass: 'Ext', RootPath: '/ext', Phase: 'post-auth', Settings: {} },
        ];
        const merged = MergeServerExtensionConfigs(discovered, host);
        expect(merged[0].Phase).toBe('post-auth');
    });
});
