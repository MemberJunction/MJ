import { Component, OnInit } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import {
    UserNotificationTypeEntity,
    UserNotificationPreferenceEntity
} from '@memberjunction/core-entities';
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
    styleUrls: ['./notification-preferences.component.scss']
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
                ResultType: 'entity_object'
            });

            if (!typesResult.Success) {
                throw new Error('Failed to load notification types');
            }

            // Load user's existing preferences
            const prefsResult = await rv.RunView<UserNotificationPreferenceEntity>({
                EntityName: 'MJ: User Notification Preferences',
                ExtraFilter: `UserID='${currentUser.ID}'`,
                ResultType: 'entity_object'
            });

            if (!prefsResult.Success) {
                throw new Error('Failed to load user preferences');
            }

            // Build view models
            this.viewModels = (typesResult.Results || []).map(type => {
                const existingPref = (prefsResult.Results || []).find(
                    p => p.NotificationTypeID === type.ID
                );

                // Get channel values: user preference > type default
                // Cast to access new boolean fields (until CodeGen runs)
                const typeWithBooleans = type as UserNotificationTypeEntity & {
                    DefaultInApp?: boolean;
                    DefaultEmail?: boolean;
                    DefaultSMS?: boolean;
                };
                const prefWithBooleans = existingPref as (UserNotificationPreferenceEntity & {
                    InAppEnabled?: boolean | null;
                    EmailEnabled?: boolean | null;
                    SMSEnabled?: boolean | null;
                }) | undefined;

                const inAppEnabled = prefWithBooleans?.InAppEnabled ?? typeWithBooleans.DefaultInApp ?? true;
                const emailEnabled = prefWithBooleans?.EmailEnabled ?? typeWithBooleans.DefaultEmail ?? false;
                const smsEnabled = prefWithBooleans?.SMSEnabled ?? typeWithBooleans.DefaultSMS ?? false;

                return {
                    type,
                    preference: existingPref || null,
                    inAppEnabled,
                    emailEnabled,
                    smsEnabled,
                    changed: false,
                    originalInAppEnabled: inAppEnabled,
                    originalEmailEnabled: emailEnabled,
                    originalSmsEnabled: smsEnabled
                };
            });

            this.loading = false;
        } catch (error: unknown) {
            this.loading = false;
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.sharedService.CreateSimpleNotification(
                `Failed to load notification preferences: ${message}`,
                'error'
            );
        }
    }

    onChannelChange(vm: NotificationPreferenceViewModel) {
        vm.changed = vm.inAppEnabled !== vm.originalInAppEnabled ||
                     vm.emailEnabled !== vm.originalEmailEnabled ||
                     vm.smsEnabled !== vm.originalSmsEnabled;
        this.hasChanges = this.viewModels.some(v => v.changed);
    }

    async save() {
        try {
            this.saving = true;
            const md = new Metadata();
            const currentUser = md.CurrentUser;
            const transGroup = await md.CreateTransactionGroup();

            for (const vm of this.viewModels.filter(v => v.changed)) {
                let pref = vm.preference;

                if (!pref) {
                    // Create new preference record
                    pref = await md.GetEntityObject<UserNotificationPreferenceEntity>(
                        'MJ: User Notification Preferences'
                    );
                    pref.UserID = currentUser.ID;
                    pref.NotificationTypeID = vm.type.ID;
                    vm.preference = pref;
                }

                // Set Enabled based on whether any channel is enabled
                pref.Enabled = vm.inAppEnabled || vm.emailEnabled || vm.smsEnabled;

                // Set the new boolean channel fields
                // Cast to access new fields (until CodeGen runs)
                const prefWithBooleans = pref as UserNotificationPreferenceEntity & {
                    InAppEnabled?: boolean | null;
                    EmailEnabled?: boolean | null;
                    SMSEnabled?: boolean | null;
                };
                prefWithBooleans.InAppEnabled = vm.inAppEnabled;
                prefWithBooleans.EmailEnabled = vm.emailEnabled;
                prefWithBooleans.SMSEnabled = vm.smsEnabled;
                pref.TransactionGroup = transGroup;
                await pref.Save();
                
            }

            const success = await transGroup.Submit();

            if (success) {
                // Update original values
                this.viewModels.forEach(vm => {
                    vm.originalInAppEnabled = vm.inAppEnabled;
                    vm.originalEmailEnabled = vm.emailEnabled;
                    vm.originalSmsEnabled = vm.smsEnabled;
                    vm.changed = false;
                });

                this.hasChanges = false;
                this.sharedService.CreateSimpleNotification(
                    'Notification preferences saved successfully',
                    'success'
                );
            } else {
                throw new Error('Failed to save preferences');
            }

            this.saving = false;
        } catch (error: unknown) {
            this.saving = false;
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.sharedService.CreateSimpleNotification(
                `Failed to save preferences: ${message}`,
                'error'
            );
        }
    }

    cancel() {
        // Revert changes
        this.viewModels.forEach(vm => {
            vm.inAppEnabled = vm.originalInAppEnabled;
            vm.emailEnabled = vm.originalEmailEnabled;
            vm.smsEnabled = vm.originalSmsEnabled;
            vm.changed = false;
        });
        this.hasChanges = false;
    }

    getTypeIcon(type: UserNotificationTypeEntity): string {
        return (type as unknown as { Icon?: string }).Icon || 'fa-bell';
    }

    getTypeColor(type: UserNotificationTypeEntity): string {
        return (type as unknown as { Color?: string }).Color || '#999';
    }

    getTypeAutoExpireDays(type: UserNotificationTypeEntity): number | null {
        return (type as unknown as { AutoExpireDays?: number }).AutoExpireDays || null;
    }

    getAllowUserPreference(type: UserNotificationTypeEntity): boolean {
        return (type as unknown as { AllowUserPreference?: boolean }).AllowUserPreference !== false;
    }
}
