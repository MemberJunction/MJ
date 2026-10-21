import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Metadata, type UserInfo } from '@memberjunction/core';
import { query } from '@memberjunction/ng-test-utils';
import { TemplateUserBannerComponent } from './template-user-banner.component';

/**
 * DOM coverage for <mj-template-user-banner>: shown only while the signed-in user is a template user
 * (`IsTemplate`), so nobody configures a template by accident. The current user comes from the
 * provider; a stub provider supplies it.
 */
function render(user: Partial<UserInfo> | null): ComponentFixture<TemplateUserBannerComponent> {
  vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ CurrentUser: user } as unknown as typeof Metadata.Provider);
  TestBed.configureTestingModule({ imports: [TemplateUserBannerComponent] });
  const fixture = TestBed.createComponent(TemplateUserBannerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('TemplateUserBannerComponent (DOM)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the banner, naming the account, while a template user is signed in', () => {
    const banner = query(render({ Email: 'demo.user@example.org', IsTemplate: true }), '.template-user-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Template user.');
    expect(banner?.textContent).toContain('demo.user@example.org');
    expect(banner?.getAttribute('role')).toBe('alert');
  });

  it('hides the banner for an ordinary user', () => {
    expect(query(render({ Email: 'jane@example.com', IsTemplate: false }), '.template-user-banner')).toBeNull();
  });

  it('hides the banner before anyone is signed in', () => {
    expect(query(render(null), '.template-user-banner')).toBeNull();
  });
});
