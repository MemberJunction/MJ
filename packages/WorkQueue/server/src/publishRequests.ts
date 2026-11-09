import { ParseRestPublishBody, ToRestPublishResult } from '@memberjunction/work-queue-core';
import type { PublishRequest, PublishResult, RestPublishResponseJson } from '@memberjunction/work-queue-core';

export const WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish';
export const DEFAULT_WORK_QUEUE_ROOT_PATH = '/work-queue';
export const DEFAULT_MAX_BATCH = 100;
export const DEFAULT_BODY_LIMIT = '30mb';

/**
 * What a `{topic}` path segment may look like before it is logged or looked up (03 §9): letters, digits, dot,
 * underscore and hyphen, 1–200 characters, starting with a letter or digit. Topic names are dotted identifiers
 * (03 §6.2); this is deliberately no looser than that.
 */
export const TOPIC_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function IsValidTopicName(name: string): boolean {
    return TOPIC_NAME_PATTERN.test(name) && !name.includes('..');
}

export interface WorkQueueServerSettings {
    MaxBatch: number;
    BodyLimit: string;
}

export type ParsedPublishBody = { Success: true; Requests: PublishRequest[] } | { Success: false; Error: string };

export interface WorkQueueErrorBody {
    error: string;
}

export interface WorkQueueHttpResult {
    Status: number;
    Body: RestPublishResponseJson | WorkQueueErrorBody;
}

type JsonRecord = Record<string, unknown>;

export function ParseServerSettings(settings: JsonRecord): WorkQueueServerSettings {
    const maxBatch = settings.MaxBatch ?? DEFAULT_MAX_BATCH;
    if (typeof maxBatch !== 'number' || !Number.isInteger(maxBatch) || maxBatch < 1 || maxBatch > DEFAULT_MAX_BATCH) {
        throw new Error(`WorkQueueServerExtension Settings.MaxBatch must be an integer between 1 and ${DEFAULT_MAX_BATCH}`);
    }
    const bodyLimit = settings.BodyLimit ?? DEFAULT_BODY_LIMIT;
    if (typeof bodyLimit !== 'string' || bodyLimit.trim() === '') {
        throw new Error('WorkQueueServerExtension Settings.BodyLimit must be a size string such as "30mb"');
    }
    return { MaxBatch: maxBatch, BodyLimit: bodyLimit.trim() };
}

/**
 * JSON shape comes from core's ParseRestPublishBody — the mapping WorkQueueApiPublisher also uses (03 §9), so client
 * and server cannot drift. This wrapper only applies the extension's own MaxBatch. Envelope semantics are validated
 * by PublishAs, per item.
 */
export function ParsePublishBody(body: unknown, maxBatch: number): ParsedPublishBody {
    const parsed = ParseRestPublishBody(body);
    if (parsed.Kind === 'Invalid') {
        return { Success: false, Error: parsed.Error };
    }
    if (parsed.Requests.length > maxBatch) {
        return { Success: false, Error: `"messages" must contain between 1 and ${maxBatch} items` };
    }
    return { Success: true, Requests: parsed.Requests };
}

export function ToPublishResponseBody(results: PublishResult[]): RestPublishResponseJson {
    return { results: results.map(ToRestPublishResult) };
}

/** The HTTP answer when the JSON body parser rejects a request. body-parser tags its errors with `type`. */
export function BodyErrorResult(error: unknown, bodyLimit: string): WorkQueueHttpResult {
    const status = IsRecord(error) ? error.status : undefined;
    const type = IsRecord(error) ? error.type : undefined;
    if (status === 413 || type === 'entity.too.large') {
        return { Status: 413, Body: { error: `Request body exceeds ${bodyLimit}` } };
    }
    if (type === 'entity.parse.failed' || error instanceof SyntaxError) {
        return { Status: 400, Body: { error: 'Request body must be valid JSON' } };
    }
    return { Status: 400, Body: { error: 'Request body could not be read' } };
}

function IsRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
