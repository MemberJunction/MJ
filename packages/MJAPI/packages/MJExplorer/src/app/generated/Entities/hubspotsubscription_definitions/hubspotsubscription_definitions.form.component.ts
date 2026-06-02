import { Component } from '@angular/core';
import { hubspotsubscription_definitionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Subscription Definitions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsubscription_definitions-form',
    templateUrl: './hubspotsubscription_definitions.form.component.html'
})
export class hubspotsubscription_definitionsFormComponent extends BaseFormComponent {
    public record!: hubspotsubscription_definitionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'compliance', sectionName: 'Compliance', isExpanded: true },
            { sectionKey: 'subscriptionOverview', sectionName: 'Subscription Overview', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

