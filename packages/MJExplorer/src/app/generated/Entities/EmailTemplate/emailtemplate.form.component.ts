import { Component } from '@angular/core';
import { EmailTemplateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Templates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-emailtemplate-form',
    templateUrl: './emailtemplate.form.component.html'
})
export class EmailTemplateFormComponent extends BaseFormComponent {
    public record!: EmailTemplateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateIdentity', sectionName: 'Template Identity', isExpanded: true },
            { sectionKey: 'emailContent', sectionName: 'Email Content', isExpanded: true },
            { sectionKey: 'senderDetails', sectionName: 'Sender Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false }
        ]);
    }
}

export function LoadEmailTemplateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
