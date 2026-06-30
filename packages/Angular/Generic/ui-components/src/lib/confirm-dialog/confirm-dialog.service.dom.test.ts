import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJConfirmService } from './confirm-dialog.service';

/**
 * DOM-level spec for `MJConfirmService`. The service dynamically mounts an
 * `<mj-confirm-dialog>` to `document.body`, so assertions query the real body
 * (not a fixture). Covers: mounting + input wiring, the Promise<boolean>
 * confirm/cancel resolution, unmount on settle, and the ConfirmDelete preset.
 */
describe('MJConfirmService (DOM)', () => {
  const svc = () => TestBed.inject(MJConfirmService);
  const actionButtons = () =>
    Array.from(document.body.querySelectorAll('.mj-dialog-actions button')) as HTMLButtonElement[];
  const confirmButton = () => actionButtons()[0];
  const cancelButton = () => actionButtons()[1];

  afterEach(() => {
    // Defensively clear any dialog a failing test left mounted on the body.
    document.body.querySelectorAll('.mj-dialog-backdrop').forEach((el) => el.remove());
  });

  it('mounts a confirm dialog with the given message + detail', () => {
    const p = svc().Confirm({ message: 'Proceed?', detail: 'You can undo this later.' });
    expect(document.body.querySelector('.mj-confirm__message')?.textContent?.trim()).toBe('Proceed?');
    expect(document.body.querySelector('.mj-confirm__detail')?.textContent?.trim()).toBe('You can undo this later.');
    cancelButton().click(); // settle so the dialog unmounts
    return p;
  });

  it('resolves true and unmounts when confirm is clicked', async () => {
    const p = svc().Confirm('Proceed?');
    confirmButton().click();
    await expect(p).resolves.toBe(true);
    expect(document.body.querySelector('.mj-confirm')).toBeNull();
  });

  it('resolves false and unmounts when cancel is clicked', async () => {
    const p = svc().Confirm('Proceed?');
    cancelButton().click();
    await expect(p).resolves.toBe(false);
    expect(document.body.querySelector('.mj-confirm')).toBeNull();
  });

  it('accepts a bare string as the message', () => {
    const p = svc().Confirm('Just a string');
    expect(document.body.querySelector('.mj-confirm__message')?.textContent?.trim()).toBe('Just a string');
    cancelButton().click();
    return p;
  });

  it('ConfirmDelete applies danger styling + a Delete label by default', () => {
    const p = svc().ConfirmDelete({ message: 'Delete it?' });
    const btn = confirmButton();
    expect(btn.classList.contains('mj-btn--danger')).toBe(true);
    expect(btn.textContent?.trim()).toContain('Delete');
    btn.click();
    return p;
  });

  it('ConfirmDelete still honors an explicit confirmText override', () => {
    const p = svc().ConfirmDelete({ message: 'Remove?', confirmText: 'Remove' });
    expect(confirmButton().textContent?.trim()).toContain('Remove');
    cancelButton().click();
    return p;
  });
});
