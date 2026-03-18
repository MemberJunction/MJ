import { Component } from '@angular/core';
import { HubSpotDealCallEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealcall-form',
    templateUrl: './hubspotdealcall.form.component.html'
})
export class HubSpotDealCallFormComponent extends BaseFormComponent {
    public record!: HubSpotDealCallEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

