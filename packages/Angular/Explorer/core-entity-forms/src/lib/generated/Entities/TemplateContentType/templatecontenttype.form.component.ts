import { Component } from '@angular/core';
import { TemplateContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Template Content Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-templatecontenttype-form',
    templateUrl: './templatecontenttype.form.component.html'
})
export class TemplateContentTypeFormComponent extends BaseFormComponent {
    public record!: TemplateContentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalMetadata', sectionName: 'Technical Metadata', isExpanded: false },
            { sectionKey: 'templateDefinition', sectionName: 'Template Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'templateContents', sectionName: 'Template Contents', isExpanded: false }
        ]);
    }
}

