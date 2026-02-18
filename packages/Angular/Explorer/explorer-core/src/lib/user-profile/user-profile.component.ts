import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { MJAuthBase, StandardUserInfo } from '@memberjunction/ng-auth-services';
import { UserInfoEngine, MJUserNotificationPreferenceEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface NotificationSummary {
  InAppEnabled: boolean;
  EmailEnabled: boolean;
  SMSEnabled: boolean;
}

@Component({
  standalone: false,
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  public JSON: any = JSON;
  public User: Observable<StandardUserInfo | null>;
  public Loading = true;
  public Saving = false;
  public UnreadNotificationCount = 0;
  public NotificationSummary: NotificationSummary = {
    InAppEnabled: true,
    EmailEnabled: false,
    SMSEnabled: false
  };

  private destroy$ = new Subject<void>();

  constructor(
    public authBase: MJAuthBase,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    // v3.0 API - User is now an observable that the template subscribes to
    this.User = authBase.getUserInfo();
  }

  async ngOnInit() {
    await this.LoadNotificationData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads notification data from UserInfoEngine
   */
  private async LoadNotificationData() {
    try {
      this.Loading = true;

      // Get unread notification count
      this.UnreadNotificationCount = UserInfoEngine.Instance.UnreadNotificationCount;

      // Calculate global channel preferences
      const preferences = UserInfoEngine.Instance.NotificationPreferences;
      const types = UserInfoEngine.Instance.NotificationTypes;

      if (preferences.length === 0 && types.length > 0) {
        // No preferences set yet - use defaults from types
        const inApp = types.some(t => t.DefaultInApp ?? true);
        const email = types.some(t => t.DefaultEmail ?? false);
        const sms = types.some(t => t.DefaultSMS ?? false);

        this.NotificationSummary = {
          InAppEnabled: inApp,
          EmailEnabled: email,
          SMSEnabled: sms
        };
      } else if (preferences.length > 0) {
        // Calculate from existing preferences
        const inApp = preferences.some(p => p.InAppEnabled);
        const email = preferences.some(p => p.EmailEnabled);
        const sms = preferences.some(p => p.SMSEnabled);

        this.NotificationSummary = {
          InAppEnabled: inApp,
          EmailEnabled: email,
          SMSEnabled: sms
        };
      }

      this.Loading = false;
      this.cdr.detectChanges();
    } catch (error: unknown) {
      this.Loading = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sharedService.CreateSimpleNotification(`Failed to load notification data: ${message}`, 'error', 3000);
      this.cdr.detectChanges();
    }
  }

  /**
   * Toggles a specific notification channel globally
   */
  async ToggleChannel(channel: 'InApp' | 'Email' | 'SMS'): Promise<void> {
    try {
      this.Saving = true;
      const md = new Metadata();
      const currentUser = md.CurrentUser;
      const transGroup = await md.CreateTransactionGroup();

      const types = UserInfoEngine.Instance.NotificationTypes;
      const preferences = UserInfoEngine.Instance.NotificationPreferences;

      // Determine new state
      let newState: boolean;
      if (channel === 'InApp') {
        newState = !this.NotificationSummary.InAppEnabled;
        this.NotificationSummary.InAppEnabled = newState;
      } else if (channel === 'Email') {
        newState = !this.NotificationSummary.EmailEnabled;
        this.NotificationSummary.EmailEnabled = newState;
      } else {
        newState = !this.NotificationSummary.SMSEnabled;
        this.NotificationSummary.SMSEnabled = newState;
      }

      // Update all notification types that allow user preference
      for (const type of types) {
        if (type.AllowUserPreference === false) {
          continue; // Skip locked types
        }

        let pref = preferences.find(p => p.NotificationTypeID === type.ID);

        if (!pref) {
          // Create new preference record
          pref = await md.GetEntityObject<MJUserNotificationPreferenceEntity>('MJ: User Notification Preferences');
          pref.UserID = currentUser.ID;
          pref.NotificationTypeID = type.ID;

          // Set defaults from type
          pref.InAppEnabled = type.DefaultInApp ?? true;
          pref.EmailEnabled = type.DefaultEmail ?? false;
          pref.SMSEnabled = type.DefaultSMS ?? false;
        }

        // Update the specific channel
        if (channel === 'InApp') {
          pref.InAppEnabled = newState;
        } else if (channel === 'Email') {
          pref.EmailEnabled = newState;
        } else {
          pref.SMSEnabled = newState;
        }

        // Set Enabled based on whether any channel is enabled
        pref.Enabled = pref.InAppEnabled || pref.EmailEnabled || pref.SMSEnabled;

        pref.TransactionGroup = transGroup;
        pref.Save();
      }

      // Submit transaction group
      const success = await transGroup.Submit();

      if (success) {
        this.sharedService.CreateSimpleNotification(
          `${channel} notifications ${newState ? 'enabled' : 'disabled'} globally`,
          'success',
          2500
        );
      } else {
        throw new Error('Failed to save preferences');
      }

      this.Saving = false;
      this.cdr.detectChanges();
    } catch (error: unknown) {
      this.Saving = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.sharedService.CreateSimpleNotification(`Failed to update preferences: ${message}`, 'error', 3000);

      // Revert the UI state
      await this.LoadNotificationData();
    }
  }

  /**
   * Gets the appropriate icon for a channel
   */
  GetChannelIcon(channel: 'InApp' | 'Email' | 'SMS'): string {
    switch (channel) {
      case 'InApp': return 'fa-solid fa-bell';
      case 'Email': return 'fa-solid fa-envelope';
      case 'SMS': return 'fa-solid fa-mobile';
      default: return 'fa-solid fa-bell';
    }
  }

  /**
   * Gets the label for a channel
   */
  GetChannelLabel(channel: 'InApp' | 'Email' | 'SMS'): string {
    switch (channel) {
      case 'InApp': return 'In-App';
      case 'Email': return 'Email';
      case 'SMS': return 'SMS';
      default: return '';
    }
  }

  /**
   * Checks if a channel is enabled
   */
  IsChannelEnabled(channel: 'InApp' | 'Email' | 'SMS'): boolean {
    switch (channel) {
      case 'InApp': return this.NotificationSummary.InAppEnabled;
      case 'Email': return this.NotificationSummary.EmailEnabled;
      case 'SMS': return this.NotificationSummary.SMSEnabled;
      default: return false;
    }
  }
}
