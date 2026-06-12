/**
 * Unit tests for {@link RealtimeChannelServerHost} — the server-side channel plugin resolution +
 * per-session lifecycle host. Covers, per the channel-plugin contract:
 *
 *  - **Resolution** from the ACTIVE `MJ: AI Agent Channels` registry rows: registered keys
 *    instantiate, unregistered keys and blank `ServerPluginClass` rows skip-with-log (never
 *    fatal), and a registry load failure degrades to "no plugins".
 *  - **Lifecycle hook order**: `Initialize(ctx)` → `OnSessionStarted()` at session start;
 *    `OnChannelStateSave` pre-persistence routing (replacement vs keep-original); `OnSessionClosed`
 *    with the close reason; deferred `Dispose()` after the post-close linger.
 *  - **Hook-failure tolerance**: a throwing plugin never throws out of the host and never
 *    affects sibling plugins or persistence.
 *  - **Per-session instance isolation**: one fresh instance per session per channel.
 *
 * The DB layer is mocked the way the neighboring realtime suites mock it: `@memberjunction/core`
 * is partially module-mocked so `RunView.FromMetadataProvider` returns a controllable spy — no DB,
 * no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock RunView.FromMetadataProvider (registry reads) while leaving the rest of core intact ---
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

import { BaseRealtimeChannelServer, RealtimeChannelServerContext, RealtimeChannelCloseReason } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { RealtimeChannelServerHost } from '../realtime/realtime-channel-server-host';

// ---------------------------------------------------------------------------------------------
// Test plugins (module-scope registration — the ClassFactory registry is append-only/global)
// ---------------------------------------------------------------------------------------------

/** Per-class call journals, keyed by instance, so tests can assert order + isolation. */
interface CallJournal {
    events: string[];
    contexts: RealtimeChannelServerContext[];
    closeReasons: Array<RealtimeChannelCloseReason | null>;
}

const journals = new Map<BaseRealtimeChannelServer, CallJournal>();

function journalOf(plugin: BaseRealtimeChannelServer): CallJournal {
    let j = journals.get(plugin);
    if (!j) {
        j = { events: [], contexts: [], closeReasons: [] };
        journals.set(plugin, j);
    }
    return j;
}

/** Behavior switches the tests flip per scenario. */
const behavior = {
    throwOnSessionStarted: false,
    throwOnStateSave: false,
    throwOnSessionClosed: false,
    stateReplacement: null as string | null,
};

@RegisterClass(BaseRealtimeChannelServer, 'HostTestAlphaServer')
class AlphaChannelServer extends BaseRealtimeChannelServer {
    public get ChannelName(): string {
        return 'Alpha';
    }
    protected override OnInitialize(): void {
        journalOf(this).events.push('initialize');
        if (this.Context) {
            journalOf(this).contexts.push(this.Context);
        }
    }
    public override async OnSessionStarted(): Promise<void> {
        journalOf(this).events.push('session-started');
        if (behavior.throwOnSessionStarted) {
            throw new Error('alpha start boom');
        }
    }
    public override async OnChannelStateSave(stateJson: string): Promise<string | null> {
        journalOf(this).events.push(`state-save:${stateJson}`);
        if (behavior.throwOnStateSave) {
            throw new Error('alpha save boom');
        }
        return behavior.stateReplacement;
    }
    public override async OnSessionClosed(closeReason: RealtimeChannelCloseReason | null): Promise<void> {
        journalOf(this).events.push('session-closed');
        journalOf(this).closeReasons.push(closeReason);
        if (behavior.throwOnSessionClosed) {
            throw new Error('alpha close boom');
        }
    }
    public override Dispose(): void {
        journalOf(this).events.push('dispose');
        super.Dispose();
    }
}

@RegisterClass(BaseRealtimeChannelServer, 'HostTestBetaServer')
class BetaChannelServer extends BaseRealtimeChannelServer {
    public get ChannelName(): string {
        return 'Beta';
    }
    public override async OnSessionStarted(): Promise<void> {
        journalOf(this).events.push('session-started');
    }
    public override async OnChannelStateSave(stateJson: string): Promise<string | null> {
        journalOf(this).events.push(`state-save:${stateJson}`);
        return `beta:${stateJson}`;
    }
    public override async OnSessionClosed(closeReason: RealtimeChannelCloseReason | null): Promise<void> {
        journalOf(this).events.push('session-closed');
        journalOf(this).closeReasons.push(closeReason);
    }
    public override Dispose(): void {
        journalOf(this).events.push('dispose');
        super.Dispose();
    }
}

// Keep the classes referenced so the decorators can never be tree-shaken in the test bundle.
void AlphaChannelServer;
void BetaChannelServer;

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const USER = { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

function ctx(sessionID = 'session-1'): RealtimeChannelServerContext {
    return { AgentSessionID: sessionID, AgentID: 'agent-1', UserID: 'user-1', ConversationID: 'conv-1' };
}

interface RegistryRow {
    ID: string;
    Name: string;
    ServerPluginClass: string | null;
}

function setRegistryRows(rows: RegistryRow[]): void {
    runViewMock.mockResolvedValue({ Success: true, Results: rows });
}

const ALPHA_ROW: RegistryRow = { ID: 'ch-a', Name: 'Alpha', ServerPluginClass: 'HostTestAlphaServer' };
const BETA_ROW: RegistryRow = { ID: 'ch-b', Name: 'Beta', ServerPluginClass: 'HostTestBetaServer' };

/** Fresh host per test: evict the singleton from the Global Object Store and re-resolve. */
function freshHost(): RealtimeChannelServerHost {
    const stale = RealtimeChannelServerHost.Instance;
    const store = stale.GetGlobalObjectStore() as Record<string, unknown>;
    delete store[stale.GlobalKey];
    const host = RealtimeChannelServerHost.Instance;
    host.DisposeLingerMs = 0; // immediate disposal unless a test opts into the linger explicitly
    return host;
}

let host: RealtimeChannelServerHost;

beforeEach(() => {
    runViewMock.mockReset();
    journals.clear();
    behavior.throwOnSessionStarted = false;
    behavior.throwOnStateSave = false;
    behavior.throwOnSessionClosed = false;
    behavior.stateReplacement = null;
    host = freshHost();
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

describe('RealtimeChannelServerHost — resolution from the channel registry', () => {
    it('instantiates one plugin per ACTIVE row with a registered ServerPluginClass', async () => {
        setRegistryRows([ALPHA_ROW, BETA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBeInstanceOf(AlphaChannelServer);
        expect(host.GetSessionPlugin('session-1', 'Beta')).toBeInstanceOf(BetaChannelServer);
        expect(host.ActiveSessionCount).toBe(1);
        // The registry read filters to active rows with the narrowed read-only shape.
        expect(runViewMock).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: AI Agent Channels',
                ExtraFilter: 'IsActive = 1',
                ResultType: 'simple',
            }),
            USER,
        );
    });

    it('skips (never fatal) rows whose plugin class is unregistered, keeping registered siblings', async () => {
        setRegistryRows([
            { ID: 'ch-x', Name: 'Ghost', ServerPluginClass: 'NoSuchServerPlugin' },
            ALPHA_ROW,
        ]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        expect(host.GetSessionPlugin('session-1', 'Ghost')).toBeNull();
        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBeInstanceOf(AlphaChannelServer);
    });

    it('skips rows with a blank/whitespace ServerPluginClass', async () => {
        setRegistryRows([
            { ID: 'ch-x', Name: 'Blank', ServerPluginClass: '   ' },
            { ID: 'ch-y', Name: 'Nullish', ServerPluginClass: null },
            ALPHA_ROW,
        ]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        expect(host.GetSessionPlugin('session-1', 'Blank')).toBeNull();
        expect(host.GetSessionPlugin('session-1', 'Nullish')).toBeNull();
        expect(host.GetSessionPlugin('session-1', 'Alpha')).not.toBeNull();
    });

    it('degrades to no plugins (never throws) when the registry read fails', async () => {
        runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'registry down' });
        await expect(host.OnSessionStarted(ctx(), USER, PROVIDER)).resolves.toBeUndefined();
        expect(host.ActiveSessionCount).toBe(0);
    });

    it('degrades to no plugins (never throws) when the registry read rejects', async () => {
        runViewMock.mockRejectedValue(new Error('connection refused'));
        await expect(host.OnSessionStarted(ctx(), USER, PROVIDER)).resolves.toBeUndefined();
        expect(host.ActiveSessionCount).toBe(0);
    });

    it('ignores a duplicate session-start notification (no double initialization)', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        const first = host.GetSessionPlugin('session-1', 'Alpha');

        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBe(first);
        expect(journalOf(first as BaseRealtimeChannelServer).events.filter(e => e === 'initialize')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------------------------
// Lifecycle hook order
// ---------------------------------------------------------------------------------------------

describe('RealtimeChannelServerHost — lifecycle hook invocation order', () => {
    it('brackets session start as Initialize(ctx) → OnSessionStarted, with the session context bound', async () => {
        setRegistryRows([ALPHA_ROW]);
        const context = ctx();
        await host.OnSessionStarted(context, USER, PROVIDER);

        const plugin = host.GetSessionPlugin('session-1', 'Alpha') as BaseRealtimeChannelServer;
        const journal = journalOf(plugin);
        expect(journal.events).toEqual(['initialize', 'session-started']);
        expect(journal.contexts[0]).toEqual(context);
    });

    it('runs the full lifecycle in order: initialize → session-started → state-save → session-closed → dispose', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        const plugin = host.GetSessionPlugin('session-1', 'Alpha') as BaseRealtimeChannelServer;

        await host.OnChannelStateSave('session-1', 'Alpha', '{"v":1}');
        await host.OnSessionClosed('session-1', 'Explicit');

        const journal = journalOf(plugin);
        expect(journal.events).toEqual([
            'initialize',
            'session-started',
            'state-save:{"v":1}',
            'session-closed',
            'dispose',
        ]);
        expect(journal.closeReasons).toEqual(['Explicit']);
        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBeNull();
    });

    it('OnChannelStateSave returns the plugin replacement when one is produced', async () => {
        setRegistryRows([BETA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        const result = await host.OnChannelStateSave('session-1', 'Beta', '{"x":2}');
        expect(result).toBe('beta:{"x":2}');
    });

    it('OnChannelStateSave keeps the original when the plugin returns null', async () => {
        setRegistryRows([ALPHA_ROW]);
        behavior.stateReplacement = null;
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        const result = await host.OnChannelStateSave('session-1', 'Alpha', '{"keep":true}');
        expect(result).toBe('{"keep":true}');
    });

    it('OnChannelStateSave keeps the original for an unknown session or channel (no plugin)', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        expect(await host.OnChannelStateSave('other-session', 'Alpha', '{"a":1}')).toBe('{"a":1}');
        expect(await host.OnChannelStateSave('session-1', 'Whiteboard', '{"b":2}')).toBe('{"b":2}');
    });

    it('routes channel names case/whitespace-insensitively (UUID + name canonicalization)', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);

        expect(host.GetSessionPlugin('SESSION-1', ' alpha ')).toBeInstanceOf(AlphaChannelServer);
        const result = await host.OnChannelStateSave('SESSION-1', 'ALPHA', '{"v":9}');
        expect(result).toBe('{"v":9}'); // alpha replacement = null → original kept; the hook fired
        const plugin = host.GetSessionPlugin('session-1', 'Alpha') as BaseRealtimeChannelServer;
        expect(journalOf(plugin).events).toContain('state-save:{"v":9}');
    });

    it('passes every close provenance through to the plugin', async () => {
        const reasons: Array<RealtimeChannelCloseReason | null> = ['Janitor', 'Shutdown', 'Error', null];
        for (const [i, reason] of reasons.entries()) {
            setRegistryRows([ALPHA_ROW]);
            const sessionID = `session-r${i}`;
            await host.OnSessionStarted(ctx(sessionID), USER, PROVIDER);
            const plugin = host.GetSessionPlugin(sessionID, 'Alpha') as BaseRealtimeChannelServer;
            await host.OnSessionClosed(sessionID, reason);
            expect(journalOf(plugin).closeReasons).toEqual([reason]);
        }
    });

    it('close is idempotent: a second close fires no second OnSessionClosed and unknown sessions no-op', async () => {
        setRegistryRows([ALPHA_ROW]);
        host.DisposeLingerMs = 60_000; // keep the entry alive so the second close hits the pending-disposal guard
        vi.useFakeTimers();
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        const plugin = host.GetSessionPlugin('session-1', 'Alpha') as BaseRealtimeChannelServer;

        await host.OnSessionClosed('session-1', 'Explicit');
        await host.OnSessionClosed('session-1', 'Janitor');
        await expect(host.OnSessionClosed('never-started', 'Explicit')).resolves.toBeUndefined();

        expect(journalOf(plugin).events.filter(e => e === 'session-closed')).toHaveLength(1);
        vi.runAllTimers();
    });

    it('lingers after close: state saves still route to the plugin until disposal fires', async () => {
        setRegistryRows([BETA_ROW]);
        host.DisposeLingerMs = 15_000;
        vi.useFakeTimers();
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        const plugin = host.GetSessionPlugin('session-1', 'Beta') as BaseRealtimeChannelServer;

        await host.OnSessionClosed('session-1', 'Explicit');

        // Within the linger window the client's final flush still routes through the plugin.
        expect(await host.OnChannelStateSave('session-1', 'Beta', '{"final":true}')).toBe('beta:{"final":true}');
        expect(journalOf(plugin).events).not.toContain('dispose');

        vi.advanceTimersByTime(15_000);

        expect(journalOf(plugin).events).toContain('dispose');
        expect(host.GetSessionPlugin('session-1', 'Beta')).toBeNull();
        expect(await host.OnChannelStateSave('session-1', 'Beta', '{"late":true}')).toBe('{"late":true}');
    });
});

// ---------------------------------------------------------------------------------------------
// Hook-failure tolerance
// ---------------------------------------------------------------------------------------------

describe('RealtimeChannelServerHost — hook-failure tolerance', () => {
    it('drops a plugin whose start bracket throws, keeping its siblings, never throwing out', async () => {
        setRegistryRows([ALPHA_ROW, BETA_ROW]);
        behavior.throwOnSessionStarted = true;

        await expect(host.OnSessionStarted(ctx(), USER, PROVIDER)).resolves.toBeUndefined();

        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBeNull(); // dropped + disposed
        expect(host.GetSessionPlugin('session-1', 'Beta')).toBeInstanceOf(BetaChannelServer);
    });

    it('falls back to the original payload when OnChannelStateSave throws', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        behavior.throwOnStateSave = true;

        const result = await host.OnChannelStateSave('session-1', 'Alpha', '{"orig":1}');
        expect(result).toBe('{"orig":1}');
    });

    it('a throwing OnSessionClosed does not skip sibling close hooks or disposal', async () => {
        setRegistryRows([ALPHA_ROW, BETA_ROW]);
        await host.OnSessionStarted(ctx(), USER, PROVIDER);
        const beta = host.GetSessionPlugin('session-1', 'Beta') as BaseRealtimeChannelServer;
        behavior.throwOnSessionClosed = true; // Alpha throws on close

        await expect(host.OnSessionClosed('session-1', 'Explicit')).resolves.toBeUndefined();

        expect(journalOf(beta).events).toContain('session-closed');
        expect(host.ActiveSessionCount).toBe(0); // disposal proceeded for the whole session
    });
});

// ---------------------------------------------------------------------------------------------
// Per-session instance isolation
// ---------------------------------------------------------------------------------------------

describe('RealtimeChannelServerHost — per-session instance isolation', () => {
    it('creates a FRESH plugin instance per session and routes saves to the right one', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx('session-1'), USER, PROVIDER);
        await host.OnSessionStarted(ctx('session-2'), USER, PROVIDER);

        const p1 = host.GetSessionPlugin('session-1', 'Alpha') as BaseRealtimeChannelServer;
        const p2 = host.GetSessionPlugin('session-2', 'Alpha') as BaseRealtimeChannelServer;
        expect(p1).not.toBe(p2);
        expect(host.ActiveSessionCount).toBe(2);

        await host.OnChannelStateSave('session-2', 'Alpha', '{"only":2}');
        expect(journalOf(p2).events).toContain('state-save:{"only":2}');
        expect(journalOf(p1).events.some(e => e.startsWith('state-save'))).toBe(false);
    });

    it('closing one session leaves the other session untouched', async () => {
        setRegistryRows([ALPHA_ROW]);
        await host.OnSessionStarted(ctx('session-1'), USER, PROVIDER);
        await host.OnSessionStarted(ctx('session-2'), USER, PROVIDER);
        const p2 = host.GetSessionPlugin('session-2', 'Alpha') as BaseRealtimeChannelServer;

        await host.OnSessionClosed('session-1', 'Explicit');

        expect(host.GetSessionPlugin('session-1', 'Alpha')).toBeNull();
        expect(host.GetSessionPlugin('session-2', 'Alpha')).toBe(p2);
        expect(journalOf(p2).events).not.toContain('session-closed');
    });
});
