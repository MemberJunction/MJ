import { NormalizeUUID } from '@memberjunction/global';
import { IsWorkJson } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { WorkJson, WorkMessage, WorkPayloadRef, WorkProgress } from '@memberjunction/work-queue-core';
import { ToIsoString } from '../../sql/sqlExecution';

const PROGRESS_MAX_CHARS = 4000;
const PROGRESS_MESSAGE_MAX_CHARS = 500;
const RESOLUTION_NOTE_MAX_CHARS = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Message columns as they come back from the claim and dead-letter procedures. */
export interface MessageColumns {
    MessageID: string;
    PartitionKey: string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

export function ParseAttributes(json: string | null): Record<string, string> {
    if (json === null || json.trim() === '') {
        return {};
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new WorkQueueConfigurationError('Stored message Attributes are not a JSON object');
    }
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') {
            throw new WorkQueueConfigurationError(`Stored message attribute '${key}' is not a string`);
        }
        attributes[key] = value;
    }
    return attributes;
}

/**
 * Parses a stored payload. The payload type is the handler's declaration, not something the database can prove, so
 * this is the single unchecked narrowing point — the same contract ExecuteSQL<T> applies to rows.
 */
export function ParsePayload<TPayload extends WorkJson = WorkJson>(json: string | null): TPayload | undefined {
    if (json === null) {
        return undefined;
    }
    const parsed: unknown = JSON.parse(json);
    if (!IsWorkJson(parsed)) {
        throw new WorkQueueConfigurationError('Stored message Payload is not JSON-safe');
    }
    return parsed as TPayload;
}

export function ParsePayloadRef(json: string | null): WorkPayloadRef | undefined {
    if (json === null) {
        return undefined;
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || !('Uri' in parsed) || typeof parsed.Uri !== 'string') {
        throw new WorkQueueConfigurationError('Stored message PayloadRef has no Uri');
    }
    const ref: WorkPayloadRef = { Uri: parsed.Uri };
    if ('ContentType' in parsed && typeof parsed.ContentType === 'string') {
        ref.ContentType = parsed.ContentType;
    }
    if ('SizeBytes' in parsed && typeof parsed.SizeBytes === 'number') {
        ref.SizeBytes = parsed.SizeBytes;
    }
    if ('Checksum' in parsed && typeof parsed.Checksum === 'string') {
        ref.Checksum = parsed.Checksum;
    }
    return ref;
}

/**
 * Row IDs come back UPPERCASE from SQL Server and lowercase from PostgreSQL (guides/UUID_COMPARISON_GUIDE.md). The
 * Database transport hands every ID out lowercase so a consumer on either platform gets back the string it published
 * and can compare with `===`; MJ code compares IDs with `UUIDsEqual` regardless.
 */
export function NormalizeRowID(id: string): string {
    return NormalizeUUID(id);
}

export function MessageFromColumns<TPayload extends WorkJson = WorkJson>(columns: MessageColumns, topicName: string): WorkMessage<TPayload> {
    const message: WorkMessage<TPayload> = {
        MessageID: NormalizeRowID(columns.MessageID),
        Topic: topicName,
        Attributes: ParseAttributes(columns.Attributes),
        PublishedAt: ToIsoString(columns.PublishedAt) ?? new Date(0).toISOString(),
    };
    const payload = ParsePayload<TPayload>(columns.Payload);
    const payloadRef = ParsePayloadRef(columns.PayloadRef);
    if (columns.PartitionKey !== null) message.PartitionKey = columns.PartitionKey;
    if (payload !== undefined) message.Payload = payload;
    if (payloadRef !== undefined) message.PayloadRef = payloadRef;
    if (columns.CorrelationID !== null) message.CorrelationID = columns.CorrelationID;
    return message;
}

/** Serialises progress into the 4,000-character column: drop the checkpoint first, then trim the message. */
export function SerializeProgress(progress: WorkProgress): string {
    const full = JSON.stringify(progress);
    if (full.length <= PROGRESS_MAX_CHARS) {
        return full;
    }
    const withoutCheckpoint: WorkProgress = {};
    if (progress.Percent !== undefined) withoutCheckpoint.Percent = progress.Percent;
    if (progress.Message !== undefined) withoutCheckpoint.Message = progress.Message.slice(0, PROGRESS_MESSAGE_MAX_CHARS);
    return JSON.stringify(withoutCheckpoint);
}

export function EncodeCursor(value: Record<string, string>): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function DecodeCursorField(cursor: string, field: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    if (typeof parsed !== 'object' || parsed === null || !(field in parsed)) {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    const value: unknown = Reflect.get(parsed, field);
    if (typeof value !== 'string') {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    return value;
}

export function IsUUID(value: string): boolean {
    return UUID_PATTERN.test(value.trim());
}

/** Operator reasons and notes are stored in ResolutionNote, NVARCHAR(1000) (03 §5.2). */
export function TruncateNote(text: string | null): string | null {
    return text === null ? null : text.slice(0, RESOLUTION_NOTE_MAX_CHARS);
}

export function ClampPageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize) || pageSize === 0) {
        return 50;
    }
    return Math.min(Math.max(Math.floor(pageSize), 1), 500);
}
