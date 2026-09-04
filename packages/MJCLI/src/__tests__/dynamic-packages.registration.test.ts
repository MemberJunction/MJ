import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { ResetLoadedDynamicPackages } from '@memberjunction/dynamic-packages';
import { loadDynamicPackagesForCommand } from '../lib/dynamic-packages';

/**
 * The proof issue #4199 asked for: a package that is NOT statically imported anywhere in the
 * CLI — named only by configuration, resolved only at runtime — ends up registering its
 * `BaseEntity` subclass in the SAME ClassFactory this process uses, so `GetEntityObject` would
 * construct the app's class instead of a generic BaseEntity.
 *
 * The fixture under `fixtures/fixture-open-app` is a miniature Open App repository (mj-app.json,
 * an entities package, a server bootstrap package). Two resolution paths are exercised:
 *
 *  1. `mj-app.json` discovery — the app's own repo, where nothing can `require.resolve` the
 *     workspace members and the loader imports them from disk.
 *  2. A `dynamicPackages.server[]` entry — the installed form, resolved through the host's
 *     `node_modules` from the mj.config.cjs anchor (the pnpm scenario), here a throwaway host
 *     directory whose package re-exports the fixture server package.
 */
const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fixture-open-app');
const FIXTURE_ENTITY_NAME = 'MJ_Fixture: Widgets';

type FixtureGlobals = { __mjFixtureStartupRuns?: number; __mjFixtureEntitiesLoads?: number };
const g = globalThis as FixtureGlobals;

function registeredClassName(): string | undefined {
  const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, FIXTURE_ENTITY_NAME);
  return registration ? (registration.SubClass as { name: string }).name : undefined;
}

beforeEach(() => {
  ResetLoadedDynamicPackages();
});

describe('dynamic package registration (real ClassFactory, no static imports)', () => {
  it('has no class registered for the fixture entity before anything is loaded', () => {
    // Guards the premise: nothing in the CLI's static import graph knows this entity.
    expect(registeredClassName()).toBeUndefined();
  });

  it('mj-app.json discovery loads the workspace members from disk and the server subclass wins', async () => {
    const before = g.__mjFixtureStartupRuns ?? 0;
    const lines: string[] = [];
    const report = await loadDynamicPackagesForCommand('sync push', {
      // The anchor only needs a directory; the file itself does not have to exist.
      raw: { config: {}, configFilePath: path.join(fixtureDir, 'mj.config.cjs') },
      verbose: true,
      stderr: (l) => lines.push(l),
    });

    expect(report.Failed).toEqual([]);
    expect(report.NotFound).toEqual([]);
    expect(report.Loaded.map((l) => [l.Entry.PackageName, l.Source, l.RanStartupExport])).toEqual([
      ['@mj-fixture/app-entities', 'manifest', false],
      ['@mj-fixture/app-server', 'manifest', true],
    ]);
    expect(g.__mjFixtureStartupRuns).toBe(before + 1);

    // The registration landed in THIS process's ClassFactory, and load-order priority picked the
    // server-side subclass over the generated one — exactly what MJAPI relies on.
    expect(registeredClassName()).toBe('FixtureWidgetEntityServer');
    expect(lines.some((l) => l.includes('Loaded Open App server package (from mj-app.json of mj-fixture-app): @mj-fixture/app-server'))).toBe(true);
  });

  describe('dynamicPackages.server entry resolved through a host node_modules', () => {
    let hostDir: string;
    let hostConfigPath: string;

    beforeAll(() => {
      hostDir = mkdtempSync(path.join(tmpdir(), 'mjcli-dp-host-'));
      hostConfigPath = path.join(hostDir, 'mj.config.cjs');
      writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'fixture-host', version: '1.0.0' }));
      writeFileSync(hostConfigPath, 'module.exports = {};');
      // The "installed" package: what `mj app install` would have put in the host's node_modules.
      // It re-exports the fixture server package by file URL so the same classes register.
      const pkgDir = path.join(hostDir, 'node_modules', '@fixture-host', 'app-server');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@fixture-host/app-server', version: '1.0.0', type: 'module', main: 'index.js' }));
      const serverEntry = pathToFileURL(path.join(fixtureDir, 'packages', 'server', 'index.js')).href;
      writeFileSync(path.join(pkgDir, 'index.js'), `export * from '${serverEntry}';\n`);
    });

    afterAll(() => {
      rmSync(hostDir, { recursive: true, force: true });
    });

    it('imports the package by name from the config anchor, runs the startup export, and the subclass is registered', async () => {
      const before = g.__mjFixtureStartupRuns ?? 0;
      const report = await loadDynamicPackagesForCommand('sync:push', {
        raw: {
          config: {
            dynamicPackages: {
              server: [{ PackageName: '@fixture-host/app-server', StartupExport: 'LoadFixtureAppServer', AppName: 'mj-fixture-app', Enabled: true }],
            },
          },
          configFilePath: hostConfigPath,
        },
        stderr: () => undefined,
      });

      expect(report.Failed).toEqual([]);
      expect(report.NotFound).toEqual([]);
      expect(report.Loaded.map((l) => [l.Entry.PackageName, l.Source, l.RanStartupExport])).toEqual([
        ['@fixture-host/app-server', 'config', true],
      ]);
      expect(g.__mjFixtureStartupRuns).toBe(before + 1);
      expect(registeredClassName()).toBe('FixtureWidgetEntityServer');
      // The host reads conventions off the returned module namespace.
      expect(Array.isArray(report.Loaded[0].Module.RESOLVER_PATHS)).toBe(true);
    });

    it('does not run the startup export again when the same package is loaded a second time in this process', async () => {
      const raw = {
        config: { dynamicPackages: { server: [{ PackageName: '@fixture-host/app-server', StartupExport: 'LoadFixtureAppServer' }] } },
        configFilePath: hostConfigPath,
      };
      await loadDynamicPackagesForCommand('sync:push', { raw, stderr: () => undefined });
      const runs = g.__mjFixtureStartupRuns;
      const second = await loadDynamicPackagesForCommand('ai:agents:run', { raw, stderr: () => undefined });
      expect(second.Loaded[0].RanStartupExport).toBe(false);
      expect(g.__mjFixtureStartupRuns).toBe(runs);
    });

    it('skips the entry, leaving the ClassFactory untouched, when --no-app-packages / MJ_DYNAMIC_PACKAGES=none is set', async () => {
      process.env.MJ_DYNAMIC_PACKAGES = 'none';
      try {
        const report = await loadDynamicPackagesForCommand('sync:push', {
          raw: { config: { dynamicPackages: { server: [{ PackageName: '@fixture-host/app-server', StartupExport: 'LoadFixtureAppServer' }] } }, configFilePath: hostConfigPath },
          stderr: () => undefined,
        });
        expect(report.Mode).toBe('none');
        expect(report.Loaded).toEqual([]);
      } finally {
        delete process.env.MJ_DYNAMIC_PACKAGES;
      }
    });
  });
});
