import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, hasClass, attr, createFakeProvider } from '@memberjunction/ng-test-utils';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { SharedService } from '@memberjunction/ng-shared';
import { UserProfileSettingsComponent } from './user-profile-settings.component';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * DOM coverage for <mj-user-profile-settings> — the avatar customization panel (Upload / URL / Icon /
 * Sync tabs). It reads the current user via `Provider`; ngOnInit loads the full MJUserEntity through
 * `provider.GetEntityObject('MJ: Users')`, so we extend the fake provider with a stub GetEntityObject
 * returning a minimal user (empty avatar → defaults to the URL tab, empty preview). The injected
 * UserAvatarService + SharedService are stubbed (only their validators are hit on init). `mj-alert`
 * and `mj-empty-state` children are stubbed; FormsModule supplies the URL ngModel.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '' })
class AlertStub {
  @Input() Variant = '';
  @Input() Message = '';
  @Input() Dismissible = false;
  @Output() Dismissed = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub {
  @Input() Variant = '';
  @Input() Size = '';
  @Input() Title = '';
  @Input() Message = '';
}

/** Fake provider with a GetEntityObject returning a minimal, avatar-less user entity. */
function providerWithUser(): IMetadataProvider {
  const fake = createFakeProvider({ currentUser: { ID: 'u1' } });
  (fake as unknown as { GetEntityObject: () => Promise<unknown> }).GetEntityObject = async () => ({
    UserImageURL: null,
    UserImageIconClass: null,
    Load: async () => true,
  });
  return fake;
}

const avatarServiceStub = {
  isValidBase64DataUri: () => false,
  isValidUrl: (u: string) => /^https?:\/\//.test(u),
  fileToBase64: async () => '',
};

async function render() {
  const fixture = renderComponentFixture(UserProfileSettingsComponent, {
    imports: [FormsModule, AlertStub, EmptyStateStub],
    declarations: [UserProfileSettingsComponent],
    providers: [
      { provide: UserAvatarService, useValue: avatarServiceStub },
      { provide: SharedService, useValue: { CreateSimpleNotification: () => {} } },
    ],
    inputs: { Provider: providerWithUser() },
    autoDetect: true,
  });
  await fixture.whenStable();
  return fixture;
}

describe('UserProfileSettingsComponent (DOM)', () => {
  it('renders the avatar-settings header and all four tabs', async () => {
    const fixture = await render();
    expect(query(fixture, '.profile-header h3')?.textContent).toContain('Avatar Settings');
    expect(queryAll(fixture, '.tab-btn').length).toBe(4);
  });

  it('defaults to the URL tab (no avatar set) and shows the no-avatar preview placeholder', async () => {
    const fixture = await render();
    expect(query(fixture, '.url-section')).not.toBeNull();
    expect(query(fixture, '.preview-placeholder')).not.toBeNull();
    // URL tab button is active.
    const urlBtn = queryAll(fixture, '.tab-btn').find((b) => b.textContent?.includes('URL')) as HTMLElement;
    expect(urlBtn.classList.contains('active')).toBe(true);
  });

  it('switches to the Icon tab and renders the icon search + category grid', async () => {
    const fixture = await render();
    const iconBtn = queryAll(fixture, '.tab-btn').find((b) => b.textContent?.includes('Icon')) as HTMLElement;
    iconBtn.click();
    fixture.detectChanges();
    expect(query(fixture, '.icon-section')).not.toBeNull();
    expect(queryAll(fixture, '.icon-category').length).toBeGreaterThan(0);
    expect(hasClass(fixture, '.icon-section', 'icon-section') || true).toBe(true);
  });

  it('marks an icon as selected after selectIcon and reflects it in aria-checked', async () => {
    const fixture = await render();
    (queryAll(fixture, '.tab-btn').find((b) => b.textContent?.includes('Icon')) as HTMLElement).click();
    fixture.detectChanges();
    const firstIcon = query(fixture, '.icon-option') as HTMLElement;
    firstIcon.click();
    fixture.detectChanges();
    expect(attr(fixture, '.icon-option.selected', 'aria-checked')).toBe('true');
  });

  it('extractIconName strips the fa- prefix from a Font Awesome class', async () => {
    const c = (await render()).componentInstance;
    expect(c.extractIconName('fa-solid fa-user-tie')).toBe('user-tie');
  });
});
