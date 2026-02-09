import { Component } from '@angular/core';
import { AIPromptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Prompt Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiprompttype-form',
    templateUrl: './aiprompttype.form.component.html'
})
export class AIPromptTypeFormComponent extends BaseFormComponent {
    public record!: AIPromptTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptTypeInformation', sectionName: 'Prompt Type Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false }
        ]);
    }
}

