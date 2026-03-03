import { Component } from '@angular/core';
import { MJConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationartifactversion-form',
    templateUrl: './mjconversationartifactversion.form.component.html'
})
export class MJConversationArtifactVersionFormComponent extends BaseFormComponent {
    public record!: MJConversationArtifactVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactIdentification', sectionName: 'Artifact Identification', isExpanded: true },
            { sectionKey: 'versionContent', sectionName: 'Version Content', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false }
        ]);
    }
}

