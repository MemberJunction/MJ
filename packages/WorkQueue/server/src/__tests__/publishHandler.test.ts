import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { PublishRequest, PublishResult, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueuePublishOptions } from '@memberjunction/work-queue-engine';
import { HandleWorkQueuePublish } from '../publishHandler';
import type { WorkQueuePublishDependencies, WorkQueuePublishEngine, WorkQueuePublishHttpRequest, WorkQueuePublishTopic } from '../publishHandler';
import type { ScopeDecision, WorkQueueScopeAuthorizer } from '../scopeAuthorizer';

const USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001' } as UserInfo;
const BODY = { messages: [{ attributes: { eventType: 'click' }, payload: { url: 'https://x' } }] };

class FakeAuthorizer implements WorkQueueScopeAuthorizer {
    public Decision: ScopeDecision = { Allowed: true, Reason: 'allowed' };
    public Calls: Array<[string, string, string, string]> = [];

    public async Authorize(apiKeyHash: string, scopePath: string, resource: string, _user: UserInfo, request: { Endpoint: string; Method: string }): Promise<ScopeDecision> {
        this.Calls.push([apiKeyHash, scopePath, resource, request.Endpoint]);
        return this.Decision;
    }
}

class FakePublishEngine implements WorkQueuePublishEngine {
    public Topics: WorkQueuePublishTopic[] = [{ Name: 'email.events', AllowExternalPublish: true }, { Name: 'mj.internal', AllowExternalPublish: false }];
    public Published: Array<{ Topic: string; Requests: PublishRequest[]; Options: WorkQueuePublishOptions }> = [];
    public Error: Error | null = null;

    public GetTopicByName(name: string): WorkQueuePublishTopic | undefined {
        return this.Topics.find(t => t.Name.toLowerCase() === name.trim().toLowerCase());
    }

    public async PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]> {
        if (this.Error) {
            throw this.Error;
        }
        this.Published.push({ Topic: topic, Requests: requests, Options: options });
        return requests.map((_r, i) => ({ MessageID: `m-${i}`, Status: 'Accepted' }));
    }
}

class CapturingLogger implements WorkLogger {
    public Errors: string[] = [];
    public Info(): void {}
    public Warn(): void {}
    public Error(message: string, error?: Error): void {
        this.Errors.push(`${message}: ${error?.message ?? ''}`);
    }
}

interface Harness {
    Dependencies: WorkQueuePublishDependencies;
    Authorizer: FakeAuthorizer;
    Engine: FakePublishEngine;
    Log: CapturingLogger;
    EngineRequests: () => number;
    BodyReads: () => number;
    Request(overrides?: Partial<WorkQueuePublishHttpRequest>): WorkQueuePublishHttpRequest;
}

function harness(): Harness {
    const authorizer = new FakeAuthorizer();
    const engine = new FakePublishEngine();
    const log = new CapturingLogger();
    let engineRequests = 0;
    let bodyReads = 0;
    return {
        Authorizer: authorizer, Engine: engine, Log: log, EngineRequests: () => engineRequests, BodyReads: () => bodyReads,
        Dependencies: {
            GetEngine: async () => {
                engineRequests++;
                return engine;
            },
            Authorizer: authorizer,
            Settings: { MaxBatch: 100, BodyLimit: '30mb' },
            Log: log,
        },
        Request: (overrides = {}) => ({
            TopicName: 'email.events', User: USER, ApiKeyHash: 'hash-1', Path: '/work-queue/topics/email.events/messages',
            ReadBody: async () => {
                bodyReads++;
                return BODY;
            },
            ...overrides,
        }),
    };
}

describe('HandleWorkQueuePublish — before the body is read', () => {
    it('requires an authenticated user before checking anything else', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(h.Request({ User: undefined }), h.Dependencies)).toEqual({ Status: 401, Body: { error: 'Authentication required' } });
        expect([h.Authorizer.Calls.length, h.BodyReads()]).toEqual([0, 0]);
    });

    it('refuses a session without an API key (JWT, magic link, widget) with 403', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ ApiKeyHash: undefined }), h.Dependencies);
        expect(result).toEqual({ Status: 403, Body: { error: 'REST publishing requires an API key with the workqueue:publish scope' } });
        expect([h.Authorizer.Calls.length, h.BodyReads(), h.EngineRequests()]).toEqual([0, 0, 0]);
    });

    it('rejects a topic segment outside the topic-name charset without echoing or logging it', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'email.events\nFAKE LOG LINE' }), h.Dependencies);
        expect(result).toEqual({ Status: 400, Body: { error: 'Invalid topic name' } });
        expect([h.Authorizer.Calls.length, h.BodyReads(), h.Log.Errors.length]).toEqual([0, 0, 0]);
    });

    it('checks the publish scope against the topic name before reading the body or touching the engine', async () => {
        const h = harness();
        h.Authorizer.Decision = { Allowed: false, Reason: 'no matching rule' };
        const result = await HandleWorkQueuePublish(h.Request(), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(h.Authorizer.Calls).toEqual([['hash-1', 'workqueue:publish', 'email.events', '/work-queue/topics/email.events/messages']]);
        expect([h.BodyReads(), h.EngineRequests()]).toEqual([0, 0]);
    });
});

describe('HandleWorkQueuePublish — after authorization', () => {
    it('maps a body the parser refused (too large, malformed, unreadable)', async () => {
        const h = harness();
        const tooLarge = h.Request({ ReadBody: async () => { throw Object.assign(new Error('too large'), { status: 413, type: 'entity.too.large' }); } });
        expect(await HandleWorkQueuePublish(tooLarge, h.Dependencies)).toEqual({ Status: 413, Body: { error: 'Request body exceeds 30mb' } });
        const malformed = h.Request({ ReadBody: async () => { throw Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' }); } });
        expect(await HandleWorkQueuePublish(malformed, h.Dependencies)).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(h.Log.Errors).toEqual([]);
    });

    it('rejects an invalid body shape', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ ReadBody: async () => ({ messages: [] }) }), h.Dependencies);
        expect(result.Status).toBe(400);
        expect(h.EngineRequests()).toBe(0);
    });

    it('answers 404 for an unknown topic', async () => {
        const h = harness();
        expect(await HandleWorkQueuePublish(h.Request({ TopicName: 'nope' }), h.Dependencies)).toEqual({ Status: 404, Body: { error: "Unknown topic 'nope'" } });
    });

    it('refuses topics that do not allow external publishing', async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'mj.internal' }), h.Dependencies);
        expect(result.Status).toBe(403);
        expect(JSON.stringify(result.Body)).toContain('TopicNotExternallyPublishable');
        expect(h.Engine.Published).toHaveLength(0);
    });

    it("publishes as an external caller under the topic's canonical name and returns core's result JSON", async () => {
        const h = harness();
        const result = await HandleWorkQueuePublish(h.Request({ TopicName: 'EMAIL.EVENTS' }), h.Dependencies);
        expect(result).toEqual({ Status: 202, Body: { results: [{ messageId: 'm-0', status: 'Accepted' }] } });
        expect(h.Engine.Published).toEqual([{
            Topic: 'email.events',
            Requests: [{ Attributes: { eventType: 'click' }, Payload: { url: 'https://x' } }],
            Options: { ContextUser: USER, External: true },
        }]);
    });

    it('answers 500 and logs when publishing throws', async () => {
        const h = harness();
        h.Engine.Error = new Error('pool exhausted');
        expect(await HandleWorkQueuePublish(h.Request(), h.Dependencies)).toEqual({ Status: 500, Body: { error: 'Publish failed' } });
        expect(h.Log.Errors).toEqual(["REST publish to 'email.events' failed: pool exhausted"]);
    });
});
