import { Component } from '@angular/core';
import { DogShelterMedicalRecordEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Medical Records') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogsheltermedicalrecord-form',
    templateUrl: './dogsheltermedicalrecord.form.component.html'
})
export class DogShelterMedicalRecordFormComponent extends BaseFormComponent {
    public record!: DogShelterMedicalRecordEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'medicalEventDetails', sectionName: 'Medical Event Details', isExpanded: true },
            { sectionKey: 'clinicalStaffAndFollowUp', sectionName: 'Clinical Staff and Follow-up', isExpanded: true },
            { sectionKey: 'financialInformation', sectionName: 'Financial Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

