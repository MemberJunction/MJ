/**
 * My Profile avatar save/revert: both go through UserAvatarService.UpdateMyAvatar (the
 * self-service mutation), never through a plain Save() of the caller's MJ: Users row — which
 * fails on deployments that do not grant users Update on MJ: Users.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { raiseEvent } = vi.hoisted(() => ({ raiseEvent: vi.fn() }));

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ChangeDetectorRef: class {},
  NgZone: class {},
}));
vi.mock('@angular/forms', () => ({ FormsModule: class {} }));
vi.mock('@memberjunction/core', () => ({ Metadata: class {} }));
vi.mock('@memberjunction/ng-user-avatar', () => ({ UserAvatarService: class {} }));
vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { RaiseEvent: raiseEvent } },
  MJEventType: { ComponentEvent: 'ComponentEvent' },
}));
vi.mock('@memberjunction/ng-shared', () => ({
  EventCodes: { AvatarUpdated: 'AvatarUpdated' },
  SharedService: class {},
}));
vi.mock('@memberjunction/ng-base-types', () => ({
  BaseAngularComponent: class {
    get ProviderToUse() {
      return PROVIDER;
    }
  },
}));

const PROVIDER = { name: 'the component provider' };
const USER_ID = 'AAAA1111-0000-0000-0000-000000000001';
const DATA_URI = 'data:image/png;base64,AAAA';

import { UserProfileSettingsComponent } from '../lib/user-profile-settings/user-profile-settings.component';
import type { UserAvatarService } from '@memberjunction/ng-user-avatar';
import type { SharedService } from '@memberjunction/ng-shared';
import type { ChangeDetectorRef, NgZone } from '@angular/core';
import type { MJUserEntity } from '@memberjunction/core-entities';

function build(result: { Success: boolean; ErrorMessage?: string }) {
  const avatarService = {
    UpdateMyAvatar: vi.fn(async () => result),
    isValidUrl: (url: string) => /^https?:\/\//.test(url),
  };
  const shared = { CreateSimpleNotification: vi.fn() };
  const cdr = { markForCheck: vi.fn() };
  const zone = { run: (fn: () => void) => fn() };
  const user = {
    ID: USER_ID,
    UserImageURL: null as string | null,
    UserImageIconClass: null as string | null,
    Save: vi.fn(async () => true),
    Load: vi.fn(async () => {
      user.UserImageURL = 'https://example.com/saved.png';
      return true;
    }),
  };
  const component = new UserProfileSettingsComponent(
    avatarService as unknown as UserAvatarService,
    shared as unknown as SharedService,
    cdr as unknown as ChangeDetectorRef,
    zone as unknown as NgZone,
  );
  component.CurrentUser = user as unknown as MJUserEntity;
  return { component, avatarService, user };
}

describe('UserProfileSettingsComponent avatar persistence', () => {
  beforeEach(() => {
    raiseEvent.mockClear();
    vi.useFakeTimers();
  });

  it.each([
    ['upload', (c: UserProfileSettingsComponent): void => { c.UploadedImageBase64 = DATA_URI; }, [DATA_URI, null]],
    ['url', (c: UserProfileSettingsComponent): void => { c.ImageUrlInput = 'https://example.com/me.png'; }, ['https://example.com/me.png', null]],
    ['icon', (c: UserProfileSettingsComponent): void => { c.SelectedIconClass = 'fa-solid fa-user'; }, [null, 'fa-solid fa-user']],
  ] as const)('save() on the %s tab calls the mutation, not Save()', async (tab, arrange, expected) => {
    const { component, avatarService, user } = build({ Success: true });
    component.SelectedTab = tab;
    arrange(component);

    await component.save();

    expect(avatarService.UpdateMyAvatar).toHaveBeenCalledWith(expected[0], expected[1], PROVIDER);
    expect(user.Save).not.toHaveBeenCalled();
  });

  it('on success reloads CurrentUser and raises AvatarUpdated with the saved values', async () => {
    const { component, user } = build({ Success: true });
    component.SelectedTab = 'url';
    component.ImageUrlInput = 'https://example.com/me.png';

    await component.save();

    expect(user.Load).toHaveBeenCalledWith(USER_ID);
    expect(component.errorMessage).toBe('');
    expect(raiseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'AvatarUpdated', args: { imageUrl: 'https://example.com/saved.png', iconClass: null } }),
    );
    expect(component.IsSaving).toBe(false);
  });

  it("on failure shows the server's message and raises nothing", async () => {
    const { component, user } = build({ Success: false, ErrorMessage: 'Avatar image must be 200KB or smaller (this one is 300KB).' });
    component.SelectedTab = 'upload';
    component.UploadedImageBase64 = DATA_URI;

    await component.save();

    expect(component.errorMessage).toBe('Avatar image must be 200KB or smaller (this one is 300KB).');
    expect(user.Load).not.toHaveBeenCalled();
    expect(raiseEvent).not.toHaveBeenCalled();
    expect(component.IsSaving).toBe(false);
  });

  it('does not call the server when the selected tab has nothing to save', async () => {
    const { component, avatarService } = build({ Success: true });
    component.SelectedTab = 'icon';
    component.SelectedIconClass = '';

    await component.save();

    expect(avatarService.UpdateMyAvatar).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Please select an icon');
  });

  it('RevertToDefault() clears both values through the mutation and resets local state', async () => {
    const { component, avatarService, user } = build({ Success: true });
    component.ImageUrlInput = 'https://example.com/me.png';
    component.PreviewUrl = 'https://example.com/me.png';

    await component.RevertToDefault();

    expect(avatarService.UpdateMyAvatar).toHaveBeenCalledWith(null, null, PROVIDER);
    expect(user.Save).not.toHaveBeenCalled();
    expect(user.Load).toHaveBeenCalledWith(USER_ID);
    expect(component.ImageUrlInput).toBe('');
    expect(component.PreviewUrl).toBe('');
    expect(raiseEvent).toHaveBeenCalledTimes(1);
  });

  it("RevertToDefault() keeps local state and shows the server's message on failure", async () => {
    const { component } = build({ Success: false, ErrorMessage: 'Could not save your avatar: boom' });
    component.ImageUrlInput = 'https://example.com/me.png';

    await component.RevertToDefault();

    expect(component.errorMessage).toBe('Could not save your avatar: boom');
    expect(component.ImageUrlInput).toBe('https://example.com/me.png');
    expect(raiseEvent).not.toHaveBeenCalled();
  });
});
