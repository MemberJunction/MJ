import { Component } from '@angular/core';
import { AIPromptRunMediaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Run Medias') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aipromptrunmedia-form',
    templateUrl: './aipromptrunmedia.form.component.html'
})
export class AIPromptRunMediaFormComponent extends BaseFormComponent {
    public record!: AIPromptRunMediaEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'association', sectionName: 'Association', isExpanded: true },
            { sectionKey: 'mediaMetadata', sectionName: 'Media Metadata', isExpanded: false },
            { sectionKey: 'contentData', sectionName: 'Content Data', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'MJ: AI Agent Run Medias', isExpanded: false }
        ]);
    }
}

