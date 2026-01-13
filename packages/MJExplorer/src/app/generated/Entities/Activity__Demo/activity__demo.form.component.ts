import { Component } from '@angular/core';
import { Activity__DemoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Activities__Demo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activity__demo-form',
    templateUrl: './activity__demo.form.component.html'
})
export class Activity__DemoFormComponent extends BaseFormComponent {
    public record!: Activity__DemoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'participantsType', sectionName: 'Participants & Type', isExpanded: true },
            { sectionKey: 'activityInformation', sectionName: 'Activity Information', isExpanded: true },
            { sectionKey: 'aIPriority', sectionName: 'AI & Priority', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'activitySentiments', sectionName: 'Activity Sentiments', isExpanded: false },
            { sectionKey: 'activityTagLinks', sectionName: 'Activity Tag Links', isExpanded: false },
            { sectionKey: 'activityTopics', sectionName: 'Activity Topics', isExpanded: false }
        ]);
    }
}

export function LoadActivity__DemoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
