import { Component } from '@angular/core';
import { MJCommunicationComplianceRegimeRuleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Compliance Regime Rules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationcomplianceregimerule-form',
    templateUrl: './mjcommunicationcomplianceregimerule.form.component.html'
})
export class MJCommunicationComplianceRegimeRuleFormComponent extends BaseFormComponent {
    public record!: MJCommunicationComplianceRegimeRuleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

