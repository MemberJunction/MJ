import { Component } from '@angular/core';
import { ActivityType__DemoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Activity Types__Demo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytype__demo-form',
    templateUrl: './activitytype__demo.form.component.html'
})
export class ActivityType__DemoFormComponent extends BaseFormComponent {
    public record!: ActivityType__DemoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'activityTypeDetails', sectionName: 'Activity Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'activitiesDemo', sectionName: 'Activities__Demo', isExpanded: false }
        ]);
    }
}

export function LoadActivityType__DemoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
