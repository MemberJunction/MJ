import { Component } from '@angular/core';
import { HubSpotDealLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Line Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeallineitem-form',
    templateUrl: './hubspotdeallineitem.form.component.html'
})
export class HubSpotDealLineItemFormComponent extends BaseFormComponent {
    public record!: HubSpotDealLineItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

