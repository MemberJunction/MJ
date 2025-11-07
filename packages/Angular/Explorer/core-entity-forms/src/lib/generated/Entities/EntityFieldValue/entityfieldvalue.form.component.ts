import { Component } from '@angular/core';
import { EntityFieldValueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Field Values') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityfieldvalue-form',
    templateUrl: './entityfieldvalue.form.component.html'
})
export class EntityFieldValueFormComponent extends BaseFormComponent {
    public record!: EntityFieldValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalMetadata', sectionName: 'Technical Metadata', isExpanded: false },
            { sectionKey: 'lookupContext', sectionName: 'Lookup Context', isExpanded: true },
            { sectionKey: 'valueSpecification', sectionName: 'Value Specification', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEntityFieldValueFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
