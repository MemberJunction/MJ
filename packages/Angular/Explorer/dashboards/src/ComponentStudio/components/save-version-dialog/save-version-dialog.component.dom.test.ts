import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { SaveVersionDialogComponent } from './save-version-dialog.component';

/**
 * DOM coverage for <mj-save-version-dialog> — a Visible-gated dialog: version badge (first vs
 * current), a comment field, save-mode radios (only when a current version exists), and Save/Cancel
 * emissions. FormsModule for ngModel; real mj-dialog/mjButton. Single synchronous render.
 */

const render = (Visible = true, CurrentVersion = 0) =>
  renderComponentFixture(SaveVersionDialogComponent, {
    imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
    declarations: [SaveVersionDialogComponent],
    inputs: { Visible, CurrentVersion },
  });

const btn = (f: ReturnType<typeof render>, label: string) => queryAll(f, 'button').find((b) => b.textContent?.trim().includes(label)) as HTMLElement;

describe('SaveVersionDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render(false), 'mj-dialog')).toBeNull();
  });

  it('renders the Save Version dialog with a comment field', () => {
    const fixture = render(true);
    expect(query(fixture, 'mj-dialog')).not.toBeNull();
    expect(query(fixture, '#versionComment')).not.toBeNull();
  });

  it('shows the first-version badge and no save-mode radios when there is no current version', () => {
    const fixture = render(true, 0);
    expect(text(fixture, '.version-badge')).toContain('First version');
    expect(queryAll(fixture, '.radio-option').length).toBe(0);
  });

  it('shows the current-version badge and both save-mode radios when a version exists', () => {
    const fixture = render(true, 3);
    expect(text(fixture, '.version-badge')).toContain('Current: v3');
    expect(queryAll(fixture, '.radio-option').length).toBe(2);
  });

  it('emits Cancel when the Cancel button is clicked', () => {
    const fixture = render(true);
    const cancelled = capture(fixture.componentInstance.Cancel);
    btn(fixture, 'Cancel').click();
    expect(cancelled.length).toBe(1);
  });

  it('emits Save carrying the entered comment when Save is clicked', () => {
    const fixture = render(true);
    const saved = capture(fixture.componentInstance.Save);
    fixture.componentInstance.Comment = 'Fixed layout';
    btn(fixture, 'Save').click();
    expect(saved.length).toBe(1);
    expect((saved[0] as { Comment: string }).Comment).toBe('Fixed layout');
  });
});
