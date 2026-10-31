import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';

const logStatusExCalls: Array<{ message: string; verboseOnly?: boolean }> = [];
const runViewSpy = vi.fn();

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        LogStatusEx: vi.fn((entry: { message: string; verboseOnly?: boolean }) => {
            logStatusExCalls.push(entry);
        }),
        RunView: class MockRunView {
            public RunView = runViewSpy;
        },
    };
});

import {
    DEFAULT_REST_API_OPTIONS,
    REST_API_BASE_PATH,
    SetupRESTEndpoints,
} from '../rest/setupRESTEndpoints.js';
import { OAuthCallbackHandler } from '../rest/OAuthCallbackHandler.js';
import type { UserInfo } from '@memberjunction/core';

function createSpyExpressApp(): { app: express.Application; useCalls: express.RequestHandler[][] } {
    const useCalls: express.RequestHandler[][] = [];
    const partialApp = {
        use: vi.fn((...args: express.RequestHandler[]) => {
            useCalls.push(args);
            return partialApp as express.Application;
        }),
    };
    return { app: partialApp as express.Application, useCalls };
}

describe('PR #6034 security hardening in MJServer', () => {
    beforeEach(() => {
        logStatusExCalls.length = 0;
        runViewSpy.mockReset();
    });

    describe('SetupRESTEndpoints fail-closed default & auth warning', () => {
        it('defaults DEFAULT_REST_API_OPTIONS.enabled to false and mounts nothing when called without options', () => {
            expect(DEFAULT_REST_API_OPTIONS.enabled).toBe(false);

            const { app, useCalls } = createSpyExpressApp();
            SetupRESTEndpoints(app);

            expect(useCalls).toHaveLength(0);
        });

        it('logs a non-verbose warning when enabled without a route-level authMiddleware', () => {
            const { app, useCalls } = createSpyExpressApp();
            SetupRESTEndpoints(app, { enabled: true });

            expect(useCalls).toHaveLength(1);
            expect(useCalls[0][0]).toBe(REST_API_BASE_PATH);
            const warning = logStatusExCalls.find((c) =>
                c.message.includes('WITHOUT a route-level auth middleware'),
            );
            expect(warning).toBeDefined();
            expect(warning?.verboseOnly).toBeUndefined();
        });

        it('mounts authMiddleware and omits the unauthenticated warning when authMiddleware is supplied', () => {
            const { app, useCalls } = createSpyExpressApp();
            const authMw: express.RequestHandler = (_req, _res, next) => next();

            SetupRESTEndpoints(app, { enabled: true }, authMw);

            expect(useCalls).toHaveLength(1);
            expect(useCalls[0]).toContain(authMw);
            const warning = logStatusExCalls.find((c) =>
                c.message.includes('WITHOUT a route-level auth middleware'),
            );
            expect(warning).toBeUndefined();
        });
    });

    describe('OAuthCallbackHandler UUID validation on ExtraFilter IDs', () => {
        it('refuses SQL injection connectionId before executing RunView', async () => {
            const handler = new OAuthCallbackHandler({ baseUrl: 'https://api.example.com' });
            const fakeUser = { ID: '00000000-0000-0000-0000-000000000001' } as UserInfo;

            const loader = Reflect.get(handler, 'loadConnectionConfig') as (
                connectionId: string,
                contextUser: UserInfo,
            ) => Promise<Record<string, string> | null>;

            const injectedResult = await loader.call(handler, "' OR '1'='1", fakeUser);
            expect(injectedResult).toBeNull();
            expect(runViewSpy).not.toHaveBeenCalled();
        });

        it('refuses non-UUID MCPServerID returned from connection lookup before querying servers', async () => {
            runViewSpy.mockResolvedValueOnce({
                Success: true,
                Results: [{ MCPServerID: "1234' UNION SELECT * FROM __mj.vwUsers --" }],
            });

            const handler = new OAuthCallbackHandler({ baseUrl: 'https://api.example.com' });
            const fakeUser = { ID: '00000000-0000-0000-0000-000000000001' } as UserInfo;
            const validConnId = '11111111-2222-3333-4444-555555555555';

            const loader = Reflect.get(handler, 'loadConnectionConfig') as (
                connectionId: string,
                contextUser: UserInfo,
            ) => Promise<Record<string, string> | null>;

            const result = await loader.call(handler, validConnId, fakeUser);
            expect(result).toBeNull();
            // First query ran with validated connectionId; second query was blocked before executing
            expect(runViewSpy).toHaveBeenCalledTimes(1);
        });
    });
});
