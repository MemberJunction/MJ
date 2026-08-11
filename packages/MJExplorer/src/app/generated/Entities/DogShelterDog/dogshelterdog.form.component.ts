import { Component } from '@angular/core';
import { DogShelterDogEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Dogs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelterdog-form',
    templateUrl: './dogshelterdog.form.component.html'
})
export class DogShelterDogFormComponent extends BaseFormComponent {
    public record!: DogShelterDogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dogInformation', sectionName: 'Dog Information', isExpanded: true },
            { sectionKey: 'physicalCharacteristics', sectionName: 'Physical Characteristics', isExpanded: true },
            { sectionKey: 'shelterHistory', sectionName: 'Shelter History', isExpanded: true },
            { sectionKey: 'behaviorAndHealth', sectionName: 'Behavior and Health', isExpanded: true },
            { sectionKey: 'adoptionDetails', sectionName: 'Adoption Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dogTraits', sectionName: 'Dog Traits', isExpanded: false },
            { sectionKey: 'adoptionApplications', sectionName: 'Adoption Applications', isExpanded: false },
            { sectionKey: 'fosterPlacements', sectionName: 'Foster Placements', isExpanded: false },
            { sectionKey: 'dogs', sectionName: 'Dogs', isExpanded: false },
            { sectionKey: 'medicalRecords', sectionName: 'Medical Records', isExpanded: false }
        ]);
    }
}

