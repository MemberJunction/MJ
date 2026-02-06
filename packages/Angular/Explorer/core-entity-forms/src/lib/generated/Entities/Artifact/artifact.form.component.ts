import { Component } from '@angular/core';
import { ArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-artifact-form',
    templateUrl: './artifact.form.component.html'
})
export class ArtifactFormComponent extends BaseFormComponent {
    public record!: ArtifactEntity;

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

export function LoadArtifactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
