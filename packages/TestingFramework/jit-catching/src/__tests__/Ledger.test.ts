import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LedgerFile, LedgerID, type BacktestLedger } from '../backtest/Ledger';
import { RedactionCheck, RedactionError } from '../sandbox/Redaction';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function tempRoot(): string { const d = mkdtempSync(join(tmpdir(), 'jit-ledger-')); dirs.push(d); return d; }

function ledger(error: string | null = null): BacktestLedger {
  return {
    ID: 'corpus-Tuning-Bug-m', CorpusPath: '/c/corpus.json', Slice: 'Tuning', Set: 'Bug', Model: 'm', CreatedAt: '2026-11-09T10:00:00.000Z',
    Entries: [{ PR: 5, Set: 'Bug', BaseSHA: 'a'.repeat(40), HeadSHA: 'b'.repeat(40), RunID: null, Status: error ? 'Failed' : 'Pending', Error: error, CostUSD: 0, StartedAt: null, EndedAt: null, Match: null }],
  };
}

describe('LedgerID', () => {
  it('joins the corpus name, slice, set and model and replaces unsafe characters', () => {
    expect(LedgerID('/x/y/corpus.json', 'HeldOut', 'Both', 'claude-opus-5.5/x')).toBe('corpus-HeldOut-Both-claude-opus-5_5_x');
  });
});

describe('LedgerFile', () => {
  it('writes under .jit-catch/backtests and reads the ledger back', () => {
    const root = tempRoot();
    const f = new LedgerFile(root, 'corpus-Tuning-Bug-m', new RedactionCheck([]));
    expect(f.Path).toBe(join(root, '.jit-catch', 'backtests', 'corpus-Tuning-Bug-m.json'));
    expect(f.Exists()).toBe(false);
    f.Write(ledger());
    expect(f.Exists()).toBe(true);
    expect(f.Read()).toEqual(ledger());
  });

  it('refuses a ledger that holds a secret and writes nothing', () => {
    const root = tempRoot();
    const f = new LedgerFile(root, 'corpus-Tuning-Bug-m', new RedactionCheck(['super-secret-value-123']));
    expect(() => f.Write(ledger('boom super-secret-value-123'))).toThrow(RedactionError);
    expect(f.Exists()).toBe(false);
    expect(existsSync(`${f.Path}.tmp`)).toBe(false);
  });
});
