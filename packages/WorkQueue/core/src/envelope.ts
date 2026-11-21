/** JSON-safe value used for inline payloads and progress checkpoints. */
export type WorkJson =
    | string
    | number
    | boolean
    | null
    | WorkJson[]
    | { [key: string]: WorkJson };

/** Reference to data held outside the queue (claim-check). The queue never dereferences it. */
export interface WorkPayloadRef {
    /** e.g. s3://bucket/key, https://…, mjstorage://{FileStorageAccountID}/{objectKey} */
    Uri: string;
    ContentType?: string;
    SizeBytes?: number;
    /** e.g. "sha256:…" */
    Checksum?: string;
}

/** The message as delivered to a handler. Identical on every transport. */
export interface WorkMessage<TPayload extends WorkJson = WorkJson> {
    /** UUID, globally unique (spec 03 §2.1). Stable across redeliveries and replays. Producer-supplied or generated at publish. */
    MessageID: string;
    Topic: string;
    /** Ordering is publish order per key; there is no producer-supplied ordering number (spec 03 §1). */
    PartitionKey?: string;
    /**
     * ≤ 10 entries; keys 1–64 chars [A-Za-z0-9_-] (no dots: a dotted name is MJ's `source.field` filter form,
     * which filters reject, so a dotted attribute would be unfilterable); values 1–256 chars (brokers refuse
     * empty values). The only fields filters see.
     */
    Attributes: Record<string, string>;
    Payload?: TPayload;
    PayloadRef?: WorkPayloadRef;
    CorrelationID?: string;
    /** ISO-8601 UTC, assigned by the publisher (MJ), not the producer. */
    PublishedAt: string;
}
