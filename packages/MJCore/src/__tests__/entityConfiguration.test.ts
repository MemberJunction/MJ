import { describe, it, expect } from 'vitest';
import {
    ApplyFormChromeRules,
    ContributionInclusionFromRules,
    DEFAULT_AUTO_LEFT_NAV_AT,
    DEFAULT_PRIMARY_RELATED_BUDGET,
    ParseEntityConfiguration,
    ParseEntityRelationshipConfiguration,
    ReadRelationshipInclusion,
    ReadRelationshipJoinFields,
    ReadRelationshipSortKey,
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

    it('reads inclusion and join.fields', () => {
        const parsed = ParseEntityRelationshipConfiguration(JSON.stringify({
            UI: { inclusion: 'Primary', join: { mode: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] } },
        }));
        expect(parsed?.UI?.inclusion).toBe('Primary');
        expect(parsed?.UI?.join?.fields).toEqual(['BillToPersonID', 'ShipToPersonID']);
    });
});

describe('ReadRelationshipInclusion / ReadRelationshipJoinFields', () => {
    it('prefers inclusion over FormRole', () => {
        expect(ReadRelationshipInclusion(JSON.stringify({
            UI: { inclusion: 'None', FormRole: 'Primary' },
        }))).toBe('None');
    });

    it('maps FormRole Detail to More', () => {
        expect(ReadRelationshipInclusion(JSON.stringify({ UI: { FormRole: 'Detail' } }))).toBe('More');
        expect(ReadRelationshipInclusion(JSON.stringify({ UI: { FormRole: 'Primary' } }))).toBe('Primary');
    });

    it('reads sortKey from the UI bag', () => {
        expect(ReadRelationshipSortKey(JSON.stringify({ UI: { sortKey: 90 } }))).toBe(90);
        expect(ReadRelationshipSortKey(JSON.stringify({ UI: { inclusion: 'Primary' } }))).toBeNull();
        expect(ReadRelationshipSortKey(null)).toBeNull();
    });

    it('returns null when the bag is Auto', () => {
        expect(ReadRelationshipInclusion(null)).toBeNull();
        expect(ReadRelationshipInclusion('{}')).toBeNull();
    });

    it('reads cleaned join fields', () => {
        expect(ReadRelationshipJoinFields(JSON.stringify({
            UI: { join: { mode: 'any', fields: [' BillToPersonID ', '', 'ShipToPersonID'] } },
        }))).toEqual(['BillToPersonID', 'ShipToPersonID']);
        expect(ReadRelationshipJoinFields(null)).toBeNull();
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

    it('boosts a hub entity with many inbound relationships over a satellite', () => {
        const orders = ScoreRelatedFormRole(candidate({
            ID: 'hub',
            RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
            RelatedEntitySchemaName: ORDERS,
            InboundRelationshipCount: 22,
        }), COMMON);
        const activities = ScoreRelatedFormRole(candidate({
            ID: 'sat',
            RelatedEntity: 'MJ_BizApps_Tasks: Task Activities',
            RelatedEntitySchemaName: 'MJ_BizApps_Tasks',
            InboundRelationshipCount: 2,
        }), COMMON);
        expect(orders).toBeGreaterThan(activities);
    });

    it('penalizes CreatedBy join fields and activity/log satellites', () => {
        const created = ScoreRelatedFormRole(candidate({
            ID: 'cb',
            RelatedEntity: 'MJ_BizApps_Tasks: Tasks',
            RelatedEntityJoinField: 'CreatedByPersonID',
            RelatedEntitySchemaName: 'MJ_BizApps_Tasks',
        }), COMMON);
        const billed = ScoreRelatedFormRole(candidate({
            ID: 'bt',
            RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
            RelatedEntityJoinField: 'BillToPersonID',
            RelatedEntitySchemaName: ORDERS,
            InboundRelationshipCount: 16,
        }), COMMON);
        expect(billed).toBeGreaterThan(created);
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

    it('drops inclusion None before the Auto pool and does not consume budget', () => {
        const comments = candidate({
            ID: 'tc',
            RelatedEntity: 'MJ_BizApps_Tasks: Task Comments',
            RelatedEntitySchemaName: 'MJ_BizApps_Tasks',
            Configuration: JSON.stringify({ UI: { inclusion: 'None' } }),
        });
        const result = ResolveRelatedFormRoles(COMMON, { PrimaryRelatedBudget: 2 }, [contacts, addresses, comments]);
        const dropped = result.Assignments.find((a) => a.RelationshipID === 'tc');
        expect(dropped?.Inclusion).toBe('None');
        expect(dropped?.Role).toBe('Detail');
        expect(dropped?.Reason).toBe('explicit-none');
        expect(result.Assignments.filter((a) => a.Reason === 'under-budget')).toHaveLength(2);
    });

    it('maps inclusion More to Detail and keeps JoinFields on the assignment', () => {
        const billed = {
            ...orders,
            Configuration: JSON.stringify({
                UI: {
                    inclusion: 'More',
                    join: { mode: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] },
                },
            }),
        };
        const result = ResolveRelatedFormRoles(COMMON, null, [contacts, billed]);
        const billedAssignment = result.Assignments.find((a) => a.RelationshipID === billed.ID);
        expect(billedAssignment?.Inclusion).toBe('More');
        expect(billedAssignment?.Role).toBe('Detail');
        expect(billedAssignment?.ExplicitInclusion).toBe('More');
        expect(billedAssignment?.JoinFields).toEqual(['BillToPersonID', 'ShipToPersonID']);
    });

    it('does not offer sibling FKs when one relationship owns join.fields', () => {
        const billed = candidate({
            ID: 'bill',
            RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
            RelatedEntityID: 'orders-entity',
            RelatedEntitySchemaName: ORDERS,
            RelatedEntityJoinField: 'BillToPersonID',
            Configuration: JSON.stringify({
                UI: {
                    inclusion: 'Primary',
                    join: { mode: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] },
                },
            }),
        });
        const sold = candidate({
            ID: 'sold',
            RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
            RelatedEntityID: 'orders-entity',
            RelatedEntitySchemaName: ORDERS,
            RelatedEntityJoinField: 'SoldToPersonID',
        });
        const result = ResolveRelatedFormRoles(COMMON, null, [contacts, billed, sold]);
        expect(result.Assignments.find((a) => a.RelationshipID === 'sold')?.Inclusion).toBe('None');
        expect(result.Assignments.find((a) => a.RelationshipID === 'sold')?.Reason).toBe('join-sibling-none');
        expect(result.Assignments.find((a) => a.RelationshipID === 'bill')?.Inclusion).toBe('Primary');
    });

    it('keeps None out of keep-all-primary', () => {
        const folded = {
            ...orders,
            Configuration: JSON.stringify({ UI: { inclusion: 'None' } }),
        };
        const result = ResolveRelatedFormRoles(
            COMMON,
            { RelatedRolePolicy: 'keep-all-primary' },
            [contacts, folded],
        );
        expect(result.Assignments.find((a) => a.RelationshipID === folded.ID)?.Inclusion).toBe('None');
        expect(result.Assignments.find((a) => a.RelationshipID === contacts.ID)?.Reason).toBe('keep-all-primary');
    });
});

describe('ApplyFormChromeRules', () => {
    const parentId = 'parent-people';
    const contacts = candidate({ ID: 'c', RelatedEntity: 'Contact Methods', RelatedEntityID: 'cm' });
    const orders = candidate({
        ID: 'o',
        RelatedEntity: 'Order Headers',
        RelatedEntityID: 'oh',
        RelatedEntitySchemaName: ORDERS,
    });

    it('pins a related entity to None and can attach JoinFields', () => {
        const resolved = ResolveRelatedFormRoles(COMMON, null, [contacts, orders]);
        const next = ApplyFormChromeRules(parentId, resolved.Assignments, [{
            EntityID: parentId,
            TargetKind: 'Relationship',
            RelatedEntityID: 'oh',
            Inclusion: 'None',
            JoinFields: ['BillToPersonID', 'ShipToPersonID'],
            Sequence: 1,
        }]);
        const order = next.find((a) => a.RelationshipID === 'o');
        expect(order?.Inclusion).toBe('None');
        expect(order?.Reason).toBe('install-none');
        expect(order?.JoinFields).toEqual(['BillToPersonID', 'ShipToPersonID']);
        expect(next.find((a) => a.RelationshipID === 'c')?.Inclusion).toBe('Primary');
    });

    it('last Sequence wins on the same related entity', () => {
        const resolved = ResolveRelatedFormRoles(COMMON, null, [orders]);
        const next = ApplyFormChromeRules(parentId, resolved.Assignments, [
            { EntityID: parentId, TargetKind: 'Relationship', RelatedEntityID: 'oh', Inclusion: 'None', Sequence: 1 },
            { EntityID: parentId, TargetKind: 'Relationship', RelatedEntityID: 'oh', Inclusion: 'Primary', Sequence: 2 },
        ]);
        expect(next[0]?.Inclusion).toBe('Primary');
        expect(next[0]?.Reason).toBe('install-primary');
    });

    it('reads a contribution pin by key', () => {
        expect(ContributionInclusionFromRules(parentId, 'addresses', [{
            EntityID: parentId,
            TargetKind: 'Contribution',
            ContributionKey: 'addresses',
            Inclusion: 'None',
        }])).toBe('None');
        expect(ContributionInclusionFromRules(parentId, 'addresses', [])).toBeNull();
    });
});
