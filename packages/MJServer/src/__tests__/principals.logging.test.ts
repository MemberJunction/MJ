/**
 * Log policy for context-user resolution — the second half of issue #4209.
 *
 * The defect had two costs. One was attribution (covered by principals.test.ts). The other was
 * volume: because the shipped default could never resolve, EVERY magic-link redeem and EVERY
 * auto-provisioned user emitted an error-level line, on every host that took the default. Real
 * errors were buried under it.
 *
 * Resolution is a pure function; this file covers the impure shell around it — reading the user
 * cache and deciding how often a misconfiguration is worth saying out loud.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogError, mockUsers, SYSTEM_USER_ID } = vi.hoisted(() => ({
    mockLogError: vi.fn(),
    mockUsers: [] as Array<Record<string, unknown>>,
    SYSTEM_USER_ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
}));

vi.mock('@memberjunction/core', () => ({
    LogError: mockLogError,
    UserInfo: class {},
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Users() {
            return mockUsers;
        },
        Instance: {
            get Users() {
                return mockUsers;
            },
            get SYSTEM_USER_ID() {
                return SYSTEM_USER_ID;
            },
        },
    },
}));

/** Stock seed: the system user MJ's own default is aiming at, plus a human Owner. */
const SYSTEM = { ID: SYSTEM_USER_ID, Name: 'System', Email: 'not.set@nowhere.com', Type: 'Owner          ', IsActive: true };
const HOST_ADMIN = { ID: 'AAAA1111-0000-0000-0000-000000000001', Name: 'jane.admin@acme.com', Email: 'jane.admin@acme.com', Type: 'Owner', IsActive: true };

/** Fresh module per test: the de-duplication state is module-scoped by design. */
async function loadSubject() {
    vi.resetModules();
    return import('../auth/principals.js');
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.length = 0;
    mockUsers.push(SYSTEM, HOST_ADMIN);
});

describe('ResolveConfiguredPrincipal', () => {
    it('resolves MJ\'s own shipped default without logging anything', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        const user = ResolveConfiguredPrincipal('not.set@nowhere.com', 'MagicLink');

        expect(user).toBe(SYSTEM);
        expect(mockLogError).not.toHaveBeenCalled();
    });

    it('logs an unresolvable candidate ONCE however many times it is asked for', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        for (let i = 0; i < 25; i++) {
            ResolveConfiguredPrincipal('ghost@nowhere.example', 'MagicLink');
        }

        expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    it('names both the purpose and the candidate so the operator can find the setting', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        ResolveConfiguredPrincipal('ghost@nowhere.example', 'MagicLink');

        const logged = String(mockLogError.mock.calls[0][0]);
        expect(logged).toContain('MagicLink');
        expect(logged).toContain('ghost@nowhere.example');
    });

    it('still reports a DIFFERENT misconfiguration rather than swallowing it', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        ResolveConfiguredPrincipal('ghost@nowhere.example', 'MagicLink');
        ResolveConfiguredPrincipal('other@nowhere.example', 'MagicLink');

        expect(mockLogError).toHaveBeenCalledTimes(2);
    });

    it('reports the same candidate separately for a different purpose', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        ResolveConfiguredPrincipal('ghost@nowhere.example', 'MagicLink');
        ResolveConfiguredPrincipal('ghost@nowhere.example', 'Widget');

        expect(mockLogError).toHaveBeenCalledTimes(2);
    });

    it('does not treat an unset candidate as a misconfiguration', async () => {
        const { ResolveConfiguredPrincipal } = await loadSubject();

        const user = ResolveConfiguredPrincipal(undefined, 'NewUser');

        expect(user).toBe(SYSTEM);
        expect(mockLogError).not.toHaveBeenCalled();
    });

    it('returns null and says so when the deployment offers no principal at all', async () => {
        mockUsers.length = 0;
        const { ResolveConfiguredPrincipal } = await loadSubject();

        const user = ResolveConfiguredPrincipal('ghost@nowhere.example', 'MagicLink');

        expect(user).toBeNull();
        expect(mockLogError).toHaveBeenCalledTimes(1);
    });
});

describe('the misconfiguration report stays bounded WITHOUT regressing to per-request logging', () => {
    it('publishes its bound, so this test cannot silently pass against a different one', async () => {
        const { MAX_REPORTED_MISCONFIGURATIONS } = await loadSubject();

        expect(typeof MAX_REPORTED_MISCONFIGURATIONS).toBe('number');
        expect(MAX_REPORTED_MISCONFIGURATIONS).toBeGreaterThan(0);
    });

    it('still says a NEW misconfiguration exactly once after the bound is reached', async () => {
        // The bound exists so a caller passing a per-request candidate cannot grow the tracker
        // forever. But whatever it does at the limit must not be "log every time" — that is
        // precisely the per-request error line issue #4209 was filed about, reintroduced for the
        // one caller the bound was added for.
        const { ResolveConfiguredPrincipal, MAX_REPORTED_MISCONFIGURATIONS } = await loadSubject();
        expect(typeof MAX_REPORTED_MISCONFIGURATIONS).toBe('number'); // else the loop below is a no-op and this passes for free
        for (let i = 0; i < MAX_REPORTED_MISCONFIGURATIONS + 5; i++) {
            ResolveConfiguredPrincipal(`filler-${i}@nowhere.example`, 'MagicLink');
        }
        mockLogError.mockClear();

        ResolveConfiguredPrincipal('late@nowhere.example', 'MagicLink');
        ResolveConfiguredPrincipal('late@nowhere.example', 'MagicLink');
        ResolveConfiguredPrincipal('late@nowhere.example', 'MagicLink');

        expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    it('does not grow without bound', async () => {
        const { ResolveConfiguredPrincipal, ReportedMisconfigurationCount, MAX_REPORTED_MISCONFIGURATIONS } = await loadSubject();
        for (let i = 0; i < MAX_REPORTED_MISCONFIGURATIONS * 3; i++) {
            ResolveConfiguredPrincipal(`filler-${i}@nowhere.example`, 'MagicLink');
        }

        expect(ReportedMisconfigurationCount()).toBeLessThanOrEqual(MAX_REPORTED_MISCONFIGURATIONS);
    });
});
