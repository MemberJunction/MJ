import { Component } from '@angular/core';
import { MJTemplateContentTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Template Content Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplatecontenttypes-form',
    templateUrl: './mjtemplatecontenttypes.form.component.html'
})
export class MJTemplateContentTypesFormComponent extends BaseFormComponent {
    public record!: MJTemplateContentTypesEntity;

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

