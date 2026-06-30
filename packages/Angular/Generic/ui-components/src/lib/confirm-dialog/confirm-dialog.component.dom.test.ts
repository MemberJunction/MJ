import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJConfirmDialogComponent } from './confirm-dialog.component';

/**
 * DOM-level spec for `<mj-confirm-dialog>`. Covers what only exists in the
 * rendered template/host: visibility gating, the message + detail text, the
 * per-type default icon (and override), the `role="alertdialog"` a11y contract,
 * the confirm button color per type, the LEFT-of-Cancel button order, the
 * confirm/cancel emit + auto-close semantics, and the Processing lockdown.
 *
 * Zoneless note: programmatic input state is set via `setInput` before
 * `detectChanges()` so the view is marked dirty the zoneless-correct way.
 */
describe('MJConfirmDialogComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<MJConfirmDialogComponent> {
    const fixture = TestBed.createComponent(MJConfirmDialogComponent);
    fixture.componentRef.setInput('Visible', true); // default visible; overridable below
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
    return fixture;
  }
  const host = (f: ComponentFixture<MJConfirmDialogComponent>) => f.nativeElement as HTMLElement;
  const confirmBtn = (f: ComponentFixture<MJConfirmDialogComponent>) =>
    host(f).querySelectorAll('.mj-dialog-actions button')[0] as HTMLButtonElement;
  const cancelBtn = (f: ComponentFixture<MJConfirmDialogComponent>) =>
    host(f).querySelectorAll('.mj-dialog-actions button')[1] as HTMLButtonElement;

  it('renders nothing in the DOM when not Visible', () => {
    const f = render({ Visible: false });
    expect(host(f).querySelector('.mj-confirm')).toBeNull();
  });

  it('renders the message and the optional detail line', () => {
    const f = render({ Message: 'Delete this?', DetailMessage: 'Cannot be undone.' });
    expect(host(f).querySelector('.mj-confirm__message')?.textContent?.trim()).toBe('Delete this?');
    expect(host(f).querySelector('.mj-confirm__detail')?.textContent?.trim()).toBe('Cannot be undone.');
  });

  it('omits the detail line when DetailMessage is empty', () => {
    expect(host(render()).querySelector('.mj-confirm__detail')).toBeNull();
  });

  it('uses role=alertdialog on the dialog container', () => {
    expect(host(render()).querySelector('.mj-dialog-container')?.getAttribute('role')).toBe('alertdialog');
  });

  it('chooses the per-type default icon and honors an override', () => {
    expect(host(render({ Type: 'danger' })).querySelector('.mj-confirm__icon')?.className).toContain('fa-triangle-exclamation');
    expect(host(render({ Type: 'info' })).querySelector('.mj-confirm__icon')?.className).toContain('fa-circle-info');
    expect(host(render()).querySelector('.mj-confirm__icon')?.className).toContain('fa-circle-question');
    expect(host(render({ Icon: 'fa-solid fa-trash' })).querySelector('.mj-confirm__icon')?.className).toContain('fa-trash');
  });

  it('suppresses the icon when Icon=""', () => {
    expect(host(render({ Icon: '' })).querySelector('.mj-confirm__icon')).toBeNull();
  });

  it('colors the confirm button danger for Type=danger, primary otherwise', () => {
    expect(confirmBtn(render({ Type: 'danger' })).classList.contains('mj-btn--danger')).toBe(true);
    expect(confirmBtn(render({ Type: 'default' })).classList.contains('mj-btn--primary')).toBe(true);
    expect(confirmBtn(render({ Type: 'warning' })).classList.contains('mj-btn--primary')).toBe(true);
  });

  it('places the confirm button to the LEFT of cancel (MJ convention)', () => {
    const f = render({ ConfirmText: 'Delete', CancelText: 'Keep' });
    expect(confirmBtn(f).textContent?.trim()).toContain('Delete');
    expect(cancelBtn(f).textContent?.trim()).toContain('Keep');
  });

  it('emits Confirmed and stays open on confirm', () => {
    const f = render();
    let confirmed = false;
    let closed = false;
    f.componentInstance.Confirmed.subscribe(() => (confirmed = true));
    f.componentInstance.VisibleChange.subscribe(() => (closed = true));

    confirmBtn(f).click();
    f.detectChanges();

    expect(confirmed).toBe(true);
    expect(closed).toBe(false); // confirm does NOT auto-close
    expect(f.componentInstance.Visible).toBe(true);
  });

  it('emits Cancelled and auto-closes on cancel', () => {
    const f = render();
    let cancelled = false;
    let visibleChange: boolean | null = null;
    f.componentInstance.Cancelled.subscribe(() => (cancelled = true));
    f.componentInstance.VisibleChange.subscribe((v) => (visibleChange = v));

    cancelBtn(f).click();
    f.detectChanges();

    expect(cancelled).toBe(true);
    expect(visibleChange).toBe(false);
    expect(f.componentInstance.Visible).toBe(false);
  });

  it('shows a spinner and disables both buttons while Processing', () => {
    const f = render({ Processing: true });
    expect(confirmBtn(f).disabled).toBe(true);
    expect(cancelBtn(f).disabled).toBe(true);
    expect(confirmBtn(f).querySelector('.fa-spinner')).not.toBeNull();
  });

  it('blocks dismissal (does not emit Cancelled/close) while Processing', () => {
    const f = render({ Processing: true });
    let cancelled = false;
    f.componentInstance.Cancelled.subscribe(() => (cancelled = true));

    f.componentInstance.onDismiss(); // simulates Esc / backdrop from the underlying dialog

    expect(cancelled).toBe(false);
    expect(f.componentInstance.Visible).toBe(true);
  });
});
