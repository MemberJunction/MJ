import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    MJAIBridgeProviderEntity,
    MJAIAgentSessionBridgeEntity,
} from '@memberjunction/core-entities';
import {
    ScheduledBridgeRunner,
    DueBridgeContext,
    ScheduledBridgeSessionFactory,
} from '../scheduled-bridge-runner';
import type {
    AIBridgeEngine,
    StartBridgeSessionParams,
    ActiveBridgeSession,
} from '../ai-bridge-engine';

function makeUser(): UserInfo {
    return { ID: 'user-1', Email: 'svc@example.com' } as unknown as UserInfo;
}

function makeProvider(): IMetadataProvider {
    return { GetEntityObject: vi.fn() } as unknown as IMetadataProvider;
}

function makeZoom(): MJAIBridgeProviderEntity {
    return { ID: 'provider-zoom', Name: 'Zoom', Status: 'Active' } as unknown as MJAIBridgeProviderEntity;
}

let dueSeq = 0;
function makeDueRow(
    overrides: Partial<MJAIAgentSessionBridgeEntity> = {},
): MJAIAgentSessionBridgeEntity {
    return {
        ID: `due-${++dueSeq}`,
        ProviderID: 'provider-zoom',
        Status: 'Scheduled',
        Address: 'https://us02web.zoom.us/j/1',
        ...overrides,
    } as unknown as MJAIAgentSessionBridgeEntity;
}

/** A fake engine exposing only Providers + StartBridgeSession. */
function makeEngine(
    providers: MJAIBridgeProviderEntity[],
    start: (p: StartBridgeSessionParams) => Promise<ActiveBridgeSession>,
): { engine: AIBridgeEngine; startMock: ReturnType<typeof vi.fn> } {
    const startMock = vi.fn(start);
    const engine = {
        Providers: providers,
        StartBridgeSession: startMock,
    } as unknown as AIBridgeEngine;
    return { engine, startMock };
}

const FIXED_NOW = Date.UTC(2026, 5, 13, 12, 0, 0);

/** A session factory that returns minimal valid params (the host's job in production). */
const okFactory: ScheduledBridgeSessionFactory = (ctx: DueBridgeContext) =>
    ({
        AgentSessionID: ctx.BridgeRow.AgentSessionID ?? 'session-x',
        Provider: ctx.Provider,
        RealtimeSession: {} as never,
        Address: ctx.BridgeRow.Address ?? '',
        MetadataProvider: ctx.MetadataProvider,
        ContextUser: ctx.ContextUser,
    }) as StartBridgeSessionParams;

function makeRunner(
    engineParts: ReturnType<typeof makeEngine>,
    factory: ScheduledBridgeSessionFactory,
    provider: IMetadataProvider,
): ScheduledBridgeRunner {
    return new ScheduledBridgeRunner({
        Engine: engineParts.engine,
        SessionFactory: factory,
        ContextUser: makeUser(),
        MetadataProvider: provider,
        Now: () => FIXED_NOW,
    });
}

beforeEach(() => {
    runViewMock.mockReset();
});

describe('ScheduledBridgeRunner — due bridges are started', () => {
    it('starts each due bridge via the engine', async () => {
        const due = [makeDueRow({ ID: 'due-A' }), makeDueRow({ ID: 'due-B' })];
        runViewMock.mockResolvedValue({ Success: true, Results: due });
        const parts = makeEngine([makeZoom()], async () => ({
            SessionBridgeID: 'live-1',
        }) as ActiveBridgeSession);
        const runner = makeRunner(parts, okFactory, makeProvider());

        const result = await runner.RunDueBridges();

        expect(result.DueFound).toBe(2);
        expect(result.Started).toBe(2);
        expect(result.Failed).toBe(0);
        expect(parts.startMock).toHaveBeenCalledTimes(2);
    });

    it('filters on Status=Scheduled AND ScheduledStartTime <= now', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(parts, okFactory, makeProvider());

        await runner.RunDueBridges();

        const filter = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain("Status='Scheduled'");
        expect(filter).toContain('ScheduledStartTime <=');
        expect(filter).toContain(new Date(FIXED_NOW).toISOString());
    });
});

describe('ScheduledBridgeRunner — not-yet-due bridges are not loaded', () => {
    it('starts nothing when the query returns no due rows', async () => {
        // A not-yet-due bridge would be excluded by the SQL filter, so the query returns empty.
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(parts, okFactory, makeProvider());

        const result = await runner.RunDueBridges();

        expect(result.DueFound).toBe(0);
        expect(result.Started).toBe(0);
        expect(parts.startMock).not.toHaveBeenCalled();
    });
});

describe('ScheduledBridgeRunner — skip / fail / unresolved handling', () => {
    it('leaves a bridge Scheduled (skipped) when the factory declines', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [makeDueRow()] });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(parts, () => null, makeProvider());

        const result = await runner.RunDueBridges();

        expect(result.Skipped).toBe(1);
        expect(result.Started).toBe(0);
        expect(parts.startMock).not.toHaveBeenCalled();
    });

    it('counts a bridge unresolved when its provider is missing from the cache', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [makeDueRow({ ProviderID: 'provider-unknown' })],
        });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(parts, okFactory, makeProvider());

        const result = await runner.RunDueBridges();

        expect(result.Unresolved).toBe(1);
        expect(result.Started).toBe(0);
        expect(parts.startMock).not.toHaveBeenCalled();
    });

    it('counts a failure when StartBridgeSession throws and continues the pass', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [makeDueRow({ ID: 'bad' }), makeDueRow({ ID: 'good' })],
        });
        const parts = makeEngine([makeZoom()], async (p) => {
            if (p.AgentSessionID === 'bad-session') {
                throw new Error('connect rejected');
            }
            return { SessionBridgeID: 'live' } as ActiveBridgeSession;
        });
        const factory: ScheduledBridgeSessionFactory = (ctx) =>
            ({
                AgentSessionID: ctx.BridgeRow.ID === 'bad' ? 'bad-session' : 'good-session',
                Provider: ctx.Provider,
                RealtimeSession: {} as never,
                Address: '',
                MetadataProvider: ctx.MetadataProvider,
                ContextUser: ctx.ContextUser,
            }) as StartBridgeSessionParams;
        const runner = makeRunner(parts, factory, makeProvider());

        const result = await runner.RunDueBridges();

        expect(result.Failed).toBe(1);
        expect(result.Started).toBe(1);
    });

    it('counts a failure when the factory itself throws', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [makeDueRow()] });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(
            parts,
            () => {
                throw new Error('factory boom');
            },
            makeProvider(),
        );

        const result = await runner.RunDueBridges();
        expect(result.Failed).toBe(1);
        expect(result.Started).toBe(0);
    });

    it('returns empty result and starts nothing when the load query fails', async () => {
        runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });
        const parts = makeEngine([makeZoom()], async () => ({}) as ActiveBridgeSession);
        const runner = makeRunner(parts, okFactory, makeProvider());

        const result = await runner.RunDueBridges();
        expect(result.DueFound).toBe(0);
        expect(parts.startMock).not.toHaveBeenCalled();
    });
});
