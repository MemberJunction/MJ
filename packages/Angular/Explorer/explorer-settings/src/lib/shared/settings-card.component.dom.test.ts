import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query, text, attr, hasClass, capture } from '@memberjunction/ng-test-utils';
import { SettingsCardComponent } from './settings-card.component';

/**
 * DOM coverage for <mj-settings-card> — a pure presentational collapsible card (title + icon header,
 * an expand button, and `@if (expanded)` content with `<ng-content>`). No services, no async: a
 * single synchronous render. Most cases use renderComponentFixture with inputs; the projection case
 * uses renderTemplate so a projected child is present.
 */

const render = (inputs: Record<string, unknown>) => renderComponentFixture(SettingsCardComponent, { declarations: [SettingsCardComponent], inputs });

describe('SettingsCardComponent (DOM)', () => {
  it('renders the title and icon in the header', () => {
    const fixture = render({ title: 'Appearance', icon: 'fa-solid fa-palette' });
    expect(text(fixture, '.card-title')).toBe('Appearance');
    expect(query(fixture, '.card-icon i')?.getAttribute('class')).toContain('fa-palette');
  });

  it('hides the content region when collapsed', () => {
    expect(query(render({ title: 'X', expanded: false }), '.card-content')).toBeNull();
  });

  it('shows the content region when expanded', () => {
    expect(query(render({ title: 'X', expanded: true }), '.card-content')).not.toBeNull();
  });

  it('reflects the expanded state on the card class and expand-button aria-expanded when expanded', () => {
    const fixture = render({ title: 'X', expanded: true });
    expect(hasClass(fixture, '.settings-card', 'expanded')).toBe(true);
    expect(attr(fixture, '.expand-button', 'aria-expanded')).toBe('true');
  });

  it('sets expand-button aria-expanded false when collapsed', () => {
    expect(attr(render({ title: 'X', expanded: false }), '.expand-button', 'aria-expanded')).toBe('false');
  });

  it('emits toggle when the header is clicked', () => {
    const fixture = render({ title: 'X' });
    const toggles = capture(fixture.componentInstance.toggle);
    (query(fixture, '.card-header') as HTMLElement).click();
    expect(toggles.length).toBe(1);
  });

  it('projects content into the expanded region', async () => {
    const fixture = await renderTemplate(
      '<mj-settings-card title="X" [expanded]="true"><p class="projected">hello</p></mj-settings-card>',
      { declarations: [SettingsCardComponent] },
    );
    expect(query(fixture, '.card-content .projected')?.textContent).toBe('hello');
  });
});
