/**
 * Shared types and collaborative-artifact partitioning helpers for the
 * `ArtifactWorkspace` realtime channel in `@memberjunction/ng-conversations`.
 */

export const ARTIFACT_WORKSPACE_CHANNEL_KEY = 'ArtifactWorkspace';
export const ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS = 'RealtimeArtifactWorkspaceChannel';
export const ARTIFACT_WORKSPACE_SERVER_PLUGIN_CLASS = 'ArtifactWorkspaceChannelServer';

export const COLLABORATIVE_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'markdown document',
  'excel spreadsheet',
  'presentation',
  'whiteboard diagram',
  'whiteboard',
]);

export const COLLABORATIVE_ARTIFACT_DRIVERS: ReadonlySet<string> = new Set([
  'markdownartifactviewerplugin',
  'spreadsheetartifactviewerplugin',
  'slidedeckartifactviewerplugin',
  'whiteboardartifactviewerplugin',
]);

/**
 * Returns true if an artifact descriptor identifies a collaborative document,
 * spreadsheet, slide deck, or whiteboard (partitioned away from `InteractiveComponent`).
 */
export function IsCollaborativeArtifactDescriptor(
  artifactTypeName?: string,
  driverClass?: string,
): boolean {
  const normalizedType = artifactTypeName?.trim().toLowerCase();
  if (normalizedType && COLLABORATIVE_ARTIFACT_TYPES.has(normalizedType)) {
    return true;
  }
  const normalizedDriver = driverClass?.trim().toLowerCase();
  if (normalizedDriver && COLLABORATIVE_ARTIFACT_DRIVERS.has(normalizedDriver)) {
    return true;
  }
  return false;
}

/**
 * Returns true if the descriptor explicitly identifies a Component artifact.
 */
export function IsComponentArtifactDescriptor(
  artifactTypeName?: string,
  driverClass?: string,
): boolean {
  const normalizedType = artifactTypeName?.trim().toLowerCase();
  const normalizedDriver = driverClass?.trim().toLowerCase();
  return normalizedType === 'component' || normalizedDriver === 'componentartifactviewerplugin';
}

export type ArtifactSelectionDomain = 'document' | 'spreadsheet' | 'slides' | 'whiteboard';

export interface ArtifactSelectionAnchor {
  domain: ArtifactSelectionDomain;
  heading?: string;
  blockId?: string;
  quote?: string;
  sheet?: string;
  range?: string;
  slideNumber?: number;
  slideId?: string;
  elementId?: string;
}

export interface ArtifactSelectionDelta {
  instanceId: string;
  artifactId: string;
  artifactTypeName?: string;
  anchor: ArtifactSelectionAnchor;
}

export type ArtifactWorkspaceViewMode = 'edit' | 'suggest' | 'diff' | 'present';

export interface ArtifactViewerNavigationAnchor {
  Sheet?: string;
  Range?: string;
  SlideNumber?: number;
  SlideID?: string;
  ElementID?: string;
  Heading?: string;
  BlockID?: string;
  HighlightMs?: number;
}

export interface ArtifactNavigateToAnchorPayload extends ArtifactViewerNavigationAnchor {
  InstanceID: string;
  ArtifactID: string;
}

export interface ArtifactWorkspaceOpenPayload {
  ArtifactID: string;
  ArtifactVersionID?: string;
  VersionNumber?: number;
  Name: string;
  ArtifactTypeName?: string;
  DriverClass?: string;
  CanEdit?: boolean;
}

export interface ArtifactWorkspaceRecord {
  readonly InstanceID: string;
  ArtifactID: string;
  ArtifactVersionID?: string;
  VersionNumber?: number;
  Name: string;
  ArtifactTypeName?: string;
  DriverClass?: string;
  CanEdit?: boolean;
  Selection?: ArtifactSelectionAnchor | null;
  ViewMode?: ArtifactWorkspaceViewMode;
  LastUpdatedAt: number;
}

export interface ArtifactWorkspaceConfig {
  AutoOpenDelegatedArtifacts: boolean;
  SwapToNewerVersions: boolean;
  MaxInstances: number;
}

export const DEFAULT_ARTIFACT_WORKSPACE_CONFIG: Readonly<ArtifactWorkspaceConfig> = Object.freeze({
  AutoOpenDelegatedArtifacts: true,
  SwapToNewerVersions: true,
  MaxInstances: 6,
});
