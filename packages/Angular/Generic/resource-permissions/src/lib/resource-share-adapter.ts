import { BaseEntity } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';

/** Three permission tiers used across every share dialog: view-only, modify, full control. */
export type ResourceShareLevel = 'View' | 'Edit' | 'Owner';

/**
 * Ordered list used by the dialog to render the level selector. Exposed so
 * adapters or tests can reference it without re-declaring the enum.
 */
export const RESOURCE_SHARE_LEVELS: ResourceShareLevel[] = ['View', 'Edit', 'Owner'];

/**
 * A single share row displayed in {@link GenericShareDialogComponent}. The
 * dialog treats every resource type uniformly with a three-tier permission
 * model — adapters translate the `Level` field to whatever shape their
 * backing entity actually stores (e.g., `MJResourcePermissionEntity.PermissionLevel`
 * is a direct match; `MJDashboardPermissionEntity` maps to a combination of
 * `Can*` booleans).
 */
export interface ResourceSharePermissionModel {
    /** BaseEntity instance to persist on save / delete on remove. */
    PermissionEntity: BaseEntity;
    UserID: string;
    User: MJUserEntity;
    /** Current permission tier shown in the dialog. */
    Level: ResourceShareLevel;
    /** `true` if this row was added in the current dialog session (no DB row yet). */
    IsNew: boolean;
    /** `true` if the user clicked the trash icon; will be deleted on save. */
    MarkedForRemoval: boolean;
    /**
     * Snapshot of `Level` captured when the row was first created/loaded.
     * Populated by the dialog; used by `HasChanges` to detect user edits.
     */
    _InitialLevel?: ResourceShareLevel;
}

/**
 * Per-resource context passed to every adapter call. Kept small and serializable
 * so the generic dialog can stay resource-type-agnostic.
 */
export interface ResourceShareContext {
    /** Primary key of the resource being shared. */
    ResourceID: string;
    /** Display name used in the dialog title (`Share "{{ResourceName}}"`). */
    ResourceName: string;
    /** UserID of the resource owner (excluded from the "add people" list). */
    OwnerUserID?: string | null;
    /** Owner's display name, shown in the static "Owner" row. */
    OwnerDisplayName?: string | null;
    /** UserID of the person currently using the dialog (captured on save as grantor). */
    CurrentUserID?: string | null;
}

/**
 * Contract implemented by per-resource adapters that plug into
 * {@link GenericShareDialogComponent}. The dialog owns the UX (user search,
 * level selector, mark-for-removal); the adapter owns persistence.
 */
export interface ResourceShareAdapter {
    /** Load existing share rows for the resource. Owner is NOT included here. */
    LoadShares(context: ResourceShareContext): Promise<ResourceSharePermissionModel[]>;

    /**
     * Create an un-saved {@link ResourceSharePermissionModel} for `user`, defaulting
     * the level to `View`. The returned row's `PermissionEntity` must be a valid
     * BaseEntity pre-populated with everything except the level.
     */
    CreateShare(context: ResourceShareContext, user: MJUserEntity): Promise<ResourceSharePermissionModel>;

    /**
     * Apply the current `Level` back onto the adapter's underlying entity shape
     * before the dialog calls `.Save()`. For `MJResourcePermission`-backed
     * resources this is a direct `PermissionLevel =` assignment; for
     * `MJDashboardPermission` it translates to the four `Can*` booleans.
     */
    SyncLevelToEntity(row: ResourceSharePermissionModel): void;

    /**
     * Called after all saves/deletes succeed — a hook for cache refresh
     * (e.g., `DashboardEngine.Config(true)`). Optional.
     */
    AfterSave?(context: ResourceShareContext): Promise<void>;
}
