import { Component } from '@angular/core';
import { MJTemplatesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplates-form',
    templateUrl: './mjtemplates.form.component.html'
})
export class MJTemplatesFormComponent extends BaseFormComponent {
    public record!: MJTemplatesEntity;

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

