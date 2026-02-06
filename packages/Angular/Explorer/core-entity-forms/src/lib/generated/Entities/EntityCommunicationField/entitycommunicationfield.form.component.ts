import { Component } from '@angular/core';
import { EntityCommunicationFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Communication Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitycommunicationfield-form',
    templateUrl: './entitycommunicationfield.form.component.html'
})
export class EntityCommunicationFieldFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'mappingConfiguration', sectionName: 'Mapping Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEntityCommunicationFieldFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
