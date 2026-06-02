import { Component } from '@angular/core';
import { hubspotemail_campaigns_legacyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Campaigns Legacies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotemail_campaigns_legacy-form',
    templateUrl: './hubspotemail_campaigns_legacy.form.component.html'
})
export class hubspotemail_campaigns_legacyFormComponent extends BaseFormComponent {
    public record!: hubspotemail_campaigns_legacyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'campaignInformation', sectionName: 'Campaign Information', isExpanded: true },
            { sectionKey: 'campaignContent', sectionName: 'Campaign Content', isExpanded: true },
            { sectionKey: 'campaignMetrics', sectionName: 'Campaign Metrics', isExpanded: false },
            { sectionKey: 'integrationContext', sectionName: 'Integration Context', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

