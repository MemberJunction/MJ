import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const registeredClasses = vi.hoisted(
  () => [] as Array<{ baseClass: unknown; key?: string; priority?: number }>,
);

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  HostListener: () => () => undefined,
  ChangeDetectorRef: class {},
  ViewEncapsulation: { None: 0 },
  inject: vi.fn(() => undefined),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass:
      (baseClass: unknown, key?: string, priority?: number) => (target: Function) => {
        registeredClasses.push({ baseClass, key, priority });
        return target;
      },
  };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public Data: Record<string, unknown> | null = null;
    protected navigationService: Record<string, unknown> = {};
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

vi.mock('@memberjunction/ng-conversations', () => ({
  ConversationChatAreaComponent: class {},
  ConversationListComponent: class {},
  ConversationStreamingService: class {},
  ActiveTasksService: class {},
  UICommandHandlerService: class {},
  ConversationBridgeService: class {},
  MentionAutocompleteService: { Instance: {} },
  TasksFullViewComponent: class {},
  LibraryWorkspaceComponent: class {},
  BuildConversationTasksFilter: vi.fn(
    async () => "ParentID IS NULL AND (UserID = 'u-42' OR ConversationDetailID IN ('cd-1'))",
  ),
}));

vi.mock('@memberjunction/ng-composer', () => ({}));
vi.mock('@memberjunction/ai-core-plus', () => ({}));
vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: { Instance: { CreateSimpleNotification: vi.fn() } },
}));
vi.mock('@memberjunction/ng-artifacts', () => ({
  AnalyzeArtifactService: class {},
  InteractiveFormApplyService: class {},
}));
vi.mock('@memberjunction/ai-engine-base', () => ({ AIEngineBase: { Instance: {} } }));

import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import type { LibraryWorkspaceState, SearchResult } from '@memberjunction/ng-conversations';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ArtifactResource } from '../lib/resource-wrappers/artifact-resource.component';
import { ChatCollectionsResource } from '../lib/resource-wrappers/chat-collections-resource.component';
import { ChatConversationsResource } from '../lib/resource-wrappers/chat-conversations-resource.component';
import { ChatTasksResource } from '../lib/resource-wrappers/chat-tasks-resource.component';
import { LibraryDriveResource, LibraryResource } from '../lib/resource-wrappers/library-resource.component';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LibraryResource, ChatCollectionsResource & FileBrowserResource isolation', () => {
  it('registers LibraryResource and ChatCollectionsResource without overriding FileBrowserResource', () => {
    expect(LibraryDriveResource).toBeDefined();
    const keys = registeredClasses
      .filter((r) => r.baseClass === BaseResourceComponent)
      .map((r) => r.key);
    expect(keys).toContain('LibraryResource');
    expect(keys).toContain('ChatCollectionsResource');
    expect(keys).not.toContain('FileBrowserResource');
  });

  it('defaults ChatCollectionsResource to navigator mode on the collections section', () => {
    const collectionsRes = new ChatCollectionsResource();
    expect(collectionsRes.DefaultSurfaceMode).toBe('navigator');
    expect(collectionsRes.DefaultNavigatorSection).toBe('collections');
  });

  it('does not clobber incoming URL query params on cold mount before OnWorkspaceLoadComplete hydrates', () => {
    const resource = new LibraryResource();
    const pushedParams: Array<Record<string, string | null>> = [];
    const appliedExternal: unknown[] = [];

    Object.assign(resource as object, {
      navigationService: {
        SetAgentContext: vi.fn(),
        SetAgentClientTools: vi.fn(),
      },
      GetQueryParams: () => ({ collectionId: 'col-99', artifactId: 'art-77' }),
      UpdateQueryParams: (p: Record<string, string | null>) => pushedParams.push(p),
      Workspace: {
        ApplyExternalRouteState: (p: unknown) => appliedExternal.push(p),
      },
    });
    Object.defineProperty(resource, 'ProviderToUse', {
      configurable: true,
      get: () => ({ CurrentUser: { ID: 'u-1', Name: 'Tester' } }) as unknown as IMetadataProvider,
    });

    resource.ngOnInit();

    const preHydrationState: LibraryWorkspaceState = {
      Mode: 'navigator',
      HubTab: 'overview',
      NavigatorSection: 'all',
      CollectionId: null,
      CollectionName: null,
      DriveId: null,
      DriveName: null,
      DriveFolderPrefix: '',
      ActiveArtifactId: null,
      ActiveArtifactName: null,
      ActiveVersionNumber: null,
      IsFullCanvasOpen: false,
      SearchQuery: '',
      CategoryFilter: 'all',
      OwnershipFilter: 'all',
      VisibleItems: [],
      Collections: [],
      ConnectedDrives: [],
    };

    // Emitting state before OnWorkspaceLoadComplete must NOT push empty query params to URL
    resource.OnWorkspaceStateChange(preHydrationState);
    expect(pushedParams).toHaveLength(0);

    // Completing load applies pending route params first, then enables URL sync
    resource.OnWorkspaceLoadComplete();
    expect(appliedExternal).toHaveLength(1);
    expect(appliedExternal[0]).toMatchObject({
      collectionId: 'col-99',
      artifactId: 'art-77',
    });

    resource.OnWorkspaceStateChange({
      ...preHydrationState,
      NavigatorSection: 'collection',
      CollectionId: 'col-99',
      ActiveArtifactId: 'art-77',
      ActiveVersionNumber: 2,
    });
    expect(pushedParams).toHaveLength(1);
    expect(pushedParams[0]).toMatchObject({
      collectionId: 'col-99',
      artifactId: 'art-77',
      version: '2',
    });
  });
});

describe('ChatTasksResource (Agent Activity) filter & cold-mount URL handling', () => {
  it('includes ParentID IS NULL and UserID in both AgentActivityBaseFilter and ResolveAgentActivityFilter', async () => {
    const resource = Object.create(ChatTasksResource.prototype) as ChatTasksResource;
    Object.assign(resource as object, {
      CurrentUser: { ID: 'u-42' } as UserInfo,
    });
    Object.defineProperty(resource, 'ProviderToUse', {
      configurable: true,
      get: () =>
        ({
          EntityByName: (name: string) =>
            name === 'MJ: Tasks'
              ? ({ SchemaName: '__mj', BaseView: 'vwTasks' } as EntityInfo)
              : undefined,
        }) as Partial<IMetadataProvider> as IMetadataProvider,
    });

    expect(resource.AgentActivityBaseFilter).toContain('ParentID IS NULL');
    expect(resource.AgentActivityBaseFilter).toContain("UserID = 'u-42'");

    const resolved = await resource.ResolveAgentActivityFilter();
    expect(resolved).toContain("ParentID IS NULL AND (UserID = 'u-42'");
    expect(resolved).toContain("AND (UserID = 'u-42' OR ConversationDetailID IS NOT NULL");
  });

  it('does not rewrite query params on cold mount when taskId is absent or already in URL', () => {
    const resource = Object.create(ChatTasksResource.prototype) as ChatTasksResource;
    const updateSpy = vi.fn();
    Object.assign(resource as object, {
      Data: { Configuration: {} },
      GetQueryParams: () => ({ taskId: 'task-url-1' }),
      UpdateQueryParams: updateSpy,
      NotifyLoadComplete: vi.fn(),
    });
    Object.defineProperty(resource, 'ProviderToUse', {
      configurable: true,
      get: () => ({ CurrentUser: { ID: 'u-42' } }) as unknown as IMetadataProvider,
    });

    resource.ngOnInit();
    expect(resource.activeTaskId).toBe('task-url-1');
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('ChatConversationsResource — DriverClass-based routing across appManager.Applications', () => {
  it('routes collection links and task search hits by DriverClass even when apps use custom names', async () => {
    const resource = Object.create(ChatConversationsResource.prototype) as ChatConversationsResource;
    const switchToApp = vi.fn(async () => undefined);
    const customApps = [
      {
        ID: 'app-custom-workspace',
        Name: 'Assistant Workspace',
        GetNavItems: async () => [
          { Label: 'Threads', DriverClass: 'ChatConversationsResource', Status: 'Active' },
          { Label: 'Workflow Runs', DriverClass: 'ChatTasksResource', Status: 'Active' },
        ],
      },
      {
        ID: 'app-custom-docs',
        Name: 'Knowledge Studio',
        GetNavItems: async () => [
          { Label: 'Studio Home', DriverClass: 'LibraryResource', Status: 'Active' },
        ],
      },
    ];

    Object.assign(resource as object, {
      IsSearchPanelOpen: true,
      navigationService: {
        SwitchToApp: switchToApp,
        OpenNavItemByName: vi.fn(async () => null),
        appManager: {
          GetAllApps: () => customApps,
          Applications: new BehaviorSubject(customApps),
        },
      },
    });

    // Collection link resolves to Knowledge Studio (LibraryResource) when ChatCollectionsResource isn't in Chat
    resource.OnArtifactLinkClicked({
      type: 'collection',
      id: 'col-55',
      artifactId: 'art-88',
      versionNumber: 4,
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(switchToApp).toHaveBeenCalledWith('app-custom-docs', 'Studio Home', {
      collectionId: 'col-55',
      artifactId: 'art-88',
      version: '4',
    });

    switchToApp.mockClear();

    // Task search result resolves to Assistant Workspace -> Workflow Runs via ChatTasksResource
    const taskHit: SearchResult = {
      id: 'task-99',
      type: 'task',
      title: 'Quarterly Forecast DAG',
      preview: 'Completed 4 steps',
      createdAt: new Date('2026-11-09T00:00:00Z'),
      relevanceScore: 10,
    };
    resource.OnSearchResultSelected(taskHit);
    await new Promise((r) => setTimeout(r, 10));

    expect(switchToApp).toHaveBeenCalledWith('app-custom-workspace', 'Workflow Runs', {
      taskId: 'task-99',
    });
  });
});

describe('ArtifactResource — viewer-scoped permission resolution', () => {
  it('defaults CanEdit and CanShare to false and resolves permissions via ArtifactPermissionEngine', async () => {
    const resolveSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
      ArtifactID: 'art-readonly-1',
      CanRead: true,
      CanEdit: false,
      CanDelete: false,
      CanShare: true,
      Source: 'ArtifactPermission',
      Reason: 'Granted via direct artifact permission',
    });

    const resource = new ArtifactResource();
    expect(resource.CanEdit).toBe(false);
    expect(resource.CanShare).toBe(false);

    Object.assign(resource as object, {
      Data: { ResourceRecordID: 'art-readonly-1', Configuration: {} },
      NotifyLoadComplete: vi.fn(),
    });
    Object.defineProperty(resource, 'ProviderToUse', {
      configurable: true,
      get: () =>
        ({
          CurrentUser: { ID: 'u-reader', Name: 'Reader' },
        }) as unknown as IMetadataProvider,
    });

    resource.ngOnInit();
    await new Promise((r) => setTimeout(r, 10));

    expect(resolveSpy).toHaveBeenCalledWith(
      expect.anything(),
      'art-readonly-1',
      expect.objectContaining({ ID: 'u-reader' }),
    );
    expect(resource.CanEdit).toBe(false);
    expect(resource.CanShare).toBe(true);
  });
});
