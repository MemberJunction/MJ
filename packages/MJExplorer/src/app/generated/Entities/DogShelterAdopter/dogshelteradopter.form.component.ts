import { Component } from '@angular/core';
import { DogShelterAdopterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Adopters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelteradopter-form',
    templateUrl: './dogshelteradopter.form.component.html'
})
export class DogShelterAdopterFormComponent extends BaseFormComponent {
    public record!: DogShelterAdopterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'householdDetails', sectionName: 'Household Details', isExpanded: true },
            { sectionKey: 'programParticipation', sectionName: 'Program Participation', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'fosterPlacements', sectionName: 'Foster Placements', isExpanded: false },
            { sectionKey: 'adoptionApplications', sectionName: 'Adoption Applications', isExpanded: false }
        ]);
    }
}

