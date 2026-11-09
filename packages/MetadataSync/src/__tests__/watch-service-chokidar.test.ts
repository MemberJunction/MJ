/**
 * WatchService with the real chokidar over a temp folder: which file changes reach watch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { FSWatcher } from 'chokidar';
import type { UserInfo } from '@memberjunction/core';
import { WatchService, type WatchResult } from '../services/WatchService';
import { SyncEngine } from '../lib/sync-engine';
import { configManager } from '../lib/config-manager';

/** Waits for the watcher's ready event, or a short time when it was already emitted. */
function ready(watcher: FSWatcher): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    watcher.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Polls until the check holds or the time runs out. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check() && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('WatchService — real chokidar', () => {
  let root: string;
  let widgets: string;
  let previousCwd: string;
  let result: WatchResult | null;
  let seen: string[];

  beforeEach(async () => {
    previousCwd = configManager.GetOriginalCwd();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mj-watch-real-')));
    widgets = path.join(root, 'widgets');
    await fs.ensureDir(path.join(widgets, 'docs'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0' });
    configManager.SetOriginalCwd(root);
    result = null;
    seen = [];
  });

  afterEach(async () => {
    await result?.stop();
    configManager.SetOriginalCwd(previousCwd);
    await fs.remove(root);
  });

  async function startWatch(filePattern?: string): Promise<void> {
    await fs.writeJson(path.join(widgets, '.mj-sync.json'), { entity: 'MJ: Widgets', ...(filePattern ? { filePattern } : {}) });
    const record = (file: string) => (filePath: string) => seen.push(`${file}:${path.relative(widgets, filePath)}`);
    const service = new WatchService(new SyncEngine({} as UserInfo));
    result = await service.Watch(
      { debounceMs: 60_000 },
      { onFileAdd: record('add'), onFileChange: record('change'), onFileDelete: record('unlink') }
    );
    await Promise.all(result.watchers.map(ready));
    // chokidar reads a folder again at most once a second, so a file written right after the start can be missed
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  it('sees a change to a dot-file record file and to a .md file, but not to .mj-sync.json or another file', async () => {
    await fs.writeJson(path.join(widgets, '.w.json'), { fields: { Name: 'A' } });
    await fs.writeFile(path.join(widgets, 'docs', 'intro.md'), 'one');
    await fs.writeFile(path.join(widgets, 'notes.csv'), 'one');
    await startWatch('**/.*.json');

    await fs.writeFile(path.join(widgets, 'notes.csv'), 'two');
    await fs.writeJson(path.join(widgets, '.mj-sync.json'), { entity: 'MJ: Widgets', filePattern: '**/.*.json', note: 'x' });
    await fs.writeJson(path.join(widgets, '.w.json'), { fields: { Name: 'B' } });
    await fs.writeFile(path.join(widgets, 'docs', 'intro.md'), 'two');
    await waitFor(() => seen.includes('change:.w.json') && seen.includes(`change:${path.join('docs', 'intro.md')}`));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(seen).toContain('change:.w.json');
    expect(seen).toContain(`change:${path.join('docs', 'intro.md')}`);
    expect(seen.filter((entry) => entry.endsWith('.mj-sync.json') || entry.endsWith('notes.csv'))).toEqual([]);
  });

  it('sees a new record file that matches the default pattern, and not one in a sub-folder or in node_modules', async () => {
    await fs.ensureDir(path.join(widgets, 'node_modules'));
    await startWatch();

    await fs.writeJson(path.join(widgets, 'node_modules', 'x.json'), {});
    await fs.writeJson(path.join(widgets, 'docs', 'side.json'), {});
    await fs.writeJson(path.join(widgets, 'w.json'), { fields: { Name: 'A' } });
    await waitFor(() => seen.includes('add:w.json'));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(seen).toContain('add:w.json');
    expect(seen.filter((entry) => entry.includes('node_modules') || entry.includes('side.json'))).toEqual([]);
  });
});
