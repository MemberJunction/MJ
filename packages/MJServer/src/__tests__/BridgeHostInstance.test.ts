import { describe, it, expect, vi, afterEach } from 'vitest';
import { hostname } from 'os';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession, RealtimeInputFrame } from '@memberjunction/ai';
import type { MJAIAgentSessionBridgeEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, LOOPBACK_BRIDGE_DRIVER_CLASS } from '@memberjunction/ai-bridge-server';
import { BindBridgeEngineHostInstance, StartBridgeOrphanReconciliation } from '../agentSessions/BridgeHostInstance.js';
import { GetBootID, GetCurrentHostInstance, HostInstanceIdentity, SetHostInstancePort } from '../agentSessions/HostInstance.js';

/** The port this test process "serves" on, set the way `Serve` sets it, before anything reads the identity. */
const OUR_PORT = 4000;
/** The port of a second MJAPI on the same host. */
const OTHER_PORT = 4100;
SetHostInstancePort(OUR_PORT);

const user = { ID: 'system-user', Email: 'system@example.com' } as unknown as UserInfo;

/** A bridge row as the engine reads and writes it. */
interface BridgeRow {
    ID: string;
    Status: MJAIAgentSessionBridgeEntity['Status'];
    HostInstanceID: string | null;
    AgentSessionID: string;
    CloseReason?: MJAIAgentSessionBridgeEntity['CloseReason'];
}

/** A `LIKE` pattern as a regular expression: `%` any run of characters, `_` any one character. */
function likePattern(pattern: string): RegExp {
    const body = [...pattern]
        .map((c) => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('');
    return new RegExp(`^${body}$`);
}

/**
 * A provider over a bridge table, answering the engine the way the database would: the orphan reconcile's read
 * returns the open rows whose `HostInstanceID` matches the filter's `LIKE` pattern and isn't the id it excludes, and a
 * row the engine loads and saves is written back. `row(id)` reads a row's current state.
 */
function bridgeTable(rows: BridgeRow[]): {
    provider: IMetadataProvider;
    row: (id: string) => BridgeRow;
    runView: ReturnType<typeof vi.fn>;
} {
    const table = new Map(rows.map((r) => [r.ID, { ...r }]));
    const runView = vi.fn(async (params: RunViewParams) => {
        if (params.EntityName !== 'MJ: AI Agent Session Bridges') {
            return { Success: true, Results: [] };
        }
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        const like = likePattern(/HostInstanceID LIKE '(.*?)'/.exec(filter)?.[1] ?? '');
        const excluded = /HostInstanceID <> '(.*?)'/.exec(filter)?.[1];
        const results = [...table.values()]
            .filter((r) => r.Status === 'Connecting' || r.Status === 'Connected')
            .filter((r) => r.HostInstanceID != null && like.test(r.HostInstanceID) && r.HostInstanceID !== excluded)
            .map((r) => ({ ...r }));
        return { Success: true, Results: results };
    });
    const provider = {
        RunView: runView,
        GetEntityObject: vi.fn(async () => {
            const entity: BridgeRow & { LatestResult: { CompleteMessage: string }; Load: (id: string) => Promise<boolean>; Save: () => Promise<boolean> } = {
                ID: '',
                Status: 'Pending',
                HostInstanceID: null,
                AgentSessionID: '',
                CloseReason: null,
                LatestResult: { CompleteMessage: '' },
                Load: async (id: string) => {
                    const stored = table.get(id);
                    if (!stored) {
                        return false;
                    }
                    Object.assign(entity, stored);
                    return true;
                },
                Save: async () => {
                    const stored = table.get(entity.ID);
                    if (stored) {
                        stored.Status = entity.Status;
                        stored.CloseReason = entity.CloseReason;
                    }
                    return true;
                },
            };
            return entity;
        }),
    } as unknown as IMetadataProvider;
    return { provider, row: (id: string) => table.get(id) as BridgeRow, runView };
}

/** A realtime model session that says nothing: a bridge only needs one to connect. */
class SilentSession implements IRealtimeSession {
    public SendInput(_frame: RealtimeInputFrame): void {}
    public async RegisterTools(): Promise<void> {}
    public OnOutput(): void {}
    public OnTranscript(): void {}
    public OnToolCall(): void {}
    public async SendToolResult(): Promise<void> {}
    public OnInterruption(): void {}
    public OnError(): void {}
    public OnUsage(): void {}
    public async Close(): Promise<void> {}
}

/** The loopback bridge provider: a bridge with no platform behind it. */
const loopbackProvider = {
    ID: 'provider-loopback',
    Name: 'Loopback',
    DriverClass: LOOPBACK_BRIDGE_DRIVER_CLASS,
    SupportedFeaturesObject: { AudioIn: true, AudioOut: true },
} as unknown as MJAIBridgeProviderEntity;

afterEach(() => {
    AIBridgeEngine.Instance.StopOrphanReconciliation();
    BindBridgeEngineHostInstance();
});

describe('BindBridgeEngineHostInstance', () => {
    it("makes the engine stamp this MJAPI instance's identity (hostname:port:pid:bootId) on the bridges it creates", async () => {
        BindBridgeEngineHostInstance();
        const row = {
            ID: 'bridge-new',
            Status: 'Pending',
            HostInstanceID: null as string | null,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            Load: vi.fn(async () => true),
            LatestResult: { CompleteMessage: '' },
        };
        const provider = {
            GetEntityObject: vi.fn(async () => row),
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        } as unknown as IMetadataProvider;

        const active = await AIBridgeEngine.Instance.StartBridgeSession({
            AgentSessionID: 'session-1',
            Provider: loopbackProvider,
            RealtimeSession: new SilentSession(),
            Address: 'loopback://room',
            ContextUser: user,
            MetadataProvider: provider,
        });
        try {
            expect(row.HostInstanceID).toBe(GetCurrentHostInstance().GetHostInstanceID());
            expect(row.HostInstanceID).toBe(`${hostname()}:${OUR_PORT}:${process.pid}:${GetBootID()}`);
        } finally {
            await AIBridgeEngine.Instance.StopBridgeSession(active.SessionBridgeID, 'Explicit', user, provider);
        }
    });
});

describe("the bridge engine's orphan reconcile with this MJAPI's identity (#5310)", () => {
    const ours = GetCurrentHostInstance();
    const theirs = new HostInstanceIdentity(ours.HostName, String(OTHER_PORT), 40404, 'boot-theirs');

    /** Both MJAPIs' live bridges, and one each left by an earlier boot. */
    function sharedTable(): BridgeRow[] {
        return [
            { ID: 'ours-live', Status: 'Connected', HostInstanceID: ours.GetHostInstanceID(), AgentSessionID: 'session-ours-live' },
            { ID: 'ours-stale', Status: 'Connected', HostInstanceID: `${ours.GetInstancePrefix()}31337:boot-ours-before`, AgentSessionID: 'session-ours-stale' },
            { ID: 'theirs-live', Status: 'Connected', HostInstanceID: theirs.GetHostInstanceID(), AgentSessionID: 'session-theirs-live' },
            { ID: 'theirs-stale', Status: 'Connecting', HostInstanceID: `${theirs.GetInstancePrefix()}27182:boot-theirs-before`, AgentSessionID: 'session-theirs-stale' },
        ];
    }

    it('closes the bridges an earlier boot of this instance left, and nothing else (one MJAPI, as before)', async () => {
        BindBridgeEngineHostInstance();
        const { provider, row } = bridgeTable([
            { ID: 'before-restart', Status: 'Connected', HostInstanceID: `${ours.GetInstancePrefix()}31337:boot-before`, AgentSessionID: 'session-1' },
            // The OS gave the restarted process the same pid; the boot id still differs.
            { ID: 'before-restart-same-pid', Status: 'Connecting', HostInstanceID: `${ours.GetInstancePrefix()}${ours.ProcessID}:boot-before`, AgentSessionID: 'session-2' },
            { ID: 'this-boot', Status: 'Connected', HostInstanceID: ours.GetHostInstanceID(), AgentSessionID: 'session-3' },
            { ID: 'other-host', Status: 'Connected', HostInstanceID: `other-host:${OUR_PORT}:31337:boot-other`, AgentSessionID: 'session-4' },
            // Stamped before MJServer gave the engine its identity; no instance owns it.
            { ID: 'fallback-stamped', Status: 'Connected', HostInstanceID: `unknown-host:31337:boot-old`, AgentSessionID: 'session-5' },
        ]);

        const closed = await AIBridgeEngine.Instance.ReconcileOrphans(user, provider);

        expect(closed).toBe(2);
        expect(row('before-restart')).toMatchObject({ Status: 'Disconnected', CloseReason: 'Janitor' });
        expect(row('before-restart-same-pid')).toMatchObject({ Status: 'Disconnected', CloseReason: 'Janitor' });
        expect(row('this-boot').Status).toBe('Connected');
        expect(row('other-host').Status).toBe('Connected');
        expect(row('fallback-stamped').Status).toBe('Connected');
    });

    it("closes its own stale bridges and leaves the other MJAPI's live bridges open", async () => {
        BindBridgeEngineHostInstance();
        const { provider, row } = bridgeTable(sharedTable());

        const closed = await AIBridgeEngine.Instance.ReconcileOrphans(user, provider);

        expect(closed).toBe(1);
        expect(row('ours-stale')).toMatchObject({ Status: 'Disconnected', CloseReason: 'Janitor' });
        expect(row('ours-live').Status).toBe('Connected');
        expect(row('theirs-live').Status).toBe('Connected');
        expect(row('theirs-stale').Status).toBe('Connecting');
    });

    it("the other MJAPI's reconcile closes its stale bridges and leaves this one's live bridges open", async () => {
        // What the other MJAPI's own BindBridgeEngineHostInstance gives its engine.
        AIBridgeEngine.Instance.SetHostInstanceIdentity(theirs);
        const { provider, row } = bridgeTable(sharedTable());

        const closed = await AIBridgeEngine.Instance.ReconcileOrphans(user, provider);

        expect(closed).toBe(1);
        expect(row('theirs-stale')).toMatchObject({ Status: 'Disconnected', CloseReason: 'Janitor' });
        expect(row('theirs-live').Status).toBe('Connected');
        expect(row('ours-live').Status).toBe('Connected');
        expect(row('ours-stale').Status).toBe('Connected');
    });
});

describe('StartBridgeOrphanReconciliation', () => {
    it("reconciles at once, with this instance's identity, as the given user", async () => {
        BindBridgeEngineHostInstance();
        const ours = GetCurrentHostInstance();
        const { provider, row, runView } = bridgeTable([
            { ID: 'ours-stale', Status: 'Connected', HostInstanceID: `${ours.GetInstancePrefix()}31337:boot-before`, AgentSessionID: 'session-1' },
            { ID: 'theirs-live', Status: 'Connected', HostInstanceID: `${ours.HostName}:${OTHER_PORT}:40404:boot-theirs`, AgentSessionID: 'session-2' },
        ]);

        StartBridgeOrphanReconciliation(provider, user);

        await vi.waitFor(() => expect(row('ours-stale').Status).toBe('Disconnected'));
        expect(row('theirs-live').Status).toBe('Connected');
        expect(runView.mock.calls[0][1]).toBe(user);
    });
});
