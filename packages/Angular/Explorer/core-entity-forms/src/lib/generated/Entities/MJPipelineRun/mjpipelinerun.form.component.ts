import { Component } from '@angular/core';
import { MJPipelineRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Pipeline Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpipelinerun-form',
    templateUrl: './mjpipelinerun.form.component.html'
})
export class MJPipelineRunFormComponent extends BaseFormComponent {
    public record!: MJPipelineRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJPipelineRunSteps', sectionName: 'Pipeline Run Steps', isExpanded: false }
        ]);
    }
}

