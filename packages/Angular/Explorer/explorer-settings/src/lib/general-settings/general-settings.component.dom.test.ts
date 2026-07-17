import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { GeneralSettingsComponent } from './general-settings.component';

/**
 * DOM coverage for <mj-general-settings> — the container that wraps the Profile and Account sections
 * in two collapsible settings-cards. No services, no async: it just tracks two expansion flags and
 * projects the two child components into the cards. We stub `mj-settings-card` (projecting its
 * content + exposing title/expanded/toggle) and the two heavy child panels so this test stays about
 * the container's own structure + toggle wiring.
 */

@Component({ standalone: true, selector: 'mj-settings-card', template: '<div class="card"><ng-content></ng-content></div>' })
class SettingsCardStub {
  @Input() title = '';
  @Input() icon = '';
  @Input() expanded = false;
  @Output() toggle = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-user-profile-settings', template: '' })
class UserProfileStub {}

@Component({ standalone: true, selector: 'mj-account-info', template: '' })
class AccountInfoStub {}

const render = () =>
  renderComponentFixture(GeneralSettingsComponent, {
    imports: [SettingsCardStub, UserProfileStub, AccountInfoStub],
    declarations: [GeneralSettingsComponent],
  });

describe('GeneralSettingsComponent (DOM)', () => {
  it('renders the section heading and description', () => {
    const fixture = render();
    expect(text(fixture, '.section-title')).toBe('General Settings');
    expect(query(fixture, '.section-description')).not.toBeNull();
  });

  it('renders a settings card for both Profile and Account sections', () => {
    const cards = queryAll(render(), 'mj-settings-card');
    expect(cards.length).toBe(2);
  });

  it('projects the profile and account child panels into the cards', () => {
    const fixture = render();
    expect(query(fixture, 'mj-user-profile-settings')).not.toBeNull();
    expect(query(fixture, 'mj-account-info')).not.toBeNull();
  });

  it('starts with both sections expanded', () => {
    const c = render().componentInstance;
    expect(c.ProfileExpanded).toBe(true);
    expect(c.AccountExpanded).toBe(true);
  });

  it('toggles the profile section expansion state', () => {
    const c = render().componentInstance;
    c.ToggleProfile();
    expect(c.ProfileExpanded).toBe(false);
  });
});
