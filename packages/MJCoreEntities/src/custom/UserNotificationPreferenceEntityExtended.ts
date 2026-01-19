import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { UserNotificationPreferenceEntity } from '../generated/entity_subclasses';
import { RegisterClass } from '@memberjunction/global';
import { UserInfoEngine } from '../engines/UserInfoEngine';

@RegisterClass(BaseEntity, 'MJ: User Notification Preferences')
export class UserNotificationPreferenceEntityExtended extends UserNotificationPreferenceEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    // Update cache before database write (arrow-shot-through pattern)
    // This runs on both client and server for immediate cache consistency
    UserInfoEngine.Instance.UpdatePreferenceInCache(
      this.ID,
      this.UserID,
      this.NotificationTypeID,
      this.Enabled,
      this.InAppEnabled,
      this.EmailEnabled,
      this.SMSEnabled
    );
    return super.Save(options);
  }
}

//Avoid tree shaking
export function LoadUserNotificationPreferenceEntityExtended(): void {
// Intentionally empty
}