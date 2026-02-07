import { Component } from '@angular/core';
import { AIActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiaction-form',
    templateUrl: './aiaction.form.component.html'
})
export class AIActionFormComponent extends BaseFormComponent {
    public record!: AIActionEntity;

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

export function LoadAIActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
