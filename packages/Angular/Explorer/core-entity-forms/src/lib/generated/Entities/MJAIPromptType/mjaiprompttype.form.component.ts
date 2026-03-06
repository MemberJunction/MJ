import { Component } from '@angular/core';
import { MJAIPromptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiprompttype-form',
    templateUrl: './mjaiprompttype.form.component.html'
})
export class MJAIPromptTypeFormComponent extends BaseFormComponent {
    public record!: MJAIPromptTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptTypeInformation', sectionName: 'Prompt Type Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIPrompts', sectionName: 'AI Prompts', isExpanded: false }
        ]);
    }
}

