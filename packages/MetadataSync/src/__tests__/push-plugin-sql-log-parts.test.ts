import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PushResult } from '../services/PushService';

let pushResult: PushResult;

// The plugin dynamic-imports the engine; stand in for everything but the formatter.
vi.mock('../index.js', async () => {
  const { FormattingService } = await vi.importActual<typeof import('../services/FormattingService')>(
    '../services/FormattingService'
  );
  return {
    FormattingService,
    PushService: class {
      async push(): Promise<PushResult> {
        return pushResult;
      }
    },
    ValidationService: class {},
    SyncStateManager: class {},
    loadMJConfig: () => ({}),
    loadSyncConfig: async () => null,
    initializeProvider: async () => undefined,
    getSyncEngine: async () => ({}),
    getSystemUser: () => ({}),
    configManager: { getOriginalCwd: () => process.cwd() },
  };
});

import { SyncPushPlugin } from '../plugins/index';

/** Runs the plugin's Execute and returns what it logged and the structured result it returned. */
async function runPush(): Promise<{ output: string; data: Record<string, unknown> }> {
  const logs: string[] = [];
  const plugin = Object.create(SyncPushPlugin.prototype) as Record<string, unknown>;
  plugin.parsedFlags = { 'no-validate': true };
  plugin.Host = {
    Format: 'text',
    Verbose: false,
    StartStep: () => undefined,
    SucceedStep: () => undefined,
    FailStep: () => undefined,
    Log: (message: string) => logs.push(message),
  };
  const result = await (plugin as unknown as { Execute(): Promise<{ data: Record<string, unknown> }> }).Execute();
  return { output: logs.join('\n'), data: result.data };
}

describe('mj sync push reports every part of a size-split SQL log (PR #3369)', () => {
  let logDir: string;

  beforeEach(() => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-plugin-sql-parts-'));
  });

  afterEach(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  function resultWith(paths: string[]): PushResult {
    return {
      created: 1,
      updated: 0,
      unchanged: 0,
      errors: 0,
      warnings: [],
      sqlLogPath: paths[0],
      sqlLogPaths: paths,
      changeLog: [],
    } as PushResult;
  }

  it('puts every part in the result data and lists each one in the summary', async () => {
    const parts = [1, 2, 3].map((i) => path.join(logDir, `push.part00${i}.sql`));
    pushResult = resultWith(parts);

    const { output, data } = await runPush();

    expect(data.sqlLogPaths).toEqual(parts);
    expect(data.sqlLogPath).toBe(parts[0]);
    expect(output).toContain('📄 SQL log saved in 3 parts:');
    for (const p of parts) {
      expect(output).toContain(`   ${path.relative(process.cwd(), p)}`);
    }
    expect(output).not.toContain('📄 SQL log saved to:');
  });

  it('keeps the one-line summary when the capture was not split', async () => {
    const only = path.join(logDir, 'push.sql');
    pushResult = resultWith([only]);

    const { output, data } = await runPush();

    expect(data.sqlLogPaths).toEqual([only]);
    expect(output).toContain(`📄 SQL log saved to: ${path.relative(process.cwd(), only)}`);
    expect(output).not.toContain('parts:');
  });
});
