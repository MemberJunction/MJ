import { Component } from '@angular/core';
import { DogShelterFosterPlacementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Foster Placements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelterfosterplacement-form',
    templateUrl: './dogshelterfosterplacement.form.component.html'
})
export class DogShelterFosterPlacementFormComponent extends BaseFormComponent {
    public record!: DogShelterFosterPlacementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'placementDetails', sectionName: 'Placement Details', isExpanded: true },
            { sectionKey: 'placementTimeline', sectionName: 'Placement Timeline', isExpanded: true },
            { sectionKey: 'placementContext', sectionName: 'Placement Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

