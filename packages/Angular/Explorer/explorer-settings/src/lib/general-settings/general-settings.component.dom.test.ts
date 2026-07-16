import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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

/** The two card stub instances (Profile first, Account second), resolved via DI for clean typing. */
const cardStubs = (fixture: ComponentFixture<GeneralSettingsComponent>): SettingsCardStub[] =>
  fixture.debugElement.queryAll(By.directive(SettingsCardStub)).map((de) => de.injector.get(SettingsCardStub));

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

  it('starts with both sections expanded (as seen through the [expanded] bindings)', () => {
    const [profile, account] = cardStubs(render());
    expect(profile.expanded).toBe(true);
    expect(account.expanded).toBe(true);
  });

  // Triggered through the card's (toggle) output — proves the template wiring, not just the method.
  it('collapses the profile section when its card emits toggle', () => {
    const fixture = render();
    const [profile, account] = cardStubs(fixture);
    profile.toggle.emit();
    fixture.detectChanges();
    expect(fixture.componentInstance.ProfileExpanded).toBe(false);
    expect(profile.expanded).toBe(false);
    expect(account.expanded).toBe(true); // the other card is untouched
  });

  it('collapses the account section when its card emits toggle', () => {
    const fixture = render();
    const [profile, account] = cardStubs(fixture);
    account.toggle.emit();
    fixture.detectChanges();
    expect(fixture.componentInstance.AccountExpanded).toBe(false);
    expect(account.expanded).toBe(false);
    expect(profile.expanded).toBe(true);
  });
});
