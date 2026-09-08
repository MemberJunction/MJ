import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { renderComponentFixture, renderTemplate, query, text, capture } from '@memberjunction/ng-test-utils';
import { MJEmptyStateComponent } from './empty-state.component';
import { MJButtonDirective } from '../button/button.directive';

/**
 * DOM coverage for <mj-empty-state> — the design system's empty/no-results/status/error placeholder
 * (used ~500× across the app; the component every other DOM spec stubs). Pure + standalone, no data.
 * Verifies the input-gated icon/title/message, the built-in CTA button (render + Action emit + icon),
 * projected content, the per-variant default icon + host modifier classes, and the a11y role logic.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJEmptyStateComponent, { imports: [MJEmptyStateComponent, MJButtonDirective], inputs });

describe('MJEmptyStateComponent (DOM)', () => {
  it('renders the title and message from inputs', () => {
    const f = render({ Title: 'Nothing here', Message: 'Add your first item to get started.' });
    expect(text(f, '.mj-empty-state__title')).toBe('Nothing here');
    expect(text(f, '.mj-empty-state__message')).toBe('Add your first item to get started.');
  });

  it('omits the message paragraph when Message is empty', () => {
    const f = render({ Title: 'Nothing here' });
    expect(query(f, '.mj-empty-state__message')).toBeNull();
  });

  it('does not render the CTA button unless ActionText is set', () => {
    const f = render({ Title: 'Empty' });
    expect(query(f, '.mj-empty-state__actions button')).toBeNull();
  });

  it('renders the CTA button (with its icon) and emits Action when clicked', () => {
    const f = render({ Title: 'Empty', ActionText: 'Try Again', ActionIcon: 'fa-solid fa-rotate-right' });
    const btn = query(f, '.mj-empty-state__actions button') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toContain('Try Again');
    expect(btn.querySelector('i.fa-solid.fa-rotate-right')).not.toBeNull();
    const actions = capture(f.componentInstance.Action);
    btn.click();
    expect(actions.length).toBe(1);
    expect(actions[0]).toBeInstanceOf(MouseEvent);
  });

  // One render per test — TestBed is single-use.
  it('renders the explicit Icon when provided', () => {
    const withIcon = render({ Icon: 'fa-solid fa-inbox' });
    expect(query(withIcon, 'i.mj-empty-state__icon.fa-inbox')).not.toBeNull();
  });

  it('suppresses the icon when Icon is ""', () => {
    const noIcon = render({ Icon: '' });
    expect(query(noIcon, 'i.mj-empty-state__icon')).toBeNull();
  });

  it('falls back to the per-variant default icon when Icon is not set', () => {
    const f = render({ Variant: 'no-results' });
    expect(query(f, 'i.mj-empty-state__icon.fa-magnifying-glass')).not.toBeNull();
  });

  it('applies the host modifier class for the variant and size', () => {
    const f = render({ Variant: 'error', Size: 'compact' });
    const host = f.nativeElement as HTMLElement;
    expect(host.classList.contains('mj-empty-state--error')).toBe(true);
    expect(host.classList.contains('mj-empty-state--compact')).toBe(true);
  });

  it('sets an assertive alert role for the error variant', () => {
    expect((render({ Variant: 'error' }).nativeElement as HTMLElement).getAttribute('role')).toBe('alert');
  });

  it('sets a polite status role for non-error variants', () => {
    expect((render({ Variant: 'empty' }).nativeElement as HTMLElement).getAttribute('role')).toBe('status');
  });

  it('honors an explicit Role', () => {
    expect((render({ Role: 'region' }).nativeElement as HTMLElement).getAttribute('role')).toBe('region');
  });

  it('removes the role entirely when Role is ""', () => {
    expect((render({ Role: '' }).nativeElement as HTMLElement).getAttribute('role')).toBeNull();
  });

  it('projects transcluded content and [actions] buttons', async () => {
    const f = await renderTemplate(
      `<mj-empty-state Title="Pins"><p class="projected">Custom body</p><button actions class="my-cta">Add pin</button></mj-empty-state>`,
      { imports: [MJEmptyStateComponent, MJButtonDirective] },
    );
    expect(text(f, '.projected')).toBe('Custom body');
    expect(query(f, 'button.my-cta')).not.toBeNull();
  });
});
