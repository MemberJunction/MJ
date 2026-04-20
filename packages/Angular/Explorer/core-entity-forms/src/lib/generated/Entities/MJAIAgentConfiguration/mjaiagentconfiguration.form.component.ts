import { Component } from '@angular/core';
import { MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentconfiguration-form',
    templateUrl: './mjaiagentconfiguration.form.component.html'
})
export class MJAIAgentConfigurationFormComponent extends BaseFormComponent {
    public record!: MJAIAgentConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'presetDefinition', sectionName: 'Preset Definition', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

