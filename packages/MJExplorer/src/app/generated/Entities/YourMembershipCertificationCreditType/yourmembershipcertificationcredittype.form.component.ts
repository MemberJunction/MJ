import { Component } from '@angular/core';
import { YourMembershipCertificationCreditTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certification Credit Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcertificationcredittype-form',
    templateUrl: './yourmembershipcertificationcredittype.form.component.html'
})
export class YourMembershipCertificationCreditTypeFormComponent extends BaseFormComponent {
    public record!: YourMembershipCertificationCreditTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'creditTypeInformation', sectionName: 'Credit Type Information', isExpanded: true },
            { sectionKey: 'creditRules', sectionName: 'Credit Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventCEUAwards', sectionName: 'Event CEU Awards', isExpanded: false }
        ]);
    }
}

