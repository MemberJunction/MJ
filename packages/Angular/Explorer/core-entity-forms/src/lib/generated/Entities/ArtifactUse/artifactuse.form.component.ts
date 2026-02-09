import { Component } from '@angular/core';
import { ArtifactUseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Uses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-artifactuse-form',
    templateUrl: './artifactuse.form.component.html'
})
export class ArtifactUseFormComponent extends BaseFormComponent {
    public record!: ArtifactUseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'userInteraction', sectionName: 'User Interaction', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

