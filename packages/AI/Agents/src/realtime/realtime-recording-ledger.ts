/**
 * @fileoverview The server-side ledger of a client-direct realtime recording: the `MJOPUS1` shards the
 * browser uploads (`AIAgentSessionRecordingShard`) and the assembly state on `AIAgentSession`
 * (`RecordingStatus`, expected shards, captured samples, gaps, assembly version).
 *
 * Every write goes through a guarded stored procedure (migration
 * `V202610122000__v6.2.x__Realtime_Recording_Shard_Ledger.sql`): each needs one conditional statement
 * whose outcome is the arbitration signal (insert-if-absent, monotonic terminal stamp, atomic claim,
 * version-fenced finish), which `BaseEntity.Save` cannot express. Reads use `RunView` with `BypassCache`:
 * the procs change the rows without raising entity events, so a cached read would never be invalidated
 * (a re-assembly in the same process would see the first assembly's rows and miss a late shard).
 *
 * {@link IRealtimeRecordingLedger} is the seam the assembly and the REST routes depend on, so they can be
 * tested against an in-memory ledger.
 *
 * @module @memberjunction/ai-agents
 */
import { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { Base64ToBytes, IsValidUUID } from '@memberjunction/global';
import { RECORDING_SHARD_MAX_BYTES } from '@memberjunction/ai-core-plus';
import type { RecordingGap } from './realtime-recording-opus-assembly';

/** What happened to an uploaded shard. `Duplicate` is a retry of identical bytes; `Conflict` is the same index with different bytes. */
export type RecordShardOutcome = 'Inserted' | 'Duplicate' | 'Conflict';

/** Result of {@link IRealtimeRecordingLedger.RecordShard}: the outcome plus the session's state after the write. */
export interface RecordShardResult {
    Outcome: RecordShardOutcome;
    RecordingStatus: string | null;
    ExpectedShards: number | null;
    ClosedAt: Date | null;
}

/** Input to {@link IRealtimeRecordingLedger.RecordShard}. */
export interface RecordShardInput {
    SessionID: string;
    Index: number;
    StartSample: number;
    SampleCount: number;
    /** The raw `MJOPUS1` shard bytes. */
    Data: Buffer;
    /** Lowercase hex SHA-256 of `Data`; decides retry (same hash) vs conflict. */
    Sha256: string;
}

/** Status an assembly finishes with. `Pending` hands an un-forced, incomplete claim back without a file. */
export type FinishAssemblyStatus = 'Complete' | 'Partial' | 'Failed' | 'Pending';

/** Input to {@link IRealtimeRecordingLedger.FinishAssembly}. */
export interface FinishAssemblyInput {
    SessionID: string;
    /** The version {@link IRealtimeRecordingLedger.ClaimAssembly} returned; the finish is fenced on it. */
    Version: number;
    Status: FinishAssemblyStatus;
    /**
     * The gaps to store. An array is serialized to JSON; a string (already-serialized JSON) or null is
     * stored verbatim, which is how a `Pending` hand-back keeps the gaps of the recording already stored.
     */
    Gaps: RecordingGap[] | string | null;
    /** The assembled `MJ: Files` id to stamp, or null to leave the session's file unchanged. */
    FileID: string | null;
}

/** A stored shard's position, without its bytes. */
export interface LedgerShardMetadata {
    Index: number;
    StartSample: number;
    SampleCount: number;
}

/** One stored shard as read back for assembly. */
export interface LedgerShard extends LedgerShardMetadata {
    /** The raw `MJOPUS1` bytes. */
    Data: Uint8Array;
}

/** The recording ledger: guarded writes and the reads assembly needs. */
export interface IRealtimeRecordingLedger {
    /** Inserts a shard if its index is absent (see {@link RecordShardOutcome}). */
    RecordShard(input: RecordShardInput): Promise<RecordShardResult>;
    /** Stamps the terminal signal's counts; a lower terminal than the stored one is `Ignored`. */
    StampTerminal(sessionID: string, expectedShards: number, capturedSamples: number): Promise<{ Outcome: 'Stamped' | 'Ignored'; RecordingStatus: string | null }>;
    /**
     * Atomically claims assembly (from Pending/Partial, or from an Assembling claim last touched before
     * `staleBefore`). Returns the new assembly version, or null when another caller holds it.
     */
    ClaimAssembly(sessionID: string, staleBefore: Date | null): Promise<number | null>;
    /** Finishes an assembly, fenced on its version. Returns false when a newer claim superseded it. */
    FinishAssembly(input: FinishAssemblyInput): Promise<boolean>;
    /**
     * Stores `gaps` as the session's `RecordingGaps` while keeping the claim (`Assembling`), fenced on
     * `version` like {@link FinishAssembly}. Called just before an assembly overwrites `recording.wav`, so
     * the stored gaps cover every silent range of the object even when the finish never happens.
     * Returns false when a newer claim superseded this one.
     */
    StampAssemblyGaps(sessionID: string, version: number, gaps: RecordingGap[]): Promise<boolean>;
    /** Every stored shard of the session, in index order. */
    LoadShards(sessionID: string): Promise<LedgerShard[]>;
    /** Every stored shard's position, in index order, without the bytes (cheap pre-checks). */
    LoadShardMetadata(sessionID: string): Promise<LedgerShardMetadata[]>;
    /** Number of stored shards with an index below `indexBelow`. */
    CountShardsBelow(sessionID: string, indexBelow: number): Promise<number>;
    /** Deletes shards with an index below `indexBelow` (the ones a Complete recording holds). Returns rows deleted. */
    DeleteShardsBelow(sessionID: string, indexBelow: number): Promise<number>;
    /** Deletes up to `maxRows` shards of sessions closed before `closedBefore`. Returns rows deleted. */
    PurgeClosedBefore(closedBefore: Date, maxRows: number): Promise<number>;
}

const SHARD_ENTITY = 'MJ: AI Agent Session Recording Shards';
const SP_RECORD_SHARD = 'spRecordAIAgentSessionRecordingShard';
const SP_STAMP_TERMINAL = 'spStampAIAgentSessionRecordingTerminal';
const SP_CLAIM = 'spClaimAIAgentSessionRecordingAssembly';
const SP_FINISH = 'spFinishAIAgentSessionRecordingAssembly';
const SP_DELETE = 'spDeleteAIAgentSessionRecordingShards';
const SP_PURGE = 'spPurgeAIAgentSessionRecordingShards';

const RECORD_OUTCOMES: readonly RecordShardOutcome[] = ['Inserted', 'Duplicate', 'Conflict'];
const TERMINAL_OUTCOMES: readonly ('Stamped' | 'Ignored')[] = ['Stamped', 'Ignored'];

interface RecordShardRow { Outcome: string; RecordingStatus: string | null; RecordingExpectedShards: number | null; ClosedAt: Date | string | null }
interface TerminalRow { Outcome: string; RecordingStatus: string | null }
interface ClaimRow { RecordingAssemblyVersion: number }
interface AffectedRow { AffectedRows: number }
interface ShardMetadataRow { Index: number; StartSample: number | string; SampleCount: number }
interface ShardViewRow extends ShardMetadataRow { Data: string }

/** StartSample is a BIGINT, which some drivers return as a string. */
function toMetadata(row: ShardMetadataRow): LedgerShardMetadata {
    return { Index: row.Index, StartSample: Number(row.StartSample), SampleCount: row.SampleCount };
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * {@link IRealtimeRecordingLedger} over a server-side database provider. Proc calls are built with the
 * provider's dialect (`ProcedureCallSyntax` + positional placeholders) and bound as parameters, never
 * interpolated. Every method validates its inputs first and throws on a SQL failure or a malformed
 * result, with the proc and session in the message.
 */
export class SqlRealtimeRecordingLedger implements IRealtimeRecordingLedger {
    constructor(private readonly provider: DatabaseProviderBase, private readonly contextUser: UserInfo) {}

    public async RecordShard(input: RecordShardInput): Promise<RecordShardResult> {
        const { SessionID, Index, StartSample, SampleCount, Data, Sha256 } = input;
        assertSessionID(SessionID);
        assertNonNegativeInteger(Index, 'shard index');
        assertNonNegativeInteger(StartSample, 'start sample');
        assertNonNegativeInteger(SampleCount, 'sample count');
        if (Data.length === 0 || Data.length > RECORDING_SHARD_MAX_BYTES) {
            throw new Error(`recording ledger: shard ${Index} of session ${SessionID} is ${Data.length} bytes; it must be 1..${RECORDING_SHARD_MAX_BYTES}`);
        }
        // The proc compares hashes as strings, so a differently-cased or malformed hash would turn a retry into a Conflict.
        if (!SHA256_HEX.test(Sha256)) {
            throw new Error(`recording ledger: shard ${Index} of session ${SessionID} has an invalid Sha256 (expected 64 lowercase hex characters)`);
        }
        const row = await this.callForOneRow<RecordShardRow>(
            SP_RECORD_SHARD, SessionID, [SessionID, Index, StartSample, SampleCount, Data.length, Sha256, Data]);
        if (!RECORD_OUTCOMES.includes(row.Outcome as RecordShardOutcome)) {
            throw new Error(`${SP_RECORD_SHARD} returned unknown outcome '${row.Outcome}' for session ${SessionID}, shard ${Index}`);
        }
        return {
            Outcome: row.Outcome as RecordShardOutcome,
            RecordingStatus: row.RecordingStatus ?? null,
            ExpectedShards: row.RecordingExpectedShards ?? null,
            ClosedAt: toDateOrNull(row.ClosedAt),
        };
    }

    public async StampTerminal(sessionID: string, expectedShards: number, capturedSamples: number): Promise<{ Outcome: 'Stamped' | 'Ignored'; RecordingStatus: string | null }> {
        assertSessionID(sessionID);
        assertNonNegativeInteger(expectedShards, 'expected shards');
        assertNonNegativeInteger(capturedSamples, 'captured samples');
        const row = await this.callForOneRow<TerminalRow>(SP_STAMP_TERMINAL, sessionID, [sessionID, expectedShards, capturedSamples]);
        const outcome = row.Outcome as 'Stamped' | 'Ignored';
        if (!TERMINAL_OUTCOMES.includes(outcome)) {
            throw new Error(`${SP_STAMP_TERMINAL} returned unknown outcome '${row.Outcome}' for session ${sessionID}`);
        }
        return { Outcome: outcome, RecordingStatus: row.RecordingStatus ?? null };
    }

    public async ClaimAssembly(sessionID: string, staleBefore: Date | null): Promise<number | null> {
        assertSessionID(sessionID);
        const rows = await this.call<ClaimRow>(SP_CLAIM, sessionID, [sessionID, staleBefore]);
        if (rows.length === 0) {
            return null;
        }
        const version = rows[0].RecordingAssemblyVersion;
        if (!Number.isInteger(version)) {
            throw new Error(`${SP_CLAIM} returned a non-integer version '${String(version)}' for session ${sessionID}`);
        }
        return version;
    }

    public async FinishAssembly(input: FinishAssemblyInput): Promise<boolean> {
        const { SessionID, Version, Status, Gaps, FileID } = input;
        assertSessionID(SessionID);
        assertNonNegativeInteger(Version, 'assembly version');
        const gaps = Array.isArray(Gaps) ? JSON.stringify(Gaps) : Gaps;
        const affected = await this.callForAffectedRows(SP_FINISH, SessionID, [SessionID, Version, Status, gaps, FileID]);
        return affected > 0;
    }

    public async StampAssemblyGaps(sessionID: string, version: number, gaps: RecordingGap[]): Promise<boolean> {
        assertSessionID(sessionID);
        assertNonNegativeInteger(version, 'assembly version');
        // The finish proc with the claim's own status: it writes the gaps, keeps `Assembling`, leaves the
        // file id alone (null), and is fenced on the version and the Assembling status.
        const affected = await this.callForAffectedRows(SP_FINISH, sessionID, [sessionID, version, 'Assembling', JSON.stringify(gaps), null]);
        return affected > 0;
    }

    public async LoadShards(sessionID: string): Promise<LedgerShard[]> {
        // Naming the binary Data field makes the provider include it (as base64).
        const rows = await this.readShardRows<ShardViewRow>(sessionID, ['Index', 'StartSample', 'SampleCount', 'Data'], 'LoadShards');
        return rows.map(row => ({ ...toMetadata(row), Data: Base64ToBytes(row.Data) }));
    }

    public async LoadShardMetadata(sessionID: string): Promise<LedgerShardMetadata[]> {
        const rows = await this.readShardRows<ShardMetadataRow>(sessionID, ['Index', 'StartSample', 'SampleCount'], 'LoadShardMetadata');
        return rows.map(toMetadata);
    }

    private async readShardRows<T>(sessionID: string, fields: string[], operation: string): Promise<T[]> {
        assertSessionID(sessionID);
        const result = await this.provider.RunView<T>({
            EntityName: SHARD_ENTITY,
            ExtraFilter: `AgentSessionID='${sessionID}'`,
            OrderBy: this.provider.Dialect.QuoteIdentifier('Index'),
            Fields: fields,
            ResultType: 'simple',
            BypassCache: true,
        }, this.contextUser);
        if (!result.Success) {
            throw new Error(`${operation} failed for session ${sessionID}: ${result.ErrorMessage ?? 'unknown error'}`);
        }
        return result.Results;
    }

    public async CountShardsBelow(sessionID: string, indexBelow: number): Promise<number> {
        assertSessionID(sessionID);
        // Validated as an integer because it is interpolated into the filter.
        assertNonNegativeInteger(indexBelow, 'index bound');
        const quotedIndex = this.provider.Dialect.QuoteIdentifier('Index');
        const result = await this.provider.RunView({
            EntityName: SHARD_ENTITY,
            ExtraFilter: `AgentSessionID='${sessionID}' AND ${quotedIndex} < ${indexBelow}`,
            ResultType: 'count_only',
            BypassCache: true,
        }, this.contextUser);
        if (!result.Success) {
            throw new Error(`CountShardsBelow failed for session ${sessionID}: ${result.ErrorMessage ?? 'unknown error'}`);
        }
        return result.TotalRowCount;
    }

    public async DeleteShardsBelow(sessionID: string, indexBelow: number): Promise<number> {
        assertSessionID(sessionID);
        assertNonNegativeInteger(indexBelow, 'index bound');
        return this.callForAffectedRows(SP_DELETE, sessionID, [sessionID, indexBelow]);
    }

    public async PurgeClosedBefore(closedBefore: Date, maxRows: number): Promise<number> {
        if (!(closedBefore instanceof Date) || Number.isNaN(closedBefore.getTime())) {
            throw new Error('PurgeClosedBefore: closedBefore must be a valid Date');
        }
        if (!Number.isInteger(maxRows) || maxRows <= 0) {
            throw new Error(`PurgeClosedBefore: maxRows must be a positive integer, got ${maxRows}`);
        }
        return this.callForAffectedRows(SP_PURGE, `(purge before ${closedBefore.toISOString()})`, [closedBefore, maxRows]);
    }

    /** Runs a proc with positional parameters; wraps any failure with the proc and the session it was for. */
    private async call<T>(proc: string, sessionLabel: string, params: unknown[]): Promise<T[]> {
        const d = this.provider.Dialect;
        const placeholders = params.map((_, i) => d.ParameterPlaceholder(i));
        const sql = d.ProcedureCallSyntax(this.provider.MJCoreSchemaName, proc, placeholders) + ';';
        try {
            const rows = await this.provider.ExecuteSQL<T>(sql, params, { isMutation: true, description: `${proc} (session ${sessionLabel})` }, this.contextUser);
            return Array.isArray(rows) ? rows : [];
        } catch (error) {
            throw new Error(`${proc} failed for session ${sessionLabel}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }

    private async callForOneRow<T>(proc: string, sessionLabel: string, params: unknown[]): Promise<T> {
        const rows = await this.call<T>(proc, sessionLabel, params);
        if (rows.length === 0) {
            throw new Error(`${proc} returned no row for session ${sessionLabel}`);
        }
        return rows[0];
    }

    private async callForAffectedRows(proc: string, sessionLabel: string, params: unknown[]): Promise<number> {
        const rows = await this.call<AffectedRow>(proc, sessionLabel, params);
        const affected = rows[0]?.AffectedRows;
        if (typeof affected !== 'number') {
            throw new Error(`${proc} returned no AffectedRows for session ${sessionLabel}`);
        }
        return affected;
    }
}

function assertSessionID(sessionID: string): void {
    if (!IsValidUUID(sessionID)) {
        throw new Error(`recording ledger: invalid session id '${sessionID}'`);
    }
}

function assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`recording ledger: ${field} must be a non-negative integer, got ${value}`);
    }
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) {
        return null;
    }
    return value instanceof Date ? value : new Date(value);
}
