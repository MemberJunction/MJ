import { Component } from '@angular/core';
import { AssociationDemoEmailTemplateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoemailtemplate-form',
    templateUrl: './associationdemoemailtemplate.form.component.html'
})
export class AssociationDemoEmailTemplateFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEmailTemplateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false }
        ]);
    }
}

