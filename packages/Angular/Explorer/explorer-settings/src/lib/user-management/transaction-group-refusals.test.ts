/**
 * Unit cover for `serverRefusalReasons`, the last hop of issue #4309.
 *
 * Honest provenance: the behaviour here was driven by the two component suites
 * (`user-management-bulk-role-refusal.dom.test.ts` and `user-dialog-role-refusal.dom.test.ts`),
 * whose failures were watched before any of this existed. These cases lock the extracted helper
 * down directly rather than through a component, and add the one thing a component test cannot
 * give: a pin on the provider strings the filter depends on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BaseEntity } from '@memberjunction/core';
import { ServerRefusalReasons, EnrolledRow, PROVIDER_PLACEHOLDER_MESSAGES } from './transaction-group-refusals';

/** An entity carrying only the one thing the helper reads. */
function row(label: string, completeMessage?: string): EnrolledRow {
    return {
        Label: label,
        Entity: { LatestResult: completeMessage === undefined ? null : { CompleteMessage: completeMessage } } as unknown as BaseEntity,
    };
}

describe('serverRefusalReasons', () => {
    it("pairs each row's label with the reason the server gave", () => {
        expect(ServerRefusalReasons([row('ada@example.test', 'You may only assign a role that you hold yourself.')]))
            .toEqual(['ada@example.test: You may only assign a role that you hold yourself.']);
    });

    it('reports every refused row, not just the first', () => {
        const reasons = ServerRefusalReasons([
            row('ada@example.test', 'You may only assign a role that you hold yourself.'),
            row('grace@example.test', 'You may only assign a role that you hold yourself.'),
        ]);
        expect(reasons).toHaveLength(2);
    });

    it('returns nothing when the server named no row, so the caller keeps its own message', () => {
        expect(ServerRefusalReasons([row('ada@example.test')])).toEqual([]);
    });

    it('ignores an entity with no LatestResult at all', () => {
        expect(ServerRefusalReasons([{ Label: 'ada', Entity: {} as unknown as BaseEntity }])).toEqual([]);
    });

    it('ignores a blank or whitespace-only message rather than emitting a bare label', () => {
        expect(ServerRefusalReasons([row('ada', ''), row('grace', '   ')])).toEqual([]);
    });

    it("drops the provider's placeholders, which every item of a failed group carries", () => {
        const reasons = ServerRefusalReasons([
            row('accepted-then-abandoned', 'Transaction failed'),
            row('also-abandoned', 'Transaction failed to commit'),
            row('actually-refused', 'You may only assign a role that you hold yourself.'),
        ]);
        expect(reasons).toEqual(['actually-refused: You may only assign a role that you hold yourself.']);
    });

    it('keeps a real reason that merely CONTAINS a placeholder phrase', () => {
        // The filter is an exact-match set, deliberately: a server reason that happens to quote the
        // phrase is still a reason, and substring matching would swallow it.
        const reasons = ServerRefusalReasons([row('ada', 'Transaction failed because the role is retired')]);
        expect(reasons).toHaveLength(1);
    });
});

/**
 * Does `bundle` emit `message` as a COMPLETE string literal?
 *
 * A substring test cannot answer that, and the difference is the whole point of this pin.
 * `'Transaction failed to commit'` contains `'Transaction failed'`, so a `toContain` check on the
 * shorter string is satisfied by the longer one alone — it would stay green through exactly the
 * drift it exists to catch, and only the longer placeholder would really be pinned. The filter
 * this guards matches placeholders EXACTLY (see the `merely CONTAINS` case above), so the pin has
 * to prove the complete literal is still there.
 */
function emitsLiteral(bundle: string, message: string): boolean {
    const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Quote-agnostic on purpose: `dist/index.cjs` is minified and currently double-quotes these,
    // so pinning the single-quoted form the provider SOURCE uses would fail against every build.
    return new RegExp(`["'\`]${escaped}["'\`]`).test(bundle);
}

/**
 * The filter above hardcodes two strings that live in `@memberjunction/graphql-dataprovider`, a
 * declared dependency of this package. That coupling is deliberate and documented on the constant —
 * but a comment cannot notice when the provider changes its wording, and the failure mode if it
 * does is silent: the placeholder stops matching and starts being shown to operators as though it
 * were the server's reason.
 *
 * So pin it against the shipped bundle. If this fails, the provider reworded a placeholder and
 * `PROVIDER_PLACEHOLDER_MESSAGES` needs the new text.
 */
describe('the provider placeholders this filter depends on', () => {
    it('are still the strings GraphQLDataProvider emits for a failed transaction group', () => {
        const require = createRequire(import.meta.url);
        const bundle = readFileSync(require.resolve('@memberjunction/graphql-dataprovider'), 'utf8');

        // Driven off the real set, so a third placeholder added to the filter is pinned by
        // arriving — not by someone remembering to re-type it here.
        expect(PROVIDER_PLACEHOLDER_MESSAGES.size).toBeGreaterThan(0);
        for (const message of PROVIDER_PLACEHOLDER_MESSAGES) {
            expect(
                emitsLiteral(bundle, message),
                `GraphQLDataProvider no longer emits '${message}' as a complete string literal — update PROVIDER_PLACEHOLDER_MESSAGES`,
            ).toBe(true);
        }
    });

    it('can actually fail: a bundle carrying only the longer placeholder does not satisfy the shorter one', () => {
        // The bundle is minified, so the literal arrives double-quoted; this is a real excerpt of
        // the shape `dist/index.cjs` ships.
        expect(emitsLiteral('s.Message="Transaction failed to commit"', 'Transaction failed')).toBe(false);
    });
});
