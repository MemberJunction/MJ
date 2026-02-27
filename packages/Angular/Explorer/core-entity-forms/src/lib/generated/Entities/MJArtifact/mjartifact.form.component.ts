import { Component } from '@angular/core';
import { MJArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifact-form',
    templateUrl: './mjartifact.form.component.html'
})
export class MJArtifactFormComponent extends BaseFormComponent {
    public record!: MJArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipContext', sectionName: 'Ownership & Context', isExpanded: true },
            { sectionKey: 'artifactCore', sectionName: 'Artifact Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArtifactVersions', sectionName: 'Artifact Versions', isExpanded: false },
            { sectionKey: 'mJCollectionArtifacts', sectionName: 'Collection Artifacts', isExpanded: false },
            { sectionKey: 'mJArtifactPermissions', sectionName: 'Artifact Permissions', isExpanded: false }
        ]);
    }
}

