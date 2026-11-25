/**
 * mj-dialog on phones (design call 8): small dialogs and every alert dialog open as a bottom
 * sheet; larger dialogs go full-screen. The component only names the mode (`PhoneMode`) and puts
 * the matching class on the container; dialog.scss applies it under the 768px breakpoint, so
 * desktop is unchanged. These specs pin which dialogs get which mode.
 */
import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJDialogComponent } from './dialog.component';

const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(MJDialogComponent, { inputs: { Visible: true, Title: 'T', ...inputs } });

describe('MJDialogComponent PhoneMode', () => {
    it.each([
        ['an alert dialog', 'sheet', { Role: 'alertdialog', Size: 'md' }],
        ['an alert dialog with an explicit width', 'sheet', { Role: 'alertdialog', Width: 640 }],
        ['a small dialog', 'sheet', { Size: 'sm' }],
        ['an auto-sized dialog', 'sheet', { Size: 'auto' }],
        ['a medium dialog', 'full', { Size: 'md' }],
        ['a large dialog', 'full', { Size: 'lg' }],
        ['an extra-large dialog', 'full', { Size: 'xl' }],
        ['a dialog with an explicit width', 'full', { Width: 800 }],
        ['a small dialog with an explicit width', 'full', { Size: 'sm', Width: 420 }],
    ])('%s is a %s on phones', (_label, mode, inputs) => {
        expect(render(inputs).componentInstance.PhoneMode).toBe(mode);
    });

    it('puts the sheet classes on the container and backdrop for a sheet', () => {
        const f = render({ Size: 'sm' });
        expect(query(f, '.mj-dialog-container')!.classList.contains('mj-dialog-container--sheet')).toBe(true);
        expect(query(f, '.mj-dialog-container')!.classList.contains('mj-dialog-container--full')).toBe(false);
        expect(query(f, '.mj-dialog-backdrop')!.classList.contains('mj-dialog-backdrop--sheet')).toBe(true);
    });

    it('puts the full-screen class on the container for a large dialog', () => {
        const f = render({ Size: 'lg' });
        expect(query(f, '.mj-dialog-container')!.classList.contains('mj-dialog-container--full')).toBe(true);
        expect(query(f, '.mj-dialog-backdrop')!.classList.contains('mj-dialog-backdrop--sheet')).toBe(false);
    });
});
