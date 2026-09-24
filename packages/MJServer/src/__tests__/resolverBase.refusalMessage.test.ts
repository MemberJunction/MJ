/**
 * What the API says when a save or a delete is REFUSED.
 *
 * The three write resolvers all end the same way — `throw new GraphQLError(<a string off
 * LatestResult> ?? 'Unknown error')` — and they did not agree on which string. `CreateRecord` read
 * `CompleteMessage`; `UpdateRecord` and `DeleteRecord` read `Message`. A validation refusal puts its
 * reasons in `Errors` and leaves `Message` null, so the same rule on the same entity explained itself
 * on a create and produced the literal text "Unknown error" on an update.
 *
 * Nothing could catch it: both properties exist, both are strings, and the `??` fallback renders the
 * failure as a plausible-looking error rather than a crash. It is visible only by refusing an update
 * and reading what comes back.
 *
 * The first two cases below guard the direction of RISK in the change — that swapping the property
 * cannot lose a plain `Message`, and cannot blank out the `'Unknown error'` fallback. The last case
 * is the only one that fails if a resolver is switched back, and it has to read the source to do it:
 * any test that restates what a resolver reads stays green through the regression, which is exactly
 * how this survived (a create-path test proved nothing about update).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';

/** The shape a validation refusal leaves: `Message` untouched, reasons in `Errors`. */
function refusedByValidation(...messages: string[]): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Errors = messages.map((Message) => ({
        Source: 'SomeField',
        Message,
        Value: null,
        Type: 'Failure',
    })) as unknown as BaseEntityResult['Errors'];
    return result;
}

/** Exactly what the update/delete resolvers hand to `GraphQLError`, fallback included. */
const asReported = (r: BaseEntityResult) => r.CompleteMessage ?? 'Unknown error';

describe('switching the update/delete throws to CompleteMessage', () => {
    it('does NOT lose a plain Message — it is a superset, not a replacement', () => {
        // The risk in the change: a non-validation failure (a provider/SQL error) sets `Message` and
        // no `Errors`. The new property must still report it.
        const result = new BaseEntityResult();
        result.Success = false;
        result.Message = 'Timeout expired while saving.';

        expect(asReported(result)).toBe('Timeout expired while saving.');
    });

    it('still falls back to "Unknown error" when there is genuinely nothing to say', () => {
        // The other direction: if CompleteMessage returned '' rather than undefined for an empty
        // result, `??` would not fire and the user would get a blank error.
        expect(asReported(new BaseEntityResult())).toBe('Unknown error');
    });

    it('carries the validation prose that "Unknown error" used to replace', () => {
        const prose = 'Record what this contract says instead of the standard clause.';
        const result = refusedByValidation(prose);

        expect(result.Message, 'a refusal leaves Message unset — this is why reading it failed').toBeFalsy();
        expect(asReported(result)).toBe(prose);
    });
});

describe('ResolverBase selects CompleteMessage on every write-refusal throw', () => {
    const source = readFileSync(fileURLToPath(new URL('../generic/ResolverBase.ts', import.meta.url)), 'utf8');

    it('no refusal throw reads the bare LatestResult.Message', () => {
        // `\b` so the longer `CompleteMessage` does not match.
        const offenders = source
            .split('\n')
            .map((line, i) => ({ line: line.trim(), n: i + 1 }))
            .filter(({ line }) => /LatestResult\??\.Message\b/.test(line));

        expect(
            offenders,
            `these lines still read the bare Message:\n${offenders.map((o) => `  ${o.n}: ${o.line}`).join('\n')}`,
        ).toEqual([]);
    });

    it('keeps the three error codes distinct — the fix must not have collapsed the paths', () => {
        for (const code of ['CREATE_ENTITY_ERROR', 'SAVE_ENTITY_ERROR', 'DELETE_ENTITY_ERROR']) {
            expect(source, code).toContain(code);
        }
    });
});
