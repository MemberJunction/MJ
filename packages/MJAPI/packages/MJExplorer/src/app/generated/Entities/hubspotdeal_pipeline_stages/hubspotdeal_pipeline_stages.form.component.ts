import { Component } from '@angular/core';
import { hubspotdeal_pipeline_stagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Pipeline Stages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeal_pipeline_stages-form',
    templateUrl: './hubspotdeal_pipeline_stages.form.component.html'
})
export class hubspotdeal_pipeline_stagesFormComponent extends BaseFormComponent {
    public record!: hubspotdeal_pipeline_stagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stageConfiguration', sectionName: 'Stage Configuration', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

