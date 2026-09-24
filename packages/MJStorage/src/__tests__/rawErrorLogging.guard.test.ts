import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * A source guard for the storage drivers, in the spirit of
 * `GraphQLDataProvider`'s `rawErrorLogging.guard.test.ts` (#3642).
 *
 * ## What this protects
 *
 * A driver catches an error thrown by a vendor SDK and logs it. The hazard is
 * serialising that error *wholesale*, because an error produced by an HTTP
 * client frequently carries the originating request — and a request carries
 * whatever was sent to authenticate it. Two sites did exactly that:
 * `BoxFileStorage`'s `fullError: uploadError` and `DropboxFileStorage`'s
 * `fullError: JSON.stringify(error, null, 2)` (#3685).
 *
 * ## What was measured
 *
 * Neither was leaking a credential at the time it was found:
 *
 * - Box's `BoxApiError` DOES carry the live bearer token at
 *   `requestInfo.headers.authorization`, but the SDK redacts it on both of its
 *   serialisation paths — `toJSON()` and its `util.inspect.custom` hook each run
 *   every header through `DataSanitizer`. `console.error` prints
 *   `"authorization": "---[redacted]---"`.
 * - Dropbox's `DropboxResponseError` has own enumerable keys `name`, `status`,
 *   `headers`, `error` only. `headers` is a fetch `Headers` instance that
 *   `JSON.stringify` flattens to `{}`, and `error` is the parsed API error body.
 *
 * So the fix is hardening, not an incident response. The point of this guard is
 * that the safety above is the *SDKs'* promise, revocable by any upgrade, and it
 * never covered Box's `requestInfo.body`, which `toJSON()` passes through
 * untouched. Naming the logged fields makes the logged set a property of our
 * source, which is a property a test can hold.
 *
 * The rule: no driver may name a `fullError` key, stringify a caught error
 * wholesale, or fall back to the raw error object with `|| error`.
 */

const DRIVERS_DIR = join(__dirname, '..', 'drivers');

/** Strips comments so prose about the old code cannot trip the assertions. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const drivers = readdirSync(DRIVERS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, code: withoutComments(readFileSync(join(DRIVERS_DIR, file), 'utf8')) }));

describe('storage drivers — no vendor error may be logged wholesale', () => {
    it('found the drivers to check', () => {
        // Guards against the guard passing vacuously because the path moved.
        expect(drivers.length).toBeGreaterThanOrEqual(5);
        expect(drivers.map((d) => d.file)).toContain('BoxFileStorage.ts');
        expect(drivers.map((d) => d.file)).toContain('DropboxFileStorage.ts');
    });

    it.each(drivers)('$file names no fullError key', ({ code }) => {
        // The original defect in both drivers.
        expect(code).not.toMatch(/fullError\s*:/);
    });

    it.each(drivers)('$file never JSON.stringifies a caught error', ({ code }) => {
        // `JSON.stringify(error)` / `JSON.stringify(err, null, 2)` — the whole
        // object, whatever a future SDK version decides to hang off it.
        expect(code).not.toMatch(/JSON\.stringify\(\s*(?:error|err|e)\b\s*[,)]/);
    });

    it.each(drivers)('$file never falls back to the raw error object', ({ code }) => {
        // `error.message || error` and `error.error || error` look like a
        // narrowing but resolve to the entire object whenever the named field
        // is absent — which is exactly the case where the shape is unknown.
        expect(code).not.toMatch(/\|\|\s*(?:error|err)\s*[,)}\n]/);
    });
});

describe('the guard itself would catch a regression', () => {
    const regressed = withoutComments(`
        catch (error) {
            console.error('x', { fullError: error, detail: error.message || error });
            throw new Error(JSON.stringify(error, null, 2));
        }
    `);

    it('detects a fullError key', () => {
        expect(regressed).toMatch(/fullError\s*:/);
    });

    it('detects a wholesale stringify', () => {
        expect(regressed).toMatch(/JSON\.stringify\(\s*(?:error|err|e)\b\s*[,)]/);
    });

    it('detects a raw-error fallback', () => {
        expect(regressed).toMatch(/\|\|\s*(?:error|err)\s*[,)}\n]/);
    });
});
