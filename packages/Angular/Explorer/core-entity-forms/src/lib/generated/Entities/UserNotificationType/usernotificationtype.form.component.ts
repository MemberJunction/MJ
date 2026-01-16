import { Component } from '@angular/core';
import { UserNotificationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Notification Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-usernotificationtype-form',
    templateUrl: './usernotificationtype.form.component.html'
})
export class UserNotificationTypeFormComponent extends BaseFormComponent {
    public record!: UserNotificationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationBasics', sectionName: 'Notification Basics', isExpanded: true },
            { sectionKey: 'deliverySettings', sectionName: 'Delivery Settings', isExpanded: true },
            { sectionKey: 'templateBindings', sectionName: 'Template Bindings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJUserNotificationPreferences', sectionName: 'MJ: User Notification Preferences', isExpanded: false },
            { sectionKey: 'userNotifications', sectionName: 'User Notifications', isExpanded: false }
        ]);
    }
}

export function LoadUserNotificationTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
