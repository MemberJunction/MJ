import { Component } from '@angular/core';
import { MJScopedPromptPartEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Scoped Prompt Parts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscopedpromptpart-form',
    templateUrl: './mjscopedpromptpart.form.component.html'
})
export class MJScopedPromptPartFormComponent extends BaseFormComponent {
    public record!: MJScopedPromptPartEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

