import { Component } from '@angular/core';
import { MJAIPromptRunMediasEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Run Medias') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipromptrunmedias-form',
    templateUrl: './mjaipromptrunmedias.form.component.html'
})
export class MJAIPromptRunMediasFormComponent extends BaseFormComponent {
    public record!: MJAIPromptRunMediasEntity;

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

