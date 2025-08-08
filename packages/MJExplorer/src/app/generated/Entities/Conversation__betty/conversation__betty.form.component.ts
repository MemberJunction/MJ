import { Component } from '@angular/core';
import { Conversation__bettyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversation__bettyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Conversations__betty') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversation__betty-form',
    templateUrl: './conversation__betty.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Conversation__bettyFormComponent extends BaseFormComponent {
    public record!: Conversation__bettyEntity;
} 

export function LoadConversation__bettyFormComponent() {
    LoadConversation__bettyDetailsComponent();
}
