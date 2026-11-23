import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: Function) => target,
  };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public Data: Record<string, string | number | boolean | null | undefined> | null = null;
    protected navigationService: Record<string, (...args: never[]) => void> = {};
    public ngOnInit(): void {}
    public ngOnDestroy(): void {}
    public GetQueryParams(): Record<string, string> {
      return {};
    }
    public UpdateQueryParams(_params: Record<string, string | null>): void {}
    public NotifyLoadComplete(): void {}
    public NotifyDisplayNameChanged(_name: string): void {}
  },
  NavigationService: class {},
}));

vi.mock('@memberjunction/ng-base-application', () => ({
  ApplicationManager: class {},
  BaseApplication: class {},
}));

vi.mock('@memberjunction/ng-notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ng-notifications')>();
  return {
    ...actual,
    MJNotificationService: { Instance: { CreateSimpleNotification: vi.fn() } },
  };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  ConversationEngine,
  type MJArtifactPermissionEntity,
  type MJConversationEntity,
  type MJResourcePermissionEntity,
} from '@memberjunction/core-entities';
import {
  BuildLibraryAgentClientTools,
  type LibraryAgentController,
} from '../library-agent-context.js';
import { LibraryResource } from '../library-resource.component.js';
import { ChatConversationsResource } from '../chat-conversations-resource.component.js';
import { ArtifactResource } from '../artifact-resource.component.js';
import {
  LibraryWorkspaceComponent,
} from '../../../../../../Generic/conversations/src/lib/components/library/library-workspace.component.js';
import type { LibrarySharedEntry } from '../../../../../../Generic/conversations/src/lib/components/library/library.models.js';
import {
  ShareModalComponent,
} from '../../../../../../Generic/conversations/src/lib/components/share/share-modal.component.js';
import {
  ConversationChatAreaComponent,
} from '../../../../../../Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.js';

interface TestWorkspaceHarness {
  cdr: { markForCheck: () => void; detectChanges: () => void };
  notifications: { CreateSimpleNotification: ReturnType<typeof vi.fn> };
  emitWorkspaceState: () => void;
  notifyViewCheck: () => void;
}

interface TestChatAreaHarness {
  engine: ConversationEngine;
  _conversation: MJConversationEntity | null;
}

interface TestLibraryResourceHarness {
  navigationService: {
    SwitchToApp: (appId: string, navItemName: string, queryParams?: Record<string, string>) => Promise<void>;
    OpenNavItemByName: ReturnType<typeof vi.fn>;
  };
  appManager: {
    Applications: {
      subscribe: (observer: { next?: (v: Array<{ ID: string; Name: string }>) => void; complete?: () => void }) => { unsubscribe: () => void };
    };
  };
}

interface TestChatResourceHarness {
  engine: {
    GetConversation: (id: string) => MJConversationEntity | undefined;
    VerifyConversationAccess: () => Promise<MJConversationEntity | null>;
  };
  bridge: { SetActiveFromWorkspace: (id: string) => void };
  cdr: { detectChanges: () => void };
  applyAgentParam: () => void;
  OnQueryParamsChanged: (params: Record<string, string>, source: 'popstate' | 'deeplink') => void;
}

interface TestArtifactResourceHarness {
  ProviderToUse: {
    CurrentUser: UserInfo;
    ExecuteGQL: ReturnType<typeof vi.fn>;
  };
  cdr: { markForCheck: () => void };
}

function createTestUser(id: string, name: string): UserInfo {
  return { ID: id, Name: name, Email: `${id}@example.com`, UserRoles: [] } as Partial<UserInfo> as UserInfo;
}

function createConversationStub(overrides: {
  ID: string;
  UserID: string;
  Name: string;
  User?: string | null;
  ParentID?: string | null;
}): MJConversationEntity {
  return {
    ID: overrides.ID,
    UserID: overrides.UserID,
    Name: overrides.Name,
    User: overrides.User ?? 'Owner User',
    ParentID: overrides.ParentID ?? null,
    Load: vi.fn(async () => true),
  } as Partial<MJConversationEntity> as MJConversationEntity;
}

function initWorkspaceForTest(workspace: LibraryWorkspaceComponent, provider: IMetadataProvider, user: UserInfo): void {
  const internals = workspace as Partial<LibraryWorkspaceComponent> as TestWorkspaceHarness;
  internals.cdr = { markForCheck: vi.fn(), detectChanges: vi.fn() };
  internals.notifications = { CreateSimpleNotification: vi.fn() };
  internals.emitWorkspaceState = vi.fn();
  internals.notifyViewCheck = vi.fn();
  Object.defineProperty(workspace, 'ProviderToUse', { get: () => provider, configurable: true });
  Object.defineProperty(workspace, 'EffectiveUser', { get: () => user, configurable: true });
}

describe('Epic 4a Slice 4 — Library Sharing Views, Owner-Only Controls & Deep Links', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Library Shared with Me & Shared by Me Views (Conversations + Artifacts)
  // =========================================================================
  describe('Library Shared with Me & Shared by Me views', () => {
    it('loads and surfaces both conversations (including ParentID side threads) and artifacts with sharer/recipient, share date, permission level, and owner Revoke action', async () => {
      const alice = createTestUser('user-alice', 'Alice Owner');
      const deleteSpy = vi.fn(async () => true);
      const loadedPerm = {
        ID: 'perm-conv-out-1',
        Load: vi.fn(async () => true),
        Delete: deleteSpy,
      } as Partial<MJResourcePermissionEntity> as MJResourcePermissionEntity;

      const fakeProvider = {
        CurrentUser: alice,
        GetEntityObject: vi.fn(async () => loadedPerm),
        RunViews: vi.fn(async () => []),
      } as Partial<IMetadataProvider> as IMetadataProvider;

      const workspace = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
      initWorkspaceForTest(workspace, fakeProvider, alice);
      workspace.SearchQuery = '';
      workspace.CategoryFilter = 'all';
      workspace.OwnershipFilter = 'all';
      workspace.AllItems = [];
      workspace.FlatCollections = [];
      workspace.CollectionTree = [];
      workspace.ConnectedDrives = [];

      const shareDate = new Date('2026-11-15T12:00:00Z');
      workspace.SharedWithMeEntries = [
        {
          Id: 'conv-in:1',
          ItemKind: 'conversation',
          ResourceId: 'conv-side-in',
          Title: 'Coaching Side Thread',
          Description: 'Shared side thread',
          Icon: 'fa-solid fa-code-branch',
          SharerName: 'Bob Coach',
          RecipientName: 'Alice Owner',
          ShareDate: shareDate,
          PermissionLevel: 'View',
          IsSideThread: true,
          ParentConversationId: 'conv-parent-1',
          PermissionRecordId: 'perm-in-1',
          CanRevoke: false,
        },
        {
          Id: 'art-in:1',
          ItemKind: 'artifact',
          ResourceId: 'art-in-1',
          Title: 'Growth Brief Doc',
          Description: 'Shared document',
          Icon: 'fa-solid fa-file-lines',
          SharerName: 'Bob Coach',
          RecipientName: 'Alice Owner',
          ShareDate: shareDate,
          PermissionLevel: 'Edit',
          IsSideThread: false,
          ParentConversationId: null,
          PermissionRecordId: 'ap-in-1',
          CanRevoke: false,
        },
      ];

      workspace.SharedByMeEntries = [
        {
          Id: 'conv-out:1',
          ItemKind: 'conversation',
          ResourceId: 'conv-out-side',
          Title: 'Private Side Reflection',
          Description: 'Shared side thread',
          Icon: 'fa-solid fa-code-branch',
          SharerName: 'Alice Owner',
          RecipientName: 'Carol Teammate',
          ShareDate: shareDate,
          PermissionLevel: 'Edit',
          IsSideThread: true,
          ParentConversationId: 'conv-my-parent',
          PermissionRecordId: 'perm-conv-out-1',
          CanRevoke: true,
        },
        {
          Id: 'art-out:1',
          ItemKind: 'artifact',
          ResourceId: 'art-out-1',
          Title: 'Quarterly OKR Matrix',
          Description: 'Spreadsheet',
          Icon: 'fa-solid fa-table-cells',
          SharerName: 'Alice Owner',
          RecipientName: 'Carol Teammate',
          ShareDate: shareDate,
          PermissionLevel: 'View',
          IsSideThread: false,
          ParentConversationId: null,
          PermissionRecordId: 'ap-out-1',
          CanRevoke: true,
        },
      ];

      // Hub tabs and UnifiedScope support both 'shared' and 'shared-by-me'
      const tabs = workspace.HubTabs;
      expect(tabs.some((t) => t.key === 'shared' && t.label === 'Shared with Me' && t.badge === 2)).toBe(true);
      expect(tabs.some((t) => t.key === 'shared-by-me' && t.label === 'Shared by Me' && t.badge === 2)).toBe(true);

      workspace.SetUnifiedScope('shared');
      expect(workspace.UnifiedScope).toBe('shared');
      expect(workspace.ActiveSharedEntries).toHaveLength(2);
      expect(workspace.ActiveSharedEntries.map((e) => e.ItemKind)).toEqual(['conversation', 'artifact']);
      expect(workspace.ActiveSharedEntries[0].SharerName).toBe('Bob Coach');
      expect(workspace.ActiveSharedEntries[0].PermissionLevel).toBe('View');
      expect(workspace.ActiveSharedEntries[0].IsSideThread).toBe(true);
      expect(workspace.FormatShareDate(workspace.ActiveSharedEntries[0].ShareDate)).toContain('2026');

      workspace.SetUnifiedScope('shared-by-me');
      expect(workspace.UnifiedScope).toBe('shared-by-me');
      expect(workspace.ActiveSharedEntries).toHaveLength(2);
      expect(workspace.ActiveSharedEntries[0].RecipientName).toBe('Carol Teammate');
      expect(workspace.ActiveSharedEntries[0].PermissionLevel).toBe('Edit');
      expect(workspace.ActiveSharedEntries[0].CanRevoke).toBe(true);

      // Owner revokes the conversation share -> deletes MJ: Resource Permissions row and removes immediately
      const revoked = await workspace.RevokeSharedEntry(workspace.SharedByMeEntries[0]);
      expect(revoked).toBe(true);
      expect(loadedPerm.Load).toHaveBeenCalledWith('perm-conv-out-1');
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(workspace.SharedByMeEntries).toHaveLength(1);
      expect(workspace.SharedByMeEntries[0].ResourceId).toBe('art-out-1');

      // Agent SwitchLibraryTab supports 'shared-by-me'
      const switchHubTab = vi.fn();
      const switchMode = vi.fn();
      const controller: LibraryAgentController = {
        GetState: () => null,
        SwitchMode: switchMode,
        SwitchHubTab: switchHubTab,
        OpenCollectionById: vi.fn(),
        OpenArtifactById: vi.fn(),
        SetSearchQuery: vi.fn(),
        SetCategoryFilter: vi.fn(),
        OpenConnectedDrive: vi.fn(),
      };
      const tools = BuildLibraryAgentClientTools(controller);
      const switchTool = tools.find((t) => t.Name === 'SwitchLibraryTab')!;
      const outcome = (await switchTool.Handler({ tab: 'shared-by-me' })) as { Success?: boolean };
      expect(outcome.Success).toBe(true);
      expect(switchMode).toHaveBeenCalledWith('hub');
      expect(switchHubTab).toHaveBeenCalledWith('shared-by-me');
    });

    it('supports owner revoking an artifact share in Shared by Me via MJ: Artifact Permissions', async () => {
      const alice = createTestUser('user-alice', 'Alice Owner');
      const deleteSpy = vi.fn(async () => true);
      const artPermRecord = {
        ID: 'ap-out-2',
        Load: vi.fn(async () => true),
        Delete: deleteSpy,
      } as Partial<MJArtifactPermissionEntity> as MJArtifactPermissionEntity;

      const getEntityObject = vi.fn(async () => artPermRecord);
      const fakeProvider = {
        CurrentUser: alice,
        GetEntityObject: getEntityObject,
      } as Partial<IMetadataProvider> as IMetadataProvider;

      const workspace = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
      initWorkspaceForTest(workspace, fakeProvider, alice);

      const entry: LibrarySharedEntry = {
        Id: 'art-out:2',
        ItemKind: 'artifact',
        ResourceId: 'art-99',
        Title: 'Strategy Memo',
        Description: 'Artifact share',
        Icon: 'fa-solid fa-file-lines',
        SharerName: 'Alice Owner',
        RecipientName: 'Dan Reader',
        ShareDate: new Date('2026-11-18T10:00:00Z'),
        PermissionLevel: 'View',
        IsSideThread: false,
        ParentConversationId: null,
        PermissionRecordId: 'ap-out-2',
        CanRevoke: true,
      };
      workspace.SharedByMeEntries = [entry];

      const revoked = await workspace.RevokeSharedEntry(entry);
      expect(revoked).toBe(true);
      expect(getEntityObject).toHaveBeenCalledWith('MJ: Artifact Permissions', alice);
      expect(artPermRecord.Load).toHaveBeenCalledWith('ap-out-2');
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(workspace.SharedByMeEntries).toHaveLength(0);
    });

    it('renders left-rail Shared by Me nav and shared entry columns (type, sharer/recipient, date, permission, Revoke) in Library template', () => {
      const htmlPath = resolve(
        __dirname,
        '../../../../../../Generic/conversations/src/lib/components/library/library-workspace.component.html',
      );
      const html = readFileSync(htmlPath, 'utf8');
      expect(html).toContain('data-testid="rail-nav-shared-by-me"');
      expect(html).toContain('Shared by Me');
      expect(html).toContain('sharedEntriesTemplate');
      expect(html).toContain("entry.ItemKind === 'conversation' ? 'Conversation' : 'Artifact'");
      expect(html).toContain("isSharedByMe ? 'Recipient' : 'Shared by'");
      expect(html).toContain('FormatShareDate(entry.ShareDate)');
      expect(html).toContain('entry.PermissionLevel');
      expect(html).toContain('RevokeSharedEntry(entry, $event)');
    });
  });

  // =========================================================================
  // 2. Owner-Only Conversation Sharing & ParentID Side-Thread Privacy Controls
  // =========================================================================
  describe('Owner-only sharing controls and ParentID side-thread privacy', () => {
    it('allows owners to share parent and ParentID side threads with View/Edit and blocks non-owner recipients from resharing or opening share modal', () => {
      const engine = Object.create(ConversationEngine.prototype) as ConversationEngine;
      const parentOwned = createConversationStub({ ID: 'conv-p1', UserID: 'owner-1', Name: 'Parent' });
      const sideOwned = createConversationStub({
        ID: 'conv-side-1',
        UserID: 'owner-1',
        ParentID: 'conv-p1',
        Name: 'Side Thread',
      });
      const sideRecipient = createConversationStub({
        ID: 'conv-side-1',
        UserID: 'owner-1',
        ParentID: 'conv-p1',
        Name: 'Side Thread',
      });

      // Even if a recipient had a share grant row, CanShareConversation enforces strict owner-only
      vi.spyOn(engine, 'GetSharedByInfo').mockReturnValue({
        UserID: 'owner-1',
        Name: 'Owner',
        Email: 'owner@example.com',
        Level: 'Owner',
      });
      expect(engine.CanShareConversation(parentOwned, 'owner-1')).toBe(true);
      expect(engine.CanShareConversation(sideOwned, 'owner-1')).toBe(true);
      expect(engine.CanShareConversation(sideRecipient, 'recipient-2')).toBe(false);

      // ConversationChatAreaComponent blocks ShareConversation() for non-owners
      const chatArea = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
      const areaInternals = chatArea as Partial<ConversationChatAreaComponent> as TestChatAreaHarness;
      areaInternals.engine = engine;
      areaInternals._conversation = sideOwned;
      chatArea.CurrentUser = createTestUser('recipient-2', 'Recipient Two');
      chatArea.ShowShareModal = false;

      expect(chatArea.CanShareConversation).toBe(false);
      chatArea.ShareConversation();
      expect(chatArea.ShowShareModal).toBe(false);

      // Owner CAN open ShareConversation()
      chatArea.CurrentUser = createTestUser('owner-1', 'Owner User');
      expect(chatArea.CanShareConversation).toBe(true);
      expect(chatArea.IsSideThread).toBe(true);
      chatArea.ShareConversation();
      expect(chatArea.ShowShareModal).toBe(true);

      // ShareModalComponent restricts AccessLevels to View and Edit and checks IsConversationOwner
      const modal = new ShareModalComponent(
        {} as ConstructorParameters<typeof ShareModalComponent>[0],
        {} as ConstructorParameters<typeof ShareModalComponent>[1],
        {
          detectChanges: vi.fn(),
          markForCheck: vi.fn(),
          detach: vi.fn(),
          checkNoChanges: vi.fn(),
          reattach: vi.fn(),
        } as ConstructorParameters<typeof ShareModalComponent>[2],
      );
      expect(modal.AccessLevels.map((l) => l.value)).toEqual(['View', 'Edit']);
      modal.Conversation = sideOwned;
      modal.CurrentUser = createTestUser('recipient-2', 'Recipient Two');
      expect(modal.IsConversationOwner).toBe(false);
      modal.CurrentUser = createTestUser('owner-1', 'Owner User');
      expect(modal.IsConversationOwner).toBe(true);
    });
  });

  // =========================================================================
  // 3. NavigationService Deep Links & Post-Revocation Access Denial
  // =========================================================================
  describe('NavigationService deep links and post-revocation access denial', () => {
    it('routes clicking a shared conversation (including ParentID side thread) from Library through NavigationService', async () => {
      const switchToApp = vi.fn(async () => undefined);
      const resource = Object.create(LibraryResource.prototype) as LibraryResource;
      const internals = resource as Partial<LibraryResource> as TestLibraryResourceHarness;

      const fakeChatApp = {
        ID: 'app-chat',
        Name: 'Chat',
        GetNavItems: vi.fn(async () => [
          { Label: 'Conversations', DriverClass: 'ChatConversationsResource', Status: 'Active' },
        ]),
      };
      internals.navigationService = { SwitchToApp: switchToApp, OpenNavItemByName: vi.fn() };
      internals.appManager = {
        Applications: {
          subscribe: (observer) => {
            observer.next?.([fakeChatApp]);
            observer.complete?.();
            return { unsubscribe: () => undefined };
          },
        },
      };

      await resource.OnHostNavigate({ Kind: 'conversation', ConversationId: 'conv-side-deep-1' });
      expect(switchToApp).toHaveBeenCalledWith('app-chat', 'Conversations', {
        conversationId: 'conv-side-deep-1',
      });
    });

    it('opens shared ParentID side-thread deep links when permitted and cleanly denies access after revocation without leaking messages', async () => {
      const chatRes = Object.create(ChatConversationsResource.prototype) as ChatConversationsResource;
      const sideThread = createConversationStub({
        ID: 'conv-side-shared',
        UserID: 'owner-1',
        ParentID: 'conv-parent-1',
        Name: 'Shared Coaching Thread',
      });

      const verifyMock = vi
        .fn<() => Promise<MJConversationEntity | null>>()
        .mockResolvedValueOnce(sideThread)
        .mockResolvedValueOnce(null);

      const resInternals = chatRes as Partial<ChatConversationsResource> as TestChatResourceHarness;
      resInternals.engine = {
        GetConversation: () => undefined,
        VerifyConversationAccess: verifyMock,
      };
      resInternals.bridge = { SetActiveFromWorkspace: vi.fn() };
      resInternals.cdr = { detectChanges: vi.fn() };
      resInternals.applyAgentParam = vi.fn();
      chatRes.CurrentUser = createTestUser('recipient-2', 'Recipient Two');

      // 1) Permitted deep link opens shared ParentID side thread
      resInternals.OnQueryParamsChanged({ conversationId: 'conv-side-shared' }, 'deeplink');
      await Promise.resolve();
      await Promise.resolve();

      expect(chatRes.SelectedConversation?.ID).toBe('conv-side-shared');
      expect(chatRes.ConversationAccessDeniedMessage).toBeNull();

      // 2) After owner revokes permission, re-opening the deep link denies access and clears state
      resInternals.OnQueryParamsChanged({ conversationId: 'conv-side-shared' }, 'deeplink');
      await Promise.resolve();
      await Promise.resolve();

      expect(chatRes.SelectedConversationId).toBeNull();
      expect(chatRes.SelectedConversation).toBeNull();
      expect(chatRes.ConversationAccessDeniedMessage).toContain('permission');
    });

    it('denies artifact deep link access cleanly when ResolveArtifactUserPermissions returns CanRead=false after revocation', async () => {
      const artifactRes = Object.create(ArtifactResource.prototype) as ArtifactResource;

      const executeGql = vi
        .fn()
        .mockResolvedValueOnce({
          ResolveArtifactUserPermissions: { CanRead: true, CanEdit: false, CanShare: false },
        })
        .mockResolvedValueOnce({
          ResolveArtifactUserPermissions: { CanRead: false, CanEdit: false, CanShare: false },
        });

      const user = createTestUser('recipient-2', 'Recipient Two');
      const fakeGqlProvider = { CurrentUser: user, ExecuteGQL: executeGql };
      Reflect.set(artifactRes, 'cdr', { markForCheck: vi.fn() });
      Object.defineProperty(artifactRes, 'ProviderToUse', {
        get: () => fakeGqlProvider as Partial<IMetadataProvider> as IMetadataProvider,
        configurable: true,
      });
      artifactRes.artifactId = 'art-deep-1';
      artifactRes.CurrentUser = user;

      // Initial permitted artifact deep link
      await artifactRes.ResolveArtifactPermissions();
      expect(artifactRes.AccessDeniedMessage).toBeNull();

      // After revocation, ResolveArtifactPermissions sets AccessDeniedMessage cleanly
      await artifactRes.ResolveArtifactPermissions();
      expect(artifactRes.AccessDeniedMessage).toContain('permission');
      expect(artifactRes.CanEdit).toBe(false);
      expect(artifactRes.CanShare).toBe(false);
      expect(artifactRes.CanRead).toBe(false);
      expect(artifactRes.IsPermissionResolved).toBe(true);
    });

    it('CR-5: ArtifactResource fails closed while loading and when permission check throws an error', async () => {
      const artifactRes = Object.create(ArtifactResource.prototype) as ArtifactResource;
      const user = createTestUser('recipient-2', 'Recipient Two');

      let rejectGql!: (err: Error) => void;
      const pendingPromise = new Promise<never>((_resolve, reject) => {
        rejectGql = reject;
      });
      const fakeGqlProvider = {
        CurrentUser: user,
        ExecuteGQL: vi.fn(() => pendingPromise),
      };
      Reflect.set(artifactRes, 'cdr', { markForCheck: vi.fn() });
      Object.defineProperty(artifactRes, 'ProviderToUse', {
        get: () => fakeGqlProvider as Partial<IMetadataProvider> as IMetadataProvider,
        configurable: true,
      });
      artifactRes.CurrentUser = user;
      artifactRes.artifactId = 'art-err-1';

      const inFlight = artifactRes.ResolveArtifactPermissions();
      // While permission check is still loading, CanRead & IsPermissionResolved MUST remain false (fail closed)
      expect(artifactRes.IsPermissionResolved).toBe(false);
      expect(artifactRes.CanRead).toBe(false);

      // Even if fallback ArtifactPermissionEngine throws after GQL fails, catch block fails closed
      rejectGql(new Error('Network error'));
      await inFlight;
      expect(artifactRes.IsPermissionResolved).toBe(true);
      expect(artifactRes.CanRead).toBe(false);
      expect(artifactRes.CanEdit).toBe(false);
      expect(artifactRes.CanShare).toBe(false);
      expect(artifactRes.AccessDeniedMessage).toBeTruthy();

      // Template must gate <mj-artifact-viewer-panel> on IsPermissionResolved && CanRead
      const artifactTs = readFileSync(resolve(__dirname, '../artifact-resource.component.ts'), 'utf8');
      expect(artifactTs).toContain('IsPermissionResolved && CanRead');
    });

    it('CR-5: ChatConversationsResource does NOT bind non-owned cached SelectedConversation synchronously before VerifyConversationAccess resolves and fails closed on error', async () => {
      const chatRes = Object.create(ChatConversationsResource.prototype) as ChatConversationsResource;
      const nonOwnedCached = createConversationStub({
        ID: 'conv-cached-shared',
        UserID: 'owner-1',
        Name: 'Cached Shared Thread',
      });
      const resInternals = chatRes as Partial<ChatConversationsResource> as TestChatResourceHarness & {
        selectConversation: (id: string, verifyRemote?: boolean) => Promise<void>;
      };

      let rejectVerify!: (err: Error) => void;
      const verifyPromise = new Promise<MJConversationEntity | null>((_resolve, reject) => {
        rejectVerify = reject;
      });
      resInternals.engine = {
        GetConversation: () => nonOwnedCached,
        VerifyConversationAccess: vi.fn(() => verifyPromise),
      };
      resInternals.bridge = { SetActiveFromWorkspace: vi.fn() };
      resInternals.cdr = { detectChanges: vi.fn() };
      resInternals.applyAgentParam = vi.fn();
      chatRes.CurrentUser = createTestUser('recipient-2', 'Recipient Two');

      const pendingSelect = resInternals.selectConversation('conv-cached-shared', false);
      // Synchronously before verification resolves, SelectedConversation MUST remain null
      expect(chatRes.SelectedConversation).toBeNull();

      // If VerifyConversationAccess rejects, fail closed with access denied message
      rejectVerify(new Error('Verification failed'));
      await pendingSelect;
      expect(chatRes.SelectedConversationId).toBeNull();
      expect(chatRes.SelectedConversation).toBeNull();
      expect(chatRes.ConversationAccessDeniedMessage).toContain('permission');
    });
  });

  // =========================================================================
  // 4. Strict --mj-* Design Token Compliance Across Touched Angular Files
  // =========================================================================
  describe('Design token compliance (--mj-* only, zero hardcoded color literals)', () => {
    it('contains zero raw hex, rgb(), rgba(), or hsl() color literals in new/touched Angular styles & templates', () => {
      const filesToAudit = [
        '../../../../../../Generic/conversations/src/lib/components/share/share-modal.component.ts',
        '../../../../../../Generic/conversations/src/lib/components/artifact/artifact-share-modal.component.css',
        '../../../../../../Generic/conversations/src/lib/components/library/library-workspace.component.css',
        '../../../../../../Generic/conversations/src/lib/components/library/library-workspace.component.html',
        '../../../../../../Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.css',
        '../../../../../../Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.html',
        '../artifact-resource.component.ts',
      ];
      const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g;

      for (const rel of filesToAudit) {
        const content = readFileSync(resolve(__dirname, rel), 'utf8');
        const matches = content.match(rawColorPattern) ?? [];
        expect(matches, `Expected zero hardcoded color literals in ${rel}`).toEqual([]);
      }
    });
  });
});
