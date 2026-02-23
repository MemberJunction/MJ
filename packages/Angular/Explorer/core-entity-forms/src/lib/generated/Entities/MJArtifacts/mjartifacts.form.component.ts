import { Component } from '@angular/core';
import { MJArtifactsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifacts-form',
    templateUrl: './mjartifacts.form.component.html'
})
export class MJArtifactsFormComponent extends BaseFormComponent {
    public record!: MJArtifactsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipContext', sectionName: 'Ownership & Context', isExpanded: true },
            { sectionKey: 'artifactCore', sectionName: 'Artifact Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArtifactVersions', sectionName: 'MJ: Artifact Versions', isExpanded: false },
            { sectionKey: 'mJCollectionArtifacts', sectionName: 'MJ: Collection Artifacts', isExpanded: false },
            { sectionKey: 'mJArtifactPermissions', sectionName: 'MJ: Artifact Permissions', isExpanded: false }
        ]);
    }
}

