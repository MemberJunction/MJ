import { Component } from '@angular/core';
import { hubspotcallsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcalls-form',
    templateUrl: './hubspotcalls.form.component.html'
})
export class hubspotcallsFormComponent extends BaseFormComponent {
    public record!: hubspotcallsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'callInformation', sectionName: 'Call Information', isExpanded: true },
            { sectionKey: 'callMetrics', sectionName: 'Call Metrics', isExpanded: true },
            { sectionKey: 'contentAndMedia', sectionName: 'Content and Media', isExpanded: false },
            { sectionKey: 'voiceAgentInsights', sectionName: 'Voice Agent Insights', isExpanded: false },
            { sectionKey: 'communicationDetails', sectionName: 'Communication Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

