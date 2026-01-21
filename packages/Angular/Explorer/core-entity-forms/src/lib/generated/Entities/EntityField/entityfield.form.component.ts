import { Component } from '@angular/core';
import { EntityFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityfield-form',
    templateUrl: './entityfield.form.component.html'
})
export class EntityFieldFormComponent extends BaseFormComponent {
    public record!: EntityFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationKeys', sectionName: 'Identification & Keys', isExpanded: true },
            { sectionKey: 'userInterfaceDisplaySettings', sectionName: 'User Interface & Display Settings', isExpanded: true },
            { sectionKey: 'dataConstraintsValidation', sectionName: 'Data Constraints & Validation', isExpanded: false },
            { sectionKey: 'relationshipsLinking', sectionName: 'Relationships & Linking', isExpanded: false },
            { sectionKey: 'systemAuditMetadata', sectionName: 'System & Audit Metadata', isExpanded: false },
            { sectionKey: 'securityEncryption', sectionName: 'Security & Encryption', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityFieldValues', sectionName: 'Entity Field Values', isExpanded: false }
        ]);
    }
}

export function LoadEntityFieldFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
