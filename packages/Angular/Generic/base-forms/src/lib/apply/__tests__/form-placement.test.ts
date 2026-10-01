import { describe, it, expect } from 'vitest';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
    ApplyDecisionToSpec,
    DefaultSlotFor,
    SlotIsOnForm,
    InitialPlacementState,
    ResolvePlacementDecision,
    HasDetailsTab,
    PlacementStateFromContribution,
    ShowsRail,
    ReplaceableRailTabs,
    DefaultRailKeyFor,
    TargetRailItem,
    ChosenFieldNames,
    FieldsInSection,
    SectionHoldingField,
    SectionsWithFields,
    ChosenSectionKeys,
    KeepEditedRowKey,
    type FormPlacementContext,
} from '../form-placement';
import {
    DescribeFieldList,
    DescribePlacementLine,
    DescribeVisibleTo,
    SectionOptionLabel,
    SummarizePlacement,
} from '../form-placement-text';
import {
    MovedSortKey,
    PanelsInPosition,
    PLACEMENT_ORDER_STEP,
    type PlacementOrderItem,
} from '../form-placement-order';
import { DETAILS_SECTION_KEY, MORE_SECTION_KEY } from '../../chrome/form-chrome';

/**
 * The placement rules decide what a generated panel is allowed to settle for itself.
 * Every assertion here is about a value that reaches a database column, so a change that
 * looks cosmetic — seeding a slot from the proposal, emitting a key — moves the boundary
 * between what the component's author chose and what the user chose.
 */
const CONTEXT: FormPlacementContext = {
    EntityName: 'MoreCheese: Courses',
    Sections: [
        {
            Key: 'details', Title: 'Details',
            Fields: [{ Name: 'Name', Label: 'Name' }, { Name: 'Description', Label: 'Description' }],
        },
        {
            Key: 'scheduleCapacity', Title: 'Schedule & Capacity',
            Fields: [{ Name: 'SeatLimit', Label: 'Seat Limit' }],
        },
    ],
    Related: [
        { Entity: 'MoreCheese: Course Enrollments', JoinField: 'CourseID', DisplayName: 'Course Enrollments' },
    ],
    Existing: [{ Key: 'skip:health', Slot: 'top-area', Title: 'Course Health Strip' }],
    SlotsPresent: ['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything'],
    SlotsVerified: true,
    Layout: 'accordion',
    Rail: [],
    FullCustomForm: false,
    TargetsVerified: true,
};

/** A proposal that names a slot and a claim, all of which `InitialPlacementState` ignores. */
const PROPOSAL: FormContributionSpec = {
    slot: 'after-everything',
    presentation: 'bare',
    title: 'Enrollment & Cohort Analytics',
    icon: 'fa-chart-column',
    sortKey: 90,
    contributionKey: 'skip:cohort-analytics',
    replacesSectionKey: 'details',
    relatedEntity: 'MoreCheese: Course Enrollments',
    relatedJoinField: 'CourseID',
    configuration: { window: 30 },
};

describe('InitialPlacementState', () => {
    it('ignores the slot the proposal asked for, so the starting point is the same every run', () => {
        expect(InitialPlacementState(PROPOSAL, CONTEXT).Slot).toBe('after-fields');
    });

    it('starts with nothing replaced, whatever the proposal claimed', () => {
        const state = InitialPlacementState(PROPOSAL, CONTEXT);
        expect(state.ReplaceMode).toBe('none');
    });

    it('keeps presentation, title and icon, which only the component author knows', () => {
        const state = InitialPlacementState(PROPOSAL, CONTEXT);
        expect(state.Presentation).toBe('bare');
        expect(state.Title).toBe('Enrollment & Cohort Analytics');
        expect(state.Icon).toBe('fa-chart-column');
    });

    it('defaults to a panel when the proposal is missing', () => {
        const state = InitialPlacementState(null, CONTEXT);
        expect(state.Presentation).toBe('panel');
        expect(state.Slot).toBe('after-fields');
        expect(state.Title).toBe('');
    });

    it('starts as a draft when a full custom form would swallow it', () => {
        expect(InitialPlacementState(PROPOSAL, { ...CONTEXT, FullCustomForm: true }).ActivateNow).toBe(false);
        expect(InitialPlacementState(PROPOSAL, CONTEXT).ActivateNow).toBe(true);
    });

    it('preselects the first section, so choosing to hide one needs no second step', () => {
        expect(InitialPlacementState(PROPOSAL, CONTEXT).ReplaceSectionKey).toBe('details');
    });
});

describe('PlacementStateFromContribution as a proposal seed', () => {
    const proposal = (over: Partial<FormContributionSpec>): FormContributionSpec =>
        ({ presentation: 'bare', title: 'Status strip', ...over });

    it('keeps inSectionKey when the form draws that section', () => {
        const key = CONTEXT.Sections[0].Key;
        const state = PlacementStateFromContribution(proposal({ inSectionKey: key, sectionPosition: 'end' }), CONTEXT, true);
        expect(state.ReplaceMode).toBe('none');
        expect(state.InSectionKey).toBe(key);
        expect(state.SectionPosition).toBe('end');
    });

    it('drops inSectionKey the form does not draw once targets are verified', () => {
        const state = PlacementStateFromContribution(proposal({ inSectionKey: 'noSuchSection' }), { ...CONTEXT, TargetsVerified: true }, true);
        expect(state.InSectionKey).toBe('');
    });

    it('keeps an unverifiable inSectionKey when the targets are unread', () => {
        const unread = { ...CONTEXT, Sections: [], TargetsVerified: false };
        const state = PlacementStateFromContribution(proposal({ inSectionKey: 'details' }), unread, true);
        expect(state.InSectionKey).toBe('details');
    });

    it('seeds a field claim from a proposal whose fields the form draws', () => {
        const section = CONTEXT.Sections.find((s) => (s.Fields ?? []).length > 0)!;
        const name = section.Fields![0].Name;
        const state = PlacementStateFromContribution(proposal({ replacesFieldNames: [name] }), CONTEXT, true);
        expect(state.ReplaceMode).toBe('field');
        expect(state.ReplaceFieldNames).toEqual([name]);
        expect(state.ReplaceFieldSectionKey).toBe(section.Key);
    });

    it('drops listed sections the form does not draw', () => {
        const state = PlacementStateFromContribution(proposal({ replacesSectionKeys: ['gone1', 'gone2'] }), CONTEXT, true);
        expect(state.ReplaceMode).toBe('none');
        expect(state.ReplaceSectionKeys).toEqual([]);
    });

    it('keeps listed sections when the targets are unread', () => {
        const unread = { ...CONTEXT, Sections: [], TargetsVerified: false };
        const state = PlacementStateFromContribution(proposal({ replacesSectionKeys: ['gone1', 'gone2'] }), unread, true);
        expect(state.ReplaceMode).toBe('section');
        expect(state.ReplaceSectionKeys).toEqual(['gone1', 'gone2']);
    });
});

describe('ResolvePlacementDecision', () => {
    const base = () => InitialPlacementState(PROPOSAL, CONTEXT);

    it('emits the slot the user chose', () => {
        const state = { ...base(), Slot: 'top-area' as const };
        expect(ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution.slot).toBe('top-area');
    });

    it('emits no contribution key — the write path derives one string, and only one', () => {
        const out = ResolvePlacementDecision(base(), CONTEXT, PROPOSAL).Contribution;
        expect(out.contributionKey).toBeUndefined();
        expect(out.sortKey).toBeUndefined();
    });

    it('carries no claim when nothing is replaced', () => {
        const out = ResolvePlacementDecision(base(), CONTEXT, PROPOSAL).Contribution;
        expect(out.replacesSectionKey).toBeUndefined();
        expect(out.relatedEntity).toBeUndefined();
        expect(out.relatedJoinField).toBeUndefined();
    });

    it('hides only the section the user picked', () => {
        const state = { ...base(), ReplaceMode: 'section' as const, ReplaceSectionKey: 'scheduleCapacity' };
        const out = ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution;
        expect(out.replacesSectionKey).toBe('scheduleCapacity');
        expect(out.relatedEntity).toBeUndefined();
    });

    it('claims the related grid the user picked, with its join field', () => {
        const state = { ...base(), ReplaceMode: 'related' as const, ReplaceRelatedIndex: 0 };
        const out = ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution;
        expect(out.relatedEntity).toBe('MoreCheese: Course Enrollments');
        expect(out.relatedJoinField).toBe('CourseID');
        expect(out.replacesSectionKey).toBeUndefined();
    });

    it('falls back to the proposal title rather than writing an empty header', () => {
        const state = { ...base(), Title: '   ' };
        expect(ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution.title)
            .toBe('Enrollment & Cohort Analytics');
    });

    it('drops an icon the user cleared', () => {
        const state = { ...base(), Icon: '  ' };
        expect(ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution.icon).toBeUndefined();
    });

    it('carries the proposal configuration through, since it belongs to the component', () => {
        const out = ResolvePlacementDecision(base(), CONTEXT, PROPOSAL).Contribution;
        expect(out.configuration).toEqual({ window: 30 });
    });

    it('reports the activation choice separately from the contribution', () => {
        const state = { ...base(), ActivateNow: false };
        expect(ResolvePlacementDecision(state, CONTEXT, PROPOSAL).ActivateNow).toBe(false);
    });
});

describe('SummarizePlacement', () => {
    it('names the slot, the entity, the audience and the timing', () => {
        const text = SummarizePlacement(InitialPlacementState(null, CONTEXT), CONTEXT);
        expect(text).toContain('after-fields');
        expect(text).toContain('MoreCheese: Courses');
        expect(text).toContain('visible to you only');
        expect(text).toContain('starting now');
    });

    it('says draft when the panel is not being turned on', () => {
        const state = { ...InitialPlacementState(null, CONTEXT), ActivateNow: false };
        expect(SummarizePlacement(state, CONTEXT)).toContain('saved as a draft');
    });

    it('names the section a claim would hide', () => {
        const state = { ...InitialPlacementState(null, CONTEXT), ReplaceMode: 'section' as const, ReplaceSectionKey: 'details' };
        expect(SummarizePlacement(state, CONTEXT)).toContain('standing in for the Details section');
    });

    it('warns that an active panel stays invisible behind a full custom form', () => {
        const context = { ...CONTEXT, FullCustomForm: true };
        const state = { ...InitialPlacementState(null, context), ActivateNow: true };
        expect(SummarizePlacement(state, context)).toContain('will not appear');
    });

    it('does not warn when the panel is only a draft', () => {
        const context = { ...CONTEXT, FullCustomForm: true };
        expect(SummarizePlacement(InitialPlacementState(null, context), context)).not.toContain('will not appear');
    });
});

describe('ApplyDecisionToSpec', () => {
    it('returns a new spec, leaving the one on screen alone', () => {
        const spec = { formContribution: PROPOSAL, name: 'Analytics' };
        const decision = ResolvePlacementDecision(InitialPlacementState(PROPOSAL, CONTEXT), CONTEXT, PROPOSAL);
        const next = ApplyDecisionToSpec(spec, decision);

        expect(next).not.toBe(spec);
        expect(spec.formContribution.slot).toBe('after-everything');
        expect(next.formContribution?.slot).toBe('after-fields');
        expect(next.name).toBe('Analytics');
    });
});

/**
 * A key is what makes one contribution win over another, so it is written only when the
 * user says they mean to replace something. Without this the flow could no longer stand in
 * for a panel an installed app provides — a capability that would have vanished quietly.
 */
describe('ResolvePlacementDecision — standing in for an existing panel', () => {
    const base = () => InitialPlacementState(PROPOSAL, CONTEXT);

    it('carries the key of the panel being replaced', () => {
        const state = { ...base(), ReplaceMode: 'contribution' as const, ReplaceContributionIndex: 0 };
        const out = ResolvePlacementDecision(state, CONTEXT, PROPOSAL).Contribution;
        expect(out.contributionKey).toBe('skip:health');
        expect(out.replacesSectionKey).toBeUndefined();
        expect(out.relatedEntity).toBeUndefined();
    });

    it('does not reuse the key the proposal invented for itself', () => {
        const out = ResolvePlacementDecision(base(), CONTEXT, PROPOSAL).Contribution;
        expect(out.contributionKey).toBeUndefined();
    });

    it('says which panel it replaces', () => {
        const state = { ...base(), ReplaceMode: 'contribution' as const };
        expect(SummarizePlacement(state, CONTEXT)).toContain('replacing the Course Health Strip panel');
    });
});

/**
 * A section key derived from entity metadata is not a promise. A generated form is frozen
 * at the last CodeGen run, so a field recategorised since then moves in the metadata and
 * not on the form — and a contribution that hides a section the form does not draw hides
 * nothing, silently. The summary is where the user learns that before applying.
 */
describe('SummarizePlacement — targets that were derived, not observed', () => {
    const derived: FormPlacementContext = { ...CONTEXT, TargetsVerified: false };

    it('says the section list may not match the form', () => {
        const state = { ...InitialPlacementState(null, derived), ReplaceMode: 'section' as const, ReplaceSectionKey: 'details' };
        expect(SummarizePlacement(state, derived)).toContain('may not match');
    });

    it('stays quiet when the targets came from the form itself', () => {
        const state = { ...InitialPlacementState(null, CONTEXT), ReplaceMode: 'section' as const, ReplaceSectionKey: 'details' };
        expect(SummarizePlacement(state, CONTEXT)).not.toContain('may not match');
    });

    it('stays quiet when no section is being hidden', () => {
        expect(SummarizePlacement(InitialPlacementState(null, derived), derived)).not.toContain('may not match');
    });
});

/**
 * A generated form emits whichever slots CodeGen knew about when it last ran, so the set is
 * per-form. A panel aimed at a slot the form does not emit is not rejected — the coordinator
 * walks it down the fallback chain to the container's terminator and it renders at the
 * bottom. The dialog is the only place a user can learn that before choosing.
 */
describe('slots the form does not emit', () => {
    /** The real shape of a form generated before `top-area` existed. */
    const older: FormPlacementContext = {
        ...CONTEXT,
        SlotsPresent: ['before-fields', 'after-fields', 'after-related'],
        SlotsVerified: true,
    };

    it('knows which slots the form emits', () => {
        expect(SlotIsOnForm(older, 'after-fields')).toBe(true);
        expect(SlotIsOnForm(older, 'top-area')).toBe(false);
    });

    it('falls back to the generated shape when the slot set is unknown', () => {
        const unknown: FormPlacementContext = { ...CONTEXT, SlotsPresent: [] };
        expect(SlotIsOnForm(unknown, 'after-fields')).toBe(true);
        // No form emits top-area, so an unknown set must not imply it does.
        expect(SlotIsOnForm(unknown, 'top-area')).toBe(false);
    });

    it('starts on the preferred slot when the form emits it', () => {
        expect(DefaultSlotFor(older)).toBe('after-fields');
        expect(InitialPlacementState(PROPOSAL, older).Slot).toBe('after-fields');
    });

    it('starts on a slot the form has when the preferred one is missing', () => {
        const noAfterFields: FormPlacementContext = { ...CONTEXT, SlotsPresent: ['before-fields', 'after-related'] };
        expect(DefaultSlotFor(noAfterFields)).toBe('before-fields');
        expect(InitialPlacementState(PROPOSAL, noAfterFields).Slot).toBe('before-fields');
    });

    it('says where the panel really lands when the chosen slot is absent', () => {
        const state = { ...InitialPlacementState(PROPOSAL, older), Slot: 'top-area' as const };
        expect(SummarizePlacement(state, older)).toContain('does not emit top-area');
        expect(SummarizePlacement(state, older)).toContain('renders at the bottom');
    });

    it('stays quiet when the chosen slot is on the form', () => {
        expect(SummarizePlacement(InitialPlacementState(PROPOSAL, older), older)).not.toContain('renders at the bottom');
    });
});

/**
 * An empty slot list means "cannot tell", not "none". The server derivation cannot read a
 * generated Angular template, so only the open form knows — and the dialog must not present
 * silence as confirmation. What it stands in for is the shape CodeGen produces, which is
 * right for every generated form and excludes the one slot no form emits.
 */
describe('slots that cannot be checked', () => {
    const unknown: FormPlacementContext = { ...CONTEXT, SlotsPresent: [], SlotsVerified: false, TargetsVerified: false };

    it('offers the slots a generated form emits', () => {
        expect(SlotIsOnForm(unknown, 'before-fields')).toBe(true);
        expect(SlotIsOnForm(unknown, 'after-everything')).toBe(true);
    });

    it('does not offer a slot no form emits', () => {
        expect(SlotIsOnForm(unknown, 'top-area')).toBe(false);
    });

    it('still starts on the preferred slot', () => {
        expect(DefaultSlotFor(unknown)).toBe('after-fields');
    });

    it('does not claim the panel falls to the bottom, since that is not known', () => {
        const state = { ...InitialPlacementState(null, unknown), Slot: 'top-area' as const };
        expect(SummarizePlacement(state, unknown)).not.toContain('renders at the bottom');
    });
});

/**
 * The Details tab is assembled at render time from every field section, so it has no
 * section key of its own. Standing in for it is a real intent and a different one from
 * replacing the whole form: the other tabs — related grids, More — stay exactly as they are.
 */
describe('ResolvePlacementDecision — standing in for a whole rail tab', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Rail: [
            { Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['details', 'scheduleCapacity'], IsMore: false },
            { Key: 'courseEnrollments', Title: 'Course Enrollments', Icon: 'fa fa-table',
              SectionKeys: ['courseEnrollments'], IsMore: false },
            { Key: MORE_SECTION_KEY, Title: 'More', Icon: 'fa fa-folder',
              SectionKeys: ['systemMetadata'], IsMore: true },
        ],
    };
    const base = () => InitialPlacementState(PROPOSAL, railed);
    const tab = (key: string) => ({ ...base(), ReplaceMode: 'rail-tab' as const, ReplaceRailKey: key });

    it('names whichever tab key was chosen, for the chrome layer to expand', () => {
        expect(ResolvePlacementDecision(tab(DETAILS_SECTION_KEY), railed, PROPOSAL).Contribution.replacesSectionKey)
            .toBe(DETAILS_SECTION_KEY);
        expect(ResolvePlacementDecision(tab('courseEnrollments'), railed, PROPOSAL).Contribution.replacesSectionKey)
            .toBe('courseEnrollments');
    });

    it('defaults to Details when the form has one, without hardcoding it as the only choice', () => {
        expect(base().ReplaceRailKey).toBe(DETAILS_SECTION_KEY);
        expect(InitialPlacementState(PROPOSAL, { ...railed, Rail: railed.Rail.slice(1) }).ReplaceRailKey)
            .toBe('courseEnrollments');
    });

    // Details and More are assembled from their members, so the panel has to join them or
    // the emptied tab is left behind. Every other tab IS its members.
    it('joins a tab that would otherwise be left empty, and only such a tab', () => {
        const panelTab = (key: string) => ({ ...tab(key), Presentation: 'panel' as const });
        expect(ResolvePlacementDecision(panelTab(DETAILS_SECTION_KEY), railed, PROPOSAL).Contribution.chromeGroup).toBe('details');
        expect(ResolvePlacementDecision(panelTab(MORE_SECTION_KEY), railed, PROPOSAL).Contribution.chromeGroup).toBe('more');
        expect(ResolvePlacementDecision(panelTab('courseEnrollments'), railed, PROPOSAL).Contribution.chromeGroup).toBeUndefined();
    });

    // A bare strip is never a rail item, and the database refuses a bare row with a chrome group.
    it('gives a bare strip standing in for a tab no chrome group', () => {
        expect(tab(DETAILS_SECTION_KEY).Presentation).toBe('bare');
        const out = ResolvePlacementDecision(tab(DETAILS_SECTION_KEY), railed, PROPOSAL).Contribution;
        expect(out.replacesSectionKey).toBe(DETAILS_SECTION_KEY);
        expect(out.chromeGroup).toBeUndefined();
        expect(out.inclusion).toBeUndefined();
    });

    it('claims no single section and no grid', () => {
        const out = ResolvePlacementDecision(tab(DETAILS_SECTION_KEY), railed, PROPOSAL).Contribution;
        expect(out.relatedEntity).toBeUndefined();
        expect(out.contributionKey).toBeUndefined();
    });

    it('names the tab it stands in for, so it is not mistaken for a full form', () => {
        expect(SummarizePlacement(tab(DETAILS_SECTION_KEY), railed))
            .toContain('taking the place of the whole Details tab, leaving the other tabs alone');
        expect(SummarizePlacement(tab('courseEnrollments'), railed))
            .toContain('taking the place of the whole Course Enrollments tab');
    });

    it('sets no chrome group when only one section is replaced', () => {
        const state = { ...base(), ReplaceMode: 'section' as const, ReplaceSectionKey: 'details' };
        expect(ResolvePlacementDecision(state, railed, PROPOSAL).Contribution.chromeGroup).toBeUndefined();
    });
});


/**
 * CodeGen names a generated field section "Details" whenever the entity has fields it
 * files nowhere else, and the rail folds that section — with every other field section —
 * into a tab it also calls "Details". A user reading two controls both labelled Details
 * picks the wrong one, hides a quarter of the tab, and sees the rest still standing.
 */
describe('SectionOptionLabel — the section named Details inside the tab named Details', () => {
    const railed: FormPlacementContext = { ...CONTEXT, Layout: 'left-nav' };

    it('qualifies the colliding section so it does not read as the tab', () => {
        expect(SectionOptionLabel({ Key: 'details', Title: 'Details' }, railed))
            .toBe('Details (the field group, not the tab)');
    });

    it('leaves every other section alone', () => {
        expect(SectionOptionLabel({ Key: 'scheduleCapacity', Title: 'Schedule & Capacity' }, railed))
            .toBe('Schedule & Capacity');
    });

    // An accordion shows each section where it sits. There is no tab to be confused with.
    it('does not qualify it on a form with no Details tab', () => {
        expect(SectionOptionLabel({ Key: 'details', Title: 'Details' }, CONTEXT)).toBe('Details');
    });

    it('falls back to the key when a section has no title', () => {
        expect(SectionOptionLabel({ Key: 'scheduleCapacity', Title: '  ' }, railed)).toBe('scheduleCapacity');
    });

    it('reports a Details tab only on a rail layout that has sections', () => {
        expect(HasDetailsTab(railed)).toBe(true);
        expect(HasDetailsTab(CONTEXT)).toBe(false);
        expect(HasDetailsTab({ ...railed, Sections: [] })).toBe(false);
    });

    it('says how much of the tab a single-section replacement covers', () => {
        const state = { ...InitialPlacementState(PROPOSAL, railed), ReplaceMode: 'section' as const, ReplaceSectionKey: 'details' };
        expect(SummarizePlacement(state, railed))
            .toContain('standing in for the Details section, one of 2 inside the Details tab');
    });
});


/**
 * The dialog predicts where the panel lands with the chrome layer's own rule, so it never
 * promises a tab the form will not use.
 */
describe('A panel claiming nothing and the Details tab', () => {
    it('says which of the two a panel claiming nothing will get', () => {
        const railed: FormPlacementContext = {
            ...CONTEXT,
            Layout: 'left-nav',
            Rail: [{ Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card',
                     SectionKeys: ['details'], IsMore: false }],
        };
        // A bare strip carries no chrome and so joins no tab; this is about panels.
        const base = { ...InitialPlacementState(PROPOSAL, railed), Presentation: 'panel' as const };
        expect(SummarizePlacement({ ...base, Slot: 'after-fields' }, railed))
            .toContain('inside the Details tab');
        expect(SummarizePlacement({ ...base, Slot: 'after-everything' }, railed))
            .toContain('as a tab of its own');
    });
});


/**
 * The rail groups exist whatever the layout — an accordion form uses them to decide what
 * is visible, it just draws no rail. `MoreCheese: Certifications` resolves to three groups
 * against a threshold of eight, so it is an accordion and shows no tabs at all, and the
 * dialog was still offering to replace one.
 */
describe('ShowsRail — a form with rail groups but no rail', () => {
    const accordion: FormPlacementContext = {
        ...CONTEXT,
        EntityName: 'MoreCheese: Certifications',
        Layout: 'accordion',
        Sections: [
            { Key: 'certificationDetails', Title: 'Certification Details' },
            { Key: 'configuration', Title: 'Configuration' },
        ],
        Rail: [
            { Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['certificationDetails', 'configuration'], IsMore: false },
            { Key: 'moreCheeseMemberCertifications', Title: 'Member Certifications', Icon: 'fa fa-table',
              SectionKeys: ['moreCheeseMemberCertifications'], IsMore: false },
            { Key: MORE_SECTION_KEY, Title: 'More', Icon: 'fa fa-folder',
              SectionKeys: ['systemMetadata'], IsMore: true },
        ],
    };
    const railed: FormPlacementContext = { ...accordion, Layout: 'left-nav' };

    it('is false when the groups exist but the form draws no rail', () => {
        expect(accordion.Rail.length).toBeGreaterThan(0);
        expect(ShowsRail(accordion)).toBe(false);
        expect(ShowsRail(railed)).toBe(true);
    });

    it('offers no tab to replace on a form that shows none', () => {
        expect(ReplaceableRailTabs(accordion)).toEqual([]);
        expect(ReplaceableRailTabs(railed)).toHaveLength(3);
    });

    it('starts on no tab, so nothing is preselected that cannot be chosen', () => {
        expect(DefaultRailKeyFor(accordion)).toBe('');
        expect(DefaultRailKeyFor(railed)).toBe(DETAILS_SECTION_KEY);
    });

    it('names no tab for the panel to join', () => {
        const state = InitialPlacementState(PROPOSAL, accordion);
        expect(TargetRailItem({ ...state, Presentation: 'panel' }, accordion)).toBeNull();
    });

    it('says nothing about tabs in the summary', () => {
        const state = { ...InitialPlacementState(PROPOSAL, accordion), Presentation: 'panel' as const };
        const sentence = SummarizePlacement(state, accordion);
        expect(sentence).not.toContain('Details tab');
        expect(sentence).not.toContain('a tab of its own');
    });

    // The sections are still real sections on the form, so replacing one still works.
    it('still offers the form’s own sections one at a time', () => {
        const state = { ...InitialPlacementState(PROPOSAL, accordion), ReplaceMode: 'section' as const,
                        ReplaceSectionKey: 'configuration' };
        expect(ResolvePlacementDecision(state, accordion, PROPOSAL).Contribution.replacesSectionKey)
            .toBe('configuration');
    });
});


/**
 * Editing a panel already on the form starts from the placement it has now, which is the
 * user's own earlier choice. Discarding it would make every edit start from scratch.
 */
describe('PlacementStateFromContribution', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Rail: [
            { Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['details', 'scheduleCapacity'], IsMore: false },
            { Key: 'courseEnrollments', Title: 'Course Enrollments', Icon: 'fa fa-table',
              SectionKeys: ['courseEnrollments'], IsMore: false },
        ],
    };
    const spec = (over: Partial<FormContributionSpec> = {}): FormContributionSpec => ({
        slot: 'before-fields', presentation: 'panel', title: 'Stats', ...over,
    });

    it('reads back the slot, look and labels the user chose', () => {
        const state = PlacementStateFromContribution(
            spec({ slot: 'after-related', presentation: 'bare', icon: 'fa-chart' }), railed, true);
        expect(state.Slot).toBe('after-related');
        expect(state.Presentation).toBe('bare');
        expect(state.Title).toBe('Stats');
        expect(state.Icon).toBe('fa-chart');
        expect(state.ActivateNow).toBe(true);
    });

    it('reads a section claim back as the section mode', () => {
        const state = PlacementStateFromContribution(spec({ replacesSectionKey: 'details' }), railed, true);
        expect(state.ReplaceMode).toBe('section');
        expect(state.ReplaceSectionKey).toBe('details');
    });

    // A tab key matches no section, so the two are told apart by where the key is found.
    it('reads a tab claim back as the tab mode', () => {
        const state = PlacementStateFromContribution(
            spec({ replacesSectionKey: 'courseEnrollments' }), railed, true);
        expect(state.ReplaceMode).toBe('rail-tab');
        expect(state.ReplaceRailKey).toBe('courseEnrollments');
    });

    it('reads a grid claim back, and finds which grid', () => {
        const state = PlacementStateFromContribution(
            spec({ relatedEntity: 'MoreCheese: Course Enrollments' }), railed, true);
        expect(state.ReplaceMode).toBe('related');
        expect(state.ReplaceRelatedIndex).toBe(0);
    });

    it('reads a panel that claims nothing back as claiming nothing', () => {
        expect(PlacementStateFromContribution(spec(), railed, true).ReplaceMode).toBe('none');
    });

    // A claim whose target has left the form must not select a mode that cannot resolve.
    it('falls back when the claimed target is no longer on the form', () => {
        const state = PlacementStateFromContribution(spec({ replacesSectionKey: 'gone' }), railed, true);
        expect(state.ReplaceMode).toBe('none');
    });

    it('starts a draft as a draft rather than switching it on', () => {
        expect(PlacementStateFromContribution(spec(), railed, false).ActivateNow).toBe(false);
    });

    it('moves a slot the form does not emit onto one it does', () => {
        const narrow: FormPlacementContext = { ...railed, SlotsPresent: ['after-fields'], SlotsVerified: true };
        expect(PlacementStateFromContribution(spec({ slot: 'top-area' }), narrow, true).Slot).toBe('after-fields');
    });
});

/** Two grids can show one entity through different join fields; a claim names exactly one of them. */
describe('PlacementStateFromContribution — two grids from one entity', () => {
    const twoGrids: FormPlacementContext = {
        ...CONTEXT,
        Related: [
            { Entity: 'MoreCheese: People', JoinField: 'InstructorID', DisplayName: 'Instructors' },
            { Entity: 'MoreCheese: People', JoinField: 'AssistantID', DisplayName: 'Assistants' },
        ],
    };
    const spec = (over: Partial<FormContributionSpec>): FormContributionSpec => ({
        slot: 'after-fields', presentation: 'panel', title: 'Assistants', relatedEntity: 'MoreCheese: People', ...over,
    });

    it('reads the claim back against the grid its join field names', () => {
        const state = PlacementStateFromContribution(spec({ relatedJoinField: 'AssistantID' }), twoGrids, true);
        expect(state.ReplaceMode).toBe('related');
        expect(state.ReplaceRelatedIndex).toBe(1);
    });

    it('matches a bracketed join field', () => {
        expect(PlacementStateFromContribution(spec({ relatedJoinField: '[AssistantID]' }), twoGrids, true).ReplaceRelatedIndex).toBe(1);
    });

    it('writes the same grid back when only the title changes', () => {
        const state = PlacementStateFromContribution(spec({ relatedJoinField: 'AssistantID' }), twoGrids, true);
        const out = ResolvePlacementDecision({ ...state, Title: 'Helpers' }, twoGrids, null).Contribution;
        expect(out).toMatchObject({ relatedEntity: 'MoreCheese: People', relatedJoinField: 'AssistantID', title: 'Helpers' });
    });

    it('does not move the claim to another grid when its own has gone', () => {
        expect(PlacementStateFromContribution(spec({ relatedJoinField: 'MentorID' }), twoGrids, true).ReplaceMode).toBe('none');
    });
});

/**
 * Before the form has been read the context names no sections and no rail, so a stored claim
 * cannot be checked. It is kept as stored, so saving the edit does not drop it.
 */
describe('PlacementStateFromContribution — before the form has been read', () => {
    const unread: FormPlacementContext = {
        ...CONTEXT, Sections: [], Rail: [], SlotsPresent: [], SlotsVerified: false, TargetsVerified: false,
    };
    const spec = (over: Partial<FormContributionSpec>): FormContributionSpec => ({
        slot: 'before-fields', presentation: 'panel', title: 'Stats', ...over,
    });
    const roundTrip = (s: FormContributionSpec) =>
        ResolvePlacementDecision(PlacementStateFromContribution(s, unread, true), unread, null).Contribution;

    it('keeps a claim on one section', () => {
        expect(PlacementStateFromContribution(spec({ replacesSectionKey: 'details' }), unread, true).ReplaceMode).toBe('section');
        expect(roundTrip(spec({ replacesSectionKey: 'details' })).replacesSectionKey).toBe('details');
    });

    it('keeps a claim on the Details tab, with the chrome group it joins', () => {
        const out = roundTrip(spec({ replacesSectionKey: DETAILS_SECTION_KEY }));
        expect(out.replacesSectionKey).toBe(DETAILS_SECTION_KEY);
        expect(out.chromeGroup).toBe('details');
    });

    it('keeps a claim on fields', () => {
        expect(roundTrip(spec({ replacesFieldNames: ['Name', 'Description'] })).replacesFieldNames).toEqual(['Name', 'Description']);
    });

    it('still drops a claim the read form does not draw', () => {
        expect(PlacementStateFromContribution(spec({ replacesSectionKey: 'gone' }), CONTEXT, true).ReplaceMode).toBe('none');
        const readWithoutSections: FormPlacementContext = { ...unread, TargetsVerified: true };
        expect(PlacementStateFromContribution(spec({ replacesSectionKey: 'details' }), readWithoutSections, true).ReplaceMode).toBe('none');
        expect(ChosenFieldNames({ ...InitialPlacementState(null, readWithoutSections), ReplaceFieldNames: ['Name'] }, readWithoutSections))
            .toEqual([]);
    });
});

/**
 * An edited row keeps its own key unless the edit drops the claim that key made. Otherwise a
 * title change would rename the panel's identity, or undo the replacement of an installed panel.
 */
describe('KeepEditedRowKey', () => {
    const placed: FormContributionSpec = { slot: 'after-fields', presentation: 'panel', title: 'Stats' };
    const row = (over: Partial<{ ContributionKey: string | null; RelatedEntity: string | null; RelatedJoinField: string | null }> = {}) => ({
        ContributionKey: 'panel:Stats', RelatedEntity: null, RelatedJoinField: null, ...over,
    });

    it('keeps the key of a panel that claims no other panel', () => {
        expect(KeepEditedRowKey(placed, row(), CONTEXT.Existing).contributionKey).toBe('panel:Stats');
        expect(KeepEditedRowKey(placed, row({ ContributionKey: 'header' }), CONTEXT.Existing).contributionKey).toBe('header');
    });

    it('drops the key of a listed panel the user stopped replacing', () => {
        expect(KeepEditedRowKey(placed, row({ ContributionKey: 'skip:health' }), CONTEXT.Existing).contributionKey).toBeUndefined();
    });

    it('drops the key of the grid the user stopped replacing', () => {
        const grid = row({
            ContributionKey: 'related:MoreCheese: Course Enrollments:CourseID',
            RelatedEntity: 'MoreCheese: Course Enrollments', RelatedJoinField: '[CourseID]',
        });
        expect(KeepEditedRowKey(placed, grid, CONTEXT.Existing).contributionKey).toBeUndefined();
    });

    it('drops a grid key written in another casing or form', () => {
        const grid = row({
            ContributionKey: 'related:morecheese: course enrollments:[CourseID]',
            RelatedEntity: 'MoreCheese: Course Enrollments', RelatedJoinField: 'CourseID',
        });
        expect(KeepEditedRowKey(placed, grid, CONTEXT.Existing).contributionKey).toBeUndefined();
    });

    it('leaves a decision that makes its own keyed claim alone', () => {
        const replacing = { ...placed, contributionKey: 'skip:health' };
        expect(KeepEditedRowKey(replacing, row(), CONTEXT.Existing)).toBe(replacing);
        const grid = { ...placed, relatedEntity: 'MoreCheese: Course Enrollments' };
        expect(KeepEditedRowKey(grid, row(), CONTEXT.Existing)).toBe(grid);
    });

    it('leaves a row with no key to the write path', () => {
        expect(KeepEditedRowKey(placed, row({ ContributionKey: null }), CONTEXT.Existing).contributionKey).toBeUndefined();
    });
});

/**
 * Standing in for FIELDS rather than a whole group.
 *
 * The smallest claim, and the one where placement stops being the user's to choose: the
 * panel renders at the top of the section holding the fields, so the slot they picked does
 * not apply. Every assertion below guards a value that reaches `ReplacesFieldNames`.
 */
describe('replacing fields inside one group', () => {
    /** A claim on two fields of Details, as the dialog would build it. */
    function claim(sectionKey: string, names: string[]) {
        return {
            ...InitialPlacementState(PROPOSAL, CONTEXT),
            ReplaceMode: 'field' as const,
            ReplaceFieldSectionKey: sectionKey,
            ReplaceFieldNames: names,
        };
    }

    it('offers only sections that draw fields', () => {
        expect(SectionsWithFields(CONTEXT).map((s) => s.Key)).toEqual(['details', 'scheduleCapacity']);
    });

    it('offers none when the targets were derived rather than read from a form', () => {
        expect(SectionsWithFields({ ...CONTEXT, TargetsVerified: false })).toEqual([]);
    });

    it('lists the fields of one section', () => {
        expect(FieldsInSection(CONTEXT, 'details').map((f) => f.Name)).toEqual(['Name', 'Description']);
        expect(FieldsInSection(CONTEXT, 'notASection')).toEqual([]);
    });

    it('finds the section holding a field, and nothing for a field the form does not draw', () => {
        expect(SectionHoldingField(CONTEXT, 'SeatLimit')?.Key).toBe('scheduleCapacity');
        expect(SectionHoldingField(CONTEXT, 'NotOnTheForm')).toBeNull();
    });

    it('keeps only the fields the chosen section really draws', () => {
        // SeatLimit belongs to the other section; a stale pick must not reach the row.
        const state = claim('details', ['Name', 'SeatLimit', 'Description']);
        expect(ChosenFieldNames(state, CONTEXT)).toEqual(['Name', 'Description']);
    });

    it('writes every chosen field and nothing it could be confused with', () => {
        const { Contribution } = ResolvePlacementDecision(claim('details', ['Name', 'Description']), CONTEXT, PROPOSAL);
        expect(Contribution.replacesFieldNames).toEqual(['Name', 'Description']);
        expect(Contribution.replacesSectionKey).toBeUndefined();
        expect(Contribution.relatedEntity).toBeUndefined();
    });

    it('writes no claim at all when no field is chosen', () => {
        const { Contribution } = ResolvePlacementDecision(claim('details', []), CONTEXT, PROPOSAL);
        expect(Contribution.replacesFieldNames).toBeUndefined();
    });

    it('reads its own earlier choice back, section and all', () => {
        const spec: FormContributionSpec = {
            slot: 'after-fields', presentation: 'panel', title: 'Identity',
            replacesFieldNames: ['Name', 'Description'],
        };
        const state = PlacementStateFromContribution(spec, CONTEXT, true);
        expect(state.ReplaceMode).toBe('field');
        expect(state.ReplaceFieldSectionKey).toBe('details');
        expect(state.ReplaceFieldNames).toEqual(['Name', 'Description']);
    });

    it('keeps the fields that survive when one has left the form', () => {
        const spec: FormContributionSpec = {
            slot: 'after-fields', presentation: 'panel', title: 'Identity',
            replacesFieldNames: ['Name', 'Retired'],
        };
        const state = PlacementStateFromContribution(spec, CONTEXT, true);
        expect(state.ReplaceMode).toBe('field');
        expect(state.ReplaceFieldNames).toEqual(['Name']);
    });

    it('falls back to no claim when every field has left the form', () => {
        const spec: FormContributionSpec = {
            slot: 'after-fields', presentation: 'panel', title: 'Identity',
            replacesFieldNames: ['Retired', 'AlsoGone'],
        };
        expect(PlacementStateFromContribution(spec, CONTEXT, true).ReplaceMode).toBe('none');
    });

    it('says where the panel actually lands, not which slot was picked', () => {
        const summary = SummarizePlacement(claim('scheduleCapacity', ['SeatLimit']), CONTEXT);
        expect(summary).toContain('the Seat Limit field');
        expect(summary).toContain('at the top of the Schedule & Capacity section');
        expect(summary).toContain('The chosen position does not apply');
        expect(summary).not.toContain('at after-fields');
    });

    it('names the fields in the summary, and counts them past three', () => {
        expect(DescribeFieldList(['A'])).toBe('the A field');
        expect(DescribeFieldList(['A', 'B'])).toBe('the A and B fields');
        expect(DescribeFieldList(['A', 'B', 'C'])).toBe('the A, B and C fields');
        expect(DescribeFieldList(['A', 'B', 'C', 'D'])).toBe('4 fields, starting with A');
    });
});

/**
 * Panels in one position draw by `SortKey`, higher first. The dialog lists them with the one being
 * placed among them, and a move gives that one a number strictly between its new neighbours.
 */
describe('Order in a position', () => {
    const inSlot: FormPlacementContext = {
        ...CONTEXT,
        Existing: [
            { Key: 'panel:A', Slot: 'after-fields', Title: 'A', SortKey: 20 },
            { Key: 'panel:B', Slot: 'after-fields', Title: 'B', SortKey: 10 },
            { Key: 'panel:Top', Slot: 'top-area', Title: 'Top', SortKey: 99 },
        ],
    };
    const state = (over: Partial<ReturnType<typeof InitialPlacementState>> = {}) =>
        ({ ...InitialPlacementState(null, inSlot), Slot: 'after-fields' as const, ...over });
    const names = (items: PlacementOrderItem[]) => items.map((i) => (i.IsThis ? 'THIS' : i.Title));

    it('lists only the panels in the chosen position, higher first, with a new panel after its ties', () => {
        expect(names(PanelsInPosition(state(), inSlot, 'New'))).toEqual(['A', 'B', 'THIS']);
        expect(names(PanelsInPosition(state({ SortKey: 15 }), inSlot, 'New'))).toEqual(['A', 'THIS', 'B']);
    });

    it('lists nothing while the panel replaces a tab, since it then draws alone in that place', () => {
        expect(PanelsInPosition(state({ ReplaceMode: 'rail-tab', ReplaceRailKey: 'details' }), inSlot, 'New')).toEqual([]);
    });

    it('moves between two neighbours to a number strictly between them', () => {
        const items = PanelsInPosition(state(), inSlot, 'New');
        expect(MovedSortKey(items, 'up')).toBe(15);
    });

    it('moves past the end of the list by a step', () => {
        const items = PanelsInPosition(state({ SortKey: 15 }), inSlot, 'New');
        expect(MovedSortKey(items, 'up')).toBe(20 + PLACEMENT_ORDER_STEP);
        expect(MovedSortKey(items, 'down')).toBe(10 - PLACEMENT_ORDER_STEP);
    });

    it('refuses a move with nowhere to go, or between neighbours that leave no number free', () => {
        const top = PanelsInPosition(state({ SortKey: 50 }), inSlot, 'New');
        expect(MovedSortKey(top, 'up')).toBeNull();
        const tied: FormPlacementContext = { ...inSlot, Existing: [
            { Key: 'x', Slot: 'after-fields', Title: 'X', SortKey: 0 },
            { Key: 'y', Slot: 'after-fields', Title: 'Y', SortKey: 0 },
        ] };
        const items = PanelsInPosition(state(), tied, 'New');
        expect(names(items)).toEqual(['X', 'Y', 'THIS']);
        expect(MovedSortKey(items, 'up')).toBeNull();
    });

    it('writes the order only once the panel has been placed among others', () => {
        expect(ResolvePlacementDecision(state(), inSlot, PROPOSAL).Contribution.sortKey).toBeUndefined();
        expect(ResolvePlacementDecision(state({ SortKey: 15 }), inSlot, PROPOSAL).Contribution.sortKey).toBe(15);
    });

    it('starts an edit from the order the panel already has', () => {
        const edit = PlacementStateFromContribution({ ...PROPOSAL, slot: 'after-fields', sortKey: 12 }, inSlot, true);
        expect(edit.SortKey).toBe(12);
    });
});

/**
 * A panel can stand in for several blocks of one tab, and can be placed inside a section without
 * replacing anything, at its top or bottom. One block still writes the single-key column.
 */
describe('Section claims', () => {
    const threeSections: FormPlacementContext = {
        ...CONTEXT,
        Sections: [
            { Key: 'identity', Title: 'Identity', Fields: [{ Name: 'Name', Label: 'Name' }] },
            { Key: 'profile', Title: 'Profile' },
            { Key: 'account', Title: 'Account' },
        ],
    };
    const base = () => InitialPlacementState(null, threeSections);

    it('keeps chosen blocks in the form order, and falls back to the single key', () => {
        expect(ChosenSectionKeys({ ...base(), ReplaceSectionKeys: ['account', 'identity'] }, threeSections)).toEqual(['identity', 'account']);
        expect(ChosenSectionKeys({ ...base(), ReplaceSectionKey: 'profile' }, threeSections)).toEqual(['profile']);
    });

    it('writes one block to the single key and several to the list', () => {
        const one = ResolvePlacementDecision({ ...base(), ReplaceMode: 'section', ReplaceSectionKeys: ['profile'] }, threeSections, PROPOSAL).Contribution;
        expect(one).toMatchObject({ replacesSectionKey: 'profile' });
        expect(one.replacesSectionKeys).toBeUndefined();
        const many = ResolvePlacementDecision({ ...base(), ReplaceMode: 'section', ReplaceSectionKeys: ['account', 'identity'] }, threeSections, PROPOSAL).Contribution;
        expect(many.replacesSectionKeys).toEqual(['identity', 'account']);
        expect(many.replacesSectionKey).toBeUndefined();
    });

    it('places a panel inside a section, at the end asked for, replacing nothing', () => {
        const out = ResolvePlacementDecision({ ...base(), InSectionKey: 'profile', SectionPosition: 'end' }, threeSections, PROPOSAL).Contribution;
        expect(out).toMatchObject({ inSectionKey: 'profile', sectionPosition: 'end' });
        expect(SummarizePlacement({ ...base(), InSectionKey: 'profile', SectionPosition: 'end' }, threeSections))
            .toContain('at the bottom of the Profile section');
    });

    it('ignores a placement inside a section while the panel replaces something', () => {
        const out = ResolvePlacementDecision({ ...base(), InSectionKey: 'profile', ReplaceMode: 'section' }, threeSections, PROPOSAL).Contribution;
        expect(out.inSectionKey).toBeUndefined();
    });

    it('puts a field claim at the bottom of its group only when asked', () => {
        const top = ResolvePlacementDecision({ ...base(), ReplaceMode: 'field', ReplaceFieldSectionKey: 'identity', ReplaceFieldNames: ['Name'] }, threeSections, PROPOSAL).Contribution;
        expect(top.sectionPosition).toBeUndefined();
        const bottom = ResolvePlacementDecision({ ...base(), ReplaceMode: 'field', ReplaceFieldSectionKey: 'identity', ReplaceFieldNames: ['Name'], SectionPosition: 'end' }, threeSections, PROPOSAL).Contribution;
        expect(bottom.sectionPosition).toBe('end');
    });

    it('reads an edit back: several blocks, or a place inside a section', () => {
        const clean: FormContributionSpec = { presentation: 'panel', title: 'P', slot: 'after-fields' };
        const many = PlacementStateFromContribution({ ...clean, replacesSectionKeys: ['identity', 'account'] }, threeSections, true);
        expect(many).toMatchObject({ ReplaceMode: 'section', ReplaceSectionKeys: ['identity', 'account'], ReplaceSectionKey: 'identity' });
        const inside = PlacementStateFromContribution({ ...clean, inSectionKey: 'profile', sectionPosition: 'end' }, threeSections, true);
        expect(inside).toMatchObject({ ReplaceMode: 'none', InSectionKey: 'profile', SectionPosition: 'end' });
    });

    it('orders a panel placed in a section against the others drawn at that end of it', () => {
        const inSection: FormPlacementContext = {
            ...threeSections,
            Existing: [
                { Key: 'slot-panel', Slot: 'after-fields', Title: 'Slot panel' },
                { Key: 'placed', Slot: 'after-fields', Title: 'Placed', InSectionKey: 'identity', SectionPosition: 'start', SortKey: 20 },
                { Key: 'claim', Slot: 'after-fields', Title: 'Field claim', FieldNames: ['Name'], SortKey: 10 },
                { Key: 'bottom', Slot: 'after-fields', Title: 'Bottom', InSectionKey: 'identity', SectionPosition: 'end' },
                { Key: 'swap', Slot: 'after-fields', Title: 'Stands in', ReplacesPlace: true },
            ],
        };
        const items = PanelsInPosition({ ...base(), InSectionKey: 'identity', SectionPosition: 'start' }, inSection, 'New');
        expect(items.map((i) => (i.IsThis ? 'THIS' : i.Title))).toEqual(['Placed', 'Field claim', 'THIS']);
        const claim = PanelsInPosition(
            { ...base(), ReplaceMode: 'field', ReplaceFieldSectionKey: 'identity', ReplaceFieldNames: ['Name'] }, inSection, 'New');
        expect(claim.map((i) => (i.IsThis ? 'THIS' : i.Title))).toEqual(['Placed', 'Field claim', 'THIS']);
    });

    it('orders a panel standing in for blocks against the others drawn in the first block\'s place', () => {
        const blocks: FormPlacementContext = {
            ...threeSections,
            Existing: [
                { Key: 'top', Slot: 'before-fields', Title: 'Before the fields', SortKey: 5 },
                { Key: 'first', Slot: 'before-fields', Title: 'Stands in for Identity', SectionKeys: ['identity'], ReplacesPlace: true },
                { Key: 'later', Slot: 'before-fields', Title: 'Stands in for Account', SectionKeys: ['account', 'profile'], ReplacesPlace: true },
            ],
        };
        // The first block is where the before-fields slot draws, so those panels share its list.
        const atFirst = PanelsInPosition({ ...base(), ReplaceMode: 'section', ReplaceSectionKeys: ['identity', 'profile'] }, blocks, 'New');
        expect(atFirst.map((i) => (i.IsThis ? 'THIS' : i.Title))).toEqual(['Before the fields', 'Stands in for Identity', 'THIS']);
        // A later block's place holds only the panels that stand in for blocks starting there.
        const atProfile = PanelsInPosition({ ...base(), ReplaceMode: 'section', ReplaceSectionKeys: ['profile'] }, blocks, 'New');
        expect(atProfile.map((i) => (i.IsThis ? 'THIS' : i.Title))).toEqual(['Stands in for Account', 'THIS']);
    });

    it('puts a panel standing in for blocks in the before-fields slot, so its order number decides ties', () => {
        const out = ResolvePlacementDecision(
            { ...base(), Slot: 'after-fields', ReplaceMode: 'section', ReplaceSectionKeys: ['profile'], SortKey: 10 }, threeSections, PROPOSAL).Contribution;
        expect(out).toMatchObject({ slot: 'before-fields', replacesSectionKey: 'profile', sortKey: 10 });
    });

    it('leaves a panel that stands in for a tab or grid out of every position', () => {
        const withSwap = { ...threeSections, Existing: [{ Key: 's', Slot: 'after-fields', Title: 'S', ReplacesPlace: true }] };
        // Only the placed panel is listed, so the dialog shows no list at all.
        expect(PanelsInPosition({ ...base(), Slot: 'after-fields' }, withSwap, 'New').map((i) => i.IsThis)).toEqual([true]);
    });

    it('names every block in the summary', () => {
        expect(SummarizePlacement({ ...base(), ReplaceMode: 'section', ReplaceSectionKeys: ['identity', 'account'] }, threeSections))
            .toContain('standing in for the Identity and Account sections');
    });
});

/**
 * The summary states who sees the panel and what it starts as. A panel added from a conversation
 * is the caller's own; one edited from the Manage drawer keeps its audience, and one that is off
 * can stay off.
 */
describe('Audience and start', () => {
    it('names each audience as the end of "visible to …"', () => {
        expect(DescribeVisibleTo('User')).toBe('you only');
        expect(DescribeVisibleTo('Global')).toBe('everyone');
        expect(DescribeVisibleTo('Role', 'Sales')).toBe('the Sales role');
        expect(DescribeVisibleTo('Role', null)).toBe('a role');
        expect(DescribeVisibleTo(null)).toBe('you only');
    });

    it('says the audience it is given rather than "you only"', () => {
        const text = SummarizePlacement(InitialPlacementState(null, CONTEXT), CONTEXT, DescribeVisibleTo('Global'));
        expect(text).toContain('visible to everyone');
        expect(text).not.toContain('visible to you only');
    });

    it('starts a new panel neither on hold nor kept off', () => {
        expect(InitialPlacementState(PROPOSAL, CONTEXT).KeepOff).toBe(false);
    });

    it('reads a panel that is off back as kept off, and says so', () => {
        const state = PlacementStateFromContribution({ slot: 'after-fields', presentation: 'panel', title: 'P' }, CONTEXT, false, true);
        expect(state).toMatchObject({ ActivateNow: false, KeepOff: true });
        expect(SummarizePlacement(state, CONTEXT)).toContain('kept off');
        expect(ResolvePlacementDecision(state, CONTEXT, null)).toMatchObject({ ActivateNow: false, KeepOff: true });
    });

    it('never keeps off a panel that is turned on', () => {
        const on = PlacementStateFromContribution({ slot: 'after-fields', presentation: 'panel', title: 'P' }, CONTEXT, true, true);
        expect(on.KeepOff).toBe(false);
        const state = { ...InitialPlacementState(null, CONTEXT), ActivateNow: true, KeepOff: true };
        expect(ResolvePlacementDecision(state, CONTEXT, null).KeepOff).toBe(false);
    });
});

/** Before the form is read, a stored block claim is ordered by its keys as stored, the way the placed panel's is. */
describe('Order in a position — before the form has been read', () => {
    it('lists a stored block claim with a new claim on the same block', () => {
        const unread: FormPlacementContext = {
            ...CONTEXT, Sections: [], TargetsVerified: false,
            Existing: [{ Key: 'stored', Slot: 'before-fields', Title: 'Stored', SectionKeys: ['identity'], ReplacesPlace: true, SortKey: 5 }],
        };
        const state = { ...InitialPlacementState(null, unread), ReplaceMode: 'section' as const, ReplaceSectionKey: 'identity' };
        expect(PanelsInPosition(state, unread, 'New').map((i) => (i.IsThis ? 'THIS' : i.Title))).toEqual(['Stored', 'THIS']);
    });
});

/**
 * The line under "Where it goes" and the summary beside Apply describe one answer. They read
 * the same lookup, so they name the same grid, panel, tab or fields.
 */
describe('DescribePlacementLine', () => {
    const base = () => InitialPlacementState(PROPOSAL, CONTEXT);

    it('names the slot in plain words when the panel replaces nothing', () => {
        expect(DescribePlacementLine(base(), CONTEXT)).toBe('After the fields');
    });

    it('names the grid, the panel or the tab it takes the place of', () => {
        expect(DescribePlacementLine({ ...base(), ReplaceMode: 'related', ReplaceRelatedIndex: 0 }, CONTEXT))
            .toBe('In place of the Course Enrollments grid');
        expect(DescribePlacementLine({ ...base(), ReplaceMode: 'contribution', ReplaceContributionIndex: 0 }, CONTEXT))
            .toBe('In place of the Course Health Strip panel');
        const railed: FormPlacementContext = {
            ...CONTEXT,
            Layout: 'left-nav',
            Rail: [{ Key: DETAILS_SECTION_KEY, Title: 'Details', Icon: 'fa fa-id-card', SectionKeys: ['details'], IsMore: false }],
        };
        expect(DescribePlacementLine({ ...base(), ReplaceMode: 'rail-tab', ReplaceRailKey: DETAILS_SECTION_KEY }, railed))
            .toBe('In place of the whole Details tab');
    });

    it('names the same fields the summary names', () => {
        const state = {
            ...base(), ReplaceMode: 'field' as const,
            ReplaceFieldSectionKey: 'details', ReplaceFieldNames: ['Name', 'Description'],
        };
        expect(DescribePlacementLine(state, CONTEXT)).toBe('At the top of Details, in place of the Name and Description fields');
        expect(SummarizePlacement(state, CONTEXT)).toContain('standing in for the Name and Description fields at the top of the Details section');
    });

    it('says what is still to be picked when a field claim names no field', () => {
        const state = { ...base(), ReplaceMode: 'field' as const, ReplaceFieldSectionKey: 'details', ReplaceFieldNames: [] };
        expect(DescribePlacementLine(state, CONTEXT)).toBe('At the top of Details, in place of the fields you pick');
    });
});
