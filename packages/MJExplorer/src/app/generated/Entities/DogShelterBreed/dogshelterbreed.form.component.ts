import { Component } from '@angular/core';
import { DogShelterBreedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Breeds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelterbreed-form',
    templateUrl: './dogshelterbreed.form.component.html'
})
export class DogShelterBreedFormComponent extends BaseFormComponent {
    public record!: DogShelterBreedEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'breedInformation', sectionName: 'Breed Information', isExpanded: true },
            { sectionKey: 'physicalCharacteristics', sectionName: 'Physical Characteristics', isExpanded: true },
            { sectionKey: 'careRequirements', sectionName: 'Care Requirements', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dogsSecondaryBreedID', sectionName: 'Dogs (Secondary Breed)', isExpanded: false },
            { sectionKey: 'dogsPrimaryBreedID', sectionName: 'Dogs (Primary Breed)', isExpanded: false }
        ]);
    }
}

