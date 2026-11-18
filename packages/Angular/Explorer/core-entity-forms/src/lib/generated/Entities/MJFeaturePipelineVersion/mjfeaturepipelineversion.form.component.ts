import { Component } from '@angular/core';
import { MJFeaturePipelineVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Feature Pipeline Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfeaturepipelineversion-form',
    templateUrl: './mjfeaturepipelineversion.form.component.html'
})
export class MJFeaturePipelineVersionFormComponent extends BaseFormComponent {
    public record!: MJFeaturePipelineVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionConfiguration', sectionName: 'Version Configuration', isExpanded: true },
            { sectionKey: 'promptAndModel', sectionName: 'Prompt and Model', isExpanded: true },
            { sectionKey: 'statusAndGovernance', sectionName: 'Status and Governance', isExpanded: true },
            { sectionKey: 'evaluationAndResults', sectionName: 'Evaluation and Results', isExpanded: true },
            { sectionKey: 'timelineAndStewardship', sectionName: 'Timeline and Stewardship', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

