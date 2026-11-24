import { Component } from '@angular/core';
import { MJCommunicationComplianceRegimeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Compliance Regimes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationcomplianceregime-form',
    templateUrl: './mjcommunicationcomplianceregime.form.component.html'
})
export class MJCommunicationComplianceRegimeFormComponent extends BaseFormComponent {
    public record!: MJCommunicationComplianceRegimeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationComplianceRegimeJurisdictions', sectionName: 'Communication Compliance Regime Jurisdictions', isExpanded: false },
            { sectionKey: 'mJCommunicationComplianceRegimeRules', sectionName: 'Communication Compliance Regime Rules', isExpanded: false }
        ]);
    }
}

