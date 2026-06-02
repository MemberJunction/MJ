import { Component } from '@angular/core';
import { hubspotaccount_infoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Infos') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotaccount_info-form',
    templateUrl: './hubspotaccount_info.form.component.html'
})
export class hubspotaccount_infoFormComponent extends BaseFormComponent {
    public record!: hubspotaccount_infoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accountOverview', sectionName: 'Account Overview', isExpanded: true },
            { sectionKey: 'localizationAndHosting', sectionName: 'Localization and Hosting', isExpanded: true },
            { sectionKey: 'financialSettings', sectionName: 'Financial Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

