import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, hasClass, capture } from '@memberjunction/ng-test-utils';
import { DeepDiffDialogComponent } from './deep-diff-dialog.component';
import { DeepDiffComponent } from './deep-diff.component';

/**
 * DOM-level coverage for the DeepDiffDialogComponent wrapper: the @if (visible) gating,
 * the title binding, width/height style bindings (default vs maximized), the maximize
 * toggle's icon-class swap, and the close path's visibleChange/close @Output emissions.
 *
 * DeepDiffComponent is declared too because the dialog template renders <mj-deep-diff>
 * inside its content. `autoDetect: true` because that child recomputes its diff state
 * during init when value inputs are bound.
 */

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(DeepDiffDialogComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [DeepDiffDialogComponent, DeepDiffComponent],
    inputs,
    autoDetect: true,
  });
}

describe('DeepDiffDialogComponent (DOM)', () => {
  it('renders nothing when visible is false', () => {
    const fixture = render({ visible: false });
    expect(query(fixture, '.dialog-overlay')).toBeNull();
  });

  it('renders the overlay + container when visible is true', () => {
    const fixture = render({ visible: true });
    expect(query(fixture, '.dialog-overlay')).not.toBeNull();
    expect(query(fixture, '.dialog-container')).not.toBeNull();
  });

  it('renders the title binding in the dialog header', () => {
    const fixture = render({ visible: true, title: 'Compare Records' });
    expect(text(fixture, '.dialog-title')).toContain('Compare Records');
  });

  it('applies the configured width/height styles to the container by default', () => {
    const fixture = render({ visible: true, width: '50%', height: '60vh' });
    const container = query(fixture, '.dialog-container') as HTMLElement;
    expect(container.style.width).toBe('50%');
    expect(container.style.height).toBe('60vh');
  });

  it('switches to the maximized dimensions when the maximize button is clicked', () => {
    const fixture = render({ visible: true, width: '50%', height: '60vh' });
    const maximizeBtn = query(fixture, '[aria-label="Maximize"]') as HTMLElement;
    maximizeBtn.click();
    fixture.detectChanges();
    const container = query(fixture, '.dialog-container') as HTMLElement;
    expect(container.style.width).toBe('95vw');
    expect(container.style.height).toBe('95vh');
    // The button's aria-label flips to Restore and the icon class swaps.
    expect(query(fixture, '[aria-label="Restore"]')).not.toBeNull();
    expect(hasClass(fixture, '.dialog-actions .fa-solid', 'fa-window-restore')).toBe(true);
  });

  it('emits visibleChange(false) and close when the close button is clicked', () => {
    const fixture = render({ visible: true });
    const visibleChanges = capture(fixture.componentInstance.visibleChange);
    const closes = capture(fixture.componentInstance.close);
    (query(fixture, '.close-btn') as HTMLElement).click();
    expect(visibleChanges).toEqual([false]);
    expect(closes).toEqual([undefined]);
  });

  it('emits the close outputs when the overlay backdrop is clicked', () => {
    const fixture = render({ visible: true });
    const visibleChanges = capture(fixture.componentInstance.visibleChange);
    (query(fixture, '.dialog-overlay') as HTMLElement).click();
    expect(visibleChanges).toEqual([false]);
  });

  it('forwards the title to the embedded mj-deep-diff as empty (own header suppressed)', () => {
    const fixture = render({ visible: true, oldValue: { a: 1 }, newValue: { a: 2 }, title: 'Outer' });
    // The dialog binds [title]="''" on the inner component, so the inner diff-title is blank
    // but the inner diff content still renders.
    expect(query(fixture, 'mj-deep-diff')).not.toBeNull();
    expect(text(fixture, '.diff-title')).toBe('');
  });
});
