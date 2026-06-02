import { Component } from '@angular/core';
import { hubspotservicesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Services') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotservices-form',
    templateUrl: './hubspotservices.form.component.html'
})
export class hubspotservicesFormComponent extends BaseFormComponent {
    public record!: hubspotservicesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'serviceOverview', sectionName: 'Service Overview', isExpanded: true },
            { sectionKey: 'timelineAndDuration', sectionName: 'Timeline and Duration', isExpanded: true },
            { sectionKey: 'pipelineAndProgress', sectionName: 'Pipeline and Progress', isExpanded: false },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: false },
            { sectionKey: 'financialInformation', sectionName: 'Financial Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

