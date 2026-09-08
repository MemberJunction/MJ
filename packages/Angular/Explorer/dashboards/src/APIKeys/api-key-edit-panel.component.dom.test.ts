import { describe, it, expect } from 'vitest';

import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { APIKeyEditPanelComponent } from './api-key-edit-panel.component';

/**
 * DOM coverage for <mj-api-key-edit-panel> — a slide-out (standalone:false) key detail panel.
 * Its data load runs ONLY in ngOnChanges when a KeyId arrives; with no KeyId the panel renders just
 * its chrome (header + close button + backdrop) and stays in the IsLoading state, so NO RunView /
 * Load / singleton path is exercised. Tests drive the Visible @Input (open class + backdrop) and the
 * close() handler (VisibleChange(false) + Closed outputs). mj-loading is a light stub. The component
 * is synchronous here (no async init without a KeyId), so a single default render is NG0100-safe.
 */

const render = (Visible: boolean) =>
  renderComponentFixture(APIKeyEditPanelComponent, {
    imports: [CommonModule, StubLoadingComponent],
    declarations: [APIKeyEditPanelComponent],
    inputs: { Visible, KeyId: null },
  });

describe('APIKeyEditPanelComponent (DOM)', () => {
  it('renders the panel header and close button', () => {
    const fixture = render(true);
    expect(query(fixture, '.slideout-panel')).not.toBeNull();
    expect(text(fixture, '.slideout-title')).toContain('API Key Details');
    expect(query(fixture, '.slideout-close')).not.toBeNull();
  });

  it('applies the open class and shows the backdrop when Visible is true', () => {
    const fixture = render(true);
    expect(hasClass(fixture, '.slideout-panel', 'open')).toBe(true);
    expect(query(fixture, '.slideout-backdrop')).not.toBeNull();
  });

  it('omits the open class and backdrop when Visible is false', () => {
    const fixture = render(false);
    expect(hasClass(fixture, '.slideout-panel', 'open')).toBe(false);
    expect(query(fixture, '.slideout-backdrop')).toBeNull();
  });

  it('emits VisibleChange(false) and Closed when the close button is clicked', () => {
    const fixture = render(true);
    const visibleChanges = capture(fixture.componentInstance.VisibleChange);
    const closed = capture(fixture.componentInstance.Closed);
    (query(fixture, '.slideout-close') as HTMLElement).click();
    expect(visibleChanges).toEqual([false]);
    expect(closed.length).toBe(1);
  });

  it('emits VisibleChange(false) when the backdrop is clicked', () => {
    const fixture = render(true);
    const visibleChanges = capture(fixture.componentInstance.VisibleChange);
    (query(fixture, '.slideout-backdrop') as HTMLElement).click();
    expect(visibleChanges).toEqual([false]);
  });
});
