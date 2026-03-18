import { Component } from '@angular/core';
import { HubSpotCompanyDealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Deals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanydeal-form',
    templateUrl: './hubspotcompanydeal.form.component.html'
})
export class HubSpotCompanyDealFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyDealEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipDetails', sectionName: 'Relationship Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

