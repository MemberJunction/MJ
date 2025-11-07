import { Component } from '@angular/core';
import { ArtifactUseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Uses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactuse-form',
    templateUrl: './artifactuse.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactUseFormComponent extends BaseFormComponent {
    public record!: ArtifactUseEntity;

    // Collapsible section state
    public sectionsExpanded = {
        artifactDetails: true,
        userInteraction: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadArtifactUseFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
