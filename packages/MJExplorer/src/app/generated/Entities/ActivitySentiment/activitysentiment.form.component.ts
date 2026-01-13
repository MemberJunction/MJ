import { Component } from '@angular/core';
import { ActivitySentimentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activity Sentiments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitysentiment-form',
    templateUrl: './activitysentiment.form.component.html'
})
export class ActivitySentimentFormComponent extends BaseFormComponent {
    public record!: ActivitySentimentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'analysisContext', sectionName: 'Analysis Context', isExpanded: true },
            { sectionKey: 'sentimentResults', sectionName: 'Sentiment Results', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActivitySentimentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
