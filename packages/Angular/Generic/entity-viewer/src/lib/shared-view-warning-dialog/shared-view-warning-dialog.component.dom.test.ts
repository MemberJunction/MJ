import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { SharedViewWarningDialogComponent, SharedViewAction } from './shared-view-warning-dialog.component';

/**
 * DOM coverage for SharedViewWarningDialogComponent. Template highlights:
 *   - @if (IsOpen) gates .dialog-backdrop; [class.open]="IsOpen" on .dialog-panel
 *   - {{ ViewName }} bound into the message
 *   - three footer buttons emit Action('update-shared'|'save-as-copy') / Cancel
 */
describe('SharedViewWarningDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(SharedViewWarningDialogComponent, {
      imports: [CommonModule],
      declarations: [SharedViewWarningDialogComponent],
      inputs,
    });

  it('hides the backdrop and open class when closed', () => {
    const closed = render({ IsOpen: false });
    expect(query(closed, '.dialog-backdrop')).toBeNull();
    expect(hasClass(closed, '.dialog-panel', 'open')).toBe(false);
  });

  it('shows the backdrop and open class when open', () => {
    const open = render({ IsOpen: true });
    expect(query(open, '.dialog-backdrop')).not.toBeNull();
    expect(hasClass(open, '.dialog-panel', 'open')).toBe(true);
  });

  it('renders the view name in the message', () => {
    const fixture = render({ IsOpen: true, ViewName: 'Team View' });
    expect(text(fixture, '.message')).toContain('Team View');
  });

  it('emits update-shared when the primary button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const actions: SharedViewAction[] = capture(fixture.componentInstance.Action);
    click(fixture, '.btn-primary');
    expect(actions).toEqual(['update-shared']);
  });

  it('emits save-as-copy when the secondary button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const actions: SharedViewAction[] = capture(fixture.componentInstance.Action);
    click(fixture, '.btn-secondary');
    expect(actions).toEqual(['save-as-copy']);
  });

  it('emits Cancel when the ghost button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const cancel = capture(fixture.componentInstance.Cancel);
    click(fixture, '.btn-ghost');
    expect(cancel.length).toBe(1);
  });
});
