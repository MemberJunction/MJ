import { Component } from '@angular/core';
import { InstantMessagingUserProfileEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInstantMessagingUserProfileDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Instant Messaging User Profiles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-instantmessaginguserprofile-form',
    templateUrl: './instantmessaginguserprofile.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InstantMessagingUserProfileFormComponent extends BaseFormComponent {
    public record!: InstantMessagingUserProfileEntity;
} 

export function LoadInstantMessagingUserProfileFormComponent() {
    LoadInstantMessagingUserProfileDetailsComponent();
}
