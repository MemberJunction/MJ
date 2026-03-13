import { Component } from '@angular/core';
import { MJConversationArtifactPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationartifactpermission-form',
    templateUrl: './mjconversationartifactpermission.form.component.html'
})
export class MJConversationArtifactPermissionFormComponent extends BaseFormComponent {
    public record!: MJConversationArtifactPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

