import { Component, OnInit } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { UserNotificationTypeEntity, UserNotificationPreferenceEntity, UserInfoEngine } from '@memberjunction/core-entities';
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

      // UserInfoEngine is auto-configured via @RegisterForStartup()
      // NotificationEngine (server-side) loads notification types into global cache
      // UserInfoEngine provides a getter to access them from both client and server

      // Get notification types from UserInfoEngine, sorted client-side
      const types = [...UserInfoEngine.Instance.NotificationTypes].sort((a, b) => {
        const priorityA = a.Priority ?? 999;
        const priorityB = b.Priority ?? 999;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.Name.localeCompare(b.Name);
      });

      // Get preferences from UserInfoEngine (entity objects - can be mutated)
      const prefs = UserInfoEngine.Instance.NotificationPreferences;

      // Build view models from cached data
      this.viewModels = types.map((type) => {
        const existingPref = prefs.find((p) => p.NotificationTypeID === type.ID);

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

      // Queue all saves in transaction group - no need to await individual saves
      // Transaction group queues them and submits all in one batch
      for (const vm of this.viewModels.filter((v) => v.changed)) {
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
        // Don't await - Save() with transaction group queues immediately
        pref.Save();
      }

      // Submit transaction group - this is where the actual network call happens
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
