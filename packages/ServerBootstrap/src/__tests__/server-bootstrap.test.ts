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
vi.mock('@test/openapp-server', () => ({ RESOLVER_PATHS: [ENABLED_APP_RESOLVER], load: vi.fn() }));
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
