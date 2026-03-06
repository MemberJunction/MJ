import { Component } from '@angular/core';
import { MJEntityFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityfield-form',
    templateUrl: './mjentityfield.form.component.html'
})
export class MJEntityFieldFormComponent extends BaseFormComponent {
    public record!: MJEntityFieldEntity;

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
            { sectionKey: 'mJEntityFieldValues', sectionName: 'Entity Field Values', isExpanded: false }
        ]);
    }
}

