import { Component } from '@angular/core';
import { ConversationDetailRatingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetailRatingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Ratings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailrating-form',
    templateUrl: './conversationdetailrating.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailRatingFormComponent extends BaseFormComponent {
    public record!: ConversationDetailRatingEntity;
} 

export function LoadConversationDetailRatingFormComponent() {
    LoadConversationDetailRatingDetailsComponent();
}
