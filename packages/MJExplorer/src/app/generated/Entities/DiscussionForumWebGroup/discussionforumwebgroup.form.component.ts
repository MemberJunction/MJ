import { Component } from '@angular/core';
import { DiscussionForumWebGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumWebGroupDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Discussion Forum Web Groups') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforumwebgroup-form',
    templateUrl: './discussionforumwebgroup.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumWebGroupFormComponent extends BaseFormComponent {
    public record!: DiscussionForumWebGroupEntity;
} 

export function LoadDiscussionForumWebGroupFormComponent() {
    LoadDiscussionForumWebGroupDetailsComponent();
}
