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
