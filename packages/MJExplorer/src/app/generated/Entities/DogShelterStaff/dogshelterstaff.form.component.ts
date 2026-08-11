import { Component } from '@angular/core';
import { DogShelterStaffEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Staffs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelterstaff-form',
    templateUrl: './dogshelterstaff.form.component.html'
})
export class DogShelterStaffFormComponent extends BaseFormComponent {
    public record!: DogShelterStaffEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'employmentDetails', sectionName: 'Employment Details', isExpanded: true },
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'organizationalHierarchy', sectionName: 'Organizational Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'staffs', sectionName: 'Staffs', isExpanded: false },
            { sectionKey: 'dogTraits', sectionName: 'Dog Traits', isExpanded: false },
            { sectionKey: 'adoptionApplications', sectionName: 'Adoption Applications', isExpanded: false },
            { sectionKey: 'medicalRecords', sectionName: 'Medical Records', isExpanded: false }
        ]);
    }
}

