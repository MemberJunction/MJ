import { Component } from '@angular/core';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Notifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-usernotification-form',
    templateUrl: './usernotification.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserNotificationFormComponent extends BaseFormComponent {
    public record!: UserNotificationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        notificationOverview: true,
        relatedResource: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadUserNotificationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
