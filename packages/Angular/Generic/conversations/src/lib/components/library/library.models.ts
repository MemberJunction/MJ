import { CompositeKey } from '@memberjunction/core';
import {
  ArtifactPreviewSnapshot,
  type ArtifactTypeThumbnailMode,
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJCollectionEntity,
  StorageAccountWithProvider,
} from '@memberjunction/core-entities';

/**
 * Primary surface layout mode of the Library workspace:
 * - `'hub'`: Spacious zero-left-sidebar landing page (default)
 * - `'navigator'`: Power-user collapsible tree + list/grid + resizable Split Studio
 */
export type LibrarySurfaceMode = 'hub' | 'navigator';

/**
 * Unified scope in the single-shell Library UX.
 */
export type LibraryUnifiedScope = 'home' | 'all' | 'shared' | 'starred' | 'collection' | 'drive';

/**
 * Unified layout mode (`Grid | List | Split`) that preserves the active scope.
 */
export type LibraryUnifiedLayout = 'grid' | 'list' | 'split';

export interface LibraryBreadcrumbSegment {
  Label: string;
  Scope: LibraryUnifiedScope;
  CollectionId?: string | null;
}

/**
 * Top-level tabs displayed in `Hub` mode.
 */
export type LibraryHubTab = 'overview' | 'collections' | 'all' | 'shared' | 'drives';

/**
 * Active navigation view inside `Navigator` mode.
 */
export type LibraryNavigatorSection = 'all' | 'collections' | 'shared' | 'starred' | 'collection' | 'drive';

/**
 * Item layout style in item grids/tables.
 */
export type LibraryListStyle = 'cards' | 'list';

/**
 * Semantic category bucket used for visual miniature previews, badges, and filtering.
 */
export type LibraryCategoryFilter =
  | 'all'
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'interactive'
  | 'queries'
  | 'files';

/**
 * Ownership filter used inside `<mj-filter-panel>`.
 */
export type LibraryOwnershipFilter = 'all' | 'owned' | 'shared' | 'starred';

/**
 * Rich view-model representing one native Library item (`MJ: Artifacts` + latest `MJ: Artifact Versions`).
 */
export interface LibraryItemSummary {
  Id: string;
  Name: string;
  Description: string;
  TypeId: string;
  TypeName: string;
  DriverClass: string;
  Icon: string;
  Category: Exclude<LibraryCategoryFilter, 'all'>;
  CategoryBadge: string;
  LatestVersionId: string | null;
  LatestVersionNumber: number;
  VersionCount: number;
  ContentMode: MJArtifactVersionEntity['ContentMode'];
  MimeType: string | null;
  FileName: string | null;
  ContentSnippet: string;
  PreviewSnapshot?: ArtifactPreviewSnapshot | null;
  ThumbnailDataUrl?: string | null;
  ThumbnailPolicyMode?: ArtifactTypeThumbnailMode;
  UpdatedAt: Date;
  OwnerUserId: string;
  OwnerName: string;
  IsOwnedByCurrentUser: boolean;
  IsSharedWithMe: boolean;
  IsStarred: boolean;
  CanEdit: boolean;
  CanShare: boolean;
  CanDelete: boolean;
  CollectionIds: string[];
  CollectionNames: string[];
  ArtifactEntity: MJArtifactEntity;
}

/**
 * Hierarchical node representing an `MJ: Collections` record and its nested children.
 */
export interface LibraryCollectionNode {
  Id: string;
  Name: string;
  Description: string;
  Icon: string;
  Color: string;
  ParentId: string | null;
  OwnerId: string | null;
  OwnerName: string;
  DirectItemCount: number;
  TotalItemCount: number;
  CanEdit: boolean;
  CanShare: boolean;
  CanDelete: boolean;
  Children: LibraryCollectionNode[];
  Entity: MJCollectionEntity;
}

/**
 * Summary descriptor for a dynamic Connected Drive (`MJ: File Storage Accounts`).
 */
export interface LibraryDriveSummary {
  AccountId: string;
  AccountName: string;
  Description: string;
  ProviderId: string;
  ProviderName: string;
  Icon: string;
  SupportsSearch: boolean;
  AccountWithProvider: StorageAccountWithProvider;
}

/**
 * Deep-link and agent-context state snapshot emitted by `<mj-library-workspace>`.
 */
export interface LibraryWorkspaceState {
  Mode: LibrarySurfaceMode;
  HubTab: LibraryHubTab;
  NavigatorSection: LibraryNavigatorSection;
  CollectionId: string | null;
  CollectionName: string | null;
  DriveId: string | null;
  DriveName: string | null;
  DriveFolderPrefix: string;
  ActiveArtifactId: string | null;
  ActiveArtifactName: string | null;
  ActiveVersionNumber: number | null;
  IsFullCanvasOpen: boolean;
  SearchQuery: string;
  CategoryFilter: LibraryCategoryFilter;
  OwnershipFilter: LibraryOwnershipFilter;
  VisibleItems: ReadonlyArray<{
    Id: string;
    Name: string;
    TypeName: string;
    Category: string;
    VersionNumber: number;
    UpdatedAtIso: string;
  }>;
  Collections: ReadonlyArray<{
    Id: string;
    Name: string;
    ParentId: string | null;
    ItemCount: number;
  }>;
  ConnectedDrives: ReadonlyArray<{
    AccountId: string;
    AccountName: string;
    ProviderName: string;
  }>;
}

/**
 * Host navigation event emitted by `<mj-library-workspace>` for L3 surface routing (`NavigationService`).
 */
export interface LibraryHostNavigationEvent {
  Kind: 'entity-record' | 'conversation' | 'collection';
  EntityName?: string;
  CompositeKey?: CompositeKey;
  ConversationId?: string;
  CollectionId?: string;
  ArtifactId?: string;
  VersionNumber?: number;
}
