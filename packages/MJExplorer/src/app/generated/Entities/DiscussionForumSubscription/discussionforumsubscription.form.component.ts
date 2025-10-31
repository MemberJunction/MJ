import { Component } from '@angular/core';
import { DiscussionForumSubscriptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDiscussionForumSubscriptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Discussion Forum Subscriptions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-discussionforumsubscription-form',
    templateUrl: './discussionforumsubscription.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DiscussionForumSubscriptionFormComponent extends BaseFormComponent {
    public record!: DiscussionForumSubscriptionEntity;
} 

export function LoadDiscussionForumSubscriptionFormComponent() {
    LoadDiscussionForumSubscriptionDetailsComponent();
}
