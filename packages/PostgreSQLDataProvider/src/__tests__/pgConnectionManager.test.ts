import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PGConnectionManager } from '../pgConnectionManager.js';

// Mock the pg module
vi.mock('pg', () => {
    const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release: vi.fn(),
    };

    class MockPool {
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
