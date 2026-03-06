import { Component } from '@angular/core';
import { MJTemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Template Contents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplatecontent-form',
    templateUrl: './mjtemplatecontent.form.component.html'
})
export class MJTemplateContentFormComponent extends BaseFormComponent {
    public record!: MJTemplateContentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateIdentification', sectionName: 'Template Identification', isExpanded: true },
            { sectionKey: 'contentDetails', sectionName: 'Content Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTemplateParams', sectionName: 'Template Params', isExpanded: false }
        ]);
    }
}

