/**
 * @fileoverview General-purpose validation types for use across MemberJunction
 * 
 * These types provide a standard way to represent validation results and errors
 * throughout the framework, independent of any specific validation implementation.
 * 
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.68.0
 */

/**
 * Enumeration of validation error types
 */
export const ValidationErrorType = {
    Failure: 'Failure',
    Warning: 'Warning',
} as const;

export type ValidationErrorType = typeof ValidationErrorType[keyof typeof ValidationErrorType];

/**
 * Information about a single validation error
 */
export class ValidationErrorInfo {
    Source: string;
    Message: string;
    Value: any;
    Type: ValidationErrorType;

    constructor(Source: string, Message: string, Value: any, Type: ValidationErrorType = ValidationErrorType.Failure) {
        this.Source = Source;
        this.Message = Message;
        this.Value = Value;
        this.Type = Type;
    }
}

/**
 * Result of a validation operation
 */
export class ValidationResult {
    Success: boolean = false;
    Errors: ValidationErrorInfo[] = [];
}
/**
 * A {@link ValidationErrorInfo} flattened to the plain shape that survives a JSON hop — a GraphQL
 * error's `extensions`, a remote-operation output payload — with `Value` reduced to something that
 * serialises predictably.
 *
 * Exists because `ValidationErrorInfo` is a class: once it crosses the wire the receiving side gets a
 * plain object, and `instanceof` (or a method call) on it fails. Producers call
 * {@link SerializeValidationErrors} at the boundary; consumers call {@link DeserializeValidationErrors}
 * to get real instances back. Keeping both in one place is what stops the two sides drifting.
 */
export type SerializedValidationError = {
    Source: string;
    Message: string;
    Value: string | number | boolean | null;
    Type: ValidationErrorType;
};

/**
 * Reduces an arbitrary `Value` to something JSON carries without surprise: primitives pass through,
 * a `Date` becomes its ISO string, anything else (an object, an array, a function) is dropped. The
 * value is diagnostic — the field name and the message are what a form needs — so losing an object
 * here is preferable to a circular structure failing the whole response.
 */
function serializeValidationValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
    return null;
}

function isValidationErrorType(value: unknown): value is ValidationErrorType {
    return value === ValidationErrorType.Failure || value === ValidationErrorType.Warning;
}

/**
 * Flattens a result's `Errors` array for transport.
 *
 * The input is `unknown[]` deliberately: `BaseEntityResult.Errors` is `any[]` and mixes
 * `ValidationErrorInfo` instances with plain `Error`s. Entries carrying a string `Message` (the MJ
 * shape) are kept — a missing or non-string `Source` is normalised to `''`, meaning "not tied to a
 * field", and an unknown `Type` defaults to `Failure`. Entries without a `Message` (an `Error` has
 * only lowercase `message`) are skipped: they have no field to paint and their text already reaches
 * the client through `CompleteMessage`.
 *
 * @param errors - The raw `Errors` array, or nothing.
 * @returns Plain, JSON-safe entries; `[]` when there is nothing to carry.
 */
export function SerializeValidationErrors(errors: readonly unknown[] | null | undefined): SerializedValidationError[] {
    if (!Array.isArray(errors)) return [];
    const out: SerializedValidationError[] = [];
    for (const entry of errors) {
        if (!entry || typeof entry !== 'object') continue;
        const shaped = entry as { Source?: unknown; Message?: unknown; Value?: unknown; Type?: unknown };
        if (typeof shaped.Message !== 'string' || shaped.Message.trim().length === 0) continue;
        out.push({
            Source: typeof shaped.Source === 'string' ? shaped.Source : '',
            Message: shaped.Message,
            Value: serializeValidationValue(shaped.Value),
            Type: isValidationErrorType(shaped.Type) ? shaped.Type : ValidationErrorType.Failure,
        });
    }
    return out;
}

/**
 * Rebuilds real {@link ValidationErrorInfo} instances from whatever arrived over the wire.
 *
 * Tolerant by design — the input is the untyped `extensions.validationErrors` of a GraphQL error or a
 * remote-op output field, and a client must never throw because a server sent something odd. Anything
 * that is not an array yields `[]`; entries are filtered by the same rule as
 * {@link SerializeValidationErrors}, so a round trip is stable.
 *
 * @param raw - The transported value.
 * @returns Instances a form can treat exactly like the output of a local `Validate()`.
 */
export function DeserializeValidationErrors(raw: unknown): ValidationErrorInfo[] {
    return SerializeValidationErrors(Array.isArray(raw) ? raw : undefined)
        .map(e => new ValidationErrorInfo(e.Source, e.Message, e.Value, e.Type));
}
