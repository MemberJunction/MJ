/**
 * Structured preview metadata stored inside `MJ: Artifact Versions.Configuration.previewSnapshot`
 * so Library cards can render live miniature previews without fetching full `Content` blobs.
 */
export type IArtifactPreviewSnapshot =
  | {
      Kind: 'doc';
      Heading: string;
      Excerpt: string;
      Callout?: string;
    }
  | {
      Kind: 'sheet';
      Headers: string[];
      Rows: string[][];
    }
  | {
      Kind: 'slides';
      SlideTitle: string;
      LeftMetric?: string;
      RightMetric?: string;
      ThemeAccent?: string;
    }
  | {
      Kind: 'whiteboard';
      Nodes: string[];
    };

/**
 * Persistent link between an MJ Artifact version and a remote Connected Drive file.
 * Stored inside `MJ: Artifact Versions.Configuration` without creating redundant `MJ: Files` rows.
 */
export type IConnectedDriveLinkMetadata = {
  /** Remote file / document identifier (SharePoint/OneDrive ItemID or Google Drive FileID). */
  ExternalFileID: string;
  /** Connected provider key (`'OneDrive' | 'SharePoint' | 'GoogleDrive' | string`). */
  ProviderType: string;
  /** Optional provider integration ID. */
  ProviderIntegrationID?: string;
  /** Optional remote parent folder / library identifier. */
  FolderID?: string;
  /** Display filename on the connected drive. */
  FileName?: string;
  /** Remote web URL to inspect or edit on the provider. */
  WebUrl?: string;
  /** MIME type synced with the connected drive. */
  MimeType?: string;
  /** Last observed remote ETag / version tag for optimistic concurrency checks. */
  ETag?: string;
  /** Remote last-modified timestamp (ISO 8601) if reported by the provider. */
  RemoteModifiedAt?: string;
  /** Artifact `VersionNumber` associated with the latest sync. */
  SyncedVersionNumber?: number;
  /** ISO 8601 timestamp of the most recent push or pull sync. */
  LastSyncedAt: string;
  /** Direction of the most recent sync operation. */
  LastSyncDirection: 'push' | 'pull';
  /** User ID that executed the most recent sync. */
  LastSyncedByUserID?: string;
};

/**
 * Frozen-only expiring read-only external guest share link entry stored inside
 * `MJ: Artifact Versions.Configuration.guestShareLinks`.
 */
export type IGuestShareLinkRecord = {
  /** Unique link / token identifier (`jti`). */
  LinkID: string;
  /** Target `MJ: Artifacts.ID`. */
  ArtifactID: string;
  /** Target pinned `MJ: Artifact Versions.ID`. */
  VersionID: string;
  /** Target artifact version number. */
  VersionNumber: number;
  /** External guest links strictly permit only `'Frozen'` mode so no live RLS/FLS queries run externally. */
  ShareMode: 'Frozen';
  /** ISO 8601 creation timestamp. */
  CreatedAt: string;
  /** Creator `UserInfo.ID`. */
  CreatedByUserID: string;
  /** Optional human-readable label for audit & management UI. */
  Label?: string;
  /** ISO 8601 expiration timestamp. */
  ExpiresAt: string;
  /** True when explicitly revoked prior to expiration. */
  Revoked?: boolean;
  /** ISO 8601 revocation timestamp. */
  RevokedAt?: string;
  /** User ID that revoked this link. */
  RevokedByUserID?: string;
};

/**
 * Typed JSON shape for `MJ: Artifact Versions.Configuration`.
 * CodeGen emits a typed `ConfigurationObject` accessor on `MJArtifactVersionEntity` returning
 * `MJArtifactVersionEntity_IArtifactVersionConfiguration | null`.
 */
export type ArtifactVersionConfigurationValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ArtifactVersionConfigurationValue[]
  | { [key: string]: ArtifactVersionConfigurationValue };

export interface IArtifactVersionConfiguration {
  previewSnapshot?: IArtifactPreviewSnapshot;
  thumbnailDataUrl?: string;
  connectedDriveLink?: IConnectedDriveLinkMetadata;
  guestShareLinks?: IGuestShareLinkRecord[];
  [key: string]: ArtifactVersionConfigurationValue;
}
