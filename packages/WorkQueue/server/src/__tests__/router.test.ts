import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { UserInfo } from '@memberjunction/core';
import type { PublishResult } from '@memberjunction/work-queue-core';
import { CreateWorkQueuePublishRouter } from '../router';
import type { WorkQueueRequestPayload } from '../router';
import type { WorkQueuePublishDependencies } from '../publishHandler';

const USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001' } as UserInfo;
const servers: Server[] = [];

interface Started {
    Url: string;
    Published: string[];
    ScopeChecks: string[];
}

/** An app that fakes MJServer's unified auth by setting req.userPayload, then mounts the real router. */
async function start(payload: WorkQueueRequestPayload | undefined, allowScope = true, bodyLimit = '1kb'): Promise<Started> {
    const published: string[] = [];
    const scopeChecks: string[] = [];
    const dependencies: WorkQueuePublishDependencies = {
        GetEngine: async () => ({
            GetTopicByName: name => (name === 'email.events' ? { Name: 'email.events', AllowExternalPublish: true } : undefined),
            PublishAs: async (topic, requests): Promise<PublishResult[]> => {
                published.push(topic);
                return requests.map((_r, i) => ({ MessageID: `m-${i}`, Status: 'Accepted' as const }));
            },
        }),
        Authorizer: {
            Authorize: async (_hash, _scope, resource) => {
                scopeChecks.push(resource);
                return { Allowed: allowScope, Reason: allowScope ? 'ok' : 'no matching rule' };
            },
        },
        Settings: { MaxBatch: 100, BodyLimit: bodyLimit },
        Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined },
    };
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload = payload;
        next();
    });
    app.use('/work-queue', CreateWorkQueuePublishRouter(dependencies));
    const server = await new Promise<Server>(resolve => {
        const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    return { Url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/work-queue/topics/email.events/messages`, Published: published, ScopeChecks: scopeChecks };
}

function post(url: string, body: string): Promise<globalThis.Response> {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('work queue publish router', () => {
    it('reads the user and API key hash from req.userPayload and publishes', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' });
        const response = await post(app.Url, JSON.stringify({ messages: [{ payload: { n: 1 } }] }));
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ results: [{ messageId: 'm-0', status: 'Accepted' }] });
        expect([app.ScopeChecks, app.Published]).toEqual([['email.events'], ['email.events']]);
    });

    it('answers 401 without a user and 403 for a session that has no API key', async () => {
        expect((await post((await start(undefined)).Url, '{}')).status).toBe(401);
        expect((await post((await start({ userRecord: USER })).Url, '{}')).status).toBe(403);
    });

    it('refuses an unauthorized caller BEFORE parsing the body: an oversized body still gets 403, not 413', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' }, false);
        const response = await post(app.Url, JSON.stringify({ messages: [{ payload: { blob: 'x'.repeat(5000) } }] }));
        expect(response.status).toBe(403);
    });

    it('answers 413 for an oversized body and 400 for malformed JSON once the caller is authorized, as JSON', async () => {
        const app = await start({ userRecord: USER, apiKeyHash: 'hash-1' });
        const large = await post(app.Url, JSON.stringify({ messages: [{ payload: { blob: 'x'.repeat(5000) } }] }));
        expect([large.status, await large.json()]).toEqual([413, { error: 'Request body exceeds 1kb' }]);
        const malformed = await post(app.Url, '{ not json');
        expect([malformed.status, await malformed.json()]).toEqual([400, { error: 'Request body must be valid JSON' }]);
        expect(app.Published).toEqual([]);
    });
});
