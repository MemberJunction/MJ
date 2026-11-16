import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    BaseRealtimeSession,
    type RealtimeInputFrame,
    type RealtimeReconnectContext,
    type RealtimeSessionError,
    type RealtimeToolCall,
    type RealtimeToolDefinition,
    type RealtimeTranscript,
    type RealtimeUsage,
} from '../generic/baseRealtime';
import { REALTIME_RESUMPTION_RECOVERY_WINDOW_MS } from '../generic/realtimeSessionResumption';

/** One tool result as it went out, on the connection that carried it. */
interface SentToolResult {
    Connection: number;
    CallID: string;
    /** `late-note` when the call came from before a reseed (sent as a note, not as the call's result). */
    Kind: 'result' | 'late-note';
}

/**
 * A session whose "connections" are numbers. Its reconnect waits until the test lets it land (or fail), so a tool
 * result can be sent while the move is in flight. Its `SendToolResult` follows the drivers: hold during a reconnect,
 * else send as a late-result note when the call came from before a reseed, else as the call's result.
 */
class ToolHoldSession extends BaseRealtimeSession {
    public Connection = 1;
    public readonly Sent: SentToolResult[] = [];
    public readonly Errors: RealtimeSessionError[] = [];
    public TrustNative = false;
    public FailReconnects = false;
    public FailSends = false;
    private landReconnect: (() => void) | null = null;

    constructor() {
        super(undefined, null);
    }

    public override get TrustsNativeResumption(): boolean {
        return this.TrustNative;
    }

    /** Lets the in-flight reconnect swap in its new connection. */
    public LandReconnect(): void {
        this.landReconnect?.();
        this.landReconnect = null;
    }

    public SimulateToolCall(callID: string, name: string): void {
        this.pendingToolCallNames.set(callID, name);
    }

    protected override async Reconnect(_context: RealtimeReconnectContext): Promise<void> {
        if (this.FailReconnects) {
            throw new Error('socket refused');
        }
        await new Promise<void>((resolve) => {
            this.landReconnect = resolve;
        });
        this.Connection++;
    }

    protected override emitSessionError(error: RealtimeSessionError): void {
        this.Errors.push(error);
    }

    /** Not `async`, so a failing send can throw before it returns a promise, as a driver's might. */
    public SendToolResult(callID: string, output: string): Promise<void> {
        if (this.holdToolResultDuringReconnect(callID, output)) {
            return Promise.resolve();
        }
        if (this.FailSends) {
            throw new Error('socket gone');
        }
        this.pendingToolCallNames.delete(callID);
        const kind = this.callsFromBeforeReseed.delete(callID) ? 'late-note' : 'result';
        this.Sent.push({ Connection: this.Connection, CallID: callID, Kind: kind });
        return Promise.resolve();
    }

    public SendInput(_frame: RealtimeInputFrame): void {}
    public async RegisterTools(_tools: RealtimeToolDefinition[]): Promise<void> {}
    public OnOutput(_handler: (chunk: ArrayBuffer) => void): void {}
    public OnTranscript(_handler: (t: RealtimeTranscript) => void): void {}
    public OnToolCall(_handler: (call: RealtimeToolCall) => void): void {}
    public OnInterruption(_handler: () => void): void {}
    public OnError(_handler: (error: RealtimeSessionError) => void): void {}
    public OnUsage(_handler: (u: RealtimeUsage) => void): void {}
    public async Close(): Promise<void> {
        this.DisposeReconnectTimers();
    }
}

describe('BaseRealtimeSession — tool results sent while a reconnect moves the session', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
        vi.useRealTimers();
    });

    it('sends a result at once outside a reconnect', async () => {
        const session = new ToolHoldSession();
        session.SimulateToolCall('call-1', 'lookup');
        await session.SendToolResult('call-1', '{"ok":true}');
        expect(session.Sent).toEqual([{ Connection: 1, CallID: 'call-1', Kind: 'result' }]);
        await session.Close();
    });

    it('holds a result sent during the move and sends it once on the new connection, as a late-result note after a reseed', async () => {
        const session = new ToolHoldSession();
        session.SimulateToolCall('call-1', 'lookup');
        const reconnect = session.TriggerReconnect('connection-lost');
        expect(session.IsReconnecting).toBe(true);

        await session.SendToolResult('call-1', '{"ok":true}');
        expect(session.Sent).toEqual([]); // not on the connection being replaced

        session.LandReconnect();
        expect(await reconnect).toBe(true);
        expect(session.Sent).toEqual([{ Connection: 2, CallID: 'call-1', Kind: 'late-note' }]);
        await session.Close();
    });

    it('sends a held result as the call\'s own result after a native resumption, which keeps the call', async () => {
        const session = new ToolHoldSession();
        session.TrustNative = true;
        session.RecordResumptionHandle('handle-1');
        session.SimulateToolCall('call-1', 'lookup');
        const reconnect = session.TriggerReconnect('connection-lost');

        await session.SendToolResult('call-1', '{"ok":true}');
        session.LandReconnect();
        expect(await reconnect).toBe(true);
        expect(session.Sent).toEqual([{ Connection: 2, CallID: 'call-1', Kind: 'result' }]);
        await session.Close();
    });

    it('keeps the order of several held results', async () => {
        const session = new ToolHoldSession();
        session.SimulateToolCall('call-1', 'first');
        session.SimulateToolCall('call-2', 'second');
        const reconnect = session.TriggerReconnect('connection-lost');

        await session.SendToolResult('call-2', '"b"');
        await session.SendToolResult('call-1', '"a"');
        session.LandReconnect();
        await reconnect;
        expect(session.Sent).toEqual([
            { Connection: 2, CallID: 'call-2', Kind: 'late-note' },
            { Connection: 2, CallID: 'call-1', Kind: 'late-note' },
        ]);
        await session.Close();
    });

    it('lands the reconnect and warns when a held result fails to send on the new connection', async () => {
        const session = new ToolHoldSession();
        session.SimulateToolCall('call-1', 'lookup');
        const reconnect = session.TriggerReconnect('connection-lost');

        await session.SendToolResult('call-1', '{"ok":true}');
        session.FailSends = true;
        session.LandReconnect();
        await vi.advanceTimersByTimeAsync(0);

        expect(await reconnect).toBe(true);
        expect(session.Connection).toBe(2);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be sent on the new connection: socket gone'));
        await session.Close();
    });

    it('drops held results with a warning when the reconnect fails', async () => {
        const session = new ToolHoldSession();
        session.FailReconnects = true;
        session.SimulateToolCall('call-1', 'lookup');
        const reconnect = session.TriggerReconnect('connection-lost');

        await session.SendToolResult('call-1', '{"ok":true}');
        await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS + 10_000);
        expect(await reconnect).toBe(false);

        expect(session.Errors).toHaveLength(1);
        expect(session.Sent).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dropped 1 tool result(s) held during a reconnect: the reconnect failed'));
        await session.Close();
    });

    it('drops held results when the session closes during the move, and never sends them', async () => {
        const session = new ToolHoldSession();
        session.SimulateToolCall('call-1', 'lookup');
        const reconnect = session.TriggerReconnect('connection-lost');

        await session.SendToolResult('call-1', '{"ok":true}');
        await session.Close();
        session.LandReconnect();
        expect(await reconnect).toBe(false);

        expect(session.Sent).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('the session closed'));
    });
});
