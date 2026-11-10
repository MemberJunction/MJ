/**
 * System API key handling for the MCP server.
 *
 * A request that presents the configured system key authenticates as the SYSTEM USER, so the
 * key is the most powerful credential the server accepts. This module holds the two decisions
 * that guard it — "is the configured key fit to be honored at all" and "does the presented key
 * match" — so they can be unit tested without standing up the server.
 */
import { timingSafeEqual } from 'crypto';

/** A system key shorter than this is treated as guessable and never honored. */
export const MIN_SYSTEM_API_KEY_LENGTH = 16;

/**
 * Values that have shipped in example configs. They are publicly known, so a deployment that
 * left one in place must not accept it.
 */
const PLACEHOLDER_SYSTEM_API_KEYS: ReadonlySet<string> = new Set(['MY_API_KEY_FOR_MCP_SERVER']);

/** Why a configured system key is not honored, or `null` when it is usable. */
export type SystemApiKeyRejection = 'missing' | 'placeholder' | 'too-short';

/**
 * Explains why the configured system key cannot be used, or returns `null` when it can.
 * Placeholder matching is case-insensitive: a placeholder is no less public in another case.
 */
export function GetSystemApiKeyRejection(configuredKey: string | null | undefined): SystemApiKeyRejection | null {
    const trimmed = (configuredKey ?? '').trim();
    if (trimmed.length === 0) {
        return 'missing';
    }
    for (const placeholder of PLACEHOLDER_SYSTEM_API_KEYS) {
        if (placeholder.toLowerCase() === trimmed.toLowerCase()) {
            return 'placeholder';
        }
    }
    return trimmed.length < MIN_SYSTEM_API_KEY_LENGTH ? 'too-short' : null;
}

/** True when the configured system key is strong enough to be honored. */
export function IsUsableSystemApiKey(configuredKey: string | null | undefined): boolean {
    return GetSystemApiKeyRejection(configuredKey) === null;
}

/**
 * Compares a presented key with the configured one without short-circuiting on the first
 * differing byte.
 *
 * Both values are copied into zero-padded buffers of the same length, because
 * `timingSafeEqual` throws on a length mismatch. The lengths are then compared separately, so
 * the only thing timing can reveal is the configured key's length. No digest is involved: a
 * fast hash of a credential is what CodeQL's password-hash rule flags, and it adds nothing here.
 */
export function SystemApiKeysMatch(presentedKey: string, configuredKey: string): boolean {
    const presented = Buffer.from(presentedKey, 'utf8');
    const configured = Buffer.from(configuredKey, 'utf8');
    const length = Math.max(presented.length, configured.length, 1);
    const paddedPresented = Buffer.alloc(length);
    const paddedConfigured = Buffer.alloc(length);
    presented.copy(paddedPresented);
    configured.copy(paddedConfigured);
    const sameBytes = timingSafeEqual(paddedPresented, paddedConfigured);
    return sameBytes && presented.length === configured.length;
}

/**
 * Decides whether a presented key authenticates as the system user.
 * A configured key that is missing, a placeholder or too short never matches anything.
 */
export function IsSystemApiKeyMatch(presentedKey: string, configuredKey: string | null | undefined): boolean {
    if (!configuredKey || !IsUsableSystemApiKey(configuredKey)) {
        return false;
    }
    return SystemApiKeysMatch(presentedKey, configuredKey.trim());
}

/** Operator-facing explanation for a system key that was configured but is not honored. */
export function DescribeSystemApiKeyRejection(rejection: SystemApiKeyRejection): string {
    switch (rejection) {
        case 'placeholder':
            return 'the configured system API key is a published placeholder value';
        case 'too-short':
            return `the configured system API key is shorter than ${MIN_SYSTEM_API_KEY_LENGTH} characters`;
        case 'missing':
            return 'no system API key is configured';
    }
}
