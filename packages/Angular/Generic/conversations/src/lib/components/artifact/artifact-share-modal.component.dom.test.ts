import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  CreateGuestShareLinkOperation,
  MJArtifactEntity,
  MJArtifactGuestShareLinkEntityType,
  RevokeGuestShareLinkOperation,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import { click, query, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import { ArtifactShareModalComponent } from './artifact-share-modal.component';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import type { UserSearchResult } from '../shared/user-picker.component';

@Component({
  selector: 'mj-window',
  standalone: true,
  template: '<div class="stub-window"><ng-content></ng-content></div>',
})
class StubWindowComponent {
  @Input() public Title = '';
  @Input() public Width = 600;
  @Input() public Height = 500;
  @Input() public MinWidth = 400;
  @Input() public MinHeight = 400;
  @Input() public Visible = false;
  @Output() public Close = new EventEmitter<void>();
}

@Component({
  selector: 'mj-empty-state',
  standalone: true,
  template: '<div class="stub-empty-state">{{ Title }}</div>',
})
class StubEmptyStateComponent {
  @Input() public Icon = '';
  @Input() public Title = '';
  @Input() public Size = '';
}

@Component({
  selector: 'mj-user-picker',
  standalone: true,
  template: '<div class="stub-user-picker"></div>',
})
class StubUserPickerComponent {
  @Input() public currentUser: UserInfo | null = null;
  @Input() public excludeUserIds: string[] = [];
  @Output() public userSelected = new EventEmitter<UserSearchResult>();
}

const TEST_USER = {
  ID: 'user-owner-1',
  Name: 'Amith',
  Email: 'amith@example.com',
} as UserInfo;

const TEST_ARTIFACT = {
  ID: 'art-share-1',
  Name: 'Executive Deck',
  UserID: TEST_USER.ID,
} as MJArtifactEntity;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 10));
}

describe('ArtifactShareModalComponent (DOM — Guest Share Links & Setter Reload)', () => {
  let activeLinks: Array<Partial<MJArtifactGuestShareLinkEntityType>>;
  let confirmDeleteMock: ReturnType<typeof vi.fn>;
  let permissionServiceMock: Partial<ArtifactPermissionService>;

  beforeEach(() => {
    activeLinks = [
      {
        ID: 'link-existing-1',
        ArtifactID: TEST_ARTIFACT.ID,
        ArtifactVersionID: 'ver-1',
        Label: 'Client Preview',
        ExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        RevokedAt: undefined,
        __mj_CreatedAt: new Date('2026-11-10T00:00:00.000Z'),
      },
    ];

    confirmDeleteMock = vi.fn().mockResolvedValue(true);
    permissionServiceMock = {
      loadPermissions: vi.fn().mockResolvedValue([]),
      isOwner: vi.fn().mockResolvedValue(true),
      checkPermission: vi.fn().mockResolvedValue(true),
      validatePermissions: vi.fn().mockReturnValue(true),
      getAvailablePermissions: vi.fn().mockReturnValue(['Read', 'Share', 'Edit']),
      grantPermission: vi.fn().mockResolvedValue(undefined),
      updatePermission: vi.fn().mockResolvedValue(undefined),
      revokePermission: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifact Guest Share Links') {
          return {
            Success: true,
            Results: activeLinks as T[],
            RowCount: activeLinks.length,
            TotalRowCount: activeLinks.length,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return {
          Success: true,
          Results: [],
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      },
    );

    TestBed.overrideComponent(ArtifactShareModalComponent, {
      set: {
        imports: [
          FormsModule,
          MJButtonDirective,
          StubWindowComponent,
          StubEmptyStateComponent,
          StubUserPickerComponent,
        ],
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderModal(isOpen = true, artifact: MJArtifactEntity | null = TEST_ARTIFACT) {
    return renderComponentFixture(ArtifactShareModalComponent, {
      providers: [
        { provide: ArtifactPermissionService, useValue: permissionServiceMock },
        { provide: MJConfirmService, useValue: { ConfirmDelete: confirmDeleteMock } },
      ],
      inputs: {
        CurrentUser: TEST_USER,
        Artifact: artifact,
        IsOpen: isOpen,
      },
      autoDetect: true,
    });
  }

  it('loads permissions and active MJ: Artifact Guest Share Links when opened via @Input setters without ngOnChanges', async () => {
    const f = renderModal(false, null);
    expect(permissionServiceMock.loadPermissions).not.toHaveBeenCalled();

    f.componentRef.setInput('Artifact', TEST_ARTIFACT);
    f.componentRef.setInput('IsOpen', true);
    await flushMicrotasks();
    f.detectChanges();

    expect(permissionServiceMock.loadPermissions).toHaveBeenCalledWith(TEST_ARTIFACT.ID, TEST_USER);
    expect(text(f, '[data-testid="guest-link-row-link-existing-1"]')).toContain('Client Preview');
  });

  it('creates an external guest link with label + expiry, shows one-time URL banner, copies to clipboard, and handles clipboard errors', async () => {
    const createNotifSpy = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(
      Object.assign(Object.create(MJNotificationService.prototype) as MJNotificationService, {
        CreateSimpleNotification: createNotifSpy,
      }),
    );

    vi.spyOn(CreateGuestShareLinkOperation.prototype, 'Execute').mockImplementation(async (input) => {
      const created: Partial<MJArtifactGuestShareLinkEntityType> = {
        ID: 'link-new-2',
        ArtifactID: input.ArtifactID,
        ArtifactVersionID: 'ver-2',
        Label: input.Label ?? undefined,
        ExpiresAt: new Date('2027-02-01T00:00:00.000Z'),
        RevokedAt: undefined,
        __mj_CreatedAt: new Date('2026-11-15T12:00:00.000Z'),
      };
      activeLinks = [created, ...activeLinks];
      return {
        Success: true,
        Output: {
          LinkID: 'link-new-2',
          Token: 'raw-guest-tok',
          ShareUrlPath: '/guest/artifact/raw-guest-tok',
          ExpiresAt: '2027-02-01T00:00:00.000Z',
          ArtifactID: input.ArtifactID,
          VersionID: 'ver-2',
          ArtifactVersionID: 'ver-2',
          VersionNumber: 2,
          ShareMode: 'Frozen',
        },
      };
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const f = renderModal(true);
    await flushMicrotasks();
    f.detectChanges();

    const labelInput = query(f, '[data-testid="guest-link-label-input"]') as HTMLInputElement | null;
    expect(labelInput).not.toBeNull();
    labelInput!.value = 'Investor Update';
    labelInput!.dispatchEvent(new Event('input'));
    f.componentInstance.GuestLinkExpiryHours = 72;
    await flushMicrotasks();
    f.detectChanges();

    click(f, '[data-testid="create-guest-link-btn"]');
    await flushMicrotasks();
    f.detectChanges();

    expect(CreateGuestShareLinkOperation.prototype.Execute).toHaveBeenCalledWith(
      {
        ArtifactID: TEST_ARTIFACT.ID,
        ExpiresInHours: 72,
        Label: 'Investor Update',
      },
      expect.any(Object),
    );
    expect(query(f, '[data-testid="guest-link-created-banner"]')).not.toBeNull();
    expect(text(f, '[data-testid="guest-link-created-banner"]')).toContain('/guest/artifact/raw-guest-tok');

    // Copy succeeds
    click(f, '[data-testid="copy-new-guest-link-btn"]');
    await flushMicrotasks();
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/guest/artifact/raw-guest-tok'));

    // Copy rejection notifies user safely
    writeTextMock.mockRejectedValueOnce(new Error('NotAllowedError'));
    const copiedOk = await f.componentInstance.CopyGuestShareUrl('https://example.org/guest/artifact/x');
    expect(copiedOk).toBe(false);
    expect(createNotifSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy'),
      'error',
      5000,
    );
  });

  it('revokes a guest share link via ConfirmDelete + RevokeGuestShareLinkOperation and removes the row', async () => {
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(
      Object.assign(Object.create(MJNotificationService.prototype) as MJNotificationService, {
        CreateSimpleNotification: vi.fn(),
      }),
    );
    const revokeSpy = vi.spyOn(RevokeGuestShareLinkOperation.prototype, 'Execute').mockResolvedValue({
      Success: true,
      Output: { Revoked: true, LinkID: 'link-existing-1', RevokedAt: '2026-11-15T12:05:00.000Z' },
    });

    const f = renderModal(true);
    await flushMicrotasks();
    f.detectChanges();

    expect(query(f, '[data-testid="guest-link-row-link-existing-1"]')).not.toBeNull();

    click(f, '[data-testid="revoke-guest-link-link-existing-1"]');
    await flushMicrotasks();
    f.detectChanges();

    expect(confirmDeleteMock).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith(
      {
        ArtifactID: TEST_ARTIFACT.ID,
        VersionID: 'ver-1',
        LinkID: 'link-existing-1',
      },
      { provider: f.componentInstance.ProviderToUse },
    );
    expect(query(f, '[data-testid="guest-link-row-link-existing-1"]')).toBeNull();
  });

  it('loads active guest share links via ListArtifactGuestShareLinks GraphQL query when provider supports ExecuteGQL (UI role safe)', async () => {
    const f = renderModal(true, null);
    const executeGqlMock = vi.fn(async () => ({
      ListArtifactGuestShareLinks: {
        Success: true,
        Links: [
          {
            ID: 'gql-link-1',
            ArtifactID: TEST_ARTIFACT.ID,
            ArtifactVersionID: 'ver-9',
            Label: 'External Reviewer',
            ShareMode: 'Frozen',
            ExpiresAt: '2026-12-10T00:00:00.000Z',
            RevokedAt: null,
            CreatedAt: '2026-11-15T12:00:00.000Z',
          },
        ],
      },
    }));
    f.componentInstance.Provider = {
      Entities: [],
      EntityByName: () => undefined,
      ExecuteGQL: executeGqlMock,
    } as typeof f.componentInstance.Provider;

    f.componentRef.setInput('Artifact', TEST_ARTIFACT);
    await flushMicrotasks();
    f.detectChanges();

    expect(executeGqlMock).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.GuestLinks).toHaveLength(1);
    expect(f.componentInstance.GuestLinks[0].ID).toBe('gql-link-1');
    expect(f.componentInstance.GuestLinks[0].Label).toBe('External Reviewer');
  });
});
