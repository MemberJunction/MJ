/**
 * `ContainingPaths` — which objects must exist before a JSON path is writable.
 *
 * Pinned by tests because the rule it encodes is a database behaviour that is easy to assume
 * wrongly: `JSON_MODIFY` does NOT create intermediate objects. Writing `$.debug.paused` into a
 * payload with no `debug` key changes nothing while the UPDATE still reports a row — so a control
 * verb reports success and the workflow never pauses. A graph acquires its `debug` key the first
 * time somebody debugs it, which makes this the normal first call rather than an edge case.
 */
import { describe, expect, it } from 'vitest';
import { ContainingPaths } from '../TaskClaimStore';

describe('ContainingPaths', () => {
    it('returns nothing for a one-level path — the root always exists', () => {
        expect(ContainingPaths('$.debug')).toEqual([]);
    });

    it('names the containing object of a two-level path', () => {
        expect(ContainingPaths('$.debug.paused')).toEqual(['$.debug']);
        expect(ContainingPaths('$.debug.step')).toEqual(['$.debug']);
    });

    it('names every container of a nested path, shallowest first', () => {
        expect(ContainingPaths('$.debug.edgeOverrides.abc')).toEqual(['$.debug', '$.debug.edgeOverrides']);
    });

    it('treats a quoted segment as ONE segment — a UUID key contains dots-free text but the quotes matter', () => {
        const path = '$.debug.edgeOverrides."1e0a5b3c-1111-2222-3333-444455556666"';
        expect(ContainingPaths(path)).toEqual(['$.debug', '$.debug.edgeOverrides']);
    });

    it('does not split inside a quoted segment that itself contains a dot', () => {
        // Not a shape the engine produces today, but the parser must not invent containers from
        // punctuation inside a key — that would emit a JSON_MODIFY for an object that never exists.
        expect(ContainingPaths('$.debug.map."a.b"')).toEqual(['$.debug', '$.debug.map']);
    });
});
