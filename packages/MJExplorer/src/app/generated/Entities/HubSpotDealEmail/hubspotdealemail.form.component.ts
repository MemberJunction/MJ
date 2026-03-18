import { Component } from '@angular/core';
import { HubSpotDealEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealemail-form',
    templateUrl: './hubspotdealemail.form.component.html'
})
export class HubSpotDealEmailFormComponent extends BaseFormComponent {
    public record!: HubSpotDealEmailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dealAssociation', sectionName: 'Deal Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

