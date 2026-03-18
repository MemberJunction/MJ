import { Component } from '@angular/core';
import { HubSpotCompanyCallEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanycall-form',
    templateUrl: './hubspotcompanycall.form.component.html'
})
export class HubSpotCompanyCallFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyCallEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'callAssociation', sectionName: 'Call Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

