import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, createFakeProvider, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AccountInfoComponent } from './account-info.component';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * DOM coverage for <mj-account-info> — the read-only account panel. It reads the current user via the
 * `Provider`/`ProviderToUse` seam (BaseAngularComponent). ngOnInit loads the full MJUserEntity through
 * `provider.GetEntityObject('MJ: Users')` + entity.Load(); we extend the fake provider with a stub
 * GetEntityObject returning a canned user so the happy path renders. A second provider whose Load()
 * fails exercises the error branch. `mj-loading` is a lightweight stub. The load is async, so we
 * render with autoDetect + flush microtasks past whenStable before asserting.
 */

function providerWithUser(loadOk: boolean): IMetadataProvider {
  const fake = createFakeProvider({ currentUser: { ID: 'u1' } });
  (fake as unknown as { GetEntityObject: () => Promise<unknown> }).GetEntityObject = async () => ({
    Name: 'Ada Lovelace',
    Email: 'ada@example.com',
    Type: 'User',
    IsActive: true,
    __mj_CreatedAt: new Date('2026-01-15T00:00:00Z'),
    Load: async () => loadOk,
  });
  return fake;
}

async function render(loadOk = true) {
  const fixture = renderComponentFixture(AccountInfoComponent, {
    imports: [StubLoadingComponent],
    declarations: [AccountInfoComponent],
    inputs: { Provider: providerWithUser(loadOk) },
    autoDetect: true,
  });
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  return fixture;
}

describe('AccountInfoComponent (DOM)', () => {
  it('renders the account-info rows once the user loads', async () => {
    const fixture = await render(true);
    expect(query(fixture, '.account-info')).not.toBeNull();
    expect(query(fixture, '.loading-container')).toBeNull();
  });

  it('shows the loaded user name and email', async () => {
    const fixture = await render(true);
    const values = Array.from(fixture.nativeElement.querySelectorAll('.info-value')).map((e) => (e as HTMLElement).textContent?.trim());
    expect(values).toContain('Ada Lovelace');
    expect(values).toContain('ada@example.com');
  });

  it('shows an error message when the user entity fails to load', async () => {
    const fixture = await render(false);
    expect(query(fixture, '.error-message')).not.toBeNull();
    expect(text(fixture, '.error-message span')).toContain('Unable to load account information');
  });

  it('formats a date via FormatDate and returns N/A for empty', async () => {
    const c = (await render(true)).componentInstance;
    expect(c.FormatDate(null)).toBe('N/A');
    expect(c.FormatDate(new Date('2026-01-15T00:00:00Z'))).toContain('2026');
  });
});
