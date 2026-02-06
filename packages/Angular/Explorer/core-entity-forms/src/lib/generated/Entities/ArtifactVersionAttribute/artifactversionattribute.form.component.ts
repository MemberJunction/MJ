import { Component } from '@angular/core';
import { ArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Version Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-artifactversionattribute-form',
    templateUrl: './artifactversionattribute.form.component.html'
})
export class ArtifactVersionAttributeFormComponent extends BaseFormComponent {
    public record!: ArtifactVersionAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipContext', sectionName: 'Relationship Context', isExpanded: true },
            { sectionKey: 'attributeDefinition', sectionName: 'Attribute Definition', isExpanded: true },
            { sectionKey: 'extractedValue', sectionName: 'Extracted Value', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadArtifactVersionAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
