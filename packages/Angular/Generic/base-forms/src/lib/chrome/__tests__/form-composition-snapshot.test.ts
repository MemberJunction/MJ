// packages/Angular/Generic/base-forms/src/lib/chrome/__tests__/form-composition-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { BuildFormAgentContext, BuildFormCompositionSnapshot, type FormCompositionChoice } from '../form-composition-snapshot';
import type { FormContributionRegistration, FormContributionRelationship } from '../../panel-slot/form-contribution';

const PEOPLE = 'MJ_BizApps_Common: People';
const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
const ADDR = 'MJ_BizApps_Common: Addresses';

const rel = (related: string, id: string, join: string, seq: number): FormContributionRelationship =>
    ({ RelatedEntity: related, RelatedEntityID: id, RelatedEntityJoinField: join, DisplayInForm: true, Sequence: seq });

const tickets = rel(TICKETS, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PersonID', 1);
const addresses = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'RecordID', 2);

const STANDARD_FORM: FormCompositionChoice = { FullCustomForm: false, OverrideID: null, Label: 'Default form' };

const regs: FormContributionRegistration[] = [
    { Priority: 0, Source: 'class', Metadata: { entity: PEOPLE, slot: 'before-fields', contributionKey: 'header', presentation: 'bare' } },
    { Priority: 0, Source: 'metadata', ComponentID: 'c1', Title: 'Tickets as cards', Presentation: 'panel',
      Metadata: { entity: PEOPLE, slot: 'after-related', relatedEntity: TICKETS, relatedJoinField: 'PersonID' } },
];

describe('BuildFormCompositionSnapshot', () => {
    const snapshot = BuildFormCompositionSnapshot({
        EntityName: PEOPLE,
        RecordPrimaryKey: 'ID|person-1',
        FormChoice: STANDARD_FORM,
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

    it('carries entity, form choice, layout, slots and rule count', () => {
        expect(snapshot).toMatchObject({
            Entity: PEOPLE, FormChoice: STANDARD_FORM, Layout: 'left-nav',
            SlotsPresent: ['before-fields', 'after-fields', 'after-everything'], ChromeRuleCount: 2,
        });
    });

    it('keys each grid once against every peer, two grids on one entity by their join field', () => {
        const billTo = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'BillToID', 3);
        const shipTo = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ShipToID', 4);
        const both = BuildFormCompositionSnapshot({
            EntityName: PEOPLE, RecordPrimaryKey: null, FormChoice: STANDARD_FORM, Layout: 'accordion', Groups: [], Panels: [],
            HiddenSectionKeys: new Set(), RelatedEntities: [tickets, billTo, shipTo], IsaChildEntityIDs: [], BakedSectionKeys: [],
            Registrations: [], RelatedRoles: new Map(), HiddenContributionKeys: new Set(), SlotsPresent: [], ChromeRuleCount: 0,
        });
        expect(both.Related.map((r) => r.SectionKey)).toEqual([
            'mJBizAppsOrdersEventOrderLines', 'mJBizAppsCommonAddressesBillToID', 'mJBizAppsCommonAddressesShipToID',
        ]);
    });

    it('gives the same JSON for the same input, which the container compares, and other JSON once a section is hidden', () => {
        const again = BuildFormCompositionSnapshot({
            EntityName: PEOPLE, RecordPrimaryKey: 'ID|person-1', FormChoice: STANDARD_FORM, Layout: 'left-nav',
            Groups: [{ Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['details', 'personalIdentity'], IsMore: false }],
            Panels: [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'personalIdentity', SectionName: 'Personal Identity', Variant: 'default' },
                { SectionKey: 'mJBizAppsCommonAddresses', SectionName: 'Addresses', Variant: 'related-entity' },
            ],
            HiddenSectionKeys: new Set(['personalIdentity']), RelatedEntities: [tickets, addresses], IsaChildEntityIDs: [],
            BakedSectionKeys: ['mJBizAppsCommonAddresses'], Registrations: regs,
            RelatedRoles: new Map([['mJBizAppsCommonAddresses', 'Primary']]), HiddenContributionKeys: new Set(),
            SlotsPresent: ['before-fields', 'after-fields', 'after-everything'], ChromeRuleCount: 2,
        });
        expect(JSON.stringify(again)).toBe(JSON.stringify(snapshot));
        const changed = { ...again, Sections: again.Sections.map((s) => ({ ...s, Hidden: true })) };
        expect(JSON.stringify(changed)).not.toBe(JSON.stringify(snapshot));
    });
});

/**
 * Every value of the agent context goes into every agent prompt, so the agent gets a compact form
 * of the snapshot: which form, which record, and each section with the contribution that holds it.
 */
describe('BuildFormAgentContext', () => {
    const snapshot = BuildFormCompositionSnapshot({
        EntityName: PEOPLE,
        RecordPrimaryKey: 'ID|person-1',
        FormChoice: STANDARD_FORM,
        Layout: 'left-nav',
        Groups: [{ Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['details'], IsMore: false }],
        Panels: [
            { SectionKey: 'details', SectionName: 'Details', Variant: 'default', Fields: [{ Name: 'Email', Label: 'Email' } as never] },
            { SectionKey: 'notes', SectionName: 'Notes', Variant: 'default' },
            { SectionKey: 'mJBizAppsOrdersEventOrderLines', SectionName: 'Tickets', Variant: 'related-entity' },
            { SectionKey: 'skip:ltv', SectionName: 'Lifetime value', Variant: 'default' },
        ],
        HiddenSectionKeys: new Set(['notes', 'mJBizAppsOrdersEventOrderLines']),
        RelatedEntities: [tickets],
        IsaChildEntityIDs: [],
        BakedSectionKeys: [],
        Registrations: [
            regs[1],
            { Priority: 0, Source: 'metadata', ComponentID: 'c2', Title: 'Notes card', Presentation: 'panel',
              Metadata: { entity: PEOPLE, slot: 'after-fields', contributionKey: 'notes-card', replacesSectionKey: 'notes' } },
            { Priority: 0, Source: 'metadata', ComponentID: 'c3', Title: 'Lifetime value', Presentation: 'panel',
              Metadata: { entity: PEOPLE, slot: 'after-fields', contributionKey: 'skip:ltv' } },
        ],
        RelatedRoles: new Map(),
        HiddenContributionKeys: new Set(),
        SlotsPresent: ['before-fields'],
        ChromeRuleCount: 0,
    });
    const context = BuildFormAgentContext(snapshot);

    it('carries the entity, the record and the form choice', () => {
        expect(context).toMatchObject({ Entity: PEOPLE, RecordPrimaryKey: 'ID|person-1', FormChoice: STANDARD_FORM });
    });

    it('lists each section with the contribution that draws it or stands in for it', () => {
        expect(context.Sections).toEqual([
            { Key: 'details', Title: 'Details', Variant: 'default', Hidden: false, ContributionKey: null },
            { Key: 'notes', Title: 'Notes', Variant: 'default', Hidden: true, ContributionKey: 'notes-card' },
            { Key: 'mJBizAppsOrdersEventOrderLines', Title: 'Tickets', Variant: 'related-entity', Hidden: true, ContributionKey: `related:${TICKETS}:PersonID` },
            { Key: 'skip:ltv', Title: 'Lifetime value', Variant: 'default', Hidden: false, ContributionKey: 'skip:ltv' },
        ]);
    });

    it('leaves out the fields, the rail and the contribution details', () => {
        expect(Object.keys(context).sort()).toEqual(['Entity', 'FormChoice', 'RecordPrimaryKey', 'Sections']);
        expect(JSON.stringify(context)).not.toContain('Email');
    });

    it('names no holder for a section whose replacing panel the user hid, and reports the section as drawn', () => {
        const hiddenReplacer = BuildFormCompositionSnapshot({
            EntityName: PEOPLE, RecordPrimaryKey: 'ID|person-1', FormChoice: STANDARD_FORM, Layout: 'accordion', Groups: [],
            Panels: [{ SectionKey: 'notes', SectionName: 'Notes', Variant: 'default' }],
            HiddenSectionKeys: new Set(),
            RelatedEntities: [], IsaChildEntityIDs: [], BakedSectionKeys: [],
            Registrations: [
                { Priority: 0, Source: 'metadata', ComponentID: 'c2', Scope: 'Global', Title: 'Notes card', Presentation: 'panel',
                  Metadata: { entity: PEOPLE, slot: 'after-fields', contributionKey: 'notes-card', replacesSectionKey: 'notes' } },
            ],
            HiddenPanelKeys: ['notes-card'],
            RelatedRoles: new Map(), HiddenContributionKeys: new Set(), SlotsPresent: ['before-fields'], ChromeRuleCount: 0,
        });
        expect(hiddenReplacer.Contributions).toEqual([expect.objectContaining({ Key: 'notes-card', Hidden: true })]);
        expect(BuildFormAgentContext(hiddenReplacer).Sections).toEqual([
            { Key: 'notes', Title: 'Notes', Variant: 'default', Hidden: false, ContributionKey: null },
        ]);
    });
});

/**
 * The apply flow reads a key's holder from the snapshot, and a panel the user hid still holds its
 * key. So the snapshot lists it, marked hidden, the same way the apply flow finds it without one.
 */
describe('BuildFormCompositionSnapshot — panels the user hid', () => {
    const TICKETS_KEY = `related:${TICKETS}:PersonID`;
    const compiledTickets: FormContributionRegistration = {
        Priority: 2, Source: 'class', Title: 'Tickets', Registration: { Key: 'people:tickets' } as FormContributionRegistration['Registration'],
        Metadata: { entity: PEOPLE, slot: 'after-related', relatedEntity: TICKETS, relatedJoinField: 'PersonID' },
    };
    const build = (hidden: string[]) => BuildFormCompositionSnapshot({
        EntityName: PEOPLE,
        RecordPrimaryKey: null,
        FormChoice: STANDARD_FORM,
        Layout: 'accordion',
        Groups: [],
        Panels: [],
        HiddenSectionKeys: new Set(),
        RelatedEntities: [tickets],
        IsaChildEntityIDs: [],
        BakedSectionKeys: [],
        Registrations: [compiledTickets],
        HiddenPanelKeys: hidden,
        RelatedRoles: new Map(),
        HiddenContributionKeys: new Set(),
        SlotsPresent: [],
        ChromeRuleCount: 0,
    });

    it('lists a hidden compiled panel with its key, marked hidden', () => {
        expect(build([TICKETS_KEY]).Contributions).toEqual([
            expect.objectContaining({ Key: TICKETS_KEY, Source: 'class', Hidden: true, Precedence: 2 }),
        ]);
    });

    it('does not count a hidden panel\'s claim: its grid is filled in again', () => {
        expect(build([TICKETS_KEY]).Related).toEqual([expect.objectContaining({ Entity: TICKETS, Source: 'stock' })]);
        expect(build([]).Related).toEqual([expect.objectContaining({ Entity: TICKETS, Source: 'claimed' })]);
    });

    it('marks nothing hidden when the user hid nothing', () => {
        expect(build([]).Contributions).toEqual([expect.objectContaining({ Key: TICKETS_KEY, Hidden: false })]);
    });
});
