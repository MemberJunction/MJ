import { Component } from '@angular/core';
import { hubspotworkflowsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Workflows') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotworkflows-form',
    templateUrl: './hubspotworkflows.form.component.html'
})
export class hubspotworkflowsFormComponent extends BaseFormComponent {
    public record!: hubspotworkflowsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'auditInformation', sectionName: 'Audit Information', isExpanded: true },
            { sectionKey: 'workflowDefinition', sectionName: 'Workflow Definition', isExpanded: false },
            { sectionKey: 'workflowMetrics', sectionName: 'Workflow Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

