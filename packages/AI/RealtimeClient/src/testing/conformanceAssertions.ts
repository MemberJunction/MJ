/**
 * @fileoverview The kit's plain assertions: no test framework. Each failure names the rule the driver broke and what
 * was expected and seen; the runner prefixes the check's id.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */

/** Thrown when a driver breaks a rule of the video conformance kit; the message names the check and the rule. */
export class RealtimeVideoConformanceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RealtimeVideoConformanceError';
    }
}

/** Fails the check with `<rule>: <detail>`. */
export function Fail(rule: string, detail: string): never {
    throw new RealtimeVideoConformanceError(`${rule}: ${detail}`);
}

/** Fails unless `condition` holds. `seen` says what was seen instead. */
export function AssertTrue(condition: boolean, rule: string, seen: string): void {
    if (!condition) {
        Fail(rule, seen);
    }
}

/** Fails unless a count is what the rule says. */
export function AssertCount(actual: number, expected: number, rule: string): void {
    if (actual !== expected) {
        Fail(rule, `expected ${expected}, got ${actual}`);
    }
}

/** Fails unless a value (a state, a track state, a kind) is what the rule says. */
export function AssertValue(actual: string | boolean | null | undefined, expected: string | boolean | null, rule: string): void {
    if (actual !== expected) {
        Fail(rule, `expected ${String(expected)}, got ${String(actual)}`);
    }
}

/** Fails unless the pieces seen are the pieces sent, in order, byte for byte. */
export function AssertSameBytes(actual: readonly ArrayBuffer[], expected: readonly ArrayBuffer[], rule: string): void {
    if (actual.length !== expected.length) {
        Fail(rule, `expected ${expected.length} pieces, got ${actual.length}`);
    }
    const different = expected.findIndex((piece, index) => !sameBytes(actual[index], piece));
    if (different >= 0) {
        Fail(rule, `piece ${different + 1} of ${expected.length} differs from what the model sent (or came out of order)`);
    }
}

/** Fails unless two amounts of seconds agree to the nanosecond: sums of 1/24 s are inexact in floating point. */
export function AssertSeconds(actual: number, expected: number, rule: string): void {
    if (ToNanoseconds(actual) !== ToNanoseconds(expected)) {
        Fail(rule, `expected ${ToNanoseconds(expected)} s, got ${ToNanoseconds(actual)} s`);
    }
}

/** Seconds rounded to the nanosecond. */
export function ToNanoseconds(seconds: number): number {
    return Math.round(seconds * 1e9) / 1e9;
}

function sameBytes(a: ArrayBuffer | undefined, b: ArrayBuffer): boolean {
    if (!a || a.byteLength !== b.byteLength) {
        return false;
    }
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    return left.every((byte, index) => byte === right[index]);
}
