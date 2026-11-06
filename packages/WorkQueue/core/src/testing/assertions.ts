/** Thrown by conformance cases when a transport does not behave as the contract requires. */
export class ConformanceAssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConformanceAssertionError';
    }
}

/** Structural equality for JSON-like values (primitives, arrays, plain objects). */
export function IsDeepEqual(actual: unknown, expected: unknown): boolean {
    if (Object.is(actual, expected)) {
        return true;
    }
    if (Array.isArray(actual) || Array.isArray(expected)) {
        return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((item, index) => IsDeepEqual(item, expected[index]));
    }
    if (!isRecord(actual) || !isRecord(expected)) {
        return false;
    }
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(actual, key) && IsDeepEqual(actual[key], expected[key]));
}

export function AssertEqual(actual: unknown, expected: unknown, label: string): void {
    if (!IsDeepEqual(actual, expected)) {
        Fail(`${label}: expected ${render(expected)} but got ${render(actual)}`);
    }
}

/** Every property of `expected` must be deep-equal on `actual`; other properties are ignored. */
export function AssertMatch(actual: unknown, expected: Record<string, unknown>, label: string): void {
    if (!isRecord(actual)) {
        Fail(`${label}: expected an object but got ${render(actual)}`);
    }
    for (const [key, value] of Object.entries(expected)) {
        if (!IsDeepEqual(actual[key], value)) {
            Fail(`${label}: expected ${key} ${render(value)} but got ${render(actual[key])}`);
        }
    }
}

export function AssertLength(items: readonly unknown[], expected: number, label: string): void {
    if (items.length !== expected) {
        Fail(`${label}: expected ${expected} items but got ${items.length}`);
    }
}

export function AssertTrue(condition: boolean, label: string): void {
    if (!condition) {
        Fail(`${label}: expected true`);
    }
}

export function Fail(message: string): never {
    throw new ConformanceAssertionError(message);
}

function render(value: unknown): string {
    if (value === undefined) {
        return 'undefined';
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
