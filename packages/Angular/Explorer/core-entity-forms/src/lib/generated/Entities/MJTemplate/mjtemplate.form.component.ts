import { Component } from '@angular/core';
import { MJTemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplate-form',
    templateUrl: './mjtemplate.form.component.html'
})
export class MJTemplateFormComponent extends BaseFormComponent {
    public record!: MJTemplateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateContent', sectionName: 'Template Content', isExpanded: true },
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'availabilityStatus', sectionName: 'Availability & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTemplateContents', sectionName: 'Template Contents', isExpanded: false },
            { sectionKey: 'mJTemplateParams', sectionName: 'Template Params', isExpanded: false },
            { sectionKey: 'mJUserNotificationTypesSMSTemplateID', sectionName: 'User Notification Types (SMS Template)', isExpanded: false },
            { sectionKey: 'mJAIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'mJUserNotificationTypesEmailTemplateID', sectionName: 'User Notification Types (Email Template)', isExpanded: false },
            { sectionKey: 'mJEntityDocuments', sectionName: 'Entity Documents', isExpanded: false }
        ]);
    }
}

