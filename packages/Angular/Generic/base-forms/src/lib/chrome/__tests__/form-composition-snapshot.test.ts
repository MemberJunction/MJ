// packages/Angular/Generic/base-forms/src/lib/chrome/__tests__/form-composition-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { BuildFormCompositionSnapshot } from '../form-composition-snapshot';
import type { FormContributionRegistration, FormContributionRelationship } from '../../panel-slot/form-contribution';

const PEOPLE = 'MJ_BizApps_Common: People';
const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
const ADDR = 'MJ_BizApps_Common: Addresses';

const rel = (related: string, id: string, join: string, seq: number): FormContributionRelationship =>
    ({ RelatedEntity: related, RelatedEntityID: id, RelatedEntityJoinField: join, DisplayInForm: true, Sequence: seq });

const tickets = rel(TICKETS, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PersonID', 1);
const addresses = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'RecordID', 2);

const regs: FormContributionRegistration[] = [
    { Priority: 0, Source: 'class', Metadata: { entity: PEOPLE, slot: 'before-fields', contributionKey: 'header', presentation: 'bare' } },
    { Priority: 0, Source: 'metadata', ComponentID: 'c1', Title: 'Tickets as cards', Presentation: 'panel',
      Metadata: { entity: PEOPLE, slot: 'after-related', relatedEntity: TICKETS, relatedJoinField: 'PersonID' } },
];

describe('BuildFormCompositionSnapshot', () => {
    const snapshot = BuildFormCompositionSnapshot({
        EntityName: PEOPLE,
        RecordPrimaryKey: 'ID|person-1',
        Layout: 'left-nav',
        Groups: [{ Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['details', 'personalIdentity'], IsMore: false }],
        Panels: [
            { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
            { SectionKey: 'personalIdentity', SectionName: 'Personal Identity', Variant: 'default' },
            { SectionKey: 'mJBizAppsCommonAddresses', SectionName: 'Addresses', Variant: 'related-entity' },
        ],
        HiddenSectionKeys: new Set(['personalIdentity']),
        RelatedEntities: [tickets, addresses],
        IsaChildEntityIDs: [],
        BakedSectionKeys: ['mJBizAppsCommonAddresses'],
        Registrations: regs,
        RelatedRoles: new Map([['mJBizAppsCommonAddresses', 'Primary']]),
        HiddenContributionKeys: new Set(),
        SlotsPresent: ['before-fields', 'after-fields', 'after-everything'],
        ChromeRuleCount: 2,
    });

    it('lists sections with their rail group and hidden flag', () => {
        expect(snapshot.Sections).toEqual([
            { Key: 'details', Title: 'Details', Variant: 'default', Group: 'details', Hidden: false, Fields: [] },
            { Key: 'personalIdentity', Title: 'Personal Identity', Variant: 'default', Group: 'details', Hidden: true, Fields: [] },
            { Key: 'mJBizAppsCommonAddresses', Title: 'Addresses', Variant: 'related-entity', Group: null, Hidden: false, Fields: [] },
        ]);
    });

    it('classifies related grids as baked / stock / claimed with their inclusion', () => {
        expect(snapshot.Related).toEqual([
            { Entity: TICKETS, JoinField: 'PersonID', SectionKey: 'mJBizAppsOrdersEventOrderLines', Inclusion: 'Auto', Source: 'claimed' },
            { Entity: ADDR, JoinField: 'RecordID', SectionKey: 'mJBizAppsCommonAddresses', Inclusion: 'Primary', Source: 'baked' },
        ]);
    });

    it('lists collapsed contributions with source and presentation', () => {
        expect(snapshot.Contributions).toEqual([
            { Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'header', Presentation: 'bare', Hidden: false, Precedence: 0, SortKey: 0 },
            { Key: `related:${TICKETS}:PersonID`, Slot: 'after-related', Source: 'metadata', Title: 'Tickets as cards', Presentation: 'panel', Hidden: false, Precedence: 0, SortKey: 0, ReplacesPlace: true },
        ]);
    });

    it('carries entity, layout, slots and rule count', () => {
        expect(snapshot).toMatchObject({ Entity: PEOPLE, Layout: 'left-nav', SlotsPresent: ['before-fields', 'after-fields', 'after-everything'], ChromeRuleCount: 2 });
    });
});
