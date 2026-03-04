import { Component } from '@angular/core';
import { InspectionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Inspections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-inspection-form',
    templateUrl: './inspection.form.component.html'
})
export class InspectionFormComponent extends BaseFormComponent {
    public record!: InspectionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

