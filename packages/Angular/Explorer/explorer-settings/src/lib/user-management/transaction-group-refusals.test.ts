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
import { serverRefusalReasons, EnrolledRow } from './transaction-group-refusals';

/** An entity carrying only the one thing the helper reads. */
function row(label: string, completeMessage?: string): EnrolledRow {
    return {
        label,
        entity: { LatestResult: completeMessage === undefined ? null : { CompleteMessage: completeMessage } } as unknown as BaseEntity,
    };
}

describe('serverRefusalReasons', () => {
    it("pairs each row's label with the reason the server gave", () => {
        expect(serverRefusalReasons([row('ada@example.test', 'You may only assign a role that you hold yourself.')]))
            .toEqual(['ada@example.test: You may only assign a role that you hold yourself.']);
    });

    it('reports every refused row, not just the first', () => {
        const reasons = serverRefusalReasons([
            row('ada@example.test', 'You may only assign a role that you hold yourself.'),
            row('grace@example.test', 'You may only assign a role that you hold yourself.'),
        ]);
        expect(reasons).toHaveLength(2);
    });

    it('returns nothing when the server named no row, so the caller keeps its own message', () => {
        expect(serverRefusalReasons([row('ada@example.test')])).toEqual([]);
    });

    it('ignores an entity with no LatestResult at all', () => {
        expect(serverRefusalReasons([{ label: 'ada', entity: {} as unknown as BaseEntity }])).toEqual([]);
    });

    it('ignores a blank or whitespace-only message rather than emitting a bare label', () => {
        expect(serverRefusalReasons([row('ada', ''), row('grace', '   ')])).toEqual([]);
    });

    it("drops the provider's placeholders, which every item of a failed group carries", () => {
        const reasons = serverRefusalReasons([
            row('accepted-then-abandoned', 'Transaction failed'),
            row('also-abandoned', 'Transaction failed to commit'),
            row('actually-refused', 'You may only assign a role that you hold yourself.'),
        ]);
        expect(reasons).toEqual(['actually-refused: You may only assign a role that you hold yourself.']);
    });

    it('keeps a real reason that merely CONTAINS a placeholder phrase', () => {
        // The filter is an exact-match set, deliberately: a server reason that happens to quote the
        // phrase is still a reason, and substring matching would swallow it.
        const reasons = serverRefusalReasons([row('ada', 'Transaction failed because the role is retired')]);
        expect(reasons).toHaveLength(1);
    });
});

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

        expect(bundle, "GraphQLDataProvider no longer emits 'Transaction failed' — update PROVIDER_PLACEHOLDER_MESSAGES")
            .toContain('Transaction failed');
        expect(bundle, "GraphQLDataProvider no longer emits 'Transaction failed to commit' — update PROVIDER_PLACEHOLDER_MESSAGES")
            .toContain('Transaction failed to commit');
    });
});
