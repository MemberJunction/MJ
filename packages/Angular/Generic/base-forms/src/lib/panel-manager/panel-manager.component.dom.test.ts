import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MjPanelManagerComponent } from './panel-manager.component';
import { FormPanelAdminService } from './form-panel-admin.service';
import type { FormOverrideRow, FormPanelContributionRow } from './form-panel-inventory';

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
};

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
});

/** The placement dialog is covered by its own spec; here it only has to exist. */
@Component({ standalone: true, selector: 'mj-form-placement-dialog', template: '<div class="dialog-stub"></div>' })
class PlacementDialogStub {
    @Input() Context: unknown;
    @Input() Proposal: unknown;
    @Input() ComponentName = '';
    @Input() SeedState: unknown;
    @Input() ProbeForm = true;
    @Input() RecordKey: unknown;
    @Input() ReplacesRowID: unknown;
    @Input() PanelComponentID: unknown;
    @Output() Applied = new EventEmitter<unknown>();
    @Output() Cancelled = new EventEmitter<void>();
}

function render(inputs: Record<string, unknown> = {}) {
    const f = renderComponentFixture(MjPanelManagerComponent, {
        imports: [PlacementDialogStub],
        declarations: [MjPanelManagerComponent],
        providers: [{ provide: FormPanelAdminService, useValue: admin }],
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
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('.mj-pm-btn'))
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

    it('writes the new placement and closes', async () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'Renamed' },
            ActivateNow: true,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith(
            'ROW-1', { slot: 'after-fields', presentation: 'panel', title: 'Renamed' }, true, PROVIDER);
        expect(f.componentInstance.Editing).toBeNull();
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
        const dialog = {
            State: { ReplaceMode: 'none', ReplaceSectionKey: '' } as { ReplaceMode: string; ReplaceSectionKey: string },
            Context: {
                ...f.componentInstance.EditContext!,
                Sections: [{ Key: 'details', Title: 'Details' }],
            },
        };
        f.componentInstance.SeedEdit(dialog as never);
        expect(dialog.State.ReplaceMode).toBe('section');
        expect(dialog.State.ReplaceSectionKey).toBe('details');
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
