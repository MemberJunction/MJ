import { describe, it, expect } from 'vitest';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
    ApplyDecisionToSpec,
    DETAILS_TAB_KEY,
    MORE_TAB_KEY,
    DefaultSlotFor,
    SlotIsOnForm,
    InitialPlacementState,
    ResolvePlacementDecision,
    SummarizePlacement,
    HasDetailsTab,
    SectionOptionLabel,
    SlotJoinsDetailsTab,
    PlacementStateFromContribution,
    ShowsRail,
    ReplaceableRailTabs,
    DefaultRailKeyFor,
    TargetRailItem,
    ReplaceableFields,
    SectionHoldingField,
    type FormPlacementContext,
} from '../form-placement';

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

/** A proposal that names a slot and a claim — everything the dialog must now ignore. */
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
            { Key: DETAILS_TAB_KEY, Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['details', 'scheduleCapacity'], IsMore: false },
            { Key: 'courseEnrollments', Title: 'Course Enrollments', Icon: 'fa fa-table',
              SectionKeys: ['courseEnrollments'], IsMore: false },
            { Key: MORE_TAB_KEY, Title: 'More', Icon: 'fa fa-folder',
              SectionKeys: ['systemMetadata'], IsMore: true },
        ],
    };
    const base = () => InitialPlacementState(PROPOSAL, railed);
    const tab = (key: string) => ({ ...base(), ReplaceMode: 'rail-tab' as const, ReplaceRailKey: key });

    it('names whichever tab key was chosen, for the chrome layer to expand', () => {
        expect(ResolvePlacementDecision(tab(DETAILS_TAB_KEY), railed, PROPOSAL).Contribution.replacesSectionKey)
            .toBe(DETAILS_TAB_KEY);
        expect(ResolvePlacementDecision(tab('courseEnrollments'), railed, PROPOSAL).Contribution.replacesSectionKey)
            .toBe('courseEnrollments');
    });

    it('defaults to Details when the form has one, without hardcoding it as the only choice', () => {
        expect(base().ReplaceRailKey).toBe(DETAILS_TAB_KEY);
        expect(InitialPlacementState(PROPOSAL, { ...railed, Rail: railed.Rail.slice(1) }).ReplaceRailKey)
            .toBe('courseEnrollments');
    });

    // Details and More are assembled from their members, so the panel has to join them or
    // the emptied tab is left behind. Every other tab IS its members.
    it('joins a tab that would otherwise be left empty, and only such a tab', () => {
        expect(ResolvePlacementDecision(tab(DETAILS_TAB_KEY), railed, PROPOSAL).Contribution.chromeGroup).toBe('details');
        expect(ResolvePlacementDecision(tab(MORE_TAB_KEY), railed, PROPOSAL).Contribution.chromeGroup).toBe('more');
        expect(ResolvePlacementDecision(tab('courseEnrollments'), railed, PROPOSAL).Contribution.chromeGroup).toBeUndefined();
    });

    it('claims no single section and no grid', () => {
        const out = ResolvePlacementDecision(tab(DETAILS_TAB_KEY), railed, PROPOSAL).Contribution;
        expect(out.relatedEntity).toBeUndefined();
        expect(out.contributionKey).toBeUndefined();
    });

    it('names the tab it stands in for, so it is not mistaken for a full form', () => {
        expect(SummarizePlacement(tab(DETAILS_TAB_KEY), railed))
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
 * The dialog predicts where the panel lands; the chrome layer puts it there. They are
 * separate implementations — the placement model stays free of the chrome layer — so they
 * have to be checked against each other, or the dialog promises a tab the form will not use.
 */
describe('SlotJoinsDetailsTab', () => {
    it('agrees with the chrome layer about which slots join the Details tab', () => {
        expect(SlotJoinsDetailsTab('before-fields')).toBe(true);
        expect(SlotJoinsDetailsTab('after-fields')).toBe(true);
        expect(SlotJoinsDetailsTab('top-area')).toBe(false);
        expect(SlotJoinsDetailsTab('after-related')).toBe(false);
        expect(SlotJoinsDetailsTab('after-everything')).toBe(false);
    });

    it('says which of the two a panel claiming nothing will get', () => {
        const railed: FormPlacementContext = {
            ...CONTEXT,
            Layout: 'left-nav',
            Rail: [{ Key: DETAILS_TAB_KEY, Title: 'Details', Icon: 'fa fa-id-card',
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
            { Key: DETAILS_TAB_KEY, Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['certificationDetails', 'configuration'], IsMore: false },
            { Key: 'moreCheeseMemberCertifications', Title: 'Member Certifications', Icon: 'fa fa-table',
              SectionKeys: ['moreCheeseMemberCertifications'], IsMore: false },
            { Key: MORE_TAB_KEY, Title: 'More', Icon: 'fa fa-folder',
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
        expect(DefaultRailKeyFor(railed)).toBe(DETAILS_TAB_KEY);
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
 * Editing a panel already on the form is the opposite case to adding one.
 * `InitialPlacementState` throws the proposal's placement away on purpose — a component's
 * author should not preselect where it goes. Here the placement being read back is the
 * user's own earlier choice, so discarding it would make every edit start from scratch.
 */
describe('PlacementStateFromContribution', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Rail: [
            { Key: DETAILS_TAB_KEY, Title: 'Details', Icon: 'fa fa-id-card',
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

/**
 * Standing in for one FIELD rather than a whole group.
 *
 * The smallest claim, and the one where placement stops being the user's to choose: the
 * panel renders at the top of the section holding the field, so the slot they picked does
 * not apply. Every assertion below guards a value that reaches `ReplacesFieldName`.
 */
describe('replacing one field', () => {
    it('offers every field the form draws, named with its section', () => {
        expect(ReplaceableFields(CONTEXT)).toEqual([
            { Name: 'Name', Label: 'Name', SectionKey: 'details', SectionTitle: 'Details' },
            { Name: 'Description', Label: 'Description', SectionKey: 'details', SectionTitle: 'Details' },
            { Name: 'SeatLimit', Label: 'Seat Limit', SectionKey: 'scheduleCapacity', SectionTitle: 'Schedule & Capacity' },
        ]);
    });

    it('offers none when the targets were derived rather than read from a form', () => {
        const derived: FormPlacementContext = { ...CONTEXT, TargetsVerified: false };
        expect(ReplaceableFields(derived)).toEqual([]);
    });

    it('finds the section holding a field, and nothing for a field the form does not draw', () => {
        expect(SectionHoldingField(CONTEXT, 'SeatLimit')?.Key).toBe('scheduleCapacity');
        expect(SectionHoldingField(CONTEXT, 'NotOnTheForm')).toBeNull();
    });

    it('writes the field name and nothing else it could be confused with', () => {
        const state = { ...InitialPlacementState(PROPOSAL, CONTEXT), ReplaceMode: 'field' as const, ReplaceFieldName: 'SeatLimit' };
        const { Contribution } = ResolvePlacementDecision(state, CONTEXT, PROPOSAL);
        expect(Contribution.replacesFieldName).toBe('SeatLimit');
        expect(Contribution.replacesSectionKey).toBeUndefined();
        expect(Contribution.relatedEntity).toBeUndefined();
    });

    it('reads its own earlier choice back', () => {
        const spec: FormContributionSpec = {
            slot: 'after-fields', presentation: 'panel', title: 'Seats', replacesFieldName: 'SeatLimit',
        };
        const state = PlacementStateFromContribution(spec, CONTEXT, true);
        expect(state.ReplaceMode).toBe('field');
        expect(state.ReplaceFieldName).toBe('SeatLimit');
    });

    it('falls back to no claim when the field has left the form', () => {
        const spec: FormContributionSpec = {
            slot: 'after-fields', presentation: 'panel', title: 'Seats', replacesFieldName: 'Retired',
        };
        expect(PlacementStateFromContribution(spec, CONTEXT, true).ReplaceMode).toBe('none');
    });

    it('says where the panel actually lands, not which slot was picked', () => {
        const state = { ...InitialPlacementState(null, CONTEXT), ReplaceMode: 'field' as const, ReplaceFieldName: 'SeatLimit' };
        const summary = SummarizePlacement(state, CONTEXT);
        expect(summary).toContain('at the top of the Schedule & Capacity section');
        expect(summary).toContain('The chosen position does not apply');
        expect(summary).not.toContain('at after-fields');
    });
});
