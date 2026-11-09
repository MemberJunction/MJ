import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import {
  LibraryExternalRouteParams,
  LibraryHostNavigationEvent,
  LibrarySurfaceMode,
  LibraryWorkspaceComponent,
  LibraryWorkspaceState,
} from '@memberjunction/ng-conversations';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
  BuildLibraryAgentClientTools,
  BuildLibraryAgentContext,
} from './library-agent-context';

/**
 * Top-level Explorer resource surface for the **Library** application (`DriverClass: 'LibraryResource'`).
 *
 * Wraps the Router-free `<mj-library-workspace>` widget from `@memberjunction/ng-conversations`
 * and wires Explorer shell concerns:
 * - Bidirectional URL query parameter synchronization (`mode`, `tab`, `section`, `collectionId`,
 *   `driveId`, `folder`, `artifactId`, `version`, `canvas`, `q`)
 * - Tab title updates (`NotifyDisplayNameChanged`)
 * - Shell load lifecycle (`NotifyLoadComplete`)
 * - Bounded agent context + interactive client tools (`SetAgentContext` / `SetAgentClientTools`)
 * - Outbound navigation to Entity Records and Chat Conversations (`NavigationService`)
 */
@RegisterClass(BaseResourceComponent, 'LibraryResource')
@Component({
  standalone: false,
  selector: 'mj-library-resource',
  template: `
    @if (CurrentUser) {
      <mj-library-workspace
        #workspace
        [CurrentUser]="CurrentUser"
        [EnvironmentId]="EnvironmentId"
        [InitialMode]="DefaultSurfaceMode"
        [InitialDriveMode]="StartInDriveMode"
        (StateChange)="OnWorkspaceStateChange($event)"
        (HostNavigate)="OnHostNavigate($event)"
        (LoadComplete)="OnWorkspaceLoadComplete()"
      ></mj-library-workspace>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
      }
    `,
  ],
})
export class LibraryResource extends BaseResourceComponent implements OnInit, OnDestroy {
  @ViewChild('workspace') public Workspace?: LibraryWorkspaceComponent;

  public CurrentUser: UserInfo | null = null;
  public DefaultSurfaceMode: LibrarySurfaceMode | null = null;
  public StartInDriveMode = false;

  private latestState: LibraryWorkspaceState | null = null;
  private pendingRouteParams: LibraryExternalRouteParams | null = null;
  private isApplyingExternalParams = false;
  private hasNotifiedLoadComplete = false;
  private hasHydratedOnce = false;

  private readonly appManager = inject(ApplicationManager);

  public override ngOnInit(): void {
    super.ngOnInit();
    this.CurrentUser = this.ProviderToUse.CurrentUser;
    this.captureInitialRouteParams();
    this.registerAgentTools();
  }

  public override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  public get EnvironmentId(): string {
    const cfgEnv = this.Data?.Configuration?.['environmentId'];
    return typeof cfgEnv === 'string' && cfgEnv.length > 0
      ? cfgEnv
      : MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  public OnWorkspaceLoadComplete(): void {
    this.hasHydratedOnce = true;
    if (this.pendingRouteParams && this.Workspace) {
      this.isApplyingExternalParams = true;
      try {
        this.Workspace.ApplyExternalRouteState(this.pendingRouteParams);
      } finally {
        this.isApplyingExternalParams = false;
        this.pendingRouteParams = null;
      }
    }
    if (!this.hasNotifiedLoadComplete) {
      this.hasNotifiedLoadComplete = true;
      this.NotifyLoadComplete();
    }
  }

  public OnWorkspaceStateChange(state: LibraryWorkspaceState): void {
    this.latestState = state;
    this.navigationService.SetAgentContext(this, BuildLibraryAgentContext(state));
    this.updateTabDisplayName(state);

    if (!this.isApplyingExternalParams && (this.hasHydratedOnce || this.hasNonDefaultState(state))) {
      this.pushStateToUrl(state);
    }
  }

  public async OnHostNavigate(event: LibraryHostNavigationEvent): Promise<void> {
    if (event.Kind === 'entity-record' && event.EntityName && event.CompositeKey) {
      this.navigationService.OpenEntityRecord(event.EntityName, event.CompositeKey);
      return;
    }

    if (event.Kind === 'conversation' && event.ConversationId) {
      await this.openConversationInChatApp(
        event.ConversationId,
        event.ArtifactId,
        event.VersionNumber,
      );
    }
  }

  protected override OnQueryParamsChanged(
    params: Record<string, string>,
    _source: 'popstate' | 'deeplink',
  ): void {
    const mapped: LibraryExternalRouteParams = {
      mode: params['mode'] ?? null,
      tab: params['tab'] ?? null,
      section: params['section'] ?? null,
      collectionId: params['collectionId'] ?? null,
      driveId: params['driveId'] ?? null,
      folder: params['folder'] ?? null,
      artifactId: params['artifactId'] ?? null,
      version: params['version'] ?? params['versionNumber'] ?? null,
      canvas: params['canvas'] ?? null,
      q: params['q'] ?? '',
    };

    if (!this.Workspace) {
      this.pendingRouteParams = mapped;
      return;
    }

    this.isApplyingExternalParams = true;
    try {
      this.Workspace.ApplyExternalRouteState(mapped);
    } finally {
      this.isApplyingExternalParams = false;
    }
  }

  public override async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return data?.Name || 'Library';
  }

  public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-book-open';
  }

  private captureInitialRouteParams(): void {
    const query = this.GetQueryParams();
    const cfg = this.Data?.Configuration ?? {};

    const pickStr = (key: string): string | null => {
      const qVal = query[key];
      if (typeof qVal === 'string' && qVal.length > 0) return qVal;
      const cVal = cfg[key];
      return typeof cVal === 'string' && cVal.length > 0 ? cVal : null;
    };

    const initialVersion =
      query['version'] ??
      query['versionNumber'] ??
      (typeof cfg['version'] === 'number' || typeof cfg['version'] === 'string'
        ? String(cfg['version'])
        : typeof cfg['versionNumber'] === 'number' || typeof cfg['versionNumber'] === 'string'
          ? String(cfg['versionNumber'])
          : null);

    const mapped: LibraryExternalRouteParams = {
      mode: pickStr('mode'),
      tab: pickStr('tab'),
      section: pickStr('section'),
      collectionId: pickStr('collectionId'),
      driveId: pickStr('driveId'),
      folder: pickStr('folder'),
      artifactId: pickStr('artifactId'),
      version: initialVersion,
      canvas: pickStr('canvas'),
      q: pickStr('q'),
    };

    const hasAnyParam = Object.values(mapped).some((v) => v !== null && v !== undefined && v !== '');
    if (hasAnyParam) {
      this.pendingRouteParams = mapped;
    }
  }

  private hasNonDefaultState(state: LibraryWorkspaceState): boolean {
    return Boolean(
      state.CollectionId ||
        state.DriveId ||
        state.ActiveArtifactId ||
        state.SearchQuery ||
        state.HubTab !== 'overview',
    );
  }

  private pushStateToUrl(state: LibraryWorkspaceState): void {
    const nextParams: Record<string, string | null> = {
      mode: state.Mode === 'navigator' ? 'navigator' : null,
      tab: state.Mode === 'hub' && state.HubTab !== 'overview' ? state.HubTab : null,
      section:
        state.Mode === 'navigator' &&
        state.NavigatorSection !== 'all' &&
        state.NavigatorSection !== 'collection' &&
        state.NavigatorSection !== 'drive'
          ? state.NavigatorSection
          : null,
      collectionId: state.CollectionId || null,
      driveId: state.DriveId || null,
      folder: state.DriveId && state.DriveFolderPrefix ? state.DriveFolderPrefix : null,
      artifactId: state.ActiveArtifactId || null,
      version:
        state.ActiveArtifactId && state.ActiveVersionNumber
          ? String(state.ActiveVersionNumber)
          : null,
      canvas: state.ActiveArtifactId && state.IsFullCanvasOpen ? '1' : null,
      q: state.SearchQuery.trim() ? state.SearchQuery.trim() : null,
    };

    this.UpdateQueryParams(nextParams);
  }

  private updateTabDisplayName(state: LibraryWorkspaceState): void {
    if (state.ActiveArtifactName) {
      this.NotifyDisplayNameChanged(state.ActiveArtifactName);
      return;
    }
    if (state.CollectionName) {
      this.NotifyDisplayNameChanged(state.CollectionName);
      return;
    }
    if (state.DriveName) {
      this.NotifyDisplayNameChanged(state.DriveName);
      return;
    }
    this.NotifyDisplayNameChanged('Library');
  }

  private registerAgentTools(): void {
    const tools = BuildLibraryAgentClientTools({
      GetState: () => this.latestState,
      SwitchMode: (mode) => this.Workspace?.SwitchSurfaceMode(mode),
      SwitchHubTab: (tab) => this.Workspace?.SwitchHubTab(tab),
      OpenCollectionById: (collectionId) => this.Workspace?.OpenCollectionById(collectionId),
      OpenArtifactById: (artifactId, splitView) =>
        this.Workspace?.OpenArtifactStudio(artifactId, {
          forceNavigatorSplit: splitView,
          fullCanvas: !splitView,
        }),
      SetSearchQuery: (query) => this.Workspace?.SetSearchQuery(query),
      SetCategoryFilter: (category) => this.Workspace?.SetCategoryFilter(category),
      OpenConnectedDrive: (accountId, folderPrefix) =>
        this.Workspace?.OpenConnectedDrive(accountId, folderPrefix),
    });

    this.navigationService.SetAgentClientTools(this, tools);
  }

  private async openConversationInChatApp(
    conversationId: string,
    artifactId?: string,
    versionNumber?: number,
  ): Promise<void> {
    const queryParams: Record<string, string> = { conversationId };
    if (artifactId) {
      queryParams['artifactId'] = artifactId;
    }
    if (versionNumber !== undefined) {
      queryParams['versionNumber'] = String(versionNumber);
    }

    const apps: BaseApplication[] = await firstValueFrom(this.appManager.Applications).catch(
      () => [],
    );
    for (const app of apps) {
      const navItems = await app.GetNavItems();
      const convNav = navItems.find(
        (item) =>
          (item.DriverClass === 'ChatConversationsResource' || item.Label === 'Conversations') &&
          (item.Status ?? 'Active') === 'Active',
      );
      if (convNav) {
        await this.navigationService.SwitchToApp(app.ID, convNav.Label, queryParams);
        return;
      }
    }

    await this.navigationService.OpenNavItemByName(
      'Conversations',
      { conversationId, artifactId, versionNumber },
      undefined,
      { queryParams },
    );
  }
}

/**
 * Higher-priority backward-compatibility registration for saved workspace tabs referencing
 * the legacy `FileBrowserResource` driver class — opens the unified `Library` workspace
 * focused directly on Connected Drives.
 */
@RegisterClass(BaseResourceComponent, 'FileBrowserResource', 10)
@Component({
  standalone: false,
  selector: 'mj-library-drive-resource',
  template: `
    @if (CurrentUser) {
      <mj-library-workspace
        #workspace
        [CurrentUser]="CurrentUser"
        [EnvironmentId]="EnvironmentId"
        [InitialDriveMode]="true"
        (StateChange)="OnWorkspaceStateChange($event)"
        (HostNavigate)="OnHostNavigate($event)"
        (LoadComplete)="OnWorkspaceLoadComplete()"
      ></mj-library-workspace>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
      }
    `,
  ],
})
export class LibraryDriveResource extends LibraryResource {
  public constructor() {
    super();
    this.StartInDriveMode = true;
  }
}
