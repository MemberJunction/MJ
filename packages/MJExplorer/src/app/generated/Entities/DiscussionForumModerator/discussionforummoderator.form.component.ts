import { Component } from '@angular/core';
import { DiscussionForumModeratorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumModeratorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Discussion Forum Moderators') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforummoderator-form',
    templateUrl: './discussionforummoderator.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumModeratorFormComponent extends BaseFormComponent {
    public record!: DiscussionForumModeratorEntity;
} 

export function LoadDiscussionForumModeratorFormComponent() {
    LoadDiscussionForumModeratorDetailsComponent();
}
