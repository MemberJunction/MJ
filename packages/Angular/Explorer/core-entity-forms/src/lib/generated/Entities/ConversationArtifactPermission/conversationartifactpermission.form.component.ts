import { Component } from '@angular/core';
import { ConversationArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-conversationartifactpermission-form',
    templateUrl: './conversationartifactpermission.form.component.html'
})
export class ConversationArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadConversationArtifactPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
