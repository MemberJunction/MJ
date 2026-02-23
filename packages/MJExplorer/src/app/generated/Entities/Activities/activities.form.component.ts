import { Component } from '@angular/core';
import { ActivitiesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-activities-form',
    templateUrl: './activities.form.component.html'
})
export class ActivitiesFormComponent extends BaseFormComponent {
    public record!: ActivitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

