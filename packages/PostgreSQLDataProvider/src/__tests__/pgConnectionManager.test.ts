import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PGConnectionManager } from '../pgConnectionManager.js';

// Mock the pg module
vi.mock('pg', () => {
    const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release: vi.fn(),
    };

    class MockPool {
        static lastConfig: Record<string, unknown> | undefined;
        static lastInstance: MockPool | undefined;
        /** Listeners attached via .on(), by event name — stands in for the EventEmitter. */
        listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        constructor(config?: Record<string, unknown>) {
            MockPool.lastConfig = config;
            MockPool.lastInstance = this;
        }
        on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            (this.listeners[event] ??= []).push(handler);
            return this;
        });
        /** Emits like node-pg would; returns false when nothing is listening, as EventEmitter does. */
        emit(event: string, ...args: unknown[]): boolean {
            const handlers = this.listeners[event];
            if (!handlers || handlers.length === 0) return false;
            for (const h of handlers) h(...args);
            return true;
        }
        connect = vi.fn().mockResolvedValue(mockClient);
        query = vi.fn().mockResolvedValue({ rows: [] });
        end = vi.fn().mockResolvedValue(undefined);
    }

    return {
        default: {
            Pool: MockPool,
        },
    };
});

import pg from 'pg';

describe('PGConnectionManager', () => {
    let manager: PGConnectionManager;

    beforeEach(() => {
        manager = new PGConnectionManager();
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('should not be connected initially', () => {
            expect(manager.IsConnected).toBe(false);
        });

        it('should have null config initially', () => {
            expect(manager.Config).toBeNull();
        });

        it('should throw when accessing Pool before initialization', () => {
            expect(() => manager.Pool).toThrow('not initialized');
        });
    });

    describe('Initialize', () => {
        it('should initialize with valid config', async () => {
            await manager.Initialize({
                Host: 'localhost',
                Port: 5432,
                Database: 'testdb',
                User: 'user',
                Password: 'pass',
            });

            expect(manager.IsConnected).toBe(true);
            expect(manager.Config).not.toBeNull();
        });

        it('should configure numeric type parsers on the pool', async () => {
            await manager.Initialize({
                Host: 'localhost',
                Database: 'testdb',
                User: 'user',
                Password: 'pass',
            });

            const lastConfig = (pg.Pool as unknown as { lastConfig?: Record<string, unknown> }).lastConfig;
            expect(lastConfig?.types).toBeDefined();
            const types = lastConfig?.types as { getTypeParser: (oid: number, format?: string) => (v: string) => unknown };
            expect(types.getTypeParser(1700, 'text')('0.0091')).toBe(0.0091);
            expect(types.getTypeParser(20, 'text')('16972')).toBe(16972);
        });

        // An idle pooled socket that the network resets used to kill the whole process:
        // node-pg re-emits the socket error as an 'error' event on the Pool, and with no
        // listener Node treats that as an unhandled 'error' event and exits. A long CodeGen
        // run died that way ~2.4 minutes into "Managing entity fields" with `read ECONNRESET`
        // / "Unhandled 'error' event ... on BoundPool", with nothing wrong with the schema.
        describe('idle-connection resilience', () => {
            const baseConfig = { Host: 'localhost', Database: 'testdb', User: 'user', Password: 'pass' };

            it('enables TCP keepalive on the pool so an idle socket is not silently dropped', async () => {
                await manager.Initialize(baseConfig);

                const lastConfig = (pg.Pool as unknown as { lastConfig?: Record<string, unknown> }).lastConfig;
                expect(lastConfig?.keepAlive).toBe(true);
                expect(lastConfig?.keepAliveInitialDelayMillis).toBe(10000);
            });

            it("attaches an 'error' listener to the pool it creates", async () => {
                await manager.Initialize(baseConfig);

                const pool = manager.Pool as unknown as {
                    on: { mock: { calls: unknown[][] } };
                    listeners: Record<string, unknown[]>;
                };
                expect(pool.on.mock.calls.some((c) => c[0] === 'error')).toBe(true);
                expect(pool.listeners['error']?.length ?? 0).toBeGreaterThan(0);
            });

            it('an idle-client error is handled, not thrown — the run survives it', async () => {
                const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
                try {
                    await manager.Initialize(baseConfig);

                    const pool = manager.Pool as unknown as { emit: (e: string, ...a: unknown[]) => boolean };
                    // `emit` returning true is exactly what stops Node from treating this as an
                    // unhandled 'error' event and terminating the process.
                    expect(() => {
                        expect(pool.emit('error', new Error('read ECONNRESET'))).toBe(true);
                    }).not.toThrow();

                    expect(warn).toHaveBeenCalled();
                    expect(String(warn.mock.calls[0][0])).toContain('ECONNRESET');
                } finally {
                    warn.mockRestore();
                }
            });

            it('does not attach a listener to a pool it does not own', () => {
                // per-request providers share the primary pool; attaching here would add one
                // listener per provider and trip Node's max-listeners warning.
                const shared = new (pg.Pool as unknown as new () => { on: { mock: { calls: unknown[][] } } })();
                manager.InitializeWithExistingPool(
                    shared as unknown as Parameters<typeof manager.InitializeWithExistingPool>[0],
                    baseConfig
                );
                expect(shared.on.mock.calls.some((c) => c[0] === 'error')).toBe(false);
            });
        });

        it('should store the config', async () => {
            const config = {
                Host: 'localhost',
                Port: 5433,
                Database: 'mydb',
                User: 'admin',
                Password: 'secret',
            };

            await manager.Initialize(config);
            expect(manager.Config?.Host).toBe('localhost');
            expect(manager.Config?.Database).toBe('mydb');
        });
    });

    describe('Close', () => {
        it('should close the pool', async () => {
            await manager.Initialize({
                Host: 'localhost',
                Database: 'testdb',
                User: 'user',
                Password: 'pass',
            });

            expect(manager.IsConnected).toBe(true);
            await manager.Close();
            expect(manager.IsConnected).toBe(false);
        });

        it('should be safe to call Close when not initialized', async () => {
            await expect(manager.Close()).resolves.not.toThrow();
        });
    });

    describe('AcquireClient', () => {
        it('should acquire a client from the pool', async () => {
            await manager.Initialize({
                Host: 'localhost',
                Database: 'testdb',
                User: 'user',
                Password: 'pass',
            });

            const client = await manager.AcquireClient();
            expect(client).toBeDefined();
            expect(client.query).toBeDefined();
        });
    });

    describe('Query', () => {
        it('should execute a query using the pool', async () => {
            await manager.Initialize({
                Host: 'localhost',
                Database: 'testdb',
                User: 'user',
                Password: 'pass',
            });

            const result = await manager.Query('SELECT 1');
            expect(result.rows).toBeDefined();
        });
    });
});
