import { Component } from '@angular/core';
import { DiscussionForumLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Discussion Forum Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforumlink-form',
    templateUrl: './discussionforumlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumLinkFormComponent extends BaseFormComponent {
    public record!: DiscussionForumLinkEntity;
} 

export function LoadDiscussionForumLinkFormComponent() {
    LoadDiscussionForumLinkDetailsComponent();
}
