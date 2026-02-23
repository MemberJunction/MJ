import { Component } from '@angular/core';
import { MJAIAgentStepPathsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Step Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsteppaths-form',
    templateUrl: './mjaiagentsteppaths.form.component.html'
})
export class MJAIAgentStepPathsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentStepPathsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pathCoreDetails', sectionName: 'Path Core Details', isExpanded: true },
            { sectionKey: 'routingRules', sectionName: 'Routing Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

