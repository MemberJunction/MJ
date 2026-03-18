import { Component } from '@angular/core';
import { HubSpotContactDealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Deals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactdeal-form',
    templateUrl: './hubspotcontactdeal.form.component.html'
})
export class HubSpotContactDealFormComponent extends BaseFormComponent {
    public record!: HubSpotContactDealEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

