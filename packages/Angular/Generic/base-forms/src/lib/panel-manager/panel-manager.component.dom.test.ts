import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MjPanelManagerComponent } from './panel-manager.component';
import { FormPanelAdminService } from './form-panel-admin.service';
import type { FormPanelContributionRow } from './form-panel-inventory';

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
        ReplacesSectionKey: 'details',
        RelatedEntity: null,
        ChromeGroup: null,
        ContributionKey: 'panel:OrgMemberOverviewPanel',
        ...over,
    };
}

const admin = {
    RowsForEntity: vi.fn<[], FormPanelContributionRow[]>(() => [row()]),
    SetActive: vi.fn(async () => ({ Success: true })),
    Remove: vi.fn(async () => ({ Success: true })),
    SetPlacement: vi.fn(async () => ({ Success: true })),
};

beforeEach(() => {
    admin.RowsForEntity.mockReset().mockReturnValue([row()]);
    admin.SetActive.mockReset().mockResolvedValue({ Success: true });
    admin.Remove.mockReset().mockResolvedValue({ Success: true });
    admin.SetPlacement.mockReset().mockResolvedValue({ Success: true });
});

/** The placement dialog is covered by its own spec; here it only has to exist. */
@Component({ standalone: true, selector: 'mj-form-placement-dialog', template: '<div class="dialog-stub"></div>' })
class PlacementDialogStub {
    @Input() Context: unknown;
    @Input() Proposal: unknown;
    @Input() ComponentName = '';
    @Input() SeedState: unknown;
    @Input() ProbeForm = true;
    @Output() Applied = new EventEmitter<unknown>();
    @Output() Cancelled = new EventEmitter<void>();
}

function render(inputs: Record<string, unknown> = {}) {
    const f = renderComponentFixture(MjPanelManagerComponent, {
        imports: [PlacementDialogStub],
        declarations: [MjPanelManagerComponent],
        providers: [{ provide: FormPanelAdminService, useValue: admin }],
        inputs: { Visible: true, Entity: ENTITY, TitleByKey: new Map([['details', 'Details']]), ...inputs },
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
        expect(body).toContain('Only me');
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
        expect(admin.SetActive).toHaveBeenCalledWith('ROW-1', false, null);
        expect(changed).toHaveBeenCalled();
    });

    it('turns a draft on rather than off', async () => {
        admin.RowsForEntity.mockReturnValue([row({ Status: 'Pending' })]);
        const f = render();
        await f.componentInstance.OnToggle(f.componentInstance.Items[0]);
        expect(admin.SetActive).toHaveBeenCalledWith('ROW-1', true, null);
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
        expect(admin.Remove).toHaveBeenCalledWith('ROW-1', null);
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
        admin.RowsForEntity.mockReturnValue([row(), row({ ID: 'ROW-2', Name: 'Other' })]);
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        expect(f.componentInstance.EditContext?.Existing.map((e) => e.Key)).toEqual(['ROW-2']);
    });

    it('writes the new placement and closes', async () => {
        const f = render();
        f.componentInstance.OnEdit(f.componentInstance.Items[0]);
        await f.componentInstance.OnEditApplied({
            Contribution: { slot: 'after-fields', presentation: 'panel', title: 'Renamed' },
            ActivateNow: true,
        });
        expect(admin.SetPlacement).toHaveBeenCalledWith(
            'ROW-1', { slot: 'after-fields', presentation: 'panel', title: 'Renamed' }, true, null);
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
            State: { ReplaceMode: 'none' } as never,
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

describe('MjPanelManagerComponent (DOM) — the list under headings', () => {
    it('heads the rows by what they are doing', () => {
        admin.RowsForEntity.mockReturnValue([row(), row({ ID: 'ROW-2', Status: 'Pending' })]);
        const f = render();
        expect(f.componentInstance.Groups.map((g) => g.Title)).toEqual(['On this form', 'Drafts']);
    });

    it('draws the headings', () => {
        expect(text(render())).toContain('On this form');
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
