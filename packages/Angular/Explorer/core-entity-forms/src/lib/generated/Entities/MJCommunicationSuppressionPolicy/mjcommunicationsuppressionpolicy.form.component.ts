import { Component } from '@angular/core';
import { MJCommunicationSuppressionPolicyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Suppression Policies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsuppressionpolicy-form',
    templateUrl: './mjcommunicationsuppressionpolicy.form.component.html'
})
export class MJCommunicationSuppressionPolicyFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSuppressionPolicyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationSuppressions', sectionName: 'Communication Suppressions', isExpanded: false }
        ]);
    }
}

