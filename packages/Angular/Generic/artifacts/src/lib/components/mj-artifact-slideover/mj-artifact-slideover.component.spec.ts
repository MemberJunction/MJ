import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import { MJArtifactSlideoverComponent } from './mj-artifact-slideover.component';
import {
  ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY,
  MJArtifactSlideoverService,
} from '../../services/mj-artifact-slideover.service';
import type { ArtifactVersionSavedEvent } from '../artifact-viewer-panel.component';

const ARTIFACT_A = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';

@Component({
  standalone: true,
  selector: 'mj-artifact-viewer-panel',
  template:
    '<div data-testid="viewer-panel-stub" [attr.data-artifact-id]="artifactId" [attr.data-can-edit]="CanEdit" [attr.data-maximized]="IsMaximized"></div>',
})
class ArtifactViewerPanelStub {
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

function createUser(): UserInfo {
  return new UserInfo(undefined, {
    ID: USER_ID,
    Name: 'Reader User',
    Email: 'reader@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

describe('MJArtifactSlideoverComponent (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountSlideover() {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    const setSettingSpy = vi
      .spyOn(UserInfoEngine.Instance, 'SetSettingDebounced')
      .mockImplementation(() => undefined);

    const fixture = renderComponentFixture(MJArtifactSlideoverComponent, {
      imports: [ArtifactViewerPanelStub, MJButtonDirective],
      declarations: [MJArtifactSlideoverComponent],
    });
    const service = TestBed.inject(MJArtifactSlideoverService);
    return { fixture, service, setSettingSpy };
  }

  it('stays unmounted when closed and renders drawer with read-only badge for read-only requests', () => {
    const { fixture, service } = mountSlideover();
    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).toBeNull();

    service.Open({
      ArtifactID: ARTIFACT_A,
      CurrentUser: createUser(),
      CanEdit: false,
      CanShare: false,
      Title: 'Read-Only Account Brief',
    });
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).not.toBeNull();
    expect(text(fixture, '[data-testid="artifact-slideover-title"]')).toContain('Read-Only Account Brief');
    expect(query(fixture, '[data-testid="artifact-slideover-readonly-badge"]')).not.toBeNull();

    const stub = query(fixture, '[data-testid="viewer-panel-stub"]');
    expect(stub?.getAttribute('data-artifact-id')).toBe(ARTIFACT_A);
    expect(stub?.getAttribute('data-can-edit')).toBe('false');
  });

  it('closes cleanly on Escape key press and emits Closed', () => {
    const { fixture, service } = mountSlideover();
    const closedEvents = capture(fixture.componentInstance.Closed);

    service.Open({ ArtifactID: ARTIFACT_A, CanEdit: true, Title: 'Escape Test' });
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    fixture.detectChanges();

    expect(service.IsOpen).toBe(false);
    expect(query(fixture, '[data-testid="artifact-slideover-drawer"]')).toBeNull();
    expect(closedEvents).toHaveLength(1);
  });

  it('toggles maximize class and persists preference via UserInfoEngine.Instance', () => {
    const { fixture, service, setSettingSpy } = mountSlideover();

    service.Open({ ArtifactID: ARTIFACT_A, CanEdit: true });
    fixture.detectChanges();

    const maxBtn = query(fixture, '[data-testid="artifact-slideover-maximize-btn"]') as HTMLButtonElement;
    maxBtn.click();
    fixture.detectChanges();

    const drawer = query(fixture, '[data-testid="artifact-slideover-drawer"]');
    expect(drawer?.classList.contains('mj-artifact-slideover-drawer--maximized')).toBe(true);
    expect(setSettingSpy).toHaveBeenCalledWith(ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY, 'true');
  });

  it('chains NavigateToLink across artifacts, renders Back button, and navigates back cleanly', () => {
    const { fixture, service } = mountSlideover();

    service.Open({ ArtifactID: ARTIFACT_A, CanEdit: true, Title: 'Primary Doc' });
    fixture.detectChanges();

    fixture.componentInstance.OnPanelNavigateToLink({
      type: 'collection',
      id: 'col-1',
      artifactId: ARTIFACT_B,
      versionNumber: 2,
    });
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="viewer-panel-stub"]')?.getAttribute('data-artifact-id')).toBe(ARTIFACT_B);
    const backBtn = query(fixture, '[data-testid="artifact-slideover-back-btn"]') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    expect(backBtn.textContent).toContain('Back (1)');

    backBtn.click();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="viewer-panel-stub"]')?.getAttribute('data-artifact-id')).toBe(ARTIFACT_A);
    expect(query(fixture, '[data-testid="artifact-slideover-back-btn"]')).toBeNull();
  });

  it('chains MJ: Artifacts OpenEntityRecord internally and bubbles non-artifact entity records', () => {
    const { fixture, service } = mountSlideover();
    const externalRecords = capture(fixture.componentInstance.OpenEntityRecord);

    service.Open({ ArtifactID: ARTIFACT_A, CanEdit: true });
    fixture.detectChanges();

    fixture.componentInstance.OnPanelOpenEntityRecord({
      entityName: 'MJ: Artifacts',
      compositeKey: CompositeKey.FromID(ARTIFACT_B),
    });
    fixture.detectChanges();
    expect(service.CurrentRequest?.ArtifactID).toBe(ARTIFACT_B);
    expect(externalRecords).toHaveLength(0);

    fixture.componentInstance.OnPanelOpenEntityRecord({
      entityName: 'MJ: Companies',
      compositeKey: CompositeKey.FromKeyValuePair('ID', 'comp-1'),
    });
    expect(externalRecords).toHaveLength(1);
    expect(externalRecords[0].entityName).toBe('MJ: Companies');
  });
});
