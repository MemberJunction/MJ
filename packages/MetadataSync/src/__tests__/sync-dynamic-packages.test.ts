import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DYNAMIC_PACKAGES_MODE_ENV_VAR, ResetLoadedDynamicPackages } from '../lib/dynamic-packages/index';
import { loadSyncDynamicPackages } from '../lib/sync-dynamic-packages';

/**
 * `mj sync` on the 5.x line loads the host's Open App server packages and generated packages the
 * same way MJAPI does, scoped to `cli:sync:<command>`, with output on stderr only.
 */
const scope = '@mjsync-dptest';
let hostDir: string;
let hostConfigPath: string;

function writeHostPackage(name: string, source: string): void {
  const dir = path.join(hostDir, 'node_modules', scope, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `${scope}/${name}`, version: '1.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(path.join(dir, 'index.js'), source);
}

declare global {
  var __mjsyncDpStartup: number | undefined;
  var __mjsyncDpGenerated: number | undefined;
}

beforeAll(() => {
  hostDir = mkdtempSync(path.join(tmpdir(), 'mjsync-dp-'));
  hostConfigPath = path.join(hostDir, 'mj.config.cjs');
  writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'fake-host', version: '1.0.0' }));
  writeFileSync(hostConfigPath, 'module.exports = {};');
  writeHostPackage('server', 'export function Load() { globalThis.__mjsyncDpStartup = (globalThis.__mjsyncDpStartup ?? 0) + 1; }');
  writeHostPackage('entities', 'globalThis.__mjsyncDpGenerated = (globalThis.__mjsyncDpGenerated ?? 0) + 1;');
});

afterAll(() => {
  rmSync(hostDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
  ResetLoadedDynamicPackages();
});

afterEach(() => {
  delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
});

function raw(serverEntry: Record<string, unknown>) {
  return {
    config: {
      codeGeneration: { packages: { entities: { name: `${scope}/entities` } } },
      dynamicPackages: { server: [{ PackageName: `${scope}/server`, StartupExport: 'Load', AppName: 'test', Enabled: true, ...serverEntry }] },
    },
    configFilePath: hostConfigPath,
  };
}

describe('loadSyncDynamicPackages', () => {
  it('loads the generated package then the Open App package for `sync:push`, running the startup export', async () => {
    const lines: string[] = [];
    const report = await loadSyncDynamicPackages('sync:push', { raw: raw({}), verbose: true, stderr: (l) => lines.push(l) });

    expect(report.ProcessId).toBe('cli:sync:push');
    expect(report.Loaded.map((l) => [l.Entry.PackageName, l.Source])).toEqual([
      [`${scope}/entities`, 'generated'],
      [`${scope}/server`, 'config'],
    ]);
    expect(report.Loaded[1].RanStartupExport).toBe(true);
    expect(lines.some((l) => l.includes(`Loaded Open App server package: ${scope}/server (ran Load)`))).toBe(true);
    expect(lines.some((l) => l.startsWith('[dynamic-packages] cli:sync:push: loaded 2'))).toBe(true);
  });

  it("honours an entry's Processes scope — ['cli:sync'] covers push and pull", async () => {
    const report = await loadSyncDynamicPackages('sync:pull', { raw: raw({ Processes: ['cli:sync'] }), stderr: () => undefined });
    expect(report.ProcessId).toBe('cli:sync:pull');
    expect(report.Loaded.map((l) => l.Entry.PackageName)).toContain(`${scope}/server`);
  });

  it('skips an entry scoped to another process, and a disabled one', async () => {
    const scoped = await loadSyncDynamicPackages('sync:push', { raw: raw({ Processes: ['mjapi'] }), stderr: () => undefined });
    expect(scoped.Skipped.map((s) => [s.Entry.PackageName, s.Reason])).toEqual([[`${scope}/server`, 'process-filter']]);

    ResetLoadedDynamicPackages();
    const disabled = await loadSyncDynamicPackages('sync:push', { raw: raw({ Enabled: false }), stderr: () => undefined });
    expect(disabled.Skipped.map((s) => [s.Entry.PackageName, s.Reason])).toEqual([[`${scope}/server`, 'disabled']]);
  });

  it('loads nothing when MJ_DYNAMIC_PACKAGES=none', async () => {
    process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = 'none';
    const report = await loadSyncDynamicPackages('sync:push', { raw: raw({}), stderr: () => undefined });
    expect(report.Mode).toBe('none');
    expect(report.Loaded).toEqual([]);
  });

  it('says nothing when not verbose and nothing failed, and reports a missing package without failing', async () => {
    const lines: string[] = [];
    const config = { dynamicPackages: { server: [{ PackageName: `${scope}/not-installed`, Enabled: true }] } };
    const report = await loadSyncDynamicPackages('sync:push', { raw: { config, configFilePath: hostConfigPath }, stderr: (l) => lines.push(l) });

    expect(report.NotFound.map((n) => n.Entry.PackageName)).toEqual([`${scope}/not-installed`]);
    expect(report.Failed).toEqual([]);
    expect(lines).toEqual([]);
  });
});
