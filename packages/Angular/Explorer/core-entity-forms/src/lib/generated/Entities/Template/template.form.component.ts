import { Component } from '@angular/core';
import { TemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-template-form',
    templateUrl: './template.form.component.html'
})
export class TemplateFormComponent extends BaseFormComponent {
    public record!: TemplateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateContent', sectionName: 'Template Content', isExpanded: true },
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'availabilityStatus', sectionName: 'Availability & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'templateContents', sectionName: 'Template Contents', isExpanded: false },
            { sectionKey: 'templateParams', sectionName: 'Template Params', isExpanded: false },
            { sectionKey: 'mJUserNotificationTypes', sectionName: 'MJ: User Notification Types', isExpanded: false },
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'mJUserNotificationTypes1', sectionName: 'MJ: User Notification Types', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false }
        ]);
    }
}

