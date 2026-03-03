import { Component } from '@angular/core';
import { PipelineStageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Pipeline Stages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-pipelinestage-form',
    templateUrl: './pipelinestage.form.component.html'
})
export class PipelineStageFormComponent extends BaseFormComponent {
    public record!: PipelineStageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

