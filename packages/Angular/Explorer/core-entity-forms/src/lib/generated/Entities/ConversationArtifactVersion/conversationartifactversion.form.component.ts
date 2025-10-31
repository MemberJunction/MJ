import { Component } from '@angular/core';
import { ConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationArtifactVersionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationartifactversion-form',
    templateUrl: './conversationartifactversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationArtifactVersionFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactVersionEntity;
} 

export function LoadConversationArtifactVersionFormComponent() {
    LoadConversationArtifactVersionDetailsComponent();
}
