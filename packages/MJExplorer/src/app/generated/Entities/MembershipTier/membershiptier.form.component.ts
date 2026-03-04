import { Component } from '@angular/core';
import { MembershipTierEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Membership Tiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-membershiptier-form',
    templateUrl: './membershiptier.form.component.html'
})
export class MembershipTierFormComponent extends BaseFormComponent {
    public record!: MembershipTierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'members', sectionName: 'Members', isExpanded: false }
        ]);
    }
}

