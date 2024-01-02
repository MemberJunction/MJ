import { Component } from '@angular/core';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadUserNotificationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User Notifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-usernotification-form',
    templateUrl: './usernotification.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserNotificationFormComponent extends BaseFormComponent {
    public record: UserNotificationEntity | null = null;
} 

export function LoadUserNotificationFormComponent() {
    LoadUserNotificationDetailsComponent();
}
