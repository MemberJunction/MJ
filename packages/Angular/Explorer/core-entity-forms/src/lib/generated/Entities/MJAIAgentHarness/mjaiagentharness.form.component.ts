import { Component } from '@angular/core';
import { MJAIAgentHarnessEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Harnesses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentharness-form',
    templateUrl: './mjaiagentharness.form.component.html'
})
export class MJAIAgentHarnessFormComponent extends BaseFormComponent {
    public record!: MJAIAgentHarnessEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'harnessConfiguration', sectionName: 'Harness Configuration', isExpanded: true },
            { sectionKey: 'technicalImplementation', sectionName: 'Technical Implementation', isExpanded: true },
            { sectionKey: 'vendorIntegration', sectionName: 'Vendor Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

