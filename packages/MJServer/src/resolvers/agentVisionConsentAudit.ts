/**
 * @fileoverview The audit trail for agent-vision consent: one `MJ: Audit Logs` row each time a person allows, or stops
 * letting, agents see their camera and shared screen in a meeting room, including when LiveKit refuses the change.
 *
 * The row is saved by the system user, as MJ's other server-written audit rows are, because the person may not be
 * allowed to create audit rows themselves; `UserID` and `RecordID` are the person. When the audit log type has not
 * been seeded, the entry goes to the server log instead, so a choice is never left unrecorded.
 *
 * Invoked from `RealtimeBridgeResolver.SetLiveKitAgentVision`.
 *
 * @module @memberjunction/server
 */

import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAuditLogEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';

/** The seeded audit log type (see `metadata/audit-log-types/.realtime-session-audit-types.json`). */
export const REALTIME_AGENT_VISION_CONSENT_AUDIT_TYPE = 'Realtime Agent Vision Consent';

const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';
const USERS_ENTITY = 'MJ: Users';

/** One consent change to record. */
export interface AgentVisionConsentEntry {
  /** The person who chose. */
  User: UserInfo;
  /** The room they chose for. */
  RoomName: string;
  /** `true` to let agents see their camera and shared screen, `false` to stop. */
  Allow: boolean;
  /** Whether LiveKit applied the change. */
  Applied: boolean;
  /** Why it was not applied. */
  ErrorMessage?: string;
}

/**
 * Writes the audit row for one consent change. Never throws: a failure to audit is logged, and the person's choice
 * stands as LiveKit applied it.
 *
 * @param entry The change to record.
 * @param provider The request's provider.
 */
export async function WriteAgentVisionConsentAudit(entry: AgentVisionConsentEntry, provider: IMetadataProvider | null): Promise<void> {
  try {
    const writer = UserCache.Instance.GetSystemUser();
    const type = provider?.AuditLogTypes?.find((t) => t.Name?.trim().toLowerCase() === REALTIME_AGENT_VISION_CONSENT_AUDIT_TYPE.toLowerCase());
    if (!provider || !writer || !type) {
      LogError(`Agent vision consent not audited (${missingReason(provider, writer)}): user ${entry.User.ID}: ${describeChange(entry)}`);
      return;
    }
    const row = await provider.GetEntityObject<MJAuditLogEntity>(AUDIT_LOG_ENTITY, writer);
    row.NewRecord();
    row.UserID = entry.User.ID;
    row.AuditLogTypeID = type.ID;
    row.Status = entry.Applied ? 'Success' : 'Failed';
    row.EntityID = provider.EntityByName(USERS_ENTITY)?.ID ?? null;
    row.RecordID = entry.User.ID;
    row.Description = describeChange(entry);
    row.Details = JSON.stringify({ roomName: entry.RoomName, allow: entry.Allow, error: entry.ErrorMessage ?? null });
    if (!(await row.Save())) {
      LogError(`Agent vision consent audit row not saved for user ${entry.User.ID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  } catch (error) {
    LogError(`Agent vision consent audit write threw for user ${entry.User.ID}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Why the audit row can't be written: no provider, no system user, or the audit log type isn't seeded. */
function missingReason(provider: IMetadataProvider | null, writer: UserInfo | undefined | null): string {
  if (!provider) {
    return 'no provider';
  }
  return writer ? `audit log type '${REALTIME_AGENT_VISION_CONSENT_AUDIT_TYPE}' is not seeded` : 'no system user';
}

/** One line saying what the person chose, and whether it was applied. */
function describeChange(entry: AgentVisionConsentEntry): string {
  const choice = entry.Allow ? 'Let agents see their camera and shared screen' : 'Stopped letting agents see their camera and shared screen';
  return `${choice} in room ${entry.RoomName}${entry.Applied ? '' : ' (not applied)'}.`;
}
