import { Component } from '@angular/core';
import { hubspotcompaniesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanies-form',
    templateUrl: './hubspotcompanies.form.component.html'
})
export class hubspotcompaniesFormComponent extends BaseFormComponent {
    public record!: hubspotcompaniesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'activityAndEngagement', sectionName: 'Activity and Engagement', isExpanded: true },
            { sectionKey: 'financialMetrics', sectionName: 'Financial Metrics', isExpanded: true },
            { sectionKey: 'salesAndPipeline', sectionName: 'Sales and Pipeline', isExpanded: false },
            { sectionKey: 'analytics', sectionName: 'Analytics', isExpanded: false },
            { sectionKey: 'firmographics', sectionName: 'Firmographics', isExpanded: false },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: false },
            { sectionKey: 'lifecyclePipeline', sectionName: 'Lifecycle Pipeline', isExpanded: false },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: false },
            { sectionKey: 'technicalInsights', sectionName: 'Technical Insights', isExpanded: false },
            { sectionKey: 'socialMedia', sectionName: 'Social Media', isExpanded: false },
            { sectionKey: 'location', sectionName: 'Location', isExpanded: false },
            { sectionKey: 'companyProfile', sectionName: 'Company Profile', isExpanded: false },
            { sectionKey: 'conversion', sectionName: 'Conversion', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

