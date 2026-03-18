import { Component } from '@angular/core';
import { HubSpotCompanyEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanyemail-form',
    templateUrl: './hubspotcompanyemail.form.component.html'
})
export class HubSpotCompanyEmailFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyEmailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

