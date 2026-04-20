import { Component } from '@angular/core';
import { AssociationDemoAccreditingBodyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Accrediting Bodies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoaccreditingbody-form',
    templateUrl: './associationdemoaccreditingbody.form.component.html'
})
export class AssociationDemoAccreditingBodyFormComponent extends BaseFormComponent {
    public record!: AssociationDemoAccreditingBodyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accreditingBodyProfile', sectionName: 'Accrediting Body Profile', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'operationalStatus', sectionName: 'Operational Status', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'certificationTypes', sectionName: 'Certification Types', isExpanded: false }
        ]);
    }
}

