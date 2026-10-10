/**
 * A start that fails once the agent's model session is open closes that session before the error propagates (#5308): the
 * bot's token can't be minted, or the bridge doesn't start (its row can't be saved, the driver can't connect). Nothing else
 * would close it: the bridge engine closes a model session only once it holds one, so a failed bridge start left a live
 * model connection in MJAPI until the provider timed it out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IRealtimeSession, RealtimeInputFrame, RealtimeToolDefinition } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import type { ActiveBridgeSession } from '@memberjunction/ai-bridge-server';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps } from '../livekit-agent-room-coordinator';
import { LiveKitTokenService, type MintedToken } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** What the engine throws when the bridge row can't be saved, as for a user who may not create bridge rows (#5307). */
const BRIDGE_ROW_ERROR = 'Failed to create AIAgentSessionBridge: the user may not create MJ: AI Agent Session Bridges';

/** A model session that counts its closes; its close can be made to fail. */
class FakeModelSession implements IRealtimeSession {
    public CloseCalls = 0;
    constructor(private readonly closeError?: Error) {}
    public SendInput(_frame: RealtimeInputFrame): void {
        /* not driven here */
    }
    public async RegisterTools(_tools: RealtimeToolDefinition[]): Promise<void> {
        /* not driven here */
    }
    public OnOutput(): void {
        /* not driven here */
    }
    public OnTranscript(): void {
        /* not driven here */
    }
    public OnToolCall(): void {
        /* not driven here */
    }
    public async SendToolResult(): Promise<void> {
        /* not driven here */
    }
    public OnInterruption(): void {
        /* not driven here */
    }
    public OnError(): void {
        /* not driven here */
    }
    public OnUsage(): void {
        /* not driven here */
    }
    public async Close(): Promise<void> {
        this.CloseCalls++;
        if (this.closeError) {
            throw this.closeError;
        }
    }
}

/** A token service whose bot-token mint fails, after the coordinator's configuration check passes. */
class FailingMintTokenService extends LiveKitTokenService {
    public override async MintBotToken(): Promise<MintedToken> {
        throw new Error('mint failed');
    }
}

/** Bridge operations whose start succeeds, or fails with the given error. */
function makeBridgeOps(startError?: Error): BridgeOps {
    let seq = 0;
    return {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS }) as unknown as MJAIBridgeProviderEntity),
        StartBridgeSession: vi.fn(async () => {
            if (startError) {
                throw startError;
            }
            return { SessionBridgeID: `failed-start-bridge-${++seq}` } as unknown as ActiveBridgeSession;
        }),
        StopBridgeSession: vi.fn(async () => true),
        ReconfigureSessionToMeeting: vi.fn(() => true),
    };
}

describe('LiveKitAgentRoomCoordinator — a failed start closes the model session it opened (#5308)', () => {
    const coordinator = LiveKitAgentRoomCoordinator.Instance;
    let room = 0;
    let session: FakeModelSession;
    const roomName = () => `failed-start-room-${room}`;
    const start = () => coordinator.StartAgentRoomSession({ AgentSessionID: `failed-start-${++room}`, RoomName: `failed-start-room-${room}`, AgentName: 'Sage' });

    beforeEach(() => {
        session = new FakeModelSession();
        coordinator.SetSessionFactory(async () => session);
        coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    });

    it("closes it when the bot's token can't be minted, before any bridge starts", async () => {
        const ops = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetTokenService(new FailingMintTokenService(CONFIG));

        await expect(start()).rejects.toThrow('mint failed');

        expect(session.CloseCalls).toBe(1);
        expect(ops.StartBridgeSession).not.toHaveBeenCalled();
    });

    it("closes it when the bridge doesn't start, and the caller gets the bridge's error", async () => {
        const ops = makeBridgeOps(new Error(BRIDGE_ROW_ERROR));
        coordinator.SetBridgeOps(ops);

        await expect(start()).rejects.toThrow(BRIDGE_ROW_ERROR);

        expect(ops.StartBridgeSession).toHaveBeenCalledWith(expect.objectContaining({ RealtimeSession: session }));
        expect(session.CloseCalls).toBe(1);
        // The agent never joined, so it isn't on the room's roster.
        expect(coordinator.GetAgentsInRoom(roomName())).toEqual([]);
    });

    it("still reports the start's own error when closing the model session fails as well", async () => {
        session = new FakeModelSession(new Error('socket already gone'));
        coordinator.SetBridgeOps(makeBridgeOps(new Error(BRIDGE_ROW_ERROR)));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            await expect(start()).rejects.toThrow(BRIDGE_ROW_ERROR);

            expect(session.CloseCalls).toBe(1);
            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('closing the model session of a failed start failed: socket already gone'));
        } finally {
            consoleError.mockRestore();
        }
    });

    it('leaves it open when the start succeeds: from then on the bridge holds it', async () => {
        const ops = makeBridgeOps();
        coordinator.SetBridgeOps(ops);

        const started = await start();

        expect(session.CloseCalls).toBe(0);
        expect(ops.StartBridgeSession).toHaveBeenCalledWith(expect.objectContaining({ RealtimeSession: session }));
        expect(coordinator.GetAgentsInRoom(roomName())).toEqual([expect.objectContaining({ SessionBridgeID: started.SessionBridgeID })]);
    });
});

/**
 * Closing the model session finalizes its co-agent run as completed: the agent layer's close always does. So a start that
 * fails records the failure on that run, with the start's error, before it closes the session, and the run of an agent
 * that never joined reads as failed.
 */
describe("LiveKitAgentRoomCoordinator — a failed start's co-agent run reads as failed, with the start's error", () => {
    const coordinator = LiveKitAgentRoomCoordinator.Instance;
    let room = 0;
    let session: FakeModelSession;
    /** Each recorded failure, with how many times its session had been closed when it was recorded. */
    let recorded: Array<{ Session: IRealtimeSession; Error: string; ClosesBefore: number }>;
    const start = () => coordinator.StartAgentRoomSession({ AgentSessionID: `failed-run-${++room}`, RoomName: `failed-run-room-${room}`, AgentName: 'Sage' });

    beforeEach(() => {
        session = new FakeModelSession();
        recorded = [];
        coordinator.SetSessionFactory(async () => session);
        coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
        coordinator.SetFailedStartRecorder(async (failed, error) => {
            recorded.push({ Session: failed, Error: error, ClosesBefore: session.CloseCalls });
        });
    });

    afterEach(() => {
        coordinator.SetFailedStartRecorder(undefined);
    });

    const failures: Array<[string, string, () => void]> = [
        [
            "the bot's token can't be minted",
            'mint failed',
            () => {
                coordinator.SetBridgeOps(makeBridgeOps());
                coordinator.SetTokenService(new FailingMintTokenService(CONFIG));
            },
        ],
        ["the bridge doesn't start", BRIDGE_ROW_ERROR, () => coordinator.SetBridgeOps(makeBridgeOps(new Error(BRIDGE_ROW_ERROR)))],
    ];

    it.each(failures)('records the failure before it closes the model session, when %s', async (_why, startError, failStart) => {
        failStart();

        await expect(start()).rejects.toThrow(startError);

        expect(recorded).toEqual([{ Session: session, Error: startError, ClosesBefore: 0 }]);
        expect(session.CloseCalls).toBe(1);
    });

    it("still closes the model session, and reports the start's own error, when recording the failure fails", async () => {
        coordinator.SetBridgeOps(makeBridgeOps(new Error(BRIDGE_ROW_ERROR)));
        coordinator.SetFailedStartRecorder(async () => {
            throw new Error('database unreachable');
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            await expect(start()).rejects.toThrow(BRIDGE_ROW_ERROR);

            expect(session.CloseCalls).toBe(1);
            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("recording a failed start on the agent's run failed: database unreachable"));
        } finally {
            consoleError.mockRestore();
        }
    });

    it('records nothing when the start succeeds', async () => {
        coordinator.SetBridgeOps(makeBridgeOps());

        await start();

        expect(recorded).toEqual([]);
        expect(session.CloseCalls).toBe(0);
    });
});
