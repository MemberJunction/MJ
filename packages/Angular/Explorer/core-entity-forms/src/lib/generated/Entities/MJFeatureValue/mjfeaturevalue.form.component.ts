import { Component } from '@angular/core';
import { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Feature Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfeaturevalue-form',
    templateUrl: './mjfeaturevalue.form.component.html'
})
export class MJFeatureValueFormComponent extends BaseFormComponent {
    public record!: MJFeatureValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineProvenance', sectionName: 'Pipeline Provenance', isExpanded: true },
            { sectionKey: 'recordContext', sectionName: 'Record Context', isExpanded: true },
            { sectionKey: 'featureDetails', sectionName: 'Feature Details', isExpanded: true },
            { sectionKey: 'featureValues', sectionName: 'Feature Values', isExpanded: true },
            { sectionKey: 'aIInsights', sectionName: 'AI Insights', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

