import { Component } from '@angular/core';
import { MJAIAgentConfigurationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentconfigurations-form',
    templateUrl: './mjaiagentconfigurations.form.component.html'
})
export class MJAIAgentConfigurationsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentConfigurationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'presetDefinition', sectionName: 'Preset Definition', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

