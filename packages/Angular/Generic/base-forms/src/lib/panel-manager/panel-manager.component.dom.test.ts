import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MjPanelManagerComponent } from './panel-manager.component';
import { FormPanelAdminService } from './form-panel-admin.service';
import { FormSlotProbeService } from '../apply/form-slot-probe.service';
import type { FormOverrideRow, FormPanelContributionRow, FormPanelRendering } from './form-panel-inventory';
import { PlacementStateFromContribution, ResolvePlacementDecision, type FormPlacementState } from '../apply/form-placement';

/**
 * The drawer is the only way back out of applying a panel, so the thing it must never do
 * is disagree with the form. Every case here is about that: what it offers, what it
 * refuses to offer, and what it says when a write fails.
 */
const ENTITY = { ID: 'ENT-ORG', Name: 'MJ_BizApps_Common: Organizations' } as unknown as EntityInfo;

function row(over: Partial<FormPanelContributionRow> = {}): FormPanelContributionRow {
    return {
        ID: 'ROW-1',
        Name: 'Organization Member Overview',
        Title: 'Organization Member Overview',
        Icon: null,
        Slot: 'before-fields',
        Presentation: 'panel',
        Status: 'Active',
        Scope: 'User',
        UserID: 'user-me',
        RoleID: null,
        Role: null,
        ReplacesSectionKey: 'details',
        ReplacesFieldNames: [],
        RelatedEntity: null,
        RelatedJoinField: null,
        ChromeGroup: null,
        ContributionKey: 'panel:OrgMemberOverviewPanel',
        ComponentID: 'COMP-1',
        SortKey: 0,
        ReplacesSectionKeys: [],
        InSectionKey: null,
        SectionPosition: null,
        ...over,
    };
}

const admin = {
    RowsForEntity: vi.fn((): FormPanelContributionRow[] => [row()]),
    OverridesForEntity: vi.fn((): FormOverrideRow[] => []),
    CanPublish: vi.fn(() => false),
    SetActive: vi.fn(async (): Promise<{ Success: boolean; Message?: string }> => ({ Success: true })),
    Remove: vi.fn(async () => ({ Success: true })),
    SetPlacement: vi.fn(async () => ({ Success: true })),
    PublishContribution: vi.fn(async () => ({ Success: true })),
    PublishOverride: vi.fn(async () => ({ Success: true })),
    Hide: vi.fn(),
    Show: vi.fn(),
    /** Undefined: every item that is on draws, unless a test says which draw. */
    RenderingFor: vi.fn((): FormPanelRendering | undefined => undefined),
};

/** The placement dialog's reading of the form, which every change has to drop. */
const probe = { Forget: vi.fn() };

/** The signed-in user the drawer decides "yours" by, and the roles a holder can publish to. */
const PROVIDER = {
    CurrentUser: { ID: 'user-me', UserRoles: [{ RoleID: 'role-sales' }] },
    Roles: [{ ID: 'role-sales', Name: 'Sales' }, { ID: 'role-ops', Name: 'Ops' }],
};

beforeEach(() => {
    admin.RowsForEntity.mockReset().mockReturnValue([row()]);
    admin.OverridesForEntity.mockReset().mockReturnValue([]);
    admin.CanPublish.mockReset().mockReturnValue(false);
    admin.SetActive.mockReset().mockResolvedValue({ Success: true });
    admin.Remove.mockReset().mockResolvedValue({ Success: true });
    admin.SetPlacement.mockReset().mockResolvedValue({ Success: true });
    admin.PublishContribution.mockReset().mockResolvedValue({ Success: true });
    admin.PublishOverride.mockReset().mockResolvedValue({ Success: true });
    admin.Hide.mockReset();
    admin.Show.mockReset();
    admin.RenderingFor.mockReset().mockReturnValue(undefined);
    probe.Forget.mockReset();
});

/**
 * The placement dialog is covered by its own spec; here it only has to exist. Its read-only form
 * preview is inert, as the real dialog's is.
 */
@Component({
    standalone: true,
    selector: 'mj-form-placement-dialog',
    template: '<div class="dialog-stub"><div inert><button class="preview-btn">x</button></div><button class="answer-btn">ok</button></div>',
})
class PlacementDialogStub {
    @Input() Provider: IMetadataProvider | null = null;
    @Input() Context: unknown;
    @Input() Proposal: unknown;
    @Input() ComponentName = '';
    @Input() SeedState: unknown;
    @Input() ProbeForm = true;
    @Input() RecordKey: unknown;
    @Input() ReplacesRowID: unknown;
    @Input() PanelComponentID: unknown;
    @Input() VisibleTo = '';
    @Input() OfferKeepOff = false;
    @Output() Applied = new EventEmitter<unknown>();
    @Output() Cancelled = new EventEmitter<void>();
}

function render(inputs: Record<string, unknown> = {}) {
    const f = renderComponentFixture(MjPanelManagerComponent, {
        imports: [PlacementDialogStub, MJButtonDirective],
        declarations: [MjPanelManagerComponent],
        providers: [{ provide: FormPanelAdminService, useValue: admin }, { provide: FormSlotProbeService, useValue: probe }],
        inputs: {
            Visible: true, Entity: ENTITY, TitleByKey: new Map([['details', 'Details']]),
            Provider: PROVIDER, ...inputs,
        },
    });
    f.detectChanges();
    return f;
}

const text = (f: ReturnType<typeof render>) => (f.nativeElement as HTMLElement).textContent ?? '';

const buttons = (f: ReturnType<typeof render>) =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('.mj-pm-action'))
        .map((b) => b.textContent?.trim());

describe('MjPanelManagerComponent (DOM)', () => {
    it('lists the panel with what it replaces, in words rather than keys', () => {
        const body = text(render());
        expect(body).toContain('Organization Member Overview');
        expect(body).toContain('stands in for the Details section');
        expect(body).toContain('Only you');
    });

    it('offers turning off and removing a panel that is on', () => {
        expect(buttons(render())).toEqual(['Change where it goes', 'Turn off', 'Remove']);
    });

    it('offers turning on a draft instead', () => {
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Pending' })]);
        expect(buttons(render())).toEqual(['Change where it goes', 'Turn on', 'Remove']);
    });

    it('draws nothing while closed', () => {
        expect(query(render({ Visible: false }), '.mj-pm-drawer')).toBeNull();
    });

    it('says so when the form has nothing on it', () => {
        admin.RowsForEntity.mockReturnValue([]);
        expect(text(render())).toContain('Nothing is registered on this form yet');
    });
});

describe('MjPanelManagerComponent (DOM) — switching a panel off', () => {
    it('writes through the service and tells the form to resolve again', async () => {
        const f = render();
        const changed = vi.fn();
        f.componentInstance.Changed.subscribe(changed);
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(admin.SetActive).toHaveBeenCalledWith('ROW-1', false, PROVIDER);
        expect(changed).toHaveBeenCalled();
    });

    it('turns a draft on rather than off', async () => {
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Pending' })]);
        const f = render();
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(admin.SetActive).toHaveBeenCalledWith('ROW-1', true, PROVIDER);
    });

    it('shows the reason when a write fails, and does not claim the form changed', async () => {
        admin.SetActive.mockResolvedValue({ Success: false, Message: 'No permission.' });
        const f = render();
        const changed = vi.fn();
        f.componentInstance.Changed.subscribe(changed);
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(f.componentInstance.Error).toBe('No permission.');
        expect(changed).not.toHaveBeenCalled();
    });
});

/**
 * Removal deletes a row. It takes two presses on the same button rather than a dialog
 * over a drawer over a form.
 */
describe('MjPanelManagerComponent (DOM) — removing a panel', () => {
    it('asks before deleting, and does not write on the first press', async () => {
        const f = render();
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        expect(admin.Remove).not.toHaveBeenCalled();
        expect(f.componentInstance.RemoveLabel(f.componentInstance.Items[0])).toBe('Really remove?');
    });

    it('deletes on the second press', async () => {
        const f = render();
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        expect(admin.Remove).toHaveBeenCalledWith('ROW-1', PROVIDER);
    });

    it('forgets the confirmation when the drawer is closed', async () => {
        const f = render();
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        f.componentInstance.OnClose();
        expect(f.componentInstance.Confirming).toBeNull();
    });
});

/**
 * A compiled panel is code and an automatic grid is a relationship. Both are listed so
 * the form's contents are accounted for; neither gets a button that could not work.
 */
describe('MjPanelManagerComponent (DOM) — what it will not offer to change', () => {
    it('lists a compiled panel and an automatic grid without switches', () => {
        admin.RowsForEntity.mockReturnValue([]);
        const f = render({
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
            StockGrids: [{ SectionKey: 'memberProfiles', DisplayName: 'Member Profiles' }],
        });
        expect(text(f)).toContain('Course Health Strip');
        expect(text(f)).toContain('Member Profiles');
        expect(buttons(f)).toEqual([]);
    });

    it('refuses a toggle on a row that offers none', async () => {
        admin.RowsForEntity.mockReturnValue([]);
        const f = render({ Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }] });
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(admin.SetActive).not.toHaveBeenCalled();
    });
});

/**
 * A full custom form owns the body, so an Active row behind one renders nothing. Calling
 * that Active would describe the row and not the form.
 */
describe('MjPanelManagerComponent (DOM) — behind a full custom form', () => {
    it('says everything is held back, and still lets the panel be switched off', () => {
        const f = render({ FullCustomForm: true });
        expect(text(f)).toContain('held back');
        expect(f.componentInstance.Items[0].State).toBe('held');
        expect(buttons(f)).toEqual(['Change where it goes', 'Turn off', 'Remove']);
    });
});


/**
 * Changing where a panel goes used to mean deleting it and adding it again. The manager
 * reopens the placement dialog on the row instead, and writes the answers back.
 */
describe('MjPanelManagerComponent (DOM) — changing where a panel goes', () => {
    it('opens the dialog on the row rather than on a blank one', () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.Editing?.ID).toBe('ROW-1');
        expect(f.componentInstance.EditProposal?.slot).toBe('before-fields');
        expect(f.componentInstance.EditProposal?.replacesSectionKey).toBe('details');
    });

    // A panel cannot be asked to stand in for itself.
    it('leaves the row being edited out of the panels it could replace', () => {
        admin.RowsForEntity.mockReturnValue([row(), row({ ID: 'ROW-2', Name: 'Other', ContributionKey: 'panel:Other' })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        // Keyed by contribution key: replacing a panel writes its key, never its row ID.
        expect(f.componentInstance.EditContext?.Existing.map((e) => e.Key)).toEqual(['panel:Other']);
    });

    it('writes the new placement and closes, keeping the row\'s own key', async () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'Renamed' },
            ActivateNow: true,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith(
            'ROW-1',
            { slot: 'after-fields', presentation: 'panel', title: 'Renamed', contributionKey: 'panel:OrgMemberOverviewPanel' },
            'Active', PROVIDER);
        expect(f.componentInstance.Editing).toBeNull();
    });

    it('drops the key of a panel the user stopped replacing', async () => {
        admin.RowsForEntity.mockReturnValue([
            row({ ContributionKey: 'panel:Other' }),
            row({ ID: 'ROW-2', Name: 'Other', ContributionKey: 'panel:Other' }),
        ]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items.find((i) => i.ID === 'ROW-1')!);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'Mine' },
            ActivateNow: true,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith(
            'ROW-1', { slot: 'after-fields', presentation: 'panel', title: 'Mine' }, 'Active', PROVIDER);
    });

    // Two grids can show one entity; the join field is what tells them apart.
    it('opens a grid claim with its join field', () => {
        admin.RowsForEntity.mockReturnValue([row({
            ReplacesSectionKey: null, RelatedEntity: 'MJ_BizApps_Common: People', RelatedJoinField: 'ContactID',
            ContributionKey: 'related:MJ_BizApps_Common: People:ContactID',
        })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.EditProposal).toMatchObject({
            relatedEntity: 'MJ_BizApps_Common: People', relatedJoinField: 'ContactID',
        });
    });

    it('writes nothing when the dialog is cancelled', () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        f.componentInstance.CloseEdit();
        expect(admin.SetPlacement).not.toHaveBeenCalled();
        expect(f.componentInstance.Editing).toBeNull();
    });

    it('refuses to edit a row that is not the user’s', () => {
        admin.RowsForEntity.mockReturnValue([]);
        const f = render({ Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }] });
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.Editing).toBeNull();
    });

    // The dialog probes the form after opening, so the seed has to survive that.
    it('reseeds against whatever context the dialog ends up with', () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        const state: Pick<FormPlacementState, 'ReplaceMode' | 'ReplaceSectionKey'> = { ReplaceMode: 'none', ReplaceSectionKey: '' };
        const dialog = {
            State: state as FormPlacementState,
            Context: {
                ...f.componentInstance.EditContext!,
                Sections: [{ Key: 'details', Title: 'Details' }],
            },
        };
        f.componentInstance.SeedEdit(dialog);
        expect(dialog.State.ReplaceMode).toBe('section');
        expect(dialog.State.ReplaceSectionKey).toBe('details');
    });
});

/**
 * The dialog writes only placement and `configuration.fields`. Every other configuration key
 * belongs to the component and must survive an edit.
 */
describe('MjPanelManagerComponent (DOM) — an edit keeps the row\'s configuration', () => {
    const fieldRow = () => row({
        ReplacesSectionKey: null, ReplacesFieldNames: ['A'], Configuration: '{"fields":["A"],"palette":"warm"}',
    });

    /** What the real dialog would send for `state`, from the proposal the drawer opened it on. */
    async function applyEdit(f: ReturnType<typeof render>, change: Partial<FormPlacementState>): Promise<void> {
        const proposal = f.componentInstance.EditProposal!;
        const context = f.componentInstance.EditContext!;
        const state = { ...PlacementStateFromContribution(proposal, context, true), ...change };
        await f.componentInstance.OnEditApplied(ResolvePlacementDecision(state, context, proposal));
    }

    it('opens the dialog on the row\'s configuration', () => {
        admin.RowsForEntity.mockReturnValue([fieldRow()]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.EditProposal?.configuration).toEqual({ fields: ['A'], palette: 'warm' });
    });

    it.each([[null], [''], ['[1,2]'], ['not json']])('opens with no configuration when the row holds %j', (Configuration) => {
        admin.RowsForEntity.mockReturnValue([row({ Configuration })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.EditProposal).not.toHaveProperty('configuration');
    });

    it('saves the new field list with the other keys when the claim moves to other fields', async () => {
        admin.RowsForEntity.mockReturnValue([fieldRow()]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await applyEdit(f, { ReplaceMode: 'field', ReplaceFieldNames: ['B'] });
        const saved = admin.SetPlacement.mock.calls[0] as unknown as [string, { replacesFieldNames?: string[]; configuration?: unknown }];
        expect(saved[1].replacesFieldNames).toEqual(['B']);
        expect(saved[1].configuration).toEqual({ fields: ['B'], palette: 'warm' });
    });

    it('keeps the whole configuration when the panel moves to a section claim', async () => {
        admin.RowsForEntity.mockReturnValue([fieldRow()]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await applyEdit(f, { ReplaceMode: 'section', ReplaceSectionKey: 'details' });
        const saved = admin.SetPlacement.mock.calls[0] as unknown as [string, { replacesSectionKey?: string; configuration?: unknown }];
        expect(saved[1].replacesSectionKey).toBe('details');
        expect(saved[1].configuration).toEqual({ fields: ['A'], palette: 'warm' });
    });
});

/**
 * Grouped by who an item belongs to, because that decides what the user may do with it; the
 * state is a label on each row rather than a heading.
 */
describe('MjPanelManagerComponent (DOM) — the list under headings', () => {
    it('heads the user\'s own panels as Yours, whatever their state', () => {
        admin.RowsForEntity.mockReturnValue([row(), row({ ID: 'ROW-2', Status: 'Pending' })]);
        const f = render();
        expect(f.componentInstance.Groups.map((g) => g.Title)).toEqual(['Yours']);
        expect(text(f)).toContain('draft');
    });

    it('draws the headings', () => {
        expect(text(render())).toContain('Yours');
    });

    it('is titled for what it now manages', () => {
        expect(text(render())).toContain('Manage this form');
    });
});

/** A published panel reaches the user as a default they may hide, not one they may change. */
describe('MjPanelManagerComponent (DOM) — something shared with you', () => {
    const shared = () => row({ ID: 'ROW-G', Scope: 'Global', UserID: null, ContributionKey: 'panel:Health', Title: 'Health' });

    it('offers hiding it, and nothing that would change it for others', () => {
        admin.RowsForEntity.mockReturnValue([shared()]);
        expect(buttons(render())).toEqual(['Hide for me']);
    });

    it('hides it for this user and tells the form to resolve again', () => {
        admin.RowsForEntity.mockReturnValue([shared()]);
        const f = render();
        const changed = vi.fn();
        f.componentInstance.Changed.subscribe(changed);
        f.componentInstance.OnHide(f.componentInstance.Items[0]);
        expect(admin.Hide).toHaveBeenCalledWith(ENTITY.Name, 'panel:Health');
        expect(changed).toHaveBeenCalled();
    });

    it('gives a holder Audience and a Remove that says it is for everyone', async () => {
        admin.RowsForEntity.mockReturnValue([shared()]);
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        expect(buttons(f)).toContain('Audience…');
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        f.detectChanges();
        expect(buttons(f)).toContain('Remove for everyone?');
    });

    it('does not list another person\'s personal panel', () => {
        admin.RowsForEntity.mockReturnValue([row(), row({ ID: 'THEIRS', UserID: 'user-other' })]);
        expect(render().componentInstance.Items.map((i) => i.ID)).toEqual(['ROW-1']);
    });
});

/** Publishing changes what other people see, so it is a holder's act and states its effect first. */
describe('MjPanelManagerComponent (DOM) — publishing', () => {
    it('shows no Publish control to a user without the grant', () => {
        expect(buttons(render())).not.toContain('Publish…');
    });

    it('offers Publish on the user\'s own panel to a holder', () => {
        admin.CanPublish.mockReturnValue(true);
        expect(buttons(render())).toContain('Publish…');
    });

    it('states who will see it before anything is saved', () => {
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.componentInstance.Publishing!.Scope = 'Role';
        f.componentInstance.Publishing!.RoleID = 'role-sales';
        expect(f.componentInstance.AudienceConsequence).toBe(
            `Everyone in Sales will see this panel on every ${ENTITY.Name} record.`);
        expect(admin.PublishContribution).not.toHaveBeenCalled();
    });

    it('will not save a role audience with no role chosen', () => {
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.componentInstance.Publishing!.Scope = 'Role';
        expect(f.componentInstance.CanConfirmAudience).toBe(false);
    });

    it('publishes through the service with the chosen audience', async () => {
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.componentInstance.Publishing!.Scope = 'Global';
        await f.componentInstance.ConfirmAudience();
        expect(admin.PublishContribution).toHaveBeenCalledWith('ROW-1', { Scope: 'Global', RoleID: null }, PROVIDER);
        expect(f.componentInstance.Publishing).toBeNull();
    });
});

/** Choosing a full custom form happens here as well as in the toolbar picker, from the same list. */
describe('MjPanelManagerComponent (DOM) — the Form group', () => {
    const forms: FormOverrideRow[] = [
        { ID: 'ops', Name: 'Ops Form', Status: 'Active', Scope: 'Global', UserID: null, RoleID: null, Role: null },
    ];

    it('is absent when there is no custom form to choose', () => {
        expect(text(render())).not.toContain('Which form you see');
    });

    it('lists the custom forms and the generated form, and switches between them', () => {
        admin.OverridesForEntity.mockReturnValue(forms);
        const f = render({ Variants: [{ ID: 'ops', Label: 'Ops Form' }], CurrentFormID: 'ops' });
        expect(text(f)).toContain('Ops Form');
        expect(text(f)).toContain('Generated form');
        const chosen = vi.fn();
        f.componentInstance.FormChosen.subscribe(chosen);
        f.componentInstance.OnUseForm(f.componentInstance.Forms.find((i) => i.ID === null)!);
        expect(chosen).toHaveBeenCalledWith(null);
    });

    it('switches form from the radio itself, with no separate button', () => {
        admin.OverridesForEntity.mockReturnValue(forms);
        const f = render({ Variants: [{ ID: 'ops', Label: 'Ops Form' }], CurrentFormID: 'ops' });
        const chosen = vi.fn();
        f.componentInstance.FormChosen.subscribe(chosen);
        const radios = (f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[name="mj-pm-form"]');
        expect(Array.from(radios).map((r) => r.checked)).toEqual([true, false]);
        radios[1].click();
        expect(chosen).toHaveBeenCalledWith(null);
        expect(text(f)).not.toContain('Use this');
    });

    it('does nothing when the current form is chosen again', () => {
        admin.OverridesForEntity.mockReturnValue(forms);
        const f = render({ Variants: [{ ID: 'ops', Label: 'Ops Form' }], CurrentFormID: 'ops' });
        const chosen = vi.fn();
        f.componentInstance.FormChosen.subscribe(chosen);
        f.componentInstance.OnUseForm(f.componentInstance.Forms.find((i) => i.ID === 'ops')!);
        expect(chosen).not.toHaveBeenCalled();
    });
});


/**
 * The placement dialog is built for a wide modal. Confined to the drawer it had no room
 * for the form preview beside the answers, so it opens over the window instead.
 */
describe('MjPanelManagerComponent (DOM) — the edit dialog’s surface', () => {
    const open = () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        f.detectChanges();
        return f;
    };

    it('renders the dialog outside the drawer’s own column', () => {
        const scrim = (open().nativeElement as HTMLElement).querySelector('.mj-pm-edit');
        expect(scrim).not.toBeNull();
        expect(scrim!.closest('.mj-pm-list')).toBeNull();
    });

    it('closes when the backdrop is clicked', () => {
        const f = open();
        const scrim = (f.nativeElement as HTMLElement).querySelector('.mj-pm-edit') as HTMLElement;
        scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(f.componentInstance.Editing).toBeNull();
    });

    it('stays open when the dialog itself is clicked', () => {
        const f = open();
        const inner = (f.nativeElement as HTMLElement).querySelector('.mj-pm-edit > *') as HTMLElement;
        inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(f.componentInstance.Editing).not.toBeNull();
    });
});

/**
 * A panel can be on and still draw nothing: a compiled panel or another row holds its key, or the
 * user's own row outranks a shared one. The list says so, and counts only what draws.
 */
describe('MjPanelManagerComponent (DOM) — what the form really draws', () => {
    it('says a row that loses its key is not shown, and still lets it be switched off', () => {
        admin.RenderingFor.mockReturnValue({ RowIDs: new Set(), CompiledKeys: new Set() });
        const f = render();
        expect(f.componentInstance.Items[0].State).toBe('outranked');
        expect(text(f)).toContain('not shown');
        expect(buttons(f)).toContain('Turn off');
        expect(f.componentInstance.Summary).toBe('1 thing registered on this form · 0 rendering');
    });

    it('says a compiled panel a row took over is not shown', () => {
        admin.RenderingFor.mockReturnValue({ RowIDs: new Set(['row-1']), CompiledKeys: new Set() });
        const f = render({ Compiled: [{ Key: 'panel:OrgMemberOverviewPanel', Title: 'Built-in overview', Slot: 'before-fields', HideKey: 'panel:OrgMemberOverviewPanel' }] });
        const compiled = f.componentInstance.Items.find((i) => i.Origin === 'compiled')!;
        expect(compiled.State).toBe('outranked');
        expect(f.componentInstance.Items.find((i) => i.ID === 'ROW-1')!.State).toBe('active');
        expect(f.componentInstance.Summary).toBe('2 things registered on this form · 1 rendering');
    });

    it('says a shared row the user\'s own row outranks is not shown', () => {
        admin.RowsForEntity.mockReturnValue([
            row(),
            row({ ID: 'ROW-G', Scope: 'Global', UserID: null, Title: 'Shared overview' }),
        ]);
        admin.RenderingFor.mockReturnValue({ RowIDs: new Set(['row-1']), CompiledKeys: new Set() });
        const f = render();
        expect(f.componentInstance.Items.find((i) => i.ID === 'ROW-G')!.StateLabel).toBe('not shown');
        expect(f.componentInstance.Items.find((i) => i.ID === 'ROW-1')!.StateLabel).toBe('on');
    });

    it('asks the service with the drawer\'s own entity and provider', () => {
        render();
        expect(admin.RenderingFor).toHaveBeenCalledWith(ENTITY, PROVIDER);
    });
});

/** The placement dialog reads the form once per entity, so a change to the form drops that reading. */
describe('MjPanelManagerComponent (DOM) — the placement dialog\'s reading of the form', () => {
    it('is dropped after a write', async () => {
        const f = render();
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(probe.Forget).toHaveBeenCalledWith(ENTITY.Name);
    });

    it('is dropped after a hide', () => {
        admin.RowsForEntity.mockReturnValue([row({ ID: 'ROW-G', Scope: 'Global', UserID: null })]);
        const f = render();
        f.componentInstance.OnHide(f.componentInstance.Items[0]);
        expect(probe.Forget).toHaveBeenCalledWith(ENTITY.Name);
    });

    it('is kept when a write fails', async () => {
        admin.SetActive.mockResolvedValue({ Success: false, Message: 'No permission.' });
        const f = render();
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(probe.Forget).not.toHaveBeenCalled();
    });
});

/** Editing a panel keeps its audience and its state unless the user changes them. */
describe('MjPanelManagerComponent (DOM) — editing keeps what the panel is', () => {
    it('states the panel\'s own audience in the dialog', () => {
        admin.CanPublish.mockReturnValue(true);
        admin.RowsForEntity.mockReturnValue([row({ Scope: 'Global', UserID: null })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.EditVisibleTo).toBe('everyone');
    });

    it('offers keeping a panel that is off, off, and seeds that answer', () => {
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Inactive' })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        f.detectChanges();
        expect(f.componentInstance.EditStatus).toBe('Inactive');
        const dialog = {
            State: { ReplaceMode: 'none' } as FormPlacementState,
            Context: f.componentInstance.EditContext!,
        };
        f.componentInstance.SeedEdit(dialog);
        expect(dialog.State.ActivateNow).toBe(false);
        expect(dialog.State.KeepOff).toBe(true);
    });

    it('writes a kept-off answer as off, not as a draft', async () => {
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Inactive' })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'P' },
            ActivateNow: false, KeepOff: true,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith('ROW-1', expect.anything(), 'Inactive', PROVIDER);
    });

    it('writes a draft answer as Pending', async () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'P' },
            ActivateNow: false,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith('ROW-1', expect.anything(), 'Pending', PROVIDER);
    });
});

/** Publishing turns the item on, so the chooser says a draft or an item that is off will go live. */
describe('MjPanelManagerComponent (DOM) — publishing something that is not on', () => {
    it('says a draft will go live for the audience', () => {
        admin.CanPublish.mockReturnValue(true);
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Pending' })]);
        const f = render();
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.componentInstance.Publishing!.Scope = 'Global';
        expect(f.componentInstance.AudienceConsequence).toBe(
            `This draft will go live for everyone, on every ${ENTITY.Name} record.`);
    });

    it('says a panel that is off will go live for the chosen role', () => {
        admin.CanPublish.mockReturnValue(true);
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Inactive' })]);
        const f = render();
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.componentInstance.Publishing!.Scope = 'Role';
        f.componentInstance.Publishing!.RoleID = 'role-sales';
        expect(f.componentInstance.AudienceConsequence).toBe(
            `This panel is off. It will go live for everyone in Sales, on every ${ENTITY.Name} record.`);
    });
});

/**
 * The drawer is a modal over the form. Escape closes it one layer at a time, and Tab cannot
 * leave it for the form behind.
 */
describe('MjPanelManagerComponent (DOM) — keyboard', () => {
    const key = (f: ReturnType<typeof render>, init: KeyboardEventInit): KeyboardEvent => {
        const target = (document.activeElement && (f.nativeElement as HTMLElement).contains(document.activeElement)
            ? document.activeElement
            : (f.nativeElement as HTMLElement).querySelector('.mj-pm-drawer')) as HTMLElement;
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    };
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const drawerStops = (f: ReturnType<typeof render>) => Array.from(
        (f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.mj-pm-drawer button:not([disabled]), .mj-pm-drawer input:not([disabled])'));

    it('closes the drawer on Escape', () => {
        const f = render();
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        key(f, { key: 'Escape' });
        expect(closed).toBe(1);
    });

    it('closes only the placement dialog when Escape is pressed inside it', () => {
        const f = render();
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        f.detectChanges();
        ((f.nativeElement as HTMLElement).querySelector('.mj-pm-edit') as HTMLElement)
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(f.componentInstance.Editing).toBeNull();
        expect(closed).toBe(0);
    });

    it('closes only the audience chooser when it is open', () => {
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        f.componentInstance.OnPublishPanel(f.componentInstance.Items[0]);
        f.detectChanges();
        key(f, { key: 'Escape' });
        expect(f.componentInstance.Publishing).toBeNull();
        expect(closed).toBe(0);
    });

    it('moves focus into the drawer when it opens', async () => {
        const f = render();
        await tick();
        expect(document.activeElement).toBe((f.nativeElement as HTMLElement).querySelector('.mj-pm-close'));
    });

    it('wraps Tab from the last stop to the first, and Shift+Tab back', async () => {
        const f = render();
        await tick();
        const stops = drawerStops(f);
        expect(stops.length).toBeGreaterThan(1);
        stops[stops.length - 1].focus();
        const forward = key(f, { key: 'Tab' });
        expect(forward.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(stops[0]);
        const back = key(f, { key: 'Tab', shiftKey: true });
        expect(back.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(stops[stops.length - 1]);
    });

    it('leaves Tab alone between two stops inside the drawer', async () => {
        const f = render();
        await tick();
        drawerStops(f)[0].focus();
        expect(key(f, { key: 'Tab' }).defaultPrevented).toBe(false);
    });

    it('moves focus into the placement dialog, past its inert form preview', async () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        f.detectChanges();
        await tick();
        expect(document.activeElement).toBe((f.nativeElement as HTMLElement).querySelector('.answer-btn'));
    });

    it('gives focus back to what opened the drawer when it closes', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const f = render();
        await tick();
        expect((f.nativeElement as HTMLElement).contains(document.activeElement)).toBe(true);
        f.componentInstance.OnClose();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it('turns Remove red while it waits for the second press', async () => {
        const f = render();
        const remove = () => Array.from((f.nativeElement as HTMLElement).querySelectorAll('.mj-pm-action'))
            .find((b) => b.textContent?.includes('emove')) as HTMLElement;
        expect(remove().classList.contains('mj-btn--danger')).toBe(false);
        await f.componentInstance.OnRemove(f.componentInstance.Items[0]);
        f.detectChanges();
        expect(remove().classList.contains('mj-btn--danger')).toBe(true);
    });
});

/**
 * A write or a hide can take away the focused button: Remove deletes its row, Hide redraws it,
 * and Publish disables it while the write runs. Focus then falls to the page, and the drawer
 * still has to answer Escape and Tab and get focus back.
 */
describe('MjPanelManagerComponent (DOM) — keyboard after the focused button goes', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const root = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;
    const drawer = (f: ReturnType<typeof render>) => root(f).querySelector('.mj-pm-drawer') as HTMLElement;
    const action = (f: ReturnType<typeof render>, label: string) =>
        Array.from(root(f).querySelectorAll<HTMLElement>('.mj-pm-action')).find((b) => b.textContent?.includes(label))!;
    const press = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    };
    const settle = async (f: ReturnType<typeof render>) => {
        f.detectChanges();
        await f.whenStable();
        await tick();
        f.detectChanges();
    };

    it('still closes on Escape after removing the focused row', async () => {
        admin.Remove.mockImplementation(async () => {
            admin.RowsForEntity.mockReturnValue([]);
            return { Success: true };
        });
        const f = render();
        await settle(f);
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        action(f, 'Remove').focus();
        action(f, 'Remove').click();
        await settle(f);
        action(f, 'remove?').click();
        await settle(f);
        expect(root(f).querySelector('.mj-pm-row')).toBeNull();
        press(document.activeElement ?? document.body, { key: 'Escape' });
        expect(closed).toBe(1);
    });

    it('puts focus back in the drawer after the focused row is redrawn, and Tab stays inside', async () => {
        const shared = row({ ID: 'ROW-G', Scope: 'Global', UserID: null, ContributionKey: 'panel:Health', Title: 'Health' });
        admin.RowsForEntity.mockReturnValue([shared]);
        admin.Hide.mockImplementation(() => {
            admin.RowsForEntity.mockReturnValue([{ ...shared, ID: 'ROW-G2' }]);
        });
        const f = render();
        await settle(f);
        action(f, 'Hide for me').focus();
        action(f, 'Hide for me').click();
        await settle(f);
        expect(drawer(f).contains(document.activeElement)).toBe(true);
        (document.activeElement as HTMLElement).blur();
        expect(document.activeElement).toBe(document.body);
        const tab = press(document.body, { key: 'Tab' });
        expect(tab.defaultPrevented).toBe(true);
        expect(drawer(f).contains(document.activeElement)).toBe(true);
    });

    it('keeps focus in the drawer while a publish runs, then gives it back to Publish', async () => {
        admin.CanPublish.mockReturnValue(true);
        let finish: (r: { Success: boolean }) => void = () => undefined;
        admin.PublishContribution.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        const f = render();
        await settle(f);
        action(f, 'Publish').focus();
        action(f, 'Publish').click();
        await settle(f);
        f.componentInstance.Publishing!.Scope = 'Global';
        const saving = f.componentInstance.ConfirmAudience();
        await settle(f);
        expect(document.activeElement).toBe(drawer(f));
        finish({ Success: true });
        await saving;
        await settle(f);
        expect(document.activeElement).toBe(action(f, 'Publish'));
    });

    it('treats a radio group as one stop, so Shift+Tab from the checked radio wraps', async () => {
        admin.CanPublish.mockReturnValue(true);
        const f = render();
        action(f, 'Publish').click();
        await settle(f);
        const radios = Array.from(root(f).querySelectorAll<HTMLInputElement>('input[name="mj-pm-audience"]'));
        const everyone = radios.find((r) => r.parentElement?.textContent?.includes('Everyone'))!;
        everyone.click();
        await settle(f);
        expect(radios.filter((r) => r.checked)).toEqual([everyone]);
        expect(everyone).not.toBe(radios[0]);
        everyone.focus();
        const back = press(everyone, { key: 'Tab', shiftKey: true });
        expect(back.defaultPrevented).toBe(true);
        expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    });

    it('leaves keys alone in an overlay outside the drawer, such as the icon picker grid', () => {
        const f = render();
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        const overlay = document.createElement('div');
        overlay.className = 'cdk-overlay-container';
        const search = document.createElement('input');
        overlay.appendChild(search);
        document.body.appendChild(overlay);
        search.focus();
        press(search, { key: 'Escape' });
        expect(closed).toBe(0);
        expect(document.activeElement).toBe(search);
        overlay.remove();
    });

    it('takes no keys while it is hidden on a tab in the background', () => {
        const f = render();
        let closed = 0;
        f.componentInstance.Closed.subscribe(() => closed++);
        (drawer(f) as HTMLElement & { checkVisibility: () => boolean }).checkVisibility = () => false;
        press(document.body, { key: 'Escape' });
        expect(closed).toBe(0);
    });
});
