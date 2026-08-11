import { Component } from '@angular/core';
import { DogShelterShelterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Shelters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogsheltershelter-form',
    templateUrl: './dogsheltershelter.form.component.html'
})
export class DogShelterShelterFormComponent extends BaseFormComponent {
    public record!: DogShelterShelterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'shelterInformation', sectionName: 'Shelter Information', isExpanded: true },
            { sectionKey: 'locationDetails', sectionName: 'Location Details', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dogs', sectionName: 'Dogs', isExpanded: false },
            { sectionKey: 'staffs', sectionName: 'Staffs', isExpanded: false }
        ]);
    }
}

