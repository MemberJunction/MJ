import { Component } from '@angular/core';
import { ConversationDetailArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationDetailArtifactDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailartifact-form',
    templateUrl: './conversationdetailartifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailArtifactFormComponent extends BaseFormComponent {
    public record!: ConversationDetailArtifactEntity;
} 

export function LoadConversationDetailArtifactFormComponent() {
    LoadConversationDetailArtifactDetailsComponent();
}
