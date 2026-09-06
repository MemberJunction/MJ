import { Component } from '@angular/core';
import { demoMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-demomember-form',
    templateUrl: './demomember.form.component.html'
})
export class demoMemberFormComponent extends BaseFormComponent {
    public record!: demoMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'memberProfile', sectionName: 'Member Profile', isExpanded: true },
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false }
        ]);
    }
}

