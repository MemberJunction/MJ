/**
 * @fileoverview The contract a host passes to a runtime-UX driver. Framework-agnostic data only — the
 * entity being acted on, the scope of rows, and a driver-specific config bag — so a driver never needs to
 * know how the grid/list above it works.
 * @module @memberjunction/ng-entity-action-ux
 */
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';

/** How a driver's work is scoped — mirrors the engine's `RecordProcessScopeOverride`. */
export type EntityActionUXScopeKind = 'records' | 'view' | 'list' | 'filter';

/**
 * Everything a runtime-UX driver needs to do its job, assembled by the host from the grid/list state and
 * the entity action's configured params.
 */
export interface EntityActionUXContext {
    /** The entity being acted on. */
    EntityInfo: EntityInfo;
    /** How the target rows are scoped. */
    ScopeKind: EntityActionUXScopeKind;
    /** Selected row primary-key values (when `ScopeKind === 'records'`). */
    SelectedRecordIDs?: string[];
    /** Source view ID (when `ScopeKind === 'view'`). */
    ViewID?: string;
    /** Source list ID (when `ScopeKind === 'list'`). */
    ListID?: string;
    /** Filter expression (when `ScopeKind === 'filter'`). */
    Filter?: string;
    /**
     * Driver-specific configuration resolved from the entity action's params — e.g. the `RecordProcessID`
     * the {@link RecordProcessRunnerUXComponent} should run. Opaque to the framework.
     */
    Config?: Record<string, unknown>;
    /** Acting user (server-side calls; client-side may omit). */
    ContextUser?: UserInfo;
    /**
     * The metadata provider this work runs under (multi-provider support). When the host omits it, drivers
     * fall back to the global default provider. Drivers that issue a `RunView` / GraphQL call should scope
     * to this provider when present.
     */
    Provider?: IMetadataProvider;
    /** Display label for the action (used in driver headers when present). */
    ActionLabel?: string;
}

/** A driver's terminal outcome, emitted to the host. */
export interface EntityActionUXResult {
    /** True when the driver applied work; false when the user backed out without applying. */
    Completed: boolean;
    /** When true, the host should refresh the underlying grid/list (data changed). */
    RefreshData?: boolean;
    /** Optional human-readable summary (e.g. "Updated 42 records"). */
    Message?: string;
}
