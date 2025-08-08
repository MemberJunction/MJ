import { Component } from '@angular/core';
import { ConversationDetail_250606Entity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetail_250606DetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Conversation Detail -250606s') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetail_250606-form',
    templateUrl: './conversationdetail_250606.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetail_250606FormComponent extends BaseFormComponent {
    public record!: ConversationDetail_250606Entity;
} 

export function LoadConversationDetail_250606FormComponent() {
    LoadConversationDetail_250606DetailsComponent();
}
