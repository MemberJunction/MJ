import { Component } from '@angular/core';
import { MJArtifactVersionAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Version Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactversionattribute-form',
    templateUrl: './mjartifactversionattribute.form.component.html'
})
export class MJArtifactVersionAttributeFormComponent extends BaseFormComponent {
    public record!: MJArtifactVersionAttributeEntity;

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

