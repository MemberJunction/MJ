/**
 * @fileoverview Resolves the principal an INBOUND telephony call runs as.
 *
 * An inbound caller is an anonymous member of the public — there is no MJ session to inherit a user from.
 * The call still needs *some* `contextUser` to create the agent session, run the agent and write its rows.
 * Earlier builds fell back to the system user (or the first Owner), which meant every stranger who dialed a
 * number ran an agent with the platform's highest privileges.
 *
 * The call now runs as one explicitly configured user — `telephony.inboundRunAsUserEmail`, ideally a
 * dedicated least-privilege account. There is deliberately **no fallback**: if it is unset, unknown,
 * inactive, or is the system user, the call is rejected rather than silently elevated.
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';

/** The user lookups {@link ResolveInboundRunAsUser} needs — injectable so the rules are unit-testable. */
export interface RunAsUserDirectory {
    /** Finds a user by email (case-insensitive, trimmed), or `undefined`. */
    FindByEmail(email: string): UserInfo | undefined;
    /** The platform system user, or `undefined` when none is loaded. */
    GetSystemUser(): UserInfo | undefined;
}

/** Outcome of resolving the inbound run-as user: the user, or why none can be used. */
export type RunAsResolution = { Ok: true; User: UserInfo } | { Ok: false; Reason: string };

/** The production directory, backed by the process-wide {@link UserCache}. */
export const UserCacheDirectory: RunAsUserDirectory = {
    FindByEmail: (email) => {
        const wanted = email.trim().toLowerCase();
        return UserCache.Users.find((u) => u.Email?.trim().toLowerCase() === wanted);
    },
    GetSystemUser: () => UserCache.Instance.GetSystemUser(),
};

/** Run-as users already warned about, so the Owner warning is logged once per process per user. */
const ownerWarnedUserIds = new Set<string>();

/** Whether the user is an Owner-type user (the highest-privilege MJ user type). */
function isOwner(user: UserInfo): boolean {
    return user.Type?.trim().toLowerCase() === 'owner';
}

/** Logs (once per process per user) that inbound callers will run with Owner privileges. */
function warnOnceIfOwner(user: UserInfo): void {
    const key = user.ID.toLowerCase();
    if (!isOwner(user) || ownerWarnedUserIds.has(key)) {
        return;
    }
    ownerWarnedUserIds.add(key);
    LogStatus(
        `[Telephony] WARNING: telephony.inboundRunAsUserEmail '${user.Email}' is an Owner. Every anonymous inbound caller will run ` +
            'agents with Owner privileges. Use a dedicated least-privilege user instead.',
    );
}

/**
 * Resolves `telephony.inboundRunAsUserEmail` to the user an inbound call runs as.
 *
 * Rejects (never falls back) when the setting is blank, names no known user, names an inactive user, or
 * names the system user. An Owner is still allowed, but logs a one-time warning that callers get Owner privileges.
 *
 * @param configuredEmail The configured email (may be undefined/blank).
 * @param directory User lookups (defaults to the {@link UserCache}).
 * @returns The user, or a human-readable reason suitable for the log.
 */
export function ResolveInboundRunAsUser(
    configuredEmail: string | undefined,
    directory: RunAsUserDirectory = UserCacheDirectory,
): RunAsResolution {
    const email = configuredEmail?.trim();
    if (!email) {
        return { Ok: false, Reason: "telephony.inboundRunAsUserEmail is not configured; inbound calls are refused until it names a dedicated user." };
    }
    const user = directory.FindByEmail(email);
    if (!user) {
        return { Ok: false, Reason: `telephony.inboundRunAsUserEmail '${email}' does not match any user.` };
    }
    if (!user.IsActive) {
        return { Ok: false, Reason: `telephony.inboundRunAsUserEmail '${email}' names an inactive user.` };
    }
    const systemUser = directory.GetSystemUser();
    if (systemUser && UUIDsEqual(systemUser.ID, user.ID)) {
        return { Ok: false, Reason: `telephony.inboundRunAsUserEmail '${email}' is the system user; configure a dedicated least-privilege user instead.` };
    }
    warnOnceIfOwner(user);
    return { Ok: true, User: user };
}

/** The principal + provider an inbound call runs with, or why the call cannot be admitted. */
export type InboundContextResolution =
    | { Ok: true; User: UserInfo; Provider: IMetadataProvider }
    | { Ok: false; Reason: string };

/**
 * Resolves the full server-side context for an inbound call: the configured run-as user plus the
 * process-global metadata provider (the public webhook has no request-scoped provider).
 *
 * @param configuredEmail The configured `inboundRunAsUserEmail`.
 * @param directory User lookups (defaults to the {@link UserCache}).
 * @param provider The metadata provider (defaults to the global one — webhooks run in server-global context).
 */
export function ResolveInboundContext(
    configuredEmail: string | undefined,
    directory: RunAsUserDirectory = UserCacheDirectory,
    provider: IMetadataProvider | null = Metadata.Provider, // global-provider-ok: inbound telephony webhook runs in server-global provider context
): InboundContextResolution {
    const resolved = ResolveInboundRunAsUser(configuredEmail, directory);
    if (!resolved.Ok) {
        return resolved;
    }
    if (!provider) {
        return { Ok: false, Reason: 'no metadata provider is available.' };
    }
    return { Ok: true, User: resolved.User, Provider: provider };
}
