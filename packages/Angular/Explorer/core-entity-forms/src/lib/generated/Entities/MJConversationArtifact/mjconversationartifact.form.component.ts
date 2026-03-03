import { Component } from '@angular/core';
import { MJConversationArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationartifact-form',
    templateUrl: './mjconversationartifact.form.component.html'
})
export class MJConversationArtifactFormComponent extends BaseFormComponent {
    public record!: MJConversationArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'conversationContext', sectionName: 'Conversation Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJConversationArtifactPermissions', sectionName: 'Conversation Artifact Permissions', isExpanded: false },
            { sectionKey: 'mJConversationArtifactVersions', sectionName: 'Conversation Artifact Versions', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false }
        ]);
    }
}

