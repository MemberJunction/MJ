import { Component } from '@angular/core';
import { MJAIPromptRunMediaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Run Medias') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipromptrunmedia-form',
    templateUrl: './mjaipromptrunmedia.form.component.html'
})
export class MJAIPromptRunMediaFormComponent extends BaseFormComponent {
    public record!: MJAIPromptRunMediaEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'association', sectionName: 'Association', isExpanded: true },
            { sectionKey: 'mediaMetadata', sectionName: 'Media Metadata', isExpanded: false },
            { sectionKey: 'contentData', sectionName: 'Content Data', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'AI Agent Run Medias', isExpanded: false }
        ]);
    }
}

