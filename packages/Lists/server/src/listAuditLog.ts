import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { AuditLogTypeEngine, MJAuditLogEntity } from '@memberjunction/core-entities';

/** What one List audit row records. */
export interface ListAuditLogEntry {
  /** The `MJ: Audit Log Types` name, e.g. "List Shared". */
  Type: string;
  ListID: string;
  Description: string;
  Details: Record<string, unknown>;
}

/**
 * Writes one audit row against a list. Best effort: a failure is logged and never fails the
 * operation that called it. The type is looked up by name through `AuditLogTypeEngine`, so call
 * sites stay readable and survive a change to the seeded IDs.
 */
export async function EmitListAuditLog(
  entry: ListAuditLogEntry,
  md: Metadata,
  contextUser: UserInfo,
  provider?: IMetadataProvider,
): Promise<void> {
  try {
    const typeId = await auditLogTypeId(entry.Type, contextUser, provider);
    const log = await md.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', contextUser);
    log.NewRecord();
    log.UserID = contextUser.ID;
    log.AuditLogTypeID = typeId;
    log.Status = 'Success';
    log.Description = entry.Description;
    log.Details = JSON.stringify(entry.Details);
    const listEntity = md.EntityByName('MJ: Lists');
    if (listEntity) log.EntityID = listEntity.ID;
    log.RecordID = entry.ListID;
    if (!(await log.Save())) {
      LogError(`Audit log save failed: ${log.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
  } catch (e) {
    LogError(`EmitListAuditLog threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function auditLogTypeId(name: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<string> {
  await AuditLogTypeEngine.Instance.Config(false, contextUser, provider);
  const type = AuditLogTypeEngine.Instance.ByName(name);
  if (!type) {
    throw new Error(`MJ: Audit Log Types row "${name}" not found. Seed metadata/audit-log-types/ with 'mj sync push'.`);
  }
  return type.ID;
}
