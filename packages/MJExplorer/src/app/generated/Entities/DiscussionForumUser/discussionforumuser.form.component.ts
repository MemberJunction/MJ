import { Component } from '@angular/core';
import { DiscussionForumUserEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumUserDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Discussion Forum Users') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforumuser-form',
    templateUrl: './discussionforumuser.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumUserFormComponent extends BaseFormComponent {
    public record!: DiscussionForumUserEntity;
} 

export function LoadDiscussionForumUserFormComponent() {
    LoadDiscussionForumUserDetailsComponent();
}
