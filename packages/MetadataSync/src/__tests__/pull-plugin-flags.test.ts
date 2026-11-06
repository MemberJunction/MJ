/** The sync pull plugin passes --merge-strategy, --preserve-fields, --exclude-fields, --update-existing and --create-new to PullService. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PullOptions, PullResult } from '../services/PullService';

let received: PullOptions | null = null;
let validationOptions: Record<string, unknown> | null = null;
let cwd = '';

const passingValidation = { isValid: true, errors: [], warnings: [] };

vi.mock('../index.js', () => ({
  PullService: class {
    async pull(options: PullOptions): Promise<PullResult> {
      received = options;
      return { processed: 0, created: 0, updated: 0, skipped: 0, targetDir: cwd };
    }
    async cleanupBackupFiles(): Promise<void> {}
    setStateManager(): void {}
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
  FormattingService: class {},
  FileBackupManager: class {},
  SyncStateManager: class {},
  loadMJConfig: () => ({}),
  initializeProvider: async () => undefined,
  getSyncEngine: async () => ({}),
  getSystemUser: () => ({}),
  configManager: { getOriginalCwd: () => cwd },
  loadEntityConfig: async () => ({ entity: 'MJ: Tags' }),
}));

import { SyncPullPlugin } from '../plugins/index';

async function runPull(flags: Record<string, unknown>): Promise<void> {
  const plugin = Object.create(SyncPullPlugin.prototype) as Record<string, unknown>;
  plugin.parsedFlags = { entity: 'MJ: Tags', 'no-validate': true, 'backup-before-update': false, ...flags };
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

describe('mj sync pull forwards its field flags', () => {
  beforeEach(() => {
    received = null;
    validationOptions = null;
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pull-plugin-flags-'));
    fs.mkdirSync(path.join(cwd, 'tags'));
    fs.writeFileSync(path.join(cwd, 'tags', '.mj-sync.json'), JSON.stringify({ entity: 'MJ: Tags' }));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('passes the merge strategy', async () => {
    await runPull({ 'merge-strategy': 'skip' });

    expect(received?.MergeStrategy).toBe('skip');
  });

  it('passes no merge strategy when the flag is not given', async () => {
    await runPull({});

    expect(received?.MergeStrategy).toBeUndefined();
  });

  it('declares no default for --merge-strategy', () => {
    expect(SyncPullPlugin.flags['merge-strategy'].default).toBeUndefined();
  });

  it('validates only the child folders of the target folder', async () => {
    await runPull({ 'no-validate': false });

    expect(validationOptions).toMatchObject({ ValidateChildFoldersOnly: true });
  });

  it('splits repeated and comma-separated list flags', async () => {
    await runPull({ 'preserve-fields': ['Notes, Description', 'Status'], 'exclude-fields': ['Token'] });

    expect(received?.PreserveFields).toEqual(['Notes', 'Description', 'Status']);
    expect(received?.ExcludeFields).toEqual(['Token']);
  });

  it('passes --no-update-existing and --no-create-new as false', async () => {
    await runPull({ 'update-existing': false, 'create-new': false });

    expect(received?.updateExistingRecords).toBe(false);
    expect(received?.createNewFileIfNotFound).toBe(false);
  });

  it('passes neither option when the flags are not given', async () => {
    await runPull({});

    expect(received?.updateExistingRecords).toBeUndefined();
    expect(received?.createNewFileIfNotFound).toBeUndefined();
  });

  it('declares --update-existing and --create-new with allowNo and no default', () => {
    expect(SyncPullPlugin.flags['update-existing'].default).toBeUndefined();
    expect(SyncPullPlugin.flags['create-new'].default).toBeUndefined();
    expect((SyncPullPlugin.flags['update-existing'] as { allowNo?: boolean }).allowNo).toBe(true);
    expect((SyncPullPlugin.flags['create-new'] as { allowNo?: boolean }).allowNo).toBe(true);
  });
});
