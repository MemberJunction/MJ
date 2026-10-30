/**
 * Fixture gates shared by the mutating bundles IT147–IT150: whether a bundle's Setup may write at
 * all, and the skip reason when an encrypted fixture cannot be written because no base encryption
 * key is configured.
 */
import { IsTierEnabled } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

export const MUTATION_TIER_OFF_REASON = 'the mutation tier is off (RUN_MUTATION_TESTS)';

/** True when the bundle's RequiresMutation checks will run, so Setup may create its fixture. */
export function MutationTierOn(ctx: IntegrationCheckContext): boolean {
    return IsTierEnabled('mutation') || ctx.Config?.runMutationTests === true;
}

/**
 * The skip reason for a save refused because the writing process (or MJAPI, over the wire) has no
 * base encryption key; undefined when the failure is anything else.
 */
export function EncryptionUnavailableReason(saveMessage: string): string | undefined {
    if (!/Failed to encrypt field/i.test(saveMessage)) {
        return undefined;
    }
    return `no base encryption key is configured (MJ_BASE_ENCRYPTION_KEY), so the encrypted fixture cannot be written: ${saveMessage.slice(0, 120)}`;
}
