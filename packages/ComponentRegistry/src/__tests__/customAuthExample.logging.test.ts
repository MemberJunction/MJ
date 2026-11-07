import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

vi.mock('../config.js', () => ({
    configInfo: {},
    componentRegistrySettings: {
        port: 3300,
        enableRegistry: true,
        requireAuth: true,
        corsOrigins: ['http://localhost:4200'],
    },
    dbDatabase: 'TestDB',
    dbHost: 'localhost',
    dbPort: 1433,
    dbUsername: 'sa',
    DbReadOnlyUsername: '',
    DbReadOnlyPassword: '',
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    RunView: class {
        async RunView(): Promise<{ Success: boolean; Results: { Token: string }[] }> {
            return { Success: true, Results: [] };
        }
    },
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJComponentEntity: class {},
    MJComponentRegistryEntity: class {},
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    setupSQLServerClient: vi.fn(),
    SQLServerProviderConfigData: class {},
}));

vi.mock('@memberjunction/dynamic-packages', () => ({
    DiscoverMJConfig: vi.fn(),
    LoadDynamicPackages: vi.fn(),
}));

import { AuthenticatedRegistryServer } from '../../examples/custom-auth-server.js';

class TestableAuthenticatedServer extends AuthenticatedRegistryServer {
    public CallCheckAPIKey(req: Request): Promise<boolean> {
        return this.checkAPIKey(req);
    }
}

describe('custom-auth-server example logging', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs a caller-supplied token prefix as one line', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const server = new TestableAuthenticatedServer({ mode: 'router', skipDatabaseSetup: true });
        const req = { headers: { authorization: 'Bearer a\r\n[ERROR] forged' } } as Partial<Request> as Request;

        await server.CallCheckAPIKey(req);

        const lines = logSpy.mock.calls.flat().filter((a): a is string => typeof a === 'string');
        expect(lines.some((l) => l.startsWith('Invalid token attempted:'))).toBe(true);
        expect(lines.some((l) => /[\r\n]/.test(l))).toBe(false);
    });
});
