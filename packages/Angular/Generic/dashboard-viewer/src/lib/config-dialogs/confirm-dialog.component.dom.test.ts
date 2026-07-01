import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, hasClass, attr, capture } from '@memberjunction/ng-test-utils';
import { ConfirmDialogComponent } from './confirm-dialog.component';

/**
 * DOM-level spec for <mj-confirm-dialog> — a module-declared (standalone:false) leaf.
 * Verifies @if (visible) gating, title/message/button-text bindings, type-driven icon +
 * conditional classes, and the confirm/cancel @Output wiring (including overlay-click cancel).
 */
describe('ConfirmDialogComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<ConfirmDialogComponent> {
    return renderComponentFixture(ConfirmDialogComponent, {
      declarations: [ConfirmDialogComponent],
      inputs: { visible: true, ...inputs },
    });
  }

  it('renders nothing when visible is false', () => {
    const f = renderComponentFixture(ConfirmDialogComponent, {
      declarations: [ConfirmDialogComponent],
      inputs: { visible: false },
    });
    expect(query(f, '.config-dialog-overlay')).toBeNull();
  });

  it('renders the overlay and dialog when visible is true', () => {
    const f = render();
    expect(query(f, '.config-dialog-overlay')).not.toBeNull();
    expect(query(f, '.confirm-dialog')).not.toBeNull();
  });

  it('binds title and message text', () => {
    const f = render({ title: 'Delete it?', message: 'This cannot be undone.' });
    expect(text(f, '.confirm-title')).toBe('Delete it?');
    expect(text(f, '.confirm-message')).toBe('This cannot be undone.');
  });

  it('binds confirm and cancel button text', () => {
    const f = render({ confirmText: 'Yes, delete', cancelText: 'No thanks' });
    const buttons = f.nativeElement.querySelectorAll('.dialog-footer button');
    expect((buttons[0] as HTMLButtonElement).textContent?.trim()).toBe('Yes, delete');
    expect((buttons[1] as HTMLButtonElement).textContent?.trim()).toBe('No thanks');
  });

  it('uses the warning icon and warning class by default', () => {
    const f = render({ type: 'warning' });
    expect(hasClass(f, '.confirm-icon', 'warning')).toBe(true);
    expect(attr(f, '.confirm-icon i', 'class')).toContain('fa-exclamation-triangle');
  });

  it('uses the danger icon, danger class, and danger button when type is danger', () => {
    const f = render({ type: 'danger' });
    expect(hasClass(f, '.confirm-icon', 'danger')).toBe(true);
    expect(attr(f, '.confirm-icon i', 'class')).toContain('fa-trash');
    expect(query(f, '.dialog-footer button.btn-danger')).not.toBeNull();
  });

  it('uses btn-primary for the confirm button when type is not danger', () => {
    const f = render({ type: 'info' });
    expect(query(f, '.dialog-footer button.btn-primary')).not.toBeNull();
    expect(attr(f, '.confirm-icon i', 'class')).toContain('fa-info-circle');
  });

  it('prefers an explicit icon over the type default', () => {
    const f = render({ type: 'danger', icon: 'fa-solid fa-star' });
    expect(attr(f, '.confirm-icon i', 'class')).toContain('fa-star');
  });

  it('emits confirmed when the confirm button is clicked', () => {
    const f = render({ type: 'info' });
    const confirmed = capture(f.componentInstance.confirmed);
    (f.nativeElement.querySelector('.dialog-footer button.btn-primary') as HTMLButtonElement).click();
    expect(confirmed).toHaveLength(1);
  });

  it('emits cancelled when the cancel button is clicked', () => {
    const f = render();
    const cancelled = capture(f.componentInstance.cancelled);
    (f.nativeElement.querySelector('.dialog-footer button.btn-secondary') as HTMLButtonElement).click();
    expect(cancelled).toHaveLength(1);
  });

  it('emits cancelled when the overlay backdrop is clicked', () => {
    const f = render();
    const cancelled = capture(f.componentInstance.cancelled);
    (f.nativeElement.querySelector('.config-dialog-overlay') as HTMLElement).click();
    expect(cancelled).toHaveLength(1);
  });
});
