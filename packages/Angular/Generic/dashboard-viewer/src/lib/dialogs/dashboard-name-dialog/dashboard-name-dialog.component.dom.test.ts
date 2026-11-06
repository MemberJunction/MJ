import { describe, it, expect } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { RenderComponentFixture, Capture, Click, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import { DASHBOARD_NAME_MAX_LENGTH, DashboardNameDialogComponent } from './dashboard-name-dialog.component';

/** DOM coverage for <mj-dashboard-name-dialog>, the New dashboard name prompt. mj-dialog and mjButton are real. */
describe('DashboardNameDialogComponent (DOM)', () => {
    type Fixture = ComponentFixture<DashboardNameDialogComponent>;
    const render = (inputs: Record<string, unknown> = {}): Fixture =>
        RenderComponentFixture(DashboardNameDialogComponent, { inputs: { Visible: true, ...inputs } });
    const createButton = (f: Fixture): HTMLButtonElement => Query(f, '.dn-create') as HTMLButtonElement;
    const typeName = (f: Fixture, value: string): void => { TypeInto(f, '.dn-name', value); f.detectChanges(); };
    const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

    it('renders nothing while not Visible', () => {
        expect(Query(render({ Visible: false }), '.mj-dialog-container')).toBeNull();
    });

    it('asks for the name, with Create disabled until one is typed', () => {
        const f = render();
        expect(Text(f, '.mj-dialog-title')).toBe('New dashboard');
        expect((Query(f, '.dn-name') as HTMLInputElement).value).toBe('');
        expect(createButton(f).disabled).toBe(true);
    });

    it('shows the title, button label and placeholder the host gives', () => {
        const f = render({ Title: 'Name the dashboard', ConfirmText: 'Create and pin', Placeholder: 'Q3 Pipeline' });
        expect(Text(f, '.mj-dialog-title')).toBe('Name the dashboard');
        expect(Text(f, '.dn-create')).toBe('Create and pin');
        expect(Query(f, '.dn-name')?.getAttribute('placeholder')).toBe('Q3 Pipeline');
    });

    it('puts Create before Cancel', () => {
        const f = render();
        expect(QueryAll(f, '.mj-dialog-actions button').map(b => b.textContent?.trim())).toEqual(['Create', 'Cancel']);
    });

    it('keeps Create disabled for a name of only spaces', () => {
        const f = render();
        typeName(f, '   ');
        expect(createButton(f).disabled).toBe(true);
    });

    it('emits the trimmed name on Create and stays open', () => {
        const f = render();
        const names = Capture(f.componentInstance.Confirmed);
        typeName(f, '  Q3 Pipeline  ');
        createButton(f).click();
        f.detectChanges();
        expect(names).toEqual(['Q3 Pipeline']);
        expect(Query(f, '.mj-dialog-container')).not.toBeNull();
    });

    it('emits the trimmed name on Enter', () => {
        const f = render();
        const names = Capture(f.componentInstance.Confirmed);
        typeName(f, 'Q3 Pipeline');
        Query(f, '.dn-name')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(names).toEqual(['Q3 Pipeline']);
    });

    it('emits nothing on Enter while the name is blank', () => {
        const f = render();
        const names = Capture(f.componentInstance.Confirmed);
        typeName(f, '  ');
        Query(f, '.dn-name')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(names).toEqual([]);
    });

    it('limits the name to MaxLength', () => {
        const f = render({ MaxLength: 10 });
        expect(Query(f, '.dn-name')?.getAttribute('maxlength')).toBe('10');
        typeName(f, 'x'.repeat(11));   // jsdom does not truncate a value set from code; CanCreate is the guard
        expect(createButton(f).disabled).toBe(true);
    });

    it('accepts 255 characters when the host gives no MaxLength', () => {
        const f = render();
        expect(DASHBOARD_NAME_MAX_LENGTH).toBe(255);
        expect(Query(f, '.dn-name')?.getAttribute('maxlength')).toBe('255');
        typeName(f, 'x'.repeat(255));
        expect(createButton(f).disabled).toBe(false);
    });

    it('emits Cancelled for Cancel and for Esc, and never Confirmed', () => {
        const f = render();
        const cancels = Capture(f.componentInstance.Cancelled);
        const names = Capture(f.componentInstance.Confirmed);
        Click(f, '.dn-cancel');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(cancels).toHaveLength(2);
        expect(names).toEqual([]);
    });

    it('while Processing, disables both buttons and the field, shows a spinner, and cannot be closed', async () => {
        const f = render({ Processing: true });
        const cancels = Capture(f.componentInstance.Cancelled);
        await f.whenStable();          // ngModel applies [disabled] in a microtask
        f.detectChanges();
        expect(createButton(f).disabled).toBe(true);
        expect(Query(f, '.dn-create .fa-spinner')).not.toBeNull();
        expect((Query(f, '.dn-cancel') as HTMLButtonElement).disabled).toBe(true);
        expect((Query(f, '.dn-name') as HTMLInputElement).disabled).toBe(true);
        expect(Query(f, '.mj-dialog-close')).toBeNull();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(cancels).toEqual([]);
    });

    it('starts empty each time it opens', async () => {
        const f = render();
        await f.whenStable();          // ngModel writes its first value into the input in a microtask
        typeName(f, 'Old name');
        f.componentRef.setInput('Visible', false);
        f.detectChanges();
        f.componentRef.setInput('Visible', true);
        f.detectChanges();
        await f.whenStable();          // ngModel writes the model into the input in a microtask
        f.detectChanges();
        expect((Query(f, '.dn-name') as HTMLInputElement).value).toBe('');
        expect(createButton(f).disabled).toBe(true);
    });

    it('moves focus to the name field when it opens', async () => {
        const f = render();
        await settle();
        expect(document.activeElement).toBe(Query(f, '.dn-name'));
    });
});
