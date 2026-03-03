import { Component } from '@angular/core';
import { MJAIModelTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodeltype-form',
    templateUrl: './mjaimodeltype.form.component.html'
})
export class MJAIModelTypeFormComponent extends BaseFormComponent {
    public record!: MJAIModelTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelInformation', sectionName: 'Model Information', isExpanded: true },
            { sectionKey: 'defaultModality', sectionName: 'Default Modality', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIModels', sectionName: 'AI Models', isExpanded: false },
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false }
        ]);
    }
}

