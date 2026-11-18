import { describe, expect, it } from 'vitest';
import { ArtifactGuestSharingEnabledDefault } from '../magicLinkConfigUnits.js';

describe('ArtifactGuestSharingEnabledDefault (MJ_ARTIFACT_GUEST_SHARING_ENABLED)', () => {
    it('stays off by default when unset, blank, or false, and opts in only on truthy values', () => {
        expect(ArtifactGuestSharingEnabledDefault(undefined)).toBe(false);
        expect(ArtifactGuestSharingEnabledDefault(null)).toBe(false);
        expect(ArtifactGuestSharingEnabledDefault('')).toBe(false);
        expect(ArtifactGuestSharingEnabledDefault('   ')).toBe(false);
        expect(ArtifactGuestSharingEnabledDefault('false')).toBe(false);
        expect(ArtifactGuestSharingEnabledDefault('0')).toBe(false);

        expect(ArtifactGuestSharingEnabledDefault('true')).toBe(true);
        expect(ArtifactGuestSharingEnabledDefault('1')).toBe(true);
    });
});
