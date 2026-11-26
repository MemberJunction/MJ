import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJArtifactSlideoverComponent } from './mj-artifact-slideover.component';
import { MJArtifactSlideoverService } from '../../services/mj-artifact-slideover.service';
import type { ArtifactVersionSavedEvent } from '../artifact-viewer-panel.component';

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '44444444-4444-4444-8444-444444444444';

@Component({
  standalone: true,
  selector: 'mj-artifact-viewer-panel',
  template:
    '<div data-testid="viewer-panel-dom-stub" [attr.data-artifact-id]="artifactId" [attr.data-maximized]="IsMaximized"></div>',
})
class ViewerPanelDomStub {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactId = '';
  @Input() VersionNumber?: number;
  @Input() CurrentUser?: UserInfo;
  @Input() EnvironmentId = '';
  @Input() CanEdit = false;
  @Input() canShare = false;
  @Input() IsMaximized = false;
  @Input() ShowCloseButton = true;
  @Input() ShowMaximizeButton = true;
  @Output() Closed = new EventEmitter<void>();
  @Output() MaximizeToggled = new EventEmitter<void>();
  @Output() VersionSaved = new EventEmitter<ArtifactVersionSavedEvent>();
  @Output() NavigateToLink = new EventEmitter<{
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
  }>();
  @Output() OpenArtifactRequested = new EventEmitter<string>();
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
}

function makeUser(): UserInfo {
  return new UserInfo(undefined, {
    ID: USER_ID,
    Name: 'Dom Tester',
    Email: 'dom.tester@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

describe('MJArtifactSlideoverComponent DOM contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mount() {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    const fixture = renderComponentFixture(MJArtifactSlideoverComponent, {
      imports: [ViewerPanelDomStub, MJButtonDirective],
      declarations: [MJArtifactSlideoverComponent],
    });
    const service = TestBed.inject(MJArtifactSlideoverService);
    return { fixture, service };
  }

  it('mounts the slideover drawer with aria dialog semantics when opened and emits Closed on Escape', () => {
    const { fixture, service } = mount();
    const closedEvents = capture(fixture.componentInstance.Closed);
    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).toBeNull();

    service.Open({
      ArtifactID: ARTIFACT_ID,
      CurrentUser: makeUser(),
      CanEdit: true,
      Title: 'DOM Brief',
    });
    fixture.detectChanges();

    const drawer = query(fixture, '[data-testid="artifact-slideover-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute('role')).toBe('dialog');
    expect(drawer?.getAttribute('aria-modal')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).toBeNull();
    expect(closedEvents).toHaveLength(1);
  });

  it('toggles maximized drawer class and bubbles OpenEntityRecord and ExternalNavigate outputs', () => {
    const { fixture, service } = mount();
    const entityEvents = capture(fixture.componentInstance.OpenEntityRecord);
    const extEvents = capture(fixture.componentInstance.ExternalNavigate);

    service.Open({
      ArtifactID: ARTIFACT_ID,
      CurrentUser: makeUser(),
      CanEdit: false,
      Title: 'Read-Only Brief',
    });
    fixture.detectChanges();

    const drawer = query(fixture, '[data-testid="artifact-slideover-drawer"]');
    expect(drawer?.classList.contains('mj-artifact-slideover-drawer--maximized')).toBe(false);

    service.ToggleMaximize();
    fixture.detectChanges();
    expect(drawer?.classList.contains('mj-artifact-slideover-drawer--maximized')).toBe(true);

    const key = CompositeKey.FromID(ARTIFACT_ID); // first-pk-ok: MJ: Artifacts core entity ID in test
    fixture.componentInstance.OnPanelOpenEntityRecord({ entityName: 'MJ: Companies', compositeKey: key });
    fixture.componentInstance.OnPanelNavigateToLink({ type: 'conversation', id: 'conv-1' });

    expect(entityEvents).toHaveLength(1);
    expect(entityEvents[0].entityName).toBe('MJ: Companies');
    expect(extEvents).toHaveLength(1);
    expect(extEvents[0]).toMatchObject({ Type: 'conversation', ID: 'conv-1' });
  });

  it('invokes OnVersionSaved callback when viewer commits a new version', () => {
    const { fixture, service } = mount();
    const savedCb = vi.fn();

    service.Open({
      ArtifactID: ARTIFACT_ID,
      CurrentUser: makeUser(),
      CanEdit: true,
      OnVersionSaved: savedCb,
    });
    fixture.detectChanges();

    const payload: ArtifactVersionSavedEvent = {
      ArtifactID: ARTIFACT_ID,
      VersionID: '22222222-2222-4222-8222-222222222222',
      VersionNumber: 2,
      UpdatedAt: new Date('2026-11-26T12:00:00Z'),
    };
    fixture.componentInstance.OnPanelVersionSaved(payload);

    expect(savedCb).toHaveBeenCalledWith(payload);
  });
});
