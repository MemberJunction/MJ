import { Component } from '@angular/core';
import { hubspotdeal_pipelinesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Pipelines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeal_pipelines-form',
    templateUrl: './hubspotdeal_pipelines.form.component.html'
})
export class hubspotdeal_pipelinesFormComponent extends BaseFormComponent {
    public record!: hubspotdeal_pipelinesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineConfiguration', sectionName: 'Pipeline Configuration', isExpanded: true },
            { sectionKey: 'statusAndLifecycle', sectionName: 'Status and Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

