import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { MJConfirmDialogComponent } from './confirm-dialog.component';

/**
 * DOM-level spec for `<mj-confirm-dialog>`. Covers what only exists in the
 * rendered template/host: visibility gating, the message + detail text, the
 * per-type default icon (and override), the `role="alertdialog"` a11y contract,
 * the confirm button color per type, the LEFT-of-Cancel button order, the
 * confirm/cancel emit + auto-close semantics, and the Processing lockdown.
 *
 * Uses the shared `renderComponentFixture()` + dom-helpers from
 * `@memberjunction/ng-test-utils`, which bake in the zoneless-correct setup
 * order (inputs via `setInput`, then a single `detectChanges`) so specs can't
 * reintroduce the NG0100 footgun.
 */
describe('MJConfirmDialogComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<MJConfirmDialogComponent> {
    // Visible defaults to true so most specs assert on the open dialog; overridable per spec.
    return renderComponentFixture(MJConfirmDialogComponent, { inputs: { Visible: true, ...inputs } });
  }
  const confirmBtn = (f: ComponentFixture<MJConfirmDialogComponent>) =>
    queryAll(f, '.mj-dialog-actions button')[0] as HTMLButtonElement;
  const cancelBtn = (f: ComponentFixture<MJConfirmDialogComponent>) =>
    queryAll(f, '.mj-dialog-actions button')[1] as HTMLButtonElement;

  it('renders nothing in the DOM when not Visible', () => {
    const f = render({ Visible: false });
    expect(query(f, '.mj-confirm')).toBeNull();
  });

  it('renders the message and the optional detail line', () => {
    const f = render({ Message: 'Delete this?', DetailMessage: 'Cannot be undone.' });
    expect(text(f, '.mj-confirm__message')).toBe('Delete this?');
    expect(text(f, '.mj-confirm__detail')).toBe('Cannot be undone.');
  });

  it('omits the detail line when DetailMessage is empty', () => {
    expect(query(render(), '.mj-confirm__detail')).toBeNull();
  });

  it('uses role=alertdialog on the dialog container', () => {
    expect(query(render(), '.mj-dialog-container')?.getAttribute('role')).toBe('alertdialog');
  });

  it('chooses the per-type default icon and honors an override', () => {
    expect(query(render({ Type: 'danger' }), '.mj-confirm__icon')?.className).toContain('fa-triangle-exclamation');
    expect(query(render({ Type: 'info' }), '.mj-confirm__icon')?.className).toContain('fa-circle-info');
    expect(query(render(), '.mj-confirm__icon')?.className).toContain('fa-circle-question');
    expect(query(render({ Icon: 'fa-solid fa-trash' }), '.mj-confirm__icon')?.className).toContain('fa-trash');
  });

  it('suppresses the icon when Icon=""', () => {
    expect(query(render({ Icon: '' }), '.mj-confirm__icon')).toBeNull();
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
    const confirmed = capture(f.componentInstance.Confirmed);
    const visibleChanges = capture(f.componentInstance.VisibleChange);

    confirmBtn(f).click();
    f.detectChanges();

    expect(confirmed).toHaveLength(1);
    expect(visibleChanges).toHaveLength(0); // confirm does NOT auto-close
    expect(f.componentInstance.Visible).toBe(true);
  });

  it('emits Cancelled and auto-closes on cancel', () => {
    const f = render();
    const cancelled = capture(f.componentInstance.Cancelled);
    const visibleChanges = capture(f.componentInstance.VisibleChange);

    cancelBtn(f).click();
    f.detectChanges();

    expect(cancelled).toHaveLength(1);
    expect(visibleChanges).toEqual([false]);
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
    const cancelled = capture(f.componentInstance.Cancelled);

    f.componentInstance.onDismiss(); // simulates Esc / backdrop from the underlying dialog

    expect(cancelled).toHaveLength(0);
    expect(f.componentInstance.Visible).toBe(true);
  });
});
