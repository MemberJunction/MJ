import { Component } from '@angular/core';
import { MJConversationArtifactPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationartifactpermissions-form',
    templateUrl: './mjconversationartifactpermissions.form.component.html'
})
export class MJConversationArtifactPermissionsFormComponent extends BaseFormComponent {
    public record!: MJConversationArtifactPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

