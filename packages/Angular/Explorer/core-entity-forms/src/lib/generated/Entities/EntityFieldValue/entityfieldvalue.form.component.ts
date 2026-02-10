import { Component } from '@angular/core';
import { EntityFieldValueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Field Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityfieldvalue-form',
    templateUrl: './entityfieldvalue.form.component.html'
})
export class EntityFieldValueFormComponent extends BaseFormComponent {
    public record!: EntityFieldValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityAssociation', sectionName: 'Entity Association', isExpanded: true },
            { sectionKey: 'lookupDefinition', sectionName: 'Lookup Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

