import { Component } from '@angular/core';
import { ConversationArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-conversationartifact-form',
    templateUrl: './conversationartifact.form.component.html'
})
export class ConversationArtifactFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'conversationContext', sectionName: 'Conversation Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJConversationArtifactPermissions', sectionName: 'MJ: Conversation Artifact Permissions', isExpanded: false },
            { sectionKey: 'mJConversationArtifactVersions', sectionName: 'MJ: Conversation Artifact Versions', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false }
        ]);
    }
}

