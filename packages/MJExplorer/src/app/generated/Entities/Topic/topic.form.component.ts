import { Component } from '@angular/core';
import { TopicEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Topics') // Tell MemberJunction about this class
@Component({
    selector: 'gen-topic-form',
    templateUrl: './topic.form.component.html'
})
export class TopicFormComponent extends BaseFormComponent {
    public record!: TopicEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'topicDetails', sectionName: 'Topic Details', isExpanded: true },
            { sectionKey: 'topicHierarchy', sectionName: 'Topic Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'topics', sectionName: 'Topics', isExpanded: false },
            { sectionKey: 'activityTopics', sectionName: 'Activity Topics', isExpanded: false }
        ]);
    }
}

export function LoadTopicFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
