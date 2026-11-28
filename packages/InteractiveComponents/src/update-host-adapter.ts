/**
 * Unified Update Host Adapter contract for Web (`SwUpdate`), Mobile (`expo-updates`/Store),
 * and Desktop (`electron-updater`) shells (Wave S0, P18).
 *
 * Framework-free contract and deterministic state-machine transition validators.
 */

import { IsNonEmptyString, IsPlainObject } from './json-types';

/**
 * Lifecycle states of the unified host update state machine.
 */
export const UPDATE_STATUSES = [
    'idle',
    'checking',
    'downloading',
    'ready-to-apply',
    'store-upgrade-required',
] as const;

/**
 * Update status union.
 */
export type UpdateStatus = (typeof UPDATE_STATUSES)[number];

/**
 * Supported host platforms implementing {@link UpdateHostAdapter}.
 */
export const UPDATE_PLATFORMS = ['web', 'mobile', 'desktop'] as const;

/**
 * Host platform identifier.
 */
export type UpdatePlatform = (typeof UPDATE_PLATFORMS)[number];

/**
 * Machine-readable failure codes surfaced on {@link UpdateStateSnapshot.error}
 * when an update check, download, verification, or apply operation fails and
 * reverts to `'idle'`.
 */
export const UPDATE_ERROR_CODES = [
    'network-offline',
    'check-failed',
    'download-failed',
    'signature-invalid',
    'apply-failed',
    'unsupported-platform',
    'unexpected-error',
] as const;

/**
 * Error code union for {@link UpdateErrorDescriptor}.
 */
export type UpdateErrorCode = (typeof UPDATE_ERROR_CODES)[number];

/**
 * Structured error metadata attached to {@link UpdateStateSnapshot.error} when
 * a check or download fails and returns the state machine to `'idle'`.
 */
export interface UpdateErrorDescriptor {
    code: UpdateErrorCode;
    message: string;
    recoverable: boolean;
    timestamp?: string;
}

/** Minimum download progress percentage (0%). */
export const MIN_UPDATE_DOWNLOAD_PROGRESS = 0; // Lower bound of normalized 0-100 download progress percentage
/** Maximum download progress percentage (100%). */
export const MAX_UPDATE_DOWNLOAD_PROGRESS = 100; // Upper bound of normalized 0-100 download progress percentage
/** Recommended throttle interval (ms) for streaming `downloadProgress` subscriber emissions. */
export const DEFAULT_PROGRESS_EMIT_THROTTLE_MS = 250; // 250ms (<= 4Hz) throttle for downloadProgress notifications across UI shells

/**
 * Immutable snapshot of the host update state observed by UI surfaces.
 */
export interface UpdateStateSnapshot {
    /** Current state-machine status. */
    status: UpdateStatus;
    /** Currently running client version (SemVer or build identifier). */
    currentVersion: string;
    /** Target version discovered or staged for installation, when available. */
    targetVersion?: string;
    /** Minimum client version enforced by backend policy; triggers `'store-upgrade-required'` when current < min. */
    minSupportedClientVersion?: string;
    /** Optional release notes URL for user-facing changelog prompts. */
    releaseNotesUrl?: string;
    /** Normalized download progress percentage in `[0, 100]`. */
    downloadProgress?: number;
    /** Optional host platform tag (`'web' | 'mobile' | 'desktop'`). */
    platform?: UpdatePlatform;
    /** Optional ISO-8601 timestamp of the latest completed update check. */
    lastCheckedAt?: string;
    /** Optional structured error from a failed check, download, or apply attempt. */
    error?: UpdateErrorDescriptor;
}

/**
 * Cleanup callback returned by {@link UpdateHostAdapter.subscribe}.
 */
export type UpdateUnsubscribe = () => void;

/**
 * Listener invoked whenever the host update state snapshot changes.
 */
export type UpdateStateListener = (snapshot: UpdateStateSnapshot) => void;

/**
 * Unified cross-platform adapter interface backed by Angular `SwUpdate` (Web),
 * `expo-updates` / App Store / Play Store (Mobile), or `electron-updater` (Desktop).
 *
 * Host governance expectations:
 * - Concurrent `checkForUpdates()` calls should coalesce onto a single in-flight promise (singleflight).
 * - High-frequency `downloadProgress` events should be throttled (recommended >=
 *   {@link DEFAULT_PROGRESS_EMIT_THROTTLE_MS}ms), always emitting 0% and 100% boundary snapshots.
 * - Transient network, offline, or signature failures transition back to `'idle'` with
 *   {@link UpdateStateSnapshot.error} populated rather than throwing unhandled rejections to UI shells.
 */
export interface UpdateHostAdapter {
    /** Optional platform identifier reported by this adapter implementation. */
    readonly platform?: UpdatePlatform;

    /**
     * Checks for available updates and returns the resulting state snapshot.
     * Implementations should coalesce concurrent in-flight checks.
     */
    checkForUpdates: () => Promise<UpdateStateSnapshot>;

    /**
     * Applies a staged `'ready-to-apply'` update (or triggers native store redirect
     * when configured for `'store-upgrade-required'`).
     */
    applyUpdate: () => Promise<void>;

    /**
     * Subscribes to state snapshot updates and returns an idempotent unsubscribe handle.
     */
    subscribe: (listener: UpdateStateListener) => UpdateUnsubscribe;
}

/**
 * Deterministic state-machine transition table for {@link UpdateStatus}.
 *
 * Key invariants:
 * - `'idle'` cannot jump directly to `'downloading'` or `'ready-to-apply'` without `'checking'`.
 * - `'store-upgrade-required'` cannot transition to OTA `'downloading'` or `'ready-to-apply'`.
 * - Failed checks/downloads revert to `'idle'` with `snapshot.error` populated.
 */
export const UPDATE_STATE_TRANSITIONS: Readonly<Record<UpdateStatus, readonly UpdateStatus[]>> = {
    idle: ['idle', 'checking', 'store-upgrade-required'],
    checking: ['checking', 'idle', 'downloading', 'ready-to-apply', 'store-upgrade-required'],
    downloading: ['downloading', 'ready-to-apply', 'idle', 'store-upgrade-required'],
    'ready-to-apply': ['ready-to-apply', 'idle', 'store-upgrade-required'],
    'store-upgrade-required': ['store-upgrade-required', 'checking'],
};

/**
 * Runtime type guard for {@link UpdateStatus}.
 */
export function IsUpdateStatus(value: unknown): value is UpdateStatus {
    return typeof value === 'string' && (UPDATE_STATUSES as readonly string[]).includes(value);
}

/**
 * Runtime type guard for {@link UpdatePlatform}.
 */
export function IsUpdatePlatform(value: unknown): value is UpdatePlatform {
    return typeof value === 'string' && (UPDATE_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Runtime type guard for {@link UpdateErrorDescriptor}.
 */
export function IsUpdateErrorDescriptor(value: unknown): value is UpdateErrorDescriptor {
    if (!IsPlainObject(value)) {
        return false;
    }
    const code = Reflect.get(value, 'code');
    const message = Reflect.get(value, 'message');
    const recoverable = Reflect.get(value, 'recoverable');
    const timestamp = Reflect.get(value, 'timestamp');

    if (typeof code !== 'string' || !(UPDATE_ERROR_CODES as readonly string[]).includes(code)) {
        return false;
    }
    if (!IsNonEmptyString(message)) {
        return false;
    }
    if (typeof recoverable !== 'boolean') {
        return false;
    }
    if (timestamp !== undefined && !IsNonEmptyString(timestamp)) {
        return false;
    }
    return true;
}

/**
 * Runtime type guard for {@link UpdateStateSnapshot}.
 */
export function IsUpdateStateSnapshot(value: unknown): value is UpdateStateSnapshot {
    if (!IsPlainObject(value)) {
        return false;
    }
    if (!IsUpdateStatus(Reflect.get(value, 'status'))) {
        return false;
    }
    if (!IsNonEmptyString(Reflect.get(value, 'currentVersion'))) {
        return false;
    }
    return validateOptionalSnapshotFields(value);
}

function validateOptionalSnapshotFields(value: object): boolean {
    const optionalStrings = ['targetVersion', 'minSupportedClientVersion', 'releaseNotesUrl', 'lastCheckedAt'];
    for (const field of optionalStrings) {
        if (field in value) {
            const val = Reflect.get(value, field);
            if (val !== undefined && !IsNonEmptyString(val)) {
                return false;
            }
        }
    }
    const progress = Reflect.get(value, 'downloadProgress');
    if (progress !== undefined) {
        if (
            typeof progress !== 'number' ||
            !Number.isFinite(progress) ||
            progress < MIN_UPDATE_DOWNLOAD_PROGRESS ||
            progress > MAX_UPDATE_DOWNLOAD_PROGRESS
        ) {
            return false;
        }
    }
    const platform = Reflect.get(value, 'platform');
    if (platform !== undefined && !IsUpdatePlatform(platform)) {
        return false;
    }
    const error = Reflect.get(value, 'error');
    if (error !== undefined && !IsUpdateErrorDescriptor(error)) {
        return false;
    }
    return true;
}

/**
 * Checks whether transitioning from `from` status to `to` status is permitted
 * by {@link UPDATE_STATE_TRANSITIONS}.
 */
export function IsValidUpdateTransition(from: UpdateStatus, to: UpdateStatus): boolean {
    if (!IsUpdateStatus(from) || !IsUpdateStatus(to)) {
        return false;
    }
    return UPDATE_STATE_TRANSITIONS[from].includes(to);
}

/**
 * Validates a full {@link UpdateStateSnapshot} transition (`prev -> next`),
 * checking both state-machine edge validity and snapshot invariants
 * (monotonic `downloadProgress`, completion at 100%, valid snapshot shapes).
 */
export function ValidateUpdateTransition(
    prev: UpdateStateSnapshot,
    next: UpdateStateSnapshot
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!IsUpdateStateSnapshot(prev)) {
        errors.push('Previous snapshot is invalid.');
    }
    if (!IsUpdateStateSnapshot(next)) {
        errors.push('Next snapshot is invalid.');
    }
    if (errors.length > 0) {
        return { valid: false, errors };
    }

    if (!IsValidUpdateTransition(prev.status, next.status)) {
        errors.push(`Invalid update state transition: "${prev.status}" -> "${next.status}".`);
    }
    if (
        prev.status === 'downloading' &&
        next.status === 'downloading' &&
        prev.downloadProgress !== undefined &&
        next.downloadProgress !== undefined &&
        next.downloadProgress < prev.downloadProgress
    ) {
        errors.push(
            `Download progress cannot regress (${prev.downloadProgress}% -> ${next.downloadProgress}%).`
        );
    }
    if (
        next.status === 'ready-to-apply' &&
        next.downloadProgress !== undefined &&
        next.downloadProgress !== MAX_UPDATE_DOWNLOAD_PROGRESS
    ) {
        errors.push(
            `Snapshot in "ready-to-apply" status must have downloadProgress === ${MAX_UPDATE_DOWNLOAD_PROGRESS} when provided.`
        );
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Runtime type guard for {@link UpdateHostAdapter}.
 */
export function IsUpdateHostAdapter(value: unknown): value is UpdateHostAdapter {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const platform = Reflect.get(value, 'platform');
    if (platform !== undefined && !IsUpdatePlatform(platform)) {
        return false;
    }
    return (
        typeof Reflect.get(value, 'checkForUpdates') === 'function' &&
        typeof Reflect.get(value, 'applyUpdate') === 'function' &&
        typeof Reflect.get(value, 'subscribe') === 'function'
    );
}
