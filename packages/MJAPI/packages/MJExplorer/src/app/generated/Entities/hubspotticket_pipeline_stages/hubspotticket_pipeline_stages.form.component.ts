import { Component } from '@angular/core';
import { hubspotticket_pipeline_stagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Pipeline Stages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticket_pipeline_stages-form',
    templateUrl: './hubspotticket_pipeline_stages.form.component.html'
})
export class hubspotticket_pipeline_stagesFormComponent extends BaseFormComponent {
    public record!: hubspotticket_pipeline_stagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stageConfiguration', sectionName: 'Stage Configuration', isExpanded: true },
            { sectionKey: 'statusAndLifecycle', sectionName: 'Status and Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

