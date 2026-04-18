import { Component } from '@angular/core';
import { MJContentProcessRunPromptRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Process Run Prompt Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentprocessrunpromptrun-form',
    templateUrl: './mjcontentprocessrunpromptrun.form.component.html'
})
export class MJContentProcessRunPromptRunFormComponent extends BaseFormComponent {
    public record!: MJContentProcessRunPromptRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptExecutionLinks', sectionName: 'Prompt Execution Links', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

