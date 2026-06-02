import { Component } from '@angular/core';
import { hubspotticketsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottickets-form',
    templateUrl: './hubspottickets.form.component.html'
})
export class hubspotticketsFormComponent extends BaseFormComponent {
    public record!: hubspotticketsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentAndAccess', sectionName: 'Assignment and Access', isExpanded: true },
            { sectionKey: 'timelineAndSLAs', sectionName: 'Timeline and SLAs', isExpanded: true },
            { sectionKey: 'ticketDetails', sectionName: 'Ticket Details', isExpanded: false },
            { sectionKey: 'feedbackAndSatisfaction', sectionName: 'Feedback and Satisfaction', isExpanded: false },
            { sectionKey: 'associationsAndActivity', sectionName: 'Associations and Activity', isExpanded: false },
            { sectionKey: 'originAndRouting', sectionName: 'Origin and Routing', isExpanded: false },
            { sectionKey: 'pipelineStageTracking', sectionName: 'Pipeline Stage Tracking', isExpanded: false },
            { sectionKey: 'legacyAndMerging', sectionName: 'Legacy and Merging', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

