import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { AppAccessDialogComponent, AppAccessDialogConfig } from './app-access-dialog.component';

/**
 * DOM coverage for <mj-app-access-dialog> — the app-access error/prompt dialog. Purely
 * presentational (only ChangeDetectorRef): the whole thing is gated on `visible`, and the title /
 * message / actions are derived from the config passed to show(). We drive it via show() in `setup`
 * (before the single render) using the `not_installed` type, which does NOT start the auto-dismiss
 * countdown timer — keeping the test free of setInterval. CommonModule supplies `ngClass`.
 */

const render = (config?: AppAccessDialogConfig) =>
  renderComponentFixture(AppAccessDialogComponent, {
    imports: [CommonModule],
    declarations: [AppAccessDialogComponent],
    setup: (i) => {
      if (config) i.show(config);
    },
    autoDetect: true,
  });

describe('AppAccessDialogComponent (DOM)', () => {
  it('renders nothing while hidden (no show called)', () => {
    expect(query(render(), '.dialog-overlay')).toBeNull();
  });

  it('renders the dialog with the type-appropriate title and message when shown', () => {
    const fixture = render({ type: 'not_installed', appName: 'Sales', appId: 'a1' });
    expect(query(fixture, '.dialog-overlay')).not.toBeNull();
    expect(text(fixture, '.dialog-title')).toBe('Add Application?');
    expect(text(fixture, '.dialog-message')).toContain('Sales');
  });

  it('shows the primary "Add" action for an installable app', () => {
    const fixture = render({ type: 'not_installed', appName: 'Sales', appId: 'a1' });
    const primary = query(fixture, '.dialog-btn.primary') as HTMLElement;
    expect(primary).not.toBeNull();
    expect(primary.textContent).toContain('Add');
  });

  it('emits result {action: install} when the primary action is clicked', () => {
    const fixture = render({ type: 'not_installed', appName: 'Sales', appId: 'a1' });
    const results = capture(fixture.componentInstance.result);
    (query(fixture, '.dialog-btn.primary') as HTMLElement).click();
    expect(results).toEqual([{ action: 'install', appId: 'a1' }]);
  });

  it('emits a redirect result and hides when the dismiss button is clicked', () => {
    const fixture = render({ type: 'not_installed', appName: 'Sales', appId: 'a1' });
    const results = capture(fixture.componentInstance.result);
    const visibleChanges = capture(fixture.componentInstance.visibleChange);
    // The dismiss button is the non-primary .dialog-btn.
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.dialog-btn')) as HTMLElement[];
    (buttons.find((b) => !b.classList.contains('primary')) as HTMLElement).click();
    expect(results).toEqual([{ action: 'redirect' }]);
    expect(visibleChanges).toContain(false);
  });
});
