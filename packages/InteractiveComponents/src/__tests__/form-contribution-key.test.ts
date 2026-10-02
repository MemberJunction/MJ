import { describe, it, expect } from 'vitest';
import {
    CONTRIBUTION_KEY_PATTERN,
    FormSectionCamelCase,
    IsPanelContributionKey,
    PanelContributionKey,
    RelatedContributionKey,
    RelatedGridSectionKey,
    ResolveContributionWriteKey,
    StripJoinFieldBrackets,
} from '../forms/form-contribution-key';
import type { FormContributionSpec } from '../forms/form-contribution-spec';

const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';

function spec(over: Partial<FormContributionSpec> = {}): FormContributionSpec {
    return { presentation: 'panel', title: 'Panel', ...over };
}

describe('StripJoinFieldBrackets', () => {
    it('trims and removes one wrapping bracket pair', () => {
        expect(StripJoinFieldBrackets(' [PersonID] ')).toBe('PersonID');
        expect(StripJoinFieldBrackets('PersonID')).toBe('PersonID');
    });

    it('returns an empty string for a missing join', () => {
        expect(StripJoinFieldBrackets(undefined)).toBe('');
        expect(StripJoinFieldBrackets(null)).toBe('');
    });
});

describe('RelatedContributionKey', () => {
    it('builds related:<entity>:<join> with the entity trimmed and the join unwrapped', () => {
        expect(RelatedContributionKey(` ${TICKETS} `, '[PersonID]')).toBe(`related:${TICKETS}:PersonID`);
    });

    it('leaves the join segment empty when there is no join field', () => {
        expect(RelatedContributionKey(TICKETS, null)).toBe(`related:${TICKETS}:`);
    });
});

describe('PanelContributionKey', () => {
    it('builds panel:<name> from a trimmed component name', () => {
        expect(PanelContributionKey('  PersonLtvStrip ')).toBe('panel:PersonLtvStrip');
    });

    it('folds characters a key may not contain, so the key always passes the pattern', () => {
        const key = PanelContributionKey("Person's (LTV) strip");
        expect(key).toBe('panel:Person-s -LTV- strip');
        expect(CONTRIBUTION_KEY_PATTERN.test(key ?? '')).toBe(true);
    });

    it('returns null when the name carries nothing usable', () => {
        expect(PanelContributionKey(undefined)).toBeNull();
        expect(PanelContributionKey('   ')).toBeNull();
        expect(PanelContributionKey("'''")).toBeNull();
    });
});

describe('IsPanelContributionKey', () => {
    it('is true only for a key PanelContributionKey derives', () => {
        expect(IsPanelContributionKey(PanelContributionKey('PersonLtvStrip'))).toBe(true);
        expect(IsPanelContributionKey(RelatedContributionKey(TICKETS, 'PersonID'))).toBe(false);
        expect(IsPanelContributionKey('skip:person-ltv')).toBe(false);
        expect(IsPanelContributionKey(null)).toBe(false);
    });
});

describe('ResolveContributionWriteKey', () => {
    it('uses the author key first, trimmed', () => {
        expect(ResolveContributionWriteKey(
            spec({ contributionKey: '  skip:person-ltv ', relatedJoinField: 'PersonID' }), TICKETS, 'PersonLtvStrip',
        )).toBe('skip:person-ltv');
    });

    it('derives the related key, without the join field brackets, when the spec claims a grid', () => {
        expect(ResolveContributionWriteKey(spec({ relatedJoinField: '[PersonID]' }), TICKETS, 'TicketsPanel'))
            .toBe(`related:${TICKETS}:PersonID`);
    });

    it('derives the panel key from the component name when nothing else supplies one', () => {
        expect(ResolveContributionWriteKey(spec(), null, 'PersonLtvStrip')).toBe('panel:PersonLtvStrip');
    });

    it('returns null when there is no author key, no related entity and no component name', () => {
        expect(ResolveContributionWriteKey(spec(), null)).toBeNull();
        expect(ResolveContributionWriteKey(spec({ contributionKey: '  ' }), '  ', null)).toBeNull();
    });
});

describe('FormSectionCamelCase', () => {
    it('camelCases and strips characters that are not letters or digits', () => {
        expect(FormSectionCamelCase('MJ_BizApps_Orders: Order Headers')).toBe('mJBizAppsOrdersOrderHeaders');
        expect(FormSectionCamelCase('System Metadata')).toBe('systemMetadata');
    });

    it('prefixes a leading digit and names an empty result', () => {
        expect(FormSectionCamelCase('123 go')).toBe('_123Go');
        expect(FormSectionCamelCase('@@@')).toBe('section');
    });
});

describe('RelatedGridSectionKey', () => {
    it('uses the entity name alone when no other grid shows the same entity', () => {
        expect(RelatedGridSectionKey('Order Headers', '[BillToPersonID]', false)).toBe('orderHeaders');
    });

    it('appends the join field when another grid shows the same entity', () => {
        expect(RelatedGridSectionKey('Order Headers', '[BillToPersonID]', true)).toBe('orderHeadersBillToPersonID');
    });
});
