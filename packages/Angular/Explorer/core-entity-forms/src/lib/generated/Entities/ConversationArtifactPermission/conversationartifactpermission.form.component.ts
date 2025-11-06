import { Component } from '@angular/core';
import { ConversationArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Permissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationartifactpermission-form',
    templateUrl: './conversationartifactpermission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactPermissionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadConversationArtifactPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
