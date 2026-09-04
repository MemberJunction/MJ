import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DYNAMIC_PACKAGES_MODE_ENV_VAR, DYNAMIC_PACKAGES_PROCESS_ENV_VAR, ResetLoadedDynamicPackages } from '@memberjunction/dynamic-packages';
import { loadDynamicPackagesForCommand } from '../lib/dynamic-packages';
import hook, { DYNAMIC_PACKAGES_MODE_ENV_VAR as PRERUN_MODE_ENV_VAR } from '../hooks/prerun';

/**
 * The CLI's half of issue #4199: a heavy command must load the installed Open Apps' server
 * packages scoped to `cli:<command>`, keep stdout clean while doing so, and honour the global
 * `--no-app-packages` flag the prerun hook consumes on behalf of every command.
 */
const scope = '@mjcli-dptest';
let hostDir: string;
let hostConfigPath: string;

function writeHostPackage(name: string, source: string): void {
  const dir = path.join(hostDir, 'node_modules', scope, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `${scope}/${name}`, version: '1.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(path.join(dir, 'index.js'), source);
}

beforeAll(() => {
  hostDir = mkdtempSync(path.join(tmpdir(), 'mjcli-dp-'));
  hostConfigPath = path.join(hostDir, 'mj.config.cjs');
  writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'fake-host', version: '1.0.0' }));
  writeFileSync(hostConfigPath, 'module.exports = {};');
  writeHostPackage('server', "globalThis.__mjcliDp = (globalThis.__mjcliDp ?? 0) + 1; export function Load() { globalThis.__mjcliDpStartup = (globalThis.__mjcliDpStartup ?? 0) + 1; }");
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
  delete process.env[DYNAMIC_PACKAGES_PROCESS_ENV_VAR];
  delete process.env.MJ_CLI_NO_BANNER;
});

describe('loadDynamicPackagesForCommand', () => {
  const raw = () => ({
    config: {
      dynamicPackages: {
        server: [
          { PackageName: `${scope}/server`, StartupExport: 'Load', AppName: 'test', Enabled: true, Processes: ['cli:sync'] },
        ],
      },
    },
    configFilePath: hostConfigPath,
  });

  it('loads an entry scoped to cli:sync for `sync push` (space-separated oclif id) and runs its startup export', async () => {
    const lines: string[] = [];
    const report = await loadDynamicPackagesForCommand('sync push', { raw: raw(), verbose: true, stderr: (l) => lines.push(l) });
    expect(report.ProcessId).toBe('cli:sync:push');
    expect(report.Loaded.map((l) => [l.Entry.PackageName, l.RanStartupExport])).toEqual([[`${scope}/server`, true]]);
    expect(lines.some((l) => l.includes(`Loaded Open App server package: ${scope}/server (ran Load)`))).toBe(true);
    expect(lines.some((l) => l.startsWith('[dynamic-packages] cli:sync:push: loaded 1'))).toBe(true);
  });

  it('publishes the command process id for hosts the command imports in-process (mj ai …, mj test …)', async () => {
    await loadDynamicPackagesForCommand('ai agents run', { raw: raw(), stderr: () => undefined });
    expect(process.env[DYNAMIC_PACKAGES_PROCESS_ENV_VAR]).toBe('cli:ai:agents:run');
  });

  it('does NOT load that entry for a command outside its scope', async () => {
    const report = await loadDynamicPackagesForCommand('migrate', { raw: raw(), stderr: () => undefined });
    expect(report.Loaded).toEqual([]);
    expect(report.Skipped.map((s) => s.Reason)).toEqual(['process-filter']);
  });

  it('says nothing on the channel when not verbose and nothing failed', async () => {
    const lines: string[] = [];
    await loadDynamicPackagesForCommand('sync:push', { raw: raw(), stderr: (l) => lines.push(l) });
    expect(lines).toEqual([]);
  });

  it('reports a package that throws while loading even when not verbose', async () => {
    writeHostPackage('throwing', "throw new Error('boom-cli-load');");
    const lines: string[] = [];
    const report = await loadDynamicPackagesForCommand('sync:push', {
      raw: { config: { dynamicPackages: { server: [{ PackageName: `${scope}/throwing` }] } }, configFilePath: hostConfigPath },
      stderr: (l) => lines.push(l),
    });
    expect(report.Failed).toHaveLength(1);
    expect(lines.some((l) => l.includes('boom-cli-load'))).toBe(true);
  });

  it('honours MJ_DYNAMIC_PACKAGES=none', async () => {
    process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = 'none';
    const report = await loadDynamicPackagesForCommand('sync:push', { raw: raw(), stderr: () => undefined });
    expect(report.Mode).toBe('none');
    expect(report.Loaded).toEqual([]);
  });

  it('tolerates a missing config entirely', async () => {
    const report = await loadDynamicPackagesForCommand('sync:push', { raw: { config: undefined }, stderr: () => undefined });
    expect(report.Loaded).toEqual([]);
  });
});

describe('prerun --no-app-packages', () => {
  it('uses the same env var name as the loader (the hook inlines it to stay light)', () => {
    expect(PRERUN_MODE_ENV_VAR).toBe(DYNAMIC_PACKAGES_MODE_ENV_VAR);
  });

  function runHook(argv: string[], commandId: string) {
    const options = {
      argv,
      Command: { id: commandId },
      config: { userAgent: 'mj/test' },
      context: { log: () => undefined },
    };
    return { promise: (hook as unknown as (o: unknown) => Promise<void>)(options), argv };
  }

  it('strips the flag from argv (so strict command parsers never see it) and sets the loader env var', async () => {
    // A LIGHT command id keeps the hook from importing the bootstrap manifest during the test.
    const { promise, argv } = runHook(['--no-app-packages', '--no-banner'], 'version');
    await promise;
    expect(argv).toEqual([]);
    expect(process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR]).toBe('none');
  });

  it('leaves the env var alone when the flag is absent', async () => {
    const { promise } = runHook(['--no-banner'], 'version');
    await promise;
    expect(process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR]).toBeUndefined();
  });
});
