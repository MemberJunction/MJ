import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { logErrorMock, logStatusMock } = vi.hoisted(() => ({
    logErrorMock: vi.fn(),
    logStatusMock: vi.fn(),
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logErrorMock, LogStatus: logStatusMock };
});

import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { request as httpRequest, type Server } from 'node:http';
import express from 'express';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { EncodeRecordingShard, RECORDING_SHARD_MAX_BYTES } from '@memberjunction/ai-core-plus';
import type {
    AssembleRealtimeRecordingInput, AssembleRealtimeRecordingOutcome, FinishAssemblyInput, IRealtimeRecordingLedger,
    LedgerShard, LedgerShardMetadata, RecordShardInput, RecordShardResult,
} from '@memberjunction/ai-agents';
import { MAX_ASSEMBLY_SHARDS } from '@memberjunction/ai-agents';
import {
    CreateRealtimeRecordingRouter, FINAL_TERMINAL_RECHECK_MS, REALTIME_RECORDING_MOUNT_PATH, type RealtimeRecordingRouterDeps,
} from '../rest/RealtimeRecordingHandler.js';
import { RealtimeSessionNotFoundError, RealtimeSessionOwnershipError } from '../realtimeSessions/ownedRealtimeSession.js';
import { RecordingAssemblyScheduler, type IRecordingAssemblyScheduler } from '../realtimeSessions/RecordingAssemblyScheduler.js';

const SESSION = '11111111-1111-4111-8111-111111111111';
const MISSING = '99999999-9999-4999-8999-999999999999';
const OWNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STRANGER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const GRACE_MS = 90_000;
const HOUR_MS = 3_600_000;
const SHARD_SAMPLES = 240_000;

type Status = 'Pending' | 'Assembling' | 'Complete' | 'Partial' | 'Failed' | null;

interface FakeSessionRow {
    UserID: string;
    RecordingStatus: Status;
    RecordingExpectedShards: number | null;
    RecordingCapturedSamples: number | null;
    RecordingAssemblyVersion: number;
    ClosedAt: Date | null;
    /** When the server created the session: no recording can hold more audio than the session has lived. */
    CreatedAt: Date;
    /** The session conversation's ExternalID: an anonymous widget guest's per-session scope. */
    ConversationExternalID?: string | null;
}

interface StoredShard {
    Index: number;
    StartSample: number;
    SampleCount: number;
    Sha256: string;
    Data: Buffer;
}

/**
 * In-memory ledger mirroring the guarded procs' semantics (see the shard-ledger migration). Every method
 * does its check-and-set without an await in between, which is what makes the fake claim atomic.
 */
class FakeLedger implements IRealtimeRecordingLedger {
    public readonly Sessions = new Map<string, FakeSessionRow>();
    public readonly Shards = new Map<string, Map<number, StoredShard>>();

    public async RecordShard(input: RecordShardInput): Promise<RecordShardResult> {
        const row = this.row(input.SessionID);
        const shards = this.shardsOf(input.SessionID);
        const existing = shards.get(input.Index);
        let outcome: RecordShardResult['Outcome'];
        if (!existing) {
            shards.set(input.Index, {
                Index: input.Index, StartSample: input.StartSample, SampleCount: input.SampleCount,
                Sha256: input.Sha256, Data: Buffer.from(input.Data),
            });
            outcome = 'Inserted';
            const reopen = row.RecordingStatus === null || row.RecordingStatus === 'Assembling'
                || ((row.RecordingStatus === 'Complete' || row.RecordingStatus === 'Partial') && input.Index >= (row.RecordingExpectedShards ?? 0));
            if (reopen) {
                if (row.RecordingStatus === 'Assembling') {
                    row.RecordingAssemblyVersion++;
                }
                row.RecordingStatus = 'Pending';
            }
        } else if (existing.Sha256 === input.Sha256) {
            outcome = 'Duplicate';
        } else {
            outcome = 'Conflict';
            row.RecordingStatus = 'Failed';
        }
        return { Outcome: outcome, RecordingStatus: row.RecordingStatus, ExpectedShards: row.RecordingExpectedShards, ClosedAt: row.ClosedAt };
    }

    public async StampTerminal(sessionID: string, expected: number, captured: number): Promise<{ Outcome: 'Stamped' | 'Ignored'; RecordingStatus: string | null }> {
        const row = this.row(sessionID);
        const accepted = (row.RecordingExpectedShards === null || expected >= row.RecordingExpectedShards)
            && (row.RecordingCapturedSamples === null || captured >= row.RecordingCapturedSamples);
        if (!accepted) {
            return { Outcome: 'Ignored', RecordingStatus: row.RecordingStatus };
        }
        const higher = expected > (row.RecordingExpectedShards ?? -1) || captured > (row.RecordingCapturedSamples ?? -1);
        if (row.RecordingStatus === 'Assembling' && higher) {
            row.RecordingAssemblyVersion++;
        }
        if (row.RecordingStatus === null || (higher && (row.RecordingStatus === 'Complete' || row.RecordingStatus === 'Partial' || row.RecordingStatus === 'Assembling'))) {
            row.RecordingStatus = 'Pending';
        }
        row.RecordingExpectedShards = expected;
        row.RecordingCapturedSamples = captured;
        return { Outcome: 'Stamped', RecordingStatus: row.RecordingStatus };
    }

    public async ClaimAssembly(sessionID: string): Promise<number | null> {
        const row = this.row(sessionID);
        if (row.RecordingStatus !== 'Pending' && row.RecordingStatus !== 'Partial') {
            return null;
        }
        row.RecordingStatus = 'Assembling';
        return ++row.RecordingAssemblyVersion;
    }

    public async FinishAssembly(input: FinishAssemblyInput): Promise<boolean> {
        const row = this.row(input.SessionID);
        if (row.RecordingAssemblyVersion !== input.Version) {
            return false;
        }
        row.RecordingStatus = input.Status;
        return true;
    }

    public async StampAssemblyGaps(): Promise<boolean> {
        throw new Error('not used by the routes');
    }

    public async LoadShards(sessionID: string): Promise<LedgerShard[]> {
        return [...this.shardsOf(sessionID).values()].sort((a, b) => a.Index - b.Index)
            .map(s => ({ Index: s.Index, StartSample: s.StartSample, SampleCount: s.SampleCount, Data: s.Data }));
    }

    public async LoadShardMetadata(sessionID: string): Promise<LedgerShardMetadata[]> {
        return (await this.LoadShards(sessionID)).map(({ Index, StartSample, SampleCount }) => ({ Index, StartSample, SampleCount }));
    }

    public async CountShardsBelow(sessionID: string, indexBelow: number): Promise<number> {
        return [...this.shardsOf(sessionID).keys()].filter(index => index < indexBelow).length;
    }

    public async DeleteShardsBelow(): Promise<number> {
        throw new Error('not used by the routes');
    }

    public async PurgeClosedBefore(): Promise<number> {
        throw new Error('not used by the routes');
    }

    private row(sessionID: string): FakeSessionRow {
        const row = this.Sessions.get(sessionID);
        if (!row) {
            throw new Error(`fake ledger: no session ${sessionID}`);
        }
        return row;
    }

    private shardsOf(sessionID: string): Map<number, StoredShard> {
        let shards = this.Shards.get(sessionID);
        if (!shards) {
            shards = new Map();
            this.Shards.set(sessionID, shards);
        }
        return shards;
    }
}

/** A valid MJOPUS1 shard; `seed` changes the packet bytes (and so the hash) without changing the header. */
function shardBytes(index: number, seed = 1, sampleCount = SHARD_SAMPLES, packetBytes = 80): Uint8Array {
    const packetCount = Math.ceil(sampleCount / 960);
    const packets = Array.from({ length: packetCount }, () => new Uint8Array(packetBytes).fill(seed));
    return EncodeRecordingShard({ ShardIndex: index, StartSample: index * SHARD_SAMPLES, SampleCount: sampleCount, PacketCount: packetCount, Packets: packets });
}

/** The server's system user: the only principal with read access to the shard entity. */
const SYSTEM_USER = { ID: 'system-user' } as unknown as UserInfo;

/**
 * The ledger as a request's caller sees it: the guarded procs work, but a read of the shard entity is
 * refused, exactly as `CheckUserReadPermissions` refuses UI users and widget guests (no CanRead).
 */
function callerLedger(inner: FakeLedger): IRealtimeRecordingLedger {
    const refuse = async (): Promise<never> => {
        throw new Error('User does not have read permissions on MJ: AI Agent Session Recording Shards');
    };
    return {
        RecordShard: input => inner.RecordShard(input),
        StampTerminal: (id, expected, captured) => inner.StampTerminal(id, expected, captured),
        ClaimAssembly: id => inner.ClaimAssembly(id),
        FinishAssembly: input => inner.FinishAssembly(input),
        StampAssemblyGaps: () => inner.StampAssemblyGaps(),
        LoadShards: refuse,
        LoadShardMetadata: refuse,
        CountShardsBelow: refuse,
        DeleteShardsBelow: () => inner.DeleteShardsBelow(),
        PurgeClosedBefore: () => inner.PurgeClosedBefore(),
    };
}

function sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

describe('realtime recording REST routes', () => {
    let ledger: FakeLedger;
    let scheduler: { ScheduleAssembly: ReturnType<typeof vi.fn<IRecordingAssemblyScheduler['ScheduleAssembly']>> };
    let deps: RealtimeRecordingRouterDeps;
    let server: Server | null;
    let baseUrl: string;

    async function listen(): Promise<void> {
        const app = express();
        app.use(REALTIME_RECORDING_MOUNT_PATH, CreateRealtimeRecordingRouter(deps));
        server = await new Promise<Server>(resolve => {
            const s = app.listen(0, () => resolve(s));
        });
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${REALTIME_RECORDING_MOUNT_PATH}`;
    }

    function addSession(id: string, overrides: Partial<FakeSessionRow> = {}): FakeSessionRow {
        const row: FakeSessionRow = {
            UserID: OWNER_ID, RecordingStatus: null, RecordingExpectedShards: null, RecordingCapturedSamples: null,
            RecordingAssemblyVersion: 0, ClosedAt: null, CreatedAt: new Date(Date.now() - 48 * HOUR_MS), ...overrides,
        };
        ledger.Sessions.set(id, row);
        return row;
    }

    function post(path: string, body: Uint8Array | null, user = OWNER_ID, headers: Record<string, string> = {}): Promise<Response> {
        return fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'x-test-user': user, ...headers },
            body: (body ?? new Uint8Array(0)) as Uint8Array<ArrayBuffer>,
        });
    }

    function postShard(index: number, bytes: Uint8Array = shardBytes(index), user = OWNER_ID): Promise<Response> {
        return post(`/${SESSION}/shard/${index}`, bytes, user);
    }

    function postEnd(lastShardIndex: number, capturedSamples: number, tail: Uint8Array | null = null, user = OWNER_ID): Promise<Response> {
        return post(`/${SESSION}/end?lastShardIndex=${lastShardIndex}&capturedSamples=${capturedSamples}`, tail, user);
    }

    beforeEach(async () => {
        logErrorMock.mockReset();
        logStatusMock.mockReset();
        ledger = new FakeLedger();
        addSession(SESSION);
        scheduler = { ScheduleAssembly: vi.fn() };
        deps = {
            ResolveCaller: req => {
                const id = req.header('x-test-user');
                const scope = req.header('x-test-scope');
                const user = {
                    ID: id,
                    IsMagicLinkAnonymous: req.header('x-test-anonymous') === 'true',
                    AnonymousVisitorID: scope ?? undefined,
                    MagicLinkScope: scope ? { ResourceID: scope } : undefined,
                };
                return id ? { ContextUser: user as unknown as UserInfo, Provider: {} as unknown as DatabaseProviderBase } : null;
            },
            LoadConversationExternalID: async session => ledger.Sessions.get(session.ID)?.ConversationExternalID ?? null,
            LoadOwnedSession: async (agentSessionId, contextUser) => {
                const row = ledger.Sessions.get(agentSessionId);
                if (!row) {
                    throw new RealtimeSessionNotFoundError(agentSessionId);
                }
                if (row.UserID !== contextUser.ID) {
                    throw new RealtimeSessionOwnershipError(agentSessionId);
                }
                return { ID: agentSessionId, __mj_CreatedAt: row.CreatedAt, ...row } as unknown as MJAIAgentSessionEntity;
            },
            CreateLedger: (_provider, contextUser) => (contextUser === SYSTEM_USER ? ledger : callerLedger(ledger)),
            SystemUser: () => SYSTEM_USER,
            Scheduler: scheduler,
            GraceMs: () => GRACE_MS,
        };
        server = null;
        await listen();
    });

    afterEach(async () => {
        await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    });

    describe('POST /:agentSessionId/shard/:index', () => {
        it('stores the shard with its Sha256, StartSample and SampleCount', async () => {
            const bytes = shardBytes(0);
            const res = await postShard(0, bytes);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ stored: true, duplicate: false });
            const stored = ledger.Shards.get(SESSION)?.get(0);
            expect(stored).toMatchObject({ Index: 0, StartSample: 0, SampleCount: SHARD_SAMPLES, Sha256: sha256(bytes) });
            expect(Buffer.compare(stored!.Data, Buffer.from(bytes))).toBe(0);
        });

        it('acknowledges a retry of identical bytes as a duplicate and keeps one row', async () => {
            await postShard(0);
            const res = await postShard(0);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ stored: true, duplicate: true });
            expect(ledger.Shards.get(SESSION)?.size).toBe(1);
        });

        it('answers 409 to the same index with different bytes, logs it, and the session is Failed', async () => {
            await postShard(3);
            const res = await postShard(3, shardBytes(3, 2));
            expect(res.status).toBe(409);
            expect(ledger.Sessions.get(SESSION)?.RecordingStatus).toBe('Failed');
            const logged = logErrorMock.mock.calls.map(call => String(call[0]));
            expect(logged.some(line => line.includes(SESSION) && line.includes('3'))).toBe(true);
        });

        it('answers 413 to a body over 128 KiB without storing anything', async () => {
            const res = await postShard(0, new Uint8Array(RECORDING_SHARD_MAX_BYTES + 1));
            expect(res.status).toBe(413);
            expect(ledger.Shards.get(SESSION)).toBeUndefined();
        });

        it('answers 400 to a malformed shard, a header index that differs from the path, and bad params', async () => {
            expect((await postShard(0, new Uint8Array([1, 2, 3]))).status).toBe(400);
            expect((await postShard(1, shardBytes(0))).status).toBe(400);
            expect((await post(`/not-a-uuid/shard/0`, shardBytes(0))).status).toBe(400);
            expect((await post(`/${SESSION}/shard/-1`, shardBytes(0))).status).toBe(400);
            expect((await post(`/${SESSION}/shard/1.5`, shardBytes(0))).status).toBe(400);
            // The ledger's Index is a SQL INT: an index past it is the client's error, not a 500 from the proc.
            expect((await postShard(2 ** 31, shardBytes(2 ** 31, 1, 960))).status).toBe(400);
            expect(ledger.Shards.get(SESSION)).toBeUndefined();
        });

        it('answers 403 to a caller who does not own the session and 404 to a missing session', async () => {
            expect((await postShard(0, shardBytes(0), STRANGER_ID)).status).toBe(403);
            expect((await post(`/${MISSING}/shard/0`, shardBytes(0))).status).toBe(404);
            expect(ledger.Shards.get(SESSION)).toBeUndefined();
        });

        it('answers 413 to an over-cap chunked body (no Content-Length) through the streaming limit', async () => {
            const url = new URL(`${baseUrl}/${SESSION}/shard/0`);
            const status = await new Promise<number>((resolve, reject) => {
                const req = httpRequest({
                    host: url.hostname, port: url.port, path: url.pathname, method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked', 'x-test-user': OWNER_ID },
                }, res => { res.resume(); resolve(res.statusCode ?? 0); });
                // The server may answer and close before the whole body is written.
                req.on('error', error => (error.message.includes('EPIPE') || error.message.includes('ECONNRESET') ? undefined : reject(error)));
                for (let i = 0; i < 5; i++) {
                    req.write(Buffer.alloc(32 * 1024));
                }
                req.end();
            });
            expect(status).toBe(413);
            expect(logStatusMock.mock.calls.some(call => String(call[0]).includes('over the cap'))).toBe(true);
            expect(ledger.Shards.get(SESSION)).toBeUndefined();
        });

        describe('anonymous widget guests (per-session scope)', () => {
            const SCOPE = 'scope-Abc_123';

            beforeEach(() => {
                addSession(SESSION, { ConversationExternalID: SCOPE });
            });

            it('refuses an anonymous principal without a scope with 403 and logs the reason', async () => {
                const res = await post(`/${SESSION}/shard/0`, shardBytes(0), OWNER_ID, { 'x-test-anonymous': 'true' });
                expect(res.status).toBe(403);
                expect(ledger.Shards.get(SESSION)).toBeUndefined();
                expect(logErrorMock.mock.calls.some(call => String(call[0]).includes(SESSION) && String(call[0]).includes('scope_missing'))).toBe(true);
            });

            it('refuses a mismatched scope with 403, on the shard and the terminal route', async () => {
                const headers = { 'x-test-anonymous': 'true', 'x-test-scope': 'another-guest' };
                expect((await post(`/${SESSION}/shard/0`, shardBytes(0), OWNER_ID, headers)).status).toBe(403);
                expect((await post(`/${SESSION}/end?lastShardIndex=0&capturedSamples=1`, null, OWNER_ID, headers)).status).toBe(403);
                expect(ledger.Shards.get(SESSION)).toBeUndefined();
                expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBeNull();
                expect(logErrorMock.mock.calls.some(call => String(call[0]).includes(SESSION) && String(call[0]).includes('scope_mismatch'))).toBe(true);
            });

            it('accepts the guest that carries the matching scope', async () => {
                const headers = { 'x-test-anonymous': 'true', 'x-test-scope': SCOPE };
                expect((await post(`/${SESSION}/shard/0`, shardBytes(0), OWNER_ID, headers)).status).toBe(200);
                expect((await post(`/${SESSION}/end?lastShardIndex=0&capturedSamples=${SHARD_SAMPLES}`, null, OWNER_ID, headers)).status).toBe(200);
            });

            it('leaves a named owner (no scope, not anonymous) unaffected', async () => {
                expect((await postShard(0)).status).toBe(200);
            });
        });

        it('answers 401 when no caller can be resolved', async () => {
            const res = await fetch(`${baseUrl}/${SESSION}/shard/0`, {
                method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: shardBytes(0) as Uint8Array<ArrayBuffer>,
            });
            expect(res.status).toBe(401);
        });

        it('schedules a re-assembly now for a late gap shard on a Partial session closed under 24 h ago', async () => {
            addSession(SESSION, { RecordingStatus: 'Partial', RecordingExpectedShards: 4, RecordingCapturedSamples: 4 * SHARD_SAMPLES, ClosedAt: new Date(Date.now() - HOUR_MS) });
            expect((await postShard(2)).status).toBe(200);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('answers 410 to a shard for a session closed over 24 h ago and stores nothing (the recording is settled)', async () => {
            addSession(SESSION, { RecordingStatus: 'Partial', RecordingExpectedShards: 4, RecordingCapturedSamples: 4 * SHARD_SAMPLES, ClosedAt: new Date(Date.now() - 25 * HOUR_MS) });
            expect((await postShard(2)).status).toBe(410);
            expect(ledger.Shards.get(SESSION)?.has(2) ?? false).toBe(false);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
        });

        it('answers 400 to an index at or past the most shards a recording can assemble, storing nothing', async () => {
            // Live smoke C2: 2100 shards were accepted (and kept) into one session, then one at index 50000.
            expect((await postShard(MAX_ASSEMBLY_SHARDS)).status).toBe(400);
            expect(ledger.Shards.get(SESSION)?.size ?? 0).toBe(0);
        });

        it("answers 400 to a shard whose audio ends after more time than the session has existed", async () => {
            addSession(SESSION, { CreatedAt: new Date(Date.now() - 60_000) });
            // index 100 starts at 500 s of audio; the session is a minute old
            expect((await postShard(100)).status).toBe(400);
            expect(ledger.Shards.get(SESSION)?.size ?? 0).toBe(0);
            expect((await postShard(0)).status).toBe(200);
        });

        it('schedules now when the last missing shard of a closed Pending (grace-waiting) session arrives', async () => {
            addSession(SESSION, { RecordingStatus: 'Pending', RecordingExpectedShards: 2, RecordingCapturedSamples: 2 * SHARD_SAMPLES, ClosedAt: new Date(Date.now() - 60_000) });
            await postShard(1);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
            await postShard(0);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('while the call is still open, a shard that completes a Pending recording schedules after the grace, not now', async () => {
            // A hidden tab's terminal, then its keepalive re-sends: assembling mid-call on every tab switch
            // would rewrite recording.wav each time.
            addSession(SESSION, { RecordingStatus: 'Pending', RecordingExpectedShards: 2, RecordingCapturedSamples: 2 * SHARD_SAMPLES });
            await postShard(1);
            await postShard(0);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, GRACE_MS, true);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('while the call is still open, a late gap shard of a Partial recording re-assembles after the grace, not now', async () => {
            addSession(SESSION, { RecordingStatus: 'Partial', RecordingExpectedShards: 4, RecordingCapturedSamples: 4 * SHARD_SAMPLES });
            expect((await postShard(2)).status).toBe(200);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, GRACE_MS, true);
        });

        it('does not schedule an ordinary live-call shard', async () => {
            await postShard(0);
            await postShard(1);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
        });
    });

    describe('POST /:agentSessionId/end', () => {
        it('stamps expected = lastShardIndex + 1 and the captured samples, and schedules now when every shard is present', async () => {
            await postShard(0);
            await postShard(1);
            const res = await postEnd(1, 2 * SHARD_SAMPLES);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ accepted: true, ignored: false });
            expect(ledger.Sessions.get(SESSION)).toMatchObject({ RecordingExpectedShards: 2, RecordingCapturedSamples: 2 * SHARD_SAMPLES, RecordingStatus: 'Pending' });
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('records the tail like a shard before stamping', async () => {
            await postShard(0);
            const tail = shardBytes(1, 1, 48_000);
            const res = await postEnd(1, SHARD_SAMPLES + 48_000, tail);
            expect(res.status).toBe(200);
            expect(ledger.Shards.get(SESSION)?.get(1)).toMatchObject({ SampleCount: 48_000, Sha256: sha256(tail) });
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('applies the late-shard rule to a tail: a missing tail re-sent to a Partial recording closed under 24 h ago re-assembles now', async () => {
            addSession(SESSION, { RecordingStatus: 'Partial', RecordingExpectedShards: 4, RecordingCapturedSamples: 3 * SHARD_SAMPLES + 48_000, ClosedAt: new Date(Date.now() - HOUR_MS) });
            const res = await postEnd(3, 3 * SHARD_SAMPLES + 48_000, shardBytes(3, 1, 48_000));
            expect(res.status).toBe(200);
            expect(ledger.Shards.get(SESSION)?.has(3)).toBe(true);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('answers 410 to a terminal for a session closed over 24 h ago and stamps nothing', async () => {
            addSession(SESSION, { RecordingStatus: 'Partial', RecordingExpectedShards: 4, RecordingCapturedSamples: 3 * SHARD_SAMPLES + 48_000, ClosedAt: new Date(Date.now() - 25 * HOUR_MS) });
            expect((await postEnd(3, 3 * SHARD_SAMPLES + 48_000, shardBytes(3, 1, 48_000))).status).toBe(410);
            expect(ledger.Shards.get(SESSION)?.has(3) ?? false).toBe(false);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
        });

        it('answers 400 to a terminal claiming more audio than the session has existed, and stamps nothing', async () => {
            // Live smoke C1: one 5 s shard plus a 3 h claim made the server write a 1 GB recording.wav.
            addSession(SESSION, { CreatedAt: new Date(Date.now() - 60_000) });
            expect((await postShard(0)).status).toBe(200);
            expect((await postEnd(0, 518_400_000)).status).toBe(400);
            expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBeNull();
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
        });

        it('answers 400 to a terminal listing more shards than a recording can assemble', async () => {
            expect((await postEnd(MAX_ASSEMBLY_SHARDS, SHARD_SAMPLES)).status).toBe(400);
            expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBeNull();
        });

        it('without a system user still stamps the terminal and answers 200, leaving assembly to the janitor', async () => {
            deps.SystemUser = () => null;
            expect((await postShard(0)).status).toBe(200);
            const res = await postEnd(0, SHARD_SAMPLES);
            expect(res.status).toBe(200);
            expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBe(1);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
            expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('no system user'));
        });

        it('a non-final terminal (the tab was hidden) schedules after the grace even when every shard is present', async () => {
            await postShard(0);
            const res = await post(`/${SESSION}/end?lastShardIndex=0&capturedSamples=${SHARD_SAMPLES}&final=false`, null);
            expect(res.status).toBe(200);
            expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBe(1);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, GRACE_MS, true);
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalledWith(SESSION, 0, false);
        });

        it('rejects a final flag that is not true or false', async () => {
            const res = await post(`/${SESSION}/end?lastShardIndex=0&capturedSamples=${SHARD_SAMPLES}&final=maybe`, null);
            expect(res.status).toBe(400);
        });

        it('a final terminal with shards missing re-checks shortly (their keepalive re-sends follow it), not after the grace', async () => {
            // End then the tab closes: the close is never sent, and the shards still unacknowledged at End
            // land just after the terminal. A Deferred re-check arms the forced-Partial grace (scheduler).
            await postShard(0);
            await postEnd(2, 3 * SHARD_SAMPLES);
            expect(scheduler.ScheduleAssembly).toHaveBeenCalledWith(SESSION, FINAL_TERMINAL_RECHECK_MS, false);
            expect(FINAL_TERMINAL_RECHECK_MS).toBeLessThan(10_000);
        });

        it('treats a duplicate /end as idempotent', async () => {
            await postShard(0);
            expect((await postEnd(0, SHARD_SAMPLES)).status).toBe(200);
            const res = await postEnd(0, SHARD_SAMPLES);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ accepted: true, ignored: false });
            expect(ledger.Sessions.get(SESSION)).toMatchObject({ RecordingExpectedShards: 1, RecordingCapturedSamples: SHARD_SAMPLES });
        });

        it('ignores and logs a lower /end (stored vs received), still answering 200', async () => {
            await postShard(0);
            await postShard(1);
            await postEnd(1, 2 * SHARD_SAMPLES);
            scheduler.ScheduleAssembly.mockClear();
            const res = await postEnd(0, SHARD_SAMPLES);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ accepted: true, ignored: true });
            expect(ledger.Sessions.get(SESSION)).toMatchObject({ RecordingExpectedShards: 2, RecordingCapturedSamples: 2 * SHARD_SAMPLES });
            const logged = logStatusMock.mock.calls.map(call => String(call[0]));
            expect(logged.some(line => line.includes(SESSION) && line.includes(String(2 * SHARD_SAMPLES)) && line.includes(String(SHARD_SAMPLES)))).toBe(true);
        });

        it('accepts an empty recording (lastShardIndex -1, no samples, no tail) and does nothing else', async () => {
            const res = await postEnd(-1, 0);
            expect(res.status).toBe(200);
            expect(ledger.Sessions.get(SESSION)).toMatchObject({ RecordingStatus: null, RecordingExpectedShards: null });
            expect(scheduler.ScheduleAssembly).not.toHaveBeenCalled();
        });

        it('rejects bad terminal params, a tail whose index differs, and a conflicting tail', async () => {
            expect((await post(`/${SESSION}/end?lastShardIndex=-2&capturedSamples=0`, null)).status).toBe(400);
            expect((await post(`/${SESSION}/end?lastShardIndex=1&capturedSamples=-5`, null)).status).toBe(400);
            expect((await post(`/${SESSION}/end?lastShardIndex=abc&capturedSamples=0`, null)).status).toBe(400);
            expect((await post(`/${SESSION}/end?capturedSamples=0`, null)).status).toBe(400);
            expect((await postEnd(-1, 5)).status).toBe(400);
            // Expected shards (lastShardIndex + 1) must fit the INT column too.
            expect((await postEnd(2 ** 31 - 1, 0)).status).toBe(400);
            expect((await postEnd(2, 3 * SHARD_SAMPLES, shardBytes(1))).status).toBe(400);
            await postShard(1);
            expect((await postEnd(1, 2 * SHARD_SAMPLES, shardBytes(1, 9))).status).toBe(409);
            expect(ledger.Sessions.get(SESSION)?.RecordingExpectedShards).toBeNull();
        });

        it('answers 413 to a terminal body over 48 KiB, 403 to a non-owner and 404 to a missing session', async () => {
            expect((await postEnd(0, SHARD_SAMPLES, new Uint8Array(48 * 1024 + 1))).status).toBe(413);
            expect((await postEnd(0, SHARD_SAMPLES, null, STRANGER_ID)).status).toBe(403);
            expect((await post(`/${MISSING}/end?lastShardIndex=0&capturedSamples=1`, null)).status).toBe(404);
        });
    });

    describe('with the real scheduler', () => {
        let assemble: ReturnType<typeof vi.fn<(input: AssembleRealtimeRecordingInput) => Promise<AssembleRealtimeRecordingOutcome>>>;

        beforeEach(() => {
            assemble = vi.fn(async (input: AssembleRealtimeRecordingInput) => {
                await input.Ledger.FinishAssembly({ SessionID: input.SessionID, Version: input.Version, Status: 'Complete', Gaps: [], FileID: null });
                return 'Complete' as AssembleRealtimeRecordingOutcome;
            });
            RecordingAssemblyScheduler.Instance.Start({
                Provider: {} as unknown as DatabaseProviderBase,
                SystemUser: { ID: 'system' } as unknown as UserInfo,
                GraceMs: () => GRACE_MS,
                CreateLedger: () => ledger,
                Assemble: assemble,
            });
            deps.Scheduler = RecordingAssemblyScheduler.Instance;
        });

        afterEach(() => {
            RecordingAssemblyScheduler.Instance.Shutdown();
        });

        it('two concurrent /end calls assemble exactly once (the claim winner), after the responses', async () => {
            await postShard(0);
            await postShard(1);
            const [first, second] = await Promise.all([postEnd(1, 2 * SHARD_SAMPLES), postEnd(1, 2 * SHARD_SAMPLES)]);
            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            await vi.waitFor(() => expect(ledger.Sessions.get(SESSION)?.RecordingStatus).toBe('Complete'));
            // Give a second (losing) claim time to run, if one were scheduled.
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(assemble).toHaveBeenCalledTimes(1);
            expect(assemble.mock.calls[0][0]).toMatchObject({ SessionID: SESSION, ForcePartial: false });
        });

        it('never decodes inside the request: the response comes back before the assembly timer fires', async () => {
            const timers: Array<() => void> = [];
            RecordingAssemblyScheduler.Instance.Start({
                Provider: {} as unknown as DatabaseProviderBase,
                SystemUser: { ID: 'system' } as unknown as UserInfo,
                GraceMs: () => GRACE_MS,
                CreateLedger: () => ledger,
                Assemble: assemble,
                Clock: { Now: () => 0, StartTimer: callback => { timers.push(callback); return { Cancel: () => undefined }; } },
            });
            await postShard(0);
            const res = await postEnd(0, SHARD_SAMPLES);
            expect(res.status).toBe(200);
            expect(assemble).not.toHaveBeenCalled();
            expect(ledger.Sessions.get(SESSION)?.RecordingStatus).toBe('Pending');
            expect(timers).toHaveLength(1);

            timers[0]();
            await vi.waitFor(() => expect(assemble).toHaveBeenCalledTimes(1));
        });
    });
});
