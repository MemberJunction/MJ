/**
 * @fileoverview Privileged-dispatch elevation for public web-widget guests (public-web-widget.md
 * Phase 0). A widget guest's session JWT authorizes ONLY its own Conversation + Conversation
 * Details (RLS-scoped). The agent itself runs under a TRUSTED SERVER PRINCIPAL — so a guest needs
 * no grants to WRITE the AI run entities, and cannot run an arbitrary agent under the elevated
 * principal: the pinned agent is resolved AUTHORITATIVELY from the widget instance named by the
 * signed `mj_widget_id` claim, never from a client-supplied agent id.
 *
 * The companion read-side control is the `Widget Guest: Own Agent Runs` RLS filter (seeded in the
 * Phase 0 migration), which confines a guest to reading only its own session's run rows — closing
 * the cross-guest leak for the voice path, where runs are still written under the guest principal.
 *
 * @module @memberjunction/server/widget
 */

import { RunView, LogError, type UserInfo, type DatabaseProviderBase } from '@memberjunction/core';
import type { MJConversationWidgetInstanceEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import type { UserPayload } from '../types.js';

const WIDGET_ENTITY = 'MJ: Conversation Widget Instances';

/**
 * Resolved elevation context for a widget-guest agent run. Returned only when the request is a
 * widget guest; the dispatch resolver runs the agent under {@link WidgetGuestRunContext.elevatedUser}
 * with {@link WidgetGuestRunContext.pinnedAgentId} (authoritative), keeping ownership checks under
 * the guest principal.
 */
export interface WidgetGuestRunContext {
  /** The trusted server principal under which the agent run (and its run-entity writes) executes. */
  elevatedUser: UserInfo;
  /** The widget instance the guest session is bound to (authoritative config). */
  widget: MJConversationWidgetInstanceEntity;
  /** The authoritative pinned support agent id — overrides any client-supplied agent id (D5). */
  pinnedAgentId: string;
  /** The guest's per-session scope id (Conversation.ExternalID), used to validate conversation ownership. */
  sessionScopeId?: string;
}

/**
 * Returns elevation context when the request is a public web-widget guest, else `null` (the common
 * case — every non-widget request). A widget guest is identified by the synthesized principal's
 * `IsMagicLinkAnonymous` flag plus a `WidgetGuestContext.WidgetID` (sourced from the signed
 * `mj_widget_id` claim by `buildMagicLinkSessionUser`). The widget instance is loaded under the
 * SYSTEM principal so resolving the pinned agent does not depend on the guest's narrow grants.
 *
 * Never throws: a resolution failure (no system user, widget not found, read error) returns `null`,
 * so the caller falls back to the normal (guest-principal) path rather than failing the request.
 */
export async function resolveWidgetGuestRunContext(
  userPayload: UserPayload,
  provider: DatabaseProviderBase,
): Promise<WidgetGuestRunContext | null> {
  const guest = userPayload?.userRecord as UserInfo | undefined;
  const widgetId = guest?.WidgetGuestContext?.WidgetID;
  if (!guest?.IsMagicLinkAnonymous || !widgetId) {
    return null;
  }

  const elevatedUser = UserCache.Instance.GetSystemUser();
  if (!elevatedUser) {
    LogError('[Widget] Cannot elevate widget-guest agent run: no system user available.');
    return null;
  }

  const widget = await loadWidgetById(widgetId, elevatedUser, provider);
  if (!widget) {
    LogError(`[Widget] Widget instance ${widgetId} (from token) not found; cannot elevate dispatch.`);
    return null;
  }

  return {
    elevatedUser,
    widget,
    pinnedAgentId: widget.PinnedAgentID,
    sessionScopeId: guest.MagicLinkScope?.ResourceID,
  };
}

/**
 * Builds an elevated {@link UserPayload} that runs subsequent agent work as `elevatedUser` while
 * preserving the guest's `sessionId` — so progress/streaming PubSub still routes to the guest's
 * live websocket, but all AI run-entity writes happen under the trusted server principal.
 */
export function elevateUserPayload(userPayload: UserPayload, elevatedUser: UserInfo): UserPayload {
  return {
    ...userPayload,
    email: elevatedUser.Email,
    userRecord: elevatedUser,
    isSystemUser: true,
  };
}

/** Loads a single widget instance by id under the elevated principal (read-only). */
async function loadWidgetById(
  widgetId: string,
  elevatedUser: UserInfo,
  provider: DatabaseProviderBase,
): Promise<MJConversationWidgetInstanceEntity | null> {
  const rv = new RunView(provider);
  const result = await rv.RunView<MJConversationWidgetInstanceEntity>(
    {
      EntityName: WIDGET_ENTITY,
      ExtraFilter: `ID = '${widgetId.replace(/'/g, "''")}'`,
      MaxRows: 1,
      ResultType: 'entity_object',
    },
    elevatedUser,
  );
  if (!result.Success) {
    LogError(`[Widget] Failed to load widget instance ${widgetId}: ${result.ErrorMessage}`);
    return null;
  }
  return result.Results?.[0] ?? null;
}
