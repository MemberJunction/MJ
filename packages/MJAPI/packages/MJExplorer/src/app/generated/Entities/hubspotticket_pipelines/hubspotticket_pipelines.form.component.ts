import { Component } from '@angular/core';
import { hubspotticket_pipelinesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Pipelines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticket_pipelines-form',
    templateUrl: './hubspotticket_pipelines.form.component.html'
})
export class hubspotticket_pipelinesFormComponent extends BaseFormComponent {
    public record!: hubspotticket_pipelinesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineConfiguration', sectionName: 'Pipeline Configuration', isExpanded: true },
            { sectionKey: 'pipelineStatus', sectionName: 'Pipeline Status', isExpanded: true },
            { sectionKey: 'pipelineStructure', sectionName: 'Pipeline Structure', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

