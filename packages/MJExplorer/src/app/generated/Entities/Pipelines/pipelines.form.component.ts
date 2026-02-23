import { Component } from '@angular/core';
import { PipelinesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Pipelines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-pipelines-form',
    templateUrl: './pipelines.form.component.html'
})
export class PipelinesFormComponent extends BaseFormComponent {
    public record!: PipelinesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'pipelineStages', sectionName: 'Pipeline Stages', isExpanded: false }
        ]);
    }
}

