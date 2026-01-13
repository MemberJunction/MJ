import { Component } from '@angular/core';
import { ActivityTopicEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activity Topics') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytopic-form',
    templateUrl: './activitytopic.form.component.html'
})
export class ActivityTopicFormComponent extends BaseFormComponent {
    public record!: ActivityTopicEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiersAudit', sectionName: 'Identifiers & Audit', isExpanded: true },
            { sectionKey: 'topicMapping', sectionName: 'Topic Mapping', isExpanded: true },
            { sectionKey: 'scoringRanking', sectionName: 'Scoring & Ranking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActivityTopicFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
