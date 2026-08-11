import { Component } from '@angular/core';
import { DogShelterDogTraitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Dog Traits') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelterdogtrait-form',
    templateUrl: './dogshelterdogtrait.form.component.html'
})
export class DogShelterDogTraitFormComponent extends BaseFormComponent {
    public record!: DogShelterDogTraitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

