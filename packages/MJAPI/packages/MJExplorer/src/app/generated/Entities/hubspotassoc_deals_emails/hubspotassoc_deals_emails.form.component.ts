import { Component } from '@angular/core';
import { hubspotassoc_deals_emailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Deals Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_deals_emails-form',
    templateUrl: './hubspotassoc_deals_emails.form.component.html'
})
export class hubspotassoc_deals_emailsFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_deals_emailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

