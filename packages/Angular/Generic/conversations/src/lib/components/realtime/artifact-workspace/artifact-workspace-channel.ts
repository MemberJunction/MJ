import type { Type } from '@angular/core';
import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import {
  REALTIME_CHANNEL_CONTRACT_VERSION,
  type RealtimeChannelActor,
  type RealtimeChannelDescriptor,
  type RealtimeChannelVerb,
} from '@memberjunction/ai-core-plus';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  MJArtifactEntity,
  MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ChannelFrameCapture } from '@memberjunction/ng-realtime-channels';
import {
  BaseRealtimeChannelClient,
  type ChannelOnboardingDetails,
  type ParsedDelegationArtifact,
  type RealtimeChannelVerbResult,
} from '@memberjunction/realtime-runtime';
import { ArtifactWorkspaceEngine } from './artifact-workspace-engine';
import {
  ARTIFACT_WORKSPACE_CHANNEL_KEY,
  ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS,
  DEFAULT_ARTIFACT_WORKSPACE_CONFIG,
  IsComponentArtifactDescriptor,
  type ArtifactWorkspaceConfig,
  type ArtifactWorkspaceOpenPayload,
  type ArtifactWorkspaceRecord,
} from './artifact-workspace-types';
import { RealtimeArtifactWorkspaceSurfaceComponent } from './realtime-artifact-workspace-surface.component';

const UUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function readString(bag: JSONObject, key: string): string | undefined {
  const value = bag[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(bag: JSONObject, key: string): number | undefined {
  const value = bag[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function failure(code: string, error: string, details?: string[]): RealtimeChannelVerbResult {
  return details
    ? { Success: false, ErrorCode: code, Error: error, Details: details }
    : { Success: false, ErrorCode: code, Error: error };
}

function parseArtifactWorkspaceConfig(raw?: JSONObject): ArtifactWorkspaceConfig {
  const cfg: ArtifactWorkspaceConfig = { ...DEFAULT_ARTIFACT_WORKSPACE_CONFIG };
  if (raw) {
    if (typeof raw['autoOpenDelegatedArtifacts'] === 'boolean') {
      cfg.AutoOpenDelegatedArtifacts = raw['autoOpenDelegatedArtifacts'];
    }
    if (typeof raw['swapToNewerVersions'] === 'boolean') {
      cfg.SwapToNewerVersions = raw['swapToNewerVersions'];
    }
    if (typeof raw['maxInstances'] === 'number') {
      cfg.MaxInstances = raw['maxInstances'];
    }
  }
  return cfg;
}

/**
 * The `ArtifactWorkspace` realtime channel: displays and focuses collaborative artifacts
 * (`Markdown Document`, `Excel Spreadsheet`, `Presentation`, `Whiteboard Diagram`, etc.)
 * beside a live co-agent conversation, and reacts automatically when delegated background
 * agents produce or revise artifacts.
 *
 * Strictly partitioned from `InteractiveComponent`, which owns React/Angular `Component`
 * artifacts and their derived spec methods.
 */
@RegisterClass(BaseRealtimeChannelClient, ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS)
export class ArtifactWorkspaceChannel extends BaseRealtimeChannelClient<RealtimeArtifactWorkspaceSurfaceComponent> {
  public readonly Engine = new ArtifactWorkspaceEngine(DEFAULT_ARTIFACT_WORKSPACE_CONFIG.MaxInstances);
  public Config: ArtifactWorkspaceConfig = { ...DEFAULT_ARTIFACT_WORKSPACE_CONFIG };
  private surface: RealtimeArtifactWorkspaceSurfaceComponent | null = null;
  private disposed = false;

  public get ChannelName(): string {
    return ARTIFACT_WORKSPACE_CHANNEL_KEY;
  }

  public override get InstanceId(): string {
    return 'all';
  }

  public override get TabTitle(): string {
    return 'Workspace';
  }

  public override get TabIcon(): string {
    return 'fa-solid fa-file-lines';
  }

  public override GetToolDefinitions(): RealtimeToolDefinition[] {
    return [];
  }

  public override GetOnboardingDetails(): ChannelOnboardingDetails {
    return {
      Heading: 'Artifact Workspace',
      Description:
        'Open and collaborate on live Docs, Spreadsheets, Slide Decks, and Whiteboards side-by-side with your co-agent.',
      Tips: [
        'Agents automatically surface newly created or updated Docs, Sheets, and Slides here.',
        'You and the agent see active document focus and edits in real time.',
      ],
      IconClass: 'fa-solid fa-file-lines',
    };
  }

  public override GetDescriptor(): RealtimeChannelDescriptor {
    const verbs: RealtimeChannelVerb[] = [
      {
        Name: 'focus',
        Description: 'Brings an already-open workspace artifact tab into the foreground.',
        ParametersSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID to focus.' },
          },
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
      {
        Name: 'show_version',
        Description: 'Switches an open workspace artifact tab to display another saved version.',
        ParametersSchema: {
          type: 'object',
          properties: {
            versionId: { type: 'string', description: 'Artifact version ID to display.' },
            versionNumber: { type: 'number', description: 'Optional version number.' },
          },
          required: ['versionId'],
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
      {
        Name: 'refresh',
        Description: 'Refreshes the active or named workspace artifact viewer after external mutations.',
        ParametersSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Artifact ID to refresh.' },
            versionNumber: { type: 'number', description: 'Latest version number if known.' },
          },
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
      {
        Name: 'close',
        Description: 'Closes an open workspace artifact tab.',
        ParametersSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
    ];

    return {
      Key: this.ChannelName,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: 'Artifact Workspace',
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions:
        'Shows collaborative Docs (Markdown Document), Spreadsheets (Excel Spreadsheet), Slide Decks (Presentation), ' +
        'and Whiteboards beside the conversation. Open with artifactId (or artifactVersionId); use focus, refresh, ' +
        'show_version, and close to manage workspace tabs. For Component artifacts, use InteractiveComponent instead.',
      Nouns: [
        {
          Name: 'artifacts',
          Description: 'The workspace artifacts currently open, plus activeInstanceId.',
          Schema: { type: 'object', additionalProperties: { type: 'object' } },
        },
      ],
      Verbs: verbs,
      Inputs: {
        type: 'object',
        properties: {
          artifactId: { type: 'string', description: 'ID of the collaborative artifact to open.' },
          artifactVersionId: { type: 'string', description: 'Optional specific artifact version ID.' },
          versionNumber: { type: 'number', description: 'Optional version number to show.' },
          name: { type: 'string', description: 'Optional display title.' },
          artifactTypeName: { type: 'string', description: 'Optional canonical artifact type name.' },
          driverClass: { type: 'string', description: 'Optional driver class name.' },
        },
        additionalProperties: false,
      },
      Events: [
        { Name: 'opened', Description: 'A workspace artifact tab was opened.' },
        { Name: 'focused', Description: 'A workspace artifact tab gained focus.' },
        { Name: 'version_changed', Description: 'A workspace tab switched to a different version.' },
        { Name: 'refreshed', Description: 'A workspace tab refreshed its rendered artifact.' },
        { Name: 'closed', Description: 'A workspace artifact tab was closed.' },
      ],
      DisplayPolicy: 'on-demand',
      DefaultAvailability: 'all-sessions',
      MaxExposure: 'pixels',
      MultiInstance: true,
    };
  }

  protected override OnInitialize(): void {
    this.Config = parseArtifactWorkspaceConfig(this.Context?.ChannelConfig);
    this.Engine.SetMaxInstances(this.Config.MaxInstances);
    if (ChannelFrameCapture.Instance.Capturer) {
      this.EnableVisualPerception({ GetLatestFrame: () => this.CaptureActiveFrame() });
    }
  }

  protected async CaptureActiveFrame(): Promise<string | null> {
    const capturer = ChannelFrameCapture.Instance.Capturer;
    if (
      !capturer ||
      this.Exposure !== 'pixels' ||
      !this.Context?.Client?.IsTrackEstablished('video', 'inbound')
    ) {
      return null;
    }
    const element = this.surface?.GetActiveElement() ?? null;
    if (!element) {
      return null;
    }
    try {
      return await capturer(element);
    } catch (error) {
      LogError(
        `[RealtimeChannel:${ARTIFACT_WORKSPACE_CHANNEL_KEY}] Frame capture failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  public override GetSurfaceComponent(): Type<RealtimeArtifactWorkspaceSurfaceComponent> {
    return RealtimeArtifactWorkspaceSurfaceComponent;
  }

  public override BindSurface(instance: RealtimeArtifactWorkspaceSurfaceComponent): void {
    this.surface = instance;
    instance.Engine = this.Engine;
    instance.AgentName = this.Context?.AgentName ?? 'The agent';
    instance.CurrentUser = this.Context?.Provider?.CurrentUser ?? null;
    const configuredEnvId = this.Context?.ChannelConfig?.['environmentId'];
    instance.EnvironmentID = typeof configuredEnvId === 'string' ? configuredEnvId : '';
    instance.OnUserSelected = (instanceId: string) => {
      this.EmitChannelEvent('focused', { instanceId, by: 'user' }, undefined, instanceId);
      this.RecordChange({ Author: 'user' });
      void this.NotifyVisualChange();
    };
    instance.OnUserClosed = (instanceId: string) => {
      this.EmitChannelEvent('closed', { instanceId, by: 'user' }, undefined, instanceId);
      this.RecordChange({ Author: 'user' });
    };
  }

  public override UnbindSurface(): void {
    this.surface = null;
  }

  public override Dispose(): void {
    this.disposed = true;
    this.surface = null;
    this.Engine.Dispose();
    super.Dispose();
  }

  public override SerializeState(): string | null {
    const instances = this.Engine.Instances.map((r) => ({
      ArtifactID: r.ArtifactID,
      ArtifactVersionID: r.ArtifactVersionID,
      VersionNumber: r.VersionNumber,
      Name: r.Name,
      ArtifactTypeName: r.ArtifactTypeName,
      DriverClass: r.DriverClass,
    }));
    if (instances.length === 0) {
      return null;
    }
    return JSON.stringify({
      activeArtifactId: this.Engine.Instances.find((r) => r.InstanceID === this.Engine.ActiveID)?.ArtifactID ?? null,
      instances,
    });
  }

  public override RestoreState(stateJson: string): boolean {
    try {
      const parsed = JSON.parse(stateJson) as {
        activeArtifactId?: string | null;
        instances?: ArtifactWorkspaceOpenPayload[];
      };
      if (!Array.isArray(parsed.instances) || parsed.instances.length === 0) {
        return false;
      }
      for (const item of parsed.instances) {
        if (item.ArtifactID && !IsComponentArtifactDescriptor(item.ArtifactTypeName, item.DriverClass)) {
          this.Engine.AddOrFocus(item);
        }
      }
      if (parsed.activeArtifactId) {
        const active = this.Engine.FindByArtifact(parsed.activeArtifactId);
        if (active) {
          this.Engine.SetActive(active.InstanceID);
        }
      }
      return this.Engine.Instances.length > 0;
    } catch {
      return false;
    }
  }

  public override GetState(): JSONObject {
    const artifacts: JSONObject = {};
    for (const record of this.Engine.Instances) {
      artifacts[record.InstanceID] = {
        artifactId: record.ArtifactID,
        artifactVersionId: record.ArtifactVersionID ?? null,
        versionNumber: record.VersionNumber ?? null,
        name: record.Name,
        artifactTypeName: record.ArtifactTypeName ?? null,
        driverClass: record.DriverClass ?? null,
        active: this.Engine.ActiveID === record.InstanceID,
      };
    }
    return {
      activeInstanceId: this.Engine.ActiveID,
      artifacts,
    };
  }

  protected override async OnOpen(inputs: JSONObject): Promise<RealtimeChannelVerbResult> {
    const suppliedArtifactId = readString(inputs, 'artifactId');
    const suppliedVersionId = readString(inputs, 'artifactVersionId');
    if (!suppliedArtifactId && !suppliedVersionId) {
      return failure(
        'invalid_params',
        'Provide artifactId or artifactVersionId to open a workspace artifact.',
      );
    }

    const suppliedType = readString(inputs, 'artifactTypeName');
    const suppliedDriver = readString(inputs, 'driverClass');
    if (IsComponentArtifactDescriptor(suppliedType, suppliedDriver)) {
      return failure(
        'use_interactive_component',
        'Component artifacts must be opened with InteractiveComponent rather than ArtifactWorkspace.',
      );
    }

    const resolved = await this.resolveArtifactMetadata({
      artifactId: suppliedArtifactId,
      artifactVersionId: suppliedVersionId,
      versionNumber: readNumber(inputs, 'versionNumber'),
      name: readString(inputs, 'name'),
      artifactTypeName: suppliedType,
      driverClass: suppliedDriver,
    });
    if ('Success' in resolved) {
      return resolved;
    }

    if (IsComponentArtifactDescriptor(resolved.ArtifactTypeName, resolved.DriverClass)) {
      return failure(
        'use_interactive_component',
        `"${resolved.Name}" is a Component artifact; open it via InteractiveComponent.`,
      );
    }

    const alreadyOpen = this.Engine.FindByArtifact(resolved.ArtifactID);
    const record = this.Engine.AddOrFocus(resolved);
    this.EmitChannelEvent(
      alreadyOpen ? 'focused' : 'opened',
      { artifactId: record.ArtifactID, name: record.Name },
      undefined,
      record.InstanceID,
    );
    this.RecordChange({ Author: 'agent' });
    void this.ConfirmVisualChange();

    return {
      Success: true,
      Instance: record.InstanceID,
      Result: {
        instanceId: record.InstanceID,
        opened: !alreadyOpen,
        alreadyOpen: Boolean(alreadyOpen),
        artifactId: record.ArtifactID,
        artifactVersionId: record.ArtifactVersionID ?? null,
        versionNumber: record.VersionNumber ?? null,
        name: record.Name,
        artifactTypeName: record.ArtifactTypeName ?? null,
      },
    };
  }

  public override AcceptsDelegationArtifacts(
    artifacts: readonly ParsedDelegationArtifact[],
    config: JSONObject,
  ): boolean {
    if (artifacts.some((a) => Boolean(this.Engine.FindByArtifact(a.ArtifactID)))) {
      return true;
    }
    const parsedConfig = parseArtifactWorkspaceConfig(config);
    if (!parsedConfig.AutoOpenDelegatedArtifacts) {
      return false;
    }
    return artifacts.some(
      (a) => !IsComponentArtifactDescriptor(a.ArtifactTypeName, a.DriverClass),
    );
  }

  public override async OnDelegationArtifacts(
    artifacts: readonly ParsedDelegationArtifact[],
  ): Promise<void> {
    if (this.disposed) {
      return;
    }
    for (const artifact of artifacts) {
      if (IsComponentArtifactDescriptor(artifact.ArtifactTypeName, artifact.DriverClass)) {
        continue;
      }
      const existing = this.Engine.FindByArtifact(artifact.ArtifactID);
      if (existing) {
        await this.handleDelegatedUpdateForExistingTab(existing, artifact);
      } else if (this.Config.AutoOpenDelegatedArtifacts) {
        await this.Open({
          artifactId: artifact.ArtifactID,
          artifactVersionId: artifact.ArtifactVersionID,
          name: artifact.Name,
          ...(artifact.ArtifactTypeName ? { artifactTypeName: artifact.ArtifactTypeName } : {}),
          ...(artifact.DriverClass ? { driverClass: artifact.DriverClass } : {}),
        });
      }
    }
  }

  private async handleDelegatedUpdateForExistingTab(
    existing: ArtifactWorkspaceRecord,
    artifact: ParsedDelegationArtifact,
  ): Promise<void> {
    const sameVersion =
      Boolean(existing.ArtifactVersionID) &&
      existing.ArtifactVersionID!.trim().toLowerCase() === artifact.ArtifactVersionID.trim().toLowerCase();
    if (sameVersion) {
      this.Engine.SetActive(existing.InstanceID);
      return;
    }

    if (!this.Config.SwapToNewerVersions) {
      this.EmitChannelEvent(
        'newer_version_available',
        { current: existing.ArtifactVersionID ?? null, available: artifact.ArtifactVersionID },
        undefined,
        existing.InstanceID,
      );
      if (this.Exposure !== 'none') {
        this.Context?.SendContextNote(
          `[ArtifactWorkspace:${existing.InstanceID}] newer_version_available for "${existing.Name}" (${artifact.ArtifactVersionID}).`,
        );
      }
      return;
    }

    const resolved = await this.resolveArtifactMetadata({
      artifactId: artifact.ArtifactID,
      artifactVersionId: artifact.ArtifactVersionID,
      name: artifact.Name,
      artifactTypeName: artifact.ArtifactTypeName ?? existing.ArtifactTypeName,
      driverClass: artifact.DriverClass ?? existing.DriverClass,
    });
    if ('Success' in resolved) {
      return;
    }
    existing.CanEdit = resolved.CanEdit;
    this.Engine.SwapVersion(
      existing.InstanceID,
      resolved.ArtifactVersionID ?? artifact.ArtifactVersionID,
      resolved.VersionNumber,
      resolved.Name,
    );
    this.EmitChannelEvent(
      'version_changed',
      {
        artifactId: existing.ArtifactID,
        artifactVersionId: existing.ArtifactVersionID ?? artifact.ArtifactVersionID,
        versionNumber: existing.VersionNumber ?? null,
      },
      undefined,
      existing.InstanceID,
    );
    this.RecordChange({ Author: 'system' });
  }

  public override async ApplyVerb(
    verb: string,
    args: JSONObject,
    actor: RealtimeChannelActor,
    instanceId?: string,
  ): Promise<RealtimeChannelVerbResult> {
    const normalized = verb.trim().toLowerCase();
    const record = this.resolveTargetRecord(args, instanceId);
    if (!record) {
      return failure('unknown_instance', 'No matching workspace artifact tab is open.');
    }

    if (normalized === 'focus') {
      this.Engine.SetActive(record.InstanceID);
      this.EmitChannelEvent('focused', { artifactId: record.ArtifactID }, undefined, record.InstanceID);
      this.RecordChange({ Author: actor });
      return { Success: true, Instance: record.InstanceID, Result: { focused: true, artifactId: record.ArtifactID } };
    }

    if (normalized === 'show_version') {
      const versionId = readString(args, 'versionId');
      if (!versionId) {
        return failure('invalid_params', 'show_version requires versionId.');
      }
      const versionNumber = readNumber(args, 'versionNumber');
      this.Engine.SwapVersion(record.InstanceID, versionId, versionNumber);
      this.EmitChannelEvent(
        'version_changed',
        { artifactId: record.ArtifactID, versionId, versionNumber: record.VersionNumber ?? null },
        undefined,
        record.InstanceID,
      );
      this.RecordChange({ Author: actor });
      return {
        Success: true,
        Instance: record.InstanceID,
        Result: { artifactId: record.ArtifactID, versionId, versionNumber: record.VersionNumber ?? null },
      };
    }

    if (normalized === 'refresh') {
      const versionNumber = readNumber(args, 'versionNumber');
      this.Engine.TriggerRefresh(record.ArtifactID, versionNumber);
      this.EmitChannelEvent(
        'refreshed',
        { artifactId: record.ArtifactID, versionNumber: versionNumber ?? record.VersionNumber ?? null },
        undefined,
        record.InstanceID,
      );
      this.RecordChange({ Author: actor });
      return {
        Success: true,
        Instance: record.InstanceID,
        Result: { refreshed: true, artifactId: record.ArtifactID },
      };
    }

    if (normalized === 'close') {
      const artifactId = record.ArtifactID;
      this.Engine.Remove(record.InstanceID);
      this.EmitChannelEvent('closed', { artifactId }, undefined, record.InstanceID);
      this.RecordChange({ Author: actor });
      return { Success: true, Instance: record.InstanceID, Result: { closed: true, artifactId } };
    }

    return failure('verb_failed', `Unknown ArtifactWorkspace verb "${verb}".`);
  }

  private resolveTargetRecord(
    args: JSONObject,
    instanceId?: string,
  ): ArtifactWorkspaceRecord | undefined {
    if (instanceId) {
      return this.Engine.Get(instanceId);
    }
    const artifactId = readString(args, 'artifactId');
    if (artifactId) {
      return this.Engine.FindByArtifact(artifactId);
    }
    if (this.Engine.ActiveID) {
      return this.Engine.Get(this.Engine.ActiveID);
    }
    return this.Engine.Instances[0];
  }

  private async resolveArtifactMetadata(params: {
    artifactId?: string;
    artifactVersionId?: string;
    versionNumber?: number;
    name?: string;
    artifactTypeName?: string;
    driverClass?: string;
  }): Promise<ArtifactWorkspaceOpenPayload | RealtimeChannelVerbResult> {
    const provider: IMetadataProvider | undefined = this.Context?.Provider ?? undefined;
    const user: UserInfo | undefined = provider?.CurrentUser;

    // Fail closed (`CanEdit: false`) when provider or user context is absent
    if (params.artifactId && params.name && (!provider || !user)) {
      return {
        ArtifactID: params.artifactId,
        ArtifactVersionID: params.artifactVersionId,
        VersionNumber: params.versionNumber,
        Name: params.name,
        ArtifactTypeName: params.artifactTypeName,
        DriverClass: params.driverClass,
        CanEdit: false,
      };
    }

    if (!provider || !user) {
      if (params.artifactId) {
        return {
          ArtifactID: params.artifactId,
          ArtifactVersionID: params.artifactVersionId,
          VersionNumber: params.versionNumber,
          Name: params.name ?? 'Artifact',
          ArtifactTypeName: params.artifactTypeName,
          DriverClass: params.driverClass,
          CanEdit: false,
        };
      }
      return failure('open_failed', 'ArtifactWorkspace cannot resolve versionId without a signed-in session.');
    }

    const rv = RunView.FromMetadataProvider(provider);
    let resolvedArtifactId = params.artifactId?.replace(/[{}]/g, '');
    const resolvedVersionId = params.artifactVersionId?.replace(/[{}]/g, '');
    let resolvedVersionNumber = params.versionNumber;
    let resolvedName = params.name;

    if (resolvedVersionId && UUID_PATTERN.test(resolvedVersionId)) {
      const verRes = await rv.RunView<MJArtifactVersionEntity>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID='${resolvedVersionId}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        user,
      );
      const ver = verRes.Success ? verRes.Results[0] : undefined;
      if (ver) {
        resolvedArtifactId = resolvedArtifactId || ver.ArtifactID;
        resolvedVersionNumber = resolvedVersionNumber ?? ver.VersionNumber;
        resolvedName = resolvedName || ver.Name || undefined;
      }
    }

    if (!resolvedArtifactId || !UUID_PATTERN.test(resolvedArtifactId)) {
      return failure('invalid_params', 'A valid artifactId (or artifactVersionId) is required.');
    }

    let canEdit = false;
    try {
      const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, resolvedArtifactId, user);
      canEdit = perms.CanEdit;
    } catch {
      canEdit = false;
    }

    const artRes = await rv.RunView<MJArtifactEntity>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID='${resolvedArtifactId}'`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      user,
    );
    const artifactEntity = artRes.Success ? artRes.Results[0] : undefined;
    if (!artifactEntity) {
      if (params.name) {
        return {
          ArtifactID: resolvedArtifactId,
          ArtifactVersionID: resolvedVersionId,
          VersionNumber: resolvedVersionNumber,
          Name: params.name,
          ArtifactTypeName: params.artifactTypeName,
          DriverClass: params.driverClass,
          CanEdit: canEdit,
        };
      }
      return failure('open_failed', `Artifact ${resolvedArtifactId} was not found or is inaccessible.`);
    }

    return {
      ArtifactID: artifactEntity.ID,
      ArtifactVersionID: resolvedVersionId,
      VersionNumber: resolvedVersionNumber,
      Name: resolvedName || artifactEntity.Name || 'Artifact',
      ArtifactTypeName: params.artifactTypeName || artifactEntity.Type || undefined,
      DriverClass: params.driverClass,
      CanEdit: canEdit,
    };
  }
}

/**
 * Tree-shaking prevention for ClassFactory discovery of `RealtimeArtifactWorkspaceChannel`.
 */
export function LoadRealtimeArtifactWorkspaceChannel(): void {
  // Intentional no-op; module import triggers @RegisterClass.
}
