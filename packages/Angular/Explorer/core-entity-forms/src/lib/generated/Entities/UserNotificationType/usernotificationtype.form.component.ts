import { Component } from '@angular/core';
import { UserNotificationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Notification Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-usernotificationtype-form',
    templateUrl: './usernotificationtype.form.component.html'
})
export class UserNotificationTypeFormComponent extends BaseFormComponent {
    public record!: UserNotificationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationDetails', sectionName: 'Notification Details', isExpanded: true },
            { sectionKey: 'deliveryDefaults', sectionName: 'Delivery Defaults', isExpanded: true },
            { sectionKey: 'templateSettings', sectionName: 'Template Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'userNotifications', sectionName: 'User Notifications', isExpanded: false },
            { sectionKey: 'mJUserNotificationPreferences', sectionName: 'MJ: User Notification Preferences', isExpanded: false }
        ]);
    }
}

