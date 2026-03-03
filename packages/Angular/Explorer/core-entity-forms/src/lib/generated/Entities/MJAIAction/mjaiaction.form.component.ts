import { Component } from '@angular/core';
import { MJAIActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiaction-form',
    templateUrl: './mjaiaction.form.component.html'
})
export class MJAIActionFormComponent extends BaseFormComponent {
    public record!: MJAIActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionDefinition', sectionName: 'Action Definition', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIModelActions', sectionName: 'AI Model Actions', isExpanded: false },
            { sectionKey: 'entityAIActions', sectionName: 'Entity AI Actions', isExpanded: false }
        ]);
    }
}

