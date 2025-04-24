import { Component } from '@angular/core';
import { ConversationArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadConversationArtifactPermissionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationartifactpermission-form',
    templateUrl: './conversationartifactpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactPermissionEntity;
} 

export function LoadConversationArtifactPermissionFormComponent() {
    LoadConversationArtifactPermissionDetailsComponent();
}
