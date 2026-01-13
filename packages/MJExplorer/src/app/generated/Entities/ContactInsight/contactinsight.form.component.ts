import { Component } from '@angular/core';
import { ContactInsightEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Insights') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactinsight-form',
    templateUrl: './contactinsight.form.component.html'
})
export class ContactInsightFormComponent extends BaseFormComponent {
    public record!: ContactInsightEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordDetails', sectionName: 'Record Details', isExpanded: true },
            { sectionKey: 'insightMetrics', sectionName: 'Insight Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContactInsightFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
