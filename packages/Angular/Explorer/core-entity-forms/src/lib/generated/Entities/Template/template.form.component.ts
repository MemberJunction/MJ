import { Component } from '@angular/core';
import { TemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Templates') // Tell MemberJunction about this class
@Component({
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
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false }
        ]);
    }
}

export function LoadTemplateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
