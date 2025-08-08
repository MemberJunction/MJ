import { Component } from '@angular/core';
import { ConversationDetailContentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetailContentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Conversation Detail Contents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailcontent-form',
    templateUrl: './conversationdetailcontent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailContentFormComponent extends BaseFormComponent {
    public record!: ConversationDetailContentEntity;
} 

export function LoadConversationDetailContentFormComponent() {
    LoadConversationDetailContentDetailsComponent();
}
