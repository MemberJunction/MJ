import { Component } from '@angular/core';
import { MJAIPersonaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Personas') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipersona-form',
    templateUrl: './mjaipersona.form.component.html'
})
export class MJAIPersonaFormComponent extends BaseFormComponent {
    public record!: MJAIPersonaEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personaIdentity', sectionName: 'Persona Identity', isExpanded: true },
            { sectionKey: 'behavioralTraits', sectionName: 'Behavioral Traits', isExpanded: true },
            { sectionKey: 'mediaAssets', sectionName: 'Media Assets', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIPersonaVendors', sectionName: 'AI Persona Vendors', isExpanded: false },
            { sectionKey: 'mJAIAgentPersonas', sectionName: 'AI Agent Personas', isExpanded: false },
            { sectionKey: 'mJAIModelPersonas', sectionName: 'AI Model Personas', isExpanded: false }
        ]);
    }
}

