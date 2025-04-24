import { Component } from '@angular/core';
import { ConversationArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationArtifactDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationartifact-form',
    templateUrl: './conversationartifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationArtifactFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactEntity;
} 

export function LoadConversationArtifactFormComponent() {
    LoadConversationArtifactDetailsComponent();
}
