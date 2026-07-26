import { Component } from '@angular/core';
import { MJScopedPromptConfigEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Scoped Prompt Configs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscopedpromptconfig-form',
    templateUrl: './mjscopedpromptconfig.form.component.html'
})
export class MJScopedPromptConfigFormComponent extends BaseFormComponent {
    public record!: MJScopedPromptConfigEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptAssociation', sectionName: 'Prompt Association', isExpanded: true },
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'lifecycleAndPriority', sectionName: 'Lifecycle and Priority', isExpanded: true },
            { sectionKey: 'modelAndConfiguration', sectionName: 'Model and Configuration', isExpanded: true },
            { sectionKey: 'samplingParameters', sectionName: 'Sampling Parameters', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

