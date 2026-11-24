import { Component } from '@angular/core';
import { MJCommunicationComplianceRuleTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Compliance Rule Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationcomplianceruletype-form',
    templateUrl: './mjcommunicationcomplianceruletype.form.component.html'
})
export class MJCommunicationComplianceRuleTypeFormComponent extends BaseFormComponent {
    public record!: MJCommunicationComplianceRuleTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationComplianceRegimeRules', sectionName: 'Communication Compliance Regime Rules', isExpanded: false }
        ]);
    }
}

