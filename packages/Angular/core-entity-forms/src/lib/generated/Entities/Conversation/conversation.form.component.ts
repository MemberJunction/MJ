import { Component } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Conversations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversation-form',
    templateUrl: './conversation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationFormComponent extends BaseFormComponent {
    public record!: ConversationEntity;
} 

export function LoadConversationFormComponent() {
    LoadConversationDetailsComponent();
}
