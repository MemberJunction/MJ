import { Component } from '@angular/core';
import { AIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentconfiguration-form',
    templateUrl: './aiagentconfiguration.form.component.html'
})
export class AIAgentConfigurationFormComponent extends BaseFormComponent {
    public record!: AIAgentConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'presetDefinition', sectionName: 'Preset Definition', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

