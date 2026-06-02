import { Component } from '@angular/core';
import { hubspotprojectsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Projects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotprojects-form',
    templateUrl: './hubspotprojects.form.component.html'
})
export class hubspotprojectsFormComponent extends BaseFormComponent {
    public record!: hubspotprojectsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineAnalytics', sectionName: 'Pipeline Analytics', isExpanded: true },
            { sectionKey: 'timelineAndDuration', sectionName: 'Timeline and Duration', isExpanded: true },
            { sectionKey: 'activityTracking', sectionName: 'Activity Tracking', isExpanded: false },
            { sectionKey: 'projectOverview', sectionName: 'Project Overview', isExpanded: false },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: false },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: false },
            { sectionKey: 'pipelineManagement', sectionName: 'Pipeline Management', isExpanded: false },
            { sectionKey: 'onboardingAndGoals', sectionName: 'Onboarding and Goals', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

