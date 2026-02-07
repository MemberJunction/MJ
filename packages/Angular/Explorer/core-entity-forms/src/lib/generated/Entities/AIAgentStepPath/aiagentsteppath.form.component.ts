import { Component } from '@angular/core';
import { AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Step Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentsteppath-form',
    templateUrl: './aiagentsteppath.form.component.html'
})
export class AIAgentStepPathFormComponent extends BaseFormComponent {
    public record!: AIAgentStepPathEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pathCoreDetails', sectionName: 'Path Core Details', isExpanded: true },
            { sectionKey: 'routingRules', sectionName: 'Routing Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentStepPathFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
