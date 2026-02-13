import { Component } from '@angular/core';
import { MJUserNotificationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Notifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusernotification-form',
    templateUrl: './mjusernotification.form.component.html'
})
export class MJUserNotificationFormComponent extends BaseFormComponent {
    public record!: MJUserNotificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationOverview', sectionName: 'Notification Overview', isExpanded: true },
            { sectionKey: 'relatedResource', sectionName: 'Related Resource', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

