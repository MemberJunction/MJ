import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PushResult, PushCallbacks } from '../services/PushService';

let pushResult: PushResult;
let pushWarnings: string[] = [];
let validationOptions: Record<string, unknown> | null = null;

const passingValidation = { isValid: true, errors: [], warnings: [] };

// The plugin dynamic-imports the engine; stand in for everything but the formatter.
vi.mock('../index.js', async () => {
  const { FormattingService } = await vi.importActual<typeof import('../services/FormattingService')>(
    '../services/FormattingService'
  );
  return {
    FormattingService,
    PushService: class {
      async push(_options: unknown, callbacks?: PushCallbacks): Promise<PushResult> {
        for (const message of pushWarnings) callbacks?.onWarn?.(message);
        return pushResult;
      }
    },
    ValidationService: class {
      constructor(options: Record<string, unknown>) {
        validationOptions = options;
      }
      async ValidateDirectory(): Promise<typeof passingValidation> {
        return passingValidation;
      }
      async validateDirectory(): Promise<typeof passingValidation> {
        return passingValidation;
      }
    },
    SyncStateManager: class {},
    FindSyncRootDir: (dir: string) => dir,
    loadMJConfig: () => ({}),
    loadSyncConfig: async () => null,
    initializeProvider: async () => undefined,
    getSyncEngine: async () => ({}),
    getSystemUser: () => ({}),
    configManager: { getOriginalCwd: () => process.cwd() },
  };
});

import { SyncPushPlugin } from '../plugins/index';

/** Runs the plugin's Execute with the given flags and returns everything it logged. */
async function runPush(flags: Record<string, unknown>): Promise<string> {
  const logs: string[] = [];
  const plugin = Object.create(SyncPushPlugin.prototype) as Record<string, unknown>;
  plugin.parsedFlags = { 'no-validate': true, ...flags };
  plugin.Host = {
    Format: 'text',
    Verbose: false,
    StartStep: () => undefined,
    SucceedStep: () => undefined,
    FailStep: () => undefined,
    Log: (message: string) => logs.push(message),
  };
  await (plugin as unknown as { Execute(): Promise<unknown> }).Execute();
  return logs.join('\n');
}

describe('mj sync push labels a dry run in its text output', () => {
  let reportDir: string;

  beforeEach(() => {
    reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-plugin-dry-run-'));
    pushResult = {
      created: 1,
      updated: 1,
      unchanged: 0,
      errors: 0,
      warnings: [],
      sqlLogPath: path.join(reportDir, 'push.sql'),
      changeLog: [
        { entityName: 'Actions', primaryKey: 'new', Operation: 'created', fields: [] },
        { entityName: 'Actions', primaryKey: 'ID: 1', Operation: 'updated', fields: [{ field: 'Name', oldValue: 'a', newValue: 'b' }] },
      ],
    } as PushResult;
  });

  afterEach(() => {
    fs.rmSync(reportDir, { recursive: true, force: true });
  });

  function report(): string {
    const file = fs.readdirSync(reportDir).find((f) => f.startsWith('MetadataSync_Changes_'));
    return file ? fs.readFileSync(path.join(reportDir, file), 'utf8') : '';
  }

  it('labels the recap, report, summary box and completion line on --dry-run', async () => {
    const output = await runPush({ 'dry-run': true, 'change-detail': true });

    expect(output).toContain('DRY RUN · Changes a push would make (2)');
    expect(output).toContain(' Dry Run Summary ');
    expect(output).toContain('✓ Dry run completed successfully · nothing written');
    expect(output).not.toContain('Push completed');
    expect(report()).toContain('DRY RUN — the changes a push would make. Nothing was written.');
  });

  it('leaves a real push unlabeled', async () => {
    const output = await runPush({ 'change-detail': true });

    expect(output).toContain('── Changes (2) ');
    expect(output).toContain(' Push Summary ');
    expect(output).toContain('✓ Push completed successfully');
    expect(output).not.toMatch(/dry run/i);
    expect(report()).not.toContain('DRY RUN');
  });
});

describe('mj sync push reports folders that pushWhen skipped', () => {
  it('lists each skipped folder and its reason in the JSON data', async () => {
    pushResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      deleted: 0,
      skipped: 0,
      deferred: 0,
      errors: 0,
      warnings: [],
      changeLog: [],
      SkippedDirectories: [{ Directory: path.join(process.cwd(), 'demo-agents'), Reason: 'DEMO_ENABLED is not set' }],
    };
    const plugin = Object.create(SyncPushPlugin.prototype) as Record<string, unknown>;
    plugin.parsedFlags = { 'no-validate': true };
    plugin.Host = {
      Format: 'json',
      Verbose: false,
      StartStep: () => undefined,
      SucceedStep: () => undefined,
      FailStep: () => undefined,
      Log: () => undefined,
    };

    const result = await (plugin as unknown as {
      Execute(): Promise<{ data: { skippedDirectories: Array<{ directory: string; reason: string }> } }>;
    }).Execute();

    expect(result.data.skippedDirectories).toEqual([{ directory: 'demo-agents', reason: 'DEMO_ENABLED is not set' }]);
  });
});

describe('mj sync push lists each warning once', () => {
  afterEach(() => {
    pushWarnings = [];
  });

  it('drops a result warning that a callback already reported', async () => {
    pushWarnings = ['⚠️  A', '⚠️  A'];
    pushResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      deleted: 0,
      skipped: 0,
      deferred: 0,
      errors: 0,
      warnings: ['A', 'B'],
      changeLog: [],
    };
    const plugin = Object.create(SyncPushPlugin.prototype) as Record<string, unknown>;
    plugin.parsedFlags = { 'no-validate': true };
    plugin.Host = {
      Format: 'json',
      Verbose: false,
      StartStep: () => undefined,
      SucceedStep: () => undefined,
      FailStep: () => undefined,
      Log: () => undefined,
    };

    const result = await (plugin as unknown as { Execute(): Promise<{ warnings: string[] }> }).Execute();

    expect(result.warnings).toEqual(['⚠️  A', 'B']);
  });
});

describe('mj sync push validation options', () => {
  beforeEach(() => {
    validationOptions = null;
    pushResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      deleted: 0,
      skipped: 0,
      deferred: 0,
      errors: 0,
      warnings: [],
      changeLog: [],
    };
  });

  async function runJsonPush(flags: Record<string, unknown>): Promise<void> {
    const plugin = Object.create(SyncPushPlugin.prototype) as Record<string, unknown>;
    plugin.parsedFlags = { 'no-validate': false, ...flags };
    plugin.Host = {
      Format: 'json',
      Verbose: false,
      StartStep: () => undefined,
      SucceedStep: () => undefined,
      FailStep: () => undefined,
      Log: () => undefined,
    };
    await (plugin as unknown as { Execute(): Promise<unknown> }).Execute();
  }

  it('honors pushWhen and validates child folders only without --dir', async () => {
    await runJsonPush({});

    expect(validationOptions).toMatchObject({ HonorPushWhen: true, ValidateChildFoldersOnly: true });
  });

  it('validates the given folder itself with --dir', async () => {
    await runJsonPush({ dir: '.' });

    expect(validationOptions).toMatchObject({ HonorPushWhen: true, ValidateChildFoldersOnly: false });
  });
});
