/**
 * @fileoverview The `Realtime: Advanced Session Controls` authorization check — the ONE copy of the
 * fail-closed decision that gates **per-session prompt/config influence** across every realtime
 * surface MJServer exposes.
 *
 * Two surfaces need the identical answer: the CLIENT-DIRECT start
 * ({@link import('./RealtimeClientSessionResolver.js').RealtimeClientSessionResolver}, gating
 * `configOverridesJson` + a deviating explicit model) and the BRIDGED room start
 * ({@link import('./RealtimeBridgeResolver.js').RealtimeBridgeResolver}, gating a room seat's
 * caller-supplied `Instructions`). It lives here rather than being duplicated because the two copies
 * would have to agree on the failure DIRECTION — an authorization row that is missing from metadata
 * must DENY, not allow — and a second copy is exactly where that inverts unnoticed.
 *
 * @module @memberjunction/server
 */
import { AuthorizationEvaluator, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION } from '@memberjunction/ai-agents';

/**
 * Hierarchy-aware check for the `Realtime: Advanced Session Controls` authorization against the
 * request provider's cached Authorizations + the caller's roles.
 *
 * **FAIL-CLOSED**: an absent provider, an absent authorization row (un-synced seed), or an evaluation
 * error all DENY — these controls are a privileged path, and an unauthorized caller still gets a fully
 * working session without them, so denial costs a feature while a wrong allow costs the guarantee.
 *
 * @param contextUser The calling user.
 * @param provider The request-scoped metadata provider (its cached `Authorizations` are the source).
 * @param surface The calling mutation, for log attribution (e.g. `StartLiveKitAgentRoomSession`).
 * @returns `true` only when the caller demonstrably holds the authorization.
 */
export function UserHasRealtimeAdvancedSessionControls(
  contextUser: UserInfo,
  provider: IMetadataProvider | null | undefined,
  surface: string,
): boolean {
  try {
    const auths = provider?.Authorizations ?? [];
    const wanted = REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION.trim().toLowerCase();
    const auth = auths.find((a) => a.Name?.trim().toLowerCase() === wanted);
    if (!auth) {
      LogError(
        `${surface}: the '${REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION}' authorization is not ` +
          'present in metadata — advanced session controls are denied (fail closed). Sync the ' +
          'authorization seed metadata to enable them.',
      );
      return false;
    }
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(auth, contextUser, auths);
  } catch (error) {
    LogError(
      `${surface}: authorization evaluation failed (${error instanceof Error ? error.message : String(error)}) — ` +
        'advanced session controls are denied (fail closed).',
    );
    return false;
  }
}
