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
  MJEnvironmentEntityExtended,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
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
  IsCollaborativeArtifactDescriptor,
  IsComponentArtifactDescriptor,
  type ArtifactSelectionAnchor,
  type ArtifactSelectionDelta,
  type ArtifactSelectionDomain,
  type ArtifactWorkspaceConfig,
  type ArtifactWorkspaceOpenPayload,
  type ArtifactWorkspaceRecord,
  type ArtifactWorkspaceViewMode,
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
function anchorToJson(anchor: ArtifactSelectionAnchor): JSONObject {
  const out: JSONObject = { domain: anchor.domain };
  if (anchor.heading !== undefined) out['heading'] = anchor.heading;
  if (anchor.blockId !== undefined) out['blockId'] = anchor.blockId;
  if (anchor.quote !== undefined) out['quote'] = anchor.quote;
  if (anchor.sheet !== undefined) out['sheet'] = anchor.sheet;
  if (anchor.range !== undefined) out['range'] = anchor.range;
  if (anchor.slideNumber !== undefined) out['slideNumber'] = anchor.slideNumber;
  if (anchor.slideId !== undefined) out['slideId'] = anchor.slideId;
  if (anchor.elementId !== undefined) out['elementId'] = anchor.elementId;
  return out;
}

function inferSelectionDomain(
  args: JSONObject,
  artifactTypeName?: string,
): ArtifactSelectionDomain {
  if (readString(args, 'sheet') || readString(args, 'range')) {
    return 'spreadsheet';
  }
  if (readNumber(args, 'slideNumber') !== undefined || readString(args, 'elementId')) {
    const t = artifactTypeName?.trim().toLowerCase() ?? '';
    return t.includes('whiteboard') ? 'whiteboard' : 'slides';
  }
  const t = artifactTypeName?.trim().toLowerCase() ?? '';
  if (t.includes('spreadsheet') || t.includes('excel')) return 'spreadsheet';
  if (t.includes('presentation') || t.includes('slide')) return 'slides';
  if (t.includes('whiteboard')) return 'whiteboard';
  return 'document';
}

const VALID_VIEW_MODES: ReadonlySet<ArtifactWorkspaceViewMode> = new Set([
  'edit',
  'suggest',
  'diff',
  'present',
]);

function readViewMode(bag: JSONObject, key: string): ArtifactWorkspaceViewMode | undefined {
  const raw = readString(bag, key);
  if (!raw) return undefined;
  return VALID_VIEW_MODES.has(raw as ArtifactWorkspaceViewMode)
    ? (raw as ArtifactWorkspaceViewMode)
    : undefined;
}

@RegisterClass(BaseRealtimeChannelClient, ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS)
export class ArtifactWorkspaceChannel extends BaseRealtimeChannelClient<RealtimeArtifactWorkspaceSurfaceComponent> {
  public readonly Engine = new ArtifactWorkspaceEngine(DEFAULT_ARTIFACT_WORKSPACE_CONFIG.MaxInstances);
  public Config: ArtifactWorkspaceConfig = { ...DEFAULT_ARTIFACT_WORKSPACE_CONFIG };
  private surface: RealtimeArtifactWorkspaceSurfaceComponent | null = null;
  private pendingRehydration: Promise<void> | null = null;
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
            artifactId: { type: 'string', description: 'Optional artifact ID; defaults to the active workspace tab.' },
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
          properties: {
            artifactId: { type: 'string', description: 'Optional artifact ID to close; defaults to the active tab.' },
          },
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
      {
        Name: 'navigate_to_anchor',
        Description: 'Scrolls/focuses a specific worksheet range, slide number, heading, or block inside an open workspace artifact.',
        ParametersSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Optional artifact ID; defaults to the active tab.' },
            sheet: { type: 'string', description: 'Target worksheet tab name.' },
            range: { type: 'string', description: 'Target A1 cell or range.' },
            slideNumber: { type: 'number', description: '1-based target slide number.' },
            elementId: { type: 'string', description: 'Target slide or whiteboard element ID.' },
            heading: { type: 'string', description: 'Target Markdown heading text.' },
            blockId: { type: 'string', description: 'Target block or section identifier.' },
            highlightMs: { type: 'number', description: 'Optional temporary highlight duration in milliseconds.' },
          },
          additionalProperties: false,
        },
        InvokableBy: 'agent',
      },
      {
        Name: 'set_view_mode',
        Description: 'Switches the display mode of an open workspace artifact viewer.',
        ParametersSchema: {
          type: 'object',
          properties: {
            artifactId: { type: 'string', description: 'Optional artifact ID; defaults to the active tab.' },
            mode: {
              type: 'string',
              enum: ['edit', 'suggest', 'diff', 'present'],
              description: 'Target viewer mode.',
            },
          },
          required: ['mode'],
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
        'and Whiteboards beside the conversation. Open with artifactId, artifactVersionId, or name; use focus, refresh, ' +
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
          name: {
            type: 'string',
            description: 'Optional display title (used to look up the artifact when artifactId/artifactVersionId is omitted).',
          },
          artifactTypeName: { type: 'string', description: 'Optional canonical artifact type name.' },
          driverClass: { type: 'string', description: 'Optional driver class name.' },
        },
        additionalProperties: false,
      },
      Events: [
        { Name: 'opened', Description: 'A workspace artifact tab was opened.' },
        { Name: 'focused', Description: 'A workspace artifact tab gained focus.' },
        { Name: 'version_changed', Description: 'A workspace tab switched to a different version.' },
        {
          Name: 'newer_version_available',
          Description: 'A newer version of an open workspace artifact is available while SwapToNewerVersions is disabled.',
        },
        { Name: 'refreshed', Description: 'A workspace tab refreshed its rendered artifact.' },
        { Name: 'selection_changed', Description: 'User moved active cursor, range, or slide selection inside a workspace artifact.' },
        { Name: 'navigated_to_anchor', Description: 'Workspace viewer focused a requested section, range, or slide.' },
        { Name: 'view_mode_changed', Description: 'Workspace artifact view mode changed.' },
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
    instance.Provider = this.Context?.Provider ?? null;
    instance.CurrentUser = this.Context?.Provider?.CurrentUser ?? null;
    const configuredEnvId = this.Context?.ChannelConfig?.['environmentId'];
    instance.EnvironmentID =
      typeof configuredEnvId === 'string' && configuredEnvId.trim().length > 0
        ? configuredEnvId.trim()
        : MJEnvironmentEntityExtended.DefaultEnvironmentID;
    instance.OnUserSelected = (instanceId: string) => {
      this.EmitChannelEvent('focused', { instanceId, by: 'user' }, undefined, instanceId);
      this.RecordChange({ Author: 'user' });
      void this.NotifyVisualChange();
    };
    instance.OnUserClosed = (instanceId: string) => {
      this.EmitChannelEvent('closed', { instanceId, by: 'user' }, undefined, instanceId);
      this.RecordChange({ Author: 'user' });
    };
    instance.OnUserVersionSaved = (instanceId: string, event) => {
      const rec = this.Engine.Get(instanceId);
      this.EmitChannelEvent(
        'version_changed',
        {
          artifactId: event.ArtifactID,
          artifactVersionId: event.VersionID ?? rec?.ArtifactVersionID ?? null,
          versionNumber: event.VersionNumber,
          by: 'user',
        },
        undefined,
        instanceId,
      );
      this.RecordChange({ Author: 'user' });
    };
    instance.OnUserSelectionChanged = (delta: ArtifactSelectionDelta) => {
      this.EmitSelectionDelta(delta);
    };
  }

  public EmitSelectionDelta(delta: ArtifactSelectionDelta): void {
    this.Engine.UpdateSelection(delta.instanceId, delta.anchor);
    const payload: JSONObject = {
      instanceId: delta.instanceId,
      artifactId: delta.artifactId,
      anchor: anchorToJson(delta.anchor),
    };
    if (delta.artifactTypeName) {
      payload['artifactTypeName'] = delta.artifactTypeName;
    }
    this.EmitChannelEvent('selection_changed', payload, undefined, delta.instanceId);
    this.RecordChange({ Author: 'user' });
    void this.NotifyVisualChange();
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
    const parsed = SafeJSONParse<{
      activeArtifactId?: string | null;
      instances?: ArtifactWorkspaceOpenPayload[];
    }>(stateJson);
    if (!parsed || !Array.isArray(parsed.instances) || parsed.instances.length === 0) {
      return false;
    }
    const validItems = parsed.instances.filter(
      (item) =>
        item != null &&
        typeof item === 'object' &&
        Boolean(item.ArtifactID) &&
        !IsComponentArtifactDescriptor(item.ArtifactTypeName, item.DriverClass),
    );
    if (validItems.length === 0) {
      return false;
    }
    for (const existing of [...this.Engine.Instances]) {
      this.Engine.Remove(existing.InstanceID);
    }
    for (const item of validItems) {
      // Force CanEdit: false until async rehydration verifies permissions against the backend
      this.Engine.AddOrFocus({ ...item, CanEdit: false });
    }
    if (parsed.activeArtifactId) {
      const active = this.Engine.FindByArtifact(parsed.activeArtifactId);
      if (active) {
        this.Engine.SetActive(active.InstanceID);
      }
    }
    const provider = this.Context?.Provider;
    if (provider?.CurrentUser) {
      this.Engine.SetRehydrating(true);
    }
    this.pendingRehydration = this.rehydrateRestoredInstances();
    return true;
  }

  public WaitForRehydration(): Promise<void> {
    return this.pendingRehydration ?? Promise.resolve();
  }

  private async rehydrateRestoredInstances(): Promise<void> {
    const provider = this.Context?.Provider;
    const user = provider?.CurrentUser;
    if (!provider || !user) {
      this.Engine.SetRehydrating(false);
      this.pendingRehydration = null;
      return;
    }
    try {
      const snapshot = [...this.Engine.Instances];
      for (const record of snapshot) {
        if (this.disposed) {
          return;
        }
        const resolved = await this.resolveArtifactMetadata({
          artifactId: record.ArtifactID,
          artifactVersionId: record.ArtifactVersionID,
          versionNumber: record.VersionNumber,
          name: undefined,
          fallbackName: record.Name,
          artifactTypeName: record.ArtifactTypeName,
          driverClass: record.DriverClass,
        });
        if (this.disposed) {
          return;
        }
        if ('Success' in resolved) {
          this.Engine.Remove(record.InstanceID);
          continue;
        }
        this.Engine.UpdateRecordMetadata(record.InstanceID, {
          ArtifactVersionID: resolved.ArtifactVersionID,
          VersionNumber: resolved.VersionNumber,
          Name: resolved.Name,
          ArtifactTypeName: resolved.ArtifactTypeName,
          DriverClass: resolved.DriverClass,
          CanEdit: resolved.CanEdit,
        });
      }
    } finally {
      if (!this.disposed) {
        this.Engine.SetRehydrating(false);
      }
      this.pendingRehydration = null;
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
        viewMode: record.ViewMode ?? 'edit',
        selection: record.Selection ? anchorToJson(record.Selection) : null,
      };
    }
    const activeRecord = this.Engine.ActiveID ? this.Engine.Get(this.Engine.ActiveID) : undefined;
    const activeSelection: JSONObject | null = activeRecord?.Selection
      ? {
          instanceId: activeRecord.InstanceID,
          artifactId: activeRecord.ArtifactID,
          ...(activeRecord.ArtifactTypeName ? { artifactTypeName: activeRecord.ArtifactTypeName } : {}),
          anchor: anchorToJson(activeRecord.Selection),
        }
      : null;
    return {
      activeInstanceId: this.Engine.ActiveID,
      activeSelection,
      artifacts,
    };
  }

  protected override async OnOpen(inputs: JSONObject): Promise<RealtimeChannelVerbResult> {
    const suppliedArtifactId = readString(inputs, 'artifactId');
    const suppliedVersionId = readString(inputs, 'artifactVersionId');
    const suppliedName = readString(inputs, 'name');
    if (!suppliedArtifactId && !suppliedVersionId && !suppliedName) {
      return failure(
        'invalid_params',
        'Provide artifactId, artifactVersionId, or name to open a workspace artifact.',
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
      name: suppliedName,
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
      (a) =>
        !IsComponentArtifactDescriptor(a.ArtifactTypeName, a.DriverClass) &&
        IsCollaborativeArtifactDescriptor(a.ArtifactTypeName, a.DriverClass),
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
      } else if (
        this.Config.AutoOpenDelegatedArtifacts &&
        IsCollaborativeArtifactDescriptor(artifact.ArtifactTypeName, artifact.DriverClass)
      ) {
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
      UUIDsEqual(existing.ArtifactVersionID, artifact.ArtifactVersionID);
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
      let versionNumber = readNumber(args, 'versionNumber');
      const provider = this.Context?.Provider;
      const user = provider?.CurrentUser;
      if (provider && user) {
        const cleanVersionId = versionId.replace(/[{}]/g, '');
        if (!UUID_PATTERN.test(cleanVersionId)) {
          return failure('invalid_params', 'show_version requires a valid UUID versionId.');
        }
        const rv = RunView.FromMetadataProvider(provider);
        const verRes = await rv.RunView<MJArtifactVersionEntity>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID='${EscapeSQLString(cleanVersionId)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
          },
          user,
        );
        const ver = verRes.Success ? verRes.Results[0] : undefined;
        if (!ver) {
          return failure('not_found', `Artifact version ${cleanVersionId} was not found.`);
        }
        if (!UUIDsEqual(ver.ArtifactID, record.ArtifactID)) {
          return failure(
            'invalid_params',
            `Artifact version ${cleanVersionId} does not belong to artifact ${record.ArtifactID}.`,
          );
        }
        versionNumber = versionNumber ?? ver.VersionNumber;
      }
      this.Engine.SwapVersion(record.InstanceID, versionId, versionNumber);
      this.EmitChannelEvent(
        'version_changed',
        {
          artifactId: record.ArtifactID,
          artifactVersionId: versionId,
          versionNumber: record.VersionNumber ?? null,
        },
        undefined,
        record.InstanceID,
      );
      this.RecordChange({ Author: actor });
      return {
        Success: true,
        Instance: record.InstanceID,
        Result: {
          artifactId: record.ArtifactID,
          artifactVersionId: versionId,
          versionNumber: record.VersionNumber ?? null,
        },
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

    if (normalized === 'navigate_to_anchor') {
      const sheet = readString(args, 'sheet');
      const range = readString(args, 'range');
      const slideNumber = readNumber(args, 'slideNumber');
      const elementId = readString(args, 'elementId');
      const heading = readString(args, 'heading');
      const blockId = readString(args, 'blockId');
      const highlightMs = readNumber(args, 'highlightMs');
      const anchor: ArtifactSelectionAnchor = {
        domain: inferSelectionDomain(args, record.ArtifactTypeName),
        ...(sheet ? { sheet } : {}),
        ...(range ? { range } : {}),
        ...(slideNumber !== undefined ? { slideNumber } : {}),
        ...(elementId ? { elementId } : {}),
        ...(heading ? { heading } : {}),
        ...(blockId ? { blockId } : {}),
      };
      this.Engine.SetActive(record.InstanceID);
      this.Engine.UpdateSelection(record.InstanceID, anchor);
      this.Engine.RequestNavigateToAnchor({
        InstanceID: record.InstanceID,
        ArtifactID: record.ArtifactID,
        ...(sheet ? { Sheet: sheet } : {}),
        ...(range ? { Range: range } : {}),
        ...(slideNumber !== undefined ? { SlideNumber: slideNumber } : {}),
        ...(elementId ? { ElementID: elementId } : {}),
        ...(heading ? { Heading: heading } : {}),
        ...(blockId ? { BlockID: blockId } : {}),
        ...(highlightMs !== undefined ? { HighlightMs: highlightMs } : {}),
      });
      this.EmitChannelEvent(
        'navigated_to_anchor',
        { artifactId: record.ArtifactID, anchor: anchorToJson(anchor) },
        undefined,
        record.InstanceID,
      );
      this.RecordChange({ Author: actor });
      return {
        Success: true,
        Instance: record.InstanceID,
        Result: { artifactId: record.ArtifactID, anchor: anchorToJson(anchor) },
      };
    }

    if (normalized === 'set_view_mode') {
      const mode = readViewMode(args, 'mode');
      if (!mode) {
        return failure(
          'invalid_params',
          'set_view_mode requires mode to be one of: edit, suggest, diff, present.',
        );
      }
      this.Engine.SetViewMode(record.InstanceID, mode);
      this.EmitChannelEvent(
        'view_mode_changed',
        { artifactId: record.ArtifactID, mode },
        undefined,
        record.InstanceID,
      );
      this.RecordChange({ Author: actor });
      return {
        Success: true,
        Instance: record.InstanceID,
        Result: { artifactId: record.ArtifactID, mode },
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
    fallbackName?: string;
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
          Name: params.name ?? params.fallbackName ?? 'Artifact',
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
          ExtraFilter: `ID='${EscapeSQLString(resolvedVersionId)}'`,
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        user,
      );
      const ver = verRes.Success ? verRes.Results[0] : undefined;
      if (ver) {
        if (resolvedArtifactId && !UUIDsEqual(ver.ArtifactID, resolvedArtifactId)) {
          return failure(
            'invalid_params',
            `Artifact version ${resolvedVersionId} does not belong to artifact ${resolvedArtifactId}.`,
          );
        }
        resolvedArtifactId = resolvedArtifactId || ver.ArtifactID;
        resolvedVersionNumber = resolvedVersionNumber ?? ver.VersionNumber;
        resolvedName = resolvedName || ver.Name || undefined;
      } else if (!resolvedArtifactId) {
        return failure('not_found', `Artifact version ${resolvedVersionId} was not found.`);
      }
    }

    if (!resolvedArtifactId && !resolvedVersionId && resolvedName) {
      const byName = await this.resolveArtifactByName(rv, provider, user, resolvedName);
      if ('Success' in byName) {
        return byName;
      }
      return {
        ArtifactID: byName.ArtifactEntity.ID,
        ArtifactVersionID: undefined,
        VersionNumber: resolvedVersionNumber,
        Name: byName.ArtifactEntity.Name || resolvedName || params.fallbackName || 'Artifact',
        ArtifactTypeName: params.artifactTypeName || byName.ArtifactEntity.Type || undefined,
        DriverClass: params.driverClass,
        CanEdit: byName.CanEdit,
      };
    }

    if (!resolvedArtifactId || !UUID_PATTERN.test(resolvedArtifactId)) {
      return failure('invalid_params', 'A valid artifactId (or artifactVersionId) is required.');
    }

    const artRes = await rv.RunView<MJArtifactEntity>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID='${EscapeSQLString(resolvedArtifactId)}'`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      user,
    );
    const artifactEntity = artRes.Success ? artRes.Results[0] : undefined;
    if (!artifactEntity) {
      return failure('not_found', `Artifact ${resolvedArtifactId} was not found or is inaccessible.`);
    }

    let canEdit = false;
    try {
      const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, resolvedArtifactId, user);
      if (!perms.CanRead) {
        return failure('access_denied', `Access denied for artifact ${resolvedArtifactId}.`);
      }
      canEdit = perms.CanEdit;
    } catch {
      return failure('access_denied', `Unable to verify read permissions for artifact ${resolvedArtifactId}.`);
    }

    return {
      ArtifactID: artifactEntity.ID,
      ArtifactVersionID: resolvedVersionId,
      VersionNumber: resolvedVersionNumber,
      Name: resolvedName || artifactEntity.Name || params.fallbackName || 'Artifact',
      ArtifactTypeName: params.artifactTypeName || artifactEntity.Type || undefined,
      DriverClass: params.driverClass,
      CanEdit: canEdit,
    };
  }

  /**
   * Resolves a readable artifact by exact or partial display name when `artifactId` and
   * `artifactVersionId` are omitted. Prefers collaborative (non-Component) artifacts ordered most
   * recently updated first; falls back to Component matches so `OnOpen` can emit the specific
   * `use_interactive_component` guidance.
   */
  private async resolveArtifactByName(
    rv: RunView,
    provider: IMetadataProvider,
    user: UserInfo,
    name: string,
  ): Promise<{ ArtifactEntity: MJArtifactEntity; CanEdit: boolean } | RealtimeChannelVerbResult> {
    const escapedExact = EscapeSQLString(name);
    const escapedLike = EscapeSQLString(name.replace(/([\\_%[])/g, '\\$1'));
    const configuredEnvId = readString(this.Context?.ChannelConfig ?? {}, 'environmentId');
    const environmentId = EscapeSQLString(configuredEnvId || MJEnvironmentEntityExtended.DefaultEnvironmentID);
    const scopeClause = `(Visibility IS NULL OR Visibility <> 'System Only') AND EnvironmentID='${environmentId}'`;
    const filters = [
      `Name='${escapedExact}' AND ${scopeClause}`,
      `Name LIKE '%${escapedLike}%' ESCAPE '\\' AND ${scopeClause}`,
    ];
    let componentFallback: { ArtifactEntity: MJArtifactEntity; CanEdit: boolean } | null = null;

    for (const extraFilter of filters) {
      const res = await rv.RunView<MJArtifactEntity>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: extraFilter,
          OrderBy: '__mj_UpdatedAt DESC',
          MaxRows: 15,
          ResultType: 'entity_object',
        },
        user,
      );
      if (!res.Success || !res.Results?.length) {
        continue;
      }

      for (const candidate of res.Results) {
        try {
          const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            candidate.ID,
            user,
          );
          if (!perms.CanRead) {
            continue;
          }
          if (!IsComponentArtifactDescriptor(candidate.Type ?? undefined, undefined)) {
            return { ArtifactEntity: candidate, CanEdit: perms.CanEdit };
          }
          if (!componentFallback) {
            componentFallback = { ArtifactEntity: candidate, CanEdit: perms.CanEdit };
          }
        } catch {
          // Permission resolution failure skips this candidate rather than widening access.
        }
      }
    }

    if (componentFallback) {
      return componentFallback;
    }
    return failure('not_found', `Artifact named "${name}" was not found or is inaccessible.`);
  }
}

/**
 * Tree-shaking prevention for ClassFactory discovery of `RealtimeArtifactWorkspaceChannel`.
 */
export function LoadRealtimeArtifactWorkspaceChannel(): void {
  // Intentional no-op; module import triggers @RegisterClass.
}
