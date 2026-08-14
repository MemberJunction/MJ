import { describe, it, expect } from 'vitest';
import {
    DEFAULT_AUTO_LEFT_NAV_AT,
    DEFAULT_PRIMARY_RELATED_BUDGET,
    ParseEntityConfiguration,
    ParseEntityRelationshipConfiguration,
    RELATED_ROLE_SCORE,
    ResolveFormLayout,
    ResolveRelatedFormRoles,
    ScoreRelatedFormRole,
    type RelatedFormRoleCandidate,
} from '../generic/entityConfiguration';

const COMMON = 'MJ_BizApps_Common';
const ORDERS = 'MJ_BizApps_Orders';

function candidate(partial: Partial<RelatedFormRoleCandidate> & Pick<RelatedFormRoleCandidate, 'ID' | 'RelatedEntity'>): RelatedFormRoleCandidate {
    return {
        RelatedEntityID: partial.ID,
        RelatedEntityJoinField: 'PersonID',
        RelatedEntitySchemaName: COMMON,
        DisplayInForm: true,
        DisplayLocation: 'After Field Tabs',
        Type: 'One to Many',
        Sequence: 10,
        ...partial,
    };
}

describe('ParseEntityConfiguration', () => {
    it('returns null for empty input', () => {
        expect(ParseEntityConfiguration(null)).toBeNull();
        expect(ParseEntityConfiguration('')).toBeNull();
        expect(ParseEntityConfiguration('   ')).toBeNull();
    });

    it('parses a form bag', () => {
        const parsed = ParseEntityConfiguration(JSON.stringify({
            UI: { Form: { Layout: 'left-nav', RelatedRolePolicy: 'smart', PrimaryRelatedBudget: 4 } },
        }));
        expect(parsed?.UI?.Form?.Layout).toBe('left-nav');
        expect(parsed?.UI?.Form?.PrimaryRelatedBudget).toBe(4);
    });
});

describe('ParseEntityRelationshipConfiguration', () => {
    it('reads FormRole', () => {
        const parsed = ParseEntityRelationshipConfiguration(JSON.stringify({ UI: { FormRole: 'Detail' } }));
        expect(parsed?.UI?.FormRole).toBe('Detail');
    });
});

describe('ResolveFormLayout', () => {
    it('honors an explicit accordion or left-nav', () => {
        expect(ResolveFormLayout({ Layout: 'accordion' }, 40)).toBe('accordion');
        expect(ResolveFormLayout({ Layout: 'left-nav' }, 2)).toBe('left-nav');
    });

    it('auto switches at the threshold (default 8)', () => {
        expect(ResolveFormLayout(null, DEFAULT_AUTO_LEFT_NAV_AT - 1)).toBe('accordion');
        expect(ResolveFormLayout(undefined, DEFAULT_AUTO_LEFT_NAV_AT)).toBe('left-nav');
        expect(ResolveFormLayout({ AutoLeftNavAt: 3 }, 3)).toBe('left-nav');
        expect(ResolveFormLayout({ Layout: 'auto', AutoLeftNavAt: 3 }, 2)).toBe('accordion');
    });
});

describe('ScoreRelatedFormRole', () => {
    it('rewards same-schema 1:N children', () => {
        const score = ScoreRelatedFormRole(candidate({
            ID: '1',
            RelatedEntity: 'MJ_BizApps_Common: Contact Methods',
            Sequence: 1,
        }), COMMON);
        expect(score).toBeGreaterThanOrEqual(
            RELATED_ROLE_SCORE.SameSchema + RELATED_ROLE_SCORE.OneToMany,
        );
    });

    it('rewards declared collections and custom display components', () => {
        const score = ScoreRelatedFormRole(candidate({
            ID: '2',
            RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
            RelatedEntitySchemaName: ORDERS,
            RelatedRecordCollection: '{"Name":"Lines"}',
            DisplayComponentID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }), ORDERS);
        expect(score).toBeGreaterThanOrEqual(
            RELATED_ROLE_SCORE.RelatedRecordCollection + RELATED_ROLE_SCORE.CustomDisplayComponent + RELATED_ROLE_SCORE.SameSchema,
        );
    });

    it('penalizes platform plumbing hanging off a business entity', () => {
        const business = ScoreRelatedFormRole(candidate({
            ID: '3',
            RelatedEntity: 'MJ_BizApps_Common: Contact Methods',
        }), COMMON);
        const platform = ScoreRelatedFormRole(candidate({
            ID: '4',
            RelatedEntity: 'MJ: Record Changes',
            RelatedEntitySchemaName: '__mj',
        }), COMMON);
        expect(platform).toBeLessThan(business);
        expect(business - platform).toBeGreaterThanOrEqual(
            RELATED_ROLE_SCORE.SameSchema - RELATED_ROLE_SCORE.PlatformSchema,
        );
    });

    it('does not penalize __mj children of an __mj parent', () => {
        const score = ScoreRelatedFormRole(candidate({
            ID: '5',
            RelatedEntity: 'MJ: Entity Fields',
            RelatedEntitySchemaName: '__mj',
        }), '__mj');
        expect(score).toBeGreaterThan(0);
    });

    it('treats a JoinView as not 1:N', () => {
        const one = ScoreRelatedFormRole(candidate({
            ID: '6',
            RelatedEntity: 'One',
            JoinView: null,
        }), COMMON);
        const many = ScoreRelatedFormRole(candidate({
            ID: '7',
            RelatedEntity: 'Many',
            JoinView: 'vwPersonTags',
        }), COMMON);
        expect(one - many).toBe(RELATED_ROLE_SCORE.OneToMany);
    });
});

describe('ResolveRelatedFormRoles', () => {
    const contacts = candidate({ ID: 'c', RelatedEntity: 'MJ_BizApps_Common: Contact Methods', Sequence: 1 });
    const addresses = candidate({ ID: 'a', RelatedEntity: 'MJ_BizApps_Common: Addresses', Sequence: 2 });
    const relationships = candidate({ ID: 'r', RelatedEntity: 'MJ_BizApps_Common: Relationships', Sequence: 3 });
    const hierarchy = candidate({ ID: 'h', RelatedEntity: 'MJ_BizApps_Common: Organization Hierarchy', Sequence: 4 });
    const orders = candidate({
        ID: 'o',
        RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
        RelatedEntitySchemaName: ORDERS,
        RelatedEntityJoinField: 'BillToPersonID',
        Sequence: 10,
    });
    const tasks = candidate({
        ID: 't',
        RelatedEntity: 'MJ_BizApps_Tasks: Tasks',
        RelatedEntitySchemaName: 'MJ_BizApps_Tasks',
        Sequence: 20,
    });
    const issues = candidate({
        ID: 'i',
        RelatedEntity: 'MJ_BizApps_Issues: Issues',
        RelatedEntitySchemaName: 'MJ_BizApps_Issues',
        Sequence: 30,
    });
    const recordChanges = candidate({
        ID: 'rc',
        RelatedEntity: 'MJ: Record Changes',
        RelatedEntitySchemaName: '__mj',
        Sequence: 90,
    });

    it('keeps every related Primary when the set is at or under the budget', () => {
        const result = ResolveRelatedFormRoles(COMMON, null, [contacts, addresses, orders]);
        expect(result.Policy).toBe('smart');
        expect(result.Budget).toBe(DEFAULT_PRIMARY_RELATED_BUDGET);
        expect(result.Assignments.every((a) => a.Role === 'Primary')).toBe(true);
        expect(result.Assignments.every((a) => a.Reason === 'under-budget')).toBe(true);
    });

    it('does not dump everything into More when the set exceeds the budget', () => {
        const result = ResolveRelatedFormRoles(
            COMMON,
            { PrimaryRelatedBudget: 4 },
            [contacts, addresses, relationships, hierarchy, orders, tasks, issues, recordChanges],
        );
        const primary = result.Assignments.filter((a) => a.Role === 'Primary');
        const detail = result.Assignments.filter((a) => a.Role === 'Detail');
        expect(primary.length).toBe(4);
        expect(detail.length).toBe(4);
        expect(primary.map((a) => a.RelatedEntity)).toEqual(expect.arrayContaining([
            contacts.RelatedEntity,
            addresses.RelatedEntity,
            relationships.RelatedEntity,
            hierarchy.RelatedEntity,
        ]));
        expect(detail.map((a) => a.RelatedEntity)).toEqual(expect.arrayContaining([
            orders.RelatedEntity,
            tasks.RelatedEntity,
            issues.RelatedEntity,
            recordChanges.RelatedEntity,
        ]));
    });

    it('lets an explicit Primary punch through the budget', () => {
        const billed = {
            ...orders,
            Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
        };
        const result = ResolveRelatedFormRoles(
            COMMON,
            { PrimaryRelatedBudget: 3 },
            [contacts, addresses, relationships, billed, tasks, issues],
        );
        const billedAssignment = result.Assignments.find((a) => a.RelationshipID === billed.ID);
        expect(billedAssignment?.Role).toBe('Primary');
        expect(billedAssignment?.Reason).toBe('explicit-primary');
        expect(result.Assignments.filter((a) => a.Role === 'Primary').length).toBe(4);
    });

    it('lets an explicit Detail fold even when under budget', () => {
        const folded = {
            ...orders,
            Configuration: JSON.stringify({ UI: { FormRole: 'Detail' } }),
        };
        const result = ResolveRelatedFormRoles(COMMON, null, [contacts, folded]);
        expect(result.Assignments.find((a) => a.RelationshipID === folded.ID)?.Role).toBe('Detail');
        expect(result.Assignments.find((a) => a.RelationshipID === contacts.ID)?.Role).toBe('Primary');
    });

    it('keep-all-primary restores today', () => {
        const result = ResolveRelatedFormRoles(
            COMMON,
            { RelatedRolePolicy: 'keep-all-primary', PrimaryRelatedBudget: 1 },
            [contacts, orders, tasks, issues, recordChanges],
        );
        expect(result.Assignments.every((a) => a.Role === 'Primary')).toBe(true);
        expect(result.Assignments.every((a) => a.Reason === 'keep-all-primary')).toBe(true);
    });

    it('skips relationships that are not DisplayInForm', () => {
        const hidden = candidate({ ID: 'x', RelatedEntity: 'Hidden', DisplayInForm: false });
        const result = ResolveRelatedFormRoles(COMMON, null, [contacts, hidden]);
        expect(result.Assignments.map((a) => a.RelationshipID)).toEqual(['c']);
    });
});
