import { Component } from '@angular/core';
import { ConversationDetail__bettyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetail__bettyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Conversation Details__betty') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetail__betty-form',
    templateUrl: './conversationdetail__betty.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetail__bettyFormComponent extends BaseFormComponent {
    public record!: ConversationDetail__bettyEntity;
} 

export function LoadConversationDetail__bettyFormComponent() {
    LoadConversationDetail__bettyDetailsComponent();
}
