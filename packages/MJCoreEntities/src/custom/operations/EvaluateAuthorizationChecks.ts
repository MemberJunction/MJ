/**
 * Pure evaluation of named MJ: Authorizations for a user (ancestor walk, fail-closed unknown).
 * No I/O. Authorization.Check uses this; OrderLine.Validate can too.
 */
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AuthorizationInfo, UserInfo } from '@memberjunction/core';
import type { AuthorizationCheckResultRow } from '../../generated/remote_operations';

function findByName(authorizations: AuthorizationInfo[], name: string): AuthorizationInfo | undefined {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return authorizations.find((a) => (a.Name ?? '').trim().toLowerCase() === needle);
}

function findParent(authorizations: AuthorizationInfo[], auth: AuthorizationInfo): AuthorizationInfo | undefined {
    if (!auth.ParentID) return undefined;
    return authorizations.find((a) => UUIDsEqual(a.ID, auth.ParentID));
}

/**
 * Walk from `start` up ParentID. Returns the first node the user can execute, or null.
 */
export function FindMatchingAuthorization(
    start: AuthorizationInfo,
    user: UserInfo,
    authorizations: AuthorizationInfo[],
): AuthorizationInfo | null {
    const visited = new Set<string>();
    let current: AuthorizationInfo | undefined = start;
    while (current) {
        const id = NormalizeUUID(current.ID);
        if (visited.has(id)) break;
        visited.add(id);
        if (current.UserCanExecute(user)) return current;
        current = findParent(authorizations, current);
    }
    return null;
}

export function EvaluateAuthorizationChecks(
    names: string[],
    user: UserInfo,
    authorizations: AuthorizationInfo[],
): AuthorizationCheckResultRow[] {
    const results: AuthorizationCheckResultRow[] = [];
    const seen = new Set<string>();
    for (const raw of names ?? []) {
        const name = (raw ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const start = findByName(authorizations, name);
        if (!start) {
            results.push({
                Name: name,
                Allowed: false,
                Unknown: true,
                ViaAncestor: false,
                MatchedAuthorizationName: null,
            });
            continue;
        }

        const matched = FindMatchingAuthorization(start, user, authorizations);
        results.push({
            Name: name,
            Allowed: !!matched,
            Unknown: false,
            ViaAncestor: !!matched && !UUIDsEqual(matched.ID, start.ID),
            MatchedAuthorizationName: matched?.Name ?? null,
        });
    }
    return results;
}
