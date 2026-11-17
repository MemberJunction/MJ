/**
 * @module registry/record-notification-links
 *
 * `RecordNotificationLinks` — the record link of a Predictive Studio `MJ: User Notifications` row: the `Records`
 * resource type (`ResourceTypeID`), the record's ID (`ResourceRecordID`) and the `ResourceConfiguration` JSON whose
 * `Entity` member Explorer's notification list reads to open the record (`RecordResourceConfig.Entity`,
 * `user-notifications.component.ts`). Shared by the drift alert (`DefaultDriftAlertEmitter`) and the lifecycle
 * gate's notifications (`PublishNotifications`), so the two never resolve the link differently.
 */
import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ResourceTypeEngine } from '@memberjunction/core-entities';

/** The `ResourceConfiguration` of a record link: the entity the record belongs to and its ID. */
export interface RecordResourceConfiguration {
  /** The entity's name, as Explorer's Records resource reads it (`?Entity=`). */
  readonly Entity: string;
  /** The record's ID (the notification's `ResourceRecordID`). */
  readonly RecordID: string;
}

/** Resolves the parts of a notification's record link. */
export class RecordNotificationLinks {
  /** The `MJ: Resource Types` row whose notifications link to one record of an entity. */
  public static readonly RecordsResourceTypeName = 'Records';

  /**
   * The `Records` resource type's ID, through {@link ResourceTypeEngine} on `provider` as `contextUser`; null (with a
   * `LogError` naming why) when it is not seeded or the engine cannot load, so the caller still sends its notification,
   * without the link.
   *
   * @param source who is asking, for the log line (e.g. `DefaultDriftAlertEmitter`)
   * @param notification what the caller is sending, for the log line (e.g. `drift alert`)
   */
  public static async RecordsResourceTypeID(provider: IMetadataProvider, contextUser: UserInfo | undefined, source: string, notification: string): Promise<string | null> {
    try {
      await ResourceTypeEngine.Instance.Config(false, contextUser, provider);
    } catch (error) {
      LogError(`${source}: the resource types could not be loaded; the ${notification} has no record link: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const resourceType = ResourceTypeEngine.Instance.ByName(RecordNotificationLinks.RecordsResourceTypeName);
    if (!resourceType) {
      LogError(`${source}: no '${RecordNotificationLinks.RecordsResourceTypeName}' resource type is seeded; the ${notification} has no record link.`);
      return null;
    }
    return resourceType.ID;
  }
}
