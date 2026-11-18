import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import type { Socket } from 'node:net';
import { CreateRunCodeGenHandler, RequireCodeGenAuth, ResolveCodeGenBindHost } from '../codegenRunRoute';

interface MockResponseState {
    statusCode: number;
    jsonBody: Record<string, string> | null;
    res: express.Response;
}

function createMockRequest(options: {
    headers?: IncomingHttpHeaders;
    remoteAddress?: string;
}): express.Request {
    const socket = { remoteAddress: options.remoteAddress } as Partial<Socket>;
    const req = {
        headers: options.headers ?? {},
        socket: socket as Socket,
    } as Partial<express.Request>;
    return req as express.Request;
}

function createMockResponse(): MockResponseState {
    const state: MockResponseState = {
        statusCode: 200,
        jsonBody: null,
        res: {} as express.Response,
    };
    const partialRes: Partial<express.Response> = {
        status(code: number): express.Response {
            state.statusCode = code;
            return state.res;
        },
        json(body: Record<string, string>): express.Response {
            state.jsonBody = body;
            return state.res;
        },
    };
    state.res = partialRes as express.Response;
    return state;
}

describe('MJCodeGenAPI codegenRunRoute security & single-flight behavior', () => {
    const originalApiKey = process.env.MJ_CODEGEN_API_KEY;
    const originalBindHost = process.env.MJ_CODEGEN_BIND_HOST;

    beforeEach(() => {
        delete process.env.MJ_CODEGEN_API_KEY;
        delete process.env.MJ_CODEGEN_BIND_HOST;
    });

    afterEach(() => {
        if (originalApiKey === undefined) {
            delete process.env.MJ_CODEGEN_API_KEY;
        } else {
            process.env.MJ_CODEGEN_API_KEY = originalApiKey;
        }
        if (originalBindHost === undefined) {
            delete process.env.MJ_CODEGEN_BIND_HOST;
        } else {
            process.env.MJ_CODEGEN_BIND_HOST = originalBindHost;
        }
    });

    describe('ResolveCodeGenBindHost', () => {
        it('defaults to 127.0.0.1 when MJ_CODEGEN_API_KEY is unset', () => {
            expect(ResolveCodeGenBindHost({})).toBe('127.0.0.1');
            expect(ResolveCodeGenBindHost({ MJ_CODEGEN_API_KEY: '   ' })).toBe('127.0.0.1');
        });

        it('returns undefined when MJ_CODEGEN_API_KEY is configured and MJ_CODEGEN_BIND_HOST is unset', () => {
            expect(ResolveCodeGenBindHost({ MJ_CODEGEN_API_KEY: 'secret-token' })).toBeUndefined();
        });

        it('honors explicit MJ_CODEGEN_BIND_HOST override', () => {
            expect(ResolveCodeGenBindHost({ MJ_CODEGEN_BIND_HOST: '0.0.0.0' })).toBe('0.0.0.0');
        });
    });

    describe('RequireCodeGenAuth', () => {
        it('accepts matching x-mj-codegen-api-key header when MJ_CODEGEN_API_KEY is configured', () => {
            process.env.MJ_CODEGEN_API_KEY = 'super-secret-codegen-key';
            const req = createMockRequest({
                headers: { 'x-mj-codegen-api-key': 'super-secret-codegen-key' },
                remoteAddress: '10.20.30.40',
            });
            const mockRes = createMockResponse();
            const next = vi.fn();

            RequireCodeGenAuth(req, mockRes.res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(mockRes.jsonBody).toBeNull();
        });

        it('rejects wrong, missing, or multi-valued x-mj-codegen-api-key headers even from loopback when key is set', () => {
            process.env.MJ_CODEGEN_API_KEY = 'super-secret-codegen-key';

            const cases: IncomingHttpHeaders[] = [
                { 'x-mj-codegen-api-key': 'wrong-key' },
                { 'x-mj-codegen-api-key': 'super-secret-codegen-key-extra' },
                {},
                { 'x-mj-codegen-api-key': ['super-secret-codegen-key', 'second'] },
            ];

            for (const headers of cases) {
                const req = createMockRequest({ headers, remoteAddress: '127.0.0.1' });
                const mockRes = createMockResponse();
                const next = vi.fn();

                RequireCodeGenAuth(req, mockRes.res, next);

                expect(next).not.toHaveBeenCalled();
                expect(mockRes.statusCode).toBe(401);
                expect(mockRes.jsonBody?.status).toBe('error');
            }
        });

        it('allows IPv4 and IPv6 loopback callers when MJ_CODEGEN_API_KEY is unset', () => {
            for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
                const req = createMockRequest({ remoteAddress: ip });
                const mockRes = createMockResponse();
                const next = vi.fn();

                RequireCodeGenAuth(req, mockRes.res, next);

                expect(next).toHaveBeenCalledTimes(1);
            }
        });

        it('rejects non-loopback callers with 401 when MJ_CODEGEN_API_KEY is unset', () => {
            for (const ip of ['192.168.1.50', '10.0.0.4', '::ffff:10.0.0.4', '']) {
                const req = createMockRequest({ remoteAddress: ip });
                const mockRes = createMockResponse();
                const next = vi.fn();

                RequireCodeGenAuth(req, mockRes.res, next);

                expect(next).not.toHaveBeenCalled();
                expect(mockRes.statusCode).toBe(401);
                expect(mockRes.jsonBody?.errorMessage).toContain('MJ_CODEGEN_API_KEY');
            }
        });
    });

    describe('CreateRunCodeGenHandler', () => {
        it('returns 202 Accepted, rejects overlapping calls with 409, and resets latch on completion', async () => {
            let resolveRun: (() => void) | undefined;
            const runCodeGen = vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        resolveRun = resolve;
                    }),
            );
            const handler = CreateRunCodeGenHandler(runCodeGen);
            const req = createMockRequest({ remoteAddress: '127.0.0.1' });

            const firstRes = createMockResponse();
            await handler(req, firstRes.res);
            expect(firstRes.statusCode).toBe(202);
            expect(firstRes.jsonBody).toEqual({ status: 'accepted' });

            const overlappingRes = createMockResponse();
            await handler(req, overlappingRes.res);
            expect(overlappingRes.statusCode).toBe(409);
            expect(runCodeGen).toHaveBeenCalledTimes(1);

            resolveRun?.();
            await new Promise<void>((r) => setImmediate(r));

            const afterSettleRes = createMockResponse();
            await handler(req, afterSettleRes.res);
            expect(afterSettleRes.statusCode).toBe(202);
            expect(runCodeGen).toHaveBeenCalledTimes(2);
            resolveRun?.();
        });

        it('resets the single-flight latch even when a background CodeGen run rejects', async () => {
            const onBackgroundError = vi.fn();
            let shouldFail = true;
            const runCodeGen = vi.fn(async () => {
                if (shouldFail) {
                    throw new Error('DDL failure');
                }
            });
            const handler = CreateRunCodeGenHandler(runCodeGen, onBackgroundError);
            const req = createMockRequest({ remoteAddress: '127.0.0.1' });

            const firstRes = createMockResponse();
            await handler(req, firstRes.res);
            expect(firstRes.statusCode).toBe(202);

            await new Promise<void>((r) => setImmediate(r));
            expect(onBackgroundError).toHaveBeenCalledTimes(1);

            shouldFail = false;
            const secondRes = createMockResponse();
            await handler(req, secondRes.res);
            expect(secondRes.statusCode).toBe(202);
            expect(runCodeGen).toHaveBeenCalledTimes(2);
        });
    });
});
