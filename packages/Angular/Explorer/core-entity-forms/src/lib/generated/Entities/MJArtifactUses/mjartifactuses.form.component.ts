import { Component } from '@angular/core';
import { MJArtifactUsesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Uses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactuses-form',
    templateUrl: './mjartifactuses.form.component.html'
})
export class MJArtifactUsesFormComponent extends BaseFormComponent {
    public record!: MJArtifactUsesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'userInteraction', sectionName: 'User Interaction', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

