import { describe, it, expect } from 'vitest';
import type { FormPanelRegistrationMetadata, FormPanelSlot } from '../base-form-panel';
import {
    CollapseFormPanelRegistrations,
    ContributionHiddenSectionKeys,
    FormSectionCamelCase,
    RelatedContributionKey,
    RelatedEntitySectionKey,
    ResolveContributionKey,
    ResolveFormContributions,
    StripJoinFieldBrackets,
    type FormContributionRegistration,
    type FormContributionRelationship,
} from '../form-contribution';

const PEOPLE = 'MJ_BizApps_Common: People';
const ORDERS = 'MJ_BizApps_Orders: Order Headers';
const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
const ADDR = 'MJ_BizApps_Common: Addresses';

function rel(
    related: string,
    id: string,
    join: string,
    extras?: Partial<FormContributionRelationship>,
): FormContributionRelationship {
    return {
        RelatedEntity: related,
        RelatedEntityID: id,
        RelatedEntityJoinField: join,
        DisplayInForm: true,
        Sequence: 10,
        ...extras,
    };
}

function reg(
    meta: Partial<FormPanelRegistrationMetadata> & Pick<FormPanelRegistrationMetadata, 'entity' | 'slot'>,
    priority = 0,
): FormContributionRegistration {
    return { Priority: priority, Metadata: { sortKey: 0, ...meta } };
}

const billTo = rel(ORDERS, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BillToPersonID', { Sequence: 1 });
const shipTo = rel(ORDERS, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ShipToPersonID', { Sequence: 2 });
const tickets = rel(TICKETS, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PersonID', { Sequence: 3, DisplayName: 'Event tickets' });
const addresses = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'RecordID', { Sequence: 4 });

describe('FormSectionCamelCase', () => {
    it('matches CodeGen: spaces become camel humps, punctuation becomes spaces', () => {
        // Underscores stay (they are not stripped); only the first char is lowercased —
        // same as CodeGenLib angular-codegen.ts camelCase.
        expect(FormSectionCamelCase('MJ_BizApps_Orders: Order Headers')).toBe('mJBizAppsOrdersOrderHeaders');
        expect(FormSectionCamelCase('Order Headers BillToPersonID')).toBe('orderHeadersBillToPersonID');
    });

    it('prefixes a leading digit and falls back when empty', () => {
        expect(FormSectionCamelCase('123 go')).toBe('_123Go');
        expect(FormSectionCamelCase('@@@')).toBe('section');
    });
});

describe('RelatedEntitySectionKey', () => {
    it('is camelCase(related entity) when the relationship is unique', () => {
        expect(RelatedEntitySectionKey(tickets, [tickets, addresses])).toBe(FormSectionCamelCase(TICKETS));
    });

    it('appends the join field when two FKs point at the same entity', () => {
        const peers = [billTo, shipTo];
        expect(RelatedEntitySectionKey(billTo, peers)).toBe(FormSectionCamelCase(`${ORDERS} BillToPersonID`));
        expect(RelatedEntitySectionKey(shipTo, peers)).toBe(FormSectionCamelCase(`${ORDERS} ShipToPersonID`));
    });

    it('strips wrapping brackets on the join field before camelCase', () => {
        const wrapped = rel(ORDERS, billTo.RelatedEntityID, '[BillToPersonID]');
        const other = rel(ORDERS, billTo.RelatedEntityID, '[ShipToPersonID]');
        expect(RelatedEntitySectionKey(wrapped, [wrapped, other])).toBe(
            FormSectionCamelCase(`${ORDERS} BillToPersonID`),
        );
    });
});

describe('ResolveContributionKey', () => {
    it('uses an explicit contributionKey when set', () => {
        expect(ResolveContributionKey({
            entity: PEOPLE,
            slot: 'after-related',
            contributionKey: 'custom.tickets',
            relatedEntity: TICKETS,
        })).toBe('custom.tickets');
    });

    it('derives related:${entity}:${join} for a claim', () => {
        expect(ResolveContributionKey({
            entity: PEOPLE,
            slot: 'after-related',
            relatedEntity: TICKETS,
            relatedJoinField: '[PersonID]',
        })).toBe(RelatedContributionKey(TICKETS, 'PersonID'));
    });

    it('returns empty when the panel is an extra (no related, no key)', () => {
        expect(ResolveContributionKey({ entity: PEOPLE, slot: 'after-fields' })).toBe('');
    });
});

describe('ResolveFormContributions', () => {
    const isaChildId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

    it('emits a stock grid for an unclaimed, unbaked DisplayInForm relationship', () => {
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets],
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toHaveLength(1);
        expect(result.StockGrids[0].RelatedEntity).toBe(TICKETS);
        expect(result.StockGrids[0].DisplayName).toBe('Event tickets');
        expect(result.HiddenBakedSectionKeys).toEqual([]);
    });

    it('skips a stock grid when the form already baked that section', () => {
        const baked = RelatedEntitySectionKey(addresses, [addresses]);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [addresses],
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [baked],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toEqual([]);
    });

    it('skips IS-A child relationships (CodeGen does too)', () => {
        const child = rel('MJ: Event Order Line ISA', isaChildId, 'ID', { Sequence: 1 });
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [child],
            IsaChildEntityIDs: [isaChildId],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toEqual([]);
    });

    it('skips DisplayInForm=false', () => {
        const hidden = rel(TICKETS, tickets.RelatedEntityID, 'PersonID', { DisplayInForm: false });
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [hidden],
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toEqual([]);
    });

    it('does not emit stock grids when ShowRelatedEntities is false', () => {
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets],
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: false,
        });
        expect(result.StockGrids).toEqual([]);
    });

    it('a related claim replaces the stock grid and hides a baked section', () => {
        const baked = RelatedEntitySectionKey(tickets, [tickets]);
        const claim = reg({
            entity: PEOPLE,
            slot: 'after-related' as FormPanelSlot,
            relatedEntity: TICKETS,
            relatedJoinField: 'PersonID',
            sortKey: 80,
        }, 10);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets, addresses],
            IsaChildEntityIDs: [],
            Registrations: [claim],
            BakedSectionKeys: [baked],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids.map((g) => g.RelatedEntity)).toEqual([ADDR]);
        expect(result.HiddenBakedSectionKeys).toEqual([baked]);
        expect(result.Winners.some((w) => w.Kind === 'registered' && w.RelatedEntity === TICKETS)).toBe(true);
    });

    it('highest Priority wins when two panels claim the same relationship', () => {
        const low = reg({
            entity: PEOPLE,
            slot: 'after-related',
            relatedEntity: TICKETS,
            sortKey: 10,
        }, 1);
        const high = reg({
            entity: PEOPLE,
            slot: 'after-fields',
            relatedEntity: TICKETS,
            sortKey: 5,
        }, 50);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets],
            IsaChildEntityIDs: [],
            Registrations: [low, high],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        const claimed = result.Winners.filter((w) => w.Kind === 'registered' && w.RelatedEntity === TICKETS);
        expect(claimed).toHaveLength(1);
        expect(claimed[0].Priority).toBe(50);
        expect(claimed[0].Slot).toBe('after-fields');
        expect(result.StockGrids).toEqual([]);
    });

    it('BillTo and ShipTo are distinct contribution keys', () => {
        const claimBill = reg({
            entity: PEOPLE,
            slot: 'after-related',
            relatedEntity: ORDERS,
            relatedJoinField: 'BillToPersonID',
        }, 1);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [billTo, shipTo],
            IsaChildEntityIDs: [],
            Registrations: [claimBill],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toHaveLength(1);
        expect(result.StockGrids[0].RelatedJoinField).toBe('ShipToPersonID');
    });

    it('ignores registrations for a different entity', () => {
        const other = reg({
            entity: 'MJ_BizApps_Common: Organizations',
            slot: 'after-related',
            relatedEntity: TICKETS,
        }, 99);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets],
            IsaChildEntityIDs: [],
            Registrations: [other],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.StockGrids).toHaveLength(1);
        expect(result.Winners.filter((w) => w.Kind === 'registered')).toEqual([]);
    });

    it('wildcard extras apply; wildcard related claims do not', () => {
        const extra = reg({ entity: '*', slot: 'after-fields', contributionKey: 'fleet.predictions', sortKey: 40 });
        const badClaim = reg({ entity: '*', slot: 'after-related', relatedEntity: TICKETS }, 99);
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [tickets],
            IsaChildEntityIDs: [],
            Registrations: [extra, badClaim],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.Winners.some((w) => w.ContributionKey === 'fleet.predictions')).toBe(true);
        expect(result.StockGrids).toHaveLength(1);
    });

    it('a header contribution can sit in before-fields and replace Details', () => {
        const hero = reg({
            entity: 'MJ_BizApps_Orders: Order Headers',
            slot: 'before-fields',
            contributionKey: 'header',
            replacesSectionKey: 'details',
            sortKey: 100,
        }, 10);
        const result = ResolveFormContributions({
            EntityName: 'MJ_BizApps_Orders: Order Headers',
            RelatedEntities: [],
            IsaChildEntityIDs: [],
            Registrations: [hero],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        const winner = result.Winners.find((w) => w.ContributionKey === 'header');
        expect(winner?.Slot).toBe('before-fields');
        expect(winner?.ReplacesSectionKey).toBe('details');
        expect(result.StockGrids).toEqual([]);
    });

    it('two headers with the same contributionKey last-wins by Priority', () => {
        const common = reg({
            entity: PEOPLE,
            slot: 'before-fields',
            contributionKey: 'header',
            replacesSectionKey: 'personalIdentity',
        }, 0);
        const orders = reg({
            entity: PEOPLE,
            slot: 'before-fields',
            contributionKey: 'header',
            replacesSectionKey: 'personalIdentity',
        }, 10);
        const collapsed = CollapseFormPanelRegistrations([common, orders]);
        expect(collapsed).toHaveLength(1);
        expect(collapsed[0].Priority).toBe(10);
    });

    it('two extras without a contributionKey do not collapse', () => {
        const a = reg({ entity: PEOPLE, slot: 'after-fields', sortKey: 10 });
        const b = reg({ entity: PEOPLE, slot: 'before-fields', sortKey: 20 });
        const result = ResolveFormContributions({
            EntityName: PEOPLE,
            RelatedEntities: [],
            IsaChildEntityIDs: [],
            Registrations: [a, b],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });
        expect(result.Winners.filter((w) => w.Kind === 'registered')).toHaveLength(2);
    });
});

describe('ContributionHiddenSectionKeys', () => {
    it('returns the CodeGen section key for each claimed relationship', () => {
        const keys = ContributionHiddenSectionKeys(
            PEOPLE,
            [tickets, addresses],
            [],
            [reg({ entity: PEOPLE, slot: 'after-related', relatedEntity: TICKETS })],
        );
        expect(keys).toEqual([RelatedEntitySectionKey(tickets, [tickets, addresses])]);
    });

    it('includes replacesSectionKey for a field-panel takeover', () => {
        const keys = ContributionHiddenSectionKeys(
            PEOPLE,
            [],
            [],
            [reg({
                entity: PEOPLE,
                slot: 'before-fields',
                contributionKey: 'header',
                replacesSectionKey: 'personalIdentity',
                sortKey: 100,
            })],
        );
        expect(keys).toEqual(['personalIdentity']);
    });

    it('hides both a field section and a related grid when one winner claims both', () => {
        const keys = ContributionHiddenSectionKeys(
            PEOPLE,
            [tickets],
            [],
            [reg({
                entity: PEOPLE,
                slot: 'before-fields',
                contributionKey: 'header',
                replacesSectionKey: 'details',
                relatedEntity: TICKETS,
            })],
        );
        expect(keys).toContain('details');
        expect(keys).toContain(RelatedEntitySectionKey(tickets, [tickets]));
    });

    it('ignores a wildcard registration that tries to replace a field section', () => {
        const keys = ContributionHiddenSectionKeys(
            PEOPLE,
            [],
            [],
            [reg({
                entity: '*',
                slot: 'before-fields',
                replacesSectionKey: 'details',
            }, 99)],
        );
        expect(keys).toEqual([]);
    });

    it('returns empty when nothing is claimed', () => {
        expect(ContributionHiddenSectionKeys(PEOPLE, [tickets], [], [])).toEqual([]);
    });
});

describe('StripJoinFieldBrackets', () => {
    it('trims and unwraps', () => {
        expect(StripJoinFieldBrackets(' [PersonID] ')).toBe('PersonID');
        expect(StripJoinFieldBrackets(undefined)).toBe('');
    });
});
