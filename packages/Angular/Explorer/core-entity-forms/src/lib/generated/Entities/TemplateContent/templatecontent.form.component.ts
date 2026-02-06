import { Component } from '@angular/core';
import { TemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Template Contents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-templatecontent-form',
    templateUrl: './templatecontent.form.component.html'
})
export class TemplateContentFormComponent extends BaseFormComponent {
    public record!: TemplateContentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateIdentification', sectionName: 'Template Identification', isExpanded: true },
            { sectionKey: 'contentDetails', sectionName: 'Content Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'templateParams', sectionName: 'Template Params', isExpanded: false }
        ]);
    }
}

export function LoadTemplateContentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
