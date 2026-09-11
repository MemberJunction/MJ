import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LoadDynamicPackages, ResetLoadedDynamicPackages, StderrDynamicPackagesLogger, mergeCandidates } from '../loader';
import { DYNAMIC_PACKAGES_MODE_ENV_VAR } from '../mode';
import type { DynamicPackagesLogger } from '../types';

/**
 * A fake HOST on disk: an mj.config.cjs plus a node_modules carrying packages that this
 * package cannot resolve — the pnpm scenario the host-anchored import exists for. Every
 * loader behaviour is exercised against real modules so the import/startup path is the one
 * production takes, not a mock.
 */
const scope = '@dp-loadtest';
let hostDir: string;
let hostConfigPath: string;

function writeHostPackage(name: string, source: string, pkgJsonExtra: Record<string, unknown> = {}): void {
    const dir = path.join(hostDir, 'node_modules', scope, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `${scope}/${name}`, version: '1.0.0', type: 'module', main: 'index.js', ...pkgJsonExtra }));
    writeFileSync(path.join(dir, 'index.js'), source);
}

function recordingLogger(): DynamicPackagesLogger & { infos: string[]; warns: string[]; verboses: string[] } {
    const infos: string[] = [];
    const warns: string[] = [];
    const verboses: string[] = [];
    return {
        infos,
        warns,
        verboses,
        info: (m) => infos.push(m),
        warn: (m, e) => warns.push(e === undefined ? m : `${m} ${e instanceof Error ? e.message : String(e)}`),
        verbose: (m) => verboses.push(m),
    };
}

beforeAll(() => {
    hostDir = mkdtempSync(path.join(tmpdir(), 'dp-loader-'));
    hostConfigPath = path.join(hostDir, 'mj.config.cjs');
    writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'fake-host', version: '1.0.0' }));
    writeFileSync(hostConfigPath, 'module.exports = {};');

    writeHostPackage('server', "globalThis.__dpLoads = (globalThis.__dpLoads ?? []); globalThis.__dpLoads.push('server'); export const RESOLVER_PATHS = ['/abs/generated.js']; export function LoadServer() { globalThis.__dpLoads.push('server:startup'); }");
    writeHostPackage('entities', "globalThis.__dpLoads = (globalThis.__dpLoads ?? []); globalThis.__dpLoads.push('entities'); export const ok = true;");
    writeHostPackage('throwing', "throw new Error('boom-load: module evaluated and failed');");
    writeHostPackage('broken-transitive', "import 'dp-loadtest-definitely-missing-dep';");
    writeHostPackage('noexport', 'export const ok = true;');
});

afterAll(() => {
    rmSync(hostDir, { recursive: true, force: true });
});

beforeEach(() => {
    delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
    (globalThis as { __dpLoads?: string[] }).__dpLoads = [];
    ResetLoadedDynamicPackages();
});

afterEach(() => {
    delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
});

describe('LoadDynamicPackages', () => {
    it('requires a processId', async () => {
        await expect(LoadDynamicPackages({ processId: '  ' })).rejects.toThrow(/processId is required/);
    });

    it('is a silent no-op when nothing is configured', async () => {
        const log = recordingLogger();
        const report = await LoadDynamicPackages({ processId: 'mjapi', config: {}, configFilePath: hostConfigPath, log });
        expect(report.Loaded).toEqual([]);
        expect(log.infos).toEqual([]);
        expect(log.warns).toEqual([]);
    });

    it('loads generated packages, then dynamicPackages.server, running StartupExport and exposing the module', async () => {
        const log = recordingLogger();
        const report = await LoadDynamicPackages({
            processId: 'mjapi',
            config: {
                codeGeneration: { packages: { entities: { name: `${scope}/entities` } } },
                dynamicPackages: { server: [{ PackageName: `${scope}/server`, StartupExport: 'LoadServer', AppName: 'test', Enabled: true }] },
            },
            configFilePath: hostConfigPath,
            log,
        });
        expect(report.Loaded.map((l) => [l.Entry.PackageName, l.Source, l.RanStartupExport])).toEqual([
            [`${scope}/entities`, 'generated', false],
            [`${scope}/server`, 'config', true],
        ]);
        expect(report.Loaded[1].Module.RESOLVER_PATHS).toEqual(['/abs/generated.js']);
        expect((globalThis as { __dpLoads?: string[] }).__dpLoads).toContain('server:startup');
        expect(log.infos).toContain('Loading generated packages...');
        expect(log.infos).toContain('Loading Open App server packages...');
        expect(log.infos).toContain(`  Loaded Open App server package: ${scope}/server (ran LoadServer)`);
        expect(log.warns).toEqual([]);
    });

    it('skips disabled entries and entries scoped to other processes, recording why', async () => {
        const report = await LoadDynamicPackages({
            processId: 'cli:migrate',
            config: {
                dynamicPackages: {
                    server: [
                        { PackageName: `${scope}/server`, Enabled: false },
                        { PackageName: `${scope}/entities`, Processes: ['cli:sync'] },
                        { PackageName: `${scope}/noexport`, ExcludeProcesses: ['cli:migrate'] },
                    ],
                },
            },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(report.Loaded).toEqual([]);
        expect(report.Skipped.map((s) => [s.Entry.PackageName, s.Reason])).toEqual([
            [`${scope}/server`, 'disabled'],
            [`${scope}/entities`, 'process-filter'],
            [`${scope}/noexport`, 'process-filter'],
        ]);
    });

    it('loads an entry scoped to a process prefix when the process is underneath it', async () => {
        const report = await LoadDynamicPackages({
            processId: 'cli:sync:push',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/noexport`, Processes: ['cli:sync'] }] } },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(report.Loaded.map((l) => l.Entry.PackageName)).toEqual([`${scope}/noexport`]);
    });

    it('loads nothing (and says so) when the mode resolves to none', async () => {
        process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = 'none';
        const log = recordingLogger();
        const report = await LoadDynamicPackages({
            processId: 'cli:sync:push',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/server`, StartupExport: 'LoadServer' }] } },
            configFilePath: hostConfigPath,
            log,
        });
        expect(report.Mode).toBe('none');
        expect(report.ModeSource).toBe('env');
        expect(report.Loaded).toEqual([]);
        expect(report.Skipped.map((s) => s.Reason)).toEqual(['mode-none']);
        expect((globalThis as { __dpLoads?: string[] }).__dpLoads).toEqual([]);
        expect(log.infos.some((l) => l.includes("mode 'none'"))).toBe(true);
    });

    it('honours dynamicPackages.policy for the process, most specific key first', async () => {
        const report = await LoadDynamicPackages({
            processId: 'cli:migrate',
            config: {
                dynamicPackages: {
                    policy: { cli: 'load', 'cli:migrate': 'none' },
                    server: [{ PackageName: `${scope}/noexport` }],
                },
            },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(report.Mode).toBe('none');
        expect(report.ModeSource).toBe('policy');
    });

    it("reports a genuinely missing package as NotFound with the friendly line, not a warning", async () => {
        const log = recordingLogger();
        const report = await LoadDynamicPackages({
            processId: 'mjapi',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/does-not-exist` }] } },
            configFilePath: hostConfigPath,
            log,
        });
        expect(report.NotFound.map((n) => n.Entry.PackageName)).toEqual([`${scope}/does-not-exist`]);
        expect(report.Failed).toEqual([]);
        expect(log.infos).toContain(`  Open App server package not found (run 'npm install'?): ${scope}/does-not-exist`);
        expect(log.warns).toEqual([]);
    });

    it("surfaces a found package's own load error (and a missing TRANSITIVE dep) on the warn path", async () => {
        const log = recordingLogger();
        const report = await LoadDynamicPackages({
            processId: 'mjapi',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/throwing` }, { PackageName: `${scope}/broken-transitive` }] } },
            configFilePath: hostConfigPath,
            log,
        });
        expect(report.Failed.map((f) => f.Entry.PackageName)).toEqual([`${scope}/throwing`, `${scope}/broken-transitive`]);
        expect(report.NotFound).toEqual([]);
        expect(log.warns.some((w) => w.includes(`Error loading Open App server package ${scope}/throwing`) && w.includes('boom-load'))).toBe(true);
        expect(log.warns.some((w) => w.includes('dp-loadtest-definitely-missing-dep'))).toBe(true);
    });

    it('warns when StartupExport names an export the module does not have, but still counts the package as loaded', async () => {
        const log = recordingLogger();
        const report = await LoadDynamicPackages({
            processId: 'mjapi',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/noexport`, StartupExport: 'LoadRenamed' }] } },
            configFilePath: hostConfigPath,
            log,
        });
        expect(report.Loaded).toHaveLength(1);
        expect(report.Loaded[0].RanStartupExport).toBe(false);
        expect(log.warns.some((w) => w.includes("no export named 'LoadRenamed'"))).toBe(true);
    });

    it('does not re-run a startup export when a second host in the same process loads the same package', async () => {
        const config = { dynamicPackages: { server: [{ PackageName: `${scope}/server`, StartupExport: 'LoadServer' }] } };
        const first = await LoadDynamicPackages({ processId: 'cli:ai:run', config, configFilePath: hostConfigPath, log: recordingLogger() });
        const second = await LoadDynamicPackages({ processId: 'ai-cli', config, configFilePath: hostConfigPath, log: recordingLogger() });
        expect(first.Loaded.map((l) => l.RanStartupExport)).toEqual([true]);
        // The module is still handed back (hosts read RESOLVER_PATHS etc. off it) …
        expect(second.Loaded).toHaveLength(1);
        expect(second.Loaded[0].Module.RESOLVER_PATHS).toEqual(['/abs/generated.js']);
        expect(second.Loaded[0].RanStartupExport).toBe(false);
        // … but the startup hook ran exactly once in the process.
        expect((globalThis as { __dpLoads?: string[] }).__dpLoads.filter((l) => l === 'server:startup')).toHaveLength(1);
    });

    it('keeps a disabled or out-of-scope entry skipped even after an earlier call loaded the package', async () => {
        const first = await LoadDynamicPackages({
            processId: 'mjapi',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/noexport` }] } },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(first.Loaded).toHaveLength(1);
        const second = await LoadDynamicPackages({
            processId: 'mjapi',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/noexport`, Enabled: false }] } },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(second.Loaded).toEqual([]);
        expect(second.Skipped.map((s) => s.Reason)).toEqual(['disabled']);
        const third = await LoadDynamicPackages({
            processId: 'cli:codegen',
            config: { dynamicPackages: { server: [{ PackageName: `${scope}/noexport`, Processes: ['mjapi'] }] } },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(third.Loaded).toEqual([]);
        expect(third.Skipped.map((s) => s.Reason)).toEqual(['process-filter']);
    });

    it('loads each package once even when named by two sources', async () => {
        const report = await LoadDynamicPackages({
            processId: 'mjapi',
            config: {
                codeGeneration: { packages: { entities: { name: `${scope}/entities` } } },
                dynamicPackages: { server: [{ PackageName: `${scope}/entities` }] },
            },
            configFilePath: hostConfigPath,
            log: recordingLogger(),
        });
        expect(report.Loaded).toHaveLength(1);
        expect(report.Skipped.map((s) => s.Reason)).toEqual(['duplicate']);
    });

    describe('mj-app.json discovery (running inside an Open App repository)', () => {
        let appDir: string;
        let appConfigPath: string;

        beforeAll(() => {
            appDir = mkdtempSync(path.join(tmpdir(), 'dp-apprepo-'));
            appConfigPath = path.join(appDir, 'mj.config.cjs');
            writeFileSync(appConfigPath, 'module.exports = {};');
            writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'app-repo', version: '1.0.0' }));
            writeFileSync(
                path.join(appDir, 'mj-app.json'),
                JSON.stringify({
                    name: 'dp-app',
                    packages: {
                        server: [{ name: '@dp-app/server', role: 'bootstrap', startupExport: 'LoadDpApp' }],
                        shared: [{ name: '@dp-app/entities', role: 'library' }],
                    },
                })
            );
            // Workspace members: NOT in any node_modules, only on disk under packages/ — the
            // pnpm-strict shape where nothing at the repo root can require.resolve them.
            for (const [dir, name, source] of [
                ['Entities', '@dp-app/entities', "globalThis.__dpLoads.push('app:entities'); export const ok = true;"],
                ['Server', '@dp-app/server', "globalThis.__dpLoads.push('app:server'); export function LoadDpApp() { globalThis.__dpLoads.push('app:startup'); }"],
            ] as const) {
                const pkgDir = path.join(appDir, 'packages', dir);
                mkdirSync(pkgDir, { recursive: true });
                writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': { import: './dist/index.js' } } }));
                mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
                writeFileSync(path.join(pkgDir, 'dist', 'index.js'), source);
            }
        });

        afterAll(() => {
            rmSync(appDir, { recursive: true, force: true });
        });

        it('loads the manifest packages from disk, shared libraries before the server bootstrap, running startupExport', async () => {
            const log = recordingLogger();
            const report = await LoadDynamicPackages({ processId: 'cli:sync:push', config: {}, configFilePath: appConfigPath, log });
            expect(report.Loaded.map((l) => [l.Entry.PackageName, l.Source, l.RanStartupExport])).toEqual([
                ['@dp-app/entities', 'manifest', false],
                ['@dp-app/server', 'manifest', true],
            ]);
            expect((globalThis as { __dpLoads?: string[] }).__dpLoads).toEqual(['app:entities', 'app:server', 'app:startup']);
            expect(log.infos.some((l) => l.includes('from mj-app.json of dp-app'))).toBe(true);
        });

        it('lets a config entry disabled with `mj app disable` stay disabled when mj-app.json names the same package', async () => {
            const report = await LoadDynamicPackages({
                processId: 'cli:sync:push',
                config: { dynamicPackages: { server: [{ PackageName: '@dp-app/server', AppName: 'dp-app', Enabled: false }] } },
                configFilePath: appConfigPath,
                log: recordingLogger(),
            });
            expect(report.Loaded.map((l) => l.Entry.PackageName)).toEqual(['@dp-app/entities']);
            expect(report.Skipped.map((s) => [s.Entry.PackageName, s.Reason])).toEqual([
                ['@dp-app/server', 'duplicate'],
                ['@dp-app/server', 'disabled'],
            ]);
            expect((globalThis as { __dpLoads?: string[] }).__dpLoads).not.toContain('app:startup');
        });

        it('loads a config entry the host cannot resolve from the workspace member mj-app.json points at', async () => {
            // The app's own package appears in the sibling mj.config.cjs (installed form) AND in
            // mj-app.json; nothing at the repo root can require.resolve it. The config entry keeps
            // its authority (scoping, startup export) and borrows the manifest's on-disk location.
            const report = await LoadDynamicPackages({
                processId: 'cli:sync:push',
                config: { dynamicPackages: { server: [{ PackageName: '@dp-app/server', StartupExport: 'LoadDpApp', Processes: ['cli:sync'] }] } },
                configFilePath: appConfigPath,
                log: recordingLogger(),
            });
            const server = report.Loaded.find((l) => l.Entry.PackageName === '@dp-app/server');
            expect(server?.Source).toBe('config');
            expect(server?.RanStartupExport).toBe(true);
            expect(report.NotFound).toEqual([]);
            expect((globalThis as { __dpLoads?: string[] }).__dpLoads).toContain('app:startup');
        });

        it('can be switched off with discoverAppManifest: false', async () => {
            const report = await LoadDynamicPackages({ processId: 'cli:sync:push', config: {}, configFilePath: appConfigPath, discoverAppManifest: false, log: recordingLogger() });
            expect(report.Loaded).toEqual([]);
        });

        it('reports a manifest package that is neither resolvable nor on disk as NotFound', async () => {
            const otherDir = mkdtempSync(path.join(tmpdir(), 'dp-apprepo2-'));
            try {
                writeFileSync(path.join(otherDir, 'mj-app.json'), JSON.stringify({ name: 'ghost', packages: { server: [{ name: '@ghost/server' }] } }));
                const log = recordingLogger();
                const report = await LoadDynamicPackages({ processId: 'mjapi', config: {}, appManifestDir: otherDir, log });
                expect(report.NotFound.map((n) => n.Entry.PackageName)).toEqual(['@ghost/server']);
                expect(log.warns).toEqual([]);
            } finally {
                rmSync(otherDir, { recursive: true, force: true });
            }
        });

        it('reports a workspace member found on disk but not yet built as NotFound, never on the warn path', async () => {
            // The state of every Open App repo before its first build: package.json is there, dist is not.
            const unbuiltDir = mkdtempSync(path.join(tmpdir(), 'dp-apprepo4-'));
            try {
                writeFileSync(path.join(unbuiltDir, 'mj-app.json'), JSON.stringify({ name: 'unbuilt', packages: { server: [{ name: '@dp-unbuilt/server', startupExport: 'Load' }] } }));
                const pkgDir = path.join(unbuiltDir, 'packages', 'Server');
                mkdirSync(pkgDir, { recursive: true });
                writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@dp-unbuilt/server', version: '1.0.0', type: 'module', main: 'dist/index.js' }));
                const log = recordingLogger();
                const report = await LoadDynamicPackages({ processId: 'cli:sync:push', config: {}, appManifestDir: unbuiltDir, log });
                expect(report.NotFound.map((n) => n.Entry.PackageName)).toEqual(['@dp-unbuilt/server']);
                expect(report.Failed).toEqual([]);
                expect(report.Loaded).toEqual([]);
                expect(log.warns).toEqual([]);
                expect(log.infos.some((l) => l.includes('@dp-unbuilt/server') && l.includes('not built') && l.includes('dist/index.js'))).toBe(true);
            } finally {
                rmSync(unbuiltDir, { recursive: true, force: true });
            }
        });

        it('warns (does not throw) when the manifest is unreadable', async () => {
            const brokenDir = mkdtempSync(path.join(tmpdir(), 'dp-apprepo3-'));
            try {
                writeFileSync(path.join(brokenDir, 'mj-app.json'), '{ nope');
                const log = recordingLogger();
                const report = await LoadDynamicPackages({ processId: 'mjapi', config: {}, appManifestDir: brokenDir, log });
                expect(report.Loaded).toEqual([]);
                expect(log.warns.some((w) => w.includes('Could not read') && w.includes('mj-app.json'))).toBe(true);
            } finally {
                rmSync(brokenDir, { recursive: true, force: true });
            }
        });
    });

    describe('StderrDynamicPackagesLogger', () => {
        it('writes progress and warnings to stderr and nothing to stdout', () => {
            const out: string[] = [];
            const err: string[] = [];
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { out.push(String(chunk)); return true; });
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { err.push(String(chunk)); return true; });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            try {
                StderrDynamicPackagesLogger.info('Loading Open App server packages...');
                StderrDynamicPackagesLogger.warn('  Error loading X:', new Error('boom'));
                StderrDynamicPackagesLogger.verbose?.('detail');
            } finally {
                stdoutSpy.mockRestore();
                stderrSpy.mockRestore();
                logSpy.mockRestore();
            }
            expect(out).toEqual([]);
            expect(logSpy).not.toHaveBeenCalled();
            expect(err).toEqual(['Loading Open App server packages...\n', '  Error loading X: boom\n']);
        });
    });

    describe('mergeCandidates', () => {
        const generated = { Source: 'generated' as const, Entry: { PackageName: '@x/a', Enabled: true } };
        const config = { Source: 'config' as const, Entry: { PackageName: '@x/a', Enabled: false, Processes: ['cli'] } };
        const manifest = { Source: 'manifest' as const, Entry: { PackageName: '@x/a', StartupExport: 'Load' }, WorkspaceHome: { RepoDir: '/repo', SourceDirectory: 'packages' } };

        it('keeps discovery order, one candidate per package, and reports the rest as duplicates', () => {
            const { candidates, duplicates } = mergeCandidates([generated, config, manifest]);
            expect(candidates).toHaveLength(1);
            expect(duplicates).toHaveLength(2);
        });

        it('lets the config entry decide Enabled/scoping while keeping the manifest location as the fallback', () => {
            const { candidates } = mergeCandidates([generated, config, manifest]);
            expect(candidates[0].Source).toBe('config');
            expect(candidates[0].Entry).toEqual(config.Entry);
            expect(candidates[0].WorkspaceHome).toEqual(manifest.WorkspaceHome);
        });

        it('does not mutate the inputs', () => {
            mergeCandidates([generated, manifest]);
            expect(generated.Source).toBe('generated');
            expect((generated as { WorkspaceHome?: unknown }).WorkspaceHome).toBeUndefined();
        });
    });
});
