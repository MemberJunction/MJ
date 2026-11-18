import { describe, it, expect, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MJButtonDirective, MJSwitchComponent } from '@memberjunction/ng-ui-components';
import type { MJEntityEntity } from '@memberjunction/core-entities';
import { EntityFieldSecurityPanelComponent } from './entity-field-security-panel.component';
import { MJEntityFormComponentExtended } from '../../custom/Entities/entity-form.component';

/**
 * DOM coverage for <mj-entity-field-security-panel> — the field-level security control on the
 * Entities form. Read-only status outside edit mode; a switch in edit mode; turning it on asks
 * for confirmation before the change is reported to the form.
 */

const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(EntityFieldSecurityPanelComponent, {
        imports: [FormsModule, MJButtonDirective, MJSwitchComponent],
        declarations: [EntityFieldSecurityPanelComponent],
        inputs: { Enabled: false, EditMode: false, FieldPermissionCount: null, ...inputs },
    });

/** Re-render after calling a handler directly (the component is OnPush). */
const rerender = (f: ReturnType<typeof render>) => {
    f.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges(false);
};

const buttonByText = (f: ReturnType<typeof render>, text: string) =>
    queryAll(f, 'button').find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe('EntityFieldSecurityPanelComponent (DOM)', () => {
    it('shows the status and no switch outside edit mode', () => {
        const f = render({ Enabled: true });
        expect(query(f, '.mj-fls-status')?.textContent).toContain('Field-level security is on');
        expect(query(f, 'mj-switch')).toBeNull();
    });

    it('shows the switch in edit mode', () => {
        const f = render({ EditMode: true });
        expect(query(f, '.mj-fls-status')?.textContent).toContain('Field-level security is off');
        expect(query(f, 'mj-switch')).not.toBeNull();
    });

    it('asks for confirmation before reporting that it was turned on', () => {
        const f = render({ EditMode: true });
        const out = capture(f.componentInstance.EnabledChange);

        f.componentInstance.OnSwitchChange(true);
        rerender(f);
        expect(query(f, '.mj-fls-confirm')).not.toBeNull();
        expect(out).toEqual([]);

        buttonByText(f, 'Turn on')!.click();
        expect(out).toEqual([true]);
    });

    it('reports nothing when the confirmation is cancelled, and the switch goes back off', () => {
        const f = render({ EditMode: true });
        const out = capture(f.componentInstance.EnabledChange);

        f.componentInstance.OnSwitchChange(true);
        rerender(f);
        buttonByText(f, 'Cancel')!.click();

        expect(out).toEqual([]);
        expect(f.componentInstance.SwitchValue).toBe(false);
    });

    it('reports turning it off without confirmation', () => {
        const f = render({ EditMode: true, Enabled: true });
        const out = capture(f.componentInstance.EnabledChange);
        f.componentInstance.OnSwitchChange(false);
        expect(out).toEqual([false]);
    });

    it('shows the rule count when it is on', () => {
        const f = render({ Enabled: true, FieldPermissionCount: 12 });
        expect(query(f, '.mj-fls-count')?.textContent).toContain('12 field permission rules');
    });
});

describe('MJEntityFormComponentExtended field-level security wiring', () => {
    it('sets the flag on the record and saves it through the record save', async () => {
        const form = Object.create(MJEntityFormComponentExtended.prototype) as MJEntityFormComponentExtended;
        const record = { EnableFieldLevelSecurity: false } as unknown as MJEntityEntity;
        const saveRecord = vi.fn().mockResolvedValue(true);
        Object.assign(form, { record, cdr: { markForCheck: vi.fn() }, entity: null, SaveRecord: saveRecord });

        form.OnFieldSecurityChange(true);
        expect(record.EnableFieldLevelSecurity).toBe(true);

        await form.SaveFieldSecurity();
        expect(saveRecord).toHaveBeenCalledWith(true);
        expect(form.FieldSecuritySaveError).toBe('');
    });
});
