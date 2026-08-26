import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/server', () => ({
    serve: vi.fn().mockResolvedValue(undefined),
    MJServerOptions: class {},
    configInfo: {},
}));

vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({
        search: vi.fn().mockReturnValue({
            config: {
                codeGeneration: {
                    packages: {
                        entities: { name: '@test/generated-entities' },
                        actions: { name: '@test/generated-actions' },
                    },
                },
            },
            filepath: '/test/mj.config.cjs',
            isEmpty: false,
        }),
    }),
}));

// Fake installed Open App server packages. Each exports RESOLVER_PATHS (the convention the
// app-server CodeGen emits: "absolute paths to the generated resolver files, for use with
// createMJServer()") plus a `load` startup export.
const ENABLED_APP_RESOLVER = '/abs/node_modules/@test/openapp-server/dist/generated/generated.js';
const DISABLED_APP_RESOLVER = '/abs/node_modules/@test/disabled-server/dist/generated/generated.js';
const OPENAPP_EXTENSION = {
    Enabled: true,
    DriverClass: 'TestOpenAppEdge',
    RootPath: '/test-openapp',
    Settings: {},
};
vi.mock('@test/openapp-server', () => ({
    RESOLVER_PATHS: [ENABLED_APP_RESOLVER],
    load: vi.fn(),
    MJ_SERVER_EXTENSIONS: [OPENAPP_EXTENSION],
}));
vi.mock('@test/disabled-server', () => ({ RESOLVER_PATHS: [DISABLED_APP_RESOLVER], load: vi.fn() }));

import { createMJServer, MJServerConfig } from '../index';
import { serve } from '@memberjunction/server';
import { cosmiconfigSync } from 'cosmiconfig';

describe('ServerBootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createMJServer', () => {
        it('should be a function', () => {
            expect(typeof createMJServer).toBe('function');
        });

        it('should call cosmiconfigSync with mj module name', async () => {
            await createMJServer();
            expect(cosmiconfigSync).toHaveBeenCalledWith('mj', expect.objectContaining({
                searchStrategy: 'global',
            }));
        });

        it('should call serve with default resolver paths when none provided', async () => {
            await createMJServer();
            expect(serve).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.stringContaining('generated.{js,ts}'),
                ]),
                undefined,
                expect.objectContaining({}),
            );
        });

        it('should call serve with custom resolver paths when provided', async () => {
            const customPaths = ['./custom/**/*Resolver.ts'];
            await createMJServer({ resolverPaths: customPaths });
            expect(serve).toHaveBeenCalledWith(
                customPaths,
                undefined,
                expect.objectContaining({}),
            );
        });

        it('should call beforeStart hook if provided', async () => {
            const beforeStart = vi.fn();
            await createMJServer({ beforeStart });
            expect(beforeStart).toHaveBeenCalled();
        });

        it('should call afterStart hook if provided', async () => {
            const afterStart = vi.fn();
            await createMJServer({ afterStart });
            expect(afterStart).toHaveBeenCalled();
        });

        it('should pass restApiOptions to serve', async () => {
            const restApiOptions = { enabled: true };
            await createMJServer({ restApiOptions } as MJServerConfig);
            expect(serve).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                expect.objectContaining({ restApiOptions }),
            );
        });

        it('should use custom configPath when provided', async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {},
                filepath: '/custom/path/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer({ configPath: '/custom/path' });
            expect(mockSearch).toHaveBeenCalledWith('/custom/path');
        });

        it('tolerates a missing Open App server package and still boots (never crashes)', async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [
                            { PackageName: '@nonexistent/openapp-server', StartupExport: 'load', Enabled: true },
                        ],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            // import() of a non-existent package throws ERR_MODULE_NOT_FOUND; the loader
            // must swallow it so boot proceeds (serve still called).
            await expect(createMJServer()).resolves.toBeUndefined();
            expect(serve).toHaveBeenCalled();
        });

        it("surfaces a found package's missing TRANSITIVE dependency on the warn path, not the lossy 'not found' line", async () => {
            // A real on-disk host: the package RESOLVES from the config-file anchor but its own
            // module graph is broken (imports a missing dep) — the ts-node/pnpm next-failure shape.
            const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
            const { tmpdir } = await import('node:os');
            const path = (await import('node:path')).default;
            const hostDir = mkdtempSync(path.join(tmpdir(), 'sb-transitive-'));
            try {
                const pkgDir = path.join(hostDir, 'node_modules', '@sbtest', 'broken');
                mkdirSync(pkgDir, { recursive: true });
                writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@sbtest/broken', version: '1.0.0', type: 'module', main: 'index.js' }));
                writeFileSync(path.join(pkgDir, 'index.js'), "import 'sbtest-definitely-missing-transitive-dep';");
                const mockSearch = vi.fn().mockReturnValue({
                    config: { dynamicPackages: { server: [{ PackageName: '@sbtest/broken', Enabled: true }] } },
                    filepath: path.join(hostDir, 'mj.config.cjs'),
                    isEmpty: false,
                });
                (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
                const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

                await expect(createMJServer()).resolves.toBeUndefined();

                // The failure names the missing TRANSITIVE dep — it must reach the operator via
                // console.warn with the true cause, not be swallowed by the friendly line.
                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Error loading Open App server package @sbtest/broken'),
                    expect.objectContaining({ message: expect.stringContaining('sbtest-definitely-missing-transitive-dep') }),
                );
                expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("not found (run 'npm install'?)"));
                warnSpy.mockRestore();
                logSpy.mockRestore();
            } finally {
                rmSync(hostDir, { recursive: true, force: true });
            }
        });

        it("prints the friendly 'not found' line (and does NOT warn) when the package itself is genuinely missing", async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@nonexistent/genuinely-missing-server', Enabled: true }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

            await expect(createMJServer()).resolves.toBeUndefined();

            // The mirror of the transitive-dep test: when the error's quoted subject IS this
            // package, the benign friendly line fires and the scary warn path stays silent.
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining("not found (run 'npm install'?): @nonexistent/genuinely-missing-server"),
            );
            expect(warnSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('Error loading Open App server package @nonexistent/genuinely-missing-server'),
                expect.anything(),
            );
            warnSpy.mockRestore();
            logSpy.mockRestore();
        });

        it('skips disabled Open App server packages', async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@nonexistent/disabled-server', Enabled: false }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await expect(createMJServer()).resolves.toBeUndefined();
            expect(serve).toHaveBeenCalled();
        });

        it("passes an enabled app's RESOLVER_PATHS to serve() so its GraphQL ops enter the schema", async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@test/openapp-server', StartupExport: 'load', Enabled: true }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();

            // The app package's resolver file must be in serve()'s glob set — otherwise its
            // mutations/queries register type-graphql metadata but never enter the schema.
            const servePaths = (serve as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
            expect(servePaths).toContain(ENABLED_APP_RESOLVER);
            // The standard base globs are still present.
            expect(servePaths.some((p) => p.includes('generated.{js,ts}'))).toBe(true);
        });

        it("does NOT pass a disabled app's RESOLVER_PATHS to serve()", async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@test/disabled-server', StartupExport: 'load', Enabled: false }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();

            const servePaths = (serve as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
            expect(servePaths).not.toContain(DISABLED_APP_RESOLVER);
        });

        it("passes an enabled app's MJ_SERVER_EXTENSIONS to serve() as options.serverExtensions", async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@test/openapp-server', StartupExport: 'load', Enabled: true }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();

            const serveOptions = (serve as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
                serverExtensions: Array<{ DriverClass: string; RootPath: string }>;
            };
            expect(serveOptions.serverExtensions).toEqual([
                expect.objectContaining({
                    DriverClass: 'TestOpenAppEdge',
                    RootPath: '/test-openapp',
                    Enabled: true,
                }),
            ]);
        });

        it('does NOT merge host serverExtensions into options — serve() overlays those itself', async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    serverExtensions: [
                        {
                            Enabled: true,
                            DriverClass: 'SlackMessagingExtension',
                            RootPath: '/webhook/slack',
                            Settings: {},
                        },
                    ],
                    dynamicPackages: {
                        server: [{ PackageName: '@test/openapp-server', StartupExport: 'load', Enabled: true }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();

            const serveOptions = (serve as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
                serverExtensions: Array<{ DriverClass: string }>;
            };
            expect(serveOptions.serverExtensions.map((e) => e.DriverClass)).toEqual(['TestOpenAppEdge']);
            expect(serveOptions.serverExtensions.map((e) => e.DriverClass)).not.toContain('SlackMessagingExtension');
        });

        it("does NOT pass a disabled app's serverExtensions to serve()", async () => {
            const mockSearch = vi.fn().mockReturnValue({
                config: {
                    dynamicPackages: {
                        server: [{ PackageName: '@test/disabled-server', StartupExport: 'load', Enabled: false }],
                    },
                },
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();

            const serveOptions = (serve as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
                serverExtensions: unknown[];
            };
            expect(serveOptions.serverExtensions).toEqual([]);
        });

        it("falls back to package.json memberjunction.serverExtensions when the module has no MJ_SERVER_EXTENSIONS export", async () => {
            const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
            const { tmpdir } = await import('node:os');
            const path = (await import('node:path')).default;
            const hostDir = mkdtempSync(path.join(tmpdir(), 'sb-ext-json-'));
            try {
                const pkgDir = path.join(hostDir, 'node_modules', '@sbtest', 'ext-json');
                mkdirSync(pkgDir, { recursive: true });
                writeFileSync(
                    path.join(pkgDir, 'package.json'),
                    JSON.stringify({
                        name: '@sbtest/ext-json',
                        version: '1.0.0',
                        type: 'module',
                        main: 'index.js',
                        memberjunction: {
                            serverExtensions: [
                                {
                                    Enabled: true,
                                    DriverClass: 'FromPackageJson',
                                    RootPath: '/from-pkg',
                                    Settings: { via: 'package.json' },
                                },
                            ],
                        },
                    }),
                );
                writeFileSync(path.join(pkgDir, 'index.js'), 'export const ok = true;');
                const mockSearch = vi.fn().mockReturnValue({
                    config: { dynamicPackages: { server: [{ PackageName: '@sbtest/ext-json', Enabled: true }] } },
                    filepath: path.join(hostDir, 'mj.config.cjs'),
                    isEmpty: false,
                });
                (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

                await createMJServer();

                const serveOptions = (serve as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
                    serverExtensions: Array<{ DriverClass: string; RootPath: string; Settings: Record<string, unknown> }>;
                };
                expect(serveOptions.serverExtensions).toEqual([
                    {
                        Enabled: true,
                        DriverClass: 'FromPackageJson',
                        RootPath: '/from-pkg',
                        Settings: { via: 'package.json' },
                    },
                ]);
            } finally {
                rmSync(hostDir, { recursive: true, force: true });
            }
        });

        it('passes only the base resolver globs to serve() when no apps are installed', async () => {
            // Explicit no-dynamicPackages config → serve() gets exactly the base globs, no extras.
            const mockSearch = vi.fn().mockReturnValue({
                config: {},
                filepath: '/test/mj.config.cjs',
                isEmpty: false,
            });
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

            await createMJServer();
            const servePaths = (serve as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
            expect(servePaths.length).toBeGreaterThan(0);
            expect(servePaths.every((p) => p.includes('generated.{js,ts}'))).toBe(true);
            const serveOptions = (serve as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
                serverExtensions: unknown[];
            };
            expect(serveOptions.serverExtensions).toEqual([]);
        });
    });

    describe('MJServerConfig interface', () => {
        it('should accept empty config object', async () => {
            const config: MJServerConfig = {};
            expect(config).toBeDefined();
            expect(config.configPath).toBeUndefined();
            expect(config.resolverPaths).toBeUndefined();
            expect(config.beforeStart).toBeUndefined();
            expect(config.afterStart).toBeUndefined();
        });

        it('should accept all optional properties', () => {
            const config: MJServerConfig = {
                configPath: '/test/config',
                resolverPaths: ['./resolvers/**/*.ts'],
                beforeStart: async () => {},
                afterStart: async () => {},
            };
            expect(config.configPath).toBe('/test/config');
            expect(config.resolverPaths).toHaveLength(1);
        });
    });
});
