import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { ConfirmDialogComponent } from './confirm-dialog.component';

/**
 * DOM coverage for ConfirmDialogComponent. Template highlights:
 *   - @if (IsOpen) gates the .dialog-backdrop element
 *   - .dialog-panel always renders; [class.open]="IsOpen" toggles the open class
 *   - {{ Title }}, {{ Message }} bindings; @if (DetailMessage) gates the detail line
 *   - confirm button: [class.btn-primary] / [class.btn-danger] keyed off ConfirmStyle
 *   - (click) handlers emit Confirmed / Cancelled
 */
describe('ConfirmDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(ConfirmDialogComponent, {
      imports: [CommonModule],
      declarations: [ConfirmDialogComponent],
      inputs,
    });

  it('hides the backdrop and leaves the panel un-opened when closed', () => {
    const fixture = render({ IsOpen: false });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
    expect(hasClass(fixture, '.dialog-panel', 'open')).toBe(false);
  });

  it('shows the backdrop and opens the panel when open', () => {
    const fixture = render({ IsOpen: true });
    expect(query(fixture, '.dialog-backdrop')).not.toBeNull();
    expect(hasClass(fixture, '.dialog-panel', 'open')).toBe(true);
  });

  it('renders the title and message text', () => {
    const fixture = render({ IsOpen: true, Title: 'Delete View', Message: 'Sure?' });
    expect(text(fixture, '.header-title span')).toBe('Delete View');
    expect(text(fixture, '.message')).toBe('Sure?');
  });

  it('omits the detail message when blank', () => {
    const without = render({ IsOpen: true });
    expect(query(without, '.detail-message')).toBeNull();
  });

  it('shows the detail message when provided', () => {
    const withDetail = render({ IsOpen: true, DetailMessage: 'Cannot be undone.' });
    expect(text(withDetail, '.detail-message')).toBe('Cannot be undone.');
  });

  it('renders the confirm button text and danger styling', () => {
    const fixture = render({ IsOpen: true, ConfirmText: 'Delete', ConfirmStyle: 'danger' });
    expect(text(fixture, '.btn-confirm')).toBe('Delete');
    expect(hasClass(fixture, '.btn-confirm', 'btn-danger')).toBe(true);
    expect(hasClass(fixture, '.btn-confirm', 'btn-primary')).toBe(false);
  });

  it('uses primary styling for the default confirm style', () => {
    const fixture = render({ IsOpen: true });
    expect(hasClass(fixture, '.btn-confirm', 'btn-primary')).toBe(true);
    expect(hasClass(fixture, '.btn-confirm', 'btn-danger')).toBe(false);
  });

  it('emits Confirmed when the confirm button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const confirmed = capture(fixture.componentInstance.Confirmed);
    click(fixture, '.btn-confirm');
    expect(confirmed.length).toBe(1);
  });

  it('emits Cancelled when the cancel button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const cancelled = capture(fixture.componentInstance.Cancelled);
    click(fixture, '.btn-cancel');
    expect(cancelled.length).toBe(1);
  });

  it('emits Cancelled when the backdrop is clicked', () => {
    const fixture = render({ IsOpen: true });
    const cancelled = capture(fixture.componentInstance.Cancelled);
    click(fixture, '.dialog-backdrop');
    expect(cancelled.length).toBe(1);
  });
});
