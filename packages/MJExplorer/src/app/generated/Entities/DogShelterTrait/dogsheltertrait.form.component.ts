import { Component } from '@angular/core';
import { DogShelterTraitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Traits') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogsheltertrait-form',
    templateUrl: './dogsheltertrait.form.component.html'
})
export class DogShelterTraitFormComponent extends BaseFormComponent {
    public record!: DogShelterTraitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'traitDetails', sectionName: 'Trait Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dogTraits', sectionName: 'Dog Traits', isExpanded: false }
        ]);
    }
}

