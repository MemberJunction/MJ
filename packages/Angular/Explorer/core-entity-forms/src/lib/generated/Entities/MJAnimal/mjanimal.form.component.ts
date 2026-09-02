import { Component } from '@angular/core';
import { MJAnimalEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Animals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjanimal-form',
    templateUrl: './mjanimal.form.component.html'
})
export class MJAnimalFormComponent extends BaseFormComponent {
    public record!: MJAnimalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'animalProfile', sectionName: 'Animal Profile', isExpanded: true },
            { sectionKey: 'identificationAndStatus', sectionName: 'Identification and Status', isExpanded: true },
            { sectionKey: 'intakeDetails', sectionName: 'Intake Details', isExpanded: true },
            { sectionKey: 'healthAndDescription', sectionName: 'Health and Description', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

