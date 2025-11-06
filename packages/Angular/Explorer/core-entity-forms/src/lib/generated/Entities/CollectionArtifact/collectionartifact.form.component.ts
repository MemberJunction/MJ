import { Component } from '@angular/core';
import { CollectionArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-collectionartifact-form',
    templateUrl: './collectionartifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CollectionArtifactFormComponent extends BaseFormComponent {
    public record!: CollectionArtifactEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCollectionArtifactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
