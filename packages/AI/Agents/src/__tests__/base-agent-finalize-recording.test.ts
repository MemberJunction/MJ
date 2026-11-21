/**
 * `BaseAgent.finalizeRealtimeRecording` reports the end-of-call store honestly (#6010).
 *
 * The store never throws, so the agent's log line is the only place its reason reaches an operator. A
 * `FileID` alongside an `ErrorMessage` means the file was uploaded but the session was not stamped with it
 * (`StampFile` failed): that is a failure, and logging it as "stored" would hide a recording only the
 * janitor can now recover.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

vi.mock('../realtime/realtime-recording-store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../realtime/realtime-recording-store')>();
    return { ...actual, StoreRealtimeRecording: vi.fn() };
});

import { BaseAgent } from '../base-agent';
import { RealtimeRecordingController } from '../realtime/realtime-recording-capture';
import { StoreRealtimeRecording, StoreRealtimeRecordingResult } from '../realtime/realtime-recording-store';

/** Captures what the agent logs instead of writing it. */
class RecordingProbeAgent extends BaseAgent {
    public readonly Statuses: string[] = [];
    public readonly Errors: string[] = [];

    protected override logStatus(message: string): void {
        this.Statuses.push(message);
    }

    protected override logError(error: Error | string): void {
        this.Errors.push(error instanceof Error ? error.message : error);
    }

    /** Arms the one-shot recording state the realtime session would have set, then finalizes it. */
    public async Finalize(params: ExecuteAgentParams): Promise<void> {
        const controller = new RealtimeRecordingController();
        vi.spyOn(controller, 'EncodeWav').mockReturnValue({ Buffer: Buffer.from([1, 2, 3]), DurationMs: 58_800, SampleRate: 48_000 });
        vi.spyOn(controller, 'GetPeaks').mockReturnValue([]);
        this['realtimeRecording'] = controller;
        this['realtimeRecordingAccountId'] = 'storage-account';
        await this['finalizeRealtimeRecording'](params);
    }
}

const params = {
    agentSessionID: 'session-1',
    contextUser: new UserInfo(undefined, { ID: 'user-1', Name: 'Probe', Email: 'probe@example.com' }),
} as ExecuteAgentParams;

function storeReturns(result: StoreRealtimeRecordingResult): void {
    vi.mocked(StoreRealtimeRecording).mockResolvedValue(result);
}

beforeEach(() => {
    vi.mocked(StoreRealtimeRecording).mockReset();
});

describe('BaseAgent.finalizeRealtimeRecording', () => {
    it('logs a stored recording only when the file was uploaded and stamped', async () => {
        storeReturns({ FileID: 'file-1', ErrorMessage: null, Superseded: false });
        const agent = new RecordingProbeAgent();
        await agent.Finalize(params);
        expect(agent.Statuses.some(s => /Realtime recording stored/.test(s))).toBe(true);
        expect(agent.Errors).toEqual([]);
    });

    it('logs an uploaded but unstamped file as a failure, with the stamp error', async () => {
        storeReturns({ FileID: 'file-1', ErrorMessage: 'spStampAIAgentSessionRecordingFile returned no row', Superseded: false });
        const agent = new RecordingProbeAgent();
        await agent.Finalize(params);
        expect(agent.Statuses.some(s => /Realtime recording stored/.test(s))).toBe(false);
        expect(agent.Errors).toHaveLength(1);
        expect(agent.Errors[0]).toContain('session-1');
        expect(agent.Errors[0]).toContain('spStampAIAgentSessionRecordingFile returned no row');
    });

    it('logs a failed upload as a failure', async () => {
        storeReturns({ FileID: null, ErrorMessage: 'upload failed', Superseded: false });
        const agent = new RecordingProbeAgent();
        await agent.Finalize(params);
        expect(agent.Statuses.some(s => /Realtime recording stored/.test(s))).toBe(false);
        expect(agent.Errors[0]).toContain('upload failed');
    });
});
