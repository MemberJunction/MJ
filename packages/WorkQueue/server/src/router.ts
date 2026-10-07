import express, { Router } from 'express';
import type { Request, Response } from 'express';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJWorkLogger, WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { HandleWorkQueuePublish } from './publishHandler';
import type { WorkQueuePublishDependencies } from './publishHandler';
import type { WorkQueueServerSettings } from './publishRequests';
import { APIKeyScopeAuthorizer } from './scopeAuthorizer';

/** The fields MJServer's unified auth middleware sets on req.userPayload that this endpoint reads. */
export interface WorkQueueRequestPayload {
    userRecord?: UserInfo;
    apiKeyHash?: string;
}

export function CreateDefaultPublishDependencies(settings: WorkQueueServerSettings): WorkQueuePublishDependencies {
    return {
        GetEngine: async () => {
            // Configure as the SYSTEM user. Config is first-caller-wins for the engine's identity, so configuring
            // with the request's user would make an arbitrary API-key user the engine's context user whenever the
            // host is disabled in this process (03 §9).
            const systemUser = UserCache.Instance.GetSystemUser();
            if (!systemUser) {
                throw new Error('System user not found');
            }
            await WorkQueueEngine.Instance.Config(false, systemUser);
            return WorkQueueEngine.Instance;
        },
        Authorizer: new APIKeyScopeAuthorizer(),
        Settings: settings,
        Log: new MJWorkLogger('[WorkQueue:REST]'),
    };
}

export function CreateWorkQueuePublishRouter(dependencies: WorkQueuePublishDependencies): Router {
    const router = Router();
    const parseJson = express.json({ limit: dependencies.Settings.BodyLimit });
    // No body-parsing middleware on the route: the handler pulls the body through ReadBody only after
    // authentication and the scope check, so an unauthorized caller cannot make the server parse 30 MB (03 §9).
    router.post('/topics/:topic/messages', async (req: Request, res: Response) => {
        const payload = (req as Request & { userPayload?: WorkQueueRequestPayload }).userPayload;
        const result = await HandleWorkQueuePublish({
            TopicName: String(req.params.topic ?? ''),
            User: payload?.userRecord,
            ApiKeyHash: payload?.apiKeyHash,
            Path: req.originalUrl,
            ReadBody: () => new Promise<unknown>((resolve, reject) => {
                parseJson(req, res, (error?: unknown) => (error ? reject(error) : resolve(req.body)));
            }),
        }, dependencies);
        res.status(result.Status).json(result.Body);
    });
    return router;
}
