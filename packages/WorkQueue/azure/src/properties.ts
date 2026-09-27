/**
 * Application properties the runtime sets on Service Bus messages. Producers cannot use the `mj_` prefix
 * (core rejects reserved attribute keys), so these never collide with envelope attributes.
 */
export const RUNTIME_PROPERTIES = {
    /** Attempt number of the copy's first delivery (retry copies carry n+1; a first publish carries nothing). */
    Attempt: 'mj_attempt',
    /** Name of the one subscription a retry or replay copy is for; every subscription rule filters on it. */
    Target: 'mj_target',
    /** '1' on a message the operator replayed from the dead-letter subqueue. */
    Replay: 'mj_replay',
    ReplayNote: 'mj_replay_note',
    ReplayedBy: 'mj_replayed_by',
} as const;

/** Properties the runtime adds when it dead-letters a message (Service Bus's own reason/description fields are set too). */
export const DEAD_LETTER_PROPERTIES = {
    Reason: 'mj_dead_letter_reason',
    LastError: 'mj_last_error',
    Attempts: 'mj_attempts',
    DeadLetteredAt: 'mj_dead_lettered_at',
} as const;

export const DEAD_LETTER_REASON_MAX_CHARS = 500;
export const LAST_ERROR_MAX_CHARS = 2000;
/** Service Bus's own reason for a message that exceeded the subscription's MaxDeliveryCount (a crash loop the runtime never saw). */
export const SERVICE_BUS_MAX_DELIVERY_REASON = 'MaxDeliveryCountExceeded';
/** How that reason is reported to operators (the same word the AWS transport uses for its redrive policy). */
export const REDRIVE_REASON = 'RedrivePolicy';

/** Reads a string application property; numbers and booleans are stringified, anything else is absent. */
export function StringProperty(properties: Record<string, unknown> | undefined, name: string): string | undefined {
    const value = properties?.[name];
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return undefined;
}

/** Every string-valued application property that is not runtime-owned: the envelope attributes as published. */
export function UserAttributes(properties: Record<string, unknown> | undefined): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const [name, value] of Object.entries(properties ?? {})) {
        if (typeof value === 'string' && !name.startsWith('mj_')) {
            attributes[name] = value;
        }
    }
    return attributes;
}
