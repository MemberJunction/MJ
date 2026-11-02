import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const { logErrorSpy } = vi.hoisted(() => ({
    logErrorSpy: vi.fn(),
}));

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
    RunView: class {},
    LogStatus: vi.fn(),
    LogError: logErrorSpy,
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

import { ComponentRegistryAPIServer } from '../Server.js';

class TestableRegistryServer extends ComponentRegistryAPIServer {
    public CallCheckAPIKey(req: Request): Promise<boolean> {
        return this.checkAPIKey(req);
    }

    public CallAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        return this.authMiddleware(req, res, next);
    }
}

class CustomKeyRegistryServer extends TestableRegistryServer {
    protected override async checkAPIKey(req: Request): Promise<boolean> {
        return req.headers['x-api-key'] === 'valid-registry-key';
    }
}

function createMockResponse(): {
    res: Response;
    getStatus: () => number;
    getBody: () => Record<string, string> | null;
} {
    let statusCode = 200;
    let jsonBody: Record<string, string> | null = null;
    const partialRes: Partial<Response> = {
        status(code: number): Response {
            statusCode = code;
            return partialRes as Response;
        },
        json(body: Record<string, string>): Response {
            jsonBody = body;
            return partialRes as Response;
        },
    };
    return {
        res: partialRes as Response,
        getStatus: () => statusCode,
        getBody: () => jsonBody,
    };
}

describe('ComponentRegistryAPIServer fail-closed authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fails closed (returns false and logs error) when base checkAPIKey is not overridden', async () => {
        const server = new TestableRegistryServer({ mode: 'router', skipDatabaseSetup: true });
        const req = { headers: { 'x-api-key': 'anything' } } as Partial<Request> as Request;

        const allowed = await server.CallCheckAPIKey(req);

        expect(allowed).toBe(false);
        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        expect(String(logErrorSpy.mock.calls[0][0])).toContain('requireAuth is enabled');
    });

    it('returns 401 Unauthorized from authMiddleware when base checkAPIKey fails closed', async () => {
        const server = new TestableRegistryServer({ mode: 'router', skipDatabaseSetup: true });
        const req = { headers: {} } as Partial<Request> as Request;
        const mockRes = createMockResponse();
        const next = vi.fn();

        await server.CallAuthMiddleware(req, mockRes.res, next);

        expect(next).not.toHaveBeenCalled();
        expect(mockRes.getStatus()).toBe(401);
        expect(mockRes.getBody()).toEqual({ error: 'Unauthorized' });
    });

    it('protects both /components and /feedback routes when requireAuth is enabled', async () => {
        const server = new TestableRegistryServer({ mode: 'router', skipDatabaseSetup: true });
        await server.Initialize();
        const router = server.GetRouter();
        const stack = Reflect.get(router, 'stack') as Array<{ name?: string }>;

        // Express 5 router layers include bound authMiddleware layers before route handlers
        const authLayers = stack.filter((layer) => layer.name === 'bound authMiddleware');
        expect(authLayers.length).toBeGreaterThanOrEqual(2);
    });

    it('admits valid requests and rejects invalid ones when subclass overrides checkAPIKey', async () => {
        const server = new CustomKeyRegistryServer({ mode: 'router', skipDatabaseSetup: true });

        const okReq = { headers: { 'x-api-key': 'valid-registry-key' } } as Partial<Request> as Request;
        const okRes = createMockResponse();
        const okNext = vi.fn();
        await server.CallAuthMiddleware(okReq, okRes.res, okNext);
        expect(okNext).toHaveBeenCalledTimes(1);

        const badReq = { headers: { 'x-api-key': 'wrong' } } as Partial<Request> as Request;
        const badRes = createMockResponse();
        const badNext = vi.fn();
        await server.CallAuthMiddleware(badReq, badRes.res, badNext);
        expect(badNext).not.toHaveBeenCalled();
        expect(badRes.getStatus()).toBe(401);
    });
});
