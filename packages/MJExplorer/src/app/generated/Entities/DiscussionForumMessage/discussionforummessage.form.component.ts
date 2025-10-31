import { Component } from '@angular/core';
import { DiscussionForumMessageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumMessageDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Discussion Forum Messages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforummessage-form',
    templateUrl: './discussionforummessage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumMessageFormComponent extends BaseFormComponent {
    public record!: DiscussionForumMessageEntity;
} 

export function LoadDiscussionForumMessageFormComponent() {
    LoadDiscussionForumMessageDetailsComponent();
}
