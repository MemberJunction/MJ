import { Component } from '@angular/core';
import { ActivityTag__DemoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Activity Tags__Demo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytag__demo-form',
    templateUrl: './activitytag__demo.form.component.html'
})
export class ActivityTag__DemoFormComponent extends BaseFormComponent {
    public record!: ActivityTag__DemoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDetails', sectionName: 'Tag Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'activityTagLinks', sectionName: 'Activity Tag Links', isExpanded: false }
        ]);
    }
}

export function LoadActivityTag__DemoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
