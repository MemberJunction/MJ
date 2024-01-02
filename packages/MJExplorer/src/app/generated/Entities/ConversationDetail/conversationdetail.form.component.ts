import { Component } from '@angular/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadConversationDetailDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Conversation Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetail-form',
    templateUrl: './conversationdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailFormComponent extends BaseFormComponent {
    public record: ConversationDetailEntity | null = null;
} 

export function LoadConversationDetailFormComponent() {
    LoadConversationDetailDetailsComponent();
}
