import { Component } from '@angular/core';
import { UserNotificationPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Notification Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-usernotificationpreference-form',
    templateUrl: './usernotificationpreference.form.component.html'
})
export class UserNotificationPreferenceFormComponent extends BaseFormComponent {
    public record!: UserNotificationPreferenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'notificationPreferences', sectionName: 'Notification Preferences', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

