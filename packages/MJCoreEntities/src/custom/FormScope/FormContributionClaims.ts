import type { FormContributionSpecColumns } from './FormContributionRow';

/**
 * The claim rules of `MJ: Entity Form Contributions`, checked in code before anything is written.
 *
 * The database enforces the same rules with CHECK constraints, but a refused row save comes after
 * its component was written. Lives here, beside the spec-to-row mapper, so the server and the
 * browser can check a row the same way.
 */

/** The columns the claim rules read. */
export type ContributionClaimColumns = Pick<FormContributionSpecColumns,
    | 'Presentation' | 'Inclusion' | 'ChromeGroup' | 'RelatedEntityID' | 'RelatedJoinField'
    | 'ReplacesSectionKey' | 'ReplacesSectionKeys' | 'ReplacesFieldNames' | 'InSectionKey' | 'SectionPosition'>;

/** Each claim column, with the spec field an author sets to make that claim. */
const CLAIMS: ReadonlyArray<{ Column: keyof ContributionClaimColumns; SpecField: string }> = [
    { Column: 'RelatedEntityID', SpecField: 'relatedEntity' },
    { Column: 'ReplacesSectionKey', SpecField: 'replacesSectionKey' },
    { Column: 'ReplacesSectionKeys', SpecField: 'replacesSectionKeys' },
    { Column: 'ReplacesFieldNames', SpecField: 'replacesFieldNames' },
    { Column: 'InSectionKey', SpecField: 'inSectionKey' },
];

/**
 * Why the database would refuse this row's claim, or null when it would not.
 *
 * Checks `CK_EntityFormContribution_OneClaim` (a related grid, one section, several sections,
 * fields of one section, or a place inside a section — at most one), `BareNoChrome`,
 * `JoinNeedsRelated` and `SectionPositionNeedsSection`. The message names the spec fields, so an
 * agent can correct its spec.
 */
export function ContributionClaimRefusal(row: ContributionClaimColumns): string | null {
    const made = CLAIMS.filter((claim) => row[claim.Column] != null).map((claim) => claim.SpecField);
    if (made.length > 1) {
        return `A form contribution makes one claim at most, but this one sets ${made.join(' and ')}. Keep one of them.`;
    }
    if (row.Presentation === 'bare' && (row.Inclusion != null || row.ChromeGroup != null)) {
        return 'A bare panel is never a rail item, so it takes no inclusion or chromeGroup.';
    }
    if (row.RelatedJoinField != null && row.RelatedEntityID == null) {
        return 'relatedJoinField qualifies a related-grid claim, so it needs relatedEntity.';
    }
    if (row.SectionPosition != null && row.ReplacesFieldNames == null && row.InSectionKey == null) {
        return 'sectionPosition places a panel inside a section, so it needs inSectionKey or replacesFieldNames.';
    }
    return null;
}
