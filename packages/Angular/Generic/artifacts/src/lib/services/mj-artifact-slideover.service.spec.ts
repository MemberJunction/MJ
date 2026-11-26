import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
  ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY,
  ArtifactSlideoverNavigateLinkPayload,
  MJArtifactSlideoverService,
} from './mj-artifact-slideover.service';
import type { ArtifactVersionSavedEvent } from '../components/artifact-viewer-panel.component';

const ARTIFACT_A = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_B = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_C = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

function createUser(): UserInfo {
  return new UserInfo(undefined, {
    ID: USER_ID,
    Name: 'Test User',
    Email: 'test@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

describe('MJArtifactSlideoverService', () => {
  let service: MJArtifactSlideoverService;
  let getSettingSpy: ReturnType<typeof vi.spyOn>;
  let setSettingDebouncedSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSettingSpy = vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    setSettingDebouncedSpy = vi
      .spyOn(UserInfoEngine.Instance, 'SetSettingDebounced')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({});
    service = TestBed.inject(MJArtifactSlideoverService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves as a single root-injected Angular singleton via TestBed.inject', () => {
    const second = TestBed.inject(MJArtifactSlideoverService);
    expect(second).toBe(service);
    expect(service.IsOpen).toBe(false);
    expect(service.CanGoBack).toBe(false);
  });

  it('opens an artifact and hydrates persisted maximize preference from UserInfoEngine.Instance', () => {
    getSettingSpy.mockReturnValue('true');
    const user = createUser();

    service.Open({
      ArtifactID: ARTIFACT_A,
      VersionNumber: 2,
      CurrentUser: user,
      CanEdit: true,
      CanShare: true,
      Title: 'Account Brief',
    });

    expect(service.IsOpen).toBe(true);
    expect(service.IsMaximized).toBe(true);
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_A);
    expect(service.CurrentRequest?.VersionNumber).toBe(2);
    expect(getSettingSpy).toHaveBeenCalledWith(ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY);
  });

  it('persists ToggleMaximize via UserInfoEngine.Instance.SetSettingDebounced (never localStorage)', () => {
    service.Open({ ArtifactID: ARTIFACT_A });
    expect(service.IsMaximized).toBe(false);

    service.ToggleMaximize();
    expect(service.IsMaximized).toBe(true);
    expect(setSettingDebouncedSpy).toHaveBeenCalledWith(ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY, 'true');

    service.ToggleMaximize();
    expect(service.IsMaximized).toBe(false);
    expect(setSettingDebouncedSpy).toHaveBeenCalledWith(ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY, 'false');
  });

  it('chains NavigateToLink across artifacts with back-stack navigation and conservative permissions', () => {
    const user = createUser();
    service.Open({
      ArtifactID: ARTIFACT_A,
      VersionNumber: 1,
      CurrentUser: user,
      CanEdit: true,
      CanShare: true,
      Title: 'Doc A',
    });

    const handledB = service.NavigateToLink({
      Type: 'artifact',
      ArtifactID: ARTIFACT_B,
      VersionNumber: 3,
      Title: 'Doc B',
    });
    expect(handledB).toBe(true);
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_B);
    expect(service.CurrentRequest?.VersionNumber).toBe(3);
    expect(service.CurrentRequest?.CanEdit).toBe(false);
    expect(service.HistoryCount).toBe(1);
    expect(service.CanGoBack).toBe(true);

    const handledC = service.NavigateToLink({
      Type: 'record',
      EntityName: 'MJ: Artifacts',
      RecordID: ARTIFACT_C,
    });
    expect(handledC).toBe(true);
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_C);
    expect(service.HistoryCount).toBe(2);

    expect(service.GoBack()).toBe(true);
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_B);
    expect(service.HistoryCount).toBe(1);

    expect(service.GoBack()).toBe(true);
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_A);
    expect(service.CurrentRequest?.CanEdit).toBe(true);
    expect(service.HistoryCount).toBe(0);
    expect(service.GoBack()).toBe(false);
  });

  it('emits ExternalNavigation$ and returns false for non-artifact record/conversation links', () => {
    service.Open({ ArtifactID: ARTIFACT_A });
    const received: ArtifactSlideoverNavigateLinkPayload[] = [];
    const sub = service.ExternalNavigation$.subscribe((payload) => received.push(payload));

    const handled = service.NavigateToLink({
      Type: 'conversation',
      ID: 'conv-123',
    });

    sub.unsubscribe();
    expect(handled).toBe(false);
    expect(received).toHaveLength(1);
    expect(received[0].ID).toBe('conv-123');
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_A);
  });

  it('invokes OnVersionSaved callback and emits VersionSaved$ when NotifyVersionSaved is called', () => {
    const onSaved = vi.fn();
    const emitted: ArtifactVersionSavedEvent[] = [];
    const sub = service.VersionSaved$.subscribe((e) => emitted.push(e));

    service.Open({
      ArtifactID: ARTIFACT_A,
      CanEdit: true,
      OnVersionSaved: onSaved,
    });

    const event: ArtifactVersionSavedEvent = {
      ArtifactID: ARTIFACT_A,
      VersionID: 'ver-2',
      VersionNumber: 2,
      UpdatedAt: new Date(),
    };
    service.NotifyVersionSaved(event);

    sub.unsubscribe();
    expect(onSaved).toHaveBeenCalledWith(event);
    expect(emitted).toEqual([event]);
  });

  it('clears active request and history stack on Close while keeping maximize preference', () => {
    service.Open({ ArtifactID: ARTIFACT_A });
    service.ToggleMaximize();
    service.NavigateToLink({ Type: 'artifact', ArtifactID: ARTIFACT_B });

    service.Close();

    expect(service.IsOpen).toBe(false);
    expect(service.CurrentRequest).toBeNull();
    expect(service.HistoryCount).toBe(0);
    expect(service.IsMaximized).toBe(true);
  });
});
