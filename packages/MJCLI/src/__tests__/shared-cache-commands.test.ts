/**
 * `mj sync push` and `mj codegen` clear the shared cache after a run that may have changed the
 * database (#4083). The plugin bases are replaced with stand-ins whose Execute() outcome and flags
 * each test controls; the clear itself is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { success: boolean; command: string; durationSeconds: number; data?: Record<string, unknown>; warnings?: string[] };

const state = vi.hoisted(() => ({
  result: { success: true, command: 'x', durationSeconds: 0 } as { success: boolean; command: string; durationSeconds: number; data?: Record<string, unknown>; warnings?: string[] },
  flags: {} as Record<string, unknown>,
  logged: [] as Array<[string, string | undefined]>,
  /** When set, the fake Execute() throws this, as PushService does on a record error. */
  throws: null as Error | null,
}));

const clearAfterWrite = vi.fn();
vi.mock('../lib/shared-cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shared-cache.js')>();
  return { ...actual, ClearSharedCacheAfterWrite: (...args: unknown[]) => clearAfterWrite(...args) };
});

function fakePluginBase() {
  return class FakePlugin {
    static flags = {};
    static Usage = { domain: 'x', command: 'x', summary: 's', flags: [] };
    protected Host = { Log: (m: string, level?: string) => state.logged.push([m, level]) };
    protected GetFlags<T>(): T {
      return state.flags as T;
    }
    protected async Execute(): Promise<Result> {
      if (state.throws) throw state.throws;
      return state.result;
    }
  };
}

vi.mock('@memberjunction/metadata-sync/plugins', () => ({ SyncPushPlugin: fakePluginBase() }));
vi.mock('@memberjunction/codegen-lib/plugins', () => ({ CodeGenPlugin: fakePluginBase() }));

import SyncPush from '../commands/sync/push';
import CodeGen from '../commands/codegen/index';

type Runnable = { Execute(): Promise<Result> };
function run(ctor: new () => object): Promise<Result> {
  return (new ctor() as unknown as Runnable).Execute();
}

const OK_REPORT = { Ok: true, Message: 'cleared 3', Categories: [{ Category: 'RunViewCache', KeyCount: 3 }] };

describe('shared cache clear in CLI commands', () => {
  beforeEach(() => {
    clearAfterWrite.mockReset();
    clearAfterWrite.mockResolvedValue(OK_REPORT);
    state.result = { success: true, command: 'x', durationSeconds: 0, data: {} };
    state.flags = {};
    state.logged = [];
    state.throws = null;
  });

  it('declares --skip-cache-clear on both commands, alongside the plugin flags', () => {
    expect(Object.keys(SyncPush.flags)).toContain('skip-cache-clear');
    expect(Object.keys(SyncPush.flags)).not.toContain('full-cache-clear');
    expect(Object.keys(CodeGen.flags)).toContain('skip-cache-clear');
    expect(SyncPush.Usage.flags?.some(f => f.name === '--skip-cache-clear')).toBe(true);
  });

  it('sync push clears after a successful push and records it in the result', async () => {
    const out = await run(SyncPush);
    expect(clearAfterWrite).toHaveBeenCalledWith('mj sync push', undefined);
    expect(out.data?.sharedCacheClear).toEqual({ ok: true, categories: OK_REPORT.Categories });
    expect(state.logged).toEqual([['cleared 3', 'info']]);
  });

  it('sync push clears after a push that failed (it may have committed part of its work)', async () => {
    state.result = { success: false, command: 'x', durationSeconds: 0 };
    const out = await run(SyncPush);
    expect(clearAfterWrite).toHaveBeenCalledWith('mj sync push (failed)', undefined);
    expect(out.success).toBe(false);
  });

  it('sync push clears after a push that threw, logs it, and rethrows', async () => {
    state.throws = new Error('Name cannot be null');
    await expect(run(SyncPush)).rejects.toThrow('Name cannot be null');
    expect(clearAfterWrite).toHaveBeenCalledWith('mj sync push (failed)', undefined);
    expect(state.logged).toEqual([['cleared 3', 'info']]);
  });

  it('sync push does not clear after a dry run, even one that failed', async () => {
    state.flags = { 'dry-run': true };
    await run(SyncPush);
    state.throws = new Error('bad file');
    await expect(run(SyncPush)).rejects.toThrow('bad file');
    expect(clearAfterWrite).not.toHaveBeenCalled();
  });

  it('sync push passes --skip-cache-clear through', async () => {
    state.flags = { 'skip-cache-clear': true };
    await run(SyncPush);
    expect(clearAfterWrite).toHaveBeenCalledWith('mj sync push', true);
  });

  it('codegen clears after a run that touched the database, not after --skipdb', async () => {
    await run(CodeGen);
    expect(clearAfterWrite).toHaveBeenCalledWith('mj codegen', undefined);

    clearAfterWrite.mockClear();
    state.flags = { skipdb: true };
    await run(CodeGen);
    expect(clearAfterWrite).not.toHaveBeenCalled();
  });

  it('codegen clears after a FAILED run too — it applies schema as it goes', async () => {
    // A codegen run writes views, stored procedures and entity metadata as it goes, so a failure at
    // a later stage leaves the database changed and every server holding the old shape. Same policy
    // as mj migrate and mj sync push (plan §22).
    state.result = { success: false, command: 'x', durationSeconds: 0 };
    await run(CodeGen);
    expect(clearAfterWrite).toHaveBeenCalledWith('mj codegen (failed)', undefined);
  });

  it('codegen does not clear after a failed --skipdb run, which wrote nothing', async () => {
    state.result = { success: false, command: 'x', durationSeconds: 0 };
    state.flags = { skipdb: true };
    await run(CodeGen);
    expect(clearAfterWrite).not.toHaveBeenCalled();
  });
});
