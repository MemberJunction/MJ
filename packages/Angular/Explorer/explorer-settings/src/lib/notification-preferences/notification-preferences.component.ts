import { Component, OnInit } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { MJUserNotificationTypeEntity, MJUserNotificationPreferenceEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
/**
 * View model for managing notification preferences in the UI.
 * Combines notification type definition with user's current preferences and change tracking.
 */
interface NotificationPreferenceViewModel {
  /** The notification type definition (read-only) */
  type: MJUserNotificationTypeEntity;
  /** User's existing preference record, or null if not yet set */
  preference: MJUserNotificationPreferenceEntity | null;
  /** Current state: In-app notifications enabled */
  inAppEnabled: boolean;
  /** Current state: Email notifications enabled */
  emailEnabled: boolean;
  /** Current state: SMS notifications enabled */
  smsEnabled: boolean;
  /** Whether this preference has been modified by the user */
  changed: boolean;
  /** Original value for rollback: In-app enabled state */
  originalInAppEnabled: boolean;
  /** Original value for rollback: Email enabled state */
  originalEmailEnabled: boolean;
  /** Original value for rollback: SMS enabled state */
  originalSmsEnabled: boolean;
}

/**
 * Component for managing user notification preferences.
 *
 * Displays notification types with configurable delivery channels (in-app, email, SMS).
 * Users can customize which channels they want to receive notifications through,
 * unless the notification type restricts user customization.
 *
 * Uses Material Design 3 (MD3) styling principles for consistent, accessible UI.
 *
 * Data flow:
 * - Loads notification types from UserInfoEngine (global cache)
 * - Loads user preferences from UserInfoEngine (per-user cache)
 * - Saves preferences using transaction groups for batch updates
 */
@Component({
  standalone: false,
  selector: 'mj-notification-preferences',
  templateUrl: './notification-preferences.component.html',
  styleUrls: ['./notification-preferences.component.css'],
})
export class NotificationPreferencesComponent extends BaseAngularComponent implements OnInit {
  Loading = true;

  /** @deprecated Use {@link Loading}. */
  get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  set loading(value) {
    this.Loading = value;
  }
  saving = false;
  ViewModels: NotificationPreferenceViewModel[] = [];

  /** @deprecated Use {@link ViewModels}. */
  get viewModels(): NotificationPreferenceViewModel[] {
    return this.ViewModels;
  }
  /** @deprecated Use {@link ViewModels}. */
  set viewModels(value: NotificationPreferenceViewModel[]) {
    this.ViewModels = value;
  }
  HasChanges = false;

  /** @deprecated Use {@link HasChanges}. */
  get hasChanges() {
    return this.HasChanges;
  }
  /** @deprecated Use {@link HasChanges}. */
  set hasChanges(value) {
    this.HasChanges = value;
  }

  constructor(private sharedService: SharedService) {
    super();}

  /**
   * Angular lifecycle hook - initializes the component by loading notification preferences.
   */
  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  /**
   * Loads notification types and user preferences from UserInfoEngine.
   * Builds view models by merging type defaults with user preferences.
   * Sorts types by Priority (ascending), then Name (alphabetical).
   * @private
   */
  private async loadData(): Promise<void> {
    try {
      this.Loading = true;

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
      this.ViewModels = types.map((type) => {
        const existingPref = prefs.find((p) => UUIDsEqual(p.NotificationTypeID, type.ID));

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

      this.Loading = false;
    } catch (error: unknown) {
      this.Loading = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sharedService.CreateSimpleNotification(`Failed to load notification preferences: ${message}`, 'error', 3000);
    }
  }

  /**
   * Called when a user toggles any delivery channel checkbox.
   * Updates the view model's changed flag by comparing current state to original values.
   * Sets the global hasChanges flag to show/hide the save/cancel buttons.
   * @param vm The view model for the notification type being modified
   */
  OnChannelChange(vm: NotificationPreferenceViewModel): void {
    vm.changed = vm.inAppEnabled !== vm.originalInAppEnabled || vm.emailEnabled !== vm.originalEmailEnabled || vm.smsEnabled !== vm.originalSmsEnabled;
    this.HasChanges = this.ViewModels.some((v) => v.changed);
  }

  /** @deprecated Use {@link OnChannelChange}. */
  onChannelChange(vm: NotificationPreferenceViewModel): void {
    return this.OnChannelChange(vm);
  }

  /**
   * Saves all changed notification preferences using a transaction group for batch updates.
   * Creates new preference records for types that don't have existing preferences.
   * Updates the Enabled field based on whether any channel is enabled.
   * Shows success/error notification on completion.
   * @returns Promise that resolves when save is complete
   */
  async save(): Promise<void> {
    try {
      this.saving = true;
      const md = this.ProviderToUse;
      const currentUser = md.CurrentUser;
      const transGroup = await md.CreateTransactionGroup();

      // Queue all saves in transaction group - no need to await individual saves
      // Transaction group queues them and submits all in one batch
      for (const vm of this.ViewModels.filter((v) => v.changed)) {
        let pref = vm.preference;

        if (!pref) {
          // Create new preference record
          pref = await md.GetEntityObject<MJUserNotificationPreferenceEntity>('MJ: User Notification Preferences');
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
        // Cache refresh happens automatically in MJUserNotificationPreferenceEntityExtended.Save()

        // Update original values
        this.ViewModels.forEach((vm) => {
          vm.originalInAppEnabled = vm.inAppEnabled;
          vm.originalEmailEnabled = vm.emailEnabled;
          vm.originalSmsEnabled = vm.smsEnabled;
          vm.changed = false;
        });

        this.HasChanges = false;
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

  /**
   * Cancels all unsaved changes and reverts to original values.
   * Resets the changed flag on all view models and hides the action buttons.
   */
  cancel(): void {
    // Revert changes
    this.ViewModels.forEach((vm) => {
      vm.inAppEnabled = vm.originalInAppEnabled;
      vm.emailEnabled = vm.originalEmailEnabled;
      vm.smsEnabled = vm.originalSmsEnabled;
      vm.changed = false;
    });
    this.HasChanges = false;
  }

  /**
   * Gets the Font Awesome icon class for a notification type.
   * Used for MD3 dynamic icon styling in the card header.
   * @param type The notification type entity
   * @returns Font Awesome icon class (e.g., 'fa-bell'), defaults to 'fa-bell' if not specified
   */
  GetTypeIcon(type: MJUserNotificationTypeEntity): string {
    return type.Icon || 'fa-bell';
  }

  /** @deprecated Use {@link GetTypeIcon}. */
  getTypeIcon(type: MJUserNotificationTypeEntity): string {
    return this.GetTypeIcon(type);
  }

  /**
   * Gets the color hex code for a notification type.
   * Used for MD3 dynamic color styling (icon background, border accent).
   * @param type The notification type entity
   * @returns Hex color code (e.g., '#0076B6'), defaults to '#999' if not specified
   */
  GetTypeColor(type: MJUserNotificationTypeEntity): string {
    return type.Color || '#999';
  }

  /** @deprecated Use {@link GetTypeColor}. */
  getTypeColor(type: MJUserNotificationTypeEntity): string {
    return this.GetTypeColor(type);
  }

  /**
   * Gets the auto-expire duration in days for a notification type.
   * Displayed in the metadata row to inform users about automatic read marking.
   * @param type The notification type entity
   * @returns Number of days until auto-expire, or null if not configured
   */
  GetTypeAutoExpireDays(type: MJUserNotificationTypeEntity): number | null {
    return type.AutoExpireDays || null;
  }

  /** @deprecated Use {@link GetTypeAutoExpireDays}. */
  getTypeAutoExpireDays(type: MJUserNotificationTypeEntity): number | null {
    return this.GetTypeAutoExpireDays(type);
  }

  /**
   * Checks if users are allowed to customize preferences for this notification type.
   * When false, the delivery channel checkboxes are disabled and an info message is shown.
   * @param type The notification type entity
   * @returns True if user customization is allowed (default), false otherwise
   */
  GetAllowUserPreference(type: MJUserNotificationTypeEntity): boolean {
    return type.AllowUserPreference !== false;
  }

  /** @deprecated Use {@link GetAllowUserPreference}. */
  getAllowUserPreference(type: MJUserNotificationTypeEntity): boolean {
    return this.GetAllowUserPreference(type);
  }
}
