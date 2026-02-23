import { Component } from '@angular/core';
import { PipelineStagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Pipeline Stages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-pipelinestages-form',
    templateUrl: './pipelinestages.form.component.html'
})
export class PipelineStagesFormComponent extends BaseFormComponent {
    public record!: PipelineStagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

