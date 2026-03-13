import { Component } from '@angular/core';
import { MJUserNotificationPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Notification Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusernotificationpreference-form',
    templateUrl: './mjusernotificationpreference.form.component.html'
})
export class MJUserNotificationPreferenceFormComponent extends BaseFormComponent {
    public record!: MJUserNotificationPreferenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'notificationPreferences', sectionName: 'Notification Preferences', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

