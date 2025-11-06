import { Component } from '@angular/core';
import { ArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Version Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-artifactversionattribute-form',
    templateUrl: './artifactversionattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ArtifactVersionAttributeFormComponent extends BaseFormComponent {
    public record!: ArtifactVersionAttributeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadArtifactVersionAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
