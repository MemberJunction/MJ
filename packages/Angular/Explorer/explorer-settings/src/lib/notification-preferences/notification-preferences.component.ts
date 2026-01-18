import { Component, OnInit } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { UserNotificationTypeEntity, UserNotificationPreferenceEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

interface NotificationPreferenceViewModel {
  type: UserNotificationTypeEntity;
  preference: UserNotificationPreferenceEntity | null;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  changed: boolean;
  originalInAppEnabled: boolean;
  originalEmailEnabled: boolean;
  originalSmsEnabled: boolean;
}

@Component({
  selector: 'mj-notification-preferences',
  templateUrl: './notification-preferences.component.html',
  styleUrls: ['./notification-preferences.component.scss'],
})
export class NotificationPreferencesComponent implements OnInit {
  loading = true;
  saving = false;
  viewModels: NotificationPreferenceViewModel[] = [];
  hasChanges = false;

  constructor(private sharedService: SharedService) {}

  async ngOnInit() {
    await this.loadData();
  }

  private async loadData() {
    try {
      this.loading = true;
      const md = new Metadata();
      const rv = new RunView();
      const currentUser = md.CurrentUser;

      // Load all notification types
      const typesResult = await rv.RunView<UserNotificationTypeEntity>({
        EntityName: 'MJ: User Notification Types',
        OrderBy: 'Priority ASC, Name ASC',
        ResultType: 'entity_object',
      });

      if (!typesResult.Success) {
        throw new Error('Failed to load notification types');
      }

      // Load user's existing preferences
      const prefsResult = await rv.RunView<UserNotificationPreferenceEntity>({
        EntityName: 'MJ: User Notification Preferences',
        ExtraFilter: `UserID='${currentUser.ID}'`,
        ResultType: 'entity_object',
      });

      if (!prefsResult.Success) {
        throw new Error('Failed to load user preferences');
      }

      // Build view models
      this.viewModels = (typesResult.Results || []).map((type) => {
        const existingPref = (prefsResult.Results || []).find((p) => p.NotificationTypeID === type.ID);

        // Get channel values: user preference > type default
        const inAppEnabled = existingPref?.InAppEnabled ?? type.DefaultInApp ?? true;
        const emailEnabled = existingPref?.EmailEnabled ?? type.DefaultEmail ?? false;
        const smsEnabled = existingPref?.SMSEnabled ?? type.DefaultSMS ?? false;

        return {
          type,
          preference: existingPref || null,
          inAppEnabled,
          emailEnabled,
          smsEnabled,
          changed: false,
          originalInAppEnabled: inAppEnabled,
          originalEmailEnabled: emailEnabled,
          originalSmsEnabled: smsEnabled,
        };
      });

      this.loading = false;
    } catch (error: unknown) {
      this.loading = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sharedService.CreateSimpleNotification(`Failed to load notification preferences: ${message}`, 'error', 3000);
    }
  }

  onChannelChange(vm: NotificationPreferenceViewModel) {
    vm.changed = vm.inAppEnabled !== vm.originalInAppEnabled || vm.emailEnabled !== vm.originalEmailEnabled || vm.smsEnabled !== vm.originalSmsEnabled;
    this.hasChanges = this.viewModels.some((v) => v.changed);
  }

  async save() {
    try {
      this.saving = true;
      const md = new Metadata();
      const currentUser = md.CurrentUser;
      const transGroup = await md.CreateTransactionGroup();

      // Prepare all saves in parallel
      const savePromises = this.viewModels.filter((v) => v.changed).map(async (vm) => {
        let pref = vm.preference;

        if (!pref) {
          // Create new preference record
          pref = await md.GetEntityObject<UserNotificationPreferenceEntity>('MJ: User Notification Preferences');
          pref.UserID = currentUser.ID;
          pref.NotificationTypeID = vm.type.ID;
          vm.preference = pref;
        }

        // Set Enabled based on whether any channel is enabled
        pref.Enabled = vm.inAppEnabled || vm.emailEnabled || vm.smsEnabled;

        // Set the boolean channel fields
        pref.InAppEnabled = vm.inAppEnabled;
        pref.EmailEnabled = vm.emailEnabled;
        pref.SMSEnabled = vm.smsEnabled;
        pref.TransactionGroup = transGroup;
        await pref.Save();
      });

      await Promise.all(savePromises);
      const success = await transGroup.Submit();

      if (success) {
        // Cache refresh happens automatically in UserNotificationPreferenceEntityExtended.Save()

        // Update original values
        this.viewModels.forEach((vm) => {
          vm.originalInAppEnabled = vm.inAppEnabled;
          vm.originalEmailEnabled = vm.emailEnabled;
          vm.originalSmsEnabled = vm.smsEnabled;
          vm.changed = false;
        });

        this.hasChanges = false;
        this.sharedService.CreateSimpleNotification('Notification preferences saved successfully', 'success', 2500);
      } else {
        throw new Error('Failed to save preferences');
      }

      this.saving = false;
    } catch (error: unknown) {
      this.saving = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sharedService.CreateSimpleNotification(`Failed to save preferences: ${message}`, 'error', 3000);
    }
  }

  cancel() {
    // Revert changes
    this.viewModels.forEach((vm) => {
      vm.inAppEnabled = vm.originalInAppEnabled;
      vm.emailEnabled = vm.originalEmailEnabled;
      vm.smsEnabled = vm.originalSmsEnabled;
      vm.changed = false;
    });
    this.hasChanges = false;
  }

  getTypeIcon(type: UserNotificationTypeEntity): string {
    return type.Icon || 'fa-bell';
  }

  getTypeColor(type: UserNotificationTypeEntity): string {
    return type.Color || '#999';
  }

  getTypeAutoExpireDays(type: UserNotificationTypeEntity): number | null {
    return type.AutoExpireDays || null;
  }

  getAllowUserPreference(type: UserNotificationTypeEntity): boolean {
    return type.AllowUserPreference !== false;
  }
}
