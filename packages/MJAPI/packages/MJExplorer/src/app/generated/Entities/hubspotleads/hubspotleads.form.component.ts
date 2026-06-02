import { Component } from '@angular/core';
import { hubspotleadsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Leads') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotleads-form',
    templateUrl: './hubspotleads.form.component.html'
})
export class hubspotleadsFormComponent extends BaseFormComponent {
    public record!: hubspotleadsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'leadInformation', sectionName: 'Lead Information', isExpanded: true },
            { sectionKey: 'pipelineAndStatus', sectionName: 'Pipeline and Status', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

