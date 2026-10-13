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
            { sectionKey: 'pipelineConfiguration', sectionName: 'Pipeline Configuration', isExpanded: true },
            { sectionKey: 'lifecycleAndStatus', sectionName: 'Lifecycle and Status', isExpanded: true },
            { sectionKey: 'evaluationAndMetrics', sectionName: 'Evaluation and Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

