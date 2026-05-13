import { Component } from '@angular/core';
import { bettyOrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Organizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-bettyorganization-form',
    templateUrl: './bettyorganization.form.component.html'
})
export class bettyOrganizationFormComponent extends BaseFormComponent {
    public record!: bettyOrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'instances', sectionName: 'Instances', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false },
            { sectionKey: 'promptComponents', sectionName: 'Prompt Components', isExpanded: false }
        ]);
    }
}

