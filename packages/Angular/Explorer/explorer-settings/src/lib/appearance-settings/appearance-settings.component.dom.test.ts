import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AppearanceSettingsComponent } from './appearance-settings.component';

/**
 * DOM coverage for <mj-appearance-settings> — a static "coming soon" placeholder: section heading,
 * a coming-soon banner, and one feature card per `PlannedFeatures` entry. No inputs/outputs/DI/async,
 * so a single synchronous render suffices.
 */
const render = () => renderComponentFixture(AppearanceSettingsComponent, { declarations: [AppearanceSettingsComponent] });

describe('AppearanceSettingsComponent (DOM)', () => {
  it('renders the section heading', () => {
    expect(text(render(), '.section-title')).toBe('Appearance');
  });

  it('renders the coming-soon banner', () => {
    const fixture = render();
    expect(query(fixture, '.coming-soon-banner')).not.toBeNull();
    expect(query(fixture, '.coming-soon-banner')?.textContent).toContain('Coming Soon');
  });

  it('renders one feature card per planned feature with its title', () => {
    const fixture = render();
    const cards = queryAll(fixture, '.feature-card');
    expect(cards.length).toBe(fixture.componentInstance.PlannedFeatures.length);
    const titles = queryAll(fixture, '.feature-title').map((e) => e.textContent?.trim());
    expect(titles).toEqual(expect.arrayContaining(['Theme', 'Font Size', 'Display Density']));
  });
});
