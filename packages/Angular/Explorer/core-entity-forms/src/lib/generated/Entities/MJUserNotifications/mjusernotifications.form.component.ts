import { Component } from '@angular/core';
import { MJUserNotificationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Notifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusernotifications-form',
    templateUrl: './mjusernotifications.form.component.html'
})
export class MJUserNotificationsFormComponent extends BaseFormComponent {
    public record!: MJUserNotificationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'notificationOverview', sectionName: 'Notification Overview', isExpanded: true },
            { sectionKey: 'relatedResource', sectionName: 'Related Resource', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

