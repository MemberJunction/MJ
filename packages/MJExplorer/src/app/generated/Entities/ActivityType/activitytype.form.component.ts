import { Component } from '@angular/core';
import { ActivityTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activity Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytype-form',
    templateUrl: './activitytype.form.component.html'
})
export class ActivityTypeFormComponent extends BaseFormComponent {
    public record!: ActivityTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadActivityTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
