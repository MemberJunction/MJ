import { Component } from '@angular/core';
import { MJCommunicationComplianceRegimeJurisdictionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Compliance Regime Jurisdictions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationcomplianceregimejurisdiction-form',
    templateUrl: './mjcommunicationcomplianceregimejurisdiction.form.component.html'
})
export class MJCommunicationComplianceRegimeJurisdictionFormComponent extends BaseFormComponent {
    public record!: MJCommunicationComplianceRegimeJurisdictionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

