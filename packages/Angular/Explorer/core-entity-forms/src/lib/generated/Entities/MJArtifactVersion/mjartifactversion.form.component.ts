import { Component } from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifact Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactversion-form',
    templateUrl: './mjartifactversion.form.component.html'
})
export class MJArtifactVersionFormComponent extends BaseFormComponent {
    public record!: MJArtifactVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionIdentity', sectionName: 'Version Identity', isExpanded: true },
            { sectionKey: 'contentMetadata', sectionName: 'Content & Metadata', isExpanded: false },
            { sectionKey: 'ownershipAttribution', sectionName: 'Ownership & Attribution', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArtifactVersionAttributes', sectionName: 'MJ: Artifact Version Attributes', isExpanded: false },
            { sectionKey: 'mJCollectionArtifacts', sectionName: 'MJ: Collection Artifacts', isExpanded: false },
            { sectionKey: 'mJArtifactUses', sectionName: 'MJ: Artifact Uses', isExpanded: false },
            { sectionKey: 'mJConversationDetailArtifacts', sectionName: 'MJ: Conversation Detail Artifacts', isExpanded: false }
        ]);
    }
}

