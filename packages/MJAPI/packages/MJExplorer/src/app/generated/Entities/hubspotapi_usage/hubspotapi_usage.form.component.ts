import { Component } from '@angular/core';
import { hubspotapi_usageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Api Usages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotapi_usage-form',
    templateUrl: './hubspotapi_usage.form.component.html'
})
export class hubspotapi_usageFormComponent extends BaseFormComponent {
    public record!: hubspotapi_usageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationStatus', sectionName: 'Integration Status', isExpanded: true },
            { sectionKey: 'usageStatistics', sectionName: 'Usage Statistics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

