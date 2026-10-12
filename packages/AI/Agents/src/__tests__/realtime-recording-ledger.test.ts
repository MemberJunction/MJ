/**
 * `SqlRealtimeRecordingLedger` against a fake provider that captures every `ExecuteSQL` / `RunView`
 * call: the right proc, positional placeholders in the proc's parameter order, the parameter values,
 * and the mapping of each proc's one-row result.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseProviderBase, UserInfo, RunViewParams } from '@memberjunction/core';
import { SqlRealtimeRecordingLedger } from '../realtime/realtime-recording-ledger';

const SESSION = '0B5E1C2D-3F4A-4B5C-8D6E-7F8091A2B3C4';
const user = {} as UserInfo;

interface SqlCall { Sql: string; Params: unknown[] | undefined; IsMutation: boolean | undefined }

class FakeProvider {
    public readonly SqlCalls: SqlCall[] = [];
    public readonly ViewCalls: RunViewParams[] = [];
    public NextRows: unknown[] = [];
    public NextViewResult: { Success: boolean; Results: unknown[]; TotalRowCount: number; ErrorMessage?: string } =
        { Success: true, Results: [], TotalRowCount: 0 };
    public readonly MJCoreSchemaName = '__mj';
    public readonly Dialect = {
        ProcedureCallSyntax: (schema: string, name: string, params: string[]): string => `EXEC [${schema}].[${name}] ${params.join(', ')}`,
        ParameterPlaceholder: (index: number): string => `@p${index}`,
        QuoteIdentifier: (name: string): string => `[${name}]`,
    };
    public async ExecuteSQL<T>(sql: string, params?: unknown[], options?: { isMutation?: boolean }): Promise<T[]> {
        this.SqlCalls.push({ Sql: sql, Params: params, IsMutation: options?.isMutation });
        return this.NextRows as T[];
    }
    public async RunView(params: RunViewParams): Promise<unknown> {
        this.ViewCalls.push(params);
        return this.NextViewResult;
    }
}

let provider: FakeProvider;
let ledger: SqlRealtimeRecordingLedger;

beforeEach(() => {
    provider = new FakeProvider();
    ledger = new SqlRealtimeRecordingLedger(provider as unknown as DatabaseProviderBase, user);
});

function lastCall(): SqlCall {
    return provider.SqlCalls[provider.SqlCalls.length - 1];
}

describe('SqlRealtimeRecordingLedger procs', () => {
    it('RecordShard calls spRecordAIAgentSessionRecordingShard with 7 placeholders in proc order and maps the row', async () => {
        const closed = new Date('2026-10-12T10:00:00Z');
        provider.NextRows = [{ Outcome: 'Inserted', RecordingStatus: 'Pending', RecordingExpectedShards: null, ClosedAt: closed }];
        const data = Buffer.from([1, 2, 3, 4]);
        const result = await ledger.RecordShard({ SessionID: SESSION, Index: 3, StartSample: 720000, SampleCount: 240000, Data: data, Sha256: 'ab'.repeat(32) });

        expect(lastCall().Sql).toBe('EXEC [__mj].[spRecordAIAgentSessionRecordingShard] @p0, @p1, @p2, @p3, @p4, @p5, @p6;');
        expect(lastCall().Params).toEqual([SESSION, 3, 720000, 240000, 4, 'ab'.repeat(32), data]);
        expect(lastCall().IsMutation).toBe(true);
        expect(result).toEqual({ Outcome: 'Inserted', RecordingStatus: 'Pending', ExpectedShards: null, ClosedAt: closed });
    });

    it('RecordShard converts a string ClosedAt to a Date and rejects an unknown outcome', async () => {
        provider.NextRows = [{ Outcome: 'Duplicate', RecordingStatus: 'Complete', RecordingExpectedShards: 4, ClosedAt: '2026-10-12T10:00:00Z' }];
        const ok = await ledger.RecordShard({ SessionID: SESSION, Index: 0, StartSample: 0, SampleCount: 960, Data: Buffer.from([9]), Sha256: 'cd'.repeat(32) });
        expect(ok.ClosedAt).toEqual(new Date('2026-10-12T10:00:00Z'));
        expect(ok.ExpectedShards).toBe(4);

        provider.NextRows = [{ Outcome: 'Weird', RecordingStatus: null, RecordingExpectedShards: null, ClosedAt: null }];
        await expect(ledger.RecordShard({ SessionID: SESSION, Index: 0, StartSample: 0, SampleCount: 960, Data: Buffer.from([9]), Sha256: 'cd'.repeat(32) }))
            .rejects.toThrow(/Weird/);
    });

    it('RecordShard refuses a bad session id or a negative index before touching SQL', async () => {
        await expect(ledger.RecordShard({ SessionID: 'nope', Index: 0, StartSample: 0, SampleCount: 0, Data: Buffer.alloc(1), Sha256: 'x' }))
            .rejects.toThrow(/session id/i);
        await expect(ledger.RecordShard({ SessionID: SESSION, Index: -1, StartSample: 0, SampleCount: 0, Data: Buffer.alloc(1), Sha256: 'x' }))
            .rejects.toThrow(/index/i);
        expect(provider.SqlCalls).toHaveLength(0);
    });

    it('StampTerminal calls spStampAIAgentSessionRecordingTerminal(session, expected, captured)', async () => {
        provider.NextRows = [{ Outcome: 'Ignored', RecordingStatus: 'Complete' }];
        const result = await ledger.StampTerminal(SESSION, 12, 2_800_000);
        expect(lastCall().Sql).toBe('EXEC [__mj].[spStampAIAgentSessionRecordingTerminal] @p0, @p1, @p2;');
        expect(lastCall().Params).toEqual([SESSION, 12, 2_800_000]);
        expect(result).toEqual({ Outcome: 'Ignored', RecordingStatus: 'Complete' });
    });

    it('ClaimAssembly returns the new version, or null when the claim was lost (no row)', async () => {
        const stale = new Date('2026-10-12T09:00:00Z');
        provider.NextRows = [{ RecordingAssemblyVersion: 7 }];
        expect(await ledger.ClaimAssembly(SESSION, stale)).toBe(7);
        expect(lastCall().Sql).toBe('EXEC [__mj].[spClaimAIAgentSessionRecordingAssembly] @p0, @p1;');
        expect(lastCall().Params).toEqual([SESSION, stale]);

        provider.NextRows = [];
        expect(await ledger.ClaimAssembly(SESSION, null)).toBeNull();
        expect(lastCall().Params).toEqual([SESSION, null]);
    });

    it('FinishAssembly passes the gaps as JSON and reports whether the fence held', async () => {
        provider.NextRows = [{ AffectedRows: 1 }];
        const gaps = [{ startSample: 240000, sampleCount: 240000, indexes: [1] }];
        expect(await ledger.FinishAssembly({ SessionID: SESSION, Version: 3, Status: 'Partial', Gaps: gaps, FileID: 'F1' })).toBe(true);
        expect(lastCall().Sql).toBe('EXEC [__mj].[spFinishAIAgentSessionRecordingAssembly] @p0, @p1, @p2, @p3, @p4;');
        expect(lastCall().Params).toEqual([SESSION, 3, 'Partial', JSON.stringify(gaps), 'F1']);

        provider.NextRows = [{ AffectedRows: 0 }];
        expect(await ledger.FinishAssembly({ SessionID: SESSION, Version: 2, Status: 'Pending', Gaps: [], FileID: null })).toBe(false);
        expect(lastCall().Params).toEqual([SESSION, 2, 'Pending', '[]', null]);
    });

    it('DeleteShardsBelow and PurgeClosedBefore return AffectedRows', async () => {
        provider.NextRows = [{ AffectedRows: 5 }];
        expect(await ledger.DeleteShardsBelow(SESSION, 5)).toBe(5);
        expect(lastCall().Sql).toBe('EXEC [__mj].[spDeleteAIAgentSessionRecordingShards] @p0, @p1;');
        expect(lastCall().Params).toEqual([SESSION, 5]);

        const cutoff = new Date('2026-10-01T00:00:00Z');
        provider.NextRows = [{ AffectedRows: 40 }];
        expect(await ledger.PurgeClosedBefore(cutoff, 500)).toBe(40);
        expect(lastCall().Sql).toBe('EXEC [__mj].[spPurgeAIAgentSessionRecordingShards] @p0, @p1;');
        expect(lastCall().Params).toEqual([cutoff, 500]);
    });

    it('wraps a SQL failure with the proc and session in the message', async () => {
        provider.ExecuteSQL = async () => { throw new Error('deadlock victim'); };
        await expect(ledger.DeleteShardsBelow(SESSION, 1)).rejects.toThrow(/spDeleteAIAgentSessionRecordingShards.*0B5E1C2D.*deadlock victim/);
    });

    it('throws when a proc that must return a row returns none', async () => {
        provider.NextRows = [];
        await expect(ledger.FinishAssembly({ SessionID: SESSION, Version: 1, Status: 'Failed', Gaps: [], FileID: null })).rejects.toThrow(/AffectedRows/);
    });
});

describe('SqlRealtimeRecordingLedger reads', () => {
    it('LoadShards reads the shard entity in index order with Data, decoding base64', async () => {
        provider.NextViewResult = {
            Success: true, TotalRowCount: 2,
            Results: [
                { Index: 0, StartSample: 0, SampleCount: 960, Data: Buffer.from([1, 2, 3]).toString('base64') },
                { Index: 1, StartSample: 960, SampleCount: 480, Data: Buffer.from([4]).toString('base64') },
            ],
        };
        const shards = await ledger.LoadShards(SESSION);
        const call = provider.ViewCalls[0];
        expect(call.EntityName).toBe('MJ: AI Agent Session Recording Shards');
        expect(call.ExtraFilter).toBe(`AgentSessionID='${SESSION}'`);
        expect(call.OrderBy).toBe('[Index]');
        expect(call.Fields).toEqual(['Index', 'StartSample', 'SampleCount', 'Data']);
        expect(call.ResultType).toBe('simple');
        expect(shards.map(s => [s.Index, s.StartSample, s.SampleCount, [...s.Data]])).toEqual([
            [0, 0, 960, [1, 2, 3]], [1, 960, 480, [4]],
        ]);
    });

    it('LoadShards throws with the view error when RunView fails', async () => {
        provider.NextViewResult = { Success: false, Results: [], TotalRowCount: 0, ErrorMessage: 'view broke' };
        await expect(ledger.LoadShards(SESSION)).rejects.toThrow(/view broke/);
    });

    it('CountShardsBelow uses a count-only view filtered by index', async () => {
        provider.NextViewResult = { Success: true, Results: [], TotalRowCount: 4 };
        expect(await ledger.CountShardsBelow(SESSION, 6)).toBe(4);
        const call = provider.ViewCalls[0];
        expect(call.ResultType).toBe('count_only');
        expect(call.ExtraFilter).toBe(`AgentSessionID='${SESSION}' AND [Index] < 6`);
    });

    it('CountShardsBelow refuses a non-integer bound (it is interpolated into the filter)', async () => {
        await expect(ledger.CountShardsBelow(SESSION, 1.5)).rejects.toThrow(/index/i);
        expect(provider.ViewCalls).toHaveLength(0);
    });
});
