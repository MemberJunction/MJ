import { Component } from '@angular/core';
import { MJUserNotificationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Notification Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusernotificationtype-form',
    templateUrl: './mjusernotificationtype.form.component.html'
})
export class MJUserNotificationTypeFormComponent extends BaseFormComponent {
    public record!: MJUserNotificationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationDetails', sectionName: 'Notification Details', isExpanded: true },
            { sectionKey: 'deliveryDefaults', sectionName: 'Delivery Defaults', isExpanded: true },
            { sectionKey: 'templateSettings', sectionName: 'Template Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJUserNotifications', sectionName: 'User Notifications', isExpanded: false },
            { sectionKey: 'mJUserNotificationPreferences', sectionName: 'User Notification Preferences', isExpanded: false }
        ]);
    }
}

