import { describe, it, expect } from 'vitest';
import { Component, Directive, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import { MjIconPickerComponent } from '@memberjunction/ng-ui-components';
import { MjFormPlacementDialogComponent } from './form-placement-dialog.component';
import type { FormPlacementContext, FormPlacementDecision } from './form-placement';

/**
 * DOM coverage for the placement dialog — the one surface between a generated panel and a
 * database row. It must offer only slots and targets that exist on the form in front of the
 * user, and it must emit exactly what they chose, so these check the wiring between the
 * controls and the decision rather than the look.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; }

@Directive({ standalone: true, selector: '[mjButton]' })
class ButtonStub { @Input() variant = ''; }

const CONTEXT: FormPlacementContext = {
    EntityName: 'MoreCheese: Courses',
    Sections: [{ Key: 'details', Title: 'Details' }],
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

const PROPOSAL: FormContributionSpec = {
    slot: 'after-everything',
    presentation: 'panel',
    title: 'Enrollment & Cohort Analytics',
};

function render(context: FormPlacementContext = CONTEXT, proposal: FormContributionSpec | null = PROPOSAL) {
    const f = renderComponentFixture(MjFormPlacementDialogComponent, {
        imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent],
        declarations: [MjFormPlacementDialogComponent],
        // The probe renders a real entity form; these specs supply the slot set directly.
        inputs: { ProbeForm: false, Context: context, Proposal: proposal, ComponentName: 'Cohort Analytics' },
    });
    f.detectChanges();
    return f;
}

const text = (f: ReturnType<typeof render>) => (f.nativeElement as HTMLElement).textContent ?? '';

describe('MjFormPlacementDialogComponent (DOM)', () => {
    it('offers every slot as a target', () => {
        const labels = Array.from((render().nativeElement as HTMLElement).querySelectorAll('.mj-placement-gap .mj-placement-gap-slot'))
            .map((n) => n.textContent?.trim());
        expect(labels).toEqual(['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything']);
    });

    it('starts on the fixed default, not the slot the proposal asked for', () => {
        const f = render();
        expect(f.componentInstance.State.Slot).toBe('after-fields');
    });

    it('shows the panel inside the chosen slot, so the position is literal', () => {
        const f = render();
        const chosen = (f.nativeElement as HTMLElement).querySelector('.mj-placement-gap.is-on');
        expect(chosen?.querySelector('.mj-placement-gap-slot')?.textContent?.trim()).toBe('after-fields');
        expect(chosen?.querySelector('.mj-placement-slot-card-name')?.textContent?.trim())
            .toBe('Enrollment & Cohort Analytics');
    });

    it('lists the real sections and related grids between the slots', () => {
        const t = text(render());
        expect(t).toContain('Details');
        expect(t).toContain('Course Enrollments');
    });

    it('names the entity the panel will apply to', () => {
        expect(text(render())).toContain('MoreCheese: Courses');
    });

    it('emits the decision the controls describe', () => {
        const f = render();
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });

        f.componentInstance.SelectSlot('top-area');
        f.componentInstance.State.Title = 'Cohorts';
        f.componentInstance.OnApply();

        expect(emitted).not.toBeNull();
        expect(emitted!.Contribution.slot).toBe('top-area');
        expect(emitted!.Contribution.title).toBe('Cohorts');
        expect(emitted!.ActivateNow).toBe(true);
    });

    it('emits a claim only once the user asks for one', () => {
        const f = render();
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });

        f.componentInstance.OnApply();
        expect(emitted!.Contribution.replacesSectionKey).toBeUndefined();

        f.componentInstance.SetReplaceMode('section');
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.replacesSectionKey).toBe('details');
    });

    it('emits Cancelled without a decision', () => {
        const f = render();
        let cancelled = false;
        f.componentInstance.Cancelled.subscribe(() => { cancelled = true; });
        f.componentInstance.OnCancel();
        expect(cancelled).toBe(true);
    });

    it('summarises the choices in one sentence', () => {
        expect(text(render())).toContain('Adds a panel at after-fields on every MoreCheese: Courses record');
    });
});

describe('MjFormPlacementDialogComponent (DOM) — entity with a full custom form', () => {
    const context: FormPlacementContext = { ...CONTEXT, FullCustomForm: true };

    it('says the panel will not appear, rather than letting it be applied silently', () => {
        expect(text(render(context))).toContain('will not appear until that form is turned off');
    });

    it('starts as a draft', () => {
        expect(render(context).componentInstance.State.ActivateNow).toBe(false);
    });
});

describe('MjFormPlacementDialogComponent (DOM) — a form with nothing to claim', () => {
    const bare: FormPlacementContext = {
        EntityName: 'MJ: Tags',
        Sections: [],
        Related: [],
        Existing: [],
        SlotsPresent: ['after-fields'],
        SlotsVerified: true,
        Layout: 'accordion',
        Rail: [],
        FullCustomForm: false,
        TargetsVerified: true,
    };

    it('marks the claim choices unavailable rather than offering an empty list', () => {
        const f = render(bare, null);
        expect(f.componentInstance.CanReplaceSection).toBe(false);
        expect(f.componentInstance.CanReplaceField).toBe(false);
        expect(f.componentInstance.CanReplaceRelated).toBe(false);
        expect(f.componentInstance.CanReplaceContribution).toBe(false);
        expect((f.nativeElement as HTMLElement).querySelectorAll('.mj-placement-row.is-off').length).toBe(4);
    });

    it('refuses a claim the form cannot honour, so no row names a missing target', () => {
        const f = render(bare, null);
        f.componentInstance.SetReplaceMode('section');
        f.componentInstance.SetReplaceMode('field');
        f.componentInstance.SetReplaceMode('related');
        f.componentInstance.SetReplaceMode('contribution');
        expect(f.componentInstance.State.ReplaceMode).toBe('none');
    });

    it('still lets the panel be added alongside', () => {
        const f = render(bare, null);
        expect(f.componentInstance.State.ReplaceMode).toBe('none');
    });
});

/**
 * Replacing an installed panel is the one case that needs a contribution key, so the dialog
 * is where that key comes from — the flow could otherwise no longer stand in for a panel an
 * installed app provides.
 */
describe('MjFormPlacementDialogComponent (DOM) — standing in for an existing panel', () => {
    it('offers the panels already on the form', () => {
        expect(text(render())).toContain('Course Health Strip');
    });

    it('emits that panel key once chosen', () => {
        const f = render();
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });
        f.componentInstance.SetReplaceMode('contribution');
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.contributionKey).toBe('skip:health');
    });
});

/**
 * Once the form's own slot set is known, a position it does not offer is not shown: picking
 * it would resolve to the bottom of the form, which is not a position anyone chose.
 */
describe('MjFormPlacementDialogComponent (DOM) — only positions the form offers', () => {
    const generated: FormPlacementContext = {
        ...CONTEXT,
        SlotsPresent: ['before-fields', 'after-fields', 'after-related', 'after-everything'],
        SlotsVerified: true,
    };

    const slotNames = (f: ReturnType<typeof render>) =>
        Array.from((f.nativeElement as HTMLElement).querySelectorAll('.mj-placement-gap .mj-placement-gap-slot'))
            .map((n) => n.textContent?.trim());

    it('leaves out a position the form does not offer', () => {
        expect(slotNames(render(generated)))
            .toEqual(['before-fields', 'after-fields', 'after-related', 'after-everything']);
    });

    it('offers the generated shape when the set is not known', () => {
        const unknown: FormPlacementContext = { ...CONTEXT, SlotsPresent: [], SlotsVerified: false };
        expect(slotNames(render(unknown)))
            .toEqual(['before-fields', 'after-fields', 'after-related', 'after-everything']);
    });

    it('says the list is the generated shape when the form could not be read', () => {
        const assumed: FormPlacementContext = { ...generated, SlotsVerified: false };
        const f = render(assumed);
        expect(f.componentInstance.SlotsAreAssumed).toBe(true);
        expect(text(f)).toContain('hand-written custom template may differ');
    });

    it('says nothing once the form itself was read', () => {
        const f = render(generated);
        expect(f.componentInstance.SlotsAreAssumed).toBe(false);
        expect(text(f)).not.toContain('may differ');
    });
});

/**
 * A rail-layout form shows one "Details" tab, built at runtime from every field section.
 * Its key is `__mj_form_details` and no contribution can name it, so the list on offer is
 * the sections inside that tab — names that appear nowhere on the user's screen unless the
 * dialog says where they live.
 */
describe('MjFormPlacementDialogComponent (DOM) — sections that live in a tab', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [
            { Key: 'organizationIdentity', Title: 'Organization Identity' },
            { Key: 'contactInformation', Title: 'Contact Information' },
        ],
    };

    it('says the sections are parts of the Details tab', () => {
        const f = render(railed);
        expect(f.componentInstance.SectionsAreInDetailsTab).toBe(true);
        expect(text(f)).toContain('Replace blocks inside the Details tab');
    });

    it('offers the sections by their own names, since the tab cannot be named', () => {
        expect(text(render(railed))).toContain('Organization Identity');
    });

    it('calls them plain field sections on a form with no rail', () => {
        const f = render({ ...railed, Layout: 'accordion' });
        expect(f.componentInstance.SectionsAreInDetailsTab).toBe(false);
        expect(text(f)).toContain('Replace field groups');
    });
});

/**
 * Replacing the Details tab is not the same as replacing the form: every other tab stays.
 * The choice only exists on a form that has such a tab.
 */
describe('MjFormPlacementDialogComponent (DOM) — standing in for a whole tab', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [{ Key: 'organizationIdentity', Title: 'Organization Identity' }],
        Rail: [
            { Key: '__mj_form_details', Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['organizationIdentity'], IsMore: false },
            { Key: 'courseEnrollments', Title: 'Course Enrollments', Icon: 'fa fa-table',
              SectionKeys: ['courseEnrollments'], IsMore: false },
        ],
    };

    it('offers a whole tab as a choice without naming one in the label', () => {
        expect(text(render(railed))).toContain('Replace a whole tab');
    });

    // The point of the generalisation: every rail item is on offer, not just Details.
    it('offers every rail item as the tab to stand in for', () => {
        const options = Array.from(
            (render(railed).nativeElement as HTMLElement).querySelectorAll('select[name="mj-rail"] option'),
        ).map((o) => (o as HTMLOptionElement).textContent?.trim());
        expect(options).toEqual(['Details', 'Course Enrollments']);
    });

    it('emits whichever tab key was chosen', () => {
        const f = render(railed);
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });
        f.componentInstance.SetReplaceMode('rail-tab');
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.replacesSectionKey).toBe('__mj_form_details');
        expect(emitted!.Contribution.chromeGroup).toBe('details');
    });

    it('emits no chrome group for a tab that dissolves when emptied', () => {
        const f = render(railed);
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });
        f.componentInstance.SetReplaceMode('rail-tab');
        f.componentInstance.State.ReplaceRailKey = 'courseEnrollments';
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.replacesSectionKey).toBe('courseEnrollments');
        expect(emitted!.Contribution.chromeGroup).toBeUndefined();
    });

    it('does not offer a tab on a form that shows no rail', () => {
        expect(text(render({ ...railed, Rail: [] }))).not.toContain('Replace a whole tab');
    });

    it('refuses the choice on a form with no rail', () => {
        const f = render({ ...railed, Rail: [] });
        f.componentInstance.SetReplaceMode('rail-tab');
        expect(f.componentInstance.State.ReplaceMode).toBe('none');
    });
});


/**
 * The real Organizations form: four field sections folded into one rail tab, one of them
 * generated with the title "Details" — the same word the tab carries. Picking the section
 * hides a quarter of the tab and leaves the rest on screen, which is not what the label
 * promised, so the two must not read alike.
 */

/** The section names offered once "Replace blocks" is chosen. */
async function sectionChoices(f: { nativeElement: HTMLElement; detectChanges(): void; whenStable(): Promise<unknown> }): Promise<string[]> {
    f.nativeElement.querySelector<HTMLInputElement>('input[name="mj-replace"][value="section"]')!.click();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return Array.from(f.nativeElement.querySelectorAll('input[name="mj-section-pick"]'))
        .map((input) => input.parentElement?.querySelector('.mj-placement-fieldpick-name')?.textContent?.trim() ?? '');
}

describe('MjFormPlacementDialogComponent (DOM) — the section named Details', () => {
    const organizations: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [
            { Key: 'organizationIdentity', Title: 'Organization Identity' },
            { Key: 'hierarchyAndStructure', Title: 'Hierarchy and Structure' },
            { Key: 'contactInformation', Title: 'Contact Information' },
            { Key: 'details', Title: 'Details' },
        ],
    };

    it('qualifies the section that shares the tab’s name', async () => {
        expect(await sectionChoices(render(organizations))).toContain('Details (the field group, not the tab)');
    });

    it('leaves the other section names as they are', async () => {
        expect(await sectionChoices(render(organizations))).toContain('Organization Identity');
    });

    it('says how many panels the chosen tab holds', () => {
        const withRail = { ...organizations, Rail: [
            { Key: '__mj_form_details', Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['organizationIdentity', 'hierarchyAndStructure', 'contactInformation', 'details'],
              IsMore: false },
        ] };
        expect(text(render(withRail))).toContain('all 4 blocks in it go');
    });

    it('still writes the plain section key when that section is chosen', () => {
        const f = render(organizations);
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });
        f.componentInstance.SetReplaceMode('section');
        f.componentInstance.State.ReplaceSectionKey = 'details';
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.replacesSectionKey).toBe('details');
        expect(emitted!.Contribution.chromeGroup).toBeUndefined();
    });
});


/**
 * A position and a piece of content are different kinds of thing, and the preview drew
 * them as peers: `before-fields` in a rounded box directly above Contact Information in
 * a rounded box. A reader cannot tell which one is a thing on the form and which one is
 * a place to put something.
 */
describe('MjFormPlacementDialogComponent (DOM) — positions read as gaps, not as content', () => {
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [
            { Key: 'organizationIdentity', Title: 'Organization Identity' },
            { Key: 'hierarchyAndStructure', Title: 'Hierarchy and Structure' },
            { Key: 'contactInformation', Title: 'Contact Information' },
            { Key: 'details', Title: 'Details' },
        ],
    };
    const el = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;

    it('draws no position as a content block', () => {
        const names = Array.from(el(render(railed)).querySelectorAll('.mj-placement-existing-name'))
            .map((n) => n.textContent?.trim());
        for (const slot of ['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything']) {
            expect(names).not.toContain(slot);
        }
    });

    it('leads a position with where it is, keeping the stored name beside it', () => {
        const gap = el(render(railed)).querySelector('.mj-placement-gap');
        expect(gap?.querySelector('.mj-placement-gap-name')?.textContent?.trim()).toBe('Above everything');
        expect(gap?.querySelector('.mj-placement-gap-slot')?.textContent?.trim()).toBe('top-area');
    });

    it('still writes the stored slot name, not the plain-language one', () => {
        const f = render(railed);
        let emitted: FormPlacementDecision | null = null;
        f.componentInstance.Applied.subscribe((d: FormPlacementDecision) => { emitted = d; });
        f.componentInstance.State.Slot = 'before-fields';
        f.componentInstance.OnApply();
        expect(emitted!.Contribution.slot).toBe('before-fields');
    });

    // "Details" the generated field group sat at the same level as "Details" the rail tab.
    it('draws the field groups inside the one tab the rail folds them into', () => {
        const tab = el(render(railed)).querySelector('.mj-placement-tab');
        expect(tab?.querySelector('.mj-placement-tab-name')?.textContent?.trim()).toBe('Details');
        expect(tab?.querySelectorAll('.mj-placement-existing')).toHaveLength(4);
        expect(tab?.textContent).toContain('4 field groups');
    });

    it('draws no tab container on a form whose sections stand on their own', () => {
        expect(el(render({ ...railed, Layout: 'accordion' })).querySelector('.mj-placement-tab')).toBeNull();
    });
});


/**
 * Which rail item the panel joins is the thing the user is actually choosing, so the
 * preview has to say it. It says it in a line rather than drawing a miniature rail: side
 * by side, neither the rail nor the form body had enough width to be legible.
 */
describe('MjFormPlacementDialogComponent (DOM) — the preview names the tab the panel joins', () => {
    const DETAILS = '__mj_form_details';
    const railed: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [
            { Key: 'organizationIdentity', Title: 'Organization Identity' },
            { Key: 'details', Title: 'Details' },
        ],
        Rail: [
            { Key: DETAILS, Title: 'Details', Icon: 'fa-solid fa-id-card',
              SectionKeys: ['organizationIdentity', 'details'], IsMore: false },
            { Key: 'courseEnrollments', Title: 'Course Enrollments', Icon: 'fa-solid fa-table',
              SectionKeys: ['courseEnrollments'], IsMore: false },
            { Key: '__mj_form_more', Title: 'More', Icon: 'fa-solid fa-folder',
              SectionKeys: ['systemMetadata'], IsMore: true },
        ],
    };
    const el = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;
    // The slot names are about the fields, and the fields are the Details tab. A panel at
    // before-fields that turned into a tab at the bottom of the rail made the slot a
    // choice with no visible effect.
    it('puts a panel at a field slot into the Details tab, even claiming nothing', () => {
        const f = render(railed);
        expect(f.componentInstance.State.Slot).toBe('after-fields');
        expect(f.componentInstance.AddsRailItem).toBe(false);
        expect(f.componentInstance.TargetRail?.Title).toBe('Details');
    });

    it('gives a panel positioned past the fields a rail item of its own', () => {
        const f = render(railed);
        f.componentInstance.State.Slot = 'after-everything';
        expect(f.componentInstance.AddsRailItem).toBe(true);
        expect(f.componentInstance.TargetRail).toBeNull();
    });

    it('says so in the preview when the panel will get a tab of its own', () => {
        const f = renderComponentFixture(MjFormPlacementDialogComponent, {
            imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent],
            declarations: [MjFormPlacementDialogComponent],
            inputs: { ProbeForm: false, Context: railed, Proposal: PROPOSAL, ComponentName: 'Cohort Analytics' },
            setup: (inst) => { inst.State.Slot = 'after-everything'; },
        });
        f.detectChanges();
        expect((f.nativeElement as HTMLElement).querySelector('.mj-placement-rail-note')?.textContent)
            .toContain('Your panel gets a rail item of its own');
    });

    // Rendered with the mode already chosen. Flipping it after the first pass also flips
    // the is-on / is-off bindings on the replace rows, which a second check trips over.
    it('names the tab instead once the panel joins one', () => {
        const f = renderComponentFixture(MjFormPlacementDialogComponent, {
            imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent],
            declarations: [MjFormPlacementDialogComponent],
            inputs: { ProbeForm: false, Context: railed, Proposal: PROPOSAL, ComponentName: 'Cohort Analytics' },
            setup: (inst) => inst.SetReplaceMode('rail-tab'),
        });
        f.detectChanges();
        const note = (f.nativeElement as HTMLElement).querySelector('.mj-placement-rail-note');
        expect(note?.textContent).toContain('Your panel appears under');
        expect(note?.textContent).toContain('Details');
    });

    // The rail was drawn as a list beside the body and squeezed it to a sliver.
    it('draws no rail list in the preview', () => {
        expect(el(render(railed)).querySelector('.mj-placement-rail')).toBeNull();
    });

    // Asserted on the getters rather than re-rendered: flipping the mode also flips the
    // is-on / is-off bindings on the replace rows, which a second check trips over.
    it('highlights the tab the panel joins when it replaces a field group in it', () => {
        const f = render(railed);
        f.componentInstance.SetReplaceMode('section');
        f.componentInstance.State.ReplaceSectionKey = 'details';
        expect(f.componentInstance.TargetRail?.Title).toBe('Details');
        expect(f.componentInstance.AddsRailItem).toBe(false);
    });

    it('stops calling it a new item once the panel joins an existing tab', () => {
        const f = render(railed);
        f.componentInstance.State.Slot = 'after-everything';
        expect(f.componentInstance.AddsRailItem).toBe(true);
        f.componentInstance.SetReplaceMode('rail-tab');
        expect(f.componentInstance.AddsRailItem).toBe(false);
    });

    it('highlights the Details tab when the panel stands in for the whole tab', () => {
        const f = render(railed);
        f.componentInstance.SetReplaceMode('rail-tab');
        expect(f.componentInstance.TargetRail?.Key).toBe(DETAILS);
    });

    // A bare strip has no chrome, so it never becomes a rail item.
    it('gives a bare strip no rail item', () => {
        const f = render(railed);
        f.componentInstance.State.Presentation = 'bare';
        expect(f.componentInstance.TargetRail).toBeNull();
        expect(f.componentInstance.AddsRailItem).toBe(false);
    });

    it('says nothing about a rail when the form shows none', () => {
        expect(el(render(CONTEXT)).querySelector('.mj-placement-rail-note')).toBeNull();
    });
});


/**
 * The replace choices differ only in how much they cover, and saying so in a label has
 * not landed. The preview marks the blocks each choice takes off the form, so the
 * difference between a whole tab and one block inside it is visible rather than described.
 */
describe('MjFormPlacementDialogComponent (DOM) — the preview marks what the choice removes', () => {
    const organizations: FormPlacementContext = {
        ...CONTEXT,
        Layout: 'left-nav',
        Sections: [
            { Key: 'organizationIdentity', Title: 'Organization Identity' },
            { Key: 'hierarchyAndStructure', Title: 'Hierarchy and Structure' },
            { Key: 'contactInformation', Title: 'Contact Information' },
            { Key: 'details', Title: 'Details' },
        ],
        Rail: [{
            Key: '__mj_form_details', Title: 'Details', Icon: 'fa fa-id-card',
            SectionKeys: ['organizationIdentity', 'hierarchyAndStructure', 'contactInformation', 'details'],
            IsMore: false,
        }],
    };
    const el = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;
    const struck = (f: ReturnType<typeof render>) =>
        Array.from(el(f).querySelectorAll('.mj-placement-existing.is-replaced .mj-placement-existing-name'))
            .map((n) => n.textContent?.trim());

    it('marks nothing while the panel is only being added', () => {
        expect(struck(render(organizations))).toEqual([]);
    });

    it('marks one block for the one-block choice', () => {
        const f = render(organizations);
        f.componentInstance.SetReplaceMode('section');
        f.componentInstance.State.ReplaceSectionKey = 'details';
        expect(f.componentInstance.IsReplaced('details')).toBe(true);
        expect(f.componentInstance.IsReplaced('organizationIdentity')).toBe(false);
        expect(f.componentInstance.IsWholeDetailsTabReplaced).toBe(false);
    });

    it('marks every block in the tab for the whole-tab choice', () => {
        const f = render(organizations);
        f.componentInstance.SetReplaceMode('rail-tab');
        for (const key of ['organizationIdentity', 'hierarchyAndStructure', 'contactInformation', 'details']) {
            expect(f.componentInstance.IsReplaced(key)).toBe(true);
        }
        expect(f.componentInstance.IsWholeDetailsTabReplaced).toBe(true);
    });

    it('draws the marks, so the two choices differ on screen and not only in the label', () => {
        const one = renderComponentFixture(MjFormPlacementDialogComponent, {
            imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent],
            declarations: [MjFormPlacementDialogComponent],
            inputs: { ProbeForm: false, Context: organizations, Proposal: PROPOSAL, ComponentName: 'X' },
            setup: (inst) => { inst.SetReplaceMode('section'); inst.State.ReplaceSectionKey = 'details'; },
        });
        one.detectChanges();
        expect(struck(one)).toEqual(['Details']);
    });

    it('marks the related grid it takes over, and no field block', () => {
        const f = render(organizations);
        f.componentInstance.SetReplaceMode('related');
        expect(f.componentInstance.IsRelatedReplaced(0)).toBe(true);
        expect(f.componentInstance.IsReplaced('details')).toBe(false);
    });
});


/**
 * `MoreCheese: Certifications`: three rail groups against a threshold of eight, so the
 * form is an accordion and draws no rail. The groups still exist — they decide what is
 * visible — so the dialog offered to replace a tab the user could not see anywhere.
 */
describe('MjFormPlacementDialogComponent (DOM) — a form that shows no rail', () => {
    const accordion: FormPlacementContext = {
        ...CONTEXT,
        EntityName: 'MoreCheese: Certifications',
        Layout: 'accordion',
        Sections: [
            { Key: 'certificationDetails', Title: 'Certification Details' },
            { Key: 'configuration', Title: 'Configuration' },
        ],
        Rail: [
            { Key: '__mj_form_details', Title: 'Details', Icon: 'fa fa-id-card',
              SectionKeys: ['certificationDetails', 'configuration'], IsMore: false },
            { Key: '__mj_form_more', Title: 'More', Icon: 'fa fa-folder',
              SectionKeys: ['systemMetadata'], IsMore: true },
        ],
    };
    const el = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;

    // One TestBed per test: a second `render` in the same `it` throws.
    it('does not offer to replace a tab', () => {
        const f = render(accordion);
        expect(el(f).textContent).not.toContain('Replace a whole tab');
        expect(f.componentInstance.CanReplaceRailTab).toBe(false);
    });

    it('refuses the choice even if something asks for it', () => {
        const f = render(accordion);
        f.componentInstance.SetReplaceMode('rail-tab');
        expect(f.componentInstance.State.ReplaceMode).toBe('none');
    });

    it('says nothing about which tab the panel joins', () => {
        expect(el(render(accordion)).querySelector('.mj-placement-rail-note')).toBeNull();
    });

    it('draws no Details tab container around the sections', () => {
        expect(el(render(accordion)).querySelector('.mj-placement-tab')).toBeNull();
    });

    // The sections are real. Only the tab framing was wrong.
    it('still offers the form’s own sections, by their own names', async () => {
        expect(await sectionChoices(render(accordion))).toEqual(['Certification Details', 'Configuration']);
    });
});

/**
 * A panel usually stands in for a group of inputs, not one. The picker is therefore a set
 * of checkboxes over ONE section: the panel renders at the top of a single section, so
 * fields from two of them would describe a panel with two places to be.
 */
describe('MjFormPlacementDialogComponent (DOM) — standing in for fields', () => {
    const withFields: FormPlacementContext = {
        ...CONTEXT,
        Sections: [
            {
                Key: 'details', Title: 'Details',
                Fields: [
                    { Name: 'Name', Label: 'Name' },
                    { Name: 'Description', Label: 'Description' },
                ],
            },
            {
                Key: 'scheduleCapacity', Title: 'Schedule & Capacity',
                Fields: [{ Name: 'SeatLimit', Label: 'Seat Limit' }],
            },
        ],
    };

    /** Render with the field mode already on, so the picker is in the first pass. */
    function renderPicking(context: FormPlacementContext = withFields) {
        return renderComponentFixture(MjFormPlacementDialogComponent, {
            imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent],
            declarations: [MjFormPlacementDialogComponent],
            inputs: { ProbeForm: false, Context: context, Proposal: null, ComponentName: 'Identity Card' },
            setup: (c: MjFormPlacementDialogComponent) => {
                c.State.ReplaceMode = 'field';
            },
        });
    }

    it('shows a checkbox per field of the chosen section, and none of the others', () => {
        const f = renderPicking();
        const labels = Array.from(
            (f.nativeElement as HTMLElement).querySelectorAll('.mj-placement-fieldpick-name'),
        ).map((n) => n.textContent?.trim());
        expect(labels).toEqual(['Name', 'Description']);
    });

    it('collects several fields into one claim', () => {
        const f = renderPicking();
        f.componentInstance.ToggleField('Name', true);
        f.componentInstance.ToggleField('Description', true);
        expect(f.componentInstance.ChosenFields).toEqual(['Name', 'Description']);
    });

    it('drops a field when it is unticked', () => {
        const f = renderPicking();
        f.componentInstance.ToggleField('Name', true);
        f.componentInstance.ToggleField('Description', true);
        f.componentInstance.ToggleField('Name', false);
        expect(f.componentInstance.ChosenFields).toEqual(['Description']);
    });

    it('clears the picks when the section changes, so a claim never spans two', () => {
        const f = renderPicking();
        f.componentInstance.ToggleField('Name', true);
        f.componentInstance.SetFieldSection('scheduleCapacity');
        expect(f.componentInstance.ChosenFields).toEqual([]);
        expect(f.componentInstance.FieldChoices.map((x) => x.Name)).toEqual(['SeatLimit']);
    });

    it('refuses to apply a claim that names no field', () => {
        const f = renderPicking();
        expect(f.componentInstance.FieldClaimIsEmpty).toBe(true);
        f.componentInstance.ToggleField('Name', true);
        expect(f.componentInstance.FieldClaimIsEmpty).toBe(false);
    });

    it('does not offer the mode when the form\'s fields could not be read', () => {
        const derived: FormPlacementContext = { ...withFields, TargetsVerified: false };
        const f = render(derived, null);
        expect(f.componentInstance.CanReplaceField).toBe(false);
    });
});

/**
 * With the form preview on, the scaled form is read-only and every answer is made in the
 * controls beside it. The preview only has to receive the panel as it would be saved.
 */
@Component({ standalone: true, selector: 'mj-form-placement-preview', template: '' })
class PreviewStub {
    @Input() EntityName = '';
    @Input() RecordKey: unknown;
    @Input() Spec: unknown;
    @Input() ReplacesRowID: unknown;
    @Input() PanelComponentSpec: unknown;
    @Input() PanelComponentID: unknown;
}

describe('MjFormPlacementDialogComponent (DOM) — the read-only form preview', () => {
    const withFields: FormPlacementContext = {
        ...CONTEXT,
        Sections: [
            { Key: 'details', Title: 'Details', Fields: [{ Name: 'Name', Label: 'Name' }, { Name: 'Code', Label: 'Code' }] },
            { Key: 'dates', Title: 'Dates', Fields: [{ Name: 'StartDate', Label: 'Start date' }] },
        ],
    };

    function renderPreview(context: FormPlacementContext = withFields) {
        const f = renderComponentFixture(MjFormPlacementDialogComponent, {
            imports: [CommonModule, FormsModule, AlertStub, ButtonStub, MjIconPickerComponent, PreviewStub],
            declarations: [MjFormPlacementDialogComponent],
            // SlotsVerified skips the probe, so the preview shows without rendering a real form.
            inputs: { ProbeForm: true, Context: context, Proposal: PROPOSAL, ComponentName: 'Cohort Analytics' },
        });
        f.detectChanges();
        return f;
    }

    const root = (f: ReturnType<typeof renderPreview>) => f.nativeElement as HTMLElement;

    it('shows the scaled form in place of the list, beside every control the list layout has', () => {
        const f = renderPreview();
        expect(root(f).querySelector('mj-form-placement-preview')).not.toBeNull();
        expect(root(f).querySelector('.mj-placement-gap')).toBeNull();
        const side = root(f).querySelector('.mj-placement-settings--side')!;
        expect(side.querySelectorAll('input[name="mj-replace"]').length).toBeGreaterThan(1);
        expect(side.querySelectorAll('input[name="mj-status"]').length).toBe(2);
        expect(side.querySelector('select[aria-label="Position on the form"]')).not.toBeNull();
        expect(side.textContent).toContain('Already on this form');
    });

    it('falls back to the list when the form cannot be drawn', () => {
        const f = renderPreview();
        f.componentInstance.OnPreviewFailed();
        f.detectChanges();
        expect(root(f).querySelector('.mj-placement-gap')).not.toBeNull();
    });

    it('never previews a full custom form, which has no positions to show', () => {
        expect(renderPreview({ ...withFields, FullCustomForm: true }).componentInstance.ShowFormPreview).toBe(false);
    });

    it('moves the previewed panel when the position control changes', async () => {
        const f = renderPreview();
        const select = root(f).querySelector<HTMLSelectElement>('select[aria-label="Position on the form"]')!;
        select.value = 'after-everything';
        select.dispatchEvent(new Event('change'));
        f.detectChanges();
        expect(f.componentInstance.PreviewSpec.slot).toBe('after-everything');
    });

    it('draws a field claim once the fields are ticked', async () => {
        const f = renderPreview();
        root(f).querySelector<HTMLInputElement>('input[name="mj-replace"][value="field"]')!.click();
        f.detectChanges();
        await f.whenStable();
        f.detectChanges();
        const boxes = root(f).querySelectorAll<HTMLInputElement>('.mj-placement-fieldpick-item input');
        boxes[0].click();
        boxes[1].click();
        f.detectChanges();
        expect(f.componentInstance.PreviewSpec.replacesFieldNames).toEqual(['Name', 'Code']);
        expect(f.componentInstance.PlacementLine).toBe('At the top of Details, in place of the Name and Code fields');
    });

    it('hands the preview the same spec until an answer changes, so the form is not redrawn every pass', () => {
        const dialog = renderPreview().componentInstance;
        const first = dialog.PreviewSpec;
        expect(dialog.PreviewSpec).toBe(first);
        dialog.State.Title = 'Renamed';
        expect(dialog.PreviewSpec).not.toBe(first);
    });

    it('says in one line what it replaces, with a way back to replacing nothing', async () => {
        const f = renderPreview();
        expect(f.componentInstance.PlacementLine).toBe('After the fields');
        root(f).querySelector<HTMLInputElement>('input[name="mj-replace"][value="section"]')!.click();
        f.detectChanges();
        await f.whenStable();
        f.detectChanges();
        expect(text(f)).toContain('In place of the Details section');
        const back = Array.from(root(f).querySelectorAll('button')).find((b) => b.textContent?.includes('Replace nothing'))!;
        back.click();
        f.detectChanges();
        expect(f.componentInstance.State.ReplaceMode).toBe('none');
    });

    it('lists the panels sharing the position and moves this one among them', async () => {
        const f = renderPreview({
            ...withFields,
            Existing: [
                { Key: 'panel:A', Slot: 'after-fields', Title: 'Alpha', SortKey: 20 },
                { Key: 'panel:B', Slot: 'after-fields', Title: 'Beta', SortKey: 10 },
            ],
        });
        const items = () => Array.from(root(f).querySelectorAll('.mj-placement-order-item')).map((li) => li.textContent?.trim());
        expect(items()).toEqual(['Alpha', 'Beta', expect.stringContaining('Enrollment')]);
        root(f).querySelector<HTMLButtonElement>('button[aria-label="Move up"]')!.click();
        f.detectChanges();
        expect(items()).toEqual(['Alpha', expect.stringContaining('Enrollment'), 'Beta']);
        expect(f.componentInstance.PreviewSpec.sortKey).toBe(15);
    });

    it('shows no order list when the position has no other panel', () => {
        expect(renderPreview().nativeElement.querySelector('.mj-placement-order')).toBeNull();
    });

    it('stands in for several blocks once they are ticked', async () => {
        const f = renderPreview();
        root(f).querySelector<HTMLInputElement>('input[name="mj-replace"][value="section"]')!.click();
        f.detectChanges();
        await f.whenStable();
        f.detectChanges();
        const boxes = root(f).querySelectorAll<HTMLInputElement>('input[name="mj-section-pick"]');
        boxes[1].click();
        f.detectChanges();
        expect(f.componentInstance.PreviewSpec.replacesSectionKeys).toEqual(['details', 'dates']);
        expect(f.componentInstance.PlacementLine).toBe('In place of the Details and Dates sections');
    });

    it('places the panel inside a section from the position control', () => {
        const f = renderPreview();
        const select = root(f).querySelector<HTMLSelectElement>('select[aria-label="Position on the form"]')!;
        expect(Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['Between blocks', 'Inside a section']);
        select.value = 'in:dates:end';
        select.dispatchEvent(new Event('change'));
        f.detectChanges();
        expect(f.componentInstance.PreviewSpec).toMatchObject({ inSectionKey: 'dates', sectionPosition: 'end' });
        expect(f.componentInstance.PlacementLine).toBe('At the bottom of the Dates section');
    });
});
