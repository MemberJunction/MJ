import type { UserInfo } from '@memberjunction/core';
import type { PublishRequest, PublishResult, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueuePublishOptions } from '@memberjunction/work-queue-engine';
import { BodyErrorResult, IsValidTopicName, ParsePublishBody, ToPublishResponseBody, WORK_QUEUE_PUBLISH_SCOPE } from './publishRequests';
import type { WorkQueueHttpResult, WorkQueueServerSettings } from './publishRequests';
import type { WorkQueueScopeAuthorizer } from './scopeAuthorizer';

export interface WorkQueuePublishTopic {
    Name: string;
    AllowExternalPublish: boolean;
}

/** The part of WorkQueueEngine the endpoint needs. WorkQueueEngine satisfies it structurally. */
export interface WorkQueuePublishEngine {
    GetTopicByName(name: string): WorkQueuePublishTopic | undefined;
    PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]>;
}

export interface WorkQueuePublishHttpRequest {
    TopicName: string;
    User: UserInfo | undefined;
    ApiKeyHash: string | undefined;
    Path: string;
    /** Reads and JSON-parses the request body. Called only AFTER authentication and the scope check pass (03 §9). */
    ReadBody(): Promise<unknown>;
}

export interface WorkQueuePublishDependencies {
    /** The engine, configured as the SYSTEM user — never as the caller (03 §9). */
    GetEngine(): Promise<WorkQueuePublishEngine>;
    Authorizer: WorkQueueScopeAuthorizer;
    Settings: WorkQueueServerSettings;
    Log: WorkLogger;
}

/**
 * Runs one REST publish to completion (03 §9). Never throws. Authentication, the API-key requirement, the topic-name
 * charset and the scope check all run BEFORE the body is read, so a caller without the scope can neither make the
 * server parse a large body nor learn which topics exist.
 */
export async function HandleWorkQueuePublish(request: WorkQueuePublishHttpRequest, dependencies: WorkQueuePublishDependencies): Promise<WorkQueueHttpResult> {
    if (!request.User) {
        return { Status: 401, Body: { error: 'Authentication required' } };
    }
    if (!request.ApiKeyHash) {
        return { Status: 403, Body: { error: `REST publishing requires an API key with the ${WORK_QUEUE_PUBLISH_SCOPE} scope` } };
    }
    const topicName = request.TopicName.trim();
    if (!IsValidTopicName(topicName)) {
        return { Status: 400, Body: { error: 'Invalid topic name' } };   // the raw segment is neither echoed nor logged
    }
    try {
        return await Publish(request, request.User, request.ApiKeyHash, topicName, dependencies);
    } catch (error) {
        dependencies.Log.Error(`REST publish to '${topicName}' failed`, error instanceof Error ? error : new Error(String(error)));
        return { Status: 500, Body: { error: 'Publish failed' } };
    }
}

async function Publish(
    request: WorkQueuePublishHttpRequest, user: UserInfo, apiKeyHash: string, topicName: string, dependencies: WorkQueuePublishDependencies,
): Promise<WorkQueueHttpResult> {
    const decision = await dependencies.Authorizer.Authorize(apiKeyHash, WORK_QUEUE_PUBLISH_SCOPE, topicName, user, { Endpoint: request.Path, Method: 'POST' });
    if (!decision.Allowed) {
        return { Status: 403, Body: { error: `API key lacks ${WORK_QUEUE_PUBLISH_SCOPE} for '${topicName}': ${decision.Reason}` } };
    }
    let body: unknown;
    try {
        body = await request.ReadBody();
    } catch (error) {
        return BodyErrorResult(error, dependencies.Settings.BodyLimit);
    }
    const parsed = ParsePublishBody(body, dependencies.Settings.MaxBatch);
    if (parsed.Success === false) {
        return { Status: 400, Body: { error: parsed.Error } };
    }
    const engine = await dependencies.GetEngine();
    const topic = engine.GetTopicByName(topicName);
    if (!topic) {
        return { Status: 404, Body: { error: `Unknown topic '${topicName}'` } };
    }
    if (!topic.AllowExternalPublish) {
        return { Status: 403, Body: { error: `Topic '${topic.Name}' does not accept external publishes (TopicNotExternallyPublishable)` } };
    }
    const results = await engine.PublishAs(topic.Name, parsed.Requests, { ContextUser: user, External: true });
    return { Status: 202, Body: ToPublishResponseBody(results) };
}
