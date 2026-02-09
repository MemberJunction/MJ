import { Component } from '@angular/core';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Notifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-usernotification-form',
    templateUrl: './usernotification.form.component.html'
})
export class UserNotificationFormComponent extends BaseFormComponent {
    public record!: UserNotificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationOverview', sectionName: 'Notification Overview', isExpanded: true },
            { sectionKey: 'relatedResource', sectionName: 'Related Resource', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

