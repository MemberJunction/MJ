import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';
import {
    BaseRemoteBrowserProvider,
    IRemoteBrowserProviderFeatures,
    IRemoteBrowserSession,
    RemoteBrowserAction,
    RemoteBrowserActionResult,
    RemoteBrowserHumanInput,
    RemoteBrowserProviderContext,
    RemoteBrowserScreencastFrame,
    RemoteBrowserEngineBase,
} from '@memberjunction/remote-browser-base';
import { RemoteBrowserEngine } from '../remote-browser-engine';

// ──────────────────────────────────────────────────────────────────────────────
// Test doubles — a fake session + a fake driver registered under known DriverClasses.
// ──────────────────────────────────────────────────────────────────────────────

/** A fully in-memory IRemoteBrowserSession capturing every call for assertions. */
class FakeSession implements IRemoteBrowserSession {
    public Actions: RemoteBrowserAction[] = [];
    public HumanInputs: RemoteBrowserHumanInput[] = [];
    public ScreencastStarted = false;
    public ScreencastStopped = false;
    public Closed = false;
    public NativeIntents: string[] = [];
    private currentUrl = 'about:blank';
    private frameSink: ((frame: RemoteBrowserScreencastFrame) => void) | null = null;

    public GetCdpEndpoint(): string {
        return 'ws://fake/cdp';
    }
    public async Navigate(url: string): Promise<RemoteBrowserActionResult> {
        return this.ExecuteAction({ Kind: 'navigate', Url: url });
    }
    public async ExecuteAction(action: RemoteBrowserAction): Promise<RemoteBrowserActionResult> {
        this.Actions.push(action);
        if (action.Kind === 'navigate') {
            this.currentUrl = action.Url;
        }
        return { Success: true, CurrentUrl: this.currentUrl };
    }
    public async CaptureScreenshot(): Promise<string> {
        return 'BASE64';
    }
    public GetCurrentUrl(): string {
        return this.currentUrl;
    }
    public async Close(): Promise<void> {
        this.Closed = true;
    }
    public async GetLiveViewUrl(): Promise<string> {
        return 'https://fake/live';
    }
    public async StartScreencast(onFrame: (frame: RemoteBrowserScreencastFrame) => void): Promise<void> {
        this.ScreencastStarted = true;
        this.frameSink = onFrame;
    }
    public async StopScreencast(): Promise<void> {
        this.ScreencastStopped = true;
    }
    public RouteHumanInput(input: RemoteBrowserHumanInput): void {
        this.HumanInputs.push(input);
    }
    public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
        this.NativeIntents.push(intent);
        return { Success: true, CurrentUrl: this.currentUrl };
    }
    /** Test helper — push a frame through the registered screencast sink. */
    public EmitFrame(frame: RemoteBrowserScreencastFrame): void {
        this.frameSink?.(frame);
    }
}

/** The driver class key the fake provider rows resolve. */
const FAKE_DRIVER_CLASS = 'FakeRemoteBrowserDriver';

@RegisterClass(BaseRemoteBrowserProvider, FAKE_DRIVER_CLASS)
class FakeRemoteBrowserDriver extends BaseRemoteBrowserProvider {
    public LastContext: RemoteBrowserProviderContext | null = null;
    public Disconnected = false;
    public readonly Session = new FakeSession();

    public async Connect(ctx: RemoteBrowserProviderContext): Promise<IRemoteBrowserSession> {
        this.applyContext(ctx);
        this.LastContext = ctx;
        return this.Session;
    }
    public async Disconnect(): Promise<void> {
        this.Disconnected = true;
    }
}

/** A driver whose Connect rejects — to exercise the start-failure path. */
const FAILING_DRIVER_CLASS = 'FailingRemoteBrowserDriver';

@RegisterClass(BaseRemoteBrowserProvider, FAILING_DRIVER_CLASS)
class FailingRemoteBrowserDriver extends BaseRemoteBrowserProvider {
    public async Connect(): Promise<IRemoteBrowserSession> {
        throw new Error('connect boom');
    }
    public async Disconnect(): Promise<void> {}
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider-row factory + base-cache stubbing.
// ──────────────────────────────────────────────────────────────────────────────

interface ProviderOpts {
    name?: string;
    driverClass?: string;
    status?: 'Active' | 'Disabled';
    defaultMode?: 'AgentOnly' | 'ViewOnly' | 'Collaborative';
    features?: IRemoteBrowserProviderFeatures;
    configuration?: string | null;
    providerType?: 'SelfHost' | 'Service';
}

function makeProvider(opts: ProviderOpts = {}): MJAIRemoteBrowserProviderEntity {
    return {
        ID: `prov-${opts.name ?? 'fake'}`,
        Name: opts.name ?? 'Fake Browser',
        DriverClass: opts.driverClass ?? FAKE_DRIVER_CLASS,
        Status: opts.status ?? 'Active',
        DefaultControlMode: opts.defaultMode ?? 'AgentOnly',
        ProviderType: opts.providerType ?? 'SelfHost',
        Configuration: opts.configuration ?? null,
        SupportedFeaturesObject: opts.features ?? {},
    } as unknown as MJAIRemoteBrowserProviderEntity;
}

/** Points the engine's composed base cache at a fixed set of provider rows (no DB). */
function stubBase(providers: MJAIRemoteBrowserProviderEntity[]): void {
    const base = RemoteBrowserEngineBase.Instance;
    vi.spyOn(base, 'Config').mockResolvedValue(undefined);
    vi.spyOn(base, 'Providers', 'get').mockReturnValue(providers);
    vi.spyOn(base, 'ProviderByName').mockImplementation((n) =>
        providers.find((p) => p.Name.toLowerCase() === n.trim().toLowerCase()),
    );
    vi.spyOn(base, 'ProviderByDriverClass').mockImplementation((d) =>
        providers.find((p) => p.DriverClass.toLowerCase() === d.trim().toLowerCase()),
    );
    vi.spyOn(base, 'ActiveProviders').mockImplementation(() => providers.filter((p) => p.Status === 'Active'));
    vi.spyOn(base, 'FeaturesFor').mockImplementation((p) => p.SupportedFeaturesObject ?? {});
}

function engine(): RemoteBrowserEngine {
    return RemoteBrowserEngine.Instance;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Session lifecycle + driver resolution.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — session lifecycle + driver resolution', () => {
    it('starts a session by provider name, building the correct provider context', async () => {
        stubBase([makeProvider({ providerType: 'Service', configuration: '{"region":"us"}' })]);
        const handle = await engine().StartSession({ ProviderName: 'Fake Browser' });

        expect(handle.SessionID).toBeTruthy();
        expect(handle.ControlMode).toBe('AgentOnly');
        expect(handle.FloorHolder).toBe('Agent');
        const driver = handle.Driver as FakeRemoteBrowserDriver;
        expect(driver.LastContext?.ProviderName).toBe('Fake Browser');
        expect(driver.LastContext?.ProviderType).toBe('Service');
        expect(driver.LastContext?.ControlMode).toBe('AgentOnly');
        expect(driver.LastContext?.Configuration).toEqual({ region: 'us' });
        expect(engine().GetSession(handle.SessionID)).toBe(handle);

        await engine().EndSession(handle.SessionID);
    });

    it('starts a session by driver class', async () => {
        stubBase([makeProvider()]);
        const handle = await engine().StartSession({ DriverClass: FAKE_DRIVER_CLASS });
        expect(handle.Provider.DriverClass).toBe(FAKE_DRIVER_CLASS);
        await engine().EndSession(handle.SessionID);
    });

    it('rejects when neither or both selectors are supplied', async () => {
        stubBase([makeProvider()]);
        await expect(engine().StartSession({})).rejects.toThrow(/exactly one/);
        await expect(
            engine().StartSession({ ProviderName: 'Fake Browser', DriverClass: FAKE_DRIVER_CLASS }),
        ).rejects.toThrow(/exactly one/);
    });

    it('rejects a disabled provider', async () => {
        stubBase([makeProvider({ status: 'Disabled' })]);
        await expect(engine().StartSession({ ProviderName: 'Fake Browser' })).rejects.toThrow(/not Active/);
    });

    it('rejects when no provider matches the selector', async () => {
        stubBase([makeProvider()]);
        await expect(engine().StartSession({ ProviderName: 'Nope' })).rejects.toThrow(/No remote-browser provider/);
    });

    it('rejects when the DriverClass has no registered driver', async () => {
        stubBase([makeProvider({ driverClass: 'UnregisteredDriverXYZ' })]);
        await expect(engine().StartSession({ ProviderName: 'Fake Browser' })).rejects.toThrow(/No remote-browser driver/);
    });

    it('ends a session: closes the session and disconnects the driver, idempotently', async () => {
        stubBase([makeProvider()]);
        const handle = await engine().StartSession({ ProviderName: 'Fake Browser' });
        const driver = handle.Driver as FakeRemoteBrowserDriver;

        expect(await engine().EndSession(handle.SessionID)).toBe(true);
        expect(driver.Session.Closed).toBe(true);
        expect(driver.Disconnected).toBe(true);
        expect(engine().GetSession(handle.SessionID)).toBeUndefined();
        // Idempotent — ending an already-ended session is a benign no-op.
        expect(await engine().EndSession(handle.SessionID)).toBe(false);
    });

    it('does not register a session when the driver fails to connect', async () => {
        stubBase([makeProvider({ driverClass: FAILING_DRIVER_CLASS })]);
        const before = engine().ActiveSessions.length;
        await expect(engine().StartSession({ ProviderName: 'Fake Browser' })).rejects.toThrow(/connect boom/);
        expect(engine().ActiveSessions.length).toBe(before);
    });

    it('reconciles orphaned sessions matching a predicate', async () => {
        stubBase([makeProvider()]);
        const a = await engine().StartSession({ ProviderName: 'Fake Browser' });
        const b = await engine().StartSession({ ProviderName: 'Fake Browser' });
        const closed = await engine().ReconcileOrphans((h) => h.SessionID === a.SessionID);
        expect(closed).toBe(1);
        expect(engine().GetSession(a.SessionID)).toBeUndefined();
        expect(engine().GetSession(b.SessionID)).toBeDefined();
        await engine().EndSession(b.SessionID);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Control-mode validation.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — control-mode validation', () => {
    it('honors a supported control-mode override', async () => {
        stubBase([makeProvider({ features: { LiveView: true, HumanTakeover: true } })]);
        const handle = await engine().StartSession({ ProviderName: 'Fake Browser', ControlModeOverride: 'Collaborative' });
        expect(handle.ControlMode).toBe('Collaborative');
        await engine().EndSession(handle.SessionID);
    });

    it('rejects ViewOnly when the backend lacks LiveView', async () => {
        stubBase([makeProvider({ features: {} })]);
        await expect(
            engine().StartSession({ ProviderName: 'Fake Browser', ControlModeOverride: 'ViewOnly' }),
        ).rejects.toThrow(/not supported/);
    });

    it('rejects Collaborative when the backend lacks HumanTakeover', async () => {
        stubBase([makeProvider({ features: { LiveView: true } })]);
        await expect(
            engine().StartSession({ ProviderName: 'Fake Browser', ControlModeOverride: 'Collaborative' }),
        ).rejects.toThrow(/not supported/);
    });

    it('AgentOnly is always valid even with no capabilities', async () => {
        stubBase([makeProvider({ defaultMode: 'AgentOnly', features: {} })]);
        const handle = await engine().StartSession({ ProviderName: 'Fake Browser' });
        expect(handle.ControlMode).toBe('AgentOnly');
        await engine().EndSession(handle.SessionID);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// The control arbiter — transitions per mode.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — control arbiter', () => {
    async function startCollab(): Promise<string> {
        stubBase([makeProvider({ features: { LiveView: true, HumanTakeover: true } })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser', ControlModeOverride: 'Collaborative' });
        return h.SessionID;
    }

    it('Collaborative: request → grant → route → yield restores the agent floor', async () => {
        const id = await startCollab();
        expect(engine().RequestControl(id)).toBe(true);
        expect(engine().GrantControl(id, 'Human')).toBe(true);
        expect(engine().GetSession(id)?.FloorHolder).toBe('Human');

        const session = (engine().GetSession(id)?.Session) as FakeSession;
        expect(engine().RouteHumanInput(id, { Kind: 'pointer-click', X: 1, Y: 2 })).toBe(true);
        expect(session.HumanInputs).toHaveLength(1);

        expect(engine().YieldControl(id, 'Human')).toBe(true);
        expect(engine().GetSession(id)?.FloorHolder).toBe('Agent');
        // After yield, human input is dropped again.
        expect(engine().RouteHumanInput(id, { Kind: 'key', Key: 'a' })).toBe(false);
        await engine().EndSession(id);
    });

    it('Collaborative: granting Human WITHOUT a request is denied', async () => {
        const id = await startCollab();
        expect(engine().GrantControl(id, 'Human')).toBe(false);
        expect(engine().GetSession(id)?.FloorHolder).toBe('Agent');
        await engine().EndSession(id);
    });

    it('AgentOnly: human control is denied outright and input never routes', async () => {
        stubBase([makeProvider({ defaultMode: 'AgentOnly' })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser' });
        expect(engine().RequestControl(h.SessionID)).toBe(false);
        expect(engine().GrantControl(h.SessionID, 'Human')).toBe(false);
        expect(engine().RouteHumanInput(h.SessionID, { Kind: 'pointer-move', X: 0, Y: 0 })).toBe(false);
        await engine().EndSession(h.SessionID);
    });

    it('ViewOnly: human watches but never drives (request denied, input dropped)', async () => {
        stubBase([makeProvider({ defaultMode: 'ViewOnly', features: { LiveView: true } })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser' });
        expect(engine().RequestControl(h.SessionID)).toBe(false);
        expect(engine().RouteHumanInput(h.SessionID, { Kind: 'pointer-click', X: 5, Y: 5 })).toBe(false);
        await engine().EndSession(h.SessionID);
    });

    it('granting the Agent floor always succeeds and clears any pending request', async () => {
        const id = await startCollab();
        engine().RequestControl(id);
        expect(engine().GrantControl(id, 'Agent')).toBe(true);
        expect(engine().GetSession(id)?.HumanControlRequested).toBe(false);
        await engine().EndSession(id);
    });

    it('arbiter calls on an unknown session return false', () => {
        expect(engine().RequestControl('missing')).toBe(false);
        expect(engine().GrantControl('missing', 'Human')).toBe(false);
        expect(engine().YieldControl('missing', 'Human')).toBe(false);
        expect(engine().RouteHumanInput('missing', { Kind: 'key', Key: 'x' })).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Screencast → sink, gated on ScreenStreaming.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — screencast piping', () => {
    it('pipes frames to the sink when ScreenStreaming is supported', async () => {
        stubBase([makeProvider({ features: { ScreenStreaming: true } })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser' });
        const session = h.Session as FakeSession;
        const frames: RemoteBrowserScreencastFrame[] = [];

        await engine().PipeScreencastToTrack(h.SessionID, (f) => frames.push(f));
        expect(session.ScreencastStarted).toBe(true);

        session.EmitFrame({ DataBase64: 'X', Width: 10, Height: 10, SequenceNumber: 1 });
        expect(frames).toHaveLength(1);
        expect(frames[0].SequenceNumber).toBe(1);

        await engine().StopScreencast(h.SessionID);
        expect(session.ScreencastStopped).toBe(true);
        await engine().EndSession(h.SessionID);
    });

    it('refuses to pipe when the backend lacks ScreenStreaming', async () => {
        stubBase([makeProvider({ features: {} })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser' });
        const session = h.Session as FakeSession;
        await expect(engine().PipeScreencastToTrack(h.SessionID, () => {})).rejects.toThrow(/ScreenStreaming/);
        expect(session.ScreencastStarted).toBe(false);
        await engine().EndSession(h.SessionID);
    });

    it('throws for an unknown session', async () => {
        stubBase([makeProvider()]);
        await expect(engine().PipeScreencastToTrack('missing', () => {})).rejects.toThrow(/no live session/);
    });

    it('StopScreencast is a no-op for an unknown / unsupported session', async () => {
        stubBase([makeProvider({ features: {} })]);
        const h = await engine().StartSession({ ProviderName: 'Fake Browser' });
        // Unsupported — must not throw.
        await expect(engine().StopScreencast(h.SessionID)).resolves.toBeUndefined();
        await expect(engine().StopScreencast('missing')).resolves.toBeUndefined();
        await engine().EndSession(h.SessionID);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Agent-session-keyed lifecycle — the realtime channel plane's lazy-start surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — agent-session-keyed lifecycle', () => {
    it('lazily starts a browser for an agent session and is idempotent', async () => {
        stubBase([makeProvider()]);
        const first = await engine().StartSessionForAgentSession('agent-sess-1');
        expect(first).toBeDefined();
        // Idempotent — a second call returns the SAME live session, no second browser.
        const second = await engine().StartSessionForAgentSession('agent-sess-1');
        expect(second).toBe(first);
        expect(engine().ActiveSessions.length).toBe(1);

        expect(engine().GetSessionForAgentSession('agent-sess-1')).toBe(first);
        await engine().EndSessionForAgentSession('agent-sess-1');
    });

    it('coalesces CONCURRENT lazy-starts into ONE browser (no duplicate-browser leak)', async () => {
        stubBase([makeProvider()]);
        // At session start the screencast, the agent's first browser action, and the audio stream all call
        // this near-simultaneously. Without coalescing each would observe "no session yet" and launch its
        // own Chrome — the leak that left orphaned browsers and split the live view across instances.
        const results = await Promise.all([
            engine().StartSessionForAgentSession('agent-sess-race'),
            engine().StartSessionForAgentSession('agent-sess-race'),
            engine().StartSessionForAgentSession('agent-sess-race'),
            engine().StartSessionForAgentSession('agent-sess-race'),
        ]);
        // Every concurrent caller gets the SAME live session...
        expect(results[1]).toBe(results[0]);
        expect(results[2]).toBe(results[0]);
        expect(results[3]).toBe(results[0]);
        // ...and exactly ONE browser was launched (would be 4 before the coalescing fix).
        expect(engine().ActiveSessions.length).toBe(1);
        await engine().EndSessionForAgentSession('agent-sess-race');
    });

    it('GetSessionForAgentSession returns undefined when none was started', () => {
        stubBase([makeProvider()]);
        expect(engine().GetSessionForAgentSession('never-started')).toBeUndefined();
    });

    it('resolves the single Active provider when no name is given', async () => {
        stubBase([makeProvider({ name: 'Only One' })]);
        const session = await engine().StartSessionForAgentSession('agent-sess-auto');
        expect(session).toBeDefined();
        await engine().EndSessionForAgentSession('agent-sess-auto');
    });

    it('resolves an explicitly-named provider', async () => {
        stubBase([
            makeProvider({ name: 'Alpha' }),
            makeProvider({ name: 'Beta', driverClass: FAKE_DRIVER_CLASS }),
        ]);
        const session = await engine().StartSessionForAgentSession('agent-sess-named', undefined, 'Beta');
        expect(session).toBeDefined();
        await engine().EndSessionForAgentSession('agent-sess-named');
    });

    it('throws when no Active provider is configured', async () => {
        stubBase([makeProvider({ status: 'Disabled' })]);
        await expect(engine().StartSessionForAgentSession('agent-sess-none')).rejects.toThrow(/No Active remote-browser provider/);
    });

    it('throws when multiple Active providers are ambiguous and none is named', async () => {
        stubBase([makeProvider({ name: 'Alpha' }), makeProvider({ name: 'Beta' })]);
        await expect(engine().StartSessionForAgentSession('agent-sess-ambig')).rejects.toThrow(/Multiple Active/);
    });

    it('throws when the explicitly-named provider is unknown', async () => {
        stubBase([makeProvider({ name: 'Alpha' })]);
        await expect(
            engine().StartSessionForAgentSession('agent-sess-bad', undefined, 'Nope'),
        ).rejects.toThrow(/No remote-browser provider found/);
    });

    it('tears down the browser and forgets the mapping on EndSessionForAgentSession', async () => {
        stubBase([makeProvider()]);
        await engine().StartSessionForAgentSession('agent-sess-end');
        expect(await engine().EndSessionForAgentSession('agent-sess-end')).toBe(true);
        expect(engine().GetSessionForAgentSession('agent-sess-end')).toBeUndefined();
        // Idempotent — ending an agent session with no browser is a benign no-op.
        expect(await engine().EndSessionForAgentSession('agent-sess-end')).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// #3531 — TWO browsers in ONE agent session, told apart by `instanceKey`.
//
// The whole agent-session-keyed surface above is keyed by agent session ALONE, which silently makes
// "one browser per session" a framework invariant: the second surface's lazy-start finds the first
// one's mapping, returns it, and both surfaces drive the same Chrome. `instanceKey` is what names
// the second browser. Omitting it must keep every assertion above true, which is why these tests
// live beside them rather than replacing them.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserEngine — multiple instances per agent session (#3531)', () => {
    it('starts a SEPARATE browser per instanceKey within one agent session', async () => {
        stubBase([makeProvider()]);
        const left = await engine().StartSessionForAgentSession('sess-multi', undefined, undefined, 'left');
        const right = await engine().StartSessionForAgentSession('sess-multi', undefined, undefined, 'right');

        // Two distinct live sessions — the defect returned `right === left`.
        expect(right).not.toBe(left);
        expect(engine().ActiveSessions.length).toBe(2);

        // Each key resolves back to its OWN browser, which is what makes the second surface drivable.
        expect(engine().GetSessionForAgentSession('sess-multi', 'left')).toBe(left);
        expect(engine().GetSessionForAgentSession('sess-multi', 'right')).toBe(right);

        await engine().EndSessionForAgentSession('sess-multi', 'left');
        await engine().EndSessionForAgentSession('sess-multi', 'right');
    });

    it('keeps the unkeyed instance distinct from a named one', async () => {
        stubBase([makeProvider()]);
        // The unkeyed instance is the one every existing caller gets. A named instance must not
        // hijack it, or adding a second surface would silently move the first surface's browser.
        const unkeyed = await engine().StartSessionForAgentSession('sess-mixed');
        const named = await engine().StartSessionForAgentSession('sess-mixed', undefined, undefined, 'secondary');

        expect(named).not.toBe(unkeyed);
        expect(engine().GetSessionForAgentSession('sess-mixed')).toBe(unkeyed);
        // An empty / whitespace key is NOT a third instance — it is the unkeyed one, so a caller
        // threading an absent value through as '' lands where it did before the argument existed.
        expect(engine().GetSessionForAgentSession('sess-mixed', '')).toBe(unkeyed);
        expect(engine().GetSessionForAgentSession('sess-mixed', '   ')).toBe(unkeyed);
        expect(engine().ActiveSessions.length).toBe(2);

        await engine().EndSessionForAgentSession('sess-mixed');
        await engine().EndSessionForAgentSession('sess-mixed', 'secondary');
    });

    it('treats an instanceKey case- and whitespace-insensitively', async () => {
        stubBase([makeProvider()]);
        // The key crosses the wire as a GraphQL argument typed by hand in a channel config, so
        // 'Primary' and 'primary' being two browsers would be a spelling trap, not a feature.
        const first = await engine().StartSessionForAgentSession('sess-case', undefined, undefined, 'Primary');
        const again = await engine().StartSessionForAgentSession('sess-case', undefined, undefined, '  primary ');

        expect(again).toBe(first);
        expect(engine().ActiveSessions.length).toBe(1);
        await engine().EndSessionForAgentSession('sess-case', 'PRIMARY');
        expect(engine().GetSessionForAgentSession('sess-case', 'primary')).toBeUndefined();
    });

    it('does not let one agent session bleed into another that uses the same instanceKey', async () => {
        stubBase([makeProvider()]);
        // Both interviews name their second surface 'resume'. The composite key must stay scoped to
        // the agent session — otherwise two concurrent candidates share a browser, which is the
        // same-key-collides failure the naive `${id}:${key}` concatenation invites.
        const a = await engine().StartSessionForAgentSession('sess-a', undefined, undefined, 'resume');
        const b = await engine().StartSessionForAgentSession('sess-b', undefined, undefined, 'resume');

        expect(b).not.toBe(a);
        expect(engine().GetSessionForAgentSession('sess-a', 'resume')).toBe(a);
        expect(engine().GetSessionForAgentSession('sess-b', 'resume')).toBe(b);

        await engine().EndSessionForAgentSession('sess-a', 'resume');
        await engine().EndSessionForAgentSession('sess-b', 'resume');
    });

    it('coalesces concurrent starts PER INSTANCE, not per agent session', async () => {
        stubBase([makeProvider()]);
        // The coalescing map is keyed the same way the session map is. Keyed by agent session alone
        // it would collapse two DIFFERENT surfaces racing to start into one browser — the duplicate
        // -browser fix turning into a missing-browser bug.
        const results = await Promise.all([
            engine().StartSessionForAgentSession('sess-race2', undefined, undefined, 'left'),
            engine().StartSessionForAgentSession('sess-race2', undefined, undefined, 'left'),
            engine().StartSessionForAgentSession('sess-race2', undefined, undefined, 'right'),
            engine().StartSessionForAgentSession('sess-race2', undefined, undefined, 'right'),
        ]);
        expect(results[1]).toBe(results[0]);
        expect(results[3]).toBe(results[2]);
        expect(results[2]).not.toBe(results[0]);
        expect(engine().ActiveSessions.length).toBe(2);

        await engine().EndSessionForAgentSession('sess-race2', 'left');
        await engine().EndSessionForAgentSession('sess-race2', 'right');
    });

    it('ends only the named instance and leaves its siblings live', async () => {
        stubBase([makeProvider()]);
        const left = await engine().StartSessionForAgentSession('sess-end-one', undefined, undefined, 'left');
        await engine().StartSessionForAgentSession('sess-end-one', undefined, undefined, 'right');

        expect(await engine().EndSessionForAgentSession('sess-end-one', 'right')).toBe(true);
        expect(engine().GetSessionForAgentSession('sess-end-one', 'right')).toBeUndefined();
        // The surviving surface is still driveable — a shared teardown would have killed both.
        expect(engine().GetSessionForAgentSession('sess-end-one', 'left')).toBe(left);
        expect(engine().ActiveSessions.length).toBe(1);

        await engine().EndSessionForAgentSession('sess-end-one', 'left');
        expect(engine().ActiveSessions.length).toBe(0);
    });
});
