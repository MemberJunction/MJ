import { Component } from '@angular/core';
import { AssociationDemoGovernmentContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Government Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemogovernmentcontact-form',
    templateUrl: './associationdemogovernmentcontact.form.component.html'
})
export class AssociationDemoGovernmentContactFormComponent extends BaseFormComponent {
    public record!: AssociationDemoGovernmentContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'professionalAffiliation', sectionName: 'Professional Affiliation', isExpanded: true },
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'contactDetails', sectionName: 'Contact Details', isExpanded: false },
            { sectionKey: 'tenureAndStatus', sectionName: 'Tenure and Status', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'advocacyActions', sectionName: 'Advocacy Actions', isExpanded: false }
        ]);
    }
}

