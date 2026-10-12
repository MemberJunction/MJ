/**
 * @fileoverview REST routes the browser uses to upload a client-direct realtime call's recording as
 * `MJOPUS1` shards, and to send the terminal signal that says how many shards and samples the call
 * captured:
 *
 * - `POST /realtime/recording/:agentSessionId/shard/:index` — one shard as raw `application/octet-stream`.
 * - `POST /realtime/recording/:agentSessionId/end?lastShardIndex=&capturedSamples=` — the terminal signal,
 *   with the final partial shard (the tail) as an optional body. The browser sends it with `keepalive` on
 *   End, `pagehide` and `visibilitychange→hidden`, so it may arrive more than once, and late.
 *
 * Both run after the unified auth middleware and are owner-gated. A request does only cheap work: parse
 * the shard header and packet bounds, hash, one guarded ledger proc, maybe a count. It never decodes:
 * assembly runs off the request path through the {@link IRecordingAssemblyScheduler}.
 *
 * @module @memberjunction/server
 */
import { createHash } from 'node:crypto';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { DatabaseProviderBase, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import {
    ParseRecordingShard, RecordingShardFormatError, RecordingShardHeader, RECORDING_SHARD_MAX_BYTES, RECORDING_TERMINAL_MAX_BYTES,
} from '@memberjunction/ai-core-plus';
import type { IRealtimeRecordingLedger, RecordShardResult } from '@memberjunction/ai-agents';
import {
    LoadOwnedRealtimeSession, RealtimeSessionNotFoundError, RealtimeSessionOwnershipError,
} from '../realtimeSessions/ownedRealtimeSession.js';
import type { IRecordingAssemblyScheduler } from '../realtimeSessions/RecordingAssemblyScheduler.js';

/** Where {@link CreateRealtimeRecordingRouter} is mounted (under the reserved `/realtime` root). */
export const REALTIME_RECORDING_MOUNT_PATH = '/realtime/recording';

/**
 * How long after a session closed a late gap shard still triggers a re-assembly. Past it the shard is
 * stored but the recording is left as it is (the janitor purges the ledger after its lookback).
 */
const LATE_SHARD_REASSEMBLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const OCTET_STREAM = 'application/octet-stream';
const NON_NEGATIVE_INT = /^\d+$/;
const INT = /^-?\d+$/;

/** The authenticated caller of a recording request. */
export interface RealtimeRecordingCaller {
    ContextUser: UserInfo;
    /** The read-write provider the ledger writes through (the ledger needs a SQL-capable provider). */
    Provider: DatabaseProviderBase;
}

/** Dependencies of {@link CreateRealtimeRecordingRouter}; injectable so the routes can be tested without a database. */
export interface RealtimeRecordingRouterDeps {
    /** The authenticated caller, or null (answered 401). */
    ResolveCaller(req: Request): RealtimeRecordingCaller | null;
    LoadOwnedSession: typeof LoadOwnedRealtimeSession;
    /** The ledger for one request; `contextUser` is the caller (used for logging by the procs). */
    CreateLedger(provider: DatabaseProviderBase, contextUser: UserInfo): IRealtimeRecordingLedger;
    Scheduler: IRecordingAssemblyScheduler;
    /** Grace before an incomplete recording is assembled as `Partial`. */
    GraceMs: () => number;
}

/** A request failure with the HTTP status to answer. */
class RecordingRequestError extends Error {
    constructor(public readonly Status: number, message: string) {
        super(message);
        this.name = 'RecordingRequestError';
    }
}

/** What the pre-body middleware validated, handed to the handler through `res.locals`. */
interface RecordingRequestContext {
    SessionID: string;
    Caller: RealtimeRecordingCaller;
}

/**
 * Builds the router for the shard and terminal routes (see the file overview). Status codes: 200 on
 * success (`{ stored, duplicate }` / `{ accepted, ignored }`), 400 bad params or shard format, 401 no
 * caller, 403 not the owner, 404 no such session, 409 same shard index with different bytes, 413 body
 * over the cap, 500 unexpected (logged).
 */
export function CreateRealtimeRecordingRouter(deps: RealtimeRecordingRouterDeps): Router {
    const router = express.Router();

    router.post(
        '/:agentSessionId/shard/:index',
        validateBeforeBody(deps, RECORDING_SHARD_MAX_BYTES),
        express.raw({ type: OCTET_STREAM, limit: RECORDING_SHARD_MAX_BYTES }),
        (req, res) => respond(req, res, 'shard', () => handleShard(deps, req, res)),
    );
    router.post(
        '/:agentSessionId/end',
        validateBeforeBody(deps, RECORDING_TERMINAL_MAX_BYTES),
        express.raw({ type: OCTET_STREAM, limit: RECORDING_TERMINAL_MAX_BYTES }),
        (req, res) => respond(req, res, 'terminal', () => handleTerminal(deps, req, res)),
    );
    router.use(handleBodyError);
    return router;
}

/**
 * Rejects what can be rejected before reading the body: a malformed session id, no caller, or a declared
 * `Content-Length` over the cap (`express.raw` enforces the cap on the bytes actually streamed too).
 */
function validateBeforeBody(deps: RealtimeRecordingRouterDeps, maxBytes: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const sessionID = String(req.params['agentSessionId']);
        if (!IsValidUUID(sessionID)) {
            res.status(400).json({ error: 'agentSessionId must be a UUID' });
            return;
        }
        const caller = deps.ResolveCaller(req);
        if (!caller) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const declared = Number(req.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
            LogStatus(`RealtimeRecordingHandler: refused a ${declared}-byte body for session ${sessionID} (cap ${maxBytes})`);
            res.status(413).json({ error: `Body exceeds ${maxBytes} bytes` });
            return;
        }
        const context: RecordingRequestContext = { SessionID: sessionID, Caller: caller };
        res.locals['recording'] = context;
        next();
    };
}

/** Runs a handler, mapping its failures to status codes; unexpected ones are logged and answered 500. */
async function respond(req: Request, res: Response, kind: string, handler: () => Promise<void>): Promise<void> {
    try {
        await handler();
    } catch (error) {
        const sessionID = String(req.params['agentSessionId']);
        if (error instanceof RecordingRequestError) {
            res.status(error.Status).json({ error: error.message });
        } else if (error instanceof RealtimeSessionNotFoundError) {
            res.status(404).json({ error: 'Realtime session not found' });
        } else if (error instanceof RealtimeSessionOwnershipError) {
            res.status(403).json({ error: 'Not authorized for this realtime session' });
        } else {
            LogError(`RealtimeRecordingHandler: ${kind} request for session ${sessionID} failed: ${error instanceof Error ? error.message : String(error)}`);
            res.status(500).json({ error: 'Recording request failed' });
        }
    }
}

async function handleShard(deps: RealtimeRecordingRouterDeps, req: Request, res: Response): Promise<void> {
    const { SessionID, Caller } = res.locals['recording'] as RecordingRequestContext;
    const index = parseInteger(req.params['index'], 'shard index', NON_NEGATIVE_INT);
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!body || body.length === 0) {
        throw new RecordingRequestError(400, `The shard must be a non-empty ${OCTET_STREAM} body`);
    }
    const header = parseShard(body, SessionID);
    if (header.ShardIndex !== index) {
        throw new RecordingRequestError(400, `Shard header index ${header.ShardIndex} does not match the path index ${index}`);
    }

    await deps.LoadOwnedSession(SessionID, Caller.ContextUser, Caller.Provider);
    const ledger = deps.CreateLedger(Caller.Provider, Caller.ContextUser);
    const result = await recordShard(ledger, SessionID, header, body);
    if (result.Outcome === 'Inserted') {
        await scheduleAfterLateShard(deps, ledger, SessionID, index, result);
    }
    res.status(200).json({ stored: true, duplicate: result.Outcome === 'Duplicate' });
}

async function handleTerminal(deps: RealtimeRecordingRouterDeps, req: Request, res: Response): Promise<void> {
    const { SessionID, Caller } = res.locals['recording'] as RecordingRequestContext;
    const lastShardIndex = parseInteger(req.query['lastShardIndex'], 'lastShardIndex', INT);
    const capturedSamples = parseInteger(req.query['capturedSamples'], 'capturedSamples', NON_NEGATIVE_INT);
    if (lastShardIndex < -1) {
        throw new RecordingRequestError(400, `lastShardIndex must be -1 or more, got ${lastShardIndex}`);
    }
    if (lastShardIndex === -1 && capturedSamples !== 0) {
        throw new RecordingRequestError(400, `lastShardIndex -1 (no shards) contradicts capturedSamples ${capturedSamples}`);
    }
    const tail = readOptionalTail(req, SessionID, lastShardIndex);

    const session = await deps.LoadOwnedSession(SessionID, Caller.ContextUser, Caller.Provider);
    const ledger = deps.CreateLedger(Caller.Provider, Caller.ContextUser);
    if (tail) {
        await recordShard(ledger, SessionID, tail.Header, tail.Bytes);
    }
    if (lastShardIndex === -1) {
        // The call captured nothing: there is no recording to stamp or assemble.
        res.status(200).json({ accepted: true, ignored: false });
        return;
    }

    const expected = lastShardIndex + 1;
    const stamp = await ledger.StampTerminal(SessionID, expected, capturedSamples);
    if (stamp.Outcome === 'Ignored') {
        logIgnoredTerminal(session, expected, capturedSamples, stamp.RecordingStatus);
        res.status(200).json({ accepted: true, ignored: true });
        return;
    }
    LogStatus(`RealtimeRecordingHandler: terminal for session ${SessionID}: ${expected} shards, ${capturedSamples} samples; recording ${stamp.RecordingStatus ?? 'not recorded'}`);
    if (stamp.RecordingStatus === 'Pending') {
        await scheduleWhenReady(deps, ledger, SessionID, expected);
    }
    res.status(200).json({ accepted: true, ignored: false });
}

/** The tail shard of a terminal request, or null for an empty body. */
function readOptionalTail(req: Request, sessionID: string, lastShardIndex: number): { Header: RecordingShardHeader; Bytes: Buffer } | null {
    if (!Buffer.isBuffer(req.body)) {
        // express.raw leaves the body unset for an empty body or a non-octet-stream content type; only the former is a valid "no tail".
        if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined) {
            throw new RecordingRequestError(400, `The tail must be an ${OCTET_STREAM} body`);
        }
        return null;
    }
    if (req.body.length === 0) {
        return null;
    }
    const header = parseShard(req.body, sessionID);
    if (header.ShardIndex !== lastShardIndex) {
        throw new RecordingRequestError(400, `Tail shard index ${header.ShardIndex} does not match lastShardIndex ${lastShardIndex}`);
    }
    return { Header: header, Bytes: req.body };
}

/** Validates the MJOPUS1 structure (header and packet bounds; no decoding). */
function parseShard(bytes: Buffer, sessionID: string): RecordingShardHeader {
    try {
        const { ShardIndex, StartSample, SampleCount, PacketCount } = ParseRecordingShard(bytes);
        return { ShardIndex, StartSample, SampleCount, PacketCount };
    } catch (error) {
        if (error instanceof RecordingShardFormatError) {
            LogStatus(`RealtimeRecordingHandler: malformed shard for session ${sessionID}: ${error.message}`);
            throw new RecordingRequestError(400, `Malformed recording shard: ${error.message}`);
        }
        throw error;
    }
}

/** Records one shard; a conflict (same index, different bytes) is logged and answered 409. */
async function recordShard(ledger: IRealtimeRecordingLedger, sessionID: string, header: RecordingShardHeader, bytes: Buffer): Promise<RecordShardResult> {
    const result = await ledger.RecordShard({
        SessionID: sessionID,
        Index: header.ShardIndex,
        StartSample: header.StartSample,
        SampleCount: header.SampleCount,
        Data: bytes,
        Sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    if (result.Outcome === 'Conflict') {
        LogError(
            `RealtimeRecordingHandler: session ${sessionID} sent shard ${header.ShardIndex} again with different bytes; ` +
            `the recording is marked Failed for review`,
        );
        throw new RecordingRequestError(409, `Shard ${header.ShardIndex} was already stored with different bytes`);
    }
    return result;
}

/**
 * After a newly inserted shard below the expected count (one that arrived after the terminal signal):
 * - on a `Partial` recording, re-assemble now, unless the session closed more than 24 h ago;
 * - on a `Pending` recording waiting out its grace, assemble now if this was the last missing shard,
 *   instead of waiting for the grace timer.
 * Shards at or past the expected count need nothing here: the ledger re-opens the recording (`Pending`)
 * and a terminal signal or the janitor follows.
 */
async function scheduleAfterLateShard(
    deps: RealtimeRecordingRouterDeps,
    ledger: IRealtimeRecordingLedger,
    sessionID: string,
    index: number,
    result: RecordShardResult,
): Promise<void> {
    const expected = result.ExpectedShards;
    if (expected === null || index >= expected) {
        return;
    }
    if (result.RecordingStatus === 'Partial') {
        if (result.ClosedAt && Date.now() - result.ClosedAt.getTime() > LATE_SHARD_REASSEMBLY_WINDOW_MS) {
            LogStatus(`RealtimeRecordingHandler: late shard ${index} of session ${sessionID} stored; the session closed over 24 h ago, so the Partial recording is not re-assembled`);
            return;
        }
        deps.Scheduler.ScheduleAssembly(sessionID, 0, false);
        return;
    }
    if (result.RecordingStatus === 'Pending') {
        await scheduleWhenReady(deps, ledger, sessionID, expected, false);
    }
}

/**
 * Schedules a `Pending` recording: now when every expected shard is stored, otherwise (unless
 * `graceWhenIncomplete` is false) a forced-`Partial` assembly after the grace period.
 */
async function scheduleWhenReady(
    deps: RealtimeRecordingRouterDeps,
    ledger: IRealtimeRecordingLedger,
    sessionID: string,
    expected: number,
    graceWhenIncomplete = true,
): Promise<void> {
    const present = await ledger.CountShardsBelow(sessionID, expected);
    if (present === expected) {
        deps.Scheduler.ScheduleAssembly(sessionID, 0, false);
    } else if (graceWhenIncomplete) {
        deps.Scheduler.ScheduleAssembly(sessionID, deps.GraceMs(), true);
    }
}

function logIgnoredTerminal(session: MJAIAgentSessionEntity, expected: number, captured: number, status: string | null): void {
    LogStatus(
        `RealtimeRecordingHandler: ignored a lower terminal for session ${session.ID}: received ${expected} shards / ${captured} samples, ` +
        `stored ${session.RecordingExpectedShards ?? 'none'} shards / ${session.RecordingCapturedSamples ?? 'none'} samples (recording ${status ?? 'not recorded'})`,
    );
}

/** Parses a non-negative (or, with {@link INT}, signed) safe integer route or query value; 400 otherwise. */
function parseInteger(value: unknown, field: string, pattern: RegExp): number {
    if (typeof value !== 'string' || !pattern.test(value)) {
        throw new RecordingRequestError(400, `${field} must be an integer, got '${String(value ?? '')}'`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new RecordingRequestError(400, `${field} is out of range`);
    }
    return parsed;
}

/**
 * Error middleware for failures raised before a handler runs, which are body-parsing failures: 413 for an
 * over-cap body, 400 for any other client-side body error, 500 (logged) otherwise.
 */
function handleBodyError(error: unknown, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(error);
        return;
    }
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 413) {
        LogStatus(`RealtimeRecordingHandler: ${req.originalUrl} body over the cap: ${message}`);
        res.status(413).json({ error: 'Body too large' });
    } else if (status >= 400 && status < 500) {
        LogStatus(`RealtimeRecordingHandler: ${req.originalUrl} body could not be read: ${message}`);
        res.status(400).json({ error: 'Body could not be read' });
    } else {
        LogError(`RealtimeRecordingHandler: ${req.originalUrl} failed before its handler: ${message}`);
        res.status(500).json({ error: 'Recording request failed' });
    }
}
