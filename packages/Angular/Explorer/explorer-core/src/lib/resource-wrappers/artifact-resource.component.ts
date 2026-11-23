import { ChangeDetectorRef, Component, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { CompositeKey, DataSnapshot, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
  ArtifactPermissionEngine,
  MJArtifactEntity,
  MJConversationArtifactEntity,
  MJEnvironmentEntityExtended,
  ResourceData,
} from '@memberjunction/core-entities';
import { AnalyzeArtifactService, InteractiveFormApplyService, NavigationRequest } from '@memberjunction/ng-artifacts';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { FormAgentContext } from '@memberjunction/ng-base-forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';

interface GqlArtifactPermissionsResult {
  ResolveArtifactUserPermissions?: { CanRead?: boolean; CanEdit?: boolean; CanShare?: boolean };
  ResolveArtifactPermissions?: { CanRead?: boolean; CanEdit?: boolean; CanShare?: boolean };
}

interface GqlCapableProvider {
  ExecuteGQL(
    query: string,
    variables?: Record<string, string | number | boolean | null>,
  ): Promise<GqlArtifactPermissionsResult>;
}

function isGqlCapableProvider(provider: IMetadataProvider | null | undefined): provider is IMetadataProvider & GqlCapableProvider {
  return typeof (provider as Partial<GqlCapableProvider> | null | undefined)?.ExecuteGQL === 'function';
}

/**
 * Artifact Resource - displays versioned content artifacts
 * Wraps the artifact-viewer-panel component for tab-based display
 * Supports reports, dashboards, forms, and other artifact types
 */
@RegisterClass(BaseResourceComponent, 'ArtifactResource')
@Component({
  standalone: false,
  selector: 'mj-artifact-resource',
  template: `
    <div class="artifact-container">
      @if (AccessDeniedMessage) {
        <div class="artifact-access-denied" data-testid="artifact-access-denied">
          <mj-empty-state
            Icon="fa-solid fa-lock"
            Title="Access Denied"
            [Message]="AccessDeniedMessage" />
        </div>
      } @else if (currentUser && artifactId && IsPermissionResolved && CanRead) {
        <mj-artifact-viewer-panel
          [artifactId]="artifactId"
          [currentUser]="currentUser"
          [environmentId]="environmentId"
          [VersionNumber]="VersionNumber"
          [showSaveToCollection]="true"
          [canShare]="CanShare"
          [canEdit]="CanEdit"
          (analyzeRequested)="onAnalyzeRequested($event)"
          (applyFormRequested)="onApplyFormRequested($event)"
          (openEntityRecord)="OnOpenEntityRecord($event)"
          (navigationRequest)="OnNavigationRequest($event)">
        </mj-artifact-viewer-panel>
      }
    </div>
    `,
  styles: [`
    .artifact-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .artifact-access-denied {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      padding: var(--mj-space-6);
      background: var(--mj-bg-surface);
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ArtifactResource extends BaseResourceComponent implements OnDestroy {
  private readonly analyzeService = inject(AnalyzeArtifactService);
  private readonly applyService = inject(InteractiveFormApplyService);
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });
  private permissionRequestSeq = 0;
  private loadCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  public VersionNumber: number | undefined = undefined;

  /**
   * Apply-to-my-form handler — see InteractiveFormApplyService. Routes a whole form to
   * the override actions and a form panel to the contribution actions.
   *
   * When the agent context names an open record form (`AdditionalContext.Form`), the service
   * reads that form's full composition from the `FormCompositionRegistry`, to validate a
   * panel's placement and spot an installed contribution with the same key before writing
   * anything.
   */
  async OnApplyFormRequested(event: { spec: ComponentSpec; entityName: string }): Promise<void> {
    const additional = (this.navigationService.AppContextSnapshot$.value?.AdditionalContext ?? null) as
      { Form?: FormAgentContext } | null;
    await this.applyService.ConfirmAndApply(
      event.spec,
      event.entityName,
      this.ProviderToUse,
      additional?.Form ?? null,
    );
  }

  /** @deprecated Use {@link OnApplyFormRequested}. */
  async onApplyFormRequested(event: { spec: ComponentSpec; entityName: string }): Promise<void> {
    return this.OnApplyFormRequested(event);
  }

  public CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  private _artifactId = '';
  public get artifactId(): string {
    return this._artifactId;
  }
  public set artifactId(value: string) {
    const next = value ?? '';
    if (next !== this._artifactId) {
      this._artifactId = next;
      this.CanEdit = false;
      this.CanShare = false;
      this.CanRead = false;
      this.IsPermissionResolved = false;
      this.AccessDeniedMessage = null;
      if (this.CurrentUser && this._artifactId) {
        void this.ResolveArtifactPermissions();
      }
    }
  }

  public CanRead = false;
  public IsPermissionResolved = false;
  public CanEdit = false;
  /** @deprecated Use {@link CanEdit}. */
  public get canEdit(): boolean {
    return this.CanEdit;
  }
  /** @deprecated Use {@link CanEdit}. */
  public set canEdit(value: boolean) {
    this.CanEdit = value;
  }

  public CanShare = false;
  /** Non-null when the current user lacks read permission (e.g., revoked deep link). */
  public AccessDeniedMessage: string | null = null;
  /** @deprecated Use {@link CanShare}. */
  public get canShare(): boolean {
    return this.CanShare;
  }
  /** @deprecated Use {@link CanShare}. */
  public set canShare(value: boolean) {
    this.CanShare = value;
  }

  public EnvironmentId: string = '';

  /** @deprecated Use {@link EnvironmentId}. */
  public get environmentId(): string {
    return this.EnvironmentId;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  public set environmentId(value: string) {
    this.EnvironmentId = value;
  }

  ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.CurrentUser = md.CurrentUser;

    // Environment ID — use the configured environment if present, otherwise
    // fall back to the default environment. Must be a valid UUID since
    // downstream saves (e.g. AnalyzeArtifactService creating artifacts)
    // require a non-empty EnvironmentID.
    this.EnvironmentId = (this.Data?.Configuration?.['environmentId'] as string | undefined)
        || MJEnvironmentEntityExtended.DefaultEnvironmentID;

    // Get version number if explicitly configured or passed via query params ('latest' keeps undefined)
    const rawVersion =
      this.GetQueryParams()['version'] ??
      this.GetQueryParams()['versionNumber'] ??
      this.Data?.Configuration?.['version'] ??
      this.Data?.Configuration?.['versionNumber'];
    const parsedVersion = typeof rawVersion === 'number'
      ? rawVersion
      : typeof rawVersion === 'string' && rawVersion.trim().toLowerCase() !== 'latest'
        ? Number.parseInt(rawVersion, 10)
        : NaN;
    this.VersionNumber = Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : undefined;

    // Get artifact ID from resource data (setter triggers ResolveArtifactPermissions)
    if (this.Data && this.Data.ResourceRecordID) {
      this.artifactId = this.Data.ResourceRecordID;
    } else {
      this.CanEdit = false;
      this.CanShare = false;
    }

    this.loadCompleteTimer = setTimeout(() => {
      this.loadCompleteTimer = null;
      this.NotifyLoadComplete();
    }, 100);
  }

  override ngOnDestroy(): void {
    if (this.loadCompleteTimer != null) {
      clearTimeout(this.loadCompleteTimer);
      this.loadCompleteTimer = null;
    }
    super.ngOnDestroy();
  }

  /**
   * Resolves viewer-scoped `CanEdit` and `CanShare` permissions for the active `artifactId`,
   * consulting the server's `ResolveArtifactUserPermissions` GraphQL query first (so server-only
   * `IArtifactPermissionDelegate` registrations are evaluated) with fallback to
   * `ArtifactPermissionEngine.Instance.ResolvePermissions`.
   */
  public async ResolveArtifactPermissions(): Promise<void> {
    const targetArtifactId = this._artifactId;
    const user = this.CurrentUser;
    this.CanEdit = false;
    this.CanShare = false;
    this.CanRead = false;
    this.IsPermissionResolved = false;

    if (!targetArtifactId || !user) {
      this.cdr?.markForCheck();
      return;
    }

    const reqId = (this.permissionRequestSeq ?? 0) + 1;
    this.permissionRequestSeq = reqId;
    this.AccessDeniedMessage = null;
    try {
      const perms = await this.fetchPermissionsFromServerOrFallback(targetArtifactId, user);
      if (reqId !== this.permissionRequestSeq || this._artifactId !== targetArtifactId) {
        return;
      }
      if (perms.CanRead !== true) {
        this.CanRead = false;
        this.CanEdit = false;
        this.CanShare = false;
        this.IsPermissionResolved = true;
        this.AccessDeniedMessage =
          'You do not have permission to view this artifact. Access may have been revoked by the owner.';
        return;
      }
      this.AccessDeniedMessage = null;
      this.CanRead = true;
      this.IsPermissionResolved = true;
      this.CanEdit = perms.CanEdit === true;
      this.CanShare = perms.CanShare === true;
    } catch {
      if (reqId === this.permissionRequestSeq) {
        this.CanRead = false;
        this.CanEdit = false;
        this.CanShare = false;
        this.IsPermissionResolved = true;
        this.AccessDeniedMessage =
          'Unable to verify your permission to view this artifact.';
      }
    } finally {
      if (reqId === this.permissionRequestSeq) {
        this.cdr?.markForCheck();
      }
    }
  }

  private async fetchPermissionsFromServerOrFallback(
    targetArtifactId: string,
    user: UserInfo,
  ): Promise<{ CanRead?: boolean; CanEdit?: boolean; CanShare?: boolean }> {
    const provider = this.ProviderToUse;
    if (isGqlCapableProvider(provider)) {
      try {
        const query = `
          query ResolveArtifactUserPermissions($artifactId: String!) {
            ResolveArtifactUserPermissions(artifactId: $artifactId) {
              ArtifactID
              CanRead
              CanEdit
              CanDelete
              CanShare
              Source
              Reason
            }
          }
        `;
        const gqlResult = await provider.ExecuteGQL(query, { artifactId: targetArtifactId });
        const resolved =
          gqlResult?.ResolveArtifactUserPermissions ?? gqlResult?.ResolveArtifactPermissions;
        if (resolved && (typeof resolved.CanRead === 'boolean' || typeof resolved.CanEdit === 'boolean')) {
          return resolved;
        }
      } catch (err) {
        LogError(
          `ArtifactResourceComponent: ResolveArtifactPermissions GraphQL query failed for '${targetArtifactId}', falling back to ArtifactPermissionEngine: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return ArtifactPermissionEngine.Instance.ResolvePermissions(
      this.ProviderToUse,
      targetArtifactId,
      user,
    );
  }

  /**
   * Handler for the Analyze button on the artifact viewer panel.
   * Creates a Data Snapshot artifact from the live viewer state, opens a
   * new conversation with it attached as input, and routes the user there.
   */
  async OnAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
    if (!this.CurrentUser) return;

    try {
      const result = await this.analyzeService.StartAnalysisConversation({
        snapshot: event.snapshot,
        currentUser: this.CurrentUser,
        environmentId: this.EnvironmentId,
      });

      // Route to the new conversation in the Conversations nav item
      await this.navigationService.OpenNavItemByName(
        'Conversations',
        { conversationId: result.conversationId },
        undefined,
        { queryParams: { conversationId: result.conversationId } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis conversation';
      MJNotificationService.Instance.CreateSimpleNotification(message, 'error', 5000);
    }
  }

  /** @deprecated Use {@link OnAnalyzeRequested}. */
  async onAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
    return this.OnAnalyzeRequested(event);
  }

  /**
   * Opens an entity record requested by the artifact, e.g. an interactive component's
   * OpenEntityRecord callback. Without this, record links in a standalone artifact tab do nothing.
   */
  OnOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  /**
   * Handles navigation requested by an artifact viewer plugin. Opens the requested artifact in its own
   * tab, or the target nav item (switching apps if needed) with its query params.
   */
  async OnNavigationRequest(event: NavigationRequest): Promise<void> {
    if (event.ArtifactID) {
      this.navigationService.OpenArtifact(event.ArtifactID, event.ArtifactName);
      return;
    }
    const appId = event.appName ? this.resolveAppID(event.appName) : undefined;
    await this.navigationService.OpenNavItemByName(event.navItemName, undefined, appId, {
      queryParams: event.queryParams
    });
  }

  private resolveAppID(appName: string): string | undefined {
    const app = this.ProviderToUse.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
    return app?.ID;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // Try to load artifact name from database
    if (data.ResourceRecordID) {
      try {
        const md = this.ProviderToUse;
        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', md.CurrentUser);
        if (await artifact.Load(data.ResourceRecordID)) {
          return artifact.Name || `Artifact - ${data.ResourceRecordID}`;
        }
        const legacy = await md.GetEntityObject<MJConversationArtifactEntity>('MJ: Conversation Artifacts', md.CurrentUser);
        if (await legacy.Load(data.ResourceRecordID)) {
          return legacy.Name || `Artifact - ${data.ResourceRecordID}`;
        }
      } catch (error) {
        console.error('Error loading artifact name:', error);
      }
    }
    return 'Artifact';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-file-code';
  }
}
